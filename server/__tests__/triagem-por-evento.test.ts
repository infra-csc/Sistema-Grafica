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
    expect(PAGINA).toContain('useState<"eventos" | "quadro" | "tabela">("eventos")');
    expect(PAGINA).toContain('onAbrir={(id) => { setEventoDoQuadro(id); setVista("quadro"); }}');
    expect(EVENTOS).toContain("data-testid={`evento-triagem-${e.id}`}");
  });
});

describe("o quadro de arrastar", () => {
  it("cada destino grava o que a triagem manda", () => {
    const local = { galpao: " Setor A - Corredor 3 ", manutencao: "" };
    expect(corpoDaTriagem("galpao", "AVARIA_LEVE", local)).toEqual({ condition: "AVARIA_LEVE", trackingStatus: "NO_GALPAO", location: "Setor A - Corredor 3" });
    expect(corpoDaTriagem("manutencao", "PERFEITO", local)).toEqual({ condition: "AVARIA_LEVE", trackingStatus: "EM_MANUTENCAO", location: null });
    expect(corpoDaTriagem("descartar", "PERFEITO", local)).toEqual({ condition: "SUCATA", trackingStatus: "DESCARTADO" });
  });

  it("arrasta (uma ou as selecionadas juntas) e solta na coluna", () => {
    expect(QUADRO).toContain("draggable={podeArrastar}");
    expect(QUADRO).toContain("const ids = selecionadas.has(a.id) ? Array.from(selecionadas) : [a.id];");
    expect(QUADRO).toContain("if (ids?.length) mover(ids, destino);");
    expect(QUADRO).toContain("data-testid={`coluna-triagem-${destino}`}");
  });

  it("no celular não há arrastar: seleciona e escolhe o destino na barra", () => {
    expect(QUADRO).toContain("podeArrastar={!isMobile}");
    expect(QUADRO).toContain("data-testid={`mover-para-${d}`}");
  });

  it("nada grava antes de salvar, e o Galpão exige local", () => {
    expect(QUADRO).toContain('apiRequest("PATCH", `/api/inventory/${ativo.id}/triage`');
    expect(QUADRO).toContain("const faltaLocal = naColuna(\"galpao\").length > 0 && !local.galpao.trim();");
    expect(QUADRO).toContain('data-testid="aviso-local-galpao"');
  });

  it("dividir por quantidade continua na tabela, e da tabela se volta aos eventos", () => {
    expect(QUADRO).toContain("Tabela (dividir por quantidade)");
    expect(PAGINA).toContain('data-testid="button-voltar-eventos-triagem"');
  });
});
