// ─────────────────────────────────────────────────────────────────────────────
// O ESTADO DA OPERAÇÃO — a régua única da nova Análises (dono, 01–02/10:
// "gestão completa de status, como dashboard, de todas as fases").
//
// PORQUÊ ESTE ARQUIVO. A Análises ganhou abas (Visão geral, uma por fase,
// Eventos, Desempenho…) e cada uma conta peças: quantas em cada etapa, quantas
// atrasadas, há quanto tempo paradas. Se cada aba fizesse a sua conta, o "12
// atrasadas" da Visão geral e o "11 atrasadas" da aba Arte seriam dois números
// para a mesma pergunta — e o gestor desconfiaria da tela inteira no primeiro
// que não batesse. Aqui está a ÚNICA leitura de cada peça (etapa, idade,
// prazo, atraso, marcas) e o ÚNICO resumo; as abas só agrupam e desenham.
//
// NADA É INVENTADO AQUI. Cada pedaço lê a regra que já tem dono:
//   · etapa ............ shared/fluxo-peca (etapaDaPeca) + shared/molde
//                        (molde produzido conta como entregue);
//   · idade na fase .... lib/idade-na-fase (statusChangedAt; NULL = idade
//                        DESCONHECIDA, nunca "0 dias");
//   · prazo da etapa ... os seis marcos de shared/prazo-dates, com a MESMA
//                        conta do servidor (stageDeadline + marcoIndexFor em
//                        server/services/prazo-domain.ts) — o teste
//                        analises-estado.test.ts compara as duas, dia a dia;
//   · evento fora de jogo  shared/prazo-dates (motivoEventoFinalizado): peça
//                        pendente de evento encerrado/realizado NÃO está "em
//                        andamento" — ficou para trás, e a tela diz isso à
//                        parte em vez de inflar o número de trabalho vivo;
//   · trava ............ shared/trava-da-peca (pecaTravada);
//   · fila da Correção . a regra de GET /api/items/resubmission-needed.
//
// Puro: sem React, sem rede. O "hoje" chega por parâmetro — a página usa UM
// relógio para todas as abas.
// ─────────────────────────────────────────────────────────────────────────────
import { ETAPAS_DA_PECA, FUNIL_DE_PRAZOS, STATUS_DA_ETAPA, etapaDaPeca, type EtapaDaPeca } from "@shared/fluxo-peca";
import { statusParaContagem } from "@shared/molde";
import {
  MARCOS_DO_EVENTO, diaDoMarcoUTC, eventDayMs, motivoEventoFinalizado, type EventoFinalizadoMotivo, type MarcoDoEvento,
} from "@shared/prazo-dates";
import { pecaTravada } from "@shared/trava-da-peca";
import { diasNaFase } from "./idade-na-fase";
import { DAY_MS, businessDayMs, instantDayMs } from "./analises-metrics";
import { getStatusLabel, getStatusMeta } from "./status";

// ─── O que a régua LÊ (estrutural) ───────────────────────────────────────────

/** O evento como a régua o lê: saída, offsets dos marcos e o que o finaliza. */
export type EventoDoEstado = {
  id: string;
  name: string;
  truckDepartureDate?: string | Date | null;
  startDate?: string | Date | null;
  status?: string | null;
  manuallyClosed?: boolean | null;
  reopenedAt?: string | Date | null;
  priority?: string | null;
} & Partial<Record<MarcoDoEvento["campo"], number | null>>;

/** A peça como a régua a lê — só os campos usados. */
export interface PecaDoEstado {
  id: string;
  eventId: string;
  status: string;
  type?: string | null;
  statusChangedAt?: string | Date | null;
  travadaEm?: string | Date | null;
  isPriority?: boolean | null;
  skipApproval?: boolean | null;
  deliveredAt?: string | Date | null;
  rejectedBySponsor?: boolean | null;
  rejectedByCreator?: boolean | null;
  sponsors?: ReadonlyArray<{ id: string; approvalStatus?: string | null }> | null;
  /**
   * O evento EMBUTIDO na peça (/api/items). Ele vence o da lista de eventos
   * porque a peça do Kit chega com as datas da REMESSA (dono, 14/09: "tem que
   * ser pela data deles") — Arte, Gráfica e Painel já cobram por elas.
   */
  event?: EventoDoEstado | null;
}

