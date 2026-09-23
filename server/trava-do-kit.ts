// ─────────────────────────────────────────────────────────────────────────────
// TRAVA DO KIT — o usuário do Kit só age (e só lê detalhes) nas peças do Kit
// que ele criou (`pecaVisivelPara`). As listas já recortavam; as rotas por id
// não: bastava saber o id de uma peça da Arena para editá-la, cancelá-la ou
// ler comentários e fotos. Uma trava só, antes das rotas, cobre todas.
// ─────────────────────────────────────────────────────────────────────────────
import type { Request, Response, NextFunction } from "express";
import { pecaVisivelPara } from "@shared/kit";

// Decisão do dono: o usuário do Kit só altera o evento que ele criou.
export const KIT_EDITA_SO_EVENTO_PROPRIO = true;

export const MSG_PECA_FORA_DO_KIT = "Esta peça não é do seu Kit. Você só pode ver e mexer nas peças do Kit que você criou.";
export const MSG_CLONAR_KIT = "Clonar peças de outro evento não está disponível para o usuário do Kit.";
export const MSG_EVENTO_DE_OUTRO = "Você só pode alterar um evento que você criou (dados, prioridade, patrocinadores e cotas).";
export const MSG_VOLUME_FORA_DO_KIT = "Este volume tem peças fora do seu Kit. Você só mexe em volume com as peças do Kit que você criou.";
export const MSG_VOLUME_SEM_PECA = "Abra o volume já com as peças do seu Kit.";

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

/**
 * Escritas em /api/events/:id/… que o Kit faz em evento dos OUTROS: a peça do
 * Kit mora no evento da Arena, e estas rotas agem só nas peças dele (cada uma
 * recorta pelo criador; os volumes têm a regra própria abaixo). Todo o resto
 * sob o evento — dados, prioridade, patrocinadores, cotas, auto-link,
 * encerrar/reabrir, book — exige ser o criador: rota nova nasce fechada.
 */
const ESCRITA_DE_EVENTO_POR_PECA = new Set(["items/submit", "preview-xlsx", "confirm-import", "tubos"]);

/** O evento e o resto do caminho de uma escrita em /api/events/:id(/…). */
export function escritaDeEvento(req: { method: string; path: string }): { eventId: string; resto: string } | null {
  if (!ESCRITA.has(req.method)) return null;
  const m = req.path.match(/^\/api\/events\/([^/]+)((?:\/[^/]+)*)\/?$/);
  return m ? { eventId: m[1], resto: m[2].replace(/^\//, "") } : null;
}

/** Ids de peça do corpo de embalar/tirar: `itens: [{ id }]`, `itemIds`, `adicionar`, `remover`. */
export function idsDoCorpoDoVolume(body: any): string[] {
  if (!body || typeof body !== "object") return [];
  const itens = Array.isArray(body.itens)
    ? body.itens.map((x: any) => x?.id).filter((x: unknown): x is string => typeof x === "string")
    : [];
  return Array.from(new Set([...itens, ...textos(body.itemIds), ...textos(body.adicionar), ...textos(body.remover)]));
}

export type PecaParaTrava = { id: string; kitRemessaId: string | null; criadoPorId: string | null };

export interface DepsDaTrava {
  buscarPecas(ids: string[]): Promise<PecaParaTrava[]>;
  buscarCriadorDoEvento(eventId: string): Promise<{ existe: boolean; createdBy: string | null }>;
  /** As peças de TODAS as linhas do volume (entregues ou não); null = o volume não existe. */
  buscarPecasDoVolume(tuboId: string): Promise<PecaParaTrava[] | null>;
}

/** Middleware. Só age sobre o usuário do Kit; os outros passam direto. */
export function travaDoKit(deps: DepsDaTrava) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.userKit || !req.userId) return next();
      const usuario = { kit: true, userId: req.userId };
      const alheia = (pecas: PecaParaTrava[]) => pecas.some((p) => !pecaVisivelPara(usuario, p));

      if (req.method === "POST" && /^\/api\/events\/[^/]+\/clone-items\/?$/.test(req.path)) {
        return res.status(403).json({ error: MSG_CLONAR_KIT });
      }

      const doEvento = escritaDeEvento(req);
      if (KIT_EDITA_SO_EVENTO_PROPRIO && doEvento && !ESCRITA_DE_EVENTO_POR_PECA.has(doEvento.resto)) {
        const dono = await deps.buscarCriadorDoEvento(doEvento.eventId);
        // Evento inexistente segue para a rota responder 404.
        if (dono.existe && dono.createdBy !== req.userId) {
          return res.status(403).json({ error: MSG_EVENTO_DE_OUTRO });
        }
      }

      // VOLUMES (tubos e embalagens avulsas): o Kit embala as peças dele no
      // evento da Arena, mas só mexe em volume em que TODA peça é dele — senão
      // tirar, fotografar ou entregar alcançaria a peça de outra pessoa.
      if (doEvento?.resto === "tubos" && req.method === "POST") {
        const pedidas = idsDoCorpoDoVolume(req.body);
        // Volume vazio aberto pelo Kit ficaria órfão: ele não apaga volume.
        if (pedidas.length === 0) return res.status(403).json({ error: MSG_VOLUME_SEM_PECA });
        if (alheia(await deps.buscarPecas(pedidas))) return res.status(403).json({ error: MSG_PECA_FORA_DO_KIT });
      }
      const volume = ESCRITA.has(req.method) ? req.path.match(/^\/api\/tubos\/([^/]+)(?:\/.*)?$/) : null;
      // O lote (entregar-em-lote) recusa volume a volume na própria rota, com o motivo de cada um.
      if (volume && volume[1] !== "entregar-em-lote") {
        const dentro = await deps.buscarPecasDoVolume(volume[1]);
        // Volume inexistente segue para a rota responder 404.
        if (dentro && alheia(dentro)) return res.status(403).json({ error: MSG_VOLUME_FORA_DO_KIT });
        const mexidas = idsDoCorpoDoVolume(req.body);
        if (mexidas.length && alheia(await deps.buscarPecas(mexidas))) {
          return res.status(403).json({ error: MSG_PECA_FORA_DO_KIT });
        }
      }

      const ids = idsDePecaAlvo(req);
      if (ids.length === 0) return next();
      const pecas = await deps.buscarPecas(ids);
      // Id que não existe segue para a rota (ela responde 404 do jeito dela).
      if (alheia(pecas)) return res.status(403).json({ error: MSG_PECA_FORA_DO_KIT });
      next();
    } catch (erro) {
      next(erro);
    }
  };
}
