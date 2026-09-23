// ─────────────────────────────────────────────────────────────────────────────
// LISTA DE SOLICITAÇÕES — a mesma lista para quem pede e para quem resolve.
//
// Cada solicitação tem várias peças, e as AÇÕES são por peça, seguindo o papel
// de quem está vendo (a mesma régua do servidor):
//   · quem pede (Atendimento, admin): nova solicitação; cancelar a solicitação
//     inteira enquanto nada foi feito, ou a peça ainda aberta; pedir ajuste na
//     peça atendida; reabrir a peça cancelada. O Atendimento só recebe as SUAS
//     (o servidor filtra) e não edita — errou, cancela e cria outra;
//   · quem resolve (Solicitação, admin): criar peça direto da peça solicitada,
//     recusar, aceitar/recusar ajuste, reabrir a recusada.
// Clicar na solicitação abre o detalhe, com histórico.
// ─────────────────────────────────────────────────────────────────────────────
import { memo, useDeferredValue, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, Inbox, Plus, Search, X } from "lucide-react";
import {
  IDADE_DE_ATENCAO,
  ajustePendente,
  idadeDoPedido,
  patrocinadoresDaLinha,
  podePedirAjuste,
  prazoMaisProximo,
  seloDoEventoDoPedido,
  temPecaAberta,
  textoDaObservacao,
  type LinhaDoPedido,
  type PedidoDePeca,
  type SeloDoEvento,
} from "@shared/pedidos-de-peca";
import { FilterSelect } from "@/components/filter-select";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { motivoEventoFinalizado, todayBusinessMs } from "@/lib/status";
import { T, FS, R, N, TOM, FW, SHADOW } from "@/lib/theme";
import { Botao } from "@/components/ui/botao";
import { EstadoErro, EstadoVazio } from "@/components/ui/estados";
import { MotivoDoPedidoDialog, descricaoDoAviso, enviarAcaoComMotivo, tituloDoAviso, type AlvoDaAcao } from "@/components/motivo-do-pedido-dialog";
import { CartaoDoPedido, type AcaoDoCartao } from "@/components/pedidos/cartao-do-pedido";
import { DetalheDoPedido } from "@/components/pedidos/detalhe-do-pedido";
import { FormularioDoPedido } from "@/components/pedidos/formulario-do-pedido";
import { ListaCarregando, invalidarPedidos, mensagemDaApi, type EventoDoPedido } from "@/components/pedidos/ui";

type Ordem = "recentes" | "antigos" | "prazo";
type Filtro = "aberto" | "atendido" | "recusado" | "cancelado" | "ajuste" | "todos";

const PASSO = 300;
const FILTROS_VALIDOS: readonly Filtro[] = ["aberto", "atendido", "recusado", "cancelado", "ajuste", "todos"];
const ORDENS: Array<{ value: Ordem; label: string }> = [
  { value: "prazo", label: "Prazo mais próximo" },
  { value: "recentes", label: "Mais recentes" },
  { value: "antigos", label: "Mais antigas" },
];

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// ── O RECORTE NA URL ─────────────────────────────────────────────────────────
// Era a lista do app que esquecia tudo: F5, abrir o evento pelo "Criar peça" e
// voltar, ou mandar o link a um colega devolviam sempre "Abertas", sem busca e
// sem evento. Nomes iguais aos das outras telas (`busca`, `evento`) — o mesmo
// recorte não pode ter um nome em cada lugar. Só o que foge do padrão entra.
function recorteDaURL(search: string, ordemPadrao: Ordem) {
  const p = new URLSearchParams(search);
  const estado = p.get("estado") as Filtro | null;
  const ordem = p.get("ordem") as Ordem | null;
  return {
    filtro: estado && FILTROS_VALIDOS.includes(estado) ? estado : ("aberto" as Filtro),
    ordem: ordem && ORDENS.some((o) => o.value === ordem) ? ordem : ordemPadrao,
    busca: p.get("busca") ?? "",
    evento: p.get("evento") ?? "",
  };
}

