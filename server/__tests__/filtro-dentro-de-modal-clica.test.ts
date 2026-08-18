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

describe("o painel escolhe o destino conforme o ambiente", () => {
  it("dentro de um modal, o painel fica DENTRO do modal", () => {
    // O Radix isola o modal de TRÊS maneiras — pointer-events no body,
    // foco preso na subárvore e roda do mouse bloqueada fora dela. Um
    // painel morando no body herda as três: abre, mostra as opções e não
    // deixa clicar, digitar nem rolar.
    expect(fs_).toContain('ref.current?.closest<HTMLElement>(\'[role="dialog"]\')');
    expect(fs_).toContain("), dentroDeModal ?? document.body)}");
  });

  it("fora de modal, continua indo para o body", () => {
    // É o portal para o body que impede o menu de estender a área rolável
    // da página — o defeito que empurrava a tela para o lado — e que o
    // livra da armadilha do ancestral com transform.
    expect(fs_).toContain("createPortal");
    expect(fs_).toContain("document.body");
  });

  it("o posicionamento acompanha o destino", () => {
    // Dentro do modal o referencial é a caixa dele, e `fixed` ali seria
    // capturado pelo transform do Radix. Fora, `fixed` é o que evita
    // estender a rolagem do documento.
    expect(fs_).toContain('position: dentroDeModal ? "absolute" : "fixed"');
  });

  it("o grampo passa a grampear contra a caixa certa", () => {
    expect(fs_).toContain("const caixa = dentroDeModal");
    expect(fs_).toContain("const maximo = caixa.right - width - RESPIRO;");
  });

  it("o painel continua clicável mesmo quando vai para o body", () => {
    // Cinto e suspensório: fora de modal o bloqueio não existe, mas se um
    // dia outro overlay puser pointer-events: none no body, o painel não
    // volta a morrer em silêncio.
    expect(fs_).toContain('pointerEvents: "auto"');
  });

  it("o clique dentro do painel ainda não conta como clique fora", () => {
    expect(fs_).toContain("painelRef.current?.contains(alvo)");
  });
});
