// ─────────────────────────────────────────────────────────────────────────────
// DE ONDE VEM O REAPROVEITAMENTO (dono, 16/10).
//
// "Tem alguns eventos que a gente manda em caminhões conjugados — 2, 3 eventos
// no mesmo caminhão, que não volta pra SP; segue direto de uma etapa pra
// outra. Quando é assim, algumas peças entram no app como reaproveitar. Dá
// para marcar quando o reaproveitar é do ESTOQUE ou a peça está EM TRÂNSITO?
// Aí deixa uma observação e eu escrevo qual é a etapa."
//
// Duas origens, uma por peça (vale para TODAS as unidades reaproveitadas dela):
//
//   · ESTOQUE — a peça sai do galpão. "Os meninos já ficam espertos que têm
//     que procurar essa peça lá no estoque": a Gráfica vê "Buscar no estoque"
//     e recebe o aviso no sino. Depois de separadas, as unidades seguem o
//     fluxo de sempre (conferir → embalar → entregar).
//
//   · EM TRÂNSITO — a peça já está no caminhão, vindo de outra etapa. "Ela já
//     fica teoricamente finalizada, pois já saiu daqui": as unidades em
//     trânsito NÃO passam por conferir, embalar nem entregar. Elas saem da
//     conta física da peça — a QUANTIDADE FÍSICA (o que passa pelo galpão) é
//     a quantidade menos as unidades em trânsito, e é ela que os tetos de
//     shared/embalagem.ts leem. A peça 100% em trânsito fecha como ENTREGUE
//     (o terminal "resolvida para o evento") assim que é liberada, com a
//     trilha dizendo que não passou pela Gráfica.
//
// Sem origem (NULL) é o reaproveitamento de antes desta regra: segue igual ao
// estoque, sem o aviso — nada do acervo muda de comportamento.
//
// Tudo aqui é função pura: servidor, telas e testes leem as MESMAS contas.
// ─────────────────────────────────────────────────────────────────────────────

export const ORIGENS_DO_REAPROVEITAMENTO = ["estoque", "em_transito"] as const;
export type OrigemDoReaproveitamento = (typeof ORIGENS_DO_REAPROVEITAMENTO)[number];

export const ROTULO_DA_ORIGEM: Readonly<Record<OrigemDoReaproveitamento, string>> = {
  estoque: "Estoque",
  em_transito: "Em trânsito",
};

/** Teto da observação — é uma frase ("Night Run Salvador, etapa 17/10"), não um texto. */
export const OBS_DO_REAPROVEITAMENTO_MAX = 200;
/** "Em trânsito" pede a observação: pelo menos isto de texto. */
export const OBS_EM_TRANSITO_MIN = 3;
/** A instrução que a tela mostra e a recusa repete. */
export const INSTRUCAO_EM_TRANSITO = "Escreva de qual etapa/evento a peça vem";

export const ehOrigemDoReaproveitamento = (v: unknown): v is OrigemDoReaproveitamento =>
  typeof v === "string" && (ORIGENS_DO_REAPROVEITAMENTO as readonly string[]).includes(v);

/** A origem gravada, ou null para qualquer coisa que não seja uma das duas. */
export const origemDe = (p: { origemReaproveitamento?: string | null } | null | undefined): OrigemDoReaproveitamento | null =>
  ehOrigemDoReaproveitamento(p?.origemReaproveitamento) ? p!.origemReaproveitamento as OrigemDoReaproveitamento : null;

export type PecaComOrigem = {
  quantity?: number | string | null;
  reuseQty?: number | string | null;
  isReuse?: boolean | null;
  origemReaproveitamento?: string | null;
  obsReaproveitamento?: string | null;
};

const n = (v: unknown) => { const x = Math.trunc(Number(v)); return Number.isFinite(x) && x > 0 ? x : 0; };

/**
 * Unidades reaproveitadas da peça. O reuso LEGADO (isReuse com reuseQty 0,
 * marcado antes de reuse_qty existir) vale a quantidade inteira.
 */
export const reaproveitadasDe = (p: PecaComOrigem): number =>
  p.isReuse && n(p.reuseQty) === 0 ? n(p.quantity) : Math.min(n(p.reuseQty), n(p.quantity));

/** Unidades EM TRÂNSITO: as reaproveitadas, quando a origem é "em trânsito". */
export const emTransitoDe = (p: PecaComOrigem): number =>
  origemDe(p) === "em_transito" ? reaproveitadasDe(p) : 0;

/** Unidades a BUSCAR NO ESTOQUE: as reaproveitadas, quando a origem é "estoque". */
export const doEstoqueDe = (p: PecaComOrigem): number =>
  origemDe(p) === "estoque" ? reaproveitadasDe(p) : 0;

/**
 * A QUANTIDADE FÍSICA — o que passa pelo galpão (conferir → embalar →
 * entregar): a quantidade menos as unidades em trânsito. Sem trânsito é a
 * própria quantidade, e toda conta antiga continua idêntica.
 */
