// ─────────────────────────────────────────────────────────────────────────────
// RESERVA DE IMPRESSORA, COM QUANTIDADE (dono, 21/09: "aqui, além de reservar,
// posso direcionar a quantidade e para qual impressora vai").
//
// Uma peça de 34 un. pode ter 20 reservadas para a Impressora 1 e 14 para a
// Impressora 2 ANTES de imprimir. O dado mora em items.reserva_por_maquina:
//
//     { "1": 20, "2": 14 }        (NULL = nada reservado)
//
// `maquina_prevista` continua existindo como atalho (a impressora com MAIS
// unidades reservadas) para o selo da Gráfica e o que já lia esse campo; as
// duas colunas saem sempre juntas de `colunasDaReserva`.
//
// A RESERVA É SÓ UM CONTROLE: nunca muda status, printMachine nem o diário.
// Vira realidade no start-printing, que CONSOME a parte daquela impressora e a
// transforma em parte em impressão (shared/impressao-dividida.ts).
//
// A CONTA que tudo aqui protege, para qualquer peça:
//
//     em impressão (Σ atrib das partes) + reservado (Σ reserva) ≤ a imprimir
//
// e o que sobra é o "sem impressora" — o que aparece na fila geral.
// ─────────────────────────────────────────────────────────────────────────────
import { MAQUINAS_DE_IMPRESSAO, rotuloDaMaquina } from "./fluxo-peca";
import { aImprimirDaPeca, lerPartes, partesDaPeca, reescalarPartes, restanteNaMaquina, type PartesPorMaquina, type PecaDividivel } from "./impressao-dividida";

export type ReservaPorMaquina = Record<string, number>;

export type PecaReservavel = PecaDividivel & {
  status?: string | null;
  maquinaPrevista?: string | null;
  reservaPorMaquina?: unknown;
};

const EM_IMPRESSAO = ["inProduction", "em_producao"];
const inteiro = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
};
const soma = (r: ReservaPorMaquina | null | undefined): number => Object.values(r ?? {}).reduce((s, n) => s + n, 0);

/** Lê o jsonb com tolerância: só máquinas válidas e inteiros > 0. */
export function lerReserva(bruto: unknown): ReservaPorMaquina | null {
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return null;
  const r: ReservaPorMaquina = {};
  for (const m of MAQUINAS_DE_IMPRESSAO) {
    const n = inteiro((bruto as Record<string, unknown>)[m]);
    if (n > 0) r[m] = n;
  }
  return Object.keys(r).length ? r : null;
}

/**
 * Quanto da peça JÁ ESTÁ numa impressora: em impressão, a soma do que foi
 * atribuído às partes; fora dela, o que já consta impresso (peça que voltou
 * para a fila com parte feita).
 */
export function comprometidoDaPeca(p: PecaReservavel): number {
  if (EM_IMPRESSAO.includes(p.status ?? "")) {
    return Object.values(partesDaPeca(p)).reduce((s, x) => s + x.atrib, 0);
  }
  return Math.min(aImprimirDaPeca(p), inteiro(p.quantityProduced));
}

/** O teto da reserva: o que ainda não está em nenhuma impressora. */
export const livreParaReservar = (p: PecaReservavel): number => Math.max(0, aImprimirDaPeca(p) - comprometidoDaPeca(p));

/**
 * A reserva real da peça: o jsonb; na falta dele, o atalho antigo
 * (`maquina_prevista` = tudo naquela impressora). Nunca passa do livre.
 */
export function reservaDaPeca(p: PecaReservavel): ReservaPorMaquina {
  const livre = livreParaReservar(p);
  const lida = lerReserva(p.reservaPorMaquina)
    ?? (p.maquinaPrevista && MAQUINAS_DE_IMPRESSAO.includes(p.maquinaPrevista) && livre > 0 ? { [p.maquinaPrevista]: livre } : null);
  return lida ? encolherReserva(lida, livre) ?? {} : {};
}

/** Quantas unidades ainda não têm impressora (nem reservada, nem em impressão). */
export const semImpressora = (p: PecaReservavel): number => Math.max(0, livreParaReservar(p) - soma(reservaDaPeca(p)));

/** A impressora do atalho: a com mais unidades reservadas (empate = menor código). */
export function maquinaDoAtalho(r: ReservaPorMaquina | null | undefined): string | null {
  let melhor: string | null = null;
  for (const m of MAQUINAS_DE_IMPRESSAO) if (r?.[m] && (melhor === null || r[m] > r[melhor])) melhor = m;
  return melhor;
}

