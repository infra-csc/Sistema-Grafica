// ─────────────────────────────────────────────────────────────────────────────
// FLUXO 3 — A ARTE SOBE O THUMB E DEPOIS O ARQUIVO FINAL.
//
// São dois materiais diferentes com dois destinos diferentes, e confundi-los
// já custou caro nesta base: o THUMB é o que o patrocinador olha para aprovar;
// o ARQUIVO FINAL é o que a impressora recebe. Sete peças do "Bota pra Correr
// SP" foram impressas e entregues sem arquivo final no sistema porque um
// atalho levava a peça direto para a fila da Gráfica.
//
// O que este fluxo protege:
//   · o thumb tira a peça da mesa da Arte;
//   · o arquivo final é o que a leva para a Revisão — e ele é EXIGIDO;
//   · os dois passam pela validação de upload (o servidor olha os BYTES).
// ─────────────────────────────────────────────────────────────────────────────
import { test, expect } from "@playwright/test";
import { comoGravado, entrar, exigirAlvoDeTeste, esperarStatus, lerPeca, PDF_MINIMO, PNG_MINIMO, subirArquivo } from "./apoio";
import { atéAArte, criarEvento, criarPeca, limpar, type Evento, type Peca } from "./cenario";
// A régua vem do shared, não de um número copiado: se o dono abrir a Revisão
// Final para a Arte, é lá que a decisão muda — e este teste acompanha sozinho.
import { ARTE_DECIDE_NA_REVISAO } from "../shared/troca-de-material";

test.skip(!process.env.E2E_BASE_URL, "E2E_BASE_URL não definida — veja e2e/README.md");
test.beforeAll(() => exigirAlvoDeTeste());

test.describe.configure({ mode: "serial" });

let evento: Evento;
let peca: Peca;

test.beforeEach(async ({ page }) => {
  await entrar(page, "admin");
  evento = await criarEvento(page.request, "COPA ARTE");
  peca = await criarPeca(page.request, evento);
  await atéAArte(page.request, evento, peca);
  await esperarStatus(page, peca, "awaiting_submission");
});

test.afterEach(async ({ page }) => {
  await limpar(page, evento);
});

test("a peça aparece na fila da Arte com o código dela", async ({ page }) => {
  await entrar(page, "arte");
  await page.goto("/arte");
  await expect(page.getByText(peca.displayId).first()).toBeVisible({ timeout: 20_000 });
});

test("com o thumb, a peça sai da mesa da Arte e vai para a finalização", async ({ page }) => {
  await entrar(page, "arte");
  const thumb = await subirArquivo(page, PNG_MINIMO, "image/png");
  const r = await page.request.patch(`/api/items/${peca.id}/submit-for-approval`, {
    data: { approvalThumbUrl: thumb },
  });
  expect(r.ok(), await r.text()).toBe(true);

  // A peça nasceu "sem aprovação": pula o Atendimento e cai na finalização.
  await esperarStatus(page, peca, ["awaiting_creator_review", "sponsor_approved", "awaiting_finalization"]);
  expect((await lerPeca(page, peca)).approvalThumbUrl).toBe(comoGravado(thumb));

  // Na finalização ela sai da aba que abre primeiro; o link `?item=` (o do
  // sino) abre a ficha na fase em que ela está.
  await page.goto(`/arte?item=${peca.id}`);
  await expect(page.getByText(peca.displayId).first()).toBeVisible({ timeout: 30_000 });
});

test("sem thumb, o envio é recusado — não há o que o patrocinador olhe", async ({ page }) => {
  await entrar(page, "arte");
  const r = await page.request.patch(`/api/items/${peca.id}/submit-for-approval`, { data: {} });
  expect(r.status()).toBe(400);
  await esperarStatus(page, peca, "awaiting_submission");
});

test("o arquivo final leva a peça para a Revisão Final", async ({ page }) => {
  await entrar(page, "arte");
  const thumb = await subirArquivo(page, PNG_MINIMO, "image/png");
  await page.request.patch(`/api/items/${peca.id}/submit-for-approval`, { data: { approvalThumbUrl: thumb } });

  const final = await subirArquivo(page, PDF_MINIMO, "application/pdf");
  const r = await page.request.patch(`/api/items/${peca.id}/submit-final-file`, {
    data: { finalFileUrl: final, finalFileName: "portico-final.pdf" },
  });
  expect(r.ok(), await r.text()).toBe(true);

  await esperarStatus(page, peca, ["awaiting_final_review", "awaiting_review", "in_review"]);
  const gravada = await lerPeca(page, peca);
  expect(comoGravado(gravada.finalFileUrl)).toBe(comoGravado(final));
  // O thumb aprovado NÃO é apagado pelo arquivo final: são dois materiais.
  expect(gravada.approvalThumbUrl).toBe(comoGravado(thumb));
});

test("o upload recusa o que não é imagem nem PDF, mesmo com o tipo mentido", async ({ page }) => {
  await entrar(page, "arte");
  // Um SVG com script abriria na MESMA origem do app: é XSS, não arte.
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>');
  const comoSvg = await page.request.put("/api/objects/upload-direct", {
    headers: { "content-type": "image/svg+xml" },
    data: svg,
  });
  expect(comoSvg.status()).toBe(400);

  // Mentir no Content-Type não ajuda: quem decide são os bytes.
  const comoPng = await page.request.put("/api/objects/upload-direct", {
    headers: { "content-type": "image/png" },
    data: Buffer.from("<html><script>alert(1)</script></html>"),
  });
  expect(comoPng.status()).toBe(400);
});

test("a Arte não libera o próprio trabalho na Revisão Final", async ({ page }) => {
  // Decisão do dono: quem revisa é a Solicitação. O teste existe para que uma
  // mudança de permissão seja uma decisão, não um descuido.
  await entrar(page, "arte");
  const thumb = await subirArquivo(page, PNG_MINIMO, "image/png");
  await page.request.patch(`/api/items/${peca.id}/submit-for-approval`, { data: { approvalThumbUrl: thumb } });
  const final = await subirArquivo(page, PDF_MINIMO, "application/pdf");
  await page.request.patch(`/api/items/${peca.id}/submit-final-file`, { data: { finalFileUrl: final } });
  await esperarStatus(page, peca, ["awaiting_final_review", "awaiting_review", "in_review"]);

  const r = await page.request.patch(`/api/items/${peca.id}/creator-review`, { data: { approved: true } });
  expect(r.status()).toBe(ARTE_DECIDE_NA_REVISAO ? 200 : 403);
});
