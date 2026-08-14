// Regra do chip de prazo do Painel Geral. Cada bloco abaixo prende um dos
// modos de falha que a versão puramente-calendário tinha — e que só apareciam
// cruzando o painel com a validação de cadastro de evento.
import { describe, expect, it } from "vitest";
import {
  computeDeadlineChip, countPendentes, dayDiff, isPendingItemStatus,
  PRAZO_COLORS, DIA_MS,
} from "@/lib/painel-prazo";

const hoje = new Date(2026, 7, 14).setHours(0, 0, 0, 0); // 14/08/2026, meia-noite local
const emDias = (d: number) => hoje + d * DIA_MS;

describe("dayDiff", () => {
  it("conta dias inteiros entre duas meia-noites", () => {
    expect(dayDiff(hoje, emDias(3))).toBe(3);
    expect(dayDiff(hoje, emDias(-5))).toBe(-5);
    expect(dayDiff(hoje, hoje)).toBe(0);
  });

  it("arredonda: um deslocamento de horas não vira um dia inteiro", () => {
    // O filtro de data usava Math.ceil e o chip Math.round sobre EXATAMENTE a
    // mesma diferença. Com ceil, +1h viraria "1 dia".
    expect(dayDiff(hoje, hoje + 3 * 3_600_000)).toBe(0);
    expect(dayDiff(hoje, emDias(2) + 3_600_000)).toBe(2);
  });
});

describe("pendência", () => {
  it("terminal não é pendência; qualquer outro status é", () => {
    for (const s of ["delivered", "canceled", "deleted"]) expect(isPendingItemStatus(s)).toBe(false);
    for (const s of ["awaiting_approval", "inProduction", "conferred", "draft"]) expect(isPendingItemStatus(s)).toBe(true);
    expect(isPendingItemStatus(null)).toBe(false);
  });

  it("countPendentes ignora peças soft-deleted", () => {
    expect(countPendentes([
      { status: "awaiting_approval" },
      { status: "awaiting_approval", deletedAt: "2026-08-01" },
      { status: "delivered" },
    ])).toBe(1);
  });
});

describe("computeDeadlineChip", () => {
  it("sem data de saída não existe chip", () => {
    expect(computeDeadlineChip(null, hoje, 5)).toBeNull();
    expect(computeDeadlineChip(undefined, hoje, 5)).toBeNull();
  });

  it("ano absurdo vira instrução de cadastro, não conta de dias", () => {
    // Saída no ano 0206 (typo de 2026) produzia "ATRASADO 664730D".
    const chip = computeDeadlineChip(new Date(206, 0, 1).getTime(), hoje, 0);
    expect(chip?.tone).toBe("danger");
    expect(chip?.dias).toBeNull();
    expect(chip?.text).toContain("inválida");
  });

  it("saída futura distante é neutra; ≤3 dias é âmbar", () => {
    expect(computeDeadlineChip(emDias(30), hoje, 12)).toMatchObject({ text: "Faltam 30d", tone: "neutral" });
    expect(computeDeadlineChip(emDias(3), hoje, 12)).toMatchObject({ text: "Faltam 3d", tone: "warning" });
    expect(computeDeadlineChip(emDias(1), hoje, 0)).toMatchObject({ text: "Faltam 1d", tone: "warning" });
  });

  it("saída hoje é âmbar", () => {
    expect(computeDeadlineChip(hoje, hoje, 4)).toMatchObject({ text: "Sai hoje", tone: "warning" });
  });

  it("ESTE É O ACHADO: evento saudável com saída no passado NÃO é vermelho", () => {
    // O cadastro proíbe saída no mesmo dia ou depois do início do evento
    // (eventos.tsx), então TODO evento passa por esta janela. Com a regra
    // antiga, um evento com 100% das peças entregues mostrava "ATRASADO 5d"
    // vermelho por ~10 dias seguidos — e o time aprendia a ignorar vermelho.
    const chip = computeDeadlineChip(emDias(-5), hoje, 0);
    expect(chip).toMatchObject({ text: "Saiu há 5d", tone: "neutral", color: PRAZO_COLORS.neutral });
  });

  it("ESTE É O ACHADO (outro lado): caminhão saiu com peça pendente é vermelho SEM carência", () => {
    // A regra antiga silenciava exatamente aqui: passados 3 dias do início do
    // evento, um evento com 40 peças em awaiting_approval virava "Encerrado"
    // cinza. Agora o número de pendentes vem escrito no chip.
    const chip = computeDeadlineChip(emDias(-90), hoje, 40);
    expect(chip).toMatchObject({ tone: "danger", color: PRAZO_COLORS.danger });
    expect(chip?.text).toBe("Atrasado 90d · 40 pendentes");
  });

  it("singular/plural do contador de pendentes", () => {
    expect(computeDeadlineChip(emDias(-1), hoje, 1)?.text).toBe("Atrasado 1d · 1 pendente");
    expect(computeDeadlineChip(emDias(-1), hoje, 2)?.text).toBe("Atrasado 1d · 2 pendentes");
  });

  it("nenhuma cor proibida pela régua da casa entra como cor de texto", () => {
    const chips = [
      computeDeadlineChip(emDias(10), hoje, 1),
      computeDeadlineChip(emDias(2), hoje, 1),
      computeDeadlineChip(hoje, hoje, 1),
      computeDeadlineChip(emDias(-2), hoje, 1),
      computeDeadlineChip(emDias(-2), hoje, 0),
    ];
    for (const c of chips) {
      expect(c).not.toBeNull();
      expect(["#f97316", "#a8a29e"]).not.toContain(c!.color);
    }
  });

  it("o dado de início do evento não participa mais do cálculo", () => {
    // A assinatura não aceita startDate: era ele que criava a carência de
    // 3 dias e meio (parseDateLocal devolve MEIO-DIA, então "3 dias" eram
    // 3d12h) — um número que ninguém conseguia reproduzir lendo a regra.
    expect(computeDeadlineChip.length).toBe(3);
  });
});
