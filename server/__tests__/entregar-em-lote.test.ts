// @vitest-environment jsdom
//
// ─────────────────────────────────────────────────────────────────────────────
// ENTREGAR EM LOTE (dono, 23/09: "precisa fazer um entregar em lote").
//
// O que este arquivo pina:
//   · a orquestração: cada volume pela MESMA função da entrega individual, em
//     série e na ordem pedida; a recusa de um volta com o motivo e NÃO segura
//     os outros; erro inesperado vira frase genérica (sem vazar o banco); o
//     fechamento do evento roda UMA vez por evento, depois de tudo;
//   · a rota: mesma permissão da entrega individual, "quem recebeu" obrigatório,
//     foto só do nosso storage, teto de volumes, 409 quando nenhum sai;
//   · a aba Tubos: caixa só em volume que pode sair, "marcar todos deste
//     filtro", a barra com a soma, o modal com UM "quem recebeu" para todos, e
//     o recusado continua marcado com o motivo no cartão.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, afterEach, vi } from "vitest";
import * as React from "react";
import { readFileSync } from "fs";
import path from "path";
import { render, act, cleanup, fireEvent } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { entregarEmLote, idsDoLote, FALHA_GENERICA, MAXIMO_DO_LOTE, type VolumeEntregue } from "../services/entrega-em-lote";

class Recusa extends Error {}
const volume = (tuboId: string, eventId: string, unidades: number, itemIds: string[]): VolumeEntregue =>
  ({ tuboId, numero: 1, avulso: false, eventId, pecas: itemIds.length, unidades, itemIds });

describe("a orquestração do lote (sem banco)", () => {
  it("entrega em série e na ordem; recusa não segura os outros; um fechamento por evento", async () => {
    const ordem: string[] = [];
    const depois = vi.fn(async () => {});
    const r = await entregarEmLote(["t1", "t2", "t3", "t4"], {
      entregarUm: async (id) => {
        ordem.push(id);
        if (id === "t2") throw new Recusa("#0382 no Tubo 2: travada pela Solicitação — Arte vai mudar");
        return id === "t4" ? volume(id, "e2", 3, ["p9"]) : volume(id, "e1", id === "t1" ? 5 : 7, [`p-${id}`]);
      },
      depoisDoEvento: depois,
      ehRecusa: (e): e is Error => e instanceof Recusa,
    });
    expect(ordem).toEqual(["t1", "t2", "t3", "t4"]);
    expect(r.entregues.map((e) => e.tuboId)).toEqual(["t1", "t3", "t4"]);
    expect(r.recusados).toEqual([{ tuboId: "t2", motivo: "#0382 no Tubo 2: travada pela Solicitação — Arte vai mudar" }]);
    expect(r.unidades).toBe(15);
    // Uma vez por evento, com todas as peças entregues dele.
    expect(depois).toHaveBeenCalledTimes(2);
    expect(depois).toHaveBeenCalledWith("e1", ["p-t1", "p-t3"]);
    expect(depois).toHaveBeenCalledWith("e2", ["p9"]);
    // A resposta não carrega a lista de peças (é só para o fechamento).
    expect(Object.keys(r.entregues[0])).not.toContain("itemIds");
  });

  it("erro inesperado vira frase genérica — o texto do banco não vai para a tela", async () => {
    const aoFalhar = vi.fn();
    const r = await entregarEmLote(["t1"], {
      entregarUm: async () => { throw new Error('duplicate key value violates unique constraint "x"'); },
      depoisDoEvento: async () => {},
      ehRecusa: (e): e is Error => e instanceof Recusa,
      aoFalhar,
    });
    expect(r.recusados).toEqual([{ tuboId: "t1", motivo: FALHA_GENERICA }]);
    expect(aoFalhar).toHaveBeenCalled();
  });

  it("falha no fechamento do evento não desfaz o que já foi entregue", async () => {
    const r = await entregarEmLote(["t1"], {
      entregarUm: async (id) => volume(id, "e1", 2, ["p1"]),
      depoisDoEvento: async () => { throw new Error("aviso falhou"); },
      ehRecusa: (e): e is Error => e instanceof Recusa,
    });
    expect(r.entregues).toHaveLength(1);
    expect(r.recusados).toEqual([]);
  });

  it("ids: únicos, não vazios, na ordem em que vieram", () => {
    expect(idsDoLote(["a", "b", "a", "", "  ", 3, null, "c"])).toEqual(["a", "b", "c"]);
    expect(idsDoLote("a")).toEqual([]);
    expect(MAXIMO_DO_LOTE).toBe(100);
  });
});

