// ─────────────────────────────────────────────────────────────────────────────
// PLAYWRIGHT — os testes de ponta a ponta do NORTE.
//
// ESTE ARQUIVO NÃO SOBE BANCO NEM SERVIDOR — quem sobe é `npm run e2e`
// (scripts/e2e.mjs): banco em memória, storage de mentira e o app, na máquina.
// Os fluxos de e2e/ mexem em peça, evento e impressão de verdade: rodá-los
// contra o banco de produção cancelaria peça real. Por isso o alvo é SEMPRE
// explícito — a variável E2E_BASE_URL, que o scripts/e2e.mjs define para o app
// local — e, sem ela, a suíte inteira é pulada em vez de escolher um alvo por
// conta própria. Ver e2e/README.md.
//
// TRÊS LARGURAS, porque a Gráfica trabalha no celular (o galpão não tem mesa):
//   · 390  — iPhone de pé, a largura em que a fila da Gráfica é usada;
//   · 820  — tablet, a Revisão Final na bancada;
//   · 1280 — desktop, a Solicitação e o Atendimento.
// O mesmo fluxo roda nas três: o que quebra no celular é a barra de ações que
// some atrás do teclado, e isso só aparece na largura certa.
//
// O Playwright NÃO está nas dependências do projeto de propósito (ele baixa
// navegadores de ~300 MB): mora na pasta de ferramentas, fora do repositório
// (`npm run ferramentas:instalar`; ver scripts/local/ferramentas.mjs).
// ─────────────────────────────────────────────────────────────────────────────
import { defineConfig, devices } from "@playwright/test";

const BASE_URL = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: "./e2e",
  // Cada fluxo é uma história em ordem (cria → envia → aprova): dentro do
  // arquivo os passos dependem um do outro.
  fullyParallel: false,
  // UM worker: os fluxos disputam as mesmas impressoras (a regra "uma peça por
  // impressora" recusa a segunda com 409) e o banco local (PGlite) é uma sessão
  // só — em paralelo, um teste derrubaria o outro sem defeito nenhum no app.
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: BASE_URL,
    // O alvo de dev do Replit é HTTPS com certificado válido; um Postgres
    // local sobe em HTTP. Os dois funcionam.
    ignoreHTTPSErrors: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 15_000,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
  },
  projects: [
    {
      name: "celular-390",
      use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, isMobile: false, hasTouch: true },
    },
    {
      name: "tablet-820",
      use: { ...devices["Desktop Chrome"], viewport: { width: 820, height: 1180 }, hasTouch: true },
    },
    {
      name: "desktop-1280",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } },
    },
  ],
});
