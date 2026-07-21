import ExcelJS from "exceljs";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Request, Response } from "express";
import { storage } from "../storage";

const COLS = [
  { header: "#ID",             key: "displayId",    width: 10 },
  { header: "Tipo",            key: "type",         width: 18 },
  { header: "Descrição",       key: "description",  width: 28 },
  { header: "Qtd",             key: "quantity",     width: 7  },
  { header: "Material",        key: "material",     width: 18 },
  { header: "Acabamento",      key: "finish",       width: 18 },
  { header: "Medida",          key: "measurement",  width: 18 },
  { header: "Larg. Visual (m)",key: "visualWidth",  width: 14 },
  { header: "Alt. Visual (m)", key: "visualHeight", width: 14 },
  { header: "Larg. Arq. (m)",  key: "fileWidth",    width: 14 },
  { header: "Alt. Arq. (m)",   key: "fileHeight",   width: 14 },
  { header: "M² Calc.",        key: "calculatedM2", width: 11 },
  { header: "Reaprov.",        key: "isReuse",      width: 10 },
  { header: "Patrocinadores",  key: "sponsors",     width: 30 },
  { header: "Observações",     key: "observations", width: 35 },
];

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern", pattern: "solid", fgColor: { argb: "FF1F1D1A" },
};
const COL_HEADER_FILL: ExcelJS.Fill = {
  type: "pattern", pattern: "solid", fgColor: { argb: "FFE7E5E4" },
};
const ROW_ALT_FILL: ExcelJS.Fill = {
  type: "pattern", pattern: "solid", fgColor: { argb: "FFF7F6F3" },
};
const TOTAL_FILL: ExcelJS.Fill = {
  type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" },
};
const THIN_BORDER: Partial<ExcelJS.Borders> = {
  bottom: { style: "thin", color: { argb: "FFD4D0CC" } },
};

function fmt(date: string | Date) {
  return format(new Date(date), "dd/MM/yyyy", { locale: ptBR });
}