// ─── As fases (= as abas de status) ──────────────────────────────────────────

export type FaseDoFluxo = "solicitacao" | "arte" | "aprovacao" | "revisao" | "grafica" | "entregue";

/** As fases na ordem do fluxo. O id de cada uma É o id da aba da Análises. */
export const FASES_DO_FLUXO: ReadonlyArray<{ id: FaseDoFluxo; rotulo: string; setor: string }> = [
  { id: "solicitacao", rotulo: "Solicitação e Vinculação", setor: "Solicitação" },
  { id: "arte", rotulo: "Arte", setor: "Arte" },
  { id: "aprovacao", rotulo: "Aprovação", setor: "Atendimento" },
  { id: "revisao", rotulo: "Revisão Final", setor: "Revisão Final" },
  { id: "grafica", rotulo: "Gráfica", setor: "Gráfica" },
  { id: "entregue", rotulo: "Entregue", setor: "—" },
];

/**
 * Em que fase (aba) cada etapa mora. A Arte aparece DUAS vezes no fluxo — ela
 * cria o layout antes da aprovação e finaliza o arquivo depois —, e é por isso
 * que a etapa, e não a fase, é o grão da barra do fluxo.
 */
export const FASE_DA_ETAPA: Readonly<Record<EtapaDaPeca, FaseDoFluxo | null>> = {
  requested: "solicitacao",
  awaiting_linking: "solicitacao",
  awaiting_submission: "arte",
  awaiting_approval: "aprovacao",
  awaiting_finalization: "arte",
  awaiting_final_review: "revisao",
  ready_for_production: "grafica",
  approved: "grafica",
  inProduction: "grafica",
  produced: "grafica",
  conferred: "grafica",
  packed: "grafica",
  delivered: "entregue",
  canceled: null,
};

/** As etapas do fluxo vivo, da Solicitação à Entrega (sem as canceladas). */
export const ETAPAS_DO_FLUXO: readonly EtapaDaPeca[] = ETAPAS_DA_PECA.filter((e) => e !== "canceled");

/**
 * Quando a etapa junta status que a casa NOMEIA diferente, o nome da etapa
 * diz que soma. "Solicitado 5" no fluxo ao lado de "Solicitado 1" no cartão
 * (que conta só o status) parecia contradição — eram 4 rascunhos + 1.
 */
const ROTULO_QUE_SOMA: Partial<Record<EtapaDaPeca, string>> = {
  requested: "Rascunho e solicitado",
};

/** Rótulo e cor de uma etapa: os do status CANÔNICO dela, em lib/status. */
export function rotuloDaEtapa(etapa: EtapaDaPeca): string {
  return ROTULO_QUE_SOMA[etapa] ?? getStatusLabel(STATUS_DA_ETAPA[etapa][0]);
}
export function coresDaEtapa(etapa: EtapaDaPeca): { bg: string; text: string; border: string; dot: string } {
  const m = getStatusMeta(STATUS_DA_ETAPA[etapa][0]);
  return { bg: m.bg, text: m.text, border: m.border, dot: m.dot };
}

// ─── Idade ───────────────────────────────────────────────────────────────────

/** A régua da casa (lib/idade-na-fase): até 6 rotina, 7–13 pede olhar, 14+ gargalo. */
export type FaixaDeIdade = "0-6" | "7-13" | "14+" | "desconhecida";
export const FAIXAS_DE_IDADE: ReadonlyArray<{ id: FaixaDeIdade; rotulo: string }> = [
  { id: "0-6", rotulo: "Até 6 dias" },
  { id: "7-13", rotulo: "7 a 13 dias" },
  { id: "14+", rotulo: "14 dias ou mais" },
  { id: "desconhecida", rotulo: "Sem registro de quando entrou" },
];
export const DIAS_PARADA = 14;

export function faixaDaIdade(dias: number | null): FaixaDeIdade {
  if (dias == null) return "desconhecida";
  if (dias >= DIAS_PARADA) return "14+";
  if (dias >= 7) return "7-13";
  return "0-6";
}

