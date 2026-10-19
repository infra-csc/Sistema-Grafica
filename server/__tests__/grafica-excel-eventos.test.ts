// @vitest-environment jsdom
import * as React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, screen, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ExportarExcelGrafica } from "../../client/src/components/grafica/modais/exportar-excel";

afterEach(cleanup);

describe("Excel da Gráfica por evento", () => {
  it("seleciona múltiplas provas realizadas mesmo com a fila vazia", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const nomes = ["Night Run - Teresina", "Circuitinho - Salvador", "Girl Power - Rio de Janeiro", "Desafio Petrobrás - Recife"];
    client.setQueryData(["/api/events"], nomes.map((name, i) => ({ id: `e${i}`, name, startDate: "2020-01-01" })));
    const exportar = vi.fn(async () => {});
    render(React.createElement(QueryClientProvider, { client }, React.createElement(ExportarExcelGrafica, {
      open: true, onClose: vi.fn(), quantidadeNaLista: 0, isExporting: false, onExportar: exportar,
    })));
    fireEvent.click(screen.getByRole("button", { name: "Selecionar eventos" }));
    for (const name of nomes) fireEvent.click(screen.getByText(name));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "petrobras" } });
    expect(screen.getByText(nomes[3])).toBeTruthy();
    expect(screen.queryByText(nomes[0])).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Baixar Excel" }));
    await waitFor(() => expect(exportar).toHaveBeenCalledWith({ eventIds: ["e0", "e1", "e2", "e3"], title: "Fechamento — Gráfica" }));
  });

  it("exporta todos os eventos por padrão", () => {
    const client = new QueryClient();
    const exportar = vi.fn(async () => {});
    render(React.createElement(QueryClientProvider, { client }, React.createElement(ExportarExcelGrafica, {
      open: true, onClose: vi.fn(), quantidadeNaLista: 3, isExporting: false, onExportar: exportar,
    })));
    expect(screen.getByRole("button", { name: "Todos os eventos (3)" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Baixar Excel" }));
    expect(exportar).toHaveBeenCalledWith(undefined);
  });
});
