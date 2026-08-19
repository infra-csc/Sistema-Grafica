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
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const ler = (rel: string) => readFileSync(path.resolve(__dirname, "../../", rel), "utf8");
const rotas = ler("server/routes/items.ts");
const tela = ler("client/src/pages/grafica.tsx");

describe("o servidor: conferir e entregar têm os MESMOS donos", () => {
  it("conferir aceita gráfica, solicitação e admin", () => {
    expect(rotas).toContain('if (!["grafica", "solicitacao", "admin"].includes((req as any).userRole ?? "")) {');
  });

  it("entregar aceita os mesmos três", () => {
    expect(rotas).toContain('if (!["grafica", "solicitacao", "admin"].includes(req.userRole ?? "")) {');
  });

  it("mas produzir continua só de quem tem a impressora", () => {
    expect(rotas).toContain('if (req.userRole !== "grafica" && req.userRole !== "admin") {');
    expect(rotas).toContain("Apenas usuários com perfil Gráfica podem iniciar produção");
  });
});

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
    expect(tela).toContain("const podeProduzirAqui = canProduce &&");
  });
});

describe("a entrega não tem gate de papel no cliente", () => {
  it("quem a limita é o SALDO, não a permissão", () => {
    // `canDeliver(item)` é conta de saldo. O papel é barrado no servidor, que é
    // onde ele precisa ser barrado; duplicar aqui só criaria uma segunda regra
    // para divergir da primeira.
    expect(tela).toContain("{!bulkOn && canDeliver(item) && (");
  });
});

describe("a fila da Gráfica não é recortada por papel", () => {
  it("/api/items/approved pede só sessão", () => {
    // Um recorte por papel aqui deixaria os gates acima corretos e a peça mesmo
    // assim invisível — o modo mais caro de errar, porque nada no código do
    // botão explicaria a ausência dela.
    expect(rotas).toContain('app.get("/api/items/approved", requireAuth, async (req, res) => {');
  });
});
