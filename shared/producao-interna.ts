// ─────────────────────────────────────────────────────────────────────────────
// PRODUÇÃO INTERNA — a peça que vai DIRETO PARA A GRÁFICA (dono, 02/10).
//
// "Criar uma função no app que eu consiga liberar eventualmente alguma coisa
// direto pra gráfica… coisas que não passam pela arte… peças que fazemos
// internamente, sem logo de patrocinador, e que não necessariamente têm um
// arquivo — da solicitação direto para a gráfica." E, no mesmo dia: "essa peça
// tem que indicar NA SOLICITAÇÃO que vai direto para a Gráfica."
//
// O desenho, como o MOLDE (shared/molde.ts) — uma regra num lugar só, que o
// servidor e as telas leem:
//
//   Lista (rascunho), peça MARCADA ──enviar lista──▶ ready_for_production
//   Peça já criada, sem a marca ──"Enviar direto para a Gráfica"──▶ idem
//                                 (de draft / requested / awaiting_linking;
//                                  a marca é gravada no envio)
//
// Pula Vinculação, Arte, Aprovação e Revisão Final. As decisões do dono:
//   · quem: Solicitação e admin;
//   · só peça SEM patrocinador vinculado (o botão nem aparece se houver, e
//     vincular patrocinador a peça marcada é recusado);
//   · arquivo opcional — sem arquivo final, as INSTRUÇÕES para a Gráfica são
//     obrigatórias (é o que a Gráfica lê para fazer a peça).
//
// QUANDO a instrução é exigida: no ENVIO (lista ou ação direta), não ao marcar.
// O rascunho é o lugar de montar a peça aos poucos — exigir o texto no
// primeiro clique da caixinha travaria a lista por um campo que a pessoa ia
// escrever em seguida. A tela avisa desde já; o servidor cobra ao enviar.
//
// Por que awaiting_submission NÃO entra na origem da ação direta (embora
// ANTES_DA_ARTE da máquina de estados o inclua): ali a peça já está na mesa da
// Arte, que pode estar trabalhando nela — puxar de lá é desfazer trabalho
// alheio sem avisar. Para esse caso há "voltar para a criação".
// ─────────────────────────────────────────────────────────────────────────────
import { ehMolde } from "./molde";

/** Quem marca e quem envia direto para a Gráfica. */
export const PAPEIS_DA_PRODUCAO_INTERNA: readonly string[] = ["admin", "solicitacao"];
export const podeUsarProducaoInterna = (papel: string | null | undefined): boolean =>
  PAPEIS_DA_PRODUCAO_INTERNA.includes(String(papel ?? ""));

/** De onde a ação avulsa "Enviar direto para a Gráfica" parte: antes de a Arte começar. */
export const ENVIAVEL_DIRETO_PARA_A_GRAFICA: readonly string[] = ["draft", "requested", "awaiting_linking"];
/** Onde a marca pode ser posta ou tirada na edição: a lista ainda não enviada. */
export const MARCAVEL_NA_LISTA: readonly string[] = ["draft", "requested"];
/** Para onde a peça vai: Pronto para Produção, a fila da Gráfica. */
export const DESTINO_DA_PRODUCAO_INTERNA = "ready_for_production";

/** A instrução: texto livre, com pelo menos isto de letras quando é ela que descreve a peça. */
export const INSTRUCOES_MINIMO = 10;
export const INSTRUCOES_MAXIMO = 2000;

/** Os rótulos — a Gráfica lê "Produção interna"; a lista da Solicitação, "Direto para a Gráfica". */
export const ROTULO_PRODUCAO_INTERNA = "Produção interna";
export const ROTULO_DIRETO_PARA_A_GRAFICA = "Direto para a Gráfica";

/** Os códigos que a rota devolve — a tela distingue sem ler a frase. */
export const CODIGO_COM_PATROCINADOR = "PRODUCAO_INTERNA_COM_PATROCINADOR";
export const CODIGO_SEM_INSTRUCOES = "PRODUCAO_INTERNA_SEM_INSTRUCOES";

