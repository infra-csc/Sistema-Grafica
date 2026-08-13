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
