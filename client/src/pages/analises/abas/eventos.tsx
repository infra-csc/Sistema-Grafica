// ─────────────────────────────────────────────────────────────────────────────
// ABA "EVENTOS E PRAZOS" — a operação lida pelo CALENDÁRIO: cada evento com
// as peças dele espalhadas pelo fluxo, o que ainda falta para os caminhões que
// saem logo e onde o atraso se concentra.
//
// A MATRIZ é evento × etapa: cada célula conta as peças daquele evento naquela
// etapa e tem um semáforo (vermelho = alguma passou do marco da etapa;
// âmbar = alguma parada há 14+ dias). Clicar na célula abre exatamente aquelas
// peças. Por padrão as etapas vêm agrupadas pelo trabalho (Arte antes e depois
// da aprovação continuam separadas — são dois momentos do evento); "Por etapa"
// abre todas as colunas.
//
// A fonte é `estado.porEvento` (lib/analises-estado) — as mesmas peças em
// andamento da Visão geral; evento encerrado ou já realizado fica de fora e é
// dito no rodapé.
// ─────────────────────────────────────────────────────────────────────────────
import * as React from "react";
import { Activity, AlertTriangle, CalendarClock, CalendarX, Truck } from "lucide-react";
import { Segmentado } from "@/components/ui/abas";
import { EstadoVazio } from "@/components/ui/estados";
import { T, TOM, N, FS, FW, R } from "@/lib/theme";
import type { EtapaDaPeca } from "@shared/fluxo-peca";
import {
  DIAS_PARADA, ETAPAS_DO_FLUXO, FASE_DA_ETAPA, FASES_DO_FLUXO, rotuloDaEtapa, type EventoNoEstado,
} from "@/lib/analises-estado";
import type { ContextoDaAnalise, PecaDaAnalise } from "../contexto";
import {
  AvisoDeCobertura, BotaoDeContagem, CartaoDeNumero, GradeDeNumeros, SecaoDaAnalise, TabelaCompacta,
  fmtDia, fmtDias, fmtInt, plural, type ColunaDaTabela,
} from "../componentes";

type Evento = EventoNoEstado<PecaDaAnalise>;

/** Uma coluna da matriz: um conjunto de etapas contíguas do fluxo. */
interface ColunaDaMatriz { id: string; rotulo: string; titulo: string; etapas: EtapaDaPeca[] }

const ETAPAS_VIVAS = ETAPAS_DO_FLUXO.filter((e) => e !== "delivered");

/**
 * As colunas "por trabalho": etapas contíguas da mesma fase viram uma. A Arte
 * aparece duas vezes (layout antes da aprovação, arquivo final depois) e as
 * duas ficam separadas — juntá-las esconderia em que ponto o evento está.
 */
const COLUNAS_POR_TRABALHO: ColunaDaMatriz[] = (() => {
  const blocos: ColunaDaMatriz[] = [];
  const vezes = new Map<string, number>();
  for (const e of ETAPAS_VIVAS) {
    const fase = FASE_DA_ETAPA[e] ?? "outra";
    const ultimo = blocos[blocos.length - 1];
    if (ultimo && ultimo.id.startsWith(`${fase}-`)) { ultimo.etapas.push(e); continue; }
    const n = (vezes.get(fase) ?? 0) + 1;
    vezes.set(fase, n);
    const rotuloDaFase = FASES_DO_FLUXO.find((f) => f.id === fase)?.rotulo ?? "Outra";
    blocos.push({ id: `${fase}-${n}`, rotulo: rotuloDaFase, titulo: rotuloDaFase, etapas: [e] });
  }
  for (const b of blocos) {
    if (b.id.startsWith("arte-")) {
      const depois = b.id === "arte-2";
      b.rotulo = depois ? "Arte · final" : "Arte · layout";
      b.titulo = depois ? "Arte — arquivo final (depois da aprovação)" : "Arte — layout (antes da aprovação)";
    }
    if (b.id.startsWith("solicitacao-")) b.rotulo = "Solicitação";
    if (b.id.startsWith("revisao-")) b.rotulo = "Revisão";
    b.titulo = `${b.titulo}: ${b.etapas.map(rotuloDaEtapa).join(", ")}`;
  }
  return blocos;
})();

