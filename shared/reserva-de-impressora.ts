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

/**
 * O valor de cada impressora no jsonb é um número (20) ou, quando a peça foi
 * TIRADA da impressora para dar lugar a outra (dono, 21/09: "tirar um item e
 * colocar o outro"), { qtd: 7, pausadaEm: ISO } — a marca que põe a peça no
 * TOPO da fila daquela impressora. Sem coluna nova: o formato antigo continua
 * válido, e quem só quer as quantidades lê por `lerReserva`.
 */
export type ValorDaReserva = number | { qtd: number; pausadaEm?: string | null };

/** Lê o jsonb com tolerância: só máquinas válidas e inteiros > 0. */
export function lerReserva(bruto: unknown): ReservaPorMaquina | null {
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return null;
  const r: ReservaPorMaquina = {};
  for (const m of MAQUINAS_DE_IMPRESSAO) {
    const v = (bruto as Record<string, unknown>)[m];
    const n = inteiro(v && typeof v === "object" ? (v as { qtd?: unknown }).qtd : v);
    if (n > 0) r[m] = n;
  }
  return Object.keys(r).length ? r : null;
}

/** As marcas de pausa do jsonb: { "1": "2026-09-21T14:03:00.000Z" }. */
export function lerPausas(bruto: unknown): Record<string, string> {
  const pausas: Record<string, string> = {};
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return pausas;
  for (const m of MAQUINAS_DE_IMPRESSAO) {
    const v = (bruto as Record<string, unknown>)[m];
    if (v && typeof v === "object" && typeof (v as { pausadaEm?: unknown }).pausadaEm === "string" && inteiro((v as { qtd?: unknown }).qtd) > 0) {
      pausas[m] = (v as { pausadaEm: string }).pausadaEm;
    }
  }
  return pausas;
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

/**
 * As DUAS colunas, sempre coerentes — é o que as rotas gravam. `anterior` é o
 * jsonb que a peça tinha: a marca de pausa de uma impressora SOBREVIVE enquanto
 * ainda houver unidades reservadas a ela (mexer na reserva de outra impressora
 * não tira a peça do topo da fila); `pausas` acrescenta marcas novas.
 */
export function colunasDaReserva(
  r: ReservaPorMaquina | null | undefined, anterior?: unknown, pausas?: Record<string, string>,
): { reservaPorMaquina: Record<string, ValorDaReserva> | null; maquinaPrevista: string | null } {
  const limpa = lerReserva(r);
  if (!limpa) return { reservaPorMaquina: null, maquinaPrevista: null };
  const marcas = { ...lerPausas(anterior), ...(pausas ?? {}) };
  const gravada: Record<string, ValorDaReserva> = {};
  for (const [m, n] of Object.entries(limpa)) gravada[m] = marcas[m] ? { qtd: n, pausadaEm: marcas[m] } : n;
  return { reservaPorMaquina: gravada, maquinaPrevista: maquinaDoAtalho(limpa) };
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
  p: PecaReservavel, maquina: string, opcoes: { daReserva?: boolean; quantidade?: number | null; /** A reserva consumida é a DESTA impressora (o operador trocou de máquina na hora de iniciar). Padrão: a própria `maquina`. */ reservaDe?: string | null },
): { ok: true; partes: PartesPorMaquina; reserva: ReservaPorMaquina | null; quantidade: number } | { ok: false; erro: string } {
  if (!MAQUINAS_DE_IMPRESSAO.includes(maquina)) return { ok: false, erro: "Escolha a máquina em que a peça vai ser impressa" };
  const reserva = reservaDaPeca(p);
  let n: number;
  let reservaNova: ReservaPorMaquina | null;
  if (opcoes.daReserva) {
    // Com `quantidade` (modal da etapa 1, 21/09: "quantas vão para esta
    // impressora"): sai PRIMEIRO da reserva desta impressora e o que faltar, do
    // que está sem impressora; iniciar menos que o reservado deixa o resto reservado.
    const origem = opcoes.reservaDe && MAQUINAS_DE_IMPRESSAO.includes(opcoes.reservaDe) ? opcoes.reservaDe : maquina;
    const reservadas = reserva[origem] ?? 0;
    if (reservadas <= 0) return { ok: false, erro: `Não há unidades reservadas para a ${rotuloDaMaquina(origem)}` };
    const disponivel = reservadas + semImpressora(p);
    n = opcoes.quantidade == null ? reservadas : inteiro(opcoes.quantidade);
    if (n <= 0) return { ok: false, erro: "Informe quantas unidades vão para a impressora" };
    if (n > disponivel) return { ok: false, erro: `Só ${disponivel} un. podem ir para a ${rotuloDaMaquina(maquina)} agora — não dá para iniciar ${n}` };
    reservaNova = lerReserva({ ...reserva, [origem]: Math.max(0, reservadas - n) });
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
 * TIRAR A PEÇA DA IMPRESSORA (dono, 21/09: "tirar um item e colocar o outro,
 * pois às vezes tem ordem de prioridade"). A parte ativa de `maquina` sai de
 * impressão: o que ela JÁ imprimiu fica anotado (o total da peça não muda) e
 * o que FALTAVA vira reserva daquela mesma impressora — com a marca de pausa,
 * que a põe no topo da fila dela. Sem outra parte ativa em lugar nenhum, a
 * peça volta a "liberada" (com as impressas preservadas em quantityProduced).
 *
 * A conta fecha por construção: o que sai de "em impressão" (o restante da
 * parte) entra, igual, em "reservado".
 */
export function pausarParte(p: PecaReservavel, maquina: string, agoraISO: string):
  | { ok: true; partes: PartesPorMaquina | null; reserva: ReservaPorMaquina; pausas: Record<string, string>; voltaParaAFila: boolean; impressasNaMaquina: number; restante: number; principal: string | null }
  | { ok: false; erro: string } {
  if (!EM_IMPRESSAO.includes(p.status ?? "")) return { ok: false, erro: "A peça não está em impressão" };
  const atuais = partesDaPeca(p);
  const parte = atuais[maquina];
  const restante = parte ? restanteNaMaquina(parte) : 0;
  if (!parte || restante <= 0) return { ok: false, erro: `A peça não tem nada por imprimir na ${rotuloDaMaquina(maquina)}` };
  const novas: PartesPorMaquina = {};
  for (const [m, x] of Object.entries(atuais)) novas[m] = { ...x };
  // O que já saiu desta impressora fica como histórico (atrib = impressas).
  if (parte.impressas > 0) novas[maquina] = { atrib: parte.impressas, impressas: parte.impressas };
  else delete novas[maquina];
  const aindaImprimindo = Object.values(novas).some((x) => restanteNaMaquina(x) > 0);
  const reservaAtual = reservaDaPeca(p);
  const reserva = { ...reservaAtual, [maquina]: (reservaAtual[maquina] ?? 0) + restante };
  return {
    ok: true,
    // Voltando para a fila, a divisão por impressora deixa de existir: o total
    // impresso fica em quantityProduced, como em toda peça liberada.
    partes: aindaImprimindo ? (Object.keys(novas).length ? novas : null) : null,
    reserva,
    pausas: { [maquina]: agoraISO },
    voltaParaAFila: !aindaImprimindo,
    impressasNaMaquina: parte.impressas,
    restante,
    principal: aindaImprimindo ? (Object.entries(novas).sort((a, b) => restanteNaMaquina(b[1]) - restanteNaMaquina(a[1]))[0]?.[0] ?? null) : null,
  };
}

/**
 * DEVOLVER A PEÇA INTEIRA À FILA, como liberada: cada parte ainda ativa vira
 * reserva (marcada) da impressora onde estava; as impressas ficam no total.
 * É a mesma saída da pausa, para quem não passa pela pausa: o descancelar de
 * uma peça que estava em impressão (não pode voltar ocupando uma impressora
 * sem checar) e o lançamento que esgota a última parte ativa com resto ainda
 * reservado/sem impressora (a peça não pode ficar "Em Impressão" em lugar nenhum).
 */
export function devolverTudoAFila(p: PecaReservavel, agoraISO: string): { reserva: ReservaPorMaquina | null; pausas: Record<string, string> } {
  const comoEmImpressao = { ...p, status: "inProduction" };
  const reserva: ReservaPorMaquina = { ...reservaDaPeca(comoEmImpressao) };
  const pausas: Record<string, string> = {};
  for (const [m, parte] of Object.entries(partesDaPeca(comoEmImpressao))) {
    const restante = restanteNaMaquina(parte);
    if (restante <= 0 || !MAQUINAS_DE_IMPRESSAO.includes(m)) continue;
    reserva[m] = (reserva[m] ?? 0) + restante;
    pausas[m] = agoraISO;
  }
  return { reserva: lerReserva(reserva), pausas };
}

/** O nome do lock consultivo de uma impressora (pg_advisory_xact_lock(hashtext(...))). */
export const chaveDoLockDaImpressora = (maquina: string) => `impressora:${maquina}`;

/**
 * UMA PEÇA POR VEZ POR IMPRESSORA (dono, 21/09: "caso a impressora esteja
 * imprimindo algo, não dá para colocar outra"). Entre as peças em impressão,
 * quem ocupa `maquina` — tem parte ATIVA nela — que não seja `excetoId`
 * (a mesma peça pode somar parte à impressora onde já está).
 */
export function ocupanteDaImpressora<P extends PecaReservavel & { id: string }>(emImpressao: P[], maquina: string, excetoId?: string | null): P | null {
  for (const p of emImpressao) {
    if (p.id === excetoId || !EM_IMPRESSAO.includes(p.status ?? "")) continue;
    const parte = partesDaPeca(p)[maquina];
    if (parte && restanteNaMaquina(parte) > 0) return p;
  }
  return null;
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

/**
 * Quanto PODE ir para `maquina` agora: o reservado a ela + o que está sem
 * impressora (o reservado a OUTRAS impressoras não entra).
 */
export const disponivelParaAMaquina = (p: PecaReservavel, maquina: string | null | undefined): number =>
  semImpressora(p) + (maquina ? reservaDaPeca(p)[maquina] ?? 0 : 0);

/** "Impressora 1 (20) · Impressora 2 (14)" — a reserva em uma linha. */
export function resumoDaReserva(r: ReservaPorMaquina | null | undefined): string {
  const limpa = lerReserva(r);
  return limpa ? Object.entries(limpa).map(([m, n]) => `${rotuloDaMaquina(m)} (${n})`).join(" · ") : "";
}

/** "por imprimir" de uma parte — reexportado para a tela não importar dois módulos. */
export { restanteNaMaquina };
