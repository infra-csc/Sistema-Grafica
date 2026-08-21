// XLSX item import/preview/confirm handlers. Extracted from server/routes.ts
// (ITEMS section) into a dedicated service module, as suggested by the
// original code review — pure relocation, no parsing logic changed.
import type { Request, Response } from "express";
import { storage } from "../storage";
import { insertItemSchema } from "@shared/schema";
import { broadcast, createAuditLog, updateEventStatus } from "../routes/shared";
import AdmZip from "adm-zip";


  // ── A LEITURA DA PLANILHA, como função pura ──────────────────────────────
  //
  // Separada do handler HTTP para poder ser testada com planilhas de verdade
  // (Buffer entra, peças saem). O caso que obrigou a separação: a EXPORTAÇÃO
  // do próprio app (services/xlsxExport.ts) sendo REIMPORTADA — uma planilha
  // de 145 peças virou 145 grupos de uma peça, cada um com o ID como nome,
  // e ninguém tinha como reproduzir isso num teste.
  //
  // O que o parser entende, em ordem de preferência:
  //
  //   1. FORMATO NORTE EXPORTADO — "#ID | Tipo | Descrição | Qtd | Material |
  //      Acabamento | Medida | Larg. Visual | Alt. Visual | Larg. Arq. |
  //      Alt. Arq. | M² | Reaprov. | Patrocinadores | Observações". Tipo é o
  //      GRUPO, Descrição é a PEÇA, e as quatro medidas vêm das quatro colunas.
  //   2. FORMATO NORTE "ARENA" — sem coluna de item; descrição em C, grupo em
  //      B; medidas em "Área"/"Visual" e "Medida do arquivo"/"Compr".
  //   3. QUALQUER PLANILHA com uma coluna de item/peça/descrição e uma de
  //      quantidade; o grupo é o que estiver à ESQUERDA do item (uma linha de
  //      seção "TESTEIRAS", repetida até a próxima).
  //
  // Os três defeitos que a reimportação expôs — e que valem para qualquer
  // planilha parecida:
  //   · "Tipo" era aceito como coluna de ITEM. Na exportação, a descrição
  //     virava o tipo e a coluna Descrição de verdade era ignorada.
  //   · A coluna à esquerda do item virava GRUPO sem perguntar o que era.
  //     "#0386" não é número, logo era grupo — um por linha.
  //   · "Larg. Visual (m)" e irmãs não eram reconhecidas: a coluna VISUAL
  //     chegava vazia na tela, e o pessoal achava que a planilha não tinha.
  export type PecaLida = {
    type: string;
    description: string;
    quantity: number;
    visualWidth: number | null;
    visualHeight: number | null;
    fileWidth: number | null;
    fileHeight: number | null;
    calculatedM2: number;
    material: string;
    finish: string;
    measurement: string;
    observations: string;
    suggestedSponsorIds: string[];
    /** Só quando a planilha DIZ que a peça é reaproveitamento total ("Sim"). */
    reuse?: boolean;
  };

  export type LeituraDaPlanilha =
    | { ok: true; items: PecaLida[] }
    | { ok: false; erro: string; amostra?: string };

  /** Um valor que é um ID de peça (#0386, 0386, #0062-C1) — nunca é nome de grupo. */
  const pareceIdDePeca = (v: string) => /^#?\d+(-C\d+)?$/i.test(v.trim());

  export function lerPlanilhaDePecas(
    buffer: Buffer,
    matchSponsors: (texto: string) => string[],
  ): LeituraDaPlanilha {
    let zip: any;
    try { zip = new AdmZip(buffer); }
    catch (e: any) { return { ok: false, erro: `Arquivo inválido ou corrompido: ${e.message}` }; }

    // sharedStrings: cada <si> é uma entrada; concatena todos os <t> filhos.
    const sharedStrings: string[] = [];
    const ssEntry = zip.getEntry("xl/sharedStrings.xml");
    if (ssEntry) {
      const ssXml = ssEntry.getData().toString("utf8");
      for (const siM of Array.from(ssXml.matchAll(/<si>([\s\S]*?)<\/si>/g)) as RegExpMatchArray[]) {
        const parts: string[] = [];
        for (const tM of Array.from((siM[1] as string).matchAll(/<t[^>]*>([^<]*)<\/t>/g)) as RegExpMatchArray[]) parts.push(tM[1] as string);
        sharedStrings.push(parts.join(""));
      }
    }

    const decodeXml = (s: string) =>
      s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
       .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));

    type CellMap = Record<string, string>;
    const parseSheet = (sheetXml: string): Record<number, CellMap> => {
      const result: Record<number, CellMap> = {};
      for (const rowM of Array.from(sheetXml.matchAll(/<row r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g))) {
        const rowNum = parseInt(rowM[1]);
        const cellMap: CellMap = {};
        for (const cm of Array.from(rowM[2].matchAll(/<c r="([A-Z]+)\d+"([^>]*)>([\s\S]*?)<\/c>/g))) {
          const col = cm[1];
          const attrs = cm[2];
          const content = cm[3];
          const typeM = attrs.match(/\bt="([^"]+)"/);
          const t = typeM ? typeM[1] : "";
          let val = "";
          if (t === "s") {
            const vM = content.match(/<v>(\d+)<\/v>/);
            if (vM) val = decodeXml(sharedStrings[parseInt(vM[1])] ?? "");
          } else if (t === "inlineStr") {
            const parts: string[] = [];
            for (const tM of Array.from(content.matchAll(/<t[^>]*>([^<]*)<\/t>/g))) parts.push(tM[1]);
            val = decodeXml(parts.join(""));
          } else {
            // t="str" (fórmula), t="" (número), t="b" (booleano)… <f> pode vir
            // antes de <v> — o [\s\S]*? da regex externa já pulou.
            const vM = content.match(/<v>([^<]+)<\/v>/);
            if (vM) val = decodeXml(vM[1].trim());
          }
          if (val.trim()) cellMap[col] = val.trim();
        }
        if (Object.keys(cellMap).length > 0) result[rowNum] = cellMap;
      }
      return result;
    };

    // Texto de cabeçalho normalizado: minúsculo, sem acento, espaços simples.
    const normHdr = (s: string) =>
      s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

    const sheetEntries: string[] = [];
    for (const entry of zip.getEntries()) {
      if (/^xl\/worksheets\/sheet\d+\.xml$/.test(entry.entryName)) sheetEntries.push(entry.entryName);
    }
    // sheet2 primeiro (comum em pastas com capa), depois sheet1, depois o resto.
    sheetEntries.sort((a, b) => {
      const na = parseInt(a.match(/(\d+)/)?.[1] ?? "0");
      const nb = parseInt(b.match(/(\d+)/)?.[1] ?? "0");
      if (na === 2) return -1; if (nb === 2) return 1;
      if (na === 1) return -1; if (nb === 1) return 1;
      return na - nb;
    });

    // ── Predicados de cabeçalho ──
    const isDescCol = (v: string) => v.startsWith("descri") || v === "descr";
    const isTipoCol = (v: string) => v === "tipo" || v.startsWith("tipo de") || v === "grupo" || v === "categoria";
    const isIdCol   = (v: string) => v === "#id" || v === "id" || v === "#";
    // "tipo" SAIU daqui: é grupo, não item. Continua valendo como item só
    // quando não há coluna de descrição — planilha que tem só "Tipo" e "Qtd".
    const isItemCol = (v: string) =>
      v === "item" || v === "peca" || v === "pecas" || v === "nome" || v === "produto" || isDescCol(v);
    const isCodeCol = (v: string) =>
      (v.startsWith("cod") || v.startsWith("codigo")) && v.includes("peca");
    const isQtyCol = (v: string) =>
      v === "qtde" || v === "qtd" || v === "qtd." || v === "quantidade" || v === "quant" ||
      v === "und" || v === "unid" || v === "unidade" || v === "qnt" || v === "un" || v === "un." ||
      v.startsWith("qtd") || v.startsWith("quan") || v.includes("quantidade");
    // As quatro medidas pelo nome que a EXPORTAÇÃO escreve, mais os apelidos
    // antigos. "Larg. Visual (m)" normaliza para "larg. visual (m)".
    const isVisW  = (v: string) => /^(larg|largura)\.? ?(visual|vis\.?)/.test(v) || v.startsWith("area") || v === "largura" || v === "larg" || v === "compr";
    const isVisH  = (v: string) => /^(alt|altura)\.? ?(visual|vis\.?)/.test(v) || v === "visual" || v === "visu" || v === "altura" || v === "alt";
    const isFileW = (v: string) => /^(larg|largura)\.? ?(arq|arquivo)/.test(v) || v.startsWith("medida do arquivo");
    const isFileH = (v: string) => /^(alt|altura)\.? ?(arq|arquivo)/.test(v);
    const isFileSizeCol = (v: string) => (v === "medida" || v.startsWith("medida") || v === "medida arquivo" || v === "dimensao" || v === "dimensoes") && !isFileW(v);
    const isSponsorsCol = (v: string) => v === "patrocinadores" || v === "patrocinador";
    const isReuseCol = (v: string) => v.startsWith("reaprov");

    const parseNum = (s: string) => {
      if (!s) return 0;
      const n = parseFloat(s.replace(",", ".").replace(/[^\d.eE+\-]/g, "")) || 0;
      return Math.round(n * 10000) / 10000;
    };
    const cap = (s: string) => s ? (s.charAt(0).toUpperCase() + s.slice(1)) : s;

    // Testa todas as abas; fica com a que rende mais peças válidas. Pastas com
    // uma aba de capa que tem cara de cabeçalho e nenhum dado paravam o parser
    // na aba errada.
    let bestItems: PecaLida[] = [];
    let anyHeaderFound = false;
    const amostras: string[] = [];

    for (const sn of sheetEntries) {
      const entry = zip.getEntry(sn);
      if (!entry) continue;
      const candidate = parseSheet(entry.getData().toString("utf8"));

      let headerRow = -1;
      const col: Record<string, string> = {};

      for (const [rn, cells] of Object.entries(candidate)) {
        const vals = Object.values(cells).map(v => normHdr(v));
        const hasItem = vals.some(v => isItemCol(v) || isCodeCol(v) || isTipoCol(v));
        const hasQty  = vals.some(isQtyCol);
        // Formato "Arena" sem coluna de item: reconhece pelo conjunto
        // material + acabamento/medida/visual (descrição em C, grupo em B).
        const hasArenaCols =
          vals.some(v => v === "material") &&
          vals.some(v => v === "acabamento" || v === "acab" || v.startsWith("medida") || v === "visual" || v === "visu");
        if (!((hasItem || hasArenaCols) && hasQty)) continue;

        headerRow = parseInt(rn);
        let codeCol: string | null = null;
        for (const [c, raw] of Object.entries(cells)) {
          const v = normHdr(raw);
          if (!col.id && isIdCol(v)) col.id = c;
          else if (!col.tipo && isTipoCol(v)) col.tipo = c;
          else if (!col.desc && isDescCol(v)) col.desc = c;
          else if (!col.item && isItemCol(v)) col.item = c;
          else if (isCodeCol(v)) codeCol = c;
          else if (!col.qty && isQtyCol(v)) col.qty = c;
          else if (!col.fileW && isFileW(v)) col.fileW = c;
          else if (!col.fileH && isFileH(v)) col.fileH = c;
          else if (!col.width && isVisW(v)) col.width = c;
          else if (!col.height && isVisH(v)) col.height = c;
          else if (!col.material && v === "material") col.material = c;
          else if (!col.finish && (v === "acabamento" || v === "acab")) col.finish = c;
          else if (!col.fileSize && isFileSizeCol(v)) col.fileSize = c;
          else if (!col.sponsors && isSponsorsCol(v)) col.sponsors = c;
          else if (!col.reuse && isReuseCol(v)) col.reuse = c;
          else if (!col.obs && (v === "obs" || v.startsWith("observa"))) col.obs = c;
        }
        // A PEÇA é a descrição quando há uma; senão a coluna de item; senão a
        // coluna à esquerda do código; senão (Arena) a C.
        if (col.desc) col.item = col.desc;
        if (!col.item && codeCol) {
          const codeIdx = codeCol.charCodeAt(0) - 65;
          if (codeIdx > 0) col.item = String.fromCharCode(65 + codeIdx - 1);
        }
        if (!col.item && hasArenaCols) col.item = "C";
        // Planilha só com "Tipo" e "Qtd" (sem descrição): o tipo é a peça.
        if (!col.item && col.tipo) { col.item = col.tipo; delete col.tipo; }
        break;
      }

      if (headerRow === -1) {
        for (const [rn, cells] of Object.entries(candidate).slice(0, 10)) {
          const vals = Object.values(cells as CellMap).map((v: string) => normHdr(v)).filter(Boolean);
          if (vals.length > 0 && amostras.length < 20) amostras.push(`  row ${rn} [${sn}]: ${vals.join(" | ")}`);
        }
        continue;
      }
      anyHeaderFound = true;
      if (!col.item) continue;

      // "Compr" é largura de ARQUIVO quando há "Medida do arquivo" ao lado
      // (formato Arena) — a ordem de inferência antiga.
      const hdrCells = candidate[headerRow] ?? {};
      for (const [c, raw] of Object.entries(hdrCells)) {
        const v = normHdr(raw);
        if (col.fileW && !col.fileH && v === "compr" && c !== col.fileW) { col.fileH = c; if (col.width === c) delete col.width; }
      }
      if (col.finish && !col.fileW && !col.fileSize && !col.desc) {
        const fi = col.finish.charCodeAt(0) - 65;
        col.fileW = String.fromCharCode(65 + fi + 1);
        col.fileH = String.fromCharCode(65 + fi + 2);
      }
      if (col.fileW && !col.fileH) {
        const fwIdx = col.fileW.charCodeAt(0) - 65;
        col.fileH = String.fromCharCode(65 + fwIdx + 1);
      }
      if (col.height && !col.width) {
        const hIdx = col.height.charCodeAt(0) - 65;
        if (hIdx > 0) col.width = String.fromCharCode(65 + hIdx - 1);
      }

      // ── O GRUPO ──
      // Explícito quando há coluna de Tipo. Senão, a coluna à esquerda do item
      // — MENOS quando essa coluna é a de ID: "#0386" não é nome de seção.
      const itemIdx = col.item.charCodeAt(0) - 65;
      const grupoExplicito = !!col.tipo;
      let groupCol: string | null = col.tipo ?? (itemIdx > 0 ? String.fromCharCode(65 + itemIdx - 1) : null);
      if (!grupoExplicito && groupCol && (groupCol === col.id || groupCol === col.qty)) groupCol = null;
      const codeColL = String.fromCharCode(65 + itemIdx + 1);

      let currentGroup = "";
      const localItems: PecaLida[] = [];
      const numRows = Math.max(...Object.keys(candidate).map(Number));

      for (let r = headerRow + 1; r <= numRows; r++) {
        const row = candidate[r];
        if (!row) continue;

        if (groupCol) {
          const g = (row[groupCol] || "").trim();
          // Linha de seção: texto que não é número nem ID de peça.
          if (g && !/^\d+$/.test(g) && !pareceIdDePeca(g)) currentGroup = g;
        }
        let itemVal = (row[col.item] || "").trim();
        // Formato antigo: o item vinha como ÍNDICE de sharedStrings na coluna
        // do grupo. Só no modo implícito — na exportação isso seria o ID.
        if (!itemVal && !grupoExplicito && groupCol && row[groupCol] && /^\d+$/.test(row[groupCol].trim())) {
          const ssIdx = parseInt(row[groupCol].trim());
          if (ssIdx > 0 && sharedStrings[ssIdx]) itemVal = sharedStrings[ssIdx].trim();
        }
        if (!itemVal) continue;
        // Rodapé da exportação ("TOTAL — 145 itens") cai aqui quando a coluna
        // de item está vazia; se vier preenchida por engano, ainda assim não é peça.
        if (/^total\b/i.test(itemVal) && !row[col.qty ?? ""]) continue;

        const qtyStr = col.qty ? (row[col.qty] || "").trim() : "";
        let qty = Math.floor(parseFloat(qtyStr.replace(",", ".")) || 0);
        if (qty === 0) {
          const codeVal = (row[codeColL] || "").trim();
          if (/^\d+$/.test(codeVal)) qty = parseInt(codeVal);
        }
        if (qty === 0) continue;

        const pick = (k: string) => (col[k] ? (row[col[k]] || "").trim() : "");
        const matVal = pick("material");
        const finVal = pick("finish");
        const fileSizeVal = pick("fileSize");
        const obsVal = pick("obs");
        const sponsorsVal = pick("sponsors");
        const reuseVal = pick("reuse");

        const visualW = parseNum(pick("width"));
        const visualH = parseNum(pick("height"));
        // Sem medida de arquivo, o arquivo ESPELHA o visual — a mesma regra do
        // formulário de peça. Sangria só existe quando alguém a escreveu.
        let fileW = parseNum(pick("fileW")) || visualW;
        let fileH = parseNum(pick("fileH")) || visualH;
        if (fileSizeVal && (!pick("fileW") || !pick("fileH"))) {
          const parts = fileSizeVal.replace(/,/g, ".").replace(/\s/g, "").split(/[xX×]/);
          if (parts.length >= 2) { fileW = parseFloat(parts[0]) || fileW; fileH = parseFloat(parts[1]) || fileH; }
        }

        let groupType: string;
        if (grupoExplicito) {
          // Tipo vindo de coluna própria é o tipo do app: não se normaliza.
          groupType = currentGroup || itemVal;
        } else {
          // Duas passadas de normalização do grupo implícito:
          //  1) grupo de dimensão: "2X1 MBRF" com item "2×1 Mbrf" → "2X1";
          //  2) contador sequencial: "TESTEIRA PÓRTICO 1" → "TESTEIRA PÓRTICO".
          const rawType = currentGroup || itemVal;
          const dimRe = /^(\d+)\s*[xX×]\s*(\d+)/i;
          const gDim = rawType.match(dimRe);
          const iDim = itemVal.match(dimRe);
          groupType = (
            gDim && iDim &&
            gDim[1] === iDim[1] && gDim[2] === iDim[2] &&
            rawType.replace(/\s/g, "").length > `${gDim[1]}x${gDim[2]}`.length
          ) ? `${gDim[1]}X${gDim[2]}` : rawType;
          const trailingNum = groupType.match(/^(.+?)\s+\d+$/);
          if (trailingNum) groupType = trailingNum[1];
        }

        // Patrocinador sugerido: o nome que aparece na descrição da peça E o
        // que a coluna "Patrocinadores" trouxer — na reimportação, é ela que
        // preserva os vínculos. Sempre limitado aos patrocinadores do evento.
        const suggestedSponsorIds = Array.from(new Set(matchSponsors(`${itemVal} ${sponsorsVal}`)));

        const peca: PecaLida = {
          type: groupType,
          description: itemVal,
          quantity: qty,
          visualWidth: visualW || null,
          visualHeight: visualH || null,
          fileWidth: fileW || null,
          fileHeight: fileH || null,
          calculatedM2: fileW && fileH ? Math.round(qty * fileW * fileH * 10000) / 10000 : 0,
          material: cap(matVal) || "Lona",
          finish: cap(finVal) || "Ilhós",
          measurement: fileW && fileH ? `${fileW.toFixed(2)} × ${fileH.toFixed(2)}` : (visualW && visualH ? `${visualW.toFixed(2)} × ${visualH.toFixed(2)}` : ""),
          observations: obsVal,
          suggestedSponsorIds,
        };
        if (/^sim$/i.test(reuseVal)) peca.reuse = true;
        localItems.push(peca);
      }

      if (localItems.length > bestItems.length) bestItems = localItems;
    }

    if (!anyHeaderFound) {
      return {
        ok: false,
        erro: "Cabeçalho não encontrado. A planilha deve ter colunas 'item' (ou 'peça'/'descrição') e 'qtde' (ou 'quantidade').",
        amostra: amostras.join("\n"),
      };
    }
    if (bestItems.length === 0) {
      return { ok: false, erro: "Nenhum item válido encontrado. Verifique se há linhas com quantidade > 0." };
    }
    return { ok: true, items: bestItems };
  }

  // ── Preview Excel items (parse without saving) ───────────────────────────
  export async function handlePreviewXlsx(req: Request, res: Response) {
    try {
      const event = await storage.getEvent(req.params.id);
      if (!event) return res.status(404).json({ error: "Evento não encontrado" });

      // Patrocinadores JÁ vinculados a ESTE evento (só esses podem ser
      // pré-vinculados nas peças da planilha — nunca a lista global).
      const normSponsor = (s: string) =>
        (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
      const eventSponsorRows = await storage.getEventSponsors(event.id);
      const allSponsorsList = await storage.getAllSponsors();
      const sponsorById = new Map(allSponsorsList.map((s: any) => [s.id, s]));
      const eventSponsors = eventSponsorRows
        .map((es: any) => sponsorById.get(es.sponsorId))
        .filter(Boolean)
        .map((s: any) => ({ id: s.id, name: s.name, norm: normSponsor(s.name) }))
        // ignora nomes muito curtos (< 3) para evitar falso-positivo em substrings
        .filter((s: any) => s.norm.length >= 3);
      // Retorna os ids dos patrocinadores do evento cujo nome aparece no texto.
      const matchSponsors = (text: string): string[] => {
        if (!text || eventSponsors.length === 0) return [];
        const t = normSponsor(text);
        return eventSponsors.filter(s => {
          // casa por palavra inteira para não pegar substrings acidentais
          return new RegExp(`(^|[^a-z0-9])${s.norm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`).test(t);
        }).map(s => s.id);
      };

      const multer = (await import("multer")).default;
      const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
      await new Promise<void>((resolve, reject) =>
        upload.single("file")(req as any, res as any, (err: any) => err ? reject(err) : resolve())
      );

      const file = (req as any).file as { buffer: Buffer; originalname: string } | undefined;
      if (!file) return res.status(400).json({ error: "Arquivo .xlsx não encontrado" });

      const leitura = lerPlanilhaDePecas(file.buffer, matchSponsors);
      if (!leitura.ok) {
        if (leitura.amostra) console.error("[preview-xlsx] header not found. File:", file.originalname, "\nRows scanned:\n" + leitura.amostra);
        return res.status(400).json({ error: leitura.erro });
      }
      res.json({ items: leitura.items, fileName: file.originalname });
    } catch (error: any) {
      console.error("[preview-xlsx] unhandled error:", error.message, error.stack?.slice(0, 600));
      res.status(400).json({ error: error.message || "Erro ao processar arquivo" });
    }
  }

  // ── Confirm import (save pre-reviewed items) ─────────────────────────────
  export async function handleConfirmImport(req: Request, res: Response) {
    try {
      const event = await storage.getEvent(req.params.id);
      if (!event) return res.status(404).json({ error: "Evento não encontrado" });

      const { items, fileName } = req.body as { items: any[]; fileName?: string };
      if (!items || !Array.isArray(items) || items.length === 0)
        return res.status(400).json({ error: "Nenhum item para importar" });

      const toCreate = items.map((item: any) => ({
        eventId: event.id,
        type: item.type,
        description: item.description,
        quantity: Number(item.quantity),
        area: Number(item.visualWidth) || Number(item.fileWidth) || 0,
        visual: Number(item.visualHeight) || Number(item.fileHeight) || 0,
        // Colunas decimais: o schema espera string (ou null), como no fluxo
        // normal de criação de item — enviar Number aqui causa erro de validação.
        visualWidth: item.visualWidth !== null && item.visualWidth !== undefined ? String(item.visualWidth) : null,
        visualHeight: item.visualHeight !== null && item.visualHeight !== undefined ? String(item.visualHeight) : null,
        fileWidth: item.fileWidth !== null && item.fileWidth !== undefined ? String(item.fileWidth) : null,
        fileHeight: item.fileHeight !== null && item.fileHeight !== undefined ? String(item.fileHeight) : null,
        calculatedM2: Number(item.calculatedM2) || 0,
        material: item.material || "Lona",
        finish: item.finish || "Ilhós",
        measurement: item.measurement || "",
        observations: item.observations || "",
        status: "requested",
      }));

      const validated = toCreate.map((item, i) => {
        try { return insertItemSchema.parse(item); }
        catch (e: any) { throw new Error(`Item ${i + 1} (${item.description}): ${e.message}`); }
      });

      const created = await storage.createBulkItems(validated);

      // Link suggested sponsors when provided (supports multiple sponsors per item)
      const sponsorLinks: Promise<any>[] = [];
      for (let i = 0; i < created.length; i++) {
        const raw = items[i];
        // Support both old suggestedSponsorId (string) and new suggestedSponsorIds (array)
        const ids: string[] = raw?.suggestedSponsorIds?.length
          ? raw.suggestedSponsorIds
          : (raw?.suggestedSponsorId ? [raw.suggestedSponsorId] : []);
        for (const sponsorId of ids) {
          if (sponsorId && typeof sponsorId === 'string') {
            sponsorLinks.push(
              storage.addSponsorToItem({ itemId: created[i].id, sponsorId }).catch(() => {})
            );
          }
        }
      }
      if (sponsorLinks.length > 0) await Promise.all(sponsorLinks);

      // Resumo da importação: é do EVENTO (o entityId é o evento). Marcar como
      // 'item' fazia o histórico procurar uma peça inexistente e renderizar
      // "Peça ( un.) — Evento desconhecido".
      await createAuditLog(
        req, 'created', 'event', event.id,
        `${created.length} itens importados via Excel${fileName ? ` ("${fileName}")` : ""}`
      );
      // Log por peça: sem ele o histórico não encontra o autor da peça
      // (procura por itemId) e acaba exibindo o fallback "Sistema".
      // Em lotes para não abrir uma conexão por peça numa importação grande.
      for (let i = 0; i < created.length; i += 10) {
        await Promise.all(created.slice(i, i + 10).map(it =>
          createAuditLog(
            req, 'created', 'item', it.id,
            `Item "${it.type}" importado via Excel - Qtd: ${it.quantity}`
          )
        ));
      }
      const notification = await storage.createNotification({
        type: "itemAdded",
        message: `${created.length} itens importados via Excel — Evento: ${event.name}`,
        eventId: event.id,
        targetRoles: ["arte"], // só quem AGE agora: a Gráfica entra bem depois, quando liberam p/ produção
      });
      broadcast({ type: "notification_created", notification });
      broadcast({ type: "items_bulk_created", items: created, eventId: event.id });
      await updateEventStatus(event.id);

      res.status(201).json({ imported: created.length, items: created });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }
