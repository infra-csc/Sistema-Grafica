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

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const ler = (rel: string) => readFileSync(path.resolve(__dirname, "../../", rel), "utf8");
const SCHEMA = ler("shared/schema.ts");
const ITEMS = ler("server/routes/items.ts");
const PAGE = ler("client/src/pages/patrocinadores.tsx");
const VERSOES = ler("client/src/pages/versoes.tsx");

describe("1 · a flag no cadastro", () => {
  it("coluna booleana, NOT NULL, padrão false — ninguém vira desaprovador por acidente", () => {
    expect(SCHEMA).toContain('strictApproval: boolean("strict_approval").notNull().default(false),');
  });

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

  it("a tabela marca quem é, com contraste (#9a3412 sobre #fff7ed = 7,0:1)", () => {
    expect(PAGE).toContain("data-testid={`tag-desaprovador-${sponsor.id}`}");
    const i = PAGE.indexOf("data-testid={`tag-desaprovador-${sponsor.id}`}");
    expect(PAGE.slice(i, i + 600)).toContain('color: "#9a3412", backgroundColor: "#fff7ed"');
    expect(PAGE.slice(i - 200, i)).toContain("{sponsor.strictApproval && (");
  });
});

describe("2 · uma função, quatro chamadas", () => {
  it("a função existe e só mexe em quem está 'approved' E tem a flag", () => {
    expect(ITEMS).toContain("export async function revogarAprovacoesEstritas(");
    const i = ITEMS.indexOf("export async function revogarAprovacoesEstritas(");
    const corpo = ITEMS.slice(i, i + 2600);
    expect(corpo).toContain('if (!a || a.status !== "approved") continue;');
    expect(corpo).toContain("if (!sp?.strictApproval) continue;");
    // quem reprovou não revoga a si mesmo
    expect(corpo).toContain('if (gatilho.tipo === "reprovacao" && v.sponsorId === gatilho.sponsorId) continue;');
    // e a revogação fica na trilha
    expect(corpo).toContain("(patrocinador desaprovador)");
  });

  it("é chamada no reenvio da correção, na troca do thumb e na reprovação", () => {
    const chamadas = ITEMS.match(/await revogarAprovacoesEstritas\(req, currentItem, \{ tipo: "(nova_versao|reprovacao)"/g) ?? [];
    expect(chamadas.filter((c) => c.includes("nova_versao")).length).toBe(2); // reenvio + troca
    expect(chamadas.filter((c) => c.includes("reprovacao")).length).toBe(1); // reject
  });

  it("no reenvio do item inteiro, o desaprovador aprovado também volta a pending", () => {
    expect(ITEMS).toContain("const estritoAprovado = approval.status === 'approved' && !!(await storage.getSponsor(approval.sponsorId))?.strictApproval;");
    expect(ITEMS).toContain("if (['awaiting_arte', 'new_version_pending', 'rejected'].includes(approval.status) || estritoAprovado) {");
  });

  it("a troca do thumb só revoga em aprovação/aprovado — e devolve a peça aprovada para a aprovação", () => {
    const i = ITEMS.indexOf('origem: "troca"');
    const trecho = ITEMS.slice(i, i + 2200);
    expect(trecho).toContain('if (currentItem.status === "awaiting_sponsor_approval" || currentItem.status === "sponsor_approved") {');
    expect(trecho).toContain('if (revogados.length > 0 && currentItem.status === "sponsor_approved") {');
    expect(trecho).toContain('status: "awaiting_sponsor_approval", rejectedBySponsor: false');
    expect(trecho).toContain('targetRoles: ["atendimento"]');
  });

  it("a reprovação revoga DEPOIS de registrar a própria reprovação, e com o nome de quem reprovou", () => {
    const reg = ITEMS.indexOf("status: 'awaiting_arte',\n          rejectedBy: req.userName,".replace(/\n/g, ITEMS.includes("\r\n") ? "\r\n" : "\n"));
    const rev = ITEMS.indexOf('await revogarAprovacoesEstritas(req, currentItem, { tipo: "reprovacao", sponsorId, nome: sponsor?.name ?? sponsorId });');
    expect(reg).toBeGreaterThan(-1);
    expect(rev).toBeGreaterThan(reg);
  });
});

describe("3 · os estados de destino", () => {
  it("nova versão → new_version_pending; reprovação de outro → awaiting_arte; nunca pending", () => {
    expect(ITEMS).toContain('status: gatilho.tipo === "nova_versao" ? "new_version_pending" : "awaiting_arte",');
    const i = ITEMS.indexOf("export async function revogarAprovacoesEstritas(");
    expect(ITEMS.slice(i, i + 2600)).not.toContain('status: "pending"');
  });

  it("a aprovação some (approvedBy/At) e o motivo carrega o prefixo fixo", () => {
    const i = ITEMS.indexOf("export async function revogarAprovacoesEstritas(");
    const corpo = ITEMS.slice(i, i + 2600);
    expect(corpo).toContain("approvedBy: null,");
    expect(corpo).toContain("approvedAt: null,");
    expect(corpo).toContain("rejectionReason: motivo,");
    expect(ITEMS).toContain('export const MOTIVO_REVOGACAO_PREFIXO = "Aprovação revogada automaticamente";');
  });
});

describe("4 · a prova do que ele tinha aprovado fica", () => {
  it("a função não toca decidedThumbUrl", () => {
    const i = ITEMS.indexOf("export async function revogarAprovacoesEstritas(");
    expect(ITEMS.slice(i, i + 2600)).not.toContain("decidedThumbUrl");
  });

  it("a tela de Versões lê o prefixo e diz 'teve a aprovação revogada'", () => {
    expect(VERSOES).toContain('const revogada = (d.motivo ?? "").startsWith("Aprovação revogada automaticamente");');
    expect(VERSOES).toContain("? `teve a aprovação revogada${d.versao ? ` (tinha aprovado a v${d.versao})` : \"\"}`");
  });
});
