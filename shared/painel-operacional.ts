// ─────────────────────────────────────────────────────────────────────────────
// PAINEL OPERACIONAL DA GRÁFICA — a regra, num lugar só (dono, 16/10: "subir
// isso no Análises, no nosso layout, exatamente esses dados").
//
// DE ONDE VEIO. Alguém da empresa fez, fora do app, o painel "Gestão gráfica —
// painel operacional" lendo /api/items e /api/prazos. A camada de dados dele
// (`dados.js`, `buildDatasets`) é a referência das DEFINIÇÕES — indicadores,
// gráficos, filtros e parâmetros. Este arquivo é o porte dela para o app, puro
// e testado (server/__tests__/painel-operacional.test.ts). O servidor monta os
// conjuntos (GET /api/analises/painel-operacional); a tela só recorta e desenha
// com as funções de derivação daqui de baixo — nenhum número é calculado duas
// vezes nem em dois lugares.
//
// O QUE É DO APP E NÃO FOI REINVENTADO:
//   · eventos ativos, prazos de cada fase, categoria do evento, peças em
//     atraso por evento e os KPIs de evento: a Gestão de Prazos
//     (`buildEventPrazo` + `computeKpis`, server/services/prazo-domain.ts) — a
//     rota entrega aqui os `PrazoEvent` prontos, exatamente como /api/prazos;
//   · o marco que cobra cada peça (`marcoIndex` de pendingItems: peça isenta
//     de aprovação é cobrada pela Finalização);
//   · a etapa da peça: `etapaDaPeca` (shared/fluxo-peca) com as grafias
//     legadas, e o molde produzido contando como entregue (shared/molde);
//   · o dia do negócio (America/Sao_Paulo) de shared/prazo-dates.
//
// ONDE A REGRA DO APP VENCEU A DO dados.js (documentado no rodapé da tela):
//   · peça em "Lista de imagens" (rascunho, solicitado, aguardando vinculação)
//     é peça EM ABERTO na fase 0 — lá ela caía em "Entregue" por não ter fase
//     no mapa de status; aqui conta em aberto, entra no planejado da produção
//     (ainda em pré-produção) e precisa passar por layout→revisão;
//   · BOOK COMPLETO não é peça (shared/fluxo-peca) e fica fora de tudo;
//   · toda grafia de cancelada (canceled, cancelled, deleted, archived) sai,
//     não só "canceled";
//   · evento com data de saída inválida aparece como "Data inválida" (lá virava
//     "Sem peças").
//
// UNIDADES E m². Unidades a produzir = quantidade − reaproveitadas. m² por
// unidade = largura × altura do ARQUIVO (sem ela, a medida visual); m² da peça
// = m² por unidade × unidades a produzir. `calculatedM2` não entra: ele é o
// total da quantidade INTEIRA e não desconta o reaproveitamento.
//
// DATAS. Todo dia é "YYYY-MM-DD" do negócio. Dia útil = segunda a sábado.
// ─────────────────────────────────────────────────────────────────────────────
import { SP_DAY_FMT, DIAS_DA_GRAFICA, venceNoDia } from "./prazo-dates";
import { FUNIL_DE_PRAZOS, ehBookCompleto, etapaDaPeca, type EtapaDaPeca } from "./fluxo-peca";
import { comStatusDeContagem } from "./molde";
import type { PrazoCategoria, PrazoEvent, PrazoKpis, StageState } from "./prazos-contract";

// ─── Entrada ─────────────────────────────────────────────────────────────────

type Instante = Date | string | null | undefined;

/** A peça como o painel a lê — só as colunas usadas (a rota busca só estas). */
export interface PecaDoPainel {
  id: string;
  displayId: string;
  eventId: string;
  kitRemessaId?: string | null;
  status: string;
  type?: string | null;
  description?: string | null;
  measurement?: string | null;
  material?: string | null;
  finish?: string | null;
  quantity?: number | null;
  reuseQty?: number | null;
  fileWidth?: string | number | null;
  fileHeight?: string | number | null;
  visualWidth?: string | number | null;
  visualHeight?: string | number | null;
  quantityProduced?: number | null;
  skipApproval?: boolean | null;
  isPriority?: boolean | null;
  parentItemId?: string | null;
  complementReason?: string | null;
  rejectedBySponsor?: boolean | null;
  rejectedByCreator?: boolean | null;
  createdAt?: Instante;
  approvalThumbUpdatedAt?: Instante;
  statusChangedAt?: Instante;
  sponsorApprovedAt?: Instante;
  finalFileUpdatedAt?: Instante;
  creatorReviewedAt?: Instante;
  producedAt?: Instante;
  conferredAt?: Instante;
}

export interface EntradaDoPainel {
  /** Peças não excluídas: as dos eventos ativos + as que têm data na janela do realizado. */
  pecas: ReadonlyArray<PecaDoPainel>;
  /** Os eventos da Gestão de Prazos, como /api/prazos os devolve (já ordenados pela saída). */
  prazos: ReadonlyArray<PrazoEvent>;
  kpis: PrazoKpis;
  /** Dia do negócio, "YYYY-MM-DD". */
  hoje: string;
  /** ISO do instante da montagem. */
  geradoEm: string;
  /** id do evento → nome (para o realizado de evento que já saiu dos prazos). */
  nomeDoEvento: ReadonlyMap<string, string>;
  /** Remessas do Kit que existem — a peça de remessa desconhecida conta na Arena (como em eventosDoPrazo). */
  remessasConhecidas: ReadonlySet<string>;
}

// ─── Saída (o contrato de GET /api/analises/painel-operacional) ─────────────

export const JANELA_DO_REALIZADO_DIAS = 60;

export type ProcessoDeProducao = "impressao" | "acabamento";
export type ProcessoDePre = "cadastro" | "layout" | "aprovacao" | "finalizacao" | "revisao";
export type SituacaoDoPlanejado = "atrasado" | "liberado" | "preProducao";
export type SituacaoDaFase = "Concluída" | "Atrasada" | "Vence em breve" | "No prazo";
export type SituacaoDoEvento = "Atrasado" | "Em dia" | "Sem peças" | "Data inválida";

