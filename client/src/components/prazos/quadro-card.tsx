// Card de um evento no quadro.
//
// O quadro é a visão PADRÃO do desktop e tinha menos informação que a tabela
// secundária. Este card devolve o que faltava: nome legível em duas linhas
// (com `title`), a DATA da saída junto do countdown, a fração de entregues
// rotulada, o critério do selo RISCO, a mini-trilha das etapas, a pior
// peça parada e — o mais importante — quantas peças estão travadas AQUI
// contra o total do evento.
//
// A hierarquia foi invertida: o preenchimento SÓLIDO agora é do dano
// consumado (prazo vencido, evento sem peças, data quebrada); o selo RISCO,
// que é risco PROJETADO, virou contorno. O mais sólido tem que ser o mais
// urgente.
import { useState } from "react";
import { getPriorityMeta } from "@/lib/status";
import type { CobrancaEntry, PrazoEvent, PrazoStage } from "@shared/prazos-contract";
import { CobrancaLinha, cobrancaResumo } from "./cobrado-control";
import { PrioridadeChip, PrioridadePonto } from "./prioridade";
import { ProgressoPecas } from "./progresso-pecas";
import { SeloRisco } from "./selo-risco";
import {
  dayColor, diasTexto, fmtDayMonth, fmtDiaCurto, pecasTexto, R, RISCO_TITLE,
  saidaChip, SHADOW, STAGE_SHORT, STAGE_STYLE, TI,
} from "./tokens";

interface QuadroCardProps {
  ev: PrazoEvent;
  /** Etapa da COLUNA em que o card está (pode faltar num payload antigo). */
  stage?: PrazoStage;
  cobranca?: CobrancaEntry;
  onOpen: () => void;
  onFocusCard: () => void;
  /** Realce de ~1,2s: este card acabou de mudar de coluna. */
  realce?: boolean;
}

