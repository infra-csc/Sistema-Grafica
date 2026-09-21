// @vitest-environment jsdom
//
// ─────────────────────────────────────────────────────────────────────────────
// TUBOS — TRÊS MODAIS FOCADOS (dono, 21/09: "este modal do tubo está
// extremamente confuso"). MONTADOS, no desktop e a 390px.
//
// ANTES: um modal só mostrava o bloco "Embalar #0386", a lista "Peças sem tubo"
// com caixas (inclusive de outra peça), "Pôr as 2 marcadas em", a lista de
// tubos e um rodapé "Escolha o tubo". DEPOIS, o que este arquivo pina:
//   1. EMBALAR — só as peças que estão sendo embaladas e a FOTO. O tubo é
//      AUTOMÁTICO ("não precisa selecionar"): a peça individual vai SOZINHA
//      (volume avulso, sem "Tubo N"); o lote vai num tubo automático (reusa o
//      aberto vazio, senão o próximo número). A única porta para escolher é o
//      link "Pôr num tubo que já existe".
//   2. ENTREGAR TUBO N — a lista do que está dentro, as fotos, quem recebeu
//      (com a sugestão do último), comprovante SEMPRE opcional; a embalada
//      sozinha é "Entregar #0386 — …", nunca "tubo"; se falta conferir,
//      explica e NÃO mostra o formulário.
//   3. PAINEL — gestão: tubos abertos, entregues recolhidos, ações por tubo,
//      apagar com confirmação, e a porta "Embalar peças conferidas (N)" — sem
//      "Peças sem tubo" nem "Pôr as marcadas em".
//   · Um modal por vez; fechar o que o painel abriu volta ao painel.
//   · Celular: 44px, campos 16px, letra ≥ 12, rodapé com safe-area, câmera
//     direta, teclado não esconde o botão.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, afterEach, vi } from "vitest";
import * as React from "react";
import { render, act, cleanup, fireEvent } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";

const h = React.createElement;
let papel: { role: string; kit?: boolean } = { role: "admin" };
vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: { id: "u1", name: "Operador", email: "g@g", mustChangePassword: false, ...papel }, isLoading: false, logout: () => {} }),
}));

const $ = (sel: string) => document.querySelector<HTMLElement>(sel);
const $$ = (sel: string) => Array.from(document.querySelectorAll<HTMLElement>(sel));
const tick = (ms = 0) => act(() => new Promise<void>((r) => setTimeout(r, ms)));
const px = (v: string | null | undefined) => { const m = String(v ?? "").match(/^(-?\d+(?:\.\d+)?)px$/); return m ? Number(m[1]) : NaN; };
const maior = (...vs: number[]) => { const ok = vs.filter((v) => !Number.isNaN(v)); return ok.length ? Math.max(...ok) : NaN; };
const visivel = (el: Element) => { for (let e: Element | null = el; e; e = e.parentElement) if (e.classList.contains("sr-only") || e.classList.contains("hidden")) return false; return true; };
const nome = (el: Element) => (el.getAttribute("data-testid") || el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 40);

/** A régua do celular: alvos ≥ 44, campos ≥ 16px, letra ≥ 12px. */
function reguaDoCelular(raiz: ParentNode) {
  const ruins: string[] = [];
  for (const el of Array.from(raiz.querySelectorAll<HTMLElement>('button, a[href], input:not([type="file"]):not([type="checkbox"])'))) {
    if (!visivel(el) || el.getAttribute("title") === "Fechar (Esc)") continue;
    if (el.parentElement?.className.includes("[&>button:last-child]:hidden") && el === el.parentElement.lastElementChild) continue;
    if (el.getAttribute("data-testid") === "button-upload-photo") { if (!/min-h-\[44px\]/.test(el.className)) ruins.push(`uploader ${nome(el)}`); continue; }
    if (!(maior(px(el.style.minHeight), px(el.style.height)) >= 44)) ruins.push(`alvo ${nome(el)}`);
    if (el.tagName === "INPUT" && !(px(el.style.fontSize) >= 16)) ruins.push(`campo ${nome(el)}`);
  }
  for (const el of Array.from(raiz.querySelectorAll<HTMLElement>("*"))) {
    if (px(el.style.fontSize) < 12 && visivel(el) && Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? "").trim().length > 1)) ruins.push(`letra ${nome(el)}`);
    if (el.style.textOverflow === "ellipsis" && el.style.whiteSpace === "nowrap") ruins.push(`reticências ${nome(el)}`);
  }
  return ruins;
}

function prepararJsdom(largura: number) {
  Object.defineProperty(window, "innerWidth", { value: largura, configurable: true });
  Object.defineProperty(window, "innerHeight", { value: 760, configurable: true });
  const vv = new EventTarget() as any;
  Object.assign(vv, { height: 760, width: largura, offsetTop: 0, offsetLeft: 0, scale: 1 });
  Object.defineProperty(window, "visualViewport", { value: vv, configurable: true });
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: largura < 768 && /max-width:\s*767px/.test(q), media: q, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false; },
  }));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  (Element.prototype as any).scrollIntoView = () => {};
  (Element.prototype as any).hasPointerCapture = () => false;
  (Element.prototype as any).releasePointerCapture = () => {};
  return vv;
}

