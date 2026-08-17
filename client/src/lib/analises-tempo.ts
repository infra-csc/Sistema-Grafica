// Regras de APRESENTAÇÃO do bloco "Tempo por etapa". Sem React e sem I/O.
//
// A medição inteira acontece no servidor (`server/services/tempo-etapas.ts`);
// o que sobra para o cliente são decisões de leitura — como dizer a diferença
// contra o planejado e como declarar a cobertura. Elas moram aqui, e não dentro
// do componente, porque são as frases que o dono lê: "N de M peças" errado é um
// defeito de produto, e defeito de produto precisa de teste.
import type { TempoEtapa, TempoPorEtapa } from "@shared/tempo-etapas-contract";

/** Juízo sobre a diferença: subir contra o plano é sempre ruim aqui. */
export type Tom = "bom" | "ruim" | "neutro";

export interface Diferenca {
  texto: string;
  tom: Tom;
}

/**
 * Meio dia de folga para os dois lados antes de a etapa ser chamada de fora do
 * plano. A permanência é medida em dias-calendário e o plano é uma distância
 * entre marcos: tratar 0,3 dia como desvio produziria seta vermelha em etapa
 * que fecha no dia combinado.
 */
export const TOLERANCIA_DIAS = 0.5;

const nDias = (v: number) => {
  const n = Math.round(Math.abs(v) * 10) / 10;
  const txt = Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ",");
  return `${txt} ${n === 1 ? "dia" : "dias"}`;
};

/**
 * A diferença contra o planejado, já com o juízo embutido.
 *
 * `null` quando a etapa não tem plano de onde partir — é o caso da primeira
 * etapa do funil, que não tem marco anterior. Dizer "no plano" ali seria
 * afirmar que houve comparação.
 */
export function diferencaContraPlano(e: TempoEtapa): Diferenca | null {
  if (e.deltaDias == null) return null;
  if (Math.abs(e.deltaDias) < TOLERANCIA_DIAS) return { texto: "no plano", tom: "neutro" };
  return e.deltaDias > 0
    ? { texto: `${nDias(e.deltaDias)} além do plano`, tom: "ruim" }
    : { texto: `${nDias(e.deltaDias)} abaixo do plano`, tom: "bom" };
}

/**
 * A etapa mais cara do recorte — a resposta à pergunta que o bloco existe para
 * responder ("onde o tempo é perdido"). É a de maior atraso ABSOLUTO contra o
 * plano, não a de maior permanência: sete dias de Produção Gráfica dentro do
 * planejado não são perda, e dois dias numa etapa de meio dia são.
 */
export function etapaMaisCara(t: TempoPorEtapa): TempoEtapa | null {
  let pior: TempoEtapa | null = null;
  for (const e of t.etapas) {
    if (e.deltaDias == null || e.deltaDias <= TOLERANCIA_DIAS) continue;
    if (!pior || e.deltaDias > pior.deltaDias!) pior = e;
  }
  return pior;
}

const int = (n: number) => Math.round(n).toLocaleString("pt-BR");

/**
 * A frase de cobertura — a razão de este bloco poder voltar à tela.
 *
 * Ela precisa responder três coisas com NÚMERO, no espírito do resto da
 * Análises ("N de M peças no recorte"): sobre quantas peças a mediana foi
 * apurada, desde quando a trilha cobre, e o que ficou de fora. Sem isso, uma
 * mediana de poucas peças passaria por verdade da operação.
 */
export function frasesDeCobertura(t: TempoPorEtapa, formatarData: (iso: string) => string): string[] {
  const frases: string[] = [
    `Mediana apurada sobre ${int(t.pecasMedidas)} de ${int(t.pecasNoRecorte)} peças do recorte`
    + ` — as demais não têm, na trilha de auditoria, a entrada E a saída da mesma etapa registradas.`,
  ];

  if (t.medicaoDesde) {
    frases.push(
      `A trilha lida começa em ${formatarData(t.medicaoDesde)}: peça que passou por uma etapa antes disso`
      + ` não entra na conta, e nenhuma etapa aqui é a história completa da casa.`,
    );
  }

  const emAberto = t.etapas.reduce((s, e) => s + e.emAberto, 0);
  if (emAberto > 0) {
    frases.push(
      `${int(emAberto)} peças estão paradas nestas etapas agora e ficam fora da mediana`
      + ` — só passagem encerrada é medida, então mediana baixa com muita peça parada não é etapa rápida.`,
    );
  }

  if (t.etapasSemBase.length > 0) {
    const nomes = t.etapasSemBase.map((e) => e.label).join(", ");
    frases.push(
      `${t.etapasSemBase.length === 1 ? "Uma etapa não aparece" : `${t.etapasSemBase.length} etapas não aparecem`}`
      + ` por base insuficiente (${nomes}): abaixo de cinco peças a mediana descreve um caso, não a operação.`,
    );
  }

  if (t.truncado) {
    frases.push(
      `A varredura da trilha bateu o teto de ${int(t.logsLidos)} registros — o passado mais distante ficou fora.`,
    );
  }

  return frases;
}
