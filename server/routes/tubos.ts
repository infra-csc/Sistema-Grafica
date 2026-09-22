// ─────────────────────────────────────────────────────────────────────────────
// TUBOS — agrupar na conferência, entregar por tubo (dono, 14/09).
//
// "Na hora da conferência muitas peças vão no mesmo tubo, então nesta fase
// precisamos que eles possam agrupar, e na hora de entregar, entregar por
// tubos." As decisões do dono, na mesma conversa:
//   · a peça vai INTEIRA para um tubo — não se divide unidades entre tubos;
//   · a conferência continua com foto de CADA peça impressa;
//   · a entrega é do TUBO INTEIRO: uma foto e um recebedor valem para tudo que
//     está dentro;
//   · o tubo é numerado sozinho por evento (Tubo 1, Tubo 2…) e tem etiqueta.
//
// A consequência que este arquivo impõe: um tubo só é entregue quando TODAS as
// peças dele estão conferidas. Entregar parte de uma peça contradiria "tubo
// inteiro" — e a recusa diz quais peças faltam, em vez de só "não pode".
//
// A ETAPA "EMBALADO" (dono, 21/09). "Hoje eles colocam Entregue, mas a foto é
// do tubo; a entrega é feita depois." O galpão usava a entrega para guardar a
// foto do tubo fechado porque não havia outro lugar. Agora o tubo tem DOIS
// passos, nesta ordem:
//   1. FECHAR o tubo — fotos do tubo pronto e dos itens dentro (várias). As
//      peças ficam `packed` (Embalado) e continuam assim: não é entrega.
//   2. ENTREGAR o tubo — o que importa aqui é QUEM recebeu e QUANDO; a foto do
//      comprovante é opcional (o material já foi fotografado ao fechar).
// Este arquivo é quem grava a transição conferred ⇄ packed: entra no tubo
// conferida → packed; sai do tubo (ou o tubo é apagado) → conferred. Ver
// EMBALADO em shared/fluxo-peca.ts.
//
// AJUSTE DO MESMO DIA (dono, 21/09, depois de testar): "o EMBALAR tem que pedir
// a foto, igual é o Entregar; e depois o ENTREGAR é só o tubo".
//   · EMBALAR = tubo + FOTO: peça conferida só entra em tubo (novo, aberto ou
//     vinda de outro tubo) com a foto do tubo com os itens — 400 sem ela. As
//     fotos ACUMULAM em fotos_fechamento. "Fechar" virou "Adicionar fotos ao
//     tubo": opcional, e também acumula.
//   · ENTREGAR é do tubo: PATCH /api/items/:id/deliver recusa peça embalada.
//
// Papéis: os mesmos de conferir e entregar (grafica, solicitacao, admin). Os
// tubos são a embalagem dessas duas etapas, não uma permissão nova.
//
// EMBALAGEM COM QUANTIDADE (dono, 21/09, à noite): "podemos ter quantidade
// diferente em tubos diferentes, então tem que colocar as quantidades também".
// Isto SUBSTITUI a premissa "a peça vai inteira para um tubo":
//   · o vínculo peça × volume é uma LINHA de `tubo_itens`, com a quantidade que
//     está NAQUELE volume; `items.embalada_qty` é o total já embalado (entregue
//     ou não) e `items.tubo_id` virou atalho (o volume aberto com mais unidades);
//   · só unidade CONFERIDA é embalada — 1..(conferidas − já embaladas), e o
//     padrão é tudo o que dá. A peça parcial (7 de 10 conferidas) embala 7;
//   · a peça vira `packed` só quando TUDO está embalado; o volume entrega AS
//     QUANTIDADES que estão nele e a peça vira `delivered` quando tudo saiu;
//   · tirar do volume é POR LINHA: devolve aquela quantidade a "conferida não
//     embalada" (peça `packed` volta a `conferred`).
// As contas moram em shared/embalagem.ts (puras, testadas à parte).
// ─────────────────────────────────────────────────────────────────────────────
import type { Express } from "express";
import { and, asc, eq, gte, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { items as itemsTable, tubos, tuboItens, events, auditLogs } from "@shared/schema";
import { EMBALADO } from "@shared/fluxo-peca";
import { aEmbalar, planejarEmbalar, planejarEntrega, planejarRetirada, problemaNoVolume, statusEmbalavel, volumePrincipal } from "@shared/embalagem";
import { pecaTravada, fraseDaTrava } from "@shared/trava-da-peca";
import { pecaVisivelPara } from "@shared/kit";
import { urlDeThumbValida } from "./thumb-url";
import {
  requireAuth,
  broadcast,
  createAuditLog,
  createAuditLogsEmLote,
  resolveActor,
  updateEventStatus,
} from "./shared";

// Predicado PURO de papel (só comparações de userRole): é a forma que o
// leitor da régua (server/permissoes-scan.ts) entende — assim as rotas de
// escrita dos tubos aparecem em shared/permissoes.ts e no teste que confere.
function podeMexerEmTubo(req: any): boolean {
  return req.userRole === "grafica" || req.userRole === "solicitacao" || req.userRole === "admin";
}
const SEM_PAPEL = "Tubos são da Gráfica, da Solicitação e do admin";

const COLUNAS_PECA = {
  id: itemsTable.id,
  displayId: itemsTable.displayId,
  type: itemsTable.type,
  description: itemsTable.description,
  quantity: itemsTable.quantity,
  quantityProduced: itemsTable.quantityProduced,
  status: itemsTable.status,
  conferredQty: itemsTable.conferredQty,
  embaladaQty: itemsTable.embaladaQty,
  deliveredQty: itemsTable.deliveredQty,
  // Reaproveitamento: a etiqueta do tubo liga o "REAPROVEITAR" sozinha.
  isReuse: itemsTable.isReuse,
  reuseQty: itemsTable.reuseQty,
  // A foto da conferência: quem entrega vê que o material já está documentado.
  conferencePhotoUrl: itemsTable.conferencePhotoUrl,
  tuboId: itemsTable.tuboId,
  eventId: itemsTable.eventId,
  deletedAt: itemsTable.deletedAt,
  // Para o recorte do Kit (pecaVisivelPara) — não vão para a tela.
  kitRemessaId: itemsTable.kitRemessaId,
  criadoPorId: itemsTable.criadoPorId,
  // Trava da Solicitação (shared/trava-da-peca.ts): não embala nem entrega.
  travadaEm: itemsTable.travadaEm,
  travadaPor: itemsTable.travadaPor,
  travadaMotivo: itemsTable.travadaMotivo,
};

type PecaCrua = {
  id: string;
  displayId: string | null;
  type: string;
  description: string | null;
  quantity: number;
  quantityProduced: number | null;
  status: string;
  conferredQty: number | null;
  embaladaQty: number | null;
  deliveredQty: number | null;
  isReuse?: boolean | null;
  reuseQty?: number | null;
  conferencePhotoUrl?: string | null;
  tuboId: string | null;
  eventId: string;
  deletedAt: Date | null;
  kitRemessaId: string | null;
  criadoPorId: string | null;
  travadaEm?: Date | null;
  travadaPor?: string | null;
  travadaMotivo?: string | null;
};
/** A linha de `tubo_itens`: quanto da peça está NAQUELE volume. */
type Linha = { id: string; tuboId: string; itemId: string; quantidade: number; entregueEm: Date | null };
type TuboCru = { id: string; numero: number; avulso?: boolean | null; eventId: string; fechadoEm: Date | null };

// O MESMO recorte do Kit que as leituras de peças aplicam (routes/items.ts):
// o usuário do Kit só enxerga — e só mexe em — peça do Kit que ele criou.
// Peça fora do recorte é tratada como inexistente, em leitura e em escrita.
const quemVe = (req: any) => ({ kit: req.userKit === true, userId: req.userId ?? null });

// "SOLICITAÇÃO SEM KIT SÓ VISUALIZA PEÇA DO KIT" — a trava global de
// server/routes.ts. Ela só enxerga `/api/items/:id` e `itemIds`, e os tubos
// mexem em peça por `adicionar`/`remover` e pela entrega do tubo inteiro, que
// não cita id nenhum. Por isso a mesma regra é repetida aqui, com a MESMA
// mensagem — senão a Solicitação da Arena agia na peça do Kit pelo tubo.
const soVisualizaKit = (req: any): boolean => req.userRole === "solicitacao" && req.userKit !== true;
const RECADO_SO_VISUALIZA = "Peça do Kit: a Solicitação da Arena só visualiza. Quem age nela é o usuário do Kit.";
/** Responde 403 quando quem só visualiza tenta agir sobre peça do Kit. */
const barraPecaDoKit = (req: any, res: any, pecas: Array<{ kitRemessaId: string | null }>): boolean => {
  if (!soVisualizaKit(req) || !pecas.some((p) => !!p.kitRemessaId)) return false;
  res.status(403).json({ error: RECADO_SO_VISUALIZA });
  return true;
};
const visiveis = (req: any, pecas: PecaCrua[]): PecaCrua[] => pecas.filter((p) => pecaVisivelPara(quemVe(req), p));

const linhas = (r: any): any[] => (r?.rows ?? r ?? []) as any[];

const ehEntregue = (p: PecaCrua): boolean =>
  p.status === "delivered" || p.status === "entregue" || (p.deliveredQty ?? 0) >= p.quantity;

/** "21/09 14:32" no fuso do galpão — para a trilha de fechamento e entrega. */
const quandoBR = (d: Date): string =>
  d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).replace(",", "");

