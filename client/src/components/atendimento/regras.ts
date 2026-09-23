// ─────────────────────────────────────────────────────────────────────────────
// AS REGRAS PURAS DO ATENDIMENTO — nada aqui lê estado de React.
//
// A situação de uma peça, a jornada do histórico, os recortes que o servidor
// devolve e as constantes que a lista, o modal e o lote dividem. Ficam fora
// dos componentes para que a mesma regra não nasça duas vezes na tela.
// ─────────────────────────────────────────────────────────────────────────────
import type React from "react";
import {
  CheckCircle, XCircle, Plus, Pencil, Trash2, Truck, Cog, Send, Link2, Unlock, Upload, ImageIcon, ArrowRightLeft,
  type LucideIcon,
} from "lucide-react";
import { getStatusMeta, PRODUCTION_STATUSES } from "@/lib/status";
import { FONT, T, N, TOM } from "@/lib/theme";
import { ehMolde, etapaDoMolde, statusDeExibicao, ETAPAS_DO_MOLDE } from "@shared/molde";
import { STATUS_DA_ETAPA, statusDasEtapas, type EtapaDaPeca } from "@shared/fluxo-peca";
import type { Patrocinador, PecaAtendimento, SponsorApproval } from "./tipos";

// Reutilizado nos sorts de lista: um Collator criado uma vez é bem mais rápido
// que chamar localeCompare a cada comparação. Sem locale, como era antes.
export const COLLATOR = new Intl.Collator();

// VAZIO ESTÁVEL para o `data` das queries enquanto carregam (ou falham).
// `data: items = []` criava um array NOVO a cada render: awaitingItems →
// batchEligibleItems mudavam de identidade, o efeito que sincroniza a seleção
// do lote gravava um Set novo, e isso pedia outro render — um laço de render
// girando sem parar durante TODO o download de /api/items (15 MB em produção)
// e para sempre se a busca falhasse. Um vazio só, fora do componente, quebra o
// laço sem mudar o que a tela mostra.
export const SEM_DADOS: never[] = [];

// ── AS DUAS LISTAS DESTA TELA VÊM RECORTADAS NO SERVIDOR (perf, 2ª rodada) ──
//
// O Atendimento lia ["/api/items"] — o acervo inteiro, 5 mil peças e 15 MB em
// produção — e a aba Pendentes usa UM status: `awaiting_sponsor_approval`. As
// duas abas passam a pedir GET /api/items?status= (delta, formato compacto,
// chave dentro do prefixo "/api/items" para as invalidações continuarem
// alcançando), cada uma com o seu recorte:
//
//   · A FILA (sempre): a etapa "aguardando aprovação" — com a grafia canônica
//     `awaiting_approval` junto, que é o que a régua de shared/fluxo-peca
//     chama de mesma etapa e o banco também grava.
//   · O HISTÓRICO (sob demanda): as peças que JÁ passaram da aprovação. Ele
//     só é baixado quando a aba Histórico é aberta ou quando o book de
//     exportação é montado — os dois únicos lugares que leem peça pós-aprovação
//     (`casaHistorico`, `exportPool`). A aba Histórico não mostra contagem
//     nenhuma no seletor, então nada na tela fica errado enquanto ela não veio.
//
// Fora do recorte ficam Rascunho/Solicitada, Vinculação, "Aguardando envio"
// (a fila da Arte) e o que saiu do funil — nenhum deles é desenhado aqui.
const ATENDIMENTO_ETAPAS_DA_FILA = ["awaiting_approval"] as const;
const ATENDIMENTO_ETAPAS_DO_HISTORICO = [
  "awaiting_finalization", "awaiting_final_review", "ready_for_production", "approved",
  "inProduction", "produced", "conferred", "packed", "delivered",
] as const;
export const CHAVE_DA_FILA = ["/api/items", `?status=${statusDasEtapas(...ATENDIMENTO_ETAPAS_DA_FILA).join(",")}`] as const;
export const CHAVE_DO_HISTORICO = ["/api/items", `?status=${statusDasEtapas(...ATENDIMENTO_ETAPAS_DO_HISTORICO).join(",")}`] as const;

