// As fotos que a Gráfica anexou: grade de miniaturas e o lightbox que amplia.
import { useState, useEffect } from "react";
import { X, Eye, ExternalLink } from "lucide-react";
import { T, N } from "@/lib/theme";

/**
 * Lightbox simples: exibe a foto em tamanho maior num overlay escuro.
 * Fechar com clique fora da imagem, botão ×, ou tecla Escape.
 */
function PhotoLightbox({
  url, alt, onClose,
}: { url: string; alt: string; onClose: () => void }) {
  // Fecha com Escape.
  //
  // stopPropagation e captura: o lightbox vive dentro do Dialog do Radix, que
  // também fecha no Escape. Sem interceptar antes, uma tecla fechava os dois —
  // a foto E a ficha da peça por baixo, obrigando a reabrir tudo.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt || "Foto ampliada"}
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        backgroundColor: "rgba(0,0,0,0.85)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24,
      }}
    >
      {/* Botão fechar */}
      <button
        onClick={onClose}
        style={{
          position: "absolute", top: 16, right: 16,
          background: "rgba(255,255,255,0.15)", border: "none", cursor: "pointer",
          color: T.surface, width: 40, height: 40, borderRadius: 999,
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "background 0.15s",
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.3)"; }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.15)"; }}
        aria-label="Fechar"
      >
        <X style={{ width: 20, height: 20 }} />
      </button>

      {/* Imagem — clique nela não propaga para o overlay */}
      <div
        onClick={e => e.stopPropagation()}
        style={{ position: "relative", maxWidth: "90vw", maxHeight: "85vh", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}
      >
        <img loading="lazy" decoding="async" 
          src={url}
          alt={alt}
          style={{ maxWidth: "90vw", maxHeight: "80vh", objectFit: "contain", borderRadius: 8, boxShadow: "0 25px 60px rgba(0,0,0,0.6)" }}
        />
        {/* Link para abrir em nova aba */}
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            color: "rgba(255,255,255,0.75)", fontSize: 13, textDecoration: "none",
            padding: "8px 14px", borderRadius: 8, backgroundColor: "rgba(255,255,255,0.12)",
            transition: "color 0.15s, background 0.15s",
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = T.surface; (e.currentTarget as HTMLAnchorElement).style.backgroundColor = "rgba(255,255,255,0.2)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = "rgba(255,255,255,0.75)"; (e.currentTarget as HTMLAnchorElement).style.backgroundColor = "rgba(255,255,255,0.12)"; }}
        >
          <ExternalLink style={{ width: 12, height: 12 }} />
          Abrir original
        </a>
      </div>
    </div>
  );
}

/**
 * Fotos da Gráfica em grade de duas colunas.
 *
 * Eram quadrados FIXOS de 132px numa faixa que quebrava a linha. Na coluna
 * direita de um modal a 445px — e no mobile — 132px não é uma medida
 * proporcional a nada: duas fotos deixavam uma sobra irregular à direita, três
 * transbordavam. `aspectRatio: 1` em duas colunas fluidas acompanha a largura
 * que houver.
 */
export function PhotoGrid({ urls, alt }: { urls: string[]; alt: string }) {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {urls.map(url => (
          <button
            key={url}
            onClick={() => setLightboxUrl(url)}
            title="Ampliar foto"
            style={{
              display: "block", position: "relative", width: "100%", aspectRatio: "1",
              borderRadius: 8, overflow: "hidden", border: `1px solid ${T.border}`,
              backgroundColor: N.n2, cursor: "zoom-in", padding: 0, appearance: "none",
            }}
          >
            <img loading="lazy" decoding="async" src={url} alt={alt}
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              onError={e => {
                const img = e.currentTarget as HTMLImageElement;
                img.style.display = "none";
                const parent = img.parentElement;
                if (parent && !parent.querySelector("[data-broken]")) {
                  const span = document.createElement("span");
                  span.setAttribute("data-broken", "1");
                  span.textContent = "Imagem indisponível";
                  // #78716c sobre #f5f4f1 dá 4,36 — abaixo da régua. Sobre o
                  // branco do fallback, 4,80.
                  span.style.cssText = `position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;padding:8px;font-size:11px;background:${T.surface};color:${T.second}`;
                  parent.appendChild(span);
                }
              }} />
            <span style={{ position: "absolute", bottom: 6, right: 6, backgroundColor: "rgba(0,0,0,0.6)", color: T.surface, padding: 5, borderRadius: 999, display: "flex" }}>
              <Eye style={{ width: 11, height: 11 }} />
            </span>
          </button>
        ))}
      </div>

      {lightboxUrl && (
        <PhotoLightbox url={lightboxUrl} alt={alt} onClose={() => setLightboxUrl(null)} />
      )}
    </>
  );
}
