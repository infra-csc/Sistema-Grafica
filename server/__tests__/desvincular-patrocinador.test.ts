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
    expect(ROTA).toContain("await storage.deleteItemSponsorApproval(item.id, sponsorId);");
    // e o método apaga UMA linha, não a rodada inteira
    expect(STORAGE).toContain("async deleteItemSponsorApproval(itemId: string, sponsorId: string): Promise<boolean> {");
    expect(STORAGE).toContain("and(eq(itemSponsorApprovals.itemId, itemId), eq(itemSponsorApprovals.sponsorId, sponsorId))");
  });

  it("se ele era o único que faltava, a peça SEGUE — o mesmo avanço da última aprovação", () => {
    expect(ROTA).toContain('descartouPendente && (item.status === "awaiting_sponsor_approval" || item.status === "awaiting_approval")');
    // vazio = fechou: não resta ninguém a esperar
    expect(ROTA).toContain('const fechou = restantes.every((l: any) => l.status === "approved");');
    expect(ROTA).toContain('status: "sponsor_approved",');
    // a Arte é avisada para finalizar, como no caminho da aprovação
    expect(ROTA).toContain('targetRoles: ["arte"],');
    // e a tela de Versões não fica com cache velho
    expect(ROTA).toContain("invalidarCacheDeVersoes();");
  });

  it("a trilha diz o que aconteceu com a aprovação dele", () => {
    expect(ROTA).toContain("a aprovação que ele já deu permanece no histórico");
    expect(ROTA).toContain("a aprovação pendente dele foi descartada e deixa de contar");
    expect(ROTA).toContain('Com a saída de "${sponsorName}"');
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

describe("tirar do EVENTO cascateia para as peças (caso QCY, 25/08)", () => {
  it("remove o vínculo de cada peça viva e aplica a MESMA regra do peça a peça", () => {
    expect(ROTA).toContain("const doEvento = await storage.getItemsByEvent(eventId);");
    expect(ROTA).toContain("const tirou = await storage.removeSponsorFromItem(item.id, sponsorId);");
    // a regra mora numa função só — os dois caminhos não podem divergir
    expect((ROTA.match(/descartarPendenciaEFecharRodada\(/g) ?? []).length).toBe(3);
  });

  it("a rota ganhou a guarda de evento finalizado — agora ela mexe em peça", () => {
    expect(ROTA).toContain("if (await barraEventoFinalizado({ eventId }, res)) return;");
  });

  it("a trilha conta a cascata, com rodadas que fecharam", () => {
    expect(ROTA).toContain("desvinculado também de ${pecasDesvinculadas} peça");
    expect(ROTA).toContain("rodadasFechadas");
  });

  it("as peças rodam em PARALELO — o 'Salvando…' do modal não pode travar", () => {
    expect(ROTA).toContain("const resultados = await Promise.all(");
    expect(ROTA).not.toContain("for (const item of doEvento)");
  });

  it("peça cujo ÚNICO patrocinador saiu é INATIVADA — não volta, não segue (caso Testeira QCY)", () => {
    // Decisão do dono (25/08): cancelada, fora de todas as filas, visível só
    // no Painel Geral, com a explicação NA PEÇA.
    // ONDE QUER QUE ELA ESTEJA no fluxo — a exceção é só o que já existe no
    // mundo físico (cancelar ali reescreveria o registro do que foi impresso).
    expect(ROTA).toContain('const MATERIAL_JA_EXISTE = ["produced", "produzido", "conferred", "conferido", "delivered", "entregue"];');
    expect(ROTA).toContain('const TERMINAIS = ["canceled", "archived"];');
    expect(ROTA).toContain("const inativavel = !MATERIAL_JA_EXISTE.includes(item.status) && !TERMINAIS.includes(item.status);");
    expect(ROTA).toContain("const vinculadosRestantes = await storage.getItemSponsors(item.id);");
    expect(ROTA).toContain("if (vinculadosRestantes.length === 0) {");
    expect(ROTA).toContain('Cancelada automaticamente: o único patrocinador');
    expect(ROTA).toContain('status: "canceled",');
    // a observação anterior é preservada, não sobrescrita
    expect(ROTA).toContain('[explicacao, item.observations].filter(Boolean).join(" · ")');
    // a inativação vem ANTES do avanço de rodada — peça só do desvinculado
    // não pode "seguir" para produção
    expect(ROTA.indexOf("vinculadosRestantes.length === 0")).toBeLessThan(ROTA.indexOf('descartouPendente && (item.status === "awaiting_sponsor_approval"'));
    // e a cascata conta as inativadas na trilha do evento
    expect(ROTA).toContain("cancelada${inativadas !== 1 ?");
    // o toast do Atendimento conta o desfecho
    expect(TELA).toContain("Desvinculado — a peça foi cancelada");
  });

  it("a desvinculação aparece na trilha da PEÇA e com rótulo no log do sistema", () => {
    // entityType 'item' de propósito: a trilha da peça (e o Histórico)
    // consulta por item — 'item_sponsor' escondia a desvinculação de quem vai
    // perguntar "cadê o Fulano que estava aqui?".
    expect((ROTA.match(/'removed',\s*'item',/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(ROTA).toContain("junto com a remoção do evento");
    const LOGS = ler("client/src/pages/logs-sistema.tsx");
    expect(LOGS).toContain('event_sponsor: "Patrocinador do evento"');
    expect(LOGS).toContain('item_sponsor:  "Patrocinador da peça"');
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
