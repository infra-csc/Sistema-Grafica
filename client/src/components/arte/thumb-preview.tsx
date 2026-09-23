import { useRef, useState } from "react";
import { FileImage } from "lucide-react";
import { miniatura } from "@/lib/miniatura";
import { T, TOM, N } from "@/lib/theme";

/**
 * Ícone de thumb com prévia ao passar o mouse OU ao focar por teclado.
 * A coluna mostrava só um ícone verde ou cinza: conferir se a arte anexada é a
 * certa exigia abrir o modal peça por peça — justamente o único risco do envio
 * de um clique, que é mandar o thumb errado.
 */
export function ThumbPreview({ url, label }: { url?: string | null; label: string }) {
  // `position: fixed` calculado a partir do retângulo da âncora, e não
  // `position: absolute` dentro da linha.
  //
  // PORQUÊ. A prévia é filha da <td>, e a aba inteira vive dentro de UM
  // contêiner de rolagem horizontal. Um contêiner com overflow-x diferente de
  // `visible` RECORTA também na vertical (a regra do CSS é que o eixo restante
  // computa para `auto`), então a prévia, que abre para cima, era cortada pela
  // borda de cima do scroller em toda linha do começo do bloco — aparecia só a
  // metade de baixo. Coordenada de viewport não é recortada por ancestral
  // nenhum, e ainda vira para baixo quando não há espaço em cima.
  const [caixa, setCaixa] = useState<{ left: number; top: number; acima: boolean } | null>(null);
  const ancoraRef = useRef<HTMLAnchorElement>(null);
  const abrir = () => {
    const r = ancoraRef.current?.getBoundingClientRect();
    if (!r) return;
    const LARGURA = 248;
    const ALTURA = 208;
    const acima = r.top > ALTURA + 12;
    setCaixa({
      left: Math.min(Math.max(8, r.left + r.width / 2 - LARGURA / 2), window.innerWidth - LARGURA - 8),
      top: acima ? r.top - ALTURA - 6 : r.bottom + 6,
      acima,
    });
  };
  const aberto = caixa !== null;
  if (!url) {
    return (
      <span title="Sem thumb" style={{ width: 26, height: 26, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: N.n2, color: T.second, flexShrink: 0 }}>
        <FileImage style={{ width: 13, height: 13 }} />
      </span>
    );
  }
  // PDF não vira <img>: o mesmo teste que o card de correção já usava.
  const isImage = /\.(png|jpg|jpeg|gif|webp)/i.test(url) || url.startsWith('/objects/');
  return (
    <span style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
      <a
        ref={ancoraRef}
        href={url} target="_blank" rel="noopener noreferrer"
        title={`Ver ${label}`}
        onMouseEnter={abrir}
        onMouseLeave={() => setCaixa(null)}
        onFocus={abrir}
        onBlur={() => setCaixa(null)}
        style={{ width: 26, height: 26, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: TOM.sucesso.bg, color: TOM.sucesso.text, border: `1px solid ${TOM.sucesso.border}` }}
      >
        <FileImage style={{ width: 13, height: 13 }} />
      </a>
      {aberto && isImage && caixa && (
        <span
          role="presentation"
          style={{
            position: 'fixed', left: caixa.left, top: caixa.top,
            zIndex: 60, padding: 4, borderRadius: 8, background: T.surface,
            border: `1px solid ${T.border}`, boxShadow: '0 12px 32px rgba(0,0,0,0.18)',
            pointerEvents: 'none',
          }}
        >
          <img loading="lazy" decoding="async" src={miniatura(url)} alt="" style={{ display: 'block', width: 240, maxHeight: 200, objectFit: 'contain', borderRadius: 6 }} />
        </span>
      )}
    </span>
  );
}
