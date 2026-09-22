// ─────────────────────────────────────────────────────────────────────────────
// BUSCAR ARTE JÁ FEITA (dono, 21/09).
//
// "Preciso ter como se fosse uma busca na arte para achar artes já feitas no
// app, para ele não precisar colocar o arquivo ou a thumb de novo e só
// referenciar — com o mesmo patrocinador e eventos 'parecidos', como
// Estações."
//
// O QUE É UM EVENTO PARECIDO. Os eventos são CIRCUITOS que se repetem por
// cidade: "Circuito das Estações 2026 Rio de Janeiro" e "Circuito das Estações
// 2026 São Paulo" são o mesmo circuito em praças diferentes, e a arte do mesmo
// patrocinador se repete entre eles. Então o nome do evento é comparado sem o
// que MUDA de praça para praça:
//   · o ANO (qualquer número de 4 dígitos) — o circuito é o mesmo em 2025 e
//     2026, e a arte antiga é justamente a que se quer reaproveitar;
//   · a ÚLTIMA palavra, que é a cidade ("…Rio de Janeiro" → "Janeiro",
//     "…São Paulo" → "Paulo", "…SP" → "SP");
//   · palavras de até 3 letras ("das", "de", "São", "Rio", "SP"), que são
//     ligação ou sobra de cidade e casariam qualquer par por acaso.
// Sobra o miolo — "circuito estacoes" nos dois — e é isso que se compara.
//
// POR QUE ISTO É PURO (sem banco): a rota decide com estas funções e a tela
// explica com as MESMAS palavras nos selos ("mesmo patrocinador", "evento
// parecido"). Régua única, e testável sozinha (server/__tests__/
// buscar-arte-ja-feita.test.ts).
//
// O QUE ESTE MÓDULO NÃO DECIDE: quem pode ver a peça (papel e visibilidade do
// Kit são da rota) nem o que acontece ao reaproveitar — reaproveitar grava a
// URL pelo caminho de sempre (update-thumb / submit-for-approval /
// submit-final-file), com os mesmos efeitos e a mesma trilha.
// ─────────────────────────────────────────────────────────────────────────────

/** Sem acento, sem caixa, espaços únicos — a régua de comparação de texto. */
export function normalizarTexto(v: string | null | undefined): string {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Palavras de até 3 letras não distinguem nada ("das", "de", "São", "SP"). */
const CURTA = 3;

/**
 * O MIOLO do nome do evento: sem ano, sem cidade (última palavra) e sem
 * palavras curtas. A última palavra só cai quando sobra outra — "Réveillon"
 * sozinho continua sendo "reveillon", e não nada.
 */
export function mioloDoEvento(nome: string | null | undefined): string[] {
  const palavras = normalizarTexto(nome).split(" ").filter(Boolean);
  // O ano sai ANTES de tirar a cidade: em "Circuito 2026 Rio" a cidade é
  // "rio" (a última palavra de verdade), não o ano.
  const semAno = palavras.filter((p) => !/^\d{4}$/.test(p));
  // Com duas palavras já se corta: "Estações Curitiba" e "Estações Salvador"
  // são o mesmo circuito. Só o nome de UMA palavra fica inteiro.
  const semCidade = semAno.length >= 2 ? semAno.slice(0, -1) : semAno;
  return Array.from(new Set(semCidade.filter((p) => p.length > CURTA)));
}

/** Quanto dois conjuntos de palavras se cobrem: 0 (nada) a 1 (iguais). */
function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const conjunto = new Set(b);
  let comuns = 0;
  for (const p of a) if (conjunto.has(p)) comuns++;
  const uniao = new Set([...a, ...b]).size;
  return uniao === 0 ? 0 : comuns / uniao;
}

/** Semelhança entre dois nomes de evento, já ignorando ano, cidade e curtas. */
export function parecencaDeEvento(a: string | null | undefined, b: string | null | undefined): number {
  return jaccard(mioloDoEvento(a), mioloDoEvento(b));
}

/** Semelhança entre duas descrições (palavras de mais de 3 letras). */
export function parecencaDeTexto(a: string | null | undefined, b: string | null | undefined): number {
  const palavras = (v: string | null | undefined) =>
    Array.from(new Set(normalizarTexto(v).split(" ").filter((p) => p.length > CURTA)));
  return jaccard(palavras(a), palavras(b));
}

/** Meio ponto de cobertura já é "o mesmo circuito noutra praça". */
export const PARECIDO_A_PARTIR_DE = 0.5;

/** O que o ranking precisa saber de uma peça — alvo ou candidata. */
export interface ArteComparavel {
  id: string;
  displayId?: string | null;
  tipo?: string | null;
  descricao?: string | null;
  eventId?: string | null;
  eventName?: string | null;
  /** Data do evento, ISO — só desempata (mais recente primeiro). */
  eventInicio?: string | Date | null;
  sponsorIds?: string[] | null;
  sponsorNames?: string[] | null;
}

