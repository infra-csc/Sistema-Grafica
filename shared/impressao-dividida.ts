// ─────────────────────────────────────────────────────────────────────────────
// IMPRESSÃO DIVIDIDA ENTRE IMPRESSORAS (dono, 21/09: "ao mover, poder
// selecionar tudo ou quantidades").
//
// Uma peça de 10 un. pode ter 3 na Impressora 1 e 2 na Impressora 2 ao mesmo
// tempo. O dado mora em items.impressao_por_maquina (jsonb):
//
//     { "1": { "atrib": 3, "impressas": 1 }, "2": { "atrib": 2, "impressas": 0 } }
//
//   · atrib     = unidades ATRIBUÍDAS àquela impressora (a imprimir ou já
//                 impressas nela); a soma nunca passa do que há para imprimir.
//   · impressas = quantas dessas já saíram dela.
//
// NULL = peça não dividida: tudo na `printMachine`, como sempre foi.
// `printMachine` continua sendo a impressora PRINCIPAL (a que mais tem por
// imprimir; empate = a que recebeu por último) para que tudo o que já lê esse
// campo siga correto. `quantityProduced` continua sendo o TOTAL da peça e é
// sempre a soma das `impressas` quando há divisão.
//
// Tudo aqui é puro: o servidor (start-printing / start-production), a aba
// Máquinas, a fila da Gráfica e o modal leem destas funções.
// ─────────────────────────────────────────────────────────────────────────────
import { MAQUINAS_DE_IMPRESSAO, rotuloDaMaquina } from "./fluxo-peca";

export type ParteDaMaquina = { atrib: number; impressas: number };
export type PartesPorMaquina = Record<string, ParteDaMaquina>;

/** O mínimo da peça que estas funções leem. */
export type PecaDividivel = {
  printMachine?: string | null;
  impressaoPorMaquina?: unknown;
  quantity?: number | string | null;
  reuseQty?: number | string | null;
  isReuse?: boolean | null;
  quantityProduced?: number | string | null;
};

const inteiro = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
};

/** Quanto há para imprimir (quantidade − reaproveitadas). */
export function aImprimirDaPeca(p: PecaDividivel): number {
  const qtd = inteiro(p.quantity);
  const reuso = p.isReuse ? qtd : inteiro(p.reuseQty);
  return Math.max(0, qtd - reuso);
}

/** Lê o jsonb com tolerância: só máquinas válidas, só números inteiros ≥ 0. */
export function lerPartes(bruto: unknown): PartesPorMaquina | null {
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return null;
  const partes: PartesPorMaquina = {};
  for (const [m, v] of Object.entries(bruto as Record<string, any>)) {
    if (!MAQUINAS_DE_IMPRESSAO.includes(m) || !v || typeof v !== "object") continue;
    const atrib = inteiro(v.atrib);
    const impressas = Math.min(atrib, inteiro(v.impressas));
    if (atrib > 0 || impressas > 0) partes[m] = { atrib, impressas };
  }
  return Object.keys(partes).length ? partes : null;
}

/** A peça está dividida entre mais de uma impressora? */
export function estaDividida(p: PecaDividivel): boolean {
  const partes = lerPartes(p.impressaoPorMaquina);
  return !!partes && Object.keys(partes).length > 1;
}

/**
 * As partes reais da peça: o jsonb quando existe, senão tudo na printMachine
 * (a forma "não dividida"). Sem printMachine, não há partes.
 */
export function partesDaPeca(p: PecaDividivel): PartesPorMaquina {
  const lidas = lerPartes(p.impressaoPorMaquina);
  if (lidas) return lidas;
  if (!p.printMachine) return {};
  return { [p.printMachine]: { atrib: aImprimirDaPeca(p), impressas: inteiro(p.quantityProduced) } };
}

/** A parte de UMA impressora (zeros quando ela não tem nada da peça). */
export function parteDaMaquina(p: PecaDividivel, maquina: string): ParteDaMaquina {
  return partesDaPeca(p)[maquina] ?? { atrib: 0, impressas: 0 };
}

