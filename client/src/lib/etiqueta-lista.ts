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

export type PecaDaLista = {
  id?: string; type?: string | null; description?: string | null; quantity?: number | null;
  /** EMBALAGEM COM QUANTIDADE (21/09): quanto da peça está NAQUELE tubo. Quando
   *  vem, é ESTA a quantidade da linha — e "(7 de 10)" avisa que a peça está
   *  dividida (o resto foi, ou vai, em outro tubo). */
  quantidadeNoTubo?: number | null;
};

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
  const noTubo = Number(p.quantidadeNoTubo) > 0 ? Number(p.quantidadeNoTubo) : null;
  if (noTubo === null) return `${nome} - ${p.quantity ?? 1}`;
  const total = Number(p.quantity) || noTubo;
  return noTubo < total ? `${nome} - ${noTubo} (${noTubo} de ${total})` : `${nome} - ${noTubo}`;
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

// ── Linhas e paginação ──────────────────────────────────────────────────────

/** Uma linha da etiqueta em lista: uma peça. (Até 21/09 havia também o
 *  SUBTÍTULO de grupo por tipo — "2X1", "PLACA DE OCTANORME" com traço. O dono
 *  pediu "tirar grupo, apenas nome do item": a lista é só de peças.) */
export type LinhaDaEtiqueta<T> = { tipo: "peca"; peca: T };

const comparar = (a: string, b: string) => a.localeCompare(b, "pt-BR", { numeric: true, sensitivity: "base" });

/**
 * A ORDEM da lista, sem cabeçalho de grupo: os 2x1 primeiro (é o grosso do
 * tubo), depois os demais tipos em ordem alfabética; dentro do tipo, pela
 * descrição ("2x1 BB", "2x1 Lei", "2x1 Nubank"). Empate: a ordem que chegou.
 * Vale para a lista do evento E para a do tubo.
 */
export function linhasOrdenadas<T extends PecaDaLista>(pecas: T[]): LinhaDaEtiqueta<T>[] {
  return pecas
    .map((peca, i) => ({ peca, i }))
    .sort((x, y) => {
      const tx = String(x.peca.type ?? "").trim();
      const ty = String(y.peca.type ?? "").trim();
      return ((ehDoisPorUm({ type: tx }) ? 0 : 1) - (ehDoisPorUm({ type: ty }) ? 0 : 1))
        || comparar(tx, ty)
        || comparar(linhaDaLista(x.peca, { mostrarQuantidade: false }), linhaDaLista(y.peca, { mostrarQuantidade: false }))
        || x.i - y.i;
    })
    .map(({ peca }) => ({ tipo: "peca" as const, peca }));
}

/** Linha longa quebra em duas (ou mais) no papel — pesa isso na paginação. */
export const pesoDaLinha = (texto: string, letrasPorLinha: number) =>
  Math.max(1, Math.ceil(String(texto ?? "").length / Math.max(1, letrasPorLinha)));

/** Quebra as linhas em ETIQUETAS ("Tubo 2 · 1 de 2"), pesando a linha longa. */
export function paginarLinhas<T extends PecaDaLista>(
  linhas: LinhaDaEtiqueta<T>[],
  opcoes: { capacidade: number; letrasPorLinha: number; mostrarQuantidade?: boolean },
): LinhaDaEtiqueta<T>[][] {
  const capacidade = Math.max(2, Math.floor(opcoes.capacidade) || 2);
  const peso = (l: LinhaDaEtiqueta<T>) => Math.min(capacidade, pesoDaLinha(linhaDaLista(l.peca, opcoes), opcoes.letrasPorLinha));
  const paginas: LinhaDaEtiqueta<T>[][] = [];
  let atual: LinhaDaEtiqueta<T>[] = [];
  let usado = 0;
  for (const l of linhas) {
    const precisa = peso(l);
    if (atual.length > 0 && usado + precisa > capacidade) { paginas.push(atual); atual = []; usado = 0; }
    atual.push(l);
    usado += precisa;
  }
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
  /** LISTAS POR TUBO (21/09): quantas etiquetas (com as cópias), de quais
   *  tubos, e quantas linhas de peça levam. */
  listasDeTubo?: number; tubos?: number[]; pecasEmTubos?: number;
};

/** [2] → "Tubo 2"; [1, 2, 3] → "Tubos 1, 2 e 3". */
export const rotuloDosTubos = (tubos: number[]) =>
  tubos.length === 1 ? `Tubo ${tubos[0]}` : `Tubos ${juntar(tubos.map(String))}`;
