// ANÁLISES › PRODUÇÃO — três sub-abas:
//   · Realizado por dia: impressão e acabamento dos últimos 30 dias, o
//     planejado de cada processo e a produção por evento (com o filtro de
//     tipo de material, 30/10);
//   · Projeção de produção do dia: a carga de um dia (atrasados + programados
//     − já produzidos), a fila por data de prazo (clicar num dia projeta o dia)
//     e as quebras por material, acabamento e evento;
//   · Evento por material (30/10, Pedro): um evento, uma linha por material,
//     o m² em cada status — clicar num número lista as peças dele.
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import {
  producaoPlanejadaPorDia, producaoPorEvento, producaoRealizadaPorDia, projetarDia, diaDaSemana, normalizarRotulo,
  producaoDoEventoPorMaterial, m2DaPecaPorStatus, STATUS_DO_MATERIAL, ROTULO_DO_STATUS_DO_MATERIAL, FASE_PRODUCAO,
  type CartaoDaProjecao, type MedidaDaProjecao, type PecaDaLinha, type ProcessoDeProducao, type ClasseDaProjecao,
  type PainelOperacional, type StatusDoMaterial, type LinhaDoMaterial,
} from "@shared/painel-operacional";
import { OUTROS_MATERIAIS, ROTULO_OUTROS_MATERIAIS, filtroDeMaterial, materiaisDoCadastro } from "@shared/materiais";
import { Segmentado } from "@/components/ui/abas";
import { Botao } from "@/components/ui/botao";
import { FilterSelect } from "@/components/filter-select";
import { T, TOM, FS, FW, R, FONT } from "@/lib/theme";
import { SecaoDaAnalise, TabelaCompacta, idDaPeca } from "../blocos";
import {
  BarrasEmpilhadas, COR, Campo, CelulaDaPeca, FaixaDeControles, FiltroDeEvento, FiltroDeMaterial, opcoesDeEvento, GraficoDeDias, Marcador, Seletor, SimNao,
  SelosDaLinha, StatusDaLinha, dm, dma, fmt0, fmt1, fmtM2, formatoDaMedida, naoSegueAMarca, type MedidaDaTela,
} from "../comum";
import type { ContextoDoPainel, SubDaProducao } from "../contexto";

const MEDIDAS: { id: MedidaDaTela; rotulo: string }[] = [
  { id: "m2", rotulo: "m²" }, { id: "unidades", rotulo: "Peças (unidades)" }, { id: "itens", rotulo: "Itens (linhas de peça)" },
];
const MEDIDAS_DA_PROJECAO: { id: MedidaDaProjecao; rotulo: string }[] = [{ id: "m2", rotulo: "m²" }, { id: "unidades", rotulo: "Peças (unidades)" }];
const PROCESSOS: { id: ProcessoDeProducao; rotulo: string }[] = [{ id: "impressao", rotulo: "Impressão" }, { id: "acabamento", rotulo: "Acabamento" }];

export default function AbaProducao({ ctx }: { ctx: ContextoDoPainel }) {
  const { sub, trocarSub, isMobile } = ctx;
  return (
    <div data-testid="aba-painel-producao" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Segmentado
        itens={[
          { id: "realizado", rotulo: isMobile ? "Realizado" : "Realizado por dia", title: "Realizado por dia", ariaControls: "painel-op-producao-sub" },
          { id: "projecao", rotulo: isMobile ? "Projeção do dia" : "Projeção de produção do dia", title: "Projeção de produção do dia", ariaControls: "painel-op-producao-sub" },
          { id: "material", rotulo: isMobile ? "Por material" : "Evento por material", title: "Produção do evento por material", ariaControls: "painel-op-producao-sub" },
        ]}
        ativo={sub}
        aoTrocar={(id) => trocarSub(id as SubDaProducao)}
        rotuloDaLista="Painéis de produção"
        prefixoDeTestId="op-sub"
        testId="op-subabas"
        tamanho={isMobile ? "toque" : "md"}
        larguraCheia={isMobile}
        style={{ alignSelf: isMobile ? "stretch" : "flex-start" }}
      />
      <div id="painel-op-producao-sub" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {sub === "realizado" ? <Realizado ctx={ctx} /> : sub === "projecao" ? <Projecao ctx={ctx} /> : <EventoPorMaterial ctx={ctx} />}
      </div>
    </div>
  );
}

// ─── Realizado por dia ───────────────────────────────────────────────────────

