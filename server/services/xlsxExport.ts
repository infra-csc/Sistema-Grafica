import ExcelJS from "exceljs";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Request, Response } from "express";
import { storage, compareDisplayId } from "../storage";

// Colunas extras da exportação da Gráfica: as peças vêm de vários eventos e o
// que interessa ali é o andamento da produção, não só a especificação.
const PRODUCTION_COLS = [
  { header: "Evento",          key: "eventName",    width: 26 },
  { header: "Status",          key: "statusLabel",  width: 16 },
  { header: "Reaprov.",        key: "qtyReused",    width: 10 },
  { header: "M² a produzir",   key: "m2ToProduce",  width: 13 },
  { header: "Produzido",       key: "qtyProduced",  width: 11 },
  { header: "Conferido",       key: "qtyConferred", width: 11 },
  { header: "Entregue",        key: "qtyDelivered", width: 11 },
];

const BASE_COLS = [
  { header: "#ID",             key: "displayId",    width: 10 },
  // COMPLEMENTO: a planilha vai para o cliente e para o fechamento. Sem esta
  // coluna, #0062 (10 un.) e #0062-C1 (4 un.) chegam como duas peças
  // independentes e alguém soma 14 achando que são pórticos diferentes. Com
  // ela, a linha diz de quem o lote nasceu — e a ordenação por
  // compareDisplayId já as deixa vizinhas.
  { header: "Complemento de",  key: "parentDisplayId", width: 14 },
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

const STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho", requested: "Solicitado",
  awaiting_linking: "Ag. Vinculação", awaiting_submission: "Ag. Envio",
  awaiting_approval: "Ag. Aprovação", awaiting_finalization: "Ag. Finalização",
  awaiting_final_review: "Ag. Revisão", awaiting_creator_review: "Ag. Finalização",
  ready_for_production: "Pronto p/ Prod.", pronto_para_producao: "Pronto p/ Prod.",
  approved: "Liberado", inProduction: "Em Produção", em_producao: "Em Produção",
  produced: "Produzido", conferred: "Conferido", delivered: "Entregue",
};

async function withSponsorNames(rawItems: any[]) {
  // AUDITORIA 27/08: era N×M queries SIMULTÂNEAS (uma por vínculo, dentro de
  // uma por peça) — exportar 2.000 peças disparava milhares de conexões e
  // derrubava as OUTRAS requisições. Duas queries no total, mapa em memória.
  const [allItemSponsors, allSponsors] = await Promise.all([
    storage.getAllItemSponsors(),
    storage.getAllSponsors(),
  ]);
  const nomePorSponsor = new Map(allSponsors.map((s) => [s.id, s.name]));
  const nomesPorItem = new Map<string, string[]>();
  for (const is of allItemSponsors) {
    const nome = nomePorSponsor.get(is.sponsorId);
    if (!nome) continue;
    const arr = nomesPorItem.get(is.itemId);
    if (arr) arr.push(nome); else nomesPorItem.set(is.itemId, [nome]);
  }
  return rawItems.map((item) => ({ ...item, sponsorNames: nomesPorItem.get(item.id) ?? [] }));
}

// Reuso total antigo não preencheu reuse_qty, mas cobre a peça inteira.
function reusedTotal(item: any): number {
  return item.isReuse ? (item.quantity ?? 0) : (item.reuseQty ?? 0);
}

/** Metragem que vai de fato para a impressora — o reaproveitado não é impresso. */
function m2ToProduce(item: any): number {
  const total = item.calculatedM2 != null ? parseFloat(item.calculatedM2) : 0;
  const qty = item.quantity ?? 0;
  if (!total || !qty) return total;
  const toPrint = qty - reusedTotal(item);
  return toPrint <= 0 ? 0 : parseFloat(((total / qty) * toPrint).toFixed(2));
}

// Ordenação ciente de COMPLEMENTO (#0062-C1). Com o replace(/\D/g,"") de
// antes, "#0062-C1" virava 621 e a peça complementar caía entre #0620 e #0622
// — na planilha que vai para o cliente, longe da peça de que ela nasceu.
// compareDisplayId (server/storage.ts) põe #0062 → #0062-C1 → #0062-C2 → #0063.
function byDisplayId(a: any, b: any) {
  return compareDisplayId(a?.displayId, b?.displayId);
}

/**
 * Monta a planilha e responde com o arquivo. `withProduction` acrescenta as
 * colunas de evento/status/quantidades usadas na exportação da Gráfica.
 */
