// ─────────────────────────────────────────────────────────────────────────────
// ESTOQUE AGRUPADO POR QUANTIDADE (dono, 21/09): "agrupado por quantidade, não
// ficar assim separada" — eram 34 linhas "#EST-0396-N · 2×1 Nubank ×1", uma
// por unidade, todas iguais.
//
// O CRITÉRIO é o mesmo da Triagem (chaveDoGrupo: mesma peça de origem; senão
// nome + patrocinadores) — um módulo só decide o que é "igual". Aqui mora o que
// é próprio do acervo: a distribuição por situação e por condição, em UNIDADES.
// Agrupamento de TELA: nenhum registro é fundido nem alterado. Puro.
// ─────────────────────────────────────────────────────────────────────────────
import { chaveDoGrupo } from "@/components/triagem/grupos-da-triagem";

export { chaveDoGrupo };

export type AtivoDoAcervo = {
  id: string; displayId: string; name: string; quantity?: number | null; condition: string; trackingStatus: string;
  originalItemId?: string | null; sponsorIds?: string[] | null; approvalThumbUrl?: string | null;
};

export type GrupoDoAcervo<T extends AtivoDoAcervo> = {
  chave: string;
  nome: string;
  ativos: T[];
  unidades: number;
  /** Unidades por situação (NO_GALPAO, EM_USO, EM_MANUTENCAO, DESCARTADO…). */
  porSituacao: Record<string, number>;
  /** Unidades por condição (PERFEITO, AVARIA_LEVE, SUCATA). */
  porCondicao: Record<string, number>;
  /** Unidades no galpão que NÃO estão livres: reservadas ou separadas para o
   *  evento de origem que ainda não aconteceu ("No galpão" não quer dizer livre). */
  separadas: number;
  miniatura: string | null;
};

const porCodigo = new Intl.Collator("pt-BR", { numeric: true });

export function agruparAcervo<T extends AtivoDoAcervo>(
  ativos: readonly T[],
  eventoDeOrigem: (a: T) => string | null,
  estaSeparada: (a: T) => boolean,
): GrupoDoAcervo<T>[] {
  const porChave = new Map<string, GrupoDoAcervo<T>>();
  for (const a of ativos) {
    const chave = chaveDoGrupo({ eventId: eventoDeOrigem(a), originalItemId: a.originalItemId ?? null, name: a.name, sponsorIds: a.sponsorIds ?? [] } as any);
    let g = porChave.get(chave);
    if (!g) { g = { chave, nome: a.name, ativos: [], unidades: 0, porSituacao: {}, porCondicao: {}, separadas: 0, miniatura: null }; porChave.set(chave, g); }
    const un = a.quantity ?? 1;
    g.ativos.push(a);
    g.unidades += un;
    g.porSituacao[a.trackingStatus] = (g.porSituacao[a.trackingStatus] ?? 0) + un;
    g.porCondicao[a.condition] = (g.porCondicao[a.condition] ?? 0) + un;
    if (a.trackingStatus === "NO_GALPAO" && estaSeparada(a)) g.separadas += un;
    if (!g.miniatura && a.approvalThumbUrl) g.miniatura = a.approvalThumbUrl;
  }
  const grupos = Array.from(porChave.values());
  for (const g of grupos) g.ativos.sort((x, y) => porCodigo.compare(x.displayId, y.displayId));
  return grupos;
}

const NOME_DA_SITUACAO: [string, string][] = [
  ["NO_GALPAO", "no galpão"], ["EM_USO", "em uso"], ["EM_MANUTENCAO", "em manutenção"], ["AGUARDANDO_TRIAGEM", "aguardando triagem"], ["DESCARTADO", "descartadas"],
];

/** "30 no galpão (4 separadas) · 4 em uso" — só o que existe, na ordem do ciclo. */
export function fraseDaSituacao(g: Pick<GrupoDoAcervo<AtivoDoAcervo>, "porSituacao" | "separadas">): string {
  return NOME_DA_SITUACAO
    .filter(([k]) => (g.porSituacao[k] ?? 0) > 0)
    .map(([k, nome]) => `${g.porSituacao[k]} ${nome}${k === "NO_GALPAO" && g.separadas > 0 ? ` (${g.separadas} ${g.separadas === 1 ? "separada" : "separadas"})` : ""}`)
    .join(" · ");
}

const NOME_DA_CONDICAO: [string, string, string][] = [["PERFEITO", "perfeito", "Todas em perfeito estado"], ["AVARIA_LEVE", "avaria leve", "Todas com avaria leve"], ["SUCATA", "sucata", "Todas sucata"]];

/** "Todas em perfeito estado" ou "32 perfeito · 2 avaria leve". */
export function fraseDaCondicao(g: Pick<GrupoDoAcervo<AtivoDoAcervo>, "porCondicao" | "unidades">): string {
  const presentes = NOME_DA_CONDICAO.filter(([k]) => (g.porCondicao[k] ?? 0) > 0);
  if (presentes.length === 1 && g.porCondicao[presentes[0][0]] === g.unidades) return presentes[0][2];
  return presentes.map(([k, nome]) => `${g.porCondicao[k]} ${nome}`).join(" · ");
}
