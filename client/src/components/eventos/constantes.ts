// Constantes da tela de Eventos: cotas, marcos e prazos, e o teto da grade.
import type { Sponsor } from "@shared/schema";
import { MARCOS_DO_EVENTO, OFFSET_PADRAO_DO_MARCO } from "@shared/prazo-dates";
import { T, N, TOM } from "@/lib/theme";
import type { CampoDePrazo } from "./tipos";

// ── Cotas de patrocinador ────────────────────────────────────────────────────
// Par {dot, text} na mesma disciplina de lib/status.ts: hex SATURADO só em
// borda/bolinha, tom escuro 700/800 no TEXTO. Antes a cor saturada era usada
// como cor de texto em 11px sobre um tint de 9% dela mesma: 4 das 6 cotas
// reprovavam AA (MASTER 3,18:1 · MIDIA 3,14:1 · MINISTERIO 3,21:1 · APOIO
// 4,10:1) medindo contra o fundo composto real da linha selecionada (#fff8f2).
// Os pares abaixo são os mesmos da paleta `P` de lib/status.ts (tint 50 + tom
// 700), já auditados. DÍVIDA CONHECIDA: `IMPORT_QUOTA_COLORS`
// (import-xlsx-dialog.tsx:41) mantém um terceiro conjunto — MASTER é #ef4444
// aqui e #dc2626 lá. Ao mover QUOTAS para `shared`, escolha UM par por cota.
export const QUOTA_OPTIONS = [
  { value: "MASTER",     label: "Master",     dot: TOM.perigo.dot, text: TOM.perigo.text, bg: TOM.perigo.bg, border: TOM.perigo.border },
  { value: "GOLD",       label: "Gold",       dot: TOM.info.dot, text: TOM.info.text, bg: TOM.info.bg, border: TOM.info.border },
  { value: "SILVER",     label: "Silver",     dot: TOM.roxo.dot, text: TOM.roxo.text, bg: TOM.roxo.bg, border: TOM.roxo.border },
  { value: "APOIO",      label: "Apoio",      dot: T.second, text: T.strong, bg: N.n2, border: T.border },
  { value: "MIDIA",      label: "Mídia",      dot: TOM.ciano.dot, text: TOM.ciano.text, bg: TOM.ciano.bg, border: TOM.ciano.border },
  { value: "MINISTERIO", label: "Ministério", dot: TOM.esmeralda.dot, text: TOM.esmeralda.text, bg: TOM.esmeralda.bg, border: TOM.esmeralda.border },
];

// Offsets padrão dos prazos (dias relativos à saída do caminhão).
// Os offsets padrão, da mesma fonte.
export const DEFAULT_DEADLINES = OFFSET_PADRAO_DO_MARCO as Record<CampoDePrazo, number>;

export type DeadlineField = CampoDePrazo;

// Os marcos, na ORDEM da cadeia causal. `key` casa com `nextMilestone.key`
// do servidor (server/routes/events.ts MARCO_DEFS) — é o que permite pintar a
// bolinha do card com a cor do marco sem duplicar a conta de prazo.
// Os marcos vêm de @shared/prazo-dates — a MESMA lista que o servidor usa em
// MARCO_DEFS e que o Calendário desenha.
//
// Ela estava escrita à mão em TRÊS lugares, e o Calendário tinha ficado com
// CINCO: faltava a Finalização (−10). Três cópias com duas certas não é
// coincidência — é o prazo de uma delas não ter sido atualizado, e ninguém
// ter como perceber, porque nada quebra quando uma lista fica para trás.
export const MARCO_FIELDS: {
  field: DeadlineField;
  key: string;
  label: string;
  desc: string;
  color: string;
  allDays: boolean;
}[] = MARCOS_DO_EVENTO.map((m) => ({
  field: m.campo as DeadlineField,
  key: m.key,
  label: m.label,
  desc: m.descricao,
  color: m.cor,
  allDays: m.todosOsDias,
}));
export const MARCO_COLOR: Record<string, string> = Object.fromEntries(MARCO_FIELDS.map((m) => [m.key, m.color]));

// Rótulo do botão "Restaurar padrão", DERIVADO dos offsets. Era a lista
// datilografada "(−25 / −20 / −12 / −8 / −1)": acrescentar um marco deixava o
// botão mentindo sobre o que ele restaura, sem erro de compilação.
// U+2212 (menos) e não hífen — é o sinal que o resto da tela usa em fmtOffset.
export const DEFAULT_OFFSETS_LABEL = MARCO_FIELDS
  .map((m) => `−${Math.abs(DEFAULT_DEADLINES[m.field])}`)
  .join(' / ');

export const MONTH_NAMES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

// Quantos cards a grade monta de primeira. É a única lista do app que só
// cresce (nada nunca sai dela), então segue o mesmo teto do Painel Geral e do
// detalhe do evento: 50 + "Mostrar todos".
export const CARD_PAGE = 50;
/** Lista vazia com identidade fixa — `[]` no render quebraria o memo do cartão. */
export const SEM_PATROCINADORES: Sponsor[] = [];
