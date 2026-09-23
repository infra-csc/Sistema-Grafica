// ─────────────────────────────────────────────────────────────────────────────
// MOLDE — o tipo de peça de fluxo CURTO (dono, 22/09).
//
// "Novo tipo de peça chamado MOLDE: a criação é feita normal, mas não vai
// passar por Vincular Patrocinadores; a Arte coloca o thumb e depois já vai
// direto para a Revisão; na Gráfica ele vai ter apenas o status de Produzido;
// claro, depois de ser liberado. O fluxo dele morre no Produzido."
//
// O fluxo do molde, de ponta a ponta:
//
//   Criação (rascunho) ──enviar lista──▶ awaiting_submission   (pula a Vinculação)
//   Arte sobe o thumb e envia ─────────▶ awaiting_final_review (pula aprovação
//                                                                E finalização)
//   Revisão Final libera ──────────────▶ ready_for_production  (sem arquivo final)
//   Gráfica "Marcar como produzido" ───▶ produced              ← ESTADO FINAL
//
// Para o molde, `produced` é o FIM: não há conferência, embalagem, tubo,
// etiqueta nem entrega. Onde o app conta "peça concluída" (progresso do
// evento, evento concluído, barras de fase, Gestão de Prazos, Painel), o molde
// produzido conta como a peça ENTREGUE conta — é isso que `statusParaContagem`
// e `comStatusDeContagem` fazem, sem gravar nada diferente no banco.
//
// O padrão de `shared/fluxo-peca.ts` vale aqui: a regra mora num lugar só e
// servidor e telas leem DESTE arquivo. Os pontos compartilhados só chamam as
// funções abaixo — uma linha cada.
// ─────────────────────────────────────────────────────────────────────────────

/** O nome canônico do tipo, como a lista de tipos e a importação gravam. */
export const TIPO_MOLDE = "Molde";

/**
 * A LISTA DE TIPOS DE PEÇA — a única. O Detalhe do Evento e os Modelos
 * tinham cada um a sua cópia (iguais por sorte); o Molde entra aqui e as duas
 * telas passam a ler daqui.
 */
export const TIPOS_DE_PECA: readonly string[] = [
  "2x1", "Arena", "Halter", TIPO_MOLDE, "Palco", "Painel Rosto", "Percurso", "Pórtico",
  "Prismas", "Qd Fotos", "Rolo", "Stand", "Testeiras", "WindBanner",
];

/** Sem acento, sem caixa, sem espaço nas pontas: "MOLDE", "Molde", " moldes " → "molde(s)". */
const normalizar = (s: string | null | undefined): string =>
  String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

/** O texto do tipo é "molde"? Aceita caixa, acento e plural ("MOLDE", "Moldes"). */
export const ehTipoMolde = (tipo: string | null | undefined): boolean =>
  /^moldes?$/.test(normalizar(tipo));

/** A peça é um molde? — o predicado que todo o resto usa. */
export const ehMolde = (item: { type?: string | null } | null | undefined): boolean =>
  ehTipoMolde(item?.type);

/**
 * O tipo como deve ser gravado: qualquer grafia de molde vira "Molde"; o resto
 * passa intacto. Usado na importação de planilha ("MOLDE", "moldes").
 */
export const tipoCanonico = (tipo: string): string => (ehTipoMolde(tipo) ? TIPO_MOLDE : tipo);

// ── Etapas ──────────────────────────────────────────────────────────────────

/**
 * Para onde a lista enviada leva a peça: o molde pula a Vinculação e cai
 * direto na mesa da Arte (`awaiting_submission`); as demais seguem para
 * `awaiting_linking`.
 */
export const statusAoEnviarALista = (item: { type?: string | null }): "awaiting_submission" | "awaiting_linking" =>
  ehMolde(item) ? "awaiting_submission" : "awaiting_linking";

/** Onde o molde cai quando a Arte envia o thumb: direto na Revisão Final. */
export const DESTINO_DO_ENVIO_DO_MOLDE = "awaiting_final_review";

/** Liberado para a Gráfica — de onde o molde pode ser marcado como produzido. */
export const MOLDE_LIBERADO: readonly string[] = ["ready_for_production", "pronto_para_producao", "approved", "liberado"];