const juntar = (partes: string[]) => partes.length <= 1 ? partes.join("") : `${partes.slice(0, -1).join(", ")} e ${partes[partes.length - 1]}`;

/**
 * "Vai imprimir: 2 listas de tubo em Adesivo 10×15 cm (Tubos 1 e 2 · 12
 * peças), 1 lista em Adesivo 10×15 cm (34 peças) e 5 etiquetas individuais em
 * A4 (3 folhas) — 2 impressões separadas". O aviso das duas impressões só
 * aparece quando os papéis são DIFERENTES: lista em A4 sai junto.
 */
export function resumoDaImpressao(c: ContaDaImpressao): { texto: string; impressoesSeparadas: boolean } {
  const partes: string[] = [];
  const listasDeTubo = c.listasDeTubo ?? 0;
  if (listasDeTubo > 0) {
    const quais = [c.tubos?.length ? rotuloDosTubos(c.tubos) : null, plural(c.pecasEmTubos ?? 0, "peça", "peças")].filter(Boolean).join(" · ");
    partes.push(`${plural(listasDeTubo, "lista de tubo", "listas de tubo")} em ${nomeDoPapel(c.tamanho)} (${quais})`);
  }
  if (c.listas > 0) partes.push(`${plural(c.listas, "lista", "listas")} em ${nomeDoPapel(c.tamanho)} (${plural(c.pecasEmLista, "peça", "peças")})`);
  if (c.etiquetas > 0) partes.push(`${plural(c.etiquetas, "etiqueta individual", "etiquetas individuais")} em A4 (${plural(c.folhasIndividuais, "folha", "folhas")})`);
  if (partes.length === 0) return { texto: "Nada para imprimir ainda.", impressoesSeparadas: false };
  const impressoesSeparadas = (c.listas > 0 || listasDeTubo > 0) && c.etiquetas > 0 && c.tamanho !== "a4";
  return { texto: `Vai imprimir: ${juntar(partes)}${impressoesSeparadas ? " — 2 impressões separadas" : ""}`, impressoesSeparadas };
}

/** Lista curta perdida numa folha grande: vale sugerir o adesivo? Só quando
 *  TUDO cabe numa etiqueta de adesivo (senão a troca multiplicaria páginas).
 *  `comRodape`: a linha "N peças · M un." da etiqueta do tubo ocupa uma linha. */
export function cabeNoAdesivo<T extends PecaDaLista>(linhas: LinhaDaEtiqueta<T>[], opcoes: { comTubo: boolean; comRodape?: boolean; mostrarQuantidade?: boolean }) {
  const m = TAMANHOS.adesivo;
  return linhas.length > 0 && paginarLinhas(linhas, {
    capacidade: (opcoes.comTubo ? m.linhasComTubo : m.linhasSemTubo) - (opcoes.comRodape ? 1 : 0), letrasPorLinha: m.letrasPorLinha, mostrarQuantidade: opcoes.mostrarQuantidade,
  }).length === 1;
}

// ── O TUBO NA ETIQUETA (dono, 21/09: "aparecer informação de tubo") ─────────
//
// Cada peça chega de /api/items com `tuboVolumes: [{ tuboId, numero, avulso,
// quantidade }]` (ver server/services/tubosDaPeca.ts). A peça vira PARTES: uma
// por volume em que está, mais o RESTO que ainda não foi embalado. Peça fora
// de tubo é uma parte só, sem tubo — e tudo continua como era.

export type VolumeDaPeca = { tuboId?: string | null; numero?: number | null; avulso?: boolean | null; quantidade?: number | null };
export type PecaComTubo = PecaDaLista & {
  tuboVolumes?: VolumeDaPeca[] | null; tuboId?: string | null; tuboNumero?: number | null; tuboAvulso?: boolean | null; embaladaQty?: number | null;
};

export type ParteDaPeca<T> = {
  peca: T;
  /** Identidade estável da parte (a edição de números se prende a ela). */
  chave: string;
  tuboId: string | null;
  /** Número REAL do tubo; null = sem tubo (não embalada, ou embalada sozinha). */
  numero: number | null;
  /** Embalada SOZINHA (número negativo no banco): "EMBALADA", nunca "TUBO". */
  avulso: boolean;
  /** Quanto da peça está nesta parte (depois da edição, se houver). */
  quantidade: number;
  /** A mesma quantidade ANTES da edição — o "voltar ao original". */
  original: number;
  /** Quanto da peça existe somando todas as partes (depois da edição). */
  total: number;
  /** Onde a parte começa na contagem das unidades da peça (0-based) — "uma
   *  por unidade" numera a peça inteira e cada unidade leva o tubo da faixa. */
  inicio: number;
  /** O número do tubo que SAI na etiqueta (editável; não mexe no tubo). */
  numeroNaEtiqueta: number | null;
};

