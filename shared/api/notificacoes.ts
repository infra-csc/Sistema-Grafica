// ─────────────────────────────────────────────────────────────────────────────
// CONTRATOS DAS NOTIFICAÇÕES (server/routes/notifications.ts).
// ─────────────────────────────────────────────────────────────────────────────
import type { Notification } from "../schema";
import type { Json } from "./json";

/** Elemento de GET /api/notifications (já recortado por perfil e destinatário). */
export type NotificacaoJson = Json<Notification>;

/** PATCH /api/notifications/read-all → quantas foram marcadas. */
export interface RespostaMarcarTodas { marked: number }
