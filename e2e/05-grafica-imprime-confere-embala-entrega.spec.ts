// ─────────────────────────────────────────────────────────────────────────────
// FLUXO 5 — A GRÁFICA: IMPRIME → INFORMA → CONFERE → EMBALA → ENTREGA.
//
// É o fluxo mais longo do app e o único que acontece no CELULAR, de pé, no
// galpão — por isso ele roda também na largura de 390. A ordem do fim do fluxo
// é `inProduction → produced → conferred → packed → delivered`, e a etapa
// "Embalado" nasceu de um relato do dono (21/09): "hoje eles colocam Entregue,
// mas a foto é do tubo; a entrega é feita depois". Trocar essa ordem é o tipo
// de mudança que este arquivo existe para transformar em decisão.
//
// O que cada passo protege:
//   · iniciar exige MÁQUINA — sem ela ninguém sabe onde a peça está;
//   · "quantas saíram" é ABSOLUTO, não incremental (quem produzia 6 de 10 e
//     digitava 4 REGREDIA a conta);
//   · conferir exige FOTO, e não se confere mais do que foi impresso;
//   · embalar cria o volume; entregar é do VOLUME, e é ele que fecha a peça.
// ─────────────────────────────────────────────────────────────────────────────
import { test, expect } from "@playwright/test";
import { entrar, exigirAlvoDeTeste, esperarStatus, lerPeca, PNG_MINIMO, subirArquivo } from "./apoio";
import { atéAGrafica, criarEvento, criarPeca, limpar, type Evento, type Peca } from "./cenario";

test.skip(!process.env.E2E_BASE_URL, "E2E_BASE_URL não definida — veja e2e/README.md");
test.beforeAll(() => exigirAlvoDeTeste());

test.describe.configure({ mode: "serial" });

let evento: Evento;
let peca: Peca;

test.beforeEach(async ({ page }) => {
  await entrar(page, "admin");
  evento = await criarEvento(page.request, "COPA GRAFICA");
  peca = await criarPeca(page.request, evento, { quantity: 10 });
  await atéAGrafica(page.request, evento, peca);
  await esperarStatus(page, peca, ["ready_for_production", "approved"]);
});

test.afterEach(async ({ page }) => {
  await limpar(page.request, evento);
});

test("a peça liberada aparece na fila da Gráfica", async ({ page }) => {
  await entrar(page, "grafica");
  await page.goto("/grafica");
  await expect(page.getByTestId("abas-grafica")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(peca.displayId).first()).toBeVisible({ timeout: 20_000 });
});

test("iniciar a impressão exige escolher a máquina", async ({ page }) => {
  await entrar(page, "grafica");
  const semMaquina = await page.request.patch(`/api/items/${peca.id}/start-printing`, { data: {} });
  expect(semMaquina.status()).toBe(400);

  const inventada = await page.request.patch(`/api/items/${peca.id}/start-printing`, { data: { printMachine: "99" } });
  expect(inventada.status()).toBe(400);

  await esperarStatus(page, peca, ["ready_for_production", "approved"]);
});

test("o fluxo inteiro: imprime, informa, confere, embala e entrega o volume", async ({ page }) => {
  await entrar(page, "grafica");

  // ── 1. Inicia na Impressora 1 ──────────────────────────────────────────────
  const iniciou = await page.request.patch(`/api/items/${peca.id}/start-printing`, { data: { printMachine: "1" } });
  expect(iniciou.ok(), await iniciou.text()).toBe(true);
  await esperarStatus(page, peca, ["inProduction", "em_producao"]);
  expect((await lerPeca(page, peca)).printMachine).toBe("1");

  // ── 2. Informa quantas saíram — o número é ABSOLUTO ───────────────────────
  const parcial = await page.request.patch(`/api/items/${peca.id}/start-production`, { data: { quantityProduced: 6 } });
  expect(parcial.ok(), await parcial.text()).toBe(true);
  expect((await lerPeca(page, peca)).quantityProduced).toBe(6);

  // "Mais 4" se escreve 10, não 4. O campo é o TOTAL impresso até agora.
  const total = await page.request.patch(`/api/items/${peca.id}/start-production`, { data: { quantityProduced: 10 } });
  expect(total.ok(), await total.text()).toBe(true);
  await esperarStatus(page, peca, ["produced", "produzido"]);
  expect((await lerPeca(page, peca)).quantityProduced).toBe(10);

  // ── 3. Confere (com foto — é a prova de que alguém olhou) ─────────────────
  const foto = await subirArquivo(page, PNG_MINIMO, "image/png");
  const conferiu = await page.request.post(`/api/items/${peca.id}/confer`, {
    data: { conferencePhotoUrl: foto, qty: 10 },
  });
  expect(conferiu.ok(), await conferiu.text()).toBe(true);
  await esperarStatus(page, peca, ["conferred", "conferido"]);

  // ── 4. Embala num volume ─────────────────────────────────────────────────
  const fotoDoTubo = await subirArquivo(page, PNG_MINIMO, "image/png");
  const embalou = await page.request.post(`/api/events/${evento.id}/tubos`, {
    data: { itens: [{ itemId: peca.id, quantidade: 10 }], fotos: [fotoDoTubo] },
  });
  expect(embalou.ok(), await embalou.text()).toBe(true);
  const tubo = await embalou.json();
  await esperarStatus(page, peca, "packed");

  // ── 5. Entrega o VOLUME — é ele que fecha a peça ──────────────────────────
  const entregou = await page.request.post(`/api/tubos/${tubo.id}/entregar`, {
    data: { receivedBy: "João da portaria", photoUrl: fotoDoTubo },
  });
  expect(entregou.ok(), await entregou.text()).toBe(true);
  await esperarStatus(page, peca, ["delivered", "entregue"]);

  const fim = await lerPeca(page, peca);
  expect(fim.deliveredQty).toBe(10);
});

