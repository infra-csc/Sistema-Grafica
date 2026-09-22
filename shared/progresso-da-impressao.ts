// ─────────────────────────────────────────────────────────────────────────────
// A PEÇA NA IMPRESSORA, EM UMA FONTE SÓ (dono, 21/09: "as telas Máquinas da
// Gráfica e Gráfica têm que se conversar").
//
// As duas telas foram construídas em paralelo e cada uma fazia a própria conta:
//   · o progresso ("3 de 10 impressas · 7 na impressora") morava em
//     modal-impressao.tsx, a linha da Gráfica refazia o teto com
//     tetoDeProducao e o cartão de Máquinas com o `aImprimir` do servidor, e
//     lib/detalhe-producao.ts tinha uma TERCEIRA cópia (sem o "na impressora");
//   · "a impressora está ocupada?" era `ocupanteDaImpressora` no modal da
//     Gráfica e "tem peça no cartão" em Máquinas — a peça com 10 de 10
//     impressas esperando "Mandar p/ acabamento" ocupava a impressora numa tela
//     e não na outra (e o servidor, que usa `ocupanteDaImpressora`, deixava);
//   · "de qual impressora é esta peça?" era `printMachine` no filtro da Gráfica
//     e "tem parte ativa nela ou reserva para ela" no cartão de Máquinas — a
//     peça dividida (parte na 1 e na 2) sumia do filtro "Impressora 2".
//
// Tudo aqui é puro (nada de React, nada de fetch): o servidor (o retrato de
// Máquinas), a fila da Gráfica, o cartão de Máquinas, o modal compartilhado e
// a frase curta do resto do fluxo leem DESTAS funções.
// ─────────────────────────────────────────────────────────────────────────────
import { MAQUINAS_DE_IMPRESSAO, rotuloDaMaquina } from "./fluxo-peca";
import { aImprimirDaPeca, estaDividida, lerPartes, partesAtivas, partesDaPeca, resumoDaDivisao, type PartesPorMaquina } from "./impressao-dividida";
import { lerPausas, lerReserva, ocupanteDaImpressora, reservaDaPeca, semImpressora, type PecaReservavel } from "./reserva-de-impressora";
import { nomeDaPeca } from "./nome-da-peca";

const EM_IMPRESSAO = ["inProduction", "em_producao"];
const LIBERADA = ["ready_for_production", "pronto_para_producao", "approved", "liberado"];
const inteiro = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
};

export const estaEmImpressao = (p: { status?: string | null } | null | undefined): boolean => EM_IMPRESSAO.includes(p?.status ?? "");
export const estaLiberada = (p: { status?: string | null } | null | undefined): boolean => LIBERADA.includes(p?.status ?? "");

// ─── As frases ────────────────────────────────────────────────────────────────
/**
 * "3 de 10 impressas · 7 na impressora" — quantas já foram para o acabamento e
 * quantas ainda estão na máquina. Com zero: "nenhuma saiu ainda · 10 na impressora".
 */
export function progressoDaImpressao(impressas: number, teto: number): string {
  const naImpressora = Math.max(0, teto - impressas);
  const inicio = impressas <= 0 ? "nenhuma saiu ainda" : `${impressas} de ${teto} impressa${impressas === 1 ? "" : "s"}`;
  return `${inicio} · ${naImpressora} na impressora`;
}

/**
 * O rótulo curto do botão da linha/cartão: "Impressas" enquanto falta,
 * "Mandar p/ acabamento" quando o que falta é zero (a peça só espera o gesto).
 */
export function rotuloCurtoDaAcao(impressas: number, teto: number): string {
  return impressas >= teto && teto > 0 ? "Mandar p/ acabamento" : "Impressas";
}

// ─── Os números ───────────────────────────────────────────────────────────────
export type NumerosDaImpressao = {
  /** Quantas já saíram (da peça, ou da parte de `maquina`). */
  feitas: number;
  /** Quanto há para imprimir (da peça, ou atribuído à parte de `maquina`). */
  teto: number;
  /** Quantas ainda estão na impressora. */
  naImpressora: number;
  /** A peça inteira: o que ela tem para imprimir e o que já saiu no total. */
  feitasDaPeca: number;
  tetoDaPeca: number;
  /** Unidades que ainda não estão em impressora nenhuma (nem reservadas). */
  semImpressora: number;
  /** Mais de uma impressora com parte da peça. */
  dividida: boolean;
  /** Os números vêm da PARTE de `maquina` (peça por partes). */
  daParte: boolean;
  partes: PartesPorMaquina;
  /** "Impressora 2", ou a divisão "Impressora 1 · 1 de 3 un. / Impressora 2 · 0 de 2 un."; null sem máquina. */
  onde: string | null;
  /** "3 de 10 impressas · 7 na impressora" (da parte, quando `daParte`). */
  frase: string;
};

