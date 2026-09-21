// ─────────────────────────────────────────────────────────────────────────────
// O DETALHE DA PRODUÇÃO, EM UMA FRASE CURTA — para o RESTO do fluxo.
//
// PORQUÊ EXISTE (dono, 21/09): "vai ser importante mostrar esses novos status
// — em impressão, em acabamento etc. — para o restante do fluxo, não só na
// Gráfica". O selo já diz a ETAPA ("Em Impressão"); esta frase diz o que o
// Atendimento e a Solicitação perguntam logo depois: em qual impressora, quantas
// já saíram, em que tubo está, quem recebeu. Sempre texto secundário (12px),
// nunca um segundo selo.
//
// DUPLICAÇÃO CONHECIDA: a Gráfica tem a mesma regra dentro de
// client/src/pages/grafica.tsx (ProgressoImpressao, SeloFilaDaImpressora e o
// número do tubo) e em components/grafica/modal-impressao.tsx
// (progressoDaImpressao). Não foi reaproveitada de lá porque aqueles arquivos
// estavam em edição por outra frente no mesmo dia; quando assentarem, a
// Gráfica deve passar a ler DESTE módulo e a cópia de lá sai.
//
// Puro de propósito: nada de React, nada de fetch. O tubo chega NA PEÇA
// (`tuboNumero`, `tuboFechadoEm`… — acrescentados por
// enrichItemsWithEventsAndSponsors no servidor), porque GET /api/tubos é 403
// para Atendimento e Arte.
// ─────────────────────────────────────────────────────────────────────────────
import { rotuloDaMaquina } from "@shared/fluxo-peca";
import { aImprimirDaPeca, estaDividida, partesDaPeca } from "@shared/impressao-dividida";
import { lerReserva, resumoDaReserva } from "@shared/reserva-de-impressora";
import { PRODUCTION_STATUSES, getStatusMeta } from "@/lib/status";

/** O mínimo da peça que a frase lê. Tudo opcional: peça antiga não tem metade. */
export type PecaComProducao = {
  status?: string | null;
  quantity?: number | string | null;
  reuseQty?: number | string | null;
  isReuse?: boolean | null;
  quantityProduced?: number | string | null;
  conferredQty?: number | string | null;
  printMachine?: string | null;
  impressaoPorMaquina?: unknown;
  maquinaPrevista?: string | null;
  reservaPorMaquina?: unknown;
  tuboId?: string | null;
  tuboNumero?: number | string | null;
  tuboFechadoEm?: string | Date | null;
  tuboEntregueEm?: string | Date | null;
  tuboRecebidoPor?: string | null;
  receivedBy?: string | null;
};

const inteiro = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
};

// As grafias legadas em português ainda circulam no banco (ver lib/status.ts).
const LIBERADA = new Set(["ready_for_production", "pronto_para_producao", "approved", "liberado"]);
const EM_IMPRESSAO = new Set(["inProduction", "em_producao"]);
const IMPRESSA = new Set(["produced", "produzido"]);
const CONFERIDA = new Set(["conferred", "conferido"]);
const ENTREGUE = new Set(["delivered", "entregue"]);

/** "14:32" no fuso do negócio — o servidor grava UTC e a tela é de São Paulo. */
function horaDe(v: string | Date | null | undefined): string | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
}

/** "Tubo 2" — ou só "Em tubo" quando a peça tem tubo mas o número não veio. */
export function rotuloDoTubo(item: PecaComProducao | null | undefined): string | null {
  if (!item) return null;
  const numero = inteiro(item.tuboNumero);
  if (numero > 0) return `Tubo ${numero}`;
  return item.tuboId ? "Em tubo" : null;
}

/**
 * A frase curta da etapa de produção da peça, ou `null` quando não há nada a
 * acrescentar ao selo (peça fora da produção, ou liberada sem reserva).
 */
