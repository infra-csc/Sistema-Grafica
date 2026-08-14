// Peças atrasadas — a visão PLANA da Gestão de Prazos: uma linha por peça, de
// todos os eventos juntos, do pior atraso para o menor.
//
// PORQUÊ ESTA VISÃO EXISTE. O quadro e a tabela são orientados a EVENTO: para
// saber quais PEÇAS estão atrasadas era preciso abrir um evento de cada vez e
// ler o drill. A pergunta do dono — "um lugar onde eu veja todos os itens
// atrasados, sem divisão de eventos, claro falando qual evento é" — é a
// pergunta das 8h da manhã, e a tela respondia com trabalho de garimpo.
//
// A REGRA (o que é "atrasada", como se ordena e o que cada filtro significa)
// mora em `./atrasadas.ts`, testada em `server/__tests__/prazo-atrasadas.test.ts`.
// Aqui só se pinta.
//
// CADA LINHA RESPONDE SEM CLIQUE: qual peça (código + tipo/descrição), de qual
// evento, em que etapa está, há quantos dias está atrasada e de quem é a bola
// — o link "Resolver em {setor} →", que usa exatamente o mesmo `STAGE_SECTOR`
// do drill do modal (mandar o diretor cobrar o Atendimento por uma peça que
// está na mesa da Arte é o erro que a tela existe para evitar).
//
// E o link leva À PEÇA, não à fila do setor: `PecaAtrasada.url` sai de
// `urlSetorDaPeca` (tokens.ts), que carrega aba, busca e evento — os
// parâmetros que cada tela de destino já sabe ler. Antes era o caminho cru
// "/arte", e um clique numa peça aterrissava nas 1.112 da Arte.
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { CheckCircle2, Search } from "lucide-react";
import { CONTENT_CARDS_MAX, useElementSize } from "@/hooks/use-mobile";
import { getStatusLabel } from "@/lib/status";
import { FilterChip } from "./filter-chip";
import { PrioridadeChip, PrioridadePonto, temChipDePrioridade } from "./prioridade";
import type { PecaAtrasada } from "./atrasadas";
import {
  dayColor, diasTexto, fmtDayMonth, fmtDiaCurto, pecasTexto,
  R, SCROLLPORT_MAX_H, TH_STICKY, TI,
} from "./tokens";

/**
 * Quantas linhas por página.
 *
 * Não é enfeite: hoje o app tem CENTENAS de peças atrasadas, e uma tabela de
 * 700 linhas em `style` inline custa caro para pintar e não é lida por
 * ninguém. 100 é o tamanho de uma pauta de reunião — e o que fica de fora é
 * dito em voz alta ("Mostrando 100 de 437"), com botão para trazer mais.
 * Cortar em silêncio é o que nunca pode acontecer: a lista existe para dizer
 * o TAMANHO do problema, não só as piores linhas dele.
 */
const PAGINA = 100;

// ─── A LARGURA, REFEITA POR CONTEÚDO ─────────────────────────────────────────
//
// O DEFEITO. A tabela rolava de lado em 1536px (e até em ~1800px com a barra
// lateral aberta) e o que ficava cortado era a AÇÃO: "Resolver em Solicitaçã",
// "Resolver em Atendimen". A conta explica: em Inter 12px/600, "Resolver em
// Atendimento →" mede ~164px de texto e a célula tinha 20px de padding — 184px
// de necessidade numa coluna de 140. Com `table-layout: fixed` o texto que não
// cabe não alarga a coluna: ele vaza para fora da tabela, e o `overflow: auto`
// do scrollport transforma esse vazamento em rolagem horizontal. Ou seja, a
// única coluna que existe para ser CLICADA era a que a tela empurrava para
// fora da tela.
//
// A CORREÇÃO tem duas partes, as duas por conteúdo:
//
//  1. A ação vira DUAS LINHAS ("Resolver em" / "Atendimento →"). A linha mais
//     larga passa a ser o setor (~90px), e a coluna cai de 184px de
//     necessidade para 124px — 60px devolvidos à descrição sem perder uma
//     palavra do texto e sem tocar no destino do link.
//  2. Peça, etapa e atraso encolhem para o que o dado realmente pede, medido
//     glifo a glifo (ver cada constante), e a etapa passa a QUEBRAR em duas
//     linhas em vez de ser cortada com reticência.
//
// PRIORIDADE DE COLUNA (o que se sacrifica primeiro, se faltar espaço):
// ação > atraso > peça > evento > descrição > ETAPA. A etapa é a primeira a
// sair porque é a única cuja informação a linha já diz DUAS vezes: o setor que
// destrava sai dela ("Entrega de Layouts" → "Resolver em Arte") e, quando ela
// some, o rótulo desce para a segunda linha da descrição — nada é perdido, só
// deixa de ter coluna própria. A ação nunca sai: sem ela a lista vira um
// relatório de leitura, que é o oposto do motivo dela existir.

