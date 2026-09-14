// ─────────────────────────────────────────────────────────────────────────────
// ESTOQUE — o que é "peça parecida" e "dá para usar" (dono, 14/09).
//
// "Ao criar um item parecido — mesmo layout, mesmo patrocinador — quem cria o
// item vai buscar no estoque, mas temos que levar muita coisa em conta: onde
// está a peça, se está em trânsito e tudo mais." As decisões do dono:
//   · parecida = MESMO TIPO + MESMA MEDIDA. O patrocinador ORDENA: igual vem
//     primeiro, peça sem patrocinador aparece como genérica, patrocinador
//     diferente não aparece;
//   · peça em uso noutro evento que volta antes da saída do caminhão PODE ser
//     reservada, com aviso;
//   · triagem e local no galpão são da Gráfica.
//
// Por que a arte não entra na comparação: medido em produção (14/09), cada
// peça ganha um upload novo — só 39 de 4.428 artes se repetem. Tipo + medida +
// patrocinador acharia a origem de 554 dos 1.090 reaproveitamentos já feitos;
// só tipo + medida, de 800. A arte vai para a tela, lado a lado, para o olho
// humano confirmar o layout.
//
// Tudo aqui é PURO (sem banco): o servidor decide com estas funções e a tela
// explica com as mesmas palavras.
// ─────────────────────────────────────────────────────────────────────────────

/** Onde a peça física está no ciclo. EM_MANUTENCAO é nova (14/09): antes a
 *  "manutenção" da triagem gravava NO_GALPAO e a peça avariada seguia
 *  aparecendo como disponível. */
export const SITUACOES_DO_ATIVO = ["NO_GALPAO", "EM_USO", "AGUARDANDO_TRIAGEM", "EM_MANUTENCAO", "DESCARTADO"] as const;
export type SituacaoDoAtivo = (typeof SITUACOES_DO_ATIVO)[number];

/** O que dá para escolher à mão. EM_USO e AGUARDANDO_TRIAGEM são do ciclo do
 *  evento (saída do caminhão / dia seguinte ao evento). */
export const SITUACOES_MANUAIS = ["NO_GALPAO", "EM_MANUTENCAO", "DESCARTADO"] as const;

// ─── Semelhança ──────────────────────────────────────────────────────────────

/** "PLACAS KM", "Placa km" e "placa  km" são o mesmo tipo; "STANDS" e "STAND"
 *  também. Sem acento, sem caixa, espaços únicos e plural simples por palavra
 *  (só palavras com mais de 3 letras, para "2x1s" não virar "2x1" por acaso e
 *  "km" ficar como está). */
