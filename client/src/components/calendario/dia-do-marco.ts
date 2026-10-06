// O DIA EM QUE O MARCO APARECE NO CALENDÁRIO — o mesmo da Gestão de Prazos.
//
// DECISÃO DO DONO (06/10, "Sim"): o Calendário segue a regra de fim de semana
// dos prazos. Marco que cai no sábado aparece na SEXTA, no domingo aparece na
// SEGUNDA; a Produção Gráfica, que roda no fim de semana, fica no dia cru.
//
// PORQUÊ. O Calendário desenhava o dia CRU (saída do caminhão + offset), e a
// Gestão de Prazos, a Arte e o Detalhe do Evento cobravam o dia AJUSTADO. Um
// marco de sábado ficava no sábado aqui e na sexta lá — quem planejava pela
// grade descobria o prazo um dia depois do que a Gestão de Prazos já contava
// como vencido. A conta não é reescrita aqui: é `diaDoMarcoUTC`
// (@shared/prazo-dates), a MESMA função do `stageDeadline` do servidor.
//
// A âncora é a de `truckDayUTC` no servidor: o dia-calendário UTC da saída
// (o horário gravado como UTC É o de exibição — ver `toUTCDisplayDate`). O
// resultado volta como meia-noite LOCAL desse mesmo dia, porque é assim que a
// grade indexa as células (`toDateString`).
import { diaDoMarcoUTC } from "@shared/prazo-dates";

export function diaDoMarcoNoCalendario(
  truckDepartureDate: Date | string,
  offset: number,
  todosOsDias: boolean,
): Date {
  const saida = new Date(truckDepartureDate);
  const saidaDia = Date.UTC(saida.getUTCFullYear(), saida.getUTCMonth(), saida.getUTCDate());
  const d = diaDoMarcoUTC(saidaDia, offset, todosOsDias);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}
