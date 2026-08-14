// Audit-log routes. Extracted from server/routes.ts.
import type { Express } from "express";
import { storage, clampAuditLogLimit, type AuditLogCursor } from "../storage";
import { requireAuth } from "./shared";

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
      const { entityType, entityId, limit, withTotal, paged, cursor } = req.query;

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

      const logs = await storage.getAuditLogs(
        entityType as string | undefined,
        entityId as string | undefined,
        { limit: tamanho, cursor: cursorParsed },
      );

      // Página cheia = pode haver mais. Página curta = acabou, e o cliente para
      // de pedir sem precisar de uma requisição extra só para descobrir isso.
      const ultimo = logs[logs.length - 1];
      const nextCursor = logs.length === tamanho && ultimo ? encodeAuditCursor(ultimo) : null;

      const querContagem = withTotal === "1" || withTotal === "true";
      const querObjeto = querContagem || paged === "1" || paged === "true";

      if (querObjeto) {
        // ?withTotal=1: o count REAL da tabela, para a tela não vender o
        // tamanho da página como "total de registros" — e para o Histórico
        // saber quantas páginas ainda faltam antes de começar a pedi-las.
        if (querContagem) {
          const total = await storage.getAuditLogsCount(
            entityType as string | undefined,
            entityId as string | undefined,
          );
          return res.json({ logs, total, nextCursor });
        }
        return res.json({ logs, nextCursor });
      }

      res.json(logs);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

}
