// @vitest-environment jsdom
//
// ─────────────────────────────────────────────────────────────────────────────
// EDITAR A REMESSA DO KIT — a tela (dono, 21/10: "botão para o Kit mudar os
// dados de data início e tudo mais"). A remessa criada com a data errada só
// se corrigia excluindo e recriando (com as peças). Agora cada remessa tem
// "Editar", que abre o MESMO modal da criação já preenchido; "Salvar
// alterações" manda o PATCH com os campos do formulário.
// A rota (papéis, dono, validação, trilha, peças reavisadas) roda em
// regras-fluxo-kit.test.ts → "editar a remessa do Kit".
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeAll, vi } from "vitest";
import * as React from "react";
import { render, act, fireEvent } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";

const h = React.createElement;

const REMESSA = {
  id: "rem-1", eventId: "ev-1", versao: "V1", solicitante: "Kaio", departamento: "Kit", dataSolicitacao: null,
  entregaMaterial: "2026-11-20T12:00:00.000Z", dataEvento: "2026-11-29T12:00:00.000Z", cargaCaminhao: null,
  saidaCaminhao: "2026-11-22T12:00:00.000Z", arquivo: "New Balance BSB.xlsx", criadoPor: "Kaio", criadoPorId: "u-kit",
  createdAt: "2026-10-21T10:00:00.000Z",
};
const pedidos: Array<{ url: string; method: string; body: any }> = [];

beforeAll(() => {
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false; },
  }));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  (Element.prototype as any).scrollIntoView = () => {};
  vi.stubGlobal("fetch", async (url: any, init?: any) => {
    const u = String(url);
    const method = (init?.method || "GET").toUpperCase();
    pedidos.push({ url: u, method, body: init?.body ? JSON.parse(String(init.body)) : null });
    const json = (b: any) => new Response(JSON.stringify(b), { status: 200, headers: { "content-type": "application/json" } });
    if (u.startsWith("/api/kit/remessas?") && method === "GET") return json([REMESSA]);
    if (u === "/api/kit/remessas/rem-1" && method === "PATCH") {
      return json({ ...REMESSA, entregaMaterial: "2026-11-25T12:00:00.000Z", pecasAtualizadas: 2, prazosMudaram: true });
    }
    return json([]);
  });
});

async function tick(ms = 60) { await act(async () => { await new Promise((r) => setTimeout(r, ms)); }); }
const el = (sel: string) => document.querySelector(sel) as HTMLInputElement | null;

describe("Kit: editar a remessa", () => {
  it("'Editar' abre o formulário preenchido, sem planilha, e salva com PATCH", async () => {
    const { queryClient } = await import("@/lib/queryClient");
    const { PainelDoKit } = await import("@/components/kit/painel-do-kit");
    const { Toaster } = await import("@/components/ui/toaster");
    queryClient.clear();
    // A lista de remessas já em cache (a tela a lê pela chave do evento).
    queryClient.setQueryData([`/api/kit/remessas?eventId=ev-1`], [REMESSA]);
    const pecas = [
      { id: "p1", kitRemessaId: "rem-1", status: "draft", displayId: "#0001", quantity: 20 },
      { id: "p2", kitRemessaId: "rem-1", status: "draft", displayId: "#0002", quantity: 4 },
    ];
    render(h(QueryClientProvider, { client: queryClient } as any,
      h(PainelDoKit as any, {
        eventId: "ev-1", pecas, podeCriar: true, usuarioDoKit: true, nomeDoUsuario: "Kaio",
        dataDoEvento: null, saidaDoEvento: null, eventoFinalizado: false,
      }),
      h(Toaster as any, null)));
    await tick(150);

    const editar = el('[data-testid="button-editar-remessa-rem-1"]');
    expect(editar).toBeTruthy();
    await act(async () => { editar!.click(); });
    await tick(150);

    // O mesmo modal, já com os dados da remessa — e sem o envio de planilha.
    expect(document.body.textContent).toContain("Editar remessa KIT V1");
    expect(el('[data-testid="button-planilha-remessa-kit"]')).toBeNull();
    expect(el('[data-testid="aviso-edicao-remessa-kit"]')?.textContent).toContain("das 2 peças");
    expect(el('[data-testid="input-remessa-versao"]')?.value).toBe("V1");
    expect(el('[data-testid="input-remessa-solicitante"]')?.value).toBe("Kaio");
    expect(el('[data-testid="input-remessa-entrega"]')?.value).toBe("2026-11-20");
    expect(el('[data-testid="input-remessa-evento"]')?.value).toBe("2026-11-29");
    expect(el('[data-testid="input-remessa-saida"]')?.value).toBe("2026-11-22");

    // Sem mexer, não há o que salvar.
    const salvar = () => el('[data-testid="button-salvar-remessa-kit"]') as unknown as HTMLButtonElement;
    expect(salvar().disabled).toBe(true);
    expect(document.body.textContent).toContain("Nenhuma alteração ainda");

    await act(async () => { fireEvent.change(el('[data-testid="input-remessa-entrega"]')!, { target: { value: "2026-11-25" } }); });
    await act(async () => { fireEvent.change(el('[data-testid="input-remessa-carga"]')!, { target: { value: "2026-11-21" } }); });
    expect(salvar().disabled).toBe(false);
    await act(async () => { salvar().click(); });
    await tick(200);

    const patch = pedidos.find((p) => p.method === "PATCH");
    expect(patch).toEqual({
      url: "/api/kit/remessas/rem-1",
      method: "PATCH",
      body: {
        versao: "V1", solicitante: "Kaio", entregaMaterial: "2026-11-25",
        dataEvento: "2026-11-29", cargaCaminhao: "2026-11-21", saidaCaminhao: "2026-11-22",
      },
    });
    // Nenhuma criação nem importação no caminho da edição.
    expect(pedidos.some((p) => p.method === "POST")).toBe(false);
    expect(document.body.textContent).toContain("Remessa KIT V1 atualizada");
    expect(document.body.textContent).toContain("Os prazos das 2 peças desta remessa já seguem as datas novas.");
  });
});
