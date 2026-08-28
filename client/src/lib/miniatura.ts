// ─────────────────────────────────────────────────────────────────────────────
// MINIATURA DO SERVIDOR (auditoria 27/08). Para URLs do /objects, acrescenta
// ?thumb=1 — o servidor devolve um webp de até 320px em vez do arquivo
// original (que pode ter MBs) quando o sharp está instalado; sem sharp, ele
// ignora o parâmetro e serve o original. Ou seja: usar este helper nunca
// piora nada — o pior caso é o comportamento de antes.
//
// Use SÓ em exibições pequenas (chips, quadradinhos de lista, cards). Zoom,
// lightbox e download continuam apontando para a URL crua.
// ─────────────────────────────────────────────────────────────────────────────
export function miniatura(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (!url.startsWith("/objects/")) return url;
  return `${url}${url.includes("?") ? "&" : "?"}thumb=1`;
}
