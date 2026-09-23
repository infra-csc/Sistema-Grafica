// ─────────────────────────────────────────────────────────────────────────────
// CORPOS DE REQUISIÇÃO das rotas de escrita mais usadas.
//
// São os tipos de ENTRADA dos schemas zod que o servidor aplica
// (`schema.parse(req.body)`): o que passa aqui é exatamente o que a rota
// aceita — inclusive os campos que ela ignora ou recusa por papel.
// ─────────────────────────────────────────────────────────────────────────────
import type { z } from "zod";
import type { insertEventSchema, insertSponsorSchema, publicInsertItemSchema } from "../schema";

/** POST /api/items — a peça nova (a remessa do Kit vai à parte, fora do schema). */
export type CorpoNovaPeca = z.input<typeof publicInsertItemSchema> & { kitRemessaId?: string | null };

/** POST /api/events — o evento novo (datas aceitam texto "YYYY-MM-DD" ou Date). */
export type CorpoNovoEvento = z.input<typeof insertEventSchema>;

/** POST /api/sponsors — o patrocinador novo ("" em `accountExecutiveId` vira null). */
export type CorpoNovoPatrocinador = z.input<typeof insertSponsorSchema>;
