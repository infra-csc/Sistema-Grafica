// ─────────────────────────────────────────────────────────────────────────────
// OS BLOCOS ESTRUTURAIS DA ANÁLISES — seção, grade de números e tabela.
//
// Vieram de pages/analises/componentes.tsx (a Análises de status, retirada em
// 16/10 por decisão do dono: "pode tirar o que já tem no Análises hoje"); aqui
// fica só o que o Painel operacional usa, sem a régua de peças da tela antiga.
//
//   <SecaoDaAnalise id titulo descricao? acoes? testId? semMoldura? style?>…</SecaoDaAnalise>
//   <GradeDeNumeros minimo={170}>…cartões…</GradeDeNumeros>
//   <TabelaCompacta<L> colunas linhas chave legenda ordemInicial? limite? alturaMaxima?
//                      vazio? aoClicarLinha? minLargura? testId? />
//       — coluna com `ocultarNoCelular` some abaixo de 768px ou quando a
//         tabela não cabe no cartão; `alturaMaxima` dá rolagem própria com o
//         cabeçalho fixo (a página não rola de lado nunca: a tabela larga rola
//         DENTRO do cartão).
//   idDaPeca(p) → "#0042"
// ─────────────────────────────────────────────────────────────────────────────
import * as React from "react";
import { Botao } from "@/components/ui/botao";
import { T, N, FS, FW, R, FONT } from "@/lib/theme";
import { useElementSize, useIsMobile } from "@/hooks/use-mobile";

const TABULAR: React.CSSProperties = { fontVariantNumeric: "tabular-nums" };

export const fmtInt = (n: number): string => Math.round(n).toLocaleString("pt-BR");

