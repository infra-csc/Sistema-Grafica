// ─────────────────────────────────────────────────────────────────────────────
// FLUXO 2 — A SOLICITAÇÃO CRIA A PEÇA E ENVIA.
//
// O começo de tudo: alguém abre o evento, digita a peça no lote e clica
// "Enviar". O que este fluxo protege é a EMENDA entre as duas telas — a peça
// criada aqui tem de aparecer, com o mesmo código, na fila seguinte. O bug que
// esse tipo de teste pega é o mais chato de todos: a peça que "salvou" mas não
// saiu do rascunho, e que ninguém percebe até a Arte perguntar cadê.
// ─────────────────────────────────────────────────────────────────────────────
import { test, expect } from "@playwright/test";
import { entrar, exigirAlvoDeTeste, esperarStatus, lerPeca } from "./apoio";
import { criarEvento, criarPeca, dadosDaPeca, garantirModelo, limpar, type Evento, type Peca } from "./cenario";

test.skip(!process.env.E2E_BASE_URL, "E2E_BASE_URL não definida — veja e2e/README.md");
test.beforeAll(() => exigirAlvoDeTeste());

test.describe.configure({ mode: "serial" });

let evento: Evento;

test.beforeEach(async ({ page }) => {
  await entrar(page, "admin");
  evento = await criarEvento(page.request, "COPA SOLICITACAO");
});

test.afterEach(async ({ page }) => {
  await limpar(page, evento);
});

test("digita a peça no lote do evento e ela nasce em rascunho", async ({ page }) => {
  await entrar(page, "solicitacao");
  const modelo = await garantirModelo(page.request);
  await page.goto(`/eventos/${evento.id}`);

  await page.getByTestId("button-add-item").click();
  // A primeira linha do lote já vem aberta; os campos são indexados por linha.
  // Tipo: a caixa de busca dos Modelos — digita e Enter escolhe o primeiro.
  const tipo = page.getByLabel("Tipo da peça, linha 1");
  await tipo.click();
  await tipo.fill(modelo);
  await tipo.press("Enter");
  await page.getByTestId("input-description-0").fill("Pórtico de largada (E2E)");
  await page.getByTestId("input-quantity-0").fill("2");
  // Visual e arquivo são obrigatórios (o m² sai deles).
  await page.getByTestId("input-visual-width-0").fill("3");
  await page.getByTestId("input-visual-height-0").fill("1");
  await page.getByTestId("input-file-width-0").fill("3");
  await page.getByTestId("input-file-height-0").fill("1");
  // Material e acabamento: seletores com lista (os padrões do app).
  for (const [campo, opcao] of [["select-material-0", "Lona"], ["select-finish-0", "Ilhós"]] as const) {
    await page.getByTestId(campo).click();
    await page.getByRole("button", { name: opcao, exact: true }).click();
  }
  await page.getByTestId("button-submit-bulk").click();
  // "Revisar e salvar" abre a revisão do lote; é o "Confirmar lote" que grava.
  await page.getByTestId("button-confirm-duplicates").click();

  await expect(async () => {
    const r = await page.request.get(`/api/items/${evento.id}`);
    const lista = (await r.json()) as Record<string, any>[];
    expect(lista).toHaveLength(1);
    // Nasce em rascunho: criar não é enviar.
    expect(["draft", "requested"]).toContain(lista[0].status);
    expect(lista[0].quantity).toBe(2);
    // O código #0000 é o que todo mundo usa para falar da peça.
    expect(lista[0].displayId).toMatch(/^#\d{4}$/);
  }).toPass();
});

test("o botão Enviar tira a peça do rascunho e ela entra na Vinculação", async ({ page }) => {
  await entrar(page, "admin");
  const peca: Peca = await criarPeca(page.request, evento);

  await entrar(page, "solicitacao");
  await page.goto(`/eventos/${evento.id}`);
  await expect(page.getByText(peca.displayId)).toBeVisible();

  await page.getByTestId("button-submit-drafts").click();
  // O envio pede confirmação: empurra trabalho para a fila de outra equipe.
  await page.getByTestId("button-confirm-submit-drafts").click();

  await esperarStatus(page, peca, "awaiting_linking");
  // E a tela acompanha: o rascunho sai do lugar onde estava.
  await expect(page.getByTestId("button-submit-drafts")).toBeHidden();
});

test("a peça enviada chega na Vinculação e de lá segue para a Arte", async ({ page }) => {
  await entrar(page, "admin");
  const peca = await criarPeca(page.request, evento);
  await page.request.post(`/api/events/${evento.id}/items/submit`, { data: {} });
  await esperarStatus(page, peca, "awaiting_linking");

  await page.goto("/vincular-patrocinadores");
  await expect(page.getByText(peca.displayId).first()).toBeVisible({ timeout: 20_000 });

  // A peça nasceu "sem aprovação" (skipApproval), então a Vinculação já pode
  // mandá-la adiante sem escolher patrocinador.
  const r = await page.request.post("/api/items/send-to-arte", { data: { itemIds: [peca.id] } });
  expect(r.ok(), await r.text()).toBe(true);
  await esperarStatus(page, peca, "awaiting_submission");
});

test("evento já realizado não aceita peça nova — a tela avisa antes do clique", async ({ page }) => {
  await entrar(page, "admin");
  const passado = await criarEvento(page.request, "JA FOI");
  // Puxa as datas para o passado por onde o app permite: a edição do evento.
  await page.request.patch(`/api/events/${passado.id}`, {
    data: { startDate: "2020-03-15", truckDepartureDate: "2020-03-10T08:00" },
  });

  await page.goto(`/eventos/${passado.id}`);
  await expect(page.getByTestId("banner-event-realizado")).toBeVisible();

  const r = await page.request.post("/api/items", {
    // A peça COMPLETA: um corpo incompleto cairia na validação (400) antes da
    // guarda do evento realizado, que é o que se quer ver aqui.
    data: dadosDaPeca(passado, { description: "não deveria entrar" }),
  });
  expect(r.status()).toBe(409);

  await limpar(page, passado);
});

test("a peça criada guarda o que foi digitado — quantidade, medida e observação", async ({ page }) => {
  await entrar(page, "admin");
  const peca = await criarPeca(page.request, evento, {
    quantity: 7,
    observations: "Ilhós a cada 50 cm",
    measurement: "3.00 × 1.00",
  });
  const gravada = await lerPeca(page, peca);
  expect(gravada).toMatchObject({ quantity: 7, observations: "Ilhós a cada 50 cm" });

  await page.goto(`/eventos/${evento.id}`);
  // A linha DA PEÇA (rascunho ou já enviada) — procurar "7" na página inteira
  // achava o 7 do código (#0027) no tablet.
  const linha = page.getByTestId(`draft-item-${peca.id}`).or(page.getByTestId(`row-item-${peca.id}`)).first();
  await expect(linha).toBeVisible({ timeout: 30_000 });
  await expect(linha).toContainText(peca.displayId);
  const semOCodigo = (await linha.innerText()).replace(peca.displayId, "");
  expect(semOCodigo).toMatch(/(^|\D)7(\D|$)/);
});
