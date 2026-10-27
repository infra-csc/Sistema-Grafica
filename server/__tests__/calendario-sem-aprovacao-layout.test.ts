// ─────────────────────────────────────────────────────────────────────────────
// CALENDÁRIO — o Layout das peças sem aprovação (Pedro/dono, 26/10).
//
// O dono pediu que o Calendário siga a MESMA régua da Gestão de Prazos: a peça
// "Sem patrocínio" / "Arte do cliente" ainda em Layout vence no prazo de Layout
// AJUSTADO (Layout do evento + dias da Aprovação). O Calendário não refaz a
// conta: lê o payload de /api/prazos. Aqui:
//   · a derivação (components/calendario/layout-sem-aprovacao.ts), com eventos
//     montados pelo domínio de verdade;
//   · no código-fonte, que a grade desenha a marcação a mais e não cobra o
//     Layout normal quando só restam peças sem aprovação.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { diaLocal, diaMes, layoutSemAprovacaoPorEvento } from "@/components/calendario/layout-sem-aprovacao";
import { buildEventPrazo, type DomainEvent, type DomainItem } from "../services/prazo-domain";
import type { PrazoEvent } from "@shared/prazos-contract";

const dia = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};

// Saída num domingo (2026-08-30): Entrega de Layouts −20 → 10/08; ajustado → 17/08.
const evento = (over: Partial<DomainEvent> = {}): DomainEvent => ({
  id: "ev-1", name: "COPA", status: "created", priority: null,
  startDate: "2026-09-05T00:00:00.000Z", truckDepartureDate: "2026-08-30T00:00:00.000Z", createdBy: null,
  ...over,
});
let seq = 0;
const peca = (over: Partial<DomainItem> = {}): DomainItem => {
  seq += 1;
  return { id: `it-${seq}`, displayId: `#${seq}`, status: "awaiting_submission", type: "2x1", description: null, quantity: 1, ...over };
};
const montar = (ev: DomainEvent, itens: DomainItem[], hoje = "2026-08-05", dias?: number): PrazoEvent =>
  buildEventPrazo(ev, itens, { today: dia(hoje), diasDaAprovacao: dias }) as PrazoEvent;

describe("layoutSemAprovacaoPorEvento", () => {
  it("peças sem aprovação em Layout → marcação no dia AJUSTADO, com a contagem", () => {
    const ev = montar(evento(), [
      peca({ skipApproval: true }),
      peca({ arteDoCliente: true, status: "draft" }), // em Lista de Imagens: o Layout do documento é um só
      peca({}), // comum
    ]);
    const m = layoutSemAprovacaoPorEvento([ev]).get("ev-1");
    expect(m).toEqual({ normal: "2026-08-10", ajustados: [{ dia: "2026-08-17", pecas: 2 }], soSemAprovacao: false });
  });

  it("só peças sem aprovação no gate do Layout → o marco normal não cobra ninguém", () => {
    const ev = montar(evento(), [peca({ skipApproval: true })]);
    expect(layoutSemAprovacaoPorEvento([ev]).get("ev-1")?.soSemAprovacao).toBe(true);
  });

  it("evento sem peça com marca não entra; peça que já saiu do Layout também não", () => {
    const semMarca = montar(evento({ id: "a" }), [peca({})]);
    const jaAprovada = montar(evento({ id: "b" }), [peca({ skipApproval: true, status: "awaiting_finalization" })]);
    const mapa = layoutSemAprovacaoPorEvento([semMarca, jaAprovada]);
    expect(mapa.has("a")).toBe(false);
    expect(mapa.has("b")).toBe(false);
  });

  it("Kit com marca (26/10: o Kit é cobrado da Entrega de Layouts) também ganha o Layout ajustado", () => {
    const kit = montar(evento(), [peca({ skipApproval: true, kitRemessaId: "r1" })]);
    expect(layoutSemAprovacaoPorEvento([kit]).has("ev-1")).toBe(true);
  });

  it("a configuração muda o dia (N = 5 a partir de segunda 10/08 → sábado 15 → sexta 14/08)", () => {
    const ev = montar(evento(), [peca({ skipApproval: true })], "2026-08-05", 5);
    expect(layoutSemAprovacaoPorEvento([ev]).get("ev-1")?.ajustados).toEqual([{ dia: "2026-08-14", pecas: 1 }]);
  });

  it("payload ausente ou evento com data inválida → nada", () => {
    expect(layoutSemAprovacaoPorEvento(undefined).size).toBe(0);
    const inv = montar(evento({ truckDepartureDate: "0206-08-30T00:00:00.000Z" }), [peca({ skipApproval: true })]);
    expect(layoutSemAprovacaoPorEvento([inv]).size).toBe(0);
  });

  it("dia local e dd/mm", () => {
    const d = diaLocal("2026-11-17");
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 10, 17]);
    expect(diaMes("2026-11-17")).toBe("17/11");
  });
});

describe("a grade usa a régua (código-fonte)", () => {
  const cal = readFileSync(path.resolve(__dirname, "../../client/src/pages/calendario.tsx"), "utf8");

  it("lê o ajustado da Gestão de Prazos, pela MESMA chave de cache, só quando desenha o Layout", () => {
    expect(cal).toContain('useQuery<PrazosPayload>({ queryKey: ["/api/prazos"], enabled: desenhaLayout })');
    expect(cal).toContain("layoutSemAprovacaoPorEvento(");
  });

  it("desenha 'Entrega de Layouts (sem aprovação)' no dia ajustado, com a contagem", () => {
    expect(cal).toContain('"Entrega de Layouts (sem aprovação)"');
    expect(cal).toContain("semAprovacao: { pecas: a.pecas, normal: sa!.normal }");
    expect(cal).toContain("(${semAprovacao.pecas})");
  });

  it("o Layout normal com só peças sem aprovação não vai à frente como 'vence hoje'", () => {
    expect(cal).toContain("if (item.soSemAprovacao) return 4;");
    expect(cal).toContain("diaAbertoEhHoje && !soSemAprovacao");
  });

  it("o ajustado não refaz a conta de fim de semana (já vem pronto)", () => {
    expect(cal).toContain("if (!selectedDate || semAprovacao) return null;");
  });
});
