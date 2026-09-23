// ─────────────────────────────────────────────────────────────────────────────
// APOIO dos testes regras-fluxo-*: um BANCO DE MENTIRA que entende o drizzle o
// bastante para as rotas que falam direto com o `db` (pedidos de peça, sino).
//
// O que ele faz de verdade — e é por isso que o teste que o usa executa a
// regra, e não só o texto dela:
//   · o WHERE é AVALIADO linha a linha: eq, ne, isNull/isNotNull, inArray,
//     and/or (com a regra do NULL do SQL: `x <> 'a'` é falso quando x é nulo),
//     e o `doEventoNaoArquivado` (not exists … arquivado_em is not null);
//   · UPDATE … WHERE … RETURNING grava só nas linhas que casam — o "update
//     condicional" que segura corrida é o mesmo aqui e no Postgres;
//   · INSERT preenche os defaults literais das colunas; leftJoin por eq;
//   · db.transaction desfaz o mundo se o callback lançar.
// O que ele NÃO faz: SQL cru (db.execute vira só registro do texto) e funções
// de coluna (count, lower…) — quem precisa disso fica com a integração.
// Não é um arquivo de teste (não termina em .test.ts).
// ─────────────────────────────────────────────────────────────────────────────
import { Column, getTableColumns, getTableName, is, Param, SQL, StringChunk, Table } from "drizzle-orm";
import * as schema from "@shared/schema";

export type Tabelas = Record<string, Array<Record<string, any>>>;

const chaveDe = new Map<unknown, { tabela: string; chave: string }>();
for (const v of Object.values(schema)) {
  if (!is(v, Table)) continue;
  const nome = getTableName(v);
  for (const [chave, col] of Object.entries(getTableColumns(v))) chaveDe.set(col, { tabela: nome, chave });
}

type Tok =
  | { t: "col"; tabela: string; chave: string }
  | { t: "val"; v: unknown }
  | { t: "lista"; v: unknown[] }
  | { t: "op"; s: string };

const valorDe = (x: unknown) => (is(x, Param) ? (x as Param).value : x);

function achatar(no: unknown, saida: Array<Tok | { t: "txt"; s: string }>): void {
  if (no === undefined) return;
  if (is(no, SQL)) { for (const c of (no as SQL).queryChunks) achatar(c, saida); return; }
  if (is(no, StringChunk)) { for (const s of (no as StringChunk).value) saida.push({ t: "txt", s }); return; }
  if (is(no, Column)) {
    const k = chaveDe.get(no);
    if (!k) throw new Error("banco de mentira: coluna desconhecida");
    saida.push({ t: "col", ...k });
    return;
  }
  if (Array.isArray(no)) { saida.push({ t: "lista", v: no.map(valorDe) }); return; }
  saida.push({ t: "val", v: valorDe(no) });
}

/** O SQL "achatado": pedaços de texto, colunas (tabela/chave) e valores, na ordem. */
export function pedacosDoSql(q: unknown): Array<Tok | { t: "txt"; s: string }> {
  const saida: Array<Tok | { t: "txt"; s: string }> = [];
  achatar(q, saida);
  return saida;
}

// Os pedaços de texto que o drizzle monta (e o SQL cru que o app escreve nos
// WHERE), do mais longo para o mais curto — "not exists…" antes de "not".
const PEDACOS = [
  "not exists (select 1 from events ev_arq where ev_arq.id =", "and ev_arq.arquivado_em is not null)",
  "is not null", "is null", "and", "or", "not", "<>", "=", "in", "(", ")",
];

function tokenizar(no: unknown): Tok[] {
  const brutos: Array<Tok | { t: "txt"; s: string }> = [];
  achatar(no, brutos);
  const saida: Tok[] = [];
  for (const b of brutos) {
    if (b.t !== "txt") { saida.push(b); continue; }
    let s = b.s.toLowerCase().trim();
    while (s.length) {
      const p = PEDACOS.find((x) => s.startsWith(x) && (!/^[a-z]/.test(x) || !/[a-z_]/.test(s.charAt(x.length))));
      if (!p) throw new Error(`banco de mentira: SQL que eu não sei avaliar: "${b.s}"`);
      saida.push({ t: "op", s: p });
      s = s.slice(p.length).trim();
    }
  }
  return saida;
}

