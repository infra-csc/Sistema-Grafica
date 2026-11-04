// O Excel da tela Reaproveitar: a lista para separar as peças no estoque, por prova.
// A coluna "Separado" sai vazia de propósito: é para preencher no galpão.
import ExcelJS from "exceljs";
import type { Request, Response } from "express";
import { storage, compareDisplayId } from "../storage";
import type { Event, Item } from "@shared/schema";
import { aguardaReaproveitar, pedidoDoReaproveitar } from "@shared/reaproveitar";

const COLUNAS = [
  { header: "Evento", key: "evento", width: 34 },
  { header: "Saída", key: "saida", width: 12 },
  { header: "Código", key: "codigo", width: 11 },
  { header: "Tipo", key: "tipo", width: 22 },
  { header: "Descrição", key: "descricao", width: 44 },
  { header: "Material", key: "material", width: 24 },
  { header: "Medidas (m)", key: "medidas", width: 14 },
  { header: "Separar (un.)", key: "separar", width: 12 },
  { header: "Separado", key: "separado", width: 11 },
  { header: "Onde está", key: "onde", width: 28 },
  { header: "Observação da peça", key: "obs", width: 36 },
];

const FUNDO = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1C1917" } } as const;
const FUNDO_COLUNA = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F5F4" } } as const;
const BORDA = { top: { style: "thin", color: { argb: "FFD6D3D1" } }, left: { style: "thin", color: { argb: "FFD6D3D1" } }, bottom: { style: "thin", color: { argb: "FFD6D3D1" } }, right: { style: "thin", color: { argb: "FFD6D3D1" } } } as const;

const dataBR = (d: Date | string | null | undefined) => {
  if (!d) return "";
  const v = new Date(d);
  return Number.isNaN(v.getTime()) ? "" : v.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
};
const medidas = (p: Item) => {
  const l = p.fileWidth ?? p.visualWidth, a = p.fileHeight ?? p.visualHeight;
  return l && a ? `${l} × ${a}` : "";
};
/** Quanto buscar: o pedido em aberto ou o que já foi reaproveitado. */
export const quantoSeparar = (p: Item): number => (aguardaReaproveitar(p) ? pedidoDoReaproveitar(p) : p.isReuse ? p.quantity ?? 0 : p.reuseQty ?? 0);

/** Ordem de separação: o caminhão que sai primeiro, e dentro dele pelo código. */
export function montarPlanilhaDoReaproveitar(pecas: Item[], eventos: Map<string, Pick<Event, "name" | "truckDepartureDate">>, titulo: string): ExcelJS.Workbook {
  const saidaMs = (p: Item) => { const s = eventos.get(p.eventId)?.truckDepartureDate; return s ? new Date(s).getTime() : Number.MAX_SAFE_INTEGER; };
  const linhas = [...pecas].sort((a, b) => saidaMs(a) - saidaMs(b) || String(eventos.get(a.eventId)?.name ?? "").localeCompare(String(eventos.get(b.eventId)?.name ?? ""), "pt-BR") || compareDisplayId(a.displayId, b.displayId));
  const wb = new ExcelJS.Workbook();
  wb.creator = "Miró";
  const ws = wb.addWorksheet("Separação", { properties: { defaultColWidth: 14 }, pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  ws.columns = COLUNAS.map((c) => ({ key: c.key, width: c.width }));
  const unidades = linhas.reduce((n, p) => n + quantoSeparar(p), 0);
  ws.mergeCells(1, 1, 1, COLUNAS.length);
  const t = ws.getCell("A1");
  t.value = titulo.toUpperCase();
  t.font = { name: "Arial", bold: true, size: 14, color: { argb: "FFFFFFFF" } };
  t.alignment = { vertical: "middle", horizontal: "left" };
  t.fill = FUNDO;
  ws.getRow(1).height = 28;
  ws.mergeCells(2, 1, 2, COLUNAS.length);
  const s = ws.getCell("A2");
  s.value = `${linhas.length} ${linhas.length === 1 ? "peça" : "peças"}   |   ${unidades} un. para separar   |   Exportado em ${dataBR(new Date())}`;
  s.font = { name: "Arial", size: 10, color: { argb: "FFD6D3D1" } };
  s.alignment = { vertical: "middle", horizontal: "left" };
  s.fill = FUNDO;
  ws.getRow(2).height = 20;
  const h = ws.getRow(3);
  COLUNAS.forEach((c, i) => {
    const cell = h.getCell(i + 1);
    cell.value = c.header;
    cell.font = { name: "Arial", bold: true, size: 10, color: { argb: "FF44403C" } };
    cell.fill = FUNDO_COLUNA;
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = BORDA;
  });
  h.height = 22;
  ws.views = [{ state: "frozen", ySplit: 3 }];
  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: COLUNAS.length } };
  for (const p of linhas) {
    const ev = eventos.get(p.eventId);
    const row = ws.addRow({
      evento: ev?.name ?? "", saida: dataBR(ev?.truckDepartureDate), codigo: p.displayId ?? "", tipo: p.type ?? "", descricao: p.description ?? "",
      material: p.material ?? "", medidas: medidas(p), separar: quantoSeparar(p), separado: "", onde: p.obsReaproveitamento ?? "", obs: p.observations ?? "",
    });
    // Nome longo quebra a linha: a planilha não corta o que identifica a peça.
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { name: "Arial", size: 10 };
      cell.alignment = { vertical: "top", wrapText: true };
      cell.border = BORDA;
    });
    row.getCell("separar").font = { name: "Arial", size: 11, bold: true };
    row.getCell("separar").alignment = { vertical: "top", horizontal: "center" };
  }
  return wb;
}

/** POST /api/reaproveitar/excel: a lista que está na tela, com os filtros dela. */
export async function responderExcelDoReaproveitar(req: Request, res: Response) {
  try {
    const ids: string[] = Array.isArray(req.body?.ids) ? req.body.ids.filter((x: unknown): x is string => typeof x === "string") : [];
    if (ids.length === 0) return res.status(400).json({ error: "Nenhuma peça para exportar" });
    if (ids.length > 5000) return res.status(400).json({ error: "Filtre por evento: são peças demais para uma planilha só." });
    const doKit = req.userKit ? new Set(await storage.getIdsDasPecasDoKitDoCriador(req.idDoKit ?? req.userId ?? null)) : null;
    const pecas = (await storage.getItemsByIds(ids)).filter((i) => !i.deletedAt && (!doKit || doKit.has(i.id)));
    if (pecas.length === 0) return res.status(404).json({ error: "Nenhuma peça encontrada" });
    const eventos = new Map<string, Event>((await storage.getAllEvents()).map((e) => [e.id, e]));
    const naLista = pecas.filter((p) => eventos.has(p.eventId));
    const nomes = Array.from(new Set(naLista.map((p) => eventos.get(p.eventId)!.name)));
    const titulo = nomes.length === 1 ? `Reaproveitar: ${nomes[0]}` : "Reaproveitar: separação no estoque";
    const wb = montarPlanilhaDoReaproveitar(naLista, eventos, titulo);
    const arquivo = `${titulo.replace(/[^a-zA-Z0-9À-ÿ _-]/g, "").trim() || "Reaproveitar"}.xlsx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(arquivo)}"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (erro) {
    console.error("[reaproveitar-excel]", erro);
    if (!res.headersSent) res.status(500).json({ error: "Não foi possível gerar o Excel agora. Tente de novo em instantes." });
  }
}
