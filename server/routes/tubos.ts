// ─────────────────────────────────────────────────────────────────────────────
// TUBOS — agrupar na conferência, entregar por tubo (dono, 14/09).
//
// "Na hora da conferência muitas peças vão no mesmo tubo, então nesta fase
// precisamos que eles possam agrupar, e na hora de entregar, entregar por
// tubos." As decisões do dono, na mesma conversa:
//   · a peça vai INTEIRA para um tubo — não se divide unidades entre tubos;
//   · a conferência continua com foto de CADA peça impressa;
//   · a entrega é do TUBO INTEIRO: uma foto e um recebedor valem para tudo que
//     está dentro;
//   · o tubo é numerado sozinho por evento (Tubo 1, Tubo 2…) e tem etiqueta.
//
// A consequência que este arquivo impõe: um tubo só é entregue quando TODAS as
// peças dele estão conferidas. Entregar parte de uma peça contradiria "tubo
// inteiro" — e a recusa diz quais peças faltam, em vez de só "não pode".
//
// Papéis: os mesmos de conferir e entregar (grafica, solicitacao, admin). Os
// tubos são a embalagem dessas duas etapas, não uma permissão nova.
// ─────────────────────────────────────────────────────────────────────────────
import type { Express } from "express";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { items as itemsTable, tubos, events, auditLogs } from "@shared/schema";
import { podeIrParaTubo } from "@shared/fluxo-peca";
import { pecaVisivelPara } from "@shared/kit";
import {
  requireAuth,
  broadcast,
  createAuditLog,
  createAuditLogsEmLote,
  resolveActor,
  updateEventStatus,
  translateStatus,
} from "./shared";

// Predicado PURO de papel (só comparações de userRole): é a forma que o
// leitor da régua (server/permissoes-scan.ts) entende — assim as rotas de
// escrita dos tubos aparecem em shared/permissoes.ts e no teste que confere.
function podeMexerEmTubo(req: any): boolean {
  return req.userRole === "grafica" || req.userRole === "solicitacao" || req.userRole === "admin";
}
const SEM_PAPEL = "Tubos são da Gráfica, da Solicitação e do admin";

const COLUNAS_PECA = {
  id: itemsTable.id,
  displayId: itemsTable.displayId,
  type: itemsTable.type,
  description: itemsTable.description,
  quantity: itemsTable.quantity,
  status: itemsTable.status,
  conferredQty: itemsTable.conferredQty,
  deliveredQty: itemsTable.deliveredQty,
  tuboId: itemsTable.tuboId,
  eventId: itemsTable.eventId,
  deletedAt: itemsTable.deletedAt,
  // Para o recorte do Kit (pecaVisivelPara) — não vão para a tela.
  kitRemessaId: itemsTable.kitRemessaId,
  criadoPorId: itemsTable.criadoPorId,
};

type PecaCrua = {
  id: string;
  displayId: string | null;
  type: string;
  description: string | null;
  quantity: number;
  status: string;
  conferredQty: number | null;
  deliveredQty: number | null;
  tuboId: string | null;
  eventId: string;
  deletedAt: Date | null;
  kitRemessaId: string | null;
  criadoPorId: string | null;
};

// O MESMO recorte do Kit que as leituras de peças aplicam (routes/items.ts):
// o usuário do Kit só enxerga — e só mexe em — peça do Kit que ele criou.
// Peça fora do recorte é tratada como inexistente, em leitura e em escrita.
const quemVe = (req: any) => ({ kit: req.userKit === true, userId: req.userId ?? null });