const COLUNAS_POR_ETAPA: ColunaDaMatriz[] = ETAPAS_VIVAS.map((e) => ({ id: e, rotulo: rotuloDaEtapa(e), titulo: rotuloDaEtapa(e), etapas: [e] }));

/** Antes da Gráfica = tudo que ainda não foi liberado para imprimir. */
const ANTES_DA_GRAFICA = new Set<EtapaDaPeca>(ETAPAS_VIVAS.filter((e) => FASE_DA_ETAPA[e] !== "grafica"));
const JANELA_DE_SAIDAS = 14;

/** As peças do evento nas etapas que passam no teste (na ordem do fluxo). */
const pecasNasEtapas = (e: Evento, casa: (et: EtapaDaPeca) => boolean): PecaDaAnalise[] =>
  ETAPAS_VIVAS.filter(casa).flatMap((et) => e.porEtapa.get(et) ?? []);
const antesDaGrafica = (e: Evento) => pecasNasEtapas(e, (et) => ANTES_DA_GRAFICA.has(et));
const naGraficaSemEmbalar = (e: Evento) => pecasNasEtapas(e, (et) => !ANTES_DA_GRAFICA.has(et) && et !== "packed");
const SAIDA_PROXIMA = 7;

function textoDaSaida(e: Evento): string {
  if (e.saidaDiaMs == null || e.diasParaSaida == null) return "sem data de saída";
  const d = e.diasParaSaida;
  if (d === 0) return `${fmtDia(e.saidaDiaMs)} · sai hoje`;
  if (d > 0) return `${fmtDia(e.saidaDiaMs)} · em ${fmtDias(d)}`;
  return `${fmtDia(e.saidaDiaMs)} · saiu há ${fmtDias(-d)}`;
}

/** A saída em duas linhas (dia; quanto falta) — a matriz é larga e cada coluna conta. */
function SaidaCompacta({ e }: { e: Evento }) {
  if (e.saidaDiaMs == null || e.diasParaSaida == null) return <span style={{ color: T.second }}>sem data</span>;
  const d = e.diasParaSaida;
  const perto = d <= 3;
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", lineHeight: 1.3, whiteSpace: "nowrap" }}>
      <span style={{ fontWeight: FW.medio, color: T.text }}>{fmtDia(e.saidaDiaMs)}</span>
      <span style={{ fontSize: FS.small, fontWeight: perto ? FW.forte : FW.corpo, color: d < 0 ? TOM.perigo.text : perto ? TOM.alerta.text : T.second }}>
        {d === 0 ? "sai hoje" : d > 0 ? `em ${fmtDias(d)}` : `saiu há ${fmtDias(-d)}`}
      </span>
    </span>
  );
}

/** O nome do evento; no celular, com a saída embaixo (a coluna Saída some lá). */
function NomeDoEvento({ e, comSaida }: { e: Evento; comSaida: boolean }) {
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", minWidth: 100, maxWidth: 220, overflowWrap: "anywhere", lineHeight: 1.3 }}>
      <span>{e.nome}</span>
      {comSaida && <span style={{ fontSize: FS.small, fontWeight: FW.corpo, color: (e.diasParaSaida ?? 99) < 0 ? TOM.perigo.text : (e.diasParaSaida ?? 99) <= 3 ? TOM.alerta.text : T.second }}>{textoDaSaida(e)}</span>}
    </span>
  );
}

interface Celula { pecas: PecaDaAnalise[]; atrasadas: PecaDaAnalise[]; paradas: PecaDaAnalise[] }

