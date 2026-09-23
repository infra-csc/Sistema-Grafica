// Tabela desktop da Gestão de Prazos — extraída da página (era um bloco de
// ~170 linhas dentro do orquestrador). Mesmo comportamento: thead sticky num
// scrollport próprio, linha expande o drill inline, e na impressão todos os
// atrasados abrem sozinhos.
//
// maxHeight + overflow auto: o thead sticky precisa de um scrollport — com
// 20+ eventos os cabeçalhos das etapas seguem visíveis no scroll. `gp-scroll`
// solta esse teto na impressão (o Chromium recortava tudo o que passasse da
// primeira dobra).
import { Fragment, memo } from "react";
import { ChevronDown } from "lucide-react";
import { Link } from "wouter";
import type { CobrancaEntry, PrazoEvent } from "@shared/prazos-contract";
import { Botao } from "@/components/ui/botao";
import { Selo } from "@/components/ui/selo";
import { FONT } from "@/lib/theme";
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
  /**
   * Área útil entre 820 e 1180px (ver a régua em use-mobile.tsx): "Saída"
   * funde-se à coluna do evento e a tabela perde ~150px de mínimo, em vez de
   * rolar de lado escondendo as colunas da direita.
   */
  compacto?: boolean;
  /** Lado do botão de expandir; 44 quando o ponteiro é grosso (tablet). */
  alvoBotao?: number;
}

