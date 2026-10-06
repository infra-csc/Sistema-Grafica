// ─────────────────────────────────────────────────────────────────────────────
// CARTÃO DA SOLICITAÇÃO — o mesmo nas telas (página de solicitações, painel do
// evento). Em cima, a solicitação: status calculado, quantas peças, quem pediu,
// há quanto tempo. Embaixo, CADA PEÇA com o próprio status, evento,
// patrocinadores, prazo, o que foi pedido, andamento e as ações dela. Quem usa
// decide as AÇÕES; o conteúdo e a hierarquia são fixos.
//
// HIERARQUIA (redesenho 06/10). A solicitação é o ENVELOPE; as peças são o
// conteúdo. Antes cada peça era uma caixa com borda dentro do cartão da
// solicitação, dentro do cartão da lista — três molduras para uma coisa só, e
// o "Detalhes" vivia numa fileira própria no pé. Agora:
//   · o envelope é uma linha de cabeçalho leve, com o "Detalhes" à direita;
//   · as peças de uma solicitação formam UM bloco, separadas por um fio, cada
//     uma com o trilho da cor do status à esquerda (a mesma cor do selo);
//   · com espaço (container query `.ped-linhas`), as ações da peça sobem para
//     uma coluna à direita, alinhada de peça em peça — quem atende varre a
//     fila de cima a baixo e acha o "Criar peça" sempre no mesmo lugar.
// ─────────────────────────────────────────────────────────────────────────────
import type { ReactNode } from "react";
import { Link } from "wouter";
import { ChevronRight, Lock } from "lucide-react";
import {
  patrocinadoresDaLinha,
  quantidadeDoPedido,
  resumoDasLinhas,
  rotuloDaLinha,
  type LinhaDoPedido,
  type PedidoDePeca,
  type SeloDoEvento,
  type StatusDaSolicitacao,
} from "@shared/pedidos-de-peca";
import { T, FS, R, N, TOM, FW } from "@/lib/theme";
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
  diaDoEvento,
  diaEMes,
  medidaDaLinha,
  quandoFoi,
  type VistaDoPedido,
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

// O primário da peça é âmbar-escuro (a cor da Solicitação no app: o ícone do
// cabeçalho, a faixa de abertas), não o preto do primário geral — na fila, o
// "Criar peça" precisa ser achado de relance entre dezenas de botões brancos.
// "perigo" usa a classe de hover do perigoSecundario do design system.
const TONS: Record<AcaoDoCartao["tom"], { fundo: string; cor: string; borda: string; classe: string }> = {
  criar:      { fundo: TOM.alerta.text, cor: T.surface, borda: TOM.alerta.text, classe: "ds-botao" },
  secundario: { fundo: T.surface, cor: T.text, borda: T.bdark, classe: "ds-botao ds-botao-fantasma" },
  perigo:     { fundo: T.surface, cor: TOM.perigo.text, borda: TOM.perigo.border, classe: "ds-botao ds-botao-perigo-secundario" },
};

