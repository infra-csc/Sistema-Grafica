// Capacidade × Demanda por semana. Regra pura, sem React e sem I/O.
//
// PORQUÊ ESTE BLOCO EXISTE — é a única pergunta do app que nenhuma tela
// responde. Painel Geral responde "onde está a peça agora"; Gestão de Prazos
// responde "o que venceu e o que vence nos próximos dias" e EXCLUI de propósito
// os eventos já concluídos. Ninguém responde "a gráfica vai dar conta do que
// vem?", que é a pergunta que decide turno extra, contratação e aceite de novo
// evento.
//
// O eixo é m², não peças: m² é a grandeza de custo e de máquina. Duas peças
// podem ser 0,5 m² ou 80 m² — contar peças esconde exatamente o pico que este
// bloco existe para antecipar.
import {
  businessDayMs, DAY_MS, instantDayMs, m2Of, qtyOf,
} from "./analises-metrics";
import type { AnaliseItem } from "./analises-metrics";
import { isOutOfFunnel } from "./analises-status";

/** Segunda-feira da semana de um dia-calendário (UTC-meia-noite). */
export function weekStartMs(dayMs: number): number {
  // getUTCDay(): 0=domingo … 6=sábado. A semana da casa começa na segunda
  // porque a saída do caminhão e o turno da gráfica são de semana útil.
  const offset = (new Date(dayMs).getUTCDay() + 6) % 7;
  return dayMs - offset * DAY_MS;
}

/** As semanas de `atras` para trás até `frente` para a frente, da mais antiga. */
export function weekKeysAround(hojeDiaMs: number, atras: number, frente: number): number[] {
  const atual = weekStartMs(hojeDiaMs);
  const keys: number[] = [];
  for (let i = -atras; i <= frente; i++) keys.push(atual + i * 7 * DAY_MS);
  return keys;
}

export interface SemanaCarga {
  /** Segunda-feira da semana, em ms UTC-meia-noite. */
  inicioMs: number;
  /** m² que VENCEM nesta semana (saída do caminhão do evento da peça). */
  demandaM2: number;
  demandaPecas: number;
  /** m² com produção registrada nesta semana. `null` em semana futura. */
  concluidoM2: number | null;
  concluidoPecas: number | null;
  passada: boolean;
  atual: boolean;
}

export interface Capacidade {
  semanas: SemanaCarga[];
  /**
   * Média semanal de m² concluídos nas semanas PASSADAS COMPLETAS da janela.
   * É a régua "o que a casa costuma dar conta de fazer". `null` sem amostra.
   */
  mediaConcluidoM2: number | null;
  semanasNaMedia: number;
  /** Peças fora da janela ou com saída do caminhão inválida: declaradas. */
  demandaForaDaJanela: number;
  demandaSemData: number;
  /** Peças com produção registrada sem m² de arquivo: não somam m². */
  semMedida: number;
}

/**
 * Data em que a peça FICOU PRONTA na gráfica.
 *
 * `producedAt` primeiro de propósito: é o instante em que a máquina terminou,
 * que é o que mede capacidade. `conferredAt`/`deliveredAt` entram como reserva
 * para as peças cujo carimbo de produção não existe (fluxo antigo e peças que
 * pularam etapas) — sem a reserva, a série de realizado ficaria artificialmente
 * baixa e o diretor leria uma capacidade menor do que a real.
 */
export function conclusaoDiaMs(i: AnaliseItem): number | null {
  return instantDayMs(i.producedAt) ?? instantDayMs(i.conferredAt) ?? instantDayMs(i.deliveredAt);
}

/**
 * Demanda (m² que vencem) contra realizado (m² produzidos), por semana.
 *
 * A janela é FIXA — 12 semanas para trás e 8 para a frente — e por isso NÃO
 * segue o filtro de período da tela: um bloco de planejamento que encolhe
 * quando o usuário escolhe "saídas dos últimos 7 dias" deixaria de mostrar
 * justamente o pico que está chegando. Os filtros de evento e patrocinador,
 * esses sim, valem aqui (é o mesmo recorte de "quem" da tela toda). A tela
 * carimba esse escopo em texto — sem carimbo, o bloco parece contradizer o
 * filtro logo acima dele.
 */