export async function handleExportItemsXlsx(req: Request, res: Response) {
  try {
    const eventId = req.params.id;
    const event = await storage.getEvent(eventId);
    if (!event) return res.status(404).json({ error: "Evento não encontrado" });

    const rawItems = await storage.getItemsByEvent(eventId);

    const itemsWithSponsors = await Promise.all(
      rawItems.map(async (item) => {
        const itemSponsors = await storage.getItemSponsors(item.id);
        const sponsorNames = await Promise.all(
          itemSponsors.map(async (is: any) => {
            const s = await storage.getSponsor(is.sponsorId);
            return s?.name ?? "";
          })
        );
        return { ...item, sponsorNames: sponsorNames.filter(Boolean) };
      })
    );

    const sorted = [...itemsWithSponsors].sort((a, b) => {
      const nA = parseInt(String(a.displayId || "0").replace(/\D/g, "")) || 0;
      const nB = parseInt(String(b.displayId || "0").replace(/\D/g, "")) || 0;
      return nA - nB;
    });

    const wb = new ExcelJS.Workbook();
    wb.creator = "NORTE";
    wb.created = new Date();
    const ws = wb.addWorksheet("Itens", { properties: { defaultColWidth: 14 } });

    ws.columns = COLS.map((c) => ({ key: c.key, width: c.width }));
    const numCols = COLS.length;

    ws.mergeCells(1, 1, 1, numCols);
    const titleCell = ws.getCell("A1");
    titleCell.value = event.name.toUpperCase();
    titleCell.font = { name: "Arial", bold: true, size: 14, color: { argb: "FFFFFFFF" } };
    titleCell.alignment = { vertical: "middle", horizontal: "left" };
    titleCell.fill = HEADER_FILL;
    ws.getRow(1).height = 28;

    ws.mergeCells(2, 1, 2, numCols);
    const subCell = ws.getCell("A2");
    const parts: string[] = [];
    parts.push(`Data do evento: ${fmt(event.startDate)}`);
    parts.push(`Saída do caminhão: ${fmt(event.truckDepartureDate)}`);
    if (event.franchise) parts.push(`Franquia: ${event.franchise}`);
    subCell.value = parts.join("   |   ");
    subCell.font = { name: "Arial", size: 10, color: { argb: "FFBFB8B0" } };
    subCell.alignment = { vertical: "middle", horizontal: "left" };
    subCell.fill = HEADER_FILL;
    ws.getRow(2).height = 20;

    const headerRow = ws.getRow(3);
    COLS.forEach((col, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = col.header;
      cell.font = { name: "Arial", bold: true, size: 10, color: { argb: "FF44403C" } };
      cell.fill = COL_HEADER_FILL;
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: false };
      cell.border = THIN_BORDER;
    });
    headerRow.height = 22;

    let totalQty = 0;
    let totalM2 = 0;

    sorted.forEach((item, idx) => {
      const row = ws.addRow({
        displayId:    item.displayId ?? "",
        type:         item.type ?? "",
        description:  item.description ?? "",
        quantity:     item.quantity ?? 0,
        material:     item.material ?? "",
        finish:       item.finish ?? "",
        measurement:  item.measurement ?? "",
        visualWidth:  item.visualWidth != null ? parseFloat(item.visualWidth) : "",
        visualHeight: item.visualHeight != null ? parseFloat(item.visualHeight) : "",
        fileWidth:    item.fileWidth != null ? parseFloat(item.fileWidth) : "",
        fileHeight:   item.fileHeight != null ? parseFloat(item.fileHeight) : "",
        calculatedM2: item.calculatedM2 != null ? parseFloat(item.calculatedM2) : 0,
        isReuse:      item.isReuse ? "Sim" : "Não",
        sponsors:     (item as any).sponsorNames?.join(", ") ?? "",
        observations: item.observations ?? "",
      });

      const isAlt = idx % 2 === 1;
      row.eachCell({ includeEmpty: true }, (cell) => {
        if (isAlt) cell.fill = ROW_ALT_FILL;
        cell.font = { name: "Arial", size: 10 };
        cell.alignment = { vertical: "middle", wrapText: false };
        cell.border = THIN_BORDER;
      });

      const numericCols = ["quantity", "visualWidth", "visualHeight", "fileWidth", "fileHeight", "calculatedM2"];
      numericCols.forEach((key) => {
        const colIdx = COLS.findIndex((c) => c.key === key);
        if (colIdx >= 0) {
          row.getCell(colIdx + 1).alignment = { vertical: "middle", horizontal: "center" };
        }
      });

      totalQty += item.quantity ?? 0;
      totalM2 += item.calculatedM2 != null ? parseFloat(item.calculatedM2) : 0;
    });

    const totRow = ws.addRow({});
    const qtyColIdx = COLS.findIndex((c) => c.key === "quantity") + 1;
    const m2ColIdx  = COLS.findIndex((c) => c.key === "calculatedM2") + 1;

    const labelCell = totRow.getCell(1);
    labelCell.value = `TOTAL — ${sorted.length} ${sorted.length === 1 ? "item" : "itens"}`;
    labelCell.font = { name: "Arial", bold: true, size: 10, color: { argb: "FF92400E" } };

    totRow.getCell(qtyColIdx).value = totalQty;
    totRow.getCell(qtyColIdx).font = { name: "Arial", bold: true, size: 10, color: { argb: "FF92400E" } };
    totRow.getCell(qtyColIdx).alignment = { horizontal: "center" };

    totRow.getCell(m2ColIdx).value = parseFloat(totalM2.toFixed(2));
    totRow.getCell(m2ColIdx).numFmt = "0.00";
    totRow.getCell(m2ColIdx).font = { name: "Arial", bold: true, size: 10, color: { argb: "FF92400E" } };
    totRow.getCell(m2ColIdx).alignment = { horizontal: "center" };

    totRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.fill = TOTAL_FILL;
    });
    totRow.height = 22;

    const safeName = event.name.replace(/[^a-zA-Z0-9À-ÿ _-]/g, "").trim();
    const filename = `${safeName}.xlsx`;

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(filename)}"`);

    await wb.xlsx.write(res);
    res.end();
  } catch (error: any) {
    console.error("[export-items]", error);
    res.status(500).json({ error: error.message });
  }
}
