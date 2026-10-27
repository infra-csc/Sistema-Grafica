// PEÇAS SEM APROVAÇÃO NA GESTÃO DE PRAZOS (Pedro/dono, 26/10) — os helpers
// PUROS que a página e os blocos de `components/prazos/*` dividem.
//
// A regra mora em @shared/prazo-sem-aprovacao e é aplicada NO SERVIDOR: o
// payload de /api/prazos já chega com o prazo de cada peça (`item.prazo`), o
// prazo que vale para cada etapa (`stage.prazoEfetivo`), as atrasadas da etapa
// (`stage.atrasadas`) e o atraso do cliente (`item.atrasoDoCliente`). Aqui só
// se decide O QUE MOSTRAR — e num lugar só, para o quadro, a tabela, o cartão
// do celular e o drill não escreverem cada um a sua versão de "ajustado".
//
// PAYLOAD ANTIGO. Um Express de antes (git pull sem Stop/Run) responde sem os
// campos novos: todo helper cai na leitura de sempre (`deadline`,
// `pendingCount`), nunca em `undefined` na tela.
import {
  ROTULO_AGUARDANDO_ARTE, ROTULO_ARTE_DO_CLIENTE, ROTULO_ATRASO_DO_CLIENTE, ROTULO_SEM_PATROCINIO,
} from "@shared/prazo-sem-aprovacao";
import type { PrazoEvent, PrazoPendingItem, PrazoStage } from "@shared/prazos-contract";
import { fmtDayMonth } from "./tokens";

// ─── O prazo da etapa ────────────────────────────────────────────────────────

/** O prazo que MEDE a etapa agora: o efetivo (26/10), ou o do calendário num payload antigo. */
export const prazoDaEtapa = (s: Pick<PrazoStage, "deadline" | "prazoEfetivo">): string =>
  s.prazoEfetivo ?? s.deadline;

/**
 * A etapa está medida por um prazo AJUSTADO: no gate dela só restam peças sem
 * aprovação ainda em Layout, e o semáforo conta do Layout ajustado delas — não
 * do prazo do calendário do evento.
 */
export const etapaComPrazoAjustado = (s: Pick<PrazoStage, "deadline" | "prazoEfetivo">): boolean =>
  !!s.prazoEfetivo && s.prazoEfetivo !== s.deadline;

/** Das peças do gate, as que já passaram do prazo DELAS (cai em `pendingCount` num payload antigo). */
export const atrasadasDaEtapa = (s: Pick<PrazoStage, "atrasadas" | "pendingCount">): number =>
  s.atrasadas ?? s.pendingCount;

/** A frase da dica do prazo ajustado — a mesma no quadro, na tabela, no cartão e no drill. */
export function dicaDoPrazoAjustado(s: Pick<PrazoStage, "deadline" | "prazoEfetivo">): string {
  return `Prazo do evento ${fmtDayMonth(s.deadline)} · ajustado ${fmtDayMonth(prazoDaEtapa(s))} — `
    + "só restam peças sem aprovação (Sem patrocínio / Arte do cliente) nesta etapa: "
    + "vale o prazo de Layout + os dias corridos da Aprovação.";
}

// ─── Atraso do cliente (RN09) ────────────────────────────────────────────────

/** " · 1 do cliente" — a fatia do atraso que é do cliente, ou "" quando não há. */
export function sufixoDoCliente(n: number | null | undefined): string {
  // "(N do cliente)" e não "· N do cliente": as do cliente estão DENTRO do
  // total que vem antes — o ponto lia como uma segunda contagem (revisão 27/10).
  return n && n > 0 ? ` (${n} do cliente)` : "";
}

/**
 * As peças com atraso do cliente cobradas NESTA etapa (pelo marco que as mede —
 * o de Layout, na peça sem aprovação). `pecasAtrasoDoCliente` é do EVENTO; no
 * card de uma coluna o número tem de ser o da coluna.
 */
export function atrasoDoClienteNaEtapa(ev: Pick<PrazoEvent, "pendingItems" | "stages">, stageKey: string): number {
  const i = ev.stages.findIndex((s) => s.key === stageKey);
  if (i < 0) return 0;
  return ev.pendingItems.filter((it) => it.atrasoDoCliente && it.marcoIndex === i).length;
}

/** A dica do atraso do cliente (o mesmo texto onde houver o número). */
/** A MESMA dica do selo (selo-sem-aprovacao) — uma frase só para "Atraso do cliente" no app. */
export { DICA_DO_SELO_ATRASO_DO_CLIENTE as DICA_ATRASO_DO_CLIENTE } from "@/components/selo-sem-aprovacao";

// ─── O filtro pelas marcas (RF11) ────────────────────────────────────────────

