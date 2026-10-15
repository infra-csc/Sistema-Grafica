// ─────────────────────────────────────────────────────────────────────────────
// EVENTOS SUGERIDOS DO UMMENSE — o que está no calendário do Ummense e ainda
// não existe no app (dono, 15/10: "os eventos que ainda não estão no app,
// conseguimos deixar como sugestão para criar, e com os patrocinadores?").
//
// A fonte é uma FOTO (shared/dados/ummense-eventos.json), gerada fora do app
// por scripts/importar-ummense.mjs — o app não fala com o Ummense. Este módulo
// é PURO (sem banco): o servidor carrega os eventos e os patrocinadores do app
// e chama daqui; os testes e o script de conferência também.
//
// ── "JÁ EXISTE NO APP?" ─────────────────────────────────────────────────────
// Os nomes não se parecem: o Ummense escreve "Night Run - Etapa 1 - Belo
// Horizonte" e o app tem "Night Run BH"; "Circuito das Estações - Campinas"
// (estação VERÃO) é "Verão Campinas" no app. O app não guarda cidade — ela sai
// do NOME do evento do app (lista de cidades + apelidos BH, RJ, SP, POA, Sampa…).
//
// Três sinais, todos sobre o nome normalizado (sem acento, sem caixa):
//   · DATA   — o início do evento do app a ±3 dias da data do Ummense;
//   · CIDADE — a cidade do Ummense aparece no nome do app (direto ou por
//              apelido). O nome do app SEM cidade nenhuma ("Viva Esporte",
//              "Treinão Plié") é COMPATÍVEL com qualquer cidade; com OUTRA
//              cidade, não é ("Night Run Salvador" × "Night Run Belém", os
//              dois em 17/10);
//   · MARCA  — a franquia (tabela MARCAS: Night Run, Girl Power, Eco Run,
//              Circuito das Estações = Verão/Outono/Inverno/Primavera,
//              Circuito Banco do Brasil = "Banco do Brasil <cidade>"…). Fora
//              da tabela, as marcas batem quando os nomes dividem uma palavra
//              própria de 4+ letras ("Corrida de Vera Cruz" × "Vera Cruz RJ").
//              Nas Estações, estação diferente é marca diferente.
//
// E a decisão, preferindo deixar de sugerir a sugerir duplicado:
//   · JÁ EXISTE   — data ±3 + marca igual + cidade compatível. Some da lista.
//   · PODE EXISTIR — continua sugerido, com o aviso e o link para o evento:
//       (a) data ±3 + MESMA cidade + marca diferente ("na dúvida");
//       (b) marca e cidade iguais com a data a até 45 dias (a data pode ter
//           mudado num dos lados — "Eco Run Navegantes" 11/10 × 22/11);
//       (c) bateria como "já existe", mas o evento do app está ARQUIVADO.
//     Evento do app que já foi reconhecido como "o mesmo" de outra linha do
//     Ummense não gera dúvida para as demais (senão todo fim de semana de SP
//     acusaria todos os eventos de SP).
//   · NOVO        — nada disso.
//
// ── PATROCINADORES ──────────────────────────────────────────────────────────
// O nome do Ummense é casado com o cadastro pela CHAVE COMPACTA (sem acento,
// caixa, espaço nem pontuação: "Get Net" = "Getnet", "B.Hyundai" = "B. Hyundai")
// + apelidos de grafia (Decatlhon/Decathon → Decathlon…) + sufixos que não mudam
// a empresa ("Porto Saúde" → Porto, "Heineken 0.0" → Heineken, "HDI SEGUROS" →
// HDI). "Esfera Energia" NÃO vira "Esfera" — são empresas diferentes (o Night
// Run SP tem as duas).
// ─────────────────────────────────────────────────────────────────────────────

/** As cotas que o formulário do evento aceita (QUOTA_OPTIONS do client). */
export const COTAS_DO_APP = ["MASTER", "GOLD", "SILVER", "APOIO", "MIDIA", "MINISTERIO"] as const;
export type CotaDoApp = (typeof COTAS_DO_APP)[number];

export interface PatrocinadorDoUmmense {
  nome: string;
  /** Como veio do Ummense: MASTER, GOLD, SILVER, APOIO, MIDIA, O2 PRIME, EXPO… */
  cota: string | null;
}