// ─── Prazo da etapa (o espelho de prazo-domain) ──────────────────────────────

const INDICE_NO_FUNIL: Partial<Record<EtapaDaPeca, number>> = (() => {
  const m: Partial<Record<EtapaDaPeca, number>> = {};
  FUNIL_DE_PRAZOS.forEach((f, i) => f.etapas.forEach((e) => { m[e] = i; }));
  return m;
})();
const IDX_FINALIZACAO = FUNIL_DE_PRAZOS.findIndex((f) => f.key === "finalizacao");
const MARCO_POR_CHAVE = new Map<string, MarcoDoEvento>(MARCOS_DO_EVENTO.map((m) => [m.key, m]));

/**
 * O índice do marco que MEDE a peça — espelho de `marcoIndexFor`: a peça
 * isenta de aprovação (`skipApproval`) é cobrada pela Finalização enquanto
 * estiver numa etapa anterior a ela (regra do dono, 24/08).
 */
export function indiceDoMarco(etapa: EtapaDaPeca | null, skipApproval?: boolean | null): number | null {
  if (!etapa) return null;
  const rank = INDICE_NO_FUNIL[etapa];
  if (rank === undefined) return null;
  if (skipApproval && rank < IDX_FINALIZACAO) return IDX_FINALIZACAO;
  return rank;
}

/**
 * O dia do marco, em UTC-meia-noite — espelho de `stageDeadline`: offset em
 * dias de calendário sobre a saída; sábado → sexta, domingo → segunda, menos
 * na Produção Gráfica (que roda no fim de semana).
 */
export function diaDoMarco(saidaDiaMs: number, offset: number, todosOsDias: boolean): number {
  // Desde 06/10 a conta é a de @shared/prazo-dates (a mesma do servidor e do
  // Calendário) — antes era uma cópia escrita à mão aqui.
  return diaDoMarcoUTC(saidaDiaMs, offset, todosOsDias).getTime();
}

export interface PrazoDaPeca {
  /** Chave do funil (listaImagens, layouts, aprovacao, finalizacao, revisao, producao). */
  chave: string;
  rotulo: string;
  /** Dia do marco, "YYYY-MM-DD". */
  dia: string;
  diaMs: number;
  /** Dias até o marco: negativo = vencido, 0 = vence hoje. */
  diasRestantes: number;
  /** O marco não é a etapa em que a peça está (peça isenta de aprovação). */
  cobradaPorOutraEtapa: boolean;
}

// ─── A leitura de UMA peça ───────────────────────────────────────────────────

/**
 * Onde a peça está, do ponto de vista da operação:
 *   ativa ............ trabalho vivo (no funil, não entregue, evento em jogo);
 *   entregue ......... concluiu (inclui molde produzido);
 *   eventoFinalizado . pendente, mas o evento foi encerrado ou já aconteceu —
 *                      ninguém mais cobra; fica de fora do "em andamento";
 *   fora ............. cancelada, excluída, arquivada;
 *   desconhecida ..... status que a régua não conhece (nunca chutado).
 */
export type SituacaoDaPeca = "ativa" | "entregue" | "eventoFinalizado" | "fora" | "desconhecida";

export interface LeituraDaPeca<P extends PecaDoEstado = PecaDoEstado> {
  peca: P;
  etapa: EtapaDaPeca | null;
  fase: FaseDoFluxo | null;
  situacao: SituacaoDaPeca;
  evento: EventoDoEstado | null;
  /** Por que o evento saiu de jogo (null = em jogo). */
  eventoFinalizado: EventoFinalizadoMotivo | null;
  /** Dias desde a última troca de status. `null` = sem carimbo: DESCONHECIDA. */
  diasNaFase: number | null;
  faixaDeIdade: FaixaDeIdade;
  /** O marco que mede a peça; `null` fora do funil ou sem data de saída válida. */
  prazo: PrazoDaPeca | null;
  /** Passou do marco da etapa (só peça ativa). */
  atrasada: boolean;
  diasDeAtraso: number;
  travada: boolean;
  prioritaria: boolean;
}

export type LeitorDePeca<P extends PecaDoEstado = PecaDoEstado> = (p: P) => LeituraDaPeca<P>;

