// ─────────────────────────────────────────────────────────────────────────────
// TRAVAR / DESTRAVAR A PEÇA (dono, 21/09: "colocar um botão na Gráfica onde o
// usuário de Solicitação TRAVA a peça com motivo").
//
// Só a MARCA (travada_em/por/por_id/motivo) e o updatedAt — nada de status. As
// guardas que barram a peça travada moram nas rotas que fazem a peça andar
// (start-printing, start-production, maquina-prevista, trocar, confer e tubos),
// todas lendo `pecaTravada` (shared/trava-da-peca.ts). Tirar da impressora não
// é barrado: recuar nunca é.
// ─────────────────────────────────────────────────────────────────────────────
import type { Express } from "express";
import { requireAuth, broadcast, createAuditLog, resolveActor } from "./shared";
import { storage } from "../storage";
import { pecaVisivelPara } from "@shared/kit";
import { colunasDaTrava, colunasDoDestravar, lerMotivo, motivoDeNaoTravar, pecaTravada } from "@shared/trava-da-peca";

const RECADO_SO_VISUALIZA = "Peça do Kit: a Solicitação da Arena só visualiza. Quem age nela é o usuário do Kit.";

/** A peça que quem pede enxerga — fora do recorte do Kit, é "não encontrada". */
async function pecaDoPedido(req: any) {
  const peca = await storage.getItem(req.params.id);
  if (!peca || (peca as any).deletedAt) return null;
  const quemVe = { kit: req.userKit === true, userId: req.userId ?? null };
  return pecaVisivelPara(quemVe, { kitRemessaId: (peca as any).kitRemessaId, criadoPorId: (peca as any).criadoPorId }) ? peca : null;
}

/** Solicitação sem Kit só visualiza peça do Kit (o mesmo recorte de sempre). */
const soVisualiza = (req: any, peca: any): boolean => req.userRole === "solicitacao" && req.userKit !== true && !!peca.kitRemessaId;

export function registerTravaRoutes(app: Express): void {
  app.post("/api/items/:id/travar", requireAuth, async (req, res) => {
    if (req.userRole !== "solicitacao" && req.userRole !== "admin") {
      return res.status(403).json({ error: "Só a Solicitação e o admin travam peça" });
    }
    const lido = lerMotivo(req.body?.motivo);
    if (!lido.ok) return res.status(400).json({ error: lido.erro });
    try {
      const atual = await pecaDoPedido(req);
      if (!atual) return res.status(404).json({ error: "Peça não encontrada" });
      if (soVisualiza(req, atual)) return res.status(403).json({ error: RECADO_SO_VISUALIZA });
      const motivo = motivoDeNaoTravar(atual as any);
      if (motivo) return res.status(409).json({ error: motivo });
      const quem = resolveActor(req);
      const item = await storage.updateItem(atual.id, colunasDaTrava(lido.motivo, { nome: quem.userName, id: quem.userId }, new Date()) as any);
      if (!item) return res.status(404).json({ error: "Peça não encontrada" });
      await createAuditLog(req, "updated", "item", item.id, `Travada pela Solicitação: ${lido.motivo} (${quem.userName})`);
      broadcast({ type: "item_updated", item });
      res.json(item);
    } catch (error: any) {
      console.error("[trava] falha ao travar a peça:", error);
      res.status(500).json({ error: "Não foi possível travar a peça." });
    }
  });

  app.post("/api/items/:id/destravar", requireAuth, async (req, res) => {
    if (req.userRole !== "solicitacao" && req.userRole !== "admin") {
      return res.status(403).json({ error: "Só a Solicitação e o admin destravam peça" });
    }
    try {
      const atual = await pecaDoPedido(req);
      if (!atual) return res.status(404).json({ error: "Peça não encontrada" });
      if (soVisualiza(req, atual)) return res.status(403).json({ error: RECADO_SO_VISUALIZA });
      if (!pecaTravada(atual as any)) return res.status(409).json({ error: "A peça não está travada" });
      const quem = resolveActor(req);
      const item = await storage.updateItem(atual.id, colunasDoDestravar() as any);
      if (!item) return res.status(404).json({ error: "Peça não encontrada" });
      await createAuditLog(req, "updated", "item", item.id, `Destravada (${quem.userName})`);
      broadcast({ type: "item_updated", item });
      res.json(item);
    } catch (error: any) {
      console.error("[trava] falha ao destravar a peça:", error);
      res.status(500).json({ error: "Não foi possível destravar a peça." });
    }
  });
}
