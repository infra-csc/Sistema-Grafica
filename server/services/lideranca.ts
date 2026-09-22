// ─────────────────────────────────────────────────────────────────────────────
// TAREFAS AGENDADAS EM UMA CÓPIA SÓ.
//
// O deploy é autoscale: cada cópia do servidor sobe os mesmos relógios
// (setInterval) dos avisos, do fecho de prazos, da prioridade automática e do
// ciclo do inventário. Com três cópias, cada tarefa rodava três vezes por
// hora — os envios já eram protegidos pela reserva de disparo, mas o trabalho
// (varrer eventos, recalcular, gravar) era triplicado, inclusive em paralelo.
//
// executarComoLider(tarefa, fn, { janelaMs }):
//   1. abre uma transação e pede pg_try_advisory_xact_lock(tarefa) — se outra
//      cópia está rodando a mesma tarefa AGORA, desiste na hora (sem esperar);
//   2. com `janelaMs`, reserva a janela (reservarDisparo "tarefa:<nome>:<n>")
//      — a primeira cópia da janela roda, as outras já sabem que foi feito;
//   3. roda `fn` e solta a trava no fim da transação (não há trava a vazar:
//      cópia que morre derruba a conexão, e o Postgres solta sozinho).
// Trava por EXECUÇÃO, e não uma cópia "líder" fixa: no autoscale uma cópia
// pode ficar sem CPU entre requisições, e a líder congelada seguraria a
// tarefa para sempre. Aqui roda quem estiver acordado.
//
// Sem banco (teste, script local) roda direto. Falha ao pegar a trava →
// roda mesmo assim (FALHA ABERTA, como a reserva de disparo): trabalho em
// dobro é detectável; tarefa que para em silêncio não é.
// ─────────────────────────────────────────────────────────────────────────────
import { sql } from "drizzle-orm";

export type Resultado = "rodou" | "outra-copia-rodando" | "janela-ja-feita";

/** Número estável da trava por nome de tarefa (o Postgres quer bigint). */
function chaveDaTrava(tarefa: string): string {
  return `grafica:tarefa:${tarefa}`;
}

function semBanco(): boolean {
  return !process.env.DATABASE_URL || !!process.env.VITEST || process.env.NODE_ENV === "test";
}

export async function executarComoLider(
  tarefa: string,
  fn: () => Promise<unknown>,
  opcoes: { janelaMs?: number } = {},
): Promise<Resultado> {
  if (semBanco()) {
    await fn();
    return "rodou";
  }
  // Import tardio: sem banco (testes, scripts) este módulo nem toca o db.
  const { db } = await import("../db");
  const { reservarDisparo, desfazerReserva } = await import("./reservaDeDisparo");
  return rodarComTrava(db, tarefa, fn, opcoes, { reservar: reservarDisparo, desfazer: desfazerReserva });
}

/** O miolo, com o banco e a reserva injetáveis (os testes passam falsos). */
export async function rodarComTrava(
  db: { transaction: (cb: (tx: { execute: (q: any) => Promise<any> }) => Promise<void>) => Promise<void> },
  tarefa: string,
  fn: () => Promise<unknown>,
  opcoes: { janelaMs?: number } = {},
  reserva: { reservar: (chave: string) => Promise<boolean>; desfazer: (chave: string) => Promise<void> },
): Promise<Resultado> {
  let resultado = "rodou" as Resultado; // "as": a closure abaixo também atribui
  let rodouDentro = false as boolean;
  try {
    await db.transaction(async (tx) => {
      const r: any = await tx.execute(sql`select pg_try_advisory_xact_lock(hashtext(${chaveDaTrava(tarefa)})) as ok`);
      const ok = (r.rows ?? r)[0]?.ok === true;
      if (!ok) { resultado = "outra-copia-rodando"; return; }

      let chaveDaJanela: string | null = null;
      if (opcoes.janelaMs && opcoes.janelaMs > 0) {
        chaveDaJanela = `tarefa:${tarefa}:${Math.floor(Date.now() / opcoes.janelaMs)}`;
        if (!(await reserva.reservar(chaveDaJanela))) { resultado = "janela-ja-feita"; return; }
      }
      rodouDentro = true;
      try {
        await fn();
      } catch (erro) {
        // A janela volta a ficar livre: a próxima cópia (ou o próximo tique)
        // tenta de novo, em vez de a falha consumir a hora.
        if (chaveDaJanela) await reserva.desfazer(chaveDaJanela);
        throw erro;
      }
    });
  } catch (erro) {
    if (rodouDentro) throw erro; // o erro é da tarefa — quem chama já registra
    console.warn(`[lideranca] trava de "${tarefa}" indisponível — rodando sem ela:`, erro instanceof Error ? erro.message : erro);
    await fn();
    return "rodou";
  }
  // Só as tarefas de janela avisam no log (as de minuto em minuto encheriam).
  if (resultado !== "rodou" && opcoes.janelaMs) console.log(`[lideranca] ${tarefa}: ${resultado === "outra-copia-rodando" ? "outra cópia está rodando agora" : "já feita nesta janela por outra cópia"} — pulo`);
  return resultado;
}
