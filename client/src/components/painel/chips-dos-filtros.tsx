// ─── Chips dos filtros ativos ───────────────────────────────────────────────
// A seleção inteira num relance, cada filtro removível individualmente sem
// reabrir dropdown por dropdown. O "Limpar" da toolbar continua sendo o
// limpa-tudo.
import type { Sponsor } from "@shared/schema";
import { getStatusLabel } from "@/lib/status";
import { FilterChip } from "./chip-de-filtro";
import { DATE_FILTER_LABELS, FOCO_LABELS } from "./regras";
import type { FiltrosDoPainel } from "./use-filtros-do-painel";

export function ChipsDosFiltros({ filtros, useCards, nomeDoEvento, sponsors }: {
  filtros: FiltrosDoPainel;
  useCards: boolean;
  nomeDoEvento: (id: string) => string | undefined;
  sponsors: Sponsor[];
}) {
  const {
    searchTerm, setSearchInput, setSearchTerm, eventFilter, setEventFilter, typeFilter, setTypeFilter,
    sponsorFilter, setSponsorFilter, statusFilter, setStatusFilter, dateFilter, setDateFilter,
    focoFilter, setFocoFilter,
  } = filtros;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginTop: -12 }}>
      {searchTerm && (
        <FilterChip isMobile={useCards} label={`Busca: "${searchTerm}"`} onRemove={() => { setSearchInput(""); setSearchTerm(""); }} />
      )}
      {eventFilter.map(id => (
        <FilterChip isMobile={useCards} key={`ev-${id}`} label={`Evento: ${nomeDoEvento(id) ?? id}`} onRemove={() => setEventFilter(prev => prev.filter(v => v !== id))} />
      ))}
      {typeFilter.map(t => (
        <FilterChip isMobile={useCards} key={`tp-${t}`} label={`Tipo: ${t}`} onRemove={() => setTypeFilter(prev => prev.filter(v => v !== t))} />
      ))}
      {sponsorFilter.map(id => (
        <FilterChip isMobile={useCards} key={`sp-${id}`} label={`Patrocinador: ${sponsors.find(s => s.id === id)?.name ?? id}`} onRemove={() => setSponsorFilter(prev => prev.filter(v => v !== id))} />
      ))}
      {statusFilter.map(s => (
        <FilterChip isMobile={useCards} key={`st-${s}`} label={`Status: ${s === "deleted" ? "Excluídos" : getStatusLabel(s)}`} onRemove={() => setStatusFilter(prev => prev.filter(v => v !== s))} />
      ))}
      {dateFilter.map(d => (
        <FilterChip isMobile={useCards} key={`dt-${d}`} label={`Saída: ${DATE_FILTER_LABELS[d] ?? d}`} onRemove={() => setDateFilter(prev => prev.filter(v => v !== d))} />
      ))}
      {focoFilter.map(f => (
        <FilterChip isMobile={useCards} key={`fc-${f}`} label={`Foco: ${FOCO_LABELS[f] ?? f}`} onRemove={() => setFocoFilter(prev => prev.filter(v => v !== f))} />
      ))}
    </div>
  );
}
