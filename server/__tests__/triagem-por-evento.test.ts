// ─────────────────────────────────────────────────────────────────────────────
// TRIAGEM POR EVENTO + QUADRO DE ARRASTAR (dono, 14/09).
//
// "Uma tela antes aparecendo os eventos disponíveis, quanto tempo está lá;
// depois que clicar no evento ele começa a fazer a triagem: aparecer as peças
// e ele arrastando para o destino."
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { agruparPorEvento, tempoDeEspera } from "../../client/src/components/triagem/eventos-da-triagem";
import { corpoDaTriagem } from "../../client/src/components/triagem/quadro-da-triagem";

const ler = (rel: string) => readFileSync(path.resolve(__dirname, "../..", rel), "utf8");
const PAGINA = ler("client/src/pages/triagem-retorno.tsx");
const QUADRO = ler("client/src/components/triagem/quadro-da-triagem.tsx");
const EVENTOS = ler("client/src/components/triagem/eventos-da-triagem.tsx");

const ativo = (id: string, eventId: string | null, voltou: string, extra: any = {}) => ({
  id, eventId, eventName: eventId ? `Evento ${eventId}` : null, eventDate: null, sponsors: [], quantity: 1,
  approvalThumbUrl: null, updatedAt: voltou, displayId: `#EST-${id}`, name: id, ...extra,
}) as any;

describe("a lista de eventos", () => {
  it("agrupa por evento, conta peças/unidades e guarda desde quando espera", () => {
    const eventos = agruparPorEvento([
      ativo("a", "e1", "2026-09-10T12:00:00Z"),
      ativo("b", "e1", "2026-09-08T12:00:00Z", { quantity: 3 }),
      ativo("c", "e2", "2026-09-12T12:00:00Z"),
    ], new Map());
    const e1 = eventos.find((e) => e.id === "e1")!;
    expect(e1.pecas).toBe(2);
    expect(e1.unidades).toBe(4);
    expect(new Date(e1.desde).toISOString()).toBe("2026-09-08T12:00:00.000Z");
  });

  it("evento com peça reservada vem primeiro; depois o que espera há mais tempo", () => {
    const reservas = new Map([["c", { assetId: "c", eventName: "Outro", saida: "2026-09-20T08:00:00Z", itemDisplayId: "#1" }]]);
    const eventos = agruparPorEvento([
      ativo("a", "velho", "2026-08-01T12:00:00Z"),
      ativo("b", "novo", "2026-09-12T12:00:00Z"),
      ativo("c", "reservado", "2026-09-13T12:00:00Z"),
    ], reservas);
    expect(eventos.map((e) => e.id)).toEqual(["reservado", "velho", "novo"]);
  });

  it("diz há quanto tempo o material voltou, com cor de atenção", () => {
    const agora = Date.parse("2026-09-14T12:00:00Z");
    expect(tempoDeEspera(agora, agora).texto).toBe("voltou hoje");
    expect(tempoDeEspera(agora - 86_400_000 * 9, agora)).toMatchObject({ texto: "voltou há 9 dias", cor: "#b45309" });
    expect(tempoDeEspera(agora - 86_400_000 * 20, agora).cor).toBe("#b91c1c");
  });

  it("a página abre na lista de eventos e o clique abre o quadro", () => {
    // Abre nos eventos; só a URL (F5 / link da pilha) leva direto ao quadro ou à tabela (21/09).
    expect(PAGINA).toContain('return v === "tabela" ? "tabela" : v === "quadro" && urlInicial.get("evento") ? "quadro" : "eventos";');
    expect(PAGINA).toContain('onAbrir={(id) => { setEventoDoQuadro(id); setVista("quadro"); }}');
    expect(EVENTOS).toContain("data-testid={`evento-triagem-${e.id}`}");
  });
});

describe("o quadro de arrastar", () => {
  it("cada destino grava o que a triagem manda", () => {
    // Sem local (dono, 21/09: o sistema não guarda onde a peça fica no galpão).
    expect(corpoDaTriagem("galpao", "AVARIA_LEVE")).toEqual({ condition: "AVARIA_LEVE", trackingStatus: "NO_GALPAO" });
    expect(corpoDaTriagem("manutencao", "PERFEITO")).toEqual({ condition: "AVARIA_LEVE", trackingStatus: "EM_MANUTENCAO" });
    expect(corpoDaTriagem("descartar", "PERFEITO")).toEqual({ condition: "SUCATA", trackingStatus: "DESCARTADO" });
  });

  it("arrasta (uma ou as selecionadas juntas) e solta na coluna", () => {
    expect(QUADRO).toContain("draggable={podeArrastar}");
    // A seleção é lida por ref para os handlers ficarem estáveis (memo do cartão, 21/09).
    // Desde 21/09 o que se arrasta é a FATIA de um material numa coluna (itens por quantidade juntos).
    expect(QUADRO).toContain("const fatiasDoGesto = (f: string) => (refSelecionadas.current.has(f) ? Array.from(refSelecionadas.current) : [f]);");
    expect(QUADRO).toContain("if (fatias?.length) mover(fatias, destino);");
    expect(QUADRO).toContain("data-testid={`coluna-triagem-${destino}`}");
  });

  it("no celular não há arrastar: seleciona e escolhe o destino na barra", () => {
    expect(QUADRO).toContain("podeArrastar={!isMobile}");
    expect(QUADRO).toContain("data-testid={`mover-para-${d}`}");
  });

  it("nada grava antes de salvar; o que grava sai do plano por quantidade, em grupos", () => {
    expect(QUADRO).toContain("emGrupos(passos, GRAVACOES_POR_VEZ, (p) => apiRequest(p.metodo, p.url, p.corpo), setGravadas)");
    expect(QUADRO).not.toContain("faltaLocal");
    expect(QUADRO).not.toContain("mapa-galpao");
  });

  it("dividir por quantidade é no quadro; a tabela é registro por registro, e dela se volta aos eventos", () => {
    expect(QUADRO).toContain('data-testid={`dividir-${id}`}');
    expect(QUADRO).toContain("Tabela (registro por registro)");
    expect(PAGINA).toContain('data-testid="button-voltar-eventos-triagem"');
  });
});