export interface NotaDaArte {
  /** Peso total; maior vem primeiro. */
  pontos: number;
  /** Divide ao menos um patrocinador com a peça alvo. */
  mesmoPatrocinador: boolean;
  /** Mesmo tipo de peça (2x1, placa km…), na régua de texto normalizado. */
  mesmoTipo: boolean;
  /** Outro evento, mesmo circuito — o caso do dono. */
  eventoParecido: boolean;
  parecencaDoEvento: number;
}

// Os pesos são DEGRAUS, e não somas que se confundem: a ordem que o dono pediu
// é patrocinador → tipo → evento parecido → descrição → mais recente, e cada
// degrau vale mais do que TUDO que vem abaixo dele somado. Assim mesmo
// patrocinador nunca perde para quatro coincidências menores.
const PESO_PATROCINADOR = 1000;
const PESO_TIPO = 200;
const PESO_EVENTO = 100; // multiplicado pela parecença (0…1)
const PESO_DESCRICAO = 20; // idem
const PESO_RECENCIA = 5; // idem, e nunca alcança o degrau de cima

/** Mais recente = mais perto de 1; sem data, 0. A régua é 2020→hoje. */
function recencia(inicio: string | Date | null | undefined): number {
  if (!inicio) return 0;
  const t = new Date(inicio).getTime();
  if (!Number.isFinite(t)) return 0;
  const piso = Date.UTC(2020, 0, 1);
  const teto = Date.now();
  if (teto <= piso) return 0;
  return Math.min(1, Math.max(0, (t - piso) / (teto - piso)));
}

const mesmoTipoQue = (a: ArteComparavel, b: ArteComparavel) => {
  const x = normalizarTexto(a.tipo);
  const y = normalizarTexto(b.tipo);
  return x.length > 0 && x === y;
};

const dividePatrocinador = (a: ArteComparavel, b: ArteComparavel) => {
  const dela = new Set(a.sponsorIds ?? []);
  return (b.sponsorIds ?? []).some((id) => dela.has(id));
};

/** A nota de UMA candidata perante a peça alvo. */
export function pontuarArte(alvo: ArteComparavel, candidata: ArteComparavel): NotaDaArte {
  const mesmoPatrocinador = dividePatrocinador(alvo, candidata);
  const mesmoTipo = mesmoTipoQue(alvo, candidata);
  const parecenca = parecencaDeEvento(alvo.eventName, candidata.eventName);
  // Selo só para OUTRO evento: dizer "evento parecido" para uma peça do mesmo
  // evento seria ruído — ali o que vale é o patrocinador e o tipo.
  const outroEvento = !!candidata.eventId && candidata.eventId !== alvo.eventId;
  const eventoParecido = outroEvento && parecenca >= PARECIDO_A_PARTIR_DE;

  const pontos =
    (mesmoPatrocinador ? PESO_PATROCINADOR : 0) +
    (mesmoTipo ? PESO_TIPO : 0) +
    PESO_EVENTO * parecenca +
    PESO_DESCRICAO * parecencaDeTexto(alvo.descricao, candidata.descricao) +
    PESO_RECENCIA * recencia(candidata.eventInicio);

  return { pontos, mesmoPatrocinador, mesmoTipo, eventoParecido, parecencaDoEvento: parecenca };
}

/**
 * A peça casa com o termo digitado? Procura na descrição, no tipo, nos nomes
 * dos patrocinadores, no nome do evento e no código da peça (quem tem o
 * "#0123" na mão digita o número). Cada palavra do termo tem de aparecer em
 * algum desses campos — "estacoes bradesco" acha a peça do Bradesco no
 * circuito, e não tudo que tem "estacoes".
 */
export function casaComTermo(peca: ArteComparavel, termo: string): boolean {
  const palavras = normalizarTexto(termo).split(" ").filter(Boolean);
  if (palavras.length === 0) return true;
  const alvo = normalizarTexto(
    [peca.descricao, peca.tipo, peca.eventName, peca.displayId, ...(peca.sponsorNames ?? [])]
      .filter(Boolean)
      .join(" "),
  );
  return palavras.every((p) => alvo.includes(p));
}

export type ArteOrdenada<T extends ArteComparavel> = T & { nota: NotaDaArte };

/**
 * A lista pronta para a tela: sem a própria peça, filtrada pelo termo (quando
 * houver) e ordenada pela régua do dono. O `limite` é teto de payload — a
 * tela mostra uma grade, não um acervo.
 */
