// O LAYOUT DAS PEÇAS SEM APROVAÇÃO NO CALENDÁRIO (Pedro/dono, 26/10).
//
// A regra é uma só para o app inteiro (@shared/prazo-sem-aprovacao): a peça
// "Sem patrocínio" ou "Arte do cliente" não passa pela Aprovação, e o prazo de
// Layout dela é o do evento + N dias corridos (N = duração da Aprovação, na
// configuração). O dono pediu que o Calendário siga a MESMA régua da Gestão de
// Prazos — então ele não refaz a conta: lê o payload de /api/prazos, que já
// traz o prazo de cada peça (`item.prazo`, com o fim de semana aplicado) e o
// prazo efetivo do marco de Layout (`stage.prazoEfetivo`).
//
// O que sai daqui, por evento:
//   · as datas AJUSTADAS em que vencem peças sem aprovação ainda em Layout, com
//     quantas peças vencem em cada uma — viram a marcação "Entrega de Layouts
//     (sem aprovação)" na grade;
//   · `soSemAprovacao`: no gate do Layout só restam essas peças. O marco normal
//     continua desenhado (é o calendário do evento), mas não é ele que cobra
//     ninguém — a grade não o trata como prazo que venceu/vence hoje.
//
// Só eventos que a Gestão de Prazos acompanha entram no payload (os ativos);
// evento já iniciado não tem peça em Layout para ajustar.
import type { PrazoEvent } from "@shared/prazos-contract";

export interface LayoutSemAprovacaoDoEvento {
  /** O prazo de Layout do calendário do evento ("YYYY-MM-DD"). */
  normal: string;
  /** Cada dia ajustado ("YYYY-MM-DD") e quantas peças sem aprovação ele mede. */
  ajustados: { dia: string; pecas: number }[];
  /** No gate do Layout só restam peças sem aprovação (o marco normal não cobra ninguém). */
  soSemAprovacao: boolean;
}

/** Por id de evento. Payload ausente (carregando, erro, Express antigo) → mapa vazio. */
export function layoutSemAprovacaoPorEvento(
  events: ReadonlyArray<PrazoEvent> | null | undefined,
): Map<string, LayoutSemAprovacaoDoEvento> {
  const out = new Map<string, LayoutSemAprovacaoDoEvento>();
  for (const ev of events ?? []) {
    if (ev.invalidDate) continue;
    const i = ev.stages.findIndex((s) => s.key === "layouts");
    const stage = ev.stages[i];
    if (!stage) continue;
    const porDia = new Map<string, number>();
    for (const it of ev.pendingItems) {
      // Medida AGORA pelo Layout ajustado: cobrada no marco de Layout, com
      // marca (prazoDeLayout só existe na peça com marca) e
      // com o prazo dela depois do prazo do evento.
      if (it.marcoIndex !== i || !it.prazoDeLayout || !it.prazo) continue;
      if (it.prazo !== it.prazoDeLayout.ajustado || it.prazo <= stage.deadline) continue;
      porDia.set(it.prazo, (porDia.get(it.prazo) ?? 0) + 1);
    }
    const soSemAprovacao = !!stage.prazoEfetivo && stage.prazoEfetivo !== stage.deadline && stage.state !== "done";
    if (porDia.size === 0 && !soSemAprovacao) continue;
    out.set(ev.eventId ?? ev.id, {
      normal: stage.deadline,
      ajustados: Array.from(porDia, ([dia, pecas]) => ({ dia, pecas })).sort((a, b) => a.dia.localeCompare(b.dia)),
      soSemAprovacao,
    });
  }
  return out;
}

/** "YYYY-MM-DD" → meia-noite LOCAL do mesmo dia (é assim que a grade indexa as células). */
export function diaLocal(dia: string): Date {
  const [y, m, d] = dia.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** "10/11". */
export const diaMes = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