// "SOLICITAÇÃO SEM KIT SÓ VISUALIZA PEÇA DO KIT" — a trava global de
// server/routes.ts. Ela só enxerga `/api/items/:id` e `itemIds`, e os tubos
// mexem em peça por `adicionar`/`remover` e pela entrega do tubo inteiro, que
// não cita id nenhum. Por isso a mesma regra é repetida aqui, com a MESMA
// mensagem — senão a Solicitação da Arena agia na peça do Kit pelo tubo.
const soVisualizaKit = (req: any): boolean => req.userRole === "solicitacao" && req.userKit !== true;
const RECADO_SO_VISUALIZA = "Peça do Kit: a Solicitação da Arena só visualiza. Quem age nela é o usuário do Kit.";
/** Responde 403 quando quem só visualiza tenta agir sobre peça do Kit. */
const barraPecaDoKit = (req: any, res: any, pecas: Array<{ kitRemessaId: string | null }>): boolean => {
  if (!soVisualizaKit(req) || !pecas.some((p) => !!p.kitRemessaId)) return false;
  res.status(403).json({ error: RECADO_SO_VISUALIZA });
  return true;
};
const visiveis = (req: any, pecas: PecaCrua[]): PecaCrua[] => pecas.filter((p) => pecaVisivelPara(quemVe(req), p));

const linhas = (r: any): any[] => (r?.rows ?? r ?? []) as any[];

const ehEntregue = (p: PecaCrua): boolean =>
  p.status === "delivered" || p.status === "entregue" || (p.deliveredQty ?? 0) >= p.quantity;

const ehConferidaInteira = (p: PecaCrua): boolean =>
  (p.conferredQty ?? 0) >= p.quantity || p.status === "conferred" || p.status === "conferido";

const pecaParaTela = (p: PecaCrua) => ({
  id: p.id,
  displayId: p.displayId,
  type: p.type,
  description: p.description,
  quantity: p.quantity,
  status: p.status,
  conferredQty: p.conferredQty ?? 0,
  deliveredQty: p.deliveredQty ?? 0,
  conferida: ehConferidaInteira(p),
  entregue: ehEntregue(p),
  // A tela esconde a caixa e o "Entregar" de quem só visualiza peça do Kit.
  doKit: !!p.kitRemessaId,
});

const porCodigo = (a: PecaCrua, b: PecaCrua) =>
  String(a.displayId ?? "").localeCompare(String(b.displayId ?? ""), "pt-BR", { numeric: true });

/** O que impede cada peça de ir para um tubo — vazio quando todas podem. */
async function recusasParaColocar(req: any, eventId: string, ids: string[]): Promise<{ pecas: PecaCrua[]; recusas: string[] }> {
  if (ids.length === 0) return { pecas: [], recusas: [] };
  const pecas = visiveis(req, (await db.select(COLUNAS_PECA).from(itemsTable).where(inArray(itemsTable.id, ids))) as PecaCrua[]);
  const achadas = new Map(pecas.map((p) => [p.id, p]));
  const tubosAtuais = Array.from(new Set(pecas.map((p) => p.tuboId).filter(Boolean))) as string[];
  const tubosEntregues = new Set(
    tubosAtuais.length
      ? (await db.select({ id: tubos.id }).from(tubos).where(and(inArray(tubos.id, tubosAtuais), sql`${tubos.entregueEm} is not null`))).map((t) => t.id)
      : [],
  );

  const recusas: string[] = [];
  for (const id of ids) {
    const p = achadas.get(id);
    const nome = p?.displayId ?? "peça";
    if (!p || p.deletedAt) { recusas.push(`${nome}: não encontrada`); continue; }
    if (p.eventId !== eventId) { recusas.push(`${nome}: é de outro evento`); continue; }
    if (p.tuboId && tubosEntregues.has(p.tuboId)) { recusas.push(`${nome}: está num tubo já entregue`); continue; }
    if (ehEntregue(p)) { recusas.push(`${nome}: já foi entregue`); continue; }
    if (!podeIrParaTubo(p.status)) {
      recusas.push(`${nome}: ainda não terminou a impressão (${translateStatus(p.status)})`);
      continue;
    }
  }
  return { pecas, recusas };
}

/**
 * Próximo número do evento. Duas pessoas criando tubo no mesmo segundo batem
 * no índice único (evento, número); quem perde tenta de novo com o número
 * seguinte, em vez de devolver erro para quem só queria um tubo.
 */
