// ─────────────────────────────────────────────────────────────────────────────
// displayId — leitura e ordenação do código da peça.
//
// POR QUE ESTE ARQUIVO EXISTE. O complemento (aumento de quantidade depois que
// a peça entrou em produção) introduziu o PRIMEIRO displayId que não é
// "#" + 4 dígitos: `#0062-C1`. Todo lugar que ordenava fazendo
// `parseInt(displayId.replace(/\D/g, ''))` passou a mentir — "#0062-C1" virava
// 621, ordenando entre #0620 e #0622, a centenas de linhas da própria mãe.
// Isso produziria exatamente a duplicidade confusa que o modelo de complemento
// existe para evitar: duas linhas da mesma peça, longe uma da outra, sem que
// nada na tela explique a relação.
//
// Espelho literal de server/storage.ts (parseDisplayId/compareDisplayId/
// assetPrefix) — o servidor não importa código do client e vice-versa, mesma
// disciplina dos dois mapas de status que já convivem. Se um mudar, o outro
// muda junto.
//
// REGRA PARA TODO SORT NOVO: ordenação por displayId usa `compareDisplayId`,
// nunca `replace(/\D/g,'')` nem `localeCompare` cru.
// ─────────────────────────────────────────────────────────────────────────────

/** Quebra "#0062-C1" em { base: 62, seq: 1 }. "#0062" → { base: 62, seq: 0 }. */
export function parseDisplayId(id?: string | null): { base: number; seq: number } {
  const m = String(id ?? "").match(/^#?(\d+)(?:-C(\d+))?/i);
  return { base: m ? parseInt(m[1], 10) : 0, seq: m?.[2] ? parseInt(m[2], 10) : 0 };
}

/** Ordena #0062 antes de #0062-C1, antes de #0062-C2, antes de #0063. */
export function compareDisplayId(a?: string | null, b?: string | null): number {
  const A = parseDisplayId(a);
  const B = parseDisplayId(b);
  return A.base !== B.base ? A.base - B.base : A.seq - B.seq;
}

/**
 * Separa "#0062-C1" em { base: "#0062", suffix: "-C1" } para colorir só o
 * sufixo na tela (o "-C1" em tom mais escuro dentro do mesmo código).
 */
export function splitDisplayId(id?: string | null): { base: string; suffix: string } {
  const s = String(id ?? "");
  const m = s.match(/^(.*?)(-C\d+)$/i);
  return m ? { base: m[1], suffix: m[2] } : { base: s, suffix: "" };
}