function Realizado({ ctx }: { ctx: ContextoDoPainel }) {
  const { painel, isMobile } = ctx;
  const [evento, setEvento] = React.useState<string | null>(null);
  const [medida, setMedida] = React.useState<MedidaDaTela>("m2");
  const formato = formatoDaMedida(medida);
  const opcoes = React.useMemo(
    () => opcoesDeEvento([...painel.prodRealizado.map((r) => r.evento), ...painel.prodPlanejado.map((r) => r.evento)], painel.nomes),
    [painel]);
  const realizado = React.useMemo(() => producaoRealizadaPorDia(painel, evento, medida), [painel, evento, medida]);
  const planImp = React.useMemo(() => producaoPlanejadaPorDia(painel, "impressao", evento, medida), [painel, evento, medida]);
  const planAcab = React.useMemo(() => producaoPlanejadaPorDia(painel, "acabamento", evento, medida), [painel, evento, medida]);
  const material = useFiltroDeMaterial(painel);
  const porEvento = React.useMemo(
    () => producaoPorEvento(painel, material.filtro).filter((r) => !evento || r.evento === evento),
    [painel, evento, material.filtro]);
  const serieDoPlano = (proc: ProcessoDeProducao) => [
    { chave: "atrasado", nome: "Atrasado (prazo vencido)", cor: COR.atrasado },
    { chave: "liberado", nome: "Liberado p/ produção", cor: proc === "impressao" ? COR.prazo : COR.acabamento },
    { chave: "preProducao", nome: "Ainda em pré-produção", cor: COR.neutro },
  ];

  return (
    <>
      <FaixaDeControles testId="op-producao-filtros">
        <FiltroDeEvento valor={evento} aoMudar={setEvento} opcoes={opcoes} isMobile={isMobile} testId="op-producao-evento" />
        <Campo rotulo="Medida" id="op-producao-medida">
          <Seletor id="op-producao-medida" rotulo="Medida" valor={medida} opcoes={MEDIDAS} aoMudar={setMedida} testId="op-producao-medida" />
        </Campo>
      </FaixaDeControles>

      <SecaoDaAnalise
        id="h-op-prod-real" testId="op-prod-real" titulo="Realizado por dia — impressão e acabamento"
        descricao={`Últimos 30 dias. Impressão = dia em que a peça saiu toda da impressora (Impresso/acabamento). Acabamento = dia da conferência (acabamento concluído e conferido). Peças de reuso não entram.${naoSegueAMarca(ctx.marca)}`}
      >
        <GraficoDeDias
          testId="op-grafico-prod-real"
          legenda="Impressão e acabamento realizados por dia nos últimos 30 dias"
          dados={realizado}
          series={[{ chave: "impressao", nome: "Impressão", cor: COR.prazo }, { chave: "acabamento", nome: "Acabamento", cor: COR.acabamento }]}
          formato={formato}
          hoje={painel.hoje}
        />
      </SecaoDaAnalise>

      <div className="pop-grade-2">
        <SecaoDaAnalise id="h-op-plan-imp" testId="op-plan-imp" titulo="Planejado por dia — impressão" descricao={`O que falta imprimir, dividido pelos dias úteis (seg–sáb) até o prazo de produção gráfica do evento.${naoSegueAMarca(ctx.marca)}`}>
          <GraficoDeDias testId="op-grafico-plan-imp" legenda="Impressão planejada por dia" dados={planImp} series={serieDoPlano("impressao")} formato={formato} empilhado hoje={painel.hoje} vazio="Nada a imprimir para este filtro." />
        </SecaoDaAnalise>
        <SecaoDaAnalise id="h-op-plan-acab" testId="op-plan-acab" titulo="Planejado por dia — acabamento" descricao={`O que falta acabar e conferir, no mesmo critério de prazo.${naoSegueAMarca(ctx.marca)}`}>
          <GraficoDeDias testId="op-grafico-plan-acab" legenda="Acabamento planejado por dia" dados={planAcab} series={serieDoPlano("acabamento")} formato={formato} empilhado hoje={painel.hoje} vazio="Nada a acabar para este filtro." />
        </SecaoDaAnalise>
      </div>

      <SecaoDaAnalise
        id="h-op-prod-ev" testId="op-prod-evento" titulo="Produção por evento"
        descricao={<>
          Realizado nos últimos 30 dias e o saldo que ainda falta produzir.{naoSegueAMarca(ctx.marca)}
          {material.escolhidos.length > 0 && (
            <span data-testid="op-prod-evento-material-escolhido" style={{ display: "block", marginTop: 4, color: T.text, fontWeight: FW.medio }}>
              Só {material.rotuloDosEscolhidos} — todas as colunas contam apenas as peças desse{material.escolhidos.length > 1 ? "s materiais" : " material"}.
            </span>
          )}
        </>}
        acoes={<FiltroDeMaterial valores={material.escolhidos} aoMudar={material.escolher} opcoes={material.opcoes} isMobile={isMobile} testId="op-prod-evento-material" />}
      >
        <TabelaCompacta
          testId="op-tabela-prod-evento"
          legenda={`Produção por evento: impresso e acabado em 30 dias, a imprimir e a acabar${material.escolhidos.length > 0 ? ` — só ${material.rotuloDosEscolhidos}` : ""}`}
          linhas={porEvento}
          chave={(r) => r.evento}
          limite={15}
          minLargura={780}
          ordemInicial={{ coluna: "aImprimirM2", direcao: "desc" }}
          vazio={material.escolhidos.length > 0 ? "Nenhum evento com peça desse material." : "Sem produção para este filtro."}
          colunas={[
            { id: "evento", rotulo: "Evento", ordenavel: true, valor: (r) => painel.nomes[r.evento] ?? r.evento },
            { id: "impresso", rotulo: "Impresso 30d (m²)", alinhar: "direita", ordenavel: true, valor: (r) => r.impressoM2_30d },
            { id: "acabado", rotulo: "Acabado 30d (m²)", alinhar: "direita", ordenavel: true, ocultarNoCelular: true, valor: (r) => r.acabadoM2_30d },
            { id: "aImprimirM2", rotulo: "A imprimir (m²)", alinhar: "direita", ordenavel: true, valor: (r) => r.aImprimirM2 },
            { id: "aImprimirUn", rotulo: "A imprimir (peças)", alinhar: "direita", ordenavel: true, ocultarNoCelular: true, valor: (r) => r.aImprimirUn },
            { id: "aAcabarUn", rotulo: "A acabar (peças)", alinhar: "direita", ordenavel: true, valor: (r) => r.aAcabarUn },
            { id: "prazo", rotulo: "Prazo produção", ordenavel: true, ocultarNoCelular: true, valor: (r) => r.prazoProducao,
              render: (r) => {
                const vencido = !!r.prazoProducao && r.prazoProducao < painel.hoje && r.aImprimirUn + r.aAcabarUn > 0;
                return <span style={{ color: vencido ? TOM.perigo.text : undefined, fontWeight: vencido ? FW.forte : undefined }}>{r.prazoProducao ? dma(r.prazoProducao) : "—"}</span>;
              } },
          ]}
        />
      </SecaoDaAnalise>
    </>
  );
}