/**
 * Os números da peça em impressão — os MESMOS na linha da Gráfica, no cartão
 * de Máquinas e no modal. Com `maquina`, e a peça por partes, os números são
 * os da parte daquela impressora (é o que o cartão dela mostra).
 */
export function numerosDaImpressao(p: PecaReservavel, maquina?: string | null): NumerosDaImpressao {
  const tetoDaPeca = aImprimirDaPeca(p);
  const feitasDaPeca = Math.min(inteiro(p.quantityProduced), tetoDaPeca);
  const partes = partesDaPeca(p);
  const porPartes = !!lerPartes(p.impressaoPorMaquina);
  const parte = maquina && porPartes ? partes[maquina] : undefined;
  const feitas = parte ? parte.impressas : feitasDaPeca;
  const teto = parte ? parte.atrib : tetoDaPeca;
  const dividida = estaDividida(p);
  return {
    feitas, teto, naImpressora: Math.max(0, teto - feitas),
    feitasDaPeca, tetoDaPeca,
    semImpressora: estaEmImpressao(p) || estaLiberada(p) ? semImpressora(p) : 0,
    dividida, daParte: !!parte, partes,
    onde: dividida ? resumoDaDivisao(partes) : p.printMachine ? rotuloDaMaquina(p.printMachine) : null,
    frase: progressoDaImpressao(feitas, teto),
  };
}

/**
 * O selo da peça LIBERADA que já tem impressora na fila (reserva feita em
 * Máquinas ou pela Gráfica): "Fila: Impressora 2" quando TUDO está reservado a
 * ela; "Fila: Impressora 2 (20) · 14 sem impressora" quando só parte; a
 * reserva dividida "Fila: Impressora 1 (20) · Impressora 2 (14)". A peça que
 * foi TIRADA da impressora para dar lugar a outra diz "Pausada" na frente — é
 * o que o cartão de Máquinas diz ("Pausada — volta primeiro"). null sem reserva.
 */
export function fraseDaFila(p: PecaReservavel): string | null {
  const reserva = reservaDaPeca(p);
  const maquinas = MAQUINAS_DE_IMPRESSAO.filter((m) => (reserva[m] ?? 0) > 0);
  // Só o atalho antigo (maquina_prevista) sem número para reservar: diz a impressora.
  if (!maquinas.length) return p.maquinaPrevista && MAQUINAS_DE_IMPRESSAO.includes(p.maquinaPrevista) ? `Fila: ${rotuloDaMaquina(p.maquinaPrevista)}` : null;
  const sem = semImpressora(p);
  const pausada = maquinas.some((m) => !!lerPausas(p.reservaPorMaquina)[m]);
  const tudoNumaSo = maquinas.length === 1 && sem === 0;
  const fila = tudoNumaSo
    ? rotuloDaMaquina(maquinas[0])
    : maquinas.map((m) => `${rotuloDaMaquina(m)} (${reserva[m]})`).join(" · ");
  return `${pausada ? "Pausada · " : ""}Fila: ${fila}${sem > 0 ? ` · ${sem} sem impressora` : ""}`;
}

// ─── De qual impressora é a peça ──────────────────────────────────────────────
/**
 * A peça está IMPRIMINDO em `codigo` agora? É a régua do cartão de Máquinas
 * (server/routes/maquinas.ts): por partes, a parte ATIVA daquela impressora;
 * senão, a `printMachine`.
 */
export function imprimeNaMaquina(p: PecaReservavel, codigo: string): boolean {
  if (!estaEmImpressao(p)) return false;
  const partes = lerPartes(p.impressaoPorMaquina);
  return partes ? !!partesAtivas(partes)[codigo] : p.printMachine === codigo;
}

/** Valor sintético: peça em impressão sem máquina anotada. */
export const SEM_IMPRESSORA = "sem";

/**
 * As impressoras que a peça "é": onde está IMPRIMINDO (a régua do cartão),
 * para onde está RESERVADA (a fila do cartão) e, por histórico, a
 * `printMachine` em que foi impressa. A peça em impressão sem máquina é
 * SEM_IMPRESSORA. É o que o filtro "Impressora" da Gráfica e o cartão da
 * impressora em Máquinas concordam em mostrar.
 */