/**
 * Abaixo desta largura de CONTAINER a tabela vira cartão.
 *
 * É o `CONTENT_CARDS_MAX` da casa (820) — a mesma régua que as outras telas
 * usam para trocar tabela por cartão —, e agora a conta fecha nela: no modo
 * compacto (5 colunas) as previsíveis somam 316px (peça 104 + atraso 88 + ação
 * 124) e o evento leva 24%; descontando ~17px de borda e barra de rolagem
 * vertical, em 820 sobram `803 − 316 − 193 = 294px` para a descrição — bem
 * acima dos 200px que "Banner 3x1 — fachada lateral" pede antes da reticência.
 *
 * Mede-se o CONTAINER e não a janela porque a sidebar aberta come 256px: em
 * 1060px de janela sobram ~756 úteis e `window.innerWidth` responderia
 * "desktop" para uma tabela que não cabe.
 */
const TABELA_MIN = CONTENT_CARDS_MAX;

/**
 * Abaixo desta largura de CONTAINER a coluna ETAPA sai e o rótulo dela desce
 * para a segunda linha da descrição.
 *
 * A conta do modo COMPLETO (6 colunas): previsíveis 436px (peça 104 + etapa
 * 120 + atraso 88 + ação 124), evento 22%, e a descrição fica com
 * `0,78·L − 436`. Em 1040 isso dá 362px — o piso confortável. Abaixo daí a
 * descrição começaria a comer reticência para sustentar uma coluna cujo
 * conteúdo a linha já diz de outro jeito.
 *
 * Onde isso cai na prática (janela − 256 da sidebar − 48 do padding):
 *   1366 → 1062 de container → COMPLETO, 6 colunas, descrição com ~379px.
 *   1536 → 1232 de container → COMPLETO, 6 colunas, descrição com ~512px.
 *   1280 →  976 de container → COMPACTO, 5 colunas, descrição com ~450px.
 * Em nenhum dos três há rolagem horizontal.
 */
const ETAPA_MIN = 1040;

/** "#3521" em 12px/700 mede ~40px; o status abaixo tem reticência. Padding 22. */
const COL_PECA = 104;
/** "Aprovação de Layout" quebra em duas linhas; a palavra mais larga tem ~62px. */
const COL_ETAPA = 120;
/** "venceu 24/07" em 10px mede ~65px; "120d" em 14px/800, ~34px. Padding 16. */
const COL_ATRASO = 88;
/** "Atendimento →" em 12px/700 mede ~93px (a linha mais larga). Padding 20. */
const COL_ACAO = 124;

/** Texto visível da peça: tipo e descrição na mesma frase (voz do drill). */
function textoPeca(p: PecaAtrasada): string {
  return p.item.description ? `${p.item.type} — ${p.item.description}` : p.item.type;
}

/**
 * "cobrada pelo prazo de Aprovação de Layout" — a nota da peça isenta.
 *
 * Sem ela a linha diria "Entrega de Layouts · atrasada há 6 dias" citando um
 * prazo que não é o daquela etapa, e quem conferisse a data no evento acharia
 * que a tela erra a conta. É a mesma regra que o drill já respeita ao agrupar
 * por `stageIndex` e contar por `marcoIndex`.
 */
