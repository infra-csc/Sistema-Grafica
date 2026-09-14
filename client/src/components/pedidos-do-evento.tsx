// ─────────────────────────────────────────────────────────────────────────────
// SOLICITAÇÕES DE PEÇAS — dentro do evento, para quem monta a lista (14/09).
//
// Mostra as solicitações que têm peça DESTE evento, e só essas peças (a mesma
// solicitação pode ter peças de outros eventos). Por peça:
//   · aberta: Criar peça (formulário preenchido, sai ligada), Já criei a peça
//     (busca entre as peças do evento) ou Recusar;
//   · atendida: + Outra peça, ligar mais uma que já existe, aceitar/recusar
//     ajuste pendente (não há "desfazer": excluir a peça criada devolve a
//     peça solicitada para aberta sozinha);
//   · recusada: Reabrir.
// Evento finalizado: os botões de criar ficam visíveis e desabilitados.
//
// ?pedidos=1 rola até aqui; ?criar=<peça solicitada> abre "Criar peça" direto
// (é o caminho da página de solicitações).
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ChevronDown, Inbox } from "lucide-react";
import { ajustePendente, seloDoEventoDoPedido, type LinhaDoPedido, type PedidoDePeca } from "@shared/pedidos-de-peca";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { FilterSelect } from "@/components/filter-select";
import { T, FS, R } from "@/lib/theme";
import { MotivoDoPedidoDialog, enviarAcaoComMotivo, tituloDoAviso, type AlvoDaAcao } from "@/components/motivo-do-pedido-dialog";
import { CartaoDoPedido, type AcaoDoCartao } from "@/components/pedidos/cartao-do-pedido";
import { DetalheDoPedido } from "@/components/pedidos/detalhe-do-pedido";
import { SeloDoEventoChip, invalidarPedidos, mensagemDaApi } from "@/components/pedidos/ui";

