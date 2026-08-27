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
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const ler = (rel: string) => readFileSync(path.resolve(__dirname, "../..", rel), "utf8");
const SCHEMA = ler("shared/schema.ts");
const ITEMS = ler("server/routes/items.ts");
const ARTE = ler("client/src/pages/arte.tsx");
const EVENT_DETAIL = ler("client/src/pages/event-detail.tsx");

describe("a coluna e o contrato", () => {
  it("isPriority vive na peça, com default false — e no allow-list do PATCH", () => {
    expect(SCHEMA).toContain('isPriority: boolean("is_priority").notNull().default(false),');
    const pick = ITEMS.slice(ITEMS.indexOf("const updateItemSchema"), ITEMS.indexOf(".partial()"));
    expect(pick).toContain("isPriority: true,");
  });
});

describe("quem marca", () => {
  it("no PATCH, o gate é admin|solicitacao e dispara só na MUDANÇA de valor", () => {
    expect(ITEMS).toContain("!!validatedData.isPriority !== !!currentItem.isPriority");
    const i = ITEMS.indexOf("!!validatedData.isPriority !== !!currentItem.isPriority");
    expect(ITEMS.slice(i, i + 300)).toContain('["admin", "solicitacao"].includes(role)');
    expect(ITEMS).toContain("Marcar peça como prioritária é do admin e da Solicitação.");
  });

  it("na criação, o mesmo gate — criador de evento sem papel cria a peça normal", () => {
    const criacao = ITEMS.slice(ITEMS.indexOf('app.post("/api/items"'), ITEMS.indexOf('app.post("/api/items/bulk"'));
    expect(criacao).toContain('if (validatedData.isPriority && !["admin", "solicitacao"].includes(req.userRole ?? "")) {');
  });

  it("no formulário, o checkbox existe nos DOIS modos e só para quem pode", () => {
    expect(EVENT_DETAIL).toContain("isPriority: false,");
    expect(EVENT_DETAIL).toContain("{podePriorizar && (");
    expect(EVENT_DETAIL).toContain('data-testid="checkbox-item-priority"');
    // a prop é passada nas DUAS montagens do ItemForm (criar e editar)
    const passagens = EVENT_DETAIL.split("podePriorizar={user?.role === 'admin' || user?.role === 'solicitacao'}").length - 1;
    expect(passagens).toBe(2);
    // e a edição hidrata o valor atual — sem isso, salvar desmarcava sozinho
    expect(EVENT_DETAIL).toContain("isPriority: item.isPriority || false,");
  });
});

describe("o aviso à Arte", () => {
  it("sai na transição para true — e só nela", () => {
    expect(ITEMS).toContain("if ('isPriority' in validatedData && item.isPriority && !currentItem.isPriority) {");
    const i = ITEMS.indexOf("if ('isPriority' in validatedData && item.isPriority && !currentItem.isPriority) {");
    const bloco = ITEMS.slice(i, i + 700);
    expect(bloco).toContain('type: "itemPriority",');
    expect(bloco).toContain('targetRoles: ["arte"],');
    expect(bloco).toContain("fura a fila da Arte");
  });

  it("peça que já NASCE prioritária avisa na criação — a notificação de itemAdded vira itemPriority", () => {
    const criacao = ITEMS.slice(ITEMS.indexOf('app.post("/api/items"'), ITEMS.indexOf('app.post("/api/items/bulk"'));
    expect(criacao).toContain('type: item.isPriority ? "itemPriority" : "itemAdded",');
    expect(criacao).toContain("PEÇA PRIORITÁRIA:");
  });

  it("a trilha registra marcar E desmarcar", () => {
    expect(ITEMS).toContain('changedParts.push(item.isPriority ? "Peça marcada como PRIORITÁRIA — fura a fila da Arte" : "Prioridade da peça removida");');
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

  it("a peça carrega o selo PRIORITÁRIA nas tags (linha desktop e card mobile)", () => {
    expect(ARTE).toContain("{item.isPriority && (");
    expect(ARTE).toContain("tag-prioritaria-${item.id}");
    // dentro de renderTagsDaPeca — o render usado pelos dois formatos
    const tags = ARTE.slice(ARTE.indexOf("const renderTagsDaPeca"), ARTE.indexOf("const renderRow"));
    expect(tags).toContain("PRIORITÁRIA");
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
