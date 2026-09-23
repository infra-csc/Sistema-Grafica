// ─────────────────────────────────────────────────────────────────────────────
// RODAR UM HANDLER DE ROTA SEM EXPRESS — o mesmo `appFalso` que vários testes
// de rota montam à mão, num lugar só.
//
// `capturarRotas(registrar)` chama a função de registro (registerXRoutes) com
// um app de mentira e guarda a pilha de handlers de cada "VERBO /caminho".
// `chamar` roda a pilha na ordem do Express: um middleware que não chama
// next() (ou que responde) encerra ali. Devolve status e corpo.
//
// Não é um arquivo de teste (não termina em .test.ts): é só o apoio.
// ─────────────────────────────────────────────────────────────────────────────
import type { Express } from "express";

type Handler = (req: unknown, res: unknown, next: (erro?: unknown) => void) => unknown;

export interface ContextoDaChamada {
  params?: Record<string, string>;
  body?: unknown;
  query?: Record<string, unknown>;
  /** Vira req.session (userId/userRole/userName/userKit) E os campos req.user* que routes.ts copia dela. */
  sessao?: { userId?: string; userRole?: string; userName?: string; userKit?: boolean } & Record<string, unknown>;
  headers?: Record<string, string>;
  ip?: string;
}

export interface RespostaFalsa { status: number; body: unknown; headers: Record<string, unknown> }

export function capturarRotas(registrar: (app: Express) => void | Promise<void>) {
  const rotas = new Map<string, Handler[]>();
  const app: Record<string, unknown> = {};
  for (const verbo of ["get", "post", "patch", "put", "delete"]) {
    app[verbo] = (caminho: string, ...hs: Handler[]) => { rotas.set(`${verbo.toUpperCase()} ${caminho}`, hs); return app; };
  }
  app.use = () => app;
  const pronto = registrar(app as unknown as Express);

  async function chamar(chave: string, ctx: ContextoDaChamada = {}): Promise<RespostaFalsa> {
    await pronto;
    const hs = rotas.get(chave);
    if (!hs) throw new Error(`Rota não registrada: ${chave}. Registradas: ${Array.from(rotas.keys()).join(", ")}`);
    const sessao: Record<string, unknown> = {
      ...ctx.sessao,
      regenerate: (cb: (e?: unknown) => void) => cb(),
      save: (cb: (e?: unknown) => void) => cb(),
      destroy: (cb: (e?: unknown) => void) => cb(),
    };
    const req = {
      params: ctx.params ?? {}, body: ctx.body ?? {}, query: ctx.query ?? {}, headers: ctx.headers ?? {},
      ip: ctx.ip ?? "127.0.0.1", socket: { remoteAddress: ctx.ip ?? "127.0.0.1" },
      session: sessao, sessionID: "sid-teste",
      userId: ctx.sessao?.userId, userRole: ctx.sessao?.userRole, userName: ctx.sessao?.userName ?? "Sistema", userKit: ctx.sessao?.userKit === true,
      header: (n: string) => ctx.headers?.[n.toLowerCase()],
      get: (n: string) => ctx.headers?.[n.toLowerCase()],
    };
    const res = {
      _status: 200, _body: undefined as unknown, _feito: false, _headers: {} as Record<string, unknown>,
      status(c: number) { res._status = c; return res; },
      json(b: unknown) { res._body = b; res._feito = true; return res; },
      send(b: unknown) { res._body = b; res._feito = true; return res; },
      end() { res._feito = true; return res; },
      set(k: string, v: unknown) { res._headers[k.toLowerCase()] = v; return res; },
      setHeader(k: string, v: unknown) { res._headers[k.toLowerCase()] = v; return res; },
      getHeader(k: string) { return res._headers[k.toLowerCase()]; },
      sendStatus(c: number) { res._status = c; res._feito = true; return res; },
    };
    for (const h of hs) {
      let seguiu = false;
      let erro: unknown;
      await h(req, res, (e?: unknown) => { seguiu = true; erro = e; });
      if (erro) throw erro;
      if (res._feito || !seguiu) break;
    }
    return { status: res._status, body: res._body, headers: res._headers };
  }

  return { rotas, chamar };
}
