// Generic File Uploader Component for Replit Object Storage
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useFileUpload } from "@/hooks/use-file-upload";

interface FileUploaderProps {
  maxFileSize?: number;
  /** Legado (opcional): o upload passa pelo servidor e não usa mais URL assinada. */
  onGetUploadParameters?: () => Promise<{
    method: "PUT";
    url: string;
  }>;
  onComplete?: (result: { url: string }) => void;
  onError?: (error: Error) => void;
  onFileSelect?: (file: File) => void;
  buttonClassName?: string;
  buttonVariant?: "default" | "outline" | "ghost" | "secondary";
  children: ReactNode;
  accept?: string; // e.g., "image/*", ".pdf,.ai,.psd"
  disabled?: boolean;
}

/**
 * Componente de upload de arquivos para o Replit Object Storage
 * Aceita qualquer tipo de arquivo (imagens, PDFs, etc.)
 */
export function FileUploader({
  maxFileSize = 52428800, // 50MB default
  onGetUploadParameters,
  onComplete,
  onError,
  onFileSelect,
  buttonClassName,
  buttonVariant = "default",
  children,
  accept = "*/*",
  disabled = false,
}: FileUploaderProps) {
  const { fileInputRef, isUploading, validateAndGetFile, uploadFile } = useFileUpload({
    maxFileSize,
    onGetUploadParameters,
    onComplete,
    onError,
  });

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = validateAndGetFile(event);
    if (!file) return;

    // Notificar seleção do arquivo
    onFileSelect?.(file);

    await uploadFile(file);
  };

  return (
    <div>
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        onChange={handleFileSelect}
        className="hidden"
        data-testid="input-file-upload"
      />
      <Button
        onClick={() => fileInputRef.current?.click()}
        className={buttonClassName}
        variant={buttonVariant}
        type="button"
        disabled={isUploading || disabled}
        data-testid="button-upload-file"
      >
        {isUploading ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Enviando...
          </>
        ) : (
          children
        )}
      </Button>
    </div>
  );
}
