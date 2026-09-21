// Lógica compartilhada de upload de arquivos para o Replit Object Storage
// Usada por ObjectUploader.tsx, FileUploader.tsx e pelo formulário de
// solicitação de peças.
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
  /**
   * O envio foi CANCELADO pela pessoa. Não é erro (não passa por `onError`),
   * mas quem já pintou algo otimista na tela — a prévia local de uma imagem,
   * um "Subindo…" — precisa saber que o arquivo não vai chegar, senão o
   * indicador gira para sempre.
   */
  onCancel?: () => void;
  /** Validação adicional específica do consumidor (ex.: restringir a imagens). Retorne uma mensagem de erro para bloquear o upload. */
  validateFile?: (file: File) => string | null;
}

/**
 * O que está subindo AGORA — para a tela dizer "Enviando 42%" e o nome do
 * arquivo, em vez de um spinner mudo. Arquivo de 50 MB no Wi-Fi do galpão leva
 * minutos: sem número, a pessoa não sabe se trava ou se espera.
 */
export type EstadoDoEnvio = {
  /** preparando = comprimindo a foto; finalizando = bytes entregues, servidor gravando no bucket. */
  fase: "preparando" | "enviando" | "finalizando";
  nome: string;
  /** 1-based: "arquivo 2 de 3". */
  indice: number;
  total: number;
  /** 0–100, do LOTE inteiro (não só do arquivo atual) — a barra nunca volta para trás. */
  percentual: number;
};

/** Arquivos que falharam por rede/servidor e podem ser reenviados como estão. */
export type FalhaDoEnvio = { mensagem: string; arquivos: File[] };

/** Cancelamento pedido pela pessoa — não é erro e não chega ao `onError`. */
class EnvioCancelado extends Error {
  constructor() { super("Envio cancelado"); }
}

const MENSAGEM_PADRAO = "Erro ao fazer upload do arquivo";

/**
 * PUT com progresso. XHR e não `fetch` por um motivo só: `fetch` não expõe
 * progresso de ENVIO (só de download). Mesma rota, mesmo método, mesmo
 * Content-Type e mesma origem (o cookie de sessão e o Origin do CSRF seguem
 * iguais). Onde não houver XHR, cai no `fetch` de antes, sem progresso.
 */
function enviar(
  corpo: File,
  aoProgredir: (fracao: number) => void,
  guardarXhr: (xhr: XMLHttpRequest | null) => void,
): Promise<{ url: string }> {
  const tipo = corpo.type || "application/octet-stream";
  if (typeof XMLHttpRequest === "undefined") {
    return fetch("/api/objects/upload-direct", { method: "PUT", body: corpo, headers: { "Content-Type": tipo } })
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({})) as { error?: string };
          throw new Error(body.error || MENSAGEM_PADRAO);
        }
        return r.json() as Promise<{ url: string }>;
      });
  }
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    guardarXhr(xhr);
    xhr.open("PUT", "/api/objects/upload-direct");
    xhr.setRequestHeader("Content-Type", tipo);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable && e.total > 0) aoProgredir(e.loaded / e.total); };
    xhr.onload = () => {
      guardarXhr(null);
      let body: { url?: string; error?: string } = {};
      try { body = JSON.parse(xhr.responseText || "{}"); } catch { /* corpo não-JSON (ex.: 413 do proxy) */ }
      if (xhr.status >= 200 && xhr.status < 300 && body.url) resolve({ url: body.url });
      else if (xhr.status === 413) reject(new Error("Arquivo grande demais para o servidor (máximo 50 MB)"));
      else reject(new Error(body.error || MENSAGEM_PADRAO));
    };
    // "Failed to fetch" era a mensagem que chegava ao toast antes — em inglês
    // e sem dizer o que fazer.
    xhr.onerror = () => { guardarXhr(null); reject(new Error("Sem conexão com o servidor — confira a rede e tente de novo")); };
    xhr.onabort = () => { guardarXhr(null); reject(new EnvioCancelado()); };
    xhr.send(corpo);
  });
}

