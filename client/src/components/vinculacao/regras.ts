// ─────────────────────────────────────────────────────────────────────────────
// REGRAS PURAS DA VINCULAÇÃO — sem estado nem React, testáveis por fora.
// ─────────────────────────────────────────────────────────────────────────────
import { grupoDoKit } from "@shared/kit";
import { pulaAprovacao } from "@shared/prazo-sem-aprovacao";
import { compareDisplayId } from "@/lib/displayId";
import { COLLATOR_PTBR, DOWNSTREAM_STATUSES, LINKING_STATUSES } from "./constantes";
import type { ItemChanges, PecaDaVinculacao, SugestaoDaPeca, SugestoesDosEventos, UIStatus, VinculoAutomatico } from "./tipos";

/** A seção da linha: "KIT" (a peça do Kit) ou o tipo. */
export const secaoDaPeca = (p: PecaDaVinculacao): string => grupoDoKit(p) ?? (p.type || '');

// Função para determinar estado UI de um item (FONTE ÚNICA DE VERDADE)
export const getItemUIStatus = (
  item: PecaDaVinculacao,
  originalSponsors: string[],
  pendingChange?: ItemChanges
): UIStatus => {
  // 1. Se tem mudanças pendentes não salvas → RASCUNHO
  if (pendingChange?.isDirty) {
    return 'RASCUNHO';
  }

  // 2. Se status indica que já foi enviado para Arte ou produção → ENVIADO
  if (DOWNSTREAM_STATUSES.includes(item.status)) {
    return 'ENVIADO';
  }

  // 3. Items com status 'awaiting_linking' e com patrocinadores salvos → PRONTO (para enviar)
  const canSendStatuses = LINKING_STATUSES;
  if (canSendStatuses.includes(item.status)) {
    const hasSponsors = originalSponsors.length > 0;
    // "Sem patrocínio" OU "Arte do cliente" (Pedro/dono, 26/10): a peça não
    // passa pela Aprovação, então segue para a Arte sem patrocinador — o envio
    // do servidor aceita as duas marcas.
    const hasSkipApproval = pulaAprovacao(item);
    const isReuse = item.isReuse === true;
    if (hasSponsors || hasSkipApproval || isReuse) {
      return 'PRONTO';
    }
    return 'PENDENTE';
  }

  // 4. Caso contrário → PENDENTE
  return 'PENDENTE';
};

// URLs de referência vêm de input de usuário: só http(s) ou caminho relativo
// pode chegar a href/src — "javascript:..." executava no clique (XSS).
export const safeRefUrl = (u?: string | null): string | null =>
  u && /^(https?:\/\/|\/)/i.test(u.trim()) ? u.trim() : null;

// Função helper para converter hex para rgba
export const hexToRgba = (hex: string, alpha: number = 1): string => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return `rgba(59, 130, 246, ${alpha})`; // Fallback azul
  return `rgba(${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}, ${alpha})`;
};

// Helper para comparar arrays de sponsor IDs
export const areSponsorsEqual = (a: string[], b: string[]): boolean => {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((id, index) => id === sortedB[index]);
};

/**
 * A ORDEM DE LEITURA DA PRODUÇÃO: grupo pai → tipo → ID.
 *
 * A tabela abre um cabeçalho de tipo sempre que o tipo MUDA em relação à
 * linha anterior (`abreTipo`, na fila). Isso só agrupa se a lista chegar
 * ordenada por tipo — sem esta ordem, cada cabeçalho dizia "TOTENS 6" com UMA
 * linha embaixo, seguida de "QUADROS 4X3 6" com uma linha, e assim por
 * diante: a contagem certa, a lista misturada.
 *
 * O Kit vai por último, todo junto (uma inclusão só, 23/10). Dentro do tipo, compareDisplayId
 * (não replace(/\D/g,'')): o complemento "#0062-C1" virava 621 e desgrudava
 * da peça original.
 */
export const ordenarParaLeitura = (lista: PecaDaVinculacao[], typeToGroup: Record<string, string>) => [...lista].sort((a, b) => {
  const ka = grupoDoKit(a) ?? '', kb = grupoDoKit(b) ?? '';
  if (!!ka !== !!kb) return ka ? 1 : -1;
  if (ka !== kb) return COLLATOR_PTBR.compare(ka, kb);
  if (ka) return compareDisplayId(a.displayId, b.displayId);
  const ga = typeToGroup[a.type] || '', gb = typeToGroup[b.type] || '';
  if (ga !== gb) return COLLATOR_PTBR.compare(ga, gb);
  if (a.type !== b.type) return COLLATOR_PTBR.compare(a.type || '', b.type || '');
  return compareDisplayId(a.displayId, b.displayId);
});

/**
 * A mensagem de um erro pego em `catch`. O `catch` recebe `unknown`; lê a
 * `message` de quem tiver uma (Error ou objeto do servidor), como o
 * `e?.message` de antes — e `undefined` quando não há.
 */
export function mensagemDoErro(e: unknown): string | undefined {
  if (e && typeof e === "object" && "message" in e) {
    const m = (e as { message?: unknown }).message;
    return typeof m === "string" ? m : undefined;
  }
  return undefined;
}

/**
 * AS SUGESTÕES QUE A LINHA MOSTRA (15/10): só em peça SEM patrocinador salvo,
 * fora do "sem patrocinador" e que a pessoa não descartou. Com vínculo salvo,
 * alguém já decidiu — a sugestão não se mete.
 */
