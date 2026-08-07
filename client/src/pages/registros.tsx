// Registros fotográficos da Gráfica — conferências e entregas de todas as peças.
// Fica fora da tela da Gráfica de propósito: a maioria dos perfis não tem acesso
// a ela, e este acervo interessa a todo mundo.
import { useMemo, useState, useEffect, useDeferredValue } from "react";
import { useQuery } from "@tanstack/react-query";
import { Camera, Truck, FileCheck, Search, X, ExternalLink, ChevronLeft, ChevronRight, ZoomIn, Download, Loader2 } from "lucide-react";
import { Link } from "wouter";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { FilterSelect } from "@/components/filter-select";
import { convertGCSUrlToLocalPath } from "@/lib/artePdfExport";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useIsMobile } from "@/hooks/use-mobile";
import { T, FS, R, SHADOW } from "@/lib/theme";
import { toast } from "@/hooks/use-toast";

const KIND = {
  conference: { label: "Conferência", color: "#0e7490", bg: "#ecfeff", border: "#a5f3fc", icon: FileCheck },
  delivery:   { label: "Entrega",     color: "#7e22ce", bg: "#faf5ff", border: "#e9d5ff", icon: Truck },
} as const;

type Kind = keyof typeof KIND;

const PAGE_SIZE = 60;

const PERIODS = ["Hoje", "7 dias", "15 dias", "30 dias", "Todos"] as const;
type Period = typeof PERIODS[number];
const PERIOD_DAYS: Record<string, number> = { "Hoje": 0, "7 dias": 7, "15 dias": 15, "30 dias": 30 };

