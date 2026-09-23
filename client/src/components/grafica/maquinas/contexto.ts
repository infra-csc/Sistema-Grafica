// ─────────────────────────────────────────────────────────────────────────────
// MÁQUINAS DA GRÁFICA — os contextos que a página fornece às linhas.
// ─────────────────────────────────────────────────────────────────────────────
import { createContext } from "react";

/**
 * Ponteiro grosso (dedo) OU celular: os alvos pequenos sobem a 44px. Um
 * contexto e não um hook por linha — a fila passa de 300 linhas memoizadas.
 */
export const ToqueContext = createContext(false);

// ─── A FICHA da peça ──────────────────────────────────────────────────────────
// Em toda a tela o título da peça (com a descrição, que é o que a identifica)
// é um BOTÃO que abre a mesma ficha da Gráfica (ItemDetailsDialog); "Ver na
// Gráfica" segue como ação separada. O contexto evita passar o gesto por cinco
// componentes (e mantém as linhas memoizadas).
export const FichaContext = createContext<(id: string) => void>(() => {});
