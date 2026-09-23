// ─────────────────────────────────────────────────────────────────────────────
// PRIORIDADE DA PEÇA (pedido do dono, 27/08): "na criação ou depois na edição
// poder colocar aquele item como prioritário e avisar a arte".
//
// Não confundir com a prioridade DO EVENTO (events.priority, régua automática
// da saída do caminhão): esta é da PEÇA, manual, e o efeito é um só — furar a
// fila da Arte, com aviso na hora.
//
// As três decisões que este arquivo fixa:
//   · quem marca é quem gerencia a lista (admin|solicitacao) — e o gate do
//     PATCH dispara só na MUDANÇA de valor, porque o formulário manda o form
//     inteiro no spread e arte/atendimento editando thumb não podem quebrar
//     por um campo que não tocaram;
//   · o aviso à Arte sai UMA vez, na transição para true — desmarcar não
//     alarma, editar outra coisa de peça já prioritária não repete;
//   · na fila da Arte a peça prioritária vem ANTES de qualquer régua,
//     inclusive da ordenação por prazo.
//
// A coluna, os gates, o aviso e a trilha rodam de verdade em
// regras-fluxo-prioridade.test.ts; aqui ficam as telas.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const ler = (rel: string) => readFileSync(path.resolve(__dirname, "../..", rel), "utf8");
const ARTE = ler("client/src/pages/arte.tsx");
const EVENT_DETAIL = ler("client/src/pages/event-detail.tsx");

describe("quem marca", () => {
  it("no formulário, o checkbox existe nos DOIS modos e só para quem pode", () => {
    expect(EVENT_DETAIL).toContain("isPriority: false,");
    expect(EVENT_DETAIL).toContain("{podePriorizar && (");
    expect(EVENT_DETAIL).toContain('data-testid="checkbox-item-priority"');
    // a prop é passada nas TRÊS montagens: ItemForm criar, ItemForm editar e
    // a Entrada Rápida (BulkItemEntry — "não achei para dar prioridade", 27/08)
    const passagens = EVENT_DETAIL.split("podePriorizar={user?.role === 'admin' || user?.role === 'solicitacao'}").length - 1;
    expect(passagens).toBe(3);
    // e a edição hidrata o valor atual — sem isso, salvar desmarcava sozinho
    expect(EVENT_DETAIL).toContain("isPriority: item.isPriority || false,");
  });
});

describe("a fila da Arte", () => {
  it("prioritária vem antes de QUALQUER régua — inclusive do prazo", () => {
    const sort = ARTE.slice(ARTE.indexOf("return [...list].sort((a, b) => {"));
    const prio = sort.indexOf("Number(!!b.isPriority) - Number(!!a.isPriority)");
    const prazo = sort.indexOf('if (sortMode === "prazo")');
    expect(prio).toBeGreaterThan(-1);
    expect(prio).toBeLessThan(prazo);
  });

  it("a peça carrega o selo PRIORITÁRIA (linha desktop e card mobile)", () => {
    // Desde 22/09 (menos é mais) o selo mora em renderSelosDaPeca, a lista
    // ordenada por gravidade usada pela linha E pelo card.
    expect(ARTE).toContain("item.isPriority && {");
    expect(ARTE).toContain("tag-prioritaria-${item.id}");
    const selos = ARTE.slice(ARTE.indexOf("const renderSelosDaPeca"), ARTE.indexOf("const renderRow"));
    expect(selos).toContain("PRIORITÁRIA");
    expect((ARTE.match(/renderSelosDaPeca\(item, tabId\)/g) ?? []).length).toBe(2);
  });

  it("na lista do evento (quem marcou), o selo também aparece", () => {
    expect(EVENT_DETAIL).toContain("tag-prioritaria-${item.id}");
    expect(EVENT_DETAIL).toContain("tag-prioritaria-card-${item.id}");
  });
});

describe("e na Gráfica também (dono, 27/08)", () => {
  const GRAFICA = ler("client/src/pages/grafica.tsx");

  it("selo PRIORITÁRIA na tabela e no card mobile", () => {
    expect(GRAFICA).toContain("selo-prioritaria-${item.id}");
    expect(GRAFICA).toContain("chip-prioritaria-${item.id}");
  });

  it("sobe DENTRO do bloco do evento — o macro segue sendo o caminhão", () => {
    const sort = GRAFICA.slice(GRAFICA.indexOf("const filteredItems = useMemo"));
    const evento = sort.indexOf("if (ea !== eb) return ea.localeCompare(eb);");
    const prio = sort.indexOf("Number(!!b.isPriority) - Number(!!a.isPriority)");
    const tipo = sort.indexOf("if (a.type !== b.type)");
    expect(evento).toBeGreaterThan(-1);
    // depois do evento (não desmonta os blocos por data de saída), antes do tipo
    expect(prio).toBeGreaterThan(evento);
    expect(prio).toBeLessThan(tipo);
  });
});
