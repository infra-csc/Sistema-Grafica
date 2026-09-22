// ─────────────────────────────────────────────────────────────────────────────
// UMA TRANSAÇÃO DE MENTIRA sobre o "mundo" dos testes de rota (revisão de
// 22/09). Conferir e excluir peça passaram a ler e gravar a peça DENTRO de uma
// transação com `SELECT … FOR UPDATE` (e não mais por storage.getItem/
// updateItem), então os testes que rodam os handlers reais com o banco
// mockado precisam de um `tx` que:
//   · SELECT de `items` devolve as peças do mundo cujos ids aparecem no WHERE;
//   · UPDATE de `items` aplica o SET nessas peças (e devolve no RETURNING);
//   · o resto (tubos, linhas de tubo) começa vazio.
// Os ids saem do WHERE do drizzle (eq/inArray/and), lidos nos pedaços do SQL.
// Não é um arquivo de teste (não termina em .test.ts): é só o apoio.
// ─────────────────────────────────────────────────────────────────────────────
import { items } from "@shared/schema";

/** Todos os textos soltos no WHERE (os valores dos parâmetros entre eles). */
export function textosDoWhere(no: unknown, saida: string[] = [], vistos = new Set<unknown>()): string[] {
  if (no == null) return saida;
  if (typeof no === "string") { saida.push(no); return saida; }
  if (typeof no !== "object" || vistos.has(no)) return saida;
  vistos.add(no);
  if (Array.isArray(no)) { for (const x of no) textosDoWhere(x, saida, vistos); return saida; }
  const o = no as Record<string, unknown>;
  if ("queryChunks" in o) textosDoWhere(o.queryChunks, saida, vistos);
  if ("value" in o) textosDoWhere(o.value, saida, vistos);
  return saida;
}

export type OperacaoDoTx = { tipo: "update" | "insert" | "delete"; tabela: unknown; valores?: any; ids: string[] };

export function txDeMentira(mundo: { itens: Record<string, any> }, ops: OperacaoDoTx[] = []) {
  const idsDoMundo = (w: unknown) => Array.from(new Set(textosDoWhere(w).filter((t) => t in mundo.itens)));
  const consulta = (tabela: unknown) => {
    let where: unknown = null;
    const resultado = () => (tabela === items ? idsDoMundo(where).map((id) => ({ ...mundo.itens[id] })) : []);
    const c: any = {
      where: (w: unknown) => { where = w; return c; },
      orderBy: () => c, for: () => c, limit: () => c, innerJoin: () => c, leftJoin: () => c,
      then: (ok: any, erro: any) => Promise.resolve(resultado()).then(ok, erro),
    };
    return c;
  };
  const tx: any = {
    select: () => ({ from: (tabela: unknown) => consulta(tabela) }),
    update: (tabela: unknown) => ({
      set: (valores: any) => ({
        where: (w: unknown) => {
          const ids = tabela === items ? idsDoMundo(w) : [];
          // "and deleted_at is null": a peça já na lixeira não é regravada.
          const alvo = valores && "deletedAt" in valores ? ids.filter((id) => !mundo.itens[id].deletedAt) : ids;
          for (const id of alvo) {
            const limpos = Object.fromEntries(Object.entries(valores).filter(([, v]) => typeof v !== "object" || v === null || v instanceof Date));
            mundo.itens[id] = { ...mundo.itens[id], ...limpos };
          }
          ops.push({ tipo: "update", tabela, valores, ids: alvo });
          const linhas = alvo.map((id) => ({ ...mundo.itens[id] }));
          const p: any = Promise.resolve(linhas);
          p.returning = async () => linhas;
          return p;
        },
      }),
    }),
    insert: (tabela: unknown) => ({
      values: (valores: any) => {
        ops.push({ tipo: "insert", tabela, valores, ids: [] });
        const p: any = Promise.resolve([{ id: `linha-${ops.length}`, ...valores }]);
        p.returning = async () => [{ id: `linha-${ops.length}`, ...valores }];
        return p;
      },
    }),
    delete: (tabela: unknown) => ({ where: () => { ops.push({ tipo: "delete", tabela, ids: [] }); return Promise.resolve([]); } }),
    execute: async () => ({ rows: [] }),
  };
  return tx;
}
