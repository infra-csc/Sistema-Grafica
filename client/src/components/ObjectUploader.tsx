// Replit Object Storage Uploader Component
// Reference: blueprint:javascript_object_storage
import { useEffect, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useFileUpload } from "@/hooks/use-file-upload";
import { ProgressoDoEnvio, rotuloDoEnvio } from "@/components/FileUploader";

interface ObjectUploaderProps {
  maxNumberOfFiles?: number;
  maxFileSize?: number;
  /** Legado (opcional): o upload passa pelo servidor e não usa mais URL assinada. */
  onGetUploadParameters?: () => Promise<{
    method: "PUT";
    url: string;
  }>;
  /** Chamado uma vez por arquivo enviado. */
  onComplete?: (result: { url: string }) => void;
  onError?: (error: Error) => void;
  onFileSelect?: (file: File, previewUrl: string) => void;
  /** Permite selecionar vários arquivos de uma vez. */
  multiple?: boolean;
  /** Abre a câmera traseira direto no celular, em vez da galeria. */
  capture?: boolean;
  buttonClassName?: string;
  buttonVariant?: "default" | "outline" | "ghost" | "secondary";
  children: ReactNode;
  /** Esconde a faixa de progresso/erro sob o botão (mesmo contrato do FileUploader). */
  ocultarProgresso?: boolean;
  /** Avisa quando um envio começa/termina — quem confirma com a foto espera por ela. */
  onEnviandoMudou?: (enviando: boolean) => void;
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
  multiple = false,
  capture = false,
  buttonClassName,
  buttonVariant = "default",
  children,
  ocultarProgresso = false,
  onEnviandoMudou,
}: ObjectUploaderProps) {
  const { fileInputRef, isUploading, validateAndGetFile, validateAndGetFiles, uploadFile, uploadFiles, envio, falha, cancelar, tentarDeNovo, dispensarFalha } = useFileUpload({
    maxFileSize,
    onGetUploadParameters,
    onComplete,
    onError,
    validateFile: (file) => (!file.type.startsWith("image/") ? "Apenas imagens são permitidas" : null),
  });

  useEffect(() => { onEnviandoMudou?.(isUploading); }, [isUploading]); // eslint-disable-line react-hooks/exhaustive-deps

  // Preview local imediato, antes do upload terminar.
  const preview = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => onFileSelect?.(file, e.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (multiple) {
      const files = validateAndGetFiles(event);
      if (!files.length) return;
      files.forEach(preview);
      await uploadFiles(files);
      return;
    }

    const file = validateAndGetFile(event);
    if (!file) return;
    preview(file);
    await uploadFile(file);
  };

  return (
    <div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple={multiple}
        {...(capture ? { capture: "environment" as const } : {})}
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
        // Mesmo motivo do FileUploader: desabilitado durante o envio precisa
        // dizer que está OCUPADO, não só indisponível.
        aria-busy={isUploading || undefined}
        data-testid="button-upload-photo"
      >
        {isUploading ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            <span style={{ fontVariantNumeric: "tabular-nums" }}>{rotuloDoEnvio(envio)}</span>
          </>
        ) : (
          children
        )}
      </Button>
      {!ocultarProgresso && (
        <ProgressoDoEnvio
          envio={envio}
          falha={falha}
          onCancelar={cancelar}
          onTentarDeNovo={tentarDeNovo}
          onDispensar={dispensarFalha}
          // Sem `onError` (as referências visuais do evento) a falha era
          // silenciosa: a faixa vira o aviso e diz a frase inteira.
          mensagemNaFalha={!onError}
        />
      )}
    </div>
  );
}
