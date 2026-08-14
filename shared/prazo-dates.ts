// Regra de "ano plausível" para datas de evento — FONTE ÚNICA.
//
// PORQUÊ: a mesma faixa 2000-2100 estava escrita à mão em três lugares
// (`server/routes/prazos.ts`, `server/routes/events.ts` e
// `client/src/pages/painel-geral.tsx`). Três cópias de uma regra de negócio
// é uma regra que vai divergir: quem afrouxar a validação da escrita sem
// afrouxar a da leitura cria um dado que entra no banco e depois é exibido
// como "cadastro quebrado" para sempre.
//
// O caso real que originou a guarda: alguém digitou "0206" no lugar de
// "2026". A conta ficou fiel ao dado — o Painel exibiu "ATRASADO 664730D" —
// e a tela passou a gritar sobre um typo. A faixa é larga DE PROPÓSITO: não
// é validação de negócio ("evento não pode ser daqui a 40 anos"), é só uma
// barreira contra o absurdo tipográfico.

export const MIN_PLAUSIBLE_EVENT_YEAR = 2000;
export const MAX_PLAUSIBLE_EVENT_YEAR = 2100;

/** Ano plausível para uma data de evento (saída do caminhão, início, etc). */
export function isPlausibleEventYear(year: number): boolean {
  return (
    Number.isFinite(year) &&
    year >= MIN_PLAUSIBLE_EVENT_YEAR &&
    year <= MAX_PLAUSIBLE_EVENT_YEAR
  );
}

/**
 * Mesma regra a partir de uma data-calendário "YYYY-MM-DD" (aceita ISO
 * completo — só os 4 primeiros caracteres importam).
 */
export function isPlausibleEventDate(dateOnly: string): boolean {
  return isPlausibleEventYear(Number(String(dateOnly).slice(0, 4)));
}

// ─────────────────────────────────────────────────────────────────────────────
// ÂNCORA DE DIA DO NEGÓCIO — America/São_Paulo.
//
// Mora aqui, e não em `server/services/prazo-domain.ts`, porque o CLIENTE
// precisa da mesma conta: a regra "evento já realizado sai das filas" é
// avaliada nas duas pontas (o servidor decide quem entra na Gestão de Prazos;
// cada tela de fila decide o que esconde) e duas implementações da virada do
// dia divergiriam no primeiro fuso diferente. `prazo-domain` e
// `server/routes/events.ts` reexportam estas funções — os nomes antigos
// continuam válidos para quem já os importava.
//
// "Hoje" do NEGÓCIO = dia-calendário em São Paulo, expresso como UTC-meia-noite
// para a aritmética de dias. A âncora anterior (dia UTC do processo) virava
// "amanhã" às 21h de Brasília: o evento de amanhã já aparecia como realizado
// com o dia de hoje ainda em curso.
// ─────────────────────────────────────────────────────────────────────────────

export const SP_DAY_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
});

