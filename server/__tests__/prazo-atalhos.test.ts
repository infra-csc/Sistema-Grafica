// ─────────────────────────────────────────────────────────────────────────────
// GESTÃO DE PRAZOS — os ATALHOS (client/src/components/prazos/tokens.ts).
//
// PORQUÊ este arquivo existe. O `STAGE_SECTOR` guardava um caminho CRU por
// etapa ("/arte", "/atendimento", "/solicitacao", "/grafica") e a tela colava
// esse caminho num `href`. O efeito: "Resolver em Arte →" numa linha que fala
// de UMA peça entregava a fila inteira da Arte — 1.112 peças — e o diretor
// tinha de reencontrar à mão a peça que a tela acabara de nomear para ele.
//
// Montar URL é regra PURA (string entra, string sai) e é exatamente o tipo de
// coisa que volta a quebrar em silêncio: ninguém percebe um parâmetro perdido
// olhando a tela, porque a tela de destino ABRE — só abre errado. Daí o teste.
//
// Mora em server/__tests__ porque o vitest.config só inclui este diretório
// (environment: node) e nada aqui toca DOM — mesmo arranjo de
// `prazo-gargalos.test.ts` e `prazo-atrasadas.test.ts`.
//
// O QUE ESTÁ PROTEGIDO AQUI:
//  • o CONTRATO do parâmetro: `?item=<uuid>`, o mesmo nome que o Detalhe do
//    Evento e a Gráfica já leem — nunca um terceiro nome;
//  • o grão do link: link de peça leva à peça, link de evento leva ao evento;
//  • nenhum destino ser uma listagem crua quando havia informação para ser
//    específico (todo href tem, no mínimo, um parâmetro de recorte);
//  • a aba da Arte sair de `TAB_STATUSES` — a fonte da própria tela de Arte —
//    e não de uma segunda tabela escrita aqui;
//  • a Gráfica receber `item` SOZINHO (um `busca=` nosso seria sobrescrito
//    pelo efeito dela, e sobrescrito pelo uuid quando o cache estivesse frio).
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import {
  faseDaArte,
  STAGE_SECTOR,
  urlPecaNoEvento,
  urlSetor,
  urlSetorDaPeca,
  urlSetorDoEvento,
  type AlvoPeca,
} from "@/components/prazos/tokens";
import { TAB_STATUSES } from "@/lib/arte-rules";

/** Parseia um href relativo sem depender de DOM. */
const q = (href: string) => new URL(href, "http://x");
const params = (href: string) => Object.fromEntries(q(href).searchParams.entries());

const alvo = (over: Partial<AlvoPeca> = {}): AlvoPeca => ({
  eventId: "ev-1",
  itemId: "it-9",
  displayId: "#3521",
  status: "awaiting_submission",
  ...over,
});

describe("urlPecaNoEvento — o piso de especificidade", () => {
  it("usa o `?item=` que o Detalhe do Evento já consome", () => {
    expect(urlPecaNoEvento("ev-1", "it-9")).toBe("/eventos/ev-1?item=it-9");
  });

  it("escapa o id: um uuid estranho não pode virar outro parâmetro", () => {
    expect(urlPecaNoEvento("ev-1", "a&b=c")).toBe("/eventos/ev-1?item=a%26b%3Dc");
    expect(params(urlPecaNoEvento("ev-1", "a&b=c")).item).toBe("a&b=c");
  });
});

describe("faseDaArte — a aba sai de TAB_STATUSES, não de uma cópia", () => {
  it("cada status de cada aba volta na SUA aba", () => {
    for (const [aba, statuses] of Object.entries(TAB_STATUSES)) {
      for (const s of statuses) {
        // `finalizados` é o balaio largo e contém status que também aparecem
        // nas listas anteriores; a regra é "a primeira aba que reclama vence".
        const esperado = Object.entries(TAB_STATUSES).find(([, l]) => l.includes(s))![0];
        expect(faseDaArte(s), `${aba}/${s}`).toBe(esperado);
      }
    }
  });

  it("status fora do fluxo da Arte não inventa aba", () => {
    expect(faseDaArte("draft")).toBeNull();
    expect(faseDaArte("status-que-nao-existe")).toBeNull();
  });
});

