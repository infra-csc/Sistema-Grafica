// Card do placar. Informativo vira <div> (button disabled sai da ordem de tab
// e leitores anunciam "indisponível" para algo que não é ação nenhuma).
import { useState } from "react";
import { Filter } from "lucide-react";
import { TI } from "./tokens";

// Tendência vs o último registro.
//
// O GLIFO SAIU. Era "▲ 2" / "▼ 1", e a direção só significava alguma coisa
// para quem já sabia a convenção — que INVERTE entre os cards: subir é ruim
// em "Eventos com atraso" e bom em "Eventos em dia". A seta ainda dependia de
// `verticalAlign` para não ficar pendurada na base de um numeral enorme.
//
// "+2 vs. último registro" diz o fato em palavras; a cor virou reforço, não o
// canal (WCAG 1.4.1). O sinal negativo é U+2212, não hífen: no mesmo peso e
// tamanho do "+" ele fica simétrico.
//
// ATENÇÃO: o rótulo diz "último registro" DE PROPÓSITO — o servidor compara
// com o snapshot anterior mais recente, que numa segunda-feira é o de sexta.
// Trocar por "vs ontem" introduziria mentira.
export function TrendArrow({ delta, goodWhenUp }: { delta: number | undefined; goodWhenUp?: boolean }) {
  if (delta === undefined || delta === 0) return null;
  const up = delta > 0;
  const good = goodWhenUp ? up : !up;
  return (
    <span
      title={`${up ? "+" : ""}${delta} em relação ao último registro`}
      style={{
        display: "block", marginTop: 5,
        fontSize: 11, fontWeight: 700,
        fontVariantNumeric: "tabular-nums",
        color: good ? TI.green : TI.red,
      }}
    >
      {up ? "+" : "\u2212"}{Math.abs(delta)} vs. último registro
    </span>
  );
}

