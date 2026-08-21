// ─────────────────────────────────────────────────────────────────────────────
// MODELOS nota 10 — a sangria derivada e validada, e o duplicar.
//
// Duas das três mudanças do handoff. A primeira ("quantas peças usam cada
// modelo") tinha um gate — confirmar se `items` guarda `standardItemId`; se a
// peça só copia tipo/material/medida sem guardar o vínculo, PARAR E DIZER — e
// o gate falhou: não há referência ao modelo em lugar nenhum (schema, rotas,
// formulários). "Criadas a partir de" seria uma promessa sem dado; ficou para
// decisão do dono (estimativa por assinatura, ou passar a gravar o vínculo).
//
// 2 · A SANGRIA: VIS 3.00 × 2.40 e ARQ 3.05 × 2.45 lado a lado, e os 5 cm o
//     leitor calculava de cabeça. Agora um selo derivado ao lado da linha ARQ
//     — "+5cm" neutro, "sem sangria" âmbar, "arquivo menor" vermelho — e a
//     MESMA conta no formulário: aviso no blur dos campos de arquivo, que não
//     bloqueia (há recorte legítimo) mas exige ser visto.
// 3 · DUPLICAR: o formulário de CRIAÇÃO pré-preenchido, nome sufixado
//     "(cópia)", foco no nome com o texto selecionado. Nada é salvo antes de
//     confirmar.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const M = readFileSync(path.resolve(__dirname, "../../client/src/pages/modelos.tsx"), "utf8");

describe("2 · a sangria, derivada", () => {
  it("uma função só decide os três estados, por eixo", () => {
    expect(M).toContain("function sangriaDe(visW: unknown, visH: unknown, arqW: unknown, arqH: unknown): Sangria | null {");
    // Qualquer eixo menor corta a peça.
    expect(M).toContain("if (dW < 0 || dH < 0) {");
    expect(M).toContain('rotulo: "arquivo menor", title: "O arquivo é menor que o visual — a peça sairia cortada. Confira o cadastro."');
    expect(M).toContain('rotulo: "sem sangria", title: "Arquivo igual ao visual — sem margem para o refile"');
    expect(M).toContain("const title = dW === dH ? `Sangria de ${dW} cm em cada eixo`");
    // Sem as quatro medidas, sem selo — ausência não é estado.
    expect(M).toContain("if (vw === null || vh === null || aw === null || ah === null) return null;");
  });

  it("os tons do handoff, com contraste conferido", () => {
    expect(M).toContain('sem:   { bg: "#fffbeb", border: "#fde68a", color: "#92400e" },');
    expect(M).toContain('menor: { bg: "#fef2f2", border: "#fecaca", color: "#b91c1c" },');
    expect(M).toContain('ok:    { bg: "#f5f4f0", border: "#e7e5e4", color: "#57534e" },');
  });

  it("o selo está na tabela, ao lado da linha ARQ", () => {
    expect(M).toContain("const s = sangriaDe(item.area, item.visual, item.fileWidth, item.fileHeight);");
    expect(M).toContain("return s ? <ChipSangria s={s} testId={`chip-sangria-${item.id}`} /> : null;");
  });

  it("e a MESMA conta vale no formulário, no blur dos campos de arquivo", () => {
    expect(M).toContain("const sangriaDoForm = formData.hasVariableMeasurement ? null : sangriaDe(formData.area, formData.visual, formData.fileWidth, formData.fileHeight);");
    expect((M.match(/onBlur=\{\(\) => setArqTocado\(true\)\}/g) ?? []).length).toBe(2);
    expect(M).toContain('<ChipSangria s={sangriaDoForm} testId="chip-sangria-form" />');
  });

  it("arquivo menor não bloqueia o salvamento, mas exige ser visto", () => {
    expect(M).toContain('data-testid="aviso-arquivo-menor"');
    expect(M).toContain('data-testid="checkbox-ciente-do-corte"');
    // Tentar salvar sem ter passado pelos campos força o aviso a aparecer.
    expect(M).toContain("if (corteNoForm && !cienteDoCorte) {");
    expect(M).toContain("setArqTocado(true);\n      return;".replace("\n", M.includes("\r\n") ? "\r\n" : "\n"));
  });
});

describe("3 · duplicar modelo", () => {
  it("o terceiro botão, com o mesmo desenho dos outros dois", () => {
    expect(M).toContain("testId={`button-duplicate-model-${item.id}`}");
    expect(M).toContain('icon={<Copy style={{ width: 16, height: 16 }} />}');
    // Continua entre Editar e Excluir.
    const i = M.indexOf("button-duplicate-model-");
    expect(i).toBeGreaterThan(M.indexOf("button-edit-model-"));
    expect(i).toBeLessThan(M.indexOf("button-delete-model-"));
  });

  it("abre o formulário COMO CRIAÇÃO, pré-preenchido, nome sufixado", () => {
    expect(M).toContain("const handleDuplicate = (item: any) => {");
    const i = M.indexOf("const handleDuplicate");
    const corpo = M.slice(i, i + 1200);
    expect(corpo).toContain("setEditingItem(null);");
    expect(corpo).toContain("name: `${item.name} (cópia)`,");
    expect(corpo).toContain("setOpen(true);");
    // Nada é salvo aqui: não há mutate no corpo.
    expect(corpo).not.toContain(".mutate(");
  });

  it("o foco vai para o nome, com o texto selecionado", () => {
    expect(M).toContain("nomeRef.current?.focus(); nomeRef.current?.select();");
    expect(M).toContain("ref={nomeRef}");
  });
});

describe("o que NÃO mexer continua", () => {
  it("combobox com criação, CatRow de topo, paginação só acima de PAGE_SIZE", () => {
    expect(M).toContain("const PAGE_SIZE = 20;");
    expect(M).toContain("{filteredItems.length > PAGE_SIZE && (");
    expect(M).toMatch(/^function CatRow\(/m);
    expect(M).toContain("Definição Técnica do Template");
  });

  it("o tool strip e o rodapé saem do mesmo filteredItems.length", () => {
    expect(M).toContain("{filteredItems.length} modelo{filteredItems.length !== 1 ? \"s\" : \"\"}");
    expect(M).toContain("de {filteredItems.length} modelos");
  });

  it("Mudança 1 ficou para decisão: nenhuma coluna Uso, nenhum 'criadas a partir'", () => {
    expect(M).not.toContain("cell-uso-");
    expect(M).not.toContain("criadas a partir");
  });
});
