import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { TextoComLinks } from "@/components/texto-com-links";
import { SponsorChips } from "@/components/sponsor-chips";
import { FilterSelect } from "@/components/filter-select";
import { EventFilterDropdown } from "@/components/event-filter-dropdown";
import { ExportPdfDialog } from "@/components/export-pdf-dialog";
import { CheckCircle, AlertCircle, Eye, Search, X, XCircle, Clock, Loader2, ChevronDown, ChevronRight, Zap, FileText, Download, RotateCcw, Package, Paperclip, Plus, Pencil, Trash2, Truck, Cog, Send, Link2, Unlock, Upload, ImageIcon, ArrowRightLeft, Check } from "lucide-react";
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
  getStatusMeta, getStatusLabel, getStatusShort, PRODUCTION_STATUSES,
  isEventoFinalizado, motivoEventoFinalizado, marcoEventoFinalizado,
  avisoPecasOcultas, todayBusinessMs,
} from "@/lib/status";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
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
import { ModalHeader, ModalFooter, modalSurface, HIDE_NATIVE_CLOSE } from "@/components/modal-shell";

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
    text:   isApproved ? '#15803d' : isRejected ? '#b91c1c' : isAwaitingArte ? '#b91c1c' : isNewVersion ? '#92400e' : '#6b7280',
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
  aguardando_arte: { label: "Reprovado · Arte refazendo", hint: "O patrocinador reprovou e a Arte está refazendo — nada a fazer aqui por enquanto" },
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

// ── Pipeline de fluxo do cartão de histórico (10 etapas) ───────────────────
// Const de módulo: antes era recriado a cada card renderizado. As etapas de
// produção/entrega derivam da lista canônica PRODUCTION_STATUSES da lib de
// status (+ aliases legados que versões antigas gravaram no banco).
const [ST_IN_PRODUCTION, ST_PRODUCED, ST_CONFERRED, ST_DELIVERED] = PRODUCTION_STATUSES;
const PIPELINE_STAGES: { key: string; label: string; color: string; statuses: string[] }[] = [
  { key: 'solicitado',   label: 'Solicitado',      color: '#f97316', statuses: ['draft', 'requested', 'solicitado'] },
  { key: 'vinculacao',   label: 'Vinculação',      color: '#746e69', statuses: ['awaiting_linking'] },
  { key: 'ag_aprovacao', label: 'Ag. Aprovação',   color: '#f97316', statuses: ['awaiting_submission', 'awaiting_approval', 'awaiting_sponsor_approval'] },
  { key: 'aprovado',     label: 'Aprovado',        color: '#22c55e', statuses: ['sponsor_approved'] },
  { key: 'finalizacao',  label: 'Finalização',     color: '#a855f7', statuses: ['awaiting_finalization', 'awaiting_creator_review'] },
  { key: 'revisao',      label: 'Revisão',         color: '#d946ef', statuses: ['awaiting_final_review'] },
  { key: 'pronto',       label: 'Pronto p/ Prod.', color: '#10b981', statuses: ['ready_for_production', 'pronto_para_producao', 'approved', 'liberado'] },
  { key: 'producao',     label: 'Em Produção',     color: '#f59e0b', statuses: [ST_IN_PRODUCTION, 'in_production', 'em_producao'] },
  { key: 'produzido',    label: 'Produzido',       color: '#ec4899', statuses: [ST_PRODUCED, 'produzido'] },
  { key: 'entregue',     label: 'Entregue',        color: '#7c3aed', statuses: [ST_CONFERRED, 'conferido', ST_DELIVERED, 'entregue'] },
];

// ── A JORNADA DA PEÇA, EM UMA LEITURA SÓ ───────────────────────────────────
//
// O cartão do histórico contava a mesma história duas vezes: uma trilha de
// MARCOS (datas, em texto) e um pipeline de 10 ETAPAS (posição, em bolinhas),
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
  entregue:     (i) => i.deliveredAt ?? i.conferredAt,
};

const DIA_MS = 86400000;

/** Tom do intervalo: uma semana é normal, duas já é o assunto da reunião. */
function tomDoIntervalo(dias: number): string {
  return dias >= 14 ? '#b91c1c' : dias >= 7 ? '#b45309' : '#57534e';
}

