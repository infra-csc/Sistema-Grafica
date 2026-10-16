// ─────────────────────────────────────────────────────────────────────────────
// A ORIGEM DO REAPROVEITAMENTO, marcada ou trocada depois (dono, 16/10).
//
//   PATCH /api/items/:id/origem-reaproveitamento
//     { origemReaproveitamento: "estoque" | "em_transito" | null, obsReaproveitamento?: string }
//
// É o botão discreto "Origem do reaproveitamento" na ficha e na linha da peça
// reaproveitada. As outras portas (Reaproveitar da Gráfica, a Revisão Final,
// o formulário da peça) gravam a origem junto com o reaproveitamento; esta é a
// que corrige depois.
//
// Estoque ↔ em trânsito muda a CONTA FÍSICA (shared/origem-do-reaproveitamento):
// no fim do fluxo a etapa é refeita pela mesma régua da conferência, da
// embalagem e da entrega — marcar "em trânsito" pode fechar a peça como
// Entregue; desmarcar a devolve ao galpão (Produzido: as reaproveitadas passam
// a ser conferidas). Recusa quando o galpão já conferiu mais do que sobraria.
//
// SEM a guarda de evento finalizado (como a conferência): não produz nada —
// diz de onde vem o que já é reaproveitamento, e o caminhão conjugado costuma
// ser acertado justamente perto do evento.
//
// Papéis: os mesmos que marcam reaproveitamento — admin e Solicitação em
// qualquer etapa do funil; a Gráfica da liberação em diante (é quando a peça
// é dela). A tabela: shared/maquina-de-estados.ts.
// ─────────────────────────────────────────────────────────────────────────────
import type { Express } from "express";
import { storage } from "../../storage";
import {
  lerOrigemDoCorpo, colunasDaOrigem, recusaDaTrocaDeOrigem, statusAposMudarAOrigem, origemDe,
  fraseDaTrilhaDaOrigem, fraseDoFechamentoEmTransito,
} from "@shared/origem-do-reaproveitamento";
import { podeTransicionar } from "@shared/maquina-de-estados";
import { EM_REVISAO, ehForaDoFunil } from "@shared/fluxo-peca";
import { pecaTravada, fraseDaTrava, CODIGO_PECA_TRAVADA } from "@shared/trava-da-peca";
import { requireAuth, broadcast, translateStatus, createAuditLog, updateEventStatus } from "../shared";
import { responderFalha } from "../../erros";
import { avisarBuscarNoEstoque } from "../../services/aviso-buscar-no-estoque";

/** As colunas de carimbo que acompanham a etapa nova (e somem quando a peça volta). */
function carimbosDaEtapa(nova: string, antiga: string) {
  const agora = new Date();
  const saiuDeEntregue = antiga === "delivered" || antiga === "entregue";
  return {
    ...(nova === "delivered" ? { deliveredAt: agora } : saiuDeEntregue ? { deliveredAt: null } : {}),
    ...(nova === "conferred" ? { conferredAt: agora } : nova === "produced" ? { conferredAt: null } : {}),
  };
}

/** PATCH /api/items/:id/origem-reaproveitamento. */
export function registrarOrigemDoReaproveitamento(app: Express): void {
  app.patch("/api/items/:id/origem-reaproveitamento", requireAuth, async (req, res) => {
    try {
      if (!["admin", "grafica", "solicitacao"].includes(req.userRole ?? "")) {
        return res.status(403).json({ error: "Marcar de onde vem o reaproveitamento é do admin, da Solicitação e da Gráfica." });
      }
      const leitura = lerOrigemDoCorpo(req.body);
      if (!leitura.ok) return res.status(400).json({ error: leitura.motivo });
      if (!leitura.veio) return res.status(400).json({ error: "Diga de onde vem o reaproveitamento: estoque ou em trânsito." });
      const { origem, obs } = leitura;

      const atual = await storage.getItem(req.params.id);
      if (!atual || atual.deletedAt) return res.status(404).json({ error: "Peça não encontrada" });

      if (!podeTransicionar(atual.status, "definir-origem-do-reaproveitamento", req.userRole)) {
        return res.status(409).json({
          error: ehForaDoFunil(atual.status)
            ? `A peça está ${translateStatus(atual.status).toLowerCase()} — a origem do reaproveitamento não muda mais.`
            : EM_REVISAO.has(atual.status)
              ? "Esta peça está em revisão — a Gráfica marca a origem depois que a revisão liberar."
              : "A Gráfica marca a origem do reaproveitamento quando a peça chega à fila dela.",
        });
      }
      const recusa = recusaDaTrocaDeOrigem(atual, origem);
      if (recusa) return res.status(409).json({ error: recusa });

      const colunas = colunasDaOrigem(origem, obs);
      const igual = (atual.origemReaproveitamento ?? null) === colunas.origemReaproveitamento
        && (atual.obsReaproveitamento ?? null) === colunas.obsReaproveitamento;
      if (igual) return res.json(atual);

      // A conta física só muda quando "em trânsito" entra ou sai.
      const envolveTransito = origemDe(atual) === "em_transito" || origem === "em_transito";
      const novoStatus = envolveTransito ? statusAposMudarAOrigem({ ...atual, ...colunas }) : null;
      // Fechar (conferir/embalar/entregar pela origem) é a peça ANDAR: a trava
      // da Solicitação segura. Voltar ao galpão é recuo e passa.
      if (novoStatus && novoStatus !== "produced" && pecaTravada(atual)) {
        return res.status(409).json({ error: fraseDaTrava(atual), code: CODIGO_PECA_TRAVADA });
      }

      const item = await storage.updateItem(req.params.id, {
        ...colunas,
        ...(novoStatus ? { status: novoStatus, ...carimbosDaEtapa(novoStatus, atual.status) } : {}),
      });
      if (!item) return res.status(404).json({ error: "Peça não encontrada" });

      const trilha = fraseDaTrilhaDaOrigem(origem, colunas.obsReaproveitamento)
        + (novoStatus
          ? ` · Status: ${translateStatus(atual.status)} → ${translateStatus(novoStatus)}`
            + (novoStatus === "delivered" ? ` — ${fraseDoFechamentoEmTransito(colunas.obsReaproveitamento)}` : "")
            + (novoStatus === "produced" ? " — as reaproveitadas voltam a passar por conferir, embalar e entregar" : "")
          : "");
      await createAuditLog(req, "updated", "item", item.id, trilha);
      if (novoStatus) await updateEventStatus(item.eventId);
      broadcast({ type: "item_updated", item });
      await avisarBuscarNoEstoque(atual, item, req.userRole);
      res.json(item);
    } catch (error) {
      responderFalha(res, error, "PATCH /api/items/:id/origem-reaproveitamento");
    }
  });
}
