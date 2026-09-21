// ─────────────────────────────────────────────────────────────────────────────
// ETIQUETA EM LISTA — a regra compartilhada pela etiqueta do TUBO e pelas
// listas das etiquetas do EVENTO.
//
// Por que existe (dono, 21/09): em setembro o galpão entregou 1.669 peças com
// etiqueta feita no Corel e 25 com a do app. A deles é SEMPRE por tubo, em
// lista, num adesivo pequeno em pé: logo do circuito, cidade gigante e uma
// linha por peça — às vezes com quantidade ("2X1 BB - 6"), às vezes sem
// ("Testeira Médica"). Para o app substituir o Corel, as duas telas precisam
// falar a mesma língua: a regra da linha, os tamanhos de papel, a paginação e
// as preferências moram AQUI, num lugar só, e são testadas à parte.
//
// Tudo aqui é função pura (menos as preferências, que tocam o localStorage
// atrás de try/catch) — sem React, para o teste não precisar de tela.
// ─────────────────────────────────────────────────────────────────────────────

export type PecaDaLista = { id?: string; type?: string | null; description?: string | null; quantity?: number | null };

/**
 * Aceita as grafias que chegam das planilhas: "2x1", "2X1", "2×1", "2 x 1",
 * "2x1 MBRF" — e não confunde "2x10" nem "12x1".
 */
export const ehDoisPorUm = (p: any) => /^2\s*[x×]\s*1(?![0-9])/i.test(String(p?.type ?? "").trim());

/**
 * A LINHA: "2x1 Ministério - 16" (tipo + descrição + " - " + quantidade).
 *  · a descrição que já começa pelo tipo ("2x1 Logo Santander") não repete o
 *    tipo;
 *  · NÃO abrevia: usa a descrição cadastrada — abreviação automática erraria
 *    nome de patrocinador, e o galpão confere pela palavra inteira;
 *  · `mostrarQuantidade: false` devolve só o nome ("Testeira Médica"), como o
 *    galpão faz quando a quantidade não ajuda a conferir.
 */
export const linhaDaLista = (p: PecaDaLista, opcoes: { mostrarQuantidade?: boolean } = {}) => {
  const tipo = String(p.type ?? "").trim();
  const desc = String(p.description ?? "").trim();
  const nome = !desc ? tipo : desc.toLowerCase().startsWith(tipo.toLowerCase()) ? desc : `${tipo} ${desc}`;
  if (opcoes.mostrarQuantidade === false) return nome;
  return `${nome} - ${p.quantity ?? 1}`;
};

// ── Tamanhos ────────────────────────────────────────────────────────────────

export type TamanhoEtiqueta = "adesivo" | "meia-a4" | "a4";

type Medidas = {
  rotulo: string;
  /** Valor do `size` do @page. */
  pagina: string;
  margemMm: number;
  /** Área ÚTIL (papel menos as margens): é o tamanho da caixa da etiqueta.
   *  A altura leva 2 mm de FOLGA: caixa cravada na altura da página, com o
   *  arredondamento da impressora, empurrava uma página em branco. */
  larguraMm: number;
  alturaMm: number;
  /** Tipografia em mm — sai igual na tela e no papel, e escala com o papel. */
  logoMm: number;
  prefixoMm: number;
  cidadeMaxMm: number;
  tuboMm: number;
  linhaMm: number;
  /** Quantas linhas cabem com o bloco "TUBO N" (etiqueta do tubo) e sem ele
   *  (lista do evento). Conta CONSERVADORA: a caixa tem altura fixa e corta o
   *  que sobrar — melhor abrir "2 de 2" do que perder a última linha. */
  linhasComTubo: number;
  linhasSemTubo: number;
  /** Letras por linha antes de quebrar — linha longa pesa 2 na paginação. */
  letrasPorLinha: number;
};

export const TAMANHOS: Record<TamanhoEtiqueta, Medidas> = {
  adesivo: {
    rotulo: "Adesivo 10×15 cm (em pé)", pagina: "100mm 150mm", margemMm: 3, larguraMm: 94, alturaMm: 142,
    logoMm: 15, prefixoMm: 3.6, cidadeMaxMm: 20, tuboMm: 12, linhaMm: 4.5, linhasComTubo: 13, linhasSemTubo: 16, letrasPorLinha: 34,
  },
  "meia-a4": {
    rotulo: "Meia A4", pagina: "A5 portrait", margemMm: 8, larguraMm: 132, alturaMm: 192,
    logoMm: 22, prefixoMm: 5, cidadeMaxMm: 28, tuboMm: 18, linhaMm: 6, linhasComTubo: 14, linhasSemTubo: 17, letrasPorLinha: 38,
  },
  a4: {
    rotulo: "A4", pagina: "A4 portrait", margemMm: 10, larguraMm: 190, alturaMm: 275,
    logoMm: 30, prefixoMm: 7, cidadeMaxMm: 40, tuboMm: 26, linhaMm: 8, linhasComTubo: 16, linhasSemTubo: 19, letrasPorLinha: 42,
  },
};
export const TAMANHO_PADRAO: TamanhoEtiqueta = "adesivo";
export const ORDEM_DOS_TAMANHOS: TamanhoEtiqueta[] = ["adesivo", "meia-a4", "a4"];

