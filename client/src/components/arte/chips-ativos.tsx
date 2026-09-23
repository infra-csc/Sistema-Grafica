import { useMemo } from "react";
import { X } from "lucide-react";
import { alvo } from "@/hooks/use-mobile";
import { T, TOM, R } from "@/lib/theme";
import { FILTROS_ESCONDIDOS, PARADA_HA_MAIS_DE, months } from "./constantes";
import type { ActiveChip, EventoDaPeca, PatrocinadorDaPeca, PecaDaCorrecao } from "./tipos";
import type { FiltrosDaArte } from "./use-filtros-da-arte";

/** Os chips de "Ativos:", como cada um se remove e quantos moram em "Mais filtros". */
export function useChipsAtivos(filtros: FiltrosDaArte, { events, uniqueSponsors, correcaoItems }: {
  events: EventoDaPeca[];
  uniqueSponsors: PatrocinadorDaPeca[];
  correcaoItems: PecaDaCorrecao[];
}) {
  const {
    eventFilter, setEventFilter, sponsorFilter, setSponsorFilter, typeFilter, setTypeFilter,
    materialFilter, setMaterialFilter, monthFilter, setMonthFilter, next10DaysFilter, setNext10DaysFilter,
    periodFilter, setPeriodFilter, urgenteFilter, setUrgenteFilter, atrasadoFilter, setAtrasadoFilter,
    paradasFilter, setParadasFilter, thumbFilter, setThumbFilter, finalFilter, setFinalFilter,
    searchFilter, setSearchFilter, correcaoSponsorFilter, setCorrecaoSponsorFilter,
  } = filtros;
  // ─── ACTIVE CHIPS ──────────────────────────────────────────────────────────
  // Cada chip carrega o próprio filtro ({kind, id}) e é removido por
  // identidade, não por parsing do rótulo — o X do chip de Evento, por
  // exemplo, dependia de um window.__evList que nunca existiu e não fazia nada.
  const activeChips = useMemo<ActiveChip[]>(() => {
    const chips: ActiveChip[] = [];
    eventFilter.forEach(id => {
      const ev = events.find((e) => e.id === id);
      chips.push({ kind: 'event', id, label: `Evento: ${ev?.name || 'Selecionado'}` });
    });
    sponsorFilter.forEach(id => {
      const sp = uniqueSponsors.find((s) => s.id === id);
      chips.push({ kind: 'sponsor', id, label: `Patrocinador: ${sp?.name || 'Selecionado'}` });
    });
    typeFilter.forEach(t => chips.push({ kind: 'type', id: t, label: `Tipo: ${t}` }));
    materialFilter.forEach(m => chips.push({ kind: 'material', id: m, label: `Material: ${m}` }));
    monthFilter.forEach(v => {
      const m = months.find(x => x.value === v);
      chips.push({ kind: 'month', id: v, label: `Mês: ${m?.label || v}` });
    });
    if (next10DaysFilter) chips.push({ kind: 'next10', label: "Próximos 10 dias" });
    if (periodFilter !== "Todos") chips.push({ kind: 'period', label: `Período: ${periodFilter}` });
    if (urgenteFilter) chips.push({ kind: 'urgente', label: "Urgente" });
    if (atrasadoFilter) chips.push({ kind: 'atrasado', label: "Só atrasadas" });
    if (paradasFilter) chips.push({ kind: 'paradas', label: `Paradas há mais de ${PARADA_HA_MAIS_DE}d` });
    if (thumbFilter !== "todos") chips.push({ kind: 'thumb', label: thumbFilter === "sem" ? "Sem thumb" : "Com thumb" });
    if (finalFilter !== "todos") chips.push({ kind: 'final', label: finalFilter === "sem" ? "Sem arquivo final" : "Com arquivo final" });
    if (searchFilter) chips.push({ kind: 'search', label: `Busca: "${searchFilter}"` });
    // O filtro local da aba Correção existia sem aparecer em lugar nenhum.
    if (correcaoSponsorFilter !== "all") {
      const nome = correcaoItems
        .flatMap((i) => i.awaitingArteApprovals || [])
        .find((a) => a.sponsorId === correcaoSponsorFilter)?.sponsor?.name;
      chips.push({ kind: 'correcaoSponsor', label: `Correção · ${nome || 'patrocinador'}` });
    }
    return chips;
  }, [eventFilter, sponsorFilter, typeFilter, materialFilter, monthFilter, next10DaysFilter, periodFilter, urgenteFilter, atrasadoFilter, paradasFilter, thumbFilter, finalFilter, searchFilter, correcaoSponsorFilter, correcaoItems, events, uniqueSponsors]);

  const removeChipFilter = (chip: ActiveChip) => {
    switch (chip.kind) {
      case 'event': setEventFilter(prev => prev.filter(v => v !== chip.id)); break;
      case 'sponsor': setSponsorFilter(prev => prev.filter(v => v !== chip.id)); break;
      case 'type': setTypeFilter(prev => prev.filter(v => v !== chip.id)); break;
      case 'material': setMaterialFilter(prev => prev.filter(v => v !== chip.id)); break;
      case 'month': setMonthFilter(prev => prev.filter(v => v !== chip.id)); break;
      case 'next10': setNext10DaysFilter(false); break;
      case 'period': setPeriodFilter("Todos"); break;
      case 'urgente': setUrgenteFilter(false); break;
      case 'atrasado': setAtrasadoFilter(false); break;
      case 'paradas': setParadasFilter(false); break;
      case 'thumb': setThumbFilter("todos"); break;
      case 'final': setFinalFilter("todos"); break;
      case 'search': setSearchFilter(""); break;
      case 'correcaoSponsor': setCorrecaoSponsorFilter("all"); break;
    }
  };

  // Quantos recortes ligados moram ATRÁS do botão "Mais filtros" — o número
  // do botão. Conta como os chips contam (um por valor escolhido), para o
  // "(2)" do botão bater com os dois chips da linha de baixo.
  const nFiltrosEscondidos = activeChips.filter(c => FILTROS_ESCONDIDOS.has(c.kind)).length;
  return { activeChips, removeChipFilter, nFiltrosEscondidos };
}

