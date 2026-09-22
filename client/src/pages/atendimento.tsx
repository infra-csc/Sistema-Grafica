import { useQuery, useMutation } from "@tanstack/react-query";
import { diasNaFase, tomDaIdade } from "@/lib/idade-na-fase";
import { DetalheProducao } from "@/components/detalhe-producao";
import { SeloKit } from "@/components/kit/selo-kit";
import { Button } from "@/components/ui/button";
import { TextoComLinks } from "@/components/texto-com-links";
import { SponsorChips } from "@/components/sponsor-chips";
import { FilterSelect } from "@/components/filter-select";
import { EventFilterDropdown } from "@/components/event-filter-dropdown";
import { ExportPdfDialog } from "@/components/export-pdf-dialog";
import { CheckCircle, AlertCircle, Eye, Search, X, XCircle, Clock, Loader2, ChevronDown, ChevronRight, Zap, FileText, Download, RotateCcw, Package, Paperclip, Plus, Pencil, Trash2, Truck, Cog, Send, Link2, Unlock, Upload, ImageIcon, ArrowRightLeft, Check, PlusCircle } from "lucide-react";
import { parseDateLocal, toUTCDisplayDate, normalizarBusca } from "@/lib/utils";
// Prazo desta tela = marco de APROVAÇÃO DE LAYOUT. Regra pura e única, testada
// em server/__tests__/atendimento-prazo.test.ts.
import {
  filtrarAtrasadosNaAprovacao,
  inicioDoDia,
  isEventoAtrasadoNaAprovacao,
  prazoAprovacaoLayout,
} from "@/lib/atendimento-prazo";
import { FilePreview } from "@/components/file-preview";
// Chip de filtro ativo: o MESMO componente da Gestão de Prazos. Dois chips
// com o mesmo papel e desenhos diferentes seriam duas gramáticas para a
// mesma ideia — e este arquivo já tem literal de cor demais.
import { FilterChip } from "@/components/prazos/filter-chip";
// Selo "Atualizado há X": o mesmo formatador da Gestão de Prazos, da Gráfica
// e das Análises, para as quatro telas datarem o dado com as mesmas palavras.
import { fmtRelative } from "@/components/prazos/tokens";
import {
  getStatusMeta, getStatusLabel, getStatusShort, PRODUCTION_STATUSES, descricaoDoStatus,
  isEventoFinalizado, motivoEventoFinalizado, marcoEventoFinalizado,
  todayBusinessMs,
} from "@/lib/status";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { FORMATO_COMPACTO, ehAprovacoesCompactas, expandirAprovacoes } from "@shared/itens-compactos";
import { useToast } from "@/hooks/use-toast";
import { usePecaDoLink, buscarCodigoDaPeca } from "@/hooks/use-peca-do-link";
// Exibição PEQUENA (quadradinhos de 38-52px) pede a miniatura do servidor e
// não o arquivo original de MBs. Zoom e download seguem na URL crua.
import { miniatura } from "@/lib/miniatura";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useCallback, useState, useMemo, Fragment, useEffect, useRef, useDeferredValue } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/contexts/auth-context";
import { Undo2, Play, Hourglass } from "lucide-react";
import { FS } from "@/lib/theme";
import { ehMolde, etapaDoMolde, statusDeExibicao, ETAPAS_DO_MOLDE } from "@shared/molde";
import { STATUS_DA_ETAPA, statusDasEtapas, type EtapaDaPeca } from "@shared/fluxo-peca";
import { EsqueletoDeFila } from "@/components/esqueleto-de-fila";
import { SoQuandoMudar } from "@/components/arte/so-quando-mudar";
import { ModalHeader, ModalFooter, modalSurface, HIDE_NATIVE_CLOSE } from "@/components/modal-shell";
import { hrefSeguro } from "@shared/url-segura";

interface SponsorApproval {
  id: string;
  itemId: string;
  sponsorId: string;
  status: 'pending' | 'approved' | 'rejected' | 'awaiting_arte' | 'new_version_pending';
  approvedBy?: string | null;
  approvedAt?: Date | null;
  rejectedBy?: string | null;
  rejectedAt?: Date | null;
  rejectionReason?: string | null;
  sponsor?: {
    id: string;
    name: string;
  } | null;
}

// Reutilizado nos sorts de lista: um Collator criado uma vez é bem mais rápido
// que chamar localeCompare a cada comparação. Sem locale, como era antes.
const COLLATOR = new Intl.Collator();

// VAZIO ESTÁVEL para o `data` das queries enquanto carregam (ou falham).
// `data: items = []` criava um array NOVO a cada render: awaitingItems →
// batchEligibleItems mudavam de identidade, o efeito que sincroniza a seleção
// do lote gravava um Set novo, e isso pedia outro render — um laço de render
// girando sem parar durante TODO o download de /api/items (15 MB em produção)
// e para sempre se a busca falhasse. Um vazio só, fora do componente, quebra o
// laço sem mudar o que a tela mostra.
const SEM_DADOS: any[] = [];

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
const CHAVE_DA_FILA = ["/api/items", `?status=${statusDasEtapas(...ATENDIMENTO_ETAPAS_DA_FILA).join(",")}`] as const;
const CHAVE_DO_HISTORICO = ["/api/items", `?status=${statusDasEtapas(...ATENDIMENTO_ETAPAS_DO_HISTORICO).join(",")}`] as const;

/**
 * Tecla de atalho desenhada como tecla — o mesmo desenho da Arte. Atalho
 * escrito no meio de uma frase passa por texto de rodapé e ninguém o aprende.
 */
const KBD: React.CSSProperties = {
  display: 'inline-block', minWidth: 18, padding: '0 5px', margin: '0 1px',
  borderRadius: 4, border: '1px solid #d6d3d1', borderBottomWidth: 2,
  background: '#fafaf9', color: '#44403c',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 10.5, fontWeight: 600,
  lineHeight: '16px', textAlign: 'center',
};