/** Fases na ordem do funil (índice = índice de `stages`), mais "Entregue" (6). */
export const FASES_DO_PAINEL = [
  "Lista de imagens", "Entrega de layout", "Aprovação de layout", "Finalização", "Revisão final", "Produção gráfica", "Entregue",
] as const;
export const FASE_ENTREGUE = 6;
export const FASE_PRODUCAO = 5;

export interface FaseDoEvento {
  ordem: number; // 0..5
  etapa: string;
  prazo: string;
  pendentes: number;
  dias: number;
  situacao: SituacaoDaFase;
}

export interface EventoDoPainel {
  /** Chave da linha (a do Kit é `<evento>#kit-<remessa>`, como na Gestão de Prazos). */
  chave: string;
  eventoId: string;
  nome: string;
  dataEvento: string;
  saidaCaminhao: string;
  situacao: SituacaoDoEvento;
  diasParaSaida: number | null;
  totalPecas: number;
  entregues: number;
  pecasEmAtraso: number;
  piorAtrasoDias: number;
  fases: FaseDoEvento[];
}

export interface LinhaDeProducaoRealizada { dia: string; evento: string; processo: ProcessoDeProducao; itens: number; unidades: number; m2: number }
export interface LinhaDePreRealizada { dia: string; evento: string; processo: ProcessoDePre; itens: number; unidades: number }
export interface LinhaDeProducaoPlanejada { dia: string; evento: string; processo: ProcessoDeProducao; situacao: SituacaoDoPlanejado; itens: number; unidades: number; m2: number }
export interface LinhaDePrePlanejada { dia: string; evento: string; processo: Exclude<ProcessoDePre, "cadastro">; atrasado: boolean; itens: number; unidades: number }

/** Uma peça de evento ativo. */
export interface PecaDaLinha {
  id: string;
  displayId: string;
  /** Chave do evento (EventoDoPainel.chave). */
  evento: string;
  eventoId: string;
  tipo: string;
  descricao: string;
  medida: string;
  material: string;
  acabamento: string;
  /** Quantidade cadastrada. */
  quantidade: number;
  reuso: number;
  /** Unidades a produzir (quantidade − reuso). */
  unidades: number;
  /** m² a produzir (m² por unidade × unidades a produzir). */
  m2: number;
  status: string;
  etapa: EtapaDaPeca | null;
  /** 0..5 = fase do funil; 6 = entregue. */
  fase: number;
  /** Prazo do marco que cobra a peça (null na entregue). */
  prazoFase: string | null;
  diasAtraso: number;
  /** Prazo da Produção Gráfica do evento. */
  prazoProducao: string;
  impresso: boolean;
  impressoEm: string | null;
  acabado: boolean;
  acabadoEm: string | null;
  furaFila: boolean;
  refacao: boolean;
  motivoRefacao: string;
  reprovada: boolean;
  semAprovacao: boolean;
}

export interface ResumoDoPainel {
  pecasAbertas: number;
  atrasadasAbertas: number;
  furaFilaAbertas: number;
  refacoesAbertas: number;
  reprovadasAbertas: number;
  m2Impresso7d: number;
  m2AImprimir: number;
}

export interface PainelOperacional {
  geradoEm: string;
  hoje: string;
  janelaDoRealizadoDias: number;
  /** KPIs da Gestão de Prazos (eventos atrasados, peças fora do prazo, saídas em 7 dias…). */
  kpis: PrazoKpis;
  resumo: ResumoDoPainel;
  eventos: EventoDoPainel[];
  /** chave → nome, de todo evento citado nas séries (inclusive os que já saíram dos prazos). */
  nomes: Record<string, string>;
  prodRealizado: LinhaDeProducaoRealizada[];
  preRealizado: LinhaDePreRealizada[];
  prodPlanejado: LinhaDeProducaoPlanejada[];
  prePlanejado: LinhaDePrePlanejada[];
  pecas: PecaDaLinha[];
}

// ─── Datas (dia do negócio, "YYYY-MM-DD") ────────────────────────────────────

const meioDia = (d: string) => new Date(`${d}T12:00:00Z`);

export function somarDias(d: string, n: number): string {
  const t = meioDia(d);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

/** Dia útil da gráfica: segunda a sábado — `DIAS_DA_GRAFICA`, a mesma regra do prazo da Produção Gráfica (@shared/prazo-dates). */
export const ehDiaUtil = (d: string): boolean => venceNoDia(meioDia(d).getUTCDay(), DIAS_DA_GRAFICA);

export const diasEntre = (a: string, b: string): number => Math.round((meioDia(a).getTime() - meioDia(b).getTime()) / 86_400_000);

/** Dias de a até b (inclusive); `soUteis` tira os domingos. */
export function diasDoIntervalo(a: string, b: string, soUteis = true): string[] {
  const out: string[] = [];
  for (let d = a; d <= b; d = somarDias(d, 1)) if (!soUteis || ehDiaUtil(d)) out.push(d);
  return out;
}

export const DIAS_DA_SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"] as const;
export const diaDaSemana = (d: string): string => DIAS_DA_SEMANA[meioDia(d).getUTCDay()];

/** Instante → dia do negócio (America/Sao_Paulo); null sem data válida. */
export function diaDoNegocio(v: Instante): string | null {
  if (v == null || v === "") return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isFinite(d.getTime()) ? SP_DAY_FMT.format(d) : null;
}

// ─── Peça: unidades, m², etapa ───────────────────────────────────────────────

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
};

/** Unidades a produzir = quantidade − reaproveitadas (nunca negativo). */
export const unidadesAProduzir = (p: Pick<PecaDoPainel, "quantity" | "reuseQty">): number =>
  Math.max(0, num(p.quantity) - num(p.reuseQty));

/** m² de UMA unidade: arquivo (largura × altura); sem ele, a medida visual; sem nenhuma, 0. */
export function m2PorUnidade(p: Pick<PecaDoPainel, "fileWidth" | "fileHeight" | "visualWidth" | "visualHeight">): number {
  const w = num(p.fileWidth), h = num(p.fileHeight);
  if (w > 0 && h > 0) return w * h;
  const vw = num(p.visualWidth), vh = num(p.visualHeight);
  if (vw > 0 && vh > 0) return vw * vh;
  return 0;
}

const INDICE_DA_ETAPA: Partial<Record<EtapaDaPeca, number>> = (() => {
  const m: Partial<Record<EtapaDaPeca, number>> = {};
  FUNIL_DE_PRAZOS.forEach((f, i) => f.etapas.forEach((e) => { m[e] = i; }));
  m.delivered = FASE_ENTREGUE;
  return m;
})();