export const quantidadeFisicaDe = (p: PecaComOrigem): number =>
  Math.max(0, n(p.quantity) - emTransitoDe(p));

/** A peça inteira veio no caminhão — não há nada para o galpão fazer. */
export const todaEmTransito = (p: PecaComOrigem): boolean =>
  n(p.quantity) > 0 && emTransitoDe(p) >= n(p.quantity);

// ── O corpo das rotas ───────────────────────────────────────────────────────

export type LeituraDaOrigem =
  | { ok: true; veio: false }
  | { ok: true; veio: true; origem: OrigemDoReaproveitamento | null; obs: string | null }
  | { ok: false; motivo: string };

/**
 * Lê `origemReaproveitamento` e `obsReaproveitamento` de um corpo de
 * requisição. Nenhum dos dois presente = `veio: false` (a rota não mexe na
 * origem). Vazio/null limpa. "Em trânsito" sem observação é recusado com a
 * instrução — sem ela ninguém sabe de qual caminhão a peça vem.
 */
export function lerOrigemDoCorpo(corpo: unknown): LeituraDaOrigem {
  const c = (corpo && typeof corpo === "object" ? corpo : {}) as Record<string, unknown>;
  const temOrigem = Object.prototype.hasOwnProperty.call(c, "origemReaproveitamento");
  const temObs = Object.prototype.hasOwnProperty.call(c, "obsReaproveitamento");
  if (!temOrigem && !temObs) return { ok: true, veio: false };
  const bruta = c.origemReaproveitamento;
  let origem: OrigemDoReaproveitamento | null = null;
  if (bruta !== undefined && bruta !== null && bruta !== "") {
    if (!ehOrigemDoReaproveitamento(bruta)) {
      return { ok: false, motivo: "Origem do reaproveitamento inválida: use \"estoque\" ou \"em_transito\"." };
    }
    origem = bruta;
  }
  const obsBruta = c.obsReaproveitamento;
  if (obsBruta !== undefined && obsBruta !== null && typeof obsBruta !== "string") {
    return { ok: false, motivo: "A observação do reaproveitamento tem de ser um texto." };
  }
  const obs = typeof obsBruta === "string" ? obsBruta.replace(/\s+/g, " ").trim() : "";
  if (obs.length > OBS_DO_REAPROVEITAMENTO_MAX) {
    return { ok: false, motivo: `A observação do reaproveitamento passa de ${OBS_DO_REAPROVEITAMENTO_MAX} caracteres.` };
  }
  if (origem === "em_transito" && obs.length < OBS_EM_TRANSITO_MIN) {
    return { ok: false, motivo: `Em trânsito: ${INSTRUCAO_EM_TRANSITO.toLowerCase()} (ex.: Night Run Salvador, etapa 17/10).` };
  }
  // Sem origem, a observação some junto: ela só diz algo ao lado de uma origem.
  return { ok: true, veio: true, origem, obs: origem ? (obs || null) : null };
}

/** As colunas que a rota grava a partir de uma leitura com `veio: true`. */
export const colunasDaOrigem = (origem: OrigemDoReaproveitamento | null, obs: string | null) => ({
  origemReaproveitamento: origem,
  obsReaproveitamento: origem ? obs : null,
});

// ── O fim do fluxo quando a conta física muda ───────────────────────────────

export type PecaDoFimDoFluxo = PecaComOrigem & {
  status?: string | null;
  quantityProduced?: number | null;
  conferredQty?: number | null;
  embaladaQty?: number | null;
  deliveredQty?: number | null;
};

/** Os status do FIM do fluxo (canônicos e legados): onde a conta física decide a etapa. */
export const FIM_DO_FLUXO: ReadonlySet<string> = new Set([
  "produced", "produzido", "conferred", "conferido", "packed", "embalado", "delivered", "entregue",
]);

/**
 * A ETAPA COERENTE com a conta física, para peça no fim do fluxo — a mesma
 * régua que a conferência, a embalagem e a entrega usam para fechar a peça:
 *   toda em trânsito, ou o físico todo entregue → delivered;
 *   o físico todo embalado (a entrega antiga conta)  → packed;
 *   o físico todo conferido                          → conferred;
 *   senão                                            → produced.
 */
export function etapaPelaQuantidadeFisica(p: PecaDoFimDoFluxo): "produced" | "conferred" | "packed" | "delivered" {
  const q = quantidadeFisicaDe(p);
  const ent = n(p.deliveredQty);
  if (q === 0 || ent >= q) return "delivered";
  if (Math.max(n(p.embaladaQty), ent) >= q) return "packed";
  if (n(p.conferredQty) >= q) return "conferred";
  return "produced";
}

const CANONICO: Record<string, string> = {
  produzido: "produced", conferido: "conferred", embalado: "packed", entregue: "delivered",
};

/**
 * O status que a peça passa a ter depois de a origem (ou o reaproveitamento)
 * mudar — `null` quando nada muda. Só mexe em peça do fim do fluxo: antes da
 * produção a conta física não decide etapa nenhuma.
 */
