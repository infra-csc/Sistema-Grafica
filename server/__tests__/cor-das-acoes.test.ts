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

// ─────────────────────────────────────────────────────────────────────────────
// COERÊNCIA NO APP INTEIRO (dono aprovou, 15/10): a mesma ação, a mesma cor.
describe("a mesma ação tem a mesma cor em todas as telas", () => {
  it("Reaproveitar é esmeralda também na Revisão Final (o verde ficou com o Entregar)", () => {
    expect(ler("client/src/components/revisao/estilos.ts")).toContain('color: TOM.esmeralda.text, border: `1px solid ${TOM.esmeralda.border}`');
    expect(ler("client/src/components/revisao/barra-do-lote.tsx")).toContain("backgroundColor: TOM.esmeralda.bg, color: TOM.esmeralda.text");
    expect(ler("client/src/components/revisao/dialogo-reaproveitamento.tsx")).toContain('tom="esmeralda"');
    expect(ler("client/src/components/revisao/confirmar-lote-reaproveitar.tsx")).toContain('tom="esmeralda"');
  });

  it("Devolver para a Arte é o primário (devolver não apaga) — nunca o perigo", () => {
    const ev = ler("client/src/components/detalhe-do-evento/devolver-evento-para-arte-dialog.tsx");
    expect(ev).toContain('<Botao variante="primario" tamanho={isMobile ? "toque" : "md"} icone={RotateCcw} onClick={devolver}');
    expect(ev).not.toContain('variante="perigo"');
  });

  it("Travar tem a forma do Destravar: perigo secundário (contorno vermelho)", () => {
    const trava = ler("client/src/components/grafica/fila/trava-da-peca.tsx");
    expect(trava).toContain('<Botao variante="perigoSecundario" tamanho="sm" icone={Lock}');
    expect(trava).toContain('<Botao variante="perigoSecundario" tamanho="sm" icone={Unlock}');
    const ficha = ler("client/src/components/revisao/ficha-decisao.tsx");
    expect(ficha.match(/variante="perigoSecundario"\s+tamanho=(?:"[^"]+"|\{[^}]+\})\s+icone=\{Lock\}/g)?.length).toBe(2);
  });

  it("Aprovar (Atendimento) é verde do gatilho à confirmação e ao lote", () => {
    expect(ler("client/src/components/atendimento/confirmacoes.tsx").match(/variante="primario"\s+tom="sucesso"/g)?.length).toBe(2);
    expect(ler("client/src/components/atendimento/painel-de-lote.tsx")).toMatch(/variante="primario"\s+tom="sucesso"/);
    expect(ler("client/src/components/atendimento/decisao-da-revisao.tsx")).toContain('data-testid="button-approve-item"');
  });

  it("lixeira das listas: cinza em repouso, vermelho só no hover/foco", () => {
    expect(ler("client/src/pages/estoque.tsx")).toContain('className="est-acao-perigo cor-acao-lixeira"');
    expect(ler("client/src/components/eventos/acoes-do-evento.tsx")).toContain('className="evl-acao evl-acao-perigo" style={{ ...btnBase, backgroundColor: T.surface, color: T.apoio }}');
    expect(ler("client/src/components/revisao/linha-da-peca.tsx")).toContain('className="cor-acao-lixeira"');
    expect(ler("client/src/index.css")).toContain(".cor-acao-lixeira:hover:not(:disabled)");
  });

  it("perigo secundário oficial (Cotas, Pedidos, Kit) e o Criar preto dos Pedidos", () => {
    expect(ler("client/src/pages/configurar-cotas.tsx").match(/variante="perigoSecundario"/g)?.length).toBe(2);
    expect(ler("client/src/components/pedidos/formulario-do-pedido.tsx")).toContain('<Botao variante="perigoSecundario" tamanho={tamanhoPequeno} icone={Trash2} onClick={onRemover}');
    expect(ler("client/src/components/kit/painel-do-kit.tsx")).toContain('<Botao variante="perigoSecundario" tamanho="sm" icone={Trash2} data-testid={`button-excluir-remessa-${r.id}`}');
    expect(ler("client/src/components/pedidos/cartao-do-pedido.tsx")).toContain('criar:      { fundo: T.dark, cor: T.surface, borda: T.dark, classe: "ds-botao" }');
  });

  it("Análises > Eventos: o contador de embaladas é o azul do Embalado", () => {
    expect(ler("client/src/pages/analises/abas/eventos.tsx")).toContain('pecas={e.porEtapa.get("packed") ?? []} tom="info"');
  });
});
