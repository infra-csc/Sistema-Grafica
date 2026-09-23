// ─────────────────────────────────────────────────────────────────────────────
// O RELÓGIO DA FILA — "agora", que muda a cada virada de minuto.
//
// A linha e o cartão da Revisão são memoizados (dezenas de peças, e digitar na
// busca não pode redesenhar todas). Só que dois selos dependem da HORA, não da
// peça: "Travada · há 5 min" e o dia do prazo do molde. Lendo `Date.now()` lá
// dentro, eles congelavam no valor do último desenho — a trava de 5 min seguia
// dizendo "há 5 min" meia hora depois, e o prazo não virava à meia-noite.
//
// A página lê este relógio e o passa como PROP: a memoização continua valendo
// para tudo o que muda por peça, e uma vez por minuto (não a cada tecla) as
// linhas redesenham com o tempo certo. O timer se alinha à virada do minuto,
// para "há 1 min" não aparecer 59 s atrasado.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from "react";

const MINUTO = 60_000;

/** `Date.now()` lido ao montar e de novo a cada virada de minuto do relógio. */
export function useRelogioDoMinuto(): number {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const agendar = () => {
      const falta = MINUTO - (Date.now() % MINUTO);
      timer = setTimeout(() => {
        setAgora(Date.now());
        agendar();
      }, falta);
    };
    agendar();
    return () => clearTimeout(timer);
  }, []);
  return agora;
}
