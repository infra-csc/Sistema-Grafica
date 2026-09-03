// Deadline / prazo alert background job. Extracted from server/routes.ts
// — pure relocation, same logic. Started explicitly via
// startDeadlineAlerts() from the routes orchestrator.
import { storage } from "../storage";
import { broadcast, EVENT_CLOSED_STATUS } from "../routes/shared";
import { reservarDisparo } from "./reservaDeDisparo";

// Deduplication: track alert keys already sent in this process lifetime.
// Key format: "<eventId>-departure-<hours>h" or "<eventId>-<label>-<hours>h"
// Prevents duplicate notifications if the service restarts mid-window or
// the 30-minute tick fires twice inside the same ±0.5h alert window.
const sentAlertKeys = new Set<string>();

// A MEMÓRIA DO PROCESSO NÃO BASTA MAIS (01/09). O deploy roda em autoscale:
// cada réplica tem o próprio Set, então três réplicas criavam três vezes a
// mesma notificação de prazo — o mesmo defeito que triplicou os e-mails.
// O Set continua como filtro barato (evita ida ao banco a cada tique); quem
// decide é a reserva, que é atômica e compartilhada.
async function podeAlertar(chave: string): Promise<boolean> {
  if (sentAlertKeys.has(chave)) return false;
  sentAlertKeys.add(chave);
  return await reservarDisparo(`alerta:${chave}`);
}

export function startDeadlineAlerts(): void {
  // Background job to check for upcoming deadlines
  setInterval(async () => {
    try {
      const allEvents = await storage.getAllEvents();
      const now = new Date();

      for (const event of allEvents) {
        // Encerrado à mão sai do alerta pela MESMA porta do concluído: um
        // evento que alguém fechou não pode continuar disparando "faltam 12h
        // para a saída" para arte, gráfica e solicitação.
        if (event.status === 'completed' || event.status === EVENT_CLOSED_STATUS) continue;

        // ── Truck departure alerts (48h / 24h / 12h) ────────────────────────
        const departure = new Date(event.truckDepartureDate);
        const hoursUntilDeparture = (departure.getTime() - now.getTime()) / (1000 * 60 * 60);

        if (
          (hoursUntilDeparture <= 48 && hoursUntilDeparture > 47.5) ||
          (hoursUntilDeparture <= 24 && hoursUntilDeparture > 23.5) ||
          (hoursUntilDeparture <= 12 && hoursUntilDeparture > 11.5)
        ) {
          const hours = Math.floor(hoursUntilDeparture);
          const alertKey = `${event.id}-departure-${hours}h`;
          if (await podeAlertar(alertKey)) {
            const notification = await storage.createNotification({
              type: "deadlineAlert",
              message: `ALERTA: Faltam ${hours}h para saída do caminhão - ${event.name}`,
              eventId: event.id,
              targetRoles: ["arte", "grafica", "solicitacao"],
            });
            broadcast({ type: "deadline_alert", event, hoursRemaining: hours });
            broadcast({ type: "notification_created", notification });
          }
        }

        // ── Prazo alerts (48h / 24h before each configurable deadline) ──────
        if (!event.truckDepartureDate) continue;

        const truckMs = new Date(event.truckDepartureDate).getTime();

        type Role = "solicitacao" | "admin" | "arte" | "grafica" | "atendimento";
        const prazos: Array<{
          field: keyof typeof event;
          label: string;
          roles: Role[];
        }> = [
          { field: "deadlineListaImagens",   label: "Lista de Imagens",    roles: ["solicitacao", "admin"] },
          { field: "deadlineEntregaLayouts", label: "Entrega de Layouts",  roles: ["arte", "admin"] },
          { field: "deadlineAprovacaoLayout",label: "Aprovação de Layout", roles: ["atendimento", "arte", "admin"] },
          { field: "deadlineRevisaoLista",   label: "Revisão de Lista",    roles: ["solicitacao", "admin"] },
          { field: "deadlineProducaoGrafica",label: "Produção Gráfica",    roles: ["grafica", "admin"] },
        ];

        for (const { field, label, roles } of prazos) {
          const offsetDays = event[field] as number | null;
          if (offsetDays == null) continue;

          // Deadline = truck date + offset days, treated as end-of-day (23:59)
          const deadlineDate = new Date(truckMs + offsetDays * 24 * 60 * 60 * 1000);
          deadlineDate.setHours(23, 59, 59, 0);
          const hoursUntil = (deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60);

          if (
            (hoursUntil <= 48 && hoursUntil > 47.5) ||
            (hoursUntil <= 24 && hoursUntil > 23.5)
          ) {
            const hours = Math.round(hoursUntil);
            const alertKey = `${event.id}-${label}-${hours}h`;
            if (await podeAlertar(alertKey)) {
              const notification = await storage.createNotification({
                type: "prazoAlert",
                message: `Prazo "${label}" em ${hours}h — ${event.name}`,
                eventId: event.id,
                targetRoles: roles,
              });
              broadcast({ type: "prazo_alert", event, label, hoursRemaining: hours });
              broadcast({ type: "notification_created", notification });
            }
          }
        }
      }
    } catch (error) {
      console.error("Error checking deadlines:", error);
    }
  }, 30 * 60 * 1000); // Check every 30 minutes
}