describe("a rota (fonte)", () => {
  const ROTAS = readFileSync(path.resolve(__dirname, "../routes/tubos.ts"), "utf8");
  const rota = ROTAS.slice(ROTAS.indexOf('app.post("/api/tubos/entregar-em-lote"'));

  it("mesma permissão e mesmos campos da entrega individual; cada volume pela MESMA função", () => {
    expect(rota).toContain("if (!podeMexerEmTubo(req)) return res.status(403)");
    expect(rota).toContain('if (!recebedor) return res.status(400).json({ error: "Informe quem recebeu — é o que registra a entrega" });');
    expect(rota).toContain("urlDeThumbValida(photoUrl)");
    expect(rota).toContain("if (ids.length > MAXIMO_DO_LOTE)");
    expect(rota).toContain("await entregarVolume(req, tuboId, dados)");
    expect(rota).toContain("depoisDoEvento: depoisDaEntrega,");
    expect(rota).toContain("ehRecusa: (e): e is Error => e instanceof Recusa,");
    // Nenhum saiu: 409, com os motivos.
    expect(rota).toContain("if (r.entregues.length === 0) {");
    expect(rota).toContain("return res.status(409).json(");
    // A entrega individual chama a mesma função — uma regra só.
    expect(ROTAS).toContain("const feito = await entregarVolume(req, req.params.id, { quem, agora, hora, recebedor, foto, obs });");
  });

  it("está na régua de permissões com os papéis da entrega individual", () => {
    const P = readFileSync(path.resolve(__dirname, "../../shared/permissoes.ts"), "utf8");
    expect(P).toContain('{ metodo: "POST", rota: "/api/tubos/entregar-em-lote", papeis: ["admin", "grafica", "solicitacao"] },');
  });
});

// ── a aba Tubos montada ─────────────────────────────────────────────────────
const h = React.createElement;
vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: { id: "u1", name: "Operador", email: "g@g", role: "admin", mustChangePassword: false }, isLoading: false, logout: () => {} }),
}));
vi.mock("@/components/ObjectUploader", () => ({ ObjectUploader: ({ children }: any) => h("button", { type: "button" }, children) }));
const $ = (sel: string) => document.querySelector<HTMLElement>(sel);
const tick = (ms = 0) => act(() => new Promise<void>((r) => setTimeout(r, ms)));
const ev = { id: "e1", name: "Maratona", truckDepartureDate: null };
const peca = (id: string) => ({ id, displayId: `#${id}`, type: "2x1", description: "Nubank", quantity: 2, quantidadeNoTubo: 2 });
const tubo = (id: string, numero: number, extra: Record<string, unknown> = {}) => ({
  id, numero, avulso: false, evento: ev, criadoEm: null, fotosFechamento: [], fechadoEm: null, fechadoPor: null,
  entregueEm: null, recebidoPor: null, entreguePor: null, fotoEntregaUrl: null, pecas: [peca(`p${numero}`)], unidades: 2, podeAgir: true, ...extra,
});
const TUBOS = [
  tubo("t1", 1),
  tubo("t2", 2),
  tubo("t3", 3, { podeAgir: false }),
  tubo("t4", 4, { entregueEm: "2026-09-22T10:00:00Z", recebidoPor: "Ana" }),
];

