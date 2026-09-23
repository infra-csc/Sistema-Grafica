// Shared middleware, helpers, and Express type augmentations used across all
// route modules (server/routes/*.ts). Extracted from the former monolithic
// server/routes.ts during the routes.ts → routes/* split — no behavior
// changes, just centralizing what multiple modules depend on.
import { z } from "zod";
import type { Request, Response, NextFunction } from "express";
import { createHash } from "crypto";
import { pool } from "../db";
import { storage } from "../storage";
import { statusParaContagem } from "@shared/molde";
import { publicarMensagem } from "../tempo-real";
import type { MensagemWS } from "@shared/ws-mensagens";

// Extend Express Request type to include userName and userId
declare global {
  namespace Express {
    interface Request {
      userName?: string;
      userId?: string;
      userRole?: string;
      /** Usuário do Kit: só vê e cria peças do Kit, e só as dele (14/09). */
      userKit?: boolean;
    }
  }
}

// Session data interface
declare module "express-session" {
  interface SessionData {
    userId?: string;
    userName?: string;
    userRole?: string;
    userKit?: boolean;
    /** VER COMO (15/09): o perfil real ("admin") enquanto o admin navega como outro perfil. */
    papelReal?: string;
  }
}

// Sockets abertos NESTA cópia do servidor (moram em server/tempo-real.ts).
export { wsClients } from "../tempo-real";

// Tempo real. A mensagem vira um SINAL (tipo + ids, shared/ws-mensagens.ts):
// o navegador busca o dado pela API, que aplica o recorte do Kit e do perfil.
// Invalida os caches desta cópia, entrega aos sockets daqui e publica no canal
// do Postgres para as outras cópias fazerem o mesmo (server/tempo-real.ts).
export function broadcast(data: MensagemWS) {
  publicarMensagem(data);
}

// Helper to translate status to Portuguese
export function translateStatus(status: string): string {
  const statusMap: Record<string, string> = {
    draft: "Rascunho",
    requested: "Solicitado",
    awaiting_linking: "Aguardando Vinculação",
    awaiting_submission: "Aguardando Envio",
    awaiting_approval: "Aguardando Aprovação",
    awaiting_finalization: "Aguardando Finalização",
    awaiting_final_review: "Aguardando Revisão Final",
    awaiting_review: "Aguardando Revisão",
    in_review: "Em Revisão",
    ready_for_production: "Pronto para Produção",
    approved: "Liberado",
    // Renomeados em 14/09 (dono): "Em Produção" → "Em Impressão" (a peça está
    // NA MÁQUINA) e "Produzido" → "Em Acabamento / Conferência" (saiu da
    // máquina e ainda precisa de acabamento e conferência). As chaves não
    // mudaram — só o que se lê. A trilha antiga segue com os nomes velhos, e
    // quem a interpreta reconhece os dois (ver tempo-etapas e a ficha).
    inProduction: "Em Impressão",
    produced: "Impresso / Acabamento",
    conferred: "Conferido",
    packed: "Embalado",
    delivered: "Entregue",
    canceled: "Cancelado",
    archived: "Arquivado",
    // Legacy status compatibility
    awaiting_sponsor_approval: "Aguardando Aprovação",
    sponsor_approved: "Aguardando Finalização",
    awaiting_creator_review: "Aguardando Revisão Final",
  };
  return statusMap[status] || status;
}

