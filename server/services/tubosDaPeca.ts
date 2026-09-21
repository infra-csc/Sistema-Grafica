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
import { inArray } from "drizzle-orm";
import { db } from "../db";
import { tubos } from "@shared/schema";

export type ResumoDoTubo = {
  tuboNumero: number;
  /** Embalada SOZINHA: o volume não é um "Tubo N" (número negativo). */
  tuboAvulso: boolean;
  tuboFechadoEm: Date | null;
  tuboEntregueEm: Date | null;
  tuboRecebidoPor: string | null;
};

export async function resumosDeTuboPorIds(ids: Array<string | null | undefined>): Promise<Map<string, ResumoDoTubo>> {
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
  return new Map(linhas.map((t) => [t.id, {
    tuboNumero: t.numero, tuboAvulso: !!t.avulso, tuboFechadoEm: t.fechadoEm, tuboEntregueEm: t.entregueEm, tuboRecebidoPor: t.recebidoPor,
  }]));
}

/** Acrescenta o resumo à peça — só quando ela TEM tubo e o tubo existe. Puro. */
export function comTubo<T extends { tuboId?: string | null }>(peca: T, porId: Map<string, ResumoDoTubo>): T {
  const resumo = peca.tuboId ? porId.get(peca.tuboId) : undefined;
  return resumo ? { ...peca, ...resumo } : peca;
}
