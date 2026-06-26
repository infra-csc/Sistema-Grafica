interface FilePreviewProps {
  url: string;
  style?: React.CSSProperties;
  objectFit?: "contain" | "cover";
}

export function isPdf(url: string): boolean {
  return /\.pdf$/i.test(url) || url.includes("/pdf") || url.includes("pdf%2F");
}

export function isImageUrl(url: string): boolean {
  return (
    /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(url) ||
    url.startsWith("/objects/") ||
    url.startsWith("http")
  );
}

export function FilePreview({ url, style, objectFit = "contain" }: FilePreviewProps) {
  const containerStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    ...style,
  };

  if (!url) return null;

  if (isPdf(url)) {
    return (
      <iframe
        src={url}
        title="PDF preview"
        style={{ width: "100%", height: "100%", border: "none", display: "block" }}
        allow="fullscreen"
      />
    );
  }

  if (isImageUrl(url)) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        style={{ display: "block", width: "100%", height: "100%" }}
        title="Clique para ampliar"
      >
        <img
          src={url}
          alt="Preview"
          style={{ width: "100%", height: "100%", objectFit, display: "block" }}
          onError={(e) => {
            const anchor = e.currentTarget.parentElement as HTMLAnchorElement;
            if (anchor) {
              anchor.style.display = "flex";
              anchor.style.alignItems = "center";
              anchor.style.justifyContent = "center";
              e.currentTarget.style.display = "none";
              const btn = document.createElement("span");
              btn.textContent = "Abrir arquivo";
              btn.style.cssText =
                "background:#1c1917;color:#fff;padding:8px 16px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer";
              anchor.appendChild(btn);
            }
          }}
        />
      </a>
    );
  }

  return (
    <div style={containerStyle}>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          backgroundColor: "#1c1917",
          color: "#ffffff",
          padding: "8px 16px",
          borderRadius: 8,
          fontSize: 12,
          fontWeight: 700,
          textDecoration: "none",
        }}
      >
        Abrir arquivo
      </a>
    </div>
  );
}
