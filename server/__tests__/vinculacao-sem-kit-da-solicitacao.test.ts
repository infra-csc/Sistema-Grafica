// @vitest-environment jsdom
//
// ─────────────────────────────────────────────────────────────────────────────
// VINCULAÇÃO: A SOLICITAÇÃO DA ARENA NÃO VÊ AS PEÇAS DO KIT (dono, 21/10).
//
// Relato (usuária de Solicitação, NÃO do Kit): "As peças do kit ficam
// aparecendo pra mim na vinculação e me atrapalham na hora de salvar em lote e
// enviar p/ a arte — ele fica travando falando que eu não posso liberar peça
// do kit". O modal "Enviar para Arte" listava 8 peças "KIT · 02/11" misturadas
// às dela, e a trava de server/routes.ts devolvia 403 ao LOTE INTEIRO.
//
// A REGRA DO SERVIDOR (que NÃO mudou): papel "solicitacao" que não é usuário
// do Kit não escreve em peça com remessa do Kit — por id na URL ou em
// `itemIds`. Admin age em tudo; o usuário do Kit, só nas dele.
//
// O QUE MUDOU (só leitura de tela): a Vinculação pede `?semKitAlheio=1` e,
// para a Solicitação da Arena, o servidor tira as peças do Kit da resposta; a
// tela aplica o mesmo filtro na fonte. Lista, contagens, seleção, "Salvar em
// lote" e "Enviar N para a Arte" nascem dessa lista. Admin vê tudo; o usuário
// do Kit continua vendo (e liberando) as dele.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import * as React from "react";
import { readFileSync } from "fs";
import path from "path";
import { render, act, cleanup, fireEvent } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  soVisualizaPecaDoKit, pecaNaVinculacaoDe, separarPecasDoKitAlheio, fraseDasPecasDoKitQueFicaram,
  pecaVisivelPara, PARAM_SEM_KIT_ALHEIO,
} from "@shared/kit";

const h = React.createElement;
const ler = (rel: string) => readFileSync(path.resolve(__dirname, "../../", rel), "utf8");

const ARENA = { role: "solicitacao", kit: false };
const DO_KIT = { role: "solicitacao", kit: true };
const ADMIN = { role: "admin", kit: false };

// ── 1. A régua ──────────────────────────────────────────────────────────────
describe("a régua: quem só visualiza peça do Kit", () => {
  it("só a Solicitação da Arena, e só em peça com remessa do Kit", () => {
    const kit = { kitRemessaId: "r1" };
    const arena = { kitRemessaId: null };
    expect(soVisualizaPecaDoKit(ARENA, kit)).toBe(true);
    expect(soVisualizaPecaDoKit(ARENA, arena)).toBe(false);
    expect(soVisualizaPecaDoKit(DO_KIT, kit)).toBe(false);
    expect(soVisualizaPecaDoKit(ADMIN, kit)).toBe(false);
    for (const role of ["arte", "atendimento", "grafica"]) expect(soVisualizaPecaDoKit({ role }, kit)).toBe(false);
    expect(soVisualizaPecaDoKit(null, kit)).toBe(false);
    expect(pecaNaVinculacaoDe(ARENA, kit)).toBe(false);
    expect(pecaNaVinculacaoDe(ADMIN, kit)).toBe(true);
  });

  it("é a mesma régua da trava do servidor (server/routes.ts), que segue intacta", () => {
    const ROUTES = ler("server/routes.ts");
    expect(ROUTES).toContain('if (req.userRole !== "solicitacao" || req.userKit || !["POST", "PATCH", "PUT", "DELETE"].includes(req.method)) return next();');
    expect(ROUTES).toContain("Peça do Kit: a Solicitação da Arena só visualiza. Quem age nela é o usuário do Kit.");
    // A planilha do Painel é leitura por POST: com Kit no recorte, dava 403 ao baixar o Excel.
    const trava = ROUTES.slice(ROUTES.indexOf('if (req.userRole !== "solicitacao" || req.userKit'), ROUTES.indexOf("Peça do Kit: a Solicitação da Arena só visualiza."));
    expect(trava).toContain('if (req.method === "POST" && req.path === "/api/items/export-xlsx") return next();');
    expect(trava).toContain('if (Array.isArray(req.body?.itemIds))');
  });

  it("o lote se divide: vão as que a pessoa libera, e a frase diz quantas do Kit ficaram", () => {
    const pecas = [{ id: "a1", kitRemessaId: null }, { id: "k1", kitRemessaId: "r1" }, { id: "a2", kitRemessaId: null }, { id: "k2", kitRemessaId: "r1" }];
    const arena = separarPecasDoKitAlheio(ARENA, pecas);
    expect(arena.podem.map((p) => p.id)).toEqual(["a1", "a2"]);
    expect(arena.doKit.map((p) => p.id)).toEqual(["k1", "k2"]);
    expect(separarPecasDoKitAlheio(ADMIN, pecas).doKit).toEqual([]);
    expect(separarPecasDoKitAlheio(DO_KIT, pecas).doKit).toEqual([]);
    expect(fraseDasPecasDoKitQueFicaram(3)).toBe("3 peças do Kit ficaram de fora: quem libera é o Kit.");
    expect(fraseDasPecasDoKitQueFicaram(1)).toBe("1 peça do Kit ficou de fora: quem libera é o Kit.");
  });

  it("a Vinculação pede o recorte; o envio e o auto-vínculo também deixam o Kit de fora", () => {
    expect(PARAM_SEM_KIT_ALHEIO).toBe("semKitAlheio");
    expect(ler("client/src/components/vinculacao/constantes.ts")).toContain("&${PARAM_SEM_KIT_ALHEIO}=1`] as const;");
    expect(ler("client/src/components/vinculacao/use-envio-para-arte.ts")).toContain("const { podem: paraEnviar, doKit } = separarPecasDoKitAlheio(user, doModal.filter(i => !jaEnviadas.includes(i)));");
    const SPONSORS = ler("server/routes/sponsors.ts");
    expect(SPONSORS).toContain('storage.previewAutoLink(req.params.id, { semPecasDoKit: req.userRole === "solicitacao" && req.userKit !== true })');
    expect(SPONSORS).toContain('storage.autoLinkByQuota(req.params.id, { semPecasDoKit: req.userRole === "solicitacao" && req.userKit !== true })');
    expect(ler("server/storage.ts")).toContain("...(opcoes.semPecasDoKit ? [isNull(items.kitRemessaId)] : [])");
  });
});