// ── Dados: três tubos (pronto com foto · falta conferir · entregue) e três sem tubo ──
const p = (id: string, displayId: string, conferida: boolean, extra: Record<string, unknown> = {}) => ({
  id, displayId, type: "2x1", description: "Ministério da Saúde", quantity: 16, status: conferida ? "conferred" : "produced",
  conferredQty: conferida ? 16 : 0, deliveredQty: 0, embaladaQty: 0, aEmbalar: conferida ? 16 : 0, quantidadeNoTubo: 16, conferida, entregue: false, ...extra,
});
const tubo = (id: string, numero: number, pecas: any[], extra: Record<string, unknown> = {}) => ({
  id, numero, entregueEm: null, recebidoPor: null, entreguePor: null, fotoEntregaUrl: null, fotosFechamento: [] as string[], fechadoEm: null, fechadoPor: null,
  alteradoDepoisDaFoto: false, pecas, faltamConferir: pecas.filter((x) => !x.conferida).map((x) => x.displayId),
  prontoParaEntregar: pecas.length > 0 && pecas.every((x) => x.conferida), ...extra,
});
const EVENTO = { id: "ev1", name: "teste 3" };
function retrato(mudar: (r: any) => void = () => {}) {
  const r = {
    evento: EVENTO,
    tubos: [
      tubo("t1", 1, [p("a1", "#0383", true), p("a2", "#0384", true)], { fotosFechamento: ["/objects/f1.jpg", "/objects/f2.jpg"], fechadoEm: "2026-09-21T17:32:00Z", fechadoPor: "Operador" }),
      tubo("t2", 2, [p("b1", "#0385", false)]),
      tubo("t3", 3, [p("c1", "#0380", true, { entregue: true })], { entregueEm: "2026-09-20T12:00:00Z", recebidoPor: "Carlos", prontoParaEntregar: false }),
      // embalada SOZINHA (volume avulso: número negativo, nunca "Tubo N")
      tubo("av1", -1, [p("z1", "#0390", true, { type: "Placa de octanorme", description: null, quantity: 1, conferencePhotoUrl: "/objects/conf-z1.jpg" })], { avulso: true, fotosFechamento: ["/objects/av.jpg"] }),
    ],
    semTubo: [p("s1", "#0386", true), p("s2", "#0381", true), p("s3", "#0382", false)],
  };
  mudar(r);
  return r;
}

let chamadas: Array<{ metodo: string; url: string; corpo: any }> = [];
async function montar(props: Record<string, unknown>, largura = 1280, dados = retrato()) {
  const vv = prepararJsdom(largura);
  chamadas = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const metodo = init?.method ?? "GET";
    if (metodo !== "GET") chamadas.push({ metodo, url: String(url), corpo: init?.body ? JSON.parse(String(init.body)) : null });
    const enviado = init?.body ? JSON.parse(String(init.body)) : {};
    const corpo = metodo === "GET" ? dados : { ok: true, numero: enviado.avulso ? -2 : /tubos$/.test(String(url)) ? 4 : 1, avulso: !!enviado.avulso || /\/av1\//.test(String(url)), entregues: 2, fotos: 1, totalDeFotos: 3 };
    return new Response(JSON.stringify(corpo), { status: 200, headers: { "content-type": "application/json" } });
  }));
  const { queryClient } = await import("@/lib/queryClient");
  const { TubosDialog } = await import("@/components/tubos-dialog");
  queryClient.clear();
  queryClient.setQueryData(["/api/events/ev1/tubos"], dados);
  const onClose = vi.fn();
  await act(async () => { render(h(QueryClientProvider, { client: queryClient } as any, h(TubosDialog as any, { evento: EVENTO, onClose, ...props }))); });
  await tick(30);
  return { vv, onClose };
}
const clicar = (sel: string) => act(async () => { fireEvent.click($(sel)!); });
/** Simula a foto enviada: o uploader real fala com o storage; aqui interessa o estado do modal. */
vi.mock("@/components/ObjectUploader", () => ({
  ObjectUploader: ({ onComplete, children, capture, buttonClassName }: any) =>
    h("button", { type: "button", "data-testid": "button-upload-photo", "data-capture": capture ? "sim" : "nao", className: buttonClassName, onClick: () => onComplete({ url: `/objects/nova-${Math.random().toString(36).slice(2, 8)}.jpg` }) }, children),
}));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); papel = { role: "admin" }; });

