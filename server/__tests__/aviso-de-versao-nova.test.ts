// ─────────────────────────────────────────────────────────────────────────────
// AVISO DE VERSÃO NOVA (21/09): a aba aberta desde antes do deploy fica
// sabendo — o servidor manda X-App-Versao em toda resposta /api/*, o cliente
// guarda o primeiro valor e oferece "Recarregar" quando ele muda. Nunca
// recarrega sozinho (perderia o formulário de quem está digitando).
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import ts from "typescript";
import { calcularVersao, cabecalhoDeVersao, CABECALHO_DA_VERSAO } from "../versaoDoApp";
import { observarVersao, haVersaoNova, onVersaoNova, _zerarVersao, CABECALHO_DA_VERSAO as NO_CLIENTE } from "@/lib/versao-do-app";

const ler = (rel: string) => readFileSync(path.resolve(__dirname, "../..", rel), "utf8");

describe("servidor", () => {
  it("a versão é o hash do index do build — igual entre instâncias, muda com o cliente", () => {
    const a = calcularVersao("<html>assets/index-abc.js</html>", 1);
    expect(a).toBe(calcularVersao("<html>assets/index-abc.js</html>", 999));
    expect(a).not.toBe(calcularVersao("<html>assets/index-def.js</html>", 1));
    expect(a).toMatch(/^[0-9a-f]{12}$/);
    // sem build (desenvolvimento): o instante de início
    expect(calcularVersao(null, 42)).toBe("inicio-42");
  });

  it("o middleware carimba só /api/* e sempre segue adiante", () => {
    const mw = cabecalhoDeVersao("v1");
    const chamar = (p: string) => {
      const res = { setHeader: vi.fn() }; const next = vi.fn();
      mw({ path: p } as any, res as any, next);
      return { res, next };
    };
    const api = chamar("/api/items");
    expect(api.res.setHeader).toHaveBeenCalledWith(CABECALHO_DA_VERSAO, "v1");
    expect(api.next).toHaveBeenCalledOnce();
    const estatico = chamar("/assets/index.js");
    expect(estatico.res.setHeader).not.toHaveBeenCalled();
    expect(estatico.next).toHaveBeenCalledOnce();
  });

  it("está montado no index, antes das rotas", () => {
    // Varredura: server/index.ts sobe o servidor ao ser importado (listen,
    // banco), então não dá para executar. Pela AST: a CHAMADA app.use(
    // cabecalhoDeVersao(...)) existe e vem antes da chamada registerRoutes(...).
    const fonte = ts.createSourceFile("index.ts", ler("server/index.ts"), ts.ScriptTarget.Latest, true);
    const chamadas: { texto: string; pos: number }[] = [];
    const visita = (n: ts.Node) => {
      if (ts.isCallExpression(n)) chamadas.push({ texto: n.getText(fonte).replace(/\s+/g, ""), pos: n.getStart(fonte) });
      ts.forEachChild(n, visita);
    };
    visita(fonte);
    const monta = chamadas.find((c) => /^app\.use\(cabecalhoDeVersao\(/.test(c.texto));
    const rotas = chamadas.find((c) => /^registerRoutes\(/.test(c.texto));
    expect(monta, "app.use(cabecalhoDeVersao(...)) sumiu do index").toBeDefined();
    expect(rotas).toBeDefined();
    expect(monta!.pos).toBeLessThan(rotas!.pos);
  });
});

describe("cliente", () => {
  beforeEach(() => _zerarVersao());

  it("o mesmo nome de cabeçalho nos dois lados", () => {
    expect(NO_CLIENTE).toBe(CABECALHO_DA_VERSAO);
  });

  it("o primeiro valor é a versão da aba; igual não avisa; diferente avisa UMA vez e fica", () => {
    const ouvinte = vi.fn();
    onVersaoNova(ouvinte);
    observarVersao("a"); observarVersao("a");
    expect(haVersaoNova()).toBe(false);
    observarVersao("b");
    expect(haVersaoNova()).toBe(true);
    expect(ouvinte).toHaveBeenCalledOnce();
    // resposta velha em voo chega depois: a aba CONTINUA velha
    observarVersao("a"); observarVersao("c");
    expect(haVersaoNova()).toBe(true);
    expect(ouvinte).toHaveBeenCalledOnce();
  });

  it("cabeçalho ausente ou vazio (proxy, erro) não vira versão nem aviso", () => {
    observarVersao(null); observarVersao(""); observarVersao("  ");
    observarVersao("a"); observarVersao(undefined);
    expect(haVersaoNova()).toBe(false);
  });

  it("cancelar a assinatura funciona", () => {
    const ouvinte = vi.fn();
    onVersaoNova(ouvinte)();
    observarVersao("a"); observarVersao("b");
    expect(ouvinte).not.toHaveBeenCalled();
  });

  it("lido no ponto ÚNICO de fetch (queries, delta e apiRequest passam por ele)", () => {
    const Q = ler("client/src/lib/queryClient.ts");
    expect(Q).toContain("observarVersao(res.headers?.get?.(CABECALHO_DA_VERSAO));");
    // ninguém chama fetch por fora do fetchComRede
    expect(Q.match(/await fetch\(/g)!.length).toBe(1);
  });

  it("a faixa fica fora das rotas, oferece Recarregar e NÃO recarrega sozinha", () => {
    const A = ler("client/src/App.tsx");
    expect(A).toContain("<AvisoDeVersaoNova />");
    expect(A).toContain("Há uma versão nova do NORTE");
    const i = A.indexOf("function AvisoDeVersaoNova()");
    const corpo = A.slice(i, A.indexOf("export default function App()"));
    expect(corpo.match(/location\.reload\(\)/g)!.length).toBe(1);
    expect(corpo).toContain("onClick={() => window.location.reload()}");
  });
});