export default function AbaEventos({ ctx }: { ctx: ContextoDaAnalise }) {
  const { estado, leitura } = ctx;
  const [grao, setGrao] = React.useState<"trabalho" | "etapa">("trabalho");
  const colunasDaMatriz = grao === "trabalho" ? COLUNAS_POR_TRABALHO : COLUNAS_POR_ETAPA;

  const dados = React.useMemo(() => {
    const eventos = estado.porEvento;
    const celulas = new Map<string, Map<string, Celula>>();
    for (const ev of eventos) {
      const m = new Map<string, Celula>();
      for (const col of [...COLUNAS_POR_TRABALHO, ...COLUNAS_POR_ETAPA]) {
        if (m.has(col.id)) continue;
        const pecas = col.etapas.flatMap((et) => ev.porEtapa.get(et) ?? []);
        const ls = pecas.map(leitura);
        m.set(col.id, { pecas, atrasadas: ls.filter((l) => l.atrasada).map((l) => l.peca), paradas: ls.filter((l) => l.faixaDeIdade === "14+").map((l) => l.peca) });
      }
      celulas.set(ev.eventoId, m);
    }
    const saindo = eventos
      .filter((e) => e.diasParaSaida != null && e.diasParaSaida >= 0 && e.diasParaSaida <= JANELA_DE_SAIDAS)
      .sort((a, b) => (a.saidaDiaMs ?? 0) - (b.saidaDiaMs ?? 0) || b.atrasadas.length - a.atrasadas.length);
    const proximos = eventos.filter((e) => e.diasParaSaida != null && e.diasParaSaida >= 0 && e.diasParaSaida <= SAIDA_PROXIMA);
    const jaSairam = eventos.filter((e) => e.diasParaSaida != null && e.diasParaSaida < 0);
    const semSaida = eventos.filter((e) => e.saidaDiaMs == null);
    const comAtraso = eventos.filter((e) => e.atrasadas.length > 0);
    return {
      eventos, celulas, saindo, proximos, jaSairam, semSaida, comAtraso,
      pecasProximas: proximos.flatMap((e) => e.pecas),
      pecasJaSairam: jaSairam.flatMap((e) => e.pecas),
      pecasSemSaida: semSaida.flatMap((e) => e.pecas),
    };
  }, [estado.porEvento, leitura]);

  const celula = (ev: Evento, col: string): Celula => dados.celulas.get(ev.eventoId)?.get(col) ?? { pecas: [], atrasadas: [], paradas: [] };

  if (dados.eventos.length === 0) {
    return (
      <div data-testid="aba-eventos" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <EstadoVazio
          testId="eventos-vazio" icone={CalendarClock}
          titulo="Nenhum evento com peça em andamento"
          descricao={ctx.pecas.length !== ctx.todasAsPecas.length ? "Os filtros do topo esvaziaram a lista." : "Todas as peças deste recorte estão entregues ou fora do fluxo."}
        />
        <Rodape ctx={ctx} />
      </div>
    );
  }

  const colunasMatriz: ColunaDaTabela<Evento>[] = colunasDaMatriz.map((col) => ({
    id: `m-${col.id}`,
    rotulo: col.rotulo,
    titulo: col.titulo,
    alinhar: "direita",
    ordenavel: true,
    ocultarNoCelular: true,
    valor: (ev) => celula(ev, col.id).pecas.length,
    render: (ev) => <CelulaDaMatriz ctx={ctx} ev={ev} col={col} c={celula(ev, col.id)} />,
  }));

  return (
    <div data-testid="aba-eventos" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <section aria-labelledby="h-ev-resumo">
        <h2 id="h-ev-resumo" className="sr-only">Resumo dos eventos</h2>
        <GradeDeNumeros minimo={ctx.isMobile ? 150 : 200} rotulo="Resumo dos eventos">
          <CartaoDeNumero ctx={ctx} testId="ev-em-andamento" rotulo="Em andamento" icone={Activity} pecas={estado.ativas.pecas}
            titulo="Peças em andamento" sub={`Em ${fmtInt(dados.eventos.length)} ${plural(dados.eventos.length, "evento", "eventos")}`} />
          <CartaoDeNumero ctx={ctx} testId="ev-atrasadas" rotulo="Atrasadas" icone={AlertTriangle} tom="perigo" pecas={estado.ativas.atrasadas}
            titulo="Atrasadas na etapa" sub={`Em ${fmtInt(dados.comAtraso.length)} ${plural(dados.comAtraso.length, "evento", "eventos")}`} />
          <CartaoDeNumero ctx={ctx} testId="ev-saem-logo" rotulo={`Saem em ${SAIDA_PROXIMA} dias`} icone={Truck} tom="alerta" pecas={dados.pecasProximas}
            titulo={`Ainda pendentes em eventos que saem em até ${SAIDA_PROXIMA} dias`}
            sub={`${fmtInt(dados.proximos.length)} ${plural(dados.proximos.length, "evento", "eventos")} com caminhão perto`} />
          <CartaoDeNumero ctx={ctx} testId="ev-ja-sairam" rotulo="Caminhão já saiu" icone={Truck} tom="perigo" pecas={dados.pecasJaSairam}
            titulo="Pendentes em eventos cujo caminhão já saiu" subtitulo="O evento ainda não aconteceu, mas a saída já passou"
            sub={`${fmtInt(dados.jaSairam.length)} ${plural(dados.jaSairam.length, "evento", "eventos")}`} />
          <CartaoDeNumero ctx={ctx} testId="ev-sem-saida" rotulo="Sem saída" icone={CalendarX} tom="alerta" pecas={dados.pecasSemSaida}
            titulo="Em eventos sem data de saída válida" subtitulo="Sem saída não há prazo para medir atraso"
            sub={`${fmtInt(dados.semSaida.length)} ${plural(dados.semSaida.length, "evento sem data de saída", "eventos sem data de saída")}`} />
        </GradeDeNumeros>
      </section>

      <SecaoDaAnalise
        id="h-ev-saidas"
        testId="ev-saidas"
        titulo={`Próximas saídas de caminhão (${JANELA_DE_SAIDAS} dias)`}
        descricao="O que ainda falta em cada evento que sai logo, pela ordem da saída. Cada número abre as peças."
      >
        <TabelaCompacta<Evento>
          testId="tabela-ev-saidas"
          legenda={`Eventos com saída nos próximos ${JANELA_DE_SAIDAS} dias e o que ainda falta`}
          linhas={dados.saindo}
          chave={(e) => e.eventoId}
          limite={8}
          minLargura={760}
          vazio={`Nenhum evento com peça pendente sai nos próximos ${JANELA_DE_SAIDAS} dias.`}
          colunas={[
            { id: "nome", rotulo: "Evento", valor: (e) => e.nome, render: (e) => <NomeDoEvento e={e} comSaida={ctx.isMobile} /> },
            { id: "saida", rotulo: "Saída", ocultarNoCelular: true, valor: (e) => e.saidaDiaMs,
              render: (e) => <span style={{ whiteSpace: "nowrap", fontWeight: (e.diasParaSaida ?? 99) <= 3 ? FW.forte : FW.corpo, color: (e.diasParaSaida ?? 99) <= 3 ? TOM.alerta.text : T.second }}>{textoDaSaida(e)}</span> },
            { id: "falta", rotulo: "Falta", titulo: "Peças ainda não entregues", alinhar: "direita", valor: (e) => e.pecas.length,
              render: (e) => <BotaoDeContagem ctx={ctx} pecas={e.pecas} forte titulo={`${e.nome} — ainda não entregues`} testId={`ev-falta-${e.eventoId}`} /> },
            { id: "antes", rotulo: "Antes da Gráfica", titulo: "Ainda não liberadas para imprimir", alinhar: "direita", ocultarNoCelular: true,
              valor: (e) => antesDaGrafica(e).length,
              render: (e) => <BotaoDeContagem ctx={ctx} pecas={antesDaGrafica(e)} tom="alerta" titulo={`${e.nome} — ainda antes da Gráfica`} /> },
            { id: "grafica", rotulo: "Na Gráfica", titulo: "Liberadas até conferidas", alinhar: "direita", ocultarNoCelular: true,
              valor: (e) => naGraficaSemEmbalar(e).length,
              render: (e) => <BotaoDeContagem ctx={ctx} pecas={naGraficaSemEmbalar(e)} titulo={`${e.nome} — na Gráfica`} /> },
            { id: "embaladas", rotulo: "Embaladas", titulo: "Em volume, esperando a entrega", alinhar: "direita", ocultarNoCelular: true, valor: (e) => e.porEtapa.get("packed")?.length ?? 0,
              render: (e) => <BotaoDeContagem ctx={ctx} pecas={e.porEtapa.get("packed") ?? []} tom="sucesso" titulo={`${e.nome} — embaladas`} /> },
            { id: "atrasadas", rotulo: "Atrasadas", alinhar: "direita", valor: (e) => e.atrasadas.length,
              render: (e) => <BotaoDeContagem ctx={ctx} pecas={e.atrasadas} tom="perigo" forte titulo={`${e.nome} — atrasadas na etapa`} /> },
          ]}
        />
      </SecaoDaAnalise>

      <SecaoDaAnalise
        id="h-ev-matriz"
        testId="ev-matriz"
        titulo="Cada evento, etapa por etapa"
        descricao={ctx.isMobile
          // No celular as colunas de etapa não cabem (e rolar de lado esconde
          // justamente o atraso): fica o total e as atrasadas de cada evento, e
          // o seletor de colunas some — ele não teria o que trocar.
          ? "O total e as atrasadas de cada evento. A divisão por etapa aparece na tela maior, e cada número abre as peças."
          : <>Quantas peças de cada evento estão em cada etapa. <Semaforo tom="perigo" /> alguma passou do prazo da etapa · <Semaforo tom="alerta" /> alguma parada há {DIAS_PARADA}+ dias. Ordene pela coluna; a célula abre as peças.</>}
        acoes={ctx.isMobile ? undefined : (
          <Segmentado
            rotuloDaLista="Colunas da matriz"
            prefixoDeTestId="ev-grao"
            tamanho={ctx.isMobile ? "toque" : "sm"}
            ativo={grao}
            aoTrocar={(v) => setGrao(v as "trabalho" | "etapa")}
            itens={[{ id: "trabalho", rotulo: "Por trabalho" }, { id: "etapa", rotulo: "Por etapa" }]}
          />
        )}
      >
        <TabelaCompacta<Evento>
          key={grao}
          testId="tabela-ev-matriz"
          legenda="Peças em andamento por evento e por etapa"
          linhas={dados.eventos}
          chave={(e) => e.eventoId}
          limite={15}
          minLargura={grao === "trabalho" ? 900 : 1680}
          ordemInicial={{ coluna: "atrasadas", direcao: "desc" }}
          colunas={[
            { id: "nome", rotulo: "Evento", ordenavel: true, valor: (e) => e.nome,
              render: (e) => <NomeDoEvento e={e} comSaida={ctx.isMobile} /> },
            { id: "saida", rotulo: "Saída", ordenavel: true, ocultarNoCelular: true, valor: (e) => e.saidaDiaMs,
              render: (e) => <SaidaCompacta e={e} /> },
            { id: "pecas", rotulo: "Peças", ordenavel: true, alinhar: "direita", valor: (e) => e.pecas.length,
              render: (e) => <BotaoDeContagem ctx={ctx} pecas={e.pecas} forte titulo={`${e.nome} — em andamento`} /> },
            { id: "atrasadas", rotulo: "Atrasadas", ordenavel: true, alinhar: "direita", valor: (e) => e.atrasadas.length,
              render: (e) => <BotaoDeContagem ctx={ctx} pecas={e.atrasadas} tom="perigo" forte titulo={`${e.nome} — atrasadas na etapa`} testId={`ev-atrasadas-${e.eventoId}`} /> },
            { id: "pior", rotulo: "Pior", titulo: "O pior atraso do evento (dias depois do prazo da etapa)", ordenavel: true, ocultarNoCelular: true, alinhar: "direita", valor: (e) => e.piorAtraso?.diasDeAtraso ?? null,
              render: (e) => e.piorAtraso ? <span style={{ whiteSpace: "nowrap" }}>{fmtDias(e.piorAtraso.diasDeAtraso)}</span> : "—" },
            ...colunasMatriz,
          ]}
        />
      </SecaoDaAnalise>

      <Rodape ctx={ctx} />
    </div>
  );
}

