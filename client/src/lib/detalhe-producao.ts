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
// FONTE ÚNICA (21/09, "Máquinas e Gráfica têm que se conversar"): a conta do
// progresso (feitas, teto, partes) e o selo da fila vêm de
// shared/progresso-da-impressao.ts — os mesmos números da linha da Gráfica, do
// cartão de Máquinas e do modal. Aqui só a FORMA curta da frase (sem o
// "· 7 na impressora", que é detalhe de quem está no galpão).
//
// Puro de propósito: nada de React, nada de fetch. O tubo chega NA PEÇA
// (`tuboNumero`, `tuboFechadoEm`… — acrescentados por
// enrichItemsWithEventsAndSponsors no servidor), porque GET /api/tubos é 403
// para Atendimento e Arte.
// ─────────────────────────────────────────────────────────────────────────────
import { rotuloDaMaquina } from "@shared/fluxo-peca";
import { moldeConcluido } from "@shared/molde";
import { progressoDaEmbalagem, seloDosVolumes } from "@shared/embalagem";
import { numerosDaImpressao, fraseDaFila } from "@shared/progresso-da-impressao";
import { PRODUCTION_STATUSES, getStatusMeta } from "@/lib/status";

/** O mínimo da peça que a frase lê. Tudo opcional: peça antiga não tem metade. */
export type PecaComProducao = {
  status?: string | null;
  /** O tipo: o MOLDE produzido terminou o fluxo dele (não espera conferência). */
  type?: string | null;
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
  /** Embalada sozinha (volume avulso): nunca se diz "Tubo N". */
  tuboAvulso?: boolean | null;
  /** EMBALAGEM COM QUANTIDADE (21/09): total já embalado e os volumes ABERTOS
   *  da peça com a quantidade em cada um — viajam na peça, como o número. */
  embaladaQty?: number | string | null;
  /** A entrega parcial ANTIGA (sem volume) aparece como "7 de 10 entregues". */
  deliveredQty?: number | string | null;
  tuboVolumes?: Array<{ tuboId: string; numero: number; avulso?: boolean | null; quantidade: number }> | null;
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

/** "Tubo 1 (7) · Tubo 2 (3)" / "Embalada (10)" — os volumes abertos, com a quantidade de cada um. */
export function volumesDaPeca(item: PecaComProducao | null | undefined): string | null {
  const volumes = item?.tuboVolumes ?? [];
  if (!volumes.length) return null;
  return seloDosVolumes(volumes.map((v) => ({ tuboId: v.tuboId, numero: v.numero, avulso: v.avulso, quantidade: v.quantidade })));
}

/** "Tubo 2" — ou só "Em tubo" quando a peça tem tubo mas o número não veio. */
export function rotuloDoTubo(item: PecaComProducao | null | undefined): string | null {
  if (!item) return null;
  if (item.tuboAvulso) return "Embalada sozinha";
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
  // MOLDE PRODUZIDO (revisão de 22/09): o fluxo dele termina no Produzido —
  // "Aguardando conferência" mentia em 5 telas. O selo já diz "Produzido (molde)".
  if (moldeConcluido(item)) return null;
  const status = item.status;

  if (LIBERADA.has(status)) {
    // "Fila: Impressora 2", "Fila: Impressora 1 (20) · Impressora 2 (14)",
    // "Pausada · Fila: …" — o mesmo selo da linha da Gráfica.
    return fraseDaFila(item as any);
  }

  if (EM_IMPRESSAO.has(status)) {
    const n = numerosDaImpressao(item as any);
    if (n.dividida) {
      return Object.entries(n.partes)
        .map(([m, parte]) => `${rotuloDaMaquina(m)} · ${parte.impressas} de ${parte.atrib}`)
        .join(" · ");
    }
    const teto = n.teto;
    const feitas = n.feitas;
    const progresso = teto > 0 ? `${feitas} de ${teto} impressa${teto === 1 ? "" : "s"}` : null;
    // Peça antiga entrou em impressão antes de existir a escolha da máquina.
    const maquina = item.printMachine ? rotuloDaMaquina(item.printMachine) : null;
    return [maquina, progresso].filter(Boolean).join(" · ") || null;
  }

  // Parte já embalada (a parcial, ou a que foi dividida no tempo): o progresso
  // e onde está — "7 de 10 embaladas · Tubo 1 (7)". A entrega parcial ANTIGA
  // (sem volume) diz "7 de 10 entregues" — nunca "embaladas".
  const parcial = progressoDaEmbalagem(item as any);
  if (parcial && !ENTREGUE.has(status) && status !== "packed") return [parcial, volumesDaPeca(item)].filter(Boolean).join(" · ");

  if (IMPRESSA.has(status)) {
    const total = inteiro(item.quantity);
    const conferidas = inteiro(item.conferredQty);
    if (conferidas > 0 && conferidas < total) return `${conferidas} de ${total} conferidas`;
    return "Aguardando conferência";
  }

  if (CONFERIDA.has(status)) return "Aguardando embalagem";

  if (status === "packed") {
    // Dividida entre volumes: "Tubo 1 (7) · Tubo 2 (3)".
    if ((item.tuboVolumes?.length ?? 0) > 1) return volumesDaPeca(item);
    const tubo = rotuloDoTubo(item);
    if (!tubo) return "Aguardando entrega";
    const hora = horaDe(item.tuboFechadoEm);
    return hora ? `${tubo} · ${item.tuboAvulso ? "foto" : "fechado"} ${hora}` : tubo;
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
