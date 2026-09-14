// Remessas do Kit (14/09): leitura, validação e criação, separadas de
// routes/kit.ts. Peças e importação precisam só disto, e importar o arquivo de
// rotas traria junto os guardas de papel (que alguns testes substituem por
// mocks) — além de a importação da planilha do Kit criar a remessa por aqui.
import { z } from "zod";
import { eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { kitRemessas } from "@shared/schema";
import { diaMesDoKit } from "@shared/kit";
import { broadcast, createAuditLog } from "../routes/shared";
import { motivoEventoFechado, erroEventoFechado } from "../routes/eventoFinalizado";

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

export async function carregarRemessa(id: string) {
  const [remessa] = await db.select().from(kitRemessas).where(eq(kitRemessas.id, id));
  return remessa ?? null;
}

export async function remessasPorIds(ids: string[]) {
  const unicos = ids.filter((v, i) => !!v && ids.indexOf(v) === i);
  if (unicos.length === 0) return new Map<string, typeof kitRemessas.$inferSelect>();
  const lista = await db.select().from(kitRemessas).where(inArray(kitRemessas.id, unicos));
  return new Map(lista.map((r) => [r.id, r]));
}

/** Cria a remessa (rota de remessas e importação da planilha do Kit). */
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
    + (remessa.saidaCaminhao ? `, saída do caminhão ${diaMesDoKit(remessa.saidaCaminhao)}` : "")
    + (remessa.arquivo ? ` (planilha "${remessa.arquivo}")` : ""));
  broadcast({ type: "kit_remessas", eventId: evento.id });
  return { status: 201, remessa } as const;
}