/** Quantas ainda estão POR IMPRIMIR naquela impressora. */
export const restanteNaMaquina = (parte: ParteDaMaquina): number => Math.max(0, parte.atrib - parte.impressas);

/** A impressora principal: a que mais tem por imprimir; empate = `preferida`. */
export function maquinaPrincipal(partes: PartesPorMaquina, preferida?: string | null): string | null {
  let melhor: string | null = null;
  let maior = -1;
  for (const [m, parte] of Object.entries(partes)) {
    const r = restanteNaMaquina(parte);
    if (r > maior || (r === maior && m === preferida)) { maior = r; melhor = m; }
  }
  return melhor;
}

/** Soma das impressas — é o `quantityProduced` da peça quando dividida. */
export const totalImpressas = (partes: PartesPorMaquina): number =>
  Object.values(partes).reduce((s, x) => s + x.impressas, 0);

/**
 * Move `quantidade` unidades por imprimir de `origem` para `destino`
 * (`quantidade` ausente ou ≥ restante = tudo o que resta na origem). Devolve
 * as partes novas, quantas foram movidas e quantas ficaram na origem — ou o
 * erro em palavras. Puro: não decide printMachine nem grava nada.
 */
export function moverParte(
  partes: PartesPorMaquina, origem: string, destino: string, quantidade?: number | null,
): { ok: true; partes: PartesPorMaquina; movidas: number; ficam: number } | { ok: false; erro: string } {
  if (origem === destino) return { ok: false, erro: `A peça já está na ${rotuloDaMaquina(destino)}` };
  const de = partes[origem];
  const restante = de ? restanteNaMaquina(de) : 0;
  if (restante <= 0) return { ok: false, erro: `Não há nada por imprimir na ${rotuloDaMaquina(origem)} para mover` };
  const pedido = quantidade == null ? restante : inteiro(quantidade);
  if (pedido <= 0) return { ok: false, erro: "Informe quantas unidades vão para a outra impressora" };
  if (pedido > restante) return { ok: false, erro: `Só há ${restante} un. por imprimir na ${rotuloDaMaquina(origem)} — não dá para mover ${pedido}` };

  const novas: PartesPorMaquina = {};
  for (const [m, x] of Object.entries(partes)) novas[m] = { ...x };
  novas[origem] = { atrib: de.atrib - pedido, impressas: de.impressas };
  // Origem sem nada atribuído nem impresso some da divisão.
  if (novas[origem].atrib === 0 && novas[origem].impressas === 0) delete novas[origem];
  const para = novas[destino] ?? { atrib: 0, impressas: 0 };
  novas[destino] = { atrib: para.atrib + pedido, impressas: para.impressas };
  return { ok: true, partes: novas, movidas: pedido, ficam: restante - pedido };
}

/**
 * O que gravar no jsonb: NULL quando a peça não está dividida (uma só
 * impressora com tudo) — assim quem nunca leu a coluna continua certo.
 */
export function normalizarPartes(partes: PartesPorMaquina, aImprimir: number): PartesPorMaquina | null {
  const chaves = Object.keys(partes);
  if (chaves.length === 0) return null;
  if (chaves.length === 1 && partes[chaves[0]].atrib >= aImprimir) return null;
  return partes;
}

/** Partes que ainda têm algo POR IMPRIMIR — as zeradas ficam só como histórico. */
export function partesAtivas(partes: PartesPorMaquina): PartesPorMaquina {
  const ativas: PartesPorMaquina = {};
  for (const [m, x] of Object.entries(partes)) if (restanteNaMaquina(x) > 0) ativas[m] = x;
  return ativas;
}

/**
 * Quando `aImprimir` muda por fora (edição de quantidade, reaproveitamento,
 * correção de reaproveitamento), a soma dos `atrib` tem de acompanhar:
 * encolhe/estica o `atrib` da impressora principal (a com mais por imprimir),
 * nunca abaixo do que ela já imprimiu; se ainda sobrar, tira das outras.
 * Devolve NULL quando a divisão deixa de existir (uma chave só, ou teto 0).
 */
