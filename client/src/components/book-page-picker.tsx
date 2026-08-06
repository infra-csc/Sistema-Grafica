// Seletor de páginas do book.
//
// O book é um PDF único do evento (dezenas de páginas) e a peça guarda só a
// URL desse arquivo — não existe registro de qual página cobre qual peça. Por
// isso "Abrir Book" sempre devolvia o arquivo inteiro, mesmo com filtro de
// patrocinador aplicado.
//
// Aqui o usuário vê as páginas renderizadas, marca as que quer e baixa um PDF
// novo só com elas. O recorte é feito no navegador (pdf-lib copia as páginas
// originais, sem rasterizar), então a qualidade é idêntica à do book.
//
// As duas bibliotecas entram por import dinâmico: são pesadas e só fazem
// sentido quando este modal abre, então não pesam no bundle das telas.
import { useState, useEffect, useRef } from "react";
import { X, Download, BookOpen, Loader2, AlertCircle } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { convertGCSUrlToLocalPath } from "@/lib/artePdfExport";
import { toast } from "@/hooks/use-toast";

export interface BookOption {
  url: string;
  /** Nome do evento a que o book pertence. */
  label: string;
  /** Quantas peças da seleção esse book cobre. */
  count: number;
}

interface BookPagePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Books presentes na seleção. Com mais de um, o usuário escolhe aqui dentro. */
  books: BookOption[];
  /** Nome sugerido para o arquivo recortado (sem extensão). */
  fileName?: string;
}

const THUMB_WIDTH = 260;