export function KpiCard({
  label, value, tone, active, onClick, title, hint, testId, trend, goodWhenUp,
  divisorDireita, divisorBaixo,
}: {
  label: string;
  value: number;
  tone: "red" | "amber" | "green" | "neutral";
  active?: boolean;
  onClick?: () => void;
  title?: string;
  /**
   * Explicação em voz de NEGÓCIO, visível abaixo do número.
   *
   * O único KPI que tinha explicação era o não-clicável, ela descrevia o
   * ALGORITMO ("peças que ainda não passaram pela etapa vencida mais avançada")
   * e vivia num `title` dentro de um `<div>` que o teclado nunca alcança —
   * ou seja, a explicação existia só para quem tem mouse e já entendia. Aqui
   * ela é texto de verdade: entra na árvore de acessibilidade, imprime e não
   * depende de hover.
   */
  hint?: string;
  testId: string;
  trend?: number;
  goodWhenUp?: boolean;
  /**
   * O placar deixou de ser quatro cards soltos e virou UMA superfície com
   * quatro células. Quem sabe onde a célula está na grade é a página (o
   * número de colunas muda no celular), então ela diz quais divisores
   * desenhar em vez de o card adivinhar.
   */
  divisorDireita?: boolean;
  divisorBaixo?: boolean;
}) {
  const [hover, setHover] = useState(false);
  const colors = {
    // `tint` é o mesmo vocabulário da pílula "Só com atraso": filtro ligado
    // pinta o FUNDO. O anel de 1,5px que existia antes sumia no meio de
    // quatro cards com borda — e agora nem borda existe mais.
    red: { num: TI.red, ring: TI.red, tint: TI.redBg },
    amber: { num: TI.amber, ring: TI.amber, tint: TI.amberBg },
    green: { num: TI.green, ring: TI.green, tint: TI.greenBg },
    neutral: { num: TI.title, ring: TI.idle, tint: TI.chipBg },
  }[tone];
  const clickable = !!onClick;
  const zero = value === 0;

  // SEM moldura própria: borda, raio e sombra agora são da superfície que
  // envolve as quatro células. Quatro cards com borda de 1px separados por
  // 10px de vão desenhavam oito linhas verticais para dividir quatro números;
  // uma superfície com três hairlines diz a mesma coisa com menos traço.
  const cardStyle: React.CSSProperties = {
    textAlign: "left", cursor: clickable ? "pointer" : "default",
    // Os três tints medem ≥4,59:1 contra `TI.label` (o tom do rótulo e do
    // hint), então ligar o filtro não reprova AA em nenhum texto do card.
    // O hover usa `TI.sunken`, a mesma superfície afundada do thead: sem
    // borda e sem sombra, era o único canal de affordance que restou.
    backgroundColor: active ? colors.tint : (clickable && hover ? TI.sunken : TI.card),
    // Explicito, e ANTES das duas arestas: a celula clicavel e um <button>, que
    // traz borda propria do navegador. Hoje quem zera isso e o preflight do
    // Tailwind, mas depender dele deixaria a celula com moldura de volta no dia
    // em que alguem mexer no reset. Shorthand depois de `borderRight` apagaria
    // o divisor, entao a ordem aqui e a regra.
    border: "none",
    borderRight: divisorDireita ? `1px solid ${TI.track}` : undefined,
    borderBottom: divisorBaixo ? `1px solid ${TI.track}` : undefined,
    padding: "14px 16px", minWidth: 0,
    // O ativo vira uma régua embaixo da célula. Sem borda para engrossar e
    // sem sombra para levantar, `inset` é o único jeito de marcar a célula
    // sem quebrar o plano da superfície.
    boxShadow: active ? `inset 0 -2px 0 ${colors.ring}` : "none",
    transition: "box-shadow 0.12s ease, background-color 0.12s ease",
  };

  const content = (
    <>
      <span style={{
        display: "flex", alignItems: "center", gap: 5, fontSize: 10, fontWeight: 700,
        textTransform: "uppercase", letterSpacing: "0.1em", color: TI.label, marginBottom: 6,
        fontFamily: "'Plus Jakarta Sans', sans-serif",
      }}>
        {/* O funil marca em repouso quais KPIs FILTRAM — antes o único sinal
            era o anel de 1,5px que só aparece depois do clique. */}
        {clickable && <Filter aria-hidden="true" style={{ width: 11, height: 11, flexShrink: 0, color: TI.accentText }} />}
        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
      </span>
      <span style={{
        display: "block",
        // 34: o placar perdeu as bordas que o separavam do resto, então quem
        // segura a hierarquia agora é o tamanho do número.
        fontSize: 34, fontWeight: 800, lineHeight: 1,
        fontFamily: "'Space Grotesk', sans-serif",
        // Sem isto os quatro numerais mudam de largura entre um refetch e
        // outro, porque "1" é mais estreito que "8" na Space Grotesk.
        fontVariantNumeric: "tabular-nums",
        // Zero é sempre neutro — inclusive no verde: "Eventos em dia 0"
        // pintado de verde afirmaria o contrário do que o número diz.
        color: zero ? TI.label : colors.num,
      }}>
        {value}
      </span>
      {/* Fora do <span> do numeral: a frase é `display: block` e não pode
          herdar 34px nem a Space Grotesk do número. */}
      <TrendArrow delta={trend} goodWhenUp={goodWhenUp} />
      {/* 12px, e não 11: isto é FRASE, não rótulo.
          "com pelo menos uma etapa já vencida", "o caminhão sai de hoje até
          daqui a 7 dias" — são as linhas que explicam o que o número grande
          significa, e são o texto mais lido do topo da tela. 11px é tamanho de
          micro-rótulo (o selo, o cabeçalho de coluna); frase pede o degrau de
          leitura. O lineHeight sobe junto: 1.35 aperta linha que quebra em
          duas. */}
      {hint && (
        <span style={{ display: "block", marginTop: 6, fontSize: 12, lineHeight: 1.45, color: TI.label }}>
          {hint}
        </span>
      )}
    </>
  );

  if (!clickable) {
    return <div title={title} data-testid={testId} style={cardStyle}>{content}</div>;
  }
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      aria-pressed={!!active}
      title={title}
      data-testid={testId}
      style={cardStyle}
    >
      {content}
    </button>
  );
}
