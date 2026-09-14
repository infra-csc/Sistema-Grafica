// ─────────────────────────────────────────────────────────────────────────────
// KIT — remessas (dono, 14/09). Decisões em shared/kit.ts.
//
// A remessa guarda as datas do Kit de um evento (entrega do material, carga e
// saída do caminhão), a versão e quem pediu. Toda peça do Kit aponta para uma
// remessa do MESMO evento. Cada versão da planilha é uma remessa nova.
//
// Papéis: ler — qualquer usuário logado (o do Kit, só as dele); criar — admin
// e Solicitação (o usuário do Kit é um usuário de Solicitação marcado "Kit").
// ─────────────────────────────────────────────────────────────────────────────
import type { Express } from "express";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { kitRemessas } from "@shared/schema";
import { diaMesDoKit } from "@shared/kit";
import { requireAuth, requireRole, broadcast, createAuditLog } from "./shared";
import { motivoEventoFechado, erroEventoFechado } from "./eventoFinalizado";

const requireCriarRemessa = requireRole("admin", "solicitacao");

const dataDoKit = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida");
const paraData = (d: string | null | undefined): Date | null => (d ? new Date(`${d}T12:00:00Z`) : null);

export const remessaSchema = z.object({
  eventId: z.string().min(1, "Escolha o evento"),
  versao: z.string().trim().min(1, "Informe a versão (ex.: V1)").max(20),
  solicitante: z.string().trim().max(120).nullable().optional(),
  departamento: z.string().trim().max(60).nullable().optional(),
  dataSolicitacao: dataDoKit.nullable().optional(),
  entregaMaterial: dataDoKit,
  dataEvento: dataDoKit.nullable().optional(),
  cargaCaminhao: dataDoKit.nullable().optional(),
  saidaCaminhao: dataDoKit.nullable().optional(),
  arquivo: z.string().trim().max(200).nullable().optional(),
});

/** Cria a remessa (usada pela rota e pela importação da planilha do Kit). */
export async function criarRemessa(req: any, dados: z.infer<typeof remessaSchema>) {
  const evento = await storage.getEvent(dados.eventId);
  if (!evento) return { status: 404, erro: "Evento não encontrado" } as const;
  const fechado = motivoEventoFechado(evento);
  if (fechado) return { status: 409, erro: erroEventoFechado(fechado) } as const;
  const [remessa] = await db.insert(kitRemessas).values({
    eventId: evento.id,
    versao: dados.versao,
    solicitante: dados.solicitante || null,
    departamento: dados.departamento || null,
    dataSolicitacao: paraData(dados.dataSolicitacao),
    entregaMaterial: paraData(dados.entregaMaterial)!,
    dataEvento: paraData(dados.dataEvento),
    cargaCaminhao: paraData(dados.cargaCaminhao),
    saidaCaminhao: paraData(dados.saidaCaminhao),
    arquivo: dados.arquivo || null,
    criadoPor: req.userName ?? null,
    criadoPorId: req.userId ?? null,
  }).returning();
  await createAuditLog(req, "created", "event", evento.id,
    `Remessa do Kit ${remessa.versao} criada — entrega do material ${diaMesDoKit(remessa.entregaMaterial) ?? "—"}`
    + (remessa.saidaCaminhao ? `, saída do caminhão ${diaMesDoKit(remessa.saidaCaminhao)}` : ""));
  broadcast({ type: "kit_remessas", eventId: evento.id });
  return { status: 201, remessa } as const;
}

export function registerKitRoutes(app: Express): void {
  app.get("/api/kit/remessas", requireAuth, async (req, res) => {
    try {
      const condicoes: any[] = [];
      if (typeof req.query.eventId === "string" && req.query.eventId) condicoes.push(eq(kitRemessas.eventId, req.query.eventId));
      if ((req as any).userKit) condicoes.push(eq(kitRemessas.criadoPorId, (req as any).userId ?? ""));
      const lista = await db.select().from(kitRemessas)
        .where(condicoes.length ? and(...condicoes) : undefined)
        .orderBy(desc(kitRemessas.createdAt));
      res.json(lista);
    } catch (error) {
      console.error("[kit] erro ao listar remessas:", error);
      res.status(500).json({ error: "Erro ao listar as remessas do Kit" });
    }
  });

  app.post("/api/kit/remessas", requireCriarRemessa, async (req, res) => {
    try {
      const dados = remessaSchema.parse(req.body);
      const r = await criarRemessa(req, dados);
      if ("erro" in r) return res.status(r.status).json({ error: r.erro });
      res.status(201).json(r.remessa);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors?.[0]?.message || "Dados inválidos" });
      console.error("[kit] erro ao criar remessa:", error);
      res.status(500).json({ error: "Erro ao criar a remessa do Kit" });
    }
  });
}
