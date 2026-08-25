// Gestão de Prazos — visão do diretor: um GET agregado que responde
// "o que está atrasado e quem está travando" sem N+1 e sem lógica no front.
//
// Esta camada é I/O + montagem. A REGRA DE NEGÓCIO inteira (funil de 5 etapas,
// pendência acumulada, âncora de fuso, categoria, KPIs) mora em
// `../services/prazo-domain.ts`, testada em `server/__tests__/prazo-domain.test.ts`.
// O job de fecho diário (`../services/prazoSnapshots.ts`) reusa exatamente a
// mesma função — antes o cálculo estava preso a este handler e qualquer outro
// consumidor teria que reimplementá-lo (e divergir).
//
// O contrato do payload é `@shared/prazos-contract` e é o MESMO arquivo que o
// cliente importa: um campo esquecido aqui vira erro de tsc, não um número
// errado na cara do diretor.
import type { Express } from "express";
import { eq, lt, desc, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { prazoCobrancas, prazoSnapshots, prazoEventSnapshots } from "@shared/schema";
import type { Item, ItemSponsorApproval } from "@shared/schema";
import { storage } from "../storage";
import { ehBookCompleto } from "@shared/fluxo-peca";
import { requireRole, requireAuth, createAuditLog, broadcast } from "./shared";
import {
  STAGE_META,
  buildEventPrazo,
  computeKpis,
  daysSince,
  isPrazoCandidate,
  businessDayStrToMs,
  todayBusinessMs,
  todayBusinessStr,
} from "../services/prazo-domain";
import type {
  CobrancaEntry,
  CobrancaKey,
  CobrancaMap,
  DesdeOntem,
  DesdeOntemEvento,
  PrazoEvent,
  PrazosPayload,
  PrazoTrend,
  SponsorDelay,
} from "@shared/prazos-contract";

// Teto da nota combinada na cobrança. Vive no zod da rota (não no banco):
// afrouxar/apertar validação não pede migração, mudar o tipo da coluna pede.
const NOTA_MAX = 280;
// Horizonte máximo de uma promessa. Promessa para 2027 é typo de digitação,
// não compromisso — e um typo aqui envenenaria o rótulo "promessa vencida"
// para sempre naquele alvo.
const PROMESSA_MAX_DIAS = 180;

const cobrancaBodySchema = z.object({
  targetType: z.enum(["event", "sponsor"], {
    errorMap: () => ({ message: "O alvo da cobrança precisa ser um evento ou um patrocinador." }),
  }),
  targetId: z.string().min(1, "Informe qual evento ou patrocinador está sendo cobrado."),
  promisedFor: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "A data prometida precisa estar no formato dia/mês/ano.")
    .optional().nullable(),
  note: z.string().trim().max(NOTA_MAX, `A nota do combinado precisa ter no máximo ${NOTA_MAX} caracteres.`)
    .optional().nullable(),
});

/** "YYYY-MM-DD" existente de verdade (barra 2026-02-31, que o regex aceita). */
function isRealDay(day: string): boolean {
  const [y, m, d] = day.split("-").map(Number);
  const asDate = new Date(Date.UTC(y, m - 1, d));
  return asDate.getUTCFullYear() === y && asDate.getUTCMonth() === m - 1 && asDate.getUTCDate() === d;
}