export interface EventoDoUmmense {
  /** Estável entre fotos enquanto nome e data não mudam: guarda o "Ignorar". */
  id: string;
  nome: string;
  /** "YYYY-MM-DD" */
  data: string;
  /** VERÃO, OUTONO, INVERNO, PRIMAVERA (Circuito das Estações) ou null. */
  estacao: string | null;
  cidade: string | null;
  /** O Ummense marca "DATA NÃO CONFIRMADA" nas tags. */
  dataNaoConfirmada: boolean;
  tags: string[];
  patrocinadores: PatrocinadorDoUmmense[];
}

export interface FotoDoUmmense {
  /** "YYYY-MM-DD": o dia em que a foto foi tirada. */
  fotoDe: string;
  origem: string;
  eventos: EventoDoUmmense[];
}

export interface EventoDoAppParaCasar {
  id: string;
  nome: string;
  /** "YYYY-MM-DD" (início do evento). */
  data: string;
  arquivado?: boolean;
}

export interface PatrocinadorDoAppParaCasar {
  id: string;
  nome: string;
  arquivado?: boolean;
  /** ISO — desempate entre duplicados (o mais antigo vence). */
  criadoEm?: string | null;
}

export type SituacaoNoApp =
  | { tipo: "existe"; evento: EventoDoAppParaCasar; motivo: string }
  | { tipo: "talvez"; evento: EventoDoAppParaCasar; motivo: string }
  | { tipo: "novo" };

export interface PatrocinadorSugerido {
  nomeNoUmmense: string;
  /** A cota como veio do Ummense (para mostrar). */
  cota: string | null;
  /** A cota que o formulário aceita; null quando o Ummense usa outra (O2 PRIME, EXPO). */
  cotaNoApp: CotaDoApp | null;
  sponsorId: string | null;
  nomeNoApp: string | null;
  /** Casou com um patrocinador ARQUIVADO no app: mostrar, não pré-selecionar. */
  arquivado: boolean;
}

export interface EventoSugerido {
  id: string;
  nome: string;
  data: string;
  cidade: string | null;
  estacao: string | null;
  dataNaoConfirmada: boolean;
  tags: string[];
  patrocinadores: PatrocinadorSugerido[];
  /** "Pode já existir: <evento do app>" — null quando não há dúvida. */
  podeJaExistir: { id: string; nome: string; data: string; arquivado: boolean; motivo: string } | null;
}

export interface RespostaEventosSugeridos {
  fotoDe: string | null;
  origem: string | null;
  /** "YYYY-MM-DD" do negócio usado no corte. */
  hoje: string;
  /** Eventos da foto com data ≥ hoje. */
  futurosNaFoto: number;
  /** Desses, quantos o app já tem. */
  jaNoApp: number;
  sugestoes: EventoSugerido[];
}

// ── Normalização ────────────────────────────────────────────────────────────