// CONCORRÊNCIA (revisão adversarial, 21/09): toda escrita em volume roda numa
// transação que TRAVA a linha do tubo (`SELECT … FOR UPDATE`) e as linhas das
// peças, e RECALCULA as contas lá dentro. Embalar, tirar, apagar e entregar o
// mesmo volume ficam em fila — entregar e mexer ao mesmo tempo não deixa linha
// aberta dentro de volume entregue, e duas pessoas embalando a mesma peça não
// passam do conferido. `Ex` é o `db` ou a transação em curso.
type Ex = any;

/** Recusa de negócio lançada de dentro da transação (desfaz tudo) — vira a resposta HTTP. */
class Recusa extends Error {
  constructor(public http: number, mensagem: string) { super(mensagem); }
}
const responderRecusa = (res: any, error: unknown): boolean => {
  if (!(error instanceof Recusa)) return false;
  res.status(error.http).json({ error: error.message });
  return true;
};

/** Trava o volume até o fim da transação; recusa se sumiu ou já foi entregue. */
async function travarTubo(tx: Ex, tuboId: string, recadoEntregue?: (t: Volume) => string): Promise<any> {
  const [tubo] = await tx.select().from(tubos).where(eq(tubos.id, tuboId)).for("update");
  if (!tubo) throw new Recusa(404, "Tubo não encontrado");
  if (tubo.entregueEm) throw new Recusa(409, recadoEntregue ? recadoEntregue(tubo) : `${oVolume(tubo)} já foi entregue`);
  return tubo;
}

/**
 * As peças, travadas até o fim da transação — SEMPRE na ordem do id: duas
 * transações que travam conjuntos que se cruzam pegam as linhas na mesma
 * ordem e uma espera a outra, em vez de cada uma segurar metade (deadlock).
 */
const pecasTravadas = async (tx: Ex, ids: string[]): Promise<PecaCrua[]> =>
  ids.length ? ((await tx.select(COLUNAS_PECA).from(itemsTable).where(inArray(itemsTable.id, Array.from(new Set(ids)))).orderBy(asc(itemsTable.id)).for("update")) as PecaCrua[]) : [];

/**
 * O que roda DEPOIS do commit (trilha, aviso em tempo real) não pode virar 500:
 * o volume já foi gravado, e o 500 faria a pessoa tentar de novo e embalar em
 * dobro. A falha vai para o log e a resposta segue (revisão de 22/09).
 */
async function depoisDoCommit(oQue: string, fazer: () => Promise<unknown>): Promise<void> {
  try { await fazer(); } catch (error) { console.error(`[tubos] falha em "${oQue}" depois do commit (o volume já está gravado):`, error); }
}

/** Os volumes que as listas enxergam: todo volume ABERTO e o entregue há até 60 dias. */
const JANELA_DE_DIAS = 60;
const volumeNaJanela = () => or(isNull(tubos.entregueEm), gte(tubos.entregueEm, sql`now() - (${JANELA_DE_DIAS} * interval '1 day')`));

/** Tubo já fotografado que teve o conteúdo mexido: a foto pode não bater mais. */
async function marcarConteudoAlterado(tubo: { id: string; fechadoEm: Date | null }, agora: Date, ex: Ex = db) {
  if (!tubo.fechadoEm) return;
  await ex.update(tubos).set({ conteudoAlteradoEm: agora } as any).where(eq(tubos.id, tubo.id));
}

const COLUNAS_LINHA = { id: tuboItens.id, tuboId: tuboItens.tuboId, itemId: tuboItens.itemId, quantidade: tuboItens.quantidade, entregueEm: tuboItens.entregueEm };
const linhasDosTubos = async (tuboIds: string[], ex: Ex = db): Promise<Linha[]> =>
  tuboIds.length ? ((await ex.select(COLUNAS_LINHA).from(tuboItens).where(inArray(tuboItens.tuboId, tuboIds))) as Linha[]) : [];
const linhasDasPecas = async (itemIds: string[], ex: Ex = db): Promise<Linha[]> =>
  itemIds.length ? ((await ex.select(COLUNAS_LINHA).from(tuboItens).where(inArray(tuboItens.itemId, itemIds))) as Linha[]) : [];

/**
 * Mantém o atalho `items.tubo_id` coerente: o volume ABERTO com mais unidades
 * da peça (ou o último entregue; ou null). Quem lê só esse campo — a fila, o
 * resumo que viaja na peça, o Excel — continua funcionando.
 */
async function acertarAtalho(itemIds: string[], agora: Date, ex: Ex = db) {
  const todas = await linhasDasPecas(itemIds, ex);
  for (const id of Array.from(new Set(itemIds))) {
    const principal = volumePrincipal(todas.filter((l) => l.itemId === id));
    await ex.update(itemsTable).set({ tuboId: principal, updatedAt: agora } as any).where(eq(itemsTable.id, id));
  }
}

/** A peça como a tela a vê. Com `linha`, `quantidadeNoTubo` é o que está NAQUELE volume. */
const pecaParaTela = (p: PecaCrua, linha?: Linha) => ({
  id: p.id,
  displayId: p.displayId,
  type: p.type,
  description: p.description,
  quantity: p.quantity,
  // O CONTRATO NOVO (21/09): a quantidade da peça NESTE volume — a etiqueta, o
  // modal de entrega e o painel mostram esta, e "(7 de 10)" quando dividida.
  quantidadeNoTubo: linha ? linha.quantidade : 0,
  status: p.status,
  conferredQty: p.conferredQty ?? 0,
  embaladaQty: p.embaladaQty ?? 0,
  deliveredQty: p.deliveredQty ?? 0,
  // Quanto ainda dá para embalar agora (conferidas − já embaladas).
  aEmbalar: aEmbalar(p),
  // Só unidade conferida entra em volume: dentro dele, está conferida.
  conferida: linha ? true : aEmbalar(p) > 0,
  entregue: linha ? !!linha.entregueEm : ehEntregue(p),
  // A tela esconde a caixa e o "Entregar" de quem só visualiza peça do Kit.
  doKit: !!p.kitRemessaId,
  isReuse: !!p.isReuse,
  reuseQty: p.reuseQty ?? 0,
  conferencePhotoUrl: p.conferencePhotoUrl ?? null,
  // Peça cancelada/arquivada DENTRO de um volume: fica à vista como problema
  // (a entrega recusa até alguém tirá-la), em vez de sumir da lista.
  problema: linha && !linha.entregueEm ? problemaNoVolume(p) : null,
  // A TRAVA da Solicitação (revisão de 22/09): o modal de entrega diz o motivo
  // e quem travou, e desabilita — antes do 409. Resolver é destravar, não tirar.
  travada: pecaTravada(p),
  travadaEm: p.travadaEm ?? null,
  travadaPor: p.travadaPor ?? null,
  travadaMotivo: p.travadaMotivo ?? null,
  excluida: !!p.deletedAt,
});

const porCodigo = (a: PecaCrua, b: PecaCrua) =>
  String(a.displayId ?? "").localeCompare(String(b.displayId ?? ""), "pt-BR", { numeric: true });

type Pedido = { id: string; quantidade?: number | null };
type Plano = { peca: PecaCrua; quantidade: number; embaladaQty: number; viraEmbalada: boolean };

/**
 * O que impede cada peça de ser embalada — vazio quando todas podem. As contas
 * (inclusive o STATUS: cancelada, arquivada, em aprovação ou em revisão nunca é
 * embalada) são de shared/embalagem.ts. Com `tx`, lê as peças TRAVADAS.
 */
async function planosParaEmbalar(req: any, eventId: string, pedidos: Pedido[], tx?: Ex): Promise<{ planos: Plano[]; recusas: string[] }> {
  if (pedidos.length === 0) return { planos: [], recusas: [] };
  const ids = pedidos.map((x) => x.id);
  const cruas = tx ? await pecasTravadas(tx, ids) : ((await db.select(COLUNAS_PECA).from(itemsTable).where(inArray(itemsTable.id, ids))) as PecaCrua[]);
  const pecas = visiveis(req, cruas);
  const achadas = new Map(pecas.map((p) => [p.id, p]));
  const planos: Plano[] = [];
  const recusas: string[] = [];
  for (const pedido of pedidos) {
    const p = achadas.get(pedido.id);
    const nome = p?.displayId ?? "peça";
    if (!p || p.deletedAt) { recusas.push(`${nome}: não encontrada`); continue; }
    if (p.eventId !== eventId) { recusas.push(`${nome}: é de outro evento`); continue; }
    if (ehEntregue(p)) { recusas.push(`${nome}: já foi entregue`); continue; }
    if (pecaTravada(p)) { recusas.push(`${nome}: ${fraseDaTrava(p)}`); continue; }
    const plano = planejarEmbalar(p, pedido.quantidade);
    if (!plano.ok) { recusas.push(`${nome}: ${plano.motivo}`); continue; }
    planos.push({ peca: p, quantidade: plano.quantidade, embaladaQty: plano.embaladaQty, viraEmbalada: plano.viraEmbalada });
  }
  return { planos, recusas };
}

async function proximoNumero(eventId: string, avulso: boolean, ex: Ex = db): Promise<number> {
  // Tubos de verdade: 1, 2, 3… (os negativos dos avulsos não contam — sem
  // buraco). Avulsos: −1, −2, … — não consomem número de tubo.
  const [{ proximo }] = linhas(await ex.execute(avulso
    ? sql`select least(coalesce(min(numero), 0), 0) - 1 as proximo from tubos where event_id = ${eventId}`
    : sql`select greatest(coalesce(max(numero), 0), 0) + 1 as proximo from tubos where event_id = ${eventId}`));
  return Number(proximo);
}

