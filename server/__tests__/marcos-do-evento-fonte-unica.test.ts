// ─────────────────────────────────────────────────────────────────────────────
// OS SEIS MARCOS DO EVENTO NASCEM NUM LUGAR SÓ.
//
// O defeito, medido antes de corrigir:
//
//   server/routes/events.ts (MARCO_DEFS) ..... 6 marcos
//   client/pages/eventos.tsx (MARCO_FIELDS) .. 6 marcos
//   client/pages/calendario.tsx (DEADLINE_TYPES) .. 5 — faltava FINALIZAÇÃO
//
// Não era escolha de desenho. O servidor COBRA a finalização: ela tem coluna
// própria em `events` (`deadline_finalizacao`, default −10), aparece em
// MARCO_DEFS com os status que contam como pendentes, e é uma das seis chaves
// que `nextMilestone` pode devolver. O Calendário simplesmente não a
// desenhava — um evento cuja finalização vencia hoje não aparecia na grade nem
// no dialog do dia. O prazo era cobrado num lugar e invisível justamente
// naquele onde as pessoas vão para planejar.
//
// Três cópias com duas certas não é coincidência: é o prazo de uma delas não
// ter sido atualizado, e ninguém ter como perceber — nada quebra quando uma
// lista fica para trás. Por isso o teste não confere "o Calendário tem seis";
// confere que as três leem a MESMA lista.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { MARCOS_DO_EVENTO, OFFSET_PADRAO_DO_MARCO } from "@shared/prazo-dates";

const ler = (rel: string) => readFileSync(path.resolve(process.cwd(), rel), "utf8");

describe("a lista canônica", () => {
  it("tem os seis marcos, na ordem da cadeia causal", () => {
    expect(MARCOS_DO_EVENTO.map(m => m.key)).toEqual([
      "listaImagens", "layouts", "aprovacao", "finalizacao", "revisao", "producao",
    ]);
  });

  it("e a ordem é a dos offsets — do mais distante ao mais perto do caminhão", () => {
    // A âncora é sempre a SAÍDA DO CAMINHÃO, e os offsets são negativos: −25 é
    // vinte e cinco dias ANTES de o caminhão sair. Se a lista deixar de estar
    // ordenada, a cadeia causal na tela passa a mentir sobre o que vem antes.
    const offsets = MARCOS_DO_EVENTO.map(m => m.offset);
    expect(offsets).toEqual([...offsets].sort((a, b) => a - b));
    expect(offsets).toEqual([-25, -20, -12, -10, -8, -1]);
  });

  it("a FINALIZAÇÃO está lá — era ela que faltava no Calendário", () => {
    const f = MARCOS_DO_EVENTO.find(m => m.key === "finalizacao");
    expect(f).toBeDefined();
    expect(f!.campo).toBe("deadlineFinalizacao");
    expect(f!.offset).toBe(-10);
  });

  it("cada marco tem coluna, rótulo, cor e descrição", () => {
    for (const m of MARCOS_DO_EVENTO) {
      expect(m.campo, `${m.key} sem coluna`).toMatch(/^deadline/);
      expect(m.label.length, `${m.key} sem rótulo`).toBeGreaterThan(0);
      expect(m.curto.length, `${m.key} sem rótulo curto`).toBeGreaterThan(0);
      expect(m.cor, `${m.key} sem cor`).toMatch(/^#[0-9a-f]{6}$/i);
      expect(m.descricao.length, `${m.key} sem descrição`).toBeGreaterThan(0);
    }
  });

  it("só a produção gráfica ignora o fim de semana", () => {
    // Ela roda sábado e domingo quando precisa; as outras cinco são etapas de
    // escritório e pulam o fim de semana.
    expect(MARCOS_DO_EVENTO.filter(m => m.todosOsDias).map(m => m.key)).toEqual(["producao"]);
  });

  it("o mapa de offsets deriva da lista, não é digitado ao lado dela", () => {
    expect(Object.keys(OFFSET_PADRAO_DO_MARCO).sort())
      .toEqual(MARCOS_DO_EVENTO.map(m => m.campo).sort());
  });
});

describe("as três telas leem a mesma lista", () => {
  it("o Calendário não escreve mais a lista à mão", () => {
    const cal = ler("client/src/pages/calendario.tsx");
    expect(cal).toContain("MARCOS_DO_EVENTO.map(m => ({");
    expect(cal).toContain("OFFSET_PADRAO_DO_MARCO");
    // A lista datilografada saiu — era ela que estava com cinco.
    expect(cal).not.toContain('{ key: "deadlineListaImagens",    label: "Lista de Imagens"');
  });

  it("e o formulário de evento também não", () => {
    const ev = ler("client/src/pages/eventos.tsx");
    expect(ev).toContain("}[] = MARCOS_DO_EVENTO.map((m) => ({");
    expect(ev).toContain("const DEFAULT_DEADLINES = OFFSET_PADRAO_DO_MARCO");
    expect(ev).not.toContain("{ field: 'deadlineListaImagens',   key: 'listaImagens'");
  });

  it("nem a timeline do Detalhe do Evento — a QUARTA cópia, também com cinco", () => {
    // Descoberta ao aplicar o handoff "Detalhe do Evento nota 10": a lista
    // "não mexer" falava em seis marcos, e a timeline tinha cinco escritos à
    // mão — a Finalização (−10) faltava aqui também. Três cópias corrigidas e
    // a quarta esquecida é exatamente o que este arquivo existe para impedir.
    const ed = ler("client/src/pages/event-detail.tsx");
    expect(ed).toContain("const marcos = MARCOS_DO_EVENTO.map((m) => {");
    expect(ed).toContain("const days: number = (event as any)[m.campo] ?? m.offset;");
    expect(ed).not.toContain("{ label: 'Lista de Imagens',    days: event.deadlineListaImagens    ?? -25, allDays: false },");
  });

  it("o servidor continua cobrando os seis — é o que torna o resto obrigatório", () => {
    const srv = ler("server/routes/events.ts");
    for (const m of MARCOS_DO_EVENTO) {
      expect(srv, `o servidor não conhece o marco ${m.key}`).toContain(`key: "${m.key}"`);
      expect(srv, `o servidor não conhece a coluna ${m.campo}`).toContain(m.campo);
    }
  });

  it("e a coluna da finalização existe no banco", () => {
    // Sem ela o offset −10 seria um número sem onde morar.
    expect(ler("shared/schema.ts")).toContain('deadlineFinalizacao: integer("deadline_finalizacao")');
  });
});
