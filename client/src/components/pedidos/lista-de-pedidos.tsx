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
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, Inbox, Plus, Search } from "lucide-react";
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
import { T, FS, R } from "@/lib/theme";
import { MotivoDoPedidoDialog, enviarAcaoComMotivo, tituloDoAviso, type AlvoDaAcao } from "@/components/motivo-do-pedido-dialog";
import { CartaoDoPedido, type AcaoDoCartao } from "@/components/pedidos/cartao-do-pedido";
import { DetalheDoPedido } from "@/components/pedidos/detalhe-do-pedido";
import { FormularioDoPedido } from "@/components/pedidos/formulario-do-pedido";
import { ListaCarregando, invalidarPedidos, mensagemDaApi } from "@/components/pedidos/ui";

type Ordem = "recentes" | "antigos" | "prazo";
type Filtro = "aberto" | "atendido" | "recusado" | "cancelado" | "ajuste" | "todos";

const PASSO = 300;

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const combina = (p: PedidoDePeca, termo: string) => {
  if (!termo) return true;
  const alvo = [
    p.pedidoPor,
    ...p.linhas.flatMap((l) => [l.eventName, patrocinadoresDaLinha(l), textoDaObservacao(l.observacao), l.tipoDePeca, ...(l.pecas ?? []).map((x) => x.displayId)]),
  ].filter(Boolean).join(" ");
  return semAcento(alvo).includes(termo);
};

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
  const [filtro, setFiltro] = useState<Filtro>("aberto");
  // Quem resolve trabalha por prazo; quem só pede acompanha o mais recente.
  const [ordem, setOrdem] = useState<Ordem>(podeResolver ? "prazo" : "recentes");
  const [busca, setBusca] = useState("");
  const [eventoFiltro, setEventoFiltro] = useState("");
  const [limite, setLimite] = useState(PASSO);
  const [novaAberta, setNovaAberta] = useState(false);
  const [alvo, setAlvo] = useState<AlvoDaAcao | null>(null);
  const [detalhe, setDetalhe] = useState<string | null>(null);
  const agora = new Date();
  const toque = isMobile ? 44 : 34;

  const { data: pedidos = [], isLoading, isError, refetch } = useQuery<PedidoDePeca[]>({ queryKey: [`/api/pedidos-de-peca?limite=${limite}`] });
  const { data: eventos = [] } = useQuery<any[]>({ queryKey: ["/api/events"] });

  const hoje = todayBusinessMs();
  const eventoPorId = useMemo(() => new Map<string, any>(eventos.map((e) => [e.id, e])), [eventos]);
  const seloDe = (l: LinhaDoPedido): SeloDoEvento | null => {
    if (l.status !== "aberto" && l.status !== "atendido") return null;
    const ev = eventoPorId.get(l.eventId);
    return seloDoEventoDoPedido({ motivoFim: ev ? motivoEventoFinalizado(ev, hoje) : null, saida: ev?.truckDepartureDate ?? l.eventSaida }, agora);
  };

  const acaoComMotivo = useMutation({
    mutationFn: async ({ alvo: a, texto }: { alvo: AlvoDaAcao; texto: string }) => (await enviarAcaoComMotivo(a, texto)).json(),
    onSuccess: (_d, v) => {
      toast({ title: tituloDoAviso(v.alvo) });
      setAlvo(null);
      invalidarPedidos();
    },
    onError: (e) => toast({ title: "Não deu para concluir", description: mensagemDaApi(e), variant: "destructive" }),
  });

  const aceitarAjuste = useMutation({
    mutationFn: async (linha: LinhaDoPedido) =>
      (await apiRequest("PATCH", `/api/pedidos-de-peca/linhas/${linha.id}/ajuste/responder`, { aceitar: true })).json(),
    onSuccess: () => { toast({ title: "Ajuste aceito", description: "Quem pediu foi avisado. Ajuste a peça no evento." }); invalidarPedidos(); },
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
          acoes.push({ chave: "aceitar-ajuste", rotulo: "Aceitar ajuste", tom: "criar", bloqueio: aceitarAjuste.isPending ? "Salvando…" : null, onClick: () => aceitarAjuste.mutate(l), testId: `button-aceitar-ajuste-${l.id}` });
          acoes.push({ chave: "recusar-ajuste", rotulo: "Recusar ajuste", tom: "perigo", onClick: () => setAlvo({ pedido: p, linha: l, acao: "recusar-ajuste" }), testId: `button-recusar-ajuste-${l.id}` });
        }
        acoes.push({ chave: "outra", rotulo: "+ Outra peça", tom: "secundario", bloqueio, href: `/eventos/${l.eventId}?pedidos=1&criar=${l.id}`, testId: `button-outra-peca-linha-${l.id}` });
      }
      if (l.status === "recusado") {
        acoes.push({ chave: "reabrir-recusado", rotulo: "Reabrir", tom: "secundario", bloqueio, onClick: () => setAlvo({ pedido: p, linha: l, acao: "reabrir" }), testId: `button-reabrir-linha-${l.id}` });
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
        acoes.push({ chave: "reabrir-cancelado", rotulo: "Reabrir", tom: "secundario", bloqueio, onClick: () => setAlvo({ pedido: p, linha: l, acao: "reabrir" }), testId: `button-reabrir-linha-${l.id}` });
      }
    }
    return acoes;
  };

  const acoesDaSolicitacao = (p: PedidoDePeca): AcaoDoCartao[] =>
    podePedir && p.status === "aberto"
      ? [{ chave: "cancelar-tudo", rotulo: "Cancelar solicitação", tom: "perigo", onClick: () => setAlvo({ pedido: p, linha: null, acao: "cancelar" }), testId: `button-cancelar-pedido-${p.id}` }]
      : [];

  const termo = semAcento(busca.trim());
  const base = pedidos.filter((p) => (!eventoFiltro || p.linhas.some((l) => l.eventId === eventoFiltro)) && combina(p, termo));
  const FILTROS: Array<{ k: Filtro; rotulo: string; n: number }> = [
    { k: "aberto", rotulo: "Abertas", n: base.filter((p) => passaNoFiltro(p, "aberto")).length },
    { k: "atendido", rotulo: "Atendidas", n: base.filter((p) => passaNoFiltro(p, "atendido")).length },
    { k: "recusado", rotulo: "Recusadas", n: base.filter((p) => passaNoFiltro(p, "recusado")).length },
    { k: "cancelado", rotulo: "Canceladas", n: base.filter((p) => passaNoFiltro(p, "cancelado")).length },
    { k: "ajuste", rotulo: "Ajuste pendente", n: base.filter((p) => passaNoFiltro(p, "ajuste")).length },
    { k: "todos", rotulo: "Todas", n: base.length },
  ];

  const tempo = (d: string | null) => (d ? new Date(d).getTime() : Infinity);
  const visiveis = base
    .filter((p) => passaNoFiltro(p, filtro))
    .sort((a, b) => {
      if (ordem === "antigos") return tempo(a.createdAt) - tempo(b.createdAt);
      if (ordem === "prazo") return (prazoMaisProximo(a.linhas) - prazoMaisProximo(b.linhas)) || (tempo(a.createdAt) - tempo(b.createdAt));
      return tempo(b.createdAt) - tempo(a.createdAt);
    });

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
    border: `1px solid ${ativo ? "#1c1917" : "#e7e5e4"}`, background: ativo ? "#1c1917" : "#ffffff",
    color: ativo ? "#ffffff" : zerado ? "#78716c" : "#44403c",
    fontSize: 12, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap",
  });

  const vazio = pedidos.length === 0 ? "Nenhuma solicitação ainda"
    : termo || eventoFiltro ? "Nenhuma solicitação neste recorte"
    : filtro === "aberto" ? "Nenhuma solicitação esperando a lista"
    : filtro === "ajuste" ? "Nenhum ajuste esperando resposta"
    : `Nenhuma solicitação ${FILTROS.find((f) => f.k === filtro)?.rotulo.toLowerCase() ?? ""}`;

  return (
    <section data-testid="lista-pedidos" style={{ background: "#ffffff", border: "1px solid #e7e5e4", borderRadius: R.lg, boxShadow: "0 1px 2px rgba(28,25,23,0.06)", overflow: "hidden", minWidth: 0 }}>
      <div style={{ padding: "14px 16px", borderBottom: "1px solid #f1f0ef", display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ position: "relative", flex: isMobile ? "1 1 100%" : "1 1 240px", minWidth: 0 }}>
            <Search size={14} aria-hidden="true" style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "#57534e" }} />
            <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} data-testid="input-busca-pedidos"
              aria-label="Buscar solicitações por evento, patrocinador, observação, quem solicitou ou peça"
              placeholder="Evento, patrocinador, observação, quem solicitou…"
              style={{ width: "100%", boxSizing: "border-box", height: toque, padding: "0 12px 0 32px", borderRadius: R.md, border: "1px solid #e7e5e4", fontSize: FS.body, color: T.text, outline: "none" }} />
          </div>
          {opcoesDeEvento.length > 1 && (
            <FilterSelect label="Evento" allLabel="Todos os eventos" showAllLabelWhenEmpty hideWhenEmpty={false}
              value={eventoFiltro} onChange={setEventoFiltro} options={opcoesDeEvento}
              searchPlaceholder="Buscar evento..." emptyText="Nenhum evento." testId="select-evento-pedidos"
              triggerStyle={{ height: toque, borderRadius: R.md, border: "1px solid #e7e5e4", padding: "0 12px", fontSize: FS.body, background: "#fff" }} />
          )}
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: FS.body, color: "#44403c", fontWeight: 600 }}>
            Ordem
            <select value={ordem} onChange={(e) => setOrdem(e.target.value as Ordem)} data-testid="select-ordem-pedidos"
              style={{ height: toque, borderRadius: R.md, border: "1px solid #e7e5e4", padding: "0 8px", fontSize: FS.body, background: "#fff", color: T.text }}>
              <option value="prazo">Prazo mais próximo</option>
              <option value="recentes">Mais recentes</option>
              <option value="antigos">Mais antigas</option>
            </select>
          </label>
          {podePedir && (
            <button type="button" data-testid="button-novo-pedido" onClick={() => setNovaAberta(true)}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, height: isMobile ? 44 : 38, padding: "0 16px", borderRadius: R.md, border: "none", background: "#1c1917", color: "#fff", fontSize: FS.body, fontWeight: 800, cursor: "pointer", marginLeft: isMobile ? 0 : "auto" }}>
              <Plus size={15} aria-hidden="true" /> Nova solicitação
            </button>
          )}
        </div>

        <div role="group" aria-label="Filtrar por estado" style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {FILTROS.map((f) => (
            <button key={f.k} type="button" aria-pressed={filtro === f.k} data-testid={`filtro-pedidos-${f.k}`} onClick={() => setFiltro(f.k)} style={CHIP(filtro === f.k, f.n === 0)}>
              {f.rotulo}<span style={{ fontVariantNumeric: "tabular-nums" }}>{f.n}</span>
            </button>
          ))}
        </div>
      </div>

      {parados.length > 0 && (
        <div data-testid="faixa-pedidos-parados" role="status" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "12px 16px", background: "#fffbeb", borderBottom: "1px solid #fde68a" }}>
          <AlertTriangle size={18} color="#b45309" aria-hidden="true" style={{ flexShrink: 0 }} />
          <div style={{ flex: "1 1 260px", minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#78350f" }}>
              {parados.length} {parados.length === 1 ? "solicitação esperando" : "solicitações esperando"} há mais de {IDADE_DE_ATENCAO} dias
            </div>
            <div style={{ fontSize: 11, color: "#78350f", marginTop: 2, lineHeight: 1.45 }}>
              {parados.slice(0, 3).map((p) => `${p.pedidoPor ?? "—"} · ${p.linhas[0]?.eventName ?? "evento"} · ${idadeDoPedido(p.createdAt, agora).texto}`).join("; ")}
            </div>
          </div>
          <button type="button" data-testid="button-ver-mais-antigos" onClick={() => { setFiltro("aberto"); setOrdem("antigos"); }}
            style={{ height: toque, padding: "0 12px", borderRadius: R.md, border: "1px solid #fcd34d", background: "#ffffff", color: "#78350f", fontSize: 12.5, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" }}>
            Ver as {parados.length} mais antigas
          </button>
        </div>
      )}

      {isLoading ? (
        <ListaCarregando />
      ) : isError ? (
        <p style={{ margin: 0, padding: 20, fontSize: FS.body, color: "#b91c1c" }}>
          Não foi possível carregar as solicitações.{" "}
          <button type="button" onClick={() => refetch()} style={{ border: "none", background: "none", fontWeight: 800, textDecoration: "underline", cursor: "pointer", color: T.text }}>Tentar de novo</button>
        </p>
      ) : visiveis.length === 0 ? (
        <div data-testid="pedidos-vazio" style={{ padding: "36px 16px", textAlign: "center", color: "#57534e" }}>
          <Inbox size={26} color="#78716c" aria-hidden="true" />
          <p style={{ margin: "8px 0 2px", fontSize: 14, fontWeight: 700, color: T.text }}>{vazio}</p>
          {pedidos.length === 0 && podePedir && (
            <p style={{ margin: 0, fontSize: FS.body }}>Use “Nova solicitação” para pedir peças a quem monta a lista.</p>
          )}
        </div>
      ) : (
        <ul style={{ margin: 0, padding: 0 }}>
          {visiveis.map((p) => (
            <CartaoDoPedido key={p.id} pedido={p} agora={agora} seloDe={seloDe} acoesDaLinha={acoesDaLinha(p)} acoes={acoesDaSolicitacao(p)} onAbrir={() => setDetalhe(p.id)} />
          ))}
        </ul>
      )}

      {pedidos.length >= limite && (
        <div style={{ padding: 12, borderTop: "1px solid #f1f0ef", textAlign: "center" }}>
          <button type="button" data-testid="button-mais-pedidos" onClick={() => setLimite((l) => l + PASSO)}
            style={{ height: toque, padding: "0 16px", borderRadius: R.md, border: "1px solid #e7e5e4", background: "#fff", color: T.text, fontSize: FS.body, fontWeight: 700, cursor: "pointer" }}>
            Carregar solicitações mais antigas
          </button>
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
