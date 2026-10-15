// ─────────────────────────────────────────────────────────────────────────────
// EVENTOS SUGERIDOS DO UMMENSE (dono, 15/10) — os eventos da foto do Ummense
// com data ≥ hoje que o app ainda não tem, com os patrocinadores casados com o
// cadastro. Só LEITURA: criar o evento continua sendo POST /api/events, pelo
// formulário de sempre. A regra do casamento mora em @shared/eventos-sugeridos.
// ─────────────────────────────────────────────────────────────────────────────
import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth } from "./shared";
import { responderFalha } from "../erros";
import { podeVerEventosSugeridos } from "@shared/permissoes";
import { SP_DAY_FMT } from "@shared/prazo-dates";
import { montarEventosSugeridos } from "@shared/eventos-sugeridos";
import { lerFotoDoUmmense } from "../services/foto-do-ummense";

const dia = (d: Date | string | null | undefined) => {
  if (!d) return "";
  const data = d instanceof Date ? d : new Date(d);
  return Number.isNaN(data.getTime()) ? "" : data.toISOString().slice(0, 10);
};

export function registerEventosSugeridosRoutes(app: Express): void {
  app.get("/api/eventos-sugeridos", requireAuth, async (req, res) => {
    // Os mesmos que CRIAM evento (podeGerirEvento): a sugestão só serve para criar.
    if (!podeVerEventosSugeridos(req.userRole, req.userCultura)) {
      return res.status(403).json({ error: "Sem permissão para ver as sugestões do Ummense" });
    }
    try {
      const [ativos, arquivados, patrocinadores] = await Promise.all([
        storage.getAllEvents(),
        storage.getEventosArquivados(),
        storage.getAllSponsors(),
      ]);
      const eventos = [
        ...ativos.map((e) => ({ id: e.id, nome: e.name, data: dia(e.startDate) })),
        ...arquivados.map((e) => ({ id: e.id, nome: e.name, data: dia(e.startDate), arquivado: true })),
      ].filter((e) => e.data);
      const resposta = montarEventosSugeridos(
        lerFotoDoUmmense(),
        eventos,
        patrocinadores.map((s) => ({ id: s.id, nome: s.name, arquivado: !!s.arquivadoEm, criadoEm: s.createdAt ? new Date(s.createdAt).toISOString() : null })),
        SP_DAY_FMT.format(new Date()),
      );
      res.json(resposta);
    } catch (error: unknown) {
      responderFalha(res, error, "GET /api/eventos-sugeridos");
    }
  });
}