describe("urlSetorDaPeca — link de PEÇA leva à peça", () => {
  it("Arte: aba certa, código na busca e o evento junto", () => {
    const u = urlSetorDaPeca("layouts", alvo());
    expect(q(u).pathname).toBe("/arte");
    expect(params(u)).toEqual({
      item: "it-9",
      fase: "criar-aprovacoes",
      busca: "#3521",
      evento: "ev-1",
    });
  });

  it("Arte na FINALIZAÇÃO abre a aba de finalizar, não a de criar", () => {
    const u = urlSetorDaPeca("finalizacao", alvo({ status: "sponsor_approved" }));
    expect(params(u).fase).toBe("finalizar-layouts");
  });

  it("Arte com status sem aba conhecida vai sem `fase` — nunca com uma errada", () => {
    const u = urlSetorDaPeca("layouts", alvo({ status: "draft" }));
    expect(params(u).fase).toBeUndefined();
    expect(params(u).busca).toBe("#3521");
  });

  it("Gráfica recebe `item` SOZINHO (o efeito dela resolve o resto)", () => {
    const u = urlSetorDaPeca("producao", alvo({ status: "ready_for_production" }));
    expect(q(u).pathname).toBe("/grafica");
    expect(params(u)).toEqual({ item: "it-9" });
  });

  it("Revisão leva o código na busca além do `item`", () => {
    expect(params(urlSetorDaPeca("revisao", alvo({ status: "in_review" })))).toEqual({
      item: "it-9", busca: "#3521",
    });
  });

  it("Atendimento liga o recorte de atrasados só quando a peça está atrasada", () => {
    expect(params(urlSetorDaPeca("aprovacao", alvo({ atrasada: true })))).toEqual({
      item: "it-9", atrasados: "1",
    });
    expect(params(urlSetorDaPeca("aprovacao", alvo({ atrasada: false })))).toEqual({
      item: "it-9",
    });
  });

  it("etapa sem tela de setor abre a FICHA no evento, não uma listagem", () => {
    expect(urlSetorDaPeca("listaImagens", alvo())).toBe("/eventos/ev-1?item=it-9");
    expect(urlSetorDaPeca("etapa-que-nao-existe", alvo())).toBe("/eventos/ev-1?item=it-9");
  });

  it("NENHUM link de peça é um caminho pelado", () => {
    for (const key of Object.keys(STAGE_SECTOR)) {
      const u = urlSetorDaPeca(key, alvo());
      expect(q(u).search, key).not.toBe("");
      expect(params(u).item, key).toBe("it-9");
    }
  });
});

describe("urlSetorDoEvento — link de EVENTO + ETAPA leva ao recorte do evento", () => {
  it("Arte: aba da etapa e o evento, sem fingir que sabe a peça", () => {
    expect(params(urlSetorDoEvento("layouts", "ev-1"))).toEqual({
      fase: "criar-aprovacoes", evento: "ev-1",
    });
    expect(params(urlSetorDoEvento("finalizacao", "ev-1"))).toEqual({
      fase: "finalizar-layouts", evento: "ev-1",
    });
  });

  it("Gráfica recorta por evento", () => {
    expect(params(urlSetorDoEvento("producao", "ev-1"))).toEqual({ evento: "ev-1" });
  });

  it("Atendimento não lê evento — o recorte possível é o de atrasados", () => {
    expect(params(urlSetorDoEvento("aprovacao", "ev-1", { atrasada: true })))
      .toEqual({ atrasados: "1" });
  });

  it("etapa sem tela de setor cai no evento", () => {
    expect(urlSetorDoEvento("listaImagens", "ev-1")).toBe("/eventos/ev-1");
  });

  it("Revisão ainda não tem recorte próprio e por isso vai sem query", () => {
    // Documenta o buraco em vez de escondê-lo: enquanto `solicitacao.tsx` não
    // ler nada da URL, este é o único href honesto — e este teste é o que vai
    // falhar (de propósito) no dia em que a Revisão ganhar `?evento=`.
    expect(urlSetorDoEvento("revisao", "ev-1")).toBe("/solicitacao");
  });
});

describe("urlSetor — a fila do setor, e ainda assim com a fase", () => {
  it("Arte abre já na fase da etapa", () => {
    expect(urlSetor("layouts")).toBe("/arte?fase=criar-aprovacoes");
    expect(urlSetor("finalizacao")).toBe("/arte?fase=finalizar-layouts");
  });

  it("setor sem fase declarada vai sem query", () => {
    expect(urlSetor("aprovacao")).toBe("/atendimento");
    expect(urlSetor("producao")).toBe("/grafica");
    expect(urlSetor("revisao")).toBe("/solicitacao");
  });

  it("etapa sem tela própria devolve null — quem chama decide o texto", () => {
    expect(urlSetor("listaImagens")).toBeNull();
    expect(urlSetor("etapa-que-nao-existe")).toBeNull();
  });
});

describe("o contrato, escrito uma vez só", () => {
  it("todo destino de peça usa `item` — nunca `peca` nem um terceiro nome", () => {
    for (const key of Object.keys(STAGE_SECTOR)) {
      const busca = q(urlSetorDaPeca(key, alvo())).searchParams;
      expect(busca.get("item"), key).toBe("it-9");
      expect(busca.get("peca"), key).toBeNull();
    }
  });

  it("as fases declaradas em STAGE_SECTOR existem de verdade na Arte", () => {
    for (const [key, alvoSetor] of Object.entries(STAGE_SECTOR)) {
      if (!alvoSetor.fase) continue;
      expect(Object.keys(TAB_STATUSES), key).toContain(alvoSetor.fase);
    }
  });
});
