// ── Zoom ──────────────────────────────────────────────────────────────────
// Era um <div> fixo sobre a página. Como o recurso central da tela, é o que
// mais sentia falta de ser um diálogo de verdade: o Tab passeava pelos cartões
// atrás do escurecido, o fundo continuava rolando com a roda do mouse, ao
// fechar o foco não voltava para o cartão de origem e nada anunciava a
// abertura para leitor de tela. O Dialog do app resolve os quatro de uma vez.
//
// ── A REVISÃO DE 06/10 (redesign) ─────────────────────────────────────────
// A legenda e as ações moravam EMBAIXO da foto, e a foto não encolhia de
// verdade: numa janela de 1366×768 uma foto deitada ocupava a altura inteira
// e empurrava legenda, Baixar, Original e Fechar para fora da tela — sobrava
// só o Esc. No celular, os cinco botões numa fileira estouravam 390px e o
// "Fechar" ficava cortado. Agora é um lightbox em três faixas:
//
//   1. TOPO — o que é (tipo, peça, evento, data) e as ações; o Fechar fica
//      sempre no canto, onde o polegar e o olho procuram.
//   2. PALCO — a foto com ALTURA DEFINIDA (o diálogo tem altura, não só teto)
//      e `object-fit: contain`: ela encolhe sempre, sem empurrar nada. Setas
//      sobre a foto no desktop; carregando e "imagem indisponível" no palco.
//   3. BASE — a observação da Gráfica e a faixa "Mesma peça"; no celular, as
//      setas e o Baixar/Original numa fileira que cabe em 358px.
import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { ChevronLeft, ChevronRight, Download, ExternalLink, ImageOff, Loader2, X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { T, FS, R, FW, FONT } from "@/lib/theme";
import { KIND, kindOf, srcOf, fmt, altOf, type Photo } from "./fotos";

/** Botão sobre o fundo escuro do zoom (as variantes do <Botao> são para fundo claro). */
const botaoEscuro = (altura: number, so_icone = false): React.CSSProperties => ({
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
  minHeight: altura, minWidth: so_icone ? altura : undefined, padding: so_icone ? 0 : "0 14px",
  borderRadius: R.md, border: "1px solid rgba(255,255,255,0.14)", backgroundColor: "rgba(255,255,255,0.10)",
  color: T.surface, fontSize: FS.meta, fontWeight: FW.forte, fontFamily: "inherit", textDecoration: "none",
  cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
});

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
  // A FOTO QUE NÃO CARREGA. Antes o navegador desenhava o ícone quebrado com
  // o texto alternativo numa caixa branca no meio do escuro. Agora o palco diz
  // o que houve e oferece o original (que às vezes abre quando a cópia falha).
  const [falhou, setFalhou] = useState(false);
  useEffect(() => { setFalhou(false); }, [zoom?.id]);

  const altura = Math.max(controlHeight, isMobile ? 44 : 36);
  const k = zoom ? KIND[kindOf(zoom)] : null;
  const KIcone = k?.icon;
  const nota = zoom ? (kindOf(zoom) === "conference" ? zoom.conferenceNotes : zoom.deliveryNotes) : null;
  const primeiro = zoomIdx === 0;
  const ultimo = zoomIdx === filtered.length - 1;

  const acoes = zoom && (
    <>
      <button onClick={() => baixar(zoom)} disabled={baixando} className="reg-hover-escuro"
        data-testid="button-zoom-download" title="Baixar esta foto"
        style={{ ...botaoEscuro(altura), cursor: baixando ? "wait" : "pointer" }}>
        {baixando
          ? <><Loader2 aria-hidden="true" className="animate-spin" style={{ width: 14, height: 14 }} /> Baixando…</>
          : <><Download aria-hidden="true" style={{ width: 14, height: 14 }} /> Baixar</>}
      </button>
      <a href={srcOf(zoom)} target="_blank" rel="noopener noreferrer" className="reg-hover-escuro"
        title="Abrir o arquivo original numa aba nova" style={botaoEscuro(altura)}>
        <ExternalLink aria-hidden="true" style={{ width: 14, height: 14 }} /> Original
      </a>
    </>
  );

  return (
    <Dialog open={zoom != null} onOpenChange={o => { if (!o) setZoomIdx(null); }}>
      <DialogContent
        className="max-w-none p-0 gap-0 border-none shadow-none [&>button]:hidden"
        // ALTURA DEFINIDA, não só teto: é ela que dá ao palco uma altura para
        // a foto encolher dentro. A CONTA é `100vh − 48` (24px de respiro em
        // cima e embaixo, simétrico porque o Radix centra). Num lightbox a
        // resposta certa para "não coube" é a foto encolher, nunca rolar.
        style={isMobile
          ? {
              // TELA CHEIA OPACA no celular: com fundo transparente a grade
              // aparecia nas beiradas e a foto disputava a atenção com ela.
              // `dvh` porque `vh` conta a barra do navegador que se esconde.
              width: "100vw", maxWidth: "100vw", height: "100dvh", maxHeight: "100dvh",
              top: 0, left: 0, right: 0, bottom: 0, transform: "none",
              borderRadius: 0, backgroundColor: T.dark, color: T.surface,
              display: "flex", flexDirection: "column", overflow: "hidden",
            }
          : {
              width: "96vw", maxWidth: 1280, height: "calc(100vh - 48px)", maxHeight: "calc(100vh - 48px)",
              borderRadius: R.xl, backgroundColor: T.dark, color: T.surface,
              display: "flex", flexDirection: "column", overflow: "hidden",
            }}
      >
        <DialogTitle className="sr-only">
          {zoom ? altOf(zoom) : "Registro"}
        </DialogTitle>
        <DialogDescription className="sr-only">
          Use as setas do teclado para percorrer os registros e Esc para fechar
        </DialogDescription>

        {zoom && (
          <>
            {/* ── 1. TOPO: o que é, e as ações ── */}
            <div style={{ flexShrink: 0, display: "flex", alignItems: "flex-start", gap: 12, padding: isMobile ? "10px 10px 10px 14px" : "14px 14px 14px 20px", borderBottom: "1px solid rgba(255,255,255,0.10)" }}>
              <div style={{ minWidth: 0, flex: "1 1 auto" }}>
                <p style={{ margin: 0, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  {k && KIcone && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: FS.small, fontWeight: FW.forte, color: T.surface, backgroundColor: k.color, borderRadius: R.sm, padding: "2px 7px" }}>
                      <KIcone aria-hidden="true" style={{ width: 11, height: 11 }} /> {k.label}
                    </span>
                  )}
                  <span style={{ fontSize: isMobile ? FS.read : FS.strong, fontWeight: FW.forte, lineHeight: 1.3 }}>
                    {zoom.displayId && <span style={{ fontFamily: FONT.mono }}>{zoom.displayId}</span>}
                    {zoom.displayId ? " — " : ""}{zoom.itemType || "Peça removida"}
                  </span>
                </p>
                <p style={{ fontSize: FS.meta, color: "rgba(255,255,255,0.78)", margin: "4px 0 0", lineHeight: 1.45 }}>
                  {zoom.eventName || "Sem evento"} · <span style={{ fontFamily: FONT.mono }}>{fmt(zoom.createdAt)}</span>
                  {zoom.uploadedBy && ` · por ${zoom.uploadedBy}`}
                  {kindOf(zoom) === "delivery" && zoom.receivedBy && ` · recebido por ${zoom.receivedBy}`}
                </p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                <span aria-live="polite" style={{ fontFamily: FONT.mono, fontSize: FS.meta, color: "rgba(255,255,255,0.78)", whiteSpace: "nowrap", marginRight: 2 }}>
                  {zoomIdx! + 1} / {filtered.length}
                </span>
                {!isMobile && acoes}
                <button onClick={() => setZoomIdx(null)} className="reg-hover-escuro" aria-label="Fechar" title="Fechar (Esc)"
                  data-testid="button-zoom-fechar"
                  style={botaoEscuro(isMobile ? 44 : altura, true)}>
                  <X aria-hidden="true" style={{ width: 18, height: 18 }} />
                </button>
              </div>
            </div>

            {/* ── 2. PALCO ── */}
            <div style={{ position: "relative", flex: "1 1 auto", minHeight: 0, margin: isMobile ? 8 : "12px 16px" }}>
              {zoomLoading && !falhou && (
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1 }}>
                  <Loader2 aria-label="Carregando a foto" className="animate-spin" style={{ width: 28, height: 28, color: "rgba(255,255,255,0.85)" }} />
                </div>
              )}
              {falhou ? (
                <div role="status" style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, textAlign: "center", padding: 16 }}>
                  <ImageOff aria-hidden="true" style={{ width: 32, height: 32, color: "rgba(255,255,255,0.6)" }} />
                  <p style={{ margin: 0, fontSize: FS.strong, fontWeight: FW.forte }}>Não foi possível mostrar esta foto</p>
                  <p style={{ margin: 0, fontSize: FS.meta, color: "rgba(255,255,255,0.78)", maxWidth: 360, lineHeight: 1.45 }}>
                    A cópia do arquivo não carregou. Tente abrir o original — ele vem direto do armazenamento.
                  </p>
                </div>
              ) : (
                /* Sem lazy: é a foto que a pessoa acabou de pedir para ver.
                   Absoluta no palco e `contain`: encolhe sempre, nunca empurra. */
                <img
                  key={zoom.id}
                  src={srcOf(zoom)}
                  alt={altOf(zoom)}
                  decoding="async"
                  onLoad={() => setZoomLoading(false)}
                  onError={() => { setZoomLoading(false); setFalhou(true); }}
                  data-testid="img-zoom"
                  style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", opacity: zoomLoading ? 0.35 : 1, transition: "opacity 0.15s" }}
                />
              )}

              {/* Setas dentro do palco: fora dele, em tela larga, ficavam a
                  meio metro da foto. Somem na ponta, em vez de não fazer nada. */}
              {!isMobile && zoomIdx! > 0 && (
                <button onClick={() => stepZoom(-1)} title="Anterior (←)" aria-label="Registro anterior"
                  data-testid="button-zoom-prev" className="reg-seta"
                  style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", width: 44, height: 44, borderRadius: R.pill, border: "1px solid rgba(255,255,255,0.18)", backgroundColor: "rgba(28,25,23,0.62)", color: T.surface, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2 }}>
                  <ChevronLeft aria-hidden="true" style={{ width: 22, height: 22 }} />
                </button>
              )}
              {!isMobile && zoomIdx! < filtered.length - 1 && (
                <button onClick={() => stepZoom(1)} title="Próxima (→)" aria-label="Próximo registro"
                  data-testid="button-zoom-next" className="reg-seta"
                  style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", width: 44, height: 44, borderRadius: R.pill, border: "1px solid rgba(255,255,255,0.18)", backgroundColor: "rgba(28,25,23,0.62)", color: T.surface, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2 }}>
                  <ChevronRight aria-hidden="true" style={{ width: 22, height: 22 }} />
                </button>
              )}
            </div>

            {/* ── 3. BASE: observação, mesma peça e (no celular) as ações ── */}
            {(() => {
              const daPeca = fotosDaPeca(zoom);
              const temFaixa = daPeca.length >= 2;
              if (!nota && !temFaixa && !isMobile) return null;
              return (
                <div style={{ flexShrink: 0, padding: isMobile ? "10px 12px calc(12px + env(safe-area-inset-bottom))" : "12px 20px 16px", borderTop: "1px solid rgba(255,255,255,0.10)", display: "flex", flexDirection: "column", gap: 10 }}>
                  {nota && (
                    <p style={{ margin: 0, fontSize: FS.body, color: "rgba(255,255,255,0.92)", lineHeight: 1.45, paddingLeft: 10, borderLeft: `2px solid ${k?.color ?? T.second}` }}>
                      <span style={{ display: "block", fontSize: FS.small, fontWeight: FW.forte, color: "rgba(255,255,255,0.7)" }}>Observação da Gráfica</span>
                      {nota}
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
                  {temFaixa && (
                    <div data-testid="strip-same-item" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: isMobile ? "nowrap" : "wrap", overflowX: isMobile ? "auto" : undefined }}>
                      <span style={{ fontSize: FS.small, fontWeight: FW.forte, color: "rgba(255,255,255,0.7)", flexShrink: 0, marginRight: 2 }}>
                        Mesma peça
                      </span>
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
                            className={atual || !alcancavel ? undefined : "reg-hover-escuro"}
                            style={{
                              display: "flex", alignItems: "center", gap: 8, flexShrink: 0,
                              minHeight: 44, padding: "4px 10px 4px 4px", borderRadius: R.md,
                              backgroundColor: atual ? "rgba(255,255,255,0.16)" : "transparent",
                              border: `1px solid ${atual ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.14)"}`,
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
                                {kf.label}{atual ? " · aberta" : ""}
                              </span>
                              <span style={{ display: "block", fontFamily: FONT.mono, fontSize: FS.small, color: "rgba(255,255,255,0.75)" }}>
                                {fmt(f.createdAt)}
                              </span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* NO CELULAR AS SETAS SOBRE A FOTO SOMEM (cobririam a peça
                      numa tela de 390px) e o teclado não existe: sem estes dois
                      botões, percorrer o acervo exigia fechar o zoom e tocar no
                      cartão seguinte. Mesmo stepZoom das setas do desktop. */}
                  {isMobile && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <button type="button" onClick={() => stepZoom(-1)} disabled={primeiro} aria-label="Registro anterior"
                        className="reg-hover-escuro" style={{ ...botaoEscuro(44, true), opacity: primeiro ? 0.4 : 1, cursor: primeiro ? "default" : "pointer" }}>
                        <ChevronLeft aria-hidden="true" style={{ width: 20, height: 20 }} />
                      </button>
                      <button type="button" onClick={() => stepZoom(1)} disabled={ultimo} aria-label="Próximo registro"
                        className="reg-hover-escuro" style={{ ...botaoEscuro(44, true), opacity: ultimo ? 0.4 : 1, cursor: ultimo ? "default" : "pointer" }}>
                        <ChevronRight aria-hidden="true" style={{ width: 20, height: 20 }} />
                      </button>
                      <span style={{ flex: 1 }} />
                      {acoes}
                    </div>
                  )}
                </div>
              );
            })()}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
