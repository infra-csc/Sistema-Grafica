// ─────────────────────────────────────────────────────────────────────────────
// REVISÃO: A COMPARAÇÃO SE VÊ DE UMA VEZ, E O MODAL É UMA FILA.
//
// Dois defeitos, e os dois são de tempo — não de aparência.
//
// 1. A COMPARAÇÃO. O modal existe para uma pergunta: o que o patrocinador
//    aprovou × o que a Arte finalizou. Os dois arquivos ficavam EMPILHADOS numa
//    coluna de 40%, cada um com `height: 32vh`, dentro de um contêiner rolável.
//    Era preciso rolar para ver o segundo — e uma comparação que não se vê de
//    uma vez não é comparação: é lembrar do primeiro enquanto se olha o
//    segundo. Numa janela de 540px de altura, 32vh + 32vh + rótulos + gap já
//    passava do que a coluna tinha.
//
// 2. A FILA. São 74 peças, e revisar cada uma era: clicar "Revisar", decidir, o
//    modal fecha, procurar a próxima na tabela, clicar de novo. E a tabela
//    mudou entre uma e outra — a peça decidida saiu dela —, então "procurar a
//    próxima" nem é procurar a linha de baixo.
//
// A metade de baixo deste arquivo é o guarda-costas do que já estava certo:
// os FreezeWhileClosing, a contagem de lote por `vivas` e as guardas de evento
// finalizado. Cada um tem um defeito concreto atrás de si, documentado nos
// comentários da tela.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const tela = readFileSync(
  path.resolve(__dirname, "../../client/src/pages/solicitacao.tsx"),
  "utf8",
);

/** Sem comentários — para asserções de ausência. */
const codigo = tela
  .replace(/\r\n/g, "\n")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .map(l => l.replace(/^\s*\/\/.*$/, ""))
  .join("\n");

