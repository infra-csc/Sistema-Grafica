import { useQuery, useMutation } from "@tanstack/react-query";
import { parseDateLocal, toUTCDisplayDate, runInBatches } from "@/lib/utils";
import { compareDisplayId } from "@/lib/displayId";
import { FilterSelect } from "@/components/filter-select";
import { EventFilterDropdown } from "@/components/event-filter-dropdown";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect, useMemo, useRef } from "react";
import { Package, Check, Calendar, Truck, AlertTriangle, CheckCircle2, X, Building2, Plus, Search, Users, ClipboardList, Save, Send, ChevronDown, Info, Lock, Paperclip, ExternalLink, RotateCcw, Zap, EyeOff, MoreHorizontal, Recycle } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
// `isAfter`/`startOfDay` saíram junto com os dois recortes de data que esta
// tela mantinha por conta própria — a comparação de dia agora é a do predicado
// único (@shared/prazo-dates), no fuso do negócio e não no do navegador.
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ItemDetailsDialog } from "@/components/item-details-dialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { ModalHeader, ModalFooter, modalSurface, HIDE_NATIVE_CLOSE, FreezeWhileClosing } from "@/components/modal-shell";
import { R, onColor, darkenToContrast } from "@/lib/theme";
import {
  isEventoFinalizado, motivoEventoFinalizado, avisoPecasOcultas, todayBusinessMs,
} from "@/lib/status";

type ItemChanges = {
  sponsorIds: string[];
  skipApproval: boolean;
  isDirty: boolean;
};

interface SendConfirmModal {
  items: any[];
  pendingByItem: Record<string, Set<string>>;
}

// Estados UI simplificados
type UIStatus = 'RASCUNHO' | 'PRONTO' | 'ENVIADO' | 'PENDENTE';

// Status iniciais em que o item ainda está na fase de vinculação de
// patrocinadores (pode ser enviado para a Arte).
const LINKING_STATUSES = ['requested', 'awaiting_linking'];

// Status que esta tela exibe. Nomes que o backend realmente grava (sem
// 'released'/'in_production', que eram fantasmas e nunca casavam). No topo do
// módulo porque DUAS contas leem a lista: a que monta `visibleItems` e a que
// conta quantas peças o evento encerrado tirou de vista — se divergissem, o
// aviso prometeria um número que a lista não teria mostrado.
const VINCULACAO_VISIBLE_STATUSES = [
  'awaiting_linking',
  'awaiting_submission',
  'awaiting_sponsor_approval',
  'sponsor_approved',
  'awaiting_finalization',
  'awaiting_final_review',
  'awaiting_creator_review',
  'ready_for_production',
  'pronto_para_producao',
  'inProduction',
  'produced',
  'delivered',
];

// Status "a jusante": o item já saiu da vinculação (foi para a Arte, aprovação
// ou produção). Precisa cobrir TODAS as convenções de status de ITEM realmente
// gravadas pelo backend — inclui camelCase (inProduction), português
// (pronto_para_producao) e nomes legados. Um nome faltando aqui fazia o item
// cair errado em "Pendente" (badge) e até sumir da tela (filtro de visibilidade).
const DOWNSTREAM_STATUSES = [
  'awaiting_submission',       // enviado para Arte (thumb)
  'awaiting_sponsor_approval', // em aprovação pelo patrocinador
  'sponsor_approved',
  'approved',
  'awaiting_finalization',     // legado — Arte adicionando arquivo final
  'awaiting_final_review',     // criador revisando arquivo final
  'awaiting_creator_review',   // legado
  'ready_for_production',
  'pronto_para_producao',
  'inProduction',
  'produced',
  'delivered',
];

// Função para determinar estado UI de um item (FONTE ÚNICA DE VERDADE)
const getItemUIStatus = (
  item: any,
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
    const hasSkipApproval = item.skipApproval === true;
    const isReuse = item.isReuse === true;
    if (hasSponsors || hasSkipApproval || isReuse) {
      return 'PRONTO';
    }
    return 'PENDENTE';
  }
  
  // 4. Caso contrário → PENDENTE
  return 'PENDENTE';
};

// Rótulos exibidos para cada status UI — os cartões, filtros e badges devem
// usar SEMPRE este mapa (antes o badge da linha imprimia a chave crua
// "RASCUNHO" e o config dizia "Preparado": quatro grafias para o mesmo estado).
const UI_STATUS_LABEL: Record<string, string> = {
  PENDENTE: 'Pendente',
  RASCUNHO: 'Rascunho',
  PRONTO: 'Pronto',
  ENVIADO: 'Enviado',
};

// Renderização incremental (padrão da casa, como arte.tsx/painel-geral):
// tabelas grandes rendem só as primeiras 50 linhas + "Mostrar todos".
const ITEM_RENDER_CAP = 50;

// URLs de referência vêm de input de usuário: só http(s) ou caminho relativo
// pode chegar a href/src — "javascript:..." executava no clique (XSS).
const safeRefUrl = (u?: string | null): string | null =>
  u && /^(https?:\/\/|\/)/i.test(u.trim()) ? u.trim() : null;

// Função helper para converter hex para rgba
const hexToRgba = (hex: string, alpha: number = 1): string => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return `rgba(59, 130, 246, ${alpha})`; // Fallback azul
  return `rgba(${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}, ${alpha})`;
};


// Reutilizado nos sorts de lista: um Collator criado uma vez é bem mais rápido
// que chamar localeCompare a cada comparação.
const COLLATOR_PTBR = new Intl.Collator('pt-BR');

