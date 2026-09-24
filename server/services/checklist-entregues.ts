// ─────────────────────────────────────────────────────────────────────────────
// O QUE O CHECKLIST DE ARENA LÊ — montado aqui, servido por dois caminhos:
//   · as rotas por token (server/routes/integracao-checklist.ts);
//   · o script de exportação para a demo local (scripts/exportar-checklist.ts),
//     que roda numa transação SÓ DE LEITURA com o próprio cliente do banco.
//
// Por isso este módulo NÃO importa server/db (que exige a variável no import e
// abre o pool do servidor): quem chama passa o banco. Só leitura — as funções
// recebem um banco que só precisa de `select`.
// ─────────────────────────────────────────────────────────────────────────────
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, notInArray, or, sql, gt } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { events, items, standardItems, tubos, tuboItens } from "@shared/schema";
import { STATUS_ENTREGUES, STATUS_FORA_DO_FUNIL } from "@shared/fluxo-peca";
import {
  compararComoARevisaoFinal,
  grupoPorTipo,
  quantidadeEntregueParaChecklist,
} from "@shared/integracao-checklist";
import { urlDeThumbValida } from "../routes/thumb-url";

/** O banco (ou a transação) de onde se lê. Só `select`: nada aqui escreve. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type BancoDeLeitura = Pick<PgDatabase<any, any>, "select">;

/** Janela da lista de eventos: a montagem é agora, não o acervo inteiro. */
export const JANELA_DE_EVENTOS_DIAS = 120;

/**
 * O "book completo" em SQL: o mesmo padrão de `ehBookCompleto`
 * (/book[\s_-]*completo/i), escrito na sintaxe de regex do Postgres.
 */
const BOOK_COMPLETO_SQL = "book[[:space:]_-]*completo";

/** A conta de quantidadeEntregueParaChecklist, na linguagem do banco. */
const quantidadeEntregueSql = sql`(case
  when ${inArray(items.status, [...STATUS_ENTREGUES])} and coalesce(${items.deliveredQty}, 0) = 0 then ${items.quantity}
  else least(coalesce(${items.deliveredQty}, 0), ${items.quantity})
end)`;

const iso = (d: Date | string | null | undefined): string | null => (d ? new Date(d).toISOString() : null);

/** Tem arte que a rota da thumb consegue servir (um objeto do nosso storage). */
export const temImagemDaPeca = (approvalThumbUrl: string | null | undefined): boolean =>
  urlDeThumbValida(approvalThumbUrl) !== null;

// ── Os volumes (tubos e avulsos) na lista de entregues ──────────────────────
/** Uma linha de volume da peça: quantas unidades dela foram NAQUELE volume. */
export type TuboDaPeca = { tuboId: string; numero: number; quantidade: number };
/** O cabeçalho de um volume entregue, com o que ele leva de peças listadas. */
export type TuboDoEvento = {
  id: string;
  numero: number;
  avulso: boolean;
  entregueEm: string | null;
  recebidoPor: string | null;
  /** Linhas (peças) entregues dentro dele. */
  linhas: number;
  /** Soma das quantidades dessas linhas. */
  unidades: number;
  /** Quantas fotos de fechamento o volume tem. */
  fotos: number;
};

/**
 * Ordem dos volumes: tubos (número positivo) em ordem crescente, depois os
 * avulsos (número negativo) por valor absoluto — Tubo 1, 2, 3, Avulso 1, 2.
 */
export function compararVolumes(a: { numero: number }, b: { numero: number }): number {
  const avulsoA = a.numero < 0 ? 1 : 0;
  const avulsoB = b.numero < 0 ? 1 : 0;
  if (avulsoA !== avulsoB) return avulsoA - avulsoB;
  return Math.abs(a.numero) - Math.abs(b.numero);
}

// ── As formas das respostas ─────────────────────────────────────────────────
export type EventoDaListaDoChecklist = {
  id: string;
  nome: string;
  inicio: string | null;
  saidaCaminhao: string | null;
  status: string;
  /** Peças (linhas), não unidades. */
  pecasEntregues: number;
};
export type RespostaDosEventos = { eventos: EventoDaListaDoChecklist[] };

export type PecaEntregueDoChecklist = {
  id: string;
  codigo: string;
  grupo: string | null;
  tipo: string;
  descricao: string | null;
  material: string;
  acabamento: string;
  medida: string;
  quantidade: number;
  quantidadeEntregue: number;
  status: string;
  entregueEm: string | null;
  recebidoPor: string | null;
  volumes: number[];
  tubos: TuboDaPeca[];
  temImagem: boolean;
};
export type RespostaDasEntregues = {
  evento: Omit<EventoDaListaDoChecklist, "pecasEntregues">;
  geradoEm: string;
  itens: PecaEntregueDoChecklist[];
  tubos: TuboDoEvento[];
};

