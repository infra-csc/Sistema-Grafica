// ─────────────────────────────────────────────────────────────────────────────
// PRAZO DO MOLDE (dono, 22/09).
//
// "Vamos cadastrar o prazo (opcional) no evento: o solicitante coloca esse
// prazo para o MOLDE, apenas se tiver molde; ele seleciona no Eventos; mas
// esse prazo é apenas para o fluxo, NÃO entra na Gestão de Prazos."
//
// O dado: `events.prazo_molde` — um DIA, gravado ao meio-dia UTC (a mesma
// convenção das datas do Kit, shared/kit.ts: o dia não "escorrega" para o dia
// anterior em nenhum fuso do Brasil). NULL = o evento não tem prazo do molde, e
// o molde usa o prazo que sempre usou.
//
// ONDE VALE: só nas telas do FLUXO do molde (Arte, Revisão Final, Gráfica,
// ficha, Detalhe do evento), e só para peça `ehMolde`. ONDE NÃO VALE, DE
// PROPÓSITO: Gestão de Prazos (prazo-domain, painel-prazo), alertas por e-mail,
// digest, cobranças, Análises e a contagem de atraso do evento — nenhum desses
// lê este arquivo, e o teste `prazo-do-molde.test.ts` prova que um prazo do
// molde vencido não muda nada lá.
// ─────────────────────────────────────────────────────────────────────────────
import { ehMolde } from "./molde";

const DIA_MS = 86400000;
const RE_DIA = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Rótulo do marco, igual em todas as telas. */
export const ROTULO_PRAZO_MOLDE = "Prazo do molde";

/** A ajuda do campo no formulário do evento. */
export const AJUDA_PRAZO_MOLDE = "Só se o evento tiver molde. Usado no fluxo do molde; não entra na Gestão de Prazos.";

/** O aviso discreto no evento que tem molde e não tem prazo do molde. */
export const AVISO_MOLDE_SEM_PRAZO = "Há molde neste evento sem prazo do molde";

/** O dia ("YYYY-MM-DD") de um prazo gravado — lido em UTC, como foi gravado. */
export function diaDoPrazoMolde(v: string | Date | null | undefined): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "string" && RE_DIA.test(v)) return v;
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/**
 * O que gravar a partir do que o formulário mandou:
 *   · `undefined` — o campo não veio (PATCH parcial): não mexe;
 *   · `null`      — veio vazio: limpa;
 *   · `Date`      — o dia, ao meio-dia UTC;
 *   · `false`     — veio, mas não é uma data (a rota responde 400).
 */
export function prazoMoldeParaGravar(v: unknown): Date | null | undefined | false {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const dia = typeof v === "string" ? (RE_DIA.test(v.trim()) ? v.trim() : diaDoPrazoMolde(v)) : v instanceof Date ? diaDoPrazoMolde(v) : null;
  if (!dia) return false;
  const m = dia.match(RE_DIA)!;
  const ano = Number(m[1]);
  if (ano < 2000 || ano > 2100) return false;
  const d = new Date(Date.UTC(ano, Number(m[2]) - 1, Number(m[3]), 12, 0, 0));
  // 2026-02-31 vira março no Date: não é o dia que a pessoa escolheu.
  if (d.toISOString().slice(0, 10) !== dia) return false;
  return d;
}

/** "22/09/2026" — para a trilha e para a tela. */
export function prazoMoldeBR(v: string | Date | null | undefined): string | null {
  const dia = diaDoPrazoMolde(v);
  if (!dia) return null;
  const [a, m, d] = dia.split("-");
  return `${d}/${m}/${a}`;
}

/**
 * O prazo do MOLDE para as telas do fluxo, no MESMO formato de
 * `phaseDeadline` (lib/arte-rules): `{ label, date, diff }`, com `date` à
 * meia-noite LOCAL do dia e `diff` em dias contra `hoje`. `null` quando a
 * peça não é molde ou o evento não tem prazo do molde — aí vale o prazo de
 * sempre.
 */
export function prazoDoMolde(
  item: { type?: string | null } | null | undefined,
  evento: { prazoMolde?: string | Date | null } | null | undefined,
  hoje: Date,
): { label: string; date: Date; diff: number } | null {
  if (!ehMolde(item)) return null;
  const dia = diaDoPrazoMolde(evento?.prazoMolde ?? null);
  if (!dia) return null;
  const [a, m, d] = dia.split("-").map(Number);
  const date = new Date(a, m - 1, d);
  const base = new Date(hoje);
  base.setHours(0, 0, 0, 0);
  return { label: ROTULO_PRAZO_MOLDE, date, diff: Math.round((date.getTime() - base.getTime()) / DIA_MS) };
}

/** O evento tem molde (vivo) e não tem prazo do molde? — o aviso discreto. */
export function eventoTemMoldeSemPrazo(
  evento: { prazoMolde?: string | Date | null } | null | undefined,
  pecas: Array<{ type?: string | null; status?: string | null; deletedAt?: unknown }>,
): boolean {
  if (!evento || diaDoPrazoMolde(evento.prazoMolde ?? null)) return false;
  return pecas.some((p) => ehMolde(p) && !p.deletedAt && !["canceled", "cancelled", "archived"].includes(String(p.status ?? "")));
}
