// Tokens, estilos e helpers PUROS da Gestão de Prazos.
//
// PORQUÊ ESTE ARQUIVO. A tela declarava um `const TI = {...}` local e não
// importava nada de `@/lib/theme`. Copiar a paleta em vez de importá-la foi o
// mecanismo que reintroduziu um contraste reprovado: o cinza local #78716c
// mede 4,40:1 sobre #f5f5f4 e o próprio theme.ts documenta esse tom como
// APOSENTADO por isso. Aqui o `TI` é DERIVADO do theme — mudou lá, muda aqui,
// sem uma segunda cópia livre para divergir.
//
// Também mora aqui tudo o que os componentes de `components/prazos/*` e a
// página compartilham e que não depende de React: mapa de setores, régua de
// cores, formatação de data e o tradutor de erro de API.
import { TAB_STATUSES } from "@/lib/arte-rules";
import { T, R, SHADOW } from "@/lib/theme";
import { toUTCDisplayDate } from "@/lib/utils";
import type { PrazoEvent, PrazoPendingSponsor, StageState } from "@shared/prazos-contract";

export { R, SHADOW, T };

// ─── Paleta ──────────────────────────────────────────────────────────────────
export const TI = {
  bg: T.bg,
  card: T.surface,
  border: T.border,
  title: T.text,
  secondary: T.second,
  /**
   * `label` e `secondary` apontam de propósito para o MESMO token. O tom
   * separado que existia aqui (#78716c, "texto ainda mais apagado") é
   * justamente o que reprova AA sobre as superfícies acinzentadas do app.
   * Quem precisar de menos peso deve baixar o peso da fonte, não o contraste.
   */
  label: T.second,
  idle: T.bdark,
  ink: T.dark,
  /** Laranja em papel de TEXTO. O #9a3412 espalhado pela tela era dialeto local. */
  accentText: T.accentText,
  /**
   * Texto de apoio com PESO — um degrau acima de `secondary`, para o que é
   * conteúdo (data da saída, descrição da peça, rótulo de botão neutro) e não
   * metadado. Era o `#57534e` solto em oito lugares da tela; fica local porque
   * o theme não tem esse degrau, exatamente como os semânticos abaixo.
   * 7,5:1 sobre branco e 7,1:1 sobre `chipBg`.
   */
  strong: "#57534e",
  /** Superfície neutra de chip — o "cinza claro" da casa. */
  chipBg: "#f5f5f4",
  /** Divisor interno de tabela (mais forte que o `track`, invisível sobre branco). */
  rule: "#e7e5e4",
  /**
   * Trilho/vazio: fundo de barra de progresso, bloco de skeleton, coluna zero
   * do gráfico de dias e divisor mais fino do drill. Estava escrito à mão em
   * quatro arquivos — e é justamente o tipo de tom que alguém "ajusta" num só
   * lugar e faz a barra do card divergir da barra da tabela.
   */
  track: "#f0efee",
  /** Superfície do que está ABERTO dentro de uma tabela (linha de drill). */
  sunken: "#fcfcfb",
  // Semânticos: único bloco que o theme não cobre e que continua local.
  red: "#b91c1c", redBg: "#fef2f2", redEdge: "#fca5a5",
  /** Tinta de LINHA (não de chip): quase branca, para não competir com o chip. */
  redRow: "#fffafa",
  amber: "#b45309", amberBg: "#fffbeb", amberEdge: "#fde68a",
  /** Realce de ~1,2s no card que acabou de mudar de coluna. */
  amberRow: "#fffdf5",
  green: "#15803d", greenBg: "#f0fdf4",
};

// Aparência de cada estado do semáforo. O texto acompanha a cor, mas o
// SÍMBOLO também muda (✓ / ! / nº) — atraso não pode depender só de cor.
export const STAGE_STYLE: Record<StageState, { dot: string; bg: string; text: string }> = {
  done:     { dot: TI.green, bg: TI.greenBg, text: TI.green },
  warning:  { dot: TI.amber, bg: TI.amberBg, text: TI.amber },
  overdue:  { dot: TI.red,   bg: TI.redBg,   text: TI.red },
  upcoming: { dot: TI.idle,  bg: "transparent", text: TI.secondary },
};

