// ─────────────────────────────────────────────────────────────────────────────
// SOLICITAÇÃO DE PEÇAS DO ATENDIMENTO (dono, 14/09).
//
// "Uma tela onde o pessoal do Atendimento pode solicitar peças para a pessoa
// que cria a lista colocar nos eventos." Decisões do dono:
//   · quem solicita: Atendimento e admin; quem resolve: a Solicitação (e admin);
//   · cada pessoa do Atendimento vê só as SUAS solicitações;
//   · UMA SOLICITAÇÃO, VÁRIAS PEÇAS: cada peça tem o próprio evento, nenhum,
//     um ou vários patrocinadores, quantidade, o que precisa, referências e
//     o PRÓPRIO status;
//   · o status da solicitação é calculado pelas peças;
//   · aviso por notificação no sistema — para QUEM SOLICITOU.
//
// Ciclo de cada peça solicitada:
//   aberto ──criar/ligar peça──▶ atendido (pode ganhar mais peças)
//   aberto ──recusar (motivo)──▶ recusado ──reabrir (motivo)──▶ aberto
//   aberto ──cancelar (motivo)─▶ cancelado ──reabrir (motivo)─▶ aberto
//   atendido ──pedir ajuste (texto)──▶ ajuste pendente ──aceitar | recusar
//   atendido ──a peça ligada é excluída──▶ aberto (sozinho)
//
// O Atendimento NÃO edita: errou, cancela enquanto está aberta e cria outra.
// Depois que a Solicitação agiu, só pede um ajuste — e quem monta a lista
// decide se aceita.
// ─────────────────────────────────────────────────────────────────────────────

export const STATUS_DO_PEDIDO = ["aberto", "atendido", "recusado", "cancelado"] as const;
export type StatusDoPedido = (typeof STATUS_DO_PEDIDO)[number];

/** Status da SOLICITAÇÃO: o das peças, mais "parcial" (umas atendidas, outras abertas). */
export type StatusDaSolicitacao = StatusDoPedido | "parcial";

export const ROTULO_DO_PEDIDO: Record<StatusDaSolicitacao, string> = {
  aberto: "Aberta",
  parcial: "Parcial",
  atendido: "Atendida",
  recusado: "Recusada",
  cancelado: "Cancelada",
};

export const MAX_REFERENCIAS_DO_PEDIDO = 10;
export const MAX_PECAS_POR_SOLICITACAO = 30;

/** Cancelar, recusar e reabrir pedem uma frase de verdade: pedido negado sem
 *  explicação volta como o mesmo pedido na semana seguinte. */
export const MIN_MOTIVO_DO_PEDIDO = 10;

/** Ajuste pedido pelo Atendimento numa peça já atendida. */
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
  // Produção (21/09) — o que a frase "Impressora 2 · 3 de 10" / "Tubo 2" lê.
  // Opcionais: resposta antiga em cache e testes não os trazem.
  reuseQty?: number | null;
  isReuse?: boolean | null;
  quantityProduced?: number | null;
  conferredQty?: number | null;
  printMachine?: string | null;
  impressaoPorMaquina?: unknown;
  maquinaPrevista?: string | null;
  reservaPorMaquina?: unknown;
  tuboId?: string | null;
  tuboNumero?: number | null;
  tuboFechadoEm?: string | null;
  tuboEntregueEm?: string | null;
  tuboRecebidoPor?: string | null;
  receivedBy?: string | null;
}

/** Uma peça solicitada, como a API devolve (nomes resolvidos e peças criadas). */
export interface LinhaDoPedido {
  id: string;
  pedidoId: string;
  ordem: number;
  eventId: string;
  sponsorIds: string[];
  sponsors: Array<{ id: string; name: string }>;
  quantidade: number;
  observacao: string;
  referencias: string[];
  status: StatusDoPedido;
  precisaAte: string | null;
  tipoDePeca: string | null;
  largura: string | null;
  altura: string | null;
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
  createdAt: string;
  eventName: string | null;
  eventStart: string | null;
  eventSaida: string | null;
  pecas: PecaDoPedido[];
}

