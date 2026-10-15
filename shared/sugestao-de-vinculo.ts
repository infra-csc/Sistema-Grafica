// ─────────────────────────────────────────────────────────────────────────────
// SUGESTÃO DE VÍNCULO — quem deve ir em cada peça, aprendido do histórico
// (pedido do dono, 15/10: "colocar uma lógica na vinculação de patrocinadores
// e deixar automático; com base no histórico, via cota, ver padrões").
//
// Modo MISTO, decisão do dono: o que tem ~100% de acerto vincula sozinho; o
// resto chega como SUGESTÃO pré-marcada na tela de Vincular, com um clique
// para aplicar.
//
// AS TRÊS REGRAS, e o que a análise do banco (6.925 peças vinculadas) mostrou
// para cada uma:
//
//   1. NOME NA DESCRIÇÃO — a descrição cita, como palavra inteira e sem
//      acento, o nome de UM patrocinador do evento: ele é o patrocinador certo
//      em 1.319 de 1.323 casos (99,7%). É a única regra que pode vincular
//      sozinha — e só quando nada mais na peça pede outro patrocinador (ver
//      `automatica` abaixo). Citou dois ou mais: vira sugestão de todos.
//   2. ESTRUTURA — pórtico, palco, arena, faixa de chegada… levam quase todos
//      os patrocinadores do evento (média 5,2 de 5,6). Aprendido: o tipo com
//      ≥ 10 peças cuja cobertura média (patrocinadores da peça ÷ do evento) é
//      ≥ 0,8.
//   3. COTA — MASTER vai em display, placa km, ícone fone; MINISTÉRIO em
//      quadro de fotos… Aprendido: cota × tipo com taxa de vínculo ≥ 0,8 em
//      ≥ 3 eventos. As regras MANUAIS de cota (event_quota_rules e as globais
//      com tipos preenchidos) entram aqui também.
//
// O motor é PURO (sem banco): o servidor carrega o histórico e o elenco do
// evento e chama daqui; o backtest (fora do repositório) também.
// ─────────────────────────────────────────────────────────────────────────────

export type RegraDaSugestao = "nome-na-descricao" | "estrutura" | "cota";