/** Etapa canônica (molde produzido = entregue) e fase do painel (null = cancelada ou desconhecida). */
export function faseDaPeca(p: Pick<PecaDoPainel, "status" | "type">): { etapa: EtapaDaPeca | null; fase: number | null } {
  const etapa = etapaDaPeca(comStatusDeContagem({ status: p.status, type: p.type ?? null }).status);
  const fase = etapa ? INDICE_DA_ETAPA[etapa] : undefined;
  return { etapa, fase: fase === undefined ? null : fase };
}

/** Já saiu toda da impressora (Impresso/Acabamento ou depois). */
const IMPRESSAS: ReadonlySet<EtapaDaPeca> = new Set<EtapaDaPeca>(["produced", "conferred", "packed", "delivered"]);
/** Acabamento concluído e conferido. */
const ACABADAS: ReadonlySet<EtapaDaPeca> = new Set<EtapaDaPeca>(["conferred", "packed", "delivered"]);

/** Material e acabamento são texto livre: caixa alta, espaços únicos e as grafias juntadas. */
const GRAFIAS: Record<string, string> = { ILHOS: "ILHÓS", DUPLAFACE: "DUPLA FACE", "PLASTICO VERDE": "PLÁSTICO VERDE" };
export function normalizarRotulo(s: string | null | undefined): string {
  const t = String(s ?? "").trim().replace(/\s+/g, " ").toUpperCase();
  return GRAFIAS[t] ?? t;
}

const SITUACAO_DA_FASE: Record<StageState, SituacaoDaFase> = {
  done: "Concluída", overdue: "Atrasada", warning: "Vence em breve", upcoming: "No prazo",
};
const SITUACAO_DO_EVENTO: Record<PrazoCategoria, SituacaoDoEvento> = {
  atrasado: "Atrasado", emDia: "Em dia", semPecas: "Sem peças", dataInvalida: "Data inválida",
};

const r2 = (x: number) => Math.round(x * 100) / 100;

// ─── A montagem ──────────────────────────────────────────────────────────────

