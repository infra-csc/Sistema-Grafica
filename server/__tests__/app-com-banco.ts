// ─────────────────────────────────────────────────────────────────────────────
// O APP DE VERDADE CONTRA O BANCO DE VERDADE — apoio dos testes de integração.
//
// Monta um Express com as MESMAS peças de server/routes.ts que decidem o
// resultado de uma requisição (identidade da sessão → req.userRole, barreira
// da Solicitação sobre peça do Kit, trava do Kit, régua de URL) e registra as
// rotas reais. Ficam de fora só os relógios (crons), o WebSocket e as rotas de
// arquivo (GCS) — nada disso muda o que uma rota grava.
//
// A sessão é de mentira no único ponto que importa: o cabeçalho
// `x-teste-usuario` diz quem está logado (id, nome, papel). O resto — banco,
// storage, transações, auditoria — é o código de produção.
//
// Use depois de subirBancoDeTeste() (server/db.ts lê DATABASE_URL ao carregar).
// Não é um arquivo de teste: é só o apoio.
// ─────────────────────────────────────────────────────────────────────────────
import type { AddressInfo } from "net";
import type { Server } from "http";
import type { Request, Response, NextFunction } from "express";
import type { BancoDeTeste } from "./banco-pglite";

export interface Usuario { id: string; nome: string; papel: string; kit?: boolean }

export const USUARIOS = {
  admin: { id: "u-admin", nome: "Ana Admin", papel: "admin" },
  solicitacao: { id: "u-sol", nome: "Sofia Solicitação", papel: "solicitacao" },
  arte: { id: "u-arte", nome: "Artur Arte", papel: "arte" },
  atendimento: { id: "u-atend", nome: "Atila Atendimento", papel: "atendimento" },
  grafica: { id: "u-graf", nome: "Gil Gráfica", papel: "grafica" },
  grafica2: { id: "u-graf2", nome: "Gabi Gráfica", papel: "grafica" },
} satisfies Record<string, Usuario>;

export interface Resposta<T = unknown> { status: number; corpo: T }

export interface AppDeTeste {
  base: string;
  chamar<T = Record<string, unknown>>(quem: Usuario, metodo: string, caminho: string, corpo?: unknown): Promise<Resposta<T>>;
  fechar(): Promise<void>;
}

/** Grava os usuários de USUARIOS no banco (a sessão aponta para eles). */
export async function semearUsuarios(banco: BancoDeTeste): Promise<void> {
  for (const u of Object.values(USUARIOS) as Usuario[]) {
    await banco.consultar(
      `INSERT INTO users (id, name, email, password_hash, role, kit) VALUES ($1, $2, $3, 'x', $4, $5) ON CONFLICT (id) DO NOTHING`,
      [u.id, u.nome, `${u.id}@teste.local`, u.papel, u.kit === true],
    );
  }
}

