// ─────────────────────────────────────────────────────────────────────────────
// SUGESTÃO DE VÍNCULO — quem deve ir em cada peça, aprendido do histórico
// (pedido do dono, 15/10: "colocar uma lógica na vinculação de patrocinadores
// e deixar automático; com base no histórico, via cota, ver padrões").
//
// Modo MISTO, decisão do dono: o que tem ~100% de acerto vincula sozinho; o
// resto chega como SUGESTÃO pré-marcada na tela de Vincular, com um clique
// para aplicar.
//
// AS DUAS REGRAS:
//
//   1. NOME NA DESCRIÇÃO — a descrição cita, como palavra inteira e sem
//      acento, o nome de UM patrocinador do evento: ele é o patrocinador certo
//      em 1.319 de 1.323 casos (99,7%). É a única regra que pode vincular
//      sozinha — e só quando nada mais na peça pede outro patrocinador (ver
//      `automatica` abaixo). Citou dois ou mais: vira sugestão de todos.
//   2. COTA, POR PEÇA (dono, 15/10: "as sugestões têm que ser pela peça de
//      cota, não grupo"; "pegar o NOME da peça e fazer a análise de cota por
//      peça") — para cada peça, os patrocinadores do evento cuja COTA vai
//      naquela peça. A chave é o NOME DA PEÇA (items.description) normalizado
//      por chaveDoNome: sem os patrocinadores do evento, sem numeração, sem
//      medida, sem "dir/esq" ("Lateral dir Pórtico Largada" e "Lateral esq
//      Pórtico Largada" → "lateral portico largada"). Sem histórico suficiente
//      do nome, cai no TIPO exato da peça — nunca no grupo/prefixo ("Pórtico"
//      não vale por "Pórtico Larg/Cheg"). Cota × chave com taxa de vínculo
//      ≥ 0,8 em ≥ 3 eventos. As regras MANUAIS de "Configurar cotas"
//      (event_quota_rules e as globais com tipos preenchidos) entram aqui
//      também, com o casamento de sempre daquela tela.
//
// A antiga regra "estrutura" (a peça levar o elenco inteiro do evento) SAIU
// por decisão do dono: quem decide quem vai numa peça é a cota de cada um.
//
// O motor é PURO (sem banco): o servidor carrega o histórico e o elenco do
// evento e chama daqui; o backtest (fora do repositório) também.
// ─────────────────────────────────────────────────────────────────────────────

export type RegraDaSugestao = "nome-na-descricao" | "cota";

export interface Sugestao {
  sponsorId: string;
  regra: RegraDaSugestao;
  /** 0–1: a taxa de acerto que a regra teve no histórico. */
  confianca: number;
  /** Frase curta para a tela (vai no title do chip), já com patrocinador e cota. */
  motivo: string;
  /** Vincula sozinho, sem ninguém clicar. Só a regra 1 com UM nome casado e nada mais pedindo outro. */
  automatica: boolean;
  /** A cota que levou a sugestão (regra "cota") — a faixa da tela agrupa por ela. */
  cota?: string | null;
  /** A cota veio do histórico do patrocinador, não do evento. */
  cotaDoHistorico?: boolean;
  /** De onde veio o padrão da cota: o NOME da peça, ou (sem histórico do nome) o TIPO. */
  base?: "nome" | "tipo" | "regra-manual";
}

/** Um patrocinador do elenco do evento. `cota` é a do vínculo evento↔patrocinador. */
export interface PatrocinadorDoEvento {
  id: string;
  nome: string;
  cota?: string | null;
  /**
   * A cota não está no evento: veio do histórico do patrocinador (a mais
   * recente dele em outros eventos). A regra de cota vale, com confiança
   * menor e dito no motivo.
   */
  cotaDoHistorico?: boolean;
}

/** Regra manual de cota (Configurar cotas): esta cota leva estes tipos. */
export interface RegraManualDeCota {
  cota: string;
  tipos: string[];
  origem: "evento" | "geral";
}

export interface PadraoDeCota {
  /** Eventos em que a cota existia e havia peça do tipo. */
  eventos: number;
  /** Desses, em quantos a cota foi na maioria das peças do tipo. */
  comVinculo: number;
  /** Média, por evento, da fração das peças do tipo que levaram a cota. */
  taxa: number;
  /** Como o tipo aparece escrito nas peças (para a frase). */
  rotulo: string;
  /** Passou nos limiares. */
  padrao: boolean;
}