export function PedidosDoEvento({ eventId, pecas, podeVer, podeAtender, motivoEventoFim, saidaDoCaminhao, onCriarPeca }: {
  eventId: string;
  pecas: any[];
  /** A Gráfica não usa solicitações. */
  podeVer: boolean;
  /** solicitacao | admin — a régua do servidor. */
  podeAtender: boolean;
  motivoEventoFim: "encerrado" | "realizado" | null;
  saidaDoCaminhao: string | Date | null;
  onCriarPeca: (pedido: PedidoDePeca, linha: LinhaDoPedido) => void;
}) {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [ligando, setLigando] = useState<string | null>(null);
  const [pecaEscolhida, setPecaEscolhida] = useState("");
  const [alvo, setAlvo] = useState<AlvoDaAcao | null>(null);
  const [verResolvidas, setVerResolvidas] = useState(false);
  const [detalhe, setDetalhe] = useState<string | null>(null);
  const criarConsumido = useRef(false);
  const agora = new Date();
  const toque = isMobile ? 44 : 36;

  const { data: pedidos = [] } = useQuery<PedidoDePeca[]>({
    queryKey: [`/api/pedidos-de-peca?eventId=${eventId}`],
    enabled: !!eventId && podeVer,
  });

  const selo = seloDoEventoDoPedido({ motivoFim: motivoEventoFim, saida: saidaDoCaminhao }, agora);
  const bloqueio = selo?.bloqueiaAtender ? selo.explicacao : null;
  const seloDe = (l: LinhaDoPedido) => (l.status === "aberto" || l.status === "atendido" ? selo : null);

  const atender = useMutation({
    mutationFn: async ({ linhaId, itemId }: { linhaId: string; itemId: string }) =>
      (await apiRequest("PATCH", `/api/pedidos-de-peca/linhas/${linhaId}/atender`, { itemId })).json(),
    onSuccess: () => { toast({ title: "Peça ligada à solicitação", description: "Quem solicitou foi avisado." }); setLigando(null); setPecaEscolhida(""); invalidarPedidos(); },
    onError: (e) => toast({ title: "Não deu para ligar a peça", description: mensagemDaApi(e), variant: "destructive" }),
  });

  const acaoComMotivo = useMutation({
    mutationFn: async ({ alvo: a, texto }: { alvo: AlvoDaAcao; texto: string }) => (await enviarAcaoComMotivo(a, texto)).json(),
    onSuccess: (_d, v) => { toast({ title: tituloDoAviso(v.alvo) }); setAlvo(null); invalidarPedidos(); },
    onError: (e) => toast({ title: "Não deu para concluir", description: mensagemDaApi(e), variant: "destructive" }),
  });

  const aceitarAjuste = useMutation({
    mutationFn: async (linha: LinhaDoPedido) =>
      (await apiRequest("PATCH", `/api/pedidos-de-peca/linhas/${linha.id}/ajuste/responder`, { aceitar: true })).json(),
    onSuccess: () => { toast({ title: "Ajuste aceito", description: "Quem pediu foi avisado. Ajuste a peça na lista." }); invalidarPedidos(); },
    onError: (e) => toast({ title: "Não deu para aceitar o ajuste", description: mensagemDaApi(e), variant: "destructive" }),
  });

  // Vindo da faixa de Eventos ou da página (?pedidos=1): rola até o painel.
  // Vindo de "Criar peça" na página (?criar=<linha>): abre o formulário direto.
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
    const pedido = pedidos.find((x) => x.linhas.some((l) => l.id === alvoCriar));
    const linha = pedido?.linhas.find((l) => l.id === alvoCriar);
    if (!pedido || !linha) return;
    if (!podeAtender) { toast({ title: "Criar peça a partir da solicitação é do perfil Solicitação e do admin", variant: "destructive" }); return; }
    if (bloqueio) { toast({ title: "Não dá para criar peça neste evento", description: bloqueio, variant: "destructive" }); return; }
    if (linha.status !== "aberto" && linha.status !== "atendido") { toast({ title: "Esta peça solicitada não está aberta", description: "Reabra a peça antes de criar.", variant: "destructive" }); return; }
    onCriarPeca(pedido, linha);
  }, [pedidos, podeAtender, bloqueio, onCriarPeca, toast]);

  const doEvento = (p: PedidoDePeca) => p.linhas.filter((l) => l.eventId === eventId);
  const todasDoEvento = pedidos.flatMap(doEvento);
  if (!podeVer || todasDoEvento.length === 0) return null;
  const ativas = (p: PedidoDePeca) => doEvento(p).filter((l) => l.status === "aberto" || l.status === "atendido");
  const resolvidas = (p: PedidoDePeca) => doEvento(p).filter((l) => l.status === "recusado" || l.status === "cancelado");
  const comAtivas = pedidos.filter((p) => ativas(p).length > 0)
    .sort((a, b) => (ativas(a).some((l) => l.status === "aberto") ? 0 : 1) - (ativas(b).some((l) => l.status === "aberto") ? 0 : 1));
  const comResolvidas = pedidos.filter((p) => resolvidas(p).length > 0);
  const qtdResolvidas = comResolvidas.reduce((s, p) => s + resolvidas(p).length, 0);
  const qtdAbertas = todasDoEvento.filter((l) => l.status === "aberto").length;
  const qtdAjustes = todasDoEvento.filter(ajustePendente).length;

  const pecasDoEvento = pecas.filter((i) => !i.deletedAt && i.status !== "cancelled");
  const opcoesDePeca = pecasDoEvento
    .filter((i) => !i.pedidoDePecaId && !i.pedidoDePecaLinhaId)
    .sort((a, b) => String(a.displayId ?? "").localeCompare(String(b.displayId ?? ""), "pt-BR", { numeric: true }))
    .map((i) => ({ value: i.id, label: `${i.displayId} · ${i.type}${i.description ? ` — ${i.description}` : ""} · ${i.quantity} un.` }));
  const jaAtendemOutras = pecasDoEvento.length - opcoesDePeca.length;

  const acoesDaLinha = (p: PedidoDePeca) => (l: LinhaDoPedido): AcaoDoCartao[] => {
    if (!podeAtender) return [];
    const semLivres = opcoesDePeca.length === 0 ? "Nenhuma peça livre neste evento" : null;
    if (l.status === "aberto") {
      return [
        { chave: "criar", rotulo: "Criar peça", tom: "criar", bloqueio, onClick: () => onCriarPeca(p, l), testId: `button-criar-peca-linha-${l.id}` },
        { chave: "ligar", rotulo: "Já criei a peça", tom: "secundario", bloqueio: bloqueio ?? semLivres, onClick: () => { setLigando(l.id); setPecaEscolhida(""); }, testId: `button-ligar-peca-linha-${l.id}` },
        { chave: "recusar", rotulo: "Recusar", tom: "perigo", onClick: () => setAlvo({ pedido: p, linha: l, acao: "recusar" }), testId: `button-recusar-linha-${l.id}` },
      ];
    }
    if (l.status === "atendido") {
      return [
        ...(ajustePendente(l) ? [
          { chave: "aceitar-ajuste", rotulo: "Aceitar ajuste", tom: "criar", bloqueio: aceitarAjuste.isPending ? "Salvando…" : null, onClick: () => aceitarAjuste.mutate(l), testId: `button-aceitar-ajuste-${l.id}` },
          { chave: "recusar-ajuste", rotulo: "Recusar ajuste", tom: "perigo", onClick: () => setAlvo({ pedido: p, linha: l, acao: "recusar-ajuste" }), testId: `button-recusar-ajuste-${l.id}` },
        ] as AcaoDoCartao[] : []),
        { chave: "outra", rotulo: "+ Outra peça", tom: "secundario", bloqueio, onClick: () => onCriarPeca(p, l), testId: `button-outra-peca-linha-${l.id}` },
        { chave: "ligar", rotulo: "Ligar peça existente", tom: "secundario", bloqueio: bloqueio ?? semLivres, onClick: () => { setLigando(l.id); setPecaEscolhida(""); }, testId: `button-ligar-peca-linha-${l.id}` },
      ];
    }
    if (l.status === "recusado") {
      return [{ chave: "reabrir", rotulo: "Reabrir", tom: "secundario", bloqueio, onClick: () => setAlvo({ pedido: p, linha: l, acao: "reabrir" }), testId: `button-reabrir-linha-${l.id}` }];
    }
    return [];
  };

  const escolherPeca = (l: LinhaDoPedido) => ligando === l.id ? (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ flex: "1 1 280px", minWidth: 0 }}>
          <FilterSelect kind="field" fullWidth hideWhenEmpty={false}
            label="Peça que atende a solicitação" allLabel="Escolha a peça…" showAllLabelWhenEmpty
            value={pecaEscolhida} onChange={setPecaEscolhida} options={opcoesDePeca}
            searchPlaceholder="Buscar por código, tipo ou descrição…" emptyText="Nenhuma peça livre."
            testId={`select-peca-linha-${l.id}`}
            triggerStyle={{ height: toque, borderRadius: R.md, border: "1px solid #d6d3d1", padding: "0 10px", fontSize: 13, background: "#fff", width: "100%" }} />
        </div>
        <button type="button" disabled={!pecaEscolhida || atender.isPending} onClick={() => atender.mutate({ linhaId: l.id, itemId: pecaEscolhida })}
          style={{ height: toque, padding: "0 12px", borderRadius: R.md, border: "none", fontSize: 12.5, fontWeight: 800, background: pecaEscolhida ? "#047857" : "#e7e5e4", color: pecaEscolhida ? "#fff" : "#78716c", cursor: pecaEscolhida ? "pointer" : "not-allowed" }}>
          {atender.isPending ? "Ligando…" : "Ligar à solicitação"}
        </button>
        <button type="button" onClick={() => setLigando(null)} style={{ height: toque, padding: "0 10px", border: "none", background: "none", color: "#57534e", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>Voltar</button>
      </div>
      {jaAtendemOutras > 0 && (
        <span style={{ fontSize: FS.small, color: "#57534e" }}>{jaAtendemOutras} {jaAtendemOutras === 1 ? "peça já atende outra solicitação e não aparece" : "peças já atendem outras solicitações e não aparecem"} na lista.</span>
      )}
    </div>
  ) : null;

  const pedidoDoDetalhe = detalhe ? pedidos.find((x) => x.id === detalhe) ?? null : null;

  return (
    <section
      id="pedidos-do-atendimento"
      data-testid="painel-pedidos-do-evento"
      aria-labelledby="titulo-pedidos-do-evento"
      style={{ backgroundColor: "#fff", border: "1px solid #e7e5e4", borderLeft: `3px solid ${qtdAbertas || qtdAjustes ? "#b45309" : "#d6d3d1"}`, borderRadius: R.lg, boxShadow: "0 1px 4px rgba(0,0,0,0.05)", marginBottom: 32, overflow: "hidden" }}
    >
      <div style={{ padding: "16px 20px 10px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <Inbox style={{ width: 16, height: 16, color: "#b45309", flexShrink: 0 }} aria-hidden="true" />
        <h2 id="titulo-pedidos-do-evento" style={{ margin: 0, fontSize: 13, fontWeight: 800, color: T.text, textTransform: "uppercase", letterSpacing: "0.04em" }}>
          Solicitações de peças
        </h2>
        <span style={{ backgroundColor: qtdAbertas ? "#fffbeb" : "#f5f5f4", color: qtdAbertas ? "#92400e" : "#57534e", border: `1px solid ${qtdAbertas ? "#fde68a" : "#e7e5e4"}`, borderRadius: R.pill, padding: "2px 10px", fontSize: FS.small, fontWeight: 800 }}>
          {qtdAbertas} {qtdAbertas === 1 ? "peça aberta" : "peças abertas"}
        </span>
        {qtdAjustes > 0 && (
          <span data-testid="chip-ajustes-do-evento" style={{ backgroundColor: "#fffbeb", color: "#92400e", border: "1px solid #fde68a", borderRadius: R.pill, padding: "2px 10px", fontSize: FS.small, fontWeight: 800 }}>
            {qtdAjustes} {qtdAjustes === 1 ? "ajuste pendente" : "ajustes pendentes"}
          </span>
        )}
        <SeloDoEventoChip selo={selo} pedidoId={eventId} />
        {!podeAtender && qtdAbertas > 0 && <span style={{ fontSize: FS.body, color: "#57534e" }}>Quem atende é a Solicitação.</span>}
      </div>

      {comAtivas.length > 0 && (
        <ul style={{ margin: 0, padding: 0, borderTop: "1px solid #f1f0ef" }}>
          {comAtivas.map((p) => (
            <CartaoDoPedido key={p.id} pedido={p} linhas={ativas(p)} agora={agora} seloDe={seloDe} mostrarEvento={false}
              acoesDaLinha={acoesDaLinha(p)} extraDaLinha={escolherPeca} onAbrir={() => setDetalhe(p.id)} />
          ))}
        </ul>
      )}

      {qtdResolvidas > 0 && (
        <div style={{ padding: "10px 20px 14px", borderTop: "1px solid #f1f0ef" }}>
          <button type="button" aria-expanded={verResolvidas} onClick={() => setVerResolvidas((v) => !v)} data-testid="button-ver-pedidos-resolvidos"
            style={{ border: "none", background: "none", padding: 0, minHeight: isMobile ? 44 : undefined, display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 800, color: "#57534e", cursor: "pointer" }}>
            <ChevronDown size={14} style={{ transform: verResolvidas ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
            {verResolvidas ? "Esconder" : "Ver"} {qtdResolvidas} {qtdResolvidas === 1 ? "peça recusada ou cancelada" : "peças recusadas ou canceladas"}
          </button>
          {verResolvidas && (
            <ul style={{ margin: "8px -20px 0", padding: 0 }}>
              {comResolvidas.map((p) => (
                <CartaoDoPedido key={p.id} pedido={p} linhas={resolvidas(p)} agora={agora} seloDe={seloDe} mostrarEvento={false}
                  acoesDaLinha={acoesDaLinha(p)} onAbrir={() => setDetalhe(p.id)} />
              ))}
            </ul>
          )}
        </div>
      )}

      <DetalheDoPedido
        pedido={pedidoDoDetalhe}
        agora={agora}
        seloDe={(l) => (l.eventId === eventId ? seloDe(l) : null)}
        acoesDaLinha={pedidoDoDetalhe
          ? (l) => (l.eventId === eventId ? acoesDaLinha(pedidoDoDetalhe)(l).filter((a) => a.chave !== "ligar") : [])
          : () => []}
        onFechar={() => setDetalhe(null)}
      />
      <MotivoDoPedidoDialog
        alvo={alvo}
        pendente={acaoComMotivo.isPending}
        onConfirmar={(texto) => { if (alvo) acaoComMotivo.mutate({ alvo, texto }); }}
        onFechar={() => setAlvo(null)}
      />
    </section>
  );
}
