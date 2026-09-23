// @vitest-environment jsdom
//
// ─────────────────────────────────────────────────────────────────────────────
// O TUBO COMO UM TODO NOS REGISTROS (dono, 21/09: "inclusive isso aparecer nos
// registros: todos os itens que foram no tubo").
//
// O que este arquivo pina:
//   · UMA entrada por tubo (não a mesma foto repetida em cada peça), com a frase
//     inteira: "Tubo 2 · entregue a Fulano em … · 4 peças / 61 un.";
//   · aberta, mostra TUDO o que foi junto (código, tipo + descrição, a quantidade
//     NAQUELE tubo e "(7 de 10)"), as fotos da embalagem e o comprovante;
//   · a embalada SOZINHA tem o registro dela, sem a palavra "tubo";
//   · segue o filtro de evento e a busca da página; na FICHA, só os volumes da peça;
//   · sem tubo nenhum (ou com erro), não ocupa espaço;
//   · servidor: rota só de leitura, aberta a todos os perfis com o recorte do Kit,
//     sem N+1, e o conteúdo do tubo entregue não muda (a quantidade mora na linha);
//   · Histórico e ficha reconhecem a embalada sozinha e a embalagem desfeita.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, afterEach, vi } from "vitest";
import { fonteDoComponente } from "./fonte-dos-componentes";
import * as React from "react";
import { readFileSync } from "fs";
import path from "path";
import { render, act, cleanup, fireEvent } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";

const h = React.createElement;
const $ = (sel: string) => document.querySelector<HTMLElement>(sel);
const $$ = (sel: string) => Array.from(document.querySelectorAll<HTMLElement>(sel));
const tick = (ms = 0) => act(() => new Promise<void>((r) => setTimeout(r, ms)));

const item = (id: string, displayId: string, quantidadeNoTubo: number, quantity = quantidadeNoTubo, description = "Nubank") => ({ id, displayId, type: "2x1", description, quantity, quantidadeNoTubo });
const REGISTROS = [
  { id: "t2", numero: 2, avulso: false, eventId: "e1", eventName: "Maratona", fotos: ["/objects/a.jpg", "/objects/b.jpg"], embaladoEm: "2026-09-21T16:00:00Z", embaladoPor: "Ana",
    entregueEm: "2026-09-21T17:32:00Z", recebidoPor: "Fulano", entreguePor: "Ana", comprovante: "/objects/comp.jpg", observacao: "portaria",
    itens: [item("i1", "#0381", 7, 10), item("i2", "#0382", 50, 50, "Itaú"), item("i3", "#0383", 2), item("i4", "#0384", 2)], unidades: 61 },
  { id: "av", numero: -1, avulso: true, eventId: "e2", eventName: "Circuito", fotos: ["/objects/p.jpg"], embaladoEm: "2026-09-21T15:00:00Z", embaladoPor: "Bia",
    entregueEm: null, recebidoPor: null, entreguePor: null, comprovante: null, observacao: null, itens: [{ ...item("i9", "#0390", 1), type: "Pórtico", description: "Largada" }], unidades: 1 },
];