/** A solicitação: quem pediu, quando, e as peças. */
export interface PedidoDePeca {
  id: string;
  status: StatusDaSolicitacao;
  pedidoPor: string | null;
  pedidoPorId: string | null;
  createdAt: string;
  linhas: LinhaDoPedido[];
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

// ─── Solicitação × peças ─────────────────────────────────────────────────────

/**
 * O status da solicitação sai das peças:
 *   · alguma aberta → "aberto" (ou "parcial", se outra já foi atendida);
 *   · nenhuma aberta → "atendido" se alguma foi; senão "recusado" se alguma
 *     foi recusada; senão "cancelado".
 */
export function statusDaSolicitacao(linhas: Array<{ status: string }>): StatusDaSolicitacao {
  const tem = (s: string) => linhas.some((l) => l.status === s);
  if (tem("aberto")) return tem("atendido") ? "parcial" : "aberto";
  if (tem("atendido")) return "atendido";
  if (tem("recusado")) return "recusado";
  return "cancelado";
}

/** Solicitação com alguma peça esperando a lista. */
export const temPecaAberta = (p: { status: string }): boolean => p.status === "aberto" || p.status === "parcial";

/** "Banner 3x1" ou, sem tipo, "Peça 2". */
export const rotuloDaLinha = (l: { tipoDePeca: string | null; ordem: number }): string =>
  l.tipoDePeca?.trim() || `Peça ${l.ordem + 1}`;

export const patrocinadoresDaLinha = (l: { sponsors?: Array<{ name: string }> | null }): string => {
  const nomes = (l.sponsors ?? []).map((s) => s.name);
  return nomes.length === 0 ? "Sem patrocinador" : nomes.join(", ");
};

export const resumoDasLinhas = (linhas: Array<{ status: string }>): string => {
  const partes: string[] = [];
  const n = (s: string) => linhas.filter((l) => l.status === s).length;
  const plural = (q: number, um: string, varios: string) => `${q} ${q === 1 ? um : varios}`;
  if (n("aberto")) partes.push(plural(n("aberto"), "aberta", "abertas"));
  if (n("atendido")) partes.push(plural(n("atendido"), "atendida", "atendidas"));
  if (n("recusado")) partes.push(plural(n("recusado"), "recusada", "recusadas"));
  if (n("cancelado")) partes.push(plural(n("cancelado"), "cancelada", "canceladas"));
  return partes.join(" · ");
};

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

/** Idade e prazo só são informação acionável enquanto algo espera. */
export const pedidoEspera = (status: string): boolean => status === "aberto" || status === "parcial";

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

/** O prazo mais próximo entre as peças abertas (para ordenar a lista). */
export function prazoMaisProximo(linhas: Array<{ status: string; precisaAte: string | null }>): number {
  const prazos = linhas.filter((l) => l.status === "aberto" && l.precisaAte).map((l) => new Date(l.precisaAte!).getTime());
  return prazos.length ? Math.min(...prazos) : Infinity;
}

/** Pedido com prazo DEPOIS da saída do caminhão: só um aviso — a peça entra
 *  no evento normalmente (dono, 15/09). */
export function avisoDoPrazo(precisaAte: Date | string | null | undefined, saida: Date | string | null | undefined): string | null {
  if (!precisaAte || !saida) return null;
  if (diaDoPrazo(precisaAte) > diaDoPrazo(saida)) {
    return `Atenção: o prazo é depois da saída do caminhão (${diaEMesDoPrazo(saida)}).`;
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
      explicacao: "O caminhão deste evento já saiu — a peça entra no evento normalmente.",
    };
  }
  return null;
}

// ─── Andamento da peça que saiu do pedido ────────────────────────────────────

// 5 etapas GROSSAS de propósito (as contagens de progresso e o teste leem os
// índices 0..4). A 4ª cobre produced + conferred + packed — por isso o nome
// "Acabamento / Conferência" e não só "Conferência" (21/09). A etapa FINA
// (Em Impressão, Impresso, Conferido, Embalado) aparece ao lado das bolinhas,
// no selo de lib/status + a frase de lib/detalhe-producao.
export const ETAPAS_DA_PECA = ["Criação", "Aprovação", "Produção", "Acabamento / Conferência", "Entregue"] as const;

/** Em que etapa a peça está (0..4), ou null se foi cancelada. */
export function etapaDaPeca(status: string | null | undefined): number | null {
  const s = String(status ?? "");
  if (s === "cancelled" || s === "canceled" || s === "cancelado") return null;
  if (s === "delivered" || s === "entregue") return 4;
  if (["produced", "produzido", "conferred", "conferido", "packed"].includes(s)) return 3;
  if (["inProduction", "em_producao", "ready_for_production", "pronto_para_producao", "approved", "liberado"].includes(s)) return 2;
  if (["awaiting_sponsor_approval", "awaiting_approval", "awaiting_creator_review", "awaiting_final_review", "new_version_pending"].includes(s)) return 1;
  return 0;
}

// ─── Reabrir ─────────────────────────────────────────────────────────────────

/** Quem pode reabrir cada estado: o recusado por quem resolve (Solicitação);
 *  o cancelado por quem pede (Atendimento). O atendido não se desfaz na mão
 *  (dono, 14/09) — volta a aberto sozinho se a peça ligada for excluída. */
export function quemReabre(status: string): Array<"admin" | "solicitacao" | "atendimento"> {
  if (status === "recusado") return ["admin", "solicitacao"];
  if (status === "cancelado") return ["admin", "atendimento"];
  return [];
}
