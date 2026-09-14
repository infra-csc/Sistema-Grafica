// ─────────────────────────────────────────────────────────────────────────────
// PEDIDOS DE PEÇA — peças visuais compartilhadas pelas três telas (a aba do
// Atendimento, a caixa da Solicitação e o painel dentro do evento). Uma
// definição só de cada selo: o mesmo pedido tem a mesma cara em todo lugar.
// ─────────────────────────────────────────────────────────────────────────────
import { Link } from "wouter";
import {
  ETAPAS_DA_PECA,
  ehChaveDePedidos,
  etapaDaPeca,
  idadeDoPedido,
  pedidoEspera,
  prazoDoPedido,
  textoDaObservacao,
  unidadesCriadas,
  type PedidoDePeca,
  type SeloDoEvento,
  type StatusDoPedido,
} from "@shared/pedidos-de-peca";
import { queryClient } from "@/lib/queryClient";
import { miniatura } from "@/lib/miniatura";
import { T, FS, R } from "@/lib/theme";

export const TOM_DO_PEDIDO: Record<StatusDoPedido, { cor: string; fundo: string; borda: string }> = {
  aberto:    { cor: "#92400e", fundo: "#fffbeb", borda: "#fde68a" },
  atendido:  { cor: "#065f46", fundo: "#ecfdf5", borda: "#a7f3d0" },
  recusado:  { cor: "#991b1b", fundo: "#fef2f2", borda: "#fecaca" },
  cancelado: { cor: "#57534e", fundo: "#f5f5f4", borda: "#e7e5e4" },
};

export const invalidarPedidos = () =>
  queryClient.invalidateQueries({ predicate: (q) => ehChaveDePedidos(q.queryKey[0]) });

export const quandoFoi = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";

export const diaEMes = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "—";

export const diaDoEvento = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" }) : "";

/** Mensagem de erro da API ("409: {"error":"…"}") em frase legível. */
export function mensagemDaApi(e: unknown): string {
  const bruto = String((e as any)?.message ?? "Erro desconhecido");
  const i = bruto.indexOf("{");
  if (i >= 0) {
    try { const j = JSON.parse(bruto.slice(i)); if (j?.error) return j.error; } catch { /* segue */ }
  }
  return bruto.replace(/^\d{3}:\s*/, "");
}

export function EstadoDoPedido({ status }: { status: StatusDoPedido }) {
  const tom = TOM_DO_PEDIDO[status] ?? TOM_DO_PEDIDO.cancelado;
  const rotulos: Record<StatusDoPedido, string> = { aberto: "Aberta", atendido: "Atendida", recusado: "Recusada", cancelado: "Cancelada" };
  return (
    <span style={{ flexShrink: 0, fontSize: FS.small, fontWeight: 800, color: tom.cor, background: tom.fundo, border: `1px solid ${tom.borda}`, borderRadius: R.pill, padding: "2px 9px", whiteSpace: "nowrap" }}>
      {rotulos[status] ?? status}
    </span>
  );
}

/** Miniaturas das referências — do solicitante, não arte final (dito no
 *  título de cada uma e, onde cabe, uma vez na legenda). */
export function ReferenciasDoPedido({ urls, tamanho = 44, onRemover, legenda = false }: {
  urls: string[]; tamanho?: number; onRemover?: (i: number) => void; legenda?: boolean;
}) {
  if (urls.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {urls.map((url, i) => (
          <div key={`${url}-${i}`} style={{ position: "relative" }}>
            <a href={url} target="_blank" rel="noopener noreferrer" title="Referência do solicitante — não é arte final"
              style={{ display: "block", width: tamanho, height: tamanho, borderRadius: R.md, overflow: "hidden", border: "1px solid #e7e5e4", background: "#f5f5f4" }}>
              <img src={miniatura(url)} alt={`Referência ${i + 1}`} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </a>
            {onRemover && (
              <button type="button" onClick={() => onRemover(i)} aria-label={`Remover referência ${i + 1}`}
                style={{ position: "absolute", top: -8, right: -8, width: 24, height: 24, borderRadius: R.pill, border: "2px solid #fff", background: "#1c1917", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, lineHeight: 1 }}>
                ×
              </button>
            )}
          </div>
        ))}
      </div>
      {legenda && <span style={{ fontSize: FS.small, color: "#57534e" }}>Referência do solicitante — não é arte final</span>}
    </div>
  );
}