/**
 * Tecla de atalho desenhada como tecla — o mesmo desenho da Arte. Atalho
 * escrito no meio de uma frase passa por texto de rodapé e ninguém o aprende.
 */
export const KBD: React.CSSProperties = {
  display: 'inline-block', minWidth: 18, padding: '0 5px', margin: '0 1px',
  borderRadius: 4, border: `1px solid ${T.bdark}`, borderBottomWidth: 2,
  background: T.bg, color: T.strong,
  fontFamily: FONT.mono, fontSize: 10.5, fontWeight: 600,
  lineHeight: '16px', textAlign: 'center',
};

// ── Visual canônico do status de aprovação de UM patrocinador ──────────────
// Usado nos chips do histórico, no modal de detalhe, no modal de revisão e
// nos SponsorChips da lista. Antes eram 5 blocos de cores duplicados que já
// estavam divergindo (verde #166534 num ponto, #15803d noutro).
// `awaiting_arte` (o servidor grava este status na reprovação — nunca
// 'rejected') tem visual próprio vermelho/âmbar: houve reprovação E a Arte
// está refazendo. Tons de texto escuros (700) da lib de status, AA sobre tint.
export const approvalVisual = (status?: string | null) => {
  const isApproved     = status === 'approved';
  const isRejected     = status === 'rejected';
  const isNewVersion   = status === 'new_version_pending';
  const isAwaitingArte = status === 'awaiting_arte';
  return {
    isApproved, isRejected, isNewVersion, isAwaitingArte,
    chip: (isApproved ? 'approved' : (isRejected || isAwaitingArte) ? 'rejected' : 'pending') as 'approved' | 'rejected' | 'pending',
    label:  isApproved ? 'Aprovado' : isRejected ? 'Reprovado' : isAwaitingArte ? 'Reprovado · aguardando Arte' : isNewVersion ? 'Nova versão' : 'Aguardando',
    bg:     isApproved ? TOM.sucesso.bg : isRejected ? TOM.perigo.bg : isAwaitingArte ? TOM.alerta.bg : isNewVersion ? TOM.alerta.bg : N.n2,
    border: isApproved ? TOM.sucesso.border : isRejected ? TOM.perigo.border : isAwaitingArte ? TOM.alerta.border : isNewVersion ? TOM.alerta.border : T.border,
    text:   isApproved ? TOM.sucesso.text : isRejected ? TOM.perigo.text : isAwaitingArte ? TOM.perigo.text : isNewVersion ? TOM.alerta.text : T.apoio,
    dot:    isApproved ? TOM.sucesso.dot : isRejected ? TOM.perigo.dot : isAwaitingArte ? TOM.alerta.dot : isNewVersion ? TOM.alerta.dot : T.bdark,
  };
};

// ── SITUAÇÃO da peça: a leitura que o Atendimento faz antes de agir ────────
//
// Uma peça tem N patrocinadores, cada um com seu próprio estado. A pergunta
// que a tela responde é outra: "o que eu faço com ESTA peça agora?". Por isso
// a situação é UMA só por peça e as chaves são EXCLUSIVAS — assim a soma das
// contagens do filtro é o total da lista, e nenhuma peça conta duas vezes.
//
// A ordem é a da urgência de quem olha: 'nova versão' primeiro porque é a
// única em que a bola está com o ATENDIMENTO (a Arte já corrigiu e o arquivo
// está parado esperando ser reenviado ao patrocinador). Era exatamente esse
// caso que se escondia — o chip dizia "Aguardando", que se lê como "esperando
// o patrocinador", e o arquivo corrigido ficava semanas sem sair.
export const SITUACAO_ORDEM = ["nova_versao", "aguardando_arte", "reprovado", "aguardando", "aprovado"] as const;
export type SituacaoPeca = (typeof SITUACAO_ORDEM)[number];

