// ─────────────────────────────────────────────────────────────────────────────
// O ESTADO DO FORMULÁRIO DE PEÇA — os dois modais (entrada de peças e editar)
// e os gestos que os abrem e fecham. Cada gesto zera o que o anterior deixou
// (modelo digitado, prévia da referência, pedido em atendimento): era o reset
// esquecido num deles que fazia o formulário abrir com lixo da vez anterior.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from "react";
import { textoDaObservacao, type LinhaDoPedido, type PedidoDePeca } from "@shared/pedidos-de-peca";
import type { useToast } from "@/hooks/use-toast";
import { EMPTY_ITEM_FORM } from "./regras";
import type { ItemFormData, ModeloDePeca, PecaDoEvento } from "./tipos";

type Toast = ReturnType<typeof useToast>["toast"];

export function useFormularioDaPeca() {
  const [open, setOpen] = useState(false);
  const [localRefPreview, setLocalRefPreview] = useState<string>("");
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [bulkMode, setBulkMode] = useState(true);
  const [editingItem, setEditingItem] = useState<PecaDoEvento | null>(null);
  // Controle do grid de adição em lote: tick avisa o grid que salvou (para ele
  // soltar as linhas gravadas) e o ref guarda quantas linhas ficaram incompletas.
  const [bulkSavedTick, setBulkSavedTick] = useState(0);
  const bulkLeftoverRef = useRef(0);
  // A grade de lote tem algo digitado? Alimentado pelo BulkItemEntry; decide se
  // o X do modal pergunta antes de fechar.
  const bulkTemConteudoRef = useRef(false);
  // Edição de Material/Acabamento: o <datalist> nativo filtra pelas letras já
  // digitadas — na edição, o campo vem preenchido e o dropdown mostrava SÓ o
  // valor atual, escondendo as demais opções. Trocado por <select> com todas
  // as opções + modo "digitar novo" (flags abaixo) para manter a criação no
  // catálogo ao salvar.
  const [customMaterial, setCustomMaterial] = useState(false);
  const [customFinish, setCustomFinish] = useState(false);
  const [formData, setFormData] = useState<ItemFormData>({ ...EMPTY_ITEM_FORM });
  // PEÇA SOLICITADA sendo atendida: "Criar peça" abre o formulário simples já
  // preenchido com AQUELA peça da solicitação; ao salvar, a peça fica ligada a
  // ela e o servidor leva os patrocinadores e as referências.
  const [pedidoEmAtendimento, setPedidoEmAtendimento] = useState<{ pedido: PedidoDePeca; linha: LinhaDoPedido } | null>(null);

  const criarPecaDoPedido = (standardItems: ModeloDePeca[], pedidoDaLinha: PedidoDePeca, pedido: LinhaDoPedido) => {
    setEditingItem(null);
    setBulkMode(false);
    setCustomMaterial(false);
    setCustomFinish(false);
    setLocalRefPreview("");
    // Tipo e medida, quando o solicitante informou: o tipo que casa com um
    // modelo traz material, acabamento e arquivo do modelo, como na escolha
    // manual; a medida do pedido vence a do modelo.
    const modelo = pedido.tipoDePeca ? standardItems.find((s) => s.name === pedido.tipoDePeca) : null;
    const texto = (v: unknown) => (v == null || v === "" ? "" : String(Number(v)));
    setFormData({
      ...EMPTY_ITEM_FORM,
      ...(pedido.tipoDePeca ? { type: pedido.tipoDePeca } : {}),
      ...(modelo ? {
        standardItemId: modelo.id,
        material: modelo.material || "",
        finish: modelo.finish || "",
        fileWidth: texto(modelo.fileWidth),
        fileHeight: texto(modelo.fileHeight),
        visualWidth: texto(modelo.visualWidth),
        visualHeight: texto(modelo.visualHeight),
      } : {}),
      ...(pedido.largura ? { visualWidth: texto(pedido.largura) } : {}),
      ...(pedido.altura ? { visualHeight: texto(pedido.altura) } : {}),
      quantity: pedido.quantidade ?? EMPTY_ITEM_FORM.quantity,
      observations: textoDaObservacao(pedido.observacao),
      referenceUrl: pedido.referencias?.[0] ?? "",
    });
    setPedidoEmAtendimento({ pedido: pedidoDaLinha, linha: pedido });
    setOpen(true);
  };

  /** Inclusão individual do Kit: o formulário de sempre, já na remessa. */
  const abrirNaRemessaDoKit = (remessaId: string) => {
    setEditingItem(null);
    setBulkMode(false);
    setCustomMaterial(false);
    setCustomFinish(false);
    setLocalRefPreview("");
    setPedidoEmAtendimento(null);
    setFormData({ ...EMPTY_ITEM_FORM, kitRemessaId: remessaId });
    setOpen(true);
  };

  /** Abre o modal de edição com a peça hidratada no formulário. */
  const hidratarEdicao = (item: PecaDoEvento) => {
    setLocalRefPreview("");
    // Volta os selects de Material/Acabamento ao modo lista a cada abertura.
    setCustomMaterial(false);
    setCustomFinish(false);
    setEditingItem(item);
    setFormData({
      kitRemessaId: item.kitRemessaId || "",
      type: item.type || "",
      description: item.description || "",
      quantity: item.quantity || 1,
      visualWidth: item.visualWidth || item.area || "",
      visualHeight: item.visualHeight || item.visual || "",
      fileWidth: item.fileWidth || "",
      fileHeight: item.fileHeight || "",
      material: item.material || "",
      finish: item.finish || "",
      measurement: item.measurement || "",
      observations: item.observations || "",
      skipApproval: item.skipApproval || false,
      isPriority: item.isPriority || false,
      isReuse: item.isReuse || false,
      referenceUrl: item.referenceUrl || "",
      standardItemId: item.standardItemId || "",
    });
    setEditDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setPedidoEmAtendimento(null);
    setLocalRefPreview("");
    setEditingItem(null);
    setBulkMode(true);
    setFormData({ ...EMPTY_ITEM_FORM });
    setOpen(false);
  };

  // Abre a entrada de peças (modo lote). O MESMO gesto do botão do cabeçalho
  // e do estado vazio — antes eram duas cópias inline do mesmo reset.
  const abrirEntradaDePecas = () => {
    setEditingItem(null);
    setBulkMode(true);
    // O form simples compartilha os selects com sentinela do editar — volta
    // Material/Acabamento ao modo lista.
    setCustomMaterial(false);
    setCustomFinish(false);
    setOpen(true);
  };

  // Fechamento único do modal de edição (X, Cancelar e ESC/clique-fora):
  // antes o onOpenChange cru deixava editingItem/localRefPreview para trás.
  const handleCloseEditDialog = () => {
    setEditDialogOpen(false);
    setEditingItem(null);
    setLocalRefPreview("");
  };

  return {
    open, setOpen, localRefPreview, setLocalRefPreview, editDialogOpen, setEditDialogOpen,
    bulkMode, setBulkMode, editingItem, setEditingItem, bulkSavedTick, setBulkSavedTick,
    bulkLeftoverRef, bulkTemConteudoRef, customMaterial, setCustomMaterial, customFinish, setCustomFinish,
    formData, setFormData, pedidoEmAtendimento, setPedidoEmAtendimento,
    criarPecaDoPedido, abrirNaRemessaDoKit, hidratarEdicao, handleCloseDialog, abrirEntradaDePecas, handleCloseEditDialog,
  };
}