export function QuadroCard({ ev, stage, cobranca, onOpen, onFocusCard, realce }: QuadroCardProps) {
  // Hover em estado React (não `currentTarget.style`): mutar o nó direto
  // perde o teclado — quem chega no card por Tab não recebia elevação
  // nenhuma. O KpiCard desta mesma tela já fazia assim.
  const [elevado, setElevado] = useState(false);

  const chip = saidaChip(ev);
  const prio = getPriorityMeta(ev.priority);
  const semPecas = ev.categoria === "semPecas" || ev.totalItems === 0;
  const overdue = stage?.state === "overdue";

  // Ordem dos ramos: MESMA precedência da `categoria` do domínio
  // (semPecas > dataInvalida > ...). O evento sem peça E com data quebrada
  // deve dizer "Nenhuma peça cadastrada" — sem peça nem existe funil a
  // corrigir, e é a mesma frase que o KPI e o filtro usam para ele.
  const gate: { texto: string; cor: string; solido: boolean } | null =
    semPecas ? { texto: "Nenhuma peça cadastrada", cor: TI.red, solido: true }
    : ev.invalidDate ? { texto: "Sem data confiável — corrija a saída", cor: TI.red, solido: true }
    : !stage ? null
    : stage.state === "overdue"
      ? { texto: `Prazo vencido há ${diasTexto(Math.abs(stage.diffDays))} · ${pecasTexto(stage.pendingCount)}`, cor: TI.red, solido: true }
    : stage.state === "warning"
      ? {
          texto: stage.diffDays === 0
            ? `Vence hoje · ${pecasTexto(stage.pendingCount)}`
            : `Vence em ${diasTexto(stage.diffDays)} · ${pecasTexto(stage.pendingCount)}`,
          cor: TI.amber, solido: false,
        }
    : { texto: `Prazo em ${fmtDayMonth(stage.deadline)} · ${pecasTexto(stage.pendingCount)}`, cor: TI.secondary, solido: false };

  // "1 de 40 travada aqui": a coluna é decidida pela peça MAIS ATRASADA, e o
  // card comunicava posição de EVENTO. Um evento com 39 peças já na Produção e
  // 1 esquecida no rascunho aparecia na coluna Lista — o diretor lia "esse
  // evento está na Lista de Imagens" e escalava com o setor errado.
  const travadasAqui = stage?.directCount ?? 0;
  const mostraTravadas = !semPecas && travadasAqui > 0 && travadasAqui < ev.totalItems;

  const trilhaTitle = ev.stages
    .map((s) => `${STAGE_SHORT[s.key] ?? s.label}: ${
      s.state === "done" ? "concluída"
      : s.state === "overdue" ? `vencida há ${diasTexto(Math.abs(s.diffDays))}`
      : s.state === "warning" ? "vence agora" : "prevista"}`)
    .join(" · ");

  // O `aria-label` do botão SUBSTITUI todo o texto interno para o leitor de
  // tela — então tudo o que é selo visual precisa estar aqui, e o critério do
  // RISCO por extenso (um `sr-only` dentro do botão seria ignorado). A
  // cobrança entra pelo mesmo motivo: "promessa vencida há 2d" é o rótulo
  // mais forte da tela e ficava inaudível justamente na visão padrão.
  const resumoAcessivel = [
    prio ? `prioridade ${prio.label}` : null,
    chip.full,
    gate?.texto,
    ev.riskCritical ? `em risco: ${RISCO_TITLE}` : null,
    cobranca ? cobrancaResumo(cobranca) : null,
  ].filter(Boolean).join("; ");

  return (
    <button
      type="button"
      onClick={onOpen}
      onFocus={() => { setElevado(true); onFocusCard(); }}
      onBlur={() => setElevado(false)}
      onMouseEnter={() => setElevado(true)}
      onMouseLeave={() => setElevado(false)}
      data-card-id={ev.id}
      data-testid={`card-quadro-${ev.id}`}
      aria-haspopup="dialog"
      aria-label={`${ev.name} — ${resumoAcessivel}; abrir detalhes`}
      style={{
        textAlign: "left", width: "100%", cursor: "pointer",
        backgroundColor: realce ? TI.amberRow : TI.card,
        borderRadius: R.lg, padding: "12px 14px",
        border: realce
          ? `1.5px solid ${TI.amber}`
          : overdue ? `1.5px solid ${TI.redEdge}` : `1px solid ${TI.border}`,
        boxShadow: elevado ? SHADOW.md : SHADOW.sm,
        transition: "box-shadow 0.12s ease, background-color 0.6s ease, border-color 0.6s ease",
      }}
    >
      <span style={{ display: "flex", alignItems: "flex-start", gap: 6, minWidth: 0 }}>
        {/* Média/baixa continuam como ponto quieto ao lado do nome; urgente e
            alta viram chip de texto na linha de selos abaixo. */}
        <PrioridadePonto priority={ev.priority} style={{ marginTop: 5 }} />
        <span
          title={ev.name}
          style={{
            fontSize: 13, fontWeight: 800, color: TI.title,
            fontFamily: "'Space Grotesk', sans-serif", textTransform: "uppercase",
            // Duas linhas: "COPA BRASIL — ETAPA 1" e "— ETAPA 2" truncavam
            // IDÊNTICOS numa tela cuja função é cobrar o responsável pelo
            // evento X, e sem `title` não havia plano B.
            display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
            overflow: "hidden", lineHeight: 1.25, minWidth: 0,
          }}
        >
          {ev.name}
        </span>
      </span>

      <span style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 7, flexWrap: "wrap" }}>
        <PrioridadeChip priority={ev.priority} />
        {!ev.invalidDate && (
          <span style={{ fontSize: 11, fontWeight: 700, color: TI.secondary, whiteSpace: "nowrap" }}>
            {fmtDiaCurto(ev.truckDepartureDate)} ·
          </span>
        )}
        <span
          title={chip.full}
          style={{
            padding: "2px 8px", borderRadius: R.pill, backgroundColor: chip.bg,
            color: chip.color, fontSize: 11, fontWeight: 700,
            // Sem isto "Saída atrasada 12 dias" quebrava dentro de uma pílula
            // de raio 999 nas colunas estreitas (o card mobile já tinha).
            whiteSpace: "nowrap",
          }}
        >
          {chip.text}
        </span>
        {/* Sem chip "não iniciado" aqui: o gate sólido "Nenhuma peça
            cadastrada" logo abaixo já conta essa história — dois selos para o
            mesmo fato disputavam atenção sem acrescentar nada. */}
        {ev.riskCritical && <SeloRisco />}
      </span>

      {gate && (
        <span style={{
          display: "inline-block", marginTop: 7,
          padding: gate.solido ? "3px 9px" : 0,
          borderRadius: gate.solido ? R.sm : 0,
          backgroundColor: gate.solido ? gate.cor : "transparent",
          color: gate.solido ? "#ffffff" : gate.cor,
          fontSize: 12, fontWeight: 700,
        }}>
          {gate.texto}
        </span>
      )}

      {/* 12px, e não 11: isto é FRASE, não rótulo.

          Varri a tela medindo texto de 5+ palavras em 11px e achei 174
          ocorrências — 166 delas neste card, em só DUAS linhas repetidas por
          86 cards: esta e a de "pior peça parada há…". 11px é o tamanho dos
          micro-rótulos da tela (o selo, o cabeçalho de coluna); frase pede o
          degrau de leitura.

          E estas duas são o DIAGNÓSTICO do card: o número grande diz que há
          atraso, elas dizem o tamanho e a idade dele. Eram o texto mais
          apagado de um card que existe para ser lido de relance. */}
      {mostraTravadas && (
        <span style={{ display: "block", marginTop: 4, fontSize: 12, color: TI.secondary }}>
          {travadasAqui} de {ev.totalItems} travada{travadasAqui !== 1 ? "s" : ""} nesta etapa
        </span>
      )}

      {/* Mini-trilha: onde o evento está no funil INTEIRO. Sem ela, "passou
          por três etapas e travou na quarta" e "não saiu do lugar" eram
          idênticos por estarem na mesma coluna. */}
      <span
        aria-hidden="true"
        title={trilhaTitle}
        style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 8 }}
      >
        {ev.stages.map((s, i) => {
          const atual = stage ? s.key === stage.key : false;
          return (
            <span
              key={s.key}
              style={{
                width: 6, height: 6, borderRadius: R.pill, flexShrink: 0,
                backgroundColor: ev.invalidDate && s.state !== "done" ? TI.idle : STAGE_STYLE[s.state].dot,
                boxShadow: atual ? `0 0 0 2px ${TI.card}, 0 0 0 3.5px ${STAGE_STYLE[s.state].dot}` : "none",
                marginRight: atual ? 2 : 0,
                marginLeft: atual && i > 0 ? 2 : 0,
              }}
            />
          );
        })}
      </span>

      {ev.piorEsperaDias > 0 && (
        // Separa o evento atrasado mas FERVENDO do atrasado e abandonado —
        // duas cobranças completamente diferentes. A partir de 3 dias a linha
        // ganha a cor da régua única (`dayColor`): é o mesmo âmbar/vermelho
        // que o drill usa para os mesmos dias — abandono visível de relance.
        <span style={{
          // 12px pelo mesmo motivo da linha de "travadas": é frase, não
          // rótulo, e é metade do diagnóstico do card.
          display: "block", marginTop: 6, fontSize: 12,
          color: ev.piorEsperaDias >= 3 ? dayColor(ev.piorEsperaDias) : TI.secondary,
          fontWeight: ev.piorEsperaDias >= 3 ? 700 : 400,
        }}>
          {/* Por extenso: este "há 5 dias" fica a sete pixels do "Faltam 3
              dias" do chip. Duas grafias da mesma unidade no mesmo card fazem
              o olho comparar formatos em vez de números. */}
          pior peça parada há {diasTexto(ev.piorEsperaDias)}
        </span>
      )}

      <ProgressoPecas delivered={ev.deliveredItems} total={ev.totalItems} variant="linha" />

      {cobranca && (
        <span style={{ display: "block", marginTop: 6 }}>
          <CobrancaLinha cobranca={cobranca} fontSize={10} />
        </span>
      )}
    </button>
  );
}