/**
 * Legenda da mini-trilha de 5 pontos do card do quadro.
 *
 * A legenda do semáforo só aparecia na TABELA, mas o card da visão PADRÃO
 * desenha as mesmas quatro cores em pontos de 6px — a gramática existia
 * escrita justamente na visão que quase ninguém abre. Deriva de
 * `STAGE_STYLE` para não virar uma quinta cópia das cores.
 */
export const LEGENDA_TRILHA: { cor: string; texto: string }[] = [
  { cor: STAGE_STYLE.done.dot, texto: "concluída" },
  { cor: STAGE_STYLE.warning.dot, texto: "vence agora" },
  { cor: STAGE_STYLE.overdue.dot, texto: "vencida" },
  { cor: STAGE_STYLE.upcoming.dot, texto: "prevista" },
];

// Para cada etapa, o setor que destrava e a tela onde se age.
// listaImagens aponta para o detalhe do evento (peças nascem lá).
//
// `base` é BASE de caminho, nunca o href final: quem navega chama um dos
// construtores de `urlSetor*` abaixo. O campo chamava-se `url` e era colado
// cru num `href` — foi esse nome que fez a tela prometer "Resolver em Arte →"
// para UMA peça e entregar a fila inteira da Arte, com 1.112 peças dentro.
export const STAGE_SECTOR: Record<string, {
  sector: string;
  /** Caminho da tela do setor. `null` = a peça se resolve no próprio evento. */
  base: string | null;
  /** Aba da Arte (`?fase=`) em que as peças DESTA etapa vivem. */
  fase?: string;
}> = {
  listaImagens: { sector: "Solicitação", base: null }, // null = detalhe do evento
  layouts:      { sector: "Arte",        base: "/arte", fase: "criar-aprovacoes" },
  aprovacao:    { sector: "Atendimento", base: "/atendimento" },
  // Finalizacao e a Arte anexando o arquivo final — mesmo setor de layouts,
  // outra aba: lá a peça já voltou aprovada e o que falta é o arquivo final.
  finalizacao:  { sector: "Arte",        base: "/arte", fase: "finalizar-layouts" },
  revisao:      { sector: "Revisão",     base: "/solicitacao" },
  producao:     { sector: "Gráfica",     base: "/grafica" },
};

// ─── ATALHOS: para onde cada link desta tela leva ────────────────────────────
//
// O CONTRATO DE PARÂMETRO É `?item=<uuid da peça>`.
//
// PORQUÊ `item` E NÃO `peca`. Duas telas do app já recebem uma peça pela URL:
// o Detalhe do Evento (`/eventos/:id?item=`, que abre a ficha) e a Gráfica
// (`/grafica?item=`, o deep link do sino). O Painel Geral usa `?peca=`, mas o
// Painel não é destino de nenhum link daqui. Entre os dois nomes que já
// existem, `item` é o que vale nos destinos que ESTA tela usa — e inventar um
// terceiro nome seria criar a terceira gramática de deep link do mesmo app.
//
// PARÂMETROS SECUNDÁRIOS. Cada um já é LIDO hoje pela tela em que é usado, e
// por isso o link é específico agora e não só depois:
//   • `fase=<aba>`        — Arte (`parseArteFilters`, lib/arte-rules.ts)
//   • `busca=<displayId>` — Arte e Revisão casam displayId na busca
//   • `evento=<id>`       — Arte, Gráfica e Revisão (CSV de ids)
//   • `atrasados=1`       — Atendimento (recorte "passou do marco de Aprovação")
//
// A GRÁFICA RECEBE `item` SOZINHO, de propósito: o efeito dela resolve o uuid
// para o displayId e escreve a busca por conta própria; um `busca=` nosso
// seria sobrescrito — e, quando o uuid não estivesse no cache, sobrescrito
// pelo PRÓPRIO uuid, que não acha nada. Mandar menos, aqui, acerta mais.
//
// O QUE FALTA (especificado para as telas de destino, não implementável daqui):
// `arte.tsx`, `atendimento.tsx` e `solicitacao.tsx` ainda não leem `?item=`.
// Até lá o link chega no recorte mais estreito que cada uma sabe aplicar —
// nunca na fila inteira — e o `item` viaja junto, pronto para ser consumido.

