// Modal de exportação de PDF compartilhado (Arte e Atendimento). Filtros
// facetados, seleção manual das peças e agrupamento por grupo/evento — tudo
// gerando o mesmo book via exportMixedToPDF.
import { useState, useMemo, useEffect } from "react";
import { Printer, X, FileText, FileImage, CheckCircle, SlidersHorizontal, BookOpen } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { FilterSelect } from "@/components/filter-select";
import { exportMixedToPDF, groupKeyOf, MAX_ITEMS_PER_COMBINED_PAGE, convertGCSUrlToLocalPath } from "@/lib/artePdfExport";

interface ExportPdfDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: any[];
  title?: string;
}

export function ExportPdfDialog({ open, onOpenChange, items, title = "Peças" }: ExportPdfDialogProps) {
  const [eventFilter, setEventFilter]   = useState("all");
  const [sponsorFilter, setSponsorFilter] = useState("all");
  const [groupFilter, setGroupFilter]   = useState("all");
  const [typeFilter, setTypeFilter]     = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [excludedIds, setExcludedIds]   = useState<Set<string>>(new Set());
  const [ungroupedKeys, setUngroupedKeys] = useState<Set<string>>(new Set());
  const [groupByEvent, setGroupByEvent] = useState(false);
  // O book é um PDF único do evento (dezenas de páginas) e o app nunca guardou
  // qual página cobre qual peça, então "Abrir Books" só sabe abrir o arquivo
  // inteiro. Quando o usuário filtra por patrocinador, isso devolve o book cheio
  // — não dá para recortar. Com este interruptor as peças ignoram o book e saem
  // pelo "Gerar PDF", que desenha uma página por peça a partir do thumb: é a
  // única forma de obter só as peças filtradas em um arquivo.
  const [ignoreBook, setIgnoreBook] = useState(false);

  useEffect(() => {
    if (open) { setExcludedIds(new Set()); setUngroupedKeys(new Set()); setIgnoreBook(false); }
  }, [open]);

  const APPROVED_STATUSES = [
    "sponsor_approved","awaiting_creator_review","awaiting_final_review",
    "ready_for_production","approved","pronto_para_producao","liberado",
    "inProduction","em_producao","produced","produzido","conferred","delivered","entregue",
  ];
  const statusOf = (i: any): "pendente" | "aprovado" | "outro" =>
    i.status === "awaiting_sponsor_approval" ? "pendente"
      : APPROVED_STATUSES.includes(i.status) ? "aprovado" : "outro";

  const matches = (i: any, skip?: "event"|"sponsor"|"group"|"type"|"status") => {
    if (skip !== "event"   && eventFilter   !== "all" && i.eventId !== eventFilter) return false;
    if (skip !== "sponsor" && sponsorFilter !== "all" && !(i.sponsors ?? []).some((s: any) => s.id === sponsorFilter)) return false;
    if (skip !== "group"   && groupFilter   !== "all" && groupKeyOf(i) !== groupFilter) return false;
    if (skip !== "type"    && typeFilter    !== "all" && i.type !== typeFilter) return false;
    if (skip !== "status"  && statusFilter  !== "all" && statusOf(i) !== statusFilter) return false;
    return true;
  };

  const filtered = useMemo(() => items.filter(i => matches(i)),
    [items, eventFilter, sponsorFilter, groupFilter, typeFilter, statusFilter]);
  const selected = useMemo(() => filtered.filter(i => !excludedIds.has(i.id)), [filtered, excludedIds]);
  const facetDeps = [items, eventFilter, sponsorFilter, groupFilter, typeFilter, statusFilter];

  const countOpts = (skip: "event"|"sponsor"|"group"|"type", keyOf: (i: any) => {value:string;label:string}|null) => {
    const map = new Map<string,{value:string;label:string;count:number}>();
    items.forEach(i => {
      if (!matches(i, skip)) return;
      const k = keyOf(i); if (!k) return;
      const cur = map.get(k.value);
      if (cur) cur.count++; else map.set(k.value, { value: k.value, label: k.label, count: 1 });
    });
    return Array.from(map.values());
  };

  const eventOptions   = useMemo(() => countOpts("event",   i => i.eventId ? { value: i.eventId, label: i.event?.name || "Sem evento" } : null), facetDeps);
  const sponsorOptions = useMemo(() => {
    const map = new Map<string,{value:string;label:string;count:number}>();
    items.forEach(i => {
      if (!matches(i, "sponsor")) return;
      (i.sponsors ?? []).forEach((s: any) => {
        const cur = map.get(s.id);
        if (cur) cur.count++; else map.set(s.id, { value: s.id, label: s.name, count: 1 });
      });
    });
    return Array.from(map.values());
  }, facetDeps);
  const groupOptions  = useMemo(() => countOpts("group",  i => { const g = groupKeyOf(i); return g ? { value: g, label: g } : null; }), facetDeps);
  const typeOptions   = useMemo(() => countOpts("type",   i => i.type ? { value: i.type, label: i.type } : null), facetDeps);
  const statusOptions = useMemo(() => {
    let pend = 0, apr = 0;
    items.forEach(i => { if (!matches(i, "status")) return; const s = statusOf(i); if (s === "pendente") pend++; else if (s === "aprovado") apr++; });
    const opts: any[] = [];
    if (pend) opts.push({ value: "pendente", label: "Aguardando aprovação", count: pend, pinned: true });
    if (apr)  opts.push({ value: "aprovado", label: "Aprovados", count: apr, pinned: true });
    return opts;
  }, facetDeps);

  const groupsInSelection = useMemo(() => {
    const map = new Map<string,number>();
    selected.forEach(i => { const k = groupKeyOf(i); map.set(k, (map.get(k) ?? 0) + 1); });
    return Array.from(map.entries()).map(([key, count]) => ({ key, count })).sort((a, b) => a.key.localeCompare(b.key, "pt-BR"));
  }, [selected]);
  const combinedSet = useMemo(() => new Set(groupsInSelection.map(g => g.key).filter(k => !ungroupedKeys.has(k))), [groupsInSelection, ungroupedKeys]);
  const eventCount  = useMemo(() => new Set(selected.map(i => i.eventId || "__")).size, [selected]);

  const hasFilters = eventFilter !== "all" || sponsorFilter !== "all" || groupFilter !== "all" || typeFilter !== "all" || statusFilter !== "all";
  const clearFilters = () => { setEventFilter("all"); setSponsorFilter("all"); setGroupFilter("all"); setTypeFilter("all"); setStatusFilter("all"); };
  const activeFilterCount = [eventFilter, sponsorFilter, groupFilter, typeFilter, statusFilter].filter(v => v !== "all").length;

  // "Abrir Book" abre o PDF bruto do book — não há como extrair só algumas
  // páginas dele, porque o app nunca guardou qual página cobre qual peça. Se o
  // usuário seleciona só parte das peças de um book e o botão abrisse o PDF
  // mesmo assim, ele sempre veria o book inteiro: era exatamente o "não
  // consigo dividir as peças, sempre vem o book cheio" relatado.
  //
  // A correção não tenta separar páginas de um PDF existente (isso exigiria
  // guardar página por peça desde o upload do book, uma mudança bem maior).
  // Em vez disso, uma peça só entra no grupo "book" quando TODAS as peças do
  // mesmo book (dentro do pool que este modal recebeu) estão selecionadas —
  // aí sim o PDF corresponde exatamente ao que a tela está pedindo. Quando a
  // seleção é parcial, a peça sai do grupo "book" e cai no "Gerar PDF", que já
  // desenha uma página por peça a partir do thumb: é isso que "divide" as
  // peças na prática, sem precisar mexer no PDF já enviado.
  const bookUrlFullySelected = useMemo(() => {
    const poolByBook = new Map<string, Set<string>>();
    items.forEach(i => {
      if (!i.bookUrl) return;
      if (!poolByBook.has(i.bookUrl)) poolByBook.set(i.bookUrl, new Set());
      poolByBook.get(i.bookUrl)!.add(i.id);
    });
    const selectedIds = new Set(selected.map(i => i.id));
    const full = new Set<string>();
    poolByBook.forEach((ids, url) => {
      if (Array.from(ids).every(id => selectedIds.has(id))) full.add(url);
    });
    return full;
  }, [items, selected]);
  const isFullBookItem = (i: any) => !ignoreBook && !!i.bookUrl && bookUrlFullySelected.has(i.bookUrl);

  const nBook = selected.filter(isFullBookItem).length;
  const hasBook = nBook > 0;
  const allBook = hasBook && nBook === selected.length;
  const anyBook = selected.some(i => !!i.bookUrl);

  // Só as peças que realmente entram no "Gerar PDF" contam páginas. Antes o
  // cálculo varria toda a seleção e o botão dizia coisas como "1 peça · 6 pág.",
  // porque as 7 que abriam o book continuavam somando página.
  const pageCount = useMemo(() => {
    const perEvent = new Map<string,Map<string,number>>();
    selected.filter(i => !isFullBookItem(i)).forEach(i => {
      const ev = i.eventId || "__"; if (!perEvent.has(ev)) perEvent.set(ev, new Map());
      const g = groupKeyOf(i); const m = perEvent.get(ev)!; m.set(g, (m.get(g) ?? 0) + 1);
    });
    let total = 0;
    perEvent.forEach(groups => groups.forEach((count, key) => { total += combinedSet.has(key) ? Math.ceil(count / MAX_ITEMS_PER_COMBINED_PAGE) : count; }));
    if (groupByEvent && perEvent.size > 1) total += perEvent.size;
    return total;
  }, [selected, combinedSet, groupByEvent, bookUrlFullySelected, ignoreBook]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="p-0 gap-0"
        style={{
          maxWidth: 1080, width: "96vw",
          borderRadius: 16,
          backgroundColor: "#fff",
          border: "none",
          boxShadow: "0 32px 64px -16px rgba(0,0,0,0.28), 0 0 0 1px rgba(0,0,0,0.05)",
          overflow: "hidden",
        }}
      >
        <DialogTitle className="sr-only">Exportar PDF</DialogTitle>
        <DialogDescription className="sr-only">Filtros, seleção e opções antes de gerar o PDF</DialogDescription>

        {/* ══ Header ══════════════════════════════════════════════════════ */}
        <div style={{
          padding: "22px 32px",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          background: "linear-gradient(135deg, #1c1917 0%, #2d2926 100%)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: allBook ? "#2563eb" : "#7c3aed", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "0 0 0 1px rgba(255,255,255,0.12) inset", transition: "background-color 0.2s" }}>
              {allBook ? <BookOpen style={{ width: 18, height: 18, color: "#fff" }} /> : <Printer style={{ width: 18, height: 18, color: "#fff" }} />}
            </div>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.03em", color: "#fff", margin: 0, lineHeight: 1.2 }}>
                {allBook ? "Exportar Book" : "Exportar PDF"}
              </h2>
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", margin: "3px 0 0" }}>
                {allBook
                  ? "Todas as peças possuem book — o arquivo já está pronto para download"
                  : "Selecione as peças, aplique filtros e configure o layout do arquivo"}
              </p>
            </div>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            style={{ width: 40, height: 40, borderRadius: "50%", backgroundColor: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", cursor: "pointer", color: "rgba(255,255,255,0.7)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>

        {/* ══ Body ═══════════════════════════════════════════════════════
            overflow visible: mesma causa do painel direito logo abaixo — este
            era o segundo ancestral com overflow:hidden entre o dropdown de
            filtro e a borda do modal. A altura fixa (580) não depende do
            overflow para funcionar; só o overflow:hidden do DialogContent (que
            faz a máscara dos cantos arredondados) precisa continuar como está. */}
        <div style={{ display: "flex", height: 580, overflow: "visible" }}>

          {/* ── Painel esquerdo — Opções do PDF ─────────────────────────── */}
          <div style={{
            width: 300, flexShrink: 0,
            borderRight: "1px solid #ebe8e4",
            display: "flex", flexDirection: "column",
            backgroundColor: "#fafaf9",
          }}>
            {/* Título da seção */}
            <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #ebe8e4" }}>
              <p style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", color: "#a8a29e", margin: 0 }}>
                {allBook ? "Opções do Book" : "Opções do PDF"}
              </p>
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>

              {/* Várias peças por página */}
              {groupsInSelection.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: "#292524", margin: 0 }}>Peças por página</p>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => setUngroupedKeys(new Set())} style={{ background: "none", border: "none", padding: 0, fontSize: 11, fontWeight: 700, color: "#7c3aed", cursor: "pointer" }}>Todos</button>
                      <span style={{ color: "#d4d0ca", fontSize: 11 }}>·</span>
                      <button onClick={() => setUngroupedKeys(new Set(groupsInSelection.map(g => g.key)))} style={{ background: "none", border: "none", padding: 0, fontSize: 11, fontWeight: 700, color: "#7c3aed", cursor: "pointer" }}>Nenhum</button>
                    </div>
                  </div>
                  <p style={{ fontSize: 11, color: "#78716c", margin: "0 0 12px", lineHeight: 1.5 }}>
                    Grupos marcados saem juntos numa página. Desmarcados, uma peça por página.
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    {groupsInSelection.map(g => {
                      const on = combinedSet.has(g.key);
                      return (
                        <div
                          key={g.key}
                          onClick={() => setUngroupedKeys(prev => { const n = new Set(prev); if (n.has(g.key)) n.delete(g.key); else n.add(g.key); return n; })}
                          style={{
                            display: "flex", alignItems: "center", gap: 10,
                            padding: "9px 12px", borderRadius: 8,
                            border: `1px solid ${on ? "#ddd6fe" : "#e4e0db"}`,
                            backgroundColor: on ? "#f5f3ff" : "#fff",
                            cursor: "pointer", transition: "background 0.1s",
                          }}
                        >
                          <div style={{ width: 18, height: 18, borderRadius: 5, flexShrink: 0, border: `2px solid ${on ? "#7c3aed" : "#d4d0ca"}`, backgroundColor: on ? "#7c3aed" : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            {on && <CheckCircle style={{ width: 10, height: 10, color: "#fff" }} />}
                          </div>
                          <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600, color: "#1c1917", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textTransform: "capitalize" }}>{g.key}</span>
                          <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, color: on ? "#7c3aed" : "#a8a29e" }}>
                            {on ? Math.ceil(g.count / MAX_ITEMS_PER_COMBINED_PAGE) : g.count} pág.
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Divisória por evento */}
              {eventCount > 1 && (
                <div style={{ marginBottom: 24 }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: "#292524", margin: "0 0 10px" }}>Divisória de eventos</p>
                  <div
                    onClick={() => setGroupByEvent(!groupByEvent)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "10px 12px", borderRadius: 8,
                      border: `1px solid ${groupByEvent ? "#ddd6fe" : "#e4e0db"}`,
                      backgroundColor: groupByEvent ? "#f5f3ff" : "#fff",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ width: 18, height: 18, borderRadius: 5, flexShrink: 0, border: `2px solid ${groupByEvent ? "#7c3aed" : "#d4d0ca"}`, backgroundColor: groupByEvent ? "#7c3aed" : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {groupByEvent && <CheckCircle style={{ width: 10, height: 10, color: "#fff" }} />}
                    </div>
                    <div>
                      <p style={{ fontSize: 12, fontWeight: 600, color: "#1c1917", margin: 0 }}>Página de capa por evento</p>
                      <p style={{ fontSize: 11, color: "#78716c", margin: 0 }}>{eventCount} eventos no PDF</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Book info — a seção aparece sempre que houver book na seleção,
                  inclusive com "Ignorar book" ligado: senão o interruptor sumiria
                  junto com o painel e não haveria como voltar atrás. */}
              {anyBook && (
                <div style={{ marginBottom: 8 }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: "#292524", margin: "0 0 10px" }}>Arquivo book</p>
                  {hasBook && (
                    <div style={{ backgroundColor: "#f5f3ff", border: "1px solid #ddd6fe", borderRadius: 10, padding: "12px 14px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                        <div style={{ width: 28, height: 28, borderRadius: 7, backgroundColor: "#ede9fe", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <BookOpen style={{ width: 13, height: 13, color: "#7c3aed" }} />
                        </div>
                        <p style={{ fontSize: 13, fontWeight: 800, color: "#5b21b6", margin: 0 }}>
                          {allBook ? "Todas as peças" : `${nBook} de ${selected.length} peças`}
                        </p>
                      </div>
                      <div style={{ height: 4, borderRadius: 999, backgroundColor: "#ddd6fe", overflow: "hidden", marginBottom: 8 }}>
                        <div style={{ height: "100%", width: `${Math.round((nBook / selected.length) * 100)}%`, backgroundColor: "#7c3aed", borderRadius: 999 }} />
                      </div>
                      <p style={{ fontSize: 11, color: "#6d28d9", margin: 0, lineHeight: 1.5 }}>
                        {allBook
                          ? "Todas cobertas pelo book da Arte. O PDF abre pronto."
                          : `${nBook} ${nBook === 1 ? "abre" : "abrem"} o book pronto. As outras ${selected.length - nBook} são geradas.`}
                      </p>
                    </div>
                  )}

                  {/* O book é o PDF do evento inteiro e não tem como recortar
                      páginas por peça. Sem este interruptor, filtrar por um
                      patrocinador ainda entregava o book cheio e não havia saída
                      alguma para obter só as peças filtradas. */}
                  <button
                    onClick={() => setIgnoreBook(v => !v)}
                    data-testid="toggle-ignore-book"
                    style={{
                      marginTop: hasBook ? 8 : 0, width: "100%", textAlign: "left",
                      display: "flex", alignItems: "flex-start", gap: 10,
                      padding: "10px 12px", borderRadius: 10, cursor: "pointer",
                      border: `1px solid ${ignoreBook ? "#fdba74" : "#ebe8e4"}`,
                      backgroundColor: ignoreBook ? "#fff7ed" : "#fafaf9",
                      transition: "background-color 0.12s, border-color 0.12s",
                    }}
                  >
                    <div style={{ width: 18, height: 18, borderRadius: 5, flexShrink: 0, marginTop: 1, display: "flex", alignItems: "center", justifyContent: "center", border: `2px solid ${ignoreBook ? "#c2410c" : "#d4d0ca"}`, backgroundColor: ignoreBook ? "#c2410c" : "transparent" }}>
                      {ignoreBook && <CheckCircle style={{ width: 9, height: 9, color: "#fff" }} />}
                    </div>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 12, fontWeight: 700, color: ignoreBook ? "#7c2d12" : "#292524" }}>
                        Ignorar book
                      </span>
                      <span style={{ display: "block", fontSize: 11, color: "#57534e", lineHeight: 1.5, marginTop: 2 }}>
                        O book é um PDF único do evento e não pode ser dividido por peça.
                        Marque para gerar um PDF só com as peças selecionadas aqui.
                      </span>
                    </span>
                  </button>
                </div>
              )}

              {/* Empty state */}
              {groupsInSelection.length === 0 && eventCount <= 1 && !hasBook && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px 0", gap: 10, color: "#a8a29e" }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: "#f5f5f4", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <FileText style={{ width: 20, height: 20, color: "#d4d0ca" }} />
                  </div>
                  <p style={{ fontSize: 12, color: "#c4c0ba", margin: 0, textAlign: "center" }}>
                    Selecione peças ao lado para configurar o layout
                  </p>
                </div>
              )}
            </div>

            {/* Rodapé */}
            <div style={{ padding: "16px 24px", borderTop: "1px solid #ebe8e4", display: "flex", flexDirection: "column", gap: 8 }}>
              {/* Sem esta linha, o topo dizia "1326 de 1326 peças" e o botão
                  "Gerar PDF — 649 peças": dois números contraditórios na mesma
                  tela, e nada explicando que as demais já têm book pronto e por
                  isso saem pelo outro botão, não no PDF gerado. */}
              {hasBook && !allBook && selected.length > 0 && (
                <p style={{ fontSize: 11, color: "#57534e", margin: "0 0 4px", lineHeight: 1.5, background: "#fafaf9", border: "1px solid #ebe8e4", borderRadius: 8, padding: "8px 10px" }}>
                  Das <strong style={{ color: "#1c1917" }}>{selected.length}</strong> peças selecionadas,{" "}
                  <strong style={{ color: "#1c1917" }}>{selected.filter(isFullBookItem).length}</strong> já têm book pronto
                  (abrem em nova aba) e <strong style={{ color: "#1c1917" }}>{selected.filter(i => !isFullBookItem(i)).length}</strong> entram no PDF gerado.
                </p>
              )}
              <button
                onClick={() => onOpenChange(false)}
                style={{ width: "100%", height: 40, borderRadius: 8, background: "#fff", border: "1px solid #e4e0db", color: "#78716c", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                Cancelar
              </button>

              {/* Quando há books: mostrar botão "Abrir Book" separado */}
              {hasBook && (
                <button
                  onClick={() => {
                    const bookUrls = Array.from(new Set(selected.filter(isFullBookItem).map(i => i.bookUrl as string)));
                    bookUrls.forEach(url => window.open(url, "_blank", "noopener,noreferrer"));
                    if (allBook) onOpenChange(false);
                  }}
                  disabled={selected.length === 0}
                  data-testid="button-export-book"
                  style={{
                    width: "100%", height: allBook ? 46 : 38, borderRadius: 10,
                    // Roxo é a cor de "book" no app (o badge Book na lista da Arte
                    // usa a mesma família). Este botão era azul, uma terceira cor
                    // sem significado dentro do mesmo modal.
                    backgroundColor: selected.length === 0 ? "#e7e5e4" : "#6d28d9",
                    border: "none",
                    color: selected.length === 0 ? "#57534e" : "#fff",
                    fontSize: allBook ? 13 : 12, fontWeight: 800,
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                    cursor: selected.length === 0 ? "not-allowed" : "pointer",
                    letterSpacing: "-0.01em",
                    boxShadow: selected.length > 0 ? "0 2px 8px rgba(109,40,217,0.28)" : "none",
                  }}>
                  <BookOpen style={{ width: 15, height: 15 }} />
                  {allBook
                    ? `Abrir Book${selected.filter(isFullBookItem).length > 1 ? "s" : ""} — ${selected.filter(isFullBookItem).length} ${selected.filter(isFullBookItem).length === 1 ? "peça" : "peças"}`
                    : `Abrir Books (${selected.filter(isFullBookItem).length} com book)`}
                </button>
              )}

              {/* Gerar PDF apenas se houver itens SEM book */}
              {!allBook && (
                <button
                  onClick={() => {
                    const withoutBook = selected.filter(i => !isFullBookItem(i));
                    if (withoutBook.length > 0) void exportMixedToPDF(withoutBook, combinedSet, `${title} — ${withoutBook.length} peça(s)`, groupByEvent);
                    onOpenChange(false);
                  }}
                  disabled={selected.filter(i => !isFullBookItem(i)).length === 0}
                  data-testid="button-export-confirm"
                  style={{
                    width: "100%", height: 46, borderRadius: 10,
                    // Ação primária do modal usa o laranja de ação do app, como os
                    // botões primários das listas. O roxo fica reservado ao botão
                    // de book, onde a cor tem significado.
                    backgroundColor: selected.filter(i => !isFullBookItem(i)).length === 0 ? "#e7e5e4" : "#c2410c",
                    border: "none",
                    color: selected.filter(i => !isFullBookItem(i)).length === 0 ? "#57534e" : "#fff",
                    fontSize: 13, fontWeight: 800,
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                    cursor: selected.filter(i => !isFullBookItem(i)).length === 0 ? "not-allowed" : "pointer",
                    letterSpacing: "-0.01em",
                  }}>
                  <Printer style={{ width: 15, height: 15 }} />
                  {(() => {
                    const n = selected.filter(i => !isFullBookItem(i)).length;
                    return `Gerar PDF${n > 0 ? ` — ${n} ${n === 1 ? "peça" : "peças"}${pageCount > 0 ? ` · ${pageCount} pág.` : ""}` : ""}`;
                  })()}
                </button>
              )}
            </div>
          </div>

          {/* ── Painel direito — filtros + lista ──────────────────────────
              overflow visible: com "hidden" aqui, o painel dos filtros era
              recortado na borda do painel (o z-index não ajuda contra o clip de
              um ancestral). A lista continua rolando por conta própria — o que
              faz isso funcionar é o minHeight 0 nela, não o overflow do pai. */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "visible", minWidth: 0, backgroundColor: "#fff" }}>

            {/* Barra de filtros */}
            <div style={{
              padding: "14px 24px",
              borderBottom: "1px solid #ebe8e4",
              backgroundColor: "#fafaf9",
              display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginRight: 4, flexShrink: 0 }}>
                <SlidersHorizontal style={{ width: 13, height: 13, color: "#a8a29e" }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: "#a8a29e", textTransform: "uppercase", letterSpacing: "0.08em" }}>Filtros</span>
              </div>
              <FilterSelect showAllLabelWhenEmpty hideWhenEmpty={false} accent="violet"
                label="Evento" allLabel="Todos os eventos"
                value={eventFilter} onChange={setEventFilter}
                options={eventOptions} searchPlaceholder="Buscar evento..." emptyText="Nenhum." />
              <FilterSelect showAllLabelWhenEmpty hideWhenEmpty={false} accent="violet"
                label="Patrocinador" allLabel="Todos os patrocinadores"
                value={sponsorFilter} onChange={setSponsorFilter}
                options={sponsorOptions} searchPlaceholder="Buscar..." emptyText="Nenhum." />
              <FilterSelect showAllLabelWhenEmpty hideWhenEmpty={false} accent="violet"
                label="Grupo" allLabel="Todos os grupos"
                value={groupFilter} onChange={(x: string) => { setGroupFilter(x); setTypeFilter("all"); }}
                options={groupOptions} searchPlaceholder="Buscar grupo..." emptyText="Nenhum." />
              <FilterSelect showAllLabelWhenEmpty hideWhenEmpty={false} accent="violet"
                label="Tipo" allLabel="Todos os tipos"
                value={typeFilter} onChange={setTypeFilter}
                options={typeOptions} searchPlaceholder="Buscar tipo..." emptyText="Nenhum."
                dropdownAlign="right" />
              <FilterSelect showAllLabelWhenEmpty hideWhenEmpty={false} accent="violet"
                label="Status" allLabel="Todos os status"
                value={statusFilter} onChange={setStatusFilter}
                options={statusOptions} searchPlaceholder="Buscar..." emptyText="Nenhum."
                dropdownAlign="right" />
              {hasFilters && (
                <button
                  onClick={clearFilters}
                  style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 32, padding: "0 12px", borderRadius: 8, background: "none", border: "1px solid #e4e0db", color: "#78716c", cursor: "pointer", fontSize: 11, fontWeight: 600, flexShrink: 0, whiteSpace: "nowrap" }}>
                  <X style={{ width: 11, height: 11 }} />
                  {activeFilterCount > 1 ? `${activeFilterCount} filtros` : "Limpar filtro"}
                </button>
              )}
            </div>

            {/* Cabeçalho da lista */}
            <div style={{
              padding: "12px 24px",
              borderBottom: "1px solid #f0ede8",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              flexShrink: 0,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#292524" }}>
                  {selected.length} <span style={{ fontWeight: 400, color: "#a8a29e" }}>de {filtered.length} {filtered.length === 1 ? "peça" : "peças"}</span>
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <button
                    onClick={() => setExcludedIds(new Set())}
                    disabled={selected.length === filtered.length}
                    style={{ background: "none", border: "none", padding: 0, fontSize: 12, fontWeight: 700, cursor: selected.length === filtered.length ? "default" : "pointer", color: selected.length === filtered.length ? "#d4d0ca" : "#7c3aed" }}>
                    Selecionar todas
                  </button>
                  <span style={{ color: "#e4e0db" }}>·</span>
                  <button
                    onClick={() => setExcludedIds(new Set(filtered.map(i => i.id)))}
                    disabled={selected.length === 0}
                    style={{ background: "none", border: "none", padding: 0, fontSize: 12, fontWeight: 700, cursor: selected.length === 0 ? "default" : "pointer", color: selected.length === 0 ? "#d4d0ca" : "#7c3aed" }}>
                    Limpar
                  </button>
                </div>
              </div>
              <span style={{ fontSize: 11, color: "#78716c" }}>
                {selected.filter(i => i.approvalThumbUrl).length} com thumb
                {selected.some(isFullBookItem) ? ` · ${selected.filter(isFullBookItem).length} com book` : ""}
              </span>
            </div>

            {/* Lista */}
            {filtered.length === 0 ? (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14 }}>
                <div style={{ width: 64, height: 64, borderRadius: 16, backgroundColor: "#f5f5f4", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <FileText style={{ width: 26, height: 26, color: "#d4d0ca" }} />
                </div>
                <div style={{ textAlign: "center" }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: "#78716c", margin: "0 0 4px" }}>Nenhuma peça encontrada</p>
                  <p style={{ fontSize: 12, color: "#a8a29e", margin: 0 }}>Ajuste os filtros acima</p>
                </div>
                {hasFilters && (
                  <button onClick={clearFilters} style={{ fontSize: 12, fontWeight: 700, color: "#7c3aed", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
                    Limpar filtros
                  </button>
                )}
              </div>
            ) : (
              <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
                {filtered.map((item: any) => {
                  const hasThumb = !!item.approvalThumbUrl;
                  const thumbSrc = hasThumb ? convertGCSUrlToLocalPath(item.approvalThumbUrl) : null;
                  const picked   = !excludedIds.has(item.id);
                  return (
                    <div
                      key={item.id}
                      onClick={() => setExcludedIds(prev => { const n = new Set(prev); if (n.has(item.id)) n.delete(item.id); else n.add(item.id); return n; })}
                      style={{
                        display: "flex", alignItems: "center", gap: 12,
                        padding: "10px 14px", borderRadius: 10,
                        border: `1px solid ${picked ? "#ebe8e4" : "#e4e0db"}`,
                        backgroundColor: picked ? "#fff" : "#fafaf9",
                        opacity: picked ? 1 : 0.5,
                        cursor: "pointer",
                        transition: "opacity 0.12s, background 0.1s",
                      }}
                    >
                      {/* Checkbox */}
                      <div style={{ width: 20, height: 20, borderRadius: 6, flexShrink: 0, border: `2px solid ${picked ? "#7c3aed" : "#d4d0ca"}`, backgroundColor: picked ? "#7c3aed" : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {picked && <CheckCircle style={{ width: 10, height: 10, color: "#fff" }} />}
                      </div>
                      {/* Thumb */}
                      <div style={{ width: 50, height: 50, borderRadius: 8, overflow: "hidden", flexShrink: 0, border: "1px solid rgba(0,0,0,0.07)", backgroundColor: "#f3f4f3", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {hasThumb && thumbSrc
                          ? <img src={thumbSrc} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                          : <FileImage style={{ width: 18, height: 18, color: "#d4d4d0" }} />}
                      </div>
                      {/* Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                          <span style={{ fontSize: 11, fontWeight: 800, color: "#7c3aed", fontFamily: "monospace", letterSpacing: "0.02em" }}>{item.displayId}</span>
                          <span style={{ fontSize: 12, fontWeight: 600, color: "#1c1917", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textTransform: "capitalize" }}>{item.type}</span>
                          {/* Antes o selo dizia só "Book" para qualquer peça
                              coberta, sem dizer qual botão realmente ia usá-la —
                              origem da confusão "sempre vem o book cheio". Agora
                              distingue: book completo (abre o PDF como enviado)
                              de book parcial (as outras peças do mesmo book não
                              estão selecionadas, então esta vira página avulsa
                              no "Gerar PDF" em vez de abrir o PDF inteiro). */}
                          {item.bookUrl && (
                            ignoreBook ? (
                              <span
                                title="Book ignorado — esta peça entra no PDF gerado"
                                data-testid={`badge-book-ignored-export-${item.id}`}
                                style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11, fontWeight: 700, color: "#57534e", backgroundColor: "#f5f5f4", border: "1px solid #e4e0db", borderRadius: 4, padding: "2px 6px", textTransform: "uppercase", textDecoration: "line-through" }}>
                                <FileText style={{ width: 10, height: 10 }} /> Book
                              </span>
                            ) : isFullBookItem(item) ? (
                              <span
                                title="Book completo — abre o PDF como foi enviado pela Arte"
                                data-testid={`badge-book-export-${item.id}`}
                                style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11, fontWeight: 700, color: "#6d28d9", backgroundColor: "#f5f3ff", border: "1px solid #ddd6fe", borderRadius: 4, padding: "2px 6px", textTransform: "uppercase" }}>
                                <FileText style={{ width: 10, height: 10 }} /> Book
                              </span>
                            ) : (
                              <span
                                title="Faltam outras peças deste book na seleção — como o PDF não pode ser dividido em páginas, esta peça sai como página avulsa no PDF gerado"
                                data-testid={`badge-book-partial-export-${item.id}`}
                                style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11, fontWeight: 700, color: "#92400e", backgroundColor: "#fffbeb", border: "1px solid #fde68a", borderRadius: 4, padding: "2px 6px", textTransform: "uppercase" }}>
                                <FileText style={{ width: 10, height: 10 }} /> Book parcial
                              </span>
                            )
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: "#78716c", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {item.event?.name || ""}{item.description ? ` · ${item.description}` : ""}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