/**
 * Próximo número do evento. Duas pessoas criando tubo no mesmo segundo batem
 * no índice único (evento, número); quem perde tenta de novo com o número
 * seguinte, em vez de devolver erro para quem só queria um tubo.
 */
async function criarTubo(eventId: string, criadoPor: string, avulso = false) {
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const proximo = await proximoNumero(eventId, avulso);
    try {
      const [tubo] = await db.insert(tubos).values({ eventId, numero: proximo, avulso, criadoPor } as any).returning();
      return tubo;
    } catch (error: any) {
      const colidiu = error?.code === "23505" || /duplicate key/i.test(String(error?.message ?? ""));
      if (!colidiu || tentativa === 2) throw error;
    }
  }
  throw new Error("Não foi possível numerar o tubo");
}

/**
 * EMBALA as quantidades planejadas neste volume: soma na linha (ou cria),
 * soma em `embalada_qty`, vira `packed` quando tudo está embalado e acerta o
 * atalho. `statusChangedAt` vai à mão porque esta escrita não passa por
 * storage.updateItem — e o delta `?since=` da Gráfica depende de `updatedAt`.
 */
async function colocarNoTubo(req: any, tubo: TuboCru, planos: Plano[], tx: Ex) {
  const agora = new Date();
  const quem = resolveActor(req).userName;
  const jaNoTubo = new Map((await linhasDosTubos([tubo.id], tx)).filter((l) => !l.entregueEm).map((l) => [l.itemId, l]));
  for (const pl of planos) {
    const existente = jaNoTubo.get(pl.peca.id);
    if (existente) {
      // SOMA RELATIVA: nunca grava um total lido antes.
      await tx.update(tuboItens).set({ quantidade: sql`${tuboItens.quantidade} + ${pl.quantidade}` } as any).where(eq(tuboItens.id, existente.id));
    } else {
      await tx.insert(tuboItens).values({ tuboId: tubo.id, itemId: pl.peca.id, quantidade: pl.quantidade, embaladoEm: agora, embaladoPor: quem } as any);
    }
    // `embaladaQty` foi calculado com a peça TRAVADA nesta transação.
    await tx.update(itemsTable).set({
      embaladaQty: pl.embaladaQty,
      updatedAt: agora,
      ...(pl.viraEmbalada && pl.peca.status !== EMBALADO ? { status: EMBALADO, statusChangedAt: agora } : {}),
    } as any).where(eq(itemsTable.id, pl.peca.id));
  }
  await acertarAtalho(planos.map((pl) => pl.peca.id), agora, tx);
  await marcarConteudoAlterado(tubo, agora, tx);
}

/** A trilha e o aviso de "embalada" — depois da transação confirmada; falha aqui só vai ao log. */
async function avisarEmbalagem(req: any, tubo: TuboCru, planos: Plano[], nFotos = 0) {
  await depoisDoCommit("avisar a embalagem", () => avisarEmbalagemCru(req, tubo, planos, nFotos));
}
async function avisarEmbalagemCru(req: any, tubo: TuboCru, planos: Plano[], nFotos: number) {
  const comFoto = nFotos > 0 ? ` · ${nFotos} ${nFotos === 1 ? "foto" : "fotos"}` : "";
  await createAuditLogsEmLote(req, planos.map((pl) => {
    const quanto = pl.quantidade < pl.peca.quantity ? ` — ${pl.quantidade} de ${pl.peca.quantity} un.` : "";
    const details = tubo.avulso ? `Embalada (sozinha)${quanto}${comFoto}` : `Embalada no Tubo ${tubo.numero}${quanto}${comFoto}`;
    return { action: "updated", entityType: "item", entityId: pl.peca.id, details };
  }));
  broadcast({ type: "items_bulk_updated", itemIds: planos.map((pl) => pl.peca.id), eventId: tubo.eventId });
}

type Retirada = { itemId: string; quantidade: number };

/**
 * Tira as LINHAS destas peças deste volume (as ainda não entregues) e devolve a
 * quantidade a "conferida não embalada". Roda DENTRO da transação que travou o
 * volume: lê as linhas e trava as peças lá dentro.
 */
async function tirarDoTubo(tubo: TuboCru, ids: string[], tx: Ex): Promise<Retirada[]> {
  if (!ids.length) return [];
  const agora = new Date();
  const doTubo = (await linhasDosTubos([tubo.id], tx)).filter((l) => ids.includes(l.itemId) && !l.entregueEm);
  if (!doTubo.length) return [];
  const porId = new Map((await pecasTravadas(tx, doTubo.map((l) => l.itemId))).map((p) => [p.id, p]));
  for (const l of doTubo) {
    const p = porId.get(l.itemId);
    await tx.delete(tuboItens).where(eq(tuboItens.id, l.id));
    if (!p) continue;
    const plano = planejarRetirada(p, l.quantidade);
    await tx.update(itemsTable).set({
      embaladaQty: plano.embaladaQty,
      updatedAt: agora,
      ...(plano.voltaAConferida ? { status: "conferred", statusChangedAt: agora } : {}),
    } as any).where(eq(itemsTable.id, p.id));
  }
  await acertarAtalho(doTubo.map((l) => l.itemId), agora, tx);
  await marcarConteudoAlterado(tubo, agora, tx);
  return doTubo.map((l) => ({ itemId: l.itemId, quantidade: l.quantidade }));
}

/** A trilha e o aviso de "retirada" — depois da transação confirmada; falha aqui só vai ao log. */
async function avisarRetirada(req: any, tubo: TuboCru, tiradas: Retirada[], motivo?: string) {
  if (!tiradas.length) return;
  await depoisDoCommit("avisar a retirada", () => avisarRetiradaCru(req, tubo, tiradas, motivo));
}
async function avisarRetiradaCru(req: any, tubo: TuboCru, tiradas: Retirada[], motivo?: string) {
  await createAuditLogsEmLote(req, tiradas.map((l) => ({
    action: "updated", entityType: "item", entityId: l.itemId,
    details: tubo.avulso ? `Embalagem desfeita — ${l.quantidade} un. voltaram a Conferido${motivo ? ` (${motivo})` : ""}` : `Retirada do Tubo ${tubo.numero} — ${l.quantidade} un.${motivo ? ` (${motivo})` : ""}`,
  })));
  broadcast({ type: "items_bulk_updated", itemIds: tiradas.map((l) => l.itemId), eventId: tubo.eventId });
}

/**
 * EXCLUIR A PEÇA (DELETE /api/items/:id): tira ela dos volumes ABERTOS e faz o
 * soft delete NUMA TRANSAÇÃO SÓ (revisão de 22/09). Antes eram dois passos, e
 * um embalar ou uma entrega no meio deixava linha "fantasma" num volume — ou a
 * peça fora do volume sem ter sido excluída. A ordem das travas é a de todo
 * o arquivo: os volumes (por id), depois a peça. Volume avulso que fica vazio
 * some, como no "desfazer". Devolve null quando a peça já não existia (404).
 */
export async function excluirPecaTirandoDosVolumes(req: any, itemId: string): Promise<{ tiradas: number } | null> {
  const feito = await db.transaction(async (tx: Ex) => {
    const abertas = (await linhasDasPecas([itemId], tx)).filter((l) => !l.entregueEm).map((l) => l.tuboId);
    const ids = Array.from(new Set(abertas)).sort();
    const volumes: any[] = ids.length ? await tx.select().from(tubos).where(inArray(tubos.id, ids)).orderBy(asc(tubos.id)).for("update") : [];
    const [peca] = await pecasTravadas(tx, [itemId]);
    if (!peca || peca.deletedAt) return null;
    const mexidos: Array<{ tubo: any; tiradas: Retirada[] }> = [];
    for (const tubo of volumes) {
      if (tubo.entregueEm) continue;
      const tiradas = await tirarDoTubo(tubo, [itemId], tx);
      if (tubo.avulso && tiradas.length && (await linhasDosTubos([tubo.id], tx)).length === 0) {
        await tx.delete(tubos).where(eq(tubos.id, tubo.id));
      }
      if (tiradas.length) mexidos.push({ tubo, tiradas });
    }
    const agora = new Date();
    const apagada = await tx.update(itemsTable).set({ deletedAt: agora, updatedAt: agora } as any)
      .where(and(eq(itemsTable.id, itemId), isNull(itemsTable.deletedAt))).returning({ id: itemsTable.id });
    if (!apagada.length) throw new Recusa(404, "Item not found");
    return mexidos;
  });
  if (!feito) return null;
  for (const { tubo, tiradas } of feito) {
    await avisarRetirada(req, tubo, tiradas, "peça excluída");
    await depoisDoCommit("avisar os tubos", async () => broadcast({ type: "tubos_atualizados", eventId: tubo.eventId }));
  }
  return { tiradas: feito.reduce((t, m) => t + m.tiradas.length, 0) };
}

/** A recusa de dentro da transação da exclusão (404) — para a rota de peças responder. */
export const ehRecusaDeTubo = (e: unknown): e is { http: number; message: string } => e instanceof Recusa;

function lerIds(valor: unknown): string[] | null {
  if (valor === undefined || valor === null) return [];
  if (!Array.isArray(valor) || valor.length > 500 || valor.some((x) => typeof x !== "string" || !x)) return null;
  return Array.from(new Set(valor as string[]));
}

/**
 * O que embalar: `itens: [{ id, quantidade }]` (com quantidade) OU a lista de
 * ids de sempre (`itemIds` / `adicionar`), em que a quantidade é "tudo o que
 * está conferido e ainda não embalado". As duas formas convivem.
 */
