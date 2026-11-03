// ─────────────────────────────────────────────────────────────────────────────
// OS PEDIDOS DO DONO DE 03/11 NA GRÁFICA.
//   · Módulo Reaproveitar: "a pessoa vai colocar quantos temos no estoque; caso
//     ele não coloque todos, o item vai para a Gráfica produzir";
//   · o Kit como grupo único na fila;
//   · observação no Conferir, no Embalar e no Entregar;
//   · confirmação no "Tudo" das máquinas; copiar a descrição.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import {
  aguardaReaproveitar, pedidoDoReaproveitar, pedeAoEstoque, fraseDaResposta, trilhaDaResposta,
} from "@shared/reaproveitar";
import { ordenarFilaDaGrafica } from "@/components/grafica/fila/ordem-da-fila";
import { cabecalhosDaPosicao } from "@/components/grafica/fila/grupo-das-prioritarias";
import { linhasDeObservacao } from "@/components/grafica/observacoes-da-peca";
import type { PecaDaFila } from "@/components/grafica/tipos";

const raiz = path.resolve(__dirname, "../..");
const ler = (f: string) => readFileSync(path.join(raiz, f), "utf8");

describe("Reaproveitar — quem espera a resposta", () => {
  it("só a peça liberada com pedido; respondida, ou que saiu da fila, não espera mais", () => {
    expect(aguardaReaproveitar({ reusoPedido: 6, status: "ready_for_production" })).toBe(true);
    expect(aguardaReaproveitar({ reusoPedido: null, status: "ready_for_production" })).toBe(false);
    expect(aguardaReaproveitar({ reusoPedido: 0, status: "ready_for_production" })).toBe(false);
    // Cancelada ou devolvida com o pedido gravado: não some da fila errada para sempre.
    expect(aguardaReaproveitar({ reusoPedido: 6, status: "canceled" })).toBe(false);
    expect(aguardaReaproveitar({ reusoPedido: 6, status: "awaiting_final_review" })).toBe(false);
    expect(aguardaReaproveitar(null)).toBe(false);
  });

  it("o pedido tem teto na quantidade atual (a peça pode ter sido reduzida)", () => {
    expect(pedidoDoReaproveitar({ reusoPedido: 6, quantity: 10 })).toBe(6);
    expect(pedidoDoReaproveitar({ reusoPedido: 6, quantity: 4 })).toBe(4);
  });

  it("em trânsito não pede ao estoque: segue direto", () => {
    expect(pedeAoEstoque("em_transito")).toBe(false);
    expect(pedeAoEstoque("estoque")).toBe(true);
    expect(pedeAoEstoque(null)).toBe(true);
  });

  it("a frase diz o que vai para a Gráfica: a peça menos o que saiu do estoque", () => {
    // Peça de 10, pedido de 6, 4 no estoque: imprime 6 (não 2).
    expect(fraseDaResposta(4, 10)).toBe("4 un. saem do estoque e 6 un. vão para a Gráfica produzir.");
    expect(fraseDaResposta(0, 10)).toBe("Nada no estoque: as 10 un. vão para a Gráfica produzir.");
    expect(fraseDaResposta(0, 1)).toBe("Nada no estoque: a unidade vai para a Gráfica produzir.");
    expect(fraseDaResposta(10, 10)).toBe("As 10 un. saem do estoque, nada vai para a impressora.");
    expect(fraseDaResposta(1, 2)).toBe("1 un. sai do estoque e 1 un. vai para a Gráfica produzir.");
    expect(trilhaDaResposta(4, 6, 10)).toBe("Reaproveitar: estoque confirmou 4 de 6 un. pedidas — 6 un. vão para a Gráfica produzir");
    expect(trilhaDaResposta(0, 6, 10)).toBe("Reaproveitar: nada no estoque (pedidas 6 un.) — 10 un. vão para a Gráfica produzir");
  });
});

