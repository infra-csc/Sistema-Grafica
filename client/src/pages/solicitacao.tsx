import { useQuery, useMutation } from "@tanstack/react-query";
import { CheckCircle, AlertCircle, Copy, Eye, Search, X, FileImage, Maximize2, Trash2, Paperclip, Recycle, Check, Clock, ChevronLeft, ChevronRight, ChevronDown, MoreHorizontal, RotateCcw, Truck } from "lucide-react";
import { FilterSelect } from "@/components/filter-select";
import { EventFilterDropdown } from "@/components/event-filter-dropdown";
import { FilePreview, isWebUrl } from "@/components/file-preview";
import { parseDateLocal, normalizarBusca } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useState, useMemo, useEffect, Fragment, useRef } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/contexts/auth-context";
import {
  STATUS, getStatusMeta,
  seloPecaEventoFinalizado, motivoAcaoBloqueada, todayBusinessMs,
} from "@/lib/status";
import type { SeloPecaEventoFinalizado } from "@/lib/status";
import { ModalHeader, modalSurface, HIDE_NATIVE_CLOSE, FreezeWhileClosing } from "@/components/modal-shell";
import { AumentarQuantidadeDialog, parseApiError } from "@/components/aumentar-quantidade-dialog";

// Tons de texto desta paleta valem para superfícies CLARAS (bg/surface).
// Sobre os painéis escuros (#0c0a09/#1c1917) use #a8a29e ou mais claro —
// #746e69 e #57534e reprovam WCAG AA nesses fundos.
const TI = {
  bg: "#fafaf9", surface: "#ffffff", border: "#e7e5e4",
  text: "#1c1917", secondary: "#746e69", muted: "#a8a29e",
  accent: "#f97316", dark: "#0c0a09",
};

// Status que esta tela revisa. O vocabulário canônico (rótulo/cores) vive em
// lib/status: "awaiting_final_review" → "Aguardando Revisão Final".
const REVIEW_STATUS = "awaiting_final_review";

// Config do HISTÓRICO: ações de log que correspondem a status do vocabulário
// herdam rótulo e cor de lib/status; o mapa abaixo cobre apenas os tipos de
// log que NÃO são status. Vive fora do componente para não ser recriado a
// cada render.
// `dot` (tom saturado 500) é só da bolinha; `text` (tom escuro 700, AA sobre
// fundo claro) é o que vai no rótulo — mesma disciplina do StatusMeta.
const NON_STATUS_LOG_CFG: Record<string, { label: string; dot: string; text: string }> = {
  updated:          { label: "Atualizado",            dot: "#f97316", text: "#c2410c" },
  rejected:         { label: "Reprovado",             dot: "#ef4444", text: "#b91c1c" },
  submitted:        { label: "Enviado",               dot: "#0e7490", text: "#0e7490" },
  linked:           { label: "Vinculado",             dot: "#0f766e", text: "#0f766e" },
  released:         { label: "Liberado",              dot: "#3b82f6", text: "#1d4ed8" },
  status_changed:   { label: "Status alterado",       dot: "#f97316", text: "#c2410c" },
  sponsor_approved: { label: "Patrocinador aprovado", dot: "#10b981", text: "#047857" },
  sponsor_rejected: { label: "Patrocinador reprovou", dot: "#ef4444", text: "#b91c1c" },
  file_uploaded:    { label: "Arquivo enviado",       dot: "#7e22ce", text: "#7e22ce" },
  thumb_uploaded:   { label: "Thumb enviado",         dot: "#7e22ce", text: "#7e22ce" },
};

function getLogCfg(log: any): { label: string; dot: string; text: string } {
  const action = log?.action as string | undefined;
  if (action && STATUS[action]) {
    const m = getStatusMeta(action);
    return { label: m.label, dot: m.dot, text: m.text };
  }
  if (action && NON_STATUS_LOG_CFG[action]) return NON_STATUS_LOG_CFG[action];
  return { label: action?.replace(/_/g, " ") ?? log?.details ?? "Ação", dot: "#a8a29e", text: "#746e69" };
}

// ── O recorte na URL ────────────────────────────────────────────────────────
// Esta era a ÚNICA tela com filtros do app que não persistia nada: o recorte
// "evento X + banner" era remontado a cada F5, não sobrevivia a abrir uma peça
// e voltar, e não dava para mandar para um colega. Pior, `urlSetorDaPeca`
// (components/prazos/tokens.ts) já mandava gente para cá com `?busca=<ID>` a
// partir do drill da Gestão de Prazos — o link existia e caía numa tela que
// ignorava o parâmetro, entregando a fila inteira em vez da peça pedida.
//
// Nomes em pt-BR e IGUAIS aos das outras telas (`busca`, `evento`, `tipo`):
// a URL é compartilhada entre colegas, e o mesmo recorte não pode ter um nome
// em cada tela. Só o que está fora do padrão entra — estado limpo, URL limpa.
interface FiltrosRevisao { busca: string; eventos: string[]; tipos: string[] }

const FILTROS_REVISAO_VAZIOS: FiltrosRevisao = { busca: "", eventos: [], tipos: [] };

function filtrosRevisaoDaURL(search: string): FiltrosRevisao {
  const p = new URLSearchParams(search);
  const lista = (k: string) => (p.get(k) ?? "").split(",").filter(Boolean);
  return { busca: p.get("busca") ?? "", eventos: lista("evento"), tipos: lista("tipo") };
}

/**
 * Parte da query ATUAL e sobrescreve só as três chaves gerenciadas — o
 * `?item=` do deep link de peça (e qualquer param alheio) sobrevive, em vez de
 * ser apagado pelo primeiro espelhamento do recorte. Mesma disciplina de
 * `filtrosParaQuery` na Gráfica.
 */
function filtrosRevisaoParaQuery(searchAtual: string, f: FiltrosRevisao): string {
  const p = new URLSearchParams(searchAtual);
  const por = (k: string, v: string) => (v ? p.set(k, v) : p.delete(k));
  por("busca", f.busca);
  por("evento", f.eventos.join(","));
  por("tipo", f.tipos.join(","));
  return p.toString();
}

