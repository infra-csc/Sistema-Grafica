// ─────────────────────────────────────────────────────────────────────────────
// CORPOS DE REQUISIÇÃO das rotas de escrita mais usadas.
//
// São os tipos de ENTRADA dos schemas zod que o servidor aplica
// (`schema.parse(req.body)`): o que passa aqui é exatamente o que a rota
// aceita — inclusive os campos que ela ignora ou recusa por papel.
// ─────────────────────────────────────────────────────────────────────────────
import type { z } from "zod";
import type { insertEventSchema, insertSponsorSchema, publicInsertItemSchema } from "../schema";

/** POST /api/items — a peça nova. `doKit`: a peça é do Kit do evento (o servidor
 *  resolve a inclusão; o usuário do Kit cria sempre do Kit). `kitRemessaId` é
 *  da tela anterior a 23/10 e vale só como "é do Kit". */
export type CorpoNovaPeca = z.input<typeof publicInsertItemSchema> & { doKit?: boolean; kitRemessaId?: string | null };

/** POST /api/events — o evento novo (datas aceitam texto "YYYY-MM-DD" ou Date). */
export type CorpoNovoEvento = z.input<typeof insertEventSchema>;

/** POST /api/sponsors — o patrocinador novo ("" em `accountExecutiveId` vira null). */
export type CorpoNovoPatrocinador = z.input<typeof insertSponsorSchema>;
