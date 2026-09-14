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
// cancelado (por quem pediu, com motivo).
//
// O PEDIDO É UMA SOLICITAÇÃO, NÃO UMA PEÇA: a peça só existe depois de
// atendido — por isso "atendido" carrega a peça que saiu dele.
//
// Refino "nota 10" (dono, 14/09): idade do pedido, faixa dos parados, selo do
// evento que não aceita mais peça, o que falta no pedido, link para a peça
// gerada e motivo obrigatório (10+ caracteres) para cancelar e recusar.
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

/** Cancelar e recusar pedem uma frase de verdade: pedido negado sem
 *  explicação volta como o mesmo pedido na semana seguinte. */
export const MIN_MOTIVO_DO_PEDIDO = 10;

/** O pedido como a API devolve (com nomes resolvidos). */
export interface PedidoDePeca {
  id: string;
  eventId: string;
  sponsorId: string | null;
  /** Vazia é legítimo: o solicitante nem sempre sabe quantas. */
  quantidade: number | null;
  observacao: string;
  referencias: string[];
  status: StatusDoPedido;
  pedidoPor: string | null;
  pedidoPorId: string | null;
  itemId: string | null;
  resolvidoPor: string | null;
  resolvidoEm: string | null;
  motivoRecusa: string | null;
  motivoCancelamento: string | null;
  createdAt: string;
  eventName: string | null;
  eventStart: string | null;
  sponsorName: string | null;
  itemDisplayId: string | null;
  itemType: string | null;
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

export const quantidadeDoPedido = (q: number | null | undefined): string =>
  q == null ? "sem quantidade" : `${q} un.`;

// ─── Idade ───────────────────────────────────────────────────────────────────

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

/** Idade só é informação acionável enquanto o pedido espera. */
export const pedidoEspera = (status: string): boolean => status === "aberto";

// ─── O que falta ─────────────────────────────────────────────────────────────

/** Campos que o solicitante não informou. Não bloqueia o atendimento — há
 *  pedido legítimo sem quantidade —, mas a tela para de esconder a lacuna. */
export function lacunasDoPedido(p: { quantidade: number | null; sponsorId: string | null; referencias: string[] | null }): string[] {
  const faltam: string[] = [];
  if (p.quantidade == null) faltam.push("quantidade");
  if (!p.sponsorId) faltam.push("patrocinador");
  if (!(p.referencias ?? []).length) faltam.push("referência");
  return faltam;
}

export function rotuloDasLacunas(faltam: string[]): string | null {
  if (faltam.length === 0) return null;
  return faltam.length === 1 ? `falta ${faltam[0]}` : `faltam ${faltam.length} campos`;
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
  if (evento.saida) {
    const saida = new Date(evento.saida);
    if (!Number.isNaN(saida.getTime()) && saida.getTime() <= relogioDeSaoPaulo(agora)) {
      const dias = Math.max(0, Math.round((Date.parse(`${new Date(relogioDeSaoPaulo(agora)).toISOString().slice(0, 10)}T00:00:00Z`)
        - Date.parse(`${saida.toISOString().slice(0, 10)}T00:00:00Z`)) / DIA_MS));
      return {
        tipo: "caminhao",
        texto: dias === 0 ? "caminhão já saiu hoje" : dias === 1 ? "caminhão já saiu há 1 dia" : `caminhão já saiu há ${dias} dias`,
        bloqueiaAtender: false,
        explicacao: "Dá para criar a peça, mas ela não embarca no caminhão deste evento.",
      };
    }
  }
  return null;
}
