// ─────────────────────────────────────────────────────────────────────────────
// PEDIDOS DO ATENDIMENTO — dentro do evento, para quem monta a lista (14/09).
//
// Cada pedido aberto tem três saídas:
//   · Criar peça — abre o formulário de peça já preenchido; ao salvar, a peça
//     fica ligada ao pedido e recebe o patrocinador e as referências;
//   · Já criei a peça — liga o pedido a uma peça que já está na lista;
//   · Recusar — num modal, com motivo, que volta para o Atendimento.
//
// Evento que não aceita mais peça (encerrado ou já realizado): os botões que
// criam peça ficam VISÍVEIS e desabilitados, com o motivo — sumir com eles
// deixaria a ausência sem explicação. Recusar continua valendo.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ChevronDown, Inbox, Plus } from "lucide-react";
import {
  ROTULO_DO_PEDIDO,
  quantidadeDoPedido,
  seloDoEventoDoPedido,
  type PedidoDePeca,
} from "@shared/pedidos-de-peca";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { T, FS, R } from "@/lib/theme";
import { MotivoDoPedidoDialog } from "@/components/motivo-do-pedido-dialog";
import {
  IdadeDoPedido,
  LinhaDoAtendimento,
  ObservacaoDoPedido,
  ReferenciasDoPedido,
  SeloDoEventoChip,
  SeloDoQueFalta,
  TOM_DO_PEDIDO,
  invalidarPedidos,
  quandoFoi,
} from "@/components/pedidos-de-peca-atendimento";