/** As DUAS colunas, sempre coerentes — é o que as rotas gravam. */
export function colunasDaReserva(r: ReservaPorMaquina | null | undefined): { reservaPorMaquina: ReservaPorMaquina | null; maquinaPrevista: string | null } {
  const limpa = lerReserva(r);
  return { reservaPorMaquina: limpa, maquinaPrevista: maquinaDoAtalho(limpa) };
}

/** Encolhe a reserva até caber em `teto`, tirando primeiro das MENORES partes. */
export function encolherReserva(r: ReservaPorMaquina | null | undefined, teto: number): ReservaPorMaquina | null {
  const limpa = lerReserva(r);
  if (!limpa) return null;
  let excesso = soma(limpa) - Math.max(0, Math.floor(teto));
  if (excesso <= 0) return limpa;
  const nova = { ...limpa };
  for (const m of Object.keys(nova).sort((a, b) => nova[a] - nova[b] || (a < b ? 1 : -1))) {
    if (excesso <= 0) break;
    const tira = Math.min(excesso, nova[m]);
    nova[m] -= tira;
    excesso -= tira;
  }
  return lerReserva(nova);
}

type Resultado = { ok: true; reserva: ReservaPorMaquina | null; quantidade: number; semImpressora: number } | { ok: false; erro: string };

/**
 * Reserva `quantidade` un. (ausente = tudo o que ainda está sem impressora)
 * para `maquina`. Compatibilidade com o gesto antigo "tudo para a Impressora
 * X": sem quantidade e sem nada livre, MOVE toda a reserva para ela.
 */
export function reservar(p: PecaReservavel, maquina: string, quantidade?: number | null): Resultado {
  if (!MAQUINAS_DE_IMPRESSAO.includes(maquina)) return { ok: false, erro: "Impressora inválida — escolha 1 a 4" };
  const atual = reservaDaPeca(p);
  const livre = semImpressora(p);
  if (quantidade == null && livre === 0 && soma(atual) > 0) {
    return { ok: true, reserva: { [maquina]: soma(atual) }, quantidade: soma(atual), semImpressora: 0 };
  }
  const n = quantidade == null ? livre : inteiro(quantidade);
  if (n <= 0) return { ok: false, erro: livre === 0 ? "Não há unidades sem impressora para reservar" : "Informe quantas unidades vão para a impressora" };
  if (n > livre) return { ok: false, erro: `Só ${livre} un. estão sem impressora — não dá para reservar ${n}` };
  return { ok: true, reserva: { ...atual, [maquina]: (atual[maquina] ?? 0) + n }, quantidade: n, semImpressora: livre - n };
}

/** Move `quantidade` (ausente = tudo) da reserva de `de` para `para`. */
export function moverReserva(p: PecaReservavel, de: string, para: string, quantidade?: number | null): Resultado {
  if (!MAQUINAS_DE_IMPRESSAO.includes(para)) return { ok: false, erro: "Impressora inválida — escolha 1 a 4" };
  if (de === para) return { ok: false, erro: `Já está reservada para a ${rotuloDaMaquina(para)}` };
  const atual = reservaDaPeca(p);
  const tem = atual[de] ?? 0;
  if (tem <= 0) return { ok: false, erro: `Não há reserva na ${rotuloDaMaquina(de)} para mover` };
  const n = quantidade == null ? tem : inteiro(quantidade);
  if (n <= 0 || n > tem) return { ok: false, erro: `Informe de 1 a ${tem} — é o que está reservado na ${rotuloDaMaquina(de)}` };
  const nova = { ...atual, [de]: tem - n, [para]: (atual[para] ?? 0) + n };
  return { ok: true, reserva: lerReserva(nova), quantidade: n, semImpressora: semImpressora(p) };
}

/** Devolve à fila geral: a reserva de `de` (ou todas), inteira ou `quantidade`. */
export function devolverReserva(p: PecaReservavel, de?: string | null, quantidade?: number | null): Resultado {
  const atual = reservaDaPeca(p);
  if (!de) {
    const n = soma(atual);
    return { ok: true, reserva: null, quantidade: n, semImpressora: semImpressora(p) + n };
  }
  const tem = atual[de] ?? 0;
  if (tem <= 0) return { ok: false, erro: `Não há reserva na ${rotuloDaMaquina(de)} para devolver` };
  const n = quantidade == null ? tem : inteiro(quantidade);
  if (n <= 0 || n > tem) return { ok: false, erro: `Informe de 1 a ${tem} — é o que está reservado na ${rotuloDaMaquina(de)}` };
  return { ok: true, reserva: lerReserva({ ...atual, [de]: tem - n }), quantidade: n, semImpressora: semImpressora(p) + n };
}

