// ── Zoom ──────────────────────────────────────────────────────────────────
// Era um <div> fixo sobre a página. Como o recurso central da tela, é o que
// mais sentia falta de ser um diálogo de verdade: o Tab passeava pelos cartões
// atrás do escurecido, o fundo continuava rolando com a roda do mouse, ao
// fechar o foco não voltava para o cartão de origem e nada anunciava a
// abertura para leitor de tela. O Dialog do app resolve os quatro de uma vez.
import type { Dispatch, SetStateAction } from "react";
import { ChevronLeft, ChevronRight, Download, ExternalLink, Loader2, X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { T, FS, R, FW, FONT, SHADOW } from "@/lib/theme";
import { KIND, kindOf, srcOf, fmt, altOf, type Photo } from "./fotos";

export function ZoomDoRegistro({
  zoom, zoomIdx, setZoomIdx, filtered, stepZoom, zoomLoading, setZoomLoading,
  isMobile, fotosDaPeca, idxPorId, baixar, baixando, controlHeight,
}: {
  /** A foto aberta (`filtered[zoomIdx]`), ou null com o zoom fechado. */
  zoom: Photo | null;
  zoomIdx: number | null;
  setZoomIdx: Dispatch<SetStateAction<number | null>>;
  filtered: Photo[];
  stepZoom: (dir: 1 | -1) => void;
  zoomLoading: boolean;
  setZoomLoading: Dispatch<SetStateAction<boolean>>;
  isMobile: boolean;
  fotosDaPeca: (f: Photo) => Photo[];
  idxPorId: Map<string, number>;
  baixar: (p: Photo) => void;
  baixando: boolean;
  controlHeight: number;
}) {
  return (
    <Dialog open={zoom != null} onOpenChange={o => { if (!o) setZoomIdx(null); }}>
      <DialogContent
        className="max-w-none p-0 gap-0 border-none bg-transparent shadow-none [&>button]:hidden"
        // ALTURA: a foto tinha teto de 72vh e a legenda vinha por baixo, sem
        // teto nenhum no Content. A conta dava `72vh + 12 de gap + legenda`:
        // 392px numa janela de 445 contra 397 disponíveis — passava raspando,
        // e bastava o registro TER observação (a linha em itálico soma ~20px)
        // para virar 412 e o Radix cortar 8px em cima e 8 embaixo ao mesmo
        // tempo. Abaixo de ~428px de janela cortava sempre.
        //
        // A CONTA é `100vh − 48`: viewport menos 24px de respiro em cima e 24
        // embaixo, simétrico porque o Radix centra. Aqui o teto NÃO vira
        // rolagem: num lightbox a resposta certa é a foto encolher. Por isso a
        // moldura da imagem é o item elástico (`flex: 1 1 auto` + `minHeight:
        // 0`) e a legenda não encolhe — a foto acompanha com `maxHeight: 100%`.
        style={isMobile
          ? {
              // TELA CHEIA OPACA. Em 390px, 96vw com fundo transparente
              // deixa a grade aparecendo nas beiradas e a foto disputa a
              // atencao com ela. `dvh` porque `vh` conta a barra do
              // navegador que se esconde — a legenda ficava embaixo dela.
              width: "100vw", maxWidth: "100vw", height: "100dvh", maxHeight: "100dvh",
              top: 0, left: 0, right: 0, bottom: 0, transform: "none",
              borderRadius: 0, backgroundColor: T.text, padding: 12,
              display: "flex", flexDirection: "column",
            }
          : { width: "96vw", maxWidth: 1280, maxHeight: "calc(100vh - 48px)", display: "flex", flexDirection: "column" }}
      >
        <DialogTitle className="sr-only">
          {zoom ? altOf(zoom) : "Registro"}
        </DialogTitle>
        <DialogDescription className="sr-only">
          Use as setas do teclado para percorrer os registros e Esc para fechar
        </DialogDescription>

        {zoom && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, flex: "1 1 auto", minHeight: 0 }}>
            <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", flex: "1 1 auto", minHeight: 0 }}>
              {zoomLoading && (
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Loader2 className="animate-spin" style={{ width: 28, height: 28, color: "rgba(255,255,255,0.85)" }} />
                </div>
              )}
              {/* Sem lazy: é a foto que a pessoa acabou de pedir para ver. */}
              <img
                src={srcOf(zoom)}
                alt={altOf(zoom)}
                decoding="async"
                onLoad={() => setZoomLoading(false)}
                onError={() => setZoomLoading(false)}
                data-testid="img-zoom"
                style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: R.md, backgroundColor: T.surface, boxShadow: SHADOW.lg, opacity: zoomLoading ? 0.4 : 1, transition: "opacity 0.15s" }}
              />

              {/* Setas dentro da moldura da imagem: fora dela, em tela larga,
                  ficavam a meio metro da foto. */}
              {!isMobile && zoomIdx! > 0 && (
                <button onClick={() => stepZoom(-1)} title="Anterior (←)" aria-label="Registro anterior"
                  data-testid="button-zoom-prev"
                  style={{ position: "absolute", left: 12, width: 44, height: 44, borderRadius: R.pill, border: "none", backgroundColor: "rgba(28,25,23,0.55)", color: T.surface, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <ChevronLeft style={{ width: 22, height: 22 }} />
                </button>
              )}
              {!isMobile && zoomIdx! < filtered.length - 1 && (
                <button onClick={() => stepZoom(1)} title="Próxima (→)" aria-label="Próximo registro"
                  data-testid="button-zoom-next"
                  style={{ position: "absolute", right: 12, width: 44, height: 44, borderRadius: R.pill, border: "none", backgroundColor: "rgba(28,25,23,0.55)", color: T.surface, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <ChevronRight style={{ width: 22, height: 22 }} />
                </button>
              )}
            </div>

            {/* Legenda + ações. flexWrap porque no celular três botões e o
                texto não cabem lado a lado. */}
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap", color: T.surface, flexShrink: 0 }}>
              <div style={{ minWidth: 0, flex: "1 1 260px" }}>
                <p style={{ fontSize: FS.strong, fontWeight: 700, margin: 0 }}>
                  {zoom.displayId ? `${zoom.displayId} — ` : ""}{zoom.itemType || "Peça removida"}
                </p>
                <p style={{ fontSize: FS.small, color: "rgba(255,255,255,0.8)", margin: "2px 0 0" }}>
                  {KIND[kindOf(zoom)].label} · {zoom.eventName || "Sem evento"} · {fmt(zoom.createdAt)}
                  {zoom.uploadedBy && ` · por ${zoom.uploadedBy}`}
                </p>
                {(kindOf(zoom) === "conference" ? zoom.conferenceNotes : zoom.deliveryNotes) && (
                  <p style={{ fontSize: FS.small, color: "rgba(255,255,255,0.9)", fontStyle: "italic", margin: "4px 0 0" }}>
                    “{kindOf(zoom) === "conference" ? zoom.conferenceNotes : zoom.deliveryNotes}”
                  </p>
                )}

                {/* ── MESMA PEÇA ──
                    Dois eixos de navegação, de propósito: as setas ← → andam
                    no ACERVO (a lista filtrada inteira), esta faixa anda na
                    PEÇA. Sem ela, comparar conferência com entrega da mesma
                    peça exigia fechar o zoom, achar o outro cartão na grade e
                    abrir de novo — e as duas costumam estar em dias
                    diferentes, portanto em grupos diferentes.

                    Trocar aqui NÃO fecha o diálogo: só muda o índice. */}
                {(() => {
                  const daPeca = fotosDaPeca(zoom);
                  if (daPeca.length < 2) return null;
                  return (
                    <div data-testid="strip-same-item" style={{ marginTop: 10 }}>
                      <p style={{ fontSize: FS.small, fontWeight: FW.forte, color: "rgba(255,255,255,0.75)", margin: "0 0 6px" }}>
                        Mesma peça
                      </p>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {daPeca.map(f => {
                          const atual = f.id === zoom.id;
                          const kf = KIND[kindOf(f)];
                          const i = idxPorId.get(f.id) ?? -1;
                          // Fora do filtro em vigor, a ficha aparece mas não
                          // leva a lugar nenhum — dizer isso é melhor que
                          // escondê-la, porque a foto EXISTE.
                          const alcancavel = i >= 0;
                          return (
                            <button
                              key={f.id}
                              type="button"
                              onClick={() => { if (alcancavel && !atual) setZoomIdx(i); }}
                              disabled={atual || !alcancavel}
                              aria-current={atual || undefined}
                              title={atual ? "Você está vendo esta" : alcancavel ? `Ver a ${kf.label.toLowerCase()}` : `${kf.label} — fora do filtro em vigor`}
                              style={{
                                display: "flex", alignItems: "center", gap: 8,
                                minHeight: 44, padding: "5px 10px 5px 5px", borderRadius: R.md,
                                backgroundColor: atual ? "rgba(255,255,255,0.18)" : "transparent",
                                border: `1px solid ${atual ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.15)"}`,
                                color: T.surface, font: "inherit",
                                cursor: atual ? "default" : alcancavel ? "pointer" : "not-allowed",
                                opacity: alcancavel || atual ? 1 : 0.5,
                              }}
                            >
                              <img
                                src={srcOf(f)} alt="" aria-hidden="true" loading="lazy" decoding="async"
                                style={{ width: 34, height: 34, borderRadius: R.sm, objectFit: "cover", flexShrink: 0, backgroundColor: "rgba(255,255,255,0.1)" }}
                                onError={e => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }}
                              />
                              <span style={{ textAlign: "left" }}>
                                <span style={{ display: "block", fontSize: FS.small, fontWeight: FW.forte }}>
                                  {kf.label}
                                </span>
                                <span style={{ display: "block", fontFamily: FONT.mono, fontSize: FS.small, color: "rgba(255,255,255,0.75)" }}>
                                  {fmt(f.createdAt)}
                                </span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, flexWrap: "wrap" }}>
                <span style={{ fontSize: FS.small, color: "rgba(255,255,255,0.8)", whiteSpace: "nowrap", marginRight: 4 }}>
                  {zoomIdx! + 1} / {filtered.length}
                </span>
                {/* NO CELULAR AS SETAS SOBRE A FOTO SOMEM (cobririam a
                    peça numa tela de 390px) e o teclado não existe: sem
                    estes dois botões, percorrer o acervo exigia fechar o
                    zoom e tocar no cartão seguinte. Mesmo stepZoom das
                    setas do desktop. */}
                {isMobile && (
                  <>
                    {/* Botões sobre o fundo escuro do zoom: ficam <button>
                        (as variantes do Botao são para fundo claro). */}
                    <button type="button" onClick={() => stepZoom(-1)} disabled={zoomIdx === 0} aria-label="Registro anterior"
                      className="reg-hover-escuro"
                      style={{ width: 44, height: 44, borderRadius: R.md, border: "none", backgroundColor: "rgba(255,255,255,0.15)", color: T.surface, cursor: zoomIdx === 0 ? "default" : "pointer", opacity: zoomIdx === 0 ? 0.4 : 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
                      <ChevronLeft aria-hidden="true" style={{ width: 20, height: 20 }} />
                    </button>
                    <button type="button" onClick={() => stepZoom(1)} disabled={zoomIdx === filtered.length - 1} aria-label="Próximo registro"
                      className="reg-hover-escuro"
                      style={{ width: 44, height: 44, borderRadius: R.md, border: "none", backgroundColor: "rgba(255,255,255,0.15)", color: T.surface, cursor: zoomIdx === filtered.length - 1 ? "default" : "pointer", opacity: zoomIdx === filtered.length - 1 ? 0.4 : 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
                      <ChevronRight aria-hidden="true" style={{ width: 20, height: 20 }} />
                    </button>
                  </>
                )}
                <button onClick={() => baixar(zoom)} disabled={baixando} className="reg-hover-escuro"
                  data-testid="button-zoom-download"
                  style={{ display: "flex", alignItems: "center", gap: 6, minHeight: controlHeight, padding: "0 14px", borderRadius: R.md, border: "none", backgroundColor: "rgba(255,255,255,0.15)", color: T.surface, fontSize: FS.small, fontWeight: FW.forte, cursor: baixando ? "wait" : "pointer" }}>
                  {baixando
                    ? <><Loader2 className="animate-spin" style={{ width: 13, height: 13 }} /> Baixando…</>
                    : <><Download style={{ width: 13, height: 13 }} /> Baixar</>}
                </button>
                <a href={srcOf(zoom)} target="_blank" rel="noopener noreferrer" className="reg-hover-escuro"
                  style={{ display: "flex", alignItems: "center", gap: 6, minHeight: controlHeight, padding: "0 14px", borderRadius: R.md, backgroundColor: "rgba(255,255,255,0.15)", color: T.surface, fontSize: FS.small, fontWeight: FW.forte, textDecoration: "none" }}>
                  <ExternalLink style={{ width: 13, height: 13 }} /> Original
                </a>
                <button onClick={() => setZoomIdx(null)} className="reg-hover-escuro" aria-label="Fechar"
                  style={{ display: "flex", alignItems: "center", gap: 6, minHeight: controlHeight, padding: "0 14px", borderRadius: R.md, border: "none", backgroundColor: "rgba(255,255,255,0.15)", color: T.surface, fontSize: FS.small, fontWeight: FW.forte, cursor: "pointer" }}>
                  <X style={{ width: 13, height: 13 }} /> Fechar
                </button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
