// ─────────────────────────────────────────────────────────────────────────────
// SOLICITAÇÃO DE PEÇAS — peças visuais compartilhadas pela página, pelo painel
// dentro do evento e pelo detalhe. Uma definição só de cada selo: a mesma
// solicitação tem a mesma cara em todo lugar.
// ─────────────────────────────────────────────────────────────────────────────
import { Link } from "wouter";
import {
  ETAPAS_DA_PECA,
  ROTULO_DO_PEDIDO,
  ajustePendente,
  ehChaveDePedidos,
  etapaDaPecaDoPedido,
  idadeDoPedido,
  pedidoEspera,
  prazoDoPedido,
  textoDaObservacao,
  unidadesCriadas,
  type LinhaDoPedido,
  type SeloDoEvento,
  type StatusDaSolicitacao,
} from "@shared/pedidos-de-peca";
import { queryClient } from "@/lib/queryClient";
import { StatusBadge } from "@/components/status-badge";
import { statusDeExibicao } from "@shared/molde";
import { DetalheProducao } from "@/components/detalhe-producao";
import { miniatura } from "@/lib/miniatura";
import { T, FS, R, N, TOM, FONT, FW } from "@/lib/theme";
import { Selo } from "@/components/ui/selo";

export const TOM_DO_PEDIDO: Record<StatusDaSolicitacao, { cor: string; fundo: string; borda: string }> = {
  aberto:    { cor: TOM.alerta.text, fundo: TOM.alerta.bg, borda: TOM.alerta.border },
  parcial:   { cor: TOM.ceu.text, fundo: TOM.ceu.bg, borda: TOM.ceu.border },
  atendido:  { cor: TOM.esmeralda.text, fundo: TOM.esmeralda.bg, borda: TOM.esmeralda.border },
  recusado:  { cor: TOM.perigo.text, fundo: TOM.perigo.bg, borda: TOM.perigo.border },
  cancelado: { cor: T.apoio, fundo: N.n2, borda: T.border },
};

export const invalidarPedidos = () =>
  queryClient.invalidateQueries({ predicate: (q) => ehChaveDePedidos(q.queryKey[0]) });

export const quandoFoi = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";

export const diaEMes = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "—";

export const diaDoEvento = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" }) : "";

export const medidaDaLinha = (l: { largura: string | null; altura: string | null }) =>
  l.largura && l.altura ? `${Number(l.largura).toLocaleString("pt-BR")} × ${Number(l.altura).toLocaleString("pt-BR")} m` : null;

/** Mensagem de erro da API ("409: {"error":"…"}") em frase legível. */
export function mensagemDaApi(e: unknown): string {
  const bruto = String((e as any)?.message ?? "Erro desconhecido");
  const i = bruto.indexOf("{");
  if (i >= 0) {
    try { const j = JSON.parse(bruto.slice(i)); if (j?.error) return j.error; } catch { /* segue */ }
  }
  return bruto.replace(/^\d{3}:\s*/, "");
}

/**
 * O QUE CADA STATUS QUER DIZER — uma frase por status, lida pelo selo (title)
 * e pela legenda "Como funciona" da página. "Parcial" e "Atendida" eram os dois
 * que ninguém sabia ler de primeira: atendida por quem, e o que falta na parcial.
 */
export const SIGNIFICADO_DO_PEDIDO: Record<StatusDaSolicitacao, string> = {
  aberto: "esperando quem monta a lista criar a peça ou recusar",
  parcial: "parte das peças já foi atendida; o resto ainda espera",
  atendido: "a peça foi criada no evento e segue para Arte e Gráfica",
  recusado: "quem monta a lista recusou, com o motivo",
  cancelado: "quem solicitou cancelou, com o motivo",
};

/**
 * QUEM PRECISA AGIR nesta peça, quando alguém precisa. Só nos dois estados que
 * esperam uma pessoa — aberta e ajuste pendente —; nos outros o cartão já diz o
 * desfecho (andamento, motivo). "Quem monta a lista" é o perfil Solicitação:
 * o nome do perfil entre parênteses desfaz a confusão com "solicitação" (o pedido).
 */