for (const largura of [1280, 390]) {
  const onde = largura === 390 ? "390px" : "desktop";

  describe(`1 · EMBALAR (${onde})`, () => {
    it("só o que interessa: título, a peça DESTE embalar e a foto — sem passo de tubo, sem 'Peças sem tubo', sem gestão", async () => {
      await montar({ itensIniciais: ["s1"] }, largura);
      expect($$('[role="dialog"]').length, "um modal por vez").toBe(1);
      const m = $('[data-testid="modal-embalar"]')!;
      expect(m.textContent).toContain("Embalar #0386");
      expect(m.textContent).toContain("Tire a foto — a peça fica Embalada até ser entregue");
      // a linha da peça + o campo "Quantas" (padrão: tudo o que está conferido e não embalado) + o apoio
      expect($('[data-testid="embalar-pecas"]')!.textContent).toContain("2x1 Ministério da Saúde");
      expect(($('[data-testid="quantas-s1"]') as HTMLInputElement).value).toBe("16");
      expect($('[data-testid="apoio-s1"]')!.textContent).toBe("16 conferidas de 16 · 0 embaladas");
      // a OUTRA conferida sem tubo (#0381) não aparece, nem caixa, nem seletor de tubo
      expect(m.textContent).not.toContain("#0381");
      expect(m.querySelector('input[type="checkbox"]')).toBeNull();
      expect(m.querySelector('[role="radiogroup"]'), "individual: NUNCA mostra o passo de tubo por padrão").toBeNull();
      expect(m.textContent).not.toMatch(/Peças sem tubo|marcadas em|Apagar tubo|Etiqueta|1 · Tubo/i);
      if (largura === 390) expect(reguaDoCelular(m)).toEqual([]);
    }, 30_000);

    it("INDIVIDUAL vai SOZINHA: 'Tire a foto' → 'Embalar #0386 · 1 foto'; POST com avulso, sem tocar em tubo nenhum; toast sem 'Tubo'", async () => {
      const { onClose } = await montar({ itensIniciais: ["s1"] }, largura);
      expect($('[data-testid="embalar-tubo-automatico"]')!.textContent).toBe("Vai sozinha — embalagem própria, sem número de tubo.");
      const botao = () => $('[data-testid="confirmar-embalar"]') as HTMLButtonElement;
      // o tubo já está resolvido: o botão começa pedindo a FOTO, não o tubo
      expect(botao().textContent).toBe("Tire a foto");
      expect(botao().disabled).toBe(true);
      expect($$('[data-testid="button-upload-photo"]')[0].getAttribute("data-capture"), "câmera direta primeiro").toBe("sim");
      await act(async () => { fireEvent.click($$('[data-testid="button-upload-photo"]')[0]); });
      expect(botao().textContent).toBe("Embalar #0386 · 16 un. · 1 foto");
      expect(/safe-area-inset-bottom/.test($('[data-testid="rodape-embalar"]')!.style.paddingBottom)).toBe(true);
      expect(px($('button[aria-label="Remover a foto 1"]')!.style.width)).toBe(44);
      // toque duplo não duplica
      await act(async () => { fireEvent.click(botao()); fireEvent.click(botao()); });
      await tick(30);
      expect(chamadas.length).toBe(1);
      expect(chamadas[0]).toMatchObject({ metodo: "POST", url: expect.stringContaining("/api/events/ev1/tubos"), corpo: { itens: [{ id: "s1", quantidade: 16 }], avulso: true } });
      expect(chamadas[0].corpo.fotos.length).toBe(1);
      expect(onClose).toHaveBeenCalled();
    }, 30_000);

    it("LOTE vai junto num tubo AUTOMÁTICO: reusa o tubo aberto VAZIO (sem órfão) e diz qual; o botão resume", async () => {
      await montar({ itensIniciais: ["s1", "s2"] }, largura, retrato((r) => { r.tubos.push(tubo("t5", 5, [])); }));
      const m = $('[data-testid="modal-embalar"]')!;
      expect(m.querySelector('[role="radiogroup"]')).toBeNull();
      expect($('[data-testid="embalar-tubo-automatico"]')!.textContent).toBe("Vai para o Tubo 5 (vazio, já aberto).");
      await act(async () => { fireEvent.click($$('[data-testid="button-upload-photo"]')[0]); });
      expect($('[data-testid="confirmar-embalar"]')!.textContent).toBe("Embalar 32 un. de 2 peças · 1 foto");
      await clicar('[data-testid="confirmar-embalar"]');
      await tick(30);
      expect(chamadas[0]).toMatchObject({ metodo: "PATCH", url: expect.stringContaining("/api/tubos/t5/itens"), corpo: { itens: [{ id: "s1", quantidade: 16 }, { id: "s2", quantidade: 16 }] } });
    }, 30_000);

    it("LOTE sem tubo vazio: cria o PRÓXIMO número numa chamada só (POST com as peças e a foto — nunca avulso)", async () => {
      await montar({ itensIniciais: ["s1", "s2"] }, largura);
      expect($('[data-testid="embalar-tubo-automatico"]')!.textContent).toBe("Vai para o Tubo 4 (novo).");
      await act(async () => { fireEvent.click($$('[data-testid="button-upload-photo"]')[0]); });
      expect($('[data-testid="confirmar-embalar"]')!.textContent).toBe("Embalar 32 un. de 2 peças · 1 foto");
      await clicar('[data-testid="confirmar-embalar"]');
      await tick(30);
      expect(chamadas.length).toBe(1);
      expect(chamadas[0]).toMatchObject({ metodo: "POST", corpo: { itens: [{ id: "s1", quantidade: 16 }, { id: "s2", quantidade: 16 }] } });
      expect(chamadas[0].corpo.avulso).toBeUndefined();
    }, 30_000);

    it("'Pôr num tubo que já existe' é a ÚNICA porta para a escolha: revela o radiogroup só com tubos de verdade que já têm peça", async () => {
      await montar({ itensIniciais: ["s1"] }, largura);
      const link = $('[data-testid="embalar-escolher-tubo"]')!;
      expect(link.textContent).toBe("Pôr num tubo que já existe");
      if (largura === 390) expect(px(link.style.minHeight)).toBe(44);
      await act(async () => { fireEvent.click(link); });
      const grupo = $('[role="radiogroup"]')!;
      expect(grupo.getAttribute("aria-labelledby")).toBe("rotulo-tubo-do-embalar");
      // Tubo 1 e Tubo 2 (têm peça) + a opção padrão; o entregue e a embalada sozinha não são destino
      expect($$('[role="radio"]').map((r) => r.textContent)).toEqual(["Tubo 12 peças · 2 fotos", "Tubo 21 peça · sem foto", "SozinhaEmbalagem própria, sem número de tubo"]);
      expect($('[data-testid="embalar-em-tubo-novo"]')!.getAttribute("aria-checked"), "o automático continua marcado").toBe("true");
      await clicar('[data-testid="embalar-no-tubo-1"]');
      expect($('[data-testid="embalar-conteudo-do-tubo"]')!.textContent).toContain("#0383");
      expect(chamadas, "escolher não grava").toEqual([]);
      await act(async () => { fireEvent.click($$('[data-testid="button-upload-photo"]')[0]); });
      expect($('[data-testid="confirmar-embalar"]')!.textContent).toBe("Embalar 16 un. no Tubo 1 · 1 foto");
      await clicar('[data-testid="confirmar-embalar"]');
      await tick(30);
      expect(chamadas[0]).toMatchObject({ metodo: "PATCH", url: expect.stringContaining("/api/tubos/t1/itens"), corpo: { itens: [{ id: "s1", quantidade: 16 }] } });
      if (largura === 390) for (const r of $$('[role="radio"]')) expect(px(r.style.minHeight)).toBeGreaterThanOrEqual(44);
    }, 30_000);

    it("sem nenhum tubo com peça, o link nem aparece", async () => {
      await montar({ itensIniciais: ["s1", "s2"] }, largura, retrato((r) => { r.tubos = [r.tubos[2]]; }));
      expect($('[data-testid="embalar-escolher-tubo"]')).toBeNull();
      expect($('[data-testid="embalar-tubo-automatico"]')!.textContent).toBe("Vai para o Tubo 4 (novo).");
    }, 30_000);

    it("QUANTAS: embalar só PARTE (7 de 10 conferidas → 5 agora); 'Tudo' devolve o padrão; o botão soma as unidades", async () => {
      await montar({ itensIniciais: ["s1"] }, largura, retrato((r) => { Object.assign(r.semTubo[0], { quantity: 10, conferredQty: 7, embaladaQty: 0, aEmbalar: 7 }); }));
      const campo = () => $('[data-testid="quantas-s1"]') as HTMLInputElement;
      expect(campo().value).toBe("7");
      expect(campo().getAttribute("inputmode")).toBe("numeric");
      expect($('[data-testid="apoio-s1"]')!.textContent).toBe("7 conferidas de 10 · 0 embaladas");
      await act(async () => { fireEvent.change(campo(), { target: { value: "5" } }); });
      expect(campo().value).toBe("5");
      // nunca acima do que está conferido e sem embalar
      await act(async () => { fireEvent.change(campo(), { target: { value: "99" } }); });
      expect(campo().value).toBe("7");
      await act(async () => { fireEvent.change(campo(), { target: { value: "5" } }); });
      await act(async () => { fireEvent.click($$('[data-testid="button-upload-photo"]')[0]); });
      expect($('[data-testid="confirmar-embalar"]')!.textContent).toBe("Embalar #0386 · 5 un. · 1 foto");
      expect($('[data-testid="quantas-tudo-s1"]')!.textContent).toBe("Tudo (7)");
      if (largura === 390) { expect(px(campo().style.fontSize)).toBe(16); expect(px(campo().style.height)).toBe(44); expect(reguaDoCelular($('[data-testid="modal-embalar"]')!)).toEqual([]); }
      await clicar('[data-testid="confirmar-embalar"]');
      await tick(30);
      expect(chamadas[0]).toMatchObject({ metodo: "POST", corpo: { itens: [{ id: "s1", quantidade: 5 }], avulso: true } });
    }, 30_000);

    it("lote: dá para TIRAR uma peça (x de 44px), não adicionar; quem não tem unidade a embalar nunca entra", async () => {
      await montar({ itensIniciais: ["s1", "s2", "s3"] }, largura);
      const m = $('[data-testid="modal-embalar"]')!;
      expect(m.textContent).toContain("Embalar 2 peças");
      expect($('[data-testid="embalar-peca-s3"]'), "sem unidade conferida não é embalada").toBeNull();
      const x = $('button[aria-label="Tirar #0381 deste embalar"]')!;
      expect(px(x.style.width)).toBe(44);
      await act(async () => { fireEvent.click(x); });
      expect($('[data-testid="embalar-peca-s2"]')).toBeNull();
      // a última não tem x: embalar zero peças não existe
      expect($('button[aria-label="Tirar #0386 deste embalar"]')).toBeNull();
    }, 30_000);

    it("DENTRO do volume a quantidade é a QUE ESTÁ NELE, com '(7 de 10)' quando a peça está dividida", async () => {
      await montar({ tuboInicial: "t1" }, largura, retrato((r) => { Object.assign(r.tubos[0].pecas[0], { quantity: 10, quantidadeNoTubo: 7 }); }));
      const lista = $('[data-testid="lista-entrega-tubo-1"]')!;
      expect(lista.textContent).toContain("2x1 Ministério da Saúde - 7 (7 de 10)");
      expect(lista.textContent).toContain("2x1 Ministério da Saúde - 16");
    }, 30_000);

    it("estados: peça que outro aparelho já embalou diz onde; Kit só-visualiza não embala", async () => {
      await montar({ itensIniciais: ["a1"] }, largura);
      expect($('[data-testid="embalar-ja-no-tubo"]')!.textContent).toContain("Tubo 1");
      expect(($('[data-testid="confirmar-embalar"]') as HTMLButtonElement).disabled).toBe(true);
      cleanup();
      papel = { role: "solicitacao", kit: false };
      await montar({ itensIniciais: ["s1"] }, largura, retrato((r) => { r.semTubo[0].doKit = true; }));
      expect($('[data-testid="embalar-sem-pecas"]')).toBeTruthy();
      expect($('[role="radiogroup"]')).toBeNull();
    }, 30_000);
  });

  describe(`2 · ENTREGAR TUBO N (${onde})`, () => {
    it("título com o tubo e o evento; a LISTA do que está dentro; as fotos; quem recebeu com a sugestão; comprovante opcional", async () => {
      await montar({ tuboInicial: "t1", sugestaoRecebedor: "Fulano" }, largura);
      expect($$('[role="dialog"]').length).toBe(1);
      const m = $('[data-testid="modal-entregar-tubo"]')!;
      expect(m.textContent).toContain("Entregar Tubo 1 · teste 3");
      const lista = $('[data-testid="lista-entrega-tubo-1"]')!;
      expect(lista.textContent).toContain("No tubo · 2 peças");
      expect(lista.textContent).toContain("#0383");
      expect(lista.textContent).toContain("2x1 Ministério da Saúde - 16");
      expect($('[data-testid="fotos-entrega-tubo-1"]')!.querySelectorAll("img").length).toBe(2);
      expect(m.textContent).toContain("Foto do comprovante · opcional");
      expect(m.textContent).not.toMatch(/obrigatória/i);
      const botao = () => $('[data-testid="confirmar-entrega-tubo-1"]') as HTMLButtonElement;
      if (largura !== 390) expect(document.activeElement, "foco inicial no que falta").toBe($('[data-testid="recebedor-tubo-1"]'));
      expect(botao().textContent).toBe("Informe quem recebeu");
      expect(botao().disabled).toBe(true);
      await clicar('[data-testid="button-usar-ultimo-recebedor"]');
      expect(botao().textContent).toBe("Entregar Tubo 1 a Fulano");
      expect(botao().disabled).toBe(false);
      const campo = $('[data-testid="recebedor-tubo-1"]') as HTMLInputElement;
      expect($(`label[for="${campo.id}"]`)!.textContent).toContain("Quem recebeu");
      if (largura === 390) { expect(px(campo.style.fontSize)).toBe(16); expect(reguaDoCelular(m)).toEqual([]); }

    }, 30_000);

    it("entrega: POST com quem recebeu; avisa, devolve o recebedor para a sugestão e fecha", async () => {
      const onEntregou = vi.fn();
      const { onClose } = await montar({ tuboInicial: "t1", onEntregou }, largura);
      await act(async () => { fireEvent.change($('[data-testid="recebedor-tubo-1"]')!, { target: { value: " João " } }); });
      await clicar('[data-testid="confirmar-entrega-tubo-1"]');
      await tick(30);
      expect(chamadas).toEqual([{ metodo: "POST", url: expect.stringContaining("/api/tubos/t1/entregar"), corpo: { photoUrl: null, receivedBy: "João", notes: "" } }]);
      expect(onEntregou).toHaveBeenCalledWith("João");
      expect(onClose).toHaveBeenCalled();
    }, 30_000);

    it("tubo legado SEM foto da embalagem: NÃO bloqueia — linha neutra, e o botão depende só de quem recebeu", async () => {
      await montar({ tuboInicial: "t1" }, largura, retrato((r) => { r.tubos[0].fotosFechamento = []; }));
      expect($('[data-testid="entregar-sem-foto-da-embalagem"]')!.textContent).toBe("Sem foto da embalagem — as fotos da conferência valem.");
      expect($('[data-testid="entregar-porque-foto"]')).toBeNull();
      await act(async () => { fireEvent.change($('[data-testid="recebedor-tubo-1"]')!, { target: { value: "Ana" } }); });
      const botao = $('[data-testid="confirmar-entrega-tubo-1"]') as HTMLButtonElement;
      expect(botao.textContent).toBe("Entregar Tubo 1 a Ana");
      expect(botao.disabled).toBe(false);
    }, 30_000);

    it("EMBALADA SOZINHA: 'Entregar #0390 — Placa de octanorme', nunca 'tubo'; mesma régua (só quem recebeu) e link da foto da conferência", async () => {
      await montar({ tuboInicial: "av1" }, largura);
      const m = $('[data-testid="modal-entregar-tubo"]')!;
      expect(m.textContent).toContain("Entregar #0390 — Placa de octanorme");
      expect(m.textContent).not.toMatch(/tubo/i);
      expect(m.textContent).toContain("Fotos da embalagem · 1");
      expect($('[data-testid="foto-conferencia-z1"]')!.getAttribute("href")).toBe("/objects/conf-z1.jpg");
      await act(async () => { fireEvent.change($('[data-testid="recebedor-tubo--1"]')!, { target: { value: "Bia" } }); });
      expect($('[data-testid="confirmar-entrega-tubo--1"]')!.textContent).toBe("Entregar #0390 a Bia");
      if (largura === 390) expect(reguaDoCelular(m)).toEqual([]);
    }, 30_000);

    it("falta conferir: abre EXPLICANDO, com a lista, e sem formulário — só 'Fechar'", async () => {
      await montar({ tuboInicial: "t2" }, largura);
      expect($('[data-testid="entregar-falta-conferir"]')!.textContent).toContain("#0385");
      expect($('[data-testid="lista-entrega-tubo-2"]')).toBeTruthy();
      expect($('[data-testid="recebedor-tubo-2"]')).toBeNull();
      expect($('[data-testid="confirmar-entrega-tubo-2"]')).toBeNull();
      expect($('[data-testid="rodape-entregar-fechar"]')!.textContent).toBe("Fechar");
    }, 30_000);

    it("estados: tubo com peça do Kit para quem só visualiza; tubo apagado por outra pessoa", async () => {
      papel = { role: "solicitacao", kit: false };
      await montar({ tuboInicial: "t1" }, largura, retrato((r) => { r.tubos[0].pecas[0].doKit = true; }));
      expect($('[data-testid="entregar-so-visualiza"]')).toBeTruthy();
      expect($('[data-testid="recebedor-tubo-1"]')).toBeNull();
      cleanup();
      await montar({ tuboInicial: "sumiu" }, largura);
      expect($('[data-testid="entregar-tubo-sumiu"]')).toBeTruthy();
    }, 30_000);
  });

  describe(`3 · PAINEL 'Tubos do evento' (${onde})`, () => {
    it("gestão, sem fluxo de embalar embutido: abertos primeiro, entregues recolhidos, ações claras por tubo", async () => {
      await montar({}, largura);
      expect($$('[role="dialog"]').length).toBe(1);
      const m = $('[data-testid="painel-de-tubos"]')!;
      expect(m.textContent).toContain("Tubos · teste 3");
      expect(m.textContent).not.toMatch(/Peças sem tubo|marcadas em/i);
      expect(m.querySelector('input[type="checkbox"]')).toBeNull();
      expect(m.querySelector('[role="radiogroup"]')).toBeNull();
      expect(m.textContent).toContain("Tubos abertos · 2");
      // a embalada SOZINHA não é tubo: seção própria, recolhida, sem etiqueta de tubo
      expect($('[data-testid="tubo--1"]')).toBeNull();
      expect($('[data-testid="painel-ver-sozinhas"]')!.textContent).toContain("Embaladas sozinhas (1)");
      expect($('[data-testid="sozinha-z1"]')).toBeNull();
      await clicar('[data-testid="painel-ver-sozinhas"]');
      const sozinha = $('[data-testid="sozinha-z1"]')!;
      expect(sozinha.textContent).toContain("#0390");
      expect($('[data-testid="entregar-sozinha-z1"]')!.textContent).toBe(" Entregar");
      expect($('[data-testid="desfazer-embalagem-z1"]')!.textContent).toBe("Desfazer embalagem");
      expect(sozinha.querySelector("a[href*='etiqueta']")).toBeNull();
      expect($('[data-testid="tubo-3"]'), "entregue fica recolhido").toBeNull();
      await clicar('[data-testid="painel-ver-entregues"]');
      expect($('[data-testid="tubo-3"]')!.textContent).toContain("Recebido por Carlos");
      const t1 = $('[data-testid="tubo-1"]')!;
      expect(t1.textContent).toContain("Tubo 1 · 2 peças · 32 un. · 2 fotos");
      expect(t1.textContent).toContain("Pronto para entregar");
      for (const id of ["entregar-tubo-1", "fechar-tubo-1", "etiqueta-tubo-1", "apagar-tubo-1", "tirar-peca-a1"]) expect($(`[data-testid="${id}"]`), id).toBeTruthy();
      expect($('[data-testid="etiqueta-tubo-1"]')!.getAttribute("href")).toBe("/grafica/tubos/t1/etiqueta");
      expect($('[data-testid="tubo-2"]')!.textContent).toContain("Falta conferir 1");
      if (largura === 390) expect(reguaDoCelular(m)).toEqual([]);
    }, 30_000);

    it("'Embalar peças conferidas (2)' abre o modal 1 COM caixas; cancelar volta ao painel", async () => {
      const { onClose } = await montar({}, largura);
      expect($('[data-testid="painel-embalar-conferidas"]')!.textContent).toContain("Embalar peças conferidas (2)");
      await clicar('[data-testid="painel-embalar-conferidas"]');
      await tick(20);
      expect($('[data-testid="painel-de-tubos"]')).toBeNull();
      const m = $('[data-testid="modal-embalar"]')!;
      expect(m.querySelectorAll('input[type="checkbox"]').length).toBe(2);
      expect(m.textContent).toContain("2 de 2 marcadas");
      await act(async () => { fireEvent.click(m.querySelectorAll('input[type="checkbox"]')[1]); });
      expect(m.textContent).toContain("1 de 2 marcadas");
      await act(async () => { fireEvent.click($('[data-testid="rodape-embalar"]')!.querySelector("button")!); });
      await tick(20);
      expect($('[data-testid="painel-de-tubos"]')).toBeTruthy();
      expect(onClose).not.toHaveBeenCalled();
    }, 30_000);

    it("'Entregar' abre o modal 2 daquele tubo — inclusive o que ainda falta conferir, que explica", async () => {
      await montar({}, largura);
      await clicar('[data-testid="entregar-tubo-2"]');
      await tick(20);
      expect($('[data-testid="painel-de-tubos"]')).toBeNull();
      expect($('[data-testid="entregar-falta-conferir"]')).toBeTruthy();
    }, 30_000);

    it("confirmação SÓ onde destrói: apagar pede o segundo toque e diz o que acontece; tirar peça é direto, com toast", async () => {
      await montar({}, largura);
      await clicar('[data-testid="apagar-tubo-1"]');
      expect(chamadas).toEqual([]);
      expect($('[data-testid="confirmar-apagar-tubo-1"]')!.textContent).toContain("Apagar e devolver 2 a Conferido");
      await clicar('[data-testid="confirmar-apagar-tubo-1"]');
      await tick(30);
      expect(chamadas[0]).toMatchObject({ metodo: "DELETE", url: expect.stringContaining("/api/tubos/t1") });
      await clicar('[data-testid="tirar-peca-b1"]');
      await tick(30);
      expect(chamadas[1]).toMatchObject({ metodo: "PATCH", corpo: { remover: ["b1"] } });
    }, 30_000);

    it("'Adicionar fotos': câmera direta e o confirmar no rodapé fixo com o recorte seguro", async () => {
      await montar({}, largura);
      await clicar('[data-testid="fechar-tubo-1"]');
      const rodape = $('[data-testid="rodape-fechar-tubo-1"]')!;
      expect(/safe-area-inset-bottom/.test(rodape.style.paddingBottom)).toBe(true);
      const ok = () => $('[data-testid="confirmar-fechar-tubo-1"]') as HTMLButtonElement;
      expect(ok().textContent).toBe("Tire a foto para guardar");
      const form = $('[data-testid="form-fechar-tubo-1"]')!;
      expect(form.querySelector('[data-capture="sim"]')).toBeTruthy();
      await act(async () => { fireEvent.click(form.querySelector('[data-testid="button-upload-photo"]')!); });
      expect(ok().textContent).toBe("Guardar no Tubo 1 · 1 foto");
      await act(async () => { fireEvent.click(ok()); });
      await tick(30);
      expect(chamadas[0]).toMatchObject({ metodo: "POST", url: expect.stringContaining("/api/tubos/t1/fechar") });
    }, 30_000);

    it("estados: vazio (sem tubo e nada a embalar) e Kit só-visualiza (sem ações no tubo)", async () => {
      await montar({}, largura, retrato((r) => { r.tubos = []; r.semTubo = []; }));
      expect($('[data-testid="painel-sem-tubos"]')!.textContent).toBe("Nenhum tubo aberto neste evento.");
      expect($('[data-testid="painel-embalar-conferidas"]')).toBeNull();
      cleanup();
      papel = { role: "solicitacao", kit: false };
      await montar({}, largura, retrato((r) => { r.tubos[0].pecas[0].doKit = true; }));
      expect($('[data-testid="entregar-tubo-1"]')).toBeNull();
      expect($('[data-testid="apagar-tubo-1"]')).toBeNull();
      expect($('[data-testid="tirar-peca-a1"]')).toBeNull();
      expect($('[data-testid="tubo-1"]')!.textContent).toContain("aqui você só visualiza");
    }, 30_000);
  });

  describe(`4 · O TUBO — o modal do selo (${onde})`, () => {
    it("'Tubo 1 · teste 3': o que vai junto (código clicável, nome, quantidade NAQUELE tubo e '(7 de 10)'), fotos, quem embalou, estado", async () => {
      const onAbrirPeca = vi.fn();
      await montar({ verTubo: "t1", onAbrirPeca }, largura, retrato((r) => { Object.assign(r.tubos[0].pecas[0], { quantity: 10, quantidadeNoTubo: 7 }); }));
      expect($$('[role="dialog"]').length, "um modal por vez — não o painel do evento").toBe(1);
      expect($('[data-testid="painel-de-tubos"]')).toBeNull();
      const m = $('[data-testid="modal-do-tubo"]')!;
      expect(m.textContent).toContain("Tubo 1 · teste 3");
      expect($('[data-testid="tubo-estado"]')!.textContent).toContain("Aberto — aguardando a entrega");
      expect($('[data-testid="tubo-conteudo"]')!.textContent).toContain("O que vai junto · 2 peças · 23 un.");
      const linha = $('[data-testid="tubo-peca-a1"]')!;
      expect(linha.textContent).toContain("2x1 — Ministério da Saúde");
      expect(linha.textContent).toContain("7 un. (7 de 10)");
      await act(async () => { fireEvent.click(linha.querySelector('button[aria-label="Abrir a ficha de #0383"]')!); });
      expect(onAbrirPeca).toHaveBeenCalledWith("a1");
      const fotos = $('[data-testid="tubo-fotos"]')!;
      expect(fotos.querySelectorAll("img").length).toBe(2);
      expect(fotos.textContent).toContain("Embalado por Operador em");
      // ações no rodapé, com o recorte seguro
      const rodape = $('[data-testid="rodape-do-tubo"]')!;
      expect(/safe-area-inset-bottom/.test(rodape.style.paddingBottom)).toBe(true);
      expect(Array.from(rodape.querySelectorAll("button, a")).map((b) => b.textContent?.trim())).toEqual(["Entregar tubo", "Adicionar fotos", "Etiqueta", "Fechar"]);
      expect($('[data-testid="tubo-etiqueta"]')!.getAttribute("href")).toBe("/grafica/tubos/t1/etiqueta");
      if (largura === 390) expect(reguaDoCelular(m)).toEqual([]);
    }, 30_000);

    it("'Entregar tubo' troca para o modal de entrega daquele tubo; 'Tirar do tubo' é por linha (PATCH remover)", async () => {
      await montar({ verTubo: "t1" }, largura);
      await clicar('[data-testid="tubo-tirar-a2"]');
      await tick(30);
      expect(chamadas[0]).toMatchObject({ metodo: "PATCH", url: expect.stringContaining("/api/tubos/t1/itens"), corpo: { remover: ["a2"] } });
      await clicar('[data-testid="tubo-entregar"]');
      await tick(20);
      expect($('[data-testid="modal-do-tubo"]')).toBeNull();
      expect($('[data-testid="modal-entregar-tubo"]')!.textContent).toContain("Entregar Tubo 1 · teste 3");
    }, 30_000);

    it("'Adicionar fotos' abre o formulário com câmera direta e o confirmar no rodapé", async () => {
      await montar({ verTubo: "t1" }, largura);
      await clicar('[data-testid="tubo-adicionar-fotos"]');
      expect($('[data-testid="confirmar-fotos-do-tubo"]')!.textContent).toBe("Tire a foto para guardar");
      const form = $('[data-testid="tubo-form-fotos"]')!;
      expect(form.querySelector('[data-capture="sim"]')).toBeTruthy();
      await act(async () => { fireEvent.click(form.querySelector('[data-testid="button-upload-photo"]')!); });
      expect($('[data-testid="confirmar-fotos-do-tubo"]')!.textContent).toBe("Guardar 1 foto");
      await clicar('[data-testid="confirmar-fotos-do-tubo"]');
      await tick(30);
      expect(chamadas[0]).toMatchObject({ metodo: "POST", url: expect.stringContaining("/api/tubos/t1/fechar") });
    }, 30_000);

    it("EMBALADA SOZINHA: 'Embalagem de #0390', sem 'tubo' nem etiqueta; ações 'Entregar' e 'Desfazer embalagem'", async () => {
      await montar({ verTubo: "av1" }, largura);
      const m = $('[data-testid="modal-do-tubo"]')!;
      expect(m.textContent).toContain("Embalagem de #0390");
      expect(m.textContent).not.toMatch(/tubo/i);
      expect($('[data-testid="tubo-etiqueta"]')).toBeNull();
      expect($('[data-testid="tubo-entregar"]')!.textContent).toBe(" Entregar");
      expect($('[data-testid="tubo-tirar-z1"]')!.textContent).toBe("Desfazer embalagem");
    }, 30_000);

    it("ENTREGUE: o registro — a quem e quando, o conteúdo congelado, sem ações que mexem", async () => {
      await montar({ verTubo: "t3" }, largura);
      expect($('[data-testid="tubo-estado"]')!.textContent).toContain("Entregue a Carlos em");
      expect($('[data-testid="tubo-conteudo"]')!.textContent).toContain("#0380");
      expect($('[data-testid="tubo-entregar"]')).toBeNull();
      expect($('[data-testid="tubo-adicionar-fotos"]')).toBeNull();
      expect($('[data-testid="tubo-tirar-c1"]')).toBeNull();
    }, 30_000);

    it("estados: tubo que sumiu e Kit só-visualiza", async () => {
      await montar({ verTubo: "nao-existe" }, largura);
      expect($('[data-testid="tubo-sumiu"]')).toBeTruthy();
      cleanup();
      papel = { role: "solicitacao", kit: false };
      await montar({ verTubo: "t1" }, largura, retrato((r) => { r.tubos[0].pecas[0].doKit = true; }));
      expect($('[data-testid="tubo-so-visualiza"]')).toBeTruthy();
      expect($('[data-testid="tubo-entregar"]')).toBeNull();
      expect($('[data-testid="tubo-tirar-a1"]')).toBeNull();
    }, 30_000);
  });
}

