// ─────────────────────────────────────────────────────────────────────────────
// O DRILL-DOWN ABRE AS PEÇAS RESTANTES ONDE ELAS FORAM PEDIDAS.
//
// A lista de cada etapa é cortada em ROW_CAP para o modal não abrir como uma
// tabela de 50 linhas. O rodapé, porém, mandava as restantes para a tela do
// evento: "+44 peças nesta etapa — ver todas no evento →". Isso troca a
// pergunta ("quais são as 44?") por uma mudança de tela, e no caminho perde o
// recorte da etapa, a rolagem e o modal inteiro. Quem clica ali quer VER as
// peças, não sair dali.
//
// Agora o corte abre no lugar, e o link para o evento continua — como o que
// ele de fato é: o caminho para EDITAR as peças.
//
// Este arquivo também guarda o cabeçalho da coluna de espera. Ele dizia "Sem
// movimento", com o título "qualquer edição atualiza este relógio" — que era a
// descrição fiel do bug corrigido junto: a espera passou a sair de
// `statusChangedAt`, e só mudança de etapa mexe nela.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const DRILL = readFileSync(
  new URL("../../client/src/components/prazos/event-drilldown.tsx", import.meta.url),
  "utf8",
);

describe("abrir as restantes sem sair do modal", () => {
  it("o corte é por etapa e tem estado próprio", () => {
    expect(DRILL).toContain("const [abertas, setAbertas] = useState<Set<string>>(new Set());");
    expect(DRILL).toContain("const tudoAberto = abertas.has(stage.key);");
    expect(DRILL).toContain("const shown = tudoAberto ? sorted : sorted.slice(0, ROW_CAP);");
  });

  it("é um BOTÃO que abre aqui — não um link que navega", () => {
    const i = DRILL.indexOf("data-testid={`ver-todas-${ev.id}-${stage.key}`}");
    expect(i).toBeGreaterThan(-1);
    const bloco = DRILL.slice(i - 400, i + 400);
    expect(bloco).toContain('type="button"');
    expect(bloco).toContain("onClick={() => alternarTodas(stage.key)}");
    expect(bloco).toContain("aria-expanded={tudoAberto}");
    // O rótulo diz QUANTAS e ONDE, e o inverso também existe.
    expect(DRILL).toContain("Ver as ${acimaDoCorte} restantes aqui");
    expect(DRILL).toContain("Mostrar só as primeiras ${ROW_CAP}");
  });

  it("o texto antigo, que mandava a pessoa para outra tela, saiu", () => {
    expect(DRILL).not.toContain("ver todas no evento");
  });

  it("o link do evento fica, com o rótulo do que ele faz de verdade", () => {
    expect(DRILL).toContain("Abrir no evento →");
  });

  it("o botão aponta para a tabela que ele controla", () => {
    expect(DRILL).toContain("aria-controls={`drill-tabela-${ev.id}-${stage.key}`}");
    expect(DRILL).toContain("id={`drill-tabela-${ev.id}-${stage.key}`}");
  });

  it("cartão e tabela leem a MESMA lista — abrir vale no celular também", () => {
    // Fossem duas fatias, o botão abriria só o desktop e o celular seguiria
    // cortado sem nada dizendo isso.
    expect(DRILL.match(/\{shown\.map\(/g)?.length).toBe(2);
  });
});

describe("o cabeçalho da coluna diz o que a coluna mede", () => {
  it("não promete mais 'sem movimento'", () => {
    expect(DRILL).not.toContain("Sem movimento");
    expect(DRILL).toContain("Nesta etapa");
  });

  it("e o título explica o relógio novo, inclusive o traço", () => {
    expect(DRILL).toContain("Dias desde a última MUDANÇA DE ETAPA da peça");
    expect(DRILL).toContain("Editar a peça não mexe neste relógio");
    expect(DRILL).toContain("não há registro de quando ela entrou aqui");
  });

  it("a célula cala quando não há carimbo, em vez de dizer 'hoje'", () => {
    expect(DRILL).toContain("it.waitingDays === null");
    expect(DRILL).toContain("entrou nesta etapa hoje");
  });
});
