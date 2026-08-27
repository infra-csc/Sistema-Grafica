// ─────────────────────────────────────────────────────────────────────────────
// CALENDÁRIO POR FUNÇÃO (dono, 27/08: "calendário aparecer o que cada função
// precisa ver") + PRIORIDADE NA ENTRADA RÁPIDA (dono, 27/08: "não achei para
// dar prioridade ao item").
//
// Calendário: seis marcos para todo mundo enchiam cada célula de "+8 mais".
// A régua do recorte é QUEM AGE no marco; admin vê tudo; o botão "Todos os
// marcos" é a saída — o recorte é padrão, nunca prisão.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const ler = (rel: string) => readFileSync(path.resolve(__dirname, "../..", rel), "utf8");
const CAL = ler("client/src/pages/calendario.tsx");
const GRADE = ler("client/src/components/bulk-item-entry.tsx");
const ITEMS = ler("server/routes/items.ts");
const EVENT_DETAIL = ler("client/src/pages/event-detail.tsx");

describe("calendário: cada função vê o que precisa", () => {
  it("o mapa segue a régua de QUEM AGE — e cobre os quatro papéis operacionais", () => {
    expect(CAL).toContain('solicitacao: ["deadlineListaImagens", "deadlineRevisaoLista"],');
    expect(CAL).toContain('arte: ["deadlineEntregaLayouts", "deadlineFinalizacao"],');
    expect(CAL).toContain('atendimento: ["deadlineAprovacaoLayout"],');
    expect(CAL).toContain('grafica: ["deadlineProducaoGrafica"],');
  });

  it("admin (e papel fora do mapa) vê tudo; os demais têm a saída 'Todos os marcos'", () => {
    expect(CAL).toContain('const marcosDoPapel = MARCOS_POR_PAPEL[user?.role ?? ""] ?? null;');
    expect(CAL).toContain("(!marcosDoPapel || verTodosOsMarcos)");
    expect(CAL).toContain('data-testid="button-marcos-da-funcao"');
    // o botão só existe quando há recorte — para admin não há o que alternar
    expect(CAL).toContain("{marcosDoPapel && (");
  });

  it("o recorte vale nos TRÊS pontos que desenham marcos: grade, mês e legenda", () => {
    // grade (byDay) e pertencimento ao mês
    expect(CAL).toContain("for (const dt of tiposVisiveis) {");
    expect(CAL).toContain("return tiposVisiveis.some(dt => {");
    // legenda mostra só o que a grade desenha
    expect(CAL).toContain("{tiposVisiveis.map(dt => (");
    // e os memos reagem à troca (sem isso o toggle não redesenharia)
    expect(CAL).toContain("}, [events, tiposVisiveis]);");
    expect(CAL).toContain("}, [events, year, month, tiposVisiveis]);");
  });
});

describe("entrada rápida: a prioridade tem onde morar", () => {
  it("a linha carrega isPriority, do estado vazio ao payload", () => {
    expect(GRADE).toContain("isPriority: boolean;");
    expect(GRADE).toContain('isReuse: false, isPriority: false, standardItemId: "",');
    expect(GRADE).toContain("isPriority: r.isPriority || false,");
  });

  it("o botão por linha segue o idioma do toggle de reaproveitamento — e só para quem pode", () => {
    expect(GRADE).toContain("{podePriorizar && (");
    expect(GRADE).toContain("data-testid={`button-priority-${ri}`}");
    expect(EVENT_DETAIL).toContain("podePriorizar={user?.role === 'admin' || user?.role === 'solicitacao'}");
  });

  it("o LOTE tem o mesmo gate do POST unitário — e a notificação NOMEIA as prioritárias", () => {
    const lote = ITEMS.slice(ITEMS.indexOf('app.post("/api/items/bulk"'), ITEMS.indexOf('app.patch("/api/items/:id"'));
    expect(lote).toContain('if (validatedItems.some((i) => i.isPriority) && !["admin", "solicitacao"].includes(req.userRole ?? "")) {');
    expect(lote).toContain('type: prioritarias.length > 0 ? "itemPriority" : "itemAdded",');
    expect(lote).toContain("PRIORITÁRIAS (furam a fila)");
    expect(lote).toContain('+ (item.isPriority ? " — PRIORITÁRIA" : "")');
  });
});
