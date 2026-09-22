// ─────────────────────────────────────────────────────────────────────────────
// O QUE CADA MENSAGEM DO TEMPO REAL INVALIDA — e as chaves que a Gráfica e a
// aba Máquinas dividem (dono, 21/09: "as telas Máquinas da Gráfica e Gráfica
// têm que se conversar").
//
// As duas telas leem a MESMA peça por chaves diferentes:
//   · a fila da Gráfica          → ["/api/items/approved"]
//   · o retrato de Máquinas      → ["/api/grafica/maquinas"(, "?dia=…")]
//   · o resumo/Excel de Máquinas → ["/api/grafica/maquinas/relatorio", "?de=…"]
// e o casamento de chave do TanStack é por PREFIXO elemento a elemento —
// "/api/items" não alcança "/api/items/approved", e "/api/grafica/maquinas"
// não alcança ".../relatorio". Cada `case` do use-websocket listava as suas à
// mão e foi assim que a peça liberada (item_approved), a devolvida em lote
// (items_bulk_updated) e a excluída (item_deleted) chegavam a uma tela e não à
// outra. Agora o mapa é um dado, testado: toda mensagem que mexe numa peça que
// a Gráfica mostra invalida AS DUAS telas.
//
// Puro (só constantes e funções): o hook e os testes leem daqui.
// ─────────────────────────────────────────────────────────────────────────────
import { queryClient } from "@/lib/queryClient";

export const CHAVE_FILA_DA_GRAFICA = "/api/items/approved";
export const CHAVE_MAQUINAS = "/api/grafica/maquinas";
export const CHAVE_RELATORIO_DE_MAQUINAS = "/api/grafica/maquinas/relatorio";

/** As duas telas (e o resumo de Máquinas): sempre juntas. */
export const CHAVES_DA_GRAFICA_E_MAQUINAS: readonly string[] = [CHAVE_FILA_DA_GRAFICA, CHAVE_MAQUINAS, CHAVE_RELATORIO_DE_MAQUINAS];

const GM = CHAVES_DA_GRAFICA_E_MAQUINAS;

/**
 * Mensagem do WebSocket → chaves (por prefixo) que ela invalida, passando pelo
 * coalescer. As chaves que dependem do corpo (o id do evento) saem de
 * `chavesDaMensagem`.
 */
export const CHAVES_POR_MENSAGEM: Readonly<Record<string, readonly string[]>> = {
  event_created: ["/api/events"],
  // Data do evento (o "evento finalizado" das duas telas), saída do caminhão (a
  // ordem da fila de Máquinas), nome: o delta da fila re-costura o evento
  // embutido nas peças — mas só se a chave for invalidada.
  event_updated: ["/api/events", ...GM],
  event_deleted: ["/api/events", ...GM],
  event_urgent: ["/api/events"],
  event_closed: ["/api/events", "/api/items", "/api/items/resubmission-needed", ...GM],
  event_reopened: ["/api/events", "/api/items", "/api/items/resubmission-needed", ...GM],

  item_created: ["/api/items"],
  item_updated: ["/api/items", "/api/events", ...GM],
  item_delivered: ["/api/items", "/api/events", ...GM],
  items_book_updated: ["/api/items"],
  item_deleted: ["/api/items", "/api/items/deleted", "/api/events", ...GM],
  items_bulk_created: ["/api/items", "/api/items/pending"],
  items_bulk_updated: ["/api/items", "/api/events", ...GM],
  items_submitted: ["/api/items"],
  // A peça LIBERADA entra na fila geral de Máquinas na mesma hora em que
  // entra na fila da Gráfica.
  item_approved: ["/api/items", "/api/items/pending", "/api/events", ...GM],
  production_started: ["/api/items", "/api/events", ...GM],
  production_updated: ["/api/items", "/api/events", ...GM],

  tubos_atualizados: ["/api/tubos"],
  deadline_alert: ["/api/events"],

  sponsor_created: ["/api/sponsors", "/api/sponsors/usage"],
  sponsor_updated: ["/api/sponsors", "/api/sponsors/usage"],
  sponsor_deleted: ["/api/sponsors", "/api/sponsors/usage"],
  // O apoio (patrocinadores) aparece na linha da Gráfica e no cartão de Máquinas.
  item_sponsor_added: ["/api/sponsors", "/api/sponsors/usage", "/api/items", ...GM],
  item_sponsor_removed: ["/api/sponsors", "/api/sponsors/usage", "/api/items", ...GM],
  event_sponsor_updated: ["/api/sponsors", "/api/sponsors/usage", "/api/items"],
  event_sponsor_removed: ["/api/sponsors", "/api/sponsors/usage", "/api/items"],

  notification_created: ["/api/notifications"],
  notification_read: ["/api/notifications"],
};

/** Todas as chaves (como queryKey) que a mensagem invalida — as fixas e as do evento. */
export function chavesDaMensagem(data: { type?: string; eventId?: string | null } | null | undefined): string[][] {
  const tipo = data?.type ?? "";
  const chaves: string[][] = (CHAVES_POR_MENSAGEM[tipo] ?? []).map((k) => [k]);
  const eventId = data?.eventId;
  if (eventId) {
    if (/^event_(created|updated|deleted|urgent|closed|reopened)$/.test(tipo)) chaves.push(["/api/items", eventId]);
    if (tipo === "tubos_atualizados") chaves.push([`/api/events/${eventId}/tubos`]);
    if (/^(item_sponsor_(added|removed)|event_sponsor_(updated|removed))$/.test(tipo)) chaves.push(["/api/events", eventId, "sponsors"]);
  }
  return chaves;
}

/**
 * O que toda MUTAÇÃO de peça feita na Gráfica ou em Máquinas invalida no
 * onSuccess (e no onError de conflito): a fila, o acervo, o retrato e o resumo
 * de Máquinas. Quem age numa tela vê a outra certa ao trocar de aba, mesmo com
 * o socket caído. `extras`: chaves próprias do gesto (ex.: "/api/tubos").
 */
export const CHAVES_DA_MUTACAO: readonly string[] = [CHAVE_FILA_DA_GRAFICA, "/api/items", CHAVE_MAQUINAS, CHAVE_RELATORIO_DE_MAQUINAS];
export function invalidarGraficaEMaquinas(...extras: string[]): void {
  for (const k of [...CHAVES_DA_MUTACAO, ...extras]) queryClient.invalidateQueries({ queryKey: [k] });
}
