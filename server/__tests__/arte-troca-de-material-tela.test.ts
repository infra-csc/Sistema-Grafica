// @vitest-environment jsdom
//
// ─────────────────────────────────────────────────────────────────────────────
// ARTE — trocar arquivo final / thumb depois que a peça andou, dispensa com
// motivo e upload com limite (tela montada + regras puras).
//
//   · a tela lê as MESMAS regras do servidor (shared/troca-de-material): com
//     material produzido não oferece a troca do arquivo final e escreve o
//     motivo; liberada sem impressas avisa ANTES que a troca devolve a peça
//     para a Revisão Final, e o toast confirma quando o servidor devolve;
//   · thumb aprovado: pede motivo (contador visível) e manda `motivo`;
//   · dispensa: motivo obrigatório, botão desabilitado com o porquê escrito;
//   · upload: acima de 50 MB avisa antes; erro do servidor em português.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, afterEach, vi } from "vitest";
import * as React from "react";
import { render, act, cleanup, fireEvent } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  faltamNoMotivo,
  fraseFaltamCaracteres,
  erroDeTamanhoDoUpload,
  mensagemDoUploadFalho,
  textoDaTrocaDoThumb,
  avisoDaTrocaDoArquivoFinal,
  LIMITE_UPLOAD_BYTES,
  MOTIVO_DISPENSA_MIN,
} from "../../client/src/lib/arte-rules";
import { regraDaTrocaDeArquivoFinal, regraDaTrocaDeThumb, ERRO_JA_PRODUZIDO } from "../../shared/troca-de-material";

const h = React.createElement;
vi.setConfig({ testTimeout: 120_000 });

const U = vi.hoisted(() => ({ user: { id: "u-a", name: "Ana", email: "a@a", role: "arte", mustChangePassword: false } as any }));
vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: U.user, isLoading: false, logout: () => {} }),
  AuthProvider: ({ children }: any) => children,
}));
const avisos: { title?: string; description?: string; variant?: string }[] = [];
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: (t: any) => { avisos.push(t); }, dismiss: () => {}, toasts: [] }), toast: (t: any) => { avisos.push(t); } }));

// ─── Regras puras ────────────────────────────────────────────────────────────
describe("regras puras da troca e do motivo", () => {
  it("faltamNoMotivo conta como o servidor (espaços colapsados)", () => {
    expect(faltamNoMotivo("", MOTIVO_DISPENSA_MIN)).toBe(10);
    expect(faltamNoMotivo("   a    b   ", 10)).toBe(7); // "a b"
    expect(faltamNoMotivo("urgência do evento", 10)).toBe(0);
    expect(fraseFaltamCaracteres(1)).toBe("Falta 1 caractere");
    expect(fraseFaltamCaracteres(4)).toBe("Faltam 4 caracteres");
  });

  it("upload acima de 50 MB tem frase humana; no limite passa", () => {
    expect(erroDeTamanhoDoUpload({ size: LIMITE_UPLOAD_BYTES })).toBeNull();
    expect(erroDeTamanhoDoUpload({ size: LIMITE_UPLOAD_BYTES + 1, name: "banner.tif" })).toMatch(/"banner\.tif" tem .* o limite é 50 MB/);
  });

  it("erro do upload: a frase do servidor, o 413 em HTML vira o limite", () => {
    expect(mensagemDoUploadFalho(400, JSON.stringify({ error: "Tipo de arquivo não permitido" }))).toBe("Tipo de arquivo não permitido");
    expect(mensagemDoUploadFalho(413, "<html>Payload Too Large</html>")).toMatch(/50 MB/);
    expect(mensagemDoUploadFalho(500, "<html>")).toMatch(/erro 500/);
  });

  it("texto do thumb diz a verdade em cada fase", () => {
    const aprovada = { status: "sponsor_approved", approvalThumbUrl: "/objects/a" };
    const r = regraDaTrocaDeThumb(aprovada);
    expect(r).toEqual({ pode: true, exigeMotivo: true });
    expect(textoDaTrocaDoThumb("sponsor_approved", r)).toMatch(/trocada após aprovação.*só quem aprova toda versão nova/);
    expect(textoDaTrocaDoThumb("awaiting_final_review", r)).toMatch(/Nenhum patrocinador é chamado de novo/);
    const liberada = regraDaTrocaDeThumb({ status: "ready_for_production", approvalThumbUrl: "/objects/a" });
    expect(textoDaTrocaDoThumb("ready_for_production", liberada)).toMatch(/já foi liberada/);
    expect(textoDaTrocaDoThumb("sponsor_approved", { pode: true, exigeMotivo: false })).toMatch(/Troca simples/);
  });

  it("aviso do arquivo final: volta para a Revisão, bloqueio ou nada", () => {
    expect(avisoDaTrocaDoArquivoFinal(regraDaTrocaDeArquivoFinal({ status: "ready_for_production", finalFileUrl: "x" }))).toMatch(/devolve a peça para a Revisão Final/);
    expect(avisoDaTrocaDoArquivoFinal(regraDaTrocaDeArquivoFinal({ status: "inProduction", finalFileUrl: "x", quantityProduced: 1 }))).toBe(ERRO_JA_PRODUZIDO);
    expect(avisoDaTrocaDoArquivoFinal(regraDaTrocaDeArquivoFinal({ status: "awaiting_final_review", finalFileUrl: "x" }))).toBeNull();
  });
});

