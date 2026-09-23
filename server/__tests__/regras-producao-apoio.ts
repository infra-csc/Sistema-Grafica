// ─────────────────────────────────────────────────────────────────────────────
// APOIO dos testes regras-producao-*: as rotas REAIS num app que só guarda
// handlers, e um banco de mentira que entende o drizzle o bastante para os
// handlers de peça, tubo e máquina rodarem.
//
// O banco de mentira:
//   · SELECT devolve as linhas do "mundo" cujo id (ou eventId/tuboId/itemId)
//     aparece no WHERE — o mesmo truque de tx-de-mentira.ts, para mais tabelas;
//   · UPDATE/INSERT/DELETE mexem no mundo e ficam no diário `ops`, com
//     `emTx` (dentro de db.transaction?) e a ordem em que aconteceram;
//   · `.for("update")` vira um "trava" no diário — é o que os testes de ordem
//     (trava → conta → gravação) leem;
//   · db.transaction desfaz o mundo se o callback lançar (como o Postgres).
// Não é um arquivo de teste (não termina em .test.ts).
// ─────────────────────────────────────────────────────────────────────────────
import { getTableName } from "drizzle-orm";
import { textosDoWhere } from "./tx-de-mentira";

// ─── As rotas reais ──────────────────────────────────────────────────────────
type Handler = (req: any, res: any, next: any) => any;
export type Chamada = { params?: Record<string, string>; body?: any; query?: any; userRole?: string; userKit?: boolean; userId?: string; userName?: string };
export type Resposta = { status: number; body: any };

export function montarRotas(...registros: Array<(app: any) => void>) {
  const rotas = new Map<string, Handler[]>();
  const appFalso: any = {};
  for (const verbo of ["get", "post", "patch", "put", "delete"]) {
    appFalso[verbo] = (caminho: string, ...hs: Handler[]) => { rotas.set(`${verbo.toUpperCase()} ${caminho}`, hs); return appFalso; };
  }
  appFalso.use = () => appFalso;
  for (const r of registros) r(appFalso);

  async function chamar(chave: string, ctx: Chamada = {}): Promise<Resposta> {
    const hs = rotas.get(chave);
    if (!hs) throw new Error(`Rota não registrada: ${chave}`);
    const req: any = {
      params: ctx.params ?? {}, body: ctx.body ?? {}, query: ctx.query ?? {}, headers: {}, session: {},
      userRole: ctx.userRole, userKit: ctx.userKit === true, userId: ctx.userId ?? "u1", userName: ctx.userName ?? "Maria",
    };
    const res: any = { _status: 200, _body: undefined, _done: false, headersSent: false };
    res.status = (c: number) => { res._status = c; return res; };
    res.json = (b: any) => { res._body = b; res._done = true; return res; };
    res.send = res.json; res.set = () => res; res.setHeader = () => res; res.end = () => { res._done = true; return res; };
    for (const h of hs) {
      let seguiu = false;
      await h(req, res, () => { seguiu = true; });
      if (res._done || !seguiu) break;
    }
    return { status: res._status, body: res._body };
  }
  return { rotas, chamar };
}

/** O texto cru de um `sql\`\`` do drizzle (para saber qual consulta é). */
export const textoDoSql = (q: any): string =>
  (q?.queryChunks ?? []).map((c: any) => (Array.isArray(c?.value) ? c.value.join("") : "")).join("");

// ─── O banco de mentira ──────────────────────────────────────────────────────
export type MundoDoBanco = {
  itens: Record<string, any>;
  tubos: Record<string, any>;
  linhas: Record<string, any>;   // tubo_itens
  eventos: Record<string, any>;
  /** Tabelas só de escrita (audit_logs, registros_de_impressao…): o que foi inserido. */
  inseridos: Record<string, any[]>;
};

export type OpDoBanco = {
  tipo: "select" | "trava" | "update" | "insert" | "delete" | "execute" | "tx";
  tabela?: string;
  valores?: any;
  ids?: string[];
  sql?: string;
  /** Os valores soltos do SQL (parâmetros) — ex.: a chave do lock consultivo. */
  textos?: string[];
  /** As colunas do ORDER BY (nome no banco). */
  ordem?: string[];
  emTx: boolean;
};

export function mundoVazio(): MundoDoBanco {
  return { itens: {}, tubos: {}, linhas: {}, eventos: {}, inseridos: {} };
}

const COLECAO: Record<string, keyof Omit<MundoDoBanco, "inseridos">> = {
  items: "itens", tubos: "tubos", tubo_itens: "linhas", events: "eventos",
};

/** Valor que o SET pode gravar direto (os `sql\`\`` relativos ficam só no diário). */
const ehValorSimples = (v: unknown) => v === null || typeof v !== "object" || v instanceof Date || Array.isArray(v) || !("queryChunks" in (v as object));

