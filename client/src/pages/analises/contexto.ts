// O que cada aba da Análises (o Painel operacional da gráfica) recebe da
// página: o painel calculado no servidor e as ações de navegação entre abas.
import {
  COLUNAS_DO_CALENDARIO, FASE_ENTREGUE, OPCOES_DO_FILTRO_DE_MARCA, passaNoFiltroDeMarca,
  type ColunaDoCalendario, type FiltroDeMarca, type PainelOperacional, type PecaDaLinha, type ResumoDoPainel,
} from "@shared/painel-operacional";

export const ABAS_DO_PAINEL = [
  { id: "geral", rotulo: "Painel geral" },
  { id: "producao", rotulo: "Produção" },
  { id: "pre", rotulo: "Pré-produção" },
  { id: "problemas", rotulo: "Problemas operacionais" },
  { id: "evento", rotulo: "Status por evento" },
] as const;
export type IdDoPainel = (typeof ABAS_DO_PAINEL)[number]["id"];
export type SubDaProducao = "realizado" | "projecao";
/** O submenu da Pré-produção: "Realizado e pendências" | "Eventos × processo × prazo". */
export type SubDaPre = "pendencias" | "calendario";

/**
 * O estado de "Eventos × processo × prazo", na URL com os nomes do pacote de
 * referência: cal_so_atr (1), cal_ev (chave do evento), cal_fase (1–5),
 * cal_ord (evento, data_evento, saida, f1…f5) e cal_dir (asc/desc).
 */
export interface EstadoDoCalendario {
  soAtrasadas: boolean;
  ev: string | null;
  fase: number | null;
  ord: ColunaDoCalendario | null;
  dir: "asc" | "desc";
}
export const CALENDARIO_PADRAO: EstadoDoCalendario = { soAtrasadas: false, ev: null, fase: null, ord: null, dir: "asc" };

export function lerCalendario(p: URLSearchParams): EstadoDoCalendario {
  const so = p.get("cal_so_atr");
  const fase = Number(p.get("cal_fase"));
  const ord = p.get("cal_ord") as ColunaDoCalendario | null;
  const ev = p.get("cal_ev") || null;
  const faseOk = Number.isInteger(fase) && fase >= 1 && fase <= 5 ? fase : null;
  return {
    soAtrasadas: so === "1" || so === "true",
    // Evento e fase só valem juntos (é a célula aberta).
    ev: ev && faseOk ? ev : null,
    fase: ev && faseOk ? faseOk : null,
    ord: ord && COLUNAS_DO_CALENDARIO.includes(ord) ? ord : null,
    dir: p.get("cal_dir") === "desc" ? "desc" : "asc",
  };
}

/** Grava o estado em `p` (só o que difere do padrão). */
export function gravarCalendario(p: URLSearchParams, c: EstadoDoCalendario): void {
  const por = (k: string, v: string | null) => { if (v == null) p.delete(k); else p.set(k, v); };
  por("cal_so_atr", c.soAtrasadas ? "1" : null);
  por("cal_ev", c.ev && c.fase ? c.ev : null);
  por("cal_fase", c.ev && c.fase ? String(c.fase) : null);
  por("cal_ord", c.ord);
  por("cal_dir", c.ord && c.dir === "desc" ? "desc" : null);
}

// ─── O filtro pelas marcas (RF11, Pedro/dono 26/10) ──────────────────────────
//
// Um filtro da página inteira — vale para TODAS as abas, como o evento aberto:
// a página recorta `painel.pecas` UMA vez e cada aba deriva do recorte. O que
// vem pronto do servidor por evento (prazos e situação das fases, KPIs da
// Gestão de Prazos) e as séries somadas (realizado/planejado em m² e em itens)
// não têm a peça dentro — ficam do evento inteiro, e a tela diz isso.
// URL: ?marca=<semAprovacao|semPatrocinio|arteDoCliente|aguardandoArte|comAprovacao>.

export const CHAVE_DA_MARCA_NA_URL = "marca";

export function lerMarca(p: URLSearchParams): FiltroDeMarca {
  const v = p.get(CHAVE_DA_MARCA_NA_URL);
  return OPCOES_DO_FILTRO_DE_MARCA.some((o) => o.id === v) ? (v as FiltroDeMarca) : "todas";
}

export function gravarMarca(p: URLSearchParams, m: FiltroDeMarca): void {
  if (m === "todas") p.delete(CHAVE_DA_MARCA_NA_URL); else p.set(CHAVE_DA_MARCA_NA_URL, m);
}

/**
 * Os contadores de peça do resumo, refeitos sobre um recorte das peças — as
 * MESMAS definições da montagem (shared/painel-operacional → `resumo`; o teste
 * analises-sem-aprovacao-tela prende que, sem filtro, dá o resumo do
 * servidor). Os m² vêm das séries somadas e ficam os do servidor.
 */
export function resumoDasPecas(pecas: ReadonlyArray<PecaDaLinha>, base: ResumoDoPainel): ResumoDoPainel {
  const abertas = pecas.filter((p) => p.fase < FASE_ENTREGUE);
  return {
    ...base,
    pecasAbertas: abertas.length,
    atrasadasAbertas: abertas.filter((p) => p.diasAtraso > 0).length,
    atrasoClienteAbertas: abertas.filter((p) => p.atrasoDoCliente).length,
    aguardandoArteAbertas: abertas.filter((p) => p.aguardandoArteCliente).length,
    furaFilaAbertas: abertas.filter((p) => p.furaFila).length,
    refacoesAbertas: abertas.filter((p) => p.refacao).length,
    reprovadasAbertas: abertas.filter((p) => p.reprovada).length,
  };
}

/** O painel com as peças recortadas pela marca (o mesmo objeto sem filtro). */
export function recortarPorMarca(painel: PainelOperacional, marca: FiltroDeMarca): PainelOperacional {
  if (marca === "todas") return painel;
  const pecas = painel.pecas.filter((p) => passaNoFiltroDeMarca(p, marca));
  return { ...painel, pecas, resumo: resumoDasPecas(pecas, painel.resumo) };
}

export interface ContextoDoPainel {
  /** O painel JÁ RECORTADO pelo filtro de marca (as peças e os contadores de peça do resumo). */
  painel: PainelOperacional;
  /** O filtro de marca da página (RF11) — "todas" = sem filtro. */
  marca: FiltroDeMarca;
  isMobile: boolean;
  /** Abre "Status por evento" com o evento escolhido. */
  abrirEvento: (chave: string) => void;
  /** O evento aberto em "Status por evento" (null = o padrão: o primeiro atrasado). */
  eventoAberto: string | null;
  sub: SubDaProducao;
  trocarSub: (s: SubDaProducao) => void;
  subPre: SubDaPre;
  trocarSubPre: (s: SubDaPre) => void;
  calendario: EstadoDoCalendario;
  mudarCalendario: (m: Partial<EstadoDoCalendario>) => void;
}
