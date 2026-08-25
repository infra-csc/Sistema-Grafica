// ─────────────────────────────────────────────────────────────────────────────
// BUSCA GLOBAL — o "ir para" do app (sugestão 3 da análise de evolução).
//
// Peça chega por WhatsApp como "#2993". Antes, achá-la exigia escolher uma
// tela primeiro e usar a busca local daquela tela — cada uma enxergando só o
// seu recorte. Esta rota responde a UMA pergunta, de qualquer lugar: "onde
// está isso?" — e devolve pouco, rápido, para a paleta (Ctrl+K).
//
// DECISÕES:
//  · Leitura para qualquer logado. O destino é o Detalhe do Evento, que todos
//    os papéis já enxergam — a busca não abre nenhuma porta nova.
//  · O recorte desce ao SQL (nada de baixar /api/items para procurar em 5k
//    peças no navegador — é exatamente o padrão que estamos aposentando).
//  · Código exato primeiro: quem digita "#2993" quer A peça, não uma lista
//    em que ela aparece em quarto. O resto vem por data, mais novo primeiro.
//  · Termo é literal: %_\ escapados (mesma regra da busca do Histórico).
// ─────────────────────────────────────────────────────────────────────────────
import type { Express } from "express";
import { db } from "../db";
import { items, events } from "@shared/schema";
import { and, desc, ilike, isNull, or, sql } from "drizzle-orm";
import { requireAuth } from "./shared";
import { ehBookCompleto } from "@shared/fluxo-peca";

/** Escapa %, _ e \ — "2x1" e "100%" são texto, não curinga. */
export function termoLiteral(t: string): string {
  return t.replace(/[\\%_]/g, (c) => "\\" + c);
}

export const BUSCA_MAX_PECAS = 15;
export const BUSCA_MAX_EVENTOS = 5;

export function registerBuscaRoutes(app: Express): void {
  app.get("/api/busca", requireAuth, async (req, res) => {
    try {
      const bruto = typeof req.query.q === "string" ? req.query.q.trim() : "";
      // 2+ caracteres: com 1, "a" devolveria meio banco e a paleta viraria
      // ruído antes de a pessoa terminar de digitar.
      if (bruto.length < 2) return res.json({ pecas: [], eventos: [] });

      // "#2993" e "2993" são a mesma intenção — o displayId guarda o "#".
      const semCerquilha = bruto.replace(/^#/, "");
      const padraoCodigo = `%${termoLiteral(semCerquilha)}%`;
      const padraoTexto = `%${termoLiteral(bruto)}%`;

      const [pecas, eventos] = await Promise.all([
        db
          .select({
            id: items.id,
            displayId: items.displayId,
            type: items.type,
            description: items.description,
            status: items.status,
            eventId: items.eventId,
            eventName: events.name,
          })
          .from(items)
          .leftJoin(events, sql`${events.id} = ${items.eventId}`)
          .where(and(
            isNull(items.deletedAt),
            or(
              ilike(items.displayId, padraoCodigo),
              ilike(items.description, padraoTexto),
              ilike(items.type, padraoTexto),
            ),
          ))
          // Código EXATO primeiro ("2993" ou "#2993"), depois o mais novo. O
          // lower() casa com o ilike acima — sem ele, "Ab12" exato perderia
          // para um match parcial mais recente.
          .orderBy(
            sql`CASE WHEN lower(${items.displayId}) IN (lower(${"#" + semCerquilha}), lower(${semCerquilha})) THEN 0 ELSE 1 END`,
            desc(items.createdAt),
          )
          .limit(BUSCA_MAX_PECAS),
        db
          .select({ id: events.id, name: events.name, truckDepartureDate: events.truckDepartureDate })
          .from(events)
          .where(ilike(events.name, padraoTexto))
          .orderBy(desc(events.truckDepartureDate))
          .limit(BUSCA_MAX_EVENTOS),
      ]);

      // BOOK COMPLETO fica de fora: é o trâmite do Atendimento, não uma peça (ver shared/fluxo-peca).
      res.json({ pecas: pecas.filter((p) => !ehBookCompleto(p)), eventos });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
}
