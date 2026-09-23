// ─────────────────────────────────────────────────────────────────────────────
// CARTÃO DA SOLICITAÇÃO — o mesmo nas telas (página de solicitações, painel do
// evento). Em cima, a solicitação: status calculado, quantas peças, quem pediu,
// há quanto tempo. Embaixo, CADA PEÇA com o próprio status, evento,
// patrocinadores, prazo, o que foi pedido, andamento e as ações dela. Quem usa
// decide as AÇÕES; o conteúdo e a hierarquia são fixos.
// ─────────────────────────────────────────────────────────────────────────────
import type { ReactNode } from "react";
import { Link } from "wouter";
import { Lock } from "lucide-react";
import {
  patrocinadoresDaLinha,
  quantidadeDoPedido,
  resumoDasLinhas,
  rotuloDaLinha,
  type LinhaDoPedido,
  type PedidoDePeca,
  type SeloDoEvento,
} from "@shared/pedidos-de-peca";
import { T, FS, R, N, TOM } from "@/lib/theme";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  AjusteDaLinha,
  AndamentoDaLinha,
  EstadoDoPedido,
  IdadeDoPedido,
  ObservacaoDoPedido,
  PrazoDaLinha,
  QuemAgeNaLinha,
  ReferenciasDoPedido,
  SeloDoEventoChip,
  TOM_DO_PEDIDO,
  diaDoEvento,
  diaEMes,
  medidaDaLinha,
  quandoFoi,
} from "@/components/pedidos/ui";

export type AcaoDoCartao = {
  chave: string;
  rotulo: string;
  tom: "criar" | "secundario" | "perigo";
  onClick?: () => void;
  href?: string;
  /** Motivo do bloqueio: o botão fica VISÍVEL e desabilitado, com o porquê. */
  bloqueio?: string | null;
  /** Salvando esta ação agora: trava sem virar "motivo" (o rótulo diz o que acontece). */
  ocupado?: boolean;
  testId: string;
};

const TONS: Record<AcaoDoCartao["tom"], { fundo: string; cor: string; borda: string }> = {
  criar:      { fundo: TOM.alerta.text, cor: T.surface, borda: TOM.alerta.text },
  secundario: { fundo: T.surface, cor: T.text, borda: T.border },
  perigo:     { fundo: T.surface, cor: TOM.perigo.text, borda: TOM.perigo.border },
};

/**
 * Um bloqueio é MOTIVO quando explica algo; "Salvando…" é estado passageiro.
 * Chamadores antigos (o painel do evento) ainda mandam o estado de salvamento
 * como `bloqueio` — sem este filtro a frase "Salvando…" apareceria como razão.
 */
const ehMotivo = (texto: string | null | undefined): texto is string => !!texto && !/…$/.test(texto.trim());

export function BotaoDoCartao({ acao, altura, descritoPor }: { acao: AcaoDoCartao; altura: number; descritoPor?: string }) {
  const tom = TONS[acao.tom];
  const bloqueado = !!acao.bloqueio || !!acao.ocupado;
  const estilo: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5, height: altura, padding: "0 12px",
    borderRadius: R.md, fontSize: 12.5, fontWeight: 800, whiteSpace: "nowrap", textDecoration: "none",
    border: `1px solid ${bloqueado ? T.border : tom.borda}`,
    background: bloqueado ? N.n2 : tom.fundo,
    color: bloqueado ? T.second : tom.cor,
    cursor: acao.ocupado ? "wait" : bloqueado ? "not-allowed" : "pointer",
    transition: "background-color 0.12s, border-color 0.12s",
  };
  if (acao.href && !bloqueado) {
    return <Link href={acao.href} data-testid={acao.testId} style={estilo}>{acao.rotulo}</Link>;
  }
  // BLOQUEADO NÃO É `disabled`: botão desabilitado sai da ordem do Tab e não
  // dispara o `title` no hover — quem usa teclado ou toque nunca descobria o
  // porquê. Fica focável, anuncia "indisponível" e aponta para a frase visível.
  const motivo = ehMotivo(acao.bloqueio) ? acao.bloqueio : null;
  return (
    <button type="button" data-testid={acao.testId} disabled={!!acao.ocupado} title={motivo ?? undefined}
      aria-disabled={bloqueado} aria-busy={acao.ocupado || undefined}
      aria-describedby={motivo && descritoPor ? descritoPor : undefined}
      onClick={bloqueado ? undefined : acao.onClick} style={estilo}>
      {motivo && <Lock size={12} aria-hidden="true" />}
      {acao.rotulo}
    </button>
  );
}