type Contexto = Record<string, Record<string, any> | undefined>;
const ler = (ctx: Contexto, c: { tabela: string; chave: string }) => ctx[c.tabela]?.[c.chave];
const igual = (a: unknown, b: unknown) =>
  a instanceof Date || b instanceof Date ? new Date(a as any).getTime() === new Date(b as any).getTime() : a === b;

/** Avalia o WHERE sobre um contexto ({ tabela: linha }). null = NULL do SQL. */
export function avaliar(cond: unknown, ctx: Contexto, t: Tabelas): boolean {
  if (cond === undefined) return true;
  const toks = tokenizar(cond);
  let i = 0;
  const olha = () => toks[i];
  const opE = (s: string) => { const k = olha(); return k?.t === "op" && k.s === s; };
  const expr = (): boolean | null => {
    let v = termo();
    while (opE("and") || opE("or")) {
      const op = (toks[i++] as { s: string }).s;
      const d = termo();
      v = op === "and"
        ? (v === false || d === false ? false : v === null || d === null ? null : true)
        : (v === true || d === true ? true : v === null || d === null ? null : false);
    }
    return v;
  };
  const termo = (): boolean | null => {
    const k = toks[i++];
    if (!k) throw new Error("banco de mentira: WHERE incompleto");
    if (k.t === "op" && k.s === "(") { const v = expr(); if (!opE(")")) throw new Error("banco de mentira: falta )"); i++; return v; }
    if (k.t === "op" && k.s === "not") { const v = termo(); return v === null ? null : !v; }
    if (k.t === "op" && k.s.startsWith("not exists")) {
      const c = toks[i++] as { t: "col"; tabela: string; chave: string };
      i++; // " and ev_arq.arquivado_em is not null)"
      const ev = (t.events ?? []).find((e) => e.id === ler(ctx, c));
      return !(ev && ev.arquivadoEm);
    }
    if (k.t === "val" && typeof k.v === "boolean") return k.v;
    if (k.t !== "col") throw new Error(`banco de mentira: termo inesperado ${JSON.stringify(k)}`);
    const esq = ler(ctx, k);
    const op = toks[i++] as { t: "op"; s: string };
    if (op.s === "is null") return esq == null;
    if (op.s === "is not null") return esq != null;
    const dir = toks[i++];
    const val = dir.t === "col" ? ler(ctx, dir) : dir.t === "val" ? dir.v : dir.t === "lista" ? dir.v : undefined;
    if (esq == null || val == null) return null;
    if (op.s === "=") return igual(esq, val);
    if (op.s === "<>") return !igual(esq, val);
    if (op.s === "in") return (val as unknown[]).some((x) => igual(esq, x));
    throw new Error(`banco de mentira: operador ${op.s}`);
  };
  return expr() === true;
}

