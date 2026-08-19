/**
 * REPARO DOS MOTIVOS QUE PERDERAM A LETRA "S".
 *
 * O DEFEITO. Entre 17/08 e 19/08 o leitor de motivo do servidor rodou com a
 * classe de espaço em branco SEM a barra invertida, o que a transformou na
 * letra "s" literal. Todo motivo de devolução escrito nessa janela perdeu os
 * "s" minúsculos, trocados por espaço.
 *
 * ONDE O "S" DEIXOU RASTRO. A troca foi por UM espaço, e o texto original já
 * tinha os espaços dele. Onde o "s" estava colado a um espaço sobraram DOIS
 * espaços seguidos — ali é certo que havia um "s".
 *
 * MAS O LADO É AMBÍGUO, e essa é a parte que engana:
 *
 *   "mais vivo"  →  "mai" + " " + " vivo"  =  "mai  vivo"   (s à ESQUERDA)
 *   "que seja"   →  "que" + " " + " eja"   =  "que  eja"    (s à DIREITA)
 *
 * O par de espaços diz que havia um "s"; não diz de que lado. A reconstrução
 * usa um desempate por vocabulário: se a palavra da direita vira uma palavra
 * comum do português ao receber o "s", ele vai para a direita; senão vai para a
 * esquerda, que é o caso mais frequente (plural e verbo).
 *
 * É HEURÍSTICA, e é por isso que a ferramenta que usa este módulo mostra o
 * antes e o depois e só grava quando alguém manda.
 *
 * O "s" no MEIO da palavra ("desbotada", "precisamos") virou espaço simples,
 * indistinguível de um espaço de verdade — esse não é reconstruído. Inventar
 * letra dentro de uma instrução de refação de arte é pior que deixar o buraco
 * à vista: o buraco alguém percebe e pergunta; a palavra errada alguém obedece.
 */

/**
 * Palavras comuns do português que COMEÇAM com "s". Curta de propósito: existe
 * para desempatar o lado do espaço duplo, não para corrigir texto.
 */
const PALAVRAS_COM_S = [
  "se", "seja", "sejam", "sem", "sempre", "senão", "ser", "será", "seria",
  "seu", "seus", "sua", "suas", "só", "sobre", "sob", "salvo", "segue",
  "seguir", "segundo", "sendo", "sido", "sim", "simples", "sistema", "site",
  "solicitação", "solicitante", "saída", "sangria", "somente",
];

const semAcentoBaixo = (p: string) =>
  p.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

const COMECAM_SEM_ACENTO = new Set(PALAVRAS_COM_S.map(semAcentoBaixo));

/**
 * Devolve um "s" a cada par de espaços, escolhendo o lado por vocabulário.
 *
 * Só espaço HORIZONTAL: a classe errada nunca casou com quebra de linha, então
 * dois "\n" seguidos são do texto original e ficam de fora.
 */
export function repararMotivoSemS(texto: string): string {
  return texto
    .replace(/(\S*) {2}(\S*)/g, (_todo: string, esq: string, dir: string) => {
      const candidataDireita = semAcentoBaixo("s" + dir.replace(/^[^\wÀ-ÿ]+/, ""));
      return COMECAM_SEM_ACENTO.has(candidataDireita)
        ? `${esq} s${dir}`
        : `${esq}s ${dir}`;
    })
    .replace(/ +$/gm, "");
}

/**
 * A ASSINATURA DO DANO: nenhum "s" minúsculo, mais um segundo sinal.
 *
 * "s" é uma das letras mais comuns do português, então a ausência já é forte —
 * mas sozinha ela acusa frases curtas legítimas ("Cor errada" não tem nenhum e
 * está perfeita). O espaço duplo é o confirmador; o comprimento cobre o texto
 * longo em que o "s" caiu todo no meio de palavra.
 */
export function pareceMotivoDanificado(texto: string): boolean {
  if (/s/.test(texto)) return false;
  return / {2}/.test(texto) || texto.trim().length >= 25;
}

/**
 * O que sobra de suspeito depois do reparo: pares de palavras que viram uma
 * palavra plausível se um "s" for devolvido no meio. Serve para o olho humano
 * decidir — a ferramenta não grava nada disto.
 */
export function suspeitasDeSNoMeio(texto: string): string[] {
  const fora: string[] = [];
  const re = /([A-Za-zÀ-ÿ]{2,}) ([a-zà-ÿ]{1,8})(?=[\s.,;:!?)]|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto)) !== null) {
    fora.push(`${m[1]} ${m[2]} → ${m[1]}s${m[2]}?`);
  }
  return fora;
}

/**
 * Correções revisadas para os textos que foram efetivamente gravados durante
 * o incidente de 17–19/08. Diferente da heurística acima, este catálogo
 * corrige também o "s" perdido NO MEIO de palavras, mas só quando o texto
 * inteiro é uma correspondência exata já conferida por uma pessoa.
 *
 * Isso é deliberadamente fechado: uma frase nova ou diferente não pode ser
 * "corrigida" por aproximação e acabar reescrita com uma instrução errada.
 */
const CORRECOES_REVISADAS = new Map<string, string>([
  [
    "A cor do logo parece de botada, o roxo é bem mai  vivo - preci amo  garantir que ele  eja Core Purple (#8D0DE3 | RGB: 141, 13, 227 | CMYK: 68 76 0 2 | Pantone Uncoated: 266 U | Pantone Coated: 266 C)",
    "A cor do logo parece desbotada, o roxo é bem mais vivo - precisamos garantir que ele seja Core Purple (#8D0DE3 | RGB: 141, 13, 227 | CMYK: 68 76 0 2 | Pantone Uncoated: 266 U | Pantone Coated: 266 C)",
  ],
  [
    "Seguem o  aju te  nece ário :\n•\tNa  peça  onde con ta a chancela 'Patrocínio',  ub tituir por 'Realização'. \n•\tE paço Bem-e tar: recuar um pouco a ilu tração para mantê-la mai  afa tada da logomarca.\n•\tE tande local: falta informar o nome (enviaremo  a arte pronta)\n•\tPeça  balcão: conforme demai  etapa , não teremo  e ta peça, certo?",
    "Seguem os ajustes necessários :\n•\tNas peças onde consta a chancela 'Patrocínio', substituir por 'Realização'. \n•\tEspaço Bem-estar: recuar um pouco a ilustração para mantê-la mais afastada da logomarca.\n•\tEstande local: falta informar o nome (enviaremos a arte pronta)\n•\tPeças balcão: conforme demais etapas, não teremos esta peça, certo?",
  ],
  [
    "acho que veio duplicado a  olicitação",
    "acho que veio duplicado a solicitação",
  ],
  [
    " ão  ó 5..",
    "são só 5..",
  ],
]);

/**
 * Devolve somente uma correção previamente revisada, ou `null` quando o texto
 * não pertence ao conjunto confirmado. Quem chama deve deixar os demais
 * registros intactos.
 */
export function correcaoRevisadaMotivoSemS(texto: string): string | null {
  return CORRECOES_REVISADAS.get(texto) ?? null;
}