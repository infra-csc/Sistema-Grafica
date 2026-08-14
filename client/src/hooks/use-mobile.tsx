import * as React from "react"

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener("change", onChange)
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return !!isMobile
}

// ─────────────────────────────────────────────────────────────────────────────
// Medida do CONTAINER (aditivo — `useIsMobile` acima segue intocado).
//
// PORQUÊ. `useIsMobile` lê `window.innerWidth`, que NÃO é a largura útil do
// conteúdo: com a sidebar aberta (16rem = 256px), uma janela de 1000px deixa
// ~744px para a tabela e mesmo assim o hook responde "desktop". Resultado: a
// faixa de ~768 a ~1180px de conteúdo caía na tabela larga sem válvula de
// escape e a PÁGINA inteira ganhava rolagem horizontal (o `overflow-y: auto` do
// SidebarInset faz o `overflow-x` computar `auto`, então o estouro rola de lado
// em silêncio em vez de quebrar visivelmente). Abrir/fechar a sidebar também
// não mudava nada no cálculo.
//
// Aditivo de propósito: `useIsMobile` é usado por muitas telas e continua com
// exatamente o mesmo corte de 768px e o mesmo comportamento.
// ─────────────────────────────────────────────────────────────────────────────

/** Abaixo disto o conteúdo não comporta tabela — usa o layout de cards. */
export const CONTENT_CARDS_MAX = 820
/** Entre CARDS_MAX e isto, a tabela roda em modo reduzido (colunas fundidas). */
export const CONTENT_COMPACT_MAX = 1180

export type ContentDensity = "cards" | "compact" | "full"

export function densityFromWidth(width: number): ContentDensity {
  if (width < CONTENT_CARDS_MAX) return "cards"
  if (width < CONTENT_COMPACT_MAX) return "compact"
  return "full"
}

/**
 * Tamanho atual de um elemento, via ResizeObserver.
 *
 * Devolve 0 antes da primeira medição (e em ambiente sem ResizeObserver) — o
 * consumidor decide o fallback, porque "ainda não medi" e "medi e deu zero" não
 * podem cair no mesmo layout.
 *
 * A altura existe para o empilhamento de `position: sticky`: quem gruda embaixo
 * de uma barra sticky precisa saber a altura REAL dela, que muda quando os
 * controles quebram linha. Com um número fixo, a camada de baixo some por trás
 * da de cima na primeira quebra.
 */
export function useElementSize<T extends HTMLElement>() {
  const ref = React.useRef<T | null>(null)
  const [size, setSize] = React.useState({ width: 0, height: 0 })

  React.useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === "undefined") return
    const apply = (w: number, h: number) =>
      // Ignora variação sub-pixel: sem isto, um scrollbar aparecendo/sumindo
      // dispara re-render em laço.
      setSize((prev) =>
        Math.abs(prev.width - w) < 1 && Math.abs(prev.height - h) < 1 ? prev : { width: w, height: h },
      )
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect
      if (r) apply(r.width, r.height)
    })
    ro.observe(el)
    const r0 = el.getBoundingClientRect()
    apply(r0.width, r0.height)
    return () => ro.disconnect()
  }, [])

  return { ref, width: size.width, height: size.height }
}
