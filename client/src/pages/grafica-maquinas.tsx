// ─────────────────────────────────────────────────────────────────────────────
// MÁQUINAS DA GRÁFICA (dono, 14/09; revisão de produto 21/09).
//
// "A Gráfica ter uma aba onde faz o controle de impressão por máquinas: ver
// quais máquinas estão imprimindo o quê, qual o histórico do que foi impresso
// naquela máquina naquele dia e tudo mais."
//
// Duas perguntas, na ordem em que o galpão faz:
//   1. AGORA — o que cada impressora está imprimindo, quantas já saíram e
//      quantas ainda estão nela, desde quando. Máquina sem peça diz "Livre".
//   2. O DIA — o diário de impressão de um dia (hoje por padrão), lançamento
//      por lançamento: hora, máquina, peça, o que aconteceu, quem lançou.
//
// E a tela AGE (dono, 21/09: "com base no que está aqui eles fazem a
// manutenção e ajustam"): do cartão da impressora — e da linha do diário de
// uma peça ainda em impressão — o operador informa quantas saíram, manda para
// o acabamento ou troca de máquina, pelo MESMO modal da fila (components/
// grafica/modal-impressao.tsx). Nenhuma regra mora aqui: os endpoints, as
// permissões (grafica/admin agem; solicitacao só vê) e o bloqueio de evento
// finalizado são os de items.ts.
//
// Painel de parede tanto quanto consulta: atualiza sozinha (WebSocket em
// production_started/updated + polling de 60s + ao voltar para a aba), e diz
// "atualizado há X". Dia e impressora escolhidos vivem na URL (?dia=&maquina=)
// para um F5 — ou um link colado — abrir o mesmo recorte.
// ─────────────────────────────────────────────────────────────────────────────
import { Fragment, createContext, useContext, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useSearch } from "wouter";
import {
  AlertTriangle, ArrowLeft, ArrowLeftRight, ArrowRight, BarChart3, ChevronDown, ChevronLeft, ChevronRight, Download, ExternalLink, Eye, ListOrdered, Loader2, Play, Printer, RotateCcw, Search,
} from "lucide-react";
import { useIsMobile, useElementSize, CONTENT_CARDS_MAX, CONTENT_COMPACT_MAX } from "@/hooks/use-mobile";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { MAQUINAS_DE_IMPRESSAO } from "@shared/fluxo-peca";
import { partesDoNomeDaPeca, nomeDaPeca } from "@shared/nome-da-peca";
import { ItemDetailsDialog } from "@/components/item-details-dialog";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { HIDE_NATIVE_CLOSE, ModalHeader, modalSurface } from "@/components/modal-shell";
import { T, FS, R } from "@/lib/theme";
import { P, seloPecaEventoFinalizado, motivoAcaoBloqueada, todayBusinessMs } from "@/lib/status";
import { miniatura } from "@/lib/miniatura";
import { convertGCSUrlToLocalPath } from "@/lib/artePdfExport";
import { fmtRelative } from "@/components/prazos/tokens";
import { rotuloDaMaquina } from "@shared/fluxo-peca";
import {
  ModalImpressao, BarraDeImpressao, progressoDaImpressao, rotuloCurtoDaAcao, horaDeInicio, mensagemDeErroDaApi, type PecaParaImprimir,
  useMexerNaImpressora, useReservarImpressora,
} from "@/components/grafica/modal-impressao";
import { invalidarGraficaEMaquinas } from "@/lib/tempo-real-grafica";
import {
  numerosDaImpressao, ocupacaoDasImpressoras, perguntaDaTroca, linkDaPecaNaGrafica, linkDaImpressoraNaGrafica,
  type OcupanteDaImpressora,
} from "@shared/progresso-da-impressao";
import { useAcompanharAreaVisivel } from "@/components/grafica/area-visivel";

// ─── Tipos (espelho de server/routes/maquinas.ts) ─────────────────────────────
type EventoInfo = { id: string; name: string | null; status: string | null; startDate: string | null; reopenedAt: string | null };

type PecaNaMaquina = {
  id: string;
  displayId: string | null;
  tipo: string;
  descricao: string | null;
  evento: string | null;
  quantidade: number;
  reuso: number;
  aImprimir: number;
  impressas: number;
  desde: string | null;
  maquina: string | null;
  status: string;
  miniatura: string | null;
  eventoInfo: EventoInfo | null;
  /** O que o operador usa para achar o arquivo (servidor antigo não manda). */
  material?: string | null;
  medida?: string | null;
  patrocinadores?: string[];
  /** Peça dividida entre impressoras (jsonb); ausente/null = tudo em `maquina`. */
  impressaoPorMaquina?: Record<string, { atrib: number; impressas: number }> | null;
  /** A parte DESTA impressora, quando a peça está dividida. */
  parte?: { atrib: number; impressas: number } | null;
};

type Registro = {
  id: string;
  itemId: string;
  displayId: string | null;
  tipoPeca: string;
  /** A descrição é o que distingue duas peças do mesmo tipo. */
  descricaoPeca?: string | null;
  evento: string | null;
  tipo: "inicio" | "troca" | "parcial" | "conclusao" | "pausa";
  /** Só na "pausa": a peça que entrou no lugar (null = só tirou da impressora). */
  deuLugarA?: string | null;
  quantidade: number;
  totalDepois: number | null;
  aImprimir: number;
  hora: string;
  quem: string | null;
  ordem: number;
};

/** Peça liberada que ainda vai para a máquina — na fila geral ou reservada. */
type PecaNaFila = PecaNaMaquina & {
  maquinaPrevista: string | null;
  m2: number | null;
  saidaCaminhao: string | null;
  /** Dias em relação à saída do caminhão (negativo = antes). */
  prazoProducaoGrafica: number;
  // Reserva COM QUANTIDADE (21/09). Servidor na versão anterior não manda
  // nenhum destes: a tela cai no comportamento "tudo numa impressora".
  /** Unidades reservadas por impressora: { "1": 20, "2": 14 }. */
  reserva?: Record<string, number>;
  /** Unidades ainda sem impressora (é o que mantém a peça na fila geral). */
  semImpressora?: number;
  /** No cartão de uma impressora: quantas unidades estão reservadas PARA ELA. */
  reservadas?: number;
  /** Impressoras onde a peça JÁ está imprimindo (iniciou só uma parte). */
  imprimindoEm?: string[];
  /** Foi TIRADA desta impressora para dar lugar a outra: fica no topo da fila dela. */
  pausadaEm?: string | null;
};

type Maquina = {
  codigo: string;
  rotulo: string;
  imprimindo: PecaNaMaquina[];
  /** Servidor na versão anterior não manda: a tela trata como vazio. */
  naFila?: PecaNaFila[];
  registros: Registro[];
  unidadesNoDia: number;
  pecasNoDia: number;
};

type Retrato = { dia: string; hoje: string; maquinas: Maquina[]; semMaquina: PecaNaMaquina[]; filaGeral?: PecaNaFila[] };

/** Linha do diário já com a máquina — o diário é UM só, filtrável. */
type Linha = Registro & { maquina: string; rotuloMaquina: string };

// ─── O relatório (espelho de server/services/relatorioDeMaquinas.ts) ──────────
type ResumoDaMaquinaNoDia = {
  dia: string; maquina: string; rotulo: string; unidades: number; pecas: number; concluidas: number;
  aindaNaMaquina: number; primeira: string | null; ultima: string | null; minutosAtivos: number; quem: string[];
};
type ResumoDoDia = { dia: string; maquinas: ResumoDaMaquinaNoDia[]; total: { unidades: number; pecas: number; concluidas: number; aindaNaMaquina: number; minutosAtivos: number } };
type Relatorio = { de: string; ate: string; hoje: string; dias: ResumoDoDia[] };

/** As abas da tela (?aba=). "agora" é o padrão e não vai para a URL. */
type Aba = "agora" | "diario" | "resumo";

/**
 * Servidor ainda na versão anterior (Pull sem Stop/Run no Replit): a rota
 * nova não existe e o catch-all do SPA devolve o index.html com 200. O
 * queryFn já converte isso num erro com frase própria; aqui a tela reconhece
 * esse erro (e o JSON inválido que vazaria se a guarda falhasse) para dizer
 * o conserto certo em vez de "confira a conexão".
 */
export function ehServidorNaVersaoAnterior(error: unknown): boolean {
  const msg = String((error as any)?.message ?? error ?? "");
  return /acabou de ser atualizado|<!doctype|<html|Unexpected token '<'|is not valid JSON/i.test(msg);
}
const AVISO_SERVIDOR_ANTIGO = "O servidor ainda está na versão anterior — no Replit, faça Stop e Run e recarregue a página.";

/** Os recortes do resumo e da exportação (?periodo=). "dia" segue o dia do diário. */
type Periodo = "dia" | "semana" | "mes" | "intervalo";
const ABAS: { id: Aba; rotulo: string; Icone: typeof Printer; dica: string }[] = [
  { id: "agora", rotulo: "Agora", Icone: Printer, dica: "O que cada impressora está imprimindo e a fila do que vem" },
  { id: "diario", rotulo: "Diário", Icone: ListOrdered, dica: "Lançamento por lançamento, por dia e por impressora" },
  { id: "resumo", rotulo: "Resumo", Icone: BarChart3, dica: "Totais por dia e impressora, com exportação em Excel" },
];

const PERIODOS: { valor: Periodo; rotulo: string }[] = [
  { valor: "dia", rotulo: "Dia" }, { valor: "semana", rotulo: "Semana" }, { valor: "mes", rotulo: "Mês" }, { valor: "intervalo", rotulo: "Intervalo" },
];

// ─── Constantes ───────────────────────────────────────────────────────────────
/** Quando o diário nasceu — antes disso a impressão não anotava a máquina. */
const INICIO_DO_DIARIO = "2026-09-14";
/** Quantas linhas do diário entram por vez ("Mostrar mais"). */
const LOTE = 60;
/** A partir de quantos segundos o carregamento inicial ganha aviso de lentidão. */
const LENTO_APOS_MS = 4000;
const GROTESK = "'Space Grotesk', sans-serif";
const MONO = "'DM Mono', ui-monospace, monospace";
/** Filtros da Gráfica, para os atalhos de ida e volta. */
const GRAFICA_EM_IMPRESSAO = "/grafica?status=inProduction";
const GRAFICA_LIBERADOS = "/grafica?status=ready_for_production,approved";

const TITULO: React.CSSProperties = { margin: 0, fontFamily: GROTESK, fontWeight: 800, color: T.text, letterSpacing: "-0.02em" };
const ROTULO_MICRO: React.CSSProperties = { fontSize: FS.micro, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: T.second };
/** Tom da etapa "Em Impressão" (o mesmo da pílula em lib/status). */
const IMP = P.orange;
const LIVRE = P.green;
const AMBAR = { text: "#b45309", bg: "#fffbeb", border: "#fde68a" };
const VERMELHO = { text: "#b91c1c", bg: "#fef2f2", border: "#fecaca" };

