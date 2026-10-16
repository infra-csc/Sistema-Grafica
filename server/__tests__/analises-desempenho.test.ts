// A régua de RETRABALHO (lib/analises-desempenho) — o foco "retrabalho" do
// Painel Geral filtra por ela (components/painel/recorte.ts).
//
// Era o teste da aba "Desempenho" da Análises de status; a aba saiu em 16/10
// (a Análises virou o Painel operacional da gráfica) e ficou só a régua que o
// Painel Geral importa.
import { describe, expect, it } from "vitest";
import type { AnaliseItem } from "@/lib/analises-metrics";
import { temRefacao } from "@/lib/analises-desempenho";

function item(over: Partial<AnaliseItem> & { status: string }): AnaliseItem {
  return {
    id: over.id ?? Math.random().toString(36).slice(2),
    eventId: over.eventId ?? "ev1",
    status: over.status,
    createdAt: over.createdAt ?? "2026-05-20T12:00:00.000Z",
    rejectedBySponsor: over.rejectedBySponsor ?? false,
    rejectedByCreator: over.rejectedByCreator ?? false,
    previousFinalFileUrl: over.previousFinalFileUrl ?? null,
    previousApprovalThumbUrl: over.previousApprovalThumbUrl ?? null,
    complementSeq: over.complementSeq ?? null,
  };
}

describe("retrabalho", () => {
  it("pega os dois sinais DURÁVEIS e os dois transitórios", () => {
    expect(temRefacao(item({ status: "delivered", previousFinalFileUrl: "x" }))).toBe(true);
    expect(temRefacao(item({ status: "delivered", previousApprovalThumbUrl: "x" }))).toBe(true);
    expect(temRefacao(item({ status: "awaiting_submission", rejectedByCreator: true }))).toBe(true);
    expect(temRefacao(item({ status: "awaiting_approval", rejectedBySponsor: true }))).toBe(true);
    expect(temRefacao(item({ status: "delivered" }))).toBe(false);
  });

  it("complemento não é refação de arte — quantidade extra não é erro de arte", () => {
    expect(temRefacao(item({ status: "delivered", complementSeq: 1 }))).toBe(false);
  });
});