describe("o teclado não esconde o botão (390px)", () => {
  it("'Quem recebeu' focado com o teclado aberto: o modal encolhe para a área visível e o rodapé fica fora da rolagem", async () => {
    const { vv } = await montar({ tuboInicial: "t1" }, 390);
    const m = $('[data-testid="modal-entregar-tubo"]')!;
    vv.height = 420;
    await act(async () => { vv.dispatchEvent(new Event("resize")); });
    expect(m.style.maxHeight).toBe("404px");
    const rodape = $('[data-testid="rodape-entregar-tubo-1"]')!;
    expect(rodape.parentElement, "rodapé é filho direto da superfície, não do corpo que rola").toBe(m);
    expect(rodape.style.flexShrink).toBe("0");
  }, 30_000);
});

describe("estados de carregamento e erro", () => {
  it("carregando e erro com 'Tentar novamente' — nos três", async () => {
    prepararJsdom(1280);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));
    const { queryClient } = await import("@/lib/queryClient");
    const { TubosDialog } = await import("@/components/tubos-dialog");
    for (const props of [{}, { itensIniciais: ["s1"] }, { tuboInicial: "t1" }]) {
      queryClient.clear();
      await act(async () => { render(h(QueryClientProvider, { client: queryClient } as any, h(TubosDialog as any, { evento: EVENTO, onClose: () => {}, ...props }))); });
      expect($('[role="status"]')?.textContent ?? "Carregando os tubos…").toBe("Carregando os tubos…");
      // Sob carga a resposta demora: espera o erro aparecer em vez de um tempo fixo.
      for (let i = 0; i < 100 && !$('[role="alert"]'); i++) await tick(30);
      expect($('[role="alert"]')!.textContent).toContain("Não foi possível carregar os tubos.");
      expect($('[role="alert"] button')!.textContent).toBe("Tentar novamente");
      cleanup();
    }
  }, 30_000);
});
