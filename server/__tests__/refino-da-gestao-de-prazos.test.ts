// ─────────────────────────────────────────────────────────────────────────────
// O REFINO DA GESTÃO DE PRAZOS NÃO PODE VOLTAR ATRÁS.
//
// Este arquivo trava um diff de ESTILO — o tipo de mudança que nenhum teste de
// comportamento percebe sendo desfeita. Os quatro riscos que ele cobre:
//
//   1. COR NOVA. A tela tem um arquivo de tokens (`tokens.ts`) justamente
//      porque uma paleta copiada à mão já reintroduziu um contraste reprovado
//      aqui uma vez. Cada arquivo de apresentação declara o conjunto de hex
//      literais que tem direito de usar; crescer esse conjunto é o defeito.
//
//   2. ALVO ENCOLHIDO. A régua da casa é 36px no ponteiro e 44 no toque. O
//      seletor de visão é o caso perigoso: a receita clássica de segmentado
//      põe padding vertical no trilho, e isso derruba os botões para 30px sem
//      que nada pareça errado.
//
//   3. O DESALINHO DO CABEÇALHO DAS COLUNAS. Já foi medido: com o subtítulo
//      livre para quebrar, a coluna de subtítulo longo empurra o primeiro card
//      para baixo e sai da linha de base das outras cinco. A reserva de altura
//      é o que impede — e ela parece "sobra" para quem não conhece a história.
//
//   4. O PLACAR VOLTAR A SER QUATRO CARDS. A célula não pode redesenhar borda,
//      raio e sombra: quem tem moldura agora é a superfície que as envolve.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const ler = (rel: string) => readFileSync(path.resolve(__dirname, "../../", rel), "utf8");

/**
 * Tira comentários antes de afirmar qualquer coisa sobre o CÓDIGO.
 *
 * Sem isto as asserções mordem a própria documentação: já aconteceu três vezes
 * neste projeto um `not.toContain("#hex")` reprovar porque o comentário logo
 * acima explicava por que aquele hex saiu.
 */
const soCodigo = (fonte: string) => fonte
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^[ \t]*\/\/.*$/gm, "");

const P = "client/src/components/prazos/";

const kpiCard = soCodigo(ler(P + "kpi-card.tsx"));
const quadroCard = soCodigo(ler(P + "quadro-card.tsx"));
const quadroColuna = soCodigo(ler(P + "quadro-coluna.tsx"));
const tabela = soCodigo(ler(P + "tabela-prazos.tsx"));
const pecas = soCodigo(ler(P + "pecas-atrasadas.tsx"));
const tokens = soCodigo(ler(P + "tokens.ts"));
const pagina = soCodigo(ler("client/src/pages/gestao-prazos.tsx"));

