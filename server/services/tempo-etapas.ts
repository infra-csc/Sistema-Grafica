// Permanência por etapa medida a partir da TRILHA DE AUDITORIA — regra PURA,
// sem Express e sem I/O. A rota (server/routes/analises.ts) só busca as linhas
// e chama daqui.
//
// ─────────────────────────────────────────────────────────────────────────────
// POR QUE ISTO É POSSÍVEL AGORA, E NÃO ERA ANTES
//
// `items` não guarda quando a peça ENTRA em cada etapa — só carimbos do fim do
// funil (`producedAt`, `conferredAt`, `deliveredAt`). Era essa a limitação que
// mantinha o bloco "Tempo por etapa" fora da tela.
//
// O que mudou: o servidor passou a gravar TODA mudança de status em
// `audit_logs` com autor e hora, e a leitura da trilha deixou de ter teto de
// 500 (paginação por cursor). A diferença entre dois carimbos consecutivos da
// MESMA peça é a permanência. Nenhuma coluna nova, nenhuma migração.
//
// ─────────────────────────────────────────────────────────────────────────────
// O PONTO FRÁGIL, DECLARADO: o reconhecimento é por FRASE em português
//
// `audit_logs.details` é texto livre. Não existe campo `from_status`/
// `to_status` — a transição só está legível porque as rotas escrevem
// "Status alterado: <A> → <B>". Isso tem duas consequências que este módulo
// trata explicitamente, em vez de fingir que não existem:
//
//  1. NEM TODA transição escreve a seta. Cinco rotas mudam status com frase
//     própria (dispensa, entrega, cancelamento, devolução para a Arte e a rota
//     legada de liberação). Para essas, o DESTINO é constante da rota — não se
//     adivinha, se lê do código. É o `CATALOGO` abaixo, e cada entrada tem
//     teste. Transições que só andam DENTRO da Produção Gráfica (produzido,
//     conferido, reaproveitamento) não precisam de entrada: não trocam de
//     etapa, e a única saída que importa é a entrega.
//
//  2. `translateStatus` NÃO É INJETIVA — três rótulos servem a mais de um
//     status. Dois deles colidem DENTRO da mesma etapa e são inofensivos para
//     uma conta por etapa ("Aguardando Aprovação" e "Aguardando Finalização").
//     O terceiro, "Aguardando Revisão Final", é o único que cruza a fronteira:
//     vale para `awaiting_creator_review` (Finalização) e para
//     `awaiting_final_review` (Revisão de Lista) — justamente as duas etapas
//     que o negócio mais precisa separar. O desempate está em
//     `resolverRevisaoFinal` e é derivado do código das rotas, não de palpite.
//
// ─────────────────────────────────────────────────────────────────────────────
// O QUE NÃO É MEDIDO, DE PROPÓSITO
//
//  · Passagem sem ENTRADA registrada. Se a primeira linha da peça já a mostra
//    no meio do funil, não se sabe desde quando ela estava ali. A única
//    entrada que se conhece sem log é a da PRIMEIRA etapa: peça nasce em
//    `draft` (schema.ts), então `createdAt` é a entrada na Lista de Imagens.
//  · Passagem ainda ABERTA (peça parada na etapa hoje). Contá-la como se
//    tivesse terminado encurtaria a etapa; por isso ela é contada à parte, em
//    `emAberto` — o contrapeso ao viés de sobrevivência.
//  · Peça cancelada/arquivada: a visita aberta é DESCARTADA. O tempo existiu,
//    mas não é "o que a etapa levou para fazer o trabalho" — é trabalho que
//    parou de existir.
import { spDayMs } from "@shared/prazo-dates";
import {
  MINIMO_PECAS_POR_ETAPA,
  type TempoEtapa,
  type TempoPorEtapa,
} from "@shared/tempo-etapas-contract";
import { STAGE_DEFS, STATUS_STAGE_RANK, stageDeadline, truckDayUTC } from "./prazo-domain";

const DIA_MS = 86_400_000;

/** Índice da etapa canônica pela chave — evita número mágico no catálogo. */
const idxDe = (key: string) => STAGE_DEFS.findIndex((s) => s.key === key);

export const ETAPA_LISTA = idxDe("listaImagens");
export const ETAPA_LAYOUTS = idxDe("layouts");
export const ETAPA_FINALIZACAO = idxDe("finalizacao");
export const ETAPA_REVISAO = idxDe("revisao");
export const ETAPA_PRODUCAO = idxDe("producao");