/**
 * O que o histórico ensinou, só com dado suficiente (≥ 3 eventos): cota × NOME
 * da peça (o principal) e cota × TIPO exato (quando o nome não tem histórico).
 */
export interface PadroesDeVinculo {
  /** Chave `${COTA}|${chaveDoNome}`. */
  cotaPorNome: Record<string, PadraoDeCota>;
  /** Chave `${COTA}|${chaveDoTipo}`. */
  cotaPorTipo: Record<string, PadraoDeCota>;
}

export const PADROES_VAZIOS: PadroesDeVinculo = { cotaPorNome: {}, cotaPorTipo: {} };

export const LIMIARES_DE_VINCULO = {
  /** Nome com menos letras não casa (sem acento e sem espaço). */
  nomeMinimo: 3,
  cotaMinEventos: 3,
  cotaTaxa: 0.8,
  /** Num evento, a cota "foi" no tipo quando levou pelo menos esta fração das peças. */
  cotaFoiNoEvento: 0.5,
} as const;

export type LimiaresDeVinculo = { -readonly [K in keyof typeof LIMIARES_DE_VINCULO]: number };

/** Confiança fixa das regras que não saem de taxa aprendida. */
export const CONFIANCA = {
  nomeUnico: 0.99,
  nomeAmbiguo: 0.5,
  regraManual: 0.9,
  /** Fator quando a cota veio do histórico, e não do evento. */
  cotaDoHistorico: 0.9,
} as const;

// ── Normalização ────────────────────────────────────────────────────────────

