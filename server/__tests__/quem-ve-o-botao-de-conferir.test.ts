// ─────────────────────────────────────────────────────────────────────────────
// QUEM CONFERE, QUEM ENTREGA E QUEM PRODUZ.
//
// Esta pergunta já custou uma investigação inteira ("pra mim aparece e para o
// usuário de gráfica não"), e a resposta depende de coisas que moram em
// arquivos diferentes e precisam concordar:
//
//   1. o gate de papel no servidor  — quem a rota aceita;
//   2. o gate de papel no cliente   — quem vê o botão;
//   3. o recorte da lista           — quem recebe a peça.
//
// Se (2) for mais generoso que (1), o botão aparece e o clique volta 403. Se
// for mais restrito, alguém que PODE agir não encontra o caminho — foi esse o
// caso: a conferência estava presa no mesmo gate da produção.
//
// A REGRA QUE FICA:
//
//   • PRODUZIR      → grafica | admin          (quem tem a impressora)
//   • CONFERIR      → grafica | solicitacao | admin
//   • ENTREGAR      → grafica | solicitacao | admin
//
// Conferir e entregar andam JUNTOS de propósito: a entrega sai do conferido,
// então dar uma sem a outra deixa a peça num beco — foi o que aconteceu com a
// peça vinda do acervo, que não passa pela Gráfica porque não há o que
// imprimir. Se um dia alguém restringir só uma das duas, este arquivo cai.
// O gate do SERVIDOR (1) e a fila aberta a toda sessão (3) rodam nas rotas
// reais em regras-producao-itens.test.ts; aqui fica o espelho da tela (2).
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { fonteDaGrafica } from "./fonte-da-grafica";

const ler = (rel: string) => readFileSync(path.resolve(__dirname, "../../", rel), "utf8");
const tela = fonteDaGrafica();

describe("o cliente espelha os DOIS gates, e não confunde um com o outro", () => {
  it("produzir: grafica|admin", () => {
    expect(tela).toContain('const canProduce = ["grafica", "admin"].includes(user?.role ?? "")');
  });

  it("conferir: grafica|solicitacao|admin", () => {
    expect(tela).toContain('const podeConferir = ["grafica", "solicitacao", "admin"].includes(user?.role ?? "")');
  });

  it("o botão de conferir usa o gate de conferir, nas duas superfícies", () => {
    // A linha da tabela e o cartão do celular.
    expect(tela).toContain("podeConferir && canConfer(item)");
    expect(tela).toContain("podeConferir && canConferItem");
  });

  it("a conferência em lote também", () => {
    expect(tela).toContain("podeConferir && conferableInFilter.length > 0");
  });

  it("e nenhum botão de conferir ficou no gate de produzir", () => {
    // O defeito original, em uma linha: `canProduce` guardando conferência.
    expect(tela).not.toContain("canProduce && canConfer");
    expect(tela).not.toContain("canProduce && canConferItem");
    expect(tela).not.toContain("canProduce && conferableInFilter");
  });

  it("o botão de produzir continua no gate de produzir", () => {
    // !emRevisao veio na frente em 24/08 — a revisão ficou visível na
    // Gráfica, e produzir peça que a Revisão não liberou não é opção.
    expect(tela).toContain("const podeProduzirAqui = !emRevisao && canProduce &&");
  });
});

describe("a entrega por peça saiu da fila", () => {
  it("nenhum Entregar por peça — quem entrega é o volume (21/09: \"todas são embaladas\")", () => {
    expect(tela).not.toContain("canDeliver(");
    expect(tela).toContain("entregarTubo: item.tuboId");
  });
});
