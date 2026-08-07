// Modal de exportação de PDF compartilhado (Arte e Atendimento). Filtros
// facetados, seleção manual das peças e agrupamento por grupo/evento — tudo
// gerando o mesmo book via exportMixedToPDF.
import { useState, useMemo, useEffect } from "react";
import { Printer, X, FileText, FileImage, CheckCircle, SlidersHorizontal, BookOpen, Scissors } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { FilterSelect } from "@/components/filter-select";
import { BookPagePicker } from "@/components/book-page-picker";
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
  // De onde sai o arquivo. Antes existiam quatro controles disputando a mesma
  // decisão — o interruptor "Ignorar book", "Abrir Books", "Extrair páginas" e
  // "Gerar PDF" — em dois lugares diferentes da tela, e o modal ainda podia
  // produzir dois artefatos de uma vez, exibindo duas contagens que se
  // contradiziam ("926 peças" no topo, "223 peças" no botão). Uma escolha só,
  // no topo do painel, elimina a contradição: ou o arquivo nasce das artes, ou
  // ele é o book que a Arte já enviou.
  //
  // Começa no book: quando a peça tem book, ele é o arquivo que o patrocinador
  // já aprovou, então é a saída certa na maioria das vezes — gerar das artes é
  // a exceção. Quando não há book na seleção, o radio nem aparece e a
  // exportação cai sozinha no caminho das artes (ver `useBook`), então o padrão
  // nunca fica marcando uma origem impossível.
  const [source, setSource] = useState<"artes" | "book">("book");
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    // Reabrir volta ao book: o padrão não pode depender do que foi escolhido na
    // exportação anterior, senão quem trocou uma vez para "artes" nunca mais vê
    // o book como padrão.
    if (open) { setExcludedIds(new Set()); setUngroupedKeys(new Set()); setSource("book"); }
    // O seletor de páginas é irmão deste Dialog, não filho — fechar a exportação
    // não o desmontaria, e ele ficaria sozinho na tela sem o modal que o abriu.
    else setPickerOpen(false);
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

  // Um evento tem um book; a seleção inteira, sem filtro, chega a dezenas deles.
  // Por isso a escolha de qual book abrir vive dentro do seletor de páginas, e
  // não como um botão por book no rodapé — com 8 books o rodapé engolia o painel
  // de opções.
  const booksInSelection = useMemo(() => {
    const map = new Map<string, { url: string; label: string; count: number }>();
    selected.forEach(i => {
      if (!i.bookUrl) return;
      const cur = map.get(i.bookUrl);
      if (cur) cur.count++;
      else map.set(i.bookUrl, { url: i.bookUrl, label: i.event?.name || "Sem evento", count: 1 });
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [selected]);
  const coveredCount   = useMemo(() => selected.filter(i => !!i.bookUrl).length, [selected]);
  const uncoveredCount = selected.length - coveredCount;
  const anyBook  = coveredCount > 0;
  const useBook  = source === "book" && anyBook;

  const pageCount = useMemo(() => {
    const perEvent = new Map<string,Map<string,number>>();
    selected.forEach(i => {
      const ev = i.eventId || "__"; if (!perEvent.has(ev)) perEvent.set(ev, new Map());
      const g = groupKeyOf(i); const m = perEvent.get(ev)!; m.set(g, (m.get(g) ?? 0) + 1);
    });
    let total = 0;
    perEvent.forEach(groups => groups.forEach((count, key) => { total += combinedSet.has(key) ? Math.ceil(count / MAX_ITEMS_PER_COMBINED_PAGE) : count; }));
    if (groupByEvent && perEvent.size > 1) total += perEvent.size;
    return total;
  }, [selected, combinedSet, groupByEvent]);

  return (
    <>
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
            <div style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: useBook ? "#6d28d9" : "#c2410c", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "0 0 0 1px rgba(255,255,255,0.12) inset", transition: "background-color 0.2s" }}>
              {useBook ? <BookOpen style={{ width: 18, height: 18, color: "#fff" }} /> : <Printer style={{ width: 18, height: 18, color: "#fff" }} />}
            </div>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.03em", color: "#fff", margin: 0, lineHeight: 1.2 }}>
                {useBook ? "Exportar book" : "Exportar PDF"}
              </h2>
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.72)", margin: "3px 0 0" }}>
                {useBook
                  ? "Use o arquivo que a Arte já enviou — inteiro ou só as páginas que precisa"
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
            {/* Título da seção. #78716c em vez de #a8a29e: o rótulo tem 11px em
                caixa alta sobre #fafaf9, onde o cinza claro dava 2,4:1 e reprova
                WCAG AA — texto pequeno é justamente o que menos pode perder
                contraste. */}
            <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #ebe8e4" }}>
              <p style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", color: "#78716c", margin: 0 }}>
                Opções
              </p>
            </div>

            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "20px 24px" }}>

              {/* ── Origem do arquivo ──────────────────────────────────────
                  A decisão que governa todo o resto do painel vem primeiro. Era
                  ela que antes estava dissolvida em quatro controles espalhados;
                  como radio, o usuário vê as duas saídas possíveis lado a lado
                  em vez de deduzi-las pelos botões do rodapé. */}
              {anyBook && (
                <div style={{ marginBottom: 24 }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: "#292524", margin: "0 0 10px" }}>Origem do arquivo</p>
                  <div role="radiogroup" aria-label="Origem do arquivo" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {([
                      { id: "artes" as const, icon: Printer,  title: "Gerar das artes",
                        desc: `Uma página por peça, montada a partir das artes aprovadas.` },
                      { id: "book"  as const, icon: BookOpen, title: "Book da Arte",
                        desc: `O PDF original do evento, como foi enviado ao patrocinador.` },
                    ]).map(opt => {
                      const on = source === opt.id;
                      const Icon = opt.icon;
                      const tint = opt.id === "book" ? "#6d28d9" : "#c2410c";
                      return (
                        <button
                          key={opt.id}
                          role="radio"
                          aria-checked={on}
                          onClick={() => setSource(opt.id)}
                          data-testid={`radio-source-${opt.id}`}
                          style={{
                            display: "flex", alignItems: "flex-start", gap: 10, width: "100%", textAlign: "left",
                            padding: "11px 12px", borderRadius: 10, cursor: "pointer",
                            border: `1px solid ${on ? tint : "#e4e0db"}`,
                            backgroundColor: on ? (opt.id === "book" ? "#f5f3ff" : "#fff7ed") : "#fff",
                            boxShadow: on ? `0 0 0 1px ${tint} inset` : "none",
                            transition: "border-color 0.12s, background-color 0.12s",
                          }}>
                          <span style={{
                            width: 16, height: 16, borderRadius: 999, flexShrink: 0, marginTop: 2,
                            border: `2px solid ${on ? tint : "#d4d0ca"}`,
                            display: "flex", alignItems: "center", justifyContent: "center",
                          }}>
                            {on && <span style={{ width: 7, height: 7, borderRadius: 999, backgroundColor: tint }} />}
                          </span>
                          <span style={{ minWidth: 0 }}>
                            <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 700, color: on ? tint : "#1c1917" }}>
                              <Icon style={{ width: 12, height: 12 }} /> {opt.title}
                            </span>
                            <span style={{ display: "block", fontSize: 11, color: "#57534e", lineHeight: 1.5, marginTop: 3 }}>
                              {opt.desc}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Várias peças por página — só afeta o PDF gerado das artes. */}
              {!useBook && groupsInSelection.length > 0 && (
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

              {/* Estado vazio do painel: só quando não há mesmo nada a
                  configurar. Com origem "book" o painel fica curto de
                  propósito — a ação está no rodapé, não aqui. */}
              {!useBook && groupsInSelection.length === 0 && eventCount <= 1 && !anyBook && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px 0", gap: 10 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: "#f5f5f4", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <FileText style={{ width: 20, height: 20, color: "#d4d0ca" }} />
                  </div>
                  <p style={{ fontSize: 12, color: "#78716c", margin: 0, textAlign: "center", lineHeight: 1.5 }}>
                    Selecione peças ao lado<br />para configurar o layout
                  </p>
                </div>
              )}

              {/* Com o book escolhido, o painel explica o que o arquivo é — sem
                  isso a coluna ficaria com um radio solto e um vazio embaixo. */}
              {useBook && (
                <div style={{ backgroundColor: "#f5f3ff", border: "1px solid #ddd6fe", borderRadius: 10, padding: "12px 14px" }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: "#5b21b6", margin: "0 0 6px" }}>
                    {booksInSelection.length === 1
                      ? "1 book na seleção"
                      : `${booksInSelection.length} books na seleção`}
                  </p>
                  <p style={{ fontSize: 11, color: "#6d28d9", margin: 0, lineHeight: 1.6 }}>
                    Cada evento tem um book próprio, com o layout já aprovado.
                    O arquivo sai exatamente como a Arte enviou.
                  </p>
                </div>
              )}
            </div>

            {/* Rodapé — flexShrink 0 aqui e em cada botão: a coluna tem altura
                fixa (580) e o rodapé empilha até três controles. Sem travar o
                encolhimento, o flex espremia as alturas e os botões saíam
                achatados em vez de o painel de cima ceder espaço. */}
            <div style={{ padding: "16px 24px", borderTop: "1px solid #ebe8e4", display: "flex", flexDirection: "column", gap: 8, flexShrink: 0, backgroundColor: "#fff" }}>

              {/* Aviso de peças que ficam de fora. Antes o modal produzia os dois
                  artefatos de uma vez e mostrava duas contagens contraditórias
                  ("926 peças" no topo, "223 peças" no botão) sem explicar a
                  diferença. Agora a saída é uma só e o aviso diz o que sobra. */}
              {useBook && uncoveredCount > 0 && (
                <p style={{ fontSize: 11, color: "#7c2d12", margin: "0 0 4px", lineHeight: 1.6, background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 8, padding: "9px 11px" }}>
                  <strong style={{ color: "#7c2d12" }}>{uncoveredCount}</strong>{" "}
                  {uncoveredCount === 1 ? "peça selecionada não tem" : "peças selecionadas não têm"} book
                  e {uncoveredCount === 1 ? "fica" : "ficam"} de fora. Escolha "Gerar das artes" para incluir {uncoveredCount === 1 ? "ela" : "todas"}.
                </p>
              )}

              {useBook ? (
                <>
                  {/* Recortar é a ação primária: abrir o book inteiro já era
                      possível antes e é justamente o que devolvia "o book cheio"
                      quando o usuário queria só algumas peças. */}
                  <button
                    onClick={() => setPickerOpen(true)}
                    data-testid="button-extract-book"
                    style={{
                      width: "100%", height: 46, flexShrink: 0, borderRadius: 10,
                      backgroundColor: "#6d28d9", border: "none", color: "#fff",
                      fontSize: 13, fontWeight: 800, letterSpacing: "-0.01em",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                      cursor: "pointer", boxShadow: "0 2px 8px rgba(109,40,217,0.28)",
                    }}>
                    <Scissors style={{ width: 15, height: 15 }} />
                    Escolher páginas do book
                  </button>
                  <button
                    onClick={() => {
                      booksInSelection.forEach(b => window.open(b.url, "_blank", "noopener,noreferrer"));
                      onOpenChange(false);
                    }}
                    data-testid="button-export-book"
                    style={{
                      width: "100%", height: 38, flexShrink: 0, borderRadius: 10,
                      backgroundColor: "#f5f3ff", border: "1px solid #ddd6fe",
                      color: "#5b21b6", fontSize: 12, fontWeight: 700,
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                      cursor: "pointer",
                    }}>
                    <BookOpen style={{ width: 14, height: 14 }} />
                    {booksInSelection.length === 1
                      ? "Abrir book completo"
                      : `Abrir os ${booksInSelection.length} books completos`}
                  </button>
                </>
              ) : (
                <button
                  onClick={() => {
                    if (selected.length > 0) void exportMixedToPDF(selected, combinedSet, `${title} — ${selected.length} peça(s)`, groupByEvent);
                    onOpenChange(false);
                  }}
                  disabled={selected.length === 0}
                  data-testid="button-export-confirm"
                  style={{
                    width: "100%", height: 46, flexShrink: 0, borderRadius: 10,
                    // Ação primária do modal usa o laranja de ação do app, como os
                    // botões primários das listas. O roxo fica reservado ao book,
                    // onde a cor tem significado.
                    backgroundColor: selected.length === 0 ? "#e7e5e4" : "#c2410c",
                    border: "none",
                    color: selected.length === 0 ? "#57534e" : "#fff",
                    fontSize: 13, fontWeight: 800,
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                    cursor: selected.length === 0 ? "not-allowed" : "pointer",
                    letterSpacing: "-0.01em",
                    boxShadow: selected.length > 0 ? "0 2px 8px rgba(194,65,12,0.24)" : "none",
                  }}>
                  <Printer style={{ width: 15, height: 15 }} />
                  {selected.length === 0
                    ? "Gerar PDF"
                    : `Gerar PDF — ${selected.length} ${selected.length === 1 ? "peça" : "peças"}${pageCount > 0 ? ` · ${pageCount} pág.` : ""}`}
                </button>
              )}

              {/* Cancelar por último e discreto: a ação destrutiva não deve
                  competir com a primária, e vinha acima dela chamando mais
                  atenção que o próprio "Gerar PDF". */}
              <button
                onClick={() => onOpenChange(false)}
                style={{ width: "100%", height: 36, flexShrink: 0, borderRadius: 8, background: "none", border: "none", color: "#78716c", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                Cancelar
              </button>
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
                {/* Descreve os dados da seleção, não a origem escolhida: uma peça
                    coberta por book continua coberta mesmo quando a exportação
                    sai pelas artes. */}
                {selected.filter(i => i.approvalThumbUrl).length} com thumb
                {anyBook ? ` · ${coveredCount} com book` : ""}
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
                          {/* O selo marca só o que muda o resultado. Com origem
                              "book" o que importa é quem fica de fora, então a
                              linha destacada é a peça SEM book — antes o selo
                              roxo aparecia em centenas de linhas repetindo uma
                              informação que não mudava decisão nenhuma. */}
                          {useBook
                            ? !item.bookUrl && (
                                <span
                                  title="Esta peça não está coberta por nenhum book e fica de fora da exportação"
                                  data-testid={`badge-no-book-export-${item.id}`}
                                  style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, fontWeight: 700, color: "#9a3412", backgroundColor: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 4, padding: "2px 6px", textTransform: "uppercase", letterSpacing: "0.03em" }}>
                                  Sem book
                                </span>
                              )
                            : item.bookUrl && (
                                <span
                                  title="Coberta por um book da Arte — troque a origem para usar o arquivo original"
                                  data-testid={`badge-book-export-${item.id}`}
                                  style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, fontWeight: 700, color: "#6d28d9", backgroundColor: "#f5f3ff", border: "1px solid #ddd6fe", borderRadius: 4, padding: "2px 6px", textTransform: "uppercase", letterSpacing: "0.03em" }}>
                                  <FileText style={{ width: 9, height: 9 }} /> Book
                                </span>
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

    {/* Fora do Dialog de exportação de propósito: um Dialog do Radix aninhado
        em outro disputa o foco com o pai e o seletor abriria sem receber
        teclado. */}
    {pickerOpen && (
      <BookPagePicker
        open
        onOpenChange={setPickerOpen}
        books={booksInSelection}
        fileName={title}
      />
    )}
    </>
  );
}