/** Sem acento, minúsculo, só letras/dígitos separados por UM espaço. */
export function normalizar(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** A frase inteira aparece no texto, como palavras inteiras (ambos normalizados). */
const contemFrase = (texto: string, frase: string) => !!frase && ` ${texto} `.includes(` ${frase} `);

// ── Cidades ─────────────────────────────────────────────────────────────────

/**
 * Cidades conhecidas (nome de exibição). As do calendário do Ummense e as que
 * aparecem nos eventos do app, mais capitais. "Porto Seguro" fica DE FORA de
 * propósito: é patrocinador ("Ativação Porto Seguro").
 */
export const CIDADES_CONHECIDAS = [
  "São Paulo", "Rio de Janeiro", "Belo Horizonte", "Brasília", "Porto Alegre", "Curitiba", "Florianópolis",
  "Salvador", "Recife", "Fortaleza", "Belém", "Manaus", "São Luís", "Aracaju", "Maceió", "João Pessoa",
  "Natal", "Teresina", "Palmas", "Goiânia", "Cuiabá", "Campo Grande", "Vitória", "Vila Velha", "Serra",
  "Cariacica", "Fundão", "João Neiva", "Baixo Guandu", "Santos", "Campinas", "Ribeirão Preto",
  "São José dos Campos", "Indaiatuba", "Pirassununga", "Limeira", "Piracicaba", "Pindamonhangaba",
  "Londrina", "Foz do Iguaçu", "Campo Largo", "Navegantes", "Joinville", "Novo Hamburgo", "Rio Branco",
  "Porto Velho", "Macapá", "Boa Vista", "Itabira", "Nova Lima", "Mangaratiba", "Búzios", "Barra do Sahy",
  "Niterói", "Sorocaba", "Jundiaí", "Guarulhos", "Osasco", "Santo André", "São Bernardo do Campo",
  "Uberlândia", "Juiz de Fora", "Blumenau", "Caxias do Sul", "Maringá", "Cascavel", "Petrolina",
  "Campina Grande", "Feira de Santana", "Balneário Camboriú", "Itajaí", "Cabo Frio", "Petrópolis", "Macaé",
  "Angra dos Reis", "Guarujá", "Bertioga", "Ubatuba", "Ilhabela", "Taubaté", "Bauru", "São Carlos",
  "Araraquara", "Americana", "Barueri", "Cotia", "Mogi das Cruzes", "Itu", "Atibaia",
] as const;

/** Apelidos (normalizados) → cidade normalizada. */
export const APELIDOS_DE_CIDADE: Record<string, string> = {
  bh: "belo horizonte",
  rj: "rio de janeiro",
  sp: "sao paulo",
  sampa: "sao paulo",
  poa: "porto alegre",
  bsb: "brasilia",
  floripa: "florianopolis",
  sjc: "sao jose dos campos",
  "sao luiz": "sao luis",
};

const CIDADE_POR_CHAVE = new Map<string, string>(CIDADES_CONHECIDAS.map((c) => [normalizar(c), c]));

/** Nome normalizado → cidade canônica (normalizada), resolvendo apelidos. */
export function cidadeCanonica(cidade: string | null | undefined): string | null {
  const n = normalizar(cidade);
  if (!n) return null;
  return APELIDOS_DE_CIDADE[n] ?? n;
}

/** Nome de exibição de uma cidade conhecida (ou null). */
export function exibicaoDaCidade(cidade: string): string | null {
  const c = cidadeCanonica(cidade);
  return c ? CIDADE_POR_CHAVE.get(c) ?? null : null;
}

/** É cidade conhecida (ou apelido de uma)? */
export function ehCidadeConhecida(texto: string): boolean {
  const c = cidadeCanonica(texto);
  return !!c && CIDADE_POR_CHAVE.has(c);
}

/**
 * Cidades citadas num nome (canônicas, normalizadas). Casa a frase MAIS LONGA
 * primeiro, consumindo as palavras: "Rio Branco" não deixa sobrar "rio".
 */
export function cidadesNoNome(nome: string): Set<string> {
  const tokens = normalizar(nome).split(" ").filter(Boolean);
  const achadas = new Set<string>();
  for (let i = 0; i < tokens.length; ) {
    let pulo = 0;
    for (let tam = Math.min(4, tokens.length - i); tam >= 1; tam--) {
      const frase = tokens.slice(i, i + tam).join(" ");
      const canon = APELIDOS_DE_CIDADE[frase] ?? frase;
      if (CIDADE_POR_CHAVE.has(canon)) { achadas.add(canon); pulo = tam; break; }
    }
    i += pulo || 1;
  }
  return achadas;
}

// ── Marcas ──────────────────────────────────────────────────────────────────

/**
 * As franquias, na ORDEM de teste (a primeira que casar vence): o mais
 * específico antes ("circuitinho" antes das Estações; "night run" antes de
 * qualquer "run"). Termos normalizados, casados como palavras inteiras.
 */
export const MARCAS: Array<{ chave: string; termos: string[] }> = [
  { chave: "circuitinho", termos: ["circuitinho"] },
  { chave: "night-run", termos: ["night run"] },
  { chave: "girl-power", termos: ["girl power"] },
  { chave: "eco-run", termos: ["eco run"] },
  { chave: "blue-run", termos: ["blue run"] },
  { chave: "bota-pra-correr", termos: ["bota pra correr", "bota para correr"] },
  { chave: "banco-do-brasil", termos: ["circuito banco do brasil", "banco do brasil"] },
  { chave: "s-run", termos: ["circuito s run", "s run", "srun"] },
  { chave: "treinao", termos: ["treinao", "running land"] },
  { chave: "desafio-petrobras", termos: ["desafio energia petrobras", "desafio petrobras"] },
  { chave: "viva-esporte", termos: ["viva esporte"] },
  { chave: "makai", termos: ["makai"] },
  { chave: "netshoes", termos: ["netshoes"] },
  { chave: "smart-fit", termos: ["smart fit", "smartfit"] },
  { chave: "running-hour", termos: ["running hour"] },
  { chave: "new-balance", termos: ["new balance"] },
  { chave: "longevidade", termos: ["longevidade bradesco", "longevidade"] },
  { chave: "trofeu-brasil", termos: ["trofeu brasil"] },
  { chave: "meia-de-sampa", termos: ["meia de sampa"] },
  { chave: "superhumans", termos: ["superhumans", "super humans"] },
  { chave: "ilumina", termos: ["ilumina running", "ilumina run"] },
  { chave: "agro-power", termos: ["agro power"] },
  { chave: "bravus", termos: ["bravus"] },
  { chave: "fuga-das-ilhas", termos: ["fuga das ilhas"] },
  { chave: "dpsp-run", termos: ["dpsp run"] },
  { chave: "circuito-vale", termos: ["circuito vale"] },
  // Por último: "Verão Campinas" é o Circuito das Estações no app.
  { chave: "estacoes", termos: ["circuito das estacoes", "circuito estacoes", "4 estacoes", "quatro estacoes", "verao", "outono", "inverno", "primavera"] },
];

const ESTACOES = ["verao", "outono", "inverno", "primavera"];

/** Palavras que não distinguem um evento de outro (fora da tabela de marcas). */
const PALAVRAS_GENERICAS = new Set([
  "de", "da", "do", "das", "dos", "e", "a", "o", "em", "na", "no", "etapa", "edicao", "special", "edition",
  "corrida", "circuito", "run", "running", "race", "night", "desafio", "ano", "evento",
]);

export interface MarcaDoNome {
  chave: string | null;
  estacao: string | null;
  /** Palavras próprias (sem cidade, número e genéricas) — para quando uma das marcas é desconhecida. */
  palavras: Set<string>;
}

export function marcaDoNome(nome: string, estacao?: string | null): MarcaDoNome {
  const n = normalizar(nome);
  const marca = MARCAS.find((m) => m.termos.some((t) => contemFrase(n, t)));
  const est = normalizar(estacao) || ESTACOES.find((e) => contemFrase(n, e)) || null;
  // Palavras próprias: tira as cidades (frase inteira) antes de quebrar.
  let semCidade = ` ${n} `;
  const cidades = cidadesNoNome(nome);
  for (const c of Array.from(cidades)) semCidade = semCidade.split(` ${c} `).join(" ");
  for (const [apelido, c] of Object.entries(APELIDOS_DE_CIDADE)) if (cidades.has(c)) semCidade = semCidade.split(` ${apelido} `).join(" ");
  const palavras = new Set(
    semCidade.split(" ").filter((p) => p.length >= 4 && !/^\d+$/.test(p) && !PALAVRAS_GENERICAS.has(p)),
  );
  return { chave: marca?.chave ?? null, estacao: marca?.chave === "estacoes" ? est : null, palavras };
}

export function marcasBatem(a: MarcaDoNome, b: MarcaDoNome): boolean {
  if (a.chave && b.chave) {
    if (a.chave !== b.chave) return false;
    return !(a.estacao && b.estacao && a.estacao !== b.estacao);
  }
  return Array.from(a.palavras).some((p) => b.palavras.has(p));
}

// ── Datas ───────────────────────────────────────────────────────────────────

const diaMs = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
export const diasEntre = (a: string, b: string) => Math.round(Math.abs(diaMs(a) - diaMs(b)) / 86_400_000);
const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

export const JANELA_DE_DATA = 3;
export const JANELA_DE_DATA_MUDADA = 45;

// ── O casamento de eventos ──────────────────────────────────────────────────

interface AppPreparado {
  ev: EventoDoAppParaCasar;
  n: string;
  cidades: Set<string>;
  marca: MarcaDoNome;
}

/**
 * Para cada evento da foto, a situação no app. Roda sobre a LISTA inteira
 * (e não um por vez) porque um evento do app reconhecido como "o mesmo" de uma
 * linha do Ummense deixa de valer como dúvida para as outras.
 */
export function casarComOApp(ummense: EventoDoUmmense[], app: EventoDoAppParaCasar[]): Map<string, SituacaoNoApp> {
  const preparados: AppPreparado[] = app.map((ev) => ({ ev, n: normalizar(ev.nome), cidades: cidadesNoNome(ev.nome), marca: marcaDoNome(ev.nome) }));
  const ativos = preparados.filter((p) => !p.ev.arquivado);
  const arquivados = preparados.filter((p) => p.ev.arquivado);

  const cidadeDe = (u: EventoDoUmmense) => cidadeCanonica(u.cidade);
  /** A cidade do Ummense está no nome do app (pela lista, ou escrita por extenso)? */
  const cidadeBate = (u: EventoDoUmmense, p: AppPreparado) => {
    const c = cidadeDe(u);
    return !!c && (p.cidades.has(c) || contemFrase(p.n, c));
  };
  const cidadeCompativel = (u: EventoDoUmmense, p: AppPreparado) => !cidadeDe(u) || p.cidades.size === 0 || cidadeBate(u, p);
  const mesmo = (u: EventoDoUmmense, mu: MarcaDoNome, p: AppPreparado) =>
    diasEntre(u.data, p.ev.data) <= JANELA_DE_DATA && marcasBatem(mu, p.marca) && cidadeCompativel(u, p);
  /** O mais provável primeiro: cidade escrita, depois a data mais perto. */
  const melhor = (u: EventoDoUmmense, lista: AppPreparado[]) =>
    [...lista].sort((a, b) =>
      Number(cidadeBate(u, b)) - Number(cidadeBate(u, a)) || diasEntre(u.data, a.ev.data) - diasEntre(u.data, b.ev.data),
    )[0];

  const marcas = new Map(ummense.map((u) => [u.id, marcaDoNome(u.nome, u.estacao)]));
  const situacoes = new Map<string, SituacaoNoApp>();
  const reconhecidos = new Set<string>();

  // 1ª passada: o que JÁ EXISTE.
  for (const u of ummense) {
    const cands = ativos.filter((p) => mesmo(u, marcas.get(u.id)!, p));
    if (cands.length === 0) continue;
    const p = melhor(u, cands);
    reconhecidos.add(p.ev.id);
    const dias = diasEntre(u.data, p.ev.data);
    situacoes.set(u.id, {
      tipo: "existe",
      evento: p.ev,
      motivo: `mesma marca${cidadeBate(u, p) ? " e cidade" : ""}, ${dias === 0 ? "mesma data" : `${dias} dia${dias > 1 ? "s" : ""} de diferença`}`,
    });
  }

  // 2ª passada: a DÚVIDA, só para quem não existe.
  for (const u of ummense) {
    if (situacoes.has(u.id)) continue;
    const mu = marcas.get(u.id)!;
    const livres = ativos.filter((p) => !reconhecidos.has(p.ev.id));
    // (c) Bateria, mas está arquivado.
    const arq = arquivados.filter((p) => mesmo(u, mu, p));
    if (arq.length) {
      const p = melhor(u, arq);
      situacoes.set(u.id, { tipo: "talvez", evento: p.ev, motivo: "evento parecido, arquivado no app" });
      continue;
    }
    // (a) Mesma cidade e data, marca diferente.
    const mesmaCidadeEData = livres.filter((p) => diasEntre(u.data, p.ev.data) <= JANELA_DE_DATA && cidadeBate(u, p));
    if (mesmaCidadeEData.length) {
      const p = melhor(u, mesmaCidadeEData);
      situacoes.set(u.id, { tipo: "talvez", evento: p.ev, motivo: `mesma cidade e data (${ddmm(p.ev.data)})` });
      continue;
    }
    // (b) Mesma marca e cidade, data mudada.
    const dataMudada = livres.filter((p) =>
      diasEntre(u.data, p.ev.data) <= JANELA_DE_DATA_MUDADA && marcasBatem(mu, p.marca) && cidadeBate(u, p));
    if (dataMudada.length) {
      const p = melhor(u, dataMudada);
      situacoes.set(u.id, { tipo: "talvez", evento: p.ev, motivo: `mesma marca e cidade, em ${ddmm(p.ev.data)} no app` });
      continue;
    }
    situacoes.set(u.id, { tipo: "novo" });
  }
  return situacoes;
}

// ── O casamento de patrocinadores ───────────────────────────────────────────

/** Sem acento, caixa, espaço e pontuação: "B. Hyundai" = "B.Hyundai" = "bhyundai". */
export const chaveCompacta = (s: string) => normalizar(s).replace(/ /g, "");

/**
 * Grafias do mesmo patrocinador (chave compacta → chave canônica). Vale dos
 * DOIS lados — o app também tem as suas ("Sherwin Willians", "Drogaria SP").
 * B. Hyundai → Hyundai: no S Run Rio Branco, o app tem "Hyundai" onde o
 * Ummense diz "B. Hyundai".
 */
export const APELIDOS_DE_PATROCINADOR: Record<string, string> = {
  decatlhon: "decathlon",
  decathon: "decathlon",
  decahtlon: "decathlon",
  decatlon: "decathlon",
  bhyundai: "hyundai",
  bhyndai: "hyundai",
  hyndai: "hyundai",
  drogariasaopaulo: "drogariasp",
  dpspdrogariasaopaulo: "drogariasp",
  dpspdrogariasp: "drogariasp",
  dpspdrogariapacheco: "drogariapacheco",
  aguacrystal: "crystal",
  bancobny: "bny",
  zonasulsupermercados: "supermercadozonasul",
  sherwinwillians: "sherwinwilliams",
  shoppingiguatemiribeiraopreto: "shoppingiguatemiribeirao",
  esferaeneria: "esferaenergia",
};

/** Palavras no FIM do nome que não mudam a empresa ("Porto Saúde" é a Porto). */
const SUFIXOS_QUE_NAO_MUDAM_A_EMPRESA = new Set(["seguros", "seguro", "saude", "fit", "sport", "sports", "supermercados", "apresenta", "0", "00"]);

const canonica = (nome: string) => {
  const c = chaveCompacta(nome);
  return APELIDOS_DE_PATROCINADOR[c] ?? c;
};

export type IndiceDePatrocinadores = Map<string, PatrocinadorDoAppParaCasar[]>;

export function indexarPatrocinadores(lista: PatrocinadorDoAppParaCasar[]): IndiceDePatrocinadores {
  const m: IndiceDePatrocinadores = new Map();
  for (const s of lista) {
    const k = canonica(s.nome);
    if (!k) continue;
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(s);
  }
  return m;
}

/** Os jeitos de ler um nome, do mais fiel ao mais solto. */
function leiturasDoNome(nome: string): string[] {
  const leituras = [nome, nome.replace(/\([^)]*\)/g, " "), nome.split(" + ")[0], nome.split("/")[0], nome.split("|")[0]];
  const comSufixo: string[] = [];
  for (const l of leituras) {
    const tokens = normalizar(l).split(" ").filter(Boolean);
    while (tokens.length > 1 && SUFIXOS_QUE_NAO_MUDAM_A_EMPRESA.has(tokens[tokens.length - 1])) tokens.pop();
    comSufixo.push(tokens.join(" "));
  }
  return Array.from(new Set([...leituras, ...comSufixo].map((l) => l.trim()).filter(Boolean)));
}