const inteiroPositivo = (v: unknown) => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n > 0 ? n : 0; };

/** As partes da peça, ANTES da edição: os tubos em ordem de número, depois a
 *  embalada sozinha, depois o resto fora de volume. */
export function partesDaPeca<T extends PecaComTubo>(p: T): ParteDaPeca<T>[] {
  const quantidade = inteiroPositivo(p.quantity) || 1;
  let volumes = Array.isArray(p.tuboVolumes) ? p.tuboVolumes.filter((v) => v && inteiroPositivo(v.quantidade) > 0) : [];
  // Sem a lista de volumes (rota antiga), vale o atalho do tubo principal.
  if (volumes.length === 0 && p.tuboNumero != null && Number.isFinite(Number(p.tuboNumero))) {
    volumes = [{ tuboId: p.tuboId ?? null, numero: Number(p.tuboNumero), avulso: p.tuboAvulso, quantidade: inteiroPositivo(p.embaladaQty) || quantidade }];
  }
  const partes = volumes
    .map((v) => {
      const avulso = v.avulso === true || Number(v.numero) < 0 || v.numero == null;
      const numero = avulso ? null : Number(v.numero);
      return { tuboId: v.tuboId ?? null, numero, avulso, quantidade: inteiroPositivo(v.quantidade), chave: `${p.id}|${v.tuboId ?? `n${v.numero}`}` };
    })
    .sort((a, b) => Number(a.avulso) - Number(b.avulso) || (a.numero ?? 0) - (b.numero ?? 0));
  const dentro = partes.reduce((s, v) => s + v.quantidade, 0);
  if (dentro < quantidade) partes.push({ tuboId: null, numero: null, avulso: false, quantidade: quantidade - dentro, chave: `${p.id}|fora` });
  const total = partes.reduce((s, v) => s + v.quantidade, 0);
  let inicio = 0;
  return partes.map((v) => {
    const parte = { ...v, peca: p, total, inicio, original: v.quantidade, numeroNaEtiqueta: v.numero };
    inicio += v.quantidade;
    return parte;
  });
}

// ── EDITAR NÚMEROS NA ETIQUETA (dono, 21/09) ────────────────────────────────
// "Opção de editar números na etiqueta (não afeta nada de status)": a
// quantidade de cada parte e o número de cada tubo podem ser trocados SÓ para
// a impressão. Nada disto vai ao servidor. Guarda-se o TEXTO digitado (o campo
// pode ficar vazio no meio da digitação); texto que não é número = o original.

export type EdicoesDaEtiqueta = { quantidades: Record<string, string>; tubos: Record<string, string> };
export const SEM_EDICOES: EdicoesDaEtiqueta = { quantidades: {}, tubos: {} };

/** O número que vale: o digitado, se for um inteiro ≥ 0; senão, o original. */
export const numeroEditado = (bruto: string | null | undefined, original: number) => {
  const t = String(bruto ?? "").trim();
  return /^\d{1,6}$/.test(t) ? Number(t) : original;
};
/** A chave do TUBO nas edições: o número editado vale para o tubo inteiro. */
export const chaveDoTubo = (pt: { tuboId: string | null; numero: number | null }) => pt.tuboId ?? `n${pt.numero}`;
export const foiEditado =(bruto: string | null | undefined, original: number) =>
  bruto != null && numeroEditado(bruto, original) !== original;

/** Aplica as edições às partes de UMA peça: quantidade por parte, número por
 *  tubo, e refaz o total e o início das faixas. */
export function comEdicoes<T>(partes: ParteDaPeca<T>[], edicoes: EdicoesDaEtiqueta): ParteDaPeca<T>[] {
  const editadas = partes.map((pt) => ({
    ...pt,
    quantidade: numeroEditado(edicoes.quantidades[pt.chave], pt.original),
    numeroNaEtiqueta: pt.numero != null ? numeroEditado(edicoes.tubos[chaveDoTubo(pt)], pt.numero) : pt.numero,
  }));
  const total = editadas.reduce((s, pt) => s + pt.quantidade, 0);
  let inicio = 0;
  return editadas.map((pt) => { const r = { ...pt, total, inicio }; inicio += pt.quantidade; return r; });
}

