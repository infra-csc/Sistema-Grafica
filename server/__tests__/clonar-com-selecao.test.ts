// ─────────────────────────────────────────────────────────────────────────────
// CLONAR COM SELEÇÃO (dono, 01/09: "similar ao clonar evento mas poder
// selecionar os itens que vão ser clonados").
//
// A regra em uma linha: `itemIds` no corpo é OPCIONAL — ausente, a rota clona
// o evento inteiro como sempre fez (o fluxo de criar-evento-clonando em
// eventos.tsx não mudou); presente, só as peças escolhidas viram cópia, e
// cada id precisa SER do evento de origem, senão qualquer um clonaria peça
// de evento que não pode ver.
//
// No dialog, a seleção nasce com TUDO marcado: o caso comum segue sendo
// "quero o evento inteiro", e desmarcar as exceções é mais rápido do que
// marcar dezenas.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const ler = (rel: string) => readFileSync(path.resolve(__dirname, "../..", rel), "utf8");
const ROTA = ler("server/routes/items.ts");
const DIALOG = ler("client/src/components/clone-items-dialog.tsx");
const HOOK = ler("client/src/hooks/use-event-import.ts");
const DETALHE = ler("client/src/pages/event-detail.tsx");
const EVENTOS = ler("client/src/pages/eventos.tsx");

describe("a rota", () => {
  it("itemIds é opcional — ausente clona tudo, como sempre (compatível com o fluxo antigo)", () => {
    expect(ROTA).toContain("const { sourceEventId, itemIds } = req.body");
    expect(ROTA).toContain("if (itemIds !== undefined) {");
  });

  it("cada id da seleção precisa SER do evento de origem — id alheio é recusado com contagem", () => {
    expect(ROTA).toContain("não pertencem ao evento de origem");
    expect(ROTA).toContain("const estranhos = itemIds.filter((id) => !daOrigem.has(id));");
  });

  it("seleção vazia e lista malformada não passam", () => {
    expect(ROTA).toContain("Nenhuma peça selecionada para clonar");
    expect(ROTA).toContain("itemIds deve ser uma lista de ids de peças");
  });

  it("a trilha diz quando foi seleção parcial — '3 de 12' e não só '3'", () => {
    expect(ROTA).toContain("seleção: ${created.length} de ${todasDaOrigem.length}");
  });
});

describe("o dialog", () => {
  it("busca as peças do evento de origem quando ele é escolhido", () => {
    expect(DIALOG).toContain('queryKey: ["/api/items", cloneSourceId]');
    expect(DIALOG).toContain("enabled: open && !!cloneSourceId");
  });

  it("nasce com TODAS marcadas — desmarcar exceções é mais rápido que marcar dezenas", () => {
    expect(DIALOG).toContain("setEscolhidas(new Set(pecasDaOrigem.map((i: any) => i.id)))");
  });

  it("tem marcar/desmarcar todas, busca e checkbox por linha", () => {
    expect(DIALOG).toContain('data-testid="button-alternar-todas"');
    expect(DIALOG).toContain('data-testid="input-busca-pecas-clone"');
    expect(DIALOG).toContain('data-testid={`linha-peca-clone-${i.id}`}');
  });

  it("o botão diz QUANTAS vai clonar e trava sem seleção", () => {
    expect(DIALOG).toContain("`Clonar ${escolhidas.size} ${escolhidas.size === 1");
    expect(DIALOG).toContain("escolhidas.size === 0}");
  });

  it("a confirmação entrega os ids escolhidos para quem abriu o dialog", () => {
    expect(DIALOG).toContain("onConfirmClone: (itemIds: string[]) => void");
    expect(DIALOG).toContain("onClick={() => onConfirmClone(Array.from(escolhidas))}");
    expect(DETALHE).toContain("cloneItemsMutation.mutate({ sourceEventId: cloneSourceId, itemIds })");
    expect(HOOK).toContain("{ sourceEventId, itemIds }");
  });

  it("o fluxo de criar-evento-clonando segue clonando TUDO — sem itemIds no corpo", () => {
    expect(EVENTOS).toContain("clone-items`, { sourceEventId: cloneFrom }");
  });
});

describe("o painel do select não é decepado pelo modal (print de 01/09)", () => {
  const FILTRO = ler("client/src/components/filter-select.tsx");

  it("a altura do painel é grampeada ao espaço da caixa — e ele abre para CIMA quando embaixo não cabe", () => {
    expect(FILTRO).toContain("const maxAltura = Math.max(120, Math.floor(paraCima ? acima : abaixo));");
    expect(FILTRO).toContain("const topJanela = paraCima ? rect.top - 6 - alturaEfetiva : rect.bottom + 6;");
    // coluna flex para a lista encolher; a busca não encolhe
    expect(FILTRO).toContain('maxHeight: pos?.maxAltura, display: "flex", flexDirection: "column"');
    expect(FILTRO).toContain('minHeight: 0, flex: "0 1 auto", overflowY: "auto"');
  });

  it("o modal do clone tem altura mínima para o menu de eventos abrir dentro dele", () => {
    expect(DIALOG).toContain("minHeight: 'min(480px, calc(100vh - 48px))'");
  });
});
