// A casca das confirmações da Revisão Final e o "desligado" legível das
// decisões da ficha — estilos compartilhados por vários diálogos.
import type { CSSProperties } from "react";
import { T, N, FS, R } from "@/lib/theme";

/** Corpo rolável: com o teto do `modalSurface`, é ele que cede numa janela baixa. */
export const CORPO_DA_CONFIRMACAO: CSSProperties = { padding: "4px 24px 18px", overflowY: "auto", flex: "1 1 auto", minHeight: 0 };
/** A pergunta: T.apoio (7:1 sobre branco). */
export const TEXTO_DA_CONFIRMACAO: CSSProperties = { fontSize: FS.body, lineHeight: 1.55, color: T.apoio };
/** Cancelar à esquerda, a ação à direita; quebra no celular estreito. */
export const RODAPE_DA_CONFIRMACAO: CSSProperties = {
  display: "flex", justifyContent: "flex-end", flexWrap: "wrap", gap: 8, flexShrink: 0,
  padding: "14px 24px", borderTop: `1px solid ${T.border}`,
};
/** Caixa do motivo (devolver, travar): borda forte, papel branco, altura de 4 linhas. */
export const CAMPO_DO_MOTIVO: CSSProperties = {
  display: "block", width: "100%", boxSizing: "border-box", minHeight: 92, resize: "vertical",
  padding: "11px 12px", border: `1px solid ${T.bdark}`, borderRadius: R.md,
  backgroundColor: T.surface, color: T.text, lineHeight: 1.45, fontFamily: "inherit",
  boxShadow: "inset 0 1px 2px rgba(28,25,23,.04)",
};

/**
 * O "desligado" das três decisões da ficha. O .ds-botao:disabled só apaga o
 * botão pela metade (opacity .5) — e o escuro do primário a 50% leva o rótulo
 * para ~3:1. Aqui o desligado CARREGA informação (evento finalizado, arquivo
 * que não chegou), então fica cinza legível: T.second sobre N.n2 = 4,91:1.
 */
export const DESLIGADO_LEGIVEL: CSSProperties = {
  backgroundColor: N.n2, color: T.second, border: `1px solid ${T.border}`, opacity: 1,
};

/**
 * PISO DE 12px NO CELULAR (revisão de 25/09). A Revisão escrevia rótulos,
 * contagens e selos em 10–11px — lidos a um braço de distância, no celular,
 * somem. No desktop a densidade continua a de sempre. Mesma régua do
 * `fsToque` da Arte, do `fsMin` da Gráfica e do `useLetraDaFicha`.
 */
export const letra = (n: number, celular: boolean) => (celular ? Math.max(12, n) : n);

/**
 * O rodapé das confirmações NO CELULAR: os botões em linha cheia, empilhados
 * com a ação principal EM CIMA (column-reverse sobre a ordem Cancelar → ação)
 * e o recorte seguro embaixo (home indicator). Em 360px a fileira da direita
 * quebrava do jeito que desse: "Liberar mantendo a trava" caía sozinho numa
 * linha, colado na borda, e o Cancelar ficava ao lado do "Liberar e
 * destravar". LONGOS: o atalho `padding` com env() some no parser do jsdom.
 */
export function rodapeDaConfirmacao(celular: boolean): CSSProperties {
  if (!celular) return RODAPE_DA_CONFIRMACAO;
  return {
    display: "flex", flexDirection: "column-reverse", alignItems: "stretch", gap: 8, flexShrink: 0,
    paddingTop: 12, paddingLeft: 16, paddingRight: 16,
    paddingBottom: "calc(12px + env(safe-area-inset-bottom))",
    borderTop: `1px solid ${T.border}`,
  };
}

/** O corpo da confirmação no celular: menos margem lateral (a largura é pouca). */
export function corpoDaConfirmacao(celular: boolean): CSSProperties {
  return celular ? { ...CORPO_DA_CONFIRMACAO, padding: "4px 16px 16px" } : CORPO_DA_CONFIRMACAO;
}