// ─── Tipo de material (30/10, Pedro) ─────────────────────────────────────────

/** O cadastro de materiais do app — o mesmo que a peça oferece ao ser cadastrada. */
function useCadastroDeMateriais(): string[] {
  const { data: catalogo = [] } = useQuery<{ kind: string; value: string }[]>({ queryKey: ["/api/catalog-options"] });
  const { data: modelos = [] } = useQuery<{ material?: string | null }[]>({ queryKey: ["/api/standard-items"] });
  // Sem o cadastro (falha ou resposta inesperada), o filtro fica com os padrão — a tela não cai.
  return React.useMemo(
    () => materiaisDoCadastro(normalizarRotulo, Array.isArray(catalogo) ? catalogo : [], Array.isArray(modelos) ? modelos : []),
    [catalogo, modelos]);
}

const rotuloDoMaterial = (m: string) => (m === OUTROS_MATERIAIS ? ROTULO_OUTROS_MATERIAIS : m);

function useFiltroDeMaterial(painel: Pick<PainelOperacional, "prodRealizado" | "prodPlanejado">) {
  const cadastro = useCadastroDeMateriais();
  const [escolhidos, escolher] = React.useState<string[]>([]);
  const opcoes = React.useMemo(() => {
    const doCadastro = new Set(cadastro);
    const fora = [...painel.prodRealizado, ...painel.prodPlanejado].some((r) => !doCadastro.has(r.material));
    return [
      ...cadastro.map((m) => ({ value: m, label: m })),
      ...(fora ? [{ value: OUTROS_MATERIAIS, label: ROTULO_OUTROS_MATERIAIS }] : []),
    ];
  }, [cadastro, painel]);
  const filtro = React.useMemo(() => filtroDeMaterial(escolhidos, cadastro), [escolhidos, cadastro]);
  return { escolhidos, escolher, opcoes, filtro, rotuloDosEscolhidos: escolhidos.map(rotuloDoMaterial).join(", ") };
}

// ─── Produção do evento por material (30/10, Pedro) ──────────────────────────

/** A célula escolhida: material (null = todos) × status (null = todos). */
type CelulaEscolhida = { material: string | null; status: StatusDoMaterial | null };

