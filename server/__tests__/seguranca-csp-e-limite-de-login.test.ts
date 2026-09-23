// CSP sem script inline em produção (o cabeçalho e o HTML servido) e o limite
// de login contado no Postgres — o mesmo para todas as cópias do servidor.
import { describe, it, expect, vi } from "vitest";
import { existsSync, readFileSync } from "fs";
import path from "path";

vi.mock("../db", () => ({ db: {}, pool: {} }));
vi.mock("../storage", () => ({ storage: {} }));

const { politicaDeConteudo, cabecalhosDeSeguranca } = await import("../cabecalhos-de-seguranca");
const { createRateLimiterCompartilhado, SQL_CONTAR_TENTATIVA } = await import("../routes/shared");

const RAIZ = path.resolve(__dirname, "..", "..");
const ler = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf8");
const diretiva = (csp: string, nome: string) => csp.split(";").map((d) => d.trim()).find((d) => d.startsWith(`${nome} `)) ?? "";

/** Todo <script> do HTML: com src, ou inline (com o nonce/hash, se houver). */
function scriptsDo(html: string) {
  return Array.from(html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)).map(([, attrs, corpo]) => ({
    externo: /\bsrc\s*=/.test(attrs),
    comNonce: /\bnonce\s*=/.test(attrs),
    corpo: corpo.trim(),
  }));
}

function rodarCabecalhos(emProducao: boolean) {
  const h: Record<string, string> = {};
  const res: any = { setHeader: (k: string, v: string) => { h[k] = v; } };
  const next = vi.fn();
  cabecalhosDeSeguranca(emProducao)({} as any, res, next);
  expect(next).toHaveBeenCalled();
  return h;
}

