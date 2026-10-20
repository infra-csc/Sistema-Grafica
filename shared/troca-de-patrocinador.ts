// ─────────────────────────────────────────────────────────────────────────────
// TROCAR O PATROCINADOR DO EVENTO SEM CANCELAR PEÇAS (dono, 20/10).
//
// O incidente: 16/10, "Longevidade Bradesco - Manaus". O Atendimento criou
// "Bradesco Seguros", vinculou ao evento e, NA MESMA EDIÇÃO, tirou "Bradesco".
// O desvínculo do evento tirou "Bradesco" de 17 peças e CANCELOU as 13 que só
// tinham ele (a regra "era o único" de server/routes/sponsors.ts). A intenção
// era TROCAR. Aconteceu 4 vezes desde agosto; nas outras 3 o patrocinador saiu
// de verdade — então "só remover" continua sendo uma resposta legítima. O que
// mudou: o app PERGUNTA, peça a peça não, patrocinador a patrocinador.
//
// Este arquivo é a regra que os DOIS lados leem: a tela (para contar, antes
// do clique, quantas peças seriam canceladas e quantas aprovações abririam) e
// o servidor (para decidir o que acontece com cada peça na troca).
// ─────────────────────────────────────────────────────────────────────────────
import { DEPOIS_DA_ARTE, POS_APROVACAO } from "./fluxo-peca";

/** A rodada de aprovação está EM CURSO: a linha pendente do novo nasce junto. */
export const EM_APROVACAO_NA_TROCA: readonly string[] = ["awaiting_approval", "awaiting_sponsor_approval"];

/**
 * Em que ponto do fluxo a peça está, do ponto de vista da troca:
 *
 *   · antes_da_aprovacao — rascunho, vinculação, esperando a Arte enviar. Só
 *     o VÍNCULO troca: a rodada é montada a partir dos vínculos quando a Arte
 *     envia o layout, e o novo já entra nela.
 *   · em_aprovacao — a rodada está aberta. O novo ganha a linha PENDENTE (a
 *     mesma regra do POST /api/items/:id/sponsors); a pendente do antigo é
 *     descartada; a APROVADA do antigo fica na trilha.
 *   · depois_da_aprovacao — a rodada já fechou (finalização, revisão) ou a
 *     peça já está na Gráfica. DECISÃO (20/10): troca o vínculo e NÃO reabre a
 *     aprovação. Reabrir puxaria de volta para o Atendimento uma peça que pode
 *     estar na impressora por uma troca que, no caso real, era de cadastro (a
 *     mesma marca com outro nome). A aprovação do antigo fica no histórico, e
 *     a resposta e a trilha dizem quantas eram — se o novo precisar mesmo
 *     aprovar, o caminho é o Acrescentar/Revogar, que é decisão de gente.
 *   · fora_do_fluxo — cancelada ou arquivada: só o vínculo troca (se um dia
 *     for descancelada, volta com a marca certa).
 */
export type FaseNaTroca = "antes_da_aprovacao" | "em_aprovacao" | "depois_da_aprovacao" | "fora_do_fluxo";

export function faseNaTroca(status: string): FaseNaTroca {
  if (status === "canceled" || status === "archived") return "fora_do_fluxo";
  if (EM_APROVACAO_NA_TROCA.includes(status)) return "em_aprovacao";
  if (POS_APROVACAO.includes(status) || DEPOIS_DA_ARTE.has(status)) return "depois_da_aprovacao";
  return "antes_da_aprovacao";
}

/** A peça como GET /api/events/:id/sponsors/pecas devolve — o mínimo para contar. */
export interface PecaNaSaida {
  id: string;
  displayId: string | null;
  type: string | null;
  status: string;
  /** TODOS os patrocinadores da peça (não só os que estão saindo). */
  sponsorIds: string[];
}

/** O que fazer com as peças de UM patrocinador que sai do evento. */
export type DecisaoDeSaida = { tipo: "trocar"; para: string } | { tipo: "remover" };

/**
 * A peça seria CANCELADA se os patrocinadores de `soRemover` saíssem?
 *
 * Espelha descartarPendenciaEFecharRodada (server/routes/sponsors.ts): só
 * cancela peça que ainda não chegou na Gráfica (DEPOIS_DA_ARTE) e que fica sem
 * NENHUM patrocinador. As trocas rodam antes das remoções, então um
 * patrocinador trocado nunca deixa a peça vazia.
 */
export function seriaCancelada(peca: Pick<PecaNaSaida, "status" | "sponsorIds">, soRemover: ReadonlySet<string>): boolean {
  if (DEPOIS_DA_ARTE.has(peca.status)) return false;
  return peca.sponsorIds.length > 0 && peca.sponsorIds.every((id) => soRemover.has(id));
}

export interface ImpactoDaSaida {
  /** Peças do evento com este patrocinador. */
  pecas: number;
  /** Peças em que ele é o ÚNICO patrocinador e que ainda não chegaram na Gráfica. */
  soEle: number;
  /** Quantas seriam canceladas com "Só remover", dadas as decisões dos OUTROS que saem. */
  canceladasSeRemover: number;
  /** Peças com a rodada aberta: na troca, a aprovação pendente abre para o novo. */
  emAprovacao: number;
  /** Peças que já passaram da aprovação: na troca, o vínculo muda sem reabrir. */
  depoisDaAprovacao: number;
}

/**
 * O impacto de cada patrocinador que sai, recalculado a cada decisão: quem
 * escolhe "Só remover" para dois patrocinadores de uma vez pode cancelar uma
 * peça que tinha os dois — e o aviso precisa contar isso ANTES do clique.
 * Decisão ainda não tomada não conta como remoção.
 */
