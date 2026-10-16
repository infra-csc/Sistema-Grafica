// ANÁLISES › PRÉ-PRODUÇÃO — o que a Arte, o Atendimento e a Revisão
// fizeram por dia (realizado), o que precisa ser feito até cada prazo
// (planejado) e as pendências por evento. Clicar num número lista as peças;
// clicar no evento lista todas as pendências dele.
import * as React from "react";
import { X } from "lucide-react";
import {
  PROCESSOS_DE_PRE, PASSO_DO_PROCESSO, pecasDaPendencia, pendenciasPorEvento, preRealizadoPorDia, prePlanejadoPorDia,
  rotuloDaEtapaNoPainel, FASES_DO_PAINEL, type PecaDaLinha, type PendenciaDoEvento, type ProcessoDePre,
} from "@shared/painel-operacional";
import { Botao } from "@/components/ui/botao";
import { T, TOM, FS, FW, FONT } from "@/lib/theme";
import { SecaoDaAnalise, TabelaCompacta, idDaPeca, type ColunaDaTabela } from "../blocos";
import { COR, Campo, Chips, DiasDeAtraso, FaixaDeControles, FiltroDeEvento, GraficoDeDias, Marcador, NomeDoEvento, dma, fmt0, opcoesDeEvento } from "../comum";
import type { ContextoDoPainel } from "../contexto";

type ColunaDePre = Exclude<ProcessoDePre, "cadastro">;
const COLUNAS: { id: ColunaDePre; rotulo: string }[] = [
  { id: "layout", rotulo: "Layout" }, { id: "aprovacao", rotulo: "Aprovação" },
  { id: "finalizacao", rotulo: "Finalização" }, { id: "revisao", rotulo: "Revisão final" },
];
const COR_DO_PROCESSO: Record<ProcessoDePre, string> = {
  cadastro: COR.cadastro, layout: COR.layout, aprovacao: COR.aprovacao, finalizacao: COR.finalizacao, revisao: COR.revisao,
};
type Selecao = { evento: string; processo: ColunaDePre | "atrasados" | null };

