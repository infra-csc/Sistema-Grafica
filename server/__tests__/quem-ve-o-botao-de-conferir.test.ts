// ─────────────────────────────────────────────────────────────────────────────
// QUEM VÊ O BOTÃO DE CONFERIR.
//
// Esta pergunta já custou uma investigação inteira ("pra mim aparece e para o
// usuário de gráfica não"), e a resposta depende de TRÊS coisas que moram em
// arquivos diferentes e precisam concordar:
//
//   1. o gate de papel no servidor  — quem a rota aceita;
//   2. o gate de papel no cliente   — quem vê o botão;
//   3. o recorte da lista           — quem recebe a peça.
//
// Se (2) for mais generoso que (1), o botão aparece e o clique volta 403. Se
// for mais restrito, alguém que PODE conferir não encontra o caminho. E se (3)
// recortasse por papel, os dois primeiros estariam certos e a peça ainda assim
// não chegaria na tela.
//
// SOLICITAÇÃO NÃO VER O BOTÃO É O COMPORTAMENTO CORRETO, não um defeito: o
// servidor recusa com "Apenas a Gráfica pode conferir", e mostrar o botão para
// ela seria oferecer um clique que já se sabe que vai falhar.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const ler = (rel: string) => readFileSync(path.resolve(__dirname, "../../", rel), "utf8");
const rotas = ler("server/routes/items.ts");
const tela = ler("client/src/pages/grafica.tsx");

describe("o gate do servidor", () => {
  it("aceita gráfica e admin, e mais ninguém", () => {
    expect(rotas).toContain('(req as any).userRole !== "grafica" && (req as any).userRole !== "admin"');
    expect(rotas).toContain("Apenas a Gráfica pode conferir");
  });
});

describe("o gate do cliente espelha o do servidor", () => {
  it("canProduce é exatamente grafica|admin", () => {
    expect(tela).toContain('const canProduce = ["grafica", "admin"].includes(user?.role ?? "")');
  });

  it("e é ele que libera o botão de conferir", () => {
    // As duas superfícies da tela (a linha da tabela e o cartão do celular).
    expect(tela).toContain("canProduce && canConfer(item)");
    expect(tela).toContain("canProduce && canConferItem");
  });
});

describe("a fila da Gráfica não é recortada por papel", () => {
  it("/api/items/approved pede só sessão", () => {
    // Um recorte por papel aqui deixaria os dois gates acima corretos e a peça
    // mesmo assim invisível — o modo mais caro de errar, porque nada no código
    // do botão explicaria a ausência dela.
    expect(rotas).toContain('app.get("/api/items/approved", requireAuth, async (req, res) => {');
  });
});
