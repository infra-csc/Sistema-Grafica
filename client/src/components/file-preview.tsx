import { useState } from "react";
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

export function isImageUrl(url: string): boolean {
  return (
    /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(url) ||
    url.startsWith("/objects/") ||
    url.startsWith("http")
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
        {linkUrl && (
          <a href={linkUrl} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 11, fontWeight: 700, color: "#f97316", textDecoration: "none", borderBottom: "1px solid #fed7aa" }}>
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
    return (
      <iframe src={url} title="PDF preview"
        style={{ width: "100%", height: "100%", border: "none", display: "block" }}
        allow="fullscreen"
      />
    );
  }

  if (isImageUrl(url)) {
    return <ImageWithFallback url={url} linkUrl={linkUrl} objectFit={objectFit} noLink={noLink} />;
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
