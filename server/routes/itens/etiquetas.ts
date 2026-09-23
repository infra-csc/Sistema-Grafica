// Registro de etiqueta impressa (tela de Etiquetas).
import type { Express } from "express";
import { storage } from "../../storage";
import { requireAuth, createAuditLog } from "../shared";

/** POST /api/items/labels-printed. */
export function registrarEtiquetasImpressas(app: Express): void {
  // ── ETIQUETA IMPRESSA (25/08). A tela de Etiquetas registra o que saiu na
  // impressora, para a próxima visita abrir só com o que falta — sem isso, a
  // segunda impressão repetia a pilha inteira e o galpão recortava etiqueta
  // duplicada. O carimbo fica NA PEÇA (labelPrintedAt, leitura rápida) e cada
  // impressão também vira linha na trilha, onde as reimpressões sobrevivem.
  // O registro INFORMA, não bloqueia: remarcar e reimprimir segue um clique.
  // Qualquer papel autenticado registra — quem imprime é quem está na tela.
  app.post("/api/items/labels-printed", requireAuth, async (req, res) => {
    try {
      const itemIds = req.body?.itemIds;
      if (
        !Array.isArray(itemIds) ||
        itemIds.length === 0 ||
        itemIds.length > 500 ||
        itemIds.some((id: unknown) => typeof id !== "string")
      ) {
        return res.status(400).json({ error: "itemIds deve ser uma lista de até 500 ids de peça" });
      }
      // Só as peças que EXISTEM (e vivas) ganham carimbo e linha na trilha —
      // id desconhecido não pode virar registro órfão no audit_log.
      const impressas = await storage.markLabelsPrinted(itemIds);
      await Promise.all(
        impressas.map((i) =>
          createAuditLog(req, "label_printed", "item", i.id, `Etiqueta da peça "${i.displayId}" impressa`)
        )
      );
      res.json({ success: true, count: impressas.length });
    } catch (error) {
      res.status(500).json({ error: "Não foi possível registrar a impressão das etiquetas" });
    }
  });
}