async function montar(props: Record<string, unknown> = {}, largura = 1280, resposta: () => Response = () => new Response(JSON.stringify(REGISTROS), { status: 200, headers: { "content-type": "application/json" } })) {
  Object.defineProperty(window, "innerWidth", { value: largura, configurable: true });
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: largura < 768 && /max-width:\s*767px/.test(q), media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false; } }));
  vi.stubGlobal("fetch", vi.fn(async () => resposta()));
  const { queryClient } = await import("@/lib/queryClient");
  const { RegistrosDeTubos } = await import("@/components/registros-de-tubos");
  queryClient.clear();
  await act(async () => { render(h(QueryClientProvider, { client: queryClient } as any, h(RegistrosDeTubos as any, props))); });
  for (let i = 0; i < 40 && !$('[data-testid="registros-de-tubos"]'); i++) await tick(25);
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("uma entrada por tubo, com tudo o que foi junto", () => {
  it("CARTÃO COM FOTO como os da galeria (dono, 22/09); aberto: a lista completa com a quantidade NAQUELE tubo, as fotos e o comprovante", async () => {
    const onAbrirPeca = vi.fn();
    await montar({ onAbrirPeca });
    expect($$('[data-testid^="registro-tubo-"]').length, "um cartão por tubo — não um por peça").toBe(2);
    const cartao = $('[data-testid="registro-tubo-t2"]')!;
    // A capa é a 1ª foto da embalagem, num quadrado, com o selo do tipo e o
    // nome do volume por cima — a mesma leitura dos cartões de conferência.
    const capa = cartao.querySelector<HTMLImageElement>('[data-testid="ampliar-registro-tubo-t2"] img')!;
    expect(capa.getAttribute("src")).toBe("/objects/a.jpg");
    expect(capa.getAttribute("loading")).toBe("lazy");
    expect(cartao.textContent).toContain("Entrega");
    expect(cartao.textContent).toContain("Tubo 2");
    expect(cartao.textContent).toContain("4 peças / 61 un.");
    expect(cartao.textContent).toContain("Entregue a Fulano em");
    expect(cartao.textContent, "2 da embalagem + o comprovante").toContain("3 fotos");
    expect(cartao.querySelector('a[href="/eventos/e1"]')!.textContent).toBe("Maratona");
    // A frase inteira continua no cartão para leitor de tela e busca do navegador.
    expect(cartao.textContent).toMatch(/Tubo 2 · entregue a Fulano em \d{2}\/\d{2},? \d{2}:\d{2} · 4 peças \/ 61 un\./);

    const abrir = $('[data-testid="abrir-registro-tubo-t2"]')!;
    expect(abrir.textContent).toContain("Ver o que foi junto (4)");
    expect(abrir.getAttribute("aria-expanded")).toBe("false");
    expect($('[data-testid="conteudo-registro-tubo-t2"]')).toBeNull();
    await act(async () => { fireEvent.click(abrir); });
    const c = $('[data-testid="conteudo-registro-tubo-t2"]')!;
    expect(c.querySelectorAll("li").length).toBe(4);
    expect(c.textContent).toContain("2x1 — Nubank7 un. (7 de 10)");
    expect(c.textContent).toContain("2x1 — Itaú50 un.");
    expect(c.querySelectorAll("img").length, "2 fotos da embalagem + o comprovante").toBe(3);
    expect(c.querySelector('button[aria-label="Comprovante da entrega — Tubo 2 — ampliar"]')).toBeTruthy();
    expect(c.textContent).toContain("Embalado por Ana em");
    expect(c.textContent).toContain("entrega registrada por Ana");
    await act(async () => { fireEvent.click(c.querySelector('button[aria-label="Abrir a ficha de #0382"]')!); });
    expect(onAbrirPeca).toHaveBeenCalledWith("i2");
  }, 30_000);

  it("a foto amplia na lupa, com ← → entre as fotos do volume e o comprovante", async () => {
    await montar();
    await act(async () => { fireEvent.click($('[data-testid="ampliar-registro-tubo-t2"]')!); });
    const lupa = $('[data-testid="zoom-registro-tubo"]')!;
    expect(lupa.querySelector("img")!.getAttribute("src")).toBe("/objects/a.jpg");
    expect(lupa.textContent).toContain("foto 1 de 3");
    await act(async () => { fireEvent.click($('[data-testid="zoom-tubo-proxima"]')!); });
    expect($('[data-testid="zoom-registro-tubo"]')!.querySelector("img")!.getAttribute("src")).toBe("/objects/b.jpg");
    // Volta do fim para o começo: a 3ª é o comprovante.
    await act(async () => { fireEvent.click($('[data-testid="zoom-tubo-proxima"]')!); });
    expect($('[data-testid="zoom-registro-tubo"]')!.querySelector("img")!.getAttribute("src")).toBe("/objects/comp.jpg");
    await act(async () => { fireEvent.click($('button[aria-label="Fechar"]')!); });
    expect($('[data-testid="zoom-registro-tubo"]')).toBeNull();
  }, 30_000);

  it("a embalada SOZINHA tem o registro dela — sem a palavra 'tubo'", async () => {
    await montar();
    const s = $('[data-testid="registro-tubo-av"]')!;
    expect(s.textContent).toContain("#0390 embalada sozinha · embalado por Bia em");
    expect(s.textContent).toContain("aguarda a entrega · 1 peça / 1 un.");
    expect(s.textContent).not.toMatch(/tubo/i);
  }, 30_000);

  it("segue o filtro de evento e a busca da página; na FICHA, só os volumes daquela peça", async () => {
    await montar({ eventIds: ["e2"] });
    expect($$('[data-testid^="registro-tubo-"]').map((e) => e.getAttribute("data-testid"))).toEqual(["registro-tubo-av"]);
    cleanup();
    await montar({ busca: "fulano itau" });
    expect($$('[data-testid^="registro-tubo-"]').map((e) => e.getAttribute("data-testid"))).toEqual(["registro-tubo-t2"]);
    cleanup();
    await montar({ itemId: "i3" });
    expect($('[data-testid="registros-de-tubos"]')!.textContent).toContain("Embalagem — o que foi junto");
    expect($$('[data-testid^="registro-tubo-"]').length).toBe(1);
  }, 30_000);

  it("sem tubo nenhum, ou com erro nesta consulta, não ocupa espaço — a galeria segue sozinha", async () => {
    await montar({ busca: "nada disso existe" });
    expect($('[data-testid="registros-de-tubos"]')).toBeNull();
    cleanup();
    await montar({}, 1280, () => new Response("{}", { status: 500 }));
    await tick(200);
    expect($('[data-testid="registros-de-tubos"]')).toBeNull();
  }, 30_000);

  it("celular: a entrada é um alvo de 56px e o código da peça, de 44", async () => {
    await montar({ onAbrirPeca: () => {} }, 390);
    const cab = $('[data-testid="abrir-registro-tubo-t2"]')!;
    expect(cab.style.minHeight).toBe("56px");
    await act(async () => { fireEvent.click(cab); });
    expect(($('button[aria-label="Abrir a ficha de #0381"]') as HTMLElement).style.minHeight).toBe("44px");
  }, 30_000);
});

