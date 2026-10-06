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
import { T, FS, R, N, TOM, FW } from "@/lib/theme";
import { EstadoErro } from "@/components/ui/estados";
import { BotaoDoCartao, MotivosDoBloqueio, TRILHO_DO_PEDIDO, type AcaoDoCartao } from "@/components/pedidos/cartao-do-pedido";
import {
  AjusteDaLinha,
  AndamentoDaLinha,
  EstadoDoPedido,
  PrazoDaLinha,
  QuemAgeNaLinha,
  ReferenciasDoPedido,
  SeloDoEventoChip,
  diaDoEvento,
  medidaDaLinha,
  quandoFoi,
  type VistaDoPedido,
} from "@/components/pedidos/ui";

type RegistroDeAuditoria = { id: string; action: string; details: string | null; userName: string | null; createdAt: string };

const TITULO_DA_SECAO: React.CSSProperties = { margin: "0 0 8px", fontSize: FS.small, fontWeight: FW.rotulo, letterSpacing: "0.08em", textTransform: "uppercase", color: T.apoio };

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div style={{ minWidth: 0 }}>
      <dt style={{ fontSize: FS.small, fontWeight: FW.forte, color: T.apoio, marginBottom: 2 }}>{rotulo}</dt>
      <dd style={{ margin: 0, fontSize: FS.body, color: T.text, fontWeight: FW.medio, overflowWrap: "anywhere" }}>{children}</dd>
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