// ─── Vocabulário: rótulo em português → status ───────────────────────────────
//
// ESPELHO de `translateStatus` (server/routes/shared.ts). É espelho e não
// import porque aquele módulo carrega Express junto, e este aqui é domínio
// puro — mas espelho sem guarda diverge, então
// `server/__tests__/analises-tempo-etapas.test.ts` compara os dois entrada a
// entrada: mexer no rótulo lá e esquecer daqui quebra o gate.
export const STATUS_LABEL: Record<string, string> = {
  draft: "Rascunho",
  requested: "Solicitado",
  awaiting_linking: "Aguardando Vinculação",
  awaiting_submission: "Aguardando Envio",
  awaiting_approval: "Aguardando Aprovação",
  awaiting_finalization: "Aguardando Finalização",
  awaiting_final_review: "Aguardando Revisão Final",
  awaiting_review: "Aguardando Revisão",
  in_review: "Em Revisão",
  ready_for_production: "Pronto para Produção",
  approved: "Liberado",
  inProduction: "Em Produção",
  produced: "Produzido",
  conferred: "Conferido",
  delivered: "Entregue",
  canceled: "Cancelado",
  archived: "Arquivado",
  awaiting_sponsor_approval: "Aguardando Aprovação",
  sponsor_approved: "Aguardando Finalização",
  awaiting_creator_review: "Aguardando Revisão Final",
};

/** Rótulo → todos os status que o produzem. */
export const LABEL_STATUSES: Map<string, string[]> = (() => {
  const m = new Map<string, string[]>();
  for (const [status, label] of Object.entries(STATUS_LABEL)) {
    const atual = m.get(label);
    if (atual) atual.push(status);
    else m.set(label, [status]);
  }
  return m;
})();

/**
 * Etapas distintas que um rótulo pode significar.
 *
 * `Array` e não `Set` porque o alvo de compilação do projeto não permite
 * iterar Set sem `downlevelIteration` — e a lista tem no máximo três itens.
 */
function etapasDoRotulo(label: string): number[] {
  const fora: number[] = [];
  for (const s of LABEL_STATUSES.get(label) ?? []) {
    const r = STATUS_STAGE_RANK[s];
    if (r !== undefined && fora.indexOf(r) < 0) fora.push(r);
  }
  return fora;
}

/** O rótulo serve a etapas DIFERENTES — precisa de desempate para virar conta. */
export function rotuloAmbiguo(label: string): boolean {
  return etapasDoRotulo(label).length > 1;
}

export const ROTULO_ENTREGUE = STATUS_LABEL.delivered;
const ROTULOS_FORA = new Set([STATUS_LABEL.canceled, STATUS_LABEL.archived]);

// ─── Destino de uma transição ────────────────────────────────────────────────

export type Destino =
  | { tipo: "etapa"; indice: number }
  /** Saiu do funil pela porta certa: a passagem que estava aberta CONTA. */
  | { tipo: "entregue" }
  /** Cancelada/arquivada: a passagem aberta é descartada. */
  | { tipo: "fora" };

export interface Transicao {
  destino: Destino;
  /** Etapa de ORIGEM quando a frase a declara; `null` quando não declara. */
  origem: number | null;
}

/**
 * Desempate de "Aguardando Revisão Final" — o único rótulo que cruza etapas.
 *
 * As duas frases que o produzem hoje já se distinguem pelo sufixo, e o sufixo
 * é a evidência preferida. O terceiro caso (a rota genérica `PATCH /items/:id`,
 * que escreve "Status: A → B" sem sufixo) se resolve pela ORIGEM, e isso é
 * dedução do código, não palpite: `awaiting_creator_review` só é escrito em
 * UM lugar (items.ts:1556, `submit-for-approval`) e essa rota exige que a peça
 * esteja em `awaiting_submission` — a Entrega de Layouts. Logo, vindo de uma
 * etapa até Layouts o destino é Finalização; vindo de mais adiante no funil
 * (tipicamente `sponsor_approved`), é a Revisão de Lista.
 *
 * Origem desconhecida cai em Revisão de Lista: é o destino do caminho comum
 * (peça COM aprovação de patrocinador), enquanto o outro depende de a peça ser
 * isenta.
 */
