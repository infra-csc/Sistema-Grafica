// Tabela desktop da Gestão de Prazos — extraída da página (era um bloco de
// ~170 linhas dentro do orquestrador). Mesmo comportamento: thead sticky num
// scrollport próprio, linha expande o drill inline, e na impressão todos os
// atrasados abrem sozinhos.
//
// maxHeight + overflow auto: o thead sticky precisa de um scrollport — com
// 20+ eventos os cabeçalhos das etapas seguem visíveis no scroll. `gp-scroll`
// solta esse teto na impressão (o Chromium recortava tudo o que passasse da
// primeira dobra).
import { Fragment } from "react";
import { ChevronDown } from "lucide-react";
import { Link } from "wouter";
import type { CobrancaEntry, PrazoEvent } from "@shared/prazos-contract";
import { EventDrilldown } from "./event-drilldown";
import { PrioridadeChip, PrioridadePonto, temChipDePrioridade } from "./prioridade";
import { ProgressoPecas } from "./progresso-pecas";
import { SeloRisco } from "./selo-risco";
import { StageCell } from "./stage-cell";
import {
  eventHasOverdue, fmtSaida, R, saidaChip, SCROLLPORT_MAX_H, STAGE_SHORT,
  TH_STICKY, TI,
} from "./tokens";

interface TabelaPrazosProps {
  eventos: PrazoEvent[];
  stageMeta: { key: string; label: string }[];
  expandedId: string | null;
  onToggleExpand: (id: string | null) => void;
  /** Em impressão todos os atrasados abrem — a pauta é a lista de peças. */
  printMode: boolean;
  /** Registro de cobrança por evento (a página resolve a chave do mapa). */
  cobrancaDe: (id: string) => CobrancaEntry | undefined;
  today?: string;
}