export const SITUACAO_META: Record<SituacaoPeca, { label: string; hint: string }> = {
  // "reenviar" descrevia o gesto administrativo e escondia a DECISÃO. Quem lia
  // entendia que não havia nada a fazer — o dono disse isso com todas as
  // letras: "eu acho que o atendimento não precisa fazer nada, mas eles
  // precisam aprovar". O rótulo agora nomeia a ação que trava a peça.
  nova_versao:     { label: "Nova versão para aprovar", hint: "A Arte corrigiu — a peça está parada esperando a SUA decisão de aprovar ou reprovar" },
  aguardando_arte: { label: "Reprovado · Arte refazendo", hint: "Quem reprovou espera a nova arte; os demais patrocinadores seguem podendo ser aprovados" },
  reprovado:       { label: "Reprovado", hint: "Reprovado pelo patrocinador" },
  aguardando:      { label: "Aguardando patrocinador", hint: "Enviado, sem resposta do patrocinador até agora" },
  aprovado:        { label: "Aprovado", hint: "Todos os patrocinadores aprovaram" },
};

/** A situação da peça a partir das aprovações dela. Primeira que casar vence. */
export function situacaoDaPeca(aprovacoes: { status?: string | null }[] | undefined): SituacaoPeca {
  const st = (aprovacoes ?? []).map(a => a?.status);
  if (st.includes("new_version_pending")) return "nova_versao";
  if (st.includes("awaiting_arte")) return "aguardando_arte";
  if (st.includes("rejected")) return "reprovado";
  if (st.length > 0 && st.every(x => x === "approved")) return "aprovado";
  return "aguardando";
}

// ── Pipeline de fluxo do cartão de histórico (12 etapas) ───────────────────
// Const de módulo (antes era recriado a cada card). Conferido e Embalado têm
// etapa PRÓPRIA — a peça conferida, ainda no galpão, não é jornada concluída.
// As etapas agrupam ETAPAS CANÔNICAS da peça (shared/fluxo-peca), e rótulo e
// cor saem de getStatusMeta: nenhuma grafia legada nem cor própria mora aqui.
// "Aprovado" é marco de passagem (sponsor_approved é, na régua, Aguardando
// Finalização), por isso não prende peça nenhuma.
const etapaDoPipeline = (key: string, etapas: EtapaDaPeca[], label?: string, statusDaCor?: string) => {
  const m = getStatusMeta(statusDaCor ?? STATUS_DA_ETAPA[etapas[0]]?.[0] ?? "sponsor_approved");
  return { key, label: label ?? m.short, color: m.dot, statuses: statusDasEtapas(...etapas) };
};
export const PIPELINE_STAGES: { key: string; label: string; color: string; statuses: string[] }[] = [
  etapaDoPipeline("solicitado",   ["requested"], "Solicitado"),
  etapaDoPipeline("vinculacao",   ["awaiting_linking"], "Vinculação"),
  etapaDoPipeline("ag_aprovacao", ["awaiting_submission", "awaiting_approval"], "Ag. Aprovação", "awaiting_approval"),
  etapaDoPipeline("aprovado",     [], "Aprovado", "approved"),
  etapaDoPipeline("finalizacao",  ["awaiting_finalization"], "Finalização"),
  etapaDoPipeline("revisao",      ["awaiting_final_review"], "Revisão"),
  etapaDoPipeline("pronto",       ["ready_for_production", "approved"], "Pronto p/ Prod."),
  etapaDoPipeline("producao",     ["inProduction"]),
  etapaDoPipeline("produzido",    ["produced"]),
  etapaDoPipeline("conferido",    ["conferred"]),
  etapaDoPipeline("embalado",     ["packed"]),
  etapaDoPipeline("entregue",     ["delivered"]),
];

