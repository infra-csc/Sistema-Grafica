// @vitest-environment jsdom
//
// ─────────────────────────────────────────────────────────────────────────────
// O SELO "TRAVADA · HÁ N MIN" ANDA COM O RELÓGIO — mesmo na linha memoizada.
//
// A linha e o cartão da Revisão Final são `memo`: só redesenham quando uma
// prop muda. Os dois selos que dependem da HORA — a idade da trava e o dia do
// prazo do molde — liam `Date.now()`/`new Date()` lá dentro e ficavam
// congelados no último desenho: "há 5 min" meia hora depois, e "amanhã" depois
// da meia-noite. O conserto é um relógio de minuto na página
// (useRelogioDoMinuto) passado como prop `agora`: a memo continua valendo
// para o resto, e uma vez por minuto as linhas leem o tempo certo.
//
// Aqui o pai NÃO redesenha por conta própria: só o relógio muda. Com os
// timers falsos avançando minutos, o texto tem que acompanhar.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import * as React from "react";
import { render, act, cleanup } from "@testing-library/react";
import { LinhaDaPeca } from "@/components/revisao/linha-da-peca";
import { CartaoDaPeca } from "@/components/revisao/cartao-da-peca";
import { useRelogioDoMinuto } from "@/components/revisao/use-relogio-do-minuto";
import type { PecaDaRevisao } from "@/components/revisao/tipos";

const h = React.createElement;

// 21/09/2026, 23:55:30 no fuso da máquina — a meia-noite está a 4,5 min.
const INICIO = new Date(2026, 8, 21, 23, 55, 30);

// Um molde travado às 23:50:00 (5,5 min antes), com prazo do molde amanhã (22/09).
const PECA = {
  id: "p1", displayId: "#0042", type: "Molde", description: "Molde da tenda",
  status: "awaiting_final_review", quantity: 1, eventId: "e1",
  isReuse: false, referenceUrl: null, finalFileUrl: null, approvalThumbUrl: "/objects/t.png",
  travadaEm: new Date(2026, 8, 21, 23, 50, 0).toISOString(),
  travadaPor: "Ana Solicitação", travadaMotivo: "Arte vai mudar",
  event: { id: "e1", name: "Circuito 2026", prazoMolde: "2026-09-22" },
} as unknown as PecaDaRevisao;

// Ações estáveis (no módulo): a única prop que muda é `agora`.
const nada = () => {};
const COMUNS = {
  item: PECA, selecionada: false, selo: null, estoque: undefined, falha: undefined,
  desfazendo: false, dedo: false, admin: true,
  aoAbrir: nada, aoMarcar: nada, aoReaproveitar: nada, aoExcluir: nada,
};

function TelaDeTeste() {
  const agora = useRelogioDoMinuto();
  return h("div", null,
    h("table", null, h("tbody", null,
      h(LinhaDaPeca, { ...COMUNS, agora, ultima: true, mostraTipo: false, grupo: "", compacto: false, colunasDeDados: 4 }))),
    h(CartaoDaPeca, { ...COMUNS, agora }),
  );
}

const texto = (testid: string) => document.querySelector(`[data-testid="${testid}"]`)?.textContent ?? "";
const minutos = async (n: number) => { await act(async () => { vi.advanceTimersByTime(n * 60_000); }); };

beforeAll(() => {
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false; },
  }));
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("Revisão Final: o tempo anda nas linhas memoizadas", () => {
  it("a idade da trava acompanha os minutos, na tabela e no cartão", async () => {
    vi.useFakeTimers({ now: INICIO });
    render(h(TelaDeTeste));

    expect(texto("badge-travada-tabela-p1")).toContain("por Ana Solicitação, há 5 min");
    expect(texto("badge-travada-cartao-p1")).toContain("por Ana Solicitação, há 5 min");

    await minutos(1); // o relógio virou às 23:56:00 → 6 min
    expect(texto("badge-travada-tabela-p1")).toContain("há 6 min");
    expect(texto("badge-travada-cartao-p1")).toContain("há 6 min");

    await minutos(10); // última virada 00:06:00 → 16 min
    expect(texto("badge-travada-tabela-p1")).toContain("há 16 min");
    expect(texto("badge-travada-cartao-p1")).toContain("há 16 min");

    // Uma hora depois do começo, a unidade troca.
    await minutos(49); // última virada 00:55:00 → 65 min
    expect(texto("badge-travada-tabela-p1")).toContain("há 1h");
    expect(texto("badge-travada-cartao-p1")).toContain("há 1h");
  });

  it("o prazo do molde vira de 'amanhã' para 'hoje' à meia-noite, sem recarregar", async () => {
    vi.useFakeTimers({ now: INICIO });
    render(h(TelaDeTeste));

    const [linha, cartao] = Array.from(document.querySelectorAll('[data-testid="prazo-molde-p1"]'));
    expect(linha && cartao).toBeTruthy();
    expect(linha.textContent).toContain("amanhã");
    expect(cartao.textContent).toContain("amanhã");

    await minutos(5); // 00:00:30 do dia 22
    const [linha2, cartao2] = Array.from(document.querySelectorAll('[data-testid="prazo-molde-p1"]'));
    expect(linha2.textContent).toContain("hoje");
    expect(linha2.textContent).not.toContain("amanhã");
    expect(cartao2.textContent).toContain("hoje");
  });

  it("o relógio vira NA virada do minuto, não 60 s depois de montar", async () => {
    vi.useFakeTimers({ now: INICIO }); // 30 s dentro do minuto
    render(h(TelaDeTeste));
    expect(texto("badge-travada-tabela-p1")).toContain("há 5 min");
    await act(async () => { vi.advanceTimersByTime(29_000); });
    expect(texto("badge-travada-tabela-p1")).toContain("há 5 min");
    await act(async () => { vi.advanceTimersByTime(1_000); }); // 23:56:00
    expect(texto("badge-travada-tabela-p1")).toContain("há 6 min");
  });
});