export const sugestoesAtivas = (
  sugestoes: SugestaoDaPeca[] | undefined,
  salvos: string[] | undefined,
  semPatrocinador: boolean,
  descartada: boolean,
): SugestaoDaPeca[] | undefined =>
  !sugestoes || sugestoes.length === 0 || descartada || semPatrocinador || (salvos?.length ?? 0) > 0 ? undefined : sugestoes;

/** A resposta de /api/sugestoes-de-vinculo achatada por peça — tolera corpo fora do formato (vira vazio). */
export function achatarSugestoes(cru: unknown): {
  porPeca: Record<string, SugestaoDaPeca[]>;
  automaticos: Record<string, VinculoAutomatico[]>;
} {
  const porPeca: Record<string, SugestaoDaPeca[]> = {};
  const automaticos: Record<string, VinculoAutomatico[]> = {};
  if (!cru || typeof cru !== "object" || Array.isArray(cru)) return { porPeca, automaticos };
  for (const ev of Object.values(cru as SugestoesDosEventos)) {
    if (!ev || typeof ev !== "object") continue;
    if (ev.porPeca && typeof ev.porPeca === "object") Object.assign(porPeca, ev.porPeca);
    if (ev.automaticos && typeof ev.automaticos === "object") Object.assign(automaticos, ev.automaticos);
  }
  return { porPeca, automaticos };
}

const listaDeNomes = (nomes: string[]): string => {
  if (nomes.length <= 1) return nomes[0] ?? "";
  if (nomes.length <= 3) return `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
  return `${nomes.slice(0, 2).join(", ")} e mais ${nomes.length - 2}`;
};

/** A ordem das cotas na faixa: a de sempre do cadastro; as outras, por nome. */
const ORDEM_DAS_COTAS = ["MASTER", "GOLD", "SILVER", "APOIO", "MIDIA", "MINISTERIO"];

/**
 * A FRASE DA FAIXA DE SUGESTÃO, AGRUPADA POR COTA (dono, 15/10: "as sugestões
 * têm que ser pela peça de cota, não grupo"):
 *
 *   MASTER: Itaú (14 de 15 eventos) · GOLD: Nike e Gatorade (9 de 10 eventos)
 *
 * O tipo da peça não se repete (está na própria linha); o detalhe é quantos
 * eventos sustentam a cota naquele tipo, ou a regra de "Configurar cotas".
 *
 * O patrocinador cuja cota veio do histórico (não está no evento) leva a
 * marca "(cota do histórico)" ao lado do nome. Os nomes na descrição vêm
 * antes, num grupo próprio; dois nomes juntos pedem conferência.
 */
export function gruposDaSugestao(
  sugestoes: SugestaoDaPeca[],
  nomeDe: Map<string, string>,
): Array<{ quem: string; motivo: string }> {
  const nomesNaDescricao: string[] = [];
  let ambiguo = false;
  const porCota = new Map<string, { cota: string; detalhe: string; nomes: string[] }>();
  for (const s of sugestoes) {
    const nome = nomeDe.get(s.sponsorId);
    if (!nome) continue;
    if (s.regra === "nome-na-descricao") {
      nomesNaDescricao.push(nome);
      if (s.motivo !== "O nome está na descrição") ambiguo = true;
      continue;
    }
    const cota = s.cota ?? "COTA";
    // "Itaú · MASTER — MASTER vai em Display (12 de 14 eventos)" → "vai em Display (12 de 14 eventos)"
    const depois = s.motivo.includes(" — ") ? s.motivo.slice(s.motivo.indexOf(" — ") + 3) : s.motivo;
    const semCota = depois.startsWith(`${cota} `) ? depois.slice(cota.length + 1) : depois;
    // "(12 de 13 eventos)" — e ", pelo tipo da peça" quando o nome não tinha histórico.
    const eventos = /\((\d+ de \d+ eventos)\)(, pelo tipo da peça)?$/.exec(semCota);
    const detalhe = eventos ? `${eventos[1]}${eventos[2] ?? ""}` : semCota.startsWith("Configurar cotas") ? "regra de Configurar cotas" : semCota;
    const chave = `${cota}|${detalhe}`;
    if (!porCota.has(chave)) porCota.set(chave, { cota, detalhe, nomes: [] });
    porCota.get(chave)!.nomes.push(s.cotaDoHistorico ? `${nome} (cota do histórico)` : nome);
  }
  const grupos: Array<{ quem: string; motivo: string }> = [];
  if (nomesNaDescricao.length > 0) {
    grupos.push({
      quem: listaDeNomes(nomesNaDescricao),
      motivo: !ambiguo
        ? "o nome está na descrição"
        : nomesNaDescricao.length === 2 ? "os dois nomes estão na descrição; confira se vão os dois" : "os nomes estão na descrição; confira quais vão",
    });
  }
  const posicao = (c: string) => { const i = ORDEM_DAS_COTAS.indexOf(c); return i < 0 ? ORDEM_DAS_COTAS.length : i; };
  Array.from(porCota.values())
    .sort((a, b) => posicao(a.cota) - posicao(b.cota) || a.cota.localeCompare(b.cota))
    .forEach((g) => grupos.push({ quem: `${g.cota}: ${listaDeNomes(g.nomes)}`, motivo: g.detalhe }));
  return grupos;
}