/**
 * Lê UMA peça. `hojeDiaMs` é o dia do negócio (UTC-meia-noite, fuso de
 * Brasília) — o mesmo "hoje" do servidor; `hoje` é o instante, para a idade.
 */
export function lerPeca<P extends PecaDoEstado>(
  p: P,
  eventoDaLista: EventoDoEstado | null | undefined,
  hoje: Date,
  hojeDiaMs: number = businessDayMs(hoje.getTime()),
): LeituraDaPeca<P> {
  const evento = (p.event && p.event.truckDepartureDate !== undefined ? { ...eventoDaLista, ...p.event } : eventoDaLista) ?? null;
  const etapa = etapaDaPeca(statusParaContagem(p));
  const fase = etapa ? FASE_DA_ETAPA[etapa] : null;
  const eventoFinalizado = motivoEventoFinalizado(evento, hojeDiaMs);
  const situacao: SituacaoDaPeca =
    !etapa ? "desconhecida"
      : etapa === "canceled" ? "fora"
        : etapa === "delivered" ? "entregue"
          : eventoFinalizado ? "eventoFinalizado"
            : "ativa";

  const dias = diasNaFase(p, hoje);

  let prazo: PrazoDaPeca | null = null;
  if (situacao === "ativa" || situacao === "eventoFinalizado") {
    const idx = indiceDoMarco(etapa, p.skipApproval);
    const saida = eventDayMs(evento?.truckDepartureDate ?? null);
    if (idx != null && saida != null) {
      const def = FUNIL_DE_PRAZOS[idx];
      const marco = MARCO_POR_CHAVE.get(def.key)!;
      const offset = (evento?.[marco.campo] as number | null | undefined) ?? marco.offset;
      const diaMs = diaDoMarco(saida, offset, marco.todosOsDias);
      prazo = {
        chave: def.key,
        rotulo: def.label,
        dia: new Date(diaMs).toISOString().slice(0, 10),
        diaMs,
        diasRestantes: Math.round((diaMs - hojeDiaMs) / DAY_MS),
        cobradaPorOutraEtapa: idx !== INDICE_NO_FUNIL[etapa!],
      };
    }
  }
  // "completed" é produção terminada (prazo-domain, isPrazoCandidate): sem cobrança.
  const atrasada = situacao === "ativa" && evento?.status !== "completed" && !!prazo && prazo.diasRestantes < 0;

  return {
    peca: p,
    etapa,
    fase,
    situacao,
    evento,
    eventoFinalizado,
    diasNaFase: dias,
    faixaDeIdade: faixaDaIdade(dias),
    prazo,
    atrasada,
    diasDeAtraso: atrasada && prazo ? -prazo.diasRestantes : 0,
    travada: pecaTravada(p),
    prioritaria: !!p.isPriority,
  };
}

/**
 * Leitor memoizado por peça (WeakMap pela identidade do objeto): a página
 * cria UM por (eventos, dia), e todas as abas leem pelo mesmo — a peça é lida
 * uma vez, não uma vez por aba.
 */
export function criarLeitor<P extends PecaDoEstado>(
  eventoPorId: ReadonlyMap<string, EventoDoEstado>,
  hoje: Date,
): LeitorDePeca<P> {
  const hojeDiaMs = businessDayMs(hoje.getTime());
  const cache = new WeakMap<P, LeituraDaPeca<P>>();
  return (p: P) => {
    let l = cache.get(p);
    if (!l) {
      l = lerPeca(p, eventoPorId.get(p.eventId), hoje, hojeDiaMs);
      cache.set(p, l);
    }
    return l;
  };
}

// ─── Filtros do topo ─────────────────────────────────────────────────────────

export interface FiltrosDoEstado {
  evento: string;
  patrocinador: string;
  tipo: string;
  soAtrasadas: boolean;
  soTravadas: boolean;
  soPrioritarias: boolean;
}

/**
 * O tipo é texto livre no cadastro: "Banner", "banner " e "BANNER" são a mesma
 * coisa (a mesma união que a tabela de ofensores já faz).
 */
