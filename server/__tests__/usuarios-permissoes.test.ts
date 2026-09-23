// ─────────────────────────────────────────────────────────────────────────────
// O BLOCO DE PERMISSÕES DA TELA DE USUÁRIOS DIZ A VERDADE.
//
// O formulário oferecia cinco perfis num menu e nada explicava o que cada um
// concede. O bloco novo explica — e por isso passa a poder MENTIR, o que o
// menu mudo não podia. Um bloco que promete poder errado é pior que bloco
// nenhum: quem administra decide "posso dar este perfil para ela?" lendo dali.
//
// Este arquivo amarra cada afirmação da tela à guarda real do servidor
// (`requireRole`, `requireAdmin`, `req.userRole`). Se uma rota mudar de papel
// e a linha da tela ficar, o teste quebra aqui — que é o único lugar onde o
// desencontro aparece antes de virar acesso concedido por engano.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const TELA = readFileSync(new URL("../../client/src/pages/usuarios.tsx", import.meta.url), "utf8");

// A amarração tela ↔ servidor (cada ✓ e cada × da tela) roda de verdade em
// regras-infra2-permissoes-por-papel.test.ts: as rotas reais com a sessão de
// cada papel. Aqui fica o bloco da tela.

describe("o bloco na tela", () => {
  it("existe para os cinco perfis, com quatro linhas cada", () => {
    for (const papel of ["admin", "solicitacao", "arte", "grafica", "atendimento"]) {
      const i = TELA.indexOf(`  ${papel}: [`);
      expect(i, `perfil sem permissões declaradas: ${papel}`).toBeGreaterThan(-1);
      const bloco = TELA.slice(i, TELA.indexOf("  ],", i));
      expect(bloco.match(/\{ pode:/g)?.length, `${papel} deveria ter 4 linhas`).toBe(4);
    }
  });

  it("só o Admin não tem linha de 'não faz' — ele não tem restrição", () => {
    const bloco = (papel: string) => TELA.slice(TELA.indexOf(`  ${papel}: [`), TELA.indexOf("  ],", TELA.indexOf(`  ${papel}: [`)));
    expect(bloco("admin")).not.toContain("pode: false");
    for (const papel of ["solicitacao", "arte", "grafica", "atendimento"]) {
      expect(bloco(papel).match(/pode: false/g)?.length).toBe(2);
    }
  });

  it("o Admin ganha o tratamento vermelho e a frase do poder sem restrição", () => {
    expect(TELA).toContain('const ehAdmin = field.value === "admin";');
    // Os mesmos tons, agora pelos tokens (perigo.bg = #fef2f2, T.bg = n1 #fafaf9).
    expect(TELA).toContain("backgroundColor: ehAdmin ? TOM.perigo.bg : T.bg");
    expect(TELA).toContain("Perfil sem restrição: pode excluir dados e conceder acesso a outras pessoas.");
  });

  it("o ✓ e o × chegam ao leitor de tela como palavra, não só como cor", () => {
    expect(TELA).toContain('{l.pode ? "Pode: " : "Não pode: "}');
  });

  it('e tem o testid pedido', () => {
    expect(TELA).toContain('data-testid="bloco-permissoes"');
  });
});

describe("o que NÃO podia mudar continua de pé", () => {
  it("o card de Nível de Segurança segue fora", () => {
    // A expressão AINDA aparece no arquivo — no comentário que explica por que
    // o card saiu, e esse comentário é o que impede alguém de "reconstituir a
    // funcionalidade que faltava". O que não pode voltar é o card renderizado.
    const ocorrencias = TELA.match(/Nível de Segurança/g)?.length ?? 0;
    expect(ocorrencias).toBe(1);
    expect(TELA).toContain('O card "Nível de Segurança" foi REMOVIDO');
  });

  it("os dois FreezeWhileClosing continuam", () => {
    expect(TELA.match(/<FreezeWhileClosing/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("a lixeira continua ausente na própria linha", () => {
    expect(TELA).toContain("me?.id !== user.id");
  });

  it("o campo Perfil continua sendo o FilterSelect da casa", () => {
    expect(TELA).toContain('kind="field"');
    expect(TELA).toContain('testId="select-role"');
  });
});
