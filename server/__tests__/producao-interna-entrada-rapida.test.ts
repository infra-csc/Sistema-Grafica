// @vitest-environment jsdom
//
// ─────────────────────────────────────────────────────────────────────────────
// PRODUÇÃO INTERNA NA ENTRADA RÁPIDA (dono, 07/10: "uma coluna com uma caixinha
// 'Gráfica' em cada linha, mais o campo de instruções, para lançar várias peças
// internas de uma vez").
//
// A grade MONTADA (components/bulk-item-entry.tsx), conferindo:
//   · a coluna "Gráfica" só existe para quem pode marcar (admin|Solicitação —
//     o modal passa mostraCampoProducaoInterna);
//   · marcar a caixinha abre, logo abaixo da linha, as instruções e o arquivo;
//     sem instrução, a linha avisa — mas o rascunho NÃO trava;
//   · molde e reaproveitamento total não marcam (caixinha bloqueada);
//   · a revisão do lote conta as marcadas e mostra o selo nelas;
//   · o corpo enviado leva producaoInterna + instrucoesGrafica (+ arquivo
//     colado) — o MESMO corpo do formulário de uma peça.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, afterEach, vi } from "vitest";
import * as React from "react";
import { readFileSync } from "fs";
import path from "path";
import { render, act, cleanup, fireEvent } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";

const h = React.createElement;
vi.setConfig({ testTimeout: 120_000 });

const avisos: { title?: string; description?: string; variant?: string }[] = [];
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: (t: any) => { avisos.push(t); }, dismiss: () => {}, toasts: [] }), toast: (t: any) => { avisos.push(t); } }));

const $ = (sel: string) => document.querySelector<HTMLElement>(sel);
const tid = (id: string) => $(`[data-testid="${id}"]`);
const tick = (ms = 0) => act(() => new Promise<void>((r) => setTimeout(r, ms)));

function prepararJsdom(largura: number) {
  Object.defineProperty(window, "innerWidth", { value: largura, configurable: true });
  Object.defineProperty(window, "innerHeight", { value: 900, configurable: true });
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: /max-width:\s*767px/.test(q) && largura < 768, media: q, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false; },
  }));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("IntersectionObserver", class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } });
  vi.stubGlobal("fetch", vi.fn(async () => new Response("[]", { status: 200, headers: { "content-type": "application/json" } })));
  (Element.prototype as any).scrollIntoView = () => {};
  (Element.prototype as any).hasPointerCapture = () => false;
  (Element.prototype as any).releasePointerCapture = () => {};
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); avisos.length = 0; });

// Um modelo completo: escolher o tipo preenche medidas, material e acabamento
// — a linha fica válida sem passar pelos menus.
const MODELOS = [
  { id: "m1", name: "Faixa", type: "Faixa", area: 2, visual: 0.5, visualWidth: 2, visualHeight: 0.5, fileWidth: 2, fileHeight: 0.5, material: "Lona", finish: "Ilhós" },
  { id: "m2", name: "Molde", type: "Molde", area: 1, visual: 1, visualWidth: 1, visualHeight: 1, fileWidth: 1, fileHeight: 1, material: "Lona", finish: "Refile" },
];
const INSTR = "Faixa 2x0,5 m em lona, texto FILA DO CREDENCIAMENTO";
const CAMINHO = String.raw`\\10.100.1.7\TTKGrafica\INTERNO\Faixa_fila.pdf`;

async function montar({ podeProducaoInterna = true, largura = 1366 } = {}) {
  prepararJsdom(largura);
  const { queryClient } = await import("@/lib/queryClient");
  const { BulkItemEntry } = await import("@/components/bulk-item-entry");
  queryClient.clear();
  queryClient.setQueryData(["/api/catalog-options"], []);
  const onSubmit = vi.fn();
  await act(async () => {
    render(h(QueryClientProvider, { client: queryClient } as any, h(BulkItemEntry as any, {
      eventId: "e1", standardItems: MODELOS, sponsors: [], existingItems: [],
      onSubmit, onCancel: () => {}, podePriorizar: podeProducaoInterna, podeProducaoInterna,
    })));
  });
  await tick(50);
  return { onSubmit };
}