/**
 * O NOME DO FILTRO E DAS OPÇÕES, para o usuário (revisão 27/10). "Marca da
 * peça" / "qualquer marca" confundia: nestas telas "marca" também quer dizer
 * PATROCINADOR. O filtro chama "Aprovação" (e não "Peças sem aprovação", que
 * brigava com a opção "Com aprovação"); as opções usam os nomes canônicos e
 * são AS MESMAS na Gestão de Prazos e nas Análises. Os ids (e a `?marca=` da
 * URL) não mudam.
 */
export const ROTULO_DO_FILTRO_SEM_APROVACAO = "Aprovação";
export const ROTULO_TODAS_AS_PECAS = "Todas as peças";
const ROTULOS_DAS_OPCOES: Readonly<Record<string, string>> = {
  todas: ROTULO_TODAS_AS_PECAS,
  semAprovacao: `Sem aprovação (${ROTULO_SEM_PATROCINIO} ou ${ROTULO_ARTE_DO_CLIENTE})`,
  semPatrocinio: ROTULO_SEM_PATROCINIO,
  arteDoCliente: ROTULO_ARTE_DO_CLIENTE,
  aguardandoArte: ROTULO_AGUARDANDO_ARTE,
  atrasoDoCliente: ROTULO_ATRASO_DO_CLIENTE,
  comAprovacao: "Com aprovação",
};
/** O rótulo de uma opção do filtro (as duas telas); `padrao` para um id novo. */
export const rotuloDaOpcaoSemAprovacao = (id: string, padrao: string): string => ROTULOS_DAS_OPCOES[id] ?? padrao;

/**
 * As opções do filtro na Gestão — as mesmas das Análises (revisão 27/10).
 * "all" é o "Todas as peças" do FilterSelect.
 */
export type FiltroDeMarcaPrazos =
  | "all" | "semAprovacao" | "semPatrocinio" | "arteDoCliente" | "aguardandoArte" | "atrasoDoCliente" | "comAprovacao";

export const OPCOES_DE_MARCA_PRAZOS: ReadonlyArray<{ id: Exclude<FiltroDeMarcaPrazos, "all">; rotulo: string }> =
  (["semAprovacao", "semPatrocinio", "arteDoCliente", "aguardandoArte", "atrasoDoCliente", "comAprovacao"] as const)
    .map((id) => ({ id, rotulo: ROTULOS_DAS_OPCOES[id] }));

/** O valor da URL (`?marca=`), validado — o resto vira "all". */
export function lerFiltroDeMarca(raw: string | null | undefined): FiltroDeMarcaPrazos {
  return OPCOES_DE_MARCA_PRAZOS.some((o) => o.id === raw) ? (raw as FiltroDeMarcaPrazos) : "all";
}

export const rotuloDaMarca = (f: FiltroDeMarcaPrazos): string =>
  OPCOES_DE_MARCA_PRAZOS.find((o) => o.id === f)?.rotulo ?? ROTULO_TODAS_AS_PECAS;

type MarcasDoItem = Pick<PrazoPendingItem, "semPatrocinio" | "arteDoCliente" | "aguardandoArteDoCliente" | "atrasoDoCliente">;

/** A peça passa no filtro? (Campos ausentes num payload antigo contam como "sem marca".) */
export function itemPassaNaMarca(it: Partial<MarcasDoItem>, f: FiltroDeMarcaPrazos): boolean {
  switch (f) {
    case "semAprovacao": return !!it.semPatrocinio || !!it.arteDoCliente;
    case "semPatrocinio": return !!it.semPatrocinio;
    case "arteDoCliente": return !!it.arteDoCliente;
    case "aguardandoArte": return !!it.aguardandoArteDoCliente;
    case "atrasoDoCliente": return !!it.atrasoDoCliente;
    case "comAprovacao": return !it.semPatrocinio && !it.arteDoCliente;
    default: return true;
  }
}

/** O evento passa quando ALGUMA peça pendente dele passa (RF11). */
export function eventoPassaNaMarca(ev: Pick<PrazoEvent, "pendingItems">, f: FiltroDeMarcaPrazos): boolean {
  return f === "all" || ev.pendingItems.some((it) => itemPassaNaMarca(it, f));
}

/** Quantos passam em cada opção (as opções se sobrepõem: "Sem aprovação" contém as outras marcas). */
export function contarPorMarca<T>(lista: readonly T[], marcas: (x: T) => Partial<MarcasDoItem> | ReadonlyArray<Partial<MarcasDoItem>>): Map<FiltroDeMarcaPrazos, number> {
  const m = new Map<FiltroDeMarcaPrazos, number>();
  for (const x of lista) {
    const r = marcas(x);
    const itens = Array.isArray(r) ? r : [r as Partial<MarcasDoItem>];
    for (const o of OPCOES_DE_MARCA_PRAZOS) {
      if (itens.some((it) => itemPassaNaMarca(it, o.id))) m.set(o.id, (m.get(o.id) ?? 0) + 1);
    }
  }
  return m;
}