// ── 2. A tela, montada de verdade contra um servidor falso ──────────────────
const DIA = 86_400_000;
const agoraMs = Date.now();
const iso = (ms: number) => new Date(ms).toISOString();
const EVENTO = {
  id: "e1", name: "Eco Run Special Edition RJ", status: "active", manuallyClosed: false, lifecycle: "active",
  startDate: iso(agoraMs + 20 * DIA).slice(0, 10), truckDepartureDate: iso(agoraMs + 17 * DIA),
  priority: "alta", allDelivered: false, eventHasPassed: false, createdAt: iso(agoraMs - 30 * DIA),
  deadlineListaImagens: -25, deadlineEntregaLayouts: -20, deadlineAprovacaoLayout: -12,
  deadlineFinalizacao: -10, deadlineRevisaoLista: -8, deadlineProducaoGrafica: -1,
  sponsors: [{ sponsorId: "s1" }, { sponsorId: "s2" }], items: [],
};
const PATROCINADORES = [{ id: "s1", name: "Ultrafarma", color: "#3b82f6" }, { id: "s2", name: "Brahma", color: "#f59e0b" }];
const REMESSA = { id: "r1", versao: "V1", entregaMaterial: iso(agoraMs + 12 * DIA) };
const peca = (id: string, n: number, over: Record<string, unknown> = {}) => ({
  id, displayId: `#${4000 + n}`, status: "awaiting_linking", type: over.kitRemessaId ? "Placa de octanorme" : "Backdrop",
  description: `Peça ${id}`, material: "LONA", finish: "Ilhós", quantity: 1, visualWidth: "3", visualHeight: "2",
  calculatedM2: "6", eventId: "e1", event: { ...EVENTO }, sponsors: [{ ...PATROCINADORES[0], approvalStatus: null }],
  referenceUrl: null, kitRemessaId: null, kitRemessa: null, criadoPorId: "uA", parentItemId: null,
  skipApproval: false, isReuse: false, isPriority: false, observations: "",
  createdAt: iso(agoraMs - n * 60_000), updatedAt: iso(agoraMs - n * 60_000), statusChangedAt: iso(agoraMs - DIA),
  ...over,
});
const doKit = (id: string, n: number, criadoPorId = "uK", over: Record<string, unknown> = {}) => peca(id, n, { kitRemessaId: "r1", kitRemessa: REMESSA, criadoPorId, ...over });
// a1–a3 e k1–k3 prontas (com patrocinador); a4 e k4 pendentes (sem nenhum) —
// são as pendentes que o "selecionar todas" alcança.
const ACERVO = [
  peca("a1", 1), peca("a2", 2), peca("a3", 3), peca("a4", 7, { sponsors: [] }),
  doKit("k1", 4), doKit("k2", 5), doKit("k3", 6, "uK2"), doKit("k4", 8, "uK", { sponsors: [] }),
];
const IDS_ARENA = ["a1", "a2", "a3", "a4"];
const IDS_KIT = ["k1", "k2", "k3", "k4"];

