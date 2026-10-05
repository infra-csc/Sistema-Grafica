// ─────────────────────────────────────────────────────────────────────────────
// AS MINIATURAS DA PEÇA — as referências visuais (VÁRIAS por peça) e o botão
// de anexar mais uma. Usadas pela linha da tabela, pelo cartão do celular e
// pelo card de rascunhos — o MESMO desenho nos três lugares.
//
// POR QUE EM PILHA. A coluna de referência tem ~100px; com duas ou três
// imagens lado a lado elas quebravam em coluna e a linha da tabela crescia
// três andares. Agora ficam sobrepostas (um leque), e passar o mouse ou focar
// uma delas a traz para a frente com o × dela. No toque, sem hover, ficam lado
// a lado e com o × sempre à vista (CSS em .evd-refs, index.css).
//
// A LÓGICA FICA COM QUEM CHAMA: adicionar e remover chegam prontos (a mesma
// mutação de sempre), e os data-testids também — cada lugar tem os seus.
// ─────────────────────────────────────────────────────────────────────────────
import { ImagePlus, X } from "lucide-react";
import { ObjectUploader } from "@/components/ObjectUploader";
import { miniatura } from "@/lib/miniatura";
import { T, R } from "@/lib/theme";

export function MiniaturasDaPeca({
  refs, podeEditar, rotuloDaPeca, tamanho = 34, pilha = true,
  idDoLink, idDoRemover, onRemover, onAdicionar, getUploadUrl, rotuloDoAnexo,
}: {
  refs: string[];
  podeEditar: boolean;
  /** "#0056" — entra no nome acessível de cada miniatura e de cada ×. */
  rotuloDaPeca: string;
  tamanho?: number;
  /** Sobrepor as miniaturas (tabela). Fora dela, lado a lado. */
  pilha?: boolean;
  idDoLink: (k: number) => string;
  idDoRemover: (k: number) => string;
  onRemover: (k: number) => void;
  onAdicionar: (url: string) => void;
  getUploadUrl: () => Promise<{ method: "PUT"; url: string }>;
  /** Rótulo visível do anexar (cartões); sem ele, só o ícone. */
  rotuloDoAnexo?: string;
}) {
  if (!podeEditar && refs.length === 0) {
    return <span aria-label="Sem referência visual" style={{ color: T.muted, fontSize: 13 }}>—</span>;
  }
  return (
    <div className={`evd-refs${pilha ? " evd-refs-pilha" : ""}`} style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap", ["--evd-ref" as string]: `${tamanho}px` }}>
      {refs.length > 0 && (
        <div className="evd-refs-leque" style={{ display: "flex", alignItems: "center" }}>
          {refs.map((url, k) => (
            <span key={`${url}-${k}`} className="evd-ref" style={{ position: "relative", display: "inline-flex", zIndex: refs.length - k }}>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                title={refs.length > 1 ? `Ver referência ${k + 1} de ${refs.length}` : "Ver referência"}
                data-testid={idDoLink(k)}
                className="evd-ref-link"
                style={{ display: "inline-flex", borderRadius: R.sm }}
              >
                <img
                  loading="lazy"
                  decoding="async"
                  src={miniatura(url)}
                  alt={`Referência visual ${k + 1} de ${rotuloDaPeca}`}
                  style={{ height: tamanho, width: tamanho, objectFit: "cover", borderRadius: R.sm, border: `2px solid ${T.surface}`, boxShadow: `0 0 0 1px ${T.border}`, backgroundColor: T.low, display: "block" }}
                  onError={e => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }}
                />
              </a>
              {podeEditar && (
                <button
                  type="button"
                  title="Remover esta referência"
                  aria-label={`Remover referência ${k + 1} de ${rotuloDaPeca}`}
                  data-testid={idDoRemover(k)}
                  onClick={(e) => { e.stopPropagation(); onRemover(k); }}
                  className="evd-ref-x"
                  // O alvo de 44px no toque vem do ::after (index.css), não do
                  // tamanho do círculo — o piso global esticava o × num ovo.
                  data-alvo-natural=""
                >
                  <X aria-hidden="true" style={{ width: 10, height: 10 }} />
                </button>
              )}
            </span>
          ))}
        </div>
      )}
      {podeEditar && (
        <ObjectUploader
          onGetUploadParameters={getUploadUrl}
          onComplete={({ url }) => onAdicionar(url)}
          buttonVariant="ghost"
          buttonClassName={rotuloDoAnexo ? "evd-ref-anexar evd-ref-anexar-rotulo" : "evd-ref-anexar"}
        >
          {/* O nome vai no <span> (o ícone lucide descarta `title`). */}
          <span
            title={refs.length > 0 ? "Adicionar mais uma referência" : "Adicionar referência"}
            aria-label={refs.length > 0 ? "Adicionar mais uma referência" : "Adicionar referência"}
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            <ImagePlus aria-hidden="true" style={{ width: 14, height: 14 }} />
            {rotuloDoAnexo && <span>{rotuloDoAnexo}</span>}
          </span>
        </ObjectUploader>
      )}
    </div>
  );
}
