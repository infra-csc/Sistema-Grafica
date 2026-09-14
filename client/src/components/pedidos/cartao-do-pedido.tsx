// ─────────────────────────────────────────────────────────────────────────────
// CARTÃO DO PEDIDO — a mesma linha nas três telas (aba do Atendimento, caixa
// da Solicitação, painel do evento). Quem usa decide as AÇÕES; o conteúdo e a
// hierarquia são fixos: estado e quantidade primeiro, depois patrocinador,
// evento/prazo, o que foi pedido, e — se atendido — as peças andando.
// ─────────────────────────────────────────────────────────────────────────────
import type { ReactNode } from "react";
import { Link } from "wouter";
import { quantidadeDoPedido, type PedidoDePeca, type SeloDoEvento } from "@shared/pedidos-de-peca";
import { T, FS, R } from "@/lib/theme";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  AndamentoDoPedido,
  EspecificacaoDoPedido,
  EstadoDoPedido,
  IdadeDoPedido,
  ObservacaoDoPedido,
  PrazoDoPedido,
  ReferenciasDoPedido,
  SeloDoEventoChip,
  diaDoEvento,
  diaEMes,
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
  testId: string;
};

const TONS: Record<AcaoDoCartao["tom"], { fundo: string; cor: string; borda: string }> = {
  criar:      { fundo: "#b45309", cor: "#ffffff", borda: "#b45309" },
  secundario: { fundo: "#ffffff", cor: "#1c1917", borda: "#e7e5e4" },
  perigo:     { fundo: "#ffffff", cor: "#b91c1c", borda: "#fecaca" },
};

export function BotaoDoCartao({ acao, altura }: { acao: AcaoDoCartao; altura: number }) {
  const tom = TONS[acao.tom];
  const bloqueado = !!acao.bloqueio;
  const estilo: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", justifyContent: "center", height: altura, padding: "0 12px",
    borderRadius: R.md, fontSize: 12.5, fontWeight: 800, whiteSpace: "nowrap", textDecoration: "none",
    border: `1px solid ${bloqueado ? "#e7e5e4" : tom.borda}`,
    background: bloqueado ? "#f5f5f4" : tom.fundo,
    color: bloqueado ? "#78716c" : tom.cor,
    cursor: bloqueado ? "not-allowed" : "pointer",
  };
  if (acao.href && !bloqueado) {
    return <Link href={acao.href} data-testid={acao.testId} style={estilo}>{acao.rotulo}</Link>;
  }
  return (
    <button type="button" data-testid={acao.testId} disabled={bloqueado} title={acao.bloqueio ?? undefined}
      aria-disabled={bloqueado} onClick={acao.onClick} style={estilo}>
      {acao.rotulo}
    </button>
  );
}

export function CartaoDoPedido({ pedido, agora, selo, acoes = [], mostrarEvento = true, extra, onAbrir }: {
  pedido: PedidoDePeca;
  agora: Date;
  selo: SeloDoEvento | null;
  acoes?: AcaoDoCartao[];
  mostrarEvento?: boolean;
  /** Conteúdo sob o cartão (ex.: escolher a peça que já existe). */
  extra?: ReactNode;
  /** Abre o detalhe do pedido (com histórico). */
  onAbrir?: () => void;
}) {
  const isMobile = useIsMobile();
  const patrocinador = pedido.sponsorName ?? "Patrocinador removido";
  const titulo = (
    <>
      <EstadoDoPedido status={pedido.status} />
      <strong style={{ flexShrink: 0, fontSize: 14, color: T.text }}>{quantidadeDoPedido(pedido.quantidade)}</strong>
      <span title={patrocinador} style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13.5, fontWeight: 700, color: T.text, textDecoration: onAbrir ? "underline" : "none", textDecorationColor: "#d6d3d1", textUnderlineOffset: 3 }}>
        {patrocinador}
      </span>
    </>
  );
  const todasAsAcoes: AcaoDoCartao[] = onAbrir
    ? [{ chave: "detalhes", rotulo: "Detalhes", tom: "secundario", onClick: onAbrir, testId: `button-detalhes-pedido-${pedido.id}` }, ...acoes]
    : acoes;
  return (
    <li data-testid={`pedido-${pedido.id}`} style={{ listStyle: "none", padding: "14px 16px", borderBottom: "1px solid #f1f0ef", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <div style={{ flex: "1 1 auto", minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
          {onAbrir ? (
            <button type="button" onClick={onAbrir} aria-label={`Ver detalhes do pedido de ${patrocinador}`} data-testid={`abrir-pedido-${pedido.id}`}
              style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, padding: 0, border: "none", background: "none", cursor: "pointer", textAlign: "left", minHeight: isMobile ? 44 : undefined }}>
              {titulo}
            </button>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>{titulo}</div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            {mostrarEvento && (
              <span style={{ fontSize: FS.body, color: "#57534e" }}>
                {pedido.eventName ?? "Evento removido"}{pedido.eventStart ? ` · ${diaDoEvento(pedido.eventStart)}` : ""}
              </span>
            )}
            <PrazoDoPedido pedido={pedido} agora={agora} />
            <SeloDoEventoChip selo={selo} pedidoId={pedido.id} />
          </div>
          <EspecificacaoDoPedido pedido={pedido} />
          <ObservacaoDoPedido valor={pedido.observacao} />
          <ReferenciasDoPedido urls={pedido.referencias ?? []} />
          <AndamentoDoPedido pedido={pedido} />
          {pedido.status === "recusado" && (
            <p style={{ margin: 0, fontSize: FS.body, color: "#991b1b" }}>
              Recusado em {diaEMes(pedido.resolvidoEm)}{pedido.resolvidoPor ? ` por ${pedido.resolvidoPor}` : ""}: {pedido.motivoRecusa}
            </p>
          )}
          {pedido.status === "cancelado" && (
            <p style={{ margin: 0, fontSize: FS.body, color: "#57534e" }}>
              Cancelado em {diaEMes(pedido.resolvidoEm)}{pedido.resolvidoPor ? ` por ${pedido.resolvidoPor}` : ""}{pedido.motivoCancelamento ? `: ${pedido.motivoCancelamento}` : ""}
            </p>
          )}
          <span style={{ fontSize: FS.small, color: "#57534e" }}>
            Pedido por {pedido.pedidoPor ?? "—"} · entrou em {quandoFoi(pedido.createdAt)}
            {pedido.editadoEm ? ` · editado${pedido.editadoPor ? ` por ${pedido.editadoPor}` : ""} em ${quandoFoi(pedido.editadoEm)}` : ""}
          </span>
        </div>
        <IdadeDoPedido pedido={pedido} agora={agora} />
      </div>
      {todasAsAcoes.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {todasAsAcoes.map((a) => <BotaoDoCartao key={a.chave} acao={a} altura={isMobile ? 44 : 34} />)}
        </div>
      )}
      {extra}
    </li>
  );
}
