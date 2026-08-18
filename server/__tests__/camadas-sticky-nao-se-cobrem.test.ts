// ─────────────────────────────────────────────────────────────────────────────
// AS CAMADAS STICKY NÃO SE COBREM.
//
// O defeito que este arquivo existe para impedir, contado uma vez:
//
// Ao rolar o Painel Geral, o nome do evento ("TESTE 3") aparecia CORTADO AO
// MEIO atrás da barra de filtros, e a primeira linha de cada grupo saía pela
// metade sob o cabeçalho da tabela. Medido no DOM, a pilha era:
//
//   barra de filtros ... top   4px, altura 103  → ocupa até 107
//   cabeçalho do evento  top  85,59px           → começa 21,4px CEDO DEMAIS
//
// E a barra tem z-index 8 contra 6 do evento, então ela pintava por cima.
//
// A causa não estava na tela: `topOffset` já era derivado de `useElementSize`.
// O hook é que se contradizia — a semente usava `getBoundingClientRect()`
// (BORDER-box) e o ResizeObserver usava a caixa de CONTEÚDO. Em elemento com
// padding o valor encolhia sozinho no primeiro callback, pela soma exata do
// padding: 103 − 81,59 = 21,4.
//
// A regra que fica: medida usada para POSICIONAR outra coisa tem de ser
// border-box. A caixa de conteúdo mede o miolo, e o que empurra o vizinho é a
// caixa inteira. E um hook nunca pode medir de dois jeitos diferentes conforme
// o momento — o erro só aparece depois da montagem, que é quando ninguém olha.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const hook = readFileSync(path.resolve(__dirname, "../../client/src/hooks/use-mobile.tsx"), "utf8");
const painel = readFileSync(path.resolve(__dirname, "../../client/src/pages/painel-geral.tsx"), "utf8");

/** Corpo do callback do ResizeObserver, sem as linhas de comentário. */
function corpoDoObserver(): string {
  const i = hook.indexOf("new ResizeObserver");
  const corpo = hook.slice(i, hook.indexOf("ro.observe", i));
  return corpo
    .split(/\r?\n/)
    .filter(l => !l.trim().startsWith("//"))
    .join("\n");
}

describe("useElementSize mede border-box", () => {
  it("o observer não lê mais a caixa de conteúdo", () => {
    // Olha o CÓDIGO do callback, não o arquivo: o comentário que documenta o
    // defeito cita o nome da propriedade antiga de propósito, e proibir a
    // menção apagaria a explicação de por que a medida estava errada.
    expect(corpoDoObserver()).not.toContain("contentRect");
  });

  it("usa borderBoxSize, com getBoundingClientRect como retorno", () => {
    const codigo = corpoDoObserver();
    expect(codigo).toContain("borderBoxSize");
    expect(codigo).toContain("e.target.getBoundingClientRect()");
  });

  it("observer e semente medem a MESMA caixa", () => {
    // A contradição entre os dois É o defeito; se um mudar, o outro tem de
    // mudar junto.
    const trecho = hook.slice(hook.indexOf("export function useElementSize"));
    expect(trecho).toContain("borderBoxSize");
    expect(trecho).toContain("el.getBoundingClientRect()");
  });
});

describe("Painel Geral: o deslocamento das camadas é derivado", () => {
  it("topOffset vem da altura medida da barra, e não de um número escrito à mão", () => {
    expect(painel).toContain("const topOffset = 4 + (stickyToolbar ? toolbarH : 0);");
  });

  it("o cabeçalho da tabela encosta na base do cabeçalho do evento", () => {
    expect(painel).toContain("top: topOffset + EVENT_HEADER_H");
  });

  it("a ordem de empilhamento mantém a barra acima do que rola sob ela", () => {
    // barra 8 > evento 6 > thead 5: cada camada cobre a de baixo, e é por isso
    // que os offsets precisam estar certos — o z-index não perdoa erro de 1px.
    expect(painel).toContain('position: "sticky" as const, top: 4, zIndex: 8');
    expect(painel).toContain('position: "sticky", top: topOffset, zIndex: 6');
    expect(painel).toContain('position: "sticky", top: topOffset + EVENT_HEADER_H, zIndex: 5');
  });
});