function contraste(a: string, b: string): number {
  const lum = (h: string) => {
    const c = [1, 3, 5]
      .map(i => parseInt(h.slice(i, i + 2), 16) / 255)
      .map(v => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

describe("a comparação se vê de uma vez", () => {
  it("os dois arquivos ficam lado a lado, não empilhados", () => {
    expect(tela).toContain('gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr"');
    // O empilhamento por rolagem sumiu: a faixa não rola.
    expect(codigo).not.toContain('height: isMobile ? 220 : "32vh"');
  });

  it("a faixa tem piso e recorte — os dois, ou ela colapsa ou empurra", () => {
    // Com `flex: 1 1 auto; minHeight: 0` a faixa absorve todo o encolhimento e
    // colapsa; com um piso grande demais (300px) empurra o resto abaixo da
    // dobra numa janela de 540px. 200px fecha as duas contas.
    expect(tela).toContain('flex: "1 1 auto", minHeight: 200, overflow: "hidden"');
  });

  it("a moldura da imagem tem EIXO DEFINIDO, não só limites", () => {
    // `max-width: 100%; max-height: 100%; aspect-ratio: 3/2` sem largura nem
    // altura resolve para 2px: `max-*` LIMITA um tamanho, nunca o produz.
    expect(tela).toContain('flex: "1 1 auto", minHeight: isMobile ? 180 : 140, width: "100%"');
    expect(codigo).not.toContain("aspectRatio: \"3/2\"");
    // O conteúdo cabe inteiro, sem corte.
    expect(tela).toContain('objectFit="contain"');
  });

  it("a comparação tem a largura INTEIRA do modal", () => {
    // Duas gerações desta asserção: primeiro a coluna foi de 40% para 56%;
    // depois a reestruturação em faixas horizontais acabou com a coluna — a
    // comparação é uma faixa de largura cheia, e é a única que flexiona.
    expect(codigo).not.toContain('width: isMobile ? "100%" : "56%"');
    expect(codigo).not.toContain("review-modal-columns");
    expect(tela).toContain('flex: "1 1 auto", minHeight: 200, overflow: "hidden", backgroundColor: "#f5f5f4"');
  });

  it("cada pane declara se o arquivo existe", () => {
    expect(tela).toContain('backgroundColor: url ? "#15803d" : "#c2410c"');
  });

  it("a ficha técnica saiu da grade de seis cartões para uma linha", () => {
    expect(codigo).not.toContain('display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10');
  });
});

describe("o rótulo do primário não quebra nem invade", () => {
  it("o rótulo é caixa normal — a causa da colisão saiu na origem", () => {
    // Três gerações: (1) `nowrap` no botão resolveu a quebra em duas linhas
    // e criou a sobreposição — nada cortava o excesso; (2) overflow hidden +
    // elipse curou a sobreposição por contenção; (3) a reestruturação tirou
    // a CAUSA: "LIBERAR PARA PRODUÇÃO" com letterSpacing media ~40% mais
    // que "Liberar para produção", e era isso que não cabia. Caixa normal
    // numa faixa de largura cheia cabe — a elipse fica só de cinto de
    // segurança. A receita completa mora em modal-decisao-tres-defeitos.
    const i = tela.indexOf('data-testid="button-release-modal"');
    expect(i).toBeGreaterThan(-1);
    const bloco = tela.slice(i, i + 1900);
    expect(bloco).toContain('flex: "1 1 0", minWidth: 0, height: 48');
    expect(bloco).toContain("Liberar para produção");
    expect(bloco).not.toContain('textTransform: "uppercase"');
  });
});

describe("o modal é uma fila", () => {
  it("tem posição, anterior e próxima", () => {
    expect(tela).toContain('data-testid="button-modal-prev"');
    expect(tela).toContain('data-testid="button-modal-next"');
    expect(tela).toContain('data-testid="text-queue-position"');
    expect(tela).toContain("{filaIdx + 1} / {filteredItems.length}");
  });

  it("a posição é a da lista FILTRADA, na ordem que a tabela mostra", () => {
    expect(tela).toContain("filteredItems.findIndex((i: any) => i.id === selectedItem.id)");
  });

  it("as setas do teclado andam na fila e D devolve", () => {
    expect(tela).toContain('if (e.key === "ArrowLeft" && temAnterior)');
    expect(tela).toContain('if (e.key === "ArrowRight" && temProxima)');
    expect(tela).toContain('if ((e.key === "d" || e.key === "D") && !seloSelecionado)');
  });

  it("dá para entrar na fila pela tela", () => {
    expect(tela).toContain('data-testid="button-queue-start"');
    expect(tela).toContain("Revisar em fila ({filteredItems.length})");
  });

  it("depois de decidir, avança em vez de fechar — e o congelamento fica", () => {
    // O truque: depois da decisão a peça sai de `pendingItems` e da lista
    // filtrada, então o índice que ERA o dela passa a ser o da seguinte —
    // avançar é FICAR NO MESMO ÍNDICE.
    expect(tela).toContain("const marcarAvanco = (): boolean =>");
    expect(tela).toContain("proximaAposDecidir.current = filaIdx;");
    const fechamentos = tela.match(/if \(!marcarAvanco\(\)\) \{ setModalOpen\(false\); setSelectedItem\(null\); \}/g) ?? [];
    expect(fechamentos.length).toBe(2); // liberar e devolver
    // E o `setModalOpen(false)` incondicional não voltou nesses dois pontos.
    expect(codigo).not.toContain("setModalOpen(false); setSelectedItem(null); setReleaseConfirmOpen(false);");
  });

  it("trocar de peça zera os campos de edição da anterior", () => {
    // Sem isto a observação digitada na peça 3 aparecia na 4.
    const i = tela.indexOf("const irParaFila = (idx: number)");
    const bloco = tela.slice(i, i + 700);
    expect(bloco).toContain("setReturnObservations(\"\");");
    expect(bloco).toContain("setCardObservations(alvo.observations || \"\");");
  });

  it("a posição é anunciada para leitor de tela", () => {
    const i = tela.indexOf('data-testid="text-queue-position"');
    expect(tela.slice(i - 200, i + 200)).toContain('aria-live="polite"');
  });
});

describe("dá para saber o que falta sem abrir nada", () => {
  it("a coluna de arquivo final existe, nos dois estados", () => {
    expect(tela).toContain("data-testid={`cell-final-file-${item.id}`}");
    expect(tela).toContain("/> Recebido");
    expect(tela).toContain("/> Aguardando");
  });

  it("a frase de resolução substitui a descrição da tela", () => {
    expect(tela).toContain('data-testid="frase-resolucao"');
    expect(codigo).not.toContain("A última conferência antes da produção");
  });

  it("e concorda singular e plural", () => {
    const i = tela.indexOf("const fraseDeResolucao");
    const bloco = tela.slice(i, i + 1100);
    expect(bloco).toContain('prontas === 1 ? "peça está pronta" : "peças estão prontas"');
    expect(bloco).toContain('semArquivo === 1 ? "espera" : "esperam"');
    expect(bloco).toContain("é só decidir.");
  });

  it("são quatro colunas, não sete", () => {
    expect(tela).toContain('{ label: "Peça", w: undefined }');
    expect(tela).toContain('{ label: "Qtd · Dim · m²", w: 190 }');
    expect(tela).toContain('{ label: "Arquivo final", w: 140 }');
    expect(codigo).not.toContain('{ label: "Descrição da Peça"');
    expect(codigo).not.toContain('{ label: "Dim (LxA)"');
  });

  it("a linha inteira abre o modal, e checkbox e ações não propagam", () => {
    expect(tela).toContain("onClick={() => openModal(item)}");
    expect(tela).toContain('<td onClick={e => e.stopPropagation()} style={{ padding: "14px 24px", textAlign: "center" }}>');
    expect(tela).toContain('<td onClick={e => e.stopPropagation()} style={{ padding: "12px 16px", textAlign: "right" }}>');
  });
});

describe("os chips de faceta contam o que entregam", () => {
  it("as duas dimensões entraram DENTRO do casaRecorte", () => {
    // Filtrar por fora, depois de `filteredItems`, é o furo que o teste de
    // invariante existe para pegar — e a contagem do chip ligado passaria a ser
    // a de si mesmo.
    expect(tela).toContain("const casaRecorte = (item: any, excluir?: 'evento' | 'tipo' | 'sem-arquivo' | 'evento-finalizado')");
    expect(tela).toContain("if (excluir !== 'sem-arquivo' && soSemArquivo && !!item.finalFileUrl) return false;");
    expect(tela).toContain("if (excluir !== 'evento-finalizado' && soEventoFinalizado && !selosPorItem.has(item.id)) return false;");
  });

  it("cada contagem exclui a própria dimensão", () => {
    expect(tela).toContain("casaRecorte(i, 'sem-arquivo') && !i.finalFileUrl");
    expect(tela).toContain("casaRecorte(i, 'evento-finalizado') && selosPorItem.has(i.id)");
  });

  it("chip sem nenhuma peça não vira clique que devolve vazio", () => {
    expect(tela).toContain("if (chip.n === 0 && !chip.ligado) return null;");
  });

  it("e os testids estão lá", () => {
    // Montados por template (`data-testid={chip.testid}`), então um grep
    // literal não os encontra — mas o DOM os recebe.
    expect(tela).toContain("data-testid={chip.testid}");
    expect(tela).toContain('testid: "chip-sem-arquivo"');
    expect(tela).toContain('testid: "chip-evento-finalizado-faceta"');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// O QUE NÃO PODE TER SIDO MEXIDO
// ═════════════════════════════════════════════════════════════════════════════
describe("o congelamento continua em todos os pontos", () => {
  it("os sete FreezeWhileClosing estão lá — e são sete, não quinze", () => {
    // Cada um cura o laço do React #185: o onSuccess invalida, fecha o modal,
    // fecha o AlertDialog e faz `setSelectedItem(null)` no mesmo commit — e
    // `selectedItem` é a fonte de todo o miolo.
    //
    // A contagem correta é SETE (o modal e seis AlertDialogs). Um `grep -c`
    // pelo nome devolve 16 porque conta linhas — abertura, fechamento, o import
    // e um comentário —, e foi assim que "15" virou um número que eu repeti
    // sem medir. Aqui contamos só as ABERTURAS.
    // `split` em vez de regex: o nome tem barra no fechamento e escapar isso
    // dentro de um literal já custou um erro de parse aqui.
    const aberturas = tela.split("<FreezeWhileClosing").length - 1;
    const fechamentos = tela.split("</FreezeWhileClosing>").length - 1;
    expect(aberturas).toBe(7);
    expect(fechamentos).toBe(aberturas);
  });
});

describe("a contagem de lote continua por `vivas`", () => {
  it("não voltou a contar a seleção", () => {
    // O rodapé removido contava `selectedItemIds.size` e prometia "Liberar 12"
    // mandando 9 — espelho do 409 de lote inteiro do servidor.
    expect(tela).toContain("selecaoLote.vivas");
    expect(tela).toContain('data-testid="button-bulk-release-hero"');
    expect(tela).toContain('data-testid="button-bulk-return-hero"');
  });
});

describe("as guardas de evento finalizado", () => {
  it.each([
    ["o selo por peça", "seloDoItem"],
    ["o mapa de selos", "selosPorItem"],
    ["o motivo da ação bloqueada", "motivoAcaoBloqueada"],
    ["o aviso do lote", "avisoLoteFinalizadas"],
    ["o selo na linha", "badge-evento-finalizado-"],
    ["o aviso na ficha", "aviso-ficha-evento-finalizado"],
    ["o chip do filtro", "chip-evento-finalizado"],
  ])("%s continua", (_nome, trecho) => {
    expect(tela).toContain(trecho);
  });

  it("os botões continuam VISÍVEIS e desabilitados, com motivo", () => {
    // Sumir com eles deixa a ficha sem explicação para a ausência.
    expect(tela).toContain("disabled={!!seloSelecionado || creatorReviewMutation.isPending || !selectedItem?.finalFileUrl}");
    expect(tela).toContain('motivoAcaoBloqueada(seloSelecionado.motivo, "liberar para produção")');
  });

  it("e o contraste calculado do estado 'off' segue ≥ 4,5:1 na faixa clara", () => {
    // A faixa de decisão deixou de ser uma caixa escura, então o par de
    // contraste trocou junto: era #d6d3d1 sobre #292524 (10,18:1); agora é
    // #6f6a64 sobre #f5f5f4 (4,91:1) — o único "off" desta tela que carrega
    // informação nova continua legível. O sólido virou #c2410c com branco.
    expect(tela).toContain('color: seloSelecionado || !selectedItem?.finalFileUrl ? "#6f6a64" : "#fff"');
    expect(contraste("#6f6a64", "#f5f5f4")).toBeGreaterThanOrEqual(4.5);
    expect(contraste("#ffffff", "#c2410c")).toBeGreaterThanOrEqual(4.5);
  });
});

describe("o resto do que estava certo", () => {
  it.each([
    ["quantidade editável por teclado", 'data-testid="input-quantity-edit"'],
    ["observações do item", 'data-testid="textarea-item-observations"'],
    ["rodapé de atalhos só no desktop", "{!isMobile && ("],
    ["atalho da barra de busca", 'data-testid="input-search"'],
    ["filtros espelhados na URL", "filtrosRevisaoParaQuery"],
    ["alvo de toque do checkbox no celular", "44"],
  ])("%s continua", (_nome, trecho) => {
    expect(tela).toContain(trecho);
  });

  it("o cabeçalho enxuto não voltou a crescer", () => {
    // Era um bloco preto de 275px com título de 56px e um olho decorativo.
    expect(tela).toContain("fontSize: isMobile ? 20 : 24");
  });
});

describe("contraste do que entrou", () => {
  it.each([
    ["#57534e", "#ffffff", "frase de resolução e descrição da peça"],
    ["#7a6154", "#fafaf9", "rótulo de coluna sobre o thead"],
    ["#c2410c", "#ffffff", "displayId em DM Mono"],
    ["#166534", "#f0fdf4", "pílula Recebido"],
    ["#9a3412", "#fff7ed", "pílula Aguardando"],
    ["#44403c", "#ffffff", "chip de faceta desligado"],
    ["#ffffff", "#1c1917", "chip de faceta ligado"],
  ])("%s sobre %s — %s", (frente, fundo) => {
    expect(contraste(frente, fundo)).toBeGreaterThanOrEqual(4.5);
  });

  it("o #746e69 do thead de fato passava raspando — a troca foi por margem", () => {
    // Registrado para ninguém tratar como defeito de acessibilidade: 4,55 passa.
    expect(contraste("#746e69", "#fafaf9")).toBeGreaterThanOrEqual(4.5);
    expect(contraste("#7a6154", "#fafaf9")).toBeGreaterThan(contraste("#746e69", "#fafaf9"));
  });
});
