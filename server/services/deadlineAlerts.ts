// Deadline / prazo alert background job. Extracted from server/routes.ts
// — pure relocation, same logic. Started explicitly via
// startDeadlineAlerts() from the routes orchestrator.
import { storage } from "../storage";
import { broadcast } from "../routes/shared";

export function startDeadlineAlerts(): void {
  // Background job to check for upcoming deadlines
  setInterval(async () => {
    try {
      const allEvents = await storage.getAllEvents();
      const now = new Date();

      for (const event of allEvents) {
        if (event.status === 'completed') continue;

        // ── Truck departure alerts (48h / 24h / 12h) ────────────────────────
        const departure = new Date(event.truckDepartureDate);
        const hoursUntilDeparture = (departure.getTime() - now.getTime()) / (1000 * 60 * 60);

        if (
          (hoursUntilDeparture <= 48 && hoursUntilDeparture > 47.5) ||
          (hoursUntilDeparture <= 24 && hoursUntilDeparture > 23.5) ||
          (hoursUntilDeparture <= 12 && hoursUntilDeparture > 11.5)
        ) {
          const hours = Math.floor(hoursUntilDeparture);
          const notification = await storage.createNotification({
            type: "deadlineAlert",
            message: `ALERTA: Faltam ${hours}h para saída do caminhão - ${event.name}`,
            eventId: event.id,
            targetRoles: ["arte", "grafica", "solicitacao"],
          });
          broadcast({ type: "deadline_alert", event, hoursRemaining: hours });
          broadcast({ type: "notification_created", notification });
        }

        // ── Prazo alerts (48h / 24h before each configurable deadline) ──────
        if (!event.truckDepartureDate) continue;

        const truckMs = new Date(event.truckDepartureDate).getTime();

        const prazos: Array<{
          field: keyof typeof event;
          label: string;
          roles: string[];
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
    } catch (error) {
      console.error("Error checking deadlines:", error);
    }
  }, 30 * 60 * 1000); // Check every 30 minutes
}