export function resolverRevisaoFinal(sufixo: string | null, origem: number | null): number {
  if (sufixo && sufixo.includes("sem aprovação de patrocinador")) return ETAPA_FINALIZACAO;
  if (sufixo && sufixo.includes("arquivo final adicionado")) return ETAPA_REVISAO;
  if (origem !== null && origem <= ETAPA_LAYOUTS) return ETAPA_FINALIZACAO;
  return ETAPA_REVISAO;
}

/** Status cru (a dispensa grava a chave, não o rótulo) → etapa. */
export function etapaDoStatus(status: string): number | null {
  const r = STATUS_STAGE_RANK[status.trim()];
  return r === undefined ? null : r;
}

function destinoDoRotulo(
  rotulo: string,
  sufixo: string | null,
  origem: number | null,
): Destino | null {
  const label = rotulo.trim();
  if (label === ROTULO_ENTREGUE) return { tipo: "entregue" };
  if (ROTULOS_FORA.has(label)) return { tipo: "fora" };
  if (label === STATUS_LABEL.awaiting_final_review) {
    return { tipo: "etapa", indice: resolverRevisaoFinal(sufixo, origem) };
  }
  const etapas = etapasDoRotulo(label);
  if (etapas.length !== 1) return null;
  return { tipo: "etapa", indice: etapas[0]! };
}

function origemDoRotulo(rotulo: string): number | null {
  const etapas = etapasDoRotulo(rotulo.trim());
  return etapas.length === 1 ? etapas[0]! : null;
}

// ─── Catálogo das rotas que mudam status SEM escrever a seta ─────────────────
//
// Cada linha espelha uma rota real de `server/routes/items.ts`; o destino é
// constante da rota, lido do código. `origemCrua` extrai o status de origem
// quando a frase o carrega (só a dispensa carrega).
interface RegraCatalogo {
  action: string;
  prefixo: RegExp;
  destino: Destino;
  origemCrua?: RegExp;
}

export const CATALOGO: RegraCatalogo[] = [
  {
    // items.ts /dispense — pula a aprovação e joga na fila da Gráfica.
    action: "dispensed",
    prefixo: /^Peça dispensada pela Arte\./,
    destino: { tipo: "etapa", indice: ETAPA_PRODUCAO },
    origemCrua: /Status anterior:\s*([A-Za-z_]+)/,
  },
  {
    // items.ts /deliver — só a entrega TOTAL muda o status.
    action: "delivered",
    prefixo: /^Entrega concluída/,
    destino: { tipo: "entregue" },
  },
  {
    // items.ts /cancel (avulso e em lote).
    action: "canceled",
    prefixo: /^Item cancelado/,
    destino: { tipo: "fora" },
  },
  {
    // items.ts /return-to-art (avulso e em lote) — volta para a Arte.
    action: "rejected",
    prefixo: /^Item devolvido para Arte/,
    destino: { tipo: "etapa", indice: ETAPA_LAYOUTS },
  },
  {
    // items.ts /approve — caminho legado de "liberar para produção".
    action: "approved",
    prefixo: /liberado para produção$/,
    destino: { tipo: "etapa", indice: ETAPA_PRODUCAO },
  },
];

/**
 * A seta. Cobre as três redações que as rotas usam ("Status alterado:",
 * "Status:" da rota genérica e "Item reaberto:" da reversão de aprovação),
 * com ou sem prefixo antes ("Enviado para Arte — ", "Todos os patrocinadores
 * aprovaram. ").
 *
 * O `[^|]` no destino é o que impede a rota genérica de contaminar a leitura:
 * ela concatena as mudanças com " | " ("Status: A → B | Quantidade: 5 → 10").
 */
const RE_SETA = /(?:Status alterado|Status|Item reaberto):\s*([^→|]+?)\s*→\s*([^|]+)/;

/** Separa "Aguardando Finalização (aprovado pelo patrocinador)" em rótulo e sufixo. */
function partirDestino(bruto: string): { rotulo: string; sufixo: string | null } {
  const abre = bruto.indexOf("(");
  if (abre < 0) return { rotulo: bruto.trim(), sufixo: null };
  return { rotulo: bruto.slice(0, abre).trim(), sufixo: bruto.slice(abre) };
}

/**
 * Uma linha da trilha → a transição de etapa que ela representa, ou `null`
 * quando a linha não move a peça de etapa (a maioria: comentário, troca de
 * arquivo, conferência parcial).
 */
