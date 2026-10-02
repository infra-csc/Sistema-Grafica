// ─── A miniatura da arte na linha da peça ───────────────────────────────────
// O Painel listava 55 peças só por texto: "Painel 2×1 da arena" e "Painel 2×1
// da arena de hidratação" eram duas linhas iguais até ler a descrição inteira.
// A arte que a Arte mandou para aprovação (approvalThumbUrl) é o que a pessoa
// reconhece de relance — a mesma miniatura da fila da Arte e do Atendimento.
//
// `contain`, e não `cover`: a peça tem PROPORÇÃO (uma testeira 5×0,5 é uma
// tira, um banner 0,8×3 é uma coluna). Recortar para preencher o quadrado
// mentiria sobre a forma da peça. O fundo cinza é a "mesa" em que ela se apoia.
//
// Sem arte ainda: um quadrado vazio com o ícone apagado, do MESMO tamanho —
// a coluna não pula e a ausência é lida como "ainda não tem", não como erro.
import { ImageIcon } from "lucide-react";
import { miniatura } from "@/lib/miniatura";
import { N, R, T } from "@/lib/theme";

export function MiniaturaDaPeca({ url, tamanho = 44, apagada = false }: {
  url: string | null | undefined;
  tamanho?: number;
  /** Peça excluída: a arte fica em cinza. */
  apagada?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className="pnl-mini"
      data-tem={url ? "1" : "0"}
      style={{
        width: tamanho, height: tamanho, flexShrink: 0, borderRadius: R.md,
        border: `1px solid ${T.border}`, backgroundColor: N.n2,
        display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
      }}
    >
      {url ? (
        <img
          src={miniatura(url)}
          alt=""
          loading="lazy"
          decoding="async"
          // Arquivo que não abre vira o mesmo vazio de "sem arte" — nunca o
          // ícone de imagem quebrada do navegador no meio da lista.
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          style={{ width: "100%", height: "100%", objectFit: "contain", padding: 3, boxSizing: "border-box", filter: apagada ? "grayscale(1)" : undefined }}
        />
      ) : (
        <ImageIcon aria-hidden="true" style={{ width: Math.round(tamanho * 0.36), height: Math.round(tamanho * 0.36), color: T.muted }} />
      )}
    </span>
  );
}