/** "#0042" — o displayId às vezes já vem com "#", e "##0042" não pode aparecer. */
export function idDaPeca(p: { id: string; displayId?: string | null }): string {
  const bruto = String(p.displayId ?? "").trim().replace(/^#+/, "");
  return `#${bruto || p.id.slice(0, 8)}`;
}

export function SecaoDaAnalise({
  id, titulo, descricao, acoes, children, testId, semMoldura = false, style,
}: {
  style?: React.CSSProperties;
  /** id do <h2> — a seção diz `aria-labelledby` dele. */
  id: string;
  titulo: string;
  descricao?: React.ReactNode;
  acoes?: React.ReactNode;
  children: React.ReactNode;
  testId?: string;
  semMoldura?: boolean;
}) {
  const isMobile = useIsMobile();
  return (
    <section
      aria-labelledby={id}
      data-testid={testId}
      style={semMoldura ? { minWidth: 0, ...style } : {
        backgroundColor: T.surface, border: `1px solid ${T.border}`, borderRadius: R.lg,
        padding: isMobile ? "16px 14px" : "20px 22px", minWidth: 0, ...style,
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", columnGap: 16, rowGap: 8, marginBottom: 14 }}>
        <div style={{ minWidth: 0, flex: "1 1 260px" }}>
          <h2 id={id} style={{ margin: 0, fontFamily: FONT.display, fontSize: FS.title, fontWeight: FW.forte, letterSpacing: "-0.02em", color: T.text, lineHeight: 1.25 }}>
            {titulo}
          </h2>
          {descricao && (
            <p style={{ margin: "4px 0 0", fontSize: FS.small, lineHeight: 1.5, color: T.second, maxWidth: 760 }}>{descricao}</p>
          )}
        </div>
        {acoes && <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>{acoes}</div>}
      </div>
      {children}
    </section>
  );
}

/**
 * A grade dos números com LINHAS EQUILIBRADAS: mede a própria largura e escolhe
 * o número de colunas que divide as linhas por igual (6 → 3 + 3, não 4 + 2).
 */
export function GradeDeNumeros({ children, minimo = 170, rotulo, testId }: {
  children: React.ReactNode; minimo?: number; rotulo?: string; testId?: string;
}) {
  const GAP = 12;
  const { ref, width } = useElementSize<HTMLDivElement>();
  const itens = React.Children.toArray(children).filter(Boolean);
  const n = itens.length;
  let colunas = 0;
  if (width > 0 && n > 0) {
    const cabem = Math.max(1, Math.floor((width + GAP) / (minimo + GAP)));
    const linhas = Math.ceil(n / Math.min(cabem, n));
    colunas = Math.ceil(n / linhas);
  }
  return (
    <div
      ref={ref}
      role={rotulo ? "group" : undefined}
      aria-label={rotulo}
      data-testid={testId}
      style={colunas > 0
        ? { display: "flex", flexWrap: "wrap", gap: GAP }
        : { display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(min(${minimo}px, 100%), 1fr))`, gap: GAP }}
    >
      {colunas > 0
        ? itens.map((filho, i) => (
          <div key={i} style={{ display: "grid", minWidth: 0, flex: `1 1 calc((100% - ${(colunas - 1) * GAP}px) / ${colunas})` }}>{filho}</div>
        ))
        : itens}
    </div>
  );
}

// ─── Tabela compacta ordenável ───────────────────────────────────────────────

export interface ColunaDaTabela<L> {
  id: string;
  rotulo: string;
  alinhar?: "esquerda" | "direita";
  /** O valor de ORDENAÇÃO (e o exibido, quando não há `render`). */
  valor: (l: L) => number | string | null;
  render?: (l: L) => React.ReactNode;
  ordenavel?: boolean;
  titulo?: string;
  largura?: number | string;
  /** Coluna secundária: some abaixo de 768px (ou quando a tabela não cabe). */
  ocultarNoCelular?: boolean;
}

export function TabelaCompacta<L>({
  colunas, linhas, chave, legenda, ordemInicial, limite = 10, vazio = "Nada para mostrar neste recorte.", aoClicarLinha, minLargura = 560, alturaMaxima, larguraDaPrimeira = 150, encolherAoTransbordar = true, testId = "tabela", rodape,
}: {
  /**
   * A linha de TOTAL no pé da tabela (30/10): o rótulo vai na 1ª coluna e
   * `valores` traz o conteúdo das outras pelo id da coluna (ausente = vazio).
   */
  rodape?: { rotulo: string; valores: Partial<Record<string, React.ReactNode>> };
  colunas: ColunaDaTabela<L>[];
  linhas: L[];
  chave: (l: L) => string;
  /** <caption> (lido por leitor de tela; visualmente oculto). */
  legenda: string;
  ordemInicial?: { coluna: string; direcao: "asc" | "desc" };
  limite?: number;
  vazio?: string;
  aoClicarLinha?: (l: L) => void;
  minLargura?: number;
  /** Altura máxima da caixa: passa disso, a tabela rola DENTRO dela, com o cabeçalho fixo. */
  alturaMaxima?: number;
  /**
   * Largura mínima da 1ª coluna (o nome). Sem ela, num cartão estreito as colunas
   * numéricas (que não quebram) espremiam o nome até uma letra por linha.
   */
  larguraDaPrimeira?: number;
  /**
   * true (padrão): sem largura, as colunas secundárias saem (como no celular).
   * false: a tabela mantém todas as colunas e rola de lado dentro do cartão —
   * para as listas de peças, em que cada coluna é um dado que se procura.
   */
  encolherAoTransbordar?: boolean;
  testId?: string;
}) {
  const isMobile = useIsMobile();
  const { ref: refDaTabela, width: larguraDaTabela } = useElementSize<HTMLDivElement>();
  const refDaRolagem = React.useRef<HTMLDivElement>(null);
  const [transborda, setTransborda] = React.useState(false);
  React.useLayoutEffect(() => { setTransborda(false); }, [larguraDaTabela]);
  React.useLayoutEffect(() => {
    const el = refDaRolagem.current;
    if (encolherAoTransbordar && !transborda && el && el.scrollWidth > el.clientWidth + 1) setTransborda(true);
  });
  if (isMobile || transborda) {
    colunas = colunas.filter((c) => !c.ocultarNoCelular);
    minLargura = 0;
  }
  const [ordem, setOrdem] = React.useState(ordemInicial ?? null);
  const [todas, setTodas] = React.useState(false);
  const ordenadas = React.useMemo(() => {
    if (!ordem) return linhas;
    const col = colunas.find((c) => c.id === ordem.coluna);
    if (!col) return linhas;
    const sinal = ordem.direcao === "asc" ? 1 : -1;
    return [...linhas].sort((a, b) => {
      const va = col.valor(a); const vb = col.valor(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * sinal;
      return String(va).localeCompare(String(vb), "pt-BR") * sinal;
    });
  }, [linhas, colunas, ordem]);
  const visiveis = todas ? ordenadas : ordenadas.slice(0, limite);
  // A PISTA DE QUE A TABELA CONTINUA À DIREITA: um degradê na borda enquanto
  // houver coluna escondida (some ao chegar no fim da rolagem).
  const [maisADireita, setMaisADireita] = React.useState(false);
  React.useEffect(() => {
    const el = refDaRolagem.current;
    if (!el) return;
    const medir = () => setMaisADireita(el.scrollWidth - el.clientWidth - el.scrollLeft > 2);
    medir();
    el.addEventListener("scroll", medir, { passive: true });
    window.addEventListener("resize", medir);
    return () => { el.removeEventListener("scroll", medir); window.removeEventListener("resize", medir); };
  });

  if (linhas.length === 0) {
    return <p data-testid={`${testId}-vazia`} style={{ margin: 0, padding: "18px 0", textAlign: "center", fontSize: FS.small, color: T.second, border: `1px dashed ${T.border}`, borderRadius: R.md }}>{vazio}</p>;
  }

  const th: React.CSSProperties = {
    padding: isMobile ? "8px 6px" : "8px 10px", fontSize: FS.micro, fontWeight: FW.rotulo, letterSpacing: "0.1em", textTransform: "uppercase",
    color: T.second, borderBottom: `1px solid ${T.bdark}`, backgroundColor: T.low,
    whiteSpace: isMobile ? "normal" : "nowrap", position: "sticky", top: 0, zIndex: 1,
  };
  const respiro = isMobile ? "8px 6px" : "8px 10px";
  return (
    <div data-testid={testId} ref={refDaTabela} style={{ position: "relative" }}>
      {maisADireita && (
        <span aria-hidden="true" data-testid={`${testId}-mais-colunas`} style={{ position: "absolute", top: 0, right: 0, bottom: ordenadas.length > limite ? 44 : 0, width: 28, pointerEvents: "none", zIndex: 2, background: `linear-gradient(to left, ${T.surface}, rgba(255,255,255,0))` }} />
      )}
      <div
        ref={refDaRolagem}
        className="pop-rolagem"
        // Rolagem vertical própria (com o cabeçalho fixo) só com a lista inteira
        // aberta: nas primeiras linhas a tabela mostra tudo, sem linha cortada.
        tabIndex={alturaMaxima && todas ? 0 : undefined}
        aria-label={alturaMaxima && todas ? `${legenda} (role para ver mais)` : undefined}
        style={{ overflowX: "auto", ...(alturaMaxima && todas ? { maxHeight: alturaMaxima, overflowY: "auto" } : null), borderRadius: R.sm }}
      >
        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, minWidth: minLargura }}>
          <caption className="sr-only">{legenda}</caption>
          <thead>
            <tr>
              {colunas.map((c) => {
                const ativa = ordem?.coluna === c.id;
                const alinhar = c.alinhar === "direita" ? "right" : "left";
                return (
                  <th
                    key={c.id} scope="col" title={c.titulo}
                    aria-sort={ativa ? (ordem!.direcao === "asc" ? "ascending" : "descending") : undefined}
                    style={{
                      ...th, textAlign: alinhar, width: c.largura, padding: c.ordenavel ? 0 : th.padding,
                      // A 1ª coluna (o nome) fica PRESA à esquerda quando a tabela rola de lado:
                      // sem ela, os números da direita ficavam sem dono.
                      ...(colunas[0] === c ? { minWidth: larguraDaPrimeira, left: 0, zIndex: 3, boxShadow: `1px 0 0 ${T.border}` } : null),
                    }}
                  >
                    {c.ordenavel ? (
                      <button
                        type="button"
                        data-testid={`${testId}-ordem-${c.id}`}
                        className="pop-ordenar"
                        onClick={() => setOrdem((o) => ({ coluna: c.id, direcao: o?.coluna === c.id && o.direcao === "desc" ? "asc" : "desc" }))}
                        style={{
                          width: "100%", padding: respiro, border: "none", background: "none", cursor: "pointer",
                          font: "inherit", letterSpacing: "inherit", textTransform: "inherit", textAlign: alinhar,
                          color: ativa ? T.accentText : T.second,
                        }}
                      >
                        {c.rotulo}{ativa ? (ordem!.direcao === "desc" ? " ▾" : " ▴") : ""}
                      </button>
                    ) : c.rotulo}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visiveis.map((l) => (
              <tr
                key={chave(l)}
                data-testid={`${testId}-linha`}
                className={aoClicarLinha ? "pop-linha-clicavel" : undefined}
                onClick={aoClicarLinha ? (e) => {
                  if ((e.target as HTMLElement).closest("button, a")) return;
                  aoClicarLinha(l);
                } : undefined}
                style={{ cursor: aoClicarLinha ? "pointer" : "default" }}
              >
                {colunas.map((c, i) => {
                  const conteudo = c.render ? c.render(l) : (c.valor(l) ?? "—");
                  const Cel = i === 0 ? "th" : "td";
                  return (
                    <Cel
                      key={c.id}
                      scope={i === 0 ? "row" : undefined}
                      style={{
                        ...TABULAR, padding: isMobile ? "9px 6px" : "9px 10px", fontSize: FS.body, fontWeight: i === 0 ? FW.medio : FW.corpo,
                        color: T.text, textAlign: c.alinhar === "direita" ? "right" : "left", verticalAlign: "middle",
                        borderBottom: `1px solid ${N.n3}`,
                        ...(i === 0 ? { minWidth: larguraDaPrimeira, position: "sticky", left: 0, zIndex: 1, backgroundColor: T.surface, boxShadow: `1px 0 0 ${N.n3}` } : null),
                      }}
                    >
                      {typeof conteudo === "number" ? fmtInt(conteudo) : conteudo}
                    </Cel>
                  );
                })}
              </tr>
            ))}
          </tbody>
          {rodape && (
            <tfoot>
              <tr data-testid={`${testId}-total`}>
                {colunas.map((c, i) => {
                  const Cel = i === 0 ? "th" : "td";
                  const v = i === 0 ? rodape.rotulo : rodape.valores[c.id];
                  return (
                    <Cel
                      key={c.id}
                      scope={i === 0 ? "row" : undefined}
                      style={{
                        ...TABULAR, padding: isMobile ? "9px 6px" : "9px 10px", fontSize: FS.body, fontWeight: FW.forte,
                        color: T.text, textAlign: c.alinhar === "direita" ? "right" : "left", verticalAlign: "middle",
                        borderTop: `1px solid ${T.bdark}`, backgroundColor: T.low,
                        ...(i === 0 ? { minWidth: larguraDaPrimeira, position: "sticky", left: 0, zIndex: 1, boxShadow: `1px 0 0 ${N.n3}` } : null),
                      }}
                    >
                      {typeof v === "number" ? fmtInt(v) : (v ?? "")}
                    </Cel>
                  );
                })}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {ordenadas.length > limite && (
        <Botao variante="fantasma" tamanho={isMobile ? "toque" : "sm"} onClick={() => setTodas((v) => !v)} data-testid={`${testId}-mostrar-todas`} style={{ marginTop: 8 }}>
          {todas ? `Mostrar só as ${limite} primeiras` : `Mostrar todas as ${fmtInt(ordenadas.length)} linhas`}
        </Botao>
      )}
    </div>
  );
}