const USUARIOS: Record<string, any> = {
  arena: { id: "uA", name: "Ana Solicitação", email: "ana@x", role: "solicitacao", kit: false, mustChangePassword: false },
  kit: { id: "uK", name: "Kátia do Kit", email: "kit@x", role: "solicitacao", kit: true, mustChangePassword: false },
  admin: { id: "uAdm", name: "Admin", email: "adm@x", role: "admin", kit: false, mustChangePassword: false },
};
const mundo = { quem: "arena" as keyof typeof USUARIOS, servidorRecorta: true };
const escritas: Array<{ url: string; corpo: any }> = [];

/** A trava de server/routes.ts, reproduzida: lote com peça do Kit volta 403 inteiro. */
function travaDaArena(ids: string[]): Response | null {
  const u = USUARIOS[mundo.quem];
  if (u.role !== "solicitacao" || u.kit) return null;
  if (!ACERVO.some((p) => ids.includes(p.id) && p.kitRemessaId)) return null;
  return new Response(JSON.stringify({ error: "Peça do Kit: a Solicitação da Arena só visualiza. Quem age nela é o usuário do Kit." }), { status: 403, headers: { "content-type": "application/json" } });
}

beforeAll(() => {
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false; },
  }));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("IntersectionObserver", class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } });
  (Element.prototype as any).scrollIntoView = () => {};
  (Element.prototype as any).scrollTo = () => {};
  vi.stubGlobal("fetch", async (url: any, init?: any) => {
    const u = String(url);
    const alvo = new URL(u, "http://local");
    const metodo = (init?.method || "GET").toUpperCase();
    const json = (b: any, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
    const usuario = USUARIOS[mundo.quem];
    if (alvo.pathname === "/api/auth/me") return json(usuario);
    if (alvo.pathname === "/api/items" && metodo === "GET") {
      if (alvo.searchParams.has("since")) return json({ delta: true, agora: iso(Date.now()), itens: [], removidas: [], eventos: [EVENTO], patrocinadores: PATROCINADORES });
      const quem = { kit: usuario.kit, userId: usuario.id };
      const naoRecorta = !mundo.servidorRecorta || alvo.searchParams.get(PARAM_SEM_KIT_ALHEIO) !== "1";
      return json(ACERVO.filter((p) => pecaVisivelPara(quem, p) && (naoRecorta || pecaNaVinculacaoDe(usuario, p))));
    }
    if (metodo === "POST") {
      const corpo = init?.body ? JSON.parse(init.body) : {};
      escritas.push({ url: alvo.pathname, corpo });
      const m = alvo.pathname.match(/^\/api\/items\/([^/]+)\/sponsors\/sync$/);
      if (m) return travaDaArena([m[1]]) ?? json({ ok: true });
      if (alvo.pathname === "/api/items/send-to-arte") {
        return travaDaArena(corpo.itemIds) ?? json({ sent: corpo.itemIds.length, errors: [], falhas: [] });
      }
      return json({});
    }
    if (alvo.pathname === "/api/events") return json([EVENTO]);
    if (alvo.pathname === "/api/sponsors") return json(PATROCINADORES);
    if (alvo.pathname === "/api/sugestoes-de-vinculo") return json({});
    return json([]);
  });
});
afterAll(() => { vi.unstubAllGlobals(); });
beforeEach(() => {
  cleanup();
  escritas.length = 0;
  mundo.servidorRecorta = true;
  try { sessionStorage.clear(); localStorage.clear(); } catch { /* modo privado */ }
  window.history.replaceState(null, "", "/vincular");
});

async function tick(ms = 20) { await act(async () => { await new Promise((r) => setTimeout(r, ms)); }); }
async function esperar(cond: () => boolean, oQue: string, max = 600) {
  for (let i = 0; i < max && !cond(); i++) await tick(10);
  expect(cond(), oQue).toBe(true);
}
const tid = (id: string) => document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const linhas = () => Array.from(document.querySelectorAll('[data-testid^="item-row-"]'))
  .map((el) => el.getAttribute("data-testid")!.replace("item-row-", "")).sort();
const botaoComTexto = (re: RegExp) => Array.from(document.querySelectorAll("button")).find((b) => re.test(b.textContent || "")) as HTMLButtonElement | undefined;