export const ERRO_PATROCINADOR_NA_PRODUCAO_INTERNA =
  "Peça de produção interna não leva patrocinador; desmarque 'vai direto para a Gráfica' antes";

/** O que estas regras leem da peça (a do banco e a da tela servem). */
export type PecaDaProducaoInterna = {
  status?: string | null;
  type?: string | null;
  isReuse?: boolean | null;
  deletedAt?: string | Date | null;
  travadaEm?: string | Date | null;
  parentItemId?: string | null;
  producaoInterna?: boolean | null;
  instrucoesGrafica?: string | null;
  finalFileUrl?: string | null;
  /** Na tela: os patrocinadores pendurados pelo enrich de GET /api/items/:eventId. */
  sponsors?: readonly unknown[] | null;
};

/** Por que a peça fica de fora — a frase humana e o status HTTP que a rota responde. */
export type MotivoDeFora = { codigo: string; frase: string; http: number };

const fora = (codigo: string, frase: string, http = 409): MotivoDeFora => ({ codigo, frase, http });

/** A instrução limpa (null = vazia), ou o erro humano. Quebras de linha ficam: é uma lista de passos. */
export function lerInstrucoes(bruto: unknown): { ok: true; instrucoes: string | null } | { ok: false; erro: string } {
  if (bruto == null) return { ok: true, instrucoes: null };
  if (typeof bruto !== "string") return { ok: false, erro: "As instruções para a Gráfica vieram num formato inesperado — escreva de novo." };
  const limpo = bruto.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (!limpo) return { ok: true, instrucoes: null };
  if (limpo.length > INSTRUCOES_MAXIMO) return { ok: false, erro: `As instruções passam de ${INSTRUCOES_MAXIMO} letras — resuma o que a Gráfica precisa fazer.` };
  return { ok: true, instrucoes: limpo };
}

/** Sem arquivo final, a instrução descreve a peça — e tem de dizer alguma coisa. */
export function faltamInstrucoes(instrucoes: string | null | undefined, temArquivo: boolean): boolean {
  if (temArquivo) return false;
  return String(instrucoes ?? "").trim().length < INSTRUCOES_MINIMO;
}

export const fraseDasInstrucoesQueFaltam = () =>
  `Sem arquivo, escreva as instruções para a Gráfica (pelo menos ${INSTRUCOES_MINIMO} letras): o que fazer, medida, material, acabamento.`;

/** Tem patrocinador vinculado? (Na tela, pela lista da peça.) */
const temPatrocinadorNaTela = (p: PecaDaProducaoInterna) => Array.isArray(p.sponsors) && p.sponsors.length > 0;

/**
 * Os impedimentos que não dependem da etapa: molde, reaproveitamento total,
 * patrocinador. Comuns ao marcar e ao enviar.
 */
function impedimentoDaPeca(peca: PecaDaProducaoInterna, temPatrocinador: boolean): MotivoDeFora | null {
  if (peca.deletedAt) return fora("EXCLUIDA", "A peça foi excluída.", 404);
  // O molde é o modelo que a Arte desenha: o fluxo curto dele já existe
  // (shared/molde.ts) e não passa pela impressora.
  if (ehMolde(peca)) return fora("MOLDE", "Molde não vai direto para a Gráfica — ele é desenhado pela Arte (fluxo do molde).");
  // Reaproveitamento total não imprime nada: ir para a fila da impressora
  // seria trabalho fantasma. Quem reaproveita libera pela Revisão Final.
  if (peca.isReuse) return fora("REAPROVEITAMENTO", "Peça de reaproveitamento total não vai para a produção — não há nada a imprimir.");
  if (temPatrocinador) return fora(CODIGO_COM_PATROCINADOR, "Tem patrocinador vinculado — peça com patrocinador passa pela Arte e pela aprovação.");
  return null;
}

/**
 * Por que esta peça NÃO pode ser enviada direto para a Gráfica agora (a ação
 * avulsa, por peça ou em lote). `null` = pode. A instrução é conferida à parte
 * (faltamInstrucoes), porque no lote ela é comum a todas.
 */
