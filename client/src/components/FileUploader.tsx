// Generic File Uploader Component for Replit Object Storage
import { useRef, useState } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, X } from "lucide-react";

interface FileUploaderProps {
  maxFileSize?: number;
  onGetUploadParameters: () => Promise<{
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validar tamanho
    if (file.size > maxFileSize) {
      onError?.(new Error(`Arquivo muito grande. Máximo: ${Math.round(maxFileSize / 1024 / 1024)}MB`));
      return;
    }

    // Notificar seleção do arquivo
    onFileSelect?.(file);

    setIsUploading(true);

    try {
      // Obter URL de upload
      const { url } = await onGetUploadParameters();

      // Fazer upload do arquivo
      const uploadResponse = await fetch(url, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type || 'application/octet-stream',
        },
      });

      if (!uploadResponse.ok) {
        throw new Error('Erro ao fazer upload do arquivo');
      }

      // Extrair a URL final do objeto (remover query params)
      const objectUrl = url.split('?')[0];
      
      onComplete?.({ url: objectUrl });
    } catch (error) {
      onError?.(error instanceof Error ? error : new Error('Erro no upload'));
    } finally {
      setIsUploading(false);
      // Limpar input para permitir selecionar o mesmo arquivo novamente
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
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