describe("1. nenhuma cor nova entrou no diff", () => {
  // Medido no estado aprovado. `tokens.ts` fica de fora de propósito: ele É a
  // paleta, e é o único lugar onde hex literal é a coisa certa.
  const PERMITIDO: Array<[string, string, string[]]> = [
    ["kpi-card", kpiCard, []],
    ["quadro-coluna", quadroColuna, []],
    ["quadro-card", quadroCard, ["#ffffff"]],
    ["tabela-prazos", tabela, ["#ffffff"]],
    ["pecas-atrasadas", pecas, []],
    ["gestao-prazos", pagina, ["#ffffff"]],
  ];

  for (const [nome, fonte, permitidos] of PERMITIDO) {
    it(`${nome} não usa hex fora do que já tinha`, () => {
      const achados = [...new Set(fonte.match(/#[0-9a-fA-F]{6}/g) ?? [])].sort();
      expect(achados).toEqual([...permitidos].sort());
    });
  }
});

describe("2. nenhum alvo abaixo da régua da casa", () => {
  it("o trilho do segmentado tem padding só na horizontal", () => {
    // `padding: 3` nos quatro lados deixaria os botões com 30px de altura
    // dentro de um trilho de 36.
    expect(pagina).toContain('backgroundColor: TI.track, padding: "0 3px"');
  });

  it("os botões do segmentado não têm margem vertical", () => {
    // Margem vertical faz o mesmo estrago que o padding do trilho.
    const bloco = pagina.slice(pagina.indexOf("Modo de visualização"));
    expect(bloco.slice(0, 1600)).not.toMatch(/margin: "\d+px 0"/);
  });

  it("o nome do evento em Comece por aqui é clicável de verdade", () => {
    // Era um <button> de ~17px de altura que abre o modal do evento.
    expect(pagina).toContain('display: "inline-flex", alignItems: "center", minHeight: 36');
  });

  it("os dois botões da faixa de triagem seguem em 36/44", () => {
    expect(pagina).toContain("cursor: \"pointer\", minHeight: isMobile ? 44 : 36");
  });
});

describe("3. o cabeçalho das colunas continua alinhado entre si", () => {
  it("a reserva de altura do subtítulo não foi removida", () => {
    // Ver o comentário no arquivo: o subtítulo longo passa de 190px sozinho,
    // mesmo com o selo fora da linha dele.
    expect(quadroColuna).toMatch(/minHeight: 29/);
  });

  it("o selo de vencidos subiu para a linha do título", () => {
    const antesDoSubtitulo = quadroColuna.slice(0, quadroColuna.indexOf("{setor ?"));
    expect(antesDoSubtitulo).toContain("{vencidos} vencido");
  });
});

describe("4. o placar é uma superfície, não quatro cards", () => {
  it("a célula não desenha borda, raio nem sombra próprios", () => {
    expect(kpiCard).not.toContain("borderRadius: R.lg");
    expect(kpiCard).not.toMatch(/boxShadow: active \|\| \(clickable && hover\)/);
    expect(kpiCard).not.toContain("SHADOW.md");
  });

  it("a divisão interna é hairline, e a superfície é quem tem moldura", () => {
    expect(kpiCard).toContain("borderRight: divisorDireita");
    expect(pagina).toContain("borderRadius: R.lg,");
    expect(pagina).toContain("boxShadow: SHADOW.sm,");
  });

  it("o KPI ativo marca com régua interna, não com anel", () => {
    expect(kpiCard).toContain("inset 0 -2px 0 ${colors.ring}");
    expect(kpiCard).not.toContain("1.5px solid ${colors.ring}");
  });

  it("a faixa de triagem entrou na grade do placar", () => {
    expect(pagina).toContain('gridColumn: "1 / -1"');
  });
});

describe("5. o que mudou de canal continua no canal novo", () => {
  it("a tendência é frase, não glifo", () => {
    // "▲ 2" só significava algo para quem sabia que a convenção INVERTE entre
    // os cards (subir é ruim em atrasados, bom em "em dia").
    expect(kpiCard).not.toContain("▲");
    expect(kpiCard).not.toContain("▼");
    expect(kpiCard).toContain("vs. último registro");
  });

  it("o card vencido usa trilho, não moldura vermelha inteira", () => {
    expect(quadroCard).not.toContain("TI.redEdge");
    expect(quadroCard).toContain("borderLeft: stage && stage.state !== \"upcoming\"");
  });

  it("o cabeçalho da tabela se separa do dado por tonalidade", () => {
    expect(tokens).toContain("backgroundColor: TI.sunken");
  });

  it("as duas tabelas fixam a largura do dígito", () => {
    expect(tabela).toContain('fontVariantNumeric: "tabular-nums"');
    expect(pecas).toContain('fontVariantNumeric: "tabular-nums"');
  });

  it("o card do quadro não repete a unidade de tempo em duas grafias", () => {
    // O contador do cabeçalho usa a forma curta ("13d"); a linha de
    // diagnóstico usa a longa ("há 5 dias"). O gate perdeu o "há N dias"
    // justamente para não ser a terceira grafia do mesmo número.
    expect(quadroCard).toContain("`Prazo vencido · ${pecasTexto(stage.pendingCount)}`");
  });
});