async function montar(respostaDoLote: () => Response) {
  Object.defineProperty(window, "innerWidth", { value: 1280, configurable: true });
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false; } }));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  const chamadas: Array<{ url: string; body: any }> = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.includes("/api/tubos/entregar-em-lote")) { chamadas.push({ url: u, body: JSON.parse(String(init?.body ?? "{}")) }); return respostaDoLote(); }
    if (u.includes("/api/tubos")) return new Response(JSON.stringify(TUBOS), { status: 200, headers: { "content-type": "application/json" } });
    return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
  }));
  window.history.replaceState(null, "", "/grafica?aba=tubos");
  const { queryClient } = await import("@/lib/queryClient");
  const { AbaTubos } = await import("@/components/grafica/aba-tubos");
  queryClient.clear();
  const onEntregou = vi.fn();
  await act(async () => { render(h(QueryClientProvider, { client: queryClient } as any, h(AbaTubos as any, { onEntregou }))); });
  for (let i = 0; i < 60 && !$('[data-testid="cartao-tubo-t1"]'); i++) await tick(25);
  return { chamadas, onEntregou };
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("a aba Tubos: marcar, entregar em lote, e o recusado fica com o motivo", () => {
  it("caixa só em volume que pode sair; barra soma; modal com UM 'quem recebeu'; recusado segue marcado", async () => {
    const { chamadas, onEntregou } = await montar(() => new Response(JSON.stringify({
      entregues: [{ tuboId: "t1", numero: 1, avulso: false, eventId: "e1", pecas: 1, unidades: 2 }],
      recusados: [{ tuboId: "t2", motivo: "#p2 no Tubo 2: travada pela Solicitação" }],
      unidades: 2,
    }), { status: 200, headers: { "content-type": "application/json" } }));

    expect($('[data-testid="marcar-lote-t1"]')).toBeTruthy();
    expect($('[data-testid="marcar-lote-t2"]')).toBeTruthy();
    expect($('[data-testid="marcar-lote-t3"]'), "quem não pode agir não marca").toBeNull();
    expect($('[data-testid="barra-entregar-em-lote"]')).toBeNull();

    // "Marcar todos deste filtro" marca os dois que podem sair.
    const todos = $('[data-testid="tubos-marcar-todos"]')!;
    expect(todos.textContent).toBe("Marcar todos deste filtro (2)");
    await act(async () => { fireEvent.click(todos); });
    const barra = $('[data-testid="barra-entregar-em-lote"]')!;
    expect(barra.textContent).toContain("2 volumes marcados · 4 un.");

    await act(async () => { fireEvent.click($('[data-testid="abrir-entregar-em-lote"]')!); });
    for (let i = 0; i < 40 && !$('[data-testid="modal-entregar-em-lote"]'); i++) await tick(25);
    const modal = $('[data-testid="modal-entregar-em-lote"]')!;
    expect(modal.textContent).toContain("Entregar em lote · 2 volumes");
    expect(modal.textContent).toContain("Tubo 1");
    expect(modal.textContent).toContain("Tubo 2");
    const confirmar = $('[data-testid="confirmar-entrega-em-lote"]') as HTMLButtonElement;
    expect(confirmar.disabled, "sem quem recebeu não sai").toBe(true);
    expect(confirmar.textContent).toBe("Informe quem recebeu");

    await act(async () => { fireEvent.change($('[data-testid="recebedor-em-lote"]')!, { target: { value: "Carlos da portaria" } }); });
    expect(confirmar.textContent).toBe("Entregar 2 volumes a Carlos da portaria");
    await act(async () => { fireEvent.click(confirmar); });
    for (let i = 0; i < 40 && !chamadas.length; i++) await tick(25);
    expect(chamadas[0].body).toEqual({ tuboIds: ["t1", "t2"], receivedBy: "Carlos da portaria", photoUrl: null, notes: "" });

    for (let i = 0; i < 40 && !$('[data-testid="recusa-lote-t2"]'); i++) await tick(25);
    expect($('[data-testid="recusa-lote-t2"]')!.textContent).toBe("Não saiu no lote: #p2 no Tubo 2: travada pela Solicitação");
    expect(($('[data-testid="marcar-lote-t2"]') as HTMLInputElement).checked, "o recusado segue marcado").toBe(true);
    expect(onEntregou).toHaveBeenCalledWith("Carlos da portaria");
  }, 60_000);
});
