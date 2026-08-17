// Seletor de páginas do book.
//
// O book é um PDF único do evento (dezenas de páginas) e a peça guarda só a
// URL desse arquivo — não existe registro de qual página cobre qual peça. Por
// isso "Abrir book" sempre devolvia o arquivo inteiro, mesmo com filtro de
// patrocinador aplicado.
//
// Aqui o usuário vê as páginas, marca as que quer e baixa um PDF novo só com
// elas. O recorte acontece no navegador (pdf-lib copia as páginas originais,
// sem rasterizar), então a qualidade é idêntica à do book.
//
// Renderização sob demanda: medido no navegador, uma página deste book leva
// ~3s para rasterizar (são artes full-bleed num PDF de 4,7 MB). Renderizar as
// 22 de uma vez, como a primeira versão fazia, prendia o usuário mais de um
// minuto num spinner — parecia que "não abria". Agora a grade aparece na hora,
// já selecionável pelo número da página, e cada miniatura é desenhada quando
// entra na tela.
//
// As duas bibliotecas entram por import dinâmico: são pesadas e só fazem
// sentido quando este modal abre, então não pesam no bundle das telas.
import { useState, useEffect, useRef, useCallback } from "react";
import { X, Download, BookOpen, Loader2, AlertCircle, FileText } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { FilterSelect } from "@/components/filter-select";
import { HIDE_NATIVE_CLOSE } from "@/components/modal-shell";
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

const THUMB_WIDTH = 240;
/** Proporção usada nos espaços reservados até a miniatura existir. Books saem
 *  em A4 paisagem; um número fixo evita a grade "pulando" ao carregar. */
const PLACEHOLDER_RATIO = 595 / 842;

