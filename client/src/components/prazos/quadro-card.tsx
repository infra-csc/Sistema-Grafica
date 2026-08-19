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
  // SÓLIDO só para dano CONSUMADO que não tem número no cabeçalho: evento sem
  // peça e data quebrada. Os três estados de prazo viraram texto colorido —
  // quando todo card vencido do quadro carrega um retângulo vermelho cheio, o
  // vermelho para de significar "olhe aqui" e vira a cor de fundo da tela.
  //
  // O "há N dias" saiu do texto do vencido porque o contador do cabeçalho
  // agora diz exatamente isso, dois centímetros acima e em corpo maior.
  const gate: { texto: string; cor: string; solido: boolean } | null =
    semPecas ? { texto: "Nenhuma peça cadastrada", cor: TI.red, solido: true }
    : ev.invalidDate ? { texto: "Sem data confiável — corrija a saída", cor: TI.red, solido: true }
    : !stage ? null
    : stage.state === "overdue"
      ? { texto: `Prazo vencido · ${pecasTexto(stage.pendingCount)}`, cor: TI.red, solido: false }
    : stage.state === "warning"
      ? {
          texto: stage.diffDays === 0
            ? `Vence hoje · ${pecasTexto(stage.pendingCount)}`
            : `Vence em ${diasTexto(stage.diffDays)} · ${pecasTexto(stage.pendingCount)}`,
          cor: TI.amber, solido: false,
        }
    : { texto: `Prazo em ${fmtDayMonth(stage.deadline)} · ${pecasTexto(stage.pendingCount)}`, cor: TI.secondary, solido: false };

  // O CONTADOR do cabeçalho: o número que o diretor procura primeiro.
  //
  // Ele estava enterrado no meio de uma frase ("Prazo vencido há 13 dias ·
  // 12 peças"), em 12px, competindo com o nome do evento e com o chip de
  // saída. Sobe para a direita do nome, no corpo do título, para que a
  // varredura vertical de uma coluna de 20 cards leia só a coluna de números.
  const contador = !stage || semPecas || ev.invalidDate ? null
    : stage.state === "overdue" ? { texto: `${Math.abs(stage.diffDays)}d`, cor: STAGE_STYLE.overdue.text }
    : stage.state === "warning" && stage.diffDays === 0 ? { texto: "hoje", cor: STAGE_STYLE.warning.text }
    : { texto: fmtDayMonth(stage.deadline), cor: STAGE_STYLE[stage.state].text };

  // "1 de 40 travada aqui": a coluna é decidida pela peça MAIS ATRASADA, e o
  // card comunicava posição de EVENTO. Um evento com 39 peças já na Produção e
  // 1 esquecida no rascunho aparecia na coluna Lista — o diretor lia "esse
  // evento está na Lista de Imagens" e escalava com o setor errado.
  const travadasAqui = stage?.directCount ?? 0;
  const mostraTravadas = !semPecas && travadasAqui > 0 && travadasAqui < ev.totalItems;

  // As duas linhas de diagnóstico viram UMA. Elas respondem à mesma pergunta
  // — "qual o tamanho e a idade do problema" — e ocupavam dois parágrafos
  // separados por 6px, o que num card de 8 linhas lê como dois assuntos.
  const diagnostico = [
    mostraTravadas ? `${travadasAqui} de ${ev.totalItems} travada${travadasAqui !== 1 ? "s" : ""} nesta etapa` : null,
    ev.piorEsperaDias > 0 ? `pior peça parada há ${diasTexto(ev.piorEsperaDias)}` : null,
  ].filter(Boolean).join(" · ");

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
    // A fração de entregues era desenhada pela barra do `ProgressoPecas`, e
    // este `aria-label` SUBSTITUI todo o texto interno do botão — ou seja,
    // ela nunca foi audível. Sai a barra, entra a informação.
    !semPecas ? `${ev.deliveredItems} de ${ev.totalItems} peças entregues` : null,
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
        border: realce ? `1.5px solid ${TI.amber}` : `1px solid ${TI.border}`,
        // TRILHO em vez de moldura. O card vencido tinha a borda inteira em
        // vermelho claro, o que engrossa o contorno dos quatro lados e deixa
        // uma coluna de 20 cards parecendo uma grade de caixas vermelhas.
        // Um trilho de 3px na aresta esquerda diz o mesmo estado e mantém o
        // resto do card quieto — e vale para as três etapas com estado, não
        // só para a vencida. `upcoming` fica sem trilho: não há o que marcar.
        borderLeft: stage && stage.state !== "upcoming"
          ? `3px solid ${STAGE_STYLE[stage.state].dot}`
          : undefined,
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
            // `flex: 1` para o nome ceder espaço ao contador em vez de
            // empurrá-lo para fora do card nas colunas de 190px.
            flex: 1,
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
        {contador && (
          <span style={{
            flexShrink: 0,
            fontSize: 13, fontWeight: 700, color: contador.cor,
            fontFamily: "'Space Grotesk', sans-serif",
            fontVariantNumeric: "tabular-nums",
            lineHeight: 1.25,
          }}>
            {contador.texto}
          </span>
        )}
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
          // 600 e não 700: sem o retângulo colorido atrás, 700 fazia o gate
          // brigar com o nome do evento (800) por ser a segunda coisa mais
          // escura do card.
          fontSize: 12, fontWeight: gate.solido ? 700 : 600,
        }}>
          {gate.texto}
        </span>
      )}

      {/* 12px, e não 11: isto é FRASE, não rótulo. 11px é o tamanho dos
          micro-rótulos da tela (o selo, o cabeçalho de coluna); frase pede o
          degrau de leitura. E esta é o DIAGNÓSTICO do card — o contador diz
          que há atraso, ela diz o tamanho e a idade dele.

          A cor da régua (`dayColor`) continua valendo a partir de 3 dias de
          espera: é o mesmo âmbar/vermelho que o drilldown usa para os mesmos
          dias, e é o que separa o evento atrasado mas FERVENDO do atrasado e
          abandonado — duas cobranças completamente diferentes.

          "pior peça parada há 5 dias" fica por extenso de propósito: o
          contador do cabeçalho já usa a forma curta ("13d"), e duas grafias
          da mesma unidade no mesmo card fazem o olho comparar formatos em
          vez de números. */}
      {diagnostico && (
        <span style={{
          display: "block", marginTop: 6, fontSize: 12,
          color: ev.piorEsperaDias >= 3 ? dayColor(ev.piorEsperaDias) : TI.secondary,
          fontWeight: ev.piorEsperaDias >= 3 ? 700 : 400,
        }}>
          {diagnostico}
        </span>
      )}

      {/* Mini-trilha: onde o evento está no funil INTEIRO. Sem ela, "passou
          por três etapas e travou na quarta" e "não saiu do lugar" eram
          idênticos por estarem na mesma coluna. */}
      <span style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 8 }}>
        <span
          aria-hidden="true"
          title={trilhaTitle}
          style={{ display: "flex", alignItems: "center", gap: 5 }}
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
        {/* A FRAÇÃO no lugar da barra.

            O card terminava com uma barra de progresso de 3px cuja única
            leitura possível, num card de 190px, era "mais ou menos pela
            metade" — e a fração exata já cabia na mesma linha da trilha, que
            estava vazia à direita. `ProgressoPecas` continua existindo para
            as superfícies onde a barra tem largura para dizer algo. */}
        {!semPecas && (
          <span
            title={`${ev.deliveredItems} de ${ev.totalItems} peças entregues`}
            style={{
              marginLeft: "auto", flexShrink: 0,
              fontSize: 11, fontWeight: 600, color: TI.secondary,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {ev.deliveredItems}/{ev.totalItems}
          </span>
        )}
      </span>

      {cobranca && (
        <span style={{ display: "block", marginTop: 6 }}>
          <CobrancaLinha cobranca={cobranca} fontSize={10} />
        </span>
      )}
    </button>
  );
}
