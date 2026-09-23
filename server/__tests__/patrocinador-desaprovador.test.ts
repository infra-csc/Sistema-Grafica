// ─────────────────────────────────────────────────────────────────────────────
// PATROCINADOR "DESAPROVADOR" — a aprovação dele vale só para a versão que
// ele aprovou.
//
// Pedido do dono (21/08/2026): "cadastro de patrocinador desaprovador
// (Ministério) — aquele que qualquer nova versão revoga aprovação anterior;
// qualquer reprova de peça esse patrocinador desaprova também".
//
// O que este arquivo fixa:
//   1. A flag no cadastro (`sponsors.strict_approval`), o toggle no formulário
//      e a tag na tabela.
//   2. UMA função no servidor (`revogarAprovacoesEstritas`) e os QUATRO
//      pontos em que ela é chamada — porque a regra que mora em um lugar só
//      é a regra que não vaza quando nasce um quinto caminho.
//   3. Os estados de destino: nova versão → `new_version_pending` (Atendimento
//      reapresenta); reprovação de outro → `awaiting_arte` (a peça vai ser
//      refeita) — nunca `pending`, que deixaria reaprovar a versão velha.
//   4. A prova do que ele tinha aprovado (`decidedThumbUrl`) fica; a tela de
//      Versões diz "teve a aprovação revogada".
// ─────────────────────────────────────────────────────────────────────────────

// A coluna (schema), a função única e os três caminhos que a chamam, os
// estados de destino e a prova que fica rodam de verdade em
// regras-patrocinio-aprovacao. Aqui ficam o formulário, a tabela e a tela de
// Versões.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const ler = (rel: string) => readFileSync(path.resolve(__dirname, "../../", rel), "utf8");
const PAGE = ler("client/src/pages/patrocinadores.tsx");
const VERSOES = ler("client/src/pages/versoes.tsx");

describe("1 · a flag no cadastro", () => {
  it("o formulário ganha a seção 03 com o toggle — e continua sem os dados de contato", () => {
    expect(PAGE).toContain("  strictApproval: z.boolean().optional(),");
    expect(PAGE).toContain('sectionLabel("03", "Regra de aprovação")');
    expect(PAGE).toContain('data-testid="checkbox-desaprovador"');
    expect(PAGE).toContain("Patrocinador desaprovador</span>");
    for (const t of ["input-company", "input-contact-person", "input-phone", "input-email", "input-notes"]) {
      expect(PAGE).not.toContain(t);
    }
  });

  it("criar, editar e abrir carregam a flag — senão o PATCH parcial a apagaria ou ignoraria", () => {
    expect(PAGE).toContain('defaultValues: { name: "", color: "#f97316", accountExecutiveId: "", strictApproval: false }');
    expect(PAGE).toContain('form.reset({ name: "", color: "#f97316", accountExecutiveId: "", strictApproval: false });');
    expect(PAGE).toContain("strictApproval: !!s.strictApproval });");
  });

  it("a tabela marca quem é, com contraste (selo laranja: laranja.text sobre laranja.bg, AA)", () => {
    expect(PAGE).toContain("data-testid={`tag-desaprovador-${sponsor.id}`}");
    const i = PAGE.indexOf("data-testid={`tag-desaprovador-${sponsor.id}`}");
    // Selo do design system no tom laranja (texto #c2410c sobre #fff7ed).
    expect(PAGE.slice(i - 200, i)).toContain('<Selo tom="laranja"');
    expect(PAGE.slice(i - 200, i)).toContain("{sponsor.strictApproval && (");
  });
});

describe("4 · a prova do que ele tinha aprovado fica", () => {
  it("a tela de Versões lê o prefixo e diz 'teve a aprovação revogada'", () => {
    // O prefixo virou constante na tela (revisão de 24/08), e o motivo deixou
    // de ser repetido entre aspas — a frase já diz que foi revogada.
    expect(VERSOES).toContain('const PREFIXO_REVOGACAO = "Aprovação revogada automaticamente";');
    expect(VERSOES).toContain('const revogada = (d.motivo ?? "").startsWith(PREFIXO_REVOGACAO);');
    expect(VERSOES).toContain("revogada ? `teve a aprovação revogada${d.versao ? ` (tinha aprovado a v${d.versao})` : \"\"}`");
  });
});
