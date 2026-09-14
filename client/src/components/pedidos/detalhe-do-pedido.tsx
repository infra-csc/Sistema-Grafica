// ─────────────────────────────────────────────────────────────────────────────
// DETALHE DA SOLICITAÇÃO — tudo sobre ela, com o histórico (dono, 14/09).
//
// "Um modal para as solicitações, com histórico e tudo mais, para detalhar."
// À esquerda a solicitação e CADA PEÇA inteira (campos, texto, referências
// grandes, peças criadas e andamento, ajuste, motivos, e as ações da peça); à
// direita a linha do tempo lida da trilha de auditoria da solicitação.
// ─────────────────────────────────────────────────────────────────────────────
import { useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Inbox } from "lucide-react";
import {
  patrocinadoresDaLinha,
  quantidadeDoPedido,
  resumoDasLinhas,
  rotuloDaLinha,
  textoDaObservacao,
  unidadesCriadas,
  type LinhaDoPedido,
  type PedidoDePeca,
  type SeloDoEvento,
} from "@shared/pedidos-de-peca";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { HIDE_NATIVE_CLOSE, ModalHeader, modalSurface } from "@/components/modal-shell";
import { useIsMobile } from "@/hooks/use-mobile";
import { T, FS, R } from "@/lib/theme";
import { BotaoDoCartao, type AcaoDoCartao } from "@/components/pedidos/cartao-do-pedido";
import {
  AjusteDaLinha,
  AndamentoDaLinha,
  EstadoDoPedido,
  PrazoDaLinha,
  ReferenciasDoPedido,
  SeloDoEventoChip,
  diaDoEvento,
  medidaDaLinha,
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
const fraseDoRegistro = (r: RegistroDeAuditoria) => r.details?.trim() || (r.action === "created" ? "Solicitação criada" : "Solicitação atualizada");

const saidaDoCaminhao = (d: string | null | undefined) => {
  if (!d) return null;
  const iso = new Date(d).toISOString();
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)} às ${iso.slice(11, 16)}`;
};

function PecaDoDetalhe({ linha, numero, agora, selo, acoes }: { linha: LinhaDoPedido; numero: number; agora: Date; selo: SeloDoEvento | null; acoes: AcaoDoCartao[] }) {
  const isMobile = useIsMobile();
  const pecas = linha.pecas ?? [];
  const referencias = linha.referencias ?? [];
  const criadas = unidadesCriadas(pecas);
  const medida = medidaDaLinha(linha);
  return (
    <section data-testid={`detalhe-linha-${linha.id}`} style={{ border: "1px solid #e7e5e4", borderRadius: R.lg, padding: isMobile ? 12 : 16, display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: FS.small, fontWeight: 800, color: "#57534e", letterSpacing: "0.06em", textTransform: "uppercase" }}>Peça {numero}</span>
        <EstadoDoPedido status={linha.status} />
        <strong style={{ fontSize: 15, color: T.text }}>{quantidadeDoPedido(linha.quantidade)} · {rotuloDaLinha(linha)}</strong>
      </div>
      <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: "12px 20px" }}>
        <Campo rotulo="Evento">{linha.eventName ?? "Evento removido"}{linha.eventStart ? ` · ${diaDoEvento(linha.eventStart)}` : ""}</Campo>
        <Campo rotulo="Patrocinadores">{patrocinadoresDaLinha(linha)}</Campo>
        <Campo rotulo="Quantidade">
          {quantidadeDoPedido(linha.quantidade)}
          {pecas.length > 0 && criadas !== linha.quantidade && (
            <span style={{ display: "block", fontSize: FS.small, color: "#92400e", fontWeight: 700 }}>criadas {criadas} un.</span>
          )}
        </Campo>
        <Campo rotulo="Precisa até">
          {linha.precisaAte ? new Date(linha.precisaAte).toISOString().slice(0, 10).split("-").reverse().join("/") : "—"}
          <span style={{ display: "block", marginTop: 4 }}><PrazoDaLinha linha={linha} agora={agora} /></span>
        </Campo>
        <Campo rotulo="Saída do caminhão">
          {saidaDoCaminhao(linha.eventSaida) ?? "—"}
          {selo && <span style={{ display: "block", marginTop: 4 }}><SeloDoEventoChip selo={selo} pedidoId={linha.id} /></span>}
        </Campo>
        <Campo rotulo="Medida da área visual">{medida ?? "—"}</Campo>
      </dl>
      <div>
        <h4 style={TITULO_DA_SECAO}>O que precisa</h4>
        <p style={{ margin: 0, padding: "10px 12px", borderLeft: "3px solid #d6d3d1", background: "#fafaf9", borderRadius: R.sm, fontSize: 14, color: "#44403c", lineHeight: 1.55, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
          “{textoDaObservacao(linha.observacao)}”
        </p>
      </div>
      {referencias.length > 0 && (
        <div>
          <h4 style={TITULO_DA_SECAO}>Referências ({referencias.length})</h4>
          <ReferenciasDoPedido urls={referencias} tamanho={isMobile ? 84 : 108} legenda />
        </div>
      )}
      <AndamentoDaLinha linha={linha} />
      <AjusteDaLinha linha={linha} />
      {linha.status === "recusado" && (
        <p style={{ margin: 0, fontSize: 14, color: "#991b1b", lineHeight: 1.5 }}><strong>Motivo da recusa:</strong> {linha.motivoRecusa}</p>
      )}
      {linha.status === "cancelado" && (
        <p style={{ margin: 0, fontSize: 14, color: "#44403c", lineHeight: 1.5 }}><strong>Motivo do cancelamento:</strong> {linha.motivoCancelamento ?? "—"}</p>
      )}
      {acoes.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {acoes.map((a) => <BotaoDoCartao key={a.chave} acao={a} altura={isMobile ? 44 : 36} />)}
        </div>
      )}
    </section>
  );
}

export function DetalheDoPedido({ pedido, agora, seloDe, acoesDaLinha, acoes = [], onFechar }: {
  pedido: PedidoDePeca | null;
  agora: Date;
  seloDe: (linha: LinhaDoPedido) => SeloDoEvento | null;
  acoesDaLinha: (linha: LinhaDoPedido) => AcaoDoCartao[];
  acoes?: AcaoDoCartao[];
  onFechar: () => void;
}) {
  const isMobile = useIsMobile();
  // Durante o fade de saída a solicitação já é null: mantém a última na tela.
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
  const linhas = p.linhas ?? [];
  // As ações fecham o detalhe antes (a janela do motivo abre sobre a tela).
  const fechandoAntes = (lista: AcaoDoCartao[]) => lista.map((a) => (a.onClick ? { ...a, onClick: () => { onFechar(); a.onClick!(); } } : a));

  return (
    <Dialog open={!!pedido} onOpenChange={(aberto) => { if (!aberto) onFechar(); }}>
      <DialogContent data-testid="detalhe-do-pedido" className={HIDE_NATIVE_CLOSE} style={modalSurface(1080)}>
        <DialogTitle className="sr-only">Solicitação de peças — {linhas.length} {linhas.length === 1 ? "peça" : "peças"}</DialogTitle>
        <DialogDescription className="sr-only">Solicitada por {p.pedidoPor ?? "—"}</DialogDescription>
        <ModalHeader
          icon={Inbox}
          tint="#b45309"
          title={`Solicitação · ${linhas.length} ${linhas.length === 1 ? "peça" : "peças"}`}
          subtitle={`Solicitada por ${p.pedidoPor ?? "—"} · ${quandoFoi(p.createdAt)}${linhas.length > 1 ? ` · ${resumoDasLinhas(linhas)}` : ""}`}
          onClose={onFechar}
        />

        <div style={{
          flex: "1 1 auto", minHeight: 0, overflowY: "auto", padding: isMobile ? 16 : "20px 28px",
          display: "grid", gap: isMobile ? 20 : "0 32px", alignItems: "start",
          gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "minmax(0, 1.6fr) minmax(0, 1fr)",
        }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <EstadoDoPedido status={p.status} />
              {acoes.length > 0 && fechandoAntes(acoes).map((a) => <BotaoDoCartao key={a.chave} acao={a} altura={isMobile ? 44 : 34} />)}
            </div>
            {linhas.map((l, i) => (
              <PecaDoDetalhe key={l.id} linha={l} numero={i + 1} agora={agora} selo={seloDe(l)} acoes={fechandoAntes(acoesDaLinha(l))} />
            ))}
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
      </DialogContent>
    </Dialog>
  );
}
