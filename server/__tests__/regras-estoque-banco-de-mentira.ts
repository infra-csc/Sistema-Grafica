// ─────────────────────────────────────────────────────────────────────────────
// UM BANCO DE MENTIRA QUE ENTENDE O WHERE — apoio dos testes regras-estoque-*.
//
// As rotas de tubos, reservas e consultas de estoque falam com o banco pelo
// drizzle (select/insert/update/delete encadeados, transação, FOR UPDATE).
// Para EXECUTAR essas rotas sem Postgres, este banco:
//   · guarda as linhas por tabela (chaves do TypeScript, como o drizzle devolve);
//   · rende cada WHERE/ON com o PgDialect do drizzle e AVALIA o SQL gerado
//     (=, <>, in, not in, is null, and/or/not, comparações, least/coalesce/+);
//     now() e interval viram milissegundos; o que ele não entende (subconsulta,
//     função desconhecida) conta como verdadeiro;
//   · aplica o SET relativo (`quantidade + 3`, `least(...)`) na linha;
//   · desfaz TUDO o que a transação gravou quando ela lança (como o ROLLBACK);
//   · anota cada operação (tabela, SQL do WHERE, FOR UPDATE, transação) para o
//     teste conferir a ORDEM das travas e o que foi gravado.
// Não prova semântica de Postgres (concorrência, índice único, plano): isso é
// dos testes integracao-* com PGlite. Não é um arquivo de teste: é só o apoio.
// ─────────────────────────────────────────────────────────────────────────────
import { PgDialect } from "drizzle-orm/pg-core";
import { Column, SQL, Table, getTableColumns, getTableName, is } from "drizzle-orm";

const dialeto = new PgDialect();

export type Consulta = { sql: string; params: unknown[] };
/** O SQL que o drizzle mandaria ao Postgres (texto + parâmetros). */
export const renderizar = (s: unknown): Consulta | null => (s && is(s, SQL) ? dialeto.sqlToQuery(s as SQL) : null);

type Linha = Record<string, any>;
export type Operacao = {
  ordem: number;
  tipo: "select" | "insert" | "update" | "delete" | "execute";
  tabela: string;
  where: Consulta | null;
  travou: boolean;
  /** ORDER BY do select, já renderizado (`"items"."id" asc`). */
  orderBy?: string[];
  /** As chaves da projeção do select (null = a linha inteira). */
  colunas?: string[] | null;
  valores?: any;
  afetadas: Linha[];
  tx: number | null;
  desfeita: boolean;
};

// ─── o avaliador do SQL gerado ───────────────────────────────────────────────
type Token = { k: "col"; t: string; c: string } | { k: "param"; i: number } | { k: "num"; v: number } | { k: "str"; v: string } | { k: "p"; v: string } | { k: "w"; v: string };

function tokenizar(s: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (ch === '"') {
      const fim = s.indexOf('"', i + 1);
      const a = s.slice(i + 1, fim);
      i = fim + 1;
      if (s[i] === "." && s[i + 1] === '"') {
        const fim2 = s.indexOf('"', i + 2);
        out.push({ k: "col", t: a, c: s.slice(i + 2, fim2) });
        i = fim2 + 1;
      } else out.push({ k: "col", t: "", c: a });
      continue;
    }
    if (ch === "$") { const m = /^\$(\d+)/.exec(s.slice(i))!; out.push({ k: "param", i: Number(m[1]) - 1 }); i += m[0].length; continue; }
    if (ch === "'") { const fim = s.indexOf("'", i + 1); out.push({ k: "str", v: s.slice(i + 1, fim) }); i = fim + 1; continue; }
    const num = /^\d+(\.\d+)?/.exec(s.slice(i));
    if (num) { out.push({ k: "num", v: Number(num[0]) }); i += num[0].length; continue; }
    const op = /^(<>|>=|<=|::|[()=<>,+\-*/;.])/.exec(s.slice(i));
    if (op) { out.push({ k: "p", v: op[0] }); i += op[0].length; continue; }
    const w = /^[a-zA-Z_][a-zA-Z_0-9]*/.exec(s.slice(i));
    if (w) { out.push({ k: "w", v: w[0].toLowerCase() }); i += w[0].length; continue; }
    i++;
  }
  return out;
}

class Desconhecido extends Error {}
type Contexto = Record<string, Linha | null>;
type Resolver = (t: string, c: string, ctx: Contexto) => unknown;

