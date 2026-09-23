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
