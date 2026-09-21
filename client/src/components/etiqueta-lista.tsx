// ─────────────────────────────────────────────────────────────────────────────
// A ETIQUETA EM LISTA, desenhada — a mesma peça na etiqueta do TUBO e nas
// listas das etiquetas do EVENTO (as regras vivem em lib/etiqueta-lista.ts).
//
// O formato é o do adesivo que o galpão já cola no tubo: em pé, logo do
// circuito (ou o prefixo do nome), a cidade GIGANTE, "TUBO N" quando é de tubo
// e uma linha por peça, centralizada. Tudo medido em MILÍMETROS: a caixa tem
// o tamanho da área útil do papel, então o que se vê na tela é o que sai, e a
// tipografia escala junto com o tamanho escolhido.
// ─────────────────────────────────────────────────────────────────────────────
import { TAMANHOS, fonteDaCidadeMm, linhaDaLista, type LinhaDaEtiqueta, type PecaDaLista, type TamanhoEtiqueta } from "@/lib/etiqueta-lista";

const GROTESK = "'Space Grotesk', sans-serif";

/** CSS das caixas. A altura é FIXA (a da área útil): o que não couber é
 *  cortado em vez de empurrar uma segunda página quase vazia para o adesivo —
 *  quem garante que cabe é a paginação conservadora de `paginarLinhas`. */
export const CSS_DA_ETIQUETA_EM_LISTA = `
  .etl-caixa { box-sizing: border-box; overflow: hidden; display: flex; flex-direction: column; background: #fff; color: #1c1917; break-inside: avoid; page-break-inside: avoid; }
  .etl-vertical { writing-mode: vertical-rl; transform: rotate(180deg); white-space: nowrap; }
  @media screen { .etl-caixa { border: 1px solid #d6d3d1; border-radius: 6px; margin: 0 auto 16px; box-shadow: 0 6px 18px rgba(0,0,0,0.07); } }
  @media print {
    .etl-caixa { break-after: page; page-break-after: always; }
    .etl-caixa.etl-ultima { break-after: auto; page-break-after: auto; }
  }
`;

type Props<T extends PecaDaLista> = {
  tamanho: TamanhoEtiqueta;
  logo: string | null;
  prefixo: string;
  gigante: string;
  /** "Saída 12/09" — canto de cima, pequeno. */
  saida?: string | null;
  /** Número do tubo; sem ele (lista do evento) o bloco "TUBO N" não sai. */
  tubo?: number | null;
  /** "Tubo 2 · 1 de 2" / "Lista · 1 de 2" — só quando a lista quebrou. */
  contador?: string | null;
  linhas: LinhaDaEtiqueta<T>[];
  mostrarQuantidade: boolean;
  vazio?: string;
  ultima?: boolean;
  testid?: string;
  /** Prefixo do data-testid de cada linha de peça. */
  testidDaLinha?: string;
};

