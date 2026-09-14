// ─────────────────────────────────────────────────────────────────────────────
// PEDIDOS DE PEÇA DO ATENDIMENTO (dono, 14/09).
//
// "Uma tela onde o pessoal do Atendimento pode solicitar peças para a pessoa
// que cria a lista colocar nos eventos." Decisões do dono:
//   · o pedido nasce na aba do Atendimento: evento, patrocinador, quantidade,
//     observação e referências (várias);
//   · quem pede: Atendimento e admin; quem resolve: a Solicitação (e admin);
//   · aparece na tela de Eventos, dentro do evento e numa caixa da Solicitação;
//   · aviso por notificação no sistema — para QUEM PEDIU, não o departamento.
//
// Ciclo:
//   aberto ──criar/ligar peça──▶ atendido (pode ganhar mais peças)
//   aberto ──recusar (motivo)──▶ recusado
//   aberto ──cancelar (motivo)─▶ cancelado   (só enquanto ninguém agiu)
//   atendido / recusado / cancelado ──reabrir (motivo)──▶ aberto
//   atendido ──pedir ajuste (texto)──▶ ajuste pendente ──aceitar | recusar (motivo)
//
// O Atendimento NÃO edita (dono, 14/09): errou, cancela enquanto está aberta e
// cria outra. Depois que a Solicitação agiu, só pede um ajuste — e quem monta
// a lista decide se aceita.
//
// O PEDIDO É UMA SOLICITAÇÃO, NÃO UMA PEÇA: a peça só existe depois de
// atendido, e o pedido acompanha a peça (e as demais) até a entrega.
// ─────────────────────────────────────────────────────────────────────────────

export const STATUS_DO_PEDIDO = ["aberto", "atendido", "recusado", "cancelado"] as const;
export type StatusDoPedido = (typeof STATUS_DO_PEDIDO)[number];

export const ROTULO_DO_PEDIDO: Record<StatusDoPedido, string> = {
  aberto: "Aberta",
  atendido: "Atendida",
  recusado: "Recusada",
  cancelado: "Cancelada",
};

export const MAX_REFERENCIAS_DO_PEDIDO = 10;

/** Cancelar, recusar e reabrir pedem uma frase de verdade: pedido negado sem
 *  explicação volta como o mesmo pedido na semana seguinte. */
export const MIN_MOTIVO_DO_PEDIDO = 10;

/** Ajuste pedido pelo Atendimento numa solicitação já atendida. */
export const STATUS_DO_AJUSTE = ["pendente", "aceito", "recusado"] as const;
export type StatusDoAjuste = (typeof STATUS_DO_AJUSTE)[number];

/** Um ajuste por vez, e só depois de atendida. */
export const podePedirAjuste = (p: { status: string; ajusteStatus?: string | null }): boolean =>
  p.status === "atendido" && p.ajusteStatus !== "pendente";

export const ajustePendente = (p: { ajusteStatus?: string | null }): boolean => p.ajusteStatus === "pendente";

/** Referência só pode ser arquivo enviado pelo próprio app (/objects/…) ou um
 *  endereço https. Qualquer outra coisa — em especial `javascript:` — vira
 *  link clicável na tela e executaria código na sessão de quem clica. */