async function criarTubo(eventId: string, criadoPor: string) {
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const [{ proximo }] = linhas(await db.execute(sql`select coalesce(max(numero), 0) + 1 as proximo from tubos where event_id = ${eventId}`));
    try {
      const [tubo] = await db.insert(tubos).values({ eventId, numero: Number(proximo), criadoPor } as any).returning();
      return tubo;
    } catch (error: any) {
      const colidiu = error?.code === "23505" || /duplicate key/i.test(String(error?.message ?? ""));
      if (!colidiu || tentativa === 2) throw error;
    }
  }
  throw new Error("Não foi possível numerar o tubo");
}

async function colocarNoTubo(req: any, tubo: { id: string; numero: number; eventId: string }, pecas: PecaCrua[], ids: string[]) {
  const outros = Array.from(new Set(pecas.map((p) => p.tuboId).filter((t) => t && t !== tubo.id))) as string[];
  const numeroDe = new Map(
    outros.length
      ? (await db.select({ id: tubos.id, numero: tubos.numero }).from(tubos).where(inArray(tubos.id, outros))).map((t) => [t.id, t.numero])
      : [],
  );
  await db.update(itemsTable).set({ tuboId: tubo.id, updatedAt: new Date() } as any).where(inArray(itemsTable.id, ids));
  const porId = new Map(pecas.map((p) => [p.id, p]));
  await createAuditLogsEmLote(req, ids.map((id) => {
    const antes = porId.get(id)?.tuboId;
    const veio = antes && antes !== tubo.id ? ` (saiu do Tubo ${numeroDe.get(antes) ?? "?"})` : "";
    return { action: "updated", entityType: "item", entityId: id, details: `Peça colocada no Tubo ${tubo.numero}${veio}` };
  }));
  broadcast({ type: "items_bulk_updated", itemIds: ids, eventId: tubo.eventId });
}

function lerIds(valor: unknown): string[] | null {
  if (valor === undefined || valor === null) return [];
  if (!Array.isArray(valor) || valor.length > 500 || valor.some((x) => typeof x !== "string" || !x)) return null;
  return Array.from(new Set(valor as string[]));
}

