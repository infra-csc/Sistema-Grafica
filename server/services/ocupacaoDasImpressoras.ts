// ─────────────────────────────────────────────────────────────────────────────
// UMA PEÇA POR VEZ POR IMPRESSORA (dono, 21/09: "caso a impressora esteja
// imprimindo algo, não dá para colocar outra; o que podemos implementar é
// TIRAR um item e COLOCAR o outro").
//
// A regra pura mora em shared/reserva-de-impressora.ts (ocupanteDaImpressora);
// aqui só a consulta: as peças em impressão são poucas (dezenas), então vêm
// todas e o filtro roda em memória, sobre as MESMAS funções que a tela usa.
// ─────────────────────────────────────────────────────────────────────────────
import { and, inArray, isNull } from "drizzle-orm";
import { db } from "../db";
import { items } from "@shared/schema";
import { doEventoNaoArquivado } from "./arquivamento";
import { rotuloDaMaquina } from "@shared/fluxo-peca";
import { ocupanteDaImpressora } from "@shared/reserva-de-impressora";

type Executor = Pick<typeof db, "select">;

/** A peça que ocupa `maquina` agora (parte ativa nela), fora `excetoId`; null = livre. */
export async function quemOcupaAImpressora(maquina: string, excetoId?: string | null, executor: Executor = db) {
  const emImpressao = await executor.select().from(items)
    // Peça de evento arquivado não ocupa impressora: ninguém a vê para tirá-la.
    .where(and(inArray(items.status, ["inProduction", "em_producao"]), isNull(items.deletedAt), doEventoNaoArquivado(items.eventId)));
  return ocupanteDaImpressora(emImpressao as any[], maquina, excetoId);
}

/** O 409 da regra — a mesma frase na rota de iniciar, na de trocar e na tela. */
export const erroImpressoraOcupada = (maquina: string, ocupante: { displayId?: string | null }) =>
  `A ${rotuloDaMaquina(maquina)} já está imprimindo ${ocupante.displayId ?? "outra peça"} — tire ela da impressora ou escolha outra`;