async function montar(quem: keyof typeof USUARIOS) {
  mundo.quem = quem;
  const { queryClient, resetItensDelta } = await import("@/lib/queryClient");
  const { TooltipProvider } = await import("@/components/ui/tooltip");
  const { AuthProvider } = await import("@/contexts/auth-context");
  const Pagina = (await import("@/pages/vincular-patrocinadores")).default;
  queryClient.clear();
  resetItensDelta();
  render(h(QueryClientProvider, { client: queryClient } as any, h(TooltipProvider, null, h(AuthProvider, null, h(Pagina as any, null)))));
  await esperar(() => linhas().length > 0, "a fila desenha");
  await tick(200);
}

describe("Vinculação como Solicitação da Arena, com peças do Kit no evento", () => {
  it.each([true, false])("as peças do Kit não aparecem (servidor recorta: %s — a tela filtra de qualquer jeito)", async (recorta) => {
    mundo.servidorRecorta = recorta;
    await montar("arena");
    expect(linhas()).toEqual(IDS_ARENA);
    expect(document.body.textContent).not.toContain("Placa de octanorme");
    // "Enviar N para Arte" conta só as dela (as três prontas)
    expect(tid("button-finalizar-lote")?.textContent).toContain("Enviar 3 para Arte");
  }, 60_000);

  it("o lote de envio não trava: o modal lista só as dela e o POST vai sem peça do Kit", async () => {
    mundo.servidorRecorta = false; // o pior caso: a resposta trouxe o Kit
    await montar("arena");
    await act(async () => { fireEvent.click(tid("button-finalizar-lote")!); });
    await esperar(() => document.querySelectorAll('[data-testid^="envio-peca-"]').length > 0, "o modal abre");
    const noModal = Array.from(document.querySelectorAll('[data-testid^="envio-peca-"]')).map((el) => el.getAttribute("data-testid")!.replace("envio-peca-", "")).sort();
    expect(noModal).toEqual(["a1", "a2", "a3"]);
    await act(async () => { fireEvent.click(botaoComTexto(/^Enviar 3 para a Arte$/)!); });
    await esperar(() => escritas.some((e) => e.url === "/api/items/send-to-arte"), "envia");
    const envio = escritas.find((e) => e.url === "/api/items/send-to-arte")!;
    expect(envio.corpo.itemIds.sort()).toEqual(["a1", "a2", "a3"]);
    expect(envio.corpo.itemIds.some((id: string) => IDS_KIT.includes(id))).toBe(false);
  }, 60_000);

  it("lote: 'selecionar todas' + Aplicar + Salvar grava só as dela, sem 403", async () => {
    mundo.servidorRecorta = false;
    await montar("arena");
    const todas = document.querySelector('[data-testid^="checkbox-select-all-"]') as HTMLElement;
    expect(todas, "o selecionar todas existe").not.toBeNull();
    await act(async () => { fireEvent.click(todas); });
    await esperar(() => !!tid("button-apply-bulk-sponsors"), "a barra de lote aparece");
    await act(async () => { fireEvent.click(tid("button-apply-bulk-sponsors")!); });
    await esperar(() => !!tid("checkbox-bulk-sponsor-s2"), "o modal de aplicar abre");
    await act(async () => { fireEvent.click(tid("checkbox-bulk-sponsor-s2")!); });
    // "Aplicar em lote" grava na hora (saveLinkingMutation) — é o "salvar em lote".
    await act(async () => { fireEvent.click(tid("button-confirm-bulk-apply")!); });
    await esperar(() => escritas.some((e) => e.url.endsWith("/sponsors/sync")), "salva");
    await tick(100);
    const salvas = escritas.filter((e) => e.url.endsWith("/sponsors/sync")).map((e) => e.url.split("/")[3]).sort();
    expect(salvas).toEqual(["a4"]);
  }, 60_000);
});

describe("o usuário do Kit e o admin não perdem nada", () => {
  it("o usuário do Kit vê as peças do Kit dele (e só elas) e as envia", async () => {
    await montar("kit");
    expect(linhas()).toEqual(["k1", "k2", "k4"]);
    await act(async () => { fireEvent.click(tid("button-finalizar-lote")!); });
    await esperar(() => document.querySelectorAll('[data-testid^="envio-peca-"]').length === 2, "o modal lista as duas");
    await act(async () => { fireEvent.click(botaoComTexto(/^Enviar 2 para a Arte$/)!); });
    await esperar(() => escritas.some((e) => e.url === "/api/items/send-to-arte"), "envia");
    expect(escritas.find((e) => e.url === "/api/items/send-to-arte")!.corpo.itemIds.sort()).toEqual(["k1", "k2"]);
  }, 60_000);

  it("o admin vê tudo, Arena e Kit", async () => {
    await montar("admin");
    expect(linhas()).toEqual([...IDS_ARENA, ...IDS_KIT].sort());
    expect(tid("button-finalizar-lote")?.textContent).toContain("Enviar 6 para Arte");
  }, 60_000);
});