/** A regra @page do tamanho. `nome` gera página NOMEADA (`@page lista {…}`),
 *  para a lista conviver com as etiquetas A4 na mesma impressão. */
export const regraDaPagina = (t: TamanhoEtiqueta, nome = "") => {
  const m = TAMANHOS[t] ?? TAMANHOS[TAMANHO_PADRAO];
  return `@page${nome ? ` ${nome}` : ""} { size: ${m.pagina}; margin: ${m.margemMm}mm; }`;
};

/**
 * A CIDADE cabe na largura: a fonte encolhe com o comprimento da MAIOR palavra
 * (o navegador quebra entre palavras — "SÃO PAULO" vira duas linhas grandes).
 * 0,68 em por letra é a largura média do Space Grotesk 900 em caixa alta.
 */
export const fonteDaCidadeMm = (t: TamanhoEtiqueta, texto: string) => {
  const m = TAMANHOS[t] ?? TAMANHOS[TAMANHO_PADRAO];
  const maior = Math.max(4, ...String(texto ?? "").trim().split(/\s+/).map((w) => w.length));
  const cabe = m.larguraMm / (maior * 0.68);
  return Math.round(Math.min(m.cidadeMaxMm, cabe) * 10) / 10;
};

// ── Linhas, grupos e paginação ──────────────────────────────────────────────

export type LinhaDaEtiqueta<T> = { tipo: "subtitulo"; texto: string } | { tipo: "peca"; peca: T };

const chaveDoTipo = (p: any) => String(p?.type ?? "").trim();

/**
 * O subtítulo do grupo: "TESTEIRAS", "ROLOS". Só pluraliza o caso seguro — tipo
 * de UMA palavra terminada em vogal; "Testeira Médica", "Totem" e "2x1" saem
 * como estão (plural errado na etiqueta é pior que singular).
 */
export const subtituloDoTipo = (tipo: string) => {
  const t = String(tipo ?? "").trim();
  if (!t) return "OUTROS";
  const umaPalavra = !/\s/.test(t);
  const plural = umaPalavra && /[aeiouáéíóúãõâêô]$/i.test(t) ? `${t}s` : t;
  return plural.toUpperCase();
};

/**
 * Agrupa por tipo para a lista: os 2x1 primeiro (é o grosso do tubo), depois
 * os demais em ordem alfabética; dentro do grupo, a ordem que chegou (a do
 * código). O subtítulo só aparece quando há MAIS DE UM grupo — numa lista só
 * de 2x1 a linha já começa por "2x1" e o subtítulo gastaria uma linha à toa.
 */
export function linhasAgrupadas<T extends PecaDaLista>(pecas: T[]): LinhaDaEtiqueta<T>[] {
  const grupos = new Map<string, T[]>();
  for (const p of pecas) {
    const k = chaveDoTipo(p);
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k)!.push(p);
  }
  const chaves = Array.from(grupos.keys()).sort((a, b) => {
    const da = ehDoisPorUm({ type: a }) ? 0 : 1;
    const db = ehDoisPorUm({ type: b }) ? 0 : 1;
    return da - db || a.localeCompare(b, "pt-BR");
  });
  const comSubtitulo = chaves.length > 1;
  return chaves.flatMap((k) => [
    ...(comSubtitulo ? [{ tipo: "subtitulo" as const, texto: subtituloDoTipo(k) }] : []),
    ...grupos.get(k)!.map((peca) => ({ tipo: "peca" as const, peca })),
  ]);
}

/** Linha longa quebra em duas (ou mais) no papel — pesa isso na paginação. */
export const pesoDaLinha = (texto: string, letrasPorLinha: number) =>
  Math.max(1, Math.ceil(String(texto ?? "").length / Math.max(1, letrasPorLinha)));

/**
 * Quebra as linhas em ETIQUETAS ("Tubo 2 · 1 de 2"). Subtítulo nunca fica
 * órfão no pé da etiqueta: se só ele coubesse, desce junto com a primeira peça.
 */
