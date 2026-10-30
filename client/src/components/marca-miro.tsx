// ─────────────────────────────────────────────────────────────────────────────
// A MARCA MIRÓ COMUNICAÇÃO VISUAL (kit do dono, 30/10) — um desenho só para o
// menu, a entrada e o carregamento.
//
// O logo vem do kit (vetor, grafite #211E1B + laranja #E45B12). A linha
// "Comunicação Visual" é TEXTO, não a do SVG de assinatura: no tamanho do menu
// a do kit ficava com ~5px, ilegível. Aqui ela tem tamanho de leitura.
//
// Tema: no fundo claro, o grafite; no tema escuro (ou `fundoEscuro`, a coluna
// da entrada), a versão com o grafite claro — o laranja fica nas duas
// (styles/color-mode.css: .marca-clara/.marca-escura).
// ─────────────────────────────────────────────────────────────────────────────
import { T, FW, ESCURO } from "@/lib/theme";

const CLARO = "/brand/miro-logo-20261030.svg";
const ESCURA = "/brand/miro-logo-escuro-20261030.svg";
/** Proporção do logo do kit (1123 × 307). */
const W = 1123, H = 307;

export function MarcaMiro({ altura = 28, fundoEscuro = false, legenda = true, decorativa = false }: {
  /** Altura do logo em px (a legenda vem embaixo). */
  altura?: number;
  /** Sempre sobre fundo escuro (a coluna da entrada): só a versão clara do grafite. */
  fundoEscuro?: boolean;
  /** "Comunicação Visual" embaixo do logo. */
  legenda?: boolean;
  /** Ao lado de um texto que já diz a marca: some para o leitor de tela. */
  decorativa?: boolean;
}) {
  const alt = decorativa ? "" : "Miró Comunicação Visual";
  const img = (src: string, className?: string) => (
    <img
      className={className} src={src} alt={alt} aria-hidden={decorativa || undefined}
      width={W} height={H} style={{ height: altura, width: "auto", maxWidth: "100%" }}
    />
  );
  return (
    // Como no kit: a legenda CENTRALIZADA sob o logo, em peso normal.
    <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: Math.max(2, Math.round(altura * 0.12)), minWidth: 0 }}>
      {fundoEscuro ? img(ESCURA) : <>{img(CLARO, "marca-clara")}{img(ESCURA, "marca-escura")}</>}
      {legenda && (
        <span aria-hidden="true" style={{
          fontSize: Math.max(10, Math.round(altura * 0.36)), fontWeight: FW.corpo, lineHeight: 1,
          color: fundoEscuro ? ESCURO.apoio : T.second, whiteSpace: "nowrap",
        }}>
          Comunicação Visual
        </span>
      )}
    </span>
  );
}
