// ─────────────────────────────────────────────────────────────────────────────
// EVENTO FORA DE JOGO NO PAINEL GERAL — regra pura, testável, sem React.
//
// O ACHADO (dono, 14/08, olhando o Painel): "no Painel Geral não sinaliza o
// evento encerrado também". O caso concreto: o grupo do "SÓ QUERO PEDALAR SP"
// — encerrado À MÃO no dia 09/08 — exibia o chip "ATRASADO 8D · 66 PENDENTES"
// e mais nada. A tela cobrava, em vermelho, um evento que ninguém mais vai
// tocar: as peças já tinham saído das cinco filas de trabalho e da Gestão de
// Prazos. O único sinal que a tela dava sobre esse evento era falso.
//
// O REFINAMENTO (mesmo dia): "inclusive nas peças dos eventos tem que
// sinalizar, e acho que não precisa aparecer inicialmente, e pode ter um card
// também tipo 'evento com pendências'". Ou seja, além de dizer o que aconteceu,
// o Painel passa a ABRIR sem essas peças — com o caminho de volta sempre
// visível, no mesmo padrão das "entregues ocultas" da Gráfica.
//
// ONDE MORA CADA COISA, para não nascer um quarto vocabulário:
//   · O PREDICADO é `motivoEventoFinalizado` (@shared/prazo-dates) — o mesmo
//     que as filas e a Gestão de Prazos usam. Nada aqui redecide quem acabou.
//   · A FRASE DA PEÇA é `marcoEventoFinalizado` (lib/status) — a mesma que a
//     trilha da ficha mostra. Por isso o selo da LINHA diz "Evento encerrado",
//     começando pela palavra "Evento": quem lê a linha de uma peça precisa
//     saber, na mesma frase, que o que acabou não foi a peça.
//   · A FRASE DO EVENTO é a da lista de Eventos ("Encerrado manualmente",
//     "Realizado com pendências"), reproduzida aqui porque o CABEÇALHO DO
//     GRUPO no Painel é um evento, não uma peça — e as duas telas não podem
//     chamar o mesmo estado por nomes diferentes.
// ─────────────────────────────────────────────────────────────────────────────
import {
  marcoEventoFinalizado,
  motivoEventoFinalizado,
  type EventoFinalizadoMotivo,
  type EventoFinalizavel,
} from "@/lib/status";

/**
 * Cores do selo. Mesma disciplina de lib/status.ts — tint claro no fundo, tom
 * escuro 700/800 no TEXTO, saturado só na bolinha. Contrastes medidos:
 *
 *   encerrado #44403c sobre #f5f5f4 → 9,42:1 (e 9,36:1 sobre a zebra #f6f4f1)
 *   realizado #b45309 sobre #fffbeb → 4,84:1 (e 4,81:1 sobre o fundo #fafaf9)
 *
 * Os dois passam AA 4,5:1 nos 10px do selo. Nenhuma cor proibida da casa
 * (#f97316 / #a8a29e) entra como cor de texto.
 */
const SELO_PALETA = {
  encerrado: { bg: "#f5f5f4", border: "#e7e5e4", text: "#44403c", dot: "#78716c" },
  realizado: { bg: "#fffbeb", border: "#fde68a", text: "#b45309", dot: "#f59e0b" },
} as const satisfies Record<EventoFinalizadoMotivo, unknown>;

export interface SeloEventoFinalizado {
  motivo: EventoFinalizadoMotivo;
  /** Rótulo do CABEÇALHO DO GRUPO — a língua da lista de Eventos. */
  label: string;
  /** Versão curta do rótulo do evento (container estreito / cards). */
  short: string;
  /** Frase inteira do evento — `title` e leitor de tela. */
  hint: string;
  /** Rótulo da LINHA DA PEÇA — a língua das trilhas ("Evento encerrado"). */
  labelPeca: string;
  /** Frase inteira da peça — vem de `marcoEventoFinalizado`, sem cópia. */
  hintPeca: string;
  bg: string;
  border: string;
  text: string;
  dot: string;
}