export function normalizarTipo(tipo: string | null | undefined): string {
  return String(tipo ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((p) => (p.length > 3 && p.endsWith("s") ? p.slice(0, -1) : p))
    .join(" ");
}

const medidaEmMetros = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Um centímetro de folga: o banco guarda decimal(10,2) e a digitação varia
 *  ("2" × "2.00"). */
export const TOLERANCIA_DE_MEDIDA = 0.01;

/** Mesma largura e mesma altura da área visual. Sem girar: um 2×1 deitado e
 *  um 1×2 em pé têm layouts diferentes. Sem medida dos dois lados, não casa. */
export function mesmaMedida(
  a: { largura: unknown; altura: unknown },
  b: { largura: unknown; altura: unknown },
): boolean {
  const aw = medidaEmMetros(a.largura), ah = medidaEmMetros(a.altura);
  const bw = medidaEmMetros(b.largura), bh = medidaEmMetros(b.altura);
  if (aw == null || ah == null || bw == null || bh == null) return false;
  const perto = (x: number, y: number) => Math.abs(x - y) <= TOLERANCIA_DE_MEDIDA + 1e-9;
  return perto(aw, bw) && perto(ah, bh);
}

export function temMedida(p: { largura: unknown; altura: unknown }): boolean {
  return medidaEmMetros(p.largura) != null && medidaEmMetros(p.altura) != null;
}

/**
 *   · identica  — os mesmos patrocinadores impressos;
 *   · generica  — a peça do estoque não tem patrocinador;
 *   · a_definir — a peça nova ainda não tem patrocinador vinculado (comum na
 *                 criação: o vínculo vem depois), então ninguém é descartado;
 *   · diferente — patrocinadores diferentes: não aparece.
 */
export type RelacaoDePatrocinio = "identica" | "generica" | "a_definir" | "diferente";

export function relacaoDePatrocinio(daPeca: readonly string[], doAtivo: readonly string[]): RelacaoDePatrocinio {
  const p = new Set(daPeca.filter(Boolean));
  const a = new Set(doAtivo.filter(Boolean));
  if (a.size === 0) return "generica";
  if (p.size === 0) return "a_definir";
  if (p.size === a.size && Array.from(p).every((x) => a.has(x))) return "identica";
  return "diferente";
}

export const ROTULO_DA_RELACAO: Record<RelacaoDePatrocinio, string> = {
  identica: "Mesmo patrocinador",
  generica: "Sem patrocinador",
  a_definir: "Patrocinador a conferir",
  diferente: "Outro patrocinador",
};

// ─── Tempo do evento ─────────────────────────────────────────────────────────

/** O evento "acaba" à meia-noite do dia seguinte ao início — a mesma régua do
 *  cron do ciclo, que manda as peças para a triagem nesse instante. */
export function fimDoEvento(inicio: Date | string | null | undefined): Date | null {
  if (!inicio) return null;
  const d = new Date(inicio);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + 1);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export function eventoJaAcabou(inicio: Date | string | null | undefined, agora: Date): boolean {
  const fim = fimDoEvento(inicio);
  return !!fim && agora.getTime() >= fim.getTime();
}

/** Reserva vale enquanto o evento para o qual a peça foi reservada não acabou.
 *  Depois disso a linha fica como histórico de onde a peça andou. */
export function reservaEstaAtiva(inicioDoEventoReservado: Date | string | null | undefined, agora: Date): boolean {
  return !eventoJaAcabou(inicioDoEventoReservado, agora);
}

export const diaEMes = (d: Date | string): string =>
  new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });

// ─── Disponibilidade ─────────────────────────────────────────────────────────

export type Disponibilidade = "disponivel" | "chega_a_tempo" | "falta_triagem" | "indisponivel";

export const ROTULO_DA_DISPONIBILIDADE: Record<Disponibilidade, string> = {
  disponivel: "No galpão, livre",
  chega_a_tempo: "Em uso — volta a tempo",
  falta_triagem: "Voltou, falta triagem",
  indisponivel: "Não dá para usar",
};

export interface EntradaDeDisponibilidade {
  situacao: string;
  condicao: string;
  /** O evento para o qual a peça foi impressa. */
  origem: { eventId: string | null; inicio: Date | string | null };
  /** A reserva ATIVA da peça, se houver (use reservaEstaAtiva antes). */
  reserva: { itemId: string | null; eventId: string; eventName: string } | null;
  /** A peça nova que está buscando no estoque. */
  destino: { itemId: string; eventId: string; saida: Date | string | null; inicio: Date | string | null };
  agora: Date;
}

export interface ResultadoDeDisponibilidade {
  disponibilidade: Disponibilidade;
  /** Uma frase: por que está nesta situação. */
  motivo: string;
  /** O que precisa acontecer para dar certo (reservável com cuidado). */
  aviso: string | null;
  /** Já está reservada para esta mesma peça. */
  reservadaAqui: boolean;
  voltaEm: Date | null;
}

const nao = (motivo: string): ResultadoDeDisponibilidade =>
  ({ disponibilidade: "indisponivel", motivo, aviso: null, reservadaAqui: false, voltaEm: null });

