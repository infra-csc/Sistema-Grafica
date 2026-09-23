// Card de um evento no MOBILE — extraído da página (era um bloco de ~110
// linhas dentro do map). Mesmo comportamento: cabeçalho com prioridade e
// saída, semáforo das etapas, progresso e o drill expandindo inline.
import { memo } from "react";
import { ChevronDown, Truck } from "lucide-react";
import type { CobrancaEntry, PrazoEvent } from "@shared/prazos-contract";
import { Selo } from "@/components/ui/selo";
import { FONT, FS, FW } from "@/lib/theme";
import { EventDrilldown } from "./event-drilldown";
import { PrioridadeChip, PrioridadePonto } from "./prioridade";
import { ProgressoPecas } from "./progresso-pecas";
import { SeloRisco } from "./selo-risco";
import { StageCell } from "./stage-cell";
import { eventHasOverdue, fmtSaida, R, saidaChip, STAGE_SHORT, TI } from "./tokens";

interface CardMobilePrazosProps {
  ev: PrazoEvent;
  expanded: boolean;
  /** Recebe o id: a página passa UMA função estável para todos os cartões. */
  onToggle: (id: string) => void;
  cobranca?: CobrancaEntry;
  today?: string;
}

// `memo` pelo mesmo motivo do QuadroCard: a revalidação sem mudança e o tique
// do selo re-renderizam a página, e sem ele todos os cartões se refaziam.
export const CardMobilePrazos = memo(function CardMobilePrazos({ ev, expanded, onToggle, cobranca, today }: CardMobilePrazosProps) {
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
            fontFamily: FONT.display, textTransform: "uppercase",
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
          {/* Borda na cor do fundo: o chip de saída é tinta, sem contorno. */}
          <Selo title={chip.full} cores={{ bg: chip.bg, text: chip.color, border: chip.bg }}>
            {chip.text}
          </Selo>
          {ev.riskCritical && <SeloRisco />}
        </span>
      </div>

      {(ev.categoria === "semPecas" || ev.totalItems === 0) && (
        // SÓLIDO de propósito: é dano consumado (o contorno fica para o RISCO,
        // que é projeção). Branco sobre o vermelho de texto dá 6,5:1.
        <p style={{ margin: "10px 0 0" }}>
          <Selo forma="retangulo" cores={{ bg: TI.red, text: "#ffffff", border: TI.red }} style={{ fontSize: FS.meta }}>
            Nenhuma peça cadastrada
          </Selo>
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
        onClick={() => onToggle(ev.id)}
        aria-expanded={expanded}
        // aria-controls só quando o alvo existe no DOM (o drill é
        // renderizado condicionalmente) — referência pendurada é erro de AT.
        aria-controls={expanded ? `drill-${ev.id}` : undefined}
        data-testid={`button-expandir-${ev.id}`}
        // Nativo, e não <Botao>: é o rodapé-disclosure do cartão (largura
        // cheia, filete em cima). O realce de hover/foco vem da classe.
        className="gp-no-print ds-botao ds-botao-fantasma"
        style={{
          display: "flex", alignItems: "center", gap: 6, marginTop: 12,
          padding: "10px 0", width: "100%", justifyContent: "center", minHeight: 44,
          background: "none", border: "none", borderTop: `1px solid ${TI.border}`,
          fontSize: FS.meta, fontWeight: FW.forte, color: TI.strong, cursor: "pointer",
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
});