// Com a faixa "Mais filtros" ABERTA os controles escondidos estão à vista e
// dizem o próprio estado: a linha fica só com o que não mora nela (evento,
// busca, paradas, Correção). FECHADA (ou no celular), os escondidos que
// estiverem ligados aparecem aqui — ninguém fica com a lista "sumida" sem
// saber por quê.
export function ChipsAtivos({ activeChips, removeChipFilter, clearAllFilters, maisFiltrosAberto, isMobile, dedo }: {
  activeChips: ActiveChip[];
  removeChipFilter: (chip: ActiveChip) => void;
  clearAllFilters: () => void;
  maisFiltrosAberto: boolean;
  isMobile: boolean;
  dedo: boolean;
}) {
  const chipsVisiveis = !isMobile && maisFiltrosAberto
    ? activeChips.filter(c => !FILTROS_ESCONDIDOS.has(c.kind))
    : activeChips;
  if (chipsVisiveis.length === 0) return null;
  return (
    <div data-testid="linha-chips-ativos" style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: T.apoio, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Ativos:</span>
      {chipsVisiveis.map(chip => (
        <span key={`${chip.kind}-${chip.id ?? ''}`} data-testid={`chip-ativo-${chip.kind}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, padding: '0 2px 0 9px', minHeight: alvo(24, dedo), borderRadius: R.pill, background: TOM.laranja.bg, border: `1px solid ${TOM.laranja.border}`, fontSize: 11, fontWeight: 600, color: T.accentText }}>
          {chip.label}
          {/* O × tinha 9×9px de alvo. 22px de caixa (dentro do chip de
              24) passa o mínimo de 24 do WCAG 2.5.8 somado à borda;
              no celular o alvo vai a 44. */}
          <button onClick={() => removeChipFilter(chip)} aria-label={`Remover filtro ${chip.label}`} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.accentText, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: dedo ? 40 : 22, height: dedo ? 40 : 22, borderRadius: R.pill, padding: 0 }}>
            <X aria-hidden="true" style={{ width: 10, height: 10 }} />
          </button>
        </span>
      ))}
      <button onClick={clearAllFilters} data-testid="button-clear-filters" style={{ fontSize: 11, fontWeight: 600, color: T.apoio, background: 'none', border: `1px solid ${T.border}`, borderRadius: 999, cursor: 'pointer', padding: '0 10px', minHeight: alvo(24, dedo) }}>
        Limpar tudo
      </button>
      {/* O aviso só importa quando há recorte ativo — e aí ele mora
          aqui, na linha que mostra o recorte. */}
      <span style={{ fontSize: 11, color: T.apoio }}>
        as contagens das abas seguem este recorte
      </span>
    </div>
  );
}