function PecaDoDetalhe({ linha, numero, agora, selo, acoes, vista }: { linha: LinhaDoPedido; numero: number; agora: Date; selo: SeloDoEvento | null; acoes: AcaoDoCartao[]; vista?: VistaDoPedido }) {
  const isMobile = useIsMobile();
  const pecas = linha.pecas ?? [];
  const referencias = linha.referencias ?? [];
  const criadas = unidadesCriadas(pecas);
  const medida = medidaDaLinha(linha);
  return (
    <section data-testid={`detalhe-linha-${linha.id}`} style={{ border: `1px solid ${T.border}`, borderLeft: `3px solid ${TRILHO_DO_PEDIDO[linha.status] ?? T.bdark}`, borderRadius: R.lg, padding: isMobile ? 12 : 16, display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {/* Sem tipo informado, o nome da peça JÁ é "Peça N": o sobrescrito
            repetia "PEÇA 1 · … Peça 1". */}
        {!/^Peça d+$/.test(rotuloDaLinha(linha)) && (
          <span style={{ fontSize: FS.small, fontWeight: FW.rotulo, color: T.apoio, letterSpacing: "0.06em", textTransform: "uppercase" }}>Peça {numero}</span>
        )}
        <EstadoDoPedido status={linha.status} />
        <strong style={{ fontSize: FS.strong, color: T.text }}>{quantidadeDoPedido(linha.quantidade)} · {rotuloDaLinha(linha)}</strong>
      </div>
      {/* No celular, duas colunas de campos (eram seis linhas empilhadas,
          uma tela inteira de rótulo-valor antes de "O que precisa"). */}
      <dl style={{ margin: 0, display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${isMobile ? 130 : 170}px, 1fr))`, gap: isMobile ? "12px 14px" : "12px 20px" }}>
        <Campo rotulo="Evento">{linha.eventName ?? "Evento removido"}{linha.eventStart ? ` · ${diaDoEvento(linha.eventStart)}` : ""}</Campo>
        <Campo rotulo="Patrocinadores">{patrocinadoresDaLinha(linha)}</Campo>
        {/* A quantidade já está no título da peça; o campo só existe quando
            o que foi criado diverge do que foi pedido. */}
        {pecas.length > 0 && criadas !== linha.quantidade && (
          <Campo rotulo="Quantidade">
            pedida {quantidadeDoPedido(linha.quantidade)}
            <span style={{ display: "block", fontSize: FS.small, color: TOM.alerta.text, fontWeight: FW.forte }}>criadas {criadas} un.</span>
          </Campo>
        )}
        <Campo rotulo="Precisa até">
          {linha.precisaAte ? new Date(linha.precisaAte).toISOString().slice(0, 10).split("-").reverse().join("/") : "—"}
          <span style={{ display: "flex", marginTop: 4 }}><PrazoDaLinha linha={linha} agora={agora} soAlerta /></span>
        </Campo>
        <Campo rotulo="Saída do caminhão">
          {saidaDoCaminhao(linha.eventSaida) ?? "—"}
          {selo && <span style={{ display: "block", marginTop: 4 }}><SeloDoEventoChip selo={selo} pedidoId={linha.id} /></span>}
        </Campo>
        <Campo rotulo="Medida da área visual">{medida ?? "—"}</Campo>
      </dl>
      {/* Sem texto não há o que citar — aspas vazias pareciam dado perdido. */}
      {textoDaObservacao(linha.observacao) && (
        <div>
          <h4 style={TITULO_DA_SECAO}>O que precisa</h4>
          <p style={{ margin: 0, padding: "10px 12px", borderLeft: `3px solid ${T.bdark}`, background: T.bg, borderRadius: R.sm, fontSize: FS.read, color: T.strong, lineHeight: 1.55, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
            “{textoDaObservacao(linha.observacao)}”
          </p>
        </div>
      )}
      {referencias.length > 0 && (
        <div>
          <h4 style={TITULO_DA_SECAO}>Referências ({referencias.length})</h4>
          <ReferenciasDoPedido urls={referencias} tamanho={isMobile ? 84 : 108} legenda />
        </div>
      )}
      <AndamentoDaLinha linha={linha} />
      <AjusteDaLinha linha={linha} />
      {linha.status === "recusado" && (
        <p style={{ margin: 0, fontSize: FS.read, color: TOM.perigo.text, lineHeight: 1.5 }}><strong>Motivo da recusa:</strong> {linha.motivoRecusa}</p>
      )}
      {linha.status === "cancelado" && (
        <p style={{ margin: 0, fontSize: FS.read, color: T.strong, lineHeight: 1.5 }}><strong>Motivo do cancelamento:</strong> {linha.motivoCancelamento ?? "—"}</p>
      )}
      <QuemAgeNaLinha linha={linha} vista={vista} />
      {acoes.length > 0 && (
        <div className={isMobile ? "ped-rodape-toque" : undefined} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {acoes.map((a) => <BotaoDoCartao key={a.chave} acao={a} altura={isMobile ? 44 : 36} descritoPor={`bloqueio-detalhe-${linha.id}`} />)}
        </div>
      )}
      <MotivosDoBloqueio acoes={acoes} id={`bloqueio-detalhe-${linha.id}`} />
    </section>
  );
}

export function DetalheDoPedido({ pedido, agora, seloDe, acoesDaLinha, acoes = [], onFechar, vista }: {
  pedido: PedidoDePeca | null;
  agora: Date;
  seloDe: (linha: LinhaDoPedido) => SeloDoEvento | null;
  acoesDaLinha: (linha: LinhaDoPedido) => AcaoDoCartao[];
  acoes?: AcaoDoCartao[];
  onFechar: () => void;
  /** Quem está vendo (página de solicitações): "Sua vez" para quem atende. */
  vista?: VistaDoPedido;
}) {
  const isMobile = useIsMobile();
  // Durante o fade de saída a solicitação já é null: mantém a última na tela.
  const ultimo = useRef<PedidoDePeca | null>(pedido);
  if (pedido) ultimo.current = pedido;
  const p = pedido ?? ultimo.current;

  const { data: registros = [], isLoading, isError, refetch, isFetching } = useQuery<RegistroDeAuditoria[]>({
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
          tint={TOM.alerta.text}
          title={`Solicitação · ${linhas.length} ${linhas.length === 1 ? "peça" : "peças"}`}
          subtitle={`Solicitada por ${p.pedidoPor ?? "—"} · ${quandoFoi(p.createdAt)}`}
          onClose={onFechar}
        />

        <div style={{
          flex: "1 1 auto", minHeight: 0, overflowY: "auto", padding: isMobile ? 16 : "20px 28px",
          display: "grid", gap: isMobile ? 20 : "0 32px", alignItems: "start",
          gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "minmax(0, 1.6fr) minmax(0, 1fr)",
        }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
            {/* O status da SOLICITAÇÃO só quando diz algo a mais que o da
                peça (várias peças), e as ações dela à direita. Com uma peça só,
                era um selo solto no topo, repetido logo abaixo. */}
            {(linhas.length > 1 || acoes.length > 0) && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", minHeight: 36 }}>
                {linhas.length > 1 && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: FS.body, color: T.apoio }}>
                    <EstadoDoPedido status={p.status} /> {resumoDasLinhas(linhas)}
                  </span>
                )}
                {acoes.length > 0 && (
                  <span style={{ display: "flex", gap: 8, flexWrap: "wrap", marginLeft: isMobile ? 0 : "auto" }}>
                    {fechandoAntes(acoes).map((a) => <BotaoDoCartao key={a.chave} acao={a} altura={isMobile ? 44 : 36} />)}
                  </span>
                )}
              </div>
            )}
            {linhas.map((l, i) => (
              <PecaDoDetalhe key={l.id} linha={l} numero={i + 1} agora={agora} selo={seloDe(l)} acoes={fechandoAntes(acoesDaLinha(l))} vista={vista} />
            ))}
          </div>

          {/* O histórico acompanha a rolagem das peças (sticky): com três peças
              abertas, a linha do tempo sumia no topo logo na primeira. */}
          <section data-testid="historico-do-pedido" aria-labelledby="titulo-historico-pedido"
            style={{ minWidth: 0, ...(isMobile ? { paddingTop: 16, borderTop: `1px solid ${T.border}` } : { position: "sticky", top: 0, padding: "16px 18px", borderRadius: R.lg, background: T.bg, border: `1px solid ${T.border}` }) }}>
            <h3 id="titulo-historico-pedido" style={TITULO_DA_SECAO}>Histórico</h3>
            {/* Falha no histórico tem botão de tentar de novo: a frase antiga
                ("feche e abra a solicitação") mandava perder o lugar para
                refazer o que um clique faz. */}
            {isLoading ? (
              // O esqueleto tem a forma da linha do tempo (ponto + duas linhas), e
              // a frase fica para o leitor de tela.
              <div role="status" aria-busy="true">
                <span className="sr-only">Carregando o histórico…</span>
                {[0, 1, 2].map((i) => (
                  <div key={i} aria-hidden="true" className="animate-pulse" style={{ display: "grid", gridTemplateColumns: "12px minmax(0, 1fr)", gap: 10, paddingBottom: i < 2 ? 16 : 0 }}>
                    <span style={{ width: 12, height: 12, marginTop: 3, borderRadius: R.pill, background: T.border }} />
                    <span style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <span style={{ width: i === 1 ? "70%" : "90%", height: 11, borderRadius: R.sm, background: T.border }} />
                      <span style={{ width: "45%", height: 9, borderRadius: R.sm, background: N.n3 }} />
                    </span>
                  </div>
                ))}
              </div>
            ) : isError ? (
              /* O testid antigo do "tentar de novo" fica no invólucro: o
                 botão do EstadoErro sai com o testid do design system
                 (botao-tentar-de-novo). Enquanto a nova tentativa roda, o
                 botão some em vez de ser clicado duas vezes. */
              <div data-testid="button-recarregar-historico">
                <EstadoErro compacto titulo="Não foi possível carregar o histórico."
                  detalhe={isFetching ? "Tentando de novo…" : undefined}
                  aoTentarDeNovo={isFetching ? undefined : () => refetch()} />
              </div>
            ) : historico.length === 0 ? (
              <p style={{ margin: 0, fontSize: FS.body, color: T.apoio }}>Nenhum registro ainda.</p>
            ) : (
              <ol style={{ listStyle: "none", margin: 0, padding: 0, position: "relative" }}>
                {historico.map((r, i) => (
                  <li key={r.id} style={{ position: "relative", paddingLeft: 22, paddingBottom: i < historico.length - 1 ? 16 : 0 }}>
                    {i < historico.length - 1 && (
                      <span aria-hidden="true" style={{ position: "absolute", left: 5, top: 14, bottom: 0, width: 2, background: T.border }} />
                    )}
                    <span aria-hidden="true" style={{ position: "absolute", left: 0, top: 4, width: 12, height: 12, borderRadius: R.pill, background: i === historico.length - 1 ? TOM.alerta.text : T.bdark, border: `2px solid ${isMobile ? T.surface : T.bg}`, boxShadow: `0 0 0 1px ${T.bdark}` }} />
                    <div style={{ fontSize: FS.body, color: T.text, fontWeight: FW.medio, lineHeight: 1.45, overflowWrap: "anywhere" }}>{fraseDoRegistro(r)}</div>
                    <div style={{ fontSize: FS.small, color: T.apoio, marginTop: 2 }}>
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