export function registerPrazoRoutes(app: Express): void {
  // Leitura aberta a todo usuario autenticado (decisao do dono, 17/08): a
  // Gestao de Prazos passa a aparecer para todos. O POST de cobranca logo
  // abaixo CONTINUA sendo admin — quem nao e admin ve e nao mexe.
  app.get("/api/prazos", requireAuth, async (_req, res) => {
    try {
      const today = todayBusinessMs();
      const todayStr = todayBusinessStr();

      // Recorte ANTES do banco: só as peças dos eventos que ainda interessam.
      // `getAllItems()` trazia a história completa da empresa para descartar a
      // maior parte em JavaScript — custo que crescia com o acervo, não com o
      // trabalho em aberto, e multiplicado por cada aba vezes cada invalidação
      // de WebSocket. O filtro por "tudo entregue" continua DEPOIS do fetch,
      // porque depende justamente das peças.
      // Só a busca de peças precisa esperar a lista de candidatos; as outras
      // três continuam em paralelo, como antes.
      const [allEvents, allSponsors, openApprovals, allUsers] = await Promise.all([
        storage.getAllEvents(),
        storage.getAllSponsors(),
        storage.getOpenItemSponsorApprovals(),
        storage.getAllUsers(),
      ]);
      const candidates = allEvents.filter((ev) => isPrazoCandidate(ev, today));
      // BOOK COMPLETO fica de fora: é o trâmite do Atendimento, não uma peça (ver shared/fluxo-peca).
      const candidateItems = (await storage.getItemsByEvents(candidates.map((ev) => ev.id)))
        .filter((i) => !ehBookCompleto(i));

      const itemsByEvent = new Map<string, Item[]>();
      for (const it of candidateItems) {
        const arr = itemsByEvent.get(it.eventId);
        if (arr) arr.push(it); else itemsByEvent.set(it.eventId, [it]);
      }

      const sponsorNameById = new Map<string, string>();
      for (const s of allSponsors) sponsorNameById.set(s.id, s.name);

      // Um Map montado UMA vez alimenta "Solicitante: Fulano" no modal e
      // "conta: Ana Paula" no ranking. A tela nomeava setores e nunca pessoas —
      // e é a uma pessoa que o diretor liga. Nunca N+1: os usuários do sistema
      // cabem numa consulta só.
      const userNameById = new Map<string, string>();
      for (const u of allUsers) userNameById.set(u.id, u.name);

      // Aprovações em aberto, agrupadas por peça. Guardamos TODOS os estados
      // não-aprovados: pending/new_version_pending = bola com o PATROCINADOR;
      // awaiting_arte/rejected = bola com a ARTE. O drill mostra os dois — um
      // "—" sem explicação parecia dado quebrado quando a peça aguardava a
      // Arte refazer, não o patrocinador decidir.
      const openApprovalsByItem = new Map<string, ItemSponsorApproval[]>();
      for (const ap of openApprovals) {
        const arr = openApprovalsByItem.get(ap.itemId);
        if (arr) arr.push(ap); else openApprovalsByItem.set(ap.itemId, [ap]);
      }

      // Agregado cross-evento: quais patrocinadores estão atrasando aprovação.
      // `items` alimenta a linha expansível do ranking — o diretor vê QUAIS
      // peças cobrar sem sair da tela.
      const sponsorAgg = new Map<string, {
        name: string; pendingCount: number; maxDays: number; eventIds: Set<string>;
        items: { itemId: string; eventId: string; eventName: string; displayId: string; days: number }[];
      }>();

      const events: PrazoEvent[] = candidates
        .map((event) => buildEventPrazo(event, itemsByEvent.get(event.id) ?? [], {
          today,
          sponsorNameById,
          openApprovalsByItem,
          userNameById,
          onSponsorHolding: (info) => {
            const agg = sponsorAgg.get(info.sponsorId)
              ?? { name: info.sponsorName, pendingCount: 0, maxDays: 0, eventIds: new Set<string>(), items: [] };
            agg.pendingCount += 1;
            agg.maxDays = Math.max(agg.maxDays, info.days);
            agg.eventIds.add(info.eventId);
            agg.items.push({
              itemId: info.itemId, eventId: info.eventId, eventName: info.eventName,
              displayId: info.displayId, days: info.days,
            });
            sponsorAgg.set(info.sponsorId, agg);
          },
        }))
        .filter((e): e is PrazoEvent => e !== null)
        .sort((a, b) => new Date(a.truckDepartureDate).getTime() - new Date(b.truckDepartureDate).getTime());

      const execBySponsorId = new Map<string, string | null>();
      for (const s of allSponsors) {
        execBySponsorId.set(s.id, (s.accountExecutiveId && userNameById.get(s.accountExecutiveId)) || null);
      }

      // Ranking de patrocinadores segurando aprovação (pior primeiro):
      // mais peças pendentes desempata por espera máxima.
      const sponsorDelays: SponsorDelay[] = Array.from(sponsorAgg.entries())
        .map(([sponsorId, a]) => ({
          sponsorId,
          name: a.name,
          pendingCount: a.pendingCount,
          maxDays: a.maxDays,
          eventCount: a.eventIds.size,
          // Pior primeiro e com teto: a linha expansível é lista de cobrança,
          // não inventário — acima de 20 o diretor vai à tela do Atendimento.
          items: a.items.sort((x, y) => y.days - x.days).slice(0, 20),
          executivoConta: execBySponsorId.get(sponsorId) ?? null,
        }))
        .sort((x, y) => y.pendingCount - x.pendingCount || y.maxDays - x.maxDays);

      // KPIs derivados da CATEGORIA (fonte única) — ver `computeKpis`.
      const kpis = computeKpis(events);

      // Tendência ▲▼: comparação com o snapshot ANTERIOR mais recente (numa
      // segunda-feira, o de sexta — por isso o rótulo da UI diz "último
      // registro", não "ontem"). Este GET agora SÓ LÊ: a escrita mudou para o
      // job de `services/prazoSnapshots.ts`, porque leitura com efeito
      // colateral fazia a série virar "valor da última visita" e dias sem
      // acesso simplesmente não existiam na série.
      let trend: PrazoTrend = null;
      try {
        const [prev] = await db.select().from(prazoSnapshots)
          .where(lt(prazoSnapshots.day, todayStr))
          .orderBy(desc(prazoSnapshots.day))
          .limit(1);
        if (prev) {
          trend = {
            atrasados: kpis.atrasados - prev.atrasados,
            saidas7d: kpis.saidas7d - prev.saidas7d,
            pecasAtrasadas: kpis.pecasAtrasadas - prev.pecasAtrasadas,
            emDia: kpis.emDia - prev.emDia,
          };
        }
      } catch (e) {
        // Tabela ainda não migrada (npm run db:push pendente) não pode derrubar
        // a tela inteira — tendência simplesmente não aparece.
        console.error("prazo_snapshots indisponível (rode npm run db:push):", (e as Error).message);
      }

      // Registro de cobrança por alvo ("event:id" / "sponsor:id") — fecha o
      // loop cobrança→resultado no drill e no ranking.
      //
      // Recorte pelos ALVOS VIVOS: só as chaves que o cliente consulta —
      // os eventos deste payload e os patrocinadores do ranking. Antes o
      // bloco lia `prazo_cobrancas` INTEIRA a cada GET: a tabela é só-insert
      // (cada clique em "cobrar de novo" acrescenta linha, nada expira), então
      // o custo crescia com a HISTÓRIA da empresa, não com o trabalho em
      // aberto — no mesmo GET que acabou de ganhar `getItemsByEvents` pelo
      // mesmo motivo. Em lotes de 500 ids porque `IN (...)` vira um parâmetro
      // por id e o Postgres tem teto de parâmetros por consulta.
      const cobrancas: CobrancaMap = {};
      try {
        const alvosVivos = [
          ...events.map((ev) => ev.id),
          ...sponsorDelays.map((sp) => sp.sponsorId),
        ];
        const regs: (typeof prazoCobrancas.$inferSelect)[] = [];
        for (let i = 0; i < alvosVivos.length; i += 500) {
          const parte = await db.select().from(prazoCobrancas)
            .where(inArray(prazoCobrancas.targetId, alvosVivos.slice(i, i + 500)))
            .orderBy(desc(prazoCobrancas.createdAt));
          regs.push(...parte);
        }
        // Com mais de um lote, a concatenação intercala as ordens parciais —
        // reordena para preservar o invariante "primeira linha vista = a mais
        // recente", de que o laço abaixo depende.
        if (alvosVivos.length > 500) {
          regs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        }
        for (const r of regs) {
          // targetType vem do banco como texto livre: normalizamos aqui em vez
          // de confiar, senão uma linha legada com lixo cria uma chave que o
          // cliente nunca consulta (e some do placar sem aviso).
          if (r.targetType !== "event" && r.targetType !== "sponsor") continue;
          const key: CobrancaKey = r.targetType === "event"
            ? `event:${r.targetId}` : `sponsor:${r.targetId}`;

          const existing = cobrancas[key];
          if (!existing) {
            // Primeira linha vista = a MAIS RECENTE (order by createdAt desc).
            const daysAgo = daysSince(r.createdAt, today);
            const promessaData = r.promisedFor ?? null;
            cobrancas[key] = {
              userName: r.userName,
              createdAt: r.createdAt.toISOString(),
              daysAgo,
              total: 1,
              historico: [{ userName: r.userName, createdAt: r.createdAt.toISOString(), daysAgo }],
              promessaData,
              // Conta feita AQUI, com a âncora do negócio: o cliente não deve
              // decidir "promessa vencida" com o relógio do navegador.
              promessaDiasRestantes: promessaData
                ? Math.round((businessDayStrToMs(promessaData) - today) / 86400000)
                : null,
              nota: r.note ?? null,
              // Preenchido depois, quando os eventos já estiverem montados.
              houveMovimento: null,
            } satisfies CobrancaEntry;
          } else {
            existing.total += 1;
            // Teto de 5: o modal mostra a régua da pressão ("3 cobranças em 12
            // dias"), não o log completo — que é o que o audit log já é.
            if (existing.historico.length < 5) {
              existing.historico.push({
                userName: r.userName,
                createdAt: r.createdAt.toISOString(),
                daysAgo: daysSince(r.createdAt, today),
              });
            }
          }
        }

        // "cobrado há 5d — segue parado" era afirmado sem olhar o andamento
        // real. É uma afirmação factual sobre a equipe, exibida com nome e
        // sobrenome de quem cobrou: quando é falsa, ou gera cobrança injusta
        // ou ensina o diretor a ignorar o campo. Uma peça que se moveu DEPOIS
        // da cobrança tem waitingDays menor que daysAgo.
        //
        // Cobrança de HOJE (daysAgo === 0) fica `null`, não `false`: o relógio
        // das peças anda em dias inteiros, então no próprio dia não existe
        // medição — `some(waitingDays < 0)` era sempre falso e, 5 segundos
        // após o registro, o modal afirmava "nada se moveu desde então". A UI
        // já trata `null` como silêncio.
        for (const ev of events) {
          const entry = cobrancas[`event:${ev.id}`];
          if (!entry) continue;
          // Peça sem carimbo não vota: não dá para dizer que ela se moveu
          // nem que ficou parada, e esta é uma afirmação factual sobre a
          // equipe, exibida com nome e sobrenome de quem cobrou.
          entry.houveMovimento = entry.daysAgo === 0
            ? null
            : ev.pendingItems.some((it) => it.waitingDays !== null && it.waitingDays < entry.daysAgo);
        }
      } catch (e) {
        console.error("prazo_cobrancas indisponível (rode npm run db:push):", (e as Error).message);
      }

      // "O que mudou desde ontem": o placar diz que os atrasados subiram de 4
      // para 6; esta faixa diz QUAIS dois entraram — a primeira pergunta das
      // 8h da manhã. Try/catch próprio: sem a tabela migrada, o bloco some e o
      // resto da tela continua inteiro.
      let desdeOntem: DesdeOntem | null = null;
      try {
        const [base] = await db.select({ day: prazoEventSnapshots.day })
          .from(prazoEventSnapshots)
          .where(lt(prazoEventSnapshots.day, todayStr))
          .orderBy(desc(prazoEventSnapshots.day))
          .limit(1);

        if (base) {
          const baseRows = await db.select().from(prazoEventSnapshots)
            .where(eq(prazoEventSnapshots.day, base.day));
          const baseById = new Map(baseRows.map((r) => [r.eventId, r]));

          const entraramEmAtraso: DesdeOntemEvento[] = [];
          const sairamDoAtraso: DesdeOntemEvento[] = [];
          for (const ev of events) {
            const before = baseById.get(ev.id);
            // Evento sem linha no dia base não estava na foto — não dá para
            // afirmar TRANSIÇÃO sobre ele. Preferimos silêncio a inventar uma
            // mudança que talvez seja só um cadastro novo.
            if (!before) continue;
            const nowOverdue = ev.categoria === "atrasado";
            if (!before.hasOverdue && nowOverdue) entraramEmAtraso.push({ id: ev.id, name: ev.name });
            if (before.hasOverdue && !nowOverdue) sairamDoAtraso.push({ id: ev.id, name: ev.name });
          }

          // A soma do dia-base considera SÓ os eventos ainda no funil hoje.
          // Um evento que saiu do payload (concluído, tudo entregue ou já
          // começado) levava as peças atrasadas dele junto, e a subtração
          // creditava esse sumiço como "peças destravadas" — inflando o número
          // bom com o que foi apenas um evento virando história. A DECISÃO:
          // "destravou" só vale para peça que continua no jogo dos dois lados
          // da comparação.
          const idsHoje = new Set(events.map((ev) => ev.id));
          const pecasBase = baseRows.reduce(
            (acc, r) => acc + (idsHoje.has(r.eventId) ? r.pecasAtrasadas : 0), 0);
          const pecasHoje = events.reduce((acc, ev) => acc + ev.pecasEmAtraso, 0);
          desdeOntem = {
            baseDay: base.day,
            entraramEmAtraso,
            sairamDoAtraso,
            // Piso 0: "destravou -8 peças" não é frase de gestão. Quando o
            // saldo piora, quem conta a história é `entraramEmAtraso`.
            pecasDestravadas: Math.max(0, pecasBase - pecasHoje),
          };
        }
      } catch (e) {
        console.error("prazo_event_snapshots indisponível (rode npm run db:push):", (e as Error).message);
      }

      const payload: PrazosPayload = {
        generatedAt: new Date().toISOString(),
        // Âncora oficial do dia de NEGÓCIO. É o que permite ao cliente parar de
        // chamar `new Date()` para decidir regra: num navegador fora de
        // Brasília, entre 21h e 00h, os dois relógios discordam em um dia e o
        // KPI passava a se contradizer com o resultado do próprio clique.
        today: todayStr,
        // Ordem/rótulos das etapas: o front deriva os cabeçalhos daqui em vez
        // de manter uma cópia que quebraria sem erro numa reordenação.
        stageMeta: STAGE_META,
        events,
        sponsorDelays,
        kpis,
        trend,
        cobrancas,
        desdeOntem,
      };
      res.json(payload);
    } catch (error: any) {
      console.error("GET /api/prazos:", error);
      res.status(500).json({
        error: "Não foi possível carregar os prazos agora. Tente novamente em alguns instantes — se continuar, avise o suporte técnico.",
      });
    }
  });

  // "Marcar como cobrado": registro leve de accountability — quem cobrou o
  // quê, quando, para quando ficou prometido e o que foi combinado. Nenhum
  // estado de peça muda; é trilha de pressão gerencial.
  app.post("/api/prazos/cobrancas", requireRole("admin"), async (req, res) => {
    try {
      const parsed = cobrancaBodySchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({
          error: parsed.error.issues[0]?.message ?? "Dados da cobrança inválidos.",
        });
      }
      const { targetType, targetId } = parsed.data;
      const note = parsed.data.note?.trim() || null;
      const promisedFor = parsed.data.promisedFor || null;

      if (promisedFor) {
        const todayStr = todayBusinessStr();
        const today = todayBusinessMs();
        if (!isRealDay(promisedFor)) {
          return res.status(400).json({ error: "Essa data não existe no calendário — confira o dia prometido." });
        }
        const diff = Math.round((businessDayStrToMs(promisedFor) - today) / 86400000);
        if (diff < 0) {
          return res.status(400).json({ error: `A promessa não pode ser para uma data passada (hoje é ${todayStr}).` });
        }
        if (diff > PROMESSA_MAX_DIAS) {
          return res.status(400).json({ error: `A promessa está a mais de ${PROMESSA_MAX_DIAS} dias — confira se o ano está certo.` });
        }
      }

      // O alvo tem que EXISTIR. Antes só o formato era validado: um clique num
      // card no instante em que o evento é excluído gravava linha órfã e um
      // audit log apontando para nada — num recurso cujo valor inteiro é ser
      // verdadeiro.
      if (targetType === "event") {
        const alvo = await storage.getEvent(targetId);
        if (!alvo) return res.status(404).json({ error: "Este evento não existe mais — atualize a tela." });
      } else {
        const alvo = await storage.getSponsor(targetId);
        if (!alvo) return res.status(404).json({ error: "Este patrocinador não existe mais — atualize a tela." });
      }

      const [reg] = await db.insert(prazoCobrancas)
        .values({ targetType, targetId, userName: req.userName ?? "Sistema", promisedFor, note })
        .returning();

      const promessaTexto = promisedFor
        ? ` — prometido para ${promisedFor.slice(8, 10)}/${promisedFor.slice(5, 7)}`
        : "";
      const notaTexto = note ? ` — combinado: ${note}` : "";
      await createAuditLog(
        req.userName ?? "Sistema",
        "cobranca_registrada",
        // targetType já é "event" | "sponsor" pelo zod — o ternário antigo
        // sobre um valor validado não fazia nada.
        targetType,
        targetId,
        `Cobrança registrada na Gestão de Prazos${promessaTexto}${notaTexto}`,
      );

      // Regra da casa: toda escrita grava audit log E faz broadcast. Sem isto,
      // a cobrança de um diretor não aparecia na aba do outro — dois gestores
      // ligavam para o mesmo responsável no mesmo dia.
      broadcast({ type: "prazo_cobranca", targetType, targetId });

      res.json(reg);
    } catch (error: any) {
      console.error("POST /api/prazos/cobrancas:", error);
      res.status(500).json({
        error: "Não foi possível registrar a cobrança — a tabela pode não existir ainda (rode npm run db:push no Replit).",
      });
    }
  });
}