describe("Reaproveitar — as pontas amarradas", () => {
  const LIBERACAO = ler("server/routes/itens/revisao.ts");
  const MARCA = ler("server/routes/itens/reaproveitamento.ts");

  it("a Revisão Final pede ao estoque em vez de aplicar", () => {
    expect(LIBERACAO).toContain("pedeAoEstoque(origemNova?.origemReaproveitamento)");
    expect(LIBERACAO).toContain("{ reusoPedido: pedidoAoEstoque, reuseQty: 0, isReuse: false }");
    // Com pedido a peça NÃO entra como produzida: só o total em trânsito pula.
    expect(LIBERACAO).toContain(`isFullReuse && pedidoAoEstoque == null ? "produced" : "ready_for_production"`);
  });

  it("a resposta valida o pedido, aceita zero e limpa o pedido", () => {
    expect(MARCA).toContain("req.body?.respostaDoEstoque === true");
    expect(MARCA).toContain("temos < 0 || temos > pedido");
    expect(MARCA).toContain("gravarSeNaoMudou(current, { reusoPedido: null })");
    expect(MARCA).toMatch(/isReuse: isFullReuse,\n\s+\/\/ Respondeu[^\n]*\n\s+reusoPedido: null,/);
  });

  it("espera fora da Gráfica, das impressoras e da impressão", () => {
    expect(ler("client/src/components/grafica/hooks/use-fila-da-grafica.ts")).toContain("pecasBrutas.filter((p) => !aguardaReaproveitar(p))");
    const maquinas = ler("server/routes/maquinas.ts");
    expect(maquinas).toContain("and coalesce(i.reuso_pedido, 0) = 0");
    expect(maquinas).toContain("if (aguardaReaproveitar(item)) return FRASE_AGUARDA_REAPROVEITAR;");
    expect(ler("server/routes/itens/impressao.ts")).toContain("if (aguardaReaproveitar(current)) throw falha(409, { error: FRASE_AGUARDA_REAPROVEITAR });");
  });

  it("a tela e o menu existem, para os mesmos papéis da Gráfica", () => {
    expect(ler("client/src/App.tsx")).toContain(`<RoleProtectedRoute component={Reaproveitar} allowedRoles={ROLES_GRAFICA} />`);
    const menu = ler("client/src/components/app-sidebar.tsx");
    expect(menu).toContain(`url: "/reaproveitar"`);
    expect(menu).toContain(`queryKey: ["/api/items", "reaproveitar/contagem"]`);
    // O campo nasce vazio: a resposta é uma contagem, não um padrão aceito sem ver.
    expect(ler("client/src/pages/reaproveitar.tsx")).toContain(`useState("")`);
  });
});

describe("O Kit como grupo único na fila da Gráfica", () => {
  const ev = { name: "Copa", truckDepartureDate: "2026-11-10T00:00:00.000Z" };
  const peca = (displayId: string, type: string, kit = false) => ({ id: displayId, displayId, type, event: ev, isPriority: false, kitRemessaId: kit ? "r1" : null }) as unknown as PecaDaFila;

  it("as peças do Kit vêm juntas, depois dos tipos do evento, seja qual for o tipo", () => {
    const ordem = ordenarFilaDaGrafica([peca("#4", "Totem", true), peca("#1", "Banner"), peca("#3", "Arco", true), peca("#2", "Placa")]);
    expect(ordem.map((p) => p.displayId)).toEqual(["#1", "#2", "#3", "#4"]);
  });

  it("um cabeçalho só para o Kit, mesmo com tipos diferentes", () => {
    const [a, b, k1, k2] = ordenarFilaDaGrafica([peca("#1", "Banner"), peca("#2", "Placa"), peca("#3", "Arco", true), peca("#4", "Totem", true)]);
    expect(cabecalhosDaPosicao(b, a, 0).showTypeHeader).toBe(true);
    expect(cabecalhosDaPosicao(k1, b, 0).showTypeHeader).toBe(true);
    expect(cabecalhosDaPosicao(k2, k1, 0).showTypeHeader).toBe(false);
  });

  it("o filtro Grupo oferece o Kit", () => {
    expect(ler("client/src/components/grafica/hooks/use-facetas-da-fila.ts")).toContain("grupoDoKit(i) ?? groupOf(i.type)");
    expect(ler("client/src/lib/grafica-filtros.ts")).toContain(`grupoDoKit(item) ?? ctx.groupOf(`);
  });
});