// ─── AUTORIA DA TRILHA ───────────────────────────────────────────────────────
//
// Toda linha de audit_logs precisa responder "quem fez" com DUAS coisas:
//
//   userName — legível, sobrevive à exclusão do usuário (denormalizado);
//   userId   — a identidade que RESISTE. Nome muda (casamento, correção de
//              cadastro) e repete (dois "Ana Silva"); o id não. Sem ele, a
//              trilha de meses atrás vira um nome que talvez não aponte mais
//              para ninguém — e a coluna já existia no schema, sempre nula.
//
// O ator pode chegar de três formas, e as três resolvem para o mesmo par:
//   • o próprio `req` (o caminho normal — Express.Request tem userName/userId);
//   • um objeto { userName, userId } (quando o nome é ajustado, ex.: 'Gráfica');
//   • uma string solta (assinatura legada, ainda usada pelos módulos de rota
//     que este agente não é dono — grava sem userId, mas nunca sem nome).
//
// NUNCA vazio: caminho sem sessão (job, cron, importação automática) grava
// "Sistema" de forma EXPLÍCITA. "Sistema" é uma afirmação ("foi a máquina");
// autor em branco seria uma omissão ("não sabemos"). A tela distingue as duas.
export const SYSTEM_ACTOR = "Sistema";

export type AuditActor =
  | { userName?: string | null; userId?: string | null }
  | string
  | null
  | undefined;

export function resolveActor(actor: AuditActor): { userName: string; userId: string | null } {
  if (typeof actor === "string") {
    return { userName: actor.trim() || SYSTEM_ACTOR, userId: null };
  }
  const nome = (actor?.userName ?? "").trim();
  return { userName: nome || SYSTEM_ACTOR, userId: actor?.userId ?? null };
}

// Helper to create audit logs
/**
 * Trilha em LOTE (auditoria 27/08): um INSERT para todas as linhas, com o
 * mesmo ator resolvido uma vez. Mesma política do unitário — falha de
 * auditoria não derruba a operação, mas grita no log com o que se perdeu.
 */
export async function createAuditLogsEmLote(
  actor: AuditActor,
  entradas: Array<{ action: string; entityType: string; entityId: string; details?: string }>,
) {
  if (entradas.length === 0) return;
  const quem = resolveActor(actor);
  try {
    await storage.createBulkAuditLogs(entradas.map((e) => ({ ...quem, ...e })));
  } catch (error) {
    console.error(
      `Failed to create bulk audit log [${entradas.length} linhas, ${entradas[0].action} ${entradas[0].entityType} por ${quem.userName}]:`,
      error
    );
  }
}

export async function createAuditLog(
  actor: AuditActor,
  action: string,
  entityType: string,
  entityId: string,
  details?: string
) {
  try {
    await storage.createAuditLog({
      ...resolveActor(actor),
      action,
      entityType,
      entityId,
      details,
    });
  } catch (error) {
    // O catch existe para que uma falha de auditoria não derrube a operação do
    // usuário — mas ele é o jeito de uma ação sumir da trilha em silêncio.
    // Por isso o log carrega O QUE se perdeu: dá para reconstruir a linha à mão.
    console.error(
      `Failed to create audit log [${action} ${entityType}:${entityId} por ${resolveActor(actor).userName}]:`,
      error
    );
  }
}

// Helper for sensitive routes (auth, user management): Zod validation errors
// are safe and useful to return as-is (400 + field message), but any other
// error (DB failures, unexpected exceptions, etc.) is logged in full on the
// server and reported to the client with a generic message only — never
// error.message, which could leak internal details.
export function sendSensitiveError(res: Response, error: unknown, context: string, status = 400) {
  console.error(`${context}:`, error);
  if (error instanceof z.ZodError) {
    const message = error.errors?.[0]?.message || "Dados inválidos";
    return res.status(400).json({ error: message });
  }
  return res.status(status).json({ error: "Não foi possível completar a operação" });
}

// "entregue" é a grafia LEGADA de delivered — conta como pronta, não pendente.
// Cancelada/excluída/arquivada sai da conta dos dois lados: não é trabalho
// pendente nem trabalho entregue, e não pode impedir um evento de fechar.
// Espelham DELIVERED/OUT_OF_FUNNEL de routes/events.ts (enrichEvent) — as duas
// regras TÊM de andar juntas, senão o valor gravado na coluna volta a divergir
// do valor que a API devolve. (Dívida conhecida: extrair para server/lib.)
const DELIVERED_STATUSES = new Set(["delivered", "entregue"]);
const OUT_OF_FUNNEL_STATUSES = new Set(["canceled", "deleted", "archived"]);

