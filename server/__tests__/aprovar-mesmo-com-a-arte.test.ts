// ─────────────────────────────────────────────────────────────────────────────
// APROVAÇÃO COM A PEÇA NA CORREÇÃO DA ARTE — a regra afinada (dono, 31/08).
//
// A primeira leitura ("deixar aprovar mesmo com a Arte") virou, com o print
// na mão, esta regra: QUEM REPROVOU não aprova enquanto a Arte não devolver
// a nova versão — a linha dele fica travada. Os DEMAIS patrocinadores seguem
// aprovando normalmente, e a tela AVISA que a Arte está refazendo, por quem
// e por quê. O "aprovar por cima da correção" foi descartado no mesmo dia em
// que nasceu — este arquivo impede que ele volte por engano.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const ler = (rel: string) => readFileSync(path.resolve(__dirname, "../..", rel), "utf8");
const ITEMS = ler("server/routes/items.ts");
const TELA = ler("client/src/pages/atendimento.tsx");

describe("a rota", () => {
  it("quem reprovou segue TRAVADO até a nova arte — o 409 é a regra, não um bug", () => {
    expect(ITEMS).toContain("Aguardando nova versão da Arte para este patrocinador. Não é possível aprovar agora.");
    // e o atalho descartado não voltou
    expect(ITEMS).not.toContain("aprovouVersaoAntiga");
    expect(ITEMS).not.toContain("VERSÃO ANTIGA");
  });
});

describe("a tela", () => {
  it("o AVISO em largura total diz que a Arte refaz, por quem e por quê — e que os demais seguem", () => {
    expect(TELA).toContain("aviso-refazendo-");
    expect(TELA).toContain("Arte está refazendo uma nova versão");
    expect(TELA).toContain("por causa da reprovação de");
    expect(TELA).toContain("{approval?.rejectionReason ?");
    expect(TELA).toContain("os demais patrocinadores seguem aprovando normalmente");
    // a 1ª versão nasceu DENTRO do cabeçalho flex e virava coluna espremida
    expect(TELA).toContain("fora do cabeçalho flex");
  });

  it("a linha reprovada NÃO tem botão de aprovar; sem 'aprovar mesmo assim' em lugar nenhum", () => {
    expect(TELA).not.toContain("button-approve-anyway");
    expect(TELA).not.toContain("Aprovar mesmo assim");
    expect(TELA).not.toContain("versaoAntiga");
  });

  it("o comunicado do card parou de dizer 'nada a fazer' quando há outros a decidir", () => {
    expect(TELA).not.toContain("nada a fazer aqui — você é avisado quando voltar");
    expect(TELA).toContain("quem reprovou espera a nova arte");
    expect(TELA).toContain("e pode(m) ser decidido(s) agora");
    // o hint da legenda conta a mesma regra
    expect(TELA).toContain("os demais patrocinadores seguem podendo ser aprovados");
  });

  it("o card diz 'Revisar' (há o que fazer: os outros patrocinadores) e o lote segue restrito", () => {
    const rotulo = TELA.slice(TELA.indexOf('const rotulo = isFullyApproved ? "Ver histórico"'));
    expect(rotulo.slice(0, 220)).not.toContain("hasArteBlock");
    expect(TELA).toContain('if (status !== "pending" && status !== "new_version_pending") return [];');
  });
});
