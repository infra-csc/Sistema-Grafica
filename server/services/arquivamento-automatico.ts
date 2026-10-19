// ─────────────────────────────────────────────────────────────────────────────
// ARQUIVAMENTO AUTOMÁTICO — 2 semanas depois da data do evento.
//
// Pedido do dono (19/10): "excluir automaticamente do sistema os eventos que
// já foram realizados, umas 2 semanas pra frente; inativar na gráfica nesses
// casos". Escolheu ARQUIVAR, não apagar: é o mesmo arquivar do botão Excluir
// (services/arquivar-evento.ts) — o evento some de todas as listas, as peças
// dele saem da Gráfica, do Painel, das Análises e do "Exportar Excel", e a
// tela de Arquivados (admin) restaura tudo como estava.
//
// A REGRA (deveArquivarAutomaticamente — pura, recebe "agora"):
//   · evento NÃO arquivado e com data (`start_date`, gravada à meia-noite
//     UTC = o dia do evento; ano absurdo conta como sem data, a mesma régua
//     de eventDayMs);
//   · hoje, no fuso de Brasília, >= dia do evento + 14 dias. Evento no dia
//     01/10 é arquivado a partir de 15/10 (00:00 de Brasília);
//   · REABERTO À MÃO depois da data não é arquivado: quem reabriu disse que
//     ainda há trabalho ali (a mesma licença de motivoEventoFinalizado).
//     Encerrar de novo limpa a marca, e a regra volta a valer;
//   · RESTAURADO pelo admin depois de vencido não é arquivado de novo: a
//     pessoa trouxe de volta sabendo. Para tirar, é o Excluir da tela.
//
// O AGENDADOR: roda pouco depois de o processo subir (o deploy reinicia com
// frequência; um relógio só diário nunca chegaria ao primeiro tique) e depois
// uma vez por dia. Uma cópia por vez (services/lideranca.ts: trava do
// Postgres por execução + janela de 1h); e o arquivar é condicional, então
// duas cópias juntas nunca gravam a trilha ou avisam em dobro. Erro não
// derruba o processo: vira log, e o próximo tique tenta de novo.
//
// Desliga com ARQUIVAMENTO_AUTOMATICO_ENABLED=false (ligado por padrão).
// ─────────────────────────────────────────────────────────────────────────────
import type { Event } from "@shared/schema";
import { DIAS_PARA_ARQUIVAR, ARQUIVADO_POR_AUTOMATICO } from "@shared/arquivamento-automatico";
import { eventDayMs, spDayMs } from "@shared/prazo-dates";
import { storage } from "../storage";
import { SYSTEM_ACTOR } from "../routes/shared";
import { executarComoLider } from "./lideranca";
import { arquivarEventoEAvisar } from "./arquivar-evento";

const DIA_MS = 24 * 60 * 60 * 1000;
const UMA_HORA = 60 * 60 * 1000;
/** Atraso da primeira rodada: deixa o processo terminar de subir antes de varrer. */
export const ATRASO_NA_PARTIDA_MS = 2 * 60 * 1000;
export const INTERVALO_MS = DIA_MS;

/** O mínimo do evento que a regra lê. */
export type EventoArquivavel = {
  startDate?: Date | string | null;
  arquivadoEm?: Date | string | null;
  reopenedAt?: Date | string | null;
  restauradoEm?: Date | string | null;
};

