// ─────────────────────────────────────────────────────────────────────────────
// MÁQUINAS DA GRÁFICA — as regras puras da tela (sem React).
//
// Nenhuma regra de negócio mora aqui: os endpoints, as permissões e o bloqueio
// de evento finalizado são os de items.ts; aqui só a leitura do retrato (datas,
// frases, ordem da fila, o que bloqueia o gesto na tela).
// ─────────────────────────────────────────────────────────────────────────────
import { MAQUINAS_DE_IMPRESSAO, rotuloDaMaquina } from "@shared/fluxo-peca";
import { pecaTravada, fraseDaTrava, seloDaTrava } from "@shared/trava-da-peca";
import { perguntaDaTroca } from "@shared/progresso-da-impressao";
import { TOM } from "@/lib/theme";
import { seloPecaEventoFinalizado, motivoAcaoBloqueada } from "@/lib/status";
import { convertGCSUrlToLocalPath } from "@/lib/artePdfExport";
import type { PecaParaImprimir } from "@/components/grafica/modal-impressao";
import { VINHO_DA_TRAVA } from "./constantes";
import type { EventoInfo, OcupacaoDasImpressoras, PecaNaFila, PecaNaMaquina, Periodo, Registro, SeloDeBloqueio } from "./tipos";

/**
 * O que BLOQUEIA o gesto de fazer a peça andar aqui: o evento finalizado (como
 * sempre) ou a TRAVA DA SOLICITAÇÃO — a mesma regra da Gráfica
 * (`pecaTravada`, shared/trava-da-peca.ts). Tirar da impressora não passa por
 * aqui: recuar nunca é bloqueado.
 */
export function seloDaPecaNaMaquina(p: { eventoInfo: EventoInfo | null; travadaEm?: string | null; travadaPor?: string | null; travadaMotivo?: string | null }, hojeMs: number): SeloDeBloqueio | null {
  if (pecaTravada(p)) {
    return { motivo: "travada", label: seloDaTrava(p) ?? "Travada", hint: "a Gráfica só segue depois que a Solicitação destravar", bg: TOM.perigo.bg, border: TOM.perigo.border, text: VINHO_DA_TRAVA, dot: VINHO_DA_TRAVA };
  }
  return seloPecaEventoFinalizado(p.eventoInfo, hojeMs);
}
export const motivoBloqueio = (selo: SeloDeBloqueio, acao: string, p?: { travadaMotivo?: string | null; travadaPor?: string | null; travadaEm?: string | null }): string =>
  selo.motivo === "travada" ? `Não dá para ${acao}: ${p ? fraseDaTrava(p) : selo.label}` : motivoAcaoBloqueada(selo.motivo, acao);

/**
 * Servidor ainda na versão anterior (Pull sem Stop/Run no Replit): a rota
 * nova não existe e o catch-all do SPA devolve o index.html com 200. O
 * queryFn já converte isso num erro com frase própria; aqui a tela reconhece
 * esse erro (e o JSON inválido que vazaria se a guarda falhasse) para dizer
 * o conserto certo em vez de "confira a conexão".
 */
export function ehServidorNaVersaoAnterior(error: unknown): boolean {
  const msg = String(mensagemDoErro(error) ?? error ?? "");
  return /acabou de ser atualizado|<!doctype|<html|Unexpected token '<'|is not valid JSON/i.test(msg);
}
/** O `message` de um erro qualquer (o `catch` e o queryFn não garantem que seja Error). */
export function mensagemDoErro(error: unknown): unknown {
  return typeof error === "object" && error !== null && "message" in error ? (error as { message?: unknown }).message : undefined;
}
export const AVISO_SERVIDOR_ANTIGO = "O servidor ainda está na versão anterior — no Replit, faça Stop e Run e recarregue a página.";

