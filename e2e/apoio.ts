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
import { createHash } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
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
 * Um IP de mentira por login. O /api/auth/login tem limite de 10 tentativas
 * por IP em 15 min, e a suíte entra dezenas de vezes da MESMA máquina. O
 * servidor confia em um proxy (`trust proxy` = 1), então no alvo LOCAL o
 * X-Forwarded-For vira o IP da requisição. Atrás do proxy do Replit o
 * cabeçalho não vale (o proxy acrescenta o IP real) — lá o limite aparece se a
 * suíte rodar duas vezes seguidas; ver e2e/README.md.
 * O limite POR CONTA (10 em 15 min) continua valendo: por isso as sessões são
 * reaproveitadas (abaixo) e o fluxo 1 distribui os perfis pelas larguras.
 */
function ipDeMentira(): string {
  const n = () => Math.floor(Math.random() * 254) + 1;
  return `10.${n()}.${n()}.${n()}`;
}

/**
 * Abre a tela de login com os campos de e-mail e senha à vista. A tela abre
 * no botão do portal (SSO); `button-toggle-admin-login` revela os campos. A
 * espera é longa porque, no servidor de desenvolvimento, a primeira visita
 * compila as telas.
 */
export async function abrirLogin(page: Page): Promise<void> {
  await page.setExtraHTTPHeaders({ "x-forwarded-for": ipDeMentira() });
  // Logo depois de sair, a própria tela ainda pode estar indo para o login
  // sozinha (o 401 manda para /login?sessao=expirada) — e o goto que cruza com
  // essa navegação volta ERR_ABORTED. Tenta de novo, que a página já parou.
  for (let tentativa = 1; ; tentativa++) {
    try {
      await page.goto("/login");
      break;
    } catch (erro) {
      if (tentativa >= 3 || !String(erro).includes("ERR_ABORTED")) throw erro;
      await page.waitForTimeout(500);
    }
  }
  const alternar = page.getByTestId("button-toggle-admin-login");
  const email = page.getByTestId("input-email");
  await expect(alternar.or(email).first()).toBeVisible({ timeout: 45_000 });
  if (!(await email.isVisible())) await alternar.click();
  await expect(email).toBeVisible();
}

/**
 * Entra PELO FORMULÁRIO — o caminho que o fluxo 1 testa. O SSO não é
 * exercitável daqui: depende do portal NORTE.
 */
export async function entrarPeloFormulario(page: Page, perfil: Perfil): Promise<void> {
  await abrirLogin(page);
  await page.getByTestId("input-email").fill(emailDoPerfil(perfil));
  await page.getByTestId("input-password").fill(senhaDoTeste());
  await page.getByTestId("button-login").click();

  // A troca de senha no primeiro acesso é um desvio legítimo — e um sinal de
  // que o usuário de teste foi recriado. Falhar aqui é melhor que seguir.
  await expect(page).not.toHaveURL(/\/login|\/change-password/, { timeout: 30_000 });
  await expect(page).not.toHaveURL(/\/change-password/);
}

// ── Sessões reaproveitadas ──────────────────────────────────────────────────
// Os fluxos 2 a 5 não testam o login: testam o que vem depois. Entrar pelo
// formulário em cada teste gastaria o limite de 10 logins por conta em 15 min
// antes da metade da suíte. Cada perfil entra UMA vez pelo formulário e o
// cookie fica num arquivo temporário (por alvo), reaproveitado pelos testes e
// pelas três larguras. Se o cookie não servir mais (servidor novo, sessão
// encerrada), entra de novo pelo formulário.
const PASTA_DAS_SESSOES = join(
  tmpdir(),
  "norte-e2e-sessoes",
  createHash("sha1").update(BASE_URL).digest("hex").slice(0, 12),
);
const comSessaoCompartilhada = new WeakSet<Page>();

/** Entra com um perfil (sessão reaproveitada; o formulário só na primeira vez). */
export async function entrar(page: Page, perfil: Perfil): Promise<void> {
  const arquivo = join(PASTA_DAS_SESSOES, `${perfil}.json`);
  if (existsSync(arquivo)) {
    await page.context().clearCookies();
    await page.context().addCookies(JSON.parse(readFileSync(arquivo, "utf8")));
    const eu = await page.request.get("/api/auth/me");
    if (eu.ok() && (await eu.json()).role === perfil) {
      comSessaoCompartilhada.add(page);
      return;
    }
  }
  await page.context().clearCookies();
  await entrarPeloFormulario(page, perfil);
  mkdirSync(PASTA_DAS_SESSOES, { recursive: true });
  writeFileSync(arquivo, JSON.stringify(await page.context().cookies()));
  comSessaoCompartilhada.add(page);
}

export async function sair(page: Page): Promise<void> {
  // Sessão compartilhada não se encerra: os outros testes ainda a usam. Sair
  // de verdade (logout no servidor) é para a sessão aberta pelo formulário.
  if (!comSessaoCompartilhada.has(page)) await page.request.post("/api/auth/logout");
  comSessaoCompartilhada.delete(page);
  await page.context().clearCookies();
}

/**
 * O perfil que o fluxo 1 usa em cada largura — cada um entra pelo formulário
 * no aparelho em que de fato trabalha (a Gráfica no celular, a Arte no tablet,
 * a Solicitação no desktop), e o limite por conta não estoura.
 */
export function perfilDaLargura(projeto: string): Perfil {
  if (projeto.startsWith("celular")) return "grafica";
  if (projeto.startsWith("tablet")) return "arte";
  return "solicitacao";
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

/**
 * Como o servidor GRAVA um arquivo subido: o upload devolve a URL do bucket
 * (`https://storage.googleapis.com/<bucket>/.private/uploads/<id>`) e as rotas
 * de thumb/arquivo guardam o caminho servido pelo app (`/objects/uploads/<id>`)
 * — a mesma conversão de server/routes/thumb-url.ts.
 */
export function comoGravado(url: string): string {
  const m = /\/\.private\/(.+?)(?:\?|$)/.exec(url);
  return url.startsWith("https://storage.googleapis.com/") && m ? `/objects/${m[1]}` : url;
}