export function motivoParaNaoEnviarDireto(
  peca: PecaDaProducaoInterna,
  ctx: { papel: string | null | undefined; temPatrocinador?: boolean },
): MotivoDeFora | null {
  if (!podeUsarProducaoInterna(ctx.papel)) return fora("PAPEL", "Só a Solicitação e o admin enviam peça direto para a Gráfica.", 403);
  const imp = impedimentoDaPeca(peca, ctx.temPatrocinador ?? temPatrocinadorNaTela(peca));
  if (imp && imp.codigo === "EXCLUIDA") return imp;
  const status = String(peca.status ?? "");
  if (!ENVIAVEL_DIRETO_PARA_A_GRAFICA.includes(status)) {
    return fora("ETAPA", status === "awaiting_submission"
      ? "A peça já está com a Arte — volte-a para a criação antes de mandá-la direto para a Gráfica."
      : "A peça já passou da criação — só rascunho, solicitada ou aguardando vinculação vão direto para a Gráfica.");
  }
  if (imp) return imp;
  if (peca.travadaEm) return fora("TRAVADA", "A peça está travada pela Solicitação — destrave antes de enviar.");
  return null;
}

/**
 * Por que a marca "vai direto para a Gráfica" não pode MUDAR nesta peça pela
 * edição (criar ou editar). Desmarcar só pede papel e etapa; marcar pede
 * também peça sem patrocinador, não molde e não reaproveitamento total.
 */
export function motivoParaNaoMarcar(
  peca: PecaDaProducaoInterna,
  ctx: { papel: string | null | undefined; marcar: boolean; temPatrocinador?: boolean },
): MotivoDeFora | null {
  if (!podeUsarProducaoInterna(ctx.papel)) return fora("PAPEL", "Marcar peça para ir direto para a Gráfica é do admin e da Solicitação.", 403);
  const status = String(peca.status ?? "draft");
  if (!MARCAVEL_NA_LISTA.includes(status)) {
    return fora("ETAPA", "A marca 'vai direto para a Gráfica' só muda na lista ainda não enviada (rascunho). Depois disso, use \"Enviar direto para a Gráfica\".");
  }
  if (!ctx.marcar) return null;
  const temPatrocinador = ctx.temPatrocinador ?? temPatrocinadorNaTela(peca);
  if (temPatrocinador) return fora(CODIGO_COM_PATROCINADOR, "A peça tem patrocinador vinculado — peça de produção interna não leva patrocinador. Desvincule antes de marcar.");
  return impedimentoDaPeca(peca, false);
}

/**
 * A ESCRITA da marca e das instruções pelas rotas de criar e editar peça.
 * Devolve a recusa pronta (status + corpo) ou as instruções normalizadas para
 * gravar. `atual` = null na criação (a peça nasce em rascunho). Patrocinador
 * só é perguntado (temPatrocinador) quando a peça está sendo MARCADA.
 */