// ── 1. Eventos recentes com peça da Arena entregue ──────────────────────────
// Agregado no banco: um evento grande tem centenas de peças, e trazer todas
// para contar em JS seria pagar a lista inteira para devolver um número.
// `semJanela` (só o script de exportação usa): todos os eventos com peça
// entregue, não só os dos últimos JANELA_DE_EVENTOS_DIAS dias.
export async function listarEventosDoChecklist(
  banco: BancoDeLeitura,
  opcoes: { agora?: Date; semJanela?: boolean } = {},
): Promise<RespostaDosEventos> {
  const agora = opcoes.agora ?? new Date();
  const corte = new Date(agora.getTime() - JANELA_DE_EVENTOS_DIAS * 24 * 60 * 60 * 1000);
  const linhas = await banco
    .select({
      id: events.id,
      nome: events.name,
      inicio: events.startDate,
      saidaCaminhao: events.truckDepartureDate,
      status: events.status,
      // Peças (linhas), não unidades: é o que o Checklist lista.
      pecasEntregues: sql<number>`count(*)::int`,
    })
    .from(events)
    .innerJoin(items, eq(items.eventId, events.id))
    .where(and(
      opcoes.semJanela ? undefined : gte(events.startDate, corte),
      isNull(items.deletedAt),
      isNull(items.kitRemessaId),
      notInArray(items.status, [...STATUS_FORA_DO_FUNIL]),
      sql`${items.type} !~* ${BOOK_COMPLETO_SQL}`,
      sql`${quantidadeEntregueSql} > 0`,
    ))
    // events.id é a chave: o Postgres aceita as outras colunas do evento.
    .groupBy(events.id)
    // Sem janela, evento sem data de início vai para o fim.
    .orderBy(sql`${desc(events.startDate)} nulls last`);

  return {
    eventos: linhas.map((e) => ({
      id: e.id,
      nome: e.nome,
      inicio: iso(e.inicio),
      saidaCaminhao: iso(e.saidaCaminhao),
      status: e.status,
      pecasEntregues: Number(e.pecasEntregues),
    })),
  };
}