/** O que a Gestão de Prazos sabe de uma peça na hora de montar um link. */
export interface AlvoPeca {
  eventId: string;
  itemId: string;
  displayId: string;
  /** Status da peça — é dele que sai a ABA da Arte. */
  status: string;
  /** O prazo que mede a peça já venceu (liga o `?atrasados=1`). */
  atrasada?: boolean;
}

/**
 * A peça aberta no evento — o único destino do app que HOJE abre a ficha de
 * uma peça a partir de um link (event-detail consome o `?item=` e abre o
 * dialog). É o piso de especificidade de todo link de peça desta tela.
 */
export function urlPecaNoEvento(eventId: string, itemId: string): string {
  return `/eventos/${eventId}?item=${encodeURIComponent(itemId)}`;
}

/**
 * Aba da Arte em que uma peça com este status aparece.
 *
 * Deriva de `TAB_STATUSES` (lib/arte-rules.ts), a fonte única de status→aba da
 * própria tela de Arte: uma segunda tabela aqui seria a cópia que diverge no
 * dia em que a Arte ganhar uma aba. A ordem de `Object.entries` segue a de
 * declaração — as abas específicas primeiro, `finalizados` (que é o balaio
 * largo) por último.
 */
export function faseDaArte(status: string): string | null {
  for (const [aba, statuses] of Object.entries(TAB_STATUSES)) {
    if (statuses.includes(status)) return aba;
  }
  return null;
}

/**
 * Onde uma PEÇA específica se resolve. É o href de "Resolver em {setor} →"
 * numa linha de peça.
 *
 * Etapa sem tela de setor (Lista de Imagens) cai no evento com a ficha aberta:
 * é o destino mais específico que existe para ela, e não uma listagem.
 */
export function urlSetorDaPeca(stageKey: string, alvo: AlvoPeca): string {
  const base = STAGE_SECTOR[stageKey]?.base;
  if (!base) return urlPecaNoEvento(alvo.eventId, alvo.itemId);
  const p = new URLSearchParams();
  p.set("item", alvo.itemId);
  if (base === "/arte") {
    const fase = faseDaArte(alvo.status);
    if (fase) p.set("fase", fase);
    p.set("busca", alvo.displayId);
    p.set("evento", alvo.eventId);
  } else if (base === "/solicitacao") {
    p.set("busca", alvo.displayId);
  } else if (base === "/atendimento" && alvo.atrasada) {
    p.set("atrasados", "1");
  }
  return `${base}?${p.toString()}`;
}

/**
 * Onde as peças de UM evento numa UMA etapa se resolvem — o href do cabeçalho
 * de grupo do drill, que cobre N peças de uma vez. Não é link de peça: o grão
 * certo aqui é evento + etapa, e é o que a URL carrega.
 */
export function urlSetorDoEvento(
  stageKey: string,
  eventId: string,
  opts: { atrasada?: boolean } = {},
): string {
  const alvo = STAGE_SECTOR[stageKey];
  if (!alvo?.base) return `/eventos/${eventId}`;
  const p = new URLSearchParams();
  if (alvo.fase) p.set("fase", alvo.fase);
  // A Revisão entrou nesta lista quando passou a ler `?evento=` (CSV de ids,
  // as mesmas chaves da Arte e da Gráfica). Antes dela o link daqui era um
  // href honesto para a fila inteira; agora seria estreitar de menos.
  if (alvo.base === "/arte" || alvo.base === "/grafica" || alvo.base === "/solicitacao") {
    p.set("evento", eventId);
  }
  if (alvo.base === "/atendimento" && opts.atrasada) p.set("atrasados", "1");
  const qs = p.toString();
  return qs ? `${alvo.base}?${qs}` : alvo.base;
}

