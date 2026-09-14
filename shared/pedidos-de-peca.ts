// ─────────────────────────────────────────────────────────────────────────────
// PEDIDOS DE PEÇA DO ATENDIMENTO (dono, 14/09).
//
// "Uma tela onde o pessoal do Atendimento pode solicitar peças para a pessoa
// que cria a lista colocar nos eventos." Decisões do dono:
//   · o pedido nasce na aba do Atendimento: evento, patrocinador, quantidade,
//     observação e referências (opcionais, mais de uma);
//   · quem pede: Atendimento e admin;
//   · aparece na tela de Eventos e dentro do evento, para a Solicitação;
//   · aviso por notificação no sistema.
//
// Ciclo: aberto → atendido (ligado à peça criada) | recusado (com motivo) |
// cancelado (por quem pediu).
// ─────────────────────────────────────────────────────────────────────────────

export const STATUS_DO_PEDIDO = ["aberto", "atendido", "recusado", "cancelado"] as const;
export type StatusDoPedido = (typeof STATUS_DO_PEDIDO)[number];

export const ROTULO_DO_PEDIDO: Record<StatusDoPedido, string> = {
  aberto: "Aberto",
  atendido: "Atendido",
  recusado: "Recusado",
  cancelado: "Cancelado",
};

export const MAX_REFERENCIAS_DO_PEDIDO = 10;

/** O pedido como a API devolve (com nomes resolvidos). */
export interface PedidoDePeca {
  id: string;
  eventId: string;
  sponsorId: string | null;
  quantidade: number;
  observacao: string;
  referencias: string[];
  status: StatusDoPedido;
  pedidoPor: string | null;
  pedidoPorId: string | null;
  itemId: string | null;
  resolvidoPor: string | null;
  resolvidoEm: string | null;
  motivoRecusa: string | null;
  createdAt: string;
  eventName: string | null;
  eventStart: string | null;
  sponsorName: string | null;
  itemDisplayId: string | null;
  itemType: string | null;
}

export const ehChaveDePedidos = (chave: unknown): boolean =>
  String(chave ?? "").startsWith("/api/pedidos-de-peca");
