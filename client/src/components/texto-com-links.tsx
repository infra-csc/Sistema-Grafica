// ─────────────────────────────────────────────────────────────────────────────
// TEXTO COM LINKS — um texto livre (motivo de reprovação, comentário) em que
// as URLs viram âncoras clicáveis. Pedido do dono (21/08/2026): "deixar link
// do comentário clicável — da correção".
//
// O patrocinador manda o link da referência (Drive, WeTransfer, a página da
// marca) dentro do motivo; a Arte tinha de selecionar, copiar e colar. Só
// http(s):// e www. viram link — nada de heurística para "algo.com", que
// acerta pouco e linka errado. Abre em aba nova e não propaga o clique: o
// texto mora dentro de cartões que também são clicáveis.
// ─────────────────────────────────────────────────────────────────────────────
import type { CSSProperties } from "react";

// Global: é usado com .split(), que precisa do grupo de captura para devolver
// os próprios matches entrelaçados com os trechos de texto.
const RE_URL = /((?:https?:\/\/|www\.)[^\s<>"']+)/g;
// Pontuação de fim de frase gruda na URL quando a pessoa escreve "veja em
// https://x.com/y." — fica fora do link.
const RE_CAUDA = /[.,;:!?)\]]+$/;

/** Divide o texto em trechos: { texto } ou { url, href }. Exportado para teste. */
export function fatiarLinks(texto: string): Array<{ texto: string } | { url: string; href: string }> {
  const partes = texto.split(RE_URL);
  const saida: Array<{ texto: string } | { url: string; href: string }> = [];
  partes.forEach((p, i) => {
    if (!p) return;
    if (i % 2 === 0) { saida.push({ texto: p }); return; }
    const cauda = p.match(RE_CAUDA)?.[0] ?? "";
    const url = cauda ? p.slice(0, -cauda.length) : p;
    const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    saida.push({ url, href });
    if (cauda) saida.push({ texto: cauda });
  });
  return saida;
}

const LINK: CSSProperties = {
  color: "#c2410c",           // laranja-700 sobre branco/rosa-claro = 5,0:1+
  textDecoration: "underline",
  textUnderlineOffset: 2,
  wordBreak: "break-all",
  fontWeight: 600,
};

export function TextoComLinks({ texto, style }: { texto: string; style?: CSSProperties }) {
  const fatias = fatiarLinks(texto);
  if (!fatias.some((f) => "url" in f)) return <>{texto}</>;
  return (
    <>
      {fatias.map((f, i) =>
        "url" in f ? (
          <a key={i} href={f.href} target="_blank" rel="noopener noreferrer" data-testid="link-no-texto"
            onClick={(e) => e.stopPropagation()} style={{ ...LINK, ...style }} title={f.href}>
            {f.url}
          </a>
        ) : (
          <span key={i}>{f.texto}</span>
        ),
      )}
    </>
  );
}
