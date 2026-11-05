// O BOOK AUTOMÁTICO (dono e equipe, 04/11): "as artes atualizam o tempo todo e não
// podemos depender de uma ação manual". Regras puras: de qual seção é cada peça, a
// ordem das páginas e como as artes ocupam a página.
//
// Tudo aqui nasceu da análise dos 296 books publicados (04/11): todos em A4 paisagem,
// capa com o logo do circuito, uma seção por página e o nome dela no rodapé. O dicionário
// classificou 92% das 7.901 peças só por tipo e descrição.
//
// O resultado é um RASCUNHO. Não manda e-mail, não muda o book das peças e não abre
// aprovação: serve para comparar com o book feito à mão até a equipe confiar nele.
// O que é montagem (o livro do palco, as mandalas) ainda precisa do modelo do Jan.

export const normalizarDoBook = (s: unknown): string =>
  String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

export type SecaoDoBook = string;

const POR_TIPO: ReadonlyArray<readonly [SecaoDoBook, RegExp]> = [
  ["Gradil", /^2x1|gradil/],
  ["Rolo", /^rolo/],
  ["Faixa", /faixa/],
  ["Testeira Bem-vindo & Até Logo", /bem vind|ate logo|boas vindas/],
  ["Pórtico", /portico|potico/],
  ["Palco", /palco|^backdrop$/],
  ["Estande", /^stand|estande|^testeira stand|^backdrop stand|^tenda/],
  ["Placas Balcão", /placas? (de )?balcao|^balcao/],
  ["Placa Km", /placas? (de )?km|percurso|^km /],
  ["Quadros de Fotos", /quadro|instagramavel/],
  ["Mandalas", /mandala/],
  ["Windbanner", /wind ?banner/],
  ["Ícone", /^icone/],
  ["Ativação", /ativac/],
  ["Retirada de Kit", /retirada|octanorm|roll ?up|^banner/],
  ["Totens", /toten|totem/],
  ["Prismas", /prisma/],
  ["Display", /display/],
  ["Testeiras", /testeira/],
  ["Letra Caixa", /letra caixa/],
];
// Arena e painel são genéricos: quem decide é a descrição.
const POR_DESCRICAO: ReadonlyArray<readonly [SecaoDoBook, RegExp]> = [
  ["Faixa", /faixa/], ["Gradil", /gradil|2x1/], ["Rolo", /rolo/], ["Pórtico", /portico/], ["Testeira Bem-vindo & Até Logo", /bem vind|ate logo/],
  ["Palco", /palco/], ["Estande", /stand|tenda|estande/], ["Placas Balcão", /balcao/], ["Placa Km", /\bkm\b|percurso/], ["Quadros de Fotos", /quadro/],
  ["Windbanner", /wind ?banner/], ["Totens", /totem|toten/], ["Ativação", /ativac/], ["Retirada de Kit", /retirada|octanorm|roll ?up/], ["Testeiras", /testeira/],
];
const GENERICO = /^(arena|painel|paineis|paineis moveis|paineis fixos)$/;

/** Medido nos books: tipos que a equipe praticamente nunca põe (0% a 14%). */
const NUNCA_NO_BOOK = /imantad|testeiras? metalon|prisma aereo|faixa de transito|adesivo|^diversos$|sanett|ultrabag|book completo/;
const PODIO = /num ?podio|numero de podio|^podio/;

export function secaoDaPeca(tipo: unknown, descricao: unknown): SecaoDoBook | null {
  const t = normalizarDoBook(tipo), d = normalizarDoBook(descricao);
  if (!GENERICO.test(t)) for (const [s, r] of POR_TIPO) if (r.test(t)) return s;
  for (const [s, r] of POR_DESCRICAO) if (r.test(d)) return s;
  return null;
}

export const motivoDeFicarFora = (tipo: unknown, descricao: unknown): string | null => {
  const t = normalizarDoBook(tipo), d = normalizarDoBook(descricao);
  if (NUNCA_NO_BOOK.test(t) || NUNCA_NO_BOOK.test(d)) return "Este tipo de peça não costuma entrar no book";
  if (PODIO.test(d) || PODIO.test(t)) return "Número de pódio não costuma entrar no book";
  return null;
};

