// ANÁLISES › PRÉ-PRODUÇÃO › EVENTOS × PROCESSO × PRAZO
//
// A grade "evento × fase" do pacote de referência do dono ("sobe no nosso
// layout"): linhas = eventos, colunas = Evento | Data do evento | Saída
// caminhão | as cinco fases. Cada célula mostra o prazo da fase e as peças que
// estão NELA agora (cada peça conta uma vez — dono, 20/10); vermelho = vencida
// com peças, contorno laranja = vence nos próximos 15 dias, contorno neutro =
// depois, tracejado = nenhuma aqui ainda (peças em fases anteriores), cinza
// claro = concluída. Clicar numa célula abre, abaixo, o quadro peça a peça.
//
// A regra (quais eventos entram, a contagem por fase, o atraso e a
// ordenação) mora em @shared/painel-operacional (`eventosProcessoPrazo`,
// `pecasDaFaseDoEvento`) — aqui só se desenha. O estado vive na página (e na
// URL: cal_so_atr, cal_ev, cal_fase, cal_ord, cal_dir).
//
// PEÇAS SEM APROVAÇÃO (Pedro/dono, 26/10): a célula em que só há peça sem
// aprovação vence no Layout ajustado (`prazoEfetivo`, o menor prazo entre as
// peças que estão nela). A célula mostra ESSA data, marcada como ajustada, e
// a dica diz o prazo do evento e a regra (Layout + N dias corridos).
import * as React from "react";
import { CalendarClock, Check, X } from "lucide-react";
import {
  FASES_DO_CALENDARIO, diaDaSemana, eventosProcessoPrazo, pecasDaFaseDoEvento, diasEntre, prazoNaFase,
  type CelulaDoCalendario, type ColunaDoCalendario, type LinhaDoCalendario, type SituacaoNoCalendario,
} from "@shared/painel-operacional";
import { Botao } from "@/components/ui/botao";
import { T, TOM, N, FS, FW, R } from "@/lib/theme";
import { SecaoDaAnalise } from "../blocos";
import { Marcador, Vazio, dm, dma, fmt0 } from "../comum";
import type { ContextoDoPainel } from "../contexto";
import { TabelaDePecas } from "./tabela-de-pecas";
import { useDiasDaAprovacao } from "@/hooks/use-configuracoes";

const TABULAR: React.CSSProperties = { fontVariantNumeric: "tabular-nums" };

/** A pintura de cada situação — tokens do tema, nada de cor nova. */
const VERMELHO = TOM.perigo.text; // #b91c1c: fundo da vencida; o branco por cima passa AA (6,5:1)
const LARANJA = TOM.laranja.dot;
const PINTURA: Record<Exclude<SituacaoNoCalendario, "semPrazo">, React.CSSProperties> = {
  atrasada: { backgroundColor: VERMELHO, border: `1px solid ${VERMELHO}`, color: "#ffffff" },
  // Contorno de 2px sem mexer no tamanho da caixa: 1px de borda + 1px de sombra interna.
  proxima: { backgroundColor: T.surface, border: `1px solid ${LARANJA}`, boxShadow: `inset 0 0 0 1px ${LARANJA}`, color: T.text },
  depois: { backgroundColor: T.surface, border: `1px solid ${N.n5}`, color: T.text },
  aguardando: { backgroundColor: T.surface, border: `1px dashed ${N.n4}`, color: T.second },
  concluida: { backgroundColor: N.n2, border: `1px solid ${N.n3}`, color: T.second },
};
const LEGENDA: { id: Exclude<SituacaoNoCalendario, "semPrazo">; texto: string }[] = [
  { id: "atrasada", texto: "Vencida com peças nesta fase" },
  { id: "proxima", texto: "Vence nos próximos 15 dias, com peças nesta fase" },
  { id: "depois", texto: "Vence depois, com peças nesta fase" },
  { id: "aguardando", texto: "Aguardando peças de fases anteriores" },
  { id: "concluida", texto: "Concluída" },
];

const COLUNAS_FIXAS: { id: ColunaDoCalendario; rotulo: string }[] = [
  { id: "evento", rotulo: "Evento" },
  { id: "data_evento", rotulo: "Data do evento" },
  { id: "saida", rotulo: "Saída caminhão" },
];

