// @vitest-environment jsdom
//
// O botão "Voltar para a Revisão" da peça entregue: só o ADM o vê, o motivo é
// obrigatório e o pedido vai para a rota de reabrir (dono, 13/10).
import * as React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, screen, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: () => {} }), toast: () => {} }));
const pedidos: Array<{ metodo: string; url: string; corpo: any }> = [];
vi.mock("@/lib/queryClient", async () => {
  const real = await vi.importActual<any>("@/lib/queryClient");
  return { ...real, apiRequest: async (metodo: string, url: string, corpo: any) => { pedidos.push({ metodo, url, corpo }); return {}; } };
});
vi.mock("@/lib/tempo-real-grafica", () => ({ invalidarGraficaEMaquinas: () => {} }));

import { ReabrirEntregueParaRevisao, podeReabrirEntregue } from "../../client/src/components/grafica/modais/reabrir-entregue";

afterEach(cleanup);
const peca: any = { id: "p1", displayId: "#0001", status: "delivered" };

describe("Voltar a peça entregue para a Revisão", () => {
  it("só o ADM e só a peça entregue", () => {
    expect(podeReabrirEntregue(peca, "admin")).toBe(true);
    expect(podeReabrirEntregue({ ...peca, status: "entregue" }, "admin")).toBe(true);
    for (const papel of ["grafica", "solicitacao", "arte", "atendimento", undefined]) expect(podeReabrirEntregue(peca, papel)).toBe(false);
    for (const status of ["packed", "conferred", "ready_for_production"]) expect(podeReabrirEntregue({ ...peca, status }, "admin")).toBe(false);
  });

  it("exige motivo e envia para a rota de reabrir", async () => {
    const onReaberta = vi.fn();
    render(React.createElement(QueryClientProvider, { client: new QueryClient() },
      React.createElement(ReabrirEntregueParaRevisao, { item: peca, onReaberta })));
    fireEvent.click(screen.getByTestId("button-reabrir-entregue"));
    const confirmar = screen.getByTestId("button-confirmar-reabrir-entregue") as HTMLButtonElement;
    expect(confirmar.disabled).toBe(true);
    fireEvent.change(screen.getByTestId("textarea-reabrir-motivo"), { target: { value: "Patrocinador errado, reimprimir" } });
    expect(confirmar.disabled).toBe(false);
    fireEvent.click(confirmar);
    await waitFor(() => expect(onReaberta).toHaveBeenCalled());
    expect(pedidos).toEqual([{ metodo: "POST", url: "/api/items/p1/reabrir-para-revisao", corpo: { notes: "Patrocinador errado, reimprimir" } }]);
  });
});
