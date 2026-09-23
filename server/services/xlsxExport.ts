import ExcelJS from "exceljs";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Request, Response } from "express";
import { storage, compareDisplayId } from "../storage";
import { rotuloDaMaquina } from "@shared/fluxo-peca";
import { nomeDaPeca } from "@shared/nome-da-peca";
import { resumosDeTuboPorIds, type MapaDeResumos, type VolumeDaPeca } from "./tubosDaPeca";
import type { Item } from "@shared/schema";
import { camposDoErro } from "../erros";
import { seloDosVolumes } from "@shared/embalagem";
import { STATUS_MOLDE_PRODUZIDO, statusDeExibicao } from "@shared/molde";
import {
  duracaoCurta, oQueAconteceuNoRegistro, ROTULO_DO_TIPO, nomeDoArquivoDoRelatorio,
  type RegistroDoPeriodo, type ResumoDoDia,
} from "./relatorioDeMaquinas";

// Colunas extras da exportação da Gráfica: as peças vêm de vários eventos e o
// que interessa ali é o andamento da produção, não só a especificação.
const PRODUCTION_COLS = [
  { header: "Evento",          key: "eventName",    width: 26 },
  { header: "Status",          key: "statusLabel",  width: 16 },
  // Em qual impressora a peça está/saiu (a última anotada), com o nome do
  // dono (shared/fluxo-peca). Vazio na peça que nunca passou por uma máquina.
  { header: "Impressora",      key: "printMachine", width: 24 },
  // Número do tubo em que a peça foi embalada (21/09). Vazio = sem tubo (peça
  // grande vai direto) ou ainda não embalada.
  { header: "Tubo",            key: "tuboNumero",   width: 22 },
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

// O MAPA ÚNICO dos rótulos do Excel (revisão 22/09): curtos de propósito (a
// coluna é estreita), mas TODO status do app tem o seu — `awaiting_review`,
// `in_review`, `canceled` e os legados saíam crus na planilha. O teste
// confere que cada ITEM_STATUSES tem rótulo aqui.
export const STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho", requested: "Solicitado",
  awaiting_linking: "Ag. Vinculação", awaiting_submission: "Ag. Envio",
  awaiting_approval: "Ag. Aprovação", awaiting_finalization: "Ag. Finalização",
  awaiting_final_review: "Ag. Revisão", awaiting_creator_review: "Ag. Finalização",
  ready_for_production: "Pronto p/ Prod.", pronto_para_producao: "Pronto p/ Prod.",
  approved: "Liberado", inProduction: "Em Impressão", em_producao: "Em Impressão",
  produced: "Impresso / Acabamento", conferred: "Conferido", packed: "Embalado", delivered: "Entregue",
  awaiting_review: "Ag. Revisão", in_review: "Em Revisão",
  canceled: "Cancelado", cancelled: "Cancelado", archived: "Arquivado",
  // Legados (a mesma leitura de translateStatus, em server/routes/shared.ts).
  awaiting_sponsor_approval: "Ag. Aprovação", sponsor_approved: "Ag. Finalização",
  liberado: "Liberado", produzido: "Impresso / Acabamento", conferido: "Conferido", entregue: "Entregue",
  // MOLDE (22/09): produzido é o fim do fluxo dele — sem "Acabamento".
  [STATUS_MOLDE_PRODUZIDO]: "Produzido (molde)",
};

/**
 * A peça como a planilha lê: a linha do banco com os nomes já cruzados. Os
 * campos opcionais só existem em peça que chegou enriquecida.
 */
type PecaDaPlanilha = Item & {
  sponsorNames?: string[];
  eventName?: string;
  event?: { name?: string | null } | null;
  parent?: { displayId?: string | null } | null;
  tuboNumero?: number | string | null;
  tuboVolumes?: VolumeDaPeca[];
};