export default function AbaPre({ ctx }: { ctx: ContextoDoPainel }) {
  const { painel, isMobile } = ctx;
  const [evento, setEvento] = React.useState<string | null>(null);
  const [processos, setProcessos] = React.useState<ProcessoDePre[]>([]);
  const [soAtrasados, setSoAtrasados] = React.useState(false);
  const [selecao, setSelecao] = React.useState<Selecao | null>(null);
  const listaRef = React.useRef<HTMLDivElement>(null);

  const opcoes = React.useMemo(
    () => opcoesDeEvento([...painel.preRealizado.map((r) => r.evento), ...painel.prePlanejado.map((r) => r.evento)], painel.nomes),
    [painel]);
  const realizado = React.useMemo(() => preRealizadoPorDia(painel, evento, processos), [painel, evento, processos]);
  const planejado = React.useMemo(() => prePlanejadoPorDia(painel, evento, processos), [painel, evento, processos]);
  const pendencias = React.useMemo(() => {
    let ls = pendenciasPorEvento(painel).filter((r) => !evento || r.evento === evento);
    if (soAtrasados) ls = ls.filter((r) => r.totalAtrasados > 0);
    return ls;
  }, [painel, evento, soAtrasados]);
  const pecasSelecionadas = React.useMemo(
    () => (selecao ? pecasDaPendencia(painel, selecao.evento, selecao.processo, soAtrasados) : []),
    [painel, selecao, soAtrasados]);

  const ligados = (id: ProcessoDePre) => processos.length === 0 || processos.includes(id);
  const alternar = (id: ProcessoDePre | "todos") => {
    if (id === "todos") { setProcessos([]); return; }
    setProcessos((ps) => (ps.includes(id) ? ps.filter((p) => p !== id) : [...ps, id]));
  };
  const selecionar = (s: Selecao) => {
    setSelecao(s);
    setTimeout(() => listaRef.current?.scrollIntoView?.({ behavior: "smooth", block: "nearest" }), 50);
  };

  const evDaSelecao = selecao ? painel.eventos.find((e) => e.chave === selecao.evento) : null;
  const passo = selecao && selecao.processo && selecao.processo !== "atrasados" ? PASSO_DO_PROCESSO[selecao.processo] : null;
  const prazoDoPasso = evDaSelecao && passo != null ? evDaSelecao.fases[passo]?.prazo : null;
  const vencidoHa = prazoDoPasso && prazoDoPasso < painel.hoje
    ? Math.round((Date.parse(painel.hoje) - Date.parse(prazoDoPasso)) / 86_400_000) : 0;
  const nomeDoProcesso = passo != null ? COLUNAS.find((c) => c.id === selecao!.processo)?.rotulo : "todos os processos";

  const celula = (r: PendenciaDoEvento, c: ColunaDePre) => {
    const n = soAtrasados ? r.atrasados[c] : r.pendentes[c];
    const sel = selecao?.evento === r.evento && selecao.processo === c;
    if (n === 0) return <span style={{ color: T.second }}>—</span>;
    return (
      <button
        type="button"
        className="pop-numero"
        aria-pressed={sel}
        data-testid={`op-pre-celula-${c}`}
        onClick={() => selecionar({ evento: r.evento, processo: c })}
        aria-label={`${painel.nomes[r.evento] ?? r.evento}: ${n} ${soAtrasados ? "atrasados" : "pendentes"} em ${COLUNAS.find((x) => x.id === c)?.rotulo}. Ver as peças.`}
        style={{
          fontVariantNumeric: "tabular-nums", font: "inherit", fontWeight: FW.forte, border: "none", cursor: "pointer",
          background: sel ? T.text : "none", color: sel ? T.surface : soAtrasados ? TOM.perigo.text : T.text,
          textDecoration: sel ? "none" : "underline", textDecorationColor: T.border, textUnderlineOffset: 3,
        }}
      >
        {fmt0(n)}
      </button>
    );
  };

  return (
    <div data-testid="aba-painel-pre" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <FaixaDeControles testId="op-pre-filtros">
        <FiltroDeEvento valor={evento} aoMudar={(v) => { setEvento(v); setSelecao(null); }} opcoes={opcoes} isMobile={isMobile} testId="op-pre-evento" />
        <Campo rotulo="Processo">
          <Chips
            rotulo="Processos de pré-produção"
            testId="op-pre-processo"
            tamanho={isMobile ? "toque" : "sm"}
            opcoes={[{ id: "todos" as const, rotulo: "Todos" }, ...PROCESSOS_DE_PRE.map((p) => ({ id: p.id, rotulo: p.curto }))]}
            ativos={processos.length === 0 ? ["todos"] : processos}
            aoAlternar={(id) => alternar(id as ProcessoDePre | "todos")}
          />
        </Campo>
      </FaixaDeControles>

      <SecaoDaAnalise id="h-op-pre-real" testId="op-pre-real" titulo="Realizado por dia — processos de pré-produção" descricao="Últimos 30 dias, em itens (linhas de peça). Cada processo conta no dia em que a peça passou por ele. O envio de layout tem histórico parcial: o app só guarda essa data para parte das peças.">
        <GraficoDeDias
          testId="op-grafico-pre-real"
          legenda="Processos de pré-produção realizados por dia"
          dados={realizado}
          series={PROCESSOS_DE_PRE.filter((p) => ligados(p.id)).map((p) => ({ chave: p.id, nome: p.rotulo, cor: COR_DO_PROCESSO[p.id] }))}
          formato={(v) => `${fmt0(v)} itens`}
          empilhado
          hoje={painel.hoje}
        />
      </SecaoDaAnalise>

      <SecaoDaAnalise id="h-op-pre-plan" testId="op-pre-plan" titulo="Planejado por dia — o que precisa ser feito" descricao="Cada processo pendente cai no prazo da fase do evento. O que já venceu aparece hoje, em vermelho.">
        <GraficoDeDias
          testId="op-grafico-pre-plan"
          legenda="Processos de pré-produção planejados por dia"
          dados={planejado}
          series={[
            { chave: "atrasado", nome: processos.length ? "Atrasado (processos escolhidos)" : "Atrasado (todas as fases)", cor: COR.atrasado },
            ...PROCESSOS_DE_PRE.filter((p) => p.id !== "cadastro" && ligados(p.id)).map((p) => ({ chave: p.id, nome: p.rotulo, cor: COR_DO_PROCESSO[p.id] })),
          ]}
          formato={(v) => `${fmt0(v)} itens`}
          empilhado
          hoje={painel.hoje}
          vazio="Nenhum processo pendente para este filtro."
        />
      </SecaoDaAnalise>

      <SecaoDaAnalise
        id="h-op-pre-ev" testId="op-pre-evento-tabela" titulo="Pendências de pré-produção por evento"
        descricao={soAtrasados
          ? "Só as peças que já passaram do prazo de cada processo. Clique num número para ver as peças; no evento, para ver todas as atrasadas dele."
          : "Itens que ainda precisam passar por cada processo. Clique num número para ver as peças; no evento, para ver todas as pendências dele."}
        acoes={<Marcador marcado={soAtrasados} aoMudar={setSoAtrasados} testId="op-pre-so-atrasados">somente atrasados de cada processo</Marcador>}
      >
        <TabelaCompacta<PendenciaDoEvento>
          testId="op-tabela-pre"
          legenda="Pendências de pré-produção por evento e processo"
          linhas={pendencias}
          chave={(r) => r.evento}
          limite={15}
          minLargura={620}
          ordemInicial={{ coluna: "atrasados", direcao: "desc" }}
          vazio={soAtrasados ? "Nenhum processo atrasado." : "Sem pendências de pré-produção."}
          // No celular "Atrasados" vem logo depois do evento: é o número que pede
          // ação, e os quatro processos rolam de lado dentro do cartão.
          colunas={((): ColunaDaTabela<PendenciaDoEvento>[] => {
            const evento: ColunaDaTabela<PendenciaDoEvento>[] = [
            { id: "evento", rotulo: "Evento", ordenavel: true, valor: (r) => painel.nomes[r.evento] ?? r.evento,
              render: (r) => <NomeDoEvento nome={painel.nomes[r.evento] ?? r.evento} aoAbrir={() => selecionar({ evento: r.evento, processo: null })} testId="op-pre-evento-nome" /> },
            ];
            const processos: ColunaDaTabela<PendenciaDoEvento>[] = [
            ...COLUNAS.map((c) => ({
              id: c.id, rotulo: c.rotulo, alinhar: "direita" as const, ordenavel: true,
              valor: (r: PendenciaDoEvento) => (soAtrasados ? r.atrasados[c.id] : r.pendentes[c.id]),
              render: (r: PendenciaDoEvento) => celula(r, c.id),
            })),
            ];
            const atrasados: ColunaDaTabela<PendenciaDoEvento>[] = [
            { id: "atrasados", rotulo: "Atrasados", alinhar: "direita", ordenavel: true, titulo: "Processos vencidos (uma peça atrasada em dois processos conta duas vezes)",
              valor: (r) => r.totalAtrasados,
              render: (r) => r.totalAtrasados === 0 ? <span style={{ color: T.second }}>0</span> : (
                <button type="button" className="pop-numero" data-testid="op-pre-celula-atrasados" onClick={() => selecionar({ evento: r.evento, processo: "atrasados" })}
                  aria-label={`${painel.nomes[r.evento] ?? r.evento}: ${r.totalAtrasados} processos atrasados. Ver as peças.`}
                  style={{ font: "inherit", fontWeight: FW.forte, fontVariantNumeric: "tabular-nums", border: "none", background: "none", cursor: "pointer", color: TOM.perigo.text, textDecoration: "underline", textUnderlineOffset: 3 }}>
                  {fmt0(r.totalAtrasados)}
                </button>
              ) },
            ];
            return isMobile ? [...evento, ...atrasados, ...processos] : [...evento, ...processos, ...atrasados];
          })()}
        />
      </SecaoDaAnalise>

      {selecao && (
        <div ref={listaRef}>
          <SecaoDaAnalise
            id="h-op-pre-pecas" testId="op-pre-pecas"
            titulo={`Peças — ${painel.nomes[selecao.evento] ?? selecao.evento}`}
            descricao={`${fmt0(pecasSelecionadas.length)} ${pecasSelecionadas.length === 1 ? "peça" : "peças"} · ${nomeDoProcesso}${soAtrasados || selecao.processo === "atrasados" ? " · só atrasadas" : ""}${prazoDoPasso ? ` · prazo do processo ${dma(prazoDoPasso)}${vencidoHa > 0 ? ` (vencido há ${vencidoHa} ${vencidoHa === 1 ? "dia" : "dias"})` : ""}` : ""}`}
            acoes={<Botao tamanho={isMobile ? "toque" : "sm"} icone={X} onClick={() => setSelecao(null)} data-testid="op-pre-pecas-fechar">Fechar</Botao>}
          >
            <TabelaDePecas pecas={pecasSelecionadas} nomes={painel.nomes} testId="op-tabela-pre-pecas" vazio="Nenhuma peça nessa seleção." mostrarEvento={false} />
          </SecaoDaAnalise>
        </div>
      )}
    </div>
  );
}