export function montarPainelOperacional(e: EntradaDoPainel): PainelOperacional {
  const { hoje } = e;
  const desde = somarDias(hoje, -JANELA_DO_REALIZADO_DIAS);

  const prazoPorChave = new Map<string, PrazoEvent>();
  const marcoDaPeca = new Map<string, number>();
  for (const ev of e.prazos) {
    prazoPorChave.set(`${ev.eventId ?? ev.id}|${ev.kit?.remessaId ?? ""}`, ev);
    for (const it of ev.pendingItems ?? []) marcoDaPeca.set(it.id, it.marcoIndex);
  }
  const nomes: Record<string, string> = {};
  const eventos: EventoDoPainel[] = e.prazos.map((ev) => {
    nomes[ev.id] = ev.name;
    return {
      chave: ev.id,
      eventoId: ev.eventId ?? ev.id,
      nome: ev.name,
      dataEvento: String(ev.startDate ?? "").slice(0, 10),
      saidaCaminhao: String(ev.truckDepartureDate ?? "").slice(0, 10),
      situacao: SITUACAO_DO_EVENTO[ev.categoria],
      diasParaSaida: ev.diasParaSaida,
      totalPecas: ev.totalItems,
      entregues: ev.deliveredItems,
      pecasEmAtraso: ev.pecasEmAtraso,
      piorAtrasoDias: ev.piorAtrasoDias,
      fases: ev.stages.map((s, i) => ({
        ordem: i, etapa: FASES_DO_PAINEL[i] ?? s.label, prazo: s.deadline, pendentes: s.pendingCount, dias: s.diffDays,
        situacao: SITUACAO_DA_FASE[s.state],
      })),
    };
  });

  const doKit = (p: PecaDoPainel) => !!p.kitRemessaId && e.remessasConhecidas.has(p.kitRemessaId);
  const eventoDaPeca = (p: PecaDoPainel) => prazoPorChave.get(`${p.eventId}|${doKit(p) ? p.kitRemessaId : ""}`) ?? null;
  const chaveFora = (p: PecaDoPainel) => {
    const kit = doKit(p);
    const chave = kit ? `${p.eventId}#kit-${p.kitRemessaId}` : p.eventId;
    if (!(chave in nomes)) nomes[chave] = `${e.nomeDoEvento.get(p.eventId) ?? "(evento não encontrado)"}${kit ? " · KIT" : ""}`;
    return chave;
  };

  type Soma = Record<string, number>;
  /** Soma `add` na linha da chave (criada a partir de `base`, com os campos numéricos zerados). */
  const juntar = <L,>(mapa: Map<string, L>, chave: string, base: Omit<L, "itens" | "unidades" | "m2">, add: Soma) => {
    let r = mapa.get(chave) as unknown as Soma | undefined;
    if (!r) { r = { ...base } as unknown as Soma; mapa.set(chave, r as unknown as L); }
    for (const k in add) r[k] = (r[k] ?? 0) + add[k];
  };
  const pr = new Map<string, LinhaDeProducaoRealizada>();
  const pre = new Map<string, LinhaDePreRealizada>();
  const pp = new Map<string, LinhaDeProducaoPlanejada>();
  const pl = new Map<string, LinhaDePrePlanejada>();
  const pecas: PecaDaLinha[] = [];

  for (const p of e.pecas) {
    if (ehBookCompleto(p)) continue;
    const { etapa, fase } = faseDaPeca(p);
    if (etapa === "canceled") continue;
    const ev = eventoDaPeca(p);
    const chave = ev ? ev.id : chaveFora(p);
    const u = unidadesAProduzir(p);
    const m2u = m2PorUnidade(p);
    const qtd = num(p.quantity);

    // Realizado (janela de 60 dias): impressão pelo fim da impressão, acabamento pela conferência.
    if (u > 0) {
      const dP = diaDoNegocio(p.producedAt);
      if (dP && dP >= desde) juntar(pr, `${dP}|${chave}|impressao`, { dia: dP, evento: chave, processo: "impressao" as const }, { itens: 1, unidades: u, m2: u * m2u });
      const dC = diaDoNegocio(p.conferredAt);
      if (dC && dC >= desde) juntar(pr, `${dC}|${chave}|acabamento`, { dia: dC, evento: chave, processo: "acabamento" as const }, { itens: 1, unidades: u, m2: u * m2u });
    }
    // Layout enviado: a troca do thumb; sem ela, quando a peça entrou em "aguardando aprovação"
    // (o app não guarda essa data para todas as peças — histórico parcial).
    const layout = p.approvalThumbUpdatedAt || (p.status === "awaiting_sponsor_approval" ? p.statusChangedAt : null);
    const marcas: [ProcessoDePre, Instante][] = [
      ["cadastro", p.createdAt], ["layout", layout], ["aprovacao", p.sponsorApprovedAt],
      ["finalizacao", p.finalFileUpdatedAt], ["revisao", p.creatorReviewedAt],
    ];
    for (const [proc, ts] of marcas) {
      const d = diaDoNegocio(ts);
      if (d && d >= desde) juntar(pre, `${d}|${chave}|${proc}`, { dia: d, evento: chave, processo: proc }, { itens: 1, unidades: qtd });
    }

    if (!ev || fase == null) continue;
    const dl = ev.stages.map((s) => s.deadline);
    const aberta = fase < FASE_ENTREGUE;

    // Planejado da produção: o saldo dividido pelos dias úteis até o prazo da Produção Gráfica.
    if (aberta && u > 0) {
      const liberada = fase === FASE_PRODUCAO;
      let fim = dl[FASE_PRODUCAO];
      const atrasada = fim < hoje;
      if (atrasada) fim = hoje;
      const aposRevisao = somarDias(dl[4], 1);
      let inicio = liberada ? hoje : (aposRevisao > hoje ? aposRevisao : hoje);
      if (inicio > fim) inicio = fim;
      const dias = diasDoIntervalo(inicio, fim);
      if (dias.length === 0) dias.push(fim);
      const restaImprimir = etapa && (etapa === "produced" || etapa === "conferred" || etapa === "packed")
        ? 0 : Math.max(0, u - (etapa === "inProduction" ? num(p.quantityProduced) : 0));
      const restaAcabar = etapa === "conferred" || etapa === "packed" ? 0 : u;
      const situacao: SituacaoDoPlanejado = atrasada ? "atrasado" : liberada ? "liberado" : "preProducao";
      const n = dias.length;
      for (const d of dias) {
        if (restaImprimir > 0) juntar(pp, `${d}|${chave}|impressao|${situacao}`, { dia: d, evento: chave, processo: "impressao" as const, situacao }, { itens: 1 / n, unidades: restaImprimir / n, m2: (restaImprimir * m2u) / n });
        if (restaAcabar > 0) juntar(pp, `${d}|${chave}|acabamento|${situacao}`, { dia: d, evento: chave, processo: "acabamento" as const, situacao }, { itens: 1 / n, unidades: restaAcabar / n, m2: (restaAcabar * m2u) / n });
      }
    }

    // Planejado da pré-produção: cada processo pendente no prazo da fase; vencido vai para hoje.
    // A peça atrasada conta UMA vez em "Atrasado" (no processo em que está) — os
    // processos seguintes, também vencidos por causa dela, não repetem a peça
    // (dono, 19/10: "a mesma peça atrasada em layout aparece nos demais, fica confuso").
    let jaContouAtraso = false;
    for (const s of passosPendentes(fase, !!p.skipApproval)) {
      const atrasado = dl[s] < hoje;
      if (atrasado) { if (jaContouAtraso) continue; jaContouAtraso = true; }
      const d = atrasado ? hoje : dl[s];
      const proc = PROCESSO_DO_PASSO[s];
      juntar(pl, `${d}|${chave}|${proc}|${atrasado}`, { dia: d, evento: chave, processo: proc, atrasado }, { itens: 1, unidades: qtd });
    }

    const marco = aberta ? (marcoDaPeca.get(p.id) ?? fase) : null;
    const prazoFase = marco != null ? dl[marco] ?? null : null;
    const impresso = !!etapa && IMPRESSAS.has(etapa);
    const acabado = !!etapa && ACABADAS.has(etapa);
    pecas.push({
      id: p.id,
      displayId: p.displayId,
      evento: chave,
      eventoId: p.eventId,
      tipo: String(p.type ?? "").trim(),
      descricao: String(p.description ?? "").trim(),
      medida: String(p.measurement ?? "").trim(),
      material: normalizarRotulo(p.material) || "(sem material)",
      acabamento: normalizarRotulo(p.finish) || "(sem acabamento)",
      quantidade: qtd,
      reuso: num(p.reuseQty),
      unidades: u,
      m2: r2(u * m2u),
      status: p.status,
      etapa,
      fase,
      prazoFase,
      diasAtraso: prazoFase && prazoFase < hoje ? diasEntre(hoje, prazoFase) : 0,
      prazoProducao: dl[FASE_PRODUCAO],
      impresso,
      impressoEm: impresso ? diaDoNegocio(p.producedAt) : null,
      acabado,
      acabadoEm: acabado ? diaDoNegocio(p.conferredAt) : null,
      furaFila: !!p.isPriority,
      refacao: !!p.parentItemId,
      motivoRefacao: String(p.complementReason ?? "").trim(),
      reprovada: !!(p.rejectedBySponsor || p.rejectedByCreator),
      semAprovacao: !!p.skipApproval,
    });
  }

  const fechar = <L extends { dia: string }>(m: Map<string, L>): L[] =>
    Array.from(m.values()).map((r) => {
      const s = r as unknown as Soma;
      for (const k of ["itens", "unidades", "m2"]) if (k in s) s[k] = r2(s[k]);
      return r;
    }).sort((a, b) => (a.dia < b.dia ? -1 : a.dia > b.dia ? 1 : 0));

  const prodRealizado = fechar(pr);
  const prodPlanejado = fechar(pp);
  const abertas = pecas.filter((p) => p.fase < FASE_ENTREGUE);
  const inicio7d = somarDias(hoje, -6);
  const somaM2 = (ls: { m2: number }[]) => ls.reduce((s, l) => s + l.m2, 0);

  return {
    geradoEm: e.geradoEm,
    hoje,
    janelaDoRealizadoDias: JANELA_DO_REALIZADO_DIAS,
    kpis: e.kpis,
    resumo: {
      pecasAbertas: abertas.length,
      atrasadasAbertas: abertas.filter((p) => p.diasAtraso > 0).length,
      furaFilaAbertas: abertas.filter((p) => p.furaFila).length,
      refacoesAbertas: abertas.filter((p) => p.refacao).length,
      reprovadasAbertas: abertas.filter((p) => p.reprovada).length,
      m2Impresso7d: Math.round(somaM2(prodRealizado.filter((r) => r.processo === "impressao" && r.dia >= inicio7d && r.dia <= hoje))),
      m2AImprimir: Math.round(somaM2(prodPlanejado.filter((r) => r.processo === "impressao"))),
    },
    eventos,
    nomes,
    prodRealizado,
    preRealizado: fechar(pre),
    prodPlanejado,
    prePlanejado: fechar(pl),
    pecas,
  };
}

