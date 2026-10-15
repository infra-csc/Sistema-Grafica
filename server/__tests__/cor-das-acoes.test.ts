// A COR DAS AÇÕES EMBALAR E ENTREGAR (dono, 15/10): Embalar amarelo, Entregar
// verde — só na Gráfica. Trava o contraste dos tokens (texto × fundo ≥ 4,5:1,
// no repouso e no hover/ativo) e que as telas da Gráfica usam o token, não o
// azul do Embalado que valia antes.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ACAO, CLASSE_DA_ACAO, pinturaDaAcao, tintaDaAcao } from "../../client/src/lib/theme";
import { P } from "../../client/src/lib/status";

const luminancia = (hex: string) => {
  const canal = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * canal(1) + 0.7152 * canal(3) + 0.0722 * canal(5);
};
const razao = (a: string, b: string) => {
  const [x, y] = [luminancia(a), luminancia(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
const ler = (rel: string) => readFileSync(path.resolve(__dirname, "../..", rel), "utf8");

describe("os tokens ACAO passam AA", () => {
  for (const [nome, a] of Object.entries(ACAO)) {
    it(`${nome}: texto sobre o fundo, o hover e o ativo`, () => {
      for (const fundo of [a.bg, a.hover, a.ativo]) {
        expect(razao(a.text, fundo), `${a.text} sobre ${fundo}`).toBeGreaterThanOrEqual(4.5);
      }
    });
    it(`${nome}: a versão clara (área tingida)`, () => {
      expect(razao(a.claro.text, a.claro.bg)).toBeGreaterThanOrEqual(4.5);
      expect(razao(a.claro.text, "#ffffff")).toBeGreaterThanOrEqual(4.5);
    });
    it(`${nome}: o traço (anel do rádio, caixa marcada) aparece no branco (≥ 3:1)`, () => {
      expect(razao(a.traco, "#ffffff")).toBeGreaterThanOrEqual(3);
    });
  }

  it("Embalar é amarelo de texto ESCURO — branco no amarelo não passaria", () => {
    expect(razao("#ffffff", ACAO.embalar.bg)).toBeLessThan(3);
    expect(ACAO.embalar.text).not.toBe("#ffffff");
  });

  it("Entregar é o verde do sucesso; nenhum dos dois é o azul do Embalado", () => {
    expect(ACAO.entregar.bg).toBe(P.green.text);
    expect(ACAO.embalar.bg).not.toBe(P.blue.text);
    expect(ACAO.entregar.bg).not.toBe(P.blue.text);
    // Nem o âmbar/laranja de "Em impressão" e do complemento.
    expect(ACAO.embalar.bg).not.toBe(P.amber.text);
    expect(ACAO.embalar.bg).not.toBe(P.orange.text);
  });

  it("pinturaDaAcao leva o hover/ativo por variável; tintaDaAcao é a versão clara", () => {
    const s = pinturaDaAcao(ACAO.embalar) as Record<string, string>;
    expect(s.backgroundColor).toBe(ACAO.embalar.bg);
    expect(s.color).toBe(ACAO.embalar.text);
    expect(s["--cor-acao-hover"]).toBe(ACAO.embalar.hover);
    expect(s["--cor-acao-ativo"]).toBe(ACAO.embalar.ativo);
    expect(tintaDaAcao(ACAO.entregar).backgroundColor).toBe(ACAO.entregar.claro.bg);
    const css = ler("client/src/index.css");
    expect(css).toContain(`.ds-botao.${CLASSE_DA_ACAO}:hover:not(:disabled)`);
    expect(css).toContain("background-color: var(--cor-acao-hover) !important;");
  });
});

describe("a Gráfica usa os tokens", () => {
  it("linha, cartão, aba Tubos e painel de Tubos", () => {
    const linha = ler("client/src/components/grafica/fila/acoes-da-linha.tsx");
    expect(linha).toContain("style={pinturaDaAcao(ACAO.embalar)}");
    expect(linha).toContain("style={pinturaDaAcao(ACAO.entregar)}");
    expect(linha).not.toContain("corDaAcao(TOM.info.text)");
    const cartao = ler("client/src/components/grafica/fila/acoes-do-cartao.tsx");
    expect(cartao).not.toContain("corDaAcao(TOM.info.text)");
    expect(cartao).toContain("...pinturaDaAcao(ACAO.entregar)");
    const aba = ler("client/src/components/grafica/aba-tubos.tsx");
    expect(aba.match(/pinturaDaAcao\(ACAO\.entregar\)/g)?.length).toBe(2);
    const tubos = ler("client/src/components/tubos-dialog.tsx");
    expect(tubos).toContain('acao={ACAO.embalar} testId="confirmar-embalar"');
    expect(tubos).toContain("acao={ACAO.entregar} testId={`confirmar-entrega-tubo-${n}`}");
    expect(tubos).toContain('acao={ACAO.entregar} testId="confirmar-entrega-em-lote"');
    expect(tubos).toContain("tint={ACAO.embalar.bg} corDoIcone={ACAO.embalar.text}");
  });

  it("lote, cabeçalho e o 'já embalar' do modal da peça", () => {
    expect(ler("client/src/components/grafica/fila/barra-do-lote.tsx")).toContain("bulkPackMode ? ACAO.embalar.bg");
    expect(ler("client/src/components/grafica/fila/cabecalho-da-grafica.tsx")).toContain("...tintaDaAcao(ACAO.embalar)");
    expect(ler("client/src/components/grafica/modais/modal-da-peca.tsx")).toContain("...tintaDaAcao(ACAO.embalar)");
  });
});
