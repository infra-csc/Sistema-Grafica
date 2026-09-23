// Exportar e importar peças por planilha (.xlsx).
import type { Express } from "express";
import { storage } from "../../storage";
import { requireAuth } from "../shared";
import { responderErro, corpoEventoFechado } from "../../erros";
import { handlePreviewXlsx, handleConfirmImport } from "../../services/xlsxImport";
import { handleExportItemsXlsx, handleExportSelectedItemsXlsx } from "../../services/xlsxExport";
import { motivoEventoFechado } from "../eventoFinalizado";
import { canCreateItemsFor } from "./comum";

/** As duas travas da planilha (preview e confirmar): quem pode e evento aberto. */
async function barraImportacao(req: any, res: any): Promise<boolean> {
  try {
    if (!(await canCreateItemsFor(req, req.params.id))) {
      res.status(403).json({ error: "Sem permissão para importar itens neste evento" });
      return true;
    }
    const fechado = motivoEventoFechado(await storage.getEvent(req.params.id));
    if (fechado) {
      res.status(409).json(corpoEventoFechado(fechado));
      return true;
    }
    return false;
  } catch (error) {
    responderErro(res, error, "importar planilha");
    return true;
  }
}

/** exportar e importar planilha. */
export function registrarPlanilha(app: Express): void {
  // ── Export items to Excel (.xlsx) ────────────────────────────────────────
  app.get("/api/events/:id/export-items", requireAuth, handleExportItemsXlsx);
  // Exportação da Gráfica: recebe os ids já filtrados pela tela.
  app.post("/api/items/export-xlsx", requireAuth, handleExportSelectedItemsXlsx);

  // Import de Excel usa o fluxo preview → confirm (abaixo). O endpoint direto
  // /import-xlsx (parser legado) foi removido: importava a aba errada em
  // planilhas cujo cabeçalho usa "cód peça" em vez de "item" e não vinculava
  // patrocinadores.

  // ── Preview Excel items (parse without saving) ───────────────────────────
  // O preview passa pelas MESMAS duas travas do confirmar: sem elas a pessoa
  // revisava 200 linhas, vinculava patrocinador a patrocinador e só no último
  // clique descobria que não podia importar ali.
  app.post("/api/events/:id/preview-xlsx", requireAuth, async (req, res) => {
    if (await barraImportacao(req, res)) return;
    return handlePreviewXlsx(req, res);
  });

  // ── Confirm import (save pre-reviewed items) ─────────────────────────────
  app.post("/api/events/:id/confirm-import", requireAuth, async (req, res) => {
    // A planilha é a porta que entra mais peça de uma vez — bloquear aqui, no
    // wrapper que já faz o gate de papel, evita 200 peças invisíveis.
    if (await barraImportacao(req, res)) return;
    return handleConfirmImport(req, res);
  });
}
