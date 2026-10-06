// A MINIATURA DA PEÇA na linha da tabela: a Gráfica reconhece a peça pelo
// desenho. A caixa existe SEMPRE (44 × 44): com a arte, a arte; sem arte, um
// glifo que diz por quê — "produção interna" (não passou pela Arte) ou "sem
// arte". Antes a caixa só existia com a URL, e a imagem que falhava sumia e
// deixava um quadrado branco vazio; as descrições também saíam do prumo entre
// linhas com e sem arte.
import { useState } from "react";
import type React from "react";
import { Factory, ImageOff } from "lucide-react";
import { convertGCSUrlToLocalPath } from "@/lib/artePdfExport";
import { R, T, TOM } from "@/lib/theme";
import type { PecaDaFila } from "@/components/grafica/tipos";

export function MiniaturaDaPeca({ item, tamanho = 44 }: { item: PecaDaFila; tamanho?: number }) {
  const [falhou, setFalhou] = useState(false);
  const url = item.approvalThumbUrl ? convertGCSUrlToLocalPath(item.approvalThumbUrl) : "";
  const caixa: React.CSSProperties = {
    display: "flex", alignItems: "center", justifyContent: "center",
    width: tamanho, height: tamanho, flexShrink: 0, borderRadius: R.sm, overflow: "hidden",
    border: `1px solid ${T.border}`, backgroundColor: T.surface,
  };
  if (url && !falhou) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={e => e.stopPropagation()}
        title="Abrir a arte aprovada"
        data-testid={`thumb-art-${item.id}`}
        className="grf-miniatura"
        style={caixa}
      >
        <img src={url} alt="Arte"
          loading="lazy" decoding="async"
          style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
          onError={() => setFalhou(true)} />
      </a>
    );
  }
  const interna = Boolean(item.producaoInterna);
  const dica = interna ? "Produção interna — sem arte aprovada; veja as instruções" : url ? "A arte não carregou" : "Sem arte aprovada";
  const Icone = interna ? Factory : ImageOff;
  return (
    <span
      role="img"
      aria-label={dica}
      title={dica}
      data-testid={`thumb-vazio-${item.id}`}
      style={{ ...caixa, backgroundColor: interna ? TOM.ceu.bg : T.low, border: `1px dashed ${interna ? TOM.ceu.border : T.bdark}` }}
    >
      <Icone aria-hidden="true" style={{ width: 16, height: 16, color: interna ? TOM.ceu.text : T.muted }} />
    </span>
  );
}