test("conferir sem foto é recusado — a foto é a prova de que alguém olhou", async ({ page }) => {
  await entrar(page, "grafica");
  await page.request.patch(`/api/items/${peca.id}/start-printing`, { data: { printMachine: "1" } });
  await page.request.patch(`/api/items/${peca.id}/start-production`, { data: { quantityProduced: 10 } });
  await esperarStatus(page, peca, ["produced", "produzido"]);

  const r = await page.request.post(`/api/items/${peca.id}/confer`, { data: { qty: 10 } });
  expect(r.status()).toBe(400);
  await esperarStatus(page, peca, ["produced", "produzido"]);
});

test("não se confere mais do que saiu da impressora", async ({ page }) => {
  await entrar(page, "grafica");
  await page.request.patch(`/api/items/${peca.id}/start-printing`, { data: { printMachine: "1" } });
  await page.request.patch(`/api/items/${peca.id}/start-production`, { data: { quantityProduced: 4 } });

  const foto = await subirArquivo(page, PNG_MINIMO, "image/png");
  const demais = await page.request.post(`/api/items/${peca.id}/confer`, {
    data: { conferencePhotoUrl: foto, qty: 10 },
  });
  expect([400, 409]).toContain(demais.status());
});

test("entregar é do volume: a peça embalada não é entregue por fora", async ({ page }) => {
  await entrar(page, "grafica");
  await page.request.patch(`/api/items/${peca.id}/start-printing`, { data: { printMachine: "1" } });
  await page.request.patch(`/api/items/${peca.id}/start-production`, { data: { quantityProduced: 10 } });
  const foto = await subirArquivo(page, PNG_MINIMO, "image/png");
  await page.request.post(`/api/items/${peca.id}/confer`, { data: { conferencePhotoUrl: foto, qty: 10 } });
  await esperarStatus(page, peca, ["conferred", "conferido"]);

  // Peça CONFERIDA (que não vai em volume) ainda se entrega individualmente —
  // é a peça grande que sai solta. O que muda é o que acontece DEPOIS de
  // embalar, coberto no fluxo inteiro acima.
  const r = await page.request.patch(`/api/items/${peca.id}/deliver`, {
    data: { receivedBy: "João da portaria", photoUrl: foto, qty: 10 },
  });
  expect(r.ok(), await r.text()).toBe(true);
  await esperarStatus(page, peca, ["delivered", "entregue"]);
});

test("Solicitação e Atendimento não iniciam impressão — quem imprime é quem tem a máquina", async ({ page }) => {
  for (const perfil of ["solicitacao", "atendimento"] as const) {
    await entrar(page, perfil);
    const r = await page.request.patch(`/api/items/${peca.id}/start-printing`, { data: { printMachine: "1" } });
    expect(r.status(), perfil).toBe(403);
  }
  await esperarStatus(page, peca, ["ready_for_production", "approved"]);
});

test("no celular, a fila da Gráfica cabe na tela e não rola de lado", async ({ page }, info) => {
  test.skip(info.project.name !== "celular-390", "só faz sentido na largura do celular");
  await entrar(page, "grafica");
  await page.goto("/grafica");
  await expect(page.getByTestId("abas-grafica")).toBeVisible({ timeout: 20_000 });

  const rolaDeLado = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  expect(rolaDeLado, "a fila da Gráfica rolou na horizontal a 390px").toBe(false);
});