export function bancoDeMentira(mundo: MundoDoBanco, ganchos: {
  /** Resposta de `db.execute(sql)`; o padrão é { rows: [] }. */
  aoExecutar?: (sql: string, q: any) => any;
  /** Pode lançar (ex.: 23505) ou devolver as linhas a inserir. */
  aoInserir?: (tabela: string, valores: any[]) => void;
} = {}) {
  const ops: OpDoBanco[] = [];
  let profundidade = 0;
  let seq = 0;
  const nomeDe = (t: unknown) => { try { return getTableName(t as any); } catch { return "?"; } };
  const colecao = (tabela: string): Record<string, any> | null => (COLECAO[tabela] ? mundo[COLECAO[tabela]] : null);
  const casa = (linha: any, textos: Set<string>, soId = false) =>
    textos.has(linha.id) || (!soId && (textos.has(linha.eventId) || textos.has(linha.tuboId) || textos.has(linha.itemId)));

  const consulta = (tabela: string, colunas?: Record<string, unknown>) => {
    let where: unknown = null;
    let trava = false;
    let ordem: string[] | undefined;
    const resultado = () => {
      const col = colecao(tabela);
      const textos = new Set(textosDoWhere(where));
      const linhas = col ? Object.values(col).filter((l) => casa(l, textos)).map((l) => ({ ...l })) : [];
      // A PROJEÇÃO vale: coluna que a consulta não pediu não chega (como no banco).
      const projetadas = colunas ? linhas.map((l) => Object.fromEntries(Object.keys(colunas).map((k) => [k, l[k]]))) : linhas;
      ops.push({ tipo: trava ? "trava" : "select", tabela, ids: linhas.map((l) => l.id), ordem, emTx: profundidade > 0 });
      return projetadas;
    };
    const c: any = {
      where: (w: unknown) => { where = w; return c; },
      orderBy: (...cols: any[]) => { ordem = cols.map((x) => x?.name ?? String(x)); return c; }, limit: () => c, innerJoin: () => c, leftJoin: () => c, groupBy: () => c,
      for: () => { trava = true; return c; },
      then: (ok: any, erro: any) => Promise.resolve().then(resultado).then(ok, erro),
    };
    return c;
  };

  const db: any = {
    ops,
    select: (colunas?: Record<string, unknown>) => ({ from: (t: unknown) => consulta(nomeDe(t), colunas) }),
    selectDistinct: (colunas?: Record<string, unknown>) => ({ from: (t: unknown) => consulta(nomeDe(t), colunas) }),
    update: (t: unknown) => ({
      set: (valores: any) => ({
        where: (w: unknown) => {
          const tabela = nomeDe(t);
          const col = colecao(tabela);
          const textos = new Set(textosDoWhere(w));
          const alvo = col ? Object.values(col).filter((l) => casa(l, textos, true)) : [];
          const simples = Object.fromEntries(Object.entries(valores ?? {}).filter(([, v]) => ehValorSimples(v)));
          for (const l of alvo) col![l.id] = { ...col![l.id], ...simples };
          ops.push({ tipo: "update", tabela, valores, ids: alvo.map((l) => l.id), emTx: profundidade > 0 });
          const linhas = alvo.map((l) => ({ ...col![l.id] }));
          const p: any = Promise.resolve(linhas);
          p.returning = async () => linhas;
          return p;
        },
      }),
    }),
    insert: (t: unknown) => ({
      values: (valores: any) => {
        const tabela = nomeDe(t);
        const lista = Array.isArray(valores) ? valores : [valores];
        const executar = () => {
          ganchos.aoInserir?.(tabela, lista);
          const col = colecao(tabela);
          const linhas = lista.map((v) => ({ id: v.id ?? `${tabela}-${++seq}`, ...v }));
          if (col) for (const l of linhas) col[l.id] = l;
          else (mundo.inseridos[tabela] ??= []).push(...linhas);
          ops.push({ tipo: "insert", tabela, valores, ids: linhas.map((l) => l.id), emTx: profundidade > 0 });
          return linhas;
        };
        // Preguiçoso como o drizzle: roda no await (e o `.returning()` também).
        const p: any = { then: (ok: any, erro: any) => Promise.resolve().then(executar).then(ok, erro) };
        p.returning = () => Promise.resolve().then(executar);
        p.onConflictDoNothing = () => p;
        return p;
      },
    }),
    delete: (t: unknown) => ({
      where: (w: unknown) => {
        const tabela = nomeDe(t);
        const col = colecao(tabela);
        const textos = new Set(textosDoWhere(w));
        const alvo = col ? Object.values(col).filter((l) => casa(l, textos, true)) : [];
        for (const l of alvo) delete col![l.id];
        ops.push({ tipo: "delete", tabela, ids: alvo.map((l) => l.id), emTx: profundidade > 0 });
        const p: any = Promise.resolve(alvo);
        p.returning = async () => alvo;
        p.catch = (f: any) => Promise.resolve(alvo).catch(f);
        return p;
      },
    }),
    execute: async (q: any) => {
      const sql = textoDoSql(q);
      ops.push({ tipo: "execute", sql, textos: textosDoWhere(q), emTx: profundidade > 0 });
      return ganchos.aoExecutar?.(sql, q) ?? { rows: [] };
    },
    transaction: async (cb: (tx: any) => any) => {
      const antes = structuredClone(mundo);
      profundidade++;
      ops.push({ tipo: "tx", emTx: true });
      try {
        return await cb(db);
      } catch (e) {
        // ROLLBACK: o mundo volta a ser o de antes da transação.
        for (const k of Object.keys(mundo) as Array<keyof MundoDoBanco>) (mundo as any)[k] = antes[k];
        throw e;
      } finally {
        profundidade--;
      }
    },
  };
  return db;
}