function instante(v: Date | string | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const t = (v instanceof Date ? v : new Date(v)).getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * O dia (ms da meia-noite UTC do dia-calendário) a partir do qual o evento
 * é arquivado; `null` quando não há data utilizável — sem âncora, nunca.
 */
export function diaDoArquivamento(ev: Pick<EventoArquivavel, "startDate">): number | null {
  const dia = eventDayMs(ev.startDate);
  return dia === null ? null : dia + DIAS_PARA_ARQUIVAR * DIA_MS;
}

/** A regra inteira (ver o topo do arquivo). */
export function deveArquivarAutomaticamente(ev: EventoArquivavel, agora: Date): boolean {
  if (ev.arquivadoEm) return false;
  const diaDoEvento = eventDayMs(ev.startDate);
  const limite = diaDoArquivamento(ev);
  if (diaDoEvento === null || limite === null) return false;
  if (spDayMs(agora) < limite) return false;

  const reaberto = instante(ev.reopenedAt);
  if (reaberto !== null && reaberto > diaDoEvento) return false;

  const restaurado = instante(ev.restauradoEm);
  if (restaurado !== null && spDayMs(new Date(restaurado)) >= limite) return false;

  return true;
}

/** Os eventos da lista que vencem hoje (ou já tinham vencido). */
export function eventosParaArquivar<T extends EventoArquivavel>(eventos: readonly T[], agora: Date): T[] {
  return eventos.filter((ev) => deveArquivarAutomaticamente(ev, agora));
}

/** "05/10/2026" — o dia do evento, lido em UTC (a convenção das datas de evento). */
function diaBR(ev: Pick<EventoArquivavel, "startDate">): string {
  const dia = eventDayMs(ev.startDate);
  if (dia === null) return "—";
  const iso = new Date(dia).toISOString();
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

/** A frase da trilha de auditoria de um arquivamento automático. */
export function fraseDoArquivamentoAutomatico(ev: Pick<Event, "name"> & Pick<EventoArquivavel, "startDate">, pecas: number, entregues: number): string {
  return `Evento "${ev.name}" arquivado automaticamente ${DIAS_PARA_ARQUIVAR} dias após a data do evento (${diaBR(ev)}) — `
    + `${pecas} ${pecas === 1 ? "peça saiu" : "peças saíram"} de vista (${entregues} já ${entregues === 1 ? "entregue" : "entregues"}). `
    + "Nada foi apagado: restaurar devolve tudo como estava";
}

export interface ResultadoDoArquivamento {
  arquivados: number;
  pecas: number;
  falhas: number;
}

/**
 * Uma rodada: arquiva cada evento vencido, um por vez. A falha de um evento
 * não para os outros (vira log e conta em `falhas`).
 */
export async function arquivarEventosVencidos(agora: Date = new Date()): Promise<ResultadoDoArquivamento> {
  const vencidos = eventosParaArquivar(await storage.getAllEvents(), agora);
  const resultado: ResultadoDoArquivamento = { arquivados: 0, pecas: 0, falhas: 0 };

  for (const ev of vencidos) {
    try {
      const contagem = await arquivarEventoEAvisar(
        ev,
        { ator: SYSTEM_ACTOR, arquivadoPor: ARQUIVADO_POR_AUTOMATICO },
        ({ pecas, entregues }) => fraseDoArquivamentoAutomatico(ev, pecas, entregues),
      );
      if (!contagem) continue; // outra cópia (ou um admin) arquivou no meio
      resultado.arquivados += 1;
      resultado.pecas += contagem.pecas;
    } catch (erro) {
      resultado.falhas += 1;
      console.error(`[arquivamento-automatico] falhou ao arquivar "${ev.name}" (${ev.id}):`, erro instanceof Error ? erro.message : erro);
    }
  }

  if (resultado.arquivados > 0 || resultado.falhas > 0) {
    console.log(`[arquivamento-automatico] ${resultado.arquivados} evento(s) arquivado(s) (${resultado.pecas} peça(s) saíram de vista)${resultado.falhas ? `; ${resultado.falhas} falha(s)` : ""}`);
  }
  return resultado;
}

/** Uma rodada protegida: nunca rejeita (erro vira log). */
export async function rodadaDoArquivamentoAutomatico(agora?: Date): Promise<void> {
  try {
    await executarComoLider("arquivamento-automatico", () => arquivarEventosVencidos(agora), { janelaMs: UMA_HORA });
  } catch (erro) {
    console.error("[arquivamento-automatico] a rodada falhou:", erro instanceof Error ? erro.message : erro);
  }
}

/** Ligado por padrão; `ARQUIVAMENTO_AUTOMATICO_ENABLED=false` desliga. */
export function arquivamentoAutomaticoLigado(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.ARQUIVAMENTO_AUTOMATICO_ENABLED ?? "").trim().toLowerCase() !== "false";
}

/**
 * Registra o agendador: uma rodada ATRASO_NA_PARTIDA_MS depois de subir e
 * depois uma por dia. Devolve como parar (os testes usam).
 */
export function startArquivamentoAutomatico(): { parar: () => void } {
  if (!arquivamentoAutomaticoLigado()) {
    console.log("[arquivamento-automatico] desligado (ARQUIVAMENTO_AUTOMATICO_ENABLED=false)");
    return { parar: () => {} };
  }
  const partida = setTimeout(() => { void rodadaDoArquivamentoAutomatico(); }, ATRASO_NA_PARTIDA_MS);
  const diario = setInterval(() => { void rodadaDoArquivamentoAutomatico(); }, INTERVALO_MS);
  return {
    parar: () => {
      clearTimeout(partida);
      clearInterval(diario);
    },
  };
}
