// @vitest-environment jsdom
//
// EXCLUIR FOTO DE ENTREGA PERGUNTA ANTES (15/10). O botão da galeria apagava
// na hora, sem volta — o único "Excluir" do app sem confirmação. Agora:
//   · o clique abre a confirmação da casa, com a miniatura da foto, quem
//     enviou, e "Excluir foto" no vermelho de perigo;
//   · Esc e "Manter" não apagam (nenhum DELETE sai);
//   · só "Excluir foto" chama DELETE /api/photos/:id.
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import * as React from "react";
import { render, act, cleanup, fireEvent } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";

const h = React.createElement;
// Tela montada de verdade: na suíte inteira (máquina ocupada) passa dos 5 s padrão.
vi.setConfig({ testTimeout: 60_000 });
const H = vi.hoisted(() => ({ chamadas: [] as Array<{ metodo: string; url: string }> }));
const FOTO = { id: "f1", itemId: "i1", photoUrl: "data:image/png;base64,iVBORw0KGgo=", uploadedBy: "Joana da Gráfica", createdAt: "2026-10-14T13:30:00.000Z" };

beforeAll(() => {
  const real = window.getComputedStyle.bind(window);
  vi.stubGlobal("getComputedStyle", (el: Element, pe?: string | null) => {
    const base = real(el, pe ?? undefined);
    return new Proxy(base, {
      get(t, p) {
        if (p === "animationName") return "none";
        const v = Reflect.get(t, p);
        return typeof v === "function" ? v.bind(t) : v;
      },
    });
  });
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false; },
  }));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("fetch", async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url).split("?")[0];
    const metodo = (init?.method || "GET").toUpperCase();
    H.chamadas.push({ metodo, url: u });
    const corpo = u === "/api/items/i1/photos" && metodo === "GET" ? [FOTO] : {};
    return new Response(JSON.stringify(corpo), { status: 200, headers: { "content-type": "application/json" } });
  });
});

beforeEach(() => { cleanup(); H.chamadas.length = 0; });

async function tick(ms = 60) { await act(async () => { await new Promise((r) => setTimeout(r, ms)); }); }
const porTestId = (id: string) => document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
async function esperar<T>(ler: () => T | null | undefined | false, ms = 6000): Promise<T | null> {
  const fim = Date.now() + ms;
  for (;;) {
    const v = ler();
    if (v) return v;
    if (Date.now() > fim) return null;
    await tick(50);
  }
}
const deletes = () => H.chamadas.filter((c) => c.metodo === "DELETE");

async function montar() {
  const { queryClient } = await import("@/lib/queryClient");
  const { DeliveryPhotoGallery } = await import("@/components/delivery-photo-gallery");
  queryClient.clear();
  render(h(QueryClientProvider, { client: queryClient }, h(DeliveryPhotoGallery, { itemId: "i1" })));
  expect(await esperar(() => porTestId("button-delete-photo-f1")), "a foto não apareceu").toBeTruthy();
}
async function pedirExclusao() {
  await act(async () => { porTestId("button-delete-photo-f1")!.click(); });
  return esperar(() => porTestId("confirmacao"));
}

describe("galeria de fotos de entrega: excluir pede confirmação", () => {
  it("o clique abre a pergunta com a miniatura, quem enviou e 'Excluir foto' em perigo — sem apagar", async () => {
    await montar();
    const dialogo = await pedirExclusao();
    expect(dialogo, "a confirmação não abriu").toBeTruthy();
    expect(dialogo!.textContent).toContain("Excluir esta foto de entrega?");
    expect(dialogo!.textContent).toContain("Joana da Gráfica");
    expect((porTestId("confirmacao-miniatura-foto") as HTMLImageElement).getAttribute("src")).toBe(FOTO.photoUrl);
    const confirmar = porTestId("confirmacao-confirmar")!;
    expect(confirmar.textContent).toBe("Excluir foto");
    // variante perigo do Botao: fundo #b91c1c (TOM.perigo.text)
    expect(confirmar.style.backgroundColor).toBe("rgb(185, 28, 28)");
    expect(deletes()).toHaveLength(0);
  });

  it("Esc e 'Manter' fecham sem apagar", async () => {
    await montar();
    await pedirExclusao();
    await act(async () => { fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" }); });
    expect(await esperar(() => !porTestId("confirmacao"))).toBe(true);
    expect(deletes()).toHaveLength(0);

    await pedirExclusao();
    await act(async () => { porTestId("confirmacao-cancelar")!.click(); });
    expect(await esperar(() => !porTestId("confirmacao"))).toBe(true);
    await tick(100);
    expect(deletes()).toHaveLength(0);
  });

  it("só 'Excluir foto' apaga — DELETE /api/photos/f1", async () => {
    await montar();
    await pedirExclusao();
    await act(async () => { porTestId("confirmacao-confirmar")!.click(); });
    expect(await esperar(() => deletes().length > 0)).toBe(true);
    expect(deletes()).toEqual([{ metodo: "DELETE", url: "/api/photos/f1" }]);
  });
});
