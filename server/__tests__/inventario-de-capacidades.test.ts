// ─────────────────────────────────────────────────────────────────────────────
// INVENTÁRIO DE CAPACIDADES — o que uma revisão de DESIGN não pode levar junto.
//
// ── Por que este arquivo existe ──
//
// Uma sequência de revisões de design (ago/2026) passou por oito telas. Cada
// uma tinha um teste guardando a sua lista de "o que não mexer", e mesmo assim
// TRÊS CAPACIDADES SUMIRAM sem ninguém perceber, todas na mesma tela:
//
//   · o chip "Todos"          — vincular as cinco marcas de uma peça num clique
//   · "Descartar alterações"  — desfazer o rascunho local de uma peça
//   · o checkbox do tipo      — marcar as 14 "Placa KM" de uma vez
//
// Nenhuma foi uma decisão. Todas foram efeito colateral: ao fundir duas árvores
// de JSX numa só, os controles que existiam só em uma delas não foram
// transportados — e o compilador ficou quieto, porque a função que sobrou sem
// consumidor eu li como "código morto" e removi. Código sem consumidor DEPOIS
// de uma refatoração minha não é código morto: é uma capacidade que eu acabei
// de derrubar.
//
// A lição, e por que os testes por tela não bastaram: eles guardavam o que o
// PROMPT mandou preservar. Ninguém escreve na lista de "não mexer" o botão que
// esqueceu que existia. O que faltava era um inventário do que a tela SABE
// FAZER hoje — não do que alguém lembrou de citar.
//
// ── Como usar quando este teste reprovar ──
//
// A falha diz: "a tela X perdeu o controle Y". Duas saídas, e só duas:
//
//   1. Foi sem querer → devolva o controle. É o caso comum.
//   2. Foi de propósito → apague a linha daqui NO MESMO COMMIT, com o porquê na
//      mensagem. Substituir um controle por outro melhor é legítimo; o que não
//      pode é sumir em silêncio.
//
// Nunca "conserte" a falha trocando o testid por outro parecido sem olhar a
// tela: o objetivo aqui não são strings, é o trabalho que alguém deixa de
// conseguir fazer.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const ler = (rel: string) => readFileSync(path.resolve(__dirname, "../../", rel), "utf8");

/**
 * Os testids que um arquivo declara — literais e prefixos de template.
 *
 * `data-testid={`item-row-${id}`}` conta como o prefixo `item-row-`: é o que
 * dá para verificar sem montar o DOM, e é o que muda quando um controle some.
 *
 * As TRÊS FORMAS importam, e esquecer uma gera alarme falso — o que é pior que
 * não ter teste, porque ensina a ignorar a falha:
 *
 *   data-testid="x"        no elemento
 *   testId="x"             passado como prop (FilterSelect, ShortcutPill…)
 *   testid: "x"            dentro de um objeto de configuração
 *
 * A primeira versão deste extrator só via a primeira, e acusou dezoito
 * controles como perdidos quando nenhum tinha saído do lugar.
 */
