// ─────────────────────────────────────────────────────────────────────────────
// PRIORIDADE AUTOMÁTICA — o job que aplica a régua de shared/prioridade-do-evento.
//
// Pedido do dono (25/08): "colocar as prioridades sozinho". A régua é a saída
// do caminhão; a decisão de convivência com o manual foi "automática + ajuste
// manual": a regra manda em todo evento SEM trava (priority_manual = false), e
// quem definir à mão trava aquele evento até limpar.
//
// Roda no boot e de hora em hora (o mesmo desenho do prazoSnapshots), e também
// é disparado pelas rotas que mexem na data do evento — assim a mudança de
// data reprioriza na hora, não no próximo tick.
//
// SEM linha de auditoria por evento, de propósito: a mudança é derivável da
// régua + data (nada de decisão humana a registrar), e um tick diário podia
// escrever dezenas de linhas de ruído na trilha. O que É decisão humana —
// travar e destravar — continua auditado na rota de prioridade.
// ─────────────────────────────────────────────────────────────────────────────
import { db } from "../db";
import { events } from "@shared/schema";
import { eq } from "drizzle-orm";
import { storage } from "../storage";
import { prioridadePelaSaida } from "@shared/prioridade-do-evento";
import { motivoEventoFinalizado, todayBusinessMs } from "@shared/prazo-dates";

export async function aplicarPrioridadeAutomatica(): Promise<{ ajustados: number }> {
  const todos = await storage.getAllEvents();
  const hojeBiz = todayBusinessMs();
  const agora = Date.now();
  let ajustados = 0;

  for (const ev of todos) {
    if ((ev as any).priorityManual) continue; // trava manual: a regra não toca
    // Evento finalizado (encerrado à mão ou já realizado) fica SEM prioridade:
    // ele saiu das filas de trabalho, e um "urgente" pendurado ali só
    // dessensibiliza o vermelho de quem ainda está em jogo.
    const finalizado = motivoEventoFinalizado(ev as any, hojeBiz) !== null;
    const saidaMs = ev.truckDepartureDate ? new Date(ev.truckDepartureDate as any).getTime() : null;
    const alvo = finalizado ? null : prioridadePelaSaida(saidaMs, agora);
    if ((ev.priority ?? null) === alvo) continue;
    await db.update(events).set({ priority: alvo }).where(eq(events.id, ev.id));
    ajustados++;
  }

  if (ajustados > 0) console.log(`[prioridadeAutomatica] ${ajustados} evento(s) repriorizado(s) pela saída do caminhão`);
  return { ajustados };
}

/**
 * Registra o job: uma vez no boot (processo que reinicia toda madrugada nunca
 * chegaria ao primeiro tick) e depois de hora em hora. Falha não derruba o
 * processo — coluna ainda não migrada (npm run db:push pendente) só significa
 * que a regra ainda não age.
 */
export function startPrioridadeAutomatica(): void {
  const tick = async () => {
    try {
      await aplicarPrioridadeAutomatica();
    } catch (e) {
      console.error("[prioridadeAutomatica] falhou (npm run db:push pendente?):", (e as Error).message);
    }
  };
  void tick();
  setInterval(tick, 60 * 60 * 1000);
}