export function ordenarArtes<T extends ArteComparavel>(
  alvo: ArteComparavel,
  candidatas: T[],
  opcoes: { termo?: string; limite?: number } = {},
): ArteOrdenada<T>[] {
  const termo = (opcoes.termo ?? "").trim();
  const limite = opcoes.limite ?? 60;
  const notas = candidatas
    .filter((c) => c.id !== alvo.id && (termo === "" || casaComTermo(c, termo)))
    .map((c) => ({ ...c, nota: pontuarArte(alvo, c) }));
  // localeCompare no fim: duas peças com a mesma nota (mesmo evento, mesmo
  // tipo, sem patrocinador) sairiam em ordem do banco, que muda entre
  // requisições — a grade "pulava" entre uma busca e outra.
  notas.sort((a, b) => b.nota.pontos - a.nota.pontos
    || String(b.displayId ?? "").localeCompare(String(a.displayId ?? ""), "pt-BR", { numeric: true }));
  return notas.slice(0, limite);
}

// ─── O QUE NÃO ENTRA NA BUSCA ────────────────────────────────────────────────
//
// Reaproveitar arte é confiar que ela VALEU. Peça cancelada/arquivada e
// rascunho nunca chegaram a valer; arte reprovada é justamente a que não
// pode voltar a circular. Decisão do dono: fora da grade, sem opção de ver.

/** Status de peça cuja arte não serve de modelo (decisão do dono). */
export const STATUS_FORA_DA_BUSCA_DE_ARTE = [
  "canceled", "cancelled", "deleted", "archived", "draft", "rascunho",
] as const;

const FORA = new Set<string>(STATUS_FORA_DA_BUSCA_DE_ARTE);

/** Uma linha de item_sponsor_approvals, só com o que a busca usa. */
export interface DecisaoDaArte {
  status: string | null;
  approvedBy?: string | null;
  approvedAt?: string | Date | null;
  /** Thumb decidido; null nas decisões antigas (vale para o thumb atual). */
  decidedThumbUrl?: string | null;
}

/** A decisão fala do thumb que está na peça agora? Sem registro, presume-se que sim. */
const falaDoThumbAtual = (d: DecisaoDaArte, thumbAtual: string | null | undefined) =>
  !d.decidedThumbUrl || !thumbAtual || d.decidedThumbUrl === thumbAtual;

/**
 * A peça fica FORA da busca? Status morto, reprovação em aberto na peça
 * (rejectedBySponsor/rejectedByCreator) ou reprovação de patrocinador sobre
 * o thumb que ela ainda tem.
 */
export function arteForaDaBusca(
  peca: { status?: string | null; rejectedBySponsor?: boolean | null; rejectedByCreator?: boolean | null; thumbUrl?: string | null },
  decisoes: DecisaoDaArte[] = [],
): boolean {
  if (FORA.has(String(peca.status ?? "").trim().toLowerCase())) return true;
  if (peca.rejectedBySponsor || peca.rejectedByCreator) return true;
  return decisoes.some((d) => d.status === "rejected" && falaDoThumbAtual(d, peca.thumbUrl));
}

export interface AprovacaoDaArte {
  aprovada: boolean;
  aprovadaPor: string | null;
  aprovadaEm: string | null;
}

const iso = (v: string | Date | null | undefined): string | null => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
};

/**
 * A arte foi aprovada pelo patrocinador? Quando há linhas por patrocinador,
 * TODAS têm de estar aprovadas sobre o thumb atual (uma pendente = ainda não);
 * sem linhas, vale o carimbo da própria peça (sponsorApprovedAt).
 */
export function aprovacaoDaArte(
  peca: { sponsorApprovedBy?: string | null; sponsorApprovedAt?: string | Date | null; thumbUrl?: string | null },
  decisoes: DecisaoDaArte[] = [],
): AprovacaoDaArte {
  if (decisoes.length > 0) {
    const todas = decisoes.every((d) => d.status === "approved" && falaDoThumbAtual(d, peca.thumbUrl));
    if (!todas) return { aprovada: false, aprovadaPor: null, aprovadaEm: null };
    const nomes = Array.from(new Set(decisoes.map((d) => d.approvedBy?.trim()).filter((n): n is string => !!n)));
    const datas = decisoes.map((d) => iso(d.approvedAt)).filter((d): d is string => !!d).sort();
    return {
      aprovada: true,
      aprovadaPor: nomes.length > 0 ? nomes.join(", ") : (peca.sponsorApprovedBy?.trim() || null),
      // A última aprovação é a que liberou a arte.
      aprovadaEm: datas.length > 0 ? datas[datas.length - 1] : iso(peca.sponsorApprovedAt),
    };
  }
  const em = iso(peca.sponsorApprovedAt);
  return { aprovada: !!em, aprovadaPor: em ? (peca.sponsorApprovedBy?.trim() || null) : null, aprovadaEm: em };
}
