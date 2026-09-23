import { T, TOM, FONT } from "@/lib/theme";

export const TIMELINE_STEPS = [
  { label: "Vinculação", idx: 0 },
  { label: "Arte",       idx: 1 },
  { label: "Aprovação",  idx: 2 },
  { label: "Finalização",idx: 3 },
  { label: "Revisão",    idx: 4 },
  { label: "Produção",   idx: 5 },
];

export const STATUS_STEP: Record<string, number> = {
  requested: -1, draft: -1,
  awaiting_linking: 0,
  awaiting_submission: 1,
  awaiting_approval: 2, awaiting_sponsor_approval: 2,
  awaiting_finalization: 3, sponsor_approved: 3, awaiting_creator_review: 3,
  awaiting_final_review: 4,
  ready_for_production: 5, approved: 5, inproduction: 5, inProduction: 5,
  produced: 6, conferred: 6, packed: 6, delivered: 6,
};

// ─────────────────────────────────────────────────────────────────────────────
// PALETA DA FICHA — três tons, e nada além deles.
//
// Não é paleta própria: são os mesmos campos de `P` (lib/status) que os chips
// do app já usam, nomeados aqui pelo PAPEL que exercem nesta tela. O modal já
// carregou uma paleta estrangeira uma vez (60 cores, tokens de Material 3); o
// jeito de não repetir é ter um lugar só onde a cor é escolhida.
//
// Os valores de texto foram medidos contra o fundo real de cada tom — ver o
// teste `a-ficha-da-peca-e-legivel`. #8c7164 sobre #fafaf9 dá 4,31 e por isso
// não aparece em lugar nenhum: o título de seção usa #7a6154 (5,49).
// ─────────────────────────────────────────────────────────────────────────────
export const TONS_DA_FICHA = {
  espera:    { bg: TOM.laranja.bg, borda: TOM.laranja.border, frase: T.accentText, detalhe: T.accentText, ladrilho: TOM.laranja.border },
  reprovado: { bg: TOM.perigo.bg, borda: TOM.perigo.border, frase: TOM.perigo.text, detalhe: TOM.perigo.text, ladrilho: TOM.perigo.border },
  ok:        { bg: TOM.sucesso.bg, borda: TOM.sucesso.border, frase: TOM.sucesso.text, detalhe: TOM.sucesso.text, ladrilho: TOM.sucesso.border },
  neutro:    { bg: T.bg, borda: T.border, frase: T.strong, detalhe: T.apoio, ladrilho: T.border },
} as const;
export type NomeDoTom = keyof typeof TONS_DA_FICHA;
export type TomDaFicha = (typeof TONS_DA_FICHA)[NomeDoTom];

/** Título de seção — fora do card, como uma legenda do bloco que vem abaixo. */
export const TITULO_SECAO: React.CSSProperties = {
  fontFamily: FONT.display, fontWeight: 900, fontSize: 10,
  textTransform: "uppercase", letterSpacing: "0.12em", color: T.second,
  margin: 0,
};

/** Bloco branco que recebe o conteúdo de uma seção. */
export const CARTAO: React.CSSProperties = {
  backgroundColor: T.surface, border: `1px solid ${T.border}`, borderRadius: 12,
};

export const DIA_MS = 86_400_000;