export default function Registros() {
  const isMobile = useIsMobile();
  const { data: photos = [], isLoading } = useQuery<any[]>({ queryKey: ["/api/photos"] });

  const [kindFilter, setKindFilter]   = useState<string[]>([]);
  const [eventFilter, setEventFilter] = useState<string[]>([]);
  const [period, setPeriod]           = useState<Period>("Todos");
  const [search, setSearch]           = useState("");
  const [visible, setVisible]         = useState(PAGE_SIZE);
  // Índice na lista filtrada, para poder navegar entre as fotos com o zoom aberto.
  const [zoomIdx, setZoomIdx]         = useState<number | null>(null);

  // Sem isso, cada tecla refiltra o acervo inteiro e a digitação engasga.
  const deferredSearch = useDeferredValue(search);

  const kindOf = (p: any): Kind => (p.kind === "conference" ? "conference" : "delivery");
  // Registros antigos guardaram a URL assinada do GCS, que expira; o app serve
  // os arquivos por /objects/...
  const srcOf = (p: any) => convertGCSUrlToLocalPath(p.photoUrl || "");

  // Filtros facetados: cada um conta sobre o resultado dos outros.
  const passesKind   = (p: any) => !kindFilter.length  || kindFilter.includes(kindOf(p));
  const passesEvent  = (p: any) => !eventFilter.length || eventFilter.includes(p.eventId || "");
  const passesSearch = (p: any) => {
    const q = deferredSearch.trim().toLowerCase();
    if (!q) return true;
    return [p.displayId, p.itemType, p.itemDescription, p.eventName, p.receivedBy, p.uploadedBy]
      .some(v => (v || "").toLowerCase().includes(q));
  };
  const passesPeriod = (p: any) => {
    if (period === "Todos") return true;
    if (!p.createdAt) return false;
    const from = new Date(); from.setHours(0, 0, 0, 0);
    from.setDate(from.getDate() - PERIOD_DAYS[period]);
    return new Date(p.createdAt) >= from;
  };

  const filtered = useMemo(
    () => photos.filter(p => passesKind(p) && passesEvent(p) && passesSearch(p) && passesPeriod(p)),
    [photos, kindFilter, eventFilter, deferredSearch, period],
  );

  const kindOptions = useMemo(() => {
    const pool = photos.filter(p => passesEvent(p) && passesSearch(p) && passesPeriod(p));
    return (Object.keys(KIND) as Kind[]).map(k => ({
      value: k, label: KIND[k].label,
      count: pool.filter(p => kindOf(p) === k).length,
    })).filter(o => o.count > 0 || kindFilter.includes(o.value));
  }, [photos, eventFilter, deferredSearch, period, kindFilter]);

  const eventOptions = useMemo(() => {
    const pool = photos.filter(p => passesKind(p) && passesSearch(p) && passesPeriod(p));
    const map = new Map<string, { value: string; label: string; count: number }>();
    pool.forEach(p => {
      const id = p.eventId || "";
      const entry = map.get(id);
      if (entry) entry.count++;
      else map.set(id, { value: id, label: p.eventName || "Sem evento", count: 1 });
    });
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }, [photos, kindFilter, deferredSearch, period]);

  // Contadores sobre o recorte atual (menos o filtro de tipo, que eles próprios
  // controlam) — números que ignoram os filtros confundem mais do que informam.
  const counts = useMemo(() => {
    const pool = photos.filter(p => passesEvent(p) && passesSearch(p) && passesPeriod(p));
    return {
      total: pool.length,
      conference: pool.filter(p => kindOf(p) === "conference").length,
      delivery: pool.filter(p => kindOf(p) === "delivery").length,
    };
  }, [photos, eventFilter, deferredSearch, period]);

  const hasFilters = !!(kindFilter.length || eventFilter.length || search.trim() || period !== "Todos");
  const clearAll = () => { setKindFilter([]); setEventFilter([]); setSearch(""); setPeriod("Todos"); };

  // Navegação do zoom: setas e Esc, como se espera de uma galeria.
  // O Esc é do próprio Dialog; aqui ficam só as setas.
  const zoom = zoomIdx != null ? filtered[zoomIdx] : null;
  const stepZoom = (dir: 1 | -1) =>
    setZoomIdx(i => {
      if (i == null) return i;
      const next = i + dir;
      return next >= 0 && next < filtered.length ? next : i;
    });

  useEffect(() => {
    if (zoomIdx == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") stepZoom(1);
      else if (e.key === "ArrowLeft") stepZoom(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomIdx, filtered.length]);

  // Foto grande demora a chegar no 4G do galpão; sem indicação, a troca de
  // imagem parece que travou porque a anterior fica na tela até a nova pintar.
  const [zoomLoading, setZoomLoading] = useState(false);
  useEffect(() => { if (zoomIdx != null) setZoomLoading(true); }, [zoomIdx]);

  const fmt = (d: any) => (d ? format(new Date(d), "dd/MM/yy HH:mm", { locale: ptBR }) : "—");

  /** Texto que descreve a foto para quem não a vê. */
  const altOf = (p: any) =>
    [KIND[kindOf(p)].label, p.displayId, p.itemType, p.eventName].filter(Boolean).join(" — ");

  // Baixar é a ação natural de um acervo: a foto vira anexo de e-mail, prova de
  // entrega, comprovante. "Abrir original" só levava para outra aba, deixando o
  // trabalho de salvar (e de nomear o arquivo) para o usuário.
  const [baixando, setBaixando] = useState(false);
  const baixar = async (p: any) => {
    setBaixando(true);
    try {
      const url = srcOf(p);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const ext = (blob.type.split("/")[1] || "jpg").replace("jpeg", "jpg");
      const nome = [KIND[kindOf(p)].label, p.displayId, p.createdAt ? format(new Date(p.createdAt), "dd-MM-yy") : ""]
        .filter(Boolean).join(" ").replace(/[\\/:*?"<>|]/g, "-");
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href; a.download = `${nome}.${ext}`; a.click();
      setTimeout(() => URL.revokeObjectURL(href), 30_000);
    } catch (e: any) {
      toast({ title: "Não foi possível baixar", description: e?.message ?? "Tente abrir o original.", variant: "destructive" });
    } finally {
      setBaixando(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", backgroundColor: T.bg }}>
      {/* ── Cabeçalho ── */}
      <div style={{ flexShrink: 0, backgroundColor: "#ffffff", borderBottom: `1px solid ${T.border}`, padding: isMobile ? "14px 16px 0" : "20px 32px 0" }}>
        <div style={{ maxWidth: 1600, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
            <div style={{ width: 40, height: 40, borderRadius: R.lg, backgroundColor: T.accent, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Camera style={{ width: 20, height: 20, color: "#ffffff" }} />
            </div>
            <div>
              <h1 style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, fontSize: FS.h1, letterSpacing: "-0.03em", color: T.text, margin: 0 }}>
                Registros
              </h1>
              <p style={{ fontSize: FS.small, color: T.second, margin: 0 }}>
                Fotos de conferência e entrega de todas as peças
              </p>
            </div>
          </div>

          {/* Contadores — refletem os filtros ativos e servem de atalho de filtro */}
          <div style={{ display: "flex", gap: 24, margin: "16px 0" }}>
            {([
              ["Total", counts.total, T.text, null],
              ["Conferências", counts.conference, KIND.conference.color, "conference"],
              ["Entregas", counts.delivery, KIND.delivery.color, "delivery"],
            ] as const).map(([label, n, color, kind]) => {
              const active = kind ? kindFilter.length === 1 && kindFilter[0] === kind : kindFilter.length === 0;
              return (
                <button key={label} className="group"
                  onClick={() => { setKindFilter(kind && !active ? [kind] : []); setVisible(PAGE_SIZE); }}
                  data-testid={`stat-${kind ?? "total"}`}
                  aria-pressed={!!kind && active}
                  title={kind ? `Ver só ${label.toLowerCase()}` : "Ver tudo"}
                  /* Estes contadores também são filtros. A 0.45 de opacidade o
                     inativo caía para menos da metade do contraste e virava
                     texto ilegível; 0.7 continua recuando sem sumir — e o
                     aria-pressed diz qual está ativo a quem não vê a cor. */
                  style={{ background: "none", border: "none", padding: 0, textAlign: "left", cursor: "pointer", opacity: active || kindFilter.length === 0 ? 1 : 0.7, transition: "opacity 0.15s" }}>
                  <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, fontSize: FS.h2, color, margin: 0, lineHeight: 1 }}>{n}</p>
                  <p className="group-hover:opacity-80" style={{ fontSize: FS.small, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: T.second, margin: "4px 0 0", borderBottom: active && kind ? `2px solid ${color}` : "2px solid transparent", paddingBottom: 2, transition: "border-color 0.15s" }}>{label}</p>
                </button>
              );
            })}
          </div>

          {/* Filtros */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", paddingBottom: 16 }}>
            <div style={{ position: "relative", flex: "1 1 260px", minWidth: 220 }}>
              <Search style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: T.muted }} />
              <input
                value={search}
                onChange={e => { setSearch(e.target.value); setVisible(PAGE_SIZE); }}
                placeholder="Buscar peça, ID, evento ou quem recebeu…"
                data-testid="input-search-registros"
                style={{ width: "100%", height: 36, padding: "0 12px 0 34px", borderRadius: R.md, border: `1px solid ${T.border}`, backgroundColor: T.surface, fontSize: FS.body, color: T.text }}
              />
            </div>
            <FilterSelect
              label="Todos os tipos"
              testId="filter-kind"
              options={kindOptions}
              values={kindFilter}
              onValuesChange={v => { setKindFilter(v); setVisible(PAGE_SIZE); }}
            />
            <FilterSelect
              label="Todos os eventos"
              testId="filter-event"
              options={eventOptions}
              values={eventFilter}
              onValuesChange={v => { setEventFilter(v); setVisible(PAGE_SIZE); }}
            />
            {/* Período — mesmo padrão das outras telas */}
            <div style={{ display: "flex", border: `1px solid ${T.border}`, borderRadius: R.md, overflow: "hidden", backgroundColor: T.surface }}>
              {PERIODS.map(p => (
                <button key={p}
                  onClick={() => { setPeriod(p); setVisible(PAGE_SIZE); }}
                  data-testid={`button-period-${p}`}
                  className={period === p ? undefined : "hover:bg-black/[0.04]"}
                  style={{
                    padding: "0 12px", height: 36, border: "none", cursor: "pointer",
                    backgroundColor: period === p ? T.text : "transparent",
                    color: period === p ? "#ffffff" : T.second,
                    fontSize: FS.small, fontWeight: 700, whiteSpace: "nowrap", transition: "background-color 0.15s",
                  }}>
                  {p}
                </button>
              ))}
            </div>
            {hasFilters && (
              <button onClick={clearAll} data-testid="button-clear-filters" className="hover:bg-black/[0.03]"
                style={{ display: "inline-flex", alignItems: "center", minHeight: 34, fontSize: FS.small, fontWeight: 600, color: T.second, background: "none", border: `1px solid ${T.border}`, borderRadius: R.pill, cursor: "pointer", padding: "0 14px", transition: "background-color 0.15s" }}>
                Limpar tudo
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Galeria ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: isMobile ? "16px" : "24px 32px", maxWidth: 1600, margin: "0 auto", width: "100%" }}>
        {isLoading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "48px 0" }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", border: `3px solid ${T.border}`, borderTopColor: T.accent, animation: "spin 0.8s linear infinite" }} />
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "64px 0", color: T.second }}>
            <Camera style={{ width: 32, height: 32, color: T.muted, marginBottom: 12 }} />
            <p style={{ fontSize: FS.strong, fontWeight: 600, color: T.text, margin: "0 0 4px" }}>
              {photos.length === 0 ? "Nenhum registro ainda" : "Nenhum registro com esses filtros"}
            </p>
            <p style={{ fontSize: FS.small, margin: 0 }}>
              {photos.length === 0
                ? "As fotos aparecem aqui conforme a Gráfica confere e entrega as peças."
                : "Ajuste os filtros para ver outros registros."}
            </p>
          </div>
        ) : (
          <>
            {/* A galeria já respondia a ← → e Esc, mas nada dizia isso: um
                recurso que ninguém descobre é um recurso que não existe. */}
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap", margin: "0 0 12px" }}>
              <p style={{ fontSize: FS.small, color: T.second, margin: 0 }}>
                Exibindo <strong style={{ color: T.text }}>{Math.min(visible, filtered.length)}</strong> de{" "}
                <strong style={{ color: T.text }}>{filtered.length}</strong> registro{filtered.length !== 1 ? "s" : ""}
              </p>
              {!isMobile && (
                <p style={{ fontSize: FS.small, color: T.second, margin: 0 }}>
                  Abra uma foto e use <kbd style={{ fontFamily: "inherit", fontWeight: 700, color: T.text }}>←</kbd>{" "}
                  <kbd style={{ fontFamily: "inherit", fontWeight: 700, color: T.text }}>→</kbd> para percorrer
                </p>
              )}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 20 }}>
              {filtered.slice(0, visible).map((p, idx) => {
                const k = KIND[kindOf(p)];
                const Icon = k.icon;
                const notes = kindOf(p) === "conference" ? p.conferenceNotes : p.deliveryNotes;
                return (
                  <div key={p.id} data-testid={`card-photo-${p.id}`} className="group"
                    style={{ backgroundColor: T.surface, border: `1px solid ${T.border}`, borderRadius: R.lg, overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: SHADOW.sm, transition: "box-shadow 0.15s ease, transform 0.15s ease" }}
                    onMouseEnter={e => { e.currentTarget.style.boxShadow = SHADOW.md; e.currentTarget.style.transform = "translateY(-2px)"; }}
                    onMouseLeave={e => { e.currentTarget.style.boxShadow = SHADOW.sm; e.currentTarget.style.transform = "translateY(0)"; }}
                  >
                    <button
                      onClick={() => setZoomIdx(idx)}
                      title="Ampliar"
                      style={{ display: "block", position: "relative", width: "100%", aspectRatio: "4/3", border: "none", padding: 0, backgroundColor: T.low, cursor: "zoom-in" }}
                    >
                      {/* lazy: a grade carrega dezenas de fotos; sem isso o
                          navegador baixa todas de uma vez ao abrir a tela. */}
                      {/* alt era só "Conferência"/"Entrega": um leitor de tela
                          repetia a mesma palavra sessenta vezes ao percorrer a
                          grade, sem dizer de que peça era cada foto. */}
                      <img src={srcOf(p)} alt={altOf(p)} loading="lazy" decoding="async"
                        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                        onError={e => {
                          const img = e.currentTarget as HTMLImageElement;
                          img.style.display = "none";
                          const box = img.parentElement;
                          if (box && !box.querySelector("[data-broken]")) {
                            const span = document.createElement("span");
                            span.setAttribute("data-broken", "1");
                            span.textContent = "Imagem indisponível";
                            span.style.cssText = `position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:11px;color:${T.second}`;
                            box.appendChild(span);
                          }
                        }} />

                      {/* Selo de tipo — sobre a foto, então a legenda abaixo já
                          começa direto na informação da peça. */}
                      <span style={{ position: "absolute", top: 8, left: 8, display: "inline-flex", alignItems: "center", gap: 4, fontSize: FS.micro, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#ffffff", backgroundColor: k.color, borderRadius: R.sm, padding: "3px 7px", boxShadow: SHADOW.sm }}>
                        <Icon style={{ width: 10, height: 10 }} /> {k.label}
                      </span>
                      {p.displayId && (
                        <span style={{ position: "absolute", top: 8, right: 8, fontFamily: "monospace", fontSize: FS.small, fontWeight: 700, color: "#ffffff", backgroundColor: "rgba(28,25,23,0.6)", borderRadius: R.sm, padding: "2px 7px" }}>{p.displayId}</span>
                      )}

                      {/* Afordância de zoom — só aparece no hover, pra não competir com a foto. */}
                      <span className="opacity-0 group-hover:opacity-100" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(28,25,23,0.25)", transition: "opacity 0.15s" }}>
                        <ZoomIn style={{ width: 22, height: 22, color: "#ffffff" }} />
                      </span>
                    </button>

                    <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
                      <p style={{ fontSize: FS.body, fontWeight: 700, color: T.text, margin: 0, lineHeight: 1.3 }}>
                        {p.itemType || "Peça removida"}
                        {p.itemDescription && <span style={{ fontWeight: 400, color: T.second }}> — {p.itemDescription}</span>}
                      </p>
                      {/* Leva ao evento da peça — a pergunta seguinte a "vi a foto"
                          costuma ser "onde essa peça está". */}
                      {p.eventId ? (
                        <Link href={`/eventos/${p.eventId}`}
                          data-testid={`link-event-${p.id}`}
                          className="hover:underline"
                          style={{ fontSize: FS.small, color: T.accent, margin: 0, textDecoration: "none", fontWeight: 600 }}>
                          {p.eventName || "Sem evento"}
                        </Link>
                      ) : (
                        <p style={{ fontSize: FS.small, color: T.second, margin: 0 }}>Sem evento</p>
                      )}

                      {/* A observação é o que a Gráfica escreveu na hora — vale
                          mais que os metadados. Fundo levíssimo em vez de só
                          itálico, para separá-la do resto sem gritar.
                          (#584237 era uma cor solta fora da paleta.) */}
                      {notes && (
                        <p style={{ fontSize: FS.small, color: "#57534e", fontStyle: "italic", margin: 0, lineHeight: 1.45, backgroundColor: T.low, borderRadius: R.sm, padding: "6px 8px" }}>
                          “{notes}”
                        </p>
                      )}

                      <div style={{ marginTop: "auto", paddingTop: 6, borderTop: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", gap: 8 }}>
                        <span style={{ fontSize: FS.small, color: T.second }}>{fmt(p.createdAt)}</span>
                        <span style={{ fontSize: FS.small, color: T.second, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {kindOf(p) === "delivery" && p.receivedBy ? `Recebido: ${p.receivedBy}` : (p.uploadedBy || "")}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {visible < filtered.length && (
              <div style={{ display: "flex", justifyContent: "center", marginTop: 20 }}>
                <button onClick={() => setVisible(v => v + PAGE_SIZE)} data-testid="button-load-more" className="hover:bg-black/[0.03]"
                  style={{ padding: "10px 20px", borderRadius: R.md, border: `1px solid ${T.border}`, backgroundColor: T.surface, fontSize: FS.small, fontWeight: 700, color: T.text, cursor: "pointer", transition: "background-color 0.15s" }}>
                  Carregar mais ({filtered.length - visible} restantes)
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Zoom ──────────────────────────────────────────────────────────
          Era um <div> fixo sobre a página. Como o recurso central da tela, é o
          que mais sentia falta de ser um diálogo de verdade: o Tab passeava
          pelos cartões atrás do escurecido, o fundo continuava rolando com a
          roda do mouse, ao fechar o foco não voltava para o cartão de origem e
          nada anunciava a abertura para leitor de tela. O Dialog do app resolve
          os quatro de uma vez. */}
      <Dialog open={zoom != null} onOpenChange={o => { if (!o) setZoomIdx(null); }}>
        <DialogContent
          className="max-w-none p-0 gap-0 border-none bg-transparent shadow-none [&>button]:hidden"
          style={{ width: "96vw", maxWidth: 1280 }}
        >
          <DialogTitle className="sr-only">
            {zoom ? altOf(zoom) : "Registro"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Use as setas do teclado para percorrer os registros e Esc para fechar
          </DialogDescription>

          {zoom && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {zoomLoading && (
                  <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Loader2 className="animate-spin" style={{ width: 28, height: 28, color: "rgba(255,255,255,0.85)" }} />
                  </div>
                )}
                <img
                  src={srcOf(zoom)}
                  alt={altOf(zoom)}
                  onLoad={() => setZoomLoading(false)}
                  onError={() => setZoomLoading(false)}
                  data-testid="img-zoom"
                  style={{ maxWidth: "100%", maxHeight: "72vh", objectFit: "contain", borderRadius: R.md, backgroundColor: "#ffffff", boxShadow: SHADOW.lg, opacity: zoomLoading ? 0.4 : 1, transition: "opacity 0.15s" }}
                />

                {/* Setas dentro da moldura da imagem: fora dela, em tela larga,
                    ficavam a meio metro da foto. */}
                {zoomIdx! > 0 && (
                  <button onClick={() => stepZoom(-1)} title="Anterior (←)" aria-label="Registro anterior"
                    data-testid="button-zoom-prev"
                    style={{ position: "absolute", left: 12, width: 44, height: 44, borderRadius: R.pill, border: "none", backgroundColor: "rgba(28,25,23,0.55)", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <ChevronLeft style={{ width: 22, height: 22 }} />
                  </button>
                )}
                {zoomIdx! < filtered.length - 1 && (
                  <button onClick={() => stepZoom(1)} title="Próxima (→)" aria-label="Próximo registro"
                    data-testid="button-zoom-next"
                    style={{ position: "absolute", right: 12, width: 44, height: 44, borderRadius: R.pill, border: "none", backgroundColor: "rgba(28,25,23,0.55)", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <ChevronRight style={{ width: 22, height: 22 }} />
                  </button>
                )}
              </div>

              {/* Legenda + ações. flexWrap porque no celular três botões e o
                  texto não cabem lado a lado. */}
              <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap", color: "#ffffff" }}>
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
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  <span style={{ fontSize: FS.small, color: "rgba(255,255,255,0.8)", whiteSpace: "nowrap", marginRight: 4 }}>
                    {zoomIdx! + 1} / {filtered.length}
                  </span>
                  <button onClick={() => baixar(zoom)} disabled={baixando} className="hover:bg-white/25"
                    data-testid="button-zoom-download"
                    style={{ display: "flex", alignItems: "center", gap: 6, minHeight: 36, padding: "0 14px", borderRadius: R.md, border: "none", backgroundColor: "rgba(255,255,255,0.15)", color: "#ffffff", fontSize: FS.small, fontWeight: 700, cursor: baixando ? "wait" : "pointer", transition: "background-color 0.15s" }}>
                    {baixando
                      ? <><Loader2 className="animate-spin" style={{ width: 13, height: 13 }} /> Baixando…</>
                      : <><Download style={{ width: 13, height: 13 }} /> Baixar</>}
                  </button>
                  <a href={srcOf(zoom)} target="_blank" rel="noopener noreferrer" className="hover:bg-white/25"
                    style={{ display: "flex", alignItems: "center", gap: 6, minHeight: 36, padding: "0 14px", borderRadius: R.md, backgroundColor: "rgba(255,255,255,0.15)", color: "#ffffff", fontSize: FS.small, fontWeight: 700, textDecoration: "none", transition: "background-color 0.15s" }}>
                    <ExternalLink style={{ width: 13, height: 13 }} /> Original
                  </a>
                  <button onClick={() => setZoomIdx(null)} className="hover:bg-white/25" aria-label="Fechar"
                    style={{ display: "flex", alignItems: "center", gap: 6, minHeight: 36, padding: "0 14px", borderRadius: R.md, border: "none", backgroundColor: "rgba(255,255,255,0.15)", color: "#ffffff", fontSize: FS.small, fontWeight: 700, cursor: "pointer", transition: "background-color 0.15s" }}>
                    <X style={{ width: 13, height: 13 }} /> Fechar
                  </button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
