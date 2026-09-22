// ─────────────────────────────────────────────────────────────────────────────
// O APOIO DOS FLUXOS DE PONTA A PONTA.
//
// Duas responsabilidades, e nenhuma delas é "testar":
//   1. NÃO DEIXAR A SUÍTE RODAR NO LUGAR ERRADO. Estes testes criam evento,
//      cancelam peça e marcam impressão. Contra o banco de produção isso é
//      estrago, não teste. Por isso: sem E2E_BASE_URL, tudo é pulado; e
//      `exigirAlvoDeTeste` recusa qualquer URL que cheire a produção.
//   2. Falar a língua do app: entrar como um perfil, achar a peça pelo código
//      (#0500) e esperar o status mudar — as três coisas que todo fluxo faz.
//
// As credenciais vêm do ambiente (E2E_SENHA e os e-mails por perfil). Nenhuma
// senha mora aqui.
// ─────────────────────────────────────────────────────────────────────────────
import { expect, type Page, type Locator } from "@playwright/test";

export const BASE_URL = process.env.E2E_BASE_URL ?? "";

/** Hospedeiros em que estes testes NUNCA podem rodar. */
const PROIBIDOS = [/print-flow-manager[^.]*\.replit\.app$/i, /\.nortemkt\.com$/i];

/**
 * O alvo é de teste? Chamado uma vez por arquivo, antes de qualquer clique.
 * Falhar aqui é o comportamento desejado: melhor a suíte vermelha do que uma
 * peça cancelada num evento de verdade.
 */
export function exigirAlvoDeTeste(): void {
  if (!BASE_URL) throw new Error("E2E_BASE_URL não definida — veja e2e/README.md");
  const host = new URL(BASE_URL).host;
  for (const p of PROIBIDOS) {
    if (p.test(host)) {
      throw new Error(
        `E2E_BASE_URL aponta para ${host}, que parece ser PRODUÇÃO. ` +
        `Estes testes criam e cancelam peça — use o Replit de dev ou um Postgres local (e2e/README.md).`,
      );
    }
  }
}

export type Perfil = "admin" | "solicitacao" | "arte" | "grafica" | "atendimento";

/** O e-mail de cada perfil no banco de teste. Sem padrão: ou está definido, ou o teste para. */
export function emailDoPerfil(perfil: Perfil): string {
  const chave = `E2E_EMAIL_${perfil.toUpperCase()}`;
  const email = process.env[chave];
  if (!email) throw new Error(`${chave} não definida — veja e2e/README.md`);
  return email;
}

export function senhaDoTeste(): string {
  const senha = process.env.E2E_SENHA;
  if (!senha) throw new Error("E2E_SENHA não definida — veja e2e/README.md");
  return senha;
}

/**
 * Entra no app com um perfil e espera a casca aparecer.
 *
 * O login por senha é o caminho do formulário de admin: a tela abre no botão
 * do portal (SSO), e `button-toggle-admin-login` revela os campos. O SSO não
 * é exercitável daqui — depende do portal NORTE.
 */
export async function entrar(page: Page, perfil: Perfil): Promise<void> {
  await page.goto("/login");
  const alternar = page.getByTestId("button-toggle-admin-login");
  if (await alternar.isVisible().catch(() => false)) await alternar.click();

  await page.getByTestId("input-email").fill(emailDoPerfil(perfil));
  await page.getByTestId("input-password").fill(senhaDoTeste());
  await page.getByTestId("button-login").click();

  // A troca de senha no primeiro acesso é um desvio legítimo — e um sinal de
  // que o usuário de teste foi recriado. Falhar aqui é melhor que seguir.
  await expect(page).not.toHaveURL(/\/change-password/, { timeout: 15_000 });
  await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });
}

export async function sair(page: Page): Promise<void> {
  // Sem depender do menu (que muda de forma entre celular e desktop).
  await page.request.post("/api/auth/logout");
  await page.context().clearCookies();
}

/** A linha (ou o cartão) de uma peça pelo código #0000 — serve nas três larguras. */
export function linhaDaPeca(page: Page, displayId: string): Locator {
  return page.locator(`[data-testid*="item"]`).filter({ hasText: displayId }).first();
}

/**
 * Espera a peça chegar num status, perguntando à API em vez de ao DOM.
 *
 * O DOM é o que se quer testar, mas a fila de outra equipe pode estar atrás de
 * filtro, paginação ou aba. Nos pontos de COSTURA entre dois fluxos (a peça
 * que a Arte enviou precisa aparecer na Revisão), perguntar à API é o passo
 * honesto: o que se afirma ali é "o servidor mudou o estado", e a tela daquele
 * perfil é afirmada no fluxo dele.
 */
export async function esperarStatus(
  page: Page,
  peca: { eventId: string; id: string },
  status: string | string[],
): Promise<void> {
  const aceitos = Array.isArray(status) ? status : [status];
  await expect(async () => {
    // Não existe GET /api/items/:id — a listagem é por evento.
    const r = await page.request.get(`/api/items/${peca.eventId}`);
    expect(r.ok()).toBe(true);
    const lista = (await r.json()) as { id: string; status: string }[];
    const atual = lista.find((i) => i.id === peca.id);
    expect(atual, `peça ${peca.id} sumiu da listagem do evento`).toBeTruthy();
    expect(aceitos).toContain(atual!.status);
  }).toPass({ timeout: 20_000 });
}

/** O estado da peça agora, direto da listagem do evento. */
export async function lerPeca(page: Page, peca: { eventId: string; id: string }): Promise<Record<string, any>> {
  const r = await page.request.get(`/api/items/${peca.eventId}`);
  expect(r.ok()).toBe(true);
  const atual = ((await r.json()) as Record<string, any>[]).find((i) => i.id === peca.id);
  expect(atual, `peça ${peca.id} sumiu da listagem do evento`).toBeTruthy();
  return atual!;
}

/** Um nome com carimbo de hora — para achar o que este teste criou, e só isso. */
export function nomeDoTeste(prefixo: string): string {
  const agora = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  return `${prefixo} E2E ${agora}`;
}

/**
 * Um arquivo pequeno e válido para os campos de upload. O servidor decide o
 * tipo pelos BYTES (server/upload-seguro.ts), então não adianta um .txt
 * renomeado: tem de ser PNG ou PDF de verdade.
 */
export const PNG_MINIMO = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
export const PDF_MINIMO = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 0/Kids[]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
  "latin1",
);

/** Sobe um arquivo pelo proxy de mesma origem e devolve a URL gravada. */
export async function subirArquivo(page: Page, conteudo: Buffer, contentType: string): Promise<string> {
  const r = await page.request.put("/api/objects/upload-direct", {
    headers: { "content-type": contentType },
    data: conteudo,
  });
  expect(r.ok(), await r.text()).toBe(true);
  return (await r.json()).url as string;
}