// ── Visual canônico do status de aprovação de UM patrocinador ──────────────
// Usado nos chips do histórico, no modal de detalhe, no modal de revisão e
// nos SponsorChips da lista. Antes eram 5 blocos de cores duplicados que já
// estavam divergindo (verde #166534 num ponto, #15803d noutro).
// `awaiting_arte` (o servidor grava este status na reprovação — nunca
// 'rejected') tem visual próprio vermelho/âmbar: houve reprovação E a Arte
// está refazendo. Tons de texto escuros (700) da lib de status, AA sobre tint.
const approvalVisual = (status?: string | null) => {
  const isApproved     = status === 'approved';
  const isRejected     = status === 'rejected';
  const isNewVersion   = status === 'new_version_pending';
  const isAwaitingArte = status === 'awaiting_arte';
  return {
    isApproved, isRejected, isNewVersion, isAwaitingArte,
    chip: (isApproved ? 'approved' : (isRejected || isAwaitingArte) ? 'rejected' : 'pending') as 'approved' | 'rejected' | 'pending',
    label:  isApproved ? 'Aprovado' : isRejected ? 'Reprovado' : isAwaitingArte ? 'Reprovado · aguardando Arte' : isNewVersion ? 'Nova versão' : 'Aguardando',
    bg:     isApproved ? '#f0fdf4' : isRejected ? '#fef2f2' : isAwaitingArte ? '#fffbeb' : isNewVersion ? '#fffbeb' : '#f5f5f4',
    border: isApproved ? '#bbf7d0' : isRejected ? '#fecaca' : isAwaitingArte ? '#fde68a' : isNewVersion ? '#fde68a' : '#e7e5e4',
    text:   isApproved ? '#15803d' : isRejected ? '#b91c1c' : isAwaitingArte ? '#b91c1c' : isNewVersion ? '#92400e' : '#57534e',
    dot:    isApproved ? '#22c55e' : isRejected ? '#ef4444' : isAwaitingArte ? '#f59e0b' : isNewVersion ? '#f59e0b' : '#d1d5db',
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
const SITUACAO_ORDEM = ["nova_versao", "aguardando_arte", "reprovado", "aguardando", "aprovado"] as const;
type SituacaoPeca = (typeof SITUACAO_ORDEM)[number];

const SITUACAO_META: Record<SituacaoPeca, { label: string; hint: string }> = {
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
function situacaoDaPeca(aprovacoes: { status?: string | null }[] | undefined): SituacaoPeca {
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
const PIPELINE_STAGES: { key: string; label: string; color: string; statuses: string[] }[] = [
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
const DATA_DA_ETAPA: Record<string, (i: any) => string | null | undefined> = {
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

/** Tom do intervalo: uma semana é normal, duas já é o assunto da reunião. */
function tomDoIntervalo(dias: number): string {
  return dias >= 14 ? '#b91c1c' : dias >= 7 ? '#b45309' : '#57534e';
}

/**
 * A JORNADA CURTA DO MOLDE (revisão 22/09): Arte → Revisão → Produzido. O
 * molde não passa por aprovação, finalização, conferência, embalagem nem
 * entrega — desenhar as dez etapas do fluxo comum mostrava sete buracos e
 * uma peça "parada" numa etapa que ela nunca visita. Datas: a criação (entra
 * na Arte), a liberação da Revisão e o produzido.
 */
const DATA_DA_ETAPA_DO_MOLDE: Array<(i: any) => string | null | undefined> = [
  (i) => i.createdAt,
  (i) => i.creatorReviewedAt ?? i.approvedAt,
  (i) => i.producedAt,
];
function jornadaDoMolde(item: any, agora: number) {
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

function jornadaDaPeca(item: any, agora: number) {
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
const isPastApproval = (item: any): boolean => POST_APPROVAL_STATUSES.includes(item.status);

// ── Config das ações do log de auditoria (modal de revisão) ────────────────
// Const de módulo: antes era recriada a cada LINHA do histórico renderizada.
const ACTION_CONFIG: Record<string, { label: string; bg: string; iconColor: string; icon: any }> = {
  created:          { label: 'Criado',                bg: '#dbeafe', iconColor: '#1d4ed8', icon: Plus },
  updated:          { label: 'Atualizado',            bg: '#ffedd5', iconColor: '#c2410c', icon: Pencil },
  deleted:          { label: 'Excluído',              bg: '#fee2e2', iconColor: '#dc2626', icon: Trash2 },
  approved:         { label: 'Aprovado',              bg: '#dcfce7', iconColor: '#15803d', icon: CheckCircle },
  rejected:         { label: 'Reprovado',             bg: '#fee2e2', iconColor: '#dc2626', icon: XCircle },
  canceled:         { label: 'Cancelado',             bg: '#fee2e2', iconColor: '#dc2626', icon: XCircle },
  // Entregue na cor do resto do app (esmeralda de lib/status) — era roxo só aqui.
  delivered:        { label: 'Entregue',              bg: '#ecfdf5', iconColor: '#047857', icon: Truck },
  produced:         { label: 'Impressão concluída',   bg: '#e0e7ff', iconColor: '#4338ca', icon: Cog },
  submitted:        { label: 'Enviado',               bg: '#cffafe', iconColor: '#0e7490', icon: Send },
  linked:           { label: 'Vinculado',             bg: '#ccfbf1', iconColor: '#0f766e', icon: Link2 },
  released:         { label: 'Liberado',              bg: '#dbeafe', iconColor: '#1d4ed8', icon: Unlock },
  status_changed:   { label: 'Status alterado',       bg: '#ffedd5', iconColor: '#c2410c', icon: ArrowRightLeft },
  sponsor_approved: { label: 'Patrocinador aprovado', bg: '#dcfce7', iconColor: '#15803d', icon: CheckCircle },
  sponsor_rejected: { label: 'Patrocinador reprovou', bg: '#fee2e2', iconColor: '#dc2626', icon: XCircle },
  file_uploaded:    { label: 'Arquivo enviado',       bg: '#f3e8ff', iconColor: '#7e22ce', icon: Upload },
  thumb_uploaded:   { label: 'Thumb enviado',         bg: '#f3e8ff', iconColor: '#7e22ce', icon: ImageIcon },
};

export default function Atendimento() {
  const { toast } = useToast();
  const { user } = useAuth();
  // Gate de papel: o servidor só aceita decisões de "atendimento" e "admin"
  // (403 para os demais). A UI espelha o gate em vez de deixar o clique
  // estourar erro — os outros papéis veem a tela em modo somente leitura.
  const canDecide = user?.role === "atendimento" || user?.role === "admin";
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  // TRAVA DE ~600 ms DEPOIS DO AVANÇO AUTOMÁTICO. Decidir uma peça abre a
  // próxima no MESMO modal, com os botões no mesmo lugar: um duplo clique em
  // "Aprovar para todos" (que não tem confirmação) aprovava também a peça
  // seguinte, que a pessoa nem tinha visto. Por um instante as decisões ficam
  // desabilitadas — visível, não um clique engolido em silêncio — enquanto o
  // cabeçalho e o toast mostram a troca de peça. A navegação manual (setas,
  // "Próxima peça") não trava: ali a pessoa escolheu trocar.
  const TRAVA_POS_AVANCO_MS = 600;
  const avancouEmRef = useRef(0);
  const [pecaRecemAberta, setPecaRecemAberta] = useState(false);
  const seguirParaPeca = (next: any) => {
    avancouEmRef.current = Date.now();
    setPecaRecemAberta(true);
    setSelectedItem(next);
  };
  useEffect(() => {
    if (!pecaRecemAberta) return;
    const t = setTimeout(() => setPecaRecemAberta(false), TRAVA_POS_AVANCO_MS);
    return () => clearTimeout(t);
  }, [pecaRecemAberta, selectedItem?.id]);
  // Checagem no próprio clique também: não depende do render já ter aplicado
  // o `disabled`.
  const decisaoTravada = () => Date.now() - avancouEmRef.current < TRAVA_POS_AVANCO_MS;

  // Aba ativa: pendentes ou histórico
  // (Os pedidos de peça saíram daqui para a página própria, /pedidos-de-peca.)
  const [activeTab, setActiveTab] = useState<"pending" | "history">("pending");

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
  type OrdemPendentes = "prazo" | "mesa" | "evento";
  const ORDEM_REGRA: Record<OrdemPendentes, string> = {
    prazo: "vencidos primeiro, depois quem vence antes",
    mesa: "o que espera decisão sua no topo",
    evento: "ordem alfabética",
  };

  // Filtros — aba Pendentes
  const [ordemPendentes, setOrdemPendentes] = useState<OrdemPendentes>(() => {
    const o = new URLSearchParams(window.location.search).get("ordem");
    return o === "mesa" || o === "evento" ? o : "prazo";
  });

  // A ordem do HISTÓRICO. Numa tela de auditoria a pergunta costuma ser
  // "o que demorou", e não "o que é recente" — mas a única ordem possível
  // era por data. "Mais demoradas" põe na frente o que a auditoria procura.
  type OrdemHistorico = "recentes" | "demoradas" | "evento";
  const ORDEM_HIST_REGRA: Record<OrdemHistorico, string> = {
    recentes: "última aprovação primeiro",
    demoradas: "maior tempo de jornada primeiro",
    evento: "ordem alfabética",
  };
  const [ordemHistorico, setOrdemHistorico] = useState<OrdemHistorico>("recentes");
  const [searchTerm, setSearchTerm] = useState("");
  // Adia o termo usado na filtragem (input segue responsivo, tabela não engasga).
  const deferredSearchTerm = useDeferredValue(searchTerm);
  // Persiste o filtro de evento ao abrir uma peça e voltar.
  const [eventFilter, setEventFilter] = useState<string[]>(() => { try { return JSON.parse(sessionStorage.getItem("atendimento:eventFilter") || "[]"); } catch { return []; } });
  useEffect(() => { sessionStorage.setItem("atendimento:eventFilter", JSON.stringify(eventFilter)); }, [eventFilter]);
  const [itemTypeFilter, setItemTypeFilter] = useState<string[]>([]);
  const [situacaoFilter, setSituacaoFilter] = useState<string[]>([]);
  // ?patrocinador=<id> — deep-link da Gestão de Prazos ("Cobrar no
  // Atendimento"): a tela abre já filtrada no patrocinador da cobrança.
  const [sponsorFilter, setSponsorFilter] = useState<string[]>(() => {
    const sp = new URLSearchParams(window.location.search).get("patrocinador");
    return sp ? [sp] : [];
  });
  // ?atrasados=1 — recorte "só o que passou do marco de Aprovação de Layout".
  const [atrasadosFilter, setAtrasadosFilter] = useState<boolean>(
    () => new URLSearchParams(window.location.search).get("atrasados") === "1",
  );

  // Âncora de "hoje" ESTÁVEL. O selo de prazo do cabeçalho de evento fazia
  // `new Date()` DENTRO do render de cada grupo: a mesma tela podia responder
  // dias diferentes na virada da meia-noite, e nenhuma memoização segurava um
  // valor que nascia novo a cada passada. Mesmo padrão de `agora` na Gráfica.
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), 600_000);
    return () => clearInterval(id);
  }, []);
  const hoje = useMemo(() => inicioDoDia(new Date(agora)), [agora]);

  // Filtros — aba Histórico
  const [histEventFilter, setHistEventFilter] = useState<string[]>([]);
  const [histSponsorFilter, setHistSponsorFilter] = useState<string[]>([]);
  const [histPeriodFilter, setHistPeriodFilter] = useState<string>("all");
  const [histSearchTerm, setHistSearchTerm] = useState<string>("");
  // A BUSCA DO HISTÓRICO COM ATRASO (perf, 2ª rodada). Ela é a única da tela
  // que ainda escrevia direto no filtro: cada tecla refazia `casaHistorico`
  // sobre a lista inteira, RECALCULAVA a jornada de cada peça (12 etapas) e
  // ORDENAVA o resultado — e as duas facetas do cabeçalho faziam a mesma
  // varredura de novo. O campo continua respondendo na hora (o `value` é o
  // estado); quem espera é a lista, como na fila de Pendentes
  // (`deferredSearchTerm`) e na Arte.
  const histBuscaDeferida = useDeferredValue(histSearchTerm);

  // Modal detalhe de aprovações (Histórico)
  const [histDetailItem, setHistDetailItem] = useState<any>(null);

  // Quantos cards renderizar por vez. Cada card tem timeline e chips; com
  // centenas de peças o navegador engasgava ao montar tudo de uma vez.
  const PAGE_SIZE = 25;
  const [histVisible, setHistVisible] = useState(PAGE_SIZE);

  // Peça em preview no lote (clique na arte abre grande, sem mexer na seleção).
  const [batchPreviewItem, setBatchPreviewItem] = useState<any>(null);

  /**
   * Eventos ABERTOS na aba Pendentes (o cabeçalho vira um card clicável).
   *
   * COMEÇA TUDO FECHADO (decisão do dono, 24/08). São duas coisas diferentes,
   * e vale não confundi-las de novo: a LISTA vem completa — todos os eventos,
   * sem "carregar mais" — e cada GRUPO vem recolhido. O cabeçalho fechado já
   * carrega o que decide (nome, mês, prazo de Aprovação de Layout e quantas
   * peças), e quem quiser as peças abre o evento que interessa.
   *
   * O conjunto guarda quem está ABERTO, não quem está fechado: com o padrão
   * invertido não existe valor inicial que signifique "tudo fechado" — a lista
   * de eventos não é conhecida aqui e muda a cada filtro, e um evento novo
   * entraria aberto por omissão.
   */
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  const toggleEventCollapsed = (id: string) =>
    setExpandedEvents(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  const eventoAberto = (id: string) => expandedEvents.has(id);

  // Modal Exportar PDF
  const [showExportPDFModal, setShowExportPDFModal] = useState(false);

  // Lote por Patrocinador + Evento
  const [batchSponsorId, setBatchSponsorId]           = useState<string>("");
  const [batchEventId, setBatchEventId]               = useState<string>("");
  const [batchRejectReason, setBatchRejectReason]     = useState<string>("");
  const [batchShowRejectForm, setBatchShowRejectForm] = useState<boolean>(false);

  const [batchSelectedItemIds, setBatchSelectedItemIds] = useState<Set<string>>(new Set());
  // Painel de lote recolhido por padrão: quem entra para revisar peça a peça
  // não precisa do painel ocupando meia tela. A escolha persiste na sessão.
  const [batchPanelOpen, setBatchPanelOpen] = useState<boolean>(() => {
    try { return sessionStorage.getItem("atendimento:batchPanelOpen") === "1"; } catch { return false; }
  });
  useEffect(() => {
    try { sessionStorage.setItem("atendimento:batchPanelOpen", batchPanelOpen ? "1" : "0"); } catch {}
  }, [batchPanelOpen]);

  // Map para rastrear patrocinadores de cada item
  const [itemSponsorsMap, setItemSponsorsMap] = useState<Record<string, any[]>>({});
  const [loadingSponsors, setLoadingSponsors] = useState(false);

  // Map para rastrear aprovações de cada item (para mostrar na tabela)
  const [itemApprovalsMap, setItemApprovalsMap] = useState<Record<string, SponsorApproval[]>>({});

  // Request ID para evitar race conditions
  const requestIdRef = useRef(0);
  // O conjunto (tamanho do acervo + marca de cada peça em aprovação) que
  // motivou o último download do lote, e as peças que ESTA tela decidiu e
  // remendou desde então — ver o efeito de carga do lote.
  const loteBaixadoRef = useRef<{ tamanho: number; marcas: Map<string, string> } | null>(null);
  const decididasAquiRef = useRef<Set<string>>(new Set());

  // State para aprovações individuais de patrocinadores (no diálogo)
  const [sponsorApprovals, setSponsorApprovals] = useState<SponsorApproval[]>([]);
  const [loadingSponsorApprovals, setLoadingSponsorApprovals] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  /** Mesma regua do servidor: 10 caracteres. "nao" nao diz a Arte o que mudar. */
  const MOTIVO_MIN = 10;
  // A mesma barra invertida que faltava no servidor. Aqui ela não corrompia
  // texto, só a CONTA: um motivo cheio de "s" era medido como mais curto do
  // que é, e o botão de enviar ficava desabilitado sem explicar por quê.
  const motivoCurto = (t: string) => t.trim().replace(/\s+/g, " ").length < MOTIVO_MIN;
  const [rejectingSponsorId, setRejectingSponsorId] = useState<string | null>(null);

  /**
   * ADICIONAR PATROCINADOR PELO MODAL — SÓ ADMIN (pedido do dono, 25/08,
   * caso #2801: a arte tinha a Crystal e não havia linha para aprovar,
   * porque a marca não estava vinculada à peça).
   */
  const [addPatrocinadorAberto, setAddPatrocinadorAberto] = useState(false);
  const [addingPatrocinadorId, setAddingPatrocinadorId] = useState<string | null>(null);
  const [buscaPatrocinador, setBuscaPatrocinador] = useState("");
  // /api/events/:id/sponsors devolve VÍNCULOS ({ sponsorId, quota }) — os
  // nomes vêm do catálogo que esta tela já carrega em /api/sponsors.
  const { data: vinculosDoEvento = SEM_DADOS } = useQuery<any[]>({
    queryKey: ["/api/events", selectedItem?.eventId, "sponsors"],
    enabled: !!selectedItem?.eventId && dialogOpen && user?.role === "admin",
  });
  const adicionarPatrocinador = async (sp: any) => {
    if (!selectedItem || addingPatrocinadorId) return;
    setAddingPatrocinadorId(sp.id);
    try {
      // Patrocinador de FORA do evento (caso Crystal, 25/08): primeiro entra
      // no evento — senão a peça carregaria uma marca que nenhuma outra tela
      // do evento conhece — e depois na peça. Vínculo de evento repetido não
      // derruba o fluxo: o objetivo é o estado final, não a primeira escrita.
      const jaNoEvento = (vinculosDoEvento as any[]).some((v: any) => v.sponsorId === sp.id);
      if (!jaNoEvento) {
        try {
          await apiRequest("POST", `/api/events/${selectedItem.eventId}/sponsors`, { sponsorId: sp.id });
        } catch {
          // provável duplicata (corrida com outra aba) — o vínculo de PEÇA
          // logo abaixo é quem decide se a operação falhou de verdade.
        }
        queryClient.invalidateQueries({ queryKey: ["/api/events", selectedItem.eventId, "sponsors"] });
      }
      await apiRequest("POST", `/api/items/${selectedItem.id}/sponsors`, { sponsorId: sp.id });
      // O servidor criou a linha pendente junto; o estado local reflete na
      // hora — a linha nova aparece "Aguardando decisão" sem refetch.
      setItemSponsorsMap(prev => ({
        ...prev,
        [selectedItem.id]: [...(prev[selectedItem.id] ?? []), sp],
      }));
      setSponsorApprovals(prev => [...prev, { itemId: selectedItem.id, sponsorId: sp.id, status: "pending" } as any]);
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      toast({ title: "Patrocinador adicionado", description: `"${sp.name}" entrou na rodada como Aguardando decisão.` });
    } catch (e: any) {
      toast({ title: "Não foi possível adicionar", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setAddingPatrocinadorId(null);
    }
  };

  // Confirmação de aprovação
  const [confirmApproveIndividual, setConfirmApproveIndividual] = useState<{ itemId: string; sponsorId: string; sponsorName: string } | null>(null);
  // Desvincular patrocinador da peça (pedido do dono, 25/08) — admin, com confirmação.
  const [desvincularAlvo, setDesvincularAlvo] = useState<{ itemId: string; sponsorId: string; sponsorName: string } | null>(null);
  const [confirmApproveBatch, setConfirmApproveBatch] = useState(false);

  const isMobile = useIsMobile();
  // Filtros recolhidos no celular (mesma cura da Arte): quatro menus e o
  // "Atrasados" em 44px cada somavam três linhas de controles entre o placar e
  // a primeira peça. A busca fica sempre à vista; o recorte ativo continua
  // escrito nos chips logo abaixo.
  const [filtrosAbertosMobile, setFiltrosAbertosMobile] = useState(false);
  const { data: pecasDaFila = SEM_DADOS, isLoading: itemsLoading, isError: itemsError, refetch: refetchItems,
    dataUpdatedAt, isFetching: isFetchingItems } = useQuery<any[]>({
    queryKey: CHAVE_DA_FILA,
  });

  // O histórico só desce quando alguém vai olhar para ele: a aba aberta ou o
  // book de exportação montado (o book precisa das já aprovadas, senão sai
  // incompleto — ver `exportPool`). Uma vez baixado, fica no cache do React
  // Query como qualquer outra lista, e revalida por delta.
  const precisaDoHistorico = activeTab === "history" || showExportPDFModal;
  const { data: pecasDoHistorico = SEM_DADOS } = useQuery<any[]>({
    queryKey: CHAVE_DO_HISTORICO,
    enabled: precisaDoHistorico,
  });

  // As duas listas como UMA, que é o que o resto da tela sempre viu.
  //
  // DEDUPLICA POR ID mesmo os recortes sendo disjuntos por construção (eles não
  // compartilham status nenhum). Uma peça em dobro aqui não daria erro: daria
  // placar dobrado e a mesma peça duas vezes na fila — o tipo de defeito que só
  // se descobre olhando. O custo é uma passada por Map, e só quando as duas
  // listas existem; enquanto o histórico não é pedido, é a própria fila.
  const items = useMemo(() => {
    if (pecasDoHistorico.length === 0) return pecasDaFila;
    if (pecasDaFila.length === 0) return pecasDoHistorico;
    const porId = new Map<string, any>();
    for (const p of pecasDaFila) porId.set(p.id, p);
    for (const p of pecasDoHistorico) if (!porId.has(p.id)) porId.set(p.id, p);
    return Array.from(porId.values());
  }, [pecasDaFila, pecasDoHistorico]);

  const { data: events = SEM_DADOS, isLoading: eventsLoading } = useQuery<any[]>({
    queryKey: ["/api/events"],
  });

  const { data: sponsors = SEM_DADOS } = useQuery<any[]>({
    queryKey: ["/api/sponsors"],
  });
  const sponsorsDoEvento = useMemo(() => {
    const porId = new Map((sponsors as any[]).map((s: any) => [s.id, s]));
    return (vinculosDoEvento as any[])
      .map((v: any) => porId.get(v.sponsorId))
      .filter(Boolean);
  }, [vinculosDoEvento, sponsors]);

  // Histórico DA PEÇA em revisão, com escopo no servidor. A listagem global
  // tem teto de 500 registros — peça antiga caía fora da janela e o modal
  // mostrava "sem histórico" (bug reportado pelo dono).
  const { data: auditLogs = [] } = useQuery<any[]>({
    queryKey: ["/api/audit-logs", "item", selectedItem?.id],
    queryFn: () =>
      fetch(`/api/audit-logs?entityType=item&entityId=${selectedItem!.id}`, { credentials: "include" })
        .then(r => r.ok ? r.json() : Promise.reject(new Error(`Falha ao carregar o histórico (HTTP ${r.status})`))),
    select: d => (Array.isArray(d) ? d : []),
    enabled: dialogOpen && !!selectedItem?.id,
    placeholderData: [],
  });
  const { data: standardItems = SEM_DADOS } = useQuery<any[]>({ queryKey: ['/api/standard-items'] });
  const typeToGroup = useMemo(() => {
    const map: Record<string, string> = {};
    (standardItems as any[]).forEach((s: any) => { if (s.group) map[s.name] = s.group; });
    return map;
  }, [standardItems]);

  // Memoizar awaiting items para evitar fetches desnecessários.
  //
  // Evento FINALIZADO sai da fila — duas origens, um gate só
  // (`motivoEventoFinalizado`, @shared/prazo-dates):
  //   · "encerrado" → um admin encerrou o evento; é a promessa feita em voz
  //     alta na confirmação ("sai da Gestão de Prazos e das filas de trabalho").
  //   · "realizado" → a DATA DO EVENTO (events.startDate, não a saída do
  //     caminhão) já passou. Regra do dono: cobrar aprovação de patrocinador
  //     para um evento que já aconteceu não faz sentido. Durante o DIA do
  //     evento a peça ainda conta; sai depois da virada do dia em São Paulo.
  //     Evento SEM data de início nunca sai por esta regra.
  //
  // O filtro é do CLIENTE, não de /api/items — o Detalhe do Evento e o Painel
  // Geral leem a mesma chave e a lista de peças precisa continuar aparecendo lá
  // (são telas de registro; esta é tela de ação). `item.event` vem cru do
  // storage (nunca passa por enrichEvent): traz `status` e `startDate`, que são
  // exatamente as duas colunas que o predicado lê.
  const hojeBusinessMs = todayBusinessMs();
  const awaitingItems = useMemo(() =>
    items.filter(item =>
      item.status === 'awaiting_sponsor_approval' && !item.skipApproval
      && !isEventoFinalizado(item.event, hojeBusinessMs)
    ), [items, hojeBusinessMs]
  );


  // Chave estável do conjunto de peças em aprovação: o efeito abaixo só refaz
  // o batch quando uma peça ENTRA ou SAI do fluxo, quando o total de itens
  // muda (p.ex. no primeiro carregamento) OU quando uma peça em aprovação é
  // atualizada (fingerprint com approvalThumbUrl + updatedAt — o servidor
  // grava updatedAt em todo updateItem). Sem o fingerprint, a nova versão da
  // Arte (resubmit muda o thumb sem tirar a peça de awaiting_sponsor_approval)
  // não refazia o batch e a peça sumia da contagem até um F5.
  const awaitingKey = useMemo(
    () => `${items.length}:${awaitingItems
      .map(i => `${i.id}:${i.approvalThumbUrl ?? ''}:${i.updatedAt ?? ''}`)
      .sort()
      .join('|')}`,
    [items.length, awaitingItems]
  );

  // Carregar patrocinadores e aprovações — uma única chamada batch.
  // Carrega sempre (não só quando há itens pendentes) para alimentar também
  // a aba Histórico, que mostra itens já aprovados em qualquer status.
  useEffect(() => {
    // AS MUDANÇAS QUE ESTA TELA MESMA FEZ NÃO RE-BAIXAM O LOTE (5,8 MB em
    // produção). Aprovar a última marca de uma peça aqui já remenda a peça
    // (applyItemDecisionToCache) e a aprovação (applyApprovalToCache) com a
    // resposta do servidor; mesmo assim, a peça saindo de "aguardando" mudava
    // a chave e o lote INTEIRO voltava — um download e um parse de megabytes
    // por peça aprovada, no meio do "aprovar e seguir para a próxima". Pula só
    // quando TODA a diferença é de peças marcadas em decididasAquiRef (ver
    // individualApproveMutation) e sem troca de thumb; peça que entra, some
    // por outra mão, é reprovada ou ganha arte nova segue buscando o lote.
    const marcas = new Map<string, string>(
      awaitingItems.map(i => [i.id, `${i.approvalThumbUrl ?? ''}:${i.updatedAt ?? ''}`]),
    );
    const anterior = loteBaixadoRef.current;
    const decididas = decididasAquiRef.current;
    if (anterior && items.length > 0 && anterior.tamanho === items.length) {
      const thumbDe = (m: string | undefined) => (m ?? '').slice(0, (m ?? '').lastIndexOf(':'));
      let soDecisoesDaqui = true;
      const tocadas: string[] = [];
      marcas.forEach((m, id) => {
        const antes = anterior.marcas.get(id);
        if (antes === m) return;
        if (antes !== undefined && decididas.has(id) && thumbDe(antes) === thumbDe(m)) { tocadas.push(id); return; }
        soDecisoesDaqui = false;
      });
      anterior.marcas.forEach((_m, id) => {
        if (marcas.has(id)) return;
        if (decididas.has(id)) tocadas.push(id); else soDecisoesDaqui = false;
      });
      if (soDecisoesDaqui) {
        loteBaixadoRef.current = { tamanho: items.length, marcas };
        tocadas.forEach(id => decididas.delete(id));
        return;
      }
    }
    loteBaixadoRef.current = { tamanho: items.length, marcas };
    decididas.clear();

    requestIdRef.current += 1;
    const currentRequestId = requestIdRef.current;

    if (items.length === 0) {
      loteBaixadoRef.current = null;
      setItemSponsorsMap({});
      setItemApprovalsMap({});
      setLoadingSponsors(false);
      return;
    }

    setLoadingSponsors(true);

    // FORMATO COMPACTO (perf, 17/09): o lote tinha 5,8 MB em produção porque o
    // patrocinador ia inteiro em cada vínculo e de novo em cada aprovação. Com
    // `?formato=compacto` ele vai uma vez (shared/itens-compactos.ts) e
    // `expandirAprovacoes` devolve os MESMOS dois mapas de sempre — nada abaixo
    // muda. Resposta que não é compacta (servidor antigo no meio do deploy)
    // passa intacta.
    apiRequest("GET", `/api/items/batch-approval-data?formato=${FORMATO_COMPACTO}`)
      .then(res => res.json())
      .then((corpo: any) => (ehAprovacoesCompactas(corpo) ? expandirAprovacoes(corpo) : corpo))
      .then(({ sponsorsByItem = {}, approvalsByItem = {} } = {}) => {
        if (currentRequestId !== requestIdRef.current) return;
        setItemSponsorsMap(sponsorsByItem);
        setItemApprovalsMap(approvalsByItem);
        setLoadingSponsors(false);
      })
      .catch(err => {
        console.error("Erro ao carregar dados de aprovação em lote:", err);
        if (currentRequestId === requestIdRef.current) setLoadingSponsors(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- awaitingKey é a chave estável de awaitingItems
  }, [awaitingKey]);

  // Carregar aprovações individuais de patrocinadores quando o dialog é aberto.
  // Guarda de corrida (cancelled): ao aprovar, o fluxo avança para a próxima
  // peça (setSelectedItem), disparando este efeito de novo. Sem a guarda, a
  // resposta lenta da peça ANTERIOR podia chegar depois e sobrescrever as
  // aprovações da peça atual — exibindo/decidindo sobre a peça errada.
  useEffect(() => {
    if (dialogOpen && selectedItem) {
      let cancelled = false;
      setLoadingSponsorApprovals(true);
      setSponsorApprovals([]);
      setRejectionReason("");
      setRejectingSponsorId(null);

      apiRequest("GET", `/api/items/${selectedItem.id}/sponsor-approvals`)
        .then(response => response.json())
        .then((approvals: SponsorApproval[]) => {
          if (cancelled) return;
          setSponsorApprovals(approvals);
          setLoadingSponsorApprovals(false);
        })
        .catch(error => {
          if (cancelled) return;
          console.error('Error loading sponsor approvals:', error);
          setLoadingSponsorApprovals(false);
        });

      return () => { cancelled = true; };
    }
  }, [dialogOpen, selectedItem]);

  /**
   * Atualiza a peça já no cache em vez de recarregar a lista inteira.
   * Recarregar /api/items (milhares de peças) + /api/audit-logs (milhares de
   * registros) a cada decisão deixava a revisão lenta. Eventos e logs são
   * marcados como desatualizados e só recarregam quando a tela precisar.
   */
  const applyItemDecisionToCache = (updatedItem?: any) => {
    if (updatedItem?.id) {
      const patch = (list?: any[]) =>
        list ? list.map(i => (i.id === updatedItem.id ? { ...i, ...updatedItem } : i)) : list;
      queryClient.setQueryData<any[]>(["/api/items"], patch);
      queryClient.setQueryData<any[]>(["/api/items/approved"], patch);
    } else {
      // Sem o item na resposta não dá para remendar com segurança: recarrega.
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
    }
    queryClient.invalidateQueries({ queryKey: ["/api/events"], refetchType: "none" });
    // Só recarrega os logs se o histórico estiver aberto na tela.
    queryClient.invalidateQueries({
      queryKey: ["/api/audit-logs"],
      refetchType: dialogOpen ? "active" : "none",
    });
  };

  /**
   * Remenda UM registro de aprovação nos estados locais (mapa da lista e,
   * quando o modal mostra a mesma peça, a lista do modal) — em vez de deixar
   * o efeito refazer a chamada batch inteira a cada decisão.
   * O spread { ...a, ...approval } preserva o campo `sponsor` enriquecido
   * (as respostas de decisão devolvem o registro cru, sem `sponsor`).
   */
  const applyApprovalToCache = (itemId: string, approval?: SponsorApproval | null) => {
    if (!approval) return;
    const patch = (list: SponsorApproval[]) => {
      const exists = list.some(a => a.sponsorId === approval.sponsorId);
      return exists
        ? list.map(a => (a.sponsorId === approval.sponsorId ? { ...a, ...approval } : a))
        : [...list, approval];
    };
    setItemApprovalsMap(prev => ({ ...prev, [itemId]: patch(prev[itemId] || []) }));
    if (selectedItem?.id === itemId) setSponsorApprovals(prev => patch(prev));
  };

  const individualApproveMutation = useMutation({
    mutationFn: async ({ itemId, sponsorId }: { itemId: string; sponsorId: string }) => {
      const response = await apiRequest("POST", `/api/items/${itemId}/sponsor-approvals/${sponsorId}/approve`, {});
      return response.json();
    },
    onSuccess: (data, variables) => {
      // Remenda o registro de aprovação nos caches locais — sem refazer o batch.
      applyApprovalToCache(variables.itemId, data.approval);

      if (data.allApproved) {
        // A última aprovação que faltava, já remendada acima com o registro do
        // servidor: o mapa local está completo e a saída da peça da fila não
        // precisa re-baixar o lote. (Só a APROVAÇÃO marca: reprovar pode tirar
        // a aprovação estrita de outros patrocinadores no servidor, e "Aprovar
        // para todos" não devolve os registros — esses seguem re-buscando.)
        // E só se o mapa local já dizia o mesmo que o servidor sobre os DEMAIS
        // patrocinadores (todos aprovados) — senão o lote é quem corrige.
        const mapaConfere = (itemSponsorsMap[variables.itemId] ?? []).every((s: any) =>
          s.id === variables.sponsorId
          || (itemApprovalsMap[variables.itemId] ?? []).some(a => a.sponsorId === s.id && a.status === 'approved'));
        if (data.item?.id && data.approval && mapaConfere) decididasAquiRef.current.add(data.item.id);
        // O item mudou de status: a resposta traz o item atualizado.
        applyItemDecisionToCache(data.item);
        // Peça concluída: segue direto para a próxima da fila, sem voltar à lista.
        const idx = reviewQueue.findIndex((i: any) => i.id === selectedItem?.id);
        const next = idx >= 0 ? reviewQueue[idx + 1] : undefined;
        if (next) {
          seguirParaPeca(next);
          toast({ title: "Peça aprovada", description: `Seguindo para ${next.displayId} · ${next.type}` });
        } else {
          setDialogOpen(false);
          setSelectedItem(null);
          toast({ title: "Todos patrocinadores aprovaram", description: "Você revisou a última peça da fila." });
        }
      } else {
        // Decisão parcial: o item não mudou de status; só o log ficou defasado.
        queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"], refetchType: dialogOpen ? "active" : "none" });
        const sponsorName = itemSponsorsMap[variables.itemId]?.find((s: any) => s.id === variables.sponsorId)?.name;
        // Quem ainda falta NESTA peça: é o que diz se dá para seguir para a
        // próxima ou se ainda há decisão aqui. Conta pelo mapa da lista com a
        // decisão recém-remendada (applyApprovalToCache roda antes, mas o
        // estado só vale no próximo render — por isso o sponsorId sai à mão).
        const restantes = quemFalta({ id: variables.itemId }).filter(n => n !== sponsorName).length;
        // Sem ninguém pendente — mas nem todos aprovaram (alguém reprovou
        // antes) — a peça não pede mais nada de quem decide (rodada 4). Ficar
        // nela obrigava a achar "Próxima peça" numa ficha sem ação; segue como
        // o ramo de todos aprovados.
        const idx = reviewQueue.findIndex((i: any) => i.id === variables.itemId);
        const next = restantes === 0 && dialogOpen && selectedItem?.id === variables.itemId && idx >= 0 ? reviewQueue[idx + 1] : undefined;
        if (next) seguirParaPeca(next);
        toast({
          title: `${sponsorName || 'Patrocinador'} aprovou`,
          description: restantes > 0
            ? `${restantes === 1 ? 'Falta 1 patrocinador' : `Faltam ${restantes} patrocinadores`} decidir nesta peça.`
            : next
              ? `Nada mais a decidir nesta peça — seguindo para ${next.displayId} · ${next.type}`
              : "A decisão foi registrada. Nada mais a decidir nesta peça.",
        });
      }
    },
    onError: (error: any) => {
      toast({ title: "Erro ao aprovar", description: error.message || "Ocorreu um erro ao aprovar", variant: "destructive" });
    },
  });

  const individualRejectMutation = useMutation({
    mutationFn: async ({ itemId, sponsorId, reason }: { itemId: string; sponsorId: string; reason?: string }) => {
      const response = await apiRequest("POST", `/api/items/${itemId}/sponsor-approvals/${sponsorId}/reject`, {
        rejectionReason: reason || null
      });
      return response.json();
    },
    onSuccess: (data, variables) => {
      // A resposta traz o registro de aprovação (status awaiting_arte) e o
      // item (flag rejectedBySponsor) — remenda os dois caches localmente.
      applyApprovalToCache(variables.itemId, data.approval);
      applyItemDecisionToCache(data.item);
      setRejectionReason("");
      setRejectingSponsorId(null);

      // NADA MAIS A DECIDIR NESTA PEÇA? (rodada 4) O endpoint não devolve
      // `allDecided`, então o ramo abaixo nunca rodava: depois de reprovar o
      // último patrocinador pendente, a pessoa ficava parada numa peça sem
      // decisão nenhuma a tomar. A conta sai de `quemFalta` (o mapa da lista),
      // tirando à mão quem acabou de ser reprovado — o estado remendado por
      // applyApprovalToCache só vale no próximo render.
      const quemReprovou = itemSponsorsMap[variables.itemId]?.find((s: any) => s.id === variables.sponsorId)?.name;
      const aindaFaltam = quemFalta({ id: variables.itemId }).filter(n => n !== quemReprovou).length;
      const modalNaPeca = dialogOpen && selectedItem?.id === variables.itemId;
      if (data.allDecided || (modalNaPeca && aindaFaltam === 0)) {
        // Peça resolvida (volta para a Arte): segue para a próxima da fila.
        const idx = reviewQueue.findIndex((i: any) => i.id === selectedItem?.id);
        const next = idx >= 0 ? reviewQueue[idx + 1] : undefined;
        if (next) {
          seguirParaPeca(next);
          toast({ title: quemReprovou ? `Reprovação de ${quemReprovou} registrada` : "Peça devolvida para a Arte", description: `A Arte recebe o motivo. Nada mais a decidir nesta peça — seguindo para ${next.displayId} · ${next.type}` });
        } else {
          setDialogOpen(false);
          setSelectedItem(null);
          toast({ title: quemReprovou ? `Reprovação de ${quemReprovou} registrada` : "Todos patrocinadores decidiram", description: "A Arte recebe o motivo e refaz a arte. Era a última peça da fila." });
        }
      } else {
        // Diz QUEM reprovou e o que acontece com os demais — a pergunta
        // seguinte de quem acabou de reprovar é "e os outros patrocinadores?".
        toast({ title: quemReprovou ? `Reprovação de ${quemReprovou} registrada` : "Reprovação registrada", description: `A Arte recebe o motivo e prepara a nova versão. ${aindaFaltam === 0 ? "Nada mais a decidir nesta peça." : `${aindaFaltam === 1 ? "Falta 1 patrocinador" : `Faltam ${aindaFaltam} patrocinadores`} decidir nesta peça.`}` });
      }
    },
    onError: (error: any) => {
      toast({ title: "Erro ao reprovar", description: error.message || "Ocorreu um erro ao reprovar", variant: "destructive" });
    },
  });

  // Correção de admin: desfaz uma aprovação/reprovação feita por engano,
  // sem precisar mexer direto no banco. Só admin vê o botão (checado na UI).
  const revertApprovalMutation = useMutation({
    mutationFn: async ({ itemId, sponsorId }: { itemId: string; sponsorId: string }) => {
      const response = await apiRequest("POST", `/api/items/${itemId}/sponsor-approvals/${sponsorId}/revert`, {});
      return response.json();
    },
    onSuccess: (data, variables) => {
      // A resposta traz { approval, item }: remenda os caches localmente.
      applyApprovalToCache(variables.itemId, data.approval);
      applyItemDecisionToCache(data.item);
      toast({ title: "Aprovação revertida", description: "O patrocinador volta a aguardar decisão." });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao reverter", description: error.message || "Não foi possível reverter a aprovação", variant: "destructive" });
    },
  });

  /**
   * DISPARAR À MÃO o aviso da gestão (25/08).
   *
   * O aviso das 10h, 15h e 18h SAI do sistema, e o conector de e-mail só
   * autentica dentro do ambiente publicado — não há como verificar de fora que
   * o canal está de pé. Sem este botão, a única forma de descobrir que o aviso
   * parou seria as três não receberem nada e ninguém estranhar.
   *
   * Só admin, pela mesma régua do reenvio do book e do aviso da Revisão: um
   * clique manda e-mail de verdade para outras pessoas.
   */
  const avisarGestaoMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/gestao/digest/enviar", {});
      return await res.json();
    },
    onSuccess: (r: any) => {
      // O servidor devolve a frase pronta — inclusive quando NÃO enviou (nada
      // pendente, remetente ausente). "Enviado" seria mentira nesses casos, e
      // o ponto do botão é justamente saber o que aconteceu.
      toast({
        title: r?.status === "enviado" ? "Aviso enviado" : "Aviso não enviado",
        description: r?.mensagem ?? "Sem resposta do servidor.",
        variant: r?.status === "enviado" ? undefined : "destructive",
      });
    },
    onError: (error: any) => toast({ title: "Erro ao disparar o aviso", description: error.message, variant: "destructive" }),
  });

  // DESVINCULAR da peça (pedido do dono, 25/08): tira o patrocinador e a
  // aprovação PENDENTE dele deixa de contar — se ele era o único que faltava,
  // o servidor fecha a rodada e a peça segue. Aprovação já dada fica no
  // histórico (para desfazê-la existe o Revogar). Só admin, como o Adicionar.
  const desvincularSponsorMutation = useMutation({
    mutationFn: async ({ itemId, sponsorId }: { itemId: string; sponsorId: string }) => {
      const response = await apiRequest("DELETE", `/api/items/${itemId}/sponsors/${sponsorId}`);
      return response.json();
    },
    onSuccess: (data, variables) => {
      setItemSponsorsMap(prev => ({
        ...prev,
        [variables.itemId]: (prev[variables.itemId] ?? []).filter((s: any) => s.id !== variables.sponsorId),
      }));
      setSponsorApprovals(prev => prev.filter(a => a.sponsorId !== variables.sponsorId));
      if (data?.item) applyItemDecisionToCache(data.item);
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      setDesvincularAlvo(null);
      toast(data?.pecaInativada
        ? { title: "Desvinculado — a peça foi cancelada", description: "Era o único patrocinador: a peça saiu das filas e segue visível no Painel Geral, com a explicação registrada." }
        : data?.rodadaFechou
        ? { title: "Desvinculado — a peça seguiu", description: "Ele era o único que faltava: a rodada fechou e a Arte foi avisada para finalizar." }
        : { title: "Patrocinador desvinculado", description: "A aprovação pendente dele deixou de contar." });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao desvincular", description: error.message || "Não foi possível desvincular o patrocinador", variant: "destructive" });
    },
  });

  const sponsorApproveMutation = useMutation({
    mutationFn: async (itemId: string) => {
      // O endpoint devolve o item atualizado — dá para remendar o cache.
      const response = await apiRequest("PATCH", `/api/items/${itemId}/sponsor-approve`, {});
      return response.json();
    },
    onSuccess: (item, itemId) => {
      applyItemDecisionToCache(item);
      // A MESMA fila da aprovação individual (rodada 4). "Aprovar para todos"
      // fechava o modal e devolvia a pessoa à lista para reencontrar a próxima
      // peça — o atalho mais rápido de decidir era o mais lento de continuar.
      // O toast também dizia "aprovada pelo patrocinador", no singular, para
      // uma decisão de todos.
      const idx = reviewQueue.findIndex((i: any) => i.id === itemId);
      const next = idx >= 0 ? reviewQueue[idx + 1] : undefined;
      if (next) {
        seguirParaPeca(next);
        toast({ title: "Peça aprovada para todos os patrocinadores", description: `Seguindo para ${next.displayId} · ${next.type}` });
      } else {
        setDialogOpen(false);
        setSelectedItem(null);
        toast({ title: "Peça aprovada para todos os patrocinadores", description: "Era a última peça da fila." });
      }
    },
    onError: (error: any) => {
      toast({ title: "Erro ao aprovar peça", description: error.message || "Ocorreu um erro", variant: "destructive" });
    },
  });


  const batchSponsorMutation = useMutation({
    mutationFn: async ({ sponsorId, eventId, action, reason }: {
      sponsorId: string; eventId: string; action: "approve" | "reject"; reason?: string;
    }) => {
      const targetItems = awaitingItems.filter(item =>
        item.eventId === eventId && batchSelectedItemIds.has(item.id)
      );
      const elegiveis = targetItems.filter(item => {
        const approvals: SponsorApproval[] = itemApprovalsMap[item.id] || [];
        const approval = approvals.find(a => a.sponsorId === sponsorId);
        const status = approval?.status || "pending";
        if (!itemSponsorsMap[item.id]?.some((s: any) => s.id === sponsorId)) return false;
        return status === "pending" || status === "new_version_pending";
      });
      // allSettled, e não all: com Promise.all, UMA recusa (peça que outra
      // pessoa decidiu no meio, evento que fechou) jogava o lote inteiro no
      // onError — "Erro na operação em lote" — enquanto as outras decisões
      // JÁ ESTAVAM gravadas, e o cache não era remendado com nenhuma delas.
      // Parseia cada resposta: { approval, item?, allApproved? } — permite
      // remendar os caches sem invalidar/refazer as listas inteiras.
      const settled = await Promise.allSettled(elegiveis.map(item => (action === "approve"
        ? apiRequest("POST", `/api/items/${item.id}/sponsor-approvals/${sponsorId}/approve`, {})
        : apiRequest("POST", `/api/items/${item.id}/sponsor-approvals/${sponsorId}/reject`, { rejectionReason: reason || null })
      ).then(r => r.json())));
      const results: any[] = [];
      const falhas: { displayId: string; erro: string }[] = [];
      settled.forEach((r, i) => {
        if (r.status === "fulfilled") results.push(r.value);
        else falhas.push({ displayId: elegiveis[i].displayId ?? "peça", erro: (r.reason as Error)?.message || "erro desconhecido" });
      });
      return { results, falhas, total: elegiveis.length };
    },
    onSuccess: ({ results, falhas, total }: { results: any[]; falhas: { displayId: string; erro: string }[]; total: number }, vars) => {
      // Nenhuma requisição saiu (todas as selecionadas já estavam decididas ou
      // sem o patrocinador): avisa em vez de anunciar um sucesso que não houve.
      if (total === 0) {
        toast({
          title: "Nenhuma peça elegível",
          description: "As peças selecionadas já foram decididas para este patrocinador.",
        });
        return;
      }
      let anyItemChanged = false;
      results.forEach((r: any) => {
        if (r?.approval) applyApprovalToCache(r.approval.itemId, r.approval);
        if (r?.item) { anyItemChanged = true; applyItemDecisionToCache(r.item); }
      });
      if (!anyItemChanged) {
        // Nenhum item mudou de status — ainda assim o log ficou defasado.
        queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"], refetchType: dialogOpen ? "active" : "none" });
      }
      // O PATROCINADOR FICA (rodada 4): decidir por marca é percorrer os
      // eventos dela, e zerar tudo obrigava a reescolher a mesma marca a cada
      // evento. Sem mais pendência, o efeito junto de batchSponsorNome limpa.
      setBatchEventId("");
      setBatchRejectReason("");
      setBatchShowRejectForm(false);
      // O número no aviso: "todas as selecionadas" não confirma QUANTAS
      // decisões saíram — e é essa conta que a pessoa confere com o patrocinador.
      const n = results.length;
      // FALHA PARCIAL: "X de Y registradas" e QUAIS ficaram, com o motivo da
      // primeira — as que passaram já estão no cache (remendado acima).
      if (falhas.length > 0) {
        // O que falhou pode ter mudado no servidor (outra pessoa decidiu):
        // a lista é recarregada para não mostrar a decisão velha.
        queryClient.invalidateQueries({ queryKey: ["/api/items"] });
        toast({
          title: `${n} de ${total} ${vars.action === "approve" ? "aprovações registradas" : "reprovações registradas"}`,
          description: `Não ${falhas.length === 1 ? "foi" : "foram"}: ${falhas.slice(0, 5).map(f => f.displayId).join(", ")}${falhas.length > 5 ? ` e mais ${falhas.length - 5}` : ""} — ${falhas[0].erro}`,
          variant: "destructive",
        });
        return;
      }
      toast({
        title: vars.action === "approve"
          ? `${n} ${n === 1 ? 'peça aprovada' : 'peças aprovadas'} em lote`
          : `${n} ${n === 1 ? 'peça reprovada' : 'peças reprovadas'} em lote`,
        description: `${vars.action === "approve"
          ? `Aprovação de ${nomePorPatrocinador.get(vars.sponsorId) ?? "o patrocinador"} registrada.`
          : "As peças voltaram para a Arte com o motivo informado."}`,
      });
    },
    onError: (error: any) => {
      toast({ title: "Erro na operação em lote", description: error.message || "Ocorreu um erro", variant: "destructive" });
    },
  });

  const pendingItems = awaitingItems;

  /** Evento por id — o prazo da peça é o do evento dela. */
  const eventoPorId = useMemo(
    () => new Map((events as any[]).map((e: any) => [e.id, e])),
    [events],
  );

  // "Base" = todos os filtros MENOS o de atrasados. É dela que sai a contagem
  // exibida no próprio controle, que precisa continuar valendo depois do clique.
  const filteredItemsBase = useMemo(() => {
    return pendingItems.filter(item => {
      const hasSponsors = itemSponsorsMap[item.id]?.length > 0;
      if (!hasSponsors && !loadingSponsors) return false;

      // A busca desta aba tinha DOIS defeitos, e o campo prometia os dois:
      // o placeholder diz "ID, tipo ou descrição".
      //
       // 1. Nunca olhava o `displayId`. Digitar "2229" devolvia zero, sempre —
      //    e o ID é justamente como se procura uma peça quando alguém liga
      //    perguntando por ela.
      // 2. Usava `toLowerCase()` cru, que não tira acento: "São" e "sao" eram
      //    buscas diferentes. É o mesmo defeito que a Gráfica teve com
      //    "SÓ QUERO PEDALAR SP".
      //
      // O conserto já existia 240 linhas abaixo, na aba Histórico: mesma
      // `normalizarBusca` dos menus, sobre os mesmos três campos. Duas buscas
      // na mesma tela com regras diferentes era a origem de tudo.
      const q = normalizarBusca(deferredSearchTerm);
      const matchesSearch = q === "" ||
        normalizarBusca(item.displayId).includes(q) ||
        normalizarBusca(item.type).includes(q) ||
        normalizarBusca(item.description).includes(q);

      const matchesEvent = eventFilter.length === 0 || eventFilter.includes(item.eventId);
      const matchesType = itemTypeFilter.length === 0 || itemTypeFilter.includes(item.type);
      const matchesSponsor = sponsorFilter.length === 0 ||
        itemSponsorsMap[item.id]?.some(sponsor => sponsorFilter.includes(sponsor.id));
      const matchesSituacao = situacaoFilter.length === 0 ||
        situacaoFilter.includes(situacaoDaPeca(itemApprovalsMap[item.id]));

      return matchesSearch && matchesEvent && matchesType && matchesSponsor && matchesSituacao;
    });
  }, [pendingItems, deferredSearchTerm, eventFilter, itemTypeFilter, sponsorFilter, situacaoFilter, itemApprovalsMap, itemSponsorsMap, loadingSponsors]);

  // UMA passada, memoizada na âncora estável — nada de recalcular data por card.
  const atrasadosNaBase = useMemo(
    () => filtrarAtrasadosNaAprovacao(filteredItemsBase, eventoPorId, hoje),
    [filteredItemsBase, eventoPorId, hoje],
  );

  const filteredItems = atrasadosFilter ? atrasadosNaBase : filteredItemsBase;

  // Filtros facetados: cada filtro lista só o que existe na página, aplicando
  // os OUTROS filtros ativos (escolher um evento reduz tipos e patrocinadores).
  const facetPool = (exclude: 'event' | 'type' | 'sponsor' | 'situacao') =>
    pendingItems.filter((item: any) => {
      if (!(itemSponsorsMap[item.id]?.length > 0) && !loadingSponsors) return false;
      // O recorte de atrasados também é faceta: sem ele aqui, o dropdown
      // ofereceria "Evento X · 12" e a lista devolveria 2.
      // Peça do Kit (14/09): o atraso conta pelas datas da remessa dela.
      if (atrasadosFilter && !isEventoAtrasadoNaAprovacao(item.kitRemessaId && item.event ? item.event : eventoPorId.get(item.eventId), hoje)) return false;
      if (exclude !== 'event' && eventFilter.length > 0 && !eventFilter.includes(item.eventId)) return false;
      if (exclude !== 'type' && itemTypeFilter.length > 0 && !itemTypeFilter.includes(item.type)) return false;
      if (exclude !== 'sponsor' && sponsorFilter.length > 0 && !itemSponsorsMap[item.id]?.some(s => sponsorFilter.includes(s.id))) return false;
      if (exclude !== 'situacao' && situacaoFilter.length > 0 && !situacaoFilter.includes(situacaoDaPeca(itemApprovalsMap[item.id]))) return false;
      return true;
    });

  const eventFilterOptions = useMemo(() => {
    const DOT: Record<string, string> = { urgente: '#ef4444', urgent: '#ef4444', alta: '#f97316', media: '#eab308', baixa: '#3b82f6' };
    const byId = new Map((events as any[]).map((e: any) => [e.id, e]));
    const map = new Map<string, { value: string; label: string; count: number; dotColor?: string }>();
    facetPool('event').forEach((i: any) => {
      if (!i.eventId) return;
      const cur = map.get(i.eventId);
      if (cur) cur.count++;
      else {
        const ev = byId.get(i.eventId);
        map.set(i.eventId, { value: i.eventId, label: ev?.name || 'Sem evento', count: 1, dotColor: DOT[ev?.priority] });
      }
    });
    return Array.from(map.values());
  }, [pendingItems, eventFilter, itemTypeFilter, sponsorFilter, itemSponsorsMap, loadingSponsors, events, atrasadosFilter, eventoPorId, hoje]);

  // A contagem por SITUAÇÃO, calculada UMA vez.
  //
  // O placar e o menu "Situação" mostram os mesmos números em dois lugares da
  // mesma tela. Esta tela já teve exatamente esse defeito — o badge do topo e
  // a contagem da aba somavam conjuntos diferentes e divergiam à vista de
  // todos, e há um comentário no código registrando o conserto. Com uma fonte
  // só eles não voltam a divergir nem se alguém mexer em um dos dois.
  //
  // O pool é o de `facetPool("situacao")`, que aplica os OUTROS filtros mas
  // não o de situação: o placar é o controle que LIGA esse filtro, então ele
  // precisa contar o conjunto de antes dele — senão clicar numa célula mudaria
  // o número da própria célula que você clicou.
  const contagemSituacao = useMemo(() => {
    const conta = new Map<string, number>();
    facetPool('situacao').forEach((i: any) => {
      const k = situacaoDaPeca(itemApprovalsMap[i.id]);
      conta.set(k, (conta.get(k) ?? 0) + 1);
    });
    return conta;
  }, [pendingItems, eventFilter, itemTypeFilter, sponsorFilter, situacaoFilter, itemApprovalsMap, itemSponsorsMap, loadingSponsors, atrasadosFilter, eventoPorId, hoje]);

  const situacaoFilterOptions = useMemo(() => {
    const conta = contagemSituacao;
    // `pinned`: a ordem é a da urgência, e alfabética poria "Aprovado" antes de
    // "Nova versão para aprovar" — o oposto de onde o olho precisa cair.
    return SITUACAO_ORDEM
      .filter(k => (conta.get(k) ?? 0) > 0)
      .map(k => ({ value: k, label: SITUACAO_META[k].label, count: conta.get(k)!, pinned: true }));
  }, [contagemSituacao]);

  const typeFilterOptions = useMemo(() => {
    const map = new Map<string, { value: string; label: string; count: number }>();
    facetPool('type').forEach((i: any) => {
      if (!i.type) return;
      const cur = map.get(i.type);
      if (cur) cur.count++;
      else map.set(i.type, { value: i.type, label: i.type, count: 1 });
    });
    return Array.from(map.values());
  }, [pendingItems, eventFilter, itemTypeFilter, sponsorFilter, itemSponsorsMap, loadingSponsors, atrasadosFilter, eventoPorId, hoje]);

  // Enquanto o mapa ainda carrega, mostra todos os patrocinadores da API
  // (sem contagem) para que o filtro apareça imediatamente. Assim que o mapa
  // ficar pronto, troca para as opções facetadas com contagem.
  const sponsorFilterOptions = useMemo(() => {
    if (loadingSponsors) {
      return (sponsors as any[]).map((s: any) => ({ value: s.id, label: s.name }));
    }
    const map = new Map<string, { value: string; label: string; count: number; dotColor?: string }>();
    facetPool('sponsor').forEach((i: any) => (itemSponsorsMap[i.id] ?? []).forEach((s: any) => {
      const cur = map.get(s.id);
      if (cur) cur.count++;
      else map.set(s.id, { value: s.id, label: s.name, count: 1, dotColor: s.color || '#a8a29e' });
    }));
    return Array.from(map.values());
  }, [pendingItems, eventFilter, itemTypeFilter, sponsorFilter, itemSponsorsMap, loadingSponsors, sponsors, atrasadosFilter, eventoPorId, hoje]);

  // Itens filtrados para o modal de exportação PDF (filtros independentes da página)
  // Pool para o modal de exportação compartilhado: anexa os patrocinadores
  // (que aqui vivem no itemSponsorsMap) e o evento a cada peça.
  // Pool de exportação: pendentes E já aprovadas. Órgãos como o Ministério do
  // Esporte exigem o book COMPLETO da etapa a cada nova solicitação, mesmo
  // quando só uma peça mudou — se só as pendentes entrassem, o book sairia
  // incompleto assim que as demais fossem aprovadas.
  const exportPool = useMemo(() => {
    // Só com o modal ABERTO: o pool copia cada peça elegível (milhares de
    // objetos novos) e o ExportPdfDialog, montado sempre, recalcula oito
    // facetas a cada identidade nova. Fechado, ele recebe o último pool que
    // mostrou (exportPoolCongelado) e não refaz nada — nem na animação de saída.
    if (!showExportPDFModal) return null;
    const evById = new Map((events as any[]).map((e: any) => [e.id, e]));
    return (items as any[])
      .filter(item => {
        if ((itemSponsorsMap[item.id]?.length ?? 0) === 0) return false;
        // Entrou no fluxo de aprovação: está aguardando, já tem aprovação OU
        // está num status pós-aprovação (atalho "Aprovar Ativo" não cria approvals).
        const approvals: SponsorApproval[] = itemApprovalsMap[item.id] || [];
        return item.status === 'awaiting_sponsor_approval'
          || approvals.some(a => a.status === 'approved')
          || isPastApproval(item);
      })
      .map(item => ({
        ...item,
        sponsors: itemSponsorsMap[item.id] ?? [],
        event: item.event ?? evById.get(item.eventId),
      }));
  }, [showExportPDFModal, items, itemSponsorsMap, itemApprovalsMap, events]);
  const exportPoolRef = useRef<any[]>([]);
  if (exportPool) exportPoolRef.current = exportPool;
  const exportPoolCongelado = exportPool ?? exportPoolRef.current;

  // Patrocinadores da peça já com o status de aprovação de cada um, para os
  // chips mostrarem a cor da marca E a decisão (aprovado / reprovado / aguardando).
  const sponsorsWithStatus = (item: any) => {
    const sps = itemSponsorsMap[item.id] || [];
    const apps: SponsorApproval[] = itemApprovalsMap[item.id] || [];
    return sps.map((s: any) => ({
      ...s,
      approvalStatus: approvalVisual(apps.find(a => a.sponsorId === s.id)?.status).chip,
    }));
  };

  // QUEM AINDA NÃO RESPONDEU, POR NOME.
  //
  // O card dizia "2 de 3 responderam" e não dizia QUEM falta — e saber o
  // nome é o que permite ir atrás da resposta. Para descobrir, era preciso
  // abrir o modal de revisão de cada peça, uma por uma.
  const quemFalta = (item: any): string[] => {
    const sps = itemSponsorsMap[item.id] || [];
    const apps: SponsorApproval[] = itemApprovalsMap[item.id] || [];
    return sps
      .filter((s: any) => {
        const st = apps.find(a => a.sponsorId === s.id)?.status;
        return !st || st === "pending" || st === "new_version_pending";
      })
      .map((s: any) => s.name)
      .filter(Boolean);
  };

  /** "falta X" · "faltam X e Y" · "faltam X, Y e mais N". */
  const fraseDeQuemFalta = (nomes: string[]): string => {
    if (nomes.length === 0) return "";
    if (nomes.length === 1) return `falta ${nomes[0]}`;
    if (nomes.length === 2) return `faltam ${nomes[0]} e ${nomes[1]}`;
    return `faltam ${nomes[0]}, ${nomes[1]} e mais ${nomes.length - 2}`;
  };

  const isItemFullyApproved = (item: any): boolean => {
    const itemSps = itemSponsorsMap[item.id] || [];
    if (itemSps.length === 0) return false;
    const approvals: SponsorApproval[] = itemApprovalsMap[item.id] || [];
    return itemSps.every((s: any) => approvals.find(a => a.sponsorId === s.id)?.status === 'approved');
  };

  const pendingGroup = useMemo(() => {
    if (loadingSponsors) return filteredItems;
    return filteredItems.filter(item => !isItemFullyApproved(item));
  }, [filteredItems, itemApprovalsMap, itemSponsorsMap, loadingSponsors]);

  // A ORDEM, EM UM LUGAR SÓ — a lista e a fila do modal têm de andar
  // juntas: navegar com "Próxima peça" numa ordem diferente da que está na
  // tela é o tipo de desencontro que faz a pessoa decidir a peça errada.
  const comparaPecas = useCallback((a: any, b: any) => {
    if (ordemPendentes === "mesa") {
      const ma = situacaoDaPeca(itemApprovalsMap[a.id]) === "nova_versao" ? 0 : 1;
      const mb = situacaoDaPeca(itemApprovalsMap[b.id]) === "nova_versao" ? 0 : 1;
      if (ma !== mb) return ma - mb;
    }
    const ga = typeToGroup[a.type] || '', gb = typeToGroup[b.type] || '';
    return COLLATOR.compare(ga, gb) || COLLATOR.compare(a.type, b.type);
  }, [ordemPendentes, itemApprovalsMap, typeToGroup]);

  /** Peso do EVENTO na ordem escolhida. Vencido primeiro; sem prazo, por último. */
  const pesoDoEvento = useCallback((eventId: string, pecas: any[]) => {
    const ev = eventoPorId.get(eventId);
    if (ordemPendentes === "evento") return { chave: (ev?.name || "").toLowerCase(), num: 0 };
    if (ordemPendentes === "mesa") {
      const naMesa = pecas.filter((i: any) => situacaoDaPeca(itemApprovalsMap[i.id]) === "nova_versao").length;
      return { chave: "", num: -naMesa };
    }
    const prazo = ev ? prazoAprovacaoLayout(ev, hoje) : null;
    // Sem marco não é "no prazo": é desconhecido, e vai para o fim.
    return { chave: "", num: prazo ? prazo.diff : Number.MAX_SAFE_INTEGER };
  }, [ordemPendentes, itemApprovalsMap, eventoPorId, hoje]);

  
  const actionableCount = useMemo(() => {
    if (loadingSponsors) return null;
    return pendingGroup.filter(item => {
      const approvals: SponsorApproval[] = itemApprovalsMap[item.id] || [];
      const hasArteBlock = approvals.some(a => a.status === 'awaiting_arte');
      if (hasArteBlock) return false;
      return approvals.some(a => a.status === 'rejected' || a.status === 'pending' || a.status === 'new_version_pending');
    }).length;
  }, [pendingGroup, itemApprovalsMap, loadingSponsors]);

  /**
   * Liga o filtro de situação numa chave só — e desliga se ela já era a
   * única ligada. É o comportamento de um placar: a célula é um recorte, não
   * um acumulador.
   */
  const alternarSituacao = (k: string) =>
    setSituacaoFilter(atual => (atual.length === 1 && atual[0] === k ? [] : [k]));

  const nomePorPatrocinador = useMemo(
    () => new Map((sponsors as any[]).map((s: any) => [s.id, s.name])),
    [sponsors],
  );

  /**
   * O recorte ativo, escrito.
   *
   * Cinco filtros combinam nesta tela e nenhum deles aparecia por extenso: o
   * estado morava dentro dos menus. Quem clicava numa célula do placar, era
   * interrompido e voltava dez minutos depois via uma lista curta sem nada na
   * tela explicando por quê. Estado invisível vira desconfiança do número.
   */
  const chipsAtivos: { key: string; label: string; onRemove: () => void }[] = [];
  if (searchTerm) chipsAtivos.push({ key: "busca", label: `Busca: ${searchTerm}`, onRemove: () => setSearchTerm("") });
  situacaoFilter.forEach(k => chipsAtivos.push({
    key: `sit-${k}`,
    label: SITUACAO_META[k as SituacaoPeca]?.label ?? k,
    onRemove: () => setSituacaoFilter(v => v.filter(x => x !== k)),
  }));
  eventFilter.forEach(id => chipsAtivos.push({
    key: `ev-${id}`,
    label: eventoPorId.get(id)?.name ?? "Evento",
    onRemove: () => setEventFilter(v => v.filter(x => x !== id)),
  }));
  itemTypeFilter.forEach(t => chipsAtivos.push({
    key: `tp-${t}`, label: t,
    onRemove: () => setItemTypeFilter(v => v.filter(x => x !== t)),
  }));
  sponsorFilter.forEach(id => chipsAtivos.push({
    key: `sp-${id}`,
    label: nomePorPatrocinador.get(id) ?? "Patrocinador",
    onRemove: () => setSponsorFilter(v => v.filter(x => x !== id)),
  }));
  if (atrasadosFilter) chipsAtivos.push({ key: "atrasados", label: "Passaram do prazo", onRemove: () => setAtrasadosFilter(false) });

  /** Limpa TUDO — inclusive a situação, que o botão antigo esquecia. */
  const limparFiltros = () => {
    setSearchTerm(""); setEventFilter([]); setItemTypeFilter([]);
    setSponsorFilter([]); setSituacaoFilter([]); setAtrasadosFilter(false);
  };

  const batchEligibleSponsors = useMemo(() => {
    if (loadingSponsors) return [];
    const sponsorSet = new Set<string>();
    awaitingItems.forEach(item => {
      const approvals: SponsorApproval[] = itemApprovalsMap[item.id] || [];
      const itemSps = itemSponsorsMap[item.id] || [];
      itemSps.forEach((s: any) => {
        const approval = approvals.find(a => a.sponsorId === s.id);
        const status = approval?.status || "pending";
        if (status === "pending" || status === "new_version_pending") sponsorSet.add(s.id);
      });
    });
    return (sponsors as any[]).filter((s: any) => sponsorSet.has(s.id));
  }, [awaitingItems, itemApprovalsMap, itemSponsorsMap, loadingSponsors, sponsors]);

  const batchEligibleEvents = useMemo(() => {
    if (!batchSponsorId || loadingSponsors) return [];
    const eventSet = new Set<string>();
    awaitingItems.forEach(item => {
      if (!itemSponsorsMap[item.id]?.some((s: any) => s.id === batchSponsorId)) return;
      const approvals: SponsorApproval[] = itemApprovalsMap[item.id] || [];
      const approval = approvals.find(a => a.sponsorId === batchSponsorId);
      const status = approval?.status || "pending";
      if (status === "pending" || status === "new_version_pending") eventSet.add(item.eventId);
    });
    return (events as any[]).filter((e: any) => eventSet.has(e.id));
  }, [batchSponsorId, awaitingItems, itemApprovalsMap, itemSponsorsMap, loadingSponsors, events]);

  const batchEligibleItems = useMemo(() => {
    if (!batchSponsorId || !batchEventId) return [];
    return awaitingItems.filter(item => {
      if (item.eventId !== batchEventId) return false;
      if (!itemSponsorsMap[item.id]?.some((s: any) => s.id === batchSponsorId)) return false;
      const approvals: SponsorApproval[] = itemApprovalsMap[item.id] || [];
      const approval = approvals.find(a => a.sponsorId === batchSponsorId);
      const status = approval?.status || "pending";
      return status === "pending" || status === "new_version_pending";
    });
  }, [batchSponsorId, batchEventId, awaitingItems, itemApprovalsMap, itemSponsorsMap]);

  const batchItemCount = batchEligibleItems.length;

  // NOMES do lote (rodada 4): a confirmação dizia "para o patrocinador
  // selecionado" — a pergunta "para quem?" voltava justamente no último clique,
  // com o seletor escondido atrás do diálogo.
  const batchSponsorNome = nomePorPatrocinador.get(batchSponsorId) ?? "o patrocinador selecionado";
  const batchEventoNome = eventoPorId.get(batchEventId)?.name ?? null;

  // Depois de um lote o patrocinador FICA escolhido (ver batchSponsorMutation):
  // o próximo evento dele é a pergunta seguinte. Se ele não tem mais nada
  // pendente, a escolha volta ao zero em vez de apontar para um nome que saiu
  // da lista.
  useEffect(() => {
    if (!batchSponsorId || loadingSponsors) return;
    if (!batchEligibleSponsors.some((s: any) => s.id === batchSponsorId)) setBatchSponsorId("");
  }, [batchSponsorId, batchEligibleSponsors, loadingSponsors]);

  // ── Aba Histórico ───────────────────────────────────────────────────────
  // Itens que têm pelo menos uma aprovação de patrocinador com status 'approved',
  // independente do status atual (podem estar em produção, entregues, etc.)
  // Rótulo e cores do badge de status vêm da lib canônica (getStatusMeta) —
  // o mapa local que existia aqui divergia dos nomes usados nas outras telas.
  //
  // A INVARIANTE, a mesma da fila de pendentes acima: FACETA E LISTA SAEM DO
  // MESMO POOL. Aqui ela estava quebrada ao contrário — os dois menus desta aba
  // (`histEventOptions`, `histSponsorOptions`) listavam TODOS os eventos e
  // TODOS os patrocinadores do sistema, sem contagem, sobre uma lista que só
  // tem peça com aprovação registrada. Escolher um evento sem histórico
  // devolvia lista vazia, e não havia como saber se o evento não tinha
  // aprovação ou se a tela tinha quebrado.
  //
  // `excluir` é o que sustenta a invariante: a lista chama sem ele, cada menu
  // chama com a própria dimensão de fora.
  const casaHistorico = (item: any, excluir?: 'evento' | 'patrocinador'): boolean => {
    const approvals: SponsorApproval[] = itemApprovalsMap[item.id] || [];
    // Aprovação registrada OU status pós-aprovação: o atalho "Aprovar
    // Ativo" muda o status sem criar approvals e a peça sumia daqui.
    if (!approvals.some(a => a.status === 'approved') && !isPastApproval(item)) return false;

    if (excluir !== 'evento' && histEventFilter.length > 0 && !histEventFilter.includes(item.eventId)) return false;

    if (excluir !== 'patrocinador' && histSponsorFilter.length > 0) {
      const itemSps = itemSponsorsMap[item.id] || [];
      if (!itemSps.some((s: any) => histSponsorFilter.includes(s.id))) return false;
    }

    const now = new Date();
    const cutoff = histPeriodFilter === "7d"  ? new Date(now.getTime() - 7  * 86400000)
                 : histPeriodFilter === "30d" ? new Date(now.getTime() - 30 * 86400000)
                 : histPeriodFilter === "90d" ? new Date(now.getTime() - 90 * 86400000)
                 : null;
    if (cutoff) {
      const approvedAt = approvals
        .filter(a => a.status === 'approved' && a.approvedAt)
        .map(a => new Date(a.approvedAt!))
        .sort((a, b) => b.getTime() - a.getTime())[0];
      if (!approvedAt || approvedAt < cutoff) return false;
    }

    // Busca sem acento (`normalizarBusca`, lib/utils) — a mesma dos menus.
    const q = normalizarBusca(histBuscaDeferida);
    if (q &&
        !normalizarBusca(item.type).includes(q) &&
        !normalizarBusca(item.displayId).includes(q) &&
        !normalizarBusca(item.description).includes(q)) return false;

    return true;
  };

  const historyItems = useMemo(() => {
    if (loadingSponsors) return [];
    // A aba Histórico só é desenhada com ela aberta (`activeTab === "history"`),
    // e este memo varre as 5 mil peças e ORDENA as que casam. Com a aba
    // Pendentes aberta ele rodava de graça a cada decisão (o mapa de aprovações
    // muda) — agora espera a aba ser aberta.
    if (activeTab !== "history") return [];
    // Chave de ordenação calculada UMA vez por peça: antes `latestApproval`
    // filtrava as aprovações e fazia `new Date` dentro de cada COMPARAÇÃO do
    // sort (~12 comparações por peça).
    const ultimaPorId = new Map<string, number>();
    const latestApproval = (item: any) => {
      const guardada = ultimaPorId.get(item.id);
      if (guardada !== undefined) return guardada;
      const times = (itemApprovalsMap[item.id] || [])
        .filter((a: SponsorApproval) => a.status === 'approved' && a.approvedAt)
        .map((a: SponsorApproval) => new Date(a.approvedAt!).getTime());
      const ultima = times.length ? Math.max(...times) : 0;
      ultimaPorId.set(item.id, ultima);
      return ultima;
    };
    const duracaoDe = (item: any) => jornadaDaPeca(item, hoje instanceof Date ? hoje.getTime() : Number(hoje)).duracao ?? -1;
    const nomeDoEvento = (item: any) => (eventoPorId.get(item.eventId)?.name || "").toLowerCase();
    return (items as any[]).filter(item => casaHistorico(item)).sort((a: any, b: any) => {
      if (ordemHistorico === "demoradas") return duracaoDe(b) - duracaoDe(a);
      if (ordemHistorico === "evento") return COLLATOR.compare(nomeDoEvento(a), nomeDoEvento(b)) || latestApproval(b) - latestApproval(a);
      return latestApproval(b) - latestApproval(a);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, ordemHistorico, hoje, eventoPorId, items, itemApprovalsMap, itemSponsorsMap, loadingSponsors, histEventFilter, histSponsorFilter, histPeriodFilter, histBuscaDeferida]);

  // As duas facetas da aba Histórico, do MESMO pool da lista. Só o que tem
  // linha aparece, e a contagem ao lado do nome é o número de linhas que o
  // clique entrega.
  const histEventOptions = useMemo(() => {
    if (loadingSponsors) return [] as { value: string; label: string; count: number; dotColor?: string }[];
    // Mesma razão do historyItems: menu da aba Histórico, só com ela aberta.
    if (activeTab !== "history") return [] as { value: string; label: string; count: number; dotColor?: string }[];
    const C: Record<string, string> = { urgente: '#ef4444', urgent: '#ef4444', alta: '#f97316', media: '#eab308', baixa: '#3b82f6' };
    const byId = new Map((events as any[]).map((e: any) => [e.id, e]));
    const map = new Map<string, { value: string; label: string; count: number; dotColor?: string }>();
    (items as any[]).filter(i => casaHistorico(i, 'evento')).forEach((i: any) => {
      if (!i.eventId) return;
      const cur = map.get(i.eventId);
      if (cur) { cur.count++; return; }
      const ev: any = byId.get(i.eventId);
      map.set(i.eventId, { value: i.eventId, label: ev?.name || i.event?.name || 'Sem evento', count: 1, dotColor: C[ev?.priority] });
    });
    // Prioridade primeiro (urgente no topo), nome desempata — a mesma ordem que
    // o seletor já tinha quando listava o sistema inteiro.
    const P: Record<string, number> = { urgente: 0, urgent: 0, alta: 1, media: 2, baixa: 3 };
    return Array.from(map.values()).sort((a, b) => {
      const pa = P[byId.get(a.value)?.priority] ?? 4, pb = P[byId.get(b.value)?.priority] ?? 4;
      return pa !== pb ? pa - pb : a.label.localeCompare(b.label, 'pt-BR');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, items, events, itemApprovalsMap, itemSponsorsMap, loadingSponsors, histSponsorFilter, histPeriodFilter, histBuscaDeferida]);

  const histSponsorOptions = useMemo(() => {
    if (loadingSponsors) return [] as { value: string; label: string; count: number }[];
    if (activeTab !== "history") return [] as { value: string; label: string; count: number }[];
    const map = new Map<string, { value: string; label: string; count: number }>();
    (items as any[]).filter(i => casaHistorico(i, 'patrocinador')).forEach((i: any) => {
      (itemSponsorsMap[i.id] || []).forEach((s: any) => {
        const cur = map.get(s.id);
        if (cur) cur.count++;
        else map.set(s.id, { value: s.id, label: s.name, count: 1 });
      });
    });
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, items, itemApprovalsMap, itemSponsorsMap, loadingSponsors, histEventFilter, histPeriodFilter, histBuscaDeferida]);

  // Fila de revisão: todas as peças pendentes na MESMA ordem em que aparecem
  // na tela (agrupadas por evento). É o que permite ir para a próxima peça sem
  // fechar o modal e voltar para a lista.
  const reviewQueue = useMemo(() => {
    const sorted = [...pendingGroup].sort(comparaPecas);
    const byEvent = new Map<string, any[]>();
    sorted.forEach(item => {
      const eid = item.eventId || '__none__';
      if (!byEvent.has(eid)) byEvent.set(eid, []);
      byEvent.get(eid)!.push(item);
    });
    return Array.from(byEvent.entries())
      .sort(([ea, pa], [eb, pb]) => {
        const wa = pesoDoEvento(ea, pa), wb = pesoDoEvento(eb, pb);
        return wa.num - wb.num || COLLATOR.compare(wa.chave, wb.chave);
      })
      .flatMap(([, pecas]) => pecas);
  }, [pendingGroup, comparaPecas, pesoDoEvento]);

  /** As peças que esperam decisão SUA, na ordem da tela. */
  const filaDaSuaMesa = useMemo(
    () => reviewQueue.filter((i: any) => situacaoDaPeca(itemApprovalsMap[i.id]) === "nova_versao"),
    [reviewQueue, itemApprovalsMap],
  );

  /** Vai para a peça anterior/seguinte da fila. Sem próxima, encerra a revisão. */
  const goToAdjacentItem = (dir: 1 | -1) => {
    const idx = reviewQueue.findIndex((i: any) => i.id === selectedItem?.id);
    const next = idx >= 0 ? reviewQueue[idx + dir] : undefined;
    if (next) {
      setSelectedItem(next);
    } else {
      setDialogOpen(false);
      setSelectedItem(null);
    }
  };

  // Group pendingGroup by event - must be before any early return
  const itemsByEvent = useMemo(() => {
    const map = new Map<string, any[]>();
    const sorted = [...pendingGroup].sort(comparaPecas);
    // TODAS as peças entram. O corte em 25 fatiava as PEÇAS antes de agrupar,
    // então ele não escondia só linhas: escondia EVENTOS INTEIROS. Com 227
    // pendências, a tela mostrava meia dúzia de eventos e dava a impressão de
    // que o resto não existia — e "Carregar mais" não anuncia que o que falta
    // são eventos, não peças.
    //
    // O custo disso é desenhar tudo; ver `content-visibility` no grupo.
    sorted.forEach(item => {
      const eid = item.eventId || '__none__';
      if (!map.has(eid)) map.set(eid, []);
      map.get(eid)!.push(item);
    });
    // Os GRUPOS também obedecem à ordem escolhida.
    return new Map(Array.from(map.entries()).sort(([ea, pa], [eb, pb]) => {
      const wa = pesoDoEvento(ea, pa), wb = pesoDoEvento(eb, pb);
      return wa.num - wb.num || COLLATOR.compare(wa.chave, wb.chave);
    }));
  }, [pendingGroup, comparaPecas, pesoDoEvento]);

  // Mantém a seleção em sincronia com o conjunto elegível: se uma peça sai do
  // lote (decidida em outro lugar), ela some da seleção também. Só entram
  // sozinhas na seleção as peças NOVAS no conjunto (diff com o conjunto
  // anterior via ref) — antes, qualquer mudança no conjunto re-selecionava
  // TUDO e apagava as desmarcações manuais do usuário. Trocar de
  // patrocinador/evento recomeça com tudo selecionado (combo nova).
  const prevBatchEligibleRef = useRef<{ key: string; ids: Set<string> }>({ key: "", ids: new Set() });
  useEffect(() => {
    const key = `${batchSponsorId}:${batchEventId}`;
    const ids = new Set(batchEligibleItems.map(i => i.id));
    const prev = prevBatchEligibleRef.current;
    prevBatchEligibleRef.current = { key, ids };
    if (prev.key !== key) {
      setBatchSelectedItemIds(ids);
      return;
    }
    setBatchSelectedItemIds(prevSelected => {
      const next = new Set<string>();
      ids.forEach(id => {
        if (!prev.ids.has(id) || prevSelected.has(id)) next.add(id);
      });
      return next;
    });
  }, [batchSponsorId, batchEventId, batchEligibleItems]);

  // Ao trocar de aba ou mexer nos filtros, volta a listagem para o topo.

  // O recorte de atrasados vive na URL, como nas demais telas: é o link que se
  // manda para o colega ("olha o que já venceu"). replaceState com debounce de
  // 300ms (a regra da casa pede ≥200) e preservando os outros parâmetros — o
  // ?patrocinador= da Gestão de Prazos chega por aqui e não pode ser apagado.
  useEffect(() => {
    const timer = setTimeout(() => {
      const p = new URLSearchParams(window.location.search);
      if (ordemPendentes !== "prazo") p.set("ordem", ordemPendentes); else p.delete("ordem");
      if (atrasadosFilter) p.set("atrasados", "1"); else p.delete("atrasados");
      const qs = p.toString();
      window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
    }, 300);
    return () => clearTimeout(timer);
  }, [ordemPendentes, atrasadosFilter]);
  useEffect(() => { setHistVisible(PAGE_SIZE); }, [activeTab, histEventFilter, histSponsorFilter, histPeriodFilter, histBuscaDeferida]);

  const getEventInfo = (eventId: string) => events.find((e: any) => e.id === eventId);

  const handleViewDetails = (item: any) => {
    // Limpa o motivo/patrocinador de reprovação para não vazar o texto
    // digitado numa peça anterior e reprovar a peça errada com justificativa alheia.
    setRejectionReason("");
    setRejectingSponsorId(null);
    setSelectedItem(item);
    setDialogOpen(true);
  };

  // Deep link `?item=` (sino e "Resolver em Atendimento →" da Gestão de
  // Prazos): abre a revisão da peça na aba Pendentes. A fila é
  // `awaitingItems` — a mesma regra que monta a lista (aguardando patrocinador,
  // sem dispensa, evento em jogo). Peça que já foi decidida não está mais
  // aqui, e o hook avisa em vez de abrir uma revisão sem decisão a tomar.
  // Antes do `return` de carregamento: hook não pode ficar atrás dele.
  usePecaDoLink<any>({
    pronto: !itemsLoading && !eventsLoading && !itemsError,
    localizar: (id) => (awaitingItems as any[]).find((i: any) => i.id === id),
    abrir: (peca) => {
      if (activeTab !== "pending") setActiveTab("pending");
      handleViewDetails(peca);
    },
    // Peça fora das duas listas recortadas (rascunho, vinculação, na mesa da
    // Arte): busca só ela, para o aviso continuar dizendo o código — antes
    // isso vinha do acervo inteiro que descia a cada visita.
    codigoDe: (id) =>
      (items as any[]).find((i: any) => i.id === id)?.displayId ?? buscarCodigoDaPeca(id),
  });

  if (itemsLoading || eventsLoading) {
    // Silhueta da fila, e não um spinner solto no meio da tela: é o mesmo
    // carregando da Arte e da Gráfica, e já desenha o lugar do conteúdo —
    // a tela "aparece" antes dos dados, em vez de piscar de vazio para cheio.
    return (
      <div className="bg-stone-50" style={{ height: "100%", overflowY: "auto", padding: isMobile ? "12px 12px" : "32px" }}>
        <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: FS.h1, fontWeight: 700, letterSpacing: '-0.03em', color: '#1c1917', lineHeight: 1.1, margin: '0 0 20px' }}>
          Atendimento
        </h1>
        <EsqueletoDeFila linhas={6} />
      </div>
    );
  }

  if (itemsError) {
    return (
      // role="alert": a troca da tela inteira por esta mensagem precisa ser
      // anunciada — e o título diz QUE fila falhou, não "os itens".
      // A MESMA caixa de erro da Arte (ícone de conexão âmbar, título 15/700,
      // botão em tinta): texto vermelho solto no meio da página lia como um
      // vazio, e as duas filas irmãs falhavam com dois desenhos diferentes.
      <div className="bg-stone-50" style={{ height: '100%', overflowY: 'auto', padding: isMobile ? '12px' : '32px' }}>
        <div role="alert" style={{ textAlign: 'center', padding: '32px 24px', margin: '24px auto', maxWidth: 460, background: '#ffffff', border: '1px solid #e7e5e4', borderRadius: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: '#fffbeb', border: '1px solid #fde68a', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
            <AlertCircle aria-hidden="true" style={{ width: 18, height: 18, color: '#b45309' }} />
          </div>
          <p style={{ fontSize: 15, fontWeight: 700, color: '#1c1917', margin: '0 0 6px', fontFamily: "'Space Grotesk', sans-serif" }}>Não foi possível carregar a fila de aprovação</p>
          <p style={{ fontSize: 13, color: '#746e69', lineHeight: 1.55, margin: '0 0 16px' }}>Nenhuma decisão foi perdida. Verifique sua conexão e tente novamente.</p>
          <button onClick={() => refetchItems()} style={{ height: 40, padding: '0 16px', borderRadius: 9, background: '#1c1917', color: '#ffffff', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <RotateCcw aria-hidden="true" style={{ width: 14, height: 14 }} /> Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-stone-50" style={{ height: "100%", overflowY: "auto", padding: isMobile ? "12px 12px" : "32px" }}>

      {/* ─── CABEÇALHO ───────────────────────────────────────────── */}
      <header className="mb-5 flex flex-col md:flex-row md:items-end justify-between gap-3 md:gap-6">
        <div className="max-w-2xl">
          {/* O TÍTULO É O NOME DO MENU, como nas outras telas desde a 2ª
              rodada ("Arte", "Painel Geral"): quem clicou em "Atendimento" na
              barra lateral caía numa página chamada "Aprovação do
              Patrocinador", com um sobretítulo laranja em versalete fazendo a
              ponte — dois nomes para o mesmo lugar. O que a tela FAZ desce para
              a linha de apoio, em 13px como nas demais. */}
          <h1 style={{
            fontFamily: "'Space Grotesk', sans-serif",
            // 26/700, a mesma escala da Gestão de Prazos. O `clamp` com peso
            // 900 fazia o título mudar de tamanho conforme a largura da
            // janela e o deixava mais pesado que qualquer número da tela.
            fontSize: FS.h1, fontWeight: 700,
            letterSpacing: '-0.03em', color: '#1c1917',
            lineHeight: 1.1, margin: '0 0 6px',
          }}>
            Atendimento
          </h1>
          <p style={{ color: '#746e69', fontSize: 13, fontWeight: 500, lineHeight: 1.5, maxWidth: 660, margin: 0 }}>
            Aprovação do patrocinador — decida cada arte com a marca e veja quem ainda falta responder.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          {/* O badge "Aguardam Aprovação" saiu daqui: era UM número para uma
              tela que responde a quatro perguntas, e virou o placar abaixo.

              No lugar dele, a idade do dado. Sem isto, uma aba aberta o dia
              inteiro nunca dizia de quando são os números que mostra. */}
          {!itemsLoading && !itemsError && (
            <span
              data-testid="selo-atualizado"
              title={new Date(dataUpdatedAt).toLocaleString("pt-BR")}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#746e69', whiteSpace: 'nowrap' }}
            >
              {isFetchingItems && <RotateCcw aria-hidden="true" className="animate-spin" style={{ width: 11, height: 11 }} />}
              Atualizado {fmtRelative(new Date(dataUpdatedAt).toISOString(), agora)}
            </span>
          )}
          {/* Exportar PDF — desabilita enquanto os dados de aprovação carregam:
              o pool de exportação depende deles e sairia vazio/incompleto. */}
          <button
            onClick={() => setShowExportPDFModal(true)}
            disabled={loadingSponsors}
            data-testid="button-export-pdf"
            title={loadingSponsors ? "Aguarde: carregando os dados de aprovação das peças" : "Exportar peças em PDF"}
            style={{
              height: isMobile ? 44 : 36, padding: '0 14px', borderRadius: 9,
              backgroundColor: '#ffffff', border: '1px solid #e7e5e4',
              color: '#57534e', cursor: loadingSponsors ? 'not-allowed' : 'pointer',
              opacity: loadingSponsors ? 0.5 : 1,
              display: 'flex', alignItems: 'center', gap: 6,
              fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
            }}
          >
            <FileText aria-hidden="true" style={{ width: 15, height: 15 }} />
            Exportar PDF
          </button>
        </div>
      </header>

      {/* ─── PLACAR POR SITUAÇÃO ─────────────────────────────────── */}
      {/* A tela mostrava UM número no cabeçalho ("Aguardam Aprovação") e a
          dimensão que de fato separa o trabalho — a SITUAÇÃO da peça —
          existia só como menu suspenso. Quem abre esta tela pergunta "o que
          depende de mim agora?", e a resposta estava fechada num dropdown.

          AS TRÊS PRIMEIRAS CÉLULAS SOMAM; A QUARTA NÃO.

          As três primeiras são chaves exclusivas de `situacaoDaPeca` —
          nenhuma peça conta em duas. A quarta é outra dimensão: "passaram do
          prazo" CRUZA com as outras (uma peça atrasada também é "aguardando"
          ou "nova versão"). Por isso ela é separada por uma régua mais forte
          e não entra em soma nenhuma. */}
      {activeTab === 'pending' && (
        <div style={{
          display: 'grid', marginBottom: 14,
          gridTemplateColumns: isMobile ? 'repeat(2, minmax(0,1fr))' : 'repeat(4, minmax(0,1fr))',
          backgroundColor: '#ffffff', border: '1px solid #e7e5e4', borderRadius: 12,
          overflow: 'hidden', boxShadow: '0 1px 2px rgba(28,25,23,0.06)',
        }}>
          {[
            { k: 'nova_versao', titulo: 'Sua decisão', n: contagemSituacao.get('nova_versao') ?? 0,
              cor: '#92400e', anel: '#b45309', hint: SITUACAO_META.nova_versao.hint,
              testId: 'placar-nova-versao', cruzada: false,
              ativo: situacaoFilter.length === 1 && situacaoFilter[0] === 'nova_versao',
              onClick: () => alternarSituacao('nova_versao') },
            { k: 'aguardando', titulo: 'Aguardam patrocinador', n: contagemSituacao.get('aguardando') ?? 0,
              cor: '#c2410c', anel: '#c2410c', hint: SITUACAO_META.aguardando.hint,
              testId: 'placar-aguardando', cruzada: false,
              ativo: situacaoFilter.length === 1 && situacaoFilter[0] === 'aguardando',
              onClick: () => alternarSituacao('aguardando') },
            { k: 'aguardando_arte', titulo: 'Arte refazendo', n: contagemSituacao.get('aguardando_arte') ?? 0,
              cor: '#57534e', anel: '#57534e', hint: SITUACAO_META.aguardando_arte.hint,
              testId: 'placar-arte-refazendo', cruzada: false,
              ativo: situacaoFilter.length === 1 && situacaoFilter[0] === 'aguardando_arte',
              onClick: () => alternarSituacao('aguardando_arte') },
            { k: 'atrasados', titulo: 'Passaram do prazo', n: atrasadosNaBase.length,
              cor: '#b91c1c', anel: '#b91c1c',
              hint: 'O prazo de Aprovação de Layout do evento já venceu — cruza com as outras três',
              testId: 'placar-atrasados', cruzada: true,
              ativo: atrasadosFilter,
              onClick: () => setAtrasadosFilter(v => !v) },
          ].map((c, i) => (
            <button
              key={c.k}
              type="button"
              onClick={c.onClick}
              aria-pressed={c.ativo}
              data-testid={c.testId}
              title={isMobile ? c.hint : undefined}
              style={{
                textAlign: 'left', cursor: 'pointer', minWidth: 0,
                padding: isMobile ? '12px 14px' : '14px 16px', border: 'none',
                // A quarta célula é de OUTRA dimensão. A régua mais forte
                // antes dela é o que impede o olho de somar as quatro.
                borderLeft: c.cruzada && !isMobile ? '1px solid #e7e5e4' : undefined,
                borderRight: (i + 1) % (isMobile ? 2 : 4) !== 0 ? '1px solid #f1f0ef' : undefined,
                borderBottom: isMobile && i < 2 ? '1px solid #f1f0ef' : undefined,
                backgroundColor: c.ativo ? '#fafaf9' : '#ffffff',
                boxShadow: c.ativo ? `inset 0 -2px 0 ${c.anel}` : 'none',
              }}
            >
              <span style={{
                display: 'block', fontSize: 10, fontWeight: 800, letterSpacing: '0.12em',
                textTransform: 'uppercase', color: '#746e69', marginBottom: 6,
              }}>
                {c.titulo}
              </span>
              <span style={{
                display: 'block', fontFamily: "'Space Grotesk', sans-serif",
                fontSize: isMobile ? 28 : 34, fontWeight: 700, lineHeight: 1,
                fontVariantNumeric: 'tabular-nums',
                // Zero é neutro: um "0" pintado de vermelho afirmaria o
                // contrário do que o número diz.
                color: c.n === 0 ? '#746e69' : c.cor,
              }}>
                {loadingSponsors ? '—' : c.n}
              </span>
              {/* O `hint` do SITUACAO_META como TEXTO, não como `title`: ele
                  explica o que o número significa e vivia só no hover do
                  menu — ou seja, existia para quem tem mouse e já sabia.
                  NO CELULAR ele vai para leitor de tela e `title`: em duas
                  colunas de ~180px cada frase quebrava em três ou quatro
                  linhas, o placar passava de 400px de altura e empurrava a
                  primeira peça para a segunda tela. O título da célula já diz
                  o essencial ("Sua decisão", "Arte refazendo"). */}
              <span className={isMobile ? 'sr-only' : undefined} style={isMobile ? undefined : { display: 'block', marginTop: 6, fontSize: 12, lineHeight: 1.45, color: '#746e69' }}>
                {c.hint}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* ─── ABAS + FILTROS, numa faixa só ───────────────────────── */}
      {/* A <section> cinza de 24px de padding que embrulhava os filtros saiu.
          Ela era um bloco de fundo diferente, com sombra própria, para
          hospedar cinco controles — e empurrava a primeira peça da lista para
          baixo da dobra numa tela de notebook. Os controles moram agora na
          mesma linha das abas, que é onde já se olha para trocar de recorte. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        {/* Segmentado sobre trilho. O ativo era sublinhado laranja de 2px num
            rodapé de 1px — o mesmo traço que a borda da faixa, e por isso
            fácil de perder. Padding só na horizontal: com 3px em cima e
            embaixo os botões cairiam para 30px, abaixo da régua de 36. */}
        {/* Setas ←/→ com roving tabindex: o contrato ARIA de tablist, o mesmo
            que a barra de fases da Arte já cumpre. Sem ele o Tab parava nas
            duas abas, uma a uma, antes de chegar à busca. */}
        <div role="tablist" aria-label="Abas de aprovação"
          onKeyDown={e => {
            if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
            e.preventDefault();
            const prox = activeTab === 'pending' ? 'history' : 'pending';
            setActiveTab(prox);
            (e.currentTarget.querySelector(`#tab-${prox}`) as HTMLElement | null)?.focus();
          }}
          style={{
          display: 'inline-flex', gap: 2, borderRadius: 10,
          backgroundColor: '#f0efee', padding: '0 3px', boxSizing: 'border-box',
          height: isMobile ? 44 : 36, flexShrink: 0,
        }}>
          {([
            // Mesma conta de antes (actionableCount): a aba e o placar contam
            // conjuntos diferentes de propósito — a aba diz quantas peças
            // pedem ação, o placar diz de que TIPO é cada uma.
            { key: 'pending', label: 'Pendentes', count: actionableCount },
            { key: 'history', label: 'Histórico', count: null },
          ] as const).map(tab => (
            <button
              key={tab.key}
              role="tab"
              id={`tab-${tab.key}`}
              aria-selected={activeTab === tab.key}
              aria-controls={`tabpanel-${tab.key}`}
              tabIndex={activeTab === tab.key ? 0 : -1}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: '0 14px', border: 'none', cursor: 'pointer', borderRadius: 8,
                backgroundColor: activeTab === tab.key ? '#ffffff' : 'transparent',
                color: activeTab === tab.key ? '#1c1917' : '#746e69',
                boxShadow: activeTab === tab.key ? '0 1px 2px rgba(28,25,23,0.08)' : 'none',
                fontSize: 13, fontWeight: 700,
                display: 'flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap',
              }}
            >
              {tab.label}
              {tab.count != null && (
                <span style={{ fontSize: 11, fontWeight: 700, color: '#746e69', fontVariantNumeric: 'tabular-nums' }}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {activeTab === 'pending' && (
          <>
            {/* No celular a busca divide a linha com o botão "Filtros" (mínimo
                de 160px, e o que sobrar é dela) em vez de ocupar uma linha só. */}
            <div style={{ position: 'relative', flex: isMobile ? '1 1 160px' : '0 1 240px', minWidth: isMobile ? 160 : undefined }}>
              <Search aria-hidden="true" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, color: '#746e69', pointerEvents: 'none' }} />
              <input
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="ID, tipo ou descrição..."
                aria-label="Buscar por ID, tipo ou descrição"
                data-testid="input-search"
                style={{
                  width: '100%', boxSizing: 'border-box',
                  // A busca não tinha borda: ela era um retângulo branco sobre
                  // o cinza da <section>. Sem a <section>, branco sobre branco
                  // deixaria de parecer campo.
                  height: isMobile ? 44 : 36, padding: '0 30px 0 32px', borderRadius: 9,
                  border: '1px solid #e7e5e4', backgroundColor: '#ffffff',
                  fontSize: 13, color: '#1c1917', outlineOffset: 2,
                }}
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm("")}
                  aria-label="Limpar busca"
                  style={{ position: 'absolute', right: 2, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#746e69', width: isMobile ? 40 : 28, height: isMobile ? 40 : 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <X aria-hidden="true" style={{ width: 14, height: 14 }} />
                </button>
              )}
            </div>

            {isMobile && (() => {
              const n = chipsAtivos.filter(c => c.key !== 'busca').length;
              return (
                <button
                  type="button"
                  onClick={() => setFiltrosAbertosMobile(v => !v)}
                  aria-expanded={filtrosAbertosMobile}
                  data-testid="button-toggle-filtros-mobile"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 44, padding: '0 14px', borderRadius: 9, border: `1px solid ${n > 0 ? '#fdba74' : '#e7e5e4'}`, background: n > 0 ? '#fff7ed' : '#ffffff', color: n > 0 ? '#9a3412' : '#1c1917', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
                >
                  Filtros{n > 0 ? ` · ${n}` : ''}
                  <ChevronDown aria-hidden="true" style={{ width: 14, height: 14, transform: filtrosAbertosMobile ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s' }} />
                </button>
              );
            })()}

            {(!isMobile || filtrosAbertosMobile) && (<>
            <EventFilterDropdown
              values={eventFilter}
              onValuesChange={setEventFilter}
              options={eventFilterOptions}
            />

            <FilterSelect
              label="Tipo de Entrega" allLabel="Todos os tipos"
              values={itemTypeFilter} onValuesChange={setItemTypeFilter}
              options={typeFilterOptions} showAllLabelWhenEmpty
              searchPlaceholder="Buscar tipo..." emptyText="Nenhum tipo encontrado."
              testId="select-type-filter"
            />

            {/* SITUAÇÃO — a dimensão que faltava. Sem ela não havia como
                perguntar "o que já voltou corrigido e está esperando por mim?",
                que é a pergunta que atrasou a peça #1527 por semanas. O menu
                continua aqui porque o placar oferece TRÊS das cinco chaves:
                "Reprovado" e "Aprovado" só se alcançam por ele. */}
            <FilterSelect
              label="Situação" allLabel="Todas as situações"
              values={situacaoFilter} onValuesChange={setSituacaoFilter}
              options={situacaoFilterOptions} hideSearch showAllLabelWhenEmpty
              panelWidth={260}
              testId="select-situacao-filter"
            />

            <FilterSelect
              label="Patrocinador" allLabel="Todos os Patrocinadores"
              values={sponsorFilter} onValuesChange={setSponsorFilter}
              options={sponsorFilterOptions} panelWidth={260}
              showAllLabelWhenEmpty
              searchPlaceholder="Buscar patrocinador..." emptyText="Nenhum patrocinador encontrado."
              testId="select-sponsor-filter"
            />

            {/* "Atrasado" aqui é medido contra o marco de APROVAÇÃO DE LAYOUT,
                nunca contra a saída do caminhão — ela é o prazo mais folgado do
                fluxo, semanas depois da data em que a decisão precisa existir.
                Ver lib/atendimento-prazo. */}
            <button
              onClick={() => setAtrasadosFilter(v => !v)}
              aria-pressed={atrasadosFilter}
              data-testid="button-filter-atrasados"
              title="Só peças cujo evento já passou do prazo de Aprovação de Layout"
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                height: isMobile ? 44 : 36, padding: '0 12px', borderRadius: 9,
                backgroundColor: atrasadosFilter ? '#991b1b' : '#ffffff',
                border: atrasadosFilter ? '1.5px solid #991b1b' : '1px solid #e7e5e4',
                color: atrasadosFilter ? '#ffffff' : '#1c1917',
                fontSize: 13, fontWeight: atrasadosFilter ? 600 : 400,
                cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              <Clock aria-hidden="true" style={{ width: 13, height: 13, flexShrink: 0 }} />
              Atrasados
              <span
                data-testid="badge-atrasados-count"
                // Contrastes (texto ≤13px exige 4,5:1): #991b1b sobre #fef2f2 =
                // 7,60:1 ✓ · #57534e sobre #f5f5f4 = 6,99:1 ✓ · branco sobre o
                // véu claro do estado ativo (≈#af4d4d) = 5,24:1 ✓
                style={{
                  padding: '1px 7px', borderRadius: 99, fontSize: 11, fontWeight: 700,
                  fontVariantNumeric: 'tabular-nums',
                  backgroundColor: atrasadosFilter ? 'rgba(255,255,255,0.22)' : atrasadosNaBase.length > 0 ? '#fef2f2' : '#f5f5f4',
                  color: atrasadosFilter ? '#ffffff' : atrasadosNaBase.length > 0 ? '#991b1b' : '#57534e',
                }}
              >
                {atrasadosNaBase.length}
              </span>
            </button>
            </>)}

            {/* "Limpar" em TEXTO: era um quadrado preto com um × dentro, do
                tamanho e do peso de uma ação primária, para desfazer filtro. */}
            {chipsAtivos.length > 0 && (
              <button
                onClick={limparFiltros}
                data-testid="button-clear-filters"
                style={{
                  height: isMobile ? 44 : 36, padding: '0 8px',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#c2410c', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
                }}
              >
                Limpar
              </button>
            )}

            {/* aria-live: é a confirmação de que o filtro pegou — quem não vê
                a lista encolher ouve "12 de 40 peças". */}
            <span
              data-testid="contador-pecas"
              aria-live="polite"
              style={{
                marginLeft: 'auto', fontSize: 12, color: '#746e69',
                fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
              }}
            >
              {filteredItems.length} de {pendingItems.length} peças
            </span>
          </>
        )}
      </div>

      {chipsAtivos.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
          {chipsAtivos.map(c => <FilterChip key={c.key} label={c.label} onRemove={c.onRemove} />)}
        </div>
      )}

      {/* ─── PAINEL DA ABA PENDENTES ─────────────────────────────── */}
      {activeTab === "pending" && <div role="tabpanel" id="tabpanel-pending" aria-labelledby="tab-pending">


      {/* ─── PAINEL DE LOTE ───────────────────────────────── */}
      {/* Sem papel de decisão: o painel vira uma faixa informativa — os
          controles de lote não fariam nada além de devolver 403. */}
      {!loadingSponsors && batchEligibleSponsors.length > 0 && !canDecide && (
        <section
          data-testid="section-batch-readonly"
          style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', backgroundColor: '#fafaf9', border: '1px solid #e7e5e4', borderRadius: 12 }}
        >
          <Eye style={{ width: 16, height: 16, color: '#746e69', flexShrink: 0 }} />
          <p style={{ fontSize: 13, fontWeight: 600, color: '#57534e', margin: 0 }}>
            Somente leitura — as decisões de aprovação são do Atendimento.
          </p>
        </section>
      )}
      {/* Colapsado por padrão: uma barra de 1 linha; expande no clique e a
          escolha persiste na sessão. */}
      {!loadingSponsors && batchEligibleSponsors.length > 0 && canDecide && !batchPanelOpen && (
        <button
          onClick={() => setBatchPanelOpen(true)}
          aria-expanded={false}
          data-testid="button-batch-panel-expand"
          style={{
            width: '100%', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12,
            padding: '14px 18px', backgroundColor: '#ffffff', border: '1px solid #e7e5e4',
            borderRadius: 12, cursor: 'pointer', textAlign: 'left',
          }}
        >
          {/* Ladrilho NEUTRO. O gradiente laranja virou tinta numa rodada
              anterior; tinta ainda era o segundo bloco mais escuro da tela,
              logo acima do "Decidir em fila" — que é a ação do dia. Um atalho
              recolhido não pode pesar mais que ela. */}
          <div style={{ width: 26, height: 26, borderRadius: 8, backgroundColor: '#f5f5f4', border: '1px solid #e7e5e4', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Zap aria-hidden="true" style={{ width: 14, height: 14, color: '#57534e' }} />
          </div>
          <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 14, fontWeight: 800, letterSpacing: '-0.01em', color: '#1c1917', whiteSpace: 'nowrap' }}>
            Aprovação em lote
          </span>
          <span style={{ fontSize: 13, color: '#746e69', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            — {batchEligibleSponsors.length} {batchEligibleSponsors.length === 1 ? 'patrocinador com pendências' : 'patrocinadores com pendências'}
          </span>
          <ChevronRight style={{ width: 16, height: 16, color: '#a8a29e', marginLeft: 'auto', flexShrink: 0 }} />
        </button>
      )}
      {!loadingSponsors && batchEligibleSponsors.length > 0 && canDecide && batchPanelOpen && (
        <section
          data-testid="section-batch-sponsor"
          style={{ marginBottom: 20, backgroundColor: '#ffffff', border: '1px solid #e7e5e4', borderRadius: 12 }}
        >
          {/* ── Header do painel — clique recolhe de volta para a barra ── */}
          <div
            role="button"
            tabIndex={0}
            aria-expanded={true}
            title="Recolher painel de lote"
            onClick={() => setBatchPanelOpen(false)}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setBatchPanelOpen(false);
              }
            }}
            data-testid="button-batch-panel-collapse"
            /* FAIXA CLARA. O cabeçalho era um bloco quase preto com gradiente,
               um ladrilho laranja com sombra colorida e três bolinhas — a coisa
               mais pesada da página, para um painel auxiliar que fica ACIMA da
               lista de peças que a tela existe para mostrar. */
            style={{ backgroundColor: '#fafaf9', borderBottom: '1px solid #e7e5e4', padding: isMobile ? '14px 16px' : '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, borderRadius: '12px 12px 0 0', flexWrap: isMobile ? 'wrap' : 'nowrap', cursor: 'pointer' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 26, height: 26, borderRadius: 8, backgroundColor: '#1c1917', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Zap style={{ width: 14, height: 14, color: '#ffffff' }} />
              </div>
              <div>
                <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 14, fontWeight: 700, letterSpacing: '-0.01em', margin: 0, color: '#1c1917' }}>
                  Aprovação em lote
                </h3>
                <p style={{ color: '#746e69', fontSize: 12, margin: 0 }}>
                  {batchEligibleSponsors.length} {batchEligibleSponsors.length === 1 ? 'patrocinador com' : 'patrocinadores com'} itens pendentes
                </p>
              </div>
            </div>
            {/* Indicador de progresso */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {[
                { n: 1, label: 'Patrocinador', done: !!batchSponsorId },
                { n: 2, label: 'Evento', done: !!batchEventId },
                { n: 3, label: 'Revisão', done: batchItemCount > 0 && !!batchEventId },
              ].map((step, idx) => {
                const active = idx === 0 ? !batchSponsorId : idx === 1 ? !!batchSponsorId && !batchEventId : !!batchSponsorId && !!batchEventId;
                return (
                  <Fragment key={step.n}>
                    {/* Pílula, e não bolinha + texto solto: o passo é UMA coisa
                        (número, nome e estado) e era desenhado como duas. */}
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      height: 24, padding: '0 9px', borderRadius: 999,
                      fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
                      backgroundColor: step.done ? '#f0fdf4' : active ? '#fff7ed' : '#f5f5f4',
                      color: step.done ? '#15803d' : active ? '#c2410c' : '#746e69',
                    }}>
                      {step.done
                        ? <Check aria-hidden="true" style={{ width: 11, height: 11, flexShrink: 0 }} />
                        : <span style={{ fontVariantNumeric: 'tabular-nums' }}>{step.n}</span>}
                      {step.label}
                    </span>
                    {idx < 2 && <div style={{ width: 16, height: 1, background: step.done ? '#86efac' : '#e7e5e4' }} />}
                  </Fragment>
                );
              })}
              <ChevronDown style={{ width: 16, height: 16, color: '#746e69', marginLeft: 10, flexShrink: 0 }} />
            </div>
          </div>

          <div style={{ padding: isMobile ? '16px 14px' : '20px 28px', background: '#fafaf9' }}>
            {/* ── Seletores: Patrocinador + Evento — usando FilterSelect idêntico aos filtros do topo ── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
              <FilterSelect
                label="Patrocinador"
                allLabel="Patrocinador..."
                value={batchSponsorId || "all"}
                onChange={v => {
                  const next = v === "all" ? "" : v;
                  setBatchSponsorId(next);
                  setBatchEventId("");
                  setBatchShowRejectForm(false);
                  setBatchRejectReason("");
                }}
                options={[...batchEligibleSponsors]
                  .sort((a: any, b: any) => a.name.localeCompare(b.name, 'pt-BR'))
                  .map((s: any) => ({ value: s.id, label: s.name, dotColor: s.color || '#a8a29e' }))}
                searchPlaceholder="Buscar patrocinador..."
                emptyText="Nenhum patrocinador encontrado."
                hideWhenEmpty={false}
                showAllLabelWhenEmpty
                testId="select-batch-sponsor"
                panelWidth={280}
                hideClear
              />
              <FilterSelect
                label="Evento"
                allLabel={batchSponsorId
                  ? (batchEligibleEvents.length > 0 ? `${batchEligibleEvents.length} evento${batchEligibleEvents.length !== 1 ? 's' : ''} disponível${batchEligibleEvents.length !== 1 ? 'is' : ''}` : 'Nenhum evento')
                  : 'Selecione o patrocinador antes'}
                value={batchEventId || "all"}
                onChange={v => {
                  const next = v === "all" ? "" : v;
                  setBatchEventId(next);
                  setBatchShowRejectForm(false);
                  setBatchRejectReason("");
                }}
                options={batchEligibleEvents.map((ev: any) => ({ value: ev.id, label: ev.name }))}
                searchPlaceholder="Buscar evento..."
                emptyText="Nenhum evento encontrado."
                hideWhenEmpty={false}
                showAllLabelWhenEmpty
                disabled={!batchSponsorId}
                testId="select-batch-event"
                panelWidth={300}
                hideClear
              />
            </div>

            {/* ── Área de itens ── */}
            {batchSponsorId && batchEventId ? (
              batchItemCount === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '36px 0', gap: 10, backgroundColor: '#f9f9f8', borderRadius: 12, border: '1px dashed #e7e5e4' }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <CheckCircle style={{ width: 22, height: 22, color: '#16a34a' }} />
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <p style={{ fontSize: 15, fontWeight: 700, color: '#1c1917', margin: '0 0 4px' }}>Tudo aprovado</p>
                    <p style={{ fontSize: 13, color: '#746e69', margin: 0 }}>Nenhuma peça pendente para esta combinação</p>
                  </div>
                </div>
              ) : (
                <>
                  {/* Barra de seleção + contadores */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, padding: '10px 14px', backgroundColor: '#fafaf9', borderRadius: 8, border: '1px solid #f0ede8' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, fontWeight: 700, color: '#1c1917', cursor: 'pointer', userSelect: 'none' }}>
                      <input
                        type="checkbox"
                        checked={batchSelectedItemIds.size === batchItemCount && batchItemCount > 0}
                        onChange={e => {
                          if (e.target.checked) setBatchSelectedItemIds(new Set(batchEligibleItems.map((i: any) => i.id)));
                          else setBatchSelectedItemIds(new Set());
                        }}
                        style={{ accentColor: '#ea580c', width: 15, height: 15, cursor: 'pointer' }}
                      />
                      Selecionar todos
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      {batchEligibleItems.filter((i: any) => !i.approvalThumbUrl).length > 0 && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#b45309', fontWeight: 600, background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 999, padding: '2px 10px' }}>
                          <AlertCircle style={{ width: 11, height: 11 }} />
                          {batchEligibleItems.filter((i: any) => !i.approvalThumbUrl).length} sem arte
                        </span>
                      )}
                      <span style={{ fontSize: 13, fontWeight: 700, color: batchSelectedItemIds.size > 0 ? '#ea580c' : '#746e69' }}>
                        {batchSelectedItemIds.size} / {batchItemCount} selecionadas
                      </span>
                    </div>
                  </div>

                  {/* Lista de itens */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20, maxHeight: 340, overflowY: 'auto', paddingRight: 2 }}>
                    {batchEligibleItems.map((item: any) => {
                      const isChecked = batchSelectedItemIds.has(item.id);
                      const hasThumb = !!item.approvalThumbUrl;
                      return (
                        <div
                          key={item.id}
                          data-testid={`batch-item-row-${item.id}`}
                          onClick={() => setBatchSelectedItemIds(prev => {
                            const next = new Set(prev);
                            if (next.has(item.id)) next.delete(item.id);
                            else next.add(item.id);
                            return next;
                          })}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 12,
                            padding: '10px 14px',
                            backgroundColor: isChecked ? '#fff7ed' : '#ffffff',
                            border: `1.5px solid ${isChecked ? '#fb923c' : '#f0ede8'}`,
                            borderRadius: 12, cursor: 'pointer',
                            transition: 'border-color 0.12s, background-color 0.12s',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            data-testid={`checkbox-batch-item-${item.id}`}
                            // O clique no checkbox NÃO pode subir para o card: o card
                            // também alterna, e os dois toggles se anulavam — por isso
                            // clicar na caixinha parecia não desmarcar.
                            onClick={e => e.stopPropagation()}
                            onChange={() => setBatchSelectedItemIds(prev => {
                              const next = new Set(prev);
                              if (next.has(item.id)) next.delete(item.id);
                              else next.add(item.id);
                              return next;
                            })}
                            style={{ accentColor: '#ea580c', width: 15, height: 15, cursor: 'pointer', flexShrink: 0 }}
                          />
                          {/* Thumbnail — clique abre a arte em tamanho grande */}
                          <div
                            onClick={e => { if (hasThumb) { e.stopPropagation(); setBatchPreviewItem(item); } }}
                            data-testid={`batch-thumb-${item.id}`}
                            title={hasThumb ? 'Clique para ver a arte' : 'Sem arte enviada'}
                            className={hasThumb ? 'group' : undefined}
                            style={{ width: 52, height: 52, borderRadius: 8, backgroundColor: hasThumb ? '#f0ede8' : '#f4f4f3', flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${hasThumb ? 'rgba(0,0,0,0.06)' : '#e7e5e4'}`, position: 'relative', cursor: hasThumb ? 'zoom-in' : 'default' }}
                          >
                            {hasThumb ? (
                              <>
                                <img
                                  src={miniatura(item.approvalThumbUrl)}
                                  alt=""
                                  loading="lazy"
                                  decoding="async"
                                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                  onError={(e) => {
                                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                                    const fb = (e.currentTarget as HTMLImageElement).nextElementSibling as HTMLElement | null;
                                    if (fb?.dataset.fallback) fb.style.display = 'flex';
                                  }}
                                />
                                <div data-fallback="1" style={{ display: 'none', position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', background: '#f4f4f3', flexDirection: 'column', gap: 2 }}>
                                  <Package style={{ width: 16, height: 16, color: '#c4bfbb' }} />
                                  <span style={{ fontSize: 11, color: '#746e69', fontWeight: 600, letterSpacing: '0.03em' }}>SEM ARTE</span>
                                </div>
                                <span
                                  style={{ position: 'absolute', inset: 0, background: 'rgba(28,25,23,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, transition: 'opacity 0.12s' }}
                                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = '1'}
                                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = '0'}
                                >
                                  <Eye style={{ width: 16, height: 16, color: '#fff' }} />
                                </span>
                              </>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                                <Package style={{ width: 18, height: 18, color: '#c4bfbb' }} />
                                <span style={{ fontSize: 11, color: '#746e69', fontWeight: 600, letterSpacing: '0.03em' }}>SEM ARTE</span>
                              </div>
                            )}
                          </div>
                          {/* Info */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                              {/* Código em cinza mono, como no card da fila: o selo
                                  laranja repetido em cada linha do lote gastava a
                                  cor de atenção num dado que só identifica. */}
                              <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12, fontWeight: 700, color: '#746e69', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                                {item.displayId}
                              </span>
                              <SeloKit peca={item} style={{ flexShrink: 0 }} />
                              <span style={{ fontSize: 13, fontWeight: 700, color: '#1c1917', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {item.type}
                              </span>
                            </div>
                            {item.description && (
                              <p style={{ fontSize: 11, color: '#746e69', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {item.description}
                              </p>
                            )}
                          </div>
                          {/* Só o que PEDE atenção: "Sem arte". O selo verde
                              "Arte OK" em toda linha com arte era a regra, não a
                              exceção — e a miniatura ao lado já mostra a arte. */}
                          {!hasThumb && (
                            <div style={{ flexShrink: 0 }}>
                              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#92400e', fontWeight: 700, background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 999, padding: '2px 8px' }}>
                                <AlertCircle aria-hidden="true" style={{ width: 11, height: 11 }} /> Sem arte
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* ── Ações ── */}
                  {!batchShowRejectForm ? (
                    <div style={{ display: 'flex', alignItems: isMobile ? 'stretch' : 'center', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', padding: '14px 16px', background: '#fafaf9', borderRadius: 12, border: '1px solid #f0ede8', gap: isMobile ? 10 : 0 }}>
                      <p style={{ fontSize: 13, color: '#746e69', margin: 0 }}>
                        {batchSelectedItemIds.size > 0
                          ? <><strong style={{ color: '#1c1917' }}>{batchSelectedItemIds.size} {batchSelectedItemIds.size === 1 ? 'peça' : 'peças'}</strong> prontas para decisão</>
                          : 'Selecione peças para aprovar ou reprovar'}
                      </p>
                      <div style={{ display: 'flex', gap: 10, flexDirection: isMobile ? 'column' : 'row' }}>
                        <button
                          onClick={() => setBatchShowRejectForm(true)}
                          disabled={batchSponsorMutation.isPending || batchSelectedItemIds.size === 0 || !canDecide}
                          title={!canDecide ? "Somente Atendimento e administradores decidem aprovações" : undefined}
                          data-testid="button-batch-reject"
                          // "Reprovar", não "Recusar": é a palavra do modal de
                          // decisão, do placar e do toast desta mesma ação — o
                          // lote era o único lugar da tela que dizia "recusa".
                          // Mesma altura do "Aprovar" ao lado (40 × 36 antes),
                          // e #b91c1c no rótulo (#dc2626 fica abaixo de AA).
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                            backgroundColor: '#ffffff', color: '#b91c1c',
                            border: '1px solid #fca5a5', borderRadius: 9,
                            height: isMobile ? 44 : 36, padding: '0 16px', fontSize: 13, fontWeight: 700,
                            cursor: batchSelectedItemIds.size === 0 ? 'not-allowed' : 'pointer',
                            opacity: batchSelectedItemIds.size === 0 ? 0.5 : 1,
                            transition: 'filter 0.15s',
                          }}
                          onMouseEnter={e => { if (batchSelectedItemIds.size > 0) e.currentTarget.style.filter = 'brightness(0.96)'; }}
                          onMouseLeave={e => { e.currentTarget.style.filter = 'none'; }}
                        >
                          <XCircle style={{ width: 15, height: 15 }} />
                          Reprovar
                        </button>
                        <button
                          onClick={() => setConfirmApproveBatch(true)}
                          disabled={batchSponsorMutation.isPending || batchSelectedItemIds.size === 0 || !canDecide}
                          title={!canDecide ? "Somente Atendimento e administradores decidem aprovações" : undefined}
                          data-testid="button-batch-approve"
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                            // TINTA, não verde.
                            //
                            // O botão era um gradiente verde com sombra verde —
                            // e nesta tela verde é o ESTADO 'aprovado', o que a
                            // peça vira depois. Pintar de verde o botão que
                            // ainda vai decidir usa a cor do resultado para o
                            // pedido, e deixa a ação mais chamativa que o
                            // próprio dado da lista.
                            background: batchSelectedItemIds.size === 0 ? '#f5f5f4' : '#1c1917',
                            // O branco era fixo: sobre o fundo do estado
                            // desabilitado o rótulo simplesmente sumia.
                            color: batchSelectedItemIds.size === 0 ? '#57534e' : '#ffffff',
                            border: 'none', borderRadius: 9,
                            height: isMobile ? 44 : 36, padding: '0 18px', fontSize: 13, fontWeight: 700,
                            cursor: batchSelectedItemIds.size === 0 ? 'not-allowed' : 'pointer',
                            letterSpacing: '-0.01em', fontFamily: "'Space Grotesk', sans-serif",
                            transition: 'filter 0.15s',
                          }}
                          onMouseEnter={e => { if (batchSelectedItemIds.size > 0) e.currentTarget.style.filter = 'brightness(0.9)'; }}
                          onMouseLeave={e => { e.currentTarget.style.filter = 'none'; }}
                        >
                          {batchSponsorMutation.isPending
                            ? <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" />
                            : <CheckCircle style={{ width: 14, height: 14 }} />}
                          Aprovar {batchSelectedItemIds.size > 0 ? `${batchSelectedItemIds.size} ${batchSelectedItemIds.size === 1 ? 'peça' : 'peças'}` : ''}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ backgroundColor: '#fef2f2', border: '1.5px solid #fca5a5', borderRadius: 12, padding: '18px 20px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                        <div style={{ width: 32, height: 32, borderRadius: 8, background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <XCircle style={{ width: 16, height: 16, color: '#dc2626' }} />
                        </div>
                        <div>
                          {/* PARA QUEM, no título (rodada 4) — e #b91c1c no
                              texto: #dc2626 fica abaixo de AA sobre o rosa. */}
                          <p style={{ fontSize: 13, fontWeight: 800, color: '#b91c1c', margin: 0 }}>Reprovar {batchSelectedItemIds.size} {batchSelectedItemIds.size === 1 ? 'peça' : 'peças'} para {batchSponsorNome}</p>
                          <p style={{ fontSize: 11, color: '#991b1b', margin: 0 }}>O mesmo motivo vai para todas; a Arte refaz e {batchSponsorNome} e os patrocinadores com aprovação estrita esperam a nova versão</p>
                        </div>
                      </div>
                      {/* autoFocus: quem clicou "Reprovar" vai escrever o motivo —
                          sem o foco ali era um segundo clique obrigatório.
                          Ctrl+Enter confirma pela MESMA trava do botão (mínimo de
                          caracteres, mutação em curso, papel), como nos motivos
                          da Revisão e do Vincular. */}
                      <textarea
                        autoFocus
                        value={batchRejectReason}
                        onChange={e => setBatchRejectReason(e.target.value)}
                        onKeyDown={e => {
                          if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey)) return;
                          e.preventDefault();
                          if (batchSponsorMutation.isPending || motivoCurto(batchRejectReason) || !canDecide) return;
                          batchSponsorMutation.mutate({ sponsorId: batchSponsorId, eventId: batchEventId, action: "reject", reason: batchRejectReason });
                        }}
                        placeholder="Descreva o que a Arte precisa refazer…"
                        data-testid="textarea-batch-reject-reason"
                        aria-label={`Motivo da reprovação das ${batchSelectedItemIds.size} peças selecionadas`}
                        aria-required="true"
                        aria-describedby="falta-motivo-lote"
                        rows={3}
                        style={{
                          width: '100%', backgroundColor: '#ffffff',
                          border: `1.5px solid ${motivoCurto(batchRejectReason) ? '#e7e5e4' : '#dc2626'}`,
                          color: '#1c1917', borderRadius: 8, padding: '10px 12px',
                          fontSize: 13, resize: 'vertical',
                          boxSizing: 'border-box', lineHeight: 1.5,
                        }}
                      />
                      {/* Quanto falta, à vista — a régua só existia no `title`
                          do botão (hover, só no desktop). Mesma frase do motivo
                          individual no modal de decisão. */}
                      <p id="falta-motivo-lote" style={{ margin: '5px 0 0', fontSize: 11.5, color: motivoCurto(batchRejectReason) ? '#746e69' : '#57534e' }}>
                        {motivoCurto(batchRejectReason)
                          ? (batchRejectReason.trim()
                              ? `Faltam ${Math.max(0, MOTIVO_MIN - batchRejectReason.trim().replace(/\s+/g, " ").length)} caracteres — a Arte precisa saber o que refazer.`
                              : `Mínimo de ${MOTIVO_MIN} caracteres — a Arte precisa saber o que refazer.`)
                          : <>Pronto. <kbd style={KBD}>Ctrl</kbd>+<kbd style={KBD}>Enter</kbd> confirma.</>}
                      </p>
                      <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                        <button
                          onClick={() => { setBatchShowRejectForm(false); setBatchRejectReason(""); }}
                          style={{ backgroundColor: '#ffffff', color: '#57534e', border: '1px solid #e7e5e4', borderRadius: 9, height: isMobile ? 44 : 36, padding: '0 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={() => batchSponsorMutation.mutate({ sponsorId: batchSponsorId, eventId: batchEventId, action: "reject", reason: batchRejectReason })}
                          disabled={batchSponsorMutation.isPending || motivoCurto(batchRejectReason) || !canDecide}
                          title={!canDecide ? "Somente Atendimento e administradores decidem aprovações"
                            : motivoCurto(batchRejectReason) ? `Explique em pelo menos ${MOTIVO_MIN} caracteres — a Arte precisa saber o que refazer.` : undefined}
                          data-testid="button-batch-confirm-reject"
                          // A aparência segue a MESMA régua do `disabled`
                          // (motivoCurto) — o mesmo conserto que o motivo
                          // individual recebeu na 1ª rodada. Olhava só "vazio":
                          // com 1 a 9 caracteres o botão ficava vermelho, parecia
                          // pronto e não respondia; e desabilitado tinha letra
                          // BRANCA sobre #e7e5e4 (1,2:1).
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                            backgroundColor: motivoCurto(batchRejectReason) ? '#e7e5e4' : '#b91c1c',
                            color: motivoCurto(batchRejectReason) ? '#57534e' : '#ffffff', border: 'none', borderRadius: 9,
                            height: isMobile ? 44 : 36, padding: '0 18px', fontSize: 13, fontWeight: 700,
                            cursor: motivoCurto(batchRejectReason) ? 'not-allowed' : 'pointer',
                          }}
                        >
                          {batchSponsorMutation.isPending
                            ? <Loader2 style={{ width: 13, height: 13 }} className="animate-spin" />
                            : <XCircle style={{ width: 13, height: 13 }} />}
                          Reprovar e devolver à Arte
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )
            ) : (
              /* Estado vazio — orientação de uso */
              <div style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '20px 24px', backgroundColor: '#fff7ed', borderRadius: 12, border: '1px solid #fed7aa' }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: '#ffffff', border: '1px solid #fed7aa', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Zap aria-hidden="true" style={{ width: 16, height: 16, color: '#c2410c' }} />
                </div>
                <div>
                  <p style={{ fontSize: 15, fontWeight: 700, color: '#9a3412', margin: '0 0 3px' }}>
                    {batchSponsorId ? 'Selecione o evento' : 'Selecione o patrocinador'}
                  </p>
                  <p style={{ fontSize: 13, color: '#c2410c', margin: 0, lineHeight: 1.5, opacity: 0.8 }}>
                    {batchSponsorId
                      ? `${batchEligibleEvents.length} evento${batchEligibleEvents.length !== 1 ? 's' : ''} com peças pendentes para o patrocinador selecionado.`
                      : `${batchEligibleSponsors.length} patrocinador${batchEligibleSponsors.length !== 1 ? 'es' : ''} aguardam decisão — escolha um para iniciar o lote.`}
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ─── GRID DE CARDS (bento-style) ─────────────────────────── */}
      {filteredItems.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '64px 0' }} data-testid="empty-atendimento">
          {/* Regua dos vazios da casa: icone 28, titulo 15/700, frase 13. Era
              48/18/15 — um vazio desenhado com mais peso visual que qualquer
              card de peca da lista cheia. */}
          {/* Ícone por MOTIVO do vazio: o check verde dizia "tudo certo"
              também quando eram os filtros escondendo a fila inteira. */}
          {pendingItems.length > 0 && !atrasadosFilter
            ? <Search aria-hidden="true" style={{ width: 28, height: 28, color: '#746e69', margin: '0 auto 12px' }} />
            : <CheckCircle aria-hidden="true" style={{ width: 28, height: 28, color: '#15803d', margin: '0 auto 12px' }} />}
          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1c1917', margin: '0 0 6px' }}>
            {atrasadosFilter
              ? "Nada atrasado neste recorte"
              : pendingItems.length === 0 ? "Nenhuma peça pendente" : "Nenhuma peça neste recorte"}
          </h3>
          {/* Vazio por causa do recorte de atrasados tem texto próprio: com o
              filtro ligado, "Nenhuma peça pendente" leria como "nada a fazer"
              enquanto a fila inteira continua ali, dentro do prazo. E o vazio
              por filtro diz QUANTAS peças ficaram de fora, em vez do genérico
              "tente ajustar os filtros". */}
          <p style={{ color: '#746e69', fontSize: 13, lineHeight: 1.5, maxWidth: 520, margin: '0 auto' }} data-testid="empty-atendimento-motivo">
            {atrasadosFilter
              ? `A lista está vazia pelo FILTRO "Atrasados" — ${filteredItemsBase.length === 0 ? 'os demais filtros já não devolvem nenhuma peça' : `as ${filteredItemsBase.length} peças deste recorte estão todas dentro do prazo de Aprovação de Layout`}.`
              : pendingItems.length === 0
              ? "Nenhuma peça aguarda aprovação do patrocinador agora."
              : `${pendingItems.length} ${pendingItems.length === 1 ? 'peça pendente ficou' : 'peças pendentes ficaram'} fora ${chipsAtivos.length === 1 ? 'do filtro ativo' : `dos ${chipsAtivos.length} filtros ativos`}.`}
          </p>
          {/* O texto apontava para os filtros, mas o "Limpar" morava lá em
              cima, na faixa das abas — a saída fica ao lado do problema. */}
          {!atrasadosFilter && pendingItems.length > 0 && chipsAtivos.length > 0 && (
            <button
              onClick={limparFiltros}
              data-testid="button-clear-filters-empty"
              style={{ marginTop: 16, height: 40, padding: '0 18px', borderRadius: 8, border: '1px solid #e7e5e4', background: '#ffffff', color: '#1c1917', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
            >
              Limpar {chipsAtivos.length === 1 ? 'o filtro' : `os ${chipsAtivos.length} filtros`}
            </button>
          )}
          {atrasadosFilter && (
            <button
              onClick={() => setAtrasadosFilter(false)}
              data-testid="button-clear-atrasados-empty"
              style={{ marginTop: 16, height: 40, padding: '0 18px', borderRadius: 8, border: 'none', background: '#0c0a09', color: '#ffffff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
            >
              Mostrar todas as peças
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>

          {/* Grupo: Pendentes */}
          {/* ── A ORDEM, DECLARADA ─────────────────────────────────────────
              A lista sempre teve uma ordem e a tela nunca a disse. Sem a regra
              à vista, ninguém entende por que uma peça é a terceira — e não há
              como pedir outra quando a pergunta muda ("o que vence primeiro?"
              / "o que espera por mim?"). A regra fica escrita ao lado dos
              alternadores, não escondida num tooltip. */}
          {pendingGroup.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#746e69', flexShrink: 0 }}>
                Ordem
              </span>
              <div role="group" aria-label="Ordem da lista" style={{ display: 'flex', gap: 6, overflowX: 'auto', maxWidth: '100%', paddingBottom: 2 }}>
                {([['prazo', 'Prazo de aprovação'], ['mesa', 'Peças na sua mesa'], ['evento', 'Nome do evento']] as const).map(([valor, rotulo]) => {
                  const ativo = ordemPendentes === valor;
                  return (
                    <button
                      key={valor}
                      type="button"
                      aria-pressed={ativo}
                      data-testid={`toggle-ordem-${valor}`}
                      onClick={() => setOrdemPendentes(valor)}
                      style={{
                        height: isMobile ? 44 : 30, padding: '0 12px', borderRadius: 8, cursor: 'pointer',
                        fontFamily: 'inherit', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0,
                        border: `1px solid ${ativo ? '#fdba74' : '#e7e5e4'}`,
                        backgroundColor: ativo ? '#fff7ed' : '#ffffff',
                        color: ativo ? '#9a3412' : '#57534e',
                      }}
                    >
                      {rotulo}
                    </button>
                  );
                })}
              </div>
              <span style={{ fontSize: 12, color: '#57534e' }}>{ORDEM_REGRA[ordemPendentes]}</span>

              {/* UM grupo à direita. Os dois botões tinham `marginLeft: auto`
                  cada um: com os dois na tela (admin) o espaço livre se dividia
                  entre eles e "Decidir em fila" — a ação do dia — boiava no
                  meio da linha, longe da borda onde o olho a procura. */}
              <div style={{ marginLeft: isMobile ? 0 : 'auto', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', width: isMobile ? '100%' : undefined }}>
              {/* O DISPARO À MÃO DO AVISO DA GESTÃO. Discreto de propósito e
                  encostado à direita: é ferramenta de manutenção, não parte do
                  trabalho de decidir — quem entra aqui para aprovar não deve
                  tropeçar nele. */}
              {user?.role === "admin" && (
                <button
                  type="button"
                  data-testid="button-avisar-gestao"
                  onClick={() => avisarGestaoMutation.mutate()}
                  disabled={avisarGestaoMutation.isPending}
                  title="Manda agora o resumo das aprovações pendentes para quem recebe o aviso das 10h, 15h e 18h. Se não houver pendência, nada é enviado."
                  style={{
                    height: isMobile ? 44 : 36, padding: '0 12px', borderRadius: 8,
                    border: '1px solid #e7e5e4', backgroundColor: '#ffffff', color: '#57534e',
                    cursor: avisarGestaoMutation.isPending ? 'wait' : 'pointer',
                    fontFamily: 'inherit', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
                    display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0,
                    opacity: avisarGestaoMutation.isPending ? 0.6 : 1,
                  }}
                >
                  <Send style={{ width: 13, height: 13 }} />
                  {avisarGestaoMutation.isPending ? 'Enviando…' : 'Avisar a gestão'}
                </button>
              )}

              {/* ── A FILA, ALCANÇÁVEL ────────────────────────────────────────
                  A fila de decisão existia só DENTRO do modal (navegação no
                  cabeçalho e "Próxima peça" no rodapé) e não havia porta de
                  entrada: era preciso caçar a primeira peça na lista e abri-la.
                  Some quando não há nada esperando por você — botão que não faz
                  nada é ruído. */}
              {filaDaSuaMesa.length > 0 && (
                <button
                  type="button"
                  data-testid="button-fila-decisao"
                  onClick={() => { setSelectedItem(filaDaSuaMesa[0]); setDialogOpen(true); }}
                  title="Abre a primeira peça que espera decisão sua; do modal dá para seguir para a próxima"
                  // 36px, a régua dos primários da casa (era 32), e largura
                  // inteira no celular: é a porta da fila.
                  style={{
                    height: isMobile ? 44 : 36, padding: '0 16px', borderRadius: 9,
                    border: 'none', backgroundColor: '#1c1917', color: '#ffffff', cursor: 'pointer',
                    fontFamily: 'inherit', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, flexShrink: 0,
                    flex: isMobile ? '1 1 auto' : undefined,
                  }}
                >
                  <Play aria-hidden="true" style={{ width: 13, height: 13 }} />
                  Decidir {filaDaSuaMesa.length === 1 ? 'a peça' : `as ${filaDaSuaMesa.length}`} em fila
                </button>
              )}
              {/* A FILA INTEIRA (rodada 4). A porta acima só existe para "nova
                  versão"; as peças que aguardam patrocinador — a maior parte do
                  dia — ficavam atrás de eventos RECOLHIDOS: abrir o evento,
                  achar a peça, Revisar. Esta abre a primeira da lista, na ordem
                  da tela, e o modal segue com "Próxima peça". Quando há peça na
                  sua mesa ela é secundária (contorno); sem, é a ação do dia. */}
              {reviewQueue.length > filaDaSuaMesa.length && (
                <button
                  type="button"
                  data-testid="button-fila-inteira"
                  onClick={() => { setSelectedItem(reviewQueue[0]); setDialogOpen(true); }}
                  title="Abre a primeira peça da lista, na ordem escolhida; do modal dá para seguir peça a peça sem voltar"
                  style={{
                    height: isMobile ? 44 : 36, padding: '0 16px', borderRadius: 9,
                    border: filaDaSuaMesa.length > 0 ? '1px solid #e7e5e4' : 'none',
                    backgroundColor: filaDaSuaMesa.length > 0 ? '#ffffff' : '#1c1917',
                    color: filaDaSuaMesa.length > 0 ? '#1c1917' : '#ffffff', cursor: 'pointer',
                    fontFamily: 'inherit', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, flexShrink: 0,
                    flex: isMobile ? '1 1 auto' : undefined,
                  }}
                >
                  <Play aria-hidden="true" style={{ width: 13, height: 13 }} />
                  {filaDaSuaMesa.length > 0 ? `Toda a fila (${reviewQueue.length})` : reviewQueue.length === 1 ? 'Revisar a peça' : `Revisar as ${reviewQueue.length} em fila`}
                </button>
              )}
              </div>
            </div>
          )}

          {/* FRONTEIRA DE RENDER dos grupos (ver SoQuandoMudar): o motivo da
              reprovação, a busca de patrocinador e a trava pós-avanço vivem
              neste componente — sem ela cada tecla no modal refazia todos os
              grupos e cards da fila. `deps` = tudo o que os grupos leem. */}
          <SoQuandoMudar
            deps={[pendingGroup, itemsByEvent, events, expandedEvents, isMobile, hoje, agora, itemApprovalsMap, itemSponsorsMap, typeToGroup, loadingSponsors]}
            render={() => (<>
          {pendingGroup.length > 0 && Array.from(itemsByEvent.entries()).map(([eventId, eventItems]) => {
            const ev = getEventInfo(eventId);
            // ALTURA ESTIMADA do grupo, para o navegador reservar o espaço sem
            // desenhar o conteúdo. Sem uma estimativa próxima, a barra de
            // rolagem pula enquanto se rola — o remédio ficaria pior que a
            // doença. 128px é o cabeçalho do evento; ~104px é a altura média de
            // uma linha de peça com thumb.
            // Recolhido, o grupo é só o cabeçalho: reservar a altura das peças
            // deixaria um buraco do tamanho do evento embaixo dele.
            const alturaEstimada = eventoAberto(eventId)
              ? 128 + eventItems.length * 104
              : 128;
            return (
              /* CONTENT-VISIBILITY: AUTO — o grupo fora da tela não é
                 desenhado, mas CONTINUA NO DOM. É o que permite abrir todos os
                 eventos de uma vez sem travar: o navegador pula layout e pintura
                 do que ninguém está vendo, e o Ctrl+F, o leitor de tela e os
                 links continuam funcionando — o que uma lista virtualizada
                 quebraria. */
              <div
                key={eventId}
                style={{
                  contentVisibility: "auto",
                  containIntrinsicSize: `auto ${alturaEstimada}px`,
                } as React.CSSProperties}
              >
                {/* Group Header — recolhe/expande o evento.
                    Era só onClick num <div>: recolher grupo, que é o principal
                    recurso de navegação desta tela, existia apenas para quem
                    usa mouse. */}
                <div
                  role="button"
                  tabIndex={0}
                  aria-expanded={eventoAberto(eventId)}
                  onClick={() => toggleEventCollapsed(eventId)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggleEventCollapsed(eventId);
                    }
                  }}
                  data-testid={`toggle-event-${eventId}`}
                  title={eventoAberto(eventId) ? 'Recolher evento' : 'Expandir evento'}
                  // NO CELULAR a linha QUEBRA: nome, selo de prazo por extenso e
                  // contagem numa fileira `nowrap` pediam ~600px; em 390 o nome
                  // encolhia a zero e o resto vazava para a direita, com rolagem
                  // lateral na página inteira.
                  style={{
                    display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 16,
                    flexWrap: isMobile ? 'wrap' : 'nowrap',
                    paddingBottom: isMobile ? 12 : 16, marginBottom: isMobile ? 12 : 16,
                    minHeight: 44,
                    borderBottom: '1px solid #e7e5e4',
                    cursor: 'pointer', userSelect: 'none',
                  }}
                >
                  <ChevronDown
                    aria-hidden="true"
                    style={{
                      width: 16, height: 16, color: '#746e69', flexShrink: 0,
                      transform: eventoAberto(eventId) ? 'none' : 'rotate(-90deg)',
                      transition: 'transform 0.15s',
                    }}
                  />
                  {/* O ponto laranja "evento com itens aguardando aprovação"
                      saiu: TODO grupo desta lista tem itens aguardando — é a
                      definição da aba —, então ele não distinguia grupo nenhum. */}
                  {/* <h2> e não <h4>: a página tem um <h1> e pulava direto para
                      o nível 4, o que faz o leitor de tela anunciar dois níveis
                      que não existem. O card da peça abaixo é <h3>. */}
                  <h2 title={ev?.name || undefined} style={{
                    fontFamily: "'Space Grotesk', sans-serif",
                    // 16/700: o nome do evento estava em 18/800, mais pesado
                    // que o próprio <h1> da tela em peso e a um ponto dele em
                    // tamanho — e ele se repete a cada grupo da lista.
                    fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em',
                    color: '#1c1917', margin: 0, minWidth: 0,
                    flex: isMobile ? '1 1 calc(100% - 32px)' : '0 1 auto',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {ev?.name || 'Sem Evento'}
                    {ev?.startDate && (
                      <span style={{ color: '#746e69', fontWeight: 500, marginLeft: 10, fontSize: 12 }}>
                        {format(parseDateLocal(ev.startDate), "MMMM yyyy", { locale: ptBR })}
                      </span>
                    )}
                  </h2>
                  {(() => {
                    // Marco de Aprovação de Layout — regra única em
                    // lib/atendimento-prazo, a mesma do filtro "Atrasados" e do
                    // cabeçalho do modal. `hoje` é a âncora estável da tela.
                    const p = prazoAprovacaoLayout(ev, hoje);
                    if (!p) return null;
                    const diff = p.diff;
                    const ds = p.dia.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
                    // A MESMA régua do semáforo de marco da Arte, que passa AA
                    // nos quatro degraus. As cores daqui eram próprias e
                    // reprovavam justamente nos dois estados que mais pedem
                    // leitura: "vence hoje" (#D97A1E sobre #FEF3E7 ≈ 2,9:1) e
                    // "vence em até 3 dias" (#C97B4B sobre #FDF0E8 ≈ 3,2:1).
                    const s = diff < 0
                      ? { bg: '#fee2e2', border: '#fca5a5', text: '#991b1b' }
                      : diff === 0
                      ? { bg: '#fef3c7', border: '#fcd34d', text: '#92400e' }
                      : diff <= 3
                      ? { bg: '#ffedd5', border: '#fdba74', text: '#9a3412' }
                      : { bg: '#f5f5f4', border: '#e7e5e4', text: '#57534e' };
                    // POR EXTENSO. O selo dizia "Aprovação de Layout · 06/08
                    // (13d)" e deixava a leitura mais importante — se já venceu
                    // ou ainda falta — só no TOM DA COR. Quem não distingue o
                    // vermelho do âmbar lia a mesma frase nos dois casos
                    // (WCAG 1.4.1). O "(13d)" entre parênteses e com opacidade
                    // 0.7 também não dizia se eram dias passados ou futuros.
                    const dias = Math.abs(diff);
                    const plural = dias === 1 ? 'dia' : 'dias';
                    const texto = diff < 0
                      ? `Aprovação de Layout venceu ${ds} · há ${dias} ${plural}`
                      : diff === 0
                        ? `Aprovação de Layout vence hoje · ${ds}`
                        : `Aprovação de Layout vence ${ds} · em ${dias} ${plural}`;
                    return (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0, backgroundColor: s.bg, border: `1px solid ${s.border}`, borderRadius: 999, padding: '3px 10px', fontSize: 11, fontWeight: 700, color: s.text, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                        {texto}
                      </span>
                    );
                  })()}
                  {/* "3 NA SUA MESA" — o número que decide por onde começar.

                      O grupo dizia só quantas peças tem, e uma pilha de 14 é
                      indistinguível de outra pilha de 14 quando o que importa
                      é quantas dependem de VOCÊ agora. É a mesma conta da
                      primeira célula do placar, no grão do evento. */}
                  <span style={{ marginLeft: isMobile ? 0 : 'auto', display: 'flex', alignItems: 'baseline', gap: 6, flexShrink: 0, whiteSpace: 'nowrap' }}>
                    <span style={{ fontSize: 12, color: '#746e69', fontVariantNumeric: 'tabular-nums' }}>
                      {eventItems.length} {eventItems.length === 1 ? 'peça' : 'peças'}
                    </span>
                    {(() => {
                      const naMesa = eventItems.filter((i: any) => situacaoDaPeca(itemApprovalsMap[i.id]) === "nova_versao").length;
                      if (naMesa === 0) return null;
                      return (
                        <span
                          data-testid={`grupo-na-sua-mesa-${eventId}`}
                          style={{ fontSize: 12, fontWeight: 700, color: '#92400e', fontVariantNumeric: 'tabular-nums' }}
                        >
                          · {naMesa} na sua mesa
                        </span>
                      );
                    })()}
                  </span>
                </div>

                {/* Cards — montados SÓ com o evento aberto. Antes o grupo
                    recolhido escondia as peças com `display: none`, mas elas
                    continuavam no DOM e em cada render: com os eventos todos
                    fechados (o padrão), ~500 cards invisíveis — thumb, chips,
                    selos — eram refeitos a cada tecla da busca. Escondido por
                    display:none já não entrava no Ctrl+F nem no leitor de tela,
                    então não montar não tira nada de quem usa. */}
                {eventoAberto(eventId) && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {eventItems.map((item, idx) => {
                    const itemSps = itemSponsorsMap[item.id] || [];
                    const approvals: SponsorApproval[] = itemApprovalsMap[item.id] || [];
                    const isFullyApproved = isItemFullyApproved(item);
                    const hasArteBlock = approvals.some(a => a.status === 'awaiting_arte');
                    // A Arte JÁ devolveu e o arquivo espera reenvio — o oposto
                    // de `hasArteBlock`, e o único estado em que a bola é daqui.
                    const temNovaVersao = approvals.some(a => a.status === 'new_version_pending');
                    const hasThumb = !!item.approvalThumbUrl;
                    const prevItem = idx > 0 ? eventItems[idx - 1] : null;
                    const showTypeHeader = !prevItem || prevItem.type !== item.type;
                    const itemGroupName = typeToGroup[item.type] || '';
                    const prevItemGroupName = prevItem ? (typeToGroup[prevItem.type] || '') : '';
                    const showGroupHeader = showTypeHeader && itemGroupName !== '' && itemGroupName !== prevItemGroupName;

                    return (
                      <Fragment key={item.id}>
                        {/* GRUPO e TIPO num rótulo só.

                            Eram duas linhas com régua, uma com barrinha laranja
                            e outra prefixada por "Tipo:", empilhadas — quatro
                            elementos gráficos e 30px de altura para dizer
                            "COMUNICAÇÃO VISUAL · BACKDROP". Numa lista de 40
                            peças isso se repete dezenas de vezes.

                            `showGroupHeader` implica `showTypeHeader`, então a
                            condição do tipo cobre as duas. */}
                        {showTypeHeader && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0 2px' }}>
                            <span style={{ fontSize: 10, fontWeight: 800, color: '#746e69', textTransform: 'uppercase', letterSpacing: '0.12em', whiteSpace: 'nowrap' }}>
                              {[itemGroupName, item.type].filter(Boolean).join(" · ")}
                            </span>
                            <div style={{ flex: 1, height: 1, background: '#f1f0ef' }} />
                          </div>
                        )}
                      {/* O CARD.

                          Fora: `inset 4px 0 0` fazia o trilho de estado, e a
                          sombra dupla no hover redesenhava o trilho junto —
                          duas declarações da mesma coisa em três lugares. Aqui
                          o card tem borda de 1px e um `borderLeft` de 3px no
                          tom da SITUAÇÃO, o mesmo vocabulário do card da
                          Gestão de Prazos.

                          `opacity: 0.75` saiu dos aprovados: quem está
                          resolvido perde a COR, não a legibilidade — o texto
                          cinza sobre branco a 75% reprovava contraste. */}
                      <div
                        key={`card-${item.id}`}
                        data-testid={`row-item-${item.id}`}
                        className="group"
                        style={{
                          backgroundColor: hasArteBlock ? '#fafaf9' : '#ffffff',
                          borderRadius: 12,
                          border: '1px solid #e7e5e4',
                          borderLeft: `3px solid ${isFullyApproved ? "#d6d3d1" : hasArteBlock ? "#a8a29e" : temNovaVersao ? "#b45309" : "#f97316"}`,
                          overflow: 'hidden',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: isMobile ? 'flex-start' : 'center', padding: isMobile ? 14 : 18, gap: isMobile ? 12 : 20, flexWrap: isMobile ? 'wrap' : 'nowrap' }}>

                          {/* Thumb 72 e não 80: o card ganhou uma terceira
                              linha de texto e a miniatura passou a ser o
                              elemento mais alto dele. */}
                          {/* A miniatura ABRE a revisão. Ela já acendia um olho
                              no hover — prometia o clique e não o entregava. O
                              botão "Revisar" continua sendo a porta por teclado
                              (por isso aria-hidden aqui: não é um segundo alvo
                              de Tab para a mesma ação). */}
                          <div
                            aria-hidden="true"
                            onClick={() => handleViewDetails(item)}
                            style={{
                            width: isMobile ? 52 : 72, height: isMobile ? 52 : 72, flexShrink: 0, borderRadius: 10,
                            overflow: 'hidden', backgroundColor: '#f5f5f4', position: 'relative',
                            border: '1px solid #e7e5e4', cursor: 'pointer',
                          }}>
                            {hasThumb ? (
                              <>
                                <img
                                  src={miniatura(item.approvalThumbUrl)}
                                  alt=""
                                  loading="lazy"
                                  decoding="async"
                                  style={{
                                    width: '100%', height: '100%', objectFit: 'cover',
                                    filter: isFullyApproved ? 'grayscale(1)' : 'grayscale(0)',
                                  }}
                                  onError={(e) => {
                                    (e.currentTarget as HTMLImageElement).style.display = "none";
                                    const fb = (e.currentTarget as HTMLImageElement).nextElementSibling as HTMLElement | null;
                                    if (fb?.dataset.fallback) fb.style.display = "flex";
                                  }}
                                />
                                <div data-fallback="1" style={{ display: 'none', position: 'absolute', inset: 0, flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, background: '#f5f5f4' }}>
                                  <ImageIcon aria-hidden="true" style={{ width: 18, height: 18, color: '#a8a29e' }} />
                                  <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', color: '#746e69' }}>SEM ARTE</span>
                                </div>
                                {!isFullyApproved && (
                                  <div style={{
                                    position: 'absolute', inset: 0,
                                    backgroundColor: 'rgba(0,0,0,0.35)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    opacity: 0, transition: 'opacity 0.2s',
                                  }}
                                    className="group-hover:opacity-100"
                                  >
                                    <Eye style={{ width: 18, height: 18, color: '#fff' }} />
                                  </div>
                                )}
                              </>
                            ) : (
                              // O vazio era um ícone de documento e mais nada:
                              // não dava para saber se a arte não existe ou se
                              // a imagem falhou ao carregar. Agora ele diz.
                              <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
                                <ImageIcon aria-hidden="true" style={{ width: 18, height: 18, color: '#a8a29e' }} />
                                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', color: '#746e69' }}>SEM ARTE</span>
                              </div>
                            )}
                          </div>

                          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0,2fr) minmax(0,1.4fr) auto', gap: isMobile ? 10 : 18, alignItems: isMobile ? 'stretch' : 'center', minWidth: 0 }}>

                            {/* IDENTIDADE em três linhas: o que é, o que diz o
                                pedido, e quem tem de aprovar. Antes o código e
                                a descrição dividiam UMA linha de 11px em caixa
                                alta — "#3524 • BACKDROP FUNDO PALCO" lido como
                                um rótulo só. */}
                            <div style={{ minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                                <span style={{
                                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                                  fontSize: 12, fontWeight: 700, color: '#746e69',
                                  fontVariantNumeric: 'tabular-nums', flexShrink: 0,
                                }}>
                                  {item.displayId}
                                </span>
                                <SeloKit peca={item} style={{ flexShrink: 0, alignSelf: 'center' }} />
                                <h3 title={item.type} style={{ fontSize: 14, fontWeight: 700, color: '#1c1917', margin: 0, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {item.type}
                                </h3>
                                {item.isReuse && (
                                  <span title="Peça de reaproveitamento" style={{ fontSize: 11, fontWeight: 600, backgroundColor: '#dcfce7', color: '#166534', borderRadius: 999, padding: '1px 8px', flexShrink: 0 }}>
                                    Reaproveitamento
                                  </span>
                                )}
                                {/* ONDE A PEÇA ESTÁ. O tipo já carregava o status e o card não o
                                    mostrava: é ele que diz se a decisão que falta ainda cabe no
                                    prazo ou se a peça já seguiu sem ela. */}
                                {(() => {
                                  const meta = getStatusMeta(statusDeExibicao(item));
                                  if (!meta) return null;
                                  return (
                                    // Caixa normal em 11px (era versalete de 10px
                                    // com espaçamento): numa lista de dezenas de
                                    // cards, era a terceira coisa em maiúsculas
                                    // da mesma linha, ao lado do código e do tipo.
                                    <span data-testid={`selo-status-${item.id}`} title={`A peça está em "${meta.label}" — é daqui que ela sai quando a decisão que falta chegar${descricaoDoStatus(item.status) ? `\n${descricaoDoStatus(item.status)}` : ''}`}
                                      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0, fontSize: 11, fontWeight: 600, color: meta.text, backgroundColor: meta.bg, border: `1px solid ${meta.border}`, borderRadius: 4, padding: '1px 6px', whiteSpace: 'nowrap' }}>
                                      <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: meta.dot, flexShrink: 0 }} />
                                      {meta.short}
                                    </span>
                                  );
                                })()}
                                {/* IDADE NA FASE (UX 27/08): a MESMA régua 7/14
                                    da Arte e da Gráfica — quem cobra patrocinador
                                    precisa ver há quanto tempo a decisão espera. */}
                                {(() => {
                                  const d = diasNaFase(item, new Date());
                                  if (d === null || d < 1) return null;
                                  const tom = tomDaIdade(d);
                                  return <span title={`Está neste status há ${d} dia(s)`} style={{ flexShrink: 0, fontSize: 10.5, fontFamily: "'DM Mono', monospace", fontWeight: tom.peso, color: tom.cor }}>há {d}d</span>;
                                })()}
                              </div>
                              <p title={item.description || undefined} style={{ fontSize: 12, color: '#746e69', margin: '3px 0 0', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {item.description || 'Sem descrição'}
                                {item.quantity != null && (
                                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>{' · '}{item.quantity} un.</span>
                                )}
                                {item.referenceUrl && (
                                  // Link INLINE: era um chip azul com moldura,
                                  // a única coisa azul da tela inteira, do
                                  // tamanho de um selo de status ao lado de
                                  // selos de status — e não é status nenhum.
                                  <>
                                    {' · '}
                                    <a
                                      href={hrefSeguro(item.referenceUrl)}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={e => e.stopPropagation()}
                                      title="Ver referência visual do solicitante"
                                      data-testid={`link-reference-atendimento-${item.id}`}
                                      style={{ color: '#c2410c', fontWeight: 600, textDecoration: 'underline' }}
                                    >
                                      ref. visual
                                    </a>
                                  </>
                                )}
                              </p>
                              <div style={{ marginTop: 6, minWidth: 0, overflow: 'hidden' }}>
                                {loadingSponsors ? (
                                  <span style={{ fontSize: 12, color: '#746e69' }}>carregando patrocinadores…</span>
                                ) : (
                                  <SponsorChips sponsors={sponsorsWithStatus(item)} variant="colored" size="sm" max={2} />
                                )}
                              </div>
                            </div>

                            {/* SITUAÇÃO em duas linhas: o rótulo e o RELÓGIO.

                                O selo sozinho dizia o estado e escondia a idade
                                dele — "Ag. Revisão" com uma bolinha pulsando é
                                igual no dia 1 e no dia 40. A segunda linha diz
                                há quanto tempo e quem falta.

                                A idade vem de `approvalThumbUpdatedAt`, que o
                                schema define como "quando o thumb foi trocado
                                pela Arte": no primeiro envio é quando a peça
                                ficou disponível para o patrocinador; num
                                reenvio é quando a Arte devolveu corrigida. As
                                duas leituras são o mesmo campo, cada uma no seu
                                contexto — e nenhuma delas é inventada. */}
                            <div style={{ minWidth: 0 }}>
                              {(() => {
                                const sit = situacaoDaPeca(approvals);
                                const tom = isFullyApproved ? "#57534e"
                                  : sit === "nova_versao" ? "#92400e"
                                  : sit === "aguardando_arte" ? "#57534e"
                                  : sit === "reprovado" ? "#b91c1c"
                                  : "#c2410c";
                                const desde = item.approvalThumbUpdatedAt
                                  ? fmtRelative(new Date(item.approvalThumbUpdatedAt).toISOString(), agora)
                                  : null;
                                const responderam = approvals.filter(a => a.status !== "pending").length;
                                const quemFaltaAqui = quemFalta(item);
                                const relogio = isFullyApproved
                                  ? "todos os patrocinadores aprovaram"
                                  : sit === "nova_versao"
                                    ? (desde ? `a Arte corrigiu ${desde} — a peça espera sua decisão` : "a Arte corrigiu — a peça espera sua decisão")
                                  : sit === "aguardando_arte"
                                    // Comunicado afinado (dono, 31/08): "nada a fazer"
                                    // era mentira quando OUTROS patrocinadores ainda
                                    // podiam ser decididos — só quem reprovou espera.
                                    ? (quemFaltaAqui.length > 0
                                        ? `quem reprovou espera a nova arte — ${fraseDeQuemFalta(quemFaltaAqui)} e pode(m) ser decidido(s) agora`
                                        : "quem reprovou espera a nova arte — você é avisado quando ela chegar")
                                  : `${desde ? `enviada ${desde} · ` : ""}${quemFaltaAqui.length > 0 ? fraseDeQuemFalta(quemFaltaAqui) : `${responderam} de ${approvals.length} responderam`}`;
                                return (
                                  <>
                                    <span
                                      data-testid={`situacao-${item.id}`}
                                      style={{ display: "block", fontSize: 12, fontWeight: 700, color: tom, lineHeight: 1.3 }}
                                    >
                                      {isFullyApproved ? "Aprovado" : SITUACAO_META[sit].label}
                                    </span>
                                    <span style={{ display: "block", marginTop: 3, fontSize: 12, color: "#746e69", lineHeight: 1.4 }}>
                                      {relogio}
                                    </span>
                                  </>
                                );
                              })()}
                            </div>

                            {/* A AÇÃO. Tinta sólida SÓ quando a bola é sua.

                                Todos os cards traziam o mesmo botão cinza que
                                virava LARANJA INTEIRO no hover — a peça que
                                espera você e a peça que não depende de você
                                convidavam com a mesma força, e a força era a de
                                uma ação primária. */}
                            <div style={{ display: 'flex', justifyContent: isMobile ? 'stretch' : 'flex-end' }}>
                              {(() => {
                                const primaria = temNovaVersao && !isFullyApproved;
                                // Com a Arte também é 'Revisar' (31/08): lá dentro
                                // existe ação agora — aprovar mesmo assim a versão antiga.
                                const rotulo = isFullyApproved ? "Ver histórico"
                                  : primaria ? "Revisar agora" : "Revisar";
                                return (
                                  <button
                                    onClick={() => handleViewDetails(item)}
                                    data-testid={isFullyApproved ? `button-history-${item.id}` : `button-view-${item.id}`}
                                    style={{
                                      height: isMobile ? 44 : 36, padding: "0 16px", borderRadius: 9,
                                      backgroundColor: primaria ? "#1c1917" : "#ffffff",
                                      border: primaria ? "1px solid #1c1917" : "1px solid #e7e5e4",
                                      color: primaria ? "#ffffff" : "#1c1917",
                                      fontSize: 12, fontWeight: 700, cursor: "pointer",
                                      display: "flex", alignItems: "center", gap: 6,
                                      width: isMobile ? "100%" : undefined,
                                      justifyContent: isMobile ? "center" : undefined,
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    {rotulo}
                                    <Eye aria-hidden="true" style={{ width: 13, height: 13 }} />
                                  </button>
                                );
                              })()}
                            </div>
                          </div>
                        </div>
                      </div>
                      </Fragment>
                    );
                  })}
                </div>
                )}
              </div>
            );
          })}
          </>)} />

          {/* Sem "Carregar mais" na fila: a lista chega inteira. O botão
              paginava PEÇAS antes do agrupamento, então escondia eventos —
              e a pergunta desta tela é "onde há coisa esperando", que uma
              lista parcial responde errado. O Histórico mantém a paginação:
              lá a lista é ilimitada e ninguém a varre inteira. */}

          {/* O grupo "Aprovados" FOI REMOVIDO (dono, 24/08): peça com todos os
                        patrocinadores aprovados já aparece na aba Histórico — que é o
                        lugar dela — e o grupo verde no fim da fila era a mesma
                        informação dita duas vezes, sem dizer o que era. Revogar uma
                        decisão continua possível pelo Histórico. */}
        </div>
      )}
      </div>}

      {/* ─── ABA HISTÓRICO ──────────────────────────────────────── */}
      {activeTab === "history" && (() => {
        const evById = new Map((events as any[]).map((e: any) => [e.id, e]));
        const FL: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: '#746e69', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 };
        const SEL = (active: boolean): React.CSSProperties => ({
          height: 38, border: `1.5px solid ${active ? '#c2610c' : '#e7e5e4'}`,
          borderRadius: 8, fontSize: 13, fontWeight: 500, background: '#fff',
          color: active ? '#c2610c' : '#374151', cursor: 'pointer',
        });
        const periodOptions = [
          { value: '7d',  label: 'Últimos 7 dias' },
          { value: '30d', label: 'Últimos 30 dias' },
          { value: '90d', label: 'Últimos 90 dias' },
        ];
        // As opções dos dois menus saem do MESMO pool da lista (ver
        // `casaHistorico`, acima) — aqui elas eram o sistema inteiro.
        const hasHistFilters = histEventFilter.length > 0 || histSponsorFilter.length > 0 || histPeriodFilter !== "all";

        return (
          <div role="tabpanel" id="tabpanel-history" aria-labelledby="tab-history">
            {/* ── A ORDEM DO HISTÓRICO ────────────────────────────────────────
                Numa tela de auditoria a pergunta costuma ser "o que demorou", e
                a única ordem possível era por data. A regra fica escrita ao
                lado, como na aba Pendentes. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#746e69', flexShrink: 0 }}>Ordem</span>
              <div role="group" aria-label="Ordem do histórico" style={{ display: 'flex', gap: 6, overflowX: 'auto', maxWidth: '100%', paddingBottom: 2 }}>
                {([['recentes', 'Mais recentes'], ['demoradas', 'Mais demoradas'], ['evento', 'Nome do evento']] as const).map(([valor, rotulo]) => {
                  const ativo = ordemHistorico === valor;
                  return (
                    <button key={valor} type="button" aria-pressed={ativo} data-testid={`toggle-ordem-hist-${valor}`}
                      onClick={() => setOrdemHistorico(valor)}
                      style={{
                        height: isMobile ? 44 : 30, padding: '0 12px', borderRadius: 8, cursor: 'pointer',
                        fontFamily: 'inherit', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0,
                        border: `1px solid ${ativo ? '#fdba74' : '#e7e5e4'}`,
                        backgroundColor: ativo ? '#fff7ed' : '#ffffff',
                        color: ativo ? '#9a3412' : '#57534e',
                      }}>
                      {rotulo}
                    </button>
                  );
                })}
              </div>
              <span style={{ fontSize: 12, color: '#57534e' }}>{ORDEM_HIST_REGRA[ordemHistorico]}</span>
            </div>

            {/* ── Barra de filtros ── */}
            <div style={{
              background: '#fafaf9', borderRadius: 12,
              border: '1px solid #ece9e6',
              padding: '12px 16px', marginBottom: 20,
              display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
            }}>
              {/* Busca */}
              <div style={{ flex: '1 1 180px', minWidth: 160, position: 'relative' }}>
                <Search style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 15, height: 15, color: '#a8a29e' }} />
                <input
                  value={histSearchTerm}
                  onChange={e => setHistSearchTerm(e.target.value)}
                  placeholder="ID, tipo ou descrição..."
                  aria-label="Buscar no histórico por ID, tipo ou descrição"
                  style={{
                    width: '100%', paddingLeft: 36, paddingRight: histSearchTerm ? 32 : 12, paddingTop: 9, paddingBottom: 9,
                    backgroundColor: '#ffffff', borderRadius: 8, border: '1px solid #e7e5e4',
                    fontSize: 13, fontWeight: 500, color: '#1c1917',
                    boxSizing: 'border-box',
                  }}
                />
                {histSearchTerm && (
                  <button onClick={() => setHistSearchTerm("")} aria-label="Limpar busca" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#746e69' }}>
                    <X style={{ width: 13, height: 13 }} />
                  </button>
                )}
              </div>
              <div style={{ width: 1, height: 24, background: '#e7e5e4', flexShrink: 0 }} />
              <EventFilterDropdown values={histEventFilter} onValuesChange={setHistEventFilter} options={histEventOptions} />
              <FilterSelect showAllLabelWhenEmpty label="Patrocinador" allLabel="Todos os patrocinadores"
                values={histSponsorFilter} onValuesChange={setHistSponsorFilter}
                options={histSponsorOptions} />
              <FilterSelect showAllLabelWhenEmpty label="Período" allLabel="Todos os períodos"
                value={histPeriodFilter} onChange={setHistPeriodFilter}
                options={periodOptions} />
              {(hasHistFilters || histSearchTerm) && (
                <button
                  onClick={() => { setHistEventFilter([]); setHistSponsorFilter([]); setHistPeriodFilter("all"); setHistSearchTerm(""); }}
                  // Contorno, não bloco preto: é a mesma regra do "Limpar" da aba
                  // Pendentes — desfazer filtro não é ação primária, e o bloco
                  // cheio era o objeto mais escuro da aba de auditoria.
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    height: isMobile ? 44 : 36, padding: '0 12px',
                    backgroundColor: '#ffffff', color: '#1c1917',
                    border: '1px solid #e7e5e4', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600,
                  }}
                >
                  <X aria-hidden="true" style={{ width: 13, height: 13 }} /> Limpar filtros
                </button>
              )}
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
                {loadingSponsors
                  ? <Loader2 style={{ width: 14, height: 14, color: '#a8a29e' }} className="animate-spin" />
                  : <span style={{ fontSize: 13, color: '#746e69', fontWeight: 600 }}>
                      {historyItems.length} {historyItems.length === 1 ? 'resultado' : 'resultados'}
                    </span>}
              </div>
            </div>

            {/* ── Lista ── */}
            {loadingSponsors ? (
              // Silhueta, como a fila de Pendentes e a Arte: o spinner solto de
              // 32px não dizia o que carregava nem onde o conteúdo ia aparecer.
              <EsqueletoDeFila linhas={6} comCabecalho={false} />
            ) : historyItems.length === 0 ? (
              // A régua dos vazios da casa (ícone 28, título 15, frase 13) e o
              // ícone pelo MOTIVO: o check verde afirmava "tudo certo" também
              // quando eram os filtros escondendo o histórico. A saída mora ao
              // lado do problema, não só na barra de cima.
              <div style={{ textAlign: 'center', padding: '56px 0' }}>
                {(hasHistFilters || histSearchTerm)
                  ? <Search aria-hidden="true" style={{ width: 28, height: 28, color: '#746e69', margin: '0 auto 12px' }} />
                  : <Clock aria-hidden="true" style={{ width: 28, height: 28, color: '#746e69', margin: '0 auto 12px' }} />}
                <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1c1917', margin: '0 0 6px' }}>
                  {(hasHistFilters || histSearchTerm) ? 'Nenhuma peça neste recorte' : 'Ainda não há histórico'}
                </h3>
                <p style={{ color: '#746e69', fontSize: 13, lineHeight: 1.5, margin: '0 auto', maxWidth: 460 }}>
                  {(hasHistFilters || histSearchTerm)
                    ? 'Nenhuma peça aprovada combina com a busca e os filtros atuais.'
                    : 'As peças aparecem aqui assim que algum patrocinador aprovar.'}
                </p>
                {(hasHistFilters || histSearchTerm) && (
                  <button
                    onClick={() => { setHistEventFilter([]); setHistSponsorFilter([]); setHistPeriodFilter("all"); setHistSearchTerm(""); }}
                    style={{ marginTop: 16, height: 40, padding: '0 18px', borderRadius: 8, border: '1px solid #e7e5e4', background: '#ffffff', color: '#1c1917', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
                  >
                    Limpar filtros
                  </button>
                )}
              </div>
            ) : (
              // UMA superfície com linhas, no lugar de N cards soltos.
              //
              // Cada peça era um card com borda, raio 12, sombra dupla e mais
              // sombra no hover, separado por 10px de vão — cinquenta molduras
              // para cinquenta linhas de uma lista que já está ordenada e é
              // lida de cima para baixo. O que distingue uma linha da outra é
              // o TRILHO do estado, não a moldura.
              <div style={{
                backgroundColor: '#ffffff', border: '1px solid #e7e5e4',
                borderRadius: 12, overflow: 'hidden',
              }}>
                {historyItems.slice(0, histVisible).map((item: any, iLinha: number) => {
                  const ev = evById.get(item.eventId);
                  const itemSps: any[] = itemSponsorsMap[item.id] || [];
                  const approvals: SponsorApproval[] = itemApprovalsMap[item.id] || [];
                  // Badge de status pela lib canônica: mesmo rótulo e cores das
                  // outras telas (status desconhecido cai no fallback neutro).
                  // Molde produzido: "Produzido (molde)", não o "Impresso/Acabamento" da peça comum.
                  const statusCfg = getStatusMeta(statusDeExibicao(item));

                  const sponsorApprovals = itemSps.map(sp => {
                    const appr = approvals.find(a => a.sponsorId === sp.id);
                    return { sponsor: sp, appr };
                  });
                  // ordenar: aprovados → nova versão → reprovados → aguardando
                  const sortedApprovals = [...sponsorApprovals].sort((a, b) => {
                    const order = (s?: string) => s === 'approved' ? 0 : s === 'new_version_pending' ? 1 : s === 'rejected' ? 2 : 3;
                    return order(a.appr?.status) - order(b.appr?.status);
                  });
                  const approvedOnes = sponsorApprovals.filter(x => x.appr?.status === 'approved');
                  const allApproved  = approvedOnes.length === sponsorApprovals.length && sponsorApprovals.length > 0;

                  const fmtDt = (d: string | Date | null | undefined, short = false) => {
                    if (!d) return null;
                    return format(new Date(d), short ? "dd/MM" : "dd/MM/yy 'às' HH:mm", { locale: ptBR });
                  };
                  // Mesmo cálculo do sort da lista (Math.max sobre timestamps):
                  // o sort de string anterior quebrava com formatos mistos de data.
                  const approvedTimes = approvedOnes
                    .map(x => (x.appr?.approvedAt ? new Date(x.appr.approvedAt).getTime() : 0))
                    .filter(t => t > 0);
                  const lastApprovedAt = approvedTimes.length ? new Date(Math.max(...approvedTimes)) : null;
                  const lastApprovedBy = approvedOnes.length > 0
                    ? [...approvedOnes].sort((a, b) => {
                        const ta = a.appr?.approvedAt ? new Date(a.appr.approvedAt).getTime() : 0;
                        const tb = b.appr?.approvedAt ? new Date(b.appr.approvedAt).getTime() : 0;
                        return tb - ta; // devolve 0 em empate (comparador válido)
                      })[0]?.appr?.approvedBy : null;

                  // acento lateral por status
                  const accentColor = allApproved ? '#22c55e'
                    : (PRODUCTION_STATUSES as readonly string[]).includes(item.status) ? statusCfg.dot
                    : item.status === 'ready_for_production' ? '#2563eb'
                    : '#e7e5e4';

                  // Pipeline de fluxo (12 etapas) — const de módulo PIPELINE_STAGES
                  const pipelineIdx = PIPELINE_STAGES.findIndex(s => s.statuses.includes(item.status));
                  const currentPipelineIdx = pipelineIdx === -1 ? 0 : pipelineIdx;

                  // O FIM DA HISTÓRIA — o marco que o dono pediu (14/08): a
                  // trilha ia de "Criado" a "Todos aprovaram" e parava, sem
                  // dizer que a peça saiu das filas porque o EVENTO acabou.
                  // Fonte única em lib/status: mesma regra das filas, mesmas
                  // palavras. `ev` vem enriquecido de /api/events; o fallback
                  // `item.event` é o evento cru de /api/items, que já traz as
                  // duas colunas que o predicado lê (status e startDate).
                  //
                  // É o ÚNICO lugar do cartão que fala disso de propósito: o
                  // cabeçalho já está cheio (status, contagem, patrocinadores)
                  // e a informação é de FIM, então o fim da trilha é onde ela
                  // é lida sem competir com nada.
                  const marcoEvento = marcoEventoFinalizado(ev ?? item.event, hojeBusinessMs);

                  // A trilha de marcos que existia aqui saiu junto com a faixa dupla: a
                  // jornada agora lê os carimbos direto do item (ver jornadaDaPeca), e
                  // manter o cálculo sem consumidor só criaria uma segunda verdade.

                  return (
                    /* Cartão do histórico: abre o detalhe de aprovações. Era um
                       <div> com onClick, então por teclado o histórico inteiro
                       ficava sem como ser aberto. */
                    <div key={item.id}
                      role="button"
                      tabIndex={0}
                      aria-label={`Ver histórico de aprovações de ${item.displayId}`}
                      onClick={() => setHistDetailItem({ ...item, _ev: ev })}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setHistDetailItem({ ...item, _ev: ev });
                        }
                      }}
                      style={{
                        backgroundColor: '#ffffff',
                        // A régua entre linhas some na última: a borda da
                        // superfície já fecha embaixo.
                        borderBottom: iLinha < historyItems.slice(0, histVisible).length - 1
                          ? '1px solid #f1f0ef' : undefined,
                        display: 'flex', cursor: 'pointer',
                        // Herdado por toda a linha: a trilha de datas, o
                        // contador 2/2 e o codigo da peca. Uma declaracao no
                        // pai em vez de seis espalhadas — e a setima nao
                        // aparece sem ela.
                        fontVariantNumeric: 'tabular-nums',
                        transition: 'background-color 0.12s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#fafaf9')}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#ffffff')}
                    >
                      {/* Trilho do estado — 3px, o mesmo vocabulário do card do
                          quadro da Gestão de Prazos e do card da peça aqui em
                          cima. Sem moldura em volta, ele é o único sinal de
                          estado da linha, e é onde o olho cai ao varrer. */}
                      <div style={{ width: 3, background: accentColor, flexShrink: 0 }} />

                      <div style={{ flex: 1, minWidth: 0 }}>
                        {/* ── Cabeçalho — empilha no mobile para não estourar a largura ── */}
                        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center', gap: 12, padding: '14px 16px 12px' }}>
                          {/* Thumb */}
                          <div style={{
                            width: 44, height: 44, borderRadius: 8, overflow: 'hidden',
                            background: '#f5f5f4', flexShrink: 0,
                            border: '1px solid #e7e5e4',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.06)', position: 'relative',
                          }}>
                            {(item.approvalThumbUrl || item.finalPreviewUrl)
                              ? <>
                                  <img
                                    src={miniatura(item.approvalThumbUrl || item.finalPreviewUrl)}
                                    alt=""
                                    loading="lazy"
                                    decoding="async"
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                    onError={(e) => {
                                      (e.currentTarget as HTMLImageElement).style.display = 'none';
                                      const fb = (e.currentTarget as HTMLImageElement).nextElementSibling as HTMLElement | null;
                                      if (fb?.dataset.fallback) fb.style.display = 'flex';
                                    }}
                                  />
                                  <div data-fallback="1" style={{ display: 'none', position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', background: '#f5f5f4' }}>
                                    <FileText style={{ width: 16, height: 16, color: '#c4bfbb' }} />
                                  </div>
                                </>
                              : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <FileText style={{ width: 16, height: 16, color: '#c4bfbb' }} />
                                </div>}
                          </div>

                          {/* Identidade */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 15, fontWeight: 700, color: '#1c1917', lineHeight: 1.2 }}>{item.type}</span>
                              <span style={{ fontSize: 11, color: '#746e69', fontWeight: 500 }}>{item.displayId}</span>
                              <SeloKit peca={item} />
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 11, color: '#746e69', fontWeight: 500 }}>{ev?.name || '—'}</span>
                              {/* `title` com o significado: o selo traz só o rótulo, e
                                  no histórico a pergunta é o que quer dizer a peça
                                  estar ali e quem age agora. */}
                              <span title={descricaoDoStatus(item.status) ?? undefined} style={{
                                fontSize: 11, fontWeight: 700,
                                backgroundColor: statusCfg.bg, color: statusCfg.text, border: `1px solid ${statusCfg.border}`,
                                padding: '2px 8px', borderRadius: 6, whiteSpace: 'nowrap', lineHeight: 1.5,
                              }}>{isMobile ? getStatusShort(item.status) : getStatusLabel(item.status)}</span>
                              <DetalheProducao item={item} style={{ marginTop: 0 }} />
                              {/* ARQUIVO CORRIGIDO. O estado "nova versão" é o único
                                  em que a bola está com o ATENDIMENTO: a Arte já
                                  refez e o arquivo está parado esperando ser
                                  reenviado ao patrocinador. Vinha escrito só dentro
                                  da linha de cada patrocinador, e do lado de fora o
                                  cartão era idêntico ao de uma peça que nunca tinha
                                  saído — foi assim que a #1527 ficou semanas parada.
                                  Vem em ÂMBAR e não em vermelho: não é alarme, é
                                  trabalho pronto para sair.
                                  #92400e sobre #fffbeb = 7,4:1 ✓ nos 11px. */}
                              {situacaoDaPeca(itemApprovalsMap[item.id]) === 'nova_versao' && (
                                <span
                                  data-testid={`selo-nova-versao-${item.id}`}
                                  title={SITUACAO_META.nova_versao.hint}
                                  style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 4,
                                    fontSize: 11, fontWeight: 700,
                                    backgroundColor: '#fffbeb', color: '#92400e', border: '1px solid #fde68a',
                                    padding: '2px 8px', borderRadius: 6, whiteSpace: 'nowrap', lineHeight: 1.5,
                                  }}
                                >
                                  <RotateCcw aria-hidden="true" style={{ width: 11, height: 11 }} />
                                  Arte corrigida · aprovar
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Resumo + detalhes — empilha no mobile */}
                          <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'flex-start' : 'center', gap: 10, flexShrink: 0 }}>
                            {/* Afordância REAL (decisão do item 24 do backlog): parecia
                                botão mas era um <div> decorativo — agora é um <button>
                                com a mesma ação do card, utilizável também por teclado
                                sem depender do card inteiro como alvo. */}
                            <button
                              onClick={e => { e.stopPropagation(); setHistDetailItem({ ...item, _ev: ev }); }}
                              data-testid={`button-hist-details-${item.id}`}
                              // 32px de alvo (44 no celular): com padding de 4px o
                              // botão tinha ~22 — o menor controle da aba, e é a
                              // única porta do cartão que não depende do card todo.
                              style={{ display: 'flex', alignItems: 'center', gap: 5, minHeight: isMobile ? 44 : 32, padding: '0 12px', borderRadius: 8, background: '#ffffff', border: '1px solid #e7e5e4', cursor: 'pointer' }}
                            >
                              <Eye aria-hidden="true" style={{ width: 12, height: 12, color: '#57534e' }} />
                              <span style={{ fontSize: 12, fontWeight: 600, color: '#44403c', whiteSpace: 'nowrap' }}>Ver detalhes</span>
                            </button>
                            {sponsorApprovals.length > 0 && (
                              <div style={{
                                display: 'flex', flexDirection: 'column', alignItems: 'center',
                                background: allApproved ? '#f0fdf4' : '#fafaf9',
                                border: `1px solid ${allApproved ? '#bbf7d0' : '#e7e5e4'}`,
                                borderRadius: 8, padding: '4px 10px', minWidth: 48,
                              }}>
                                <span style={{ fontSize: 15, fontWeight: 800, color: allApproved ? '#15803d' : '#44403c', lineHeight: 1 }}>
                                  {approvedOnes.length} <span style={{ fontSize: 11, fontWeight: 500 }}>de</span> {sponsorApprovals.length}
                                </span>
                                <span style={{ fontSize: 11, color: allApproved ? '#15803d' : '#57534e', fontWeight: 700, marginTop: 2 }}>
                                  {allApproved ? 'todos' : 'aprovaram'}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* ── A JORNADA, UMA VEZ SÓ ───────────────────────────────────────
                            Eram duas faixas: a trilha de marcos (datas) e o pipeline de 10
                            etapas (posição), contando a mesma história em desenhos
                            diferentes. Agora é uma: onde a peça está, quando passou por
                            cada ponto, e quanto tempo levou entre eles — que é a pergunta
                            de uma tela de auditoria. */}
                        {(() => {
                          const j = jornadaDaPeca(item, hoje instanceof Date ? hoje.getTime() : Number(hoje));
                          if (j.atual < 0) return null;
                          return (
                            <div data-testid={`faixa-jornada-${item.id}`} style={{ borderTop: '1px solid #f5f5f4', padding: '10px 16px 12px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                              <div className="pipeline-scroll" style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'flex-start', minWidth: isMobile ? 620 : 0 }}>
                                  {j.etapas.map((e, i) => (
                                    <Fragment key={e.key}>
                                      {i > 0 && (
                                        <span style={{ flex: 1, minWidth: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 3 }}>
                                          <span style={{ display: 'block', width: '100%', height: 2, borderRadius: 999, background: e.cumprida || e.ehAtual || e.pulada ? '#c2410c' : '#e7e5e4' }} />
                                          {/* O TEMPO DO TRECHO. "Criado 04/08 → Todos aprovaram
                                              13/08" obrigava a contar nove dias de cabeça. */}
                                          {e.desdeAnterior !== null && (
                                            <span style={{ marginTop: 3, fontSize: 10, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: tomDoIntervalo(e.desdeAnterior), whiteSpace: 'nowrap' }}>
                                              +{e.desdeAnterior}d
                                            </span>
                                          )}
                                        </span>
                                      )}
                                      <span title={e.pulada ? `${e.label} · não se aplica: a peça foi entregue sem tubo` : `${e.label}${e.ms ? ` · ${fmtDt(new Date(e.ms))}` : ' · sem carimbo de data'}${descricaoDoStatus(e.statusDaEtapa) ? `\n${descricaoDoStatus(e.statusDaEtapa)}` : ''}`}
                                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, flexShrink: 0, maxWidth: 78 }}>
                                        <span aria-hidden="true" style={{
                                          width: e.ehAtual ? 11 : 8, height: e.ehAtual ? 11 : 8, borderRadius: '50%', flexShrink: 0,
                                          background: e.cumprida || e.ehAtual ? '#c2410c' : '#e7e5e4',
                                          // Embalado que NÃO SE APLICA (entregue sem tubo): oco e tracejado.
                                          ...(e.pulada ? { background: '#ffffff', border: '1.5px dashed #d6d3d1', boxSizing: 'border-box' as const } : null),
                                          boxShadow: e.ehAtual ? '0 0 0 3px rgba(251,146,60,0.25)' : 'none',
                                        }} />
                                        {(e.ehAtual || e.ms) && (
                                          <span style={{ fontSize: 10, fontWeight: e.ehAtual ? 800 : 600, color: e.ehAtual ? '#9a3412' : '#57534e', lineHeight: 1.2, textAlign: 'center', whiteSpace: 'nowrap' }}>
                                            {e.label}
                                          </span>
                                        )}
                                        {e.ms && (
                                          <span style={{ fontSize: 10, color: '#746e69', fontVariantNumeric: 'tabular-nums', lineHeight: 1.2, whiteSpace: 'nowrap' }}>
                                            {fmtDt(new Date(e.ms), true)}
                                          </span>
                                        )}
                                      </span>
                                    </Fragment>
                                  ))}
                                </div>
                              </div>

                              {/* O NÚMERO ACIONÁVEL: quanto tempo a peça está parada aqui
                                  (em curso) ou quanto a jornada inteira levou (concluída). */}
                              {j.duracao !== null && (
                                <span data-testid={`text-duracao-${item.id}`}
                                  title={j.concluida ? 'Da solicitação ao último carimbo' : 'Tempo desde o último carimbo desta peça'}
                                  style={{ flexShrink: 0, textAlign: 'right', lineHeight: 1.25 }}>
                                  <span style={{ display: 'block', fontSize: 15, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: j.concluida ? '#57534e' : tomDoIntervalo(j.duracao) }}>
                                    {j.duracao}d
                                  </span>
                                  <span style={{ display: 'block', fontSize: 10, color: '#746e69', whiteSpace: 'nowrap' }}>
                                    {j.concluida ? 'no total' : 'nesta etapa'}
                                  </span>
                                </span>
                              )}
                            </div>
                          );
                        })()}

                        {/* ── Chips de patrocinadores ── */}
                        {sortedApprovals.length > 0 && (
                          <div style={{
                            borderTop: '1px solid #f5f5f4',
                            padding: '8px 16px 12px',
                            display: 'flex', flexWrap: 'wrap', gap: 4,
                          }}>
                            {sortedApprovals.map(({ sponsor, appr }) => {
                              const v = approvalVisual(appr?.status);
                              return (
                                <div key={sponsor.id}
                                  title={v.isApproved && appr?.approvedBy ? `${appr.approvedBy} · ${fmtDt(appr.approvedAt) ?? ''}` : undefined}
                                  style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 5,
                                    height: 26, padding: '0 9px 0 7px',
                                    borderRadius: 12, background: v.bg, border: `1px solid ${v.border}`,
                                    flexShrink: 0, cursor: 'default',
                                  }}>
                                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: v.dot, flexShrink: 0 }} />
                                  <span style={{ fontSize: 11, fontWeight: 600, color: v.text, whiteSpace: 'nowrap', lineHeight: 1 }}>
                                    {sponsor.name}
                                  </span>
                                  {v.isApproved && appr?.approvedAt && (
                                    <span style={{ fontSize: 11, color: '#15803d', fontWeight: 500, whiteSpace: 'nowrap', lineHeight: 1 }}>
                                      {fmtDt(appr.approvedAt, true)}
                                    </span>
                                  )}
                                  {!v.isApproved && !v.isRejected && !v.isNewVersion && !v.isAwaitingArte && (
                                    <span style={{ fontSize: 11, color: '#57534e', fontWeight: 600, lineHeight: 1, textTransform: 'uppercase', letterSpacing: '0.03em' }}>Ag.</span>
                                  )}
                                  {(v.isRejected || v.isAwaitingArte) && <span style={{ fontSize: 11, color: '#b91c1c', fontWeight: 700, lineHeight: 1 }}>✕</span>}
                                  {v.isNewVersion && <span style={{ fontSize: 11, color: '#92400e', fontWeight: 700, lineHeight: 1 }}>↻</span>}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                {historyItems.length > histVisible && (
                  <button
                    onClick={() => setHistVisible(v => v + PAGE_SIZE)}
                    data-testid="button-load-more-history"
                    style={{ marginTop: 8, padding: '12px 0', width: '100%', borderRadius: 12, border: '1px solid #e7e5e4', background: '#ffffff', color: '#c2410c', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
                  >
                    Carregar mais ({historyItems.length - histVisible} restantes)
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* ─── MODAL HISTÓRICO DE APROVAÇÕES ─────────────────────── */}
      <Dialog open={!!histDetailItem} onOpenChange={open => { if (!open) setHistDetailItem(null); }}>
        {/* HIDE_NATIVE_CLOSE: o modal tem botão de fechar próprio no header escuro */}
        <DialogContent className={HIDE_NATIVE_CLOSE} style={modalSurface(620)}>
          <DialogTitle className="sr-only">Histórico de aprovações</DialogTitle>
          <DialogDescription className="sr-only">Log completo de aprovações por patrocinador</DialogDescription>
          {histDetailItem && (() => {
            const di = histDetailItem;
            const diSps: any[] = itemSponsorsMap[di.id] || [];
            const diApprovals: SponsorApproval[] = itemApprovalsMap[di.id] || [];
            const ev = di._ev;
            const fmtFull = (d: any) => d ? format(new Date(d), "dd/MM/yy 'às' HH:mm", { locale: ptBR }) : null;
            const approvedCount = diApprovals.filter(a => a.status === 'approved').length;
            const allApp = diSps.length > 0 && approvedCount === diSps.length;
            return (
              <>
                {/* CABEÇALHO CLARO.

                    Era um bloco quase preto com gradiente, ladrilho translúcido
                    e botão de fechar circular — um tema visual só dele, dentro
                    de um app inteiro claro. Todo o texto vinha em branco com
                    opacidade (0,55 a 0,65), que é como se apaga texto sem
                    admitir que ele ficou ilegível.

                    O contador 1/2 subiu para cá: ele era uma pílula empilhada de
                    56x56 no corpo, com o número, a fração e a palavra 'parcial'
                    em três alturas — e a frase ao lado já dizia a mesma coisa
                    por extenso. */}
                <div style={{ padding: '16px 20px', backgroundColor: '#fdfcfb', borderBottom: '1px solid #f1f0ef', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, overflow: 'hidden', flexShrink: 0, backgroundColor: '#f5f5f4', border: '1px solid #e7e5e4', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {(di.approvalThumbUrl || di.finalPreviewUrl)
                      ? <>
                          <img
                            src={miniatura(di.approvalThumbUrl || di.finalPreviewUrl)}
                            alt=""
                            decoding="async"
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).style.display = 'none';
                              const fb = (e.currentTarget as HTMLImageElement).nextElementSibling as HTMLElement | null;
                              if (fb?.dataset.fallback) fb.style.display = 'flex';
                            }}
                          />
                          <div data-fallback="1" style={{ display: 'none', position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
                            <span style={{ fontSize: 12, fontWeight: 800, color: '#746e69', letterSpacing: '-0.01em' }}>{di.type?.slice(0,2).toUpperCase()}</span>
                          </div>
                        </>
                      : <span style={{ fontSize: 12, fontWeight: 800, color: '#746e69', letterSpacing: '-0.01em' }}>{di.type?.slice(0,2).toUpperCase()}</span>}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                      <h2 title={di.type} style={{ fontSize: 15, fontWeight: 700, color: '#1c1917', margin: 0, letterSpacing: '-0.02em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textTransform: 'capitalize' }}>{di.type}</h2>
                      <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 11, color: '#746e69', fontWeight: 700, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{di.displayId}</span>
                    </div>
                    <span title={ev?.name || undefined} style={{ display: 'block', fontSize: 12, color: '#746e69', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev?.name || '—'}</span>
                  </div>
                  <span
                    data-testid="hist-contador-aprovacoes"
                    title={`${approvedCount} de ${diSps.length} patrocinadores aprovaram`}
                    style={{
                      flexShrink: 0, fontSize: 13, fontWeight: 700,
                      fontVariantNumeric: 'tabular-nums',
                      color: allApp ? '#15803d' : '#57534e',
                    }}
                  >
                    {approvedCount}/{diSps.length}
                  </span>
                  <button onClick={() => setHistDetailItem(null)} aria-label="Fechar" style={{ width: 36, height: 36, borderRadius: 9, backgroundColor: '#ffffff', border: '1px solid #e7e5e4', cursor: 'pointer', color: '#57534e', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <X style={{ width: 15, height: 15 }} />
                  </button>
                </div>
                {/* Body: resumo + lista integrados, sem faixa separada.
                    ALTURA: cabeçalho escuro 80 + lista de até 440 = 520px, sem
                    rodapé. Numa janela de 445 o Radix cortava 61px em cima e 61
                    embaixo ao mesmo tempo. Este wrapper é o ELO da coluna (o
                    fade de rolagem depende do `position: relative` dele): sem
                    ser coluna flex e sem `minHeight: 0` o teto do `modalSurface`
                    não chegaria à lista. */}
                <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', flex: '0 1 auto', minHeight: 0 }}>
                <div style={{ maxHeight: 440, overflowY: 'auto', flex: '0 1 auto', minHeight: 0 }}>
                  {/* Resumo compacto no topo do body */}
                  <div style={{ padding: '14px 24px 12px', display: 'flex', alignItems: 'center', gap: 14, borderBottom: `1px solid ${allApp ? '#d1fae5' : '#f0ede8'}`, background: allApp ? '#f6fef9' : '#fff' }}>
                    {/* A pílula de 56x56 saiu: ela dizia "2", "/2" e "TODOS" em
                        três alturas, ao lado de uma frase que já dizia "Todos os
                        patrocinadores aprovaram". A fração ficou no cabeçalho. */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        {allApp && <CheckCircle style={{ width: 14, height: 14, color: '#15803d', flexShrink: 0 }} />}
                        <span style={{ fontSize: 13, fontWeight: 600, color: allApp ? '#15803d' : '#1c1917' }}>
                          {allApp
                            ? (diSps.length === 1 ? 'Patrocinador aprovou' : 'Todos os patrocinadores aprovaram')
                            : `${approvedCount} de ${diSps.length} aprovaram`}
                        </span>
                      </div>
                      {di.createdAt && <div style={{ fontSize: 11, color: '#746e69' }}>Criado em {fmtFull(di.createdAt)}</div>}
                    </div>
                  </div>
                  {diSps.length === 0
                    ? <div style={{ padding: '32px 24px', textAlign: 'center', color: '#746e69', fontSize: 13 }}>Nenhum patrocinador vinculado</div>
                    : diSps.map((sp: any, si: number) => {
                        const appr = diApprovals.find(a => a.sponsorId === sp.id);
                        const v = approvalVisual(appr?.status);
                        const { isApproved, isNewVersion } = v;
                        return (
                          <div key={sp.id} style={{ padding: '12px 24px', borderBottom: si < diSps.length - 1 ? '1px solid #f5f5f4' : 'none', display: 'flex', alignItems: 'center', gap: 12, borderLeft: sp.color ? `3px solid ${sp.color}` : 'none', paddingLeft: sp.color ? '24px' : '27px' }}>
                            <div style={{ width: 10, height: 10, borderRadius: '50%', background: v.dot, flexShrink: 0, alignSelf: 'flex-start', marginTop: 3, boxShadow: `0 0 0 3px ${v.dot}33` }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                <span style={{ fontSize: 13, fontWeight: 700, color: '#1c1917', textTransform: 'capitalize' }}>{sp.name}</span>
                                <span style={{ fontSize: 11, fontWeight: 600, color: v.text, background: v.bg, border: `1px solid ${v.border}`, borderRadius: 6, padding: '2px 8px', whiteSpace: 'nowrap' }}>{v.label}</span>
                              </div>
                              {isApproved && appr?.approvedAt && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <CheckCircle style={{ width: 12, height: 12, color: '#15803d', flexShrink: 0 }} />
                                  <span style={{ fontSize: 11, color: '#57534e' }}>
                                    Aprovado em <strong style={{ fontWeight: 700 }}>{fmtFull(appr.approvedAt)}</strong>
                                    {appr.approvedBy && <> por <strong style={{ fontWeight: 700, color: '#1c1917' }}>{appr.approvedBy}</strong></>}
                                  </span>
                                </div>
                              )}
                              {isApproved && !appr?.approvedAt && <span style={{ fontSize: 11, color: '#746e69' }}>Data não registrada</span>}
                              {/* Gate pelos DADOS da reprovação, não pelo status: o
                                  servidor grava 'awaiting_arte' na reprovação (nunca
                                  'rejected'), então isRejected jamais ligava aqui e o
                                  motivo/data da reprovação ficavam invisíveis. */}
                              {(appr?.rejectedAt || appr?.rejectionReason) && (
                                <>
                                  {appr?.rejectedAt && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: appr.rejectionReason ? 6 : 0 }}>
                                      <X style={{ width: 12, height: 12, color: '#ef4444', flexShrink: 0 }} />
                                      <span style={{ fontSize: 11, color: '#57534e' }}>
                                        Reprovado em <strong style={{ fontWeight: 700 }}>{fmtFull(appr.rejectedAt)}</strong>
                                        {appr.rejectedBy && <> por <strong style={{ fontWeight: 700, color: '#1c1917' }}>{appr.rejectedBy}</strong></>}
                                      </span>
                                    </div>
                                  )}
                                  {appr?.rejectionReason && (
                                    <div style={{ padding: '6px 10px', background: '#fef2f2', borderRadius: 6, border: '1px solid #fecaca' }}>
                                      <span style={{ fontSize: 11, color: '#7f1d1d', lineHeight: 1.5 }}>"{appr.rejectionReason}"</span>
                                    </div>
                                  )}
                                </>
                              )}
                              {isNewVersion && <span style={{ fontSize: 11, color: '#92400e' }}>Nova versão de arte solicitada</span>}
                              {!appr && <span style={{ fontSize: 11, color: '#746e69' }}>Aguardando resposta do patrocinador</span>}
                            </div>
                          </div>
                        );
                      })
                  }
                  <div style={{ height: 8 }} />
                </div>
                {/* Fade de scroll: só exibe quando a lista pode ter overflow */}
                {diSps.length > 4 && <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 48, background: 'linear-gradient(to bottom, transparent, rgba(255,255,255,0.97))', pointerEvents: 'none', borderRadius: '0 0 16px 16px' }} />}
                </div>

              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ─── MODAL DE REVISÃO (3 colunas) ───────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        {/* Escape fecha o modal, EXCETO com o formulário de reprovação aberto —
            para não descartar o motivo digitado com um Esc acidental. */}
        <DialogContent className={`max-w-6xl max-h-[92vh] p-0 gap-0 rounded-2xl overflow-hidden flex flex-col ${HIDE_NATIVE_CLOSE}`} style={isMobile ? { maxWidth: '95vw', width: '95vw' } : undefined} onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => { if (rejectingSponsorId) e.preventDefault(); }}>
          <DialogTitle className="sr-only">Revisão de Ativo</DialogTitle>
          <DialogDescription className="sr-only">Revise os detalhes e aprove ou reprove o ativo</DialogDescription>

          {selectedItem && (() => {
            const ev = events.find((e: any) => e.id === selectedItem.eventId);
            const thumbUrl = selectedItem.approvalThumbUrl;
            const finalUrl = selectedItem.finalFileUrl;
            const itemLogs = (auditLogs as any[])
              .filter(log => log.entityType === 'item' && log.entityId === selectedItem.id)
              .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            const dialogSponsors = itemSponsorsMap[selectedItem.id] || [];
            const allDecided = sponsorApprovals.length > 0 && dialogSponsors.every(s => {
              const a = sponsorApprovals.find(ap => ap.sponsorId === s.id);
              return a && (a.status === 'approved' || a.status === 'rejected' || a.status === 'awaiting_arte');
            });
            const allApproved = dialogSponsors.length > 0 && dialogSponsors.every(s => {
              return sponsorApprovals.find(ap => ap.sponsorId === s.id)?.status === 'approved';
            });

            return (
              <>
                {/* Modal Header */}
                {/* NO CELULAR o cabeçalho QUEBRA em duas linhas (peça em cima,
                    navegação da fila embaixo). Numa fileira só, o bloco da peça
                    não tinha `minWidth: 0` e não encolhia: com "Peça 3 de 41",
                    as duas setas e o fechar, o X saía da tela em 390px — o modal
                    ficava sem saída visível além do Esc. */}
                <div style={{
                  padding: isMobile ? '14px 16px' : '20px 24px', borderBottom: '1px solid #f1f0ef',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  flexWrap: isMobile ? 'wrap' : 'nowrap', gap: isMobile ? 10 : 16,
                  backgroundColor: '#fafaf9', flexShrink: 0,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 12 : 16, minWidth: 0, flex: '1 1 auto' }}>
                    <div style={{
                      width: 38, height: 38, borderRadius: 10, overflow: 'hidden', flexShrink: 0,
                      backgroundColor: '#1c1917', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      position: 'relative',
                    }}>
                      {thumbUrl
                        ? <>
                            <img
                              src={miniatura(thumbUrl)}
                              alt=""
                              decoding="async"
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              onError={(e) => {
                                // Mesmo fallback dos demais thumbs da tela: esconde a
                                // imagem quebrada e mostra o ícone ao lado.
                                (e.currentTarget as HTMLImageElement).style.display = 'none';
                                const fb = (e.currentTarget as HTMLImageElement).nextElementSibling as HTMLElement | null;
                                if (fb?.dataset.fallback) fb.style.display = 'flex';
                              }}
                            />
                            <div data-fallback="1" style={{ display: 'none', position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
                              <FileText style={{ width: 20, height: 20, color: '#ffffff' }} />
                            </div>
                          </>
                        : <FileText style={{ width: 20, height: 20, color: '#ffffff' }} />}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      {/* O TÍTULO diz o que é a peça.

                          Era "REVISÃO DE ATIVO #3524" — três palavras sobre o
                          modal (que a pessoa acabou de abrir e já sabe que é uma
                          revisão) e nenhuma sobre a PEÇA. Agora nomeia o objeto,
                          com o código ao lado em mono para o olho achar o número
                          sem ler a frase. */}
                      <h2 title={selectedItem.type || undefined} style={{
                        fontFamily: "'Space Grotesk', sans-serif",
                        fontSize: 17, fontWeight: 700, letterSpacing: '-0.02em',
                        color: '#1c1917', margin: 0, lineHeight: 1.2,
                        display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0,
                      }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {selectedItem.type || 'Peça'}
                        </span>
                        <span style={{
                          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13, fontWeight: 700,
                          color: '#746e69', fontVariantNumeric: 'tabular-nums', flexShrink: 0,
                        }}>
                          {selectedItem.displayId}
                        </span>
                        <SeloKit peca={selectedItem} style={{ flexShrink: 0 }} />
                      </h2>
                      {/* Evento e prazo em caixa normal: em versalete espaçado a
                          linha de contexto gritava tanto quanto o título, e o
                          nome do evento, que pode ser longo, não quebrava. */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap', rowGap: 2 }}>
                        <span title={ev?.name || undefined} style={{ fontSize: 12, fontWeight: 600, color: '#746e69', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
                          {ev?.name || 'Sem evento'}
                        </span>
                        {(() => {
                          // O prazo desta tela é o marco de APROVAÇÃO DE LAYOUT,
                          // não a saída do caminhão: aqui o patrocinador decide,
                          // e cobrar pela saída dava ao atendimento semanas de
                          // folga que ele não tem. A conta era uma cópia da do
                          // card da lista — agora as duas (e o filtro
                          // "Atrasados") leem a mesma regra pura.
                          const p = prazoAprovacaoLayout(ev, hoje);
                          if (!p) return null;
                          const limite = p.limite;
                          // VENCIDO fica vermelho. O prazo era cinza nos dois
                          // casos, com a data por extenso: quem abre a ficha
                          // tinha de comparar a data com a de hoje de cabeça
                          // para saber se estava atrasado — na tela cujo
                          // trabalho inteiro é não deixar vencer.
                          const venceu = p.diff < 0;
                          return (
                            <>
                              <span aria-hidden="true" style={{ width: 4, height: 4, borderRadius: '50%', backgroundColor: '#d6d3d1' }} />
                              <span style={{
                                fontSize: 12, fontWeight: venceu ? 700 : 600,
                                color: venceu ? '#b91c1c' : '#746e69',
                                fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
                              }}>
                                Aprovação até {format(toUTCDisplayDate(limite.toISOString()), "dd/MM HH:mm")}
                                {venceu && " · vencida"}
                              </span>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                  {/* Navegação da fila + fechar */}
                  {(() => {
                    const qIdx = reviewQueue.findIndex((i: any) => i.id === selectedItem.id);
                    const hasPrev = qIdx > 0;
                    const hasNext = qIdx >= 0 && qIdx < reviewQueue.length - 1;
                    // Os TRÊS botões do canto (anterior, próxima, fechar) com a
                    // mesma forma e o mesmo tamanho. O fechar era um círculo de
                    // 40 sem borda ao lado de dois quadrados de 40 com borda —
                    // três controles vizinhos, três desenhos.
                    const navBtn = (enabled: boolean): React.CSSProperties => ({
                      width: isMobile ? 44 : 36, height: isMobile ? 44 : 36, borderRadius: 9,
                      border: '1px solid #e7e5e4',
                      backgroundColor: '#ffffff',
                      cursor: enabled ? 'pointer' : 'not-allowed',
                      opacity: enabled ? 1 : 0.4,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#57534e',
                    });
                    return (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto', flexShrink: 0 }}>
                        {qIdx >= 0 && reviewQueue.length > 1 && (
                          <>
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#746e69', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                              Peça {qIdx + 1} de {reviewQueue.length}
                            </span>
                            {/* aria-label: só com `title` o leitor de tela lia
                                "botão" sem nome em dois ícones de seta. */}
                            <button
                              onClick={() => hasPrev && goToAdjacentItem(-1)}
                              disabled={!hasPrev}
                              data-testid="button-prev-item"
                              title="Peça anterior"
                              aria-label="Peça anterior"
                              style={navBtn(hasPrev)}
                            >
                              <ChevronRight aria-hidden="true" style={{ width: 16, height: 16, transform: 'rotate(180deg)' }} />
                            </button>
                            <button
                              onClick={() => hasNext && goToAdjacentItem(1)}
                              disabled={!hasNext}
                              data-testid="button-next-item"
                              title="Próxima peça"
                              aria-label="Próxima peça"
                              style={navBtn(hasNext)}
                            >
                              <ChevronRight aria-hidden="true" style={{ width: 16, height: 16 }} />
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => setDialogOpen(false)}
                          data-testid="button-close-dialog"
                          aria-label="Fechar"
                          style={navBtn(true)}
                        >
                          <X style={{ width: 16, height: 16 }} />
                        </button>
                      </div>
                    );
                  })()}
                </div>

                {/* Modal Body: DUAS colunas — ler à esquerda, decidir à direita */}
                <div className="review-modal-body">

                  {/* ─── ESQUERDA: o que se LÊ ─────────────────────────── */}
                  {/* Um scrollport só para arte, especificações, arquivos e
                      histórico. Antes eram TRÊS scrollports lado a lado, cada
                      um com a sua barra e a sua altura — e o histórico, que é
                      o mais comprido, era o mais estreito dos três. */}
                  <div style={{ overflowY: "auto", minWidth: 0, display: "flex", flexDirection: "column" }}>
                    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 24 }}>
                        {/* Preview de imagem */}
                        <div style={{
                          aspectRatio: '16/9', backgroundColor: '#f5f5f4',
                          borderRadius: 12, overflow: 'hidden',
                          border: '1px solid #e7e5e4', position: 'relative',
                        }}>
                          {thumbUrl ? (
                            <FilePreview url={thumbUrl} linkUrl={finalUrl || thumbUrl} objectFit="contain" />
                          ) : (
                            <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                              <Package style={{ width: 40, height: 40, color: '#a8a29e' }} />
                              <p style={{ fontSize: 13, color: '#746e69', margin: 0 }}>Sem thumb de aprovação</p>
                            </div>
                          )}
                        </div>

                    </div>
                    {/* Especificações e arquivos — abaixo da arte, não ao lado.

                        Sem borda e sem scroll próprios: eram de coluna, e esta
                        deixou de ser uma. Quem rola agora é o pai. */}
                    <div style={{
                      padding: '0 24px 24px',
                      display: 'flex', flexDirection: 'column', gap: 24,
                    }}>
                      <div>
                        <h4 style={{ fontSize: 11, fontWeight: 700, color: '#746e69', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 16px' }}>
                          Especificações
                        </h4>
                        {/* GRADE de quatro células, não quatro caixas empilhadas.

                            Cada uma tinha borda, raio e fundo próprios: quatro
                            molduras para quatro pares rótulo/valor que ninguém
                            lê um por vez. Numa superfície só, divididas por
                            hairline, elas viram uma tabela — que é o que sempre
                            foram. */}
                        <div style={{
                          display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0,1fr))',
                          backgroundColor: '#ffffff', border: '1px solid #f1f0ef',
                          borderRadius: 8, overflow: 'hidden',
                        }}>
                          {[
                            { label: 'Tipo / Formato', value: selectedItem.type || '—' },
                            { label: 'Descrição', value: selectedItem.description || '—' },
                            { label: 'Quantidade', value: selectedItem.quantity ? `${selectedItem.quantity}x` : '—' },
                            { label: 'Dimensões / Tamanho', value: (() => {
                              const vw = selectedItem.visualWidth; const vh = selectedItem.visualHeight;
                              const fw = selectedItem.fileWidth;  const fh = selectedItem.fileHeight;
                              const visual = vw && vh ? `${parseFloat(vw)}×${parseFloat(vh)} m (visual)` : null;
                              const file   = fw && fh ? `${parseFloat(fw)}×${parseFloat(fh)} m (arquivo)` : null;
                              return [visual, file].filter(Boolean).join(' · ') || '—';
                            })() },
                          ].map(({ label, value }, i) => (
                            <div key={label} style={{
                              padding: '10px 12px',
                              // Hairline de grade: a borda de baixo some na
                              // última linha e a da direita na última coluna,
                              // senão a superfície ganha uma moldura dupla.
                              borderBottom: i < 2 ? '1px solid #f1f0ef' : undefined,
                              borderRight: !isMobile && i % 2 === 0 ? '1px solid #f1f0ef' : undefined,
                              minWidth: 0,
                            }}>
                              <p style={{ fontSize: 10, color: '#746e69', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 4px' }}>{label}</p>
                              <p title={String(value)} style={{ fontSize: 13, fontWeight: 700, color: '#1c1917', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Links para arquivos */}
                      <div>
                        <h4 style={{ fontSize: 11, fontWeight: 700, color: '#746e69', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 12px' }}>
                          Arquivos
                        </h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {thumbUrl && (
                            <a
                              href={thumbUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                padding: '10px 12px', borderRadius: 8,
                                backgroundColor: 'rgba(253,118,26,0.05)',
                                border: '1px solid rgba(253,118,26,0.15)',
                                color: '#9d4300', textDecoration: 'none',
                                fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                              }}
                            >
                              <span>Arquivo para aprovação</span>
                              <Download style={{ width: 14, height: 14 }} />
                            </a>
                          )}
                          {finalUrl && (
                            <a
                              href={finalUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                padding: '10px 12px', borderRadius: 8,
                                backgroundColor: 'rgba(0,99,152,0.05)',
                                border: '1px solid rgba(0,99,152,0.15)',
                                color: '#006398', textDecoration: 'none',
                                fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                              }}
                            >
                              <span>Arquivo Final</span>
                              <Download style={{ width: 14, height: 14 }} />
                            </a>
                          )}
                          {!thumbUrl && !finalUrl && (
                            <p style={{ fontSize: 13, color: '#746e69' }}>Nenhum arquivo disponível</p>
                          )}
                        </div>
                      </div>
                    </div>
                    {/* Histórico — o bloco mais COMPRIDO da ficha, e era o mais
                        estreito dos três. Aqui ele tem a largura inteira da
                        coluna de leitura e rola junto com o resto. */}
                    <div style={{
                      padding: '0 24px 24px',
                      borderTop: '1px solid #f1f0ef', paddingTop: 24,
                    }}>
                      <h4 style={{ fontSize: 11, fontWeight: 700, color: '#746e69', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 24px' }}>
                        Histórico de Alterações
                      </h4>

                      {itemLogs.length === 0 ? (
                        <p style={{ fontSize: 13, color: '#746e69' }}>Sem registros de histórico</p>
                      ) : (
                        <div style={{ position: 'relative' }}>
                          {/* Linha vertical */}
                          <div style={{
                            position: 'absolute', left: 10, top: 8, bottom: 8,
                            width: 1, backgroundColor: '#e7e5e4',
                          }} />
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                            {itemLogs.slice(0, 10).map((log, i) => {
                              // ACTION_CONFIG é const de módulo (topo do arquivo).
                              const cfg = ACTION_CONFIG[log.action] ?? { label: log.action?.replace(/_/g, ' ') ?? 'Ação', bg: '#e7e5e4', iconColor: '#a8a29e', icon: Clock };
                              const IconComp = cfg.icon;
                              const isSystemLog = ['updated', 'status_changed', 'file_uploaded', 'thumb_uploaded'].includes(log.action);
                              return (
                                // SEM o esmaecimento por opacidade. O registro
                                // mais antigo chegava a 40%: o cinza #746e69 a 40%
                                // sobre branco mede ~1,8:1 — o histórico ficava
                                // ilegível justamente no que se abre para ler. A
                                // hierarquia agora é de PESO: log de sistema
                                // (upload, status) em rótulo 600; decisão, 700.
                                <div key={log.id} style={{ paddingLeft: 32, position: 'relative' }}>
                                  <div style={{
                                    position: 'absolute', left: 0, top: 2,
                                    width: 20, height: 20, borderRadius: '50%',
                                    backgroundColor: cfg.bg,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1,
                                  }}>
                                    <IconComp style={{ width: 10, height: 10, color: cfg.iconColor }} />
                                  </div>
                                  <p style={{ fontSize: 12, fontWeight: isSystemLog ? 600 : 700, color: isSystemLog ? '#57534e' : '#1c1917', margin: 0 }}>
                                    {cfg.label}
                                  </p>
                                  <p style={{ fontSize: 11, color: '#746e69', margin: '2px 0 0' }}>
                                    {log.userName && <><span style={{ fontWeight: 600, color: '#746e69' }}>{log.userName}</span> · </>}
                                    {format(new Date(log.createdAt), "dd MMM, yyyy 'às' HH:mm", { locale: ptBR })}
                                  </p>
                                  {log.details && (
                                    <p style={{
                                      fontSize: 11, margin: '6px 0 0',
                                      backgroundColor: '#ffffff', border: `1px solid ${cfg.bg}`,
                                      padding: '6px 10px', borderRadius: 6,
                                      color: '#57534e', fontStyle: 'italic',
                                    }}>
                                      "{typeof log.details === 'string' ? log.details : JSON.stringify(log.details)}"
                                    </p>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* ─── DIREITA: o que se DECIDE ──────────────────────── */}
                  <div style={{
                    borderLeft: "1px solid #f1f0ef",
                    backgroundColor: "rgba(250,250,249,0.5)",
                    display: "flex", flexDirection: "column", minWidth: 0,
                  }}>
                    <div style={{ padding: 24, overflowY: "auto", flex: "1 1 auto", minHeight: 0 }}>
                        {/* Aprovações por Patrocinador */}
                        <div>
                          <h4 style={{ fontSize: 11, fontWeight: 700, color: '#746e69', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 16px' }}>
                            Decisão
                          </h4>

                          {/* MODO CONSULTA escrito (rodada 4): os botões apareciam
                              esmaecidos e o porquê morava no `title` de cada um —
                              no celular, em lugar nenhum. */}
                          {!canDecide && (
                            <p data-testid="decisao-modo-consulta" style={{ margin: '0 0 14px', padding: '10px 14px', borderRadius: 8, backgroundColor: '#f5f5f4', border: '1px solid #e7e5e4', fontSize: 12.5, color: '#44403c', lineHeight: 1.5 }}>
                              <b style={{ fontWeight: 700 }}>Modo consulta.</b> Aprovar e reprovar é do Atendimento e dos administradores — aqui você acompanha quem já decidiu.
                            </p>
                          )}

                          {allDecided && !allApproved && (
                            <div style={{
                              display: 'flex', alignItems: 'center', gap: 10,
                              padding: '10px 14px', borderRadius: 8, marginBottom: 16,
                              backgroundColor: '#fafaf9', border: '1px solid #e7e5e4',
                            }}>
                              <RotateCcw style={{ width: 14, height: 14, color: '#746e69', flexShrink: 0 }} />
                              <p style={{ fontSize: 13, color: '#57534e', margin: 0, fontWeight: 500 }}>
                                {/* "E agora?" respondido (rodada 4): a peça não pede
                                    nada de você até a nova arte chegar. */}
                                Nada a decidir nesta peça agora — a Arte está preparando a nova versão e você é avisado quando ela chegar.
                              </p>
                            </div>
                          )}
                          {allApproved && (
                            <div style={{
                              display: 'flex', alignItems: 'center', gap: 10,
                              padding: '10px 14px', borderRadius: 8, marginBottom: 16,
                              backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0',
                            }}>
                              <CheckCircle style={{ width: 14, height: 14, color: '#15803d', flexShrink: 0 }} />
                              <p style={{ fontSize: 13, color: '#15803d', margin: 0, fontWeight: 600 }}>
                                Todos os patrocinadores aprovaram este ativo.
                              </p>
                            </div>
                          )}

                          {loadingSponsorApprovals ? (
                            <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
                              <Loader2 style={{ width: 20, height: 20, color: '#a8a29e' }} className="animate-spin" />
                            </div>
                          ) : dialogSponsors.length === 0 ? (
                            <p style={{ fontSize: 13, color: '#746e69' }}>Nenhum patrocinador vinculado</p>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                              {dialogSponsors.map((sponsor: any) => {
                                const approval = sponsorApprovals.find(a => a.sponsorId === sponsor.id);
                                const status = approval?.status || 'pending';
                                // Neste modal, awaiting_arte conta como reprovado (a Arte
                                // está refazendo por causa de uma reprovação).
                                const v = approvalVisual(status);
                                const { isApproved, isNewVersion } = v;
                                const isRejected = v.isRejected || v.isAwaitingArte;
                                const isPending = status === 'pending' || isNewVersion;
                                const isRejectingThis = rejectingSponsorId === sponsor.id;
                                // Revogar (pedido do dono, 21/08): o Atendimento desfaz a
                                // decisão enquanto a peça está em aprovação ou na finalização
                                // da Arte; o admin, sempre. O servidor confere o mesmo.
                                const podeRevogar = user?.role === "admin"
                                  || (canDecide && (selectedItem.status === "awaiting_sponsor_approval" || selectedItem.status === "sponsor_approved"));

                                return (
                                  <div
                                    key={sponsor.id}
                                    style={{
                                      padding: '14px 16px', borderRadius: 12,
                                      border: '1.5px solid',
                                      borderColor: isApproved ? '#86efac' : isRejected ? '#fecaca' : '#e7e5e4',
                                      backgroundColor: isApproved ? '#f0fdf4' : isRejected ? '#fef2f2' : '#fafaf9',
                                    }}
                                  >
                                    {/* flexWrap (31/08, print 'cortando ainda'): com 3 botões
                                        (Reprovar/Aprovar/Desvincular) a fileira estourava a
                                        largura do painel e nascia rolagem horizontal. */}
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: isRejectingThis ? 12 : 0 }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <div style={{
                                          width: 32, height: 32, borderRadius: '50%',
                                          backgroundColor: isApproved ? '#86efac' : isRejected ? '#fecaca' : '#fff7ed',
                                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                                          border: isPending ? '1.5px solid #fed7aa' : 'none',
                                        }}>
                                          {isApproved
                                            ? <CheckCircle style={{ width: 14, height: 14, color: '#15803d' }} />
                                            : isRejected
                                            ? <XCircle style={{ width: 14, height: 14, color: '#dc2626' }} />
                                            : <Clock style={{ width: 14, height: 14, color: '#f97316' }} />}
                                        </div>
                                        <div>
                                          <p style={{ fontSize: 13, fontWeight: 700, color: '#1c1917', margin: 0 }}>{sponsor.name}</p>
                                          {/* Cores de `approvalVisual`, a fonte da tela:
                                              "Nova versão" era AZUL só aqui (#0369a1)
                                              e âmbar em todo o resto — o mesmo estado
                                              com duas cores. E #b91c1c no reprovado:
                                              #dc2626 fica abaixo de AA sobre o rosa. */}
                                          <p style={{
                                            fontSize: 12, margin: '2px 0 0', fontWeight: 700,
                                            color: isApproved ? '#15803d' : isRejected ? '#b91c1c' : isNewVersion ? '#92400e' : '#b45309',
                                          }}>
                                            {isApproved ? 'Aprovado' : isRejected ? 'Reprovado' : isNewVersion ? 'Nova versão para decidir' : 'Aguardando decisão'}
                                          </p>
                                        </div>
                                      </div>

                                      {isPending && !isRejectingThis && (
                                        <div style={{ display: 'flex', gap: 6, flexDirection: isMobile ? 'column' : 'row', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                          <button
                                            onClick={() => { if (!decisaoTravada()) setRejectingSponsorId(sponsor.id); }}
                                            disabled={individualRejectMutation.isPending || !canDecide || pecaRecemAberta}
                                            // "Reprovar faz o quê?" antes do clique (rodada 4).
                                            title={!canDecide ? "Somente Atendimento e administradores decidem aprovações" : `Abre o campo do motivo. A Arte refaz a arte por causa de ${sponsor.name}; os patrocinadores com aprovação estrita também esperam a nova versão, e os demais pendentes seguem podendo aprovar.`}
                                            style={{
                                              padding: '8px 16px', borderRadius: 8,
                                              backgroundColor: '#fef2f2', border: '1px solid #fecaca',
                                              color: '#b91c1c', fontSize: 13, fontWeight: 700,
                                              cursor: canDecide ? 'pointer' : 'not-allowed', transition: 'all 0.15s',
                                              opacity: canDecide && !pecaRecemAberta ? 1 : 0.5,
                                              minHeight: isMobile ? 44 : 36,
                                              width: isMobile ? '100%' : undefined,
                                            }}
                                            aria-label={`Reprovar para ${sponsor.name}`}
                                          >
                                            Reprovar
                                          </button>
                                          <button
                                            onClick={() => { if (!decisaoTravada()) setConfirmApproveIndividual({ itemId: selectedItem.id, sponsorId: sponsor.id, sponsorName: sponsor.name || 'Patrocinador' }); }}
                                            disabled={individualApproveMutation.isPending || !canDecide || pecaRecemAberta}
                                            title={!canDecide ? "Somente Atendimento e administradores decidem aprovações" : `Registra a aprovação de ${sponsor.name} (dá para revogar depois)`}
                                            data-testid={`button-approve-sponsor-${sponsor.id}`}
                                            style={{
                                              padding: '8px 16px', borderRadius: 8,
                                              backgroundColor: '#f0fdf4', border: '1px solid #86efac',
                                              color: '#15803d', fontSize: 13, fontWeight: 700,
                                              cursor: canDecide ? 'pointer' : 'not-allowed', transition: 'all 0.15s',
                                              opacity: canDecide && !pecaRecemAberta ? 1 : 0.5,
                                              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                                              minHeight: isMobile ? 44 : 36,
                                              width: isMobile ? '100%' : undefined,
                                            }}
                                            aria-label={`Aprovar para ${sponsor.name}`}
                                          >
                                            {individualApproveMutation.isPending
                                              ? <Loader2 style={{ width: 12, height: 12 }} className="animate-spin" />
                                              : <CheckCircle style={{ width: 12, height: 12 }} />}
                                            Aprovar
                                          </button>
                                          {/* DESVINCULAR (25/08, admin): a marca não é desta
                                              peça — sai, e a pendência dele deixa de contar.
                                              Se era o único que faltava, a peça segue. */}
                                          {user?.role === "admin" && (
                                            <button
                                              onClick={() => setDesvincularAlvo({ itemId: selectedItem.id, sponsorId: sponsor.id, sponsorName: sponsor.name || "Patrocinador" })}
                                              disabled={desvincularSponsorMutation.isPending}
                                              title="Desvincular este patrocinador da peça — a aprovação pendente dele deixa de contar (admin)"
                                              data-testid={`button-desvincular-sponsor-${sponsor.id}`}
                                              style={{
                                                padding: '8px 12px', borderRadius: 8,
                                                backgroundColor: '#ffffff', border: '1px solid #e7e5e4',
                                                color: '#57534e', fontSize: 13, fontWeight: 700,
                                                cursor: 'pointer', transition: 'all 0.15s',
                                                minHeight: 36,
                                                width: isMobile ? '100%' : undefined,
                                              }}
                                            >
                                              Desvincular
                                            </button>
                                          )}
                                        </div>
                                      )}

                                      {/* Revogar a aprovação / reverter a reprovação: volta a
                                          aguardar decisão. Se a peça já estava "aprovada por
                                          todos", ela volta para a aprovação e a Arte é avisada. */}
                                      {!isPending && !isRejectingThis && podeRevogar && (
                                        <button
                                          onClick={() => revertApprovalMutation.mutate({ itemId: selectedItem.id, sponsorId: sponsor.id })}
                                          disabled={revertApprovalMutation.isPending}
                                          title={`${isApproved ? 'Revogar a aprovação' : 'Reverter a reprovação'} — volta a aguardar decisão${selectedItem.status === 'sponsor_approved' ? '; a peça volta para a aprovação e a Arte é avisada' : ''}`}
                                          data-testid={`button-revert-approval-${sponsor.id}`}
                                          style={{
                                            display: 'flex', alignItems: 'center', gap: 6,
                                            padding: '8px 14px', borderRadius: 8,
                                            backgroundColor: '#fff', border: '1px solid #e7e5e4',
                                            color: '#746e69', fontSize: 13, fontWeight: 700,
                                            cursor: revertApprovalMutation.isPending ? 'default' : 'pointer',
                                            opacity: revertApprovalMutation.isPending ? 0.5 : 1,
                                            minHeight: 36, transition: 'all 0.15s',
                                          }}
                                        >
                                          {revertApprovalMutation.isPending
                                            ? <Loader2 style={{ width: 12, height: 12 }} className="animate-spin" />
                                            : <Undo2 style={{ width: 12, height: 12 }} />}
                                          {isApproved ? 'Revogar' : 'Reverter'}
                                        </button>
                                      )}
                                    </div>

                                    {/* AVISO (dono, 31/08): a Arte está REFAZENDO por esta
                                        reprovação — quem reprovou só volta a decidir quando
                                        a nova arte chegar; os DEMAIS aprovam normalmente.
                                        Largura total, fora do cabeçalho flex (a 1ª versão
                                        nasceu dentro dele e virava uma coluna espremida). */}
                                    {v.isAwaitingArte && (
                                      <div data-testid={`aviso-refazendo-${sponsor.id}`} style={{ marginTop: 10, padding: '10px 12px', background: '#fffbeb', border: '1px solid #fde68a', borderLeft: '3px solid #f59e0b', borderRadius: 8, fontSize: 12.5, color: '#92400e', lineHeight: 1.55 }}>
                                        A <strong>Arte está refazendo uma nova versão</strong> por causa da reprovação de <strong>{sponsor.name}</strong>{approval?.rejectionReason ? <>: <em>“{approval.rejectionReason}”</em></> : null}. Ele só volta a decidir quando a nova arte chegar — os demais patrocinadores seguem aprovando normalmente.
                                      </div>
                                    )}
                                    {/* Motivo de reprovação existente (o aviso acima já o
                                        cita quando a linha está com a Arte) */}
                                    {isRejected && !v.isAwaitingArte && approval?.rejectionReason && (
                                      <div style={{ marginTop: 10, padding: '10px 12px', backgroundColor: '#fff', borderRadius: 8, border: '1px solid #fecaca', borderLeft: '3px solid #dc2626' }}>
                                        <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#b91c1c', margin: '0 0 4px' }}>Motivo</p>
                                        <p style={{ fontSize: 13, fontStyle: 'italic', color: '#57534e', margin: 0, lineHeight: 1.5 }}>
                                          "<TextoComLinks texto={approval.rejectionReason} />"
                                        </p>
                                      </div>
                                    )}

                                    {/* Formulário de reprovação inline */}
                                    {isRejectingThis && (
                                      <div style={{ marginTop: 12 }}>
                                        {/* Label */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7 }}>
                                          <div style={{ width: 2, height: 12, borderRadius: 999, backgroundColor: '#dc2626', flexShrink: 0 }} />
                                          <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#dc2626' }}>Motivo da reprovação</span>
                                          <span style={{ fontSize: 11, color: '#b91c1c', fontWeight: 700, lineHeight: 1 }}>*</span>
                                        </div>
                                        {/* O EFEITO, antes de escrever (rodada 4): a dúvida
                                            "reprovar trava a peça inteira?" segurava o
                                            clique. Não trava — só esta marca espera a
                                            nova arte. */}
                                        <p style={{ margin: '0 0 7px', fontSize: 12, color: '#57534e', lineHeight: 1.45 }}>
                                          A Arte recebe este motivo e refaz a arte. {sponsor.name} e os patrocinadores com aprovação estrita (que perdem a aprovação já dada) esperam a nova versão; os demais pendentes seguem podendo aprovar.
                                        </p>

                                        {/* Textarea nativa — sem reset de className interferindo no foco */}
                                        {/* autoFocus: "Reprovar" abre este campo para
                                            ESCREVER — sem o foco, era um segundo clique
                                            obrigatório em toda reprovação. Ctrl+Enter
                                            confirma pela MESMA trava do botão abaixo. */}
                                        <textarea
                                          autoFocus
                                          value={rejectionReason}
                                          onChange={e => setRejectionReason(e.target.value)}
                                          onKeyDown={e => {
                                            if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey)) return;
                                            e.preventDefault();
                                            if (individualRejectMutation.isPending || motivoCurto(rejectionReason)) return;
                                            individualRejectMutation.mutate({ itemId: selectedItem.id, sponsorId: sponsor.id, reason: rejectionReason });
                                          }}
                                          placeholder="Descreva o problema para a equipe de Arte..."
                                          rows={3}
                                          data-testid={`textarea-reject-reason-${sponsor.id}`}
                                          style={{
                                            width: '100%', boxSizing: 'border-box',
                                            padding: '10px 12px', fontSize: 13,
                                            fontFamily: 'inherit', color: '#1c1917',
                                            backgroundColor: '#fff',
                                            border: `1.5px solid ${rejectionReason.trim() ? '#dc2626' : '#e7e5e4'}`,
                                            borderRadius: 8, resize: 'none', lineHeight: 1.5,
                                            transition: 'border-color 0.15s, box-shadow 0.15s',
                                          }}
                                          onFocus={e => { e.currentTarget.style.borderColor = '#dc2626'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(220,38,38,0.08)'; }}
                                          onBlur={e => { e.currentTarget.style.borderColor = rejectionReason.trim() ? '#dc2626' : '#e7e5e4'; e.currentTarget.style.boxShadow = 'none'; }}
                                          aria-label={`Motivo da reprovação de ${sponsor.name}`}
                                          aria-required="true"
                                          aria-describedby={motivoCurto(rejectionReason) ? `falta-motivo-${sponsor.id}` : undefined}
                                        />
                                        {/* A régua de 10 caracteres só existia no `title` do botão
                                            (hover, e só no desktop). Dizer quanto falta, à vista,
                                            é o mesmo que o "Devolver" da Arte já faz. */}
                                        {motivoCurto(rejectionReason) ? (
                                          <p id={`falta-motivo-${sponsor.id}`} style={{ margin: '5px 0 0', fontSize: 11.5, color: '#746e69' }}>
                                            {rejectionReason.trim()
                                              ? `Faltam ${Math.max(0, MOTIVO_MIN - rejectionReason.trim().replace(/\s+/g, " ").length)} caracteres — a Arte precisa saber o que refazer.`
                                              : `Mínimo de ${MOTIVO_MIN} caracteres — a Arte precisa saber o que refazer.`}
                                          </p>
                                        ) : (
                                          <p style={{ margin: '5px 0 0', fontSize: 11.5, color: '#57534e' }}>
                                            Pronto. <kbd style={KBD}>Ctrl</kbd>+<kbd style={KBD}>Enter</kbd> confirma.
                                          </p>
                                        )}

                                        {/* Botões */}
                                        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                                          <button
                                            onClick={() => { setRejectingSponsorId(null); setRejectionReason(""); }}
                                            style={{
                                              flex: 1, height: isMobile ? 44 : 36, borderRadius: 8,
                                              background: '#fff', border: '1px solid #e7e5e4',
                                              color: '#57534e', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                                              transition: 'background 0.12s',
                                            }}
                                            onMouseEnter={e => { e.currentTarget.style.background = '#f5f5f4'; }}
                                            onMouseLeave={e => { e.currentTarget.style.background = '#fff'; }}
                                          >
                                            Cancelar
                                          </button>
                                          <button
                                            onClick={() => individualRejectMutation.mutate({ itemId: selectedItem.id, sponsorId: sponsor.id, reason: rejectionReason })}
                                            disabled={individualRejectMutation.isPending || motivoCurto(rejectionReason)}
                                            title={motivoCurto(rejectionReason) ? `Explique em pelo menos ${MOTIVO_MIN} caracteres — a Arte precisa saber o que refazer.` : undefined}
                                            data-testid={`button-confirm-reject-${sponsor.id}`}
                                            style={{
                                              flex: 2, height: isMobile ? 44 : 36, borderRadius: 8, border: 'none',
                                              // A aparência segue a MESMA régua do `disabled`
                                              // (motivoCurto). Olhava só para "vazio": com 1 a 9
                                              // caracteres o botão ficava vermelho, parecia pronto
                                              // e não respondia ao clique.
                                              backgroundColor: motivoCurto(rejectionReason) ? '#e7e5e4' : '#dc2626',
                                              color: motivoCurto(rejectionReason) ? '#57534e' : '#fff',
                                              fontSize: 13, fontWeight: 800,
                                              cursor: motivoCurto(rejectionReason) ? 'not-allowed' : 'pointer',
                                              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                              transition: 'background-color 0.15s, box-shadow 0.15s',
                                              boxShadow: motivoCurto(rejectionReason) ? 'none' : '0 2px 8px rgba(220,38,38,0.25)',
                                            }}
                                            onMouseEnter={e => { if (!motivoCurto(rejectionReason)) e.currentTarget.style.backgroundColor = '#b91c1c'; }}
                                            onMouseLeave={e => { if (!motivoCurto(rejectionReason)) e.currentTarget.style.backgroundColor = '#dc2626'; }}
                                          >
                                            {individualRejectMutation.isPending
                                              ? <><Loader2 style={{ width: 13, height: 13 }} className="animate-spin" />Registrando…</>
                                              : <><XCircle style={{ width: 13, height: 13 }} />Reprovar e devolver à Arte</>
                                            }
                                          </button>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {/* ── ADICIONAR PATROCINADOR — SÓ ADMIN ──
                              A arte pode carregar uma marca que ninguém
                              vinculou (caso #2801, Crystal): sem a linha, não
                              há o que aprovar. O admin corrige daqui, sem ir à
                              tela de Vincular. O servidor cria a linha
                              pendente junto com o vínculo. */}
                          {user?.role === "admin" && (() => {
                            const jaNaRodada = new Set(dialogSponsors.map((s: any) => s.id));
                            const idsDoEvento = new Set((vinculosDoEvento as any[]).map((v: any) => v.sponsorId));
                            // DO EVENTO primeiro; o resto do catálogo entra pela
                            // busca (147 nomes não viram lista). O bloco não some
                            // mais quando o evento está completo — a marca da arte
                            // pode ser justamente a que falta no evento (Crystal).
                            const doEvento = (sponsorsDoEvento as any[]).filter((s: any) => !jaNaRodada.has(s.id));
                            const termo = buscaPatrocinador.trim().toLowerCase();
                            const doCatalogo = termo.length >= 2
                              ? (sponsors as any[])
                                  .filter((s: any) => !jaNaRodada.has(s.id) && !idsDoEvento.has(s.id) && String(s.name ?? "").toLowerCase().includes(termo))
                                  .slice(0, 8)
                              : [];
                            const candidatos = [
                              ...doEvento.map((s: any) => ({ ...s, foraDoEvento: false })),
                              ...doCatalogo.map((s: any) => ({ ...s, foraDoEvento: true })),
                            ];
                            return (
                              <div style={{ marginTop: 14, borderTop: "1px dashed #e7e5e4", paddingTop: 12 }}>
                                <button
                                  type="button"
                                  onClick={() => setAddPatrocinadorAberto(v => !v)}
                                  aria-expanded={addPatrocinadorAberto}
                                  data-testid="button-add-patrocinador"
                                  style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "none", padding: 0, fontSize: 12, fontWeight: 700, color: "#78716c", cursor: "pointer" }}
                                >
                                  <PlusCircle style={{ width: 13, height: 13 }} />
                                  Adicionar patrocinador{doEvento.length > 0 ? ` (${doEvento.length} do evento)` : " — buscar no catálogo"} · admin
                                </button>
                                {addPatrocinadorAberto && (
                                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
                                    <p style={{ margin: 0, fontSize: 11, color: "#78716c", lineHeight: 1.45 }}>
                                      Para quando a arte carrega uma marca que não foi vinculada. O patrocinador entra como "Aguardando decisão"; um de fora do evento é vinculado ao evento junto.
                                    </p>
                                    <input
                                      value={buscaPatrocinador}
                                      onChange={(e) => setBuscaPatrocinador(e.target.value)}
                                      placeholder="Buscar no catálogo (ex.: Crystal)…"
                                      aria-label="Buscar patrocinador no catálogo"
                                      data-testid="input-busca-patrocinador"
                                      style={{ height: 34, borderRadius: 8, border: "1px solid #d6d3d1", padding: "0 10px", fontSize: 13, fontFamily: "inherit", color: "#1c1917", backgroundColor: "#fff" }}
                                    />
                                    {termo.length >= 2 && doCatalogo.length === 0 && (
                                      <p style={{ margin: 0, fontSize: 11.5, color: "#78716c" }}>Nada no catálogo com "{buscaPatrocinador.trim()}" fora desta rodada.</p>
                                    )}
                                    {candidatos.map((sp: any) => (
                                      <div key={sp.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 8, backgroundColor: "#fff", border: "1px solid #e7e5e4" }}>
                                        <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: "#1c1917", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                          {sp.name}
                                          {sp.foraDoEvento && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: "#b45309", textTransform: "uppercase" }}>fora do evento</span>}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => adicionarPatrocinador(sp)}
                                          disabled={!!addingPatrocinadorId}
                                          data-testid={`button-add-patrocinador-${sp.id}`}
                                          style={{ height: 30, padding: "0 12px", borderRadius: 7, border: "none", backgroundColor: addingPatrocinadorId === sp.id ? "#e7e5e4" : "#1c1917", color: addingPatrocinadorId === sp.id ? "#57534e" : "#fff", fontSize: 12, fontWeight: 700, cursor: addingPatrocinadorId ? "wait" : "pointer", whiteSpace: "nowrap" }}
                                        >
                                          {addingPatrocinadorId === sp.id ? "Adicionando…" : "Adicionar"}
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                    </div>

                    {/* RODAPÉ DENTRO DA COLUNA DE DECISÃO.

                        Ele atravessava as três colunas no pé do modal, longe da
                        lista de patrocinadores que os botões afetam. Aqui ele
                        fecha a coluna a que pertence, e a arte à esquerda fica
                        com a altura inteira.

                        PRÓXIMA PEÇA é a novidade: a fila já existia (a navegação
                        no cabeçalho), mas depois de decidir a pessoa tinha de
                        subir até o canto para continuar — ou fechar e reencontrar
                        a próxima na lista. Em tinta porque, numa fila, seguir é a
                        ação principal.

                        "Aprovar para todos" perdeu o preenchimento laranja e a
                        sombra colorida: ele decide a peça inteira de uma vez e
                        estava mais convidativo que as decisões por patrocinador
                        logo acima, que são o caminho normal. */}
                    <div style={{
                      padding: '12px 24px', borderTop: '1px solid #f1f0ef',
                      backgroundColor: '#ffffff', flexShrink: 0,
                      display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                    }}>
                      <button
                        onClick={() => setDialogOpen(false)}
                        style={{
                          height: 36, padding: '0 14px', borderRadius: 9,
                          border: '1px solid #e7e5e4', backgroundColor: '#ffffff',
                          color: '#57534e', fontSize: 13, fontWeight: 600,
                          cursor: 'pointer', marginRight: 'auto', whiteSpace: 'nowrap',
                        }}
                      >
                        Fechar
                      </button>

                      {/* Atalho de peça inteira: só enquanto há decisões em
                          aberto. Antes aparecia justamente quando allApproved — e
                          o servidor devolvia 409, porque o item já tinha saído de
                          awaiting_sponsor_approval.

                          O "Reprovar Ativo" FOI EMBORA (decisão do dono, 17/08):
                          reprovar a peça inteira e reprovar por patrocinador eram
                          duas portas para o MESMO fato e levavam a peça para
                          lugares diferentes — a individual a deixava em
                          "Aguardando aprovação" e ela caía na aba Correção; esta
                          a jogava para "Aguardando envio", no meio de 1.120 peças
                          que nunca tinham sido enviadas. A Arte perdia a diferença
                          entre RETRABALHO e trabalho novo — foi assim que a #1527
                          se escondeu. */}
                      {dialogSponsors.length > 0 && !allApproved && !allDecided && (
                        <button
                          onClick={() => { if (!decisaoTravada()) sponsorApproveMutation.mutate(selectedItem.id); }}
                          disabled={sponsorApproveMutation.isPending || !canDecide || pecaRecemAberta}
                          title={!canDecide ? "Somente Atendimento e administradores decidem aprovações" : `Aprova ${selectedItem.displayId} para TODOS os patrocinadores de uma vez`}
                          data-testid="button-approve-item"
                          style={{
                            height: 36, padding: '0 14px', borderRadius: 9,
                            border: '1px solid #e7e5e4', backgroundColor: '#ffffff',
                            color: '#1c1917', fontSize: 13, fontWeight: 700,
                            cursor: canDecide ? 'pointer' : 'not-allowed',
                            display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
                            opacity: sponsorApproveMutation.isPending || !canDecide || pecaRecemAberta ? 0.5 : 1,
                          }}
                        >
                          {sponsorApproveMutation.isPending
                            ? <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" />
                            : <CheckCircle style={{ width: 14, height: 14 }} />}
                          Aprovar para todos
                        </button>
                      )}

                      {(() => {
                        const qIdx = reviewQueue.findIndex((i: any) => i.id === selectedItem.id);
                        const hasNext = qIdx >= 0 && qIdx < reviewQueue.length - 1;
                        if (!hasNext) return null;
                        return (
                          <button
                            onClick={() => goToAdjacentItem(1)}
                            data-testid="button-next-item-footer"
                            title="Abrir a próxima peça da fila sem voltar para a lista"
                            style={{
                              height: 36, padding: '0 16px', borderRadius: 9,
                              border: '1px solid #1c1917', backgroundColor: '#1c1917',
                              color: '#ffffff', fontSize: 13, fontWeight: 700,
                              cursor: 'pointer',
                              display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
                            }}
                          >
                            Próxima peça
                            <ChevronRight aria-hidden="true" style={{ width: 14, height: 14 }} />
                          </button>
                        );
                      })()}
                    </div>
                  </div>

                </div>


              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ── CONFIRMAÇÃO: Aprovar Individual ─────────────────────────────── */}
      {/* Desvincular patrocinador (25/08): a confirmação diz o efeito real —
          inclusive que a peça pode SEGUIR se ele era o único que faltava. */}
      <Dialog open={!!desvincularAlvo} onOpenChange={(open) => { if (!open) setDesvincularAlvo(null); }}>
        <DialogContent className={HIDE_NATIVE_CLOSE} style={modalSurface(460)}>
          <DialogTitle className="sr-only">Desvincular patrocinador</DialogTitle>
          <ModalHeader
            variant="confirm"
            icon={XCircle}
            tint="#b91c1c"
            title="Desvincular patrocinador"
            onClose={() => setDesvincularAlvo(null)}
          />
          <div style={{ padding: '20px 24px', overflowY: 'auto', flex: '1 1 auto', minHeight: 0 }}>
            <DialogDescription style={{ fontSize: 13, color: '#57534e', lineHeight: 1.6, margin: 0 }}>
              Tirar <strong style={{ color: '#1c1917' }}>{desvincularAlvo?.sponsorName}</strong> desta peça?
              A aprovação <strong>pendente</strong> dele deixa de contar — e, se ele for o único que falta, a rodada fecha e a peça segue para a finalização da Arte. Aprovações já dadas por outros permanecem no histórico.
            </DialogDescription>
          </div>
          <ModalFooter>
            <button
              onClick={() => { if (desvincularAlvo) desvincularSponsorMutation.mutate({ itemId: desvincularAlvo.itemId, sponsorId: desvincularAlvo.sponsorId }); }}
              disabled={desvincularSponsorMutation.isPending}
              data-testid="button-confirm-desvincular"
              style={{ width: '100%', height: 44, borderRadius: 9, backgroundColor: '#1c1917', border: 'none', color: '#ffffff', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              {desvincularSponsorMutation.isPending && <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" />}
              Desvincular
            </button>
          </ModalFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmApproveIndividual} onOpenChange={(open) => { if (!open) setConfirmApproveIndividual(null); }}>
        {/* FOCO NO "APROVAR". O Radix focava o primeiro focável — o X do
            cabeçalho —, e confirmar pedia mirar o botão de novo com o mouse ou
            dois Tabs. A pergunta é de uma palavra e reversível (dá para
            revogar): Enter confirma, Esc cancela. */}
        <DialogContent
          className={HIDE_NATIVE_CLOSE}
          style={modalSurface(440)}
          onOpenAutoFocus={(e) => {
            const alvo = (e.currentTarget as HTMLElement | null)?.querySelector('[data-testid="button-confirm-approve-individual"]') as HTMLElement | null;
            if (alvo) { e.preventDefault(); alvo.focus(); }
          }}
        >
          <DialogTitle className="sr-only">Confirmar aprovação</DialogTitle>
          <ModalHeader
            variant="confirm"
            icon={CheckCircle}
            tint="#15803d"
            title="Confirmar aprovação"
            onClose={() => setConfirmApproveIndividual(null)}
          />
          {/* ALTURA: cabeçalho 80 + este corpo 82 + rodapé 120 = 282px, e em 445
              de altura sobram 397 — este modal NÃO cortava em nenhuma das
              alturas conferidas. A rolagem é preventiva: com o teto e o
              `overflow: hidden` que o `modalSurface` agora traz, um nome de
              patrocinador longo (a única parte elástica) seria recortado em
              silêncio se não houvesse scrollport. */}
          <div style={{ padding: '20px 24px', overflowY: 'auto', flex: '1 1 auto', minHeight: 0 }}>
            <DialogDescription style={{ fontSize: 13, color: '#57534e', lineHeight: 1.6, margin: 0 }}>
              Aprovar a arte para o patrocinador <strong style={{ color: '#1c1917' }}>{confirmApproveIndividual?.sponsorName}</strong>?
 Dá para revogar depois, enquanto a peça estiver em aprovação ou na finalização da Arte.
            </DialogDescription>
          </div>
          <ModalFooter>
            <button
              onClick={() => {
                if (confirmApproveIndividual) {
                  individualApproveMutation.mutate({ itemId: confirmApproveIndividual.itemId, sponsorId: confirmApproveIndividual.sponsorId });
                  setConfirmApproveIndividual(null);
                }
              }}
              disabled={individualApproveMutation.isPending}
              data-testid="button-confirm-approve-individual"
              // TINTA. Verde e o ESTADO 'aprovado' nesta tela — o que a peca
              // vira DEPOIS da decisao. Pintar de verde o botao que ainda vai
              // decidir usa a cor do resultado para fazer o pedido.
              style={{ width: '100%', height: 44, borderRadius: 9, backgroundColor: '#1c1917', border: 'none', color: '#ffffff', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              <CheckCircle style={{ width: 15, height: 15 }} />
              {/* O CTA diz o resultado e para quem (rodada 4). */}
              {`Aprovar para ${confirmApproveIndividual?.sponsorName ?? 'o patrocinador'}`}
            </button>
            <button
              onClick={() => setConfirmApproveIndividual(null)}
              style={{ width: '100%', height: 36, borderRadius: 8, background: 'none', border: 'none', color: '#746e69', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >
              Cancelar
            </button>
          </ModalFooter>
        </DialogContent>
      </Dialog>

      {/* ── CONFIRMAÇÃO: Aprovar em Lote ────────────────────────────────── */}
      <Dialog open={confirmApproveBatch} onOpenChange={(open) => { if (!open) setConfirmApproveBatch(false); }}>
        {/* Mesmo foco inicial da confirmação individual: Enter aprova. */}
        <DialogContent
          className={HIDE_NATIVE_CLOSE}
          style={modalSurface(440)}
          onOpenAutoFocus={(e) => {
            const alvo = (e.currentTarget as HTMLElement | null)?.querySelector('[data-testid="button-confirm-batch-approve"]') as HTMLElement | null;
            if (alvo) { e.preventDefault(); alvo.focus(); }
          }}
        >
          <DialogTitle className="sr-only">Confirmar aprovação em lote</DialogTitle>
          <ModalHeader
            variant="confirm"
            icon={CheckCircle}
            tint="#15803d"
            title="Confirmar aprovação em lote"
            onClose={() => setConfirmApproveBatch(false)}
          />
          {/* Mesma conta do modal individual acima: 282px de modal contra 397
              disponíveis em 445 de altura — NÃO cortava. Scrollport preventivo
              pelo teto que o `modalSurface` passou a impor. */}
          <div style={{ padding: '20px 24px', overflowY: 'auto', flex: '1 1 auto', minHeight: 0 }}>
            <DialogDescription style={{ fontSize: 13, color: '#57534e', lineHeight: 1.6, margin: 0 }}>
              Aprovar <strong style={{ color: '#1c1917' }}>{batchSelectedItemIds.size} {batchSelectedItemIds.size === 1 ? 'peça' : 'peças'}</strong> para <strong style={{ color: '#1c1917' }}>{batchSponsorNome}</strong>{batchEventoNome ? <> em {batchEventoNome}</> : null}?
              Dá para revogar depois, enquanto a peça estiver em aprovação ou na finalização da Arte.
            </DialogDescription>
          </div>
          <ModalFooter>
            <button
              onClick={() => {
                batchSponsorMutation.mutate({ sponsorId: batchSponsorId, eventId: batchEventId, action: "approve" });
                setConfirmApproveBatch(false);
              }}
              disabled={batchSponsorMutation.isPending}
              data-testid="button-confirm-batch-approve"
              // TINTA. Verde e o ESTADO 'aprovado' nesta tela — o que a peca
              // vira DEPOIS da decisao. Pintar de verde o botao que ainda vai
              // decidir usa a cor do resultado para fazer o pedido.
              style={{ width: '100%', height: 44, borderRadius: 9, backgroundColor: '#1c1917', border: 'none', color: '#ffffff', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              <CheckCircle style={{ width: 15, height: 15 }} />
              {`Aprovar ${batchSelectedItemIds.size} ${batchSelectedItemIds.size === 1 ? 'peça' : 'peças'} para ${batchSponsorNome}`}
            </button>
            <button
              onClick={() => setConfirmApproveBatch(false)}
              style={{ width: '100%', height: 36, borderRadius: 8, background: 'none', border: 'none', color: '#746e69', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >
              Cancelar
            </button>
          </ModalFooter>
        </DialogContent>
      </Dialog>

      {/* Exportar PDF — mesmo motor e opções da Arte */}
      <ExportPdfDialog
        open={showExportPDFModal}
        onOpenChange={setShowExportPDFModal}
        items={exportPoolCongelado}
        title="Aprovação"
      />

      {/* Preview da arte no lote — abre pela miniatura, sem mexer na seleção */}
      <Dialog open={!!batchPreviewItem} onOpenChange={o => !o && setBatchPreviewItem(null)}>
        <DialogContent
          className="p-0 gap-0"
          // ALTURA: cabeçalho 72 + imagem com teto de 75vh + 32 de padding.
          // Em 445 de altura isso dava 438px de modal contra 397 disponíveis, e
          // o Radix cortava 20px de cada lado — o `overflow: hidden` daqui
          // impedia rolar até eles. Os 75vh eram um desconto CHUTADO: 75% da
          // viewport para a imagem, sem relação com o cabeçalho real.
          // A CONTA certa é `100vh − 48` no Content (24px de respiro em cima e
          // 24 embaixo, simétrico porque o Radix centra), com coluna flex: o
          // cabeçalho não encolhe e a área da imagem fica com o que sobrar.
          style={{ maxWidth: 900, width: '95vw', borderRadius: 12, overflow: 'hidden', maxHeight: 'calc(100vh - 48px)', display: 'flex', flexDirection: 'column' }}
        >
          <DialogTitle className="sr-only">Arte da peça</DialogTitle>
          <DialogDescription className="sr-only">Visualização ampliada da arte enviada</DialogDescription>
          {batchPreviewItem && (
            <>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid #f0ede8', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                <span style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 800, color: '#9a3412', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 6, padding: '2px 6px' }}>
                  {batchPreviewItem.displayId}
                </span>
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#1c1917', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{batchPreviewItem.type}</p>
                  {batchPreviewItem.description && (
                    <p style={{ margin: 0, fontSize: 13, color: '#746e69', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{batchPreviewItem.description}</p>
                  )}
                </div>
              </div>
              <div style={{ background: '#f7f8fa', overflow: 'auto', flex: '1 1 auto', minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, position: 'relative' }}>
                <img
                  src={batchPreviewItem.approvalThumbUrl}
                  alt={batchPreviewItem.type}
                  decoding="async"
                  style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }}
                  onError={(e) => {
                    // Mesmo fallback dos demais thumbs: esconde a imagem quebrada
                    // e mostra o aviso ao lado.
                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                    const fb = (e.currentTarget as HTMLImageElement).nextElementSibling as HTMLElement | null;
                    if (fb?.dataset.fallback) fb.style.display = 'flex';
                  }}
                />
                <div data-fallback="1" style={{ display: 'none', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '48px 0' }}>
                  <FileText style={{ width: 32, height: 32, color: '#a8a29e' }} />
                  <p style={{ fontSize: 13, color: '#746e69', margin: 0 }}>Não foi possível carregar a arte</p>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
