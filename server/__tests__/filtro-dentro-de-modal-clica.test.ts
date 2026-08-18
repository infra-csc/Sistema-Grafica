// ─────────────────────────────────────────────────────────────────────────────
// O MENU DE FILTRO FUNCIONA DENTRO DE UM MODAL.
//
// A regressão que este arquivo existe para impedir, contada uma vez:
//
// Para resolver o menu que empurrava a tela para o lado, eu portei o painel do
// FilterSelect para o <body>. Consertou aquilo e quebrou outra coisa, num lugar
// que eu não tinha olhado.
//
// O Radix, com um Dialog aberto, põe `pointer-events: none` no <body> para
// bloquear tudo que está FORA do modal. O painel passou a morar justamente ali,
// então herdava o bloqueio: dentro de QUALQUER modal do app a lista abria,
// mostrava as opções e não aceitava clique.
//
// Medido no dev, no cadastro de patrocinador: painel aberto, 13 opções
// renderizadas, `pointerEvents: "none"` computado, `dialog.contains(painel)`
// falso. Quem estava tentando atribuir o Executivo Responsável via a lista e
// não conseguia escolher.
//
// A regra que fica: portar um elemento para fora da árvore o tira do alcance
// dos ancestrais — inclusive dos que o PROTEGIAM. Ganhar posicionamento livre
// custa herdar as regras de outro lugar, e `pointer-events` é a primeira que
// morde.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const fs_ = readFileSync(path.resolve(__dirname, "../../client/src/components/filter-select.tsx"), "utf8");

/** O bloco de estilo do painel portado. */
function estiloDoPainel(): string {
  const i = fs_.indexOf('position: "fixed",');
  expect(i).toBeGreaterThan(-1);
  return fs_.slice(i, fs_.indexOf("}}>", i));
}

describe("o painel portado continua clicável", () => {
  it("declara pointerEvents auto", () => {
    // Sem isto ele herda o `pointer-events: none` que o Radix põe no <body>
    // enquanto há Dialog aberto.
    expect(estiloDoPainel()).toContain('pointerEvents: "auto"');
  });

  it("continua sendo portado para o body", () => {
    // O portal resolve o empurrão lateral e a armadilha do ancestral
    // transformado; a correção não pode ter sido desfazê-lo.
    expect(fs_).toContain("createPortal");
    expect(fs_).toContain("), document.body)}");
  });

  it("continua fixed, para não estender a área rolável", () => {
    expect(estiloDoPainel()).toContain('position: "fixed"');
  });

  it("o clique dentro do painel ainda não conta como clique fora", () => {
    // As três coisas se sustentam juntas: portal + pointer-events + a guarda
    // do clique-fora. Perder qualquer uma quebra o menu de um jeito diferente.
    expect(fs_).toContain("painelRef.current?.contains(alvo)");
  });
});
