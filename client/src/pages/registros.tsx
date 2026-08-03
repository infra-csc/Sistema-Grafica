// Registros fotográficos da Gráfica — conferências e entregas de todas as peças.
// Fica fora da tela da Gráfica de propósito: a maioria dos perfis não tem acesso
// a ela, e este acervo interessa a todo mundo.
import { useMemo, useState, useEffect, useDeferredValue } from "react";
import { useQuery } from "@tanstack/react-query";
import { Camera, Truck, FileCheck, Search, X, ExternalLink, ChevronLeft, ChevronRight } from "lucide-react";
import { Link } from "wouter";
import { FilterSelect } from "@/components/filter-select";
import { convertGCSUrlToLocalPath } from "@/lib/artePdfExport";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const T = {
  bg: "#faf9f7", text: "#1c1917", muted: "#78716c", second: "#a8a29e",
  border: "#e7e5e4", accent: "#fd761a",
};

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
      if (e.key === "Escape") setZoomIdx(null);
      else if (e.key === "ArrowRight") stepZoom(1);
      else if (e.key === "ArrowLeft") stepZoom(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomIdx, filtered.length]);

  const fmt = (d: any) => (d ? format(new Date(d), "dd/MM/yy HH:mm", { locale: ptBR }) : "—");

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", backgroundColor: T.bg }}>
      {/* ── Cabeçalho ── */}
      <div style={{ flexShrink: 0, backgroundColor: "#ffffff", borderBottom: `1px solid ${T.border}`, padding: "20px 32px 0" }}>
        <div style={{ maxWidth: 1600, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: T.accent, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Camera style={{ width: 20, height: 20, color: "#ffffff" }} />
            </div>
            <div>
              <h1 style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, fontSize: 26, letterSpacing: "-0.03em", color: T.text, margin: 0 }}>
                Registros
              </h1>
              <p style={{ fontSize: 12, color: T.muted, margin: 0 }}>
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
                <button key={label}
                  onClick={() => { setKindFilter(kind && !active ? [kind] : []); setVisible(PAGE_SIZE); }}
                  data-testid={`stat-${kind ?? "total"}`}
                  title={kind ? `Ver só ${label.toLowerCase()}` : "Ver tudo"}
                  style={{ background: "none", border: "none", padding: 0, textAlign: "left", cursor: "pointer", opacity: active || kindFilter.length === 0 ? 1 : 0.45, transition: "opacity 0.15s" }}>
                  <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, fontSize: 24, color, margin: 0, lineHeight: 1 }}>{n}</p>
                  <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: T.second, margin: "4px 0 0", borderBottom: active && kind ? `2px solid ${color}` : "2px solid transparent", paddingBottom: 2 }}>{label}</p>
                </button>
              );
            })}
          </div>

          {/* Filtros */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", paddingBottom: 16 }}>
            <div style={{ position: "relative", flex: "1 1 260px", minWidth: 220 }}>
              <Search style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: T.second }} />
              <input
                value={search}
                onChange={e => { setSearch(e.target.value); setVisible(PAGE_SIZE); }}
                placeholder="Buscar peça, ID, evento ou quem recebeu…"
                data-testid="input-search-registros"
                style={{ width: "100%", height: 36, padding: "0 12px 0 34px", borderRadius: 8, border: `1px solid ${T.border}`, backgroundColor: "#ffffff", fontSize: 13, color: T.text, outline: "none" }}
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
            <div style={{ display: "flex", border: `1px solid ${T.border}`, borderRadius: 8, overflow: "hidden", backgroundColor: "#ffffff" }}>
              {PERIODS.map(p => (
                <button key={p}
                  onClick={() => { setPeriod(p); setVisible(PAGE_SIZE); }}
                  data-testid={`button-period-${p}`}
                  style={{
                    padding: "0 12px", height: 36, border: "none", cursor: "pointer",
                    backgroundColor: period === p ? T.text : "transparent",
                    color: period === p ? "#ffffff" : T.muted,
                    fontSize: 11, fontWeight: 700, whiteSpace: "nowrap",
                  }}>
                  {p}
                </button>
              ))}
            </div>
            {hasFilters && (
              <button onClick={clearAll} data-testid="button-clear-filters"
                style={{ fontSize: 11, fontWeight: 600, color: T.muted, background: "none", border: `1px solid ${T.border}`, borderRadius: 99, cursor: "pointer", padding: "5px 12px" }}>
                Limpar tudo
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Galeria ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "24px 32px", maxWidth: 1600, margin: "0 auto", width: "100%" }}>
        {isLoading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "48px 0" }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", border: `3px solid ${T.border}`, borderTopColor: T.accent, animation: "spin 0.8s linear infinite" }} />
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "64px 0", color: T.muted }}>
            <Camera style={{ width: 32, height: 32, color: T.second, marginBottom: 12 }} />
            <p style={{ fontSize: 14, fontWeight: 600, color: T.text, margin: "0 0 4px" }}>
              {photos.length === 0 ? "Nenhum registro ainda" : "Nenhum registro com esses filtros"}
            </p>
            <p style={{ fontSize: 12, margin: 0 }}>
              {photos.length === 0
                ? "As fotos aparecem aqui conforme a Gráfica confere e entrega as peças."
                : "Ajuste os filtros para ver outros registros."}
            </p>
          </div>
        ) : (
          <>
            <p style={{ fontSize: 11, color: T.muted, margin: "0 0 12px" }}>
              Exibindo <strong style={{ color: T.text }}>{Math.min(visible, filtered.length)}</strong> de{" "}
              <strong style={{ color: T.text }}>{filtered.length}</strong> registro{filtered.length !== 1 ? "s" : ""}
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16 }}>
              {filtered.slice(0, visible).map((p, idx) => {
                const k = KIND[kindOf(p)];
                const Icon = k.icon;
                const notes = kindOf(p) === "conference" ? p.conferenceNotes : p.deliveryNotes;
                return (
                  <div key={p.id} data-testid={`card-photo-${p.id}`}
                    style={{ backgroundColor: "#ffffff", border: `1px solid ${T.border}`, borderRadius: 10, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                    <button
                      onClick={() => setZoomIdx(idx)}
                      title="Ampliar"
                      style={{ display: "block", position: "relative", width: "100%", aspectRatio: "4/3", border: "none", padding: 0, backgroundColor: "#f4f3f0", cursor: "pointer" }}
                    >
                      {/* lazy: a grade carrega dezenas de fotos; sem isso o
                          navegador baixa todas de uma vez ao abrir a tela. */}
                      <img src={srcOf(p)} alt={k.label} loading="lazy" decoding="async"
                        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                        onError={e => {
                          const img = e.currentTarget as HTMLImageElement;
                          img.style.display = "none";
                          const box = img.parentElement;
                          if (box && !box.querySelector("[data-broken]")) {
                            const span = document.createElement("span");
                            span.setAttribute("data-broken", "1");
                            span.textContent = "Imagem indisponível";
                            span.style.cssText = "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:11px;color:#a8a29e";
                            box.appendChild(span);
                          }
                        }} />
                    </button>

                    <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", color: k.color, backgroundColor: k.bg, border: `1px solid ${k.border}`, borderRadius: 4, padding: "2px 6px" }}>
                          <Icon style={{ width: 9, height: 9 }} /> {k.label}
                        </span>
                        {p.displayId && (
                          <code style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 700, color: T.second }}>{p.displayId}</code>
                        )}
                      </div>

                      <p style={{ fontSize: 13, fontWeight: 700, color: T.text, margin: 0, lineHeight: 1.3 }}>
                        {p.itemType || "Peça removida"}
                        {p.itemDescription && <span style={{ fontWeight: 400, color: T.muted }}> — {p.itemDescription}</span>}
                      </p>
                      {/* Leva ao evento da peça — a pergunta seguinte a "vi a foto"
                          costuma ser "onde essa peça está". */}
                      {p.eventId ? (
                        <Link href={`/eventos/${p.eventId}`}
                          data-testid={`link-event-${p.id}`}
                          style={{ fontSize: 11, color: T.accent, margin: 0, textDecoration: "none", fontWeight: 600 }}>
                          {p.eventName || "Sem evento"}
                        </Link>
                      ) : (
                        <p style={{ fontSize: 11, color: T.muted, margin: 0 }}>Sem evento</p>
                      )}

                      {notes && (
                        <p style={{ fontSize: 11, color: "#584237", fontStyle: "italic", margin: 0, lineHeight: 1.4 }}>"{notes}"</p>
                      )}

                      <div style={{ marginTop: "auto", paddingTop: 6, borderTop: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", gap: 8 }}>
                        <span style={{ fontSize: 10, color: T.second }}>{fmt(p.createdAt)}</span>
                        <span style={{ fontSize: 10, color: T.second, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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
                <button onClick={() => setVisible(v => v + PAGE_SIZE)} data-testid="button-load-more"
                  style={{ padding: "10px 20px", borderRadius: 8, border: `1px solid ${T.border}`, backgroundColor: "#ffffff", fontSize: 12, fontWeight: 700, color: T.text, cursor: "pointer" }}>
                  Carregar mais ({filtered.length - visible} restantes)
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Zoom ── */}
      {zoom && (
        <div
          onClick={() => setZoomIdx(null)}
          style={{ position: "fixed", inset: 0, zIndex: 60, backgroundColor: "rgba(28,25,23,0.85)", display: "flex", alignItems: "center", justifyContent: "center", padding: 32, cursor: "zoom-out" }}
        >
          {/* Setas laterais — a galeria se percorre sem fechar e reabrir */}
          {zoomIdx! > 0 && (
            <button onClick={e => { e.stopPropagation(); stepZoom(-1); }} title="Anterior (←)"
              data-testid="button-zoom-prev"
              style={{ position: "absolute", left: 16, width: 44, height: 44, borderRadius: "50%", border: "none", backgroundColor: "rgba(255,255,255,0.15)", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <ChevronLeft style={{ width: 22, height: 22 }} />
            </button>
          )}
          {zoomIdx! < filtered.length - 1 && (
            <button onClick={e => { e.stopPropagation(); stepZoom(1); }} title="Próxima (→)"
              data-testid="button-zoom-next"
              style={{ position: "absolute", right: 16, width: 44, height: 44, borderRadius: "50%", border: "none", backgroundColor: "rgba(255,255,255,0.15)", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <ChevronRight style={{ width: 22, height: 22 }} />
            </button>
          )}

          <div onClick={e => e.stopPropagation()} style={{ maxWidth: "90vw", maxHeight: "90vh", display: "flex", flexDirection: "column", gap: 12, cursor: "default" }}>
            <img src={srcOf(zoom)} alt="Registro"
              style={{ maxWidth: "100%", maxHeight: "78vh", objectFit: "contain", borderRadius: 8, backgroundColor: "#ffffff" }} />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, color: "#ffffff" }}>
              <div>
                <p style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>
                  {zoom.displayId ? `${zoom.displayId} — ` : ""}{zoom.itemType || "Peça removida"}
                </p>
                <p style={{ fontSize: 12, opacity: 0.75, margin: 0 }}>
                  {KIND[kindOf(zoom)].label} · {zoom.eventName || "Sem evento"} · {fmt(zoom.createdAt)}
                  {zoom.uploadedBy && ` · por ${zoom.uploadedBy}`}
                </p>
                {(kindOf(zoom) === "conference" ? zoom.conferenceNotes : zoom.deliveryNotes) && (
                  <p style={{ fontSize: 12, opacity: 0.85, fontStyle: "italic", margin: "4px 0 0" }}>
                    "{kindOf(zoom) === "conference" ? zoom.conferenceNotes : zoom.deliveryNotes}"
                  </p>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 11, opacity: 0.6, whiteSpace: "nowrap" }}>
                  {zoomIdx! + 1} / {filtered.length}
                </span>
                <a href={srcOf(zoom)} target="_blank" rel="noopener noreferrer"
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, backgroundColor: "rgba(255,255,255,0.15)", color: "#ffffff", fontSize: 12, fontWeight: 700, textDecoration: "none" }}>
                  <ExternalLink style={{ width: 13, height: 13 }} /> Original
                </a>
                <button onClick={() => setZoomIdx(null)}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, border: "none", backgroundColor: "rgba(255,255,255,0.15)", color: "#ffffff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  <X style={{ width: 13, height: 13 }} /> Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
