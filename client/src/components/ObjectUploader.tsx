// Replit Object Storage Uploader Component
// Reference: blueprint:javascript_object_storage
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useFileUpload } from "@/hooks/use-file-upload";

interface ObjectUploaderProps {
  maxNumberOfFiles?: number;
  maxFileSize?: number;
  onGetUploadParameters: () => Promise<{
    method: "PUT";
    url: string;
  }>;
  onComplete?: (result: { url: string }) => void;
  onError?: (error: Error) => void;
  onFileSelect?: (file: File, previewUrl: string) => void;
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
  onFileSelect,
  buttonClassName,
  buttonVariant = "default",
  children,
}: ObjectUploaderProps) {
  const { fileInputRef, isUploading, validateAndGetFile, uploadFile } = useFileUpload({
    maxFileSize,
    onGetUploadParameters,
    onComplete,
    onError,
    validateFile: (file) => (!file.type.startsWith("image/") ? "Apenas imagens são permitidas" : null),
  });

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = validateAndGetFile(event);
    if (!file) return;

    // Criar preview local IMEDIATAMENTE
    const reader = new FileReader();
    reader.onload = (e) => {
      const previewUrl = e.target?.result as string;
      onFileSelect?.(file, previewUrl);
    };
    reader.readAsDataURL(file);

    await uploadFile(file);
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