// O texto pesquisável de cada solicitação, normalizado UMA vez por objeto
// (PERF-6). Montar e normalizar a string a cada tecla, para 300 solicitações,
// era refeito sempre do zero; o refetch traz objetos novos e o WeakMap
// esquece os velhos sozinho.
const textoDeBusca = new WeakMap<PedidoDePeca, string>();
const combina = (p: PedidoDePeca, termo: string) => {
  if (!termo) return true;
  let alvo = textoDeBusca.get(p);
  if (alvo === undefined) {
    alvo = semAcento([
      p.pedidoPor,
      ...p.linhas.flatMap((l) => [l.eventName, patrocinadoresDaLinha(l), textoDaObservacao(l.observacao), l.tipoDePeca, ...(l.pecas ?? []).map((x) => x.displayId)]),
    ].filter(Boolean).join(" "));
    textoDeBusca.set(p, alvo);
  }
  return alvo.includes(termo);
};

/**
 * CARTÃO MEMOIZADO (PERF-6, 17/09). Medido com 300 solicitações: cada tecla na
 * busca re-renderizava os 300 cartões (com os links e selos de cada peça),
 * ~900ms por tecla. O cartão só desenha de novo quando muda o que ele lê:
 * `deps` traz a solicitação, os dados dos selos (eventos, dia, minuto), as
 * travas da mutação e as permissões. Os handlers do cartão memoizado são do
 * último render dele — seguro porque só chamam setters e `mutate` com a
 * própria solicitação/peça.
 */
const CartaoMemoizado = memo(
  function CartaoMemoizado({ desenhar }: { deps: unknown[]; desenhar: () => React.ReactNode }) {
    return <>{desenhar()}</>;
  },
  (antes, depois) => antes.deps.length === depois.deps.length
    && antes.deps.every((v, i) => Object.is(v, depois.deps[i])),
);

const passaNoFiltro = (p: PedidoDePeca, f: Filtro) =>
  f === "todos" ? true
  : f === "aberto" ? temPecaAberta(p)
  : f === "ajuste" ? p.linhas.some(ajustePendente)
  : p.status === f;

