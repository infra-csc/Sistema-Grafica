// ─────────────────────────────────────────────────────────────────────────────
// DETALHE DO PEDIDO — tudo sobre um pedido, com o histórico (dono, 14/09).
//
// "Um modal para as solicitações, com histórico e tudo mais, para detalhar."
// À esquerda o pedido inteiro (campos, texto, referências grandes, peças que
// saíram e o andamento de cada uma); à direita a linha do tempo — criado,
// editado, atendido, peça a mais, recusado, cancelado, reaberto — lida da
// trilha de auditoria do pedido. As ações são as mesmas do cartão.
// ─────────────────────────────────────────────────────────────────────────────
import { useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Inbox } from "lucide-react";
import {
  quantidadeDoPedido,
  textoDaObservacao,
  unidadesCriadas,
  type PedidoDePeca,
  type SeloDoEvento,
} from "@shared/pedidos-de-peca";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { HIDE_NATIVE_CLOSE, ModalHeader, modalSurface } from "@/components/modal-shell";
import { useIsMobile } from "@/hooks/use-mobile";
import { T, FS, R } from "@/lib/theme";
import { BotaoDoCartao, type AcaoDoCartao } from "@/components/pedidos/cartao-do-pedido";
import {
  AndamentoDoPedido,
  EstadoDoPedido,
  PrazoDoPedido,
  ReferenciasDoPedido,
  SeloDoEventoChip,
  diaDoEvento,
  quandoFoi,
} from "@/components/pedidos/ui";

type RegistroDeAuditoria = { id: string; action: string; details: string | null; userName: string | null; createdAt: string };

const TITULO_DA_SECAO: React.CSSProperties = { margin: "0 0 8px", fontSize: FS.small, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "#57534e" };

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div style={{ minWidth: 0 }}>
      <dt style={{ fontSize: FS.small, fontWeight: 700, color: "#57534e", marginBottom: 2 }}>{rotulo}</dt>
      <dd style={{ margin: 0, fontSize: FS.body, color: T.text, fontWeight: 600, overflowWrap: "anywhere" }}>{children}</dd>
    </div>
  );
}

/** A frase do registro, sem o prefixo técnico repetido. */
const fraseDoRegistro = (r: RegistroDeAuditoria) => {
  if (r.action === "created") return "Solicitação criada";
  return r.details?.trim() || "Solicitação atualizada";
};

