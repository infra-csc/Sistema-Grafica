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
const SERVICE = ler("server/services/inferirExecutivos.ts");
const ROUTE = ler("server/routes/inferir-executivos.ts");
const TELA = ler("client/src/pages/inferir-executivos.tsx");
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

describe("o preview do e-mail não pode mentir", () => {
  const PREVIEW = ler("scripts/preview-email-book.ts");

  it("usa o construtor de verdade, não um HTML de mentira", () => {
    expect(PREVIEW).toContain('import { buildBookEmailMessage } from "../server/services/bookEmailNotification";');
  });

  it("a lista copiada bate com a de routes/items", () => {
    // A cópia existe porque importar de routes/items arrasta storage → db →
    // exceljs, e o preview passaria a exigir banco para desenhar um e-mail.
    // O preço da cópia é este teste.
    const doItems = ITEMS.slice(ITEMS.indexOf("export const DESTINATARIOS_NOMEADOS"));
    const doPreview = PREVIEW.slice(PREVIEW.indexOf("const DESTINATARIOS_NOMEADOS"));
    const emails = (t: string) => (t.slice(0, t.indexOf("];")).match(/"[^"]+@[^"]+"/g) ?? []).join(",");
    expect(emails(doPreview)).toBe(emails(doItems));
    expect(emails(doItems)).not.toBe("");
  });
});

describe("o script de inferência propõe, não adivinha", () => {
  it("é dry-run por padrão", () => {
    expect(SCRIPT).toContain('const aplicar = process.argv.includes("--aplicar");');
    expect(SCRIPT).toContain("Dry-run: nada gravado.");
  });

  it("nunca sobrescreve executivo já definido — quem tem, tem", () => {
    expect(SERVICE).toContain("const semExecutivo = todosSponsors.filter((sponsor) => !sponsor.accountExecutiveId);");
    expect(SERVICE).toContain("isNull(sponsors.accountExecutiveId)");
  });

  it("só aplica o inequívoco: nome único, do atendimento, com maioria", () => {
    expect(SERVICE).toContain('reason = "o nome não casa com nenhum usuário do cadastro";');
    expect(SERVICE).toContain("candidates.length > 1");
    expect(SERVICE).toContain('candidates[0].role !== "atendimento"');
    expect(SERVICE).toContain("share <= CORTE_DE_MAIORIA");
    // e o que tem dúvida NÃO entra na lista que grava
    expect(SERVICE).toContain("for (const proposta of relatorio.claras) {");
    expect(SERVICE).not.toContain("for (const proposta of relatorio.duvidosas) {");
  });

  it("o vínculo inferido fica na trilha, com o número que o justificou", () => {
    expect(SCRIPT).toContain('userName: "Script de inferência"');
    expect(SERVICE).toContain("Executivo de conta inferido:");
    expect(SERVICE).toContain("corrija no cadastro se estiver errado");
  });

  it("a comparação de nomes não depende de escape de barra invertida", () => {
    // Neste ambiente heredoc e node -e comem `\`, e um intervalo de regex
    // silenciosamente errado faria dois nomes iguais pararem de casar. O corte
    // das marcas combinantes é por code point, à vista.
    expect(SERVICE).toContain("codePoint < 0x0300 || codePoint > 0x036f");
  });

  it("patrocinador sem sinal nenhum fica SEM executivo, de propósito", () => {
    // Decisão do dono: se não tem executivo nem histórico de decisão, ninguém
    // do atendimento é avisado por causa dele — em vez de cair no time inteiro.
    expect(SERVICE).toContain("semSinal.push({ sponsorId: sponsor.id, sponsorName: sponsor.name });");
    expect(SCRIPT).toContain("ninguém do atendimento é avisado por causa deles");
  });
});

describe("a aplicação pela produção é explícita e protegida", () => {
  it("prévia e aplicação exigem administrador; o POST exige confirmação", () => {
    expect(ROUTE).toContain('app.get("/api/admin/inferir-executivos", requireAdmin');
    expect(ROUTE).toContain('app.post("/api/admin/inferir-executivos", requireAdmin');
    expect(ROUTE).toContain("req.body?.confirm !== true");
  });

  it("a tela separa claros, duvidosos e sem sinal antes de aplicar", () => {
    expect(TELA).toContain("Propostas claras");
    expect(TELA).toContain("Preservados para decisão manual");
    expect(TELA).toContain("Sem sinal histórico");
    expect(TELA).toContain("window.confirm(");
  });
});
