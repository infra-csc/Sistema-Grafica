// ─────────────────────────────────────────────────────────────────────────────
// CONTRATO DO TEMPO REAL — toda mensagem que o servidor manda pelo WebSocket.
//
// Duas formas da mesma mensagem:
//   · MensagemWS — o que as rotas passam para broadcast() (às vezes com o
//     objeto inteiro: peça, evento, comentário). Fica no servidor.
//   · SinalWS    — o que viaja para o navegador e entre as cópias do servidor:
//     só o tipo, os ids e uns poucos textos de aviso. O cliente busca o dado
//     pela API (que aplica o recorte do Kit e do perfil); o WebSocket nunca
//     mais leva a peça inteira para quem não pode vê-la.
//
// O cliente declara um Record<TipoMensagemWS, …> exaustivo: tipo novo aqui sem
// entrada no mapa do cliente é erro de compilação, não mensagem ignorada.
// ─────────────────────────────────────────────────────────────────────────────

type Id = string;
type IdOpcional = string | null | undefined;

// O pedaço de cada objeto que o sinal usa. Aceitam o objeto inteiro (as rotas
// passam a linha do banco, às vezes com um campo a mais) — o resto é ignorado.
type Resto = { [campo: string]: unknown };
type PecaDoSinal = { id: Id; eventId?: IdOpcional; type?: string | null } & Resto;
type EventoDoSinal = { id: Id; name?: string | null } & Resto;
type ComId = { id: Id } & Resto;

export type MensagemWS =
  // Conexão
  | { type: "connected"; message?: string }
  // O servidor desta aba perdeu o canal entre cópias por um tempo: revalide.
  | { type: "resync" }

  // Eventos
  | { type: "event_created"; event: EventoDoSinal }
  | { type: "event_updated"; event: EventoDoSinal }
  | { type: "event_priority_updated"; eventId: Id; event?: EventoDoSinal | null }
  | { type: "event_deleted"; eventId: Id }
  | { type: "event_closed"; eventId: Id; event?: EventoDoSinal | null }
  | { type: "event_reopened"; eventId: Id; event?: EventoDoSinal | null }
  | { type: "items_submitted"; eventId: Id; count: number; items?: unknown[] }
  | { type: "account_executives_inferred"; count: number }
  | { type: "event_sponsors_repaired"; count: number }

  // Peças
  | { type: "item_created"; item: PecaDoSinal }
  | { type: "item_updated"; item?: PecaDoSinal | null; eventId?: IdOpcional }
  | { type: "item_approved"; item: PecaDoSinal }
  | { type: "item_deleted"; itemId: Id; eventId?: IdOpcional }
  | { type: "item_complement_created"; item: PecaDoSinal; parentId?: IdOpcional; parentDisplayId?: string | null; eventId?: IdOpcional; quantity?: number }
  | { type: "item_complement_canceled"; itemId: Id; displayId?: string | null; parentId?: IdOpcional; eventId?: IdOpcional }
  | { type: "items_bulk_created"; items: unknown[]; eventId?: IdOpcional }
  | { type: "items_bulk_updated"; itemIds: Id[]; eventId?: IdOpcional }
  | { type: "items_book_updated"; eventId: Id; count: number }
  | { type: "production_started"; item: PecaDoSinal }
  | { type: "production_updated"; item: PecaDoSinal }
  | { type: "tubos_atualizados"; eventId: IdOpcional }
  | { type: "kit_remessas"; eventId: Id }

  // Patrocinadores e aprovações
  | { type: "sponsor_created"; sponsor: ComId }
  | { type: "sponsor_updated"; sponsor: ComId }
  | { type: "sponsor_deleted"; sponsorId: Id }
  | { type: "item_sponsor_added"; itemSponsor: { itemId: Id; sponsorId: Id } }
  | { type: "item_sponsor_removed"; itemId: Id; sponsorId: Id }
  | { type: "event_sponsor_added"; eventId: Id; sponsorId: Id; eventSponsor?: unknown }
  | { type: "event_sponsor_updated"; eventId: Id; sponsorId: Id; quota?: string | null }
  | { type: "event_sponsor_removed"; eventId: Id; sponsorId: Id }
  | { type: "sponsor_approval_updated"; itemId: Id; approval?: unknown }

  // Comentários e fotos de entrega
  | { type: "new_comment"; comment: { id: Id; itemId?: IdOpcional } & Resto }
  | { type: "comment_deleted"; commentId: Id }
  | { type: "photo_added"; photo: { id: Id; itemId?: IdOpcional } & Resto }
  | { type: "photo_deleted"; photoId: Id }

  // Modelos e catálogo
  | { type: "standard_item_created"; item: ComId }
  | { type: "standard_item_updated"; item: ComId }
  | { type: "standard_item_deleted"; itemId: Id }
  | { type: "standard_item_group_renamed"; oldName: string; newName: string }
  | { type: "standard_item_group_deleted"; name: string }
  | { type: "standard_item_finish_renamed"; oldName: string; newName: string }
  | { type: "standard_item_finish_deleted"; name: string }
  | { type: "standard_item_material_renamed"; oldName: string; newName: string }
  | { type: "standard_item_material_deleted"; name: string }
  | { type: "catalog_option_created"; option: unknown }
  | { type: "catalog_option_deleted"; kind: string; value: string }

  // Estoque / inventário
  | { type: "inventory_in_use"; eventId: Id; eventName?: string | null; count: number }
  | { type: "inventory_awaiting_triage"; eventId: Id; eventName?: string | null; count: number; message?: string }
  | { type: "inventory_triaged"; assetId: Id; trackingStatus?: string | null }
  | { type: "inventory_changed"; eventId?: IdOpcional; itemId?: IdOpcional; itemIds?: Id[]; assetId?: IdOpcional; assetIds?: Id[]; motivo?: string; acao?: string }
  | { type: "estoque_reservas"; itemId?: IdOpcional; eventId?: IdOpcional }
  | { type: "consultas_de_estoque"; itemId: Id; eventId?: IdOpcional }
  | { type: "pedidos_de_peca"; eventId?: IdOpcional }

  // Prazos e avisos
  | { type: "deadline_alert"; event: EventoDoSinal; hoursRemaining: number }
  | { type: "prazo_alert"; event: EventoDoSinal; label?: string; hoursRemaining: number }
  | { type: "prazo_cobranca"; targetType: string; targetId: Id }
  // `aviso`: um chamador (sponsors.ts) manda a notificação com esse nome.
  | { type: "notification_created"; notification?: ({ id?: Id; eventId?: IdOpcional } & Resto) | null; aviso?: unknown }
  | { type: "notification_read"; notification?: unknown };