const comparavel = (v: unknown): unknown => {
  if (v instanceof Date) return v.getTime();
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) && !Number.isNaN(Date.parse(v))) return Date.parse(v);
  return v;
};

function avaliador(q: Consulta, ctx: Contexto, resolver: Resolver) {
  const tk = tokenizar(q.sql);
  let p = 0;
  const olha = (o = 0) => tk[p + o];
  const eh = (t: Token | undefined, k: string, v?: string) => !!t && t.k === k && (v === undefined || (t as any).v === v);
  const pular = () => {
    // Pula um termo que não entendemos até o próximo and/or/")" do mesmo nível.
    let prof = 0;
    while (p < tk.length) {
      const t = tk[p];
      if (prof === 0 && (eh(t, "w", "and") || eh(t, "w", "or") || eh(t, "p", ")"))) break;
      if (eh(t, "p", "(")) prof++;
      if (eh(t, "p", ")")) prof--;
      p++;
    }
  };

  function valor(): unknown {
    let a = termo();
    while (eh(olha(), "p", "+") || eh(olha(), "p", "-") || eh(olha(), "p", "*") || eh(olha(), "p", "::")) {
      const op = (tk[p++] as any).v;
      if (op === "::") { p++; continue; } // ::int — o tipo não muda nada aqui
      const b = termo();
      if (a == null || b == null) { a = null; continue; }
      a = op === "+" ? Number(a) + Number(b) : op === "-" ? Number(a) - Number(b) : Number(a) * Number(b);
    }
    return a;
  }
  function termo(): unknown {
    const t = tk[p];
    if (!t) throw new Desconhecido();
    if (t.k === "col") { p++; return resolver(t.t, t.c, ctx); }
    if (t.k === "param") { p++; return q.params[t.i]; }
    if (t.k === "num") { p++; return t.v; }
    if (t.k === "str") { p++; return t.v; }
    if (eh(t, "w", "null")) { p++; return null; }
    if (eh(t, "w", "true")) { p++; return true; }
    if (eh(t, "w", "false")) { p++; return false; }
    if (eh(t, "w", "now") && eh(olha(1), "p", "(") && eh(olha(2), "p", ")")) { p += 3; return Date.now(); }
    if (eh(t, "w", "interval") && olha(1)?.k === "str") {
      // interval '1 day' → milissegundos (a conta de data vira conta de número)
      const [n, un] = (tk[p + 1] as { v: string }).v.split(" ");
      const ms: Record<string, number> = { day: 864e5, days: 864e5, hour: 36e5, hours: 36e5, minute: 6e4, minutes: 6e4 };
      if (!(un in ms)) throw new Desconhecido();
      p += 2;
      return Number(n) * ms[un];
    }
    if (t.k === "w" && ["least", "greatest", "coalesce", "lower"].includes(t.v) && eh(olha(1), "p", "(")) {
      p += 2;
      const args: unknown[] = [];
      while (!eh(olha(), "p", ")")) { args.push(valor()); if (eh(olha(), "p", ",")) p++; }
      p++;
      if (t.v === "coalesce") return args.find((x) => x != null) ?? null;
      if (t.v === "lower") return args[0] == null ? null : String(args[0]).toLowerCase();
      if (args.some((x) => x == null)) return null;
      return t.v === "least" ? Math.min(...args.map(Number)) : Math.max(...args.map(Number));
    }
    if (eh(t, "p", "(")) { p++; const v = valor(); if (!eh(olha(), "p", ")")) throw new Desconhecido(); p++; return v; }
    throw new Desconhecido();
  }
  function comparacao(): boolean {
    const inicio = p;
    try {
      const a = valor();
      const t = olha();
      if (eh(t, "w", "is")) {
        p++;
        const nao = eh(olha(), "w", "not"); if (nao) p++;
        if (!eh(olha(), "w", "null")) throw new Desconhecido();
        p++;
        return nao ? a != null : a == null;
      }
      const nao = eh(t, "w", "not") && eh(olha(1), "w", "in");
      if (nao || eh(t, "w", "in")) {
        p += nao ? 2 : 1;
        if (!eh(olha(), "p", "(") || eh(olha(1), "w", "select")) throw new Desconhecido();
        p++;
        const lista: unknown[] = [];
        while (!eh(olha(), "p", ")")) { lista.push(valor()); if (eh(olha(), "p", ",")) p++; }
        p++;
        if (a == null) return false;
        const dentro = lista.some((x) => String(comparavel(x)) === String(comparavel(a)));
        return nao ? !dentro : dentro;
      }
      if (t && t.k === "p" && ["=", "<>", ">=", "<=", ">", "<"].includes(t.v)) {
        p++;
        const b = valor();
        if (a == null || b == null) return false;
        const x = comparavel(a); const y = comparavel(b);
        switch (t.v) {
          case "=": return String(x) === String(y);
          case "<>": return String(x) !== String(y);
          case ">=": return (x as number) >= (y as number);
          case "<=": return (x as number) <= (y as number);
          case ">": return (x as number) > (y as number);
          default: return (x as number) < (y as number);
        }
      }
      if (typeof a === "boolean" && (!t || eh(t, "w", "and") || eh(t, "w", "or") || eh(t, "p", ")"))) return a;
      throw new Desconhecido();
    } catch (e) {
      if (!(e instanceof Desconhecido)) throw e;
      p = inicio;
      pular();
      return true;
    }
  }
  function primario(): boolean {
    if (eh(olha(), "w", "not")) {
      if (eh(olha(1), "w", "exists")) { pular(); return true; }
      p++;
      return !primario();
    }
    if (eh(olha(), "w", "exists")) { pular(); return true; }
    if (eh(olha(), "p", "(")) {
      const salvo = p;
      p++;
      try {
        const v = ou();
        if (eh(olha(), "p", ")")) { p++; return v; }
      } catch (e) { if (!(e instanceof Desconhecido)) throw e; }
      p = salvo;
    }
    return comparacao();
  }
  function e_(): boolean { let a = primario(); while (eh(olha(), "w", "and")) { p++; const b = primario(); a = a && b; } return a; }
  function ou(): boolean { let a = e_(); while (eh(olha(), "w", "or")) { p++; const b = e_(); a = a || b; } return a; }
  return { condicao: () => (tk.length ? ou() : true), valor: () => valor() };
}