export function EtiquetaEmLista<T extends PecaDaLista>(props: Props<T>) {
  const m = TAMANHOS[props.tamanho];
  const titulo = props.gigante || props.prefixo || "Evento";
  const miudo = `${Math.max(2.4, m.prefixoMm * 0.7)}mm`;
  return (
    <div className={`etl-caixa${props.ultima ? " etl-ultima" : ""}`} data-testid={props.testid} data-tamanho={props.tamanho}
      style={{ width: `${m.larguraMm}mm`, height: `${m.alturaMm}mm`, padding: `${m.margemMm / 2}mm`, maxWidth: "none" }}>
      <div style={{ flexShrink: 0, textAlign: "center", borderBottom: "0.8mm solid #1c1917", paddingBottom: "1.5mm" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "2mm", fontSize: miudo, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#57534e", lineHeight: 1.2 }}>
          <span>{props.saida ? `Saída ${props.saida}` : " "}</span>
          <span data-testid={props.testid ? `${props.testid}-contador` : undefined}>{props.contador ?? " "}</span>
        </div>
        {props.logo && (
          <img decoding="async" src={props.logo} alt="Logo do evento"
            style={{ maxHeight: `${m.logoMm}mm`, maxWidth: "70%", objectFit: "contain", display: "block", margin: "1mm auto 0.5mm" }} />
        )}
        {!props.logo && props.gigante && props.prefixo && (
          <p style={{ margin: "1mm 0 0", fontFamily: GROTESK, fontWeight: 800, fontSize: `${m.prefixoMm}mm`, textTransform: "uppercase", lineHeight: 1.1 }}>
            {props.prefixo}
          </p>
        )}
        <p style={{ margin: "0.5mm 0 0", fontFamily: GROTESK, fontWeight: 900, textTransform: "uppercase", letterSpacing: "-0.02em", lineHeight: 0.95, fontSize: `${fonteDaCidadeMm(props.tamanho, titulo)}mm`, overflowWrap: "anywhere" }}>
          {titulo}
        </p>
      </div>

      {props.tubo != null && (
        <div style={{ flexShrink: 0, textAlign: "center", borderBottom: "0.8mm solid #1c1917", padding: "1mm 0 1.5mm" }}>
          <span data-testid="numero-do-tubo" style={{ fontFamily: GROTESK, fontSize: `${m.tuboMm}mm`, fontWeight: 900, lineHeight: 1, whiteSpace: "nowrap" }}>
            TUBO {props.tubo}
          </span>
        </div>
      )}

      {props.linhas.length === 0 ? (
        <p style={{ fontSize: `${m.linhaMm}mm`, color: "#57534e", textAlign: "center" }}>{props.vazio ?? "Sem peças."}</p>
      ) : (
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", alignItems: "center", paddingTop: "1.5mm" }}>
          {props.linhas.map((l, i) => l.tipo === "subtitulo" ? (
            <p key={`s-${i}`} data-testid="etl-subtitulo" style={{ margin: i === 0 ? 0 : "0.8mm 0 0", alignSelf: "stretch", fontFamily: GROTESK, fontSize: `${m.linhaMm * 0.78}mm`, fontWeight: 900, letterSpacing: "0.1em", lineHeight: 1.2 * (1 / 0.78), textAlign: "center", color: "#1c1917", borderBottom: "0.3mm solid #1c1917" }}>
              {l.texto}
            </p>
          ) : (
            <p key={l.peca.id ?? `p-${i}`} data-testid={props.testidDaLinha && l.peca.id ? `${props.testidDaLinha}-${l.peca.id}` : undefined}
              style={{ margin: 0, maxWidth: "100%", fontFamily: GROTESK, fontSize: `${m.linhaMm}mm`, fontWeight: 800, lineHeight: 1.2, textAlign: "center", overflowWrap: "anywhere" }}>
              {linhaDaLista(l.peca, { mostrarQuantidade: props.mostrarQuantidade })}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

/** "REAPROVEITAR" tem 12 letras; 0,74 em por letra no Space Grotesk 900. */
const LETRAS_REAPROVEITAR = 12;

/**
 * A SEGUNDA etiqueta que o galpão cola no tubo com material de reuso: a
 * palavra REAPROVEITAR gigante, de pé (lê-se com o tubo deitado na pilha).
 * Mesmo tamanho de papel da lista, para sair na mesma impressão.
 */
export function EtiquetaReaproveitar(props: { tamanho: TamanhoEtiqueta; rodape?: string; ultima?: boolean; testid?: string }) {
  const m = TAMANHOS[props.tamanho];
  const rodapeMm = props.rodape ? m.linhaMm * 2 : 0;
  const fonte = Math.min(m.larguraMm * 0.5, (m.alturaMm - m.margemMm * 3 - rodapeMm) / (LETRAS_REAPROVEITAR * 0.74));
  return (
    <div className={`etl-caixa${props.ultima ? " etl-ultima" : ""}`} data-testid={props.testid ?? "etiqueta-reaproveitar"} data-tamanho={props.tamanho}
      style={{ width: `${m.larguraMm}mm`, height: `${m.alturaMm}mm`, padding: `${m.margemMm / 2}mm`, maxWidth: "none", alignItems: "center", justifyContent: "center", outline: "1.5mm solid #1c1917", outlineOffset: "-2.5mm" }}>
      <span className="etl-vertical" style={{ fontFamily: GROTESK, fontWeight: 900, fontSize: `${Math.round(fonte * 10) / 10}mm`, lineHeight: 1, letterSpacing: "0.02em" }}>
        REAPROVEITAR
      </span>
      {props.rodape && (
        <span style={{ marginTop: "2mm", fontFamily: GROTESK, fontWeight: 800, fontSize: `${m.linhaMm}mm`, textTransform: "uppercase", textAlign: "center", lineHeight: 1.1 }}>
          {props.rodape}
        </span>
      )}
    </div>
  );
}
