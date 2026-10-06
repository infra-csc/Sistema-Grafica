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
  .mq-acao { transition: background-color var(--dur-rapida) ease, border-color var(--dur-rapida) ease, color var(--dur-rapida) ease, box-shadow var(--dur-rapida) ease; }
  .mq-acao:hover:not(:disabled) { background-color: var(--n2); border-color: var(--n6) !important; }
  .mq-acao:active:not(:disabled) { transform: translateY(0.5px); }
  .mq-chip { transition: background-color var(--dur-rapida) ease, border-color var(--dur-rapida) ease, color var(--dur-rapida) ease; }
  .mq-chip:hover:not([aria-pressed="true"]) { background-color: var(--n2); border-color: var(--n6) !important; }
  .mq-chip:active { transform: translateY(0.5px); }
  .mq-peca { transition: background-color var(--dur-rapida) ease; }
  .mq-peca:hover:not(:disabled) { background-color: var(--n1); }
  .mq-linha > td { transition: background-color var(--dur-rapida) ease; }
  .mq-linha:hover > td { background-color: var(--n1); }
  .mq-link { text-underline-offset: 3px; text-decoration-color: var(--n5); }
  .mq-link:hover { text-decoration: underline; }
  .mq-link:hover .mq-seta, .mq-acao:hover .mq-seta { transform: translateX(2px); }
  .mq-seta { transition: transform var(--dur-rapida) ease; flex-shrink: 0; }

  /* O cartão da impressora: a faixa de cima diz o estado de longe (laranja
     imprimindo, verde livre) e o cartão acende de leve sob o ponteiro. */
  .maq-cartao { transition: border-color var(--dur-media) ease, box-shadow var(--dur-media) ease; }
  @media (hover: hover) { .maq-cartao:hover { box-shadow: var(--sh-md); } }
  .maq-cartao[data-em-foco="true"] { box-shadow: 0 0 0 3px var(--orange-soft), var(--sh-md); }

  /* A barra de progresso do cartão ocupa a largura (a do modal é curta). */
  .maq-barra [role="progressbar"] { max-width: none !important; height: 8px !important; margin: 0 !important; background: var(--n3) !important; }
  .maq-trilho { height: 8px; border-radius: 999px; background: var(--n3); }

  /* "Ao vivo": a bolinha respira devagar — só com movimento permitido. */
  @media (prefers-reduced-motion: no-preference) {
    .maq-vivo { animation: maq-vivo 2.4s ease-in-out infinite; }
    .maq-entra { animation: maq-entra var(--dur-media) var(--ease-saida) backwards; }
  }
  @keyframes maq-vivo { 0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--ok-text) 35%, transparent); } 50% { box-shadow: 0 0 0 4px color-mix(in srgb, var(--ok-text) 0%, transparent); } }
  @keyframes maq-entra { from { opacity: 0; transform: translateY(-3px); } to { opacity: 1; transform: none; } }

  /* Campos da tela (quantidade, data, impressora): foco no laranja da casa. */
  .maq-campo { transition: border-color var(--dur-rapida) ease, box-shadow var(--dur-rapida) ease; }
  .maq-campo:hover:not(:disabled):not(:focus) { border-color: var(--n6) !important; }
  .maq-campo:focus { outline: none; border-color: var(--orange-deep) !important; box-shadow: 0 0 0 3px color-mix(in srgb, var(--orange-deep) 16%, transparent); }
  .maq-campo[aria-invalid="true"] { border-color: var(--perigo-text) !important; }
  .maq-campo:disabled { background-color: var(--n2) !important; color: var(--n7) !important; }
  .maq-campo::placeholder { color: var(--n7); }
  .maq-campo::-webkit-search-cancel-button { display: none; }

  /* Segmentado (período do resumo) e setas do dia agrupadas numa peça só. */
  .maq-seg { transition: background-color var(--dur-rapida) ease, color var(--dur-rapida) ease; }
  .maq-seg[aria-pressed="false"]:hover { background-color: var(--n2) !important; color: var(--n10) !important; }
  .maq-seg:focus-visible, .maq-nav:focus-visible { outline-offset: -2px; }
  .maq-nav { transition: background-color var(--dur-rapida) ease, color var(--dur-rapida) ease; }
  .maq-nav:hover:not(:disabled) { background-color: var(--n2) !important; }
  .maq-nav:disabled { cursor: not-allowed; }
`;