function lerPedidos(itens: unknown, ids: unknown): Pedido[] | null {
  if (Array.isArray(itens)) {
    if (itens.length > 500) return null;
    const vistos = new Map<string, Pedido>();
    for (const x of itens) {
      if (!x || typeof x.id !== "string" || !x.id) return null;
      if (x.quantidade !== undefined && x.quantidade !== null && !Number.isInteger(Number(x.quantidade))) return null;
      vistos.set(x.id, { id: x.id, quantidade: x.quantidade === undefined || x.quantidade === null ? null : Number(x.quantidade) });
    }
    return Array.from(vistos.values());
  }
  const lista = lerIds(ids);
  return lista === null ? null : lista.map((id) => ({ id }));
}

/**
 * As fotos de um embalar/fechar: no mínimo 0 aqui (quem exige é a rota), no
 * máximo 20 por vez, todas do nosso storage — a mesma régua dos thumbs.
 */
function lerFotos(body: any): { fotos: string[]; erro?: string } {
  const cruas = Array.isArray(body?.fotos) ? body.fotos : (body?.fotoUrl ? [body.fotoUrl] : []);
  if (cruas.length > 20) return { fotos: [], erro: "No máximo 20 fotos por vez" };
  const fotos = Array.from(new Set(cruas.map(urlDeThumbValida))) as Array<string | null>;
  if (fotos.some((f) => !f)) return { fotos: [], erro: "As fotos precisam ser enviadas pelo app (endereço /objects/…)" };
  return { fotos: fotos as string[] };
}
const RECADO_FOTO_DO_EMBALAR = "Tire a foto para embalar";

// O NOME DO VOLUME (dono, 21/09: "nem sempre vai ser 'entregar tubo'"). A peça
// embalada SOZINHA mora num volume avulso — nunca "Tubo N" em mensagem, trilha
// ou tela. Os jeitos de dizer, com o artigo certo:
type Volume = { numero: number; avulso?: boolean | null };
const oVolume = (t: Volume) => (t.avulso ? "A embalagem" : `O Tubo ${t.numero}`);
const noVolume = (t: Volume) => (t.avulso ? "na embalagem" : `no Tubo ${t.numero}`);

/**
 * As fotos do tubo ACUMULAM (dono, 21/09): cada embalar traz a foto do tubo
 * com os itens, e o tubo guarda todas — sem duplicar. `fechadoEm/fechadoPor`
 * dizem quando e quem fotografou por último, e o aviso de "conteúdo alterado
 * depois da foto" zera, porque a foto nova já mostra o conteúdo novo.
 */
async function acumularFotos(tubo: { id: string; fotosFechamento?: string[] | null }, novas: string[], quem: string, agora: Date, ex: Ex = db) {
  if (!novas.length) return (tubo.fotosFechamento ?? []).length;
  const todas = Array.from(new Set([...(tubo.fotosFechamento ?? []), ...novas]));
  await ex.update(tubos).set({ fotosFechamento: todas, fechadoEm: agora, fechadoPor: quem, conteudoAlteradoEm: null } as any)
    .where(eq(tubos.id, tubo.id));
  return todas.length;
}

/**
 * As peças (cruas) de um volume, com a linha de cada uma. A cancelada e a
 * arquivada vêm junto (com `problema` na tela). Com `tx`, as peças vêm
 * TRAVADAS e a EXCLUÍDA também vem — a entrega precisa enxergá-la para recusar.
 */
async function conteudoDoTubo(tuboId: string, tx?: Ex): Promise<Array<{ p: PecaCrua; l: Linha }>> {
  const ls = await linhasDosTubos([tuboId], tx ?? db);
  if (!ls.length) return [];
  const pecas = tx
    ? await pecasTravadas(tx, ls.map((l) => l.itemId))
    : ((await db.select(COLUNAS_PECA).from(itemsTable)
      .where(and(inArray(itemsTable.id, ls.map((l) => l.itemId)), isNull(itemsTable.deletedAt)))) as PecaCrua[]);
  const porId = new Map(pecas.map((p) => [p.id, p]));
  return ls.filter((l) => porId.has(l.itemId)).map((l) => ({ p: porId.get(l.itemId)!, l }));
}