export function recusaDaMarcaNaEscrita(
  atual: PecaDaProducaoInterna | null,
  dados: { producaoInterna?: boolean | null; instrucoesGrafica?: unknown; type?: string | null; isReuse?: boolean | null },
  papel: string | null | undefined,
  temPatrocinador: boolean,
): { recusa: { status: number; corpo: { error: string; code?: string } } } | { instrucoes: string | null | undefined } {
  const recusa = (m: MotivoDeFora) => ({ recusa: { status: m.http, corpo: { error: m.frase, code: m.codigo } } });
  let instrucoes: string | null | undefined = undefined;
  if (dados.instrucoesGrafica !== undefined) {
    const lido = lerInstrucoes(dados.instrucoesGrafica);
    if (!lido.ok) return { recusa: { status: 400, corpo: { error: lido.erro } } };
    instrucoes = lido.instrucoes;
    // O formulário manda o form inteiro: só barra quem MUDA o texto.
    if (instrucoes !== (atual?.instrucoesGrafica ?? null) && !podeUsarProducaoInterna(papel)) {
      return recusa(fora("PAPEL", "As instruções para a Gráfica são do admin e da Solicitação.", 403));
    }
  }
  const muda = dados.producaoInterna != null && !!dados.producaoInterna !== !!atual?.producaoInterna;
  const peca: PecaDaProducaoInterna = {
    ...(atual ?? {}),
    status: atual?.status ?? "draft",
    type: dados.type ?? atual?.type ?? null,
    isReuse: dados.isReuse ?? atual?.isReuse ?? false,
  };
  if (muda) {
    const m = motivoParaNaoMarcar(peca, { papel, marcar: !!dados.producaoInterna, temPatrocinador });
    if (m) return recusa(m);
  } else if (atual?.producaoInterna && MARCAVEL_NA_LISTA.includes(String(atual.status ?? ""))) {
    // Já marcada, ainda na lista: virar molde ou reaproveitamento total
    // tiraria o sentido da marca — desmarca primeiro.
    if ((dados.type != null && ehMolde({ type: dados.type })) || dados.isReuse === true) {
      return recusa(fora("MARCADA", "A peça está marcada para ir direto para a Gráfica — desmarque antes de transformá-la em molde ou reaproveitamento total."));
    }
  }
  return { instrucoes };
}

/**
 * O BOTÃO "Enviar direto para a Gráfica" aparece? Só quando vale (papel,
 * etapa, sem patrocinador, não molde, não reaproveitamento, não travada). A
 * instrução não entra: ela é escrita no próprio diálogo.
 */
export function podeEnviarDiretoParaGrafica(peca: PecaDaProducaoInterna | null | undefined, papel: string | null | undefined): boolean {
  if (!peca) return false;
  return motivoParaNaoEnviarDireto(peca, { papel }) === null;
}

/**
 * O que a peça grava ao ir direto para a Gráfica — o MESMO para a ação avulsa
 * e para o envio da lista. A Gráfica a trata como liberada: `skipApproval`
 * (não há rodada de patrocinador a esperar), `approvedAt` (a trilha e a ficha
 * contam a liberação daqui — lib/timeline usa approvedAt ?? creatorReviewedAt),
 * `statusChangedAt` (a idade na fila começa agora). `creatorReviewedAt` fica
 * vazio de propósito: a peça NÃO passou pela Revisão Final, e a ficha diria
 * "Revisada pela Solicitação". O m² não muda: já foi calculado na criação.
 */
export function camposDoEnvioDireto(
  agora: Date,
  dados: { instrucoes: string | null; arquivo?: { url: string; nome?: string | null } | null },
): Record<string, unknown> {
  return {
    status: DESTINO_DA_PRODUCAO_INTERNA,
    producaoInterna: true,
    skipApproval: true,
    approvedAt: agora,
    statusChangedAt: agora,
    updatedAt: agora,
    hasModifiedData: false,
    rejectedByCreator: false,
    ...(dados.instrucoes != null ? { instrucoesGrafica: dados.instrucoes } : {}),
    ...(dados.arquivo ? { finalFileUrl: dados.arquivo.url, finalFileName: dados.arquivo.nome ?? null, finalFileUpdatedAt: agora } : {}),
  };
}

/** A frase da trilha (audit_logs) — sai igual da ação avulsa, do lote e do envio da lista. */
export function fraseDaTrilhaDoEnvioDireto(de: string, dados: { instrucoes: string | null; temArquivo: boolean; daLista?: boolean }): string {
  const como = dados.daLista ? "no envio da lista, marcada 'vai direto para a Gráfica'" : "pela ação \"Enviar direto para a Gráfica\"";
  const arquivo = dados.temArquivo ? "com arquivo" : "sem arquivo — a Gráfica segue as instruções";
  const instr = dados.instrucoes ? ` Instruções: ${dados.instrucoes.replace(/\s+/g, " ").slice(0, 400)}` : "";
  return `Enviada direto para a Gráfica (produção interna, sem passar pela Arte) ${como}: Status alterado: ${de} → Pronto para Produção, ${arquivo}.${instr}`;
}