export function TabelaPrazos({
  eventos, stageMeta, expandedId, onToggleExpand, printMode, cobrancaDe, today,
}: TabelaPrazosProps) {
  return (
    <div className="gp-scroll" style={{
      backgroundColor: TI.card, border: `1px solid ${TI.border}`, borderRadius: R.lg,
      // Token compartilhado com as colunas do quadro: os dois scrollports
      // começam na mesma altura da página, então dois valores seriam duas
      // medições do mesmo espaço.
      overflow: "auto", maxHeight: SCROLLPORT_MAX_H,
    }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
        <caption className="sr-only">Eventos ativos, prazos de cada etapa e peças entregues</caption>
        <thead>
          <tr>
            <th scope="col" style={{ ...TH_STICKY, textAlign: "left", paddingLeft: 18, minWidth: 220 }}>Evento</th>
            <th scope="col" style={{ ...TH_STICKY, textAlign: "left", minWidth: 150 }}>Saída</th>
            {stageMeta.map((m) => (
              <th key={m.key} scope="col" style={{ ...TH_STICKY, minWidth: 78 }} title={m.label}>
                {STAGE_SHORT[m.key] ?? m.label}
              </th>
            ))}
            <th scope="col" style={{ ...TH_STICKY, minWidth: 110 }}>Entregues</th>
            <th scope="col" style={{ ...TH_STICKY, width: 46 }}>
              <span className="sr-only">Detalhes</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {eventos.map((ev) => {
            const chip = saidaChip(ev);
            // Na impressão TODOS os atrasados abrem: a pauta da reunião é
            // justamente a lista de peças, e ela vivia só no expandido.
            const expanded = expandedId === ev.id || (printMode && eventHasOverdue(ev));
            const overdue = eventHasOverdue(ev);
            const semPecas = ev.categoria === "semPecas" || ev.totalItems === 0;
            return (
              <Fragment key={ev.id}>
                <tr
                  className="gp-row"
                  style={{
                    borderBottom: expanded ? "none" : `1px solid ${TI.rule}`,
                    backgroundColor: overdue ? TI.redRow : "transparent",
                  }}
                >
                  <th scope="row" style={{
                    padding: "12px 8px 12px 18px", verticalAlign: "middle", maxWidth: 320,
                    textAlign: "left", fontWeight: 400,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                      <PrioridadePonto priority={ev.priority} />
                      {/* minWidth 0 no flex item: sem ele o ellipsis nunca
                          dispara e um nome gigante alarga a coluna toda. */}
                      <Link
                        href={`/eventos/${ev.id}`}
                        data-testid={`link-evento-${ev.id}`}
                        title={ev.name}
                        style={{
                          fontSize: 13, fontWeight: 800, color: TI.title, textDecoration: "none",
                          fontFamily: "'Space Grotesk', sans-serif", textTransform: "uppercase",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          minWidth: 0, flex: "0 1 auto",
                        }}
                      >
                        {ev.name}
                      </Link>
                    </div>
                    <span style={{ display: "block", fontSize: 11, color: TI.label, marginTop: 2 }}>
                      Início: {fmtSaida(ev.startDate)}
                    </span>
                    {/* Selos na TERCEIRA linha, não ao lado do nome: a coluna
                        tem minWidth 220 e um chip "URGENTE" de ~64px antes do
                        link comeria justamente o texto que a tela existe para
                        deixar legível. */}
                    {(semPecas || temChipDePrioridade(ev.priority)) && (
                      <span style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 4 }}>
                        <PrioridadeChip priority={ev.priority} />
                        {semPecas && (
                          <span style={{
                            display: "inline-block", padding: "1px 8px", borderRadius: R.sm,
                            backgroundColor: TI.red, color: "#ffffff", fontSize: 10, fontWeight: 800,
                            textTransform: "uppercase", letterSpacing: "0.05em",
                          }}>
                            sem peças
                          </span>
                        )}
                      </span>
                    )}
                  </th>
                  <td style={{ padding: "12px 8px", verticalAlign: "middle" }}>
                    <span style={{ display: "block", fontSize: 12, fontWeight: 600, color: TI.strong }}>
                      {fmtSaida(ev.truckDepartureDate)}
                    </span>
                    <span title={chip.full} style={{
                      display: "inline-block", marginTop: 3, padding: "2px 8px", borderRadius: R.pill,
                      backgroundColor: chip.bg, color: chip.color, fontSize: 11, fontWeight: 700,
                    }}>
                      {chip.text}
                    </span>
                    {ev.riskCritical && (
                      <SeloRisco style={{ display: "inline-block", marginTop: 3, marginLeft: 5 }} />
                    )}
                  </td>
                  {ev.stages.map((s) => (
                    <td key={s.key} style={{ padding: "10px 4px", verticalAlign: "middle", textAlign: "center" }}>
                      <StageCell stage={s} invalidDate={ev.invalidDate} />
                    </td>
                  ))}
                  <td style={{ padding: "12px 8px", verticalAlign: "middle", textAlign: "center" }}>
                    <ProgressoPecas delivered={ev.deliveredItems} total={ev.totalItems} variant="coluna" />
                  </td>
                  <td style={{ padding: "12px 12px 12px 4px", verticalAlign: "middle", textAlign: "center" }}>
                    <button
                      type="button"
                      onClick={() => onToggleExpand(expanded ? null : ev.id)}
                      aria-expanded={expanded}
                      aria-controls={expanded ? `drill-${ev.id}` : undefined}
                      aria-label={expanded ? `Esconder pendências de ${ev.name}` : `Ver pendências de ${ev.name}`}
                      data-testid={`button-expandir-${ev.id}`}
                      className="gp-no-print"
                      style={{
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                        // 36 e não 30: a linha já tem ~50px de conteúdo
                        // (nome + início + selos), então o alvo padrão da
                        // casa cabe sem esticar nada.
                        width: 36, height: 36, borderRadius: R.md,
                        border: `1px solid ${TI.border}`, backgroundColor: TI.card, cursor: "pointer",
                      }}
                    >
                      <ChevronDown aria-hidden="true" style={{
                        width: 15, height: 15, color: TI.strong,
                        transform: expanded ? "rotate(180deg)" : "none",
                        transition: "transform 0.15s ease",
                      }} />
                    </button>
                  </td>
                </tr>
                {expanded && (
                  <tr style={{ borderBottom: `1px solid ${TI.rule}`, backgroundColor: TI.sunken }}>
                    {/* colSpan derivado: era o último espelho local do
                        número de etapas (nome + saída + etapas + entregues + ação). */}
                    <td id={`drill-${ev.id}`} colSpan={stageMeta.length + 4} style={{ padding: "4px 18px 12px" }}>
                      <EventDrilldown ev={ev} cobranca={cobrancaDe(ev.id)} today={today} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
