// ─────────────────────────────────────────────────────────────────────────────
// ARQUIVAR UM EVENTO — o passo a passo único, usado pelo "Excluir" da tela
// (DELETE /api/events/:id) e pelo arquivamento automático 2 semanas depois
// do evento (services/arquivamento-automatico.ts).
//
//   1. conta as peças que saem de vista — ANTES de arquivar: depois, a
//      leitura de peças já não enxerga o evento;
//   2. arquiva (condicional: quem chega em segundo recebe `null` e não
//      regrava quem/quando, nem duplica a trilha e os avisos);
//   3. grava a trilha com a frase de quem chamou;
//   4. avisa as telas: `event_deleted` tira o evento; `items_bulk_updated`
//      faz a lista de peças buscar o delta, que já vem sem o evento — e o
//      cliente derruba as peças dele (aplicarDelta).
//
// Quem chama decide o gate (papel, evento existente/arquivado) e a resposta.
// ─────────────────────────────────────────────────────────────────────────────
import type { Event } from "@shared/schema";
import { storage } from "../storage";
import { broadcast, createAuditLog, type AuditActor } from "../routes/shared";

/** Status crus que contam como "já entregue" na frase da trilha e na resposta. */
const ENTREGUE = new Set(["delivered", "entregue"]);

export interface ContagemDoArquivamento {
  /** Peças vivas do evento que saíram de vista. */
  pecas: number;
  /** Quantas delas já estavam entregues. */
  entregues: number;
}

/**
 * Arquiva o evento, grava a trilha e avisa as telas. `null` quando outro
 * caminho arquivou no meio (o resultado, para quem pediu, é o mesmo).
 */
export async function arquivarEventoEAvisar(
  evento: Pick<Event, "id">,
  quem: { ator: AuditActor; arquivadoPor: string | null },
  fraseDaTrilha: (c: ContagemDoArquivamento) => string,
): Promise<ContagemDoArquivamento | null> {
  const pecas = await storage.getItemsByEvent(evento.id);
  const contagem: ContagemDoArquivamento = {
    pecas: pecas.length,
    entregues: pecas.filter((p) => ENTREGUE.has(p.status)).length,
  };

  const arquivado = await storage.arquivarEvento(evento.id, quem.arquivadoPor);
  if (!arquivado) return null;

  await createAuditLog(quem.ator, "deleted", "event", evento.id, fraseDaTrilha(contagem));

  broadcast({ type: "event_deleted", eventId: evento.id });
  if (pecas.length > 0) broadcast({ type: "items_bulk_updated", itemIds: pecas.map((p) => p.id), eventId: evento.id });

  return contagem;
}