export function chaveDoTipo(tipo: string | null | undefined): string {
  return (tipo ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

/** As opções do filtro de tipo: uma por chave, com a grafia mais frequente. */
export function opcoesDeTipo(pecas: ReadonlyArray<PecaDoEstado>): { value: string; label: string; count: number }[] {
  const porChave = new Map<string, { n: number; grafias: Map<string, number> }>();
  for (const p of pecas) {
    const k = chaveDoTipo(p.type);
    if (!k) continue;
    let g = porChave.get(k);
    if (!g) porChave.set(k, (g = { n: 0, grafias: new Map() }));
    g.n += 1;
    const grafia = (p.type ?? "").trim();
    g.grafias.set(grafia, (g.grafias.get(grafia) ?? 0) + 1);
  }
  return Array.from(porChave, ([value, g]) => {
    let label = value;
    let melhor = -1;
    g.grafias.forEach((n, grafia) => { if (n > melhor) { melhor = n; label = grafia; } });
    return { value, label, count: g.n };
  });
}

/** Aplica os filtros do topo. Os atalhos SOMAM (atrasadas E travadas). */
export function filtrarPecas<P extends PecaDoEstado>(pecas: P[], f: FiltrosDoEstado, ler: LeitorDePeca<P>): P[] {
  const nada = f.evento === "all" && f.patrocinador === "all" && f.tipo === "all"
    && !f.soAtrasadas && !f.soTravadas && !f.soPrioritarias;
  if (nada) return pecas;
  return pecas.filter((p) => {
    if (f.evento !== "all" && p.eventId !== f.evento) return false;
    // `sponsors[]` é o que a rota devolve — nunca `sponsorIds` (analises-metrics).
    if (f.patrocinador !== "all" && !(p.sponsors ?? []).some((s) => s?.id === f.patrocinador)) return false;
    if (f.tipo !== "all" && chaveDoTipo(p.type) !== f.tipo) return false;
    if (f.soAtrasadas || f.soTravadas || f.soPrioritarias) {
      const l = ler(p);
      if (f.soAtrasadas && !l.atrasada) return false;
      if (f.soTravadas && !l.travada) return false;
      if (f.soPrioritarias && !l.prioritaria) return false;
    }
    return true;
  });
}

// ─── Grupos ──────────────────────────────────────────────────────────────────

/** Um conjunto de peças com o estado já separado — todo número clicável sai daqui. */
export interface GrupoDePecas<P extends PecaDoEstado = PecaDoEstado> {
  pecas: P[];
  atrasadas: P[];
  /** Paradas há 14 dias ou mais na mesma etapa. */
  paradas: P[];
  travadas: P[];
  prioritarias: P[];
  idade: Record<FaixaDeIdade, P[]>;
  /** Mediana dos dias na fase, só das que têm carimbo. */
  diasMediana: number | null;
  /** A parada há mais tempo (com carimbo). */
  maisAntiga: LeituraDaPeca<P> | null;
  /** A mais atrasada. */
  piorAtraso: LeituraDaPeca<P> | null;
}

export function grupoVazio<P extends PecaDoEstado>(): GrupoDePecas<P> {
  return {
    pecas: [], atrasadas: [], paradas: [], travadas: [], prioritarias: [],
    idade: { "0-6": [], "7-13": [], "14+": [], desconhecida: [] },
    diasMediana: null, maisAntiga: null, piorAtraso: null,
  };
}

function somar<P extends PecaDoEstado>(g: GrupoDePecas<P>, l: LeituraDaPeca<P>, dias: number[]): void {
  const p = l.peca;
  g.pecas.push(p);
  if (l.atrasada) g.atrasadas.push(p);
  if (l.faixaDeIdade === "14+") g.paradas.push(p);
  if (l.travada) g.travadas.push(p);
  if (l.prioritaria) g.prioritarias.push(p);
  g.idade[l.faixaDeIdade].push(p);
  if (l.diasNaFase != null) {
    dias.push(l.diasNaFase);
    if (!g.maisAntiga || l.diasNaFase > (g.maisAntiga.diasNaFase ?? -1)) g.maisAntiga = l;
  }
  if (l.atrasada && (!g.piorAtraso || l.diasDeAtraso > g.piorAtraso.diasDeAtraso)) g.piorAtraso = l;
}

function mediana(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** O grupo de qualquer recorte de peças (as abas usam para os seus baldes). */
export function resumirGrupo<P extends PecaDoEstado>(pecas: ReadonlyArray<P>, ler: LeitorDePeca<P>): GrupoDePecas<P> {
  const g = grupoVazio<P>();
  const dias: number[] = [];
  for (const p of pecas) somar(g, ler(p), dias);
  g.diasMediana = mediana(dias);
  return g;
}

// ─── O resumo da operação ────────────────────────────────────────────────────

export interface EtapaNoEstado<P extends PecaDoEstado = PecaDoEstado> extends GrupoDePecas<P> {
  etapa: EtapaDaPeca;
  rotulo: string;
  fase: FaseDoFluxo | null;
  cores: { bg: string; text: string; border: string; dot: string };
  /** As grafias de status dentro da etapa, com o rótulo da casa ("Rascunho", "Solicitado"). */
  porStatus: { status: string; rotulo: string; pecas: P[] }[];
}

export interface FaseNoEstado<P extends PecaDoEstado = PecaDoEstado> extends GrupoDePecas<P> {
  fase: FaseDoFluxo;
  rotulo: string;
  etapas: EtapaDaPeca[];
}

export interface EventoNoEstado<P extends PecaDoEstado = PecaDoEstado> extends GrupoDePecas<P> {
  eventoId: string;
  nome: string;
  /** Saída do caminhão (UTC-meia-noite) ou null quando o cadastro não tem data válida. */
  saidaDiaMs: number | null;
  diasParaSaida: number | null;
  /** Peças ATIVAS por etapa. */
  porEtapa: Map<EtapaDaPeca, P[]>;
}

export interface EstadoDaOperacao<P extends PecaDoEstado = PecaDoEstado> {
  /** Todas as peças do recorte (inclui entregues e fora do funil). */
  total: P[];
  /** Trabalho vivo: no funil, não entregue, evento em jogo. */
  ativas: GrupoDePecas<P>;
  entregues: P[];
  foraDoFunil: P[];
  /** Pendentes de evento encerrado/realizado — ficaram para trás. */
  deEventoFinalizado: P[];
  statusDesconhecido: P[];
  /** Ativas cujo evento não tem saída válida: sem prazo para medir. */
  semPrazo: P[];
  /** Entregas com data nos últimos `janelaDias` dias, e quantas chegaram até a saída do caminhão. */
  entreguesRecentes: { janelaDias: number; pecas: P[]; noPrazo: P[]; foraDoPrazo: P[]; semSaida: P[] };
  /** Todas as etapas do fluxo, na ordem (a entregue conta TODAS as entregues). */
  porEtapa: EtapaNoEstado<P>[];
  porFase: Record<FaseDoFluxo, FaseNoEstado<P>>;
  /** Etapas com peça ativa, da maior fila para a menor. */
  maioresFilas: EtapaNoEstado<P>[];
  /** Ativas com idade conhecida, da parada há mais tempo para a mais recente. */
  maisParadas: LeituraDaPeca<P>[];
  /** Eventos com peça ativa — mais atrasadas primeiro, depois mais peças. */
  porEvento: EventoNoEstado<P>[];
}

export const JANELA_DE_ENTREGAS_DIAS = 30;

export function resumirEstado<P extends PecaDoEstado>(
  pecas: P[],
  ler: LeitorDePeca<P>,
  hoje: Date,
  janelaDias = JANELA_DE_ENTREGAS_DIAS,
): EstadoDaOperacao<P> {
  const hojeDiaMs = businessDayMs(hoje.getTime());
  const desdeMs = hojeDiaMs - (janelaDias - 1) * DAY_MS;

  const ativas = grupoVazio<P>();
  const diasAtivas: number[] = [];
  const entregues: P[] = [];
  const foraDoFunil: P[] = [];
  const deEventoFinalizado: P[] = [];
  const statusDesconhecido: P[] = [];
  const semPrazo: P[] = [];
  const recentes = { janelaDias, pecas: [] as P[], noPrazo: [] as P[], foraDoPrazo: [] as P[], semSaida: [] as P[] };

  const porEtapaG = new Map<EtapaDaPeca, { g: GrupoDePecas<P>; dias: number[]; status: Map<string, P[]> }>();
  for (const e of ETAPAS_DO_FLUXO) porEtapaG.set(e, { g: grupoVazio<P>(), dias: [], status: new Map() });
  const porEventoG = new Map<string, { g: GrupoDePecas<P>; dias: number[]; ev: EventoDoEstado | null; porEtapa: Map<EtapaDaPeca, P[]> }>();
  const maisParadas: LeituraDaPeca<P>[] = [];

  for (const p of pecas) {
    const l = ler(p);
    switch (l.situacao) {
      case "desconhecida": statusDesconhecido.push(p); continue;
      case "fora": foraDoFunil.push(p); continue;
      case "eventoFinalizado": deEventoFinalizado.push(p); continue;
      case "entregue": {
        entregues.push(p);
        const slot = porEtapaG.get("delivered")!;
        slot.g.pecas.push(p);
        const st = String(p.status);
        const doStatus = slot.status.get(st);
        if (doStatus) doStatus.push(p); else slot.status.set(st, [p]);
        const dia = instantDayMs(p.deliveredAt ?? null);
        if (dia != null && dia >= desdeMs && dia <= hojeDiaMs) {
          recentes.pecas.push(p);
          const saida = eventDayMs(l.evento?.truckDepartureDate ?? null);
          if (saida == null) recentes.semSaida.push(p);
          else if (dia <= saida) recentes.noPrazo.push(p);
          else recentes.foraDoPrazo.push(p);
        }
        continue;
      }
      case "ativa": break;
    }
    somar(ativas, l, diasAtivas);
    if (!l.prazo) semPrazo.push(p);
    if (l.diasNaFase != null) maisParadas.push(l);

    const slot = porEtapaG.get(l.etapa!)!;
    somar(slot.g, l, slot.dias);
    const st = String(p.status);
    const lista = slot.status.get(st);
    if (lista) lista.push(p); else slot.status.set(st, [p]);

    let ev = porEventoG.get(p.eventId);
    if (!ev) porEventoG.set(p.eventId, (ev = { g: grupoVazio<P>(), dias: [], ev: l.evento, porEtapa: new Map() }));
    somar(ev.g, l, ev.dias);
    const pe = ev.porEtapa.get(l.etapa!);
    if (pe) pe.push(p); else ev.porEtapa.set(l.etapa!, [p]);
  }
  ativas.diasMediana = mediana(diasAtivas);

  const porEtapa: EtapaNoEstado<P>[] = ETAPAS_DO_FLUXO.map((etapa) => {
    const slot = porEtapaG.get(etapa)!;
    slot.g.diasMediana = mediana(slot.dias);
    // A ordem das grafias é a de STATUS_DA_ETAPA (canônica primeiro); o que
    // não estiver lá (não deveria) vai ao fim, para nunca sumir.
    const ordem = STATUS_DA_ETAPA[etapa];
    const porStatus = Array.from(slot.status, ([status, ps]) => ({ status, rotulo: getStatusLabel(status), pecas: ps }))
      .sort((a, b) => (ordem.indexOf(a.status) + 1 || 99) - (ordem.indexOf(b.status) + 1 || 99));
    return { ...slot.g, etapa, rotulo: rotuloDaEtapa(etapa), fase: FASE_DA_ETAPA[etapa], cores: coresDaEtapa(etapa), porStatus };
  });

  const porFase = {} as Record<FaseDoFluxo, FaseNoEstado<P>>;
  for (const f of FASES_DO_FLUXO) {
    const etapas = ETAPAS_DO_FLUXO.filter((e) => FASE_DA_ETAPA[e] === f.id);
    const membros = porEtapa.filter((e) => e.fase === f.id);
    const g = f.id === "entregue"
      ? { ...grupoVazio<P>(), pecas: entregues }
      : resumirGrupo(membros.flatMap((m) => m.pecas), ler);
    porFase[f.id] = { ...g, fase: f.id, rotulo: f.rotulo, etapas: [...etapas] };
  }

  const maioresFilas = porEtapa
    .filter((e) => e.etapa !== "delivered" && e.pecas.length > 0)
    .sort((a, b) => b.pecas.length - a.pecas.length || ETAPAS_DO_FLUXO.indexOf(a.etapa) - ETAPAS_DO_FLUXO.indexOf(b.etapa));

  maisParadas.sort((a, b) => (b.diasNaFase ?? 0) - (a.diasNaFase ?? 0));

  const porEvento: EventoNoEstado<P>[] = Array.from(porEventoG, ([eventoId, v]) => {
    v.g.diasMediana = mediana(v.dias);
    const saidaDiaMs = eventDayMs(v.ev?.truckDepartureDate ?? null);
    return {
      ...v.g,
      eventoId,
      nome: v.ev?.name ?? "Evento não encontrado",
      saidaDiaMs,
      diasParaSaida: saidaDiaMs == null ? null : Math.round((saidaDiaMs - hojeDiaMs) / DAY_MS),
      porEtapa: v.porEtapa,
    };
  }).sort((a, b) =>
    b.atrasadas.length - a.atrasadas.length
    || b.pecas.length - a.pecas.length
    || a.nome.localeCompare(b.nome, "pt-BR"));

  return {
    total: pecas,
    ativas,
    entregues,
    foraDoFunil,
    deEventoFinalizado,
    statusDesconhecido,
    semPrazo,
    entreguesRecentes: recentes,
    porEtapa,
    porFase,
    maioresFilas,
    maisParadas,
    porEvento,
  };
}

// ─── As filas da Arte ────────────────────────────────────────────────────────

/**
 * A fila da CORREÇÃO, com a regra de GET /api/items/resubmission-needed: a
 * peça esperando patrocinador com alguma linha devolvida à Arte
 * (`awaiting_arte`), OU a devolvida inteira (`awaiting_submission` +
 * `rejectedBySponsor`). É um RECORTE das filas de status: a peça continua
 * contando também na fila do status em que está, como na própria tela da Arte.
 */
export function ehCorrecaoDaArte(p: PecaDoEstado): boolean {
  if (p.status === "awaiting_sponsor_approval") return (p.sponsors ?? []).some((s) => s?.approvalStatus === "awaiting_arte");
  return p.status === "awaiting_submission" && p.rejectedBySponsor === true;
}

export type IdDaFilaDaArte = "criar-aprovacoes" | "aguardando-patrocinador" | "correcao" | "finalizar-layouts";

/**
 * As filas que a Arte vê (lib/arte-rules, TAB_STATUSES), lidas pela ETAPA
 * canônica: a etapa inclui as grafias que a lista da aba não cita
 * (`awaiting_approval`, `awaiting_finalization`) — se uma peça foi gravada
 * assim, ela existe e precisa aparecer em algum lugar.
 */
/** `curto` é o rótulo do cartão (cabe inteiro numa coluna de 200px). */
export const FILAS_DA_ARTE: ReadonlyArray<{ id: IdDaFilaDaArte; rotulo: string; curto: string; etapa: EtapaDaPeca | null; frase: string }> = [
  { id: "criar-aprovacoes", rotulo: "Criar aprovações", curto: "Criar aprovações", etapa: "awaiting_submission", frase: "A Arte sobe o thumb e envia para aprovação" },
  { id: "aguardando-patrocinador", rotulo: "Aguardando patrocinador", curto: "No patrocinador", etapa: "awaiting_approval", frase: "Esperando a decisão registrada pelo Atendimento" },
  { id: "correcao", rotulo: "Correção", curto: "Correção", etapa: null, frase: "Reprovadas pelo patrocinador — a Arte refaz" },
  { id: "finalizar-layouts", rotulo: "Finalizar layouts", curto: "Finalizar layouts", etapa: "awaiting_finalization", frase: "Aprovadas: a Arte anexa o arquivo final" },
];

export function pecasDaFilaDaArte<P extends PecaDoEstado>(fila: IdDaFilaDaArte, ativas: ReadonlyArray<P>, ler: LeitorDePeca<P>): P[] {
  const def = FILAS_DA_ARTE.find((f) => f.id === fila)!;
  if (fila === "correcao") return ativas.filter(ehCorrecaoDaArte);
  return ativas.filter((p) => ler(p).etapa === def.etapa);
}
