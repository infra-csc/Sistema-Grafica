// XLSX item import/preview/confirm handlers. Extracted from server/routes.ts
// (ITEMS section) into a dedicated service module, as suggested by the
// original code review — pure relocation, no parsing logic changed.
import type { Request, Response } from "express";
import { storage } from "../storage";
import { insertItemSchema } from "@shared/schema";
import { broadcast, createAuditLog, updateEventStatus } from "../routes/shared";

  // ── Import items from Excel (.xlsx) ──────────────────────────────────────
  // Uses multer to handle multipart/form-data upload (avoids JSON body size limits)
  export async function handleImportXlsx(req: Request, res: Response) {
    try {
      const event = await storage.getEvent(req.params.id);
      if (!event) return res.status(404).json({ error: "Evento não encontrado" });

      // Parse multipart using multer (memory storage)
      const multer = (await import("multer")).default;
      const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
      await new Promise<void>((resolve, reject) =>
        upload.single("file")(req as any, res as any, (err: any) => err ? reject(err) : resolve())
      );

      const file = (req as any).file as { buffer: Buffer; originalname: string } | undefined;
      if (!file) return res.status(400).json({ error: "Arquivo .xlsx não encontrado na requisição" });

      // Decode buffer → parse xlsx in-process via AdmZip + XML
      const { default: AdmZip } = await import("adm-zip");
      const buf = file.buffer;
      const zip = new AdmZip(buf);

      // Read shared strings
      const ssEntry = zip.getEntry("xl/sharedStrings.xml");
      const sharedStrings: string[] = [];
      if (ssEntry) {
        const ssXml = ssEntry.getData().toString("utf8");
        for (const m of ssXml.matchAll(/<t[^>]*>([^<]*)<\/t>/g)) sharedStrings.push(m[1]);
      }

      // Helper: parse all rows from a sheet XML into {rowNum → {col → value}}
      type CellMap = Record<string, string>;
      function parseSheet(sheetXml: string): Record<number, CellMap> {
        const result: Record<number, CellMap> = {};
        for (const rowM of sheetXml.matchAll(/<row r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
          const rowNum = parseInt(rowM[1]);
          const cellMap: CellMap = {};
          // String cells: t="s"
          for (const cm of rowM[2].matchAll(/<c r="([A-Z]+)\d+"[^>]*t="s"[^>]*><v>(\d+)<\/v><\/c>/g)) {
            cellMap[cm[1]] = (sharedStrings[parseInt(cm[2])] ?? "").trim();
          }
          // Numeric/other cells (no t= attribute or t != "s")
          for (const cm of rowM[2].matchAll(/<c r="([A-Z]+)\d+"(?![^>]*t="s")[^>]*><v>([^<]+)<\/v><\/c>/g)) {
            if (!cellMap[cm[1]]) cellMap[cm[1]] = cm[2].trim();
          }
          if (Object.keys(cellMap).length > 0) result[rowNum] = cellMap;
        }
        return result;
      }

      // Try sheets in order: sheet2 first (Norte standard format), then sheet1
      const sheetNames = ["xl/worksheets/sheet2.xml", "xl/worksheets/sheet1.xml",
                          "xl/worksheets/sheet3.xml", "xl/worksheets/sheet4.xml"];

      let rows: Record<number, CellMap> = {};
      let headerRow = -1;
      let colMap: Record<string, string> = {};

      for (const sheetName of sheetNames) {
        const entry = zip.getEntry(sheetName);
        if (!entry) continue;
        const candidate = parseSheet(entry.getData().toString("utf8"));

        // Find header row in this sheet
        for (const [rn, cells] of Object.entries(candidate)) {
          const vals = Object.values(cells).map(v => v.toLowerCase().trim());
          if (vals.includes("item") && (vals.includes("qtde") || vals.includes("qtd") || vals.includes("quantidade"))) {
            headerRow = parseInt(rn);
            rows = candidate;
            // Map column letters to field names
            for (const [col, val] of Object.entries(cells)) {
              const v = val.toLowerCase().replace(/\s+/g, " ").trim();
              if (v === "item") colMap["item"] = col;
              else if (v === "qtde" || v === "qtd" || v === "quantidade") colMap["qty"] = col;
              else if (v.startsWith("área") || v === "area" || v === "compr") colMap["width"] = col;
              else if (v === "visual" || v === "altura") colMap["height"] = col;
              else if (v === "material") colMap["material"] = col;
              else if (v === "acabamento") colMap["finish"] = col;
              else if (v.startsWith("medida do arquivo") || v === "medida arquivo") colMap["fileSize"] = col;
              else if (v === "m²" || v === "m2") colMap["m2"] = col;
              else if (v === "obs" || v.startsWith("observa")) colMap["obs"] = col;
            }
            break;
          }
        }
        if (headerRow !== -1) break;
      }

      if (headerRow === -1) {
        return res.status(400).json({ error: "Cabeçalho não encontrado. A planilha deve ter colunas 'item' e 'qtde'." });
      }

      // In Norte's format column B = group/tipo (e.g. "2x1", "ROLO")
      // Detect the group column: it's the column just before "item"
      const itemCol = colMap["item"]!;
      const itemColIdx = itemCol.charCodeAt(0) - 65; // A=0, B=1 ...
      const groupCol = itemColIdx > 0 ? String.fromCharCode(65 + itemColIdx - 1) : null;
      // Code column is immediately after item col (e.g. C→D). Used as qty fallback when E is absent.
      const codeCol = String.fromCharCode(65 + itemColIdx + 1);

      // Also detect width/height from area columns after header if not found by name
      // Norte sheets use G=área(width) H=visual(height) K=fileW L=fileH
      // But colMap["width"] might not be set if column header was "área " (trailing space)
      // Fix: search again more loosely
      const hdrRow = rows[headerRow] ?? {};
      for (const [col, val] of Object.entries(hdrRow)) {
        const v = val.toLowerCase().trim();
        if (!colMap["width"] && (v.startsWith("área") || v === "area")) colMap["width"] = col;
        if (!colMap["height"] && v === "visual") colMap["height"] = col;
        // K/L are "medida do arquivo" width and height separately in some sheets
        if (!colMap["fileW"] && v.startsWith("medida do arquivo")) colMap["fileW"] = col;
        if (!colMap["fileH"] && v === "compr") colMap["fileH"] = col;
      }

      // Determine next column letters for file dimensions (Norte: K=fileW, L=fileH after J=acabamento)
      const finCol = colMap["finish"];
      if (finCol && !colMap["fileW"]) {
        const finIdx = finCol.charCodeAt(0) - 65;
        colMap["fileW"] = String.fromCharCode(65 + finIdx + 1); // K
        colMap["fileH"] = String.fromCharCode(65 + finIdx + 2); // L
      }

      const parseNum = (s: string): number => {
        if (!s) return 0;
        const clean = s.replace(",", ".").replace(/[^\d.eE+\-]/g, "");
        return parseFloat(clean) || 0;
      };

      let currentGroup = "";
      const itemsToCreate: any[] = [];
      const numRows = Math.max(...Object.keys(rows).map(Number));

      for (let r = headerRow + 1; r <= numRows; r++) {
        const row = rows[r];
        if (!row) continue;

        // Group column (B in Norte format) — only update currentGroup for non-numeric text
        if (groupCol && row[groupCol] && !/^\d+$/.test(row[groupCol].trim())) currentGroup = row[groupCol].trim();

        let itemVal = colMap["item"] ? (row[colMap["item"]] || "").trim() : "";
        // When item col (C) is empty but group col (B) stores a numeric shared-string index,
        // resolve it to the actual description (Excel sometimes emits formula results as numeric indices)
        if (!itemVal && groupCol && row[groupCol] && /^\d+$/.test(row[groupCol].trim())) {
          const ssIdx = parseInt(row[groupCol].trim());
          if (ssIdx > 0 && sharedStrings[ssIdx]) itemVal = sharedStrings[ssIdx].trim();
        }

        const qtyStr  = colMap["qty"]  ? (row[colMap["qty"]]  || "").trim() : "";
        const matVal  = colMap["material"] ? (row[colMap["material"]] || "").trim() : "";
        const finVal  = colMap["finish"]   ? (row[colMap["finish"]]   || "").trim() : "";
        const wVal    = colMap["width"]    ? (row[colMap["width"]]    || "").trim() : "";
        const hVal    = colMap["height"]   ? (row[colMap["height"]]   || "").trim() : "";
        const fwVal   = colMap["fileW"]    ? (row[colMap["fileW"]]    || "").trim() : "";
        const fhVal   = colMap["fileH"]    ? (row[colMap["fileH"]]    || "").trim() : "";
        const fileSizeVal = colMap["fileSize"] ? (row[colMap["fileSize"]] || "").trim() : "";
        const obsVal  = colMap["obs"]      ? (row[colMap["obs"]]      || "").trim() : "";

        if (!itemVal) continue;

        let qty = parseInt(qtyStr) || 0;
        // Fallback: if qty col (E) is empty, check code col (D) for a bare integer qty
        // This happens in Norte sheets where PALCO/PÓRTICO rows store qty in D
        if (qty === 0) {
          const codeVal = (row[codeCol] || "").trim();
          if (/^\d+$/.test(codeVal)) qty = parseInt(codeVal);
        }
        if (qty === 0) continue;

        // Parse visual dimensions
        const visualW = parseNum(wVal);
        const visualH = parseNum(hVal);

        // Parse file dimensions: prefer explicit columns K/L, then "medida do arquivo" string, then fallback to visual
        let fileW = parseNum(fwVal) || visualW;
        let fileH = parseNum(fhVal) || visualH;
        if (fileSizeVal && (!fileW || !fileH)) {
          const parts = fileSizeVal.replace(/,/g, ".").replace(/\s/g, "").split(/[xX×]/);
          if (parts.length >= 2) {
            fileW = parseFloat(parts[0]) || fileW;
            fileH = parseFloat(parts[1]) || fileH;
          }
        }

        const calcM2 = qty * fileW * fileH;
        const cap = (s: string) => s ? (s.charAt(0).toUpperCase() + s.slice(1)) : s;
        const measurement = fileW && fileH
          ? `${fileW.toFixed(2)} × ${fileH.toFixed(2)}`
          : (visualW && visualH ? `${visualW.toFixed(2)} × ${visualH.toFixed(2)}` : "");

        itemsToCreate.push({
          eventId: event.id,
          type: currentGroup || itemVal,
          description: itemVal,
          quantity: qty,
          area: visualW || fileW || 0,
          visual: visualH || fileH || 0,
          calculatedM2: calcM2 || 0,
          material: cap(matVal) || "Lona",
          finish: cap(finVal) || "Ilhós",
          measurement,
          observations: obsVal,
          status: "requested",
        });
      }

      if (itemsToCreate.length === 0) {
        return res.status(400).json({ error: "Nenhum item válido encontrado na planilha. Verifique se há linhas com item e qtde preenchidos." });
      }

      // Validate and create
      const validated = itemsToCreate.map((item, i) => {
        try {
          return insertItemSchema.parse(item);
        } catch (e: any) {
          throw new Error(`Item ${i + 1} (${item.description}): ${e.message}`);
        }
      });

      const created = await storage.createBulkItems(validated);

      // Audit log
      await createAuditLog(
        (req as any).userName,
        'created',
        'item',
        event.id,
        `${created.length} itens importados via Excel ("${file.originalname}")`
      );

      const notification = await storage.createNotification({
        type: "itemAdded",
        message: `${created.length} itens importados via Excel — Evento: ${event.name}`,
        eventId: event.id,
        targetRoles: ["arte", "grafica"],
      });
      broadcast({ type: "notification_created", notification });
      broadcast({ type: "items_bulk_created", items: created, eventId: event.id });
      await updateEventStatus(event.id);

      res.status(201).json({ imported: created.length, items: created });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
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

      const { default: AdmZip } = await import("adm-zip");
      let zip: any;
      try { zip = new AdmZip(file.buffer); }
      catch (e: any) { return res.status(400).json({ error: `Arquivo inválido ou corrompido: ${e.message}` }); }

      // Parse sharedStrings correctly — each <si> = one entry, concat all <t> children
      const sharedStrings: string[] = [];
      const ssEntry = zip.getEntry("xl/sharedStrings.xml");
      if (ssEntry) {
        const ssXml = ssEntry.getData().toString("utf8");
        for (const siM of ssXml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
          const parts: string[] = [];
          for (const tM of siM[1].matchAll(/<t[^>]*>([^<]*)<\/t>/g)) parts.push(tM[1]);
          sharedStrings.push(parts.join(""));
        }
      }

      const decodeXml = (s: string) =>
        s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
         .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_,n) => String.fromCharCode(+n));

      type CellMap = Record<string, string>;
      function parseSheet(sheetXml: string): Record<number, CellMap> {
        const result: Record<number, CellMap> = {};
        for (const rowM of sheetXml.matchAll(/<row r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
          const rowNum = parseInt(rowM[1]);
          const cellMap: CellMap = {};
          // Parse each cell individually to handle all types: s, str, inlineStr, numeric
          for (const cm of rowM[2].matchAll(/<c r="([A-Z]+)\d+"([^>]*)>([\s\S]*?)<\/c>/g)) {
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
              for (const tM of content.matchAll(/<t[^>]*>([^<]*)<\/t>/g)) parts.push(tM[1]);
              val = decodeXml(parts.join(""));
            } else {
              // t="str" (formula string), t="" (number), t="b" (boolean), etc.
              // <f> may appear before <v> in formula cells — use [\s\S]*? to skip it
              const vM = content.match(/<v>([^<]+)<\/v>/);
              if (vM) val = decodeXml(vM[1].trim());
            }
            if (val.trim()) cellMap[col] = val.trim();
          }
          if (Object.keys(cellMap).length > 0) result[rowNum] = cellMap;
        }
        return result;
      }

      let rows: Record<number, CellMap> = {};
      let headerRow = -1;
      let colMap: Record<string, string> = {};

      // Normalise text for header matching (strip accents, lowercase)
      const normHdr = (s: string) =>
        s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();

      // Collect all worksheet entries from the ZIP
      const sheetEntries: string[] = [];
      for (const entry of zip.getEntries()) {
        if (/^xl\/worksheets\/sheet\d+\.xml$/.test(entry.entryName)) sheetEntries.push(entry.entryName);
      }
      // Try sheet2 first (common for multi-sheet workbooks), then sheet1, then rest
      sheetEntries.sort((a, b) => {
        const na = parseInt(a.match(/(\d+)/)?.[1] ?? "0");
        const nb = parseInt(b.match(/(\d+)/)?.[1] ?? "0");
        if (na === 2) return -1; if (nb === 2) return 1;
        if (na === 1) return -1; if (nb === 1) return 1;
        return na - nb;
      });

      // Helper predicates — defined once, reused across all sheets
      const isItemCol = (v: string) =>
        v === "item" || v === "peca" || v === "pecas" || v === "descricao" || v === "descr" ||
        v === "nome" || v === "produto" || v === "tipo" ||
        v.startsWith("descri") || v.startsWith("tipo de");
      const isCodeCol = (v: string) =>
        (v.startsWith("cod") || v.startsWith("codigo")) && v.includes("peca");
      const isQtyCol = (v: string) =>
        v === "qtde" || v === "qtd" || v === "qtd." || v === "quantidade" || v === "quant" ||
        v === "und" || v === "unid" || v === "unidade" || v === "qnt" || v === "un" || v === "un." ||
        v.startsWith("qtd") || v.startsWith("quan") || v.includes("quantidade");

      // Round to 4 decimal places to eliminate IEEE-754 floating point noise
      const parseNum = (s: string) => {
        if (!s) return 0;
        const n = parseFloat(s.replace(",", ".").replace(/[^\d.eE+\-]/g, "")) || 0;
        return Math.round(n * 10000) / 10000;
      };
      const cap = (s: string) => s ? (s.charAt(0).toUpperCase() + s.slice(1)) : s;

      // Try every sheet; keep the candidate that yields the most valid items.
      // This handles workbooks where a secondary sheet has a header-like row but no data,
      // which previously caused the parser to stop at the wrong sheet.
      let bestItems: any[] = [];
      let anyHeaderFound = false;

      for (const sn of sheetEntries) {
        const entry = zip.getEntry(sn);
        if (!entry) continue;
        const candidate = parseSheet(entry.getData().toString("utf8"));

        let localHeaderRow = -1;
        const localColMap: Record<string, string> = {};

        // --- Header detection ---
        for (const [rn, cells] of Object.entries(candidate)) {
          const vals = Object.values(cells).map(v => normHdr(v));
          const hasItem = vals.some(v => isItemCol(v) || isCodeCol(v));
          const hasQty  = vals.some(isQtyCol);
          if (hasItem && hasQty) {
            localHeaderRow = parseInt(rn);
            let codeColLetter: string | null = null;
            for (const [col, val] of Object.entries(cells)) {
              const v = normHdr(val);
              if (!localColMap["item"] && isItemCol(v))          localColMap["item"] = col;
              else if (isCodeCol(v))                             codeColLetter = col;
              else if (!localColMap["qty"] && isQtyCol(v))       localColMap["qty"] = col;
              else if (!localColMap["width"]  && (v.startsWith("area") || v === "compr" || v === "largura" || v === "larg")) localColMap["width"] = col;
              else if (!localColMap["height"] && (v === "visual" || v === "visu" || v === "altura" || v === "alt")) localColMap["height"] = col;
              else if (!localColMap["material"] && v === "material") localColMap["material"] = col;
              else if (!localColMap["finish"]   && (v === "acabamento" || v === "acab")) localColMap["finish"] = col;
              else if (!localColMap["fileSize"] && (v.startsWith("medida") || v === "medida arquivo" || v === "dimensao" || v === "dimensoes")) localColMap["fileSize"] = col;
              else if (!localColMap["m2"]  && (v === "m2" || v === "m\u00b2" || v === "metragem")) localColMap["m2"] = col;
              else if (!localColMap["obs"] && (v === "obs" || v.startsWith("observa"))) localColMap["obs"] = col;
            }
            if (!localColMap["item"] && codeColLetter) {
              const codeIdx = codeColLetter.charCodeAt(0) - 65;
              if (codeIdx > 0) localColMap["item"] = String.fromCharCode(65 + codeIdx - 1);
            }
            break;
          }
        }

        if (localHeaderRow === -1) continue;
        anyHeaderFound = true;

        // --- Secondary column inference (pass 2 over the header row) ---
        const hdrRowCells = candidate[localHeaderRow] ?? {};
        for (const [col, val] of Object.entries(hdrRowCells)) {
          const v = val.toLowerCase().trim();
          if (!localColMap["width"] && (v.startsWith("área") || v.startsWith("area"))) localColMap["width"] = col;
          if (!localColMap["height"] && (v === "visual" || v === "visu")) localColMap["height"] = col;
          if (!localColMap["fileW"] && v.startsWith("medida do arquivo")) localColMap["fileW"] = col;
          if (!localColMap["fileH"] && v === "compr") localColMap["fileH"] = col;
          if (!localColMap["obs"] && (v === "obs" || v.startsWith("observa"))) localColMap["obs"] = col;
        }
        const finColL = localColMap["finish"];
        if (finColL && !localColMap["fileW"]) {
          const fi = finColL.charCodeAt(0) - 65;
          localColMap["fileW"] = String.fromCharCode(65 + fi + 1);
          localColMap["fileH"] = String.fromCharCode(65 + fi + 2);
        }
        if (localColMap["fileW"] && !localColMap["fileH"]) {
          const fwIdx = localColMap["fileW"].charCodeAt(0) - 65;
          localColMap["fileH"] = String.fromCharCode(65 + fwIdx + 1);
        }
        if (localColMap["height"] && !localColMap["width"]) {
          const hIdx = localColMap["height"].charCodeAt(0) - 65;
          if (hIdx > 0) localColMap["width"] = String.fromCharCode(65 + hIdx - 1);
        }

        // --- Item extraction ---
        if (!localColMap["item"]) continue;
        const itemColL = localColMap["item"];
        const itemColIdx = itemColL.charCodeAt(0) - 65;
        const groupColL = itemColIdx > 0 ? String.fromCharCode(65 + itemColIdx - 1) : null;
        const codeColL  = String.fromCharCode(65 + itemColIdx + 1);

        let currentGroup = "";
        const localItems: any[] = [];
        const numRows = Math.max(...Object.keys(candidate).map(Number));

        for (let r = localHeaderRow + 1; r <= numRows; r++) {
          const row = candidate[r];
          if (!row) continue;
          if (groupColL && row[groupColL] && !/^\d+$/.test(row[groupColL].trim())) currentGroup = row[groupColL].trim();
          let itemVal = (row[itemColL] || "").trim();
          if (!itemVal && groupColL && row[groupColL] && /^\d+$/.test(row[groupColL].trim())) {
            const ssIdx = parseInt(row[groupColL].trim());
            if (ssIdx > 0 && sharedStrings[ssIdx]) itemVal = sharedStrings[ssIdx].trim();
          }
          if (!itemVal) continue;

          const qtyStr = localColMap["qty"] ? (row[localColMap["qty"]] || "").trim() : "";
          let qty = Math.floor(parseFloat(qtyStr.replace(",", ".")) || 0);
          if (qty === 0) {
            const codeVal = (row[codeColL] || "").trim();
            if (/^\d+$/.test(codeVal)) qty = parseInt(codeVal);
          }
          if (qty === 0) continue;

          const matVal = localColMap["material"] ? (row[localColMap["material"]] || "").trim() : "";
          const finVal = localColMap["finish"]   ? (row[localColMap["finish"]]   || "").trim() : "";
          const wVal   = localColMap["width"]    ? (row[localColMap["width"]]    || "").trim() : "";
          const hVal   = localColMap["height"]   ? (row[localColMap["height"]]   || "").trim() : "";
          const fwVal  = localColMap["fileW"]    ? (row[localColMap["fileW"]]    || "").trim() : "";
          const fhVal  = localColMap["fileH"]    ? (row[localColMap["fileH"]]    || "").trim() : "";
          const fileSizeVal = localColMap["fileSize"] ? (row[localColMap["fileSize"]] || "").trim() : "";
          const obsVal = localColMap["obs"]      ? (row[localColMap["obs"]]      || "").trim() : "";

          const visualW = parseNum(wVal);
          const visualH = parseNum(hVal);
          let fileW = parseNum(fwVal) || visualW;
          let fileH = parseNum(fhVal) || visualH;
          if (fileSizeVal && (!fileW || !fileH)) {
            const parts = fileSizeVal.replace(/,/g, ".").replace(/\s/g, "").split(/[xX×]/);
            if (parts.length >= 2) { fileW = parseFloat(parts[0]) || fileW; fileH = parseFloat(parts[1]) || fileH; }
          }

          // Normalize group names in two passes:
          // Pass 1 — dimension groups: "2X1 MBRF" or empty-group "2×1 Mbrf" → "2X1"
          // Pass 2 — sequential counters: "TESTEIRA PÓRTICO DISPERSÃO 1" → "TESTEIRA PÓRTICO DISPERSÃO"
          const rawType = currentGroup || itemVal;
          const dimRe = /^(\d+)\s*[xX×]\s*(\d+)/i;
          const gDim = rawType.match(dimRe);
          const iDim = itemVal.match(dimRe);
          let groupType = (
            gDim && iDim &&
            gDim[1] === iDim[1] && gDim[2] === iDim[2] &&
            rawType.replace(/\s/g, "").length > `${gDim[1]}x${gDim[2]}`.length
          ) ? `${gDim[1]}X${gDim[2]}` : rawType;
          // Pass 2: strip trailing sequential integer (" 1", " 2", " 3"…)
          // Keeps "7M", "BOCA DE 6)", "3X1" etc. intact; only strips bare numbers at the very end.
          const trailingNum = groupType.match(/^(.+?)\s+\d+$/);
          if (trailingNum) groupType = trailingNum[1];

          // Patrocinador sugerido = nome que aparece na descrição da PRÓPRIA
          // peça (cada peça tem o seu, ex.: "2x1 Sotreq"). Sempre limitado aos
          // patrocinadores já vinculados ao evento.
          const suggestedSponsorIds = matchSponsors(itemVal);

          localItems.push({
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
          });
        }

        if (localItems.length > bestItems.length) {
          bestItems = localItems;
        }
      }

      if (!anyHeaderFound) {
        // Log all row values found to aid debugging
        const allRowSamples: string[] = [];
        for (const sn of sheetEntries.slice(0, 2)) {
          const entry = zip.getEntry(sn);
          if (!entry) continue;
          const candidate = parseSheet(entry.getData().toString("utf8"));
          for (const [rn, cells] of Object.entries(candidate).slice(0, 10)) {
            const vals = Object.values(cells as CellMap).map((v: string) => normHdr(v)).filter(Boolean);
            if (vals.length > 0) allRowSamples.push(`  row ${rn} [${sn}]: ${vals.join(" | ")}`);
          }
        }
        console.error("[preview-xlsx] header not found. File:", file.originalname, "\nRows scanned:\n" + allRowSamples.join("\n"));
        return res.status(400).json({ error: "Cabeçalho não encontrado. A planilha deve ter colunas 'item' (ou 'peça'/'descrição') e 'qtde' (ou 'quantidade')." });
      }

      const items = bestItems;
      if (items.length === 0) return res.status(400).json({ error: "Nenhum item válido encontrado. Verifique se há linhas com quantidade > 0." });
      res.json({ items, fileName: file.originalname });
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
        visualWidth: item.visualWidth !== null && item.visualWidth !== undefined ? Number(item.visualWidth) : null,
        visualHeight: item.visualHeight !== null && item.visualHeight !== undefined ? Number(item.visualHeight) : null,
        fileWidth: item.fileWidth !== null && item.fileWidth !== undefined ? Number(item.fileWidth) : null,
        fileHeight: item.fileHeight !== null && item.fileHeight !== undefined ? Number(item.fileHeight) : null,
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

      await createAuditLog(
        (req as any).userName, 'created', 'item', event.id,
        `${created.length} itens importados via Excel${fileName ? ` ("${fileName}")` : ""}`
      );
      const notification = await storage.createNotification({
        type: "itemAdded",
        message: `${created.length} itens importados via Excel — Evento: ${event.name}`,
        eventId: event.id,
        targetRoles: ["arte", "grafica"],
      });
      broadcast({ type: "notification_created", notification });
      broadcast({ type: "items_bulk_created", items: created, eventId: event.id });
      await updateEventStatus(event.id);

      res.status(201).json({ imported: created.length, items: created });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }
