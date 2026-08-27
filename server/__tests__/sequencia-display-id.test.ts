// ─────────────────────────────────────────────────────────────────────────────
// A SEQUÊNCIA DOS NÚMEROS DE PEÇA não pode sumir — e, se sumir, tem de voltar.
//
// O CASO (25/08, produção): o `npm run db:push` das colunas novas DERRUBOU a
// item_display_id_seq — o drizzle-kit apaga objeto que o schema não declara, a
// mesma doença que a tabela `session` já tinha sofrido. O servidor, que
// memoriza "já criei" por processo, foi direto no nextval e TODA criação de
// peça morreu com `relation "item_display_id_seq" does not exist` até alguém
// reiniciar — o dono pegou o erro no meio de uma Entrada Rápida.
//
// Duas defesas, e as duas têm de existir:
//   1. DECLARAR a sequência no schema → o push para de derrubá-la (prevenção);
//   2. AUTOCURA no storage → se ainda assim ela sumir com o servidor de pé,
//      zera a memória, recria e repete, em vez de falhar até o reinício.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const ler = (rel: string) => readFileSync(path.resolve(__dirname, "../..", rel), "utf8");
const SCHEMA = ler("shared/schema.ts");
const STORAGE = ler("server/storage.ts");

describe("prevenção: o schema declara a sequência", () => {
  it("pgSequence com o MESMO nome que o storage usa no SQL cru", () => {
    expect(SCHEMA).toContain('export const itemDisplayIdSeq = pgSequence("item_display_id_seq", { startWith: 1 });');
    // e o storage de fato usa esse nome — se um lado renomear, este teste
    // aponta o outro
    expect(STORAGE).toContain("SELECT nextval('item_display_id_seq') as next_id");
    expect(STORAGE).toContain("CREATE SEQUENCE IF NOT EXISTS item_display_id_seq START WITH 1");
  });

  it("o comentário conta o caso — a próxima pessoa não pode 'limpar' a declaração", () => {
    // sem \n no assert: o arquivo pode viver com CRLF neste repositório
    expect(SCHEMA).toContain("declara é objeto que o drizzle-kit push DERRUBA");
    expect(SCHEMA).toContain("does not");
  });
});

describe("autocura: sequência sumida com o servidor de pé", () => {
  it("42P01 na sequência zera a memória, recria e repete — não vira falha permanente", () => {
    expect(STORAGE).toContain('return error?.code === "42P01" && String(error?.message ?? "").includes("item_display_id_seq");');
    const i = STORAGE.indexOf("private async withDisplayIdRetry");
    const bloco = STORAGE.slice(i, i + 900);
    expect(bloco).toContain("if (this.isDisplayIdSequenceMissing(error)) {");
    expect(bloco).toContain("this.displayIdSequenceInitialized = null;");
    expect(bloco).toContain("await this.ensureDisplayIdSequence();");
    // e a rede antiga (colisão de displayId entre processos) continua
    expect(bloco).toContain("if (!this.isDisplayIdConflict(error)) throw error;");
  });

  it("os DOIS caminhos de criação passam pela rede — peça única e lote", () => {
    expect(STORAGE).toContain("async createItem(insertItem: InsertItem): Promise<Item> {\n    return this.withDisplayIdRetry(");
    expect(STORAGE).toContain("return this.withDisplayIdRetry(async () => {\n      // Gerar todos os displayIds em uma única query");
  });
});
