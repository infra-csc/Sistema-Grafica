// A pele da fila da Gráfica: a família laranja do complemento, a cor da ação
// por etapa, o fundo da linha e o chip de quantidade do cartão do celular.
import type React from "react";
import { FS, FW, R, T, TOM } from "@/lib/theme";
import type { PecaDaFila } from "@/components/grafica/tipos";
import { complementOpen } from "./regras";

// ─────────────────────────────────────────────────────────────────────────────
// COMPLEMENTO — aumento de quantidade DEPOIS que a peça entrou em produção.
//
// A peça original nunca muda: a diferença nasce como peça-filha (#0062-C1),
// com quantidade, ciclo de produção, conferência, entrega e ativos próprios.
// Nesta tela isso precisa gritar — é trabalho NOVO numa fila que o operador já
// tinha dado por fechada, e o número da linha já é exatamente o que falta
// imprimir (a Gráfica não faz conta).
//
// Tokens da família laranja (TOM.laranja = P.orange), nada inventado.
// Regra da casa respeitada: T.accent entra só como faixa/bolinha (fundo), nunca
// como cor de TEXTO; T.accentText aparece como texto sobre tint claro (4.96:1)
// e como fundo sólido com texto branco (5.18:1 — AA em 10px/800).
// ─────────────────────────────────────────────────────────────────────────────
export const CO = {
  solidBg: T.accentText, solidText: T.surface,
  // hoverBg é o ÚNICO degrau sem token (orange-100): fica entre o bg e a borda
  // de propósito — é ele que separa "selecionada" de "complemento" na linha.
  bg: TOM.laranja.bg, hoverBg: "#ffedd5", border: TOM.laranja.border,
  text: T.accentText,        // 4.96:1 sobre TOM.laranja.bg — AA
  // O texto do motivo do complemento: o mesmo laranja legível da família
  // (accentText já passa AA no tint).
  textStrong: T.accentText,
  stripe: T.accent,          // SÓ fundo/faixa
  suffix: T.accentText,      // o "-C1" dentro do displayId
  connector: TOM.laranja.border, // conector em L (traço, não texto)
};

/**
 * A AÇÃO NA COR DA ETAPA, por cima do <Botao>. O botão da linha diz a etapa
 * pela cor (Conferir ciano, Embalar/Entregar azul, complemento laranja) — é a
 * regra do dono que a fila inteira segue. O Botao dá forma, foco, hover e
 * spinner; estes dois só trocam a tinta. Os tons são AA com branco (sólido)
 * ou sobre o próprio bg (tintado).
 */
export const corDaAcao = (cor: string): React.CSSProperties => ({ backgroundColor: cor, border: `1px solid ${cor}`, color: T.surface });
export const corTintada = (tom: { bg: string; border: string; text: string }): React.CSSProperties => ({ backgroundColor: tom.bg, border: `1px solid ${tom.border}`, color: tom.text });

/**
 * Fundo da linha da tabela — UMA função para as três mãos (style inicial,
 * onMouseEnter e onMouseLeave): se cada uma decidisse a cor, passar o mouse
 * por cima apagaria qualquer realce que não estivesse repetido nas três.
 * Precedência: RECÉM-CRIADO > seleção em lote > complemento em aberto >
 * reaproveitado. A seleção usa #ffedd5 justamente para não empatar com o
 * fundo do complemento.
 *
 * `isNovo` é o realce de 5 s da peça que acabou de nascer nesta sessão: ele
 * vem primeiro porque é o único que responde a "cadê o que eu acabei de criar?".
 */
export const rowBg = (item: PecaDaFila, isSelected: boolean, hover: boolean, isNovo = false) => {
  if (isNovo) return hover ? CO.border : CO.hoverBg;
  if (isSelected) return hover ? CO.border : CO.hoverBg;
  if (complementOpen(item)) return hover ? CO.hoverBg : CO.bg;
  // Hover do reaproveitado: green-100, o degrau ENTRE o bg e a borda do
  // TOM.sucesso — sem token de propósito (a borda seria forte demais na linha).
  if (item?.isReuse) return hover ? "#dcfce7" : TOM.sucesso.bg;
  // Branco explícito (e não ""): a célula de Ações é `position: sticky` e herda
  // esta cor com `background: inherit`. Fundo transparente deixaria o conteúdo
  // rolando por baixo dela — sticky só existe se a célula for opaca.
  return hover ? T.bg : T.surface;
};

// Chip de quantidade do card mobile (reaproveitado/produzido/conferido/
// entregue). Tons 700 sobre fundo claro (AA). 12px, não 10: é o card do
// celular, lido de braço esticado no galpão — "PROD. 5" em 10px virava mancha.
export const qtyChip = (color: string, bg: string): React.CSSProperties => ({
  fontSize: FS.meta, fontWeight: FW.rotulo, color, backgroundColor: bg,
  border: `1px solid ${color}33`, borderRadius: R.sm, padding: "1px 6px",
  whiteSpace: "nowrap",
});
