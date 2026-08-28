// Lógica compartilhada de upload de arquivos para o Replit Object Storage
// Usada por ObjectUploader.tsx e FileUploader.tsx
import { useRef, useState } from "react";
import { comprimirImagem } from "@/lib/comprimir-imagem";

export interface UseFileUploadOptions {
  maxFileSize: number;
  /** Legado (opcional): o upload hoje passa pelo servidor (/api/objects/upload-direct)
   *  e não usa mais URL assinada — a prop fica aceita para não quebrar consumidores. */
  onGetUploadParameters?: () => Promise<{
    method: "PUT";
    url: string;
  }>;
  onComplete?: (result: { url: string }) => void;
  onError?: (error: Error) => void;
  /** Validação adicional específica do consumidor (ex.: restringir a imagens). Retorne uma mensagem de erro para bloquear o upload. */
  validateFile?: (file: File) => string | null;
}

export function useFileUpload({
  maxFileSize,
  onGetUploadParameters,
  onComplete,
  onError,
  validateFile,
}: UseFileUploadOptions) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  const check = (file: File): boolean => {
    const customError = validateFile?.(file);
    if (customError) {
      onError?.(new Error(customError));
      return false;
    }

    if (file.size > maxFileSize) {
      onError?.(new Error(`Arquivo muito grande. Máximo: ${Math.round(maxFileSize / 1024 / 1024)}MB`));
      return false;
    }

    return true;
  };

  const validateAndGetFile = (event: React.ChangeEvent<HTMLInputElement>): File | null => {
    const file = event.target.files?.[0];
    if (!file) return null;
    return check(file) ? file : null;
  };

  // Versão plural, para inputs com `multiple`. Arquivos reprovados são
  // descartados individualmente — os demais seguem para o upload.
  const validateAndGetFiles = (event: React.ChangeEvent<HTMLInputElement>): File[] =>
    Array.from(event.target.files ?? []).filter(check);

  const putOne = async (file: File) => {
    // COMPRESSÃO NA CAPTURA (UX 27/08): foto de câmera de 5-8 MB vira ~300 KB
    // antes de subir — no Wi-Fi do galpão é a diferença entre 30s e 2s. PDFs,
    // não-imagens e imagens pequenas passam intactos; falha devolve o original.
    const paraSubir = await comprimirImagem(file);
    // Upload via servidor (mesma origem). O caminho antigo — URL assinada +
    // PUT direto no storage.googleapis.com — morre em "Failed to fetch" nas
    // redes corporativas que bloqueiam o host do Google Storage. O servidor
    // valida tipo/tamanho e grava no bucket.
    const uploadResponse = await fetch("/api/objects/upload-direct", {
      method: "PUT",
      body: paraSubir,
      headers: {
        "Content-Type": paraSubir.type || "application/octet-stream",
      },
    });

    if (!uploadResponse.ok) {
      const body = await uploadResponse.json().catch(() => ({})) as { error?: string };
      throw new Error(body.error || "Erro ao fazer upload do arquivo");
    }

    const { url } = await uploadResponse.json() as { url: string };
    onComplete?.({ url });
  };

  const finish = () => {
    setIsUploading(false);
    // Limpar input para permitir selecionar o mesmo arquivo novamente
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const uploadFile = async (file: File) => {
    setIsUploading(true);
    try {
      await putOne(file);
    } catch (error) {
      onError?.(error instanceof Error ? error : new Error("Erro no upload"));
    } finally {
      finish();
    }
  };

  // Upload sequencial: uma falha não derruba os arquivos restantes.
  const uploadFiles = async (files: File[]) => {
    setIsUploading(true);
    try {
      for (const file of files) {
        try {
          await putOne(file);
        } catch (error) {
          onError?.(error instanceof Error ? error : new Error("Erro no upload"));
        }
      }
    } finally {
      finish();
    }
  };

  return {
    fileInputRef,
    isUploading,
    validateAndGetFile,
    validateAndGetFiles,
    uploadFile,
    uploadFiles,
  };
}
