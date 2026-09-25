// ─────────────────────────────────────────────────────────────────────────────
// REVISÃO: "Reaproveitar" também dentro da ficha de decisão.
//
// O gesto existia só na linha da tabela. Quem revisa em fila decide dentro da
// ficha — e para reaproveitar precisava fechar, achar a linha, clicar no
// ícone, e perder a posição na fila.
//
// A regra que este teste guarda: o botão da ficha dispara o MESMO fluxo do
// botão da linha — abre o diálogo de total/parcial, ou desfaz a marcação. Dois
// botões, um caminho. Um segundo caminho para a mesma decisão é o que faz as
// duas telas divergirem no primeiro ajuste.
//
// A tela foi dividida (página + components/revisao/). O "um caminho" ficou
// literal: a página tem UMA função, `abrirReaproveitamento`, e a entrega à
// ficha, à tabela e aos cartões; cada um só a chama com a sua peça.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { fonteDaRevisao, lerDaRaiz } from "./fonte-das-telas-da-arte";

const REV = fonteDaRevisao();
const PAGINA = lerDaRaiz("client/src/pages/solicitacao.tsx");
const FICHA = lerDaRaiz("client/src/components/revisao/ficha-decisao.tsx");
const LINHA = lerDaRaiz("client/src/components/revisao/linha-da-peca.tsx");
const CARTAO = lerDaRaiz("client/src/components/revisao/cartao-da-peca.tsx");

/** O corpo de `abrirReaproveitamento` na página. */
function caminhoUnico(): string {
  const i = PAGINA.indexOf("const abrirReaproveitamento = useCallback(");
  expect(i).toBeGreaterThan(-1);
  return PAGINA.slice(i, PAGINA.indexOf("}, []);", i));
}

describe("o botão da ficha", () => {
  const i = FICHA.indexOf('data-testid="button-reuse-modal"');
  const bloco = FICHA.slice(i - 1400, i + 1200);

  it("existe, na faixa de decisão, depois de Liberar e Devolver", () => {
    expect(i).toBeGreaterThan(FICHA.indexOf('data-testid="button-return-toggle"'));
    // O ícone do reaproveitamento, agora pelo <Botao icone>.
    expect(bloco).toContain("icone={Recycle}");
    expect(bloco).toContain('selectedItem?.isReuse ? "Reaproveitada · desfazer" : "Reaproveitar"}');
  });

  it("dispara o MESMO fluxo do botão da linha", () => {
    // Marcada: pede confirmação para desfazer. Não marcada: abre o diálogo de
    // total/parcial, com a quantidade parcial inicializada do mesmo jeito.
    const corpo = caminhoUnico();
    expect(corpo).toContain("if (item.isReuse) setDesfazerReuseId(item.id);");
    expect(corpo).toContain("setPartialReuseQty(Math.max(1, Number(item.quantity) - 1 || 1));");
    expect(corpo).toContain("setReuseDialogItemId(item.id);");
    // A ficha, a tabela e os cartões recebem essa MESMA função…
    expect(PAGINA.split("aoReaproveitar={abrirReaproveitamento}").length - 1).toBe(3);
    // …e cada botão só a chama com a sua peça — nenhum virou "o outro jeito".
    expect(bloco).toContain("aoReaproveitar(selectedItem);");
    expect(LINHA).toContain("aoReaproveitar(item);");
    expect(CARTAO).toContain("aoReaproveitar(item);");
    expect(REV).toContain("data-testid={`button-reuse-${item.id}`}");
    // Ninguém fora da página reabre o diálogo por conta própria.
    for (const f of [FICHA, LINHA, CARTAO]) expect(f).not.toContain("setReuseDialogItemId");
  });

  it("respeita a guarda de evento finalizado, como os outros dois", () => {
    expect(bloco).toContain("if (seloSelecionado || !selectedItem) return;");
    expect(bloco).toContain('motivoAcaoBloqueada(seloSelecionado.motivo, "marcar reaproveitamento")');
    expect(bloco).toContain("disabled={!!seloSelecionado || reaproveitando}");
    expect(PAGINA).toContain("reaproveitando={toggleReuseMutation.isPending}");
  });

  it("é o terceiro e mais estreito — os dois primeiros não perdem largura", () => {
    // A colisão de rótulos já aconteceu uma vez nesta faixa; o terceiro botão
    // tem largura de conteúdo no desktop e vai para a linha de baixo no celular.
    expect(bloco).toContain('flex: isMobile ? "1 1 100%" : "0 0 auto", height: 48');
    // A fileira quebra também no desktop (25/09): sem espaço, o Reaproveitar
    // desce de linha em vez de espremer Liberar e Devolver.
    expect(FICHA).toContain('<div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>');
    // Os dois primeiros continuam com a receita deles, e só eles.
    expect((REV.match(/flex: "1 1 auto", minWidth: 0, height: 48,/g) ?? []).length).toBe(2);
  });
});

