// ─────────────────────────────────────────────────────────────────────────────
// PRAZO EM LINHA — o prazo de UMA peça dentro de uma linha de lista.
//
// PORQUÊ ESTE ARQUIVO EXISTE. O prazo da peça era desenhado como uma CAIXA
// PREENCHIDA de duas linhas (data em cima, "16d atrasado" embaixo) na coluna
// "Prazo" da Arte. Numa fila com 30 peças atrasadas isso são 30 retângulos
// vermelhos empilhados: o dado de APOIO — que só serve para decidir a ordem do
// trabalho — virava o elemento mais pesado da linha, mais forte que o botão de
// ação que a pessoa efetivamente clica. E, sendo o mesmo retângulo em todas,
// não distinguia "atrasado há 1 dia" de "atrasado há 16": a área de cor era
// idêntica, a magnitude ficava só nos dois dígitos menores da caixa.
//
// A correção é de HIERARQUIA, não de matiz: o prazo deixa de ter superfície.
// Vira TEXTO — a mesma decisão que o chip de prazo do Painel Geral já tinha
// tomado (ver `painel-geral.tsx`: `fontWeight 800` + `deadline.color`, sem
// fundo e sem borda). Sem fundo e sem borda, a cor ocupa a área das letras e
// não a do retângulo, e a coluna inteira vermelha vira uma LISTA de frases
// curtas em vez de uma parede.
//
// A magnitude passa a ser MASSA TIPOGRÁFICA, não área de cor: o número é a
// única coisa que muda de linha para linha, então ele é a parte mais pesada do
// token, e um atraso grave (3+ dias) pesa mais que um atraso de véspera. Trinta
// linhas atrasadas produzem trinta números de peso variável — que é exatamente
// a ordem em que o trabalho deve ser atacado — em vez de trinta blocos iguais.
//
// A PALETA NÃO É NOVA. `PRAZO_COLORS` (lib/painel-prazo.ts) é a régua de prazo
// que o Painel Geral já usa, com os contrastes medidos lá; a Gestão de Prazos
// carrega os MESMOS três valores no `TI` dela (#b91c1c / #b45309 / #746e69).
// Importar em vez de recopiar é o que impede a quarta divergência.
//
// E os dois tons semânticos são, letra por letra, os da fonte única de status:
// `PRAZO_COLORS.danger` é o `text` da família `red` e `PRAZO_COLORS.warning` o
// da família `amber` em lib/status.ts. Um prazo vencido nesta coluna tem a
// mesma tinta que o selo de status da peça na coluna ao lado.
//
// A INFORMAÇÃO NÃO DEPENDE DE COR. Todo estado carrega a palavra
// ("atrasado", "hoje", "amanhã", "em Nd"): quem não distingue vermelho lê o
// estado no texto, e o `title`/`sr-only` trazem a frase por extenso com o nome
// do marco.
//
// CONTRASTES (calculados; piso AA de 4,5:1 para texto ≤13px). Os fundos são o
// branco da linha e o #fafaf9 do hover da tabela da Arte:
//   #b91c1c (atrasado) .. 6,47:1 sobre #ffffff · 6,19:1 sobre #fafaf9
//   #b45309 (vencendo) .. 5,02:1 sobre #ffffff · 4,81:1 sobre #fafaf9
//   #746e69 (com folga) . 5,03:1 sobre #ffffff · 4,81:1 sobre #fafaf9
//   #57534e (a data) .... 7,63:1 sobre #ffffff · 7,30:1 sobre #fafaf9
// Nenhuma cor proibida pela régua da casa (#f97316 / #a8a29e) entra aqui.
// ─────────────────────────────────────────────────────────────────────────────
import { PRAZO_COLORS, type PrazoTone } from "@/lib/painel-prazo";

/**
 * Cor da DATA. Ela é o fato (o marco), não o alarme: fica no cinza de conteúdo
 * do app — o mesmo #57534e que as colunas "Dimensões" e "Material" já usam —
 * para que a única cor semântica da célula seja a do estado.
 */
const COR_DATA = "#57534e";

/** Tamanho único do token. 11px é o degrau de metadado da tabela da Arte. */
const FONTE = 11;

/**
 * A partir de quantos dias um atraso deixa de ser de véspera. Três dias é o
 * mesmo degrau que a tela já usa do outro lado do zero (`diff <= 3` acende
 * âmbar): dentro de três dias o prazo ainda é recuperável no mesmo ciclo de
 * trabalho, fora deles o dano já está feito.
 */
export const PRAZO_ATRASO_GRAVE = 3;

/** Um pedaço do token, com o peso que a hierarquia lhe dá. */
export interface PartePrazo {
  texto: string;
  peso: number;
}

export interface LeituraPrazo {
  tone: PrazoTone;
  cor: string;
  /** Partes na ordem de leitura. O NÚMERO é sempre a parte mais pesada. */
  partes: PartePrazo[];
  /** O estado por extenso, para o `title` e o leitor de tela. */
  falado: string;
}

/**
 * Traduz os dias restantes de um marco (negativo = atrasado, 0 = vence hoje)
 * no token de leitura.
 *
 * É PURA e exportada de propósito: o vocabulário de prazo ("16d atrasado",
 * "hoje", "amanhã", "em 12d") já estava escrito à mão em três telas e cada
 * cópia abreviava de um jeito. Quem quiser o mesmo token na Gráfica ou no
 * Atendimento importa daqui em vez de reescrever.
 */