export async function montarApp(): Promise<AppDeTeste> {
  process.env.TEMPO_REAL_CANAL = "off";
  const express = (await import("express")).default;
  const { db } = await import("../db");
  const { items: itemsTable, events: eventsTable, tubos: tubosTable, tuboItens } = await import("@shared/schema");
  const { and, eq, inArray, isNotNull } = await import("drizzle-orm");
  const { travaDoKit } = await import("../trava-do-kit");
  const { campoDeUrlInseguro } = await import("@shared/url-segura");
  const { registerItemRoutes } = await import("../routes/items");
  const { registerEventRoutes } = await import("../routes/events");
  const { registerSponsorRoutes } = await import("../routes/sponsors");
  const { registerTubosRoutes } = await import("../routes/tubos");
  const { registerMaquinasRoutes } = await import("../routes/maquinas");
  const { registerEstoqueReservasRoutes } = await import("../routes/estoque-reservas");
  const { registerKitRoutes } = await import("../routes/kit");
  const { registerInventoryRoutes } = await import("../routes/inventory");

  const app = express();
  app.use(express.json({ limit: "5mb" }));

  // A "sessão": quem o teste disse que está logado.
  app.use((req: Request, _res: Response, next: NextFunction) => {
    const cru = req.header("x-teste-usuario");
    const u = cru ? (JSON.parse(decodeURIComponent(cru)) as Usuario) : null;
    const sessao = (u ? { userId: u.id, userName: u.nome, userRole: u.papel, userKit: u.kit === true } : {}) as Request["session"];
    Object.defineProperty(req, "session", { value: sessao, writable: true, configurable: true });
    next();
  });
  // Daqui para baixo, o mesmo que server/routes.ts faz antes das rotas.
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (req.session?.userId) {
      req.userId = req.session.userId;
      req.userName = req.session.userName || "Sistema";
      req.userRole = req.session.userRole;
      req.userKit = req.session.userKit === true;
    } else {
      req.userName = "Sistema";
    }
    next();
  });
  app.use(async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (req.userRole !== "solicitacao" || req.userKit || !["POST", "PATCH", "PUT", "DELETE"].includes(req.method)) return next();
      const ids: string[] = [];
      const alvo = req.path.match(/^\/api\/items\/([^/]+)(?:\/|$)/);
      if (alvo && !["bulk", "export-xlsx"].includes(alvo[1])) ids.push(alvo[1]);
      if (ids.length === 0) return next();
      const doKit = await db.select({ id: itemsTable.id }).from(itemsTable)
        .where(and(inArray(itemsTable.id, ids), isNotNull(itemsTable.kitRemessaId))).limit(1);
      if (doKit.length > 0) return res.status(403).json({ error: "Peça do Kit: a Solicitação da Arena só visualiza." });
      next();
    } catch (e) {
      next(e);
    }
  });
  app.use(travaDoKit({
    buscarPecas: (ids) => db.select({ id: itemsTable.id, kitRemessaId: itemsTable.kitRemessaId, criadoPorId: itemsTable.criadoPorId })
      .from(itemsTable).where(inArray(itemsTable.id, ids)),
    buscarCriadorDoEvento: async (eventId) => {
      const [ev] = await db.select({ createdBy: eventsTable.createdBy }).from(eventsTable).where(eq(eventsTable.id, eventId)).limit(1);
      return { existe: !!ev, createdBy: ev?.createdBy ?? null };
    },
    buscarPecasDoVolume: async (tuboId) => {
      const [volume] = await db.select({ id: tubosTable.id }).from(tubosTable).where(eq(tubosTable.id, tuboId)).limit(1);
      if (!volume) return null;
      return db.select({ id: itemsTable.id, kitRemessaId: itemsTable.kitRemessaId, criadoPorId: itemsTable.criadoPorId })
        .from(tuboItens).innerJoin(itemsTable, eq(itemsTable.id, tuboItens.itemId)).where(eq(tuboItens.tuboId, tuboId));
    },
  }));
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (!["POST", "PATCH", "PUT"].includes(req.method) || !req.path.startsWith("/api/")) return next();
    if (campoDeUrlInseguro(req.body)) return res.status(400).json({ error: "Link inválido" });
    next();
  });

  // A mesma ordem de server/routes.ts (a ordem decide qual rota casa).
  registerSponsorRoutes(app);
  registerEventRoutes(app);
  registerItemRoutes(app);
  registerMaquinasRoutes(app);
  registerTubosRoutes(app);
  registerEstoqueReservasRoutes(app);
  registerKitRoutes(app);
  registerInventoryRoutes(app);

  // Erro não tratado vira 500 com a mensagem — o teste precisa VER o que quebrou.
  app.use((erro: unknown, _req: Request, res: Response, _next: NextFunction) => {
    res.status(500).json({ error: erro instanceof Error ? erro.message : String(erro) });
  });

  const servidor: Server = await new Promise((ok) => {
    const s = app.listen(0, "127.0.0.1", () => ok(s));
  });
  const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;

  return {
    base,
    async chamar<T>(quem: Usuario, metodo: string, caminho: string, corpo?: unknown): Promise<Resposta<T>> {
      const r = await fetch(base + caminho, {
        method: metodo,
        headers: { "content-type": "application/json", "x-teste-usuario": encodeURIComponent(JSON.stringify(quem)) },
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
      });
      const texto = await r.text();
      let json: unknown = texto;
      try { json = texto ? JSON.parse(texto) : null; } catch { /* resposta não-JSON: devolve o texto */ }
      return { status: r.status, corpo: json as T };
    },
    async fechar() {
      await new Promise<void>((ok) => servidor.close(() => ok()));
      const { pool } = await import("../db");
      await pool.end().catch(() => {});
    },
  };
}

/** Uma peça gravada direto no banco (para montar cenário sem percorrer o fluxo inteiro). */
export async function semearPeca(
  banco: BancoDeTeste,
  p: { id: string; eventId: string; displayId: string; status: string; quantity: number; type?: string; largura?: string; altura?: string; extra?: Record<string, unknown> },
): Promise<void> {
  const colunas: Record<string, unknown> = {
    id: p.id, event_id: p.eventId, display_id: p.displayId, status: p.status, quantity: p.quantity,
    type: p.type ?? "Pórtico", description: "Peça de teste", area: "3.00", visual: "3.00",
    visual_width: p.largura ?? "3.00", visual_height: p.altura ?? "1.00",
    material: "Lona", finish: "Ilhós", measurement: "3.00 × 1.00", calculated_m2: "3.00",
    final_file_url: "/objects/uploads/final.pdf", approval_thumb_url: "/objects/uploads/thumb.png",
    ...p.extra,
  };
  const nomes = Object.keys(colunas);
  await banco.consultar(
    `INSERT INTO items (${nomes.join(", ")}) VALUES (${nomes.map((_, i) => `$${i + 1}`).join(", ")})`,
    Object.values(colunas),
  );
}

/** Um evento gravado direto no banco. `dias` = daqui a quantos dias ele começa (negativo = já foi). */
export async function semearEvento(banco: BancoDeTeste, id: string, nome: string, dias: number): Promise<void> {
  await banco.consultar(
    `INSERT INTO events (id, name, start_date, truck_departure_date, created_by)
     VALUES ($1, $2, now() + make_interval(days => $3), now() + make_interval(days => $4), $5)`,
    [id, nome, dias, dias - 5, USUARIOS.solicitacao.id],
  );
}