const saidaDoCaminhao = (d: string | null | undefined) => {
  if (!d) return null;
  const iso = new Date(d).toISOString();
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)} às ${iso.slice(11, 16)}`;
};

export function DetalheDoPedido({ pedido, agora, selo, acoes, onFechar }: {
  pedido: PedidoDePeca | null;
  agora: Date;
  selo: SeloDoEvento | null;
  acoes: AcaoDoCartao[];
  onFechar: () => void;
}) {
  const isMobile = useIsMobile();
  // Durante o fade de saída o pedido já é null: mantém o último na tela.
  const ultimo = useRef<PedidoDePeca | null>(pedido);
  if (pedido) ultimo.current = pedido;
  const p = pedido ?? ultimo.current;

  const { data: registros = [], isLoading, isError } = useQuery<RegistroDeAuditoria[]>({
    queryKey: [`/api/audit-logs?entityType=pedido_de_peca&entityId=${p?.id ?? ""}&limit=100`],
    enabled: !!pedido,
  });
  const historico = (Array.isArray(registros) ? registros : [])
    .slice()
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  if (!p) return null;
  const medida = p.largura && p.altura ? `${Number(p.largura).toLocaleString("pt-BR")} × ${Number(p.altura).toLocaleString("pt-BR")} m` : null;
  // Servidor antigo (sem reiniciar) ou cache velho podem mandar sem estas listas.
  const pecas = p.pecas ?? [];
  const referencias = p.referencias ?? [];
  const criadas = unidadesCriadas(pecas);
  const alvo = isMobile ? 44 : 38;

  return (
    <Dialog open={!!pedido} onOpenChange={(aberto) => { if (!aberto) onFechar(); }}>
      <DialogContent data-testid="detalhe-do-pedido" className={HIDE_NATIVE_CLOSE} style={modalSurface(1000)}>
        <DialogTitle className="sr-only">Solicitação de peça — {p.sponsorName ?? "sem patrocinador"}</DialogTitle>
        <DialogDescription className="sr-only">{p.eventName ?? "Evento"}</DialogDescription>
        <ModalHeader
          icon={Inbox}
          tint="#b45309"
          title={`${quantidadeDoPedido(p.quantidade)} · ${p.sponsorName ?? "Patrocinador removido"}`}
          subtitle={`${p.eventName ?? "Evento removido"}${p.eventStart ? ` · ${diaDoEvento(p.eventStart)}` : ""}`}
          onClose={onFechar}
        />

        <div style={{
          flex: "1 1 auto", minHeight: 0, overflowY: "auto", padding: isMobile ? 16 : "20px 28px",
          display: "grid", gap: isMobile ? 20 : "0 32px", alignItems: "start",
          gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "minmax(0, 1.35fr) minmax(0, 1fr)",
        }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
            <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: "12px 20px" }}>
              <Campo rotulo="Estado"><EstadoDoPedido status={p.status} /></Campo>
              <Campo rotulo="Quantidade">
                {quantidadeDoPedido(p.quantidade)}
                {pecas.length > 0 && criadas !== p.quantidade && (
                  <span style={{ display: "block", fontSize: FS.small, color: "#92400e", fontWeight: 700 }}>criadas {criadas} un.</span>
                )}
              </Campo>
              <Campo rotulo="Precisa até">
                {p.precisaAte ? new Date(p.precisaAte).toISOString().slice(0, 10).split("-").reverse().join("/") : "—"}
                <span style={{ display: "block", marginTop: 4 }}><PrazoDoPedido pedido={p} agora={agora} /></span>
              </Campo>
              <Campo rotulo="Saída do caminhão">
                {saidaDoCaminhao(p.eventSaida) ?? "—"}
                {selo && <span style={{ display: "block", marginTop: 4 }}><SeloDoEventoChip selo={selo} pedidoId={p.id} /></span>}
              </Campo>
              <Campo rotulo="Tipo de peça">{p.tipoDePeca ?? "—"}</Campo>
              <Campo rotulo="Medida da área visual">{medida ?? "—"}</Campo>
              <Campo rotulo="Solicitada por">{p.pedidoPor ?? "—"}<span style={{ display: "block", fontSize: FS.small, color: "#57534e", fontWeight: 500 }}>{quandoFoi(p.createdAt)}</span></Campo>
              {p.editadoEm && (
                <Campo rotulo="Última edição">{p.editadoPor ?? "—"}<span style={{ display: "block", fontSize: FS.small, color: "#57534e", fontWeight: 500 }}>{quandoFoi(p.editadoEm)}</span></Campo>
              )}
            </dl>

            <section>
              <h3 style={TITULO_DA_SECAO}>O que precisa</h3>
              <p style={{ margin: 0, padding: "10px 12px", borderLeft: "3px solid #d6d3d1", background: "#fafaf9", borderRadius: R.sm, fontSize: 14, color: "#44403c", lineHeight: 1.55, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                “{textoDaObservacao(p.observacao)}”
              </p>
            </section>

            {referencias.length > 0 && (
              <section>
                <h3 style={TITULO_DA_SECAO}>Referências ({referencias.length})</h3>
                <ReferenciasDoPedido urls={referencias} tamanho={isMobile ? 84 : 108} legenda />
              </section>
            )}

            {p.status === "atendido" && (
              <section>
                <h3 style={TITULO_DA_SECAO}>Peças que saíram da solicitação</h3>
                <AndamentoDoPedido pedido={p} />
              </section>
            )}
            {p.status === "recusado" && (
              <section>
                <h3 style={TITULO_DA_SECAO}>Motivo da recusa</h3>
                <p style={{ margin: 0, fontSize: 14, color: "#991b1b", lineHeight: 1.5 }}>{p.motivoRecusa}</p>
              </section>
            )}
            {p.status === "cancelado" && (
              <section>
                <h3 style={TITULO_DA_SECAO}>Motivo do cancelamento</h3>
                <p style={{ margin: 0, fontSize: 14, color: "#44403c", lineHeight: 1.5 }}>{p.motivoCancelamento ?? "—"}</p>
              </section>
            )}
          </div>

          <section data-testid="historico-do-pedido" aria-labelledby="titulo-historico-pedido" style={{ minWidth: 0 }}>
            <h3 id="titulo-historico-pedido" style={TITULO_DA_SECAO}>Histórico</h3>
            {isLoading ? (
              <p style={{ margin: 0, fontSize: FS.body, color: "#57534e" }}>Carregando o histórico…</p>
            ) : isError ? (
              <p style={{ margin: 0, fontSize: FS.body, color: "#b91c1c" }}>Não foi possível carregar o histórico.</p>
            ) : historico.length === 0 ? (
              <p style={{ margin: 0, fontSize: FS.body, color: "#57534e" }}>Nenhum registro ainda.</p>
            ) : (
              <ol style={{ listStyle: "none", margin: 0, padding: 0, position: "relative" }}>
                {historico.map((r, i) => (
                  <li key={r.id} style={{ position: "relative", paddingLeft: 22, paddingBottom: i < historico.length - 1 ? 16 : 0 }}>
                    {i < historico.length - 1 && (
                      <span aria-hidden="true" style={{ position: "absolute", left: 5, top: 14, bottom: 0, width: 2, background: "#e7e5e4" }} />
                    )}
                    <span aria-hidden="true" style={{ position: "absolute", left: 0, top: 4, width: 12, height: 12, borderRadius: R.pill, background: i === historico.length - 1 ? "#b45309" : "#d6d3d1", border: "2px solid #fff", boxShadow: "0 0 0 1px #d6d3d1" }} />
                    <div style={{ fontSize: FS.body, color: T.text, fontWeight: 600, lineHeight: 1.45, overflowWrap: "anywhere" }}>{fraseDoRegistro(r)}</div>
                    <div style={{ fontSize: FS.small, color: "#57534e", marginTop: 2 }}>
                      {r.userName ?? "Sistema"} · {quandoFoi(r.createdAt)}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        {acoes.length > 0 && (
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap", padding: isMobile ? "12px 16px" : "14px 28px", borderTop: "1px solid #ebe8e4", background: "#fff", flexShrink: 0 }}>
            {acoes.map((a) => (
              <BotaoDoCartao
                key={a.chave}
                altura={alvo}
                acao={a.href ? a : { ...a, onClick: () => { onFechar(); a.onClick?.(); } }}
              />
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
