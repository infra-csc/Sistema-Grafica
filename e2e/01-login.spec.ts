// FLUXO 1 — ENTRAR. É o degrau que todos os outros pisam; quando ele quebra,
// os quatro seguintes quebram junto e o relatório aponta para o lugar errado.
// Por isso ele é o primeiro arquivo e afirma pouco: entra, a casca aparece, o
// perfil certo chega na tela e a saída de verdade fecha a sessão.
import { test, expect } from "@playwright/test";
import { entrar, exigirAlvoDeTeste, emailDoPerfil, senhaDoTeste, sair } from "./apoio";

test.skip(!process.env.E2E_BASE_URL, "E2E_BASE_URL não definida — veja e2e/README.md");
test.beforeAll(() => exigirAlvoDeTeste());

test("entra com e-mail e senha e chega no app", async ({ page }) => {
  await entrar(page, "solicitacao");
  const eu = await (await page.request.get("/api/auth/me")).json();
  expect(eu.role).toBe("solicitacao");
  // O hash da senha nunca viaja para o navegador.
  expect(eu.passwordHash).toBeUndefined();
});

test("senha errada não entra, e a tela diz por quê sem revelar se a conta existe", async ({ page }) => {
  await page.goto("/login");
  const alternar = page.getByTestId("button-toggle-admin-login");
  if (await alternar.isVisible().catch(() => false)) await alternar.click();

  await page.getByTestId("input-email").fill(emailDoPerfil("solicitacao"));
  await page.getByTestId("input-password").fill("senha-que-nao-e-a-certa");
  await page.getByTestId("button-login").click();

  await expect(page.getByTestId("login-error-inline")).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
  expect((await page.request.get("/api/auth/me")).status()).toBe(401);
});

test("e-mail de conta inexistente responde igual a senha errada", async ({ page }) => {
  // O teste de unidade já garante o tempo constante; aqui o que se afirma é
  // que a TELA também não denuncia quem tem conta.
  await page.goto("/login");
  const alternar = page.getByTestId("button-toggle-admin-login");
  if (await alternar.isVisible().catch(() => false)) await alternar.click();

  await page.getByTestId("input-email").fill("ninguem.existe@exemplo-e2e.com");
  await page.getByTestId("input-password").fill("qualquer-coisa");
  await page.getByTestId("button-login").click();

  await expect(page.getByTestId("login-error-inline")).toBeVisible();
  await expect(page.getByTestId("login-error-inline")).toContainText(/inválid/i);
});

test("cada perfil entra e o servidor responde com o perfil dele", async ({ page }) => {
  for (const perfil of ["solicitacao", "arte", "grafica", "atendimento"] as const) {
    await entrar(page, perfil);
    expect((await (await page.request.get("/api/auth/me")).json()).role, perfil).toBe(perfil);
    await sair(page);
  }
});

test("sair encerra a sessão de verdade — o cookie velho não serve mais", async ({ page }) => {
  await entrar(page, "solicitacao");
  await sair(page);
  expect((await page.request.get("/api/auth/me")).status()).toBe(401);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
});

test("rota interna sem sessão manda para o login", async ({ page }) => {
  await page.context().clearCookies();
  await page.goto("/grafica");
  await expect(page).toHaveURL(/\/login/);
});

test("a senha do formulário nunca vai parar na URL", async ({ page }) => {
  await entrar(page, "solicitacao");
  expect(page.url()).not.toContain(senhaDoTeste());
});