const PRODUZIDO: readonly string[] = ["produced", "produzido"];

/** Molde liberado, esperando a Gráfica marcar como produzido. */
export const moldePodeSerProduzido = (item: { type?: string | null; status?: string | null } | null | undefined): boolean =>
  ehMolde(item) && MOLDE_LIBERADO.includes(String(item?.status ?? ""));

/** Molde que chegou ao FIM do fluxo dele (produzido). */
export const moldeConcluido = (item: { type?: string | null; status?: string | null } | null | undefined): boolean =>
  ehMolde(item) && PRODUZIDO.includes(String(item?.status ?? ""));

/**
 * O status que as CONTAGENS enxergam: molde produzido conta como entregue
 * (concluído); todo o resto, o status gravado. Não é para exibir nem para
 * decidir ação — só para somar.
 */
export const statusParaContagem = (item: { type?: string | null; status?: string | null }): string =>
  moldeConcluido(item) ? "delivered" : String(item?.status ?? "");

/** A peça com o status de contagem — para funções que leem `it.status` direto. */
export function comStatusDeContagem<T extends { type?: string | null; status: string }>(item: T): T {
  return moldeConcluido(item) ? { ...item, status: "delivered" } : item;
}

/** O status "de exibição" do molde produzido — selo "Produzido (molde)". */
export const STATUS_MOLDE_PRODUZIDO = "molde_produzido";

/** O status para o SELO: molde produzido ganha rótulo próprio, sem "Acabamento". */
export const statusDeExibicao = (item: { type?: string | null; status?: string | null }): string =>
  moldeConcluido(item) ? STATUS_MOLDE_PRODUZIDO : String(item?.status ?? "");

/**
 * A devolução da Revisão tem dois destinos — "arte" (refaz o thumb) e
 * "finalizacao" (troca o arquivo final). O molde não tem finalização: o único
 * destino que existe para ele é a Arte.
 */
export const destinoDaDevolucao = <D extends string>(destino: D, item: { type?: string | null }): D | "arte" =>
  ehMolde(item) ? "arte" : destino;

/** A peça dispensa o arquivo final para ser liberada? (molde: sim.) */
export const dispensaArquivoFinal = (item: { type?: string | null } | null | undefined): boolean => ehMolde(item);

/** Tem o arquivo final, ou não precisa dele. */
export const arquivoFinalOk = (item: { type?: string | null; finalFileUrl?: string | null } | null | undefined): boolean =>
  !!item?.finalFileUrl || dispensaArquivoFinal(item);

/**
 * O que a Gráfica pode fazer com um molde — só dois gestos, e nenhum outro:
 *   · "produzir": liberado → produzido (a peça inteira, sem impressora);
 *   · "desfazer": produzido → liberado, enquanto ninguém mexeu.
 * Conferir, embalar, entregar, tubo, etiqueta, impressora, reserva: nunca.
 */
export type GestoDoMolde = "produzir" | "desfazer";

export function gestoDoMolde(item: {
  type?: string | null; status?: string | null; quantityProduced?: number | null; isReuse?: boolean | null;
  conferredQty?: number | null; embaladaQty?: number | null; deliveredQty?: number | null;
} | null | undefined): GestoDoMolde | null {
  if (!ehMolde(item)) return null;
  if (moldePodeSerProduzido(item)) return "produzir";
  // Desfazer só o que foi marcado pela Gráfica (há quantidade produzida) — o
  // reaproveitamento total vira "produzido" na Revisão, e não se desfaz aqui.
  if (moldeConcluido(item) && !item?.isReuse && (item?.quantityProduced ?? 0) > 0
    && !(item?.conferredQty ?? 0) && !(item?.embaladaQty ?? 0) && !(item?.deliveredQty ?? 0)) {
    return "desfazer";
  }
  return null;
}

/** Quanto o molde "produz" ao ser marcado: a peça inteira menos o reaproveitado. */
export const quantidadeProduzidaDoMolde = (item: { quantity?: number | null; reuseQty?: number | null }): number =>
  Math.max(0, Number(item?.quantity ?? 0) - Number(item?.reuseQty ?? 0));

