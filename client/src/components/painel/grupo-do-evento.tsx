// ─── A LISTA POR EVENTO — grupos e linhas memoizados (PERF-4) ───────────────
//
// O PROBLEMA MEDIDO. A lista inteira morava dentro do corpo de PainelGeral, e
// QUALQUER estado da página re-renderizava todas as linhas: abrir o menu de
// Exportar, abrir a ficha de uma peça, o relógio de 30s do carimbo de frescor
// e cada revalidação da query (isFetching liga e desliga — duas vezes a cada
// invalidação do WebSocket, mesmo quando o servidor devolve exatamente o
// mesmo acervo). Com 5.000 peças: 250 linhas e ~30 cabeçalhos refeitos por
// clique, e em cada cabeçalho `diasNoEstado` sobre TODAS as peças do evento.
//
// A CURA. Cabeçalho de evento e linha de peça viram componentes memoizados,
// com props primitivas ou estáveis (o objeto `acoes` nasce uma vez e lê o
// estado atual por ref). Um clique que não muda a lista não chega às linhas.
// (server/__tests__/perf-painel-geral.test.ts conta as linhas re-renderizadas.)
import { Fragment, memo, useMemo, type CSSProperties, type ReactNode } from "react";
import { Link } from "wouter";
import { Truck, Calendar, ArrowUpRight, Hourglass } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { parseDateLocal, toUTCDisplayDate } from "@/lib/utils";
import { getStatusMeta } from "@/lib/status";
import { computeDeadlineChip, type PrazoChip } from "@/lib/painel-prazo";
import { FS, FW, R, T, N } from "@/lib/theme";
import { EVENT_TITLE_STYLE } from "./estilos";
import {
  EVENT_HEADER_H, ROW_CAP, LIMITE_PARADA, fmtN, diasNoEstado, tomDaIdade, idadePorExtenso, secoesDoGrupo,
} from "./regras";
import { EventStatusBar } from "./barra-do-evento";
import { LinhaDaPeca } from "./linha-da-peca";
import { CartaoDaPeca } from "./cartao-da-peca";
import type { AcoesDaLista, GrupoDeEvento, MetaDoEvento, PecaDoPainel, SortCampo, SortDir } from "./tipos";

export interface GrupoDoEventoProps {
  eventKey: string;
  gd: GrupoDeEvento;
  meta: MetaDoEvento | undefined;
  groupOpen: boolean;
  isExpanded: boolean;
  /** Quantas linhas este grupo pode montar agora (renderização incremental). */
  linhasPermitidas: number;
  hojeMs: number;
  relogioIdade: number;
  useCards: boolean;
  isCompact: boolean;
  colCount: number;
  topOffset: number;
  sortBy: SortCampo;
  sortDir: SortDir;
  typeToGroup: Record<string, string>;
  selectedIds: Set<string>;
  isAdmin: boolean;
  canDeleteAny: boolean;
  restoringItemId: string | null;
  restorePending: boolean;
  acoes: AcoesDaLista;
}