export function reescalarPartes(partes: PartesPorMaquina | null | undefined, aImprimir: number): PartesPorMaquina | null {
  if (!partes || Object.keys(partes).length === 0) return null;
  const alvo = Math.max(0, Math.floor(aImprimir));
  const novas: PartesPorMaquina = {};
  for (const [m, x] of Object.entries(partes)) novas[m] = { ...x };
  let soma = Object.values(novas).reduce((s, x) => s + x.atrib, 0);
  // Ordem de ajuste: a principal primeiro, depois as outras por restante.
  const ordem = Object.keys(novas).sort((a, b) => restanteNaMaquina(novas[b]) - restanteNaMaquina(novas[a]));
  if (soma > alvo) {
    for (const m of ordem) {
      if (soma <= alvo) break;
      const podeTirar = Math.min(soma - alvo, restanteNaMaquina(novas[m]));
      novas[m].atrib -= podeTirar;
      soma -= podeTirar;
    }
    // Ainda acima do teto: só impressas sobraram — o teto ficou abaixo do que
    // já saiu; encolhe as impressas junto (o handler já trata quantityProduced).
    for (const m of ordem) {
      if (soma <= alvo) break;
      const tira = Math.min(soma - alvo, novas[m].atrib);
      novas[m].atrib -= tira;
      novas[m].impressas = Math.min(novas[m].impressas, novas[m].atrib);
      soma -= tira;
    }
  }
  // Teto MAIOR que a soma não estica nenhuma parte: desde a reserva com
  // quantidade (shared/reserva-de-impressora.ts) a soma das partes pode ser
  // legitimamente menor que o teto — a diferença está reservada ou na fila geral.
  for (const m of Object.keys(novas)) if (novas[m].atrib === 0 && novas[m].impressas === 0) delete novas[m];
  return normalizarPartes(novas, alvo);
}

/** "Impressora 1 · 3 un. / Impressora 2 · 2 un." — a divisão em uma linha. */
export function resumoDaDivisao(partes: PartesPorMaquina): string {
  return Object.entries(partes)
    .map(([m, x]) => `${rotuloDaMaquina(m)} · ${x.impressas} de ${x.atrib} un.`)
    .join(" / ");
}

// ─── O LANÇAMENTO DE IMPRESSAS, PURO (revisão adversarial, 22/09) ─────────────
// PATCH /start-production lia a peça FORA da transação e gravava só `where id`:
// dois lançamentos simultâneos em impressoras diferentes da MESMA peça dividida
// partiam da mesma leitura, e o segundo apagava as impressas do primeiro (o
// jsonb inteiro é regravado). Agora a rota trava a linha (SELECT … FOR UPDATE)
// e chama ESTA função sobre a linha travada: o segundo lançamento enxerga o
// primeiro e soma a parte dele, em vez de sobrescrevê-la.
//
// Pura: a mesma conta para a rota e para o teste de comportamento, que simula
// duas leituras concorrentes (server/__tests__/impressao-revisao-adversarial).

/** A peça como a linha do banco a entrega (o mínimo que o lançamento lê). */
export type PecaParaLancar = PecaDividivel & {
  status?: string | null;
  quantity: number | string;
  productionStartedAt?: Date | string | null;
  producedAt?: Date | string | null;
  travadaEm?: Date | string | null;
};

/** O corpo do PATCH /start-production. */
export type PedidoDeLancamento = {
  quantityProduced?: unknown;
  expectedProduced?: unknown;
  /** Peça por partes: o que o operador leu NA PARTE desta impressora. */
  expectedNaMaquina?: unknown;
  printMachine?: unknown;
  maquina?: unknown;
  impressasNaMaquina?: unknown;
};

