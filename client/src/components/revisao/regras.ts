// ─────────────────────────────────────────────────────────────────────────────
// AS REGRAS DA REVISÃO FINAL que não dependem de estado: o status da fila, a
// chave da lista, para onde a peça vai ao ser liberada, a régua do motivo da
// devolução e o lote de N chamadas. Funções puras — fora do componente para
// não serem recriadas a cada render e para poderem ser testadas sozinhas.
// ─────────────────────────────────────────────────────────────────────────────
import { apiRequest } from "@/lib/queryClient";
import { FORMATO_COMPACTO, expandirResposta } from "@shared/itens-compactos";
import { arquivoFinalOk } from "@shared/molde";
import { parseApiError } from "@/components/aumentar-quantidade-dialog";
import { T } from "@/lib/theme";
import type { PecaDaRevisao } from "./tipos";

// Tons de texto desta paleta valem para superfícies CLARAS (bg/surface).
// Sobre os painéis escuros (#0c0a09/#1c1917) use #a8a29e ou mais claro —
// #746e69 e #57534e reprovam WCAG AA nesses fundos.
export const TI = {
  bg: T.bg, surface: T.surface, border: T.border,
  text: T.text, secondary: T.second, muted: T.muted,
  accent: T.accent, dark: T.text,
};

// Status que esta tela revisa. O vocabulário canônico (rótulo/cores) vive em
// lib/status: "awaiting_final_review" → "Aguardando Revisão Final".
export const REVIEW_STATUS = "awaiting_final_review";

// A LISTA DESTA TELA VEM RECORTADA NO SERVIDOR. Ler ["/api/items"] traria o
// acervo inteiro (milhares de peças) para mostrar as poucas em "Aguardando
// Revisão Final". GET /api/items?status= devolve só essas, enriquecidas do
// mesmo jeito (Kit, patrocinadores na mesma ordem, complemento e `parent`),
// com delta e formato compacto (lib/queryClient.ts). A chave fica dentro do
// prefixo "/api/items": as invalidações do WebSocket e das mutações continuam
// atingindo esta lista, e a peça liberada/devolvida sai dela pelo delta.
//
// Tudo o que a tela lê de `items` é desta fila, com DUAS exceções que precisam
// de peça de outro status — e que buscam só a peça (`buscarPecaAtual`):
//   · o aviso do link `?item=` para peça que já saiu da fila diz o CÓDIGO dela;
//   · o 409 USE_COMPLEMENT (a peça foi liberada e produzida em outra aba com o
//     modal aberto) abre o complemento com a peça como ela está AGORA.
export const CHAVE_DA_REVISAO = ["/api/items", `?status=${REVIEW_STATUS}`] as const;

/**
 * A peça, como está agora no servidor — ou `null` (excluída, fora do que o
 * usuário enxerga, rede fora). Só ela, pelo recorte `?ids=`.
 */
export async function buscarPecaAtual(id: string): Promise<PecaDaRevisao | null> {
  try {
    const res = await apiRequest("GET", `/api/items?ids=${encodeURIComponent(id)}&formato=${FORMATO_COMPACTO}`);
    // `expandirResposta` devolve `unknown`: é a lista de peças do recorte, ou
    // outra coisa se o servidor respondeu fora do formato — daí o Array.isArray.
    const lista = expandirResposta(await res.json());
    return Array.isArray(lista) ? (lista as PecaDaRevisao[]).find((i) => i?.id === id) ?? null : null;
  } catch {
    return null;
  }
}

/**
 * Para onde a peça vai ao ser liberada — o MESMO critério do servidor.
 * PATCH /api/items/:id/creator-review trata a peça com reaproveitamento total
 * (`isReuse`) como "não precisa produzir": ela vai direto para Impresso /
 * Acabamento (a conferência da Gráfica) e não exige arquivo final. As demais,
 * inclusive reaproveitamento parcial, vão para Pronto para Produção.
 */
export function reaproveitamentoTotal(item: { isReuse?: boolean | null } | null | undefined): boolean {
  return !!item?.isReuse;
}
/** Frase no passado, para o aviso depois de liberar. */
export function destinoAoLiberar(item: { isReuse?: boolean | null } | null | undefined): string {
  return reaproveitamentoTotal(item)
    ? "foi direto para Impresso / Acabamento, na conferência da Gráfica (reaproveitamento total — não passa pela impressão)"
    : "entrou na fila da Gráfica como Pronto para Produção";
}

/**
 * A peça pode ser liberada agora? A MESMA régua do servidor: tem arquivo final
 * (ou não precisa — molde), ou é reaproveitamento total, que não imprime nada.
 */
export function prontaParaLiberar(item: Pick<PecaDaRevisao, "type" | "finalFileUrl" | "isReuse">): boolean {
  return arquivoFinalOk(item) || reaproveitamentoTotal(item);
}

/** "3 un · 100×200 · 2 m²" — a mesma frase na coluna própria ou fundida na Peça. */
export function medidaDaPeca(item: Pick<PecaDaRevisao, "quantity" | "fileWidth" | "fileHeight" | "calculatedM2">): string {
  return `${item.quantity ?? 0} un`
    + (item.fileWidth && item.fileHeight ? ` · ${item.fileWidth}×${item.fileHeight}` : "")
    + (item.calculatedM2 ? ` · ${item.calculatedM2} m²` : "");
}

/** Quantas chamadas o lote faz ao mesmo tempo: 40 de uma vez afogavam o servidor. */
export const LOTE_CONCORRENTE = 5;

/**
 * Roda `fazer` em cada id, de LOTE_CONCORRENTE em LOTE_CONCORRENTE, e devolve o
 * motivo de cada falha por id (a mensagem do servidor, não "erro").
 */
export async function emLotes(ids: string[], fazer: (id: string) => Promise<unknown>): Promise<Record<string, string>> {
  const falhas: Record<string, string> = {};
  for (let i = 0; i < ids.length; i += LOTE_CONCORRENTE) {
    const fatia = ids.slice(i, i + LOTE_CONCORRENTE);
    const r = await Promise.allSettled(fatia.map((id) => fazer(id)));
    r.forEach((x, j) => {
      if (x.status === "rejected") falhas[fatia[j]] = parseApiError(x.reason).message || "Não deu certo, e o motivo não veio junto — tente de novo.";
    });
  }
  return falhas;
}

// O servidor exige 10 caracteres em TODAS as portas de devolução
// (lerMotivoDevolucao, routes/items.ts). Uma régua só, nos dois lados: senão o
// botão habilita e a requisição volta 400.
export const MOTIVO_MIN = 10;
// A barra invertida importa: sem ela o regex come os "s" e um motivo cheio de
// "s" seria medido como mais curto do que é — o botão ficaria desabilitado sem
// explicar por quê.
export const motivoCurto = (t: string) => t.trim().replace(/\s+/g, " ").length < MOTIVO_MIN;
export const avisoMotivoCurto = `Explique o motivo em pelo menos ${MOTIVO_MIN} caracteres — a Arte precisa saber o que corrigir.`;
