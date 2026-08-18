// ─────────────────────────────────────────────────────────────────────────────
// O RÓTULO DIZ O QUE A FAIXA REALMENTE CARREGA.
//
// O defeito que este arquivo existe para impedir, contado uma vez:
//
// A faixa do topo do Painel Geral tinha o título fixo "PRECISA DE ATENÇÃO", mas
// ela aparece por TRÊS motivos e um deles não é alerta nenhum: peça oculta
// porque o evento já foi encerrado ou realizado é informação de recorte.
//
// E esse é o caso mais comum. Em produção: 147 peças ocultas, zero reprovadas,
// zero atrasadas. Ou seja, na maior parte do tempo a faixa anunciava urgência e
// entregava uma nota de rodapé.
//
// Rótulo que promete o que não cumpre custa caro duas vezes: gasta a atenção de
// quem lê agora e ensina a ignorar a faixa da próxima vez — inclusive quando
// ela estiver certa. É assim que um alerta legítimo vira ruído.
//
// A regra que fica: severidade é conteúdo, não moldura. Se o título anuncia
// urgência, ele só pode aparecer quando existir urgência de verdade.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const painel = readFileSync(path.resolve(__dirname, "../../client/src/pages/painel-geral.tsx"), "utf8");

describe("a faixa do topo não promete urgência à toa", () => {
  it("o rótulo é derivado do que existe na faixa", () => {
    expect(painel).toContain("const temAlerta = atencao.reprovadas > 0 || atencao.atrasadas > 0;");
    expect(painel).toContain('const rotulo = temAlerta ? "Precisa de atenção" : "Fora da lista";');
  });

  it("a peça oculta sozinha NÃO conta como alerta", () => {
    // `chipOcultasDados` continua abrindo a faixa — a informação é útil — mas
    // não entra no cálculo de `temAlerta`.
    const i = painel.indexOf("const temAlerta =");
    const linha = painel.slice(i, painel.indexOf("\n", i));
    expect(linha).not.toContain("chipOcultas");
  });

  it("o nome acessível acompanha o rótulo visível", () => {
    // Antes o aria-label era a string fixa "Precisa de atenção": quem usa
    // leitor de tela ouvia o alerta falso mesmo depois de a tela deixar de
    // mostrá-lo.
    expect(painel).toContain("<section aria-label={rotulo}");
    expect(painel).toContain("{rotulo}</span>");
  });
});

describe("o espaçamento fica numa escala", () => {
  it("não há gaps fora de grade", () => {
    // 3px e 5px não pertenciam a grade nenhuma — eram espaçamento de ícone
    // para texto escrito no olho. O resto da tela usa 4/6/8/10/12/16/24.
    expect(painel).not.toMatch(/gap: 3,/);
    expect(painel).not.toMatch(/gap: 5,/);
  });
});