/** Instante real → dia-calendário do negócio, em ms UTC-meia-noite. */
export function spDayMs(date: Date): number {
  const [y, m, d] = SP_DAY_FMT.format(date).split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/** "Hoje" do negócio em ms (UTC-meia-noite). Único ponto que lê o relógio. */
export function todayBusinessMs(): number {
  return spDayMs(new Date());
}

/** "Hoje" do negócio como "YYYY-MM-DD". */
export function todayBusinessStr(): string {
  return SP_DAY_FMT.format(new Date()); // YYYY-MM-DD (en-CA)
}

/** "YYYY-MM-DD" (fuso do negócio) → milissegundos UTC-meia-noite. */
export function businessDayStrToMs(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return Date.UTC(y, (m ?? 1) - 1, d ?? 1);
}

/**
 * Data de evento (Date, ISO ou "YYYY-MM-DD") → dia-calendário em ms
 * UTC-meia-noite; `null` quando não há data, quando ela não parseia ou quando
 * o ANO é implausível.
 *
 * O ano implausível vira `null` de propósito: um "0206" digitado no lugar de
 * "2026" é uma data 1.800 anos no passado, e qualquer regra do tipo "já
 * passou?" responderia SIM — o typo apagaria o evento das telas em vez de
 * aparecer como cadastro a corrigir.
 */
export function eventDayMs(value: Date | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  const t = d.getTime();
  if (!Number.isFinite(t)) return null;
  if (!isPlausibleEventYear(d.getUTCFullYear())) return null;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

// ─────────────────────────────────────────────────────────────────────────────
// EVENTO FINALIZADO — o predicado ÚNICO das filas de trabalho e dos prazos.
//
// A REGRA (do dono, 14/08): "eventos finalizados, ou seja que passou o dia,
// não contam mais para prazos e no app". Perguntado se a âncora era a saída do
// caminhão: "saída do caminhão não, e sim a DATA DO EVENTO. Some de tudo."
//
// Logo o evento é finalizado por DUAS origens, e a interface precisa saber
// qual — as frases são diferentes ("um admin encerrou" × "o evento já
// aconteceu") e só a primeira tem volta (reabrir):
//
//   · "encerrado" → alguém clicou em Encerrar evento (events.status = "closed").
//   · "realizado" → a DATA DO EVENTO (events.startDate) já passou. Note que a
//     âncora NÃO é a saída do caminhão, que é sempre anterior: o caminhão sai,
//     o evento acontece dias depois, e só aí o trabalho acaba.
//
// VIRADA DO DIA: "passou o dia" é DEPOIS do fim do dia do evento, no fuso do
// negócio — durante o dia do evento ele AINDA CONTA (comparação estrita `>`).
//
// EVENTO SEM DATA DE INÍCIO (existe no banco) NUNCA é finalizado pela data:
// sem âncora não há "passou", e sumir por falta de cadastro seria esconder
// justamente o evento mais mal cadastrado. Ele continua nas filas e nos prazos
// até alguém encerrá-lo à mão ou preencher a data.
// ─────────────────────────────────────────────────────────────────────────────

/** Valor gravado em `events.status` pelo encerramento MANUAL. */
export const EVENT_CLOSED_STATUS = "closed";

/** Por que o evento saiu de circulação. `null` = ainda em jogo. */
export type EventoFinalizadoMotivo = "encerrado" | "realizado";

/**
 * Forma MÍNIMA de evento que o predicado precisa. É estrutural de propósito:
 * o objeto chega enriquecido (`enrichEvent`, com `manuallyClosed`) em
 * /api/events e CRU pendurado em `item.event` nas listas de peças — ali só
 * existem `status` e `startDate`.
 */
export interface EventoFinalizavel {
  status?: string | null;
  manuallyClosed?: boolean | null;
  startDate?: Date | string | null;
}

/**
 * Origem da finalização — `null` quando o evento ainda conta.
 *
 * `hojeMs` é o dia do negócio em ms (ver `todayBusinessMs`). Recebido por
 * parâmetro para que o teste possa fixar a virada do dia e para que uma tela
 * inteira use a MESMA âncora em todos os recortes.
 */
export function motivoEventoFinalizado(
  event: EventoFinalizavel | null | undefined,
  hojeMs: number,
): EventoFinalizadoMotivo | null {
  if (!event) return null;
  // Encerramento manual vem primeiro: é a decisão de uma pessoa, e ela
  // continua sendo a explicação certa mesmo depois de a data passar.
  if (event.manuallyClosed === true || event.status === EVENT_CLOSED_STATUS) return "encerrado";
  const dia = eventDayMs(event.startDate);
  if (dia === null) return null; // sem data (ou data absurda) → nunca finalizado
  return hojeMs > dia ? "realizado" : null;
}

/** O evento saiu de circulação (por encerramento manual OU por já ter acontecido). */
export function isEventoFinalizado(
  event: EventoFinalizavel | null | undefined,
  hojeMs: number,
): boolean {
  return motivoEventoFinalizado(event, hojeMs) !== null;
}