// ── 2. As peças entregues de um evento ──────────────────────────────────────
// Um evento só: aqui a regra roda em JS (a função pura), sobre as peças já
// recortadas pelo banco no que é barato recortar. `null` = evento não existe.
export async function montarEntreguesDoEvento(banco: BancoDeLeitura, eventoId: string): Promise<RespostaDasEntregues | null> {
  const [evento] = await banco
    .select({
      id: events.id,
      nome: events.name,
      inicio: events.startDate,
      saidaCaminhao: events.truckDepartureDate,
      status: events.status,
    })
    .from(events)
    .where(eq(events.id, eventoId))
    .limit(1);
  if (!evento) return null;

  const candidatas = await banco
    .select({
      id: items.id,
      displayId: items.displayId,
      type: items.type,
      description: items.description,
      material: items.material,
      finish: items.finish,
      measurement: items.measurement,
      quantity: items.quantity,
      deliveredQty: items.deliveredQty,
      status: items.status,
      deliveredAt: items.deliveredAt,
      receivedBy: items.receivedBy,
      deletedAt: items.deletedAt,
      kitRemessaId: items.kitRemessaId,
      approvalThumbUrl: items.approvalThumbUrl,
    })
    .from(items)
    .where(and(
      eq(items.eventId, evento.id),
      isNull(items.deletedAt),
      isNull(items.kitRemessaId),
      // Pré-filtro: só quem PODE ter algo entregue. A decisão é da função.
      or(gt(items.deliveredQty, 0), inArray(items.status, [...STATUS_ENTREGUES])),
    ));

  const entregues = candidatas
    .map((p) => ({ p, qtd: quantidadeEntregueParaChecklist(p) }))
    .filter((x) => x.qtd > 0);
  const ids = entregues.map((x) => x.p.id);
  const tipos = Array.from(new Set(entregues.map((x) => x.p.type)));

  // UMA consulta traz as linhas entregues (peça × volume × quantidade) E o
  // cabeçalho do volume de cada linha: dela saem `volumes`, os `tubos` da
  // peça e a lista `tubos` do topo — sem uma consulta por tubo.
  const [linhasDeVolume, modelos] = await Promise.all([
    ids.length === 0 ? Promise.resolve([]) : banco
      .select({
        itemId: tuboItens.itemId,
        tuboId: tubos.id,
        numero: tubos.numero,
        quantidade: tuboItens.quantidade,
        linhaEntregueEm: tuboItens.entregueEm,
        avulso: tubos.avulso,
        tuboEntregueEm: tubos.entregueEm,
        tuboRecebidoPor: tubos.recebidoPor,
        // Só a contagem: as fotos em si não saem por esta integração.
        fotos: sql<number>`coalesce(cardinality(${tubos.fotosFechamento}), 0)::int`,
      })
      .from(tuboItens)
      .innerJoin(tubos, eq(tubos.id, tuboItens.tuboId))
      .where(and(inArray(tuboItens.itemId, ids), isNotNull(tuboItens.entregueEm)))
      .orderBy(asc(tubos.numero)),
    tipos.length === 0 ? Promise.resolve([]) : banco
      .select({ id: standardItems.id, name: standardItems.name, group: standardItems.group, createdAt: standardItems.createdAt })
      .from(standardItems)
      .where(inArray(standardItems.name, tipos)),
  ]);

  const volumesDaPeca = new Map<string, Set<number>>();
  const tubosDaPeca = new Map<string, TuboDaPeca[]>();
  const tubosDoEvento = new Map<string, TuboDoEvento>();
  const listadas = new Set(ids);
  for (const v of linhasDeVolume) {
    // O banco já recorta; a guarda repete a regra aqui para que um tubo
    // nunca apareça por linha não entregue ou de peça fora de `itens`.
    if (!v.linhaEntregueEm || !listadas.has(v.itemId)) continue;
    const numero = Number(v.numero);
    const quantidade = Number(v.quantidade);
    if (!volumesDaPeca.has(v.itemId)) volumesDaPeca.set(v.itemId, new Set());
    volumesDaPeca.get(v.itemId)!.add(numero);
    if (!tubosDaPeca.has(v.itemId)) tubosDaPeca.set(v.itemId, []);
    tubosDaPeca.get(v.itemId)!.push({ tuboId: v.tuboId, numero, quantidade });
    let t = tubosDoEvento.get(v.tuboId);
    if (!t) {
      t = {
        id: v.tuboId,
        numero,
        avulso: Boolean(v.avulso),
        entregueEm: iso(v.tuboEntregueEm),
        recebidoPor: v.tuboRecebidoPor ?? null,
        linhas: 0,
        unidades: 0,
        fotos: Number(v.fotos ?? 0),
      };
      tubosDoEvento.set(v.tuboId, t);
    }
    t.linhas += 1;
    t.unidades += quantidade;
  }
  const grupos = grupoPorTipo(modelos);

  const itens: PecaEntregueDoChecklist[] = entregues.map(({ p, qtd }) => ({
    id: p.id,
    codigo: p.displayId,
    grupo: grupos.get(p.type) ?? null,
    tipo: p.type,
    descricao: p.description ?? null,
    material: p.material,
    acabamento: p.finish,
    medida: p.measurement,
    quantidade: p.quantity,
    quantidadeEntregue: qtd,
    status: p.status,
    entregueEm: iso(p.deliveredAt),
    recebidoPor: p.receivedBy ?? null,
    // Número do volume; avulso tem número NEGATIVO (−1, −2: ver tubos).
    volumes: Array.from(volumesDaPeca.get(p.id) ?? []).sort((a, b) => a - b),
    // Em qual volume, e QUANTAS unidades dela em cada um (a contagem do
    // tubo aberto na arena). Sem linha de volume entregue: [] ("Sem tubo").
    tubos: (tubosDaPeca.get(p.id) ?? []).sort(compararVolumes),
    // A arte vem por GET /api/integracao/checklist/itens/:itemId/thumb.
    temImagem: temImagemDaPeca(p.approvalThumbUrl),
  }));
  itens.sort(compararComoARevisaoFinal);

  return {
    evento: {
      id: evento.id,
      nome: evento.nome,
      inicio: iso(evento.inicio),
      saidaCaminhao: iso(evento.saidaCaminhao),
      status: evento.status,
    },
    geradoEm: new Date().toISOString(),
    itens,
    // Os volumes com ao menos uma linha entregue de peça listada em
    // `itens` — o Checklist nunca mostra tubo vazio.
    tubos: Array.from(tubosDoEvento.values()).sort(compararVolumes),
  };
}