export function ListaDePedidos({ podePedir, podeResolver }: {
  /** atendimento | admin */
  podePedir: boolean;
  /** solicitacao | admin */
  podeResolver: boolean;
}) {
  const isMobile = useIsMobile();
  const { toast } = useToast();
  // Quem resolve trabalha por prazo; quem só pede acompanha o mais recente.
  const ordemPadrao: Ordem = podeResolver ? "prazo" : "recentes";
  const [inicial] = useState(() => recorteDaURL(window.location.search, ordemPadrao));
  const [filtro, setFiltro] = useState<Filtro>(inicial.filtro);
  const [ordem, setOrdem] = useState<Ordem>(inicial.ordem);
  const [busca, setBusca] = useState(inicial.busca);
  const [eventoFiltro, setEventoFiltro] = useState(inicial.evento);
  const [limite, setLimite] = useState(PASSO);
  const [novaAberta, setNovaAberta] = useState(false);
  const [alvo, setAlvo] = useState<AlvoDaAcao | null>(null);
  const [detalhe, setDetalhe] = useState<string | null>(null);
  const agora = new Date();
  // 36 no ponteiro, 44 no toque — a régua da casa. Eram 34: a faixa inteira
  // (busca, seletores, chips) ficava 2px abaixo do mínimo.
  const toque = isMobile ? 44 : 36;

  // URL espelhando o recorte com 300ms de atraso: sem o debounce cada tecla da
  // busca escreveria um replaceState. `replaceState` e não `pushState` —
  // filtrar não é navegar, e o Voltar tem de sair da tela.
  useEffect(() => {
    const t = setTimeout(() => {
      const p = new URLSearchParams(window.location.search);
      const por = (k: string, v: string, padrao = "") => (v && v !== padrao ? p.set(k, v) : p.delete(k));
      por("estado", filtro, "aberto");
      por("ordem", ordem, ordemPadrao);
      por("busca", busca.trim());
      por("evento", eventoFiltro);
      const qs = p.toString();
      window.history.replaceState(null, "", qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
    }, 300);
    return () => clearTimeout(t);
  }, [filtro, ordem, busca, eventoFiltro, ordemPadrao]);

  // Voltar/avançar reidrata o recorte — senão a URL passaria a mentir.
  useEffect(() => {
    const onPop = () => {
      const r = recorteDaURL(window.location.search, ordemPadrao);
      setFiltro(r.filtro); setOrdem(r.ordem); setBusca(r.busca); setEventoFiltro(r.evento);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [ordemPadrao]);

  // `placeholderData` mantém a lista atual enquanto a página maior chega: o
  // limite faz parte da chave, então "Carregar mais antigas" trocava a lista
  // inteira pelo esqueleto e jogava a rolagem de volta ao topo.
  const { data: pedidosCrus = [], isLoading, isError, isPlaceholderData, refetch } = useQuery<PedidoDePeca[]>({
    queryKey: [`/api/pedidos-de-peca?limite=${limite}`],
    placeholderData: (anterior) => anterior,
  });
  // Servidor antigo (sem reiniciar depois do Pull) manda solicitação sem as
  // peças: fica de fora em vez de derrubar a tela.
  const pedidos = useMemo(() => pedidosCrus.filter((p) => Array.isArray(p?.linhas)), [pedidosCrus]);
  const { data: eventos = [] } = useQuery<EventoDoPedido[]>({ queryKey: ["/api/events"] });

  const hoje = todayBusinessMs();
  // Idade e prazo nos cartões leem `agora`: o cartão memoizado desenha de novo
  // quando o minuto vira, e não a cada render.
  const minutoAgora = Math.floor(agora.getTime() / 60000);
  const eventoPorId = useMemo(() => new Map<string, EventoDoPedido>(eventos.map((e) => [e.id, e])), [eventos]);
  const seloDe = (l: LinhaDoPedido): SeloDoEvento | null => {
    if (l.status !== "aberto" && l.status !== "atendido") return null;
    const ev = eventoPorId.get(l.eventId);
    return seloDoEventoDoPedido({ motivoFim: ev ? motivoEventoFinalizado(ev, hoje) : null, saida: ev?.truckDepartureDate ?? l.eventSaida }, agora);
  };

  // REABRIR EM EVENTO FINALIZADO. O servidor recusa (409) reabrir peça de
  // evento encerrado ou que já aconteceu; o selo acima só existe para peça
  // aberta/atendida, então a peça cancelada ou recusada mostrava "Reabrir"
  // habilitado — a pessoa escrevia o motivo e só então levava o erro. A regra
  // é a do servidor; aqui ela só passa a ser dita ANTES do clique.
  const bloqueioParaReabrir = (l: LinhaDoPedido): string | null => {
    const ev = eventoPorId.get(l.eventId);
    const motivo = ev ? motivoEventoFinalizado(ev, hoje) : null;
    if (motivo === "encerrado") return "Não dá para reabrir: o evento foi encerrado. Um administrador precisa reabrir o evento primeiro.";
    if (motivo === "realizado") return "Não dá para reabrir: o evento já aconteceu.";
    return null;
  };

  const acaoComMotivo = useMutation({
    mutationFn: async ({ alvo: a, texto }: { alvo: AlvoDaAcao; texto: string }) => (await enviarAcaoComMotivo(a, texto)).json(),
    onSuccess: (_d, v) => {
      toast({ title: tituloDoAviso(v.alvo), description: descricaoDoAviso(v.alvo), variant: "success" });
      setAlvo(null);
      invalidarPedidos();
    },
    onError: (e) => toast({ title: "Não deu para concluir", description: mensagemDaApi(e), variant: "destructive" }),
  });

  const aceitarAjuste = useMutation({
    mutationFn: async (linha: LinhaDoPedido) =>
      (await apiRequest("PATCH", `/api/pedidos-de-peca/linhas/${linha.id}/ajuste/responder`, { aceitar: true })).json(),
    onSuccess: () => { toast({ title: "Ajuste aceito", description: "Quem pediu foi avisado. Ajuste a peça no evento.", variant: "success" }); invalidarPedidos(); },
    onError: (e) => toast({ title: "Não deu para aceitar o ajuste", description: mensagemDaApi(e), variant: "destructive" }),
  });

  const acoesDaLinha = (p: PedidoDePeca) => (l: LinhaDoPedido): AcaoDoCartao[] => {
    const selo = seloDe(l);
    const bloqueio = selo?.bloqueiaAtender ? selo.explicacao : null;
    const acoes: AcaoDoCartao[] = [];
    if (podeResolver) {
      if (l.status === "aberto") {
        acoes.push({ chave: "criar", rotulo: "Criar peça", tom: "criar", bloqueio, href: `/eventos/${l.eventId}?pedidos=1&criar=${l.id}`, testId: `button-criar-peca-linha-${l.id}` });
        acoes.push({ chave: "abrir", rotulo: "Abrir no evento", tom: "secundario", href: `/eventos/${l.eventId}?pedidos=1`, testId: `link-evento-linha-${l.id}` });
        acoes.push({ chave: "recusar", rotulo: "Recusar", tom: "perigo", onClick: () => setAlvo({ pedido: p, linha: l, acao: "recusar" }), testId: `button-recusar-linha-${l.id}` });
      }
      if (l.status === "atendido") {
        if (ajustePendente(l)) {
          // O rótulo diz o que está acontecendo NESTA linha; as outras só travam.
          const aceitandoEsta = aceitarAjuste.isPending && aceitarAjuste.variables?.id === l.id;
          acoes.push({ chave: "aceitar-ajuste", rotulo: aceitandoEsta ? "Aceitando…" : "Aceitar ajuste", tom: "criar", ocupado: aceitarAjuste.isPending, onClick: () => aceitarAjuste.mutate(l), testId: `button-aceitar-ajuste-${l.id}` });
          acoes.push({ chave: "recusar-ajuste", rotulo: "Recusar ajuste", tom: "perigo", onClick: () => setAlvo({ pedido: p, linha: l, acao: "recusar-ajuste" }), testId: `button-recusar-ajuste-${l.id}` });
        }
        acoes.push({ chave: "outra", rotulo: "+ Outra peça", tom: "secundario", bloqueio, href: `/eventos/${l.eventId}?pedidos=1&criar=${l.id}`, testId: `button-outra-peca-linha-${l.id}` });
      }
      if (l.status === "recusado") {
        acoes.push({ chave: "reabrir-recusado", rotulo: "Reabrir", tom: "secundario", bloqueio: bloqueioParaReabrir(l), onClick: () => setAlvo({ pedido: p, linha: l, acao: "reabrir" }), testId: `button-reabrir-linha-${l.id}` });
      }
    }
    if (podePedir) {
      // Com uma peça só, o "Cancelar solicitação" de cima já resolve.
      if (l.status === "aberto" && p.linhas.length > 1) {
        acoes.push({ chave: "cancelar", rotulo: "Cancelar peça", tom: "perigo", onClick: () => setAlvo({ pedido: p, linha: l, acao: "cancelar" }), testId: `button-cancelar-linha-${l.id}` });
      }
      // Depois que a Solicitação agiu: não cancela mais — pede um ajuste.
      if (podePedirAjuste(l)) {
        acoes.push({ chave: "ajuste", rotulo: "Pedir ajuste", tom: "secundario", onClick: () => setAlvo({ pedido: p, linha: l, acao: "ajuste" }), testId: `button-pedir-ajuste-${l.id}` });
      }
      if (l.status === "cancelado") {
        acoes.push({ chave: "reabrir-cancelado", rotulo: "Reabrir", tom: "secundario", bloqueio: bloqueioParaReabrir(l), onClick: () => setAlvo({ pedido: p, linha: l, acao: "reabrir" }), testId: `button-reabrir-linha-${l.id}` });
      }
    }
    return acoes;
  };

  const acoesDaSolicitacao = (p: PedidoDePeca): AcaoDoCartao[] =>
    podePedir && p.status === "aberto"
      ? [{ chave: "cancelar-tudo", rotulo: "Cancelar solicitação", tom: "perigo", onClick: () => setAlvo({ pedido: p, linha: null, acao: "cancelar" }), testId: `button-cancelar-pedido-${p.id}` }]
      : [];

  // A busca filtra com o valor ADIADO: o campo responde na hora e a lista
  // acompanha logo em seguida, sem que cada tecla espere o recorte terminar.
  const buscaAdiada = useDeferredValue(busca);
  const termo = semAcento(buscaAdiada.trim());
  const base = useMemo(
    () => pedidos.filter((p) => (!eventoFiltro || p.linhas.some((l) => l.eventId === eventoFiltro)) && combina(p, termo)),
    [pedidos, eventoFiltro, termo],
  );
  // `dica`: o que o chip recorta, no title. "Abertas" inclui as parciais —
  // não há chip "Parcial", e quem procurava uma não sabia onde ela estava.
  const FILTROS: Array<{ k: Filtro; rotulo: string; n: number; dica: string }> = [
    { k: "aberto", rotulo: "Abertas", n: base.filter((p) => passaNoFiltro(p, "aberto")).length, dica: "Com alguma peça esperando quem monta a lista — inclui as parciais" },
    { k: "atendido", rotulo: "Atendidas", n: base.filter((p) => passaNoFiltro(p, "atendido")).length, dica: "Todas as peças já criadas no evento" },
    { k: "recusado", rotulo: "Recusadas", n: base.filter((p) => passaNoFiltro(p, "recusado")).length, dica: "Recusadas por quem monta a lista, com o motivo" },
    { k: "cancelado", rotulo: "Canceladas", n: base.filter((p) => passaNoFiltro(p, "cancelado")).length, dica: "Canceladas por quem pediu, com o motivo" },
    { k: "ajuste", rotulo: "Ajuste pendente", n: base.filter((p) => passaNoFiltro(p, "ajuste")).length, dica: "Peça atendida com um ajuste esperando resposta de quem monta a lista" },
    { k: "todos", rotulo: "Todas", n: base.length, dica: "Todas as solicitações" },
  ];

  const tempo = (d: string | null) => (d ? new Date(d).getTime() : Infinity);
  const visiveis = useMemo(() => base
    .filter((p) => passaNoFiltro(p, filtro))
    .sort((a, b) => {
      if (ordem === "antigos") return tempo(a.createdAt) - tempo(b.createdAt);
      if (ordem === "prazo") return (prazoMaisProximo(a.linhas) - prazoMaisProximo(b.linhas)) || (tempo(a.createdAt) - tempo(b.createdAt));
      return tempo(b.createdAt) - tempo(a.createdAt);
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [base, filtro, ordem]);

  const parados = pedidos
    .filter((p) => temPecaAberta(p) && idadeDoPedido(p.createdAt, agora).dias > IDADE_DE_ATENCAO)
    .sort((a, b) => tempo(a.createdAt) - tempo(b.createdAt));

  const opcoesDeEvento = useMemo(() => {
    const m = new Map<string, { value: string; label: string; count: number }>();
    for (const p of pedidos) {
      for (const eventId of Array.from(new Set(p.linhas.map((l) => l.eventId)))) {
        const atual = m.get(eventId);
        if (atual) atual.count += 1;
        else m.set(eventId, { value: eventId, label: p.linhas.find((l) => l.eventId === eventId)?.eventName ?? "Evento", count: 1 });
      }
    }
    return Array.from(m.values()).sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }, [pedidos]);

  // O detalhe lê a solicitação VIVA da lista: depois de uma ação, reflete na hora.
  const pedidoDoDetalhe = detalhe ? pedidos.find((p) => p.id === detalhe) ?? null : null;

  const CHIP = (ativo: boolean, zerado: boolean): React.CSSProperties => ({
    height: toque, padding: "0 11px", borderRadius: R.pill, cursor: "pointer",
    border: `1px solid ${ativo ? T.text : T.border}`, background: ativo ? T.text : T.surface,
    color: ativo ? T.surface : zerado ? T.second : T.strong,
    fontSize: FS.meta, fontWeight: FW.forte, display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap",
    transition: "background-color 0.12s, border-color 0.12s",
  });

  const limparRecorte = () => { setBusca(""); setEventoFiltro(""); };

  const vazio = pedidos.length === 0 ? "Nenhuma solicitação ainda"
    : termo || eventoFiltro ? "Nenhuma solicitação neste recorte"
    : filtro === "aberto" ? "Nenhuma solicitação esperando a lista"
    : filtro === "ajuste" ? "Nenhum ajuste esperando resposta"
    : `Nenhuma solicitação ${FILTROS.find((f) => f.k === filtro)?.rotulo.toLowerCase() ?? ""}`;

  const tamanhoDoBotao = isMobile ? "toque" as const : "md" as const;

  return (
    <section data-testid="lista-pedidos" style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: R.lg, boxShadow: SHADOW.sm, overflow: "hidden", minWidth: 0 }}>
      <div style={{ padding: "14px 16px", borderBottom: `1px solid ${N.n3}`, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ position: "relative", flex: isMobile ? "1 1 100%" : "1 1 240px", minWidth: 0 }}>
            <Search size={14} aria-hidden="true" style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: T.apoio }} />
            <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} data-testid="input-busca-pedidos"
              onKeyDown={(e) => { if (e.key === "Escape" && busca) { e.preventDefault(); setBusca(""); } }}
              aria-label="Buscar solicitações por evento, patrocinador, observação, quem solicitou ou peça"
              placeholder="Evento, patrocinador, observação, quem solicitou…"
              style={{ width: "100%", boxSizing: "border-box", height: toque, padding: "0 34px 0 32px", borderRadius: R.md, border: `1px solid ${T.border}`, fontSize: FS.body, color: T.text }} />
            {busca && (
              <button type="button" onClick={() => setBusca("")} aria-label="Limpar a busca" data-testid="button-limpar-busca-pedidos"
                style={{ position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)", width: toque - 8, height: toque - 8, borderRadius: R.pill, border: "none", background: "none", color: T.apoio, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <X size={14} aria-hidden="true" />
              </button>
            )}
          </div>
          {opcoesDeEvento.length > 1 && (
            <FilterSelect label="Evento" allLabel="Todos os eventos" showAllLabelWhenEmpty hideWhenEmpty={false}
              value={eventoFiltro} onChange={setEventoFiltro} options={opcoesDeEvento}
              searchPlaceholder="Buscar evento..." emptyText="Nenhum evento." testId="select-evento-pedidos"
              triggerStyle={{ height: toque, borderRadius: R.md, border: `1px solid ${T.border}`, padding: "0 12px", fontSize: FS.body, background: T.surface }} />
          )}
          {/* Ordenação veste o controle da casa (kind="sort"), não o <select>
              nativo — que desenhava o menu do Windows no meio da faixa. */}
          <FilterSelect kind="sort" hideSearch hideWhenEmpty={false}
            label="Ordenar" value={ordem} onChange={(v) => setOrdem(v as Ordem)} options={ORDENS}
            panelWidth={200} testId="select-ordem-pedidos"
            triggerStyle={{ height: toque }} />
          {podePedir && (
            <Botao variante="primario" tamanho={tamanhoDoBotao} icone={Plus} data-testid="button-novo-pedido" onClick={() => setNovaAberta(true)}
              style={{ minHeight: toque, padding: "0 16px", marginLeft: isMobile ? 0 : "auto" }}>
              Nova solicitação
            </Botao>
          )}
        </div>

        <div role="group" aria-label="Filtrar por estado" style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {FILTROS.map((f) => (
            <button key={f.k} type="button" aria-pressed={filtro === f.k} title={f.dica} data-testid={`filtro-pedidos-${f.k}`} onClick={() => setFiltro(f.k)} style={CHIP(filtro === f.k, f.n === 0)}>
              {f.rotulo}<span style={{ fontVariantNumeric: "tabular-nums" }}>{f.n}</span>
            </button>
          ))}
        </div>
        {/* Quem usa leitor de tela não vê a lista encolher enquanto digita. */}
        <p className="sr-only" aria-live="polite">
          {isLoading ? "" : `${visiveis.length} ${visiveis.length === 1 ? "solicitação" : "solicitações"} na lista`}
        </p>
      </div>

      {parados.length > 0 && (
        <div data-testid="faixa-pedidos-parados" role="status" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "12px 16px", background: TOM.alerta.bg, borderBottom: `1px solid ${TOM.alerta.border}` }}>
          <AlertTriangle size={18} color={TOM.alerta.text} aria-hidden="true" style={{ flexShrink: 0 }} />
          <div style={{ flex: "1 1 260px", minWidth: 0 }}>
            <div style={{ fontSize: FS.body, fontWeight: FW.forte, color: TOM.alerta.text }}>
              {parados.length} {parados.length === 1 ? "solicitação esperando" : "solicitações esperando"} há mais de {IDADE_DE_ATENCAO} dias
            </div>
            <div style={{ fontSize: FS.small, color: TOM.alerta.text, marginTop: 2, lineHeight: 1.45 }}>
              {parados.slice(0, 3).map((p) => `${p.pedidoPor ?? "—"} · ${p.linhas[0]?.eventName ?? "evento"} · ${idadeDoPedido(p.createdAt, agora).texto}`).join("; ")}
            </div>
          </div>
          <Botao variante="secundario" tamanho={tamanhoDoBotao} data-testid="button-ver-mais-antigos" onClick={() => { setFiltro("aberto"); setOrdem("antigos"); limparRecorte(); }}
            style={{ minHeight: toque, padding: "0 12px", borderColor: TOM.alerta.border, color: TOM.alerta.text, fontSize: FS.meta, fontWeight: FW.rotulo }}>
            Ver as {parados.length} mais antigas
          </Botao>
        </div>
      )}

      {/* "POR QUE NÃO POSSO CANCELAR?" — a pergunta de quem pede, diante de
          uma peça atendida sem o botão. Uma vez, no recorte onde ela surge,
          em vez de um botão travado repetido em cada linha. */}
      {podePedir && !podeResolver && (filtro === "atendido" || filtro === "ajuste") && visiveis.length > 0 && (
        <p data-testid="aviso-atendida-nao-cancela" style={{ margin: 0, padding: "8px 16px", fontSize: FS.body, color: T.strong, background: T.bg, borderBottom: `1px solid ${N.n3}`, lineHeight: 1.45 }}>
          Peça atendida já existe no evento, por isso não tem “Cancelar”. Para mudar algo, use <strong>Pedir ajuste</strong> — quem monta a lista aceita ou recusa, e você é avisado.
        </p>
      )}

      {/* Falha ao ATUALIZAR não é falha ao carregar: o React Query mantém a
          última lista, e trocá-la inteira por uma frase de erro (como era)
          escondia justamente o que a pessoa estava lendo. */}
      {isError && pedidos.length > 0 && (
        <p role="alert" data-testid="aviso-pedidos-desatualizados" style={{ margin: 0, padding: "8px 16px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: FS.body, color: TOM.perigo.text, background: TOM.perigo.bg, borderBottom: `1px solid ${TOM.perigo.border}` }}>
          Não foi possível atualizar — a lista abaixo pode estar desatualizada.
          <Botao variante="secundario" tamanho="sm" onClick={() => refetch()} style={{ minHeight: toque }}>Tentar de novo</Botao>
        </p>
      )}

      {isLoading ? (
        <ListaCarregando />
      ) : isError && pedidos.length === 0 ? (
        <div style={{ padding: 16 }}>
          <EstadoErro compacto titulo="Não foi possível carregar as solicitações" detalhe="Verifique a conexão." aoTentarDeNovo={() => refetch()} />
        </div>
      ) : visiveis.length === 0 ? (
        /* O testid antigo fica no invólucro; o vazio em si é o do design
           system. Sem a moldura tracejada dele: aqui já estamos dentro do
           cartão da lista, e borda dentro de borda vira grade. */
        <div data-testid="pedidos-vazio" style={{ padding: 16 }}>
          <EstadoVazio
            compacto
            icone={Inbox}
            titulo={vazio}
            descricao={pedidos.length === 0 && podePedir ? "Use “Nova solicitação” para pedir peças a quem monta a lista." : undefined}
            acao={
              /* A SAÍDA do vazio: quem recortou demais precisa de um clique
                 de volta, não de caçar qual controle está ligado. */
              termo || eventoFiltro ? (
                <Botao variante="secundario" tamanho={tamanhoDoBotao} data-testid="button-limpar-recorte-pedidos" onClick={limparRecorte}>
                  Limpar busca e evento
                </Botao>
              ) : filtro !== "todos" && base.length > 0 ? (
                <Botao variante="secundario" tamanho={tamanhoDoBotao} data-testid="button-ver-todas-pedidos" onClick={() => setFiltro("todos")}>
                  Ver todas ({base.length})
                </Botao>
              ) : undefined
            }
          />
        </div>
      ) : (
        <ul style={{ margin: 0, padding: 0 }}>
          {visiveis.map((p) => (
            <CartaoMemoizado key={p.id} deps={[p, eventoPorId, hoje, minutoAgora, aceitarAjuste.isPending, aceitarAjuste.variables?.id, podePedir, podeResolver, isMobile]}
              desenhar={() => (
            <CartaoDoPedido key={p.id} pedido={p} agora={agora} seloDe={seloDe} acoesDaLinha={acoesDaLinha(p)} acoes={acoesDaSolicitacao(p)} onAbrir={() => setDetalhe(p.id)} />
              )} />
          ))}
        </ul>
      )}

      {(pedidos.length >= limite || isPlaceholderData) && (
        <div style={{ padding: 12, borderTop: `1px solid ${N.n3}`, textAlign: "center" }}>
          <Botao variante="secundario" tamanho={tamanhoDoBotao} data-testid="button-mais-pedidos" onClick={() => setLimite((l) => l + PASSO)}
            carregando={isPlaceholderData}
            style={{ minHeight: toque, padding: "0 16px", color: T.text }}>
            {isPlaceholderData ? "Carregando as mais antigas…" : "Carregar solicitações mais antigas"}
          </Botao>
        </div>
      )}

      <DetalheDoPedido
        pedido={pedidoDoDetalhe}
        agora={agora}
        seloDe={seloDe}
        acoesDaLinha={pedidoDoDetalhe ? acoesDaLinha(pedidoDoDetalhe) : () => []}
        acoes={pedidoDoDetalhe ? acoesDaSolicitacao(pedidoDoDetalhe) : []}
        onFechar={() => setDetalhe(null)}
      />
      <FormularioDoPedido aberto={novaAberta} onFechar={() => setNovaAberta(false)} />
      <MotivoDoPedidoDialog
        alvo={alvo}
        pendente={acaoComMotivo.isPending}
        onConfirmar={(texto) => { if (alvo) acaoComMotivo.mutate({ alvo, texto }); }}
        onFechar={() => setAlvo(null)}
      />
    </section>
  );
}