export function QuemAgeNaLinha({ linha }: { linha: LinhaDoPedido }) {
  const texto = linha.status === "aberto"
    ? "quem monta a lista (perfil Solicitação) criar a peça no evento ou recusar."
    : linha.status === "atendido" && ajustePendente(linha)
      ? "quem monta a lista (perfil Solicitação) aceitar ou recusar o ajuste."
      : null;
  if (!texto) return null;
  return (
    <p data-testid={`quem-age-linha-${linha.id}`} style={{ margin: 0, fontSize: FS.small, color: T.apoio, lineHeight: 1.45 }}>
      <strong style={{ fontWeight: FW.forte, color: T.strong }}>Esperando:</strong> {texto}
    </p>
  );
}

export function EstadoDoPedido({ status }: { status: StatusDaSolicitacao }) {
  const tom = TOM_DO_PEDIDO[status] ?? TOM_DO_PEDIDO.cancelado;
  return (
    <span title={SIGNIFICADO_DO_PEDIDO[status] ? `${ROTULO_DO_PEDIDO[status]}: ${SIGNIFICADO_DO_PEDIDO[status]}` : undefined} style={{ flexShrink: 0, fontSize: FS.small, fontWeight: FW.rotulo, color: tom.cor, background: tom.fundo, border: `1px solid ${tom.borda}`, borderRadius: R.pill, padding: "2px 9px", whiteSpace: "nowrap" }}>
      {ROTULO_DO_PEDIDO[status] ?? status}
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
              style={{ display: "block", width: tamanho, height: tamanho, borderRadius: R.md, overflow: "hidden", border: `1px solid ${T.border}`, background: N.n2 }}>
              <img src={miniatura(url)} alt={`Referência ${i + 1}`} loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </a>
            {onRemover && (
              // ALVO DE 36, DESENHO DE 22. O × tinha 24px de área de clique
              // sobre uma miniatura de 48 — no celular, errar o × abria a
              // imagem em outra aba. O botão cresceu transparente; o círculo
              // escuro visível continua do mesmo tamanho.
              <button type="button" onClick={() => onRemover(i)} aria-label={`Remover referência ${i + 1}`}
                style={{ position: "absolute", top: -14, right: -14, zIndex: 1, width: 36, height: 36, borderRadius: R.pill, border: "none", background: "transparent", padding: 0, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span aria-hidden="true" style={{ width: 22, height: 22, borderRadius: R.pill, border: `2px solid ${T.surface}`, background: T.text, color: T.surface, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, lineHeight: 1, boxSizing: "border-box" }}>×</span>
              </button>
            )}
          </div>
        ))}
      </div>
      {legenda && <span style={{ fontSize: FS.small, color: T.apoio }}>Referência do solicitante — não é arte final</span>}
    </div>
  );
}