/**
 * A tela do setor sem recorte de evento nem de peça — o href do card da faixa
 * de análise, que conta o conjunto COMPLETO e por isso não tem um evento para
 * citar. Mesmo aqui o link é mais estreito que a fila: a etapa vira `?fase=`.
 *
 * `null` quando a etapa não tem tela própria; quem chama decide o texto.
 */
export function urlSetor(stageKey: string): string | null {
  const alvo = STAGE_SECTOR[stageKey];
  if (!alvo?.base) return null;
  return alvo.fase ? `${alvo.base}?fase=${alvo.fase}` : alvo.base;
}

export const STAGE_HEADERS = [
  { key: "listaImagens", short: "Lista", full: "Lista de Imagens" },
  { key: "layouts", short: "Layouts", full: "Entrega de Layouts" },
  { key: "aprovacao", short: "Aprovação", full: "Aprovação de Layout" },
  // "Final." era a UNICA coluna abreviada com ponto, ao lado de "Aprovacao"
  // e "Producao" inteiras — lia como erro de digitacao, nao como abreviacao.
  // "Final" sem ponto e uma palavra de verdade e cabe no mesmo espaco.
  { key: "finalizacao", short: "Final", full: "Finalização" },
  { key: "revisao", short: "Revisão", full: "Revisão de Lista" },
  { key: "producao", short: "Produção", full: "Produção Gráfica" },
];

// Rótulo curto por etapa — o mobile usava label.split(" ")[0], que produzia
// "Entrega" para Entrega de Layouts (ambíguo com entrega de peças).
export const STAGE_SHORT: Record<string, string> = Object.fromEntries(
  STAGE_HEADERS.map((h) => [h.key, h.short]),
);

/**
 * Critério do selo RISCO, numa constante só. Era o alarme mais forte da tela
 * e aparecia sem explicação exatamente onde é mais visto (o card do quadro),
 * enquanto o mobile e a tabela traziam o texto — três cópias, uma faltando.
 *
 * Vive no `title` (mouse) E num `sr-only` ao lado do selo (teclado/leitor):
 * `title` sozinho é tooltip de quem tem mouse, e o alarme mais forte da tela
 * não pode depender do dispositivo de entrada.
 */
export const RISCO_TITLE =
  "Prazo a até 2 dias de vencer com 10+ peças ainda pendentes — inviável sem ação imediata";

/**
 * Teto dos DOIS scrollports do corpo: as colunas do quadro e a tabela.
 *
 * É um número só de propósito. Os dois blocos começam na mesma altura da
 * página (ambos são o `body` da tela), então dois valores diferentes eram
 * duas medições do mesmo espaço — e a da tabela estava ~160px otimista
 * ("calc(100vh - 150px)"), o que sobrava um pedaço de tabela permanentemente
 * abaixo da dobra dentro de um scrollport aninhado no scroll da página.
 *
 * O desconto cobre: padding da página (24) + cabeçalho com subtítulo (~66+18)
 * + placar (84+16) + toolbar (36+10) + a folga do rodapé da faixa de análise.
 */
export const SCROLLPORT_MAX_H = "calc(100vh - 330px)";

// ─── Réguas e formatação ─────────────────────────────────────────────────────
//
// VOCABULÁRIO DA TELA (a convenção, escrita para não voltar a divergir).
// A tela chegou a usar cinco palavras para três conceitos — "marco", "etapa",
// "vence", "vencido", "atrasado" — e "marco" era jargão que não existe em
// nenhuma outra tela (o event-detail chama de "Timeline de Prazos"). O acordo:
//
// • ETAPA   — a fase do funil (Lista de Imagens, Layouts, …). Nunca "marco".
// • PRAZO   — a data-limite daquela etapa. Um prazo VENCE / está VENCIDO.
// • EVENTO  — o que tem prazo vencido está ATRASADO; a SAÍDA atrasa.
// • PEÇA    — sempre por extenso ("8 peças"), nunca "pç"; use `pecasTexto`.
// • DIAS    — por extenso (`diasTexto`) em frase; a forma curta "5d" fica
//   restrita a célula de tabela e a badge onde o texto não caberia.
// • ENTREGUE — `deliveredItems` conta só `delivered`. Nunca "pronta":
//   "produzida" e "conferida" não entram, e o diretor lia catástrofe onde
//   estava tudo certo.