export type FormularioDaPeca = ReturnType<typeof useFormularioDaPeca>;

/**
 * Ctrl+V: colar um print direto na referência ao editar a peça. Envia o
 * arquivo original, sem compressão, mantendo a qualidade da imagem.
 */
export function useColarPrintNaReferencia(form: FormularioDaPeca, toast: Toast) {
  const { editDialogOpen, setLocalRefPreview, setFormData } = form;
  useEffect(() => {
    if (!editDialogOpen) return;
    const handler = async (e: ClipboardEvent) => {
      const imgItem = Array.from(e.clipboardData?.items || []).find(i => i.type.startsWith("image/"));
      if (!imgItem) return;
      const file = imgItem.getAsFile();
      if (!file) return;
      e.preventDefault();
      const reader = new FileReader();
      reader.onload = ev => setLocalRefPreview(ev.target?.result as string);
      reader.readAsDataURL(file);
      try {
        // Upload via servidor: o PUT direto no storage.googleapis.com é
        // bloqueado em redes corporativas ("Failed to fetch").
        const put = await fetch("/api/objects/upload-direct", { method: "PUT", body: file, headers: { "Content-Type": file.type || "application/octet-stream" } });
        if (!put.ok) throw new Error("upload falhou");
        const { url: objectUrl } = await put.json() as { url: string };
        setFormData(f => ({ ...f, referenceUrl: objectUrl }));
        setLocalRefPreview("");
        toast({ title: "Print anexado", description: "Imagem colada como referência em alta qualidade.", variant: "success" });
      } catch {
        setLocalRefPreview("");
        toast({ title: "Não foi possível colar a imagem", description: "O print não foi anexado — tente de novo ou use “Adicionar referência visual”.", variant: "destructive" });
      }
    };
    window.addEventListener("paste", handler);
    return () => window.removeEventListener("paste", handler);
  }, [editDialogOpen]);
}
