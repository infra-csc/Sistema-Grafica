// ─────────────────────────────────────────────────────────────────────────────
// ANÁLISES — o Painel operacional da gráfica (dono, 16/10: "subir isso no
// Análises, no nosso layout, exatamente esses dados"; e "pode tirar o que já
// tem no Análises hoje" — a Análises de status, com dez abas, saiu).
//
// Cinco abas: Painel geral · Produção (Realizado por dia | Projeção de
// produção do dia) · Pré-produção · Problemas operacionais · Status por
// evento. Cada aba tem os filtros do painel de referência (evento, medida,
// dia, processo, incluir atrasados, chips).
//
// UMA busca: GET /api/analises/painel-operacional (só admin, memo de 60s no
// servidor). Os números vêm calculados AO VIVO de lá; os recortes da tela são
// as funções de derivação de @shared/painel-operacional — a MESMA regra que o
// teste prende. Nada é calculado aqui.
//
// URL: ?aba=<aba>&sub=<realizado|projecao>&ev=<evento> (o evento aberto em
// "Status por evento") — o recorte sobrevive ao F5 e a um link colado.
//
// Acesso: só admin (App.tsx e app-sidebar.tsx) — é a tela do gestor.
// ─────────────────────────────────────────────────────────────────────────────
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, RotateCcw } from "lucide-react";
import type { PainelOperacional } from "@shared/painel-operacional";
import { CabecalhoDaPagina } from "@/components/ui/cabecalho-da-pagina";
import { Abas } from "@/components/ui/abas";
import { EstadoErro, Esqueleto } from "@/components/ui/estados";
import { useIsMobile } from "@/hooks/use-mobile";
import { T, TOM, FS, FW, R } from "@/lib/theme";
import { fmt0 } from "./comum";
import { ABAS_DO_PAINEL, type ContextoDoPainel, type IdDoPainel, type SubDaProducao } from "./contexto";
import AbaGeral from "./abas/geral";
import AbaProducao from "./abas/producao";
import AbaPre from "./abas/pre";
import AbaProblemas from "./abas/problemas";
import AbaEvento from "./abas/evento";

const URL_CHAVES = { aba: "aba", sub: "sub", ev: "ev" } as const;

function lerDaUrl(): { aba: IdDoPainel; sub: SubDaProducao; ev: string | null } {
  const p = new URLSearchParams(window.location.search);
  const aba = p.get(URL_CHAVES.aba);
  return {
    aba: ABAS_DO_PAINEL.some((a) => a.id === aba) ? (aba as IdDoPainel) : "geral",
    sub: p.get(URL_CHAVES.sub) === "projecao" ? "projecao" : "realizado",
    ev: p.get(URL_CHAVES.ev) || null,
  };
}

const FRESCOR = { staleTime: 60_000, refetchOnMount: true, refetchOnWindowFocus: true, refetchInterval: 300_000 } as const;
const CHAVE_DA_BUSCA = "/api/analises/painel-operacional";

const fmtGerado = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

