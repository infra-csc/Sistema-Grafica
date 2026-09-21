// Generic File Uploader Component for Replit Object Storage
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertCircle, Loader2, RotateCcw, X } from "lucide-react";
import { useFileUpload, type EstadoDoEnvio, type FalhaDoEnvio } from "@/hooks/use-file-upload";
import { useIsMobile } from "@/hooks/use-mobile";
import { FS, R } from "@/lib/theme";

interface FileUploaderProps {
  maxFileSize?: number;
  /** Legado (opcional): o upload passa pelo servidor e não usa mais URL assinada. */
  onGetUploadParameters?: () => Promise<{
    method: "PUT";
    url: string;
  }>;
  onComplete?: (result: { url: string }) => void;
  onError?: (error: Error) => void;
  /** Envio cancelado pela pessoa (não é erro). Ver `useFileUpload`. */
  onCancel?: () => void;
  onFileSelect?: (file: File) => void;
  buttonClassName?: string;
  buttonVariant?: "default" | "outline" | "ghost" | "secondary";
  children: ReactNode;
  accept?: string; // e.g., "image/*", ".pdf,.ai,.psd"
  disabled?: boolean;
  /**
   * Esconde a faixa de progresso/erro sob o botão (o rótulo do botão continua
   * dizendo "Enviando 42%"). Para lugares apertados, onde uma linha a mais
   * empurraria o layout — o padrão é mostrar.
   */
  ocultarProgresso?: boolean;
}

/** "Enviando 42%" / "Preparando…" / "Finalizando…" — o rótulo do botão durante o envio. */
export function rotuloDoEnvio(envio: EstadoDoEnvio | null): string {
  if (!envio || envio.fase === "preparando") return "Preparando…";
  if (envio.fase === "finalizando") return "Finalizando…";
  return `Enviando ${envio.percentual}%`;
}

// Abaixo disto o envio termina antes de o olho ler a faixa: mostrar só faria
// a tela piscar. Foto comprimida (~300 KB) cai quase sempre aqui.
const ATRASO_DA_FAIXA_MS = 400;

/**
 * A faixa sob o botão: nome do arquivo, barra, percentual e "Cancelar"
 * enquanto sobe; "Tentar de novo" quando falha. Compartilhada pelos dois
 * uploaders e pelo formulário de solicitação de peças — o mesmo envio tem a
 * mesma cara em todo lugar.
 */