// ── A JORNADA DA PEÇA, EM UMA LEITURA SÓ ───────────────────────────────────
//
// O cartão do histórico contava a mesma história duas vezes: uma trilha de
// MARCOS (datas, em texto) e um pipeline de ETAPAS (posição, em bolinhas),
// empilhados, custando duas faixas por linha numa lista de dezenas de peças.
// São a mesma coisa: as etapas SÃO os marcos. Aqui elas viram uma faixa só,
// com posição, data e o tempo gasto em cada trecho.
//
// As datas não são inventadas: cada etapa lê o carimbo que o próprio fluxo
// grava. Onde não há carimbo (vinculação, revisão), a etapa aparece sem data
// em vez de receber uma estimativa.
export const DATA_DA_ETAPA: Record<string, (i: PecaAtendimento) => string | null | undefined> = {
  solicitado:   (i) => i.createdAt,
  ag_aprovacao: (i) => i.approvalThumbUpdatedAt,
  aprovado:     (i) => i.sponsorApprovedAt,
  finalizacao:  (i) => i.creatorReviewedAt,
  pronto:       (i) => i.approvedAt,
  producao:     (i) => i.productionStartedAt,
  produzido:    (i) => i.producedAt,
  conferido:    (i) => i.conferredAt,
  // Embalado não tem carimbo na peça: o que o tubo grava é o FECHAMENTO, que
  // chega na peça como `tuboFechadoEm` (enrich do servidor). Sem ele, sem data —
  // e tubo fechado ANTES da conferência desta peça (ela entrou depois) também
  // fica sem data: o carimbo não é dela e faria a trilha andar para trás.
  embalado:     (i) => (i.tuboFechadoEm && (!i.conferredAt || new Date(i.tuboFechadoEm).getTime() >= new Date(i.conferredAt).getTime()) ? i.tuboFechadoEm : null),
  entregue:     (i) => i.deliveredAt,
};

const DIA_MS = 86400000;

/** Uma etapa da faixa da jornada: posição, carimbo e o tempo desde a anterior. */
export interface EtapaDaJornada {
  key: string;
  label: string;
  ms: number | null;
  desdeAnterior: number | null;
  /** Só a CHAVE do status; a frase é montada no render. */
  statusDaEtapa: string;
  cumprida: boolean;
  pulada: boolean;
  ehAtual: boolean;
}

export interface JornadaDaPeca {
  etapas: EtapaDaJornada[];
  atual: number;
  concluida: boolean;
  duracao: number | null;
}

/** Tom do intervalo: uma semana é normal, duas já é o assunto da reunião. */
export function tomDoIntervalo(dias: number): string {
  return dias >= 14 ? TOM.perigo.text : dias >= 7 ? TOM.alerta.text : T.apoio;
}

/**
 * A JORNADA CURTA DO MOLDE (revisão 22/09): Arte → Revisão → Produzido. O
 * molde não passa por aprovação, finalização, conferência, embalagem nem
 * entrega — desenhar as dez etapas do fluxo comum mostrava sete buracos e
 * uma peça "parada" numa etapa que ela nunca visita. Datas: a criação (entra
 * na Arte), a liberação da Revisão e o produzido.
 */
const DATA_DA_ETAPA_DO_MOLDE: Array<(i: PecaAtendimento) => string | null | undefined> = [
  (i) => i.createdAt,
  (i) => i.creatorReviewedAt ?? i.approvedAt,
  (i) => i.producedAt,
];
function jornadaDoMolde(item: PecaAtendimento, agora: number): JornadaDaPeca {
  const etapa = etapaDoMolde(item.status);
  const concluida = etapa >= ETAPAS_DO_MOLDE.length;
  const atual = etapa < 0 ? -1 : Math.min(etapa, ETAPAS_DO_MOLDE.length - 1);
  let anterior: number | null = null;
  const etapas = ETAPAS_DO_MOLDE.map((st, i) => {
    const carimbo = DATA_DA_ETAPA_DO_MOLDE[i]?.(item);
    const ms = carimbo ? new Date(carimbo).getTime() : null;
    const desdeAnterior = ms !== null && anterior !== null ? Math.max(0, Math.round((ms - anterior) / DIA_MS)) : null;
    if (ms !== null && !Number.isNaN(ms)) anterior = ms;
    return {
      key: `molde-${st.idx}`, label: st.label, ms, desdeAnterior,
      statusDaEtapa: i === atual ? statusDeExibicao(item) : '',
      cumprida: atual >= 0 && (i < atual || concluida),
      pulada: false,
      ehAtual: i === atual && !concluida,
    };
  });
  const comData = etapas.filter(e => e.ms !== null && !Number.isNaN(e.ms));
  const primeira = comData[0]?.ms ?? null;
  const ultima = comData[comData.length - 1]?.ms ?? null;
  const duracao = concluida
    ? (primeira !== null && ultima !== null ? Math.round((ultima - primeira) / DIA_MS) : null)
    : (ultima !== null ? Math.max(0, Math.round((agora - ultima) / DIA_MS)) : null);
  return { etapas, atual, concluida, duracao };
}