/**
 * O patrocinador do app para um nome do Ummense, ou null. Entre duplicados do
 * cadastro ("SulAmerica" e "Sulamerica"), vence o ativo; depois o de grafia
 * idêntica (sem acento); depois o mais antigo.
 */
export function casarPatrocinador(nome: string, indice: IndiceDePatrocinadores): PatrocinadorDoAppParaCasar | null {
  for (const leitura of leiturasDoNome(nome)) {
    const cands = indice.get(canonica(leitura));
    if (!cands?.length) continue;
    const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
    return [...cands].sort((a, b) =>
      Number(!!a.arquivado) - Number(!!b.arquivado)
      || Number(semAcento(b.nome) === semAcento(leitura)) - Number(semAcento(a.nome) === semAcento(leitura))
      || String(a.criadoEm ?? "").localeCompare(String(b.criadoEm ?? "")),
    )[0];
  }
  return null;
}

/** A cota do Ummense como o formulário aceita (MÍDIA → MIDIA; O2 PRIME/EXPO → null). */
export function cotaNoApp(cota: string | null | undefined): CotaDoApp | null {
  const c = normalizar(cota).toUpperCase().replace(/ /g, "");
  return (COTAS_DO_APP as readonly string[]).includes(c) ? (c as CotaDoApp) : null;
}

