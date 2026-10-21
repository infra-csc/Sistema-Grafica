// Remessas do Kit (14/09): leitura, validação e criação, separadas de
// routes/kit.ts. Peças e importação precisam só disto, e importar o arquivo de
// rotas traria junto os guardas de papel (que alguns testes substituem por
// mocks) — além de a importação da planilha do Kit criar a remessa por aqui.
import { z } from "zod";
import type { Request } from "express";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { kitRemessas, items } from "@shared/schema";
import { diaMesDoKit, remessaUtilizavelPor } from "@shared/kit";
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

/**
 * Exclui a remessa e as peças dela (exclusão SOFT, como toda peça do sistema).
 * Só enquanto nenhuma peça andou no fluxo (rascunho/importada): peça que já foi
 * para a Arte precisa ser cancelada antes.
 */
/** O que as funções abaixo leem da requisição (quem pede). */
type QuemPede = Pick<Request, "userId" | "userName" | "userKit">;

export async function excluirRemessa(req: QuemPede, id: string) {
  const remessa = await carregarRemessa(id);
  if (!remessa) return { status: 404, erro: "Remessa do Kit não encontrada" } as const;
  if (!remessaUtilizavelPor({ kit: req.userKit === true, userId: req.userId ?? null }, remessa)) {
    return { status: 403, erro: "Esta remessa do Kit é de outra pessoa." } as const;
  }
  const vivas = await db.select({ id: items.id, displayId: items.displayId, status: items.status }).from(items)
    .where(and(eq(items.kitRemessaId, id), isNull(items.deletedAt)));
  const andaram = vivas.filter((p) => p.status !== "draft" && p.status !== "requested");
  if (andaram.length > 0) {
    return {
      status: 409,
      erro: `Não dá para excluir: ${andaram.length} ${andaram.length === 1 ? "peça já seguiu" : "peças já seguiram"} o fluxo (${andaram.slice(0, 3).map((p) => p.displayId).join(", ")}${andaram.length > 3 ? "…" : ""}). Cancele antes.`,
    } as const;
  }
  if (vivas.length > 0) {
    await db.update(items).set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(items.kitRemessaId, id), isNull(items.deletedAt)));
  }
  await db.delete(kitRemessas).where(eq(kitRemessas.id, id));
  await createAuditLog(req, "deleted", "event", remessa.eventId,
    `Remessa do Kit ${remessa.versao} excluída`
    + (vivas.length ? ` com ${vivas.length} ${vivas.length === 1 ? "peça" : "peças"} (${vivas.map((p) => p.displayId).join(", ")})` : ""));
  for (const p of vivas) broadcast({ type: "item_deleted", itemId: p.id, eventId: remessa.eventId });
  broadcast({ type: "kit_remessas", eventId: remessa.eventId });
  return { status: 200, excluidas: vivas.length } as const;
}

/**
 * O que a edição aceita (dono, 21/10: "botão para o Kit mudar os dados"): os
 * mesmos campos e as mesmas réguas da criação, menos o evento — a remessa não
 * troca de evento (as peças dela moram nele). Campo ausente fica como está.
 */
export const edicaoDaRemessaSchema = remessaSchema.omit({ eventId: true }).partial()
  .refine((d) => Object.values(d).some((v) => v !== undefined), { message: "Nada para alterar na remessa" });

/** Os campos de data da remessa, na ordem em que a trilha os conta. */
const DATAS_DA_REMESSA = [
  ["entregaMaterial", "entrega do material"],
  ["dataEvento", "data do evento"],
  ["cargaCaminhao", "carga do caminhão"],
  ["saidaCaminhao", "saída do caminhão"],
  ["dataSolicitacao", "data da solicitação"],
] as const;

/**
 * Edita a remessa. Mesmas guardas do excluir (dono da remessa para o usuário
 * do Kit) e da criação (evento aberto, versão única no evento).
 *
 * OS PRAZOS SEGUEM A REMESSA: Arte, Gráfica, Gestão de Prazos e os alertas
 * leem as datas da remessa na hora (eventoComDatasDoKit / ancoraDoKit) — nada
 * fica gravado na peça. Mas o cliente guarda as peças em cache e só recebe no
 * delta a peça cujo updated_at andou; por isso as peças da remessa são
 * carimbadas e avisadas, e a tela de cada um troca as datas sem F5.
 */