export function BookPagePicker({ open, onOpenChange, books, fileName = "book" }: BookPagePickerProps) {
  // Sem filtro a seleção cobre dezenas de eventos, cada um com seu book. Manter
  // a escolha aqui — e não como um botão por book no modal de exportação —
  // evita um rodapé de oito botões empurrando o painel de opções para fora.
  const [bookUrl, setBookUrl] = useState(books[0]?.url ?? "");
  const activeBook = books.find(b => b.url === bookUrl) ?? books[0];

  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [thumbs, setThumbs]     = useState<string[]>([]);
  const [picked, setPicked]     = useState<Set<number>>(new Set());
  const [extracting, setExtracting] = useState(false);
  // O ArrayBuffer do PDF fica guardado para o recorte não precisar baixar de novo.
  const bytesRef = useRef<ArrayBuffer | null>(null);

  useEffect(() => {
    if (!open || !bookUrl) return;
    let cancelled = false;

    setLoading(true); setError(null); setThumbs([]); setPicked(new Set());
    bytesRef.current = null;

    (async () => {
      try {
        const res = await fetch(convertGCSUrlToLocalPath(bookUrl));
        if (!res.ok) throw new Error(`Não foi possível baixar o book (HTTP ${res.status}).`);
        const bytes = await res.arrayBuffer();
        if (cancelled) return;
        bytesRef.current = bytes;

        const pdfjs = await import("pdfjs-dist");
        // O worker do pdf.js precisa vir do próprio bundle: buscá-lo em CDN
        // quebraria em qualquer ambiente sem internet de saída.
        const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

        // getDocument consome (detacha) o buffer que recebe, por isso a cópia —
        // sem ela o recorte depois encontraria um ArrayBuffer vazio.
        const doc = await pdfjs.getDocument({ data: bytes.slice(0) }).promise;
        if (cancelled) return;

        const rendered: string[] = [];
        for (let n = 1; n <= doc.numPages; n++) {
          const page = await doc.getPage(n);
          const base = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: THUMB_WIDTH / base.width });
          const canvas = document.createElement("canvas");
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          const ctx = canvas.getContext("2d")!;
          await page.render({ canvas, canvasContext: ctx, viewport } as any).promise;
          if (cancelled) return;
          rendered.push(canvas.toDataURL("image/jpeg", 0.72));
          // Publica a cada página: em book de 20+ páginas o usuário já começa a
          // escolher enquanto o resto renderiza, em vez de encarar um spinner.
          // `loading` só cai no fim do laço — é ele que sustenta o aviso de
          // "carregando o restante" enquanto as demais páginas aparecem.
          setThumbs([...rendered]);
        }
        if (doc.numPages === 0) setError("O book não tem páginas.");
        setLoading(false);
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message || "Falha ao abrir o book.");
        setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [open, bookUrl]);

  const toggle = (n: number) =>
    setPicked(prev => { const s = new Set(prev); if (s.has(n)) s.delete(n); else s.add(n); return s; });

  const extract = async () => {
    if (!bytesRef.current || picked.size === 0) return;
    setExtracting(true);
    try {
      const { PDFDocument } = await import("pdf-lib");
      const src = await PDFDocument.load(bytesRef.current.slice(0));
      const out = await PDFDocument.create();
      const indexes = Array.from(picked).sort((a, b) => a - b);
      const copied = await out.copyPages(src, indexes);
      copied.forEach(p => out.addPage(p));
      const blob = new Blob([await out.save()], { type: "application/pdf" });

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      // O título vem da tela que abriu o modal e pode conter "/" ou ":", que
      // quebram o nome do arquivo em parte dos navegadores.
      // O nome do evento identifica o book melhor que o título genérico da tela.
      const safeName = (activeBook?.label || fileName || "book").replace(/[\\/:*?"<>|]/g, "-").trim() || "book";
      a.download = `${safeName} — ${indexes.length} pág.pdf`;
      a.click();
      // Revogar na hora cancela o download em alguns navegadores.
      setTimeout(() => URL.revokeObjectURL(url), 30_000);

      toast({ title: "Páginas extraídas", description: `${indexes.length} página(s) do book baixadas.` });
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Não foi possível extrair", description: e?.message || "Erro ao recortar o book.", variant: "destructive" });
    } finally {
      setExtracting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-none"
        style={{ width: "min(1040px, 94vw)", padding: 0, borderRadius: 16, overflow: "hidden", border: "1px solid #ebe8e4", boxShadow: "0 24px 64px rgba(28,25,23,0.22)" }}>
        <DialogTitle className="sr-only">Extrair páginas do book</DialogTitle>
        <DialogDescription className="sr-only">Escolha as páginas do book e baixe um PDF apenas com elas</DialogDescription>

        {/* Cabeçalho */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "20px 24px", backgroundColor: "#1c1917" }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: "#7c3aed", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <BookOpen style={{ width: 18, height: 18, color: "#fff" }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: "#fff", margin: 0, letterSpacing: "-0.02em" }}>Extrair páginas do book</h2>
            <p style={{ fontSize: 13, color: "#a8a29e", margin: "2px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {activeBook ? `${activeBook.label} · ` : ""}Marque as páginas e baixe um PDF só com elas
            </p>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            aria-label="Fechar"
            style={{ width: 36, height: 36, borderRadius: 999, border: "none", background: "#44403c", color: "#e7e5e4", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>

        {/* Escolha do book — só quando a seleção cobre mais de um evento */}
        {books.length > 1 && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 24px", borderBottom: "1px solid #ebe8e4", backgroundColor: "#fff" }}>
            <label htmlFor="book-picker-select" style={{ fontSize: 12, fontWeight: 700, color: "#292524", flexShrink: 0 }}>Book</label>
            <select
              id="book-picker-select"
              value={bookUrl}
              onChange={e => setBookUrl(e.target.value)}
              data-testid="select-book"
              style={{ flex: 1, minWidth: 0, height: 36, borderRadius: 8, border: "1px solid #e4e0db", padding: "0 10px", fontSize: 13, color: "#1c1917", backgroundColor: "#fff", cursor: "pointer" }}>
              {books.map(b => (
                <option key={b.url} value={b.url}>
                  {b.label} — {b.count} {b.count === 1 ? "peça" : "peças"}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Barra de seleção */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 24px", borderBottom: "1px solid #ebe8e4", backgroundColor: "#fafaf9", flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#1c1917" }} data-testid="text-book-page-count">
            {picked.size} de {thumbs.length} {thumbs.length === 1 ? "página" : "páginas"}
          </span>
          <button
            onClick={() => setPicked(new Set(thumbs.map((_, i) => i)))}
            disabled={thumbs.length === 0}
            style={{ background: "none", border: "none", padding: 0, fontSize: 13, fontWeight: 700, color: "#6d28d9", cursor: thumbs.length ? "pointer" : "not-allowed" }}>
            Selecionar todas
          </button>
          <button
            onClick={() => setPicked(new Set())}
            disabled={picked.size === 0}
            style={{ background: "none", border: "none", padding: 0, fontSize: 13, fontWeight: 700, color: picked.size ? "#6d28d9" : "#a8a29e", cursor: picked.size ? "pointer" : "not-allowed" }}>
            Limpar
          </button>
          {loading && thumbs.length > 0 && (
            <span style={{ fontSize: 12, color: "#57534e", display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Loader2 style={{ width: 12, height: 12 }} className="animate-spin" /> carregando o restante…
            </span>
          )}
        </div>

        {/* Páginas */}
        {/* min(520px, 52vh): com altura fixa o modal inteiro (cabeçalho + barra
            + rodapé ≈ 700px) estourava a tela em notebook baixo e no celular,
            e o rodapé com o botão de baixar ficava fora do alcance. */}
        <div style={{ height: "min(520px, 52vh)", overflowY: "auto", padding: 24, backgroundColor: "#fff" }}>
          {error && (
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: 16, borderRadius: 10, backgroundColor: "#fef2f2", border: "1px solid #fecaca" }}>
              <AlertCircle style={{ width: 16, height: 16, color: "#b91c1c", flexShrink: 0, marginTop: 1 }} />
              <p style={{ fontSize: 13, color: "#991b1b", margin: 0, lineHeight: 1.5 }}>{error}</p>
            </div>
          )}

          {loading && thumbs.length === 0 && !error && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: "80px 0", color: "#78716c" }}>
              <Loader2 style={{ width: 26, height: 26, color: "#7c3aed" }} className="animate-spin" />
              <p style={{ fontSize: 13, margin: 0 }}>Abrindo o book…</p>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16 }}>
            {thumbs.map((src, i) => {
              const on = picked.has(i);
              return (
                <button
                  key={i}
                  onClick={() => toggle(i)}
                  data-testid={`button-book-page-${i + 1}`}
                  aria-pressed={on}
                  style={{
                    display: "block", width: "100%", textAlign: "left", padding: 8, cursor: "pointer",
                    borderRadius: 12,
                    border: `2px solid ${on ? "#7c3aed" : "#ebe8e4"}`,
                    backgroundColor: on ? "#f5f3ff" : "#fff",
                    transition: "border-color 0.12s, background-color 0.12s",
                  }}>
                  <div style={{ position: "relative", borderRadius: 8, overflow: "hidden", border: "1px solid rgba(0,0,0,0.07)", backgroundColor: "#f5f5f4" }}>
                    <img src={src} alt={`Página ${i + 1}`} style={{ display: "block", width: "100%" }} />
                    <div style={{
                      position: "absolute", top: 8, left: 8, width: 22, height: 22, borderRadius: 6,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      border: `2px solid ${on ? "#7c3aed" : "#d4d0ca"}`,
                      backgroundColor: on ? "#7c3aed" : "rgba(255,255,255,0.92)",
                      color: "#fff", fontSize: 11, fontWeight: 800,
                    }}>
                      {on ? "✓" : ""}
                    </div>
                  </div>
                  <span style={{ display: "block", fontSize: 12, fontWeight: 700, color: on ? "#5b21b6" : "#57534e", marginTop: 8 }}>
                    Página {i + 1}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Rodapé */}
        <div style={{ display: "flex", gap: 10, padding: "16px 24px", borderTop: "1px solid #ebe8e4", backgroundColor: "#fafaf9" }}>
          <button
            onClick={() => onOpenChange(false)}
            style={{ flex: 1, height: 42, borderRadius: 10, background: "#fff", border: "1px solid #e4e0db", color: "#78716c", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>
            Cancelar
          </button>
          <button
            onClick={extract}
            disabled={picked.size === 0 || extracting}
            data-testid="button-extract-book-pages"
            style={{
              flex: 2, height: 42, borderRadius: 10, border: "none",
              backgroundColor: picked.size === 0 || extracting ? "#e7e5e4" : "#6d28d9",
              color: picked.size === 0 || extracting ? "#57534e" : "#fff",
              cursor: picked.size === 0 || extracting ? "not-allowed" : "pointer",
              fontSize: 13, fontWeight: 800, letterSpacing: "-0.01em",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              boxShadow: picked.size > 0 && !extracting ? "0 2px 8px rgba(109,40,217,0.28)" : "none",
            }}>
            {extracting
              ? <><Loader2 style={{ width: 15, height: 15 }} className="animate-spin" /> Recortando…</>
              : <><Download style={{ width: 15, height: 15 }} /> Baixar {picked.size > 0 ? `${picked.size} ${picked.size === 1 ? "página" : "páginas"}` : "páginas"}</>}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
