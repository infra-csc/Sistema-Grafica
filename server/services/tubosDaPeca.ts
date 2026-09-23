// ─────────────────────────────────────────────────────────────────────────────
// A PEÇA LEVA O TUBO (dono, 21/09: "mostrar esses novos status para o restante
// do fluxo, não só na Gráfica").
//
// GET /api/tubos é 403 para Atendimento e Arte — e deve continuar: o painel de
// tubos é ferramenta do galpão. Mas "em que tubo está a minha peça?" é pergunta
// de todo mundo. Em vez de abrir a rota, o número e os carimbos do tubo viajam
// NA PEÇA, só leitura, pelo mesmo enrich que já leva evento e patrocinadores.
//
// UM select em lote por request (só os ids presentes), nunca um por peça.
// Fotos, observação e quem entregou ficam de fora de propósito: são do painel
// do galpão e pesariam em toda lista.
// ─────────────────────────────────────────────────────────────────────────────
import { inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { tubos, tuboItens } from "@shared/schema";

export type ResumoDoTubo = {
  tuboNumero: number;
  /** Embalada SOZINHA: o volume não é um "Tubo N" (número negativo). */
  tuboAvulso: boolean;
  tuboFechadoEm: Date | null;
  tuboEntregueEm: Date | null;
  tuboRecebidoPor: string | null;
};

/** EMBALAGEM COM QUANTIDADE (21/09): um volume ABERTO da peça, com quanto dela está nele. */
export type VolumeDaPeca = { tuboId: string; numero: number; avulso: boolean; quantidade: number };
/** O mapa de resumos leva, de carona, os volumes por peça — `comTubo` os anexa. */
export type MapaDeResumos = Map<string, ResumoDoTubo> & { volumesPorItem?: Map<string, VolumeDaPeca[]>; entreguesPorItem?: Map<string, VolumeDaPeca[]> };

export async function resumosDeTuboPorIds(ids: Array<string | null | undefined>): Promise<MapaDeResumos> {
  const unicos = Array.from(new Set(ids.filter((v): v is string => !!v)));
  if (unicos.length === 0) return new Map();
  // O tubo é ENFEITE da lista: se este select falhar (banco de dev sem a
  // migração dos tubos, por exemplo), as peças saem sem o número — nunca um 500
  // em TODAS as listas de peças do sistema por causa de uma frase secundária.
  let linhas: Array<{ id: string; numero: number; avulso: boolean | null; fechadoEm: Date | null; entregueEm: Date | null; recebidoPor: string | null }>;
  try {
    linhas = await db
      .select({ id: tubos.id, numero: tubos.numero, avulso: tubos.avulso, fechadoEm: tubos.fechadoEm, entregueEm: tubos.entregueEm, recebidoPor: tubos.recebidoPor })
      .from(tubos)
      .where(inArray(tubos.id, unicos));
  } catch (erro) {
    console.error("[tubosDaPeca] não foi possível ler os tubos; peças seguem sem o número:", erro);
    return new Map();
  }
  const mapa: MapaDeResumos = new Map(linhas.map((t) => [t.id, {
    tuboNumero: t.numero, tuboAvulso: !!t.avulso, tuboFechadoEm: t.fechadoEm, tuboEntregueEm: t.entregueEm, tuboRecebidoPor: t.recebidoPor,
  }]));
  // A peça pode estar DIVIDIDA entre volumes ("Tubo 1 (7) · Tubo 2 (3)") e o
  // atalho `tubo_id` só aponta o principal. UM select a mais por request traz
  // todas as linhas abertas das peças que estão nestes tubos. Também é enfeite:
  // se falhar (banco sem a tabela nova), a peça segue só com o número.
  try {
    // As ENTREGUES vêm junto (revisão de 22/09): a etiqueta da peça dividida já
    // entregue usa a quantidade de cada tubo, e as unidades que já saíram num
    // tubo não viram "fora de volume" enquanto o outro está aberto.
    const todas = await db
      .select({ itemId: tuboItens.itemId, tuboId: tuboItens.tuboId, quantidade: tuboItens.quantidade, numero: tubos.numero, avulso: tubos.avulso, entregueEm: tuboItens.entregueEm })
      .from(tuboItens)
      .innerJoin(tubos, sql`${tubos.id} = ${tuboItens.tuboId}`)
      .where(sql`${tuboItens.itemId} in (select item_id from tubo_itens where ${inArray(tuboItens.tuboId, unicos)})`);
    const porItem = new Map<string, VolumeDaPeca[]>();
    const entreguesPorItem = new Map<string, VolumeDaPeca[]>();
    for (const l of todas) {
      const alvo = l.entregueEm ? entreguesPorItem : porItem;
      alvo.set(l.itemId, [...(alvo.get(l.itemId) ?? []), { tuboId: l.tuboId, numero: l.numero, avulso: !!l.avulso, quantidade: l.quantidade }]);
    }
    mapa.volumesPorItem = porItem;
    mapa.entreguesPorItem = entreguesPorItem;
  } catch (erro) {
    console.error("[tubosDaPeca] não foi possível ler as quantidades por volume:", erro);
  }
  return mapa;
}

/** Acrescenta o resumo à peça — só quando ela TEM tubo e o tubo existe. Puro. */
export function comTubo<T extends { id?: string; tuboId?: string | null }>(peca: T, porId: Map<string, ResumoDoTubo>): T {
  const resumo = peca.tuboId ? porId.get(peca.tuboId) : undefined;
  if (!resumo) return peca;
  const volumes = peca.id ? (porId as MapaDeResumos).volumesPorItem?.get(peca.id) : undefined;
  const entregues = peca.id ? (porId as MapaDeResumos).entreguesPorItem?.get(peca.id) : undefined;
  return {
    ...peca, ...resumo,
    ...(volumes?.length ? { tuboVolumes: volumes } : {}),
    // Os volumes JÁ ENTREGUES da peça, com a quantidade de cada — só a etiqueta lê.
    ...(entregues?.length ? { tuboVolumesEntregues: entregues } : {}),
  };
}