describe("Observação no Conferir, no Embalar e no Entregar", () => {
  it("o bloco junta o que veio antes e ignora o vazio", () => {
    expect(linhasDeObservacao({ observations: " cuidado ", conferenceNotes: "ilhós frouxo" }, [{ rotulo: "Na embalagem", texto: "por cima" }])).toEqual([
      { rotulo: "Observação da peça", texto: "cuidado" },
      { rotulo: "Na conferência", texto: "ilhós frouxo" },
      { rotulo: "Na embalagem", texto: "por cima" },
    ]);
    expect(linhasDeObservacao({ observations: "  ", conferenceNotes: null })).toEqual([]);
  });

  it("Conferir: a observação sobe para o topo e o campo vem logo depois das fotos", () => {
    const m = ler("client/src/components/grafica/modais/modal-da-peca.tsx");
    expect(m).toContain(`modalType === "conference" && <ObservacoesDaPeca peca={selectedItem} />`);
    expect(m.indexOf("<PhotoPicker")).toBeLessThan(m.indexOf(`renderNotesField("Ex.: cor puxando`));
    expect(m.indexOf(`renderNotesField("Ex.: cor puxando`)).toBeLessThan(m.indexOf("{fichaDepoisDasFotos && fichaDaPeca}"));
  });

  it("Embalar: o campo vai para o volume, e a próxima embalagem acrescenta; Entregar lê", () => {
    const d = ler("client/src/components/tubos-dialog.tsx");
    expect(d).toContain(`data-testid="campo-obs-embalagem"`);
    expect(d).toContain("{ itens: itensComQuantidade, fotos, obs,");
    expect(d).toContain(`rotulo: "Na embalagem", texto: t.obsEmbalagem`);
    const r = ler("server/routes/tubos.ts");
    expect(r).toContain("await acrescentarObsDaEmbalagem(travado, obsDaEmbalagem, tx);");
    expect(r).toContain("obsEmbalagem: t.obsEmbalagem ?? null");
    expect(r).toContain("observations: p.observations ?? null");
  });

  it("a migração cria as duas colunas, sem mexer no acervo", () => {
    const sql = ler("migrations/0011_reaproveitar-e-obs-embalagem.sql");
    expect(sql).toContain(`ALTER TABLE "items" ADD COLUMN "reuso_pedido" integer`);
    expect(sql).toContain(`ALTER TABLE "tubos" ADD COLUMN "obs_embalagem" text`);
    expect(sql).not.toMatch(/UPDATE|DELETE|DROP/i);
  });
});

describe("Máquinas e Gráfica", () => {
  it("'Tudo' pergunta antes de gravar, e 'Ainda não' limpa o campo", () => {
    const m = ler("client/src/components/grafica/modal-impressao.tsx");
    expect(m).toContain("onClick={() => { void pedirTudo(); }}");
    expect(m).toContain(`if (!ok) { setAgora(""); return; }`);
    expect(m).toContain("await gravarImpressas(total);");
  });

  it("copiar não abre a peça, e a fila e o cartão têm o botão", () => {
    expect(ler("client/src/components/botao-copiar.tsx")).toContain("e.stopPropagation();");
    expect(ler("client/src/components/grafica/fila/linha-da-tabela.tsx")).toContain("copiar-descricao-");
    expect(ler("client/src/components/grafica/fila/cartao-da-peca.tsx")).toContain("copiar-descricao-card-");
  });

  it("as fotos abrem grandes antes de confirmar, no Conferir e no Embalar", () => {
    expect(ler("client/src/components/grafica/modais/seletor-de-fotos.tsx")).toContain("<VisorDeFotos");
    expect(ler("client/src/components/tubos-dialog.tsx")).toContain("<VisorDeFotos");
  });

  it("remover não fica sobre a foto: quem toca para ampliar não apaga", () => {
    for (const arquivo of ["client/src/components/tubos-dialog.tsx", "client/src/components/grafica/modais/seletor-de-fotos.tsx"]) {
      const fonte = ler(arquivo);
      const remover = fonte.slice(fonte.search(/aria-label=(\{`Remover a foto|"Remover foto")/));
      expect(remover.slice(0, 200), arquivo).not.toContain("position: \"absolute\"");
      expect(remover.slice(0, 200), arquivo).toContain("height: 44");
    }
  });
});