/** O porquê dos botões travados, escrito — uma vez por motivo, sob as ações. */
export function MotivosDoBloqueio({ acoes, id }: { acoes: AcaoDoCartao[]; id: string }) {
  const motivos = Array.from(new Set(acoes.map((a) => a.bloqueio).filter(ehMotivo)));
  if (motivos.length === 0) return null;
  return (
    <div id={id} data-testid={id} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {motivos.map((m) => (
        <p key={m} style={{ margin: 0, display: "flex", gap: 6, alignItems: "flex-start", fontSize: FS.small, color: T.apoio, lineHeight: 1.45 }}>
          <Lock size={12} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} /> {m}
        </p>
      ))}
    </div>
  );
}

/** Uma peça da solicitação: status, o que é, para quem, onde, até quando. */
export function LinhaDoCartao({ linha, agora, selo, acoes = [], mostrarEvento = true, extra }: {
  linha: LinhaDoPedido;
  agora: Date;
  selo: SeloDoEvento | null;
  acoes?: AcaoDoCartao[];
  mostrarEvento?: boolean;
  extra?: ReactNode;
}) {
  const isMobile = useIsMobile();
  const medida = medidaDaLinha(linha);
  const tom = TOM_DO_PEDIDO[linha.status] ?? TOM_DO_PEDIDO.cancelado;
  return (
    <li data-testid={`linha-pedido-${linha.id}`}
      style={{ listStyle: "none", padding: "10px 12px", borderRadius: R.md, border: `1px solid ${T.border}`, borderLeft: `3px solid ${tom.borda}`, background: T.surface, display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", minWidth: 0 }}>
        <EstadoDoPedido status={linha.status} />
        <strong style={{ fontSize: 14, color: T.text }}>{quantidadeDoPedido(linha.quantidade)}</strong>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: T.text, minWidth: 0, overflowWrap: "anywhere" }}>
          {rotuloDaLinha(linha)}{medida ? ` · ${medida}` : ""}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", fontSize: FS.body, color: T.apoio }}>
        <span data-testid={`patrocinadores-linha-${linha.id}`} style={{ fontWeight: 600, color: linha.sponsors?.length ? T.strong : T.second }}>
          {patrocinadoresDaLinha(linha)}
        </span>
        {mostrarEvento && (
          <span>· {linha.eventName ?? "Evento removido"}{linha.eventStart ? ` · ${diaDoEvento(linha.eventStart)}` : ""}</span>
        )}
        <PrazoDaLinha linha={linha} agora={agora} />
        <SeloDoEventoChip selo={selo} pedidoId={linha.id} />
      </div>
      <ObservacaoDoPedido valor={linha.observacao} />
      <ReferenciasDoPedido urls={linha.referencias ?? []} />
      <AndamentoDaLinha linha={linha} />
      <AjusteDaLinha linha={linha} />
      {linha.status === "recusado" && (
        <p style={{ margin: 0, fontSize: FS.body, color: TOM.perigo.text }}>
          Recusada em {diaEMes(linha.resolvidoEm)}{linha.resolvidoPor ? ` por ${linha.resolvidoPor}` : ""}: {linha.motivoRecusa}
        </p>
      )}
      {linha.status === "cancelado" && (
        <p style={{ margin: 0, fontSize: FS.body, color: T.apoio }}>
          Cancelada em {diaEMes(linha.resolvidoEm)}{linha.resolvidoPor ? ` por ${linha.resolvidoPor}` : ""}{linha.motivoCancelamento ? `: ${linha.motivoCancelamento}` : ""}
        </p>
      )}
      {/* "Quem precisa agir?" — dito logo acima das ações da peça. */}
      <QuemAgeNaLinha linha={linha} />
      {acoes.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {/* 36 e não 32: a régua da casa no ponteiro. Uma altura só para as
              ações da peça, da solicitação e do detalhe — eram 32, 34 e 36. */}
          {acoes.map((a) => <BotaoDoCartao key={a.chave} acao={a} altura={isMobile ? 44 : 36} descritoPor={`bloqueio-linha-${linha.id}`} />)}
        </div>
      )}
      <MotivosDoBloqueio acoes={acoes} id={`bloqueio-linha-${linha.id}`} />
      {extra}
    </li>
  );
}