export default function VincularPatrocinadores() {
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const [itemSponsorsMap, setItemSponsorsMap] = useState<Record<string, string[]>>({});
  const [selectedEventForSponsors, setSelectedEventForSponsors] = useState<any>(null);
  const [selectedSponsorIds, setSelectedSponsorIds] = useState<string[]>([]);
  const [sponsorDialogOpen, setSponsorDialogOpen] = useState(false);
  const [sponsorModalSearch, setSponsorModalSearch] = useState('');
  
  // Estado para dialog de detalhes do item
  const [selectedItemForDetails, setSelectedItemForDetails] = useState<any>(null);
  
  // Estados de filtro — inicializam da URL (link compartilhável, padrão da
  // casa como painel-geral/eventos), com fallback do sessionStorage para o
  // filtro de evento (comportamento antigo de navegar e voltar).
  const initParams = useRef(new URLSearchParams(window.location.search)).current;
  const listParam = (k: string) => { const v = initParams.get(k); return v ? v.split(",").filter(Boolean) : []; };
  const [searchQuery, setSearchQuery] = useState(initParams.get("q") ?? "");
  const [eventFilter, setEventFilter] = useState<string[]>(() => {
    const fromUrl = listParam("ev");
    if (fromUrl.length) return fromUrl;
    try { return JSON.parse(sessionStorage.getItem("vincular:eventFilter") || "[]"); } catch { return []; }
  });
  useEffect(() => { sessionStorage.setItem("vincular:eventFilter", JSON.stringify(eventFilter)); }, [eventFilter]);
  const [sponsorFilter, setSponsorFilter] = useState<string[]>(() => listParam("sp"));
  const [itemFilter, setItemFilter] = useState<string[]>(() => listParam("tp"));
  const [statusFilter, setStatusFilter] = useState<string[]>(() => listParam("st"));

  // Estado local para rastrear mudanças pendentes
  const [pendingChanges, setPendingChanges] = useState<Record<string, ItemChanges>>({});
  
  // Estados para seleção em lote
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [bulkApplyDialogOpen, setBulkApplyDialogOpen] = useState(false);
  const [bulkSelectedSponsors, setBulkSelectedSponsors] = useState<string[]>([]);
  const [bulkSkipApproval, setBulkSkipApproval] = useState(false);
  const [bulkSponsorSearch, setBulkSponsorSearch] = useState('');
  
  // Estado para controlar qual aba está ativa
  const [previewRefUrl, setPreviewRefUrl] = useState<string | null>(null);
  // Falha ao carregar a imagem de referência — sem isto o onError só escondia
  // o <img> e sobrava uma caixa cinza vazia, sem explicação.
  const [refImgFailed, setRefImgFailed] = useState(false);
  useEffect(() => { setRefImgFailed(false); }, [previewRefUrl]);

  // ── AGRUPAMENTO, não visão ───────────────────────────────────────────────
  //
  // Eram duas ABAS — "Por Item" e "Por Patrocinador" —, e por isso duas
  // árvores de JSX quase completas com a mesma informação e conjuntos de ação
  // DIFERENTES: a aba do patrocinador tinha Vincular/Desvincular/Enviar que a
  // outra não tinha, e a do item tinha salvar e o menu de linha que faltavam
  // na outra. Trocar de aba mudava o que dava para fazer, o que nenhuma aba
  // deveria fazer.
  //
  // Agrupar é a operação de verdade: a tabela é a mesma, muda o cabeçalho do
  // grupo e o escopo dos chips.
  //
  // O parâmetro de URL continua sendo `view` e ainda entende os dois valores
  // antigos — link salvo por alguém não pode deixar de abrir.
  const [agrupamento, setAgrupamento] = useState<"evento" | "patrocinador">(() => {
    const v = initParams.get("view");
    return v === "patrocinador" || v === "por-patrocinador" ? "patrocinador" : "evento";
  });

  // Blocos (evento ou grupo de patrocinador) com todas as linhas visíveis
  const [showAllRows, setShowAllRows] = useState<Set<string>>(new Set());

  // Menu de ações secundárias da linha — um por vez, para que abrir o de uma
  // peça feche o da anterior.
  const [menuDaLinha, setMenuDaLinha] = useState<string | null>(null);
  // Cabeçalhos de tipo fechados, por `${grupo}:${tipo}`.
  const [tiposColapsados, setTiposColapsados] = useState<Set<string>>(new Set());

  // Clique fora fecha o menu da linha. Sem isto, abrir um menu e clicar
  // noutro lugar deixava o painel pendurado sobre a tabela.
  useEffect(() => {
    if (!menuDaLinha) return;
    const fecha = () => setMenuDaLinha(null);
    window.addEventListener("click", fecha);
    return () => window.removeEventListener("click", fecha);
  }, [menuDaLinha]);

  // Filtros e aba refletidos na URL via replaceState (não polui o histórico)
  useEffect(() => {
    const p = new URLSearchParams();
    if (searchQuery) p.set("q", searchQuery);
    if (eventFilter.length) p.set("ev", eventFilter.join(","));
    if (sponsorFilter.length) p.set("sp", sponsorFilter.join(","));
    if (itemFilter.length) p.set("tp", itemFilter.join(","));
    if (statusFilter.length) p.set("st", statusFilter.join(","));
    if (agrupamento !== "evento") p.set("view", agrupamento);
    const qs = p.toString();
    window.history.replaceState(null, "", qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
  }, [searchQuery, eventFilter, sponsorFilter, itemFilter, statusFilter, agrupamento]);

  // Atalho "/" foca a busca (padrão da casa)
  const searchInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      e.preventDefault();
      searchInputRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const [optimisticSentIds, setOptimisticSentIds] = useState<Set<string>>(new Set());

  const [sendConfirmModal, setSendConfirmModal] = useState<SendConfirmModal | null>(null);
  // Recorte dentro do modal de envio: ver so as pecas que vao sair sem marca.
  // Numa lista de trinta, as tres em ambar ficam espalhadas e e preciso rolar
  // procurando — justo a conferencia que o aviso do topo acabou de pedir.
  const [soSemPatrocinador, setSoSemPatrocinador] = useState(false);
  // Trava o botão de confirmar envio enquanto a sincronização/envio está em curso.
  const [isSending, setIsSending] = useState(false);



  // Estados auto-vincular por cota
  // preview: array de { sponsorId, sponsorName, quota, items: [{ itemId, displayId, type, description }] }
  const [autoLinkOpen, setAutoLinkOpen] = useState(false);
  const [autoLinkPreview, setAutoLinkPreview] = useState<any[] | null>(null);
  const [autoLinkLoading, setAutoLinkLoading] = useState(false);
  const [autoLinkConfirming, setAutoLinkConfirming] = useState(false);

  // Modal de confirmação de salvamento
  type SaveModal = { payloads: SavePayload[]; items: any[] };
  const [saveConfirmModal, setSaveConfirmModal] = useState<SaveModal | null>(null);

  // Modal de confirmação: devolver peça para Criação
  const [returnModal, setReturnModal] = useState<any | null>(null); // item a devolver

  const { data: items = [], isLoading: itemsLoading, isError: itemsError, refetch: refetchItems } = useQuery<any[]>({
    queryKey: ["/api/items"],
  });

  // isLoading dos eventos também gateia o spinner: visibleItems exige o evento
  // no eventById — se /api/items resolvesse antes de /api/events, a tela
  // piscava o vazio "Nada para vincular agora" até os eventos chegarem.
  const { data: rawEvents = [], isLoading: eventsLoading, isError: eventsError, refetch: refetchEvents } = useQuery<any[]>({
    queryKey: ["/api/events"],
  });

  // Histórico DA PEÇA aberta no dialog de detalhes, com escopo no servidor.
  // A listagem global tem teto de 500 registros — peça antiga caía fora da
  // janela e a ficha mostrava "sem histórico" (bug reportado pelo dono).
  // Bônus: esta query rodava no LOAD da página, sem gate — era a última tela
  // baixando a trilha inteira à toa.
  const { data: auditLogs = [] } = useQuery<any[]>({
    queryKey: ["/api/audit-logs", "item", selectedItemForDetails?.id],
    queryFn: () =>
      fetch(`/api/audit-logs?entityType=item&entityId=${selectedItemForDetails!.id}`, { credentials: "include" })
        .then(r => r.ok ? r.json() : Promise.reject(new Error(`Falha ao carregar o histórico (HTTP ${r.status})`))),
    select: d => (Array.isArray(d) ? d : []),
    enabled: !!selectedItemForDetails?.id,
    placeholderData: [],
  });

  const { data: sponsors = [], isError: sponsorsError, refetch: refetchSponsors } = useQuery<any[]>({
    queryKey: ["/api/sponsors"],
  });
  const { data: standardItems = [] } = useQuery<any[]>({ queryKey: ['/api/standard-items'] });
  const typeToGroup = useMemo(() => {
    const map: Record<string, string> = {};
    (standardItems as any[]).forEach((s: any) => { if (s.group) map[s.name] = s.group; });
    return map;
  }, [standardItems]);

  // "Hoje" do NEGÓCIO (dia-calendário em São Paulo). Uma âncora só para a tela
  // inteira: a lista de eventos e o recorte de peças precisam virar o dia no
  // mesmo instante, senão o evento sai de um e fica no outro.
  const hojeBusinessMs = todayBusinessMs();

  // Eventos que ainda estão em jogo. Era um terceiro jeito de perguntar a mesma
  // coisa (`startOfDay` no fuso do NAVEGADOR sobre `parseDateLocal`); agora é o
  // predicado único — mesma virada de dia do recorte de peças logo abaixo e da
  // Gestão de Prazos no servidor. Muda duas coisas de propósito: evento
  // encerrado à mão também sai daqui (as peças dele já saíam), e evento SEM
  // data de início passa a APARECER em vez de ser descartado por uma data
  // inválida — sem data não há "já passou", e é o cadastro que precisa de
  // conserto, não o evento que precisa sumir.
  const events = useMemo(
    () => rawEvents.filter(event => !isEventoFinalizado(event, hojeBusinessMs)),
    [rawEvents, hojeBusinessMs],
  );

  // Lookup O(1) de evento por id — evita rawEvents.find() dentro de loops de
  // filtro (que era O(nº itens × nº eventos) e pesava com muitos itens).
  const eventById = useMemo(() => {
    const m = new Map<string, any>();
    rawEvents.forEach(e => m.set(e.id, e));
    return m;
  }, [rawEvents]);

  // Mostrar apenas items de eventos ainda em jogo, com status que permitem
  // vinculação de patrocinadores. Exclui: draft e requested (Rascunho — ainda
  // não enviado pela Solicitação).
  const visibleItems = useMemo(() => {
    return items.filter(item => {
      // Filtro 1: Status permitido (exclui draft)
      if (!VINCULACAO_VISIBLE_STATUSES.includes(item.status)) return false;

      const event = eventById.get(item.eventId);
      if (!event) return false;

      // Filtro 2: evento FINALIZADO sai desta fila — encerrado à mão OU com a
      // DATA DO EVENTO (events.startDate, não a saída do caminhão) já passada.
      // Vem ANTES do atalho de `awaiting_linking` logo abaixo, que fazia a peça
      // pendente aparecer sempre, furando o recorte de data: era exatamente
      // assim que a peça de um evento de 2024 continuava sendo cobrada aqui.
      //
      // Isto SUBSTITUI o recorte de data antigo ("só evento futuro ou hoje"),
      // que dizia quase a mesma coisa com outra conta: `startOfDay` no fuso do
      // NAVEGADOR contra `parseDateLocal`. Agora é o mesmo predicado, a mesma
      // virada de dia (São Paulo) e a mesma regra que o servidor usa na Gestão
      // de Prazos — e o dia do evento continua contando (a comparação é `>`).
      // Evento SEM data de início não é finalizado: continua aqui.
      if (isEventoFinalizado(event, hojeBusinessMs)) return false;

      return true;
    });
  }, [items, eventById, hojeBusinessMs]);

  // Quantas peças o recorte acima tirou de vista, POR MOTIVO. Sem este número a
  // tela ficaria vazia sem explicação — o mesmo aviso das outras filas.
  const pecasOcultas = useMemo(() => {
    let encerrado = 0, realizado = 0;
    for (const item of items as any[]) {
      if (!VINCULACAO_VISIBLE_STATUSES.includes(item.status)) continue;
      const motivo = motivoEventoFinalizado(eventById.get(item.eventId), hojeBusinessMs);
      if (motivo === 'encerrado') encerrado++;
      else if (motivo === 'realizado') realizado++;
    }
    return { encerrado, realizado };
  }, [items, eventById, hojeBusinessMs]);
  const avisoOcultas = useMemo(
    () => avisoPecasOcultas(pecasOcultas, 'desta tela'),
    [pecasOcultas],
  );
  
  // Toggle "Sem Patrocinador" por item individual
  const toggleItemSkipApproval = (item: any) => {
    const originalSponsors = originalSponsorsMap[item.id] || [];
    const originalSkipApproval = item.skipApproval || false;
    const currentSkipApproval = pendingChanges[item.id]?.skipApproval ?? originalSkipApproval;
    const newSkipApproval = !currentSkipApproval;

    const newSponsors = newSkipApproval ? [] : originalSponsors;
    const hasChanges =
      !areSponsorsEqual(newSponsors, originalSponsors) ||
      newSkipApproval !== originalSkipApproval;

    setPendingChanges(prev => {
      if (!hasChanges) {
        const next = { ...prev };
        delete next[item.id];
        return next;
      }
      return {
        ...prev,
        [item.id]: { sponsorIds: newSponsors, skipApproval: newSkipApproval, isDirty: true },
      };
    });
    setItemSponsorsMap(prev => ({ ...prev, [item.id]: newSponsors }));
  };

  // Determinar quais items são editáveis (baseado no status UI)
  const getItemEditability = (item: any) => {
    const originalSponsors = originalSponsorsMap[item.id] || [];
    const pendingChange = pendingChanges[item.id];
    const uiStatus = getItemUIStatus(item, originalSponsors, pendingChange);
    // Items enviados não podem ser editados
    return uiStatus !== 'ENVIADO';
  };

  // Agrupar items por evento
  const itemsByEvent = useMemo(() => {
    const grouped: Record<string, any[]> = {};
    visibleItems.forEach(item => {
      if (!grouped[item.eventId]) {
        grouped[item.eventId] = [];
      }
      grouped[item.eventId].push(item);
    });
    return grouped;
  }, [visibleItems]);

  // `itemTypes` saiu: era a lista de tipos de TODA a fila visível alimentando o
  // menu de Peça sem contagem e sem respeitar os outros filtros. Quem faz isso
  // agora é `itemFilterOptions`, mais abaixo.

  // Estado para armazenar sponsors originais (do banco de dados) - DEVE VIR ANTES DE filterItems
  const [originalSponsorsMap, setOriginalSponsorsMap] = useState<Record<string, string[]>>({});

  // Função helper para filtrar items (aplicada tanto na lógica de filtros quanto no render)
  const filterItems = (eventItems: any[], eventName?: string) => {
    return eventItems.filter(item => {
      // Filtro de busca (tipo ou descrição do item, ou nome do evento)
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const typeMatch = item.type.toLowerCase().includes(query);
        const descMatch = item.description?.toLowerCase().includes(query) || false;
        const eventMatch = eventName?.toLowerCase().includes(query) || false;
        
        // Item passa se corresponder tipo, descrição, OU se o evento corresponder
        if (!typeMatch && !descMatch && !eventMatch) {
          return false;
        }
      }

      // Filtro por tipo de item
      if (itemFilter.length > 0 && !itemFilter.includes(item.type)) {
        return false;
      }

      // Filtro por patrocinador (usar dados SALVOS, não locais)
      if (sponsorFilter.length > 0) {
        const savedSponsors = originalSponsorsMap[item.id] || [];
        if (!sponsorFilter.some(sf => savedSponsors.includes(sf))) {
          return false;
        }
      }

      // Filtro por status UI (PENDENTE/RASCUNHO/PRONTO/ENVIADO)
      if (statusFilter.length > 0) {
        const originalSponsors = originalSponsorsMap[item.id] || [];
        const pendingChange = pendingChanges[item.id];
        const uiSt = getItemUIStatus(item, originalSponsors, pendingChange);
        if (!statusFilter.includes(uiSt)) return false;
      }

      return true;
    });
  };

  // Aplicar filtros
  const filteredEventEntries = useMemo(() => {
    const entries = Object.entries(itemsByEvent);
    
    return entries.filter(([eventId, eventItems]) => {
      const event = eventById.get(eventId);
      if (!event) return false;

      // Filtro por evento específico
      if (eventFilter.length > 0 && !eventFilter.includes(eventId)) {
        return false;
      }

      // Filtrar items usando a função helper
      const filteredItems = filterItems(eventItems, event.name);

      // Se não há items que passaram no filtro, ocultar o evento
      return filteredItems.length > 0;
    });
  }, [itemsByEvent, eventById, searchQuery, eventFilter, sponsorFilter, itemFilter, statusFilter, originalSponsorsMap, pendingChanges]);

  const temFiltroAtivo = !!searchQuery || eventFilter.length > 0 || sponsorFilter.length > 0
                       || itemFilter.length > 0 || statusFilter.length > 0;

  // ===== FONTE ÚNICA DE VERDADE: Computar estados UI de todos os items =====
  const itemUIStates = useMemo(() => {
    const states: Record<string, UIStatus> = {};
    visibleItems.forEach(item => {
      const originalSponsors = originalSponsorsMap[item.id] || [];
      const pendingChange = pendingChanges[item.id];
      states[item.id] = getItemUIStatus(item, originalSponsors, pendingChange);
    });
    return states;
  }, [visibleItems, originalSponsorsMap, pendingChanges]);

  // Auto-deselect items que saíram de PENDENTE/RASCUNHO (ex: após salvar → PRONTO, ou enviar → ENVIADO)
  useEffect(() => {
    setSelectedItemIds(prev => {
      const next = new Set<string>();
      prev.forEach(id => {
        const st = itemUIStates[id] || 'PENDENTE';
        if (st === 'PENDENTE' || st === 'RASCUNHO') {
          next.add(id);
        }
      });
      return next.size === prev.size ? prev : next;
    });
  }, [itemUIStates]);


  // Items visíveis respeitando o eventFilter (para contadores de contexto e ações em lote)
  const contextVisibleItems = useMemo(() => {
    if (eventFilter.length === 0) return visibleItems;
    return visibleItems.filter(item => eventFilter.includes(item.eventId));
  }, [visibleItems, eventFilter]);

  // Opções dos filtros facetadas: só o que existe na lista, aplicando o OUTRO
  // filtro ativo, com contagem por opção.
  const eventFilterOptions = useMemo(() => {
    const DOT: Record<string, string> = { urgente: '#ef4444', urgent: '#ef4444', alta: '#f97316', media: '#eab308', baixa: '#3b82f6' };
    const map = new Map<string, { value: string; label: string; count: number; dotColor?: string }>();
    visibleItems
      // originalSponsorsMap (o que está SALVO), igual à filtragem em
      // fullyFilteredItems — com itemSponsorsMap (rascunho local) a opção
      // aparecia com contagem > 0 e, selecionada, retornava zero linhas.
      .filter(i => sponsorFilter.length === 0 || (originalSponsorsMap[i.id] ?? []).some(sf => sponsorFilter.includes(sf)))
      .forEach(i => {
        if (!i.eventId) return;
        const cur = map.get(i.eventId);
        if (cur) cur.count++;
        else {
          const ev: any = eventById.get(i.eventId);
          map.set(i.eventId, { value: i.eventId, label: ev?.name || 'Sem evento', count: 1, dotColor: DOT[ev?.priority] });
        }
      });
    return Array.from(map.values());
  }, [visibleItems, sponsorFilter, originalSponsorsMap, eventById]);

  const sponsorFilterOptions = useMemo(() => {
    const byId = new Map(sponsors.map((s: any) => [s.id, s]));
    const map = new Map<string, { value: string; label: string; count: number; dotColor?: string }>();
    // originalSponsorsMap pela mesma razão do filtro de eventos acima.
    contextVisibleItems.forEach(i => (originalSponsorsMap[i.id] ?? []).forEach((sid: string) => {
      const cur = map.get(sid);
      if (cur) cur.count++;
      else {
        const s: any = byId.get(sid);
        map.set(sid, { value: sid, label: s?.name || sid, count: 1, dotColor: s?.color || '#3b82f6' });
      }
    }));
    return Array.from(map.values());
  }, [contextVisibleItems, originalSponsorsMap, sponsors]);

  // Itens que passam em TODOS os filtros ativos (usado no bloco de progresso)
  const fullyFilteredItems = useMemo(() => {
    return contextVisibleItems.filter(item => {
      const event = eventById.get(item.eventId);
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!item.type.toLowerCase().includes(q) &&
            !(item.description?.toLowerCase().includes(q)) &&
            !(event?.name?.toLowerCase().includes(q))) return false;
      }
      if (itemFilter.length > 0 && !itemFilter.includes(item.type)) return false;
      if (sponsorFilter.length > 0) {
        const saved = originalSponsorsMap[item.id] || [];
        if (!sponsorFilter.some(sf => saved.includes(sf))) return false;
      }
      if (statusFilter.length > 0) {
        const orig = originalSponsorsMap[item.id] || [];
        const pc = pendingChanges[item.id];
        if (!statusFilter.includes(getItemUIStatus(item, orig, pc))) return false;
      }
      return true;
    });
  }, [contextVisibleItems, eventById, searchQuery, itemFilter, sponsorFilter, statusFilter, originalSponsorsMap, pendingChanges]);

  // Opções de Peça e de Status, COM contagem. Eram os dois únicos menus desta
  // tela sem número — ao lado de Evento e Patrocinador, que já tinham —, e
  // ainda por cima com lista fixa no caso do Status: as quatro situações
  // apareciam sempre, mesmo quando nenhuma peça da fila estava naquela. O pool
  // de cada um exclui o próprio filtro e aplica todos os outros, como manda a
  // invariante de server/__tests__/faceta-lista-invariante.test.ts.
  const poolSemDimensao = (ignorar: "tipo" | "status") =>
    contextVisibleItems.filter(item => {
      const event = eventById.get(item.eventId);
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!item.type.toLowerCase().includes(q) &&
            !(item.description?.toLowerCase().includes(q)) &&
            !(event?.name?.toLowerCase().includes(q))) return false;
      }
      if (ignorar !== "tipo" && itemFilter.length > 0 && !itemFilter.includes(item.type)) return false;
      if (sponsorFilter.length > 0) {
        const saved = originalSponsorsMap[item.id] || [];
        if (!sponsorFilter.some(sf => saved.includes(sf))) return false;
      }
      if (ignorar !== "status" && statusFilter.length > 0) {
        const orig = originalSponsorsMap[item.id] || [];
        const pc = pendingChanges[item.id];
        if (!statusFilter.includes(getItemUIStatus(item, orig, pc))) return false;
      }
      return true;
    });

  const itemFilterOptions = useMemo(() => {
    const conta = new Map<string, number>();
    poolSemDimensao("tipo").forEach(i => conta.set(i.type, (conta.get(i.type) ?? 0) + 1));
    return Array.from(conta.entries()).map(([t, count]) => ({ value: t, label: t, count }));
  }, [contextVisibleItems, eventById, searchQuery, sponsorFilter, statusFilter, originalSponsorsMap, pendingChanges]);

  // ── AS DUAS CONTAGENS, e o papel de cada uma ─────────────────────────────
  //
  // `contagemPorEstado` sai do pool SEM a dimensão status — é a contagem de
  // FACETA. Ela alimenta a barra segmentada, os quatro chips e a frase de
  // resolução, e é o que faz valer a invariante que o resto do app já segue:
  // o número ao lado de um filtro tem de ser o número de linhas que o clique
  // entrega. Se saísse de fullyFilteredItems, clicar em "Pendente" zeraria os
  // outros três chips e a barra viraria um bloco só — o mapa desapareceria
  // junto com o recorte.
  //
  // `contextStatusCounts` continua saindo de fullyFilteredItems porque serve a
  // outra coisa: o botão "Enviar N para Arte" AGE sobre as peças filtradas, e
  // a contagem dele tem de ser a do que vai de fato sair.
  const contagemPorEstado = useMemo(() => {
    const c = { PENDENTE: 0, RASCUNHO: 0, PRONTO: 0, ENVIADO: 0 };
    poolSemDimensao("status").forEach(i => {
      const st = getItemUIStatus(i, originalSponsorsMap[i.id] || [], pendingChanges[i.id]);
      c[st as keyof typeof c]++;
    });
    return c;
  }, [contextVisibleItems, eventById, searchQuery, itemFilter, sponsorFilter, originalSponsorsMap, pendingChanges]);

  const totalDoContexto = contagemPorEstado.PENDENTE + contagemPorEstado.RASCUNHO
                        + contagemPorEstado.PRONTO + contagemPorEstado.ENVIADO;

  // ── A FRASE DE RESOLUÇÃO ─────────────────────────────────────────────────
  //
  // Substitui três cartões de contagem. Os cartões diziam "12 pendentes, 3
  // rascunhos, 5 prontos" e deixavam a soma mental por conta de quem lê: o que
  // a pessoa quer saber ao abrir a tela é O QUE FAZER AGORA, e a resposta é
  // sempre uma só — a primeira coisa da fila. A precedência é a do fluxo:
  // vincular vem antes de salvar, que vem antes de enviar.
  const fraseDeResolucao = (() => {
    const { PENDENTE: pend, RASCUNHO: rasc, PRONTO: pron } = contagemPorEstado;
    const pecas = (n: number) => `${n} ${n === 1 ? "peça" : "peças"}`;
    if (pend > 0) {
      const base = `${pecas(pend)} ainda ${pend === 1 ? "não tem" : "não têm"} patrocinador`;
      return rasc > 0
        ? `${base} e ${rasc} ${rasc === 1 ? "rascunho espera" : "rascunhos esperam"} ser ${rasc === 1 ? "salvo" : "salvos"}.`
        : `${base}.`;
    }
    if (rasc > 0) return `${rasc} ${rasc === 1 ? "rascunho espera" : "rascunhos esperam"} ser ${rasc === 1 ? "salvo" : "salvos"} antes do envio à Arte.`;
    if (pron > 0) return `Tudo vinculado. ${pecas(pron)} ${pron === 1 ? "pronta" : "prontas"} para enviar à Arte.`;
    return "Tudo enviado à Arte. Nada pendente nesta tela.";
  })();

  const alternarStatus = (estado: string) =>
    setStatusFilter(prev => prev.includes(estado) ? prev.filter(v => v !== estado) : [...prev, estado]);

  const contextStatusCounts = useMemo(() => {
    const counts = { RASCUNHO: 0, PRONTO: 0, ENVIADO: 0, PENDENTE: 0 };
    fullyFilteredItems.forEach(item => {
      const status = itemUIStates[item.id] || 'PENDENTE';
      counts[status as keyof typeof counts]++;
    });
    return counts;
  }, [fullyFilteredItems, itemUIStates]);

  // IDs já processados — evita overwrite de updates otimistas durante mutations
  const loadedItemIdsRef = useRef(new Set<string>());

  // Preencher os mapas de patrocinadores a partir dos dados que JÁ vêm no
  // payload de /api/items (item.sponsors). Antes isto disparava uma requisição
  // GET /api/items/:id/sponsors por item (N+1) — com muitos itens, centenas de
  // requisições paralelas travavam a tela. Os mesmos ids já estão em
  // item.sponsors, então derivamos direto, sem rede.
  useEffect(() => {
    if (itemsLoading || items.length === 0) return;

    const newEntries: Record<string, string[]> = {};
    const newOriginals: Record<string, string[]> = {};
    let hasNew = false;

    for (const item of items) {
      // Pula itens já processados para não sobrescrever updates otimistas.
      if (loadedItemIdsRef.current.has(item.id)) continue;
      const sponsorIds = Array.isArray(item.sponsors)
        ? item.sponsors.map((s: any) => s.id).filter(Boolean)
        : [];
      newEntries[item.id] = sponsorIds;
      newOriginals[item.id] = sponsorIds;
      loadedItemIdsRef.current.add(item.id);
      hasNew = true;
    }

    if (!hasNew) return;

    // MERGE — nunca substitui entradas já existentes (preserva updates otimistas)
    setItemSponsorsMap(prev => ({ ...newEntries, ...prev }));
    setOriginalSponsorsMap(prev => ({ ...newOriginals, ...prev }));
  }, [items, itemsLoading]);

  // Helper para comparar arrays de sponsor IDs
  const areSponsorsEqual = (a: string[], b: string[]): boolean => {
    if (a.length !== b.length) return false;
    const sortedA = [...a].sort();
    const sortedB = [...b].sort();
    return sortedA.every((id, index) => id === sortedB[index]);
  };

  // Mutation para atualizar isReuse
  const updateItemIsReuseMutation = useMutation({
    mutationFn: async ({ itemId, isReuse }: { itemId: string, isReuse: boolean }) => {
      await apiRequest("PATCH", `/api/items/${itemId}`, { isReuse });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" });
    },
  });

  // Mutation para gerenciar patrocinadores do evento
  const manageEventSponsorsMutation = useMutation({
    mutationFn: async ({ eventId, currentSponsors, newSponsors }: { 
      eventId: string, 
      currentSponsors: string[], 
      newSponsors: string[] 
    }) => {
      const toAdd = newSponsors.filter(id => !currentSponsors.includes(id));
      const toRemove = currentSponsors.filter(id => !newSponsors.includes(id));

      // Adiciona e remove em paralelo (antes eram dois for...of sequenciais).
      await Promise.all([
        ...toAdd.map(sponsorId => apiRequest("POST", `/api/events/${eventId}/sponsors`, { sponsorId })),
        ...toRemove.map(sponsorId => apiRequest("DELETE", `/api/events/${eventId}/sponsors/${sponsorId}`)),
      ]);
    },
    onSuccess: async () => {
      // Invalidar e fazer refetch forçado
      queryClient.removeQueries({ queryKey: ["/api/events"] });
      await queryClient.refetchQueries({ queryKey: ["/api/events"], type: 'active' });
      // Contagens de uso por patrocinador e histórico também mudam aqui.
      queryClient.invalidateQueries({ queryKey: ["/api/sponsors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      setSponsorDialogOpen(false);
      toast({
        title: "✅ Patrocinadores atualizados!",
        description: "Os patrocinadores foram vinculados ao evento",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao atualizar patrocinadores",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Mutation 1: Salvar vinculação (patrocinadores + skipApproval) SEM mudar status
  type SavePayload = { itemId: string; sponsorIds: string[]; skipApproval: boolean };

  const saveLinkingMutation = useMutation({
    mutationFn: async (payloads: SavePayload[]) => {
      const savedIds: string[] = [];
      const failed: { itemId: string; message: string }[] = [];
      if (payloads.length === 0) return { savedIds, failed };

      // Lotes com concorrência limitada (evita esgotar o pool do banco), porém
      // tolerando falha parcial: um item com erro não descarta os que já foram
      // salvos nos lotes anteriores — senão o rollback marcaria como não salvo
      // algo que já está gravado no servidor.
      const batchSize = 5;
      for (let i = 0; i < payloads.length; i += batchSize) {
        const batch = payloads.slice(i, i + batchSize);
        const results = await Promise.allSettled(
          batch.map(({ itemId, sponsorIds, skipApproval }) =>
            apiRequest("POST", `/api/items/${itemId}/sponsors/sync`, { sponsorIds, skipApproval })
          )
        );
        results.forEach((r, idx) => {
          const itemId = batch[idx].itemId;
          if (r.status === "fulfilled") savedIds.push(itemId);
          else failed.push({ itemId, message: (r.reason as Error)?.message || "erro desconhecido" });
        });
      }

      // Nada salvou: propaga para o onError fazer o rollback completo.
      if (savedIds.length === 0 && failed.length > 0) throw new Error(failed[0].message);
      return { savedIds, failed };
    },
    onMutate: (payloads: SavePayload[]) => {
      const snapshot = {
        itemSponsorsMap: { ...itemSponsorsMap },
        originalSponsorsMap: { ...originalSponsorsMap },
        itemsCache: queryClient.getQueryData<any[]>(["/api/items"]),
      };
      // Atualização otimista: sponsors locais
      payloads.forEach(({ itemId, sponsorIds }) => {
        setItemSponsorsMap(prev => ({ ...prev, [itemId]: sponsorIds }));
        setOriginalSponsorsMap(prev => ({ ...prev, [itemId]: sponsorIds }));
      });
      // Atualização otimista: skipApproval no cache do React Query
      // (necessário para getItemUIStatus ler item.skipApproval correto antes do refetch)
      queryClient.setQueryData<any[]>(["/api/items"], (old) => {
        if (!old) return old;
        return old.map(item => {
          const p = payloads.find(pl => pl.itemId === item.id);
          if (!p) return item;
          return { ...item, skipApproval: p.skipApproval };
        });
      });
      return snapshot;
    },
    onSuccess: ({ savedIds, failed }, _vars: SavePayload[], snapshot: any) => {
      setPendingChanges(prev => {
        const next = { ...prev };
        savedIds.forEach(id => { delete next[id]; });
        return next;
      });

      // Reverte localmente apenas os itens que falharam, preservando os salvos.
      if (failed.length > 0 && snapshot) {
        const restore = (prev: Record<string, string[]>, from: Record<string, string[]>) => {
          const next = { ...prev };
          failed.forEach(({ itemId }) => {
            if (from[itemId] !== undefined) next[itemId] = from[itemId];
            else delete next[itemId];
          });
          return next;
        };
        setItemSponsorsMap(prev => restore(prev, snapshot.itemSponsorsMap));
        setOriginalSponsorsMap(prev => restore(prev, snapshot.originalSponsorsMap));
      }

      // Sem invalidar /api/items: o onMutate já atualizou de forma otimista os
      // mapas de patrocinadores e o skipApproval no cache do React Query — que é
      // tudo que a UI lê. Invalidar aqui forçava um reload completo (N+1 no
      // backend) a cada salvamento, deixando a tela lenta.
      // Audit-logs sim: o sync gera registro e o histórico do dialog de
      // detalhes ficava stale sem isto.
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      if (failed.length === 0) {
        toast({
          title: "Vinculação salva!",
          description: `${savedIds.length} item${savedIds.length !== 1 ? 's' : ''} pronto${savedIds.length !== 1 ? 's' : ''} para enviar.`,
        });
      } else {
        console.error("[vincular] falhas ao salvar:", failed);
        toast({
          title: `${savedIds.length} salvo${savedIds.length !== 1 ? 's' : ''}, ${failed.length} com erro`,
          description: `${failed[0].message}. Os itens com erro continuam pendentes — tente salvar de novo.`,
          variant: "destructive",
        });
      }
    },
    onError: (_error: Error, _vars: SavePayload[], snapshot: any) => {
      if (snapshot) {
        setItemSponsorsMap(snapshot.itemSponsorsMap);
        setOriginalSponsorsMap(snapshot.originalSponsorsMap);
        // Reverter cache do React Query
        if (snapshot.itemsCache) {
          queryClient.setQueryData(["/api/items"], snapshot.itemsCache);
        }
      }
      console.error("[vincular] save draft error:", _error);
      toast({
        title: "Erro ao salvar vinculação",
        description: _error?.message || "Não foi possível salvar. Tente novamente.",
        variant: "destructive",
      });
    },
  });

  // Mutation para enviar items para Arte
  const sendToArteMutation = useMutation({
    mutationFn: async (itemIds: string[]) => {
      const res = await apiRequest("POST", "/api/items/send-to-arte", { itemIds });
      return res.json();
    },
    onMutate: (itemIds: string[]) => {
      // Atualização otimista: marca visualmente como ENVIADO antes da resposta do servidor
      setOptimisticSentIds(prev => new Set(Array.from(prev).concat(itemIds)));
    },
    onSuccess: (data, itemIds) => {
      // Invalida em background — não bloqueia. Audit-logs e notificações
      // também: o envio gera as duas coisas no servidor.
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      setSelectedItemIds(new Set());
      // Limpa só os otimistas DESTE envio — zerar tudo apagava o estado de um
      // segundo envio ainda em voo.
      setOptimisticSentIds(prev => {
        const next = new Set(prev);
        itemIds.forEach(id => next.delete(id));
        return next;
      });
      setSendConfirmModal(null);
      
      if (data.errors && data.errors.length > 0) {
        toast({
          title: `${data.sent} item${data.sent !== 1 ? 's' : ''} enviado${data.sent !== 1 ? 's' : ''} para Arte`,
          description: `Alguns itens tiveram erros: ${data.errors.join(', ')}`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Enviado para Arte!",
          description: `${data.sent} item${data.sent !== 1 ? 's' : ''} enviado${data.sent !== 1 ? 's' : ''} com sucesso.`,
        });
      }
    },
    onError: (error: Error, itemIds: string[]) => {
      // Reverter estado otimista
      setOptimisticSentIds(prev => {
        const next = new Set(prev);
        itemIds.forEach(id => next.delete(id));
        return next;
      });
      toast({
        title: "Erro ao enviar para Arte",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Mutation: devolver peça para Criação (Solicitação)
  const returnToCreationMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const res = await apiRequest("POST", `/api/items/${itemId}/return-to-creation`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      // Espelha o dropAffected do auto-vínculo: além do loadedItemIdsRef, os
      // mapas locais e o rascunho precisam esquecer o item — o servidor zerou
      // os vínculos, e a entrada antiga fazia a peça voltar com
      // patrocinadores fantasma.
      if (returnModal) {
        const id = returnModal.id;
        loadedItemIdsRef.current.delete(id);
        setItemSponsorsMap(prev => { const n = { ...prev }; delete n[id]; return n; });
        setOriginalSponsorsMap(prev => { const n = { ...prev }; delete n[id]; return n; });
        setPendingChanges(prev => { const n = { ...prev }; delete n[id]; return n; });
      }
      setReturnModal(null);
      toast({ title: "Peça devolvida para Criação", description: "O item voltou para a equipe de Solicitação." });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao devolver peça", description: error.message, variant: "destructive" });
    },
  });

  const handleOpenSponsorDialog = (event: any) => {
    setSelectedEventForSponsors(event);
    const eventSponsors = getEventSponsors(event.id);
    setSelectedSponsorIds(eventSponsors.map(s => s.id));
    setSponsorDialogOpen(true);
  };

  const handleSaveEventSponsors = () => {
    if (!selectedEventForSponsors) return;
    
    const currentSponsors = getEventSponsors(selectedEventForSponsors.id).map(s => s.id);
    
    manageEventSponsorsMutation.mutate({
      eventId: selectedEventForSponsors.id,
      currentSponsors,
      newSponsors: selectedSponsorIds,
    });
  };

  // Normalizar patrocinadores do evento (event.sponsors é array de objetos relation)
  const eventSponsorMap = useMemo(() => {
    const map: Record<string, string[]> = {};
    rawEvents.forEach(event => {
      if (event.sponsors && Array.isArray(event.sponsors)) {
        map[event.id] = event.sponsors.map((rel: any) => rel.sponsorId);
      } else {
        map[event.id] = [];
      }
    });
    return map;
  }, [rawEvents]);

  const getEventSponsors = (eventId: string) => {
    const sponsorIds = eventSponsorMap[eventId] || [];
    return sponsors.filter(sponsor => sponsorIds.includes(sponsor.id));
  };

  // Funções para seleção em lote
  const toggleItemSelection = (itemId: string) => {
    setSelectedItemIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  };

  const toggleAllItemsInEvent = (eventItems: any[]) => {
    const eventItemIds = eventItems.map(item => item.id);
    const allSelected = eventItemIds.every(id => selectedItemIds.has(id));
    
    setSelectedItemIds(prev => {
      const newSet = new Set(prev);
      if (allSelected) {
        eventItemIds.forEach(id => newSet.delete(id));
      } else {
        eventItemIds.forEach(id => newSet.add(id));
      }
      return newSet;
    });
  };

  const handleOpenBulkApplyDialog = () => {
    setBulkSelectedSponsors([]);
    setBulkSkipApproval(false);
    setBulkApplyDialogOpen(true);
  };

  // Alterna a opção "Sem Patrocinador" do lote (usada no clique e no teclado)
  const toggleBulkSkip = () => {
    if (bulkSkipApproval) {
      setBulkSkipApproval(false);
    } else {
      setBulkSelectedSponsors([]);
      setBulkSkipApproval(true);
    }
  };

  const handleApplyBulkSponsors = () => {
    const allSelectedItems = Array.from(selectedItemIds);

    // O botão "Aplicar em Lote" já fica desabilitado sem seleção; este guard
    // é só cinto de segurança (sem toast destrutivo).
    if (bulkSelectedSponsors.length === 0 && !bulkSkipApproval) return;

    // Aplicar patrocinadores apenas a itens NÃO isentos (skipApproval=false)
    // a menos que bulkSkipApproval seja true (nesse caso, aplica a todos)
    const itemsToUpdate: { itemId: string; sponsorIds: string[]; skipApproval: boolean }[] = [];
    const skippedItems: string[] = [];
    
    allSelectedItems.forEach(itemId => {
      const currentSponsors = itemSponsorsMap[itemId] || originalSponsorsMap[itemId] || [];
      const item = items.find(i => i.id === itemId);
      const originalSkipApproval = item?.skipApproval || false;
      
      // Pular itens isentos quando não está aplicando skipApproval
      if (originalSkipApproval && !bulkSkipApproval) {
        skippedItems.push(itemId);
        return;
      }
      
      // Combinar patrocinadores existentes com novos (sem duplicatas)
      const combinedSponsors = Array.from(new Set([...currentSponsors, ...bulkSelectedSponsors]));
      
      const hasChanges = 
        !areSponsorsEqual(combinedSponsors, originalSponsorsMap[itemId] || []) ||
        bulkSkipApproval !== originalSkipApproval;
      
      if (hasChanges) {
        setPendingChanges(prev => ({
          ...prev,
          [itemId]: {
            sponsorIds: combinedSponsors,
            skipApproval: bulkSkipApproval,
            isDirty: true
          }
        }));
        
        setItemSponsorsMap(prev => ({
          ...prev,
          [itemId]: combinedSponsors
        }));
        
        itemsToUpdate.push({ itemId, sponsorIds: combinedSponsors, skipApproval: bulkSkipApproval });
      }
    });

    // Limpar seleção e fechar modal
    setSelectedItemIds(new Set());
    setBulkApplyDialogOpen(false);
    setBulkSelectedSponsors([]);
    setBulkSkipApproval(false);
    
    if (itemsToUpdate.length === 0) {
      toast({
        title: "Nenhuma alteração",
        description: skippedItems.length > 0
          ? `${skippedItems.length} item${skippedItems.length !== 1 ? 's' : ''} isento${skippedItems.length !== 1 ? 's' : ''} ignorado${skippedItems.length !== 1 ? 's' : ''}. Patrocinadores já estavam vinculados nos demais.`
          : "Os patrocinadores selecionados já estavam vinculados",
      });
      return;
    }
    
    // Salvar automaticamente após aplicar
    saveLinkingMutation.mutate(itemsToUpdate);
  };

  // Calcular progresso
  const getItemStatus = (item: any) => {
    // Sempre usar dados SALVOS no banco (originalSponsorsMap), não estado local
    const savedSponsors = originalSponsorsMap[item.id] || [];
    const savedSkipApproval = item.skipApproval || false;
    
    // Status baseado APENAS em dados salvos no banco
    // Mudanças pendentes (não salvas) são tratadas separadamente pelo badge "Pronto"
    if (savedSkipApproval) return 'skip';
    if (savedSponsors.length > 0) return 'linked';
    
    return 'pending';
  };

  const calculateProgress = (eventItems: any[]) => {
    const completed = eventItems.filter(item => {
      const status = getItemStatus(item);
      return status === 'linked' || status === 'skip';
    }).length;
    return { completed, total: eventItems.length };
  };


  // ── OS GRUPOS DA LISTA ───────────────────────────────────────────────────
  //
  // Um derivado só para os dois agrupamentos. Antes o "por patrocinador"
  // tinha a sua própria árvore de dados (`sponsorGroupedData`, três níveis:
  // evento → patrocinador → itens) e separava as peças em `items` (já
  // vinculadas) e `pendingItems` (as outras) — duas listas para o mesmo
  // patrocinador, quando a operação que traz alguém aqui é justamente passar
  // de uma para a outra. Agora o grupo traz TODAS as peças do evento e o chip
  // marcado é que diz quais já têm a marca.
  type GrupoDaLista = {
    chave: string;
    event: any;
    /** Só no agrupamento por patrocinador. */
    sponsor?: any;
    itens: any[];
    vinculadas: number;
    total: number;
  };

  const gruposDaLista = useMemo<GrupoDaLista[]>(() => {
    if (agrupamento === 'evento') {
      return filteredEventEntries.map(([eventId, eventItems]) => {
        const event = eventById.get(eventId)!;
        const itens = filterItems(eventItems as any[], event.name);
        const progresso = calculateProgress(itens);
        return { chave: eventId, event, itens, vinculadas: progresso.completed, total: progresso.total };
      });
    }

    const out: GrupoDaLista[] = [];
    for (const [eventId, eventItems] of Object.entries(itemsByEvent)) {
      if (eventFilter.length > 0 && !eventFilter.includes(eventId)) continue;
      const event = eventById.get(eventId);
      if (!event) continue;
      const itens = filterItems(eventItems as any[], event.name);
      if (itens.length === 0) continue;
      const doEvento = getEventSponsors(eventId)
        .filter(sp => sponsorFilter.length === 0 || sponsorFilter.includes(sp.id));
      for (const sponsor of doEvento) {
        const vinculadas = itens.filter(i => (itemSponsorsMap[i.id] ?? []).includes(sponsor.id)).length;
        out.push({ chave: `${eventId}:${sponsor.id}`, event, sponsor, itens, vinculadas, total: itens.length });
      }
    }
    return out;
  }, [agrupamento, filteredEventEntries, itemsByEvent, eventById, eventFilter, sponsorFilter,
      itemSponsorsMap, originalSponsorsMap, pendingChanges, searchQuery, itemFilter, statusFilter,
      eventSponsorMap, sponsors]);

  // Alvo dos controles dentro da linha. 44 no toque; no ponteiro a linha é
  // densa de proposito — esta tela existe para varrer dezenas de pecas — e o
  // desenho pede 26/30, abaixo dos 36 que a regua da casa usa em barra de
  // ferramentas. Aqui o alvo real e a LINHA INTEIRA, que abre a peca no
  // clique; estes botoes sao o refinamento dentro dela.
  const ALVO = isMobile ? 44 : 30;

  // ── Cabeçalho de coluna. #7a6154 e não o #746e69 de antes: sobre o #fafaf9
  //    do thead, 4,4:1 não passa a régua da casa; este dá 5,5.
  const THC: React.CSSProperties = {
    padding: '9px 12px', textAlign: 'left',
    fontSize: 11, fontWeight: 700, color: '#7a6154',
    textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap',
  };

  /**
   * Vincula um patrocinador a todas as peças que ainda não o têm — como
   * RASCUNHO, igual a marcar um chip a um. Nada vai para o servidor até o
   * "Salvar", que é o que torna a ação segura de oferecer no cabeçalho.
   */
  const vincularRestantes = (sponsorId: string, alvos: any[]) => {
    if (alvos.length === 0) return;
    const novosVinculos: Record<string, string[]> = {};
    setPendingChanges(prev => {
      const next = { ...prev };
      for (const item of alvos) {
        const atuais = itemSponsorsMap[item.id] ?? [];
        if (atuais.includes(sponsorId)) continue;
        const novos = [...atuais, sponsorId];
        novosVinculos[item.id] = novos;
        const originais = originalSponsorsMap[item.id] || [];
        const skipOriginal = item.skipApproval || false;
        // Vincular alguém e continuar "sem patrocinador" é contradição: o
        // vínculo ganha, como já acontece ao marcar um chip.
        const mudou = !areSponsorsEqual(novos, originais) || skipOriginal;
        if (mudou) next[item.id] = { sponsorIds: novos, skipApproval: false, isDirty: true };
        else delete next[item.id];
      }
      return next;
    });
    setItemSponsorsMap(prev => ({ ...prev, ...novosVinculos }));
  };

  /** Grava um conjunto novo de patrocinadores como rascunho local. */
  const aplicarVinculo = (item: any, novos: string[], skip: boolean) => {
    const originais = originalSponsorsMap[item.id] || [];
    const skipOriginal = item.skipApproval || false;
    const mudou = !areSponsorsEqual(novos, originais) || skip !== skipOriginal;
    setPendingChanges(prev => {
      if (!mudou) { const n = { ...prev }; delete n[item.id]; return n; }
      return { ...prev, [item.id]: { sponsorIds: novos, skipApproval: skip, isDirty: true } };
    });
    setItemSponsorsMap(prev => ({ ...prev, [item.id]: novos }));
  };

  /**
   * UMA LINHA DE TABELA POR PEÇA.
   *
   * Ocupava três a quatro linhas de altura: seis colunas (ID e Peça separadas,
   * Detalhes com dois valores empilhados) e, dentro da célula de vínculos, um
   * selo "Salvo · editar", os chips, uma linha de links sublinhados
   * ("sem pat." · "reaprov.") e o selo "Sem patrocinador". Numa tela cujo
   * trabalho é varrer dezenas de peças, a altura da linha é o custo de tudo.
   *
   * `chips` é o escopo do agrupamento: todos os patrocinadores do evento, ou
   * só aquele por quem se agrupou.
   */
  const renderLinhaDaPeca = (item: any, chips: any[], eventSponsors: any[]) => {
    const vinculados = itemSponsorsMap[item.id] || [];
    const semPatrocinador = pendingChanges[item.id]?.skipApproval ?? (item.skipApproval || false);
    const editavel = getItemEditability(item);
    const estado = optimisticSentIds.has(item.id) ? 'ENVIADO' : (itemUIStates[item.id] || 'PENDENTE');
    const selecionada = selectedItemIds.has(item.id);
    const podeSelecionar = estado === 'PENDENTE' || estado === 'RASCUNHO';
    const menuAberto = menuDaLinha === item.id;

    // A COR DE ESTADO VAI NA BORDA, não no fundo. O fundo colorido da linha
    // inteira competia com os chips, que também são coloridos — e chip de
    // marca sobre fundo tingido perde justamente a cor que o identifica.
    const corDaBorda = selecionada ? '#c2410c' : estado === 'RASCUNHO' ? '#f97316' : 'transparent';

    // NO CELULAR A LINHA VIRA CARTÃO — sem duplicar a árvore.
    //
    // Cinco colunas não cabem em 390px, e o caminho fácil seria escrever uma
    // segunda árvore de JSX para o celular: exatamente o defeito que esta tela
    // acabou de resolver (duas árvores é como as ações divergem — não por
    // decisão, mas porque ninguém copiou o botão novo para o outro lado).
    // `display: grid` na <tr> e `display: block` nas <td> empilham as mesmas
    // células, e a função de render continua sendo uma só.
    const celula: React.CSSProperties = isMobile ? { display: 'block', width: '100%' } : {};

    return (
      <tr
        key={item.id}
        data-testid={`item-row-${item.id}`}
        onClick={() => setSelectedItemForDetails(item)}
        style={{
          ...(isMobile ? {
            display: 'grid', gridTemplateColumns: '46px 1fr',
            border: `1px solid ${selecionada ? '#fdba74' : '#e7e5e4'}`,
            borderLeft: `3px solid ${corDaBorda === 'transparent' ? '#e7e5e4' : corDaBorda}`,
            borderRadius: 12, marginBottom: 10, padding: '10px 12px 10px 0',
          } : { borderBottom: '1px solid #f0efee' }),
          backgroundColor: selecionada ? '#fff7ed' : '#ffffff',
          // 0.55 + grayscale derrubava a linha inteira abaixo de AA, e o hover
          // (que restaurava) não existe no teclado.
          opacity: estado === 'ENVIADO' ? 0.8 : 1,
          cursor: 'pointer',
          transition: 'background-color 0.12s',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = selecionada ? '#ffedd5' : '#fafaf9'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = selecionada ? '#fff7ed' : '#ffffff'; }}
      >
        {/* ── Seleção ── */}
        <td onClick={e => e.stopPropagation()} style={isMobile
          ? { display: 'flex', alignItems: 'flex-start', justifyContent: 'center', gridRow: '1 / span 4', paddingTop: 2 }
          : { width: 46, textAlign: 'center', padding: '8px 0', borderLeft: `3px solid ${corDaBorda}` }}>
          <Checkbox
            checked={selecionada}
            onCheckedChange={() => podeSelecionar && toggleItemSelection(item.id)}
            disabled={!podeSelecionar}
            title={estado === 'PRONTO' ? 'Remova os patrocinadores antes de aplicar em lote' : estado === 'ENVIADO' ? 'Peça já enviada' : undefined}
            aria-label={`Selecionar ${item.displayId}`}
            data-testid={`checkbox-item-${item.id}`}
          />
        </td>

        {/* ── Peça ── */}
        <td style={isMobile ? { ...celula, paddingBottom: 6 } : { padding: '8px 12px', minWidth: 200 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            {/* A linha inteira abre o detalhe no clique, mas <tr> não recebe
                foco: por teclado não havia como abrir peça nenhuma. O ID vira o
                alvo focável — é o rótulo natural da linha. */}
            <button
              type="button"
              onClick={e => { e.stopPropagation(); setSelectedItemForDetails(item); }}
              aria-label={`Ver detalhes da peça ${item.displayId}`}
              data-testid={`text-display-id-${item.id}`}
              style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 700, color: '#78716c', background: 'none', border: 'none', padding: 0, cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' }}
            >
              {item.displayId}
            </button>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#1c1917', whiteSpace: 'nowrap', flexShrink: 0 }}>{item.type}</span>
            {item.description && (
              // flexShrink alto: quando falta largura, é a descrição que cede.
              // O tipo e o ID identificam a peça; a descrição a detalha.
              <span title={item.description} style={{ fontSize: 12, color: '#57534e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 999, minWidth: 0 }}>
                {item.description}
              </span>
            )}
            {/* MARCADORES COMO ÍCONE. Eram pílulas com texto ("Ref. visual"),
                do mesmo tamanho da descrição e disputando com ela a leitura —
                sendo que o que elas dizem é binário: tem ou não tem. */}
            {safeRefUrl(item.referenceUrl) && (
              <button
                type="button"
                onClick={e => { e.stopPropagation(); setPreviewRefUrl(safeRefUrl(item.referenceUrl)); }}
                title="Ver a referência visual do solicitante"
                aria-label={`Ver a referência visual de ${item.displayId}`}
                data-testid={`link-reference-vincular-${item.id}`}
                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 6, border: 'none', background: 'none', color: '#2563eb', cursor: 'pointer', flexShrink: 0, padding: 0 }}
              >
                <Paperclip style={{ width: 13, height: 13 }} />
              </button>
            )}
            {item.isReuse && (
              <span title="Reaproveitamento" aria-label="Reaproveitamento" style={{ display: 'inline-flex', color: '#047857', flexShrink: 0 }}>
                <Recycle aria-hidden="true" style={{ width: 13, height: 13 }} />
              </span>
            )}
          </div>
        </td>

        {/* ── Qtd · m² ──
            Eram dois valores empilhados em 11px, o segundo com letterSpacing
            negativo. Numa célula só e em DM Mono, os números de linhas
            vizinhas se alinham e dá para comparar de relance. */}
        <td style={isMobile ? { ...celula, paddingBottom: 8 } : { padding: '8px 12px', whiteSpace: 'nowrap' }}>
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: '#57534e' }}>
            {item.quantity ?? 0} un
            {item.calculatedM2 != null && !isNaN(parseFloat(item.calculatedM2))
              ? ` · ${parseFloat(item.calculatedM2).toFixed(2)} m²`
              : ''}
          </span>
        </td>

        {/* ── Patrocinadores / Vínculo ── */}
        <td onClick={e => e.stopPropagation()} style={isMobile ? { ...celula, paddingBottom: 10 } : { padding: '8px 12px', minWidth: 0 }}>
          {semPatrocinador ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', height: 26, padding: '0 10px', borderRadius: 999, backgroundColor: '#fffbeb', color: '#92400e', border: '1px solid #fcd34d', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>
                Sem patrocinador
              </span>
              {editavel && (
                <button
                  type="button"
                  onClick={() => toggleItemSkipApproval(item)}
                  data-testid={`btn-undo-skip-${item.id}`}
                  style={{ height: ALVO, padding: '0 10px', borderRadius: R.sm, border: '1px solid #e7e5e4', background: '#fff', color: '#57534e', font: 'inherit', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                >
                  Desfazer
                </button>
              )}
            </div>
          ) : eventSponsors.length === 0 ? (
            <span style={{ fontSize: 12, color: '#57534e', fontStyle: 'italic' }}>Sem patrocinadores no evento</span>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
              {chips.map(sp => {
                const marcado = vinculados.includes(sp.id);
                // PEÇA ENVIADA mostra só o que ficou vinculado, em cinza e sem
                // clique: o vínculo está travado no servidor, e um chip que
                // parece clicável e não faz nada é pior que a ausência dele.
                if (estado === 'ENVIADO') {
                  if (!marcado) return null;
                  return (
                    <span
                      key={sp.id}
                      title="Peça já enviada — vínculo travado"
                      data-testid={`chip-sponsor-${item.id}-${sp.id}`}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 26, padding: '0 10px', borderRadius: 999, backgroundColor: '#f0efee', color: '#57534e', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}
                    >
                      <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: '#a8a29e', flexShrink: 0 }} />
                      {sp.name}
                    </span>
                  );
                }
                const marca = sp.color || '#3b82f6';
                // A cor da marca em texto de 12px precisa de 4,5:1 sobre o
                // fundo de 10% dela mesma. `darkenToContrast` escurece só o
                // necessário — a marca continua reconhecível, que é o que faz
                // a tabela legível de longe.
                const corDoTexto = darkenToContrast(marca, '#ffffff', 4.5);
                return (
                  <button
                    key={sp.id}
                    type="button"
                    role="checkbox"
                    aria-checked={marcado}
                    aria-label={`${marcado ? 'Desvincular' : 'Vincular'} ${sp.name} ${marcado ? 'de' : 'a'} ${item.displayId}`}
                    title={marcado ? `Clique para desvincular ${sp.name}` : `Clique para vincular ${sp.name}`}
                    disabled={!editavel}
                    onClick={() => {
                      if (!editavel) return;
                      aplicarVinculo(item, marcado ? vinculados.filter(id => id !== sp.id) : [...vinculados, sp.id], false);
                    }}
                    onKeyDown={e => {
                      if (e.key !== 'Enter' && e.key !== ' ') return;
                      e.preventDefault();
                      if (!editavel) return;
                      aplicarVinculo(item, marcado ? vinculados.filter(id => id !== sp.id) : [...vinculados, sp.id], false);
                    }}
                    data-testid={`checkbox-sponsor-${item.id}-${sp.id}`}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      height: isMobile ? 44 : 26, padding: '0 10px', borderRadius: 999,
                      backgroundColor: marcado ? hexToRgba(marca, 0.1) : '#ffffff',
                      color: marcado ? corDoTexto : '#57534e',
                      border: `1px solid ${marcado ? hexToRgba(marca, 0.45) : '#e7e5e4'}`,
                      cursor: editavel ? 'pointer' : 'not-allowed',
                      font: 'inherit', fontSize: 12, fontWeight: 600,
                      whiteSpace: 'nowrap', transition: 'background 0.12s, border-color 0.12s',
                    }}
                  >
                    <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: marcado ? marca : '#d6d3d1', flexShrink: 0 }} />
                    {sp.name}
                  </button>
                );
              })}
            </div>
          )}
        </td>

        {/* ── Status e a ação daquele estado ── */}
        <td onClick={e => e.stopPropagation()} style={isMobile ? celula : { padding: '8px 16px 8px 12px', whiteSpace: 'nowrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: isMobile ? 'flex-start' : 'flex-end', gap: 6, flexWrap: 'wrap' }}>
            <span
              data-testid={`badge-status-${item.id}`}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                height: 24, padding: '0 9px', borderRadius: 999,
                fontSize: 12, fontWeight: 700,
                ...(estado === 'RASCUNHO' ? { backgroundColor: '#ffedd5', color: '#9a3412' }
                  : estado === 'PRONTO' ? { backgroundColor: '#dcfce7', color: '#166534' }
                  : estado === 'ENVIADO' ? { backgroundColor: '#1c1917', color: '#ffffff' }
                  : { backgroundColor: '#f0efee', color: '#44403c' }),
              }}
            >
              {estado === 'RASCUNHO' ? <Save aria-hidden="true" style={{ width: 11, height: 11 }} />
                : estado === 'PRONTO' ? <CheckCircle2 aria-hidden="true" style={{ width: 11, height: 11 }} />
                : estado === 'ENVIADO' ? <Lock aria-hidden="true" style={{ width: 11, height: 11 }} />
                : <Info aria-hidden="true" style={{ width: 11, height: 11 }} />}
              {UI_STATUS_LABEL[estado] ?? estado}
            </span>

            {/* A AÇÃO DO ESTADO, COM RÓTULO. Eram ícones de 13px sem texto, com
                o significado só no `title`: um disquete e um avião de papel
                lado a lado, e a diferença entre salvar e ENVIAR — que tira a
                peça da tela — ficava por conta de quem adivinhasse. */}
            {estado === 'RASCUNHO' && editavel && (
              <button
                type="button"
                onClick={() => {
                  const ch = pendingChanges[item.id];
                  saveLinkingMutation.mutate([{ itemId: item.id, sponsorIds: ch?.sponsorIds ?? [], skipApproval: ch?.skipApproval ?? false }]);
                }}
                disabled={saveLinkingMutation.isPending}
                data-testid={`button-save-item-${item.id}`}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: ALVO, padding: '0 12px', borderRadius: R.sm, backgroundColor: '#fff7ed', border: '1px solid #fed7aa', color: '#9a3412', font: 'inherit', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
              >
                <Save aria-hidden="true" style={{ width: 12, height: 12 }} />
                Salvar
              </button>
            )}
            {estado === 'PRONTO' && editavel && (
              <button
                type="button"
                onClick={() => openSendModalForItem(item)}
                disabled={sendToArteMutation.isPending}
                data-testid={`button-send-item-${item.id}`}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: ALVO, padding: '0 12px', borderRadius: R.sm, backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', font: 'inherit', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
              >
                <Send aria-hidden="true" style={{ width: 12, height: 12 }} />
                Enviar
              </button>
            )}

            {/* ── Ações secundárias ──
                Eram links SUBLINHADOS de 11px em cinza dentro da célula de
                vínculos ("sem pat." · "reaprov."), indistinguíveis de texto
                morto — e "sem pat." apaga os patrocinadores da peça. Ação que
                descarta trabalho não mora num link de 11px. */}
            {editavel && (
              <div style={{ position: 'relative' }}>
                <button
                  type="button"
                  onClick={() => setMenuDaLinha(menuAberto ? null : item.id)}
                  aria-haspopup="menu"
                  aria-expanded={menuAberto}
                  aria-label={`Mais ações para ${item.displayId}`}
                  title="Mais ações"
                  data-testid={`menu-row-actions-${item.id}`}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: isMobile ? 44 : 26, height: isMobile ? 44 : 26, borderRadius: R.sm, border: '1px solid #e7e5e4', background: '#fff', color: '#57534e', cursor: 'pointer', padding: 0 }}
                >
                  <MoreHorizontal style={{ width: 14, height: 14 }} />
                </button>
                {menuAberto && (
                  <div
                    role="menu"
                    onKeyDown={e => {
                      if (e.key !== 'Escape') return;
                      e.stopPropagation();
                      setMenuDaLinha(null);
                      // Devolve o foco ao gatilho — sem isto o foco cai no
                      // <body> e o teclado recomeça do topo da tabela.
                      document.querySelector<HTMLButtonElement>(`[data-testid="menu-row-actions-${item.id}"]`)?.focus();
                    }}
                    style={{
                      position: 'absolute', right: 0, top: '100%', marginTop: 4, zIndex: 40,
                      minWidth: 226, backgroundColor: '#ffffff', border: '1px solid #e7e5e4',
                      borderRadius: R.md, boxShadow: '0 10px 30px rgba(0,0,0,0.12)', padding: 4,
                    }}
                  >
                    {[
                      {
                        rotulo: semPatrocinador ? 'Desmarcar "sem patrocinador"' : 'Marcar sem patrocinador',
                        testId: `btn-skip-sponsor-${item.id}`,
                        acao: () => toggleItemSkipApproval(item),
                      },
                      {
                        rotulo: item.isReuse ? 'Desmarcar reaproveitamento' : 'Marcar reaproveitamento',
                        testId: `btn-reuse-${item.id}`,
                        acao: () => updateItemIsReuseMutation.mutate({ itemId: item.id, isReuse: !item.isReuse }),
                      },
                      {
                        rotulo: 'Devolver para Criação',
                        testId: `button-return-creation-${item.id}`,
                        acao: () => setReturnModal(item),
                      },
                    ].map(op => (
                      <button
                        key={op.testId}
                        type="button"
                        role="menuitem"
                        autoFocus={op.testId.startsWith('btn-skip-sponsor')}
                        onClick={() => { setMenuDaLinha(null); op.acao(); }}
                        data-testid={op.testId}
                        style={{ display: 'block', width: '100%', minHeight: ALVO, padding: '0 12px', textAlign: 'left', border: 'none', background: 'none', borderRadius: R.sm, font: 'inherit', fontSize: 13, color: '#1c1917', cursor: 'pointer' }}
                        onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f5f4f1'; }}
                        onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                      >
                        {op.rotulo}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </td>
      </tr>
    );
  };

  useEffect(() => { if (!sendConfirmModal) setSoSemPatrocinador(false); }, [sendConfirmModal]);

  const openSendModalForItem = (item: any, preSelectedSponsorId?: string) => {
    const pending: Set<string> = new Set();
    if (preSelectedSponsorId) pending.add(preSelectedSponsorId);
    setSendConfirmModal({ items: [item], pendingByItem: { [item.id]: pending } });
  };

  // Abre o modal para o bulk "Vincular e Enviar"
  // Alterna sponsor no modal (na seção "outros patrocinadores")
  const toggleModalSponsor = (itemId: string, sponsorId: string) => {
    setSendConfirmModal(prev => {
      if (!prev) return prev;
      const next = new Set(prev.pendingByItem[itemId] || []);
      next.has(sponsorId) ? next.delete(sponsorId) : next.add(sponsorId);
      return { ...prev, pendingByItem: { ...prev.pendingByItem, [itemId]: next } };
    });
  };

  // Confirma e executa o envio com os patrocinadores finais do modal
  const handleModalConfirmSend = async () => {
    if (!sendConfirmModal || isSending) return;
    const { items, pendingByItem } = sendConfirmModal;
    setIsSending(true);

    try {
      // Sincroniza os itens que ganharam patrocinadores no modal OU que têm
      // rascunho local não salvo — antes, enviar um rascunho descartava as
      // edições não salvas em silêncio (o sync usava só o que estava salvo).
      const toSync = items.filter(item => {
        const draft = pendingChanges[item.id];
        const existing = draft?.sponsorIds ?? originalSponsorsMap[item.id] ?? [];
        const newOnes = Array.from(pendingByItem[item.id] || []);
        return !!draft?.isDirty || newOnes.some(id => !existing.includes(id));
      });
      await runInBatches(toSync, async (item) => {
        const draft = pendingChanges[item.id];
        const existing = draft?.sponsorIds ?? originalSponsorsMap[item.id] ?? [];
        const newOnes = Array.from(pendingByItem[item.id] || []);
        const merged = Array.from(new Set([...existing, ...newOnes]));
        // skipApproval só vai no body quando há rascunho com a flag; caso
        // contrário o servidor preserva o valor atual (mandar `false` fixo
        // apagava a marca "sem aprovação" de itens isentos).
        await apiRequest("POST", `/api/items/${item.id}/sponsors/sync`, {
          sponsorIds: merged,
          ...(draft ? { skipApproval: draft.skipApproval } : {}),
        });
        setOriginalSponsorsMap(prev => ({ ...prev, [item.id]: merged }));
        setItemSponsorsMap(prev => ({ ...prev, [item.id]: merged }));
        if (draft) setPendingChanges(prev => { const n = { ...prev }; delete n[item.id]; return n; });
      });
      const itemIds = items.map(i => i.id);
      setOptimisticSentIds(prev => new Set(Array.from(prev).concat(itemIds)));
      // Espera o resultado de verdade: com mutate() fire-and-forget o modal
      // fechava antes da resposta e, em erro, o usuário perdia o contexto.
      // Sucesso fecha o modal no onSuccess; erro toasta no onError e o modal
      // fica aberto para tentar de novo.
      // A selecao que este .then limpava era a `sponsorBulkSelected`, do
      // segundo sistema de selecao que a aba por patrocinador mantinha em
      // paralelo. Com uma selecao so, quem limpa e o onSuccess da mutation.
      await sendToArteMutation.mutateAsync(itemIds).then(() => {}, () => {});
    } catch (err: any) {
      toast({
        title: "Erro ao enviar",
        description: err?.message || "Tente novamente",
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  };

  // Vincular patrocinador a item individual (aba Por Patrocinador)
  const linkSponsorToItem = (itemId: string, sponsorId: string) => {
    const current = originalSponsorsMap[itemId] || [];
    if (current.includes(sponsorId)) return;
    const newSponsors = [...current, sponsorId];
    // Preserva a isenção "sem aprovação" do item: mandar skipApproval false
    // fixo apagava a flag de itens isentos a cada vínculo individual.
    const skip = pendingChanges[itemId]?.skipApproval ?? items.find(i => i.id === itemId)?.skipApproval ?? false;
    setPendingChanges(prev => ({
      ...prev,
      [itemId]: { sponsorIds: newSponsors, skipApproval: skip, isDirty: true },
    }));
    setItemSponsorsMap(prev => ({ ...prev, [itemId]: newSponsors }));
    saveLinkingMutation.mutate([{ itemId, sponsorIds: newSponsors, skipApproval: skip }]);
  };

  // Desvincular patrocinador de item individual (aba Por Patrocinador)
  const unlinkSponsorFromItem = (itemId: string, sponsorId: string) => {
    const current = originalSponsorsMap[itemId] || [];
    if (!current.includes(sponsorId)) return;
    const newSponsors = current.filter(id => id !== sponsorId);
    // Atualizar estado local imediatamente
    setItemSponsorsMap(prev => ({ ...prev, [itemId]: newSponsors }));
    setOriginalSponsorsMap(prev => ({ ...prev, [itemId]: newSponsors }));
    // Persistir no servidor (sem invalidar /api/items — os mapas já foram
    // atualizados de forma otimista, que é o que a UI lê; invalidar recarregava
    // todos os itens à toa). Sem skipApproval no body: o servidor preserva a
    // flag — `false` fixo apagava a isenção "sem aprovação" do item.
    apiRequest("POST", `/api/items/${itemId}/sponsors/sync`, {
      sponsorIds: newSponsors,
    }).then(() => {
      toast({ title: "Patrocinador desvinculado" });
    }).catch((err: any) => {
      // reverter em caso de erro
      setItemSponsorsMap(prev => ({ ...prev, [itemId]: current }));
      setOriginalSponsorsMap(prev => ({ ...prev, [itemId]: current }));
      toast({ title: "Erro ao desvincular", description: err?.message || "Tente novamente", variant: "destructive" });
    });
  };

  // Carregamento e vazio usavam classes utilitárias e um <h1> simples, num
  // arquivo onde todo o resto é estilo inline com a paleta stone: os dois
  // estados pareciam de outro produto. E o vazio só afirmava que não havia
  // nada, sem dizer por quê nem o que fazer — quem cai aqui fica sem saída.
  if (itemsLoading || eventsLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          <div className="animate-spin" style={{ width: 34, height: 34, borderRadius: R.pill, border: '3px solid #ebe8e4', borderTopColor: '#c2410c' }} />
          <p style={{ fontSize: 13, color: '#57534e', margin: 0 }}>Carregando peças…</p>
        </div>
      </div>
    );
  }

  // Falha de rede tem cara de falha, não de "nada para vincular" — sem isto o
  // erro caía no estado vazio logo abaixo e mentia sobre a causa. Cobre as
  // três queries de que a tela depende: sem eventos ou patrocinadores ela
  // também fica inutilizável (nenhum chip para vincular).
  if (itemsError || eventsError || sponsorsError) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', padding: 24 }}>
        <div style={{ maxWidth: 420, textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: R.lg, backgroundColor: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px' }}>
            <AlertTriangle style={{ width: 28, height: 28, color: '#dc2626' }} />
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: '#1a1c1c', margin: '0 0 8px', letterSpacing: '-0.02em' }}>
            Não foi possível carregar as peças
          </h2>
          <p style={{ fontSize: 13, color: '#57534e', lineHeight: 1.6, margin: '0 0 18px' }}>
            Verifique sua conexão e tente novamente.
          </p>
          <button
            onClick={() => { refetchItems(); refetchEvents(); refetchSponsors(); }}
            style={{ height: 40, padding: '0 20px', backgroundColor: '#c2410c', color: '#fff', fontWeight: 700, fontSize: 13, borderRadius: R.md, border: 'none', cursor: 'pointer' }}
            data-testid="button-retry-items"
          >
            Tentar de novo
          </button>
        </div>
      </div>
    );
  }

  if (visibleItems.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', padding: 24 }}>
        <div style={{ maxWidth: 420, textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: R.lg, backgroundColor: '#f5f5f4', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px' }}>
            <CheckCircle2 style={{ width: 28, height: 28, color: '#a8a29e' }} />
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: '#1a1c1c', margin: '0 0 8px', letterSpacing: '-0.02em' }}>
            Nada para vincular agora
          </h2>
          <p style={{ fontSize: 13, color: '#57534e', lineHeight: 1.6, margin: 0 }}>
            Esta tela mostra apenas peças de eventos que ainda vão acontecer.
            Assim que a Solicitação cadastrar peças em um evento futuro, elas
            aparecem aqui para receber os patrocinadores.
          </p>
        </div>
      </div>
    );
  }


  // Calcular progresso — usa fullyFilteredItems para respeitar todos os filtros ativos
  const totalItems = fullyFilteredItems.length;
  const completedItems = fullyFilteredItems.filter(item => itemUIStates[item.id] === 'ENVIADO').length;


  return (
    <div className="container mx-auto p-4 max-w-6xl pb-24" style={{ height: "100%", overflowY: "auto" }}>

      {/* ── Preview de Referência Visual ── */}
      <Dialog open={!!previewRefUrl} onOpenChange={open => !open && setPreviewRefUrl(null)}>
        <DialogContent className={HIDE_NATIVE_CLOSE} style={modalSurface(560)}>
          <DialogTitle className="sr-only">Referência visual</DialogTitle>
          <DialogDescription className="sr-only">Imagem de referência anexada à peça</DialogDescription>
          <ModalHeader
            variant="confirm"
            icon={Paperclip}
            tint="#1d4ed8"
            title="Referência visual"
            onClose={() => setPreviewRefUrl(null)}
          />
          {previewRefUrl && (
            <div style={{
              backgroundColor: '#f5f5f4', display: 'flex', alignItems: 'center', justifyContent: 'center',
              // ALTURA: cabeçalho 73 + imagem de até 480 + rodapé 43 = 596px. Numa
              // janela de 445 o Radix centrava e cortava 75px em cima e 75 embaixo
              // ao mesmo tempo. O teto de `100vh − 48` agora vem do `modalSurface`;
              // aqui basta a imagem PODER encolher — `flex: 0 1 auto` com o
              // `minHeight: 200` como piso de desenho e o 480 como teto de desenho
              // — e a `<img>` acompanhar o container com `maxHeight: 100%`.
              minHeight: 200, maxHeight: 480, overflow: 'hidden', flex: '0 1 auto',
            }}>
              {refImgFailed ? (
                <p style={{ fontSize: 13, color: '#57534e', margin: 0, padding: '24px', textAlign: 'center' }}>
                  Não foi possível carregar a imagem
                </p>
              ) : (
                <img
                  src={previewRefUrl}
                  alt="Referência visual"
                  style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }}
                  onError={() => setRefImgFailed(true)}
                />
              )}
            </div>
          )}
          {previewRefUrl && (
            <div style={{ padding: '12px 24px', borderTop: '1px solid #ebe8e4', display: 'flex', justifyContent: 'flex-end', flexShrink: 0 }}>
              <a
                href={previewRefUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#1d4ed8', textDecoration: 'none', fontWeight: 700 }}
                data-testid="link-open-ref-new-tab"
              >
                <ExternalLink style={{ width: 13, height: 13 }} />
                Abrir em nova aba
              </a>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Auto-vincular por Cota ── */}
      <Dialog open={autoLinkOpen} onOpenChange={open => { if (autoLinkConfirming) return; if (!open) { setAutoLinkOpen(false); setAutoLinkPreview(null); } }}>
        <DialogContent className={HIDE_NATIVE_CLOSE} style={modalSurface(600)}>
          <DialogTitle className="sr-only">Auto-vincular por cota</DialogTitle>
          <DialogDescription className="sr-only">Vincula patrocinadores conforme as regras de cota do evento</DialogDescription>
          <ModalHeader
            icon={Zap}
            tint="#4f46e5"
            title="Auto-vincular por cota"
            subtitle="Os patrocinadores entram conforme as regras de cota do evento"
            /* Durante a confirmação o modal não pode fechar (o onOpenChange já
               bloqueia; o X precisava acompanhar). */
            onClose={autoLinkConfirming ? undefined : () => { setAutoLinkOpen(false); setAutoLinkPreview(null); }}
          />

          {/* Body — ALTURA: cabeçalho 93 + corpo de até 420 + rodapé 65 = 578px,
              e numa janela de 445 saíam 66px em cima e 66 embaixo ao mesmo tempo.
              O `maxHeight: 420` sozinho nunca evitou isso: ele limita o corpo,
              não o modal. `flex: 0 1 auto` + `minHeight: 0` deixa o corpo
              encolher abaixo dos 420 sob o teto do `modalSurface`; a rolagem que
              já existia aqui finalmente liga, porque agora existe um "não coube". */}
          <div style={{ padding: '20px 24px', minHeight: 160, maxHeight: 420, overflowY: 'auto', flex: '0 1 auto' }}>
            {autoLinkLoading && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, height: 120, color: '#746e69', fontSize: 13 }}>
                <svg className="animate-spin" style={{ width: 20, height: 20, color: '#4f46e5' }} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Carregando pré-visualização...
              </div>
            )}
            {!autoLinkLoading && autoLinkPreview !== null && (
              <>
                {autoLinkPreview.length === 0 && (
                  <div style={{ textAlign: 'center', color: '#746e69', fontSize: 13, padding: '32px 0' }}>
                    Nenhum item elegível para auto-vínculo neste evento.<br />
                    <span style={{ fontSize: 11, marginTop: 6, display: 'block' }}>Verifique se os patrocinadores têm cota definida e se há regras configuradas para este evento.</span>
                  </div>
                )}
                {autoLinkPreview.length > 0 && (
                  <div>
                    {/* Total count */}
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#4f46e5', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
                      {autoLinkPreview.reduce((acc: number, e: any) => acc + e.items.length, 0)} vínculo{autoLinkPreview.reduce((acc: number, e: any) => acc + e.items.length, 0) !== 1 ? 's' : ''} a criar · {autoLinkPreview.length} patrocinador{autoLinkPreview.length !== 1 ? 'es' : ''}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {autoLinkPreview.map((entry: any) => (
                        <div key={entry.sponsorId} style={{ padding: '10px 14px', borderRadius: 8, backgroundColor: '#f0f0ff', border: '1px solid #e0e0ff' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                            <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700, backgroundColor: '#4f46e5', color: '#fff', textTransform: 'uppercase' }}>
                              {entry.quota}
                            </span>
                            <span style={{ fontSize: 13, fontWeight: 700, color: '#1c1917' }}>{entry.sponsorName}</span>
                            <span style={{ marginLeft: 'auto', fontSize: 11, color: '#746e69' }}>{entry.items.length} item{entry.items.length !== 1 ? 's' : ''}</span>
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {entry.items.map((it: any) => (
                              <span key={it.itemId} style={{ padding: '2px 8px', borderRadius: 6, fontSize: 11, backgroundColor: '#fff', border: '1px solid #e0e0ff', color: '#4f46e5' }}>
                                {it.displayId} · {it.type}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div style={{ padding: '14px 24px', borderTop: '1px solid #f0efed', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, flexShrink: 0 }}>
            <p style={{ fontSize: 12, color: '#57534e', lineHeight: 1.45, flex: '1 1 auto', minWidth: 0, marginRight: 12 }}>
              Nada é gravado até você confirmar. Os vínculos entram como rascunho.
            </p>
            <button
              onClick={() => { setAutoLinkOpen(false); setAutoLinkPreview(null); }}
              disabled={autoLinkConfirming}
              style={{ padding: '9px 20px', backgroundColor: '#f5f5f4', color: autoLinkConfirming ? '#a8a29e' : '#1c1917', fontWeight: 600, fontSize: 13, borderRadius: 6, border: 'none', cursor: autoLinkConfirming ? 'not-allowed' : 'pointer' }}
              data-testid="button-auto-link-cancel"
            >
              Cancelar
            </button>
            <button
              disabled={!autoLinkPreview || autoLinkPreview.length === 0 || autoLinkConfirming}
              onClick={async () => {
                if (!autoLinkPreview || autoLinkPreview.length === 0) return;
                setAutoLinkConfirming(true);
                try {
                  const res = await apiRequest('POST', `/api/events/${eventFilter[0]}/auto-link-sponsors`);
                  // Contagem real retornada pela rota — o total do preview
                  // podia divergir do que foi de fato gravado.
                  const { linked } = await res.json();
                  // Sem isto os vínculos novos não apareciam até um reload:
                  // loadedItemIdsRef pulava os itens já vistos e o merge dos
                  // mapas preserva a entrada antiga. Esquecer os itens
                  // afetados força a re-derivação a partir do refetch.
                  const affectedIds = autoLinkPreview.flatMap((e: any) => e.items.map((it: any) => it.itemId));
                  affectedIds.forEach((id: string) => loadedItemIdsRef.current.delete(id));
                  const dropAffected = (prev: Record<string, string[]>) => {
                    const next = { ...prev };
                    affectedIds.forEach((id: string) => { delete next[id]; });
                    return next;
                  };
                  setItemSponsorsMap(dropAffected);
                  setOriginalSponsorsMap(dropAffected);
                  // Rascunhos locais dos afetados também caem: o auto-vínculo
                  // acabou de gravar no servidor, e salvar um rascunho antigo
                  // por cima desfaria os vínculos recém-criados.
                  setPendingChanges(prev => {
                    const next = { ...prev };
                    affectedIds.forEach((id: string) => { delete next[id]; });
                    return next;
                  });
                  queryClient.invalidateQueries({ queryKey: ['/api/items'] });
                  queryClient.invalidateQueries({ queryKey: ['/api/audit-logs'] });
                  setAutoLinkOpen(false);
                  setAutoLinkPreview(null);
                  toast({ title: 'Patrocinadores vinculados!', description: `${linked} vínculo${linked !== 1 ? 's' : ''} criado${linked !== 1 ? 's' : ''} com sucesso.` });
                } catch (e: any) {
                  toast({ variant: 'destructive', title: 'Erro ao vincular', description: e.message });
                } finally {
                  setAutoLinkConfirming(false);
                }
              }}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 20px', backgroundColor: !autoLinkPreview || autoLinkPreview.length === 0 ? '#e7e5e4' : '#4f46e5', color: !autoLinkPreview || autoLinkPreview.length === 0 ? '#746e69' : '#ffffff', fontWeight: 700, fontSize: 13, borderRadius: 6, border: 'none', cursor: !autoLinkPreview || autoLinkPreview.length === 0 ? 'not-allowed' : 'pointer' }}
              data-testid="button-auto-link-confirm"
            >
              <Zap style={{ width: 13, height: 13 }} />
              {autoLinkConfirming
                ? 'Vinculando...'
                : `Confirmar ${autoLinkPreview?.reduce((a: number, e: any) => a + e.items.length, 0) ?? 0} vínculos`}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Page Header ── */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-6">
        <div>
          {/* Breadcrumb */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ display: 'inline-block', padding: '3px 10px', backgroundColor: '#c2410c', color: '#fff', fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', borderRadius: 6 }}>
              Fluxo de Verificação
            </span>
            <span style={{ fontSize: 11, color: '#746e69', fontWeight: 500 }}>•</span>
            <span style={{ fontSize: 11, color: '#746e69', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Vincular Patrocinadores</span>
          </div>
          <h1 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 'clamp(1.5rem, 2.5vw, 1.875rem)', fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.1, color: '#1a1c1c', marginBottom: 6 }}>
            Vincular Patrocinadores
          </h1>
          {/* A legenda era a mesma frase todo dia: "Associe patrocinadores a
              cada item antes do envio à Arte" — a descrição da tela, que quem
              chega aqui já sabe. No lugar dela, o que muda a cada visita: o que
              falta fazer agora. #57534e e não o #746e69 de antes — 4,4:1 não
              passa a régua da casa. */}
          <p data-testid="frase-resolucao" style={{ color: '#57534e', fontSize: 14, fontWeight: 500, lineHeight: 1.5, marginBottom: 10, maxWidth: 560 }}>
            {fraseDeResolucao}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexShrink: 0, flexWrap: 'wrap' }}>
          {/* O title fica no <span> porque botão desabilitado não dispara os
              eventos de mouse — o tooltip que explica POR QUE está desabilitado
              nunca aparecia. */}
          <span title={eventFilter.length !== 1 ? 'Selecione exatamente um evento para usar o auto-vínculo' : 'Vincular patrocinadores automaticamente pela cota'} style={{ display: 'inline-flex' }}>
          <button
            data-testid="button-auto-vincular"
            disabled={eventFilter.length !== 1}
            onClick={async () => {
              if (eventFilter.length !== 1) return;
              setAutoLinkOpen(true);
              setAutoLinkPreview(null);
              setAutoLinkLoading(true);
              try {
                // apiRequest em vez de fetch cru: herda a guarda de servidor
                // desatualizado (HTML no lugar de JSON) e o throw em erro HTTP.
                const res = await apiRequest('GET', `/api/events/${eventFilter[0]}/auto-link-preview`);
                const data = await res.json();
                // Guarda de formato: se o corpo não for a lista esperada, o
                // .reduce() do rodapé derrubava a tela inteira.
                if (!Array.isArray(data)) {
                  throw new Error('Não foi possível carregar a pré-visualização');
                }
                setAutoLinkPreview(data);
              } catch (e: any) {
                setAutoLinkOpen(false);
                toast({ variant: 'destructive', title: 'Erro na pré-visualização', description: e?.message || 'Tente novamente' });
              } finally {
                setAutoLinkLoading(false);
              }
            }}
            /* Secundário e não preenchido: só a ação primária ("Enviar para
               Arte") fica sólida. Dois botões cheios lado a lado disputavam a
               atenção e nada indicava qual era o caminho principal da tela. */
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, height: 44, padding: '0 18px', backgroundColor: '#fff', color: eventFilter.length !== 1 ? '#746e69' : '#4338ca', fontWeight: 700, fontSize: 13, borderRadius: R.md, border: `1px solid ${eventFilter.length !== 1 ? '#e7e5e4' : '#c7d2fe'}`, cursor: eventFilter.length !== 1 ? 'not-allowed' : 'pointer' }}
            onMouseEnter={e => { if (eventFilter.length === 1) e.currentTarget.style.backgroundColor = '#eef2ff'; }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#fff'; }}
          >
            <Zap style={{ width: 14, height: 14 }} />
            Auto-vincular por cota
          </button>
          </span>
          {/* Mesmo motivo do span acima: tooltip precisa funcionar com o
              botão desabilitado. */}
          <span
            title={
              contextStatusCounts.PRONTO === 0
                ? contextStatusCounts.RASCUNHO > 0
                  ? `Há ${contextStatusCounts.RASCUNHO} ${contextStatusCounts.RASCUNHO === 1 ? 'rascunho' : 'rascunhos'} — salve-${contextStatusCounts.RASCUNHO === 1 ? 'o' : 'os'} para deixar os itens prontos`
                  : 'Nenhum item está pronto para envio. Vincule e salve patrocinadores primeiro.'
                : undefined
            }
            style={{ display: 'inline-flex' }}
          >
          <button
            onClick={() => {
              const prontoItems = fullyFilteredItems.filter(i => itemUIStates[i.id] === 'PRONTO');
              if (prontoItems.length === 0) return;
              const pendingByItem: Record<string, Set<string>> = {};
              prontoItems.forEach(i => { pendingByItem[i.id] = new Set(); });
              setSendConfirmModal({ items: prontoItems, pendingByItem });
            }}
            disabled={contextStatusCounts.PRONTO === 0 || sendToArteMutation.isPending}
            data-testid="button-finalizar-lote"
            /* Uma linha e a mesma altura (44) dos outros dois: com duas linhas
               e minWidth 180 este botão ficava bem mais alto que os vizinhos e
               a barra saía desalinhada. A legenda "Conclui sua etapa de
               vinculação" não dizia nada que o rótulo já não dissesse; o que
               falta saber quando está desabilitado — por que não dá para
               enviar — já está no `title`. */
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              height: 44, padding: '0 20px',
              backgroundColor: contextStatusCounts.PRONTO === 0 ? '#f5f5f4' : '#c2410c',
              color: contextStatusCounts.PRONTO === 0 ? '#746e69' : '#ffffff',
              borderRadius: R.md,
              border: 'none',
              fontWeight: 800, fontSize: 13, letterSpacing: '-0.01em',
              cursor: contextStatusCounts.PRONTO === 0 ? 'not-allowed' : 'pointer',
              boxShadow: contextStatusCounts.PRONTO === 0 ? 'none' : '0 2px 8px rgba(194,65,12,0.24)',
            }}
            /* brightness(1.1) clareava o laranja e reduzia o contraste do texto
               branco justamente no momento do apontamento. Escurecer mantém a
               leitura e ainda dá a sensação de "apertar". */
            onMouseEnter={e => { if (contextStatusCounts.PRONTO > 0) e.currentTarget.style.backgroundColor = '#9a3412'; }}
            onMouseLeave={e => { if (contextStatusCounts.PRONTO > 0) e.currentTarget.style.backgroundColor = '#c2410c'; }}
          >
            <Send style={{ width: 14, height: 14, flexShrink: 0 }} />
            {/* A CONTAGEM ENTRA NO RÓTULO. Era um selo separado ao lado dele:
                dois elementos para uma informação só, e o rótulo sozinho não
                dizia o tamanho do que ia acontecer. "Enviar 2 para Arte" é a
                frase inteira — e some quando não há nada a enviar, porque aí o
                que importa é o motivo, que está no title. */}
            {contextStatusCounts.PRONTO > 0 ? `Enviar ${contextStatusCounts.PRONTO} para Arte` : 'Enviar para Arte'}
          </button>
          </span>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          BARRA DE STATUS — o mapa e o recorte, na mesma linha.

          Eram três cartões de ~90px com contagem e legenda, dentro de um
          painel de 20px de respiro. Custavam a altura de duas linhas da
          tabela para dizer três números que ninguém pode CLICAR: para ver só
          as pendentes era preciso descer até o menu de Status, abrir e
          marcar. Agora o número é o próprio filtro.

          A barra segmentada fica: ela responde "quanto falta no total", que
          nenhum chip responde sozinho.
      ══════════════════════════════════════════════════════════════════ */}
      <div style={{
        borderTop: '1px solid #ebe8e4', borderBottom: '1px solid #ebe8e4',
        padding: '12px 0 14px', marginBottom: 20,
        display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
      }}>
        {/* Proporção + total */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <div aria-hidden="true" style={{ width: 132, height: 8, backgroundColor: '#e7e5e4', borderRadius: 999, overflow: 'hidden', display: 'flex' }}>
            {([
              ['PENDENTE', '#78716c'],
              ['RASCUNHO', '#c2410c'],
              ['PRONTO',   '#15803d'],
              ['ENVIADO',  '#1c1917'],
            ] as const)
              .map(([k, cor]) => ({ k, cor, pct: (contagemPorEstado[k] / (totalDoContexto || 1)) * 100 }))
              .filter(seg => seg.pct > 0)
              .map(seg => (
                <div key={seg.k} style={{ width: `${seg.pct}%`, height: '100%', backgroundColor: seg.cor, transition: 'width 0.4s ease' }} />
              ))}
          </div>
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: '#57534e', whiteSpace: 'nowrap' }}>
            {contagemPorEstado.ENVIADO}/{totalDoContexto} enviadas
          </span>
        </div>

        {/* Os quatro estados, clicáveis */}
        <div role="group" aria-label="Filtrar por situação" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {([
            ['PENDENTE', 'Pendente', '#78716c'],
            ['RASCUNHO', 'Rascunho', '#c2410c'],
            ['PRONTO',   'Pronto',   '#15803d'],
            ['ENVIADO',  'Enviado',  '#1c1917'],
          ] as const).map(([estado, rotulo, cor]) => {
            const n = contagemPorEstado[estado];
            const marcado = statusFilter.includes(estado);
            // Situação sem nenhuma peça sai da linha — o clique nela devolveria
            // lista vazia sem dizer por quê. Fica se estiver marcada, senão o
            // chip sumiria com o próprio filtro ligado e não haveria como
            // desligá-lo.
            if (n === 0 && !marcado) return null;
            return (
              <button
                key={estado}
                type="button"
                onClick={() => alternarStatus(estado)}
                aria-pressed={marcado}
                title={marcado ? `Remover o filtro ${rotulo}` : `Ver só ${rotulo.toLowerCase()}`}
                data-testid={`chip-status-${estado.toLowerCase()}`}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                  height: 32, padding: '0 12px', borderRadius: 999,
                  border: marcado ? '1px solid #1c1917' : '1px solid #e7e5e4',
                  backgroundColor: marcado ? '#1c1917' : '#ffffff',
                  color: marcado ? '#ffffff' : '#44403c',
                  cursor: 'pointer', font: 'inherit', fontSize: 13, fontWeight: 600,
                  whiteSpace: 'nowrap', transition: 'background 0.15s, color 0.15s',
                }}
              >
                <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: marcado ? '#ffffff' : cor, flexShrink: 0 }} />
                {rotulo}
                <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, opacity: marcado ? 1 : 0.75 }}>{n}</span>
              </button>
            );
          })}
        </div>

        {/* Salvar rascunhos — a única ação que a barra carrega, e só quando há
            o que salvar. */}
        {contagemPorEstado.RASCUNHO > 0 && (
          <button
            type="button"
            onClick={() => {
              const rascunhoItems = fullyFilteredItems.filter(i => itemUIStates[i.id] === 'RASCUNHO');
              if (rascunhoItems.length === 0) return;
              const payloads = rascunhoItems.map(i => {
                const ch = pendingChanges[i.id];
                return { itemId: i.id, sponsorIds: ch?.sponsorIds ?? [], skipApproval: ch?.skipApproval ?? false };
              });
              setSaveConfirmModal({ payloads, items: rascunhoItems });
            }}
            disabled={saveLinkingMutation.isPending}
            data-testid="button-save-all-drafts"
            style={{
              marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 7,
              height: 32, padding: '0 14px', borderRadius: R.md,
              backgroundColor: '#fff7ed', border: '1px solid #fed7aa', color: '#9a3412',
              cursor: 'pointer', font: 'inherit', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap',
            }}
          >
            <Save style={{ width: 13, height: 13 }} />
            {saveLinkingMutation.isPending
              ? 'Salvando...'
              : `Salvar ${contagemPorEstado.RASCUNHO} rascunho${contagemPorEstado.RASCUNHO !== 1 ? 's' : ''}`}
          </button>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          BARRA DE FILTROS — uma linha.

          Cada filtro vinha com um rótulo MAIÚSCULO em cima ("EVENTO",
          "PATROCINADOR", "PEÇA", "STATUS"): 20px de altura em toda a largura
          da tela para repetir o que o próprio valor do gatilho já diz — e o
          gatilho fechado mostra "Todos os eventos", que nomeia o filtro
          sozinho.
      ══════════════════════════════════════════════════════════════════ */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10,
        marginBottom: 16,
      }}>
        {/* Busca */}
        <div style={{ position: 'relative', flex: '1 1 220px', maxWidth: 320, minWidth: 180 }}>
          <Search aria-hidden="true" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', width: 15, height: 15, color: '#78716c', pointerEvents: 'none' }} />
          <input
            ref={searchInputRef}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Peça, descrição ou evento   /"
            aria-label="Buscar por peça, descrição ou evento"
            data-testid="input-search-events"
            style={{
              width: '100%', height: 36, padding: '0 30px 0 34px',
              borderRadius: R.md, border: '1px solid #e7e5e4', backgroundColor: '#ffffff',
              font: 'inherit', fontSize: 13, color: '#1c1917', outline: 'none',
            }}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => { setSearchQuery(''); searchInputRef.current?.focus(); }}
              aria-label="Limpar a busca"
              style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', width: 24, height: 24, borderRadius: 999, border: 'none', background: 'none', color: '#78716c', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <X style={{ width: 13, height: 13 }} />
            </button>
          )}
        </div>

        {/* Filtros */}
        <EventFilterDropdown values={eventFilter} onValuesChange={setEventFilter} options={eventFilterOptions} />
        <FilterSelect
          showAllLabelWhenEmpty hideWhenEmpty={false}
          label="Patrocinador" allLabel="Todos os patrocinadores"
          values={sponsorFilter} onValuesChange={setSponsorFilter}
          options={sponsorFilterOptions}
          searchPlaceholder="Buscar patrocinador..." emptyText="Nenhum patrocinador encontrado."
          panelWidth={256} testId="select-sponsor-filter"
        />
        <FilterSelect
          label="Peça" allLabel="Todas as peças"
          values={itemFilter} onValuesChange={setItemFilter}
          hideWhenEmpty={false} showAllLabelWhenEmpty
          options={itemFilterOptions}
          testId="select-item-filter"
        />
        {/* O menu de Status SAIU: os quatro chips da barra acima fazem o mesmo
            recorte, com a contagem à vista e um clique em vez de três. Manter
            os dois seria dar dois lugares para o mesmo estado — e eles
            discordariam na primeira vez que alguém mexesse num só. */}

        {/* Agrupamento */}
        <div
          role="radiogroup"
          aria-label="Agrupar a lista por"
          data-testid="segmented-group-by"
          style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}
        >
          <span style={{ fontSize: 12, color: '#57534e', whiteSpace: 'nowrap' }}>Agrupar</span>
          <div style={{ display: 'flex', backgroundColor: '#f3f4f3', padding: 2, borderRadius: R.md }}>
            {([
              ['evento',       'Evento',       Calendar],
              ['patrocinador', 'Patrocinador', Building2],
            ] as const).map(([valor, rotulo, Icone]) => {
              const ativo = agrupamento === valor;
              return (
                <button
                  key={valor}
                  type="button"
                  role="radio"
                  aria-checked={ativo}
                  tabIndex={ativo ? 0 : -1}
                  onClick={() => setAgrupamento(valor)}
                  onKeyDown={e => {
                    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
                    e.preventDefault();
                    setAgrupamento(valor === 'evento' ? 'patrocinador' : 'evento');
                  }}
                  data-testid={`group-by-${valor}`}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    height: 32, padding: '0 12px', borderRadius: 6, border: 'none',
                    backgroundColor: ativo ? '#ffffff' : 'transparent',
                    boxShadow: ativo ? '0 1px 3px rgba(0,0,0,0.10)' : 'none',
                    color: ativo ? '#1c1917' : '#57534e',
                    cursor: 'pointer', font: 'inherit', fontSize: 13, fontWeight: ativo ? 700 : 600,
                    whiteSpace: 'nowrap', transition: 'background 0.15s, color 0.15s',
                  }}
                >
                  <Icone aria-hidden="true" style={{ width: 13, height: 13 }} />
                  {rotulo}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Toolbar de Seleção em Massa — Floating Bottom */}
      {selectedItemIds.size > 0 && (
        <div style={{ position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 640, padding: '0 24px', zIndex: 50 }}>
          <div style={{ backgroundColor: '#1c1917', color: '#ffffff', padding: '14px 20px', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 16px 48px rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 40, height: 40, backgroundColor: '#c2410c', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, fontFamily: 'Space Grotesk, sans-serif', color: '#ffffff', flexShrink: 0 }}>
                {selectedItemIds.size}
              </div>
              {/* Uma frase só. A segunda linha era o rótulo "Ação em lote" —
                  que não informa nada: a barra inteira é a ação em lote, e ela
                  já custava a altura de duas linhas fixa no rodapé da tela. */}
              <p style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.01em', color: '#ffffff', margin: 0 }}>
                {selectedItemIds.size} {selectedItemIds.size === 1 ? 'peça selecionada' : 'peças selecionadas'}
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                onClick={() => setSelectedItemIds(new Set())}
                data-testid="button-clear-selection"
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.04em' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#ffffff')}
                onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.6)')}
              >
                Limpar
              </button>
              {(() => {
                const dirtySelected = Array.from(selectedItemIds).filter(id => (itemUIStates[id] || 'PENDENTE') === 'RASCUNHO');
                if (dirtySelected.length === 0) return null;
                return (
                  <button
                    onClick={() => {
                      const selectedItems = dirtySelected.map(id => visibleItems.find(i => i.id === id)).filter(Boolean);
                      const payloads = dirtySelected.map(id => {
                        const ch = pendingChanges[id];
                        return { itemId: id, sponsorIds: ch?.sponsorIds ?? [], skipApproval: ch?.skipApproval ?? false };
                      });
                      setSaveConfirmModal({ payloads, items: selectedItems });
                    }}
                    disabled={saveLinkingMutation.isPending}
                    data-testid="button-save-selected"
                    style={{ backgroundColor: 'rgba(255,255,255,0.1)', color: '#ffffff', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, padding: '8px 18px', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, opacity: saveLinkingMutation.isPending ? 0.7 : 1 }}
                    onMouseEnter={e => { if (!saveLinkingMutation.isPending) e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.2)'; }}
                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)'; }}
                  >
                    <Save style={{ width: 14, height: 14 }} />
                    {saveLinkingMutation.isPending ? 'Salvando...' : `Salvar ${dirtySelected.length} rascunho${dirtySelected.length !== 1 ? 's' : ''}`}
                  </button>
                );
              })()}
              <button
                onClick={handleOpenBulkApplyDialog}
                data-testid="button-apply-bulk-sponsors"
                style={{ backgroundColor: '#c2410c', color: '#ffffff', border: 'none', borderRadius: 8, padding: '8px 18px', fontWeight: 700, fontSize: 13, textTransform: 'uppercase', letterSpacing: '-0.01em', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#9a3412')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#c2410c')}
              >
                <Users style={{ width: 14, height: 14 }} />
                Aplicar Patrocinadores
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Peça de evento finalizado — encerrado à mão OU já realizado — não entra
          nesta tela (ver `visibleItems`). Esconder em silêncio faria a tela
          dizer "nada a vincular" a quem, na verdade, teve o trabalho retirado.
          Fica fora dos dois modos de visão porque vale para os dois. */}
      {avisoOcultas && (
        <div
          role="status"
          data-testid="aviso-eventos-encerrados"
          style={{ background: '#fafaf9', border: '1px solid #ebe8e4', borderRadius: R.md, padding: '10px 14px', marginBottom: 16, display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: 13, color: '#44403c', lineHeight: 1.5 }}
        >
          <EyeOff aria-hidden="true" style={{ width: 15, height: 15, color: '#78716c', flexShrink: 0, marginTop: 2 }} />
          <span>
            <strong>{avisoOcultas.destaque}</strong>{' '}{avisoOcultas.texto}
          </span>
          {/* SEM botão "Mostrar". As peças escondidas são de evento
              FINALIZADO, e o servidor barra a vinculação delas
              (`barraEventoFinalizado`): revelá-las aqui seria oferecer um
              trabalho que devolve 409. O aviso existe para que a fila vazia
              não seja lida como "nada a fazer" por quem teve o trabalho
              retirado — e isso ele faz sem botão nenhum. */}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          A TABELA — uma só, agrupada por evento ou por patrocinador.

          Eram duas árvores de JSX de ~660 e ~500 linhas, com a mesma
          informação e conjuntos de ação DIFERENTES: a de patrocinador tinha
          Vincular/Desvincular/Enviar que a outra não tinha, tinha a sua
          PRÓPRIA seleção em lote (`sponsorBulkSelected`, um segundo sistema
          paralelo ao `selectedItemIds`) e não tinha salvar nem o menu de
          linha. Trocar de aba mudava o que dava para fazer.

          Agora a linha é uma função só. O que o agrupamento muda é o
          cabeçalho do grupo e o ESCOPO DOS CHIPS — todos os patrocinadores do
          evento, ou só aquele — e nada mais.
      ══════════════════════════════════════════════════════════════════ */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {gruposDaLista.map(grupo => {
          const { chave, event, sponsor, itens, vinculadas, total } = grupo;
          const eventSponsors = getEventSponsors(event.id);
          const chipsDoEscopo = sponsor ? [sponsor] : eventSponsors;
          const pct = total > 0 ? Math.round((vinculadas / total) * 100) : 0;
          const mostrarTodas = showAllRows.has(chave);
          const renderizadas = mostrarTodas ? itens : itens.slice(0, ITEM_RENDER_CAP);
          const selecionaveis = itens.filter(i => {
            const s = itemUIStates[i.id] || 'PENDENTE';
            return s === 'PENDENTE' || s === 'RASCUNHO';
          });
          const marcadas = selecionaveis.filter(i => selectedItemIds.has(i.id)).length;
          // Peças do grupo que ainda não têm ESTE patrocinador — o alvo do
          // "Vincular restantes".
          const faltando = sponsor
            ? itens.filter(i => getItemEditability(i) && !(itemSponsorsMap[i.id] ?? []).includes(sponsor.id))
            : [];
          const corDoPatrocinador = sponsor ? (sponsor.color || '#3b82f6') : '#c2410c';

          return (
            <section key={chave} data-testid={`grupo-${chave}`} style={{ border: '1px solid #e7e5e4', borderRadius: 12, overflow: 'hidden' }}>

              {/* ── Cabeçalho do grupo ── */}
              <header style={{
                background: 'linear-gradient(135deg, #1c1917 0%, #2d2926 100%)',
                padding: isMobile ? '14px 16px' : '16px 20px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                gap: 12, flexWrap: 'wrap',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: '1 1 auto' }}>
                  {/* Ladrilho: calendário no evento, inicial na cor da marca no
                      patrocinador. */}
                  <span aria-hidden="true" style={{
                    width: 38, height: 38, borderRadius: 8, flexShrink: 0,
                    backgroundColor: sponsor ? corDoPatrocinador : 'rgba(255,255,255,0.1)',
                    color: sponsor ? onColor(corDoPatrocinador) : '#fdba74',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 16, fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif",
                  }}>
                    {sponsor ? (sponsor.name || '?')[0].toUpperCase() : <Calendar style={{ width: 18, height: 18 }} />}
                  </span>

                  <div style={{ minWidth: 0 }}>
                    <h2 style={{
                      fontFamily: "'Space Grotesk', sans-serif", color: '#ffffff',
                      fontSize: 17, fontWeight: 700, letterSpacing: '-0.02em', margin: 0,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {sponsor ? sponsor.name : event.name}
                    </h2>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 5, flexWrap: 'wrap' }}>
                      {/* Barra de vinculação. #a8a29e sobre o gradiente escuro
                          dá 6,3 — no claro ele é decorativo, aqui passa. */}
                      <span aria-hidden="true" style={{ width: 84, height: 5, backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 999, overflow: 'hidden', display: 'inline-block', flexShrink: 0 }}>
                        <span style={{ display: 'block', height: '100%', width: `${pct}%`, backgroundColor: pct === 100 ? '#4ade80' : '#fdba74', transition: 'width 0.4s ease' }} />
                      </span>
                      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: pct === 100 ? '#4ade80' : '#a8a29e', whiteSpace: 'nowrap' }}>
                        {vinculadas}/{total} {sponsor ? 'com esta marca' : 'vinculadas'}
                      </span>
                      {!sponsor && event.startDate && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#a8a29e', whiteSpace: 'nowrap' }}>
                          <Truck aria-hidden="true" style={{ width: 12, height: 12 }} />
                          {event.truckDepartureDate
                            ? format(toUTCDisplayDate(event.truckDepartureDate), "dd/MM 'às' HH:mm", { locale: ptBR })
                            : format(parseDateLocal(event.startDate), 'dd/MM/yyyy', { locale: ptBR })}
                        </span>
                      )}
                      {sponsor && (
                        <span style={{ fontSize: 12, color: '#a8a29e', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 240 }}>
                          {event.name}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* A ação do cabeçalho depende do agrupamento — é o único lugar
                    onde ele muda o que dá para fazer, e de propósito: são ações
                    SOBRE O GRUPO, não sobre a peça. */}
                {sponsor ? (
                  <button
                    type="button"
                    onClick={() => vincularRestantes(sponsor.id, faltando)}
                    disabled={faltando.length === 0}
                    title={faltando.length === 0
                      ? `Todas as peças deste evento já têm ${sponsor.name}`
                      : `Vincular ${sponsor.name} às ${faltando.length} peças que ainda não têm — entra como rascunho`}
                    data-testid={`button-link-remaining-${sponsor.id}`}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0,
                      height: isMobile ? 44 : 34, padding: '0 14px', borderRadius: R.sm,
                      backgroundColor: faltando.length === 0 ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.12)',
                      color: faltando.length === 0 ? 'rgba(255,255,255,0.55)' : '#ffffff',
                      border: '1px solid rgba(255,255,255,0.2)',
                      cursor: faltando.length === 0 ? 'not-allowed' : 'pointer',
                      font: 'inherit', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
                    }}
                  >
                    <Plus aria-hidden="true" style={{ width: 13, height: 13 }} />
                    {faltando.length === 0 ? 'Todas vinculadas' : `Vincular restantes (${faltando.length})`}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleOpenSponsorDialog(event)}
                    data-testid={`button-manage-event-sponsors-${event.id}`}
                    title={eventSponsors.length === 0 ? 'Adicionar patrocinadores a este evento' : 'Escolher quem participa deste evento'}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0,
                      height: isMobile ? 44 : 34, padding: '0 14px', borderRadius: R.sm,
                      backgroundColor: 'rgba(255,255,255,0.12)', color: '#ffffff',
                      border: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer',
                      font: 'inherit', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.2)'; }}
                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.12)'; }}
                  >
                    <Building2 aria-hidden="true" style={{ width: 13, height: 13 }} />
                    {eventSponsors.length === 0
                      ? 'Adicionar patrocinadores'
                      : `${eventSponsors.length} ${eventSponsors.length === 1 ? 'patrocinador' : 'patrocinadores'}`}
                  </button>
                )}
              </header>

              {/* ── A tabela ── */}
              <div style={{ backgroundColor: '#ffffff' }}>
                <div className="overflow-x-auto scrollbar-visible">
                  <table style={{ width: '100%', borderCollapse: 'collapse', ...(isMobile ? { display: 'block', padding: 12 } : {}) }}>
                    <thead style={{ display: isMobile ? 'none' : 'table-header-group' }}>
                      <tr style={{ backgroundColor: '#fafaf9', borderBottom: '1px solid #e7e5e4' }}>
                        <th style={{ ...THC, width: 46, textAlign: 'center', padding: '9px 0' }}>
                          <Checkbox
                            /* "indeterminate" em seleção parcial: sem isto o
                               checkbox aparecia vazio mesmo com metade das
                               linhas marcadas. */
                            checked={selecionaveis.length === 0 ? false : marcadas === selecionaveis.length ? true : marcadas > 0 ? 'indeterminate' : false}
                            onCheckedChange={() => toggleAllItemsInEvent(selecionaveis)}
                            disabled={selecionaveis.length === 0}
                            aria-label={`Selecionar todas as peças de ${sponsor ? sponsor.name : event.name}`}
                            data-testid={`checkbox-select-all-${chave}`}
                          />
                        </th>
                        <th style={THC}>Peça</th>
                        <th style={{ ...THC, whiteSpace: 'nowrap' }}>Qtd · m²</th>
                        <th style={THC}>{sponsor ? 'Vínculo' : 'Patrocinadores'}</th>
                        <th style={{ ...THC, textAlign: 'right', paddingRight: 16 }}>Status</th>
                      </tr>
                    </thead>
                    <tbody style={{ display: isMobile ? 'block' : 'table-row-group' }}>
                      {renderizadas.map((item, idx) => {
                        const anterior = idx > 0 ? renderizadas[idx - 1] : null;
                        const abreTipo = !anterior || anterior.type !== item.type;
                        const chaveTipo = `${chave}:${item.type}`;
                        const tipoFechado = tiposColapsados.has(chaveTipo);
                        const linhas: React.ReactNode[] = [];

                        if (abreTipo) {
                          const doTipo = itens.filter(i => i.type === item.type);
                          const semPatrocinador = doTipo.filter(i => {
                            const s = itemUIStates[i.id] || 'PENDENTE';
                            return s === 'PENDENTE';
                          }).length;
                          const enviadas = doTipo.filter(i => (itemUIStates[i.id] || 'PENDENTE') === 'ENVIADO').length;
                          const tudoEnviado = enviadas === doTipo.length;
                          const tudoVinculado = semPatrocinador === 0;
                          const corDoLote = tudoEnviado ? '#1c1917' : tudoVinculado ? '#15803d' : '#c2410c';
                          const textoDoLote = tudoEnviado ? 'tudo enviado'
                            : tudoVinculado ? 'tudo vinculado'
                            : `${semPatrocinador} sem patrocinador`;

                          linhas.push(
                            /* CABEÇALHO DE TIPO, colapsável.
                               O agrupador de GRUPO PAI (a faixa #dbeafe com
                               "PLACA KM") saiu: dentro de um evento já
                               agrupado, um segundo nível de agrupador é um
                               nível a mais do que a informação pede.

                               KEY PELA IDENTIDADE, NÃO PELO CONTEÚDO. A key
                               trazia `item.type` — o campo que o usuário
                               RENOMEIA. Renomear mudava a key, e mudar a key
                               não é re-render: é desmontar a linha e montar
                               outra. Esta linha carrega um Checkbox do Radix,
                               que compõe refs; a remontagem forçada realimenta
                               o ciclo e derrubava a tela com "Maximum update
                               depth exceeded". */
                            <tr key={`tipo-${item.id}`} style={{ borderLeft: `3px solid ${corDoLote}`, ...(isMobile ? { display: 'block', marginBottom: 8 } : {}) }}>
                              <td colSpan={5} style={{ padding: 0, backgroundColor: '#fafaf9', borderBottom: '1px solid #f0efee', ...(isMobile ? { display: 'block' } : {}) }}>
                                <button
                                  type="button"
                                  onClick={() => setTiposColapsados(prev => {
                                    const n = new Set(prev);
                                    if (n.has(chaveTipo)) n.delete(chaveTipo); else n.add(chaveTipo);
                                    return n;
                                  })}
                                  aria-expanded={!tipoFechado}
                                  data-testid={`toggle-tipo-${chaveTipo}`}
                                  style={{
                                    width: '100%', minHeight: 34, padding: '6px 16px',
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', textAlign: 'left',
                                  }}
                                >
                                  <ChevronDown aria-hidden="true" style={{ width: 13, height: 13, color: '#57534e', flexShrink: 0, transform: tipoFechado ? 'rotate(-90deg)' : 'none', transition: 'transform 0.15s' }} />
                                  <span style={{ fontSize: 11, fontWeight: 800, color: '#44403c', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {item.type}
                                  </span>
                                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: '#57534e', flexShrink: 0 }}>
                                    {doTipo.length}
                                  </span>
                                  <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 600, color: corDoLote, whiteSpace: 'nowrap', flexShrink: 0 }}>
                                    {textoDoLote}
                                  </span>
                                </button>
                              </td>
                            </tr>,
                          );
                        }

                        if (!tipoFechado) linhas.push(renderLinhaDaPeca(item, chipsDoEscopo, eventSponsors));
                        return linhas;
                      })}
                    </tbody>
                  </table>
                </div>

                {itens.length > ITEM_RENDER_CAP && (
                  <button
                    type="button"
                    onClick={() => setShowAllRows(prev => {
                      const n = new Set(prev);
                      if (mostrarTodas) n.delete(chave); else n.add(chave);
                      return n;
                    })}
                    data-testid={`button-show-all-${chave}`}
                    style={{ width: '100%', minHeight: 38, background: '#fafaf9', border: 'none', borderTop: '1px solid #e7e5e4', color: '#c2410c', font: 'inherit', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                  >
                    {mostrarTodas ? 'Mostrar menos' : `Mostrar todas as ${itens.length} peças (+${itens.length - ITEM_RENDER_CAP})`}
                  </button>
                )}
              </div>
            </section>
          );
        })}

        {/* Filtros zeraram tudo: sem isto a área principal ficava em branco
            absoluto, sem explicação e sem saída. */}
        {gruposDaLista.length === 0 && (
          <div style={{ backgroundColor: '#fff', border: '1px dashed #d6d3d1', borderRadius: 12, padding: '40px 24px', textAlign: 'center' }}>
            <Search aria-hidden="true" style={{ width: 26, height: 26, color: '#78716c', margin: '0 auto 12px', display: 'block' }} />
            <p style={{ fontSize: 14, fontWeight: 700, color: '#1c1917', margin: '0 0 4px' }}>
              {temFiltroAtivo ? 'Nenhuma peça com os filtros atuais' : agrupamento === 'patrocinador' ? 'Nenhum evento com patrocinadores' : 'Nada a vincular'}
            </p>
            <p style={{ fontSize: 13, color: '#57534e', margin: '0 0 16px', maxWidth: 400, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.5 }}>
              {temFiltroAtivo
                ? 'Ajuste a busca ou os filtros acima para ver as peças.'
                : agrupamento === 'patrocinador'
                  ? 'Use "Patrocinadores do evento" para definir quem participa de cada evento — depois eles aparecem agrupados aqui.'
                  : 'Toda peça em fila já foi vinculada e enviada à Arte.'}
            </p>
            {temFiltroAtivo && (
              <button
                type="button"
                onClick={() => { setSearchQuery(''); setEventFilter([]); setSponsorFilter([]); setItemFilter([]); setStatusFilter([]); }}
                data-testid="button-clear-filters"
                style={{ height: 36, padding: '0 16px', backgroundColor: '#f5f5f4', color: '#1c1917', font: 'inherit', fontWeight: 700, fontSize: 13, borderRadius: R.md, border: '1px solid #e7e5e4', cursor: 'pointer' }}
              >
                Limpar filtros
              </button>
            )}
          </div>
        )}
      </div>


      {/* Dialog — Gerenciar Patrocinadores do Evento */}
      <Dialog open={sponsorDialogOpen} onOpenChange={(open) => { setSponsorDialogOpen(open); if (!open) setSponsorModalSearch(''); }}>
        <DialogContent className={HIDE_NATIVE_CLOSE} style={modalSurface(600)}>
          {/* POR QUE congelar aqui: o onSuccess remove /api/events do cache,
              faz refetch forçado, invalida /api/sponsors e /api/audit-logs,
              fecha e toasta. O refetch derruba `selectedEventForSponsors`
              (subtítulo do cabeçalho) e recalcula a lista inteira de linhas
              enquanto o modal ainda está montado saindo — cada uma dessas
              rodadas mandava desanexa+reanexa de ref para a subárvore em
              desmontagem, que é o laço do React #185. Mecanismo por extenso em
              components/modal-shell.tsx. */}
          <FreezeWhileClosing open={sponsorDialogOpen}>
          <DialogTitle className="sr-only">Patrocinadores do evento</DialogTitle>
          <DialogDescription className="sr-only">Escolha quais patrocinadores participam deste evento</DialogDescription>
          <ModalHeader
            icon={Building2}
            tint="#c2410c"
            title="Patrocinadores do evento"
            subtitle={selectedEventForSponsors?.name}
            onClose={() => { setSponsorDialogOpen(false); setSponsorModalSearch(''); }}
            trailing={selectedSponsorIds.length > 0 ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', padding: '4px 11px', borderRadius: R.pill, backgroundColor: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.18)', fontSize: 13, fontWeight: 700, color: '#fff', flexShrink: 0, whiteSpace: 'nowrap' }}>
                {selectedSponsorIds.length} selecionado{selectedSponsorIds.length !== 1 ? 's' : ''}
              </span>
            ) : undefined}
          />

          <div style={{ padding: '16px 24px 0', flexShrink: 0 }}>
            {/* Barra de busca */}
            <div style={{ position: 'relative' }}>
              <Search style={{ width: 13, height: 13, color: '#a8a29e', position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
              <input
                type="text"
                value={sponsorModalSearch}
                onChange={e => setSponsorModalSearch(e.target.value)}
                placeholder="Buscar patrocinador..."
                aria-label="Buscar patrocinador"
                style={{ width: '100%', height: 36, paddingLeft: 32, paddingRight: 36, borderRadius: 8, border: '1px solid #e7e5e4', backgroundColor: '#fafaf9', color: '#1c1917', fontSize: 13, boxSizing: 'border-box' }}
              />
              {sponsorModalSearch && (
                <button aria-label="Limpar busca" title="Limpar busca" onClick={() => setSponsorModalSearch('')} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0, color: '#746e69' }}>
                  <X style={{ width: 13, height: 13 }} />
                </button>
              )}
            </div>

            {/* Ações rápidas */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
              {selectedSponsorIds.length > 0 ? (
                <button onClick={() => setSelectedSponsorIds([])} style={{ fontSize: 11, fontWeight: 600, color: '#746e69', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  Limpar seleção
                </button>
              ) : (
                <button onClick={() => setSelectedSponsorIds(sponsors.map((s: any) => s.id))} style={{ fontSize: 11, fontWeight: 600, color: '#c2410c', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  Selecionar todos
                </button>
              )}
            </div>
          </div>

          {/* Lista — ALTURA: cabeçalho 93 + busca 52 + lista 340 + rodapé 65 =
              550px; numa janela de 445 sumiam 52px em cima e 52 embaixo. Os 340
              limitavam a lista, nunca o modal. Com `flex: 0 1 auto` + `minHeight:
              0` a lista encolhe abaixo dos 340 sob o teto do `modalSurface` e a
              rolagem que já existia passa a ligar. */}
          <div style={{ maxHeight: 340, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 6, flex: '0 1 auto', minHeight: 0 }}>
            {(() => {
              const term = sponsorModalSearch.toLowerCase();
              const filtered = (sponsors as any[]).filter((s: any) =>
                s.name.toLowerCase().includes(term) || (s.company || '').toLowerCase().includes(term)
              );
              const selected = filtered.filter((s: any) => selectedSponsorIds.includes(s.id)).sort((a: any, b: any) => a.name.localeCompare(b.name));
              const unselected = filtered.filter((s: any) => !selectedSponsorIds.includes(s.id)).sort((a: any, b: any) => a.name.localeCompare(b.name));
              const sorted = [...selected, ...unselected];

              if (sorted.length === 0) {
                return (
                  <div style={{ textAlign: 'center', padding: '40px 0', color: '#57534e', fontSize: 13 }}>
                    <Search style={{ width: 22, height: 22, color: '#d4d0ca', margin: '0 auto 10px', display: 'block' }} />
                    {sponsorModalSearch
                      ? <>Nenhum patrocinador com “{sponsorModalSearch}”</>
                      : 'Nenhum patrocinador cadastrado'}
                  </div>
                );
              }

              return (
                <>
                  {selected.length > 0 && unselected.length > 0 && (
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#746e69', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '2px 4px 4px' }}>
                      Selecionados ({selected.length})
                    </div>
                  )}
                  {sorted.map((sponsor: any, idx: number) => {
                    const isSelected = selectedSponsorIds.includes(sponsor.id);
                    const showDivider = selected.length > 0 && unselected.length > 0 && idx === selected.length;
                    const toggleSponsor = () => {
                      if (isSelected) {
                        setSelectedSponsorIds(selectedSponsorIds.filter(id => id !== sponsor.id));
                      } else {
                        setSelectedSponsorIds([...selectedSponsorIds, sponsor.id]);
                      }
                    };
                    return (
                      <div key={sponsor.id}>
                        {showDivider && (
                          <div style={{ fontSize: 11, fontWeight: 700, color: '#746e69', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '8px 4px 4px' }}>
                            Disponíveis ({unselected.length})
                          </div>
                        )}
                        {/* role/aria-checked/tabIndex/teclas: era um <div>
                            só-mouse — leitor de tela não anunciava o estado e
                            teclado não alcançava a linha. */}
                        <div
                          role="checkbox"
                          aria-checked={isSelected}
                          tabIndex={0}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '11px 14px',
                            backgroundColor: isSelected ? '#fff7ed' : '#fafaf9',
                            border: isSelected ? '1.5px solid #fdba74' : '1.5px solid #f0efee',
                            borderRadius: 8, cursor: 'pointer',
                            transition: 'all 0.12s',
                          }}
                          onClick={toggleSponsor}
                          onKeyDown={e => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              toggleSponsor();
                            }
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: sponsor.color || '#3b82f6', flexShrink: 0 }} />
                            <span style={{ fontSize: 13, fontWeight: isSelected ? 700 : 500, color: isSelected ? '#92400e' : '#1c1917' }}>
                              {sponsor.name}
                            </span>
                            {sponsor.company && (
                              <span style={{ fontSize: 11, fontWeight: 400, color: '#746e69' }}>({sponsor.company})</span>
                            )}
                          </div>
                          {isSelected ? (
                            <div style={{ width: 18, height: 18, borderRadius: '50%', backgroundColor: '#c2410c', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <Check style={{ width: 11, height: 11, color: '#ffffff' }} />
                            </div>
                          ) : (
                            <div style={{ width: 18, height: 18, borderRadius: '50%', border: '1.5px solid #d6d3d1', flexShrink: 0 }} />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </>
              );
            })()}
          </div>

          {/* Footer */}
          <div style={{ flexShrink: 0, padding: '14px 20px', borderTop: '1px solid #f0efee', backgroundColor: '#fafaf9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                <span style={{ fontSize: 12, color: '#57534e', lineHeight: 1.45 }}>
                  <strong style={{ fontWeight: 700, color: '#1c1917' }}>{selectedSponsorIds.length} de {sponsors.length} ativos.</strong>{' '}
                  Só estes aparecem como opção nas peças.
                </span>
              </div>
              <div style={{ height: 4, borderRadius: 999, backgroundColor: '#e7e5e4', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${sponsors.length > 0 ? (selectedSponsorIds.length / sponsors.length) * 100 : 0}%`, backgroundColor: '#c2410c', borderRadius: 999, transition: 'width 0.2s' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <button
                onClick={() => { setSponsorDialogOpen(false); setSponsorModalSearch(''); }}
                disabled={manageEventSponsorsMutation.isPending}
                style={{ height: 36, padding: '0 14px', background: '#ffffff', border: '1px solid #e7e5e4', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#44403c', cursor: 'pointer' }}
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveEventSponsors}
                disabled={manageEventSponsorsMutation.isPending}
                data-testid="button-save-event-sponsors"
                style={{ height: 36, padding: '0 16px', backgroundColor: '#c2410c', color: '#ffffff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
              >
                {manageEventSponsorsMutation.isPending ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
          </FreezeWhileClosing>
        </DialogContent>
      </Dialog>

      {/* Dialog — Aplicar Patrocinadores em Lote */}
      <Dialog open={bulkApplyDialogOpen} onOpenChange={(o) => { setBulkApplyDialogOpen(o); if (!o) setBulkSponsorSearch(''); }}>
        <DialogContent className={HIDE_NATIVE_CLOSE} style={modalSurface(560)}>
          <DialogTitle className="sr-only">Aplicar patrocinadores em lote</DialogTitle>
          <DialogDescription className="sr-only">Aplica os patrocinadores escolhidos a todas as peças selecionadas</DialogDescription>
          <ModalHeader
            icon={Users}
            tint="#c2410c"
            title="Aplicar em lote"
            subtitle={`${selectedItemIds.size} ${selectedItemIds.size === 1 ? 'peça selecionada' : 'peças selecionadas'}`}
            onClose={() => { setBulkApplyDialogOpen(false); setBulkSponsorSearch(''); }}
          />

          <div style={{ padding: '0 24px', flexShrink: 0 }}>
            {/* Banner informativo sobre isentos */}
            {(() => {
              const exemptCount = Array.from(selectedItemIds).filter(id => {
                const it = items.find(i => i.id === id);
                return it?.skipApproval === true;
              }).length;
              if (exemptCount === 0 || bulkSkipApproval) return null;
              return (
                <div style={{ marginTop: 16, padding: '10px 14px', backgroundColor: '#fff7ed', borderRadius: R.md, display: 'flex', gap: 10, alignItems: 'flex-start', border: '1px solid #fed7aa' }}>
                  <Info style={{ width: 14, height: 14, color: '#c2410c', flexShrink: 0, marginTop: 1 }} />
                  <p style={{ fontSize: 11, lineHeight: 1.5, color: '#7c2d12', fontWeight: 500, margin: 0 }}>
                    {exemptCount} item{exemptCount !== 1 ? 's' : ''} isento{exemptCount !== 1 ? 's' : ''} de contrato não receberá{exemptCount !== 1 ? 'ão' : ''} as marcas selecionadas.
                  </p>
                </div>
              );
            })()}
          </div>

          {/* Campo de busca */}
          <div style={{ padding: '16px 24px 0', flexShrink: 0 }}>
            <div style={{ position: 'relative', marginBottom: 12 }}>
              <Search style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, color: '#a8a29e', pointerEvents: 'none' }} />
              <input
                type="text"
                placeholder="Buscar patrocinador..."
                aria-label="Buscar patrocinador"
                value={bulkSponsorSearch}
                onChange={e => setBulkSponsorSearch(e.target.value)}
                style={{ width: '100%', paddingLeft: 32, paddingRight: 12, paddingTop: 8, paddingBottom: 8, borderRadius: 8, border: '1.5px solid #e7e5e4', fontSize: 13, color: '#1a1c1c', backgroundColor: '#ffffff', boxSizing: 'border-box' }}
                onFocus={e => (e.currentTarget.style.borderColor = '#f97316')}
                onBlur={e => (e.currentTarget.style.borderColor = '#e7e5e4')}
              />
            </div>
          </div>

          {/* ALTURA: cabeçalho 93 + tarja de isentos ~60 + busca 64 + lista 328 +
              rodapé 65 = 610px com a tarja (550 sem ela). Em 445 de altura
              cortava 82px de cada lado. Mesma correção da lista de cima: o
              `maxHeight: 300` é teto de DESENHO, e `flex: 0 1 auto` +
              `minHeight: 0` é o que deixa a lista encolher abaixo dele quando o
              teto do `modalSurface` aperta. */}
          <div style={{ padding: '12px 24px 16px', maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, flex: '0 1 auto', minHeight: 0 }}>
            {/* Opção: Sem Patrocinador — aparece primeiro */}
            {!bulkSponsorSearch && (
            <div
              role="checkbox"
              aria-checked={bulkSkipApproval}
              tabIndex={0}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 14px',
                backgroundColor: '#ffffff',
                border: bulkSkipApproval ? '2px solid #f97316' : '2px dashed #dadad9',
                borderRadius: 8, cursor: 'pointer',
                opacity: bulkSkipApproval ? 1 : 0.65,
                transition: 'all 0.15s',
              }}
              data-testid="bulk-option-sem-patrocinador"
              onClick={toggleBulkSkip}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  toggleBulkSkip();
                }
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <X style={{ width: 15, height: 15, color: '#625d5b', flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: '#1a1c1c' }}>Sem Patrocinador</span>
              </div>
              {bulkSkipApproval ? (
                <CheckCircle2 style={{ width: 17, height: 17, color: '#c2410c', flexShrink: 0 }} />
              ) : (
                <div style={{ width: 17, height: 17, borderRadius: '50%', border: '1.5px solid #dadad9', flexShrink: 0 }} />
              )}
            </div>
            )}

            {/* Lista de patrocinadores — filtrada, ordenada A-Z, selecionados primeiro */}
            {(() => {
              // Só patrocinadores dos eventos das peças selecionadas: oferecer
              // o cadastro inteiro permitia gravar um vínculo de fora do
              // evento — ficava no banco, mas a coluna "Vínculos Ativos"
              // (que só lista patrocinadores do evento) nunca o exibia.
              const selectedEventIds = Array.from(new Set(
                (visibleItems as any[]).filter(i => selectedItemIds.has(i.id)).map(i => i.eventId)
              ));
              const base = (eventFilter.length === 1
                ? getEventSponsors(eventFilter[0])
                : selectedEventIds
                    .flatMap(id => getEventSponsors(id))
                    .filter((s: any, idx: number, arr: any[]) => arr.findIndex((x: any) => x.id === s.id) === idx)) as any[];
              const q = bulkSponsorSearch.toLowerCase().trim();
              const filtered = q ? base.filter((s: any) => s.name.toLowerCase().includes(q) || (s.company || '').toLowerCase().includes(q)) : base;
              const sorted = [...filtered].sort((a: any, b: any) => {
                const aSelected = bulkSelectedSponsors.includes(a.id);
                const bSelected = bulkSelectedSponsors.includes(b.id);
                if (aSelected !== bSelected) return aSelected ? -1 : 1;
                return a.name.localeCompare(b.name, 'pt-BR');
              });
              if (sorted.length === 0) return (
                <p style={{ fontSize: 13, textAlign: 'center', padding: '36px 0', color: '#57534e', margin: 0 }}>
                  <Search style={{ width: 22, height: 22, color: '#d4d0ca', margin: '0 auto 10px', display: 'block' }} />
                  {q ? `Nenhum patrocinador com “${bulkSponsorSearch}”` : 'Nenhum patrocinador cadastrado para este evento'}
                </p>
              );
              const selectedOnes = sorted.filter((s: any) => bulkSelectedSponsors.includes(s.id));
              const unselectedOnes = sorted.filter((s: any) => !bulkSelectedSponsors.includes(s.id));
              const renderSponsor = (sponsor: any) => {
                const isSelected = bulkSelectedSponsors.includes(sponsor.id);
                const toggleBulkSponsor = () => {
                  if (isSelected) {
                    setBulkSelectedSponsors(bulkSelectedSponsors.filter(id => id !== sponsor.id));
                  } else {
                    setBulkSkipApproval(false);
                    setBulkSelectedSponsors([...bulkSelectedSponsors, sponsor.id]);
                  }
                };
                return (
                  <div
                    key={sponsor.id}
                    role="checkbox"
                    aria-checked={isSelected}
                    tabIndex={0}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '11px 14px',
                      backgroundColor: isSelected ? '#fff7ed' : '#ffffff',
                      border: isSelected ? '2px solid #f97316' : '1px solid #eeeeed',
                      borderRadius: 8, cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                    aria-label={`Selecionar patrocinador ${sponsor.name}`}
                    data-testid={`checkbox-bulk-sponsor-${sponsor.id}`}
                    onClick={toggleBulkSponsor}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggleBulkSponsor();
                      }
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 11, height: 11, borderRadius: '50%', backgroundColor: sponsor.color || '#a8a29e', flexShrink: 0, boxShadow: isSelected ? `0 0 0 2px rgba(249,115,22,0.2)` : 'none' }} />
                      <span style={{ fontSize: 13, fontWeight: isSelected ? 700 : 600, color: isSelected ? '#1a1c1c' : '#44403c' }}>
                        {sponsor.name}
                        {sponsor.company && (
                          <span style={{ marginLeft: 6, fontWeight: 400, color: '#746e69', fontSize: 13 }}> {sponsor.company}</span>
                        )}
                      </span>
                    </div>
                    {isSelected ? (
                      <CheckCircle2 style={{ width: 17, height: 17, color: '#c2410c', flexShrink: 0 }} />
                    ) : (
                      <div style={{ width: 17, height: 17, borderRadius: '50%', border: '1.5px solid #dadad9', flexShrink: 0 }} />
                    )}
                  </div>
                );
              };
              return (
                <>
                  {selectedOnes.length > 0 && (
                    <>
                      {selectedOnes.map(renderSponsor)}
                      {unselectedOnes.length > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                          <div style={{ flex: 1, height: 1, backgroundColor: '#eeeeed' }} />
                          <span style={{ fontSize: 11, color: '#746e69', fontWeight: 600, letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>outros</span>
                          <div style={{ flex: 1, height: 1, backgroundColor: '#eeeeed' }} />
                        </div>
                      )}
                    </>
                  )}
                  {unselectedOnes.map(renderSponsor)}
                </>
              );
            })()}
          </div>

          <div style={{ flexShrink: 0, padding: '14px 24px', borderTop: '1px solid #eeeeed', backgroundColor: '#f3f4f3', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, borderRadius: '0 0 12px 12px' }}>
            {/* SOMA, NÃO SUBSTITUI. Sem esta frase não há como saber se aplicar
                dois patrocinadores a vinte peças APAGA o que cada uma já tinha
                — e, na dúvida, a saída segura é não usar o lote, aplicando um a
                um vinte vezes. A variante do "sem patrocinador" diz o contrário
                de propósito: essa opção REMOVE os vínculos, e é a única aqui
                que descarta trabalho. */}
            <p style={{ fontSize: 12, color: '#57534e', lineHeight: 1.45, flex: '1 1 auto', minWidth: 0, marginRight: 12 }}>
              {(() => {
                const pecas = `${selectedItemIds.size} ${selectedItemIds.size === 1 ? 'peça' : 'peças'}`;
                if (bulkSkipApproval) {
                  return `${pecas} ${selectedItemIds.size === 1 ? 'passa' : 'passam'} a não exigir patrocinador — os vínculos que ${selectedItemIds.size === 1 ? 'ela tiver é removido' : 'elas tiverem são removidos'}.`;
                }
                const n = bulkSelectedSponsors.length;
                if (n === 0) return `Escolha os patrocinadores que entram nas ${pecas} selecionadas.`;
                return `${n} ${n === 1 ? 'patrocinador entra' : 'patrocinadores entram'} nas ${pecas} selecionadas, somando aos vínculos que já existem.`;
              })()}
            </p>
            <button
              onClick={() => setBulkApplyDialogOpen(false)}
              style={{ padding: '9px 20px', background: '#ffffff', border: '1.5px solid #d6d3d1', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#44403c', cursor: 'pointer' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#f5f5f4')}
              onMouseLeave={e => (e.currentTarget.style.background = '#ffffff')}
            >
              Cancelar
            </button>
            {/* Desabilitado sem seleção (com o motivo no title) em vez de
                deixar clicar e responder com toast destrutivo. */}
            <button
              onClick={handleApplyBulkSponsors}
              disabled={bulkSelectedSponsors.length === 0 && !bulkSkipApproval}
              title={bulkSelectedSponsors.length === 0 && !bulkSkipApproval ? "Selecione pelo menos um patrocinador ou marque 'Sem Patrocinador'" : undefined}
              data-testid="button-confirm-bulk-apply"
              style={{
                padding: '9px 20px',
                backgroundColor: (bulkSelectedSponsors.length === 0 && !bulkSkipApproval) ? '#e7e5e4' : '#c2410c',
                color: (bulkSelectedSponsors.length === 0 && !bulkSkipApproval) ? '#746e69' : '#ffffff',
                border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700,
                cursor: (bulkSelectedSponsors.length === 0 && !bulkSkipApproval) ? 'not-allowed' : 'pointer',
                boxShadow: (bulkSelectedSponsors.length === 0 && !bulkSkipApproval) ? 'none' : '0 2px 8px rgba(194,65,12,0.3)',
              }}
              onMouseEnter={e => { if (!(bulkSelectedSponsors.length === 0 && !bulkSkipApproval)) e.currentTarget.style.backgroundColor = '#9a3412'; }}
              onMouseLeave={e => { if (!(bulkSelectedSponsors.length === 0 && !bulkSkipApproval)) e.currentTarget.style.backgroundColor = '#c2410c'; }}
            >
              Aplicar em Lote
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog de Detalhes do Item */}
      <ItemDetailsDialog
        item={selectedItemForDetails}
        auditLogs={auditLogs}
        open={!!selectedItemForDetails}
        onOpenChange={(open) => !open && setSelectedItemForDetails(null)}
      />

      {/* ===== Modal de Confirmação de Envio ===== */}
      <Dialog open={!!sendConfirmModal} onOpenChange={(open) => { if (!open && !isSending) setSendConfirmModal(null); }}>
        <DialogContent className={HIDE_NATIVE_CLOSE} style={modalSurface(680)}>
          {/* POR QUE congelar aqui: o onSuccess do envio invalida /api/items,
              /api/audit-logs e /api/notifications, esvazia `selectedItemIds`,
              limpa os otimistas, fecha e toasta — no mesmo commit. O corpo
              inteiro (a lista de peças e o contador do botão) vem de
              `sendConfirmModal`, que acabou de virar null: sem congelar o
              modal se esvazia durante toda a animação de saída, com três
              invalidações renderizando a página por cima. */}
          <FreezeWhileClosing open={!!sendConfirmModal}>
          <DialogTitle className="sr-only">Confirmar Envio para Arte</DialogTitle>
          <DialogDescription className="sr-only">Revise os itens e os patrocinadores antes de enviar para a Arte</DialogDescription>

          {/* ── Hero Header ── */}
          <div style={{ background: 'linear-gradient(135deg, #1c1917 0%, #292524 100%)', padding: '28px 32px 24px', position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
            {/* decorative circle */}
            <div style={{ position: 'absolute', top: -40, right: -40, width: 180, height: 180, borderRadius: '50%', background: 'rgba(249,115,22,0.08)', pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', bottom: -30, right: 40, width: 100, height: 100, borderRadius: '50%', background: 'rgba(249,115,22,0.05)', pointerEvents: 'none' }} />

            {/* O X nativo do Dialog (escuro) sumia sobre o hero escuro —
                HIDE_NATIVE_CLOSE + um botão claro visível no próprio hero. */}
            <button
              onClick={() => setSendConfirmModal(null)}
              disabled={isSending}
              aria-label="Fechar"
              data-testid="button-close-send-modal"
              style={{ position: 'absolute', top: 14, right: 14, width: 30, height: 30, borderRadius: R.sm, backgroundColor: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: isSending ? 'not-allowed' : 'pointer', opacity: isSending ? 0.5 : 1, zIndex: 1 }}
              onMouseEnter={e => { if (!isSending) e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.16)'; }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)'; }}
            >
              <X style={{ width: 14, height: 14 }} />
            </button>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 18, position: 'relative' }}>
              {/* Icon badge */}
              <div style={{ width: 52, height: 52, borderRadius: 12, background: 'linear-gradient(135deg, #c2410c, #9a3412)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 4px 16px rgba(249,115,22,0.4)' }}>
                <Send style={{ width: 22, height: 22, color: '#ffffff' }} />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.6)', marginBottom: 4 }}>
                  Envio para a equipe de Arte
                </p>
                <h2 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', color: '#ffffff', margin: 0, lineHeight: 1.1 }}>
                  Enviar para Arte
                </h2>
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', marginTop: 6, lineHeight: 1.4 }}>
                  Os itens serão encaminhados à equipe de Arte para aprovação e finalização.
                </p>
              </div>
              {/* Count pill. marginRight abre espaço para o X do canto
                  (top:14/right:14/30px) — sem isso os dois se sobrepunham. */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 18px', background: 'rgba(249,115,22,0.15)', border: '1px solid rgba(249,115,22,0.3)', borderRadius: 12, flexShrink: 0, marginRight: 30 }}>
                <span style={{ fontSize: 26, fontWeight: 700, color: '#fb923c', fontFamily: 'Space Grotesk, sans-serif', lineHeight: 1 }}>
                  {sendConfirmModal?.items.length ?? 0}
                </span>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2 }}>
                  {(sendConfirmModal?.items.length ?? 0) === 1 ? 'item' : 'itens'}
                </span>
              </div>
            </div>

            {/* Stats row */}
            {sendConfirmModal && (() => {
              const withSponsors = sendConfirmModal.items.filter(item => {
                const confirmed = originalSponsorsMap[item.id] || [];
                const newOnes = Array.from(sendConfirmModal.pendingByItem[item.id] || []);
                return [...confirmed, ...newOnes].length > 0;
              }).length;
              const withoutSponsors = sendConfirmModal.items.length - withSponsors;
              return (
                <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                  <div style={{ flex: 1, padding: '9px 14px', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <CheckCircle2 style={{ width: 14, height: 14, color: '#4ade80', flexShrink: 0 }} />
                    <div>
                      <p style={{ fontSize: 15, fontWeight: 700, color: '#4ade80', lineHeight: 1, fontFamily: 'Space Grotesk, sans-serif' }}>{withSponsors}</p>
                      <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>com patrocinador</p>
                    </div>
                  </div>
                  {withoutSponsors > 0 && (
                    <div style={{ flex: 1, padding: '9px 14px', background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <AlertTriangle style={{ width: 14, height: 14, color: '#fbbf24', flexShrink: 0 }} />
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontSize: 15, fontWeight: 700, color: '#fbbf24', lineHeight: 1, fontFamily: 'Space Grotesk, sans-serif' }}>{withoutSponsors}</p>
                        {/* rgba(255,255,255,0.6) sobre este fundo escuro dá 6,2 —
                            julgado contra o fundo certo, passa. */}
                        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>sem patrocinador</p>
                      </div>
                      {/* VER SÓ ESSAS. O aviso dizia "3 sem patrocinador" e
                          deixava a conferência por conta de quem rolasse: numa
                          lista de trinta, as três em âmbar ficam espalhadas.
                          Enviar sem marca é decisão legítima — mas tem de ser
                          uma decisão, e para isso precisa ser vista. */}
                      <button
                        type="button"
                        onClick={() => setSoSemPatrocinador(v => !v)}
                        aria-pressed={soSemPatrocinador}
                        data-testid="button-so-sem-patrocinador"
                        style={{
                          marginLeft: 'auto', flexShrink: 0,
                          height: isMobile ? 44 : 30, padding: '0 12px', borderRadius: R.sm,
                          backgroundColor: soSemPatrocinador ? '#fbbf24' : 'rgba(255,255,255,0.1)',
                          color: soSemPatrocinador ? '#1c1917' : '#ffffff',
                          border: '1px solid rgba(251,191,36,0.4)', cursor: 'pointer',
                          font: 'inherit', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
                        }}
                      >
                        {soSemPatrocinador ? 'Ver todas' : 'Ver só essas'}
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          {/* ── Lista de itens ──
              ALTURA: hero de ~150 + lista de até 360 + rodapé 77 = 587px. Em 445
              de altura cortava 71px de cada lado — sumiam o título do hero e o
              botão "Enviar" juntos. O `maxHeight: 360` da ScrollArea limita a
              lista, nunca o modal; `flex: 0 1 auto` + `minHeight: 0` deixa a
              ScrollArea encolher abaixo dos 360 sob o teto do `modalSurface`. */}
          <ScrollArea style={{ maxHeight: 360, flex: '0 1 auto', minHeight: 0 }}>
            <div style={{ padding: '20px 32px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(sendConfirmModal?.items ?? [])
                // O recorte não muda o que vai ser enviado — só o que está à
                // vista. O rodapé continua contando a lista inteira.
                .filter(item => {
                  if (!soSemPatrocinador) return true;
                  const confirmed = originalSponsorsMap[item.id] || [];
                  const newOnes = Array.from(sendConfirmModal?.pendingByItem[item.id] || []);
                  return [...confirmed, ...newOnes].length === 0;
                })
                .map((item, idx) => {
                const confirmed = (originalSponsorsMap[item.id] || []);
                const newOnes = Array.from(sendConfirmModal?.pendingByItem[item.id] || []);
                const allLinkedIds = Array.from(new Set([...confirmed, ...newOnes]));
                const linkedSponsors = allLinkedIds
                  .map(sid => (sponsors as any[]).find((s: any) => s.id === sid))
                  .filter(Boolean);
                const eventName = (events as any[]).find(e => e.id === item.eventId)?.name;
                const hasSponsor = linkedSponsors.length > 0;

                return (
                  <div key={item.id} style={{
                    padding: '14px 16px',
                    borderRadius: 12,
                    border: `1px solid ${hasSponsor ? '#e7e5e4' : '#fde68a'}`,
                    backgroundColor: hasSponsor ? '#ffffff' : '#fffbeb',
                    display: 'flex',
                    gap: 12,
                    alignItems: 'flex-start',
                    transition: 'box-shadow 0.15s',
                  }}>
                    {/* Index number */}
                    <div style={{ width: 26, height: 26, borderRadius: 6, background: hasSponsor ? '#f4f4f3' : '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: hasSponsor ? '#746e69' : '#92400e' }}>{idx + 1}</span>
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* Top row */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, fontWeight: 700, color: '#c2410c', flexShrink: 0, background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 6, padding: '1px 6px' }}>
                          {item.displayId}
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#1a1c1c', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                          {item.type}
                        </span>
                        {eventName && (
                          <span style={{ fontSize: 11, color: '#746e69', whiteSpace: 'nowrap', flexShrink: 0, background: '#f4f4f3', borderRadius: 6, padding: '2px 7px' }}>
                            {eventName}
                          </span>
                        )}
                      </div>

                      {/* Description */}
                      {item.description && (
                        <p style={{ fontSize: 11, color: '#746e69', marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.description}
                        </p>
                      )}

                      {/* Sponsors or warning */}
                      {hasSponsor ? (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                          {linkedSponsors.map((sp: any) => {
                            const isNew = newOnes.includes(sp.id);
                            return (
                              <span key={sp.id} style={{
                                display: 'inline-flex', alignItems: 'center', gap: 5,
                                padding: '3px 9px', borderRadius: 999,
                                backgroundColor: isNew ? 'rgba(249,115,22,0.08)' : '#f4f4f3',
                                border: `1px solid ${isNew ? 'rgba(249,115,22,0.35)' : '#e7e5e4'}`,
                                fontSize: 11, fontWeight: 600, color: '#44403c',
                              }}>
                                <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: isNew ? '#f97316' : '#a8a29e', flexShrink: 0 }} />
                                {sp.name}
                                {isNew && <span style={{ fontSize: 11, color: '#c2410c', fontWeight: 700, letterSpacing: '0.04em' }}>+NOVO</span>}
                              </span>
                            );
                          })}
                        </div>
                      ) : (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999, backgroundColor: '#fef3c7', border: '1px solid #fde68a' }}>
                          <AlertTriangle style={{ width: 10, height: 10, color: '#d97706', flexShrink: 0 }} />
                          <span style={{ fontSize: 11, color: '#92400e', fontWeight: 600 }}>Sem patrocinadores vinculados</span>
                        </div>
                      )}
                    </div>

                    {/* Check/warn icon */}
                    <div style={{ flexShrink: 0, marginTop: 2 }}>
                      {hasSponsor
                        ? <CheckCircle2 style={{ width: 16, height: 16, color: '#22c55e' }} />
                        : <AlertTriangle style={{ width: 16, height: 16, color: '#f59e0b' }} />
                      }
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>

          {/* ── Footer ── */}
          <div style={{ flexShrink: 0, padding: '18px 32px', borderTop: '1px solid #eeeeed', backgroundColor: '#fafaf9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            {/* A consequência é a saída daqui, não só a chegada lá: a peça
                deixa esta tela e não volta a aparecer nela. */}
            <p style={{ fontSize: 12, color: '#57534e', lineHeight: 1.45, maxWidth: 320 }}>
              As peças saem desta tela e entram na fila da Arte.
            </p>
            <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
              <button
                onClick={() => setSendConfirmModal(null)}
                disabled={!!isSending}
                style={{ padding: '11px 22px', background: '#ffffff', border: '1.5px solid #d6d3d1', borderRadius: 12, fontSize: 13, fontWeight: 600, color: '#44403c', cursor: isSending ? 'not-allowed' : 'pointer', transition: 'background 0.15s', opacity: isSending ? 0.5 : 1 }}
                onMouseEnter={e => { if (!isSending) e.currentTarget.style.background = '#f5f5f4'; }}
                onMouseLeave={e => { e.currentTarget.style.background = '#ffffff'; }}
              >
                Cancelar
              </button>
              <button
                onClick={handleModalConfirmSend}
                disabled={isSending || sendToArteMutation.isPending}
                style={{
                  padding: '11px 26px',
                  background: (isSending || sendToArteMutation.isPending) ? '#f5f5f4' : 'linear-gradient(135deg, #c2410c, #9a3412)',
                  color: (isSending || sendToArteMutation.isPending) ? '#57534e' : '#ffffff',
                  border: 'none', borderRadius: R.md,
                  fontSize: 15, fontWeight: 700, cursor: (isSending || sendToArteMutation.isPending) ? 'wait' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: 9,
                  boxShadow: (isSending || sendToArteMutation.isPending) ? 'none' : '0 4px 12px rgba(194,65,12,0.30)',
                  letterSpacing: '-0.01em', fontFamily: 'Space Grotesk, sans-serif',
                  transition: 'background 0.15s, box-shadow 0.15s',
                }}
                /* Escurece em vez de clarear: brightness(1.08) sobre o laranja
                   reduzia o contraste do rótulo branco justo ao apontar. */
                onMouseEnter={e => { if (!(isSending || sendToArteMutation.isPending)) e.currentTarget.style.background = 'linear-gradient(135deg, #9a3412, #7c2d12)'; }}
                onMouseLeave={e => { if (!(isSending || sendToArteMutation.isPending)) e.currentTarget.style.background = 'linear-gradient(135deg, #c2410c, #9a3412)'; }}
              >
                <Send style={{ width: 15, height: 15 }} />
                {(isSending || sendToArteMutation.isPending)
                  ? 'Enviando...'
                  : `Confirmar Envio${sendConfirmModal && sendConfirmModal.items.length > 0 ? ` (${sendConfirmModal.items.length})` : ''}`}
              </button>
            </div>
          </div>
          </FreezeWhileClosing>
        </DialogContent>
      </Dialog>

      {/* ── MODAL DE CONFIRMAÇÃO DE SALVAMENTO ── */}
      <Dialog open={!!saveConfirmModal} onOpenChange={open => { if (!open && !saveLinkingMutation.isPending) setSaveConfirmModal(null); }}>
        <DialogContent className={HIDE_NATIVE_CLOSE} style={modalSurface(480)}>
          <DialogTitle className="sr-only">Confirmar salvamento</DialogTitle>
          <ModalHeader
            variant="confirm"
            icon={Save}
            tint="#c2410c"
            title="Confirmar salvamento"
            subtitle={saveConfirmModal?.items.length === 1
              ? 'O item abaixo terá sua vinculação salva.'
              : `${saveConfirmModal?.items.length} itens terão suas vinculações salvas.`}
            onClose={saveLinkingMutation.isPending ? undefined : () => setSaveConfirmModal(null)}
          />
          <DialogDescription className="sr-only">Revise os itens antes de salvar a vinculação</DialogDescription>
          {/* ALTURA: cabeçalho 80 + lista 300 + 32 de padding + rodapé 121 =
              533px. Em 445 cortava 44px de cada lado — o botão "Salvar" saía
              junto com o título. `flex: 0 1 auto` + `minHeight: 0` deixa a lista
              encolher abaixo dos 300 sob o teto do `modalSurface`. */}
          <div style={{ maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, padding: '16px 24px', flex: '0 1 auto', minHeight: 0 }}>
            {saveConfirmModal?.items.map((item: any) => {
              const ch = saveConfirmModal.payloads.find(p => p.itemId === item.id);
              const sponsorNames = (ch?.sponsorIds ?? []).map((sid: string) => {
                const sp = (sponsors as any[]).find((s: any) => s.id === sid);
                return sp?.name ?? sid;
              });
              return (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', backgroundColor: '#f9f8f7', borderRadius: 8, border: '1px solid #e7e5e4' }}>
                  <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: '#c2410c', minWidth: 52 }}>{item.displayId}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: '#1a1c1c', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.type}</p>
                    {ch?.skipApproval ? (
                      <p style={{ fontSize: 11, color: '#7c3aed', margin: 0, fontWeight: 600 }}>Sem aprovação de patrocinador</p>
                    ) : sponsorNames.length > 0 ? (
                      <p style={{ fontSize: 11, color: '#625d5b', margin: 0 }}>{sponsorNames.join(', ')}</p>
                    ) : (
                      <p style={{ fontSize: 11, color: '#746e69', margin: 0 }}>Sem patrocinador</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <ModalFooter>
            <button
              onClick={() => {
                if (!saveConfirmModal) return;
                saveLinkingMutation.mutate(saveConfirmModal.payloads, {
                  onSuccess: () => setSaveConfirmModal(null),
                  onError: () => setSaveConfirmModal(null),
                });
              }}
              disabled={saveLinkingMutation.isPending}
              data-testid="button-confirm-save"
              style={{ width: '100%', height: 44, borderRadius: R.md, border: 'none', backgroundColor: '#c2410c', color: '#fff', fontSize: 13, fontWeight: 800, cursor: saveLinkingMutation.isPending ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: saveLinkingMutation.isPending ? 0.7 : 1 }}
            >
              <Save style={{ width: 15, height: 15 }} />
              {saveLinkingMutation.isPending ? 'Salvando…' : 'Confirmar salvamento'}
            </button>
            <button
              onClick={() => setSaveConfirmModal(null)}
              disabled={saveLinkingMutation.isPending}
              style={{ width: '100%', height: 36, borderRadius: R.md, border: 'none', background: 'none', fontSize: 13, fontWeight: 600, color: '#746e69', cursor: 'pointer' }}
            >Cancelar</button>
          </ModalFooter>
        </DialogContent>
      </Dialog>

      {/* ── MODAL DE CONFIRMAÇÃO: DEVOLVER PARA CRIAÇÃO ── */}
      <Dialog open={!!returnModal} onOpenChange={open => { if (!open && !returnToCreationMutation.isPending) setReturnModal(null); }}>
        <DialogContent className={HIDE_NATIVE_CLOSE} style={modalSurface(440)}>
          {/* POR QUE congelar aqui: o onSuccess da devolução invalida três
              chaves, apaga o item de quatro mapas locais, fecha e toasta no
              mesmo commit — e é `returnModal` que escreve o ID e o tipo da
              peça na caixa de destaque. Sem congelar, a caixa some no primeiro
              frame do fade. */}
          <FreezeWhileClosing open={!!returnModal}>
          <DialogTitle className="sr-only">Devolver para Criação</DialogTitle>
          <ModalHeader
            variant="confirm"
            icon={RotateCcw}
            tint="#c2410c"
            title="Devolver para Criação"
            onClose={returnToCreationMutation.isPending ? undefined : () => setReturnModal(null)}
          />
          {/* ALTURA: cabeçalho 72 + este corpo 136 + rodapé 121 = 329px. Com o
              respiro de 48 isso cabe até numa janela de 377, então este modal
              NÃO cortava em nenhuma das alturas conferidas. A rolagem aqui é
              preventiva e obrigatória: o `modalSurface` agora traz teto com
              `overflow: hidden`, e sem um scrollport o texto seria recortado em
              silêncio se algum dia crescer. */}
          <div style={{ padding: '20px 24px', overflowY: 'auto', flex: '1 1 auto', minHeight: 0 }}>
            <DialogDescription style={{ fontSize: 13, color: '#57534e', lineHeight: 1.6, margin: 0 }}>
              A peça voltará para a equipe de Solicitação. Os patrocinadores vinculados serão
              removidos e o item precisará passar pelo fluxo novamente.
            </DialogDescription>
            {returnModal && (
              <div style={{ marginTop: 14, padding: '10px 14px', backgroundColor: '#fff7ed', borderRadius: R.md, border: '1px solid #fed7aa', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: '#c2410c' }}>{returnModal.displayId}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#1a1c1c' }}>{returnModal.type}</span>
              </div>
            )}
          </div>
          <ModalFooter>
            <button
              onClick={() => returnModal && returnToCreationMutation.mutate(returnModal.id)}
              disabled={returnToCreationMutation.isPending}
              data-testid="button-confirm-return"
              style={{ width: '100%', height: 44, borderRadius: R.md, border: 'none', backgroundColor: '#b91c1c', color: '#fff', fontSize: 13, fontWeight: 800, cursor: returnToCreationMutation.isPending ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: returnToCreationMutation.isPending ? 0.7 : 1 }}
            >
              <RotateCcw style={{ width: 15, height: 15 }} />
              {returnToCreationMutation.isPending ? 'Devolvendo…' : 'Confirmar devolução'}
            </button>
            <button
              onClick={() => setReturnModal(null)}
              disabled={returnToCreationMutation.isPending}
              style={{ width: '100%', height: 36, borderRadius: R.md, border: 'none', background: 'none', fontSize: 13, fontWeight: 600, color: '#746e69', cursor: 'pointer' }}
            >Cancelar</button>
          </ModalFooter>
          </FreezeWhileClosing>
        </DialogContent>
      </Dialog>
    </div>
  );
}
