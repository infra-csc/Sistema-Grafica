// ─────────────────────────────────────────────────────────────────────────────
// O REFINO DA APROVAÇÃO DO PATROCINADOR NÃO PODE VOLTAR ATRÁS.
//
// Um diff de estilo é o tipo de mudança que nenhum teste de comportamento
// percebe sendo desfeita. Os pontos que este arquivo guarda:
//
//   1. GRADIENTE. A tela tinha quatro: o cabeçalho quase preto do painel de
//      lote, dois ladrilhos laranja e o botão "Aprovar" em verde com sombra
//      verde. Verde nesta tela é o ESTADO "aprovado" — o que a peça vira
//      DEPOIS da decisão —, então pintar de verde o botão que ainda vai
//      decidir usa a cor do resultado para fazer o pedido. Sobrou um só, e é
//      funcional: o véu que indica que a lista de patrocinadores rola.
//
//   2. AS DUAS COLUNAS DO MODAL. Eram três (1fr 2fr 1fr) e a arte — a única
//      coisa que a pessoa precisa OLHAR para decidir — ficava com metade da
//      largura, com a decisão espremida embaixo dela.
//
//   3. O PLACAR. As três primeiras células são chaves EXCLUSIVAS de
//      `situacaoDaPeca`; a quarta ("passaram do prazo") é outra dimensão e
//      CRUZA com elas. Se alguém somar as quatro, o número não fecha com a
//      lista — por isso a quarta é separada por uma régua mais forte.
//
//   4. TABULAR-NUMS. Contagem e data que mudam de largura fazem a coluna
//      tremer entre um refetch e outro.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const ler = (rel: string) => readFileSync(path.resolve(__dirname, "../../", rel), "utf8");
const tela = ler("client/src/pages/atendimento.tsx");
const css = ler("client/src/index.css");

/** Tira comentários antes de afirmar sobre o CÓDIGO — já reprovei três testes
 *  neste projeto por morderem a própria documentação. */
const soCodigo = (fonte: string) => fonte
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^[ \t]*\/\/.*$/gm, "");

const codigo = soCodigo(tela);

describe("1. os gradientes decorativos saíram", () => {
  it("sobrou só o véu de rolagem", () => {
    const achados = [...(codigo.match(/linear-gradient\([^)]*\)/g) ?? [])];
    expect(achados).toHaveLength(1);
    // `to bottom, transparent → branco`: o véu que diz que a lista continua.
    expect(achados[0]).toContain("to bottom");
  });

  it("nenhum botão de decisão é verde", () => {
    expect(codigo).not.toContain("#15803d', border: 'none'");
    expect(codigo).not.toContain("rgba(34,197,94,0.35)");
  });
});

describe("2. o modal de revisão tem duas colunas", () => {
  it("o grid é 3fr + 2fr com piso na coluna de decisão", () => {
    expect(css).toContain("grid-template-columns: minmax(0, 3fr) minmax(320px, 2fr);");
  });

  it("e um scrollport de leitura, não três", () => {
    // Antes cada coluna tinha o seu: a de metadados com `borderRight` +
    // `overflowY`, a de histórico com `borderLeft` + `overflowY`. Agora quem
    // rola é o pai da coluna de leitura, uma vez só.
    expect(codigo).toContain(
      '<div style={{ overflowY: "auto", minWidth: 0, display: "flex", flexDirection: "column" }}>',
    );
    expect(codigo).not.toContain("borderRight: '1px solid #f1f0ef', padding: 24,");
    expect(codigo).not.toContain("borderLeft: '1px solid #f1f0ef', padding: 24,");
  });

  it("a fila fecha o laço no rodapé da decisão", () => {
    // Sem isto, decidir uma peça obrigava a subir até o canto do cabeçalho ou
    // fechar o modal e reencontrar a próxima na lista.
    expect(codigo).toContain('data-testid="button-next-item-footer"');
    expect(codigo).toContain("Próxima peça");
  });
});

describe("3. o placar por situação", () => {
  it("tem as quatro células, e a quarta é a que cruza", () => {
    for (const t of ["placar-nova-versao", "placar-aguardando", "placar-arte-refazendo", "placar-atrasados"]) {
      expect(codigo).toContain(t);
    }
    // `cruzada: true` só na de prazo — é o que desenha a régua mais forte.
    expect((codigo.match(/cruzada: true/g) ?? [])).toHaveLength(1);
  });

  it("as três primeiras ligam o filtro de situação e a quarta o de atraso", () => {
    expect(codigo).toContain("alternarSituacao('nova_versao')");
    expect(codigo).toContain("alternarSituacao('aguardando')");
    expect(codigo).toContain("alternarSituacao('aguardando_arte')");
    expect(codigo).toContain("setAtrasadosFilter(v => !v)");
  });

  it("o menu Situação continua na barra — o placar só cobre três das cinco chaves", () => {
    // "Reprovado" e "Aprovado" só se alcançam por ele.
    expect(codigo).toContain('testId="select-situacao-filter"');
  });
});

describe("4. o recorte ativo aparece escrito", () => {
  it("há chips removíveis para cada filtro", () => {
    expect(codigo).toContain("chipsAtivos.map(c => <FilterChip");
  });

  it("e Limpar limpa TAMBÉM a situação, que o botão antigo esquecia", () => {
    expect(codigo).toContain("setSituacaoFilter([]); setAtrasadosFilter(false);");
  });
});

describe("5. números não tremem", () => {
  it("o contador da lista, o placar e a linha do histórico usam tabular-nums", () => {
    const ocorrencias = (codigo.match(/fontVariantNumeric: 'tabular-nums'/g) ?? []).length;
    expect(ocorrencias).toBeGreaterThanOrEqual(8);
  });
});