const PESO_DA_COTA: Record<string, number> = { MASTER: 6, GOLD: 5, SILVER: 4, APOIO: 3, MIDIA: 2, MINISTERIO: 1 };

export function patrocinadoresSugeridos(lista: PatrocinadorDoUmmense[], indice: IndiceDePatrocinadores): PatrocinadorSugerido[] {
  const saida: PatrocinadorSugerido[] = [];
  for (const p of lista) {
    const s = casarPatrocinador(p.nome, indice);
    const linha: PatrocinadorSugerido = {
      nomeNoUmmense: p.nome,
      cota: p.cota,
      cotaNoApp: cotaNoApp(p.cota),
      sponsorId: s?.id ?? null,
      nomeNoApp: s?.nome ?? null,
      arquivado: !!s?.arquivado,
    };
    // Dois nomes do Ummense para o MESMO patrocinador ("Bradesco Apresenta" e
    // "Bradesco"): uma linha só, com a cota mais alta.
    const ja = linha.sponsorId ? saida.find((x) => x.sponsorId === linha.sponsorId) : undefined;
    if (ja) {
      ja.nomeNoUmmense = `${ja.nomeNoUmmense} / ${linha.nomeNoUmmense}`;
      if ((PESO_DA_COTA[linha.cotaNoApp ?? ""] ?? 0) > (PESO_DA_COTA[ja.cotaNoApp ?? ""] ?? 0)) {
        ja.cotaNoApp = linha.cotaNoApp;
        ja.cota = linha.cota;
      }
      continue;
    }
    saida.push(linha);
  }
  return saida;
}

