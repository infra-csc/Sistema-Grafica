// Card de um evento no MOBILE — extraído da página (era um bloco de ~110
// linhas dentro do map). Mesmo comportamento: cabeçalho com prioridade e
// saída, semáforo das etapas, progresso e o drill expandindo inline.
import { ChevronDown, Truck } from "lucide-react";
import type { CobrancaEntry, PrazoEvent } from "@shared/prazos-contract";
import { EventDrilldown } from "./event-drilldown";
import { PrioridadeChip, PrioridadePonto } from "./prioridade";
import { ProgressoPecas } from "./progresso-pecas";
import { SeloRisco } from "./selo-risco";
import { StageCell } from "./stage-cell";
import { eventHasOverdue, fmtSaida, R, saidaChip, STAGE_SHORT, TI } from "./tokens";

interface CardMobilePrazosProps {
  ev: PrazoEvent;
  expanded: boolean;
  onToggle: () => void;
  cobranca?: CobrancaEntry;
  today?: string;
}

export function CardMobilePrazos({ ev, expanded, onToggle, cobranca, today }: CardMobilePrazosProps) {
  const chip = saidaChip(ev);
  return (
    <div style={{
      backgroundColor: TI.card, border: `1px solid ${eventHasOverdue(ev) ? TI.redEdge : TI.border}`,
      borderRadius: R.lg, padding: 14,
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <p style={{
            margin: 0, fontSize: 14, fontWeight: 800, color: TI.title,
            fontFamily: "'Space Grotesk', sans-serif", textTransform: "uppercase",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }} title={ev.name}>
            <PrioridadePonto priority={ev.priority} style={{ marginRight: 6 }} />
            {ev.name}
          </p>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: TI.secondary, display: "flex", alignItems: "center", gap: 5 }}>
            <Truck aria-hidden="true" style={{ width: 13, height: 13, flexShrink: 0 }} />
            Saída: {fmtSaida(ev.truckDepartureDate)}
          </p>
        </div>
        <span style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
          {/* Urgente/alta como CHIP: no mobile o nome do evento já compete
              com o chip de saída, e um ponto de 8px colado à esquerda dele
              era a única marca de prioridade da tela. */}
          <PrioridadeChip priority={ev.priority} />
          <span title={chip.full} style={{
            padding: "3px 9px", borderRadius: R.pill,
            backgroundColor: chip.bg, color: chip.color,
            fontSize: 11, fontWeight: 700, whiteSpace: "nowrap",
          }}>
            {chip.text}
          </span>
          {ev.riskCritical && <SeloRisco />}
        </span>
      </div>

      {(ev.categoria === "semPecas" || ev.totalItems === 0) && (
        <p style={{ margin: "10px 0 0", fontSize: 12, fontWeight: 700, color: "#ffffff", backgroundColor: TI.red, borderRadius: R.sm, padding: "3px 9px", display: "inline-block" }}>
          Nenhuma peça cadastrada
        </p>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", gap: 4, marginTop: 12 }}>
        {ev.stages.map((s) => (
          <div key={s.key} style={{ flex: 1, minWidth: 0, textAlign: "center" }}>
            <StageCell stage={s} invalidDate={ev.invalidDate} />
            <span style={{ display: "block", fontSize: 10, color: TI.label, marginTop: 2, letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {STAGE_SHORT[s.key] ?? s.label}
            </span>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 12 }}>
        <ProgressoPecas delivered={ev.deliveredItems} total={ev.totalItems} variant="empilhado" />
      </div>

      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        // aria-controls só quando o alvo existe no DOM (o drill é
        // renderizado condicionalmente) — referência pendurada é erro de AT.
        aria-controls={expanded ? `drill-${ev.id}` : undefined}
        data-testid={`button-expandir-${ev.id}`}
        className="gp-no-print"
        style={{
          display: "flex", alignItems: "center", gap: 6, marginTop: 12,
          padding: "10px 0", width: "100%", justifyContent: "center", minHeight: 44,
          background: "none", border: "none", borderTop: `1px solid ${TI.border}`,
          fontSize: 12, fontWeight: 700, color: TI.strong, cursor: "pointer",
        }}
      >
        <ChevronDown aria-hidden="true" style={{
          width: 15, height: 15,
          transform: expanded ? "rotate(180deg)" : "none",
          transition: "transform 0.15s ease",
        }} />
        {expanded ? "Esconder pendências" : "Ver o que está travando"}
      </button>
      {expanded && (
        <div id={`drill-${ev.id}`}>
          <EventDrilldown ev={ev} cobranca={cobranca} today={today} />
        </div>
      )}
    </div>
  );
}