export function detalheDaProducao(item: PecaComProducao | null | undefined): string | null {
  if (!item || !item.status) return null;
  const status = item.status;

  if (LIBERADA.has(status)) {
    // Reserva dividida: "Fila: Impressora 1 (20) · Impressora 2 (14)".
    const reserva = lerReserva(item.reservaPorMaquina);
    if (reserva && Object.keys(reserva).length > 1) return `Fila: ${resumoDaReserva(reserva)}`;
    const maquina = item.maquinaPrevista || (reserva ? Object.keys(reserva)[0] : null);
    return maquina ? `Fila: ${rotuloDaMaquina(maquina)}` : null;
  }

  if (EM_IMPRESSAO.has(status)) {
    if (estaDividida(item)) {
      return Object.entries(partesDaPeca(item))
        .map(([m, parte]) => `${rotuloDaMaquina(m)} · ${parte.impressas} de ${parte.atrib}`)
        .join(" · ");
    }
    const teto = aImprimirDaPeca(item);
    const feitas = Math.min(inteiro(item.quantityProduced), teto || Infinity);
    const progresso = teto > 0 ? `${feitas} de ${teto} impressa${teto === 1 ? "" : "s"}` : null;
    // Peça antiga entrou em impressão antes de existir a escolha da máquina.
    const maquina = item.printMachine ? rotuloDaMaquina(item.printMachine) : null;
    return [maquina, progresso].filter(Boolean).join(" · ") || null;
  }

  if (IMPRESSA.has(status)) {
    const total = inteiro(item.quantity);
    const conferidas = inteiro(item.conferredQty);
    if (conferidas > 0 && conferidas < total) return `${conferidas} de ${total} conferidas`;
    return "Aguardando conferência";
  }

  if (CONFERIDA.has(status)) return "Aguardando embalagem ou entrega";

  if (status === "packed") {
    const tubo = rotuloDoTubo(item);
    if (!tubo) return "Aguardando entrega";
    const hora = horaDe(item.tuboFechadoEm);
    return hora ? `${tubo} · fechado ${hora}` : tubo;
  }

  if (ENTREGUE.has(status)) {
    const quem = (item.tuboRecebidoPor || item.receivedBy || "").trim();
    const tubo = inteiro(item.tuboNumero) > 0 ? `Tubo ${inteiro(item.tuboNumero)}` : null;
    if (quem) return tubo ? `Recebida por ${quem} · ${tubo}` : `Recebida por ${quem}`;
    return tubo;
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// A SUB-TRILHA DA PRODUÇÃO — para a ficha da peça.
//
// A barra do topo da ficha tem UMA etapa "Produção": de `produced` em diante
// ela aparecia toda completa, igual à peça entregue. Aqui a etapa se abre em
// Liberada → Em Impressão → Impresso → Conferido → Embalado → Entregue, a
// partir de PRODUCTION_STATUSES (lib/status), com o rótulo e a cor do selo.
// ─────────────────────────────────────────────────────────────────────────────

export type EstadoDoPasso = "feita" | "atual" | "pendente" | "nao_se_aplica";
export type PassoDaProducao = { key: string; label: string; cor: string; estado: EstadoDoPasso };

// Grafias legadas → o status canônico do passo.
const CANONICO: Record<string, string> = {
  pronto_para_producao: "ready_for_production", approved: "ready_for_production", liberado: "ready_for_production",
  em_producao: "inProduction", produzido: "produced", conferido: "conferred", entregue: "delivered",
};

/** Os passos da produção desta peça, ou `null` se ela ainda não chegou lá. */
export function subTrilhaDaProducao(item: { status?: string | null; tuboId?: string | null } | null | undefined): PassoDaProducao[] | null {
  const bruto = item?.status ?? "";
  const status = CANONICO[bruto] ?? bruto;
  const ordem: string[] = ["ready_for_production", ...PRODUCTION_STATUSES];
  const atual = ordem.indexOf(status);
  if (atual < 0) return null;
  return ordem.map((key, i) => {
    const meta = getStatusMeta(key);
    // "Liberada" e não "Pronto Prod.": é o nome que o dono usa para o passo.
    const label = key === "ready_for_production" ? "Liberada" : meta.short;
    // Entregue SEM tubo (peça grande vai direto): Embalado não é pendência nem
    // etapa cumprida — não se aplica.
    const semTubo = key === "packed" && i < atual && !item?.tuboId;
    const estado: EstadoDoPasso = semTubo ? "nao_se_aplica" : i < atual ? "feita" : i === atual ? "atual" : "pendente";
    return { key, label, cor: meta.dot, estado };
  });
}
