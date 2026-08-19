/**
 * REPARO DOS MOTIVOS QUE PERDERAM A LETRA "S".
 *
 * O DEFEITO. Entre 17/08 e 19/08 o leitor de motivo do servidor rodou com a
 * classe de espaço em branco SEM a barra invertida, o que a transformou na
 * letra "s" literal. Todo motivo escrito nessa janela perdeu os "s" minúsculos:
 * cada corrida deles virou UM espaço.
 *
 * POR QUE NÃO É RESTAURAÇÃO. O texto foi gravado já mastigado em quatro
 * lugares, todos a partir do mesmo valor — não existe cópia limpa. E a troca
 * apagou até a CONTAGEM: o "ss" de "necessário" virou um espaço só, igual ao
 * "s" de "mais".
 *
 * AS DUAS EVIDÊNCIAS QUE SOBRARAM:
 *
 *   1. O TAMANHO DO ESPAÇO. A troca foi por um espaço e o texto já tinha os
 *      espaços dele, então DOIS espaços seguidos significam que havia um "s"
 *      ali — certeza. Um espaço só é ambíguo: pode ser espaço de verdade.
 *
 *   2. O VOCABULÁRIO DO PRÓPRIO BANCO. Os motivos escritos fora da janela do
 *      defeito estão intactos. Se "substituir" aparece inteiro em outro motivo,
 *      então "ub tituir" não é chute — é a mesma palavra com o rastro do corte.
 *      O léxico é do domínio, não de fora.
 *
 * COMO A RECONSTRUÇÃO ANDA. Uma varredura da esquerda para a direita que, a
 * cada espaço, decide entre COLAR (o espaço era um "s") e SEPARAR (era espaço
 * mesmo). Colar só quando o resultado é começo de alguma palavra que o banco já
 * escreveu — é o que faz "aju"+"te" virar "ajuste" e depois "ajustes".
 *
 * DUAS ARMADILHAS QUE ISTO EVITA, e que a primeira versão caiu nas duas:
 *
 *   • parear palavras de duas em duas com regex CONSOME os tokens: em
 *     "onde con ta", depois de olhar "onde con" o par seguinte vira "ta a" e
 *     "con ta" nunca é testado. Por isso a varredura é sequencial.
 *
 *   • no espaço duplo, o "s" pode ser do lado esquerdo ("mai  vivo" → "mais
 *     vivo") ou do direito ("que  eja" → "que seja"). Decidir só por palavra
 *     COMPLETA erra em "',  ub tituir": "sub" não é palavra, mas é começo de
 *     "substituir". Por isso o teste é de PREFIXO.
 *
 * O QUE ELE NÃO FAZ. Onde o vocabulário não fecha, o espaço FICA como está e o
 * trecho é reportado. Inventar letra dentro de uma instrução de refação de arte
 * é pior que deixar a falha à vista: o buraco alguém percebe e pergunta; a
 * palavra errada alguém obedece.
 */

/** Desempate mínimo quando o banco não tem opinião. */
const PALAVRAS_COM_S = [
  "se", "seja", "sejam", "sem", "sempre", "senão", "ser", "será", "seria",
  "seu", "seus", "sua", "suas", "só", "sobre", "sob", "salvo", "segue",
  "seguir", "segundo", "sendo", "sido", "sim", "simples", "sistema", "site",
  "solicitação", "solicitante", "saída", "sangria", "somente", "esta", "este",
  "isso", "esse", "essa", "nos", "nas", "dos", "das", "mais", "mas", "os", "as",
];

const baixa = (p: string) => p.toLowerCase().normalize("NFC");
/** Só o miolo alfanumérico — a pontuação das pontas não entra na consulta. */
const miolo = (p: string) => p.replace(/^[^0-9A-Za-zÀ-ÿ]+|[^0-9A-Za-zÀ-ÿ]+$/g, "");
const chave = (p: string) => baixa(miolo(p));

export interface Lexico {
  palavras: Set<string>;
  prefixos: Set<string>;
}

/**
 * Monta o vocabulário a partir dos textos ÍNTEGROS do próprio banco.
 *
 * Guarda as palavras inteiras E todos os começos delas: colar dois pedaços só
 * é seguro quando o resultado ainda pode virar palavra, e no meio da varredura
 * ele quase nunca está completo ("ajuste" antes de virar "ajustes").
 */
export function montarLexico(textosIntegros: string[]): Lexico {
  const palavras = new Set<string>();
  for (const t of [...textosIntegros, PALAVRAS_COM_S.join(" ")]) {
    for (const bruto of t.split(/\s+/)) {
      const p = chave(bruto);
      if (p.length >= 2 && p.indexOf("s") >= 0) palavras.add(p);
    }
  }
  const prefixos = new Set<string>();
  palavras.forEach(p => {
    for (let i = 2; i <= p.length; i++) prefixos.add(p.slice(0, i));
  });
  return { palavras, prefixos };
}

