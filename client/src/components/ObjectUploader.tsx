// Replit Object Storage Uploader Component
// Reference: blueprint:javascript_object_storage
import { useRef, useState } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

interface ObjectUploaderProps {
  maxNumberOfFiles?: number;
  maxFileSize?: number;
  onGetUploadParameters: () => Promise<{
    method: "PUT";
    url: string;
  }>;
  onComplete?: (result: { url: string }) => void;
  onError?: (error: Error) => void;
  buttonClassName?: string;
  buttonVariant?: "default" | "outline" | "ghost" | "secondary";
  children: ReactNode;
}

/**
 * Componente de upload de arquivos para o Replit Object Storage
 * 
 * Upload simplificado via input file com upload automático ao selecionar arquivo
 */
export function ObjectUploader({
  maxFileSize = 10485760, // 10MB default
  onGetUploadParameters,
  onComplete,
  onError,
  buttonClassName,
  buttonVariant = "default",
  children,
}: ObjectUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validações
    if (!file.type.startsWith('image/')) {
      onError?.(new Error('Apenas imagens são permitidas'));
      return;
    }

    if (file.size > maxFileSize) {
      onError?.(new Error(`Arquivo muito grande. Máximo: ${Math.round(maxFileSize / 1024 / 1024)}MB`));
      return;
    }

    setIsUploading(true);

    try {
      // Obter URL de upload
      const { url } = await onGetUploadParameters();

      // Fazer upload do arquivo
      const uploadResponse = await fetch(url, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type,
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
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
        data-testid="input-file-upload"
      />
      <Button 
        onClick={() => fileInputRef.current?.click()} 
        className={buttonClassName}
        variant={buttonVariant}
        type="button"
        disabled={isUploading}
        data-testid="button-upload-photo"
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
