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
