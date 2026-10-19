// O que cada aba da Análises (o Painel operacional da gráfica) recebe da
// página: o painel calculado no servidor e as ações de navegação entre abas.
import { COLUNAS_DO_CALENDARIO, type ColunaDoCalendario, type PainelOperacional } from "@shared/painel-operacional";

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

export interface ContextoDoPainel {
  painel: PainelOperacional;
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