/** "sáb 24/10/2026" */
const diaCompleto = (d: string | null | undefined) => (d ? `${diaDaSemana(d)} ${dma(d)}` : "—");
const plural = (n: number, um: string, varios: string) => (n === 1 ? um : varios);

export default function CalendarioDeFases({ ctx }: { ctx: ContextoDoPainel }) {
  const { painel, isMobile, calendario: cal, mudarCalendario } = ctx;
  const diasDaAprovacao = useDiasDaAprovacao();
  const quadroRef = React.useRef<HTMLDivElement>(null);
  const gradeRef = React.useRef<HTMLDivElement>(null);

  const dados = React.useMemo(
    () => eventosProcessoPrazo(painel, { soAtrasadas: cal.soAtrasadas, ordem: cal.ord ? { coluna: cal.ord, direcao: cal.dir } : null }),
    [painel, cal.soAtrasadas, cal.ord, cal.dir]);

  const eventoSel = cal.ev ? painel.eventos.find((e) => e.chave === cal.ev) ?? null : null;
  const faseSel = FASES_DO_CALENDARIO.find((f) => f.n === cal.fase) ?? null;
  const pecas = React.useMemo(
    () => (eventoSel && faseSel ? pecasDaFaseDoEvento(painel, eventoSel.chave, faseSel.n) : []),
    [painel, eventoSel, faseSel]);
  // O prazo que vale no quadro: o mesmo da célula (o menor prazo entre as peças
  // dela — o Layout ajustado quando só há peça sem aprovação).
  const prazoDoQuadro = React.useMemo(() => {
    if (!eventoSel || !faseSel) return null;
    const prazosDaFase = eventoSel.fases.map((f) => f.prazo);
    let menor: string | null = null;
    for (const p of pecas) {
      const pp = prazoNaFase(p, prazosDaFase, faseSel.n);
      if (pp && (menor === null || pp < menor)) menor = pp;
    }
    return menor ?? (eventoSel.fases[faseSel.n]?.prazo || null);
  }, [eventoSel, faseSel, pecas]);

  const ordenarPor = (col: ColunaDoCalendario) => {
    if (cal.ord === col) mudarCalendario({ dir: cal.dir === "desc" ? "asc" : "desc" });
    else mudarCalendario({ ord: col, dir: "asc" });
  };
  const abrir = (l: LinhaDoCalendario, f: CelulaDoCalendario) => {
    if (cal.ev === l.evento.chave && cal.fase === f.n) { mudarCalendario({ ev: null, fase: null }); return; }
    mudarCalendario({ ev: l.evento.chave, fase: f.n });
    setTimeout(() => quadroRef.current?.scrollIntoView?.({ behavior: "smooth", block: "nearest" }), 50);
  };
  const fechar = () => {
    const alvo = cal.ev && cal.fase ? `[data-cal-celula="${CSS.escape(`${cal.ev}|${cal.fase}`)}"]` : null;
    mudarCalendario({ ev: null, fase: null });
    // O foco volta para a célula que abriu o quadro (quem usa teclado não se perde).
    if (alvo) setTimeout(() => gradeRef.current?.querySelector<HTMLElement>(alvo)?.focus(), 0);
  };

  const descricao = (
    <>
      Eventos a partir de <strong style={{ color: T.text, ...TABULAR }}>{dma(dados.hoje)}</strong> com prazo de fase até{" "}
      <strong style={{ color: T.text, ...TABULAR }}>{dma(dados.fim)}</strong> ou com fase vencida:{" "}
      <span data-testid="op-cal-contagem">
        <strong style={{ color: T.text, ...TABULAR }}>{fmt0(dados.total)}</strong> {plural(dados.total, "evento", "eventos")},{" "}
        <strong style={{ color: dados.comAtraso > 0 ? TOM.perigo.text : T.text, ...TABULAR }}>{fmt0(dados.comAtraso)}</strong> com fase atrasada
      </span>
      {cal.soAtrasadas && dados.total > dados.comAtraso ? ` (mostrando só esses)` : ""}.{" "}
      <strong style={{ color: T.text, fontWeight: FW.medio }}>Cada peça conta uma vez, na fase em que está agora</strong>{" "}
      — a peça parada no layout aparece só no layout; na produção gráfica, as já liberadas para a gráfica e ainda não entregues. Clique numa célula para ver as peças.
    </>
  );

  return (
    <div data-testid="op-pre-calendario" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <SecaoDaAnalise id="h-op-cal" testId="op-cal" titulo="Eventos × processo × prazo" descricao={descricao}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", columnGap: 20, rowGap: 8, marginBottom: 12 }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
            <Marcador marcado={cal.soAtrasadas} aoMudar={(v) => mudarCalendario({ soAtrasadas: v })} testId="op-cal-so-atrasadas">
              somente eventos com fase atrasada
            </Marcador>
            {cal.ord && (
              <Botao variante="fantasma" tamanho={isMobile ? "toque" : "sm"} onClick={() => mudarCalendario({ ord: null, dir: "asc" })} data-testid="op-cal-ordem-padrao">
                Voltar à ordem padrão
              </Botao>
            )}
          </div>
          <ul aria-label="Legenda das cores" data-testid="op-cal-legenda" style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexWrap: "wrap", columnGap: 16, rowGap: 4 }}>
            {LEGENDA.map((l) => (
              <li key={l.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: FS.small, color: T.second }}>
                <span aria-hidden="true" style={{ ...PINTURA[l.id], width: 18, height: 12, borderRadius: 3, boxSizing: "border-box", flexShrink: 0 }} />
                {l.texto}
              </li>
            ))}
          </ul>
        </div>

        {dados.linhas.length === 0 ? (
          <Vazio testId="op-cal-vazio" alto>
            {cal.soAtrasadas ? "Nenhum evento com fase atrasada." : "Nenhum evento com prazo de fase nos próximos 15 dias."}
          </Vazio>
        ) : (
          <div
            ref={gradeRef}
            className="pop-rolagem"
            data-testid="op-cal-grade"
            role="region"
            aria-label="Eventos × processo × prazo (a tabela rola de lado)"
            tabIndex={0}
            style={{ overflow: "auto", maxHeight: isMobile ? "72vh" : "min(880px, 78vh)", border: `1px solid ${T.border}`, borderRadius: R.md, ...TABULAR }}
          >
            <Grade linhas={dados.linhas} hoje={dados.hoje} isMobile={isMobile} ordem={cal.ord} direcao={cal.dir}
              aoOrdenar={ordenarPor} aoAbrir={abrir} selEv={cal.ev} selFase={cal.fase} diasDaAprovacao={diasDaAprovacao} />
          </div>
        )}
      </SecaoDaAnalise>

      {eventoSel && faseSel && (
        <div ref={quadroRef} id="op-cal-quadro">
          <QuadroDePecas
            nome={eventoSel.nome}
            fase={faseSel.nome}
            prazo={prazoDoQuadro}
            prazoDoEvento={eventoSel.fases[faseSel.n]?.prazo || null}
            hoje={painel.hoje}
            pecas={pecas}
            nomes={painel.nomes}
            isMobile={isMobile}
            aoFechar={fechar}
          />
        </div>
      )}
    </div>
  );
}