export default function Analises() {
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const inicial = React.useMemo(lerDaUrl, []);
  const [aba, setAba] = React.useState<IdDoPainel>(inicial.aba);
  const [sub, setSub] = React.useState<SubDaProducao>(inicial.sub);
  const [ev, setEv] = React.useState<string | null>(inicial.ev);
  const raizRef = React.useRef<HTMLDivElement>(null);

  const q = useQuery<PainelOperacional>({ queryKey: [CHAVE_DA_BUSCA], ...FRESCOR, retry: 1 });

  // URL (com folga de 150ms: trocar de aba depressa não enche o histórico).
  React.useEffect(() => {
    const t = setTimeout(() => {
      const p = new URLSearchParams(window.location.search);
      if (aba === "geral") p.delete(URL_CHAVES.aba); else p.set(URL_CHAVES.aba, aba);
      if (sub === "realizado") p.delete(URL_CHAVES.sub); else p.set(URL_CHAVES.sub, sub);
      if (!ev) p.delete(URL_CHAVES.ev); else p.set(URL_CHAVES.ev, ev);
      const qs = p.toString();
      window.history.replaceState(window.history.state, "", qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
    }, 150);
    return () => clearTimeout(t);
  }, [aba, sub, ev]);

  React.useEffect(() => {
    const onPop = () => { const f = lerDaUrl(); setAba(f.aba); setSub(f.sub); setEv(f.ev); };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const irPara = React.useCallback((id: IdDoPainel) => {
    setAba(id);
    raizRef.current?.scrollTo?.({ top: 0 });
  }, []);
  const abrirEvento = React.useCallback((chave: string) => { setEv(chave); irPara("evento"); }, [irPara]);

  const painel = q.data ?? null;
  const ctx: ContextoDoPainel | null = React.useMemo(() => painel && ({
    painel, isMobile, abrirEvento, eventoAberto: ev, sub, trocarSub: setSub,
  }), [painel, isMobile, abrirEvento, ev, sub]);

  const PADDING = isMobile ? "14px 14px 40px" : "24px 28px 56px";
  const frase = painel ? (
    <span data-testid="painel-op-frase">
      {painel.kpis.atrasados === 0 ? "Nenhum evento está atrasado." : (
        <>
          <strong style={{ color: TOM.perigo.text }}>{fmt0(painel.kpis.atrasados)}</strong> {painel.kpis.atrasados === 1 ? "evento está atrasado" : "eventos estão atrasados"}, com{" "}
          <strong style={{ color: painel.kpis.pecasAtrasadas > 0 ? TOM.perigo.text : T.text }}>{fmt0(painel.kpis.pecasAtrasadas)}</strong> {painel.kpis.pecasAtrasadas === 1 ? "peça" : "peças"} fora do prazo da fase.
        </>
      )}
      {" "}Nos últimos 7 dias a gráfica imprimiu <strong style={{ color: T.text }}>{fmt0(painel.resumo.m2Impresso7d)} m²</strong> e ainda faltam{" "}
      <strong style={{ color: T.text }}>{fmt0(painel.resumo.m2AImprimir)} m²</strong> para os eventos ativos.
    </span>
  ) : q.isLoading ? "Carregando o painel…" : null;

  const itens = ABAS_DO_PAINEL.map((a) => ({
    id: a.id,
    rotulo: a.rotulo,
    idDoElemento: `aba-painel-op-${a.id}`,
    ariaControls: "painel-op-conteudo",
    ...(painel && a.id === "problemas" && painel.resumo.atrasadasAbertas > 0
      ? { contador: painel.resumo.atrasadasAbertas, tom: "perigo" as const, title: `${a.rotulo} — ${fmt0(painel.resumo.atrasadasAbertas)} peças atrasadas` }
      : {}),
  }));

  let conteudo: React.ReactNode;
  if (q.isError && !painel) {
    conteudo = (
      <EstadoErro
        titulo="Não foi possível carregar o painel operacional"
        detalhe={q.isFetching ? "Tentando de novo…" : "Os números do painel vêm calculados do servidor; sem eles nada é exibido pela metade."}
        carregando={q.isFetching}
        aoTentarDeNovo={() => queryClient.invalidateQueries({ queryKey: [CHAVE_DA_BUSCA] })}
        testIdDoBotao="painel-op-tentar-de-novo"
      />
    );
  } else if (!ctx) {
    conteudo = <Esqueleto variante="cartoes" linhas={6} rotulo="Carregando o painel operacional" />;
  } else {
    conteudo = (
      <>
        {aba === "geral" && <AbaGeral ctx={ctx} />}
        {aba === "producao" && <AbaProducao ctx={ctx} />}
        {aba === "pre" && <AbaPre ctx={ctx} />}
        {aba === "problemas" && <AbaProblemas ctx={ctx} />}
        {aba === "evento" && <AbaEvento ctx={ctx} trocarEvento={setEv} />}
      </>
    );
  }

  return (
    <div ref={raizRef} data-testid="pagina-analises" style={{ backgroundColor: T.bg, height: "100%", overflowY: "auto", padding: PADDING }}>
      <CabecalhoDaPagina
        titulo="Análises"
        testId="title-analises"
        subtitulo={frase}
        frescor={painel ? (
          <span data-testid="painel-op-frescor" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: FS.small, color: T.second }}>
            {q.isFetching && <RotateCcw aria-hidden="true" className="animate-spin" style={{ width: 11, height: 11 }} />}
            Atualizado em {fmtGerado(painel.geradoEm)}
          </span>
        ) : undefined}
        margemInferior={16}
      />

      <TrilhoComDegrade>
        <Abas
          itens={itens}
          ativo={aba}
          aoTrocar={(id) => irPara(id as IdDoPainel)}
          rotuloDaLista="Seções do painel operacional"
          prefixoDeTestId="aba-painel-op"
          testId="abas-painel-op"
          rolarAteAtiva
        />
      </TrilhoComDegrade>

      <div role="tabpanel" id="painel-op-conteudo" aria-labelledby={`aba-painel-op-${aba}`} data-testid={`painel-op-${aba}`} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {conteudo}
      </div>

      <ComoCalculamos />
    </div>
  );
}

/**
 * A PISTA DE QUE HÁ MAIS ABAS. No celular o trilho rola de lado, e sem pista a
 * última aba visível parece a última que existe: um degradê na cor do fundo
 * aparece na borda que ainda tem aba escondida e some quando se chega nela.
 */
function TrilhoComDegrade({ children }: { children: React.ReactNode }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [bordas, setBordas] = React.useState({ esq: false, dir: false });
  React.useEffect(() => {
    const trilho = ref.current?.querySelector<HTMLElement>("[role=tablist]");
    if (!trilho) return;
    const medir = () => {
      const max = trilho.scrollWidth - trilho.clientWidth;
      const esq = trilho.scrollLeft > 2;
      const dir = max > 2 && trilho.scrollLeft < max - 2;
      setBordas((b) => (b.esq === esq && b.dir === dir ? b : { esq, dir }));
    };
    medir();
    trilho.addEventListener("scroll", medir, { passive: true });
    window.addEventListener("resize", medir);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(medir) : null;
    ro?.observe(trilho);
    return () => { trilho.removeEventListener("scroll", medir); window.removeEventListener("resize", medir); ro?.disconnect(); };
  }, []);
  const veu = (lado: "left" | "right"): React.CSSProperties => ({
    position: "absolute", top: 0, bottom: 1, [lado]: 0, width: 36, pointerEvents: "none",
    background: `linear-gradient(to ${lado === "left" ? "right" : "left"}, ${T.bg}, transparent)`,
  });
  return (
    <div ref={ref} style={{ position: "relative", marginBottom: 20 }}>
      {children}
      {bordas.esq && <span aria-hidden="true" data-testid="abas-degrade-esq" style={veu("left")} />}
      {bordas.dir && <span aria-hidden="true" data-testid="abas-degrade-dir" style={veu("right")} />}
    </div>
  );
}

// ─── Rodapé ──────────────────────────────────────────────────────────────────

function ComoCalculamos() {
  const [aberto, setAberto] = React.useState(false);
  const p = (t: React.ReactNode) => <p style={{ margin: "0 0 8px", fontSize: FS.small, lineHeight: 1.6, color: T.second, maxWidth: 900 }}>{t}</p>;
  return (
    <section data-testid="painel-op-metodo" style={{ marginTop: 28, borderTop: `1px solid ${T.border}`, paddingTop: 14 }}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        aria-controls="painel-op-metodo-texto"
        data-testid="painel-op-metodo-abrir"
        style={{ display: "inline-flex", alignItems: "center", gap: 6, border: "none", background: "none", padding: "6px 0", cursor: "pointer", fontSize: FS.body, fontWeight: FW.forte, color: T.text, borderRadius: R.sm }}
      >
        <ChevronDown aria-hidden="true" style={{ width: 14, height: 14, transform: aberto ? "rotate(180deg)" : "none" }} />
        Como os números são calculados
      </button>
      {aberto && (
        <div id="painel-op-metodo-texto" style={{ marginTop: 8 }}>
          {p("Fonte: as peças e a Gestão de Prazos do próprio app, calculadas no servidor a cada abertura (e de 5 em 5 minutos com a tela aberta). Eventos ativos e o prazo de cada fase são os da Gestão de Prazos: entrega de layout, aprovação, finalização, revisão final e produção gráfica, contados pela saída do caminhão. Evento atrasado, peças fora do prazo e saídas em 7 dias são os mesmos números da tela de Prazos.")}
          {p("Realizado usa a data registrada em cada peça: cadastro, envio de layout (histórico parcial — o app só guarda essa data para parte das peças: a troca do layout ou a entrada em “aguardando aprovação”), aprovação do patrocinador, arquivo final, revisão final, fim da impressão (a peça saiu toda da impressora) e conferência (acabamento). Janela de 60 dias, no fuso de Brasília.")}
          {p("Planejado: o saldo de cada peça é distribuído igualmente pelos dias úteis (segunda a sábado) entre hoje — ou o dia seguinte ao prazo da revisão final, se a peça ainda está em pré-produção — e o prazo da produção gráfica. Se o prazo já venceu, todo o saldo vai para hoje como atrasado. Unidades = quantidade − reaproveitadas; m² = área do arquivo (ou a visual, sem arquivo) × unidades a imprimir — o reaproveitamento não entra.")}
          {p("Projeção do dia: carga = atrasados + programados para o dia − já produzidos para o dia. Programado = peças cujo prazo de produção gráfica cai no dia; atrasados = prazo anterior a hoje e o processo ainda não feito (datas futuras nunca entram como atrasadas). Impresso = Impresso/acabamento, Conferido, Embalado ou Entregue; acabado = Conferido, Embalado ou Entregue.")}
          {p("Pré-produção: a peça ainda passa por cada processo da fase em que está até a revisão final (a da Lista de imagens passa por todos; a isenta de aprovação pula a aprovação). O processo está atrasado quando o prazo dele, no evento da peça, é anterior a hoje.")}
          {p("Problemas: fura-fila = peça marcada como prioridade; refação/reprodução = complemento de peça (o motivo é o do pedido de complemento); reprovada = layout reprovado pelo patrocinador ou pela Solicitação; atrasada = prazo da fase atual anterior a hoje. Contam só as peças em aberto dos eventos ativos. Peças em rascunho, solicitadas ou aguardando vinculação contam em aberto, na fase Lista de imagens. BOOK COMPLETO e peças canceladas ficam de fora.")}
        </div>
      )}
    </section>
  );
}