export function registerTubosRoutes(app: Express): void {
  // Os tubos de um evento, com o que tem dentro, e as peças ainda sem tubo.
  app.get("/api/events/:eventId/tubos", requireAuth, async (req, res) => {
    if (!podeMexerEmTubo(req)) return res.status(403).json({ error: SEM_PAPEL });
    try {
      const eventId = req.params.eventId;
      const [evento] = await db.select({ id: events.id, name: events.name }).from(events).where(eq(events.id, eventId));
      if (!evento) return res.status(404).json({ error: "Evento não encontrado" });

      const lista = await db.select().from(tubos).where(eq(tubos.eventId, eventId)).orderBy(asc(tubos.numero));
      const todasDoEvento = (await db.select(COLUNAS_PECA).from(itemsTable)
        .where(and(eq(itemsTable.eventId, eventId), isNull(itemsTable.deletedAt)))) as PecaCrua[];
      const pecas = visiveis(req, todasDoEvento);

      // Quantas peças cada tubo tem DE VERDADE (sem o recorte do Kit): o tubo
      // é entregue inteiro, então "pronto para entregar" calculado só com as
      // visíveis prometeria um botão que o servidor recusaria com 403.
      const totalNoTubo = new Map<string, number>();
      for (const p of todasDoEvento) {
        if (!p.tuboId) continue;
        totalNoTubo.set(p.tuboId, (totalNoTubo.get(p.tuboId) ?? 0) + 1);
      }

      const dentroDe = new Map<string, PecaCrua[]>();
      for (const p of pecas) {
        if (!p.tuboId) continue;
        const grupo = dentroDe.get(p.tuboId) ?? [];
        grupo.push(p);
        dentroDe.set(p.tuboId, grupo);
      }

      // Kit: só os tubos com alguma peça que ele vê (o tubo vazio de outro
      // usuário não é dele para mexer). Fora do Kit, todos — inclusive vazios.
      const doKit = quemVe(req).kit;
      const tubosDaTela = lista.filter((t: any) => !doKit || dentroDe.has(t.id)).map((t: any) => {
        const dentro = (dentroDe.get(t.id) ?? []).sort(porCodigo);
        const faltamConferir = dentro.filter((p) => !ehEntregue(p) && !ehConferidaInteira(p)).map((p) => p.displayId ?? "peça");
        return {
          id: t.id,
          numero: t.numero,
          entregueEm: t.entregueEm,
          recebidoPor: t.recebidoPor,
          entreguePor: t.entreguePor,
          fotoEntregaUrl: t.fotoEntregaUrl,
          pecas: dentro.map(pecaParaTela),
          faltamConferir,
          // Peça escondida dentro do tubo (Kit, ou Solicitação sem Kit com
          // peça do Kit lá dentro): o tubo aparece, mas não como entregável.
          vePorInteiro: (totalNoTubo.get(t.id) ?? 0) === dentro.length && !dentro.some((p) => p.kitRemessaId && soVisualizaKit(req)),
          prontoParaEntregar: !t.entregueEm && dentro.length > 0 && faltamConferir.length === 0 && dentro.some((p) => !ehEntregue(p))
            && (totalNoTubo.get(t.id) ?? 0) === dentro.length
            && !(soVisualizaKit(req) && dentro.some((p) => p.kitRemessaId)),
        };
      });

      const semTubo = pecas.filter((p) => !p.tuboId && podeIrParaTubo(p.status) && !ehEntregue(p)).sort(porCodigo).map(pecaParaTela);
      res.json({ evento, tubos: tubosDaTela, semTubo });
    } catch (error: any) {
      console.error("[tubos] falha ao listar os tubos do evento:", error);
      res.status(500).json({ error: "Não foi possível carregar os tubos." });
    }
  });

  // Todos os tubos, só o número: é o que a fila precisa para o selo "Tubo N".
  app.get("/api/tubos", requireAuth, async (req, res) => {
    if (!podeMexerEmTubo(req)) return res.status(403).json({ error: SEM_PAPEL });
    try {
      const todos = await db.select({ id: tubos.id, numero: tubos.numero, eventId: tubos.eventId, entregueEm: tubos.entregueEm }).from(tubos);
      if (!quemVe(req).kit) return res.json(todos);
      // Kit: só os tubos em que há peça que ele vê.
      const comPeca = visiveis(req, (await db.select(COLUNAS_PECA).from(itemsTable)
        .where(and(sql`${itemsTable.tuboId} is not null`, isNull(itemsTable.deletedAt)))) as PecaCrua[]);
      const seus = new Set(comPeca.map((p) => p.tuboId));
      res.json(todos.filter((t) => seus.has(t.id)));
    } catch (error: any) {
      console.error("[tubos] falha ao listar tubos:", error);
      res.status(500).json({ error: "Não foi possível carregar os tubos." });
    }
  });

  // Um tubo com o que tem dentro — a etiqueta lê daqui.
  app.get("/api/tubos/:id", requireAuth, async (req, res) => {
    if (!podeMexerEmTubo(req)) return res.status(403).json({ error: SEM_PAPEL });
    try {
      const [tubo] = await db.select().from(tubos).where(eq(tubos.id, req.params.id));
      if (!tubo) return res.status(404).json({ error: "Tubo não encontrado" });
      const [evento] = await db.select({ id: events.id, name: events.name, truckDepartureDate: events.truckDepartureDate })
        .from(events).where(eq(events.id, tubo.eventId));
      const dentro = visiveis(req, (await db.select(COLUNAS_PECA).from(itemsTable)
        .where(and(eq(itemsTable.tuboId, tubo.id), isNull(itemsTable.deletedAt)))) as PecaCrua[]);
      if (quemVe(req).kit && dentro.length === 0) return res.status(404).json({ error: "Tubo não encontrado" });
      // O BOOK do evento (21/09): a etiqueta do tubo segue a das peças e usa a
      // capa do book como logo no cabeçalho. O book mora nas peças do evento;
      // qualquer uma visível que o tenha serve (é o mesmo PDF para todas).
      const comBook = visiveis(req, (await db.select({ ...COLUNAS_PECA, bookUrl: itemsTable.bookUrl }).from(itemsTable)
        .where(and(eq(itemsTable.eventId, tubo.eventId), isNull(itemsTable.deletedAt), sql`${itemsTable.bookUrl} is not null`))
        .limit(50)) as Array<PecaCrua & { bookUrl: string | null }>);
      res.json({
        tubo: { id: tubo.id, numero: tubo.numero, entregueEm: tubo.entregueEm, recebidoPor: tubo.recebidoPor },
        evento: evento ? { ...evento, bookUrl: (comBook[0] as any)?.bookUrl ?? null } : null,
        pecas: dentro.sort(porCodigo).map(pecaParaTela),
      });
    } catch (error: any) {
      console.error("[tubos] falha ao ler o tubo:", error);
      res.status(500).json({ error: "Não foi possível carregar o tubo." });
    }
  });

  // Cria o próximo tubo do evento — já com peças dentro, se vierem.
  app.post("/api/events/:eventId/tubos", requireAuth, async (req, res) => {
    if (!podeMexerEmTubo(req)) return res.status(403).json({ error: SEM_PAPEL });
    const ids = lerIds(req.body?.itemIds);
    if (ids === null) return res.status(400).json({ error: "itemIds deve ser uma lista de peças" });
    try {
      const eventId = req.params.eventId;
      const [evento] = await db.select({ id: events.id, name: events.name }).from(events).where(eq(events.id, eventId));
      if (!evento) return res.status(404).json({ error: "Evento não encontrado" });

      const { pecas, recusas } = await recusasParaColocar(req, eventId, ids);
      if (recusas.length) return res.status(409).json({ error: `Não dá para pôr no tubo — ${recusas.join("; ")}` });

      const tubo = await criarTubo(eventId, resolveActor(req).userName);
      await createAuditLog(req, "created", "tubo", tubo.id, `Tubo ${tubo.numero} criado (${evento.name})`);
      if (ids.length) await colocarNoTubo(req, tubo, pecas, ids);

      broadcast({ type: "tubos_atualizados", eventId });
      res.status(201).json(tubo);
    } catch (error: any) {
      console.error("[tubos] falha ao criar tubo:", error);
      res.status(500).json({ error: "Não foi possível criar o tubo." });
    }
  });

  // Coloca e tira peças do tubo. Mover de um tubo aberto para outro é permitido
  // e fica na trilha ("saiu do Tubo 2"); de tubo já entregue, não.
  app.patch("/api/tubos/:id/itens", requireAuth, async (req, res) => {
    if (!podeMexerEmTubo(req)) return res.status(403).json({ error: SEM_PAPEL });
    const adicionar = lerIds(req.body?.adicionar);
    const remover = lerIds(req.body?.remover);
    if (adicionar === null || remover === null) return res.status(400).json({ error: "adicionar e remover devem ser listas de peças" });
    if (adicionar.length === 0 && remover.length === 0) return res.status(400).json({ error: "Nada a mudar no tubo" });
    try {
      const [tubo] = await db.select().from(tubos).where(eq(tubos.id, req.params.id));
      if (!tubo) return res.status(404).json({ error: "Tubo não encontrado" });
      if (tubo.entregueEm) {
        return res.status(409).json({ error: `O Tubo ${tubo.numero} já foi entregue — não dá para mexer no que tem dentro` });
      }

      // A trava do Kit ANTES de qualquer escrita: as duas listas juntas, para
      // não gravar metade e recusar a outra metade.
      const mexidas = (await db.select(COLUNAS_PECA).from(itemsTable)
        .where(inArray(itemsTable.id, [...adicionar, ...remover]))) as PecaCrua[];
      if (barraPecaDoKit(req, res, mexidas)) return;

      if (adicionar.length) {
        const { pecas, recusas } = await recusasParaColocar(req, tubo.eventId, adicionar);
        if (recusas.length) return res.status(409).json({ error: `Não dá para pôr no Tubo ${tubo.numero} — ${recusas.join("; ")}` });
        await colocarNoTubo(req, tubo, pecas, adicionar);
      }

      if (remover.length) {
        const dentro = visiveis(req, (await db.select(COLUNAS_PECA).from(itemsTable)
          .where(and(inArray(itemsTable.id, remover), eq(itemsTable.tuboId, tubo.id)))) as PecaCrua[]);
        const ids = dentro.map((d) => d.id);
        if (ids.length) {
          await db.update(itemsTable).set({ tuboId: null, updatedAt: new Date() } as any).where(inArray(itemsTable.id, ids));
          await createAuditLogsEmLote(req, ids.map((id) => ({
            action: "updated", entityType: "item", entityId: id, details: `Peça retirada do Tubo ${tubo.numero}`,
          })));
          broadcast({ type: "items_bulk_updated", itemIds: ids, eventId: tubo.eventId });
        }
      }

      broadcast({ type: "tubos_atualizados", eventId: tubo.eventId });
      res.json({ ok: true, numero: tubo.numero });
    } catch (error: any) {
      console.error("[tubos] falha ao mudar peças do tubo:", error);
      res.status(500).json({ error: "Não foi possível mudar as peças do tubo." });
    }
  });

  // Apaga um tubo vazio e ainda não entregue — o criado por engano.
  app.delete("/api/tubos/:id", requireAuth, async (req, res) => {
    if (!podeMexerEmTubo(req)) return res.status(403).json({ error: SEM_PAPEL });
    try {
      const [tubo] = await db.select().from(tubos).where(eq(tubos.id, req.params.id));
      if (!tubo) return res.status(404).json({ error: "Tubo não encontrado" });
      if (tubo.entregueEm) return res.status(409).json({ error: `O Tubo ${tubo.numero} já foi entregue e não pode ser apagado` });
      // Kit: tubo vazio não tem peça dele — não é dele para apagar.
      if (quemVe(req).kit) return res.status(403).json({ error: "O usuário do Kit não apaga tubos" });
      const [{ n }] = linhas(await db.execute(sql`select count(*)::int as n from items where tubo_id = ${tubo.id} and deleted_at is null`));
      if (Number(n) > 0) {
        return res.status(409).json({ error: `O Tubo ${tubo.numero} ainda tem ${n} peça(s) — tire as peças antes de apagar` });
      }
      await db.delete(tubos).where(eq(tubos.id, tubo.id));
      await createAuditLog(req, "deleted", "tubo", tubo.id, `Tubo ${tubo.numero} apagado (estava vazio)`);
      broadcast({ type: "tubos_atualizados", eventId: tubo.eventId });
      res.json({ ok: true });
    } catch (error: any) {
      console.error("[tubos] falha ao apagar tubo:", error);
      res.status(500).json({ error: "Não foi possível apagar o tubo." });
    }
  });

  // ENTREGA DO TUBO INTEIRO: uma foto e um recebedor para tudo que está dentro.
  app.post("/api/tubos/:id/entregar", requireAuth, async (req, res) => {
    if (!podeMexerEmTubo(req)) return res.status(403).json({ error: "Sem permissão para registrar entrega" });
    const { photoUrl, receivedBy, notes } = req.body ?? {};
    // A foto é o comprovante — a mesma régua da entrega por peça.
    if (!photoUrl || typeof photoUrl !== "string") {
      return res.status(400).json({ error: "A foto da entrega é obrigatória — ela é o comprovante" });
    }
    const recebedor = typeof receivedBy === "string" ? receivedBy.trim() : "";
    const obs = typeof notes === "string" ? notes.trim() : "";
    try {
      const [tubo] = await db.select().from(tubos).where(eq(tubos.id, req.params.id));
      if (!tubo) return res.status(404).json({ error: "Tubo não encontrado" });
      if (tubo.entregueEm) return res.status(409).json({ error: `O Tubo ${tubo.numero} já foi entregue` });

      const dentro = (await db.select(COLUNAS_PECA).from(itemsTable)
        .where(and(eq(itemsTable.tuboId, tubo.id), isNull(itemsTable.deletedAt)))) as PecaCrua[];
      if (dentro.length === 0) return res.status(409).json({ error: `O Tubo ${tubo.numero} está vazio` });
      // Entregar o tubo é entregar TODAS as peças dele — inclusive as do Kit.
      if (barraPecaDoKit(req, res, dentro)) return;
      // Kit: entregar o tubo é entregar TUDO que está dentro — só se tudo for dele.
      if (visiveis(req, dentro).length !== dentro.length) {
        return res.status(403).json({ error: `O Tubo ${tubo.numero} tem peças fora do seu Kit` });
      }

      const faltam = dentro.filter((p) => !ehEntregue(p) && !ehConferidaInteira(p));
      if (faltam.length) {
        return res.status(409).json({
          error: `O Tubo ${tubo.numero} só é entregue inteiro, e ainda falta conferir: ${faltam.map((p) => p.displayId ?? "peça").join(", ")}`,
        });
      }
      const aEntregar = dentro.filter((p) => !ehEntregue(p));
      if (aEntregar.length === 0) return res.status(409).json({ error: `Tudo que está no Tubo ${tubo.numero} já foi entregue` });

      const quem = resolveActor(req);
      const agora = new Date();
      await db.transaction(async (tx) => {
        for (const p of aEntregar) {
          const conferidas = p.conferredQty ?? 0;
          await tx.update(itemsTable).set({
            deliveredQty: conferidas,
            deliveryPhotoUrl: photoUrl,
            updatedAt: agora,
            ...(recebedor ? { receivedBy: recebedor } : {}),
            ...(obs ? { deliveryNotes: obs } : {}),
            ...(conferidas >= p.quantity ? { status: "delivered", deliveredAt: agora } : {}),
          } as any).where(eq(itemsTable.id, p.id));
          await tx.insert(auditLogs).values({
            ...quem,
            action: "delivered",
            entityType: "item",
            entityId: p.id,
            details: `Entrega concluída (${conferidas}/${p.quantity}${recebedor ? `, recebido por: ${recebedor}` : ""}) — Tubo ${tubo.numero}`,
          } as any);
        }
        await tx.update(tubos).set({
          entregueEm: agora,
          recebidoPor: recebedor || null,
          fotoEntregaUrl: photoUrl,
          entregueObs: obs || null,
          entreguePor: quem.userName,
        } as any).where(eq(tubos.id, tubo.id));
      });

      // O evento pode ter FECHADO com esta entrega — e o aviso de "evento
      // concluído" é da Solicitação. O mesmo que PATCH /api/items/:id/deliver
      // faz; sem isto, o evento inteiro entregue por tubo fechava calado.
      const antes = await storage.getEvent(tubo.eventId);
      await updateEventStatus(tubo.eventId);
      const depois = await storage.getEvent(tubo.eventId);
      if (antes?.status !== "completed" && depois?.status === "completed") {
        const notification = await storage.createNotification({
          type: "eventCompleted",
          message: `Evento concluído: ${depois?.name} - Todos os itens foram entregues`,
          eventId: tubo.eventId,
          targetRoles: ["solicitacao"],
        });
        broadcast({ type: "notification_created", notification });
      }
      broadcast({ type: "items_bulk_updated", itemIds: aEntregar.map((p) => p.id), eventId: tubo.eventId });
      broadcast({ type: "tubos_atualizados", eventId: tubo.eventId });
      res.json({ ok: true, numero: tubo.numero, entregues: aEntregar.length });
    } catch (error: any) {
      console.error("[tubos] falha ao entregar o tubo:", error);
      res.status(500).json({ error: "Não foi possível registrar a entrega do tubo." });
    }
  });
}
