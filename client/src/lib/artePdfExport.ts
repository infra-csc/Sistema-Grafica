// Motor de exportação de PDF no layout "book" (A4 paisagem, arte grande +
// nome). Compartilhado entre a Arte e o Atendimento para que as duas telas
// tenham exatamente as mesmas opções e a mesma saída.
import { toast } from "@/hooks/use-toast";

export const escapeHtml = (v: unknown): string =>
  String(v ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string)
  );

export const convertGCSUrlToLocalPath = (gcsUrl: string): string => {
  if (gcsUrl.startsWith("/")) return gcsUrl;
  const match = gcsUrl.match(/\/\.private\/(.+?)(?:\?|$)/);
  if (match) return `/objects/${match[1]}`;
  return gcsUrl;
};

// Chave de grupo de uma peça (ex.: "Pórtico (Frontal)" → "Pórtico").
export const groupKeyOf = (item: any): string => (item.type ?? "").split(/[\s(]/)[0] || "Sem grupo";

export const MAX_ITEMS_PER_COMBINED_PAGE = 6;

// Pré-busca imagens como data URIs (resolve GCS 403 + timing de carregamento).
async function prefetchThumbsAsDataUris(items: any[]): Promise<Record<string, string>> {
  const rawUrls = Array.from(new Set(items.map((i: any) => i.approvalThumbUrl).filter(Boolean) as string[]));
  const out: Record<string, string> = {};
  await Promise.allSettled(rawUrls.map(async (rawUrl) => {
    if (/\.pdf$/i.test(rawUrl)) return;
    const localPath = convertGCSUrlToLocalPath(rawUrl);
    const fetchUrl = localPath.startsWith("/") ? `${window.location.origin}${localPath}` : localPath;
    try {
      const resp = await fetch(fetchUrl, { credentials: "include" });
      if (!resp.ok) return;
      const ct = resp.headers.get("content-type") || "";
      if (!ct.startsWith("image/")) return;
      const blob = await resp.blob();
      const dataUri = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      if (dataUri) out[rawUrl] = dataUri;
    } catch (error) {
      console.warn("Failed to fetch/convert thumbnail image for print", rawUrl, error);
    }
  }));
  return out;
}

type Chunk = { group: string; items: any[]; part: number; parts: number };

function chunkGroup(group: string, groupItems: any[]): Chunk[] {
  const parts = Math.ceil(groupItems.length / MAX_ITEMS_PER_COMBINED_PAGE);
  return Array.from({ length: parts }, (_, p) => ({
    group,
    items: groupItems.slice(p * MAX_ITEMS_PER_COMBINED_PAGE, (p + 1) * MAX_ITEMS_PER_COMBINED_PAGE),
    part: p + 1,
    parts,
  }));
}

/** Uma peça por página: arte grande + nome embaixo. */
function buildItemPage(item: any, thumbDataUris: Record<string, string>): string {
  const thumbUrl = item.approvalThumbUrl || "";
  const thumbDataUri = thumbDataUris[thumbUrl] || null;
  const isImg = !!thumbDataUri;
  const title = escapeHtml(item.type || item.description || "Sem nome");
  const art = isImg
    ? `<img src="${thumbDataUri}" alt="Arte" class="ap-img" />`
    : thumbUrl
      ? /\.pdf$/i.test(thumbUrl)
        ? `<div class="ap-noimg"><div class="ap-noimg-ic">PDF</div><div class="ap-noimg-sub">Arquivo PDF vinculado</div></div>`
        // A URL é de imagem, mas o prefetch falhou (403/404/offline) — dizer
        // "PDF vinculado" aqui mentia sobre o que aconteceu.
        : `<div class="ap-noimg"><div class="ap-noimg-ic">!</div><div class="ap-noimg-sub">Falha ao carregar imagem</div></div>`
      : `<div class="ap-noimg"><div class="ap-noimg-ic">—</div><div class="ap-noimg-sub">Sem arte enviada</div></div>`;
  return `
        <div class="page ap-page">
          <div class="ap-stage">${art}</div>
          <div class="ap-caption">${title}</div>
        </div>`;
}

/** Várias artes do mesmo grupo na mesma página. */
function buildGroupPage(chunk: Chunk, thumbDataUris: Record<string, string>): string {
  const cols = chunk.items.length <= 2 ? chunk.items.length : chunk.items.length <= 6 ? 2 : 3;
  const cards = chunk.items.map(item => {
    const thumbUrl = item.approvalThumbUrl || "";
    const thumbDataUri = thumbDataUris[thumbUrl] || null;
    const inner = thumbDataUri
      ? `<img src="${thumbDataUri}" alt="Arte" class="ap-g-img" />`
      : thumbUrl
        ? `<div class="ap-g-noimg">PDF</div>`
        : `<div class="ap-g-noimg">—</div>`;
    return `
          <div class="ap-g-card">
            <div class="ap-g-frame">${inner}</div>
            <div class="ap-g-cap">${escapeHtml(item.description || item.type || "Sem nome")}</div>
          </div>`;
  }).join("");
  const partLabel = chunk.parts > 1 ? ` (${chunk.part}/${chunk.parts})` : "";
  return `
        <div class="page ap-page">
          <div class="ap-grouptitle">${escapeHtml(chunk.group)}${partLabel}</div>
          <div class="ap-grid" style="grid-template-columns: repeat(${cols}, 1fr)">${cards}</div>
        </div>`;
}

/** Capa: apenas o nome do evento, layout centrado. */
function buildCoverPage(name: string): string {
  return `
        <div class="page ap-cover">
          <div class="ap-cover-inner">
            <span class="ap-cover-rule"></span>
            <span class="ap-cover-event">${escapeHtml(name)}</span>
          </div>
        </div>`;
}

const PDF_STYLES = `
        @page { size: A4 landscape; margin: 0; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'DM Sans', 'Helvetica Neue', Arial, sans-serif; background: #fff; color: #0f172a; -webkit-print-color-adjust: exact; print-color-adjust: exact; }

        .page { width: 100vw; min-height: 100vh; display: flex; flex-direction: column; break-after: page; page-break-after: always; background: #ffffff; overflow: hidden; }
        .page:last-child { break-after: avoid; page-break-after: avoid; }
        @media print { .page { width: 297mm; height: 210mm; min-height: 210mm; } }

        .ap-page { padding: 26px 34px; }
        .ap-stage { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; overflow: hidden; }
        .ap-img { max-width: 100%; max-height: 100%; object-fit: contain; display: block; }
        .ap-noimg { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; }
        .ap-noimg-ic { font-size: 34px; font-weight: 800; color: #cbd5e1; font-family: 'DM Mono', monospace; }
        .ap-noimg-sub { font-size: 12px; color: #94a3b8; }
        .ap-caption { flex-shrink: 0; text-align: center; padding-top: 14px; font-family: 'DM Sans', Arial, sans-serif; font-size: 13pt; font-weight: 600; color: #1c1917; }

        .ap-grouptitle { flex-shrink: 0; text-align: center; font-family: 'Space Grotesk', sans-serif; font-size: 20px; font-weight: 700; letter-spacing: -0.01em; color: #1c1917; padding: 2px 4px 16px; }
        .ap-grid { flex: 1; min-height: 0; display: grid; gap: 18px; grid-auto-rows: 1fr; }
        .ap-g-card { min-height: 0; display: flex; flex-direction: column; }
        .ap-g-frame { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; overflow: hidden; }
        .ap-g-img { max-width: 100%; max-height: 100%; object-fit: contain; display: block; }
        .ap-g-noimg { font-size: 22px; font-weight: 800; color: #cbd5e1; font-family: 'DM Mono', monospace; }
        .ap-g-cap { flex-shrink: 0; text-align: center; padding-top: 8px; font-size: 13px; font-weight: 600; color: #1c1917; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

        .ap-cover { align-items: center; justify-content: center; padding: 64px; background: #1c1917; }
        .ap-cover-inner { display: flex; flex-direction: column; align-items: center; gap: 26px; max-width: 82%; }
        .ap-cover-rule { width: 56px; height: 4px; border-radius: 4px; background: #f97316; }
        .ap-cover-event { font-family: 'Space Grotesk', sans-serif; font-size: 58px; font-weight: 800; letter-spacing: -0.035em; line-height: 1.06; color: #ffffff; text-align: center; }`;

function writePdfDoc(win: Window, title: string, pages: string) {
  win.document.write(`<!DOCTYPE html><html lang="pt-BR"><head>
      <meta charset="UTF-8"/>
      <title>${escapeHtml(title)}</title>
      <link rel="preconnect" href="https://fonts.googleapis.com"/>
      <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700;800&family=DM+Sans:wght@400;500;600&family=DM+Mono:wght@500;700&display=swap" rel="stylesheet"/>
      <style>${PDF_STYLES}</style>
    </head><body>${pages}<script>
      window.addEventListener("load", function () {
        var fontsReady = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();
        fontsReady.then(function () { setTimeout(function () { window.print(); }, 100); });
      });
    </scr` + `ipt></body></html>`);
  win.document.close();
}

/**
 * Exporta o PDF no layout book. Grupos em `combinedGroups` saem com várias
 * peças por página; o restante, uma peça por página. `groupByEvent` adiciona
 * uma capa divisória por evento quando há mais de um.
 */
export async function exportMixedToPDF(
  items: any[],
  combinedGroups: Set<string>,
  title = "Peças",
  groupByEvent = false,
): Promise<void> {
  if (items.length === 0) {
    toast({ title: "Nenhum item para exportar", variant: "destructive" });
    return;
  }
  const win = window.open("", "_blank");
  if (!win) {
    toast({ title: "Pop-up bloqueado", description: "Permita pop-ups para este site e tente novamente", variant: "destructive" });
    return;
  }
  win.document.write(`<p style="font-family:sans-serif;color:#64748b;padding:24px">Preparando exportação…</p>`);

  const thumbCount = items.filter(i => i.approvalThumbUrl && !/\.pdf$/i.test(i.approvalThumbUrl)).length;
  if (thumbCount > 0) {
    toast({ title: `Preparando ${thumbCount} image${thumbCount !== 1 ? "ns" : "m"}…`, description: "Aguarde um momento" });
  }
  const thumbDataUris = await prefetchThumbsAsDataUris(items);
  // O usuário pode ter fechado a janela durante o prefetch — escrever num
  // documento de janela fechada lança exceção.
  if (win.closed) return;
  win.document.open();

  // Separa por evento primeiro para não misturar peças de eventos diferentes
  // com o mesmo grupo na mesma página.
  const eventsMap = new Map<string, { name: string; items: any[] }>();
  items.forEach(item => {
    const key = item.eventId || "__sem_evento__";
    if (!eventsMap.has(key)) eventsMap.set(key, { name: item.event?.name || "Sem evento", items: [] });
    eventsMap.get(key)!.items.push(item);
  });
  const eventEntries = Array.from(eventsMap.values());

  type Page =
    | { kind: "cover"; name: string }
    | { kind: "group"; chunk: Chunk }
    | { kind: "item"; item: any };
  const sequence: Page[] = [];

  const multiEvent = eventEntries.length > 1;
  if (!(multiEvent && groupByEvent)) {
    sequence.push({ kind: "cover", name: multiEvent ? title : eventEntries[0].name });
  }

  eventEntries.forEach(ev => {
    if (multiEvent && groupByEvent) {
      sequence.push({ kind: "cover", name: ev.name });
    }
    const groupsMap = new Map<string, any[]>();
    ev.items.forEach(item => {
      const key = groupKeyOf(item);
      if (!groupsMap.has(key)) groupsMap.set(key, []);
      groupsMap.get(key)!.push(item);
    });
    Array.from(groupsMap.entries()).forEach(([group, groupItems]) => {
      if (combinedGroups.has(group)) {
        chunkGroup(group, groupItems).forEach(chunk => sequence.push({ kind: "group", chunk }));
      } else {
        groupItems.forEach(item => sequence.push({ kind: "item", item }));
      }
    });
  });

  const pages = sequence.map(p => {
    if (p.kind === "cover") return buildCoverPage(p.name);
    return p.kind === "group" ? buildGroupPage(p.chunk, thumbDataUris) : buildItemPage(p.item, thumbDataUris);
  }).join("");

  writePdfDoc(win, title, pages);
}