export interface Sugestao {
  sponsorId: string;
  regra: RegraDaSugestao;
  /** 0–1: a taxa de acerto que a regra teve no histórico. */
  confianca: number;
  /** Frase curta para a tela (vai no title do chip). */
  motivo: string;
  /** Vincula sozinho, sem ninguém clicar. Só a regra 1 com UM nome casado e nada mais pedindo outro. */
  automatica: boolean;
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

export interface PadraoDeEstrutura {
  /** Peças vinculadas deste tipo no histórico (em eventos com elenco suficiente). */
  pecas: number;
  /** Média de (patrocinadores da peça ÷ patrocinadores do evento). */
  cobertura: number;
  /** Como o tipo aparece escrito nas peças (para a frase). */
  rotulo: string;
  /** Passou nos limiares: é peça de estrutura. */
  padrao: boolean;
}

export interface PadraoDeCota {
  /** Eventos em que a cota existia e havia peça do tipo. */
  eventos: number;
  /** Desses, em quantos a cota foi na maioria das peças do tipo. */
  comVinculo: number;
  /** Média, por evento, da fração das peças do tipo que levaram a cota. */
  taxa: number;
  rotulo: string;
  padrao: boolean;
}

/**
 * O que o histórico ensinou. Só entram chaves com dado SUFICIENTE (as que
 * passaram e as que não passaram nos limiares): é a mais específica delas que
 * decide — ver `decisivo`.
 */
export interface PadroesDeVinculo {
  estrutura: Record<string, PadraoDeEstrutura>;
  /** Chave `${COTA}|${chaveDoTipo}`. */
  cotaPorTipo: Record<string, PadraoDeCota>;
}

export const PADROES_VAZIOS: PadroesDeVinculo = { estrutura: {}, cotaPorTipo: {} };

export const LIMIARES_DE_VINCULO = {
  /** Nome com menos letras não casa (sem acento e sem espaço). */
  nomeMinimo: 3,
  estruturaMinPecas: 10,
  estruturaCobertura: 0.8,
  /** Evento com menos patrocinadores não ensina estrutura: com 1 ou 2, toda peça "leva todos". */
  estruturaMinPatrocinadoresNoEvento: 3,
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

/** Os prefixos por palavra, do mais longo ao mais curto: "portico chegada" → ["portico chegada", "portico"]. */
export function prefixosDaChave(chave: string): string[] {
  const p = chave.split(" ").filter(Boolean);
  const saida: string[] = [];
  for (let n = p.length; n >= 1; n--) saida.push(p.slice(0, n).join(" "));
  return saida;
}

/**
 * O tipo da REGRA casa com o tipo da PEÇA pelo prefixo — o mesmo critério do
 * `matchesGroup` da vinculação por cota: "Palco" casa "Palco Lateral".
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

/** A entrada mais específica com dado suficiente — é ela que decide (passando ou não). */
function decisivo<T>(chaves: string[], tabela: Record<string, T>): T | undefined {
  for (const c of chaves) {
    const e = tabela[c];
    if (e) return e;
  }
  return undefined;
}

const pct = (n: number) => Math.round(n * 1000) / 1000;

// ── O motor ─────────────────────────────────────────────────────────────────

const PRIORIDADE: Record<RegraDaSugestao, number> = { "nome-na-descricao": 3, cota: 2, estrutura: 1 };

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
  const prefixos = chave ? prefixosDaChave(chave) : [];
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

  // 2. Estrutura: leva o elenco do evento.
  const estrutura = decisivo(prefixos, padroes.estrutura);
  const ehEstrutura = !!estrutura?.padrao;
  if (estrutura && ehEstrutura) {
    for (const p of patrocinadores) {
      propor({ sponsorId: p.id, regra: "estrutura", confianca: pct(estrutura.cobertura), motivo: "Peça de estrutura: leva os patrocinadores do evento" });
    }
  }

  // 3. Cota: as regras manuais e o que o histórico ensinou.
  for (const p of patrocinadores) {
    const cota = normalizarCota(p.cota);
    if (!cota) continue;
    const fator = p.cotaDoHistorico ? CONFIANCA.cotaDoHistorico : 1;
    const sufixo = p.cotaDoHistorico ? " — cota pelo histórico do patrocinador" : "";
    for (const r of regrasManuais) {
      if (normalizarCota(r.cota) !== cota) continue;
      const tipo = r.tipos.find((t) => tipoCasa(chave, chaveDoTipo(t)));
      if (!tipo) continue;
      propor({
        sponsorId: p.id, regra: "cota", confianca: pct(CONFIANCA.regraManual * fator),
        motivo: `Regra de cota ${r.origem === "evento" ? "do evento" : "geral"}: ${cota} leva ${tipo}${sufixo}`,
      });
      break;
    }
    const aprendido = decisivo(prefixos.map((x) => `${cota}|${x}`), padroes.cotaPorTipo);
    if (aprendido?.padrao) {
      propor({
        sponsorId: p.id, regra: "cota", confianca: pct(aprendido.taxa * fator),
        motivo: `${cota} costuma ir em ${aprendido.rotulo} (${aprendido.comVinculo} de ${aprendido.eventos} eventos)${sufixo}`,
      });
    }
  }

  // AUTOMÁTICA: um nome só, a peça não é de estrutura e nenhuma outra regra
  // pede outro patrocinador. Vincular sozinho um patrocinador numa peça que
  // leva vários a deixaria "pronta" pela metade — e o "Enviar prontas" a
  // mandaria assim para a Arte.
  if (casados.length === 1 && !ehEstrutura && porPatrocinador.size === 1) {
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
  patrocinadores: string[];
}

/** Um vínculo evento↔patrocinador do histórico, com a cota (quando preenchida). */
export interface ElencoDoHistorico {
  eventId: string;
  sponsorId: string;
  cota: string | null;
}

/** "Pórtico de Chegada" com a chave "portico chegada" e prefixo de 1 palavra → "Pórtico". */
function rotuloDoPrefixo(tipoOriginal: string, palavras: number): string {
  const tokens = String(tipoOriginal).split(/[^A-Za-z0-9À-ɏ]+/).filter((t) => t && !PALAVRAS_VAZIAS.has(normalizarTexto(t)));
  return tokens.slice(0, palavras).join(" ");
}

function maisFrequente(contagem: Map<string, number> | undefined, padrao: string): string {
  if (!contagem || contagem.size === 0) return padrao;
  let melhor = padrao, n = -1;
  contagem.forEach((v, k) => { if (v > n) { melhor = k; n = v; } });
  return melhor;
}

/**
 * Aprende as duas tabelas do histórico.
 *
 * ESTRUTURA, por chave de tipo (e cada prefixo dela): peças vinculadas em
 * eventos com ≥ 3 patrocinadores; cobertura = |patrocinadores da peça ∩ do
 * evento| ÷ |do evento|. Entra com ≥ 10 peças; é padrão com média ≥ 0,8.
 *
 * COTA × TIPO: para cada evento, cota (preenchida no evento) e tipo presente,
 * a fração das peças do tipo que levaram patrocinador daquela cota. Entra com
 * ≥ 3 eventos; é padrão com média ≥ 0,8.
 */
export function aprenderPadroes(
  pecas: PecaDoHistorico[],
  elencos: ElencoDoHistorico[],
  limiares: Partial<LimiaresDeVinculo> = {},
): PadroesDeVinculo {
  const L = { ...LIMIARES_DE_VINCULO, ...limiares };
  const elencoDoEvento = new Map<string, Set<string>>();
  const cotaNoEvento = new Map<string, string>(); // `${evento}|${patrocinador}` → COTA
  for (const e of elencos) {
    if (!elencoDoEvento.has(e.eventId)) elencoDoEvento.set(e.eventId, new Set());
    elencoDoEvento.get(e.eventId)!.add(e.sponsorId);
    const c = normalizarCota(e.cota);
    if (c) cotaNoEvento.set(`${e.eventId}|${e.sponsorId}`, c);
  }

  // Rótulos: como cada prefixo aparece escrito.
  const rotulos = new Map<string, Map<string, number>>();
  const anotarRotulo = (prefixo: string, tipo: string, palavras: number) => {
    const r = rotuloDoPrefixo(tipo, palavras);
    if (!r) return;
    if (!rotulos.has(prefixo)) rotulos.set(prefixo, new Map());
    const m = rotulos.get(prefixo)!;
    m.set(r, (m.get(r) ?? 0) + 1);
  };

  const pecasDoEvento = new Map<string, Array<{ prefixos: string[]; patrocinadores: Set<string> }>>();
  const somaEstrutura = new Map<string, { soma: number; n: number }>();
  for (const p of pecas) {
    const chave = chaveDoTipo(p.tipo);
    if (!chave || p.patrocinadores.length === 0) continue;
    const prefixos = prefixosDaChave(chave);
    const total = prefixos.length;
    prefixos.forEach((pre, i) => anotarRotulo(pre, p.tipo, total - i));
    const dela = new Set(p.patrocinadores);
    if (!pecasDoEvento.has(p.eventId)) pecasDoEvento.set(p.eventId, []);
    pecasDoEvento.get(p.eventId)!.push({ prefixos, patrocinadores: dela });

    const elenco = elencoDoEvento.get(p.eventId);
    if (!elenco || elenco.size < L.estruturaMinPatrocinadoresNoEvento) continue;
    let dentro = 0;
    dela.forEach((s) => { if (elenco.has(s)) dentro++; });
    const cobertura = Math.min(1, dentro / elenco.size);
    for (const pre of prefixos) {
      const a = somaEstrutura.get(pre) ?? { soma: 0, n: 0 };
      a.soma += cobertura; a.n++;
      somaEstrutura.set(pre, a);
    }
  }

  const estrutura: Record<string, PadraoDeEstrutura> = {};
  somaEstrutura.forEach((a, pre) => {
    if (a.n < L.estruturaMinPecas) return;
    const cobertura = a.soma / a.n;
    estrutura[pre] = { pecas: a.n, cobertura: pct(cobertura), rotulo: maisFrequente(rotulos.get(pre), pre), padrao: cobertura >= L.estruturaCobertura };
  });

  // Cota × tipo, evento a evento.
  const porCotaTipo = new Map<string, { taxas: number[]; foi: number }>();
  pecasDoEvento.forEach((lista, eventId) => {
    const elenco = elencoDoEvento.get(eventId);
    if (!elenco) return;
    // As cotas deste evento e quem tem cada uma.
    const quemTem = new Map<string, string[]>();
    elenco.forEach((s) => {
      const c = cotaNoEvento.get(`${eventId}|${s}`);
      if (!c) return;
      if (!quemTem.has(c)) quemTem.set(c, []);
      quemTem.get(c)!.push(s);
    });
    if (quemTem.size === 0) return;
    // Peças por prefixo de tipo.
    const porPrefixo = new Map<string, Array<Set<string>>>();
    for (const p of lista) for (const pre of p.prefixos) {
      if (!porPrefixo.has(pre)) porPrefixo.set(pre, []);
      porPrefixo.get(pre)!.push(p.patrocinadores);
    }
    quemTem.forEach((donos, cota) => {
      porPrefixo.forEach((conjuntos, pre) => {
        let com = 0, total = 0;
        for (const s of donos) for (const c of conjuntos) { total++; if (c.has(s)) com++; }
        if (total === 0) return;
        const taxa = com / total;
        const k = `${cota}|${pre}`;
        const a = porCotaTipo.get(k) ?? { taxas: [], foi: 0 };
        a.taxas.push(taxa);
        if (taxa >= L.cotaFoiNoEvento) a.foi++;
        porCotaTipo.set(k, a);
      });
    });
  });

  const cotaPorTipo: Record<string, PadraoDeCota> = {};
  porCotaTipo.forEach((a, k) => {
    if (a.taxas.length < L.cotaMinEventos) return;
    const taxa = a.taxas.reduce((x, y) => x + y, 0) / a.taxas.length;
    const pre = k.slice(k.indexOf("|") + 1);
    cotaPorTipo[k] = {
      eventos: a.taxas.length, comVinculo: a.foi, taxa: pct(taxa),
      rotulo: maisFrequente(rotulos.get(pre), pre), padrao: taxa >= L.cotaTaxa,
    };
  });

  return { estrutura, cotaPorTipo };
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
