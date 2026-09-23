// @vitest-environment jsdom
//
// NEM TODO 401 É SESSÃO VENCIDA (achado pelo E2E de login em 23/09).
//
// O cliente tratava QUALQUER 401 fora de /api/auth/me como "sessão expirou":
//   · quem errava a senha no login lia "Sua sessão expirou";
//   · quem errava a senha ATUAL na troca de senha era deslogado e mandado ao login.
// Login, troca de senha e SSO respondem 401 para CREDENCIAL errada — a mensagem
// certa é a do servidor, e a sessão (se houver) fica.
import { describe, it, expect, vi, afterEach } from "vitest";

afterEach(() => { vi.unstubAllGlobals(); });

async function chamar(url: string, corpo: object, status = 401) {
  const replace = vi.fn();
  vi.stubGlobal("location", { ...window.location, replace, href: "http://x/", pathname: "/" });
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } })));
  const { apiRequest } = await import("@/lib/queryClient");
  let erro: Error | null = null;
  try { await apiRequest("POST", url, {}); } catch (e) { erro = e as Error; }
  return { erro, replace };
}

describe("401 de credencial não é sessão vencida", () => {
  it("login com senha errada: mostra a frase do servidor e não redireciona", async () => {
    const { erro, replace } = await chamar("/api/auth/login", { error: "Email ou senha inválidos" });
    expect(erro?.message).toContain("Email ou senha inválidos");
    expect(erro?.message).not.toMatch(/sessão expirou/i);
    expect(replace).not.toHaveBeenCalled();
  });

  it("troca de senha com a senha atual errada: NÃO derruba a sessão", async () => {
    const { erro, replace } = await chamar("/api/auth/change-password", { error: "Senha atual incorreta" });
    expect(erro?.message).toContain("Senha atual incorreta");
    expect(replace).not.toHaveBeenCalled();
  });

  it("SSO com token vencido: frase do servidor, sem 'sessão expirou'", async () => {
    const { erro, replace } = await chamar("/api/auth/sso-exchange", { error: "Token expirado ou inválido" });
    expect(erro?.message).toContain("Token expirado ou inválido");
    expect(replace).not.toHaveBeenCalled();
  });

  it("401 em qualquer outra rota continua sendo sessão vencida: vai ao login", async () => {
    const { erro, replace } = await chamar("/api/items/p1/confer", { error: "Não autenticado" });
    expect(erro?.message).toMatch(/sessão expirou/i);
    expect(replace).toHaveBeenCalledWith("/login?sessao=expirada");
  });

  it("a régua das rotas de credencial ignora a querystring", async () => {
    const { ehRespostaDeCredencial } = await import("@/lib/queryClient");
    expect(ehRespostaDeCredencial("/api/auth/login?x=1")).toBe(true);
    expect(ehRespostaDeCredencial("/api/auth/logout")).toBe(false);
    expect(ehRespostaDeCredencial(undefined)).toBe(false);
  });
});