export function paginarLinhas<T extends PecaDaLista>(
  linhas: LinhaDaEtiqueta<T>[],
  opcoes: { capacidade: number; letrasPorLinha: number; mostrarQuantidade?: boolean },
): LinhaDaEtiqueta<T>[][] {
  const capacidade = Math.max(2, Math.floor(opcoes.capacidade) || 2);
  const peso = (l: LinhaDaEtiqueta<T>) =>
    l.tipo === "subtitulo" ? 1 : Math.min(capacidade, pesoDaLinha(linhaDaLista(l.peca, opcoes), opcoes.letrasPorLinha));
  const paginas: LinhaDaEtiqueta<T>[][] = [];
  let atual: LinhaDaEtiqueta<T>[] = [];
  let usado = 0;
  linhas.forEach((l, i) => {
    let precisa = peso(l);
    // O subtítulo reserva o lugar da peça seguinte.
    if (l.tipo === "subtitulo" && linhas[i + 1]) precisa += Math.min(capacidade - 1, peso(linhas[i + 1]));
    if (atual.length > 0 && usado + precisa > capacidade) { paginas.push(atual); atual = []; usado = 0; }
    atual.push(l);
    usado += peso(l);
  });
  if (atual.length > 0) paginas.push(atual);
  return paginas;
}

// ── Cópias e REAPROVEITAR ───────────────────────────────────────────────────

export const COPIAS_MAX = 4;
/** 1–4: colam dos dois lados do tubo; mais que isso é engano de digitação. */
export const limitarCopias = (n: unknown) => {
  const v = Math.floor(Number(n));
  return Number.isFinite(v) ? Math.min(COPIAS_MAX, Math.max(1, v)) : 1;
};
/** Repete a sequência INTEIRA (1,2,1,2): cada jogo sai junto da impressora. */
export const comCopias = <T,>(paginas: T[], copias: number): T[] =>
  Array.from({ length: limitarCopias(copias) }, () => paginas).flat();

/** Alguma peça é de reaproveitamento? Lê os dois campos do cadastro; se a API
 *  não os mandar, devolve false e vale o interruptor manual. */
export const temReaproveitamento = (pecas: Array<{ isReuse?: boolean | null; reuseQty?: number | null }>) =>
  pecas.some((p) => p?.isReuse === true || Number(p?.reuseQty ?? 0) > 0);

// ── Preferências (lembradas por navegador) ──────────────────────────────────

export type PreferenciasDaEtiqueta = { mostrarQuantidade: boolean; tamanho: TamanhoEtiqueta; copias: number };
export const PREFERENCIAS_PADRAO: PreferenciasDaEtiqueta = { mostrarQuantidade: true, tamanho: TAMANHO_PADRAO, copias: 1 };
const CHAVE = "grafica:etiqueta-lista:v1";

/** Aba anônima, storage bloqueado ou JSON estragado: cai no padrão, sem erro. */
export function lerPreferencias(): PreferenciasDaEtiqueta {
  try {
    const cru = JSON.parse(window.localStorage.getItem(CHAVE) ?? "null");
    if (!cru || typeof cru !== "object") return { ...PREFERENCIAS_PADRAO };
    return {
      mostrarQuantidade: typeof cru.mostrarQuantidade === "boolean" ? cru.mostrarQuantidade : PREFERENCIAS_PADRAO.mostrarQuantidade,
      tamanho: ORDEM_DOS_TAMANHOS.includes(cru.tamanho) ? cru.tamanho : PREFERENCIAS_PADRAO.tamanho,
      copias: limitarCopias(cru.copias),
    };
  } catch {
    return { ...PREFERENCIAS_PADRAO };
  }
}
export function gravarPreferencias(p: PreferenciasDaEtiqueta) {
  try { window.localStorage.setItem(CHAVE, JSON.stringify(p)); } catch { /* sem storage: a preferência vale só nesta visita */ }
}

// ── O cabeçalho: texto de cima + PALAVRA GIGANTE ────────────────────────────

/** Cidades de mais de uma palavra que aparecem no FIM do nome do evento. A
 *  comparação ignora caixa e acento ("sao paulo" casa). Lista curta de
 *  propósito: o campo é editável, isto só acerta o padrão dos casos comuns. */
const CIDADES_COMPOSTAS = [
  "Rio de Janeiro", "São Paulo", "Porto Alegre", "Belo Horizonte", "Campo Grande", "João Pessoa", "Porto Velho",
  "Rio Branco", "Boa Vista", "São Luís", "Juiz de Fora", "Ribeirão Preto", "São José dos Campos", "Santo André",
  "São Bernardo do Campo", "Foz do Iguaçu", "Caxias do Sul", "Balneário Camboriú", "Vila Velha", "Nova Lima",
  "Governador Valadares", "Montes Claros", "Poços de Caldas", "Sete Lagoas", "Ouro Preto", "Cabo Frio",
];
export const semAcento = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/**
 * O padrão do cabeçalho a partir do NOME do evento (dono, 22/09: "teste 3"
 * saiu como "TESTE" pequeno e um "3" gigante). Regras, nesta ordem:
 *  1. cidade composta conhecida no fim do nome → ela inteira é a gigante;
 *  2. última palavra numérica ("Etapa 2", "Vale 2026") ou de 1–2 letras → a
 *     gigante é o NOME INTEIRO (um "3" enorme não identifica nada na pilha);
 *  3. senão, a última palavra (a cidade, no modelo do dono).
 * Continua editável na tela — nenhuma regra automática acerta todos.
 */
