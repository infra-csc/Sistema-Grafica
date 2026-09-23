// ─────────────────────────────────────────────────────────────────────────────
// A SELEÇÃO EM LOTE — conferir várias com uma foto, ou embalar várias num tubo.
//
// Um modo de lote por vez; a lista elegível depende do modo ativo e é podada
// quando o recorte muda. A foto do lote pertence às peças fotografadas.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useRef, useState } from "react";
import { apiRequest, getCurrentUserName } from "@/lib/queryClient";
import { convertGCSUrlToLocalPath } from "@/lib/artePdfExport";
import { useToast } from "@/hooks/use-toast";
import { invalidarGraficaEMaquinas } from "@/lib/tempo-real-grafica";
import { EM_REVISAO } from "@shared/fluxo-peca";
import { pecaTravada, fraseDaTrava } from "@shared/trava-da-peca";
import { remainingConfer } from "@/lib/saldo";
import type { PainelDeTubos, PecaDaFila } from "@/components/grafica/tipos";
import { motivoDaPrimeiraFalha } from "@/components/grafica/fila/regras";

export type SelecaoEmLote = ReturnType<typeof useSelecaoEmLote>;

export function useSelecaoEmLote({ filteredItems, itemPorId, canConfer, podeEmbalar, tubosDoEvento, setTubosDoEvento, viewDetailsItem, selectedItem }: {
  filteredItems: PecaDaFila[];
  itemPorId: Map<string, PecaDaFila>;
  canConfer: (item: PecaDaFila) => boolean;
  podeEmbalar: (item: PecaDaFila) => boolean;
  // Os diálogos abertos: com um deles na frente, o Esc é dele, não do lote.
  tubosDoEvento: PainelDeTubos | null;
  setTubosDoEvento: (painel: PainelDeTubos | null) => void;
  viewDetailsItem: PecaDaFila | null;
  selectedItem: PecaDaFila | null;
}) {
  const { toast } = useToast();
  // Seleção dos modos de lote (conferir / embalar)
  const [bulkSelectedIds, setBulkSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkSubmitting, setIsBulkSubmitting] = useState(false);
  // ── Conferência em lote ──
  const [bulkConferMode, setBulkConferMode] = useState(false);
  // EMBALAR EM LOTE (dono, 21/09): marcar várias conferidas e mandar todas
  // para um tubo de uma vez. Sem foto e sem dialog próprio — o "Continuar"
  // abre o painel de tubos do evento já com as peças marcadas.
  const [bulkPackMode, setBulkPackMode] = useState(false);
  const [bulkConferOpen, setBulkConferOpen] = useState(false);
  const [bulkConferNotes, setBulkConferNotes] = useState("");
  const [bulkConferPhotos, setBulkConferPhotos] = useState<string[]>([]);
  const addBulkConferPhoto = (url: string) => setBulkConferPhotos(prev => [...prev, convertGCSUrlToLocalPath(url)]);
  // Abre o painel de tubos do evento da peça já com ela marcada para embalar.
  // `lote`: veio do "Embalar em lote" — o painel não entra no atalho de peça sozinha.
  const abrirEmbalar = (itensPedidos: PecaDaFila[], lote = false) => {
    // Travada não embala: sai do lote, com aviso (o servidor também barra).
    const travadas = itensPedidos.filter((i) => pecaTravada(i));
    if (travadas.length) toast({ title: travadas.length === 1 ? `${travadas[0].displayId ?? "Peça"} está travada` : `${travadas.length} peças travadas ficaram de fora`, description: fraseDaTrava(travadas[0]), variant: "warning" });
    const itens = itensPedidos.filter((i) => !pecaTravada(i));
    const primeira = itens[0];
    if (!primeira) return;
    setTubosDoEvento({ id: String(primeira.eventId), name: primeira.event?.name ?? "Evento", embalar: itens.map((i) => i.id), ...(lote ? { lote: true } : {}) });
  };

  // ── LOTE E EVENTO FINALIZADO: aqui não há o que separar ───────────────────
  // As ações em lote desta tela são CONFERIR (POST /api/items/:id/confer) e
  // EMBALAR (rotas de tubos) — que a guarda de evento finalizado deixa passar
  // de propósito. Logo, um lote misto
  // (peça viva + peça de evento acabado) roda inteiro, sem 409 e sem falha
  // silenciosa: não existe caso a separar, e um filtro aqui só REMOVERIA da
  // conferência em lote justamente as peças cuja papelada chega depois do
  // evento. A separação de lote misto que a Revisão Final precisa fazer
  // (solicitacao.tsx) não tem paralelo nesta tela.
  //
  // Conferíveis no filtro atual (para o modo conferência em lote)
  // !EM_REVISAO: peça em revisão com reaproveitamento marcado passaria no
  // canConfer (o reuso não olha status) — e ela está aqui só para ser VISTA.
  const conferableInFilter = useMemo(
    () => filteredItems.filter(i => canConfer(i) && !EM_REVISAO.has(i.status)),
    [filteredItems],
  );
  // Embaláveis no filtro atual (modo "Embalar em lote"): conferidas sem tubo.
  const packableInFilter = useMemo(
    () => filteredItems.filter(i => podeEmbalar(i)),
    [filteredItems],
  );
  // Um modo de lote por vez; a lista elegível depende do modo ativo.
  const bulkOn = bulkConferMode || bulkPackMode;
  const bulkEligibleList = bulkConferMode ? conferableInFilter : bulkPackMode ? packableInFilter : [];
  const allDeliverableSelected =
    bulkEligibleList.length > 0 && bulkEligibleList.every((i) => bulkSelectedIds.has(i.id));

  const toggleBulkItem = (id: string) =>
    setBulkSelectedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  // Peças do lote resolvidas na lista COMPLETA (para os dialogs de lote).
  const bulkSelectedItems = useMemo(
    () => Array.from(bulkSelectedIds).map(id => itemPorId.get(id)).filter((i): i is PecaDaFila => !!i),
    [bulkSelectedIds, itemPorId],
  );

  // Eventos do lote — um tubo pertence a um evento só, e o "Embalar em lote"
  // manda as conferidas marcadas para UM tubo: por isso exige um evento só
  // (com vários, a barra avisa em vez de abrir o painel).
  const eventosDoLote = useMemo(() => {
    const m = new Map<string, string>();
    for (const i of bulkSelectedItems) if (i.eventId) m.set(String(i.eventId), i.event?.name ?? "Evento");
    return Array.from(m, ([id, nome]) => ({ id, nome }));
  }, [bulkSelectedItems]);

  const bulkConfirmRef = useRef<HTMLButtonElement>(null);

  // Ao entrar num modo de lote o foco vai para o Confirmar da barra fixa —
  // sem isso, teclado e leitor de tela ficavam perdidos no meio da tabela.
  useEffect(() => {
    if (bulkOn) bulkConfirmRef.current?.focus();
  }, [bulkOn]);

  // Filtros podem mudar com o lote ativo: poda a seleção para manter apenas
  // ids visíveis e elegíveis — evita confirmar peça que não está mais na tela.
  useEffect(() => {
    if (!bulkOn) return;
    setBulkSelectedIds(prev => {
      const eligible = new Set(bulkEligibleList.map((i) => i.id));
      const next = new Set(Array.from(prev).filter(id => eligible.has(id)));
      return next.size === prev.size ? prev : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bulkOn, bulkEligibleList]);

  // A FOTO PERTENCE ÀS PEÇAS FOTOGRAFADAS. Ela sobrevive a fechar e reabrir o
  // diálogo — mas só enquanto a seleção for EXATAMENTE a mesma de quando foi
  // anexada. Sem essa trava, fechar, desmarcar tudo e marcar peças de outro
  // evento mandava o comprovante de um lote como prova de outro. Qualquer
  // mudança no conjunto (marcar, desmarcar, poda por filtro) descarta as fotos
  // do lote; reabrir para conferir/ajustar sem trocar peças continua valendo.
  const chaveSelecaoLote = (ids: Iterable<string>) => Array.from(ids).sort().join("|");
  const selecaoDaFotoRef = useRef<string | null>(null);
  // Memoizada: com "Todas (2.000)" marcadas, ordenar e juntar os ids a cada
  // render da página (cada tecla, cada abrir de modal) custava à toa.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const chaveSelecaoAtual = useMemo(() => chaveSelecaoLote(bulkSelectedIds), [bulkSelectedIds]);
  const temFotoNoLote = bulkConferPhotos.length > 0;
  useEffect(() => {
    if (!temFotoNoLote) { selecaoDaFotoRef.current = null; return; }
    // Primeira foto: amarra ao conjunto marcado neste momento.
    if (selecaoDaFotoRef.current === null) { selecaoDaFotoRef.current = chaveSelecaoAtual; return; }
    if (selecaoDaFotoRef.current !== chaveSelecaoAtual) {
      selecaoDaFotoRef.current = null;
      setBulkConferPhotos([]);
    }
  }, [temFotoNoLote, chaveSelecaoAtual]);

  // SAIR DO LOTE — um lugar só (X da barra e Esc). A foto e as observações do
  // lote SOBREVIVEM a fechar o diálogo com a mesma seleção (ver acima), e por
  // isso são descartadas AQUI também, quando o lote acaba sem registrar nada.
  const sairDoLote = () => {
    setBulkConferMode(false);
    setBulkPackMode(false);
    setBulkSelectedIds(new Set());
    setBulkConferPhotos([]);
    setBulkConferNotes("");
  };

  // Escape sai do modo lote — mas não quando há dialog aberto: o Escape do
  // dialog fecha o dialog, e o estado ainda aponta "aberto" quando este
  // handler roda, então os dois não conflitam.
  useEffect(() => {
    if (!bulkOn) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (bulkConferOpen || tubosDoEvento || viewDetailsItem || selectedItem) return;
      sairDoLote();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [bulkOn, bulkConferOpen, tubosDoEvento, viewDetailsItem, selectedItem]);

  // Conferência em lote: allSettled + tolerância a falha parcial. Foto é obrigatória (regra do servidor); a primeira vira o
  // conferencePhotoUrl de cada peça e todas entram na galeria (kind conference).
  const handleBulkConference = async () => {
    if (isBulkSubmitting) return; // Enter repetido no dialog disparava o lote 2x
    if (bulkConferPhotos.length === 0) {
      toast({ title: "Foto obrigatória", description: "Envie ao menos uma foto da conferência.", variant: "warning" });
      return;
    }
    setIsBulkSubmitting(true);
    // Busca cada peça na lista COMPLETA (items) — buscar em filteredItems fazia
    // a peça "sumir" quando o filtro mudava com o lote aberto, e o fallback
    // qty: 1 registrava conferência de 1 unidade em vez do restante real.
    // Peça não encontrada SAI do lote em vez de ir com quantidade chutada.
    const entries = Array.from(bulkSelectedIds)
      .map(id => itemPorId.get(id))
      .filter((i): i is PecaDaFila => !!i);
    const ids = entries.map(i => i.id);
    try {
      const confer = await Promise.allSettled(entries.map(item =>
        apiRequest("POST", `/api/items/${item.id}/confer`, {
          conferencePhotoUrl: bulkConferPhotos[0],
          qty: remainingConfer(item),
          notes: bulkConferNotes || null,
        })
      ));

      const okIds = ids.filter((_, i) => confer[i].status === "fulfilled");
      const failedIds = ids.filter((_, i) => confer[i].status === "rejected");
      const failed = failedIds.length;

      let photoFailed = 0;
      if (okIds.length > 0) {
        const photos = await Promise.allSettled(
          okIds.flatMap(itemId =>
            bulkConferPhotos.map(photoUrl =>
              apiRequest("POST", `/api/items/${itemId}/photos`, {
                photoUrl, kind: "conference", uploadedBy: getCurrentUserName(),
              })
            )
          )
        );
        photoFailed = photos.filter(p => p.status === "rejected").length;
      }

      // Conferir é só conferir (dono, 21/09): nada de tubo aqui. Conferidas,
      // as peças ganham o botão Embalar na fila (ou o "Embalar em lote").
      invalidarGraficaEMaquinas();

      if (failed > 0) {
        // O MOTIVO da recusa entra no toast (o primeiro, que costuma ser o de
        // todas): "falhou" sem porquê deixava o operador reenviando às cegas —
        // e a causa mais comum é o colega ter conferido a mesma peça antes.
        const motivo = motivoDaPrimeiraFalha(confer);
        toast({
          title: `${okIds.length} de ${ids.length} conferida${ids.length !== 1 ? "s" : ""}`,
          description: `${failed} não ${failed !== 1 ? "passaram" : "passou"}${motivo ? ` — ${motivo}` : ""}. ${failed !== 1 ? "Continuam selecionadas" : "Continua selecionada"} para tentar de novo.`,
          variant: "destructive",
        });
      } else if (photoFailed > 0) {
        toast({
          title: `${okIds.length} peça(s) conferida(s)`,
          description: "A conferência foi feita, mas parte das fotos não pôde ser anexada.",
          variant: "warning",
        });
      } else {
        toast({
          title: `${okIds.length} peça${okIds.length !== 1 ? "s" : ""} conferida${okIds.length !== 1 ? "s" : ""}`,
          description: "Agora é embalar: o botão Embalar da peça (ou Embalar em lote) escolhe o tubo. As etiquetas ficam no cabeçalho do evento.",
        });
      }

      setBulkConferOpen(false);
      if (failed > 0) {
        // O toast promete que as peças que falharam "continuam na lista":
        // mantém o modo ativo com SÓ elas selecionadas (e a foto/notas para
        // reenviar), em vez de zerar a seleção. As que falharam estavam NA
        // foto: a trava de "seleção mudou" é reamarrada a esse subconjunto.
        selecaoDaFotoRef.current = chaveSelecaoLote(failedIds);
        setBulkSelectedIds(new Set(failedIds));
      } else {
        setBulkConferMode(false);
        setBulkSelectedIds(new Set());
        setBulkConferNotes("");
        setBulkConferPhotos([]);
      }
    } catch (e) {
      // Mesmas chaves do fluxo feliz — invalidar só /approved deixava as
      // outras telas com o cache velho.
      invalidarGraficaEMaquinas();
      toast({ title: "Erro na conferência em lote", description: (e as Error).message, variant: "destructive" });
    } finally {
      setIsBulkSubmitting(false);
    }
  };

  return {
    bulkSelectedIds, setBulkSelectedIds, isBulkSubmitting, bulkConferMode, setBulkConferMode, bulkPackMode, setBulkPackMode,
    bulkConferOpen, setBulkConferOpen, bulkConferNotes, setBulkConferNotes, bulkConferPhotos, setBulkConferPhotos, addBulkConferPhoto,
    abrirEmbalar, conferableInFilter, packableInFilter, bulkOn, bulkEligibleList, allDeliverableSelected, toggleBulkItem,
    bulkSelectedItems, eventosDoLote, bulkConfirmRef, sairDoLote, handleBulkConference,
  };
}
