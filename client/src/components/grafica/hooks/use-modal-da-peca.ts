// ─────────────────────────────────────────────────────────────────────────────
// O MODAL DA PEÇA — imprimir (compartilhado com Máquinas) ou conferir.
//
// O estado do modal, as fotos da conferência, a mutação de conferir (e o
// "conferir e embalar"), e os dois efeitos que fazem o modal acompanhar a fila
// quando a peça muda por trás dele.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from "react";
import type React from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient, getCurrentUserName } from "@/lib/queryClient";
import { convertGCSUrlToLocalPath } from "@/lib/artePdfExport";
import { useToast } from "@/hooks/use-toast";
import { invalidarGraficaEMaquinas } from "@/lib/tempo-real-grafica";
import { getStatusLabel } from "@/lib/status";
import { CONFERIR_E_EMBALAR } from "@shared/embalagem";
import { partesDaPeca } from "@shared/impressao-dividida";
import { estaLiberada } from "@shared/progresso-da-impressao";
import { pecaTravada } from "@shared/trava-da-peca";
import { isInProd, remainingConfer } from "@/lib/saldo";
// Teclado virtual: o modal sobe junto com ele (ver o arquivo).
import { useAcompanharAreaVisivel } from "@/components/grafica/area-visivel";
// O modal de impressão (iniciar / informar impressas / mandar para acabamento /
// trocar de máquina) é COMPARTILHADO com a aba Máquinas: as mutations, os
// toasts e o formulário moram em components/grafica/modal-impressao.tsx.
import { useMutacoesDeImpressao } from "@/components/grafica/modal-impressao";
import type { PecaDaFila } from "@/components/grafica/tipos";
import { apiErrorMessage } from "@/components/grafica/fila/regras";

export type ModalDaPecaEstado = ReturnType<typeof useModalDaPeca>;