export function registerTubosRoutes(app: Express): void {
  // Os tubos de um evento, com o que tem dentro, e as peças com unidade a embalar.
  app.get("/api/events/:eventId/tubos", requireAuth, async (req, res) => {
    if (!podeMexerEmTubo(req)) return res.status(403).json({ error: SEM_PAPEL });
    try {
      const eventId = req.params.eventId;
      const [evento] = await db.select({ id: events.id, name: events.name }).from(events).where(eq(events.id, eventId));
      if (!evento) return res.status(404).json({ error: "Evento não encontrado" });

      const lista = await db.select().from(tubos).where(eq(tubos.eventId, eventId)).orderBy(asc(tubos.numero));
      const todasDoEvento = (await db.select(COLUNAS_PECA).from(itemsTable)
        .where(and(eq(itemsTable.eventId, eventId), isNull(itemsTable.deletedAt)))) as PecaCrua[];
      const pecas = visiveis(req, todasDoEvento);
      const linhasCruas = await linhasDosTubos(lista.map((t: any) => t.id));
      // A PEÇA EXCLUÍDA que ainda está num volume ABERTO (revisão de 22/09):
      // entra no retrato, com "foi excluída" como problema, para o operador
      // conseguir tirá-la — sem ela na tela, o volume ficava sem entrega e sem
      // o botão que resolve. Fora de volume aberto, a excluída continua sumida.
      const vivas = new Set(todasDoEvento.map((p) => p.id));
      const excluidasNoVolume = Array.from(new Set(linhasCruas.filter((l) => !l.entregueEm && !vivas.has(l.itemId)).map((l) => l.itemId)));
      const excluidas = excluidasNoVolume.length
        ? visiveis(req, (await db.select(COLUNAS_PECA).from(itemsTable).where(inArray(itemsTable.id, excluidasNoVolume))) as PecaCrua[])
        : [];
      const idsExcluidas = new Set(excluidas.map((p) => p.id));
      const visivel = new Map([...pecas, ...excluidas].map((p) => [p.id, p]));
      const existe = new Set([...Array.from(vivas), ...excluidasNoVolume]);
      const todasAsLinhas = linhasCruas.filter((l) => existe.has(l.itemId) && (!idsExcluidas.has(l.itemId) || !l.entregueEm));

      // Quantas linhas cada tubo tem DE VERDADE (sem o recorte do Kit): o tubo
      // é entregue inteiro, então "pronto para entregar" calculado só com as
      // visíveis prometeria um botão que o servidor recusaria com 403.
      const totalNoTubo = new Map<string, number>();
      const dentroDe = new Map<string, Array<{ p: PecaCrua; l: Linha }>>();
      for (const l of todasAsLinhas) {
        totalNoTubo.set(l.tuboId, (totalNoTubo.get(l.tuboId) ?? 0) + 1);
        const p = visivel.get(l.itemId);
        if (!p) continue;
        dentroDe.set(l.tuboId, [...(dentroDe.get(l.tuboId) ?? []), { p, l }]);
      }

      // Kit: só os tubos com alguma peça que ele vê (o tubo vazio de outro
      // usuário não é dele para mexer). Fora do Kit, todos — inclusive vazios.
      const doKit = quemVe(req).kit;
      const tubosDaTela = lista.filter((t: any) => !doKit || dentroDe.has(t.id)).map((t: any) => {
        const dentro = (dentroDe.get(t.id) ?? []).sort((a, b) => porCodigo(a.p, b.p));
        return {
          id: t.id,
          numero: t.numero,
          // Embalada sozinha: a tela nunca chama de "Tubo N".
          avulso: !!t.avulso,
          entregueEm: t.entregueEm,
          recebidoPor: t.recebidoPor,
          entreguePor: t.entreguePor,
          fotoEntregaUrl: t.fotoEntregaUrl,
          fotosFechamento: t.fotosFechamento ?? [],
          fechadoEm: t.fechadoEm,
          fechadoPor: t.fechadoPor,
          alteradoDepoisDaFoto: !!t.fechadoEm && !!t.conteudoAlteradoEm && t.conteudoAlteradoEm > t.fechadoEm,
          pecas: dentro.map(({ p, l }) => pecaParaTela(p, l)),
          unidades: dentro.reduce((s, { l }) => s + l.quantidade, 0),
          // Só unidade conferida entra em volume: nunca falta conferir. O campo
          // fica, vazio, para quem já o lia.
          faltamConferir: [] as string[],
          vePorInteiro: (totalNoTubo.get(t.id) ?? 0) === dentro.length && !dentro.some(({ p }) => p.kitRemessaId && soVisualizaKit(req)),
          prontoParaEntregar: !t.entregueEm && dentro.some(({ l }) => !l.entregueEm)
            && (totalNoTubo.get(t.id) ?? 0) === dentro.length
            && !(soVisualizaKit(req) && dentro.some(({ p }) => p.kitRemessaId))
            // Peça cancelada/arquivada ainda dentro: a entrega recusaria.
            && !dentro.some(({ p, l }) => !l.entregueEm && problemaNoVolume(p)),
        };
      });

      // "Sem tubo" agora é "tem unidade conferida ainda não embalada" — vale
      // para a conferida inteira, para a PARCIAL e para a que foi em parte.
      // O STATUS também conta (statusEmbalavel, dentro de aEmbalar): cancelada,
      // arquivada, em aprovação ou em revisão nunca aparece aqui.
      const semTubo = pecas.filter((p) => !ehEntregue(p) && statusEmbalavel(p.status) && aEmbalar(p) > 0).sort(porCodigo).map((p) => pecaParaTela(p));
      res.json({ evento, tubos: tubosDaTela, semTubo });
    } catch (error: any) {
      console.error("[tubos] falha ao listar os tubos do evento:", error);
      res.status(500).json({ error: "Não foi possível carregar os tubos." });
    }
  });

  // Todos os tubos, enxutos: o que a fila precisa para o selo "Tubo 1 (7) · Tubo 2 (3)".
  app.get("/api/tubos", requireAuth, async (req, res) => {
    if (!podeMexerEmTubo(req)) return res.status(403).json({ error: SEM_PAPEL });
    try {
      // A ABA TUBOS da Gráfica (dono, 21/09: "uma abinha para eles saberem quais
      // tubos têm o quê e administrar") pede `?detalhe=1`: TODOS os volumes com
      // evento, prazo, conteúdo com quantidade, fotos e entrega. QUATRO selects
      // no total (tubos, eventos, linhas, peças) — nunca um por tubo. A fila
      // continua com o payload enxuto de baixo.
      // O RECORTE (revisão de 22/09): as duas formas devolviam TODOS os volumes
      // da história a cada 60 s. Agora: todo volume ABERTO e o entregue há até
      // 60 dias — é o que a fila e a aba usam. O histórico mora em Registros.
      if (req.query.detalhe) {
        const lista = await db.select().from(tubos).where(volumeNaJanela()).orderBy(asc(tubos.numero));
        const idsDeEvento = Array.from(new Set(lista.map((t: any) => t.eventId)));
        const eventosDaLista = idsDeEvento.length
          ? await db.select({ id: events.id, name: events.name, truckDepartureDate: events.truckDepartureDate }).from(events).where(inArray(events.id, idsDeEvento))
          : [];
        const eventoPorId = new Map(eventosDaLista.map((e) => [e.id, e]));
        const ls = await linhasDosTubos(lista.map((t: any) => t.id));
        const idsDePeca = Array.from(new Set(ls.map((l) => l.itemId)));
        // A excluída ainda num volume ABERTO vem junto (com o problema), para ser tirada.
        const abertasPorPeca = new Set(ls.filter((l) => !l.entregueEm).map((l) => l.itemId));
        const cruas = (idsDePeca.length
          ? ((await db.select(COLUNAS_PECA).from(itemsTable).where(inArray(itemsTable.id, idsDePeca))) as PecaCrua[])
          : []).filter((p) => !p.deletedAt || abertasPorPeca.has(p.id));
        const excluida = new Set(cruas.filter((p) => p.deletedAt).map((p) => p.id));
        const existe = new Set(cruas.map((p) => p.id));
        const visivel = new Map(visiveis(req, cruas).map((p) => [p.id, p]));
        const total = new Map<string, number>();
        const dentroDe = new Map<string, Array<{ p: PecaCrua; l: Linha }>>();
        for (const l of ls) {
          if (!existe.has(l.itemId) || (excluida.has(l.itemId) && l.entregueEm)) continue;
          total.set(l.tuboId, (total.get(l.tuboId) ?? 0) + 1);
          const p = visivel.get(l.itemId);
          if (p) dentroDe.set(l.tuboId, [...(dentroDe.get(l.tuboId) ?? []), { p, l }]);
        }
        const doKit = quemVe(req).kit;
        return res.json(lista.filter((t: any) => !doKit || dentroDe.has(t.id)).map((t: any) => {
          const dentro = (dentroDe.get(t.id) ?? []).sort((x, y) => porCodigo(x.p, y.p));
          const soVe = soVisualizaKit(req) && dentro.some(({ p }) => p.kitRemessaId);
          return {
            id: t.id, numero: t.numero, avulso: !!t.avulso,
            evento: eventoPorId.get(t.eventId) ?? { id: t.eventId, name: "Evento", truckDepartureDate: null },
            criadoEm: t.createdAt,
            fotosFechamento: t.fotosFechamento ?? [], fechadoEm: t.fechadoEm, fechadoPor: t.fechadoPor,
            entregueEm: t.entregueEm, recebidoPor: t.recebidoPor, entreguePor: t.entreguePor, fotoEntregaUrl: t.fotoEntregaUrl, entregueObs: t.entregueObs,
            pecas: dentro.map(({ p, l }) => pecaParaTela(p, l)),
            unidades: dentro.reduce((u, { l }) => u + l.quantidade, 0),
            // Age quem enxerga o volume inteiro e não esbarra na trava do Kit.
            podeAgir: !t.entregueEm && dentro.length > 0 && (total.get(t.id) ?? 0) === dentro.length && !soVe,
          };
        }));
      }
      // `fechadoEm` vai junto: a fila da Gráfica mostra a hora da foto na peça embalada.
      const todos = await db.select({ id: tubos.id, numero: tubos.numero, avulso: tubos.avulso, eventId: tubos.eventId, entregueEm: tubos.entregueEm, fechadoEm: tubos.fechadoEm }).from(tubos).where(volumeNaJanela());
      // UM select para as linhas desses volumes — nunca um por tubo.
      const todasAsLinhas = await linhasDosTubos(todos.map((t) => t.id));
      let permitidas = todasAsLinhas;
      if (quemVe(req).kit) {
        // Kit: só as linhas de peça que ele vê — e só os tubos que as têm.
        const ids = Array.from(new Set(todasAsLinhas.map((l) => l.itemId)));
        const suas = new Set(visiveis(req, ids.length
          ? ((await db.select(COLUNAS_PECA).from(itemsTable).where(and(inArray(itemsTable.id, ids), isNull(itemsTable.deletedAt)))) as PecaCrua[])
          : []).map((p) => p.id));
        permitidas = todasAsLinhas.filter((l) => suas.has(l.itemId));
      }
      const porTubo = new Map<string, Array<{ itemId: string; quantidade: number; entregue: boolean }>>();
      for (const l of permitidas) porTubo.set(l.tuboId, [...(porTubo.get(l.tuboId) ?? []), { itemId: l.itemId, quantidade: l.quantidade, entregue: !!l.entregueEm }]);
      const comLinhas = todos.map((t) => ({ ...t, linhas: porTubo.get(t.id) ?? [] }));
      res.json(quemVe(req).kit ? comLinhas.filter((t) => t.linhas.length > 0) : comLinhas);
    } catch (error: any) {
      console.error("[tubos] falha ao listar tubos:", error);
      res.status(500).json({ error: "Não foi possível carregar os tubos." });
    }
  });

  // OS REGISTROS DOS VOLUMES (dono, 21/09: "inclusive isso aparecer nos registros:
  // todos os itens que foram no tubo"). UMA entrada por tubo/embalagem — e não a
  // mesma foto repetida em cada peça —, com a lista completa do que foi junto,
  // as fotos da embalagem e o comprovante. A tela Registros é de TODOS os perfis
  // (a maioria não acessa a Gráfica), então aqui NÃO há gate de papel — só a
  // sessão e o recorte do Kit, como em GET /api/photos. Só leitura.
  //
  // O CONTEÚDO É O DA ENTREGA: tubo entregue não aceita pôr nem tirar peça, e
  // a quantidade mora na LINHA (tubo_itens) — editar a peça depois não muda o
  // que o registro diz que foi junto. A trilha do tubo guarda a mesma lista.
  //
  // O RECORTE E A PÁGINA (revisão de 22/09): devolvia TODOS os volumes da
  // história. Agora a própria consulta filtra — `itemId` (a ficha: só os
  // volumes da peça), `desde` (o Período da página), `eventos` (o filtro de
  // evento), `busca` — e devolve no máximo `limite` (padrão 48, teto 500), dos
  // mais recentes para trás. A tela pede mais aumentando o limite.
  app.get("/api/registros/tubos", requireAuth, async (req, res) => {
    try {
      const q = req.query as Record<string, unknown>;
      const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "");
      const itemId = texto(q.itemId);
      const desdeBruto = texto(q.desde);
      const desde = desdeBruto ? new Date(desdeBruto) : null;
      if (desde && Number.isNaN(desde.getTime())) return res.status(400).json({ error: "desde inválido" });
      const eventos = texto(q.eventos).split(",").map((x) => x.trim()).filter(Boolean).slice(0, 200);
      const busca = texto(q.busca).slice(0, 120);
      const limiteBruto = Math.trunc(Number(q.limite));
      const limite = Number.isFinite(limiteBruto) && limiteBruto > 0 ? Math.min(limiteBruto, 500) : 48;
      const doKit = quemVe(req).kit;

      const quando = sql`coalesce(${tubos.entregueEm}, ${tubos.fechadoEm}, ${tubos.createdAt})`;
      const filtros: any[] = [sql`(${tubos.entregueEm} is not null or coalesce(array_length(${tubos.fotosFechamento}, 1), 0) > 0)`];
      if (desde) filtros.push(sql`coalesce(${tubos.entregueEm}, ${tubos.fechadoEm}) >= ${desde}`);
      if (eventos.length) filtros.push(inArray(tubos.eventId, eventos));
      if (itemId) filtros.push(sql`${tubos.id} in (select ${tuboItens.tuboId} from ${tuboItens} where ${tuboItens.itemId} = ${itemId})`);
      // Sem busca e fora do Kit, o corte é no banco; com eles, depois do filtro em memória.
      const cortaNoBanco = !busca && !doKit;
      const consulta = db.select().from(tubos).where(and(...filtros)).orderBy(sql`${quando} desc`, asc(tubos.id));
      const lista = (cortaNoBanco ? await consulta.limit(limite) : await consulta) as any[];
      if (!lista.length) return res.json([]);
      const idsDeEvento = Array.from(new Set(lista.map((t: any) => t.eventId)));
      const eventosDaLista = await db.select({ id: events.id, name: events.name }).from(events).where(inArray(events.id, idsDeEvento as string[]));
      const eventoPorId = new Map(eventosDaLista.map((e) => [e.id, e.name]));
      const ls = await linhasDosTubos(lista.map((t: any) => t.id));
      const idsDePeca = Array.from(new Set(ls.map((l) => l.itemId)));
      // A peça EXCLUÍDA continua no registro (é histórico) — sem filtro de deleted_at.
      const cruas = idsDePeca.length ? ((await db.select(COLUNAS_PECA).from(itemsTable).where(inArray(itemsTable.id, idsDePeca))) as PecaCrua[]) : [];
      const visivel = new Map(visiveis(req, cruas).map((p) => [p.id, p]));
      const semAcento = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
      const palavras = semAcento(busca).split(/ +/).filter(Boolean);
      const saida = lista.map((t: any) => {
        const dentro = ls.filter((l) => l.tuboId === t.id && visivel.has(l.itemId)).map((l) => ({ p: visivel.get(l.itemId)!, l })).sort((x, y) => porCodigo(x.p, y.p));
        return {
          id: t.id, numero: t.numero, avulso: !!t.avulso, eventId: t.eventId, eventName: eventoPorId.get(t.eventId) ?? "Evento",
          fotos: t.fotosFechamento ?? [], embaladoEm: t.fechadoEm, embaladoPor: t.fechadoPor,
          entregueEm: t.entregueEm, recebidoPor: t.recebidoPor, entreguePor: t.entreguePor, comprovante: t.fotoEntregaUrl, observacao: t.entregueObs,
          itens: dentro.map(({ p, l }) => ({ id: p.id, displayId: p.displayId, type: p.type, description: p.description, quantity: p.quantity, quantidadeNoTubo: l.quantidade, excluida: !!p.deletedAt })),
          unidades: dentro.reduce((u, { l }) => u + l.quantidade, 0),
        };
      })
        .filter((t) => !doKit || t.itens.length > 0)
        // A MESMA busca da tela (registroCasa): nº do tubo, evento, quem recebeu/embalou, código, tipo e descrição.
        .filter((t) => {
          if (!palavras.length) return true;
          const alvo = semAcento([t.avulso ? "sozinha" : `tubo ${t.numero}`, t.eventName, t.recebidoPor ?? "", t.embaladoPor ?? "", ...t.itens.flatMap((i) => [i.displayId ?? "", i.type, i.description ?? ""])].join(" "));
          return palavras.every((p) => alvo.includes(p));
        })
        .slice(0, limite);
      res.json(saida);
    } catch (error: any) {
      console.error("[tubos] falha ao listar os registros dos volumes:", error);
      res.status(500).json({ error: "Não foi possível carregar os registros dos tubos." });
    }
  });

  // Um tubo com o que tem dentro — a etiqueta lê daqui (`quantidadeNoTubo` por peça).
  app.get("/api/tubos/:id", requireAuth, async (req, res) => {
    if (!podeMexerEmTubo(req)) return res.status(403).json({ error: SEM_PAPEL });
    try {
      const [tubo] = await db.select().from(tubos).where(eq(tubos.id, req.params.id));
      if (!tubo) return res.status(404).json({ error: "Tubo não encontrado" });
      const [evento] = await db.select({ id: events.id, name: events.name, truckDepartureDate: events.truckDepartureDate })
        .from(events).where(eq(events.id, tubo.eventId));
      const dentro = (await conteudoDoTubo(tubo.id)).filter(({ p }) => pecaVisivelPara(quemVe(req), p));
      if (quemVe(req).kit && dentro.length === 0) return res.status(404).json({ error: "Tubo não encontrado" });
      // O BOOK do evento (21/09): a etiqueta do tubo segue a das peças e usa a
      // capa do book como logo no cabeçalho. O book mora nas peças do evento;
      // qualquer uma visível que o tenha serve (é o mesmo PDF para todas).
      const comBook = visiveis(req, (await db.select({ ...COLUNAS_PECA, bookUrl: itemsTable.bookUrl }).from(itemsTable)
        .where(and(eq(itemsTable.eventId, tubo.eventId), isNull(itemsTable.deletedAt), sql`${itemsTable.bookUrl} is not null`))
        .limit(50)) as Array<PecaCrua & { bookUrl: string | null }>);
      res.json({
        // fechadoEm: a etiqueta do tubo lê para o rodapé "embalado dd/mm".
        tubo: { id: tubo.id, numero: tubo.numero, avulso: !!tubo.avulso, entregueEm: tubo.entregueEm, recebidoPor: tubo.recebidoPor, fechadoEm: tubo.fechadoEm },
        evento: evento ? { ...evento, bookUrl: (comBook[0] as any)?.bookUrl ?? null } : null,
        pecas: dentro.sort((a, b) => porCodigo(a.p, b.p)).map(({ p, l }) => pecaParaTela(p, l)),
      });
    } catch (error: any) {
      console.error("[tubos] falha ao ler o tubo:", error);
      res.status(500).json({ error: "Não foi possível carregar o tubo." });
    }
  });

  // Cria o próximo tubo do evento — já com peças dentro, se vierem.
  app.post("/api/events/:eventId/tubos", requireAuth, async (req, res) => {
    if (!podeMexerEmTubo(req)) return res.status(403).json({ error: SEM_PAPEL });
    const pedidos = lerPedidos(req.body?.itens, req.body?.itemIds);
    if (pedidos === null) return res.status(400).json({ error: "itens deve ser uma lista de peças (com a quantidade, se não for tudo)" });
    const lidas = lerFotos(req.body);
    if (lidas.erro) return res.status(400).json({ error: lidas.erro });
    let criado: any = null;
    try {
      const eventId = req.params.eventId;
      const [evento] = await db.select({ id: events.id, name: events.name }).from(events).where(eq(events.id, eventId));
      if (!evento) return res.status(404).json({ error: "Evento não encontrado" });

      // Pré-checagem (frase boa e nada criado à toa); a conta que VALE é a de
      // dentro da transação, com as peças travadas.
      const previa = await planosParaEmbalar(req, eventId, pedidos);
      if (previa.recusas.length) return res.status(409).json({ error: `Não dá para embalar — ${previa.recusas.join("; ")}` });
      if (barraPecaDoKit(req, res, previa.planos.map((pl) => pl.peca))) return;
      // EMBALAR PEDE FOTO (dono, 21/09) — antes de criar o tubo, para a recusa
      // não deixar um tubo vazio para trás.
      if (previa.planos.length && lidas.fotos.length === 0) return res.status(400).json({ error: RECADO_FOTO_DO_EMBALAR });

      // EMBALAR INDIVIDUAL → volume AVULSO (uma peça só; quem pede é a tela).
      // O lote, e o tubo aberto à mão, são tubos de verdade, numerados.
      const avulso = req.body?.avulso === true && previa.planos.length === 1;
      // SEGUNDA EMBALAGEM SOZINHA DA MESMA PEÇA (revisão de 22/09): embalar 7
      // hoje e 3 amanhã, sozinha, criava OUTRO avulso — "Embalada (7) ·
      // Embalada (3)" e duas entregas da mesma peça. Se ela já tem uma
      // embalagem avulsa ABERTA, as unidades novas vão para ela.
      let existente: any = null;
      if (avulso) {
        const [achado] = await db.select({ id: tubos.id }).from(tubos)
          .innerJoin(tuboItens, eq(tuboItens.tuboId, tubos.id))
          .where(and(eq(tubos.eventId, eventId), eq(tubos.avulso, true), isNull(tubos.entregueEm), eq(tuboItens.itemId, previa.planos[0].peca.id), isNull(tuboItens.entregueEm)))
          .limit(1);
        if (achado) [existente] = await db.select().from(tubos).where(eq(tubos.id, achado.id));
      }
      const tubo = existente ?? await criarTubo(eventId, resolveActor(req).userName, avulso);
      criado = existente ? null : tubo;
      let planos: Plano[] = [];
      if (previa.planos.length) {
        planos = await db.transaction(async (tx: Ex) => {
          const travado = await travarTubo(tx, tubo.id);
          const r = await planosParaEmbalar(req, eventId, pedidos, tx);
          if (r.recusas.length) throw new Recusa(409, `Não dá para embalar — ${r.recusas.join("; ")}`);
          await colocarNoTubo(req, travado, r.planos, tx);
          await acumularFotos(travado, lidas.fotos, resolveActor(req).userName, new Date(), tx);
          return r.planos;
        });
      }
      criado = null;
      if (!existente) {
        await depoisDoCommit("registrar o volume criado", () => createAuditLog(req, "created", "tubo", tubo.id, avulso ? `Embalagem avulsa criada (${evento.name})` : `Tubo ${tubo.numero} criado (${evento.name})`));
      }
      if (planos.length) await avisarEmbalagem(req, tubo, planos, lidas.fotos.length);

      await depoisDoCommit("avisar os tubos", async () => broadcast({ type: "tubos_atualizados", eventId }));
      res.status(existente ? 200 : 201).json(tubo);
    } catch (error: any) {
      // A recusa de dentro da transação não deixa o volume recém-criado vazio para trás.
      if (criado) await db.delete(tubos).where(eq(tubos.id, criado.id)).catch(() => {});
      if (responderRecusa(res, error)) return;
      console.error("[tubos] falha ao criar tubo:", error);
      res.status(500).json({ error: "Não foi possível criar o tubo." });
    }
  });

  // Embala mais peças no volume (`adicionar` ou `itens` com quantidade) e tira linhas (`remover`).
  app.patch("/api/tubos/:id/itens", requireAuth, async (req, res) => {
    if (!podeMexerEmTubo(req)) return res.status(403).json({ error: SEM_PAPEL });
    const pedidos = lerPedidos(req.body?.itens, req.body?.adicionar);
    const remover = lerIds(req.body?.remover);
    if (pedidos === null || remover === null) return res.status(400).json({ error: "adicionar/itens e remover devem ser listas de peças" });
    if (pedidos.length === 0 && remover.length === 0) return res.status(400).json({ error: "Nada a mudar no tubo" });
    const lidas = lerFotos(req.body);
    if (lidas.erro) return res.status(400).json({ error: lidas.erro });
    const jaEntregue = (t: Volume) => `${oVolume(t)} já foi entregue — não dá para mexer no que tem dentro`;
    try {
      const [tubo] = await db.select().from(tubos).where(eq(tubos.id, req.params.id));
      if (!tubo) return res.status(404).json({ error: "Tubo não encontrado" });
      if (tubo.entregueEm) return res.status(409).json({ error: jaEntregue(tubo) });

      // A trava do Kit ANTES de qualquer escrita: as duas listas juntas, para
      // não gravar metade e recusar a outra metade.
      const tocadas = [...pedidos.map((x) => x.id), ...remover];
      const mexidas = (await db.select(COLUNAS_PECA).from(itemsTable).where(inArray(itemsTable.id, tocadas))) as PecaCrua[];
      if (barraPecaDoKit(req, res, mexidas)) return;
      // EMBALAR PEDE FOTO (dono, 21/09). "Tirar do tubo" (remover) não pede.
      // A recusa da peça vem antes da falta de foto (é a frase mais útil).
      if (pedidos.length && lidas.fotos.length === 0) {
        const previa = await planosParaEmbalar(req, tubo.eventId, pedidos);
        if (previa.recusas.length) return res.status(409).json({ error: `Não dá para embalar ${noVolume(tubo)} — ${previa.recusas.join("; ")}` });
        return res.status(400).json({ error: RECADO_FOTO_DO_EMBALAR });
      }
      const podeVer = new Set(visiveis(req, mexidas).map((p) => p.id));

      // UMA transação com o volume TRAVADO: a entrega do mesmo volume espera
      // esta terminar (ou esta encontra o volume entregue e recusa).
      const feito = await db.transaction(async (tx: Ex) => {
        const travado = await travarTubo(tx, tubo.id, jaEntregue);
        // DEADLOCK (revisão de 22/09): adicionar + remover travava as peças em
        // dois momentos (primeiro as de embalar, depois as de tirar). Duas
        // pessoas com listas cruzadas seguravam metade cada. Agora a UNIÃO é
        // travada uma vez, em ordem de id, logo depois do volume; as leituras
        // seguintes na mesma transação não esperam por nada.
        await pecasTravadas(tx, [...pedidos.map((x) => x.id), ...remover]);
        let planos: Plano[] = [];
        let virouTubo: number | null = null;
        if (pedidos.length) {
          const r = await planosParaEmbalar(req, travado.eventId, pedidos, tx);
          if (r.recusas.length) throw new Recusa(409, `Não dá para embalar ${noVolume(travado)} — ${r.recusas.join("; ")}`);
          planos = r.planos;
          // Outra peça num volume AVULSO (a tela não tem porta para isto): ele
          // deixa de ser avulso e ganha o próximo número de tubo de verdade.
          if (travado.avulso) {
            const dentro = new Set((await linhasDosTubos([travado.id], tx)).map((l) => l.itemId));
            if (planos.some((pl) => !dentro.has(pl.peca.id)) && dentro.size > 0) {
              const numero = await proximoNumero(travado.eventId, false, tx);
              await tx.update(tubos).set({ avulso: false, numero } as any).where(eq(tubos.id, travado.id));
              travado.avulso = false; travado.numero = numero; virouTubo = numero;
              // A peça que já estava lá passa a ser "Tubo N": carimba para o delta `?since=`.
              await tx.update(itemsTable).set({ updatedAt: new Date() } as any).where(inArray(itemsTable.id, Array.from(dentro)));
            }
          }
          await colocarNoTubo(req, travado, planos, tx);
          await acumularFotos(travado, lidas.fotos, resolveActor(req).userName, new Date(), tx);
        }
        let tiradas: Retirada[] = [];
        let sumiu = false;
        if (remover.length) {
          tiradas = await tirarDoTubo(travado, remover.filter((id) => podeVer.has(id)), tx);
          // "Desfazer embalagem": o volume avulso existia só para aquela peça —
          // vazio, some (não fica embalagem órfã no painel).
          if (travado.avulso && tiradas.length > 0 && (await linhasDosTubos([travado.id], tx)).length === 0) {
            await tx.delete(tubos).where(eq(tubos.id, travado.id));
            sumiu = true;
          }
        }
        return { travado, planos, tiradas, virouTubo, sumiu };
      });

      if (feito.virouTubo !== null) await depoisDoCommit("registrar o avulso que virou tubo", () => createAuditLog(req, "updated", "tubo", tubo.id, `Embalagem avulsa virou o Tubo ${feito.virouTubo}`));
      if (feito.planos.length) await avisarEmbalagem(req, feito.travado, feito.planos, lidas.fotos.length);
      await avisarRetirada(req, feito.travado, feito.tiradas);
      await depoisDoCommit("avisar os tubos", async () => broadcast({ type: "tubos_atualizados", eventId: tubo.eventId }));
      res.json({ ok: true, numero: feito.travado.numero, avulso: !!feito.travado.avulso });
    } catch (error: any) {
      if (responderRecusa(res, error)) return;
      console.error("[tubos] falha ao mudar peças do tubo:", error);
      res.status(500).json({ error: "Não foi possível mudar as peças do tubo." });
    }
  });

  // Apaga um tubo ainda não entregue. As linhas voltam a "conferida não
  // embalada" (a tabela é ON DELETE CASCADE, mas a conta e a trilha são daqui).
  app.delete("/api/tubos/:id", requireAuth, async (req, res) => {
    if (!podeMexerEmTubo(req)) return res.status(403).json({ error: SEM_PAPEL });
    try {
      const [tubo] = await db.select().from(tubos).where(eq(tubos.id, req.params.id));
      if (!tubo) return res.status(404).json({ error: "Tubo não encontrado" });
      if (tubo.entregueEm) return res.status(409).json({ error: `${oVolume(tubo)} já foi entregue e não pode ser apagado` });
      // Kit: o tubo pode ter peça de outro usuário — não é dele para apagar.
      if (quemVe(req).kit) return res.status(403).json({ error: "O usuário do Kit não apaga tubos" });
      const dentro = await conteudoDoTubo(tubo.id);
      if (barraPecaDoKit(req, res, dentro.map(({ p }) => p))) return;
      // O nome na trilha: nunca "Tubo -1" (a peça sozinha não tem número de tubo).
      const apagado = tubo.avulso ? "Embalagem avulsa apagada" : `Tubo ${tubo.numero} apagado`;
      const tiradas = await db.transaction(async (tx: Ex) => {
        const travado = await travarTubo(tx, tubo.id, (t) => `${oVolume(t)} já foi entregue e não pode ser apagado`);
        const todas = (await linhasDosTubos([travado.id], tx)).map((l) => l.itemId);
        const r = await tirarDoTubo(travado, todas, tx);
        await tx.delete(tubos).where(eq(tubos.id, travado.id));
        await acertarAtalho(todas, new Date(), tx);
        return r;
      });
      await avisarRetirada(req, tubo, tiradas, apagado);
      const devolvidas = tiradas.length;
      await createAuditLog(req, "deleted", "tubo", tubo.id,
        devolvidas ? `${apagado} — ${devolvidas} peça(s) voltaram a Conferido` : `${apagado} (estava vazio)`);
      broadcast({ type: "tubos_atualizados", eventId: tubo.eventId });
      res.json({ ok: true, devolvidas });
    } catch (error: any) {
      if (responderRecusa(res, error)) return;
      console.error("[tubos] falha ao apagar tubo:", error);
      res.status(500).json({ error: "Não foi possível apagar o tubo." });
    }
  });

  // ADICIONAR FOTOS AO TUBO (era "fechar"): opcional — o embalar já trouxe a
  // foto. ACUMULA nas que já existem e zera o aviso de "alterado". NÃO é entrega.
  app.post("/api/tubos/:id/fechar", requireAuth, async (req, res) => {
    if (!podeMexerEmTubo(req)) return res.status(403).json({ error: SEM_PAPEL });
    const lidas = lerFotos(req.body);
    if (lidas.erro) return res.status(400).json({ error: lidas.erro });
    if (lidas.fotos.length === 0) return res.status(400).json({ error: "Tire pelo menos uma foto do tubo" });
    const fotos = lidas.fotos;
    try {
      const [tubo] = await db.select().from(tubos).where(eq(tubos.id, req.params.id));
      if (!tubo) return res.status(404).json({ error: "Tubo não encontrado" });
      if (tubo.entregueEm) return res.status(409).json({ error: `${oVolume(tubo)} já foi entregue` });
      const dentro = await conteudoDoTubo(tubo.id);
      if (dentro.length === 0) return res.status(409).json({ error: `${oVolume(tubo)} está vazio — embale as peças antes de fotografar` });
      if (barraPecaDoKit(req, res, dentro.map(({ p }) => p))) return;
      if (visiveis(req, dentro.map(({ p }) => p)).length !== dentro.length) {
        return res.status(403).json({ error: `${oVolume(tubo)} tem peças fora do seu Kit` });
      }

      const quem = resolveActor(req);
      const agora = new Date();
      // Travado: duas fotos ao mesmo tempo não se apagam (a lista é lida e regravada).
      const totalDeFotos = await db.transaction(async (tx: Ex) => {
        const travado = await travarTubo(tx, tubo.id);
        const total = await acumularFotos(travado, fotos, quem.userName, agora, tx);
        // A peça mostra "fechado 14:32" a partir do tubo: carimba `updatedAt`
        // das que estão nele (abertas), senão o delta `?since=` da Gráfica não
        // as traz e a fila segue com a hora velha (revisão de 22/09).
        const ids = (await linhasDosTubos([travado.id], tx)).filter((l) => !l.entregueEm).map((l) => l.itemId);
        if (ids.length) await tx.update(itemsTable).set({ updatedAt: agora } as any).where(inArray(itemsTable.id, Array.from(new Set(ids))));
        return total;
      });
      const n = fotos.length;
      await depoisDoCommit("registrar as fotos", async () => {
        await createAuditLogsEmLote(req, dentro.map(({ p }) => ({
          action: "updated", entityType: "item", entityId: p.id,
          details: `Fotografada ${noVolume(tubo)} · ${n} ${n === 1 ? "foto" : "fotos"}`,
        })));
        await createAuditLog(req, "updated", "tubo", tubo.id, `${oVolume(tubo)} ganhou ${n} ${n === 1 ? "foto" : "fotos"} em ${quandoBR(agora)}`);
        broadcast({ type: "items_bulk_updated", itemIds: dentro.map(({ p }) => p.id), eventId: tubo.eventId });
        broadcast({ type: "tubos_atualizados", eventId: tubo.eventId });
      });
      res.json({ ok: true, numero: tubo.numero, fotos: n, totalDeFotos });
    } catch (error: any) {
      if (responderRecusa(res, error)) return;
      console.error("[tubos] falha ao guardar as fotos do tubo:", error);
      res.status(500).json({ error: "Não foi possível guardar as fotos do tubo." });
    }
  });

  // ENTREGA DO VOLUME: quem recebeu e quando, para AS QUANTIDADES que estão nele.
  //
  // Obrigatório é só QUEM RECEBEU. A foto do comprovante é SEMPRE opcional
  // (dono, 21/09: "a foto de entrega não é obrigatória, pois já tiraram a da
  // conferência e a do tubo ou da peça individual"). É a ÚNICA entrega do
  // sistema: PATCH /api/items/:id/deliver responde 409 para qualquer peça.
  //
  // Tudo numa transação com o volume e as peças TRAVADOS: quem embala ou tira
  // do mesmo volume ao mesmo tempo espera (e depois encontra o volume entregue).
  // Peça cancelada, arquivada, excluída ou devolvida à revisão dentro do volume
  // RECUSA a entrega (409, com a lista e o que fazer) — não é entregue às cegas.
  app.post("/api/tubos/:id/entregar", requireAuth, async (req, res) => {
    if (!podeMexerEmTubo(req)) return res.status(403).json({ error: "Sem permissão para registrar entrega" });
    const { photoUrl, receivedBy, notes } = req.body ?? {};
    const recebedor = typeof receivedBy === "string" ? receivedBy.trim() : "";
    if (!recebedor) {
      return res.status(400).json({ error: "Informe quem recebeu — é o que registra a entrega" });
    }
    // Foto opcional — mas, se vier, tem de ser do nosso storage (régua dos thumbs).
    const foto = typeof photoUrl === "string" && photoUrl.trim() ? urlDeThumbValida(photoUrl) : null;
    if (typeof photoUrl === "string" && photoUrl.trim() && !foto) {
      return res.status(400).json({ error: "A foto precisa ser enviada pelo app (endereço /objects/…)" });
    }
    const obs = typeof notes === "string" ? notes.trim() : "";
    try {
      const quem = resolveActor(req);
      const agora = new Date();
      const hora = quandoBR(agora);
      const feito = await db.transaction(async (tx: Ex) => {
        const tubo = await travarTubo(tx, req.params.id);
        const dentro = await conteudoDoTubo(tubo.id, tx);
        if (dentro.length === 0) throw new Recusa(409, `${oVolume(tubo)} está vazio`);
        // Entregar o volume é entregar TUDO que está nele — inclusive o que é do Kit.
        if (soVisualizaKit(req) && dentro.some(({ p }) => !!p.kitRemessaId)) throw new Recusa(403, RECADO_SO_VISUALIZA);
        if (visiveis(req, dentro.map(({ p }) => p)).length !== dentro.length) {
          throw new Recusa(403, `${oVolume(tubo)} tem peças fora do seu Kit`);
        }
        const aEntregar = dentro.filter(({ l }) => !l.entregueEm);
        if (aEntregar.length === 0) throw new Recusa(409, `Tudo que está ${noVolume(tubo)} já foi entregue`);
        // Uma peça travada pela Solicitação segura o volume inteiro (entregar é tudo que está nele).
        const travada = aEntregar.find(({ p }) => pecaTravada(p));
        if (travada) throw new Recusa(409, `${travada.p.displayId ?? "Uma peça"} ${noVolume(tubo)}: ${fraseDaTrava(travada.p)}`);
        const comProblema = aEntregar.filter(({ p }) => problemaNoVolume(p));
        if (comProblema.length) {
          const lista = comProblema.map(({ p }) => `${p.displayId ?? "peça"} ${problemaNoVolume(p)}`).join("; ");
          const codigos = comProblema.map(({ p }) => p.displayId ?? "peça").join(", ");
          const comoResolver = tubo.avulso ? `desfaça a embalagem de ${codigos}` : `tire ${codigos} do Tubo ${tubo.numero}`;
          throw new Recusa(409, `Não dá para entregar ${tubo.avulso ? "a embalagem" : `o Tubo ${tubo.numero}`} — ${lista}. Para entregar, ${comoResolver} e tente de novo.`);
        }

        for (const { p, l } of aEntregar) {
          const plano = planejarEntrega(p, l.quantidade);
          await tx.update(tuboItens).set({ entregueEm: agora } as any).where(eq(tuboItens.id, l.id));
          await tx.update(itemsTable).set({
            // RELATIVO e com teto: nunca grava um total lido fora da trava.
            deliveredQty: sql`least(${itemsTable.quantity}, coalesce(${itemsTable.deliveredQty}, 0) + ${l.quantidade})`,
            ...(foto ? { deliveryPhotoUrl: foto } : {}),
            updatedAt: agora,
            receivedBy: recebedor,
            ...(obs ? { deliveryNotes: obs } : {}),
            ...(plano.viraEntregue ? { status: "delivered", deliveredAt: agora, statusChangedAt: agora } : {}),
          } as any).where(eq(itemsTable.id, p.id));
          await tx.insert(auditLogs).values({
            ...quem,
            action: "delivered",
            entityType: "item",
            entityId: p.id,
            // "Entrega concluída (" é a frase que a medição de tempo por etapa lê.
            details: `${plano.viraEntregue ? "Entrega concluída (" : "Entrega parcial ("}${plano.deliveredQty}/${p.quantity}, recebido por: ${recebedor}) — ${l.quantidade} un. ${tubo.avulso ? "entregues" : `no Tubo ${tubo.numero}, entregue`} a ${recebedor} em ${hora}`,
          } as any);
        }
        await tx.update(tubos).set({
          entregueEm: agora,
          recebidoPor: recebedor,
          fotoEntregaUrl: foto,
          entregueObs: obs || null,
          entreguePor: quem.userName,
        } as any).where(eq(tubos.id, tubo.id));
        await tx.insert(auditLogs).values({
          ...quem,
          action: "delivered",
          entityType: "tubo",
          entityId: tubo.id,
          details: `${tubo.avulso ? "Embalagem avulsa entregue" : `Tubo ${tubo.numero} entregue`} a ${recebedor} em ${hora}${foto ? " (com foto)" : ""} — ${aEntregar.map(({ p, l }) => `${p.displayId ?? "peça"} (${l.quantidade})`).join(", ")}`,
        } as any);
        // O ATALHO `items.tubo_id`: a peça dividida que ainda tem outro volume
        // aberto passa a apontar para ELE, não para o que acabou de sair.
        await acertarAtalho(aEntregar.map(({ p }) => p.id), agora, tx);
        return { tubo, aEntregar };
      });
      const { tubo, aEntregar } = feito;

      // O evento pode ter FECHADO com esta entrega — e o aviso de "evento
      // concluído" é da Solicitação.
      const antes = await storage.getEvent(tubo.eventId);
      await updateEventStatus(tubo.eventId);
      const depois = await storage.getEvent(tubo.eventId);
      if (antes?.status !== "completed" && depois?.status === "completed") {
        const notification = await storage.createNotification({
          type: "eventCompleted",
          message: `Evento concluído: ${depois?.name} - Todos os itens foram entregues`,
          eventId: tubo.eventId,
          targetRoles: ["solicitacao"],
        });
        broadcast({ type: "notification_created", notification });
      }
      broadcast({ type: "items_bulk_updated", itemIds: aEntregar.map(({ p }) => p.id), eventId: tubo.eventId });
      broadcast({ type: "tubos_atualizados", eventId: tubo.eventId });
      res.json({ ok: true, numero: tubo.numero, avulso: !!tubo.avulso, entregues: aEntregar.length, unidades: aEntregar.reduce((s, { l }) => s + l.quantidade, 0) });
    } catch (error: any) {
      if (responderRecusa(res, error)) return;
      console.error("[tubos] falha ao entregar o tubo:", error);
      res.status(500).json({ error: "Não foi possível registrar a entrega do tubo." });
    }
  });
}