export function jornadaDaPeca(item: PecaAtendimento, agora: number): JornadaDaPeca {
  if (ehMolde(item)) return jornadaDoMolde(item, agora);
  const atual = PIPELINE_STAGES.findIndex(s => s.statuses.includes(item.status));
  let anterior: number | null = null;
  const etapas = PIPELINE_STAGES.map((stage, i) => {
    const carimbo = DATA_DA_ETAPA[stage.key]?.(item);
    const ms = carimbo ? new Date(carimbo).getTime() : null;
    const desdeAnterior = ms !== null && anterior !== null
      ? Math.max(0, Math.round((ms - anterior) / DIA_MS))
      : null;
    if (ms !== null && !Number.isNaN(ms)) anterior = ms;
    // O status que dá o SIGNIFICADO da etapa no `title` da bolinha: o da
    // própria peça na etapa atual (é onde ela está de verdade); nas outras, o
    // canônico da etapa — "Entregue" agrupa conferida e entregue, e o que a
    // etapa promete é a entrega.
    const statusDaEtapa = i === atual ? item.status : stage.statuses[0];
    // Peça ENTREGUE SEM TUBO (peça grande vai direto): Embalado não é etapa
    // pendente nem cumprida — não se aplica. Marcar como cumprida mentiria.
    const pulada = stage.key === 'embalado' && atual > i && !item.tuboId;
    return {
      key: stage.key, label: stage.label, ms, desdeAnterior,
      // Só a CHAVE aqui; a frase é montada no render. Esta função também roda
      // dentro do comparador da ordenação por duração, a cada comparação.
      statusDaEtapa,
      cumprida: atual >= 0 && i < atual && !pulada,
      pulada,
      ehAtual: i === atual,
    };
  });
  const comData = etapas.filter(e => e.ms !== null && !Number.isNaN(e.ms));
  const primeira = comData[0]?.ms ?? null;
  const ultima = comData[comData.length - 1]?.ms ?? null;
  const concluida = atual >= PIPELINE_STAGES.length - 1;
  // Peça em curso: o número acionável é há quanto tempo ela está parada AQUI.
  // Peça concluída: o número que interessa é quanto a jornada inteira levou.
  const duracao = concluida
    ? (primeira !== null && ultima !== null ? Math.round((ultima - primeira) / DIA_MS) : null)
    : (ultima !== null ? Math.max(0, Math.round((agora - ultima) / DIA_MS)) : null);
  return { etapas, atual, concluida, duracao };
}

// ── Status pós-aprovação do patrocinador ───────────────────────────────────
// Peça em qualquer um destes status JÁ passou pela aprovação do patrocinador,
// mesmo sem registro individual de approval — o atalho "Aprovar Ativo" muda o
// status do item sem criar approvals, e os predicados do Histórico e do book
// (exportPool) exigiam `approvals.some(approved)`, sumindo com a peça.
const POST_APPROVAL_STATUSES: string[] = [
  'sponsor_approved',        // aprovado pelo patrocinador
  'awaiting_finalization',   // finalização da Arte
  'awaiting_creator_review', // revisão da Solicitação
  'awaiting_final_review',   // revisão final
  'ready_for_production',    // pronto para produção
  'pronto_para_producao',    // alias legado em pt
  'approved',                // liberado
  'liberado',                // alias legado em pt
  ...PRODUCTION_STATUSES,    // inProduction, produced, conferred, packed, delivered
];
export const isPastApproval = (item: PecaAtendimento): boolean => POST_APPROVAL_STATUSES.includes(item.status);