/**
 * Valor gravado em `events.status` quando UMA PESSOA encerra o evento.
 *
 * A coluna é `text` livre (schema: "created, completed, closed") — este
 * terceiro valor não pede migração nenhuma. É a única marca de encerramento
 * MANUAL do sistema: tudo o mais em torno de "evento acabou" é derivado da
 * produção (allDelivered) ou da data (eventHasPassed).
 */
export const EVENT_CLOSED_STATUS = "closed";

/**
 * Status PERSISTIDO do evento — deriva SÓ da produção, nunca da data.
 *
 * A versão anterior devolvia "completed" assim que `now > startDate`, isto é,
 * carimbava de concluído um evento que tinha apenas COMEÇADO. Como isto é
 * chamado de items.ts (8×), sponsors.ts e xlsxImport.ts, a mentira era gravada
 * no banco a cada mexida numa peça: o card ficava verde, perdia a bandeira de
 * prioridade e caía para o fim da lista exatamente quando virava um problema
 * irreversível (o caminhão já saiu). A listagem passou a DERIVAR o status na
 * leitura (enrichEvent), o que neutralizava o efeito visual — mas a escrita
 * errada continuava acontecendo, e qualquer consumidor que lesse a coluna crua
 * (export, relatório, consulta ao banco) seguia recebendo o carimbo falso.
 *
 * "A data chegou" continua existindo no payload da API como `eventHasPassed` —
 * separado de `allDelivered`, porque são duas perguntas diferentes.
 */
export async function calculateEventStatus(eventId: string): Promise<"created" | "completed"> {
  const event = await storage.getEvent(eventId);
  if (!event) return "created";

  const items = await storage.getItemsByEvent(eventId);

  let delivered = 0;
  let active = 0;
  for (const item of items) {
    if (OUT_OF_FUNNEL_STATUSES.has(item.status)) continue;
    active += 1;
    // Molde produzido é o fim do fluxo dele: conta como entregue (shared/molde).
    if (DELIVERED_STATUSES.has(statusParaContagem(item))) delivered += 1;
  }

  // Evento sem peça alguma (ou só com peças canceladas) NÃO está concluído:
  // não há produção terminada, há produção que nunca começou.
  return active > 0 && delivered === active ? "completed" : "created";
}

// Helper to update event status automatically
export async function updateEventStatus(eventId: string): Promise<void> {
  const event = await storage.getEvent(eventId);
  if (!event) return;

  // ENCERRAMENTO MANUAL VENCE A DERIVAÇÃO. Sem esta guarda, a primeira mexida
  // em qualquer peça do evento encerrado (8 chamadas em routes/items.ts, mais
  // sponsors.ts e xlsxImport.ts) reescreveria a coluna para created/completed
  // e o evento voltaria sozinho para as filas de trabalho e para a Gestão de
  // Prazos — desfazendo, sem log e sem aviso, uma decisão de gente. A saída de
  // "closed" existe num caminho só: POST /api/events/:id/reopen.
  if (event.status === EVENT_CLOSED_STATUS) return;

  const newStatus = await calculateEventStatus(eventId);

  if (event.status !== newStatus) {
    await storage.updateEvent(eventId, { status: newStatus });
    // Esta era a única escrita de estado de EVENTO sem trilha nenhuma: a coluna
    // ia e voltava entre "created" e "completed" a cada mexida em peça (10
    // chamadores) e nada registrava a virada. Não há pessoa a creditar — a
    // mudança é DERIVADA da produção —, então o autor é "Sistema" por
    // afirmação, com o motivo escrito por extenso. É o caminho automático que
    // a regra da casa pede: honesto, não vazio.
    await createAuditLog(
      SYSTEM_ACTOR,
      "updated",
      "event",
      eventId,
      newStatus === "completed"
        ? "Status do evento recalculado: Concluído (todas as peças ativas foram entregues)"
        : "Status do evento recalculado: Em andamento (voltou a existir peça ativa não entregue)"
    );
    broadcast({ type: "event_updated", event: { ...event, status: newStatus } });
  }
}

