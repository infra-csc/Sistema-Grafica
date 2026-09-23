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
import type { PDFDocumentProxy } from "pdfjs-dist";
import { BookOpen, Check, Loader2 } from "lucide-react";
import { convertGCSUrlToLocalPath } from "@/lib/artePdfExport";
import { TOM, T, N, FS, FW, R } from "@/lib/theme";

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
  const docRef = useRef<PDFDocumentProxy | null>(null);
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
        // Chegou depois de trocar de book/desmontar: ninguém vai usar — solta já.
        if (genRef.current !== gen) { void doc.loadingTask?.destroy(); return; }
        docRef.current = doc;
        setNumPages(doc.numPages);
      } catch (e) {
        if (genRef.current !== gen) return;
        setErro((e instanceof Error && e.message) || "Não foi possível abrir o book atual.");
      }
    })();
    return () => {
      // Invalida trabalho em voo e solta o documento do pdf.js (PDF parseado
      // e páginas no worker, MBs por book) ao trocar de book ou sair da tela —
      // antes ele ficava vivo até o F5.
      genRef.current++;
      const doc = docRef.current;
      docRef.current = null;
      void doc?.loadingTask?.destroy();
    };
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
      await page.render({ canvas, canvasContext: canvas.getContext("2d")!, viewport: vp }).promise;
      if (genRef.current === gen) setThumbs((prev) => ({ ...prev, [n]: canvas.toDataURL("image/jpeg", 0.7) }));
    } catch {
      // miniatura que falhou fica cinza — a página ainda é selecionável pelo número
    } finally {
      busyRef.current = false;
      if (genRef.current === gen && queueRef.current.length) void bombear();
    }
  };

  // O que vai ser herdado, em uma frase — a escolha é feita numa fileira que
  // rola de lado, e com 20 páginas as marcadas somem da vista. Conta só as
  // páginas prontas (a 1 é a capa e tem controle próprio).
  const prontas = Array.from(paginas).filter((n) => n !== 1).length;
  const resumo = [capa ? "a capa" : null, prontas > 0 ? `${prontas} ${prontas === 1 ? "página pronta" : "páginas prontas"}` : null]
    .filter(Boolean).join(" e ");

  if (erro) {
    // Caixa de aviso, não uma linha âmbar solta: é a notícia de que o book vai
    // sair SEM a capa verdadeira — precisa ser vista antes de publicar.
    return (
      <p role="status" style={{ margin: 0, padding: "10px 12px", borderRadius: R.md, fontSize: FS.body, color: TOM.alerta.text, backgroundColor: TOM.alerta.bg, border: `1px solid ${TOM.alerta.border}`, lineHeight: 1.5 }}>
        <strong>O book atual não abriu</strong> ({erro}). O gerado sai sem herança — capa com o nome do evento e só as grades.
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }} data-testid="book-heranca">
      {/* minHeight 36: a caixa de 16px e o texto formam UM alvo de toque. */}
      <label style={{ display: "inline-flex", alignItems: "center", gap: 8, minHeight: 36, fontSize: FS.body, fontWeight: FW.medio, color: T.text, cursor: "pointer", alignSelf: "flex-start" }}>
        <input type="checkbox" checked={capa} onChange={(e) => onCapaChange(e.target.checked)} data-testid="check-capa-herdada" style={{ width: 16, height: 16, accentColor: T.accentText }} />
        Usar a capa do book atual (o logo de verdade)
      </label>
      <p style={{ margin: 0, fontSize: FS.meta, color: T.second, lineHeight: 1.5 }}>
        Marque as páginas prontas (renders de palco, pórtico, estande…) para entrarem <strong>copiadas do original</strong>, sem perda — elas vêm antes das grades geradas. Desmarque os grupos que elas já cobrem.
      </p>
      <p aria-live="polite" data-testid="heranca-resumo" style={{ margin: 0, fontSize: FS.meta, fontWeight: FW.medio, color: resumo ? T.text : T.second }}>
        {resumo ? `Entra no começo do book: ${resumo}.` : "Nada herdado — o book sai só com as grades geradas."}
      </p>
      {numPages === 0 ? (
        <p style={{ margin: 0, fontSize: FS.meta, color: T.second, display: "inline-flex", alignItems: "center", gap: 6 }}>
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
                // Nome por extenso para o leitor de tela: o texto visível é
                // "pág. 3", e a imagem virou decorativa (alt vazio) para não
                // anunciar "Página 3" duas vezes.
                aria-label={ehCapa ? "Capa do book atual (página 1)" : `Página ${n} do book atual, copiada do original`}
                data-testid={`heranca-pag-${n}`}
                ref={(el) => { if (el) pedirThumb(n); }}
                title={ehCapa ? "Página 1 — a capa" : `Incluir a página ${n} pronta, copiada do original`}
                style={{
                  position: "relative", flexShrink: 0, width: THUMB_W, height: Math.round(THUMB_W * RATIO) + 22,
                  padding: 0, borderRadius: R.md, overflow: "hidden", cursor: "pointer",
                  // Borda de 2px nos DOIS estados (cor muda, espessura não): com
                  // 1px desmarcado e 2px marcado a miniatura "pulava" 1px ao clicar.
                  border: marcada ? `2px solid ${T.accentText}` : `2px solid ${T.border}`,
                  backgroundColor: marcada ? TOM.laranja.bg : T.surface,
                }}
              >
                {thumbs[n]
                  ? <img src={thumbs[n]} alt="" loading="lazy" decoding="async" style={{ width: "100%", height: Math.round(THUMB_W * RATIO), objectFit: "cover", display: "block" }} />
                  : <span style={{ display: "flex", width: "100%", height: Math.round(THUMB_W * RATIO), alignItems: "center", justifyContent: "center", backgroundColor: N.n2, color: T.second }}><BookOpen aria-hidden="true" style={{ width: 16, height: 16 }} /></span>}
                <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, height: 22, fontSize: FS.small, fontWeight: FW.forte, color: marcada ? T.accentText : T.second }}>
                  {marcada && <Check aria-hidden="true" style={{ width: 11, height: 11 }} />}
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