/**
 * O selo de um evento fora de jogo — `null` enquanto ele ainda conta.
 *
 * `pendentes` só muda o rótulo do REALIZADO, e por um motivo específico: a
 * lista de Eventos distingue "Realizado com pendências" de um realizado que
 * não deixou nada para trás, e dizer "com pendências" onde não sobrou nada
 * seria inventar um passivo. No encerramento manual o rótulo não depende
 * disso: quem encerra encerra, tendo sobrado peça ou não.
 */
export function seloEventoFinalizado(
  event: EventoFinalizavel | null | undefined,
  hojeMs: number,
  pendentes: number,
): SeloEventoFinalizado | null {
  const motivo = motivoEventoFinalizado(event, hojeMs);
  if (motivo === null) return null;
  const marco = marcoEventoFinalizado(event, hojeMs)!;
  const pal = SELO_PALETA[motivo];

  if (motivo === "encerrado") {
    return {
      motivo,
      label: "Encerrado manualmente",
      short: "Encerrado",
      hint: pendentes > 0
        ? `Um administrador encerrou este evento — ${pendentes} ${pendentes === 1 ? "peça ficou" : "peças ficaram"} em aberto.`
          + " Elas não são mais cobradas e saíram das filas de trabalho; reabrir o evento traz o trabalho de volta."
        : "Um administrador encerrou este evento — ele saiu das filas de trabalho e da cobrança de prazos."
          + " Reabrir o evento traz o trabalho de volta.",
      labelPeca: marco.label,
      hintPeca: marco.hint,
      ...pal,
    };
  }

  return {
    motivo,
    // "Realizado SEM pendências" e não "Concluído": concluído, na lista de
    // Eventos, é o fim feliz (tudo entregue). Aqui só se sabe que nenhuma peça
    // está em status aberto — o que inclui cancelada. Afirmar o fim feliz com
    // esse dado seria dar boa notícia sem ter a informação.
    label: pendentes > 0 ? "Realizado com pendências" : "Realizado sem pendências",
    short: "Realizado",
    hint: pendentes > 0
      ? `A data deste evento já passou e ${pendentes} ${pendentes === 1 ? "peça ficou" : "peças ficaram"} em aberto.`
        + " Evento que já aconteceu não é mais cobrado. Não há autor nem volta: quem decide aqui é a data."
      : "A data deste evento já passou e não sobrou peça em aberto."
        + " Não há autor nem volta: quem decide aqui é a data.",
    labelPeca: marco.label,
    hintPeca: marco.hint,
    ...pal,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// O QUE FICOU OCULTO — o contrato do chip de reversão.
//
// A tela abre sem as peças de evento fora de jogo, e esconder dado sem dizer
// que está escondido é pior que o problema que a ocultação resolve. Este chip
// é PARTE da feature, não um extra: ele aparece sempre que houver algo oculto,
// inclusive com a lista cheia, e é o único caminho de volta.
// ─────────────────────────────────────────────────────────────────────────────

export interface ContagemOcultas {
  /** Peças em evento encerrado à mão (todas, inclusive as já terminadas). */
  encerrado: number;
  /** Peças em evento cuja data já passou. */
  realizado: number;
  /** Subconjunto de `encerrado` que ainda está em status aberto. */
  encerradoAberto: number;
  /** Subconjunto de `realizado` que ainda está em status aberto. */
  realizadoAberto: number;
}

export const CONTAGEM_OCULTAS_ZERO: ContagemOcultas = {
  encerrado: 0, realizado: 0, encerradoAberto: 0, realizadoAberto: 0,
};

export interface ChipOcultas {
  /** Peças fora da lista ao todo. */
  total: number;
  /** Quantas delas ainda estão em aberto — o passivo que o dono quer ver. */
  emAberto: number;
  /** Número em destaque no chip. */
  numero: number;
  /** Texto ao lado do número. */
  texto: string;
  /** Rótulo da ação (o chip é o botão que reverte). */
  acao: string;
  /** `title` — a composição inteira, que é o que o número sozinho não conta. */
  title: string;
  /** Frase para leitor de tela (o chip curto é ambíguo fora de contexto). */
  srLabel: string;
}

const pecas = (n: number) => `${n} ${n === 1 ? "peça" : "peças"}`;

/**
 * O chip "peças ocultas". `null` quando não há nada oculto — aí a tela não
 * mostra chip nenhum, porque não há o que reverter.
 *
 * O NÚMERO EM DESTAQUE é o das peças EM ABERTO quando existe alguma: é o
 * passivo, é o que o dono pediu para ver num card ("evento com pendências"), e
 * é o único dos dois números que significa trabalho que ficou para trás.
 * Quando não sobrou nada em aberto, o destaque cai para o total — senão o chip
 * anunciaria um zero e a ocultação viraria silenciosa justamente no caso em
 * que ninguém a questionaria.
 *
 * `mostrando` inverte só a AÇÃO: com as peças reveladas o chip continua na
 * tela (é ele que devolve o recorte limpo), agora oferecendo ocultar.
 */
export function chipOcultas(c: ContagemOcultas, mostrando: boolean): ChipOcultas | null {
  const total = c.encerrado + c.realizado;
  const emAberto = c.encerradoAberto + c.realizadoAberto;
  if (total <= 0) return null;

  // A composição por origem sempre aparece por extenso: "encerrado" é decisão
  // de gente e TEM VOLTA (reabrir), "realizado" é a data e não tem. Um número
  // só, sem a quebra, esconderia justamente a diferença que muda o que fazer.
  const partes: string[] = [];
  if (c.encerrado > 0) partes.push(`${pecas(c.encerrado)} em evento encerrado manualmente`);
  if (c.realizado > 0) partes.push(`${pecas(c.realizado)} em evento já realizado`);
  const composicao = partes.join(" e ");

  const destaqueAberto = emAberto > 0;
  const numero = destaqueAberto ? emAberto : total;
  const texto = destaqueAberto
    ? "em aberto em evento encerrado ou já realizado"
    : `${total === 1 ? "peça" : "peças"} de evento encerrado ou já realizado`;
  const acao = mostrando
    ? "ocultar"
    : destaqueAberto ? `mostrar as ${total} ocultas` : "mostrar";

  const title = `${composicao}. ${
    emAberto > 0
      ? `${emAberto} ${emAberto === 1 ? "ainda está" : "ainda estão"} em aberto — mas ninguém mais toca nesse trabalho: essas peças saíram das filas e da cobrança de prazos.`
      : "Nenhuma delas ficou em aberto."
  } ${mostrando ? "Clique para tirá-las da lista de novo." : "Clique para trazê-las para a lista."}`;

  return {
    total, emAberto, numero, texto, acao, title,
    srLabel: `${numero} ${texto}. ${title}`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// A SAÍDA DE EMERGÊNCIA DA BUSCA.
//
// O pior desfecho desta feature: alguém procura "#3089", não encontra, e
// conclui que a peça sumiu do sistema. Uma busca pelo CÓDIGO EXATO é intenção
// inequívoca de achar AQUELA peça — ela vence a ocultação, sempre.
//
// Só o código exato, de propósito. Busca por texto solto ("banner") continua
// respeitando o recorte: se qualquer palavra abrisse a ocultação, o recorte
// padrão viraria loteria e o usuário nunca entenderia por que às vezes o
// evento encerrado aparece.
// ─────────────────────────────────────────────────────────────────────────────

/** A busca é o código EXATO desta peça? Ignora caixa, espaços e o "#" da frente. */
export function buscaEhCodigoDaPeca(
  displayId: string | null | undefined,
  termo: string,
): boolean {
  if (!displayId) return false;
  const normaliza = (s: string) => s.trim().toLowerCase().replace(/^#/, "");
  const t = normaliza(termo);
  if (t === "") return false;
  return normaliza(displayId) === t;
}
