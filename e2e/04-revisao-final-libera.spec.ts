// ─────────────────────────────────────────────────────────────────────────────
// FLUXO 4 — A REVISÃO FINAL LIBERA (ou devolve).
//
// É o último portão antes da lona: daqui em diante existe material físico e
// custo. As três coisas que este fluxo protege:
//   · liberar é da Solicitação (e do admin) — a Arte não libera o próprio
//     trabalho;
//   · não se libera sem arquivo final. Sem ele a Gráfica imprime o quê?
//   · devolver EXIGE motivo, e o motivo chega inteiro do outro lado — a régua
//     dos 10 caracteres existe porque "não" não diz o que refazer.
// ─────────────────────────────────────────────────────────────────────────────
import { test, expect } from "@playwright/test";
import { entrar, exigirAlvoDeTeste, esperarStatus, lerPeca } from "./apoio";
import { atéAArte, atéARevisao, criarEvento, criarPeca, limpar, type Evento, type Peca } from "./cenario";

test.skip(!process.env.E2E_BASE_URL, "E2E_BASE_URL não definida — veja e2e/README.md");
test.beforeAll(() => exigirAlvoDeTeste());

test.describe.configure({ mode: "serial" });

let evento: Evento;
let peca: Peca;

test.beforeEach(async ({ page }) => {
  await entrar(page, "admin");
  evento = await criarEvento(page.request, "COPA REVISAO");
  peca = await criarPeca(page.request, evento);
});

test.afterEach(async ({ page }) => {
  await limpar(page, evento);
});

test("a peça com arquivo final aparece na Revisão e é liberada para a Gráfica", async ({ page }) => {
  await atéARevisao(page.request, evento, peca);
  await esperarStatus(page, peca, ["awaiting_final_review", "awaiting_review", "in_review"]);

  await entrar(page, "solicitacao");
  await page.goto("/solicitacao");
  await expect(page.getByText(peca.displayId).first()).toBeVisible({ timeout: 20_000 });

  const r = await page.request.patch(`/api/items/${peca.id}/creator-review`, { data: { approved: true } });
  expect(r.ok(), await r.text()).toBe(true);

  await esperarStatus(page, peca, ["ready_for_production", "approved"]);
  // Liberar não mexe no material: o arquivo que a Gráfica vai imprimir fica.
  expect((await lerPeca(page, peca)).finalFileUrl).toBeTruthy();
});

test("sem arquivo final não se libera — a Gráfica não imprime o vazio", async ({ page }) => {
  await entrar(page, "admin");
  await atéAArte(page.request, evento, peca);
  // Para na finalização: thumb enviado, arquivo final não.
  const thumb = await page.request.put("/api/objects/upload-direct", {
    headers: { "content-type": "image/png" },
    data: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"),
  });
  const { url } = await thumb.json();
  await page.request.patch(`/api/items/${peca.id}/submit-for-approval`, { data: { approvalThumbUrl: url } });

  await entrar(page, "solicitacao");
  const r = await page.request.patch(`/api/items/${peca.id}/creator-review`, { data: { approved: true } });
  expect([400, 409]).toContain(r.status());
  await esperarStatus(page, peca, ["awaiting_creator_review", "sponsor_approved", "awaiting_finalization"]);
});

test("devolver para a Arte exige motivo — e o motivo chega inteiro do outro lado", async ({ page }) => {
  await atéARevisao(page.request, evento, peca);
  await entrar(page, "solicitacao");

  // Curto demais: a régua dos 10 caracteres recusa antes de gravar nada.
  const curto = await page.request.patch(`/api/items/${peca.id}/return-to-arte`, { data: { notes: "refaz" } });
  expect(curto.status()).toBe(400);
  await esperarStatus(page, peca, ["awaiting_final_review", "awaiting_review", "in_review"]);

  // O motivo com espaços seguidos é normalizado, NÃO mastigado: já houve um
  // `s+` sem a barra que comia a letra "s" de todo motivo digitado.
  const MOTIVO = "A logo   do  patrocinador está esticada";
  const ok = await page.request.patch(`/api/items/${peca.id}/return-to-arte`, { data: { notes: MOTIVO } });
  expect(ok.ok(), await ok.text()).toBe(true);

  const devolvida = await lerPeca(page, peca);
  expect(devolvida.rejectionReason).toBe("A logo do patrocinador está esticada");
  expect(devolvida.rejectedByCreator).toBe(true);
  // O arquivo final some (é ele que precisa ser refeito); o thumb aprovado fica.
  expect(devolvida.finalFileUrl).toBeNull();
  expect(devolvida.approvalThumbUrl).toBeTruthy();

  // E a Arte vê a peça de volta, com o motivo na tela. A devolvida não fica na
  // aba que abre primeiro ("Aguardando envio"): o link `?item=` (o mesmo do
  // sino) abre a ficha já na fase em que a peça está — nas três larguras.
  await entrar(page, "arte");
  await page.goto(`/arte?item=${peca.id}`);
  await expect(page.getByText(peca.displayId).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("A logo do patrocinador está esticada").first()).toBeVisible();
});

test("Gráfica e Atendimento não liberam nem devolvem na Revisão Final", async ({ page }) => {
  await atéARevisao(page.request, evento, peca);
  for (const perfil of ["grafica", "atendimento"] as const) {
    await entrar(page, perfil);
    const liberar = await page.request.patch(`/api/items/${peca.id}/creator-review`, { data: { approved: true } });
    expect(liberar.status(), perfil).toBe(403);
    const devolver = await page.request.patch(`/api/items/${peca.id}/return-to-arte`, {
      data: { notes: "motivo suficientemente longo" },
    });
    expect(devolver.status(), perfil).toBe(403);
  }
  await esperarStatus(page, peca, ["awaiting_final_review", "awaiting_review", "in_review"]);
});

test("clicar Liberar duas vezes não quebra nada (lista velha, clique duplo)", async ({ page }) => {
  await atéARevisao(page.request, evento, peca);
  await entrar(page, "solicitacao");
  const a = await page.request.patch(`/api/items/${peca.id}/creator-review`, { data: { approved: true } });
  const b = await page.request.patch(`/api/items/${peca.id}/creator-review`, { data: { approved: true } });
  expect(a.ok()).toBe(true);
  expect(b.ok()).toBe(true);
  await esperarStatus(page, peca, ["ready_for_production", "approved"]);
});
