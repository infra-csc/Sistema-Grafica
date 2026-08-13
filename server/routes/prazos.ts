// Gestão de Prazos — visão do diretor: um GET agregado que responde
// "o que está atrasado e quem está travando" sem N+1 e sem lógica no front.
//
// O cálculo dos marcos espelha a Agenda Operacional do event-detail:
// cada etapa é um offset em dias sobre a SAÍDA DO CAMINHÃO (âncora oficial
// de prazos do negócio), com ajuste de fim de semana (sáb→sex, dom→seg)
// exceto na Produção Gráfica, que roda em qualquer dia.
//
// Toda a aritmética de datas é feita em UTC sobre a data-calendário
// (YYYY-MM-DD): o servidor pode rodar em qualquer fuso e o resultado
// tem que bater com o que a UI exibe (que formata em UTC).
import type { Express } from "express";
import { storage } from "../storage";
import { requireRole } from "./shared";

type StageState = "done" | "upcoming" | "warning" | "overdue";

interface StageDef {
  key: string;
  label: string;
  offsetField: "deadlineListaImagens" | "deadlineEntregaLayouts" | "deadlineAprovacaoLayout" | "deadlineRevisaoLista" | "deadlineProducaoGrafica";
  defaultOffset: number;
  allDays: boolean; // true = não ajusta fim de semana
  // Status de item que significam "ainda não passou por esta etapa".
  pendingStatuses: string[];
}

// A ordem importa: uma etapa só está concluída quando nenhuma peça está
// nela NEM em qualquer etapa anterior (peça em rascunho também não foi
// aprovada). Os status legados entram na etapa equivalente.
const STAGE_DEFS: StageDef[] = [
  {
    key: "listaImagens", label: "Lista de Imagens",
    offsetField: "deadlineListaImagens", defaultOffset: -25, allDays: false,
    pendingStatuses: ["draft", "requested", "awaiting_linking"],
  },
  {
    key: "layouts", label: "Entrega de Layouts",
    offsetField: "deadlineEntregaLayouts", defaultOffset: -20, allDays: false,
    pendingStatuses: ["awaiting_submission"],
  },
  {
    key: "aprovacao", label: "Aprovação de Layout",
    offsetField: "deadlineAprovacaoLayout", defaultOffset: -12, allDays: false,
    pendingStatuses: ["awaiting_approval", "awaiting_sponsor_approval"],
  },
  {
    key: "revisao", label: "Revisão de Lista",
    offsetField: "deadlineRevisaoLista", defaultOffset: -8, allDays: false,
    pendingStatuses: [
      "awaiting_finalization", "sponsor_approved",
      "awaiting_final_review", "awaiting_review", "in_review", "awaiting_creator_review",
    ],
  },
  {
    key: "producao", label: "Produção Gráfica",
    offsetField: "deadlineProducaoGrafica", defaultOffset: -1, allDays: true,
    // Os 4 últimos são grafias LEGADAS em pt que circulam no banco (a
    // dispensa da Arte grava pronto_para_producao; ver items.ts:1599) —
    // sem elas a peça sumia do funil e a etapa virava verde falso.
    pendingStatuses: [
      "ready_for_production", "approved", "inProduction", "produced", "conferred",
      "pronto_para_producao", "liberado", "em_producao", "produzido",
    ],
  },
];

// "entregue" é a grafia legada de delivered — conta como pronta, não pendente.
const DELIVERED = new Set(["delivered", "entregue"]);

// status → índice da etapa em que a peça está travada (0-4).
// Fora do mapa = já passou por tudo (delivered) ou está fora do funil.
const STATUS_STAGE_RANK: Record<string, number> = {};
STAGE_DEFS.forEach((s, i) => s.pendingStatuses.forEach((st) => { STATUS_STAGE_RANK[st] = i; }));

// Cancelada/excluída/arquivada não conta como pendência nem como total.
const OUT_OF_FUNNEL = new Set(["canceled", "deleted", "archived"]);