export async function editarRemessa(req: QuemPede, id: string, dados: z.infer<typeof edicaoDaRemessaSchema>) {
  const remessa = await carregarRemessa(id);
  if (!remessa) return { status: 404, erro: "Remessa do Kit não encontrada" } as const;
  if (!remessaUtilizavelPor({ kit: req.userKit === true, userId: req.userId ?? null }, remessa)) {
    return { status: 403, erro: "Esta remessa do Kit é de outra pessoa." } as const;
  }
  const evento = await storage.getEvent(remessa.eventId);
  if (!evento) return { status: 404, erro: "Evento não encontrado" } as const;
  const fechado = motivoEventoFechado(evento);
  if (fechado) return { status: 409, erro: erroEventoFechado(fechado) } as const;

  if (dados.versao !== undefined && dados.versao.toLowerCase() !== remessa.versao.toLowerCase()) {
    const mesmas = await db.select({ id: kitRemessas.id }).from(kitRemessas)
      .where(and(eq(kitRemessas.eventId, remessa.eventId), sql`lower(${kitRemessas.versao}) = lower(${dados.versao})`));
    if (mesmas.some((m) => m.id !== remessa.id)) {
      return { status: 409, erro: `Já existe a remessa KIT ${dados.versao} neste evento — escolha outra versão.` } as const;
    }
  }

  const mudancas: Partial<typeof kitRemessas.$inferInsert> = {};
  const trilha: string[] = [];
  const dia = (d: Date | string | null | undefined) => diaMesDoKit(d) ?? "—";
  if (dados.versao !== undefined && dados.versao !== remessa.versao) {
    mudancas.versao = dados.versao;
    trilha.push(`versão ${remessa.versao} → ${dados.versao}`);
  }
  for (const [campo, rotulo] of [["solicitante", "solicitante"], ["departamento", "departamento"], ["arquivo", "planilha"]] as const) {
    if (dados[campo] === undefined) continue;
    const novo = dados[campo] || null;
    if (novo === (remessa[campo] ?? null)) continue;
    mudancas[campo] = novo;
    trilha.push(`${rotulo} ${remessa[campo] || "—"} → ${novo || "—"}`);
  }
  let mudouData = false;
  for (const [campo, rotulo] of DATAS_DA_REMESSA) {
    if (dados[campo] === undefined) continue;
    const nova = paraData(dados[campo]);
    const antes = remessa[campo] ? new Date(remessa[campo] as Date) : null;
    if ((nova?.getTime() ?? null) === (antes?.getTime() ?? null)) continue;
    if (campo === "entregaMaterial" && !nova) continue; // obrigatória: o schema já barra o vazio
    (mudancas as Record<string, Date | null>)[campo] = nova;
    trilha.push(`${rotulo} ${dia(antes)} → ${dia(nova)}`);
    mudouData = true;
  }
  if (trilha.length === 0) return { status: 200, remessa, pecasAtualizadas: 0, prazosMudaram: false } as const;

  const [atualizada] = await db.update(kitRemessas).set(mudancas).where(eq(kitRemessas.id, remessa.id)).returning();

  // As peças carregam a versão e as datas da remessa embutidas no cache do
  // cliente (selo "KIT V1 · entrega 20/09" e os prazos): carimbar faz o delta
  // trazê-las de novo, já com a remessa nova.
  let tocadas: Array<{ id: string }> = [];
  if (mudouData || mudancas.versao !== undefined) {
    tocadas = await db.update(items).set({ updatedAt: new Date() })
      .where(and(eq(items.kitRemessaId, remessa.id), isNull(items.deletedAt)))
      .returning({ id: items.id });
  }

  await createAuditLog(req, "updated", "event", remessa.eventId,
    `Remessa do Kit ${atualizada.versao} editada — ${trilha.join("; ")}`
    + (tocadas.length ? ` (prazos de ${tocadas.length} ${tocadas.length === 1 ? "peça" : "peças"} pela data nova)` : ""));
  broadcast({ type: "kit_remessas", eventId: remessa.eventId });
  if (tocadas.length > 0) broadcast({ type: "items_bulk_updated", itemIds: tocadas.map((p) => p.id), eventId: remessa.eventId });
  return { status: 200, remessa: atualizada, pecasAtualizadas: tocadas.length, prazosMudaram: mudouData } as const;
}


/** Cria a remessa (rota de remessas e importação da planilha do Kit). */
export async function criarRemessa(req: QuemPede, dados: z.infer<typeof remessaSchema>) {
  const evento = await storage.getEvent(dados.eventId);
  if (!evento) return { status: 404, erro: "Evento não encontrado" } as const;
  const fechado = motivoEventoFechado(evento);
  if (fechado) return { status: 409, erro: erroEventoFechado(fechado) } as const;
  // Mesma versão duas vezes no mesmo evento é engano (15/09: um clique repetido
  // duplicou a remessa com as peças). Versão nova = remessa nova.
  const mesmas = await db.select({ id: kitRemessas.id }).from(kitRemessas)
    .where(and(eq(kitRemessas.eventId, evento.id), sql`lower(${kitRemessas.versao}) = lower(${dados.versao})`));
  if (mesmas.length > 0) {
    return { status: 409, erro: `Já existe a remessa KIT ${dados.versao} neste evento — use a próxima versão ou exclua a repetida.` } as const;
  }
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