// ─── O FORMULÁRIO DA PEÇA (Detalhe do Evento) ──────────────────────────────
/** O pedaço do formulário que este bloco lê e escreve. */
export type CamposDaProducaoInterna = {
  producaoInterna: boolean;
  instrucoesGrafica: string;
  /** Caminho de rede ou /objects/… — vazio = sem arquivo novo. */
  arquivoGrafica: string;
  arquivoGraficaNome: string;
};

export const CAMPOS_VAZIOS_DA_PRODUCAO_INTERNA: CamposDaProducaoInterna = {
  producaoInterna: false, instrucoesGrafica: "", arquivoGrafica: "", arquivoGraficaNome: "",
};

/** Da peça (para abrir a edição) para os campos do formulário. */
export function camposDaProducaoInternaDaPeca(p: { producaoInterna?: boolean | null; instrucoesGrafica?: string | null } | null | undefined): CamposDaProducaoInterna {
  return { ...CAMPOS_VAZIOS_DA_PRODUCAO_INTERNA, producaoInterna: !!p?.producaoInterna, instrucoesGrafica: p?.instrucoesGrafica ?? "" };
}

/**
 * Do formulário para o corpo do POST/PATCH — SÓ o que deve ir. O arquivo vai
 * apenas na peça marcada e preenchido: mandar `finalFileUrl: ""` no PATCH de
 * uma peça comum apagaria o arquivo final que a Arte subiu.
 */
export function corpoDaProducaoInterna(f: CamposDaProducaoInterna): Record<string, unknown> {
  if (!f.producaoInterna) return { producaoInterna: false };
  return {
    producaoInterna: true,
    instrucoesGrafica: f.instrucoesGrafica.trim() || null,
    ...(f.arquivoGrafica.trim() ? { finalFileUrl: f.arquivoGrafica.trim(), finalFileName: f.arquivoGraficaNome || undefined } : {}),
  };
}

/** O bloco aparece? Só para admin/Solicitação, e só enquanto a lista não foi enviada. */
export const mostraCampoProducaoInterna = (papel: string | null | undefined, statusDaPeca?: string | null) =>
  podeUsarProducaoInterna(papel) && (!statusDaPeca || MARCAVEL_NA_LISTA.includes(statusDaPeca));


/**
 * O ENVIO DA LISTA, DIVIDIDO como o servidor o fará (POST /api/events/:id/
 * items/submit): a peça marcada e completa vai para a Gráfica; a marcada sem
 * arquivo e sem instrução (ou que ganhou patrocinador) fica no rascunho, com o
 * motivo; o resto segue o caminho de sempre (Vinculação, ou a Arte no molde).
 * A confirmação e o rodapé dos rascunhos leem DAQUI — a tela não promete o que
 * a rota vai recusar.
 */
export function dividirEnvioDaLista<P extends PecaDaProducaoInterna>(pecas: readonly P[]): {
  paraVinculacao: P[];
  paraGrafica: P[];
  ficamNoRascunho: Array<{ peca: P; motivo: string }>;
} {
  const paraVinculacao: P[] = [];
  const paraGrafica: P[] = [];
  const ficamNoRascunho: Array<{ peca: P; motivo: string }> = [];
  for (const p of pecas) {
    if (!p.producaoInterna) { paraVinculacao.push(p); continue; }
    const imp = impedimentoDaPeca(p, temPatrocinadorNaTela(p));
    if (imp) ficamNoRascunho.push({ peca: p, motivo: imp.frase });
    else if (faltamInstrucoes(p.instrucoesGrafica, !!p.finalFileUrl)) ficamNoRascunho.push({ peca: p, motivo: "Sem arquivo e sem instruções para a Gráfica — edite a peça e escreva o que fazer." });
    else paraGrafica.push(p);
  }
  return { paraVinculacao, paraGrafica, ficamNoRascunho };
}