export type TipoMensagemWS = MensagemWS["type"];

/** O que viaja pelo fio. Só ids, contagem e os textos que os avisos mostram. */
export interface SinalWS {
  type: TipoMensagemWS;
  /** A entidade principal (peça, evento, patrocinador, comentário…). */
  id?: string;
  eventId?: string;
  itemId?: string;
  count?: number;
  // Textos de aviso (toast). Saem do sinal do usuário do Kit.
  nome?: string;
  tipoDaPeca?: string;
  message?: string;
  label?: string;
  hoursRemaining?: number;
}

const texto = (v: unknown): string | undefined =>
  typeof v === "string" && v.length > 0 && v.length <= 200 ? v : undefined;
const numero = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;

/** Mensagem cheia → sinal. Pura; nunca copia objeto nenhum para o fio. */
export function recortarParaSinal(msg: MensagemWS): SinalWS {
  const m = msg as Record<string, any>;
  const principal = m.item ?? m.event ?? m.sponsor ?? m.comment ?? m.photo ?? m.notification ?? null;
  const sinal: SinalWS = { type: msg.type };

  const id = texto(principal?.id) ?? texto(m.itemId) ?? texto(m.commentId) ?? texto(m.photoId)
    ?? texto(m.sponsorId) ?? texto(m.assetId) ?? texto(m.targetId) ?? texto(m.itemSponsor?.itemId);
  if (id) sinal.id = id;

  const eventId = texto(m.eventId) ?? texto(m.item?.eventId) ?? texto(m.event?.id) ?? texto(m.notification?.eventId);
  if (eventId) sinal.eventId = eventId;

  const itemId = texto(m.itemId) ?? texto(m.comment?.itemId) ?? texto(m.photo?.itemId) ?? texto(m.itemSponsor?.itemId)
    ?? (msg.type.startsWith("standard_item") ? undefined : texto(m.item?.id));
  if (itemId) sinal.itemId = itemId;

  const count = numero(m.count)
    ?? (Array.isArray(m.items) ? m.items.length : undefined)
    ?? (Array.isArray(m.itemIds) ? m.itemIds.length : undefined);
  if (count !== undefined) sinal.count = count;

  const nome = texto(m.event?.name) ?? texto(m.eventName);
  if (nome) sinal.nome = nome;
  const tipoDaPeca = msg.type.startsWith("standard_item") ? undefined : texto(m.item?.type);
  if (tipoDaPeca) sinal.tipoDaPeca = tipoDaPeca;
  const message = texto(m.message);
  if (message && msg.type !== "connected") sinal.message = message;
  const label = texto(m.label);
  if (label) sinal.label = label;
  const horas = numero(m.hoursRemaining);
  if (horas !== undefined) sinal.hoursRemaining = horas;
  return sinal;
}

/**
 * O sinal para o usuário do Kit: sem os textos de aviso (nome de evento, tipo
 * de peça de outra pessoa). Os ids ficam — ele só serve para o cliente saber
 * O QUE recarregar, e a API devolve só o que é dele.
 */
export function sinalParaKit(sinal: SinalWS): SinalWS {
  const { nome: _n, tipoDaPeca: _t, message: _m, label: _l, ...resto } = sinal;
  return resto;
}
