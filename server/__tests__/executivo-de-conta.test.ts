// ─────────────────────────────────────────────────────────────────────────────
// EXECUTIVO DE CONTA — a base do roteamento por executivo (25/08).
//
// O aviso do book vai para os executivos dos patrocinadores DAQUELE evento, em
// vez do atendimento inteiro (chave ligada em 25/08). O bloqueio nunca foi de
// código: a coluna `account_executive_id` está preenchida numa minoria das
// contas, e patrocinador sem executivo não coloca ninguém do atendimento no
// aviso — por decisão do dono, em vez de cair no time inteiro.
//
// O script de inferência é o que enche esse cadastro — e o que este arquivo
// guarda é a DISCIPLINA dele: propor, não adivinhar. Um script que vincula 100
// contas por heurística sem revisão humana erra em silêncio, e o erro só
// aparece meses depois, quando o aviso não chega para ninguém.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const ler = (rel: string) => readFileSync(path.resolve(__dirname, "../..", rel), "utf8");
const SCRIPT = ler("scripts/inferir-executivos.ts");
const SCHEMA = ler("shared/schema.ts");
const ITEMS = ler("server/routes/items.ts");

describe("o sinal existe no banco", () => {
  it("o patrocinador tem executivo de conta, e a aprovação guarda quem decidiu", () => {
    expect(SCHEMA).toContain('accountExecutiveId: varchar("account_executive_id")');
    // é daqui que a inferência tira o palpite
    expect(SCHEMA).toContain('approvedBy: text("approved_by")');
    expect(SCHEMA).toContain('rejectedBy: text("rejected_by")');
  });

  it("a função que resolve os executivos de um evento está LIGADA (25/08)", () => {
    expect(ITEMS).toContain("export async function destinatariosDoEvento(eventId: string)");
    expect(ITEMS).toContain("const executivoDoSponsor = new Map(todosSponsors.map((s) => [s.id, s.accountExecutiveId]));");
    expect(ITEMS).toContain("export const USAR_EXECUTIVOS_DO_EVENTO = true;");
  });
});

describe("o script de inferência propõe, não adivinha", () => {
  it("é dry-run por padrão", () => {
    expect(SCRIPT).toContain('const aplicar = process.argv.includes("--aplicar");');
    expect(SCRIPT).toContain("Dry-run: nada gravado.");
  });

  it("nunca sobrescreve executivo já definido — quem tem, tem", () => {
    expect(SCRIPT).toContain("const semExecutivo = todosSponsors.filter((s) => !s.accountExecutiveId);");
  });

  it("só aplica o inequívoco: nome único, do atendimento, com maioria", () => {
    expect(SCRIPT).toContain('if (candidatos.length === 0) motivo = "o nome não casa com nenhum usuário do cadastro";');
    expect(SCRIPT).toContain("else if (candidatos.length > 1) motivo =");
    expect(SCRIPT).toContain('candidatos[0].role !== "atendimento"');
    expect(SCRIPT).toContain("else if (fatia <= CORTE_DE_MAIORIA) motivo =");
    // e o que tem dúvida NÃO entra na lista que grava
    expect(SCRIPT).toContain("(motivo ? duvidosas : claras).push(p);");
    expect(SCRIPT).toContain("for (const p of claras) {");
    expect(SCRIPT).not.toContain("for (const p of duvidosas) {\n    await db.update");
  });

  it("o vínculo inferido fica na trilha, com o número que o justificou", () => {
    expect(SCRIPT).toContain('userName: "Script de inferência",');
    expect(SCRIPT).toContain("Executivo de conta inferido:");
    expect(SCRIPT).toContain("corrija no cadastro se estiver errado");
  });

  it("a comparação de nomes não depende de escape de barra invertida", () => {
    // Neste ambiente heredoc e node -e comem `\`, e um intervalo de regex
    // silenciosamente errado faria dois nomes iguais pararem de casar. O corte
    // das marcas combinantes é por code point, à vista.
    expect(SCRIPT).toContain("cp < 0x0300 || cp > 0x036f");
  });

  it("patrocinador sem sinal nenhum fica SEM executivo, de propósito", () => {
    // Decisão do dono: se não tem executivo nem histórico de decisão, ninguém
    // do atendimento é avisado por causa dele — em vez de cair no time inteiro.
    expect(SCRIPT).toContain("semSinal.push(s.name);");
    expect(SCRIPT).toContain("ninguém do atendimento é avisado por causa deles");
  });
});