async function writeWorkbook(
  res: Response,
  opts: { items: any[]; title: string; subtitle: string; filename: string; withProduction?: boolean },
) {
  const { items: sorted, title, subtitle, filename, withProduction } = opts;
  const COLS = withProduction ? [...PRODUCTION_COLS, ...BASE_COLS] : BASE_COLS;

    const wb = new ExcelJS.Workbook();
    wb.creator = "NORTE";
    wb.created = new Date();
    const ws = wb.addWorksheet("Itens", { properties: { defaultColWidth: 14 } });

    ws.columns = COLS.map((c) => ({ key: c.key, width: c.width }));
    const numCols = COLS.length;

    ws.mergeCells(1, 1, 1, numCols);
    const titleCell = ws.getCell("A1");
    titleCell.value = title.toUpperCase();
    titleCell.font = { name: "Arial", bold: true, size: 14, color: { argb: "FFFFFFFF" } };
    titleCell.alignment = { vertical: "middle", horizontal: "left" };
    titleCell.fill = HEADER_FILL;
    ws.getRow(1).height = 28;

    ws.mergeCells(2, 1, 2, numCols);
    const subCell = ws.getCell("A2");
    subCell.value = subtitle;
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
        ...(withProduction ? {
          eventName:    item.event?.name ?? item.eventName ?? "",
          statusLabel:  STATUS_LABELS[item.status] ?? item.status ?? "",
          qtyReused:    reusedTotal(item),
          m2ToProduce:  m2ToProduce(item),
          qtyProduced:  item.quantityProduced ?? 0,
          qtyConferred: item.conferredQty ?? 0,
          qtyDelivered: item.deliveredQty ?? 0,
        } : {}),
        displayId:    item.displayId ?? "",
        // Prefere o `parent` do enrich; quando a lista vem crua do storage
        // (é o caso da exportação por evento), deriva do próprio código —
        // "#0062-C1" → "#0062". Vazio em 100% das peças normais.
        parentDisplayId: item.parentItemId
          ? (item.parent?.displayId ?? String(item.displayId ?? "").replace(/-C\d+$/i, ""))
          : "",
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
        // Reuso parcial precisa aparecer como quantidade, não como Sim/Não.
        isReuse:      item.isReuse ? "Sim" : (item.reuseQty > 0 ? `${item.reuseQty} un.` : "Não"),
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

      const numericCols = ["quantity", "visualWidth", "visualHeight", "fileWidth", "fileHeight", "calculatedM2",
                           "qtyReused", "m2ToProduce", "qtyProduced", "qtyConferred", "qtyDelivered"];
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

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(filename)}"`);

  await wb.xlsx.write(res);
  res.end();
}

/** Exportação por evento (botão da tela do evento). */
export async function handleExportItemsXlsx(req: Request, res: Response) {
  try {
    const event = await storage.getEvent(req.params.id);
    if (!event) return res.status(404).json({ error: "Evento não encontrado" });

    const items = (await withSponsorNames(await storage.getItemsByEvent(req.params.id))).sort(byDisplayId);

    const parts = [
      `Data do evento: ${fmt(event.startDate)}`,
      `Saída do caminhão: ${fmt(event.truckDepartureDate)}`,
    ];
    if (event.franchise) parts.push(`Franquia: ${event.franchise}`);

    const safeName = event.name.replace(/[^a-zA-Z0-9À-ÿ _-]/g, "").trim();
    await writeWorkbook(res, {
      items, title: event.name, subtitle: parts.join("   |   "),
      filename: `${safeName}.xlsx`,
    });
  } catch (error: any) {
    console.error("[export-items]", error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * Exportação da Gráfica. Recebe os ids já filtrados pela tela — assim o arquivo
 * reflete exatamente o que o usuário está vendo, sem duplicar no servidor a
 * lógica de filtro do cliente.
 */
export async function handleExportSelectedItemsXlsx(req: Request, res: Response) {
  try {
    const ids: string[] = Array.isArray(req.body?.itemIds) ? req.body.itemIds : [];
    if (!ids.length) return res.status(400).json({ error: "Nenhuma peça selecionada para exportar" });

    // A Gráfica exporta centenas de peças de uma vez. Uma consulta por peça
    // (e outra por patrocinador) estouraria o pool de conexões, então tudo é
    // carregado em bloco e cruzado em memória.
    const wanted = new Set(ids);
    const raw = (await storage.getAllItems()).filter(i => wanted.has(i.id));
    if (!raw.length) return res.status(404).json({ error: "Nenhuma peça encontrada" });

    const eventNames = new Map<string, string>();
    (await storage.getAllEvents()).forEach(ev => eventNames.set(ev.id, ev.name));

    const sponsorNames = new Map<string, string>();
    (await storage.getAllSponsors()).forEach(s => sponsorNames.set(s.id, s.name));

    const sponsorsByItem = new Map<string, string[]>();
    (await storage.getAllItemSponsors()).forEach(link => {
      if (!wanted.has(link.itemId)) return;
      const name = sponsorNames.get(link.sponsorId);
      if (!name) return;
      const list = sponsorsByItem.get(link.itemId);
      if (list) list.push(name);
      else sponsorsByItem.set(link.itemId, [name]);
    });

    const items = raw
      .map(i => ({
        ...i,
        eventName: eventNames.get(i.eventId) ?? "",
        sponsorNames: sponsorsByItem.get(i.id) ?? [],
      }))
      .sort(byDisplayId);

    const title = typeof req.body?.title === "string" && req.body.title.trim()
      ? req.body.title.trim()
      : "Produção — Gráfica";
    const totalQty = items.reduce((s, i) => s + (i.quantity ?? 0), 0);

    await writeWorkbook(res, {
      items, title,
      subtitle: `${items.length} ${items.length === 1 ? "peça" : "peças"}   |   ${totalQty} un.   |   Exportado em ${fmt(new Date())}`,
      filename: `${title.replace(/[^a-zA-Z0-9À-ÿ _-]/g, "").trim() || "producao"}.xlsx`,
      withProduction: true,
    });
  } catch (error: any) {
    console.error("[export-selected-items]", error);
    res.status(500).json({ error: error.message });
  }
}
