// ─────────────────────────────────────────────────────────────────────────────
// APOIO DAS ROTAS DE PEÇA — o que mais de um arquivo de server/routes/itens/
// usa. O que só uma rota usa mora junto dela, não aqui.
// ─────────────────────────────────────────────────────────────────────────────
import { db } from "../../db";
import { storage } from "../../storage";
import { partesAtivas, partesDaPeca } from "@shared/impressao-dividida";
import { registrosDeImpressao } from "@shared/schema";
import { createAuditLog, resolveActor } from "../shared";
// A tela de Versões guarda o quadro calculado por 30 s. Toda escrita que mude
// versão, decisão ou book derruba esse cache na hora — senão o Atendimento
// revoga uma aprovação e continua vendo o quadro velho numa tela cujo trabalho
// é justamente conferir o que está valendo agora.
import { invalidarCacheDeVersoes } from "../versoes";

// ─── REGISTRO DE IMPRESSÃO POR MÁQUINA (dono, 14/09) ─────────────────────────
//
// Cada gesto da Gráfica na máquina vira uma linha em registros_de_impressao — é
// o que alimenta a aba Máquinas (o que cada uma imprime agora e o que saiu dela
// em cada dia). NUNCA derruba o gesto: a peça ter entrado na máquina ou ter
// saído dela é o fato; o diário é o registro do fato. Se a gravação falhar, o
// operador não pode ver um erro por causa disso — fica no log do servidor.
// Sem máquina (chamador antigo de start-production) não há o que anotar.
export async function registrarImpressao(
  req: any,
  dado: { itemId: string; maquina: string | null | undefined; tipo: "inicio" | "troca" | "parcial" | "conclusao" | "pausa"; quantidade: number; totalDepois: number | null },
): Promise<void> {
  if (!dado.maquina) return;
  try {
    const ator = resolveActor(req);
    await db.insert(registrosDeImpressao).values({
      itemId: dado.itemId,
      maquina: dado.maquina,
      tipo: dado.tipo,
      quantidade: dado.quantidade,
      totalDepois: dado.totalDepois,
      userName: ator.userName,
      userId: (ator as any).userId ?? null,
    } as any);
  } catch (error) {
    console.error("[maquinas] falha ao gravar o registro de impressão", {
      itemId: dado.itemId,
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * A peça EM IMPRESSÃO saiu da impressora por um caminho que não é o "Tirar"
 * (cancelamento, correção de reaproveitamento): uma "pausa" por impressora
 * com parte ativa — quantidade 0, as impressas no total. Sem ela o diário e o
 * resumo "ainda na máquina" continuavam contando a peça na impressora.
 */
export async function registrarSaidaDaImpressora(req: any, peca: { id: string; status?: string | null; printMachine?: string | null; impressaoPorMaquina?: unknown; quantity?: number | null; reuseQty?: number | null; isReuse?: boolean | null; quantityProduced?: number | null }): Promise<void> {
  if (peca.status !== "inProduction" && peca.status !== "em_producao") return;
  for (const maquina of Object.keys(partesAtivas(partesDaPeca(peca as any)))) {
    await registrarImpressao(req, { itemId: peca.id, maquina, tipo: "pausa", quantidade: 0, totalDepois: peca.quantityProduced ?? 0 });
  }
}

// ─── MOTIVO das devoluções ──────────────────────────────────────────────────
//
// Existiam CINCO portas que devolvem peça — sponsor-reject, o reject por
// patrocinador individual, creator-reject, bulk-creator-reject e
// return-to-arte — e nenhuma guardava POR QUÊ. A peça #1527 voltou de
// "Aguardando Aprovação" para "Aguardando Envio" e o registro inteiro dizia
// só a troca de status: quem a recebeu de volta não tinha como saber o que
// refazer, e quem abrisse dali a uma semana também não.
//
// A régua é a mesma do complemento (`complementReason`): 10 caracteres. Não é
// burocracia — "não" e "ruim" não dizem à Arte o que mudar, e uma devolução
// sem instrução é uma ida e volta garantida.
export const MOTIVO_MIN = 10;

/**
 * Lê o motivo do corpo aceitando os três nomes que as telas já usam
 * (`rejectionReason`, `notes`, `observations`) — o contrato novo é um só,
 * mas quebrar as quatro telas antigas de uma vez seria pior que aceitar os
 * nomes que elas já mandam.
 */
export function lerMotivoDevolucao(req: any): { ok: true; motivo: string } | { ok: false; erro: string } {
  const bruto =
    typeof req.body?.rejectionReason === "string" ? req.body.rejectionReason
    : typeof req.body?.notes === "string" ? req.body.notes
    : typeof req.body?.observations === "string" ? req.body.observations
    : "";
  // `\s+` (espaço em branco), e NÃO `s+` (a letra s).
  //
  // Faltava esta barra invertida, e o efeito era comer a letra "s" de todo
  // motivo digitado no app: "parece desbotada" virava "parece de botada" e
  // "Preciso garantir que ele seja" virava "Preci o garantir que ele eja".
  //
  // Só o minúsculo — por isso a frase que o próprio servidor monta em volta
  // ("Item aguarda nova versão da Arte") saía intacta, e o defeito parecia
  // ser de quem digitou.
  //
  // Passa por aqui o motivo de SETE rotas de devolução e reprovação, e o
  // texto é gravado já mastigado: o que foi salvo antes desta linha não
  // volta — as letras não estão em lugar nenhum para serem recuperadas.
  const motivo = String(bruto).trim().replace(/\s+/g, " ");
  if (motivo.length < MOTIVO_MIN) {
    return {
      ok: false,
      erro: `Explique o motivo da devolução em pelo menos ${MOTIVO_MIN} caracteres — quem recebe a peça de volta precisa saber o que refazer.`,
    };
  }
  return { ok: true, motivo };
}

// ─── DESTINO da devolucao da Revisao ────────────────────────────────────────
//
// Regra do dono (17/08): quem devolve DECIDE se a peca volta para o comeco da
// Arte (a arte inteira esta errada, refaz e passa pelo patrocinador de novo) ou
// so para a Finalizacao (a arte esta certa, o que veio errado foi o arquivo
// final). Os dois destinos existem no fluxo; o que nao pode e o sistema
// escolher em silencio — foi assim que peca de retrabalho foi parar no meio
// de 1.120 que nunca tinham sido enviadas.
//
// O padrao e `finalizacao` porque e o caso comum e o menos destrutivo: manter
// a aprovacao do patrocinador nao custa nada se a arte for refeita depois, mas
// jogar fora uma aprovacao que valia obriga a pedir tudo de novo.
export type DestinoDevolucao = "arte" | "finalizacao";

export function lerDestinoDevolucao(req: any): DestinoDevolucao {
  return req.body?.destino === "arte" ? "arte" : "finalizacao";
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPLEMENTO — aumento de quantidade depois que a peça entrou em produção.
//
// A REGRA, em uma frase: enquanto a peça NÃO entrou em produção, aumentar é
// editar a quantidade. Depois que entrou, aumentar é criar um COMPLEMENTO
// (peça-filha #0062-C1, com a diferença, ciclo próprio e a mãe intocada).
// REDUZIR é sempre edição, com piso físico (ver PATCH /api/items/:id).
//
// A assimetria é deliberada: aumentar cria trabalho novo (ordem de serviço,
// metragem, alerta para a Gráfica); reduzir só corta a meta.
//
// Espelho literal de COMPLEMENT_ALLOWED_STATUSES em client/src/lib/status.ts —
// o servidor não importa código do client (mesma disciplina dos dois mapas de
// status que já convivem). Se um mudar, o outro muda junto.
// Inclui as grafias legadas em português porque elas circulam no banco: gate
// que compara só com a grafia canônica simplesmente nunca dispara.
// ─────────────────────────────────────────────────────────────────────────────
export const COMPLEMENT_ALLOWED_STATUSES: readonly string[] = [
  "inProduction", "em_producao", "produced", "produzido",
  "conferred", "packed", "delivered", "entregue",
];

// m² é grandeza de produção/custo e não pode ser fonte-de-verdade do cliente.
// Quando as dimensões do arquivo estão presentes, o servidor RECALCULA
// calculatedM2 = quantidade × largura × altura (mesma fórmula de
// client/src/lib/calculateM2.ts), ignorando o valor enviado. Quando não há
// dimensões (itens sem medida de arquivo), não há como derivar e o valor
// recebido é mantido. Retorna string com 2 casas (coluna decimal(10,2)).
export function deriveCalculatedM2(data: {
  quantity?: number | null;
  fileWidth?: string | number | null;
  fileHeight?: string | number | null;
}): string | undefined {
  const w = data.fileWidth != null ? parseFloat(String(data.fileWidth)) : NaN;
  const h = data.fileHeight != null ? parseFloat(String(data.fileHeight)) : NaN;
  const q = data.quantity != null ? Number(data.quantity) : NaN;
  if (
    Number.isFinite(w) && w > 0 &&
    Number.isFinite(h) && h > 0 &&
    Number.isFinite(q) && q > 0
  ) {
    return (q * w * h).toFixed(2);
  }
  return undefined;
}

// `measurement` É TEXTO DENORMALIZADO — e por isso envelhece sozinho.
//
// Ele guarda "3.95 × 2.95" como TEXTO, ao lado das colunas fileWidth e
// fileHeight que guardam os mesmos dois números. Enquanto o m² já era
// recalculado no servidor (deriveCalculatedM2, logo acima), a medida não
// era: editar as dimensões de uma peça mudava fileWidth/fileHeight e o m²,
// e deixava o texto antigo para trás.
//
// O estrago não ficava na tela de quem editou. `measurement` é o que sai na
// COLUNA "Medida" da planilha exportada para a gráfica (services/
// xlsxExport.ts), na ficha da peça, na triagem e no estoque — a peça
// #2472 foi corrigida de 3.95×2.95 para 7.55×2.25 às 14:36 e a gráfica
// continuou lendo 3.95×2.95, sem nada na tela sugerindo divergência. Dois
// números para o mesmo fato, um deles corrigido: o outro não fica
// "desatualizado", fica ERRADO, e é o que a produção lê.
export function deriveMeasurement(
  fileWidth?: string | number | null,
  fileHeight?: string | number | null,
): string | undefined {
  const w = fileWidth != null ? parseFloat(String(fileWidth)) : NaN;
  const h = fileHeight != null ? parseFloat(String(fileHeight)) : NaN;
  if (Number.isFinite(w) && w > 0 && Number.isFinite(h) && h > 0) {
    // Mesmo formato do importador da planilha (services/xlsxImport.ts), que
    // é quem escreve a maioria esmagadora destes textos.
    return `${w.toFixed(2)} × ${h.toFixed(2)}`;
  }
  return undefined;
}

/**
 * A medida foi mexida NESTA requisição?
 *
 * A regra é deliberadamente estreita: só re-derivar quando as dimensões
 * MUDAM. `measurement` é editável de propósito (a coluna do schema diz
 * isso), e derivar sempre apagaria um texto escrito à mão — "3 peças de 2m",
 * "conforme croqui" — que ninguém pediu para apagar. Mas no instante em que
 * as dimensões mudam, o texto antigo deixa de ser uma escolha e passa a ser
 * uma contradição.
 */
export function medidaMudou(
  atual: { fileWidth?: string | number | null; fileHeight?: string | number | null },
  novoW: string | number | null | undefined,
  novoH: string | number | null | undefined,
): boolean {
  const num = (v: any) => (v != null ? parseFloat(String(v)) : NaN);
  return num(novoW) !== num(atual.fileWidth) || num(novoH) !== num(atual.fileHeight);
}

// `area` e `visual` SÃO `visual_width` e `visual_height` — de novo.
//
// A mesma doença de `measurement`, na dupla ao lado e por outro motivo
// histórico: `area`/`visual` são as colunas ORIGINAIS da medida visual, e
// `visual_width`/`visual_height` vieram depois. As quatro guardam dois
// números. Na criação nascem juntas (`area: parseFloat(data.visualWidth)`);
// na edição o formulário manda só o par novo, e o par velho congela.
//
// Não é coluna morta: `area`/`visual` são NOT NULL, o formulário de edição
// as usa como fallback quando o par novo é nulo (acervo antigo), e a
// linha do tempo da peça IMPRIME `${item.area} × ${item.visual}` na cara do
// usuário. Editar a medida visual de uma peça deixava a linha do tempo
// mostrando a medida de antes — sem nada indicando qual das duas vale.
//
// Enquanto as quatro colunas existirem, elas se movem juntas. Apagar as
// duas velhas é a correção de verdade, mas é migração destrutiva com
// acervo dependendo delas — e sincronizar não impede fazê-la depois.
export function derivarAreaVisual(
  visualWidth: string | number | null | undefined,
  visualHeight: string | number | null | undefined,
): { area: string; visual: string } | undefined {
  const w = visualWidth != null ? parseFloat(String(visualWidth)) : NaN;
  const h = visualHeight != null ? parseFloat(String(visualHeight)) : NaN;
  if (Number.isFinite(w) && w > 0 && Number.isFinite(h) && h > 0) {
    return { area: w.toFixed(2), visual: h.toFixed(2) };
  }
  return undefined;
}

// KIT (14/09): quem está pedindo, na régua de shared/kit.ts.
export const quemVe = (req: any) => ({ kit: req.userKit === true, userId: req.userId ?? null });

// Criação de itens: Solicitação/admin, ou o CRIADOR do evento (qualquer papel)
// — espelha o gate canEditLists do client. Sem isto, Gráfica/Arte/Atendimento
// criavam itens em eventos alheios direto pela API.

export async function canCreateItemsFor(req: { userRole?: string; userId?: string }, eventId?: string): Promise<boolean> {
  if (req.userRole === "admin" || req.userRole === "solicitacao") return true;
  if (!eventId || !req.userId) return false;
  const ev = await storage.getEvent(eventId);
  return !!ev && ev.createdBy === req.userId;
}

// ─────────────────────────────────────────────────────────────────────────────
// PATROCINADOR "DESAPROVADOR" — a aprovação dele vale só para a versão que
// ele aprovou. Pedido do dono (21/08/2026), caso típico: Ministério.
//
// Dois gatilhos revogam a aprovação de quem tem `strictApproval`:
//   · NOVA VERSÃO da arte (reenvio da correção, troca do thumb, reenvio do
//     item inteiro) → a aprovação vira `new_version_pending`: o Atendimento
//     reapresenta a versão nova e registra de novo.
//   · REPROVAÇÃO por qualquer OUTRO patrocinador → vira `awaiting_arte`: a
//     peça vai ser refeita, e a versão refeita passa por ele outra vez. Não
//     vai para `pending`, senão o Atendimento poderia reaprovar por ele a
//     versão velha antes de a nova existir.
// `decidedThumbUrl` fica como estava — é a prova de QUAL versão ele tinha
// aprovado; a tela de Versões lê o motivo e diz "teve a aprovação revogada".
// Devolve os nomes revogados (para a rota decidir se volta o status da peça).
// ─────────────────────────────────────────────────────────────────────────────

export const MOTIVO_REVOGACAO_PREFIXO = "Aprovação revogada automaticamente";

export type GatilhoDeRevogacao =
  | { tipo: "nova_versao" }
  | { tipo: "reprovacao"; sponsorId: string; nome: string };

export async function revogarAprovacoesEstritas(
  req: any,
  item: { id: string },
  gatilho: GatilhoDeRevogacao,
): Promise<string[]> {
  const vinculos = await storage.getItemSponsors(item.id);
  const aprovacoes = await storage.getItemSponsorApprovals(item.id);
  const revogados: string[] = [];
  for (const v of vinculos) {
    if (gatilho.tipo === "reprovacao" && v.sponsorId === gatilho.sponsorId) continue;
    const a = aprovacoes.find((x) => x.sponsorId === v.sponsorId);
    if (!a || a.status !== "approved") continue;
    const sp = await storage.getSponsor(v.sponsorId);
    if (!sp?.strictApproval) continue;
    const motivo = gatilho.tipo === "nova_versao"
      ? `${MOTIVO_REVOGACAO_PREFIXO}: a Arte enviou uma nova versão — este patrocinador reaprova toda versão nova.`
      : `${MOTIVO_REVOGACAO_PREFIXO}: "${gatilho.nome}" reprovou a peça — este patrocinador desaprova junto.`;
    await storage.updateItemSponsorApproval(a.id, {
      status: gatilho.tipo === "nova_versao" ? "new_version_pending" : "awaiting_arte",
      approvedBy: null,
      approvedAt: null,
      rejectedBy: req.userName ?? null,
      rejectedAt: new Date(),
      rejectionReason: motivo,
    });
    revogados.push(sp.name);
  }
  if (revogados.length > 0) {
    await createAuditLog(
      req,
      "updated",
      "item",
      item.id,
      `Aprovação revogada de ${revogados.join(", ")} (patrocinador desaprovador): ${gatilho.tipo === "nova_versao" ? "nova versão da arte" : `"${gatilho.nome}" reprovou a peça`}`,
    );
  }
  if (revogados.length > 0) invalidarCacheDeVersoes();
  return revogados;
}