export function CartaoDoPedido({ pedido, linhas, agora, seloDe, acoesDaLinha, acoes = [], mostrarEvento = true, extraDaLinha, onAbrir }: {
  pedido: PedidoDePeca;
  /** Quais peças mostrar (o painel do evento mostra só as daquele evento). */
  linhas?: LinhaDoPedido[];
  agora: Date;
  seloDe: (linha: LinhaDoPedido) => SeloDoEvento | null;
  acoesDaLinha: (linha: LinhaDoPedido) => AcaoDoCartao[];
  /** Ações da solicitação inteira (ex.: cancelar tudo enquanto nada foi feito). */
  acoes?: AcaoDoCartao[];
  mostrarEvento?: boolean;
  /** Conteúdo sob uma peça (ex.: escolher a peça que já existe). */
  extraDaLinha?: (linha: LinhaDoPedido) => ReactNode;
  /** Abre o detalhe da solicitação (com histórico). */
  onAbrir?: () => void;
}) {
  const isMobile = useIsMobile();
  const visiveis = linhas ?? pedido.linhas;
  const n = pedido.linhas.length;
  const titulo = (
    <>
      <EstadoDoPedido status={pedido.status} />
      <strong style={{ flexShrink: 0, fontSize: 14, color: T.text, textDecoration: onAbrir ? "underline" : "none", textDecorationColor: T.bdark, textUnderlineOffset: 3 }}>
        Solicitação · {n} {n === 1 ? "peça" : "peças"}
      </strong>
      {n > 1 && <span style={{ fontSize: FS.body, color: T.apoio, minWidth: 0 }}>{resumoDasLinhas(pedido.linhas)}</span>}
    </>
  );
  const todasAsAcoes: AcaoDoCartao[] = onAbrir
    ? [{ chave: "detalhes", rotulo: "Detalhes", tom: "secundario", onClick: onAbrir, testId: `button-detalhes-pedido-${pedido.id}` }, ...acoes]
    : acoes;
  return (
    <li data-testid={`pedido-${pedido.id}`} style={{ listStyle: "none", padding: "14px 16px", borderBottom: `1px solid ${N.n3}`, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <div style={{ flex: "1 1 auto", minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
          {onAbrir ? (
            <button type="button" onClick={onAbrir} aria-label={`Ver detalhes da solicitação de ${pedido.pedidoPor ?? "Atendimento"}`} data-testid={`abrir-pedido-${pedido.id}`}
              style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", minWidth: 0, padding: 0, border: "none", background: "none", cursor: "pointer", textAlign: "left", minHeight: isMobile ? 44 : undefined }}>
              {titulo}
            </button>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", minWidth: 0 }}>{titulo}</div>
          )}
          <span style={{ fontSize: FS.small, color: T.apoio }}>
            Solicitada por {pedido.pedidoPor ?? "—"} · entrou em {quandoFoi(pedido.createdAt)}
          </span>
        </div>
        <IdadeDoPedido pedido={pedido} agora={agora} />
      </div>
      <ul style={{ margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
        {visiveis.map((l) => (
          <LinhaDoCartao key={l.id} linha={l} agora={agora} selo={seloDe(l)} acoes={acoesDaLinha(l)} mostrarEvento={mostrarEvento} extra={extraDaLinha?.(l)} />
        ))}
      </ul>
      {todasAsAcoes.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {todasAsAcoes.map((a) => <BotaoDoCartao key={a.chave} acao={a} altura={isMobile ? 44 : 36} />)}
        </div>
      )}
    </li>
  );
}