export function ProgressoDoEnvio({ envio, falha, onCancelar, onTentarDeNovo, onDispensar, mensagemNaFalha = true, desabilitado = false }: {
  envio: EstadoDoEnvio | null;
  falha: FalhaDoEnvio | null;
  onCancelar: () => void;
  onTentarDeNovo: () => void;
  onDispensar: () => void;
  /**
   * Falso quando quem usa já mostra o erro (toast pelo `onError`): a faixa
   * fica só com o nome e o "Tentar de novo", sem repetir a frase. Também tira
   * o `role="alert"` — dois anúncios do mesmo erro é ruído para quem ouve.
   */
  mensagemNaFalha?: boolean;
  desabilitado?: boolean;
}) {
  const isMobile = useIsMobile();
  const [visivel, setVisivel] = useState(false);
  const subindo = !!envio;
  useEffect(() => {
    if (!subindo) { setVisivel(false); return; }
    const t = setTimeout(() => setVisivel(true), ATRASO_DA_FAIXA_MS);
    return () => clearTimeout(t);
  }, [subindo]);

  const LINHA: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6, minWidth: 0, fontSize: FS.small, lineHeight: 1.35 };
  // Alvo na régua da casa (36 ponteiro / 44 toque) SEM moldura: a faixa é
  // secundária e um botão contornado de 36px pesaria mais que o próprio
  // envio. Cresce a área de clique, não o traço.
  const BOTAO: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: 4, flexShrink: 0, minHeight: isMobile ? 44 : 36, padding: "0 6px",
    borderRadius: R.sm, border: "none", background: "transparent", color: "#44403c",
    fontSize: FS.small, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap",
    textDecoration: "underline", textUnderlineOffset: 2,
  };
  const NOME: React.CSSProperties = { minWidth: 0, flex: "1 1 auto", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };

  if (envio && visivel) {
    const lote = envio.total > 1 ? `${envio.indice} de ${envio.total} · ` : "";
    return (
      <div data-testid="progresso-do-envio" style={{ display: "flex", flexDirection: "column", gap: 0, marginTop: 2, maxWidth: 280, minWidth: 0 }}>
        <div style={LINHA}>
          <span style={{ ...NOME, color: "#57534e" }} title={envio.nome}>
            <strong style={{ color: "#1c1917", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{rotuloDoEnvio(envio)}</strong>
            {" · "}{lote}{envio.nome}
          </span>
          {/* Na fase "finalizando" os bytes já chegaram e o servidor está
              gravando: cancelar ali só deixaria um arquivo órfão no bucket. */}
          {envio.fase !== "finalizando" && (
            <button type="button" onClick={onCancelar} data-testid="button-cancelar-envio" style={BOTAO}>
              Cancelar
            </button>
          )}
        </div>
        <div
          role="progressbar"
          aria-label={`Envio de ${envio.nome}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={envio.percentual}
          aria-valuetext={`${rotuloDoEnvio(envio)} — ${lote}${envio.nome}`}
          style={{ height: 4, borderRadius: R.pill, background: "#e7e5e4", overflow: "hidden" }}
        >
          <div style={{ height: "100%", width: `${Math.max(envio.percentual, envio.fase === "preparando" ? 0 : 3)}%`, background: "#44403c", borderRadius: R.pill, transition: "width 0.2s linear" }} />
        </div>
      </div>
    );
  }

  if (!envio && falha) {
    const um = falha.arquivos.length === 1;
    const nomes = um ? falha.arquivos[0].name : `${falha.arquivos.length} arquivos`;
    return (
      <div data-testid="falha-do-envio" role={mensagemNaFalha ? "alert" : undefined}
        style={{ display: "flex", flexDirection: "column", marginTop: 6, maxWidth: 280, minWidth: 0, padding: "0 0 0 10px", borderRadius: R.md, background: "#fef2f2", border: "1px solid #fecaca" }}>
        <div style={LINHA}>
          <AlertCircle aria-hidden="true" style={{ width: 13, height: 13, color: "#b91c1c", flexShrink: 0 }} />
          <span style={{ ...NOME, color: "#991b1b", fontWeight: 700 }} title={nomes}>{um ? "Não foi enviado" : "Não foram enviados"} · {nomes}</span>
          <button type="button" onClick={onDispensar} aria-label="Dispensar o aviso de falha"
            style={{ ...BOTAO, width: isMobile ? 44 : 36, padding: 0, justifyContent: "center", color: "#57534e", textDecoration: "none" }}>
            <X aria-hidden="true" style={{ width: 13, height: 13 }} />
          </button>
        </div>
        {mensagemNaFalha && falha.mensagem && (
          <span style={{ paddingRight: 10, fontSize: FS.small, color: "#7f1d1d", lineHeight: 1.4, overflowWrap: "anywhere" }}>{falha.mensagem}</span>
        )}
        <button type="button" onClick={onTentarDeNovo} disabled={desabilitado} data-testid="button-tentar-envio-de-novo"
          style={{ ...BOTAO, alignSelf: "flex-start", marginLeft: -6, color: "#991b1b", cursor: desabilitado ? "not-allowed" : "pointer" }}>
          <RotateCcw aria-hidden="true" style={{ width: 12, height: 12 }} /> Tentar de novo
        </button>
      </div>
    );
  }

  return null;
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
  onCancel,
  onFileSelect,
  buttonClassName,
  buttonVariant = "default",
  children,
  accept = "*/*",
  disabled = false,
  ocultarProgresso = false,
}: FileUploaderProps) {
  const { fileInputRef, isUploading, validateAndGetFile, uploadFile, envio, falha, cancelar, tentarDeNovo, dispensarFalha } = useFileUpload({
    maxFileSize,
    onGetUploadParameters,
    onComplete,
    onError,
    onCancel,
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
        // aria-busy: o rótulo troca para "Enviando 42%" mas o botão fica
        // desabilitado — sem isto o leitor de tela só anuncia "indisponível".
        aria-busy={isUploading || undefined}
        data-testid="button-upload-file"
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
          // Sem `onError` o erro morria em silêncio (a Arte tem uploaders
          // assim): aqui a faixa passa a ser o único aviso, então diz a frase.
          mensagemNaFalha={!onError}
          desabilitado={disabled}
        />
      )}
    </div>
  );
}