const ehPalavra = (lex: Lexico, s: string) => lex.palavras.has(chave(s));
const ehComeco = (lex: Lexico, s: string) => {
  const k = chave(s);
  return k.length >= 2 && lex.prefixos.has(k);
};

/**
 * A reconstrução. Varre da esquerda para a direita decidindo, a cada espaço,
 * entre colar e separar.
 */
export function repararMotivoSemS(texto: string, lex?: Lexico): string {
  const L = lex ?? montarLexico([]);
  // `split` com grupo capturante devolve [pedaço, espaços, pedaço, espaços, …].
  const partes = texto.split(/( +)/);
  if (partes.length < 3) return texto;

  let saida = "";
  let atual = partes[0];

  for (let k = 1; k < partes.length; k += 2) {
    const certo = partes[k].length >= 2;   // dois espaços = havia um "s" aqui
    const prox = partes[k + 1] ?? "";

    if (certo) {
      // O "s" existe; falta saber de que lado. Palavra completa ganha de
      // começo de palavra, e a esquerda é o desempate (plural e verbo).
      const esquerda = atual + "s";
      const direita = "s" + prox;
      const vaiDireita =
        (ehPalavra(L, direita) && !ehPalavra(L, esquerda)) ||
        (ehComeco(L, direita) && !ehComeco(L, esquerda));
      if (vaiDireita) { saida += atual + " "; atual = direita; }
      else { saida += esquerda + " "; atual = prox; }
      continue;
    }

    // Espaço simples: só cola se o vocabulário confirmar. "ss" porque a corrida
    // de dois "s" virou um espaço só, igual à de um.
    //
    // E só entre pedaços que TÊM letra: a consulta descarta a pontuação das
    // pontas, então o marcador "•" sozinho vira string vazia e "•sE" passaria
    // por "se" — colando o bullet na palavra seguinte.
    if (chave(atual).length === 0 || chave(prox).length === 0) {
      saida += atual + " ";
      atual = prox;
      continue;
    }
    const comUm = atual + "s" + prox;
    const comDois = atual + "ss" + prox;
    if (ehPalavra(L, comUm) || ehComeco(L, comUm)) { atual = comUm; continue; }
    if (ehPalavra(L, comDois) || ehComeco(L, comDois)) { atual = comDois; continue; }
    saida += atual + " ";
    atual = prox;
  }

  return (saida + atual).replace(/ +$/gm, "");
}

/**
 * A ASSINATURA DO DANO: nenhum "s" minúsculo, mais um segundo sinal.
 *
 * "s" é uma das letras mais comuns do português, então a ausência já é forte —
 * mas sozinha ela acusa frases curtas legítimas ("Cor errada" não tem nenhum e
 * está perfeita). O espaço duplo confirma; o comprimento cobre o texto longo em
 * que o "s" caiu todo no meio de palavra.
 */
export function pareceMotivoDanificado(texto: string): boolean {
  if (/s/.test(texto)) return false;
  return / {2}/.test(texto) || texto.trim().length >= 25;
}

/**
 * O que continua sem fechar depois do reparo: pedaços que o vocabulário não
 * reconhece e que também não têm "s" — o rastro típico de um corte que não deu
 * para reconstruir. É lista para olho humano, não para gravar.
 */
/**
 * NÃO EXISTE SINAL AUTOMÁTICO DE 'ainda está quebrado'.
 *
 * A assinatura do dano é a ausência de "s" — e ela deixa de valer assim que
 * o reparo repõe UM "s", mesmo que o resto do texto continue cortado. Quem
 * julga o resultado é a pessoa que lê o antes e o depois na ferramenta; é
 * por isso que ela lista por padrão e só grava quando mandam.
 *
 * Esta função sobrou como AJUDA de leitura: aponta pares de pedaços que o
 * vocabulário não reconhece. Tem ruído — o léxico só guarda palavras com
 * "s", então qualquer par sem "s" cai na lista.
 */
export function buracosRestantes(texto: string, lex: Lexico): string[] {
  const fora: string[] = [];
  const pedacos = texto.split(/\s+/);
  for (let i = 0; i < pedacos.length - 1; i++) {
    const a = pedacos[i], b = pedacos[i + 1];
    if (!a || !b) continue;
    const semS = !/s/.test(chave(a)) && !/s/.test(chave(b));
    const desconhecidos = !ehPalavra(lex, a) && !ehPalavra(lex, b);
    if (semS && desconhecidos && chave(a).length >= 2 && chave(b).length >= 2) {
      fora.push(`${a} ${b}`);
    }
  }
  return fora;
}