function jornadaDaPeca(item: any, agora: number) {
  const atual = PIPELINE_STAGES.findIndex(s => s.statuses.includes(item.status));
  let anterior: number | null = null;
  const etapas = PIPELINE_STAGES.map((stage, i) => {
    const carimbo = DATA_DA_ETAPA[stage.key]?.(item);
    const ms = carimbo ? new Date(carimbo).getTime() : null;
    const desdeAnterior = ms !== null && anterior !== null
      ? Math.max(0, Math.round((ms - anterior) / DIA_MS))
      : null;
    if (ms !== null && !Number.isNaN(ms)) anterior = ms;
    return {
      key: stage.key, label: stage.label, ms, desdeAnterior,
      cumprida: atual >= 0 && i < atual,
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
  ...PRODUCTION_STATUSES,    // inProduction, produced, conferred, delivered
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
  delivered:        { label: 'Entregue',              bg: '#ede9fe', iconColor: '#7c3aed', icon: Truck },
  produced:         { label: 'Produzido',             bg: '#e0e7ff', iconColor: '#4338ca', icon: Cog },
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

  // Aba ativa: pendentes ou histórico
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

  const [approvedGroupExpanded, setApprovedGroupExpanded] = useState(false);

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

  // Confirmação de aprovação
  const [confirmApproveIndividual, setConfirmApproveIndividual] = useState<{ itemId: string; sponsorId: string; sponsorName: string } | null>(null);
  const [confirmApproveBatch, setConfirmApproveBatch] = useState(false);

  const isMobile = useIsMobile();
  const { data: items = [], isLoading: itemsLoading, isError: itemsError, refetch: refetchItems,
    dataUpdatedAt, isFetching: isFetchingItems } = useQuery<any[]>({
    queryKey: ["/api/items"],
  });

  const { data: events = [], isLoading: eventsLoading } = useQuery<any[]>({
    queryKey: ["/api/events"],
  });

  const { data: sponsors = [] } = useQuery<any[]>({
    queryKey: ["/api/sponsors"],
  });

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
  const { data: standardItems = [] } = useQuery<any[]>({ queryKey: ['/api/standard-items'] });
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

  // Quantas peças a regra acima tirou de vista, POR MOTIVO. Sem este número a
  // tela diria "Nenhum item pendente" — isto é, "nada a fazer" — a quem, na
  // verdade, teve o trabalho retirado; e sem o motivo não dá para saber se há
  // volta (reabrir o evento) ou não (ele já aconteceu).
  const pecasOcultas = useMemo(() => {
    let encerrado = 0, realizado = 0;
    for (const item of items) {
      if (item.status !== 'awaiting_sponsor_approval' || item.skipApproval) continue;
      const motivo = motivoEventoFinalizado(item.event, hojeBusinessMs);
      if (motivo === 'encerrado') encerrado++;
      else if (motivo === 'realizado') realizado++;
    }
    return { encerrado, realizado };
  }, [items, hojeBusinessMs]);
  const avisoOcultas = useMemo(
    () => avisoPecasOcultas(pecasOcultas, 'desta fila'),
    [pecasOcultas],
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
    requestIdRef.current += 1;
    const currentRequestId = requestIdRef.current;

    if (items.length === 0) {
      setItemSponsorsMap({});
      setItemApprovalsMap({});
      setLoadingSponsors(false);
      return;
    }

    setLoadingSponsors(true);

    apiRequest("GET", "/api/items/batch-approval-data")
      .then(res => res.json())
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
        // O item mudou de status: a resposta traz o item atualizado.
        applyItemDecisionToCache(data.item);
        // Peça concluída: segue direto para a próxima da fila, sem voltar à lista.
        const idx = reviewQueue.findIndex((i: any) => i.id === selectedItem?.id);
        const next = idx >= 0 ? reviewQueue[idx + 1] : undefined;
        if (next) {
          setSelectedItem(next);
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
        toast({ title: "Patrocinador aprovou", description: `${sponsorName || 'Patrocinador'} aprovou a peça` });
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

      if (data.allDecided) {
        // Peça resolvida (volta para a Arte): segue para a próxima da fila.
        // Obs.: o endpoint atual não devolve `allDecided` — branch preservado
        // para quando o servidor passar a informar (item 21 do backlog).
        const idx = reviewQueue.findIndex((i: any) => i.id === selectedItem?.id);
        const next = idx >= 0 ? reviewQueue[idx + 1] : undefined;
        if (next) {
          setSelectedItem(next);
          toast({ title: "Peça devolvida para a Arte", description: `Seguindo para ${next.displayId} · ${next.type}` });
        } else {
          setDialogOpen(false);
          setSelectedItem(null);
          toast({ title: "Todos patrocinadores decidiram", description: "Peça retornou para Arte refazer o thumb." });
        }
      } else {
        toast({ title: "Reprovação registrada", description: "O item retorna para Arte preparar nova versão." });
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

  const sponsorApproveMutation = useMutation({
    mutationFn: async (itemId: string) => {
      // O endpoint devolve o item atualizado — dá para remendar o cache.
      const response = await apiRequest("PATCH", `/api/items/${itemId}/sponsor-approve`, {});
      return response.json();
    },
    onSuccess: (item) => {
      applyItemDecisionToCache(item);
      setDialogOpen(false);
      setSelectedItem(null);
      toast({ title: "Peça aprovada", description: "A peça foi aprovada pelo patrocinador com sucesso!" });
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
      const promises = targetItems.flatMap(item => {
        const approvals: SponsorApproval[] = itemApprovalsMap[item.id] || [];
        const approval = approvals.find(a => a.sponsorId === sponsorId);
        const status = approval?.status || "pending";
        if (!itemSponsorsMap[item.id]?.some((s: any) => s.id === sponsorId)) return [];
        if (status !== "pending" && status !== "new_version_pending") return [];
        // Parseia cada resposta: { approval, item?, allApproved? } — permite
        // remendar os caches sem invalidar/refazer as listas inteiras.
        if (action === "approve") {
          return [apiRequest("POST", `/api/items/${item.id}/sponsor-approvals/${sponsorId}/approve`, {}).then(r => r.json())];
        } else {
          return [apiRequest("POST", `/api/items/${item.id}/sponsor-approvals/${sponsorId}/reject`, { rejectionReason: reason || null }).then(r => r.json())];
        }
      });
      return await Promise.all(promises);
    },
    onSuccess: (results: any[], vars) => {
      // Nenhuma requisição saiu (todas as selecionadas já estavam decididas ou
      // sem o patrocinador): avisa em vez de anunciar um sucesso que não houve.
      if (results.length === 0) {
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
      setBatchSponsorId("");
      setBatchEventId("");
      setBatchRejectReason("");
      setBatchShowRejectForm(false);
      toast({
        title: vars.action === "approve" ? "Peças aprovadas em lote" : "Peças reprovadas em lote",
        description: vars.action === "approve"
          ? "Todas as peças selecionadas foram aprovadas para este patrocinador."
          : "Todas as peças selecionadas foram devolvidas para a Arte.",
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
      if (atrasadosFilter && !isEventoAtrasadoNaAprovacao(eventoPorId.get(item.eventId), hoje)) return false;
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
  }, [items, itemSponsorsMap, itemApprovalsMap, events]);

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

  const approvedGroup = useMemo(() => {
    if (loadingSponsors) return [];
    return filteredItems.filter(item => isItemFullyApproved(item));
  }, [filteredItems, itemApprovalsMap, itemSponsorsMap, loadingSponsors]);

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
    const q = normalizarBusca(histSearchTerm);
    if (q &&
        !normalizarBusca(item.type).includes(q) &&
        !normalizarBusca(item.displayId).includes(q) &&
        !normalizarBusca(item.description).includes(q)) return false;

    return true;
  };

  const historyItems = useMemo(() => {
    if (loadingSponsors) return [];
    const latestApproval = (item: any) => {
      const times = (itemApprovalsMap[item.id] || [])
        .filter((a: SponsorApproval) => a.status === 'approved' && a.approvedAt)
        .map((a: SponsorApproval) => new Date(a.approvedAt!).getTime());
      return times.length ? Math.max(...times) : 0;
    };
    const duracaoDe = (item: any) => jornadaDaPeca(item, hoje instanceof Date ? hoje.getTime() : Number(hoje)).duracao ?? -1;
    const nomeDoEvento = (item: any) => (eventoPorId.get(item.eventId)?.name || "").toLowerCase();
    return (items as any[]).filter(item => casaHistorico(item)).sort((a: any, b: any) => {
      if (ordemHistorico === "demoradas") return duracaoDe(b) - duracaoDe(a);
      if (ordemHistorico === "evento") return COLLATOR.compare(nomeDoEvento(a), nomeDoEvento(b)) || latestApproval(b) - latestApproval(a);
      return latestApproval(b) - latestApproval(a);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordemHistorico, hoje, eventoPorId, items, itemApprovalsMap, itemSponsorsMap, loadingSponsors, histEventFilter, histSponsorFilter, histPeriodFilter, histSearchTerm]);

  // As duas facetas da aba Histórico, do MESMO pool da lista. Só o que tem
  // linha aparece, e a contagem ao lado do nome é o número de linhas que o
  // clique entrega.
  const histEventOptions = useMemo(() => {
    if (loadingSponsors) return [] as { value: string; label: string; count: number; dotColor?: string }[];
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
  }, [items, events, itemApprovalsMap, itemSponsorsMap, loadingSponsors, histSponsorFilter, histPeriodFilter, histSearchTerm]);

  const histSponsorOptions = useMemo(() => {
    if (loadingSponsors) return [] as { value: string; label: string; count: number }[];
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
  }, [items, itemApprovalsMap, itemSponsorsMap, loadingSponsors, histEventFilter, histPeriodFilter, histSearchTerm]);

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
  useEffect(() => { setHistVisible(PAGE_SIZE); }, [activeTab, histEventFilter, histSponsorFilter, histPeriodFilter, histSearchTerm]);

  const getEventInfo = (eventId: string) => events.find((e: any) => e.id === eventId);

  const handleViewDetails = (item: any) => {
    // Limpa o motivo/patrocinador de reprovação para não vazar o texto
    // digitado numa peça anterior e reprovar a peça errada com justificativa alheia.
    setRejectionReason("");
    setRejectingSponsorId(null);
    setSelectedItem(item);
    setDialogOpen(true);
  };

  if (itemsLoading || eventsLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (itemsError) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
        <p className="text-base font-semibold text-red-700">Não foi possível carregar os itens</p>
        <p className="text-sm text-muted-foreground">Verifique sua conexão e tente novamente.</p>
        <button onClick={() => refetchItems()} className="mt-1 rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800">
          Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <div className="bg-stone-50" style={{ height: "100%", overflowY: "auto", padding: isMobile ? "12px 12px" : "32px" }}>

      {/* ─── CABEÇALHO ───────────────────────────────────────────── */}
      <header className="mb-6 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="max-w-2xl">
          {/* Eyebrow numa linha só. Eram DOIS selos para dizer onde você
              está: um com moldura laranja ("Fluxo de Verificação"), um ponto
              decorativo e o nome do módulo — três elementos e uma borda para
              uma migalha de pão. */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 5, marginBottom: 10,
            fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase',
          }}>
            <span style={{ color: '#c2410c' }}>Atendimento</span>
            <span style={{ color: '#746e69' }}>· Fluxo de Verificação</span>
          </div>
          <h1 style={{
            fontFamily: "'Space Grotesk', sans-serif",
            // 26/700, a mesma escala da Gestão de Prazos. O `clamp` com peso
            // 900 fazia o título mudar de tamanho conforme a largura da
            // janela e o deixava mais pesado que qualquer número da tela.
            fontSize: 26, fontWeight: 700,
            letterSpacing: '-0.03em', color: '#1c1917',
            lineHeight: 1.15, marginBottom: 8,
          }}>
            Aprovação do Patrocinador
          </h1>
          <p style={{ color: '#746e69', fontSize: 15, fontWeight: 500, lineHeight: 1.5, maxWidth: 660 }}>
            Valide e aprove ativos de marca com cada patrocinador.
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
              style={{
                textAlign: 'left', cursor: 'pointer', minWidth: 0,
                padding: '14px 16px', border: 'none',
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
                fontSize: 34, fontWeight: 700, lineHeight: 1,
                fontVariantNumeric: 'tabular-nums',
                // Zero é neutro: um "0" pintado de vermelho afirmaria o
                // contrário do que o número diz.
                color: c.n === 0 ? '#746e69' : c.cor,
              }}>
                {loadingSponsors ? '—' : c.n}
              </span>
              {/* O `hint` do SITUACAO_META como TEXTO, não como `title`: ele
                  explica o que o número significa e vivia só no hover do
                  menu — ou seja, existia para quem tem mouse e já sabia. */}
              <span style={{ display: 'block', marginTop: 6, fontSize: 12, lineHeight: 1.45, color: '#746e69' }}>
                {c.hint}
              </span>
            </button>
          ))}
          {avisoOcultas && (
            // Peça de evento finalizado — encerrado à mão OU já realizado —
            // não entra nesta fila (ver `awaitingItems`). Esconder em silêncio
            // faria a tela dizer "nada a fazer" para quem, na verdade, teve o
            // trabalho retirado. Fica na mesma superfície do placar: é a
            // linha do que ficou FORA da conta que as células mostram.
            <div
              role="status"
              data-testid="aviso-eventos-encerrados"
              style={{
                gridColumn: '1 / -1', borderTop: '1px solid #f1f0ef',
                backgroundColor: '#fafaf9', padding: '11px 20px',
                fontSize: 13, color: '#44403c', lineHeight: 1.5,
              }}
            >
              <strong>{avisoOcultas.destaque}</strong>{' '}{avisoOcultas.texto}
            </div>
          )}
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
        <div role="tablist" aria-label="Abas de aprovação" style={{
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
            <div style={{ position: 'relative', flex: isMobile ? '1 1 100%' : '0 1 240px' }}>
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
                  style={{ position: 'absolute', right: 2, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#746e69', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <X style={{ width: 14, height: 14 }} />
                </button>
              )}
            </div>

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

            <span
              data-testid="contador-pecas"
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
          style={{ marginBottom: 32, display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', backgroundColor: '#fafaf9', border: '1px solid #e7e5e4', borderRadius: 12 }}
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
            width: '100%', marginBottom: 32, display: 'flex', alignItems: 'center', gap: 12,
            padding: '14px 18px', backgroundColor: '#ffffff', border: '1px solid #e7e5e4',
            borderRadius: 12, cursor: 'pointer', textAlign: 'left',
          }}
        >
          {/* Ladrilho chapado em tinta. O gradiente laranja era o objeto mais
              saturado da tela para marcar um atalho que nem estava aberto. */}
          <div style={{ width: 26, height: 26, borderRadius: 8, backgroundColor: '#1c1917', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Zap style={{ width: 14, height: 14, color: '#ffffff' }} />
          </div>
          <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 14, fontWeight: 800, letterSpacing: '-0.01em', color: '#1c1917', whiteSpace: 'nowrap' }}>
            Aprovação em Lote
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
          style={{ marginBottom: 32, backgroundColor: '#ffffff', border: '1px solid #e7e5e4', borderRadius: 12 }}
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
                  Aprovação em Lote
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
                                  src={item.approvalThumbUrl}
                                  alt=""
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
                              <span style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 700, color: '#9a3412', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 6, padding: '1px 6px', flexShrink: 0 }}>
                                {item.displayId}
                              </span>
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
                          {/* Status thumb */}
                          <div style={{ flexShrink: 0 }}>
                            {hasThumb
                              ? <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#15803d', fontWeight: 700, background: '#dcfce7', border: '1px solid #bbf7d0', borderRadius: 999, padding: '2px 8px' }}>
                                  <CheckCircle style={{ width: 10, height: 10 }} /> Arte OK
                                </span>
                              : <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#92400e', fontWeight: 700, background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 999, padding: '2px 8px' }}>
                                  <AlertCircle style={{ width: 11, height: 11 }} /> Sem arte
                                </span>
                            }
                          </div>
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
                          : 'Selecione peças para aprovar ou recusar'}
                      </p>
                      <div style={{ display: 'flex', gap: 10, flexDirection: isMobile ? 'column' : 'row' }}>
                        <button
                          onClick={() => setBatchShowRejectForm(true)}
                          disabled={batchSponsorMutation.isPending || batchSelectedItemIds.size === 0 || !canDecide}
                          title={!canDecide ? "Somente Atendimento e administradores decidem aprovações" : undefined}
                          data-testid="button-batch-reject"
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                            backgroundColor: '#ffffff', color: '#dc2626',
                            border: '1.5px solid #fca5a5', borderRadius: 8,
                            padding: '10px 18px', fontSize: 13, fontWeight: 700,
                            cursor: batchSelectedItemIds.size === 0 ? 'not-allowed' : 'pointer',
                            opacity: batchSelectedItemIds.size === 0 ? 0.4 : 1,
                            transition: 'filter 0.15s',
                            minHeight: isMobile ? 44 : undefined,
                          }}
                          onMouseEnter={e => { if (batchSelectedItemIds.size > 0) e.currentTarget.style.filter = 'brightness(0.96)'; }}
                          onMouseLeave={e => { e.currentTarget.style.filter = 'none'; }}
                        >
                          <XCircle style={{ width: 15, height: 15 }} />
                          Recusar
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
                          Aprovar {batchSelectedItemIds.size > 0 ? `${batchSelectedItemIds.size} ${batchSelectedItemIds.size === 1 ? 'Peça' : 'Peças'}` : ''}
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
                          <p style={{ fontSize: 13, fontWeight: 800, color: '#dc2626', margin: 0 }}>Recusar {batchSelectedItemIds.size} {batchSelectedItemIds.size === 1 ? 'peça' : 'peças'}</p>
                          <p style={{ fontSize: 11, color: '#b91c1c', margin: 0 }}>O motivo será registrado no histórico e comunicado à Arte</p>
                        </div>
                      </div>
                      <textarea
                        value={batchRejectReason}
                        onChange={e => setBatchRejectReason(e.target.value)}
                        placeholder="Descreva o motivo da recusa para a equipe de Arte..."
                        data-testid="textarea-batch-reject-reason"
                        rows={3}
                        style={{
                          width: '100%', backgroundColor: '#ffffff',
                          border: `1.5px solid ${batchRejectReason.trim() === "" ? '#fca5a5' : '#e7e5e4'}`,
                          color: '#1c1917', borderRadius: 8, padding: '10px 12px',
                          fontSize: 13, resize: 'vertical',
                          boxSizing: 'border-box', lineHeight: 1.5,
                        }}
                      />
                      <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
                        <button
                          onClick={() => { setBatchShowRejectForm(false); setBatchRejectReason(""); }}
                          style={{ backgroundColor: '#ffffff', color: '#746e69', border: '1px solid #e7e5e4', borderRadius: 8, padding: '10px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={() => batchSponsorMutation.mutate({ sponsorId: batchSponsorId, eventId: batchEventId, action: "reject", reason: batchRejectReason })}
                          disabled={batchSponsorMutation.isPending || motivoCurto(batchRejectReason) || !canDecide}
                          title={!canDecide ? "Somente Atendimento e administradores decidem aprovações"
                            : motivoCurto(batchRejectReason) ? `Explique em pelo menos ${MOTIVO_MIN} caracteres — a Arte precisa saber o que refazer.` : undefined}
                          data-testid="button-batch-confirm-reject"
                          style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            backgroundColor: batchRejectReason.trim() === "" ? '#e7e5e4' : '#dc2626',
                            color: '#ffffff', border: 'none', borderRadius: 8,
                            padding: '9px 20px', fontSize: 13, fontWeight: 800,
                            cursor: batchRejectReason.trim() === "" ? 'not-allowed' : 'pointer',
                            fontFamily: "'Space Grotesk', sans-serif",
                          }}
                        >
                          {batchSponsorMutation.isPending
                            ? <Loader2 style={{ width: 13, height: 13 }} className="animate-spin" />
                            : <XCircle style={{ width: 13, height: 13 }} />}
                          Confirmar Recusa
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
          <CheckCircle aria-hidden="true" style={{ width: 28, height: 28, color: '#86efac', margin: '0 auto 12px' }} />
          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1c1917', margin: '0 0 6px' }}>
            {/* Vazio por causa do recorte de atrasados tem texto próprio: com o
                filtro ligado, "Nenhum item pendente" leria como "nada a fazer"
                enquanto a fila inteira continua ali, dentro do prazo. */}
            {atrasadosFilter
              ? "Nada atrasado neste recorte"
              : pendingItems.length === 0 ? "Nenhum item pendente" : "Nenhum resultado encontrado"}
          </h3>
          <p style={{ color: '#746e69', fontSize: 13, lineHeight: 1.5, maxWidth: 520, margin: '0 auto' }} data-testid="empty-atendimento-motivo">
            {atrasadosFilter
              ? `A lista está vazia pelo FILTRO "Atrasados" — ${filteredItemsBase.length === 0 ? 'os demais filtros já não devolvem nenhuma peça' : `as ${filteredItemsBase.length} peças deste recorte estão todas dentro do prazo de Aprovação de Layout`}.`
              : pendingItems.length === 0
              ? "Não há itens aguardando aprovação do patrocinador no momento."
              : "Tente ajustar os filtros para ver mais resultados."}
          </p>
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
                  style={{
                    marginLeft: 'auto', height: isMobile ? 44 : 32, padding: '0 14px', borderRadius: 8,
                    border: 'none', backgroundColor: '#1c1917', color: '#ffffff', cursor: 'pointer',
                    fontFamily: 'inherit', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
                    display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0,
                  }}
                >
                  <Play style={{ width: 13, height: 13 }} />
                  Decidir {filaDaSuaMesa.length === 1 ? 'a peça' : `as ${filaDaSuaMesa.length}`} em fila
                </button>
              )}
            </div>
          )}

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
                  style={{
                    display: 'flex', alignItems: 'center', gap: 16,
                    paddingBottom: 16, marginBottom: 16,
                    borderBottom: '1px solid #e7e5e4',
                    cursor: 'pointer', userSelect: 'none',
                  }}
                >
                  <ChevronDown
                    style={{
                      width: 16, height: 16, color: '#a8a29e', flexShrink: 0,
                      transform: eventoAberto(eventId) ? 'none' : 'rotate(-90deg)',
                      transition: 'transform 0.15s',
                    }}
                  />
                  <div
                    title="Evento com itens aguardando aprovação"
                    style={{
                      width: 8, height: 8, borderRadius: '50%',
                      backgroundColor: '#f97316', flexShrink: 0,
                    }} />
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
                    const s = diff < 0
                      ? { bg: '#FEE2E2', border: '#FECACA', text: '#B84040' }
                      : diff === 0
                      ? { bg: '#FEF3E7', border: '#FED7AA', text: '#D97A1E' }
                      : diff <= 3
                      ? { bg: '#FDF0E8', border: '#FDDBC4', text: '#C97B4B' }
                      : { bg: '#F3F2F0', border: '#E7E3DC', text: '#6F6A63' };
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
                  <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'baseline', gap: 6, flexShrink: 0, whiteSpace: 'nowrap' }}>
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

                {/* Cards */}
                <div style={{ display: eventoAberto(eventId) ? 'flex' : 'none', flexDirection: 'column', gap: 12 }}>
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
                          <div style={{
                            width: isMobile ? 52 : 72, height: isMobile ? 52 : 72, flexShrink: 0, borderRadius: 10,
                            overflow: 'hidden', backgroundColor: '#f5f5f4', position: 'relative',
                            border: '1px solid #e7e5e4',
                          }}>
                            {hasThumb ? (
                              <>
                                <img
                                  src={item.approvalThumbUrl}
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
                                <h3 title={item.type} style={{ fontSize: 14, fontWeight: 700, color: '#1c1917', margin: 0, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {item.type}
                                </h3>
                                {item.isReuse && (
                                  <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', backgroundColor: '#dcfce7', color: '#166534', borderRadius: 999, padding: '2px 8px', flexShrink: 0 }}>
                                    Reaproveit.
                                  </span>
                                )}
                                {/* ONDE A PEÇA ESTÁ. O tipo já carregava o status e o card não o
                                    mostrava: é ele que diz se a decisão que falta ainda cabe no
                                    prazo ou se a peça já seguiu sem ela. */}
                                {(() => {
                                  const meta = getStatusMeta(item.status);
                                  if (!meta) return null;
                                  return (
                                    <span data-testid={`selo-status-${item.id}`} title={`A peça está em "${meta.label}" — é daqui que ela sai quando a decisão que falta chegar`}
                                      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: meta.text, backgroundColor: meta.bg, border: `1px solid ${meta.border}`, borderRadius: 4, padding: '2px 6px', whiteSpace: 'nowrap' }}>
                                      <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: meta.dot, flexShrink: 0 }} />
                                      {meta.short}
                                    </span>
                                  );
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
                                      href={item.referenceUrl}
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
                                    ? "nada a fazer aqui — você é avisado quando voltar"
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
                                const rotulo = isFullyApproved ? "Ver histórico"
                                  : hasArteBlock ? "Ver histórico"
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
              </div>
            );
          })}

          {/* Sem "Carregar mais" na fila: a lista chega inteira. O botão
              paginava PEÇAS antes do agrupamento, então escondia eventos —
              e a pergunta desta tela é "onde há coisa esperando", que uma
              lista parcial responde errado. O Histórico mantém a paginação:
              lá a lista é ilimitada e ninguém a varre inteira. */}

          {/* Grupo: Aprovados (colapsável) */}
          {approvedGroup.length > 0 && (
            <div>
              <button
                onClick={() => setApprovedGroupExpanded(v => !v)}
                data-testid="row-approved-group-header"
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 16px', borderRadius: 8, cursor: 'pointer',
                  backgroundColor: '#f0fdf4', border: '1px solid #86efac',
                  marginBottom: approvedGroupExpanded ? 12 : 0,
                }}
              >
                {approvedGroupExpanded
                  ? <ChevronDown style={{ width: 14, height: 14, color: '#15803d' }} />
                  : <ChevronRight style={{ width: 14, height: 14, color: '#15803d' }} />}
                <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, textAlign: 'left' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#15803d', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Aprovados — {approvedGroup.length} {approvedGroup.length === 1 ? 'item' : 'itens'}
                  </span>
                  {/* O rótulo sozinho não explicava O QUE é este grupo nem por
                      que ele fica no fim da fila (pergunta real do dono,
                      24/08). #15803d sobre #f0fdf4 = 4,54:1 ✓ nos 11px. */}
                  <span style={{ fontSize: 11, fontWeight: 400, color: '#15803d', textTransform: 'none', letterSpacing: 0 }}>
                    {approvedGroup.length === 1
                      ? 'Todos os patrocinadores desta peça já aprovaram — nada a decidir aqui. Ela fica visível para conferência e para revogar uma decisão, e sai quando avança de etapa.'
                      : 'Todos os patrocinadores destas peças já aprovaram — nada a decidir aqui. Elas ficam visíveis para conferência e para revogar uma decisão, e saem quando avançam de etapa.'}
                  </span>
                </span>
              </button>
              {approvedGroupExpanded && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {approvedGroup.map(item => {
                    return (
                      <div
                        key={item.id}
                        data-testid={`row-approved-item-${item.id}`}
                        style={{
                          backgroundColor: '#ffffff', borderRadius: 12,
                          boxShadow: '0 1px 3px rgba(0,0,0,0.04), inset 4px 0 0 #d6d3d1',
                          overflow: 'hidden', opacity: 0.7,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', padding: '14px 20px', gap: 20 }}>
                          <div style={{ width: 48, height: 48, flexShrink: 0, borderRadius: 6, backgroundColor: '#f5f5f4', overflow: 'hidden', filter: 'grayscale(1)', position: 'relative' }}>
                            {item.approvalThumbUrl
                              ? <>
                                  <img
                                    src={item.approvalThumbUrl}
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
                                    <FileText style={{ width: 18, height: 18, color: '#a8a29e' }} />
                                  </div>
                                </>
                              : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><FileText style={{ width: 18, height: 18, color: '#a8a29e' }} /></div>}
                          </div>
                          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 12, alignItems: 'center', minWidth: 0 }}>
                            <div>
                              <h5 style={{ fontSize: 13, fontWeight: 600, color: '#746e69', margin: 0 }}>{item.type}</h5>
                              <p style={{ fontSize: 11, color: '#746e69', margin: '2px 0 0' }}>{item.displayId}</p>
                            </div>
                            {/* Mesma linguagem dos cards pendentes: chips já com o
                                status de cada patrocinador (todos aprovados aqui). */}
                            <SponsorChips sponsors={sponsorsWithStatus(item)} variant="colored" size="sm" />
                            <span data-testid={`badge-aprovado-${item.id}`} style={{
                              display: 'inline-flex', alignItems: 'center', gap: 4,
                              fontSize: 11, fontWeight: 700, color: '#15803d',
                              backgroundColor: '#f0fdf4', border: '1px solid #86efac',
                              padding: '3px 10px', borderRadius: 6,
                            }}>
                              <CheckCircle style={{ width: 11, height: 11 }} /> APROVADO
                            </span>
                            <span />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
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
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    height: 36, padding: '0 12px',
                    backgroundColor: '#0c0a09', color: '#fff',
                    border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600,
                  }}
                >
                  <X style={{ width: 13, height: 13 }} /> Limpar filtros
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
              <div style={{ display: 'flex', justifyContent: 'center', padding: '64px 0' }}>
                <Loader2 style={{ width: 32, height: 32, color: '#a8a29e' }} className="animate-spin" />
              </div>
            ) : historyItems.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '64px 0' }}>
                <CheckCircle aria-hidden="true" style={{ width: 28, height: 28, color: '#86efac', margin: '0 auto 12px' }} />
                <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1c1917', margin: '0 0 6px' }}>Nenhuma peça encontrada</h3>
                <p style={{ color: '#746e69', fontSize: 15 }}>
                  {hasHistFilters ? 'Tente ajustar os filtros.' : 'Ainda não há peças aprovadas pelo patrocinador.'}
                </p>
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
                  const statusCfg = getStatusMeta(item.status);

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
                    : item.status === 'inProduction' || item.status === 'produced' ? '#7c3aed'
                    : item.status === 'ready_for_production' ? '#2563eb'
                    : '#e5e7eb';

                  // Pipeline de fluxo (10 etapas) — const de módulo PIPELINE_STAGES
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
                                    src={item.approvalThumbUrl || item.finalPreviewUrl}
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
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 11, color: '#746e69', fontWeight: 500 }}>{ev?.name || '—'}</span>
                              <span style={{
                                fontSize: 11, fontWeight: 700,
                                backgroundColor: statusCfg.bg, color: statusCfg.text, border: `1px solid ${statusCfg.border}`,
                                padding: '2px 8px', borderRadius: 6, whiteSpace: 'nowrap', lineHeight: 1.5,
                              }}>{isMobile ? getStatusShort(item.status) : getStatusLabel(item.status)}</span>
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
                              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 6, background: '#f5f5f4', border: '1px solid #ebe8e4', cursor: 'pointer' }}
                            >
                              <Eye style={{ width: 11, height: 11, color: '#746e69' }} />
                              <span style={{ fontSize: 11, fontWeight: 600, color: '#746e69', whiteSpace: 'nowrap' }}>Ver detalhes</span>
                            </button>
                            {sponsorApprovals.length > 0 && (
                              <div style={{
                                display: 'flex', flexDirection: 'column', alignItems: 'center',
                                background: allApproved ? '#f0fdf4' : '#fafaf9',
                                border: `1px solid ${allApproved ? '#bbf7d0' : '#e5e7eb'}`,
                                borderRadius: 8, padding: '4px 10px', minWidth: 48,
                              }}>
                                <span style={{ fontSize: 15, fontWeight: 800, color: allApproved ? '#15803d' : '#374151', lineHeight: 1 }}>
                                  {approvedOnes.length} <span style={{ fontSize: 11, fontWeight: 500, opacity: 0.55 }}>de</span> {sponsorApprovals.length}
                                </span>
                                <span style={{ fontSize: 11, color: allApproved ? '#15803d' : '#6b7280', fontWeight: 700, marginTop: 2 }}>
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
                                <div style={{ display: 'flex', alignItems: 'flex-start', minWidth: isMobile ? 520 : 0 }}>
                                  {j.etapas.map((e, i) => (
                                    <Fragment key={e.key}>
                                      {i > 0 && (
                                        <span style={{ flex: 1, minWidth: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 3 }}>
                                          <span style={{ display: 'block', width: '100%', height: 2, borderRadius: 999, background: e.cumprida || e.ehAtual ? '#c2410c' : '#e7e5e4' }} />
                                          {/* O TEMPO DO TRECHO. "Criado 04/08 → Todos aprovaram
                                              13/08" obrigava a contar nove dias de cabeça. */}
                                          {e.desdeAnterior !== null && (
                                            <span style={{ marginTop: 3, fontSize: 10, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: tomDoIntervalo(e.desdeAnterior), whiteSpace: 'nowrap' }}>
                                              +{e.desdeAnterior}d
                                            </span>
                                          )}
                                        </span>
                                      )}
                                      <span title={`${e.label}${e.ms ? ` · ${fmtDt(new Date(e.ms))}` : ' · sem carimbo de data'}`}
                                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, flexShrink: 0, maxWidth: 78 }}>
                                        <span aria-hidden="true" style={{
                                          width: e.ehAtual ? 11 : 8, height: e.ehAtual ? 11 : 8, borderRadius: '50%', flexShrink: 0,
                                          background: e.cumprida || e.ehAtual ? '#c2410c' : '#e7e5e4',
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
                            src={di.approvalThumbUrl || di.finalPreviewUrl}
                            alt=""
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
                                      <span style={{ fontSize: 11, color: '#b91c1c', fontStyle: 'italic' }}>"{appr.rejectionReason}"</span>
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
                <div style={{
                  padding: '20px 24px', borderBottom: '1px solid #f1f0ef',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  backgroundColor: '#fafaf9',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{
                      width: 38, height: 38, borderRadius: 10, overflow: 'hidden', flexShrink: 0,
                      backgroundColor: '#1c1917', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      position: 'relative',
                    }}>
                      {thumbUrl
                        ? <>
                            <img
                              src={thumbUrl}
                              alt=""
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
                    <div>
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
                      </h2>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#746e69', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                          {ev?.name || 'Sem Evento'}
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
                              <span style={{ width: 4, height: 4, borderRadius: '50%', backgroundColor: '#d6d3d1' }} />
                              <span style={{
                                fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
                                color: venceu ? '#b91c1c' : '#746e69',
                                fontVariantNumeric: 'tabular-nums',
                              }}>
                                Aprovação · {format(toUTCDisplayDate(limite.toISOString()), "dd/MM HH:mm")}
                                {venceu && " · vencido"}
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
                      width: 36, height: 36, borderRadius: 9,
                      border: '1px solid #e7e5e4',
                      backgroundColor: '#ffffff',
                      cursor: enabled ? 'pointer' : 'not-allowed',
                      opacity: enabled ? 1 : 0.4,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#57534e',
                    });
                    return (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {qIdx >= 0 && reviewQueue.length > 1 && (
                          <>
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#746e69', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                              Peça {qIdx + 1} <span style={{ opacity: 0.5 }}>de</span> {reviewQueue.length}
                            </span>
                            <button
                              onClick={() => hasPrev && goToAdjacentItem(-1)}
                              disabled={!hasPrev}
                              data-testid="button-prev-item"
                              title="Peça anterior"
                              style={navBtn(hasPrev)}
                            >
                              <ChevronRight style={{ width: 16, height: 16, transform: 'rotate(180deg)' }} />
                            </button>
                            <button
                              onClick={() => hasNext && goToAdjacentItem(1)}
                              disabled={!hasNext}
                              data-testid="button-next-item"
                              title="Próxima peça"
                              style={navBtn(hasNext)}
                            >
                              <ChevronRight style={{ width: 16, height: 16 }} />
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
                                <div key={log.id} style={{ paddingLeft: 32, position: 'relative', opacity: isSystemLog ? Math.max(0.4, 0.7 - i * 0.04) : Math.max(0.6, 1 - i * 0.08) }}>
                                  <div style={{
                                    position: 'absolute', left: 0, top: 2,
                                    width: 20, height: 20, borderRadius: '50%',
                                    backgroundColor: cfg.bg,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1,
                                  }}>
                                    <IconComp style={{ width: 10, height: 10, color: cfg.iconColor }} />
                                  </div>
                                  <p style={{ fontSize: 11, fontWeight: 700, color: cfg.iconColor, margin: 0 }}>
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

                          {allDecided && !allApproved && (
                            <div style={{
                              display: 'flex', alignItems: 'center', gap: 10,
                              padding: '10px 14px', borderRadius: 8, marginBottom: 16,
                              backgroundColor: '#fafaf9', border: '1px solid #e7e5e4',
                            }}>
                              <RotateCcw style={{ width: 14, height: 14, color: '#746e69', flexShrink: 0 }} />
                              <p style={{ fontSize: 13, color: '#57534e', margin: 0, fontWeight: 500 }}>
                                Decisões registradas — a Arte está preparando uma nova versão.
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
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: isRejectingThis ? 12 : 0 }}>
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
                                          <p style={{
                                            fontSize: 11, margin: '2px 0 0', textTransform: 'uppercase', fontWeight: 700,
                                            color: isApproved ? '#15803d' : isRejected ? '#dc2626' : isNewVersion ? '#0369a1' : '#b45309',
                                          }}>
                                            {isApproved ? 'Aprovado' : isRejected ? 'Reprovado' : isNewVersion ? 'Nova versão' : 'Aguardando Decisão'}
                                          </p>
                                        </div>
                                      </div>

                                      {isPending && !isRejectingThis && (
                                        <div style={{ display: 'flex', gap: 6, flexDirection: isMobile ? 'column' : 'row' }}>
                                          <button
                                            onClick={() => setRejectingSponsorId(sponsor.id)}
                                            disabled={individualRejectMutation.isPending || !canDecide}
                                            title={!canDecide ? "Somente Atendimento e administradores decidem aprovações" : undefined}
                                            style={{
                                              padding: '8px 16px', borderRadius: 8,
                                              backgroundColor: '#fef2f2', border: '1px solid #fecaca',
                                              color: '#b91c1c', fontSize: 13, fontWeight: 700,
                                              cursor: canDecide ? 'pointer' : 'not-allowed', transition: 'all 0.15s',
                                              opacity: canDecide ? 1 : 0.5,
                                              minHeight: 36,
                                              width: isMobile ? '100%' : undefined,
                                            }}
                                          >
                                            Reprovar
                                          </button>
                                          <button
                                            onClick={() => setConfirmApproveIndividual({ itemId: selectedItem.id, sponsorId: sponsor.id, sponsorName: sponsor.name || 'Patrocinador' })}
                                            disabled={individualApproveMutation.isPending || !canDecide}
                                            title={!canDecide ? "Somente Atendimento e administradores decidem aprovações" : undefined}
                                            data-testid={`button-approve-sponsor-${sponsor.id}`}
                                            style={{
                                              padding: '8px 16px', borderRadius: 8,
                                              backgroundColor: '#f0fdf4', border: '1px solid #86efac',
                                              color: '#15803d', fontSize: 13, fontWeight: 700,
                                              cursor: canDecide ? 'pointer' : 'not-allowed', transition: 'all 0.15s',
                                              opacity: canDecide ? 1 : 0.5,
                                              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                                              minHeight: 36,
                                              width: isMobile ? '100%' : undefined,
                                            }}
                                          >
                                            {individualApproveMutation.isPending
                                              ? <Loader2 style={{ width: 12, height: 12 }} className="animate-spin" />
                                              : <CheckCircle style={{ width: 12, height: 12 }} />}
                                            Aprovar
                                          </button>
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

                                    {/* Motivo de reprovação existente */}
                                    {isRejected && approval?.rejectionReason && (
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

                                        {/* Textarea nativa — sem reset de className interferindo no foco */}
                                        <textarea
                                          value={rejectionReason}
                                          onChange={e => setRejectionReason(e.target.value)}
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
                                        />

                                        {/* Botões */}
                                        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                                          <button
                                            onClick={() => { setRejectingSponsorId(null); setRejectionReason(""); }}
                                            style={{
                                              flex: 1, height: 36, borderRadius: 8,
                                              background: '#fff', border: '1px solid #e7e5e4',
                                              color: '#746e69', fontSize: 13, fontWeight: 700, cursor: 'pointer',
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
                                              flex: 2, height: 36, borderRadius: 8, border: 'none',
                                              backgroundColor: rejectionReason.trim() === "" ? '#e7e5e4' : '#dc2626',
                                              color: rejectionReason.trim() === "" ? '#57534e' : '#fff',
                                              fontSize: 13, fontWeight: 800,
                                              cursor: rejectionReason.trim() === "" ? 'not-allowed' : 'pointer',
                                              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                              transition: 'background-color 0.15s, box-shadow 0.15s',
                                              boxShadow: rejectionReason.trim() ? '0 2px 8px rgba(220,38,38,0.25)' : 'none',
                                            }}
                                            onMouseEnter={e => { if (rejectionReason.trim()) e.currentTarget.style.backgroundColor = '#b91c1c'; }}
                                            onMouseLeave={e => { if (rejectionReason.trim()) e.currentTarget.style.backgroundColor = '#dc2626'; }}
                                          >
                                            {individualRejectMutation.isPending
                                              ? <><Loader2 style={{ width: 13, height: 13 }} className="animate-spin" />Registrando…</>
                                              : <><XCircle style={{ width: 13, height: 13 }} />Confirmar Reprovação</>
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
                          onClick={() => sponsorApproveMutation.mutate(selectedItem.id)}
                          disabled={sponsorApproveMutation.isPending || !canDecide}
                          title={!canDecide ? "Somente Atendimento e administradores decidem aprovações" : "Aprova a peça para TODOS os patrocinadores de uma vez"}
                          data-testid="button-approve-item"
                          style={{
                            height: 36, padding: '0 14px', borderRadius: 9,
                            border: '1px solid #e7e5e4', backgroundColor: '#ffffff',
                            color: '#1c1917', fontSize: 13, fontWeight: 700,
                            cursor: canDecide ? 'pointer' : 'not-allowed',
                            display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
                            opacity: sponsorApproveMutation.isPending || !canDecide ? 0.5 : 1,
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
      <Dialog open={!!confirmApproveIndividual} onOpenChange={(open) => { if (!open) setConfirmApproveIndividual(null); }}>
        <DialogContent className={HIDE_NATIVE_CLOSE} style={modalSurface(440)}>
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
              Aprovar
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
        <DialogContent className={HIDE_NATIVE_CLOSE} style={modalSurface(440)}>
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
              Aprovar <strong style={{ color: '#1c1917' }}>{batchSelectedItemIds.size} {batchSelectedItemIds.size === 1 ? 'item' : 'itens'}</strong> para o patrocinador selecionado?
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
              Aprovar seleção
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
        items={exportPool}
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
