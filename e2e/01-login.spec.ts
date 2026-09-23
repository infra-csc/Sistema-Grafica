// FLUXO 1 — ENTRAR. É o degrau que todos os outros pisam; quando ele quebra,
// os quatro seguintes quebram junto e o relatório aponta para o lugar errado.
// Por isso ele é o primeiro arquivo e afirma pouco: entra, a casca aparece, o
// perfil certo chega na tela e a saída de verdade fecha a sessão.
//
// Este é o ÚNICO fluxo que entra pelo formulário em todo teste (os outros
// reaproveitam a sessão — ver `entrar` em apoio.ts). Cada largura usa o perfil
// que trabalha naquele aparelho (`perfilDaLargura`): a Gráfica no celular, a
// Arte no tablet, a Solicitação no desktop. Assim o formulário é exercitado nas
// três larguras sem estourar o limite de 10 logins por conta em 15 min.
import { test, expect } from "@playwright/test";
import {
  abrirLogin, emailDoPerfil, entrarPeloFormulario, exigirAlvoDeTeste, perfilDaLargura, sair, senhaDoTeste,
} from "./apoio";

test.skip(!process.env.E2E_BASE_URL, "E2E_BASE_URL não definida — veja e2e/README.md");
test.beforeAll(() => exigirAlvoDeTeste());

test("entra com e-mail e senha e chega no app", async ({ page }, info) => {
  const perfil = perfilDaLargura(info.project.name);
  await entrarPeloFormulario(page, perfil);
  const eu = await (await page.request.get("/api/auth/me")).json();
  expect(eu.role).toBe(perfil);
  // O hash da senha nunca viaja para o navegador.
  expect(eu.passwordHash).toBeUndefined();
});

// O login recusado responde 401; a tela tem de dizer "credencial inválida", não
// "sessão expirou" (defeito achado por este fluxo em 23/09 e corrigido em
// client/src/lib/queryClient.ts: 401 de rota de credencial não é sessão vencida).
test("senha errada não entra, e a tela diz por quê sem revelar se a conta existe", async ({ page }, info) => {
  await abrirLogin(page);
  await page.getByTestId("input-email").fill(emailDoPerfil(perfilDaLargura(info.project.name)));
  await page.getByTestId("input-password").fill("senha-que-nao-e-a-certa");
  await page.getByTestId("button-login").click();

  await expect(page.getByTestId("login-error-inline")).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
  expect((await page.request.get("/api/auth/me")).status()).toBe(401);
  // "Por quê" = credencial inválida. "Sessão expirou" manda a pessoa procurar
  // o problema no lugar errado.
  await expect(page.getByTestId("login-error-inline")).toContainText(/inválid/i);
});

test("e-mail de conta inexistente responde igual a senha errada", async ({ page }) => {
  // O teste de unidade já garante o tempo constante; aqui o que se afirma é
  // que a TELA também não denuncia quem tem conta.
  await abrirLogin(page);
  await page.getByTestId("input-email").fill("ninguem.existe@exemplo-e2e.com");
  await page.getByTestId("input-password").fill("qualquer-coisa");
  await page.getByTestId("button-login").click();

  await expect(page.getByTestId("login-error-inline")).toBeVisible();
  await expect(page.getByTestId("login-error-inline")).toContainText(/inválid/i);
});

test("cada perfil entra e o servidor responde com o perfil dele", async ({ page }, info) => {
  // Uma largura basta: é o servidor que responde o perfil, e as outras duas
  // larguras já entram pelo formulário nos testes acima.
  test.skip(info.project.name !== "desktop-1280", "o formulário nas outras larguras já é coberto acima");
  for (const perfil of ["solicitacao", "arte", "grafica", "atendimento"] as const) {
    await entrarPeloFormulario(page, perfil);
    expect((await (await page.request.get("/api/auth/me")).json()).role, perfil).toBe(perfil);
    await sair(page);
  }
});

test("sair encerra a sessão de verdade — o cookie velho não serve mais", async ({ page }, info) => {
  await entrarPeloFormulario(page, perfilDaLargura(info.project.name));
  const cookiesDaSessao = await page.context().cookies();
  await sair(page);
  expect((await page.request.get("/api/auth/me")).status()).toBe(401);

  // O cookie guardado ANTES de sair não ressuscita a sessão.
  await page.context().addCookies(cookiesDaSessao);
  expect((await page.request.get("/api/auth/me")).status()).toBe(401);
  await page.context().clearCookies();

  await page.goto("/");
  await expect(page).toHaveURL(/\/login/, { timeout: 30_000 });
});

test("rota interna sem sessão manda para o login", async ({ page }) => {
  await page.context().clearCookies();
  await page.goto("/grafica");
  await expect(page).toHaveURL(/\/login/, { timeout: 30_000 });
});

test("a senha do formulário nunca vai parar na URL", async ({ page }, info) => {
  await entrarPeloFormulario(page, perfilDaLargura(info.project.name));
  expect(page.url()).not.toContain(senhaDoTeste());
});
