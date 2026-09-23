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
//
// A regra do servidor (o DELETE peça a peça, a cascata do evento e a
// inativação) roda de verdade em regras-patrocinio-vinculos; o descarte de
// UMA linha, em regras-patrocinio-storage; o script de reparo, em
// regras-patrocinio-reparos. Aqui ficam a tela e os casos que cruzam as duas.
import { describe, it, expect } from "vitest";
import { fonteDaTela } from "./fonte-da-tela";
import { readFileSync } from "fs";
import path from "path";

const ler = (rel: string) => readFileSync(path.resolve(__dirname, "../..", rel), "utf8");
const ROTA = ler("server/routes/sponsors.ts");
const TELA = fonteDaTela("atendimento");

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
    expect(TELA).toContain(".filter((s) => s.id !== variables.sponsorId)");
    expect(TELA).toContain("setSponsorApprovals(prev => prev.filter(a => a.sponsorId !== variables.sponsorId));");
    expect(TELA).toContain("Desvinculado — a peça seguiu");
  });
});

describe("tirar do EVENTO cascateia para as peças (caso QCY, 25/08)", () => {
  it("peça cujo ÚNICO patrocinador saiu é INATIVADA — não volta, não segue (caso Testeira QCY)", () => {
    // Decisão do dono (25/08): cancelada, fora de todas as filas, visível só
    // no Painel Geral, com a explicação NA PEÇA.
    // ONDE QUER QUE ELA ESTEJA no fluxo — a exceção é peça que JÁ CHEGOU NA
    // GRÁFICA (regra do dono): dali em diante é trabalho de chão de fábrica.
    // A fronteira sai da lista canônica, não de uma segunda cópia local.
    expect(ROTA).toContain("const inativavel = !DEPOIS_DA_ARTE.has(item.status);");
    expect(ROTA).toContain('import { DEPOIS_DA_ARTE, POS_APROVACAO } from "@shared/fluxo-peca";');
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