// ─── Tela montada ────────────────────────────────────────────────────────────
const $ = (sel: string) => document.querySelector<HTMLElement>(sel);
const tid = (id: string) => $(`[data-testid="${id}"]`);
const tick = (ms = 0) => act(() => new Promise<void>((r) => setTimeout(r, ms)));
async function esperar(cond: () => boolean, oQue: string, max = 400) {
  for (let i = 0; i < max && !cond(); i++) await tick(25);
  expect(cond(), oQue).toBe(true);
}

function prepararJsdom(largura = 1440) {
  Object.defineProperty(window, "innerWidth", { value: largura, configurable: true });
  Object.defineProperty(window, "innerHeight", { value: 900, configurable: true });
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: /max-width:\s*767px/.test(q) && largura < 768, media: q, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false; },
  }));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("IntersectionObserver", class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } });
  vi.stubGlobal("confirm", () => true);
  (Element.prototype as any).scrollIntoView = () => {};
  (Element.prototype as any).scrollTo = () => {};
  (Element.prototype as any).hasPointerCapture = () => false;
  (Element.prototype as any).releasePointerCapture = () => {};
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); avisos.length = 0; });

const DIA = 86_400_000;
const iso = (d: number) => new Date(Date.now() + d * DIA).toISOString();
const EVENTO = {
  id: "e1", name: "Maratona X", priority: "media", status: "active", manuallyClosed: false,
  startDate: iso(20).slice(0, 10), truckDepartureDate: iso(17), lifecycle: "active", allDelivered: false, eventHasPassed: false,
  deadlineListaImagens: -25, deadlineEntregaLayouts: -20, deadlineAprovacaoLayout: -12, deadlineFinalizacao: -10,
  deadlineRevisaoLista: -8, deadlineProducaoGrafica: -1, sponsors: [], items: [],
};
const peca = (id: string, over: any = {}) => ({
  id, displayId: `#0${id.replace(/\D/g, "").padStart(3, "0")}`, eventId: "e1", event: EVENTO, type: "Pórtico", description: `Peça ${id}`,
  quantity: 2, quantityProduced: 0, conferredQty: 0, deliveredQty: 0, embaladaQty: 0, reuseQty: 0, isReuse: false,
  material: "Lona", finish: "Ilhós", calculatedM2: "2", visualWidth: "1", visualHeight: "1", fileWidth: "100", fileHeight: "100",
  status: "ready_for_production", skipApproval: false, sponsors: [], observations: "", approvalThumbUrl: "/objects/t.png",
  finalFileUrl: "\\\\srv\\artes\\p1.pdf", kitRemessaId: null, parentItemId: null, createdAt: iso(-10), updatedAt: iso(-1), statusChangedAt: iso(-1),
  ...over,
});

