// ─────────────────────────────────────────────────────────────────────────────
// APROVAR MESMO COM A ARTE (decisão do dono, 31/08).
//
// O fluxo real que a trava antiga ignorava: o patrocinador reprova, a linha
// vai para a Arte corrigir (awaiting_arte) — e o cliente volta atrás e aceita
// a versão que tinha reprovado. A rota respondia 409 ("aguardando nova
// versão") e obrigava a esperar uma correção que ninguém mais queria.
//
// O que este arquivo prende:
//  · a aprovação PASSA de awaiting_arte — e o botão é o MESMO "Aprovar"
//    (pedido literal: "o nome do botão tem que ser o mesmo · só aprovar");
//  · o registro diz VERSÃO ANTIGA com todas as letras (trilha) e a Arte é
//    avisada na hora para parar a correção;
//  · a tela AVISA antes de decidir: "a Arte está refazendo... pela reprovação
//    de X: motivo" (pedido literal do dono);
//  · o LOTE continua só decidindo pending/new_version — aprovar por cima da
//    correção é gesto individual e consciente, nunca em massa.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const ler = (rel: string) => readFileSync(path.resolve(__dirname, "../..", rel), "utf8");
const ITEMS = ler("server/routes/items.ts");
const TELA = ler("client/src/pages/atendimento.tsx");

describe("a rota", () => {
  it("awaiting_arte deixou de ser 409 — virou aprovação sobre a versão antiga", () => {
    expect(ITEMS).not.toContain("Aguardando nova versão da Arte para este patrocinador");
    expect(ITEMS).toContain("const aprovouVersaoAntiga = approval?.status === 'awaiting_arte';");
  });

  it("a trilha carimba VERSÃO ANTIGA e a Arte é avisada de parar a correção", () => {
    expect(ITEMS).toContain("SOBRE A VERSÃO ANTIGA: a linha estava com a Arte para correção");
    const aviso = ITEMS.slice(ITEMS.indexOf("if (aprovouVersaoAntiga) {"));
    expect(aviso.slice(0, 800)).toContain("aprovou a VERSÃO ANTIGA de");
    expect(aviso.slice(0, 800)).toContain('targetRoles: ["arte"],');
  });
});

describe("a tela", () => {
  it("a linha com a Arte tem o MESMO botão Aprovar (verde, rótulo idêntico)", () => {
    expect(TELA).toContain("{v.isAwaitingArte && !isRejectingThis && canDecide && (");
    const bloco = TELA.slice(TELA.indexOf("button-approve-anyway-"));
    // mesmo visual do Aprovar normal
    expect(bloco.slice(0, 900)).toContain("backgroundColor: '#f0fdf4', border: '1px solid #86efac',");
    // rótulo idêntico — sem "mesmo assim"
    expect(TELA).not.toContain("Aprovar mesmo assim");
    // e sem botão de Reprovar nesse modo: a linha já está reprovada
    const modo = TELA.slice(TELA.indexOf("{v.isAwaitingArte && !isRejectingThis && canDecide && ("), TELA.indexOf("{isPending && !isRejectingThis && ("));
    expect(modo).not.toContain("Reprovar");
  });

  it("o AVISO na tela diz que a Arte está refazendo, por quem e por quê", () => {
    expect(TELA).toContain("aviso-refazendo-");
    expect(TELA).toContain("Arte está refazendo uma nova versão");
    expect(TELA).toContain("por causa da reprovação de");
    expect(TELA).toContain("{approval?.rejectionReason ?");
  });

  it("a confirmação explica o efeito, e o card diz 'Revisar' (há o que fazer lá)", () => {
    expect(TELA).toContain("versaoAntiga?: boolean");
    expect(TELA).toContain("a aprovação vale para a <strong>versão antiga</strong>");
    // 'Ver histórico' só para peça 100% aprovada — o ramo hasArteBlock saiu
    const rotulo = TELA.slice(TELA.indexOf('const rotulo = isFullyApproved ? "Ver histórico"'));
    expect(rotulo.slice(0, 220)).not.toContain("hasArteBlock");
  });

  it("o LOTE não aprova por cima da correção — awaiting_arte fica fora dele", () => {
    expect(TELA).toContain('if (status !== "pending" && status !== "new_version_pending") return [];');
  });
});