/** Sequência mais comum nos books reais; o modelo do circuito tem prioridade. */
export const ORDEM_PADRAO: readonly SecaoDoBook[] = [
  "Palco", "Pórtico", "Testeira Bem-vindo & Até Logo", "Gradil", "Rolo", "Faixa", "Estande", "Quadros de Fotos", "Mandalas",
  "Placas Balcão", "Placa Km", "Windbanner", "Ícone", "Ativação", "Retirada de Kit", "Totens", "Prismas", "Display", "Testeiras", "Letra Caixa",
];
/** Quando há modelo, estas só entram se o circuito costuma mostrar. */
const OPCIONAIS: ReadonlySet<SecaoDoBook> = new Set(["Testeiras", "Display", "Prismas", "Ícone", "Ativação", "Totens", "Letra Caixa", "Windbanner", "Retirada de Kit"]);
const POR_PAGINA: Record<string, number> = { Gradil: 30, Rolo: 30, "Placa Km": 18 };
const POR_PAGINA_PADRAO = 8;

export type PecaDoBook = { id: string; displayId: string | null; tipo: string; descricao: string | null; thumb: string | null };
export type ModeloDoBook = { rotulos: readonly string[] };
export type PaginaPlanejada = { rotulo: string; secao: SecaoDoBook; pecas: PecaDoBook[]; conferir: string | null; portico?: boolean };
export type PlanoDoBook = {
  paginas: PaginaPlanejada[];
  fora: Array<{ id: string; displayId: string | null; tipo: string; descricao: string | null; motivo: string }>;
};

const titulo = (s: string) => s.split(" ").filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
const comparar = (a: string, b: string) => a.localeCompare(b, "pt-BR", { numeric: true, sensitivity: "base" });
const numeroDoKm = (p: PecaDoBook): number => { const m = /km\s*(\d+)/.exec(normalizarDoBook(p.descricao)); return m ? Number(m[1]) : 9999; };
const quemEDoEstande = (p: PecaDoBook) => normalizarDoBook(p.descricao).replace(/\b(testeira|backdrop|stand|stands|estande|tenda|espaco|area de|\d+x\d+)\b/g, " ").replace(/\s+/g, " ").trim() || "geral";
/** O nome como foi digitado: "DHL" continua "DHL". */
const nomeDoEstande = (p: PecaDoBook) => String(p.descricao ?? "").replace(/(^|\s)(testeira|backdrop|stands?|estande|tenda|espa[cç]o|[aá]rea de|\d+x\d+)(?=\s|$)/gi, " ").replace(/\s+/g, " ").trim();

const rotuloDeUmTipo = (base: string, tipo: string, p: PecaDoBook) => {
  const resto = tipo.replace(/^(icone|ativacao)\s*/, "").trim();
  const nome = resto ? titulo(resto) : titulo(normalizarDoBook(p.descricao).replace(/^(icone|ativacao)\s*/, ""));
  return nome ? `${base.split(/\s*[-–]\s*/)[0]} - ${nome}` : base;
};

