// ─────────────────────────────────────────────────────────────────────────────
// SUBIR ARQUIVO na Arte: o upload direto (via servidor), o do lote, o colar
// com Ctrl+V nos modais de aprovação e de correção, e a prévia otimista do
// thumb de aprovação — que volta atrás quando o envio falha.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { useToast } from "@/hooks/use-toast";
import { apiRequest, MENSAGEM_SEM_CONEXAO } from "@/lib/queryClient";
import { convertGCSUrlToLocalPath } from "@/lib/artePdfExport";
import { erroDeTamanhoDoUpload, mensagemDoUploadFalho } from "@/lib/arte-rules";
import { textoDoErro } from "./constantes";
import type { PecaDaArte, PecaDaCorrecao } from "./tipos";

export type UploadsDaArte = ReturnType<typeof useUploadsDaArte>;

export function useUploadsDaArte({
  toast, selectedItem, approvalThumbUrl, setApprovalThumbUrl, setApprovalThumbPreview,
  correcaoItem, setCorrecaoThumbUrl, setCorrecaoFileName,
}: {
  toast: ReturnType<typeof useToast>["toast"];
  selectedItem: PecaDaArte | null;
  approvalThumbUrl: string;
  setApprovalThumbUrl: Dispatch<SetStateAction<string>>;
  setApprovalThumbPreview: Dispatch<SetStateAction<string>>;
  correcaoItem: PecaDaCorrecao | null;
  setCorrecaoThumbUrl: Dispatch<SetStateAction<string>>;
  setCorrecaoFileName: Dispatch<SetStateAction<string>>;
}) {
  const getUploadUrl = async () => {
    const response = await apiRequest("POST", "/api/objects/upload", {});
    const data = await response.json() as { uploadURL: string };
    return { method: "PUT" as const, url: data.uploadURL };
  };

  const [isPasteUploading, setIsPasteUploading] = useState(false);

  const uploadFileDirect = useCallback(async (
    file: File,
    onComplete: (localPath: string) => void,
    // Quem pintou uma prévia otimista antes de o arquivo subir precisa
    // desfazê-la quando ele NÃO sobe — ver `desfazerEnvioDoThumb`.
    onFail?: () => void,
  ) => {
    // Grande demais: diz antes de subir, em vez de esperar o 413 do servidor.
    const grandeDemais = erroDeTamanhoDoUpload(file);
    if (grandeDemais) {
      toast({ title: "Arquivo grande demais", description: grandeDemais, variant: "warning" });
      onFail?.();
      return;
    }
    setIsPasteUploading(true);
    try {
      // Upload via servidor: o PUT direto no storage.googleapis.com é
      // bloqueado em redes corporativas ("Failed to fetch").
      const res = await fetch("/api/objects/upload-direct", {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "image/png" },
      });
      // A frase do servidor ("Tipo de arquivo não permitido"…) no lugar de
      // "Falha no upload", que não dizia o que fazer.
      if (!res.ok) throw new Error(mensagemDoUploadFalho(res.status, await res.text().catch(() => "")));
      const { url: objectUrl } = await res.json() as { url: string };
      const localPath = convertGCSUrlToLocalPath(objectUrl);
      onComplete(localPath);
      // Esta função serve o COLAR e também o ARRASTAR (Aprovação e Correção):
      // "Imagem colada! Upload via Ctrl+V" aparecia para quem tinha arrastado
      // um arquivo. O nome do arquivo é o que confirma que subiu o certo.
      toast({ title: "Arquivo carregado", description: file.name && file.name !== "image.png" ? file.name : "Imagem colada da área de transferência.", variant: "success" });
    } catch (e) {
      toast({ title: "Não foi possível subir a imagem", description: e instanceof TypeError ? MENSAGEM_SEM_CONEXAO : textoDoErro(e), variant: "destructive" });
      onFail?.();
    } finally {
      setIsPasteUploading(false);
    }
  }, [toast]);

  // ── Envio do thumb de aprovação: prévia otimista com volta ──
  // A miniatura aparece no instante da escolha (leitura local em data: URL) e
  // troca a zona vazia pelo bloco da miniatura. Se o envio FALHA ou é
  // cancelado, sem desfazer isso a tela ficava presa: prévia local, nenhuma
  // URL, "Subindo o thumb…" girando para sempre e a zona vazia — com o
  // "Escolher arquivo" — desmontada, sem caminho para tentar de novo.
  // Por isso o "subindo" é um ESTADO EXPLÍCITO (e não "há prévia mas não há
  // URL"), e a falha devolve a prévia ao último thumb que de fato subiu.
  // Refs porque o colar roda num handler de `paste` registrado por efeito: o
  // valor lido ali tem de ser o de agora, não o do render que o registrou.
  const [thumbEnviando, setThumbEnviando] = useState(false);
  const thumbEnviandoRef = useRef(false);
  const approvalThumbUrlRef = useRef("");
  approvalThumbUrlRef.current = approvalThumbUrl;
  const iniciarEnvioDoThumb = (file: File) => {
    thumbEnviandoRef.current = true;
    setThumbEnviando(true);
    const reader = new FileReader();
    // Só pinta se o envio ainda está no ar: a leitura local pode terminar
    // DEPOIS de uma falha rápida (e religaria a prévia órfã) ou depois do
    // sucesso (e trocaria a URL real pelo data:).
    reader.onload = (ev) => { if (thumbEnviandoRef.current) setApprovalThumbPreview(ev.target?.result as string); };
    reader.readAsDataURL(file);
  };
  const concluirEnvioDoThumb = (localPath: string) => {
    thumbEnviandoRef.current = false;
    setThumbEnviando(false);
    setApprovalThumbUrl(localPath);
    setApprovalThumbPreview(localPath);
  };
  const desfazerEnvioDoThumb = () => {
    thumbEnviandoRef.current = false;
    setThumbEnviando(false);
    // Vazio quando ainda não havia thumb: a zona vazia volta, com o botão.
    setApprovalThumbPreview(approvalThumbUrlRef.current);
  };

  // Ctrl+V: colar thumb no modal de aprovação (selectedItem). Só quando a peça
  // aceita thumb — a zona de upload do modal aparece apenas em
  // awaiting_submission; sem esta guarda, colar com uma peça de outra fase
  // aberta subia um arquivo que nenhuma UI mostrava.
  useEffect(() => {
    if (!selectedItem || selectedItem.status !== 'awaiting_submission') return;
    const handler = (e: ClipboardEvent) => {
      if (isPasteUploading) return; // evita upload duplo antes do primeiro terminar
      const items = Array.from(e.clipboardData?.items || []);
      const imageItem = items.find(i => i.type.startsWith("image/"));
      if (!imageItem) return;
      const file = imageItem.getAsFile();
      if (!file) return;
      e.preventDefault();
      iniciarEnvioDoThumb(file);
      uploadFileDirect(file, (localPath) => {
        concluirEnvioDoThumb(localPath);
        // Colou, subiu: o próximo gesto é enviar (ver focarEnvioParaAprovacao).
        // Chamado dentro do handler, e não listado nas deps: a função é
        // declarada mais abaixo no componente e é estável (useCallback []).
        focarEnvioParaAprovacao();
      }, desfazerEnvioDoThumb);
    };
    window.addEventListener("paste", handler);
    return () => window.removeEventListener("paste", handler);
  }, [selectedItem, uploadFileDirect, isPasteUploading]);

  // Ctrl+V: colar thumb no modal de correção (correcaoItem)
  useEffect(() => {
    if (!correcaoItem) return;
    const handler = (e: ClipboardEvent) => {
      if (isPasteUploading) return; // mesma guarda do modal de aprovação
      const items = Array.from(e.clipboardData?.items || []);
      const imageItem = items.find(i => i.type.startsWith("image/"));
      if (!imageItem) return;
      const file = imageItem.getAsFile();
      if (!file) return;
      e.preventDefault();
      uploadFileDirect(file, (localPath) => {
        setCorrecaoThumbUrl(localPath);
        setCorrecaoFileName(file.name || "Imagem colada");
      });
    };
    window.addEventListener("paste", handler);
    return () => window.removeEventListener("paste", handler);
  }, [correcaoItem, uploadFileDirect, isPasteUploading]);

  // Upload sem alterar isPasteUploading (usado no bulk). Via servidor: o PUT
  // direto no storage.googleapis.com é bloqueado em redes corporativas.
  const uploadFileRaw = useCallback(async (file: File): Promise<string> => {
    // Grande demais não sobe: o cartão mostra o limite, sem gastar o envio.
    const grandeDemais = erroDeTamanhoDoUpload(file);
    if (grandeDemais) throw new Error(grandeDemais);
    let res: Response;
    try {
      res = await fetch("/api/objects/upload-direct", { method: "PUT", body: file, headers: { "Content-Type": file.type || "image/jpeg" } });
    } catch {
      throw new Error(MENSAGEM_SEM_CONEXAO);
    }
    if (!res.ok) throw new Error(mensagemDoUploadFalho(res.status, await res.text().catch(() => "")));
    const { url } = await res.json() as { url: string };
    return convertGCSUrlToLocalPath(url);
  }, []);

  /**
   * Leva o foco ao "Enviar para aprovação" quando o thumb acaba de subir.
   * O upload troca a zona vazia pelo bloco com a miniatura (outro nó), então o
   * foco — que estava no botão de escolher arquivo — caía no <body>, e quem
   * usa teclado precisava voltar tabulando desde o topo do modal. Dois quadros:
   * um para o React montar o bloco novo, outro para o botão existir no DOM.
   *
   * SÓ PUXA O FOCO DE QUEM NÃO ESTÁ USANDO. O upload leva segundos, e nesse
   * meio-tempo a pessoa pode ter ido digitar noutro campo do modal: roubar o
   * foco dali para "Enviar" fazia o próximo Enter mandar a peça para aprovação
   * sem querer. Move só se o foco caiu no <body> (o botão de escolher sumiu),
   * no PRÓPRIO contêiner do diálogo (o FocusScope do Radix devolve para lá o
   * foco de um nó removido — é o mesmo "caiu", um nível acima) ou ainda está
   * dentro da zona do thumb.
   */
  const zonaDoThumbRef = useRef<HTMLElement | null>(null);
  const focarEnvioParaAprovacao = useCallback(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const ativo = document.activeElement;
      const livre = !ativo || ativo === document.body
        || ativo.matches('[role="dialog"], [role="alertdialog"]')
        || !!zonaDoThumbRef.current?.contains(ativo);
      if (!livre) return;
      (document.querySelector('[data-testid="button-submit-approval-header"]') as HTMLButtonElement | null)?.focus();
    }));
  }, []);

  return {
    getUploadUrl, isPasteUploading, uploadFileDirect, uploadFileRaw,
    thumbEnviando, iniciarEnvioDoThumb, concluirEnvioDoThumb, desfazerEnvioDoThumb,
    zonaDoThumbRef, focarEnvioParaAprovacao,
  };
}