// Auth middleware - protect routes that require authentication
export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  if (!req.session?.userId) {
    return res.status(401).json({ error: "Não autenticado" });
  }
  next();
};

// Admin middleware - protect routes that require admin role
export const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (!req.session?.userId) {
    return res.status(401).json({ error: "Não autenticado" });
  }
  if (req.session.userRole !== 'admin') {
    return res.status(403).json({ error: "Acesso negado - apenas administradores" });
  }
  next();
};

// Role middleware factory — protects routes that require one of the given roles.
// Usage: requireRole("admin", "solicitacao")
export const requireRole = (...roles: string[]) => (req: Request, res: Response, next: NextFunction) => {
  if (!req.session?.userId) {
    return res.status(401).json({ error: "Não autenticado" });
  }
  if (!roles.includes(req.session.userRole as string)) {
    return res.status(403).json({ error: "Acesso negado" });
  }
  next();
};

/** O que as chaves do limitador leem do pedido (o Request do express cabe aqui). */
type PedidoParaChave = { ip?: string; socket?: { remoteAddress?: string }; session?: { userId?: string } };

function chaveDoIp(req: PedidoParaChave): string {
  return req.ip || req.socket?.remoteAddress || "unknown";
}

/**
 * Chave do limitador de escrita: o USUÁRIO da sessão. O galpão inteiro sai
 * para a internet por um IP só — por IP, dez pessoas conferindo juntas
 * dividiam uma cota e a décima levava 429. Sem sessão (login, SSO), o IP.
 */
export function chaveDoUsuarioOuIp(req: PedidoParaChave): string {
  const userId = req.session?.userId;
  return userId ? `u:${userId}` : `ip:${chaveDoIp(req)}`;
}

// Limitador em memória, POR CÓPIA do servidor (no Autoscale cada cópia conta
// sozinha). Serve de freio onde isso basta (escrita, troca de senha) e de
// reserva do limitador de login, que conta no Postgres (abaixo).
// `chave` troca o critério (ex.: por conta, no login); devolver null deixa passar.
export function createRateLimiter(opts: { windowMs: number; max: number; message: string; chave?: (req: Request) => string | null }) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  const limpeza = setInterval(() => {
    const now = Date.now();
    hits.forEach((v, k) => { if (v.resetAt < now) hits.delete(k); });
  }, 60_000);
  limpeza.unref?.();

  return (req: Request, res: Response, next: NextFunction) => {
    const key = opts.chave ? opts.chave(req) : chaveDoIp(req);
    if (key === null) return next();
    const now = Date.now();
    const entry = hits.get(key);

    if (!entry || entry.resetAt < now) {
      hits.set(key, { count: 1, resetAt: now + opts.windowMs });
      return next();
    }

    entry.count += 1;
    if (entry.count > opts.max) {
      return res.status(429).json({ error: opts.message });
    }
    next();
  };
}

// ── LIMITE DE LOGIN ENTRE AS CÓPIAS ─────────────────────────────────────────
// No Autoscale cada cópia contava sozinha: com N cópias, 10 tentativas viravam
// 10×N. O de login conta no Postgres (tabela limite_de_tentativas, criada por
// scripts/migracao-aditiva-producao.sql): uma linha por chave, contagem e fim
// da janela, num UPSERT atômico. A chave gravada é o hash (sem e-mail nem IP
// em claro). Sem a tabela (SQL não rodado) ou com o banco fora, cai no
// limitador em memória da cópia e avisa no log — o login não para por isso.
export const SQL_CONTAR_TENTATIVA = `
INSERT INTO limite_de_tentativas AS l (chave, contagem, reinicia_em)
VALUES ($1, 1, now() + $2::int * interval '1 millisecond')
ON CONFLICT (chave) DO UPDATE SET
  contagem = CASE WHEN l.reinicia_em <= now() THEN 1 ELSE l.contagem + 1 END,
  reinicia_em = CASE WHEN l.reinicia_em <= now() THEN EXCLUDED.reinicia_em ELSE l.reinicia_em END
RETURNING contagem`;
export const SQL_LIMPAR_TENTATIVAS = "DELETE FROM limite_de_tentativas WHERE reinicia_em < now() - interval '1 hour'";