async function montarArte(pecas: any[], opts: { abrir?: string; resposta?: (u: URL, init: any) => any } = {}) {
  prepararJsdom();
  U.user = { id: "u-a", name: "Ana", email: "a@a", role: "arte", mustChangePassword: false };
  const chamadas: { url: string; method: string; body: any }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: any, init?: any) => {
    const u = new URL(String(url), "http://local");
    let corpo: any = [];
    if (init?.method && init.method !== "GET") {
      chamadas.push({ url: u.pathname, method: init.method, body: init.body ? JSON.parse(String(init.body)) : null });
      corpo = opts.resposta?.(u, init) ?? { ok: true };
    } else if (u.pathname === "/api/items" && u.searchParams.get("since")) corpo = { itens: [], removidas: [], agora: new Date().toISOString() };
    else if (u.pathname === "/api/items") corpo = pecas;
    else if (u.pathname === "/api/events") corpo = [EVENTO];
    else if (u.pathname === "/api/items/batch-approval-data") corpo = { sponsorsByItem: {}, approvalsByItem: {} };
    else if (u.pathname === "/api/artes/sugestao-final") corpo = null;
    return new Response(JSON.stringify(corpo), { status: 200, headers: { "content-type": "application/json" } });
  }));
  try { localStorage.clear(); sessionStorage.clear(); } catch { /* sem storage */ }
  window.history.replaceState(null, "", opts.abrir ? `/arte?item=${opts.abrir}` : "/arte?fase=criar-aprovacoes");
  const { queryClient, resetItensDelta } = await import("@/lib/queryClient");
  const { TooltipProvider } = await import("@/components/ui/tooltip");
  const Arte = (await import("@/pages/arte")).default;
  queryClient.clear();
  resetItensDelta();
  await act(async () => { render(h(QueryClientProvider, { client: queryClient } as any, h(TooltipProvider, null, h(Arte as any, null)))); });
  return chamadas;
}

describe("Arte montada — trocar o arquivo final", () => {
  it("com material produzido: sem campo nem botão, e o motivo escrito", async () => {
    await montarArte([peca("p1", { status: "inProduction", quantityProduced: 1 })], { abrir: "p1" });
    await esperar(() => !!tid("final-troca-bloqueada"), "a ficha abre com o bloqueio escrito");
    expect(tid("final-troca-bloqueada")!.textContent).toContain(ERRO_JA_PRODUZIDO);
    expect(tid("input-final-file-path")).toBeNull();
    expect(tid("button-submit-final")).toBeNull();
    // o thumb de uma peça liberada também não troca — e diz por quê
    expect(tid("uploader-update-thumb")).toBeNull();
    expect(tid("texto-troca-thumb")!.textContent).toMatch(/já foi liberada/);
  });

  it("liberada sem impressas: avisa antes e o toast diz que voltou para a Revisão Final", async () => {
    const chamadas = await montarArte([peca("p1")], {
      abrir: "p1",
      resposta: () => ({ ...peca("p1", { status: "awaiting_final_review" }), voltouParaRevisao: true }),
    });
    await esperar(() => !!tid("aviso-troca-volta-revisao"), "o aviso aparece junto da ação");
    expect(tid("aviso-troca-volta-revisao")!.textContent).toMatch(/devolve a peça para a Revisão Final/);
    await act(async () => { fireEvent.change(tid("input-final-file-path")!, { target: { value: "\\\\srv\\artes\\p1-v2.pdf" } }); });
    await act(async () => { fireEvent.click(tid("button-submit-final")!); });
    await esperar(() => chamadas.some((c) => c.url === "/api/items/p1/update-final-file"), "envia a troca");
    await esperar(() => avisos.some((a) => /voltou para a Revisão Final/.test(a.description ?? "")), "o toast conta que a peça voltou");
  });
});

describe("Arte montada — trocar o thumb aprovado pede motivo", () => {
  it("na Revisão Final: campo de motivo, contador e troca travada até o mínimo", async () => {
    await montarArte([peca("p1", { status: "awaiting_final_review" })], { abrir: "p1" });
    await esperar(() => !!tid("textarea-motivo-troca-thumb"), "o campo de motivo aparece");
    expect(tid("troca-thumb-faltam")!.textContent).toMatch(/Faltam 10 caracteres/);
    expect(tid("texto-troca-thumb")!.textContent).toMatch(/trocada após aprovação/);
    expect(tid("button-buscar-arte-troca-aprovada"), "reaproveitar espera o motivo").toBeNull();
    await act(async () => { fireEvent.change(tid("textarea-motivo-troca-thumb")!, { target: { value: "logo novo pedido pelo cliente" } }); });
    await esperar(() => !tid("troca-thumb-faltam"), "o contador some com o motivo completo");
    expect(tid("button-buscar-arte-troca-aprovada")).not.toBeNull();
  });
});