export function interpretarLog(action: string, details: string | null | undefined): Transicao | null {
  const txt = (details ?? "").trim();
  if (!txt) return null;

  for (const regra of CATALOGO) {
    if (regra.action !== action || !regra.prefixo.test(txt)) continue;
    let origem: number | null = null;
    if (regra.origemCrua) {
      const m = txt.match(regra.origemCrua);
      if (m?.[1]) origem = etapaDoStatus(m[1]);
    }
    return { destino: regra.destino, origem };
  }

  const m = txt.match(RE_SETA);
  if (!m) return null;
  const origem = origemDoRotulo(m[1]!);
  const { rotulo, sufixo } = partirDestino(m[2]!);
  const destino = destinoDoRotulo(rotulo, sufixo, origem);
  return destino ? { destino, origem } : null;
}

// ─── Permanência de UMA peça ─────────────────────────────────────────────────

export interface LogPeca {
  /** Instante real do registro, em ms. */
  ts: number;
  action: string;
  details: string | null;
}

/** Dias-calendário do NEGÓCIO entre dois instantes (nunca negativo). */
export function diasEntre(deMs: number, ateMs: number): number {
  const d = (spDayMs(new Date(ateMs)) - spDayMs(new Date(deMs))) / DIA_MS;
  return d > 0 ? d : 0;
}

/**
 * Permanência da peça por etapa, somando TODAS as passagens completas.
 *
 * PORQUÊ somar as passagens em vez de tratar cada uma como observação: a peça
 * que volta para a Arte três vezes passa três vezes pela Entrega de Layouts. Se
 * cada visita curta contasse separado, o retrabalho PUXARIA A MEDIANA PARA
 * BAIXO — a etapa pareceria mais rápida justamente onde a operação sofre mais.
 * Somando por peça, a unidade da mediana é "peça", que é o denominador que a
 * tela sabe declarar.
 *
 * `logs` precisa vir em ordem CRESCENTE de tempo.
 */
export function permanenciaDaPeca(
  logs: LogPeca[],
  criadaEmMs: number | null,
): Map<number, number> {
  const dias = new Map<number, number>();
  let aberta: { etapa: number; desde: number } | null = null;

  const fechar = (ateMs: number) => {
    if (!aberta) return;
    const d = diasEntre(aberta.desde, ateMs);
    dias.set(aberta.etapa, (dias.get(aberta.etapa) ?? 0) + d);
    aberta = null;
  };

  for (const log of logs) {
    const t = interpretarLog(log.action, log.details);
    if (!t) continue;

    // A ÚNICA entrada que se conhece sem registro: a peça nasce na primeira
    // etapa (`items.status` default "draft"), então `createdAt` é a hora em que
    // ela entrou ali. Vale só quando a própria linha declara ter saído de lá.
    if (!aberta && t.origem === ETAPA_LISTA && criadaEmMs != null && criadaEmMs <= log.ts) {
      aberta = { etapa: ETAPA_LISTA, desde: criadaEmMs };
    }

    if (t.destino.tipo === "fora") {
      aberta = null;
      continue;
    }
    if (t.destino.tipo === "entregue") {
      fechar(log.ts);
      continue;
    }
    const alvo = t.destino.indice;
    if (aberta && aberta.etapa === alvo) continue; // linha intra-etapa
    fechar(log.ts);
    aberta = { etapa: alvo, desde: log.ts };
  }

  return dias;
}

// ─── Planejado: a distância entre os marcos do EVENTO ────────────────────────

export interface EventoPrazos {
  truckDepartureDate: Date | string;
  deadlineListaImagens?: number | null;
  deadlineEntregaLayouts?: number | null;
  deadlineAprovacaoLayout?: number | null;
  deadlineFinalizacao?: number | null;
  deadlineRevisaoLista?: number | null;
  deadlineProducaoGrafica?: number | null;
}

/**
 * Dias planejados para cada etapa: a distância do marco da etapa ao da
 * ANTERIOR, com os offsets DO EVENTO (que pode sobrescrever os padrões
 * −25/−20/−12/−10/−8/−1) e o mesmo ajuste de fim de semana dos prazos.
 *
 * A primeira etapa devolve `null`: não existe marco antes dela de onde contar.
 */
