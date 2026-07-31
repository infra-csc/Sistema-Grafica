// Registros fotográficos da Gráfica — conferências e entregas de todas as peças.
// Fica fora da tela da Gráfica de propósito: a maioria dos perfis não tem acesso
// a ela, e este acervo interessa a todo mundo. Hoje restrita a admin.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Camera, Truck, FileCheck, Search, X, ExternalLink } from "lucide-react";
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

export default function Registros() {
  const { data: photos = [], isLoading } = useQuery<any[]>({ queryKey: ["/api/photos"] });

  const [kindFilter, setKindFilter]   = useState<string[]>([]);
  const [eventFilter, setEventFilter] = useState<string[]>([]);
  const [search, setSearch]           = useState("");
  const [visible, setVisible]         = useState(PAGE_SIZE);
  const [zoom, setZoom]               = useState<any>(null);

  const kindOf = (p: any): Kind => (p.kind === "conference" ? "conference" : "delivery");
  // Registros antigos guardaram a URL assinada do GCS, que expira; o app serve
  // os arquivos por /objects/...
  const srcOf = (p: any) => convertGCSUrlToLocalPath(p.photoUrl || "");

  // Filtros facetados: cada um conta sobre o resultado dos outros.
  const passesKind   = (p: any) => !kindFilter.length  || kindFilter.includes(kindOf(p));
  const passesEvent  = (p: any) => !eventFilter.length || eventFilter.includes(p.eventId || "");
  const passesSearch = (p: any) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [p.displayId, p.itemType, p.itemDescription, p.eventName, p.receivedBy, p.uploadedBy]
      .some(v => (v || "").toLowerCase().includes(q));
  };

  const filtered = useMemo(
    () => photos.filter(p => passesKind(p) && passesEvent(p) && passesSearch(p)),
    [photos, kindFilter, eventFilter, search],
  );

  const kindOptions = useMemo(() => {
    const pool = photos.filter(p => passesEvent(p) && passesSearch(p));
    return (Object.keys(KIND) as Kind[]).map(k => ({
      value: k, label: KIND[k].label,
      count: pool.filter(p => kindOf(p) === k).length,
    })).filter(o => o.count > 0 || kindFilter.includes(o.value));
  }, [photos, eventFilter, search, kindFilter]);

  const eventOptions = useMemo(() => {
    const pool = photos.filter(p => passesKind(p) && passesSearch(p));
    const map = new Map<string, { value: string; label: string; count: number }>();
    pool.forEach(p => {
      const id = p.eventId || "";
      const entry = map.get(id);
      if (entry) entry.count++;
      else map.set(id, { value: id, label: p.eventName || "Sem evento", count: 1 });
    });
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }, [photos, kindFilter, search]);

  const counts = {
    total: photos.length,
    conference: photos.filter(p => kindOf(p) === "conference").length,
    delivery: photos.filter(p => kindOf(p) === "delivery").length,
  };

  const hasFilters = !!(kindFilter.length || eventFilter.length || search.trim());
  const clearAll = () => { setKindFilter([]); setEventFilter([]); setSearch(""); };

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

          {/* Contadores */}
          <div style={{ display: "flex", gap: 24, margin: "16px 0" }}>
            {([["Total", counts.total, T.text], ["Conferências", counts.conference, KIND.conference.color], ["Entregas", counts.delivery, KIND.delivery.color]] as const).map(([label, n, color]) => (
              <div key={label}>
                <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, fontSize: 24, color, margin: 0, lineHeight: 1 }}>{n}</p>
                <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: T.second, margin: "4px 0 0" }}>{label}</p>
              </div>
            ))}
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
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16 }}>
              {filtered.slice(0, visible).map(p => {
                const k = KIND[kindOf(p)];
                const Icon = k.icon;
                const notes = kindOf(p) === "conference" ? p.conferenceNotes : p.deliveryNotes;
                return (
                  <div key={p.id} data-testid={`card-photo-${p.id}`}
                    style={{ backgroundColor: "#ffffff", border: `1px solid ${T.border}`, borderRadius: 10, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                    <button
                      onClick={() => setZoom(p)}
                      title="Ampliar"
                      style={{ display: "block", width: "100%", aspectRatio: "4/3", border: "none", padding: 0, backgroundColor: "#f4f3f0", cursor: "pointer" }}
                    >
                      <img src={srcOf(p)} alt={k.label}
                        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                        onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
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
                      <p style={{ fontSize: 11, color: T.muted, margin: 0 }}>{p.eventName || "Sem evento"}</p>

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
          onClick={() => setZoom(null)}
          style={{ position: "fixed", inset: 0, zIndex: 60, backgroundColor: "rgba(28,25,23,0.85)", display: "flex", alignItems: "center", justifyContent: "center", padding: 32, cursor: "zoom-out" }}
        >
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
                </p>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <a href={srcOf(zoom)} target="_blank" rel="noopener noreferrer"
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, backgroundColor: "rgba(255,255,255,0.15)", color: "#ffffff", fontSize: 12, fontWeight: 700, textDecoration: "none" }}>
                  <ExternalLink style={{ width: 13, height: 13 }} /> Original
                </a>
                <button onClick={() => setZoom(null)}
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
