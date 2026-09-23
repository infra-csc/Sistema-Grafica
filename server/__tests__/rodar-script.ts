// ─────────────────────────────────────────────────────────────────────────────
// RODAR UM SCRIPT DE scripts/ DENTRO DO TESTE, com um banco de mentira.
//
// Os scripts de reparo/backfill se executam ao ser importados quando o
// próprio nome está em process.argv[1] e terminam com process.exit(). Aqui:
// argv vira o do script (com as opções pedidas), o `db` de server/db é
// trocado pelo de mentira, e a 1ª chamada a process.exit encerra o main (lança
// para ele parar ali, como a saída de verdade pararia). A do `.catch` do
// script só é registrada. Devolve os códigos de saída.
//
// Não é um arquivo de teste (não termina em .test.ts): é só o apoio.
// ─────────────────────────────────────────────────────────────────────────────
import { vi } from "vitest";

export async function rodarScript(opcoes: {
  /** O import do script, escrito no teste: () => import("../../scripts/x"). */
  importar: () => Promise<unknown>;
  /** Nome que o script procura em argv[1]. */
  nome: string;
  args?: string[];
  db: unknown;
}): Promise<{ saidas: number[] }> {
  vi.resetModules();
  vi.doMock("../db", () => ({ db: opcoes.db, pool: {} }));
  const argvAntes = process.argv;
  const exitAntes = process.exit;
  const saidas: number[] = [];
  let fim!: () => void;
  const terminou = new Promise<void>((ok) => { fim = ok; });
  process.argv = ["node", `scripts/${opcoes.nome}.ts`, ...(opcoes.args ?? [])];
  process.exit = ((codigo?: number) => {
    saidas.push(codigo ?? 0);
    fim();
    if (saidas.length === 1) throw new Error("__saida_do_script__");
    return undefined as never;
  }) as typeof process.exit;
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const erro = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    await opcoes.importar();
    await terminou;
    await new Promise((ok) => setTimeout(ok, 0));
  } finally {
    process.argv = argvAntes;
    process.exit = exitAntes;
    log.mockRestore();
    erro.mockRestore();
    vi.doUnmock("../db");
  }
  return { saidas };
}