export function classificarDisponibilidade(e: EntradaDeDisponibilidade): ResultadoDeDisponibilidade {
  if (e.reserva && e.reserva.itemId === e.destino.itemId) {
    return { disponibilidade: "indisponivel", motivo: "Reservada para esta peça", aviso: null, reservadaAqui: true, voltaEm: null };
  }
  if (e.situacao === "DESCARTADO") return nao("Descartada");
  if (e.condicao === "SUCATA") return nao("Sucata");
  if (e.reserva) return nao(`Reservada para ${e.reserva.eventName}`);
  if (e.situacao === "EM_MANUTENCAO") return nao("Em manutenção");
  if (e.origem.eventId && e.origem.eventId === e.destino.eventId) return nao("Foi impressa para este mesmo evento");

  const limite = e.destino.saida ?? e.destino.inicio;
  if (limite && e.agora.getTime() >= new Date(limite).getTime()) {
    return nao("O caminhão deste evento já saiu");
  }

  if (e.situacao === "NO_GALPAO") {
    // Impressa para um evento que ainda não aconteceu: está no galpão, mas
    // já tem dono. Era o furo das 545 peças "No galpão" de 14/09.
    if (!eventoJaAcabou(e.origem.inicio, e.agora)) return nao("Separada para o evento de origem, que ainda não aconteceu");
    return { disponibilidade: "disponivel", motivo: "No galpão, sem reserva", aviso: null, reservadaAqui: false, voltaEm: null };
  }

  if (e.situacao === "EM_USO") {
    const voltaEm = fimDoEvento(e.origem.inicio);
    if (!voltaEm) return nao("Em uso, sem data de volta");
    if (!limite) {
      return {
        disponibilidade: "chega_a_tempo", motivo: `Em uso — volta ${diaEMes(voltaEm)}`, reservadaAqui: false, voltaEm,
        aviso: "Este evento não tem data de saída do caminhão: confira se a peça volta a tempo.",
      };
    }
    if (voltaEm.getTime() < new Date(limite).getTime()) {
      return {
        disponibilidade: "chega_a_tempo", motivo: `Em uso — volta ${diaEMes(voltaEm)}`, reservadaAqui: false, voltaEm,
        aviso: `Volta ${diaEMes(voltaEm)} e precisa passar pela triagem da Gráfica antes da saída do caminhão (${diaEMes(limite)}).`,
      };
    }
    return { ...nao(`Em uso — só volta ${diaEMes(voltaEm)}, depois da saída do caminhão (${diaEMes(limite)})`), voltaEm };
  }

  if (e.situacao === "AGUARDANDO_TRIAGEM") {
    return {
      disponibilidade: "falta_triagem", motivo: "Voltou do evento e ainda não passou pela triagem", reservadaAqui: false, voltaEm: null,
      aviso: "A Gráfica precisa conferir o estado da peça e guardá-la antes da saída do caminhão.",
    };
  }

  return nao("Situação desconhecida");
}

export const podeReservar = (d: Disponibilidade): boolean =>
  d === "disponivel" || d === "chega_a_tempo" || d === "falta_triagem";

// ─── Ordem de exibição ───────────────────────────────────────────────────────

const PESO_DA_DISPONIBILIDADE: Record<Disponibilidade, number> = { disponivel: 0, chega_a_tempo: 1, falta_triagem: 2, indisponivel: 3 };
const PESO_DA_RELACAO: Record<RelacaoDePatrocinio, number> = { identica: 0, generica: 1, a_definir: 2, diferente: 3 };
const PESO_DA_CONDICAO: Record<string, number> = { PERFEITO: 0, AVARIA_LEVE: 1, SUCATA: 2 };

/** Primeiro o que está livre no galpão, depois o que volta a tempo, depois o
 *  que falta triar. Dentro de cada grupo: mesmo patrocinador antes de
 *  genérica, e peça perfeita antes de avariada. */
export function compararLotes(
  a: { disponibilidade: Disponibilidade; relacao: RelacaoDePatrocinio; condicao: string; quantidade: number },
  b: { disponibilidade: Disponibilidade; relacao: RelacaoDePatrocinio; condicao: string; quantidade: number },
): number {
  return (PESO_DA_DISPONIBILIDADE[a.disponibilidade] - PESO_DA_DISPONIBILIDADE[b.disponibilidade])
    || (PESO_DA_RELACAO[a.relacao] - PESO_DA_RELACAO[b.relacao])
    || ((PESO_DA_CONDICAO[a.condicao] ?? 9) - (PESO_DA_CONDICAO[b.condicao] ?? 9))
    || (b.quantidade - a.quantidade);
}