/** A trilha de etapas do molde na ficha — três, e só três. */
export const ETAPAS_DO_MOLDE: readonly { label: string; idx: number }[] = [
  { label: "Arte", idx: 0 },
  { label: "Revisão", idx: 1 },
  { label: "Produzido", idx: 2 },
];

/**
 * Em que etapa da trilha do molde a peça está: −1 antes da Arte (rascunho),
 * 0 Arte, 1 Revisão, 2 liberado (esperando o "produzido"), 3 = tudo feito.
 */
export function etapaDoMolde(status: string | null | undefined): number {
  const s = String(status ?? "");
  if (["draft", "requested", "awaiting_linking"].includes(s)) return -1;
  if (s === "awaiting_submission") return 0;
  if (["awaiting_final_review", "awaiting_review", "in_review"].includes(s)) return 1;
  if ([...MOLDE_LIBERADO, "inProduction", "em_producao"].includes(s)) return 2;
  if (PRODUZIDO.includes(s)) return 3;
  // Estados do fluxo comum que o molde não deveria visitar (aprovação,
  // finalização): contam como Arte — é de lá que ele sai.
  if (["awaiting_approval", "awaiting_sponsor_approval", "sponsor_approved", "awaiting_finalization", "awaiting_creator_review"].includes(s)) return 0;
  return -1;
}

// ── As frases da trilha (servidor) ──────────────────────────────────────────
export const TRILHA_ENVIO_DO_MOLDE =
  "Molde: thumb enviado direto para a Revisão Final (sem aprovação de patrocinador nem arquivo final)";
export const TRILHA_MOLDE_PRODUZIDO = "Molde marcado como produzido";
export const TRILHA_MOLDE_DESFEITO = "Molde voltou para liberado (produção desfeita)";

// ── Trocar de/para molde (revisão adversarial, 22/09) ───────────────────────
//
// O molde tem OUTRO fluxo (pula Vinculação, aprovação, finalização, conferência,
// embalagem e entrega). Trocar o tipo de/para Molde no meio do caminho deixaria
// a peça num estado que o outro fluxo não conhece: um molde em "Aguardando
// aprovação" com rodada de patrocinador aberta, ou uma peça comum "Produzida"
// sem nunca ter passado pela impressora. Só no rascunho a troca é segura.

/** Onde a peça ainda é rascunho — o único lugar em que o tipo pode virar/deixar de ser molde. */
export const STATUS_QUE_PERMITEM_TROCAR_MOLDE: readonly string[] = ["draft", "requested", "rascunho"];

export const ERRO_TROCA_DE_MOLDE =
  "Não dá para transformar em molde (ou deixar de ser molde) depois que a peça saiu do rascunho — crie uma peça nova";

/**
 * A troca de tipo pedida é proibida? Só quando cruza a fronteira do molde
 * (comum → molde ou molde → comum) FORA do rascunho. Trocar "Pórtico" por
 * "Arena" segue livre; tipo ausente/vazio (não mexe) também.
 */
export function trocaDeMoldeProibida(
  atual: { type?: string | null; status?: string | null } | null | undefined,
  novoTipo: string | null | undefined,
): boolean {
  if (!atual || novoTipo == null || String(novoTipo).trim() === "") return false;
  if (ehMolde(atual) === ehTipoMolde(novoTipo)) return false;
  return !STATUS_QUE_PERMITEM_TROCAR_MOLDE.includes(String(atual.status ?? ""));
}

/**
 * A lista de tipos que o formulário oferece. Criação e rascunho: todos. Fora do
 * rascunho, a fronteira do molde fica fechada — o molde só pode continuar molde,
 * e a peça comum não vê "Molde".
 */
export function tiposOferecidos(
  item: { type?: string | null; status?: string | null } | null | undefined,
  tipos: readonly string[] = TIPOS_DE_PECA,
): string[] {
  if (!item || STATUS_QUE_PERMITEM_TROCAR_MOLDE.includes(String(item.status ?? ""))) return [...tipos];
  return ehMolde(item) ? tipos.filter((t) => ehTipoMolde(t)) : tipos.filter((t) => !ehTipoMolde(t));
}