export function planejarBook(pecas: readonly PecaDoBook[], modelo?: ModeloDoBook | null): PlanoDoBook {
  const fora: PlanoDoBook["fora"] = [];
  const sair = (p: PecaDoBook, motivo: string) => fora.push({ id: p.id, displayId: p.displayId, tipo: p.tipo, descricao: p.descricao, motivo });

  const rotulos = modelo?.rotulos ?? [];
  const secoesDoModelo: SecaoDoBook[] = [];
  const rotuloDaSecao = new Map<SecaoDoBook, string>();
  for (const r of rotulos) { const s = secaoDaPeca(r, ""); if (!s) continue; if (!secoesDoModelo.includes(s)) { secoesDoModelo.push(s); rotuloDaSecao.set(s, r); } }
  const prefixoDoEstande = (rotuloDaSecao.get("Estande") ?? "Estande").split(/\s*[-–]\s*/)[0].trim() || "Estande";

  const grupos = new Map<SecaoDoBook, PecaDoBook[]>();
  for (const p of pecas) {
    const motivo = motivoDeFicarFora(p.tipo, p.descricao);
    if (motivo) { sair(p, motivo); continue; }
    const s = secaoDaPeca(p.tipo, p.descricao);
    if (!s) { sair(p, "Não reconheci a seção desta peça"); continue; }
    if (secoesDoModelo.length > 0 && OPCIONAIS.has(s) && !secoesDoModelo.includes(s)) { sair(p, "Este circuito não costuma mostrar esta seção"); continue; }
    if (!p.thumb) { sair(p, "Peça ainda sem thumb"); continue; }
    if (!grupos.has(s)) grupos.set(s, []);
    grupos.get(s)!.push(p);
  }

  const ordem = [...secoesDoModelo, ...ORDEM_PADRAO.filter((s) => !secoesDoModelo.includes(s))];
  const paginas: PaginaPlanejada[] = [];
  const rotuloDe = (s: SecaoDoBook) => rotuloDaSecao.get(s) ?? s;
  for (const s of ordem) {
    const g = grupos.get(s);
    if (!g) continue;
    if (s === "Estande") {
      const por = new Map<string, PecaDoBook[]>();
      for (const p of g) { const k = quemEDoEstande(p); if (!por.has(k)) por.set(k, []); por.get(k)!.push(p); }
      const chaves = Array.from(por.keys()).sort((a, b) => Number(/relax/.test(b)) - Number(/relax/.test(a)) || comparar(a, b));
      for (const k of chaves) {
        const itens = por.get(k)!.slice().sort((a, b) => Number(!/testeira/.test(normalizarDoBook(a.descricao))) - Number(!/testeira/.test(normalizarDoBook(b.descricao))));
        paginas.push({ rotulo: k === "geral" ? prefixoDoEstande : `${prefixoDoEstande} - ${nomeDoEstande(itens[0]) || titulo(k)}`, secao: s, pecas: itens, conferir: null });
      }
      continue;
    }
    if (s === "Pórtico") {
      const por = new Map<string, PecaDoBook[]>();
      for (const p of g) { const k = normalizarDoBook(p.tipo); if (!por.has(k)) por.set(k, []); por.get(k)!.push(p); }
      for (const itens of Array.from(por.values())) {
        // Frente e verso da mesma parte: o book mostra uma face só. Parte que só existe
        // como "verso" fica: era a testeira do Night Run Rio.
        const porParte = new Map<string, PecaDoBook>();
        for (const p of itens) {
          const parte = normalizarDoBook(p.descricao).replace(/\b(frente|verso)\b/g, " ").replace(/\s+/g, " ").trim();
          const atual = porParte.get(parte);
          if (!atual || (/verso/.test(normalizarDoBook(atual.descricao)) && !/verso/.test(normalizarDoBook(p.descricao)))) porParte.set(parte, p);
        }
        const usados = Array.from(porParte.values());
        paginas.push({ rotulo: rotuloDe(s), secao: s, pecas: usados, portico: true, conferir: usados.some((p) => /aplique/.test(normalizarDoBook(p.descricao))) ? "O aplique é colocado por regra: confira a posição" : null });
      }
      continue;
    }
    if (s === "Mandalas") {
      const frentes = g.filter((p) => /frente|medalha/.test(normalizarDoBook(p.descricao)));
      paginas.push({ rotulo: rotuloDe(s), secao: s, pecas: frentes.length > 0 ? frentes : g, conferir: "A montagem da mandala é feita à mão: aqui só as medalhas" });
      continue;
    }
    if (s === "Quadros de Fotos" || s === "Ícone" || s === "Ativação") {
      const por = new Map<string, PecaDoBook[]>();
      for (const p of g) { const k = normalizarDoBook(p.tipo); if (!por.has(k)) por.set(k, []); por.get(k)!.push(p); }
      for (const [k, itens] of Array.from(por.entries())) paginas.push({ rotulo: s === "Quadros de Fotos" ? rotuloDe(s) : rotuloDeUmTipo(rotuloDe(s), k, itens[0]), secao: s, pecas: itens, conferir: s === "Ícone" && itens.length > 1 ? "A montagem do ícone é feita à mão: aqui as partes separadas" : null });
      continue;
    }
    const ordenadas = s === "Placa Km" ? g.slice().sort((a, b) => numeroDoKm(a) - numeroDoKm(b) || comparar(a.descricao ?? "", b.descricao ?? "")) : g;
    const teto = POR_PAGINA[s] ?? POR_PAGINA_PADRAO;
    for (let i = 0; i < ordenadas.length; i += teto) {
      paginas.push({ rotulo: rotuloDe(s), secao: s, pecas: ordenadas.slice(i, i + teto), conferir: s === "Palco" && ordenadas.length > 1 ? "A montagem do palco é feita à mão: aqui as partes separadas" : null });
    }
  }
  return { paginas, fora };
}

