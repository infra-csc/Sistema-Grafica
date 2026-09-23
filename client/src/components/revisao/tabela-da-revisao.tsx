// A fila em TABELA (área útil ≥ 820px): cabeçalho, uma faixa por evento e uma
// linha memoizada por peça. SEM ROLAGEM LATERAL: layout fixo — as colunas de
// dado têm largura, a Peça fica com o resto e QUEBRA linha em vez de alargar
// a tabela.
import { Fragment } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { EstoqueDaLinha } from "@/components/consulta-de-estoque/na-revisao";
import type { SeloPecaEventoFinalizado } from "@/lib/status";
import { T, FS, R } from "@/lib/theme";
import { TI } from "./regras";
import { CabecalhoDoEvento } from "./cabecalho-do-evento";
import { LinhaDaPeca } from "./linha-da-peca";
import type { EventoDaPeca, PecaDaRevisao } from "./tipos";

export function TabelaDaRevisao({
  itemsByEvent, getEventInfo, selectedItemIds, setSelectedItemIds, toggleAll, totalFiltradas, totalNaFila,
  typeToGroup, seloDoItem, estoquePorPeca, falhasPorId, desfazendoReuse, compacto, colunasDeDados,
  dedo, admin, agora, aoAbrir, aoMarcar, aoReaproveitar, aoExcluir,
}: {
  itemsByEvent: Map<string, PecaDaRevisao[]>;
  getEventInfo: (eventId: string) => EventoDaPeca | undefined;
  selectedItemIds: Set<string>;
  setSelectedItemIds: Dispatch<SetStateAction<Set<string>>>;
  toggleAll: () => void;
  totalFiltradas: number;
  totalNaFila: number;
  typeToGroup: Record<string, string>;
  seloDoItem: (item: PecaDaRevisao) => SeloPecaEventoFinalizado | null;
  estoquePorPeca: Map<string, EstoqueDaLinha>;
  falhasPorId: Record<string, string>;
  desfazendoReuse: (id: string) => boolean;
  compacto: boolean;
  colunasDeDados: number;
  dedo: boolean;
  admin: boolean;
  /** O relógio da página, ao minuto (useRelogioDoMinuto). */
  agora: number;
  aoAbrir: (item: PecaDaRevisao) => void;
  aoMarcar: (id: string) => void;
  aoReaproveitar: (item: PecaDaRevisao) => void;
  aoExcluir: (id: string) => void;
}) {
  return (
    <div style={{ backgroundColor: T.surface, border: `1px solid ${T.border}`, borderRadius: R.md, overflowX: "auto", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
      <table style={{ width: "100%", tableLayout: "fixed", textAlign: "left", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ backgroundColor: T.bg, borderBottom: `1px solid ${T.border}` }}>
            {/* Select all */}
            <th style={{ padding: "14px 24px", width: 48, textAlign: "center" }}>
              <input
                type="checkbox"
                checked={selectedItemIds.size === totalFiltradas && totalFiltradas > 0}
                ref={el => { if (el) el.indeterminate = selectedItemIds.size > 0 && selectedItemIds.size < totalFiltradas; }}
                onChange={toggleAll}
                aria-label="Selecionar todos"
                data-testid="checkbox-select-all-header"
                style={{ accentColor: T.accent, width: 20, height: 20, cursor: "pointer" }}
              />
            </th>
            {[
              // QUATRO COLUNAS: ID, Tipo e Descrição identificam a MESMA peça
              // (uma coluna, "Peça"); Qtd, Dim e M² são a mesma medida contada
              // de três jeitos (outra).
              //
              // No COMPACTO a medida funde na célula da Peça (segunda linha) —
              // ver `colunasDeDados`, perto da régua, na página.
              { label: "Peça", w: undefined },
              { label: "Qtd · Dim · m²", w: 230, fundeNoCompacto: true },
              { label: "Arquivo final", w: 140 },
              { label: "Ações", w: 160, right: true },
            ].filter(col => !(compacto && col.fundeNoCompacto)).map(col => (
              <th
                key={col.label}
                style={{
                  padding: "14px 16px",
                  width: col.w,
                  textAlign: col.right ? "right" : "left",
                  fontSize: FS.micro, fontWeight: 900,
                  textTransform: "uppercase", letterSpacing: "0.1em",
                  // T.apoio (#7a6154 = 5,49:1 sobre o thead) — o tom que as
                  // outras telas usam em rótulo de coluna.
                  color: T.apoio,
                }}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from(itemsByEvent.entries()).map(([eventId, eventItems]) => {
            const event = getEventInfo(eventId);
            const groupSelected = eventItems.every(i => selectedItemIds.has(i.id));
            const toggleGroup = () => {
              setSelectedItemIds(prev => {
                const next = new Set(prev);
                if (groupSelected) eventItems.forEach(i => next.delete(i.id));
                else eventItems.forEach(i => next.add(i.id));
                return next;
              });
            };

            return (
              <Fragment key={eventId}>
                <CabecalhoDoEvento
                  eventId={eventId}
                  event={event}
                  total={eventItems.length}
                  grupoMarcado={groupSelected}
                  aoMarcarGrupo={toggleGroup}
                  colunasDeDados={colunasDeDados}
                />
                {eventItems.map((item, idx) => {
                  const prevItem = idx > 0 ? eventItems[idx - 1] : null;
                  const showTypeHeader = !prevItem || prevItem.type !== item.type;
                  const itemGroupName = typeToGroup[item.type] || '';
                  const prevItemGroupName = prevItem ? (typeToGroup[prevItem.type] || '') : '';
                  const showGroupHeader = showTypeHeader && itemGroupName !== '' && itemGroupName !== prevItemGroupName;
                  return (
                    <LinhaDaPeca
                      key={item.id}
                      item={item}
                      selecionada={selectedItemIds.has(item.id)}
                      // Evento finalizado: selo na linha e ações barradas
                      // desabilitadas. Ver `pendingItems`, no hook da fila.
                      selo={seloDoItem(item)}
                      ultima={idx === eventItems.length - 1}
                      mostraTipo={showTypeHeader}
                      grupo={showGroupHeader ? itemGroupName : ''}
                      compacto={compacto}
                      colunasDeDados={colunasDeDados}
                      estoque={estoquePorPeca.get(item.id)}
                      falha={falhasPorId[item.id]}
                      desfazendo={desfazendoReuse(item.id)}
                      dedo={dedo}
                      admin={admin}
                      agora={agora}
                      aoAbrir={aoAbrir}
                      aoMarcar={aoMarcar}
                      aoReaproveitar={aoReaproveitar}
                      aoExcluir={aoExcluir}
                    />
                  );
                })}
              </Fragment>
            );
          })}
        </tbody>
      </table>

      {/* Rodapé da tabela: só a contagem. As ações de lote moram na barra
          fixa — uma cópia delas aqui contava a seleção crua em vez das peças
          que de fato vão. */}
      <div style={{
        backgroundColor: T.bg, padding: "12px 24px",
        borderTop: `1px solid ${T.border}`,
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <span style={{ fontSize: FS.micro, fontWeight: 700, color: TI.secondary, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Mostrando {totalFiltradas} de {totalNaFila} {totalNaFila !== 1 ? "peças aguardando revisão" : "peça aguardando revisão"}
        </span>
      </div>
    </div>
  );
}