describe("Arte montada — dispensar exige motivo", () => {
  it("botão travado com o porquê escrito; com motivo, manda o reason limpo", async () => {
    const chamadas = await montarArte([peca("p1", { status: "awaiting_submission", finalFileUrl: null })]);
    await esperar(() => !!tid("button-row-menu-p1"), "a fila carrega");
    await act(async () => {
      fireEvent.pointerDown(tid("button-row-menu-p1")!, { button: 0, ctrlKey: false, pointerType: "mouse" });
      fireEvent.click(tid("button-row-menu-p1")!);
    });
    await esperar(() => !!tid("button-dispense-p1"), "o menu abre com a dispensa");
    await act(async () => { fireEvent.click(tid("button-dispense-p1")!); });
    await esperar(() => !!tid("textarea-dispense-reason"), "o diálogo abre");
    const botao = tid("button-confirm-dispense") as HTMLButtonElement;
    expect(botao.disabled).toBe(true);
    expect(tid("dispense-faltam")!.textContent).toMatch(/Faltam 10 caracteres/);
    await act(async () => { fireEvent.change(tid("textarea-dispense-reason")!, { target: { value: "  patrocinador   aprovou por e-mail " } }); });
    expect((tid("button-confirm-dispense") as HTMLButtonElement).disabled).toBe(false);
    await act(async () => { fireEvent.click(tid("button-confirm-dispense")!); });
    await esperar(() => chamadas.some((c) => c.url === "/api/items/p1/dispense"), "dispensa");
    expect(chamadas.find((c) => c.url === "/api/items/p1/dispense")!.body).toEqual({ reason: "patrocinador aprovou por e-mail" });
  });
});

describe("Arte montada — thumbs em lote: erro do servidor e \"Tentar de novo\" por cartão", () => {
  it("a falha mostra a frase do servidor; tentar de novo refaz só aquele envio; grande demais já nasce com o limite", async () => {
    (URL as any).createObjectURL = () => "blob:x";
    (URL as any).revokeObjectURL = () => {};
    let uploads = 0;
    const chamadas = await montarArte([peca("p1", { status: "awaiting_submission", approvalThumbUrl: null, finalFileUrl: null })]);
    // O upload-direct é PUT com corpo binário: a 1ª tentativa falha com a frase do servidor.
    const fetchBase = (globalThis.fetch as any);
    vi.stubGlobal("fetch", vi.fn(async (url: any, init?: any) => {
      if (String(url).includes("/api/objects/upload-direct")) {
        uploads++;
        return uploads === 1
          ? new Response(JSON.stringify({ error: "Não foi possível enviar o arquivo" }), { status: 500, headers: { "content-type": "application/json" } })
          : new Response(JSON.stringify({ url: "/objects/uploads/novo" }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return fetchBase(url, init);
    }));
    await esperar(() => document.querySelectorAll('input[type="file"][multiple]').length > 0, "a entrada do lote existe");
    const entrada = document.querySelector<HTMLInputElement>('input[type="file"][multiple]')!;
    const leve = new File(["x"], "arte_0001.png", { type: "image/png" });
    const pesado = new File(["x"], "pesado.png", { type: "image/png" });
    Object.defineProperty(pesado, "size", { value: 60 * 1024 * 1024 });
    await act(async () => { fireEvent.change(entrada, { target: { files: [leve, pesado] } }); });
    await esperar(() => !!tid("button-bulk-thumb-confirm"), "o modal do lote abre");
    // o grande demais já nasce com o erro do limite, sem "Tentar de novo"
    const erros = () => Array.from(document.querySelectorAll<HTMLElement>('[data-testid^="bulk-thumb-erro-"]')).map((e) => e.textContent ?? "");
    expect(erros().some((t) => /limite é 50 MB/.test(t))).toBe(true);
    await act(async () => { fireEvent.click(tid("button-bulk-thumb-confirm")!); });
    await esperar(() => erros().some((t) => t === "Não foi possível enviar o arquivo"), "a frase do servidor aparece no cartão");
    const tentar = document.querySelectorAll<HTMLElement>('[data-testid^="button-bulk-thumb-tentar-"]');
    expect(tentar.length, "só o cartão que pode dar certo ganha o botão").toBe(1);
    await act(async () => { fireEvent.click(tentar[0]); });
    await esperar(() => chamadas.some((c) => c.url === "/api/items/p1/submit-for-approval"), "o reenvio chega ao servidor");
    expect(uploads, "o pesado nunca sobe").toBe(2);
  });
});