export default function Solicitacao() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [selectedItem, setSelectedItem] = useState<any>(null);
  // As duas facetas novas da barra de filtros.
  const [soSemArquivo, setSoSemArquivo] = useState(false);
  const [soEventoFinalizado, setSoEventoFinalizado] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [returnObservations, setReturnObservations] = useState("");
  // PARA ONDE a peça volta — escolha de quem devolve (regra do dono, 17/08).
  // "finalizacao" é o padrão porque é o caso comum e o menos destrutivo:
  // preservar a aprovação do patrocinador não custa nada se a arte for refeita
  // depois, mas jogar fora uma aprovação que valia obriga a pedir tudo de novo.
  const [destinoDevolucao, setDestinoDevolucao] = useState<"finalizacao" | "arte">("finalizacao");
  const [editingQuantity, setEditingQuantity] = useState(false);
  const [quantityValue, setQuantityValue] = useState<number>(1);
  // Complemento: peça-mãe e a diferença sugerida pelo servidor quando o
  // aumento foi barrado por já estar em produção (409 USE_COMPLEMENT).
  const [complementItem, setComplementItem] = useState<any>(null);
  const [complementSugestao, setComplementSugestao] = useState<number | null>(null);
  const quantityInputRef = useRef<HTMLInputElement>(null);
  const [releaseConfirmOpen, setReleaseConfirmOpen] = useState(false);
  // Campo de observação do card: precisa existir por conta própria, sem
  // depender de "Liberar" ou "Devolver" — a pessoa pode querer deixar um
  // recado (cor, acabamento, posição) sem estar pronta para tomar nenhuma das
  // duas decisões ainda.
  const [cardObservations, setCardObservations] = useState("");
  const [bulkReleaseConfirmOpen, setBulkReleaseConfirmOpen] = useState(false);
  const [bulkReturnConfirmOpen, setBulkReturnConfirmOpen] = useState(false);
  const [bulkReturnObservations, setBulkReturnObservations] = useState("");
  const [returnConfirmOpen, setReturnConfirmOpen] = useState(false);
  const [deleteConfirmItemId, setDeleteConfirmItemId] = useState<string | null>(null);

  // Estado inicial vindo da URL — ver o bloco de comentário acima do componente.
  const urlInicial = useMemo(() => filtrosRevisaoDaURL(window.location.search), []);
  const [searchTerm, setSearchTerm] = useState(urlInicial.busca);
  const [eventFilter, setEventFilter] = useState<string[]>(urlInicial.eventos);
  const [itemTypeFilter, setItemTypeFilter] = useState<string[]>(urlInicial.tipos);
  const searchRef = useRef<HTMLInputElement>(null);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const isMobile = useIsMobile();
  /* PARA ONDE A PEÇA VOLTA — as duas opções lado a lado, com a consequência
     escrita em cada uma. Não é um <select>: são duas escolhas e a diferença
     entre elas custa caro (uma joga fora a aprovação do patrocinador), então
     as duas ficam à vista sem precisar abrir nada.
     A opção destrutiva NÃO é a padrão e avisa o que perde. */
  const seletorDestino = (
    <div style={{ marginBottom: 12 }}>
      <p style={{ margin: "0 0 6px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#57534e" }}>
        O que a Arte precisa refazer?
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {([
          { valor: "finalizacao" as const, titulo: "Só o arquivo final",
            desc: "A arte está certa — a peça volta para a Finalização e a aprovação do patrocinador continua valendo." },
          { valor: "arte" as const, titulo: "A arte inteira",
            desc: "Volta para o começo da Arte. O thumb aprovado é descartado e o patrocinador terá de aprovar de novo." },
        ]).map(op => {
          const ativo = destinoDevolucao === op.valor;
          return (
            <button
              key={op.valor}
              type="button"
              onClick={() => setDestinoDevolucao(op.valor)}
              aria-pressed={ativo}
              data-testid={`destino-${op.valor}`}
              style={{
                textAlign: "left", cursor: "pointer", borderRadius: 8, padding: "9px 11px",
                border: `1.5px solid ${ativo ? "#c2410c" : "#e7e5e4"}`,
                background: ativo ? "#fff7ed" : "#ffffff",
                display: "flex", gap: 9, alignItems: "flex-start", font: "inherit",
              }}
            >
              <span aria-hidden="true" style={{
                width: 14, height: 14, borderRadius: "50%", flexShrink: 0, marginTop: 2,
                border: `1.5px solid ${ativo ? "#c2410c" : "#d6d3d1"}`,
                background: ativo ? "#c2410c" : "transparent",
                boxShadow: ativo ? "inset 0 0 0 2.5px #ffffff" : "none",
              }} />
              <span style={{ minWidth: 0 }}>
                {/* #c2410c sobre #fff7ed = 4,88:1 ✓ · #57534e sobre branco = 7,03:1 ✓ */}
                <span style={{ display: "block", fontSize: 13, fontWeight: 700, color: ativo ? "#c2410c" : "#1c1917" }}>
                  {op.titulo}
                </span>
                <span style={{ display: "block", fontSize: 11, color: "#57534e", lineHeight: 1.4, marginTop: 1 }}>
                  {op.desc}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );

  /** Altura dos controles: 44 no toque, 36 no ponteiro. */
  const alturaControle = isMobile ? 44 : 36;
  // A tela ja exigia motivo NAO VAZIO; o servidor agora exige 10 caracteres em
  // TODAS as portas de devolucao (lerMotivoDevolucao, routes/items.ts). Uma
  // regua so, nos dois lados: senao o botao habilita e a requisicao volta 400.
  const MOTIVO_MIN = 10;
  // A mesma barra invertida que faltava no servidor. Aqui ela não corrompia
  // texto, só a CONTA: um motivo cheio de "s" era medido como mais curto do
  // que é, e o botão de enviar ficava desabilitado sem explicar por quê.
  const motivoCurto = (t: string) => t.trim().replace(/\s+/g, " ").length < MOTIVO_MIN;
  const avisoMotivoCurto = `Explique o motivo em pelo menos ${MOTIVO_MIN} caracteres — a Arte precisa saber o que corrigir.`;
  const { data: items = [], isLoading: itemsLoading, isError: itemsError, refetch: refetchItems } = useQuery<any[]>({ queryKey: ["/api/items"] });
  const { data: events = [], isLoading: eventsLoading, isError: eventsError, refetch: refetchEvents } = useQuery<any[]>({ queryKey: ["/api/events"] });
  // Histórico da peça: só busca com o modal aberto, já filtrado e limitado no
  // servidor. A chave em duas partes ("/api/audit-logs" + querystring) mantém
  // o prefixo casando com as invalidateQueries(["/api/audit-logs"]) das
  // mutations (o queryFn junta as partes com "/").
  const { data: itemAuditLogs = [] } = useQuery<any[]>({
    queryKey: ["/api/audit-logs", `?entityId=${selectedItem?.id}&limit=8`],
    enabled: modalOpen && !!selectedItem?.id,
  });
  const { data: standardItems = [] } = useQuery<any[]>({ queryKey: ['/api/standard-items'] });
  const typeToGroup = useMemo(() => {
    const map: Record<string, string> = {};
    (standardItems as any[]).forEach((s: any) => { if (s.group) map[s.name] = s.group; });
    return map;
  }, [standardItems]);

  const updateQuantityMutation = useMutation({
    // apiRequest devolve o Response cru — sem o json() o "updatedItem" era o
    // Response e updatedItem.quantity saía sempre undefined.
    mutationFn: async ({ itemId, quantity }: { itemId: string; quantity: number }) => {
      const res = await apiRequest("PATCH", `/api/items/${itemId}`, { quantity });
      return await res.json();
    },
    onSuccess: (updatedItem: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      setSelectedItem((prev: any) => prev ? { ...prev, quantity: updatedItem.quantity ?? quantityValue } : prev);
      setEditingQuantity(false);
      toast({ title: "Quantidade atualizada", description: `Nova quantidade: ${updatedItem.quantity ?? quantityValue}x` });
    },
    // Rede de segurança do modelo de COMPLEMENTO. Esta tela só lista peças em
    // "Aguardando Revisão Final" — ou seja, pré-produção, onde editar a
    // quantidade continua sendo o gesto certo. Mas a peça pode ter sido
    // liberada e produzida em outra aba enquanto o modal estava aberto: aí o
    // servidor recusa o aumento (409 USE_COMPLEMENT) e a resposta honesta é
    // abrir o fluxo do complemento, já com a diferença que ELE calculou — não
    // despejar um JSON vermelho na tela. QUANTITY_FLOOR é o mesmo raciocínio
    // para a redução abaixo do que já existe fisicamente.
    onError: (error: any) => {
      const { message, code, data } = parseApiError(error);

      if (code === "USE_COMPLEMENT") {
        const alvo = (items as any[]).find((i: any) => i.id === (data?.itemId ?? selectedItem?.id)) ?? selectedItem;
        setEditingQuantity(false);
        toast({
          title: "Peça em produção",
          description: 'Use "Aumentar quantidade" — o aumento vira uma peça complementar.',
        });
        if (alvo) {
          // `suggestedComplement` só existe quando o corpo JSON chega inteiro;
          // no caminho normal (apiRequest desembrulha o erro em texto) a
          // diferença é a que o próprio modal tentou salvar menos a atual.
          const atual = Number(alvo?.quantity);
          setComplementSugestao(
            Number(data?.suggestedComplement)
              || (Number.isFinite(atual) && quantityValue > atual ? quantityValue - atual : null),
          );
          setComplementItem(alvo);
        }
        return;
      }

      if (code === "QUANTITY_FLOOR") {
        toast({
          title: "Redução não permitida",
          description: `Já há ${data?.minimum ?? "?"} un. produzidas/conferidas/entregues. Mínimo: ${data?.minimum ?? "?"}.`,
          variant: "destructive",
        });
        return;
      }

      toast({ title: "Erro ao atualizar quantidade", description: message, variant: "destructive" });
    },
  });

  const updateObservationsMutation = useMutation({
    mutationFn: async ({ itemId, observations }: { itemId: string; observations: string }) =>
      await apiRequest("PATCH", `/api/items/${itemId}`, { observations }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      setSelectedItem((prev: any) => prev ? { ...prev, observations: cardObservations } : prev);
      toast({ title: "Observação salva" });
    },
    onError: (error: any) => toast({ title: "Erro ao salvar observação", description: error.message, variant: "destructive" }),
  });

  const creatorReviewMutation = useMutation({
    mutationFn: async ({ itemId }: { itemId: string }) => await apiRequest("PATCH", `/api/items/${itemId}/creator-review`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items/approved"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      setReleaseConfirmOpen(false);
      // Avança para a peça seguinte em vez de fechar. Só fecha na última —
      // e é aí que o FreezeWhileClosing continua valendo, porque é aí que o
      // `selectedItem` de fato some com o modal em fade.
      if (!marcarAvanco()) { setModalOpen(false); setSelectedItem(null); }
      toast({ title: "Peça liberada para produção!", description: "Pronto para produção — a Arte foi notificada." });
    },
    onError: (error: any) => toast({ title: "Erro ao liberar peça", description: error.message, variant: "destructive" }),
  });

  const bulkReleaseMutation = useMutation({
    // LIBERAÇÃO não tem rota em lote (/bulk-creator-review não existe: a
    // chamada caía no fallback do SPA — 200 + HTML — e a tela dava "peças
    // liberadas" sem nada acontecer). Usa a rota individual, idempotente, e
    // reporta o que de fato passou. Devolução é diferente: essa TEM rota em
    // lote (bulk-return-to-arte), usada pelo bulkReturnMutation abaixo.
    mutationFn: async (itemIds: string[]) => {
      const results = await Promise.allSettled(
        itemIds.map(id => apiRequest("PATCH", `/api/items/${id}/creator-review`, {}))
      );
      const failedIds = itemIds.filter((_, i) => results[i].status === "rejected");
      return { total: itemIds.length, released: itemIds.length - failedIds.length, failed: failedIds.length, failedIds };
    },
    onSuccess: ({ total, released, failed, failedIds }, enviados) => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items/approved"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      // Falha parcial: mantém selecionado só o que falhou, para a pessoa
      // tentar de novo sem re-marcar tudo. As peças de evento finalizado, que
      // nem chegaram a ser enviadas (ver `selecaoLote`), CONTINUAM marcadas —
      // desmarcá-las em silêncio daria a entender que foram processadas.
      setSelectedItemIds(prev => {
        const foi = new Set(enviados);
        const falhou = new Set(failedIds);
        return new Set(Array.from(prev).filter(id => falhou.has(id) || !foi.has(id)));
      });
      setBulkReleaseConfirmOpen(false);
      if (failed > 0) {
        toast({
          title: "Liberação parcial",
          description: `${released} de ${total} liberada(s). ${failed} não passou(aram) — verifique o status delas.`,
          variant: "destructive",
        });
      } else {
        toast({ title: "Peças liberadas", description: `${released} peça(s) liberada(s) para produção.` });
      }
    },
    onError: (error: any) => toast({ title: "Erro ao liberar peças", description: error.message, variant: "destructive" }),
  });

  const returnToArteMutation = useMutation({
    mutationFn: async (payload: { itemId: string; notes: string; destino: string }) =>
      // PATCH, não POST: a rota é PATCH e o método errado caía no fallback do
      // SPA, que responde 200 com HTML. A tela dava "devolvida com sucesso" e o
      // servidor nunca recebia nada — a peça continuava na fila de revisão.
      await apiRequest("PATCH", `/api/items/${payload.itemId}/return-to-arte`, { notes: payload.notes, destino: payload.destino }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      setReturnConfirmOpen(false); setReturnObservations("");
      if (!marcarAvanco()) { setModalOpen(false); setSelectedItem(null); }
      toast({ title: "Peça devolvida para Arte", description: "A peça foi devolvida com observações." });
    },
    onError: (error: any) => toast({ title: "Erro ao devolver peça", description: error.message, variant: "destructive" }),
  });

  const bulkReturnMutation = useMutation({
    // Uma chamada só: a rota de lote existe (PATCH /api/items/bulk-return-to-arte)
    // e responde { success, errors, items, failedItemIds }.
    mutationFn: async (payload: { ids: string[]; notes: string; destino: string }) => {
      const res = await apiRequest("PATCH", "/api/items/bulk-return-to-arte", { itemIds: payload.ids, notes: payload.notes, destino: payload.destino });
      const result: { success: number; errors: number; failedItemIds?: string[] } = await res.json();
      return { total: payload.ids.length, failed: result.errors, failedIds: result.failedItemIds ?? [] };
    },
    onSuccess: ({ total, failed, failedIds }, { ids: enviados }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      // Falha parcial: mantém selecionado só o que falhou, para a pessoa
      // tentar de novo sem re-marcar tudo — e mantém também as de evento
      // finalizado, que nem chegaram a ser enviadas (ver `selecaoLote`).
      setSelectedItemIds(prev => {
        const foi = new Set(enviados);
        const falhou = new Set(failedIds);
        return new Set(Array.from(prev).filter(id => falhou.has(id) || !foi.has(id)));
      });
      setBulkReturnConfirmOpen(false); setBulkReturnObservations("");
      const ok = total - failed;
      if (failed > 0) {
        toast({ title: "Devolução parcial", description: `${ok} devolvida(s), ${failed} com erro.`, variant: "destructive" });
      } else {
        toast({ title: "Peças devolvidas", description: `${ok} peça(s) devolvida(s) para a Arte.` });
      }
    },
    onError: (error: any) => toast({ title: "Erro ao devolver peças", description: error.message, variant: "destructive" }),
  });

  const deleteItemMutation = useMutation({
    mutationFn: async (itemId: string) => await apiRequest("DELETE", `/api/items/${itemId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      setDeleteConfirmItemId(null);
      toast({ title: "Peça excluída", description: "A peça foi removida com sucesso." });
    },
    onError: (error: any) => toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" }),
  });

  // Diálogo de reaproveitamento (total ou parcial)
  const [reuseDialogItemId, setReuseDialogItemId] = useState<string | null>(null);
  const [partialReuseQty, setPartialReuseQty] = useState(1);

  // URL espelhando o recorte, com 300ms de atraso (a régua da casa pede ≥200):
  // sem o debounce, cada tecla da busca escreveria um replaceState — o padrão
  // que já derrubou a árvore React no Safari em outra tela. `replaceState` e
  // não `pushState`: filtrar não é navegar, e o Voltar tem de sair da tela em
  // vez de desfazer letra por letra.
  useEffect(() => {
    const t = setTimeout(() => {
      const qs = filtrosRevisaoParaQuery(
        window.location.search,
        { busca: searchTerm, eventos: eventFilter, tipos: itemTypeFilter },
      );
      window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
    }, 300);
    return () => clearTimeout(t);
  }, [searchTerm, eventFilter, itemTypeFilter]);

  // Voltar/avançar do navegador reidrata o recorte. Sem isto o back trocava a
  // URL e a tela continuava com os filtros novos — a URL passaria a mentir.
  useEffect(() => {
    const onPop = () => {
      const f = filtrosRevisaoDaURL(window.location.search);
      setSearchTerm(f.busca);
      setEventFilter(f.eventos);
      setItemTypeFilter(f.tipos);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Atalho "/" foca a busca (paridade com eventos, calendário, histórico,
  // registros, painel e gestão de prazos — era a tela que faltava).
  // Com um diálogo aberto o atalho SE CALA: o FocusScope do Radix puxaria o
  // foco de volta na hora e o efeito visível seria só um pisca-pisca.
  const algumDialogoAberto = modalOpen || releaseConfirmOpen || returnConfirmOpen
    || bulkReleaseConfirmOpen || bulkReturnConfirmOpen
    || deleteConfirmItemId !== null || complementItem !== null || reuseDialogItemId !== null;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || algumDialogoAberto) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [algumDialogoAberto]);

  const toggleReuseMutation = useMutation({
    mutationFn: async ({ itemId, isReuse }: { itemId: string; isReuse: boolean }) => {
      await apiRequest("PATCH", `/api/items/${itemId}`, { isReuse });
      // Ao marcar reaproveitamento, libera automaticamente para Gráfica (status → produced)
      if (isReuse) {
        try {
          await apiRequest("PATCH", `/api/items/${itemId}/creator-review`, {});
        } catch {
          return { statusAdvanced: false };
        }
      }
      return { statusAdvanced: true };
    },
    onSuccess: (result, { isReuse }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items/approved"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      const advanced = (result as any)?.statusAdvanced !== false;
      if (isReuse && !advanced) {
        // A marcação gravou mas o creator-review falhou: nada de prometer
        // atualização automática — a liberação precisa ser feita à mão.
        toast({
          title: "Reaproveitamento marcado, mas não liberado",
          description: "A liberação automática falhou. Abra a peça e clique em \"Liberar para Produção\" manualmente.",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: isReuse ? "Reaproveitamento confirmado" : "Marcação removida",
        description: isReuse
          ? "Peça enviada diretamente para a Gráfica como produzida."
          : "A peça voltará ao fluxo normal.",
      });
    },
    onError: (error: any) => toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" }),
  });

  // Reaproveitamento parcial: define reuseQty e avança via creator-review
  const partialReuseMutation = useMutation({
    mutationFn: async ({ itemId, reuseQty }: { itemId: string; reuseQty: number }) => {
      // creator-review aceita reuseQty no body para registrar o parcial e
      // avança para ready_for_production (as demais unidades ainda vão para produção)
      await apiRequest("PATCH", `/api/items/${itemId}/creator-review`, { reuseQty });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items/approved"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      setReuseDialogItemId(null);
      toast({
        title: "Reaproveitamento parcial confirmado",
        description: "As unidades reaproveitadas foram registradas. O restante segue para produção.",
      });
    },
    onError: (error: any) => toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" }),
  });

  // ── Evento FINALIZADO CONTINUA NESTA FILA ─────────────────────────────────
  // Regra do dono (17/08): "os eventos finalizados devem aparecer ainda na
  // Revisão e Gráfica". Esta tela filtrava as peças de evento encerrado à mão
  // ou já realizado; não filtra mais.
  //
  // POR QUE AQUI VOLTA E EM ARTE/ATENDIMENTO/VINCULAR CONTINUA ESCONDIDO — a
  // pergunta que alguém vai fazer olhando as cinco filas. A guarda do servidor
  // (server/routes/eventoFinalizado.ts) barra o que faz o trabalho ANDAR e
  // permite o que ARRUMA A CASA; das exceções que ela abriu, CONFERIR e
  // REGISTRAR ENTREGA são da Gráfica e EXCLUIR PEÇA é daqui. Esconder a peça
  // tornava impossível executar o que o servidor autoriza: a lista de um evento
  // acabado ficava com lixo preso, sem tela nenhuma onde apagá-lo. E há a razão
  // de leitura, que vale tanto quanto: a Revisão é onde se vê o que ficou por
  // revisar, e um pendente que some não vira resolvido — vira invisível.
  //
  // A CONTRAPARTIDA, obrigatória: aqui quase TUDO é barrado. Liberar, devolver,
  // reaproveitar, mexer na quantidade e salvar observação passam todos pela
  // guarda. Por isso o selo na linha é ainda mais necessário do que na Gráfica
  // — e por isso o lote precisa separar peça viva de peça morta (ver
  // `selecaoLote`, abaixo) em vez de mandar tudo e colher erro.
  //
  // `item.event` vem CRU do storage: traz `status` ("closed") e `startDate`.
  const hojeBusinessMs = todayBusinessMs();
  const pendingItems = useMemo(
    () => items.filter(item => item.status === REVIEW_STATUS),
    [items],
  );

  // Um selo por peça, calculado uma vez. `null` = evento em jogo, linha normal.
  const selosPorItem = useMemo(() => {
    const m = new Map<string, SeloPecaEventoFinalizado>();
    for (const item of pendingItems) {
      const s = seloPecaEventoFinalizado(item.event, hojeBusinessMs);
      if (s) m.set(item.id, s);
    }
    return m;
  }, [pendingItems, hojeBusinessMs]);
  const seloDoItem = (item: any): SeloPecaEventoFinalizado | null =>
    (item ? selosPorItem.get(item.id) : undefined) ?? null;

  // ── O RECORTE, UMA FUNÇÃO SÓ ──────────────────────────────────────────────
  // A INVARIANTE, e é ela que alguém quebra sem perceber ao acrescentar um
  // filtro: FACETA E LISTA SAEM DO MESMO POOL. A lista chama isto sem
  // `excluir`; cada dropdown chama com a PRÓPRIA dimensão excluída, sobre o
  // mesmo `pendingItems`. Assim o pool da faceta é, por construção, um
  // superconjunto da lista que difere só naquele filtro — a faceta nunca
  // oferece menos do que a tela mostra (evento visível na lista e ausente do
  // menu) nem mais do que ela entrega (opção que devolve lista vazia).
  //
  // Era exatamente aqui que estava o furo: as duas facetas ignoravam a BUSCA.
  // Digitar "banner" encolhia a lista e os dropdowns continuavam prometendo o
  // número de antes — "Evento X · 12" sobre uma lista de 2. É o mesmo defeito
  // que a Gráfica já tinha corrigido em lib/grafica-filtros.
  //
  // Busca sem acento (`normalizarBusca`): "so quero" acha "SÓ QUERO PEDALAR SP".
  const casaRecorte = (item: any, excluir?: 'evento' | 'tipo' | 'sem-arquivo' | 'evento-finalizado'): boolean => {
    const q = normalizarBusca(searchTerm);
    if (q &&
        !normalizarBusca(item.type).includes(q) &&
        !normalizarBusca(item.description).includes(q) &&
        !normalizarBusca(item.displayId).includes(q) &&
        !normalizarBusca(item.event?.name).includes(q)) return false;
    if (excluir !== 'evento' && eventFilter.length > 0 && !eventFilter.includes(item.eventId)) return false;
    if (excluir !== 'tipo' && itemTypeFilter.length > 0 && !itemTypeFilter.includes(item.type)) return false;
    if (excluir !== 'sem-arquivo' && soSemArquivo && !!item.finalFileUrl) return false;
    if (excluir !== 'evento-finalizado' && soEventoFinalizado && !selosPorItem.has(item.id)) return false;
    return true;
  };

  const filteredItems = useMemo(() => pendingItems.filter(item => casaRecorte(item)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pendingItems, searchTerm, eventFilter, itemTypeFilter, soSemArquivo, soEventoFinalizado, selosPorItem]);

  // ── OS DOIS CHIPS DE FACETA ─────────────────────────────────────────────
  //
  // Mesma disciplina dos dropdowns: a contagem sai do pool com a PRÓPRIA
  // dimensão excluída, então o número ao lado do chip é exatamente o número de
  // linhas que o clique entrega. Contar sobre `filteredItems` faria o chip
  // ligado mostrar a contagem de si mesmo e o desligado mostrar zero.
  const contagemSemArquivo = useMemo(
    () => pendingItems.filter(i => casaRecorte(i, 'sem-arquivo') && !i.finalFileUrl).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pendingItems, searchTerm, eventFilter, itemTypeFilter, soEventoFinalizado, selosPorItem],
  );
  const contagemEventoFinalizado = useMemo(
    () => pendingItems.filter(i => casaRecorte(i, 'evento-finalizado') && selosPorItem.has(i.id)).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pendingItems, searchTerm, eventFilter, itemTypeFilter, soSemArquivo, selosPorItem],
  );

  // ── A FRASE DE RESOLUÇÃO ────────────────────────────────────────────────
  //
  // A legenda era a descrição da tela — a mesma frase todo dia, que quem chega
  // aqui já sabe. No lugar dela, o que muda a cada visita: quantas dá para
  // decidir AGORA, e quantas ainda dependem da Arte. São 74 peças: a diferença
  // entre "tenho trabalho" e "tenho trabalho em 12 delas" é o dia inteiro.
  const fraseDeResolucao = useMemo(() => {
    const total = pendingItems.length;
    if (total === 0) return "Nenhuma peça aguardando revisão.";
    const semArquivo = pendingItems.filter(i => !i.finalFileUrl).length;
    const prontas = total - semArquivo;
    if (semArquivo === 0) {
      return `${total === 1 ? "A única peça tem" : `Todas as ${total} peças têm`} arquivo final — é só decidir.`;
    }
    if (prontas === 0) {
      return `${semArquivo === 1 ? "A única peça ainda espera" : `As ${semArquivo} peças ainda esperam`} o arquivo final da Arte.`;
    }
    return `${prontas} ${prontas === 1 ? "peça está pronta" : "peças estão prontas"} para decidir; `
         + `${semArquivo} ainda ${semArquivo === 1 ? "espera" : "esperam"} o arquivo final da Arte.`;
  }, [pendingItems]);

  // Seleção sobrevive ao filtro: quando a lista filtrada muda, mantém marcado
  // só o que continua visível — senão "Liberar Selecionadas" agiria sobre
  // peças que a pessoa não está mais vendo.
  useEffect(() => {
    setSelectedItemIds(prev => {
      const visible = new Set(filteredItems.map((i: any) => i.id));
      if (Array.from(prev).every(id => visible.has(id))) return prev;
      return new Set(Array.from(prev).filter(id => visible.has(id)));
    });
  }, [filteredItems]);

  const uniqueItemTypes = useMemo(() => Array.from(new Set(pendingItems.map(i => i.type).filter(Boolean))).sort(), [pendingItems]);
  const eventsWithItems = useMemo(() => {
    const ids = new Set(pendingItems.map(i => i.eventId));
    return events.filter(e => ids.has(e.id));
  }, [pendingItems, events]);

  // Filtros facetados: mesmo `casaRecorte` da lista, só com a própria dimensão
  // excluída (ver a invariante logo acima). Peça de evento finalizado entra
  // aqui como qualquer outra — ela está na lista, então o evento dela tem de
  // estar no menu; do contrário o operador vê a peça na tela e não consegue
  // filtrar por ela.
  const eventFilterOptions = useMemo(() => {
    // Sem dotColor aqui: o EventFilterDropdown em modo múltiplo (o desta tela)
    // não renderiza bolinha — e o mapa local divergia do PRIORITY canônico.
    const byId = new Map(events.map((e: any) => [e.id, e]));
    const map = new Map<string, { value: string; label: string; count: number }>();
    pendingItems
      .filter(i => casaRecorte(i, 'evento'))
      .forEach((i: any) => {
        if (!i.eventId) return;
        const cur = map.get(i.eventId);
        if (cur) cur.count++;
        else {
          const ev: any = byId.get(i.eventId);
          map.set(i.eventId, { value: i.eventId, label: ev?.name || i.event?.name || 'Sem evento', count: 1 });
        }
      });
    return Array.from(map.values());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingItems, searchTerm, itemTypeFilter, events]);

  const typeFilterOptions = useMemo(() => {
    const map = new Map<string, { value: string; label: string; count: number }>();
    pendingItems
      .filter(i => casaRecorte(i, 'tipo'))
      .forEach((i: any) => {
        if (!i.type) return;
        const cur = map.get(i.type);
        if (cur) cur.count++;
        else map.set(i.type, { value: i.type, label: i.type, count: 1 });
      });
    return Array.from(map.values());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingItems, searchTerm, eventFilter]);

  const itemsByEvent = useMemo(() => {
    const map = new Map<string, any[]>();
    // Dentro do evento: grupo do item padrão, depois tipo.
    const sorted = [...filteredItems].sort((a, b) => {
      const ga = typeToGroup[a.type] || '', gb = typeToGroup[b.type] || '';
      // type pode vir null do banco — sem o fallback o localeCompare lançava.
      return ga.localeCompare(gb) || (a.type || '').localeCompare(b.type || '');
    });
    sorted.forEach(item => {
      const key = item.eventId || "__none__";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    });
    // Grupos na ordem da urgência real: saída do caminhão ascendente (quem
    // sai primeiro aparece primeiro), sem data por último, nome desempata.
    const byId = new Map(events.map((e: any) => [e.id, e]));
    const entries = Array.from(map.entries()).sort(([idA], [idB]) => {
      const ea: any = byId.get(idA), eb: any = byId.get(idB);
      const ta = ea?.truckDepartureDate ? new Date(ea.truckDepartureDate).getTime() : Infinity;
      const tb = eb?.truckDepartureDate ? new Date(eb.truckDepartureDate).getTime() : Infinity;
      if (ta !== tb) return ta < tb ? -1 : 1;
      return (ea?.name || "").localeCompare(eb?.name || "");
    });
    return new Map(entries);
  }, [filteredItems, typeToGroup, events]);

  // ── LOTE MISTO: a tela conta a história que o servidor conta ──────────────
  // As duas ações em lote (liberar e devolver) são barradas em evento
  // finalizado, e o servidor já sabe lidar com mistura:
  //   · PATCH /api/items/bulk-return-to-arte roda item a item — o barrado entra
  //     na lista de `errors`, os outros passam. 409 do lote inteiro só quando
  //     NADA passou e tudo o que caiu caiu por esta regra (`contadorDeBloqueio`
  //     em server/routes/eventoFinalizado.ts).
  //   · "Liberar" não tem rota de lote: são N chamadas individuais de
  //     creator-review, cada peça de evento acabado devolvendo o seu 409.
  //
  // O que a tela faz com isso: NÃO manda o que já se sabe que vai voltar. As
  // duas alternativas eram piores. Mandar tudo e mostrar "3 com erro" põe a
  // culpa nas peças boas e não diz o motivo (a resposta do lote traz o número
  // de erros, não o texto de cada um). Bloquear o lote inteiro por causa de uma
  // peça pune a seleção grande, que é justamente para o que o lote existe.
  //
  // Então a seleção é SEPARADA em duas: `vivas` seguem, `finalizadas` ficam —
  // e o diálogo de confirmação diz as duas metades ANTES do clique, com o
  // motivo. Só quando a seleção inteira é de evento acabado o botão desabilita,
  // que é o espelho exato do 409 de lote inteiro do servidor.
  const selecaoLote = useMemo(() => {
    const ids = Array.from(selectedItemIds);
    const vivas: string[] = [];
    let encerrado = 0, realizado = 0;
    for (const id of ids) {
      const motivo = selosPorItem.get(id)?.motivo;
      if (motivo === "encerrado") encerrado++;
      else if (motivo === "realizado") realizado++;
      else vivas.push(id);
    }
    return { ids, vivas, encerrado, realizado, finalizadas: encerrado + realizado };
  }, [selectedItemIds, selosPorItem]);

  /** A frase do "ficam de fora" — uma só, para os dois diálogos de lote. */
  const avisoLoteFinalizadas = (): string | null => {
    const { finalizadas, encerrado, realizado } = selecaoLote;
    if (finalizadas <= 0) return null;
    const partes: string[] = [];
    if (encerrado > 0) partes.push(`${encerrado} em evento encerrado por um administrador`);
    if (realizado > 0) partes.push(`${realizado} em evento cuja data já passou`);
    return `${finalizadas} ${finalizadas === 1 ? "peça fica" : "peças ficam"} de fora`
      + ` (${partes.join(" e ")}): o servidor recusa qualquer ação que faça o trabalho andar num evento finalizado.`;
  };

  // O selo da peça ABERTA no modal. Vem do mesmo mapa da lista — a ficha não
  // pode discordar da linha de onde foi aberta. Deriva de `selectedItem.event`
  // como reserva: o modal sobrevive a uma invalidação que tire a peça da lista.
  const seloSelecionado = selectedItem
    ? (selosPorItem.get(selectedItem.id) ?? seloPecaEventoFinalizado(selectedItem.event, hojeBusinessMs))
    : null;

  const getEventInfo = (eventId: string) => events.find(e => e.id === eventId);

  const toggleItem = (id: string) => setSelectedItemIds(prev => {
    const s = new Set(prev);
    s.has(id) ? s.delete(id) : s.add(id);
    return s;
  });
  const toggleAll = () => {
    selectedItemIds.size === filteredItems.length && filteredItems.length > 0
      ? setSelectedItemIds(new Set())
      : setSelectedItemIds(new Set(filteredItems.map(i => i.id)));
  };

  const filaIdx = useMemo(
    () => (selectedItem ? filteredItems.findIndex((i: any) => i.id === selectedItem.id) : -1),
    [selectedItem, filteredItems],
  );
  const temAnterior = filaIdx > 0;
  const temProxima = filaIdx >= 0 && filaIdx < filteredItems.length - 1;

  const irParaFila = (idx: number) => {
    const alvo = filteredItems[idx];
    if (!alvo) return;
    // Mesmo preparo do openModal, sem reabrir o diálogo: trocar a peça com o
    // modal aberto tem de zerar os campos de edição da anterior, senão a
    // observação digitada na peça 3 aparece na 4.
    setSelectedItem(alvo);
    setQuantityValue(alvo.quantity ?? 1);
    setEditingQuantity(false);
    setReturnObservations("");
    setCardObservations(alvo.observations || "");
  };

  /**
   * Depois de decidir, a peça sai de `pendingItems` — e, portanto, da lista
   * filtrada. O índice que ERA o dela passa a ser o da peça seguinte, então
   * avançar é ficar no mesmo índice. Guardamos o índice ANTES da invalidação
   * porque depois dela `selectedItem` já não está na lista.
   */
  const proximaAposDecidir = useRef<number | null>(null);
  useEffect(() => {
    const idx = proximaAposDecidir.current;
    if (idx === null) return;
    proximaAposDecidir.current = null;
    const alvo = filteredItems[idx];
    if (!alvo) { setModalOpen(false); setSelectedItem(null); return; }
    irParaFila(idx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredItems]);

  /** Marca o avanço, ou devolve `false` quando era a última da fila. */
  const marcarAvanco = (): boolean => {
    if (filaIdx < 0 || filaIdx >= filteredItems.length - 1) return false;
    proximaAposDecidir.current = filaIdx;
    return true;
  };

  const openModal = (item: any) => {
    setSelectedItem(item);
    setQuantityValue(item.quantity ?? 1);
    setEditingQuantity(false);
    setReturnObservations("");
    setCardObservations(item.observations || "");
    setModalOpen(true);
  };

  useEffect(() => {
    if (!modalOpen) return;
    const handler = (e: KeyboardEvent) => {
      // Quem está digitando num campo (textarea de observação, input de
      // quantidade...) não pode ter Enter/Esc sequestrados pelo atalho.
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "TEXTAREA" || t.tagName === "INPUT" || t.tagName === "SELECT" || t.isContentEditable)) return;
      // Com foco em botão/link, Enter ativa o próprio elemento — agir aqui
      // também abriria dois diálogos de uma vez.
      if (t && t.closest("button,a")) return;
      // Com um AlertDialog de confirmação aberto por cima, Enter/Esc são dele
      // (o Radix cuida); agir aqui fechava as duas camadas de uma vez.
      if (releaseConfirmOpen || returnConfirmOpen) return;
      // Mesma checagem do botão "Liberar para Produção": sem arquivo final —
      // ou com o evento finalizado, que o servidor recusa com 409 — o atalho
      // não pode driblar o botão desabilitado.
      if (e.key === "Enter" && selectedItem?.finalFileUrl
        && !seloPecaEventoFinalizado(selectedItem?.event, hojeBusinessMs)) setReleaseConfirmOpen(true);
      if (e.key === "Escape") setModalOpen(false);
      if (e.key === "ArrowLeft" && temAnterior) { e.preventDefault(); irParaFila(filaIdx - 1); }
      if (e.key === "ArrowRight" && temProxima) { e.preventDefault(); irParaFila(filaIdx + 1); }
      // D de devolver — o par do Enter, que libera. Sem ele o atalho de
      // teclado só cobria metade da decisão.
      if ((e.key === "d" || e.key === "D") && !seloSelecionado) { e.preventDefault(); setReturnConfirmOpen(true); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [modalOpen, selectedItem, releaseConfirmOpen, returnConfirmOpen, filaIdx, temAnterior, temProxima, seloSelecionado]);

  if (itemsLoading || eventsLoading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: TI.accent }} />
      </div>
    );
  }

  if (itemsError || eventsError) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 12, textAlign: "center", padding: "0 24px" }}>
        <p style={{ fontSize: 15, fontWeight: 700, color: "#b91c1c", margin: 0 }}>
          {itemsError ? "Não foi possível carregar os itens" : "Não foi possível carregar os eventos"}
        </p>
        <p style={{ fontSize: 13, color: TI.secondary, margin: 0 }}>Verifique sua conexão e tente novamente.</p>
        <button onClick={() => { refetchItems(); refetchEvents(); }} style={{ marginTop: 4, background: TI.text, color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Tentar novamente</button>
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: TI.bg, height: "100%", overflowY: "auto" }}>

      {/* ── 1. CABEÇALHO ───────────────────────────────────────────────
          Era um bloco preto de 275px — 45% da primeira dobra — com titulo de
          56px e um olho decorativo de 280px atras. Nenhuma outra tela do app
          tem isso: Gestao de Prazos gasta 60px no mesmo trabalho e Analises,
          78. A lista so comecava em y=434, entao a tela mostrava TRES pecas
          antes de precisar rolar.

          O titulo virou "Revisao", o nome que a barra lateral ja usa: "Revisao
          do Criador" era o unico lugar do app que dizia outra coisa.

          Os contadores sairam daqui. "Aguardando: 74" e o "74 de 74 pecas" da
          barra de filtros eram o MESMO numero dito duas vezes, a 200px de
          distancia; ficou o da barra, que e onde o resto do app poe. */}
      <section style={{ backgroundColor: TI.surface, padding: isMobile ? "16px 12px" : "20px 32px", borderBottom: `1px solid ${TI.border}` }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1 style={{
              margin: 0, fontSize: isMobile ? 20 : 24, fontWeight: 800, color: TI.text,
              fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "-0.02em",
            }}>
              Revisão
            </h1>
            {/* #57534e e não o TI.secondary: em 13px a régua da casa é 4,5:1. */}
            <p data-testid="frase-resolucao" style={{ margin: "4px 0 0", fontSize: 13, color: "#57534e", maxWidth: 620, lineHeight: 1.5 }}>
              {fraseDeResolucao}
            </p>
          </div>

          {/* A ENTRADA DA FILA. Sem ela, comecar a revisar exige achar a
              primeira linha e mirar num botao de 90px — e quem abre esta tela
              para trabalhar quer comecar do comeco, nao escolher por onde. */}
          {filteredItems.length > 0 && (
            <button
              type="button"
              onClick={() => openModal(filteredItems[0])}
              data-testid="button-queue-start"
              style={{
                display: "inline-flex", alignItems: "center", gap: 8, flexShrink: 0,
                height: 40, padding: "0 18px", borderRadius: 8, border: "none",
                backgroundColor: "#1c1917", color: "#fff", cursor: "pointer",
                font: "inherit", fontSize: 13, fontWeight: 700, whiteSpace: "nowrap",
              }}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = "#292524"; }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = "#1c1917"; }}
            >
              <Eye aria-hidden="true" style={{ width: 15, height: 15 }} />
              Revisar em fila ({filteredItems.length})
            </button>
          )}
        </div>
      </section>


      {/* ── 2. FILTER BAR ──────────────────────────────────────────────── */}
      <section style={{
        backgroundColor: "#fff", padding: isMobile ? "12px 12px" : "12px 32px",
        borderBottom: `1px solid ${TI.border}`,
        position: "sticky", top: 0, zIndex: 30,
        boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
      }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          {/* Search */}
          <div style={{ position: "relative", flex: "1 1 240px", minWidth: 200 }}>
            <Search style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: TI.muted, pointerEvents: "none" }} />
            <input
              ref={searchRef}
              placeholder="Filtrar por ID ou descrição..."
              aria-label="Filtrar por ID ou descrição"
              aria-keyshortcuts="/"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              data-testid="input-search"
              style={{ width: "100%", paddingLeft: 34, paddingRight: searchTerm ? 32 : 12, paddingTop: 9, paddingBottom: 9, backgroundColor: "#f3f4f3", border: "none", borderRadius: 8, fontSize: 13, color: TI.text, boxSizing: "border-box" }}
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm("")} aria-label="Limpar busca" style={{ position: "absolute", right: 0, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: TI.muted, padding: 8, display: "flex" }}>
                <X style={{ width: 13, height: 13 }} />
              </button>
            )}
          </div>

          {/* Event select */}
          <EventFilterDropdown
            values={eventFilter}
            onValuesChange={setEventFilter}
            options={eventFilterOptions}
          />

          {/* Type select */}
          <FilterSelect
            label="Tipo de Peça" allLabel="Todos os tipos"
            values={itemTypeFilter} onValuesChange={setItemTypeFilter}
            options={typeFilterOptions}
            searchPlaceholder="Buscar tipo..." emptyText="Nenhum tipo encontrado."
            testId="select-type-filter"
            triggerStyle={{ backgroundColor: "#f3f4f3", border: "none", fontSize: 13, color: TI.text, minWidth: 150 }}
          />

          {/* ── OS DOIS CHIPS DE FACETA ──
              "Sem arquivo final" e "Evento finalizado" sao as duas perguntas
              que a fila de 74 faz o tempo todo e que nenhum dropdown
              respondia. A contagem sai do pool com a PROPRIA dimensao
              excluida (ver `contagemSemArquivo`), entao o numero e exatamente
              o de linhas que o clique entrega.

              Estado sem nenhuma peca nao vira chip: o clique devolveria lista
              vazia sem dizer por que. Fica se ja estiver ligado, senao o chip
              sumiria com o filtro aceso e nao haveria como apaga-lo. */}
          {([
            { id: "sem-arquivo", rotulo: "Sem arquivo final", n: contagemSemArquivo, ligado: soSemArquivo, alterna: () => setSoSemArquivo(v => !v), cor: "#9a3412", testid: "chip-sem-arquivo" },
            { id: "evento-finalizado", rotulo: "Evento finalizado", n: contagemEventoFinalizado, ligado: soEventoFinalizado, alterna: () => setSoEventoFinalizado(v => !v), cor: "#78716c", testid: "chip-evento-finalizado-faceta" },
          ]).map(chip => {
            if (chip.n === 0 && !chip.ligado) return null;
            return (
              <button
                key={chip.id}
                type="button"
                onClick={chip.alterna}
                aria-pressed={chip.ligado}
                title={chip.ligado ? `Remover o filtro ${chip.rotulo}` : `Ver so ${chip.rotulo.toLowerCase()}`}
                data-testid={chip.testid}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 7,
                  height: 32, padding: "0 12px", borderRadius: 999,
                  border: `1px solid ${chip.ligado ? "#1c1917" : "#e7e5e4"}`,
                  backgroundColor: chip.ligado ? "#1c1917" : "#fff",
                  color: chip.ligado ? "#fff" : "#44403c",
                  cursor: "pointer", font: "inherit", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap",
                }}
              >
                <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: chip.ligado ? "#fff" : chip.cor, flexShrink: 0 }} />
                {chip.rotulo}
                <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, opacity: chip.ligado ? 1 : 0.75 }}>{chip.n}</span>
              </button>
            );
          })}

          {(searchTerm || eventFilter.length > 0 || itemTypeFilter.length > 0 || soSemArquivo || soEventoFinalizado) && (
            <button
              onClick={() => { setSearchTerm(""); setEventFilter([]); setItemTypeFilter([]); setSoSemArquivo(false); setSoEventoFinalizado(false); }}
              data-testid="button-clear-filters"
              style={{ fontSize: 11, fontWeight: 700, color: TI.secondary, textTransform: "uppercase", letterSpacing: "0.08em", background: "none", border: "none", cursor: "pointer", padding: "0 8px" }}>
              Limpar filtros
            </button>
          )}

          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            {filteredItems.length > 0 && (
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: TI.secondary, cursor: "pointer", userSelect: "none" }}>
                <input
                  type="checkbox"
                  checked={selectedItemIds.size === filteredItems.length && filteredItems.length > 0}
                  ref={el => { if (el) el.indeterminate = selectedItemIds.size > 0 && selectedItemIds.size < filteredItems.length; }}
                  onChange={toggleAll}
                  data-testid="checkbox-select-all"
                  style={{ accentColor: TI.accent, width: 20, height: 20 }}
                />
                Selecionar todos
              </label>
            )}
            {/* O contador unico da tela. Herdou do hero o recado das pecas de
                evento finalizado: elas CONTAM aqui (a regra dos numeros desta
                tela e "todo contador conta o que a tela mostra"), mas quem le
                "74" precisa saber quanto daquilo e trabalho que ninguem vai
                mais fazer. #746e69 sobre branco = 5,15:1 nos 11px. */}
            <span style={{ fontSize: 11, color: TI.secondary, whiteSpace: "nowrap" }}>
              {filteredItems.length} de {pendingItems.length} peças
              {selosPorItem.size > 0 && (
                <span
                  data-testid="chip-evento-finalizado"
                  title={"Estas peças continuam na lista porque a Revisão é onde se vê o que ficou por revisar — e porque excluir peça segue liberado."
                    + " Liberar, devolver, reaproveitar e mexer na quantidade estão bloqueados nelas."}
                >
                  {" · "}{selosPorItem.size} de evento finalizado
                </span>
              )}
            </span>
          </div>
        </div>

        {/* ── Ações em lote ────────────────────────────────────────────────
            Viviam num painel de 280px na area mais cara da tela, e passavam a
            maior parte do tempo DESABILITADAS — porque na maior parte do tempo
            nao ha nada selecionado. Agora entram quando existe selecao e somem
            quando ela zera, no mesmo desenho que a Arte usa (pilula escura com
            o × redondo). Como a barra e sticky, elas seguem alcancaveis com a
            lista rolada — coisa que o painel do topo nao era. */}
        {selecaoLote.ids.length > 0 && (
          <div style={{ maxWidth: 1200, margin: "10px auto 0", display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
            <span
              data-testid="chip-selecao"
              style={{ display: "inline-flex", alignItems: "center", gap: 6, height: alturaControle, padding: "0 6px 0 12px", borderRadius: 999, background: "#1c1917", color: "#ffffff", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}
            >
              {selecaoLote.ids.length} {selecaoLote.ids.length === 1 ? "selecionada" : "selecionadas"}
              <button
                onClick={() => setSelectedItemIds(new Set())}
                aria-label="Limpar seleção"
                data-testid="button-clear-selection"
                style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(255,255,255,0.16)", border: "none", cursor: "pointer", color: "#ffffff", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
              >
                <X style={{ width: 12, height: 12 }} />
              </button>
            </span>

            {/* O que fica de fora, dito ANTES de abrir a confirmacao: quem
                marcou 40 linhas precisa ver o desconto na hora. */}
            {selecaoLote.finalizadas > 0 && (
              <span
                role="status"
                data-testid="aviso-lote-evento-finalizado"
                title={avisoLoteFinalizadas() ?? undefined}
                style={{ fontSize: 12, color: TI.secondary }}
              >
                {selecaoLote.finalizadas} em evento finalizado, fora do lote
              </span>
            )}

            <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
              {/* O CONTADOR DO BOTAO e o das pecas que de fato vao (`vivas`),
                  nao o da selecao: prometer "Liberar (12)" e mandar 9 e a
                  mentira que o lote misto cria. Desabilita quando nenhuma
                  sobra — espelho do 409 de lote inteiro do servidor —, e ai o
                  `title` diz o motivo. #ffffff sobre #9d4300 = 6,49:1 ✓ */}
              <button
                onClick={() => selecaoLote.vivas.length > 0 && setBulkReleaseConfirmOpen(true)}
                disabled={selecaoLote.vivas.length === 0 || bulkReleaseMutation.isPending}
                title={selecaoLote.vivas.length === 0
                  ? "Toda a seleção é de evento finalizado — liberar para produção está bloqueado nessas peças."
                  : undefined}
                data-testid="button-bulk-release-hero"
                style={{
                  height: alturaControle, padding: "0 14px", borderRadius: 8, border: "none",
                  backgroundColor: selecaoLote.vivas.length === 0 ? "#e7e5e4" : "#9d4300",
                  color: selecaoLote.vivas.length === 0 ? "#78716c" : "#ffffff",
                  fontSize: 13, fontWeight: 700, whiteSpace: "nowrap",
                  cursor: selecaoLote.vivas.length === 0 || bulkReleaseMutation.isPending ? "not-allowed" : "pointer",
                }}>
                {bulkReleaseMutation.isPending
                  ? "Processando..."
                  : `Liberar ${selecaoLote.vivas.length}`}
              </button>
              <button
                onClick={() => selecaoLote.vivas.length > 0 && setBulkReturnConfirmOpen(true)}
                disabled={selecaoLote.vivas.length === 0 || bulkReturnMutation.isPending}
                title={selecaoLote.vivas.length === 0
                  ? "Toda a seleção é de evento finalizado — devolver para a Arte está bloqueado nessas peças."
                  : undefined}
                data-testid="button-bulk-return-hero"
                style={{
                  height: alturaControle, padding: "0 14px", borderRadius: 8,
                  border: `1px solid ${TI.border}`, backgroundColor: TI.surface,
                  color: selecaoLote.vivas.length === 0 ? "#a8a29e" : "#44403c",
                  fontSize: 13, fontWeight: 700, whiteSpace: "nowrap",
                  cursor: selecaoLote.vivas.length === 0 || bulkReturnMutation.isPending ? "not-allowed" : "pointer",
                }}>
                {bulkReturnMutation.isPending
                  ? "Processando..."
                  : `Devolver ${selecaoLote.vivas.length}`}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* ── 3 & 4. HIGH-DENSITY TABLE ──────────────────────────────────── */}
      <section style={{ padding: isMobile ? "12px 12px" : "32px", maxWidth: 1200, margin: "0 auto", paddingBottom: isMobile ? 20 : 80 }}>
        {filteredItems.length === 0 ? (
          <div style={{ backgroundColor: "#fff", border: "1px solid #e7e5e4", borderRadius: 8, textAlign: "center", padding: "80px 24px" }}>
            <CheckCircle style={{ width: 48, height: 48, color: "#d1cfce", margin: "0 auto 16px" }} />
            <p style={{ fontSize: 15, fontWeight: 700, color: TI.secondary, margin: "0 0 8px" }}>
              {pendingItems.length === 0 ? "Tudo revisado!" : "Nenhum resultado encontrado"}
            </p>
            <p style={{ fontSize: 13, color: TI.secondary, margin: 0 }}>
              {pendingItems.length === 0 ? "Não há itens aguardando sua revisão no momento." : "Tente ajustar os filtros."}
            </p>
          </div>
        ) : isMobile ? (
          <div>
            {Array.from(itemsByEvent.entries()).map(([eventKey, eventItems]) => {
              const evInfo = getEventInfo(eventKey);
              return (
                <div key={eventKey} style={{marginBottom:16}}>
                  {/* Event header */}
                  <div style={{padding:"8px 0 6px", borderBottom:"2px solid #f97316", marginBottom:8}}>
                    <span style={{fontSize:11,fontWeight:900,textTransform:"uppercase",letterSpacing:"0.08em",color:"#746e69"}}>{evInfo?.name || "Sem Evento"}</span>
                  </div>
                  {eventItems.map((item:any) => (
                    /* Card mobile: o checkbox fica FORA do alvo role="button"
                       (checkbox aninhado em botão é estrutura inválida para
                       leitor de tela); o corpo do card segue abrindo o modal
                       por toque, Enter e Espaço. */
                    <div key={item.id} style={{position:"relative",backgroundColor:"#fff",border:"1px solid #e7e5e4",borderRadius:8,marginBottom:8}}>
                      {/* ALVO de 44, CAIXA de 20. Este checkbox e a unica porta
                          para "Liberar selecionadas" / "Devolver selecionadas"
                          no celular, e tinha 20px de lado — metade do piso de
                          toque. Crescer a caixa deixaria o card com um quadrado
                          enorme no canto; quem cresce e o <label>, que e
                          transparente e encaminha o toque para o input. */}
                      <label
                        style={{position:"absolute",top:0,right:0,width:44,height:44,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",zIndex:1}}
                      >
                        <input
                          type="checkbox"
                          checked={selectedItemIds.has(item.id)}
                          onChange={()=>toggleItem(item.id)}
                          aria-label={`Selecionar ${item.displayId}`}
                          style={{accentColor:"#f97316",width:20,height:20,cursor:"pointer"}}
                        />
                      </label>
                      <div
                        role="button"
                        tabIndex={0}
                        aria-label={`Revisar peça ${item.displayId}`}
                        onKeyDown={e => { if (e.target !== e.currentTarget) return; if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openModal(item); } }}
                        onClick={() => openModal(item)}
                        style={{padding:"12px",cursor:"pointer",display:"flex",flexDirection:"column",gap:6}}>
                        <div style={{display:"flex",justifyContent:"flex-start",alignItems:"center",gap:6,flexWrap:"wrap",paddingRight:44}}>
                          <span style={{fontFamily:"monospace",fontWeight:700,color:"#c2410c",fontSize:13}}>{item.displayId}</span>
                          {/* EVENTO FINALIZADO — a peça voltou para a fila (ver
                              `pendingItems`), então tem de se declarar. Aqui
                              quase nada funciona: só excluir. */}
                          {seloDoItem(item) && (() => {
                            const selo = seloDoItem(item)!;
                            return (
                              <span
                                data-testid={`badge-evento-finalizado-mobile-${item.id}`}
                                title={selo.hint}
                                style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:9,fontWeight:800,color:selo.text,background:selo.bg,border:`1px solid ${selo.border}`,borderRadius:6,padding:"1px 5px",letterSpacing:"0.06em",whiteSpace:"nowrap",textTransform:"uppercase"}}
                              >
                                <span aria-hidden="true" style={{width:5,height:5,borderRadius:"50%",background:selo.dot,flexShrink:0}} />
                                {selo.label}
                              </span>
                            );
                          })()}
                        </div>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
                          <div style={{flex:1}}>
                            <span style={{fontSize:13,fontWeight:700,color:"#1c1917"}}>{item.type}</span>
                            {item.description && <p style={{fontSize:13,color:"#746e69",margin:"2px 0 0"}}>{item.description}</p>}
                          </div>
                          <span style={{fontSize:10,fontWeight:700,color:"#746e69",whiteSpace:"nowrap"}}>{item.quantity}×</span>
                        </div>
                        <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
                          {item.sponsors?.map((s:any)=><span key={s.id} style={{fontSize:10,padding:"2px 6px",borderRadius:6,backgroundColor:"#f5f5f4",color:"#746e69",fontWeight:600}}>{s.name}</span>)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ backgroundColor: "#fff", border: "1px solid #e7e5e4", borderRadius: 8, overflowX: "auto", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
            <table style={{ width: "100%", minWidth: 860, textAlign: "left", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ backgroundColor: "#fafaf9", borderBottom: "1px solid #e7e5e4" }}>
                  {/* Select all */}
                  <th style={{ padding: "14px 24px", width: 48, textAlign: "center" }}>
                    <input
                      type="checkbox"
                      checked={selectedItemIds.size === filteredItems.length && filteredItems.length > 0}
                      ref={el => { if (el) el.indeterminate = selectedItemIds.size > 0 && selectedItemIds.size < filteredItems.length; }}
                      onChange={toggleAll}
                      aria-label="Selecionar todos"
                      data-testid="checkbox-select-all-header"
                      style={{ accentColor: "#f97316", width: 20, height: 20, cursor: "pointer" }}
                    />
                  </th>
                  {[
                    // DE SETE COLUNAS PARA QUATRO. ID, Tipo e Descrição
                    // identificam a MESMA peça e viviam separados por duas
                    // divisórias; Qtd, Dim e M² são a mesma medida contada de
                    // três jeitos. Juntas, cabem numa linha — e sobra largura
                    // para a coluna que faltava.
                    { label: "Peça", w: undefined },
                    { label: "Qtd · Dim · m²", w: 190 },
                    { label: "Arquivo final", w: 140 },
                    { label: "Ações", w: 120, right: true },
                  ].map(col => (
                    <th
                      key={col.label}
                      style={{
                        padding: "14px 16px",
                        width: col.w,
                        textAlign: col.right ? "right" : "left",
                        fontSize: 10, fontWeight: 900,
                        textTransform: "uppercase", letterSpacing: "0.1em",
                        // #746e69 sobre o #fafaf9 do thead da 4,55 — passa
                        // raspando. #7a6154 da 5,49 e e o tom que as outras
                        // telas ja usam em rotulo de coluna.
                        color: "#7a6154",
                      }}
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from(itemsByEvent.entries()).map(([eventId, eventItems]) => {
                  const event = getEventInfo(eventId);
                  const groupSelected = eventItems.every(i => selectedItemIds.has(i.id));
                  const toggleGroup = () => {
                    setSelectedItemIds(prev => {
                      const next = new Set(prev);
                      if (groupSelected) eventItems.forEach(i => next.delete(i.id));
                      else eventItems.forEach(i => next.add(i.id));
                      return next;
                    });
                  };

                  return (
                    <Fragment key={eventId}>
                      {/* ── Group header row ── */}
                      <tr style={{ backgroundColor: "#1c1917", borderTop: "1px solid #292524", borderBottom: "1px solid #292524" }}>
                        <td style={{ padding: "10px 24px", textAlign: "center" }}>
                          <input
                            type="checkbox"
                            checked={groupSelected}
                            onChange={toggleGroup}
                            aria-label={`Selecionar evento ${event?.name || "sem evento"}`}
                            data-testid={`checkbox-group-${eventId}`}
                            style={{ accentColor: "#f97316", width: 20, height: 20, cursor: "pointer", backgroundColor: "#292524" }}
                          />
                        </td>
                        <td colSpan={7} style={{ padding: "10px 16px" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                              <span style={{
                                fontFamily: "'Space Grotesk', sans-serif",
                                fontSize: 11, fontWeight: 900,
                                color: "#fff", textTransform: "uppercase", letterSpacing: "0.06em",
                              }}>
                                {event?.name || "Sem Evento"}
                              </span>
                              <span style={{
                                backgroundColor: "#c2410c", color: "#fff",
                                fontSize: 10, fontWeight: 900,
                                padding: "1px 8px", borderRadius: 999,
                                textTransform: "uppercase", letterSpacing: "0.04em",
                              }}>
                                {eventItems.length} PENDENTE{eventItems.length !== 1 ? "S" : ""}
                              </span>
                            </div>
                            {event && (
                              <div style={{ display: "flex", gap: 12, fontSize: 10, color: "#d6d3d1", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", flexWrap: "wrap", alignItems: "center" }}>
                                {event.startDate && (
                                  <span>Início: <span style={{ color: "#d6d3d1" }}>{parseDateLocal(event.startDate).toLocaleDateString("pt-BR")}</span></span>
                                )}
                                {/* ── A SAIDA DO CAMINHAO, COM OS DIAS ──

                                    Os eventos JA vinham na ordem da saida (ver
                                    `itemsByEvent`), mas o cabecalho so dizia a
                                    DATA: para saber se "09/09" e daqui a tres
                                    dias ou a tres semanas era preciso fazer a
                                    conta de cabeca, evento por evento, numa
                                    fila de 74 pecas. A ordem ja e a da
                                    urgencia; faltava a urgencia estar escrita.

                                    A cor sai da mesma regua dos chips de prazo
                                    ao lado — nada de um terceiro vocabulario de
                                    urgencia no mesmo cabecalho. */}
                                {event.truckDepartureDate && (() => {
                                  const saida = new Date(event.truckDepartureDate);
                                  const hoje = new Date(); hoje.setHours(0,0,0,0);
                                  const dia = new Date(saida); dia.setHours(0,0,0,0);
                                  const dias = Math.ceil((dia.getTime() - hoje.getTime()) / 86400000);
                                  const cor = dias <= 7 ? "#fca5a5" : dias <= 30 ? "#fdba74" : "rgba(255,255,255,0.7)";
                                  const quando = dias < 0 ? `ha ${-dias}d`
                                    : dias === 0 ? "hoje"
                                    : dias === 1 ? "amanha"
                                    : `${dias}d`;
                                  return (
                                    <span
                                      data-testid={`chip-caminhao-${eventId}`}
                                      title={`Saida do caminhao em ${saida.toLocaleDateString("pt-BR", { timeZone: 'UTC' })} as ${saida.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: 'UTC' })}`}
                                      style={{ display: "inline-flex", alignItems: "center", gap: 5, flexShrink: 0, backgroundColor: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 999, padding: "3px 9px", fontSize: 10, fontWeight: 700, color: cor, letterSpacing: "0.04em", whiteSpace: "nowrap", textTransform: "none" }}
                                    >
                                      <Truck aria-hidden="true" style={{ width: 11, height: 11 }} />
                                      Caminhao {saida.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", timeZone: 'UTC' }).toUpperCase().replace(".", "")}
                                      {" · "}{saida.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: 'UTC' })}
                                      {" · "}{quando}
                                    </span>
                                  );
                                })()}
                                {event.truckDepartureDate && (() => {
                                  const dls = [
                                    { label: "Lista de Imagens", days: event.deadlineListaImagens  ?? -25 },
                                    { label: "Revisão de Lista", days: event.deadlineRevisaoLista   ?? -8  },
                                  ];
                                  const tod = new Date(); tod.setHours(0,0,0,0);
                                  return dls.map(({ label, days }) => {
                                    const d = new Date(new Date(event.truckDepartureDate).getTime() + days * 86400000);
                                    d.setHours(0,0,0,0);
                                    const diff = Math.ceil((d.getTime() - tod.getTime()) / 86400000);
                                    const ds = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
                                    const s = diff < 0
                                      ? { bg: "rgba(255,80,80,0.22)", border: "rgba(255,80,80,0.38)", text: "#ffb3b3" }
                                      : diff === 0
                                      ? { bg: "rgba(255,200,80,0.28)", border: "rgba(255,200,80,0.45)", text: "#ffe59c" }
                                      : diff <= 3
                                      ? { bg: "rgba(255,160,50,0.22)", border: "rgba(255,160,50,0.38)", text: "#ffc78a" }
                                      : { bg: "rgba(255,255,255,0.12)", border: "rgba(255,255,255,0.2)", text: "rgba(255,255,255,0.72)" };
                                    return (
                                      <span key={label} style={{ display: "inline-flex", alignItems: "center", gap: 4, backgroundColor: s.bg, border: `1px solid ${s.border}`, borderRadius: 999, padding: "3px 9px", fontSize: 10, fontWeight: 700, color: s.text, letterSpacing: "0.04em", whiteSpace: "nowrap", textTransform: "none" }}>
                                        {label} · {ds}{diff >= 0 && diff <= 14 && <span style={{ opacity: 0.65, fontWeight: 500 }}> ({diff}d)</span>}
                                      </span>
                                    );
                                  });
                                })()}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* ── Item rows ── */}
                      {eventItems.map((item, idx) => {
                        const isSelected = selectedItemIds.has(item.id);
                        // Evento finalizado: selo na linha e ações barradas
                        // desabilitadas. Ver `pendingItems`, no topo.
                        const selo = seloDoItem(item);
                        const isLast = idx === eventItems.length - 1;
                        const prevItem = idx > 0 ? eventItems[idx - 1] : null;
                        const showTypeHeader = !prevItem || prevItem.type !== item.type;
                        const itemGroupName = typeToGroup[item.type] || '';
                        const prevItemGroupName = prevItem ? (typeToGroup[prevItem.type] || '') : '';
                        const showGroupHeader = showTypeHeader && itemGroupName !== '' && itemGroupName !== prevItemGroupName;
                        return (
                          <Fragment key={item.id}>
                            {showGroupHeader && (
                              <tr style={{ backgroundColor: '#dbeafe' }}>
                                <td colSpan={8} style={{ padding: '5px 16px' }}>
                                  <span style={{ fontSize: 10, fontWeight: 800, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{itemGroupName}</span>
                                </td>
                              </tr>
                            )}
                            {showTypeHeader && (
                              <tr style={{ backgroundColor: '#f0ede8' }}>
                                <td colSpan={8} style={{ padding: '5px 16px' }}>
                                  <span style={{ fontSize: 10, fontWeight: 700, color: '#57534e', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{item.type}</span>
                                </td>
                              </tr>
                            )}
                          <tr
                            key={`row-${item.id}`}
                            data-testid={`row-item-${item.id}`}
                            style={{
                              borderBottom: isLast ? "none" : "1px solid #f0efee",
                              backgroundColor: isSelected ? "#fff8f5" : "#fff",
                              transition: "background-color 0.1s",
                              cursor: "pointer",
                            }}
                            onClick={() => openModal(item)}
                            onMouseEnter={e => { if (!isSelected) e.currentTarget.style.backgroundColor = "#fafaf9"; }}
                            onMouseLeave={e => { e.currentTarget.style.backgroundColor = isSelected ? "#fff8f5" : "#fff"; }}
                          >
                            {/* Checkbox. `stopPropagation` no <td>: a linha
                                inteira abre o modal, e marcar para o lote não é
                                pedir a ficha. */}
                            <td onClick={e => e.stopPropagation()} style={{ padding: "14px 24px", textAlign: "center" }}>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleItem(item.id)}
                                aria-label={`Selecionar ${item.displayId}`}
                                data-testid={`checkbox-item-${item.id}`}
                                style={{ accentColor: "#f97316", width: 20, height: 20, cursor: "pointer" }}
                              />
                            </td>

                            {/* ── Peça: ID · Tipo · Descrição ──
                                Eram três colunas para identificar a MESMA
                                peça, separadas por duas divisórias. Juntas,
                                lêem-se como uma frase — e a largura que
                                sobra vira a coluna que faltava. */}
                            <td style={{ padding: "12px 16px", minWidth: 0 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                                <span
                                  data-testid={`text-display-id-${item.id}`}
                                  style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 700, color: "#c2410c", flexShrink: 0, whiteSpace: "nowrap" }}
                                >
                                  {item.displayId}
                                </span>
                                <span style={{ fontSize: 13, fontWeight: 700, color: TI.text, flexShrink: 0, whiteSpace: "nowrap" }}>
                                  {item.type}
                                </span>
                                {item.description && (
                                  // flexShrink alto: falta largura, a descrição
                                  // é que cede. ID e tipo identificam a peça.
                                  <span title={item.description} style={{ fontSize: 12, color: "#57534e", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flexShrink: 999, minWidth: 0 }}>
                                    {item.description}
                                  </span>
                                )}

                                {/* MARCADORES COMO ÍCONE. Eram pílulas com
                                    texto ("Ref. visual", "Reaproveit.") do
                                    tamanho da descrição, disputando com ela a
                                    leitura — sendo que o que dizem é binário. */}
                                {item.referenceUrl && (
                                  <a
                                    href={item.referenceUrl} target="_blank" rel="noopener noreferrer"
                                    onClick={e => e.stopPropagation()}
                                    title="Ver a referência visual do solicitante"
                                    aria-label={`Referência visual de ${item.displayId}`}
                                    data-testid={`link-reference-solicitacao-${item.id}`}
                                    style={{ display: "inline-flex", color: "#2563eb", flexShrink: 0 }}
                                  >
                                    <Paperclip style={{ width: 13, height: 13 }} />
                                  </a>
                                )}
                                {item.isReuse && (
                                  <span title="Reaproveitamento" aria-label="Reaproveitamento" style={{ display: "inline-flex", color: "#15803d", flexShrink: 0 }}>
                                    <Recycle aria-hidden="true" style={{ width: 13, height: 13 }} />
                                  </span>
                                )}
                                {/* EVENTO FINALIZADO — sem este selo, a linha
                                    mostra "Revisar" e dois botões apagados sem
                                    dizer por quê. */}
                                {selo && (
                                  <span
                                    data-testid={`badge-evento-finalizado-${item.id}`}
                                    title={selo.hint}
                                    style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", backgroundColor: selo.bg, color: selo.text, border: `1px solid ${selo.border}`, borderRadius: 999, padding: "2px 7px", whiteSpace: "nowrap", flexShrink: 0 }}
                                  >
                                    <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: "50%", background: selo.dot, flexShrink: 0 }} />
                                    {selo.label}
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* ── Qtd · Dim · m² ──
                                Eram três colunas para a mesma medida contada de
                                três jeitos. Em DM Mono os números de linhas
                                vizinhas se alinham e dá para comparar de
                                relance, que é o que três colunas prometiam e
                                não entregavam. */}
                            <td style={{ padding: "12px 16px", whiteSpace: "nowrap" }}>
                              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: "#57534e" }}>
                                {item.quantity ?? 0} un
                                {item.fileWidth && item.fileHeight ? ` · ${item.fileWidth}×${item.fileHeight}` : ""}
                                {item.calculatedM2 ? ` · ${item.calculatedM2} m²` : ""}
                              </span>
                            </td>

                            {/* ── Arquivo final ──
                                Só se descobria que ele não chegou ABRINDO o
                                modal e encontrando "Liberar" apagado: a
                                informação que decide se a peça é revisável
                                estava escondida atrás de um clique, numa fila
                                de 74. */}
                            <td data-testid={`cell-final-file-${item.id}`} style={{ padding: "12px 16px", whiteSpace: "nowrap" }}>
                              {item.finalFileUrl ? (
                                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 24, padding: "0 9px", borderRadius: 999, backgroundColor: "#f0fdf4", border: "1px solid #bbf7d0", color: "#166534", fontSize: 12, fontWeight: 700 }}>
                                  <Check aria-hidden="true" style={{ width: 11, height: 11 }} /> Recebido
                                </span>
                              ) : (
                                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 24, padding: "0 9px", borderRadius: 999, backgroundColor: "#fff7ed", border: "1px solid #fed7aa", color: "#9a3412", fontSize: 12, fontWeight: 700 }}>
                                  <Clock aria-hidden="true" style={{ width: 11, height: 11 }} /> Aguardando
                                </span>
                              )}
                            </td>

                            {/* Ação */}
                            <td onClick={e => e.stopPropagation()} style={{ padding: "12px 16px", textAlign: "right" }}>
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
                                <button
                                  onClick={() => openModal(item)}
                                  data-testid={`button-review-${item.id}`}
                                  style={{
                                    backgroundColor: "#1c1917", color: "#fff",
                                    border: "none", borderRadius: 6,
                                    fontSize: 10, fontWeight: 900,
                                    textTransform: "uppercase", letterSpacing: "0.08em",
                                    padding: "6px 16px", cursor: "pointer",
                                    transition: "background-color 0.15s",
                                  }}
                                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#ea580c")}
                                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = "#1c1917")}
                                >
                                  Revisar
                                </button>
                                {/* Reaproveitamento passa por PATCH /api/items/:id
                                    (isReuse) e por creator-review: as duas rotas
                                    são barradas em evento finalizado. */}
                                <button
                                  onClick={() => {
                                    if (selo) return;
                                    if (item.isReuse) {
                                      // Se já está marcado como reaproveitamento total, desfaz
                                      toggleReuseMutation.mutate({ itemId: item.id, isReuse: false });
                                    } else {
                                      // Abre o diálogo para escolher total ou parcial
                                      setPartialReuseQty(Math.max(1, Number(item.quantity) - 1 || 1));
                                      setReuseDialogItemId(item.id);
                                    }
                                  }}
                                  disabled={!!selo}
                                  data-testid={`button-reuse-${item.id}`}
                                  aria-label={`Reaproveitamento de ${item.displayId}`}
                                  title={selo
                                    ? motivoAcaoBloqueada(selo.motivo, "marcar reaproveitamento")
                                    : item.isReuse ? "Remover marcação de reaproveitamento" : "Marcar para reaproveitamento"}
                                  style={{
                                    background: selo ? "#f5f5f4" : item.isReuse ? "#dcfce7" : "none",
                                    border: selo ? "1px solid #e7e5e4" : item.isReuse ? "1px solid #86efac" : "1px solid transparent",
                                    cursor: selo ? "not-allowed" : "pointer",
                                    color: selo ? "#78716c" : item.isReuse ? "#15803d" : "#746e69",
                                    padding: 6,
                                    display: "flex", alignItems: "center",
                                    borderRadius: 6, transition: "all 0.15s",
                                  }}
                                  onMouseEnter={e => {
                                    if (!selo && !item.isReuse) {
                                      (e.currentTarget as HTMLButtonElement).style.color = "#15803d";
                                      (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#f0fdf4";
                                    }
                                  }}
                                  onMouseLeave={e => {
                                    if (!selo && !item.isReuse) {
                                      (e.currentTarget as HTMLButtonElement).style.color = "#746e69";
                                      (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent";
                                    }
                                  }}
                                >
                                  <Recycle style={{ width: 15, height: 15 }} />
                                </button>
                                {/* Toda peça desta tela está em awaiting_final_review —
                                    status TRAVADO para "solicitacao" no DELETE do servidor.
                                    Mostrar a lixeira para esse perfil só rendia um 403. */}
                                {user?.role === "admin" && (
                                  <button
                                    onClick={() => setDeleteConfirmItemId(item.id)}
                                    data-testid={`button-delete-${item.id}`}
                                    title="Excluir peça"
                                    style={{
                                      background: "none", border: "none", cursor: "pointer",
                                      color: "#746e69", padding: 6,
                                      display: "flex", alignItems: "center",
                                      borderRadius: 6, transition: "color 0.15s",
                                    }}
                                    onMouseEnter={e => (e.currentTarget.style.color = "#ef4444")}
                                    onMouseLeave={e => (e.currentTarget.style.color = "#746e69")}
                                  >
                                    <Trash2 style={{ width: 15, height: 15 }} />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                          </Fragment>
                        );
                      })}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>

            {/* Table footer */}
            <div style={{
              backgroundColor: "#fafaf9", padding: "12px 24px",
              borderTop: "1px solid #e7e5e4",
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              {/* O par de botoes que ficava aqui SAIU. Com as acoes na barra
                  sticky, ele virou a mesma dupla duas vezes na tela — e a copia
                  daqui era a pior das duas: contava `selectedItemIds.size` em
                  vez das pecas que de fato vao (`selecaoLote.vivas`), entao
                  prometia "Liberar 12" e mandava 9, e nao tinha o guard que
                  espelha o 409 de lote inteiro do servidor. Duas versoes da
                  mesma acao com contas diferentes e pior que nenhuma. */}
              <span style={{ fontSize: 10, fontWeight: 700, color: TI.secondary, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Mostrando {filteredItems.length} de {pendingItems.length} {pendingItems.length !== 1 ? "itens pendentes" : "item pendente"}
              </span>
            </div>
          </div>
        )}
      </section>

      {/* ── 5. REVIEW MODAL ────────────────────────────────────────────── */}
      <Dialog open={modalOpen} onOpenChange={open => { setModalOpen(open); if (!open) setReturnObservations(""); }}>
        <DialogContent className={`review-dialog-shell max-w-6xl p-0 gap-0 rounded-xl overflow-hidden flex flex-col ${HIDE_NATIVE_CLOSE}`} style={{ height: isMobile ? "94dvh" : "87vh", maxHeight: 900, maxWidth: isMobile ? "95vw" : undefined }} onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
          {/* POR QUE congelar aqui: é o pior onSuccess da tela. Liberar (ou
              devolver) dispara TRÊS invalidateQueries, fecha este modal, fecha
              o AlertDialog de confirmação E faz `setSelectedItem(null)` — tudo
              no mesmo commit. `selectedItem` é a fonte de TODO o miolo: sem
              congelar, o modal esvazia (thumb, ID, tipo, patrocinadores,
              histórico) no primeiro frame do fade, e cada um dos renders da
              janela de saída ainda manda desanexa+reanexa de ref para a
              subárvore em desmontagem — o laço do React #185. Mecanismo por
              extenso em components/modal-shell.tsx. */}
          <FreezeWhileClosing open={modalOpen}>
          <DialogTitle className="sr-only">Decisão de Revisão</DialogTitle>
          <DialogDescription className="sr-only">
            Compare o thumb aprovado pelo patrocinador com o arquivo final da Arte e libere ou devolva a peça
          </DialogDescription>
          {/* ── CINCO FAIXAS HORIZONTAIS, LARGURA CHEIA ──

              A versão anterior era um layout de DUAS COLUNAS com estilo novo
              por cima: a comparação numa coluna de 56% e a decisão num painel
              à direita, com os botões empilhados numa caixa escura. Os
              defeitos vistos em produção — botões se sobrepondo, metadados
              cortados pela borda — eram CONSEQUÊNCIA dessa estrutura, não
              bugs soltos: a coluna estreita nunca teve largura para dois
              rótulos longos lado a lado, e a tira quebrava porque dividia 44%
              do modal com tudo o mais.

              Agora não existe divisão esquerda/direita no nível do modal:

                1 · cabeçalho escuro (identidade da peça + fila + X)
                2 · comparação — dois panes lado a lado, LARGURA CHEIA
                3 · metadados numa linha
                4 · decisão — botões + observações | patrocinadores/histórico
                5 · rodapé de atalhos

              Só a faixa 2 flexiona (flex: 1 1 auto, piso 200px); as outras
              quatro têm flexShrink: 0 — numa janela de 540px de altura, a
              comparação e os dois botões estão visíveis sem rolar, porque as
              faixas fixas somam ~340px e o resto é da comparação. */}
          <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>

            {/* ── 1 · CABEÇALHO ── */}
            <div style={{ flexShrink: 0, background: "linear-gradient(135deg, #1c1917, #2d2926)", padding: isMobile ? "12px 14px" : "14px 20px", display: "flex", alignItems: "center", gap: 14 }}>
              {!isMobile && (
                <div aria-hidden="true" style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: "rgba(249,115,22,0.14)", border: "1px solid rgba(249,115,22,0.35)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Eye style={{ width: 18, height: 18, color: "#fdba74" }} />
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 700, color: "#fdba74", flexShrink: 0 }}>{selectedItem?.displayId}</span>
                  <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 17, fontWeight: 800, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{selectedItem?.type}</span>
                  {selectedItem?.isReuse && (
                    <span style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", backgroundColor: "#dcfce7", color: "#166534", borderRadius: 999, padding: "3px 10px", flexShrink: 0 }}>
                      Reaproveitamento
                    </span>
                  )}
                </div>
                {selectedItem?.description && (
                  <p style={{ margin: "1px 0 0", fontSize: 13, color: "rgba(255,255,255,0.72)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{selectedItem.description}</p>
                )}
                {(() => {
                  const ev: any = events.find((e: any) => e.id === selectedItem?.eventId);
                  if (!ev) return null;
                  const saida = ev.truckDepartureDate ? new Date(ev.truckDepartureDate) : null;
                  return (
                    <p style={{ margin: "2px 0 0", fontSize: 11, color: "rgba(255,255,255,0.55)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {ev.name}
                      {saida && " · caminhão " + saida.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "").replace(" de ", " ") + " · " + saida.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  );
                })()}
              </div>
              {/* ── A FILA mora no cabeçalho, não no corpo ──
                  Sem isto o modal é uma ficha isolada quando o trabalho é uma
                  fila de 74: decidir, o modal fecha, procurar a próxima na
                  tabela, clicar de novo. E a tabela mudou entre uma e outra (a
                  peça decidida saiu dela), então "procurar a próxima" nem é
                  procurar a linha de baixo. */}
              {filaIdx >= 0 && filteredItems.length > 1 && (
                <div style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
                  <button
                    type="button"
                    onClick={() => irParaFila(filaIdx - 1)}
                    disabled={!temAnterior}
                    title="Peça anterior (←)"
                    aria-label="Peça anterior"
                    data-testid="button-modal-prev"
                    style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid rgba(255,255,255,0.22)", background: "transparent", color: temAnterior ? "#fff" : "rgba(255,255,255,0.35)", cursor: temAnterior ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}
                  >
                    <ChevronLeft style={{ width: 15, height: 15 }} />
                  </button>
                  <span
                    data-testid="text-queue-position"
                    aria-live="polite"
                    style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.85)", padding: "0 6px", whiteSpace: "nowrap" }}
                  >
                    {filaIdx + 1} / {filteredItems.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => irParaFila(filaIdx + 1)}
                    disabled={!temProxima}
                    title="Próxima peça (→)"
                    aria-label="Próxima peça"
                    data-testid="button-modal-next"
                    style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid rgba(255,255,255,0.22)", background: "transparent", color: temProxima ? "#fff" : "rgba(255,255,255,0.35)", cursor: temProxima ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}
                  >
                    <ChevronRight style={{ width: 15, height: 15 }} />
                  </button>
                </div>
              )}
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                aria-label="Fechar"
                style={{ width: 36, height: 36, borderRadius: 8, border: "none", background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.8)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, flexShrink: 0 }}
              >
                <X style={{ width: 17, height: 17 }} />
              </button>
            </div>

            {/* ── 2 · COMPARAÇÃO — a única faixa que flexiona ──
                Os dois arquivos lado a lado na LARGURA INTEIRA do modal: é a
                comparação que esta tela existe para mostrar, e antes ela vivia
                espremida numa coluna de 56%. `min-height: 200` fecha as duas
                contas — sem piso a faixa colapsa; com 300px ela empurra os
                botões abaixo da dobra numa janela de 540px. No celular
                empilha, a única situação em que empilhar aqui é certo. */}
            <div style={{ flex: "1 1 auto", minHeight: 200, overflow: "hidden", backgroundColor: "#f5f5f4", padding: isMobile ? 12 : "14px 20px", display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: isMobile ? 10 : 14 }}>
              {[
                { label: "Aprovado pelo patrocinador", url: selectedItem?.approvalThumbUrl, empty: "Sem thumb aprovado" },
                { label: "Arquivo final da Arte", url: selectedItem?.finalFileUrl, empty: "A Arte ainda não subiu o arquivo final" },
              ].map(({ label, url, empty }) => {
                // Caminho de rede/disco (\\10.100.1.7\...): o navegador não
                // abre nem pré-visualiza — sem moldura e sem "ampliar", só o
                // aviso apontando para o caminho copiável na tira abaixo.
                const caminhoDeRede = !!url && !isWebUrl(url);
                return (
                  <div key={label} style={{ display: "flex", flexDirection: "column", gap: 6, minHeight: 0, overflow: "hidden" }}>
                    <p style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 800, color: "#57534e", textTransform: "uppercase", letterSpacing: "0.08em", margin: 0, flexShrink: 0 }}>
                      <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: url ? "#15803d" : "#c2410c", flexShrink: 0 }} />
                      <span style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
                      {url && isWebUrl(url) && (
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={"Ampliar: abrir " + label.toLowerCase() + " em nova aba"}
                          aria-label={"Abrir " + label.toLowerCase() + " em nova aba"}
                          style={{ display: "flex", padding: 4, borderRadius: 6, color: "#78716c", flexShrink: 0 }}
                        >
                          <Maximize2 style={{ width: 14, height: 14 }} />
                        </a>
                      )}
                    </p>
                    {caminhoDeRede ? (
                      <div style={{ backgroundColor: "#fff", borderRadius: 8, border: "1px solid #e7e5e4", padding: "12px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                        <FileImage style={{ width: 20, height: 20, color: "#a8a29e", flexShrink: 0 }} />
                        <p style={{ fontSize: 11, fontWeight: 600, color: TI.secondary, margin: 0 }}>
                          Arquivo salvo na rede local — sem pré-visualização. Copie o caminho na tira abaixo.
                        </p>
                      </div>
                    ) : (
                    /* EIXO DEFINIDO. `max-width: 100%; max-height: 100%;
                       aspect-ratio: 3/2` sem largura nem altura resolve para
                       2px: `max-*` LIMITA um tamanho, nunca o produz. Aqui a
                       moldura toma a altura que a faixa deu (`flex: 1` dentro
                       de um pai de altura definida) e o conteúdo cabe inteiro
                       com `objectFit: contain`. */
                    <div style={{ flex: "1 1 auto", minHeight: isMobile ? 180 : 140, width: "100%", backgroundColor: "#fff", borderRadius: 8, overflow: "hidden", border: "1px solid #e7e5e4", boxShadow: "inset 0 1px 4px rgba(0,0,0,0.06)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {url ? (
                        <FilePreview url={url} noLink objectFit="contain" />
                      ) : (
                        <div style={{ textAlign: "center", color: TI.secondary, padding: 12 }}>
                          <FileImage style={{ width: 32, height: 32, margin: "0 auto 8px", color: "#a8a29e" }} />
                          <p style={{ fontSize: 12, fontWeight: 600, margin: 0 }}>{empty}</p>
                        </div>
                      )}
                    </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* ── 3 · METADADOS NUMA LINHA ──
                Os cartões que quebravam em duas linhas (e a segunda era
                cortada pela borda) viraram UMA linha de blocos separados por
                filetes. Cada bloco encolhe (`min-width: 0`, valor em elipse
                com o texto completo no title); no celular a linha rola na
                horizontal — cortar em silêncio é o único desfecho proibido. */}
            <div style={{ flexShrink: 0, borderTop: "1px solid #e7e5e4", backgroundColor: "#fff", padding: isMobile ? "8px 12px" : "8px 20px", display: "flex", alignItems: "center", overflowX: isMobile ? "auto" : "hidden" }}>
              {[
                { label: "Material", value: selectedItem?.material || "—" },
                { label: "Acabamento", value: selectedItem?.finish || "—" },
                { label: "Dimensões (ARQ.)", value: selectedItem?.fileWidth && selectedItem?.fileHeight ? `${selectedItem.fileWidth}×${selectedItem.fileHeight}` : "—" },
                { label: "M²", value: selectedItem?.calculatedM2 || "—" },
              ].map(({ label, value }, i) => (
                <div key={label} style={{ flex: "1 1 0", minWidth: isMobile ? 76 : 0, padding: "2px 14px 2px " + (i === 0 ? "0" : "14px"), borderLeft: i === 0 ? "none" : "1px solid #e7e5e4" }}>
                  <p style={{ fontSize: 10, color: "#7a6154", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.06em", margin: 0, whiteSpace: "nowrap" }}>{label}</p>
                  <p title={String(value)} style={{ fontSize: 13, fontWeight: 700, color: "#1c1917", margin: "2px 0 0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</p>
                </div>
              ))}

              {/* Quantidade — editável por teclado (role="button" + Enter/Espaço).
                  Em evento finalizado deixa de ser botão: PATCH /api/items/:id
                  passa pela guarda, então abrir o campo só levaria a um 409
                  depois de digitar. O rótulo "· editar" sai junto — oferecer e
                  negar é pior do que não oferecer. */}
              <div
                role={editingQuantity || seloSelecionado ? undefined : "button"}
                tabIndex={editingQuantity || seloSelecionado ? undefined : 0}
                aria-label={seloSelecionado ? undefined : "Editar quantidade"}
                style={{ flex: "1 1 0", minWidth: isMobile ? 104 : 96, padding: "2px 0 2px 14px", borderLeft: "1px solid #e7e5e4", cursor: seloSelecionado ? "default" : "pointer" }}
                onClick={() => {
                  if (!editingQuantity && !seloSelecionado) {
                    setEditingQuantity(true);
                    setTimeout(() => quantityInputRef.current?.select(), 50);
                  }
                }}
                onKeyDown={e => {
                  if (editingQuantity || seloSelecionado) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setEditingQuantity(true);
                    setTimeout(() => quantityInputRef.current?.select(), 50);
                  }
                }}
                title={seloSelecionado
                  ? motivoAcaoBloqueada(seloSelecionado.motivo, "mudar a quantidade")
                  : "Clique para editar a quantidade"}
              >
                <p style={{ fontSize: 10, color: "#7a6154", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.06em", margin: 0, display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}>
                  Qtd
                  {!seloSelecionado && (
                    <span style={{ fontSize: 10, color: "#c2410c", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em" }}>· editar</span>
                  )}
                </p>
                {editingQuantity ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }} onClick={e => e.stopPropagation()}>
                    <input
                      ref={quantityInputRef}
                      type="number"
                      min={1}
                      value={quantityValue}
                      onChange={e => setQuantityValue(Math.max(1, parseInt(e.target.value) || 1))}
                      onKeyDown={e => {
                        if (e.key === "Enter") {
                          updateQuantityMutation.mutate({ itemId: selectedItem.id, quantity: quantityValue });
                        }
                        if (e.key === "Escape") {
                          setQuantityValue(selectedItem.quantity ?? 1);
                          setEditingQuantity(false);
                        }
                      }}
                      style={{
                        width: 52, padding: "2px 6px", fontSize: 13, fontWeight: 700,
                        border: "1.5px solid #f97316", borderRadius: 6,
                        color: TI.text, background: "#fff9f5",
                      }}
                      data-testid="input-quantity-edit"
                      autoFocus
                    />
                    <button
                      onClick={() => updateQuantityMutation.mutate({ itemId: selectedItem.id, quantity: quantityValue })}
                      disabled={updateQuantityMutation.isPending}
                      style={{ padding: "6px 10px", fontSize: 10, fontWeight: 800, backgroundColor: "#c2410c", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", textTransform: "uppercase" }}
                      data-testid="button-confirm-quantity"
                    >
                      {updateQuantityMutation.isPending ? "..." : "OK"}
                    </button>
                    <button
                      onClick={() => { setQuantityValue(selectedItem.quantity ?? 1); setEditingQuantity(false); }}
                      style={{ padding: "6px 8px", fontSize: 10, fontWeight: 800, backgroundColor: "#f3f4f3", color: "#746e69", border: "none", borderRadius: 6, cursor: "pointer" }}
                      data-testid="button-cancel-quantity"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <p style={{ fontSize: 13, fontWeight: 700, color: "#1c1917", margin: "2px 0 0" }}>
                    {selectedItem?.quantity ?? "—"}x
                  </p>
                )}
              </div>

              {/* Copiar caminho da rede — o único gesto útil para o TIF no
                  servidor local; "Abrir" para caminho de rede é promessa que
                  nunca funciona. */}
              {selectedItem?.finalFileUrl && (
                <button
                  type="button"
                  title={"Copiar caminho: " + selectedItem.finalFileUrl}
                  aria-label="Copiar caminho do arquivo final"
                  onClick={() => {
                    navigator.clipboard.writeText(selectedItem.finalFileUrl!)
                      .then(() => toast({ title: "Caminho copiado", description: "Cole no Explorer para abrir o arquivo." }))
                      .catch(() => toast({ title: "Não foi possível copiar", description: "Selecione o caminho e copie manualmente.", variant: "destructive" }));
                  }}
                  style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 6, marginLeft: 14, padding: "8px 12px", borderRadius: 6, border: "1px solid #e7e5e4", backgroundColor: "#fff", color: "#57534e", cursor: "pointer", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}
                >
                  <Copy style={{ width: 13, height: 13 }} />
                  {!isMobile && "Copiar caminho da rede"}
                </button>
              )}
            </div>

            {/* ── 4 · DECISÃO — faixa clara, largura cheia ──
                Nada de caixa escura em volta dos botões: o escuro é do
                cabeçalho. À esquerda os dois botões LADO A LADO com as
                observações abaixo; à direita patrocinadores e histórico. As
                duas colunas com teto de 32vh e rolagem própria — sem o teto
                elas crescem até a altura do conteúdo e o modal inteiro passa a
                rolar, deixando as decisões fora de vista na abertura.

                Sobre as maiúsculas: "LIBERAR PARA PRODUÇÃO" com letterSpacing
                media ~40% mais que "Liberar para produção" e era o que
                produzia a sobreposição dos botões. Caixa normal resolve na
                origem — sem elipse, sem empilhar. */}
            <div style={{ flexShrink: 0, borderTop: "1px solid #e7e5e4", backgroundColor: "#fafaf9", padding: isMobile ? 12 : "14px 20px", display: "flex", flexDirection: isMobile ? "column" : "row", gap: isMobile ? 12 : 24 }}>
              <div className="review-modal-scroll" style={{ flex: isMobile ? undefined : "1 1 0", minWidth: 0, minHeight: 0, maxHeight: isMobile ? "34vh" : "32vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
                {/* PATCH creator-review (liberar) e PATCH return-to-arte
                    (devolver) são as duas rotas mais claramente barradas pela
                    guarda de evento finalizado. Ficam visíveis e DESABILITADAS,
                    com o motivo — sumi-las deixaria a ficha sem explicação
                    nenhuma para a ausência. */}
                <div style={{ display: "flex", gap: 10, flexWrap: isMobile ? "wrap" : "nowrap" }}>
                  <button
                    onClick={() => { if (!seloSelecionado) setReleaseConfirmOpen(true); }}
                    disabled={!!seloSelecionado || creatorReviewMutation.isPending || !selectedItem?.finalFileUrl}
                    data-testid="button-release-modal"
                    title={seloSelecionado
                      ? motivoAcaoBloqueada(seloSelecionado.motivo, "liberar para produção")
                      : !selectedItem?.finalFileUrl ? "Arquivo final não enviado" : ""}
                    style={{
                      flex: "1 1 0", minWidth: 0, height: 48,
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                      borderRadius: 8,
                      border: seloSelecionado || !selectedItem?.finalFileUrl ? "1px solid #e7e5e4" : "none",
                      backgroundColor: seloSelecionado || !selectedItem?.finalFileUrl ? "#f5f5f4" : "#c2410c",
                      /* #6f6a64 sobre #f5f5f4 → 4,91:1: o "off" continua legível
                         porque desabilitado-por-evento-finalizado é o único
                         estado off desta tela que carrega informação nova. */
                      color: seloSelecionado || !selectedItem?.finalFileUrl ? "#6f6a64" : "#fff",
                      fontSize: 13.5, fontWeight: 700, whiteSpace: "nowrap",
                      cursor: seloSelecionado || !selectedItem?.finalFileUrl || creatorReviewMutation.isPending ? "not-allowed" : "pointer",
                    }}
                  >
                    <Check style={{ width: 16, height: 16, flexShrink: 0 }} />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                      {creatorReviewMutation.isPending ? "Liberando..." : "Liberar para produção"}
                    </span>
                  </button>
                  <button
                    onClick={() => { if (!seloSelecionado) setReturnConfirmOpen(true); }}
                    disabled={!!seloSelecionado}
                    title={seloSelecionado ? motivoAcaoBloqueada(seloSelecionado.motivo, "devolver para a Arte") : undefined}
                    data-testid="button-return-toggle"
                    style={{
                      flex: "1 1 0", minWidth: 0, height: 48,
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                      borderRadius: 8, border: "1px solid #e7e5e4",
                      backgroundColor: seloSelecionado ? "#f5f5f4" : "#fff",
                      color: seloSelecionado ? "#6f6a64" : "#1c1917",
                      fontSize: 13.5, fontWeight: 700, whiteSpace: "nowrap",
                      cursor: seloSelecionado ? "not-allowed" : "pointer",
                    }}
                  >
                    <RotateCcw style={{ width: 15, height: 15, flexShrink: 0 }} />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>Devolver para Arte</span>
                  </button>
                  {/* REAPROVEITAR, aqui também. O gesto existia só na linha da
                      tabela; quem revisa em fila (26/48) decide dentro da
                      ficha e não quer fechar, achar a linha, clicar. É o
                      MESMO fluxo do botão da linha — abre o diálogo de
                      total/parcial, ou desfaz a marcação — para não nascer
                      um segundo caminho para a mesma decisão. Terceiro na
                      ordem e mais estreito de propósito: é a decisão menos
                      frequente das três, e os dois primeiros não podem
                      perder largura (a colisão de rótulos já aconteceu). */}
                  <button
                    onClick={() => {
                      if (seloSelecionado || !selectedItem) return;
                      if (selectedItem.isReuse) {
                        toggleReuseMutation.mutate({ itemId: selectedItem.id, isReuse: false });
                      } else {
                        setPartialReuseQty(Math.max(1, Number(selectedItem.quantity) - 1 || 1));
                        setReuseDialogItemId(selectedItem.id);
                      }
                    }}
                    disabled={!!seloSelecionado || toggleReuseMutation.isPending}
                    title={seloSelecionado
                      ? motivoAcaoBloqueada(seloSelecionado.motivo, "marcar reaproveitamento")
                      : selectedItem?.isReuse ? "Remover marcação de reaproveitamento" : "Reaproveitar — total ou parte das unidades, sem nova produção"}
                    aria-label={selectedItem?.isReuse ? "Remover marcação de reaproveitamento" : "Reaproveitar"}
                    aria-pressed={!!selectedItem?.isReuse}
                    data-testid="button-reuse-modal"
                    style={{
                      flex: isMobile ? "1 1 100%" : "0 0 auto", height: 48, padding: "0 16px",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                      borderRadius: 8,
                      border: seloSelecionado ? "1px solid #e7e5e4" : selectedItem?.isReuse ? "1px solid #86efac" : "1px solid #e7e5e4",
                      backgroundColor: seloSelecionado ? "#f5f5f4" : selectedItem?.isReuse ? "#dcfce7" : "#fff",
                      /* #15803d sobre #dcfce7 = 4,6:1; #1c1917 sobre branco. */
                      color: seloSelecionado ? "#6f6a64" : selectedItem?.isReuse ? "#15803d" : "#1c1917",
                      fontSize: 13.5, fontWeight: 700, whiteSpace: "nowrap",
                      cursor: seloSelecionado ? "not-allowed" : "pointer",
                    }}
                  >
                    <Recycle style={{ width: 15, height: 15, flexShrink: 0 }} />
                    {selectedItem?.isReuse ? "Reaproveitada" : "Reaproveitar"}
                  </button>
                </div>
                {seloSelecionado && (
                  <p
                    role="status"
                    data-testid="aviso-ficha-evento-finalizado"
                    style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: "#44403c", backgroundColor: "#f5f5f4", border: "1px solid #e7e5e4", borderRadius: 8, padding: "8px 12px" }}
                  >
                    <strong style={{ color: "#1c1917" }}>{seloSelecionado.label}.</strong>{" "}
                    {seloSelecionado.hint}{" "}
                    Nesta peça continua liberado apenas excluir.
                  </p>
                )}
                {selectedItem?.isReuse && (
                  <p style={{ margin: 0, fontSize: 11, lineHeight: 1.5, color: "#166534", backgroundColor: "#f0fdf4", border: "1px solid #86efac", borderRadius: 8, padding: "8px 12px", display: "flex", alignItems: "center", gap: 8 }}>
                    <Recycle style={{ width: 14, height: 14, flexShrink: 0 }} />
                    <span>Peça de reaproveitamento — não será enviada para nova produção gráfica. Verifique o arquivo e libere normalmente.</span>
                  </p>
                )}

                {/* Observações do item — campo próprio, sempre editável.
                    Existe para anotar sem ter de devolver a peça. */}
                <div style={{ backgroundColor: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "10px 12px", display: "flex", gap: 8 }}>
                  <AlertCircle style={{ width: 14, height: 14, color: "#d97706", flexShrink: 0, marginTop: 2 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 11, fontWeight: 700, color: "#92400e", margin: "0 0 6px" }}>Observações do item</p>
                    <textarea
                      placeholder="Deixe um recado sobre esta peça (cor, acabamento, posição...)"
                      value={cardObservations}
                      onChange={e => setCardObservations(e.target.value)}
                      data-testid="textarea-item-observations"
                      style={{
                        width: "100%", minHeight: 48, padding: "8px 10px", borderRadius: 6,
                        border: "1px solid #fde68a", backgroundColor: "#fffdf5",
                        color: "#78350f", fontSize: 13, resize: "vertical",
                        fontFamily: "inherit", boxSizing: "border-box",
                      }}
                    />
                    {cardObservations !== (selectedItem?.observations || "") && (
                      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                        {/* Salvar observação é PATCH /api/items/:id, a mesma
                            rota (e a mesma guarda) da edição de quantidade. */}
                        <button
                          onClick={() => { if (!seloSelecionado && selectedItem) updateObservationsMutation.mutate({ itemId: selectedItem.id, observations: cardObservations }); }}
                          disabled={!!seloSelecionado || updateObservationsMutation.isPending}
                          title={seloSelecionado ? motivoAcaoBloqueada(seloSelecionado.motivo, "salvar a observação") : undefined}
                          data-testid="button-save-observations"
                          style={{
                            padding: "6px 14px", borderRadius: 6,
                            border: seloSelecionado ? "1px solid #e7e5e4" : "none",
                            backgroundColor: seloSelecionado ? "#f5f5f4" : "#d97706",
                            color: seloSelecionado ? "#6f6a64" : "#fff",
                            fontSize: 12, fontWeight: 700, cursor: seloSelecionado || updateObservationsMutation.isPending ? "not-allowed" : "pointer",
                          }}
                        >
                          {updateObservationsMutation.isPending ? "Salvando..." : "Salvar observação"}
                        </button>
                        <button
                          onClick={() => setCardObservations(selectedItem?.observations || "")}
                          style={{ padding: "6px 12px", borderRadius: 6, border: "none", background: "none", color: "#92400e", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                        >
                          Descartar
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Direita da faixa: patrocinadores e histórico, com o mesmo
                  teto de 32vh — listas crescem, decisões não podem descer. */}
              <div className="review-modal-scroll" style={{ flex: "1 1 0", minWidth: 0, minHeight: 0, maxHeight: isMobile ? "26vh" : "32vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
                {(selectedItem?.sponsors?.length ?? 0) > 0 && (
                  <div>
                    <h3 style={{ fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.18em", color: TI.secondary, paddingBottom: 8, borderBottom: "1px solid #f0efee", margin: "0 0 10px" }}>
                      PATROCINADORES DA PEÇA
                    </h3>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {selectedItem.sponsors.map((s: any) => (
                        <span key={s.id} style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 999, backgroundColor: "#f5f5f4", border: "1px solid #e7e5e4", color: TI.secondary }}>
                          {s.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <h3 style={{ fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.18em", color: TI.secondary, paddingBottom: 8, borderBottom: "1px solid #f0efee", margin: "0 0 14px" }}>
                    HISTÓRICO
                  </h3>
                  {itemAuditLogs.length === 0 ? (
                    <p style={{ fontSize: 13, color: TI.secondary, margin: 0 }}>Sem histórico disponível.</p>
                  ) : (
                    <div style={{ position: "relative", paddingLeft: 24 }}>
                      <div style={{ position: "absolute", left: 11, top: 8, bottom: 0, width: 2, backgroundColor: "#f0efee" }} />
                      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                        {itemAuditLogs.map((log: any, idx: number) => {
                          const cfg = getLogCfg(log);
                          return (
                            <div key={log.id || idx} style={{ position: "relative" }}>
                              <span style={{
                                position: "absolute", left: -22, top: 2,
                                width: 16, height: 16, borderRadius: "50%",
                                backgroundColor: "#fff", border: `4px solid ${cfg.dot}`, zIndex: 1,
                              }} />
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                                <div>
                                  <p style={{ fontSize: 13, fontWeight: 700, color: cfg.text, margin: 0 }}>{cfg.label}</p>
                                  {log.userName && <p style={{ fontSize: 10, color: TI.secondary, margin: "2px 0 0" }}>{log.userName}</p>}
                                  {log.details && log.action && (
                                    <p style={{ fontSize: 11, fontStyle: "italic", color: TI.secondary, backgroundColor: "#f3f4f3", padding: "6px 8px", borderRadius: 6, margin: "6px 0 0" }}>
                                      "{log.details}"
                                    </p>
                                  )}
                                </div>
                                <span style={{ fontSize: 10, fontWeight: 700, color: "#78716c", whiteSpace: "nowrap", fontFamily: "monospace" }}>
                                  {log.createdAt ? new Date(log.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : ""}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ── 5 · RODAPÉ de atalhos: só no desktop — no mobile não há
                teclado físico e o rodapé roubava altura do modal. */}
            {!isMobile && (
              <div style={{ padding: "12px 20px", backgroundColor: "#fafaf9", borderTop: "1px solid #f0efee", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: TI.secondary, textTransform: "uppercase", letterSpacing: "0.08em" }}>Atalhos:</span>
                  {([
                    ["Enter", "liberar"],
                    ["D", "devolver"],
                    ["← →", "peça anterior / próxima"],
                    ["Esc", "fechar"],
                  ] as const).map(([tecla, oque]) => (
                    <Fragment key={tecla}>
                      <span style={{ fontSize: 10, fontWeight: 900, backgroundColor: "#e7e5e4", padding: "2px 6px", borderRadius: 6, color: TI.text, whiteSpace: "nowrap" }}>{tecla}</span>
                      <span style={{ fontSize: 10, color: TI.secondary, whiteSpace: "nowrap" }}>{oque}</span>
                    </Fragment>
                  ))}
                </div>
              </div>
            )}
          </div>
          </FreezeWhileClosing>
        </DialogContent>
      </Dialog>

      {/* ── CONFIRM DIALOGS ─────────────────────────────────────────────── */}

      {/* Release single */}
      <AlertDialog open={releaseConfirmOpen} onOpenChange={setReleaseConfirmOpen}>
        <AlertDialogContent className="review-confirm-content">
          {/* POR QUE congelar aqui: o mesmo onSuccess que fecha esta confirmação
              também faz `setSelectedItem(null)` — e é `selectedItem` que
              escreve o ID e o tipo da peça na descrição. Sem congelar, a frase
              inteira some antes do diálogo terminar de sair. */}
          <FreezeWhileClosing open={releaseConfirmOpen}>
          <AlertDialogHeader>
            <AlertDialogTitle>Liberar para Produção</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedItem && <span><strong>{selectedItem.displayId}</strong> — {selectedItem.type} será liberado para produção.</span>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-release-cancel">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedItem && creatorReviewMutation.mutate({ itemId: selectedItem.id })}
              disabled={creatorReviewMutation.isPending}
              style={{ backgroundColor: TI.text, color: "#fff" }}
              data-testid="button-release-confirm"
            >
              {creatorReviewMutation.isPending ? "Liberando..." : "Liberar"}
            </AlertDialogAction>
          </AlertDialogFooter>
          </FreezeWhileClosing>
        </AlertDialogContent>
      </AlertDialog>

      {/* Return to Arte from card (quick) */}
      <AlertDialog open={returnConfirmOpen} onOpenChange={setReturnConfirmOpen}>
        <AlertDialogContent className="review-confirm-content">
          {/* POR QUE congelar aqui: o onSuccess da devolução fecha este diálogo,
              zera `selectedItem` (o ID na descrição) e ainda esvazia
              `returnObservations` — o texto que a pessoa acabou de escrever
              sumia do textarea à vista, no meio do fade. */}
          <FreezeWhileClosing open={returnConfirmOpen}>
          <AlertDialogHeader>
            <AlertDialogTitle>Devolver para Arte</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedItem && <span><strong>{selectedItem.displayId}</strong> será devolvido à equipe de Arte.</span>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div style={{ padding: 0 }}>
            {seletorDestino}
            <textarea
              placeholder="Descreva as alterações necessárias..."
              value={returnObservations}
              onChange={e => setReturnObservations(e.target.value)}
              data-testid="textarea-return-quick"
              className="w-full min-h-20 p-2 border rounded-md bg-background text-foreground resize-none text-sm"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-return-cancel" onClick={() => { setReturnObservations(""); }}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedItem && returnToArteMutation.mutate({ itemId: selectedItem.id, notes: returnObservations, destino: destinoDevolucao })}
              disabled={returnToArteMutation.isPending || motivoCurto(returnObservations)}
              title={motivoCurto(returnObservations) ? avisoMotivoCurto : undefined}
              style={{ backgroundColor: TI.text, color: "#fff" }}
              data-testid="button-return-confirm"
            >
              {returnToArteMutation.isPending ? "Devolvendo..." : "Devolver para Arte"}
            </AlertDialogAction>
          </AlertDialogFooter>
          </FreezeWhileClosing>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk release */}
      <AlertDialog open={bulkReleaseConfirmOpen} onOpenChange={setBulkReleaseConfirmOpen}>
        <AlertDialogContent className="review-confirm-content">
          {/* POR QUE congelar aqui: o onSuccess troca `selectedItemIds` pelo
              conjunto do que FALHOU e fecha o diálogo no mesmo commit. O
              título é contado a partir desse conjunto — "Liberar 12 itens"
              virava "Liberar 0 itens" enquanto a caixa saía de cena. */}
          <FreezeWhileClosing open={bulkReleaseConfirmOpen}>
          <AlertDialogHeader>
            <AlertDialogTitle>Liberar {selecaoLote.vivas.length} iten{selecaoLote.vivas.length !== 1 ? "s" : ""}</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja liberar {selecaoLote.vivas.length} {selecaoLote.vivas.length === 1 ? "item" : "itens"} para produção?
              {selecaoLote.finalizadas > 0 && (
                <span data-testid="aviso-bulk-release-finalizadas" style={{ display: "block", marginTop: 8 }}>
                  {avisoLoteFinalizadas()}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-bulk-release-cancel">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => bulkReleaseMutation.mutate(selecaoLote.vivas)}
              disabled={bulkReleaseMutation.isPending || selecaoLote.vivas.length === 0}
              style={{ backgroundColor: TI.text, color: "#fff" }}
              data-testid="button-bulk-release-confirm"
            >
              {bulkReleaseMutation.isPending
                ? "Liberando..."
                : selecaoLote.finalizadas > 0 ? `Liberar as ${selecaoLote.vivas.length}` : "Liberar Todos"}
            </AlertDialogAction>
          </AlertDialogFooter>
          </FreezeWhileClosing>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk return */}
      <AlertDialog open={bulkReturnConfirmOpen} onOpenChange={setBulkReturnConfirmOpen}>
        <AlertDialogContent className="review-confirm-content">
          {/* POR QUE congelar aqui: o onSuccess fecha, reescreve
              `selectedItemIds` (que conta o título) e esvazia
              `bulkReturnObservations` (que é o valor do textarea) no mesmo
              commit — dois campos visíveis apagando durante o fade. */}
          <FreezeWhileClosing open={bulkReturnConfirmOpen}>
          <AlertDialogHeader>
            <AlertDialogTitle>Devolver {selecaoLote.vivas.length} iten{selecaoLote.vivas.length !== 1 ? "s" : ""} para Arte</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja devolver {selecaoLote.vivas.length} {selecaoLote.vivas.length === 1 ? "item" : "itens"} para a Arte?
              {selecaoLote.finalizadas > 0 && (
                <span data-testid="aviso-bulk-return-finalizadas" style={{ display: "block", marginTop: 8 }}>
                  {avisoLoteFinalizadas()}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div style={{ padding: 0 }}>
            {seletorDestino}
            <textarea
              placeholder="Descreva o motivo da devolução..."
              value={bulkReturnObservations}
              onChange={e => setBulkReturnObservations(e.target.value)}
              data-testid="textarea-bulk-return"
              className="w-full min-h-20 p-2 border rounded-md bg-background text-foreground resize-none text-sm"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-bulk-return-cancel">Manter Itens</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault(); // a mutation controla o fechamento (mantém aberto em erro)
                bulkReturnMutation.mutate({ ids: selecaoLote.vivas, notes: bulkReturnObservations, destino: destinoDevolucao });
              }}
              disabled={bulkReturnMutation.isPending || motivoCurto(bulkReturnObservations) || selecaoLote.vivas.length === 0}
              title={motivoCurto(bulkReturnObservations) ? avisoMotivoCurto : undefined}
              style={{ backgroundColor: TI.text, color: "#fff" }}
              data-testid="button-bulk-return-confirm"
            >
              {bulkReturnMutation.isPending ? "Devolvendo..." : "Devolver para Arte"}
            </AlertDialogAction>
          </AlertDialogFooter>
          </FreezeWhileClosing>
        </AlertDialogContent>
      </AlertDialog>

      {/* Diálogo: escolher reaproveitamento total ou parcial.
          Era um overlay <div> montado à mão: sem Esc, sem armadilha de foco
          (o Tab passeava pela lista atrás), sem devolver o foco ao fechar, e a
          página continuava rolando por baixo. A largura ainda vinha de
          `window.innerWidth` lido na renderização — girar o celular deixava o
          painel no tamanho antigo. */}
      <Dialog open={!!reuseDialogItemId} onOpenChange={o => { if (!o) setReuseDialogItemId(null); }}>
        <DialogContent className={HIDE_NATIVE_CLOSE} style={modalSurface(420)}>
          {/* POR QUE congelar aqui: o corpo inteiro é derivado de
              `reuseDialogItemId` (e o item vem de `pendingItems`, que as três
              invalidações do onSuccess recarregam). Ao confirmar, o id vira
              null, a busca não acha nada e o modal fica LITERALMENTE VAZIO
              durante toda a animação de saída. */}
          <FreezeWhileClosing open={!!reuseDialogItemId}>
          {(() => {
            const dialogItem = pendingItems.find(i => i.id === reuseDialogItemId);
            if (!dialogItem) return null;
            const qty = Number(dialogItem.quantity) || 1;
            return (
              <>
                <DialogTitle className="sr-only">Reaproveitamento</DialogTitle>
                <DialogDescription className="sr-only">
                  Escolha reaproveitar todas as unidades ou apenas parte delas
                </DialogDescription>
                <ModalHeader
                  variant="confirm"
                  icon={Recycle}
                  tint="#15803d"
                  title="Reaproveitamento"
                  subtitle={`${dialogItem.displayId} · ${dialogItem.type} · ${qty} un.`}
                  onClose={() => setReuseDialogItemId(null)}
                />
                {/* ALTURA: cabeçalho 80 + as duas opções de reaproveitamento
                    ~240 = 320px, contra 397 disponíveis numa janela de 445 —
                    este modal NÃO cortava. O scrollport é preventivo e
                    obrigatório: o `modalSurface` passou a trazer teto COM
                    `overflow: hidden`, e a segunda opção só aparece quando a
                    quantidade é maior que 1, então o corpo é elástico. */}
                <div style={{ padding: "20px 24px", overflowY: "auto", flex: "1 1 auto", minHeight: 0 }}>

              {/* Opção: reaproveitar tudo */}
              <button
                onClick={() => {
                  // Aberto de dentro da ficha: decidir avança para a próxima da
                  // fila, como Liberar e Devolver — ou fecha, se era a última.
                  if (modalOpen && selectedItem?.id === dialogItem.id && !marcarAvanco()) { setModalOpen(false); setSelectedItem(null); }
                  toggleReuseMutation.mutate({ itemId: dialogItem.id, isReuse: true });
                  setReuseDialogItemId(null);
                }}
                disabled={toggleReuseMutation.isPending || partialReuseMutation.isPending}
                style={{
                  width: "100%", padding: "12px 16px", marginBottom: 10,
                  backgroundColor: "#15803d", color: "#fff",
                  border: "none", borderRadius: 8, cursor: "pointer",
                  fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                }}
              >
                <Recycle style={{ width: 13, height: 13 }} />
                Reaproveitar tudo ({qty} un.) — pula produção
              </button>

              {/* Opção: reaproveitar parcialmente (só aparece se qty > 1) */}
              {qty > 1 && (
                <div style={{ border: "1px solid #e7e5e4", borderRadius: 8, padding: "14px 16px" }}>
                  <p style={{ margin: "0 0 10px", fontSize: 11, fontWeight: 700, color: "#746e69", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    Reaproveitar parcialmente
                  </p>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <input
                      type="number"
                      min={1}
                      max={qty - 1}
                      value={partialReuseQty}
                      onChange={e => setPartialReuseQty(Math.max(1, Math.min(qty - 1, parseInt(e.target.value) || 1)))}
                      aria-label="Unidades reaproveitadas"
                      data-testid="input-partial-reuse-qty"
                      style={{ width: 64, height: 34, padding: "0 8px", borderRadius: 6, border: "1px solid #d4d4d0", fontSize: 15, fontWeight: 700, textAlign: "center" }}
                    />
                    <span style={{ fontSize: 13, color: "#746e69" }}>de {qty} un. reaproveitadas</span>
                  </div>
                  <p style={{ margin: "0 0 10px", fontSize: 11, color: "#746e69" }}>
                    As outras <strong>{qty - partialReuseQty}</strong> un. seguirão para produção normal.
                  </p>
                  <button
                    onClick={() => {
                      if (modalOpen && selectedItem?.id === dialogItem.id && !marcarAvanco()) { setModalOpen(false); setSelectedItem(null); }
                      partialReuseMutation.mutate({ itemId: dialogItem.id, reuseQty: partialReuseQty });
                    }}
                    disabled={toggleReuseMutation.isPending || partialReuseMutation.isPending}
                    style={{
                      width: "100%", padding: "10px 16px",
                      backgroundColor: "#0c0a09", color: "#fff",
                      border: "none", borderRadius: 6, cursor: "pointer",
                      fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em",
                    }}
                  >
                    {partialReuseMutation.isPending ? "Salvando..." : `Confirmar ${partialReuseQty} un. reaproveitadas`}
                  </button>
                </div>
              )}

                  <button
                    onClick={() => setReuseDialogItemId(null)}
                    style={{ width: "100%", marginTop: 12, height: 36, background: "none", border: "none", fontSize: 13, color: "#746e69", cursor: "pointer" }}
                  >
                    Cancelar
                  </button>
                </div>
              </>
            );
          })()}
          </FreezeWhileClosing>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteConfirmItemId} onOpenChange={open => { if (!open) setDeleteConfirmItemId(null); }}>
        <AlertDialogContent className="review-confirm-content">
          {/* POR QUE congelar aqui: o onSuccess da exclusão invalida, toasta e
              zera `deleteConfirmItemId` — que é quem escreve o ID da peça na
              descrição. Sem congelar, "A peça SOL-123 será excluída" cai para
              o texto genérico durante a saída. */}
          <FreezeWhileClosing open={!!deleteConfirmItemId}>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir peça</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteConfirmItemId && (() => {
                const item = pendingItems.find(i => i.id === deleteConfirmItemId);
                return item ? <span>A peça <strong>{item.displayId}</strong> será permanentemente excluída. Esta ação não pode ser desfeita.</span> : "Esta peça será permanentemente excluída.";
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-delete-cancel">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault(); // a mutation controla o fechamento (mantém aberto em erro)
                if (deleteConfirmItemId) deleteItemMutation.mutate(deleteConfirmItemId);
              }}
              disabled={deleteItemMutation.isPending}
              className="bg-destructive text-destructive-foreground"
              data-testid="button-delete-confirm"
            >
              {deleteItemMutation.isPending ? "Excluindo..." : "Excluir Peça"}
            </AlertDialogAction>
          </AlertDialogFooter>
          </FreezeWhileClosing>
        </AlertDialogContent>
      </AlertDialog>

      {/* Aumentar quantidade — mesmo modal das outras telas. Aqui ele é a saída
          do 409 USE_COMPLEMENT: a peça saiu de revisão e entrou em produção
          enquanto o modal estava aberto. */}
      <AumentarQuantidadeDialog
        item={complementItem}
        event={complementItem ? (events as any[]).find((e: any) => e.id === complementItem.eventId) ?? null : null}
        open={!!complementItem}
        sugestao={complementSugestao}
        onOpenChange={(o) => { if (!o) { setComplementItem(null); setComplementSugestao(null); } }}
      />

    </div>
  );
}