// ── Config das ações do log de auditoria (modal de revisão) ────────────────
// Const de módulo: antes era recriada a cada LINHA do histórico renderizada.
export const ACTION_CONFIG: Record<string, { label: string; bg: string; iconColor: string; icon: LucideIcon }> = {
  created:          { label: 'Criado',                bg: TOM.info.border, iconColor: TOM.info.text, icon: Plus },
  updated:          { label: 'Atualizado',            bg: TOM.laranja.bg, iconColor: T.accentText, icon: Pencil },
  deleted:          { label: 'Excluído',              bg: TOM.perigo.bg, iconColor: TOM.perigo.text, icon: Trash2 },
  approved:         { label: 'Aprovado',              bg: TOM.sucesso.bg, iconColor: TOM.sucesso.text, icon: CheckCircle },
  rejected:         { label: 'Reprovado',             bg: TOM.perigo.bg, iconColor: TOM.perigo.text, icon: XCircle },
  canceled:         { label: 'Cancelado',             bg: TOM.perigo.bg, iconColor: TOM.perigo.text, icon: XCircle },
  // Entregue na cor do resto do app (esmeralda de lib/status) — era roxo só aqui.
  delivered:        { label: 'Entregue',              bg: TOM.esmeralda.bg, iconColor: TOM.esmeralda.text, icon: Truck },
  produced:         { label: 'Impressão concluída',   bg: TOM.info.bg, iconColor: TOM.info.text, icon: Cog },
  submitted:        { label: 'Enviado',               bg: TOM.ciano.bg, iconColor: TOM.ciano.text, icon: Send },
  linked:           { label: 'Vinculado',             bg: TOM.turquesa.bg, iconColor: TOM.turquesa.text, icon: Link2 },
  released:         { label: 'Liberado',              bg: TOM.info.border, iconColor: TOM.info.text, icon: Unlock },
  status_changed:   { label: 'Status alterado',       bg: TOM.laranja.bg, iconColor: T.accentText, icon: ArrowRightLeft },
  sponsor_approved: { label: 'Patrocinador aprovado', bg: TOM.sucesso.bg, iconColor: TOM.sucesso.text, icon: CheckCircle },
  sponsor_rejected: { label: 'Patrocinador reprovou', bg: TOM.perigo.bg, iconColor: TOM.perigo.text, icon: XCircle },
  file_uploaded:    { label: 'Arquivo enviado',       bg: TOM.roxo.bg, iconColor: TOM.roxo.text, icon: Upload },
  thumb_uploaded:   { label: 'Thumb enviado',         bg: TOM.roxo.bg, iconColor: TOM.roxo.text, icon: ImageIcon },
};

// A ORDEM DA LISTA, DECLARADA E TROCÁVEL.
//
// A lista sempre foi agrupada por evento e, dentro do grupo, por tipo de
// peça — e a tela nunca disse isso. Sem a regra à vista, ninguém entende
// por que uma peça é a terceira, e não há como pedir outra ordem quando a
// pergunta muda ("o que vence primeiro?" / "o que espera por mim?").
//
// O agrupamento por evento NÃO muda: é ele que dá o cabeçalho com o prazo
// de Aprovação de Layout e o "N na sua mesa". O que a ordem decide é a
// sequência dos GRUPOS e das peças dentro de cada um.
export type OrdemPendentes = "prazo" | "mesa" | "evento";
export const ORDEM_REGRA: Record<OrdemPendentes, string> = {
  prazo: "vencidos primeiro, depois quem vence antes",
  mesa: "o que espera decisão sua no topo",
  evento: "ordem alfabética",
};

// A ordem do HISTÓRICO. Numa tela de auditoria a pergunta costuma ser
// "o que demorou", e não "o que é recente" — mas a única ordem possível
// era por data. "Mais demoradas" põe na frente o que a auditoria procura.
export type OrdemHistorico = "recentes" | "demoradas" | "evento";
export const ORDEM_HIST_REGRA: Record<OrdemHistorico, string> = {
  recentes: "última aprovação primeiro",
  demoradas: "maior tempo de jornada primeiro",
  evento: "ordem alfabética",
};