export function TabelaPrazos({
  eventos, stageMeta, expandedId, onToggleExpand, printMode, cobrancaDe, today,
  compacto = false, alvoBotao = 36,
}: TabelaPrazosProps) {
  return (
    <div className="gp-scroll" style={{
      backgroundColor: TI.card, border: `1px solid ${TI.border}`, borderRadius: R.lg,
      // Token compartilhado com as colunas do quadro: os dois scrollports
      // começam na mesma altura da página, então dois valores seriam duas
      // medições do mesmo espaço.
      overflow: "auto", maxHeight: SCROLLPORT_MAX_H,
    }}>
      {/* `tabular-nums` na TABELA, e não em cada célula: a propriedade é
          herdada, e a tabela tem numeral em oito lugares (as duas datas, os
          seis "13d" das etapas, a fração de entregues). Declarar uma vez é o
          que impede o nono aparecer sem ela. Sem isto as colunas de data
          desalinham porque "1" é mais estreito que "8". */}
      <table style={{
        width: "100%", borderCollapse: "collapse", minWidth: compacto ? 740 : 900,
        fontVariantNumeric: "tabular-nums",
      }}>
        <caption className="sr-only">Eventos ativos, prazos de cada etapa e peças entregues</caption>
        <thead>
          <tr>
            <th scope="col" style={{ ...TH_STICKY, textAlign: "left", paddingLeft: 18, minWidth: compacto ? 200 : 220 }}>
              {compacto ? "Evento · Saída" : "Evento"}
            </th>
            {!compacto && <th scope="col" style={{ ...TH_STICKY, textAlign: "left", minWidth: 150 }}>Saída</th>}
            {stageMeta.map((m) => (
              <th key={m.key} scope="col" style={{ ...TH_STICKY, minWidth: 78 }}>
                {/* O rótulo inteiro ia só no `title`: no tablet não há hover e
                    "Apro"/"Prod" sozinhos não dizem a etapa. Agora é texto,
                    escondido apenas visualmente. */}
                <span aria-hidden="true">{STAGE_SHORT[m.key] ?? m.label}</span>
                <span className="sr-only">{m.label}</span>
              </th>
            ))}
            <th scope="col" style={{ ...TH_STICKY, minWidth: 110 }}>Entregues</th>
            <th scope="col" style={{ ...TH_STICKY, width: 46 }}>
              <span className="sr-only">Detalhes</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {eventos.map((ev) => (
            <LinhaEvento
              key={ev.id}
              ev={ev}
              // Na impressão TODOS os atrasados abrem: a pauta da reunião é
              // justamente a lista de peças, e ela vivia só no expandido.
              expanded={expandedId === ev.id || (printMode && eventHasOverdue(ev))}
              colSpan={stageMeta.length + (compacto ? 3 : 4)}
              cobranca={cobrancaDe(ev.eventId ?? ev.id)}
              today={today}
              onToggleExpand={onToggleExpand}
              compacto={compacto}
              alvoBotao={alvoBotao}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Uma linha da tabela (e o drill expandido logo abaixo dela).
 *
 * `memo` de propósito: a tabela é redesenhada a cada render da página — a
 * revalidação de 60s, a mensagem do WebSocket, o tique de 1 min do selo "há X
 * min", abrir o modal — e sem ele as ~70 linhas, com seis células de semáforo
 * cada, se refaziam inteiras para produzir exatamente o mesmo DOM. Todas as
 * props são estáveis quando o dado não muda: `ev` e `cobranca` preservam a
 * identidade pelo structural sharing do React Query, `expanded` é booleano e
 * `onToggleExpand` é o setter de estado da página.
 */
const LinhaEvento = memo(function LinhaEvento({
  ev, expanded, colSpan, cobranca, today, onToggleExpand, compacto, alvoBotao,
}: {
  ev: PrazoEvent;
  expanded: boolean;
  /** nome + saída + etapas + entregues + ação. */
  colSpan: number;
  cobranca?: CobrancaEntry;
  today?: string;
  onToggleExpand: (id: string | null) => void;
  compacto: boolean;
  alvoBotao: number;
}) {
  const chip = saidaChip(ev);
  const overdue = eventHasOverdue(ev);
  const semPecas = ev.categoria === "semPecas" || ev.totalItems === 0;
  return (
    <Fragment>
      <tr
        className="gp-row"
        style={{
          // `track` e não `rule`: a régua entre linhas ficou mais
          // clara para a densidade nova. A do rodapé do bloco
          // expandido continua em `rule` de propósito — ela fecha
          // um GRUPO, e linha de grupo pode ser mais forte que
          // linha de item.
          borderBottom: expanded ? "none" : `1px solid ${TI.track}`,
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
            {/* DUAS LINHAS, e não uma com reticências. O nome do evento é a
                chave de leitura da tela inteira e "CAMPEONATO BRASILEIRO D…"
                não distingue dois eventos do mesmo campeonato. O texto completo
                estava só no `title`, que no tablet não existe. */}
            <Link
              href={`/eventos/${ev.eventId ?? ev.id}`}
              data-testid={`link-evento-${ev.id}`}
              style={{
                fontSize: 13, fontWeight: 800, color: TI.title, textDecoration: "none",
                fontFamily: FONT.display, textTransform: "uppercase",
                display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                overflow: "hidden", overflowWrap: "anywhere", lineHeight: 1.25,
                minWidth: 0, flex: "0 1 auto",
              }}
            >
              {ev.name}
            </Link>
          </div>
          <span style={{ display: "block", fontSize: 11, color: TI.label, marginTop: 2 }}>
            Início: {fmtSaida(ev.startDate)}
          </span>
          {/* Na densidade compacta a coluna "Saída" desce para cá: mesma
              informação, ~150px a menos de largura mínima. */}
          {compacto && (
            <span style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 5, marginTop: 3 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: TI.strong }}>
                Saída: {fmtSaida(ev.truckDepartureDate)}
              </span>
              <Selo cores={{ bg: chip.bg, text: chip.color, border: chip.bg }} style={{ padding: "2px 8px" }}>
                {chip.full}
              </Selo>
              {ev.riskCritical && <SeloRisco style={{ display: "inline-block" }} />}
            </span>
          )}
          {/* Selos na TERCEIRA linha, não ao lado do nome: a coluna
              tem minWidth 220 e um chip "URGENTE" de ~64px antes do
              link comeria justamente o texto que a tela existe para
              deixar legível. */}
          {(semPecas || temChipDePrioridade(ev.priority)) && (
            <span style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 4 }}>
              <PrioridadeChip priority={ev.priority} />
              {/* SÓLIDO: dano consumado (o contorno é do RISCO, que é projeção). */}
              {semPecas && (
                <Selo
                  forma="retangulo"
                  tamanho="sm"
                  cores={{ bg: TI.red, text: "#ffffff", border: TI.red }}
                  style={{ padding: "1px 8px" }}
                >
                  sem peças
                </Selo>
              )}
            </span>
          )}
        </th>
        {!compacto && (
          <td style={{ padding: "12px 8px", verticalAlign: "middle" }}>
            <span style={{ display: "block", fontSize: 12, fontWeight: 600, color: TI.strong }}>
              {fmtSaida(ev.truckDepartureDate)}
            </span>
            {/* A frase inteira ("sai em 12 dias") ficava só no `title`; o chip
                curto vai visível e a frase acompanha para o leitor de tela. */}
            <Selo cores={{ bg: chip.bg, text: chip.color, border: chip.bg }} style={{ marginTop: 3, padding: "2px 8px" }}>
              <span aria-hidden="true">{chip.text}</span>
              <span className="sr-only">{chip.full}</span>
            </Selo>
            {ev.riskCritical && (
              <SeloRisco style={{ display: "inline-block", marginTop: 3, marginLeft: 5 }} />
            )}
          </td>
        )}
        {ev.stages.map((s) => (
          <td key={s.key} style={{ padding: "10px 4px", verticalAlign: "middle", textAlign: "center" }}>
            <StageCell stage={s} invalidDate={ev.invalidDate} />
          </td>
        ))}
        <td style={{ padding: "12px 8px", verticalAlign: "middle", textAlign: "center" }}>
          <ProgressoPecas delivered={ev.deliveredItems} total={ev.totalItems} variant="coluna" />
        </td>
        <td style={{ padding: "12px 12px 12px 4px", verticalAlign: "middle", textAlign: "center" }}>
          <Botao
            variante="secundario"
            onClick={() => onToggleExpand(expanded ? null : ev.id)}
            aria-expanded={expanded}
            aria-controls={expanded ? `drill-${ev.id}` : undefined}
            aria-label={expanded ? `Esconder pendências de ${ev.name}` : `Ver pendências de ${ev.name}`}
            data-testid={`button-expandir-${ev.id}`}
            className="gp-no-print"
            // Botão só de ícone: quadrado, sem o padding lateral do <Botao>.
            // 36 e não 30: a linha já tem ~50px de conteúdo (nome + início +
            // selos), então o alvo padrão da casa cabe sem esticar nada. No
            // dedo (tablet do galpão) sobe para 44 — `alvoBotao` vem do ponteiro.
            style={{ width: alvoBotao, height: alvoBotao, minHeight: alvoBotao, padding: 0 }}
          >
            <ChevronDown aria-hidden="true" style={{
              width: 15, height: 15, color: TI.strong,
              transform: expanded ? "rotate(180deg)" : "none",
              transition: "transform 0.15s ease",
            }} />
          </Botao>
        </td>
      </tr>
      {expanded && (
        <tr style={{ borderBottom: `1px solid ${TI.rule}`, backgroundColor: TI.sunken }}>
          {/* colSpan derivado: era o último espelho local do
              número de etapas (nome + saída + etapas + entregues + ação). */}
          <td id={`drill-${ev.id}`} colSpan={colSpan} style={{ padding: "4px 18px 12px" }}>
            <EventDrilldown ev={ev} cobranca={cobranca} today={today} />
          </td>
        </tr>
      )}
    </Fragment>
  );
});
