// Modal de exportação de PDF compartilhado (Arte e Atendimento). Filtros
// facetados, seleção manual das peças e agrupamento por grupo/evento — tudo
// gerando o mesmo book via exportMixedToPDF.
import { useState, useMemo, useEffect } from "react";
import { Printer, X, FileText, FileImage, CheckCircle, SlidersHorizontal, BookOpen, Scissors, Search, LayoutGrid, File, AlertTriangle, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { HIDE_NATIVE_CLOSE } from "@/components/modal-shell";
import { FilterSelect } from "@/components/filter-select";
import { BookPagePicker } from "@/components/book-page-picker";
import { exportMixedToPDF, groupKeyOf, MAX_ITEMS_PER_COMBINED_PAGE, convertGCSUrlToLocalPath } from "@/lib/artePdfExport";
import { useIsMobile } from "@/hooks/use-mobile";
import { normalizarBusca } from "@/lib/utils";

/**
 * UMA PÁGINA DO PDF QUE VAI SAIR.
 *
 * `capa` só existe com mais de um evento e a opção ligada; `combinada` junta
 * até `MAX_ITEMS_PER_COMBINED_PAGE` peças do mesmo grupo; `unica` é uma peça
 * por página.
 */
type PaginaExport =
  | { tipo: "capa"; rotulo: string }
  | { tipo: "combinada"; grupo: string; itens: any[] }
  | { tipo: "unica"; grupo: string; item: any };

/**
 * A MONTAGEM DAS PÁGINAS, PURA — e é por ser pura que ela conserta a
 * contradição.
 *
 * A contagem de páginas das ARTES precisa aparecer no cartão de origem mesmo
 * quando a origem escolhida é o BOOK: é ela que diz o que o outro caminho
 * entrega. Se esse número for derivado da lista de páginas da origem ATUAL, o
 * cartão inativo passa a mostrar a contagem do caminho ativo — que é a
 * contradição que este modal já corrigiu uma vez, quando exibia '926 peças' no
 * topo e '223 peças' no botão.
 *
 * Fora daqui, a função também é a fonte da prévia: a lista de miniaturas é
 * literalmente o que sai, na ordem em que sai, e não uma segunda conta que
 * pode divergir da primeira.
 */
function montarPaginas(
  selecionadas: any[],
  combinadas: Set<string>,
  capaPorEvento: boolean,
): PaginaExport[] {
  const porEvento = new Map<string, { nome: string; grupos: Map<string, any[]> }>();
  selecionadas.forEach(i => {
    const ev = i.eventId || "__";
    if (!porEvento.has(ev)) porEvento.set(ev, { nome: i.event?.name || "Sem evento", grupos: new Map() });
    const g = groupKeyOf(i);
    const grupos = porEvento.get(ev)!.grupos;
    grupos.set(g, (grupos.get(g) ?? []).concat([i]));
  });

  const paginas: PaginaExport[] = [];
  const comCapa = capaPorEvento && porEvento.size > 1;
  porEvento.forEach(({ nome, grupos }) => {
    if (comCapa) paginas.push({ tipo: "capa", rotulo: nome });
    grupos.forEach((itens, grupo) => {
      if (combinadas.has(grupo)) {
        for (let k = 0; k < itens.length; k += MAX_ITEMS_PER_COMBINED_PAGE) {
          paginas.push({ tipo: "combinada", grupo, itens: itens.slice(k, k + MAX_ITEMS_PER_COMBINED_PAGE) });
        }
      } else {
        itens.forEach(item => paginas.push({ tipo: "unica", grupo, item }));
      }
    });
  });
  return paginas;
}

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
  // Busca livre: com cinco menus facetados a lista ainda pedia rolagem para
  // achar UMA peça pelo código. Ela varre o que a pessoa tem na mão — código,
  // descrição e nome de patrocinador.
  const [busca, setBusca] = useState("");
  const [exportando, setExportando] = useState(false);
  const [maisFiltros, setMaisFiltros] = useState(false);
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
  const isMobile = useIsMobile();

  useEffect(() => {
    // Reabrir volta ao book: o padrão não pode depender do que foi escolhido na
    // exportação anterior, senão quem trocou uma vez para "artes" nunca mais vê
    // o book como padrão. Os 5 filtros também zeram — um filtro esquecido da
    // exportação anterior recortava a lista em silêncio.
    if (open) { setExcludedIds(new Set()); setUngroupedKeys(new Set()); setSource("book"); setBusca(""); setExportando(false); setMaisFiltros(false); clearFilters(); }
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
    // A busca entra em TODOS os recortes, inclusive nas facetas: um menu que
    // oferece 'Evento X · 12' e devolve 2 é pior que não ter o menu.
    if (busca.trim()) {
      const alvo = normalizarBusca(
        [i.displayId, i.description, i.type, (i.sponsors ?? []).map((s: any) => s.name).join(" ")].filter(Boolean).join(" "),
      );
      if (!alvo.includes(normalizarBusca(busca))) return false;
    }
    if (skip !== "event"   && eventFilter   !== "all" && i.eventId !== eventFilter) return false;
    if (skip !== "sponsor" && sponsorFilter !== "all" && !(i.sponsors ?? []).some((s: any) => s.id === sponsorFilter)) return false;
    if (skip !== "group"   && groupFilter   !== "all" && groupKeyOf(i) !== groupFilter) return false;
    if (skip !== "type"    && typeFilter    !== "all" && i.type !== typeFilter) return false;
    if (skip !== "status"  && statusFilter  !== "all" && statusOf(i) !== statusFilter) return false;
    return true;
  };

  const filtered = useMemo(() => items.filter(i => matches(i)),
    [items, eventFilter, sponsorFilter, groupFilter, typeFilter, statusFilter, busca]);
  const selected = useMemo(() => filtered.filter(i => !excludedIds.has(i.id)), [filtered, excludedIds]);
  const facetDeps = [items, eventFilter, sponsorFilter, groupFilter, typeFilter, statusFilter, busca];

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

  // UMA conta só, para o cartão de origem, a prévia e o rodapé. Antes o
  // número existia aqui e a prévia não existia; agora que ela existe, duas
  // contas separadas divergiriam no primeiro ajuste de paginação.
  const paginasArtes = useMemo(
    () => montarPaginas(selected, combinedSet, groupByEvent),
    [selected, combinedSet, groupByEvent],
  );
  const pageCount = paginasArtes.length;

  // As linhas da lista, agrupadas por `groupKeyOf` — a mesma chave que decide
  // a paginação. Agrupar por outra coisa faria a lista contar uma história e o
  // arquivo, outra.
  const gruposDaLista = useMemo(() => {
    const map = new Map<string, any[]>();
    filtered.forEach(i => {
      const k = groupKeyOf(i);
      map.set(k, (map.get(k) ?? []).concat([i]));
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0], "pt-BR"));
  }, [filtered]);

  const cortadas = useBook ? uncoveredCount : 0;
  const primarioTravado = selected.length === 0 || exportando;

  const gerarArtes = () => {
    if (selected.length === 0) return;
    setExportando(true);
    void Promise.resolve(
      exportMixedToPDF(selected, combinedSet, `${title} — ${selected.length} peça(s)`, groupByEvent),
    ).finally(() => { setExportando(false); onOpenChange(false); });
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={`p-0 gap-0 ${HIDE_NATIVE_CLOSE}`}
        style={{
          maxWidth: isMobile ? "95vw" : 1080, width: isMobile ? "95vw" : "96vw",
          borderRadius: 16,
          backgroundColor: "#fff",
          border: "none",
          boxShadow: "0 32px 64px -16px rgba(0,0,0,0.28), 0 0 0 1px rgba(0,0,0,0.05)",
          overflow: "hidden",
          // O teto é `100vh − 48`: a viewport menos 24px de respiro em cima e 24
          // embaixo, simétrico porque o Radix centra o Content. `dvh` no celular
          // porque a barra de endereço come ~60px que o `vh` finge que existem.
          maxHeight: isMobile ? "calc(100dvh - 48px)" : "calc(100vh - 48px)",
          display: "flex", flexDirection: "column",
        }}
      >
        <DialogTitle className="sr-only">Exportar PDF</DialogTitle>
        <DialogDescription className="sr-only">Escolha a origem, as peças e confira a prévia antes de gerar</DialogDescription>

        {/* ══ Cabeçalho ═══════════════════════════════════════════════════
            O TÍTULO NÃO TROCA MAIS COM A ORIGEM. Ele alternava entre "Exportar
            PDF" e "Exportar book", junto com o subtítulo inteiro: trocar de
            origem repintava o topo da tela e dava a impressão de ter aberto
            outro modal. Só o ladrilho muda — é sinal suficiente, e fica ao lado
            do controle que causou a mudança. */}
        <div style={{
          padding: "22px 32px",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          background: "linear-gradient(135deg, #1c1917 0%, #2d2926 100%)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: useBook ? "#6d28d9" : "#c2410c", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "0 0 0 1px rgba(255,255,255,0.12) inset", transition: "background-color 0.2s" }}>
              {useBook ? <BookOpen style={{ width: 18, height: 18, color: "#fff" }} /> : <Printer style={{ width: 18, height: 18, color: "#fff" }} />}
            </div>
            <div style={{ minWidth: 0 }}>
              <h2 style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.03em", color: "#fff", margin: 0, lineHeight: 1.2 }}>
                Exportar PDF
              </h2>
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.72)", margin: "3px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {title} · {items.length} {items.length === 1 ? "peça" : "peças"} na fila
              </p>
            </div>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            aria-label="Fechar"
            style={{ width: 40, height: 40, borderRadius: "50%", backgroundColor: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", cursor: "pointer", color: "rgba(255,255,255,0.7)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>

        {/* ══ Barra de origem ═════════════════════════════════════════════
            A DECISÃO SAI DE DENTRO DO PAINEL DE OPÇÕES. Ela era um par de
            radios espremido entre checkboxes de layout, e é a escolha que
            determina TODO o resto da tela — inclusive se o botão primário gera
            um arquivo novo ou abre um que já existe.

            E cada cartão passa a dizer o que ENTREGA. Antes era preciso trocar
            de origem para descobrir quantas páginas o outro caminho dava, o que
            transformava a comparação numa ida e volta. */}
        <div
          role="radiogroup"
          aria-label="Origem do arquivo"
          style={{
            display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10,
            padding: "14px 24px", backgroundColor: "#fafaf9",
            borderBottom: "1px solid #ebe8e4", flexShrink: 0,
          }}
        >
          {([
            {
              id: "book" as const, tint: "#6d28d9", tintFraco: "#f5f3ff", tintTexto: "#5b21b6",
              Icone: BookOpen, titulo: "Book da Arte",
              meta: anyBook
                ? `${booksInSelection.length} ${booksInSelection.length === 1 ? "book" : "books"} · ${coveredCount} de ${selected.length} peças`
                : "nenhuma peça da seleção tem book",
              desabilitado: !anyBook,
            },
            {
              id: "artes" as const, tint: "#c2410c", tintFraco: "#fff7ed", tintTexto: "#c2410c",
              Icone: Printer, titulo: "Gerar das artes",
              // `pageCount` sai de `montarPaginas`, que não conhece a origem —
              // então este número é o das ARTES mesmo com o book selecionado.
              meta: `${selected.length} ${selected.length === 1 ? "peça" : "peças"} · ${pageCount} ${pageCount === 1 ? "página" : "páginas"}`,
              desabilitado: false,
            },
          ]).map(op => {
            const ativo = (op.id === "book" ? useBook : !useBook);
            return (
              <div
                key={op.id}
                role="radio"
                aria-checked={ativo}
                aria-disabled={op.desabilitado || undefined}
                tabIndex={op.desabilitado ? -1 : 0}
                data-testid={`radio-source-${op.id}`}
                onClick={() => { if (!op.desabilitado) setSource(op.id); }}
                onKeyDown={e => { if (!op.desabilitado && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); setSource(op.id); } }}
                style={{
                  display: "flex", alignItems: "center", gap: 11,
                  padding: "12px 14px", borderRadius: 10,
                  border: `1px solid ${ativo ? op.tint : "#e4e0db"}`,
                  backgroundColor: ativo ? op.tintFraco : "#fff",
                  boxShadow: ativo ? `0 0 0 1px ${op.tint} inset` : "none",
                  cursor: op.desabilitado ? "not-allowed" : "pointer",
                  opacity: op.desabilitado ? 0.55 : 1,
                  minHeight: isMobile ? 44 : undefined,
                }}
              >
                <div style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: ativo ? op.tint : "#f5f5f4" }}>
                  <op.Icone style={{ width: 15, height: 15, color: ativo ? "#fff" : "#78716c" }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: ativo ? op.tintTexto : "#1c1917" }}>{op.titulo}</div>
                  <div style={{ fontSize: 11, color: "#57534e", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{op.meta}</div>
                </div>
                <div aria-hidden="true" style={{ width: 16, height: 16, borderRadius: "50%", flexShrink: 0, border: `2px solid ${ativo ? op.tint : "#d4d0ca"}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {ativo && <div style={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: op.tint }} />}
                </div>
              </div>
            );
          })}
        </div>

        {/* ══ Corpo: a lista à esquerda, o que sai à direita ═══════════════ */}
        <div style={{
          display: "flex",
          ...(isMobile
            ? { flexDirection: "column" as const, flex: "1 1 auto" as const, minHeight: 0, overflowY: "auto" as const }
            : { flex: "1 1 auto" as const, minHeight: 0, overflow: "visible" as const }),
        }}>

          {/* ── Lista ───────────────────────────────────────────────────── */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "visible", minWidth: 0, backgroundColor: "#fff" }}>

            {/* Filtros */}
            <div style={{
              padding: "12px 20px", borderBottom: "1px solid #ebe8e4", backgroundColor: "#fafaf9",
              display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", flexShrink: 0,
            }}>
              {/* A BUSCA É O PRIMEIRO CONTROLE. Cinco menus facetados respondem
                  "que recorte eu quero"; nenhum responde "cadê a peça #3524",
                  que é a pergunta de quem já sabe o que procura. */}
              <div style={{ position: "relative", flex: "1 1 190px", minWidth: 150 }}>
                <Search style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", width: 13, height: 13, color: "#a8a29e", pointerEvents: "none" }} />
                <input
                  value={busca}
                  onChange={e => setBusca(e.target.value)}
                  placeholder="Buscar peça, código, patrocinador…"
                  aria-label="Buscar peça por código, descrição ou patrocinador"
                  data-testid="input-export-busca"
                  style={{ width: "100%", boxSizing: "border-box", height: isMobile ? 44 : 36, padding: "0 10px 0 30px", borderRadius: 7, border: "1px solid #e7e5e4", backgroundColor: "#fff", fontSize: 12, color: "#1c1917", outlineOffset: 2 }}
                />
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

              {/* Tipo e Status vêm depois de um gatilho: com a busca ocupando a
                  ponta esquerda, os cinco menus não cabiam numa linha só, e
                  quebrar a barra em duas empurrava a lista para baixo da dobra.
                  O selo diz quantos estão ativos para eles não sumirem de vista. */}
              <button
                onClick={() => setMaisFiltros(v => !v)}
                aria-expanded={maisFiltros}
                data-testid="button-export-mais-filtros"
                style={{ display: "inline-flex", alignItems: "center", gap: 6, height: isMobile ? 44 : 36, padding: "0 12px", borderRadius: 8, background: "#fff", border: "1px solid #e4e0db", color: "#57534e", cursor: "pointer", fontSize: 12, fontWeight: 600, flexShrink: 0, whiteSpace: "nowrap" }}>
                <SlidersHorizontal style={{ width: 13, height: 13 }} />
                Mais filtros
                {(typeFilter !== "all" ? 1 : 0) + (statusFilter !== "all" ? 1 : 0) > 0 && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#5b21b6", backgroundColor: "#f5f3ff", border: "1px solid #ddd6fe", borderRadius: 99, padding: "0 6px" }}>
                    {(typeFilter !== "all" ? 1 : 0) + (statusFilter !== "all" ? 1 : 0)}
                  </span>
                )}
              </button>

              {maisFiltros && (
                <>
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
                </>
              )}

              {(hasFilters || busca.trim()) && (
                <button
                  onClick={() => { clearFilters(); setBusca(""); }}
                  data-testid="button-export-limpar-filtros"
                  style={{ display: "inline-flex", alignItems: "center", gap: 5, height: isMobile ? 44 : 36, padding: "0 12px", borderRadius: 8, background: "none", border: "1px solid #e4e0db", color: "#746e69", cursor: "pointer", fontSize: 11, fontWeight: 600, flexShrink: 0, whiteSpace: "nowrap" }}>
                  <X style={{ width: 11, height: 11 }} />
                  {activeFilterCount > 1 ? `${activeFilterCount} filtros` : "Limpar"}
                </button>
              )}
            </div>

            {/* Cabeçalho da lista — a contagem da seleção e os dois atalhos.
                Sem eles, desmarcar quarenta peças é quarenta cliques. */}
            <div style={{
              padding: "10px 20px", borderBottom: "1px solid #f0ede8",
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexShrink: 0,
            }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#292524", fontVariantNumeric: "tabular-nums" }}>
                {selected.length} <span style={{ fontWeight: 400, color: "#746e69" }}>de {filtered.length} {filtered.length === 1 ? "peça" : "peças"}</span>
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button
                  onClick={() => setExcludedIds(new Set())}
                  disabled={selected.length === filtered.length}
                  data-testid="button-export-selecionar-todas"
                  style={{ background: "none", border: "none", padding: "0 4px", minHeight: isMobile ? 44 : 36, fontSize: 12, fontWeight: 700, cursor: selected.length === filtered.length ? "default" : "pointer", color: selected.length === filtered.length ? "#c4c0ba" : "#7c3aed" }}>
                  Selecionar todas
                </button>
                <span aria-hidden="true" style={{ color: "#e4e0db" }}>·</span>
                <button
                  onClick={() => setExcludedIds(new Set(filtered.map(i => i.id)))}
                  disabled={selected.length === 0}
                  data-testid="button-export-limpar-selecao"
                  style={{ background: "none", border: "none", padding: "0 4px", minHeight: isMobile ? 44 : 36, fontSize: 12, fontWeight: 700, cursor: selected.length === 0 ? "default" : "pointer", color: selected.length === 0 ? "#c4c0ba" : "#7c3aed" }}>
                  Limpar
                </button>
              </div>
            </div>

            {/* Lista agrupada */}
            {filtered.length === 0 ? (
              <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 24 }}>
                <FileText aria-hidden="true" style={{ width: 28, height: 28, color: "#d4d0ca" }} />
                <div style={{ textAlign: "center" }}>
                  <p style={{ fontSize: 15, fontWeight: 700, color: "#1c1917", margin: "0 0 6px" }}>Nenhuma peça encontrada</p>
                  <p style={{ fontSize: 13, color: "#746e69", lineHeight: 1.55, margin: 0 }}>
                    {busca.trim() ? `Nada bate com “${busca.trim()}” nos filtros atuais` : "Ajuste os filtros acima"}
                  </p>
                </div>
                {(hasFilters || busca.trim()) && (
                  <button
                    onClick={() => { clearFilters(); setBusca(""); }}
                    style={{ height: isMobile ? 44 : 36, padding: "0 16px", borderRadius: 8, border: "1px solid #e7e5e4", background: "#fff", fontSize: 13, fontWeight: 700, color: "#1c1917", cursor: "pointer" }}>
                    Limpar filtros
                  </button>
                )}
              </div>
            ) : (
              <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
                {gruposDaLista.map(([grupo, itensDoGrupo]) => {
                  const juntas = !ungroupedKeys.has(grupo);
                  const alternarGrupo = () => setUngroupedKeys(prev => {
                    const n = new Set(prev); if (n.has(grupo)) n.delete(grupo); else n.add(grupo); return n;
                  });
                  return (
                    <div key={grupo}>
                      {/* O LAYOUT DA PÁGINA MORA NO GRUPO A QUE ELE SE APLICA.
                          Era uma lista de checkboxes no painel de opções, longe
                          das peças: para saber o que "Backdrop" ia virar, era
                          preciso procurar o nome do grupo numa segunda lista. */}
                      <div style={{
                        position: "sticky", top: 0, zIndex: 1, backgroundColor: "#fff",
                        borderBottom: "1px solid #f0ede8", padding: "7px 8px",
                        display: "flex", alignItems: "center", gap: 8,
                      }}>
                        <span style={{ fontSize: 11, fontWeight: 800, color: "#57534e", textTransform: "uppercase", letterSpacing: "0.08em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{grupo}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: "#57534e", backgroundColor: "#F3F4F6", borderRadius: 99, padding: "1px 7px", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{itensDoGrupo.length}</span>
                        <span style={{ flex: 1 }} />
                        {!useBook && (
                          <button
                            role="checkbox"
                            aria-checked={juntas}
                            aria-label={`${grupo}: ${juntas ? "várias peças por página" : "uma peça por página"}`}
                            onClick={alternarGrupo}
                            onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); alternarGrupo(); } }}
                            data-testid={`toggle-grupo-layout-${grupo}`}
                            style={{
                              display: "inline-flex", alignItems: "center", gap: 5, flexShrink: 0,
                              minHeight: isMobile ? 44 : 36, borderRadius: 999, padding: "3px 9px",
                              fontSize: 11, fontWeight: 700, cursor: "pointer",
                              border: `1px solid ${juntas ? "#ddd6fe" : "#e4e0db"}`,
                              backgroundColor: juntas ? "#f5f3ff" : "#fff",
                              color: juntas ? "#5b21b6" : "#746e69",
                            }}>
                            {juntas ? <LayoutGrid style={{ width: 11, height: 11 }} /> : <File style={{ width: 11, height: 11 }} />}
                            {juntas ? "juntas na página" : "uma por página"}
                          </button>
                        )}
                      </div>

                      <div style={{ padding: "6px 8px", display: "flex", flexDirection: "column", gap: 4 }}>
                        {itensDoGrupo.map((item: any) => {
                          const hasThumb = !!item.approvalThumbUrl;
                          const thumbSrc = hasThumb ? convertGCSUrlToLocalPath(item.approvalThumbUrl) : null;
                          const picked   = !excludedIds.has(item.id);
                          const toggleItem = () => setExcludedIds(prev => { const n = new Set(prev); if (n.has(item.id)) n.delete(item.id); else n.add(item.id); return n; });
                          return (
                            <div
                              key={item.id}
                              role="checkbox"
                              aria-checked={picked}
                              aria-label={`${item.displayId} — ${item.type}`}
                              tabIndex={0}
                              onClick={toggleItem}
                              onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleItem(); } }}
                              style={{
                                display: "flex", alignItems: "center", gap: 12,
                                padding: "9px 12px", borderRadius: 10, minHeight: 44,
                                border: `1px solid ${picked ? "#ebe8e4" : "#e4e0db"}`,
                                backgroundColor: picked ? "#fff" : "#fafaf9",
                                opacity: picked ? 1 : 0.5,
                                cursor: "pointer",
                                transition: "opacity 0.12s, background 0.1s",
                              }}
                            >
                              <div style={{ width: 20, height: 20, borderRadius: 6, flexShrink: 0, border: `2px solid ${picked ? "#7c3aed" : "#d4d0ca"}`, backgroundColor: picked ? "#7c3aed" : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                {picked && <CheckCircle style={{ width: 10, height: 10, color: "#fff" }} />}
                              </div>
                              <div style={{ width: 44, height: 44, borderRadius: 8, overflow: "hidden", flexShrink: 0, border: "1px solid rgba(0,0,0,0.07)", backgroundColor: "#f3f4f3", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                {hasThumb && thumbSrc
                                  ? <img src={thumbSrc} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                                  : <FileImage style={{ width: 18, height: 18, color: "#d4d4d0" }} />}
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                                  <span style={{ fontSize: 11, fontWeight: 800, color: "#7c3aed", fontFamily: "monospace", letterSpacing: "0.02em", flexShrink: 0 }}>{item.displayId}</span>
                                  <span style={{ fontSize: 12, fontWeight: 600, color: "#1c1917", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textTransform: "capitalize" }}>{item.type}</span>
                                  {/* "FICA DE FORA" diz a consequência, e só onde
                                      ela existe: peça selecionada, sem book, com a
                                      origem book. "Sem book" descrevia o dado e
                                      deixava a pessoa deduzir o efeito. */}
                                  {useBook && picked && !item.bookUrl && (
                                    <span
                                      title="Esta peça não está coberta por nenhum book e fica de fora da exportação"
                                      data-testid={`badge-no-book-export-${item.id}`}
                                      style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, fontWeight: 700, color: "#9a3412", backgroundColor: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 4, padding: "2px 6px", textTransform: "uppercase", letterSpacing: "0.03em" }}>
                                      Fica de fora
                                    </span>
                                  )}
                                </div>
                                <div style={{ fontSize: 11, color: "#746e69", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {item.event?.name || ""}{item.description ? ` · ${item.description}` : ""}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Prévia: o arquivo, página a página ──────────────────────────
              A tela dizia quantas páginas sairiam e nunca COMO. Layout por
              grupo, capa por evento e o teto de seis peças por página são três
              decisões que só se conferiam abrindo o PDF pronto — e refazer a
              exportação por causa de uma delas custa a espera inteira. */}
          <div style={{
            width: isMobile ? "auto" : 320, flexShrink: 0,
            borderLeft: isMobile ? "none" : "1px solid #ebe8e4",
            borderTop: isMobile ? "1px solid #ebe8e4" : "none",
            backgroundColor: "#fafaf9",
            display: "flex", flexDirection: "column", minHeight: 0,
          }}>
            <div style={{ padding: "10px 16px", borderBottom: "1px solid #ebe8e4", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: "#746e69", textTransform: "uppercase", letterSpacing: "0.1em" }}>O arquivo</span>
              <span style={{ fontSize: 11, color: "#746e69", fontFamily: "monospace", fontVariantNumeric: "tabular-nums" }}>
                {useBook
                  ? `${booksInSelection.length} ${booksInSelection.length === 1 ? "book" : "books"}`
                  : `${pageCount} ${pageCount === 1 ? "pág." : "págs."}`}
              </span>
            </div>

            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
              {useBook ? (
                booksInSelection.map(b => (
                  <div key={b.url} style={{ backgroundColor: "#f5f3ff", border: "1px solid #ddd6fe", borderRadius: 6, padding: 8, height: 120, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: 4 }}>
                    <BookOpen aria-hidden="true" style={{ width: 18, height: 18, color: "#6d28d9" }} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#5b21b6", textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>{b.label}</span>
                    <span style={{ fontSize: 10, color: "#6d28d9", fontFamily: "monospace" }}>book completo · {b.count} peças cobertas</span>
                  </div>
                ))
              ) : paginasArtes.length === 0 ? (
                <p style={{ fontSize: 12, color: "#746e69", textAlign: "center", margin: "24px 0 0", lineHeight: 1.55 }}>
                  Nenhuma peça selecionada — o arquivo sairia vazio.
                </p>
              ) : (
                paginasArtes.map((pg, idx) => {
                  const legenda = pg.tipo === "capa" ? "capa"
                    : pg.tipo === "combinada" ? `${pg.grupo} · ${pg.itens.length} juntas`
                    : pg.grupo;
                  return (
                    <div key={idx}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4, gap: 8 }}>
                        <span style={{ fontSize: 10, color: "#78716c", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{legenda}</span>
                        <span style={{ fontSize: 10, color: "#a8a29e", fontFamily: "monospace", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{idx + 1}</span>
                      </div>
                      <div style={{
                        backgroundColor: "#fff", border: "1px solid #e7e5e4", borderRadius: 6, padding: 8,
                        display: "grid", gap: 5,
                        gridTemplateColumns: pg.tipo === "combinada" ? "1fr 1fr" : "1fr",
                        height: pg.tipo === "capa" ? 76 : 104,
                      }}>
                        {pg.tipo === "capa" && (
                          <div style={{ backgroundColor: "#fafaf9", borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", padding: 4 }}>
                            <span style={{ fontSize: 8, fontFamily: "monospace", textTransform: "uppercase", color: "#a8a29e", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pg.rotulo}</span>
                          </div>
                        )}
                        {pg.tipo === "combinada" && pg.itens.map((it: any) => (
                          <div key={it.id} style={{ backgroundColor: "#f3f4f3", borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", padding: 2 }}>
                            <span style={{ fontSize: 8, fontFamily: "monospace", textTransform: "uppercase", color: "#a8a29e" }}>{it.displayId}</span>
                          </div>
                        ))}
                        {pg.tipo === "unica" && (
                          <div style={{ backgroundColor: "#f3f4f3", borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", padding: 4 }}>
                            <span style={{ fontSize: 8, fontFamily: "monospace", textTransform: "uppercase", color: "#a8a29e" }}>{pg.item.displayId}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {!useBook && eventCount > 1 && (
              <label
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderTop: "1px solid #ebe8e4", cursor: "pointer", minHeight: 44, flexShrink: 0, backgroundColor: "#fff" }}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={groupByEvent}
                  onChange={e => setGroupByEvent(e.target.checked)}
                  data-testid="checkbox-capa-por-evento"
                />
                <span aria-hidden="true" style={{ width: 18, height: 18, borderRadius: 6, flexShrink: 0, border: `2px solid ${groupByEvent ? "#7c3aed" : "#d4d0ca"}`, backgroundColor: groupByEvent ? "#7c3aed" : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {groupByEvent && <CheckCircle style={{ width: 10, height: 10, color: "#fff" }} />}
                </span>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#1c1917" }}>Capa por evento</span>
              </label>
            )}
          </div>
        </div>

        {/* ══ Rodapé único ════════════════════════════════════════════════
            Havia um rodapé DENTRO da coluna esquerda, com a ação primária a
            meia largura e um "Cancelar" de largura inteira embaixo dela — a
            saída ocupando mais pixels que a ação. Agora a linha atravessa o
            modal: a resolução à esquerda, as ações à direita. */}
        <div style={{
          borderTop: "1px solid #ebe8e4", backgroundColor: "#fff",
          padding: "14px 24px", display: "flex", alignItems: "center", gap: 16,
          flexWrap: isMobile ? "wrap" : "nowrap", flexShrink: 0,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {cortadas > 0 ? (
              /* O AVISO PASSA A OFERECER A SAÍDA. Ele dizia "troque para as
                 artes" e deixava a pessoa procurar onde — com o controle a uma
                 tela de distância, no topo do modal. */
              <div style={{ display: "flex", alignItems: "center", gap: 8, backgroundColor: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 8, padding: "8px 10px" }}>
                <AlertTriangle aria-hidden="true" style={{ width: 14, height: 14, color: "#c2410c", flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: "#7c2d12", flex: 1, minWidth: 0 }}>
                  {cortadas} {cortadas === 1 ? "peça fica" : "peças ficam"} de fora — {cortadas === 1 ? "não está coberta" : "não estão cobertas"} por nenhum book.
                </span>
                <button
                  onClick={() => setSource("artes")}
                  data-testid="button-trocar-para-artes"
                  style={{ flexShrink: 0, height: 28, padding: "0 10px", borderRadius: 7, backgroundColor: "#fff", border: "1px solid #fdba74", color: "#9a3412", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                  Gerar das artes
                </button>
              </div>
            ) : (
              <p style={{ fontSize: 12, color: "#57534e", margin: 0, lineHeight: 1.5 }}>
                {useBook
                  ? "Sai o PDF original do evento, como a Arte enviou ao patrocinador."
                  : `${selected.length} ${selected.length === 1 ? "peça" : "peças"} em ${pageCount} ${pageCount === 1 ? "página" : "páginas"}, montadas a partir das artes aprovadas.`}
              </p>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <button
              onClick={() => onOpenChange(false)}
              style={{ height: 40, padding: "0 14px", borderRadius: 8, background: "none", border: "none", color: "#746e69", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
              Cancelar
            </button>

            {useBook ? (
              <>
                <button
                  onClick={() => {
                    booksInSelection.forEach(b => {
                      // window.open com "noopener" retorna SEMPRE null por
                      // especificação — o teste de pop-up dava falso positivo e
                      // os books seguintes não abriam.
                      const a = document.createElement("a");
                      a.href = b.url; a.target = "_blank"; a.rel = "noopener";
                      document.body.appendChild(a); a.click(); a.remove();
                    });
                    onOpenChange(false);
                  }}
                  data-testid="button-export-book"
                  style={{ height: 40, padding: "0 14px", borderRadius: 10, backgroundColor: "#f5f3ff", border: "1px solid #ddd6fe", color: "#5b21b6", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 7, cursor: "pointer", whiteSpace: "nowrap" }}>
                  <BookOpen style={{ width: 14, height: 14 }} />
                  Abrir completo
                </button>
                <button
                  onClick={() => setPickerOpen(true)}
                  data-testid="button-extract-book"
                  style={{ height: 46, padding: "0 18px", borderRadius: 10, backgroundColor: "#6d28d9", border: "none", color: "#fff", fontSize: 13, fontWeight: 800, display: "flex", alignItems: "center", gap: 8, cursor: "pointer", letterSpacing: "-0.01em", whiteSpace: "nowrap" }}>
                  <Scissors style={{ width: 15, height: 15 }} />
                  Escolher páginas
                </button>
              </>
            ) : (
              <button
                onClick={gerarArtes}
                disabled={primarioTravado}
                data-testid="button-export-confirm"
                style={{
                  height: 46, padding: "0 18px", borderRadius: 10,
                  backgroundColor: primarioTravado ? "#e7e5e4" : "#c2410c",
                  border: "none",
                  color: primarioTravado ? "#57534e" : "#fff",
                  fontSize: 13, fontWeight: 800,
                  display: "flex", alignItems: "center", gap: 8,
                  cursor: primarioTravado ? "not-allowed" : "pointer",
                  letterSpacing: "-0.01em", whiteSpace: "nowrap",
                }}>
                {/* MONTAR O PDF NÃO É INSTANTÂNEO com dezenas de imagens, e o
                    botão ficava mudo: sem retorno, a pessoa clica de novo. */}
                {exportando
                  ? <><Loader2 className="animate-spin" style={{ width: 15, height: 15 }} />Gerando…</>
                  : <><Printer style={{ width: 15, height: 15 }} />{selected.length === 0 ? "Gerar PDF" : `Gerar PDF — ${pageCount} pág.`}</>}
              </button>
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
