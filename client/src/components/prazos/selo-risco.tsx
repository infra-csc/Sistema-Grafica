// Selo "RISCO" — markup ÚNICO do alarme mais forte da tela.
//
// Era escrito três vezes (card mobile, tabela desktop e card do quadro), com
// pequenas variações de espaçamento e uma delas sem o critério falado. O
// critério vive em RISCO_TITLE e aparece nos dois canais: `title` (mouse) e
// `sr-only` (teclado/leitor) — o alarme não pode depender do dispositivo de
// entrada. Contorno, não preenchimento: RISCO é projeção; o sólido fica para
// o dano já consumado.
//
// No card do quadro o selo vive dentro de um botão com `aria-label` (que
// substitui o conteúdo para o leitor); lá o critério entra no próprio
// aria-label e o sr-only daqui é simplesmente ignorado — inofensivo.
import { R, RISCO_TITLE, TI } from "./tokens";

export function SeloRisco({ style }: { style?: React.CSSProperties }) {
  return (
    <span
      title={RISCO_TITLE}
      style={{
        padding: "2px 8px", borderRadius: R.pill, backgroundColor: TI.card,
        border: `1px solid ${TI.red}`, color: TI.red,
        fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      risco
      <span className="sr-only"> — {RISCO_TITLE}</span>
    </span>
  );
}
