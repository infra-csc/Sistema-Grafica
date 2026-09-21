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
