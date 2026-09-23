// ─────────────────────────────────────────────────────────────────────────────
// CONTRATO DE GET /api/standard-items (server/routes/standard-items.ts).
// ─────────────────────────────────────────────────────────────────────────────
import type { StandardItem } from "../schema";
import type { Json } from "./json";

/** Quantas peças usaram o modelo: pelo vínculo (`exato`) e pela assinatura (`compativel`). */
export interface UsoDoModelo {
  exato: number;
  compativel: number;
  /** Criação da peça mais recente ligada ao modelo (ISO), ou null. */
  ultimaEm: string | null;
}

/** Elemento de GET /api/standard-items — o modelo com o uso calculado. */
export type ModeloComUso = Json<StandardItem> & { uso: UsoDoModelo };
