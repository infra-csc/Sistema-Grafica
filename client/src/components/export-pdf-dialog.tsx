// Modal de exportação de PDF compartilhado (Arte e Atendimento). Filtros
// facetados, seleção manual das peças e agrupamento por grupo/evento — tudo
// gerando o mesmo book via exportMixedToPDF.
import { useState, useMemo, useEffect } from "react";
import { Printer, X, FileText, FileImage, CheckCircle } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { FilterSelect } from "@/components/filter-select";
import { exportMixedToPDF, groupKeyOf, MAX_ITEMS_PER_COMBINED_PAGE, convertGCSUrlToLocalPath } from "@/lib/artePdfExport";

interface ExportPdfDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pool de peças exportáveis (com type, description, approvalThumbUrl, sponsors, eventId, event, displayId, status…). */
  items: any[];
  title?: string;
}

export function ExportPdfDialog({ open, onOpenChange, items, title = "Peças" }: ExportPdfDialogProps) {
  const [eventFilter, setEventFilter] = useState("all");
  const [sponsorFilter, setSponsorFilter] = useState("all");
  const [groupFilter, setGroupFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
  const [ungroupedKeys, setUngroupedKeys] = useState<Set<string>>(new Set());
  const [groupByEvent, setGroupByEvent] = useState(false);

  // Ao abrir, volta com tudo marcado e todos os grupos agrupados.
  useEffect(() => {
    if (open) { setExcludedIds(new Set()); setUngroupedKeys(new Set()); }
  }, [open]);

  const statusOf = (i: any): "pendente" | "aprovado" | "outro" =>
    i.status === "awaiting_sponsor_approval" ? "pendente"
      : ["sponsor_approved", "awaiting_creator_review"].includes(i.status) ? "aprovado"
      : "outro";

  // Aplica os filtros, podendo pular um deles (para as opções facetadas).
  const matches = (i: any, skip?: "event" | "sponsor" | "group" | "type" | "status") => {
    if (skip !== "event" && eventFilter !== "all" && i.eventId !== eventFilter) return false;
    if (skip !== "sponsor" && sponsorFilter !== "all" && !(i.sponsors ?? []).some((s: any) => s.id === sponsorFilter)) return false;
    if (skip !== "group" && groupFilter !== "all" && groupKeyOf(i) !== groupFilter) return false;
    if (skip !== "type" && typeFilter !== "all" && i.type !== typeFilter) return false;
    if (skip !== "status" && statusFilter !== "all" && statusOf(i) !== statusFilter) return false;
    return true;
  };

  const filtered = useMemo(() => items.filter(i => matches(i)),
    [items, eventFilter, sponsorFilter, groupFilter, typeFilter, statusFilter]);
  const selected = useMemo(() => filtered.filter(i => !excludedIds.has(i.id)), [filtered, excludedIds]);

  const facetDeps = [items, eventFilter, sponsorFilter, groupFilter, typeFilter, statusFilter];

  const countOpts = (skip: "event" | "sponsor" | "group" | "type", keyOf: (i: any) => { value: string; label: string } | null) => {
    const map = new Map<string, { value: string; label: string; count: number }>();
    items.forEach(i => {
      if (!matches(i, skip)) return;
      const k = keyOf(i);
      if (!k) return;
      const cur = map.get(k.value);
      if (cur) cur.count++; else map.set(k.value, { value: k.value, label: k.label, count: 1 });
    });
    return Array.from(map.values());
  };

  const eventOptions = useMemo(() => countOpts("event", i => i.eventId ? { value: i.eventId, label: i.event?.name || "Sem evento" } : null), facetDeps);
  const sponsorOptions = useMemo(() => {
    const map = new Map<string, { value: string; label: string; count: number }>();
    items.forEach(i => {
      if (!matches(i, "sponsor")) return;
      (i.sponsors ?? []).forEach((s: any) => {
        const cur = map.get(s.id);
        if (cur) cur.count++; else map.set(s.id, { value: s.id, label: s.name, count: 1 });
      });
    });
    return Array.from(map.values());
  }, facetDeps);
  const groupOptions = useMemo(() => countOpts("group", i => { const g = groupKeyOf(i); return g ? { value: g, label: g } : null; }), facetDeps);
  const typeOptions = useMemo(() => countOpts("type", i => i.type ? { value: i.type, label: i.type } : null), facetDeps);
  const statusOptions = useMemo(() => {
    let pend = 0, apr = 0;
    items.forEach(i => { if (!matches(i, "status")) return; const s = statusOf(i); if (s === "pendente") pend++; else if (s === "aprovado") apr++; });
    const opts: any[] = [];
    if (pend) opts.push({ value: "pendente", label: "Aguardando aprovação", count: pend, pinned: true });
    if (apr) opts.push({ value: "aprovado", label: "Aprovados pelo patrocinador", count: apr, pinned: true });
    return opts;
  }, facetDeps);

  const groupsInSelection = useMemo(() => {
    const map = new Map<string, number>();
    selected.forEach(i => { const k = groupKeyOf(i); map.set(k, (map.get(k) ?? 0) + 1); });
    return Array.from(map.entries()).map(([key, count]) => ({ key, count })).sort((a, b) => a.key.localeCompare(b.key, "pt-BR"));
  }, [selected]);
  const combinedSet = useMemo(() => new Set(groupsInSelection.map(g => g.key).filter(k => !ungroupedKeys.has(k))), [groupsInSelection, ungroupedKeys]);
  const eventCount = useMemo(() => new Set(selected.map(i => i.eventId || "__")).size, [selected]);

  const pageCount = useMemo(() => {
    const perEvent = new Map<string, Map<string, number>>();
    selected.forEach(i => {
      const ev = i.eventId || "__"; if (!perEvent.has(ev)) perEvent.set(ev, new Map());
      const g = groupKeyOf(i); const m = perEvent.get(ev)!; m.set(g, (m.get(g) ?? 0) + 1);
    });
    let total = 0;
    perEvent.forEach(groups => groups.forEach((count, key) => { total += combinedSet.has(key) ? Math.ceil(count / MAX_ITEMS_PER_COMBINED_PAGE) : count; }));
    if (groupByEvent && perEvent.size > 1) total += perEvent.size;
    return total;
  }, [selected, combinedSet, groupByEvent]);

  const hasFilters = eventFilter !== "all" || sponsorFilter !== "all" || groupFilter !== "all" || typeFilter !== "all" || statusFilter !== "all";
  const clearFilters = () => { setEventFilter("all"); setSponsorFilter("all"); setGroupFilter("all"); setTypeFilter("all"); setStatusFilter("all"); };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 gap-0" style={{ maxWidth: 960, width: "95vw", borderRadius: 14, backgroundColor: "#fff", border: "none", boxShadow: "0 24px 48px -12px rgba(28,25,23,0.18)" }}>
        <DialogTitle className="sr-only">Exportar PDF</DialogTitle>
        <DialogDescription className="sr-only">Filtros, seleção e opções antes de gerar o PDF</DialogDescription>

        <div style={{ padding: "24px 32px 18px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", background: "linear-gradient(135deg, #1c1917 0%, #292524 100%)", borderRadius: "14px 14px 0 0" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: "#7c3aed", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Printer style={{ width: 16, height: 16, color: "#fff" }} />
              </div>
              <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.04em", color: "#fff", margin: 0, fontFamily: '"Space Grotesk", sans-serif' }}>Exportar PDF</h2>
            </div>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", margin: 0, paddingLeft: 42 }}>Defina os filtros e opções antes de gerar o PDF</p>
          </div>
          <button onClick={() => onOpenChange(false)} style={{ padding: 8, backgroundColor: "rgba(255,255,255,0.1)", border: "none", borderRadius: "50%", cursor: "pointer", color: "rgba(255,255,255,0.7)", lineHeight: 1, flexShrink: 0 }}>
            <X style={{ width: 18, height: 18 }} />
          </button>
        </div>

        <div style={{ display: "flex", height: 540, overflow: "hidden" }}>
          {/* Painel esquerdo — filtros e opções */}
          <div style={{ width: 300, flexShrink: 0, borderRight: "1px solid #f0ede8", display: "flex", flexDirection: "column", backgroundColor: "#fafaf9" }}>
            <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
              <p style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.09em", color: "#78716c", margin: "0 0 10px" }}>Filtros</p>

              {[
                { lbl: "Evento", all: "Todos os eventos", v: eventFilter, on: setEventFilter, opts: eventOptions, ph: "Buscar evento..." },
                { lbl: "Patrocinador", all: "Todos os patrocinadores", v: sponsorFilter, on: setSponsorFilter, opts: sponsorOptions, ph: "Buscar patrocinador..." },
                { lbl: "Grupo pai", all: "Todos os grupos", v: groupFilter, on: (x: string) => { setGroupFilter(x); setTypeFilter("all"); }, opts: groupOptions, ph: "Buscar grupo..." },
                { lbl: "Tipo de peça", all: "Todos os tipos", v: typeFilter, on: setTypeFilter, opts: typeOptions, ph: "Buscar tipo..." },
                { lbl: "Status", all: "Todos os status", v: statusFilter, on: setStatusFilter, opts: statusOptions, ph: "Buscar status..." },
              ].map(f => (
                <div key={f.lbl} style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "#57534e", display: "block", marginBottom: 4 }}>{f.lbl}</label>
                  <FilterSelect fullWidth showAllLabelWhenEmpty hideWhenEmpty={false}
                    label={f.lbl} allLabel={f.all} value={f.v} onChange={f.on} options={f.opts}
                    searchPlaceholder={f.ph} emptyText="Nada encontrado." />
                </div>
              ))}

              <div style={{ borderTop: "1px solid #e7e5e4", margin: "8px 0 16px" }} />
              <p style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.09em", color: "#78716c", margin: "0 0 12px" }}>Opções do PDF</p>

              {/* Agrupar: várias peças por página, por grupo */}
              {groupsInSelection.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                    <p style={{ fontSize: 11, fontWeight: 700, color: "#57534e", margin: 0 }}>Várias peças por página</p>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <button onClick={() => setUngroupedKeys(new Set())} style={{ background: "none", border: "none", padding: 0, fontSize: 10, fontWeight: 700, color: "#7c3aed", cursor: "pointer" }}>Todos</button>
                      <span style={{ color: "#e7e5e4", fontSize: 10 }}>·</span>
                      <button onClick={() => setUngroupedKeys(new Set(groupsInSelection.map(g => g.key)))} style={{ background: "none", border: "none", padding: 0, fontSize: 10, fontWeight: 700, color: "#7c3aed", cursor: "pointer" }}>Nenhum</button>
                    </div>
                  </div>
                  <p style={{ fontSize: 10, color: "#a8a29e", margin: "0 0 8px" }}>Marque os grupos que devem sair juntos numa página. Os desmarcados saem uma peça por página.</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {groupsInSelection.map(g => {
                      const on = combinedSet.has(g.key);
                      return (
                        <div key={g.key} onClick={() => setUngroupedKeys(prev => { const n = new Set(prev); if (n.has(g.key)) n.delete(g.key); else n.add(g.key); return n; })}
                          style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 8, border: `1px solid ${on ? "#bfdbfe" : "#e7e5e4"}`, backgroundColor: on ? "#f0f9ff" : "#fff", cursor: "pointer" }}>
                          <div style={{ width: 16, height: 16, borderRadius: 4, border: `2px solid ${on ? "#2563eb" : "#d4d4d0"}`, backgroundColor: on ? "#2563eb" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            {on && <CheckCircle style={{ width: 9, height: 9, color: "#fff" }} />}
                          </div>
                          <span style={{ flex: 1, minWidth: 0, fontSize: 11, fontWeight: 700, color: "#1c1917", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.key}</span>
                          <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 600, color: "#a8a29e" }}>{g.count} {g.count === 1 ? "peça" : "peças"}</span>
                          <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 700, color: on ? "#2563eb" : "#78716c" }}>→ {on ? Math.ceil(g.count / MAX_ITEMS_PER_COMBINED_PAGE) : g.count} pág.</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {eventCount > 1 && (
                <div onClick={() => setGroupByEvent(!groupByEvent)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8, border: `1px solid ${groupByEvent ? "#bfdbfe" : "#e7e5e4"}`, backgroundColor: groupByEvent ? "#f0f9ff" : "#fff", cursor: "pointer", marginBottom: 8 }}>
                  <div style={{ width: 18, height: 18, borderRadius: 5, border: `2px solid ${groupByEvent ? "#2563eb" : "#d4d4d0"}`, backgroundColor: groupByEvent ? "#2563eb" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    {groupByEvent && <CheckCircle style={{ width: 10, height: 10, color: "#fff" }} />}
                  </div>
                  <div>
                    <p style={{ fontSize: 12, fontWeight: 700, color: "#1c1917", margin: 0 }}>Página divisória por evento</p>
                    <p style={{ fontSize: 10, color: "#a8a29e", margin: 0 }}>Abre cada um dos {eventCount} eventos com uma capa</p>
                  </div>
                </div>
              )}

              {hasFilters && (
                <button onClick={clearFilters} style={{ width: "100%", height: 30, borderRadius: 6, background: "none", border: "1px solid #e7e5e4", color: "#a8a29e", cursor: "pointer", fontSize: 11, fontWeight: 600, marginTop: 4 }}>Limpar filtros</button>
              )}
            </div>

            <div style={{ padding: "16px 20px", borderTop: "1px solid #f0ede8", display: "flex", flexDirection: "column", gap: 8 }}>
              {selected.some(i => i.bookUrl) && (
                <p style={{ fontSize: 10, color: "#6d28d9", backgroundColor: "#f5f3ff", border: "1px solid #ddd6fe", borderRadius: 6, padding: "6px 8px", margin: 0 }}>
                  {selected.filter(i => i.bookUrl).length} peça(s) já têm book da Arte — o PDF do book abre junto; o restante sai no PDF gerado.
                </p>
              )}
              <button onClick={() => onOpenChange(false)} style={{ width: "100%", height: 36, borderRadius: 8, background: "#f5f5f4", border: "1px solid #e7e5e4", color: "#78716c", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>Cancelar</button>
              <button
                onClick={() => {
                  // Peças cobertas por um book (PDF pronto subido pela Arte) usam o
                  // próprio book; as demais saem no PDF gerado automaticamente.
                  const withBook = selected.filter(i => i.bookUrl);
                  const withoutBook = selected.filter(i => !i.bookUrl);
                  const bookUrls = Array.from(new Set(withBook.map(i => i.bookUrl as string)));
                  bookUrls.forEach(url => window.open(url, "_blank", "noopener,noreferrer"));
                  if (withoutBook.length > 0) {
                    void exportMixedToPDF(withoutBook, combinedSet, `${title} — ${withoutBook.length} peça(s)`, groupByEvent);
                  }
                  onOpenChange(false);
                }}
                disabled={selected.length === 0}
                data-testid="button-export-confirm"
                style={{ width: "100%", height: 44, borderRadius: 8, backgroundColor: selected.length === 0 ? "#e7e5e4" : "#7c3aed", border: "none", color: selected.length === 0 ? "#a8a29e" : "#fff", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, cursor: selected.length === 0 ? "not-allowed" : "pointer" }}>
                <Printer style={{ width: 14, height: 14 }} />
                Gerar PDF — {selected.length} {selected.length === 1 ? "peça" : "peças"}{pageCount > 0 && ` · ${pageCount} pág.`}
              </button>
            </div>
          </div>

          {/* Painel direito — lista com seleção manual */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {filtered.length === 0 ? (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
                <div style={{ width: 64, height: 64, borderRadius: 16, backgroundColor: "#f3f4f3", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <FileText style={{ width: 28, height: 28, color: "#d4d4d0" }} />
                </div>
                <p style={{ fontSize: 13, fontWeight: 600, color: "#a8a29e", margin: 0 }}>Nenhum item encontrado</p>
                <p style={{ fontSize: 11, color: "#d4d4d0", margin: 0, textAlign: "center", maxWidth: 220 }}>Ajuste os filtros à esquerda</p>
              </div>
            ) : (
              <>
                <div style={{ padding: "14px 24px 10px", borderBottom: "1px solid #f0ede8", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexShrink: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#78716c", whiteSpace: "nowrap" }}>{selected.length} de {filtered.length} {filtered.length === 1 ? "peça" : "peças"}</span>
                    <button onClick={() => setExcludedIds(new Set())} disabled={selected.length === filtered.length} style={{ background: "none", border: "none", padding: 0, fontSize: 11, fontWeight: 700, cursor: selected.length === filtered.length ? "default" : "pointer", color: selected.length === filtered.length ? "#d4d4d0" : "#7c3aed" }}>Todas</button>
                    <span style={{ color: "#e7e5e4" }}>·</span>
                    <button onClick={() => setExcludedIds(new Set(filtered.map(i => i.id)))} disabled={selected.length === 0} style={{ background: "none", border: "none", padding: 0, fontSize: 11, fontWeight: 700, cursor: selected.length === 0 ? "default" : "pointer", color: selected.length === 0 ? "#d4d4d0" : "#7c3aed" }}>Nenhuma</button>
                  </div>
                  <span style={{ fontSize: 10, color: "#a8a29e", whiteSpace: "nowrap" }}>{selected.filter(i => i.approvalThumbUrl).length} com thumb · {selected.filter(i => !i.approvalThumbUrl).length} sem thumb</span>
                </div>
                <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
                  {filtered.map((item: any) => {
                    const hasThumb = !!item.approvalThumbUrl;
                    const thumbSrc = hasThumb ? convertGCSUrlToLocalPath(item.approvalThumbUrl) : null;
                    const picked = !excludedIds.has(item.id);
                    return (
                      <div key={item.id}
                        onClick={() => setExcludedIds(prev => { const n = new Set(prev); if (n.has(item.id)) n.delete(item.id); else n.add(item.id); return n; })}
                        style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 10, border: `1px solid ${picked ? "#f0ede8" : "#e7e5e4"}`, backgroundColor: picked ? "#fff" : "#fafaf9", opacity: picked ? 1 : 0.55, cursor: "pointer" }}>
                        <div style={{ width: 18, height: 18, borderRadius: 5, flexShrink: 0, border: `2px solid ${picked ? "#7c3aed" : "#d4d4d0"}`, backgroundColor: picked ? "#7c3aed" : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {picked && <CheckCircle style={{ width: 10, height: 10, color: "#fff" }} />}
                        </div>
                        <div style={{ width: 52, height: 52, borderRadius: 8, overflow: "hidden", flexShrink: 0, border: "1px solid rgba(0,0,0,0.06)", backgroundColor: "#f3f4f3", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {hasThumb && thumbSrc ? <img src={thumbSrc} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} /> : <FileImage style={{ width: 18, height: 18, color: "#d4d4d0" }} />}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                            <span style={{ fontSize: 11, fontWeight: 800, color: "#7c3aed", fontFamily: "monospace" }}>{item.displayId}</span>
                            <span style={{ fontSize: 11, fontWeight: 600, color: "#1c1917", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.type}</span>
                          </div>
                          <div style={{ fontSize: 10, color: "#78716c", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.event?.name || ""}{item.description ? ` · ${item.description}` : ""}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