// ── Como as artes ocupam a página ──────────────────────────────────────────
export type ArteMedida = { w: number; h: number };
export type Posicao<T> = { arte: T; x: number; y: number; w: number; h: number };
// Medido em 1.586 páginas: vão de 1,5% da largura, 99% das páginas centradas.
const VAO = 12;

/**
 * Quantas artes por linha cada seção usa nos books reais, da mais comum para a menos.
 * Gradil: 3+3+1 · Rolo: uma coluna, duas se forem muitos · Quadros: 2+2, 3+3 ·
 * Mandalas: sempre 2+2 · Estande e testeiras: empilhados · Windbanner, prismas, totens: uma linha.
 */
export function preferenciaDaSecao(secao: SecaoDoBook, n: number): number[] {
  switch (secao) {
    case "Gradil": return [3, 4, 5, 6, 7];
    case "Rolo": return [1, 2, 3];
    case "Quadros de Fotos": return n <= 4 ? [2, 3] : [3, 4];
    case "Placas Balcão": return n <= 4 ? [2, 3] : [3, 4, 5];
    case "Mandalas": return [2, 4];
    case "Estande": case "Testeira Bem-vindo & Até Logo": case "Testeiras": case "Faixa": case "Palco": return [1, 2];
    case "Windbanner": case "Prismas": case "Totens": case "Display": case "Retirada de Kit": return [n, Math.ceil(n / 2)];
    case "Placa Km": return [4, 3, 5, 6, 7];
    default: return [];
  }
}

/**
 * Linhas justificadas, sem cortar nem esticar a arte. Usa o arranjo preferido da seção,
 * a não ser que ele deixe as artes pequenas demais perto do melhor possível.
 */
export function arranjarNaPagina<T extends ArteMedida>(artes: readonly T[], W: number, H: number, tetoDaArea = 0.62, preferencia: readonly number[] = []): Posicao<T>[] {
  const n = artes.length;
  if (n === 0) return [];
  const candidatos: Array<{ area: number; porLinha: number; linhas: T[][]; alturas: number[]; escala: number }> = [];
  let melhor: { area: number; linhas: T[][]; alturas: number[]; escala: number } | null = null;
  const opcoes = Array.from(new Set(Array.from({ length: Math.min(n, 12) }, (_, i) => i + 1)));
  for (const porLinha of opcoes) {
    const linhas: T[][] = [];
    for (let i = 0; i < n; i += porLinha) linhas.push(artes.slice(i, i + porLinha) as T[]);
    const brutas = linhas.map((l) => (W - VAO * (porLinha - 1)) / l.reduce((a, x) => a + x.w / x.h, 0));
    // Linha incompleta não estica além das cheias.
    const alturas = brutas.map((h, i) => (linhas[i].length < porLinha ? Math.min(h, brutas[0]) : h));
    // Os vãos não encolhem com a escala: só as artes dividem o que sobra.
    const vaos = VAO * (linhas.length - 1);
    let escala = Math.min(1, Math.max(H - vaos, 1) / alturas.reduce((a, b) => a + b, 0));
    const maior = Math.max(...linhas.flatMap((l, i) => l.map((x) => (alturas[i] * escala) ** 2 * (x.w / x.h))));
    const limite = tetoDaArea * W * H;
    if (maior > limite) escala *= Math.sqrt(limite / maior);
    const area = linhas.reduce((a, l, i) => a + l.reduce((b, x) => b + (alturas[i] * escala) ** 2 * (x.w / x.h), 0), 0);
    candidatos.push({ area, porLinha, linhas, alturas, escala });
    if (!melhor || area > melhor.area) melhor = { area, linhas, alturas, escala };
  }
  for (const p of preferencia) {
    const c = candidatos.find((x) => x.porLinha === Math.min(p, n));
    if (c && c.area >= melhor!.area * 0.55) { melhor = c; break; }
  }
  const { linhas, alturas, escala } = melhor!;
  const total = alturas.reduce((a, b) => a + b * escala, 0) + VAO * (linhas.length - 1);
  let y = Math.max(0, (H - total) / 2);
  const pos: Posicao<T>[] = [];
  linhas.forEach((l, i) => {
    const h = alturas[i] * escala;
    const larg = l.reduce((a, x) => a + (h * x.w) / x.h, 0) + VAO * (l.length - 1);
    let x = (W - larg) / 2;
    for (const arte of l) { const w = (h * arte.w) / arte.h; pos.push({ arte, x, y, w, h }); x += w + VAO; }
    y += h + VAO;
  });
  return pos;
}