export function PedidosDoEvento({ eventId, pecas, podeAtender, motivoEventoFim, saidaDoCaminhao, onCriarPeca }: {
  eventId: string;
  pecas: any[];
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
  const [recusando, setRecusando] = useState<PedidoDePeca | null>(null);
  const [verResolvidos, setVerResolvidos] = useState(false);
  const agora = new Date();
  const alvo = isMobile ? 44 : 34;

  const { data: pedidos = [] } = useQuery<PedidoDePeca[]>({
    queryKey: [`/api/pedidos-de-peca?eventId=${eventId}`],
    enabled: !!eventId,
  });

  const atender = useMutation({
    mutationFn: async ({ id, itemId }: { id: string; itemId: string }) =>
      (await apiRequest("PATCH", `/api/pedidos-de-peca/${id}/atender`, { itemId })).json(),
    onSuccess: () => { toast({ title: "Pedido atendido", description: "O Atendimento foi avisado." }); setLigando(null); setPecaEscolhida(""); invalidarPedidos(); },
    onError: (e: Error) => toast({ title: "Não deu para atender", description: e.message, variant: "destructive" }),
  });

  const recusar = useMutation({
    mutationFn: async ({ id, motivo }: { id: string; motivo: string }) =>
      (await apiRequest("PATCH", `/api/pedidos-de-peca/${id}/recusar`, { motivo })).json(),
    onSuccess: () => { toast({ title: "Pedido recusado", description: "O Atendimento recebeu o motivo." }); setRecusando(null); invalidarPedidos(); },
    onError: (e: Error) => toast({ title: "Não deu para recusar", description: e.message, variant: "destructive" }),
  });

  if (pedidos.length === 0) return null;
  const abertos = pedidos.filter((p) => p.status === "aberto");
  const resolvidos = pedidos.filter((p) => p.status !== "aberto");
  const pecasDoEvento = pecas
    .filter((i) => !i.deletedAt && i.status !== "cancelled")
    .sort((a, b) => String(a.displayId ?? "").localeCompare(String(b.displayId ?? ""), "pt-BR", { numeric: true }));
  const selo = seloDoEventoDoPedido({ motivoFim: motivoEventoFim, saida: saidaDoCaminhao }, agora);
  const bloqueio = selo?.bloqueiaAtender ? selo.explicacao : null;

  const BOTAO: React.CSSProperties = { height: alvo, padding: "0 12px", borderRadius: R.md, fontSize: 12.5, fontWeight: 800, display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" };

  return (
    <section
      data-testid="painel-pedidos-do-evento"
      aria-labelledby="titulo-pedidos-do-evento"
      style={{ backgroundColor: "#fff", border: "1px solid #e7e5e4", borderLeft: `3px solid ${abertos.length ? "#b45309" : "#d6d3d1"}`, borderRadius: R.lg, boxShadow: "0 1px 4px rgba(0,0,0,0.05)", marginBottom: 32 }}
    >
      <div style={{ padding: "18px 22px 12px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <Inbox style={{ width: 16, height: 16, color: "#b45309", flexShrink: 0 }} aria-hidden="true" />
        <h2 id="titulo-pedidos-do-evento" style={{ margin: 0, fontSize: 13, fontWeight: 800, color: "#1F1D1A", fontFamily: "'Space Grotesk', sans-serif", textTransform: "uppercase", letterSpacing: "0.04em" }}>
          Pedidos do Atendimento
        </h2>
        <span style={{ backgroundColor: abertos.length ? "#fffbeb" : "#f5f5f4", color: abertos.length ? "#92400e" : "#57534e", border: `1px solid ${abertos.length ? "#fde68a" : "#e7e5e4"}`, borderRadius: R.pill, padding: "2px 10px", fontSize: FS.small, fontWeight: 800 }}>
          {abertos.length} {abertos.length === 1 ? "aberto" : "abertos"}
        </span>
        {abertos.length > 0 && <SeloDoEventoChip selo={selo} pedidoId={eventId} />}
        {!podeAtender && abertos.length > 0 && (
          <span style={{ fontSize: FS.body, color: "#57534e" }}>Quem atende é a Solicitação.</span>
        )}
      </div>

      {abertos.length > 0 && (
        <ul style={{ listStyle: "none", margin: 0, padding: "0 22px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
          {abertos.map((p) => {
            const estaLigando = ligando === p.id;
            const patrocinador = p.sponsorName ?? "sem patrocinador";
            return (
              <li key={p.id} data-testid={`pedido-evento-${p.id}`} style={{ border: "1px solid #fde68a", background: "#fffdf7", borderRadius: R.lg, padding: "12px 14px", display: "flex", gap: 12, alignItems: "flex-start" }}>
                <div style={{ flex: "1 1 auto", minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    <strong style={{ flexShrink: 0, fontSize: 15, color: p.quantidade == null ? "#57534e" : T.text }}>{quantidadeDoPedido(p.quantidade)}</strong>
                    <span title={patrocinador} style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 14, fontWeight: 700, color: T.text }}>{patrocinador}</span>
                    <SeloDoQueFalta pedido={p} />
                  </div>
                  <ObservacaoDoPedido valor={p.observacao} />
                  <ReferenciasDoPedido urls={p.referencias ?? []} tamanho={52} />
                  <span style={{ fontSize: FS.small, color: "#57534e" }}>Pedido por {p.pedidoPor ?? "—"} · entrou em {quandoFoi(p.createdAt)}</span>

                  {podeAtender && !estaLigando && (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 2 }}>
                      <button type="button" data-testid={`button-criar-peca-pedido-${p.id}`} onClick={() => onCriarPeca(p)}
                        disabled={!!bloqueio} title={bloqueio ?? undefined}
                        style={{ ...BOTAO, border: "none", background: bloqueio ? "#e7e5e4" : "#b45309", color: bloqueio ? "#78716c" : "#fff", cursor: bloqueio ? "not-allowed" : "pointer" }}>
                        <Plus size={14} /> Criar peça
                      </button>
                      <button type="button" data-testid={`button-ligar-peca-pedido-${p.id}`} onClick={() => { setLigando(p.id); setPecaEscolhida(""); }}
                        disabled={!!bloqueio || pecasDoEvento.length === 0}
                        title={bloqueio ?? (pecasDoEvento.length === 0 ? "O evento ainda não tem peças" : undefined)}
                        style={{ ...BOTAO, border: "1px solid #e7e5e4", background: "#fff", color: bloqueio || pecasDoEvento.length === 0 ? "#78716c" : T.text, cursor: bloqueio || pecasDoEvento.length === 0 ? "not-allowed" : "pointer" }}>
                        Já criei a peça
                      </button>
                      <button type="button" data-testid={`button-recusar-pedido-${p.id}`} onClick={() => setRecusando(p)}
                        style={{ ...BOTAO, border: "1px solid #fecaca", background: "#fff", color: "#b91c1c", cursor: "pointer" }}>
                        Recusar
                      </button>
                    </div>
                  )}

                  {estaLigando && (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <select aria-label="Peça que atende o pedido" data-testid={`select-peca-pedido-${p.id}`} value={pecaEscolhida} onChange={(e) => setPecaEscolhida(e.target.value)}
                        style={{ flex: "1 1 260px", minWidth: 0, height: alvo, borderRadius: R.md, border: "1px solid #d6d3d1", padding: "0 10px", fontSize: 13, background: "#fff" }}>
                        <option value="">Escolha a peça…</option>
                        {pecasDoEvento.map((i) => (
                          <option key={i.id} value={i.id}>{i.displayId} · {i.type}{i.description ? ` — ${i.description}` : ""} · {i.quantity} un.</option>
                        ))}
                      </select>
                      <button type="button" disabled={!pecaEscolhida || atender.isPending} onClick={() => atender.mutate({ id: p.id, itemId: pecaEscolhida })}
                        style={{ ...BOTAO, border: "none", background: pecaEscolhida ? "#047857" : "#e7e5e4", color: pecaEscolhida ? "#fff" : "#78716c", cursor: pecaEscolhida ? "pointer" : "not-allowed" }}>
                        {atender.isPending ? "Ligando…" : "Marcar como atendido"}
                      </button>
                      <button type="button" onClick={() => setLigando(null)} style={{ ...BOTAO, border: "none", background: "none", color: "#57534e", cursor: "pointer" }}>Voltar</button>
                    </div>
                  )}
                </div>
                <IdadeDoPedido pedido={p} agora={agora} />
              </li>
            );
          })}
        </ul>
      )}

      {resolvidos.length > 0 && (
        <div style={{ padding: "0 22px 16px" }}>
          <button type="button" aria-expanded={verResolvidos} onClick={() => setVerResolvidos((v) => !v)} data-testid="button-ver-pedidos-resolvidos"
            style={{ border: "none", background: "none", padding: 0, minHeight: isMobile ? 44 : undefined, display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 800, color: "#57534e", cursor: "pointer" }}>
            <ChevronDown size={14} style={{ transform: verResolvidos ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
            {verResolvidos ? "Esconder" : "Ver"} {resolvidos.length} {resolvidos.length === 1 ? "pedido resolvido" : "pedidos resolvidos"}
          </button>
          {verResolvidos && (
            <ul style={{ listStyle: "none", margin: "10px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
              {resolvidos.map((p) => {
                const tom = TOM_DO_PEDIDO[p.status] ?? TOM_DO_PEDIDO.cancelado;
                return (
                  <li key={p.id} style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: FS.body, color: "#44403c" }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", minWidth: 0 }}>
                      <span style={{ flexShrink: 0, fontSize: FS.small, fontWeight: 800, color: tom.cor, background: tom.fundo, border: `1px solid ${tom.borda}`, borderRadius: R.pill, padding: "1px 8px" }}>{ROTULO_DO_PEDIDO[p.status]}</span>
                      <strong style={{ flexShrink: 0 }}>{quantidadeDoPedido(p.quantidade)}</strong>
                      <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.sponsorName ?? "sem patrocinador"}</span>
                    </div>
                    <LinhaDoAtendimento pedido={p} />
                    {p.status === "recusado" && <span style={{ color: "#991b1b" }}>Recusado: {p.motivoRecusa}</span>}
                    {p.status === "cancelado" && <span style={{ color: "#57534e" }}>Cancelado pelo Atendimento{p.motivoCancelamento ? `: ${p.motivoCancelamento}` : ""}</span>}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      <MotivoDoPedidoDialog
        pedido={recusando}
        titulo="Recusar pedido"
        aviso="O Atendimento é notificado com este motivo."
        rotuloConfirmar="Recusar pedido"
        pendente={recusar.isPending}
        onConfirmar={(motivo) => { if (recusando) recusar.mutate({ id: recusando.id, motivo }); }}
        onFechar={() => setRecusando(null)}
      />
    </section>
  );
}