/** Marca do erro de trava: a rota troca pela frase e pelo código de shared/trava-da-peca. */
export const ERRO_LANCAMENTO_TRAVADA = "__TRAVADA__";

export type PlanoDeLancamento =
  | { ok: false; status: number; corpo: { error: string; code?: string; actualProduced?: number } }
  | {
    ok: true;
    /** As colunas a gravar — tudo sai daqui, inclusive updatedAt/statusChangedAt. */
    set: Record<string, unknown>;
    quantityProduced: number;
    jaProduzido: number;
    novoStatus: "produced" | "inProduction" | "ready_for_production";
    /** A impressora do registro no diário (null = sem o que anotar). */
    maquinaDoRegistro: string | null;
    /** A última parte ativa esgotou sem fechar a peça: ela voltou para a fila. */
    voltouParaAFila: boolean;
  };

const EM_IMPRESSAO_LANC = ["inProduction", "em_producao"];
const numeroExato = (v: unknown): number => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN);

export function planejarLancamentoDeImpressas(peca: PecaParaLancar, pedido: PedidoDeLancamento, agora: Date): PlanoDeLancamento {
  const erro = (status: number, error: string, extra: { code?: string; actualProduced?: number } = {}) => ({ ok: false as const, status, corpo: { error, ...extra } });
  // Travada pela Solicitação: nem informar impressas, nem mandar para o acabamento.
  if (peca.travadaEm) return erro(409, ERRO_LANCAMENTO_TRAVADA);
  const maquina = typeof pedido.maquina === "string" ? pedido.maquina : null;
  const printMachine = typeof pedido.printMachine === "string" ? pedido.printMachine : null;

  let partesDepois: PartesPorMaquina | null = null;
  let quantityProduced: number;
  const porPartes = !!lerPartes(peca.impressaoPorMaquina);
  if (porPartes) {
    // Por partes, o total da peça é a SOMA das partes: sem dizer a impressora
    // o lançamento descolaria o total do jsonb.
    if (maquina == null || pedido.impressasNaMaquina == null) {
      return erro(409, "Peça dividida entre impressoras: informe a impressora e quantas saíram dela");
    }
    const partes = partesDaPeca(peca);
    const parte = partes[maquina];
    const n = numeroExato(pedido.impressasNaMaquina);
    if (!parte) return erro(409, `A peça não tem unidades na ${rotuloDaMaquina(maquina)}`);
    if (!Number.isInteger(n) || n < 0) return erro(400, "Informe um número inteiro de unidades impressas");
    if (n > parte.atrib) return erro(400, `Máximo ${parte.atrib} un. na ${rotuloDaMaquina(maquina)} — é o que foi atribuído a ela`);
    partesDepois = { ...partes, [maquina]: { atrib: parte.atrib, impressas: n } };
    quantityProduced = totalImpressas(partesDepois);
  } else {
    quantityProduced = numeroExato(pedido.quantityProduced);
    // Fração (0,5) chegava ao banco (coluna inteira) e virava 500: recusa com frase.
    if (pedido.quantityProduced != null && !Number.isInteger(quantityProduced)) return erro(400, "Informe um número inteiro de unidades impressas");
  }
  if (!(quantityProduced > 0)) return erro(400, "quantityProduced is required and must be greater than 0");

  const qtd = parseInt(String(peca.quantity), 10) || 0;
  const reuso = inteiro(peca.reuseQty);
  const jaProduzido = inteiro(peca.quantityProduced);
  // Lançamento que não muda nada e não conclui a peça: nada a gravar nem anotar.
  const fecha = quantityProduced + reuso >= qtd;
  if (quantityProduced === jaProduzido && !fecha) return erro(409, `Nada mudou: já constam ${jaProduzido} un. impressas.`);
  // Informar impressas é gesto de peça EM IMPRESSÃO: a pausada (liberada, no
  // topo da fila) volta pelo start-printing, que checa a impressora ocupada.
  if (!EM_IMPRESSAO_LANC.includes(peca.status ?? "")) {
    return erro(409, "A peça não está em impressão — inicie a impressão antes de informar as impressas");
  }

  // O lock otimista, agora sobre a linha TRAVADA. Peça por partes com
  // `expectedNaMaquina`: compara só a parte desta impressora — dois operadores
  // em impressoras diferentes não se atrapalham (a soma é refeita aqui, sobre
  // a linha já com o lançamento do outro); dois na MESMA parte recebem o 409.
  if (porPartes && maquina && pedido.expectedNaMaquina != null) {
    const naParte = partesDaPeca(peca)[maquina]?.impressas ?? 0;
    const visto = numeroExato(pedido.expectedNaMaquina);
    if (visto !== naParte) {
      return erro(409, `Outra pessoa lançou impressas na ${rotuloDaMaquina(maquina)}: agora constam ${naParte} un. nela (você viu ${visto}). Confira o número e lance de novo.`, { code: "PRODUCTION_CONFLICT", actualProduced: jaProduzido });
    }
  } else if (pedido.expectedProduced != null && numeroExato(pedido.expectedProduced) !== jaProduzido) {
    return erro(409, `Outra pessoa lançou produção nesta peça: agora são ${jaProduzido} un. produzidas (você viu ${numeroExato(pedido.expectedProduced)}). Confira o número e lance de novo.`, { code: "PRODUCTION_CONFLICT", actualProduced: jaProduzido });
  }

  // Teto: produzido + reaproveitado não passa da quantidade da peça.
  if (quantityProduced + reuso > qtd) {
    return erro(400, `Quantidade inválida: ${quantityProduced} produzida(s) + ${reuso} reaproveitada(s) excede as ${qtd} un. da peça`);
  }

  const produzida = fecha;
  // LIMBO: a última parte ativa esgotou, mas a peça não fechou (o resto está
  // reservado a outra impressora ou sem impressora): volta a LIBERADA.
  const voltouParaAFila = !produzida && !!partesDepois && Object.keys(partesAtivas(partesDepois)).length === 0;
  const novoStatus = produzida ? "produced" : voltouParaAFila ? "ready_for_production" : "inProduction";
  // Não dividida: a impressora da peça NÃO muda por aqui (trocar é o
  // start-printing, com a checagem de ocupada) — uma `printMachine` diferente
  // da atual é ignorada. Só a peça antiga, sem impressora anotada, aceita a enviada.
  const maquinaAtual = peca.printMachine ?? null;
  const maquinaNaoDividida = maquinaAtual ?? (printMachine && MAQUINAS_DE_IMPRESSAO.includes(printMachine) ? printMachine : null);
  const set: Record<string, unknown> = {
    status: novoStatus,
    quantityProduced,
    updatedAt: agora,
    // O carimbo de "desde quando" quando a etapa muda (Produzido, ou de volta à fila).
    ...(novoStatus !== peca.status ? { statusChangedAt: agora } : {}),
    ...(!peca.productionStartedAt ? { productionStartedAt: agora } : {}),
    ...(partesDepois
      ? { impressaoPorMaquina: partesDepois, printMachine: maquinaPrincipal(partesDepois, maquina) ?? maquinaAtual }
      : (!maquinaAtual && maquinaNaoDividida ? { printMachine: maquinaNaoDividida } : {})),
    ...(voltouParaAFila ? { impressaoPorMaquina: null, printMachine: null } : {}),
    // Qualquer caminho que feche a peça apaga a divisão e o que sobrou de reserva.
    ...(produzida ? { impressaoPorMaquina: null, reservaPorMaquina: null, maquinaPrevista: null } : {}),
    // produced_at: a trilha temporal da ficha ganha a etapa "Produzido".
    ...(produzida && !peca.producedAt ? { producedAt: agora } : {}),
  };
  return {
    ok: true, set, quantityProduced, jaProduzido, novoStatus, voltouParaAFila,
    maquinaDoRegistro: partesDepois ? maquina : maquinaNaoDividida,
  };
}