function Semaforo({ tom }: { tom: "perigo" | "alerta" | "neutro" }) {
  return (
    <span aria-hidden="true" style={{
      display: "inline-block", width: 8, height: 8, borderRadius: R.pill, verticalAlign: "1px",
      backgroundColor: tom === "neutro" ? N.n5 : TOM[tom].dot,
    }} />
  );
}

/** A célula da matriz: o número (abre as peças), o semáforo e, se houver, as atrasadas. */
function CelulaDaMatriz({ ctx, ev, col, c }: { ctx: ContextoDaAnalise; ev: Evento; col: ColunaDaMatriz; c: Celula }) {
  if (c.pecas.length === 0) return <span style={{ color: T.second }}>—</span>;
  const tom = c.atrasadas.length > 0 ? "perigo" : c.paradas.length > 0 ? "alerta" : "neutro";
  const estado = tom === "perigo" ? `, ${fmtInt(c.atrasadas.length)} ${plural(c.atrasadas.length, "atrasada", "atrasadas")}`
    : tom === "alerta" ? `, ${fmtInt(c.paradas.length)} ${plural(c.paradas.length, "parada", "paradas")} 14+ dias` : "";
  return (
    <span data-testid={`ev-celula-${ev.eventoId}-${col.id}`} data-semaforo={tom} style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <Semaforo tom={tom} />
        <BotaoDeContagem
          ctx={ctx} pecas={c.pecas} forte={tom !== "neutro"} tom={tom === "neutro" ? "neutro" : tom}
          titulo={`${ev.nome} — ${col.rotulo}`} subtitulo={col.titulo}
          rotulo={`${ev.nome}, ${col.rotulo}${estado}`}
        />
      </span>
      {c.atrasadas.length > 0 && c.atrasadas.length < c.pecas.length && (
        <BotaoDeContagem ctx={ctx} pecas={c.atrasadas} tom="perigo" sufixo=" atras." titulo={`${ev.nome} — ${col.rotulo} — atrasadas`} rotulo={`${ev.nome}, ${col.rotulo}: atrasadas`} />
      )}
    </span>
  );
}

function Rodape({ ctx }: { ctx: ContextoDaAnalise }) {
  const { estado } = ctx;
  return (
    <AvisoDeCobertura
      testId="ev-cobertura"
      itens={[
        "Contam só as peças em andamento. \"Atrasada\" é a que passou do prazo da ETAPA em que está (os marcos do evento, os mesmos da Gestão de Prazos), não da saída do caminhão.",
        estado.deEventoFinalizado.length > 0 && <>
          <BotaoDeContagem ctx={ctx} pecas={estado.deEventoFinalizado} titulo="Pendentes de eventos encerrados ou já realizados" testId="ev-finalizados" />{" "}
          {plural(estado.deEventoFinalizado.length, "ficou pendente", "ficaram pendentes")} em eventos encerrados ou já realizados — fora desta lista.
        </>,
      ]}
    />
  );
}