/** Cor dos dias de espera — régua ÚNICA dos blocos: ≥7 vermelho, ≥3 âmbar. */
export function dayColor(days: number): string {
  return days >= 7 ? TI.red : days >= 3 ? TI.amber : TI.strong;
}

// ─── "Com quem está a bola" ──────────────────────────────────────────────────
//
// A coluna "Aprovação com quem" é a ÚNICA da tela cujo tamanho quem decide é o
// dado: uma peça pode ter um patrocinador ou oito. Escrita inteira ela era um
// bloco inquebrável — cada nome vinha num `white-space: nowrap` e entre dois
// nomes não sobrava ponto de quebra nenhum —, então a tabela crescia além do
// container e ligava uma SEGUNDA rolagem, horizontal, dentro do modal que já
// rolava na vertical. E o que ficava cortado era justamente a informação que
// faz a ligação acontecer.
//
// A saída é por CONTEÚDO, não por rolagem: mostra os piores, resume o resto em
// "+3" e mantém a lista completa no `title`. Vive aqui porque o drill, o
// cartão do celular e a faixa de análise precisam falar a MESMA língua.

/** Quantos patrocinadores aparecem por extenso antes do "+N". */
export const APROVACAO_VISIVEIS = 2;

/** "Kiss FM (16d)" · "Crystal (hoje)" · "TMC — com a Arte". */
export function textoAprovacao(s: PrazoPendingSponsor): string {
  if (s.holder === "arte") return `${s.name} — com a Arte`;
  return `${s.name} (${s.days === 0 ? "hoje" : `${s.days}d`})`;
}

export interface AprovacaoResumo {
  visiveis: PrazoPendingSponsor[];
  restantes: number;
  /** A lista COMPLETA em texto. Vai para o `title`: resumir sem plano B esconde. */
  titulo: string;
}

/**
 * Pior primeiro — quem cai no "+N" é quem espera MENOS, mesma régua de
 * ordenação que o drill já usa para as peças.
 */
export function resumoAprovacoes(
  sponsors: PrazoPendingSponsor[] | undefined,
  limite: number = APROVACAO_VISIVEIS,
): AprovacaoResumo {
  const ordenados = [...(sponsors ?? [])].sort((a, b) => b.days - a.days);
  return {
    visiveis: ordenados.slice(0, limite),
    restantes: Math.max(0, ordenados.length - limite),
    titulo: ordenados.map(textoAprovacao).join(", "),
  };
}

export const MONTH_LABELS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "3 dias" / "1 dia" — por extenso, voz única com o event-detail. */
export function diasTexto(n: number): string {
  return `${n} dia${n !== 1 ? "s" : ""}`;
}

export function pecasTexto(n: number): string {
  return `${n} peça${n !== 1 ? "s" : ""}`;
}

export function fmtDayMonth(dateOnly: string): string {
  const [, m, d] = dateOnly.split("-");
  return `${d}/${m}`;
}

