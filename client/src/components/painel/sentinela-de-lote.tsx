import { useEffect, useRef } from "react";

/** O contêiner que rola de verdade (o <main> do layout), para a margem da sentinela valer. */
function ancestralQueRola(el: HTMLElement): Element | null {
  let n = el.parentElement;
  while (n && n !== document.body) {
    const oy = getComputedStyle(n).overflowY;
    if (oy === "auto" || oy === "scroll") return n;
    n = n.parentElement;
  }
  return null;
}

/**
 * Pede o próximo lote quando se aproxima da área visível. A `key` muda a cada
 * lote no pai: a sentinela remonta e o observer recém-criado reporta de novo
 * se ela CONTINUA perto (lote pequeno demais para empurrá-la para longe).
 */
export function SentinelaDeLote({ onVisivel }: { onVisivel: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    // A margem precisa ser do contêiner que rola: com a raiz implícita (a
    // janela), o recorte do <main> anularia a antecipação e o lote só chegaria
    // com a sentinela já na tela.
    const io = new IntersectionObserver(
      (entradas) => { if (entradas.some((e) => e.isIntersecting)) onVisivel(); },
      { root: ancestralQueRola(el), rootMargin: "0px 0px 1500px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [onVisivel]);
  return <div ref={ref} aria-hidden="true" data-testid="painel-sentinela-lote" style={{ height: 1 }} />;
}
