// ─────────────────────────────────────────────────────────────────────────────
// O QUE O JSON FAZ COM AS LINHAS DO BANCO.
//
// Os tipos do Drizzle (`Item`, `Event`, `Sponsor`…) descrevem a linha como o
// SERVIDOR a lê: `timestamp` vira `Date`. Pelo cabo não existe `Date` — o
// `res.json` chama `toJSON()` e o cliente recebe o texto ISO
// ("2026-09-21T13:00:00.000Z"). Tipar a resposta com `Item` direto era mentir
// para o compilador: `item.createdAt.getTime()` passava no tsc e estourava na
// tela.
//
// `Json<T>` é a mesma forma com `Date` trocado por `string`, em qualquer
// profundidade (arrays e objetos aninhados inclusive). `null`/`undefined`
// seguem como estão; `Date | null` vira `string | null`.
// ─────────────────────────────────────────────────────────────────────────────

/** A forma de `T` depois de `JSON.stringify` + `JSON.parse` (Date → string ISO). */
export type Json<T> =
  T extends Date ? string
  : T extends ReadonlyArray<infer U> ? Json<U>[]
  : T extends object ? { [K in keyof T]: Json<T[K]> }
  : T;
