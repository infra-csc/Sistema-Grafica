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
import { FONT, FS, FW, R, SHADOW, T, TOM } from "@/lib/theme";

// As cores da ETIQUETA (o que vai para o papel) usam só tokens de hex IDÊNTICO
// ao que já saía: a impressora recebe exatamente o mesmo preto e o mesmo cinza.
const GROTESK = FONT.display;

/** CSS das caixas. A altura é FIXA (a da área útil): o que não couber é
 *  cortado em vez de empurrar uma segunda página quase vazia para o adesivo —
 *  quem garante que cabe é a paginação conservadora de `paginarLinhas`. */
export const CSS_DA_ETIQUETA_EM_LISTA = `
  .etl-caixa { box-sizing: border-box; overflow: hidden; display: flex; flex-direction: column; background: ${T.surface}; color: ${T.text}; break-inside: avoid; page-break-inside: avoid; }
  .etl-vertical { writing-mode: vertical-rl; transform: rotate(180deg); white-space: nowrap; }
  @media screen { .etl-caixa { border: 1px solid ${T.bdark}; border-radius: ${R.sm}px; margin: 0 auto 16px; box-shadow: ${SHADOW.md}; } }
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
  /** Pé da etiqueta do tubo ("3 peças · 26 un. · embalado 21/09"). */
  rodape?: string | null;
};

export function EtiquetaEmLista<T extends PecaDaLista>(props: Props<T>) {
  const m = TAMANHOS[props.tamanho];
  const titulo = props.gigante || props.prefixo || "Evento";
  const miudo = `${Math.max(2.4, m.prefixoMm * 0.7)}mm`;
  return (
    <div className={`etl-caixa${props.ultima ? " etl-ultima" : ""}`} data-testid={props.testid} data-tamanho={props.tamanho}
      style={{ width: `${m.larguraMm}mm`, height: `${m.alturaMm}mm`, padding: `${m.margemMm / 2}mm`, maxWidth: "none" }}>
      <div style={{ flexShrink: 0, textAlign: "center", borderBottom: `0.8mm solid ${T.text}`, paddingBottom: "1.5mm" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "2mm", fontSize: miudo, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: T.apoio, lineHeight: 1.2 }}>
          <span>{props.saida ? `Saída ${props.saida}` : " "}</span>
          <span data-testid={props.testid ? `${props.testid}-contador` : undefined}>{props.contador ?? " "}</span>
        </div>
        {/* SEM loading="lazy": a etiqueta sai por window.print(), e imagem
            preguiçosa fora da vista (ou no portal escondido do tubo) pode ir
            em branco para o papel. O logo é data URL local — nada a poupar. */}
        {props.logo && (
          <img decoding="async" src={props.logo} alt="Logo do evento" data-testid="logo-etiqueta"
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
        <div style={{ flexShrink: 0, textAlign: "center", borderBottom: `0.8mm solid ${T.text}`, padding: "1mm 0 1.5mm" }}>
          <span data-testid="numero-do-tubo" style={{ fontFamily: GROTESK, fontSize: `${m.tuboMm}mm`, fontWeight: 900, lineHeight: 1, whiteSpace: "nowrap" }}>
            TUBO {props.tubo}
          </span>
        </div>
      )}

      {/* Só as peças, uma por linha — sem subtítulo de grupo (dono, 21/09:
          "tirar grupo, apenas nome do item"). */}
      {props.linhas.length === 0 ? (
        <p style={{ fontSize: `${m.linhaMm}mm`, color: T.apoio, textAlign: "center" }}>{props.vazio ?? "Sem peças."}</p>
      ) : (
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", alignItems: "center", paddingTop: "1.5mm" }}>
          {props.linhas.map((l, i) => (
            <p key={l.peca.id ?? `p-${i}`} data-testid={props.testidDaLinha && l.peca.id ? `${props.testidDaLinha}-${l.peca.id}` : undefined}
              style={{ margin: 0, maxWidth: "100%", fontFamily: GROTESK, fontSize: `${m.linhaMm}mm`, fontWeight: 800, lineHeight: 1.2, textAlign: "center", overflowWrap: "anywhere" }}>
              {linhaDaLista(l.peca, { mostrarQuantidade: props.mostrarQuantidade })}
            </p>
          ))}
        </div>
      )}

      {/* RODAPÉ discreto do tubo: "3 peças · 26 un. · embalado 21/09". */}
      {props.rodape && (
        <p data-testid={props.testid ? `${props.testid}-rodape` : undefined}
          style={{ flexShrink: 0, margin: "auto 0 0", paddingTop: "1mm", borderTop: `0.3mm solid ${T.muted}`, fontSize: miudo, fontWeight: 700, letterSpacing: "0.04em", color: T.apoio, textAlign: "center", lineHeight: 1.3 }}>
          {props.rodape}
        </p>
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
      style={{ width: `${m.larguraMm}mm`, height: `${m.alturaMm}mm`, padding: `${m.margemMm / 2}mm`, maxWidth: "none", alignItems: "center", justifyContent: "center", outline: `1.5mm solid ${T.text}`, outlineOffset: "-2.5mm" }}>
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
    <fieldset data-testid={props.testid} style={{ border: `1px solid ${T.border}`, borderRadius: R.lg, margin: 0, padding: "10px 12px 12px", minWidth: 0, backgroundColor: T.surface }}>
      {/* Caixa normal, não CAIXA-ALTA: o número ("1 ·") já dá a ordem, e
          quatro rótulos gritando competiam com o conteúdo da seção. */}
      <legend style={{ padding: "0 6px", fontFamily: FONT.display, fontSize: FS.body, fontWeight: FW.forte, color: T.strong }}>{props.titulo}</legend>
      {props.ajuda && <p style={{ margin: "0 0 8px", fontSize: FS.meta, lineHeight: 1.45, color: T.apoio }}>{props.ajuda}</p>}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>{props.children}</div>
    </fieldset>
  );
}

/** Um entre poucos (Individual | Lista, Deitada | Em pé, Tudo | Só…). Botões
 *  com aria-pressed dentro de um grupo rotulado; `alvo` é a altura (44 no toque).
 *
 *  Tem o DESENHO do <Segmentado> do design system (trilho rebaixado, o ativo
 *  ganha superfície), mas continua local: o de ui/abas não tem altura de toque
 *  (fica em 28px), não estica na largura do rodapé do celular e fala `tab` —
 *  aqui é escolha de opção (aria-pressed), não troca de conteúdo. */
export function Segmento<V extends string>(props: {
  rotulo: string; valor: V; opcoes: ReadonlyArray<readonly [V, string]>; aoMudar: (v: V) => void; alvo: number; testid: string; fonte?: number; esticar?: boolean;
}) {
  return (
    <div role="group" aria-label={props.rotulo} style={{ display: props.esticar ? "flex" : "inline-flex", gap: 2, padding: 3, borderRadius: R.md, border: `1px solid ${T.border}`, flexShrink: 0, backgroundColor: T.low }}>
      {props.opcoes.map(([v, texto]) => {
        const ativo = props.valor === v;
        return (
          <button key={v} type="button" className="etq-foco ds-botao" aria-pressed={ativo} onClick={() => props.aoMudar(v)} data-testid={`${props.testid}-${v}`}
            style={{
              flex: props.esticar ? 1 : undefined, minHeight: props.alvo, padding: "0 12px", borderRadius: R.sm,
              border: ativo ? `1px solid ${T.border}` : "1px solid transparent", boxShadow: ativo ? SHADOW.sm : "none",
              fontFamily: FONT.corpo, fontSize: props.fonte ?? FS.meta, fontWeight: ativo ? FW.forte : FW.medio, cursor: "pointer",
              backgroundColor: ativo ? T.surface : "transparent", color: ativo ? T.text : T.second,
            }}>
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
    <p className="etq-acao" data-testid={props.testid} style={{ margin: "0 auto 6px", fontSize: FS.meta, fontWeight: FW.forte, letterSpacing: "0.04em", color: T.apoio, textAlign: "center" }}>
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

/**
 * NÚMERO NA ETIQUETA (dono, 21/09: "editar números na etiqueta, não afeta nada
 * de status"): campo numérico compacto que só muda o que sai IMPRESSO. Mostra o
 * original até ser editado; editado, ganha o destaque laranja. O pai guarda o
 * texto cru (undefined = original) e decide o "voltar ao original".
 */
export function CampoNaEtiqueta(props: {
  rotulo: string; original: number; bruto: string | undefined; aoMudar: (bruto: string | undefined) => void;
  mobile: boolean; testid: string; editado: boolean; largura?: number;
}) {
  return (
    <input type="text" inputMode="numeric" pattern="[0-9]*" autoComplete="off" aria-label={props.rotulo} title={props.rotulo}
      value={props.bruto ?? String(props.original)} data-testid={props.testid} data-editado={props.editado ? "sim" : undefined}
      className="etq-foco"
      onChange={(e) => { const v = e.target.value.replace(/[^\d]/g, "").slice(0, 6); props.aoMudar(v === String(props.original) ? undefined : v); }}
      style={{
        ...estiloDoCampo(props.mobile), width: props.largura ?? (props.mobile ? 64 : 56), padding: "0 6px", textAlign: "center", fontVariantNumeric: "tabular-nums",
        ...(props.editado ? { border: `1px solid ${TOM.laranja.text}`, backgroundColor: TOM.laranja.bg, color: TOM.laranja.text, fontWeight: FW.rotulo } : {}),
      }} />
  );
}

/** Estilos comuns dos campos do painel — 16px no celular (o iOS dá zoom em
 *  campo menor que isso) e alvo de 44. */
export const estiloDoCampo = (mobile: boolean): CSSProperties => ({
  minHeight: mobile ? 44 : 34, borderRadius: R.md, border: `1px solid ${T.bdark}`, padding: "0 10px", fontSize: mobile ? FS.lead : FS.body,
  fontFamily: "inherit", fontWeight: FW.medio, color: T.text, backgroundColor: T.surface, minWidth: 0, boxSizing: "border-box",
});
