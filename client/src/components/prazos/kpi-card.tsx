// Card do placar. Informativo vira <div> (button disabled sai da ordem de tab
// e leitores anunciam "indisponível" para algo que não é ação nenhuma).
import { useState } from "react";
import { Filter } from "lucide-react";
import { R, SHADOW, TI } from "./tokens";

// Setinha de tendência vs o último registro. Para KPIs "ruins" (atrasados,
// peças), subir é vermelho e descer é verde; para "Eventos em dia" é o inverso.
//
// ATENÇÃO: o rótulo do title diz "último registro" DE PROPÓSITO — o servidor
// compara com o snapshot anterior mais recente, que numa segunda-feira é o de
// sexta. Trocar por "vs ontem" introduziria mentira.
export function TrendArrow({ delta, goodWhenUp }: { delta: number | undefined; goodWhenUp?: boolean }) {
  if (delta === undefined || delta === 0) return null;
  const up = delta > 0;
  const good = goodWhenUp ? up : !up;
  return (
    <span
      title={`${up ? "+" : ""}${delta} em relação ao último registro`}
      style={{
        fontSize: 12, fontWeight: 700, marginLeft: 6,
        color: good ? TI.green : TI.red,
        // Sem isto a seta senta na base de um numeral de 30px e fica pendurada
        // no rodapé do número, nos quatro cards ao mesmo tempo.
        verticalAlign: "middle",
      }}
    >
      {up ? "▲" : "▼"} {Math.abs(delta)}
    </span>
  );
}

export function KpiCard({
  label, value, tone, active, onClick, title, hint, testId, trend, goodWhenUp,
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
}) {
  const [hover, setHover] = useState(false);
  const colors = {
    // `tint` é o mesmo vocabulário da pílula "Só com atraso": filtro ligado
    // pinta o FUNDO. Antes o único sinal de KPI ativo era um anel de 1,5px,
    // que some no meio de quatro cards com borda.
    red: { num: TI.red, ring: TI.red, tint: TI.redBg },
    amber: { num: TI.amber, ring: TI.amber, tint: TI.amberBg },
    green: { num: TI.green, ring: TI.green, tint: TI.greenBg },
    neutral: { num: TI.title, ring: TI.idle, tint: TI.chipBg },
  }[tone];
  const clickable = !!onClick;
  const zero = value === 0;

  const cardStyle: React.CSSProperties = {
    textAlign: "left", cursor: clickable ? "pointer" : "default",
    // Os três tints medem ≥4,59:1 contra `TI.label` (o tom do rótulo e do
    // hint), então ligar o filtro não reprova AA em nenhum texto do card.
    backgroundColor: active ? colors.tint : TI.card,
    borderRadius: R.lg,
    border: active ? `1.5px solid ${colors.ring}` : `1px solid ${TI.border}`,
    padding: "14px 16px", minWidth: 0,
    // Hover só no clicável: é a affordance de que o card filtra.
    boxShadow: active || (clickable && hover) ? SHADOW.md : SHADOW.sm,
    transition: "box-shadow 0.12s ease, border-color 0.12s ease, background-color 0.12s ease",
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
        fontSize: 30, fontWeight: 800, lineHeight: 1,
        fontFamily: "'Space Grotesk', sans-serif",
        // Zero é sempre neutro — inclusive no verde: "Eventos em dia 0"
        // pintado de verde afirmaria o contrário do que o número diz.
        color: zero ? TI.label : colors.num,
      }}>
        {value}
        <TrendArrow delta={trend} goodWhenUp={goodWhenUp} />
      </span>
      {hint && (
        <span style={{ display: "block", marginTop: 6, fontSize: 10, lineHeight: 1.35, color: TI.label }}>
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
