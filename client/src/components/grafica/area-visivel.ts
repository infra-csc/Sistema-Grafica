// ─────────────────────────────────────────────────────────────────────────────
// O TECLADO VIRTUAL COBRE O BOTÃO DE CONFIRMAR — e o CSS sozinho não resolve.
//
// POR QUÊ. No iPhone (sempre) e no Chrome do Android (desde a versão 108) o
// teclado encolhe só a VIEWPORT VISUAL: a viewport de layout, contra a qual
// `position: fixed`, `100dvh` e o `top: 50%` do Radix são calculados, continua
// do tamanho da tela inteira. Resultado no galpão: o operador toca em "Quem
// recebeu", o teclado sobe e o rodapé com "Entregar" fica atrás dele — é
// preciso fechar o teclado para achar o botão. `env(safe-area-inset-bottom)`
// não ajuda (é o home indicator, não o teclado) e `dvh` também não muda.
//
// O QUE FAZ. Enquanto a área visível estiver MENOR que a janela (teclado
// aberto), ajusta o elemento para caber nela:
//   • "centro" (DialogContent do Radix, centrado com top 50% + translateY):
//     recentra no meio da área visível e limita a altura a ela − respiro. O
//     corpo do modal já rola e o rodapé é `flexShrink: 0`/sticky, então o
//     Confirmar volta a ficar à vista, logo acima do teclado.
//   • "tela-cheia" (fila do galpão, folha de filtros): topo e altura iguais aos
//     da área visível — o rodapé fixo sobe junto com o teclado.
// Teclado fechado, devolve os valores que o React tinha escrito.
//
// SEM ESTADO DO REACT, DE PROPÓSITO. `visualViewport` dispara `resize`/`scroll`
// muitas vezes por segundo enquanto o teclado anima e enquanto se rola. Um
// setState aqui re-renderizaria a Gráfica inteira (a fila de milhares de
// peças) a cada quadro. Escrever direto no estilo do elemento não passa pelo
// React — e o React não desfaz: ele só reescreve uma propriedade de estilo
// quando o VALOR dela muda entre dois renders, o que não acontece aqui.
//
// Onde `visualViewport` não existe (navegador antigo, jsdom sem stub), não faz
// nada: o layout fica exatamente o de antes.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, type RefObject } from "react";

type Modo = "centro" | "tela-cheia";
const PROPS = ["top", "bottom", "height", "maxHeight"] as const;

export function useAcompanharAreaVisivel(
  ref: RefObject<HTMLElement | null>,
  modo: Modo,
  ativo: boolean,
  respiro = 16,
) {
  useEffect(() => {
    if (!ativo || typeof window === "undefined") return;
    const vv = window.visualViewport;
    if (!vv) return;
    // O que o React escreveu, por elemento — para devolver ao fechar o teclado.
    // WeakMap: o Radix desmonta e remonta o conteúdo; cada nó guarda o seu.
    const originais = new WeakMap<HTMLElement, Record<(typeof PROPS)[number], string>>();
    let ajustado: HTMLElement | null = null;

    const devolver = () => {
      if (!ajustado) return;
      const o = originais.get(ajustado);
      if (o) for (const p of PROPS) ajustado.style[p] = o[p];
      ajustado = null;
    };

    const aplicar = () => {
      // Lido a cada evento: o conteúdo do Dialog entra num commit POSTERIOR ao
      // efeito (o Portal do Radix monta no layout effect dele).
      const el = ref.current;
      // 1px de folga: arredondamento de zoom não é teclado.
      // Zoom com pinça também encolhe/desloca o visualViewport — e o operador
      // amplia a arte para conferir. Com escala ≠ 1 não é teclado: não mexe.
      const teclado = Math.abs(vv.scale - 1) < 0.01 && (window.innerHeight - vv.height > 1 || vv.offsetTop > 1);
      if (!el || !teclado) { devolver(); return; }
      if (ajustado && ajustado !== el) devolver();
      if (!originais.has(el)) originais.set(el, { top: el.style.top, bottom: el.style.bottom, height: el.style.height, maxHeight: el.style.maxHeight });
      ajustado = el;
      if (modo === "tela-cheia") {
        el.style.top = `${vv.offsetTop}px`;
        el.style.bottom = "auto";
        el.style.height = `${vv.height}px`;
      } else {
        el.style.top = `${vv.offsetTop + vv.height / 2}px`;
        el.style.maxHeight = `${Math.max(160, vv.height - respiro)}px`;
      }
    };

    vv.addEventListener("resize", aplicar);
    vv.addEventListener("scroll", aplicar);
    aplicar();
    return () => {
      vv.removeEventListener("resize", aplicar);
      vv.removeEventListener("scroll", aplicar);
      devolver();
    };
  }, [ref, modo, ativo, respiro]);
}