export function lerPrazo(diff: number | null | undefined): LeituraPrazo | null {
  if (diff == null || !Number.isFinite(diff)) return null;

  if (diff < 0) {
    const n = Math.abs(diff);
    const grave = n >= PRAZO_ATRASO_GRAVE;
    return {
      tone: "danger",
      cor: PRAZO_COLORS.danger,
      // O número carrega a magnitude; a palavra existe para quem não enxerga a
      // cor. Por isso é o número que ganha peso quando o atraso é grave — e não
      // uma segunda cor, que teria de ser mais clara e reprovaria AA.
      partes: [
        { texto: `${n}d`, peso: grave ? 800 : 700 },
        { texto: "atrasado", peso: grave ? 600 : 500 },
      ],
      falado: `atrasado há ${n} ${n === 1 ? "dia" : "dias"}`,
    };
  }

  if (diff === 0) {
    return {
      tone: "warning",
      cor: PRAZO_COLORS.warning,
      partes: [{ texto: "hoje", peso: 700 }],
      falado: "vence hoje",
    };
  }

  // "amanhã" em vez de "em 1d": é a palavra que se usa no telefone, e o dia
  // seguinte é o único degrau em que a diferença entre ler e agir é o turno.
  if (diff === 1) {
    return {
      tone: "warning",
      cor: PRAZO_COLORS.warning,
      partes: [{ texto: "amanhã", peso: 700 }],
      falado: "vence amanhã",
    };
  }

  if (diff <= PRAZO_ATRASO_GRAVE) {
    return {
      tone: "warning",
      cor: PRAZO_COLORS.warning,
      partes: [
        { texto: "em", peso: 500 },
        { texto: `${diff}d`, peso: 700 },
      ],
      falado: `vence em ${diff} dias`,
    };
  }

  return {
    tone: "neutral",
    cor: PRAZO_COLORS.neutral,
    partes: [
      { texto: "em", peso: 500 },
      { texto: `${diff}d`, peso: 600 },
    ],
    falado: `vence em ${diff} dias`,
  };
}

export interface PrazoInlineProps {
  /** Dias restantes do marco: negativo = atrasado, 0 = vence hoje. */
  diff: number | null | undefined;
  /** Data do marco. `null` quando o evento não tem saída marcada. */
  date: Date | null | undefined;
  /** Nome do marco ("Entrega de Layouts") — entra só na frase falada. */
  label?: string;
  /** `data-testid` do elemento raiz. */
  testId?: string;
}

/**
 * O prazo de uma peça em UMA linha: `29/07  16d atrasado`.
 *
 * PORQUÊ UMA LINHA. A versão empilhada (data em cima, atraso embaixo) somava
 * ~14px de altura em toda peça da fila sem acrescentar informação nenhuma — os
 * dois fragmentos são a mesma frase. Numa lista de 30 peças isso é uma tela
 * inteira de rolagem gasta em quebra de linha.
 *
 * PORQUÊ A DATA VEM PRIMEIRO. É a ordem de leitura que os outros selos de prazo
 * do app já usam (o chip da faixa do evento na Arte e o da Gráfica: marco ·
 * data · quanto falta). Como `dd/MM` tem largura fixa — `tabular-nums` garante
 * isso mesmo com dígitos diferentes —, o token de estado começa exatamente na
 * mesma coordenada em todas as linhas: dá para varrer a coluna pelos números
 * sem que a data atrapalhe.
 */
export function PrazoInline({ diff, date, label, testId }: PrazoInlineProps) {
  const l = date ? lerPrazo(diff) : null;

  // Sem saída marcada não há prazo a pintar — ausência não é um estado, é a
  // ausência do dado. Mesma decisão de `computeDeadlineChip`, que devolve null.
  if (!l || !date) {
    return (
      <span
        data-testid={testId}
        title="Este evento não tem data de saída marcada — não há prazo a calcular"
        style={{ fontSize: FONTE, fontWeight: 600, color: PRAZO_COLORS.neutral }}
      >
        <span aria-hidden="true">—</span>
        <span className="sr-only">Sem prazo: o evento não tem data de saída marcada</span>
      </span>
    );
  }

  const curta = date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  const frase = `${label ? `${label}: ` : ""}${date.toLocaleDateString("pt-BR")} — ${l.falado}`;

  return (
    // `display: block` + nowrap + reticências: rede para o atraso de três
    // dígitos, que é justamente a peça que não pode sumir da lista. O texto
    // completo continua no `title` e no `sr-only`.
    <span
      data-testid={testId}
      style={{
        display: "block", maxWidth: "100%", lineHeight: 1.35,
        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
      }}
    >
      {/* Todo o visual dentro de UM invólucro aria-hidden, com o `title` nele:
          sem isso o leitor de tela anuncia o token curto e a frase do sr-only,
          duas vezes por linha. Mesmo arranjo do StageCell da Gestão de Prazos. */}
      <span aria-hidden="true" title={frase}>
        <span
          style={{
            fontSize: FONTE, fontWeight: 600, color: COR_DATA,
            fontVariantNumeric: "tabular-nums", marginRight: 6,
          }}
        >
          {curta}
        </span>
        <span style={{ fontSize: FONTE, color: l.cor, fontVariantNumeric: "tabular-nums" }}>
          {l.partes.map((p, i) => (
            <span key={p.texto} style={{ fontWeight: p.peso, marginLeft: i ? 3 : 0 }}>
              {p.texto}
            </span>
          ))}
        </span>
      </span>
      <span className="sr-only">{frase}</span>
    </span>
  );
}
