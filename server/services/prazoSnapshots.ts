// Fecho diário da Gestão de Prazos — job de background.
//
// PORQUÊ existe: o snapshot era escrito DENTRO do GET /api/prazos. Três
// problemas de uma vez: (a) leitura com efeito colateral, com latência de
// escrita em toda carga de painel; (b) a série histórica virava "valor da
// última visita" em vez de fecho de dia — um domingo em que ninguém abriu a
// tela simplesmente NÃO EXISTIA na série; (c) a tendência ▲▼ e a faixa "o que
// mudou desde ontem" mentiam exatamente nos dias em que mais importava (volta
// de feriado, segunda de manhã), porque o "ontem" delas era a última vez que
// alguém entrou, não ontem.
//
// Agora o GET só lê e este job escreve, no boot e de hora em hora, usando o
// MESMO cálculo da rota (`prazo-domain`) — não há segunda implementação da
// regra para divergir.
import { inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { prazoSnapshots, prazoEventSnapshots, kitRemessas } from "@shared/schema";
import { storage, type ItemParaPrazo } from "../storage";
import {
  buildEventPrazo,
  comKit,
  eventosDoPrazo,
  idDoEventoReal,
  computeKpis,
  isPrazoCandidate,
  todayBusinessMs,
  todayBusinessStr,
} from "./prazo-domain";
import type { PrazoEvent } from "@shared/prazos-contract";

const UMA_HORA = 60 * 60 * 1000;

/**
 * Recalcula o agregado do dia corrente reusando o domínio da rota.
 * Não carrega patrocinadores nem usuários: esses só preenchem campos de
 * exibição (`solicitante`, `executivoConta`) que o snapshot não guarda.
 */
async function agregarDiaCorrente(): Promise<{ day: string; events: PrazoEvent[] }> {
  const today = todayBusinessMs();
  const day = todayBusinessStr();

  const allEvents = await storage.getAllEvents();
  const candidates = allEvents.filter((ev) => isPrazoCandidate(ev, today));
  // PERF (17/09): só as colunas que o domínio de prazos lê — mesma projeção da
  // rota (getItemsParaPrazos). O job roda no boot e de hora em hora no MESMO
  // processo que atende as telas; decodificar as 66 colunas de cada peça aqui
  // travava as requisições que chegassem naquele instante.
  const candidateItems = await storage.getItemsParaPrazos(candidates.map((ev) => ev.id));

  const itemsByEvent = new Map<string, ItemParaPrazo[]>();
  for (const it of candidateItems) {
    const arr = itemsByEvent.get(it.eventId);
    if (arr) arr.push(it); else itemsByEvent.set(it.eventId, [it]);
  }

  // KIT (14/09): o mesmo recorte da rota — cada remessa com os prazos dela.
  const idsDeRemessa = Array.from(new Set(candidateItems.map((i) => i.kitRemessaId).filter((v): v is string => !!v)));
  const remessaPorId = new Map((idsDeRemessa.length
    ? await db.select().from(kitRemessas).where(inArray(kitRemessas.id, idsDeRemessa))
    : []).map((r) => [r.id, r]));

  const events = candidates
    .flatMap((ev) => eventosDoPrazo(ev, itemsByEvent.get(ev.id) ?? [], remessaPorId))
    .map(({ evento, itens, kit }) => comKit(buildEventPrazo(evento, itens, { today }), kit))
    .filter((e): e is PrazoEvent => e !== null);

  return { day, events };
}

/** Uma passada completa: agrega e faz o upsert das duas tabelas. */
export async function runPrazoSnapshot(): Promise<void> {
  const { day, events } = await agregarDiaCorrente();
  const kpis = computeKpis(events);

  // Upsert em TODA passada (não só na primeira do dia): a linha de um dia
  // sempre carrega a observação MAIS RECENTE daquele dia e congela sozinha
  // quando o dia vira. É o que faz "desde ontem" comparar contra o fecho de
  // ontem, e não contra as 00h05 de ontem — que é o que "primeira passada
  // ganha" produziria. O custo é uma agregação por hora, a mesma de um único
  // carregamento da tela.
  await db.insert(prazoSnapshots)
    .values({
      day,
      atrasados: kpis.atrasados,
      saidas7d: kpis.saidas7d,
      pecasAtrasadas: kpis.pecasAtrasadas,
      emDia: kpis.emDia,
    })
    .onConflictDoUpdate({
      target: prazoSnapshots.day,
      set: {
        atrasados: kpis.atrasados,
        saidas7d: kpis.saidas7d,
        pecasAtrasadas: kpis.pecasAtrasadas,
        emDia: kpis.emDia,
      },
    });

  // Fecho POR EVENTO: é o que permite dizer QUAIS eventos entraram e saíram do
  // vermelho. O agregado acima só sabe dizer "subiu de 4 para 6".
  // A linha do Kit (id "<evento>#kit-<remessa>") soma no evento REAL: a tabela
  // tem chave estrangeira para events, e o fecho é por evento.
  const porEventoReal = new Map<string, { day: string; eventId: string; hasOverdue: boolean; pecasAtrasadas: number }>();
  for (const ev of events) {
    const eventId = idDoEventoReal(ev.id);
    const atual = porEventoReal.get(eventId);
    if (atual) {
      atual.hasOverdue = atual.hasOverdue || ev.categoria === "atrasado";
      atual.pecasAtrasadas += ev.pecasEmAtraso;
    } else {
      porEventoReal.set(eventId, { day, eventId, hasOverdue: ev.categoria === "atrasado", pecasAtrasadas: ev.pecasEmAtraso });
    }
  }
  const linhas = Array.from(porEventoReal.values());

  if (linhas.length > 0) {
    await db.insert(prazoEventSnapshots)
      .values(linhas)
      .onConflictDoUpdate({
        // Casa com uniqueIndex("UQ_prazo_event_snapshots_day_event").
        target: [prazoEventSnapshots.day, prazoEventSnapshots.eventId],
        set: {
          hasOverdue: sql`excluded.has_overdue`,
          pecasAtrasadas: sql`excluded.pecas_atrasadas`,
        },
      });
  }

  console.log(
    `[prazoSnapshots] ${day}: ${events.length} eventos · ${kpis.atrasados} atrasados · ` +
    `${kpis.pecasAtrasadas} peças em atraso · ${kpis.semPecas} sem peças · ${kpis.invalidCount} com data inválida`,
  );
}

/**
 * Registra o job. Roda UMA VEZ no boot (não só no primeiro tick de hora: um
 * processo que reinicia toda madrugada nunca chegaria ao tick e a série ficaria
 * vazia para sempre, sem um único erro visível) e depois de hora em hora.
 */
export function startPrazoSnapshots(): void {
  const tick = async () => {
    try {
      await runPrazoSnapshot();
    } catch (e) {
      // Tabelas ainda não migradas (npm run db:push pendente) não podem
      // derrubar o processo — o job simplesmente não grava e a tendência não
      // aparece, exatamente como o GET já degrada.
      console.error("[prazoSnapshots] falhou (rode npm run db:push no Replit):", (e as Error).message);
    }
  };

  void tick();
  setInterval(tick, UMA_HORA);
}