// ─── Helpers puros ────────────────────────────────────────────────────────────
export function somarDias(dia: string, n: number): string {
  const [y, m, d] = dia.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

export const diaBR = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}/${dia.slice(0, 4)}`;

export function rotuloDoDia(dia: string, hoje: string): string {
  if (dia === hoje) return "Hoje";
  if (dia === somarDias(hoje, -1)) return "Ontem";
  return diaBR(dia);
}

/**
 * O intervalo (de..ate) que o período escolhido cobre, a partir do dia do
 * diário. Semana = segunda a domingo daquele dia; mês = do dia 1 ao último;
 * os dois travados em hoje (o servidor também trava). Intervalo = o que a
 * URL diz; sem `de`/`ate` válidos, cai no dia.
 */
export function intervaloDoPeriodo(periodo: Periodo, dia: string, hoje: string, de: string | null, ate: string | null): { de: string; ate: string } {
  const ate1 = (d: string) => (d > hoje ? hoje : d);
  if (periodo === "semana") {
    const [y, m, d] = dia.split("-").map(Number);
    const semana = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = domingo
    const segunda = somarDias(dia, -((semana + 6) % 7));
    return { de: segunda, ate: ate1(somarDias(segunda, 6)) };
  }
  if (periodo === "mes") {
    const primeiro = `${dia.slice(0, 7)}-01`;
    const [y, m] = dia.split("-").map(Number);
    const ultimo = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    return { de: primeiro, ate: ate1(ultimo) };
  }
  if (periodo === "intervalo") {
    const valido = (s: string | null) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
    const fim = valido(ate) ? ate1(ate!) : dia;
    const inicio = valido(de) && de! <= fim ? de! : fim;
    return { de: inicio, ate: fim };
  }
  return { de: dia, ate: dia };
}

/** "1h 20min", "45 min", "—" com zero (a mesma frase do Excel). */
export function duracaoCurta(minutos: number): string {
  if (!minutos || minutos <= 0) return "—";
  if (minutos < 60) return `${minutos} min`;
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return m ? `${h}h ${m}min` : `${h}h`;
}

/** "21/09/2026" ou "15/09/2026 a 21/09/2026". */
export const periodoBR = (de: string, ate: string) => (de === ate ? diaBR(de) : `${diaBR(de)} a ${diaBR(ate)}`);

/** Só anima a rolagem para quem não pediu movimento reduzido. */
export const rolarAte = (id: string) => {
  const reduz = typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.getElementById(id)?.scrollIntoView({ block: "start", behavior: reduz ? "auto" : "smooth" });
};

/** "há 1h 20min" — quanto tempo a peça está na máquina. */
export function haQuanto(iso: string | null, agora: number): string | null {
  if (!iso) return null;
  const minutos = Math.floor((agora - new Date(iso).getTime()) / 60000);
  if (!Number.isFinite(minutos) || minutos < 0) return null;
  if (minutos < 1) return "agora";
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `há ${horas}h${minutos % 60 ? ` ${minutos % 60}min` : ""}`;
  const dias = Math.floor(horas / 24);
  return `há ${dias} dia${dias > 1 ? "s" : ""}`;
}

/**
 * O que aconteceu naquele lançamento, em palavras do galpão:
 * "Iniciou a impressão", "Trocou para Impressora X", "Mandou 3 para acabamento
 * (4 de 10)", "Concluiu: 10 de 10 impressas". Correção (quantidade negativa)
 * diz para quanto o total foi corrigido.
 */
export function oQueAconteceu(r: Registro, rotuloMaquina: string): string {
  if (r.tipo === "inicio") return "Iniciou a impressão";
  if (r.tipo === "pausa") return r.deuLugarA ? `Pausou — deu lugar à ${r.deuLugarA} (${r.totalDepois ?? 0} de ${r.aImprimir} impressas)` : `Pausou — saiu da impressora (${r.totalDepois ?? 0} de ${r.aImprimir} impressas)`;
  if (r.tipo === "troca") return `Trocou para ${rotuloMaquina}`;
  const total = r.totalDepois == null ? "" : ` (${r.totalDepois} de ${r.aImprimir})`;
  if (r.quantidade < 0) return `Corrigiu para ${r.totalDepois ?? "?"} de ${r.aImprimir} (${r.quantidade})`;
  if (r.tipo === "conclusao") return `Concluiu: ${r.totalDepois ?? r.aImprimir} de ${r.aImprimir} impressas`;
  return `Mandou ${r.quantidade} para acabamento${total}`;
}

export const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** A peça do retrato no formato que o modal de impressão (e lib/saldo) lê. */
export function pecaParaOModal(p: PecaNaMaquina): PecaParaImprimir {
  return {
    id: p.id,
    displayId: p.displayId,
    type: p.tipo,
    description: p.descricao,
    // Quem está nesta lista está em impressão por definição. Um servidor
    // ainda na versão anterior (Pull sem Stop/Run) não manda `status` nem
    // `maquina` — sem isto o modal abria em "Iniciar impressão" para uma peça
    // que já estava imprimindo.
    status: p.status ?? "inProduction",
    quantity: p.quantidade,
    quantityProduced: p.impressas,
    reuseQty: p.reuso,
    printMachine: p.maquina,
    impressaoPorMaquina: p.impressaoPorMaquina ?? null,
    // A reserva por impressora (só as peças da fila trazem): o modal calcula
    // quantas PODEM ir para a impressora escolhida.
    reservaPorMaquina: (p as Partial<PecaNaFila>).reserva ?? null,
    maquinaPrevista: (p as Partial<PecaNaFila>).reserva ? null : (p as Partial<PecaNaFila>).maquinaPrevista ?? null,
    productionStartedAt: p.desde,
    approvalThumbUrl: p.miniatura ? convertGCSUrlToLocalPath(p.miniatura) : null,
    event: p.eventoInfo ? { name: p.eventoInfo.name } : null,
  } as PecaParaImprimir;
}

/**
 * O prazo de Produção Gráfica da peça (a mesma conta do chip da fila da
 * Gráfica): saída do caminhão + dias do marco, em UTC, contra hoje.
 * `hojeMs` é o relógio de verdade (Date.now) — NÃO o todayBusinessMs do
 * selo de evento, que é meia-noite UTC e cairia no dia anterior em BRT.
 */
export function prazoDaPeca(saidaCaminhao: string | null, dias: number, hojeMs = Date.now()): { data: string; diff: number } | null {
  if (!saidaCaminhao) return null;
  const base = new Date(saidaCaminhao);
  if (Number.isNaN(base.getTime())) return null;
  const alvo = Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + (Number.isFinite(dias) ? dias : -1));
  const agora = new Date(hojeMs);
  const hojeUTC = Date.UTC(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const diff = Math.round((alvo - hojeUTC) / 86_400_000);
  const d = new Date(alvo);
  return { data: `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`, diff };
}

/** "Prazo 25/09 · 4d", "hoje", "atrasado 2d" — o selo de prazo na fila. */
export function textoDoPrazo(p: { data: string; diff: number }): string {
  const sufixo = p.diff < 0 ? `atrasado ${Math.abs(p.diff)}d` : p.diff === 0 ? "hoje" : p.diff <= 14 ? `${p.diff}d` : "";
  return `Prazo ${p.data}${sufixo ? ` · ${sufixo}` : ""}`;
}

/** Ordem da fila: saída do caminhão mais próxima primeiro, depois o código. */
export function ordenarFila<P extends PecaNaFila>(pecas: P[]): P[] {
  const ms = (p: PecaNaFila) => (p.saidaCaminhao ? new Date(p.saidaCaminhao).getTime() : Infinity);
  // PAUSADAS PRIMEIRO (a mais recente em cima): a peça tirada da impressora
  // por prioridade volta para o topo da fila dela.
  const pausa = (a: PecaNaFila, b: PecaNaFila) => (a.pausadaEm && b.pausadaEm ? (a.pausadaEm < b.pausadaEm ? 1 : -1) : a.pausadaEm ? -1 : b.pausadaEm ? 1 : 0);
  return [...pecas].sort((a, b) => pausa(a, b) || ms(a) - ms(b) || String(a.displayId ?? "").localeCompare(String(b.displayId ?? ""), "pt-BR", { numeric: true }));
}

/** "SANETT · 1,90 × 0,90 · Nubank" — material, medida e patrocinador, em letra pequena. */
export const apoioDaPeca = (p: { material?: string | null; medida?: string | null; patrocinadores?: string[] }) =>
  [p.material, p.medida, (p.patrocinadores ?? []).join(", ") || null].filter(Boolean).join(" · ");

/** A pergunta da troca por prioridade — a mesma do modal (shared/progresso-da-impressao.ts). */
export { perguntaDaTroca };

/** "A impressora está com #0384 — tire-a, troque-a de máquina ou espere acabar". */
export const motivoImpressoraOcupada = (codigo: string | null) => `A impressora está com ${codigo ?? "outra peça"} — tire-a, troque-a de máquina ou espere acabar`;

/** Livres primeiro (é nelas que dá para imprimir já), depois pelo código. */
export function impressorasComLivresPrimeiro(ocupacao: OcupacaoDasImpressoras): string[] {
  return [...MAQUINAS_DE_IMPRESSAO].sort((a, b) => Math.min(1, ocupacao[a]?.n ?? 0) - Math.min(1, ocupacao[b]?.n ?? 0) || (a < b ? -1 : 1));
}

/** "20 → Impressora 1 · 14 sem impressora" — o que já foi direcionado desta peça. */
export function textoDoDirecionamento(reserva: Record<string, number> | undefined, semImpressora: number | undefined, imprimindoEm?: string[]): string {
  const partes = Object.entries(reserva ?? {}).filter(([, n]) => n > 0).map(([m, n]) => `${n} → ${rotuloDaMaquina(m)}`);
  if (!partes.length && !(imprimindoEm ?? []).length) return "";
  return [...partes, ...(imprimindoEm ?? []).map((m) => `imprimindo na ${rotuloDaMaquina(m)}`), `${semImpressora ?? 0} sem impressora`].join(" · ");
}

export function normalizar(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** As candidatas para a impressora `codigo`: reservadas para ela primeiro, depois a fila geral. Pura. */
export function candidatasParaImprimir(codigo: string, reservadas: PecaNaFila[], filaGeral: PecaNaFila[], busca: string): (PecaNaFila & { reservada: boolean })[] {
  const q = normalizar(busca.trim());
  const bate = (p: PecaNaFila) => !q || normalizar([p.displayId, p.tipo, p.descricao, p.evento].filter(Boolean).join(" ")).includes(q);
  return [
    ...ordenarFila(reservadas).map((p) => ({ ...p, reservada: true })),
    ...ordenarFila(filaGeral).map((p) => ({ ...p, reservada: false })),
  ].filter(bate);
}
