// ─────────────────────────────────────────────────────────────────────────────
// INTEGRAÇÃO COM O CHECKLIST DE ARENA — a regra de "peça da Arena entregue".
//
// O Checklist de Arena é outro app: ele confere, na montagem, o que a Gráfica
// entregou. Ele só LÊ daqui (server/routes/integracao-checklist.ts). A regra
// do que conta como "entregue" mora neste arquivo, pura e testada, porque é
// ela que decide o que o montador vai procurar no chão do evento — uma peça a
// mais vira "faltando" que não falta; uma a menos some da conferência.
//
// A regra, peça a peça:
//   · peça excluída (deleted_at) não existe para ninguém;
//   · peça do Kit (kit_remessa_id) tem remessa e datas próprias — o Checklist
//     é da ARENA;
//   · o "book completo" não é peça física (shared/fluxo-peca.ts);
//   · cancelada/arquivada saiu do funil, mesmo que um dia tenha saído algo;
//   · o que conta é a QUANTIDADE entregue, não o status: entrega parcial por
//     volume (7 de 10) já está no chão e precisa ser conferida.
//
// A rota de lista de eventos repete esta regra em SQL (agregação no banco, sem
// trazer as peças para o JS). Mexeu aqui, mexa lá — os dois lados leem as
// mesmas listas de status de shared/fluxo-peca.ts.
// ─────────────────────────────────────────────────────────────────────────────
import { ehBookCompleto, ehEntregue, ehForaDoFunil } from "./fluxo-peca";

/** O mínimo da peça que a regra lê. */
export interface PecaParaChecklist {
  type: string | null;
  status: string | null;
  quantity: number;
  deliveredQty: number | null;
  deletedAt: Date | string | null;
  kitRemessaId: string | null;
}

/**
 * Quantas unidades da peça já saíram para a Arena. Zero = não entra no
 * Checklist.
 *
 * O caso legado: peça entregue ANTES da entrega parcial existir tem
 * `delivered_qty` 0 — a entrega era da peça inteira e ninguém contava
 * unidade. Ler o 0 ao pé da letra sumiria com todo o acervo antigo; por isso
 * status entregue com 0 vale a quantidade toda. E o teto é a quantidade: um
 * delivered_qty acima dela (complemento, correção à mão) não inventa peça.
 */
export function quantidadeEntregueParaChecklist(p: PecaParaChecklist): number {
  if (p.deletedAt) return 0;
  if (p.kitRemessaId) return 0;
  if (ehBookCompleto(p)) return 0;
  if (ehForaDoFunil(p.status)) return 0;
  const quantidade = Math.max(0, Number(p.quantity) || 0);
  const entregue = Math.max(0, Number(p.deliveredQty) || 0);
  if (ehEntregue(p.status) && entregue === 0) return quantidade;
  return Math.min(entregue, quantidade);
}

export const entraNoChecklist = (p: PecaParaChecklist): boolean => quantidadeEntregueParaChecklist(p) > 0;

/**
 * O grupo de cada tipo de peça, do jeito que a Revisão Final agrupa
 * (typeToGroup em client/src/pages/solicitacao.tsx): o `group` do item padrão
 * cujo NOME é o tipo da peça, ignorando grupo vazio. Quando dois modelos têm o
 * mesmo nome, a tela fica com o mais ANTIGO (a lista vem do mais novo para o
 * mais antigo e a última escrita vence) — aqui a mesma escolha, explícita.
 */
export function grupoPorTipo(
  modelos: ReadonlyArray<{ name: string; group: string | null; createdAt: Date | string | null; id?: string }>,
): Map<string, string> {
  const ordenados = [...modelos].sort((a, b) => {
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return ta - tb || String(a.id ?? "").localeCompare(String(b.id ?? ""));
  });
  const mapa = new Map<string, string>();
  for (const m of ordenados) {
    if (m.group && !mapa.has(m.name)) mapa.set(m.name, m.group);
  }
  return mapa;
}

/**
 * A ordem da Revisão Final: grupo, depois tipo (e o código desempata, para a
 * lista não mudar de ordem entre duas leituras). Sem grupo vai PRIMEIRO, como
 * na tela — lá o grupo ausente vira "" e "" vem antes de tudo. O montador
 * compara as duas listas lado a lado; ordens diferentes seriam uma armadilha.
 */
export function compararComoARevisaoFinal(
  a: { grupo: string | null; tipo: string | null; codigo: string },
  b: { grupo: string | null; tipo: string | null; codigo: string },
): number {
  return (a.grupo || "").localeCompare(b.grupo || "", "pt-BR")
    || (a.tipo || "").localeCompare(b.tipo || "", "pt-BR")
    || a.codigo.localeCompare(b.codigo, "pt-BR", { numeric: true });
}
