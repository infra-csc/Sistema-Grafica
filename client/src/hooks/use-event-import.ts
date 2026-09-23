// Hook extraído de event-detail.tsx: estado + mutations relacionadas à
// importação de planilhas Excel (com preview/revisão) e à clonagem de itens
// entre eventos. Mantém as mesmas query keys, invalidateQueries e toasts
// que existiam originalmente na página.
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { CabecalhoDoKit } from "@shared/kit";
import type { PecaLidaDaPlanilha, PreviaDaPlanilha, RespostaDaClonagem, RespostaDaImportacao } from "@shared/api";
import type { LinhaDaImportacao } from "@/components/importar-planilha/tipos";
import type { DestinoDaImportacao } from "@/components/kit/destino-da-importacao";

interface EventSponsorListEntry {
  sponsorId: string;
  quota: string;
  name: string;
}

/** A regra de cota como o palpite de patrocinador a lê (linha de event_quota_rules). */
interface RegraDeCotaDoPalpite {
  quota: string;
  itemTypes?: string[] | null;
}

/** Linha da revisão da planilha: a peça lida + o id da linha e os palpites.
 *  É a MESMA linha que a tabela editável usa (célula editada vira texto), para
 *  a tela e o hook não descreverem a mesma coisa de dois jeitos. */
export type LinhaDaPrevia = LinhaDaImportacao;

/** Mensagem de erro de uma resposta `{ error }` da API (ou nada). */
const erroDaResposta = (corpo: unknown): string | undefined => {
  const e = corpo && typeof corpo === "object" ? (corpo as { error?: unknown }).error : undefined;
  return typeof e === "string" ? e : undefined;
};

/** Texto do erro lançado pela mutation (toast). */
const mensagemDoErro = (erro: unknown): string | undefined => (erro instanceof Error ? erro.message : undefined);

interface UseEventImportParams {
  eventId: string | undefined;
  eventSponsorsList: EventSponsorListEntry[];
  eventQuotaRules: readonly RegraDeCotaDoPalpite[];
}

