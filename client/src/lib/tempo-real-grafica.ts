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
// O servidor manda só o SINAL (tipo + ids — shared/ws-mensagens.ts); a tela
// busca o dado pela API. Nada aqui lê o objeto da mensagem.
//
// Puro (só constantes e funções): o hook e os testes leem daqui.
// ─────────────────────────────────────────────────────────────────────────────
import { queryClient } from "@/lib/queryClient";
import type { TipoMensagemWS } from "@shared/ws-mensagens";

export const CHAVE_FILA_DA_GRAFICA = "/api/items/approved";
export const CHAVE_MAQUINAS = "/api/grafica/maquinas";
export const CHAVE_RELATORIO_DE_MAQUINAS = "/api/grafica/maquinas/relatorio";

/** As duas telas (e o resumo de Máquinas): sempre juntas. */
export const CHAVES_DA_GRAFICA_E_MAQUINAS: readonly string[] = [CHAVE_FILA_DA_GRAFICA, CHAVE_MAQUINAS, CHAVE_RELATORIO_DE_MAQUINAS];

const GM = CHAVES_DA_GRAFICA_E_MAQUINAS;

/**
 * Alvo de invalidação:
 *   · "/api/x"          → a queryKey ["/api/x"] e tudo abaixo dela (prefixo por elemento);
 *   · { prefixo: "…" }  → chave cujo PRIMEIRO elemento, como texto, começa assim
 *                         (chaves com filtro na URL: "/api/kit/remessas?eventId=…");
 *   · { padrao: "…" }   → primeiro elemento casando o molde, `*` = um segmento (o id);
 *   · { contem: "…" }   → chave com esse elemento em qualquer posição
 *                         (["/api/items", id, "comments"]).
 */
export type AlvoDeInvalidacao = string | { prefixo: string } | { padrao: string } | { contem: string };
export type AlvoPorMolde = Exclude<AlvoDeInvalidacao, string>;

const ESTOQUE_DA_PECA: AlvoDeInvalidacao = { padrao: "/api/items/*/estoque-semelhantes" };
const ESTOQUE_DO_EVENTO: AlvoDeInvalidacao = { padrao: "/api/events/*/estoque-resumo" };
const PATROCINIO: readonly AlvoDeInvalidacao[] = ["/api/sponsors", "/api/sponsors/usage"];
const MODELOS: readonly AlvoDeInvalidacao[] = ["/api/standard-items", "/api/quota-rules/groups"];

/**
 * Mensagem do WebSocket → o que ela invalida, passando pelo coalescer. As
 * chaves que dependem do corpo (o id do evento) saem de `alvosDaMensagem`.
 *
 * EXAUSTIVO (Record sobre o contrato de shared/ws-mensagens.ts): mensagem
 * nova no servidor sem linha aqui é erro de compilação — não fica mais
 * mensagem que o servidor manda e a tela ignora. Lista vazia é decisão
 * escrita (o tipo não muda nada que o cliente guarde, ou é tratado no hook).
 */
