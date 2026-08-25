// ─────────────────────────────────────────────────────────────────────────────
// DESVINCULAR PATROCINADOR DA PEÇA (pedido do dono, 25/08).
//
// A regra, com as palavras dele: "se tiver aprovado segue normal, mas se
// tiver pendente ele não conta mais — e se só faltar ele, a peça segue".
//
// O bug que motivou: o DELETE tirava só o VÍNCULO e a linha de aprovação
// pendente ficava viva para sempre — a peça seguia dizendo "falta Fulano"
// para alguém que já não estava nela.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const ler = (rel: string) => readFileSync(path.resolve(__dirname, "../..", rel), "utf8");
const ROTA = ler("server/routes/sponsors.ts");
const STORAGE = ler("server/storage.ts");
const TELA = ler("client/src/pages/atendimento.tsx");
const REPARO = ler("scripts/reparar-vinculos-de-evento.ts");

describe("o DELETE /api/items/:itemId/sponsors/:sponsorId", () => {
  it("descarta a linha PENDENTE; a APROVADA fica, que é registro", () => {
    expect(ROTA).toContain('const linhaAprovada = linha?.status === "approved";');
    expect(ROTA).toContain("if (linha && !linhaAprovada) {");
    expect(ROTA).toContain("await storage.deleteItemSponsorApproval(itemId, sponsorId);");
    // e o método apaga UMA linha, não a rodada inteira
    expect(STORAGE).toContain("async deleteItemSponsorApproval(itemId: string, sponsorId: string): Promise<boolean> {");
    expect(STORAGE).toContain("and(eq(itemSponsorApprovals.itemId, itemId), eq(itemSponsorApprovals.sponsorId, sponsorId))");
  });

  it("se ele era o único que faltava, a peça SEGUE — o mesmo avanço da última aprovação", () => {
    expect(ROTA).toContain('descartouPendente && (item.status === "awaiting_sponsor_approval" || item.status === "awaiting_approval")');
    // vazio = fechou: não resta ninguém a esperar
    expect(ROTA).toContain('const fechou = restantes.every((l) => l.status === "approved");');
    expect(ROTA).toContain('status: "sponsor_approved",');
    // a Arte é avisada para finalizar, como no caminho da aprovação
    expect(ROTA).toContain('targetRoles: ["arte"],');
    // e a tela de Versões não fica com cache velho
    expect(ROTA).toContain("invalidarCacheDeVersoes();");
  });

  it("a trilha diz o que aconteceu com a aprovação dele", () => {
    expect(ROTA).toContain("a aprovação que ele já deu permanece no histórico");
    expect(ROTA).toContain("a aprovação pendente dele foi descartada e deixa de contar");
    expect(ROTA).toContain('Com a saída de "${sponsor?.name}"');
  });
});

describe("o botão no modal de decisão do Atendimento", () => {
  it("só admin, só em linha PENDENTE, com confirmação que diz o efeito real", () => {
    expect(TELA).toContain("data-testid={`button-desvincular-sponsor-${sponsor.id}`}");
    // dentro do bloco isPending — aprovada tem o Revogar, não o Desvincular
    const i = TELA.indexOf("button-desvincular-sponsor");
    const antes = TELA.slice(Math.max(0, i - 6000), i);
    expect(antes).toContain("{isPending && !isRejectingThis && (");
    expect(TELA).toContain('user?.role === "admin" && (');
    expect(TELA).toContain('data-testid="button-confirm-desvincular"');
    expect(TELA).toContain("se ele for o único que falta, a rodada fecha e a peça segue");
  });

  it("o sucesso remenda os estados locais e conta o desfecho", () => {
    expect(TELA).toContain("const desvincularSponsorMutation = useMutation({");
    expect(TELA).toContain(".filter((s: any) => s.id !== variables.sponsorId)");
    expect(TELA).toContain("setSponsorApprovals(prev => prev.filter(a => a.sponsorId !== variables.sponsorId));");
    expect(TELA).toContain("Desvinculado — a peça seguiu");
  });
});

describe("o reparo do estoque torto (peça com marca que o evento não conhece)", () => {
  it("existe, é dry-run por padrão e só INSERE o vínculo de evento que falta", () => {
    expect(REPARO).toContain('const aplicar = process.argv.includes("--aplicar");');
    expect(REPARO).toContain("if (jaNoEvento.has(chave)) continue;");
    // peça excluída não prova vínculo
    expect(REPARO).toContain("if (!peca?.eventId) continue;");
    // não inventa cota: quem define é o Vincular
    expect(REPARO).toContain("sem cota — defina no Vincular");
    expect(REPARO).toContain("Dry-run: nada gravado.");
  });
});
