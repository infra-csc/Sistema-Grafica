// ─────────────────────────────────────────────────────────────────────────────
// AS REFERÊNCIAS VISUAIS de uma peça, como lista (25/08).
//
// A peça sempre teve UMA referência (referenceUrl); o dono pediu várias. A
// lista completa mora em referenceUrls, e referenceUrl segue existindo como a
// PRIMEIRA — é o que as telas de miniatura única mostram. Esta função é a
// única leitura correta: lista quando há, campo antigo como reserva (peça
// anterior à coluna), vazio quando nada.
// ─────────────────────────────────────────────────────────────────────────────
export function refsDaPeca(
  item: { referenceUrls?: (string | null)[] | null; referenceUrl?: string | null } | null | undefined,
): string[] {
  if (!item) return [];
  const lista = (item.referenceUrls ?? []).filter((u): u is string => typeof u === "string" && u.length > 0);
  if (lista.length > 0) return lista;
  return item.referenceUrl ? [item.referenceUrl] : [];
}