describe("onde aparece, e de onde vem (fonte)", () => {
  const RAIZ = path.resolve(__dirname, "../..");
  const ler = (rel: string) => readFileSync(path.resolve(RAIZ, rel), "utf8");
  const ROTAS = ler("server/routes/tubos.ts");
  const rota = ROTAS.slice(ROTAS.indexOf('app.get("/api/registros/tubos"'), ROTAS.indexOf("// Um tubo com o que tem dentro"));

  it("página Registros: acima da galeria, com o filtro de evento e a busca da página; some quando o tipo é só Conferência", () => {
    const R = ler("client/src/pages/registros.tsx");
    // 22/09: o Período da página também vale para os tubos.
    expect(R).toContain("<RegistrosDeTubos eventIds={eventFilter} busca={deferredSearch} desde={desdeDoPeriodo} />");
    expect(R).toContain('{(!kindFilter.length || kindFilter.includes("delivery")) && (');
  });

  it("ficha da peça: a peça que foi em tubo mostra o registro do tubo (o que foi junto)", () => {
    const F = fonteDoComponente("client/src/components/item-details-dialog.tsx");
    expect(F).toContain("{item.tuboId && <RegistrosDeTubos itemId={item.id} />}");
    expect(F).toContain("|| !!item.receivedBy || !!item.tuboId;");
  });

  it("servidor: só leitura, aberta a todos os perfis (é a tela de Registros) com o recorte do Kit, sem N+1", () => {
    expect(rota).toContain('app.get("/api/registros/tubos", requireAuth, async (req, res) => {');
    expect(rota).not.toContain("podeMexerEmTubo(req)");
    expect(rota).toContain("const visivel = new Map(visiveis(req, cruas).map((p) => [p.id, p]));");
    expect(rota).toContain(".filter((t) => !doKit || t.itens.length > 0)");
    // tubos (a consulta com recorte), eventos, peças (+ as linhas, num select só, em linhasDosTubos)
    expect(rota).toContain("const consulta = db.select().from(tubos).where(and(...filtros))");
    expect(rota.match(/await db\.select/g)?.length).toBe(2);
    // 22/09: recortada e paginada — nunca a história inteira
    expect(rota).toContain("const lista = (cortaNoBanco ? await consulta.limit(limite) : await consulta) as any[];");
    expect(rota).toContain(".slice(0, limite);");
    expect(rota).toContain("Math.min(limiteBruto, 500) : 48;");
    expect(rota).not.toMatch(/db\.(update|insert|delete)/);
  });

  it("o conteúdo do tubo entregue não muda: a quantidade mora na LINHA, tubo entregue não aceita mexer, e a trilha guarda a lista", () => {
    expect(rota).toContain("quantidadeNoTubo: l.quantidade");
    expect(rota).toContain("excluida: !!p.deletedAt");
    expect(ROTAS).toContain("já foi entregue — não dá para mexer no que tem dentro");
    expect(ROTAS).toContain('aEntregar.map(({ p, l }) => `${p.displayId ?? "peça"} (${l.quantidade})`).join(", ")');
  });

  it("Histórico e ficha reconhecem a embalada SOZINHA e a embalagem desfeita (as frases novas da trilha)", () => {
    const T = ler("client/src/lib/timeline.ts");
    expect(T).toContain('if (detailsLower.includes("embalada no tubo") || detailsLower.startsWith("embalada (sozinha)")) {');
    expect(T).toContain('if (detailsLower.startsWith("retirada do tubo") || detailsLower.startsWith("embalagem desfeita")) {');
    expect(fonteDoComponente("client/src/components/item-details-dialog.tsx")).toContain('match: d => d.includes("embalada no tubo") || d.startsWith("embalada (sozinha)") },');
    // …e o servidor escreve exatamente essas frases
    expect(ROTAS).toContain("`Embalada (sozinha)${quanto}${comFoto}`");
    expect(ROTAS).toContain("`Embalagem desfeita — ${l.quantidade} un. voltaram a Conferido${motivo ? ` (${motivo})` : \"\"}`");
  });
});

describe("a frase e a busca (puras)", () => {
  it("fraseDoRegistro e registroCasa", async () => {
    const { fraseDoRegistro, registroCasa } = await import("@/components/registros-de-tubos");
    expect(fraseDoRegistro(REGISTROS[0] as any)).toMatch(/^Tubo 2 · entregue a Fulano em .+ · 4 peças \/ 61 un\.$/);
    expect(fraseDoRegistro({ ...REGISTROS[0], entregueEm: null, recebidoPor: null } as any)).toMatch(/^Tubo 2 · embalado por Ana em .+ — aguarda a entrega · 4 peças \/ 61 un\.$/);
    expect(registroCasa(REGISTROS[0] as any, "TUBO 2 maratona")).toBe(true);
    expect(registroCasa(REGISTROS[1] as any, "portico sozinha")).toBe(true);
    expect(registroCasa(REGISTROS[1] as any, "fulano")).toBe(false);
  });
});