describe("decidir pela ficha avança a fila, como Liberar e Devolver", () => {
  /** O corpo do callback de uma prop do DialogoReaproveitamento, na página. */
  const callback = (prop: string) => {
    const i = PAGINA.indexOf(`${prop}={(dialogItem) => {`);
    expect(i).toBeGreaterThan(-1);
    return PAGINA.slice(i, PAGINA.indexOf("}}", i));
  };

  it("a regra do avanço, uma só", () => {
    const i = PAGINA.indexOf("const avancarSeDaFicha = (itemId: string) => {");
    expect(i).toBeGreaterThan(-1);
    expect(PAGINA.slice(i, i + 300)).toContain("if (modalOpen && selectedItem?.id === itemId && !marcarAvanco()) { setModalOpen(false); setSelectedItem(null); }");
  });

  it("reaproveitar tudo", () => {
    const corpo = callback("aoReaproveitarTudo");
    // Avança ANTES de mandar: depois, a peça já saiu da lista filtrada.
    expect(corpo.indexOf("avancarSeDaFicha(dialogItem.id);")).toBeGreaterThan(-1);
    expect(corpo.indexOf("avancarSeDaFicha(dialogItem.id);")).toBeLessThan(corpo.indexOf("toggleReuseMutation.mutate({ itemId: dialogItem.id, isReuse: true });"));
  });

  it("reaproveitar parte", () => {
    const corpo = callback("aoReaproveitarParte");
    expect(corpo.indexOf("avancarSeDaFicha(dialogItem.id);")).toBeGreaterThan(-1);
    expect(corpo.indexOf("avancarSeDaFicha(dialogItem.id);")).toBeLessThan(corpo.indexOf("partialReuseMutation.mutate({ itemId: dialogItem.id, reuseQty: partialReuseQty });"));
  });

  it("e só quando o diálogo foi aberto de dentro da ficha daquela peça", () => {
    // Aberto pela linha da tabela (modal fechado), nada de mexer na fila.
    expect((REV.match(/modalOpen && selectedItem\?\.id === itemId && !marcarAvanco\(\)/g) ?? []).length).toBe(1);
    expect((PAGINA.match(/avancarSeDaFicha\(dialogItem\.id\);/g) ?? []).length).toBe(2);
  });
});
describe("Reaproveitar em LOTE na barra de seleção", () => {
  // Com 2+ selecionadas, a barra ganha "Reaproveitar N" ao lado de
  // Liberar/Devolver. É o reaproveitamento TOTAL — o parcial fica no ícone da
  // linha, onde a quantidade é decidida peça a peça.
  it("o botão existe, só com 2+ selecionadas, contando as vivas", () => {
    expect(REV).toContain('data-testid="button-bulk-reuse-hero"');
    expect(REV).toContain("{selecaoLote.ids.length >= 2 && (");
    expect(REV).toContain("`Reaproveitar ${selecaoLote.vivas.length}`");
  });

  it("dispara o MESMO par de chamadas do total individual, peça a peça", () => {
    expect(REV).toContain("const bulkReuseMutation = useMutation({");
    expect(REV).toContain("await apiRequest(\"PATCH\", `/api/items/${id}`, { isReuse: true, reuseQty: qtd });");
    expect(REV).toContain("await apiRequest(\"PATCH\", `/api/items/${id}/creator-review`, {});");
    // marcou-sem-liberar é MEIO caminho, não falha igual: continua selecionada
    // para o "Liberar" da barra fechar — com o motivo do servidor na linha
    expect(REV).toContain("semLiberar[id] = `Marcada, mas não liberada: ${parseApiError(e).message}`;");
  });

  it("tem confirmação própria, congelada ao fechar, e respeita evento finalizado", () => {
    const CONFIRMACAO = lerDaRaiz("client/src/components/revisao/confirmar-lote-reaproveitar.tsx");
    expect(CONFIRMACAO).toContain('data-testid="button-bulk-reuse-confirm"');
    expect(CONFIRMACAO).toContain("<FreezeWhileClosing open={open}>");
    expect(PAGINA).toContain("open={bulkReuseConfirmOpen}");
    // lote misto: só as vivas vão; o aviso das finalizadas aparece no diálogo
    expect(PAGINA).toContain("bulkReuseMutation.mutate(selecaoLote.vivas)");
    expect(CONFIRMACAO).toContain('data-testid="aviso-bulk-reuse-finalizadas"');
    // e o atalho "/" se cala com o diálogo aberto, como nos outros
    expect(PAGINA).toContain("|| bulkReuseConfirmOpen");
  });
});