export function fmtSaida(iso: string): string {
  const d = toUTCDisplayDate(iso);
  return `${String(d.getDate()).padStart(2, "0")} ${MONTH_LABELS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "12 ago" — a saída no card, onde o ano é ruído. */
export function fmtDiaCurto(iso: string): string {
  const d = toUTCDisplayDate(iso);
  return `${d.getDate()} ${MONTH_LABELS[d.getMonth()]}`;
}

/**
 * Aritmética sobre um dia "YYYY-MM-DD" que veio do SERVIDOR (âncora
 * America/Sao_Paulo). Não é o cliente decidindo que dia é hoje — é o cliente
 * caminhando a partir do dia que o negócio já declarou, em UTC puro, sem o
 * relógio local entrar na conta.
 */
export function addDaysStr(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const ms = Date.UTC(y, m - 1, d) + n * 86400000;
  const out = new Date(ms);
  return `${out.getUTCFullYear()}-${String(out.getUTCMonth() + 1).padStart(2, "0")}-${String(out.getUTCDate()).padStart(2, "0")}`;
}

/** Dia da semana de um "YYYY-MM-DD" (0=domingo), lido em UTC. */
export function weekdayOfDay(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** "sex 15/08" — a promessa ganha nome de dia, que é como se combina por telefone. */
export function fmtDiaSemana(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const nomes = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  return `${nomes[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

// Busca insensível a acento — "sao paulo" precisa achar "SÃO PAULO".
// Faixa de combining marks em vez de \p{M}: o target do tsconfig não aceita a flag u.
export function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * "Atualizado há X" — hora absoluta de ontem ("18:40") é verdadeira e enganosa.
 * `now` entra por parâmetro porque quem chama tem um tick de 60s: calculado no
 * render e sem tick, o selo congelava no instante do primeiro paint e o painel
 * escrevia "há 2h" sobre o agregado de sexta-feira.
 */
export function fmtRelative(iso: string, now: number): string {
  const mins = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "agora";
  if (mins < 60) return `há ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 12) return `há ${hours}h`;
  const d = new Date(iso);
  return `em ${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} às ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

// ─── Leituras derivadas do evento ────────────────────────────────────────────

export function eventHasOverdue(ev: PrazoEvent): boolean {
  // `categoria` é a fonte ÚNICA (servidor). O `stages.some` fica como rede
  // para o payload de um Express antigo — git pull sem Stop/Run —, onde o
  // campo simplesmente não existe apesar de o tipo prometê-lo.
  const cat = ev.categoria as PrazoEvent["categoria"] | undefined;
  if (cat) return cat === "atrasado";
  return ev.stages.some((s) => s.state === "overdue");
}

/**
 * Etapa ATUAL do evento no funil: a primeira com pendência acumulada — é a
 * coluna do quadro em que o card vive (o evento anda de coluna em coluna
 * conforme as etapas fecham).
 *
 * "Sem peças" devolve 0 (Lista de Imagens) porque é a PRÓXIMA AÇÃO REAL.
 * Antes caía no `stages.length - 1` e o card do evento mais crítico do
 * negócio — zero peças a cinco dias da saída — aterrissava na coluna de
 * Produção Gráfica, afirmando o oposto do que o quadro promete.
 */
export function currentStageIdx(ev: PrazoEvent): number {
  if (ev.categoria === "semPecas" || ev.totalItems === 0) return 0;
  const idx = ev.stages.findIndex((s) => s.pendingCount > 0);
  return idx === -1 ? ev.stages.length - 1 : idx;
}

/**
 * Countdown da saída. O número vem PRONTO do servidor (`diasParaSaida`,
 * ancorado em America/Sao_Paulo): o cliente parou de refazer a conta com
 * meia-noite LOCAL do navegador, que entre 21h e 00h fazia o chip dizer
 * "Faltam 6 dias" enquanto a célula ao lado, vinda do servidor, contava 7.
 *
 * `text` é curto de propósito (cabe numa pílula de coluna estreita) e `full`
 * carrega a frase inteira para o `title`.
 */
export function saidaChip(ev: PrazoEvent): { text: string; full: string; color: string; bg: string } {
  if (ev.invalidDate || ev.diasParaSaida == null) {
    return {
      text: "Data inválida",
      full: "Data de saída inválida — corrija o cadastro do evento",
      color: TI.red, bg: TI.redBg,
    };
  }
  const diff = ev.diasParaSaida;
  if (diff < 0) {
    const t = `Saída atrasada ${diasTexto(-diff)}`;
    return { text: t, full: t, color: TI.red, bg: TI.redBg };
  }
  if (diff === 0) return { text: "Sai hoje", full: "O caminhão sai hoje", color: TI.amber, bg: TI.amberBg };
  const t = `Faltam ${diasTexto(diff)}`;
  return { text: t, full: t, color: TI.secondary, bg: TI.chipBg };
}

// ─── Erro de API em português ────────────────────────────────────────────────

/**
 * Traduz o `Error` de uma chamada de API para uma frase que o diretor lê.
 *
 * A correção de raiz está em `lib/queryClient.ts` (o parse do corpo JSON
 * acontece lá, para o app inteiro). Aqui fica a rede de segurança desta tela:
 * o caso OFFLINE, em que o fetch rejeita antes de existir resposta e a
 * mensagem chega como o literal em inglês "Failed to fetch", e o caso de um
 * corpo JSON que tenha escapado do parse.
 */
export function apiErrorMessage(e: unknown): string {
  const raw = e instanceof Error ? e.message : typeof e === "string" ? e : "";
  if (!raw.trim()) return "Algo deu errado. Tente novamente.";
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(raw)) {
    return "Sem conexão com o servidor. Tente novamente.";
  }
  if (raw.trimStart().startsWith("{")) {
    try {
      const parsed = JSON.parse(raw) as { error?: unknown; message?: unknown };
      const msg = typeof parsed.error === "string" ? parsed.error
        : typeof parsed.message === "string" ? parsed.message : "";
      if (msg.trim()) return msg;
    } catch { /* não era JSON válido — devolve o texto como veio */ }
  }
  return raw;
}

// ─── Estilos de tabela (módulo: não realocar por render) ─────────────────────

/**
 * Abaixo desta largura de CONTAINER o drill vira CARTÃO em vez de tabela.
 *
 * O número sai de uma conta, não do olho. As colunas previsíveis somam 290px
 * (peça 108 + qtd 54 + sem movimento 128) e a descrição leva 30% da tabela;
 * para a coluna "Aprovação com quem" sobrar com pelo menos 200px — o mínimo
 * para "Kiss FM (16d), TMC (3d) +3" em duas linhas —, é preciso
 * `290 + 0,3·L + 200 ≤ L`, ou seja `L ≥ 700`.
 *
 * Medido em 560 (o palpite anterior): a coluna de aprovação ficava com 105px e
 * um único nome de patrocinador transbordava a célula — a rolagem lateral
 * voltava pela porta dos fundos.
 *
 * É largura do CONTAINER e não da janela de propósito: o mesmo drill é montado
 * no modal (1057px), na linha da tabela desktop (≈864px) e no card do celular
 * (≈312px).
 */
export const DRILL_TABELA_MIN = 700;

/**
 * `whiteSpace: normal` (era `nowrap`): as tabelas do drill e da faixa de
 * análise passaram a `table-layout: fixed` com largura declarada por coluna, e
 * num layout fixo o rótulo que não cabe NÃO alarga a coluna — ele transborda
 * por cima da vizinha. Deixar quebrar em duas linhas é a válvula que garante
 * que nenhum cabeçalho invada a coluna ao lado na largura mínima.
 */
export const DRILL_TH: React.CSSProperties = {
  padding: "6px 10px",
  fontSize: 10, fontWeight: 700, textTransform: "uppercase",
  letterSpacing: "0.08em", color: TI.label, textAlign: "center",
  fontFamily: "'Plus Jakarta Sans', sans-serif", whiteSpace: "normal",
  lineHeight: 1.3,
};

export const TH_STYLE: React.CSSProperties = {
  padding: "10px 8px",
  fontSize: 10, fontWeight: 700, textTransform: "uppercase",
  letterSpacing: "0.08em", color: TI.label, textAlign: "center",
  fontFamily: "'Plus Jakarta Sans', sans-serif", whiteSpace: "nowrap",
};

// Variante sticky para a tabela-mãe (o container dela é o scrollport).
// boxShadow no lugar de borderBottom: borda de th sticky não acompanha o scroll.
export const TH_STICKY: React.CSSProperties = {
  ...TH_STYLE,
  position: "sticky", top: 0, zIndex: 2,
  // `sunken` e não `card`: o cabeçalho era da MESMA cor das linhas, e o que
  // o separava era só um hairline de 1px. Numa tabela rolada, com a primeira
  // linha grudada embaixo dele, não dava para dizer onde terminava o
  // cabeçalho e começava o dado. Meia tonalidade abaixo resolve sem borda
  // nova. Vale para as DUAS tabelas da tela — este token é usado só por elas.
  backgroundColor: TI.sunken,
  boxShadow: `inset 0 -1px 0 ${TI.border}`,
};
