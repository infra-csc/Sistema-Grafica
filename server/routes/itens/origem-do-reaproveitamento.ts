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
// Evento finalizado (revisão adversarial, 16/10): dizer de onde vem e FECHAR
// A CONTA (em trânsito → Conferido/Embalado/Entregue) seguem valendo, como a
// conferência — o caminhão conjugado se acerta justamente perto do evento.
// DEVOLVER AO GALPÃO é barrado: gera trabalho num evento que já acabou.
// Evento arquivado: nada muda. A leitura e a escrita são feitas com a peça
// TRAVADA (SELECT … FOR UPDATE), como a conferência e o embalar.
//
// Papéis: os mesmos que marcam reaproveitamento — admin e Solicitação em
// qualquer etapa do funil; a Gráfica da liberação em diante (é quando a peça
// é dela). A tabela: shared/maquina-de-estados.ts.
// ─────────────────────────────────────────────────────────────────────────────
import type { Express } from "express";
import { eq } from "drizzle-orm";
import { db } from "../../db";
import { items as itemsTable, type Item } from "@shared/schema";
import { motivoEventoDaPeca, erroEventoFechado } from "../eventoFinalizado";
import { recalcularEventoEAvisar } from "../../services/evento-concluido";
import {
  lerOrigemDoCorpo, colunasDaOrigem, recusaDaTrocaDeOrigem, statusAposMudarAOrigem, origemDe,
  fraseDaTrilhaDaOrigem, fraseDoFechamentoEmTransito,
} from "@shared/origem-do-reaproveitamento";
import { podeTransicionar } from "@shared/maquina-de-estados";
import { EM_REVISAO, ehForaDoFunil } from "@shared/fluxo-peca";
import { pecaTravada, fraseDaTrava, CODIGO_PECA_TRAVADA } from "@shared/trava-da-peca";
import { requireAuth, broadcast, translateStatus, createAuditLog } from "../shared";
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
      const colunas = colunasDaOrigem(origem, obs);

      // CONCORRÊNCIA (revisão adversarial, 16/10): a recusa e a etapa nova
      // dependem de conferidas/embaladas/entregues — que a conferência e o
      // embalar mudam com a peça TRAVADA (SELECT … FOR UPDATE). Ler fora da
      // trava deixava uma conferência no meio passar despercebida (marcar "em
      // trânsito" com mais conferidas do que impressas), e duas trocas
      // simultâneas deixavam a origem de uma com o status da outra.
      type Resultado =
        | { erro: { http: number; corpo: Record<string, unknown> } }
        | { igual: Item }
        | { atual: Item; item: Item; novoStatus: string | null };
      const resultado: Resultado = await db.transaction(async (tx): Promise<Resultado> => {
        const recusa = (http: number, corpo: Record<string, unknown>): Resultado => ({ erro: { http, corpo } });
        const [atual] = await tx.select().from(itemsTable).where(eq(itemsTable.id, req.params.id)).for("update");
        if (!atual || atual.deletedAt) return recusa(404, { error: "Peça não encontrada" });

        if (!podeTransicionar(atual.status, "definir-origem-do-reaproveitamento", req.userRole)) {
          return recusa(409, {
            error: ehForaDoFunil(atual.status)
              ? `A peça está ${translateStatus(atual.status).toLowerCase()} — a origem do reaproveitamento não muda mais.`
              : EM_REVISAO.has(atual.status)
                ? "Esta peça está em revisão — a Gráfica marca a origem depois que a revisão liberar."
                : "A Gráfica marca a origem do reaproveitamento quando a peça chega à fila dela.",
          });
        }
        const motivoDaTroca = recusaDaTrocaDeOrigem(atual, origem);
        if (motivoDaTroca) return recusa(409, { error: motivoDaTroca });

        const igual = (atual.origemReaproveitamento ?? null) === colunas.origemReaproveitamento
          && (atual.obsReaproveitamento ?? null) === colunas.obsReaproveitamento;
        if (igual) return { igual: atual };

        // EVENTO ARQUIVADO: nada muda (como a conferência) — restaure antes.
        // EVENTO FINALIZADO: dizer de onde vem e FECHAR A CONTA (em trânsito →
        // Entregue) seguem valendo, como conferir e entregar; DEVOLVER AO
        // GALPÃO não — põe a Gráfica para conferir, embalar e entregar peça de
        // um evento que já acabou (eventoFinalizado.ts: "em caso de dúvida,
        // barra"; reabrir o evento é um clique).
        const motivoDoEvento = await motivoEventoDaPeca(atual);
        if (motivoDoEvento === "arquivado") {
          return recusa(409, { error: erroEventoFechado(motivoDoEvento), code: "EVENT_FINALIZED", reason: motivoDoEvento });
        }

        // A conta física só muda quando "em trânsito" entra ou sai.
        const envolveTransito = origemDe(atual) === "em_transito" || origem === "em_transito";
        const novoStatus = envolveTransito ? statusAposMudarAOrigem({ ...atual, ...colunas }) : null;
        if (novoStatus === "produced" && motivoDoEvento) {
          return recusa(409, { error: erroEventoFechado(motivoDoEvento), code: "EVENT_FINALIZED", reason: motivoDoEvento });
        }
        // Fechar (conferir/embalar/entregar pela origem) é a peça ANDAR: a trava
        // da Solicitação segura. Voltar ao galpão é recuo e passa.
        if (novoStatus && novoStatus !== "produced" && pecaTravada(atual)) {
          return recusa(409, { error: fraseDaTrava(atual), code: CODIGO_PECA_TRAVADA });
        }

        const agora = new Date();
        const [item] = await tx.update(itemsTable).set({
          ...colunas,
          ...(novoStatus ? { status: novoStatus, statusChangedAt: agora, ...carimbosDaEtapa(novoStatus, atual.status) } : {}),
          // Fechou como Entregue: a reserva e a divisão entre impressoras acabaram
          // (a peça liberada que vira toda "em trânsito" sai da fila de impressão).
          ...(novoStatus === "delivered" ? { impressaoPorMaquina: null, reservaPorMaquina: null, maquinaPrevista: null } : {}),
          updatedAt: agora,
        }).where(eq(itemsTable.id, req.params.id)).returning();
        if (!item) return recusa(404, { error: "Peça não encontrada" });
        return { atual, item, novoStatus };
      });
      if ("erro" in resultado) return res.status(resultado.erro.http).json(resultado.erro.corpo);
      if ("igual" in resultado) return res.json(resultado.igual);
      const { atual, item, novoStatus } = resultado;

      const trilha = fraseDaTrilhaDaOrigem(origem, colunas.obsReaproveitamento)
        + (novoStatus
          ? ` · Status: ${translateStatus(atual.status)} → ${translateStatus(novoStatus)}`
            + (novoStatus === "delivered" ? ` — ${fraseDoFechamentoEmTransito(colunas.obsReaproveitamento)}` : "")
            + (novoStatus === "produced" ? " — as reaproveitadas voltam a passar por conferir, embalar e entregar" : "")
          : "");
      await createAuditLog(req, "updated", "item", item.id, trilha);
      if (novoStatus) await recalcularEventoEAvisar(item.eventId);
      broadcast({ type: "item_updated", item });
      await avisarBuscarNoEstoque(atual, item, req.userRole);
      res.json(item);
    } catch (error) {
      responderFalha(res, error, "PATCH /api/items/:id/origem-reaproveitamento");
    }
  });
}