describe("CSP", () => {
  it("produção: script-src só 'self' — sem 'unsafe-inline' nem 'unsafe-eval'", () => {
    const h = rodarCabecalhos(true);
    const script = diretiva(h["Content-Security-Policy"], "script-src");
    expect(script).toBe("script-src 'self'");
    expect(h["X-Frame-Options"]).toBe("DENY");
    expect(h["Strict-Transport-Security"]).toContain("max-age=");
    expect(diretiva(h["Content-Security-Policy"], "frame-ancestors")).toBe("frame-ancestors 'none'");
  });

  it("estilo inline segue permitido (o app usa style={…} em toda tela)", () => {
    expect(diretiva(politicaDeConteudo(true), "style-src")).toContain("'unsafe-inline'");
  });

  it("dev: o Vite injeta script inline (React Refresh, overlay de erro) — só lá vale 'unsafe-inline'", () => {
    const h = rodarCabecalhos(false);
    expect(diretiva(h["Content-Security-Policy"], "script-src")).toContain("'unsafe-inline'");
    expect(h["X-Frame-Options"]).toBeUndefined();
  });

  it("o index.html de origem não tem <script> inline", () => {
    const scripts = scriptsDo(ler("client/index.html"));
    expect(scripts.length).toBeGreaterThan(0);
    expect(scripts.filter((s) => !s.externo && !s.comNonce)).toEqual([]);
  });

  it("o index.html do build (se existir) não tem <script> inline", () => {
    const build = "dist/public/index.html";
    if (!existsSync(path.join(RAIZ, build))) return; // sem build local: o de origem acima já cobre
    expect(scriptsDo(ler(build)).filter((s) => !s.externo && !s.comNonce)).toEqual([]);
  });

  it("nenhum plugin do vite.config mexe no index.html do build — nem com REPL_ID (o build do deploy roda no Replit)", async () => {
    const antes = { REPL_ID: process.env.REPL_ID, NODE_ENV: process.env.NODE_ENV };
    process.env.REPL_ID = "build-do-deploy";
    process.env.NODE_ENV = "development";
    try {
      // O Vite resolve a config como no `vite build`: filtra os plugins por
      // `apply` e roda o configResolved de cada um. Depois, o gancho de HTML
      // de cada plugin que sobrou, como o build chamaria.
      const { resolveConfig } = await import("vite");
      const config = await resolveConfig({ configFile: path.join(RAIZ, "vite.config.ts"), logLevel: "silent" }, "build", "production");
      const nomes = config.plugins.map((p) => p.name);
      expect(nomes).toContain("vite:react-refresh");
      expect(nomes).not.toContain("@replit/vite-plugin-cartographer");
      expect(nomes).not.toContain("@replit/vite-plugin-dev-banner");
      expect(nomes).not.toContain("runtime-error-plugin");
      const inline: string[] = [];
      for (const p of config.plugins as any[]) {
        const gancho = p.transformIndexHtml;
        if (!gancho) continue;
        const fn = typeof gancho === "function" ? gancho : gancho.handler;
        const saida = await fn.call({}, "<html><head></head><body></body></html>", { path: "/index.html", filename: path.join(RAIZ, "client/index.html") });
        const tags = Array.isArray(saida) ? saida : (saida as any)?.tags ?? [];
        for (const t of tags) if (t?.tag === "script" && !t.attrs?.src) inline.push(p.name);
        if (typeof saida === "string") for (const s of scriptsDo(saida)) if (!s.externo) inline.push(p.name);
      }
      expect(inline).toEqual([]);
    } finally {
      for (const [k, v] of Object.entries(antes)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });

  it("a exportação de PDF não escreve <script> no popup (o popup herda a CSP)", () => {
    expect(ler("client/src/lib/artePdfExport.ts")).not.toMatch(/<script/i);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("limite de login entre as cópias", () => {
  /** A tabela limite_de_tentativas de mentira, com a mesma regra do UPSERT. */
  function bancoFalso() {
    const linhas = new Map<string, { contagem: number; reinicia: number }>();
    let agora = 0;
    const consultar = vi.fn(async (sql: string, params: any[]) => {
      if (sql !== SQL_CONTAR_TENTATIVA) return { rows: [] };
      const [chave, janela] = params;
      const l = linhas.get(chave);
      if (!l || l.reinicia <= agora) linhas.set(chave, { contagem: 1, reinicia: agora + janela });
      else l.contagem += 1;
      return { rows: [{ contagem: linhas.get(chave)!.contagem }] };
    });
    return { consultar, linhas, passar: (ms: number) => { agora += ms; } };
  }
  const opcoes = { nome: "login-conta", windowMs: 15 * 60_000, max: 10, message: "Muitas tentativas.", chave: (req: any) => `conta:${req.body.email}` };

  async function tentar(limitador: any, email = "alvo@x.com") {
    const res: any = { statusCode: 200 };
    res.status = (c: number) => { res.statusCode = c; return res; };
    res.json = (b: any) => { res.body = b; return res; };
    const next = vi.fn();
    await limitador({ body: { email }, ip: "1.1.1.1" }, res, next);
    return next.mock.calls.length ? 200 : res.statusCode;
  }

  it("duas cópias somam as tentativas: a 11ª é 429, venha de qual cópia vier", async () => {
    const banco = bancoFalso();
    const copiaA = createRateLimiterCompartilhado({ ...opcoes, consultar: banco.consultar });
    const copiaB = createRateLimiterCompartilhado({ ...opcoes, consultar: banco.consultar });
    for (let i = 0; i < 5; i++) expect(await tentar(copiaA)).toBe(200);
    for (let i = 0; i < 5; i++) expect(await tentar(copiaB)).toBe(200);
    expect(await tentar(copiaA)).toBe(429);
    expect(await tentar(copiaB)).toBe(429);
    // Outra conta não é afetada; a janela vencida libera.
    expect(await tentar(copiaA, "outra@x.com")).toBe(200);
    banco.passar(15 * 60_000);
    expect(await tentar(copiaB)).toBe(200);
  });

  it("a chave gravada é hash: nem e-mail nem IP vão em claro para o banco", async () => {
    const banco = bancoFalso();
    await tentar(createRateLimiterCompartilhado({ ...opcoes, consultar: banco.consultar }));
    const [chave] = banco.consultar.mock.calls[0][1];
    expect(chave).toMatch(/^[0-9a-f]{64}$/);
    expect(chave).not.toContain("alvo");
  });

  it("sem a tabela (migração não rodada): conta na memória da cópia e avisa no log uma vez", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    const consultar = vi.fn(async () => { throw Object.assign(new Error('relation "limite_de_tentativas" does not exist'), { code: "42P01" }); });
    const limitador = createRateLimiterCompartilhado({ ...opcoes, consultar });
    const resultados: number[] = [];
    for (let i = 0; i < 11; i++) resultados.push(await tentar(limitador));
    expect(resultados.slice(0, 10).every((s) => s === 200)).toBe(true);
    expect(resultados[10]).toBe(429);
    expect(aviso).toHaveBeenCalledTimes(1);
    expect(String(aviso.mock.calls[0][0])).toContain("limite_de_tentativas");
    aviso.mockRestore();
  });

  it("sem e-mail no corpo, o limite por conta não conta nada", async () => {
    const banco = bancoFalso();
    const limitador = createRateLimiterCompartilhado({ ...opcoes, consultar: banco.consultar, chave: () => null });
    expect(await tentar(limitador)).toBe(200);
    expect(banco.consultar).not.toHaveBeenCalled();
  });
});
