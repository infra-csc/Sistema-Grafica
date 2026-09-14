// ─────────────────────────────────────────────────────────────────────────────
// PEDIDOS DO ATENDIMENTO — dentro do evento, para quem monta a lista (14/09).
//
// Pedido aberto: Criar peça (formulário preenchido, a peça sai ligada ao
// pedido), Já criei a peça (busca entre as peças do evento) ou Recusar.
// Pedido atendido: + Outra peça, ligar mais uma que já existe, ou Desfazer.
// Recusado: Reabrir. Evento finalizado: os botões de criar ficam visíveis e
// desabilitados, com o motivo.
//
// ?pedidos=1 rola até aqui; ?criar=<pedido> abre "Criar peça" direto (é o
// caminho da caixa da Solicitação).
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ChevronDown, Inbox } from "lucide-react";
import { seloDoEventoDoPedido, type PedidoDePeca } from "@shared/pedidos-de-peca";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { FilterSelect } from "@/components/filter-select";
import { T, FS, R } from "@/lib/theme";
import { MotivoDoPedidoDialog, TITULO_DO_AVISO, enviarAcaoComMotivo, type AcaoComMotivo } from "@/components/motivo-do-pedido-dialog";
import { ajustePendente } from "@shared/pedidos-de-peca";
import { CartaoDoPedido, type AcaoDoCartao } from "@/components/pedidos/cartao-do-pedido";
import { avisoDaAcao } from "@/components/pedidos/lista-de-pedidos";
import { DetalheDoPedido } from "@/components/pedidos/detalhe-do-pedido";
import { SeloDoEventoChip, invalidarPedidos, mensagemDaApi } from "@/components/pedidos/ui";

