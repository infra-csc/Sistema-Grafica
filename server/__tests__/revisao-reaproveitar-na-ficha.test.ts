// ─────────────────────────────────────────────────────────────────────────────
// REVISÃO: "Reaproveitar" também dentro da ficha de decisão.
//
// Pedido do dono, com captura (peça #3048, 26/48 na fila): o gesto existia só
// na linha da tabela. Quem revisa em fila decide dentro da ficha — e para
// reaproveitar precisava fechar, achar a linha, clicar no ícone, e perder a
// posição na fila.
//
// A regra que este teste guarda: o botão da ficha dispara o MESMO fluxo do
// botão da linha — abre o diálogo de total/parcial, ou desfaz a marcação. Dois
// botões, um caminho. Um segundo caminho para a mesma decisão é o que faz as
// duas telas divergirem no primeiro ajuste.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const REV = readFileSync(path.resolve(__dirname, "../../client/src/pages/solicitacao.tsx"), "utf8");

describe("o botão da ficha", () => {
  const i = REV.indexOf('data-testid="button-reuse-modal"');
  const bloco = REV.slice(i - 1400, i + 1200);

  it("existe, na faixa de decisão, depois de Liberar e Devolver", () => {
    expect(i).toBeGreaterThan(REV.indexOf('data-testid="button-return-toggle"'));
    expect(bloco).toContain("<Recycle style={{ width: 15, height: 15, flexShrink: 0 }} />");
    expect(bloco).toContain('{selectedItem?.isReuse ? "Reaproveitada" : "Reaproveitar"}');
  });

  it("dispara o MESMO fluxo do botão da linha", () => {
    // Marcada: desfaz. Não marcada: abre o diálogo de total/parcial, com a
    // quantidade parcial inicializada do mesmo jeito.
    expect(bloco).toContain("toggleReuseMutation.mutate({ itemId: selectedItem.id, isReuse: false });");
    expect(bloco).toContain("setPartialReuseQty(Math.max(1, Number(selectedItem.quantity) - 1 || 1));");
    expect(bloco).toContain("setReuseDialogItemId(selectedItem.id);");
    // E o da linha continua igual — nenhum dos dois virou "o outro jeito".
    expect(REV).toContain("setPartialReuseQty(Math.max(1, Number(item.quantity) - 1 || 1));");
    expect(REV).toContain("data-testid={`button-reuse-${item.id}`}");
  });

  it("respeita a guarda de evento finalizado, como os outros dois", () => {
    expect(bloco).toContain("if (seloSelecionado || !selectedItem) return;");
    expect(bloco).toContain('motivoAcaoBloqueada(seloSelecionado.motivo, "marcar reaproveitamento")');
    expect(bloco).toContain("disabled={!!seloSelecionado || toggleReuseMutation.isPending}");
  });

  it("é o terceiro e mais estreito — os dois primeiros não perdem largura", () => {
    // A colisão de rótulos já aconteceu uma vez nesta faixa; o terceiro botão
    // tem largura de conteúdo no desktop e vai para a linha de baixo no celular.
    expect(bloco).toContain('flex: isMobile ? "1 1 100%" : "0 0 auto", height: 48');
    expect(REV).toContain('<div style={{ display: "flex", gap: 10, flexWrap: isMobile ? "wrap" : "nowrap" }}>');
    // Os dois primeiros continuam com a receita deles, e só eles.
    expect((REV.match(/flex: "1 1 0", minWidth: 0, height: 48,/g) ?? []).length).toBe(2);
  });
});

describe("decidir pela ficha avança a fila, como Liberar e Devolver", () => {
  it("reaproveitar tudo", () => {
    const i = REV.indexOf("Reaproveitar tudo ({qty} un.) — pula produção");
    const antes = REV.slice(i - 1500, i);
    expect(antes).toContain("if (modalOpen && selectedItem?.id === dialogItem.id && !marcarAvanco()) { setModalOpen(false); setSelectedItem(null); }");
  });

  it("reaproveitar parte", () => {
    const i = REV.indexOf("partialReuseMutation.mutate({ itemId: dialogItem.id, reuseQty: partialReuseQty });");
    const antes = REV.slice(i - 400, i);
    expect(antes).toContain("if (modalOpen && selectedItem?.id === dialogItem.id && !marcarAvanco()) { setModalOpen(false); setSelectedItem(null); }");
  });

  it("e só quando o diálogo foi aberto de dentro da ficha daquela peça", () => {
    // Aberto pela linha da tabela (modal fechado), nada de mexer na fila.
    expect((REV.match(/modalOpen && selectedItem\?\.id === dialogItem\.id && !marcarAvanco\(\)/g) ?? []).length).toBe(2);
  });
});