function capacidadesDe(fonte: string): Set<string> {
  const out = new Set<string>();
  const padroes = [
    /\btestId=[`"]([^`"$]*)/g,
    /\btestId:\s*[`"]([^`"$]*)/g,
    /\btestid:\s*[`"]([^`"$]*)/g,
  ];
  for (const re of padroes) {
    for (const m of fonte.matchAll(re)) {
      const t = m[1].trim();
      if (t) out.add(t);
    }
  }
  // `data-testid` aceita expressão inteira: o valor pode vir de um ternário
  // (`{dark ? "stat-total" : `stat-card-${k}`}`), e um regex que só olhasse o
  // primeiro caractere depois do `{` perderia os dois ramos.
  for (const m of fonte.matchAll(/data-testid=(\{[^}]*\}|"[^"]*")/g)) {
    for (const lit of m[1].matchAll(/[`"]([^`"$]*)/g)) {
      const t = lit[1].trim();
      if (t) out.add(t);
    }
  }
  return out;
}

/**
 * O CONTRATO. Cada entrada é um controle que a tela oferecia antes da série de
 * revisões de design e que continua tendo de existir.
 *
 * Só entram aqui os que sobreviveram à conferência manual — os que foram
 * SUBSTITUÍDOS por algo melhor estão listados logo abaixo, com o substituto,
 * para ninguém os "restaurar" por engano.
 */
const CONTRATO: Record<string, string[]> = {
  "client/src/pages/vincular-patrocinadores.tsx": [
    // Trabalho em lote — o motivo de a tela existir, numa fila de 1.120 peças.
    "checkbox-item-",
    "checkbox-select-all-",
    "checkbox-group-",          // marcar todas as peças de um tipo
    "btn-select-all-",          // vincular todas as marcas de uma peça
    "button-apply-bulk-sponsors",
    "button-save-selected",
    "button-clear-selection",
    // Por peça.
    "button-save-item-",
    "button-discard-item-",     // desfazer o rascunho local
    "button-send-item-",
    "btn-skip-sponsor-",
    "btn-reuse-",
    "button-return-creation-",
    "checkbox-sponsor-",
    "text-display-id-",
    "item-row-",
    "link-reference-vincular-",
    // Filtros e modais.
    "input-search-events",
    "select-sponsor-filter",
    "select-item-filter",
    "button-auto-vincular",
    "button-auto-link-confirm",
    "button-auto-link-cancel",
    "button-finalizar-lote",
    "button-manage-event-sponsors-",
    "button-save-event-sponsors",
    "button-confirm-bulk-apply",
    "aviso-eventos-encerrados",
    "button-show-all-",
  ],
  "client/src/pages/eventos.tsx": [
    "card-event-",
    "link-event-",
    "button-edit-event-",
    "button-delete-event-",
    "button-duplicate-event-",
    "button-close-event-",
    "button-reopen-event-",
    "filter-priority",
    "filter-sponsor",
    "select-month-filter",
    "button-next-10-days-filter",
    "button-clear-filters",
    "button-show-all-events",
  ],
  "client/src/pages/solicitacao.tsx": [
    "input-search",
    "select-type-filter",
    "button-clear-filters",
    "checkbox-select-all",
    "checkbox-select-all-header",
    "checkbox-item-",
    "row-item-",
    "text-display-id-",
    "button-review-",
    "button-reuse-",
    "button-delete-",
    "button-bulk-release-hero",
    "button-bulk-return-hero",
    "chip-selecao",
    "button-clear-selection",
    "aviso-lote-evento-finalizado",
    "chip-evento-finalizado",
    "badge-evento-finalizado-",
    "button-release-modal",
    "button-return-toggle",
    "aviso-ficha-evento-finalizado",
    "input-quantity-edit",
    "button-confirm-quantity",
    "button-cancel-quantity",
    "textarea-item-observations",
    "button-save-observations",
    "textarea-return-quick",
    "link-reference-solicitacao-",
  ],
  "client/src/pages/painel-geral.tsx": [
    "title-painel-geral",
    "painel-frescor",
    "button-export-painel",
    "button-export-pdf-painel",
    "button-export-xlsx-painel",
    "chip-atencao-reprovadas",
    "chip-atencao-atrasadas",
    "chip-atencao-ocultas",
    "fluxo-seg-",
    "stat-total",
    "stat-card-",
    "button-toggle-kpis",
    "visao-",
    "checkbox-all-",
    "item-row-",
    "text-display-id-",
    "button-view-",
    "button-delete-",
    "button-restore-",
    "selo-evento-",
    "selo-peca-",
    "chip-prazo-",
    "button-show-all-",
    "button-mostrar-ocultas-vazio",
  ],
  "client/src/pages/registros.tsx": [
    "stat-",
    "filter-kind",
    "filter-event",
    "select-period-filter",
    "button-clear-filters",
    "card-photo-",
    "link-event-",
    "img-zoom",
    "button-zoom-prev",
    "button-zoom-next",
    "button-zoom-download",
    "button-load-more",
    "button-retry-registros",
    "input-search-registros",
  ],
  "client/src/pages/calendario.tsx": [
    "title-calendario",
    "button-prev-month",
    "button-next-month",
    "button-today",
    "button-retry-calendar",
    "calendar-day-",
    "urgent-event-",
    "upcoming-event-",
    "dialog-event-",
    "dialog-deadline-",
  ],
  "client/src/components/item-details-dialog.tsx": [
    "chip-aprovacao-",
    "button-revert-approval-",
    // O caminho do arquivo da gráfica é rede (\\10.100.1.7\…): o navegador
    // não abre e a linha em elipse não deixava nem selecionar. Copiar é o
    // único gesto que funciona — e não existia.
    "button-copiar-caminho-final",
  ],
  "client/src/components/import-xlsx-dialog.tsx": [
    "dropzone-xlsx",
    "button-preview-import",
    "button-confirm-import",
    // `button-force-import` SAIU, e esta é a única baixa do contrato que não
    // é uma perda — o controle não existia de fato.
    //
    // Ele vivia dentro de um aviso de reimportação que nunca apareceu: o
    // cliente esperava um 409 `duplicate_detected` que o servidor não manda
    // nem nunca mandou (`confirm-import` lê `{ items, fileName }` e o `force`
    // viajava e era ignorado). Um botão inalcançável não é uma capacidade; é
    // a APARÊNCIA de uma, e era pior que a ausência, porque ocupava o lugar
    // da detecção que ninguém foi escrever — reimportar a mesma planilha
    // duplicava o evento inteiro em silêncio.
    //
    // A capacidade — avisar antes de duplicar — está viva pela primeira vez,
    // nos três controles abaixo, e agora no PREVIEW: antes de importar,
    // contra as peças que o evento já tem, dizendo QUAIS se repetem.
    "aviso-reimportacao",
    "button-ver-repetidas",
    "button-remover-repetidas",
    "triagem-",
  ],
};

describe("nenhuma revisão de design leva uma capacidade junto", () => {
  for (const [arquivo, esperados] of Object.entries(CONTRATO)) {
    describe(path.basename(arquivo), () => {
      const tem = capacidadesDe(ler(arquivo));
      it.each(esperados)("continua oferecendo `%s`", (testid) => {
        expect(
          tem.has(testid),
          `${path.basename(arquivo)} perdeu o controle \`${testid}\`.\n\n` +
          `Se foi sem querer, devolva o controle.\n` +
          `Se foi de propósito, apague a linha do CONTRATO neste mesmo commit e ` +
          `diga na mensagem o que entrou no lugar.`,
        ).toBe(true);
      });
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// SUBSTITUÍDOS DE PROPÓSITO — não restaure.
//
// Cada linha registra um controle que saiu porque outro passou a fazer o mesmo,
// e melhor. Estão aqui para que uma varredura futura não os "devolva" achando
// que foram perdidos, e para que o substituto seja verificável.
// ─────────────────────────────────────────────────────────────────────────────
describe("o que saiu de propósito, e o que ficou no lugar", () => {
  it.each([
    [
      "client/src/pages/eventos.tsx",
      "button-toggle-completed",
      "toggle-situacao-",
      'o botão "Ocultar concluídos" virou três alternadores que particionam e contam',
    ],
    [
      "client/src/pages/vincular-patrocinadores.tsx",
      "tab-",
      "segmented-group-by",
      "as duas abas viraram um controle de agrupamento sobre uma tabela só",
    ],
    [
      "client/src/pages/vincular-patrocinadores.tsx",
      "sp-btn-link-",
      "checkbox-sponsor-",
      "vincular/desvincular virou o chip da própria linha, igual nos dois agrupamentos",
    ],
    [
      "client/src/pages/vincular-patrocinadores.tsx",
      "button-send-all-ready",
      "button-finalizar-lote",
      'o ícone "enviar todos" dos cartões era duplicata do botão "Enviar N para Arte" do topo',
    ],
  ])("%s: `%s` → `%s` (%s)", (arquivo, saiu, entrou) => {
    const tem = capacidadesDe(ler(arquivo));
    expect(tem.has(saiu), `\`${saiu}\` voltou — confira se é mesmo necessário`).toBe(false);
    expect(tem.has(entrou), `o substituto \`${entrou}\` não está mais lá`).toBe(true);
  });
});
