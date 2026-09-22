// ─────────────────────────────────────────────────────────────────────────────
// TRAVA DO KIT — o usuário do Kit só age (e só lê detalhes) nas peças do Kit
// que ele criou (`pecaVisivelPara`). As listas já recortavam; as rotas por id
// não: bastava saber o id de uma peça da Arena para editá-la, cancelá-la ou
// ler comentários e fotos. Uma trava só, antes das rotas, cobre todas.
// ─────────────────────────────────────────────────────────────────────────────
import type { Request, Response, NextFunction } from "express";
import { pecaVisivelPara } from "@shared/kit";

// Decisão do dono: o usuário do Kit só edita o cadastro de evento que ele criou.
export const KIT_EDITA_SO_EVENTO_PROPRIO = true;

export const MSG_PECA_FORA_DO_KIT = "Esta peça não é do seu Kit. Você só pode ver e mexer nas peças do Kit que você criou.";
export const MSG_CLONAR_KIT = "Clonar peças de outro evento não está disponível para o usuário do Kit.";
export const MSG_EVENTO_DE_OUTRO = "Você só pode editar os dados de um evento que você criou.";

const ESCRITA = new Set(["POST", "PATCH", "PUT", "DELETE"]);

/** Segmentos depois de /api/items/ que não são id de peça. */
const NAO_E_ID = new Set([
  "bulk", "export-xlsx", "labels-printed", "send-to-arte", "approved", "pending",
  "deleted", "resubmission-needed", "batch-approval-data", "bulk-add-sponsor",
]);

const textos = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : typeof v === "string" ? [v] : [];

/**
 * Os ids de peça que a requisição toca: o da URL (/api/items/:id/…) e os do
 * corpo (`itemIds`, `ids`, `itemId`). Em leitura, só conta a URL com sufixo
 * (/api/items/:id/comments…): `GET /api/items/:x` sem sufixo é por EVENTO.
 */
export function idsDePecaAlvo(req: { method: string; path: string; body?: any }): string[] {
  const ids: string[] = [];
  const escrita = ESCRITA.has(req.method);
  const m = req.path.match(/^\/api\/items\/([^/]+)(\/.*)?$/);
  if (m) {
    const [, alvo, sufixo] = m;
    const ehId = !NAO_E_ID.has(alvo) && !alvo.startsWith("bulk-");
    if (ehId && (escrita || !!sufixo)) ids.push(alvo);
  }
  if (escrita && req.body && typeof req.body === "object") {
    ids.push(...textos(req.body.itemIds), ...textos(req.body.ids), ...textos(req.body.itemId));
  }
  return Array.from(new Set(ids));
}

export type PecaParaTrava = { id: string; kitRemessaId: string | null; criadoPorId: string | null };

export interface DepsDaTrava {
  buscarPecas(ids: string[]): Promise<PecaParaTrava[]>;
  buscarCriadorDoEvento(eventId: string): Promise<{ existe: boolean; createdBy: string | null }>;
}

/** Middleware. Só age sobre o usuário do Kit; os outros passam direto. */
export function travaDoKit(deps: DepsDaTrava) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.userKit || !req.userId) return next();
      const usuario = { kit: true, userId: req.userId };

      if (req.method === "POST" && /^\/api\/events\/[^/]+\/clone-items\/?$/.test(req.path)) {
        return res.status(403).json({ error: MSG_CLONAR_KIT });
      }

      const evento = req.path.match(/^\/api\/events\/([^/]+)\/?$/);
      if (KIT_EDITA_SO_EVENTO_PROPRIO && evento && req.method === "PATCH") {
        const dono = await deps.buscarCriadorDoEvento(evento[1]);
        // Evento inexistente segue para a rota responder 404.
        if (dono.existe && dono.createdBy !== req.userId) {
          return res.status(403).json({ error: MSG_EVENTO_DE_OUTRO });
        }
      }

      const ids = idsDePecaAlvo(req);
      if (ids.length === 0) return next();
      const pecas = await deps.buscarPecas(ids);
      // Id que não existe segue para a rota (ela responde 404 do jeito dela).
      if (pecas.some((p) => !pecaVisivelPara(usuario, p))) {
        return res.status(403).json({ error: MSG_PECA_FORA_DO_KIT });
      }
      next();
    } catch (erro) {
      next(erro);
    }
  };
}
