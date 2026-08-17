// Contrato do bloco "Tempo por etapa" da tela de Análises.
//
// PORQUÊ existe um contrato compartilhado: o número é medido no SERVIDOR
// (agregando `audit_logs`) e exibido no CLIENTE. Sem um tipo comum, a tela
// voltaria a declarar a sua própria forma do payload — foi exatamente o
// `useQuery<any[]>` que deixou passar o `sponsorIds` que nunca existiu.
//
// NÃO altera `schema.ts`: nenhuma coluna nova. Tudo aqui é derivado da trilha
// de auditoria que já é gravada.

/** Uma etapa do funil, medida contra o que estava planejado para ela. */
export interface TempoEtapa {
  /** Chave canônica de `STAGE_DEFS` (server/services/prazo-domain.ts). */
  key: string;
  label: string;
  /**
   * MEDIANA da permanência, em dias-calendário do fuso do negócio.
   *
   * Mediana e não média: uma peça esquecida três meses numa etapa desloca a
   * média da operação inteira e a etapa passa a mentir para os dois lados —
   * parece péssima quando o normal é bom.
   *
   * `null` quando a etapa não alcançou `MINIMO_PECAS_POR_ETAPA`.
   */
  medianaDias: number | null;
  /** Peças que entraram na mediana (passagem com ENTRADA e SAÍDA registradas). */
  pecas: number;
  /**
   * Dias planejados para a etapa — a distância entre o marco desta etapa e o
   * da anterior, pelos offsets do EVENTO de cada peça (mediana, para casar com
   * a população da medida). `null` na primeira etapa, que não tem marco
   * anterior de onde partir.
   */
  planejadoDias: number | null;
  /** `medianaDias - planejadoDias`. Positivo = passou do plano. */
  deltaDias: number | null;
  /**
   * Peças HOJE paradas nesta etapa, e que por isso não entram na mediana.
   *
   * Não é decoração: medir só quem já saiu é viés de sobrevivência: uma etapa
   * onde as peças difíceis empacam exibiria a mediana das fáceis. Este número
   * é o contrapeso — mediana baixa com muita peça em aberto não é etapa rápida.
   */
  emAberto: number;
}

export interface TempoPorEtapa {
  /** Só as etapas com base suficiente. Etapa sem base não vira linha vazia. */
  etapas: TempoEtapa[];
  /** Etapas que ficaram de fora por base insuficiente (para a tela declarar). */
  etapasSemBase: { key: string; label: string; pecas: number }[];
  /** Peças do recorte — o denominador visível, regra da tela. */
  pecasNoRecorte: number;
  /** Peças do recorte com ao menos UMA passagem medida. */
  pecasMedidas: number;
  /**
   * Registro de transição mais antigo que entrou na conta (ISO), ou `null`.
   * É o "a partir de quando isto é confiável" — antes desta data a trilha não
   * cobre, e a tela precisa dizer.
   */
  medicaoDesde: string | null;
  /** Linhas de trilha lidas para produzir a resposta. Custo declarado. */
  logsLidos: number;
  /** Bateu o teto de varredura — o número é parcial e a tela avisa. */
  truncado: boolean;
}

/**
 * Piso de peças para uma etapa publicar mediana.
 *
 * PORQUÊ 5: abaixo disso uma única peça move a mediana uma posição inteira, e
 * o número deixa de descrever a operação para descrever um caso. O dono
 * reprovou o bloco que dizia "— dias"; publicar "1,5 dia" apurado em três
 * peças seria pior — erra com cara de certeza.
 */
export const MINIMO_PECAS_POR_ETAPA = 5;

/**
 * O bloco só existe se alguma etapa tiver base. Bloco vazio foi exatamente o
 * que foi reprovado ("dado indisponível, não está nota 10 nunca essa tela"):
 * a decisão registrada é que, sem número, o espaço não volta.
 */
export function temBaseParaExibir(t: TempoPorEtapa | null | undefined): boolean {
  // `Array.isArray` e não `t.etapas.length`: enquanto a query não respondeu (ou
  // se ela falhar) o que chega aqui não tem a forma do contrato, e um bloco que
  // derruba a tela inteira ao ler `.length` de `undefined` seria pior do que o
  // bloco vazio que isto existe para evitar.
  return !!t && Array.isArray(t.etapas) && t.etapas.length > 0;
}
