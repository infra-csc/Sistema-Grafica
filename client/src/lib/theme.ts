// Design tokens compartilhados — paleta "Titanium/Stone" e escalas de
// tipografia, raio e elevação. Antes cada página redefinia um `const T = {...}`
// local; a tela da Arte chegava a 113 cores hardcoded, 19 raios de borda e 14
// tamanhos de fonte. Centralizar evita a divergência entre cópias.
export const T = {
  bg: "#f9f9f8",
  surface: "#ffffff",
  border: "#e8e8e7",
  bdark: "#d6d3d1",
  text: "#1a1c1c",
  second: "#78716c",
  /**
   * ATENÇÃO: apenas para elementos decorativos (ícones, separadores,
   * placeholders). Sobre branco fica em ~2.5:1 e reprova WCAG AA como texto —
   * para texto que precisa ser lido use `T.second`, que passa em ~4.8:1.
   */
  muted: "#a8a29e",
  accent: "#f97316",
  dark: "#1c1917",
  low: "#f3f4f3",
};

/**
 * Escala tipográfica. Os degraus existem para forçar hierarquia: quando um
 * texto não cabe em nenhum deles, o problema costuma ser a hierarquia, não a
 * escala. Nada abaixo de 10px — 8px não é legível nem dentro de badge.
 */
export const FS = {
  micro: 10,   // rótulo de badge, texto auxiliar em caixa alta
  small: 11,   // metadados, legendas
  body: 13,    // texto corrente da interface
  strong: 15,  // destaque dentro de um bloco
  title: 18,   // título de seção
  h2: 22,      // título de card/modal
  h1: 26,      // título de página
} as const;

/**
 * Raio de borda. Cinco degraus cobrem tudo — a Arte usava dezenove, incluindo
 * quatro formas diferentes de dizer "pílula" (20, 99, 100, 9999).
 */
export const R = {
  sm: 6,     // chips, badges retangulares
  md: 8,     // botões, inputs, controles
  lg: 12,    // cards, painéis
  xl: 16,    // modais
  pill: 999, // pílulas e círculos
} as const;

/** Elevação em três degraus, do rente ao flutuante. */
export const SHADOW = {
  sm: "0 1px 2px rgba(28,25,23,0.06)",
  md: "0 4px 12px -2px rgba(28,25,23,0.10)",
  lg: "0 16px 32px -12px rgba(28,25,23,0.18)",
} as const;