/** Testeira em cima, laterais descendo e aplique no centro. Null se faltar parte. */
export function montarPortico<T extends ArteMedida & { descricao: string | null }>(artes: readonly T[], W: number, H: number): Posicao<T>[] | null {
  const tem = (a: T, r: RegExp) => r.test(normalizarDoBook(a.descricao));
  const testeira = artes.find((a) => tem(a, /testeira/));
  const maior = (r: RegExp) => artes.filter((a) => tem(a, r)).sort((a, b) => b.h - a.h)[0];
  const esq = maior(/\besq|esquerd/);
  const dir = maior(/\bdir|direit/);
  if (!testeira || !esq || !dir) return null;
  const aplique = artes.find((a) => tem(a, /aplique/));
  let larg = W * 0.86;
  let hT = (larg * testeira.h) / testeira.w;
  let wL = larg * 0.145;
  let hL = (wL * esq.h) / esq.w;
  const altura = hT + hL * 0.98;
  if (altura > H) { const e = H / altura; larg *= e; hT *= e; wL *= e; hL *= e; }
  const x0 = (W - larg) / 2, y0 = (H - (hT + hL * 0.98)) / 2;
  const pos: Posicao<T>[] = [
    { arte: testeira, x: x0, y: y0, w: larg, h: hT },
    { arte: esq, x: x0, y: y0 + hT * 0.98, w: wL, h: hL },
    { arte: dir, x: x0 + larg - wL, y: y0 + hT * 0.98, w: wL, h: hL },
  ];
  if (aplique) { const d = hT * 1.25; pos.push({ arte: aplique, x: x0 + larg / 2 - d / 2, y: y0 - d * 0.1, w: d, h: (d * aplique.h) / aplique.w }); }
  return pos;
}

// ── Qual book serve de modelo ──────────────────────────────────────────────
/** O circuito: o nome do evento sem a cidade. */
export function circuitoDoEvento(nome: unknown): string {
  const n = normalizarDoBook(nome);
  const conhecidos: ReadonlyArray<readonly [string, RegExp]> = [
    ["night run", /night ?run/], ["eco run", /eco ?run/], ["circuito das estacoes", /estacoes/], ["blue run", /blue ?run/], ["girl power", /girl ?power/],
    ["longevidade", /longevidade/], ["meia de sampa", /meia de sampa/], ["s run", /^s ?run/], ["desafio petrobras", /petrobras|desafio energia/],
    ["circuito banco do brasil", /banco do brasil/], ["primavera", /^primavera/], ["circuitinho", /^circuitinho/], ["dpsp run", /^dpsp/], ["netshoes", /^netshoes/],
  ];
  for (const [c, r] of conhecidos) if (r.test(n)) return c;
  return n.split(" ").slice(0, 2).join(" ");
}

export type MudancasDoBook = { novas: string[]; trocadas: string[]; saiu: string[] };
/** O que mudou entre duas versões: peça → thumb. */
export function compararVersoes(antes: Record<string, { d: string | null; t: string | null }>, agora: Record<string, { d: string | null; t: string | null }>): MudancasDoBook {
  const nome = (m: Record<string, { d: string | null }>, id: string) => m[id].d ?? id;
  return {
    novas: Object.keys(agora).filter((id) => !antes[id]).map((id) => nome(agora, id)),
    trocadas: Object.keys(agora).filter((id) => antes[id] && antes[id].t !== agora[id].t).map((id) => nome(agora, id)),
    saiu: Object.keys(antes).filter((id) => !agora[id]).map((id) => nome(antes, id)),
  };
}
