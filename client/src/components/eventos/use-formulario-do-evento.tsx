// O formulário de criar / editar / duplicar evento: estado, snapshot para a
// pergunta de descarte, patrocinadores do evento, validação e gravação.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import type { EventSponsor, Sponsor } from "@shared/schema";
import { diaDoPrazoMolde } from "@shared/prazo-molde";
import { runInBatches } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { DEFAULT_DEADLINES, MARCO_FIELDS } from "./constantes";
import { toDateStr } from "./formatos";
import type { AcaoSobreEvento, EventoDaLista, FormularioDoEvento } from "./tipos";

/** Vínculo como GET /api/events/:id/sponsors devolve (só o que o formulário lê). */
type VinculoDoEvento = Pick<EventSponsor, "sponsorId" | "quota">;

const mensagemDoErro = (error: unknown, padrao: string) =>
  (error instanceof Error && error.message) || padrao;

export function useFormularioDoEvento({ sponsors, sponsorById, soPatrocinadores }: {
  sponsors: Sponsor[];
  sponsorById: Map<string, Sponsor>;
  /** Atendimento: a janela abre só com patrocinadores e cotas. */
  soPatrocinadores: boolean;
}) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState<FormularioDoEvento>({
    name: "",
    priority: "",
    startDate: "",
    truckDepartureDate: "",
    // PRAZO DO MOLDE (22/09): "YYYY-MM-DD" ou "" — opcional, só para evento com molde.
    prazoMolde: "",
    ...DEFAULT_DEADLINES,
  });
  const [prazosExpanded, setPrazosExpanded] = useState(false);
  const [selectedSponsorIds, setSelectedSponsorIds] = useState<string[]>([]);
  const [sponsorQuotaMap, setSponsorQuotaMap] = useState<Record<string, string>>({});
  const [sponsorsLoading, setSponsorsLoading] = useState(false);
  const [sponsorsError, setSponsorsError] = useState(false);
  const [sponsorSearch, setSponsorSearch] = useState("");
  const [editingEvent, setEditingEvent] = useState<EventoDaLista | null>(null);
  // Duplicação: mesmo modal, modo "criar" pré-preenchido com os prazos,
  // patrocinadores e cotas de um evento existente.
  const [duplicateSource, setDuplicateSource] = useState<EventoDaLista | null>(null);
  const [copyItems, setCopyItems] = useState(false);
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);
  const [openStartDate, setOpenStartDate] = useState(false);
  const [openTruckDate, setOpenTruckDate] = useState(false);
  const [openPrazoKey, setOpenPrazoKey] = useState<string | null>(null);

  // Quem estava marcado quando a lista apareceu. Só isto decide quem fica
  // no topo — ver o comentário longo na montagem da lista.
  const selecionadosRef = useRef<string[]>([]);
  selecionadosRef.current = selectedSponsorIds;
  const ordemFixadaNoTopo = useMemo(
    () => new Set(selecionadosRef.current),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, sponsorSearch, sponsors],
  );

  const modalMode: 'create' | 'edit' | 'duplicate' =
    editingEvent ? 'edit' : duplicateSource ? 'duplicate' : 'create';
  // A janela aberta pelo Atendimento: só patrocinadores e cotas.
  const soPatrocinadoresNoModal = modalMode === 'edit' && soPatrocinadores;

  // ── Snapshot do formulário ────────────────────────────────────────────────
  // `formDirty` comparado contra um SNAPSHOT em vez de "está em modo edição".
  // Antes, abrir a edição já contava como sujo por definição — e conferir é o
  // uso mais frequente da edição, então Esc ficava travado sem nenhuma
  // alteração feita.
  const formSignature = useCallback((
    fd: FormularioDoEvento,
    ids: string[],
    quotas: Record<string, string>,
  ) => JSON.stringify({
    ...fd,
    sponsors: [...ids].sort().map((id) => `${id}:${quotas[id] || ''}`),
  }), []);
  const [baselineSig, setBaselineSig] = useState<string>("");
  // Ref para o baseline poder ser recalculado quando os patrocinadores do
  // evento chegam (a busca é assíncrona e o formData já está preenchido).
  const formDataRef = useRef(formData);
  formDataRef.current = formData;

  const currentSig = formSignature(formData, selectedSponsorIds, sponsorQuotaMap);
  const formDirty = currentSig !== baselineSig;

  const resetForm = useCallback(() => {
    const empty: FormularioDoEvento = { name: "", priority: "", startDate: "", truckDepartureDate: "", prazoMolde: "", ...DEFAULT_DEADLINES };
    setFormData(empty);
    setSelectedSponsorIds([]);
    setSponsorQuotaMap({});
    setSponsorSearch("");
    setCopyItems(false);
    return empty;
  }, []);

  /**
   * "Novo Evento" (cabeçalho e estado vazio). Fechar o modal não limpa nada
   * (ver handleCloseDialog): quem abre é que inicializa — sem as três linhas
   * de erro, carregamento e prazos, um erro ou um bloco de prazos aberto na
   * sessão anterior reapareceria aqui.
   */
  const abrirNovoEvento = () => {
    setEditingEvent(null);
    setDuplicateSource(null);
    const empty = resetForm();
    setBaselineSig(formSignature(empty, [], {}));
    setSponsorsError(false);
    setSponsorsLoading(false);
    setPrazosExpanded(false);
    setOpen(true);
  };

  /**
   * FECHAR SÓ FECHA. Nenhum estado do formulário é zerado aqui.
   *
   * O modal do Radix continua MONTADO durante a animação de saída (Presence).
   * Zerar formData, editingEvent, patrocinadores e prazos no mesmo clique
   * fazia o conteúdo se reconstruir enquanto ele saía — e o ciclo de
   * attach/detach de ref do Presence entrava em laço: React #185
   * ("Maximum update depth exceeded"), tela branca com "Erro de renderização"
   * ao cancelar, ao fechar no X e depois de salvar.
   *
   * A limpeza não é necessária porque as TRÊS portas de entrada (Novo Evento,
   * handleEdit e handleDuplicate) já inicializam tudo antes de abrir. Se
   * alguma porta nova aparecer, ela também precisa inicializar — não volte a
   * limpar aqui.
   */
  const handleCloseDialog = useCallback(() => {
    setOpen(false);
    setConfirmDiscardOpen(false);
  }, []);

  /** Saída ÚNICA do modal: X, Esc e clique-fora passam todos por aqui. */
  const requestCloseDialog = useCallback(() => {
    if (formDirty) {
      setConfirmDiscardOpen(true);
      return;
    }
    handleCloseDialog();
  }, [formDirty, handleCloseDialog]);

  // ── Mutations ─────────────────────────────────────────────────────────────
  /** Payload aceito por POST/PATCH /api/events. `priority` viaja à parte. */
  const eventPayload = (fd: FormularioDoEvento) => ({
    name: fd.name,
    startDate: fd.startDate,
    truckDepartureDate: fd.truckDepartureDate,
    deadlineListaImagens: fd.deadlineListaImagens,
    deadlineEntregaLayouts: fd.deadlineEntregaLayouts,
    deadlineAprovacaoLayout: fd.deadlineAprovacaoLayout,
    deadlineFinalizacao: fd.deadlineFinalizacao,
    deadlineRevisaoLista: fd.deadlineRevisaoLista,
    deadlineProducaoGrafica: fd.deadlineProducaoGrafica,
    // Vazio vai como null: limpa o prazo do molde (é opcional).
    prazoMolde: fd.prazoMolde || null,
  });

  const createEventMutation = useMutation({
    mutationFn: async ({ fd, cloneFrom }: { fd: FormularioDoEvento; cloneFrom: string | null }) => {
      let response: Response;
      try {
        // `priority` só entra quando definida: insertEventSchema aceita o enum
        // dos 4 níveis e rejeita string vazia com 400.
        const body: Record<string, unknown> = eventPayload(fd);
        if (fd.priority) body.priority = fd.priority;
        response = await apiRequest("POST", "/api/events", body);
      } catch (error) {
        throw new Error(mensagemDoErro(error, "Erro ao criar evento"));
      }
      const event = await response.json() as EventoDaLista;

      // Vincular patrocinadores em lotes de 5 (runInBatches, lib/utils): 25
      // patrocinadores em Promise.all abriam 25 conexões simultâneas, cada uma
      // ainda fazendo getEvent + getSponsor para o audit log — a causa
      // documentada de falhas intermitentes em massa.
      // Se o evento JÁ foi criado, uma falha aqui não vira erro do fluxo (o
      // toast de erro sugeriria tentar de novo e duplicar o evento) — coletamos
      // os NOMES que falharam para o onSuccess avisar quais revisar.
      const failedSponsors: string[] = [];
      if (selectedSponsorIds.length > 0) {
        await runInBatches(selectedSponsorIds, async (sponsorId) => {
          try {
            await apiRequest("POST", `/api/events/${event.id}/sponsors`, { sponsorId, quota: sponsorQuotaMap[sponsorId] || null });
          } catch {
            failedSponsors.push(sponsorById.get(sponsorId)?.name || sponsorId);
          }
        }, 5);
      }

      // Duplicação com peças: reaproveita o endpoint de clonagem que o detalhe
      // do evento já usa. Falhar aqui também não invalida o evento criado.
      let clonedItems = 0;
      // Canceladas e complementos o servidor não copia (o evento novo não
      // renasce com o que o anterior desistiu) — o toast diz quantas.
      let deixadasDeFora = 0;
      let cloneFailed = false;
      if (cloneFrom) {
        try {
          const res = await apiRequest("POST", `/api/events/${event.id}/clone-items`, { sourceEventId: cloneFrom });
          const data = await res.json() as { cloned?: number; deixadasDeFora?: number } | null;
          clonedItems = data?.cloned ?? 0;
          deixadasDeFora = data?.deixadasDeFora ?? 0;
        } catch {
          cloneFailed = true;
        }
      }

      return { event, failedSponsors, clonedItems, deixadasDeFora, cloneFailed };
    },
    onSuccess: ({ event, failedSponsors, clonedItems, deixadasDeFora, cloneFailed }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      handleCloseDialog();
      const parts: string[] = [];
      // "em Rascunho": as cópias só andam depois do envio, feito no evento.
      if (clonedItems > 0) parts.push(`${clonedItems} ${clonedItems === 1 ? 'peça copiada' : 'peças copiadas'} em Rascunho — abra o evento para revisar e enviar`);
      if (deixadasDeFora > 0) parts.push(`${deixadasDeFora} ${deixadasDeFora === 1 ? 'ficou de fora (cancelada ou complemento)' : 'ficaram de fora (canceladas ou complementos)'}`);
      if (cloneFailed) parts.push("as peças não puderam ser copiadas — use 'Clonar peças' dentro do evento");
      if (failedSponsors.length > 0) parts.push(`não foi possível vincular: ${failedSponsors.join(", ")}`);
      toast({
        title: "Evento criado",
        // Sem ressalvas, a descrição aponta o PASSO SEGUINTE (a ação ao lado
        // leva até ele) — "criado com sucesso" só repetia o título.
        description: parts.length > 0 ? parts.join(" · ") : `"${event.name}" está pronto para receber a lista de peças.`,
        // O passo seguinte à criação é SEMPRE montar a lista de imagens — sem
        // esta ação o usuário voltava para a grade e precisava caçar o card
        // recém-criado, que pode estar fora do filtro ativo.
        action: (
          <ToastAction altText="Abrir evento" onClick={() => setLocation(`/eventos/${event.id}`)}>
            Abrir evento
          </ToastAction>
        ),
        variant: "success",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Não foi possível criar o evento", description: error.message, variant: "destructive" });
    },
  });

  const updateEventMutation = useMutation({
    mutationFn: async ({ id, fd, soPatrocinadores: soVinculos = false }: { id: string; fd: FormularioDoEvento; soPatrocinadores?: boolean }) => {
      const failedSponsors: string[] = [];
      try {
        // Só patrocinadores (Atendimento): o evento em si não é gravado.
        if (!soVinculos) await apiRequest("PATCH", `/api/events/${id}`, eventPayload(fd));

        // Prioridade tem rota própria (gate e audit log próprios) e é a única
        // que aceita "" para REMOVER — insertEventSchema rejeitaria a string
        // vazia com 400.
        const originalPriority = editingEvent?.priority || "";
        if (!soVinculos && (fd.priority || "") !== originalPriority) {
          await apiRequest("PATCH", `/api/events/${id}/priority`, { priority: fd.priority || "" });
        }

        const currentSponsorsRes = await apiRequest("GET", `/api/events/${id}/sponsors`);
        const currentSponsors = await currentSponsorsRes.json() as VinculoDoEvento[];
        const currentSponsorIds = currentSponsors.map((es) => es.sponsorId);
        const currentQuotaMap: Record<string, string> = {};
        currentSponsors.forEach((es) => { currentQuotaMap[es.sponsorId] = es.quota || ''; });

        const toRemove = currentSponsorIds.filter((sid: string) => !selectedSponsorIds.includes(sid));
        const toAdd = selectedSponsorIds.filter((sid: string) => !currentSponsorIds.includes(sid));
        const toUpdateQuota = selectedSponsorIds.filter(
          (sid: string) => currentSponsorIds.includes(sid) && (sponsorQuotaMap[sid] || '') !== (currentQuotaMap[sid] || '')
        );

        // Mesma razão do create: lotes de 5 em vez de um Promise.all com todas
        // as operações de vínculo de uma vez.
        const operations: { run: () => Promise<unknown>; name: string }[] = [
          ...toRemove.map((sponsorId: string) => ({
            name: sponsorById.get(sponsorId)?.name || sponsorId,
            run: () => apiRequest("DELETE", `/api/events/${id}/sponsors/${sponsorId}`),
          })),
          ...toAdd.map((sponsorId: string) => ({
            name: sponsorById.get(sponsorId)?.name || sponsorId,
            run: () => apiRequest("POST", `/api/events/${id}/sponsors`, { sponsorId, quota: sponsorQuotaMap[sponsorId] || null }),
          })),
          ...toUpdateQuota.map((sponsorId: string) => ({
            name: sponsorById.get(sponsorId)?.name || sponsorId,
            run: () => apiRequest("PATCH", `/api/events/${id}/sponsors/${sponsorId}`, { quota: sponsorQuotaMap[sponsorId] || null }),
          })),
        ];

        if (operations.length > 0) {
          await runInBatches(operations, async (op) => {
            try { await op.run(); } catch { failedSponsors.push(op.name); }
          }, 5);
        }
      } catch (error) {
        throw new Error(mensagemDoErro(error, "Erro ao atualizar evento e patrocinadores"));
      }
      return { failedSponsors, soVinculos };
    },
    onSuccess: ({ failedSponsors, soVinculos }, { fd }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      handleCloseDialog();
      // O NOME no toast: quem edita três eventos seguidos precisa saber qual
      // acabou de salvar, e "atualizado com sucesso" servia para qualquer um.
      const nomeSalvo = fd.name || editingEvent?.name || "o evento";
      toast({
        title: soVinculos ? "Patrocinadores atualizados" : "Evento atualizado",
        description: failedSponsors.length > 0
          ? `Não foi possível atualizar: ${failedSponsors.join(", ")}. Reabra o evento para revisar.`
          : soVinculos ? `Patrocinadores e cotas de "${nomeSalvo}" salvos.` : `"${nomeSalvo}" salvo.`,
        // Evento salvo e só parte dos vínculos não: aviso, não falha — nada se perdeu.
        variant: failedSponsors.length > 0 ? "warning" : "success",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Não foi possível salvar o evento", description: error.message, variant: "destructive" });
    },
  });

  // ── Prazos: ordem, personalização ─────────────────────────────────────────
  const offsets = MARCO_FIELDS.map((m) => Number(formData[m.field]));
  // Cadeia CAUSAL: não se entrega layout de uma lista que não existe. Um marco
  // não pode cair ANTES do anterior. A inversão só reaparecia como alerta
  // esquisito em /prazos e no Painel — aqui ela é barrada na origem.
  const orderIssues = offsets.map((v, i) => i > 0 && v < offsets[i - 1]);
  const hasOrderIssue = orderIssues.some(Boolean);
  const customDeadlineCount = MARCO_FIELDS.filter((m) => Number(formData[m.field]) !== DEFAULT_DEADLINES[m.field]).length;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Só patrocinadores: as datas e os prazos nem aparecem, então não se
    // validam. Continua a trava de não salvar antes de os vínculos carregarem.
    if (soPatrocinadoresNoModal && editingEvent) {
      if (sponsorsLoading || sponsorsError) {
        toast({
          title: sponsorsLoading ? "Aguarde o carregamento" : "Não foi possível carregar os patrocinadores",
          description: sponsorsLoading
            ? "Os patrocinadores do evento ainda estão carregando."
            : "Reabra a janela — salvar agora poderia remover os patrocinadores vinculados.",
          variant: sponsorsLoading ? "warning" : "destructive",
        });
        return;
      }
      updateEventMutation.mutate({ id: editingEvent.id, fd: formData, soPatrocinadores: true });
      return;
    }
    if (!formData.startDate || !formData.truckDepartureDate) {
      toast({ title: "Datas obrigatórias", description: "Preencha a data de início e a saída do caminhão.", variant: "warning" });
      return;
    }

    // Horário incompleto: digitar só ":" produzia "2026-03-10T:", que passava
    // por toda a validação do cliente e só estourava no insert do Drizzle com
    // "RangeError: Invalid time value" dentro do toast destrutivo.
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(formData.truckDepartureDate)) {
      toast({
        title: "Horário inválido",
        description: "Confira o horário da saída do caminhão (formato 08:00).",
        variant: "warning",
      });
      setOpenTruckDate(true);
      return;
    }

    // Validação: Saída do caminhão deve ser pelo menos 1 dia ANTES do início do
    // evento. Comparar apenas as datas do calendário (YYYY-MM-DD), sem timezone.
    const startDateStr = formData.startDate;
    const truckDateStr = formData.truckDepartureDate.substring(0, 10);

    // Sanidade de ano (espelha o servidor): um "0206" no banco fez o Painel
    // mostrar "ATRASADO 664730D". O Calendar não produz isso, mas o dado pode
    // vir de import/edição legada — barrar aqui dá mensagem melhor que o 400.
    const badYear = [startDateStr, truckDateStr].some((d) => {
      const y = Number(d.slice(0, 4));
      return !Number.isFinite(y) || y < 2000 || y > 2100;
    });
    if (badYear) {
      toast({
        title: "Data inválida",
        description: "Confira o ano das datas (ex.: 2026) — valor fora do intervalo aceito.",
        variant: "warning",
      });
      return;
    }

    if (truckDateStr >= startDateStr) {
      toast({
        title: "Data inválida",
        description: "A saída do caminhão deve ser pelo menos 1 dia antes do início do evento.",
        variant: "warning",
      });
      return;
    }

    if (hasOrderIssue) {
      const first = orderIssues.findIndex(Boolean);
      setPrazosExpanded(true);
      toast({
        title: "Prazos fora de ordem",
        description: `"${MARCO_FIELDS[first].label}" está antes de "${MARCO_FIELDS[first - 1].label}". Os ${MARCO_FIELDS.length} marcos seguem uma sequência — ajuste antes de salvar.`,
        variant: "warning",
      });
      return;
    }

    // Ao editar/duplicar, não deixa salvar antes de os patrocinadores
    // carregarem (ou se o carregamento falhou), para não apagar os vínculos
    // existentes por engano.
    if (modalMode !== 'create' && (sponsorsLoading || sponsorsError)) {
      toast({
        title: sponsorsLoading ? "Aguarde o carregamento" : "Não foi possível carregar os patrocinadores",
        description: sponsorsLoading
          ? "Os patrocinadores do evento ainda estão carregando."
          : "Reabra o evento para editar com segurança — salvar agora poderia remover os patrocinadores vinculados.",
        variant: sponsorsLoading ? "warning" : "destructive",
      });
      return;
    }

    if (editingEvent) {
      updateEventMutation.mutate({ id: editingEvent.id, fd: formData });
    } else {
      createEventMutation.mutate({
        fd: formData,
        cloneFrom: duplicateSource && copyItems ? duplicateSource.id : null,
      });
    }
  };

  const handleEdit = useCallback<AcaoSobreEvento>((event, e) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedSponsorIds([]);
    setSponsorQuotaMap({});
    setDuplicateSource(null);
    setEditingEvent(event);
    const next: FormularioDoEvento = {
      name: event.name || "",
      priority: event.priority || "",
      // startDate pode vir como ISO completo ("2026-03-10T00:00:00.000Z") —
      // sem o slice, fmtDateBR/parseDateStr quebravam a exibição no modal.
      startDate: (event.startDate || "").slice(0, 10),
      truckDepartureDate: event.truckDepartureDate ? new Date(event.truckDepartureDate).toISOString().slice(0, 16) : "",
      prazoMolde: diaDoPrazoMolde(event.prazoMolde) ?? "",
      deadlineListaImagens: event.deadlineListaImagens ?? DEFAULT_DEADLINES.deadlineListaImagens,
      deadlineEntregaLayouts: event.deadlineEntregaLayouts ?? DEFAULT_DEADLINES.deadlineEntregaLayouts,
      deadlineAprovacaoLayout: event.deadlineAprovacaoLayout ?? DEFAULT_DEADLINES.deadlineAprovacaoLayout,
      deadlineFinalizacao: event.deadlineFinalizacao ?? DEFAULT_DEADLINES.deadlineFinalizacao,
      deadlineRevisaoLista: event.deadlineRevisaoLista ?? DEFAULT_DEADLINES.deadlineRevisaoLista,
      deadlineProducaoGrafica: event.deadlineProducaoGrafica ?? DEFAULT_DEADLINES.deadlineProducaoGrafica,
    };
    setFormData(next);
    setCopyItems(false);
    // Baseline provisório (sem patrocinadores); é recalculado quando a busca
    // dos vínculos retorna — ver fetchEventSponsors.
    setBaselineSig(formSignature(next, [], {}));
    // Prazo personalizado precisa estar VISÍVEL na edição: quem abre para mudar
    // a data da saída não fazia ideia de que "Aprovação de Layout" estava
    // customizada em −6, e saía sem revisar.
    const hasCustom = MARCO_FIELDS.some((m) => Number(next[m.field]) !== DEFAULT_DEADLINES[m.field]);
    setPrazosExpanded(hasCustom);
    setOpen(true);
  }, [formSignature]);

  const handleDuplicate = useCallback<AcaoSobreEvento>((event, e) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedSponsorIds([]);
    setSponsorQuotaMap({});
    setEditingEvent(null);
    setDuplicateSource(event);
    const next: FormularioDoEvento = {
      name: `${event.name} (cópia)`,
      priority: event.priority || "",
      // Datas em branco de propósito: o que muda entre etapas de um circuito
      // são exatamente elas. Os offsets (prazos) viajam junto.
      startDate: "",
      truckDepartureDate: "",
      // Datas em branco — o prazo do molde também é uma data do evento.
      prazoMolde: "",
      deadlineListaImagens: event.deadlineListaImagens ?? DEFAULT_DEADLINES.deadlineListaImagens,
      deadlineEntregaLayouts: event.deadlineEntregaLayouts ?? DEFAULT_DEADLINES.deadlineEntregaLayouts,
      deadlineAprovacaoLayout: event.deadlineAprovacaoLayout ?? DEFAULT_DEADLINES.deadlineAprovacaoLayout,
      deadlineFinalizacao: event.deadlineFinalizacao ?? DEFAULT_DEADLINES.deadlineFinalizacao,
      deadlineRevisaoLista: event.deadlineRevisaoLista ?? DEFAULT_DEADLINES.deadlineRevisaoLista,
      deadlineProducaoGrafica: event.deadlineProducaoGrafica ?? DEFAULT_DEADLINES.deadlineProducaoGrafica,
    };
    setFormData(next);
    setCopyItems(false);
    // Formulário duplicado nasce SUJO (baseline vazio): fechar sem salvar
    // descarta trabalho pré-montado e precisa perguntar.
    setBaselineSig("");
    setPrazosExpanded(MARCO_FIELDS.some((m) => Number(next[m.field]) !== DEFAULT_DEADLINES[m.field]));
    setOpen(true);
  }, []);

  // Buscar patrocinadores vinculados ao editar/duplicar evento — extraído do
  // useEffect para o banner de erro poder oferecer "Tentar novamente".
  const fetchEventSponsors = useCallback((eventId: string, rebaseline: boolean) => {
    setSponsorsLoading(true);
    setSponsorsError(false);
    apiRequest("GET", `/api/events/${eventId}/sponsors`)
      .then((res) => res.json() as Promise<VinculoDoEvento[]>)
      .then((eventSponsors) => {
        const sponsorIds = eventSponsors.map((es) => es.sponsorId);
        const quotaMap: Record<string, string> = {};
        eventSponsors.forEach((es) => { if (es.quota) quotaMap[es.sponsorId] = es.quota; });
        setSelectedSponsorIds(sponsorIds);
        setSponsorQuotaMap(quotaMap);
        setSponsorsLoading(false);
        // Só a EDIÇÃO rebaseia: no modo duplicar os vínculos herdados são
        // trabalho novo a salvar, então o formulário continua sujo.
        if (rebaseline) setBaselineSig(formSignature(formDataRef.current, sponsorIds, quotaMap));
      })
      .catch((error) => {
        // NÃO zera selectedSponsorIds aqui: se zerasse e o usuário salvasse,
        // o updateEvent removeria TODOS os vínculos de patrocinador do evento.
        console.error("Erro ao buscar patrocinadores:", error);
        setSponsorsError(true);
        setSponsorsLoading(false);
      });
  }, [formSignature]);

  useEffect(() => {
    if (editingEvent) fetchEventSponsors(editingEvent.id, true);
    else if (duplicateSource) fetchEventSponsors(duplicateSource.id, false);
  }, [editingEvent, duplicateSource, fetchEventSponsors]);

  // ── Prazos: conversão offset ↔ data ───────────────────────────────────────
  const truckDateOnly = formData.truckDepartureDate ? formData.truckDepartureDate.slice(0, 10) : "";
  const offsetToDateStr = (days: number, allDays = false): string => {
    if (!truckDateOnly) return "";
    const d = new Date(truckDateOnly + "T12:00:00");
    d.setDate(d.getDate() + days);
    if (!allDays) {
      const dow = d.getDay();
      if (dow === 6) d.setDate(d.getDate() - 1); // sábado → sexta
      else if (dow === 0) d.setDate(d.getDate() + 1); // domingo → segunda
    }
    return toDateStr(d);
  };
  const dateStrToOffset = (dateStr: string): number => {
    if (!truckDateOnly || !dateStr) return 0;
    const base = new Date(truckDateOnly + "T12:00:00");
    const target = new Date(dateStr + "T12:00:00");
    return Math.round((target.getTime() - base.getTime()) / 86400000);
  };
  const noStart = !truckDateOnly;

  const submitPending = createEventMutation.isPending || updateEventMutation.isPending;

  return {
    open, setOpen, formData, setFormData,
    prazosExpanded, setPrazosExpanded,
    selectedSponsorIds, setSelectedSponsorIds, sponsorQuotaMap, setSponsorQuotaMap,
    sponsorsLoading, sponsorsError, sponsorSearch, setSponsorSearch,
    editingEvent, duplicateSource, copyItems, setCopyItems,
    confirmDiscardOpen, setConfirmDiscardOpen,
    openStartDate, setOpenStartDate, openTruckDate, setOpenTruckDate, openPrazoKey, setOpenPrazoKey,
    ordemFixadaNoTopo, modalMode, soPatrocinadoresNoModal,
    abrirNovoEvento, handleCloseDialog, requestCloseDialog,
    createEventMutation, updateEventMutation, submitPending,
    orderIssues, hasOrderIssue, customDeadlineCount,
    handleSubmit, handleEdit, handleDuplicate, fetchEventSponsors,
    truckDateOnly, offsetToDateStr, dateStrToOffset, noStart,
  };
}

export type FormularioDoEventoAberto = ReturnType<typeof useFormularioDoEvento>;