// ─── o banco ────────────────────────────────────────────────────────────────
export type Banco = ReturnType<typeof criarBanco>;

/**
 * `inicial` é por NOME da tabela no banco ("tubos", "tubo_itens", "items"…),
 * com as linhas nas chaves do TypeScript (`eventId`, não `event_id`).
 */
export function criarBanco(
  inicial: Record<string, Linha[]> = {},
  opcoes: {
    /** `db.execute(sql)` — o teste responde (ex.: o próximo número do tubo). */
    executar?: (q: Consulta) => Linha[];
    /** Antes de cada INSERT: lance para simular erro do banco (ex.: 23505). */
    aoInserir?: (tabela: string, linhas: Linha[]) => void;
  } = {},
) {
  const mundo: Record<string, Linha[]> = {};
  for (const [t, ls] of Object.entries(inicial)) mundo[t] = ls.map((l) => ({ ...l }));
  const ops: Operacao[] = [];
  const tabelas = new Map<string, Table>();
  let seq = 0;
  let txSeq = 0;

  const registrar = (t: Table) => { const n = getTableName(t); tabelas.set(n, t); if (!mundo[n]) mundo[n] = []; return n; };
  const chaveTs = (t: string, c: string): string => {
    const tab = tabelas.get(t);
    if (!tab) return c;
    for (const [k, col] of Object.entries(getTableColumns(tab))) if ((col as Column).name === c) return k;
    return c;
  };
  const resolver: Resolver = (t, c, ctx) => {
    if (t && t in ctx) { const r = ctx[t]; return r ? r[chaveTs(t, c)] ?? null : null; }
    if (!t) { for (const [n, r] of Object.entries(ctx)) if (r && chaveTs(n, c) in r) return r[chaveTs(n, c)]; return null; }
    throw new Desconhecido();
  };
  const passa = (cond: unknown, ctx: Contexto) => { const q = renderizar(cond); return q ? avaliador(q, ctx, resolver).condicao() : true; };
  const valorDe = (expr: SQL, ctx: Contexto) => {
    const q = renderizar(expr)!;
    try { return avaliador(q, ctx, resolver).valor(); } catch { return undefined; }
  };

  const projetar = (proj: any, ctx: Contexto, principal: string): any => {
    if (!proj) {
      const nomes = Object.keys(ctx);
      return nomes.length === 1 ? { ...ctx[principal] } : Object.fromEntries(nomes.map((n) => [n, ctx[n] ? { ...ctx[n] } : null]));
    }
    const out: Linha = {};
    for (const [k, v] of Object.entries(proj)) {
      if (is(v, Column)) { const n = getTableName((v as any).table); const r = ctx[n]; out[k] = r ? r[chaveTs(n, (v as Column).name)] ?? null : null; }
      else if (is(v, Table)) { const r = ctx[getTableName(v as Table)]; out[k] = r ? { ...r } : null; }
      else if (is(v, SQL)) out[k] = valorDe(v as SQL, ctx);
      else if (v && typeof v === "object") out[k] = projetar(v, ctx, principal);
    }
    return out;
  };

  function construir(txId: number | null): any {
    const anotar = (o: Omit<Operacao, "ordem" | "tx" | "desfeita">) => { const op = { ...o, ordem: ops.length, tx: txId, desfeita: false }; ops.push(op); return op; };

    const select = (proj?: any) => ({
      from: (t: Table) => {
        const principal = registrar(t);
        const joins: Array<{ tipo: "inner" | "left"; t: string; on: unknown }> = [];
        let where: unknown; let lim: number | null = null; let travou = false; let ordem: unknown[] = [];
        const c: any = {
          innerJoin: (t2: Table, on: unknown) => { joins.push({ tipo: "inner", t: registrar(t2), on }); return c; },
          leftJoin: (t2: Table, on: unknown) => { joins.push({ tipo: "left", t: registrar(t2), on }); return c; },
          where: (w: unknown) => { where = w; return c; },
          orderBy: (...a: unknown[]) => { ordem = a; return c; },
          limit: (n: number) => { lim = n; return c; },
          offset: () => c,
          for: () => { travou = true; return c; },
          then: (ok: any, erro: any) => Promise.resolve().then(() => {
            let ctxs: Contexto[] = mundo[principal].map((r) => ({ [principal]: r }));
            for (const j of joins) {
              ctxs = ctxs.flatMap((ctx) => {
                const achados = mundo[j.t].filter((r2) => passa(j.on, { ...ctx, [j.t]: r2 }));
                if (achados.length) return achados.map((r2) => ({ ...ctx, [j.t]: r2 }));
                return j.tipo === "left" ? [{ ...ctx, [j.t]: null }] : [];
              });
            }
            ctxs = ctxs.filter((ctx) => passa(where, ctx));
            for (const o of [...ordem].reverse()) {
              let col: unknown = o; let desc = false;
              if (is(o, SQL)) {
                const r = renderizar(o)!;
                const m = /^"([^"]+)"\."([^"]+)" (asc|desc)$/.exec(r.sql.trim());
                if (!m) continue;
                col = { t: m[1], c: m[2] }; desc = m[3] === "desc";
              } else if (is(o, Column)) col = { t: getTableName((o as any).table), c: (o as Column).name };
              else continue;
              const { t: tn, c: cn } = col as { t: string; c: string };
              ctxs = [...ctxs].sort((x, y) => {
                const a = comparavel(resolver(tn, cn, x)) as any; const b = comparavel(resolver(tn, cn, y)) as any;
                const r = a == null ? 1 : b == null ? -1 : a < b ? -1 : a > b ? 1 : 0;
                return desc ? -r : r;
              });
            }
            if (lim !== null) ctxs = ctxs.slice(0, lim);
            const ordemTexto = ordem.map((o) => (is(o, SQL) ? renderizar(o)!.sql : is(o, Column) ? `"${getTableName((o as any).table)}"."${(o as Column).name}" asc` : String(o)));
            anotar({ tipo: "select", tabela: principal, where: renderizar(where), travou, orderBy: ordemTexto, colunas: proj ? Object.keys(proj) : null, afetadas: ctxs.map((x) => x[principal]!).filter(Boolean) });
            return ctxs.map((ctx) => projetar(proj, ctx, principal));
          }).then(ok, erro),
        };
        return c;
      },
    });

    const insert = (t: Table) => ({
      values: (v: Linha | Linha[]) => {
        const n = registrar(t);
        const lista = (Array.isArray(v) ? v : [v]).map((x) => ({ id: x.id ?? `${n}-${++seq}`, ...x }));
        let semConflito = false;
        let proj: any = undefined;
        let querRetorno = false;
        const rodar = () => {
          opcoes.aoInserir?.(n, lista);
          const pk = Object.entries(getTableColumns(t)).find(([, col]) => (col as Column).primary)?.[0] ?? "id";
          const gravadas = lista.filter((l) => !(semConflito && mundo[n].some((r) => r[pk] === l[pk])));
          mundo[n].push(...gravadas);
          anotar({ tipo: "insert", tabela: n, where: null, travou: false, valores: v, afetadas: gravadas });
          return querRetorno ? gravadas.map((r) => projetar(proj, { [n]: r }, n)) : [];
        };
        const p: any = {
          onConflictDoNothing: () => { semConflito = true; return p; },
          onConflictDoUpdate: () => p,
          returning: (pr?: any) => { querRetorno = true; proj = pr; return Promise.resolve().then(rodar); },
          then: (ok: any, erro: any) => Promise.resolve().then(rodar).then(ok, erro),
        };
        return p;
      },
    });

    const update = (t: Table) => ({
      set: (valores: Linha) => ({
        where: (w: unknown) => {
          const n = registrar(t);
          let proj: any = undefined; let querRetorno = false;
          const rodar = () => {
            const alvo = mundo[n].filter((r) => passa(w, { [n]: r }));
            for (const r of alvo) {
              const novos: Linha = {};
              for (const [k, v] of Object.entries(valores)) novos[k] = is(v, SQL) ? valorDe(v as SQL, { [n]: r }) : v;
              Object.assign(r, novos);
            }
            anotar({ tipo: "update", tabela: n, where: renderizar(w), travou: false, valores, afetadas: alvo.map((r) => ({ ...r })) });
            return querRetorno ? alvo.map((r) => projetar(proj, { [n]: r }, n)) : [];
          };
          const p: any = {
            returning: (pr?: any) => { querRetorno = true; proj = pr; return Promise.resolve().then(rodar); },
            then: (ok: any, erro: any) => Promise.resolve().then(rodar).then(ok, erro),
          };
          return p;
        },
      }),
    });

    const del = (t: Table) => ({
      where: (w: unknown) => {
        const n = registrar(t);
        let querRetorno = false; let proj: any;
        const rodar = () => {
          const alvo = mundo[n].filter((r) => passa(w, { [n]: r }));
          mundo[n] = mundo[n].filter((r) => !alvo.includes(r));
          anotar({ tipo: "delete", tabela: n, where: renderizar(w), travou: false, afetadas: alvo });
          return querRetorno ? alvo.map((r) => projetar(proj, { [n]: r }, n)) : [];
        };
        const p: any = {
          returning: (pr?: any) => { querRetorno = true; proj = pr; return Promise.resolve().then(rodar); },
          then: (ok: any, erro: any) => Promise.resolve().then(rodar).then(ok, erro),
          catch: (f: any) => Promise.resolve().then(rodar).catch(f),
        };
        return p;
      },
    });

    const execute = async (s: SQL) => {
      const q = renderizar(s)!;
      anotar({ tipo: "execute", tabela: "", where: q, travou: false, afetadas: [] });
      return { rows: opcoes.executar?.(q) ?? [] };
    };

    const transaction = async (fn: (tx: any) => Promise<unknown>) => {
      if (txId !== null) return fn(construir(txId));
      const id = ++txSeq;
      const foto = Object.fromEntries(Object.entries(mundo).map(([t, ls]) => [t, ls.map((l) => ({ ...l }))]));
      try {
        return await fn(construir(id));
      } catch (erro) {
        // ROLLBACK: o mundo volta ao que era, e o que a transação fez fica marcado.
        for (const k of Object.keys(mundo)) delete mundo[k];
        Object.assign(mundo, foto);
        for (const op of ops) if (op.tx === id) op.desfeita = true;
        throw erro;
      }
    };

    return { select, insert, update, delete: del, execute, transaction };
  }

  const db = construir(null);
  return {
    db,
    mundo,
    ops,
    /** As operações que valeram (fora de transação desfeita). */
    gravacoes: () => ops.filter((o) => o.tipo !== "select" && o.tipo !== "execute" && !o.desfeita),
    /** Tabela ⇐ linha pelo id. */
    linha: (tabela: string, id: string) => mundo[tabela]?.find((l) => l.id === id),
  };
}