export function useModalDaPeca({ items, canConfer, canProduce, oferecerEmbalarJunto, avisarTravada, isMobile }: {
  items: PecaDaFila[];
  canConfer: (item: PecaDaFila) => boolean;
  canProduce: boolean;
  oferecerEmbalarJunto: (item: PecaDaFila, qtd: number) => boolean;
  /** A porta de toda ação que faz a peça andar: travada, avisa e não abre. */
  avisarTravada: (item: PecaDaFila) => boolean;
  isMobile: boolean;
}) {
  const { toast } = useToast();
  const [selectedItem, setSelectedItem] = useState<PecaDaFila | null>(null);
  const [modalType, setModalType] = useState<"production" | "conference" | null>(null);
  const [conferQty, setConferQty] = useState(0);   // conferência parcial
  // CONFERIR E EMBALAR (decisão CONFERIR_E_EMBALAR): a conferência que zera o
  // que falta conferir oferece, já marcado, embalar em volume avulso com a
  // MESMA foto. `conferindoEEmbalando` cobre a segunda ida ao servidor.
  const [jaEmbalar, setJaEmbalar] = useState(CONFERIR_E_EMBALAR);
  const [conferindoEEmbalando, setConferindoEEmbalando] = useState(false);
  // Envios de foto em andamento no modal (vindo do uploader): enquanto sobe,
  // o Conferir espera — senão a conferência sai sem a foto que está chegando.
  const [fotosSubindo, setFotosSubindo] = useState(0);
  // Cada abertura do modal ganha uma CHAVE: a foto que termina de subir depois
  // de o modal fechar ou mudar de peça é descartada (não vai parar na próxima).
  const [aberturaDoModal, setAberturaDoModal] = useState(0);
  const chaveDoModalRef = useRef("");
  // Fotos anexadas no modal de conferência. Várias por vez.
  const [photos, setPhotos] = useState<string[]>([]);
  // A URL assinada do GCS perde o token ao ser gravada; o app serve os arquivos
  // por /objects/... — sem converter, a foto salva não abre depois.
  const addPhoto = (url: string) => setPhotos(prev => [...prev, convertGCSUrlToLocalPath(url)]);
  const removePhoto = (url: string) => setPhotos(prev => prev.filter(p => p !== url));
  const [modalNotes, setModalNotes] = useState("");

  // O modal de impressão é compartilhado com a aba Máquinas (components/
  // grafica/modal-impressao.tsx): as duas mutations, os toasts e o formulário
  // moram lá. Aqui só se diz o que fazer ao gravar — fechar o modal.
  const mutacoesDeImpressao = useMutacoesDeImpressao({ onSucesso: () => { setSelectedItem(null); setModalType(null); } });
  // "Tirar da impressora" da peça que o modal não abre (travada / evento
  // finalizado): o MESMO gesto (POST /pausar) do modal e do cartão de Máquinas.
  const tirarBloqueada = (item: PecaDaFila, maquina: string) => {
    const x = partesDaPeca(item)[maquina];
    mutacoesDeImpressao.mexerNaImpressoraMutation.mutate({ maquina, sai: { id: item.id, displayId: item.displayId ?? null, impressas: x?.impressas ?? 0, teto: x?.atrib ?? 0 } });
  };
  const podeTirarBloqueada = (item: PecaDaFila, selo: unknown) => canProduce && isInProd(item) && (pecaTravada(item) || !!selo);

  // Mesmo desenho de sempre: o toast nomeia a peça e a quantidade, e o erro
  // recarrega a fila (o colega pode ter conferido a mesma peça no celular).
  const conferMutation = useMutation({
    mutationFn: async ({ itemId, conferencePhotoUrl, qty, notes }: { itemId: string; conferencePhotoUrl: string; qty: number; notes?: string; displayId?: string; vaiEmbalar?: boolean }) =>
      await apiRequest("POST", `/api/items/${itemId}/confer`, { conferencePhotoUrl, qty, notes }),
    onSuccess: (_r, vars) => {
      invalidarGraficaEMaquinas();
      setSelectedItem(null); setModalType(null);
      setPhotos([]);
      // Conferir e embalar: quem avisa é o handler, depois da embalagem.
      if (vars.vaiEmbalar) return;
      toast({
        title: `Conferência feita${vars.displayId ? ` · ${vars.displayId}` : ""}`,
        description: `${vars.qty} un. conferida${vars.qty !== 1 ? "s" : ""} — agora é embalar. As etiquetas ficam no cabeçalho do evento.`,
      });
    },
    onError: (error: Error) => {
      invalidarGraficaEMaquinas();
      toast({ title: "Não foi possível conferir", description: `${apiErrorMessage(error).replace(/[.\s]*$/, ".")}${navigator.onLine ? " A fila foi recarregada com o estado atual." : ""}`, variant: "destructive" });
    },
  });

  // ── A PEÇA MUDOU ENQUANTO O MODAL ESTAVA ABERTO ────────────────────────────
  // A Gráfica é a tela em que duas pessoas trabalham a mesma fila. O modal de
  // conferir guardava a peça do momento em que abriu: se o colega conferisse
  // pelo celular (WebSocket/polling trazem o dado novo), o modal seguia
  // dizendo "A conferir: 5" e o clique virava erro.
  // Agora o modal acompanha a fila: saldo novo atualiza os números na hora; se
  // não resta nada a fazer, fecha e diz por quê. Produção fica de fora DE
  // PROPÓSITO: o valor que o operador leu é a base do lock otimista
  // (expectedProduced) — trocar a peça por baixo dele anularia a proteção.
  // Enquanto a própria mutação está em voo não mexe: o eco do WebSocket da
  // ação dele mesmo chega antes da resposta e seria lido como "outra pessoa".
  useEffect(() => {
    if (!selectedItem || modalType !== "conference") return;
    if (conferMutation.isPending || conferindoEEmbalando) return;
    const fresca = items.find((i) => i.id === selectedItem.id);
    if (fresca === selectedItem) return;
    if (!fresca || !canConfer(fresca)) {
      setSelectedItem(null); setModalType(null); setPhotos([]);
      toast({
        title: `${selectedItem.displayId} mudou enquanto você conferia`,
        description: "Outra pessoa já conferiu esta peça — não resta nada a conferir. A fila está atualizada.",
        variant: "warning",
      });
      return;
    }
    setSelectedItem(fresca);
    setConferQty(q => Math.max(1, Math.min(q, remainingConfer(fresca))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, conferMutation.isPending, conferindoEEmbalando]);

  // ── O MODAL DE IMPRESSÃO TAMBÉM ACOMPANHA A FILA (revisão adversarial, 22/09) ──
  // Ficava de fora de propósito (o valor lido era a base do lock otimista),
  // mas o efeito colateral era pior: depois de um 409 PRODUCTION_CONFLICT a fila
  // recarregava e o modal seguia com o `jaSairam`/`expectedProduced` VELHOS —
  // cada nova tentativa batia no mesmo 409. Agora a peça do modal é trocada
  // pela da fila nova; o campo "saíram AGORA" é incremental, então o total
  // enviado passa a somar sobre o número certo (e o operador o vê na linha da
  // conta). Enquanto uma gravação da própria tela está em voo NÃO mexe: o eco do
  // WebSocket do gesto dele chega antes da resposta e seria lido como alheio.
  const impressaoEmVoo = mutacoesDeImpressao.startProductionMutation.isPending || mutacoesDeImpressao.startPrintingMutation.isPending
    || mutacoesDeImpressao.mexerNaImpressoraMutation.isPending || mutacoesDeImpressao.reservarMutation.isPending;
  useEffect(() => {
    if (!selectedItem || modalType !== "production" || impressaoEmVoo) return;
    const fresca = items.find((i) => i.id === selectedItem.id);
    if (!fresca || fresca === selectedItem) return;
    // Saiu do alcance do modal (mandada para o acabamento, cancelada…): fecha e diz por quê.
    if (!isInProd(fresca) && !estaLiberada(fresca)) {
      setSelectedItem(null); setModalType(null);
      toast({ title: `${selectedItem.displayId} mudou enquanto você informava`, description: `Outra pessoa já a levou para ${getStatusLabel(fresca.status)} — a fila está atualizada.`, variant: "warning" });
      return;
    }
    setSelectedItem(fresca);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, impressaoEmVoo]);

  // Modais de produzir/conferir/entregar e de devolver: no celular, com o
  // teclado virtual aberto, encolhem para a área visível — o rodapé com o
  // Confirmar fica logo acima do teclado (ver components/grafica/area-visivel).
  const modalPecaRef = useRef<HTMLDivElement>(null);
  useAcompanharAreaVisivel(modalPecaRef, "centro", isMobile && !!selectedItem && !!modalType);

  // A chave desta abertura do modal (ver aberturaDoModal): a foto guarda a
  // chave de quando o envio começou e só entra se o modal ainda for o mesmo.
  const chaveDoModal = `${aberturaDoModal}:${modalType ?? ""}:${selectedItem?.id ?? ""}`;
  chaveDoModalRef.current = chaveDoModal;
  const fotoDaAbertura = (chave: string) => (url: string) => {
    if (chave !== chaveDoModalRef.current) return;
    addPhoto(url);
  };

  const handleSubmitConference = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;
    if (fotosSubindo > 0) return; // o botão já diz "Enviando foto…"
    if (!photos.length) {
      toast({ title: "Foto obrigatória", description: "Envie ao menos uma foto da conferência.", variant: "warning" });
      return;
    }
    const peca = selectedItem;
    const vaiEmbalar = oferecerEmbalarJunto(peca, conferQty) && jaEmbalar;
    // Mutation PRIMEIRO (a primeira foto vai nela como conferencePhotoUrl, o
    // campo que o restante do app lê); a galeria só recebe as fotos depois do
    // sucesso — mesma disciplina do lote. Antes uma conferência recusada
    // deixava fotos órfãs na galeria.
    const itemId = selectedItem.id;
    const photosToAttach = photos;
    const qtd = conferQty;
    if (vaiEmbalar) setConferindoEEmbalando(true);
    try {
      await conferMutation.mutateAsync({ itemId, displayId: peca.displayId, conferencePhotoUrl: photosToAttach[0], qty: qtd, notes: modalNotes, vaiEmbalar });
    } catch {
      setConferindoEEmbalando(false);
      return; // o onError da mutation já mostrou o toast
    }
    const results = await Promise.allSettled(photosToAttach.map(photoUrl =>
      apiRequest("POST", `/api/items/${itemId}/photos`, {
        photoUrl, kind: "conference",
        uploadedBy: getCurrentUserName(),
      })
    ));
    const fotosFalharam = results.some(r => r.status === "rejected");
    if (vaiEmbalar) {
      // A conferência já está feita: se a embalagem falhar, ela FICA e o toast
      // diz o que falta. Mesma rota do "Embalar sozinha" do painel de tubos.
      try {
        await apiRequest("POST", `/api/events/${peca.eventId}/tubos`, { itens: [{ id: itemId, quantidade: qtd }], fotos: photosToAttach.slice(0, 20), avulso: true });
        toast({
          title: `Conferida e embalada · ${peca.displayId}`,
          description: `${qtd} un. conferida${qtd !== 1 ? "s" : ""} e embalada${qtd !== 1 ? "s" : ""} sozinha${qtd !== 1 ? "s" : ""}. Falta só entregar o volume (aba Tubos).${fotosFalharam ? " Parte das fotos não entrou na galeria da peça." : ""}`,
        });
      } catch (err) {
        toast({
          title: `Conferência feita · ${peca.displayId}`,
          description: `Mas a embalagem não saiu: ${apiErrorMessage(err).replace(/[.s]*$/, "")}. Falta embalar — use o botão Embalar da peça.`,
          variant: "destructive",
        });
      } finally {
        setConferindoEEmbalando(false);
        queryClient.invalidateQueries({ queryKey: [`/api/events/${peca.eventId}/tubos`] });
        queryClient.invalidateQueries({ queryKey: ["/api/tubos"] });
      }
    } else if (fotosFalharam) {
      toast({ title: "Conferência feita", description: "Parte das fotos não pôde ser anexada.", variant: "warning" });
    }
    invalidarGraficaEMaquinas();
  };

  const onPhotoError = (error: Error) =>
    toast({ title: "Erro no upload", description: error.message, variant: "destructive" });

  // `resto`: a peça já está em impressão com PARTE das unidades; o modal abre
  // na etapa 1 (escolher impressora + quantidade) para o que está sem impressora.
  const [iniciandoResto, setIniciandoResto] = useState(false);
  const openProductionModal = (item: PecaDaFila, resto = false) => {
    if (avisarTravada(item)) return;
    setIniciandoResto(resto);
    setSelectedItem(item);
    setModalType("production");
    // A máquina e a quantidade nascem da peça DENTRO do FormularioDeImpressao
    // (montado com key={item.id}); nada a pré-preencher aqui.
  };

  const openConferenceModal = (item: PecaDaFila) => {
    if (avisarTravada(item)) return;
    setSelectedItem(item);
    setModalType("conference");
    setPhotos([]); setModalNotes("");
    setConferQty(remainingConfer(item)); // padrão: o que falta conferir
    setJaEmbalar(CONFERIR_E_EMBALAR);
    setAberturaDoModal(n => n + 1);
  };

  return {
    selectedItem, setSelectedItem, modalType, setModalType,
    conferQty, setConferQty, jaEmbalar, setJaEmbalar, conferindoEEmbalando, fotosSubindo, setFotosSubindo,
    photos, removePhoto, modalNotes, setModalNotes, chaveDoModal, fotoDaAbertura, onPhotoError,
    mutacoesDeImpressao, tirarBloqueada, podeTirarBloqueada, conferMutation, modalPecaRef,
    handleSubmitConference, iniciandoResto, openProductionModal, openConferenceModal,
  };
}