/** O banco de mentira sobre `t` (as tabelas por nome, linhas com as chaves do drizzle). */
export function bancoDeMentira(t: Tabelas, sqlExecutado: string[] = []) {
  let seq = 0;
  const nomeDe = (tabela: unknown) => getTableName(tabela as Table);
  const linhasDe = (nome: string) => (t[nome] ??= []);

  function consulta(campos?: Record<string, unknown>) {
    let base = "";
    const joins: Array<{ nome: string; on: unknown }> = [];
    let where: unknown;
    let limite = Infinity;
    const resultado = () => {
      let ctxs: Contexto[] = linhasDe(base).map((l) => ({ [base]: l }));
      for (const j of joins) {
        ctxs = ctxs.map((c) => ({ ...c, [j.nome]: linhasDe(j.nome).find((l) => avaliar(j.on, { ...c, [j.nome]: l }, t)) }));
      }
      const casam = ctxs.filter((c) => avaliar(where, c, t)).slice(0, limite);
      return casam.map((c) => {
        if (!campos) return { ...c[base] };
        const o: Record<string, unknown> = {};
        for (const [alias, x] of Object.entries(campos)) {
          if (is(x, Table)) o[alias] = c[nomeDe(x)] ? { ...c[nomeDe(x)] } : null;
          else if (is(x, Column)) o[alias] = ler(c, chaveDe.get(x)!) ?? null;
          else throw new Error(`banco de mentira: campo calculado "${alias}" no SELECT`);
        }
        return o;
      });
    };
    const c: any = {
      from: (tabela: unknown) => { base = nomeDe(tabela); return c; },
      leftJoin: (tabela: unknown, on: unknown) => { joins.push({ nome: nomeDe(tabela), on }); return c; },
      innerJoin: (tabela: unknown, on: unknown) => { joins.push({ nome: nomeDe(tabela), on }); return c; },
      where: (w: unknown) => { where = w; return c; },
      orderBy: () => c, for: () => c,
      limit: (n: number) => { limite = n; return c; },
      then: (ok: any, erro: any) => Promise.resolve().then(resultado).then(ok, erro),
    };
    return c;
  }

  const projetar = (linhas: Array<Record<string, any>>, campos?: Record<string, unknown>) =>
    !campos ? linhas.map((l) => ({ ...l })) : linhas.map((l) => Object.fromEntries(Object.entries(campos).map(([a, col]) => [a, l[chaveDe.get(col)!.chave]])));

  const db: any = {
    select: (campos?: Record<string, unknown>) => consulta(campos),
    selectDistinct: (campos?: Record<string, unknown>) => consulta(campos),
    update: (tabela: unknown) => ({
      set: (valores: Record<string, unknown>) => ({
        where: (w: unknown) => {
          const nome = nomeDe(tabela);
          const alvo = linhasDe(nome).filter((l) => avaliar(w, { [nome]: l }, t));
          for (const l of alvo) Object.assign(l, valores);
          const p: any = Promise.resolve(projetar(alvo));
          p.returning = async (campos?: Record<string, unknown>) => projetar(alvo, campos);
          return p;
        },
      }),
    }),
    insert: (tabela: unknown) => ({
      values: (valores: any) => {
        const nome = nomeDe(tabela);
        const cols = getTableColumns(tabela as Table);
        const novas = (Array.isArray(valores) ? valores : [valores]).map((v: Record<string, unknown>) => {
          const linha: Record<string, any> = {};
          for (const [k, col] of Object.entries(cols)) {
            if (v[k] !== undefined) linha[k] = v[k];
            else if (k === "id") linha.id = `${nome}-${++seq}`;
            else if (col.default !== undefined && !is(col.default, SQL)) linha[k] = col.default;
            else if (is(col.default, SQL)) linha[k] = col.dataType === "date" ? new Date() : col.dataType === "array" ? [] : null;
            else linha[k] = null;
          }
          linhasDe(nome).push(linha);
          return linha;
        });
        const p: any = Promise.resolve(projetar(novas));
        p.returning = async (campos?: Record<string, unknown>) => projetar(novas, campos);
        p.onConflictDoNothing = () => p;
        return p;
      },
    }),
    delete: (tabela: unknown) => ({
      where: async (w: unknown) => {
        const nome = nomeDe(tabela);
        t[nome] = linhasDe(nome).filter((l) => !avaliar(w, { [nome]: l }, t));
        return [];
      },
    }),
    execute: async (q: unknown) => {
      const toks: Array<Tok | { t: "txt"; s: string }> = [];
      achatar(q, toks);
      sqlExecutado.push(toks.map((k) => (k.t === "txt" ? k.s : "?")).join(""));
      return { rows: [] };
    },
    transaction: async (fazer: (tx: unknown) => Promise<unknown>) => {
      const antes = structuredClone(t);
      try { return await fazer(db); } catch (e) {
        for (const k of Object.keys(t)) delete t[k];
        Object.assign(t, antes);
        throw e;
      }
    },
  };
  return db;
}
