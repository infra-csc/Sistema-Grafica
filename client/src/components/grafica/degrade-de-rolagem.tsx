// A PISTA DE QUE HÁ MAIS PARA O LADO. No celular a fileira de atalhos da fila e
// as abas internas da aba Tubos rolam de lado — e, sem pista, o último chip
// cortado na borda parecia o fim. Um degradê na cor do fundo aparece na borda
// que ainda tem conteúdo escondido e some quando se chega nela (o mesmo recurso
// do trilho de abas da Análises).
import { useEffect, useState } from "react";
import type React from "react";
import { T } from "@/lib/theme";

/**
 * Mede a rolagem lateral de `ref` (e do primeiro descendente que role de
 * verdade — o <Abas> rola no próprio tablist). Devolve que bordas escondem algo.
 */
export function useBordasDeRolagem(ref: React.RefObject<HTMLElement>, ativo = true) {
  const [bordas, setBordas] = useState({ esq: false, dir: false });
  useEffect(() => {
    const raiz = ref.current;
    if (!raiz || !ativo) return;
    const candidatos = [raiz, ...Array.from(raiz.querySelectorAll<HTMLElement>("[role=tablist]"))];
    const medir = () => {
      let esq = false, dir = false;
      for (const el of candidatos) {
        const max = el.scrollWidth - el.clientWidth;
        if (max <= 2) continue;
        esq = esq || el.scrollLeft > 2;
        dir = dir || el.scrollLeft < max - 2;
      }
      setBordas((b) => (b.esq === esq && b.dir === dir ? b : { esq, dir }));
    };
    medir();
    candidatos.forEach((el) => el.addEventListener("scroll", medir, { passive: true }));
    window.addEventListener("resize", medir);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(medir) : null;
    candidatos.forEach((el) => ro?.observe(el));
    Array.from(raiz.children).forEach((el) => ro?.observe(el));
    // Chip que entra depois (Travadas, Limpar) muda a largura do conteúdo sem
    // mudar a da caixa: a lista de filhos também dispara a medida.
    const mo = typeof MutationObserver !== "undefined" ? new MutationObserver(() => requestAnimationFrame(medir)) : null;
    mo?.observe(raiz, { childList: true, subtree: true });
    const t = setTimeout(medir, 300);
    return () => {
      candidatos.forEach((el) => el.removeEventListener("scroll", medir));
      window.removeEventListener("resize", medir);
      ro?.disconnect();
      mo?.disconnect();
      clearTimeout(t);
    };
  }, [ref, ativo]);
  return bordas;
}

/** Os dois véus. O pai precisa de `position: relative`; `recuo` acompanha a fileira que sangra até a borda da tela. */
export function VeusDeRolagem({ bordas, fundo = T.bg, recuo = 0, testId = "degrade" }: {
  bordas: { esq: boolean; dir: boolean };
  fundo?: string;
  recuo?: number;
  testId?: string;
}) {
  const veu = (lado: "left" | "right"): React.CSSProperties => ({
    // 56px com a cor do fundo CHEIA nos primeiros 40%: sobre um chip branco o
    // degradê curto do papel para o transparente nem se via.
    position: "absolute", top: 0, bottom: 1, [lado]: recuo, width: 56, pointerEvents: "none", zIndex: 2,
    background: `linear-gradient(to ${lado === "left" ? "right" : "left"}, ${fundo} 40%, transparent)`,
  });
  return (
    <>
      {bordas.esq && <span aria-hidden="true" data-testid={`${testId}-esq`} style={veu("left")} />}
      {bordas.dir && <span aria-hidden="true" data-testid={`${testId}-dir`} style={veu("right")} />}
    </>
  );
}