/** O trilho à esquerda da peça: o tom SATURADO do status (o selo usa o claro). */
export const TRILHO_DO_PEDIDO: Record<StatusDaSolicitacao, string> = {
  aberto: TOM.alerta.dot,
  parcial: TOM.ceu.dot,
  atendido: TOM.esmeralda.dot,
  recusado: TOM.perigo.dot,
  cancelado: T.bdark,
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
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, height: altura, padding: "0 14px",
    borderRadius: R.md, fontSize: FS.body, fontWeight: FW.forte, whiteSpace: "nowrap", textDecoration: "none", boxSizing: "border-box",
    borderWidth: 1, borderStyle: "solid", borderColor: bloqueado ? T.border : tom.borda,
    backgroundColor: bloqueado ? N.n2 : tom.fundo,
    color: bloqueado ? T.second : tom.cor,
    cursor: acao.ocupado ? "wait" : bloqueado ? "not-allowed" : "pointer",
    transition: "background-color 0.12s, border-color 0.12s, filter 0.12s",
  };
  // Hover/pressionado do design system (.ds-botao) só no que responde a
  // clique: o bloqueado usa aria-disabled, que o :not(:disabled) da classe
  // não enxerga — acenderia um botão que não vai agir.
  const classe = bloqueado ? undefined : tom.classe;
  if (acao.href && !bloqueado) {
    return <Link href={acao.href} data-testid={acao.testId} className={classe} style={estilo}>{acao.rotulo}</Link>;
  }
  // BLOQUEADO NÃO É `disabled`: botão desabilitado sai da ordem do Tab e não
  // dispara o `title` no hover — quem usa teclado ou toque nunca descobria o
  // porquê. Fica focável, anuncia "indisponível" e aponta para a frase visível.
  const motivo = ehMotivo(acao.bloqueio) ? acao.bloqueio : null;
  return (
    <button type="button" data-testid={acao.testId} disabled={!!acao.ocupado} title={motivo ?? undefined}
      aria-disabled={bloqueado} aria-busy={acao.ocupado || undefined}
      aria-describedby={motivo && descritoPor ? descritoPor : undefined}
      onClick={bloqueado ? undefined : acao.onClick} className={classe} style={estilo}>
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
export function LinhaDoCartao({ linha, agora, selo, acoes = [], mostrarEvento = true, extra, vista }: {
  linha: LinhaDoPedido;
  agora: Date;
  selo: SeloDoEvento | null;
  acoes?: AcaoDoCartao[];
  mostrarEvento?: boolean;
  extra?: ReactNode;
  /** Quem está vendo — muda só a frase "quem precisa agir" (é você?). */
  vista?: VistaDoPedido;
}) {
  const isMobile = useIsMobile();
  const medida = medidaDaLinha(linha);
  return (
    <li data-testid={`linha-pedido-${linha.id}`} className="ped-linha"
      style={{ listStyle: "none", position: "relative", padding: isMobile ? "12px 12px 12px 15px" : "14px 16px 14px 19px", background: T.surface, minWidth: 0 }}>
      <span aria-hidden="true" style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: TRILHO_DO_PEDIDO[linha.status] ?? T.bdark }} />
      <div className="ped-linha__grade">
        <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", minWidth: 0 }}>
            <EstadoDoPedido status={linha.status} />
            <span style={{ minWidth: 0, overflowWrap: "anywhere", fontSize: FS.strong, lineHeight: 1.35, color: T.text }}>
              <strong style={{ fontWeight: FW.rotulo, fontVariantNumeric: "tabular-nums" }}>{quantidadeDoPedido(linha.quantidade)}</strong>
              <span aria-hidden="true" style={{ color: T.bdark, margin: "0 6px" }}>·</span>
              <strong style={{ fontWeight: FW.forte }}>{rotuloDaLinha(linha)}</strong>
              {medida && <span style={{ fontSize: FS.body, fontWeight: FW.medio, color: T.apoio, marginLeft: 8, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{medida}</span>}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", columnGap: isMobile ? 10 : 6, rowGap: 4, flexWrap: "wrap", fontSize: FS.body, color: T.apoio, lineHeight: 1.45 }}>
            <span data-testid={`patrocinadores-linha-${linha.id}`} style={{ fontWeight: FW.medio, color: linha.sponsors?.length ? T.strong : T.second, overflowWrap: "anywhere" }}>
              {patrocinadoresDaLinha(linha)}
              {/* O "·" fica no FIM dos patrocinadores, não no começo do evento:
                  quando a linha quebra, ele termina a de cima em vez de abrir
                  a de baixo, órfão. No celular não há "·" — cada um quebra. */}
              {mostrarEvento && !isMobile && <span aria-hidden="true" style={{ color: T.bdark, fontWeight: FW.corpo, marginLeft: 6 }}>·</span>}
            </span>
            {mostrarEvento && (
              <span style={{ overflowWrap: "anywhere" }}>
                {linha.eventName ?? "Evento removido"}{linha.eventStart ? <span style={{ fontVariantNumeric: "tabular-nums" }}> · {diaDoEvento(linha.eventStart)}</span> : ""}
              </span>
            )}
            <PrazoDaLinha linha={linha} agora={agora} />
            <SeloDoEventoChip selo={selo} pedidoId={linha.id} />
          </div>
          <ObservacaoDoPedido valor={linha.observacao} />
          <ReferenciasDoPedido urls={linha.referencias ?? []} />
          <AndamentoDaLinha linha={linha} />
          <AjusteDaLinha linha={linha} />
          {linha.status === "recusado" && (
            <p style={{ margin: 0, fontSize: FS.body, color: TOM.perigo.text, lineHeight: 1.5, overflowWrap: "anywhere" }}>
              <strong style={{ fontWeight: FW.forte }}>Recusada</strong> em {diaEMes(linha.resolvidoEm)}{linha.resolvidoPor ? ` por ${linha.resolvidoPor}` : ""}: {linha.motivoRecusa}
            </p>
          )}
          {linha.status === "cancelado" && (
            <p style={{ margin: 0, fontSize: FS.body, color: T.apoio, lineHeight: 1.5, overflowWrap: "anywhere" }}>
              <strong style={{ fontWeight: FW.forte, color: T.strong }}>Cancelada</strong> em {diaEMes(linha.resolvidoEm)}{linha.resolvidoPor ? ` por ${linha.resolvidoPor}` : ""}{linha.motivoCancelamento ? `: ${linha.motivoCancelamento}` : ""}
            </p>
          )}
          {/* "Quem precisa agir?" — dito logo antes das ações da peça. */}
          <QuemAgeNaLinha linha={linha} vista={vista} />
        </div>
        {acoes.length > 0 && (
          <div className="ped-linha__acoes" style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
            <div className="ped-linha__botoes" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {/* 36 no ponteiro, 44 no toque — uma altura só para as ações da
                  peça, da solicitação e do detalhe. */}
              {acoes.map((a) => <BotaoDoCartao key={a.chave} acao={a} altura={isMobile ? 44 : 36} descritoPor={`bloqueio-linha-${linha.id}`} />)}
            </div>
            <MotivosDoBloqueio acoes={acoes} id={`bloqueio-linha-${linha.id}`} />
          </div>
        )}
      </div>
      {extra}
    </li>
  );
}

export function CartaoDoPedido({ pedido, linhas, agora, seloDe, acoesDaLinha, acoes = [], mostrarEvento = true, extraDaLinha, onAbrir, vista }: {
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
  /** Quem está vendo (página de solicitações): a frase de quem age diz "você". */
  vista?: VistaDoPedido;
}) {
  const isMobile = useIsMobile();
  const visiveis = linhas ?? pedido.linhas;
  const n = pedido.linhas.length;
  // Com uma peça só, o selo da solicitação é o mesmo da peça logo abaixo —
  // dois "Aberta" empilhados. Fica só o da peça.
  const titulo = (
    <>
      {n > 1 && <EstadoDoPedido status={pedido.status} />}
      <strong className={onAbrir ? "ped-cartao__nome" : undefined} style={{ flexShrink: 0, fontSize: FS.read, fontWeight: FW.forte, color: T.text }}>
        Solicitação · {n} {n === 1 ? "peça" : "peças"}
      </strong>
      {n > 1 && <span style={{ fontSize: FS.body, color: T.apoio, minWidth: 0 }}>{resumoDasLinhas(pedido.linhas)}</span>}
    </>
  );
  const detalhes: AcaoDoCartao | null = onAbrir
    ? { chave: "detalhes", rotulo: "Detalhes", tom: "secundario", onClick: onAbrir, testId: `button-detalhes-pedido-${pedido.id}` }
    : null;
  // No celular o "Detalhes" volta para a fileira de baixo, com as ações da
  // solicitação: ao lado do título ele espremia o nome em duas linhas.
  const rodape: AcaoDoCartao[] = isMobile && detalhes ? [detalhes, ...acoes] : acoes;
  return (
    <li data-testid={`pedido-${pedido.id}`} className="ped-cartao" style={{ listStyle: "none", padding: isMobile ? "16px 16px 18px" : "18px 20px 20px", borderBottom: `1px solid ${T.border}`, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <div style={{ flex: "1 1 auto", minWidth: 0, display: "flex", flexDirection: "column", gap: 0 }}>
          {onAbrir ? (
            <button type="button" onClick={onAbrir} aria-label={`Ver detalhes da solicitação de ${pedido.pedidoPor ?? "Atendimento"}`} data-testid={`abrir-pedido-${pedido.id}`}
              className="ped-cartao__abrir"
              style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", minWidth: 0, padding: 0, border: "none", background: "none", cursor: "pointer", textAlign: "left", minHeight: isMobile ? 44 : 36, borderRadius: R.sm }}>
              {titulo}
            </button>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", minWidth: 0, minHeight: isMobile ? 44 : 36 }}>{titulo}</div>
          )}
          <span style={{ fontSize: FS.meta, color: T.apoio, lineHeight: 1.4, display: "flex", flexWrap: "wrap", columnGap: 6 }}>
            <span>{pedido.pedidoPor ?? "—"}</span>{!isMobile && <span aria-hidden="true" style={{ color: T.bdark }}>·</span>}<span style={{ whiteSpace: "nowrap" }}>entrou em <span style={{ fontVariantNumeric: "tabular-nums" }}>{quandoFoi(pedido.createdAt)}</span></span>
          </span>
        </div>
        {/* Mesma altura da linha do título (36/44): "hoje" e "Detalhes" ficam
            centrados nela, em vez de flutuar acima do nome. */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0, minHeight: isMobile ? 44 : 36 }}>
          <IdadeDoPedido pedido={pedido} agora={agora} />
          {!isMobile && onAbrir && (
            <button type="button" onClick={onAbrir} data-testid={`button-detalhes-pedido-${pedido.id}`} className="ds-botao ds-botao-fantasma"
              style={{ display: "inline-flex", alignItems: "center", gap: 2, height: 36, padding: "0 6px 0 12px", borderRadius: R.md, border: `1px solid ${T.border}`, backgroundColor: T.surface, color: T.text, fontSize: FS.body, fontWeight: FW.forte, cursor: "pointer", whiteSpace: "nowrap" }}>
              Detalhes <ChevronRight size={15} aria-hidden="true" style={{ color: T.apoio }} />
            </button>
          )}
        </div>
      </div>
      <ul className="ped-linhas" style={{ margin: 0, padding: 0, borderRadius: R.md, border: `1px solid ${T.border}`, overflow: "hidden", background: T.surface }}>
        {visiveis.map((l) => (
          <LinhaDoCartao key={l.id} linha={l} agora={agora} selo={seloDe(l)} acoes={acoesDaLinha(l)} mostrarEvento={mostrarEvento} extra={extraDaLinha?.(l)} vista={vista} />
        ))}
      </ul>
      {rodape.length > 0 && (
        <div className={isMobile ? "ped-rodape-toque" : undefined} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {rodape.map((a) => <BotaoDoCartao key={a.chave} acao={a} altura={isMobile ? 44 : 36} />)}
        </div>
      )}
    </li>
  );
}