export const CHAVES_POR_MENSAGEM: Readonly<Record<TipoMensagemWS, readonly AlvoDeInvalidacao[]>> = {
  connected: [],
  // O servidor ficou um tempo sem o canal entre cópias: o hook trata como
  // uma reconexão (revalida as telas de trabalho).
  resync: [],

  event_created: ["/api/events"],
  // Data do evento (o "evento finalizado" das duas telas), saída do caminhão (a
  // ordem da fila de Máquinas), nome: o delta da fila re-costura o evento
  // embutido nas peças — mas só se a chave for invalidada.
  event_updated: ["/api/events", ...GM],
  event_priority_updated: ["/api/events", "/api/items", ...GM],
  event_deleted: ["/api/events", ...GM],
  event_closed: ["/api/events", "/api/items", "/api/items/resubmission-needed", ...GM],
  event_reopened: ["/api/events", "/api/items", "/api/items/resubmission-needed", ...GM],
  items_submitted: ["/api/items"],
  account_executives_inferred: ["/api/events", "/api/admin/inferir-executivos"],
  event_sponsors_repaired: ["/api/events", ...PATROCINIO, "/api/admin/reparo-vinculos-evento"],

  item_created: ["/api/items"],
  item_updated: ["/api/items", "/api/events", ...GM],
  item_deleted: ["/api/items", "/api/items/deleted", "/api/events", ...GM],
  items_book_updated: ["/api/items"],
  items_bulk_created: ["/api/items", "/api/items/pending"],
  items_bulk_updated: ["/api/items", "/api/events", ...GM],
  // A peça LIBERADA entra na fila geral de Máquinas na mesma hora em que
  // entra na fila da Gráfica.
  item_approved: ["/api/items", "/api/items/pending", "/api/events", ...GM],
  // O complemento chega também como item_approved / item_deleted (o servidor
  // manda os dois); as mesmas chaves aqui, para não depender disso.
  item_complement_created: ["/api/items", "/api/items/pending", "/api/events", ...GM],
  item_complement_canceled: ["/api/items", "/api/items/deleted", "/api/events", ...GM],
  production_started: ["/api/items", "/api/events", ...GM],
  production_updated: ["/api/items", "/api/events", ...GM],
  tubos_atualizados: ["/api/tubos"],
  kit_remessas: [{ prefixo: "/api/kit/remessas" }, "/api/events"],

  sponsor_created: [...PATROCINIO],
  sponsor_updated: [...PATROCINIO],
  sponsor_deleted: [...PATROCINIO],
  // O apoio (patrocinadores) aparece na linha da Gráfica e no cartão de Máquinas.
  item_sponsor_added: [...PATROCINIO, "/api/items", ...GM],
  item_sponsor_removed: [...PATROCINIO, "/api/items", ...GM],
  event_sponsor_added: [...PATROCINIO, "/api/items"],
  event_sponsor_updated: [...PATROCINIO, "/api/items"],
  event_sponsor_removed: [...PATROCINIO, "/api/items"],
  // A decisão do patrocinador: a ficha, a Correção e a lista de peças.
  sponsor_approval_updated: [{ contem: "sponsor-approvals" }, "/api/items/resubmission-needed", "/api/items"],

  new_comment: [{ contem: "comments" }],
  comment_deleted: [{ contem: "comments" }],
  photo_added: ["/api/photos", { contem: "photos" }],
  photo_deleted: ["/api/photos", { contem: "photos" }],

  standard_item_created: [...MODELOS],
  standard_item_updated: [...MODELOS],
  standard_item_deleted: [...MODELOS],
  standard_item_group_renamed: [...MODELOS],
  standard_item_group_deleted: [...MODELOS],
  standard_item_finish_renamed: [...MODELOS],
  standard_item_finish_deleted: [...MODELOS],
  standard_item_material_renamed: [...MODELOS],
  standard_item_material_deleted: [...MODELOS],
  catalog_option_created: ["/api/catalog-options"],
  catalog_option_deleted: ["/api/catalog-options"],

  inventory_in_use: ["/api/inventory"],
  inventory_awaiting_triage: ["/api/inventory/awaiting-triage", "/api/inventory"],
  // UMA mensagem por peça triada: pelo coalescer, a rajada do quadro vira uma
  // recarga de cada chave (não 24 recargas por aba).
  inventory_triaged: ["/api/inventory/awaiting-triage", "/api/inventory"],
  inventory_changed: ["/api/inventory", "/api/estoque/reservas-ativas", "/api/inventory/awaiting-triage", { prefixo: "/api/estoque/usos" }, ESTOQUE_DA_PECA, ESTOQUE_DO_EVENTO],
  estoque_reservas: ["/api/estoque/reservas-ativas", "/api/inventory", ESTOQUE_DA_PECA, ESTOQUE_DO_EVENTO],
  // Consulta de estoque da Revisão Final: a caixa da Gráfica, o número do
  // menu, a ficha da peça (["/api/items", id, "consulta-de-estoque"]) e o
  // aviso na fila.
  consultas_de_estoque: [{ prefixo: "/api/consultas-de-estoque" }, { contem: "consulta-de-estoque" }],
  // Pedidos de peça do Atendimento: a aba, o selo de Eventos e o painel do
  // evento leem chaves com filtro na URL.
  pedidos_de_peca: [{ prefixo: "/api/pedidos-de-peca" }],

  deadline_alert: ["/api/events"],
  // Chega junto com notification_created; a Gestão de Prazos é do hook.
  prazo_alert: [],
  prazo_cobranca: [],
  notification_created: ["/api/notifications"],
  notification_read: ["/api/notifications"],
};

/** Tudo que a mensagem invalida: queryKeys (arrays) e alvos por molde. */
export function alvosDaMensagem(
  data: { type?: string; eventId?: string | null } | null | undefined,
): Array<string[] | AlvoPorMolde> {
  const tipo = data?.type ?? "";
  const fixos = (CHAVES_POR_MENSAGEM as Record<string, readonly AlvoDeInvalidacao[] | undefined>)[tipo] ?? [];
  const alvos: Array<string[] | AlvoPorMolde> = fixos.map((a) => (typeof a === "string" ? [a] : a));
  const eventId = data?.eventId;
  if (eventId) {
    if (/^event_(created|updated|deleted|closed|reopened|priority_updated)$/.test(tipo)) alvos.push(["/api/items", eventId]);
    if (tipo === "tubos_atualizados") alvos.push([`/api/events/${eventId}/tubos`]);
    if (/^(item_sponsor_(added|removed)|event_sponsor_(added|updated|removed))$/.test(tipo)) alvos.push(["/api/events", eventId, "sponsors"]);
  }
  return alvos;
}

/** Só as queryKeys (sem os alvos por molde) — as fixas e as do evento. */
export function chavesDaMensagem(data: { type?: string; eventId?: string | null } | null | undefined): string[][] {
  return alvosDaMensagem(data).filter((a): a is string[] => Array.isArray(a));
}

const escaparRegex = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** O alvo por molde vira um predicado sobre a queryKey. */
export function predicadoDoAlvo(alvo: AlvoPorMolde): (queryKey: readonly unknown[]) => boolean {
  if ("prefixo" in alvo) return (k) => String(k[0] ?? "").startsWith(alvo.prefixo);
  if ("contem" in alvo) return (k) => k.includes(alvo.contem);
  const re = new RegExp("^" + alvo.padrao.split("*").map(escaparRegex).join("[^/?]+") + "$");
  return (k) => re.test(String(k[0] ?? ""));
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