// ─── A grade ────────────────────────────────────────────────────────────────

function Grade({ linhas, hoje, isMobile, ordem, direcao, aoOrdenar, aoAbrir, selEv, selFase, diasDaAprovacao }: {
  linhas: LinhaDoCalendario[];
  hoje: string;
  isMobile: boolean;
  ordem: ColunaDoCalendario | null;
  direcao: "asc" | "desc";
  aoOrdenar: (c: ColunaDoCalendario) => void;
  aoAbrir: (l: LinhaDoCalendario, f: CelulaDoCalendario) => void;
  selEv: string | null;
  selFase: number | null;
  diasDaAprovacao: number;
}) {
  const larguraDoEvento = isMobile ? 128 : 172;
  const th: React.CSSProperties = {
    position: "sticky", top: 0, zIndex: 2, padding: 0, backgroundColor: T.low,
    borderBottom: `1px solid ${T.bdark}`, fontSize: FS.micro, fontWeight: FW.rotulo, letterSpacing: "0.08em",
    textTransform: "uppercase", color: T.second, verticalAlign: "bottom",
  };
  const td: React.CSSProperties = { padding: "5px 4px", borderBottom: `1px solid ${N.n3}`, verticalAlign: "top", backgroundColor: T.surface };
  const fixa: React.CSSProperties = { position: "sticky", left: 0, boxShadow: `1px 0 0 ${T.border}` };

  const cabeca = (id: ColunaDoCalendario, rotulo: string, extra: React.CSSProperties, alinhar: "left" | "center") => {
    const ativa = ordem === id;
    return (
      <th
        key={id}
        scope="col"
        aria-sort={ativa ? (direcao === "asc" ? "ascending" : "descending") : "none"}
        style={{ ...th, ...extra }}
      >
        <button
          type="button"
          className="pop-ordenar"
          onClick={() => aoOrdenar(id)}
          data-testid={`op-cal-ordem-${id}`}
          title={ativa ? `Ordenado por ${rotulo.toLowerCase()} (${direcao === "asc" ? "crescente" : "decrescente"}). Clique para inverter.` : `Ordenar por ${rotulo.toLowerCase()}`}
          style={{
            display: "flex", alignItems: "flex-end", justifyContent: alinhar === "center" ? "center" : "flex-start", gap: 4,
            width: "100%", minHeight: isMobile ? 44 : 34, padding: isMobile ? "8px 6px" : "8px 8px", border: "none", background: "none",
            cursor: "pointer", font: "inherit", letterSpacing: "inherit", textTransform: "inherit", textAlign: alinhar,
            color: ativa ? T.accentText : T.second, lineHeight: 1.3,
          }}
        >
          <span>{rotulo}</span>
          {ativa && <span aria-hidden="true" style={{ fontSize: FS.meta, letterSpacing: 0 }}>{direcao === "asc" ? "↑" : "↓"}</span>}
        </button>
      </th>
    );
  };

  return (
    <table style={{ width: "100%", minWidth: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
      <caption className="sr-only">
        Eventos × processo × prazo: o prazo de cada fase por evento e as peças que estão nela agora. Clique no topo de uma coluna para ordenar.
      </caption>
      <thead>
        <tr>
          {cabeca("evento", "Evento", { ...fixa, zIndex: 3, minWidth: larguraDoEvento, maxWidth: isMobile ? 150 : 230 }, "left")}
          {COLUNAS_FIXAS.slice(1).map((c) => cabeca(c.id, c.rotulo, { minWidth: isMobile ? 100 : 104 }, "left"))}
          {FASES_DO_CALENDARIO.map((f) => cabeca(`f${f.n}` as ColunaDoCalendario, f.nome, { minWidth: isMobile ? 124 : 118 }, "center"))}
        </tr>
      </thead>
      <tbody>
        {linhas.map((l) => {
          const atrasado = l.fasesAtrasadas > 0;
          return (
            <tr key={l.evento.chave} data-testid="op-cal-linha" data-evento={l.evento.chave}>
              <th scope="row" style={{ ...td, ...fixa, zIndex: 1, textAlign: "left", minWidth: larguraDoEvento, maxWidth: isMobile ? 150 : 230, padding: isMobile ? "7px 6px" : "7px 10px" }}>
                <span style={{ display: "block", fontSize: isMobile ? FS.meta : FS.body, fontWeight: FW.forte, color: atrasado ? TOM.perigo.text : T.text, lineHeight: 1.3, overflowWrap: "anywhere" }}>
                  {l.evento.nome}
                </span>
                {atrasado && (
                  <span data-testid="op-cal-fases-atrasadas" style={{ display: "block", marginTop: 2, fontSize: FS.small, fontWeight: FW.corpo, color: T.second }}>
                    {l.fasesAtrasadas} {plural(l.fasesAtrasadas, "fase atrasada", "fases atrasadas")}
                  </span>
                )}
                {l.semPecas && (
                  <span style={{ display: "block", marginTop: 2, fontSize: FS.small, fontWeight: FW.corpo, color: T.second }}>sem peças cadastradas</span>
                )}
              </th>
              <td style={{ ...td, padding: isMobile ? "7px 6px" : "7px 8px", whiteSpace: "nowrap", fontSize: FS.meta, color: T.apoio }}>{diaCompleto(l.evento.dataEvento)}</td>
              <td style={{ ...td, padding: isMobile ? "7px 6px" : "7px 8px", whiteSpace: "nowrap", fontSize: FS.meta, color: l.saidaPassou ? T.second : T.apoio }}>
                {l.saidaPassou ? (
                  <span data-testid="op-cal-saida-passou" title="O caminhão já saiu">
                    <span style={{ textDecoration: "line-through" }}>{diaCompleto(l.evento.saidaCaminhao)}</span>
                    <span className="sr-only"> (o caminhão já saiu)</span>
                  </span>
                ) : diaCompleto(l.evento.saidaCaminhao)}
              </td>
              {l.fases.map((f) => (
                <td key={f.n} style={td}>
                  <Celula linha={l} fase={f} hoje={hoje} isMobile={isMobile} selecionada={selEv === l.evento.chave && selFase === f.n} aoAbrir={aoAbrir} diasDaAprovacao={diasDaAprovacao} />
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Celula({ linha, fase: f, hoje, isMobile, selecionada, aoAbrir, diasDaAprovacao }: {
  linha: LinhaDoCalendario; fase: CelulaDoCalendario; hoje: string; isMobile: boolean; selecionada: boolean;
  aoAbrir: (l: LinhaDoCalendario, f: CelulaDoCalendario) => void;
  diasDaAprovacao: number;
}) {
  const testId = `op-cal-celula-f${f.n}`;
  if (f.situacao === "semPrazo" || !f.prazo) {
    return <span data-testid={testId} data-situacao="semPrazo" style={{ display: "block", textAlign: "center", padding: "8px 0", color: T.second }} title="Fase sem prazo">—</span>;
  }
  const caixa: React.CSSProperties = {
    display: "flex", flexDirection: "column", alignItems: "flex-start", justifyContent: "center", gap: 1,
    boxSizing: "border-box", width: "100%", minHeight: isMobile ? 44 : 40, padding: "4px 8px", borderRadius: R.sm,
    font: "inherit", fontSize: FS.meta, lineHeight: 1.3, textAlign: "left", whiteSpace: "nowrap", ...TABULAR,
  };
  const data = <span style={{ fontWeight: FW.forte }}>{diaDaSemana(f.prazo)} {dm(f.prazo)}</span>;

  if (f.pendentes === 0 && f.situacao === "aguardando") {
    return (
      <span data-testid={testId} data-situacao="aguardando" style={{ ...caixa, ...PINTURA.aguardando }} title={`${f.nome} · prazo ${dma(f.prazo)} · nenhuma peça nesta fase agora; ${f.aCaminho} ${plural(f.aCaminho, "peça ainda está", "peças ainda estão")} em fases anteriores`}>
        {data}
        <span style={{ fontSize: FS.small }}>aguarda {fmt0(f.aCaminho)} pç</span>
      </span>
    );
  }

  if (f.pendentes === 0) {
    return (
      <span data-testid={testId} data-situacao="concluida" style={{ ...caixa, ...PINTURA.concluida }} title={`${f.nome} · prazo ${dma(f.prazo)} · ${linha.semPecas ? "evento sem peças" : "nenhuma peça pendente"}`}>
        {data}
        <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: FS.small }}>
          {linha.semPecas ? "sem peças" : <><Check aria-hidden="true" style={{ width: 11, height: 11 }} />concluída</>}
        </span>
      </span>
    );
  }

  // O prazo que vale para as peças desta célula: o ajustado quando só há peça
  // sem aprovação nela (26/10). A situação e os dias de atraso já usam ele.
  const vale = f.prazoEfetivo ?? f.prazo;
  const ajustada = vale !== f.prazo;
  const regra = `Prazo do evento ${dm(f.prazo)} — só há peças sem aprovação nesta fase (Layout + ${diasDaAprovacao} ${plural(diasDaAprovacao, "dia corrido", "dias corridos")})`;
  const atrasada = f.situacao === "atrasada";
  const info = atrasada
    ? `${fmt0(f.pendentes)} pç · ${f.diasAtraso}d atraso`
    : `${fmt0(f.pendentes)} pç ${plural(f.pendentes, "pendente", "pendentes")}`;
  const pintura = PINTURA[f.situacao as Exclude<SituacaoNoCalendario, "semPrazo">];
  // Selecionada: um anel escuro POR FORA (separado por 2px de branco), que não
  // briga com o anel de foco do teclado nem com o contorno laranja da caixa.
  const anel = selecionada ? `0 0 0 2px ${T.surface}, 0 0 0 4px ${T.text}` : "";
  const sombra = [pintura.boxShadow, anel].filter(Boolean).join(", ") || undefined;
  const rotulo = `${linha.evento.nome} — ${f.nome}: prazo ${diaDaSemana(vale)} ${dma(vale)}${ajustada ? ` (ajustado; ${regra.charAt(0).toLowerCase()}${regra.slice(1)})` : ""}. ${fmt0(f.pendentes)} ${plural(f.pendentes, "peça pendente", "peças pendentes")}${atrasada ? `, ${f.diasAtraso} ${plural(f.diasAtraso, "dia", "dias")} de atraso` : ""}. ${selecionada ? "Fechar a lista de peças." : "Ver as peças."}`;
  return (
    <button
      type="button"
      className="pop-cal-celula"
      data-testid={testId}
      data-situacao={f.situacao}
      data-cal-celula={`${linha.evento.chave}|${f.n}`}
      aria-pressed={selecionada}
      aria-controls={selecionada ? "op-cal-quadro" : undefined}
      aria-label={rotulo}
      data-ajustado={ajustada ? "1" : undefined}
      title={`${f.nome} · prazo ${dma(vale)}${ajustada ? " (ajustado)" : ""} · ${f.pendentes} ${plural(f.pendentes, "peça pendente", "peças pendentes")}${atrasada ? ` · vencido há ${diasEntre(hoje, vale)} ${plural(diasEntre(hoje, vale), "dia", "dias")}` : ""}${ajustada ? `\n${regra}` : ""}`}
      onClick={() => aoAbrir(linha, f)}
      style={{ ...caixa, ...pintura, boxShadow: sombra, cursor: "pointer" }}
    >
      {ajustada ? (
        <span data-testid="op-cal-celula-ajustada" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontWeight: FW.forte }}>
          {diaDaSemana(vale)} {dm(vale)}
          <CalendarClock aria-hidden="true" style={{ width: 11, height: 11, flexShrink: 0, color: atrasada ? PINTURA.atrasada.color : TOM.turquesa.text }} />
          <span style={{ fontSize: FS.micro, fontWeight: FW.medio, letterSpacing: "0.04em" }}>ajustado</span>
        </span>
      ) : data}
      <span data-testid="op-cal-celula-info" style={{ fontSize: FS.small, fontWeight: atrasada ? FW.medio : FW.corpo, color: atrasada ? "#ffffff" : T.apoio }}>{info}</span>
    </button>
  );
}

// ─── O quadro peça a peça ───────────────────────────────────────────────────

function QuadroDePecas({ nome, fase, prazo, prazoDoEvento, hoje, pecas, nomes, isMobile, aoFechar }: {
  nome: string; fase: string;
  /** O prazo que vale para as peças do quadro (o ajustado quando só há peça sem aprovação). */
  prazo: string | null;
  prazoDoEvento: string | null;
  hoje: string; pecas: Parameters<typeof TabelaDePecas>[0]["pecas"];
  nomes: Record<string, string>; isMobile: boolean; aoFechar: () => void;
}) {
  const vencida = !!prazo && prazo < hoje;
  const dias = vencida ? diasEntre(hoje, prazo!) : 0;
  const n = pecas.length;
  const ajustado = !!prazo && !!prazoDoEvento && prazo !== prazoDoEvento;
  const resumo = `${fmt0(n)} ${plural(n, "peça", "peças")} ${vencida ? plural(n, "atrasada", "atrasadas") : plural(n, "pendente", "pendentes")} nesta fase · `
    + (prazo ? `prazo da fase ${dma(prazo)}${ajustado ? ` (ajustado; prazo do evento ${dma(prazoDoEvento)})` : ""}${vencida ? ` (vencido há ${dias} ${plural(dias, "dia", "dias")})` : ""}` : "fase sem prazo");
  return (
    <SecaoDaAnalise
      id="h-op-cal-pecas"
      testId="op-cal-pecas"
      titulo={`${nome} — ${fase}`}
      descricao={<span data-testid="op-cal-pecas-resumo" style={{ color: vencida ? TOM.perigo.text : undefined, fontWeight: vencida ? FW.medio : undefined }}>{resumo}</span>}
      acoes={<Botao tamanho={isMobile ? "toque" : "sm"} icone={X} onClick={aoFechar} data-testid="op-cal-pecas-fechar" aria-label="Fechar a lista de peças">Fechar</Botao>}
    >
      <TabelaDePecas pecas={pecas} nomes={nomes} testId="op-tabela-cal-pecas" vazio="Nenhuma peça pendente nesta fase." mostrarEvento={false} mostrarFuraFila />
    </SecaoDaAnalise>
  );
}