// ─── Pré-produção: os processos que a peça ainda precisa ─────────────────────

export const PROCESSOS_DE_PRE: ReadonlyArray<{ id: ProcessoDePre; rotulo: string; curto: string }> = [
  { id: "cadastro", rotulo: "Cadastro da peça", curto: "Cadastro" },
  { id: "layout", rotulo: "Layout enviado", curto: "Layout" },
  { id: "aprovacao", rotulo: "Aprovação do layout", curto: "Aprovação" },
  { id: "finalizacao", rotulo: "Finalização", curto: "Finalização" },
  { id: "revisao", rotulo: "Revisão final", curto: "Revisão final" },
];
const PROCESSO_DO_PASSO: Record<number, Exclude<ProcessoDePre, "cadastro">> = { 1: "layout", 2: "aprovacao", 3: "finalizacao", 4: "revisao" };
export const PASSO_DO_PROCESSO: Record<Exclude<ProcessoDePre, "cadastro">, number> = { layout: 1, aprovacao: 2, finalizacao: 3, revisao: 4 };

/**
 * A peça na fase N ainda passa pelos processos N..4 (layout, aprovação,
 * finalização, revisão final); a da Lista de imagens (fase 0) passa por todos.
 * A isenta de aprovação pula a aprovação. O primeiro é o processo em que a
 * peça ESTÁ (passoAtual) — é nele, e só nele, que ela conta nas pendências.
 */
export function passoAtual(fase: number, semAprovacao: boolean): number | null {
  return passosPendentes(fase, semAprovacao)[0] ?? null;
}

