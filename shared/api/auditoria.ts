// ─────────────────────────────────────────────────────────────────────────────
// CONTRATOS DE GET /api/audit-logs (server/routes/audit-logs.ts).
//
// TRÊS formas na mesma rota — e a padrão é intocável:
//   (nenhum)      → `RegistroDeAuditoriaJson[]`
//   ?withTotal=1  → `PaginaDeAuditoriaComTotal`
//   ?paged=1      → `PaginaDeAuditoria` (sem o count(*))
// ─────────────────────────────────────────────────────────────────────────────
import type { AuditLog } from "../schema";
import type { Json } from "./json";

/** Uma linha da trilha como chega pelo cabo. `details` é JSON em TEXTO (ou null). */
export type RegistroDeAuditoriaJson = Json<AuditLog>;

/** ?paged=1 — uma página e o cursor da próxima (null = acabou). */
export interface PaginaDeAuditoria {
  logs: RegistroDeAuditoriaJson[];
  nextCursor: string | null;
}

/** ?withTotal=1 — a página com o total REAL (já com o recorte do perfil). */
export interface PaginaDeAuditoriaComTotal extends PaginaDeAuditoria {
  total: number;
}