/**
 * INICIAR UMA PARTE (start-printing com `iniciarParte`): consome a reserva de
 * `maquina` (`daReserva`) ou tira `quantidade` do que está sem impressora, e
 * soma às partes em impressão. Devolve as partes e a reserva novas — a conta
 * em impressão + reservado ≤ a imprimir continua valendo por construção.
 */
export function iniciarParte(
  p: PecaReservavel, maquina: string, opcoes: { daReserva?: boolean; quantidade?: number | null },
): { ok: true; partes: PartesPorMaquina; reserva: ReservaPorMaquina | null; quantidade: number } | { ok: false; erro: string } {
  if (!MAQUINAS_DE_IMPRESSAO.includes(maquina)) return { ok: false, erro: "Escolha a máquina em que a peça vai ser impressa" };
  const reserva = reservaDaPeca(p);
  let n: number;
  let reservaNova: ReservaPorMaquina | null;
  if (opcoes.daReserva) {
    n = reserva[maquina] ?? 0;
    if (n <= 0) return { ok: false, erro: `Não há unidades reservadas para a ${rotuloDaMaquina(maquina)}` };
    reservaNova = lerReserva({ ...reserva, [maquina]: 0 });
  } else {
    const livre = semImpressora(p);
    n = opcoes.quantidade == null ? livre : inteiro(opcoes.quantidade);
    if (n <= 0) return { ok: false, erro: "Não há unidades sem impressora para iniciar" };
    if (n > livre) return { ok: false, erro: `Só ${livre} un. estão sem impressora — não dá para iniciar ${n}` };
    reservaNova = lerReserva(reserva);
  }
  // Em impressão: soma às partes que já existem. Fora dela: a peça pode ter
  // voltado com unidades já impressas — elas ficam anotadas nesta máquina.
  const emImpressao = EM_IMPRESSAO.includes(p.status ?? "");
  const partes: PartesPorMaquina = {};
  if (emImpressao) for (const [m, x] of Object.entries(partesDaPeca(p))) partes[m] = { ...x };
  const jaImpressas = emImpressao ? 0 : Math.min(aImprimirDaPeca(p), inteiro(p.quantityProduced));
  const antes = partes[maquina] ?? { atrib: 0, impressas: 0 };
  partes[maquina] = { atrib: antes.atrib + n + jaImpressas, impressas: antes.impressas + jaImpressas };
  return { ok: true, partes, reserva: reservaNova, quantidade: n };
}

/**
 * Quando o que há para imprimir MUDA (quantidade, reaproveitamento): o que
 * excede sai primeiro do que está sem impressora (implícito), depois da
 * reserva, e só então das partes em impressão.
 */
export function reescalarReservaEPartes(
  p: PecaReservavel, aImprimirNovo: number,
): { partes: PartesPorMaquina | null; reserva: ReservaPorMaquina | null } {
  const teto = Math.max(0, Math.floor(aImprimirNovo));
  const emImpressao = EM_IMPRESSAO.includes(p.status ?? "");
  const lidas = lerPartes(p.impressaoPorMaquina);
  const comprometido = emImpressao ? comprometidoDaPeca(p) : Math.min(teto, inteiro(p.quantityProduced));
  const reserva = encolherReserva(reservaDaPeca(p), Math.max(0, teto - Math.min(comprometido, teto)));
  // As partes só ENCOLHEM (teto menor que o já atribuído); crescer o teto
  // manda a diferença para a fila geral, não para uma impressora.
  const partes = lidas ? (comprometido > teto ? reescalarPartes(lidas, teto) : lidas) : null;
  return { partes, reserva };
}

/** "Impressora 1 (20) · Impressora 2 (14)" — a reserva em uma linha. */
export function resumoDaReserva(r: ReservaPorMaquina | null | undefined): string {
  const limpa = lerReserva(r);
  return limpa ? Object.entries(limpa).map(([m, n]) => `${rotuloDaMaquina(m)} (${n})`).join(" · ") : "";
}

/** "por imprimir" de uma parte — reexportado para a tela não importar dois módulos. */
export { restanteNaMaquina };