/** A lista de peças (pré-produção e problemas usam a mesma régua de colunas). */
export function TabelaDePecas({ pecas, nomes, testId, vazio, mostrarEvento = true }: {
  pecas: PecaDaLinha[]; nomes: Record<string, string>; testId: string; vazio: string; mostrarEvento?: boolean;
}) {
  return (
    <TabelaCompacta<PecaDaLinha>
      testId={testId}
      larguraDaPrimeira={84}
          encolherAoTransbordar={false}
      legenda="Peças"
      linhas={pecas}
      chave={(p) => p.id}
      limite={15}
      minLargura={860}
      alturaMaxima={560}
      ordemInicial={{ coluna: "atraso", direcao: "desc" }}
      vazio={vazio}
      colunas={[
        { id: "peca", rotulo: "Peça", ordenavel: true, valor: (p) => p.displayId, render: (p) => <span style={{ fontFamily: FONT.mono }}>{idDaPeca(p)}</span> },
        ...(mostrarEvento ? [{ id: "evento", rotulo: "Evento", ordenavel: true, ocultarNoCelular: true, valor: (p: PecaDaLinha) => nomes[p.evento] ?? p.evento }] : []),
        { id: "tipo", rotulo: "Tipo", ordenavel: true, ocultarNoCelular: true, valor: (p) => p.tipo || null },
        { id: "descricao", rotulo: "Descrição", ordenavel: true, valor: (p) => p.descricao || null,
          render: (p) => <span className="pop-texto-longo" title={p.descricao} style={{ fontSize: FS.body }}>{p.descricao || "—"}</span> },
        { id: "qtd", rotulo: "Qtd", alinhar: "direita", ordenavel: true, valor: (p) => p.quantidade },
        { id: "status", rotulo: "Status", ordenavel: true, valor: (p) => rotuloDaEtapaNoPainel(p.etapa) },
        { id: "fase", rotulo: "Fase atual", ordenavel: true, ocultarNoCelular: true, valor: (p) => FASES_DO_PAINEL[p.fase] ?? "—" },
        { id: "prazo", rotulo: "Prazo da fase", ordenavel: true, valor: (p) => p.prazoFase,
          render: (p) => <span style={{ color: p.diasAtraso > 0 ? TOM.perigo.text : undefined, fontWeight: p.diasAtraso > 0 ? FW.forte : undefined }}>{dma(p.prazoFase)}</span> },
        { id: "atraso", rotulo: "Atraso (dias)", alinhar: "direita", ordenavel: true, valor: (p) => p.diasAtraso, render: (p) => <DiasDeAtraso dias={p.diasAtraso} /> },
      ]}
    />
  );
}