export function impressorasDaPeca(p: PecaReservavel): string[] {
  const achadas = new Set<string>();
  for (const m of MAQUINAS_DE_IMPRESSAO) if (imprimeNaMaquina(p, m)) achadas.add(m);
  if (estaEmImpressao(p) || estaLiberada(p)) {
    const reserva = reservaDaPeca(p);
    for (const m of MAQUINAS_DE_IMPRESSAO) if ((reserva[m] ?? 0) > 0) achadas.add(m);
  }
  if (p.printMachine && MAQUINAS_DE_IMPRESSAO.includes(p.printMachine)) achadas.add(p.printMachine);
  if (!achadas.size && estaEmImpressao(p)) return [SEM_IMPRESSORA];
  return MAQUINAS_DE_IMPRESSAO.filter((m) => achadas.has(m));
}

// ─── Quem ocupa cada impressora ───────────────────────────────────────────────
/** A peça que está numa impressora, com os números da parte dela. */
export type OcupanteDaImpressora = { id: string; displayId: string | null; impressas: number; teto: number; /** tipo + descrição (shared/nome-da-peca). */ nome?: string | null };

type PecaComNome = PecaReservavel & { id: string; displayId?: string | null; type?: string | null; description?: string | null };

/**
 * UMA PEÇA POR VEZ POR IMPRESSORA: quem ocupa cada impressora, pela MESMA
 * régua do servidor (`ocupanteDaImpressora` — parte com algo por imprimir).
 * A peça com 10 de 10 impressas, só esperando "Mandar p/ acabamento", NÃO
 * ocupa: o servidor deixa outra entrar, e as duas telas agora dizem o mesmo.
 * `excetoId`: a peça aberta no modal não ocupa a impressora contra si mesma.
 */
export function ocupacaoDasImpressoras(emImpressao: PecaComNome[], excetoId?: string | null): Record<string, OcupanteDaImpressora> {
  const o: Record<string, OcupanteDaImpressora> = {};
  for (const m of MAQUINAS_DE_IMPRESSAO) {
    const p = ocupanteDaImpressora(emImpressao, m, excetoId);
    if (!p) continue;
    const parte = partesDaPeca(p)[m];
    o[m] = { id: p.id, displayId: p.displayId ?? null, impressas: parte?.impressas ?? 0, teto: parte?.atrib ?? aImprimirDaPeca(p), nome: nomeDaPeca(p.type, p.description) };
  }
  return o;
}

/**
 * A pergunta da TROCA POR PRIORIDADE (dono, 21/09: "tirar um item e colocar o
 * outro, pois às vezes tem ordem de prioridade") — diz o que acontece com a
 * peça que sai: as impressas ficam anotadas e o resto volta para o topo da fila.
 */
export function perguntaDaTroca(sai: OcupanteDaImpressora, entra: string | null, maquina: string): string {
  const faltam = Math.max(0, sai.teto - sai.impressas);
  const s = sai.displayId ?? "a peça atual";
  return `Tirar ${s}${sai.nome ? ` (${sai.nome})` : ""} da ${rotuloDaMaquina(maquina)} (${sai.impressas} de ${sai.teto} já ${sai.impressas === 1 ? "impressa fica anotada" : "impressas ficam anotadas"}) e imprimir ${entra ?? "esta peça"} no lugar? A ${s} volta para o topo da fila desta impressora com ${faltam === 1 ? "a 1 que falta" : `as ${faltam} que faltam`}.`;
}

// ─── Os links de ida e volta ──────────────────────────────────────────────────
/** A peça na fila da Gráfica (o `?item=` põe o código dela na busca). */
export const linkDaPecaNaGrafica = (id: string): string => `/grafica?item=${encodeURIComponent(id)}`;
/** A fila da Gráfica recortada numa impressora (o filtro "Impressora"). */
export const linkDaImpressoraNaGrafica = (maquina: string): string => `/grafica?impressora=${encodeURIComponent(maquina)}`;
/** O cartão da impressora na aba Agora de Máquinas, em foco — e a peça realçada, quando dita. */
export const linkDaImpressoraEmMaquinas = (maquina: string, itemId?: string | null): string =>
  `/grafica/maquinas?foco=${encodeURIComponent(maquina)}${itemId ? `&item=${encodeURIComponent(itemId)}` : ""}`;
