import { beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({ rascunhos: [] as unknown[], pecas: {} as Record<string, unknown[]>, query: vi.fn() }));
vi.mock("../db", () => ({ db: {}, pool: { query: H.query } }));
vi.mock("../objectStorage", () => ({ ObjectStorageService: class {} }));
vi.mock("../services/auditoria-do-book/pdf", () => ({ lerPdfDoBook: vi.fn() }));
import { atualizarRascunhos, pecasDaVersao } from "../services/book-automatico";

const peca = (id: string, thumb: string | null = "/objects/a", tipo = "Rolo") => ({ id, displayId: `#${id}`, tipo, descricao: "rolo x", thumb });

beforeEach(() => {
  H.query.mockReset();
  H.query.mockImplementation(async (sql: string, args: unknown[]) => {
    if (/from rascunhos_do_book/.test(sql)) return { rows: H.rascunhos };
    if (/from items/.test(sql)) return { rows: H.pecas[String(args[0])] ?? [] };
    return { rows: [] };
  });
});

describe("o rascunho se refaz sozinho", () => {
  it("thumb trocado refaz", async () => {
    H.pecas.e1 = [peca("1", "/objects/b")];
    H.rascunhos = [{ eventId: "e1", p: pecasDaVersao([peca("1", "/objects/a")]), passou: true }];
    const refazer = vi.fn(async () => undefined);
    expect(await atualizarRascunhos(refazer)).toBe("e1");
    expect(refazer).toHaveBeenCalledWith("e1");
  });
  it("sem mudança, não gasta nada", async () => {
    H.pecas.e1 = [peca("1")];
    H.rascunhos = [{ eventId: "e1", p: pecasDaVersao([peca("1")]), passou: true }];
    const refazer = vi.fn(async () => undefined);
    expect(await atualizarRascunhos(refazer)).toBeNull();
    expect(refazer).not.toHaveBeenCalled();
  });
  it("gerado há pouco espera: a Arte costuma trocar várias em sequência", async () => {
    H.pecas.e1 = [peca("1", "/objects/b")];
    H.rascunhos = [{ eventId: "e1", p: pecasDaVersao([peca("1", "/objects/a")]), passou: false }];
    const refazer = vi.fn(async () => undefined);
    expect(await atualizarRascunhos(refazer)).toBeNull();
  });
  it("um evento por rodada, para não pesar no servidor", async () => {
    H.pecas.e1 = [peca("1", "/objects/b")]; H.pecas.e2 = [peca("2", "/objects/b")];
    H.rascunhos = [{ eventId: "e1", p: pecasDaVersao([peca("1", "/objects/a")]), passou: true }, { eventId: "e2", p: pecasDaVersao([peca("2", "/objects/a")]), passou: true }];
    const refazer = vi.fn(async () => undefined);
    await atualizarRascunhos(refazer);
    expect(refazer).toHaveBeenCalledTimes(1);
  });
  it("peça nova e peça que saiu também contam", async () => {
    H.pecas.e1 = [peca("2")];
    H.rascunhos = [{ eventId: "e1", p: pecasDaVersao([peca("1")]), passou: true }];
    const refazer = vi.fn(async () => undefined);
    expect(await atualizarRascunhos(refazer)).toBe("e1");
  });
  it("só olha evento ativo e por vir", async () => {
    H.rascunhos = [];
    await atualizarRascunhos(vi.fn());
    const sql = String(H.query.mock.calls[0][0]);
    expect(sql).toContain("e.arquivado_em is null");
    expect(sql).toContain("e.status <> 'closed'");
    expect(sql).toContain("e.start_date >=");
  });
  it("falha ao refazer sobe para quem chamou registrar, sem esconder", async () => {
    H.pecas.e1 = [peca("1", "/objects/b")];
    H.rascunhos = [{ eventId: "e1", p: pecasDaVersao([peca("1", "/objects/a")]), passou: true }];
    await expect(atualizarRascunhos(async () => { throw new Error("sem memória"); })).rejects.toThrow("sem memória");
  });
});