export function computeCapacidade(args: {
  items: AnaliseItem[];
  cycleDayByEvent: Map<string, number | null>;
  /**
   * "Agora" cru (`Date.now()`). A normalização para dia-calendário do negócio
   * acontece AQUI DENTRO de propósito: receber um dia já normalizado convidava
   * o chamador a passar `Date.now()` por engano, e um âncora fora da
   * meia-noite desalinha todas as chaves de semana — o gráfico inteiro sai
   * vazio sem nenhum erro.
   */
  nowMs: number;
  atras?: number;
  frente?: number;
}): Capacidade {
  const { items, cycleDayByEvent, nowMs, atras = 12, frente = 8 } = args;
  const hojeDiaMs = businessDayMs(nowMs);
  const keys = weekKeysAround(hojeDiaMs, atras, frente);
  const semanaAtual = weekStartMs(hojeDiaMs);
  const primeira = keys[0];
  const ultima = keys[keys.length - 1];

  const porSemana = new Map<number, SemanaCarga>();
  for (const k of keys) {
    const futura = k > semanaAtual;
    porSemana.set(k, {
      inicioMs: k,
      demandaM2: 0, demandaPecas: 0,
      // Semana futura não tem realizado — e `null` não é 0: uma barra zerada
      // à direita de "hoje" seria lida como "a gráfica parou".
      concluidoM2: futura ? null : 0,
      concluidoPecas: futura ? null : 0,
      passada: k < semanaAtual,
      atual: k === semanaAtual,
    });
  }

  let demandaForaDaJanela = 0;
  let demandaSemData = 0;
  let semMedida = 0;

  for (const i of items) {
    if (isOutOfFunnel(i.status)) continue;
    const q = qtyOf(i);
    const m2 = m2Of(i);

    const saidaDia = cycleDayByEvent.get(i.eventId) ?? null;
    if (saidaDia == null) {
      demandaSemData += q;
    } else {
      const semana = weekStartMs(saidaDia);
      if (semana < primeira || semana > ultima) demandaForaDaJanela += q;
      else {
        const alvo = porSemana.get(semana)!;
        alvo.demandaPecas += q;
        alvo.demandaM2 += m2 ?? 0;
      }
    }

    const prontoDia = conclusaoDiaMs(i);
    if (prontoDia == null) continue;
    if (m2 == null) semMedida += q;
    const semanaPronto = weekStartMs(prontoDia);
    const alvo = porSemana.get(semanaPronto);
    // `concluidoM2 == null` = semana futura com carimbo de produção adiantado
    // (existe: peça produzida antes da semana do evento). Não há barra de
    // realizado no futuro, então o dado seria invisível — some ao realizado da
    // semana atual, que é onde a máquina de fato trabalhou.
    if (!alvo) continue;
    const destino = alvo.concluidoM2 == null ? porSemana.get(semanaAtual)! : alvo;
    destino.concluidoM2 = (destino.concluidoM2 ?? 0) + (m2 ?? 0);
    destino.concluidoPecas = (destino.concluidoPecas ?? 0) + q;
  }

  const semanas = keys.map((k) => porSemana.get(k)!);
  // A semana ATUAL fica fora da média: ela está pela metade e puxaria a régua
  // para baixo só por ser terça-feira.
  const completas = semanas.filter((s) => s.passada && s.concluidoM2 != null);
  const mediaConcluidoM2 = completas.length > 0
    ? completas.reduce((soma, s) => soma + (s.concluidoM2 ?? 0), 0) / completas.length
    : null;

  return {
    semanas,
    mediaConcluidoM2,
    semanasNaMedia: completas.length,
    demandaForaDaJanela,
    demandaSemData,
    semMedida,
  };
}

/** "12/05" — rótulo curto do eixo; a semana é identificada pela segunda-feira. */
export function rotuloSemana(inicioMs: number): string {
  const d = new Date(inicioMs);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}`;
}
