// ─────────────────────────────────────────────────────────────────────────────
// O NOME DA PEÇA (dono, 21/09, olhando a fila de Máquinas: "aqui precisa da
// descrição do item" — todas eram "2×1" e ficavam indistinguíveis).
//
// Quem identifica a peça é a DESCRIÇÃO; o tipo é a família. A mesma regra da
// etiqueta em lista (client/src/lib/etiqueta-lista.ts): a descrição que já
// começa pelo tipo ("2×1 Nubank") não repete o tipo; nada é abreviado.
// ─────────────────────────────────────────────────────────────────────────────
const limpo = (v: unknown) => String(v ?? "").trim();

/** A descrição já começa pelo tipo? ("2x1 Nubank" com tipo "2×1" também conta.) */
function comecaPeloTipo(tipo: string, descricao: string): boolean {
  const n = (s: string) => s.toLowerCase().replace(/×/g, "x").replace(/\s+/g, " ");
  return !!tipo && n(descricao).startsWith(n(tipo));
}

/** As duas partes para a tela: o que vai em DESTAQUE e o tipo como apoio (null quando seria repetição). */
export function partesDoNomeDaPeca(tipo: unknown, descricao: unknown): { destaque: string; tipo: string | null } {
  const t = limpo(tipo);
  const d = limpo(descricao);
  if (!d || d.toLowerCase() === t.toLowerCase()) return { destaque: t || "—", tipo: null };
  return { destaque: d, tipo: comecaPeloTipo(t, d) ? null : t || null };
}

/** Em uma linha só (toasts, confirmações, diário, Excel): "2×1 — Logo Nubank" ou "2×1 Nubank". */
export function nomeDaPeca(tipo: unknown, descricao: unknown): string {
  const p = partesDoNomeDaPeca(tipo, descricao);
  return p.tipo ? `${p.tipo} — ${p.destaque}` : p.destaque;
}