export function ehReferenciaValida(url: unknown): url is string {
  if (typeof url !== "string" || url.length > 2048) return false;
  return /^\/objects\/[A-Za-z0-9._~\-/]+$/.test(url) || /^https:\/\/[^\s"'<>\\]+$/.test(url);
}

export interface PecaDoPedido {
  id: string;
  displayId: string | null;
  type: string;
  quantity: number;
  status: string;
}

/** O pedido como a API devolve (com nomes resolvidos e as peças que saíram). */
export interface PedidoDePeca {
  id: string;
  eventId: string;
  sponsorId: string | null;
  quantidade: number;
  observacao: string;
  referencias: string[];
  status: StatusDoPedido;
  precisaAte: string | null;
  tipoDePeca: string | null;
  largura: string | null;
  altura: string | null;
  pedidoPor: string | null;
  pedidoPorId: string | null;
  itemId: string | null;
  resolvidoPor: string | null;
  resolvidoEm: string | null;
  motivoRecusa: string | null;
  motivoCancelamento: string | null;
  ajusteStatus: StatusDoAjuste | null;
  ajusteTexto: string | null;
  ajustePedidoPor: string | null;
  ajustePedidoPorId: string | null;
  ajustePedidoEm: string | null;
  ajusteRespondidoPor: string | null;
  ajusteRespondidoEm: string | null;
  ajusteResposta: string | null;
  editadoPor: string | null;
  editadoEm: string | null;
  createdAt: string;
  eventName: string | null;
  eventStart: string | null;
  eventSaida: string | null;
  sponsorName: string | null;
  pecas: PecaDoPedido[];
}

export const ehChaveDePedidos = (chave: unknown): boolean =>
  String(chave ?? "").startsWith("/api/pedidos-de-peca");

/** A observação é texto do solicitante. Se algum caminho a entregar como
 *  objeto ({ texto, autor }), imprimir direto renderia "[object Object]". */
export function textoDaObservacao(valor: unknown): string {
  if (typeof valor === "string") return valor;
  if (valor && typeof valor === "object" && typeof (valor as { texto?: unknown }).texto === "string") {
    return (valor as { texto: string }).texto;
  }
  return "";
}

export const quantidadeDoPedido = (q: number | null | undefined): string => `${q ?? 0} un.`;

/** Unidades já criadas nas peças que saíram do pedido. */
export const unidadesCriadas = (pecas: PecaDoPedido[] | null | undefined): number =>
  (pecas ?? []).filter((p) => p.status !== "cancelled").reduce((s, p) => s + (p.quantity || 0), 0);

// ─── Tempo ───────────────────────────────────────────────────────────────────

const FUSO = "America/Sao_Paulo";
const DIA_MS = 86_400_000;

/** O dia do calendário em São Paulo, como instante UTC da meia-noite. */
const diaEmSaoPaulo = (d: Date): number =>
  Date.parse(`${d.toLocaleDateString("en-CA", { timeZone: FUSO })}T00:00:00Z`);

/** Dias de calendário entre duas datas, no fuso da operação. */
export function diasEntre(desde: Date | string, agora: Date): number {
  const inicio = new Date(desde);
  if (Number.isNaN(inicio.getTime())) return 0;
  return Math.max(0, Math.round((diaEmSaoPaulo(agora) - diaEmSaoPaulo(inicio)) / DIA_MS));
}

export const IDADE_DE_ATENCAO = 7;
export const IDADE_DE_PEDIDO_PARADO = 14;

export type NivelDaIdade = "normal" | "atencao" | "parado";

export function idadeDoPedido(criadoEm: Date | string, agora: Date): { dias: number; texto: string; nivel: NivelDaIdade } {
  const dias = diasEntre(criadoEm, agora);
  const texto = dias === 0 ? "hoje" : dias === 1 ? "ontem" : `há ${dias} dias`;
  const nivel: NivelDaIdade = dias > IDADE_DE_PEDIDO_PARADO ? "parado" : dias > IDADE_DE_ATENCAO ? "atencao" : "normal";
  return { dias, texto, nivel };
}

/** Idade e prazo só são informação acionável enquanto o pedido espera. */
export const pedidoEspera = (status: string): boolean => status === "aberto";

/** "Precisa até" é uma DATA (sem hora): o dia gravado lido em UTC — a mesma
 *  convenção da saída do caminhão, que é gravada no horário de exibição. */
const diaDoPrazo = (d: Date | string): number =>
  Date.parse(`${new Date(d).toISOString().slice(0, 10)}T00:00:00Z`);

export const diaEMesDoPrazo = (d: Date | string): string => {
  const iso = new Date(d).toISOString();
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
};

export type NivelDoPrazo = "vencido" | "perto" | "normal";

export function prazoDoPedido(precisaAte: Date | string | null | undefined, agora: Date): { dias: number; texto: string; nivel: NivelDoPrazo } | null {
  if (!precisaAte || Number.isNaN(new Date(precisaAte).getTime())) return null;
  const dias = Math.round((diaDoPrazo(precisaAte) - diaEmSaoPaulo(agora)) / DIA_MS);
  if (dias < 0) return { dias, texto: dias === -1 ? "prazo venceu ontem" : `prazo venceu há ${-dias} dias`, nivel: "vencido" };
  if (dias === 0) return { dias, texto: "precisa hoje", nivel: "perto" };
  if (dias === 1) return { dias, texto: "precisa amanhã", nivel: "perto" };
  return { dias, texto: `precisa até ${diaEMesDoPrazo(precisaAte)}`, nivel: dias <= 3 ? "perto" : "normal" };
}

/** Pedido com prazo DEPOIS da saída do caminhão: a peça não embarca. */
export function avisoDoPrazo(precisaAte: Date | string | null | undefined, saida: Date | string | null | undefined): string | null {
  if (!precisaAte || !saida) return null;
  if (diaDoPrazo(precisaAte) > diaDoPrazo(saida)) {
    return `O prazo é depois da saída do caminhão (${diaEMesDoPrazo(saida)}) — a peça não embarca neste evento.`;
  }
  return null;
}

// ─── O evento aceita peça? ───────────────────────────────────────────────────

export type SeloDoEvento = {
  tipo: "encerrado" | "realizado" | "caminhao";
  texto: string;
  /** Atender cria peça — num evento finalizado o servidor recusa. */
  bloqueiaAtender: boolean;
  explicacao: string;
};

/** O relógio de São Paulo lido como UTC — o mesmo "horário de exibição" em que
 *  a saída do caminhão é gravada (ver toUTCDisplayDate no cliente). */
const relogioDeSaoPaulo = (agora: Date): number =>
  Date.parse(`${agora.toLocaleString("sv-SE", { timeZone: FUSO }).replace(" ", "T")}Z`);

export function caminhaoJaSaiu(saida: Date | string | null | undefined, agora: Date): boolean {
  if (!saida) return false;
  const s = new Date(saida);
  return !Number.isNaN(s.getTime()) && s.getTime() <= relogioDeSaoPaulo(agora);
}

export function seloDoEventoDoPedido(
  evento: { motivoFim: "encerrado" | "realizado" | null; saida: Date | string | null } | null,
  agora: Date,
): SeloDoEvento | null {
  if (!evento) return null;
  if (evento.motivoFim === "encerrado") {
    return {
      tipo: "encerrado", texto: "evento encerrado", bloqueiaAtender: true,
      explicacao: "O evento foi encerrado — a lista não aceita mais peças. Reabra o evento para atender.",
    };
  }
  if (evento.motivoFim === "realizado") {
    return {
      tipo: "realizado", texto: "evento já aconteceu", bloqueiaAtender: true,
      explicacao: "O evento já aconteceu — a lista não aceita mais peças.",
    };
  }
  if (evento.saida && caminhaoJaSaiu(evento.saida, agora)) {
    const saida = new Date(evento.saida);
    const dias = Math.max(0, Math.round((Date.parse(`${new Date(relogioDeSaoPaulo(agora)).toISOString().slice(0, 10)}T00:00:00Z`)
      - Date.parse(`${saida.toISOString().slice(0, 10)}T00:00:00Z`)) / DIA_MS));
    return {
      tipo: "caminhao",
      texto: dias === 0 ? "caminhão já saiu hoje" : dias === 1 ? "caminhão já saiu há 1 dia" : `caminhão já saiu há ${dias} dias`,
      bloqueiaAtender: false,
      explicacao: "Dá para criar a peça, mas ela não embarca no caminhão deste evento.",
    };
  }
  return null;
}

// ─── Andamento da peça que saiu do pedido ────────────────────────────────────

export const ETAPAS_DA_PECA = ["Criação", "Aprovação", "Produção", "Conferência", "Entregue"] as const;

/** Em que etapa a peça está (0..4), ou null se foi cancelada. */
export function etapaDaPeca(status: string | null | undefined): number | null {
  const s = String(status ?? "");
  if (s === "cancelled" || s === "canceled" || s === "cancelado") return null;
  if (s === "delivered" || s === "entregue") return 4;
  if (["produced", "produzido", "conferred", "conferido"].includes(s)) return 3;
  if (["inProduction", "em_producao", "ready_for_production", "pronto_para_producao", "approved", "liberado"].includes(s)) return 2;
  if (["awaiting_sponsor_approval", "awaiting_approval", "awaiting_creator_review", "awaiting_final_review", "new_version_pending"].includes(s)) return 1;
  return 0;
}

// ─── Reabrir ─────────────────────────────────────────────────────────────────

/** Quem pode reabrir cada estado: o atendido e o recusado são desfeitos por
 *  quem resolve (Solicitação); o cancelado, por quem pede (Atendimento). */
export function quemReabre(status: string): Array<"admin" | "solicitacao" | "atendimento"> {
  if (status === "atendido" || status === "recusado") return ["admin", "solicitacao"];
  if (status === "cancelado") return ["admin", "atendimento"];
  return [];
}