/**
 * LIE, ICMS RJ e LPIE = MINISTÉRIO (dono, 15/10: "LIE é Ministério no card",
 * "ICMS RJ também", "LPIE também"). O evento incentivado leva o Ministério como patrocinador,
 * mas o Ummense só marca a etiqueta no cartão — não cria o cartão do
 * patrocinador. Aqui ele entra na lista com a cota MINISTERIO, se ainda não
 * estiver.
 */
export const ETIQUETAS_DO_MINISTERIO = ["LIE", "ICMS RJ", "LPIE"] as const;
export function comMinisterioDaLei(e: Pick<EventoDoUmmense, "tags" | "patrocinadores">): PatrocinadorDoUmmense[] {
  const temLie = e.tags.some((t) => (ETIQUETAS_DO_MINISTERIO as readonly string[]).includes(normalizar(t).toUpperCase()));
  const jaTem = e.patrocinadores.some((p) => normalizar(p.nome).startsWith("ministerio"));
  return temLie && !jaTem ? [...e.patrocinadores, { nome: "Ministério", cota: "MINISTERIO" }] : e.patrocinadores;
}

// ── A resposta da rota ──────────────────────────────────────────────────────

/**
 * GET /api/eventos-sugeridos: os eventos da foto com data ≥ hoje que o app
 * ainda não tem, em ordem de data, com os patrocinadores casados.
 */
