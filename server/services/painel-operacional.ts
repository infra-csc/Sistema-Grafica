// I/O do Painel operacional da gráfica (GET /api/analises/painel-operacional).
//
// A REGRA mora em @shared/painel-operacional (pura, testada). Aqui só:
//   1. os eventos da Gestão de Prazos montados EXATAMENTE como /api/prazos os
//      monta — candidatos (isPrazoCandidate), buildEventPrazo, computeKpis
//      (uma linha por evento: o Kit é peça do evento desde 23/10). Nenhuma
//      regra de prazo nova: é a mesma função, chamada daqui;
//   2. UMA consulta de peças, só com as colunas que o painel lê: as dos eventos
//      ativos + as de qualquer evento com alguma data dentro da janela do
//      realizado (60 dias) — o realizado de um evento que já saiu dos prazos
//      ainda é produção da gráfica no período. Nada de N+1; ~7 mil peças no
//      pior caso, em colunas estreitas.
import { and, gte, inArray, isNull, or, eq } from "drizzle-orm";
import { items } from "@shared/schema";
import { ehBookCompleto } from "@shared/fluxo-peca";
import {
  JANELA_DO_REALIZADO_DIAS, montarPainelOperacional, somarDias,
  type PainelOperacional, type PecaDoPainel,
} from "@shared/painel-operacional";
import type { PrazoEvent } from "@shared/prazos-contract";
import { businessDayStrToMs } from "@shared/prazo-dates";
import type { db as DbReal } from "../db";
import { storage } from "../storage";
import { doEventoNaoArquivado } from "./arquivamento";
import {
  buildEventPrazo, computeKpis, isPrazoCandidate, todayBusinessMs, todayBusinessStr,
  type DomainItem,
} from "./prazo-domain";

type Db = typeof DbReal;

/** As colunas que o painel lê (PecaDoPainel) + as que buildEventPrazo lê. */
const COLUNAS = {
  id: items.id,
  displayId: items.displayId,
  eventId: items.eventId,
  kitRemessaId: items.kitRemessaId,
  status: items.status,
  type: items.type,
  description: items.description,
  measurement: items.measurement,
  material: items.material,
  finish: items.finish,
  quantity: items.quantity,
  reuseQty: items.reuseQty,
  fileWidth: items.fileWidth,
  fileHeight: items.fileHeight,
  visualWidth: items.visualWidth,
  visualHeight: items.visualHeight,
  quantityProduced: items.quantityProduced,
  skipApproval: items.skipApproval,
  isPriority: items.isPriority,
  parentItemId: items.parentItemId,
  complementReason: items.complementReason,
  rejectedBySponsor: items.rejectedBySponsor,
  rejectedByCreator: items.rejectedByCreator,
  createdAt: items.createdAt,
  updatedAt: items.updatedAt,
  approvalThumbUpdatedAt: items.approvalThumbUpdatedAt,
  statusChangedAt: items.statusChangedAt,
  sponsorApprovedAt: items.sponsorApprovedAt,
  finalFileUpdatedAt: items.finalFileUpdatedAt,
  creatorReviewedAt: items.creatorReviewedAt,
  producedAt: items.producedAt,
  conferredAt: items.conferredAt,
} as const;

export async function carregarPainelOperacional(db: Db, agora: number = Date.now()): Promise<PainelOperacional> {
  const today = todayBusinessMs();
  const hoje = todayBusinessStr();
  // Um dia de folga no piso: a janela é em dia de Brasília, a coluna é instante.
  const desde = new Date(businessDayStrToMs(somarDias(hoje, -(JANELA_DO_REALIZADO_DIAS + 1))));

  const todosOsEventos = await storage.getAllEvents();
  const candidatos = todosOsEventos.filter((ev) => isPrazoCandidate(ev, today));
  const idsCandidatos = candidatos.map((ev) => ev.id);

  const naJanela = [
    gte(items.producedAt, desde), gte(items.conferredAt, desde), gte(items.createdAt, desde),
    gte(items.approvalThumbUpdatedAt, desde), gte(items.sponsorApprovedAt, desde),
    gte(items.finalFileUpdatedAt, desde), gte(items.creatorReviewedAt, desde),
    and(eq(items.status, "awaiting_sponsor_approval"), gte(items.statusChangedAt, desde)),
  ];
  const linhas = await db
    .select(COLUNAS)
    .from(items)
    .where(and(
      isNull(items.deletedAt),
      // Peça de evento arquivado (à mão ou pelo arquivamento automático de 2
      // semanas) não entra: a janela de 60 dias a trazia pela produção, e ela
      // aparecia nas Análises como "(evento não encontrado)".
      doEventoNaoArquivado(items.eventId),
      idsCandidatos.length ? or(inArray(items.eventId, idsCandidatos), ...naJanela) : or(...naJanela),
    ));

  // BOOK COMPLETO não é peça — nem para os prazos (como em /api/prazos), nem para o painel.
  const pecas = linhas.filter((l) => !ehBookCompleto(l));

  const candidatosSet = new Set(idsCandidatos);
  const porEvento = new Map<string, typeof pecas>();
  for (const p of pecas) {
    if (!candidatosSet.has(p.eventId)) continue;
    const l = porEvento.get(p.eventId);
    if (l) l.push(p); else porEvento.set(p.eventId, [p]);
  }

  // A MESMA montagem de /api/prazos (server/routes/prazos.ts).
  const prazos: PrazoEvent[] = candidatos
    .map((ev) => buildEventPrazo(ev, (porEvento.get(ev.id) ?? []) as DomainItem[], { today }))
    .filter((e): e is PrazoEvent => e !== null)
    .sort((a, b) => new Date(a.truckDepartureDate).getTime() - new Date(b.truckDepartureDate).getTime());

  return montarPainelOperacional({
    pecas: pecas as PecaDoPainel[],
    prazos,
    kpis: computeKpis(prazos),
    hoje,
    geradoEm: new Date(agora).toISOString(),
    nomeDoEvento: new Map(todosOsEventos.map((ev) => [ev.id, ev.name])),
  });
}