/** Mesma regua do servidor: 10 caracteres. "nao" nao diz a Arte o que mudar. */
export const MOTIVO_MIN = 10;
// A mesma barra invertida que faltava no servidor. Aqui ela não corrompia
// texto, só a CONTA: um motivo cheio de "s" era medido como mais curto do
// que é, e o botão de enviar ficava desabilitado sem explicar por quê.
export const motivoCurto = (t: string) => t.trim().replace(/\s+/g, " ").length < MOTIVO_MIN;

/** "falta X" · "faltam X e Y" · "faltam X, Y e mais N". */
export const fraseDeQuemFalta = (nomes: string[]): string => {
  if (nomes.length === 0) return "";
  if (nomes.length === 1) return `falta ${nomes[0]}`;
  if (nomes.length === 2) return `faltam ${nomes[0]} e ${nomes[1]}`;
  return `faltam ${nomes[0]}, ${nomes[1]} e mais ${nomes.length - 2}`;
};

/** Patrocinador com a decisão dele, como os SponsorChips desenham. */
export type PatrocinadorComStatus = Patrocinador & { approvalStatus: ReturnType<typeof approvalVisual>["chip"] };

/**
 * As leituras dos dois mapas do lote (patrocinadores e aprovações por peça)
 * que o card, o modal e as mutações fazem. Recriadas a cada render com os
 * mapas do render — como eram quando moravam soltas no componente.
 */
export function leiturasDoLote(
  itemSponsorsMap: Record<string, Patrocinador[]>,
  itemApprovalsMap: Record<string, SponsorApproval[]>,
) {
  // Patrocinadores da peça já com o status de aprovação de cada um, para os
  // chips mostrarem a cor da marca E a decisão (aprovado / reprovado / aguardando).
  const sponsorsWithStatus = (item: { id: string }): PatrocinadorComStatus[] => {
    const sps = itemSponsorsMap[item.id] || [];
    const apps: SponsorApproval[] = itemApprovalsMap[item.id] || [];
    return sps.map((s) => ({
      ...s,
      approvalStatus: approvalVisual(apps.find(a => a.sponsorId === s.id)?.status).chip,
    }));
  };

  // QUEM AINDA NÃO RESPONDEU, POR NOME.
  //
  // O card dizia "2 de 3 responderam" e não dizia QUEM falta — e saber o
  // nome é o que permite ir atrás da resposta. Para descobrir, era preciso
  // abrir o modal de revisão de cada peça, uma por uma.
  const quemFalta = (item: { id: string }): string[] => {
    const sps = itemSponsorsMap[item.id] || [];
    const apps: SponsorApproval[] = itemApprovalsMap[item.id] || [];
    return sps
      .filter((s) => {
        const st = apps.find(a => a.sponsorId === s.id)?.status;
        return !st || st === "pending" || st === "new_version_pending";
      })
      .map((s) => s.name)
      .filter(Boolean);
  };

  const isItemFullyApproved = (item: { id: string }): boolean => {
    const itemSps = itemSponsorsMap[item.id] || [];
    if (itemSps.length === 0) return false;
    const approvals: SponsorApproval[] = itemApprovalsMap[item.id] || [];
    return itemSps.every((s) => approvals.find(a => a.sponsorId === s.id)?.status === 'approved');
  };

  return { sponsorsWithStatus, quemFalta, isItemFullyApproved };
}

/**
 * Mesmo fallback de todas as miniaturas da tela: esconde a imagem quebrada e
 * mostra o aviso que mora logo ao lado (o irmão marcado com data-fallback).
 */
export function aoFalharMiniatura(e: React.SyntheticEvent<HTMLImageElement>) {
  (e.currentTarget as HTMLImageElement).style.display = 'none';
  const fb = (e.currentTarget as HTMLImageElement).nextElementSibling as HTMLElement | null;
  if (fb?.dataset.fallback) fb.style.display = 'flex';
}

// Quantos cards do histórico renderizar por vez. Cada card tem timeline e
// chips; com centenas de peças o navegador engasgava ao montar tudo de uma vez.
export const PAGE_SIZE = 25;
