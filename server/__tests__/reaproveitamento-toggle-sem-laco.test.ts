// ─────────────────────────────────────────────────────────────────────────────
// REAPROVEITAMENTO NA EDIÇÃO DA PEÇA — o laço infinito (dono, 30/10: marcar
// "Reaproveitamento" numa peça em produção dava "Esta tela encontrou um
// problema" / Maximum update depth exceeded).
//
// A causa: um <div> clicável que invertia isReuse com o Checkbox do Radix
// dentro. No formulário, o Checkbox cria um input escondido que dispara um
// "click" a cada troca — o click subia até o <div>, que invertia de novo.
// O bloco agora é UM <button> (aria-pressed) com a caixinha só desenhada.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const FORM = readFileSync(path.resolve(__dirname, "../../client/src/components/detalhe-do-evento/formulario-da-peca.tsx"), "utf8");
const bloco = FORM.slice(FORM.indexOf('data-testid="toggle-is-reuse"') - 200, FORM.indexOf("DE ONDE VEM (16/10)"));

describe("toggle de reaproveitamento", () => {
  it("é um botão com aria-pressed e não tem Checkbox do Radix dentro", () => {
    expect(bloco).toContain("<button");
    expect(bloco).toContain('type="button"');
    expect(bloco).toContain("aria-pressed={!!formData.isReuse}");
    expect(bloco).not.toContain("<Checkbox");
    // Atualização pelo estado anterior: dois cliques seguidos não se perdem.
    expect(bloco).toContain("setFormData((f) => ({ ...f, isReuse: !f.isReuse }))");
  });
});
