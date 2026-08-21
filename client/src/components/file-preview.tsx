import { useEffect, useState } from "react";
import { ImageOff } from "lucide-react";

interface FilePreviewProps {
  url: string;
  linkUrl?: string;
  style?: React.CSSProperties;
  objectFit?: "contain" | "cover";
  /**
   * Não envolver a imagem num <a>. Para telas que oferecem "Abrir em nova
   * aba" como ação explícita ao lado do preview — o clique na imagem inteira
   * (com title de "resolução máxima") vira ruído nesses casos.
   */
  noLink?: boolean;
}

export function isPdf(url: string): boolean {
  return /\.pdf(\?|#|$)/i.test(url) || url.includes("pdf%2F");
}

/**
 * O "arquivo" é um endereço que o NAVEGADOR consegue abrir? Caminho de rede
 * (\\10.100.1.7\...) e caminho de disco (C:\...) NÃO são: a Arte registra o
 * caminho do TIF no servidor local, e oferecer "Abrir arquivo"/"Abrir em nova
 * aba" para isso é promessa que nunca funciona — o único gesto útil é copiar
 * o caminho e colar no Explorer.
 */
export function isWebUrl(url: string): boolean {
  return /^https?:\/\//i.test(url) || url.startsWith("/");
}

export function isImageUrl(url: string): boolean {
  return (
    /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(url) ||
    url.startsWith("/objects/") ||
    url.startsWith("http")
  );
}

/**
 * O QUE A URL DEVOLVE, conferido antes de montar o <iframe>.
 *
 * Visto em produção: o painel "Aprovado pelo patrocinador" renderizando
 * `{"error":"Não autenticado"}` com barra de rolagem e a caixa de "Estilos de
 * formatação" do visualizador do navegador em volta. O caminho do defeito:
 * `isPdf(url)` decide por PADRÃO DE URL, então uma URL com cara de PDF cujo
 * servidor responde 401 passava no teste, virava `src` de iframe, e o
 * navegador renderizava o corpo do erro como documento. A <img> nunca teve
 * esse problema porque `onError` dispara quando a resposta não é imagem; o
 * iframe renderiza QUALQUER resposta com o maior prazer — para ele, JSON de
 * erro é um documento como outro qualquer.
 *
 * Daí a sonda: um fetch da MESMA URL antes de montar o iframe. Só para URL
 * do próprio app (começa com "/") — arquivo externo (Drive etc.) não deixa
 * ler status por CORS, e nesses o iframe continua direto, como sempre foi.
 *
 * O 401 ganha frase própria porque é o único que o usuário RESOLVE sozinho:
 * "sessão expirou, recarregue" tem ação; "arquivo não disponível" não tem.
 */
type SondaEstado = "sondando" | "pdf" | "imagem" | "sessao-expirada" | "indisponivel";

function usePdfSonda(url: string): SondaEstado {
  const local = url.startsWith("/");
  const [estado, setEstado] = useState<SondaEstado>(local ? "sondando" : "pdf");

  useEffect(() => {
    if (!local) { setEstado("pdf"); return; }
    let vivo = true;
    setEstado("sondando");
    fetch(url, { credentials: "include" })
      .then(r => {
        if (!vivo) return;
        // O corpo não interessa — só o status e o tipo. Cancelar poupa o
        // download de um PDF que o iframe vai baixar de novo logo em seguida.
        r.body?.cancel?.().catch(() => {});
        if (r.status === 401) { setEstado("sessao-expirada"); return; }
        if (!r.ok) { setEstado("indisponivel"); return; }
        const tipo = r.headers.get("content-type") ?? "";
        // Nome de arquivo mente ('relatorio.pdf.png', caminho com 'pdf%2F'),
        // content-type não: é o que o navegador vai de fato renderizar.
        if (/image\//i.test(tipo)) setEstado("imagem");
        else if (/pdf/i.test(tipo)) setEstado("pdf");
        else setEstado("indisponivel");
      })
      .catch(() => { if (vivo) setEstado("indisponivel"); });
    return () => { vivo = false; };
  }, [url, local]);

  return estado;
}

function AvisoDePreview({ titulo, detalhe, linkUrl }: { titulo: string; detalhe?: string; linkUrl?: string }) {
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, padding: 16, textAlign: "center" }}>
      <div style={{ width: 48, height: 48, borderRadius: 12, background: "#f4f4f3", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <ImageOff style={{ width: 22, height: 22, color: "#a8a29e" }} />
      </div>
      <p style={{ fontSize: 12, color: "#57534e", margin: 0, fontWeight: 600 }}>{titulo}</p>
      {detalhe && <p style={{ fontSize: 11, color: "#746e69", margin: 0, maxWidth: 260, lineHeight: 1.5 }}>{detalhe}</p>}
      {linkUrl && isWebUrl(linkUrl) && (
        <a href={linkUrl} target="_blank" rel="noopener noreferrer"
          style={{ fontSize: 11, fontWeight: 700, color: "#c2410c", textDecoration: "none", borderBottom: "1px solid #fed7aa" }}>
          Abrir arquivo externo
        </a>
      )}
    </div>
  );
}

function PdfComSonda({ url, linkUrl, objectFit, noLink }: { url: string; linkUrl?: string; objectFit: "contain" | "cover"; noLink?: boolean }) {
  const estado = usePdfSonda(url);

  if (estado === "sondando") {
    return <div aria-hidden="true" style={{ width: "100%", height: "100%", background: "#f4f4f3", borderRadius: 8 }} />;
  }
  if (estado === "sessao-expirada") {
    // Um `{"error":...}` visível é o que a camada de apiRequest existe para
    // impedir; aqui o valor virou URL, não resposta tratada — então a frase
    // em português nasce neste componente.
    return <AvisoDePreview titulo="Sua sessão expirou" detalhe="Recarregue a página para ver os arquivos." />;
  }
  if (estado === "indisponivel") {
    return <AvisoDePreview titulo="Arquivo não disponível" linkUrl={linkUrl} />;
  }
  if (estado === "imagem") {
    // URL com cara de PDF entregando imagem: renderiza o que ELA é.
    return <ImageWithFallback url={url} linkUrl={linkUrl} objectFit={objectFit} noLink={noLink} />;
  }
  return (
    <iframe src={url} title="PDF preview"
      style={{ width: "100%", height: "100%", border: "none", display: "block" }}
      allow="fullscreen"
    />
  );
}

function ImageWithFallback({ url, linkUrl, objectFit, noLink }: { url: string; linkUrl?: string; objectFit: "contain" | "cover"; noLink?: boolean }) {
  const [errored, setErrored] = useState(false);

  if (errored) {
    return (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
        <div style={{ width: 48, height: 48, borderRadius: 12, background: "#f4f4f3", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <ImageOff style={{ width: 22, height: 22, color: "#a8a29e" }} />
        </div>
        <p style={{ fontSize: 12, color: "#746e69", margin: 0, fontWeight: 500 }}>Imagem não disponível</p>
        {/* #c2410c sobre branco = 5,18:1 ✓ (#f97316 dava 2,94:1 num link de 11px). */}
        {linkUrl && isWebUrl(linkUrl) && (
          <a href={linkUrl} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 11, fontWeight: 700, color: "#c2410c", textDecoration: "none", borderBottom: "1px solid #fed7aa" }}>
            Abrir arquivo externo
          </a>
        )}
      </div>
    );
  }

  const img = (
    <img
      src={url}
      alt="Preview"
      style={{ maxWidth: "100%", maxHeight: "100%", width: "auto", height: "auto", objectFit, display: "block", imageRendering: "auto" }}
      onError={() => setErrored(true)}
    />
  );

  if (noLink) {
    return (
      <div style={{ display: "flex", width: "100%", height: "100%", alignItems: "center", justifyContent: "center" }}>
        {img}
      </div>
    );
  }

  return (
    <a href={linkUrl || url} target="_blank" rel="noopener noreferrer"
      style={{ display: "flex", width: "100%", height: "100%", alignItems: "center", justifyContent: "center" }}
      title="Clique para ver em resolução máxima"
    >
      {img}
    </a>
  );
}

export function FilePreview({ url, linkUrl, style, objectFit = "contain", noLink }: FilePreviewProps) {
  const containerStyle: React.CSSProperties = {
    width: "100%", height: "100%",
    display: "flex", alignItems: "center", justifyContent: "center",
    ...style,
  };

  if (!url) return null;

  if (isPdf(url)) {
    return <PdfComSonda url={url} linkUrl={linkUrl} objectFit={objectFit} noLink={noLink} />;
  }

  if (isImageUrl(url)) {
    return <ImageWithFallback url={url} linkUrl={linkUrl} objectFit={objectFit} noLink={noLink} />;
  }

  // Caminho de rede/disco: não há o que abrir daqui. Quem renderiza o
  // FilePreview deve tratar esse caso antes (ver isWebUrl); este fallback
  // existe para o caminho não virar um botão morto.
  if (!isWebUrl(url)) {
    return (
      <div style={{ ...containerStyle, flexDirection: "column", gap: 8, padding: 16, textAlign: "center" }}>
        <p style={{ fontSize: 12, fontWeight: 600, color: "#746e69", margin: 0 }}>
          Arquivo na rede local — o navegador não abre este caminho.
        </p>
        <p style={{ fontFamily: "monospace", fontSize: 10, color: "#57534e", margin: 0, wordBreak: "break-all" }}>{url}</p>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <a href={url} target="_blank" rel="noopener noreferrer"
        style={{ backgroundColor: "#1c1917", color: "#ffffff", padding: "8px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700, textDecoration: "none" }}>
        Abrir arquivo
      </a>
    </div>
  );
}
