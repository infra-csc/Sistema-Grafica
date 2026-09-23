// @vitest-environment jsdom
// ─────────────────────────────────────────────────────────────────────────────
// PRAZO DO MOLDE NAS TELAS (dono, 22/09) — montado:
//   · o selo aparece no MOLDE de evento com prazo do molde, com o desenho do
//     prazo das filas; peça comum e molde sem prazo não mudam nada;
//   · a Gráfica mostra o selo ao lado de "Marcar como produzido";
//   · o formulário do evento tem o campo opcional com a ajuda; a Arte troca o
//     prazo da coluna e da ordenação só para o molde; Revisão Final, ficha e
//     Detalhe do evento usam o mesmo selo; o aviso discreto no evento.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, afterEach, vi } from "vitest";
import { fonteDoComponente } from "./fonte-dos-componentes";
import * as React from "react";
import { render, cleanup } from "@testing-library/react";
import { readFileSync } from "fs";
import path from "path";
import { fonteDaTela } from "./fonte-da-tela";
import { lerTelaOuArquivo } from "./fonte-das-telas-da-arte";

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: () => {} }), toast: () => {} }));

const h = React.createElement;
// Arte, Revisão e Vinculação são lidas como a área inteira (página + pasta).
const ler = (rel: string) => lerTelaOuArquivo(rel);
afterEach(() => cleanup());

const HOJE = new Date(2026, 9, 1);
const EVENTO = { id: "ev1", name: "COPA", prazoMolde: "2026-09-28T12:00:00.000Z" };

describe("o selo montado", () => {
  it("molde com prazo do molde: rótulo, data e atraso", async () => {
    const { SeloPrazoMolde } = await import("@/components/prazo-do-molde");
    const { getByTestId } = render(h(SeloPrazoMolde, { item: { id: "m1", type: "Molde" }, evento: EVENTO, hoje: HOJE }));
    const selo = getByTestId("prazo-molde-m1");
    expect(selo.textContent).toContain("Prazo do molde");
    expect(selo.textContent).toContain("28/09");
    expect(selo.textContent).toMatch(/3d/);
  });

  it("peça comum e molde sem prazo: nada (vale o prazo de sempre)", async () => {
    const { SeloPrazoMolde } = await import("@/components/prazo-do-molde");
    const a = render(h(SeloPrazoMolde, { item: { id: "p1", type: "Pórtico" }, evento: EVENTO, hoje: HOJE }));
    expect(a.container.innerHTML).toBe("");
    const b = render(h(SeloPrazoMolde, { item: { id: "m2", type: "Molde", event: { prazoMolde: null } } as any, hoje: HOJE }));
    expect(b.container.innerHTML).toBe("");
  });

  it("sem `evento`, lê o evento embutido na peça", async () => {
    const { SeloPrazoMolde } = await import("@/components/prazo-do-molde");
    const { queryByTestId } = render(h(SeloPrazoMolde, { item: { id: "m3", type: "Molde", event: EVENTO } as any, hoje: HOJE }));
    expect(queryByTestId("prazo-molde-m3")).not.toBeNull();
  });
});

describe("a Gráfica montada", () => {
  it("o molde liberado mostra o prazo do molde ao lado de 'Marcar como produzido'", async () => {
    const { QueryClientProvider } = await import("@tanstack/react-query");
    const { queryClient } = await import("@/lib/queryClient");
    const { AcoesDoMolde } = await import("@/components/grafica/acoes-do-molde");
    const molde = { id: "m1", displayId: "#0500", type: "Molde", status: "ready_for_production", quantity: 1, event: { ...EVENTO, prazoMolde: "2099-01-01T12:00:00.000Z" } };
    const { getByTestId } = render(h(QueryClientProvider, { client: queryClient }, h(AcoesDoMolde, { item: molde as never, podeProduzir: true }) /* fixture parcial da peça */));
    expect(getByTestId("button-molde-produzido-m1")).toBeTruthy();
    expect(getByTestId("prazo-molde-m1").textContent).toContain("Prazo do molde");
  });
});

describe("as telas (fonte)", () => {
  it("formulário do evento: campo opcional, ajuda, limpar, e vai no payload (vazio = null)", () => {
    const f = fonteDaTela("eventos");
    expect(f).toContain("Prazo do molde (opcional)");
    expect(f).toContain('data-testid="input-prazo-molde"');
    expect(f).toContain("{AJUDA_PRAZO_MOLDE}");
    expect(f).toContain("prazoMolde: fd.prazoMolde || null,");
    expect(f).toContain("prazoMolde: diaDoPrazoMolde(event.prazoMolde) ?? \"\",");
  });

  it("Arte: a coluna e a ordenação 'prazo' usam o prazo do molde só no molde", () => {
    const a = ler("client/src/pages/arte.tsx");
    expect(a).toContain("const p = prazoDoMolde(item, item.event, hoje) ?? phaseDeadline(item.event, tabId, hoje);");
    expect(a).toContain("const pa = prazoDoMolde(a, a.event, hoje), pb = prazoDoMolde(b, b.event, hoje);");
  });

  it("Revisão Final, ficha e Detalhe do evento usam o mesmo selo; o evento avisa molde sem prazo", () => {
    // Linha e cartão memoizados: o dia vem do relógio da página (prop `agora`),
    // senão o prazo não vira à meia-noite — ver revisao-relogio-da-linha.test.ts.
    expect(ler("client/src/pages/solicitacao.tsx").split("<SeloPrazoMolde item={item} hoje={new Date(agora)} />").length - 1).toBe(2);
    expect(fonteDoComponente("client/src/components/item-details-dialog.tsx")).toContain("<SeloPrazoMolde item={item} caixa />");
    const d = fonteDaTela("detalhe-do-evento");
    expect(d.split("<SeloPrazoMolde item={item} evento={event} />").length - 1).toBe(3);
    expect(d).toContain('data-testid="aviso-molde-sem-prazo"');
    expect(d).toContain("eventoTemMoldeSemPrazo(event, rawItems)");
  });
});