export function useEventImport({ eventId, eventSponsorsList, eventQuotaRules }: UseEventImportParams) {
  const { toast } = useToast();

  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<{ total: number; groups: string[] } | null>(null);
  const [importPreviewItems, setImportPreviewItems] = useState<LinhaDaPrevia[] | null>(null);
  const [importPreviewOpen, setImportPreviewOpen] = useState(false);
  const [importFileName, setImportFileName] = useState<string>("");
  const [importSearch, setImportSearch] = useState("");
  // Cabeçalho da planilha do Kit (datas, versão), quando a planilha é do Kit.
  const [importKit, setImportKit] = useState<CabecalhoDoKit | null>(null);
  // Linhas da planilha que ficaram de fora do preview, e por quê.
  const [importIgnoradas, setImportIgnoradas] = useState<{ linha: number; motivo: string }[]>([]);

  // ── Preview Excel mutation (parse → show review modal) ─────────────────
  const previewXlsxMutation = useMutation({
    mutationFn: async ({ file }: { file: File }): Promise<PreviaDaPlanilha> => {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(`/api/events/${eventId}/preview-xlsx`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!response.ok) {
        const err: unknown = await response.json();
        throw new Error(erroDaResposta(err) || "Erro ao processar arquivo");
      }
      return response.json();
    },
    onSuccess: (data) => {
      // Normalize text for matching (strip accents, lowercase)
      const norm = (s: string) =>
        (s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').trim();

      const suggestSponsor = (item: PecaLidaDaPlanilha): string | null => {
        const descNorm = norm(item.description ?? '');
        // 1. Try to find sponsor name in description
        for (const es of eventSponsorsList) {
          const nameNorm = norm(es.name);
          if (nameNorm.length > 2 && descNorm.includes(nameNorm)) return es.sponsorId;
        }
        // 2. Fallback: quota rules → find quotas that include this item type → first matching event sponsor
        const itemTypeNorm = norm(item.type ?? '');
        const matchingQuotas = eventQuotaRules
          .filter((r) => (r.itemTypes ?? []).some((t: string) => norm(t) === itemTypeNorm))
          .map((r) => r.quota);
        for (const quota of matchingQuotas) {
          const match = eventSponsorsList.find(es => es.quota === quota);
          if (match) return match.sponsorId;
        }
        return null;
      };

      const withIds = data.items.map((item, i): LinhaDaPrevia => {
        const suggested = suggestSponsor(item);
        const autoReuse = /reaproveitar/i.test(item.observations ?? '');
        // O parser já sugere os patrocinadores da peça (descrição + coluna
        // "Patrocinadores" da exportação); o palpite por cota/descrição
        // daqui só entra quando ele não achou nenhum.
        const doParser: string[] = Array.isArray(item.suggestedSponsorIds) ? item.suggestedSponsorIds : [];
        return {
          ...item,
          _id: `row-${i}`,
          suggestedSponsorIds: doParser.length > 0 ? doParser : (suggested ? [suggested] : []),
          // A coluna "Reaprov." da exportação ("Sim") vale tanto quanto a
          // palavra nas observações.
          reuse: item.reuse === true || autoReuse,
        };
      });
      setImportPreviewItems(withIds);
      setImportIgnoradas(Array.isArray(data.ignoradas) ? data.ignoradas : []);
      setImportKit(data.kit ?? null);
      setImportFileName(data.fileName || "");
      setImportSearch("");
    },
    onError: (error) => {
      toast({ title: "Não foi possível ler a planilha", description: mensagemDoErro(error), variant: "destructive" });
    },
  });

  // ── Confirm import mutation (save reviewed items) ─────────────────────
  //
  // A GUARDA DE DUPLICATA QUE MORAVA AQUI NUNCA RODOU.
  //
  // Este ramo esperava um 409 `duplicate_detected`, e o servidor nunca o
  // manda: `confirm-import` lê `{ items, fileName }` e mais nada — o `force`
  // viajava no corpo e era ignorado. Uma guarda que não roda é pior que
  // guarda nenhuma, porque ocupa o lugar dela: enquanto o código dizia que a
  // reimportação estava coberta, reimportar a mesma planilha duplicava o
  // evento inteiro em silêncio.
  //
  // A detecção passou para o PREVIEW, no diálogo — antes de importar, contra
  // as peças que o evento já tem, e dizendo QUAIS se repetem. Ver
  // `chaveDaPeca` em components/import-xlsx-dialog.tsx.
  const confirmImportMutation = useMutation({
    mutationFn: async ({ items, fileName, destino }: { items: readonly object[]; fileName: string; destino?: DestinoDaImportacao }): Promise<RespostaDaImportacao> => {
      const response = await apiRequest<RespostaDaImportacao>("POST", `/api/events/${eventId}/confirm-import`, {
        items,
        fileName,
        // Kit (14/09): remessa existente ou nova (o servidor cria e liga).
        ...(destino?.tipo === "remessa" ? { kitRemessaId: destino.kitRemessaId } : {}),
        ...(destino?.tipo === "nova" ? { kitNovaRemessa: destino.kitNovaRemessa } : {}),
      });
      if (!response.ok) {
        const err: unknown = await response.json();
        throw new Error(erroDaResposta(err) || "Erro ao importar");
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/items", eventId] });
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0] ?? "").startsWith("/api/kit/remessas") });
      setImportDialogOpen(false);
      setImportPreviewItems(null);
      setImportIgnoradas([]);
      setImportKit(null);
      setImportFile(null);
      setImportFileName("");
      setImportSearch("");
      toast({
        title: `${data.imported} ${data.imported === 1 ? "peça importada" : "peças importadas"}`,
        description: "Entraram em Rascunho — envie para a vinculação quando a lista estiver pronta.",
      });
    },
    onError: (error) => {
      toast({ title: "Não foi possível importar as peças", description: mensagemDoErro(error), variant: "destructive" });
    },
  });

  return {
    importDialogOpen,
    setImportDialogOpen,
    importFile,
    setImportFile,
    importPreview,
    setImportPreview,
    importPreviewItems,
    setImportPreviewItems,
    importPreviewOpen,
    setImportPreviewOpen,
    importFileName,
    setImportFileName,
    importSearch,
    setImportSearch,
    previewXlsxMutation,
    confirmImportMutation,
    importKit,
    importIgnoradas,
  };
}

interface UseEventCloneParams {
  eventId: string | undefined;
}

export function useEventClone({ eventId }: UseEventCloneParams) {
  const { toast } = useToast();

  const [cloneDialogOpen, setCloneDialogOpen] = useState(false);
  const [cloneSourceId, setCloneSourceId] = useState<string>("");

  // ── Clone items mutation ───────────────────────────────────────────────
  const cloneItemsMutation = useMutation({
    // `itemIds` é a seleção do dialog (01/09); sem ela o servidor clona tudo,
    // que é o que o fluxo de criar-evento-clonando continua fazendo.
    mutationFn: async ({ sourceEventId, itemIds }: { sourceEventId: string; itemIds?: string[] }): Promise<RespostaDaClonagem> => {
      const response = await apiRequest<RespostaDaClonagem>("POST", `/api/events/${eventId}/clone-items`, { sourceEventId, itemIds });
      if (!response.ok) {
        const err: unknown = await response.json();
        throw new Error(erroDaResposta(err) || "Erro ao clonar");
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/items", eventId] });
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      setCloneDialogOpen(false);
      setCloneSourceId("");
      toast({
        title: `${data.cloned} ${data.cloned === 1 ? "peça clonada" : "peças clonadas"}`,
        description: "Entraram em Rascunho — envie para a vinculação quando a lista estiver pronta.",
      });
    },
    onError: (error) => {
      toast({ title: "Não foi possível clonar as peças", description: mensagemDoErro(error), variant: "destructive" });
    },
  });

  return {
    cloneDialogOpen,
    setCloneDialogOpen,
    cloneSourceId,
    setCloneSourceId,
    cloneItemsMutation,
  };
}
