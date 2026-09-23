// ENTREGAR EM LOTE (dono, 23/09) — a orquestração, separada da rota para ser
// testada sem banco: cada volume é entregue pela MESMA função da entrega
// individual (`entregarUm`), um de cada vez e na ordem pedida; a recusa de um
// (peça travada, cancelada, fora do Kit…) volta com o motivo e não segura os
// outros; o fechamento de evento roda UMA vez por evento, depois de tudo.

export type VolumeEntregue = { tuboId: string; numero: number; avulso: boolean; eventId: string; pecas: number; unidades: number; itemIds: string[] };
export type ResultadoDoLote = {
  entregues: Array<Omit<VolumeEntregue, "itemIds">>;
  recusados: Array<{ tuboId: string; motivo: string }>;
  unidades: number;
};

export const MAXIMO_DO_LOTE = 100;
export const FALHA_GENERICA = "Não foi possível registrar a entrega deste volume — tente de novo.";

/** Ids únicos e não vazios, na ordem em que vieram. */
export function idsDoLote(bruto: unknown): string[] {
  if (!Array.isArray(bruto)) return [];
  return Array.from(new Set(bruto.filter((x): x is string => typeof x === "string" && x.trim() !== "")));
}

export async function entregarEmLote(ids: string[], {
  entregarUm, depoisDoEvento, ehRecusa, aoFalhar,
}: {
  /** Entrega um volume (transação própria). Lança a recusa da regra ou um erro inesperado. */
  entregarUm: (tuboId: string) => Promise<VolumeEntregue>;
  /** Fecha o evento e avisa as telas — uma vez por evento. */
  depoisDoEvento: (eventId: string, itemIds: string[]) => Promise<void>;
  /** A recusa da regra tem mensagem para o usuário; o resto é falha genérica. */
  ehRecusa: (e: unknown) => e is Error;
  aoFalhar?: (tuboId: string, e: unknown) => void;
}): Promise<ResultadoDoLote> {
  const entregues: VolumeEntregue[] = [];
  const recusados: ResultadoDoLote["recusados"] = [];
  const pecasPorEvento = new Map<string, string[]>();
  // Em série: as travas são por volume e por peça, e assim a ordem delas é a
  // mesma da entrega individual (nada de dois volumes disputando a mesma peça).
  for (const tuboId of ids) {
    try {
      const v = await entregarUm(tuboId);
      entregues.push(v);
      pecasPorEvento.set(v.eventId, [...(pecasPorEvento.get(v.eventId) ?? []), ...v.itemIds]);
    } catch (e) {
      if (ehRecusa(e)) { recusados.push({ tuboId, motivo: e.message }); continue; }
      aoFalhar?.(tuboId, e);
      recusados.push({ tuboId, motivo: FALHA_GENERICA });
    }
  }
  for (const [eventId, itemIds] of Array.from(pecasPorEvento)) {
    // O que já foi entregue está gravado: falhar aqui não desfaz a entrega.
    try { await depoisDoEvento(eventId, itemIds); } catch (e) { aoFalhar?.(eventId, e); }
  }
  return {
    entregues: entregues.map(({ itemIds: _ignorado, ...resto }) => resto),
    recusados,
    unidades: entregues.reduce((s, v) => s + v.unidades, 0),
  };
}