/** Há quanto tempo a solicitação espera. Só enquanto tem peça aberta. */
export function IdadeDoPedido({ pedido, agora }: { pedido: { id: string; status: string; createdAt: string }; agora: Date }) {
  if (!pedidoEspera(pedido.status)) return null;
  const idade = idadeDoPedido(pedido.createdAt, agora);
  const cor = idade.nivel === "parado" ? TOM.perigo.text : idade.nivel === "atencao" ? TOM.alerta.text : T.apoio;
  return (
    <span data-testid={`cell-idade-pedido-${pedido.id}`} title={`Entrou em ${quandoFoi(pedido.createdAt)}`}
      style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end", lineHeight: 1.25, flexShrink: 0, textAlign: "right" }}>
      <span style={{ fontSize: FS.body, fontWeight: idade.nivel === "normal" ? 600 : 700, color: cor, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
        {idade.texto}
      </span>
      {idade.nivel === "parado" && <span style={{ fontSize: FS.micro, fontWeight: FW.forte, color: TOM.perigo.text, whiteSpace: "nowrap" }}>solicitação parada</span>}
    </span>
  );
}

/** "precisa até 20/09" — vermelho vencido, âmbar a 3 dias. Só em peça aberta. */
export function PrazoDaLinha({ linha, agora }: { linha: LinhaDoPedido; agora: Date }) {
  if (linha.status !== "aberto") return null;
  const prazo = prazoDoPedido(linha.precisaAte, agora);
  if (!prazo) return null;
  const tom = prazo.nivel === "vencido"
    ? { cor: TOM.perigo.text, fundo: TOM.perigo.bg, borda: TOM.perigo.border }
    : prazo.nivel === "perto"
      ? { cor: TOM.alerta.text, fundo: TOM.alerta.bg, borda: TOM.alerta.border }
      : { cor: T.strong, fundo: N.n2, borda: T.border };
  return (
    // Padding menor que o do Selo padrão: o selo divide a linha com o
    // status e a quantidade, e na altura cheia empurraria a linha.
    <Selo data-testid={`prazo-linha-${linha.id}`} cores={{ text: tom.cor, bg: tom.fundo, border: tom.borda }} style={{ padding: "1px 8px" }}>
      {prazo.texto}
    </Selo>
  );
}

export function SeloDoEventoChip({ selo, pedidoId }: { selo: SeloDoEvento | null; pedidoId: string }) {
  if (!selo) return null;
  const caminhao = selo.tipo === "caminhao";
  return (
    <Selo data-testid={`selo-evento-${pedidoId}`} title={selo.explicacao}
      cores={caminhao ? TOM.alerta : { text: T.apoio, bg: N.n2, border: T.border }}
      style={{ padding: "1px 8px" }}>
      {selo.texto}
    </Selo>
  );
}

export function ObservacaoDoPedido({ valor }: { valor: unknown }) {
  const texto = textoDaObservacao(valor);
  if (!texto) return null;
  return (
    <p style={{ margin: 0, fontSize: FS.body, color: T.strong, lineHeight: 1.5, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
      “{texto}”
    </p>
  );
}

/**
 * A PEÇA SOLICITADA QUE SE ACOMPANHA SOZINHA: cada peça criada para ela, com o
 * andamento (Criação → Aprovação → Produção → Conferência → Entregue) e a
 * quantidade pedida × criada quando divergem.
 */
export function AndamentoDaLinha({ linha }: { linha: LinhaDoPedido }) {
  if (linha.status !== "atendido") return null;
  const pecas = linha.pecas ?? [];
  const criadas = unidadesCriadas(pecas);
  return (
    <div data-testid={`andamento-linha-${linha.id}`} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <p style={{ margin: 0, fontSize: FS.body, color: TOM.esmeralda.text, lineHeight: 1.5 }}>
        Atendida em {diaEMes(linha.resolvidoEm)}{linha.resolvidoPor ? ` por ${linha.resolvidoPor}` : ""}
        {pecas.length > 0 && ` · ${pecas.length} ${pecas.length === 1 ? "peça" : "peças"}`}
        {pecas.length > 0 && criadas !== linha.quantidade && (
          <strong data-testid={`divergencia-linha-${linha.id}`} style={{ color: TOM.alerta.text, fontWeight: FW.forte }}>
            {" "}· pediu {linha.quantidade} un., {criadas < linha.quantidade ? "criadas só" : "criadas"} {criadas} un.
          </strong>
        )}
      </p>
      {pecas.map((p) => {
        // Pela PEÇA: o molde produzido é o fim do fluxo dele e chega a "Entregue".
        const etapa = etapaDaPecaDoPedido(p);
        return (
          <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", minWidth: 0 }}>
            <Link href={`/eventos/${linha.eventId}?item=${p.id}`} data-testid={`link-peca-gerada-${p.id}`}
              style={{ fontFamily: FONT.mono, fontSize: FS.body, fontWeight: FW.rotulo, color: TOM.esmeralda.text, textDecoration: "underline", textUnderlineOffset: 2 }}>
              {p.displayId ?? "abrir"}
            </Link>
            <span style={{ fontSize: FS.body, color: T.strong, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220 }}>
              {p.type} · {p.quantity} un.
            </span>
            {etapa === null ? (
              <span style={{ fontSize: FS.small, fontWeight: FW.forte, color: TOM.perigo.text }}>peça cancelada</span>
            ) : (
              <ol aria-label={`Andamento da peça: ${ETAPAS_DA_PECA[etapa]}`} style={{ display: "flex", alignItems: "center", gap: 4, listStyle: "none", margin: 0, padding: 0 }}>
                {ETAPAS_DA_PECA.map((nome, i) => (
                  <li key={nome} title={nome} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span aria-hidden="true" style={{ width: i === etapa ? 10 : 8, height: i === etapa ? 10 : 8, borderRadius: R.pill, background: i <= etapa ? TOM.esmeralda.text : T.bdark }} />
                    {i === etapa && <span style={{ fontSize: FS.small, fontWeight: FW.forte, color: TOM.esmeralda.text }}>{nome}</span>}
                  </li>
                ))}
              </ol>
            )}
            {etapa !== null && etapa >= 2 && (
              <span data-testid={`producao-peca-${p.id}`} style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap", minWidth: 0 }}>
                <StatusBadge status={statusDeExibicao(p)} short />
                <DetalheProducao item={p} style={{ marginTop: 0 }} />
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** O ajuste que o Atendimento pediu depois de atendida, e a resposta. */
export function AjusteDaLinha({ linha }: { linha: LinhaDoPedido }) {
  if (!linha.ajusteStatus || !linha.ajusteTexto) return null;
  const tom = linha.ajusteStatus === "pendente"
    ? { cor: TOM.alerta.text, fundo: TOM.alerta.bg, borda: TOM.alerta.border, titulo: "Ajuste esperando resposta" }
    : linha.ajusteStatus === "aceito"
      ? { cor: TOM.esmeralda.text, fundo: TOM.esmeralda.bg, borda: TOM.esmeralda.border, titulo: "Ajuste aceito" }
      : { cor: TOM.perigo.text, fundo: TOM.perigo.bg, borda: TOM.perigo.border, titulo: "Ajuste recusado" };
  return (
    <div data-testid={`ajuste-linha-${linha.id}`} style={{ padding: "8px 12px", borderRadius: R.md, background: tom.fundo, border: `1px solid ${tom.borda}`, display: "flex", flexDirection: "column", gap: 3 }}>
      <span style={{ fontSize: FS.small, fontWeight: FW.rotulo, color: tom.cor }}>
        {tom.titulo} · pedido por {linha.ajustePedidoPor ?? "—"} em {quandoFoi(linha.ajustePedidoEm)}
      </span>
      <span style={{ fontSize: FS.body, color: T.strong, lineHeight: 1.5, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>“{linha.ajusteTexto}”</span>
      {linha.ajusteStatus !== "pendente" && (
        <span style={{ fontSize: FS.small, color: tom.cor, fontWeight: FW.medio, overflowWrap: "anywhere" }}>
          {linha.ajusteStatus === "aceito" ? "Aceito" : "Recusado"}{linha.ajusteRespondidoPor ? ` por ${linha.ajusteRespondidoPor}` : ""} em {quandoFoi(linha.ajusteRespondidoEm)}{linha.ajusteResposta ? `: ${linha.ajusteResposta}` : ""}
        </span>
      )}
    </div>
  );
}

export function ListaCarregando({ linhas = 3 }: { linhas?: number }) {
  return (
    <div aria-busy="true" data-testid="skeleton-pedidos" style={{ padding: "8px 16px" }}>
      {/* O esqueleto é mudo para quem não vê as barras piscando: sem esta
          frase, "carregando" e "vazio" soavam iguais. */}
      <span role="status" className="sr-only">Carregando as solicitações…</span>
      {Array.from({ length: linhas }, (_, i) => (
        <div key={i} className="animate-pulse" style={{ display: "flex", flexDirection: "column", gap: 8, padding: "14px 0", borderBottom: i < linhas - 1 ? `1px solid ${N.n3}` : "none" }}>
          <div style={{ width: "45%", height: 12, borderRadius: R.sm, background: T.border }} />
          <div style={{ width: "80%", height: 10, borderRadius: R.sm, background: N.n3 }} />
          <div style={{ width: "30%", height: 10, borderRadius: R.sm, background: N.n3 }} />
        </div>
      ))}
    </div>
  );
}

export { T };