// Dia-calendário UTC de hoje, em ms — base única de comparação.
function todayUTCms(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

// Data-calendário (UTC, meia-noite) da saída do caminhão.
function truckDayUTC(truckDepartureDate: Date | string): Date {
  const d = new Date(truckDepartureDate);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

// Marco da etapa: saída + offset, com ajuste de fim de semana quando a
// etapa não roda em todos os dias (mesma regra do event-detail).
function stageDeadline(truckDay: Date, offsetDays: number, allDays: boolean): Date {
  const d = new Date(truckDay);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  if (!allDays) {
    const dow = d.getUTCDay();
    if (dow === 6) d.setUTCDate(d.getUTCDate() - 1); // sábado → sexta
    if (dow === 0) d.setUTCDate(d.getUTCDate() + 1); // domingo → segunda
  }
  return d;
}

// Dias-calendário (UTC) desde um timestamp — "parado há Xd".
function daysSince(ts: Date | string | null | undefined, today: number): number {
  if (!ts) return 0;
  const d = new Date(ts);
  const day = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.max(0, Math.round((today - day) / 86400000));
}

// Status em que a peça está esperando decisão de patrocinador.
const AWAITING_SPONSOR = new Set(["awaiting_approval", "awaiting_sponsor_approval"]);

export function registerPrazoRoutes(app: Express): void {
  app.get("/api/prazos", requireRole("admin"), async (_req, res) => {
    try {
      const [allEvents, allItems, allSponsors, openApprovals] = await Promise.all([
        storage.getAllEvents(),
        storage.getAllItems(),
        storage.getAllSponsors(),
        storage.getOpenItemSponsorApprovals(),
      ]);

      const itemsByEvent = new Map<string, any[]>();
      for (const it of allItems) {
        const arr = itemsByEvent.get(it.eventId);
        if (arr) arr.push(it); else itemsByEvent.set(it.eventId, [it]);
      }

      const sponsorNameById = new Map<string, string>();
      for (const s of allSponsors) sponsorNameById.set(s.id, s.name);

      // Aprovações em aberto, agrupadas por peça. Guardamos TODOS os estados
      // não-aprovados: pending/new_version_pending = bola com o PATROCINADOR;
      // awaiting_arte/rejected = bola com a ARTE. O drill mostra os dois — um
      // "—" sem explicação parecia dado quebrado quando a peça aguardava a
      // Arte refazer, não o patrocinador decidir.
      const openApprovalsByItem = new Map<string, any[]>();
      for (const ap of openApprovals) {
        const arr = openApprovalsByItem.get(ap.itemId);
        if (arr) arr.push(ap); else openApprovalsByItem.set(ap.itemId, [ap]);
      }
      const SPONSOR_TURN = new Set(["pending", "new_version_pending"]);

      // Agregado cross-evento: quais patrocinadores estão atrasando aprovação.
      const sponsorAgg = new Map<string, { name: string; pendingCount: number; maxDays: number; eventIds: Set<string> }>();

      const today = todayUTCms();

      const events = allEvents
        .map((event) => {
          const eventItems = (itemsByEvent.get(event.id) ?? [])
            .filter((it) => !OUT_OF_FUNNEL.has(it.status));

          // Evento concluído, com tudo entregue ou já começado é história —
          // sai da gestão de prazos. startPassed compara DIA-calendário UTC
          // (não o instante): com timestamp à meia-noite UTC, o evento sumia
          // da tela às 21h da VÉSPERA em UTC-3 — as horas de crise.
          const allDelivered = eventItems.length > 0 && eventItems.every((it) => DELIVERED.has(it.status));
          const startPassed = today > truckDayUTC(event.startDate).getTime();
          if (event.status === "completed" || allDelivered || startPassed) return null;

          const truckDay = truckDayUTC(event.truckDepartureDate);
          const truckYear = truckDay.getUTCFullYear();
          // Mesmo guard do Painel: ano absurdo (ex.: 0206) é problema de
          // cadastro — sinalizamos em vez de calcular atraso de 600 mil dias.
          const invalidDate = truckYear < 2000 || truckYear > 2100;

          // Contagem por etapa: direta (travadas AQUI) e acumulada (aqui ou antes).
          const directCounts = new Array(STAGE_DEFS.length).fill(0);
          for (const it of eventItems) {
            const rank = STATUS_STAGE_RANK[it.status];
            if (rank !== undefined) directCounts[rank] += 1;
          }
          // Evento sem NENHUMA peça: runningPending 0 deixaria as 5 etapas
          // "done" — verde falso para um evento em que nada começou. Etapas
          // ficam neutras e o front sinaliza "sem peças cadastradas".
          const noItems = eventItems.length === 0;

          let runningPending = 0;
          const stages = STAGE_DEFS.map((def, i) => {
            runningPending += directCounts[i];
            const offset = (event as any)[def.offsetField] ?? def.defaultOffset;
            const deadline = stageDeadline(truckDay, offset, def.allDays);
            const diffDays = Math.round((deadline.getTime() - today) / 86400000);

            let state: StageState;
            if (noItems) state = "upcoming";
            else if (runningPending === 0) state = "done";
            else if (invalidDate) state = "upcoming"; // sem data confiável não há atraso confiável
            else if (diffDays < 0) state = "overdue";
            else if (diffDays <= 3) state = "warning";
            else state = "upcoming";

            return {
              key: def.key,
              label: def.label,
              deadline: deadline.toISOString().slice(0, 10),
              diffDays,
              pendingCount: runningPending,   // travadas aqui OU antes (o gate real)
              directCount: directCounts[i],   // travadas exatamente nesta etapa
              state,
            };
          });

          const deliveredCount = eventItems.filter((it) => DELIVERED.has(it.status)).length;

          // Peças pendentes para o drill-down — detalhadas de propósito: a
          // tela existe para o diretor COBRAR, então cada linha diz o que é,
          // há quantos dias está parada e (na aprovação) quem está segurando.
          const pendingItems = eventItems
            .filter((it) => STATUS_STAGE_RANK[it.status] !== undefined)
            .map((it) => {
              // APROXIMAÇÃO documentada: updatedAt é tocado por QUALQUER
              // edição (inclusive atribuir book, que varre o evento inteiro),
              // não só por transição de status. Por isso a UI rotula "sem
              // movimento há Xd" — não "parada no status há Xd". O relógio
              // exato pede uma coluna statusChangedAt (dívida registrada).
              const waitingDays = daysSince(it.updatedAt ?? it.createdAt, today);
              let sponsors: { name: string; days: number; holder: "sponsor" | "arte" }[] | undefined;
              if (AWAITING_SPONSOR.has(it.status)) {
                const open = openApprovalsByItem.get(it.id) ?? [];
                sponsors = open.map((ap) => {
                  const name = sponsorNameById.get(ap.sponsorId) ?? "Patrocinador removido";
                  // updatedAt ?? createdAt: o registro sobrevive ao ciclo
                  // reprovar→reenviar (o reset só bumpa updatedAt) — contar de
                  // createdAt cobraria o patrocinador por dias em que a bola
                  // estava com a Arte. Recém-criado, os dois são iguais.
                  const days = daysSince(ap.updatedAt ?? ap.createdAt, today);
                  const holder: "sponsor" | "arte" = SPONSOR_TURN.has(ap.status) ? "sponsor" : "arte";
                  if (holder === "sponsor") {
                    const agg = sponsorAgg.get(ap.sponsorId) ?? { name, pendingCount: 0, maxDays: 0, eventIds: new Set<string>() };
                    agg.pendingCount += 1;
                    agg.maxDays = Math.max(agg.maxDays, days);
                    agg.eventIds.add(event.id);
                    sponsorAgg.set(ap.sponsorId, agg);
                  }
                  return { name, days, holder };
                });
              }
              return {
                id: it.id,
                displayId: it.displayId,
                status: it.status,
                // Etapa calculada AQUI (fonte única): o front não mantém mais
                // um espelho do mapa status→etapa que podia divergir.
                stageIndex: STATUS_STAGE_RANK[it.status],
                type: it.type,
                description: it.description ?? null,
                quantity: it.quantity,
                waitingDays,
                sponsors,
              };
            });

          return {
            id: event.id,
            name: event.name,
            priority: event.priority ?? null,
            startDate: event.startDate,
            truckDepartureDate: event.truckDepartureDate,
            invalidDate,
            totalItems: eventItems.length,
            deliveredItems: deliveredCount,
            stages,
            pendingItems,
          };
        })
        .filter((e): e is NonNullable<typeof e> => e !== null)
        .sort((a, b) => new Date(a.truckDepartureDate).getTime() - new Date(b.truckDepartureDate).getTime());

      // Ranking de patrocinadores segurando aprovação (pior primeiro):
      // mais peças pendentes desempata por espera máxima.
      const sponsorDelays = Array.from(sponsorAgg.entries())
        .map(([sponsorId, a]) => ({
          sponsorId,
          name: a.name,
          pendingCount: a.pendingCount,
          maxDays: a.maxDays,
          eventCount: a.eventIds.size,
        }))
        .sort((x, y) => y.pendingCount - x.pendingCount || y.maxDays - x.maxDays);

      res.json({ generatedAt: new Date().toISOString(), events, sponsorDelays });
    } catch (error: any) {
      console.error("GET /api/prazos:", error);
      res.status(500).json({ error: "Não foi possível carregar os prazos" });
    }
  });
}
