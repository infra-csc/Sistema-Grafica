// Deadline / prazo alert background job. Extracted from server/routes.ts
// — pure relocation, same logic. Started explicitly via
// startDeadlineAlerts() from the routes orchestrator.
import { storage } from "../storage";
import { broadcast, EVENT_CLOSED_STATUS } from "../routes/shared";
import { reservarDisparo } from "./reservaDeDisparo";
import { executarComoLider } from "./lideranca";
import { deslocamentoDeFimDeSemana, FIM_DE_SEMANA_DO_CAMPO, type MarcoDoEvento } from "@shared/prazo-dates";
import { aguardandoArteDoCliente, medidaPeloLayoutAjustado, prazoDeLayoutAjustado } from "@shared/prazo-sem-aprovacao";
import { statusParaContagem } from "@shared/molde";
import { prazoDeLayoutDoEvento } from "./marcas-de-aprovacao";
import { lerDiasDaAprovacao } from "./configuracoes";

/** Fim do dia de um prazo "YYYY-MM-DD" (mesma convenção de `fimDoDiaDoPrazo`). */
function fimDoDia(dia: string): Date {
  const d = new Date(`${dia}T00:00:00Z`);
  d.setHours(23, 59, 59, 0);
  return d;
}

/** Está numa das janelas de aviso (48h / 24h antes)? */
const naJanelaDeAviso = (horas: number) => (horas <= 48 && horas > 47.5) || (horas <= 24 && horas > 23.5);

/**
 * Fim do dia do prazo: âncora + offset, com o ajuste de fim de semana do marco
 * (@shared/prazo-dates — seg–sex: sáb→sex, dom→seg; Produção Gráfica seg–sáb:
 * dom→sáb). O alerta contava o dia CRU: a Produção de domingo (que vence no
 * sábado, dono 19/10) avisaria 24h tarde, e os marcos seg–sex já avisavam
 * pelo dia errado sempre que caíam no fim de semana.
 */
export function fimDoDiaDoPrazo(ancoraMs: number, offsetDays: number, campo: MarcoDoEvento["campo"]): Date {
  const d = new Date(ancoraMs + offsetDays * 24 * 60 * 60 * 1000);
  d.setUTCDate(d.getUTCDate() + deslocamentoDeFimDeSemana(d.getUTCDay(), FIM_DE_SEMANA_DO_CAMPO[campo]));
  d.setHours(23, 59, 59, 0);
  return d;
}

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
  // Background job to check for upcoming deadlines. Uma cópia por meia hora
  // (services/lideranca.ts); o envio segue protegido pela reserva de disparo.
  setInterval(() => void executarComoLider("alertas-de-prazo", async () => {
    try {
      const allEvents = await storage.getAllEvents();
      const now = new Date();

      // A duração da Aprovação (configuração) — o N do Layout ajustado.
      const diasDaAprovacao = await lerDiasDaAprovacao();
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
          field: MarcoDoEvento["campo"];
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
          // Prazo = saída + offset, com o ajuste de fim de semana do marco, até 23:59.
          const deadlineDate = fimDoDiaDoPrazo(truckMs, offsetDays, field);
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

        // ── Layout AJUSTADO das peças "Sem patrocínio" (Pedro/dono, 26/10) ──
        // A peça sem aprovação vence o Layout no prazo ajustado (Layout + dias
        // da Aprovação): o aviso de 48h/24h do Layout do evento não fala dela.
        // É o MESMO aviso de 48h/24h do Layout, na data ajustada, para as peças
        // sem aprovação ainda em Layout ("Sem patrocínio" e "Arte do cliente" já
        // recebida). A "Arte do cliente" que espera o arquivo NÃO entra — decisão
        // validada: sem alerta automático para a arte do cliente que não chegou.
        const prazoDeLayout = prazoDeLayoutDoEvento(event);
        if (prazoDeLayout) {
          const ajustado = prazoDeLayoutAjustado(prazoDeLayout, diasDaAprovacao);
          const horas = (fimDoDia(ajustado).getTime() - now.getTime()) / (1000 * 60 * 60);
          if (naJanelaDeAviso(horas)) {
            const pecas = await storage.getItemsParaPrazos([event.id]);
            const semAprovacao = pecas.filter((it) => {
              const p = { ...it, status: statusParaContagem(it) };
              return medidaPeloLayoutAjustado(p) && !aguardandoArteDoCliente(p);
            });
            const hours = Math.round(horas);
            const alertKey = `${event.id}-layout-ajustado-${hours}h`;
            if (semAprovacao.length > 0 && await podeAlertar(alertKey)) {
              const label = "Entrega de Layouts (sem aprovação)";
              const notification = await storage.createNotification({
                type: "prazoAlert",
                message: `Prazo "${label}" em ${hours}h — ${semAprovacao.length} ${semAprovacao.length === 1 ? "peça sem aprovação" : "peças sem aprovação"} — ${event.name}`,
                eventId: event.id,
                targetRoles: ["arte", "admin"],
              });
              broadcast({ type: "prazo_alert", event, label, hoursRemaining: hours });
              broadcast({ type: "notification_created", notification });
            }
          }
        }
      }
      // KIT (23/10): a peça do Kit segue as datas do evento — os alertas acima
      // já valem para ela. Os alertas próprios das remessas (pela entrega do
      // material) deixaram de existir com as datas do Kit.
    } catch (error) {
      console.error("Error checking deadlines:", error);
    }
  }, { janelaMs: 30 * 60 * 1000 }).catch((error) => console.error("Error checking deadlines:", error)), 30 * 60 * 1000); // Check every 30 minutes
}