/** Há quanto tempo o pedido espera. Só em pedido aberto. */
export function IdadeDoPedido({ pedido, agora }: { pedido: PedidoDePeca; agora: Date }) {
  if (!pedidoEspera(pedido.status)) return null;
  const idade = idadeDoPedido(pedido.createdAt, agora);
  const cor = idade.nivel === "parado" ? "#b91c1c" : idade.nivel === "atencao" ? "#b45309" : "#57534e";
  return (
    <span data-testid={`cell-idade-pedido-${pedido.id}`} title={`Entrou em ${quandoFoi(pedido.createdAt)}`}
      style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end", lineHeight: 1.25, flexShrink: 0, textAlign: "right" }}>
      <span style={{ fontSize: FS.body, fontWeight: idade.nivel === "normal" ? 600 : 700, color: cor, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
        {idade.texto}
      </span>
      {idade.nivel === "parado" && <span style={{ fontSize: FS.micro, fontWeight: 700, color: "#b91c1c", whiteSpace: "nowrap" }}>solicitação parada</span>}
    </span>
  );
}

/** "precisa até 20/09" — vermelho vencido, âmbar a 3 dias. Só em aberto. */
export function PrazoDoPedido({ pedido, agora }: { pedido: PedidoDePeca; agora: Date }) {
  if (!pedidoEspera(pedido.status)) return null;
  const prazo = prazoDoPedido(pedido.precisaAte, agora);
  if (!prazo) return null;
  const tom = prazo.nivel === "vencido"
    ? { cor: "#991b1b", fundo: "#fef2f2", borda: "#fecaca" }
    : prazo.nivel === "perto"
      ? { cor: "#92400e", fundo: "#fffbeb", borda: "#fde68a" }
      : { cor: "#44403c", fundo: "#f5f5f4", borda: "#e7e5e4" };
  return (
    <span data-testid={`prazo-pedido-${pedido.id}`}
      style={{ display: "inline-flex", alignItems: "center", fontSize: FS.small, fontWeight: 700, whiteSpace: "nowrap", borderRadius: R.pill, padding: "1px 8px", color: tom.cor, background: tom.fundo, border: `1px solid ${tom.borda}` }}>
      {prazo.texto}
    </span>
  );
}

export function SeloDoEventoChip({ selo, pedidoId }: { selo: SeloDoEvento | null; pedidoId: string }) {
  if (!selo) return null;
  const caminhao = selo.tipo === "caminhao";
  return (
    <span data-testid={`selo-evento-${pedidoId}`} title={selo.explicacao}
      style={{ display: "inline-flex", alignItems: "center", fontSize: FS.small, fontWeight: 700, whiteSpace: "nowrap", borderRadius: R.pill, padding: "1px 8px",
        color: caminhao ? "#92400e" : "#57534e", background: caminhao ? "#fffbeb" : "#f5f5f4", border: `1px solid ${caminhao ? "#fde68a" : "#e7e5e4"}` }}>
      {selo.texto}
    </span>
  );
}

export function ObservacaoDoPedido({ valor }: { valor: unknown }) {
  const texto = textoDaObservacao(valor);
  if (!texto) return null;
  return (
    <p style={{ margin: 0, fontSize: FS.body, color: "#44403c", lineHeight: 1.5, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
      “{texto}”
    </p>
  );
}

/** O que o solicitante descreveu além do texto (tipo e medida), quando sabe. */
export function EspecificacaoDoPedido({ pedido }: { pedido: PedidoDePeca }) {
  const medida = pedido.largura && pedido.altura
    ? `${Number(pedido.largura).toLocaleString("pt-BR")} × ${Number(pedido.altura).toLocaleString("pt-BR")} m`
    : null;
  if (!pedido.tipoDePeca && !medida) return null;
  return (
    <span style={{ fontSize: FS.body, color: T.text, fontWeight: 600 }}>
      {[pedido.tipoDePeca, medida].filter(Boolean).join(" · ")}
    </span>
  );
}

/**
 * O PEDIDO QUE SE ACOMPANHA SOZINHO: cada peça que saiu do pedido, com o
 * andamento (Criação → Aprovação → Produção → Conferência → Entregue) e a
 * quantidade pedida × criada quando divergem.
 */
export function AndamentoDoPedido({ pedido }: { pedido: PedidoDePeca }) {
  if (pedido.status !== "atendido") return null;
  const pecas = pedido.pecas ?? [];
  const criadas = unidadesCriadas(pecas);
  return (
    <div data-testid={`andamento-pedido-${pedido.id}`} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <p style={{ margin: 0, fontSize: FS.body, color: "#065f46", lineHeight: 1.5 }}>
        Atendida em {diaEMes(pedido.resolvidoEm)}{pedido.resolvidoPor ? ` por ${pedido.resolvidoPor}` : ""}
        {pecas.length === 0
          ? " · a peça foi removida da lista"
          : ` · ${pecas.length} ${pecas.length === 1 ? "peça" : "peças"}`}
        {pecas.length > 0 && criadas !== pedido.quantidade && (
          <strong data-testid={`divergencia-pedido-${pedido.id}`} style={{ color: "#92400e", fontWeight: 700 }}>
            {" "}· pediu {pedido.quantidade} un., {criadas < pedido.quantidade ? "criadas só" : "criadas"} {criadas} un.
          </strong>
        )}
      </p>
      {pecas.map((p) => {
        const etapa = etapaDaPeca(p.status);
        return (
          <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", minWidth: 0 }}>
            <Link href={`/eventos/${pedido.eventId}?item=${p.id}`} data-testid={`link-peca-gerada-${p.id}`}
              style={{ fontFamily: "'DM Mono', monospace", fontSize: FS.body, fontWeight: 800, color: "#065f46", textDecoration: "underline", textUnderlineOffset: 2 }}>
              {p.displayId ?? "abrir"}
            </Link>
            <span style={{ fontSize: FS.body, color: "#44403c", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220 }}>
              {p.type} · {p.quantity} un.
            </span>
            {etapa === null ? (
              <span style={{ fontSize: FS.small, fontWeight: 700, color: "#991b1b" }}>peça cancelada</span>
            ) : (
              <ol aria-label={`Andamento da peça: ${ETAPAS_DA_PECA[etapa]}`} style={{ display: "flex", alignItems: "center", gap: 4, listStyle: "none", margin: 0, padding: 0 }}>
                {ETAPAS_DA_PECA.map((nome, i) => (
                  <li key={nome} title={nome} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span aria-hidden="true" style={{ width: i === etapa ? 10 : 8, height: i === etapa ? 10 : 8, borderRadius: R.pill, background: i <= etapa ? "#047857" : "#d6d3d1" }} />
                    {i === etapa && <span style={{ fontSize: FS.small, fontWeight: 700, color: "#065f46" }}>{nome}</span>}
                  </li>
                ))}
              </ol>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** O ajuste que o Atendimento pediu depois de atendida, e a resposta. */
export function AjusteDoPedido({ pedido }: { pedido: PedidoDePeca }) {
  if (!pedido.ajusteStatus || !pedido.ajusteTexto) return null;
  const tom = pedido.ajusteStatus === "pendente"
    ? { cor: "#92400e", fundo: "#fffbeb", borda: "#fde68a", titulo: "Ajuste esperando resposta" }
    : pedido.ajusteStatus === "aceito"
      ? { cor: "#065f46", fundo: "#ecfdf5", borda: "#a7f3d0", titulo: "Ajuste aceito" }
      : { cor: "#991b1b", fundo: "#fef2f2", borda: "#fecaca", titulo: "Ajuste recusado" };
  return (
    <div data-testid={`ajuste-pedido-${pedido.id}`} style={{ padding: "8px 12px", borderRadius: R.md, background: tom.fundo, border: `1px solid ${tom.borda}`, display: "flex", flexDirection: "column", gap: 3 }}>
      <span style={{ fontSize: FS.small, fontWeight: 800, color: tom.cor }}>
        {tom.titulo} · pedido por {pedido.ajustePedidoPor ?? "—"} em {quandoFoi(pedido.ajustePedidoEm)}
      </span>
      <span style={{ fontSize: FS.body, color: "#44403c", lineHeight: 1.5, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>“{pedido.ajusteTexto}”</span>
      {pedido.ajusteStatus !== "pendente" && (
        <span style={{ fontSize: FS.small, color: tom.cor, fontWeight: 600, overflowWrap: "anywhere" }}>
          {pedido.ajusteStatus === "aceito" ? "Aceito" : "Recusado"}{pedido.ajusteRespondidoPor ? ` por ${pedido.ajusteRespondidoPor}` : ""} em {quandoFoi(pedido.ajusteRespondidoEm)}{pedido.ajusteResposta ? `: ${pedido.ajusteResposta}` : ""}
        </span>
      )}
    </div>
  );
}

export function ListaCarregando({ linhas = 3 }: { linhas?: number }) {
  return (
    <div aria-busy="true" data-testid="skeleton-pedidos" style={{ padding: "8px 16px" }}>
      {Array.from({ length: linhas }, (_, i) => (
        <div key={i} className="animate-pulse" style={{ display: "flex", flexDirection: "column", gap: 8, padding: "14px 0", borderBottom: i < linhas - 1 ? "1px solid #f1f0ef" : "none" }}>
          <div style={{ width: "45%", height: 12, borderRadius: 6, background: "#e7e5e4" }} />
          <div style={{ width: "80%", height: 10, borderRadius: 6, background: "#f0efee" }} />
          <div style={{ width: "30%", height: 10, borderRadius: 6, background: "#f0efee" }} />
        </div>
      ))}
    </div>
  );
}