export function montarEventosSugeridos(
  foto: FotoDoUmmense | null,
  eventosDoApp: EventoDoAppParaCasar[],
  patrocinadoresDoApp: PatrocinadorDoAppParaCasar[],
  hoje: string,
): RespostaEventosSugeridos {
  if (!foto) return { fotoDe: null, origem: null, hoje, futurosNaFoto: 0, jaNoApp: 0, sugestoes: [] };
  const futuros = foto.eventos.filter((e) => e.data >= hoje);
  // O casamento roda sobre a foto inteira: um evento passado do Ummense também
  // "reconhece" o seu par no app e o tira da dúvida dos outros.
  const situacoes = casarComOApp(foto.eventos, eventosDoApp);
  const indice = indexarPatrocinadores(patrocinadoresDoApp);
  let jaNoApp = 0;
  const sugestoes: EventoSugerido[] = [];
  for (const e of [...futuros].sort((a, b) => a.data.localeCompare(b.data) || a.nome.localeCompare(b.nome, "pt-BR"))) {
    const s = situacoes.get(e.id) ?? { tipo: "novo" as const };
    if (s.tipo === "existe") { jaNoApp++; continue; }
    sugestoes.push({
      id: e.id,
      nome: e.nome,
      data: e.data,
      cidade: e.cidade,
      estacao: e.estacao,
      dataNaoConfirmada: e.dataNaoConfirmada,
      tags: e.tags,
      patrocinadores: patrocinadoresSugeridos(comMinisterioDaLei(e), indice),
      podeJaExistir: s.tipo === "talvez"
        ? { id: s.evento.id, nome: s.evento.nome, data: s.evento.data, arquivado: !!s.evento.arquivado, motivo: s.motivo }
        : null,
    });
  }
  return { fotoDe: foto.fotoDe, origem: foto.origem, hoje, futurosNaFoto: futuros.length, jaNoApp, sugestoes };
}