/** Escolhe o tipo da linha pelo teclado (digita e Enter), como na grade de verdade. */
async function escolherTipo(ri: number, tipo: string) {
  const el = $(`[data-nav-row="${ri}"][data-nav-field="0"]`) as HTMLInputElement;
  await act(async () => { fireEvent.focus(el); fireEvent.change(el, { target: { value: tipo } }); });
  await act(async () => { fireEvent.keyDown(el, { key: "Enter" }); });
}
async function digitar(id: string, valor: string) {
  await act(async () => { fireEvent.change(tid(id)!, { target: { value: valor } }); });
}
async function novaLinha() { await act(async () => { fireEvent.click(tid("button-add-row")!); }); }

describe("a coluna 'Gráfica' da Entrada rápida", () => {
  it("só aparece para quem pode marcar (admin|Solicitação)", async () => {
    await montar({ podeProducaoInterna: false });
    expect(tid("checkbox-grafica-0")).toBeNull();
    expect(Array.from(document.querySelectorAll("th")).some((th) => th.textContent === "Gráfica")).toBe(false);
    cleanup();
    await montar({ podeProducaoInterna: true });
    expect(tid("checkbox-grafica-0")).not.toBeNull();
    expect(Array.from(document.querySelectorAll("th")).some((th) => th.textContent === "Gráfica")).toBe(true);
  });

  it("o modal passa o gate do formulário (mostraCampoProducaoInterna) para a grade", async () => {
    const fonte = readFileSync(path.resolve(__dirname, "../../client/src/components/detalhe-do-evento/modal-de-entrada-de-pecas.tsx"), "utf8");
    expect(fonte).toContain("podeProducaoInterna={mostraCampoProducaoInterna(user?.role)}");
    const { mostraCampoProducaoInterna } = await import("@shared/producao-interna");
    expect(mostraCampoProducaoInterna("solicitacao")).toBe(true);
    expect(mostraCampoProducaoInterna("admin")).toBe(true);
    for (const papel of ["arte", "atendimento", "grafica", undefined]) expect(mostraCampoProducaoInterna(papel)).toBe(false);
  });

  it("marcar abre as instruções logo abaixo da linha; sem instrução, avisa — sem travar", async () => {
    await montar();
    await escolherTipo(0, "Faixa");
    expect(tid("linha-grafica-0")).toBeNull();
    await act(async () => { fireEvent.click(tid("checkbox-grafica-0")!); });
    const bloco = tid("linha-grafica-0")!;
    expect(bloco).not.toBeNull();
    // logo abaixo: a <tr> seguinte à da linha
    expect(tid("linha-lote-0")!.nextElementSibling).toBe(bloco);
    expect(tid("textarea-instrucoes-grafica-0")).not.toBeNull();
    expect(tid("input-arquivo-grafica-0")).not.toBeNull();
    expect(tid("aviso-instrucoes-grafica-0")?.textContent).toMatch(/pelo menos 10 letras/);
    // o campo Obs da linha continua sendo o Obs (não é a instrução)
    expect(tid("input-observations-0")).not.toBeNull();
    await digitar("textarea-instrucoes-grafica-0", INSTR);
    expect(tid("aviso-instrucoes-grafica-0")).toBeNull();
    // com o arquivo colado, a instrução vira opcional
    await digitar("textarea-instrucoes-grafica-0", "");
    await digitar("input-arquivo-grafica-0", CAMINHO);
    expect(tid("aviso-instrucoes-grafica-0")).toBeNull();
    expect(bloco.textContent).toContain("(opcional)");
    // desmarcar fecha o bloco
    await act(async () => { fireEvent.click(tid("checkbox-grafica-0")!); });
    expect(tid("linha-grafica-0")).toBeNull();
  });

  it("molde não marca: a caixinha fica bloqueada", async () => {
    await montar();
    await escolherTipo(0, "Molde");
    expect((tid("checkbox-grafica-0") as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { fireEvent.click(tid("checkbox-grafica-0")!); });
    expect(tid("linha-grafica-0")).toBeNull();
  });

  it("linha marcada que vira reaproveitamento: o bloco diz o porquê e o envio para com a linha", async () => {
    const { onSubmit } = await montar();
    await escolherTipo(0, "Faixa");
    await act(async () => { fireEvent.click(tid("checkbox-grafica-0")!); });
    await act(async () => { fireEvent.click(tid("button-reuse-0")!); });
    expect(tid("motivo-grafica-0")?.textContent).toMatch(/reaproveitamento/i);
    await act(async () => { fireEvent.click(tid("button-submit-bulk")!); });
    expect(avisos.at(-1)?.title).toMatch(/^Linha 1:/);
    expect(tid("button-confirm-duplicates")).toBeNull();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("revisão conta as marcadas e mostra o selo; o corpo leva a marca, a instrução e o arquivo", async () => {
    const { onSubmit } = await montar();
    // 1: marcada com instrução · 2: marcada sem nada (aviso) · 3: comum
    await escolherTipo(0, "Faixa");
    await digitar("input-description-0", "Fila do credenciamento");
    await act(async () => { fireEvent.click(tid("checkbox-grafica-0")!); });
    await digitar("textarea-instrucoes-grafica-0", INSTR);
    await digitar("input-arquivo-grafica-0", CAMINHO);
    await novaLinha();
    await escolherTipo(1, "Faixa");
    await digitar("input-description-1", "Área de staff");
    await act(async () => { fireEvent.click(tid("checkbox-grafica-1")!); });
    await novaLinha();
    await escolherTipo(2, "Faixa");
    await digitar("input-description-2", "Patrocinador master");
    expect(tid("aviso-instrucoes-grafica-1")).not.toBeNull();
    expect(tid("linha-grafica-2")).toBeNull();

    await act(async () => { fireEvent.click(tid("button-submit-bulk")!); });
    await tick(50);
    const resumo = tid("revisao-lote-diretas");
    expect(resumo?.textContent).toContain("2 de 3 vão direto para a Gráfica");
    expect(tid("revisao-lote-diretas-sem-instrucao")?.textContent).toMatch(/^1 está sem arquivo e sem instruções/);
    expect(document.querySelectorAll('[data-testid="selo-producao-interna"]').length).toBe(2);
    expect(document.body.textContent).toContain("as marcadas vão para a Gráfica no envio");
    expect(document.body.textContent).toContain("sem instruções — fica no rascunho no envio");

    await act(async () => { fireEvent.click(tid("button-confirm-duplicates")!); });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const [pecas] = onSubmit.mock.calls[0];
    expect(pecas).toHaveLength(3);
    expect(pecas[0]).toMatchObject({ type: "Faixa", producaoInterna: true, instrucoesGrafica: INSTR, finalFileUrl: CAMINHO, finalFileName: "Faixa_fila.pdf" });
    expect(pecas[1]).toMatchObject({ producaoInterna: true, instrucoesGrafica: null });
    expect(pecas[1]).not.toHaveProperty("finalFileUrl");
    expect(pecas[2]).toEqual(expect.objectContaining({ producaoInterna: false }));
    expect(pecas[2]).not.toHaveProperty("instrucoesGrafica");
    // a OBS segue a dela: não recebeu a instrução
    expect(pecas[0].observations).toBe("");
  });

  it("sem a coluna (papel sem permissão), o corpo não leva a marca", async () => {
    const { onSubmit } = await montar({ podeProducaoInterna: false });
    await escolherTipo(0, "Faixa");
    await act(async () => { fireEvent.click(tid("button-submit-bulk")!); });
    await tick(50);
    expect(tid("revisao-lote-diretas")).toBeNull();
    await act(async () => { fireEvent.click(tid("button-confirm-duplicates")!); });
    expect(onSubmit.mock.calls[0][0][0]).not.toHaveProperty("producaoInterna");
  });
});