export const GrupoDoEvento = memo(function GrupoDoEvento({
  eventKey, gd, meta, groupOpen, isExpanded, linhasPermitidas, hojeMs, relogioIdade,
  useCards, isCompact, colCount, topOffset, sortBy, sortDir, typeToGroup, selectedIds,
  isAdmin, canDeleteAny, restoringItemId, restorePending, acoes,
}: GrupoDoEventoProps) {
  const firstItem = gd.items[0];
  // Renderização incremental em dois níveis: até GROUP_CAP eventos
  // abertos e ROW_CAP linhas por evento. O resto entra sob demanda —
  // sem os dois tetos, o estado padrão da tela montava milhares de
  // <tr> que o WebSocket depois re-renderiza a cada mutação alheia.
  const visibleItems = useMemo(
    () => !groupOpen ? [] : (isExpanded || gd.items.length <= ROW_CAP ? gd.items : gd.items.slice(0, ROW_CAP)),
    [groupOpen, isExpanded, gd.items],
  );
  const hiddenCount = gd.items.length - visibleItems.length;
  const secoes = useMemo(() => secoesDoGrupo(visibleItems, typeToGroup), [visibleItems, typeToGroup]);
  // Selo de evento fora de jogo (encerrado à mão ou já realizado).
  // `null` enquanto o evento conta — a esmagadora maioria.
  const selo = meta?.selo ?? null;
  // Chip de prazo: calendário CRUZADO com o estado real das peças.
  // A regra inteira (e o porquê de a versão antiga errar em 100% dos
  // eventos) mora em lib/painel-prazo.ts, testada. O 4º argumento é
  // o que impede o "ATRASADO 8D" num evento que ninguém mais toca.
  const deadline: PrazoChip | null = computeDeadlineChip(
    meta?.truckDayMs ?? null, hojeMs, meta?.pendentes ?? 0, !!selo,
  );
  const todasSelecionadas = visibleItems.length > 0 && visibleItems.every((i) => i.deletedAt || selectedIds.has(i.id));
  // Peças paradas: varre TODAS as peças do evento — memoizado, só refaz quando
  // as peças ou o relógio de hora mudam (antes era a cada render da página).
  const paradas = useMemo(
    () => gd.items
      .map(i => ({ i, d: diasNoEstado(i, relogioIdade) }))
      .filter((x): x is { i: PecaDoPainel; d: number } => x.d !== null && x.d > LIMITE_PARADA),
    [gd.items, relogioIdade],
  );
  // Quantas linhas cabem no orçamento, na ORDEM de exibição (grupo pai → tipo).
  const renderizadas = Math.min(visibleItems.length, linhasPermitidas);
  const ariaSort = (campo: string): "ascending" | "descending" | "none" =>
    sortBy === campo ? (sortDir === "asc" ? "ascending" : "descending") : "none";

  // overflow: clip (não hidden): clipa o border-radius SEM criar
  // scroll-container — pré-requisito para o thead sticky funcionar
  // contra o scroll da página.
  return (
    <div style={{ border: `1px solid ${T.border}`, borderRadius: 12, backgroundColor: T.surface, overflow: "clip", boxShadow: "0 2px 8px rgba(28,25,23,0.07)" }}>

      {/* Group header — sticky logo abaixo da toolbar (topOffset):
          mantém o contexto do evento visível ao rolar listas longas.
          zIndex 6 fica ACIMA do thead sticky (5) e ABAIXO da toolbar
          (8); fundo sólido para as linhas não vazarem por trás.
          Altura FIXA (EVENT_HEADER_H) — é ela que o thead usa como
          `top` para encostar exatamente abaixo. Nada aqui cria novo
          scroll-container (ver comentário na tabela). */}
      <div style={{
        position: "sticky", top: topOffset, zIndex: 6,
        backgroundColor: T.surface,
        borderBottom: `1px solid ${T.border}`,
        // Altura fixa SÓ no desktop (onde o thead precisa dela p/
        // calcular o próprio top). Mobile usa cards, sem thead —
        // altura automática deixa os metadados quebrarem linha.
        ...(useCards
          ? { padding: "13px 18px 13px 20px" }
          : { padding: "0 18px 0 20px", height: EVENT_HEADER_H, boxSizing: "border-box" as const }),
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
        // Acento do evento fora de jogo — o MESMO da lista de
        // Eventos: cinza no encerrado à mão (verde diria "deu tudo
        // certo", âmbar diria "corre atrás", e encerrado não é
        // nenhum dos dois) e âmbar no realizado. O laranja da marca
        // fica para os eventos que ainda estão em jogo.
        borderLeft: `3px solid ${selo ? selo.dot : T.accent}`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <div style={{ minWidth: 0 }}>
            {/* Nome do evento navega para o detalhe. Era a única saída
                da tela e não parecia clicável: sem hover, sem
                sublinhado, sem ícone e sem foco visível — descoberta
                por acaso não é descoberta. Afordância no CSS (.pg-event-link). */}
            {gd.eventId ? (
              <Link
                href={`/eventos/${gd.eventId}`}
                onClick={(e) => e.stopPropagation()}
                title={`Abrir evento ${gd.eventName}`}
                className="pg-event-link"
              >
                <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                  <h3 style={EVENT_TITLE_STYLE}>{gd.eventName}</h3>
                  <ArrowUpRight className="pg-goto" style={{ width: 12, height: 12, color: T.accentText }} aria-hidden="true" />
                </span>
              </Link>
            ) : (
              <h3 style={EVENT_TITLE_STYLE}>{gd.eventName}</h3>
            )}
            {/* Ordem invertida de propósito: o CHIP DE PRAZO vem
                primeiro e não encolhe. Com as datas primeiro e
                flexWrap nowrap + overflow hidden, o que era clipado
                em silêncio (sem reticências) era justamente
                "Atrasado 5d" — o dado mais acionável da linha. */}
            <div style={{ display: "flex", alignItems: "center", gap: useCards ? 10 : 12, marginTop: 5, minWidth: 0, flexWrap: useCards ? "wrap" : "nowrap", overflow: "hidden" }}>
              {/* O selo vem ANTES do chip de prazo e também não
                  encolhe: ele é a chave de leitura de todo o resto da
                  linha. Sem ele, "Saiu há 8d · 66 em aberto" parecia
                  um evento vivo em apuros. Palavras da lista de
                  Eventos — as duas telas falam do mesmo estado. */}
              {selo && (
                <span
                  title={selo.hint}
                  data-testid={`selo-evento-${eventKey}`}
                  style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, lineHeight: 1.3, color: selo.text, backgroundColor: selo.bg, border: `1px solid ${selo.border}`, borderRadius: 999, padding: "1px 8px", whiteSpace: "nowrap", flexShrink: 0 }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: selo.dot, flexShrink: 0 }} aria-hidden="true" />
                  {isCompact || useCards ? selo.short : selo.label}
                </span>
              )}
              {deadline && (
                <span
                  title={deadline.srLabel}
                  data-testid={`chip-prazo-${eventKey}`}
                  style={{ fontSize: 12, fontWeight: deadline.tone === "neutral" ? 500 : 700, color: deadline.color, whiteSpace: "nowrap", flexShrink: 0 }}
                >
                  {deadline.text}
                </span>
              )}
              {/* ── PECAS PARADAS ──

                  Antes das datas e com `flexShrink: 0`, pela mesma
                  regra do chip de prazo ao lado: dado acionavel nao
                  pode ser clipado em silencio quando a largura
                  aperta. A data pode encolher; "7 paradas" nao.

                  So aparece acima do limite — abaixo dele a peca esta
                  em fluxo, e um chip em todo cabecalho viraria papel
                  de parede. */}
              {(() => {
                if (paradas.length === 0) return null;
                const pior = paradas.reduce((a, b) => (b.d > a.d ? b : a));
                const tom = tomDaIdade(pior.d);
                return (
                  <span
                    data-testid={`chip-paradas-${eventKey}`}
                    title={`${paradas.length} ${paradas.length === 1 ? "peça parada" : "peças paradas"} há mais de ${LIMITE_PARADA} dias. A mais antiga: ${pior.i.displayId} em ${getStatusMeta(pior.i.status).label}, ${idadePorExtenso(pior.d)}.`}
                    style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: tom.peso, color: tom.cor, whiteSpace: "nowrap", flexShrink: 0 }}
                  >
                    <Hourglass aria-hidden="true" style={{ width: 11, height: 11 }} />
                    {paradas.length} {paradas.length === 1 ? "parada" : "paradas"} {isCompact ? `+${LIMITE_PARADA} dias` : `há mais de ${LIMITE_PARADA} dias`}
                  </span>
                );
              })()}
              {firstItem?.event?.truckDepartureDate && (
                <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 500, color: T.second, whiteSpace: "nowrap", flexShrink: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
                  <Truck style={{ width: 11, height: 11, flexShrink: 0 }} />
                  Saída: {format(toUTCDisplayDate(firstItem.event.truckDepartureDate), "dd MMM yyyy 'às' HH:mm", { locale: ptBR })}
                </span>
              )}
              {/* "Início" é o metadado menos acionável; some primeiro
                  em container estreito (continua na ficha do evento). */}
              {firstItem?.event?.startDate && !isCompact && (
                <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 500, color: T.second, whiteSpace: "nowrap", flexShrink: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
                  <Calendar style={{ width: 11, height: 11, flexShrink: 0 }} />
                  Início: {format(parseDateLocal(firstItem.event.startDate), "dd MMM yyyy", { locale: ptBR })}
                </span>
              )}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          {!useCards && <EventStatusBar items={gd.items} width={120} />}
          {/* Contador é informação neutra — texto simples, sem
              pílula nem caixa-alta: ao lado do chip de prazo e do
              selo, uma terceira cápsula só disputava o olho com os
              dois que pedem ação. #57534e sobre #ffffff = 7,63:1. */}
          <span style={{ fontSize: 12, fontWeight: 600, color: T.apoio, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
            {fmtN(gd.items.length)} {gd.items.length === 1 ? "peça" : "peças"}
          </span>
        </div>
      </div>

      {!groupOpen ? (
        <button
          onClick={() => acoes.abrirGrupo(eventKey, Math.min(gd.items.length, ROW_CAP))}
          data-testid={`button-open-group-${eventKey}`}
          style={{ width: "100%", padding: "13px", background: T.bg, border: "none", color: T.text, fontWeight: FW.forte, fontSize: FS.body, cursor: "pointer" }}
        >
          Mostrar as {gd.items.length} {gd.items.length === 1 ? "peça" : "peças"} deste evento
        </button>
      ) : useCards ? (
        <div style={{ padding: "8px 10px", display: "flex", flexDirection: "column", gap: 0 }}>
          {(() => {
            let cardIdx = 0;
            return secoes.map(({ group, tipos }) => (
              <Fragment key={group || '__nogroup'}>
                {/* A FAIXA AZUL DO GRUPO PAI SAIU TAMBÉM DAQUI. No
                    desktop ela já tinha virado prefixo da linha de
                    tipo; o celular ficou com a versão antiga — azul,
                    caixa-alta 10px, uma família de cor que não se
                    repete em lugar nenhum. Agora as duas larguras
                    dizem "Grupo / Tipo  N" do mesmo jeito. */}
                {tipos.map(([type, typeItems]) => {
                  // Orçamento: o tipo só aparece se ao menos uma peça dele cabe.
                  const cabem = Math.max(0, Math.min(typeItems.length, renderizadas - cardIdx));
                  if (cabem === 0) return null;
                  return (
                    <Fragment key={type}>
                      {/* Type sub-header */}
                      <div style={{ display: "flex", alignItems: "baseline", gap: 6, padding: "10px 4px 6px", marginTop: 4, overflow: "hidden" }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: T.strong, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0, flex: 1 }}>
                          {group && <span style={{ fontWeight: 500, color: T.second }}>{group} / </span>}
                          {type}
                        </span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: T.second, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
                          {typeItems.length}
                        </span>
                      </div>
                      {typeItems.slice(0, cabem).map((item) => (
                        <CartaoDaPeca
                          key={item.id}
                          item={item}
                          idx={cardIdx++}
                          selo={selo}
                          isAdmin={isAdmin}
                          canDeleteAny={canDeleteAny}
                          restaurando={restoringItemId === item.id}
                          restorePending={restorePending}
                          acoes={acoes}
                        />
                      ))}
                    </Fragment>
                  );
                })}
              </Fragment>
            ));
          })()}
          {hiddenCount > 0 && renderizadas === visibleItems.length && (
            <button
              onClick={() => acoes.expandir(eventKey, hiddenCount)}
              data-testid={`button-show-all-${eventKey}`}
              style={{ width: "100%", padding: "13px", marginTop: 4, background: T.bg, border: `1px solid ${T.border}`, borderRadius: R.md, color: T.text, fontWeight: FW.forte, fontSize: FS.body, cursor: "pointer" }}
            >
              Mostrar todas as {gd.items.length} peças (+{hiddenCount})
            </button>
          )}
        </div>
      ) : (
      /* overflow visível (não auto): qualquer scroll-container entre o
         th e o scroll da página quebraria o sticky do cabeçalho. O
         desktop comporta a tabela; larguras menores usam cards. */
      <div style={{ overflow: "visible" }}>
        {/* table-layout: fixed + colgroup — com `auto`, a largura
            mínima de uma coluna é o min-content do conteúdo, então um
            único campo de texto livre (a observação) esticava a tabela
            inteira e a página ganhava barra horizontal SILENCIOSA (o
            overflow-y do SidebarInset faz o overflow-x computar auto).
            Com fixed, nenhum conteúdo futuro consegue estourar. */}
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
          <caption className="sr-only">Peças do evento {gd.eventName}</caption>
          <colgroup>
            <col style={{ width: 40 }} />
            {isCompact ? (
              <>
                <col style={{ width: "27%" }} />
                <col style={{ width: "40%" }} />
                <col style={{ width: "17%" }} />
              </>
            ) : (
              <>
                <col style={{ width: "15%" }} />
                <col style={{ width: "27%" }} />
                <col style={{ width: "12%" }} />
                <col style={{ width: "17%" }} />
                <col style={{ width: "12%" }} />
              </>
            )}
            <col style={{ width: 96 }} />
          </colgroup>
          <thead>
            <tr>
              {(() => {
                const thBase: CSSProperties = {
                  /* Sticky: colunas continuam visíveis ao rolar listas
                     longas. bg no th (não no tr) — th sticky sem fundo
                     ficaria transparente sobre as linhas.
                     top = topOffset + EVENT_HEADER_H: encosta exatamente
                     sob o header sticky do evento, que por sua vez está
                     sob a toolbar sticky (altura medida). */
                  position: "sticky", top: topOffset + EVENT_HEADER_H, zIndex: 5,
                  // CABEÇALHO CLARO. Era #1c1917 sólido — e com 38
                  // eventos abertos a tela desenhava 38 barras pretas
                  // de ponta a ponta, o elemento mais pesado do painel
                  // repetido dezenas de vezes. O cabeçalho de tabela
                  // não é conteúdo: é régua. A Arte e o Detalhe do
                  // Evento já usam este tratamento claro.
                  // #57534e sobre #fafaf9 = 7,30:1 ✓ nos 11px.
                  backgroundColor: T.bg,
                  borderBottom: `1px solid ${T.border}`,
                  padding: "11px 20px",
                  fontSize: 11, fontWeight: 800, textTransform: "uppercase",
                  letterSpacing: "0.08em", color: T.apoio,
                  textAlign: "left",
                  whiteSpace: "nowrap",
                };
                const seta = (campo: string) => sortBy === campo ? (sortDir === "asc" ? " ↑" : " ↓") : "";
                const cols: ReactNode[] = [
                  <th key="sel" scope="col" style={{ ...thBase, padding: "12px 0 12px 12px" }}>
                    <label className="pg-check">
                      <input
                        type="checkbox"
                        checked={todasSelecionadas}
                        onChange={(e) => acoes.alternarSelecaoDoEvento(visibleItems, e.target.checked)}
                        aria-label={`Selecionar as peças visíveis do evento ${gd.eventName}`}
                        data-testid={`checkbox-all-${eventKey}`}
                        style={{ width: 15, height: 15, cursor: "pointer", accentColor: T.accentText }}
                      />
                    </label>
                  </th>,
                  <th key="id" scope="col" aria-sort={ariaSort("displayId")} style={thBase}>
                    <span className="pg-sortable" role="button" tabIndex={0} onClick={() => acoes.ordenar("displayId")} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); acoes.ordenar("displayId"); } }} title="Ordenar por ID">
                      {isCompact ? "ID / Medidas" : "ID"}{seta("displayId")}
                    </span>
                  </th>,
                  <th key="desc" scope="col" style={thBase}>{isCompact ? "Descrição / Patrocinador" : "Descrição"}</th>,
                ];
                if (!isCompact) {
                  cols.push(
                    <th key="med" scope="col" aria-sort={ariaSort("area")} style={thBase}>
                      <span className="pg-sortable" role="button" tabIndex={0} onClick={() => acoes.ordenar("area")} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); acoes.ordenar("area"); } }} title="Ordenar por área">
                        Medidas{seta("area")}
                      </span>
                    </th>,
                    <th key="pat" scope="col" style={thBase}>Patrocinador</th>,
                  );
                }
                cols.push(
                  <th key="st" scope="col" aria-sort={ariaSort("status")} style={thBase}>
                    <span className="pg-sortable" role="button" tabIndex={0} onClick={() => acoes.ordenar("status")} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); acoes.ordenar("status"); } }} title="Ordenar pela etapa do fluxo">
                      Status · tempo{seta("status")}
                    </span>
                  </th>,
                  <th key="ac" scope="col" style={{ ...thBase, textAlign: "right" }}>Ações</th>,
                );
                return cols;
              })()}
            </tr>
          </thead>
          <tbody>
            {(() => {
              let globalIdx = 0;
              return secoes.map(({ group, tipos }) => (
                <Fragment key={group || '__nogroup'}>
                  {/* A FAIXA AZUL DO GRUPO PAI SAIU. Eram DUAS linhas
                      inteiras empilhadas para rotular a mesma coisa —
                      uma azul com "2X1" e outra cinza com "2×1 PADRÃO
                      · 10" — em duas famílias de cor que não se
                      repetem em lugar nenhum da tela.
                      O pai virou PREFIXO da linha de tipo. Além de
                      devolver uma linha por grupo, informa mais: antes
                      o pai aparecia uma vez e some ao rolar; agora ele
                      acompanha cada tipo. */}
                  {tipos.map(([type, typeItems]) => {
                    // Orçamento: o tipo só aparece se ao menos uma peça dele cabe.
                    const cabem = Math.max(0, Math.min(typeItems.length, renderizadas - globalIdx));
                    if (cabem === 0) return null;
                    return (
                <Fragment key={type}>
                  {/* ── Type sub-header ── */}
                  <tr>
                    <td colSpan={colCount} style={{
                      padding: "6px 18px 6px 20px",
                      // #f5f5f4 e não #fafaf9: o cabeçalho da tabela
                      // passou a ser claro nesta rodada, e os dois no
                      // mesmo tom viravam a mesma faixa repetida.
                      backgroundColor: N.n2,
                      borderTop: `1px solid ${T.border}`,
                      borderBottom: `1px solid ${T.border}`,
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {group && (
                          <>
                            {/* #746e69 sobre #f5f5f4 = 4,61:1 ✓ nos 11px.
                                O comentario anterior dizia "#78716c = 4,7:1"
                                e estava ERRADO: aquele cinza da 4,40 sobre
                                este fundo e REPROVA AA. Os dois cinzas ficam
                                a 6 unidades de distancia — indistinguiveis —
                                entao o que passa substitui o que falha, sem
                                custo visual nenhum.
                                O pai vem em peso e cor MENORES que o
                                tipo: ele é contexto, o tipo é o rótulo. */}
                            <span style={{ fontSize: 12, fontWeight: 500, color: T.second }}>
                              {group}
                            </span>
                            {/* #746e69: é glifo de texto, e a casa proíbe #a8a29e como cor de texto (2,52:1). */}
                            <span aria-hidden="true" style={{ color: T.second, fontSize: 12 }}>/</span>
                          </>
                        )}
                        <span style={{ fontSize: 13, fontWeight: 700, color: T.strong }}>
                          {type}
                        </span>
                        {/* A contagem deixou de ser pílula: número
                            simples, #746e69 sobre #f5f5f4 = 4,61:1. */}
                        <span style={{ fontSize: 12, fontWeight: 600, color: T.second, fontVariantNumeric: "tabular-nums" }}>
                          {typeItems.length}
                        </span>
                      </div>
                    </td>
                  </tr>

                  {/* ── Items within this type ── */}
                  {typeItems.slice(0, cabem).map((item) => (
                    <LinhaDaPeca
                      key={item.id}
                      item={item}
                      idx={globalIdx++}
                      selecionado={selectedIds.has(item.id)}
                      selo={selo}
                      isCompact={isCompact}
                      isAdmin={isAdmin}
                      canDeleteAny={canDeleteAny}
                      restaurando={restoringItemId === item.id}
                      restorePending={restorePending}
                      relogioIdade={relogioIdade}
                      acoes={acoes}
                    />
                  ))}
                </Fragment>
                    );
                  })}
                </Fragment>
              ));
            })()}
            {hiddenCount > 0 && renderizadas === visibleItems.length && (
              <tr>
                <td colSpan={colCount} style={{ padding: 0 }}>
                  <button
                    onClick={() => acoes.expandir(eventKey, hiddenCount)}
                    data-testid={`button-show-all-${eventKey}`}
                    style={{ width: "100%", padding: "13px", background: T.bg, border: "none", borderTop: `1px solid ${T.border}`, color: T.text, fontWeight: FW.forte, fontSize: FS.body, cursor: "pointer" }}
                  >
                    Mostrar todas as {gd.items.length} peças (+{hiddenCount})
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
});