export function impactoDaSaida(
  pecas: readonly PecaNaSaida[],
  removidos: readonly string[],
  decisoes: Readonly<Record<string, DecisaoDeSaida | undefined>>,
): Record<string, ImpactoDaSaida> {
  const out: Record<string, ImpactoDaSaida> = {};
  for (const s of removidos) {
    const outrosRemovendo = new Set(removidos.filter((r) => r !== s && decisoes[r]?.tipo === "remover"));
    outrosRemovendo.add(s);
    const dele = pecas.filter((p) => p.sponsorIds.includes(s));
    out[s] = {
      pecas: dele.length,
      soEle: dele.filter((p) => p.sponsorIds.length === 1 && !DEPOIS_DA_ARTE.has(p.status)).length,
      canceladasSeRemover: dele.filter((p) => seriaCancelada(p, outrosRemovendo)).length,
      emAprovacao: dele.filter((p) => faseNaTroca(p.status) === "em_aprovacao").length,
      depoisDaAprovacao: dele.filter((p) => faseNaTroca(p.status) === "depois_da_aprovacao").length,
    };
  }
  return out;
}

/**
 * PRÉ-SELEÇÃO DO DESTINO — o caso Kakau: na mesma edição saiu UM patrocinador
 * com peças e entrou UM novo. É quase certamente uma troca, e o diálogo já
 * abre com "Passar para ‹novo›" escolhido (a pessoa confirma ou muda).
 *
 * Com mais de um saindo, ou mais de um entrando, a correspondência deixa de
 * ser óbvia — dois que saem para um que entra pode ser fusão ou pode ser
 * coincidência. Aí nada vem marcado; o que entrou aparece no topo da lista.
 */
export function destinosPreSelecionados(
  removidosComPecas: readonly string[],
  entrantes: readonly string[],
): Record<string, string> {
  if (removidosComPecas.length === 1 && entrantes.length === 1 && removidosComPecas[0] !== entrantes[0]) {
    return { [removidosComPecas[0]]: entrantes[0] };
  }
  return {};
}

/** Resultado de POST /api/events/:id/sponsors/trocar. */
export interface ResultadoDaTroca {
  de: string;
  para: string;
  /** Peças do evento que tinham o antigo. */
  pecas: number;
  /** Delas, as que passaram a ter o novo (as que já o tinham contam aqui também). */
  passaram: number;
  /** Já tinham o novo antes da troca (o antigo só saiu). */
  jaTinhamONovo: number;
  /** Linhas de aprovação PENDENTE criadas para o novo (peças com a rodada aberta). */
  pendenciasAbertas: number;
  /** Pendências do antigo descartadas (não contam mais). */
  pendenciasDescartadas: number;
  /** Aprovações JÁ DADAS pelo antigo — ficam no histórico. */
  aprovacoesMantidas: number;
  /** Peças que já tinham passado da aprovação: vínculo trocado SEM reabrir. */
  semReabrir: number;
  /** Rodadas que fecharam porque o novo já tinha aprovado e só faltava o antigo. */
  rodadasFechadas: number;
  /** Moldes/produção interna (não levam patrocinador): o antigo só saiu. */
  soTiradas: number;
  /** Sempre 0 — é o ponto da rota. Vai na resposta para a tela poder dizer. */
  canceladas: 0;
  /** O vínculo do novo com o EVENTO: criado agora ou já existia. */
  vinculoDoNovo: "criado" | "ja_existia";
  /** Cota do antigo que passou para o novo (null = nada passou). */
  cotaHerdada: string | null;
  /** Repetição de uma troca já feita: nada mudou e nada foi gravado na trilha. */
  nadaATrocar: boolean;
  /** A frase que vai para a trilha do evento e para o aviso da tela. */
  resumo: string;
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** A frase do resumo — a mesma na trilha do evento e no aviso da tela. */
export function resumoDaTroca(
  nomeDe: string,
  nomePara: string,
  r: Omit<ResultadoDaTroca, "resumo" | "de" | "para" | "nadaATrocar">,
): string {
  const partes: string[] = [];
  partes.push(
    r.passaram === 0
      ? "nenhuma peça tinha o antigo"
      : `${plural(r.passaram, "peça passou", "peças passaram")} para o novo`,
  );
  partes.push("nenhuma cancelada");
  if (r.pendenciasAbertas > 0) partes.push(`${plural(r.pendenciasAbertas, "aprovação pendente aberta", "aprovações pendentes abertas")} para o novo`);
  if (r.semReabrir > 0) {
    partes.push(`${plural(r.semReabrir, "peça já tinha", "peças já tinham")} passado da aprovação — o vínculo foi trocado sem reabrir a aprovação`);
  }
  if (r.aprovacoesMantidas > 0) partes.push(`${plural(r.aprovacoesMantidas, "aprovação", "aprovações")} de "${nomeDe}" fica${r.aprovacoesMantidas === 1 ? "" : "m"} no histórico`);
  if (r.rodadasFechadas > 0) partes.push(`${plural(r.rodadasFechadas, "rodada fechou", "rodadas fecharam")} (o novo já tinha aprovado)`);
  if (r.soTiradas > 0) partes.push(`${plural(r.soTiradas, "peça sem patrocinador por regra (molde ou produção interna) só perdeu", "peças sem patrocinador por regra (molde ou produção interna) só perderam")} o antigo`);
  if (r.cotaHerdada) partes.push(`a cota "${r.cotaHerdada}" passou para o novo`);
  return `Patrocinador "${nomeDe}" trocado por "${nomePara}" no evento — ${partes.join("; ")}`;
}