/** A peça como a LINHA da lista a vê: `quantity` é o total da peça e
 *  `quantidadeNoTubo` o que está nas partes daquela lista — "(7 de 10)" sai
 *  sozinho quando é só um pedaço. */
export function pecaNaLinha<T extends PecaDaLista>(partes: ParteDaPeca<T>[]): T {
  const p = partes[0].peca;
  const aqui = partes.reduce((s, pt) => s + pt.quantidade, 0);
  return { ...p, quantity: partes[0].total, quantidadeNoTubo: aqui } as T;
}

/** Uma etiqueta INDIVIDUAL: a parte, e — com "uma por unidade" — qual unidade. */
export type EtiquetaIndividual<T> = { parte: ParteDaPeca<T>; n: number; total: number };

/**
 * As individuais de um conjunto de partes. Sem "uma por unidade": UMA etiqueta
 * por parte (peça dividida em dois tubos = duas etiquetas, cada uma com o seu
 * tubo e a sua quantidade). Com: uma por unidade, numerada na PEÇA inteira
 * ("8 de 10"), cada uma com o tubo da sua faixa. Peça de 1 unidade não numera.
 */
export function etiquetasIndividuais<T>(partes: ParteDaPeca<T>[], porUnidade: boolean): EtiquetaIndividual<T>[] {
  if (!porUnidade) return partes.map((parte) => ({ parte, n: 0, total: 0 }));
  return partes.flatMap((parte) => {
    if (parte.total <= 1) return parte.quantidade > 0 ? [{ parte, n: 0, total: 0 }] : [];
    return Array.from({ length: parte.quantidade }, (_, k) => ({ parte, n: parte.inicio + k + 1, total: parte.total }));
  });
}

/** O que a etiqueta individual diz do volume: "TUBO 2" (+ "7 de 10 un. neste
 *  tubo" se dividida), "EMBALADA" (sozinha), ou nada (não embalada). */
export function infoDoVolume(parte: Pick<ParteDaPeca<unknown>, "numero" | "numeroNaEtiqueta" | "avulso" | "quantidade" | "total">) {
  const dividida = parte.quantidade < parte.total;
  if (parte.numero != null) return { selo: `TUBO ${parte.numeroNaEtiqueta ?? parte.numero}`, detalhe: dividida ? `${parte.quantidade} de ${parte.total} un. neste tubo` : null };
  if (parte.avulso) return { selo: "EMBALADA", detalhe: dividida ? `${parte.quantidade} de ${parte.total} un. nesta embalagem` : null };
  return { selo: null, detalhe: dividida ? `${parte.quantidade} de ${parte.total} un.` : null };
}

/** O RODAPÉ da etiqueta do tubo: "3 peças · 26 un. · embalado 21/09". */
export function rodapeDoTubo(pecas: number, unidades: number, embaladoEm?: string | Date | null) {
  const quando = embaladoEm ? new Date(embaladoEm) : null;
  const data = quando && !Number.isNaN(quando.getTime()) ? quando.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : null;
  return [plural(pecas, "peça", "peças"), `${unidades} un.`, data ? `embalado ${data}` : null].filter(Boolean).join(" · ");
}

/** O recorte "Tubo" de O que imprimir: todos · só os tubos · Tubo N · sem tubo. */
export type RecorteDeTubo = "todos" | "tubos" | "sem" | `${number}`;
export const lerRecorteDeTubo = (v: string | null | undefined): RecorteDeTubo =>
  v === "tubos" || v === "sem" || (typeof v === "string" && /^\d+$/.test(v)) ? (v as RecorteDeTubo) : "todos";
export const parteNoRecorte = (pt: Pick<ParteDaPeca<unknown>, "numero">, r: RecorteDeTubo) =>
  r === "todos" ? true : r === "tubos" ? pt.numero != null : r === "sem" ? pt.numero == null : pt.numero === Number(r);

/** O papel em texto corrido ("Adesivo 10×15 cm"): o "(em pé)" só ajuda no
 *  seletor; em resumo e legenda é ruído. */
export const nomeDoPapel = (t: TamanhoEtiqueta) => (TAMANHOS[t] ?? TAMANHOS[TAMANHO_PADRAO]).rotulo.replace(" (em pé)", "");