/** Sem acento, minúsculo, só letras e números separados por um espaço. */
export function normalizarTexto(s: string | null | undefined): string {
  return String(s ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const PALAVRAS_VAZIAS = new Set(["de", "da", "do", "das", "dos", "e", "com", "para", "p", "a", "o", "em", "no", "na"]);

/** Plural simples: "quadros" → "quadro", "testeiras" → "testeira" (palavras com mais de 3 letras). */
const singular = (p: string) => (p.length > 3 && p.endsWith("s") && !p.endsWith("ss") ? p.slice(0, -1) : p);

/**
 * A CHAVE DO TIPO — 254 grafias de `items.type` viram uma por tipo:
 * "Quadros 4x3" e "quadro 4x3" → "quadro 4x3"; "Faixa de Chegada" →
 * "faixa chegada"; "Pórtico (larg/cheg)" → "portico larg cheg".
 */
export function chaveDoTipo(tipo: string | null | undefined): string {
  return normalizarTexto(tipo).split(" ").filter((p) => p && !PALAVRAS_VAZIAS.has(p)).map(singular).join(" ");
}

/** Lados e posições que não mudam a peça: "Lateral dir" e "Lateral esq" são a mesma lateral. */
const LADOS = new Set(["dir", "esq", "direita", "esquerda", "direito", "esquerdo", "lado"]);
const DIMENSAO = /^\d+(?:[.,]\d+)?x\d+(?:[.,]\d+)?$/;
const MEDIDA = /^\d+(?:[.,]\d+)?(?:m|cm|mm|mt|mts|metro|metros)$/;

/**
 * A CHAVE DO NOME DA PEÇA (dono, 15/10: "pegar o NOME da peça e fazer a
 * análise de cota por peça"). O nome (items.description) sem o que muda de
 * evento para evento sem mudar a peça:
 *
 *   · os patrocinadores do evento ("2x1 BB Seguros" → "2x1", "Testeira BB
 *     Seguros" → "testeira");
 *   · números soltos e a numeração colada ("Quadro fotos 1".."6" → "quadro
 *     foto"; "Aplique1"/"Aplique2" → "aplique");
 *   · medidas ("9x6", "4,0 x 3,0", "3m") — mas a dimensão que é o PRÓPRIO
 *     nome fica: "2x1" sozinho continua "2x1";
 *   · "dir/esq", "lado A/B", letras soltas, artigos e preposições; plural vira
 *     singular, como na chave do tipo.
 *
 * Devolve também o nome LEGÍVEL (as palavras originais que ficaram, com acento
 * e caixa) — é ele que a tela mostra no motivo. Nome vazio → chave "".
 */
export function lerNomeDaPeca(
  descricao: string | null | undefined,
  nomesDosPatrocinadores: readonly string[] = [],
): { chave: string; legivel: string } {
  const originais = String(descricao ?? "").split(/[^A-Za-z0-9\u00C0-\u024F]+/).filter(Boolean);
  const tokens = originais.map((o) => ({ orig: o, norm: normalizarTexto(o) })).filter((t) => t.norm);
  const fora = new Array<boolean>(tokens.length).fill(false);
  // Patrocinadores do evento, inclusive nome de várias palavras e nome curto.
  for (const nome of nomesDosPatrocinadores) {
    const partes = normalizarTexto(nome).split(" ").filter(Boolean);
    if (partes.length === 0) continue;
    for (let i = 0; i + partes.length <= tokens.length; i++) {
      if (partes.every((pt, k) => tokens[i + k].norm === pt)) for (let k = 0; k < partes.length; k++) fora[i + k] = true;
    }
  }
  const ficam: Array<{ orig: string; norm: string; vazia: boolean }> = [];
  const dimensoes: Array<{ orig: string; norm: string }> = [];
  tokens.forEach((t, i) => {
    if (fora[i]) return;
    let { orig, norm } = t;
    if (/^\d+$/.test(norm) || MEDIDA.test(norm) || /^\d+[a-z]{1,2}$/.test(norm)) return; // número, medida, ordinal
    if (DIMENSAO.test(norm)) { dimensoes.push({ orig, norm }); return; }
    const colado = /^([a-z]{2,})\d+$/.exec(norm); // "aplique1" → "aplique"
    if (colado) { norm = colado[1]; orig = orig.replace(/\d+$/, ""); }
    if (norm.length === 1 || LADOS.has(norm)) return;
    ficam.push({ orig, norm, vazia: PALAVRAS_VAZIAS.has(norm) });
  });
  const cheias = ficam.filter((t) => !t.vazia);
  if (cheias.length === 0) {
    // Só sobrou a dimensão: ela É o nome da peça ("2x1").
    return dimensoes.length > 0 ? { chave: dimensoes[0].norm, legivel: dimensoes[0].orig } : { chave: "", legivel: "" };
  }
  // O legível guarda as preposições do MEIO ("Quadro de Fotos"), não as das pontas.
  let ini = 0, fim = ficam.length - 1;
  while (ficam[ini].vazia) ini++;
  while (ficam[fim].vazia) fim--;
  return {
    chave: cheias.map((t) => singular(t.norm)).join(" "),
    legivel: ficam.slice(ini, fim + 1).map((t) => t.orig).join(" "),
  };
}

/** Só a chave de lerNomeDaPeca. */
export const chaveDoNome = (descricao: string | null | undefined, nomesDosPatrocinadores: readonly string[] = []): string =>
  lerNomeDaPeca(descricao, nomesDosPatrocinadores).chave;

/**
 * O tipo da REGRA MANUAL casa com o tipo da PEÇA pelo prefixo — o mesmo
 * critério do `matchesGroup` de "Configurar cotas" e da vinculação por cota:
 * "Palco" casa "Palco Lateral". (O APRENDIDO não usa isto: é tipo exato.)
 */
export function tipoCasa(chaveDaPeca: string, chaveDaRegra: string): boolean {
  if (!chaveDaRegra) return false;
  return chaveDaPeca === chaveDaRegra || chaveDaPeca.startsWith(chaveDaRegra + " ");
}

/** "MINISTÉRIO", "ministerio " → "MINISTERIO". Vazio → null. */
export function normalizarCota(c: string | null | undefined): string | null {
  const n = normalizarTexto(c).replace(/ /g, "").toUpperCase();
  return n || null;
}

/**
 * O nome do patrocinador aparece na descrição como PALAVRA INTEIRA (sem acento,
 * sem caixa): "Itaú" casa "Rolo Itaú 2x1" e não casa "Itaúna". Nome com menos
 * de 3 letras nunca casa ("BB", "3M").
 */
export function nomeNaDescricao(descricao: string | null | undefined, nome: string | null | undefined, minimo: number = LIMIARES_DE_VINCULO.nomeMinimo): boolean {
  const n = normalizarTexto(nome);
  if (n.replace(/ /g, "").length < minimo) return false;
  const d = normalizarTexto(descricao);
  if (!d) return false;
  return ` ${d} `.includes(` ${n} `);
}

const pct = (n: number) => Math.round(n * 1000) / 1000;

// ── O motor ─────────────────────────────────────────────────────────────────

const PRIORIDADE: Record<RegraDaSugestao, number> = { "nome-na-descricao": 2, cota: 1 };

/**
 * As sugestões para UMA peça. Uma por patrocinador (a regra mais forte vence),
 * da mais confiável para a menos.
 *
 * A peça que não leva patrocinador (molde, produção interna, "sem
 * patrocinador") não chega aqui: quem chama filtra antes.
 */
export function sugerirVinculos(
  peca: { tipo: string | null | undefined; descricao: string | null | undefined },
  patrocinadores: PatrocinadorDoEvento[],
  padroes: PadroesDeVinculo = PADROES_VAZIOS,
  regrasManuais: RegraManualDeCota[] = [],
): Sugestao[] {
  if (patrocinadores.length === 0) return [];
  const chave = chaveDoTipo(peca.tipo);
  const chaveNome = chaveDoNome(peca.descricao, patrocinadores.map((p) => p.nome));
  const porPatrocinador = new Map<string, Sugestao>();
  const propor = (s: Omit<Sugestao, "automatica">) => {
    const atual = porPatrocinador.get(s.sponsorId);
    if (!atual || s.confianca > atual.confianca
      || (s.confianca === atual.confianca && PRIORIDADE[s.regra] > PRIORIDADE[atual.regra])) {
      porPatrocinador.set(s.sponsorId, { ...s, automatica: false });
    }
  };

  // 1. Nome na descrição.
  const casados = patrocinadores.filter((p) => nomeNaDescricao(peca.descricao, p.nome));
  if (casados.length === 1) {
    propor({ sponsorId: casados[0].id, regra: "nome-na-descricao", confianca: CONFIANCA.nomeUnico, motivo: "O nome está na descrição" });
  } else if (casados.length > 1) {
    for (const p of casados) {
      const outros = casados.filter((o) => o.id !== p.id).map((o) => o.nome);
      propor({
        sponsorId: p.id, regra: "nome-na-descricao", confianca: CONFIANCA.nomeAmbiguo,
        motivo: `O nome está na descrição, junto com ${outros.join(", ")}`,
      });
    }
  }

  // 2. Cota, POR PEÇA: a cota de cada patrocinador vai NESTA peça? Primeiro
  // pelo NOME da peça; sem histórico do nome para aquela cota, pelo TIPO exato.
  if (chave || chaveNome) {
    for (const p of patrocinadores) {
      const cota = normalizarCota(p.cota);
      if (!cota) continue;
      const fator = p.cotaDoHistorico ? CONFIANCA.cotaDoHistorico : 1;
      // "Itaú · MASTER" — e quando a cota não está no evento, de onde veio.
      const quem = `${p.nome} · ${cota}${p.cotaDoHistorico ? " (cota pelo histórico dele; não está no evento)" : ""}`;
      const extra = { cota, cotaDoHistorico: !!p.cotaDoHistorico };
      for (const r of regrasManuais) {
        if (!chave) break;
        if (normalizarCota(r.cota) !== cota) continue;
        const tipo = r.tipos.find((t) => tipoCasa(chave, chaveDoTipo(t)));
        if (!tipo) continue;
        propor({
          sponsorId: p.id, regra: "cota", confianca: pct(CONFIANCA.regraManual * fator), ...extra, base: "regra-manual",
          motivo: `${quem} — Configurar cotas${r.origem === "evento" ? " do evento" : ""}: ${cota} vai em ${tipo}`,
        });
        break;
      }
      // O NOME decide quando tem dado (passando ou não no limiar); sem dado
      // do nome para esta cota, decide o TIPO exato. Nunca o grupo.
      const peloNome = chaveNome ? padroes.cotaPorNome[`${cota}|${chaveNome}`] : undefined;
      const peloTipo = !peloNome && chave ? padroes.cotaPorTipo[`${cota}|${chave}`] : undefined;
      const aprendido = peloNome ?? peloTipo;
      if (aprendido?.padrao) {
        propor({
          sponsorId: p.id, regra: "cota", confianca: pct(aprendido.taxa * fator), ...extra, base: peloNome ? "nome" : "tipo",
          motivo: `${quem} — ${cota} vai em ${aprendido.rotulo} (${aprendido.comVinculo} de ${aprendido.eventos} eventos)${peloNome ? "" : ", pelo tipo da peça"}`,
        });
      }
    }
  }

  // AUTOMÁTICA: um nome só e nenhuma cota pedindo outro patrocinador.
  // Vincular sozinho um patrocinador numa peça que leva vários a deixaria
  // "pronta" pela metade — e o "Enviar prontas" a mandaria assim para a Arte.
  if (casados.length === 1 && porPatrocinador.size === 1) {
    const s = porPatrocinador.get(casados[0].id);
    if (s && s.regra === "nome-na-descricao") s.automatica = true;
  }

  const nomeDe = new Map(patrocinadores.map((p) => [p.id, p.nome]));
  return Array.from(porPatrocinador.values()).sort((a, b) =>
    b.confianca - a.confianca || (nomeDe.get(a.sponsorId) ?? "").localeCompare(nomeDe.get(b.sponsorId) ?? "", "pt-BR"));
}

// ── O aprendizado ───────────────────────────────────────────────────────────

/** Uma peça JÁ VINCULADA do histórico (o servidor filtra: fora de rascunho, cancelada, lixeira, molde…). */
export interface PecaDoHistorico {
  eventId: string;
  tipo: string;
  /** O nome da peça (items.description) — a chave principal da cota por peça. */
  descricao?: string | null;
  patrocinadores: string[];
}

/** Um vínculo evento↔patrocinador do histórico, com a cota (quando preenchida). */
export interface ElencoDoHistorico {
  eventId: string;
  sponsorId: string;
  cota: string | null;
  /** Nome do patrocinador — sai do nome da peça antes de virar chave. */
  nome?: string | null;
}

function maisFrequente(contagem: Map<string, number> | undefined, padrao: string): string {
  if (!contagem || contagem.size === 0) return padrao;
  let melhor = padrao, n = -1;
  contagem.forEach((v, k) => { if (v > n) { melhor = k; n = v; } });
  return melhor;
}

/**
 * Aprende COTA × PEÇA, em duas tabelas com a mesma conta: pelo NOME da peça
 * (chaveDoNome, sem os patrocinadores do evento) e pelo TIPO exato. Para cada
 * evento, cada cota preenchida NO EVENTO e cada chave presente, a fração das
 * peças daquela chave que levaram patrocinador daquela cota. Entra com ≥ 3
 * eventos; é padrão com média ≥ 0,8. Sem prefixo, sem grupo.
 */
export function aprenderPadroes(
  pecas: PecaDoHistorico[],
  elencos: ElencoDoHistorico[],
  limiares: Partial<LimiaresDeVinculo> = {},
): PadroesDeVinculo {
  const L = { ...LIMIARES_DE_VINCULO, ...limiares };
  const quemTemCota = new Map<string, Map<string, string[]>>(); // evento → COTA → patrocinadores
  for (const e of elencos) {
    const c = normalizarCota(e.cota);
    if (!c) continue;
    if (!quemTemCota.has(e.eventId)) quemTemCota.set(e.eventId, new Map());
    const m = quemTemCota.get(e.eventId)!;
    if (!m.has(c)) m.set(c, []);
    m.get(c)!.push(e.sponsorId);
  }

  const nomesDoEvento = new Map<string, string[]>();
  for (const e of elencos) {
    if (!e.nome) continue;
    if (!nomesDoEvento.has(e.eventId)) nomesDoEvento.set(e.eventId, []);
    nomesDoEvento.get(e.eventId)!.push(e.nome);
  }

  /** Uma tabela (por nome ou por tipo): chave de cada peça → rótulo legível. */
  const tabela = (chaveDe: (p: PecaDoHistorico) => { chave: string; legivel: string }): Record<string, PadraoDeCota> => {
    const rotulos = new Map<string, Map<string, number>>();
    const porEvento = new Map<string, Map<string, Array<Set<string>>>>();
    for (const p of pecas) {
      if (p.patrocinadores.length === 0) continue;
      const { chave, legivel } = chaveDe(p);
      if (!chave) continue;
      if (!rotulos.has(chave)) rotulos.set(chave, new Map());
      const r = rotulos.get(chave)!;
      r.set(legivel, (r.get(legivel) ?? 0) + 1);
      if (!porEvento.has(p.eventId)) porEvento.set(p.eventId, new Map());
      const m = porEvento.get(p.eventId)!;
      if (!m.has(chave)) m.set(chave, []);
      m.get(chave)!.push(new Set(p.patrocinadores));
    }
    const porCota = new Map<string, { taxas: number[]; foi: number }>();
    porEvento.forEach((chaves, eventId) => {
      const cotas = quemTemCota.get(eventId);
      if (!cotas) return;
      cotas.forEach((donos, cota) => {
        chaves.forEach((conjuntos, chave) => {
          let com = 0, total = 0;
          for (const s of donos) for (const c of conjuntos) { total++; if (c.has(s)) com++; }
          if (total === 0) return;
          const taxa = com / total;
          const k = `${cota}|${chave}`;
          const a = porCota.get(k) ?? { taxas: [], foi: 0 };
          a.taxas.push(taxa);
          if (taxa >= L.cotaFoiNoEvento) a.foi++;
          porCota.set(k, a);
        });
      });
    });
    const saida: Record<string, PadraoDeCota> = {};
    porCota.forEach((a, k) => {
      if (a.taxas.length < L.cotaMinEventos) return;
      const taxa = a.taxas.reduce((x, y) => x + y, 0) / a.taxas.length;
      const chave = k.slice(k.indexOf("|") + 1);
      saida[k] = {
        eventos: a.taxas.length, comVinculo: a.foi, taxa: pct(taxa),
        rotulo: maisFrequente(rotulos.get(chave), chave), padrao: taxa >= L.cotaTaxa,
      };
    });
    return saida;
  };

  return {
    cotaPorNome: tabela((p) => lerNomeDaPeca(p.descricao, nomesDoEvento.get(p.eventId) ?? [])),
    cotaPorTipo: tabela((p) => ({ chave: chaveDoTipo(p.tipo), legivel: String(p.tipo).trim() })),
  };
}

// ── Cota sugerida ───────────────────────────────────────────────────────────

/** Um vínculo evento↔patrocinador COM cota, e quando (a data do evento). */
export interface CotaNoTempo {
  sponsorId: string;
  eventId: string;
  cota: string | null;
  /** Data do evento (ms); a mais recente decide. */
  quando: number;
}

export interface CotaSugerida {
  cota: string;
  /** Quantos eventos seguidos, do mais recente para trás, com esta mesma cota. */
  seguidos: number;
  /** Eventos com cota preenchida para este patrocinador. */
  eventos: number;
}

/**
 * A cota mais recente de cada patrocinador em outros eventos — a que se
 * pré-preenche ao colocá-lo num evento novo. Só 2 dos 73 patrocinadores com
 * cota a mudaram entre eventos: a mais recente é, na prática, a cota dele.
 */
export function sugerirCotas(vinculos: CotaNoTempo[], excetoEvento?: string | null): Record<string, CotaSugerida> {
  const porPatrocinador = new Map<string, Array<{ cota: string; quando: number }>>();
  for (const v of vinculos) {
    if (excetoEvento && v.eventId === excetoEvento) continue;
    const cota = normalizarCota(v.cota);
    if (!cota) continue;
    if (!porPatrocinador.has(v.sponsorId)) porPatrocinador.set(v.sponsorId, []);
    porPatrocinador.get(v.sponsorId)!.push({ cota, quando: Number(v.quando) || 0 });
  }
  const saida: Record<string, CotaSugerida> = {};
  porPatrocinador.forEach((lista, sponsorId) => {
    lista.sort((a, b) => b.quando - a.quando);
    const cota = lista[0].cota;
    let seguidos = 0;
    while (seguidos < lista.length && lista[seguidos].cota === cota) seguidos++;
    saida[sponsorId] = { cota, seguidos, eventos: lista.length };
  });
  return saida;
}

/** "Sugerida: MASTER (últimos 3 eventos)" / "(último evento)". */
export function textoDaCotaSugerida(c: CotaSugerida, rotulo?: string): string {
  const quando = c.seguidos <= 1 ? "último evento" : `últimos ${c.seguidos} eventos`;
  return `Sugerida: ${rotulo ?? c.cota} (${quando})`;
}
