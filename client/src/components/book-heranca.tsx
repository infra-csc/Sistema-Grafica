// ─────────────────────────────────────────────────────────────────────────────
// HERANÇA DO BOOK ATUAL — escolher o que o book gerado copia do book subido.
//
// Os books que a Arte já subiu SÃO o template (decisão do dono, 25/08): a
// capa com o logo vetorial e as páginas de render montado (palco, pórtico,
// estande) vivem lá, e o pdf-lib as copia INTEIRAS, sem rasterizar. Este
// componente mostra as páginas do book atual e deixa marcar: a capa (ligada
// por padrão) e as páginas prontas que entram antes das grades geradas.
//
// A mecânica de miniaturas (pdf.js por import dinâmico, worker do bundle,
// carga por URL com requisição de faixa, fila SERIAL de render sob demanda)
// vem do BookPagePicker, onde ela foi medida: ~3s por página de book real —
// disparar tudo junto prendia o usuário num spinner de minutos.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from "react";
import { BookOpen, Check, Loader2 } from "lucide-react";
import { convertGCSUrlToLocalPath } from "@/lib/artePdfExport";

const THUMB_W = 132;
const RATIO = 595 / 842; // A4 paisagem — reserva o espaço antes da miniatura

interface Props {
  bookUrl: string;
  capa: boolean;
  onCapaChange: (v: boolean) => void;
  paginas: Set<number>;
  onTogglePagina: (n: number) => void;
}

export function BookHeranca({ bookUrl, capa, onCapaChange, paginas, onTogglePagina }: Props) {
  const [numPages, setNumPages] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [thumbs, setThumbs] = useState<Record<number, string>>({});
  const docRef = useRef<any>(null);
  const queueRef = useRef<number[]>([]);
  const busyRef = useRef(false);
  const genRef = useRef(0);

  useEffect(() => {
    const gen = ++genRef.current;
    setNumPages(0); setErro(null); setThumbs({});
    docRef.current = null; queueRef.current = []; busyRef.current = false;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
        const doc = await pdfjs.getDocument({ url: convertGCSUrlToLocalPath(bookUrl) }).promise;
        if (genRef.current !== gen) return;
        docRef.current = doc;
        setNumPages(doc.numPages);
      } catch (e: any) {
        if (genRef.current !== gen) return;
        setErro(e?.message || "Não foi possível abrir o book atual.");
      }
    })();
  }, [bookUrl]);

  const pedirThumb = (n: number) => {
    if (thumbs[n] || queueRef.current.includes(n)) return;
    queueRef.current.push(n);
    bombear();
  };

  const bombear = async () => {
    if (busyRef.current) return;
    const doc = docRef.current;
    if (!doc) return;
    const n = queueRef.current.shift();
    if (n == null) return;
    busyRef.current = true;
    const gen = genRef.current;
    try {
      const page = await doc.getPage(n);
      const vp1 = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: THUMB_W / vp1.width });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(vp.width);
      canvas.height = Math.ceil(vp.height);
      await page.render({ canvasContext: canvas.getContext("2d")!, viewport: vp }).promise;
      if (genRef.current === gen) setThumbs((prev) => ({ ...prev, [n]: canvas.toDataURL("image/jpeg", 0.7) }));
    } catch {
      // miniatura que falhou fica cinza — a página ainda é selecionável pelo número
    } finally {
      busyRef.current = false;
      if (genRef.current === gen && queueRef.current.length) void bombear();
    }
  };

  if (erro) {
    return <p style={{ margin: 0, fontSize: 12.5, color: "#b45309" }}>Book atual não abriu ({erro}) — o gerado sai sem herança.</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }} data-testid="book-heranca">
      <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, color: "#1c1917", cursor: "pointer" }}>
        <input type="checkbox" checked={capa} onChange={(e) => onCapaChange(e.target.checked)} data-testid="check-capa-herdada" style={{ width: 16, height: 16, accentColor: "#c2410c" }} />
        Usar a capa do book atual (o logo de verdade)
      </label>
      <p style={{ margin: 0, fontSize: 12, color: "#78716c", lineHeight: 1.5 }}>
        Marque as páginas prontas (renders de palco, pórtico, estande…) para entrarem <strong>copiadas do original</strong>, sem perda — elas vêm antes das grades geradas. Desmarque os grupos que elas já cobrem.
      </p>
      {numPages === 0 ? (
        <p style={{ margin: 0, fontSize: 12.5, color: "#78716c", display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Loader2 className="animate-spin" style={{ width: 13, height: 13 }} /> Abrindo o book atual…
        </p>
      ) : (
        <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 6 }}>
          {Array.from({ length: numPages }, (_, i) => i + 1).map((n) => {
            const ehCapa = n === 1;
            const marcada = ehCapa ? capa : paginas.has(n);
            return (
              <button
                key={n}
                type="button"
                onClick={() => (ehCapa ? onCapaChange(!capa) : onTogglePagina(n))}
                aria-pressed={marcada}
                data-testid={`heranca-pag-${n}`}
                ref={(el) => { if (el) pedirThumb(n); }}
                title={ehCapa ? "Página 1 — a capa" : `Incluir a página ${n} pronta, copiada do original`}
                style={{
                  position: "relative", flexShrink: 0, width: THUMB_W, height: Math.round(THUMB_W * RATIO) + 20,
                  padding: 0, borderRadius: 8, overflow: "hidden", cursor: "pointer",
                  border: marcada ? "2px solid #c2410c" : "1px solid #e7e5e4",
                  backgroundColor: "#fff",
                }}
              >
                {thumbs[n]
                  ? <img src={thumbs[n]} alt={`Página ${n}`} style={{ width: "100%", height: Math.round(THUMB_W * RATIO), objectFit: "cover", display: "block" }} />
                  : <span style={{ display: "flex", width: "100%", height: Math.round(THUMB_W * RATIO), alignItems: "center", justifyContent: "center", backgroundColor: "#f5f5f4", color: "#a8a29e" }}><BookOpen style={{ width: 16, height: 16 }} /></span>}
                <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, height: 20, fontSize: 10.5, fontWeight: 700, color: marcada ? "#c2410c" : "#78716c" }}>
                  {marcada && <Check style={{ width: 11, height: 11 }} />}
                  {ehCapa ? "capa" : `pág. ${n}`}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