export function PedidosDoEvento({ eventId, pecas, podeVer, podeAtender, motivoEventoFim, saidaDoCaminhao, onCriarPeca }: {
  eventId: string;
  pecas: any[];
  /** A Gráfica não usa pedidos. */
  podeVer: boolean;
  /** solicitacao | admin — a régua do servidor. */
  podeAtender: boolean;
  motivoEventoFim: "encerrado" | "realizado" | null;
  saidaDoCaminhao: string | Date | null;
  onCriarPeca: (pedido: PedidoDePeca) => void;
}) {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [ligando, setLigando] = useState<string | null>(null);
  const [pecaEscolhida, setPecaEscolhida] = useState("");
  const [motivo, setMotivo] = useState<{ pedido: PedidoDePeca; acao: AcaoComMotivo } | null>(null);
  const [verResolvidos, setVerResolvidos] = useState(false);
  const [detalhe, setDetalhe] = useState<string | null>(null);
  const criarConsumido = useRef(false);
  const agora = new Date();
  const alvo = isMobile ? 44 : 36;

  const { data: pedidos = [] } = useQuery<PedidoDePeca[]>({
    queryKey: [`/api/pedidos-de-peca?eventId=${eventId}`],
    enabled: !!eventId && podeVer,
  });

  const selo = seloDoEventoDoPedido({ motivoFim: motivoEventoFim, saida: saidaDoCaminhao }, agora);
  const bloqueio = selo?.bloqueiaAtender ? selo.explicacao : null;

  const atender = useMutation({
    mutationFn: async ({ id, itemId }: { id: string; itemId: string }) =>
      (await apiRequest("PATCH", `/api/pedidos-de-peca/${id}/atender`, { itemId })).json(),
    onSuccess: () => { toast({ title: "Peça ligada à solicitação", description: "Quem solicitou foi avisado." }); setLigando(null); setPecaEscolhida(""); invalidarPedidos(); },
    onError: (e) => toast({ title: "Não deu para ligar a peça", description: mensagemDaApi(e), variant: "destructive" }),
  });

  const acaoComMotivo = useMutation({
    mutationFn: async ({ pedido, acao, texto }: { pedido: PedidoDePeca; acao: AcaoComMotivo; texto: string }) =>
      (await enviarAcaoComMotivo(pedido.id, acao, texto)).json(),
    onSuccess: (_d, v) => { toast({ title: TITULO_DO_AVISO[v.acao] }); setMotivo(null); invalidarPedidos(); },
    onError: (e) => toast({ title: "Não deu para concluir", description: mensagemDaApi(e), variant: "destructive" }),
  });

  const aceitarAjuste = useMutation({
    mutationFn: async (pedido: PedidoDePeca) =>
      (await apiRequest("PATCH", `/api/pedidos-de-peca/${pedido.id}/ajuste/responder`, { aceitar: true })).json(),
    onSuccess: () => { toast({ title: "Ajuste aceito", description: "Quem pediu foi avisado. Ajuste a peça na lista." }); invalidarPedidos(); },
    onError: (e) => toast({ title: "Não deu para aceitar o ajuste", description: mensagemDaApi(e), variant: "destructive" }),
  });

  // Vindo da faixa de Eventos ou da caixa (?pedidos=1): rola até o painel.
  // Vindo de "Criar peça" na caixa (?criar=<id>): abre o formulário direto.
  useEffect(() => {
    if (pedidos.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("pedidos") === "1") {
      document.getElementById("pedidos-do-atendimento")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    const alvoCriar = params.get("criar");
    if (!alvoCriar || criarConsumido.current) return;
    criarConsumido.current = true;
    params.delete("criar");
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
    const p = pedidos.find((x) => x.id === alvoCriar);
    if (!p) return;
    if (!podeAtender) { toast({ title: "Criar peça a partir da solicitação é do perfil Solicitação e do admin", variant: "destructive" }); return; }
    if (bloqueio) { toast({ title: "Não dá para criar peça neste evento", description: bloqueio, variant: "destructive" }); return; }
    if (p.status !== "aberto" && p.status !== "atendido") { toast({ title: "Esta solicitação não está aberta", description: "Reabra a solicitação antes de criar a peça.", variant: "destructive" }); return; }
    onCriarPeca(p);
  }, [pedidos, podeAtender, bloqueio, onCriarPeca, toast]);

  if (!podeVer || pedidos.length === 0) return null;
  const abertos = pedidos.filter((p) => p.status === "aberto" || p.status === "atendido");
  const resolvidos = pedidos.filter((p) => p.status === "recusado" || p.status === "cancelado");
  const qtdAbertos = pedidos.filter((p) => p.status === "aberto").length;
  const qtdAjustes = pedidos.filter(ajustePendente).length;

  const pecasDoEvento = pecas.filter((i) => !i.deletedAt && i.status !== "cancelled");
  const opcoesDePeca = (pedido: PedidoDePeca) => pecasDoEvento
    .filter((i) => !i.pedidoDePecaId)
    .sort((a, b) => String(a.displayId ?? "").localeCompare(String(b.displayId ?? ""), "pt-BR", { numeric: true }))
    .map((i) => ({ value: i.id, label: `${i.displayId} · ${i.type}${i.description ? ` — ${i.description}` : ""} · ${i.quantity} un.` }));
  const jaAtendemOutros = pecasDoEvento.filter((i) => i.pedidoDePecaId).length;

  const acoesDe = (p: PedidoDePeca): AcaoDoCartao[] => {
    if (!podeAtender) return [];
    const livres = opcoesDePeca(p).length;
    if (p.status === "aberto") {
      return [
        { chave: "criar", rotulo: "Criar peça", tom: "criar", bloqueio, onClick: () => onCriarPeca(p), testId: `button-criar-peca-pedido-${p.id}` },
        { chave: "ligar", rotulo: "Já criei a peça", tom: "secundario", bloqueio: bloqueio ?? (livres === 0 ? "Nenhuma peça livre neste evento" : null), onClick: () => { setLigando(p.id); setPecaEscolhida(""); }, testId: `button-ligar-peca-pedido-${p.id}` },
        { chave: "recusar", rotulo: "Recusar", tom: "perigo", onClick: () => setMotivo({ pedido: p, acao: "recusar" }), testId: `button-recusar-pedido-${p.id}` },
      ];
    }
    if (p.status === "atendido") {
      return [
        ...(ajustePendente(p) ? [
          { chave: "aceitar-ajuste", rotulo: "Aceitar ajuste", tom: "criar", bloqueio: aceitarAjuste.isPending ? "Salvando…" : null, onClick: () => aceitarAjuste.mutate(p), testId: `button-aceitar-ajuste-${p.id}` },
          { chave: "recusar-ajuste", rotulo: "Recusar ajuste", tom: "perigo", onClick: () => setMotivo({ pedido: p, acao: "recusar-ajuste" }), testId: `button-recusar-ajuste-${p.id}` },
        ] as AcaoDoCartao[] : []),
        { chave: "outra", rotulo: "+ Outra peça", tom: "secundario", bloqueio, onClick: () => onCriarPeca(p), testId: `button-outra-peca-pedido-${p.id}` },
        { chave: "ligar", rotulo: "Ligar peça existente", tom: "secundario", bloqueio: bloqueio ?? (livres === 0 ? "Nenhuma peça livre neste evento" : null), onClick: () => { setLigando(p.id); setPecaEscolhida(""); }, testId: `button-ligar-peca-pedido-${p.id}` },
        { chave: "desfazer", rotulo: "Desfazer atendimento", tom: "perigo", bloqueio, onClick: () => setMotivo({ pedido: p, acao: "reabrir" }), testId: `button-desfazer-pedido-${p.id}` },
      ];
    }
    if (p.status === "recusado") {
      return [{ chave: "reabrir", rotulo: "Reabrir", tom: "secundario", bloqueio, onClick: () => setMotivo({ pedido: p, acao: "reabrir" }), testId: `button-reabrir-pedido-${p.id}` }];
    }
    return [];
  };

  const escolherPeca = (p: PedidoDePeca) => ligando === p.id ? (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ flex: "1 1 280px", minWidth: 0 }}>
          <FilterSelect kind="field" fullWidth hideWhenEmpty={false}
            label="Peça que atende a solicitação" allLabel="Escolha a peça…" showAllLabelWhenEmpty
            value={pecaEscolhida} onChange={setPecaEscolhida} options={opcoesDePeca(p)}
            searchPlaceholder="Buscar por código, tipo ou descrição…" emptyText="Nenhuma peça livre."
            testId={`select-peca-pedido-${p.id}`}
            triggerStyle={{ height: alvo, borderRadius: R.md, border: "1px solid #d6d3d1", padding: "0 10px", fontSize: 13, background: "#fff", width: "100%" }} />
        </div>
        <button type="button" disabled={!pecaEscolhida || atender.isPending} onClick={() => atender.mutate({ id: p.id, itemId: pecaEscolhida })}
          style={{ height: alvo, padding: "0 12px", borderRadius: R.md, border: "none", fontSize: 12.5, fontWeight: 800, background: pecaEscolhida ? "#047857" : "#e7e5e4", color: pecaEscolhida ? "#fff" : "#78716c", cursor: pecaEscolhida ? "pointer" : "not-allowed" }}>
          {atender.isPending ? "Ligando…" : "Ligar à solicitação"}
        </button>
        <button type="button" onClick={() => setLigando(null)} style={{ height: alvo, padding: "0 10px", border: "none", background: "none", color: "#57534e", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>Voltar</button>
      </div>
      {jaAtendemOutros > 0 && (
        <span style={{ fontSize: FS.small, color: "#57534e" }}>{jaAtendemOutros} {jaAtendemOutros === 1 ? "peça já atende outra solicitação e não aparece" : "peças já atendem outras solicitações e não aparecem"} na lista.</span>
      )}
    </div>
  ) : null;

  return (
    <section
      id="pedidos-do-atendimento"
      data-testid="painel-pedidos-do-evento"
      aria-labelledby="titulo-pedidos-do-evento"
      style={{ backgroundColor: "#fff", border: "1px solid #e7e5e4", borderLeft: `3px solid ${qtdAbertos ? "#b45309" : "#d6d3d1"}`, borderRadius: R.lg, boxShadow: "0 1px 4px rgba(0,0,0,0.05)", marginBottom: 32, overflow: "hidden" }}
    >
      <div style={{ padding: "16px 20px 10px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <Inbox style={{ width: 16, height: 16, color: "#b45309", flexShrink: 0 }} aria-hidden="true" />
        <h2 id="titulo-pedidos-do-evento" style={{ margin: 0, fontSize: 13, fontWeight: 800, color: T.text, textTransform: "uppercase", letterSpacing: "0.04em" }}>
          Solicitações de peças
        </h2>
        <span style={{ backgroundColor: qtdAbertos ? "#fffbeb" : "#f5f5f4", color: qtdAbertos ? "#92400e" : "#57534e", border: `1px solid ${qtdAbertos ? "#fde68a" : "#e7e5e4"}`, borderRadius: R.pill, padding: "2px 10px", fontSize: FS.small, fontWeight: 800 }}>
          {qtdAbertos} {qtdAbertos === 1 ? "aberta" : "abertas"}
        </span>
        {qtdAjustes > 0 && (
          <span data-testid="chip-ajustes-do-evento" style={{ backgroundColor: "#fffbeb", color: "#92400e", border: "1px solid #fde68a", borderRadius: R.pill, padding: "2px 10px", fontSize: FS.small, fontWeight: 800 }}>
            {qtdAjustes} {qtdAjustes === 1 ? "ajuste pendente" : "ajustes pendentes"}
          </span>
        )}
        <SeloDoEventoChip selo={selo} pedidoId={eventId} />
        {!podeAtender && qtdAbertos > 0 && <span style={{ fontSize: FS.body, color: "#57534e" }}>Quem atende é a Solicitação.</span>}
      </div>

      {abertos.length > 0 && (
        <ul style={{ margin: 0, padding: 0, borderTop: "1px solid #f1f0ef" }}>
          {abertos
            .sort((a, b) => (a.status === "aberto" ? 0 : 1) - (b.status === "aberto" ? 0 : 1))
            .map((p) => (
              <CartaoDoPedido key={p.id} pedido={p} agora={agora} selo={null} mostrarEvento={false} acoes={acoesDe(p)} extra={escolherPeca(p)} onAbrir={() => setDetalhe(p.id)} />
            ))}
        </ul>
      )}

      {resolvidos.length > 0 && (
        <div style={{ padding: "10px 20px 14px", borderTop: "1px solid #f1f0ef" }}>
          <button type="button" aria-expanded={verResolvidos} onClick={() => setVerResolvidos((v) => !v)} data-testid="button-ver-pedidos-resolvidos"
            style={{ border: "none", background: "none", padding: 0, minHeight: isMobile ? 44 : undefined, display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 800, color: "#57534e", cursor: "pointer" }}>
            <ChevronDown size={14} style={{ transform: verResolvidos ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
            {verResolvidos ? "Esconder" : "Ver"} {resolvidos.length} {resolvidos.length === 1 ? "solicitação recusada ou cancelada" : "solicitações recusadas ou canceladas"}
          </button>
          {verResolvidos && (
            <ul style={{ margin: "8px -20px 0", padding: 0 }}>
              {resolvidos.map((p) => (
                <CartaoDoPedido key={p.id} pedido={p} agora={agora} selo={null} mostrarEvento={false} acoes={acoesDe(p)} onAbrir={() => setDetalhe(p.id)} />
              ))}
            </ul>
          )}
        </div>
      )}

      <DetalheDoPedido
        pedido={detalhe ? pedidos.find((x) => x.id === detalhe) ?? null : null}
        agora={agora}
        selo={selo}
        acoes={(() => { const d = detalhe ? pedidos.find((x) => x.id === detalhe) : null; return d ? acoesDe(d).filter((a) => a.chave !== "ligar") : []; })()}
        onFechar={() => setDetalhe(null)}
      />
      <MotivoDoPedidoDialog
        pedido={motivo?.pedido ?? null}
        acao={motivo?.acao ?? "recusar"}
        aviso={motivo ? avisoDaAcao(motivo.acao, motivo.pedido) : ""}
        pendente={acaoComMotivo.isPending}
        onConfirmar={(texto) => { if (motivo) acaoComMotivo.mutate({ pedido: motivo.pedido, acao: motivo.acao, texto }); }}
        onFechar={() => setMotivo(null)}
      />
    </section>
  );
}