export function planejadoPorEtapa(ev: EventoPrazos): (number | null)[] {
  const truck = truckDayUTC(ev.truckDepartureDate);
  if (!Number.isFinite(truck.getTime())) return STAGE_DEFS.map(() => null);
  const marcos = STAGE_DEFS.map((def) => {
    const off = ev[def.offsetField];
    const offset = typeof off === "number" && Number.isFinite(off) ? off : def.defaultOffset;
    return stageDeadline(truck, offset, def.allDays).getTime();
  });
  return marcos.map((m, i) => {
    if (i === 0) return null;
    const d = (m - marcos[i - 1]!) / DIA_MS;
    return Number.isFinite(d) && d >= 0 ? d : null;
  });
}

// ─── Agregação ───────────────────────────────────────────────────────────────

export function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const v = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(v.length / 2);
  return v.length % 2 ? v[meio]! : (v[meio - 1]! + v[meio]!) / 2;
}

export interface PecaMedida {
  id: string;
  eventId: string;
  /** Status ATUAL — é ele que diz onde a peça está parada hoje. */
  status: string;
  criadaEmMs: number | null;
  logs: LogPeca[];
}

export interface EntradaAgregacao {
  pecas: PecaMedida[];
  /** eventId → dias planejados por etapa (ver `planejadoPorEtapa`). */
  planejadoPorEvento: Map<string, (number | null)[]>;
  /** Instante do registro mais antigo lido, em ms. */
  desdeMs: number | null;
  logsLidos: number;
  truncado: boolean;
}

export function agregarTempoPorEtapa(e: EntradaAgregacao): TempoPorEtapa {
  const medidas: number[][] = STAGE_DEFS.map(() => []);
  const planejados: number[][] = STAGE_DEFS.map(() => []);
  const abertos: number[] = STAGE_DEFS.map(() => 0);
  let pecasMedidas = 0;

  for (const peca of e.pecas) {
    const paradaEm = etapaDoStatus(peca.status);
    if (paradaEm !== null) abertos[paradaEm]!++;

    const porEtapa = permanenciaDaPeca(peca.logs, peca.criadaEmMs);
    if (porEtapa.size > 0) pecasMedidas++;
    const plano = e.planejadoPorEvento.get(peca.eventId);
    porEtapa.forEach((dias, etapa) => {
      medidas[etapa]!.push(dias);
      const p = plano?.[etapa];
      if (p != null) planejados[etapa]!.push(p);
    });
  }

  const etapas: TempoEtapa[] = [];
  const etapasSemBase: TempoPorEtapa["etapasSemBase"] = [];

  STAGE_DEFS.forEach((def, i) => {
    const amostra = medidas[i]!;
    if (amostra.length < MINIMO_PECAS_POR_ETAPA) {
      etapasSemBase.push({ key: def.key, label: def.label, pecas: amostra.length });
      return;
    }
    const medianaDias = mediana(amostra);
    const planejadoDias = mediana(planejados[i]!);
    etapas.push({
      key: def.key,
      label: def.label,
      medianaDias,
      pecas: amostra.length,
      planejadoDias,
      deltaDias:
        medianaDias != null && planejadoDias != null
          ? Math.round((medianaDias - planejadoDias) * 100) / 100
          : null,
      emAberto: abertos[i]!,
    });
  });

  return {
    etapas,
    etapasSemBase,
    pecasNoRecorte: e.pecas.length,
    pecasMedidas,
    medicaoDesde: e.desdeMs == null ? null : new Date(e.desdeMs).toISOString(),
    logsLidos: e.logsLidos,
    truncado: e.truncado,
  };
}

// ─── Recorte de período ──────────────────────────────────────────────────────
//
// ESPELHO de `cycleWindow` (client/src/lib/analises-metrics.ts), que o servidor
// não importa. O teste compara os dois: se a janela do bloco não for a MESMA
// dos KPIs, o rodapé diria "1.204 peças no recorte" sobre outro recorte.

export const PERIOD_DAYS: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90 };

export interface JanelaCiclo {
  fromMs: number;
  toMs: number;
}

export function janelaDeCiclo(period: string, nowMs: number): JanelaCiclo | null {
  const days = PERIOD_DAYS[period];
  if (!days) return null;
  const hoje = spDayMs(new Date(nowMs));
  return { fromMs: hoje - days * DIA_MS, toMs: hoje };
}

export function dentroDaJanela(diaMs: number | null, j: JanelaCiclo | null): boolean {
  if (!j) return true;
  if (diaMs == null) return false;
  return diaMs >= j.fromMs && diaMs <= j.toMs;
}