function NotaMarco({ p }: { p: PecaAtrasada }) {
  if (!p.cobradaPorOutraEtapa) return null;
  return (
    <span
      style={{ display: "block", fontSize: 10, color: TI.secondary, marginTop: 1 }}
      title={`Esta peça é isenta da aprovação do patrocinador, então quem a cobra é o prazo de ${p.marco.label}.`}
    >
      cobrada por {p.marco.label}
    </span>
  );
}

/** O elo evento→peça: abre a peça dentro do evento, como o drill já faz. */
function LinkPeca({ p }: { p: PecaAtrasada }) {
  return (
    <Link
      href={p.urlPeca}
      title={`Abrir ${p.item.displayId} no evento ${p.eventName}`}
      data-testid={`peca-atrasada-${p.item.id}`}
      style={{
        display: "block", fontSize: 12, fontWeight: 700,
        color: TI.accentText, textDecoration: "none",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}
    >
      {p.item.displayId}
    </Link>
  );
}

/**
 * "Resolver em Arte →" — o destino que RESOLVE, não o que descreve.
 *
 * `empilhado` quebra a MESMA frase em duas linhas ("Resolver em" por cima,
 * "Arte →" embaixo). Não é enfeite: numa linha só a frase pede 184px de
 * coluna e era ela que a tabela cortava no meio da palavra. Empilhada, a
 * linha mais larga é o setor (~93px) e a coluna cabe em 124 — a frase
 * continua inteira, o nome acessível do link continua sendo "Resolver em
 * Atendimento →" (os dois spans vivem dentro do mesmo <a>) e a descrição
 * ganha os 60px de volta. No cartão do celular a largura sobra, então lá
 * fica em uma linha só.
 *
 * O setor NÃO leva `nowrap`: se um dia entrar um nome mais longo que a
 * coluna, ele quebra em duas linhas em vez de vazar para fora da tabela e
 * reacender a rolagem lateral que este arquivo existe para não ter.
 *
 * Contraste: `TI.secondary` (#746e69) sobre o branco do cartão/tabela =
 * 5,03:1 ✓ — passa AA (4,5:1) nos dois tamanhos usados aqui, 10px e 12px.
 */
function LinkSetor({ p, empilhado, style }: {
  p: PecaAtrasada;
  empilhado?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <Link
      href={p.url}
      title={`${p.setor} — a tela que destrava ${p.item.displayId}, já no recorte desta peça`}
      data-testid={`resolver-${p.item.id}`}
      style={{
        fontSize: 12, fontWeight: 600, color: TI.secondary, textDecoration: "none",
        whiteSpace: empilhado ? "normal" : "nowrap", ...style,
      }}
    >
      {empilhado ? (
        <>
          <span style={{
            display: "block", fontSize: 10, fontWeight: 700, letterSpacing: "0.04em",
            textTransform: "uppercase", lineHeight: 1.2,
          }}>
            Resolver em
          </span>
          <span style={{ display: "block", fontWeight: 700, lineHeight: 1.3 }}>
            {p.setor} →
          </span>
        </>
      ) : (
        <>Resolver em {p.setor} →</>
      )}
    </Link>
  );
}

/** Uma peça atrasada em formato de cartão (container estreito / celular). */
function CartaoPeca({ p, onAbrirEvento }: {
  p: PecaAtrasada;
  onAbrirEvento: (id: string) => void;
}) {
  return (
    <li style={{
      listStyle: "none", border: `1px solid ${TI.border}`, borderRadius: R.md,
      backgroundColor: TI.card, padding: "10px 12px",
    }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
        <span style={{ minWidth: 0 }}>
          <LinkPeca p={p} />
        </span>
        <span style={{ fontSize: 13, fontWeight: 800, color: TI.red, whiteSpace: "nowrap" }}>
          {p.diasAtraso}d de atraso
        </span>
      </div>
      <button
        type="button"
        onClick={() => onAbrirEvento(p.eventId)}
        aria-haspopup="dialog"
        style={{
          display: "flex", alignItems: "center", gap: 6, background: "none", border: "none",
          padding: 0, marginTop: 4, cursor: "pointer", maxWidth: "100%",
          fontSize: 12, fontWeight: 800, color: TI.title, textAlign: "left",
          fontFamily: "'Space Grotesk', sans-serif", textTransform: "uppercase",
        }}
        title={`${p.eventName} — abrir detalhes do evento`}
      >
        <PrioridadePonto priority={p.eventPriority} />
        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {p.eventName}
        </span>
      </button>
      {temChipDePrioridade(p.eventPriority) && (
        <span style={{ display: "block", marginTop: 3 }}>
          <PrioridadeChip priority={p.eventPriority} />
        </span>
      )}
      <span style={{ display: "block", fontSize: 11, color: TI.secondary, marginTop: 2 }}>
        Saída {fmtDiaCurto(p.truckDepartureDate)} · prazo de {p.marco.label} venceu em {fmtDayMonth(p.marco.deadline)}
      </span>
      {/* Sem reticência no cartão: aqui a descrição pode ocupar duas linhas,
          que é mais barato que esconder texto numa tela sem mouse para
          revelar o `title`. */}
      <span style={{
        display: "block", fontSize: 12, color: TI.strong, marginTop: 4,
        lineHeight: 1.45, overflowWrap: "anywhere",
      }}>
        {textoPeca(p)}
      </span>
      <span style={{ display: "block", fontSize: 11, color: TI.secondary, marginTop: 3 }}>
        {p.stage.label} · {getStatusLabel(p.item.status)} ·{" "}
        <span style={{ color: dayColor(p.item.waitingDays), fontWeight: 700 }}>
          {p.item.waitingDays === 0 ? "sem movimento hoje" : `${p.item.waitingDays}d sem movimento`}
        </span>
      </span>
      <NotaMarco p={p} />
      <div style={{ marginTop: 8 }}>
        <LinkSetor p={p} />
      </div>
    </li>
  );
}

export function PecasAtrasadas({
  pecas, totalNoApp, kpiPecasAtrasadas, filtroKey, chips, onLimparFiltros, onAbrirEvento,
}: {
  /** Já filtradas e ordenadas (pior atraso primeiro) — ver `./atrasadas.ts`. */
  pecas: PecaAtrasada[];
  /** Total de peças atrasadas no app, sem NENHUM filtro. */
  totalNoApp: number;
  /** `kpis.pecasAtrasadas` — para conciliar a lista com o placar em voz alta. */
  kpiPecasAtrasadas: number;
  /**
   * Assinatura dos filtros ativos. A paginação volta para a primeira página
   * quando ela muda — e SÓ quando ela muda: a query revalida sozinha a cada
   * 60s e resetar por identidade de array jogaria o diretor de volta ao topo
   * no meio da leitura da terceira página.
   */
  filtroKey: string;
  chips: { key: string; label: string; onRemove: () => void }[];
  onLimparFiltros: () => void;
  /** Abre o modal do evento (mesmo caminho da faixa "Comece por aqui"). */
  onAbrirEvento: (id: string) => void;
}) {
  const { ref: caixaRef, width } = useElementSize<HTMLDivElement>();
  // Antes da primeira medição a largura é 0: assume tabela COMPLETA e corrige
  // no paint seguinte. O contrário (assumir cartão) faria a visão do desktop
  // nascer errada em toda carga, que é o caso comum desta tela.
  const emCartoes = width > 0 && width < TABELA_MIN;
  const comEtapa = width === 0 || width >= ETAPA_MIN;

  const [mostrar, setMostrar] = useState(PAGINA);
  useEffect(() => { setMostrar(PAGINA); }, [filtroKey]);

  const visiveis = pecas.slice(0, mostrar);
  const restantes = pecas.length - visiveis.length;

  // ── Vazio REAL: não há peça atrasada no app inteiro ──────────────────────
  if (totalNoApp === 0) {
    return (
      <div style={{
        backgroundColor: TI.card, border: `1px solid ${TI.border}`, borderRadius: R.lg,
        padding: "40px 24px", textAlign: "center",
      }}>
        <CheckCircle2 aria-hidden="true" style={{ width: 28, height: 28, color: TI.green, margin: "0 auto 10px" }} />
        <p style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 700, color: TI.title }}>
          Nenhuma peça atrasada
        </p>
        <p style={{ margin: 0, fontSize: 13, color: TI.secondary }}>
          Toda peça pendente ainda está dentro do prazo da etapa em que está.
        </p>
      </div>
    );
  }

  // ── Vazio POR FILTRO: existem peças atrasadas, os filtros é que escondem ──
  if (pecas.length === 0) {
    return (
      <div style={{
        backgroundColor: TI.card, border: `1px solid ${TI.border}`, borderRadius: R.lg,
        padding: "40px 24px", textAlign: "center",
      }}>
        <Search aria-hidden="true" style={{ width: 28, height: 28, color: TI.label, margin: "0 auto 10px" }} />
        <p style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 700, color: TI.title }}>
          Nenhuma peça atrasada com esses filtros
        </p>
        <p style={{ margin: "0 0 10px", fontSize: 13, color: TI.secondary }}>
          {pecasTexto(totalNoApp)} atrasada{totalNoApp !== 1 ? "s" : ""} no total.
        </p>
        {chips.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center", marginBottom: 14 }}>
            {chips.map((c) => <FilterChip key={c.key} label={c.label} onRemove={c.onRemove} />)}
          </div>
        )}
        <button
          type="button"
          onClick={onLimparFiltros}
          data-testid="button-limpar-filtros-pecas"
          style={{
            padding: "9px 18px", borderRadius: R.md, border: `1px solid ${TI.border}`,
            backgroundColor: TI.card, color: TI.title,
            fontSize: 13, fontWeight: 700, cursor: "pointer",
          }}
        >
          Limpar filtros
        </button>
      </div>
    );
  }

  // O placar conta a pendência ACUMULADA da etapa vencida mais avançada; esta
  // lista conta peça a peça, pelo prazo que mede cada uma. Com prazos em ordem
  // os dois números são o mesmo — quando não são (offsets editados fora de
  // ordem num evento), a diferença é dita, e não deixada para o diretor
  // descobrir sozinho que clicou num 437 e recebeu 435.
  const diferencaPlacar = kpiPecasAtrasadas - totalNoApp;

  return (
    <div ref={caixaRef} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, color: TI.strong, fontWeight: 600 }} data-testid="contagem-pecas-atrasadas">
          {restantes > 0
            ? `Mostrando ${visiveis.length} de ${pecasTexto(pecas.length)} atrasada${pecas.length !== 1 ? "s" : ""}`
            : `${pecasTexto(pecas.length)} atrasada${pecas.length !== 1 ? "s" : ""}`}
          {/* O denominador honesto: com filtro ligado, a lista diz de quantas
              está falando E de quantas existem. Sem esta metade, um recorte de
              12 linhas parece o problema inteiro. */}
          {pecas.length !== totalNoApp && ` · ${totalNoApp} no total, sem filtros`}
        </span>
        <span style={{ fontSize: 11, color: TI.secondary }}>
          Da mais atrasada para a menos atrasada
        </span>
      </div>

      {diferencaPlacar > 0 && (
        <p style={{ margin: 0, fontSize: 11, color: TI.secondary }}>
          O placar mostra {kpiPecasAtrasadas}: {pecasTexto(diferencaPlacar)} contam lá por
          travarem uma etapa já vencida do evento, mas o prazo da etapa em que elas
          estão ainda não venceu — acontece quando os prazos de um evento foram
          editados fora de ordem.
        </p>
      )}

      {emCartoes ? (
        <ul style={{ display: "flex", flexDirection: "column", gap: 8, margin: 0, padding: 0 }}>
          {visiveis.map((p) => (
            <CartaoPeca key={p.key} p={p} onAbrirEvento={onAbrirEvento} />
          ))}
        </ul>
      ) : (
        <div className="gp-scroll" style={{
          backgroundColor: TI.card, border: `1px solid ${TI.border}`, borderRadius: R.lg,
          // Mesmo teto dos outros dois scrollports da tela (token único): os
          // três blocos começam na mesma altura da página.
          overflow: "auto", maxHeight: SCROLLPORT_MAX_H,
        }}>
          <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
            <caption className="sr-only">
              Peças atrasadas de todos os eventos, da mais atrasada para a menos atrasada
            </caption>
            <colgroup>
              <col style={{ width: COL_PECA }} />
              {/* Evento ganha 2 pontos percentuais quando a etapa sai: o nome
                  do evento em caixa alta é o texto que mais sofre com
                  reticência depois da descrição. */}
              <col style={{ width: comEtapa ? "22%" : "24%" }} />
              {/* Descrição sem largura: leva toda a sobra. */}
              <col />
              {comEtapa && <col style={{ width: COL_ETAPA }} />}
              <col style={{ width: COL_ATRASO }} />
              <col style={{ width: COL_ACAO }} />
            </colgroup>
            <thead>
              <tr>
                <th scope="col" style={{ ...TH_STICKY, textAlign: "left", paddingLeft: 14 }}>Peça</th>
                <th scope="col" style={{ ...TH_STICKY, textAlign: "left" }}>Evento</th>
                <th scope="col" style={{ ...TH_STICKY, textAlign: "left" }}>
                  {comEtapa ? "Descrição" : "Descrição e etapa"}
                </th>
                {comEtapa && <th scope="col" style={{ ...TH_STICKY, textAlign: "left" }}>Etapa</th>}
                {/* O único cabeçalho que precisa quebrar: "ATRASADA HÁ" em
                    10px/700 com 0,08em de espaçamento mede ~80px e a caixa da
                    coluna tem 72. Com o `nowrap` do TH_STICKY ele vazaria para
                    fora da tabela — e é justamente esse tipo de vazamento que
                    o `overflow: auto` do scrollport transforma em rolagem
                    horizontal. Mesma válvula do `DRILL_TH`. */}
                <th
                  scope="col"
                  style={{ ...TH_STICKY, whiteSpace: "normal", lineHeight: 1.25 }}
                  title="Dias desde o vencimento do prazo que mede esta peça"
                >
                  Atrasada há
                </th>
                <th scope="col" style={{ ...TH_STICKY, textAlign: "left" }}>
                  <span className="sr-only">Onde resolver</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((p) => (
                <tr key={p.key} className="gp-row" style={{ borderBottom: `1px solid ${TI.rule}` }}>
                  <th scope="row" style={{ padding: "9px 8px 9px 14px", textAlign: "left", fontWeight: 400, verticalAlign: "top" }}>
                    <LinkPeca p={p} />
                    <span
                      title={getStatusLabel(p.item.status)}
                      style={{
                        display: "block", fontSize: 10, color: TI.label,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}
                    >
                      {getStatusLabel(p.item.status)}
                    </span>
                  </th>
                  <td style={{ padding: "9px 8px", verticalAlign: "top" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                      <PrioridadePonto priority={p.eventPriority} />
                      {/* Botão, não link: o evento abre no MODAL da própria
                          tela — o diretor confere o funil inteiro e volta para
                          a lista sem perder os filtros. Quem quer sair da tela
                          tem o link da peça e o do setor na mesma linha. */}
                      <button
                        type="button"
                        onClick={() => onAbrirEvento(p.eventId)}
                        aria-haspopup="dialog"
                        title={`${p.eventName} — abrir detalhes do evento`}
                        data-testid={`evento-da-peca-${p.item.id}`}
                        style={{
                          background: "none", border: "none", padding: 0, cursor: "pointer",
                          minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          fontSize: 12, fontWeight: 800, color: TI.title, textAlign: "left",
                          fontFamily: "'Space Grotesk', sans-serif", textTransform: "uppercase",
                        }}
                      >
                        {p.eventName}
                      </button>
                    </span>
                    <span style={{ display: "block", fontSize: 10, color: TI.label, marginTop: 2 }}>
                      Saída {fmtDiaCurto(p.truckDepartureDate)}
                    </span>
                    {/* "urgente"/"alta" não têm ponto (viram chip de texto):
                        sem esta linha a prioridade que mais importa seria a
                        única sem marca nenhuma na lista. O `temChip` evita um
                        bloco vazio com margem nas outras. */}
                    {temChipDePrioridade(p.eventPriority) && (
                      <span style={{ display: "block", marginTop: 3 }}>
                        <PrioridadeChip priority={p.eventPriority} />
                      </span>
                    )}
                  </td>
                  <td style={{ padding: "9px 8px", verticalAlign: "top", fontSize: 12, color: TI.strong }}>
                    {/* Reticência com `title` da frase INTEIRA: num layout fixo
                        o que não cabe não alarga a coluna, invade a vizinha. */}
                    <span
                      title={textoPeca(p)}
                      style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                    >
                      {textoPeca(p)}
                    </span>
                    <span style={{
                      display: "block", fontSize: 10, marginTop: 2,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {/* Sem a coluna de etapa, o rótulo dela desce para cá —
                          a linha continua dizendo em que mesa a peça está, só
                          que na metade do espaço. `TI.secondary` (#746e69)
                          sobre branco = 5,03:1 ✓ em 10px. */}
                      {!comEtapa && (
                        <span style={{ color: TI.secondary }}>{p.stage.label} · </span>
                      )}
                      <span style={{ color: dayColor(p.item.waitingDays), fontWeight: 700 }}>
                        {p.item.waitingDays === 0 ? "sem movimento hoje" : `${p.item.waitingDays}d sem movimento`}
                      </span>
                    </span>
                    {!comEtapa && <NotaMarco p={p} />}
                  </td>
                  {comEtapa && (
                    <td style={{ padding: "9px 8px", verticalAlign: "top", fontSize: 12, color: TI.strong }}>
                      {/* Quebra em duas linhas em vez de reticência: "Aprovação
                          de Layout" não cabe em 104px de caixa, e a etapa é a
                          palavra que o diretor usa para cobrar — cortada em
                          "Aprovação de La…" ela obriga a passar o mouse. */}
                      <span style={{ display: "block", lineHeight: 1.3 }}>
                        {p.stage.label}
                      </span>
                      <NotaMarco p={p} />
                    </td>
                  )}
                  <td style={{ padding: "9px 8px", verticalAlign: "top", textAlign: "center" }}>
                    <span style={{ display: "block", fontSize: 14, fontWeight: 800, color: TI.red, whiteSpace: "nowrap" }}>
                      {p.diasAtraso}d
                    </span>
                    <span style={{ display: "block", fontSize: 10, color: TI.label, whiteSpace: "nowrap" }}>
                      venceu {fmtDayMonth(p.marco.deadline)}
                    </span>
                    <span className="sr-only">Atrasada há {diasTexto(p.diasAtraso)}</span>
                  </td>
                  <td style={{ padding: "9px 12px 9px 8px", verticalAlign: "top" }}>
                    <LinkSetor p={p} empilhado style={{ display: "block" }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {restantes > 0 && (
        <div className="gp-no-print" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => setMostrar((n) => n + PAGINA)}
            data-testid="button-mais-pecas-atrasadas"
            style={{
              padding: "9px 18px", borderRadius: R.md, border: `1px solid ${TI.border}`,
              backgroundColor: TI.card, color: TI.title,
              fontSize: 13, fontWeight: 700, cursor: "pointer",
            }}
          >
            Mostrar mais {Math.min(PAGINA, restantes)}
          </button>
          <span style={{ fontSize: 12, color: TI.secondary }}>
            {/* O que ficou de fora é dito, sempre: uma lista que corta em
                silêncio ensina o diretor a achar que o problema é do tamanho
                da tela. */}
            {pecasTexto(restantes)} ainda não {restantes !== 1 ? "mostradas" : "mostrada"} — as
            de menor atraso.
          </span>
        </div>
      )}
    </div>
  );
}