export function passosPendentes(fase: number, semAprovacao: boolean): number[] {
  if (fase < 0 || fase > 4) return [];
  const out: number[] = [];
  for (let s = Math.max(1, fase); s <= 4; s++) if (!(s === 2 && semAprovacao)) out.push(s);
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// DERIVAÇÕES — o que a tela recorta (filtros, dia da projeção, chips). Puras.
// ═══════════════════════════════════════════════════════════════════════════

export type Medida = "m2" | "unidades" | "itens";

const valorDa = (l: { itens: number; unidades: number; m2?: number }, medida: Medida) =>
  medida === "m2" ? l.m2 ?? 0 : medida === "unidades" ? l.unidades : l.itens;

// ─── Painel geral ────────────────────────────────────────────────────────────

/** As linhas de "Peças em aberto por status", na ordem do fluxo (só as com peça). */
export const ROTULOS_DAS_ETAPAS: ReadonlyArray<{ etapa: EtapaDaPeca; rotulo: string }> = [
  { etapa: "requested", rotulo: "Rascunho / solicitado" },
  { etapa: "awaiting_linking", rotulo: "Ag. vinculação" },
  { etapa: "awaiting_submission", rotulo: "Ag. envio de layout" },
  { etapa: "awaiting_approval", rotulo: "Ag. aprovação" },
  { etapa: "awaiting_finalization", rotulo: "Ag. finalização" },
  { etapa: "awaiting_final_review", rotulo: "Ag. revisão final" },
  { etapa: "ready_for_production", rotulo: "Pronto p/ produção" },
  { etapa: "approved", rotulo: "Liberado" },
  { etapa: "inProduction", rotulo: "Em impressão" },
  { etapa: "produced", rotulo: "Impresso / Acabamento" },
  { etapa: "conferred", rotulo: "Conferido" },
  { etapa: "packed", rotulo: "Embalado" },
  { etapa: "delivered", rotulo: "Entregue" },
];
export const rotuloDaEtapaNoPainel = (etapa: EtapaDaPeca | null): string =>
  ROTULOS_DAS_ETAPAS.find((r) => r.etapa === etapa)?.rotulo ?? "—";

export function abertasPorStatus(pecas: ReadonlyArray<PecaDaLinha>): { etapa: EtapaDaPeca; rotulo: string; pecas: number; atrasadas: number }[] {
  return ROTULOS_DAS_ETAPAS.filter((r) => r.etapa !== "delivered").map((r) => {
    const da = pecas.filter((p) => p.etapa === r.etapa);
    return { ...r, pecas: da.length, atrasadas: da.filter((p) => p.diasAtraso > 0).length };
  }).filter((r) => r.pecas > 0);
}

/** Impressão realizado × planejado (m²/dia): 3 semanas para trás e 3 para frente, dias úteis. */
export function impressaoRealizadoXPlanejado(painel: Pick<PainelOperacional, "hoje" | "prodRealizado" | "prodPlanejado">): { dia: string; realizado: number; planejado: number; atrasado: number }[] {
  const real = new Map<string, number>(), plan = new Map<string, number>(), atr = new Map<string, number>();
  const add = (m: Map<string, number>, d: string, v: number) => m.set(d, (m.get(d) ?? 0) + v);
  for (const r of painel.prodRealizado) if (r.processo === "impressao") add(real, r.dia, r.m2);
  for (const r of painel.prodPlanejado) if (r.processo === "impressao") add(r.situacao === "atrasado" ? atr : plan, r.dia, r.m2);
  return diasDoIntervalo(somarDias(painel.hoje, -20), somarDias(painel.hoje, 21)).map((dia) => ({
    dia, realizado: r2(real.get(dia) ?? 0), planejado: r2(plan.get(dia) ?? 0), atrasado: r2(atr.get(dia) ?? 0),
  }));
}

// ─── Produção ────────────────────────────────────────────────────────────────

/** Realizado por dia (últimos 30 dias úteis do calendário): impressão e acabamento. */
export function producaoRealizadaPorDia(painel: Pick<PainelOperacional, "hoje" | "prodRealizado">, evento: string | null, medida: Medida): { dia: string; impressao: number; acabamento: number }[] {
  const m = new Map<string, number>();
  for (const r of painel.prodRealizado) {
    if (evento && r.evento !== evento) continue;
    const k = `${r.dia}|${r.processo}`;
    m.set(k, (m.get(k) ?? 0) + valorDa(r, medida));
  }
  return diasDoIntervalo(somarDias(painel.hoje, -29), painel.hoje).map((dia) => ({
    dia, impressao: r2(m.get(`${dia}|impressao`) ?? 0), acabamento: r2(m.get(`${dia}|acabamento`) ?? 0),
  }));
}

/** Planejado por dia de um processo, de hoje até o último dia planejado (dias úteis). */
export function producaoPlanejadaPorDia(painel: Pick<PainelOperacional, "hoje" | "prodPlanejado">, processo: ProcessoDeProducao, evento: string | null, medida: Medida): { dia: string; atrasado: number; liberado: number; preProducao: number }[] {
  const m = new Map<string, number>();
  let ultimo = painel.hoje;
  for (const r of painel.prodPlanejado) {
    if (r.processo !== processo || (evento && r.evento !== evento)) continue;
    const k = `${r.dia}|${r.situacao}`;
    m.set(k, (m.get(k) ?? 0) + valorDa(r, medida));
    if (r.dia > ultimo) ultimo = r.dia;
  }
  const temAlgo = m.size > 0;
  if (!temAlgo) return [];
  return diasDoIntervalo(painel.hoje, ultimo).map((dia) => ({
    dia,
    atrasado: r2(m.get(`${dia}|atrasado`) ?? 0),
    liberado: r2(m.get(`${dia}|liberado`) ?? 0),
    preProducao: r2(m.get(`${dia}|preProducao`) ?? 0),
  }));
}

export interface ProducaoDoEvento {
  evento: string;
  impressoM2_30d: number;
  acabadoM2_30d: number;
  aImprimirM2: number;
  aImprimirUn: number;
  aAcabarUn: number;
  prazoProducao: string | null;
}

/** "Produção por evento": realizado nos 30 dias (corridos) e o saldo planejado. */
export function producaoPorEvento(painel: Pick<PainelOperacional, "hoje" | "prodRealizado" | "prodPlanejado" | "eventos">): ProducaoDoEvento[] {
  const inicio = somarDias(painel.hoje, -29);
  const prazo = new Map(painel.eventos.map((e) => [e.chave, e.fases[FASE_PRODUCAO]?.prazo ?? null]));
  const m = new Map<string, ProducaoDoEvento>();
  const g = (ev: string) => {
    let x = m.get(ev);
    if (!x) m.set(ev, (x = { evento: ev, impressoM2_30d: 0, acabadoM2_30d: 0, aImprimirM2: 0, aImprimirUn: 0, aAcabarUn: 0, prazoProducao: prazo.get(ev) ?? null }));
    return x;
  };
  for (const r of painel.prodRealizado) {
    if (r.dia < inicio) continue;
    const x = g(r.evento);
    if (r.processo === "impressao") x.impressoM2_30d += r.m2; else x.acabadoM2_30d += r.m2;
  }
  for (const r of painel.prodPlanejado) {
    const x = g(r.evento);
    if (r.processo === "impressao") { x.aImprimirM2 += r.m2; x.aImprimirUn += r.unidades; } else x.aAcabarUn += r.unidades;
  }
  return Array.from(m.values()).map((x) => ({
    ...x,
    impressoM2_30d: Math.round(x.impressoM2_30d), acabadoM2_30d: Math.round(x.acabadoM2_30d),
    aImprimirM2: Math.round(x.aImprimirM2), aImprimirUn: Math.round(x.aImprimirUn), aAcabarUn: Math.round(x.aAcabarUn),
  }));
}

// ─── Projeção de produção do dia ─────────────────────────────────────────────

export type ClasseDaProjecao = "atrasado" | "pendente" | "produzido";
export type MedidaDaProjecao = "m2" | "unidades";
export interface ParcelaDaProjecao { m2: number; unidades: number }

const jaPassou = (p: PecaDaLinha, processo: ProcessoDeProducao) => (processo === "impressao" ? p.impresso : p.acabado);

/**
 * Onde a peça entra na carga do dia:
 *   · prazo da Produção Gráfica ANTES de hoje e o processo não feito → atrasado
 *     (datas futuras nunca entram como atrasadas);
 *   · prazo NO dia → pendente ou já produzido;
 *   · o resto, fora.
 */
export function classeNaProjecao(p: PecaDaLinha, processo: ProcessoDeProducao, dia: string, hoje: string): ClasseDaProjecao | null {
  const feito = jaPassou(p, processo);
  if (p.prazoProducao < hoje) return feito ? null : "atrasado";
  if (p.prazoProducao === dia) return feito ? "produzido" : "pendente";
  return null;
}

export interface CartaoDaProjecao {
  processo: ProcessoDeProducao;
  atrasados: ParcelaDaProjecao;
  programados: ParcelaDaProjecao;
  produzidos: ParcelaDaProjecao;
  /** Atrasados (se incluídos) + programados − já produzidos. */
  carga: ParcelaDaProjecao;
}

export interface QuebraDaProjecao { rotulo: string; atrasado: number; pendente: number; produzido: number; carga: number }

export interface ProjecaoDoDia {
  dia: string;
  cartoes: CartaoDaProjecao[];
  /** Fila por data de prazo (todos os dias de hoje até o último prazo). */
  fila: { dia: string; atrasados: number; pendente: number; produzido: number }[];
  porMaterial: QuebraDaProjecao[];
  porAcabamento: QuebraDaProjecao[];
  porEvento: QuebraDaProjecao[];
  /** As peças da carga do dia (com as atrasadas, se incluídas). */
  pecas: (PecaDaLinha & { classe: ClasseDaProjecao })[];
}

export function projetarDia(
  painel: Pick<PainelOperacional, "hoje" | "pecas" | "nomes">,
  opcoes: { dia: string; processo: ProcessoDeProducao; medida: MedidaDaProjecao; incluirAtrasados: boolean },
): ProjecaoDoDia {
  const { hoje } = painel;
  const dia = opcoes.dia && opcoes.dia >= hoje ? opcoes.dia : hoje;
  const { processo, medida, incluirAtrasados: incl } = opcoes;
  const linhas = painel.pecas.filter((p) => p.unidades > 0);
  const zero = (): ParcelaDaProjecao => ({ m2: 0, unidades: 0 });

  const cartoes = (["impressao", "acabamento"] as const).map((pr): CartaoDaProjecao => {
    const a = { atrasado: zero(), pendente: zero(), produzido: zero() };
    for (const p of linhas) {
      const k = classeNaProjecao(p, pr, dia, hoje);
      if (k) { a[k].m2 += p.m2; a[k].unidades += p.unidades; }
    }
    const programados = { m2: a.pendente.m2 + a.produzido.m2, unidades: a.pendente.unidades + a.produzido.unidades };
    const carga = {
      m2: (incl ? a.atrasado.m2 : 0) + programados.m2 - a.produzido.m2,
      unidades: (incl ? a.atrasado.unidades : 0) + programados.unidades - a.produzido.unidades,
    };
    const fx = (x: ParcelaDaProjecao) => ({ m2: r2(x.m2), unidades: r2(x.unidades) });
    return { processo: pr, atrasados: fx(a.atrasado), programados: fx(programados), produzidos: fx(a.produzido), carga: fx(carga) };
  });

  let ultimo = hoje;
  for (const p of linhas) if (p.prazoProducao > ultimo) ultimo = p.prazoProducao;
  const q = new Map<string, number>();
  const somar = (k: string, v: number) => q.set(k, (q.get(k) ?? 0) + v);
  for (const p of linhas) {
    const feito = jaPassou(p, processo);
    if (p.prazoProducao < hoje) { if (!feito && incl) somar(`${hoje}|a`, p[medida]); continue; }
    somar(`${p.prazoProducao}|${feito ? "f" : "p"}`, p[medida]);
  }
  const fila = diasDoIntervalo(hoje, ultimo, false).map((d) => ({
    dia: d, atrasados: r2(q.get(`${d}|a`) ?? 0), pendente: r2(q.get(`${d}|p`) ?? 0), produzido: r2(q.get(`${d}|f`) ?? 0),
  }));

  const naCarga = linhas
    .map((p) => ({ p, k: classeNaProjecao(p, processo, dia, hoje) }))
    .filter((x): x is { p: PecaDaLinha; k: ClasseDaProjecao } => !!x.k && (x.k !== "atrasado" || incl));
  const quebra = (campo: (p: PecaDaLinha) => string): QuebraDaProjecao[] => {
    const m = new Map<string, QuebraDaProjecao>();
    for (const { p, k } of naCarga) {
      const rot = campo(p);
      let x = m.get(rot);
      if (!x) m.set(rot, (x = { rotulo: rot, atrasado: 0, pendente: 0, produzido: 0, carga: 0 }));
      x[k] += p[medida];
    }
    return Array.from(m.values())
      .map((x) => ({ rotulo: x.rotulo, atrasado: r2(x.atrasado), pendente: r2(x.pendente), produzido: r2(x.produzido), carga: r2(x.atrasado + x.pendente) }))
      .filter((x) => x.carga > 0 || x.produzido > 0)
      .sort((a, b) => b.carga - a.carga || a.rotulo.localeCompare(b.rotulo, "pt-BR"));
  };

  return {
    dia,
    cartoes,
    fila,
    porMaterial: quebra((p) => p.material),
    porAcabamento: quebra((p) => p.acabamento),
    porEvento: quebra((p) => painel.nomes[p.evento] ?? p.evento),
    pecas: naCarga.map(({ p, k }) => ({ ...p, classe: k })),
  };
}

// ─── Pré-produção ────────────────────────────────────────────────────────────

/** Realizado por dia dos processos de pré-produção (itens), últimos 30 dias úteis do calendário. */
export function preRealizadoPorDia(painel: Pick<PainelOperacional, "hoje" | "preRealizado">, evento: string | null, processos: ReadonlyArray<ProcessoDePre> | null): ({ dia: string } & Record<ProcessoDePre, number>)[] {
  const m = new Map<string, number>();
  for (const r of painel.preRealizado) {
    if (evento && r.evento !== evento) continue;
    if (processos && processos.length && !processos.includes(r.processo)) continue;
    const k = `${r.dia}|${r.processo}`;
    m.set(k, (m.get(k) ?? 0) + r.itens);
  }
  return diasDoIntervalo(somarDias(painel.hoje, -29), painel.hoje).map((dia) => {
    const o = { dia } as { dia: string } & Record<ProcessoDePre, number>;
    for (const p of PROCESSOS_DE_PRE) o[p.id] = m.get(`${dia}|${p.id}`) ?? 0;
    return o;
  });
}

/** Planejado da pré-produção: o vencido de TODAS as fases (selecionadas) vai para hoje, em "atrasado". */
export function prePlanejadoPorDia(painel: Pick<PainelOperacional, "hoje" | "prePlanejado">, evento: string | null, processos: ReadonlyArray<ProcessoDePre> | null): ({ dia: string; atrasado: number } & Record<Exclude<ProcessoDePre, "cadastro">, number>)[] {
  const m = new Map<string, number>();
  let ultimo = painel.hoje;
  for (const r of painel.prePlanejado) {
    if (evento && r.evento !== evento) continue;
    if (processos && processos.length && !processos.includes(r.processo)) continue;
    const k = `${r.dia}|${r.atrasado ? "atrasado" : r.processo}`;
    m.set(k, (m.get(k) ?? 0) + r.itens);
    if (r.dia > ultimo) ultimo = r.dia;
  }
  if (m.size === 0) return [];
  return diasDoIntervalo(painel.hoje, ultimo).map((dia) => ({
    dia,
    atrasado: m.get(`${dia}|atrasado`) ?? 0,
    layout: m.get(`${dia}|layout`) ?? 0,
    aprovacao: m.get(`${dia}|aprovacao`) ?? 0,
    finalizacao: m.get(`${dia}|finalizacao`) ?? 0,
    revisao: m.get(`${dia}|revisao`) ?? 0,
  }));
}

type ColunaDePre = Exclude<ProcessoDePre, "cadastro">;
export interface PendenciaDoEvento {
  evento: string;
  pendentes: Record<ColunaDePre, number>;
  atrasados: Record<ColunaDePre, number>;
  /** Peças atrasadas no processo em que estão (cada peça conta uma vez). */
  totalAtrasados: number;
}

const prazosDoEvento = (painel: Pick<PainelOperacional, "eventos">) =>
  new Map(painel.eventos.map((e) => [e.chave, e.fases.map((f) => f.prazo)]));

/**
 * "Pendências de pré-produção por evento": cada peça conta UMA vez, na coluna
 * do processo em que ela está agora (dono, 19/10 — antes a peça parada no
 * layout aparecia também em aprovação, finalização e revisão).
 */
export function pendenciasPorEvento(painel: Pick<PainelOperacional, "hoje" | "pecas" | "eventos">): PendenciaDoEvento[] {
  const prazos = prazosDoEvento(painel);
  const m = new Map<string, PendenciaDoEvento>();
  for (const p of painel.pecas) {
    const atual = passoAtual(p.fase, p.semAprovacao);
    const passos = atual == null ? [] : [atual];
    if (!passos.length) continue;
    const dl = prazos.get(p.evento) ?? [];
    let x = m.get(p.evento);
    if (!x) m.set(p.evento, (x = {
      evento: p.evento,
      pendentes: { layout: 0, aprovacao: 0, finalizacao: 0, revisao: 0 },
      atrasados: { layout: 0, aprovacao: 0, finalizacao: 0, revisao: 0 },
      totalAtrasados: 0,
    }));
    for (const s of passos) {
      const c = PROCESSO_DO_PASSO[s];
      x.pendentes[c]++;
      if (dl[s] && dl[s] < painel.hoje) { x.atrasados[c]++; x.totalAtrasados++; }
    }
  }
  return Array.from(m.values());
}

/** As peças por trás de um número da tabela de pendências. `processo` null = todos; "atrasados" = só vencidos. */
export function pecasDaPendencia(
  painel: Pick<PainelOperacional, "hoje" | "pecas" | "eventos">,
  evento: string,
  processo: ColunaDePre | "atrasados" | null,
  soAtrasados: boolean,
): PecaDaLinha[] {
  const dl = prazosDoEvento(painel).get(evento) ?? [];
  const alvo = processo && processo !== "atrasados" ? PASSO_DO_PROCESSO[processo] : null;
  const so = soAtrasados || processo === "atrasados";
  return painel.pecas.filter((p) => {
    if (p.evento !== evento) return false;
    const atual = passoAtual(p.fase, p.semAprovacao);
    const passos = (atual == null ? [] : [atual]).filter((s) => alvo == null || s === alvo);
    if (!passos.length) return false;
    return so ? passos.some((s) => !!dl[s] && dl[s] < painel.hoje) : true;
  });
}

// ─── Problemas operacionais ──────────────────────────────────────────────────

export type TipoDeProblema = "todos" | "atraso" | "fura" | "refacao" | "reprovada";

const TESTE_DO_PROBLEMA: Record<TipoDeProblema, (p: PecaDaLinha) => boolean> = {
  todos: (p) => p.diasAtraso > 0 || p.furaFila || p.refacao || p.reprovada,
  atraso: (p) => p.diasAtraso > 0,
  fura: (p) => p.furaFila,
  refacao: (p) => p.refacao,
  reprovada: (p) => p.reprovada,
};

export function problemasPorEvento(pecas: ReadonlyArray<PecaDaLinha>): { evento: string; atrasadas: number; furaFila: number; refacoes: number; reprovadas: number; total: number }[] {
  const m = new Map<string, { evento: string; atrasadas: number; furaFila: number; refacoes: number; reprovadas: number; total: number }>();
  for (const p of pecas) {
    if (p.fase >= FASE_ENTREGUE) continue;
    let x = m.get(p.evento);
    if (!x) m.set(p.evento, (x = { evento: p.evento, atrasadas: 0, furaFila: 0, refacoes: 0, reprovadas: 0, total: 0 }));
    if (p.diasAtraso > 0) x.atrasadas++;
    if (p.furaFila) x.furaFila++;
    if (p.refacao) x.refacoes++;
    if (p.reprovada) x.reprovadas++;
  }
  return Array.from(m.values())
    .map((x) => ({ ...x, total: x.atrasadas + x.furaFila + x.refacoes + x.reprovadas }))
    .filter((x) => x.total > 0)
    .sort((a, b) => b.total - a.total);
}

export function pecasComProblema(pecas: ReadonlyArray<PecaDaLinha>, tipo: TipoDeProblema, evento: string | null): PecaDaLinha[] {
  const teste = TESTE_DO_PROBLEMA[tipo] ?? TESTE_DO_PROBLEMA.todos;
  return pecas.filter((p) => p.fase < FASE_ENTREGUE && teste(p) && (!evento || p.evento === evento));
}

// ─── Status por evento ───────────────────────────────────────────────────────

/** O evento que a aba abre sem escolha: o primeiro atrasado pela data do evento; senão, o primeiro. */
export function eventoPadrao(eventos: ReadonlyArray<EventoDoPainel>): string | null {
  const ord = [...eventos].sort((a, b) => a.dataEvento.localeCompare(b.dataEvento));
  return (ord.find((e) => e.situacao === "Atrasado") ?? ord[0])?.chave ?? null;
}

/** "Peças por fase" do evento: atrasadas × no prazo × entregues. */
export function pecasPorFase(pecas: ReadonlyArray<PecaDaLinha>, evento: string): { fase: number; rotulo: string; atrasadas: number; noPrazo: number; entregues: number }[] {
  const doEvento = pecas.filter((p) => p.evento === evento);
  return FASES_DO_PAINEL.map((rotulo, fase) => {
    const da = doEvento.filter((p) => p.fase === fase);
    const atrasadas = da.filter((p) => p.diasAtraso > 0).length;
    return fase === FASE_ENTREGUE
      ? { fase, rotulo, atrasadas: 0, noPrazo: 0, entregues: da.length }
      : { fase, rotulo, atrasadas, noPrazo: da.length - atrasadas, entregues: 0 };
  }).filter((r) => r.atrasadas + r.noPrazo + r.entregues > 0);
}
