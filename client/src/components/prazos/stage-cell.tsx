// Célula do semáforo de uma etapa. Extraída sem mudar a regra: o estado vem
// do servidor e o SÍMBOLO muda junto com a cor (✓ / Nd / nº / –), porque
// atraso não pode depender só de matiz.
//
// LEITOR DE TELA: tudo o que é VISUAL fica dentro de um único invólucro
// `aria-hidden`, e o `title` mora NELE. Antes o chip era aria-hidden mas a
// linha do meio não, e o `title` estava no wrapper visível — resultado: o
// leitor anunciava "8 peças", depois a frase do `sr-only` e, em alguns
// leitores, o `title` como descrição. Três vezes por célula, cinco células por
// linha de tabela. Agora o `sr-only` é a ÚNICA fonte falada e o `title` volta a
// ser o que sempre foi: tooltip de mouse.
import { diasTexto, fmtDayMonth, pecasTexto, R, STAGE_STYLE, TI } from "./tokens";
import type { PrazoStage } from "@shared/prazos-contract";

export function StageCell({ stage, invalidDate }: { stage: PrazoStage; invalidDate?: boolean }) {
  const st = STAGE_STYLE[stage.state];
  const pendentes = `${stage.pendingCount} pendente${stage.pendingCount !== 1 ? "s" : ""}`;
  const statusText =
    invalidDate ? "sem data confiável — corrija a saída do evento"
    : stage.state === "done" ? "concluída"
    // Por extenso na frase falada: "vencida há 5d" é abreviação de tabela, e
    // aqui o texto não disputa pixel nenhum.
    : stage.state === "overdue" ? `vencida há ${diasTexto(Math.abs(stage.diffDays))} com ${pecasTexto(stage.pendingCount)} pendente${stage.pendingCount !== 1 ? "s" : ""}`
    : stage.state === "warning" ? (stage.diffDays === 0 ? `vence hoje com ${pendentes}` : `vence em ${diasTexto(stage.diffDays)} com ${pendentes}`)
    : `prevista para ${fmtDayMonth(stage.deadline)}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "2px 0" }}>
      <span
        aria-hidden="true"
        title={`${stage.label}: ${statusText}`}
        style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}
      >
        <span
          style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            minWidth: 22, height: 22, padding: "0 5px", borderRadius: R.pill,
            backgroundColor: stage.state === "upcoming" ? TI.chipBg : st.bg,
            border: `1.5px solid ${st.dot}`,
            fontSize: 11, fontWeight: 800, color: st.text,
            fontFamily: "'Space Grotesk', sans-serif", lineHeight: 1,
          }}
        >
          {stage.state === "done" ? "✓"
            : stage.state === "overdue" ? `${Math.abs(stage.diffDays)}d`
            : stage.state === "warning" ? stage.pendingCount
            // Futura: só as peças travadas NELA (o acumulado repetido em 5
            // células cinza era ruído); sem pendência própria, célula quieta.
            : stage.directCount > 0 ? stage.directCount : "–"}
        </span>
        <span style={{
          fontSize: 10, color: stage.state === "overdue" ? TI.red : TI.label,
          fontWeight: stage.state === "overdue" ? 700 : 500, whiteSpace: "nowrap",
        }}>
          {invalidDate ? "—"
            // Prazo vencido: quantas peças travadas importa mais que o dd/mm
            // que já passou — o par "dias + peças" responde a cobrança na
            // célula. "pç" era a única abreviação de "peça" da tela inteira e
            // cabe por extenso até em coluna de 50px.
            : stage.state === "overdue" ? pecasTexto(stage.pendingCount)
            : fmtDayMonth(stage.deadline)}
        </span>
      </span>
      <span className="sr-only">{stage.label}: {statusText}</span>
    </div>
  );
}
