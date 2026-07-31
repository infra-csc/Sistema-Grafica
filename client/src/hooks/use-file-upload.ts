// Lógica compartilhada de upload de arquivos para o Replit Object Storage
// Usada por ObjectUploader.tsx e FileUploader.tsx
import { useRef, useState } from "react";

export interface UseFileUploadOptions {
  maxFileSize: number;
  onGetUploadParameters: () => Promise<{
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
    // Obter URL de upload
    const { url } = await onGetUploadParameters();

    // Fazer upload do arquivo
    const uploadResponse = await fetch(url, {
      method: "PUT",
      body: file,
      headers: {
        "Content-Type": file.type || "application/octet-stream",
      },
    });

    if (!uploadResponse.ok) {
      throw new Error("Erro ao fazer upload do arquivo");
    }

    // Extrair a URL final do objeto (remover query params)
    onComplete?.({ url: url.split("?")[0] });
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