export function statusAposMudarAOrigem(p: PecaDoFimDoFluxo): string | null {
  const atual = String(p.status ?? "");
  if (!FIM_DO_FLUXO.has(atual)) return null;
  const nova = etapaPelaQuantidadeFisica(p);
  return (CANONICO[atual] ?? atual) === nova ? null : nova;
}

/** Status em que a impressão já acabou: a parte impressa vale inteira mesmo com o contador vazio (acervo antigo). */
const IMPRESSAO_FECHADA: ReadonlySet<string> = FIM_DO_FLUXO;

/**
 * Unidades que EXISTEM no galpão: as impressas (a parte impressa inteira
 * quando a impressão já fechou) mais as reaproveitadas que NÃO estão em
 * trânsito, até o físico. É o teto do que pode já ter sido conferido, embalado
 * ou entregue — a mesma régua de tetoDaConferencia (shared/embalagem.ts).
 */
export function noGalpaoDe(p: PecaDoFimDoFluxo): number {
  const q = n(p.quantity), reuso = reaproveitadasDe(p);
  const impressas = IMPRESSAO_FECHADA.has(String(p.status ?? ""))
    ? Math.max(n(p.quantityProduced), q - reuso)
    : n(p.quantityProduced);
  return Math.min(quantidadeFisicaDe(p), impressas + reuso - emTransitoDe(p));
}

/**
 * A peça (já com a origem nova) cabe na conta do galpão? As unidades em
 * trânsito nunca entram lá: se há mais unidades conferidas, embaladas ou
 * entregues do que as que EXISTEM no galpão (impressas + reaproveitadas fora do
 * caminhão), as reaproveitadas JÁ passaram pela conferência — não estão no
 * caminhão. Comparar com o físico (quantidade − trânsito) não basta: na peça a
 * meio da impressão o físico conta unidades que ainda nem saíram da impressora
 * (revisão adversarial, 16/10). `verbo` completa a frase ("marcar como",
 * "reaproveitar"). Devolve a frase da recusa, ou null.
 */
export function recusaDaContaNoGalpao(depois: PecaDoFimDoFluxo, verbo: string): string | null {
  if (origemDe(depois) !== "em_transito") return null;
  const cabe = noGalpaoDe(depois);
  const jaNoGalpao = Math.max(n(depois.conferredQty), n(depois.embaladaQty), n(depois.deliveredQty));
  if (jaNoGalpao <= cabe) return null;
  return `Não dá para ${verbo} em trânsito: ${jaNoGalpao} un. já foram conferidas/embaladas no galpão e só ${cabe} un. `
    + `${cabe === 1 ? "foi impressa" : "foram impressas"} — as reaproveitadas já passaram pela conferência. Use "Estoque".`;
}

/** A troca de origem é segura? (recusaDaContaNoGalpao) Devolve a frase da recusa, ou null. */
export function recusaDaTrocaDeOrigem(
  atual: PecaDoFimDoFluxo,
  nova: OrigemDoReaproveitamento | null,
): string | null {
  if (nova && reaproveitadasDe(atual) === 0) {
    return "Esta peça não tem unidade reaproveitada — marque o reaproveitamento antes de dizer de onde ele vem.";
  }
  if (nova !== "em_transito" || origemDe(atual) === "em_transito") return null;
  return recusaDaContaNoGalpao({ ...atual, origemReaproveitamento: "em_transito" }, "marcar como");
}

// ── Como se diz ─────────────────────────────────────────────────────────────

/** A linha da trilha: "Reaproveitamento: em trânsito — Night Run Salvador". */
export function fraseDaTrilhaDaOrigem(origem: OrigemDoReaproveitamento | null, obs: string | null | undefined): string {
  if (!origem) return "Reaproveitamento: origem removida";
  const texto = origem === "em_transito" ? "em trânsito" : "estoque";
  return `Reaproveitamento: ${texto}${obs ? ` — ${obs}` : ""}`;
}

/** O que a trilha acrescenta quando a peça 100% em trânsito fecha sem passar pela Gráfica. */
export function fraseDoFechamentoEmTransito(obs: string | null | undefined): string {
  return `Reaproveitada em trânsito${obs ? ` (${obs})` : ""} — não passa pela Gráfica`;
}

/**
 * A dica do selo (title/tooltip): origem, unidades e observação. `null` quando
 * a peça não tem origem marcada.
 */
export function dicaDaOrigem(p: PecaComOrigem): string | null {
  const origem = origemDe(p);
  if (!origem) return null;
  const un = reaproveitadasDe(p);
  const obs = p.obsReaproveitamento?.trim();
  if (origem === "em_transito") {
    return `Em trânsito — ${un} un. já estão no caminhão${obs ? `, vindo de ${obs}` : ""}. `
      + `Não passam por conferir, embalar nem entregar.`;
  }
  return `Buscar no estoque — ${un} un. saem do galpão${obs ? ` (${obs})` : ""}. Depois de separadas, seguem para conferir, embalar e entregar.`;
}
