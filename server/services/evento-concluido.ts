// ─────────────────────────────────────────────────────────────────────────────
// O EVENTO PODE TER FECHADO COM ESTE GESTO — recalcula e, se fechou, avisa a
// Solicitação ("Evento concluído"), o mesmo aviso `eventCompleted` da entrega
// do tubo (routes/tubos.ts) e do molde produzido (routes/molde.ts).
//
// Nasceu na revisão adversarial do reaproveitamento EM TRÂNSITO (16/10): a
// peça 100% em trânsito fecha como Entregue já na liberação, no Reaproveitar
// da Gráfica, na correção ou na troca de origem — e, sendo a última pendência
// do evento, o evento ficava "em andamento" e calado até a próxima mexida.
// ─────────────────────────────────────────────────────────────────────────────
import { storage } from "../storage";
import { broadcast, updateEventStatus } from "../routes/shared";

export async function recalcularEventoEAvisar(eventId: string | null | undefined): Promise<void> {
  if (!eventId) return;
  const antes = await storage.getEvent(eventId);
  await updateEventStatus(eventId);
  const depois = await storage.getEvent(eventId);
  if (antes?.status !== "completed" && depois?.status === "completed") {
    const notification = await storage.createNotification({
      type: "eventCompleted",
      message: `Evento concluído: ${depois?.name} - Todos os itens foram entregues`,
      eventId,
      targetRoles: ["solicitacao"],
    });
    broadcast({ type: "notification_created", notification });
  }
}
