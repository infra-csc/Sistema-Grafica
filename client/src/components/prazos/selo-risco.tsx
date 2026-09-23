// Selo "RISCO" — markup ÚNICO do alarme mais forte da tela.
//
// Era escrito três vezes (card mobile, tabela desktop e card do quadro), com
// pequenas variações de espaçamento e uma delas sem o critério falado. O
// critério vive em RISCO_TITLE e aparece nos dois canais: `title` (mouse) e
// `sr-only` (teclado/leitor) — o alarme não pode depender do dispositivo de
// entrada. Contorno, não preenchimento: RISCO é projeção; o sólido fica para
// o dano já consumado.
//
// A FORMA é o <Selo> da casa (tamanho sm = 10px caixa-alta, que é o desenho
// que este selo já tinha); a cor é a do semáforo: fundo branco e contorno no
// vermelho de texto, para ler como projeção e não como dano.
//
// No card do quadro o selo vive dentro de um botão com `aria-label` (que
// substitui o conteúdo para o leitor); lá o critério entra no próprio
// aria-label e o sr-only daqui é simplesmente ignorado — inofensivo.
import { Selo } from "@/components/ui/selo";
import { RISCO_TITLE, TI } from "./tokens";

const CORES_RISCO = { bg: TI.card, text: TI.red, border: TI.red };

export function SeloRisco({ style }: { style?: React.CSSProperties }) {
  return (
    <Selo
      tamanho="sm"
      cores={CORES_RISCO}
      title={RISCO_TITLE}
      style={style}
    >
      risco
      <span className="sr-only"> — {RISCO_TITLE}</span>
    </Selo>
  );
}
