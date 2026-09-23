// Audit-log routes. Extracted from server/routes.ts.
import type { Express } from "express";
import { and, eq, inArray, ne, or, sql } from "drizzle-orm";
import { auditLogs } from "@shared/schema";
import { db } from "../db";
import { storage, clampAuditLogLimit, auditLogsFilter, auditLogsBusca, type AuditLogCursor } from "../storage";
import { requireAuth, sendSensitiveError } from "./shared";

/**
 * Trilha de gestão de usuários (cadastro, perfil, senha, "ver como") é só do
 * admin. O usuário do Kit, além disso, só vê o que ele fez e o histórico das
 * peças do Kit dele.
 */
export function recortarTrilha<L extends { entityType?: string | null; entityId?: string | null; userId?: string | null }>(
  logs: L[],
  quem: { admin: boolean; kit: boolean; userId: string | null; minhas: Set<string> },
): L[] {
  return logs.filter((l) => {
    if (!quem.admin && l.entityType === "user") return false;
    if (quem.kit) return (!!quem.userId && l.userId === quem.userId) || (l.entityType === "item" && quem.minhas.has(l.entityId ?? ""));
    return true;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// CURSOR — o texto que a rota devolve e volta a receber.
//
// Formato: "<createdAt em ISO>|<id>". Legível de propósito: quando alguém
// depurar uma página com curl, o cursor diz sozinho de onde ela veio, o que um
// blob base64 não faria. O `|` e os `:` do ISO são escapados pelo cliente com
// encodeURIComponent; o Express desfaz isso antes de o handler ler.
//
// O id é UUID e não contém "|", então a quebra no PRIMEIRO "|" é sempre exata.
// ─────────────────────────────────────────────────────────────────────────────

export function encodeAuditCursor(log: { createdAt: Date | string; id: string }): string {
  const at = log.createdAt instanceof Date ? log.createdAt : new Date(log.createdAt);
  return `${at.toISOString()}|${log.id}`;
}

/**
 * Devolve o cursor, ou `null` quando o texto não é um cursor válido.
 *
 * Cursor inválido NÃO pode ser ignorado em silêncio: ignorar devolveria a
 * PRIMEIRA página de novo, e um cliente que caminha para trás pedindo página
 * após página entraria em laço infinito recebendo sempre as mesmas linhas. A
 * rota responde 400 e o laço para.
 */
export function parseAuditCursor(raw: string): AuditLogCursor | null {
  const corte = raw.indexOf("|");
  if (corte <= 0) return null;
  const at = new Date(raw.slice(0, corte));
  const id = raw.slice(corte + 1).trim();
  if (!id || Number.isNaN(at.getTime())) return null;
  return { createdAt: at, id };
}

export function registerAuditLogRoutes(app: Express): void {
  // ============ AUDIT LOGS ============

  // Get audit logs (all or filtered by type/entity)
  //
  // Segurança — por que NÃO é requireAdmin: a intenção era exigir admin na
  // listagem completa (trilha de auditoria do sistema inteiro) e deixar
  // requireAuth só para consultas com escopo (?entityId= de uma entidade).
  // Só que HOJE as telas Atendimento, Arte, Gráfica, Histórico e Vincular
  // Patrocinadores — todas acessíveis a perfis não-admin (ver ROLES_* no
  // App.tsx) — baixam a listagem completa sem filtro para montar históricos
  // por peça no client. Restringir aqui quebraria essas cinco telas.
  // Mitigação aplicada: teto por página no storage.getAuditLogs.
  // Pendência: migrar essas telas para consultas com escopo
  // (?entityType=/&entityId=) e então exigir admin na listagem completa.
  //
  // FORMATO DA RESPOSTA — três, e o padrão é intocável:
  //   (nenhum)      → array puro. Cinco telas consomem a lista pura.
  //   ?withTotal=1  → { logs, total, nextCursor }
  //   ?paged=1      → { logs, nextCursor }   (sem o count(*), que varre a tabela)
  app.get("/api/audit-logs", requireAuth, async (req, res) => {
    try {
      const { entityType, entityId, limit, withTotal, paged, cursor, busca } = req.query;

      let cursorParsed: AuditLogCursor | null = null;
      if (typeof cursor === "string" && cursor.trim()) {
        cursorParsed = parseAuditCursor(cursor);
        if (!cursorParsed) {
          return res.status(400).json({ error: "Cursor de paginação inválido." });
        }
      }

      // ?limit=N: o recorte desce para o SQL em vez de acontecer sobre um
      // resultado já trazido do banco. O modal de revisão pede 8 registros e
      // recebia 500 pelo cabo para descartar 492.
      const pedido = Number.parseInt(limit as string, 10);
      const tamanho = clampAuditLogLimit(Number.isFinite(pedido) ? pedido : undefined);

      const admin = req.userRole === "admin";
      const kit = req.userKit === true;
      const userId = req.userId ?? null;
      const tipo = entityType as string | undefined;
      const termo = typeof busca === "string" ? busca : undefined;
      // Pedir só a trilha de usuários sem ser admin: nada a mostrar.
      const bruto = !admin && tipo === "user"
        ? []
        : await storage.getAuditLogs(tipo, entityId as string | undefined, { limit: tamanho, cursor: cursorParsed, busca: termo });
      // Usuário do Kit (14/09): só o que ele fez e o histórico das peças dele.
      const minhas = kit
        ? new Set(await storage.getIdsDasPecasDoKitDoCriador(userId ?? null))
        : new Set<string>();
      const logs = recortarTrilha(bruto, { admin, kit, userId, minhas });

      // Página cheia = pode haver mais. Conta a página BRUTA: o recorte pode
      // encurtá-la sem que a trilha tenha acabado.
      const ultimo = bruto[bruto.length - 1];
      const nextCursor = bruto.length === tamanho && ultimo ? encodeAuditCursor(ultimo) : null;

      const querContagem = withTotal === "1" || withTotal === "true";
      const querObjeto = querContagem || paged === "1" || paged === "true";

      if (querObjeto) {
        // ?withTotal=1: o count REAL da tabela, para a tela não vender o
        // tamanho da página como "total de registros" — e para o Histórico
        // saber quantas páginas ainda faltam antes de começar a pedi-las.
        if (querContagem) {
          const total = admin
            ? await storage.getAuditLogsCount(tipo, entityId as string | undefined, termo)
            : await contarRecortado({ tipo, entityId: entityId as string | undefined, busca: termo, kit, userId, minhas });
          return res.json({ logs, total, nextCursor });
        }
        return res.json({ logs, nextCursor });
      }

      res.json(logs);
    } catch (error) {
      sendSensitiveError(res, error, "Get audit logs error", 500);
    }
  });

}

/** O `total` com o mesmo recorte da lista (sem trilha de usuários; Kit só o dele). */
async function contarRecortado(f: {
  tipo?: string; entityId?: string; busca?: string; kit: boolean; userId: string | null; minhas: Set<string>;
}): Promise<number> {
  if (f.tipo === "user") return 0;
  const doKit = f.kit
    ? or(
        f.userId ? eq(auditLogs.userId, f.userId) : sql`false`,
        f.minhas.size > 0 ? and(eq(auditLogs.entityType, "item"), inArray(auditLogs.entityId, Array.from(f.minhas))) : sql`false`,
      )
    : undefined;
  const condicoes = [auditLogsFilter(f.tipo, f.entityId), auditLogsBusca(f.busca), ne(auditLogs.entityType, "user"), doKit]
    .filter((c): c is NonNullable<typeof c> => c !== undefined);
  const [linha] = await db.select({ total: sql<number>`count(*)::int` }).from(auditLogs).where(and(...condicoes));
  return linha?.total ?? 0;
}
