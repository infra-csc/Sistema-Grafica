// Transferir peça de evento (só admin).
import type { Express } from "express";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { db } from "../../db";
import { storage } from "../../storage";
import { requireAuth, broadcast, translateStatus, createAuditLog, updateEventStatus } from "../shared";
import { responderErro, corpoEventoFechado, PECA_NAO_ENCONTRADA } from "../../erros";
// A tela de Versões guarda o quadro calculado por 30 s. Toda escrita que mude
// versão, decisão ou book derruba esse cache na hora — senão o Atendimento
// revoga uma aprovação e continua vendo o quadro velho numa tela cujo trabalho
// é justamente conferir o que está valendo agora.
import { invalidarCacheDeVersoes } from "../versoes";
import { motivoEventoFechado, barraEventoFinalizado } from "../eventoFinalizado";

/** POST /api/items/:id/transfer-event. */
export function registrarTransferencia(app: Express): void {
  // TRANSFERIR peça de evento — SÓ ADMIN (mesma decisão do reenvio de book:
  // ação que reescreve o dono da peça passa por quem responde pela lista
  // inteira). Move só o vínculo com o evento; status, aprovações de
  // patrocinador, fotos, comentários e arquivo final seguem exatamente como
  // estavam — o pedido foi "sem mudar o status", e a leitura é "sem mudar
  // nada além do evento".
  app.post("/api/items/:id/transfer-event", requireAuth, async (req, res) => {
    try {
      if (req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas administradores podem transferir peças de evento." });
      }
      const schema = z.object({ eventId: z.string().min(1, "Informe o evento de destino") });
      const { eventId: destinoId } = schema.parse(req.body);

      const item = await storage.getItem(req.params.id);
      if (!item) return res.status(404).json({ error: "Peça não encontrada" });
      // Peça na lixeira não se transfere: restaure antes (revisão 22/09).
      if (item.deletedAt) {
        return res.status(409).json({ error: "Esta peça está na lixeira. Restaure a peça antes de transferir.", code: "ITEM_DELETED" });
      }
      // PEÇA DO KIT: a remessa é do evento de origem (mesmas datas do Kit) —
      // no destino ela ficaria pendurada numa remessa de outro evento.
      if (item.kitRemessaId) {
        return res.status(409).json({ error: "Peça do Kit pertence a uma remessa deste evento e não troca de evento. Crie a peça no evento de destino.", code: "KIT_ITEM" });
      }

      if (destinoId === item.eventId) {
        return res.status(409).json({ error: "A peça já está neste evento." });
      }
      // COMPLEMENTO e MÃE andam juntos: o complemento é o aumento da mãe (o
      // saldo, a ordenação e o "#0062-C1" dependem dela no MESMO evento).
      // Transferir só um dos lados partiria o contrato em dois eventos.
      if (item.parentItemId) {
        return res.status(409).json({ error: "Esta peça é complemento de outra e não troca de evento sozinha. Transfira a peça-mãe ou crie a peça no evento de destino.", code: "IS_COMPLEMENT" });
      }
      const complementos = await storage.getLiveComplements(item.id);
      if (complementos.length > 0) {
        return res.status(409).json({
          error: `Esta peça tem ${complementos.length === 1 ? "o complemento" : "os complementos"} ${complementos.map((c) => c.displayId).join(", ")} e não troca de evento. Cancele ${complementos.length === 1 ? "o complemento" : "os complementos"} antes ou crie a peça no evento de destino.`,
          code: "HAS_COMPLEMENTS",
        });
      }

      const [origem, destino] = await Promise.all([
        storage.getEvent(item.eventId),
        storage.getEvent(destinoId),
      ]);
      if (!destino) return res.status(404).json({ error: "Evento de destino não encontrado" });

      // Barra os dois lados: tirar uma peça de um evento finalizado reabre
      // trabalho nele, e pousar numa igualmente finalizado a faz nascer
      // invisível pras mesmas filas que já o escondem.
      if (await barraEventoFinalizado(item, res)) return;
      const motivoDestino = motivoEventoFechado(destino);
      if (motivoDestino) {
        return res.status(409).json(corpoEventoFechado(motivoDestino));
      }

      // Peça dentro de um volume ABERTO não troca de evento: o tubo é do
      // evento de origem, e ela seria entregue junto com ele no evento errado.
      const [aberta] = (await db.execute(sql`select 1 as ok from tubo_itens where item_id = ${item.id} and entregue_em is null limit 1`))?.rows ?? [];
      if (aberta) {
        return res.status(409).json({ error: "Esta peça está embalada num tubo ainda não entregue. Tire a peça do tubo antes de transferir.", code: "IN_OPEN_TUBE" });
      }
      // RESERVA DE ESTOQUE: a alocação é do evento de origem (é por ele que o
      // Estoque e a Triagem dizem "reservada para o evento X, saída dd/mm").
      // Transferir a peça deixaria a reserva apontando para o evento errado.
      // Qualquer linha conta: reserva de evento que já passou não chega aqui
      // (o evento finalizado já foi barrado acima).
      const [reservada] = (await db.execute(sql`select 1 as ok from event_inventory_allocations where item_id = ${item.id} limit 1`))?.rows ?? [];
      if (reservada) {
        return res.status(409).json({ error: "Esta peça tem peça do estoque reservada para ela. Libere a reserva antes de transferir.", code: "HAS_STOCK_RESERVATION" });
      }

      // PATROCINADORES que não estão no evento de destino: o vínculo fica (a
      // aprovação dele é parte do histórico da peça), mas quem transfere
      // precisa saber — a Vinculação do destino não oferece esse patrocinador.
      const [vinculos, doDestino] = await Promise.all([
        storage.getItemSponsors(item.id),
        storage.getEventSponsors(destinoId),
      ]);
      const noDestino = new Set(doDestino.map((es) => es.sponsorId));
      const foraIds = vinculos.map((v) => v.sponsorId).filter((id) => !noDestino.has(id));
      const patrocinadoresFora = (await Promise.all(foraIds.map((id) => storage.getSponsor(id))))
        .map((s, i) => s?.name ?? foraIds[i]);

      const eventoOrigemId = item.eventId;
      // A solicitação do Atendimento é do evento de ORIGEM: a peça sai dela, e
      // a peça solicitada volta a ficar aberta lá (como na exclusão).
      const ligadaAoPedido = !!item.pedidoDePecaLinhaId;
      const atualizado = await storage.updateItem(item.id, {
        eventId: destinoId,
        kitRemessaId: null,
        ...(ligadaAoPedido ? { pedidoDePecaId: null, pedidoDePecaLinhaId: null } : {}),
      });
      if (!atualizado) return res.status(404).json({ error: PECA_NAO_ENCONTRADA });
      if (ligadaAoPedido) {
        const { aoExcluirPeca } = await import("../pedidos-de-peca");
        await aoExcluirPeca(req, item, "transferida de evento");
      }

      await createAuditLog(
        req,
        "updated",
        "item",
        item.id,
        `Peça transferida do evento "${origem?.name ?? "—"}" para "${destino.name}" — status mantido (${translateStatus(item.status)}).`
        + (ligadaAoPedido ? " Deixou de atender a solicitação do Atendimento do evento de origem." : "")
        + (patrocinadoresFora.length ? ` Patrocinadores fora do evento de destino: ${patrocinadoresFora.join(", ")}.` : ""),
      );

      // Recalcula os dois eventos: a origem pode ter perdido a última peça
      // pendente, o destino pode ter ganhado uma.
      await Promise.all([
        updateEventStatus(eventoOrigemId).catch(() => {}),
        updateEventStatus(destinoId).catch(() => {}),
      ]);
      invalidarCacheDeVersoes();

      broadcast({ type: "item_updated", item: atualizado });

      // `avisos` vai para o toast: a transferência deu certo, mas há o que conferir.
      const avisos: string[] = [];
      if (patrocinadoresFora.length) {
        avisos.push(`${patrocinadoresFora.join(", ")} não ${patrocinadoresFora.length === 1 ? "é patrocinador" : "são patrocinadores"} de "${destino.name}" — vincule ao evento ou tire da peça.`);
      }
      if (ligadaAoPedido) avisos.push("A peça deixou de atender a solicitação do Atendimento no evento de origem, que voltou a ficar aberta.");
      res.json({ ...atualizado, avisos, patrocinadoresFora });
    } catch (error) {
      responderErro(res, error, "transferir peça de evento");
    }
  });
}