function EventoPorMaterial({ ctx }: { ctx: ContextoDoPainel }) {
  const { painel, isMobile } = ctx;
  // Abre num evento de verdade: o que tem mais m² ainda a imprimir.
  const porEventoInteiro = React.useMemo(() => producaoPorEvento(painel), [painel]);
  const opcoes = React.useMemo(() => opcoesDeEvento(painel.eventos.map((e) => e.chave), painel.nomes), [painel]);
  const sugerido = React.useMemo(() => {
    const ativos = new Set(painel.eventos.map((e) => e.chave));
    const maior = porEventoInteiro.filter((r) => ativos.has(r.evento)).sort((a, b) => b.aImprimirM2 - a.aImprimirM2)[0];
    return maior?.evento ?? painel.eventos[0]?.chave ?? null;
  }, [painel, porEventoInteiro]);
  const [escolhido, setEscolhido] = React.useState<string | null>(null);
  const evento = escolhido && painel.eventos.some((e) => e.chave === escolhido) ? escolhido : sugerido;
  const [celula, setCelula] = React.useState<CelulaEscolhida | null>(null);
  React.useEffect(() => { setCelula(null); }, [evento]);

  const rel = React.useMemo(() => (evento ? producaoDoEventoPorMaterial(painel.pecas, evento) : null), [painel, evento]);
  const doEvento = painel.eventos.find((e) => e.chave === evento) ?? null;
  const prazo = doEvento?.fases[FASE_PRODUCAO]?.prazo ?? null;
  const saldoNoOutro = evento ? porEventoInteiro.find((r) => r.evento === evento)?.aImprimirM2 ?? 0 : 0;
  const refDaLista = React.useRef<HTMLDivElement>(null);

  const abrir = (c: CelulaEscolhida) => {
    setCelula(c);
    requestAnimationFrame(() => refDaLista.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  const numero = (valor: number, c: CelulaEscolhida, rotulo: string, forte = false) => (valor > 0
    ? (
      <button
        type="button"
        onClick={() => abrir(c)}
        aria-label={`${fmt0(valor)} m² — ver as peças de ${rotulo}`}
        aria-pressed={celula?.material === c.material && celula?.status === c.status}
        data-testid={`op-mat-celula-${c.material ?? "todos"}-${c.status ?? "total"}`}
        className="pop-link"
        style={{ border: "none", background: "none", padding: 0, font: "inherit", fontWeight: forte ? FW.forte : FW.medio, color: T.accentText, textDecoration: "underline", textUnderlineOffset: 3, cursor: "pointer", fontVariantNumeric: "tabular-nums" }}
      >
        {fmt0(valor)}
      </button>
    )
    : <span style={{ color: T.second }}>0</span>);
  const rotuloDaCelula = (c: CelulaEscolhida) =>
    [c.material ?? "todos os materiais", c.status ? ROTULO_DO_STATUS_DO_MATERIAL[c.status] : null].filter(Boolean).join(" · ");

  const colunaDoStatus = (s: StatusDoMaterial) => ({
    id: s, rotulo: `${ROTULO_DO_STATUS_DO_MATERIAL[s]} (m²)`, alinhar: "direita" as const, ordenavel: true,
    ocultarNoCelular: s === "pre" || s === "acabado",
    valor: (l: LinhaDoMaterial) => l.m2[s],
    render: (l: LinhaDoMaterial) => numero(l.m2[s], { material: l.material, status: s }, `${l.material} em ${ROTULO_DO_STATUS_DO_MATERIAL[s]}`),
  });

  // As peças da célula escolhida, com o m² DAQUELE status (a parcial em impressão aparece nos dois).
  const pecasDaCelula = React.useMemo(() => {
    if (!celula || !evento) return [];
    return painel.pecas
      .filter((p) => p.evento === evento && p.unidades > 0 && (!celula.material || p.material === celula.material))
      .map((p) => ({ p, partes: m2DaPecaPorStatus(p) }))
      .filter(({ partes }) => (celula.status ? partes[celula.status] > 0 : STATUS_DO_MATERIAL.some((s) => partes[s] > 0)))
      .map(({ p, partes }) => ({ ...p, m2DaCelula: celula.status ? partes[celula.status] : p.m2 }));
  }, [painel, evento, celula]);

  return (
    <>
      <SecaoDaAnalise
        id="h-op-mat-ev" testId="op-mat-evento" titulo="Produção do evento por material"
        descricao={<>
          O m² de cada material no status em que a peça está. <strong style={{ color: T.text, fontWeight: FW.medio }}>Pré-produção</strong> = Lista de imagens, Layout, Aprovação, Finalização e Revisão;
          {" "}<strong style={{ color: T.text, fontWeight: FW.medio }}>A imprimir</strong> = liberada para a Gráfica e ainda na fila da impressora;
          {" "}<strong style={{ color: T.text, fontWeight: FW.medio }}>A acabar</strong> = impressa, acabamento não conferido;
          {" "}<strong style={{ color: T.text, fontWeight: FW.medio }}>Acabado</strong> = conferida, embalada ou entregue (tudo do evento). Clique num número para ver as peças.
        </>}
      >
        <FaixaDeControles testId="op-mat-controles">
          <Campo rotulo="Evento" id="op-mat-evento-escolha">
            <FilterSelect
              kind="field" label="Evento" placeholder="Escolha um evento" hideWhenEmpty={false}
              value={evento ?? ""} onChange={(v) => { if (v) setEscolhido(v); }} options={opcoes}
              searchPlaceholder="Buscar evento…" emptyText="Nenhum evento encontrado."
              testId="op-mat-evento-escolha" fullWidth={isMobile} panelWidth={isMobile ? undefined : 340} triggerStyle={isMobile ? undefined : { minWidth: 260 }}
            />
          </Campo>
        </FaixaDeControles>

        {!evento || !rel ? (
          <p data-testid="op-mat-sem-evento" style={{ margin: "14px 0 0", fontSize: FS.small, color: T.second }}>Nenhum evento em andamento.</p>
        ) : (
          <>
            <dl data-testid="op-mat-resumo" style={{ display: "flex", flexWrap: "wrap", gap: isMobile ? "10px 20px" : "10px 32px", margin: "16px 0 14px" }}>
              {([
                ["Prazo de produção", prazo ? dma(prazo) : "—", "op-mat-prazo"],
                ["Total", `${fmt0(rel.total.total)} m²`, "op-mat-total-m2"],
                ["Peças", `${fmt0(rel.total.unidades)} un.`, "op-mat-total-pecas"],
              ] as const).map(([rotulo, valor, testId]) => (
                <div key={testId} style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                  <dt style={{ fontSize: FS.micro, fontWeight: FW.rotulo, letterSpacing: "0.1em", textTransform: "uppercase", color: T.second }}>{rotulo}</dt>
                  <dd data-testid={testId} style={{ margin: 0, fontFamily: FONT.display, fontSize: FS.title, fontWeight: FW.forte, color: T.text, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em" }}>{valor}</dd>
                </div>
              ))}
            </dl>
            <TabelaCompacta<LinhaDoMaterial>
              testId="op-tabela-mat"
              legenda={`Produção de ${painel.nomes[evento] ?? evento} por material: m² em cada status`}
              linhas={rel.linhas}
              chave={(l) => l.material}
              limite={20}
              minLargura={760}
              larguraDaPrimeira={140}
              ordemInicial={{ coluna: "aImprimir", direcao: "desc" }}
              vazio="Este evento não tem peça a produzir."
              colunas={[
                { id: "material", rotulo: "Material", ordenavel: true, valor: (l) => l.material },
                ...STATUS_DO_MATERIAL.map(colunaDoStatus),
                { id: "total", rotulo: "Total (m²)", alinhar: "direita", ordenavel: true, valor: (l) => l.total,
                  render: (l) => numero(l.total, { material: l.material, status: null }, `${l.material}, todos os status`, true) },
                { id: "unidades", rotulo: "Peças", alinhar: "direita", ordenavel: true, valor: (l) => l.unidades, titulo: "Unidades a produzir" },
              ]}
              rodape={{
                rotulo: "Total",
                valores: {
                  ...Object.fromEntries(STATUS_DO_MATERIAL.map((s) => [s, numero(rel.total.m2[s], { material: null, status: s }, `todos os materiais em ${ROTULO_DO_STATUS_DO_MATERIAL[s]}`, true)])),
                  total: numero(rel.total.total, { material: null, status: null }, "todos os materiais, todos os status", true),
                  unidades: fmt0(rel.total.unidades),
                },
              }}
            />
            {ctx.marca === "todas" && rel.linhas.length > 0 && (
              <p data-testid="op-mat-conciliacao" style={{ margin: "10px 0 0", fontSize: FS.small, color: T.second, lineHeight: 1.5 }}>
                No relatório <strong style={{ color: T.text, fontWeight: FW.medio }}>Produção por evento</strong>, a coluna "A imprimir" deste evento é{" "}
                <strong style={{ color: T.text, fontWeight: FW.medio, fontVariantNumeric: "tabular-nums" }}>{fmt0(saldoNoOutro)} m²</strong>: o saldo inteiro da impressora, que aqui aparece dividido em
                Pré-produção + A imprimir (<span style={{ fontVariantNumeric: "tabular-nums" }}>{fmt0(rel.total.m2.pre)} + {fmt0(rel.total.m2.aImprimir)} = {fmt0(rel.total.m2.pre + rel.total.m2.aImprimir)} m²</span>
                {rel.total.m2.pre + rel.total.m2.aImprimir !== saldoNoOutro ? "; a diferença de 1 m² é do arredondamento de cada coluna" : ""}).
              </p>
            )}
            {ctx.marca !== "todas" && (
              <p style={{ margin: "10px 0 0", fontSize: FS.small, color: T.second }}>Segue o filtro de peças sem aprovação da página: só as peças com a marca escolhida.</p>
            )}
          </>
        )}
      </SecaoDaAnalise>

      {celula && evento && (
        <div ref={refDaLista} style={{ scrollMarginTop: 72 }}>
          <SecaoDaAnalise
            id="h-op-mat-pecas" testId="op-mat-pecas" titulo={`Peças · ${rotuloDaCelula(celula)}`}
            descricao={`${fmt0(pecasDaCelula.length)} ${pecasDaCelula.length === 1 ? "peça" : "peças"} de ${painel.nomes[evento] ?? evento}. O m² é o desta coluna — a peça impressa em parte aparece em "A imprimir" e em "A acabar".`}
            acoes={<Botao variante="secundario" tamanho={isMobile ? "toque" : "sm"} onClick={() => setCelula(null)} data-testid="op-mat-pecas-fechar"><X aria-hidden="true" style={{ width: 14, height: 14 }} />Fechar lista</Botao>}
          >
            <TabelaCompacta<PecaDaLinha & { m2DaCelula: number }>
              testId="op-tabela-mat-pecas"
              larguraDaPrimeira={84}
              encolherAoTransbordar={false}
              legenda={`Peças de ${rotuloDaCelula(celula)}`}
              linhas={pecasDaCelula}
              chave={(p) => p.id}
              limite={20}
              minLargura={820}
              ordemInicial={{ coluna: "m2", direcao: "desc" }}
              vazio="Nenhuma peça nesta célula."
              colunas={[
                { id: "peca", rotulo: "Peça", ordenavel: true, valor: (p) => p.displayId, render: (p) => <CelulaDaPeca id={idDaPeca(p)} isMobile={isMobile} /> },
                { id: "tipo", rotulo: "Tipo", ordenavel: true, valor: (p) => [p.tipo, p.descricao].filter(Boolean).join(" · ") || "—" },
                ...(celula.material ? [] : [{ id: "material", rotulo: "Material", ordenavel: true, ocultarNoCelular: true, valor: (p: PecaDaLinha) => p.material }]),
                { id: "status", rotulo: "Status", ordenavel: true, ocultarNoCelular: true, valor: (p) => p.fase, render: (p) => <StatusDaLinha p={p} /> },
                { id: "qtd", rotulo: "Qtd", alinhar: "direita", ordenavel: true, valor: (p) => p.unidades },
                { id: "m2", rotulo: "m²", alinhar: "direita", ordenavel: true, valor: (p) => p.m2DaCelula, render: (p) => fmt1(p.m2DaCelula) },
              ]}
            />
          </SecaoDaAnalise>
        </div>
      )}
    </>
  );
}

// ─── Projeção de produção do dia ─────────────────────────────────────────────

const NOME_DO_PROCESSO: Record<ProcessoDeProducao, string> = { impressao: "Impressão", acabamento: "Acabamento" };

function Projecao({ ctx }: { ctx: ContextoDoPainel }) {
  const { painel, isMobile } = ctx;
  const [dia, setDia] = React.useState(painel.hoje);
  const [rascunhoDoDia, setRascunhoDoDia] = React.useState(painel.hoje);
  const [medida, setMedida] = React.useState<MedidaDaProjecao>("m2");
  const [processo, setProcesso] = React.useState<ProcessoDeProducao>("impressao");
  const [incluirAtrasados, setIncluirAtrasados] = React.useState(true);
  const proj = React.useMemo(
    () => projetarDia(painel, { dia, processo, medida, incluirAtrasados }),
    [painel, dia, processo, medida, incluirAtrasados]);
  const fmt = medida === "m2" ? fmtM2 : (v: number) => `${fmt0(v)} pç`;
  const escolherDia = (d: string) => { const ok = d >= painel.hoje ? d : painel.hoje; setDia(ok); setRascunhoDoDia(ok); };

  const seriesDaQuebra = [
    ...(incluirAtrasados ? [{ chave: "atrasado", nome: "Atrasados", cor: COR.atrasado }] : []),
    { chave: "pendente", nome: "Programado pendente", cor: COR.prazo },
    { chave: "produzido", nome: "Já produzido (abatido)", cor: COR.neutro },
  ];
  const nota = (extra = "") => `${NOME_DO_PROCESSO[processo]} · ${dma(proj.dia)} · ${medida === "m2" ? "m²" : "peças"}${extra}. Número no fim da barra = carga do dia.`;
  const quebra = (linhas: typeof proj.porMaterial) => linhas.map((q) => ({
    id: q.rotulo, rotulo: q.rotulo, partes: { atrasado: q.atrasado, pendente: q.pendente, produzido: q.produzido }, total: q.carga,
    extra: `Carga do dia: ${fmt(q.carga)}`,
  }));
  const porEvento = proj.porEvento.slice(0, 20);

  return (
    <>
      <SecaoDaAnalise
        id="h-op-proj" testId="op-projecao" titulo="Projeção de produção do dia"
        descricao="Carga do dia = atrasados + programados para o dia − já produzidos para o dia. Programado = peças cujo prazo de produção gráfica cai no dia. Atrasados = só o que já venceu (prazo anterior a hoje) e ainda não passou pelo processo; datas futuras nunca entram como atrasadas."
      >
        <FaixaDeControles testId="op-projecao-controles">
          <Campo rotulo="Dia" id="op-proj-dia">
            <input
              id="op-proj-dia"
              type="date"
              min={painel.hoje}
              value={rascunhoDoDia}
              onChange={(e) => { setRascunhoDoDia(e.target.value); if (e.target.value && e.target.validity.valid) escolherDia(e.target.value); }}
              onBlur={() => setRascunhoDoDia(dia)}
              data-testid="op-proj-dia"
              aria-label="Dia da projeção"
              className="pop-select"
              style={{ height: 36, padding: "0 10px", borderRadius: R.md, border: `1px solid ${T.border}`, backgroundColor: T.surface, color: T.text, fontFamily: FONT.corpo, fontSize: isMobile ? FS.lead : FS.body }}
            />
          </Campo>
          <Campo rotulo="Medida" id="op-proj-medida">
            <Seletor id="op-proj-medida" rotulo="Medida da projeção" valor={medida} opcoes={MEDIDAS_DA_PROJECAO} aoMudar={setMedida} testId="op-proj-medida" />
          </Campo>
          <Campo rotulo="Detalhar processo" id="op-proj-processo">
            <Seletor id="op-proj-processo" rotulo="Processo" valor={processo} opcoes={PROCESSOS} aoMudar={setProcesso} testId="op-proj-processo" />
          </Campo>
          <Marcador marcado={incluirAtrasados} aoMudar={setIncluirAtrasados} testId="op-proj-atrasados">incluir atrasados</Marcador>
        </FaixaDeControles>
        <div className="pop-grade-2" style={{ marginTop: 14 }}>
          {proj.cartoes.map((c) => <CartaoDaCarga key={c.processo} c={c} dia={proj.dia} medida={medida} incluirAtrasados={incluirAtrasados} />)}
        </div>
      </SecaoDaAnalise>

      <SecaoDaAnalise
        id="h-op-fila" testId="op-fila" titulo="Fila por data de prazo"
        descricao="Programado de cada dia (pendente e já produzido); os atrasados (vencidos até ontem) aparecem só em hoje. Clique num dia para projetá-lo."
      >
        <GraficoDeDias
          testId="op-grafico-fila"
          legenda={`Fila de ${NOME_DO_PROCESSO[processo].toLowerCase()} por data de prazo; clicar num dia projeta aquele dia`}
          dados={proj.fila}
          series={[
            { chave: "atrasados", nome: "Atrasados", cor: COR.atrasado },
            { chave: "pendente", nome: "Programado pendente", cor: COR.prazo },
            { chave: "produzido", nome: "Programado já produzido", cor: COR.neutro },
          ]}
          formato={fmt}
          empilhado
          hoje={painel.hoje}
          selecionado={proj.dia}
          aoClicarDia={escolherDia}
          vazio="Nada programado."
        />
        {proj.fila.length > 0 && (
          <div className="pop-dias" role="group" aria-label="Projetar um dia da fila" style={{ display: "flex", gap: 6, overflowX: "auto", marginTop: 10, paddingBottom: 2 }}>
            {proj.fila.filter((f) => f.atrasados + f.pendente + f.produzido > 0).map((f) => (
              <button
                key={f.dia}
                type="button"
                onClick={() => escolherDia(f.dia)}
                aria-pressed={f.dia === proj.dia}
                data-testid={`op-fila-dia-${f.dia}`}
                className="pop-dia"
                style={{
                  flexShrink: 0, border: `1px solid ${f.dia === proj.dia ? T.text : T.border}`, borderRadius: R.sm,
                  backgroundColor: f.dia === proj.dia ? T.text : T.surface, color: f.dia === proj.dia ? T.surface : T.text,
                  padding: "4px 8px", fontSize: FS.small, fontWeight: FW.medio, cursor: "pointer", fontVariantNumeric: "tabular-nums",
                }}
              >
                {diaDaSemana(f.dia)} {dm(f.dia)}
              </button>
            ))}
          </div>
        )}
      </SecaoDaAnalise>

      <div className="pop-grade-2">
        <SecaoDaAnalise id="h-op-mat" testId="op-por-material" titulo="Por material" descricao={nota()}>
          <BarrasEmpilhadas testId="op-barras-material" legenda="Carga do dia por material" linhas={quebra(proj.porMaterial)} series={seriesDaQuebra} formato={fmt} vazio="Nada a produzir neste dia." />
        </SecaoDaAnalise>
        <SecaoDaAnalise id="h-op-acb" testId="op-por-acabamento" titulo="Por acabamento" descricao={nota()}>
          <BarrasEmpilhadas testId="op-barras-acabamento" legenda="Carga do dia por acabamento" linhas={quebra(proj.porAcabamento)} series={seriesDaQuebra} formato={fmt} vazio="Nada a produzir neste dia." />
        </SecaoDaAnalise>
      </div>

      <SecaoDaAnalise id="h-op-pev" testId="op-por-evento" titulo="Por evento" descricao={nota(proj.porEvento.length > 20 ? ` · 20 maiores de ${proj.porEvento.length}` : "")}>
        <BarrasEmpilhadas testId="op-barras-evento" legenda="Carga do dia por evento" linhas={quebra(porEvento)} series={seriesDaQuebra} formato={fmt} vazio="Nada a produzir neste dia." />
      </SecaoDaAnalise>

      <SecaoDaAnalise id="h-op-pecas-carga" testId="op-pecas-carga" titulo="Peças da carga do dia" descricao="Atrasadas em vermelho; as já produzidas aparecem com Sim no processo.">
        <TabelaCompacta<PecaDaLinha & { classe: ClasseDaProjecao }>
          testId="op-tabela-carga"
          larguraDaPrimeira={84}
          encolherAoTransbordar={false}
          legenda="Peças da carga do dia"
          linhas={proj.pecas}
          chave={(p) => p.id}
          limite={15}
          minLargura={900}
          ordemInicial={{ coluna: "prazo", direcao: "asc" }}
          vazio="Nenhuma peça na carga deste dia."
          colunas={[
            { id: "peca", rotulo: "Peça", ordenavel: true, valor: (p) => p.displayId, render: (p) => <CelulaDaPeca id={idDaPeca(p)} evento={painel.nomes[p.evento]} isMobile={isMobile} /> },
            { id: "evento", rotulo: "Evento", ordenavel: true, ocultarNoCelular: true, valor: (p) => painel.nomes[p.evento] ?? p.evento },
            { id: "material", rotulo: "Material", ordenavel: true, ocultarNoCelular: true, valor: (p) => p.material },
            { id: "acabamento", rotulo: "Acabamento", ordenavel: true, ocultarNoCelular: true, valor: (p) => p.acabamento },
            { id: "prazo", rotulo: "Prazo produção", ordenavel: true, valor: (p) => p.prazoProducao,
              render: (p) => <span style={{ color: p.prazoProducao < painel.hoje ? TOM.perigo.text : undefined, fontWeight: p.prazoProducao < painel.hoje ? FW.forte : undefined }}>{dma(p.prazoProducao)}</span> },
            { id: "qtd", rotulo: "Qtd", alinhar: "direita", ordenavel: true, valor: (p) => p.unidades },
            { id: "m2", rotulo: "m²", alinhar: "direita", ordenavel: true, valor: (p) => p.m2, render: (p) => fmt1(p.m2) },
            { id: "impresso", rotulo: "Impresso", ordenavel: true, ocultarNoCelular: true, valor: (p) => (p.impresso ? "Sim" : "Não"), render: (p) => <SimNao sim={p.impresso} tom="sucesso" /> },
            { id: "acabado", rotulo: "Acabado", ordenavel: true, ocultarNoCelular: true, valor: (p) => (p.acabado ? "Sim" : "Não"), render: (p) => <SimNao sim={p.acabado} tom="sucesso" /> },
            { id: "situacao", rotulo: "Situação", ordenavel: true, ocultarNoCelular: true, valor: (p) => (p.fase < 5 ? "Em pré-produção" : "Liberado"),
              render: (p) => (p.semAprovacao
                ? <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4 }}>{p.fase < 5 ? "Em pré-produção" : "Liberado"}<SelosDaLinha p={p} /></span>
                : (p.fase < 5 ? "Em pré-produção" : "Liberado")) },
          ]}
        />
      </SecaoDaAnalise>
    </>
  );
}

function CartaoDaCarga({ c, dia, medida, incluirAtrasados }: { c: CartaoDaProjecao; dia: string; medida: MedidaDaProjecao; incluirAtrasados: boolean }) {
  const principal = (x: { m2: number; unidades: number }) => (medida === "m2" ? `${fmt0(x.m2)} m²` : `${fmt0(x.unidades)} pç`);
  const secundario = (x: { m2: number; unidades: number }) => (medida === "m2" ? `${fmt0(x.unidades)} pç` : `${fmt0(x.m2)} m²`);
  const linha = (cor: string, rotulo: string, sinal: string, x: { m2: number; unidades: number }, apagada = false, testId?: string) => (
    <div data-testid={testId} style={{ display: "grid", gridTemplateColumns: "12px minmax(0,1fr) auto auto", alignItems: "center", columnGap: 10, padding: "5px 0", opacity: apagada ? 0.55 : 1, fontSize: FS.body }}>
      <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: cor }} />
      <span style={{ color: T.text, textDecoration: apagada ? "line-through" : undefined }}>{rotulo}</span>
      <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: FW.medio, color: T.text, textAlign: "right" }}>{sinal} {principal(x)}</span>
      <span style={{ fontVariantNumeric: "tabular-nums", color: T.second, textAlign: "right", minWidth: 56 }}>{secundario(x)}</span>
    </div>
  );
  return (
    <div data-testid={`op-carga-${c.processo}`} style={{ border: `1px solid ${T.border}`, borderRadius: R.lg, padding: "14px 16px", backgroundColor: T.surface, minWidth: 0 }}>
      <h3 style={{ margin: 0, fontSize: FS.small, fontWeight: FW.rotulo, letterSpacing: "0.08em", textTransform: "uppercase", color: T.second }}>
        {NOME_DO_PROCESSO[c.processo]} · {diaDaSemana(dia)} {dma(dia)}
      </h3>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, margin: "6px 0 10px" }}>
        <strong data-testid={`op-carga-${c.processo}-total`} style={{ fontFamily: FONT.display, fontSize: FS.h1, fontWeight: FW.forte, color: T.text, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}>
          {principal(c.carga)}
        </strong>
        <span style={{ fontSize: FS.body, color: T.second, fontVariantNumeric: "tabular-nums" }}>{secundario(c.carga)}</span>
      </div>
      {linha(COR.atrasado, incluirAtrasados ? "Atrasados" : "Atrasados (fora da conta)", "+", c.atrasados, !incluirAtrasados, `op-carga-${c.processo}-atrasados`)}
      {linha(COR.prazo, "Programados para o dia", "+", c.programados, false, `op-carga-${c.processo}-programados`)}
      {linha(COR.neutro, "Já produzidos para o dia", "−", c.produzidos, false, `op-carga-${c.processo}-produzidos`)}
      <div style={{ display: "grid", gridTemplateColumns: "12px minmax(0,1fr) auto auto", columnGap: 10, borderTop: `1px solid ${T.border}`, marginTop: 4, paddingTop: 7, fontSize: FS.body, fontWeight: FW.forte }}>
        <span />
        <span>Carga do dia</span>
        <span style={{ fontVariantNumeric: "tabular-nums", textAlign: "right" }}>= {principal(c.carga)}</span>
        <span style={{ fontVariantNumeric: "tabular-nums", color: T.second, textAlign: "right", minWidth: 56, fontWeight: FW.corpo }}>{secundario(c.carga)}</span>
      </div>
    </div>
  );
}