// ─── Helpers puros ────────────────────────────────────────────────────────────
function somarDias(dia: string, n: number): string {
  const [y, m, d] = dia.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

const diaBR = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}/${dia.slice(0, 4)}`;

function rotuloDoDia(dia: string, hoje: string): string {
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
function duracaoCurta(minutos: number): string {
  if (!minutos || minutos <= 0) return "—";
  if (minutos < 60) return `${minutos} min`;
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return m ? `${h}h ${m}min` : `${h}h`;
}

/** "21/09/2026" ou "15/09/2026 a 21/09/2026". */
const periodoBR = (de: string, ate: string) => (de === ate ? diaBR(de) : `${diaBR(de)} a ${diaBR(ate)}`);

/** Só anima a rolagem para quem não pediu movimento reduzido. */
const rolarAte = (id: string) => {
  const reduz = typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.getElementById(id)?.scrollIntoView({ block: "start", behavior: reduz ? "auto" : "smooth" });
};

/** "há 1h 20min" — quanto tempo a peça está na máquina. */
function haQuanto(iso: string | null, agora: number): string | null {
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
 * O que aconteceu naquele lançamento, em palavras do galpão (dono, 21/09):
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

const TIPO_DO_REGISTRO: Record<Registro["tipo"], { rotulo: string; pal: { bg: string; border: string; text: string } }> = {
  inicio:    { rotulo: "Início",     pal: P.neutral },
  troca:     { rotulo: "Troca",      pal: P.amber },
  parcial:   { rotulo: "Impressas",  pal: P.orange },
  conclusao: { rotulo: "Concluída",  pal: P.green },
  pausa:     { rotulo: "Pausa",      pal: P.neutral },
};

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** A peça do retrato no formato que o modal de impressão (e lib/saldo) lê. */
function pecaParaOModal(p: PecaNaMaquina): PecaParaImprimir {
  return {
    id: p.id,
    displayId: p.displayId,
    type: p.tipo,
    description: p.descricao,
    // Quem está nesta lista está em impressão por definição. Um servidor
    // ainda na versão anterior (Pull sem Stop/Run) não manda `status` nem
    // `maquina` — sem isto o modal abria em "Iniciar impressão" para uma peça
    // que já estava imprimindo (dono, 21/09).
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
function ordenarFila<P extends PecaNaFila>(pecas: P[]): P[] {
  const ms = (p: PecaNaFila) => (p.saidaCaminhao ? new Date(p.saidaCaminhao).getTime() : Infinity);
  // PAUSADAS PRIMEIRO (a mais recente em cima): a peça tirada da impressora
  // por prioridade volta para o topo da fila dela.
  const pausa = (a: PecaNaFila, b: PecaNaFila) => (a.pausadaEm && b.pausadaEm ? (a.pausadaEm < b.pausadaEm ? 1 : -1) : a.pausadaEm ? -1 : b.pausadaEm ? 1 : 0);
  return [...pecas].sort((a, b) => pausa(a, b) || ms(a) - ms(b) || String(a.displayId ?? "").localeCompare(String(b.displayId ?? ""), "pt-BR", { numeric: true }));
}

// ─── O NOME DA PEÇA e a FICHA ─────────────────────────────────────────────────
// Dono (21/09): "aqui precisa da descrição do item" (todas eram "2×1") e
// "quando clicar, abrir o card com as informações do item". Em toda a tela o
// título da peça é um BOTÃO que abre a mesma ficha da Gráfica (ItemDetailsDialog);
// "Ver na Gráfica" segue como ação separada. O contexto evita passar o gesto
// por cinco componentes (e mantém as linhas memoizadas).
const FichaContext = createContext<(id: string) => void>(() => {});

/**
 * Código + DESCRIÇÃO em destaque (é ela que identifica) + tipo como apoio, em
 * até 2 linhas. Botão de verdade: Enter/Espaço abrem; 44px no celular.
 */
function TituloDaPeca({ id, codigo, tipo, descricao, isMobile, testId, fonte = FS.body, emLinha = false }: {
  id: string; codigo: string | null; tipo: string; descricao?: string | null; isMobile: boolean; testId?: string; fonte?: number; /** Diário: sem altura mínima nem bloco. */ emLinha?: boolean;
}) {
  const abrirFicha = useContext(FichaContext);
  const nome = partesDoNomeDaPeca(tipo, descricao);
  return (
    <button
      type="button"
      className="mq-link"
      onClick={(e) => { e.stopPropagation(); abrirFicha(id); }}
      aria-label={`Ver detalhes de ${codigo ?? "peça"}`}
      title={`${codigo ?? ""} ${nomeDaPeca(tipo, descricao)} — ver detalhes`.trim()}
      data-testid={testId}
      style={{ border: "none", background: "transparent", padding: 0, margin: 0, font: "inherit", textAlign: "left", cursor: "pointer", color: T.text, fontSize: fonte, fontWeight: 700, lineHeight: 1.3, minWidth: 0, maxWidth: "100%", minHeight: isMobile && !emLinha ? 44 : undefined, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflowWrap: "anywhere" }}
    >
      <span style={{ fontFamily: MONO, color: T.accentText, marginRight: 6 }}>{codigo ?? "—"}</span>
      {nome.destaque}
      {nome.tipo && <span style={{ fontWeight: 500, color: T.second, marginLeft: 6 }}>{nome.tipo}</span>}
    </button>
  );
}

/** No seletor a linha inteira ESCOLHE a peça; a ficha abre por este botão ao lado. */
function BotaoDaFicha({ id, codigo, isMobile, comBorda, fundo }: { id: string; codigo: string | null; isMobile: boolean; comBorda: boolean; fundo: string }) {
  const abrirFicha = useContext(FichaContext);
  return (
    <button type="button" className="mq-acao" onClick={() => abrirFicha(id)} aria-label={`Ver detalhes de ${codigo ?? "peça"}`} title="Ver detalhes da peça" data-testid={`ficha-${id}`} style={{ flex: "0 0 auto", minWidth: 44, minHeight: isMobile ? 44 : 40, border: "none", borderTop: comBorda ? `1px solid ${T.low}` : "none", borderLeft: `1px solid ${T.low}`, background: fundo, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", color: T.second }}>
      <Eye aria-hidden="true" style={{ width: 15, height: 15 }} />
    </button>
  );
}

/** "SANETT · 1,90 × 0,90 · Nubank" — material, medida e patrocinador, em letra pequena. */
const apoioDaPeca = (p: { material?: string | null; medida?: string | null; patrocinadores?: string[] }) =>
  [p.material, p.medida, (p.patrocinadores ?? []).join(", ") || null].filter(Boolean).join(" · ");

// ─── Pedaços de interface ─────────────────────────────────────────────────────
/** Estilos de hover/foco que estilo inline não alcança — só desta tela. */
const CSS_DA_TELA = `
  .mq-acao { transition: background-color 0.12s, border-color 0.12s, color 0.12s; }
  .mq-acao:hover:not(:disabled) { background-color: #f5f5f4; }
  .mq-primario:hover:not(:disabled) { background-color: #000000; }
  .mq-chip:hover:not([aria-pressed="true"]) { background-color: #f5f5f4; border-color: #d6d3d1; }
  .mq-peca:hover { background-color: #fafaf9; }
  .mq-linha:hover > td { background-color: #fafaf9; }
  .mq-link:hover { text-decoration: underline; }
`;

/** "Atualizado há X" — relógio próprio, para o resto da tela não redesenhar a cada tique. */
function Atualizado({ em, buscando, fonte }: { em: number; buscando: boolean; fonte: number }) {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);
  return (
    <span data-testid="atualizado-ha" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: fonte, color: T.second, whiteSpace: "nowrap" }}>
      {buscando
        ? <RotateCcw aria-hidden="true" className="animate-spin" style={{ width: 11, height: 11 }} />
        : <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: 999, background: LIVRE.dot, flexShrink: 0 }} />}
      {buscando ? "Atualizando…" : em ? `Atualizado ${fmtRelative(new Date(em).toISOString(), agora)}` : "Ao vivo"}
    </span>
  );
}

function Pilula({ pal, children, testId, fonte = FS.small }: { pal: { bg: string; border: string; text: string; dot?: string }; children: React.ReactNode; testId?: string; fonte?: number }) {
  return (
    <span data-testid={testId} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: fonte, fontWeight: 800, padding: "3px 9px", borderRadius: R.pill, whiteSpace: "nowrap", color: pal.text, background: pal.bg, border: `1px solid ${pal.border}`, textTransform: "uppercase", letterSpacing: "0.04em" }}>
      {pal.dot && <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 999, background: pal.dot }} />}
      {children}
    </span>
  );
}

/** Silhueta da tela enquanto carrega: reserva o espaço, nada empurra ao chegar. */
function Esqueleto({ lento }: { lento: boolean }) {
  const bloco = (w: string | number, h: number, extra?: React.CSSProperties) => (
    <div className="animate-pulse" aria-hidden="true" style={{ width: w, height: h, borderRadius: 4, background: "#e7e5e4", ...extra }} />
  );
  return (
    <div role="status" aria-busy="true" data-testid="maquinas-carregando" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <span className="sr-only">Carregando as máquinas…</span>
      {lento && (
        <p data-testid="maquinas-lento" style={{ margin: 0, fontSize: FS.body, color: AMBAR.text }}>
          Está demorando mais que o normal. A conexão do galpão pode estar lenta — a tela carrega assim que responder.
        </p>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 12 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: R.lg, padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>{bloco(120, 14)}{bloco(56, 18, { borderRadius: 999 })}</div>
            {bloco("80%", 12)}{bloco("100%", 6, { borderRadius: 999 })}{bloco("55%", 10)}
          </div>
        ))}
      </div>
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: R.lg, overflow: "hidden" }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} style={{ display: "flex", gap: 16, alignItems: "center", height: 46, padding: "0 14px", borderTop: i ? `1px solid ${T.low}` : "none" }}>
            {bloco(40, 10)}{bloco(`${34 - (i % 3) * 6}%`, 10)}{bloco(90, 10, { marginLeft: "auto" })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Reservar impressora (dono, 21/09) ────────────────────────────────────────
// A mutation mora em components/grafica/modal-impressao.tsx (useReservarImpressora):
// o modal compartilhado também reserva ("Só reservar"), com o MESMO endpoint,
// os mesmos toasts e as mesmas chaves invalidadas (lib/tempo-real-grafica.ts).

/** O selo de prazo da fila — sobre fundo claro (na Gráfica é sobre o escuro). */
function SeloDePrazo({ p, fonte }: { p: { data: string; diff: number } | null; fonte: number }) {
  if (!p) return <span style={{ fontSize: fonte, color: T.second }}>Sem prazo</span>;
  const pal = p.diff < 0 ? VERMELHO : p.diff === 0 ? { text: "#9a3412", bg: "#fff7ed", border: "#fed7aa" } : p.diff <= 3 ? AMBAR : { text: T.second, bg: T.low, border: T.border };
  return (
    <span title={`Marco de Produção Gráfica em ${p.data}`} style={{ display: "inline-flex", alignItems: "center", fontSize: fonte, fontWeight: 700, padding: "2px 8px", borderRadius: R.pill, color: pal.text, background: pal.bg, border: `1px solid ${pal.border}`, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
      {textoDoPrazo(p)}
    </span>
  );
}

/**
 * "Reservar para →" / "Mover para": um select nativo com as 4 impressoras e a
 * fila geral — no galpão, muitas vezes no celular, o menu nativo é o mais
 * confiável e já vem acessível. `excluir` tira a opção atual.
 */
function SeletorDeReserva({ valor, excluir, disabled, alvo, isMobile, testId, rotulo, onEscolher }: {
  valor: string | null; excluir: string | null; disabled?: boolean; alvo: number; isMobile: boolean; testId: string; rotulo: string; onEscolher: (maquina: string | null) => void;
}) {
  return (
    <select
      aria-label={rotulo}
      data-testid={testId}
      value=""
      disabled={disabled}
      onChange={(e) => { const v = e.target.value; if (v !== "") onEscolher(v === "geral" ? null : v); }}
      // Celular: 16px (sem zoom do iOS) e a linha inteira — o menu nativo
      // abre de um alvo de 44px que o dedo acha sem mirar.
      style={{ minHeight: alvo, height: alvo, padding: "0 8px", borderRadius: R.md, border: `1px solid ${T.bdark}`, background: T.surface, color: T.text, fontSize: isMobile ? 16 : 12, fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer", maxWidth: "100%", ...(isMobile ? { flex: "1 1 100%", width: "100%" } : {}) }}
    >
      <option value="">{rotulo}</option>
      {MAQUINAS_DE_IMPRESSAO.filter((m) => m !== excluir).map((m) => (
        <option key={m} value={m}>{rotuloDaMaquina(m)}</option>
      ))}
      {valor && <option value="geral">Devolver à fila geral</option>}
    </select>
  );
}

/**
 * "Reservar": impressora + QUANTIDADE (dono, 21/09: "além de reservar, posso
 * direcionar a quantidade e para qual impressora vai"). A quantidade nasce
 * com tudo o que ainda está sem impressora; reservar menos deixa o resto na
 * fila geral, para outra impressora.
 */
/** O que cada impressora tem AGORA (a peça e os números da parte dela): shared/progresso-da-impressao.ts. */
export type { OcupanteDaImpressora };
export type OcupacaoDasImpressoras = Record<string, { n: number; primeira: string | null; atual?: OcupanteDaImpressora | null }>;

/** A pergunta da troca por prioridade — a mesma do modal (shared/progresso-da-impressao.ts). */
export { perguntaDaTroca };

/** "A impressora está com #0384 — tire-a, troque-a de máquina ou espere acabar". */
export const motivoImpressoraOcupada = (codigo: string | null) => `A impressora está com ${codigo ?? "outra peça"} — tire-a, troque-a de máquina ou espere acabar`;
const SEM_OCUPACAO: OcupacaoDasImpressoras = {};

/** Livres primeiro (dono, 21/09: "quando a impressora estiver vazia…"), depois pelo código. */
export function impressorasComLivresPrimeiro(ocupacao: OcupacaoDasImpressoras): string[] {
  return [...MAQUINAS_DE_IMPRESSAO].sort((a, b) => Math.min(1, ocupacao[a]?.n ?? 0) - Math.min(1, ocupacao[b]?.n ?? 0) || (a < b ? -1 : 1));
}

function ControleDeReserva({ id, codigoDaPeca, semImpressora, disabled, alvo, isMobile, ocupacao = SEM_OCUPACAO, imprimindo = false, onReservar, onImprimir, onTrocar }: {
  id: string; codigoDaPeca?: string | null; semImpressora: number; disabled?: boolean; alvo: number; isMobile: boolean;
  ocupacao?: OcupacaoDasImpressoras; /** O "Imprimir agora" DESTA linha está em voo. */ imprimindo?: boolean;
  onReservar: (maquina: string, quantidade: number) => void;
  /** "Imprimir agora" (dono, 21/09): põe direto em impressão, sem modal. Ausente = só reservar. */
  onImprimir?: (maquina: string, quantidade: number) => void;
  /** Impressora ocupada: tirar a peça atual e imprimir esta no lugar (troca por prioridade). */
  onTrocar?: (maquina: string, quantidade: number, sai: OcupanteDaImpressora) => void;
}) {
  const [maquina, setMaquina] = useState("");
  const [qtd, setQtd] = useState<number | "">("");
  // Impressora ocupada pede uma confirmação leve, aqui mesmo na linha.
  const [confirmando, setConfirmando] = useState(false);
  // Enter segurado / duplo clique: a trava por ref vale antes do próximo render.
  const travaRef = useRef(false);
  const n = qtd === "" ? semImpressora : qtd;
  const valida = n >= 1 && n <= semImpressora;
  const ocupada = !!maquina && (ocupacao[maquina]?.n ?? 0) > 0;
  const atual = ocupada ? ocupacao[maquina]?.atual ?? null : null;
  const gesto = (fazer: () => void) => {
    if (!maquina || !valida || travaRef.current || imprimindo) return;
    travaRef.current = true;
    setTimeout(() => { travaRef.current = false; }, 1500);
    setConfirmando(false);
    fazer();
  };
  // UMA PEÇA POR VEZ: com a impressora ocupada não há "imprimir junto".
  const imprimir = () => { if (onImprimir && !ocupada) gesto(() => onImprimir(maquina, n)); };
  const trocar = () => { if (onTrocar && atual) gesto(() => onTrocar(maquina, n, atual)); };
  const campo: React.CSSProperties = { minHeight: alvo, height: alvo, boxSizing: "border-box", borderRadius: R.md, border: `1px solid ${T.bdark}`, background: T.surface, color: T.text, fontSize: isMobile ? 16 : 12, fontWeight: 700 };
  return (
    <div role="group" aria-label="Reservar impressora" data-testid={`controle-reserva-${id}`} style={{ display: isMobile ? "flex" : "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap", ...(isMobile ? { flex: "1 1 100%", width: "100%" } : {}) }}>
      <select aria-label="Impressora" value={maquina} disabled={disabled} onChange={(e) => { setMaquina(e.target.value); setConfirmando(false); }} data-testid={`reservar-fila-${id}`} style={{ ...campo, padding: "0 8px", cursor: disabled ? "not-allowed" : "pointer", maxWidth: "100%", ...(isMobile ? { flex: "1 1 100%", width: "100%" } : {}) }}>
        <option value="">Impressora…</option>
        {impressorasComLivresPrimeiro(ocupacao).map((m) => (
          <option key={m} value={m}>{rotuloDaMaquina(m)}{onImprimir ? ((ocupacao[m]?.n ?? 0) > 0 ? ` — imprimindo ${ocupacao[m].primeira ?? ocupacao[m].n}` : " — livre") : ""}</option>
        ))}
      </select>
      <input
        type="number" inputMode="numeric" pattern="[0-9]*" min={1} max={semImpressora}
        value={qtd} placeholder={String(semImpressora)} disabled={disabled}
        onChange={(e) => setQtd(e.target.value === "" ? "" : Math.max(0, parseInt(e.target.value) || 0))}
        aria-label={`Quantas das ${semImpressora} un. reservar (vazio = todas)`}
        aria-invalid={!valida || undefined}
        title={valida ? undefined : `De 1 a ${semImpressora}`}
        data-testid={`qtd-reservar-${id}`}
        style={{ ...campo, width: 68, textAlign: "center", padding: "0 6px", borderColor: valida ? T.bdark : VERMELHO.border, ...(isMobile ? { flex: "0 0 84px", width: 84 } : {}) }}
      />
      {onImprimir && (
        <button
          type="button"
          className="mq-acao mq-primario"
          disabled={disabled || imprimindo || !maquina || !valida || ocupada}
          aria-busy={imprimindo || undefined}
          onClick={imprimir}
          data-testid={`button-imprimir-agora-${id}`}
          title={!maquina ? "Escolha a impressora" : ocupada ? `${rotuloDaMaquina(maquina)} está com ${ocupacao[maquina]?.primeira ?? "outra peça"}` : !valida ? `De 1 a ${semImpressora}` : `Pôr ${n} un. em impressão na ${rotuloDaMaquina(maquina)} agora`}
          style={{ minHeight: alvo, padding: "0 12px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5, borderRadius: R.md, border: "none", background: T.text, color: "#fff", fontFamily: GROTESK, fontSize: isMobile ? 13 : 12, fontWeight: 700, cursor: disabled || imprimindo || !maquina || !valida || ocupada ? "not-allowed" : "pointer", opacity: disabled || imprimindo || !maquina || !valida || ocupada ? 0.55 : 1, whiteSpace: "nowrap", ...(isMobile ? { flex: "1 1 100%", width: "100%", order: -1 } : {}) }}
        >
          {imprimindo ? <Loader2 aria-hidden="true" className="animate-spin" style={{ width: 12, height: 12 }} /> : <Play aria-hidden="true" style={{ width: 12, height: 12, flexShrink: 0 }} />}
          {imprimindo ? "Iniciando…" : "Imprimir agora"}
        </button>
      )}
      <button
        type="button"
        className="mq-acao"
        disabled={disabled || !maquina || !valida}
        onClick={() => { if (maquina && valida) { onReservar(maquina, n); setQtd(""); setMaquina(""); setConfirmando(false); } }}
        data-testid={`button-reservar-${id}`}
        title={!maquina ? "Escolha a impressora" : !valida ? `De 1 a ${semImpressora}` : `Reservar ${n} un. para a ${rotuloDaMaquina(maquina)}`}
        style={{ minHeight: alvo, padding: "0 12px", borderRadius: R.md, border: `1px solid ${T.bdark}`, background: T.surface, color: T.text, fontSize: isMobile ? 13 : 12, fontWeight: 700, cursor: disabled || !maquina || !valida ? "not-allowed" : "pointer", opacity: disabled || !maquina || !valida ? 0.55 : 1, whiteSpace: "nowrap", ...(isMobile ? { flex: "1 1 auto" } : {}) }}
      >
        Reservar
      </button>
      {ocupada && onImprimir && (
        <div data-testid={`ocupada-${id}`} style={{ flex: "1 1 100%", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: isMobile ? 12 : FS.small, color: AMBAR.text }}>
          <span role="status" style={{ flex: "1 1 200px", fontWeight: 700 }}>
            {rotuloDaMaquina(maquina)} está com {ocupacao[maquina]?.primeira ?? "outra peça"} — dá para reservar, ou imprimir esta no lugar.
          </span>
          {onTrocar && atual && !confirmando && (
            <button type="button" className="mq-acao" disabled={disabled || imprimindo || !valida} onClick={() => setConfirmando(true)} data-testid={`button-imprimir-no-lugar-${id}`} style={{ minHeight: alvo, padding: "0 12px", borderRadius: R.md, border: `1px solid ${T.text}`, background: T.surface, color: T.text, fontSize: isMobile ? 13 : 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", ...(isMobile ? { flex: "1 1 100%" } : {}) }}>
              Imprimir esta no lugar
            </button>
          )}
        </div>
      )}
      {confirmando && ocupada && atual && (
        <div role="alertdialog" aria-label="Trocar a peça da impressora" data-testid={`confirmar-troca-${id}`} style={{ flex: "1 1 100%", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "8px 10px", borderRadius: R.md, background: AMBAR.bg, border: `1px solid ${AMBAR.border}`, color: "#92400e", fontSize: isMobile ? 13 : 12, lineHeight: 1.45 }}>
          <span style={{ flex: "1 1 240px", fontWeight: 700 }}>{perguntaDaTroca(atual, codigoDaPeca ?? null, maquina)}</span>
          <button type="button" className="mq-acao mq-primario" disabled={disabled || imprimindo} onClick={trocar} data-testid={`button-trocar-${id}`} style={{ opacity: disabled || imprimindo ? 0.6 : 1, minHeight: alvo, padding: "0 14px", borderRadius: R.md, border: "none", background: T.text, color: "#fff", fontSize: isMobile ? 13 : 12, fontWeight: 700, cursor: "pointer", ...(isMobile ? { flex: "1 1 100%" } : {}) }}>Trocar</button>
          <button type="button" className="mq-acao" onClick={() => setConfirmando(false)} data-testid={`button-cancelar-troca-${id}`} style={{ minHeight: alvo, padding: "0 12px", borderRadius: R.md, border: `1px solid ${T.bdark}`, background: T.surface, color: T.text, fontSize: isMobile ? 13 : 12, fontWeight: 700, cursor: "pointer", ...(isMobile ? { flex: "1 1 100%" } : {}) }}>Cancelar</button>
        </div>
      )}
    </div>
  );
}

/** "20 → Impressora 1 · 14 sem impressora" — o que já foi direcionado desta peça. */
export function textoDoDirecionamento(reserva: Record<string, number> | undefined, semImpressora: number | undefined, imprimindoEm?: string[]): string {
  const partes = Object.entries(reserva ?? {}).filter(([, n]) => n > 0).map(([m, n]) => `${n} → ${rotuloDaMaquina(m)}`);
  if (!partes.length && !(imprimindoEm ?? []).length) return "";
  return [...partes, ...(imprimindoEm ?? []).map((m) => `imprimindo na ${rotuloDaMaquina(m)}`), `${semImpressora ?? 0} sem impressora`].join(" · ");
}

// ─── O seletor de peça (dono, 21/09: "tinha que ser mais fácil de selecionar
// a peça; abre todas e sem filtro às vezes") ──────────────────────────────────
// Em vez de mandar para a Gráfica, a lista das liberadas AQUI: as reservadas
// para ESTA impressora no topo, depois a fila geral, na ordem do caminhão;
// busca por código/peça/evento; um clique abre o modal de impressão já com a
// impressora escolhida. Os dados são os do próprio retrato (filaGeral + naFila
// de cada cartão) — nenhuma chamada a mais, e a lista entra em lotes de 60.
const LOTE_DO_SELETOR = 60;

function normalizar(s: string): string {
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

function SeletorDePeca({ maquina, reservadas, filaGeral, atualizando, hojeMs, onEscolher, onFechar }: {
  maquina: { codigo: string; rotulo: string } | null; reservadas: PecaNaFila[]; filaGeral: PecaNaFila[]; atualizando: boolean; hojeMs: number;
  onEscolher: (p: PecaNaFila, maquina: string) => void; onFechar: () => void;
}) {
  const isMobile = useIsMobile();
  const padModal = isMobile ? 16 : 24;
  const [busca, setBusca] = useState("");
  const [visiveis, setVisiveis] = useState(LOTE_DO_SELETOR);
  // A busca abre o teclado: o modal recentra e encolhe para a área visível,
  // e a lista continua rolável acima dele (o mesmo gancho da Gráfica).
  const superficieRef = useRef<HTMLDivElement>(null);
  useAcompanharAreaVisivel(superficieRef, "centro", isMobile && !!maquina);
  const lista = useMemo(() => (maquina ? candidatasParaImprimir(maquina.codigo, reservadas, filaGeral, busca) : []), [maquina, reservadas, filaGeral, busca]);
  const total = reservadas.length + filaGeral.length;
  const mostradas = lista.slice(0, visiveis);
  const fonte = isMobile ? 12 : FS.small;

  return (
    <Dialog open={!!maquina} onOpenChange={(open) => { if (!open) onFechar(); }}>
      <DialogContent ref={superficieRef} className={HIDE_NATIVE_CLOSE} style={modalSurface(620)} data-testid="seletor-de-peca">
        <DialogTitle className="sr-only">Escolher peça para imprimir{maquina ? ` na ${maquina.rotulo}` : ""}</DialogTitle>
        <DialogDescription className="sr-only">Lista das peças liberadas; um toque abre a impressão nesta impressora.</DialogDescription>
        <ModalHeader icon={Printer} tint={T.text} title={maquina ? `Imprimir na ${maquina.rotulo}` : "Escolher peça"} subtitle={total === 0 ? "Nenhuma peça liberada agora" : `${plural(total, "peça liberada", "peças liberadas")}${reservadas.length ? ` · ${reservadas.length} reservada${reservadas.length === 1 ? "" : "s"} para esta` : ""} — toque numa para iniciar`} onClose={onFechar} />
        {maquina && (
          <div style={{ padding: padModal, display: "flex", flexDirection: "column", gap: 12, overflowY: "auto", flex: "1 1 auto", minHeight: 0 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <label htmlFor="busca-peca" className="sr-only">Buscar por código, peça ou evento</label>
              <div style={{ flex: "1 1 220px", position: "relative", minWidth: 0 }}>
                <Search aria-hidden="true" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: T.muted }} />
                <input
                  id="busca-peca"
                  type="search"
                  value={busca}
                  onChange={(e) => { setBusca(e.target.value); setVisiveis(LOTE_DO_SELETOR); }}
                  placeholder="Código, peça ou evento"
                  autoComplete="off"
                  data-testid="busca-peca"
                  style={{ width: "100%", boxSizing: "border-box", minHeight: 44, padding: "0 12px 0 32px", borderRadius: R.md, border: `1px solid ${T.bdark}`, background: T.surface, fontSize: isMobile ? 16 : 13, color: T.text }}
                />
              </div>
              <Link href={GRAFICA_LIBERADOS} className="mq-link" data-testid="link-ver-na-grafica" style={{ display: "inline-flex", alignItems: "center", gap: 4, minHeight: isMobile ? 44 : 34, fontSize: fonte, fontWeight: 700, color: T.second, textDecoration: "none", whiteSpace: "nowrap" }}>
                Ver na Gráfica <ExternalLink aria-hidden="true" style={{ width: 11, height: 11 }} />
              </Link>
            </div>
            {atualizando && <p role="status" style={{ margin: 0, fontSize: fonte, color: T.second }}>Atualizando a lista…</p>}

            {total === 0 ? (
              <div data-testid="seletor-vazio" style={{ padding: "28px 16px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                <Printer aria-hidden="true" style={{ width: 22, height: 22, color: T.muted }} />
                <p style={{ margin: 0, fontSize: FS.strong, fontWeight: 700, color: T.text }}>Nenhuma peça liberada agora.</p>
                <p style={{ margin: 0, fontSize: FS.body, color: T.second, maxWidth: 380 }}>Quando a Arte liberar uma peça para a Gráfica, ela aparece aqui.</p>
              </div>
            ) : lista.length === 0 ? (
              <p data-testid="seletor-sem-resultado" style={{ margin: 0, padding: "20px 8px", textAlign: "center", fontSize: FS.body, color: T.second }}>Nada bate com “{busca}”.</p>
            ) : (
              <div role="list" data-testid="seletor-lista" style={{ display: "flex", flexDirection: "column", border: `1px solid ${T.border}`, borderRadius: R.lg, overflow: "hidden" }}>
                {mostradas.map((p, i) => {
                  const selo = seloPecaEventoFinalizado(p.eventoInfo, hojeMs);
                  const prazo = prazoDaPeca(p.saidaCaminhao, p.prazoProducaoGrafica);
                  const thumb = p.miniatura ? miniatura(convertGCSUrlToLocalPath(p.miniatura)) : undefined;
                  const cabecalhoGeral = !p.reservada && (i === 0 || mostradas[i - 1].reservada);
                  // Celular: "Reservada · 20 un." + prazo numa coluna à direita
                  // deixavam ~100px para o nome da peça; ali os selos descem para
                  // baixo do texto e o nome usa a largura toda.
                  const selos = (
                    <>
                      {p.reservada && <Pilula pal={P.amber} fonte={fonte} testId={`selo-reservada-${p.id}`}>{p.reservadas != null && p.reservadas < p.aImprimir ? `Reservada · ${p.reservadas} un.` : "Reservada"}</Pilula>}
                      <SeloDePrazo p={prazo} fonte={fonte} />
                    </>
                  );
                  return (
                    <Fragment key={p.id}>
                      {cabecalhoGeral && reservadas.length > 0 && (
                        <div style={{ ...ROTULO_MICRO, fontSize: isMobile ? 12 : FS.micro, padding: "8px 12px 4px", background: T.bg, borderTop: i ? `1px solid ${T.low}` : "none" }}>Fila geral</div>
                      )}
                      <div role="listitem" style={{ display: "flex", alignItems: "stretch" }}>
                      <button
                        type="button"
                        className="mq-peca"
                        onClick={() => { if (!selo) onEscolher(p, maquina.codigo); }}
                        disabled={!!selo}
                        data-testid={`escolher-peca-${p.id}`}
                        title={selo ? motivoAcaoBloqueada(selo.motivo, "iniciar impressão") : `Iniciar a impressão de ${p.displayId ?? "esta peça"} na ${maquina.rotulo}`}
                        style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: isMobile ? "8px 12px" : "8px 12px", minHeight: 56, border: "none", borderTop: i || (cabecalhoGeral && reservadas.length) ? `1px solid ${T.low}` : "none", background: p.reservada ? "#fffbeb" : T.surface, cursor: selo ? "not-allowed" : "pointer", opacity: selo ? 0.6 : 1, color: T.text }}
                      >
                        <span aria-hidden="true" style={{ width: 40, height: 40, borderRadius: R.md, background: T.low, border: `1px solid ${T.border}`, flexShrink: 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {thumb ? <img src={thumb} alt="" loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : <Printer style={{ width: 14, height: 14, color: T.muted }} />}
                        </span>
                        <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                          <span style={{ fontSize: FS.body, fontWeight: 700, lineHeight: 1.3, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflowWrap: "anywhere" }}>
                            <span style={{ fontFamily: MONO, color: T.accentText, marginRight: 6 }}>{p.displayId ?? "—"}</span>{partesDoNomeDaPeca(p.tipo, p.descricao).destaque}
                            {partesDoNomeDaPeca(p.tipo, p.descricao).tipo && <span style={{ fontWeight: 500, color: T.second, marginLeft: 6 }}>{partesDoNomeDaPeca(p.tipo, p.descricao).tipo}</span>}
                          </span>
                          <span style={{ fontSize: fonte, color: T.second, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflowWrap: "anywhere" }}>
                            {[p.evento, `${p.aImprimir} un.`, p.m2 != null ? `${p.m2.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m²` : null].filter(Boolean).join(" · ")}
                          </span>
                          {apoioDaPeca(p) && <span style={{ fontSize: fonte, color: T.second, overflowWrap: "anywhere" }}>{apoioDaPeca(p)}</span>}
                          {isMobile && <span data-testid={`selos-peca-${p.id}`} style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 2 }}>{selos}</span>}
                        </span>
                        {!isMobile && <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>{selos}</span>}
                      </button>
                      <BotaoDaFicha id={p.id} codigo={p.displayId} isMobile={isMobile} comBorda={!!(i || (cabecalhoGeral && reservadas.length))} fundo={p.reservada ? "#fffbeb" : T.surface} />
                      </div>
                    </Fragment>
                  );
                })}
                {lista.length > visiveis && (
                  <div style={{ padding: 10, borderTop: `1px solid ${T.low}`, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, flexWrap: "wrap" }}>
                    <span style={{ fontSize: fonte, color: T.second }}>Mostrando {visiveis} de {lista.length}</span>
                    <button type="button" className="mq-acao" onClick={() => setVisiveis((v) => v + LOTE_DO_SELETOR)} data-testid="seletor-mostrar-mais" style={{ minHeight: isMobile ? 44 : 34, padding: "0 12px", borderRadius: R.md, border: `1px solid ${T.bdark}`, background: T.surface, color: T.text, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                      Mostrar mais {Math.min(LOTE_DO_SELETOR, lista.length - visiveis)}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── A peça reservada, dentro do cartão da impressora ─────────────────────────
// (Uma impressora pode ter mais de uma peça ao mesmo tempo — "Imprimindo 2" —
// então iniciar nunca é barrado por ela estar ocupada.)
function PecaNaFilaDoCartao({ p, podeAgir, hojeMs, isMobile, proxima = false, ocupante = null, mexendo = false, onTrocar, onIniciar, onReservar }: {
  p: PecaNaFila; podeAgir: boolean; hojeMs: number; isMobile: boolean; /** Impressora LIVRE: esta é a próxima a entrar — o Iniciar ganha destaque. */ proxima?: boolean;
  /** A peça que OCUPA a impressora agora: com ela, a fila não inicia (uma por vez) — só troca por prioridade. */
  ocupante?: OcupanteDaImpressora | null; /** Tirar/trocar em voo: sem segundo disparo. */ mexendo?: boolean; onTrocar?: (p: PecaNaFila, sai: OcupanteDaImpressora) => void; onIniciar: (p: PecaNaFila) => void; onReservar: (p: PecaNaFila, maquina: string | null, quantidade: number | null) => void;
}) {
  const ocupado = !!ocupante;
  const [confirmandoTroca, setConfirmandoTroca] = useState(false);
  // Quantas unidades estão reservadas PARA ESTA impressora; mover/devolver
  // aceita uma parte delas (campo ao lado do seletor; vazio = todas).
  const reservadas = p.reservadas ?? p.aImprimir;
  const [qtd, setQtd] = useState<number | "">("");
  const qtdValida = qtd === "" || (qtd >= 1 && qtd <= reservadas);
  const jaImprimindo = (p.imprimindoEm ?? []).filter((m) => m !== p.maquinaPrevista);
  const selo = seloPecaEventoFinalizado(p.eventoInfo, hojeMs);
  const alvo = isMobile ? 44 : 34;
  const prazo = prazoDaPeca(p.saidaCaminhao, p.prazoProducaoGrafica);
  // Celular: com várias peças na fila, Iniciar + quantidade + select por peça
  // viravam uma parede (e a quantidade ao lado do Iniciar parecia ser DELE).
  // Iniciar fica à vista; "Mover…" abre a quantidade e o destino só da peça
  // tocada. No desktop continua tudo na linha.
  const [moverAberto, setMoverAberto] = useState(false);
  const mostrarMover = !isMobile || moverAberto;
  const idMover = `mover-painel-${p.id}`;
  return (
    <div data-testid={`peca-na-fila-${p.id}`} style={{ display: "flex", flexDirection: "column", gap: 6, padding: "8px 0", borderTop: `1px solid ${T.low}` }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <span style={{ flex: "1 1 140px", minWidth: 0, display: "flex" }}>
          <TituloDaPeca id={p.id} codigo={p.displayId} tipo={p.tipo} descricao={p.descricao} isMobile={isMobile} testId={`nome-fila-${p.id}`} />
        </span>
        <SeloDePrazo p={prazo} fonte={isMobile ? 12 : FS.small} />
      </div>
      <div style={{ fontSize: isMobile ? 12 : FS.small, color: T.second, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflowWrap: "anywhere" }}>
        {[p.pausadaEm ? "Pausada — volta primeiro" : null, p.evento, reservadas < p.aImprimir ? `${reservadas} de ${p.aImprimir} un.` : `${p.aImprimir} un.`, p.impressas > 0 ? `${p.impressas} de ${p.aImprimir} já impressas` : null, p.m2 != null ? `${p.m2.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m²` : null].filter(Boolean).join(" · ")}
      </div>
      {jaImprimindo.length > 0 && (
        <div data-testid={`ja-imprimindo-${p.id}`} style={{ fontSize: isMobile ? 12 : FS.small, color: IMP.text, fontWeight: 700 }}>
          {reservadas} un. na fila · peça já em impressão na {jaImprimindo.map((m) => rotuloDaMaquina(m)).join(" e na ")}
        </div>
      )}
      {podeAgir && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <button
            type="button"
            className="mq-acao"
            onClick={() => { if (!selo) onIniciar(p); }}
            disabled={!!selo || ocupado}
            data-testid={`button-iniciar-fila-${p.id}`}
            title={selo ? motivoAcaoBloqueada(selo.motivo, "iniciar impressão") : ocupado ? motivoImpressoraOcupada(ocupante?.displayId ?? null) : `Iniciar a impressão na ${rotuloDaMaquina(p.maquinaPrevista)}`}
            data-proxima={proxima || undefined}
            style={{ flex: isMobile ? "2 1 150px" : "1 1 130px", minHeight: alvo, padding: "0 10px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5, borderRadius: R.md, border: `1px solid ${selo || ocupado ? T.border : T.text}`, background: proxima && !selo ? T.text : T.surface, color: selo || ocupado ? "#746e69" : proxima ? "#fff" : T.text, fontFamily: GROTESK, fontSize: isMobile ? 13 : 12, fontWeight: 700, cursor: selo || ocupado ? "not-allowed" : "pointer", whiteSpace: "nowrap" }}
          >
            <Play aria-hidden="true" style={{ width: 12, height: 12, flexShrink: 0 }} />
            {proxima
              ? `Próxima: ${p.displayId ?? "peça"} · Iniciar ${reservadas} un.`
              : p.reservadas != null && reservadas < p.aImprimir ? `Iniciar ${reservadas} un.` : "Iniciar impressão"}
          </button>
          {isMobile && (
            <button
              type="button"
              className="mq-acao"
              aria-expanded={moverAberto}
              aria-controls={idMover}
              onClick={() => setMoverAberto((v) => !v)}
              data-testid={`abrir-mover-fila-${p.id}`}
              style={{ flex: "1 1 104px", minHeight: alvo, padding: "0 10px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5, borderRadius: R.md, border: `1px solid ${T.bdark}`, background: moverAberto ? T.low : T.surface, color: T.text, fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
            >
              Mover…
              <ChevronDown aria-hidden="true" style={{ width: 13, height: 13, flexShrink: 0, transform: moverAberto ? "rotate(180deg)" : "none" }} />
            </button>
          )}
          {mostrarMover && (
          <div id={idMover} role="group" aria-label="Mover ou devolver" data-testid={idMover} style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", ...(isMobile ? { flex: "1 1 100%", width: "100%" } : { flex: "0 1 auto" }) }}>
          {isMobile && reservadas > 1 && (
            <label htmlFor={`qtd-mover-${p.id}`} style={{ flex: "1 1 0%", minWidth: 0, fontSize: 12, color: T.second, lineHeight: 1.3 }}>
              Quantas das {reservadas} un. (vazio = todas)
            </label>
          )}
          {reservadas > 1 && (
            <input
              id={`qtd-mover-${p.id}`}
              type="number" inputMode="numeric" pattern="[0-9]*" min={1} max={reservadas}
              value={qtd} placeholder={String(reservadas)}
              onChange={(e) => setQtd(e.target.value === "" ? "" : Math.max(0, parseInt(e.target.value) || 0))}
              aria-label={`Quantas das ${reservadas} un. mover ou devolver (vazio = todas)`}
              aria-invalid={!qtdValida || undefined}
              data-testid={`qtd-mover-fila-${p.id}`}
              style={{ width: isMobile ? 84 : 64, ...(isMobile ? { flex: "0 0 84px" } : {}), minHeight: alvo, height: alvo, boxSizing: "border-box", textAlign: "center", borderRadius: R.md, border: `1px solid ${qtdValida ? T.bdark : VERMELHO.border}`, background: T.surface, color: T.text, fontSize: isMobile ? 16 : 12, fontWeight: 700, padding: "0 6px" }}
            />
          )}
          <SeletorDeReserva valor={p.maquinaPrevista} excluir={p.maquinaPrevista} disabled={!qtdValida} alvo={alvo} isMobile={isMobile} testId={`mover-fila-${p.id}`} rotulo={qtd === "" ? "Mover para…" : `Mover ${qtd} para…`} onEscolher={(m) => onReservar(p, m, qtd === "" ? null : qtd)} />
          </div>
          )}
        </div>
      )}
      {podeAgir && ocupante && !selo && (
        <div data-testid={`fila-ocupada-${p.id}`} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span role="status" style={{ flex: "1 1 180px", fontSize: 12, color: AMBAR.text, fontWeight: 700, lineHeight: 1.4 }}>{motivoImpressoraOcupada(ocupante.displayId)}</span>
          {onTrocar && !confirmandoTroca && (
            <button type="button" className="mq-acao" disabled={mexendo} onClick={() => setConfirmandoTroca(true)} data-testid={`button-imprimir-no-lugar-fila-${p.id}`} style={{ opacity: mexendo ? 0.6 : 1, minHeight: alvo, padding: "0 12px", borderRadius: R.md, border: `1px solid ${T.text}`, background: T.surface, color: T.text, fontSize: isMobile ? 13 : 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", ...(isMobile ? { flex: "1 1 100%" } : {}) }}>
              Imprimir esta no lugar
            </button>
          )}
        </div>
      )}
      {confirmandoTroca && ocupante && onTrocar && (
        <div role="alertdialog" aria-label="Trocar a peça da impressora" data-testid={`confirmar-troca-fila-${p.id}`} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "8px 10px", borderRadius: R.md, background: AMBAR.bg, border: `1px solid ${AMBAR.border}`, color: "#92400e", fontSize: isMobile ? 13 : 12, lineHeight: 1.45 }}>
          <span style={{ flex: "1 1 200px", fontWeight: 700 }}>{perguntaDaTroca(ocupante, [p.displayId, `(${nomeDaPeca(p.tipo, p.descricao)})`].filter(Boolean).join(" "), p.maquinaPrevista ?? "")}</span>
          <button type="button" className="mq-acao mq-primario" disabled={mexendo} onClick={() => { setConfirmandoTroca(false); onTrocar(p, ocupante); }} data-testid={`button-trocar-fila-${p.id}`} style={{ opacity: mexendo ? 0.6 : 1, minHeight: alvo, padding: "0 14px", borderRadius: R.md, border: "none", background: T.text, color: "#fff", fontSize: isMobile ? 13 : 12, fontWeight: 700, cursor: "pointer", ...(isMobile ? { flex: "1 1 100%" } : {}) }}>Trocar</button>
          <button type="button" className="mq-acao" onClick={() => setConfirmandoTroca(false)} style={{ minHeight: alvo, padding: "0 12px", borderRadius: R.md, border: `1px solid ${T.bdark}`, background: T.surface, color: T.text, fontSize: isMobile ? 13 : 12, fontWeight: 700, cursor: "pointer", ...(isMobile ? { flex: "1 1 100%" } : {}) }}>Cancelar</button>
        </div>
      )}
    </div>
  );
}

/**
 * O fecho de uma lista: diz que ela ACABOU ("6 de 6 peças") ou quanto falta
 * ("Mostrando 20 de 143" + o botão). Sem ele a lista terminava colada na
 * borda e parecia cortada (dono, 21/09).
 */
function FechoDaLista({ visiveis, total, um, varios, lote, onMais, testId, botaoTestId, isMobile, estiloDoBotao }: {
  visiveis: number; total: number; um: string; varios: string; lote: number; onMais: () => void; testId: string; botaoTestId: string; isMobile: boolean; estiloDoBotao: React.CSSProperties;
}) {
  const tudo = visiveis >= total;
  return (
    <div data-testid={testId} data-fim={tudo || undefined} style={{ padding: tudo ? "8px 14px" : 12, borderTop: `1px solid ${T.low}`, background: T.bg, display: "flex", alignItems: "center", justifyContent: "center", gap: 12, flexWrap: "wrap" }}>
      <span style={{ fontSize: isMobile ? 12 : FS.small, color: T.second, fontVariantNumeric: "tabular-nums" }}>
        {tudo ? `${total} de ${total} ${total === 1 ? um : varios}` : `Mostrando ${visiveis} de ${total} ${varios}`}
      </span>
      {!tudo && (
        <button type="button" className="mq-acao" onClick={onMais} data-testid={botaoTestId} style={{ ...estiloDoBotao, ...(isMobile ? { flex: "1 1 100%", fontSize: 13 } : {}) }}>
          Mostrar mais {Math.min(lote, total - visiveis)}
        </button>
      )}
    </div>
  );
}

// ─── A peça dentro do cartão da impressora ────────────────────────────────────
function PecaNoCartao({ p, agora, podeAgir, hojeMs, isMobile, onAgir, onTirar, mexendo = false, emFoco = false }: {
  /** Veio da Gráfica por esta peça (?item=): realce. */
  emFoco?: boolean;
  p: PecaNaMaquina; agora: number; podeAgir: boolean; hojeMs: number; isMobile: boolean; onAgir: (p: PecaNaMaquina, trocar: boolean) => void;
  /** "Tirar da impressora": pausa a peça (as impressas ficam anotadas; o resto volta para o topo da fila dela). */
  onTirar?: (p: PecaNaMaquina) => void;
  /** Um gesto de tirar/trocar está em voo: nada de segundo disparo. */
  mexendo?: boolean;
}) {
  // Dividida: o cartão mostra e age sobre a PARTE desta impressora.
  // (Vale também com UMA parte só: a peça que iniciou apenas a parte reservada
  // a esta impressora tem teto menor que a peça.)
  // Os números saem de numerosDaImpressao (shared) — a MESMA conta da linha
  // da Gráfica e do modal. Com a peça por partes, os da parte desta impressora.
  const n = numerosDaImpressao(pecaParaOModal(p) as any, p.parte ? p.maquina : null);
  const dividida = n.daParte;
  const feitas = n.feitas;
  const teto = n.teto;
  const desde = haQuanto(p.desde, agora);
  const hora = horaDeInicio(p.desde);
  const selo = seloPecaEventoFinalizado(p.eventoInfo, hojeMs);
  const alvo = isMobile ? 44 : 34;
  const thumb = p.miniatura ? miniatura(convertGCSUrlToLocalPath(p.miniatura)) : undefined;
  const rotuloAcao = rotuloCurtoDaAcao(feitas, teto);
  const concluir = rotuloAcao !== "Impressas";
  // Parte desta impressora já esgotada (o servidor nem a manda mais como
  // "imprimindo"; guarda de um retrato antigo): sem ação de impressas.
  const parteEsgotada = dividida && feitas >= teto;
  const [semThumb, setSemThumb] = useState(false);
  // Celular (10/10 mobile, 21/09): cada ação ocupa a linha inteira do cartão
  // — três alvos de 44px empilhados, a principal em cima, sem dois botões
  // disputando 330px. No desktop dividem a linha como antes.
  const largura = (desktop: string): React.CSSProperties => ({ flex: isMobile ? "1 1 100%" : desktop });

  return (
    <div data-testid={`peca-na-maquina-${p.id}`} data-em-foco={emFoco || undefined} style={{ borderTop: `1px solid ${T.border}`, paddingTop: 10, display: "flex", flexDirection: "column", gap: 8, ...(emFoco ? { outline: `2px solid ${IMP.text}`, outlineOffset: 4, borderRadius: R.sm } : {}) }}>
      <div style={{ display: "flex", gap: 10, minWidth: 0 }}>
        {/* A arte em miniatura: é o que o galpão reconhece de relance. */}
        <div aria-hidden="true" style={{ width: 48, height: 48, borderRadius: R.md, background: T.low, border: `1px solid ${T.border}`, flexShrink: 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {thumb && !semThumb
            ? <img src={thumb} alt="" loading="lazy" decoding="async" onError={() => setSemThumb(true)} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            : <Printer style={{ width: 16, height: 16, color: T.muted }} />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* "#0386 Placa de octanorme (..." não pode cortar (dono, 21/09):
              o nome quebra em até duas linhas e só então reticencia. */}
          <TituloDaPeca id={p.id} codigo={p.displayId} tipo={p.tipo} descricao={p.descricao} isMobile={isMobile} testId={`nome-peca-${p.id}`} />
          {(p.evento || apoioDaPeca(p)) && (
            <div title={[p.evento, apoioDaPeca(p)].filter(Boolean).join(" · ")} style={{ fontSize: isMobile ? 12 : FS.small, color: T.second, marginTop: 2, lineHeight: 1.35, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflowWrap: "anywhere" }}>
              {[p.evento, apoioDaPeca(p)].filter(Boolean).join(" · ")}
            </div>
          )}
          <div style={{ fontSize: isMobile ? 12 : FS.small, color: T.second, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
            {hora ? `Desde ${hora}` : "Na máquina"}{desde ? ` · ${desde}` : ""}
          </div>
        </div>
      </div>

      {/* Progresso: o número em palavras (o que se lê) e a barra (o que se vê de longe). */}
      <div>
        <div data-testid={`progresso-${p.id}`} style={{ fontSize: isMobile ? 12 : FS.small, fontWeight: 700, color: IMP.text, fontVariantNumeric: "tabular-nums" }}>
          {dividida
            ? `${feitas} de ${teto} nesta impressora · peça ${n.feitasDaPeca} de ${n.tetoDaPeca} no total`
            : n.frase}
        </div>
        <BarraDeImpressao feitas={feitas} teto={teto} rotulo={`${p.displayId ?? "peça"}: ${feitas} de ${teto} impressas${dividida ? " nesta impressora" : ""}`} />
      </div>

      {/* Ações: a principal (o mesmo modal da fila), a troca de máquina
          (dono, 21/09: "não consigo trocar de máquina um item") e a volta
          para a Gráfica. */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {podeAgir && !parteEsgotada && (
          <button
            type="button"
            className="mq-acao mq-primario"
            onClick={() => { if (!selo) onAgir(p, false); }}
            disabled={!!selo}
            data-testid={`button-impressas-${p.id}`}
            title={selo
              ? motivoAcaoBloqueada(selo.motivo, "informar impressas")
              : concluir ? `Todas as ${teto} saíram${dividida ? " desta impressora" : " — mandar a peça para o acabamento"}` : `Informar quantas já saíram da ${rotuloDaMaquina(p.maquina)} (${progressoDaImpressao(feitas, teto)})`}
            style={{ ...largura("1 1 140px"), minHeight: alvo, padding: "0 12px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: R.md, border: selo ? `1px solid ${T.border}` : "none", background: selo ? T.low : T.text, color: selo ? "#746e69" : "#fff", fontFamily: GROTESK, fontSize: isMobile ? 13 : 12, fontWeight: 700, cursor: selo ? "not-allowed" : "pointer", whiteSpace: "nowrap" }}
          >
            <Play aria-hidden="true" style={{ width: 12, height: 12, flexShrink: 0 }} />
            {rotuloAcao}
          </button>
        )}
        {podeAgir && (
          <button
            type="button"
            className="mq-acao"
            onClick={() => { if (!selo) onAgir(p, true); }}
            disabled={!!selo}
            data-testid={`button-trocar-maquina-${p.id}`}
            title={selo ? motivoAcaoBloqueada(selo.motivo, "trocar de máquina") : `Mover esta peça da ${rotuloDaMaquina(p.maquina)} para outra impressora`}
            style={{ ...largura("1 1 120px"), minHeight: alvo, padding: "0 10px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5, borderRadius: R.md, border: `1px solid ${T.bdark}`, background: T.surface, color: selo ? "#746e69" : T.text, fontSize: isMobile ? 13 : 12, fontWeight: 700, cursor: selo ? "not-allowed" : "pointer", whiteSpace: "nowrap" }}
          >
            <ArrowLeftRight aria-hidden="true" style={{ width: 12, height: 12, color: T.accentText, flexShrink: 0 }} />
            Trocar de máquina
          </button>
        )}
        {podeAgir && onTirar && !parteEsgotada && (
          <button
            type="button"
            className="mq-acao"
            // SEM o bloqueio de evento finalizado (selo): tirar não faz trabalho
            // andar, só recua — e a peça de evento já realizado travaria a
            // impressora para sempre. O servidor também não barra quem SAI.
            onClick={() => onTirar(p)}
            disabled={mexendo}
            aria-busy={mexendo || undefined}
            data-testid={`button-tirar-da-impressora-${p.id}`}
            title={`Tirar da ${rotuloDaMaquina(p.maquina)}: o que já saiu fica anotado e o resto volta para o topo da fila dela — a impressora fica livre`}
            style={{ ...largura("1 1 120px"), minHeight: alvo, padding: "0 10px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5, borderRadius: R.md, border: `1px solid ${T.bdark}`, background: T.surface, color: T.text, fontSize: isMobile ? 13 : 12, fontWeight: 700, cursor: mexendo ? "wait" : "pointer", opacity: mexendo ? 0.6 : 1, whiteSpace: "nowrap" }}
          >
            Tirar da impressora
          </button>
        )}
        <Link
          href={linkDaPecaNaGrafica(p.id)}
          className="mq-acao"
          data-testid={`link-peca-grafica-${p.id}`}
          title="Abrir esta peça na fila da Gráfica"
          style={{ ...largura(podeAgir ? "1 1 110px" : "1 1 140px"), minHeight: alvo, padding: "0 10px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5, borderRadius: R.md, border: `1px solid ${T.bdark}`, background: T.surface, color: T.text, fontSize: isMobile ? 13 : 12, fontWeight: 700, textDecoration: "none", whiteSpace: "nowrap" }}
        >
          <ExternalLink aria-hidden="true" style={{ width: 12, height: 12, color: T.accentText }} />
          Ver na Gráfica
        </Link>
      </div>
      {selo && (
        <div data-testid={`selo-evento-${p.id}`} title={selo.hint} style={{ fontSize: isMobile ? 12 : FS.small, color: selo.text, fontWeight: 700 }}>
          {selo.label} — {selo.hint}
        </div>
      )}
    </div>
  );
}

// ─── Linha do diário (memoizada: pode haver centenas) ─────────────────────────
// Sem botão por linha (dono, 21/09: "veja se esse botão Impressas está
// fazendo sentido"): cada registro repetia a ação da MESMA peça, e a coluna
// extra estourava a tabela. A ação mora no cartão da impressora, uma vez.
//
// Três densidades (a largura ÚTIL decide, não a do navegador — com o menu
// lateral aberto a 1280px sobram ~1040px): cartão abaixo de 820px; tabela
// compacta (Evento embaixo da Peça) até 1180px; tabela cheia acima. Em
// nenhuma delas uma coluna corta texto — as células quebram linha.
const LinhaDoDiario = memo(function LinhaDoDiario({ l, mostrarMaquina, isMobile, emCartao, compacto }: {
  l: Linha; mostrarMaquina: boolean; isMobile: boolean; emCartao: boolean; compacto: boolean;
}) {
  const meta = TIPO_DO_REGISTRO[l.tipo] ?? TIPO_DO_REGISTRO.parcial;
  const texto = oQueAconteceu(l, l.rotuloMaquina);

  if (emCartao) {
    return (
      <div data-testid={`linha-diario-${l.id}`} style={{ padding: "10px 14px", borderTop: `1px solid ${T.low}`, display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontFamily: MONO, fontSize: 12, color: T.second, fontVariantNumeric: "tabular-nums" }}>{l.hora}</span>
          <Pilula pal={meta.pal} fonte={isMobile ? 12 : FS.small}>{meta.rotulo}</Pilula>
          {mostrarMaquina && <span style={{ fontSize: 12, color: T.second }}>{l.rotuloMaquina}</span>}
        </div>
        <div style={{ fontSize: 13, color: T.text, fontWeight: 700 }}>{texto}</div>
        <TituloDaPeca id={l.itemId} codigo={l.displayId} tipo={l.tipoPeca} descricao={l.descricaoPeca} isMobile fonte={13} testId={`nome-diario-${l.id}`} />
        {l.evento && <span style={{ fontSize: 12, color: T.second, overflowWrap: "anywhere" }}>{l.evento}</span>}
        <span style={{ fontSize: 12, color: T.second }}>{l.quem ?? "—"}</span>
      </div>
    );
  }

  const td: React.CSSProperties = { padding: "8px 12px", verticalAlign: "top", lineHeight: 1.35 };
  const fixo: React.CSSProperties = { ...td, whiteSpace: "nowrap" };
  return (
    <tr className="mq-linha" data-testid={`linha-diario-${l.id}`} style={{ borderTop: `1px solid ${T.low}` }}>
      <td style={{ ...fixo, fontFamily: MONO, fontVariantNumeric: "tabular-nums", color: T.second }}>{l.hora}</td>
      {mostrarMaquina && <td style={{ ...td, color: T.second, minWidth: 110, overflowWrap: "anywhere" }}>{l.rotuloMaquina}</td>}
      <td style={{ ...td, minWidth: 160, overflowWrap: "anywhere" }}>
        <TituloDaPeca id={l.itemId} codigo={l.displayId} tipo={l.tipoPeca} descricao={l.descricaoPeca} isMobile={false} emLinha fonte={12.5} testId={`nome-diario-${l.id}`} />
        {compacto && l.evento && <div style={{ fontSize: FS.small, color: T.second, marginTop: 2 }}>{l.evento}</div>}
      </td>
      {!compacto && <td style={{ ...td, color: T.second, minWidth: 120, overflowWrap: "anywhere" }}>{l.evento ?? "—"}</td>}
      <td style={{ ...td, minWidth: 200 }}>
        <span style={{ display: "inline-flex", alignItems: "flex-start", gap: 8, flexWrap: "wrap" }}>
          <Pilula pal={meta.pal} fonte={isMobile ? 12 : FS.small}>{meta.rotulo}</Pilula>
          <span style={{ fontWeight: l.tipo === "parcial" || l.tipo === "conclusao" ? 700 : 500, color: T.text, overflowWrap: "anywhere" }}>{texto}</span>
        </span>
      </td>
      <td style={{ ...td, color: T.second, overflowWrap: "anywhere" }}>{l.quem ?? "—"}</td>
    </tr>
  );
});

// ─── O resumo do período, por dia × impressora ────────────────────────────────
// (dono, 21/09: "não tem relatório diário"). Num dia só, uma tabela com as
// quatro impressoras e o total; em semana/mês/intervalo, um bloco por dia. Em
// tela estreita, cartões — os mesmos números, sem coluna cortada.
function ResumoDoPeriodo({ dias, emCartoes, isMobile, hoje, onVerDiario }: {
  dias: ResumoDoDia[]; emCartoes: boolean; isMobile: boolean; hoje: string; onVerDiario: (dia: string, maquina: string) => void;
}) {
  const th: React.CSSProperties = { padding: "9px 12px", ...ROTULO_MICRO, whiteSpace: "nowrap", textAlign: "left" };
  const td: React.CSSProperties = { padding: "9px 12px", verticalAlign: "middle", fontVariantNumeric: "tabular-nums", color: T.text };
  const num: React.CSSProperties = { ...td, textAlign: "right", whiteSpace: "nowrap" };
  const semUso = (m: ResumoDaMaquinaNoDia) => !m.primeira;

  if (emCartoes) {
    return (
      <div data-testid="resumo-cartoes" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {dias.map((d) => (
          <div key={d.dia} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontFamily: GROTESK, fontWeight: 800, fontSize: FS.body, color: T.text }}>{rotuloDoDia(d.dia, hoje)}</span>
              <span style={{ fontSize: isMobile ? 12 : FS.small, color: T.second, fontVariantNumeric: "tabular-nums" }}>
                {plural(d.total.unidades, "un. impressa", "un. impressas")} · {plural(d.total.pecas, "peça", "peças")} · {plural(d.total.concluidas, "concluída", "concluídas")}
              </span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 8 }}>
              {d.maquinas.map((m) => (
                <button
                  key={m.maquina}
                  type="button"
                  className="mq-acao"
                  onClick={() => onVerDiario(d.dia, m.maquina)}
                  data-testid={`resumo-${d.dia}-${m.maquina}`}
                  title={`Ver o diário da ${m.rotulo} em ${diaBR(d.dia)}`}
                  style={{ textAlign: "left", background: T.surface, border: `1px solid ${T.border}`, borderRadius: R.md, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 4, cursor: "pointer", minHeight: 44, color: T.text, opacity: semUso(m) ? 0.7 : 1 }}
                >
                  <span style={{ fontWeight: 700, fontSize: FS.body, overflowWrap: "anywhere" }}>{m.rotulo}</span>
                  {semUso(m) ? (
                    <span style={{ fontSize: isMobile ? 12 : FS.small, color: T.second }}>Sem atividade</span>
                  ) : (
                    <>
                      <span style={{ fontSize: isMobile ? 12 : FS.small, color: T.second, fontVariantNumeric: "tabular-nums" }}>
                        <strong style={{ color: IMP.text }}>{m.unidades} un.</strong> · {plural(m.pecas, "peça", "peças")} · {m.concluidas} concl. · {m.aindaNaMaquina} na máquina
                      </span>
                      <span style={{ fontSize: isMobile ? 12 : FS.small, color: T.second, fontVariantNumeric: "tabular-nums" }}>
                        {m.primeira} → {m.ultima} · {duracaoCurta(m.minutosAtivos)}{m.quem.length ? ` · ${m.quem.join(", ")}` : ""}
                      </span>
                    </>
                  )}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table data-testid="resumo-tabela" style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
        <thead>
          <tr style={{ color: T.second, background: T.bg }}>
            {dias.length > 1 && <th scope="col" style={th}>Dia</th>}
            <th scope="col" style={th}>Impressora</th>
            <th scope="col" style={{ ...th, textAlign: "right" }}>Unidades</th>
            <th scope="col" style={{ ...th, textAlign: "right" }}>Peças</th>
            <th scope="col" style={{ ...th, textAlign: "right" }}>Concluídas</th>
            <th scope="col" style={{ ...th, textAlign: "right" }}>Na máquina</th>
            <th scope="col" style={th}>Atividade</th>
            <th scope="col" style={{ ...th, textAlign: "right" }}>Tempo ativo</th>
            <th scope="col" style={th}>Quem</th>
          </tr>
        </thead>
        <tbody>
          {dias.map((d) => (
            <Fragment key={d.dia}>
              {d.maquinas.map((m, i) => (
                <tr key={`${d.dia}-${m.maquina}`} className="mq-linha" data-testid={`resumo-${d.dia}-${m.maquina}`} style={{ borderTop: `1px solid ${T.low}`, color: semUso(m) ? T.second : T.text }}>
                  {dias.length > 1 && (
                    <td style={{ ...td, whiteSpace: "nowrap", fontWeight: 700 }}>{i === 0 ? rotuloDoDia(d.dia, hoje) : ""}</td>
                  )}
                  <td style={{ ...td, minWidth: 140 }}>
                    <button type="button" className="mq-link" onClick={() => onVerDiario(d.dia, m.maquina)} title={`Ver o diário da ${m.rotulo} em ${diaBR(d.dia)}`} style={{ border: "none", background: "transparent", padding: 0, font: "inherit", fontWeight: 700, color: "inherit", cursor: "pointer", textAlign: "left", overflowWrap: "anywhere" }}>
                      {m.rotulo}
                    </button>
                  </td>
                  <td style={{ ...num, fontWeight: 700, color: m.unidades > 0 ? IMP.text : "inherit" }}>{m.unidades}</td>
                  <td style={num}>{m.pecas}</td>
                  <td style={num}>{m.concluidas}</td>
                  <td style={num}>{m.aindaNaMaquina}</td>
                  <td style={{ ...td, whiteSpace: "nowrap", fontFamily: MONO, color: "inherit" }}>{m.primeira ? `${m.primeira} → ${m.ultima}` : "—"}</td>
                  <td style={num}>{duracaoCurta(m.minutosAtivos)}</td>
                  <td style={{ ...td, color: T.second, overflowWrap: "anywhere" }}>{m.quem.join(", ") || "—"}</td>
                </tr>
              ))}
              <tr key={`${d.dia}-total`} data-testid={`resumo-${d.dia}-total`} style={{ borderTop: `1px solid ${T.border}`, background: T.low, fontWeight: 800 }}>
                {dias.length > 1 && <td style={td} />}
                <td style={{ ...td, ...ROTULO_MICRO, color: T.text }}>{dias.length > 1 ? "Total do dia" : "Total"}</td>
                <td style={{ ...num, color: IMP.text }}>{d.total.unidades}</td>
                <td style={num}>{d.total.pecas}</td>
                <td style={num}>{d.total.concluidas}</td>
                <td style={num}>{d.total.aindaNaMaquina}</td>
                <td style={td} />
                <td style={num}>{duracaoCurta(d.total.minutosAtivos)}</td>
                <td style={td} />
              </tr>
            </Fragment>
          ))}
        </tbody>
      </table>
      <div data-testid="fecho-resumo" style={{ padding: "8px 14px", borderTop: `1px solid ${T.low}`, background: T.bg, textAlign: "center", fontSize: FS.small, color: T.second, fontVariantNumeric: "tabular-nums" }}>
        {dias.length === 1 ? "Fim do resumo do dia" : `Fim do resumo · ${dias.length} dias`}
      </div>
    </div>
  );
}

// ─── Linha da fila geral (memoizada: a fila passa de 300 peças) ───────────────
// Celular (390px): os DADOS em cima (caixa de seleção + código/peça/evento/m²,
// o direcionamento "20 → Impressora 1 · 14 sem impressora" quebrando linha e o
// prazo logo abaixo, sem linha própria); os CONTROLES embaixo — impressora na
// linha inteira, depois quantidade + "Reservar" lado a lado. Desktop: tudo
// numa linha, como antes.
const LOTE_DA_FILA = 20;
/** Celular: quantas peças da fila de UM cartão ficam à vista antes do "Ver as N". */
const FILA_DO_CARTAO_NO_CELULAR = 3;
/** Desktop: passa disso, o cartão ganha "Ver as N da fila" — um cartão não vira parede ao lado de um "Livre". */
const FILA_DO_CARTAO_NO_DESKTOP = 5;
const LinhaDaFilaGeral = memo(function LinhaDaFilaGeral({ p, marcada, podeAgir, ocupado, hojeMs, isMobile, ocupacao, imprimindo, onAlternar, onReservar, onImprimir, onTrocar }: {
  p: PecaNaFila; marcada: boolean; podeAgir: boolean; ocupado: boolean; hojeMs: number; isMobile: boolean;
  ocupacao: OcupacaoDasImpressoras; imprimindo: boolean;
  onAlternar: (id: string) => void; onReservar: (id: string, maquina: string, quantidade: number) => void;
  onImprimir: (p: PecaNaFila, maquina: string, quantidade: number) => void;
  onTrocar: (p: PecaNaFila, maquina: string, quantidade: number | null, sai: OcupanteDaImpressora) => void;
}) {
  const alvo = isMobile ? 44 : 34;
  const fonte = isMobile ? 12 : FS.small;
  const selo = seloPecaEventoFinalizado(p.eventoInfo, hojeMs);
  const prazo = prazoDaPeca(p.saidaCaminhao, p.prazoProducaoGrafica);
  const direcionamento = textoDoDirecionamento(p.reserva, p.semImpressora, p.imprimindoEm);
  return (
    <div data-testid={`fila-peca-${p.id}`} className="mq-peca" style={{ display: "flex", alignItems: isMobile ? "flex-start" : "center", gap: isMobile ? 8 : 10, padding: isMobile ? "10px 12px" : "6px 14px", borderTop: `1px solid ${T.low}`, flexWrap: "wrap" }}>
      {podeAgir && (
        <label style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minHeight: alvo, minWidth: isMobile ? 44 : 28, flexShrink: 0, cursor: selo ? "not-allowed" : "pointer" }}>
          <input type="checkbox" checked={marcada} disabled={!!selo} onChange={() => onAlternar(p.id)} aria-label={`Selecionar ${p.displayId ?? "peça"}`} data-testid={`selecionar-fila-${p.id}`} style={{ width: isMobile ? 22 : 18, height: isMobile ? 22 : 18, accentColor: T.text }} />
        </label>
      )}
      <div data-testid={`fila-dados-${p.id}`} style={{ flex: isMobile ? "1 1 0%" : "1 1 220px", minWidth: 0, color: T.text, display: "flex", flexDirection: "column", gap: 2, minHeight: isMobile ? 44 : undefined, justifyContent: "center" }}>
        <TituloDaPeca id={p.id} codigo={p.displayId} tipo={p.tipo} descricao={p.descricao} isMobile={isMobile} testId={`nome-fila-geral-${p.id}`} />
        <span style={{ fontSize: fonte, color: T.second, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflowWrap: "anywhere" }}>
          {[p.evento, `${p.aImprimir} un.`, p.m2 != null ? `${p.m2.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m²` : null].filter(Boolean).join(" · ")}
        </span>
        {apoioDaPeca(p) && (
          <span data-testid={`apoio-${p.id}`} style={{ fontSize: fonte, color: T.second, overflowWrap: "anywhere", lineHeight: 1.35 }}>{apoioDaPeca(p)}</span>
        )}
        {direcionamento && (
          <span data-testid={`direcionado-${p.id}`} style={{ fontSize: fonte, color: IMP.text, fontWeight: 700, fontVariantNumeric: "tabular-nums", overflowWrap: "anywhere", lineHeight: 1.35 }}>
            {direcionamento}
          </span>
        )}
        {isMobile && <span style={{ display: "flex", marginTop: 2 }}><SeloDePrazo p={prazo} fonte={fonte} /></span>}
      </div>
      {!isMobile && <SeloDePrazo p={prazo} fonte={fonte} />}
      {selo && isMobile && (
        <span data-testid={`fila-bloqueada-${p.id}`} style={{ flex: "1 1 100%", fontSize: 12, fontWeight: 700, color: selo.text }}>{selo.label} — {selo.hint}</span>
      )}
      {podeAgir && (
        <ControleDeReserva id={p.id} codigoDaPeca={[p.displayId, `(${nomeDaPeca(p.tipo, p.descricao)})`].filter(Boolean).join(" ")} semImpressora={p.semImpressora ?? p.aImprimir} disabled={!!selo || ocupado} alvo={alvo} isMobile={isMobile} ocupacao={ocupacao} imprimindo={imprimindo} onReservar={(m, n) => onReservar(p.id, m, n)} onImprimir={(m, n) => onImprimir(p, m, n)} onTrocar={(m, n, sai) => onTrocar(p, m, n, sai)} />
      )}
    </div>
  );
});

// ─── A página ─────────────────────────────────────────────────────────────────
export default function GraficaMaquinas() {
  const isMobile = useIsMobile();
  const { user } = useAuth();
  // Quem AGE: os mesmos papéis que os endpoints aceitam (grafica e admin). A
  // Solicitação vê a tela, mas não informa impressas — os botões nem aparecem.
  const podeAgir = user?.role === "grafica" || user?.role === "admin";
  const alvo = isMobile ? 44 : 34;

  // ── Recorte na URL: ?dia=AAAA-MM-DD&maquina=N ─────────────────────────────
  const search = useSearch();
  const [, navegar] = useLocation();
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const diaEscolhido = params.get("dia");          // null = hoje (o servidor decide o fuso)
  const maquinaFiltro = params.get("maquina") ?? ""; // "" = todas
  // VINDO DA GRÁFICA (21/09): ?foco=N põe o cartão da Impressora N em foco na
  // aba Agora (rola até ele e realça); ?item= realça a peça dentro dele.
  const focoDaURL = params.get("foco");
  const maquinaEmFoco = focoDaURL && MAQUINAS_DE_IMPRESSAO.includes(focoDaURL) ? focoDaURL : null;
  const itemEmFoco = params.get("item");
  // O recorte do resumo/exportação: ?periodo=dia|semana|mes|intervalo (&de=&ate= no intervalo).
  const periodoDaURL = params.get("periodo");
  const periodo: Periodo = periodoDaURL === "semana" || periodoDaURL === "mes" || periodoDaURL === "intervalo" ? periodoDaURL : "dia";
  const deDaURL = params.get("de");
  const ateDaURL = params.get("ate");
  // A aba (dono, 21/09: "deixe isso em outra aba da tela"): agora | diario | resumo.
  const abaDaURL = params.get("aba");
  const aba: Aba = abaDaURL === "diario" || abaDaURL === "resumo" ? abaDaURL : "agora";
  const escreverURL = (mudancas: Record<string, string | null>) => {
    const p = new URLSearchParams(search);
    for (const [k, v] of Object.entries(mudancas)) { if (v) p.set(k, v); else p.delete(k); }
    const qs = p.toString();
    navegar(`/grafica/maquinas${qs ? `?${qs}` : ""}`, { replace: true });
  };

  // ── Dados ─────────────────────────────────────────────────────────────────
  // A chave é [rota, "?dia=…"]: o queryFn padrão junta as duas sem barra, e a
  // invalidação por prefixo ("/api/grafica/maquinas" — WebSocket e modal de
  // impressão) alcança qualquer dia aberto.
  const { data, isLoading, isError, error, isFetching, refetch, dataUpdatedAt } = useQuery<Retrato>({
    queryKey: diaEscolhido ? ["/api/grafica/maquinas", `?dia=${diaEscolhido}`] : ["/api/grafica/maquinas"],
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 15_000,
  });

  // Aviso de lentidão só no carregamento INICIAL (depois há dado na tela).
  // Rolagem até o diário DEPOIS de a aba montar (o clique só escreve a URL;
  // rolar no clique achava um título que ainda não existia).
  useEffect(() => {
    if (aba === "diario" && maquinaFiltro) rolarAte("titulo-dia");
  }, [aba, maquinaFiltro]);

  useEffect(() => {
    if (aba !== "agora" || !maquinaEmFoco || !data) return;
    const el = document.querySelector<HTMLElement>(`[data-testid="maquina-agora-${maquinaEmFoco}"]`);
    el?.scrollIntoView?.({ block: "center" });
  }, [aba, maquinaEmFoco, !!data]);

  const [lento, setLento] = useState(false);
  useEffect(() => {
    if (!isLoading) return;
    const t = setTimeout(() => setLento(true), LENTO_APOS_MS);
    return () => clearTimeout(t);
  }, [isLoading]);

  // Relógio da tela (para "há 1h 20min"): anda junto com cada chegada de dado
  // e a cada minuto — sem tique por segundo.
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    setAgora(Date.now());
    const t = setInterval(() => setAgora(Date.now()), 60_000);
    return () => clearInterval(t);
  }, [dataUpdatedAt]);

  // ── O modal de impressão (o mesmo da fila) ────────────────────────────────
  // `trocar` abre direto no painel de impressora (ação "Trocar de máquina" do cartão).
  // `maquinaInicial`: peça reservada abre em "Iniciar impressão" já com a
  // impressora marcada (o servidor limpa a reserva ao iniciar).
  const [pecaNoModal, setPecaNoModal] = useState<{ peca: PecaNaMaquina; trocar: boolean; maquinaInicial: string | null; parte?: { quantidade: number; daReserva: boolean } | null } | null>(null);
  const itemDoModal = useMemo(() => (pecaNoModal ? pecaParaOModal(pecaNoModal.peca) : null), [pecaNoModal]);
  const abrirModal = (peca: PecaNaMaquina, trocar: boolean) => setPecaNoModal({ peca, trocar, maquinaInicial: null });
  // Do cartão: inicia SÓ a parte reservada àquela impressora (o servidor
  // consome essa reserva; as outras da peça continuam valendo).
  const iniciarDaFila = (p: PecaNaFila) => setPecaNoModal({ peca: p, trocar: false, maquinaInicial: p.maquinaPrevista, parte: p.reservadas != null ? { quantidade: p.reservadas, daReserva: true } : null });
  const hojeMs = todayBusinessMs();

  // ── Reservar impressora (fila geral ↔ fila da impressora) ─────────────────
  const reserva = useReservarImpressora();
  const reservar = (itemIds: string[], maquina: string | null, quantidade?: number | null, deMaquina?: string | null) => { if (itemIds.length) reserva.mutate({ itemIds, maquina, quantidade, deMaquina }); };
  // Seleção em lote da fila geral: só ids; some ao mudar o recorte do retrato.
  const [selecionadas, setSelecionadas] = useState<Set<string>>(() => new Set());
  const filaGeral = useMemo(() => ordenarFila(data?.filaGeral ?? []), [data?.filaGeral]);
  const idsDaFila = useMemo(() => new Set(filaGeral.map((p) => p.id)), [filaGeral]);
  const selecionadasVivas = useMemo(() => Array.from(selecionadas).filter((id) => idsDaFila.has(id)), [selecionadas, idsDaFila]);
  // Estáveis (useCallback + ref): a linha da fila é memoizada, e uma função
  // nova a cada render redesenharia as 300 linhas a cada marcação.
  const alternar = useCallback((id: string) => setSelecionadas((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; }), []);
  const reservarRef = useRef(reservar);
  reservarRef.current = reservar;
  const reservarDaLinha = useCallback((id: string, maquina: string, quantidade: number) => reservarRef.current([id], maquina, quantidade), []);

  // ── "Imprimir agora" (dono, 21/09: "quando a impressora estiver vazia, eu
  // poder colocar direto para impressão, e não só reservar") ────────────────
  // O MESMO start-printing do modal, sem abri-lo: a peça inteira (payload de
  // sempre) quando vai tudo, ou só a parte (`iniciarParte` + `quantidade`).
  // UMA RÉGUA SÓ (21/09): quem ocupa cada impressora sai de
  // ocupacaoDasImpressoras (shared) — a mesma do servidor e do modal da
  // Gráfica. Antes era "tem peça no cartão": a peça com 10 de 10 esperando
  // "Mandar p/ acabamento" ocupava a impressora aqui e não na Gráfica.
  const pecasEmImpressao = useMemo(() => {
    const porId = new Map<string, PecaNaMaquina>();
    for (const m of data?.maquinas ?? []) for (const x of m.imprimindo) if (!porId.has(x.id)) porId.set(x.id, x);
    for (const x of data?.semMaquina ?? []) if (!porId.has(x.id)) porId.set(x.id, x);
    return Array.from(porId.values());
  }, [data]);
  const ocupantes = useMemo(() => ocupacaoDasImpressoras(pecasEmImpressao.map(pecaParaOModal) as any), [pecasEmImpressao]);
  const ocupacao = useMemo<OcupacaoDasImpressoras>(() => {
    const o: OcupacaoDasImpressoras = {};
    for (const m of MAQUINAS_DE_IMPRESSAO) {
      const a = ocupantes[m];
      o[m] = { n: a ? 1 : 0, primeira: a?.displayId ?? null, atual: a ?? null };
    }
    return o;
  }, [ocupantes]);
  const imprimirAgora = useMutation({
    mutationFn: async ({ peca, maquina, quantidade }: { peca: PecaNaFila; maquina: string; quantidade: number }) => {
      const livre = (peca.semImpressora ?? peca.aImprimir) + Object.values(peca.reserva ?? {}).reduce((t, x) => t + x, 0);
      const inteira = peca.status !== "inProduction" && peca.status !== "em_producao" && quantidade === livre && (peca.imprimindoEm ?? []).length === 0;
      return await apiRequest("PATCH", `/api/items/${peca.id}/start-printing`, inteira ? { printMachine: maquina } : { printMachine: maquina, iniciarParte: true, quantidade });
    },
    onSuccess: (_r, v) => {
      invalidarGraficaEMaquinas();
      toast({ title: `${v.peca.displayId ?? "Peça"} ${nomeDaPeca(v.peca.tipo, v.peca.descricao)}: ${v.quantidade} un. em impressão na ${rotuloDaMaquina(v.maquina)}`, description: "Conforme as unidades saírem, informe as impressas no cartão da impressora." });
    },
    onError: (error: Error) => {
      invalidarGraficaEMaquinas();
      toast({ title: "Não foi possível iniciar a impressão", description: mensagemDeErroDaApi(error), variant: "destructive" });
    },
  });
  // ── TIRAR da impressora / TROCAR por prioridade (uma peça por vez) ────────
  // A mesma mutation do modal compartilhado (useMexerNaImpressora).
  const mexerNaImpressora = useMexerNaImpressora();
  // DUPLO DISPARO: a trava por ref vale ANTES do próximo render (duplo clique,
  // Enter segurado); o isPending desabilita os botões enquanto o gesto voa.
  const travaDaImpressoraRef = useRef(false);
  const mexer = (v: { maquina: string; sai: OcupanteDaImpressora; entra?: PecaNaFila | null; quantidade?: number | null }) => {
    if (travaDaImpressoraRef.current || mexerNaImpressora.isPending) return;
    travaDaImpressoraRef.current = true;
    mexerNaImpressora.mutate(v, { onSettled: () => { travaDaImpressoraRef.current = false; } });
  };
  const mexerRef = useRef(mexer);
  mexerRef.current = mexer;
  const trocarDaLinha = useCallback((entra: PecaNaFila, maquina: string, quantidade: number | null, sai: OcupanteDaImpressora) => mexerRef.current({ maquina, sai, entra, quantidade }), []);
  // [modal] impressoras ocupadas → código da peça que está nelas.
  // O MESMO `ocupadas` que a Gráfica passa ao modal: o ocupante inteiro
  // (com ele o modal oferece "Imprimir esta no lugar"), menos a própria peça.
  const ocupadasParaOModal = useMemo(
    () => ocupacaoDasImpressoras(pecasEmImpressao.map(pecaParaOModal) as any, pecaNoModal?.peca.id ?? null),
    [pecasEmImpressao, pecaNoModal],
  );
  const imprimirRef = useRef(imprimirAgora.mutate);
  imprimirRef.current = imprimirAgora.mutate;
  const imprimirDaLinha = useCallback((peca: PecaNaFila, maquina: string, quantidade: number) => imprimirRef.current({ peca, maquina, quantidade }), []);
  const imprimindoId = imprimirAgora.isPending ? imprimirAgora.variables?.peca.id ?? null : null;
  // A fila entra em LOTES (eram 20 e depois "todas": 300+ linhas com select e
  // campo cada travavam o celular). Cada toque traz mais um lote.
  const [filaVisiveis, setFilaVisiveis] = useState(LOTE_DA_FILA);
  // Fila de cada cartão no celular: as primeiras à vista, o resto sob pedido.
  const [filasAbertas, setFilasAbertas] = useState<Set<string>>(() => new Set());
  // O seletor de peça de um cartão "Livre": qual impressora está escolhendo.
  const [seletorDaMaquina, setSeletorDaMaquina] = useState<string | null>(null);

  // ── A FICHA da peça (dono, 21/09: "quando clicar, abrir o card com as
  // informações do item") — a MESMA da Gráfica. A peça completa vem, sob
  // demanda, da lista que a Gráfica já usa (/api/items/approved: toda peça
  // desta tela está nela); o histórico, do mesmo endpoint com escopo na peça.
  const [fichaId, setFichaId] = useState<string | null>(null);
  const abrirFicha = useCallback((id: string) => setFichaId(id), []);
  const pecasDaGrafica = useQuery<any[]>({ queryKey: ["/api/items/approved"], enabled: !!fichaId, staleTime: 30_000 });
  const itemDaFicha = useMemo(
    () => (fichaId ? (Array.isArray(pecasDaGrafica.data) ? pecasDaGrafica.data : []).find((i: any) => i?.id === fichaId) ?? null : null),
    [fichaId, pecasDaGrafica.data],
  );
  const historicoDaFicha = useQuery<any[]>({
    queryKey: ["/api/audit-logs", "item", fichaId],
    queryFn: () => fetch(`/api/audit-logs?entityType=item&entityId=${fichaId}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Falha ao carregar o histórico (HTTP ${r.status})`)))),
    select: (d) => (Array.isArray(d) ? d : []),
    enabled: !!itemDaFicha,
    placeholderData: [],
  });
  const maquinaDoSeletor = useMemo(() => {
    const m = (data?.maquinas ?? []).find((x) => x.codigo === seletorDaMaquina);
    return m ? { codigo: m.codigo, rotulo: m.rotulo, naFila: m.naFila ?? [] } : null;
  }, [data, seletorDaMaquina]);

  // ── Derivados ─────────────────────────────────────────────────────────────
  const hoje = data?.hoje ?? null;
  const dia = data?.dia ?? diaEscolhido;
  const ehHoje = !!hoje && dia === hoje;
  const maquinas = data?.maquinas ?? [];
  // PEÇAS, não linhas de cartão: a peça dividida aparece no cartão de cada
  // impressora, mas é UMA peça — o mesmo número do card "Em Impressão" da Gráfica.
  const totalImprimindo = pecasEmImpressao.length;
  // "Liberados" da Gráfica = peças liberadas, com ou sem impressora reservada.
  // Aqui elas se dividem entre a fila geral e as filas dos cartões (a mesma
  // peça pode estar nas duas, com unidades diferentes) — o número é o de lá.
  const liberadasNaTela = useMemo(() => {
    const ids = new Set<string>();
    const lib = (x: { id: string; status: string }) => { if (x.status !== "inProduction" && x.status !== "em_producao") ids.add(x.id); };
    for (const x of data?.filaGeral ?? []) lib(x);
    for (const m of data?.maquinas ?? []) for (const x of m.naFila ?? []) lib(x);
    return ids.size;
  }, [data]);
  const totalReservadas = maquinas.reduce((s, m) => s + (m.naFila?.length ?? 0), 0);
  const irParaAba = (nova: Aba) => escreverURL({ aba: nova === "agora" ? null : nova });
  // Contagem de cada aba: peças em impressão, lançamentos do dia, unidades do período.
  const contagemDaAba: Record<Aba, number | null> = {
    agora: totalImprimindo,
    diario: maquinas.reduce((s, m) => s + m.registros.length, 0),
    resumo: null,
  };
  const unidadesDoDia = maquinas.reduce((s, m) => s + m.unidadesNoDia, 0);

  // ── O relatório (resumo do período) ───────────────────────────────────────
  // O intervalo nasce do dia do diário + o período escolhido; só é pedido
  // quando o retrato já disse qual é "hoje" (o servidor trava o fim em hoje).
  const intervalo = useMemo(
    () => (dia && hoje ? intervaloDoPeriodo(periodo, dia, hoje, deDaURL, ateDaURL) : null),
    [periodo, dia, hoje, deDaURL, ateDaURL],
  );
  const relatorio = useQuery<Relatorio>({
    queryKey: ["/api/grafica/maquinas/relatorio", `?de=${intervalo?.de}&ate=${intervalo?.ate}`],
    // Só na aba Resumo: a aba Agora (painel de parede) não paga essa consulta.
    enabled: !!intervalo && aba === "resumo",
    staleTime: 15_000,
    refetchInterval: 60_000,
  });
  const { toast } = useToast();
  const [exportando, setExportando] = useState(false);
  // Baixa o .xlsx do MESMO intervalo do resumo. `fetch` direto (e não
  // apiRequest) porque o corpo é binário e o nome vem do servidor.
  const exportarExcel = async () => {
    if (!intervalo || exportando) return;
    setExportando(true);
    try {
      const res = await fetch(`/api/grafica/maquinas/relatorio.xlsx?de=${intervalo.de}&ate=${intervalo.ate}`, { credentials: "include" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Falha ao gerar o arquivo");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = intervalo.de === intervalo.ate ? `maquinas-${intervalo.de}.xlsx` : `maquinas-${intervalo.de}-a-${intervalo.ate}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({ title: "Excel gerado", description: `Resumo e registros de ${periodoBR(intervalo.de, intervalo.ate)}.` });
    } catch (error: any) {
      toast({ title: "Não foi possível exportar", description: error?.message ?? "Erro inesperado", variant: "destructive" });
    } finally {
      setExportando(false);
    }
  };

  // ── Largura útil: o diário vira cartões quando a tabela não cabe ──────────
  // (menu lateral aberto a 1280px deixa ~1040px; abaixo de 820px nem a tabela
  // reduzida cabe sem cortar coluna — ver densityFromWidth em use-mobile).
  const medida = useElementSize<HTMLDivElement>();
  const larguraUtil = medida.width || (typeof window !== "undefined" ? window.innerWidth : 1280);
  const diarioEmCartoes = isMobile || larguraUtil < CONTENT_CARDS_MAX;
  const diarioCompacto = !diarioEmCartoes && larguraUtil < CONTENT_COMPACT_MAX;

  // O diário é UM só (todas as máquinas), na ordem do dia; o chip filtra.
  const diario = useMemo<Linha[]>(() => {
    const linhas: Linha[] = [];
    for (const m of maquinas) for (const r of m.registros) linhas.push({ ...r, maquina: m.codigo, rotuloMaquina: m.rotulo });
    linhas.sort((a, b) => a.ordem - b.ordem);
    return maquinaFiltro ? linhas.filter((l) => l.maquina === maquinaFiltro) : linhas;
  }, [maquinas, maquinaFiltro]);

  // "Mostrar mais" sem efeito: o limite guarda o recorte a que pertence e
  // volta ao lote inicial quando o recorte muda.
  const chaveDoRecorte = `${dia ?? ""}|${maquinaFiltro}`;
  const [limite, setLimite] = useState<{ chave: string; n: number }>({ chave: chaveDoRecorte, n: LOTE });
  const visiveis = limite.chave === chaveDoRecorte ? limite.n : LOTE;
  const linhasVisiveis = diario.slice(0, visiveis);

  const irParaDia = (novo: string) => escreverURL({ dia: hoje && novo >= hoje ? null : novo });
  const maquinaFiltrada = maquinas.find((m) => m.codigo === maquinaFiltro) ?? null;
  const antesDoDiario = !!dia && dia < INICIO_DO_DIARIO;

  // Estilos repetidos
  const botaoNeutro: React.CSSProperties = { minHeight: alvo, padding: "0 12px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: R.md, border: `1px solid ${T.bdark}`, background: T.surface, color: T.text, fontSize: 12, fontWeight: 700, cursor: "pointer", textDecoration: "none", whiteSpace: "nowrap" };
  const botaoIcone: React.CSSProperties = { height: alvo, width: alvo, borderRadius: R.md, border: `1px solid ${T.bdark}`, background: T.surface, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", color: T.text };

  // A barra do lote. Desktop: ao lado do título. Celular: DEPOIS da lista no
  // DOM e grudada embaixo da tela — quem marcou a 15ª peça não rola de volta
  // ao título para achar o "Reservar para…"; o recorte seguro vai no LONGO
  // (o atalho `padding` com env() não sobrevive ao estilo inline).
  // No celular a ação principal (o select, linha inteira) vem em cima; a
  // contagem e o "Limpar" dividem a linha de baixo.
  const contagemDoLote = (
    <span aria-live="polite" style={{ flex: isMobile ? "1 1 0%" : undefined, minWidth: 0, fontSize: FS.body, fontWeight: 700, color: T.text, fontVariantNumeric: "tabular-nums" }}>{plural(selecionadasVivas.length, "selecionada", "selecionadas")}</span>
  );
  const barraDoLoteVisivel = podeAgir && selecionadasVivas.length > 0 && aba === "agora";
  const barraDoLote = podeAgir && selecionadasVivas.length > 0 ? (
    <div
      role="group"
      aria-label="Reservar as selecionadas"
      data-testid="lote-fila"
      style={isMobile
        ? { position: "sticky", bottom: 0, zIndex: 5, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", background: T.surface, border: `1px solid ${T.bdark}`, borderRadius: R.lg, boxShadow: "0 -6px 14px -8px rgba(28,25,23,0.25)", paddingTop: 10, paddingLeft: 12, paddingRight: 12, paddingBottom: "calc(10px + env(safe-area-inset-bottom))" }
        : { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}
    >
      {!isMobile && contagemDoLote}
      <SeletorDeReserva valor={null} excluir={null} disabled={reserva.isPending} alvo={alvo} isMobile={isMobile} testId="reservar-lote" rotulo={isMobile ? `Reservar ${plural(selecionadasVivas.length, "peça", "peças")} para…` : "Reservar para…"} onEscolher={(m) => { reservar(selecionadasVivas, m); setSelecionadas(new Set()); }} />
      {isMobile && contagemDoLote}
      <button type="button" className="mq-acao" onClick={() => setSelecionadas(new Set())} data-testid="lote-limpar" style={{ ...botaoNeutro, ...(isMobile ? { fontSize: 13 } : {}) }}>Limpar</button>
    </div>
  ) : null;

  return (
    <FichaContext.Provider value={abrirFicha}>
    <div
      data-testid="pagina-maquinas"
      style={{
        backgroundColor: T.bg, minHeight: "100%",
        paddingTop: isMobile ? 12 : 24, paddingLeft: isMobile ? 16 : 24, paddingRight: isMobile ? 16 : 24,
        // Respiro no FIM: a lista nunca termina colada na borda da janela. No
        // celular soma a área segura; com a barra de lote grudada embaixo, o
        // bastante para a última linha não ficar atrás dela.
        paddingBottom: isMobile ? `calc(${barraDoLoteVisivel ? 160 : 72}px + env(safe-area-inset-bottom))` : 80,
      }}
    >
      <style>{CSS_DA_TELA}</style>
      <div ref={medida.ref} style={{ maxWidth: 1180, margin: "0 auto", display: "flex", flexDirection: "column", gap: isMobile ? 18 : 24 }}>

        {/* ── Cabeçalho: onde estou, o que a tela faz, atalhos ── */}
        <header style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <Link href="/grafica" data-testid="link-voltar-fila" className="mq-link" style={{ display: "inline-flex", alignItems: "center", gap: 5, minHeight: isMobile ? 44 : undefined, fontSize: isMobile ? 12 : FS.small, fontWeight: 700, color: T.second, textDecoration: "none", width: "fit-content" }}>
            <ArrowLeft aria-hidden="true" style={{ width: 13, height: 13 }} /> Fila da Gráfica
          </Link>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <h1 style={{ ...TITULO, fontSize: isMobile ? 22 : FS.h1, display: "flex", alignItems: "center", gap: 10 }}>
              <Printer aria-hidden="true" style={{ width: isMobile ? 18 : 22, height: isMobile ? 18 : 22, color: T.accentText }} />
              Máquinas
            </h1>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              {data && <Atualizado em={dataUpdatedAt} buscando={isFetching && !isLoading} fonte={isMobile ? 12 : FS.small} />}
              <Link href={GRAFICA_EM_IMPRESSAO} data-testid="link-grafica-em-impressao" className="mq-acao" title='Abrir a fila da Gráfica já filtrada em "Em Impressão"' style={botaoNeutro}>
                Em impressão na Gráfica <ArrowRight aria-hidden="true" style={{ width: 12, height: 12, color: T.accentText }} />
              </Link>
            </div>
          </div>
          <p style={{ margin: 0, fontSize: FS.body, color: T.second, maxWidth: 680 }}>
            O que cada impressora está imprimindo agora, a fila do que vem, o resumo do período e o diário do que saiu de cada uma.
            {podeAgir && " Daqui você reserva impressora, inicia, informa as impressas, manda para o acabamento ou troca de máquina."}
          </p>
        </header>

        {/* ── As abas (o mesmo desenho das abas da Arte) ── */}
        <div
          role="tablist"
          aria-label="Seções da tela"
          data-testid="abas-maquinas"
          onKeyDown={(e) => {
            if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
            e.preventDefault();
            const i = ABAS.findIndex((t) => t.id === aba);
            const prox = e.key === "ArrowRight" ? (i + 1) % ABAS.length : (i - 1 + ABAS.length) % ABAS.length;
            irParaAba(ABAS[prox].id);
            (e.currentTarget.querySelectorAll('[role="tab"]')[prox] as HTMLElement | undefined)?.focus();
          }}
          style={{ display: "flex", alignItems: "flex-end", overflowX: "auto", scrollbarWidth: "none", maxWidth: "100%", borderBottom: `1px solid ${T.border}`, marginTop: -8 }}
        >
          {ABAS.map((t) => {
            const ativa = aba === t.id;
            const Icone = t.Icone;
            const n = contagemDaAba[t.id];
            return (
              <button
                key={t.id}
                id={`aba-${t.id}`}
                role="tab"
                aria-selected={ativa}
                aria-controls="painel-maquinas"
                tabIndex={ativa ? 0 : -1}
                onClick={() => irParaAba(t.id)}
                data-testid={`aba-${t.id}`}
                title={t.dica}
                style={{ display: "flex", alignItems: "center", gap: 7, padding: isMobile ? "12px 14px" : "10px 16px", minHeight: isMobile ? 44 : undefined, border: "none", cursor: "pointer", borderBottom: ativa ? `2px solid ${T.accent}` : "2px solid transparent", marginBottom: -1, background: "transparent", color: ativa ? T.accentText : "#57534e", fontWeight: ativa ? 700 : 500, fontSize: 13, whiteSpace: "nowrap", borderRadius: "6px 6px 0 0", flexShrink: 0 }}
              >
                <Icone aria-hidden="true" style={{ width: 13, height: 13, flexShrink: 0 }} />
                {t.rotulo}
                {n != null && n > 0 && (
                  <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 18, height: 18, borderRadius: 999, fontSize: 11, fontWeight: 700, padding: "0 5px", fontVariantNumeric: "tabular-nums", backgroundColor: ativa ? "#fff7ed" : "#f5f5f4", border: ativa ? "1px solid #fed7aa" : "1px solid #e7e5e4", color: ativa ? T.accentText : "#57534e" }}>
                    {n}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {isLoading && <Esqueleto lento={lento} />}

        {isError && !data && (
          <div role="alert" data-testid="maquinas-erro" style={{ padding: "14px 16px", borderRadius: R.lg, background: VERMELHO.bg, border: `1px solid ${VERMELHO.border}`, color: VERMELHO.text, fontSize: FS.body, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <span>{ehServidorNaVersaoAnterior(error) ? AVISO_SERVIDOR_ANTIGO : "Não foi possível carregar as máquinas. Confira a conexão e tente de novo."}</span>
            <button type="button" onClick={() => refetch()} data-testid="button-tentar-novamente" style={{ minHeight: alvo, border: "none", borderRadius: R.md, background: VERMELHO.text, color: "#fff", fontWeight: 700, fontSize: 12, padding: "0 14px", cursor: "pointer" }}>
              Tentar novamente
            </button>
          </div>
        )}

        {data && (
          <>
            {isError && (
              <p role="status" data-testid="maquinas-erro-suave" style={{ margin: 0, fontSize: isMobile ? 12 : FS.small, color: AMBAR.text }}>
                A última atualização falhou — mostrando o retrato de {fmtRelative(new Date(dataUpdatedAt).toISOString(), agora)}. Tentando de novo em breve.
              </p>
            )}

            {/* ── 1 · AGORA ── */}
            {aba === "agora" && (
            <section id="painel-maquinas" role="tabpanel" aria-labelledby="aba-agora" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                <h2 id="titulo-agora" style={{ ...TITULO, fontSize: FS.title }}>Agora</h2>
                <span data-testid="resumo-agora" style={{ fontSize: FS.body, color: T.second }}>
                  {totalImprimindo === 0 ? "nenhuma peça em impressão" : `${plural(totalImprimindo, "peça", "peças")} em impressão`}
                </span>
              </div>

              {data.semMaquina.length > 0 && (
                <div role="status" data-testid="sem-maquina" style={{ padding: "11px 14px", borderRadius: R.lg, background: AMBAR.bg, border: `1px solid ${AMBAR.border}`, color: "#92400e", fontSize: isMobile ? 13 : 12.5, lineHeight: 1.5, display: "flex", gap: 8 }}>
                  <AlertTriangle aria-hidden="true" style={{ width: 15, height: 15, flexShrink: 0, marginTop: 2 }} />
                  <span>
                    <strong>{plural(data.semMaquina.length, "peça está", "peças estão")} em impressão sem máquina anotada</strong> — foram
                    iniciadas antes do controle por máquina. Abra na fila e escolha a impressora:{" "}
                    {data.semMaquina.map((p, i) => (
                      <span key={p.id}>
                        {i > 0 && ", "}
                        <Link href={linkDaPecaNaGrafica(p.id)} className="mq-link" style={{ color: "#92400e", fontWeight: 700 }}>{p.displayId ?? "peça"}</Link>
                      </span>
                    ))}
                  </span>
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 12 }}>
                {maquinas.map((m) => {
                  const ocupada = m.imprimindo.length > 0;
                  const naFila = ordenarFila(m.naFila ?? []);
                  return (
                    <article key={m.codigo} aria-label={m.rotulo} data-testid={`maquina-agora-${m.codigo}`} data-em-foco={maquinaEmFoco === m.codigo || undefined} style={{ ...(maquinaEmFoco === m.codigo ? { boxShadow: `0 0 0 3px ${IMP.border}` } : {}), background: T.surface, border: `1px solid ${maquinaEmFoco === m.codigo ? IMP.text : ocupada ? IMP.border : T.border}`, borderRadius: R.lg, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                      {/* O nome inteiro ("Impressora 1 (New XT)") quebra em duas
                          linhas se precisar; a pílula não disputa espaço com
                          ele — vai para a direita ou para a linha de baixo. */}
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                        <h3 style={{ ...TITULO, fontSize: FS.strong, lineHeight: 1.25, flex: "1 1 140px", minWidth: 0, overflowWrap: "anywhere" }}>{m.rotulo}</h3>
                        <Pilula pal={ocupada ? IMP : LIVRE} testId={`estado-${m.codigo}`} fonte={isMobile ? 12 : FS.small}>
                          {ocupada ? (m.imprimindo.length === 1 ? "Imprimindo" : `Imprimindo ${m.imprimindo.length}`) : "Livre"}
                          {naFila.length > 0 && <span style={{ fontWeight: 600, opacity: 0.85 }}> · Na fila {naFila.length}</span>}
                        </Pilula>
                      </div>

                      {!ocupada && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          <p style={{ margin: 0, fontSize: FS.body, color: T.second }}>
                            {naFila.length ? "Nenhuma peça imprimindo agora — a fila abaixo espera." : "Nenhuma peça nesta máquina."}
                          </p>
                          {podeAgir && (
                            <button type="button" className="mq-acao" onClick={() => setSeletorDaMaquina(m.codigo)} data-testid={`link-escolher-peca-${m.codigo}`} title="Escolher, entre as peças liberadas, a que vai imprimir nesta impressora" style={{ ...botaoNeutro, width: isMobile ? "100%" : "fit-content" }}>
                              Escolher peça para imprimir <ArrowRight aria-hidden="true" style={{ width: 12, height: 12, color: T.accentText }} />
                            </button>
                          )}
                        </div>
                      )}

                      {m.imprimindo.map((p) => (
                        <PecaNoCartao key={p.id} emFoco={itemEmFoco === p.id} p={p.maquina ? p : { ...p, maquina: m.codigo }} agora={agora} podeAgir={podeAgir} hojeMs={hojeMs} isMobile={isMobile} onAgir={abrirModal} mexendo={mexerNaImpressora.isPending} onTirar={(peca) => mexer({ maquina: m.codigo, sai: { id: peca.id, displayId: peca.displayId, nome: nomeDaPeca(peca.tipo, peca.descricao), impressas: peca.parte ? peca.parte.impressas : peca.impressas, teto: peca.parte ? peca.parte.atrib : peca.aImprimir } })} />
                      ))}

                      {/* A fila DESTA impressora (dono, 21/09): reservadas, na
                          ordem da saída do caminhão. Só controle — a etapa da
                          peça não muda até "Iniciar impressão". */}
                      {naFila.length > 0 && (
                        <div data-testid={`fila-maquina-${m.codigo}`} style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 2 }}>
                          <div style={{ ...ROTULO_MICRO, fontSize: isMobile ? 12 : FS.micro, paddingTop: 6 }}>Na fila desta impressora · {naFila.length}</div>
                          {(!filasAbertas.has(m.codigo) ? naFila.slice(0, isMobile ? FILA_DO_CARTAO_NO_CELULAR : FILA_DO_CARTAO_NO_DESKTOP) : naFila).map((p, i) => (
                            <PecaNaFilaDoCartao key={p.id} p={p} proxima={!ocupada && i === 0} ocupante={ocupada ? ocupacao[m.codigo]?.atual ?? null : null} mexendo={mexerNaImpressora.isPending} onTrocar={(entra, sai) => mexer({ maquina: m.codigo, sai, entra, quantidade: entra.reservadas ?? null })} podeAgir={podeAgir} hojeMs={hojeMs} isMobile={isMobile} onIniciar={iniciarDaFila} onReservar={(peca, maquina, quantidade) => reservar([peca.id], maquina, quantidade ?? (peca.reservadas != null ? peca.reservadas : null), peca.reservadas != null ? m.codigo : null)} />
                          ))}
                          {!filasAbertas.has(m.codigo) && naFila.length > (isMobile ? FILA_DO_CARTAO_NO_CELULAR : FILA_DO_CARTAO_NO_DESKTOP) && (
                            <button type="button" className="mq-acao" onClick={() => setFilasAbertas((s) => new Set(s).add(m.codigo))} data-testid={`fila-maquina-ver-todas-${m.codigo}`} style={{ ...botaoNeutro, width: "100%", fontSize: 13 }}>
                              Ver as {naFila.length} da fila <ChevronDown aria-hidden="true" style={{ width: 13, height: 13 }} />
                            </button>
                          )}
                        </div>
                      )}

                      {/* Ida para a Gráfica recortada NESTA impressora — o filtro
                          "Impressora" de lá usa a mesma régua deste cartão
                          (impressorasDaPeca: imprimindo, reservada ou impressa nela). */}
                      <Link href={linkDaImpressoraNaGrafica(m.codigo)} className="mq-link" data-testid={`link-impressora-na-grafica-${m.codigo}`} title={`Abrir a fila da Gráfica filtrada na ${m.rotulo}`} style={{ display: "inline-flex", alignItems: "center", gap: 5, minHeight: isMobile ? 44 : 28, fontSize: isMobile ? 12 : FS.small, fontWeight: 700, color: T.second, textDecoration: "none", width: "fit-content" }}>
                        Peças desta impressora na Gráfica <ArrowRight aria-hidden="true" style={{ width: 12, height: 12, color: T.accentText }} />
                      </Link>

                      {/* Rodapé: o que saiu desta máquina no dia aberto — e o atalho para o diário dela. */}
                      <button
                        type="button"
                        className="mq-acao"
                        onClick={() => escreverURL({ maquina: m.codigo, aba: "diario" })}
                        data-testid={`resumo-dia-${m.codigo}`}
                        title={`Ver o diário da ${m.rotulo} neste dia`}
                        style={{ marginTop: "auto", minHeight: isMobile ? 44 : 32, padding: "6px 8px", border: "none", borderTop: `1px solid ${T.low}`, borderRadius: `0 0 ${R.sm}px ${R.sm}px`, background: "transparent", textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, fontSize: isMobile ? 12 : FS.small, color: T.second, fontVariantNumeric: "tabular-nums" }}
                      >
                        <span>
                          <span style={{ ...ROTULO_MICRO, fontSize: isMobile ? 12 : FS.micro }}>{dia && hoje ? rotuloDoDia(dia, hoje) : "Dia"}</span>{" "}
                          {m.unidadesNoDia === 0 && m.registros.length === 0
                            ? "nada impresso"
                            : `${plural(m.unidadesNoDia, "un. impressa", "un. impressas")} · ${plural(m.pecasNoDia, "peça", "peças")}`}
                        </span>
                        <ChevronRight aria-hidden="true" style={{ width: 13, height: 13, flexShrink: 0 }} />
                      </button>
                    </article>
                  );
                })}
              </div>
            </section>
            )}

            {/* ── 2 · A FILA GERAL (liberadas sem impressora reservada) ── */}
            {aba === "agora" && (
              <section aria-labelledby="titulo-fila" data-testid="secao-fila" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                    <h2 id="titulo-fila" style={{ ...TITULO, fontSize: FS.title }}>Fila geral</h2>
                    <span data-testid="resumo-fila" style={{ fontSize: FS.body, color: T.second }}>
                      {filaGeral.length === 0 ? "nenhuma peça sem impressora" : `${plural(filaGeral.length, "peça liberada", "peças liberadas")} sem impressora`}
                      {totalReservadas > 0 ? ` · ${plural(totalReservadas, "reservada", "reservadas")} nos cartões acima` : ""}
                    </span>
                  </div>
                  {!isMobile && barraDoLote}
                </div>
                <p style={{ margin: 0, fontSize: FS.body, color: T.second, maxWidth: 680 }}>
                  Reservar só organiza a fila desta tela: a peça continua liberada na Gráfica até alguém iniciar a impressão.
                </p>
                <p data-testid="relacao-liberados" style={{ margin: 0, fontSize: isMobile ? 12 : FS.small, color: T.second, maxWidth: 680 }}>
                  {`${plural(liberadasNaTela, "peça liberada", "peças liberadas")} ao todo — é o "Liberados" da Gráfica. `}
                  Uma peça com parte reservada e parte sem impressora aparece aqui e num cartão; a que já imprime só uma parte continua na fila com o resto.
                </p>
                <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: R.lg, overflow: "hidden" }}>
                  {filaGeral.length === 0 ? (
                    <div data-testid="fila-vazia" style={{ padding: isMobile ? "22px 16px" : "26px 24px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                      <p style={{ margin: 0, fontSize: FS.strong, fontWeight: 700, color: T.text }}>
                        {totalReservadas > 0 ? "Todas as peças liberadas já têm impressora reservada." : "Nenhuma peça liberada aguardando impressão."}
                      </p>
                      <p style={{ margin: 0, fontSize: FS.body, color: T.second, maxWidth: 440 }}>
                        Quando a Revisão Final liberar, elas aparecem aqui para você reservar uma impressora.
                      </p>
                      <Link href={GRAFICA_LIBERADOS} className="mq-acao" data-testid="link-fila-ver-na-grafica" style={{ ...botaoNeutro, marginTop: 4 }}>
                        Ver na Gráfica <ArrowRight aria-hidden="true" style={{ width: 12, height: 12, color: T.accentText }} />
                      </Link>
                    </div>
                  ) : (
                    <div data-testid="fila-geral">
                      {filaGeral.slice(0, filaVisiveis).map((p) => (
                        <LinhaDaFilaGeral key={p.id} p={p} marcada={selecionadas.has(p.id)} podeAgir={podeAgir} ocupado={reserva.isPending || mexerNaImpressora.isPending} hojeMs={hojeMs} isMobile={isMobile} ocupacao={ocupacao} imprimindo={imprimindoId === p.id} onAlternar={alternar} onReservar={reservarDaLinha} onImprimir={imprimirDaLinha} onTrocar={trocarDaLinha} />
                      ))}
                      <FechoDaLista visiveis={Math.min(filaVisiveis, filaGeral.length)} total={filaGeral.length} um="peça" varios="peças" lote={LOTE_DA_FILA} onMais={() => setFilaVisiveis((v) => v + LOTE_DA_FILA)} testId="fecho-fila-geral" botaoTestId="button-fila-toda" isMobile={isMobile} estiloDoBotao={botaoNeutro} />
                    </div>
                  )}
                </div>
                {isMobile && barraDoLote}
              </section>
            )}

            {/* ── 3 · O RESUMO (por dia × impressora, no período escolhido) ── */}
            {aba === "resumo" && (
            <section id="painel-maquinas" role="tabpanel" aria-labelledby="aba-resumo" data-testid="secao-resumo" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                  <h2 id="titulo-resumo" style={{ ...TITULO, fontSize: FS.title, scrollMarginTop: 16 }}>Resumo</h2>
                  {intervalo && (
                    <span data-testid="resumo-periodo" style={{ fontSize: FS.body, color: T.second, fontVariantNumeric: "tabular-nums" }}>
                      {periodo === "dia" && dia && hoje ? rotuloDoDia(dia, hoje) : periodoBR(intervalo.de, intervalo.ate)}
                      {relatorio.data ? ` · ${plural(relatorio.data.dias.reduce((s, d) => s + d.total.unidades, 0), "unidade impressa", "unidades impressas")}` : ""}
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  {/* O período vale para o resumo E para o Excel. */}
                  <div role="group" aria-label="Período do resumo" data-testid="seletor-periodo" style={{ display: isMobile ? "flex" : "inline-flex", ...(isMobile ? { flex: "1 1 100%" } : {}), border: `1px solid ${T.bdark}`, borderRadius: R.md, overflow: "hidden", background: T.surface }}>
                    {PERIODOS.map((p, i) => {
                      const ativo = periodo === p.valor;
                      return (
                        <button
                          key={p.valor}
                          type="button"
                          className="mq-chip"
                          aria-pressed={ativo}
                          onClick={() => escreverURL({ periodo: p.valor === "dia" ? null : p.valor, ...(p.valor !== "intervalo" ? { de: null, ate: null } : {}) })}
                          data-testid={`periodo-${p.valor}`}
                          style={{ minHeight: alvo, padding: isMobile ? "0 4px" : "0 12px", ...(isMobile ? { flex: "1 1 0%", minWidth: 0 } : {}), border: "none", borderLeft: i ? `1px solid ${T.border}` : "none", background: ativo ? T.text : "transparent", color: ativo ? "#fff" : T.text, fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                        >
                          {p.rotulo}
                        </button>
                      );
                    })}
                  </div>
                  {periodo === "intervalo" && intervalo && hoje && (
                    <div role="group" aria-label="Intervalo de datas" style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <label htmlFor="intervalo-de" className="sr-only">De</label>
                      <input id="intervalo-de" type="date" value={intervalo.de} max={intervalo.ate} data-testid="intervalo-de" onChange={(e) => { if (e.target.value) escreverURL({ de: e.target.value, ate: intervalo.ate }); }} style={{ height: alvo, borderRadius: R.md, border: `1px solid ${T.bdark}`, background: T.surface, padding: "0 8px", fontSize: isMobile ? 16 : 12.5, color: T.text }} />
                      <span aria-hidden="true" style={{ fontSize: isMobile ? 12 : FS.small, color: T.second }}>a</span>
                      <label htmlFor="intervalo-ate" className="sr-only">Até</label>
                      <input id="intervalo-ate" type="date" value={intervalo.ate} min={intervalo.de} max={hoje} data-testid="intervalo-ate" onChange={(e) => { if (e.target.value) escreverURL({ de: intervalo.de, ate: e.target.value }); }} style={{ height: alvo, borderRadius: R.md, border: `1px solid ${T.bdark}`, background: T.surface, padding: "0 8px", fontSize: isMobile ? 16 : 12.5, color: T.text }} />
                    </div>
                  )}
                  <button
                    type="button"
                    className="mq-acao"
                    onClick={exportarExcel}
                    disabled={!intervalo || exportando}
                    aria-busy={exportando || undefined}
                    data-testid="button-exportar-excel"
                    title={intervalo ? `Baixar o resumo e os registros de ${periodoBR(intervalo.de, intervalo.ate)} em Excel` : "Aguarde o carregamento"}
                    style={{ ...botaoNeutro, ...(isMobile ? { flex: "1 1 100%", fontSize: 13 } : {}), cursor: !intervalo || exportando ? "wait" : "pointer", opacity: !intervalo ? 0.6 : 1 }}
                  >
                    {exportando ? <Loader2 aria-hidden="true" className="animate-spin" style={{ width: 13, height: 13 }} /> : <Download aria-hidden="true" style={{ width: 13, height: 13, color: T.accentText }} />}
                    {exportando ? "Gerando…" : "Exportar Excel"}
                  </button>
                </div>
              </div>

              <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: R.lg, overflow: "hidden", padding: diarioEmCartoes ? 12 : 0 }}>
                {relatorio.isLoading || !intervalo ? (
                  <div role="status" aria-busy="true" data-testid="resumo-carregando" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
                    <span className="sr-only">Carregando o resumo…</span>
                    {[0, 1, 2, 3].map((i) => <div key={i} className="animate-pulse" aria-hidden="true" style={{ height: 12, borderRadius: 4, background: "#e7e5e4", width: `${70 - i * 8}%` }} />)}
                  </div>
                ) : relatorio.isError && !relatorio.data ? (
                  <div role="alert" data-testid="resumo-erro" style={{ padding: "14px 16px", color: VERMELHO.text, fontSize: FS.body, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <span>{ehServidorNaVersaoAnterior(relatorio.error) ? AVISO_SERVIDOR_ANTIGO : "Não foi possível montar o resumo deste período."}</span>
                    <button type="button" className="mq-acao" onClick={() => relatorio.refetch()} style={botaoNeutro}>Tentar novamente</button>
                  </div>
                ) : relatorio.data && relatorio.data.dias.length === 0 ? (
                  <div data-testid="resumo-vazio" style={{ padding: isMobile ? "22px 16px" : "26px 24px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                    <p style={{ margin: 0, fontSize: FS.strong, fontWeight: 700, color: T.text }}>Nenhuma impressão registrada {periodo === "dia" ? (ehHoje ? "hoje" : `em ${diaBR(intervalo.de)}`) : `entre ${diaBR(intervalo.de)} e ${diaBR(intervalo.ate)}`}.</p>
                    <p style={{ margin: 0, fontSize: FS.body, color: T.second, maxWidth: 420 }}>
                      {intervalo.ate < INICIO_DO_DIARIO
                        ? `O diário por máquina começa em ${diaBR(INICIO_DO_DIARIO)}.`
                        : "Escolha outro período ou aguarde as máquinas registrarem."}
                    </p>
                  </div>
                ) : relatorio.data ? (
                  <ResumoDoPeriodo
                    dias={relatorio.data.dias}
                    emCartoes={diarioEmCartoes}
                    isMobile={isMobile}
                    hoje={relatorio.data.hoje}
                    onVerDiario={(d, m) => escreverURL({ dia: hoje && d >= hoje ? null : d, maquina: m, aba: "diario" })}
                  />
                ) : null}
              </div>
            </section>
            )}

            {/* ── 4 · O DIÁRIO ── */}
            {aba === "diario" && (
            <section id="painel-maquinas" role="tabpanel" aria-labelledby="aba-diario" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                  <h2 id="titulo-dia" style={{ ...TITULO, fontSize: FS.title, scrollMarginTop: 16 }}>Diário</h2>
                  <span data-testid="resumo-dia" style={{ fontSize: FS.body, color: T.second, fontVariantNumeric: "tabular-nums" }}>
                    {unidadesDoDia === 0 ? "nada impresso neste dia" : `${plural(unidadesDoDia, "unidade impressa", "unidades impressas")} no total`}
                  </span>
                </div>

                {dia && hoje && (
                  <div role="group" aria-label="Escolher o dia" data-testid="navegar-dia" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <button type="button" className="mq-acao" onClick={() => irParaDia(somarDias(dia, -1))} aria-label="Dia anterior" data-testid="dia-anterior" style={botaoIcone}>
                      <ChevronLeft aria-hidden="true" style={{ width: 15, height: 15 }} />
                    </button>
                    <span aria-live="polite" style={{ minWidth: 92, textAlign: "center", fontSize: FS.body, fontWeight: 700, color: T.text }}>{rotuloDoDia(dia, hoje)}</span>
                    <button type="button" className="mq-acao" onClick={() => irParaDia(somarDias(dia, 1))} disabled={ehHoje} aria-label="Próximo dia" title={ehHoje ? "Já está em hoje" : undefined} data-testid="dia-seguinte" style={{ ...botaoIcone, cursor: ehHoje ? "not-allowed" : "pointer", opacity: ehHoje ? 0.4 : 1 }}>
                      <ChevronRight aria-hidden="true" style={{ width: 15, height: 15 }} />
                    </button>
                    <input
                      type="date"
                      value={dia}
                      max={hoje}
                      onChange={(e) => { if (e.target.value) irParaDia(e.target.value); }}
                      aria-label="Ir para uma data"
                      data-testid="escolher-data"
                      style={{ height: alvo, borderRadius: R.md, border: `1px solid ${T.bdark}`, background: T.surface, padding: "0 8px", fontSize: isMobile ? 16 : 12.5, color: T.text }}
                    />
                    {!ehHoje && (
                      <button type="button" className="mq-acao mq-primario" onClick={() => escreverURL({ dia: null })} data-testid="dia-hoje" style={{ height: alvo, padding: "0 12px", borderRadius: R.md, border: "none", background: T.text, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                        Hoje
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Filtro por impressora: chips com contagem — quem procura "o que
                  saiu da 3" vê o número antes de clicar. */}
              <div role="group" aria-label="Filtrar por impressora" data-testid="filtro-maquina" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {[{ codigo: "", rotulo: "Todas", n: maquinas.reduce((s, m) => s + m.registros.length, 0) }, ...maquinas.map((m) => ({ codigo: m.codigo, rotulo: m.rotulo, n: m.registros.length }))].map((c) => {
                  const ativo = maquinaFiltro === c.codigo;
                  return (
                    <button
                      key={c.codigo || "todas"}
                      type="button"
                      className="mq-chip"
                      aria-pressed={ativo}
                      onClick={() => escreverURL({ maquina: c.codigo || null })}
                      data-testid={`chip-maquina-${c.codigo || "todas"}`}
                      style={{ minHeight: alvo, padding: "0 12px", borderRadius: R.pill, border: `1px solid ${ativo ? T.text : T.border}`, background: ativo ? T.text : T.surface, color: ativo ? "#fff" : T.text, fontSize: 12, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}
                    >
                      {c.rotulo}
                      <span style={{ fontFamily: GROTESK, fontVariantNumeric: "tabular-nums", color: ativo ? "#d6d3d1" : T.second }}>{c.n}</span>
                    </button>
                  );
                })}
              </div>

              <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: R.lg, overflow: "hidden" }}>
                {diario.length === 0 ? (
                  <div data-testid="diario-vazio" style={{ padding: isMobile ? "28px 16px" : "36px 24px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                    <Printer aria-hidden="true" style={{ width: 22, height: 22, color: T.muted }} />
                    <p style={{ margin: 0, fontSize: FS.strong, fontWeight: 700, color: T.text }}>
                      {maquinaFiltrada
                        ? `Nada saiu da ${maquinaFiltrada.rotulo} ${ehHoje ? "hoje" : `em ${diaBR(dia!)}`}.`
                        : `Nenhuma impressão registrada ${ehHoje ? "hoje" : `em ${diaBR(dia!)}`}.`}
                    </p>
                    <p style={{ margin: 0, fontSize: FS.body, color: T.second, maxWidth: 420 }}>
                      {antesDoDiario
                        ? `O diário por máquina começa em ${diaBR(INICIO_DO_DIARIO)}: antes disso a impressão não anotava em qual máquina a peça saiu.`
                        : maquinaFiltrada
                          ? "Veja as outras impressoras ou escolha outro dia."
                          : "Ao iniciar uma impressão na Gráfica, ela aparece aqui."}
                    </p>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", marginTop: 4 }}>
                      {maquinaFiltrada && (
                        <button type="button" className="mq-acao" onClick={() => escreverURL({ maquina: null })} data-testid="button-ver-todas" style={botaoNeutro}>Ver todas as impressoras</button>
                      )}
                      {!ehHoje && (
                        <button type="button" className="mq-acao" onClick={() => escreverURL({ dia: null })} style={botaoNeutro}>Voltar para hoje</button>
                      )}
                      {ehHoje && !maquinaFiltrada && podeAgir && (
                        <Link href={GRAFICA_LIBERADOS} className="mq-acao" style={botaoNeutro}>Ver peças liberadas <ArrowRight aria-hidden="true" style={{ width: 12, height: 12, color: T.accentText }} /></Link>
                      )}
                    </div>
                  </div>
                ) : diarioEmCartoes ? (
                  <div data-testid="diario-cartoes">
                    {linhasVisiveis.map((l) => (
                      <LinhaDoDiario key={l.id} l={l} mostrarMaquina={!maquinaFiltro} isMobile={isMobile} emCartao compacto={false} />
                    ))}
                  </div>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table data-testid="diario-tabela" data-compacto={diarioCompacto || undefined} style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                      <thead>
                        <tr style={{ textAlign: "left", color: T.second, background: T.bg }}>
                          {["Hora", ...(maquinaFiltro ? [] : ["Impressora"]), "Peça", ...(diarioCompacto ? [] : ["Evento"]), "O que aconteceu", "Quem"].map((h, i) => (
                            <th key={`${h}-${i}`} scope="col" style={{ padding: "9px 12px", ...ROTULO_MICRO, whiteSpace: "nowrap" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {linhasVisiveis.map((l) => (
                          <LinhaDoDiario key={l.id} l={l} mostrarMaquina={!maquinaFiltro} isMobile={false} emCartao={false} compacto={diarioCompacto} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {diario.length > 0 && (
                  <FechoDaLista visiveis={Math.min(visiveis, diario.length)} total={diario.length} um="lançamento" varios="lançamentos" lote={LOTE} onMais={() => setLimite({ chave: chaveDoRecorte, n: visiveis + LOTE })} testId="fecho-diario" botaoTestId="button-mostrar-mais" isMobile={isMobile} estiloDoBotao={botaoNeutro} />
                )}
              </div>

              {diario.length > 0 && antesDoDiario && (
                <p data-testid="nota-inicio-historico" style={{ margin: 0, fontSize: isMobile ? 12 : FS.small, color: T.second }}>
                  O histórico por máquina começa em 14/09/2026: antes disso a impressão não anotava em qual máquina a peça saiu.
                </p>
              )}
            </section>
            )}
          </>
        )}
      </div>

      {/* O mesmo modal da fila da Gráfica: iniciar não cabe aqui (a peça já
          está na máquina), então ele abre direto em "informar impressas". */}
      <ModalImpressao item={itemDoModal} abrirNaTroca={pecaNoModal?.trocar ?? false} maquinaInicial={pecaNoModal?.maquinaInicial ?? null} maquinaEmQuestao={pecaNoModal?.peca.parte ? pecaNoModal.peca.maquina : null} parteAIniciar={pecaNoModal?.parte ?? null} ocupadas={ocupadasParaOModal} onFechar={() => setPecaNoModal(null)} />

      {/* O seletor de peça do cartão "Livre": fecha e passa a vez ao modal de
          impressão, já com a impressora marcada. */}
      <SeletorDePeca
        maquina={maquinaDoSeletor}
        reservadas={maquinaDoSeletor?.naFila ?? []}
        filaGeral={filaGeral}
        atualizando={isFetching && !isLoading}
        hojeMs={hojeMs}
        onFechar={() => setSeletorDaMaquina(null)}
        onEscolher={(p, codigo) => {
          setSeletorDaMaquina(null);
          // Reservada para esta impressora: só a parte dela. Da fila geral: o
          // que está sem impressora (a peça inteira quando nada foi direcionado).
          const parte = p.reservadas != null ? { quantidade: p.reservadas, daReserva: true }
            : p.semImpressora != null && (p.semImpressora < p.aImprimir || (p.imprimindoEm ?? []).length > 0) ? { quantidade: p.semImpressora, daReserva: false }
            : null;
          setPecaNoModal({ peca: p, trocar: false, maquinaInicial: codigo, parte });
        }}
      />

      {/* A ficha: enquanto a peça completa não chega, um aviso pequeno (com
          saída); depois, o mesmo diálogo que a Gráfica abre no "Ver detalhes". */}
      <Dialog open={!!fichaId && !itemDaFicha} onOpenChange={(open) => { if (!open) setFichaId(null); }}>
        <DialogContent className={HIDE_NATIVE_CLOSE} style={modalSurface(380)} data-testid="ficha-carregando">
          <DialogTitle className="sr-only">Detalhes da peça</DialogTitle>
          <DialogDescription className="sr-only">Carregando as informações da peça</DialogDescription>
          <ModalHeader icon={Eye} tint={T.text} title="Detalhes da peça" subtitle={pecasDaGrafica.isError ? "Não foi possível carregar" : pecasDaGrafica.isFetching || pecasDaGrafica.isLoading ? "Carregando…" : "Peça não encontrada na fila"} onClose={() => setFichaId(null)} />
          <div style={{ padding: isMobile ? 16 : 24, display: "flex", flexDirection: "column", gap: 12, fontSize: FS.body, color: T.second }}>
            {pecasDaGrafica.isError ? (
              <p role="alert" style={{ margin: 0, color: VERMELHO.text }}>{ehServidorNaVersaoAnterior(pecasDaGrafica.error) ? AVISO_SERVIDOR_ANTIGO : "Não foi possível carregar a ficha desta peça. Confira a conexão e tente de novo."}</p>
            ) : pecasDaGrafica.isFetching || pecasDaGrafica.isLoading ? (
              <p role="status" aria-busy="true" style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}><Loader2 aria-hidden="true" className="animate-spin" style={{ width: 14, height: 14 }} /> Buscando as informações da peça…</p>
            ) : (
              <p role="status" style={{ margin: 0 }}>Esta peça não está mais na fila da Gráfica (pode ter sido concluída, cancelada ou devolvida).</p>
            )}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {pecasDaGrafica.isError && <button type="button" className="mq-acao" onClick={() => pecasDaGrafica.refetch()} style={botaoNeutro}>Tentar novamente</button>}
              {fichaId && <Link href={linkDaPecaNaGrafica(fichaId)} className="mq-acao" style={botaoNeutro}>Ver na Gráfica <ArrowRight aria-hidden="true" style={{ width: 12, height: 12, color: T.accentText }} /></Link>}
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <ItemDetailsDialog
        item={itemDaFicha}
        auditLogs={historicoDaFicha.data ?? []}
        open={!!itemDaFicha}
        onOpenChange={(open) => { if (!open) setFichaId(null); }}
        topActions={fichaId ? (
          <Link href={linkDaPecaNaGrafica(fichaId)} className="mq-acao" data-testid="ficha-ver-na-grafica" style={botaoNeutro}>
            Ver na Gráfica <ArrowRight aria-hidden="true" style={{ width: 12, height: 12, color: T.accentText }} />
          </Link>
        ) : undefined}
      />
    </div>
    </FichaContext.Provider>
  );
}
