// @vitest-environment jsdom
//
// ─────────────────────────────────────────────────────────────────────────────
// AS TELAS de clonar e importar, montadas de verdade.
//
//   · Clonar: a lista não oferece complemento; cancelada aparece DESMARCADA e
//     com o selo "cancelada"; o botão diz quantas vão e entrega só essas.
//   · Importar: as regras puras que pintam a linha (quantidade inválida,
//     repetida na mesma planilha) e o botão travado com o MOTIVO à vista.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi } from "vitest";
import * as React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CloneItemsDialog } from "@/components/clone-items-dialog";
import { ImportXlsxDialog, defeitosDaLinha, repetidasNaPlanilha, quantidadeValida } from "@/components/import-xlsx-dialog";

const h = React.createElement;

// jsdom não tem matchMedia (useIsMobile pergunta a largura).
if (!window.matchMedia) {
  (window as any).matchMedia = (q: string) => ({ matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {} });
}
if (!(globalThis as any).ResizeObserver) {
  (globalThis as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
}

function comQuery(el: React.ReactElement, dados: Record<string, any>) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, queryFn: async () => [] } } });
  for (const [k, v] of Object.entries(dados)) qc.setQueryData(JSON.parse(k), v);
  return render(h(QueryClientProvider, { client: qc }, el));
}

describe("Clonar peças: o que vem marcado", () => {
  it("complemento não aparece; cancelada vem desmarcada e com selo; o botão entrega só as marcadas", () => {
    const onConfirmClone = vi.fn();
    comQuery(h(CloneItemsDialog, {
      open: true, onOpenChange: () => {}, eventId: "ev-1", eventName: "COPA NOVA",
      allEvents: [{ id: "ev-2", name: "COPA VELHA", createdAt: "2026-01-01" }],
      cloneSourceId: "ev-2", setCloneSourceId: () => {}, isCloning: false, onConfirmClone,
    }), {
      '["/api/items","ev-2"]': [
        { id: "a", displayId: "#0001", type: "Pórtico", quantity: 2, status: "delivered" },
        { id: "b", displayId: "#0002", type: "Testeira", quantity: 1, status: "canceled" },
        { id: "c", displayId: "#0001-C1", type: "Pórtico", quantity: 1, status: "produced", parentItemId: "a" },
      ],
    });
    expect(screen.queryByTestId("linha-peca-clone-c")).toBeNull();
    const cancelada = screen.getByTestId("linha-peca-clone-b");
    expect(cancelada.textContent).toContain("cancelada");
    expect((cancelada.querySelector("input") as HTMLInputElement).checked).toBe(false);
    expect((screen.getByTestId("linha-peca-clone-a").querySelector("input") as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText(/1 complemento \(aumento pós-produção\) fica de fora/)).toBeTruthy();
    const botao = screen.getByTestId("button-confirm-clone");
    expect(botao.textContent).toContain("Clonar 1 Peça");
    fireEvent.click(botao);
    expect(onConfirmClone).toHaveBeenCalledWith(["a"]);
  });
});

describe("Importar: as regras que pintam a linha", () => {
  it("quantidade: inteiro a partir de 1", () => {
    for (const ok of [1, "3", "12"]) expect(quantidadeValida(ok), String(ok)).toBe(true);
    for (const ruim of [0, -2, "1.5", "", null, "dois"]) expect(quantidadeValida(ruim), String(ruim)).toBe(false);
  });

  it("repetida na mesma planilha: tipo, descrição e medida iguais; o primeiro não é marcado", () => {
    const rows = [
      { _id: "r1", linha: 4, type: "Pórtico", description: "Largada", fileWidth: 3, fileHeight: 2 },
      { _id: "r2", linha: 5, type: "Pórtico", description: "Largada", fileWidth: 4, fileHeight: 2 },
      { _id: "r3", linha: 9, type: "PÓRTICO", description: "largada ", fileWidth: "3.00", fileHeight: 2 },
    ];
    const rep = repetidasNaPlanilha(rows);
    expect([...rep.entries()]).toEqual([["r3", 4]]);
    expect(defeitosDaLinha({ ...rows[2], quantity: 1, suggestedSponsorIds: ["x"], calculatedM2: 6, material: "Lona", finish: "Ilhós" }, new Set(), rep))
      .toEqual(["repetida-na-planilha"]);
    expect(defeitosDaLinha({ _id: "z", quantity: 0, suggestedSponsorIds: ["x"], fileWidth: 1, fileHeight: 1, calculatedM2: 1, material: "L", finish: "I" }))
      .toEqual(["qtd-invalida"]);
  });

  it("com quantidade inválida o botão de importar trava, e o motivo aparece com a linha; as ignoradas são listadas", () => {
    const base = { type: "Testeira", description: "Testeira A", fileWidth: 3, fileHeight: 1, calculatedM2: 6, material: "Lona", finish: "Ilhós", suggestedSponsorIds: [] };
    comQuery(h(ImportXlsxDialog, {
      open: true, onOpenChangeClose: () => {}, importFile: null, setImportFile: () => {}, setImportPreview: () => {},
      importPreviewItems: [{ ...base, _id: "r1", linha: 3, quantity: 2 }, { ...base, _id: "r2", linha: 12, description: "Testeira B", quantity: 0 }],
      setImportPreviewItems: () => {}, importFileName: "lista.xlsx", importSearch: "", setImportSearch: () => {},
      eventSponsorsList: [], previewXlsxPending: false, onPreview: () => {}, confirmImportPending: false, onConfirmImport: () => {},
      ignoradas: [{ linha: 7, motivo: "sem quantidade" }],
    }), {});
    const botao = screen.getByTestId("button-confirm-import") as HTMLButtonElement;
    expect(botao.disabled).toBe(true);
    expect(screen.getByTestId("motivo-importar-travado").textContent).toContain("Linha 12: quantidade mínima é 1");
    expect(screen.getByTestId("aviso-linhas-ignoradas").textContent).toContain("1 linha da planilha ficou de fora");
    fireEvent.click(screen.getByTestId("button-ver-ignoradas"));
    expect(screen.getByTestId("aviso-linhas-ignoradas").textContent).toContain("Linha 7: sem quantidade");
  });
});