async function withSponsorNames(rawItems: Item[]) {
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
function reusedTotal(item: Pick<Item, "isReuse" | "quantity" | "reuseQty">): number {
  return item.isReuse ? (item.quantity ?? 0) : (item.reuseQty ?? 0);
}

/** Metragem que vai de fato para a impressora — o reaproveitado não é impresso. */
function m2ToProduce(item: Pick<Item, "calculatedM2" | "isReuse" | "quantity" | "reuseQty">): number {
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
function byDisplayId(a: { displayId?: string | null } | null | undefined, b: { displayId?: string | null } | null | undefined) {
  return compareDisplayId(a?.displayId, b?.displayId);
}

/**
 * Monta a planilha e responde com o arquivo. `withProduction` acrescenta as
 * colunas de evento/status/quantidades usadas na exportação da Gráfica.
 */
async function writeWorkbook(
  res: Response,
  opts: { items: PecaDaPlanilha[]; title: string; subtitle: string; filename: string; withProduction?: boolean },
) {
  const { items: sorted, title, subtitle, filename, withProduction } = opts;
  const COLS = withProduction ? [...PRODUCTION_COLS, ...BASE_COLS] : BASE_COLS;
  // As peças chegam CRUAS do storage (sem o enrich das listas): o número do
  // tubo é buscado aqui, num select só. Peça já enriquecida usa o que trouxe.
  const tuboPorId: MapaDeResumos = withProduction ? await resumosDeTuboPorIds(sorted.map((i) => i.tuboId)) : new Map();

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
          statusLabel:  STATUS_LABELS[statusDeExibicao(item)] ?? item.status ?? "",
          printMachine: item.printMachine ? rotuloDaMaquina(item.printMachine) : "",
          // A peça DIVIDIDA entre tubos diz todos, com a quantidade de cada um:
          // "Tubo 1 (7) · Tubo 2 (3)". Inteira num tubo só, fica o número (como
          // sempre foi). Embalada sozinha (número negativo): coluna vazia.
          tuboNumero:   (() => {
            const volumes = (tuboPorId.volumesPorItem?.get(item.id) ?? item.tuboVolumes ?? []).filter((v) => !v.avulso);
            if (volumes.length > 1 || (volumes.length === 1 && Number(volumes[0].quantidade) < Number(item.quantity))) return seloDosVolumes(volumes);
            const n = item.tuboNumero ?? (item.tuboId ? tuboPorId.get(item.tuboId)?.tuboNumero : undefined);
            return Number(n) > 0 ? n : "";
          })(),
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
        sponsors:     item.sponsorNames?.join(", ") ?? "",
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
                           "qtyReused", "m2ToProduce", "qtyProduced", "qtyConferred", "qtyDelivered", "tuboNumero"];
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
    // Arquivado responde como inexistente: sumiu de todas as listas.
    if (!event || event.arquivadoEm) return res.status(404).json({ error: "Evento não encontrado" });

    // Usuário do Kit (14/09): exporta só as peças do Kit que ele criou.
    const doKit = req.userKit === true;
    const doEvento = (await storage.getItemsByEvent(req.params.id))
      .filter((i) => !doKit || (!!i.kitRemessaId && i.criadoPorId === req.userId));
    const items = (await withSponsorNames(doEvento)).sort(byDisplayId);

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
  } catch (error: unknown) {
    console.error("[export-items]", error);
    res.status(500).json({ error: camposDoErro(error).message });
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
    // Só as peças pedidas (por id, no banco) — não o acervo inteiro. Mesmo
    // recorte de antes: vivas, e o Kit só com as dele. (A ordem final é a do
    // byDisplayId, abaixo.)
    const doKit = req.userKit ? new Set(await storage.getIdsDasPecasDoKitDoCriador(req.userId ?? null)) : null;
    const raw = (await storage.getItemsByIds(Array.from(wanted)))
      .filter(i => !i.deletedAt && (!doKit || doKit.has(i.id)));
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

    // Peça de evento arquivado não sai na planilha (getAllEvents não o traz).
    const items = raw
      .filter(i => eventNames.has(i.eventId))
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
  } catch (error: unknown) {
    console.error("[export-selected-items]", error);
    res.status(500).json({ error: camposDoErro(error).message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// RELATÓRIO DAS MÁQUINAS (dono, 21/09: "não tem relatório para exportar").
//
// Duas abas: "Resumo" (um bloco por dia, uma linha por impressora — unidades,
// peças, concluídas, ainda na máquina, primeira/última atividade, tempo
// ativo, quem) e "Registros" (uma linha por lançamento do diário). A conta é
// a de services/relatorioDeMaquinas.ts — a mesma da tela.
// ─────────────────────────────────────────────────────────────────────────────
const diaBR = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}/${dia.slice(0, 4)}`;

const RESUMO_COLS = [
  { header: "Dia",                key: "dia",        width: 12 },
  { header: "Impressora",         key: "rotulo",     width: 28 },
  { header: "Unidades impressas", key: "unidades",   width: 18 },
  { header: "Peças",              key: "pecas",      width: 9  },
  { header: "Concluídas",         key: "concluidas", width: 12 },
  { header: "Ainda na máquina",   key: "ainda",      width: 17 },
  { header: "Primeira atividade", key: "primeira",   width: 18 },
  { header: "Última atividade",   key: "ultima",     width: 16 },
  { header: "Tempo ativo",        key: "tempo",      width: 13 },
  { header: "Quem",               key: "quem",       width: 30 },
];

const REGISTROS_COLS = [
  { header: "Data",            key: "data",       width: 12 },
  { header: "Hora",            key: "hora",       width: 8  },
  { header: "Impressora",      key: "impressora", width: 28 },
  { header: "Código",          key: "codigo",     width: 10 },
  { header: "Peça",            key: "peca",       width: 36 },
  { header: "Tipo",            key: "tipo",       width: 12 },
  { header: "Evento",          key: "evento",     width: 28 },
  { header: "O que aconteceu", key: "oque",       width: 40 },
  { header: "Quantidade",      key: "quantidade", width: 12 },
  { header: "Total depois",    key: "total",      width: 13 },
  { header: "Quem",            key: "quem",       width: 20 },
];

/** Cabeçalho de duas linhas + linha de colunas, no mesmo visual das outras planilhas. */
function cabecalhoDaAba(ws: ExcelJS.Worksheet, cols: { header: string; key: string; width: number }[], title: string, subtitle: string) {
  ws.columns = cols.map((c) => ({ key: c.key, width: c.width }));
  ws.mergeCells(1, 1, 1, cols.length);
  const t = ws.getCell("A1");
  t.value = title.toUpperCase();
  t.font = { name: "Arial", bold: true, size: 14, color: { argb: "FFFFFFFF" } };
  t.alignment = { vertical: "middle", horizontal: "left" };
  t.fill = HEADER_FILL;
  ws.getRow(1).height = 28;
  ws.mergeCells(2, 1, 2, cols.length);
  const s = ws.getCell("A2");
  s.value = subtitle;
  s.font = { name: "Arial", size: 10, color: { argb: "FFBFB8B0" } };
  s.alignment = { vertical: "middle", horizontal: "left" };
  s.fill = HEADER_FILL;
  ws.getRow(2).height = 20;
  const h = ws.getRow(3);
  cols.forEach((c, i) => {
    const cell = h.getCell(i + 1);
    cell.value = c.header;
    cell.font = { name: "Arial", bold: true, size: 10, color: { argb: "FF44403C" } };
    cell.fill = COL_HEADER_FILL;
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: false };
    cell.border = THIN_BORDER;
  });
  h.height = 22;
  // Cabeçalho congelado e filtro nas colunas: é planilha de consulta.
  ws.views = [{ state: "frozen", ySplit: 3 }];
  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: cols.length } };
}

function estiloDaLinha(row: ExcelJS.Row, alt: boolean, centradas: number[]) {
  row.eachCell({ includeEmpty: true }, (cell, col) => {
    if (alt) cell.fill = ROW_ALT_FILL;
    cell.font = { name: "Arial", size: 10 };
    cell.alignment = { vertical: "middle", horizontal: centradas.includes(col) ? "center" : undefined };
    cell.border = THIN_BORDER;
  });
}

/**
 * Monta o workbook (sem responder): a rota escreve na resposta, o teste lê o
 * buffer. `resumo` já vem agregado por relatorioDeMaquinas.ts.
 */
export function montarPlanilhaDeMaquinas(opts: { de: string; ate: string; resumo: ResumoDoDia[]; registros: RegistroDoPeriodo[] }): ExcelJS.Workbook {
  const { de, ate, resumo, registros } = opts;
  const periodo = de === ate ? diaBR(de) : `${diaBR(de)} a ${diaBR(ate)}`;
  const wb = new ExcelJS.Workbook();
  wb.creator = "NORTE";
  wb.created = new Date();

  // ── Aba 1: Resumo ────────────────────────────────────────────────────────
  const totalUnidades = resumo.reduce((s, d) => s + d.total.unidades, 0);
  const abaResumo = wb.addWorksheet("Resumo", { properties: { defaultColWidth: 14 } });
  cabecalhoDaAba(abaResumo, RESUMO_COLS, "Máquinas — resumo", `Período: ${periodo}   |   ${totalUnidades} un. impressas   |   Exportado em ${fmt(new Date())}`);
  let n = 0;
  for (const d of resumo) {
    for (const m of d.maquinas) {
      const row = abaResumo.addRow({
        dia: diaBR(d.dia), rotulo: m.rotulo, unidades: m.unidades, pecas: m.pecas, concluidas: m.concluidas,
        ainda: m.aindaNaMaquina, primeira: m.primeira ?? "", ultima: m.ultima ?? "", tempo: duracaoCurta(m.minutosAtivos),
        quem: m.quem.join(", "),
      });
      estiloDaLinha(row, n++ % 2 === 1, [3, 4, 5, 6, 7, 8, 9]);
    }
    // Total do dia, destacado — é o número que o dono pergunta primeiro.
    const tot = abaResumo.addRow({
      dia: diaBR(d.dia), rotulo: "TOTAL DO DIA", unidades: d.total.unidades, pecas: d.total.pecas,
      concluidas: d.total.concluidas, ainda: d.total.aindaNaMaquina, primeira: "", ultima: "", tempo: duracaoCurta(d.total.minutosAtivos), quem: "",
    });
    tot.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.fill = TOTAL_FILL;
      cell.font = { name: "Arial", bold: true, size: 10, color: { argb: "FF92400E" } };
      cell.alignment = { vertical: "middle", horizontal: col >= 3 ? "center" : undefined };
    });
    tot.height = 22;
  }
  if (resumo.length === 0) {
    const vazio = abaResumo.addRow({ dia: "", rotulo: "Nenhuma impressão registrada no período." });
    vazio.getCell(2).font = { name: "Arial", italic: true, size: 10, color: { argb: "FF746E69" } };
  }

  // ── Aba 2: Registros ─────────────────────────────────────────────────────
  const abaRegistros = wb.addWorksheet("Registros", { properties: { defaultColWidth: 14 } });
  cabecalhoDaAba(abaRegistros, REGISTROS_COLS, "Máquinas — registros", `Período: ${periodo}   |   ${registros.length} ${registros.length === 1 ? "lançamento" : "lançamentos"}`);
  const emOrdem = [...registros].sort((a, b) => a.em - b.em);
  emOrdem.forEach((r, i) => {
    const row = abaRegistros.addRow({
      data: diaBR(r.dia), hora: r.hora, impressora: rotuloDaMaquina(r.maquina), codigo: r.displayId ?? "",
      peca: nomeDaPeca(r.tipoPeca, r.descricaoPeca), tipo: ROTULO_DO_TIPO[r.tipo] ?? r.tipo, evento: r.evento ?? "", oque: oQueAconteceuNoRegistro(r),
      // A troca move, não imprime: a coluna Quantidade fica vazia (o "O que
      // aconteceu" já diz quantas foram movidas), para a soma da coluna bater.
      quantidade: r.tipo === "troca" || r.tipo === "inicio" || r.tipo === "pausa" ? "" : r.quantidade, total: r.totalDepois ?? "", quem: r.quem ?? "",
    });
    estiloDaLinha(row, i % 2 === 1, [2, 4, 6, 9, 10]);
  });

  return wb;
}

/** Responde com o .xlsx do relatório das máquinas. A rota (routes/maquinas.ts) busca os dados. */
export async function responderRelatorioMaquinasXlsx(res: Response, opts: { de: string; ate: string; resumo: ResumoDoDia[]; registros: RegistroDoPeriodo[] }) {
  const wb = montarPlanilhaDeMaquinas(opts);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${nomeDoArquivoDoRelatorio(opts.de, opts.ate)}"`);
  await wb.xlsx.write(res);
  res.end();
}