export function BookPagePicker({ open, onOpenChange, books, fileName = "book" }: BookPagePickerProps) {
  // Sem filtro a seleção cobre dezenas de eventos, cada um com seu book. Manter
  // a escolha aqui — e não como um botão por book no modal de exportação —
  // evita um rodapé de oito botões empurrando o painel de opções para fora.
  const [bookUrl, setBookUrl] = useState(books[0]?.url ?? "");
  const activeBook = books.find(b => b.url === bookUrl) ?? books[0];

  const [opening, setOpening]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [thumbs, setThumbs]     = useState<Record<number, string>>({});
  const [picked, setPicked]     = useState<Set<number>>(new Set());
  const [extracting, setExtracting] = useState(false);

  // O ArrayBuffer fica guardado para o recorte não precisar baixar de novo — o
  // download deste book leva ~3s.
  const bytesRef = useRef<ArrayBuffer | null>(null);
  const docRef   = useRef<any>(null);
  // Fila serial: o pdf.js tem um worker só, disparar 22 renders juntos apenas
  // enfileira lá dentro e ainda tira a ordem de quem está na tela.
  const queueRef = useRef<number[]>([]);
  const busyRef  = useRef(false);
  // Invalida trabalho em voo quando o usuário troca de book ou fecha o modal.
  const genRef   = useRef(0);

  useEffect(() => {
    if (!open || !bookUrl) return;
    const gen = ++genRef.current;

    setOpening(true); setError(null); setNumPages(0);
    setThumbs({}); setPicked(new Set());
    bytesRef.current = null; docRef.current = null;
    queueRef.current = []; busyRef.current = false;

    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        // O worker do pdf.js precisa vir do próprio bundle: buscá-lo em CDN
        // quebraria em qualquer ambiente sem internet de saída.
        const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

        // Carrega por URL, não por bytes. Baixar os 4,7 MB inteiros antes de
        // abrir custava ~3s de tela parada; por URL o pdf.js usa requisição de
        // faixa (o servidor anuncia Accept-Ranges) e lê só o índice do PDF,
        // então a grade de páginas aparece quase de imediato. O arquivo
        // completo só é buscado se o usuário mandar recortar.
        const doc = await pdfjs.getDocument({ url: convertGCSUrlToLocalPath(bookUrl) }).promise;
        if (genRef.current !== gen) return;

        docRef.current = doc;
        setNumPages(doc.numPages);
        setOpening(false);
        if (doc.numPages === 0) setError("O book não tem páginas.");
      } catch (e: any) {
        if (genRef.current !== gen) return;
        setError(e?.message || "Falha ao abrir o book.");
        setOpening(false);
      }
    })();

    return () => { genRef.current++; };
  }, [open, bookUrl]);

  const pump = useCallback(async () => {
    if (busyRef.current) return;
    const n = queueRef.current.shift();
    if (n === undefined || !docRef.current) return;
    busyRef.current = true;
    const gen = genRef.current;
    try {
      const page = await docRef.current.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: THUMB_WIDTH / base.width });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext("2d")!;
      await page.render({ canvas, canvasContext: ctx, viewport } as any).promise;
      if (genRef.current === gen) {
        const src = canvas.toDataURL("image/jpeg", 0.72);
        setThumbs(prev => ({ ...prev, [n]: src }));
      }
    } catch {
      // Uma página que falha não pode travar a fila: ela simplesmente fica sem
      // miniatura e continua selecionável pelo número.
    } finally {
      busyRef.current = false;
      if (genRef.current === gen) void pump();
    }
  }, []);

  const requestThumb = useCallback((n: number) => {
    if (thumbs[n] || queueRef.current.includes(n)) return;
    queueRef.current.push(n);
    void pump();
  }, [thumbs, pump]);

  const toggle = (n: number) =>
    setPicked(prev => { const s = new Set(prev); if (s.has(n)) s.delete(n); else s.add(n); return s; });

  const extract = async () => {
    if (picked.size === 0) return;
    setExtracting(true);
    try {
      // O arquivo completo só é necessário aqui — o pdf-lib precisa dele
      // inteiro para copiar páginas. Buscar agora, e não na abertura, é o que
      // permite a grade aparecer de imediato; e como o servidor manda
      // Cache-Control, normalmente já veio do cache do navegador.
      if (!bytesRef.current) {
        const res = await fetch(convertGCSUrlToLocalPath(bookUrl));
        if (!res.ok) throw new Error(`Não foi possível baixar o book (HTTP ${res.status}).`);
        bytesRef.current = await res.arrayBuffer();
      }

      const { PDFDocument } = await import("pdf-lib");
      const src = await PDFDocument.load(bytesRef.current.slice(0));
      const out = await PDFDocument.create();
      const indexes = Array.from(picked).sort((a, b) => a - b);
      const copied = await out.copyPages(src, indexes);
      copied.forEach(p => out.addPage(p));
      const blob = new Blob([await out.save()], { type: "application/pdf" });

      // O nome do evento identifica o book melhor que o título genérico da tela,
      // e "/" ou ":" quebram o nome do arquivo em parte dos navegadores.
      const safeName = (activeBook?.label || fileName || "book").replace(/[\\/:*?"<>|]/g, "-").trim() || "book";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
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

  const pages = Array.from({ length: numPages }, (_, i) => i);
  const renderedCount = Object.keys(thumbs).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={`max-w-none p-0 gap-0 ${HIDE_NATIVE_CLOSE}`}
        // ALTURA: cabeçalho 86 + barra de controle 57 + grade de páginas
        // `height: min(520px, 52vh)` + rodapé 117, e NENHUM teto no Content.
        // Numa janela de 445 os 52vh davam 231 e o total ia a 491px contra 397
        // disponíveis: o Radix cortava 47px em cima e 47 embaixo ao mesmo tempo
        // — sumiam o título e o botão de baixar juntos, com o `overflow:
        // hidden` daqui impedindo qualquer rolagem. O 52vh era um desconto
        // chutado: ele encolhe a grade, não o modal.
        // A CONTA certa é `100vh − 48` (24px de respiro em cima e 24 embaixo,
        // simétrico porque o Radix centra) com coluna flex — cabeçalho, barra e
        // rodapé não encolhem e a grade fica com o que sobrar.
        style={{ width: "min(1040px, 94vw)", borderRadius: 16, overflow: "hidden", border: "none", boxShadow: "0 32px 64px -16px rgba(0,0,0,0.28), 0 0 0 1px rgba(0,0,0,0.05)", maxHeight: "calc(100vh - 48px)", display: "flex", flexDirection: "column" }}>
        <DialogTitle className="sr-only">Extrair páginas do book</DialogTitle>
        <DialogDescription className="sr-only">Escolha as páginas do book e baixe um PDF apenas com elas</DialogDescription>

        {/* ══ Cabeçalho ═══════════════════════════════════════════════════ */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "22px 32px", background: "linear-gradient(135deg, #1c1917 0%, #2d2926 100%)", borderBottom: "1px solid rgba(255,255,255,0.06)", flexShrink: 0 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: "#6d28d9", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "0 0 0 1px rgba(255,255,255,0.12) inset" }}>
            <BookOpen style={{ width: 18, height: 18, color: "#fff" }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.03em", color: "#fff", margin: 0, lineHeight: 1.2 }}>
              Escolher páginas do book
            </h2>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.72)", margin: "3px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {activeBook ? `${activeBook.label} · ` : ""}marque as páginas e baixe um PDF só com elas
            </p>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            aria-label="Fechar"
            style={{ width: 40, height: 40, borderRadius: "50%", backgroundColor: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.7)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>

        {/* ══ Barra de controle ═══════════════════════════════════════════ */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 32px", borderBottom: "1px solid #ebe8e4", backgroundColor: "#fafaf9", flexWrap: "wrap", flexShrink: 0 }}>
          {/* kind="field": escolhe QUAL book está sendo folheado — preenche o
              escopo da tela, não recorta uma lista (vocabulário em
              components/filter-select.tsx). A contagem de peças, que antes era
              texto colado no rótulo da opção ("Book A — 12 peças"), passa a ser
              o selo numérico padrão: mesma informação, no lugar em que ela
              aparece em todo menu do app. `hideSearch` porque são poucos books. */}
          {books.length > 1 && (
            <FilterSelect
              kind="field" hideSearch hideWhenEmpty={false}
              label="Book"
              value={bookUrl}
              onChange={setBookUrl}
              options={books.map(b => ({ value: b.url, label: b.label, count: b.count, pinned: true }))}
              panelWidth={280}
              testId="select-book"
              triggerStyle={{ height: 34, maxWidth: 300, borderRadius: 8, border: "1px solid #e4e0db", padding: "0 8px 0 10px", fontSize: 12, fontWeight: 600, color: "#1c1917", backgroundColor: "#fff" }}
            />
          )}

          <span style={{ fontSize: 13, fontWeight: 700, color: "#1c1917" }} data-testid="text-book-page-count">
            {picked.size} <span style={{ fontWeight: 400, color: "#746e69" }}>de {numPages} {numPages === 1 ? "página" : "páginas"}</span>
          </span>

          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button
              onClick={() => setPicked(new Set(pages))}
              disabled={numPages === 0 || picked.size === numPages}
              style={{ background: "none", border: "none", padding: 0, fontSize: 12, fontWeight: 700, color: numPages === 0 || picked.size === numPages ? "#c4c0ba" : "#6d28d9", cursor: numPages === 0 || picked.size === numPages ? "default" : "pointer" }}>
              Selecionar todas
            </button>
            <span style={{ color: "#e4e0db" }}>·</span>
            <button
              onClick={() => setPicked(new Set())}
              disabled={picked.size === 0}
              style={{ background: "none", border: "none", padding: 0, fontSize: 12, fontWeight: 700, color: picked.size === 0 ? "#c4c0ba" : "#6d28d9", cursor: picked.size === 0 ? "default" : "pointer" }}>
              Limpar
            </button>
          </div>

          {numPages > 0 && renderedCount < numPages && (
            <span style={{ marginLeft: "auto", fontSize: 11, color: "#746e69", display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Loader2 style={{ width: 11, height: 11 }} className="animate-spin" />
              {renderedCount} de {numPages} pré-visualizadas
            </span>
          )}
        </div>

        {/* ══ Páginas ═════════════════════════════════════════════════════
            min(520px, 52vh): com altura fixa o modal inteiro estourava a tela em
            notebook baixo, deixando o botão de baixar fora do alcance. */}
        {/* Os 520 continuam sendo o teto de DESENHO da grade; o 52vh saiu
            porque quem limita agora é o teto do Content. `flex: 0 1 auto` +
            `minHeight: 0` derruba o piso automático do item flex e deixa a
            grade encolher abaixo dos 520 numa janela baixa. */}
        <div style={{ maxHeight: 520, overflowY: "auto", padding: 32, backgroundColor: "#fff", flex: "0 1 auto", minHeight: 0 }}>
          {error && (
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: 16, borderRadius: 10, backgroundColor: "#fef2f2", border: "1px solid #fecaca" }}>
              <AlertCircle style={{ width: 16, height: 16, color: "#b91c1c", flexShrink: 0, marginTop: 1 }} />
              <div>
                <p style={{ fontSize: 13, fontWeight: 700, color: "#991b1b", margin: "0 0 4px" }}>Não foi possível abrir o book</p>
                <p style={{ fontSize: 12, color: "#b91c1c", margin: 0, lineHeight: 1.5 }}>{error}</p>
              </div>
            </div>
          )}

          {opening && !error && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: "80px 0" }}>
              <Loader2 style={{ width: 26, height: 26, color: "#6d28d9" }} className="animate-spin" />
              <p style={{ fontSize: 13, color: "#57534e", margin: 0 }}>Abrindo o book…</p>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 16 }}>
            {pages.map(i => (
              <PageTile
                key={i}
                index={i}
                src={thumbs[i]}
                picked={picked.has(i)}
                onToggle={() => toggle(i)}
                onVisible={() => requestThumb(i)}
              />
            ))}
          </div>
        </div>

        {/* ══ Rodapé ══════════════════════════════════════════════════════ */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "16px 32px", borderTop: "1px solid #ebe8e4", backgroundColor: "#fff", flexShrink: 0 }}>
          <button
            onClick={extract}
            disabled={picked.size === 0 || extracting}
            data-testid="button-extract-book-pages"
            style={{
              width: "100%", height: 46, borderRadius: 10, border: "none",
              backgroundColor: picked.size === 0 || extracting ? "#e7e5e4" : "#6d28d9",
              color: picked.size === 0 || extracting ? "#57534e" : "#fff",
              cursor: picked.size === 0 || extracting ? "not-allowed" : "pointer",
              fontSize: 13, fontWeight: 800, letterSpacing: "-0.01em",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              boxShadow: picked.size > 0 && !extracting ? "0 2px 8px rgba(109,40,217,0.28)" : "none",
            }}>
            {extracting
              ? <><Loader2 style={{ width: 15, height: 15 }} className="animate-spin" /> Recortando…</>
              : <><Download style={{ width: 15, height: 15 }} /> {picked.size > 0 ? `Baixar ${picked.size} ${picked.size === 1 ? "página" : "páginas"}` : "Baixar páginas"}</>}
          </button>
          <button
            onClick={() => onOpenChange(false)}
            style={{ width: "100%", height: 36, borderRadius: 8, background: "none", border: "none", color: "#746e69", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
            Cancelar
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Miniatura de uma página. Pede o desenho só quando entra na tela. */
function PageTile({ index, src, picked, onToggle, onVisible }: {
  index: number; src?: string; picked: boolean;
  onToggle: () => void; onVisible: () => void;
}) {
  const ref = useRef<HTMLButtonElement | null>(null);
  const askedRef = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || src || askedRef.current) return;
    // rootMargin adianta o desenho das próximas linhas: com ~3s por página,
    // esperar a miniatura entrar exatamente na área visível chegaria tarde.
    const io = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting) && !askedRef.current) {
        askedRef.current = true;
        onVisible();
        io.disconnect();
      }
    }, { rootMargin: "600px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [src, onVisible]);

  return (
    <button
      ref={ref}
      onClick={onToggle}
      data-testid={`button-book-page-${index + 1}`}
      aria-pressed={picked}
      aria-label={`Página ${index + 1}`}
      style={{
        display: "block", width: "100%", textAlign: "left", padding: 8, cursor: "pointer",
        borderRadius: 12,
        border: `1px solid ${picked ? "#6d28d9" : "#ebe8e4"}`,
        boxShadow: picked ? "0 0 0 1px #6d28d9 inset" : "none",
        backgroundColor: picked ? "#f5f3ff" : "#fff",
        transition: "border-color 0.12s, background-color 0.12s",
      }}>
      <div style={{ position: "relative", borderRadius: 8, overflow: "hidden", border: "1px solid rgba(0,0,0,0.07)", backgroundColor: "#f5f5f4", aspectRatio: src ? undefined : String(1 / PLACEHOLDER_RATIO) }}>
        {src
          ? <img src={src} alt="" style={{ display: "block", width: "100%" }} />
          : (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <FileText style={{ width: 18, height: 18, color: "#d4d0ca" }} />
            </div>
          )}
        <div style={{
          position: "absolute", top: 8, left: 8, width: 22, height: 22, borderRadius: 6,
          display: "flex", alignItems: "center", justifyContent: "center",
          border: `2px solid ${picked ? "#6d28d9" : "#d4d0ca"}`,
          backgroundColor: picked ? "#6d28d9" : "rgba(255,255,255,0.92)",
          color: "#fff", fontSize: 12, fontWeight: 800, lineHeight: 1,
        }}>
          {picked ? "✓" : ""}
        </div>
      </div>
      <span style={{ display: "block", fontSize: 12, fontWeight: 700, color: picked ? "#5b21b6" : "#57534e", marginTop: 8 }}>
        Página {index + 1}
      </span>
    </button>
  );
}
