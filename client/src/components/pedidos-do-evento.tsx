// ─────────────────────────────────────────────────────────────────────────────
// PEDIDOS DO ATENDIMENTO — dentro do evento, para quem monta a lista (14/09).
//
// Cada pedido aberto tem três saídas:
//   · Criar peça — abre o formulário de peça já preenchido (quantidade,
//     observação, referência); ao salvar, a peça fica ligada ao pedido e
//     recebe o patrocinador e todas as referências (event-detail + servidor);
//   · Já criei a peça — liga o pedido a uma peça que já está na lista;
//   · Recusar — com o motivo, que volta para o Atendimento.
// Resolvidos ficam recolhidos embaixo, como histórico.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ChevronDown, Inbox, Plus } from "lucide-react";
import { ROTULO_DO_PEDIDO, type PedidoDePeca } from "@shared/pedidos-de-peca";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ReferenciasDoPedido, TOM_DO_PEDIDO, invalidarPedidos, quandoFoi } from "@/components/pedidos-de-peca-atendimento";

const BOTAO: React.CSSProperties = { height: 34, padding: "0 12px", borderRadius: 8, fontSize: 12.5, fontWeight: 800, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" };

export function PedidosDoEvento({ eventId, pecas, podeAtender, eventoFinalizado, onCriarPeca }: {
  eventId: string;
  pecas: any[];
  /** solicitacao | admin — a régua do servidor. */
  podeAtender: boolean;
  eventoFinalizado: boolean;
  onCriarPeca: (pedido: PedidoDePeca) => void;
}) {
  const { toast } = useToast();
  const [acao, setAcao] = useState<{ id: string; tipo: "ligar" | "recusar" } | null>(null);
  const [pecaEscolhida, setPecaEscolhida] = useState("");
  const [motivo, setMotivo] = useState("");
  const [verResolvidos, setVerResolvidos] = useState(false);

  const { data: pedidos = [] } = useQuery<PedidoDePeca[]>({
    queryKey: [`/api/pedidos-de-peca?eventId=${eventId}`],
    enabled: !!eventId,
  });

  const fecharAcao = () => { setAcao(null); setPecaEscolhida(""); setMotivo(""); };

  const atender = useMutation({
    mutationFn: async ({ id, itemId }: { id: string; itemId: string }) =>
      (await apiRequest("PATCH", `/api/pedidos-de-peca/${id}/atender`, { itemId })).json(),
    onSuccess: () => { toast({ title: "Pedido atendido", description: "O Atendimento foi avisado." }); fecharAcao(); invalidarPedidos(); },
    onError: (e: Error) => toast({ title: "Não deu para atender", description: e.message, variant: "destructive" }),
  });

  const recusar = useMutation({
    mutationFn: async ({ id, motivo }: { id: string; motivo: string }) =>
      (await apiRequest("PATCH", `/api/pedidos-de-peca/${id}/recusar`, { motivo })).json(),
    onSuccess: () => { toast({ title: "Pedido recusado", description: "O Atendimento recebeu o motivo." }); fecharAcao(); invalidarPedidos(); },
    onError: (e: Error) => toast({ title: "Não deu para recusar", description: e.message, variant: "destructive" }),
  });

  if (pedidos.length === 0) return null;
  const abertos = pedidos.filter((p) => p.status === "aberto");
  const resolvidos = pedidos.filter((p) => p.status !== "aberto");
  const pecasDoEvento = pecas
    .filter((i) => !i.deletedAt && i.status !== "cancelled")
    .sort((a, b) => String(a.displayId ?? "").localeCompare(String(b.displayId ?? ""), "pt-BR", { numeric: true }));
  const podeAgir = podeAtender && !eventoFinalizado;

  return (
    <section
      data-testid="painel-pedidos-do-evento"
      aria-labelledby="titulo-pedidos-do-evento"
      style={{ backgroundColor: "#fff", border: "1px solid #e7e5e4", borderLeft: `3px solid ${abertos.length ? "#b45309" : "#d6d3d1"}`, borderRadius: 12, boxShadow: "0 1px 4px rgba(0,0,0,0.05)", marginBottom: 32 }}
    >
      <div style={{ padding: "18px 22px 12px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <Inbox style={{ width: 16, height: 16, color: "#b45309", flexShrink: 0 }} aria-hidden="true" />
        <h2 id="titulo-pedidos-do-evento" style={{ margin: 0, fontSize: 13, fontWeight: 800, color: "#1F1D1A", fontFamily: "'Space Grotesk', sans-serif", textTransform: "uppercase", letterSpacing: "0.04em" }}>
          Pedidos do Atendimento
        </h2>
        <span style={{ backgroundColor: abertos.length ? "#fffbeb" : "#f5f5f4", color: abertos.length ? "#b45309" : "#57534e", border: `1px solid ${abertos.length ? "#fde68a" : "#e7e5e4"}`, borderRadius: 999, padding: "2px 10px", fontSize: 11, fontWeight: 800 }}>
          {abertos.length} {abertos.length === 1 ? "aberto" : "abertos"}
        </span>
        {!podeAtender && abertos.length > 0 && (
          <span style={{ fontSize: 12, color: "#746e69" }}>Quem atende é a Solicitação.</span>
        )}
      </div>

      {abertos.length > 0 && (
        <ul style={{ listStyle: "none", margin: 0, padding: "0 22px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
          {abertos.map((p) => {
            const aberta = acao?.id === p.id ? acao.tipo : null;
            return (
              <li key={p.id} data-testid={`pedido-evento-${p.id}`} style={{ border: "1px solid #fde68a", background: "#fffdf7", borderRadius: 10, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                  <strong style={{ fontSize: 15, color: "#1c1917" }}>{p.quantidade} un.</strong>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#1c1917" }}>{p.sponsorName ?? "Patrocinador removido"}</span>
                  <span style={{ fontSize: 12, color: "#746e69" }}>· pedido por {p.pedidoPor ?? "—"} · {quandoFoi(p.createdAt)}</span>
                </div>
                <p style={{ margin: 0, fontSize: 13.5, color: "#44403c", lineHeight: 1.5, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{p.observacao}</p>
                <ReferenciasDoPedido urls={p.referencias ?? []} tamanho={52} />

                {podeAgir && !aberta && (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 2 }}>
                    <button type="button" data-testid={`button-criar-peca-pedido-${p.id}`} onClick={() => onCriarPeca(p)}
                      style={{ ...BOTAO, border: "none", background: "#b45309", color: "#fff" }}>
                      <Plus size={14} /> Criar peça
                    </button>
                    <button type="button" data-testid={`button-ligar-peca-pedido-${p.id}`} onClick={() => { setAcao({ id: p.id, tipo: "ligar" }); setPecaEscolhida(""); }}
                      disabled={pecasDoEvento.length === 0}
                      title={pecasDoEvento.length === 0 ? "O evento ainda não tem peças" : undefined}
                      style={{ ...BOTAO, border: "1px solid #e7e5e4", background: "#fff", color: "#1c1917", opacity: pecasDoEvento.length === 0 ? 0.5 : 1 }}>
                      Já criei a peça
                    </button>
                    <button type="button" data-testid={`button-recusar-pedido-${p.id}`} onClick={() => { setAcao({ id: p.id, tipo: "recusar" }); setMotivo(""); }}
                      style={{ ...BOTAO, border: "1px solid #fecaca", background: "#fff", color: "#b91c1c" }}>
                      Recusar
                    </button>
                  </div>
                )}

                {aberta === "ligar" && (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <select aria-label="Peça que atende o pedido" data-testid={`select-peca-pedido-${p.id}`} value={pecaEscolhida} onChange={(e) => setPecaEscolhida(e.target.value)}
                      style={{ flex: "1 1 260px", minWidth: 0, height: 36, borderRadius: 8, border: "1px solid #d6d3d1", padding: "0 10px", fontSize: 13, background: "#fff" }}>
                      <option value="">Escolha a peça…</option>
                      {pecasDoEvento.map((i) => (
                        <option key={i.id} value={i.id}>{i.displayId} · {i.type}{i.description ? ` — ${i.description}` : ""} · {i.quantity} un.</option>
                      ))}
                    </select>
                    <button type="button" disabled={!pecaEscolhida || atender.isPending} onClick={() => atender.mutate({ id: p.id, itemId: pecaEscolhida })}
                      style={{ ...BOTAO, border: "none", background: pecaEscolhida ? "#047857" : "#e7e5e4", color: pecaEscolhida ? "#fff" : "#a8a29e", cursor: pecaEscolhida ? "pointer" : "not-allowed" }}>
                      {atender.isPending ? "Ligando…" : "Marcar como atendido"}
                    </button>
                    <button type="button" onClick={fecharAcao} style={{ ...BOTAO, border: "none", background: "none", color: "#57534e" }}>Voltar</button>
                  </div>
                )}

                {aberta === "recusar" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <textarea aria-label="Motivo da recusa" data-testid={`input-motivo-recusa-${p.id}`} value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2}
                      placeholder="Por que o pedido não vai entrar na lista? O Atendimento recebe esta frase."
                      style={{ width: "100%", boxSizing: "border-box", borderRadius: 8, border: "1px solid #d6d3d1", padding: "8px 10px", fontSize: 13, fontFamily: "inherit", resize: "vertical" }} />
                    <div style={{ display: "flex", gap: 8 }}>
                      <button type="button" disabled={motivo.trim().length < 3 || recusar.isPending} onClick={() => recusar.mutate({ id: p.id, motivo: motivo.trim() })}
                        style={{ ...BOTAO, border: "none", background: motivo.trim().length >= 3 ? "#b91c1c" : "#e7e5e4", color: motivo.trim().length >= 3 ? "#fff" : "#a8a29e", cursor: motivo.trim().length >= 3 ? "pointer" : "not-allowed" }}>
                        {recusar.isPending ? "Recusando…" : "Recusar pedido"}
                      </button>
                      <button type="button" onClick={fecharAcao} style={{ ...BOTAO, border: "none", background: "none", color: "#57534e" }}>Voltar</button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {resolvidos.length > 0 && (
        <div style={{ padding: "0 22px 16px" }}>
          <button type="button" aria-expanded={verResolvidos} onClick={() => setVerResolvidos((v) => !v)} data-testid="button-ver-pedidos-resolvidos"
            style={{ border: "none", background: "none", padding: 0, display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 800, color: "#57534e", cursor: "pointer" }}>
            <ChevronDown size={14} style={{ transform: verResolvidos ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
            {verResolvidos ? "Esconder" : "Ver"} {resolvidos.length} {resolvidos.length === 1 ? "pedido resolvido" : "pedidos resolvidos"}
          </button>
          {verResolvidos && (
            <ul style={{ listStyle: "none", margin: "10px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
              {resolvidos.map((p) => {
                const tom = TOM_DO_PEDIDO[p.status] ?? TOM_DO_PEDIDO.cancelado;
                return (
                  <li key={p.id} style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap", fontSize: 12.5, color: "#44403c" }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: tom.cor, background: tom.fundo, border: `1px solid ${tom.borda}`, borderRadius: 999, padding: "1px 8px" }}>{ROTULO_DO_PEDIDO[p.status]}</span>
                    <span><strong>{p.quantidade} un.</strong> · {p.sponsorName ?? "—"} · {p.observacao.length > 90 ? `${p.observacao.slice(0, 90)}…` : p.observacao}</span>
                    {p.status === "atendido" && <span style={{ color: "#065f46" }}>→ {p.itemDisplayId ?? "—"}</span>}
                    {p.status === "recusado" && <span style={{ color: "#991b1b" }}>— {p.motivoRecusa}</span>}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