type ConsultaSql = (sql: string, params: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
const consultarNoPool: ConsultaSql = (texto, params) => pool.query(texto, params);

export function createRateLimiterCompartilhado(opts: {
  nome: string; windowMs: number; max: number; message: string;
  chave?: (req: Request) => string | null;
  consultar?: ConsultaSql;
  agora?: () => number;
}) {
  const naMemoria = createRateLimiter(opts);
  const agora = opts.agora ?? Date.now;
  let avisou = false;
  let ultimaLimpeza = 0;
  return async (req: Request, res: Response, next: NextFunction) => {
    const key = opts.chave ? opts.chave(req) : chaveDoIp(req);
    if (key === null) return next();
    const consultar = opts.consultar ?? consultarNoPool;
    let contagem: number;
    try {
      const hash = createHash("sha256").update(`${opts.nome}:${key}`).digest("hex");
      const { rows } = await consultar(SQL_CONTAR_TENTATIVA, [hash, opts.windowMs]);
      contagem = Number(rows?.[0]?.contagem);
      if (!Number.isFinite(contagem)) throw new Error("contagem ausente na resposta do banco");
    } catch (erro: unknown) {
      if (!avisou) {
        avisou = true;
        const campos = typeof erro === "object" && erro !== null ? (erro as { code?: unknown; message?: unknown }) : undefined;
        const motivo = campos?.code === "42P01"
          ? "a tabela limite_de_tentativas não existe (rode scripts/migracao-aditiva-producao.sql)"
          : `o banco falhou (${campos?.message ?? erro})`;
        console.warn(`[limite:${opts.nome}] ${motivo} — contando na memória desta cópia.`);
      }
      return naMemoria(req, res, next);
    }
    // Faxina das janelas vencidas, no máximo a cada 10 min por cópia, fora do caminho da resposta.
    if (agora() - ultimaLimpeza > 10 * 60_000) {
      ultimaLimpeza = agora();
      consultar(SQL_LIMPAR_TENTATIVAS, []).catch(() => {});
    }
    if (contagem > opts.max) return res.status(429).json({ error: opts.message });
    next();
  };
}

export const loginRateLimiter = createRateLimiterCompartilhado({
  nome: "login-ip",
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Muitas tentativas de login. Tente novamente em alguns minutos.",
});

// Por CONTA, além do por IP: quem troca de IP (botnet, 4G) não ganha tentativas
// novas contra o mesmo e-mail. Bloqueia 15 min depois de 10 tentativas.
export const loginPorContaRateLimiter = createRateLimiterCompartilhado({
  nome: "login-conta",
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Muitas tentativas de login nesta conta. Tente novamente em alguns minutos.",
  chave: (req) => {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    return email ? `conta:${email}` : null;
  },
});

export const changePasswordRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Muitas tentativas. Tente novamente em alguns minutos.",
});

// General write rate limiter — applied to all mutation routes (POST/PUT/PATCH/DELETE)
// to slow down automated scripts without affecting normal human usage.
// 300 mutações em 5 min POR USUÁRIO (≈ 1/s sustentado, acima de qualquer
// pessoa). Por cópia do servidor: com várias cópias o teto real é maior — é
// freio de script, não cota.
export const writeRateLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000,
  max: 300,
  message: "Muitas requisições. Aguarde alguns minutos antes de continuar.",
  chave: chaveDoUsuarioOuIp,
});