export function cabecalhoPadrao(nomeDoEvento: string | null | undefined): { prefixo: string; gigante: string } {
  const nome = String(nomeDoEvento ?? "").replace(/\s+/g, " ").trim();
  if (!nome) return { prefixo: "", gigante: "" };
  const plano = semAcento(nome);
  for (const cidade of CIDADES_COMPOSTAS) {
    const c = semAcento(cidade);
    if (plano === c) return { prefixo: "", gigante: nome };
    if (plano.endsWith(` ${c}`)) return { prefixo: nome.slice(0, nome.length - c.length).trim(), gigante: nome.slice(nome.length - c.length) };
  }
  const palavras = nome.split(" ");
  const ultima = palavras[palavras.length - 1];
  if (palavras.length === 1 || /^\d+$/.test(ultima) || ultima.length <= 2) return { prefixo: "", gigante: nome };
  return { prefixo: palavras.slice(0, -1).join(" "), gigante: ultima };
}

/** O texto de cima quando a pessoa editou SÓ a gigante: o nome sem ela (sem
 *  olhar a caixa). Gigante que não está no nome → o nome inteiro fica em cima. */
export function prefixoPara(nomeDoEvento: string | null | undefined, gigante: string) {
  const nome = String(nomeDoEvento ?? "").replace(/\s+/g, " ").trim();
  const g = gigante.trim();
  if (!g) return nome;
  const idx = nome.toLowerCase().lastIndexOf(g.toLowerCase());
  return idx >= 0 ? (nome.slice(0, idx) + nome.slice(idx + g.length)).replace(/\s+/g, " ").trim() : nome;
}

// ── O resumo do que vai sair, em linguagem de gente ─────────────────────────

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

export type ContaDaImpressao = {
  /** Etiquetas individuais (A4, duas por folha) e as folhas que ocupam. */
  etiquetas: number; folhasIndividuais: number;
  /** Listas (já multiplicadas pelas cópias), peças dentro delas e o papel. */
  listas: number; pecasEmLista: number; tamanho: TamanhoEtiqueta;
};

/**
 * "Vai imprimir: 2 listas em Adesivo 10×15 cm (34 peças) e 5 etiquetas
 * individuais em A4 (3 folhas) — 2 impressões separadas". O aviso das duas
 * impressões só aparece quando os papéis são DIFERENTES: lista em A4 sai junto.
 */
export function resumoDaImpressao(c: ContaDaImpressao): { texto: string; impressoesSeparadas: boolean } {
  const partes: string[] = [];
  if (c.listas > 0) partes.push(`${plural(c.listas, "lista", "listas")} em ${nomeDoPapel(c.tamanho)} (${plural(c.pecasEmLista, "peça", "peças")})`);
  if (c.etiquetas > 0) partes.push(`${plural(c.etiquetas, "etiqueta individual", "etiquetas individuais")} em A4 (${plural(c.folhasIndividuais, "folha", "folhas")})`);
  if (partes.length === 0) return { texto: "Nada para imprimir ainda.", impressoesSeparadas: false };
  const impressoesSeparadas = c.listas > 0 && c.etiquetas > 0 && c.tamanho !== "a4";
  return { texto: `Vai imprimir: ${partes.join(" e ")}${impressoesSeparadas ? " — 2 impressões separadas" : ""}`, impressoesSeparadas };
}

/** Lista curta perdida numa folha grande: vale sugerir o adesivo? Só quando
 *  TUDO cabe numa etiqueta de adesivo (senão a troca multiplicaria páginas). */
export function cabeNoAdesivo<T extends PecaDaLista>(linhas: LinhaDaEtiqueta<T>[], opcoes: { comTubo: boolean; mostrarQuantidade?: boolean }) {
  const m = TAMANHOS.adesivo;
  return linhas.length > 0 && paginarLinhas(linhas, {
    capacidade: opcoes.comTubo ? m.linhasComTubo : m.linhasSemTubo, letrasPorLinha: m.letrasPorLinha, mostrarQuantidade: opcoes.mostrarQuantidade,
  }).length === 1;
}

/** O papel em texto corrido ("Adesivo 10×15 cm"): o "(em pé)" só ajuda no
 *  seletor; em resumo e legenda é ruído. */
export const nomeDoPapel = (t: TamanhoEtiqueta) => (TAMANHOS[t] ?? TAMANHOS[TAMANHO_PADRAO]).rotulo.replace(" (em pé)", "");