export function useFileUpload({
  maxFileSize,
  onGetUploadParameters,
  onComplete,
  onError,
  onCancel,
  validateFile,
}: UseFileUploadOptions) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [envio, setEnvio] = useState<EstadoDoEnvio | null>(null);
  const [falha, setFalha] = useState<FalhaDoEnvio | null>(null);
  // Refs e não estado: cancelar precisa valer no MESMO tique, dentro do laço.
  const xhrAtual = useRef<XMLHttpRequest | null>(null);
  const cancelado = useRef(false);

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

  const putOne = async (file: File, indice: number, total: number) => {
    // Só re-renderiza quando o NÚMERO muda: o XHR dispara progresso a cada
    // ~50ms e cada evento viraria um render da tela inteira que usa o hook.
    let ultimo = -1;
    const publicar = (fase: EstadoDoEnvio["fase"], fracao: number) => {
      const percentual = Math.min(100, Math.round(((indice + fracao) / total) * 100));
      const chave = percentual * 10 + (fase === "preparando" ? 0 : fase === "enviando" ? 1 : 2);
      if (chave === ultimo) return;
      ultimo = chave;
      setEnvio({ fase, nome: file.name, indice: indice + 1, total, percentual });
    };

    publicar("preparando", 0);
    // COMPRESSÃO NA CAPTURA (UX 27/08): foto de câmera de 5-8 MB vira ~300 KB
    // antes de subir — no Wi-Fi do galpão é a diferença entre 30s e 2s. PDFs,
    // não-imagens e imagens pequenas passam intactos; falha devolve o original.
    const paraSubir = await comprimirImagem(file);
    if (cancelado.current) throw new EnvioCancelado();
    publicar("enviando", 0);
    // Upload via servidor (mesma origem). O caminho antigo — URL assinada +
    // PUT direto no storage.googleapis.com — morre em "Failed to fetch" nas
    // redes corporativas que bloqueiam o host do Google Storage. O servidor
    // valida tipo/tamanho e grava no bucket.
    const { url } = await enviar(
      paraSubir,
      // 100% dos bytes ainda não é "pronto": o servidor grava no bucket antes
      // de responder. Sem a fase "finalizando" a barra parava cheia e muda.
      (fracao) => publicar(fracao >= 1 ? "finalizando" : "enviando", fracao),
      (xhr) => { xhrAtual.current = xhr; },
    );
    onComplete?.({ url });
  };

  const finish = () => {
    setIsUploading(false);
    setEnvio(null);
    xhrAtual.current = null;
    // Limpar input para permitir selecionar o mesmo arquivo novamente
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Upload sequencial: uma falha não derruba os arquivos restantes. Os que
  // falharam ficam guardados em `falha` para o "Tentar de novo" — reenviar é
  // um clique, não escolher o arquivo de novo no explorador.
  const uploadFiles = async (files: File[]) => {
    if (files.length === 0) return;
    cancelado.current = false;
    setFalha(null);
    setIsUploading(true);
    const falharam: File[] = [];
    let mensagem = "";
    try {
      for (let i = 0; i < files.length; i++) {
        if (cancelado.current) break;
        try {
          await putOne(files[i], i, files.length);
        } catch (error) {
          if (error instanceof EnvioCancelado) { onCancel?.(); break; }
          const erro = error instanceof Error ? error : new Error("Erro no upload");
          falharam.push(files[i]);
          mensagem = erro.message;
          onError?.(erro);
        }
      }
    } finally {
      finish();
      if (falharam.length > 0) setFalha({ mensagem, arquivos: falharam });
    }
  };

  const uploadFile = (file: File) => uploadFiles([file]);

  /** Interrompe o arquivo que está subindo e desiste dos que faltam. Não chama `onError`. */
  const cancelar = () => {
    cancelado.current = true;
    xhrAtual.current?.abort();
  };

  /** Reenvia exatamente os arquivos que falharam na última tentativa. */
  const tentarDeNovo = () => {
    if (!falha || isUploading) return;
    void uploadFiles(falha.arquivos);
  };

  const dispensarFalha = () => setFalha(null);

  return {
    fileInputRef,
    isUploading,
    validateAndGetFile,
    validateAndGetFiles,
    uploadFile,
    uploadFiles,
    envio,
    falha,
    cancelar,
    tentarDeNovo,
    dispensarFalha,
  };
}
