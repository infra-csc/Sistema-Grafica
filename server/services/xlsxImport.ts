// XLSX item import/preview/confirm handlers. Extracted from server/routes.ts
// (ITEMS section) into a dedicated service module, as suggested by the
// original code review — pure relocation, no parsing logic changed.
import type { Request, Response } from "express";
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { storage, isDisplayIdConflictError } from "../storage";
import { insertItemSchema, items as itemsTable, itemSponsors, kitRemessas } from "@shared/schema";
import { broadcast, createAuditLog, createAuditLogsEmLote, updateEventStatus } from "../routes/shared";
import AdmZip from "adm-zip";
import { carregarRemessa, remessaSchema } from "./kitRemessas";
import { cabecalhoDoKit, diaMesDoKit, remessaUtilizavelPor, type CabecalhoDoKit } from "@shared/kit";
import { camposDoErro, fraseDoZod } from "../erros";
import { tipoCanonico } from "@shared/molde";
// O tipo da planilha casado com o catálogo e com os tipos do evento (relato
// de 25/09: a peça importada não caía no grupo da criada à mão).
import { alinharTipo } from "@shared/tipo-da-peca";

  // ── O CABEÇALHO DA PLANILHA DO KIT (14/09) ───────────────────────────────
  // Rótulo na coluna A, valor na B, nas linhas acima da tabela de peças; o
  // nome do evento na A1. Null quando a planilha não é do Kit.
  export function lerCabecalhoDoKit(buffer: Buffer): CabecalhoDoKit | null {
    let zip: AdmZip;
    try { zip = new AdmZip(buffer); } catch { return null; }
    const compartilhadas: string[] = [];
    const ssEntry = zip.getEntry("xl/sharedStrings.xml");
    if (ssEntry) {
      const ssXml = ssEntry.getData().toString("utf8");
      for (const siM of Array.from(ssXml.matchAll(/<si>([\s\S]*?)<\/si>/g)) as RegExpMatchArray[]) {
        compartilhadas.push(Array.from((siM[1] as string).matchAll(/<t[^>]*>([^<]*)<\/t>/g)).map((t) => (t as RegExpMatchArray)[1]).join(""));
      }
    }
    const decodificar = (s: string) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
    for (const entry of zip.getEntries()) {
      if (!/^xl\/worksheets\/sheet\d+\.xml$/.test(entry.entryName)) continue;
      const xml = entry.getData().toString("utf8");
      const pares: Array<{ rotulo: string; valor: string }> = [];
      let primeira: string | null = null;
      for (const rowM of Array.from(xml.matchAll(/<row r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) as RegExpMatchArray[]) {
        const numero = parseInt(rowM[1] as string, 10);
        if (numero > 40) break;
        // Célula vazia auto-fechada (<c r="B9" s="2"/>) atrapalharia a regex.
        const conteudo = (rowM[2] as string).replace(/<c [^>]*\/>/g, "");
        const celulas: Record<string, string> = {};
        for (const cm of Array.from(conteudo.matchAll(/<c r="([A-Z]+)\d+"([^>]*)>([\s\S]*?)<\/c>/g)) as RegExpMatchArray[]) {
          const tipo = ((cm[2] as string).match(/\bt="([^"]+)"/) ?? [])[1] ?? "";
          let valor = "";
          if (tipo === "s") valor = compartilhadas[parseInt(((cm[3] as string).match(/<v>(\d+)<\/v>/) ?? [])[1] ?? "-1", 10)] ?? "";
          else if (tipo === "inlineStr") valor = Array.from((cm[3] as string).matchAll(/<t[^>]*>([^<]*)<\/t>/g)).map((t) => (t as RegExpMatchArray)[1]).join("");
          else valor = ((cm[3] as string).match(/<v>([^<]+)<\/v>/) ?? [])[1] ?? "";
          valor = decodificar(valor).trim();
          if (valor) celulas[cm[1] as string] = valor;
        }
        if (numero === 1 && celulas.A) primeira = celulas.A;
        if (celulas.A && celulas.B) pares.push({ rotulo: celulas.A, valor: celulas.B });
      }
      const cabecalho = cabecalhoDoKit(pares, primeira);
      if (cabecalho) return cabecalho;
    }
    return null;
  }


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
    /** A linha da planilha (a numeração que o Excel mostra) — é o que o aviso cita. */
    linha?: number;
    /** A peça repete uma linha anterior da MESMA planilha (tipo, descrição e medida iguais). */
    repeteLinha?: number;
  };

  /** Linha com cara de peça que ficou fora da leitura, e por quê. */
  export type LinhaIgnorada = { linha: number; motivo: string };

  export type LeituraDaPlanilha =
    | { ok: true; items: PecaLida[]; ignoradas: LinhaIgnorada[] }
    | { ok: false; erro: string; amostra?: string };

  /**
   * A identidade de uma peça DENTRO da planilha: tipo, descrição e medida de
   * arquivo, sem acento nem caixa. Diferente da chave da reimportação (que
   * ignora a medida): na mesma planilha, dois "Testeira" de tamanhos
   * diferentes são peças diferentes; iguais em tudo, é linha copiada duas
   * vezes — e a gráfica imprimiria as duas.
   */
  export function chaveNaPlanilha(p: { type?: unknown; description?: unknown; fileWidth?: unknown; fileHeight?: unknown }): string {
    const norm = (v: unknown) => String(v ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
    const medida = (v: unknown) => { const n = parseFloat(String(v ?? "")); return Number.isFinite(n) ? n.toFixed(2) : ""; };
    return [norm(p.type), norm(p.description), medida(p.fileWidth), medida(p.fileHeight)].join("|");
  }

  /** Marca, em cada peça repetida, a primeira linha que ela repete. */
  export function marcarRepetidas<T extends { linha?: number; repeteLinha?: number }>(pecas: T[], chave: (p: T) => string): T[] {
    const primeira = new Map<string, number>();
    return pecas.map((p, i) => {
      const k = chave(p);
      const linha = p.linha ?? i + 1;
      const antes = primeira.get(k);
      if (antes === undefined) { primeira.set(k, linha); return p; }
      return { ...p, repeteLinha: antes };
    });
  }

  /** Um valor que é um ID de peça (#0386, 0386, #0062-C1) — nunca é nome de grupo. */
  const pareceIdDePeca = (v: string) => /^#?\d+(-C\d+)?$/i.test(v.trim());

  export function lerPlanilhaDePecas(
    buffer: Buffer,
    matchSponsors: (texto: string) => string[],
  ): LeituraDaPlanilha {
    let zip: AdmZip;
    try { zip = new AdmZip(buffer); }
    catch (e: unknown) { return { ok: false, erro: `Arquivo inválido ou corrompido: ${camposDoErro(e).message}` }; }

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
    let bestIgnoradas: LinhaIgnorada[] = [];
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
      const localIgnoradas: LinhaIgnorada[] = [];
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
        // Linha com peça e sem quantidade válida fica de fora — mas DITA: antes
        // sumia em silêncio (e a negativa passava, para estourar só no
        // confirmar com o erro cru do validador).
        if (qty < 1) {
          localIgnoradas.push({
            linha: r,
            motivo: qtyStr ? `quantidade mínima é 1 (veio "${qtyStr}")` : "sem quantidade",
          });
          continue;
        }

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
          // "MOLDE", "moldes"… viram o tipo canônico "Molde" (shared/molde).
          type: tipoCanonico(groupType),
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
          linha: r,
        };
        if (/^sim$/i.test(reuseVal)) peca.reuse = true;
        localItems.push(peca);
      }

      if (localItems.length > bestItems.length) { bestItems = localItems; bestIgnoradas = localIgnoradas; }
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
    return { ok: true, items: marcarRepetidas(bestItems, chaveNaPlanilha), ignoradas: bestIgnoradas };
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
      const sponsorById = new Map(allSponsorsList.map((s) => [s.id, s]));
      const eventSponsors = eventSponsorRows
        .map((es) => sponsorById.get(es.sponsorId))
        .filter((s): s is (typeof allSponsorsList)[number] => Boolean(s))
        .map((s) => ({ id: s.id, name: s.name, norm: normSponsor(s.name) }))
        // ignora nomes muito curtos (< 3) para evitar falso-positivo em substrings
        .filter((s) => s.norm.length >= 3);
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
        upload.single("file")(req, res, (err: unknown) => err ? reject(err) : resolve())
      );

      const file: { buffer: Buffer; originalname: string } | undefined = req.file;
      if (!file) return res.status(400).json({ error: "Arquivo .xlsx não encontrado" });

      const leitura = lerPlanilhaDePecas(file.buffer, matchSponsors);
      if (!leitura.ok) {
        if (leitura.amostra) console.error("[preview-xlsx] header not found. File:", file.originalname, "\nRows scanned:\n" + leitura.amostra);
        return res.status(400).json({ error: leitura.erro });
      }
      // Planilha do Kit: o cabeçalho (datas, versão, solicitante) vai junto
      // para a tela sugerir a remessa nova.
      // `ignoradas`: as linhas que ficaram de fora e por quê — a tela lista
      // "Linha 12: quantidade mínima é 1" em vez de a peça sumir calada.
      // O tipo que a prévia mostra já é o que vai ser gravado (ver alinharTipo).
      const [modelos, pecasDoEvento] = await Promise.all([storage.getAllStandardItems(), storage.getItemsByEvent(event.id)]);
      const ctxDoTipo = { modelos, tiposDoEvento: Array.from(new Set(pecasDoEvento.map((i) => i.type).filter(Boolean))) };
      const items = leitura.items.map((it) => ({ ...it, type: alinharTipo(it.type, ctxDoTipo).type }));
      res.json({ items, ignoradas: leitura.ignoradas, fileName: file.originalname, kit: lerCabecalhoDoKit(file.buffer) });
    } catch (error: unknown) {
      const campos = camposDoErro(error) as { message?: string; code?: string; stack?: string };
      console.error("[preview-xlsx] unhandled error:", campos.message, campos.stack?.slice(0, 600));
      // Arquivo grande demais é o único erro "do usuário" que chega aqui.
      if (campos.code === "LIMIT_FILE_SIZE") return res.status(400).json({ error: "Planilha grande demais — o limite é 50 MB." });
      res.status(400).json({ error: "Não foi possível ler a planilha. Confira se é um .xlsx válido." });
    }
  }

  /** Uma linha como o preview devolveu. Vem do cliente: nada é garantido. */
  type LinhaImportada = {
    linha?: unknown; type?: unknown; description?: unknown; quantity?: unknown;
    visualWidth?: unknown; visualHeight?: unknown; fileWidth?: unknown; fileHeight?: unknown;
    calculatedM2?: unknown; material?: unknown; finish?: unknown; measurement?: unknown; observations?: unknown;
    suggestedSponsorIds?: unknown; suggestedSponsorId?: unknown;
  };

  // ── Confirm import (save pre-reviewed items) ─────────────────────────────
  //
  // TUDO OU NADA: a remessa nova do Kit, as peças e os vínculos com
  // patrocinador são gravados numa transação só. Antes eram três passos
  // soltos — a remessa nascia, as peças falhavam na validação e a remessa
  // ficava vazia no evento; ou as peças entravam e um vínculo falhava calado
  // (`.catch(() => {})`), e a peça seguia "sem patrocinador" sem ninguém saber.
  // O que vem DEPOIS (trilha, aviso, status do evento) não desfaz a importação:
  // cada um no seu try/catch, e a resposta sai com as peças gravadas.
  export async function handleConfirmImport(req: Request, res: Response) {
    try {
      const event = await storage.getEvent(req.params.id);
      if (!event) return res.status(404).json({ error: "Evento não encontrado" });

      const { items, fileName, kitRemessaId: kitCru } = req.body as { items: LinhaImportada[]; fileName?: string; kitRemessaId?: string };
      if (!items || !Array.isArray(items) || items.length === 0)
        return res.status(400).json({ error: "Nenhum item para importar" });

      // KIT (14/09): importação para uma remessa do Kit; o usuário do Kit só
      // importa para uma remessa dele.
      const kitRemessaExistente = typeof kitCru === "string" && kitCru ? kitCru : null;
      // Planilha do Kit com remessa NOVA: a remessa nasce DENTRO da transação
      // das peças (abaixo) — aqui só se valida.
      const novaRemessaCrua: unknown = (req.body as { kitNovaRemessa?: unknown } | undefined)?.kitNovaRemessa;
      let novaRemessa: z.infer<typeof remessaSchema> | null = null;
      if (!kitRemessaExistente && novaRemessaCrua && typeof novaRemessaCrua === "object") {
        if (!["admin", "solicitacao"].includes(req.userRole ?? "")) {
          return res.status(403).json({ error: "Criar remessa do Kit é do admin e da Solicitação." });
        }
        const dadosRemessa = remessaSchema.safeParse({ ...novaRemessaCrua, eventId: event.id });
        if (!dadosRemessa.success) {
          return res.status(400).json({ error: dadosRemessa.error.errors?.[0]?.message || "Dados da remessa do Kit inválidos" });
        }
        novaRemessa = dadosRemessa.data;
      }
      if (req.userKit && !kitRemessaExistente && !novaRemessa) {
        return res.status(400).json({ error: "Usuário do Kit importa só peças do Kit — escolha a remessa do Kit." });
      }
      if (kitRemessaExistente) {
        const remessa = await carregarRemessa(kitRemessaExistente);
        if (!remessa || remessa.eventId !== event.id) return res.status(400).json({ error: "Remessa do Kit inválida para este evento." });
        if (!remessaUtilizavelPor({ kit: req.userKit === true, userId: req.userId }, remessa)) {
          return res.status(403).json({ error: "Esta remessa do Kit é de outra pessoa." });
        }
      }

      // A linha que a pessoa vê na planilha (o preview manda `linha`); sem
      // ela, a posição na lista.
      const linhaDe = (i: number) => {
        const linha = items[i]?.linha;
        // Number.isInteger já é falso para o que não é número.
        return typeof linha === "number" && Number.isInteger(linha) && linha > 0 ? linha : i + 1;
      };
      const texto = (v: unknown) => (v !== null && v !== undefined && v !== "" ? String(v) : null);

      // A confirmação é a autoridade: casa de novo (a prévia pode ter sido
      // editada) e grava o vínculo com o Modelo, como a criação individual.
      const [modelos, pecasDoEvento] = await Promise.all([storage.getAllStandardItems(), storage.getItemsByEvent(event.id)]);
      const ctxDoTipo = { modelos, tiposDoEvento: Array.from(new Set(pecasDoEvento.map((i) => i.type).filter(Boolean))) };
      const alinhar = (t: unknown) => (typeof t === "string" ? alinharTipo(tipoCanonico(t), ctxDoTipo) : { type: t as string, standardItemId: null });
      const toCreate = items.map((item) => ({
        eventId: event.id,
        type: alinhar(item.type).type,
        standardItemId: alinhar(item.type).standardItemId,
        description: item.description,
        quantity: Number(item.quantity),
        area: Number(item.visualWidth) || Number(item.fileWidth) || 0,
        visual: Number(item.visualHeight) || Number(item.fileHeight) || 0,
        // Colunas decimais: o schema espera string (ou null), como no fluxo
        // normal de criação de item — enviar Number aqui causa erro de validação.
        visualWidth: texto(item.visualWidth),
        visualHeight: texto(item.visualHeight),
        fileWidth: texto(item.fileWidth),
        fileHeight: texto(item.fileHeight),
        calculatedM2: Number(item.calculatedM2) || 0,
        material: item.material || "Lona",
        finish: item.finish || "Ilhós",
        measurement: item.measurement || "",
        observations: item.observations || "",
        status: "requested",
        kitRemessaId: kitRemessaExistente,
        criadoPorId: req.userId ?? null,
      }));

      // A mesma régua do preview, agora no servidor: a primeira linha com
      // defeito volta com o número da linha e o campo, em português.
      const validated: Array<z.infer<typeof insertItemSchema>> = [];
      for (let i = 0; i < toCreate.length; i++) {
        const item = toCreate[i];
        if (!Number.isInteger(item.quantity) || item.quantity < 1) {
          return res.status(400).json({ error: `Linha ${linhaDe(i)}: quantidade mínima é 1.`, linha: linhaDe(i) });
        }
        const r = insertItemSchema.safeParse(item);
        if (!r.success) return res.status(400).json({ error: `Linha ${linhaDe(i)}: ${fraseDoZod(r.error)}`, linha: linhaDe(i) });
        validated.push(r.data);
      }

      // Patrocinadores: só os do EVENTO. O vínculo com um patrocinador que
      // saiu do evento entre o preview e o confirmar não é gravado às cegas —
      // a importação volta dizendo qual linha e qual nome.
      const doEvento = new Set((await storage.getEventSponsors(event.id)).map((es) => es.sponsorId));
      const vinculosPorLinha: string[][] = [];
      for (let i = 0; i < items.length; i++) {
        const raw = items[i];
        // Aceita o formato antigo (suggestedSponsorId) e o atual (lista).
        const ids: unknown[] = Array.isArray(raw?.suggestedSponsorIds) && raw.suggestedSponsorIds.length
          ? raw.suggestedSponsorIds
          : (raw?.suggestedSponsorId ? [raw.suggestedSponsorId] : []);
        const unicos = Array.from(new Set(ids.filter((s): s is string => typeof s === "string" && !!s)));
        const fora = unicos.filter((s) => !doEvento.has(s));
        if (fora.length > 0) {
          const nomes = await Promise.all(fora.map(async (s) => (await storage.getSponsor(s))?.name ?? "desconhecido"));
          return res.status(400).json({
            error: `Linha ${linhaDe(i)}: ${nomes.join(", ")} não ${fora.length === 1 ? "é patrocinador" : "são patrocinadores"} deste evento — tire da peça ou vincule ao evento antes.`,
            linha: linhaDe(i),
          });
        }
        vinculosPorLinha.push(unicos);
      }

      const { created, remessaCriada } = await gravarImportacao({ eventId: event.id, validated, vinculosPorLinha, novaRemessa, req });

      // ── Daqui para baixo nada desfaz a importação ──────────────────────────
      if (remessaCriada) {
        try {
          await createAuditLog(req, "created", "event", event.id,
            `Remessa do Kit ${remessaCriada.versao} criada — entrega do material ${diaMesDoKit(remessaCriada.entregaMaterial) ?? "—"}`
            + (remessaCriada.saidaCaminhao ? `, saída do caminhão ${diaMesDoKit(remessaCriada.saidaCaminhao)}` : "")
            + (remessaCriada.arquivo ? ` (planilha "${remessaCriada.arquivo}")` : ""));
        } catch (e: unknown) { console.error("[confirm-import] trilha da remessa falhou:", camposDoErro(e).message); }
        broadcast({ type: "kit_remessas", eventId: event.id });
      }
      try {
        // Resumo da importação: é do EVENTO (o entityId é o evento). Marcar
        // como 'item' fazia o histórico procurar uma peça inexistente.
        await createAuditLog(
          req, 'created', 'event', event.id,
          `${created.length} itens importados via Excel${fileName ? ` ("${fileName}")` : ""}`
        );
        // Uma linha por peça (o histórico acha o autor pela peça), num INSERT só.
        await createAuditLogsEmLote(req, created.map((it) => ({
          action: 'created', entityType: 'item', entityId: it.id,
          details: `Item "${it.type}" importado via Excel - Qtd: ${it.quantity}`,
        })));
      } catch (e: unknown) {
        console.error("[confirm-import] peças importadas, mas a trilha falhou:", camposDoErro(e).message);
      }
      // O aviso não pode desfazer a importação (15/09): as peças já estão
      // gravadas — erro aqui fazia a tela dizer "não deu" e a pessoa importar
      // de novo, duplicando a remessa inteira.
      try {
        const notification = await storage.createNotification({
          type: "itemAdded",
          message: `${created.length} itens importados via Excel — Evento: ${event.name}`,
          eventId: event.id,
          targetRoles: ["arte"], // só quem AGE agora: a Gráfica entra bem depois, quando liberam p/ produção
        });
        broadcast({ type: "notification_created", notification });
      } catch (erroDoAviso: unknown) {
        console.error("[confirm-import] peças importadas, mas o aviso falhou:", camposDoErro(erroDoAviso).message);
      }
      broadcast({ type: "items_bulk_created", items: created, eventId: event.id });
      try {
        await updateEventStatus(event.id);
      } catch (e: unknown) {
        console.error("[confirm-import] peças importadas, mas o status do evento não recalculou:", camposDoErro(e).message);
      }

      res.status(201).json({ imported: created.length, items: created, ...(remessaCriada ? { kitRemessaId: remessaCriada.id } : {}) });
    } catch (error: unknown) {
      const { httpStatus, publico } = camposDoErro(error) as { httpStatus?: number; publico?: string };
      if (httpStatus && publico) return res.status(httpStatus).json({ error: publico });
      console.error("[confirm-import] falhou:", error);
      res.status(500).json({ error: "Não foi possível importar agora — nenhuma peça foi gravada. Tente de novo em instantes." });
    }
  }

  const paraDataDoKit = (d: string | null | undefined): Date | null => (d ? new Date(`${d}T12:00:00Z`) : null);

  /**
   * A transação da importação: remessa nova (se houver), peças e vínculos.
   * O código (#0001) sai da mesma sequência de storage.createBulkItems; numa
   * colisão entre servidores a sequência é ressincronizada e a transação
   * inteira roda de novo, uma vez.
   */
  async function gravarImportacao(p: {
    eventId: string;
    validated: Array<z.infer<typeof insertItemSchema>>;
    vinculosPorLinha: string[][];
    novaRemessa: z.infer<typeof remessaSchema> | null;
    req: Pick<Request, "userName" | "userId">;
  }) {
    // Os dois cuidados da sequência moram (privados) no storage; aqui só se
    // pede para garantir que ela existe e, na colisão, ressincronizar. O
    // colchete é o acesso a membro privado que o TypeScript permite.
    const armazem = storage;
    if (typeof armazem["ensureDisplayIdSequence"] === "function") await armazem["ensureDisplayIdSequence"]();
    const rodar = () => db.transaction(async (tx) => {
      let remessaCriada: typeof kitRemessas.$inferSelect | null = null;
      let kitRemessaId: string | null = p.validated[0]?.kitRemessaId ?? null;
      if (p.novaRemessa) {
        const d = p.novaRemessa;
        // Mesma versão duas vezes no mesmo evento é engano (um clique repetido
        // duplicava a remessa com as peças) — a regra de criarRemessa.
        const mesmas = await tx.select({ id: kitRemessas.id }).from(kitRemessas)
          .where(and(eq(kitRemessas.eventId, p.eventId), sql`lower(${kitRemessas.versao}) = lower(${d.versao})`));
        if (mesmas.length > 0) {
          throw Object.assign(new Error("remessa repetida"), {
            httpStatus: 409,
            publico: `Já existe a remessa KIT ${d.versao} neste evento — use a próxima versão ou exclua a repetida.`,
          });
        }
        [remessaCriada] = await tx.insert(kitRemessas).values({
          eventId: p.eventId,
          versao: d.versao,
          solicitante: d.solicitante || null,
          departamento: d.departamento || null,
          dataSolicitacao: paraDataDoKit(d.dataSolicitacao),
          entregaMaterial: paraDataDoKit(d.entregaMaterial)!,
          dataEvento: paraDataDoKit(d.dataEvento),
          cargaCaminhao: paraDataDoKit(d.cargaCaminhao),
          saidaCaminhao: paraDataDoKit(d.saidaCaminhao),
          arquivo: d.arquivo || null,
          criadoPor: p.req.userName ?? null,
          criadoPorId: p.req.userId ?? null,
        }).returning();
        kitRemessaId = remessaCriada!.id;
      }

      const seq = await tx.execute(sql`SELECT nextval('item_display_id_seq') as next_id FROM generate_series(1, ${p.validated.length})`);
      const codigos: string[] = ((seq as { rows?: Array<{ next_id?: unknown }> }).rows ?? []).map((row) => `#${String(Number(row.next_id)).padStart(4, "0")}`);
      const linhas = p.validated.map((item, i) => ({
        ...item,
        kitRemessaId,
        displayId: codigos[i],
        area: String(item.area),
        visual: String(item.visual),
        calculatedM2: String(item.calculatedM2),
      }));
      const created = await tx.insert(itemsTable).values(linhas).returning();

      const vinculos = created.flatMap((peca, i) => (p.vinculosPorLinha[i] ?? []).map((sponsorId) => ({ itemId: peca.id, sponsorId })));
      if (vinculos.length > 0) await tx.insert(itemSponsors).values(vinculos).onConflictDoNothing();

      return { created, remessaCriada };
    });
    try {
      return await rodar();
    } catch (error) {
      if (!isDisplayIdConflictError(error) || typeof armazem["syncDisplayIdSequence"] !== "function") throw error;
      await armazem["syncDisplayIdSequence"]();
      return await rodar();
    }
  }
