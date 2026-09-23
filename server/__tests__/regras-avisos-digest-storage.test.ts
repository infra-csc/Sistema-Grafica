// ─────────────────────────────────────────────────────────────────────────────
// DESTINATÁRIOS NO STORAGE — veio de notificacoes-admin.test.ts, que lia o
// texto de shared/schema.ts e server/storage.ts. Agora:
//   · a tabela é conferida pelo drizzle (getTableConfig), não pelo texto;
//   · addEmailDestinatario roda de verdade sobre um banco de mentira: adicionar
//     duas vezes (mesmo com caixa/espaço diferentes) não vira dois e-mails.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";

process.env.DATABASE_URL = "postgres://test:test@localhost:5432/banco_nunca_acessado";

const H = vi.hoisted(() => ({
  linhas: [] as Array<{ id: string; canal: string; email: string; addedBy: string | null }>,
  inseridos: [] as any[],
}));

// SELECT devolve as linhas do mundo (o filtro por canal é do SQL, e o teste
// usa um canal só); INSERT grava e devolve no RETURNING.
vi.mock("../db", () => {
  const select = () => {
    const q: any = {
      from: () => q, where: () => q, orderBy: () => q,
      then: (ok: any, falha: any) => Promise.resolve(H.linhas.map((l) => ({ ...l }))).then(ok, falha),
    };
    return q;
  };
  const insert = () => ({
    values: (v: any) => ({
      returning: async () => {
        const criado = { id: `d${H.linhas.length + 1}`, ...v };
        H.inseridos.push(v);
        H.linhas.push(criado);
        return [criado];
      },
    }),
  });
  return { db: { select, insert }, pool: {} };
});

const { storage } = await import("../storage");
const { emailDestinatarios } = await import("@shared/schema");

beforeEach(() => {
  H.linhas = [{ id: "d1", canal: "gestao", email: "Ana.Motta@NorteMkt.com ", addedBy: null }];
  H.inseridos = [];
});

describe("a tabela", () => {
  it("email_destinatarios existe, com canal e e-mail obrigatórios", () => {
    const t = getTableConfig(emailDestinatarios);
    expect(t.name).toBe("email_destinatarios");
    const col = (n: string) => t.columns.find((c) => c.name === n);
    expect(col("canal")?.notNull).toBe(true);
    expect(col("email")?.notNull).toBe(true);
    expect(col("added_by")).toBeDefined();
  });
});

describe("addEmailDestinatario", () => {
  it("adicionar duas vezes não vira dois e-mails — devolve o que já existia", async () => {
    const r = await storage.addEmailDestinatario({ canal: "gestao", email: " ana.motta@nortemkt.com", addedBy: "Yan" });
    expect(r.id).toBe("d1");
    expect(H.inseridos).toHaveLength(0);
  });

  it("e-mail novo é gravado normalizado (minúsculas, sem espaço)", async () => {
    const r = await storage.addEmailDestinatario({ canal: "gestao", email: " Livia@NorteMkt.com " });
    expect(H.inseridos).toEqual([{ canal: "gestao", email: "livia@nortemkt.com", addedBy: null }]);
    expect(r.email).toBe("livia@nortemkt.com");
  });
});
