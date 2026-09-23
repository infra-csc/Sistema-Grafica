// ─────────────────────────────────────────────────────────────────────────────
// MÁQUINAS DA GRÁFICA — constantes, tons e estilos comuns da tela.
// ─────────────────────────────────────────────────────────────────────────────
import { T, TOM, FS, FW, FONT } from "@/lib/theme";
import { P } from "@/lib/status";
import type { Aba, Periodo } from "./tipos";

// ─── Constantes ───────────────────────────────────────────────────────────────
/** Quando o diário nasceu — antes disso a impressão não anotava a máquina. */
export const INICIO_DO_DIARIO = "2026-09-14";
/** Quantas linhas do diário entram por vez ("Mostrar mais"). */
export const LOTE = 60;
/** A partir de quantos segundos o carregamento inicial ganha aviso de lentidão. */
export const LENTO_APOS_MS = 4000;
export const GROTESK = FONT.display;
export const MONO = FONT.mono;
/** Filtros da Gráfica, para os atalhos de ida e volta. */
export const GRAFICA_EM_IMPRESSAO = "/grafica?status=inProduction";
export const GRAFICA_LIBERADOS = "/grafica?status=ready_for_production,approved";

export const TITULO: React.CSSProperties = { margin: 0, fontFamily: GROTESK, fontWeight: FW.rotulo, color: T.text, letterSpacing: "-0.02em" };
/** Rótulo de seção/coluna: caixa normal (a caixa-alta de 10px gritava em cada bloco). */
export const ROTULO_MICRO: React.CSSProperties = { fontSize: FS.small, fontWeight: FW.forte, color: T.second };
/** Tom da etapa "Em Impressão" (o mesmo da pílula em lib/status). */
export const IMP = P.orange;
export const LIVRE = P.green;
export const AMBAR = TOM.alerta;
export const VERMELHO = TOM.perigo;
/** O vinho da TRAVA — o mesmo do selo da Gráfica (detalhe-producao); ainda sem token próprio. */
export const VINHO_DA_TRAVA = "#7f1d1d";

export const ABAS: { id: Aba; rotulo: string }[] = [
  { id: "agora", rotulo: "Agora" },
  { id: "diario", rotulo: "Diário" },
  { id: "resumo", rotulo: "Resumo" },
];

export const PERIODOS: { valor: Periodo; rotulo: string }[] = [
  { valor: "dia", rotulo: "Dia" }, { valor: "semana", rotulo: "Semana" }, { valor: "mes", rotulo: "Mês" }, { valor: "intervalo", rotulo: "Intervalo" },
];

/** Estilos de hover/foco que estilo inline não alcança — só desta tela. */
export const CSS_DA_TELA = `
  .mq-acao { transition: background-color 0.12s, border-color 0.12s, color 0.12s; }
  .mq-acao:hover:not(:disabled) { background-color: var(--n2); }
  .mq-chip:hover:not([aria-pressed="true"]) { background-color: var(--n2); border-color: var(--n5); }
  .mq-peca:hover { background-color: var(--n1); }
  .mq-linha:hover > td { background-color: var(--n1); }
  .mq-link:hover { text-decoration: underline; }
`;
