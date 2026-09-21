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
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
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

// ─────────────────────────────────────────────────────────────────────────────
// A LINGUAGEM DAS OPÇÕES (22/09) — o dono abriu as etiquetas do evento e achou
// "confusa": três faixas de chips parecidos com papéis diferentes. As duas telas
// de etiqueta passam a falar igual: SEÇÕES nomeadas (o que imprimir · como sai
// · formato · cabeçalho), SEGMENTOS para escolha de um entre poucos, e cada
// folha da prévia com a sua LEGENDA (papel e "1 de N"). Nada disto imprime.
// ─────────────────────────────────────────────────────────────────────────────

/** Seção nomeada do painel: fieldset + legend, para o leitor de tela anunciar
 *  o grupo ("Formato, grupo") antes de cada controle. */
export function SecaoDeOpcoes(props: { titulo: string; ajuda?: string; testid?: string; children: ReactNode }) {
  return (
    <fieldset data-testid={props.testid} style={{ border: "1px solid #e7e5e4", borderRadius: 10, margin: 0, padding: "10px 12px 12px", minWidth: 0, backgroundColor: "#fff" }}>
      <legend style={{ padding: "0 6px", fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.07em", color: "#44403c" }}>{props.titulo}</legend>
      {props.ajuda && <p style={{ margin: "0 0 8px", fontSize: 12.5, lineHeight: 1.4, color: "#57534e" }}>{props.ajuda}</p>}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>{props.children}</div>
    </fieldset>
  );
}

/** Um entre poucos (Individual | Lista, Deitada | Em pé, Tudo | Só…). Botões
 *  com aria-pressed dentro de um grupo rotulado; `alvo` é a altura (44 no toque). */
export function Segmento<V extends string>(props: {
  rotulo: string; valor: V; opcoes: ReadonlyArray<readonly [V, string]>; aoMudar: (v: V) => void; alvo: number; testid: string; fonte?: number; esticar?: boolean;
}) {
  return (
    <div role="group" aria-label={props.rotulo} style={{ display: props.esticar ? "flex" : "inline-flex", borderRadius: 8, border: "1px solid #d6d3d1", overflow: "hidden", flexShrink: 0, backgroundColor: "#fff" }}>
      {props.opcoes.map(([v, texto], i) => {
        const ativo = props.valor === v;
        return (
          <button key={v} type="button" className="etq-foco" aria-pressed={ativo} onClick={() => props.aoMudar(v)} data-testid={`${props.testid}-${v}`}
            style={{ flex: props.esticar ? 1 : undefined, minHeight: props.alvo, padding: "0 12px", border: "none", borderLeft: i > 0 ? "1px solid #d6d3d1" : "none", fontFamily: "inherit", fontSize: props.fonte ?? 12.5, fontWeight: 700, cursor: "pointer", backgroundColor: ativo ? "#1c1917" : "#fff", color: ativo ? "#fff" : "#44403c" }}>
            {texto}
          </button>
        );
      })}
    </div>
  );
}

/** A legenda de cada folha da prévia: o papel e a posição ("Adesivo 10×15 cm ·
 *  lista 1 de 2"). Classe etq-acao: aparece só na tela. */
export function LegendaDaFolha(props: { children: ReactNode; testid?: string }) {
  return (
    <p className="etq-acao" data-testid={props.testid} style={{ margin: "0 auto 6px", fontSize: 12, fontWeight: 700, letterSpacing: "0.04em", color: "#57534e", textAlign: "center" }}>
      {props.children}
    </p>
  );
}

const PX_POR_MM = 96 / 25.4;

/**
 * ZOOM PARA CABER: a folha é desenhada no tamanho real (mm); num celular de
 * 390px a A4 (190 mm ≈ 718px) estourava e a prévia rolava de lado. Mede o
 * contêiner e devolve a escala (≤ 1) para a folha caber INTEIRA na largura.
 * Vai num `zoom` só de tela — o papel continua 1:1.
 */
export function useEscalaParaCaber() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [largura, setLargura] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const medir = () => setLargura(el.clientWidth);
    medir();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Sem medida ainda (ou jsdom, que mede 0): escala 1 — nunca encolhe às cegas.
  const escalaPara = (larguraDaFolhaPx: number) =>
    largura > 0 ? Math.round(Math.min(1, Math.max(0.2, (largura - 4) / larguraDaFolhaPx)) * 1000) / 1000 : 1;
  return { ref, escalaPara };
}
/** A regra do zoom: só na TELA, lida de --etq-zoom no próprio elemento. */
export const CSS_DO_ZOOM = "@media screen { .etq-zoom { zoom: var(--etq-zoom, 1); } }";
export const estiloDoZoom = (escala: number) => ({ ["--etq-zoom" as any]: escala }) as CSSProperties;
export const mmParaPx = (mm: number) => mm * PX_POR_MM;

/** Estilos comuns dos campos do painel — 16px no celular (o iOS dá zoom em
 *  campo menor que isso) e alvo de 44. */
export const estiloDoCampo = (mobile: boolean): CSSProperties => ({
  minHeight: mobile ? 44 : 34, borderRadius: 8, border: "1px solid #d6d3d1", padding: "0 10px", fontSize: mobile ? 16 : 13,
  fontFamily: "inherit", fontWeight: 600, color: "#1c1917", backgroundColor: "#fff", minWidth: 0, boxSizing: "border-box",
});
