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
import { X, Download, BookOpen, Loader2, AlertCircle, FileText, Scissors, Hash, Check, RefreshCw } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { FilterSelect } from "@/components/filter-select";
import { HIDE_NATIVE_CLOSE, ModalHeader, modalSurface } from "@/components/modal-shell";
import { convertGCSUrlToLocalPath } from "@/lib/artePdfExport";
import { toast } from "@/hooks/use-toast";

/**
 * Lê "1-4, 9, 12" e devolve os números de página que aquilo significa.
 *
 * Fora do componente e exportada porque é a única parte deste modal que dá
 * para provar sem um PDF na mão — e é onde o engano acontece: intervalo
 * invertido, número fora da faixa, vírgula sobrando.
 *
 * Número fora da faixa é ignorado em SILÊNCIO. Digitar 40 num book de 22 é
 * engano de quem digita, não pedido para cortar o resto — e um erro na cara
 * aqui interromperia uma marcação que estava quase certa.
 */
export function interpretarIntervalo(texto: string, totalPaginas: number): number[] {
  const fora: number[] = [];
  texto.split(",").forEach(parte => {
    const t = parte.trim();
    if (!t) return;
    const faixa = t.match(/^(\d+)\s*-\s*(\d+)$/);
    if (faixa) {
      const a = Math.min(Number(faixa[1]), Number(faixa[2]));
      const b = Math.max(Number(faixa[1]), Number(faixa[2]));
      for (let n = a; n <= b; n++) if (n >= 1 && n <= totalPaginas) fora.push(n);
    } else if (/^\d+$/.test(t)) {
      const n = Number(t);
      if (n >= 1 && n <= totalPaginas) fora.push(n);
    }
  });
  return fora;
}

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
  // MARCAR POR NÚMERO. Com 22 páginas, o gargalo real não é decidir quais
  // páginas levar — é ACHÁ-LAS na grade, rolando e conferindo miniatura por
  // miniatura. Quem tem o book aberto do lado já sabe que quer "1-4, 9".
  const [intervalo, setIntervalo] = useState("");
  // "Tentar de novo" no erro de abertura: entra nas dependências do efeito que
  // abre o PDF, então incrementar refaz a carga sem fechar o modal.
  const [tentativa, setTentativa] = useState(0);

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
  }, [open, bookUrl, tentativa]);

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

      // Diz o NOME do arquivo: é por ele que a pessoa procura na pasta de
      // downloads, e "N página(s) baixadas" não dizia onde nem como.
      toast({ title: indexes.length === 1 ? "Página extraída" : `${indexes.length} páginas extraídas`, description: `Salvo como "${safeName} — ${indexes.length} pág.pdf".` });
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Não foi possível extrair", description: e?.message || "Erro ao recortar o book.", variant: "destructive" });
    } finally {
      setExtracting(false);
    }
  };

  const pages = Array.from({ length: numPages }, (_, i) => i);
  const renderedCount = Object.keys(thumbs).length;

  /**
   * Lê "1-4, 9, 12" e SOMA à seleção — não substitui.
   *
   * Somar porque marcar por número convive com marcar no clique: quem digita
   * um intervalo e depois vê mais uma página na grade não deveria perder o
   * que já tinha. Número fora da faixa é ignorado em silêncio: digitar 40 num
   * book de 22 é engano de quem digita, não pedido para cortar o resto.
   */
  const marcarPorNumero = () => {
    // SOMA à seleção, não substitui: marcar por número convive com marcar no
    // clique, e quem digita um intervalo depois de já ter marcado uma página
    // na grade não deveria perder o que tinha.
    setPicked(prev => {
      const novos = new Set(prev);
      interpretarIntervalo(intervalo, numPages).forEach(n => novos.add(n));
      return novos;
    });
    setIntervalo("");
  };

  const marcadas = Array.from(picked).sort((a, b) => a - b);

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
        // A CASCA DA CASA (`modalSurface`): mesmo raio, sombra, teto de altura
        // e — o que faltava aqui — a largura que respeita 8px de margem no
        // celular (era `94vw`, sem teto em px menores).
        style={modalSurface(1040)}>
        <DialogTitle className="sr-only">Extrair páginas do book</DialogTitle>
        <DialogDescription className="sr-only">Escolha as páginas do book e baixe um PDF apenas com elas</DialogDescription>

        {/* ══ Cabeçalho ═══════════════════════════════════════════════════
            ModalHeader `work`, no lugar da cópia feita à mão do mesmo desenho
            (gradiente, ladrilho, X redondo). "Recortar" e não "Escolher
            páginas": o verbo diz o que sai do outro lado; e o subtítulo
            responde à dúvida que segura o clique — se o recorte perde
            qualidade em relação ao original. */}
        <ModalHeader
          icon={Scissors}
          tint="#6d28d9"
          title="Recortar o book"
          subtitle={`${activeBook ? `${activeBook.label} · ` : ""}${numPages} ${numPages === 1 ? "página" : "páginas"} · o recorte sai na qualidade do original`}
          onClose={() => onOpenChange(false)}
        />

        {/* ══ Barra de controle ═══════════════════════════════════════════
            Padding lateral por `clamp`: 32px fixos comiam 64 dos 374 úteis
            num celular de 390 e empurravam os atalhos para três linhas. */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px clamp(16px, 4vw, 32px)", borderBottom: "1px solid #ebe8e4", backgroundColor: "#fafaf9", flexWrap: "wrap", flexShrink: 0 }}>
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

          {/* Campo de número ao lado da contagem, antes dos atalhos: é o
              caminho mais curto para uma seleção que a pessoa já tem na
              cabeça. Enter marca sem tirar a mão do teclado. */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            <div style={{ position: "relative" }}>
              <Hash aria-hidden="true" style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", width: 12, height: 12, color: "#a8a29e", pointerEvents: "none" }} />
              <input
                value={intervalo}
                onChange={e => setIntervalo(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); marcarPorNumero(); } }}
                placeholder="1-4, 9, 12"
                aria-label="Marcar páginas por número, aceita intervalos separados por vírgula"
                aria-keyshortcuts="Enter"
                title="Enter marca as páginas digitadas"
                data-testid="input-book-intervalo"
                disabled={numPages === 0}
                style={{ width: 116, height: 36, boxSizing: "border-box", padding: "0 8px 0 24px", borderRadius: 8, border: "1px solid #d6d3d1", backgroundColor: "#fff", fontSize: 13, fontFamily: "monospace", color: "#1c1917", outlineOffset: 2 }}
              />
            </div>
            {/* 36px, a altura do campo ao lado — eram 24, um botão menor que
                a caixa de texto que ele confirma. */}
            <button
              onClick={marcarPorNumero}
              disabled={numPages === 0 || !intervalo.trim()}
              data-testid="button-book-marcar-intervalo"
              style={{ height: 36, padding: "0 12px", borderRadius: 8, backgroundColor: "#f5f3ff", border: "1px solid #ddd6fe", color: "#5b21b6", opacity: numPages === 0 || !intervalo.trim() ? 0.5 : 1, fontSize: 12, fontWeight: 700, cursor: numPages === 0 || !intervalo.trim() ? "not-allowed" : "pointer" }}>
              Marcar
            </button>
          </div>

          {/* Os três atalhos tinham padding 0 — alvo do tamanho do texto
              (~16px de altura) — e, desabilitados, letra #c4c0ba. Agora 36px
              de alvo e desabilitado por opacidade sobre a cor real, como o
              resto da casa. */}
          <div role="group" aria-label="Seleção rápida" style={{ display: "flex", alignItems: "center", gap: 2 }}>
            {([
              { rotulo: "Todas", acao: () => setPicked(new Set(pages)), off: numPages === 0 || picked.size === numPages, testId: undefined },
              // INVERTER: recortar "tudo menos a capa e as duas últimas" era
              // clicar 19 vezes num book de 22 páginas.
              { rotulo: "Inverter", acao: () => setPicked(new Set(pages.filter((n: number) => !picked.has(n)))), off: numPages === 0, testId: "button-book-inverter" },
              { rotulo: "Limpar", acao: () => setPicked(new Set()), off: picked.size === 0, testId: undefined },
            ]).map(b => (
              <button
                key={b.rotulo}
                type="button"
                onClick={b.acao}
                disabled={b.off}
                data-testid={b.testId}
                style={{ height: 36, padding: "0 8px", borderRadius: 8, background: "none", border: "none", fontSize: 12, fontWeight: 700, color: "#6d28d9", opacity: b.off ? 0.45 : 1, cursor: b.off ? "not-allowed" : "pointer" }}>
                {b.rotulo}
              </button>
            ))}
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
        <div style={{ maxHeight: 520, overflowY: "auto", padding: "clamp(16px, 4vw, 32px)", backgroundColor: "#fff", flex: "0 1 auto", minHeight: 0 }}>
          {error && (
            <div role="alert" style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: 16, borderRadius: 10, backgroundColor: "#fef2f2", border: "1px solid #fecaca" }}>
              <AlertCircle aria-hidden="true" style={{ width: 16, height: 16, color: "#b91c1c", flexShrink: 0, marginTop: 1 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: "#991b1b", margin: "0 0 4px" }}>Não foi possível abrir o book</p>
                <p style={{ fontSize: 12, color: "#991b1b", margin: 0, lineHeight: 1.5 }}>{error}</p>
                {/* A saída ao lado do problema. Sem ela, a única forma de tentar
                    de novo era fechar o modal e reabrir pela exportação. */}
                <button
                  type="button"
                  onClick={() => setTentativa(t => t + 1)}
                  style={{ marginTop: 10, display: "inline-flex", alignItems: "center", gap: 6, height: 36, padding: "0 14px", borderRadius: 8, border: "1px solid #fecaca", backgroundColor: "#fff", color: "#991b1b", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  <RefreshCw aria-hidden="true" style={{ width: 13, height: 13 }} /> Tentar de novo
                </button>
              </div>
            </div>
          )}

          {opening && !error && (
            <div role="status" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: "80px 0" }}>
              <Loader2 aria-hidden="true" style={{ width: 26, height: 26, color: "#6d28d9" }} className="animate-spin" />
              <p style={{ fontSize: 13, color: "#57534e", margin: 0 }}>Abrindo o book…</p>
            </div>
          )}

          {/* `min(150px, 100%)`: com 190px fixos o celular ficava com UMA
              miniatura por linha — 22 páginas viravam 22 telas de rolagem. */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(150px, 100%), 1fr))", gap: "clamp(10px, 2vw, 16px)" }}>
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
        {/* O RODAPÉ MOSTRA O QUE FOI MARCADO.

            Ele era só um botão de largura inteira com a contagem: "Baixar 7
            páginas" não diz QUAIS sete, e conferir exigia rolar a grade de
            volta procurando as bordas roxas. Com as páginas escritas aqui, a
            seleção fica verificável sem sair do lugar — e cada pílula desmarca
            no × para corrigir um engano sem caçar a miniatura. */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px clamp(16px, 4vw, 32px)", borderTop: "1px solid #ebe8e4", backgroundColor: "#fff", flexShrink: 0, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {marcadas.length === 0 ? (
              <span style={{ fontSize: 12, color: "#746e69" }}>Marque as páginas que precisa, ou digite os números acima.</span>
            ) : (
              <>
                <span style={{ fontSize: 12, color: "#57534e", flexShrink: 0 }}>Sai um PDF com</span>
                {marcadas.slice(0, 8).map(n => (
                  <span key={n} style={{ display: "inline-flex", alignItems: "center", gap: 4, backgroundColor: "#f5f3ff", border: "1px solid #ddd6fe", borderRadius: 999, padding: "2px 4px 2px 9px", fontSize: 11, fontWeight: 700, fontFamily: "monospace", color: "#5b21b6" }}>
                    {n}
                    {/* 22px de alvo dentro da pílula (eram 16): o × é o jeito
                        de corrigir um engano sem caçar a miniatura. */}
                    <button
                      onClick={() => setPicked(prev => { const x = new Set(prev); x.delete(n); return x; })}
                      aria-label={`Desmarcar a página ${n}`}
                      style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, borderRadius: 999, border: "none", background: "none", color: "#6d28d9", cursor: "pointer", fontSize: 13, lineHeight: 1, padding: 0 }}>
                      <X aria-hidden="true" style={{ width: 11, height: 11 }} />
                    </button>
                  </span>
                ))}
                {marcadas.length > 8 && (
                  <span style={{ fontSize: 11, fontWeight: 700, fontFamily: "monospace", color: "#6d28d9" }}>+{marcadas.length - 8}</span>
                )}
              </>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            {/* Cancelar com contorno e os dois botões na MESMA altura (eram 40 e
                46): a gramática dos rodapés da Arte e do Atendimento. */}
            <button
              onClick={() => onOpenChange(false)}
              style={{ height: 40, padding: "0 14px", borderRadius: 8, background: "#fff", border: "1px solid #e7e5e4", color: "#57534e", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
              Cancelar
            </button>
            <button
              onClick={extract}
              disabled={picked.size === 0 || extracting}
              data-testid="button-extract-book-pages"
              style={{
                height: 40, padding: "0 18px", borderRadius: 8, border: "none",
                backgroundColor: picked.size === 0 || extracting ? "#e7e5e4" : "#6d28d9",
                color: picked.size === 0 || extracting ? "#57534e" : "#fff",
                cursor: picked.size === 0 || extracting ? "not-allowed" : "pointer",
                fontSize: 13, fontWeight: 800, letterSpacing: "-0.01em",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                whiteSpace: "nowrap",
              }}>
              {extracting
                ? <><Loader2 style={{ width: 15, height: 15 }} className="animate-spin" /> Recortando…</>
                : <><Download style={{ width: 15, height: 15 }} /> {picked.size > 0 ? `Baixar ${picked.size} ${picked.size === 1 ? "página" : "páginas"}` : "Baixar páginas"}</>}
            </button>
          </div>
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
        display: "block", width: "100%", textAlign: "left", padding: 6, cursor: "pointer",
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
          {picked && <Check style={{ width: 13, height: 13 }} />}
        </div>
        {/* O NÚMERO SOBE PARA CIMA DA IMAGEM.

            Ele era um rótulo "Página 7" abaixo do cartão: com 22 miniaturas em
            grade, procurar a página 12 significava ler o texto embaixo de cada
            uma, e o rótulo ainda somava 20px de altura por linha da grade.
            Sobre a imagem, o olho varre só os números. */}
        <div style={{
          position: "absolute", bottom: 6, right: 6,
          borderRadius: 6, padding: "3px 6px",
          fontFamily: "monospace", fontSize: 11, fontWeight: 700, lineHeight: 1,
          backgroundColor: picked ? "rgba(109,40,217,0.92)" : "rgba(255,255,255,0.92)",
          color: picked ? "#fff" : "#57534e",
        }}>
          {index + 1}
        </div>
      </div>
    </button>
  );
}
