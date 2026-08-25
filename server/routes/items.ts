// Item CRUD, workflow transitions, sponsor-approval sub-endpoints, and
// XLSX import routes. Extracted from server/routes.ts (ITEMS section).
import type { Express } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { storage, assetPrefix, assetSeqOf, isDisplayIdConflictError } from "../storage";
import type { Item } from "@shared/schema";
import { DEPOIS_DA_ARTE, EM_REVISAO } from "@shared/fluxo-peca";
import {
  insertItemSchema,
  publicInsertItemSchema,
  items as itemsTable,
  auditLogs,
  notifications,
} from "@shared/schema";
import {
  requireAuth,
  broadcast,
  translateStatus,
  createAuditLog,
  resolveActor,
  updateEventStatus,
  EVENT_CLOSED_STATUS,
} from "./shared";
import { runInventoryCron } from "../services/inventoryLifecycle";
import { handlePreviewXlsx, handleConfirmImport } from "../services/xlsxImport";
import { handleExportItemsXlsx, handleExportSelectedItemsXlsx } from "../services/xlsxExport";
import { notifyBookSaved, descreverEnvio, type BookEmailResult } from "../services/bookEmailNotification";
import { enviarAvisoDaRevisao } from "../services/revisaoDigest";
// A tela de Versões guarda o quadro calculado por 30 s. Toda escrita que mude
// versão, decisão ou book derruba esse cache na hora — senão o Atendimento
// revoga uma aprovação e continua vendo o quadro velho numa tela cujo trabalho
// é justamente conferir o que está valendo agora.
import { invalidarCacheDeVersoes } from "./versoes";

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
const MOTIVO_MIN = 10;

/**
 * Lê o motivo do corpo aceitando os três nomes que as telas já usam
 * (`rejectionReason`, `notes`, `observations`) — o contrato novo é um só,
 * mas quebrar as quatro telas antigas de uma vez seria pior que aceitar os
 * nomes que elas já mandam.
 */
function lerMotivoDevolucao(req: any): { ok: true; motivo: string } | { ok: false; erro: string } {
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
type DestinoDevolucao = "arte" | "finalizacao";

function lerDestinoDevolucao(req: any): DestinoDevolucao {
  return req.body?.destino === "arte" ? "arte" : "finalizacao";
}

/**
 * Os campos que cada destino grava.
 *
 * `arte` REFAZ do zero: apaga o thumb e o arquivo final e devolve a peca para
 * "Aguardando envio", zerando a aprovacao do patrocinador — arte nova precisa
 * de aprovacao nova, e manter o "aprovado" de uma versao que nao existe mais
 * seria carimbar um sim que ninguem deu.
 *
 * `finalizacao` mantem o thumb JA APROVADO e so limpa o arquivo final.
 */
function camposDoDestino(destino: DestinoDevolucao, rodadaAprovada: boolean) {
  if (destino === "arte") {
    return {
      status: "awaiting_submission",
      approvalThumbUrl: null,
      finalFileUrl: null,
      sponsorApprovedBy: null,
      sponsorApprovedAt: null,
    };
  }
  return {
    // A REGRA DO DONO (24/08, caso #4176): linha de patrocinador "Aguardando"
    // ⇒ a peça volta PENDENTE no Atendimento. Este destino devolvia SEMPRE a
    // `sponsor_approved` — inclusive com a rodada de aprovação aberta por
    // baixo (aprovação revogada no meio do caminho): a peça pulava a fila do
    // Atendimento e ficava "aprovada" com patrocinador pendente, sem nenhum
    // botão que a trouxesse de volta.
    status: rodadaAprovada ? "sponsor_approved" : "awaiting_sponsor_approval",
    finalFileUrl: null,
  };
}

/**
 * A rodada de aprovação desta peça está fechada? (todas as linhas aprovadas;
 * peça isenta ou sem patrocinador conta como fechada — não há quem aprovar.)
 * É o que decide se a devolução para "finalizacao" pode pousar em
 * `sponsor_approved` ou se a peça tem de voltar à fila do Atendimento.
 */
async function rodadaDeAprovacaoFechada(item: { id: string; skipApproval?: boolean | null }): Promise<boolean> {
  if (item.skipApproval) return true;
  const linhas = await storage.getItemSponsorApprovals(item.id);
  if (linhas.length === 0) return true;
  return linhas.every((l) => l.status === "approved");
}

/** A frase da auditoria — o destino escolhido precisa ficar no registro. */
function textoDoDestino(destino: DestinoDevolucao): string {
  return destino === "arte"
    ? "volta para o comeco da Arte (refazer a arte)"
    : "volta para a finalizacao (trocar o arquivo final)";
}

// Allow-list dos campos que o PATCH genérico /api/items/:id pode alterar.
// É uma lista deliberada e restritiva: `status` e TODOS os campos de fluxo
// (aprovação, produção, entrega, timestamps, flags de rejeição, quantidades
// produzidas/conferidas/entregues, campos "previous*") ficam de fora — eles
// só mudam pelas rotas dedicadas, que validam a transição e o papel do
// usuário. Sem esta trava, qualquer usuário autenticado poderia enviar
// PATCH { "status": "delivered" } e pular toda a máquina de estados
// (aprovação de patrocinador, revisão do criador, conferência da gráfica).
const updateItemSchema = insertItemSchema
  .pick({
    type: true,
    description: true,
    quantity: true,
    area: true,
    visual: true,
    visualWidth: true,
    visualHeight: true,
    fileWidth: true,
    fileHeight: true,
    material: true,
    finish: true,
    measurement: true,
    calculatedM2: true,
    observations: true,
    skipApproval: true,
    isReuse: true,
    approvalThumbUrl: true,
    finalFileUrl: true,
    finalFileName: true,
    referenceUrl: true,
    standardItemId: true,
  })
  .partial();

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
const COMPLEMENT_ALLOWED_STATUSES: readonly string[] = [
  "inProduction", "em_producao", "produced", "produzido",
  "conferred", "delivered", "entregue",
];

// m² é grandeza de produção/custo e não pode ser fonte-de-verdade do cliente.
// Quando as dimensões do arquivo estão presentes, o servidor RECALCULA
// calculatedM2 = quantidade × largura × altura (mesma fórmula de
// client/src/lib/calculateM2.ts), ignorando o valor enviado. Quando não há
// dimensões (itens sem medida de arquivo), não há como derivar e o valor
// recebido é mantido. Retorna string com 2 casas (coluna decimal(10,2)).
function deriveCalculatedM2(data: {
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
function deriveMeasurement(
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
function medidaMudou(
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
function derivarAreaVisual(
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

// Criação de itens: Solicitação/admin, ou o CRIADOR do evento (qualquer papel)
// — espelha o gate canEditLists do client. Sem isto, Gráfica/Arte/Atendimento
// criavam itens em eventos alheios direto pela API.
/**
 * Quem pode MUDAR A QUANTIDADE de uma peça que já entrou em produção —
 * criar complemento, cancelar complemento e reduzir até o piso físico.
 *
 * Regra do dono: só solicitacao e admin. Deliberadamente mais estrito que
 * `canCreateItemsFor`: criar peça no evento que você mesmo criou é uma coisa;
 * alterar o contrato de uma peça que já virou lona impressa no galpão é outra.
 * A Gráfica também não entra — ela produz o que pedem.
 */
function podeMudarQuantidade(req: { userRole?: string }): boolean {
  return req.userRole === "admin" || req.userRole === "solicitacao";
}

async function canCreateItemsFor(req: { userRole?: string; userId?: string }, eventId?: string): Promise<boolean> {
  if (req.userRole === "admin" || req.userRole === "solicitacao") return true;
  if (!eventId || !req.userId) return false;
  const ev = await storage.getEvent(eventId);
  return !!ev && ev.createdBy === req.userId;
}

// A guarda "evento finalizado não recebe trabalho" (constantes de erro,
// motivoEventoFechado/erroEventoFechado, motivoEventoDaPeca,
// barraEventoFinalizado, contadorDeBloqueio) mora em ./eventoFinalizado, não
// aqui. Motivo: aquele módulo também é importado por server/routes/events.ts
// (POST /api/events/:id/items/submit), e este arquivo (items.ts) importa os
// serviços de planilha (xlsxImport/xlsxExport → pacote `exceljs`). Se a guarda
// continuasse definida aqui, events.ts passaria a herdar essa árvore inteira
// só para checar se um evento acabou — e os testes puros de events.ts
// (event-status-derivado.test.ts, event-encerramento.test.ts) quebrariam num
// ambiente sem `exceljs` instalado, coisa que já aconteceu neste repo. O
// re-export abaixo existe só para não obrigar quem já importa estes nomes
// DAQUI (server/routes/sponsors.ts, os testes) a trocar de arquivo.
export {
  EVENTO_ENCERRADO_ERRO,
  EVENTO_REALIZADO_ERRO,
  motivoEventoFechado,
  erroEventoFechado,
  motivoEventoDaPeca,
  barraEventoFinalizado,
  contadorDeBloqueio,
} from "./eventoFinalizado";
import {
  motivoEventoFechado,
  erroEventoFechado,
  motivoEventoDaPeca,
  barraEventoFinalizado,
  contadorDeBloqueio,
} from "./eventoFinalizado";

// Enriquece uma lista de itens com { event, sponsors } fazendo apenas 4 queries
// totais (eventos, patrocinadores, vínculos item↔patrocinador e aprovações em
// bloco), em vez de 1 getEvent + 1 getItemSponsors + N getSponsor POR item
// (N+1). Cada sponsor recebe approvalStatus: "approved"|"rejected"|"pending"|null
// para que SponsorChips possa colorir os chips sem requests adicionais.
async function enrichItemsWithEventsAndSponsors(list: any[]): Promise<any[]> {
  if (list.length === 0) return [];
  const [allEvents, allSponsors, allItemSponsors, allApprovals] = await Promise.all([
    storage.getAllEvents(),
    storage.getAllSponsors(),
    storage.getAllItemSponsors(),
    storage.getAllItemSponsorApprovals(),
  ]);
  const eventById = new Map(allEvents.map((e) => [e.id, e]));
  const sponsorById = new Map(allSponsors.map((s) => [s.id, s]));
  // key: `${itemId}_${sponsorId}` → approval status
  const approvalKey = (itemId: string, sponsorId: string) => `${itemId}__${sponsorId}`;
  const approvalStatus = new Map<string, string>();
  for (const a of allApprovals) {
    approvalStatus.set(approvalKey(a.itemId, a.sponsorId), a.status);
  }
  const sponsorsByItem = new Map<string, any[]>();
  for (const is of allItemSponsors) {
    const sponsor = sponsorById.get(is.sponsorId);
    if (!sponsor) continue;
    const enrichedSponsor = {
      ...sponsor,
      approvalStatus: approvalStatus.get(approvalKey(is.itemId, is.sponsorId)) ?? null,
    };
    const arr = sponsorsByItem.get(is.itemId);
    if (arr) arr.push(enrichedSponsor);
    else sponsorsByItem.set(is.itemId, [enrichedSponsor]);
  }
  const withEventsAndSponsors = list.map((item) => ({
    ...item,
    event: eventById.get(item.eventId) ?? undefined,
    sponsors: sponsorsByItem.get(item.id) ?? [],
  }));

  return await enrichItemsWithComplements(withEventsAndSponsors);
}

// Aviso de migração pendente: uma linha por processo, não uma por request.
let avisouMigracaoComplemento = false;

/**
 * Anexa o parentesco de complemento à lista já enriquecida:
 *  - na MÃE: `complements: [...]` e `contractedTotal` (quantidade + Σ dos
 *    complementos vivos). Derivado a cada leitura, nunca gravado — contador
 *    denormalizado sempre acaba divergindo da realidade.
 *  - no FILHO: `parent: { id, displayId, quantity, status }`, para a linha
 *    poder dizer "COMPLEMENTO DE #0062" sem uma segunda requisição.
 *
 * Uma query extra por request (WHERE parent_item_id = ANY(...)), sobre índice.
 *
 * Degrada em silêncio se a migração ainda não rodou: as três rotas de leitura
 * continuam respondendo o que sempre responderam, só sem o bloco de
 * complemento. (Isso NÃO substitui o `npm run db:push` — o SELECT do Drizzle
 * lista as colunas explicitamente, então a leitura estoura antes de chegar
 * aqui. O try/catch é a rede para o caso de a query nova falhar sozinha.)
 */
async function enrichItemsWithComplements(list: any[]): Promise<any[]> {
  try {
    const ids = list.map((i) => i.id);
    const complements = await storage.getComplementsByParentIds(ids);
    if (complements.length === 0) {
      // Ainda assim precisa resolver o `parent` dos filhos cuja mãe não está
      // nesta lista (ex.: recorte por status que não trouxe a mãe).
      return await attachParents(list);
    }

    const byParent = new Map<string, any[]>();
    for (const c of complements) {
      if (!c.parentItemId) continue;
      const arr = byParent.get(c.parentItemId);
      if (arr) arr.push(c);
      else byParent.set(c.parentItemId, [c]);
    }

    const comMaes = list.map((item) => {
      const filhos = byParent.get(item.id);
      if (!filhos || filhos.length === 0) return item;
      const soma = filhos.reduce((acc: number, c: any) => acc + (Number(c.quantity) || 0), 0);
      return {
        ...item,
        complements: filhos,
        contractedTotal: (Number(item.quantity) || 0) + soma,
      };
    });

    return await attachParents(comMaes);
  } catch (error: any) {
    if (error?.code === "42703") {
      if (!avisouMigracaoComplemento) {
        avisouMigracaoComplemento = true;
        console.error("[COMPLEMENTOS] Migração pendente — rode npm run db:push. Listagens seguem sem o bloco de complemento.");
      }
      return list;
    }
    throw error;
  }
}

/** Resolve `parent` nos itens que são complementos, com no máximo 1 query extra. */
async function attachParents(list: any[]): Promise<any[]> {
  const filhos = list.filter((i) => i.parentItemId);
  if (filhos.length === 0) return list;

  const naLista = new Map(list.map((i) => [i.id, i]));
  const faltando = Array.from(new Set(
    filhos.map((f) => f.parentItemId).filter((pid: string) => !naLista.has(pid)),
  ));
  const extras = faltando.length ? await storage.getItemsByIds(faltando as string[]) : [];
  const maePorId = new Map<string, any>([
    ...Array.from(naLista.entries()),
    ...extras.map((m) => [m.id, m] as [string, any]),
  ]);

  return list.map((item) => {
    if (!item.parentItemId) return item;
    const mae = maePorId.get(item.parentItemId);
    if (!mae) return item;
    return {
      ...item,
      parent: { id: mae.id, displayId: mae.displayId, quantity: mae.quantity, status: mae.status },
    };
  });
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
// ─────────────────────────────────────────────────────────────────────────────
// QUEM RECEBE O AVISO DO BOOK.
//
// Antes: uma variável de ambiente com um endereço, igual para os 38 eventos —
// a mesma pessoa recebia tudo e repassava na mão. Agora o aviso vai para quem
// cuida DAQUELE evento: os executivos de conta dos patrocinadores vinculados.
// O endereço global continua configurado e entra como cópia fixa (é o serviço
// que junta os dois). Endereço faltando não é erro: o evento pode não ter
// executivo definido, e aí resta a cópia global.
// ─────────────────────────────────────────────────────────────────────────────
export async function destinatariosDoEvento(eventId: string): Promise<string[]> {
  const vinculos = await storage.getEventSponsors(eventId);
  const executivos = new Set<string>();
  for (const v of vinculos) {
    const sponsor = await storage.getSponsor(v.sponsorId);
    if (sponsor?.accountExecutiveId) executivos.add(sponsor.accountExecutiveId);
  }
  const emails: string[] = [];
  for (const id of Array.from(executivos)) {
    const user = await storage.getUser(id);
    if (user?.email) emails.push(user.email);
  }
  return emails;
}

// ─────────────────────────────────────────────────────────────────────────────
// QUEM RECEBE O AVISO DO BOOK — decisão do dono em 24/08.
//
// Regra atual: o ATENDIMENTO inteiro recebe de frente, e duas pessoas
// nomeadas acompanham em cópia oculta. Nem por papel aberto, nem por evento.
//
// Por que Atendimento e Arte no "Para": o Atendimento conversa com o
// patrocinador e registra aprovação; a Arte publica o book e precisa da
// confirmação de que ele saiu, com a contagem de peças, para conferir se saiu
// o que devia. Para os dois o book pronto é notícia de trabalho, não recado.
// Ninguém recebe por ser admin (as contas de admin incluem conta de sistema e
// gente que não acompanha a produção no dia a dia), e Solicitação NÃO entra —
// decisão do dono em 24/08.
//
// Por que também não é por evento: a regra por executivo de conta existe e
// funciona (`destinatariosDoEvento`), mas hoje só 41 dos 147 patrocinadores
// têm executivo preenchido, e quatro dos eventos com book não resolveriam
// ninguém. Ligar isso agora deixaria o aviso mudo justamente onde ele importa.
// O interruptor abaixo espera o cadastro melhorar; quando ligar, os executivos
// entram no "Para" e a lista nomeada desce para a cópia oculta.
//
// PARA MUDAR QUEM RECEBE, é aqui: acrescentar um endereço em
// DESTINATARIOS_NOMEADOS, ou um papel inteiro em PAPEIS_QUE_RECEBEM.
// ─────────────────────────────────────────────────────────────────────────────
export const USAR_EXECUTIVOS_DO_EVENTO = false;

/**
 * Papéis que recebem de frente. Solicitação ficou de fora por decisão do dono;
 * a lista existe justamente para essa escolha ser explícita e reversível numa
 * palavra, em vez de virar um `if` escondido.
 */
export const PAPEIS_QUE_RECEBEM = ["atendimento", "arte"];

/** Quem acompanha, por nome, independentemente do papel. Vai em cópia oculta. */
export const DESTINATARIOS_NOMEADOS = ["pedro@nortemkt.com", "yan.araujo@nortemkt.com"];

async function porFiltro(teste: (u: { email: string; role: string }) => boolean): Promise<string[]> {
  const usuarios = await storage.getAllUsers();
  return usuarios.filter((u) => !!u.email && teste(u as any)).map((u) => u.email);
}

/** O time que trabalha com o book. */
export const destinatariosPorPapel = () => porFiltro((u) => PAPEIS_QUE_RECEBEM.includes(u.role));

/** Quem acompanha de longe. */
export const destinatariosNomeados = () =>
  porFiltro((u) => DESTINATARIOS_NOMEADOS.includes(u.email.trim().toLowerCase()));

/**
 * Monta e dispara o aviso do book, e devolve a descrição do que aconteceu.
 * Uma falha aqui NUNCA desfaz o book — mas, ao contrário da primeira versão,
 * também não some: quem chama grava na trilha e conta para a tela.
 */
export async function avisarBookPorEmail(
  req: any,
  eventId: string,
  bookUrl: string,
  count: number,
): Promise<BookEmailResult> {
  try {
    const evento = await storage.getEvent(eventId);
    const [porEvento, porPapel, nomeados, doEvento, books] = await Promise.all([
      USAR_EXECUTIVOS_DO_EVENTO ? destinatariosDoEvento(eventId) : Promise.resolve([]),
      destinatariosPorPapel(),
      destinatariosNomeados(),
      storage.getItemsByEvent(eventId),
      storage.getAllEventBooks(),
    ]);
    // NO "PARA" quem trabalha com o book; em CÓPIA OCULTA quem acompanha. E a
    // rede de segurança: se por algum motivo o time ficar vazio (papel
    // renomeado, cadastro apagado), quem acompanha sobe para o "Para" — o
    // aviso nunca sai sem destinatário.
    const time = Array.from(new Set([...porEvento, ...porPapel]));
    const principais = time.length > 0 ? time : nomeados;
    const copias = time.length > 0 ? nomeados : [];
    return await notifyBookSaved({
      eventId,
      eventName: evento?.name ?? "Evento sem nome",
      itemCount: count,
      totalDoEvento: doEvento.length,
      bookUrl,
      publicadoPor: req.userName ?? null,
      saidaDoCaminhao: evento?.truckDepartureDate ? new Date(evento.truckDepartureDate as any).toISOString() : null,
      publicacao: books.filter((b) => b.eventId === eventId).length || 1,
      destinatariosPrincipais: principais,
      destinatariosDeCopia: copias,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "erro desconhecido";
    console.error("[book-email] falha ao preparar o aviso", { eventId, reason });
    return { status: "failed", reason };
  }
}

export const MOTIVO_REVOGACAO_PREFIXO = "Aprovação revogada automaticamente";

type GatilhoDeRevogacao =
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

export function registerItemRoutes(app: Express): void {
  // ============ ITEMS ============

  // Get all items with event data and sponsors.
  // Sem cap: um slice silencioso aqui fez peças "sumirem" do Painel quando o
  // banco passou de 1000. Se o payload virar problema, a saída é paginação
  // real (cursor) — nunca truncar sem avisar o cliente.
  app.get("/api/items", requireAuth, async (req, res) => {
    try {
      const allItems = await storage.getAllItems();
      if (allItems.length > 5000) {
        console.warn(`[items] GET /api/items retornando ${allItems.length} itens — priorizar paginação`);
      }
      const itemsWithEventsAndSponsors = await enrichItemsWithEventsAndSponsors(allItems);
      res.json(itemsWithEventsAndSponsors);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get deleted (soft-deleted) items — admin e solicitacao only
  app.get("/api/items/deleted", requireAuth, async (req, res) => {
    try {
      if (req.userRole !== "admin" && req.userRole !== "solicitacao") {
        return res.status(403).json({ error: "Sem permissão para ver peças excluídas" });
      }
      const deletedItems = await storage.getDeletedItems();
      const enriched = await enrichItemsWithEventsAndSponsors(deletedItems);
      res.json(enriched);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Restaurar peça excluída (desfaz o soft delete) — SOMENTE admin.
  // A visão "Excluídos" era um beco sem saída: dava para ver, não para voltar.
  //
  // SEM a guarda de evento finalizado (é ARRUMAR A CASA, não fazer andar):
  // restaurar é o desfazer de uma exclusão, e a exclusão continua liberada em
  // evento finalizado. Barrar só aqui tornaria PERMANENTE um clique errado —
  // a peça excluída por engano ficaria na lixeira para sempre, porque o
  // caminho de volta estaria fechado. Restaurar não faz ninguém trabalhar: a
  // peça volta com o MESMO status que tinha.
  app.post("/api/items/:id/restore", requireAuth, async (req, res) => {
    try {
      if (req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas administradores podem restaurar peças" });
      }
      const restored = await storage.restoreItem(req.params.id);
      if (!restored) {
        return res.status(404).json({ error: "Peça não encontrada ou não está excluída" });
      }
      const item = await storage.getItem(req.params.id);
      await createAuditLog(
        req,
        "restored",
        "item",
        req.params.id,
        `Peça "${item?.displayId ?? req.params.id}" restaurada da lixeira`
      );
      if (item) await updateEventStatus(item.eventId);
      broadcast({ type: "item_updated", item });
      res.json({ success: true, item });
    } catch (error: any) {
      res.status(500).json({ error: "Não foi possível restaurar a peça" });
    }
  });

  // Get pending items with event and sponsors (for Arte module) - MUST come BEFORE /:eventId route
  app.get("/api/items/pending", requireAuth, async (req, res) => {
    try {
      const pendingItems = await storage.getPendingItems();
      const itemsWithEventsAndSponsors = await enrichItemsWithEventsAndSponsors(pendingItems);
      res.json(itemsWithEventsAndSponsors);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get items that have at least one awaiting_arte sponsor approval (for Arte correção) - MUST come BEFORE /:eventId
  app.get("/api/items/resubmission-needed", requireAuth, async (req, res) => {
    try {
      if (req.userRole !== "arte" && req.userRole !== "admin") {
        return res.status(403).json({ error: "Acesso não autorizado" });
      }

      // Batch: carrega tudo em paralelo (poucas queries totais) em vez de
      // fazer N+1 round trips (approvals/sponsors/evento por item), que
      // deixava a aba de Correção lenta para abrir com muitos itens.
      const [allItems, allEvents, allSponsors, allItemSponsorApprovals] = await Promise.all([
        storage.getAllItems(),
        storage.getAllEvents(),
        storage.getAllSponsors(),
        storage.getAllItemSponsorApprovals(),
      ]);

      // A fila da Correção responde UMA pergunta: "o que voltou e precisa ser
      // refeito?". Ela tinha DOIS pré-requisitos para responder — a peça em
      // `awaiting_sponsor_approval` E uma linha de patrocinador em
      // `awaiting_arte` —, e o segundo era mecânica de UM dos caminhos de
      // reprovação, não parte da pergunta.
      //
      // Consequência: peça reprovada pelo caminho que devolvia a peça INTEIRA
      // (o antigo "Reprovar Ativo", removido em 17/08) caía em
      // `awaiting_submission` sem marcar patrocinador nenhum, e sumia da
      // Correção — ia para o meio das 1.120 que nunca tinham sido enviadas.
      // A #3042 é o caso: a trilha registra "Kakau Faria · reprovado pelo
      // patrocinador", e mesmo assim ela não estava aqui.
      //
      // `rejectedBySponsor` é a marca canônica de "isto voltou de um
      // patrocinador" e não depende de saber QUAL deles — que é uma informação
      // que aquele caminho nunca gravou. A peça sai daqui sozinha quando a
      // Arte reenvia: o status muda para `awaiting_sponsor_approval` e ela
      // deixa de casar (a flag continua ligada de propósito até a aprovação —
      // ver o comentário em /submit-for-approval —, então é o STATUS que a
      // tira da fila, não a flag).
      const awaitingItems = allItems.filter(i => i.status === "awaiting_sponsor_approval");
      const devolvidasSemDono = allItems.filter(
        i => i.status === "awaiting_submission" && i.rejectedBySponsor === true,
      );
      const eventById = new Map(allEvents.map(e => [e.id, e]));
      const sponsorById = new Map(allSponsors.map(s => [s.id, s]));

      const approvalsByItem = new Map<string, any[]>();
      // TODAS as aprovações da peça, por item — o painel de reenvio precisa
      // de quem já aprovou tanto quanto de quem reprovou: é a diferença
      // entre "vai receber" e "mantém aprovação".
      const todasPorItem = new Map<string, any[]>();
      for (const a of allItemSponsorApprovals) {
        const t = todasPorItem.get(a.itemId);
        if (t) t.push(a); else todasPorItem.set(a.itemId, [a]);
        if (a.status !== "awaiting_arte") continue;
        const list = approvalsByItem.get(a.itemId);
        if (list) list.push(a);
        else approvalsByItem.set(a.itemId, [a]);
      }
      const comPatrocinador = (lista: any[]) => lista.map((a: any) => ({ ...a, sponsor: sponsorById.get(a.sponsorId) || null }));

      const result = [];
      for (const item of awaitingItems) {
        const awaitingArte = approvalsByItem.get(item.id);
        if (!awaitingArte || awaitingArte.length === 0) continue;

        result.push({
          ...item,
          event: eventById.get(item.eventId) || null,
          awaitingArteApprovals: comPatrocinador(awaitingArte),
          aprovacoes: comPatrocinador(todasPorItem.get(item.id) ?? []),
        });
      }

      // A DEVOLVIDA LEVA AS APROVAÇÕES QUE ELA TEM — e não um array vazio.
      //
      // Aqui havia `awaitingArteApprovals: []` fixo, com um comentário meu
      // afirmando que "vazio é a resposta honesta, nunca houve linha de
      // patrocinador". Estava errado: uma peça pode ter sido devolvida INTEIRA
      // (status awaiting_submission, rejectedBySponsor) e AINDA ASSIM ter um
      // patrocinador em awaiting_arte. A #3027 tinha — Atlas Schindler, com
      // motivo escrito. O `[]` jogava esse dado fora.
      //
      // E o estrago não era cosmético: o seletor do modal de correção é
      // alimentado por esta lista, e sem linha nenhuma para marcar o botão
      // "Confirmar Re-envio" nunca saía de desabilitado. A pessoa subia a arte
      // nova e ficava sem saída.
      for (const item of devolvidasSemDono) {
        const awaitingArte = approvalsByItem.get(item.id) ?? [];
        result.push({
          ...item,
          event: eventById.get(item.eventId) || null,
          awaitingArteApprovals: comPatrocinador(awaitingArte),
          aprovacoes: comPatrocinador(todasPorItem.get(item.id) ?? []),
        });
      }

      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get approved items with event and sponsors (for Gráfica module) - MUST come BEFORE /:eventId route
  app.get("/api/items/approved", requireAuth, async (req, res) => {
    try {
      const approvedItems = await storage.getApprovedItems();
      const itemsWithEventsAndSponsors = await enrichItemsWithEventsAndSponsors(approvedItems);
      res.json(itemsWithEventsAndSponsors);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get items by event with sponsors - MUST come AFTER specific routes like /pending and /approved
  // Batch: retorna sponsors + approvals de todos os itens aguardando aprovação
  // em 3 queries totais, evitando o N*2 de chamadas individuais da página de atendimento.
  // DEVE ficar ANTES de /:eventId — senão Express captura "batch-approval-data" como eventId.
  app.get("/api/items/batch-approval-data", requireAuth, async (req, res) => {
    try {
      // Devolve TODOS os vínculos e aprovações do sistema — restrito aos
      // papéis que veem a tela de Atendimento (era aberto a qualquer sessão).
      if (!["atendimento", "arte", "admin"].includes(req.userRole ?? "")) {
        return res.status(403).json({ error: "Acesso não autorizado" });
      }
      const [allSponsors, allItemSponsors, allApprovals] = await Promise.all([
        storage.getAllSponsors(),
        storage.getAllItemSponsors(),
        storage.getAllItemSponsorApprovals(),
      ]);

      const sponsorById = new Map(allSponsors.map(s => [s.id, s]));

      // agrupa vínculos por item
      const sponsorsByItem: Record<string, any[]> = {};
      for (const is of allItemSponsors) {
        const sponsor = sponsorById.get(is.sponsorId);
        if (!sponsor) continue;
        (sponsorsByItem[is.itemId] ??= []).push(sponsor);
      }

      // agrupa approvals por item, enriquecendo com sponsor
      const approvalsByItem: Record<string, any[]> = {};
      for (const a of allApprovals) {
        const enriched = { ...a, sponsor: sponsorById.get(a.sponsorId) || null };
        (approvalsByItem[a.itemId] ??= []).push(enriched);
      }

      res.json({ sponsorsByItem, approvalsByItem });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/items/:eventId", requireAuth, async (req, res) => {
    try {
      const items = await storage.getItemsByEvent(req.params.eventId);
      const itemsWithSponsors = await enrichItemsWithEventsAndSponsors(items);
      res.json(itemsWithSponsors);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Create item
  app.post("/api/items", requireAuth, async (req, res) => {
    try {
      // publicInsertItemSchema (e não insertItemSchema): o parentesco de
      // complemento NÃO é criável pela API pública. Sem este recorte, qualquer
      // usuário autenticado forjaria parentItemId no body e penduraria uma peça
      // como "complemento" de outra — inclusive de outro evento —, contaminando
      // contractedTotal, a ordenação e a fila da Gráfica. Parentesco só nasce
      // em POST /api/items/:id/complement, que valida papel, status e
      // ancestralidade.
      const validatedData = publicInsertItemSchema.parse(req.body);
      if (!(await canCreateItemsFor(req, validatedData.eventId))) {
        return res.status(403).json({ error: "Sem permissão para criar itens neste evento" });
      }
      // Não confiar no m² do cliente — recalcular no servidor quando derivável.
      const derivedM2 = deriveCalculatedM2(validatedData);
      if (derivedM2 !== undefined) validatedData.calculatedM2 = derivedM2;
      // Medida vazia nasce derivada — uma peça sem medida legível na planilha
      // da gráfica é uma peça que volta como pergunta.
      if (!String(validatedData.measurement ?? "").trim()) {
        const medida = deriveMeasurement(validatedData.fileWidth, validatedData.fileHeight);
        if (medida !== undefined) validatedData.measurement = medida;
      }

      const event = await storage.getEvent(validatedData.eventId);
      if (!event) {
        return res.status(404).json({ error: "Evento não encontrado" });
      }
      
      // Evento fechado (à mão OU já realizado) vem ANTES do ramo de
      // "completed": ver motivoEventoFechado.
      const fechadoAvulsa = motivoEventoFechado(event);
      if (fechadoAvulsa) {
        return res.status(409).json({ error: erroEventoFechado(fechadoAvulsa) });
      }

      // Check if event was completed - if so, reset priority and require re-definition
      if (event.status === "completed") {
        await storage.updateEvent(event.id, { 
          status: "created",
          priority: undefined // Reset priority - must be redefined
        });
        
        // Notificação sobre reset de prioridade (apenas admin)
        const notification = await storage.createNotification({
          type: "eventCreated",
          message: `Item adicionado ao evento "${event.name}" que estava concluído. Prioridade precisa ser redefinida.`,
          eventId: event.id,
          targetRoles: ["admin"],
        });
        broadcast({ type: "notification_created", notification });
      }
      
      const item = await storage.createItem(validatedData);
      
      // Create audit log
      await createAuditLog(
        req,
        'created',
        'item',
        item.id,
        `Item "${item.type}" criado - Qtd: ${item.quantity}, ${item.calculatedM2}m²`
      );
      
      // Novo item adicionado - notifica Arte + Gráfica
      const notification = await storage.createNotification({
        type: "itemAdded",
        message: `Novo item adicionado: ${item.type} - Evento: ${event.name}`,
        eventId: item.eventId,
        itemId: item.id,
        targetRoles: ["arte"], // só quem AGE agora: a Gráfica entra bem depois, quando liberam p/ produção
      });
      
      // Update event status
      await updateEventStatus(item.eventId);
      
      broadcast({ type: "item_created", item });
      broadcast({ type: "notification_created", notification });
      
      res.status(201).json(item);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Create multiple items at once (bulk)
  app.post("/api/items/bulk", requireAuth, async (req, res) => {
    try {
      const { items: itemsData } = req.body;
      
      if (!Array.isArray(itemsData) || itemsData.length === 0) {
        return res.status(400).json({ error: "Items array is required and cannot be empty" });
      }
      if (!(await canCreateItemsFor(req, itemsData[0]?.eventId))) {
        return res.status(403).json({ error: "Sem permissão para criar itens neste evento" });
      }
      // Mesma trava do POST unitário — sem ela o lote era o caminho aberto para
      // pendurar peça num evento encerrado.
      const fechadoLote = motivoEventoFechado(await storage.getEvent(itemsData[0]?.eventId));
      if (fechadoLote) {
        return res.status(409).json({ error: erroEventoFechado(fechadoLote) });
      }

      // Validate all items
      const validatedItems = itemsData.map((item, index) => {
        try {
          // publicInsertItemSchema: mesma blindagem do POST unitário — o body
          // do lote não cria parentesco de complemento (ver acima).
          const parsed = publicInsertItemSchema.parse(item);
          // Recalcular m² no servidor quando derivável (não confiar no cliente).
          const derivedM2 = deriveCalculatedM2(parsed);
          if (derivedM2 !== undefined) parsed.calculatedM2 = derivedM2;
          if (!String(parsed.measurement ?? "").trim()) {
            const medida = deriveMeasurement(parsed.fileWidth, parsed.fileHeight);
            if (medida !== undefined) parsed.measurement = medida;
          }
          return parsed;
        } catch (error: any) {
          throw new Error(`Validation error at item ${index + 1}: ${error.message}`);
        }
      });
      
      // Create all items in bulk
      const createdItems = await storage.createBulkItems(validatedItems);
      
      // Create audit log for each item created
      for (const item of createdItems) {
        await createAuditLog(
          req,
          'created',
          'item',
          item.id,
          `Item "${item.type}" criado - Qtd: ${item.quantity}, ${item.calculatedM2}m²`
        );
      }
      
      // Get event for notification
      const firstItem = createdItems[0];
      const event = firstItem ? await storage.getEvent(firstItem.eventId) : null;
      
      // Primeira lista de itens - notificação única para Arte + Gráfica
      if (event) {
        const notification = await storage.createNotification({
          type: "itemAdded",
          message: `${createdItems.length} itens adicionados - Evento: ${event.name}`,
          eventId: event.id,
          targetRoles: ["arte"], // só quem AGE agora: a Gráfica entra bem depois, quando liberam p/ produção
        });
        broadcast({ type: "notification_created", notification });
      }
      
      // Broadcast update
      broadcast({ type: "items_bulk_created", items: createdItems, eventId: firstItem?.eventId });
      
      res.status(201).json(createdItems);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });


  // ── Export items to Excel (.xlsx) ────────────────────────────────────────
  app.get("/api/events/:id/export-items", requireAuth, handleExportItemsXlsx);
  // Exportação da Gráfica: recebe os ids já filtrados pela tela.
  app.post("/api/items/export-xlsx", requireAuth, handleExportSelectedItemsXlsx);


  // Import de Excel usa o fluxo preview → confirm (abaixo). O endpoint direto
  // /import-xlsx (parser legado) foi removido: importava a aba errada em
  // planilhas cujo cabeçalho usa "cód peça" em vez de "item" e não vinculava
  // patrocinadores.

  // ── Preview Excel items (parse without saving) ───────────────────────────
  app.post("/api/events/:id/preview-xlsx", requireAuth, handlePreviewXlsx);

  // ── Confirm import (save pre-reviewed items) ─────────────────────────────
  app.post("/api/events/:id/confirm-import", requireAuth, async (req, res) => {
    if (!(await canCreateItemsFor(req, req.params.id))) {
      return res.status(403).json({ error: "Sem permissão para importar itens neste evento" });
    }
    // A planilha é a porta que entra mais peça de uma vez — bloquear aqui, no
    // wrapper que já faz o gate de papel, evita 200 peças invisíveis.
    const fechadoImport = motivoEventoFechado(await storage.getEvent(req.params.id));
    if (fechadoImport) {
      return res.status(409).json({ error: erroEventoFechado(fechadoImport) });
    }
    return handleConfirmImport(req, res);
  });


  // ── Clone items from another event ───────────────────────────────────────
  app.post("/api/events/:id/clone-items", requireAuth, async (req, res) => {
    if (!(await canCreateItemsFor(req, req.params.id))) {
      return res.status(403).json({ error: "Sem permissão para clonar itens para este evento" });
    }
    try {
      const targetEvent = await storage.getEvent(req.params.id);
      if (!targetEvent) return res.status(404).json({ error: "Evento destino não encontrado" });
      // Clonar é criar peça — a quarta porta, e a que traz a lista inteira.
      const fechadoClone = motivoEventoFechado(targetEvent);
      if (fechadoClone) {
        return res.status(409).json({ error: erroEventoFechado(fechadoClone) });
      }

      const { sourceEventId } = req.body as { sourceEventId: string };
      if (!sourceEventId) return res.status(400).json({ error: "sourceEventId é obrigatório" });

      const sourceEvent = await storage.getEvent(sourceEventId);
      if (!sourceEvent) return res.status(404).json({ error: "Evento origem não encontrado" });

      const sourceItems = await storage.getItemsByEvent(sourceEventId);
      if (sourceItems.length === 0) {
        return res.status(400).json({ error: "O evento de origem não tem itens para clonar" });
      }

      const cloned = sourceItems.map(item => ({
        eventId: targetEvent.id,
        type: item.type,
        description: item.description || "",
        quantity: item.quantity,
        area: item.area,
        visual: item.visual,
        visualWidth: item.visualWidth,
        visualHeight: item.visualHeight,
        fileWidth: item.fileWidth,
        fileHeight: item.fileHeight,
        material: item.material,
        finish: item.finish,
        measurement: item.measurement,
        observations: item.observations || "",
        calculatedM2: item.calculatedM2,
        status: "draft" as const,
        isReuse: item.isReuse || false,
      }));

      const validated = cloned.map((item, i) => {
        try {
          return insertItemSchema.parse(item);
        } catch (e: any) {
          throw new Error(`Item ${i + 1} (${item.type}): ${e.message}`);
        }
      });

      const created = await storage.createBulkItems(validated);

      await createAuditLog(
        req,
        'created',
        'item',
        targetEvent.id,
        `${created.length} itens clonados do evento "${sourceEvent.name}"`
      );

      const notification = await storage.createNotification({
        type: "itemAdded",
        message: `${created.length} itens clonados de "${sourceEvent.name}" → "${targetEvent.name}"`,
        eventId: targetEvent.id,
        targetRoles: ["arte"], // só quem AGE agora: a Gráfica entra bem depois, quando liberam p/ produção
      });
      broadcast({ type: "notification_created", notification });
      broadcast({ type: "items_bulk_created", items: created, eventId: targetEvent.id });
      await updateEventStatus(targetEvent.id);

      res.status(201).json({ cloned: created.length, items: created });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Update item
  app.patch("/api/items/:id", requireAuth, async (req, res, next) => {
    try {
      // As rotas de lote (/api/items/bulk-return-to-arte, bulk-cancel,
      // bulk-creator-reject) são registradas DEPOIS desta — sem este desvio o
      // Express casava :id = "bulk-..." e as três ficavam INALCANÇÁVEIS
      // ("Devolver Selecionadas" nunca chegou ao handler certo).
      if (req.params.id.startsWith("bulk-")) return next();

      // Gate de papel: quem edita peça é quem gerencia a lista (admin,
      // solicitação, criador do evento) ou os papéis com edições pontuais no
      // fluxo (arte: thumbs/refs; atendimento: vinculação). Gráfica usa as
      // rotas dedicadas de conferir/entregar — estava tudo aberto via PATCH.
      const role = req.userRole ?? "";
      if (!["admin", "solicitacao", "arte", "atendimento"].includes(role)) {
        const existing = await storage.getItem(req.params.id);
        if (!existing) return res.status(404).json({ error: "Item not found" });
        const parentEvent = await storage.getEvent(existing.eventId);
        if (!parentEvent || parentEvent.createdBy !== req.userId) {
          return res.status(403).json({ error: "Sem permissão para editar esta peça" });
        }
      }

      // Allow-list explícita: barra `status` e campos de fluxo (ver
      // updateItemSchema). Transições de status só pelas rotas dedicadas.
      const validatedData = updateItemSchema.parse(req.body);

      // O arquivo final tem rotas próprias com gate de status (submit/update-
      // final-file). Pelo PATCH genérico, arte/atendimento não trocam o
      // arquivo que a Gráfica imprime — admin/solicitação (gestores da lista)
      // seguem podendo para correções administrativas.
      if (["arte", "atendimento"].includes(role) &&
          ("finalFileUrl" in validatedData || "finalFileName" in validatedData)) {
        return res.status(403).json({
          error: "Arquivo final só pode ser alterado pela rota de envio da Arte (com validação de status)."
        });
      }

      // Normalize referenceUrl from raw GCS URL to /objects/ proxy path and
      // record an ACL policy so the object is attributed to its uploader.
      // Reference photos/art files are treated as "public" to any
      // authenticated user, matching the pre-existing behavior where objects
      // with no ACL policy were freely accessible to anyone logged in.
      if (validatedData.referenceUrl) {
        const { ObjectStorageService } = await import("../objectStorage");
        const objectStorageService = new ObjectStorageService();
        try {
          validatedData.referenceUrl = await objectStorageService.trySetObjectEntityAclPolicy(
            validatedData.referenceUrl,
            { owner: req.userId!, visibility: "public" }
          );
        } catch {
          // Object may not exist in storage yet (e.g. legacy/external URL) —
          // fall back to just normalizing the path without setting an ACL.
          validatedData.referenceUrl = objectStorageService.normalizeObjectEntityPath(validatedData.referenceUrl);
        }
      }

      // Pegar item atual antes de atualizar
      const currentItem = await storage.getItem(req.params.id);
      if (!currentItem) {
        return res.status(404).json({ error: "Item not found" });
      }
      // ANDA: este PATCH mexe em quantidade, material, dimensões e m² — o
      // contrato da peça. Num evento que já acabou, mudar o contrato só
      // reescreve o que foi fechado.
      if (await barraEventoFinalizado(currentItem, res)) return;

      const updatePayload: Record<string, any> = { ...validatedData };

      // ── QUANTIDADE: a bifurcação aumentar/reduzir mora aqui ────────────────
      // Este era o caminho silencioso do sistema: dava para digitar 15 numa
      // peça ENTREGUE com 10 unidades e o servidor aceitava. A peça continuava
      // "Entregue" (nenhum status muda no PATCH), ganhava 5 unidades que
      // ninguém imprimiu e passava a convidar a Gráfica a conferir material
      // inexistente. Sem este gate, o modelo de complemento conviveria com o
      // modelo antigo — dois modelos concorrentes para o mesmo problema.
      const novaQtd = validatedData.quantity;
      const mudouQtd = novaQtd != null && Number(novaQtd) !== currentItem.quantity;
      let promoveuParaProduzido = false;

      if (mudouQtd) {
        const nova = Number(novaQtd);
        const emProducao = COMPLEMENT_ALLOWED_STATUSES.includes(currentItem.status);

        if (emProducao && nova > currentItem.quantity) {
          return res.status(409).json({
            error: `A peça ${currentItem.displayId} já está em produção. Para aumentar, use "Aumentar quantidade" (cria um complemento).`,
            code: "USE_COMPLEMENT",
            itemId: currentItem.id,
            displayId: currentItem.displayId,
            currentQuantity: currentItem.quantity,
            suggestedComplement: nova - currentItem.quantity,
          });
        }

        // PISO FÍSICO da redução: não dá para reduzir abaixo do que já existe
        // no mundo real. Sem ele, uma peça com 10 produzidas e quantidade 8
        // ficaria com inventário órfão e com tetos NEGATIVOS em confer/deliver.
        // Espelhado em client/src/lib/saldo.ts → reductionFloorOf().
        const produzidas = (currentItem.quantityProduced ?? 0) + (currentItem.reuseQty ?? 0);
        const piso = Math.max(produzidas, currentItem.conferredQty ?? 0, currentItem.deliveredQty ?? 0);
        if (nova < piso) {
          return res.status(409).json({
            error: `Não é possível reduzir para ${nova}: já há ${piso} un. produzidas/conferidas/entregues. Mínimo: ${piso}.`,
            code: "QUANTITY_FLOOR",
            minimum: piso,
          });
        }

        // Promoção SÓ PARA CIMA: se a redução zera o saldo a produzir e a peça
        // está em produção, ela virou "Produzido" de fato. Cobre o caso real
        // "produzi 10 das 15 e o cliente desistiu das outras 5" — sem isto a
        // peça ficaria eternamente Em Produção com saldo fantasma. Nunca
        // rebaixa: peça entregue continua entregue.
        if (nova <= produzidas && (currentItem.status === "inProduction" || currentItem.status === "em_producao")) {
          updatePayload.status = "produced";
          promoveuParaProduzido = true;
        }
      }

      // m² é derivado, não recebido: quando a quantidade ou as dimensões do
      // arquivo mudam, o valor enviado pelo cliente é ignorado e recalculado
      // com o estado MESCLADO (o que veio no PATCH + o que já estava na peça).
      // Sem isto, editar só a quantidade deixava o m² congelado no valor antigo
      // — e o m² é o número que vira custo e fechamento com patrocinador.
      if ("quantity" in validatedData || "fileWidth" in validatedData || "fileHeight" in validatedData) {
        const derivado = deriveCalculatedM2({
          quantity: novaQtd ?? currentItem.quantity,
          fileWidth: "fileWidth" in validatedData ? validatedData.fileWidth : currentItem.fileWidth,
          fileHeight: "fileHeight" in validatedData ? validatedData.fileHeight : currentItem.fileHeight,
        });
        if (derivado !== undefined) updatePayload.calculatedM2 = derivado;
      }

      // E a MEDIDA junto com o m². Os dois nascem das mesmas duas colunas;
      // recalcular um e deixar o outro é o que produziu a divergência da
      // peça #2472 — m² certo, medida antiga, e a planilha da gráfica
      // saindo com a medida antiga.
      if ("fileWidth" in validatedData || "fileHeight" in validatedData) {
        const novoW = "fileWidth" in validatedData ? validatedData.fileWidth : currentItem.fileWidth;
        const novoH = "fileHeight" in validatedData ? validatedData.fileHeight : currentItem.fileHeight;
        if (medidaMudou(currentItem, novoW, novoH)) {
          const medida = deriveMeasurement(novoW, novoH);
          // O cliente manda o `measurement` que carregou ao ABRIR o form —
          // isto é, o antigo. Aqui ele é ignorado de propósito.
          if (medida !== undefined) updatePayload.measurement = medida;
        }
      }

      // E o par velho da medida VISUAL anda com o par novo. Mesma doença,
      // dupla ao lado: o formulário manda visualWidth/visualHeight e deixa
      // area/visual congelados, e é `area × visual` que a linha do tempo da
      // peça imprime.
      if ("visualWidth" in validatedData || "visualHeight" in validatedData) {
        const par = derivarAreaVisual(
          "visualWidth" in validatedData ? validatedData.visualWidth : currentItem.visualWidth,
          "visualHeight" in validatedData ? validatedData.visualHeight : currentItem.visualHeight,
        );
        if (par) { updatePayload.area = par.area; updatePayload.visual = par.visual; }
      }

      const item = await storage.updateItem(req.params.id, updatePayload);
      if (!item) {
        return res.status(404).json({ error: "Item not found" });
      }

      // Create audit log - build descriptive diff of changed fields
      const changedParts: string[] = [];

      if (item.status !== currentItem.status) {
        changedParts.push(`Status: ${translateStatus(currentItem.status)} → ${translateStatus(item.status)}`);
      }
      if ('isReuse' in validatedData && item.isReuse !== currentItem.isReuse) {
        changedParts.push(item.isReuse ? "Marcado para reaproveitamento" : "Reaproveitamento removido");
      }
      if ('quantity' in validatedData && item.quantity !== currentItem.quantity) {
        // Numa peça já em produção, "15 → 10" sozinho não explica nada seis
        // meses depois. O contexto físico (o que já existe impresso) e o m²
        // resultante vão junto — é o que responde "por que o fechamento mudou".
        const contexto = COMPLEMENT_ALLOWED_STATUSES.includes(currentItem.status)
          ? ` Já produzidas ${(currentItem.quantityProduced ?? 0) + (currentItem.reuseQty ?? 0)},`
            + ` conferidas ${currentItem.conferredQty ?? 0}, entregues ${currentItem.deliveredQty ?? 0}.`
            + (item.calculatedM2 !== currentItem.calculatedM2 ? ` m²: ${currentItem.calculatedM2} → ${item.calculatedM2}` : "")
          : "";
        changedParts.push(`Quantidade: ${currentItem.quantity ?? '—'} → ${item.quantity ?? '—'} un.${contexto}`);
      }
      if (promoveuParaProduzido) {
        changedParts.push("Saldo zerado pela redução — peça promovida para Produzido");
      }
      if ('type' in validatedData && item.type !== currentItem.type) {
        changedParts.push(`Tipo: ${currentItem.type ?? '—'} → ${item.type ?? '—'}`);
      }
      if ('material' in validatedData && item.material !== currentItem.material) {
        changedParts.push(`Material: ${currentItem.material ?? '—'} → ${item.material ?? '—'}`);
      }
      if ('finish' in validatedData && item.finish !== currentItem.finish) {
        changedParts.push(`Acabamento: ${currentItem.finish ?? '—'} → ${item.finish ?? '—'}`);
      }
      if ('fileWidth' in validatedData || 'fileHeight' in validatedData) {
        if (item.fileWidth !== currentItem.fileWidth || item.fileHeight !== currentItem.fileHeight) {
          changedParts.push(`Dimensões: ${currentItem.fileWidth ?? '?'}×${currentItem.fileHeight ?? '?'} → ${item.fileWidth ?? '?'}×${item.fileHeight ?? '?'}`);
        }
        // A medida acompanha, e a trilha diz que acompanhou — é o campo que
        // a gráfica lê na planilha, e antes ele ficava para trás em silêncio.
        if (item.measurement !== currentItem.measurement) {
          changedParts.push(`Medida: ${currentItem.measurement || '—'} → ${item.measurement || '—'}`);
        }
      }
      if ('visualWidth' in validatedData || 'visualHeight' in validatedData) {
        if (item.visualWidth !== currentItem.visualWidth || item.visualHeight !== currentItem.visualHeight) {
          changedParts.push(`Medida visual: ${currentItem.visualWidth ?? '?'}×${currentItem.visualHeight ?? '?'} → ${item.visualWidth ?? '?'}×${item.visualHeight ?? '?'}`);
        }
      }
      if ('observations' in validatedData && item.observations !== currentItem.observations) {
        changedParts.push("Observações atualizadas");
      }
      if ('approvalThumbUrl' in validatedData && item.approvalThumbUrl !== currentItem.approvalThumbUrl) {
        changedParts.push("Thumb de aprovação atualizado");
      }
      if ('finalFileUrl' in validatedData && item.finalFileUrl !== currentItem.finalFileUrl) {
        changedParts.push("Arquivo final atualizado");
      }
      if ('referenceUrl' in validatedData && item.referenceUrl !== currentItem.referenceUrl) {
        changedParts.push("Referência de arte atualizada");
      }
      if ('skipApproval' in validatedData && item.skipApproval !== currentItem.skipApproval) {
        changedParts.push(item.skipApproval ? "Aprovação de patrocinador dispensada" : "Aprovação de patrocinador reativada");
      }

      const auditDetails = changedParts.length > 0
        ? changedParts.join(" | ")
        : `Item "${item.type}" atualizado`;
      
      await createAuditLog(
        req,
        'updated',
        'item',
        item.id,
        auditDetails
      );
      
      // Recalculate event status if item status changed
      await updateEventStatus(item.eventId);

      broadcast({ type: "item_updated", item });

      // Redução de quantidade numa peça que a Gráfica já está produzindo: ela
      // precisa saber ANTES de imprimir a mais. (Aumento não cai aqui — em
      // produção ele é barrado acima com USE_COMPLEMENT.)
      //
      // NÃO acende destaque persistente na linha: reduzir não cria trabalho,
      // só corta meta. Um aviso no sino e a lista atualizada bastam.
      //
      // O broadcast extra usa "production_updated" de propósito: é o tipo que
      // já invalida '/api/items/approved' (a fila da Gráfica), que roda com
      // staleTime: Infinity — "item_updated" sozinho não a alcança.
      if (mudouQtd && COMPLEMENT_ALLOWED_STATUSES.includes(currentItem.status)) {
        const ev = await storage.getEvent(item.eventId);
        const notif = await storage.createNotification({
          type: "quantityReduced",
          message: `Quantidade reduzida: ${item.displayId} (${item.type}) — ${currentItem.quantity} → ${item.quantity} un.${ev ? ` — ${ev.name}` : ""}`,
          eventId: item.eventId,
          itemId: item.id,
          targetRoles: ["grafica"],
        });
        broadcast({ type: "production_updated", item });
        broadcast({ type: "notification_created", notification: notif });
      }

      res.json(item);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Delete item (soft delete — preservado no histórico)
  //
  // SEM a guarda de evento finalizado (é ARRUMAR A CASA). Excluir não faz o
  // trabalho andar: tira a peça da frente. Barrar aqui deixaria LIXO PRESO —
  // a peça duplicada, o rascunho digitado errado e a linha que nunca deveria
  // existir ficariam para sempre num evento em que ninguém mais pode mexer,
  // poluindo o Painel Geral e a contagem do Detalhe do Evento. E o risco é
  // baixo pelos dois motivos que já valem hoje: a exclusão é SOFT (a peça vai
  // para a lixeira, com deletedAt) e RESTAURÁVEL pela rota de restauração,
  // com autor e data no audit log.
  app.delete("/api/items/:id", requireAuth, async (req, res) => {
    try {
      // Gate de PAPEL — o único gate de permissão desta rota. Gráfica, Arte e
      // Atendimento seguem recebendo 403.
      if (!["admin", "solicitacao"].includes(req.userRole ?? "")) {
        return res.status(403).json({ error: "Sem permissão para excluir peças" });
      }

      const item = await storage.getItem(req.params.id);
      if (!item) {
        return res.status(404).json({ error: "Item not found" });
      }

      // ── Alcance da exclusão: solicitação = admin (decisão do dono) ────────
      // Havia uma lista de status bloqueados só para a solicitação, e ela
      // começava em "awaiting_submission": na prática o papel dono da peça não
      // conseguia excluir nem o próprio rascunho recém-criado, e cada engano de
      // digitação virava chamado para o administrador.
      //
      // A liberação é segura porque a exclusão aqui é SOFT (grava deletedAt, a
      // peça sai das listagens e continua no banco) e RESTAURÁVEL pela rota de
      // restauração — nada é destruído, e o audit log abaixo registra quem
      // excluiu, o quê e de qual evento. O gate de PAPEL continua: quem não é
      // admin nem solicitação segue tomando 403 logo acima.
      //
      // O que NÃO é regra de papel e por isso continua valendo para todo mundo,
      // inclusive admin: a integridade do complemento, logo abaixo.

      // Mãe com complemento vivo não some. O `ON DELETE SET NULL` da FK só
      // dispara em DELETE físico — aqui a exclusão é SOFT (deletedAt), então o
      // banco não limpa nada e o filho ficaria órfão, apontando para uma peça
      // invisível: a linha da Gráfica diria "COMPLEMENTO DE #0062" com #0062
      // fora de todas as listagens. Cancelar o complemento primeiro é a ordem
      // correta e é reversível.
      const complementosVivos = await storage.getLiveComplements(req.params.id).catch(() => []);
      if (complementosVivos.length > 0) {
        return res.status(409).json({
          error: `Esta peça tem ${complementosVivos.length} complemento(s) ativo(s) (${complementosVivos.map(c => c.displayId).join(", ")}). Cancele o complemento antes de excluir.`,
          code: "HAS_COMPLEMENTS",
          complements: complementosVivos.map(c => ({ id: c.id, displayId: c.displayId })),
        });
      }

      const success = await storage.deleteItem(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Item not found" });
      }
      
      // Create audit log
      //
      // O nome do evento entra no texto porque a exclusão é SOFT: a peça sai de
      // /api/items e o Histórico perde a única forma de saber a que evento ela
      // pertencia — a linha mais sensível da auditoria era a única que
      // renderizava "Evento desconhecido", sem ID e sem link.
      const eventoDaPeca = await storage.getEvent(item.eventId).catch(() => undefined);
      await createAuditLog(
        req,
        'deleted',
        'item',
        req.params.id,
        `Item "${item.type}" (${item.displayId})${eventoDaPeca ? ` do evento "${eventoDaPeca.name}"` : ""} excluído por ${req.userRole}`
      );

      broadcast({ type: "item_deleted", itemId: req.params.id, eventId: item.eventId });

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // COMPLEMENTO — aumento de quantidade depois que a peça entrou em produção
  // ═══════════════════════════════════════════════════════════════════════════

  // Cria a peça-filha #0062-C1 com a DIFERENÇA pedida. A peça original não
  // recebe um único UPDATE — nenhum. É o ponto inteiro do modelo: um pórtico
  // entregue continua entregue, o KPI "Entregues" não cai retroativamente e o
  // fechamento com o patrocinador não é reescrito. O trabalho novo é uma linha
  // nova, porque no mundo físico foi exatamente isso: nova ordem de serviço,
  // nova impressão, novo setup.
  //
  // Gate INLINE (não requireRole) porque o predicado inclui "criador do evento
  // de qualquer papel" — mesmo estilo das outras rotas de escrita de peça. A
  // Gráfica NÃO cria complemento: ela produz o que pedem.
  app.post("/api/items/:id/complement", requireAuth, async (req, res) => {
    try {
      const body = z.object({
        quantity: z.number().int().min(1, "Informe ao menos 1 unidade").max(9999),
        reason: z.string().trim()
          .min(10, "Explique o motivo (mín. 10 caracteres)")
          .max(500, "Motivo muito longo (máx. 500 caracteres)"),
      }).parse(req.body);

      const parent = await storage.getItem(req.params.id);
      if (!parent || parent.deletedAt) {
        return res.status(404).json({ error: "Peça não encontrada" });
      }
      // Gate ESTRITO, decisão do dono: mudar quantidade de peça já produzida é
      // exclusivo de solicitacao e admin. NÃO usa canCreateItemsFor porque
      // aquele predicado inclui "criador do evento de qualquer papel" — regra
      // legítima para CRIAR peça, larga demais para mexer em contrato de peça
      // que já virou material físico.
      if (!podeMudarQuantidade(req)) {
        return res.status(403).json({ error: "Sem permissão para aumentar a quantidade neste evento" });
      }
      // Complemento de complemento vira #0062-C1-C1 e torna contractedTotal
      // recursivo. O segundo aumento se pede NA MÃE — vira #0062-C2.
      if (parent.parentItemId) {
        return res.status(409).json({
          error: `${parent.displayId} já é um complemento. Peça o aumento na peça original.`,
          code: "IS_COMPLEMENT",
          parentItemId: parent.parentItemId,
        });
      }
      if (!COMPLEMENT_ALLOWED_STATUSES.includes(parent.status)) {
        return res.status(409).json({
          error: `A peça ${parent.displayId} ainda não entrou em produção — edite a quantidade normalmente.`,
          code: "NOT_IN_PRODUCTION",
          status: parent.status,
        });
      }

      const event = await storage.getEvent(parent.eventId);
      if (!event) return res.status(404).json({ error: "Evento não encontrado" });
      // Complemento é peça NOVA na fila da Gráfica. Num evento encerrado ela
      // nasceria invisível — a fila não a mostraria e ninguém a produziria.
      const fechadoComplemento = motivoEventoFechado(event);
      if (fechadoComplemento) {
        return res.status(409).json({ error: erroEventoFechado(fechadoComplemento) });
      }

      // Dedupe de 60 s (duplo clique / retry de rede): devolve 200 com o
      // complemento que já existe, não erro. Duas linhas idênticas na fila da
      // Gráfica valem mais confusão do que um retry silencioso.
      const dup = await storage.findRecentComplement(parent.id, body.quantity, body.reason, 60);
      if (dup) {
        return res.status(200).set("X-Complement-Deduped", "1").json(dup);
      }

      // m² do filho SEMPRE derivado no servidor, nesta ordem:
      // 1) fórmula normal (quantidade × largura × altura do arquivo);
      // 2) rateio do m² da mãe (acervo antigo não tem dimensões de arquivo);
      // 3) "0.00" — a coluna é NOT NULL — com a ressalva no audit log.
      // Ganho não óbvio: o m² do EVENTO fica correto sozinho, porque as duas
      // linhas somam. Nenhuma agregação precisa saber o que é complemento.
      const derivado = deriveCalculatedM2({
        quantity: body.quantity, fileWidth: parent.fileWidth, fileHeight: parent.fileHeight,
      });
      const rateado = Number(parent.calculatedM2) > 0 && parent.quantity > 0
        ? ((Number(parent.calculatedM2) / parent.quantity) * body.quantity).toFixed(2)
        : null;
      const m2 = derivado ?? rateado ?? "0.00";
      const m2NaoDerivavel = derivado === undefined && rateado === null;

      const autor = resolveActor(req);
      const userName = autor.userName;
      const posSaida = !!event.truckDepartureDate && new Date(event.truckDepartureDate) < new Date();
      const marcaSaida = posSaida ? " [pós-saída do caminhão]" : "";
      const marcaM2 = m2NaoDerivavel ? " (m² não derivável)" : "";

      // Uma transação: peça-filha + os DOIS audit logs + a notificação. Se
      // qualquer passo falhar, nada fica meio criado — e o pior meio-caminho
      // possível aqui é um complemento na fila da Gráfica sem o motivo
      // registrado em lugar nenhum.
      //
      // A retentativa é da transação INTEIRA (não do INSERT): no Postgres, uma
      // transação que tomou erro está abortada e não aceita mais comandos. O
      // 23505 acontece quando duas pessoas pedem o aumento da mesma peça no
      // mesmo instante e ambas calculam o mesmo -C1; na segunda volta o MAX já
      // enxerga o -C1 e sai o -C2.
      const criar = () => db.transaction(async (tx) => {
        const child = await storage.createComplementItemTx(tx, parent, {
          quantity: body.quantity,
          calculatedM2: m2,
          status: "ready_for_production",
          complementReason: body.reason,
          complementRequestedBy: userName,
          complementRequestedAt: new Date(),
        });

        // LOG NA FILHA — a história do lote novo.
        await tx.insert(auditLogs).values({
          ...autor, action: "complement_created", entityType: "item", entityId: child.id,
          details: `Complemento de ${parent.displayId}: +${body.quantity} un. (${m2} m²)${marcaM2}. `
                 + `Peça original permanece ${translateStatus(parent.status)} com ${parent.quantity} un. `
                 + `Motivo: ${body.reason}${marcaSaida}`,
        });
        // LOG NA MÃE — OBRIGATÓRIO. A ficha da peça filtra o audit log por
        // entityId === item.id; sem esta linha, abrir #0062 não mostraria
        // absolutamente nada sobre o aumento, e é justamente em #0062 que quem
        // presta contas vai procurar.
        await tx.insert(auditLogs).values({
          ...autor, action: "complement_created", entityType: "item", entityId: parent.id,
          details: `Complemento ${child.displayId} criado: +${body.quantity} un. `
                 + `(contratado ${parent.quantity} → ${parent.quantity + body.quantity}). `
                 + `Motivo: ${body.reason}${marcaSaida}`,
        });

        const [notification] = await tx.insert(notifications).values({
          type: "complementCreated",
          message: `+${body.quantity} un. em ${parent.displayId} (${parent.type}) — ${event.name}. Motivo: ${body.reason}`,
          eventId: parent.eventId,
          itemId: child.id,
          targetRoles: ["grafica"],
        }).returning();

        return { child, notification };
      });

      let child: Item;
      let notification: any;
      try {
        ({ child, notification } = await criar());
      } catch (e: any) {
        if (!isDisplayIdConflictError(e)) throw e;
        ({ child, notification } = await criar());
      }

      // ── Pós-commit ────────────────────────────────────────────────────────
      // Patrocinadores e aprovações são copiados FORA da transação de
      // propósito: são dados de apresentação e uma falha aqui não pode
      // desfazer o complemento (que é o trabalho de verdade). Se falhar, a
      // peça existe e os chips podem ser recolocados pela tela de vinculação.
      try {
        const sponsorIds = (await storage.getItemSponsors(parent.id)).map(s => s.sponsorId);
        if (sponsorIds.length) await storage.bulkSyncItemSponsors(child.id, sponsorIds);
        // Copia PRESERVANDO status/aprovador/data. Nunca
        // initializeItemSponsorApprovals: ela criaria linhas 'pending' que
        // viram cobrança falsa na Gestão de Prazos, numa peça que já está
        // aprovada e liberada.
        await storage.copyItemSponsorApprovals(parent.id, child.id);
      } catch (e: any) {
        console.error("[COMPLEMENTOS] falha ao copiar patrocinadores/aprovações:", e?.message ?? e);
      }

      // SÓ updateEventStatus. O POST /api/items normal, quando o evento está
      // "completed", RESETA a prioridade do evento e notifica o admin — aqui
      // isso apagaria a prioridade de um evento em andamento por causa de 4
      // unidades. O evento voltar de "concluído" para "criado" é correto (há
      // trabalho pendente); perder a prioridade não é.
      await updateEventStatus(parent.eventId);

      // Broadcast semântico (para quem quiser tratar o caso especificamente)…
      broadcast({
        type: "item_complement_created", item: child, parentId: parent.id,
        parentDisplayId: parent.displayId, eventId: parent.eventId, quantity: body.quantity,
      });
      // …e um tipo JÁ TRATADO no client. Sem este segundo broadcast a Gráfica
      // fica CEGA até um F5: '/api/items/approved' (a fila dela) roda com
      // staleTime: Infinity e refetchOnWindowFocus: false, e nenhum tipo
      // genérico a invalida — só 'item_approved' e 'production_*'.
      // "item_approved" é semanticamente honesto aqui: o complemento nasce
      // liberado para produção. Pode ser removido no dia em que
      // use-websocket.ts ganhar o case de 'item_complement_created'.
      broadcast({ type: "item_approved", item: child });
      broadcast({ type: "notification_created", notification });

      res.status(201).json(child);
    } catch (error: any) {
      if (error?.code === "42703") {
        return res.status(503).json({
          error: "Migração pendente: peça ao administrador rodar npm run db:push.",
          code: "MIGRATION_PENDING",
        });
      }
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors?.[0]?.message ?? "Dados inválidos" });
      }
      console.error("[COMPLEMENTOS] falha ao criar complemento:", error);
      res.status(error?.httpStatus ?? 500).json({ error: error?.message ?? "Não foi possível criar o complemento" });
    }
  });

  // Cancela um complemento criado por engano — a janela de arrependimento.
  // Sem esta rota, um complemento errado vira lixo PERMANENTE na fila da
  // Gráfica: o DELETE genérico bloqueia 'ready_for_production' para o perfil
  // Solicitação (LOCKED_STATUSES), e só o admin conseguiria remover.
  //
  // A Gráfica pode cancelar de propósito: quem percebe o engano é quem está
  // com a peça na mão, e obrigá-la a caçar o solicitante para desfazer algo
  // que ainda não foi impresso é como se perde a confiança na ferramenta.
  //
  // SEM a guarda de evento finalizado (é ARRUMAR A CASA). Cancelar complemento
  // é DESFAZER um aumento, nunca avançar: a rota já exige que nenhuma unidade
  // tenha sido produzida, reaproveitada, conferida ou entregue. Barrar aqui
  // transformaria um complemento criado por engano em item PERMANENTE da fila
  // da Gráfica — um convite a imprimir, que é justamente o que esta guarda
  // existe para evitar.
  app.delete("/api/items/:id/complement", requireAuth, async (req, res) => {
    try {
      const item = await storage.getItem(req.params.id);
      if (!item || item.deletedAt) {
        return res.status(404).json({ error: "Complemento não encontrado" });
      }
      if (!item.parentItemId) {
        return res.status(409).json({
          error: `${item.displayId} não é um complemento. Use a exclusão normal de peças.`,
          code: "NOT_A_COMPLEMENT",
        });
      }

      // Mesmo gate estrito da criação (decisão do dono): cancelar um
      // complemento é desfazer um aumento de quantidade. A spec original dava
      // este escape à Gráfica — quem vê o "40 pórticos" absurdo primeiro — mas
      // a regra passou a ser "só solicitacao e admin mexem na quantidade".
      // Reverter é trocar esta linha por `|| req.userRole === "grafica"`.
      if (!podeMudarQuantidade(req)) {
        return res.status(403).json({ error: "Sem permissão para cancelar este complemento" });
      }

      // Nada tocado = nada perdido. Uma única unidade produzida, reaproveitada,
      // conferida ou entregue já é material físico no galpão; cancelar deixaria
      // ativos de inventário órfãos apontando para uma peça invisível.
      const produzidas = item.quantityProduced ?? 0;
      const reaproveitadas = item.reuseQty ?? 0;
      const conferidas = item.conferredQty ?? 0;
      const entregues = item.deliveredQty ?? 0;
      if (produzidas > 0 || reaproveitadas > 0 || conferidas > 0 || entregues > 0) {
        const detalhe = [
          produzidas > 0 ? `${produzidas} produzida(s)` : null,
          reaproveitadas > 0 ? `${reaproveitadas} reaproveitada(s)` : null,
          conferidas > 0 ? `${conferidas} conferida(s)` : null,
          entregues > 0 ? `${entregues} entregue(s)` : null,
        ].filter(Boolean).join(", ");
        return res.status(409).json({
          error: `Não é possível cancelar ${item.displayId}: já há ${detalhe}.`,
          code: "COMPLEMENT_TOUCHED",
          produced: produzidas, reused: reaproveitadas, conferred: conferidas, delivered: entregues,
        });
      }

      const parent = await storage.getItem(item.parentItemId);
      const event = await storage.getEvent(item.eventId);
      const autor = resolveActor(req);
      const userName = autor.userName;
      const parentLabel = parent?.displayId ?? "peça original";

      const { notification } = await db.transaction(async (tx) => {
        // Soft delete, igual a toda exclusão do sistema: o complemento some das
        // listagens e continua no histórico. O número -C1 NÃO é reciclado — o
        // próximo aumento vira -C2, e quem ler o log entende a sequência.
        const [removido] = await tx
          .update(itemsTable)
          .set({ deletedAt: new Date(), updatedAt: new Date() })
          .where(eq(itemsTable.id, item.id))
          .returning();
        if (!removido) throw Object.assign(new Error("Complemento não encontrado"), { httpStatus: 404 });

        await tx.insert(auditLogs).values({
          ...autor, action: "complement_canceled", entityType: "item", entityId: item.id,
          details: `Complemento ${item.displayId} cancelado (nenhuma unidade produzida). `
                 + `Contratado volta a ${parent?.quantity ?? "—"} un.`,
        });
        // Também na mãe: é lá que se pergunta "afinal, aumentou ou não?".
        if (parent) {
          await tx.insert(auditLogs).values({
            ...autor, action: "complement_canceled", entityType: "item", entityId: parent.id,
            details: `Complemento ${item.displayId} cancelado (+${item.quantity} un. desfeitas, nada produzido). `
                   + `Contratado volta a ${parent.quantity} un.`,
          });
        }

        const [notif] = await tx.insert(notifications).values({
          type: "complementCanceled",
          message: `Complemento ${item.displayId} cancelado — não produzir.${event ? ` (${event.name})` : ""}`,
          eventId: item.eventId,
          itemId: parent?.id ?? null,
          targetRoles: ["grafica"],
        }).returning();

        return { notification: notif };
      });

      await updateEventStatus(item.eventId);

      broadcast({
        type: "item_complement_canceled", itemId: item.id, displayId: item.displayId,
        parentId: item.parentItemId, eventId: item.eventId,
      });
      // Tipos já tratados no client (ver comentário gêmeo na rota de criação):
      // 'item_deleted' tira a linha das listagens gerais e da lixeira;
      // 'production_updated' é o único que invalida '/api/items/approved',
      // a fila da Gráfica — sem ele o complemento cancelado ficaria na tela
      // dela, convidando a imprimir algo que foi desfeito.
      broadcast({ type: "item_deleted", itemId: item.id, eventId: item.eventId });
      broadcast({ type: "production_updated", item: { ...item, deletedAt: new Date() } });
      broadcast({ type: "notification_created", notification });

      res.json({ success: true, itemId: item.id, displayId: item.displayId, parentDisplayId: parentLabel });
    } catch (error: any) {
      if (error?.code === "42703") {
        return res.status(503).json({
          error: "Migração pendente: peça ao administrador rodar npm run db:push.",
          code: "MIGRATION_PENDING",
        });
      }
      console.error("[COMPLEMENTOS] falha ao cancelar complemento:", error);
      res.status(error?.httpStatus ?? 500).json({ error: error?.message ?? "Não foi possível cancelar o complemento" });
    }
  });

  // Submit item for sponsor approval (Arte module)
  app.patch("/api/items/:id/submit-for-approval", requireAuth, async (req, res) => {
    try {
      // Validate role
      if (req.userRole !== "arte" && req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas usuários com perfil Arte podem enviar para aprovação" });
      }
      
      const { approvalThumbUrl } = req.body;
      
      // Validate current status
      const currentItem = await storage.getItem(req.params.id);
      if (!currentItem) {
        return res.status(404).json({ error: "Item not found" });
      }
      
      // ANDA: empurra a peça para a fila do Atendimento (ou da Revisão).
      if (await barraEventoFinalizado(currentItem, res)) return;

      // Only items that passed through vincular-patrocinadores (awaiting_submission) can be worked on
      if (currentItem.status !== "awaiting_submission") {
        return res.status(409).json({ 
          error: `Item não pode ser enviado para aprovação. Status atual: ${currentItem.status}. O item precisa passar pelo fluxo de Vincular Patrocinadores antes.`
        });
      }
      
      if (!approvalThumbUrl) {
        return res.status(400).json({ error: "approvalThumbUrl is required" });
      }
      
      // Check if item has sponsors linked
      const itemSponsors = await storage.getItemSponsors(req.params.id);
      const hasSponsors = itemSponsors.length > 0;
      
      // Determine next status:
      // 1. If skipApproval is true → awaiting_creator_review
      // 2. If has sponsors → awaiting_sponsor_approval
      // 3. If no sponsors → awaiting_creator_review (skip sponsor approval)
      const shouldSkipApproval = currentItem.skipApproval === true || !hasSponsors;
      const nextStatus = shouldSkipApproval ? "awaiting_creator_review" : "awaiting_sponsor_approval";
      
      // If resubmitting after rejection (awaiting_submission) and going to sponsor approval,
      // reset all sponsor approval records back to 'pending' so Atendimento can re-review
      if (currentItem.status === "awaiting_submission" && nextStatus === "awaiting_sponsor_approval") {
        const existingApprovals = await storage.getItemSponsorApprovals(req.params.id);
        for (const approval of existingApprovals) {
          // Reset any non-approved status back to pending — e o desaprovador
          // aprovado também: o item inteiro está voltando com versão nova.
          const estritoAprovado = approval.status === 'approved' && !!(await storage.getSponsor(approval.sponsorId))?.strictApproval;
          if (['awaiting_arte', 'new_version_pending', 'rejected'].includes(approval.status) || estritoAprovado) {
            await storage.updateItemSponsorApproval(approval.id, {
              status: 'pending',
              approvedBy: null,
              approvedAt: null,
              rejectedBy: null,
              rejectedAt: null,
              rejectionReason: null,
            });
          }
        }
      }

      const itemUpdates: any = { 
        status: nextStatus,
        // Limpa flag de reprovação pelo criador quando item é reenviado
        // rejectedBySponsor permanece até ser aprovado pelo patrocinador novamente
        rejectedByCreator: false,
      };
      if (approvalThumbUrl) {
        itemUpdates.approvalThumbUrl = approvalThumbUrl;
      }
      
      const item = await storage.updateItem(req.params.id, itemUpdates);
      
      if (!item) {
        return res.status(404).json({ error: "Item not found" });
      }
      // A versão da arte que foi para aprovação — uma linha por envio. É o
      // que deixa a tela de Versões dizer QUAL thumb cada patrocinador viu.
      if (approvalThumbUrl) {
        await storage.createItemArtVersion({ itemId: item.id, thumbUrl: approvalThumbUrl, origem: "envio", createdBy: req.userName ?? null });
        invalidarCacheDeVersoes();
      }
      
      const event = await storage.getEvent(item.eventId);
      
      if (shouldSkipApproval) {
        // Pula aprovação do patrocinador e vai direto para revisão da Solicitação
        await createAuditLog(
          req,
          'updated',
          'item',
          item.id,
          `Enviado para Arte — Status alterado: ${translateStatus(currentItem.status)} → ${translateStatus(nextStatus)} (sem aprovação de patrocinador)`
        );
        
        // Notifica Solicitação para revisar
        const notification = await storage.createNotification({
          type: "itemAdded",
          message: `Novo item aguardando revisão da Solicitação: ${item.type} - Evento: ${event?.name}`,
          eventId: item.eventId,
          itemId: item.id,
          targetRoles: ["solicitacao"],
        });
        
        broadcast({ type: "item_updated", item });
        broadcast({ type: "notification_created", notification });
      } else {
        // Fluxo padrão: vai para aprovação do patrocinador
        
        // Inicializar registros de aprovação para cada patrocinador
        await storage.initializeItemSponsorApprovals(
          req.params.id, 
          itemSponsors.map(s => s.sponsorId)
        );
        
        await createAuditLog(
          req,
          'updated',
          'item',
          item.id,
          `Enviado para Arte — Status alterado: ${translateStatus(currentItem.status)} → ${translateStatus(nextStatus)}`
        );
        
        // Notifica Atendimento para aprovar com patrocinador
        const notification = await storage.createNotification({
          type: "itemAdded",
          message: `Novo item aguardando aprovação do patrocinador: ${item.type} - Evento: ${event?.name}`,
          eventId: item.eventId,
          itemId: item.id,
          targetRoles: ["atendimento"],
        });
        
        broadcast({ type: "item_updated", item });
        broadcast({ type: "notification_created", notification });
      }
      
      res.json(item);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Sponsor approves item (Atendimento module)
  app.patch("/api/items/:id/sponsor-approve", requireAuth, async (req, res) => {
    try {
      // Validate role
      if (req.userRole !== "atendimento" && req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas usuários com perfil Atendimento podem aprovar pelo patrocinador" });
      }
      
      // Validate current status
      const currentItem = await storage.getItem(req.params.id);
      if (!currentItem) {
        return res.status(404).json({ error: "Item not found" });
      }
      
      // ANDA — e é LITERALMENTE o caso que o dono viu em produção ("encerrar
      // eventos e conseguirem aprovar ainda"). A tela do Atendimento já esconde
      // a peça; a ficha do Painel Geral, não.
      if (await barraEventoFinalizado(currentItem, res)) return;

      if (currentItem.status !== "awaiting_sponsor_approval") {
        return res.status(409).json({
          error: `Item não pode ser aprovado pelo patrocinador. Status atual: ${currentItem.status}, esperado: awaiting_sponsor_approval`
        });
      }

      const item = await storage.updateItem(req.params.id, {
        status: "sponsor_approved",
        sponsorApprovedBy: req.userName,
        sponsorApprovedAt: new Date(),
        // Limpa flag de reprovação pelo patrocinador quando aprovado
        rejectedBySponsor: false,
      });

      if (!item) {
        return res.status(404).json({ error: "Item not found" });
      }

      // O ATALHO APROVA A PEÇA INTEIRA — então as LINHAS acompanham (24/08,
      // caso #4176). Este caminho mudava só o STATUS: o patrocinador ficava
      // "Aguardando" numa peça já em Finalização, o modal mostrava "0 de 1
      // aprovaram" numa peça aprovada, e a revogação seguinte respondia "já
      // está pendente" — a peça ficava presa fora da fila do Atendimento,
      // sem nenhum botão que a trouxesse de volta.
      const linhasDaPeca = await storage.getItemSponsorApprovals(req.params.id);
      for (const linha of linhasDaPeca) {
        if (linha.status === "approved") continue;
        await storage.updateItemSponsorApproval(linha.id, {
          status: "approved",
          approvedBy: req.userName ?? "Atendimento",
          approvedAt: new Date(),
          rejectedBy: null,
          rejectedAt: null,
          rejectionReason: null,
        });
      }
      invalidarCacheDeVersoes();
      
      const event = await storage.getEvent(item.eventId);
      
      await createAuditLog(
        req,
        'approved',
        'item',
        item.id,
        `Status alterado: ${translateStatus(currentItem.status)} → ${translateStatus("sponsor_approved")} (aprovado pelo patrocinador)`
      );
      
      // Notifica Arte para finalizar o layout e adicionar arquivo final
      const notification = await storage.createNotification({
        type: "arteApproved",
        message: `Patrocinador aprovou o item. Finalize o layout e adicione o arquivo final: ${item.type} - Evento: ${event?.name}`,
        eventId: item.eventId,
        itemId: item.id,
        targetRoles: ["arte"],
      });
      
      broadcast({ type: "item_updated", item });
      broadcast({ type: "notification_created", notification });
      
      res.json(item);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Arte dispenses item (bypasses remaining approval steps → ready_for_production)
  app.patch("/api/items/:id/dispense", requireAuth, async (req, res) => {
    try {
      if (req.userRole !== "arte" && req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas usuários com perfil Arte podem dispensar itens" });
      }
      const currentItem = await storage.getItem(req.params.id);
      if (!currentItem) return res.status(404).json({ error: "Item not found" });
      // ANDA: a dispensa PULA a aprovação e joga a peça direto na fila da
      // Gráfica — o gesto que mais rápido vira lona impressa.
      if (await barraEventoFinalizado(currentItem, res)) return;
      const dispensableStatuses = ["awaiting_submission", "awaiting_sponsor_approval", "sponsor_approved", "awaiting_creator_review"];
      if (!dispensableStatuses.includes(currentItem.status)) {
        return res.status(409).json({ error: `Item não pode ser dispensado no status atual: ${currentItem.status}` });
      }
      const { reason } = req.body;
      await storage.updateItem(req.params.id, { status: "ready_for_production" });
      await createAuditLog(
        req,
        "dispensed",
        "item",
        req.params.id,
        `Peça dispensada pela Arte. Status anterior: ${currentItem.status}${reason ? `. Motivo: ${reason}` : ''}`
      );

      // A dispensa PULA a aprovação e joga a peça direto na fila da Gráfica —
      // era a única transição do fluxo que fazia isso em silêncio: nenhum
      // broadcast, nenhuma notificação e um `{success:true}` que não deixava o
      // cliente atualizar nada. A peça aparecia na Gráfica só no próximo F5, e
      // ninguém do chão de fábrica sabia que ela tinha entrado.
      // Espelha o que /submit-for-approval faz logo acima.
      const item = await storage.getItem(req.params.id);
      if (!item) return res.status(404).json({ error: "Item not found" });
      const event = await storage.getEvent(item.eventId);

      const notification = await storage.createNotification({
        type: "itemAdded",
        message: `Peça liberada sem aprovação: ${item.type}${event ? ` — ${event.name}` : ""}`,
        eventId: item.eventId,
        itemId: item.id,
        targetRoles: ["grafica"],
      });

      broadcast({ type: "item_updated", item });
      broadcast({ type: "notification_created", notification });

      // Devolve O ITEM (não `{success:true}`): é o contrato das rotas irmãs, e
      // é o que permite ao cliente ler o novo status sem outro round-trip.
      res.json(item);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // A rota PATCH /api/items/:id/sponsor-reject FOI REMOVIDA (decisao do dono,
  // 17/08). Ela reprovava a peca INTEIRA e a mandava para awaiting_submission,
  // enquanto a reprovacao POR PATROCINADOR (logo abaixo) deixa a peca em
  // awaiting_sponsor_approval com a linha do patrocinador em awaiting_arte —
  // que e o par que alimenta a aba Correcao da Arte. Duas portas para o MESMO
  // fato, com destinos diferentes: a peca reprovada caia no meio de 1.120
  // pecas que nunca foram enviadas e a Arte perdia a diferenca entre
  // retrabalho e trabalho novo. Ficou uma porta so.

  // ========== Individual Sponsor Approval Endpoints ==========

  // Get sponsor approvals for an item
  app.get("/api/items/:id/sponsor-approvals", requireAuth, async (req, res) => {
    try {
      const approvals = await storage.getItemSponsorApprovals(req.params.id);
      
      // Enrich with sponsor names
      const sponsors = await storage.getAllSponsors();
      const sponsorMap = new Map(sponsors.map(s => [s.id, s]));
      
      const enrichedApprovals = approvals.map(approval => ({
        ...approval,
        sponsor: sponsorMap.get(approval.sponsorId) || null
      }));
      
      res.json(enrichedApprovals);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Individual sponsor approves item
  app.post("/api/items/:id/sponsor-approvals/:sponsorId/approve", requireAuth, async (req, res) => {
    try {
      // Validate role
      if (req.userRole !== "atendimento" && req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas usuários com perfil Atendimento podem aprovar pelo patrocinador" });
      }
      
      const { id: itemId, sponsorId } = req.params;
      
      // Validate item exists and status
      const currentItem = await storage.getItem(itemId);
      if (!currentItem) {
        return res.status(404).json({ error: "Item não encontrado" });
      }
      
      // ANDA: aprovação por patrocinador — o mesmo buraco do /sponsor-approve,
      // por outra porta (é esta que a tela de Atendimento usa hoje).
      if (await barraEventoFinalizado(currentItem, res)) return;

      if (currentItem.status !== "awaiting_sponsor_approval") {
        return res.status(409).json({
          error: `Item não está aguardando aprovação do patrocinador. Status atual: ${currentItem.status}`
        });
      }

      // Validate sponsor is linked to item
      const itemSponsors = await storage.getItemSponsors(itemId);
      if (!itemSponsors.find(s => s.sponsorId === sponsorId)) {
        return res.status(404).json({ error: "Patrocinador não está vinculado a este item" });
      }

      // Get or create approval record
      let approval = await storage.getItemSponsorApproval(itemId, sponsorId);

      // Prevent approving a sponsor that is waiting for Arte to resubmit
      if (approval && approval.status === 'awaiting_arte') {
        return res.status(409).json({ error: "Aguardando nova versão da Arte para este patrocinador. Não é possível aprovar agora." });
      }
      
      if (approval) {
        // Update existing approval — com O QUE foi aprovado (o thumb de agora).
        approval = await storage.updateItemSponsorApproval(approval.id, {
          status: 'approved',
          approvedBy: req.userName,
          approvedAt: new Date(),
          rejectedBy: null,
          rejectedAt: null,
          rejectionReason: null,
          decidedThumbUrl: currentItem.approvalThumbUrl ?? null,
        });
      } else {
        // Create new approval
        approval = await storage.createItemSponsorApproval({
          itemId,
          sponsorId,
          decidedThumbUrl: currentItem.approvalThumbUrl ?? null,
          status: 'approved',
          approvedBy: req.userName,
          approvedAt: new Date(),
        });
      }
      
      // Get sponsor name for audit log
      const sponsor = await storage.getSponsor(sponsorId);
      
      await createAuditLog(
        req,
        'approved',
        'item',
        itemId,
        `Patrocinador "${sponsor?.name || sponsorId}" aprovou o item`
      );
      
      // Check if ALL sponsors have approved
      const allApprovals = await storage.getItemSponsorApprovals(itemId);
      invalidarCacheDeVersoes();
      const allApproved = itemSponsors.every(is => {
        const sponsorApproval = allApprovals.find(a => a.sponsorId === is.sponsorId);
        return sponsorApproval && sponsorApproval.status === 'approved';
      });
      
      if (allApproved) {
        // All sponsors approved - advance item status
        const item = await storage.updateItem(itemId, {
          status: "sponsor_approved",
          sponsorApprovedBy: req.userName,
          sponsorApprovedAt: new Date(),
          rejectedBySponsor: false,
        });
        
        const event = await storage.getEvent(currentItem.eventId);
        
        await createAuditLog(
          req,
          'approved',
          'item',
          itemId,
          `Todos os patrocinadores aprovaram. Status alterado: ${translateStatus(currentItem.status)} → ${translateStatus("sponsor_approved")}`
        );
        
        // Notify Arte to add final file
        const notification = await storage.createNotification({
          type: "arteApproved",
          message: `Todos os patrocinadores aprovaram. Finalize o layout e adicione o arquivo final: ${currentItem.type} - Evento: ${event?.name}`,
          eventId: currentItem.eventId,
          itemId: itemId,
          targetRoles: ["arte"],
        });
        
        broadcast({ type: "item_updated", item });
        broadcast({ type: "notification_created", notification });
        
        res.json({ approval, item, allApproved: true });
      } else {
        // Not all sponsors approved yet
        broadcast({ type: "sponsor_approval_updated", itemId, approval });
        res.json({ approval, allApproved: false });
      }
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Individual sponsor rejects item
  app.post("/api/items/:id/sponsor-approvals/:sponsorId/reject", requireAuth, async (req, res) => {
    try {
      // Validate role
      if (req.userRole !== "atendimento" && req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas usuários com perfil Atendimento podem reprovar pelo patrocinador" });
      }
      
      const { id: itemId, sponsorId } = req.params;
      // Era `rejectionReason || null`: o Atendimento podia reprovar em nome do
      // patrocinador sem dizer nada, e a Arte recebia a peça de volta sem
      // instrução. Agora vale a mesma régua das outras portas.
      const motivo = lerMotivoDevolucao(req);
      if (!motivo.ok) return res.status(400).json({ error: motivo.erro });
      const destino = lerDestinoDevolucao(req);
      const rejectionReason = motivo.motivo;
      
      // Validate item exists and status
      const currentItem = await storage.getItem(itemId);
      if (!currentItem) {
        return res.status(404).json({ error: "Item não encontrado" });
      }
      
      // ANDA: reprovar por patrocinador manda a Arte fazer uma versão nova.
      if (await barraEventoFinalizado(currentItem, res)) return;

      if (currentItem.status !== "awaiting_sponsor_approval") {
        return res.status(409).json({
          error: `Item não está aguardando aprovação do patrocinador. Status atual: ${currentItem.status}`
        });
      }

      // Validate sponsor is linked to item
      const itemSponsors = await storage.getItemSponsors(itemId);
      if (!itemSponsors.find(s => s.sponsorId === sponsorId)) {
        return res.status(404).json({ error: "Patrocinador não está vinculado a este item" });
      }

      // Get or create approval record
      let approval = await storage.getItemSponsorApproval(itemId, sponsorId);

      if (approval) {
        // Update existing approval
        approval = await storage.updateItemSponsorApproval(approval.id, {
          decidedThumbUrl: currentItem.approvalThumbUrl ?? null,
          status: 'awaiting_arte',
          rejectedBy: req.userName,
          rejectedAt: new Date(),
          rejectionReason: rejectionReason || null,
          approvedBy: null,
          approvedAt: null,
        });
      } else {
        // Create new approval
        approval = await storage.createItemSponsorApproval({
          decidedThumbUrl: currentItem.approvalThumbUrl ?? null,
          itemId,
          sponsorId,
          status: 'awaiting_arte',
          rejectedBy: req.userName,
          rejectedAt: new Date(),
          rejectionReason: rejectionReason || null,
        });
      }
      
      // Get sponsor name for audit log and notification
      const sponsor = await storage.getSponsor(sponsorId);
      const event = await storage.getEvent(currentItem.eventId);
      invalidarCacheDeVersoes();
      // Quem desaprova junto perde a aprovação agora — a peça vai ser refeita.
      await revogarAprovacoesEstritas(req, currentItem, { tipo: "reprovacao", sponsorId, nome: sponsor?.name ?? sponsorId });
      
      // Item stays in awaiting_sponsor_approval — only leaves when ALL sponsors approve
      const item = (await storage.updateItem(itemId, {
        rejectedBySponsor: true,
      }))!;
      
      await createAuditLog(
        req,
        'rejected',
        'item',
        itemId,
        `Patrocinador "${sponsor?.name || sponsorId}" reprovou o item. Item aguarda nova versão da Arte${rejectionReason ? `. Motivo: ${rejectionReason}` : ''}`
      );
      
      // Notify Arte to prepare a new version for this sponsor
      const notification = await storage.createNotification({
        type: "itemRejected",
        message: `Patrocinador "${sponsor?.name}" reprovou. Envie nova arte para: ${currentItem.type} - Evento: ${event?.name}`,
        eventId: currentItem.eventId,
        itemId: itemId,
        targetRoles: ["arte"],
      });
      
      broadcast({ type: "notification_created", notification });
      
      res.json({ 
        approval, 
        item, 
        message: `Reprovação registrada. Item aguarda nova arte para o patrocinador.`
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // REVOGAR uma aprovação (ou reverter uma reprovação) de UM patrocinador,
  // de volta a "pending". Reabre o item para aprovação se ele já havia
  // avançado por essa aprovação.
  //
  // Nasceu como correção de admin ("aprovou o patrocinador errado"). Pedido
  // do dono (21/08/2026): o ATENDIMENTO também revoga — enquanto a peça está
  // em aprovação ou na finalização da Arte (sponsor_approved). Depois disso
  // (arquivo final, produção) continua sendo coisa de admin: revogar uma
  // aprovação com a peça já na gráfica é desfazer trabalho, não decisão.
  const STATUS_REVOGAVEL = ["awaiting_sponsor_approval", "sponsor_approved"];
  app.post("/api/items/:id/sponsor-approvals/:sponsorId/revert", requireAuth, async (req, res) => {
    try {
      if (req.userRole !== "admin" && req.userRole !== "atendimento") {
        return res.status(403).json({ error: "Apenas Atendimento e administradores podem revogar uma aprovação" });
      }

      const { id: itemId, sponsorId } = req.params;

      const currentItem = await storage.getItem(itemId);
      if (!currentItem) {
        return res.status(404).json({ error: "Item não encontrado" });
      }

      // ANDA (e aqui foi uma DECISÃO, não um automatismo): "reverter" soa como
      // arrumar a casa, mas o efeito é REABRIR a rodada — devolve o item de
      // "sponsor_approved" para "awaiting_sponsor_approval", ou seja, recria
      // uma pendência de aprovação numa fila que não mostra mais essa peça.
      // Num evento vivo é correção; num evento morto é trabalho fantasma.
      // Vale a regra do dono para os casos duvidosos: barra — o admin que
      // precisar mesmo corrigir reabre o evento, que é barato.
      if (await barraEventoFinalizado(currentItem, res)) return;

      if (req.userRole !== "admin" && !STATUS_REVOGAVEL.includes(currentItem.status)) {
        return res.status(409).json({
          error: `Só dá para revogar enquanto a peça está em aprovação ou na finalização da Arte. Status atual: ${translateStatus(currentItem.status)}`,
        });
      }
      const motivo = typeof req.body?.motivo === "string" ? req.body.motivo.trim().slice(0, 500) : "";

      const approval = await storage.getItemSponsorApproval(itemId, sponsorId);
      if (!approval) {
        return res.status(404).json({ error: "Aprovação não encontrada para este patrocinador" });
      }
      // TODA a família pós-aprovação, não só sponsor_approved: a peça
      // incoerente ANDA (arquivo final → revisão → devolvida) sem fechar a
      // rodada por baixo — o caso #4176 estava em Finalização de novo quando
      // o dono tentou revogar pela segunda vez.
      const POS_APROVACAO = ["sponsor_approved", "awaiting_finalization", "awaiting_final_review", "awaiting_review", "in_review"];
      // Linha já pendente COM a peça já avançada é o estado incoerente que o
      // atalho de aprovação deixava antes de 24/08 (caso #4176): não há o que
      // revogar NA LINHA, mas há o que REABRIR — e é para isso que quem
      // clicou veio aqui. Pendente com a peça ainda em aprovação continua 409:
      // aí não há mesmo nada a fazer.
      const reabrirIncoerente = approval.status === "pending" && POS_APROVACAO.includes(currentItem.status);
      if (approval.status === "pending" && !reabrirIncoerente) {
        return res.status(409).json({ error: "Esta aprovação já está pendente" });
      }

      const previousStatus = approval.status;
      const updatedApproval = reabrirIncoerente ? approval : await storage.updateItemSponsorApproval(approval.id, {
        status: "pending",
        approvedBy: null,
        approvedAt: null,
        rejectedBy: null,
        rejectedAt: null,
        rejectionReason: null,
      });

      invalidarCacheDeVersoes();
      // Se o item já havia avançado por conta desta aprovação (todos aprovados),
      // reabre para aprovação do patrocinador — senão o item ficaria "aprovado"
      // com um patrocinador pendente por baixo. A REGRA DO DONO (24/08): linha
      // "Aguardando" ⇒ a peça volta pendente no Atendimento — de qualquer
      // status pós-aprovação, não só do primeiro degrau. O arquivo final que a
      // Arte já subiu FICA: revogar reabre a decisão, não apaga trabalho.
      let item = currentItem;
      if (POS_APROVACAO.includes(currentItem.status)) {
        item = (await storage.updateItem(itemId, {
          status: "awaiting_sponsor_approval",
          sponsorApprovedBy: null,
          sponsorApprovedAt: null,
          rejectedBySponsor: false,
        }))!;
      }

      const sponsor = await storage.getSponsor(sponsorId);

      await createAuditLog(
        req,
        'updated',
        'item',
        itemId,
        reabrirIncoerente
          ? `${req.userRole === "admin" ? "Administrador" : "Atendimento"} reabriu a aprovação de "${sponsor?.name || sponsorId}" — a linha já estava pendente com a peça avançada (estado herdado do atalho de aprovação)${motivo ? `. Motivo: ${motivo}` : ''}. Item reaberto: ${translateStatus(currentItem.status)} → ${translateStatus(item.status)}`
          : `${req.userRole === "admin" ? "Administrador" : "Atendimento"} revogou a ${previousStatus === "approved" ? "aprovação" : "decisão"} de "${sponsor?.name || sponsorId}" — volta a pendente (estava: ${previousStatus})${motivo ? `. Motivo: ${motivo}` : ''}${item.status !== currentItem.status ? `. Item reaberto: ${translateStatus(currentItem.status)} → ${translateStatus(item.status)}` : ''}`
      );

      broadcast({ type: "sponsor_approval_updated", itemId, approval: updatedApproval });
      if (item.status !== currentItem.status) {
        // A Arte estava finalizando uma peça "aprovada por todos": precisa
        // saber que a aprovação caiu antes de mandar o arquivo final.
        const event = await storage.getEvent(currentItem.eventId);
        const notification = await storage.createNotification({
          type: "itemRejected",
          message: `Aprovação de "${sponsor?.name || sponsorId}" revogada — segure a finalização: ${currentItem.type} - Evento: ${event?.name}`,
          eventId: currentItem.eventId,
          itemId,
          targetRoles: ["arte"],
        });
        broadcast({ type: "notification_created", notification });
        broadcast({ type: "item_updated", item });
      }

      res.json({ approval: updatedApproval, item });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Arte submits new version for specific sponsors (correção)
  app.post("/api/items/:id/sponsor-approvals/resubmit", requireAuth, async (req, res) => {
    try {
      if (req.userRole !== "arte" && req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas usuários com perfil Arte podem enviar nova versão" });
      }

      const { id: itemId } = req.params;
      const { newThumbUrl, sponsorIds: pedidos } = req.body as { newThumbUrl: string; sponsorIds?: string[] };

      if (!newThumbUrl) {
        return res.status(400).json({ error: "newThumbUrl é obrigatório" });
      }

      const currentItem = await storage.getItem(itemId);
      if (!currentItem) {
        return res.status(404).json({ error: "Item não encontrado" });
      }
      // ANDA: nova versão de arte volta a cobrar revisão do Atendimento.
      if (await barraEventoFinalizado(currentItem, res)) return;

      if (currentItem.status !== "awaiting_sponsor_approval") {
        return res.status(409).json({ error: "Item não está aguardando aprovação do patrocinador" });
      }

      // O REENVIO É DERIVADO, NÃO ESCOLHIDO (regra do dono): vai para quem
      // ainda não aprovou — quem reprovou e quem está aguardando. Quem já
      // aprovou mantém a aprovação e não recebe de novo. O cliente não
      // manda mais seleção; se mandar (API antiga, script), só passa se for
      // exatamente o conjunto derivado — o cliente derivar e o servidor
      // aceitar qualquer subconjunto deixava a porta aberta para publicar a
      // arte corrigida sem que a marca que a recusou voltasse a ver.
      const aprovacoes = await storage.getItemSponsorApprovals(itemId);
      const sponsorIds = aprovacoes.filter((a) => a.status !== "approved").map((a) => a.sponsorId);
      if (sponsorIds.length === 0) {
        return res.status(409).json({ error: "Nenhum patrocinador pendente para receber o reenvio — todos já aprovaram." });
      }
      if (Array.isArray(pedidos) && pedidos.length > 0) {
        const a = new Set(pedidos), b = new Set(sponsorIds);
        const igual = a.size === b.size && Array.from(a).every((x) => b.has(x));
        if (!igual) {
          return res.status(409).json({
            error: "O reenvio vai sempre para quem ainda não aprovou — o servidor não aceita outro conjunto.",
            esperado: sponsorIds,
          });
        }
      }

      // Cada aprovação reprovada volta para a fila do Atendimento: awaiting_arte → new_version_pending
      for (const sponsorId of sponsorIds) {
        const approval = await storage.getItemSponsorApproval(itemId, sponsorId);
        if (approval && approval.status === "awaiting_arte") {
          await storage.updateItemSponsorApproval(approval.id, {
            status: "new_version_pending",
          });
        }
      }

      // Update item thumb with the new version
      const item = await storage.updateItem(itemId, {
        approvalThumbUrl: newThumbUrl,
        rejectedBySponsor: false,
      });
      await storage.createItemArtVersion({ itemId, thumbUrl: newThumbUrl, origem: "reenvio", createdBy: req.userName ?? null });
      invalidarCacheDeVersoes();
      // Versão nova: o desaprovador que já tinha aprovado volta para a fila.
      await revogarAprovacoesEstritas(req, currentItem, { tipo: "nova_versao" });

      const event = await storage.getEvent(currentItem.eventId);

      await createAuditLog(
        req,
        'updated',
        'item',
        itemId,
        `Arte enviou nova versão do thumb para ${sponsorIds.length} patrocinador(es). Aguarda revisão do Atendimento.`
      );

      // Notify Atendimento
      const notification = await storage.createNotification({
        type: "itemRejected",
        message: `Nova versão de arte enviada. Revise o thumb: ${currentItem.type} - Evento: ${event?.name}`,
        eventId: currentItem.eventId,
        itemId: itemId,
        targetRoles: ["atendimento"],
      });

      broadcast({ type: "item_updated", item });
      broadcast({ type: "notification_created", notification });

      res.json({ item, message: "Nova versão enviada. Atendimento notificado." });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Initialize sponsor approvals when sending item for approval
  app.post("/api/items/:id/initialize-sponsor-approvals", requireAuth, async (req, res) => {
    // Irmã de resubmit (arte+admin); estava sem gate — e sem caller no client.
    if (!["arte", "admin"].includes(req.userRole ?? "")) {
      return res.status(403).json({ error: "Sem permissão" });
    }
    try {
      const itemId = req.params.id;

      // ANDA: (re)inicializar zera as aprovações e abre uma rodada NOVA de
      // cobrança de patrocinador. Precisa do item só para chegar ao evento.
      const alvo = await storage.getItem(itemId);
      if (!alvo) return res.status(404).json({ error: "Item não encontrado" });
      if (await barraEventoFinalizado(alvo, res)) return;

      // Get item sponsors
      const itemSponsors = await storage.getItemSponsors(itemId);

      if (itemSponsors.length === 0) {
        return res.status(400).json({ error: "Item não possui patrocinadores vinculados" });
      }
      
      // Initialize approval records for all sponsors
      await storage.initializeItemSponsorApprovals(
        itemId, 
        itemSponsors.map(s => s.sponsorId)
      );
      
      const approvals = await storage.getItemSponsorApprovals(itemId);

      // Zera as aprovações de patrocinador da peça e não deixava rastro nenhum:
      // quem consultasse a ficha via um "Pat. Aprovou" desaparecer sem que nada
      // dissesse quem reabriu a rodada.
      await createAuditLog(
        req,
        'updated',
        'item',
        itemId,
        `Aprovações de patrocinador (re)inicializadas para ${itemSponsors.length} patrocinador(es)`
      );

      res.json(approvals);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ========== End Individual Sponsor Approval Endpoints ==========

  // Arte submits final file after sponsor approval
  app.patch("/api/items/:id/submit-final-file", requireAuth, async (req, res) => {
    try {
      // Validate role
      if (req.userRole !== "arte" && req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas usuários com perfil Arte podem enviar arquivo final" });
      }
      
      // Validate request body with Zod
      const finalFileSchema = z.object({
        finalFileUrl: z.string().min(1, "finalFileUrl não pode estar vazio"),
        finalFileName: z.string().optional(),
        finalPreviewUrl: z.string().optional(),
      });
      
      const validatedData = finalFileSchema.parse(req.body);
      
      // Validate current status
      const currentItem = await storage.getItem(req.params.id);
      if (!currentItem) {
        return res.status(404).json({ error: "Item not found" });
      }
      
      // ANDA: o arquivo final leva a peça para a Revisão Final e, dali, para a
      // Gráfica.
      if (await barraEventoFinalizado(currentItem, res)) return;

      // sponsor_approved: normal flow after sponsor approval
      // awaiting_creator_review: skipApproval / no-sponsor flow (sponsor approval skipped)
      if (currentItem.status !== "sponsor_approved" && currentItem.status !== "awaiting_creator_review") {
        return res.status(409).json({ 
          error: `Item não pode receber arquivo final. Status atual: ${currentItem.status}, esperado: sponsor_approved ou awaiting_creator_review` 
        });
      }
      
      const item = await storage.updateItem(req.params.id, {
        status: "awaiting_final_review",
        finalFileUrl: validatedData.finalFileUrl,
        finalFileName: validatedData.finalFileName || null,
        finalPreviewUrl: validatedData.finalPreviewUrl || null,
        finalFileUpdatedAt: new Date(),
      });
      
      if (!item) {
        return res.status(404).json({ error: "Item not found" });
      }
      
      const event = await storage.getEvent(item.eventId);
      
      await createAuditLog(
        req,
        'updated',
        'item',
        item.id,
        `Status alterado: ${translateStatus(currentItem.status)} → ${translateStatus("awaiting_final_review")} (arquivo final adicionado)`
      );
      
      // Notifica Solicitação para revisão final
      const notification = await storage.createNotification({
        type: "arteApproved",
        message: `Arquivo final pronto para revisão: ${item.type} - Evento: ${event?.name}`,
        eventId: item.eventId,
        itemId: item.id,
        targetRoles: ["solicitacao"],
      });
      
      broadcast({ type: "item_updated", item });
      broadcast({ type: "notification_created", notification });
      
      res.json(item);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Arte atualiza o caminho do arquivo final já enviado (sem mudar o status do item)
  // Troca o thumb de aprovação já existente, preservando o anterior. Serve para
  // corrigir o material de referência sem reabrir a aprovação dos patrocinadores
  // (para isso existe a rota de reenvio, que muda o status).
  app.patch("/api/items/:id/update-thumb", requireAuth, async (req, res) => {
    try {
      if (req.userRole !== "arte" && req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas usuários com perfil Arte podem atualizar o thumb" });
      }

      const { approvalThumbUrl } = z
        .object({ approvalThumbUrl: z.string().min(1, "approvalThumbUrl não pode estar vazio") })
        .parse(req.body);

      const currentItem = await storage.getItem(req.params.id);
      if (!currentItem) {
        return res.status(404).json({ error: "Item not found" });
      }
      // ANDA: trocar o thumb é refazer o material que os patrocinadores olham.
      if (await barraEventoFinalizado(currentItem, res)) return;
      if (!currentItem.approvalThumbUrl) {
        return res.status(409).json({ error: "Este item ainda não possui um thumb enviado" });
      }
      if (currentItem.approvalThumbUrl === approvalThumbUrl) {
        return res.status(409).json({ error: "O thumb enviado é igual ao atual" });
      }

      const prevUrl = currentItem.approvalThumbUrl;

      const item = await storage.updateItem(req.params.id, {
        approvalThumbUrl,
        previousApprovalThumbUrl: prevUrl,
        approvalThumbUpdatedAt: new Date(),
      });
      if (!item) {
        return res.status(404).json({ error: "Item not found" });
      }
      await storage.createItemArtVersion({ itemId: item.id, thumbUrl: approvalThumbUrl, origem: "troca", createdBy: req.userName ?? null });
      invalidarCacheDeVersoes();
      // Versão nova enquanto a peça está em aprovação (ou já aprovada e na
      // finalização da Arte): o desaprovador perde a aprovação — e se a peça
      // já tinha sido dada como aprovada por todos, ela volta para a aprovação.
      if (currentItem.status === "awaiting_sponsor_approval" || currentItem.status === "sponsor_approved") {
        const revogados = await revogarAprovacoesEstritas(req, currentItem, { tipo: "nova_versao" });
        if (revogados.length > 0 && currentItem.status === "sponsor_approved") {
          const devolvido = await storage.updateItem(item.id, { status: "awaiting_sponsor_approval", rejectedBySponsor: false });
          await createAuditLog(req, 'updated', 'item', item.id, `Status alterado: ${translateStatus("sponsor_approved")} → ${translateStatus("awaiting_sponsor_approval")} — ${revogados.join(", ")} precisa aprovar a nova versão`);
          const event = await storage.getEvent(currentItem.eventId);
          const notification = await storage.createNotification({
            type: "itemRejected",
            message: `Thumb trocado: ${revogados.join(", ")} precisa aprovar a nova versão. ${currentItem.type} - Evento: ${event?.name}`,
            eventId: currentItem.eventId,
            itemId: item.id,
            targetRoles: ["atendimento"],
          });
          broadcast({ type: "notification_created", notification });
          broadcast({ type: "item_updated", item: devolvido });
          return res.json(devolvido);
        }
      }

      await createAuditLog(
        req,
        'updated',
        'item',
        item.id,
        `Thumb de aprovação atualizado por ${req.userName}. Anterior: ${prevUrl} → Novo: ${approvalThumbUrl}`
      );

      broadcast({ type: "item_updated", item });
      res.json(item);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.patch("/api/items/:id/update-final-file", requireAuth, async (req, res) => {
    try {
      if (req.userRole !== "arte" && req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas usuários com perfil Arte podem atualizar o arquivo final" });
      }

      const finalFileSchema = z.object({
        finalFileUrl: z.string().min(1, "finalFileUrl não pode estar vazio"),
        finalFileName: z.string().optional(),
        finalPreviewUrl: z.string().optional(),
      });
      const validatedData = finalFileSchema.parse(req.body);

      const currentItem = await storage.getItem(req.params.id);
      if (!currentItem) {
        return res.status(404).json({ error: "Item not found" });
      }
      // ANDA: substituir o arquivo final notifica a Gráfica para RE-VERIFICAR
      // antes de produzir e ainda propaga a arte nova para os complementos —
      // é um pedido de reimpressão disfarçado de correção de arquivo.
      if (await barraEventoFinalizado(currentItem, res)) return;
      if (!currentItem.finalFileUrl) {
        return res.status(409).json({ error: "Este item ainda não possui um arquivo final enviado" });
      }

      const prevUrl  = currentItem.finalFileUrl;
      const prevName = currentItem.finalFileName || null;

      const item = await storage.updateItem(req.params.id, {
        finalFileUrl: validatedData.finalFileUrl,
        finalFileName: validatedData.finalFileName || null,
        finalPreviewUrl: validatedData.finalPreviewUrl || null,
        finalFileUpdatedAt: new Date(),
        previousFinalFileUrl:  prevUrl,
        previousFinalFileName: prevName,
      });
      if (!item) {
        return res.status(404).json({ error: "Item not found" });
      }

      const event = await storage.getEvent(item.eventId);

      await createAuditLog(
        req,
        'updated',
        'item',
        item.id,
        `Arquivo final substituído por ${req.userName}. Anterior: ${prevUrl} → Novo: ${validatedData.finalFileUrl}`
      );

      // Notifica gráfica que o arquivo foi trocado e precisa ser re-verificado
      const notification = await storage.createNotification({
        type: "arteApproved",
        message: `⚠ Arquivo final atualizado: ${item.type}${event ? ` — ${event.name}` : ""} (verifique antes de produzir)`,
        eventId: item.eventId,
        itemId: item.id,
        targetRoles: ["grafica"],
      });

      broadcast({ type: "item_updated", item });
      broadcast({ type: "notification_created", notification });

      // ── Propaga a arte nova para os COMPLEMENTOS vivos ────────────────────
      // O complemento é a MESMA peça, com a mesma arte — só a quantidade é
      // nova. Sem propagar, #0062-C1 continuaria carregando o arquivo antigo e
      // a Gráfica imprimiria a versão errada: refugo real, dinheiro perdido,
      // e o pior tipo de erro (nada na tela indica que está errado).
      // Só alcança complementos que ainda NÃO foram produzidos — reescrever a
      // arte de um lote já impresso seria mentir sobre o que está no galpão.
      try {
        const complementos = await storage.getLiveComplements(item.id);
        const aindaNaoImpressos = complementos.filter(
          (c) => (c.quantityProduced ?? 0) === 0 && (c.reuseQty ?? 0) === 0,
        );
        for (const c of aindaNaoImpressos) {
          await storage.updateItem(c.id, {
            finalFileUrl: item.finalFileUrl,
            finalFileName: item.finalFileName,
            finalPreviewUrl: item.finalPreviewUrl,
            finalFileUpdatedAt: item.finalFileUpdatedAt,
            previousFinalFileUrl: prevUrl,
            previousFinalFileName: prevName,
          });
          await createAuditLog(
            req,
            'updated', 'item', c.id,
            `Arquivo final propagado da peça original ${item.displayId} (arte substituída pela Arte)`,
          );
        }
        if (aindaNaoImpressos.length > 0) {
          const notifCompl = await storage.createNotification({
            type: "arteApproved",
            message: `⚠ Arquivo final atualizado também no(s) complemento(s) ${aindaNaoImpressos.map(c => c.displayId).join(", ")} — verifique antes de produzir`,
            eventId: item.eventId,
            itemId: aindaNaoImpressos[0].id,
            targetRoles: ["grafica"],
          });
          broadcast({ type: "production_updated", item: aindaNaoImpressos[0] });
          broadcast({ type: "notification_created", notification: notifCompl });
        }
      } catch (e: any) {
        // Migração pendente (42703) ou falha na propagação não pode derrubar a
        // troca de arquivo da peça principal, que já foi commitada.
        console.error("[COMPLEMENTOS] falha ao propagar arquivo final:", e?.message ?? e);
      }

      res.json(item);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Creator reviews and releases item for production (Solicitação module)
  app.patch("/api/items/:id/creator-review", requireAuth, async (req, res) => {
    try {
      // Validate role
      if (req.userRole !== "solicitacao" && req.userRole !== "arte" && req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas usuários com perfil Solicitação podem revisar como criador do evento" });
      }
      
      // Validate current status
      const currentItem = await storage.getItem(req.params.id);
      if (!currentItem) {
        return res.status(404).json({ error: "Item not found" });
      }
      
      // ANDA: liberar para produção é o gesto que autoriza imprimir. Vem ANTES
      // do atalho idempotente logo abaixo de propósito — num evento finalizado
      // a resposta certa é 409, e não um 200 silencioso.
      if (await barraEventoFinalizado(currentItem, res)) return;

      // Idempotente: se a peça JÁ foi liberada (ou já avançou na produção), não
      // é erro clicar "Liberar" de novo (lista desatualizada / clique duplo) —
      // só devolve a peça como sucesso, sem reprocessar.
      const alreadyReleased = [
        "ready_for_production", "approved", "pronto_para_producao", "liberado",
        "inProduction", "em_producao", "produced", "produzido", "conferred", "delivered", "entregue",
      ].includes(currentItem.status);
      if (alreadyReleased) {
        return res.json(currentItem);
      }
      if (currentItem.status !== "awaiting_final_review") {
        return res.status(409).json({
          error: `Item não pode ser revisado pelo criador. Status atual: ${translateStatus(currentItem.status)}, esperado: Aguardando Revisão Final`
        });
      }

      // Reaproveitamento parcial: body pode trazer { reuseQty } quando a Solicitação
      // quer reaproveitar só algumas unidades, enviando o restante para produção.
      const rawReuseQty = req.body?.reuseQty != null ? Number(req.body.reuseQty) : undefined;
      const askedReuse = rawReuseQty != null && !isNaN(rawReuseQty) && rawReuseQty > 0;
      // Pedir a quantidade inteira pelo campo do parcial é reaproveitamento
      // total. Antes esse caso caía fora das duas condições e a peça seguia para
      // produção como se nada tivesse sido pedido, sem aviso nenhum.
      const isFullReuse = currentItem.isReuse || (askedReuse && rawReuseQty! >= currentItem.quantity);
      const isPartialReuse = askedReuse && !isFullReuse;

      // O botão do client já exige arquivo final, mas a liberação em lote e o
      // atalho de teclado chegavam aqui sem ele — e uma peça sem arquivo
      // liberada para produção trava a Gráfica. Reaproveitamento TOTAL
      // dispensa (não produz nada); parcial produz o restante e precisa.
      if (!currentItem.finalFileUrl && !isFullReuse) {
        return res.status(409).json({
          error: "A peça ainda não tem arquivo final — a Arte precisa enviá-lo antes da liberação."
        });
      }

      // Peças de reaproveitamento total não passam pela produção: já entram como produzidas.
      // Reaproveitamento parcial vai para ready_for_production (as demais unidades precisam produzir).
      const nextStatus = isFullReuse ? "produced" : "ready_for_production";

      // Pre-fetch event for notification message (read outside tx — no lock needed)
      const event = await storage.getEvent(currentItem.eventId);

      const auditDetails = isFullReuse
        ? `Status alterado: ${translateStatus(currentItem.status)} → ${translateStatus("produced")} (reaproveitamento — não precisa produzir)`
        : isPartialReuse
          ? `Status alterado: ${translateStatus(currentItem.status)} → ${translateStatus("ready_for_production")} (reaproveitamento parcial: ${rawReuseQty} un. de ${currentItem.quantity}, ${currentItem.quantity - rawReuseQty!} a produzir)`
          : `Status alterado: ${translateStatus(currentItem.status)} → ${translateStatus("ready_for_production")} (liberado para produção)`;

      // Atomic: item update + audit log + notification.
      const { item, notification } = await db.transaction(async (tx) => {
        const [updated] = await tx
          .update(itemsTable)
          .set({
            status: nextStatus,
            creatorReviewedAt: new Date(),
            hasModifiedData: false,
            updatedAt: new Date(),
            ...(isPartialReuse ? { reuseQty: rawReuseQty!, isReuse: false } : {}),
            ...(isFullReuse ? { reuseQty: currentItem.quantity, isReuse: true } : {}),
          })
          .where(eq(itemsTable.id, req.params.id))
          .returning();
        if (!updated) throw Object.assign(new Error("Item not found"), { httpStatus: 404 });

        await tx.insert(auditLogs).values({
          ...resolveActor(req),
          action: "approved",
          entityType: "item",
          entityId: updated.id,
          details: auditDetails,
        });

        const [notif] = await tx.insert(notifications).values({
          type: "arteApproved",
          message: `Criador do evento liberou item para produção: ${updated.type} - Evento: ${event?.name}`,
          eventId: updated.eventId,
          itemId: updated.id,
          targetRoles: ["arte"], // só quem AGE agora: a Gráfica entra bem depois, quando liberam p/ produção
        }).returning();

        return { item: updated, notification: notif };
      });

      broadcast({ type: "item_updated", item });
      broadcast({ type: "notification_created", notification });
      
      res.json(item);
    } catch (error: any) {
      res.status((error as any).httpStatus ?? 400).json({ error: error.message });
    }
  });

  // Creator rejects item and sends back to Arte (Solicitação module)
  app.patch("/api/items/:id/creator-reject", requireAuth, async (req, res) => {
    try {
      // Validate role
      if (req.userRole !== "solicitacao" && req.userRole !== "arte" && req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas usuários com perfil Solicitação podem reprovar itens" });
      }
      
      // Validate current status
      const currentItem = await storage.getItem(req.params.id);
      if (!currentItem) {
        return res.status(404).json({ error: "Item not found" });
      }
      
      // ANDA: reprovar APAGA o arquivo final e o thumb e devolve a peça para a
      // Arte refazer — destrói material e cria trabalho de uma vez só.
      if (await barraEventoFinalizado(currentItem, res)) return;

      if (currentItem.status !== "awaiting_final_review") {
        return res.status(409).json({
          error: `Item não pode ser reprovado pelo criador. Status atual: ${currentItem.status}, esperado: awaiting_final_review`
        });
      }

      const motivo = lerMotivoDevolucao(req);
      if (!motivo.ok) return res.status(400).json({ error: motivo.erro });
      const destino = lerDestinoDevolucao(req);

      const item = await storage.updateItem(req.params.id, {
        // VOLTA PARA A FINALIZACAO, nao para o comeco (regra do dono, 17/08).
        // A devolucao da Revisao acontece DEPOIS de o patrocinador ter
        // aprovado o layout: o que falhou foi o arquivo final, nao a arte.
        // Mandar para `awaiting_submission` jogava a peca na fila de
        // "Aguardando envio" — o comeco de tudo, no meio de 1.120 pecas que
        // nunca sairam — e ainda apagava o thumb JA APROVADO, obrigando a
        // refazer aprovacao que ninguem pediu para refazer.
        // `sponsor_approved` e o status que alimenta a aba "Finalizar arte"
        // (TAB_STATUSES em lib/arte-rules): a peca reaparece exatamente na
        // etapa que precisa ser refeita, com a aprovacao preservada.
        // O DESTINO e escolha de quem devolve (ver lerDestinoDevolucao):
        // "arte" refaz do zero, "finalizacao" so troca o arquivo final.
        ...camposDoDestino(destino, await rodadaDeAprovacaoFechada(currentItem)),
        creatorReviewedAt: null,
        rejectedByCreator: true, // Flag indicando que foi reprovado pelo criador
        rejectionReason: motivo.motivo,
      });
      
      if (!item) {
        return res.status(404).json({ error: "Item not found" });
      }
      
      const event = await storage.getEvent(item.eventId);
      
      await createAuditLog(
        req,
        'rejected',
        'item',
        item.id,
        `Status alterado: ${translateStatus(currentItem.status)} → ${translateStatus(camposDoDestino(destino, await rodadaDeAprovacaoFechada(currentItem)).status)} (reprovado pelo criador — ${textoDoDestino(destino)}). Motivo: ${motivo.motivo}`
      );
      
      // Notifica Arte para refazer o trabalho
      const notification = await storage.createNotification({
        type: "itemRejected",
        message: `Criador do evento reprovou o item. Refaça o thumb de aprovação: ${item.type} - Evento: ${event?.name}`,
        eventId: item.eventId,
        itemId: item.id,
        targetRoles: ["arte"],
      });
      
      broadcast({ type: "item_updated", item });
      broadcast({ type: "notification_created", notification });
      
      res.json(item);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ─── Arte devolve a peça para o COMEÇO do fluxo ──────────────────────────
  //
  // As outras cinco portas devolvem a peça para "Aguardando Envio", ou seja,
  // para a própria Arte refazer. Esta é a única que devolve para QUEM PEDIU.
  // Regra do dono: "ela entra como rascunho e a pessoa que cria a peça decide
  // se continua ou descarta o item" — por isso `draft` e não `requested`:
  // rascunho é o único estado em que o solicitante pode mexer em tudo e do
  // qual pode simplesmente desistir.
  //
  // O thumb e o arquivo final NÃO são apagados. A peça pode voltar igual, e
  // jogar fora o trabalho da Arte por precaução obrigaria a refazê-lo à toa;
  // se o solicitante mudar tipo ou medida, o fluxo normal já pede arte nova.
  app.patch("/api/items/:id/arte-reject", requireAuth, async (req, res) => {
    try {
      if (req.userRole !== "arte" && req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas usuários com perfil Arte podem devolver a peça para o solicitante" });
      }

      const currentItem = await storage.getItem(req.params.id);
      if (!currentItem) {
        return res.status(404).json({ error: "Item not found" });
      }

      // ANDA: devolver para o começo do fluxo é criar trabalho novo para o
      // solicitante, numa fila que não mostra mais essa peça.
      if (await barraEventoFinalizado(currentItem, res)) return;

      // DE QUALQUER ESTADO (decisão do dono, 24/08).
      //
      // A trava anterior era de cinco status pré-produção: depois que a Gráfica
      // encostava na peça, a Arte não conseguia mais mandá-la de volta. A
      // objeção que a sustentava continua verdadeira — uma peça em produção
      // existe no mundo, e voltar para rascunho tira da fila da Gráfica um
      // trabalho que talvez já esteja impresso — mas quem opera decidiu que
      // errar o arquivo depois da produção é justamente quando devolver mais
      // importa, e a trava obrigava a pedir para um admin.
      //
      // O que NÃO é apagado: nada de produção. O status volta, o histórico
      // fica, e a trilha nomeia de onde a peça veio — é o que permite entender
      // depois por que a Gráfica perdeu uma linha da fila.
      //
      // O único estado recusado é o próprio rascunho: devolver o que já está na
      // criação não muda nada e ainda zeraria os campos de aprovação abaixo.
      if (currentItem.status === "draft") {
        return res.status(409).json({
          error: "Esta peça já está na criação (Rascunho) — não há para onde devolver.",
        });
      }

      const motivo = lerMotivoDevolucao(req);
      if (!motivo.ok) return res.status(400).json({ error: motivo.erro });
      const destino = lerDestinoDevolucao(req);

      const item = await storage.updateItem(req.params.id, {
        status: "draft",
        rejectionReason: motivo.motivo,
        // Zera o estado de aprovação/revisão: se a peça voltar a andar, ela
        // recomeça o trâmite em vez de herdar um "aprovado" de outra versão.
        sponsorApprovedBy: null,
        sponsorApprovedAt: null,
        creatorReviewedAt: null,
        rejectedBySponsor: false,
        rejectedByCreator: false,
      });

      if (!item) {
        return res.status(404).json({ error: "Item not found" });
      }

      const event = await storage.getEvent(item.eventId);

      await createAuditLog(
        req,
        'rejected',
        'item',
        item.id,
        `Status alterado: ${translateStatus(currentItem.status)} → ${translateStatus("draft")} (devolvida pela Arte ao solicitante${DEPOIS_DA_ARTE.has(currentItem.status) ? ", JÁ FORA DA ARTE" : ""}). Motivo: ${motivo.motivo}`
      );

      const notification = await storage.createNotification({
        type: "itemRejected",
        message: `A Arte devolveu a peça para rascunho: ${item.type} — Evento: ${event?.name}. Motivo: ${motivo.motivo}`,
        eventId: item.eventId,
        itemId: item.id,
        targetRoles: ["solicitacao"],
      });

      broadcast({ type: "item_updated", item });
      broadcast({ type: "notification_created", notification });

      res.json(item);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Creator returns item to Arte with modification notes (Solicitação module)
  app.patch("/api/items/:id/return-to-arte", requireAuth, async (req, res) => {
    try {
      if (req.userRole !== "solicitacao" && req.userRole !== "arte" && req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas usuários com perfil Solicitação podem devolver itens" });
      }
      
      const motivo = lerMotivoDevolucao(req);
      if (!motivo.ok) return res.status(400).json({ error: motivo.erro });
      const destino = lerDestinoDevolucao(req);
      const notes = motivo.motivo;
      const currentItem = await storage.getItem(req.params.id);
      if (!currentItem) {
        return res.status(404).json({ error: "Item not found" });
      }
      
      // ANDA: devolver para a Arte com observações é pedir retrabalho.
      if (await barraEventoFinalizado(currentItem, res)) return;

      if (currentItem.status !== "awaiting_final_review") {
        return res.status(409).json({ error: `Item não pode ser devolvido. Status atual: ${currentItem.status}` });
      }
      
      const item = await storage.updateItem(req.params.id, {
        // VOLTA PARA A FINALIZACAO, nao para o comeco (regra do dono, 17/08).
        // A devolucao da Revisao acontece DEPOIS de o patrocinador ter
        // aprovado o layout: o que falhou foi o arquivo final, nao a arte.
        // Mandar para `awaiting_submission` jogava a peca na fila de
        // "Aguardando envio" — o comeco de tudo, no meio de 1.120 pecas que
        // nunca sairam — e ainda apagava o thumb JA APROVADO, obrigando a
        // refazer aprovacao que ninguem pediu para refazer.
        // `sponsor_approved` e o status que alimenta a aba "Finalizar arte"
        // (TAB_STATUSES em lib/arte-rules): a peca reaparece exatamente na
        // etapa que precisa ser refeita, com a aprovacao preservada.
        // O DESTINO e escolha de quem devolve (ver lerDestinoDevolucao):
        // "arte" refaz do zero, "finalizacao" so troca o arquivo final.
        ...camposDoDestino(destino, await rodadaDeAprovacaoFechada(currentItem)),
        creatorReviewedAt: null,
        rejectedByCreator: true,
        // O motivo da devolução SUBSTITUI a observação: motivo vazio não pode
        // herdar a observação antiga como se fosse o feedback desta devolução.
        // (Hoje "vazio" nem chega aqui — `lerMotivoDevolucao` barra antes.)
        observations: notes,
        rejectionReason: notes,
        hasModifiedData: true, // Flag: Arte precisa revisar dados modificados
      });
      
      if (!item) {
        return res.status(404).json({ error: "Item not found" });
      }
      
      const event = await storage.getEvent(item.eventId);
      const detailMsg = notes ? ` Observações: ${notes}` : "";
      const modifiedDataMsg = currentItem.hasModifiedData ? " ⚠️ DADOS MODIFICADOS: Verifique Quantidade, m² Total e Medida!" : "";
      
      await createAuditLog(
        req,
        'rejected',
        'item',
        item.id,
        `Item devolvido para Arte para modificações.${detailMsg}${modifiedDataMsg}`
      );
      
      const notification = await storage.createNotification({
        type: "itemRejected",
        message: `Criador devolveu item para modificações: ${item.type} - Evento: ${event?.name}${detailMsg}${modifiedDataMsg}`,
        eventId: item.eventId,
        itemId: item.id,
        targetRoles: ["arte"],
      });
      
      broadcast({ type: "item_updated", item });
      broadcast({ type: "notification_created", notification });
      res.json(item);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  /**
   * DEVOLVER PARA A REVISÃO — a saída que faltava na Gráfica.
   *
   * O operador abre o arquivo na hora de imprimir e vê que está errado. Até
   * aqui ele tinha duas opções ruins: imprimir mesmo assim, ou deixar a peça
   * parada na fila sem que ninguém soubesse por quê — a peça continuava
   * contando como "Pronto para Produção" para o resto do app, inclusive para
   * a Gestão de Prazos, que a cobrava da Gráfica.
   *
   * SÓ ANTES DE PRODUZIR (decisão do dono). A partir do momento em que a
   * produção começa existe material físico, `quantityProduced` contado e
   * ativos de inventário criados; devolver para uma fila que assume que nada
   * foi feito exigiria um caminho de estorno que não existe. Depois de
   * produzida, o caminho continua sendo o de sempre.
   *
   * O motivo é obrigatório pela mesma régua das outras devoluções: quem
   * recebe a peça de volta precisa saber o que refazer.
   */
  const STATUS_ANTES_DE_PRODUZIR = ["ready_for_production", "pronto_para_producao", "approved", "liberado"];

  app.patch("/api/items/:id/return-to-review", requireAuth, async (req, res) => {
    try {
      // Quem decide NÃO imprimir é quem tem a impressora — mesmo gate de
      // `start-production`, e não o de conferir/entregar: devolver é recusar
      // o trabalho, não executá-lo.
      if (req.userRole !== "grafica" && req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas a Gráfica pode devolver para a Revisão" });
      }

      const motivo = lerMotivoDevolucao(req);
      if (!motivo.ok) return res.status(400).json({ error: motivo.erro });
      const notes = motivo.motivo;

      const currentItem = await storage.getItem(req.params.id);
      if (!currentItem) return res.status(404).json({ error: "Item não encontrado" });

      if (await barraEventoFinalizado(currentItem, res)) return;

      if (!STATUS_ANTES_DE_PRODUZIR.includes(currentItem.status)) {
        return res.status(409).json({
          error: `A peça já saiu da fila de produção (${translateStatus(currentItem.status)}) e não pode voltar para a Revisão — há material produzido para desfazer.`,
        });
      }

      const item = await storage.updateItem(req.params.id, {
        status: "awaiting_final_review",
        // A revisão anterior deixa de valer: foi ela que liberou a peça para
        // uma produção que a Gráfica está recusando. Sem zerar isto, a peça
        // reapareceria na Revisão marcada como já revisada.
        creatorReviewedAt: null,
        // O motivo SUBSTITUI a observação, como no `return-to-arte`: motivo
        // novo não convive com o feedback de uma devolução anterior.
        observations: notes,
        rejectionReason: notes,
      });
      if (!item) return res.status(404).json({ error: "Item não encontrado" });

      const event = await storage.getEvent(item.eventId);

      await createAuditLog(
        req,
        "rejected",
        "item",
        item.id,
        `Gráfica devolveu a peça para a Revisão antes de produzir. Motivo: ${notes}`,
      );

      const notification = await storage.createNotification({
        type: "itemRejected",
        message: `Gráfica devolveu ${item.displayId} para a Revisão: ${notes}`,
        eventId: item.eventId,
        itemId: item.id,
        targetRoles: ["solicitacao"],
      });

      // `item_updated` é o que invalida `/api/items/approved` (a fila da
      // Gráfica, que roda com staleTime: Infinity) — ver use-websocket.
      broadcast({ type: "item_updated", item });
      broadcast({ type: "notification_created", notification });
      res.json(item);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Bulk return to Arte with notes
  app.patch("/api/items/bulk-return-to-arte", requireAuth, async (req, res) => {
    try {
      if (req.userRole !== "solicitacao" && req.userRole !== "arte" && req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas usuários com perfil Solicitação podem devolver itens" });
      }
      
      const { itemIds } = req.body;
      if (!Array.isArray(itemIds) || itemIds.length === 0) {
        return res.status(400).json({ error: "itemIds deve ser um array não vazio" });
      }

      const motivoLote = lerMotivoDevolucao(req);
      if (!motivoLote.ok) return res.status(400).json({ error: motivoLote.erro });
      const destino = lerDestinoDevolucao(req);
      const notes = motivoLote.motivo;

      const results = [];
      const errors = [];
      // ANDA: mesma devolução do individual, multiplicada.
      const bloqueio = contadorDeBloqueio();

      for (const itemId of itemIds) {
        const currentItem = await storage.getItem(itemId);
        if (!currentItem) {
          errors.push({ itemId, error: "Item não encontrado" });
          continue;
        }

        const motivoEvento = await motivoEventoDaPeca(currentItem);
        if (motivoEvento) {
          errors.push({ itemId, error: bloqueio.registra(motivoEvento) });
          continue;
        }

        if (currentItem.status !== "awaiting_final_review") {
          errors.push({ itemId, error: `Status inválido: ${currentItem.status}` });
          continue;
        }

        const item = await storage.updateItem(itemId, {
          // VOLTA PARA A FINALIZACAO, nao para o comeco (regra do dono, 17/08).
          // A devolucao da Revisao acontece DEPOIS de o patrocinador ter
          // aprovado o layout: o que falhou foi o arquivo final, nao a arte.
          // Mandar para `awaiting_submission` jogava a peca na fila de
          // "Aguardando envio" — o comeco de tudo, no meio de 1.120 pecas que
          // nunca sairam — e ainda apagava o thumb JA APROVADO, obrigando a
          // refazer aprovacao que ninguem pediu para refazer.
          // `sponsor_approved` e o status que alimenta a aba "Finalizar arte"
          // (TAB_STATUSES em lib/arte-rules): a peca reaparece exatamente na
          // etapa que precisa ser refeita, com a aprovacao preservada.
          // O DESTINO e escolha de quem devolve (ver lerDestinoDevolucao):
          // "arte" refaz do zero, "finalizacao" so troca o arquivo final.
          ...camposDoDestino(destino, await rodadaDeAprovacaoFechada(currentItem)),
          creatorReviewedAt: null,
          rejectedByCreator: true,
          // (e não `|| currentItem.observations`): o return individual
          // substitui a observação — o lote herdava a antiga silenciosamente.
          observations: notes,
          rejectionReason: notes,
        });

        if (item) {
          results.push(item);
          await createAuditLog(
            req,
            'rejected',
            'item',
            item.id,
            `Item devolvido para Arte para modificações (em lote).`
          );
          broadcast({ type: "item_updated", item });
        }
      }

      if (bloqueio.respondeLoteInteiro(res, results.length, itemIds.length)) return;

      if (results.length > 0) {
        const detailMsg = notes ? ` Observações: ${notes}` : "";
        const notification = await storage.createNotification({
          type: "itemRejected",
          message: `Criador devolveu ${results.length} item(ns) para modificações.${detailMsg}`,
          eventId: results[0].eventId,
          itemId: null,
          targetRoles: ["arte"],
        });
        broadcast({ type: "notification_created", notification });
      }
      
      res.json({ success: results.length, errors: errors.length, items: results, failedItemIds: errors.map(e => e.itemId) });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Cancel item (item disappears from workflow but stays in events)
  app.patch("/api/items/:id/cancel", requireAuth, async (req, res) => {
    try {
      if (req.userRole !== "solicitacao" && req.userRole !== "arte" && req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas usuários com perfil Solicitação podem cancelar itens" });
      }
      
      const { notes } = req.body;
      const currentItem = await storage.getItem(req.params.id);
      if (!currentItem) {
        return res.status(404).json({ error: "Item not found" });
      }
      
      // CASO DUVIDOSO — barrado, e o porquê da dúvida fica aqui.
      // A favor de permitir: cancelar não faz ninguém trabalhar; parece a
      // faxina natural das peças que ficaram penduradas quando o evento acabou.
      // Contra (e foi o que decidiu): esta rota NÃO tem gate de status nenhum —
      // ela aceita cancelar uma peça ENTREGUE, e isso reescreveria o registro
      // de um evento fechado ("entregue" vira "cancelado"), justamente o número
      // que fecha a conta com o patrocinador. Na dúvida, barra: quem precisa
      // mesmo cancelar pede para reabrir o evento, e para a faxina de peça que
      // nunca existiu já existe a exclusão, que segue liberada e é reversível.
      if (await barraEventoFinalizado(currentItem, res)) return;

      const item = await storage.updateItem(req.params.id, {
        status: "canceled",
        observations: notes || currentItem.observations,
      });

      if (!item) {
        return res.status(404).json({ error: "Item not found" });
      }

      const detailMsg = notes ? ` Motivo: ${notes}` : "";
      await createAuditLog(
        req,
        'canceled',
        'item',
        item.id,
        `Item cancelado${detailMsg}`
      );
      
      broadcast({ type: "item_updated", item });
      res.json(item);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Bulk cancel items
  app.patch("/api/items/bulk-cancel", requireAuth, async (req, res) => {
    try {
      if (req.userRole !== "solicitacao" && req.userRole !== "arte" && req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas usuários com perfil Solicitação podem cancelar itens" });
      }
      
      const { itemIds, notes } = req.body;
      if (!Array.isArray(itemIds) || itemIds.length === 0) {
        return res.status(400).json({ error: "itemIds deve ser um array não vazio" });
      }
      
      const results = [];
      // Mesma decisão (e mesma dúvida) do cancelamento individual acima.
      const bloqueio = contadorDeBloqueio();

      for (const itemId of itemIds) {
        const currentItem = await storage.getItem(itemId);
        if (!currentItem) continue;

        const motivoEvento = await motivoEventoDaPeca(currentItem);
        if (motivoEvento) {
          bloqueio.registra(motivoEvento);
          continue;
        }

        const item = await storage.updateItem(itemId, {
          status: "canceled",
          observations: notes || currentItem.observations,
        });
        if (item) {
          results.push(item);
          const detailMsg = notes ? ` Motivo: ${notes}` : "";
          await createAuditLog(
            req,
            'canceled', 'item', item.id, `Item cancelado (em lote)${detailMsg}`);
          broadcast({ type: "item_updated", item });
        }
      }

      if (bloqueio.respondeLoteInteiro(res, results.length, itemIds.length)) return;

      res.json({ canceled: results.length, items: results });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Update item fields (Solicitação module - can edit)
  app.patch("/api/items/:id/edit", requireAuth, async (req, res) => {
    try {
      if (req.userRole !== "solicitacao" && req.userRole !== "arte" && req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas usuários com perfil Solicitação podem editar itens" });
      }
      
      const currentItem = await storage.getItem(req.params.id);
      if (!currentItem) {
        return res.status(404).json({ error: "Item not found" });
      }
      
      // ANDA: é a irmã do PATCH genérico — muda quantidade, material, medidas e
      // m². Mesmo motivo, mesma guarda.
      if (await barraEventoFinalizado(currentItem, res)) return;

      const { type, quantity, description, fileWidth, fileHeight, material, finish, calculatedM2, measurement } = req.body;

      // Valores efetivos após o merge (novo valor ou o atual).
      const effQuantity = quantity !== undefined ? quantity : currentItem.quantity;
      const effFileWidth = fileWidth !== undefined ? fileWidth : currentItem.fileWidth;
      const effFileHeight = fileHeight !== undefined ? fileHeight : currentItem.fileHeight;
      // m² recalculado no servidor quando derivável; senão mantém o recebido/atual.
      const derivedM2 = deriveCalculatedM2({
        quantity: effQuantity,
        fileWidth: effFileWidth,
        fileHeight: effFileHeight,
      });
      const effCalculatedM2 =
        derivedM2 ?? (calculatedM2 !== undefined ? calculatedM2 : currentItem.calculatedM2);

      // A MEDIDA segue a mesma regra do m²: mudou dimensão, o texto é
      // re-derivado e o `measurement` do corpo é ignorado — ele é o valor
      // que o formulário carregou ao abrir, ou seja, o antigo.
      const medidaDerivada = medidaMudou(currentItem, effFileWidth, effFileHeight)
        ? deriveMeasurement(effFileWidth, effFileHeight)
        : undefined;
      const effMeasurement =
        medidaDerivada ?? (measurement !== undefined ? measurement : currentItem.measurement);

      const item = await storage.updateItem(req.params.id, {
        type: type || currentItem.type,
        quantity: effQuantity,
        description: description !== undefined ? description : currentItem.description,
        fileWidth: effFileWidth,
        fileHeight: effFileHeight,
        material: material || currentItem.material,
        finish: finish || currentItem.finish,
        calculatedM2: effCalculatedM2,
        measurement: effMeasurement,
      });
      
      if (!item) {
        return res.status(404).json({ error: "Item not found" });
      }
      
      const editDetails = [];
      if (type && type !== currentItem.type) editDetails.push(`Tipo: ${currentItem.type} → ${type}`);
      if (material && material !== currentItem.material) editDetails.push(`Material: ${currentItem.material} → ${material}`);
      if (finish && finish !== currentItem.finish) editDetails.push(`Acabamento: ${currentItem.finish} → ${finish}`);
      if (quantity !== undefined && quantity !== currentItem.quantity) editDetails.push(`Quantidade: ${currentItem.quantity} → ${quantity}`);
      if (effCalculatedM2 !== currentItem.calculatedM2) editDetails.push(`m² Total: ${currentItem.calculatedM2} → ${effCalculatedM2}`);
      if (item.measurement !== currentItem.measurement) editDetails.push(`Medida: ${currentItem.measurement} → ${item.measurement}`);
      
      await createAuditLog(
        req,
        'updated',
        'item',
        item.id,
        `Item editado${editDetails.length > 0 ? ': ' + editDetails.join(', ') : ''}`
      );
      
      broadcast({ type: "item_updated", item });
      res.json(item);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Bulk creator reject (Solicitação module)
  app.patch("/api/items/bulk-creator-reject", requireAuth, async (req, res) => {
    try {
      // Validate role
      if (req.userRole !== "solicitacao" && req.userRole !== "arte" && req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas usuários com perfil Solicitação podem reprovar itens" });
      }
      
      const { itemIds } = req.body;
      if (!Array.isArray(itemIds) || itemIds.length === 0) {
        return res.status(400).json({ error: "itemIds deve ser um array não vazio" });
      }

      // Um motivo para o LOTE inteiro: quem devolve 20 peças de uma vez está
      // devolvendo por um motivo só. Se fossem 20 motivos, seriam 20 cliques.
      const motivo = lerMotivoDevolucao(req);
      if (!motivo.ok) return res.status(400).json({ error: motivo.erro });
      const destino = lerDestinoDevolucao(req);
      
      const results = [];
      const errors = [];
      // ANDA: mesma reprovação do individual, multiplicada.
      const bloqueio = contadorDeBloqueio();

      for (const itemId of itemIds) {
        const currentItem = await storage.getItem(itemId);
        if (!currentItem) {
          errors.push({ itemId, error: "Item não encontrado" });
          continue;
        }

        const motivoEvento = await motivoEventoDaPeca(currentItem);
        if (motivoEvento) {
          errors.push({ itemId, error: bloqueio.registra(motivoEvento) });
          continue;
        }

        if (currentItem.status !== "awaiting_final_review") {
          errors.push({ itemId, error: `Status inválido: ${currentItem.status}` });
          continue;
        }

        const item = await storage.updateItem(itemId, {
          // VOLTA PARA A FINALIZACAO, nao para o comeco (regra do dono, 17/08).
          // A devolucao da Revisao acontece DEPOIS de o patrocinador ter
          // aprovado o layout: o que falhou foi o arquivo final, nao a arte.
          // Mandar para `awaiting_submission` jogava a peca na fila de
          // "Aguardando envio" — o comeco de tudo, no meio de 1.120 pecas que
          // nunca sairam — e ainda apagava o thumb JA APROVADO, obrigando a
          // refazer aprovacao que ninguem pediu para refazer.
          // `sponsor_approved` e o status que alimenta a aba "Finalizar arte"
          // (TAB_STATUSES em lib/arte-rules): a peca reaparece exatamente na
          // etapa que precisa ser refeita, com a aprovacao preservada.
          // O DESTINO e escolha de quem devolve (ver lerDestinoDevolucao):
          // "arte" refaz do zero, "finalizacao" so troca o arquivo final.
          ...camposDoDestino(destino, await rodadaDeAprovacaoFechada(currentItem)),
          creatorReviewedAt: null,
          rejectedByCreator: true,
          rejectionReason: motivo.motivo,
        });
        
        if (item) {
          results.push(item);
          
          const event = await storage.getEvent(item.eventId);
          
          await createAuditLog(
            req,
            'rejected',
            'item',
            item.id,
            `Status alterado: ${translateStatus(currentItem.status)} → ${translateStatus(camposDoDestino(destino, await rodadaDeAprovacaoFechada(currentItem)).status)} (reprovado pelo criador em lote — ${textoDoDestino(destino)}). Motivo: ${motivo.motivo}`
          );
          
          broadcast({ type: "item_updated", item });
        }
      }
      
      if (bloqueio.respondeLoteInteiro(res, results.length, itemIds.length)) return;

      // Notifica Arte uma vez para todos os itens
      if (results.length > 0) {
        const notification = await storage.createNotification({
          type: "itemRejected",
          message: `Criador reprovou ${results.length} item(ns). Refaça os thumbs de aprovação.`,
          eventId: results[0].eventId,
          itemId: null,
          targetRoles: ["arte"],
        });
        
        broadcast({ type: "notification_created", notification });
      }
      
      // Extrair apenas os IDs dos itens com erro
      const failedItemIds = errors.map(e => e.itemId);
      
      res.json({ 
        success: results.length, 
        errors: errors.length,
        items: results,
        failedItemIds,
        errorDetails: errors
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Approve item (Arte module) - DEPRECATED: Use new approval workflow
  app.patch("/api/items/:id/approve", requireAuth, async (req, res) => {
    try {
      if (req.userRole !== "solicitacao" && req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas usuários com perfil Solicitação podem liberar itens para produção" });
      }
      // Pre-fetch event for notification message (read outside tx — no row lock needed)
      const preItem = await storage.getItem(req.params.id);
      if (!preItem) return res.status(404).json({ error: "Item not found" });
      // ANDA: caminho antigo do "liberar para produção". Depreciado, mas
      // registrado — e uma rota registrada é uma rota chamável.
      if (await barraEventoFinalizado(preItem, res)) return;
      const event = await storage.getEvent(preItem.eventId);

      // Atomic: item status update + audit log + notification in one transaction.
      // If any step fails the entire operation rolls back — no partial state in the DB.
      const { item, notification } = await db.transaction(async (tx) => {
        const [updated] = await tx
          .update(itemsTable)
          .set({ status: "approved", approvedAt: new Date(), updatedAt: new Date() })
          .where(eq(itemsTable.id, req.params.id))
          .returning();
        if (!updated) throw Object.assign(new Error("Item not found"), { httpStatus: 404 });

        await tx.insert(auditLogs).values({
          ...resolveActor(req),
          action: "approved",
          entityType: "item",
          entityId: updated.id,
          // "liberado para produção" e não "aprovado": é a MESMA frase que
          // /creator-review grava, e é por ela que o Histórico reconhece que a
          // liberação já tem registro próprio. Com a redação antiga o cliente
          // não achava o log e emitia POR CIMA uma linha "Lib. p/ Produção"
          // sintetizada do carimbo da peça — sem autor, duplicando o evento.
          details: `Item "${updated.type}" liberado para produção`,
        });

        const [notif] = await tx.insert(notifications).values({
          type: "arteApproved",
          message: `Item liberado para produção: ${updated.type} - Evento: ${event?.name}`,
          eventId: updated.eventId,
          itemId: updated.id,
          targetRoles: ["grafica"],
        }).returning();

        return { item: updated, notification: notif };
      });

      // Broadcasts happen after commit — no point notifying if the TX rolled back.
      broadcast({ type: "item_approved", item });
      broadcast({ type: "notification_created", notification });

      res.json(item);
    } catch (error: any) {
      res.status((error as any).httpStatus ?? 500).json({ error: error.message });
    }
  });

  // Start production (Gráfica module)
  app.patch("/api/items/:id/start-production", requireAuth, async (req, res) => {
    try {
      if (req.userRole !== "grafica" && req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas usuários com perfil Gráfica podem iniciar produção" });
      }
      const { quantityProduced, expectedProduced } = req.body;

      if (!quantityProduced || quantityProduced <= 0) {
        return res.status(400).json({ error: "quantityProduced is required and must be greater than 0" });
      }

      // Read current state before the transaction (for audit log description and
      // to compute the new status — replicating startProduction logic inside tx).
      const before = await storage.getItem(req.params.id);
      if (!before) return res.status(404).json({ error: "Item not found" });
      // ANDA — e é o mais caro de todos: aqui a peça vira LONA IMPRESSA e ainda
      // gera ativos no Estoque. Imprimir para um evento que já aconteceu é
      // dinheiro queimado que nenhum estorno recupera.
      if (await barraEventoFinalizado(before, res)) return;

      // ── Concorrência: `quantityProduced` é ABSOLUTO (total produzido até
      // agora), não incremental. Quando o cliente informa `expectedProduced`
      // (o total que ele leu na tela ao abrir o modal), o servidor confere que
      // ninguém lançou produção nesse meio-tempo. Sem isto, dois operadores no
      // galpão com a mesma peça aberta sobrescrevem um ao outro em silêncio:
      // o último a salvar apaga o lançamento do primeiro.
      // Campo OPCIONAL — clientes que não enviam seguem funcionando.
      const jaProduzido = before.quantityProduced ?? 0;
      if (expectedProduced != null && Number(expectedProduced) !== jaProduzido) {
        return res.status(409).json({
          error: `Outra pessoa lançou produção nesta peça: agora são ${jaProduzido} un. produzidas (você viu ${Number(expectedProduced)}). Confira o número e lance de novo.`,
          code: "PRODUCTION_CONFLICT",
          actualProduced: jaProduzido,
        });
      }

      // Teto: produzido + reaproveitado não pode passar da quantidade da peça —
      // sem isto qualquer número era aceito e virava esse total de ativos no
      // inventário quando a peça fechava como "produced".
      const itemQty = parseInt(before.quantity.toString());
      if (quantityProduced + (before.reuseQty || 0) > itemQty) {
        return res.status(400).json({
          error: `Quantidade inválida: ${quantityProduced} produzida(s) + ${before.reuseQty || 0} reaproveitada(s) excede as ${itemQty} un. da peça`,
        });
      }

      // Determine new status (same logic as storage.startProduction)
      const newProdStatus =
        quantityProduced + (before.reuseQty || 0) >= parseInt(before.quantity.toString())
          ? "produced"
          : "inProduction";
      const prodUpdateData: Record<string, unknown> = {
        status: newProdStatus,
        quantityProduced,
        updatedAt: new Date(),
        ...(!before.productionStartedAt ? { productionStartedAt: new Date() } : {}),
        // produced_at era coluna morta desde sempre: a peça fechava como
        // "Produzido" e a trilha temporal da ficha pulava direto de "Produção
        // iniciada" para "Conferido". Uma linha devolve a etapa.
        ...(newProdStatus === "produced" && !before.producedAt ? { producedAt: new Date() } : {}),
      };

      // Atomic: item status update + audit log in one transaction.
      const item = await db.transaction(async (tx) => {
        const [updated] = await tx
          .update(itemsTable)
          .set(prodUpdateData)
          .where(eq(itemsTable.id, req.params.id))
          .returning();
        if (!updated) throw Object.assign(new Error("Item not found"), { httpStatus: 404 });

        await tx.insert(auditLogs).values({
          ...resolveActor(req),
          action: newProdStatus === "produced" ? "produced" : "production",
          entityType: "item",
          entityId: updated.id,
          details: `Produção: ${quantityProduced}/${updated.quantity} un. (${translateStatus(before.status)} → ${translateStatus(newProdStatus)})`
            // O campo é ABSOLUTO e por anos foi rotulado como incremental na
            // tela: quem produzia 6 de 10, voltava e digitava "4" REGREDIA o
            // total para 4 sem nenhum vestígio. Enquanto o número absoluto for
            // o contrato, ao menos a regressão deixa de ser silenciosa.
            + (quantityProduced < jaProduzido ? ` — ATENÇÃO: total produzido REDUZIDO de ${jaProduzido} para ${quantityProduced} un.` : ""),
        });

        return updated;
      });

      const event = await storage.getEvent(item.eventId);

      // Auto-add to inventory when fully produced — N individual records
      if (item.status === 'produced') {
        const existingAssets = await storage.getAssetsByOriginalItemId(item.id);
        const itemName = item.description
          ? `${item.type} — ${item.description}`
          : item.type;
        const franchiseTags = event?.franchise
          ? [event.franchise.toLowerCase().replace(/\s+/g, '_')]
          : [];
        // Get sponsors linked to this item
        const itemSponsorLinks = await storage.getItemSponsors(item.id);
        const linkedSponsorIds = itemSponsorLinks.map(s => s.sponsorId);
        // Get approvalThumbUrl from item
        const approvalThumbUrl = item.approvalThumbUrl ?? null;
        // Prefixo do ativo a partir do displayId da peça.
        // ANTES: displayId.replace(/[^0-9]/g,'') — que para "#0062" dava "0062"
        // (certo) mas para o complemento "#0062-C1" dava "00621", um código
        // ilegível que ainda por cima colide com a peça #0621. assetPrefix
        // devolve "0062" para a mãe (byte a byte idêntico ao anterior: zero
        // risco no acervo existente) e "0062C1" para o complemento.
        const itemNum = assetPrefix(item.displayId);
        // Complemento ganha rastro no próprio ativo — quem abre o Estoque seis
        // meses depois entende por que existem dois blocos da "mesma" peça.
        const assetNotes = item.parentItemId
          ? `Gráfica — Evento: ${event?.name ?? '—'} · Complemento de ${(await storage.getItem(item.parentItemId))?.displayId ?? '—'}`
          : `Gráfica — Evento: ${event?.name ?? '—'}`;

        const producedBy = (req as any).userName || 'Gráfica';
        const novoAtivo = (seq: number) => ({
          displayId: `#EST-${itemNum}-${seq}`,
          name: itemName,
          quantity: 1,
          originalItemId: item.id,
          condition: "PERFEITO" as const,
          location: null,
          franchiseTags,
          sponsorIds: linkedSponsorIds,
          approvalThumbUrl,
          trackingStatus: "NO_GALPAO" as const,
          notes: assetNotes,
          autoAdded: true,
        });

        if (existingAssets.length < quantityProduced) {
          // Numeração pelo MAIOR sufixo existente, nunca por contagem.
          // Com contagem, excluir o ativo #EST-0062-3 de um bloco de 5 fazia o
          // próximo lote recomeçar em -5 (que já existe) e o INSERT estourar
          // 23505 — um 500 lançado DEPOIS de a peça já ter sido marcada como
          // produzida, ou seja, com o item num estado que ninguém reproduz.
          const maiorSeq = existingAssets.reduce((max, a) => Math.max(max, assetSeqOf(a.displayId)), 0);
          const faltam = quantityProduced - existingAssets.length;
          const records = Array.from({ length: faltam }, (_, i) => novoAtivo(maiorSeq + i + 1));
          const created = await storage.createInventoryAssets(records);
          for (const a of created) {
            await createAuditLog({ userName: producedBy, userId: req.userId }, 'cadastrado', 'inventory_asset', a.id,
              JSON.stringify({ evento: event?.name ?? '—', itemId: item.id }));
          }
        }
        // Run lifecycle cron immediately so assets with past event dates
        // transition straight to EM_USO / AGUARDANDO_TRIAGEM without waiting for the next tick.
        runInventoryCron();
      }
      
      // Não notificar sobre início de produção
      
      broadcast({ type: "production_started", item });
      
      res.json(item);
    } catch (error: any) {
      res.status((error as any).httpStatus ?? 500).json({ error: error.message });
    }
  });

  // Gráfica marca unidades como reaproveitamento — total ou parcial. As unidades
  // reaproveitadas dispensam produção, mas continuam passando pela conferência
  // junto com as produzidas.
  app.post("/api/items/:id/mark-reuse", requireAuth, async (req, res) => {
    try {
      if ((req as any).userRole !== "grafica" && (req as any).userRole !== "admin" && (req as any).userRole !== "solicitacao") {
        return res.status(403).json({ error: "Apenas a Gráfica ou Solicitação pode marcar reaproveitamento" });
      }
      const current = await storage.getItem(req.params.id);
      if (!current) return res.status(404).json({ error: "Item not found" });
      // ANDA: marcar reaproveitamento move a peça no fluxo (pode fechá-la como
      // "Produzido") e, por tabela, cria ativo de inventário. É decisão de
      // produção, não registro do passado.
      if (await barraEventoFinalizado(current, res)) return;
      if (current.status === "delivered" || current.status === "entregue") {
        return res.status(409).json({ error: "Não é possível reaproveitar uma peça já entregue" });
      }
      // Em Revisão a Gráfica só OLHA (regra do dono, 25/08): a peça está na
      // mesa de quem revisa, e reaproveitar é decidir o que entra na fila de
      // produção. O botão nem aparece; esta é a tranca de quem chega por
      // script ou por tela desatualizada.
      if (EM_REVISAO.has(current.status)) {
        return res.status(409).json({ error: "Esta peça está em revisão — a Gráfica só age depois que a revisão liberar." });
      }
      // Permite marcar como reaproveitamento enquanto a peça ainda está no fluxo de produção
      const allowedStatuses = [
        "ready_for_production", "pronto_para_producao", "approved",
        "inProduction", "em_producao",
      ];
      if (!allowedStatuses.includes(current.status)) {
        return res.status(409).json({ error: `Status atual não permite reaproveitamento: ${translateStatus(current.status)}` });
      }

      const alreadyReused = current.reuseQty || 0;
      const produced = current.quantityProduced || 0;
      // O reuso não pode invadir o que já foi produzido.
      const room = current.quantity - alreadyReused - produced;
      if (room <= 0) {
        return res.status(409).json({ error: `Nada a reaproveitar: ${alreadyReused} reaproveitada(s) e ${produced} produzida(s) de ${current.quantity}.` });
      }

      // Sem quantidade no corpo, reaproveita tudo o que resta (comportamento antigo).
      const n = Math.min(room, Math.max(1, Number(req.body?.qty) || room));
      const newReuse = alreadyReused + n;
      const isFullReuse = newReuse >= current.quantity;
      // Fecha em "Produzido" quando reuso + produção cobrem a quantidade toda.
      const isReady = newReuse + produced >= current.quantity;

      const item = await storage.updateItem(req.params.id, {
        reuseQty: newReuse,
        isReuse: isFullReuse,
        ...(isReady ? { status: "produced" as const } : {}),
      });
      if (!item) return res.status(404).json({ error: "Item not found" });

      await createAuditLog(
        req,
        'updated',
        'item',
        item.id,
        isFullReuse
          ? `Reaproveitamento total pela Gráfica: ${newReuse}/${current.quantity} un.`
          : `Reaproveitamento parcial pela Gráfica: ${n} un. (${newReuse}/${current.quantity} reaproveitadas, ${current.quantity - newReuse} a produzir)`
      );

      broadcast({ type: "item_updated", item });
      res.json(item);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Corrige reaproveitamento total que foi marcado por engano na Solicitação.
  // Só disponível enquanto a peça ainda não foi conferida (status = produced, conferredQty = 0).
  app.post("/api/items/:id/correct-reuse", requireAuth, async (req, res) => {
    try {
      if (
        (req as any).userRole !== "grafica" &&
        (req as any).userRole !== "admin" &&
        (req as any).userRole !== "solicitacao"
      ) {
        return res.status(403).json({ error: "Apenas a Gráfica, Solicitação ou Admin pode corrigir reaproveitamento" });
      }

      const current = await storage.getItem(req.params.id);
      if (!current) return res.status(404).json({ error: "Item not found" });
      // Em Revisão a Gráfica só OLHA (regra do dono, 25/08) — mesma tranca
      // do mark-reuse logo acima.
      if (EM_REVISAO.has(current.status)) {
        return res.status(409).json({ error: "Esta peça está em revisão — a Gráfica só age depois que a revisão liberar." });
      }

      // ANDA, apesar do nome. "Corrigir reaproveitamento" devolve a peça para
      // "Pronto p/ Produção" e ZERA quantityProduced — ou seja, recoloca a peça
      // na fila da Gráfica pedindo impressão. Num evento finalizado é
      // exatamente o trabalho fantasma que esta guarda existe para impedir.
      if (await barraEventoFinalizado(current, res)) return;

      // O que realmente impede a correção é a peça já ter sido conferida ou
      // entregue — é aí que o número vira contagem física. O status por si só
      // não impedia nada, mas travava o caso mais comum: a quantidade foi
      // digitada errada e o erro só é notado antes de produzir, com a peça em
      // "Pronto p/ Produção". O admin passa a corrigir em qualquer etapa
      // anterior à conferência; Gráfica e Solicitação seguem restritas a
      // "Produzido", que é o momento em que elas encostam na peça.
      const isAdmin = (req as any).userRole === "admin";
      if (!isAdmin && current.status !== "produced" && current.status !== "produzido") {
        return res.status(409).json({ error: "Correção disponível apenas para peças com status Produzido" });
      }
      if ((current.conferredQty || 0) > 0) {
        return res.status(409).json({ error: "Não é possível corrigir: a peça já foi parcialmente conferida" });
      }
      // Reuso antigo vai direto para a entrega sem conferir: sem esta checagem,
      // uma peça com unidades já entregues voltaria para "Pronto p/ Produção"
      // carregando deliveredQty, e a contagem de entrega ficaria inconsistente.
      if ((current.deliveredQty || 0) > 0) {
        return res.status(409).json({ error: `Não é possível corrigir: ${current.deliveredQty} un. já foram entregues` });
      }
      if ((current.reuseQty || 0) === 0 && !current.isReuse) {
        return res.status(409).json({ error: "Peça não tem reaproveitamento para corrigir" });
      }

      // O intervalo ia até quantidade-1, o que impedia justamente o caminho
      // inverso: quem marcou parcial por engano não conseguia voltar para
      // reaproveitamento total. O admin alcança o total; para os demais o
      // limite continua sendo o parcial, que é o que a operação deles cobre.
      const maximo = isAdmin ? current.quantity : current.quantity - 1;
      const correctedReuseQty = Number(req.body?.correctedReuseQty);
      if (isNaN(correctedReuseQty) || correctedReuseQty < 0 || correctedReuseQty > maximo) {
        return res.status(400).json({
          error: `Quantidade corrigida inválida (deve ser entre 0 e ${maximo})`,
        });
      }

      // Reaproveitar tudo pula a produção; qualquer valor menor deixa sobra e
      // manda a peça de volta para a fila.
      const reaproveitaTudo = correctedReuseQty === current.quantity;

      const item = await storage.updateItem(req.params.id, {
        reuseQty: correctedReuseQty,
        isReuse: reaproveitaTudo,
        status: reaproveitaTudo ? ("produced" as const) : ("ready_for_production" as const),
        // A produção lançada antes da marcação errada não vale mais para a
        // quantidade que agora precisa ser impressa.
        quantityProduced: reaproveitaTudo ? current.quantity : null,
      });
      if (!item) return res.status(404).json({ error: "Item not found" });

      await createAuditLog(
        req,
        "updated",
        "item",
        item.id,
        correctedReuseQty === 0
          ? `Reaproveitamento removido por correção — peça voltou para Pronto para Produção (${current.quantity} un. a produzir)`
          : reaproveitaTudo
          ? `Reaproveitamento corrigido para total: ${current.quantity}/${current.quantity} un. — peça pula a produção`
          : `Reaproveitamento corrigido de ${current.reuseQty || (current.isReuse ? current.quantity : 0)} para ${correctedReuseQty}/${current.quantity} un. reaproveitadas, ${current.quantity - correctedReuseQty} a produzir`
      );

      broadcast({ type: "item_updated", item });
      res.json(item);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Gráfica confere a peça produzida (com foto). Suporta conferência parcial.
  //
  // SEM a guarda de evento finalizado (é FECHAR A CONTA do que já existe).
  // Conferir não produz nada: a rota exige `status === "produced"`, isto é, a
  // impressão já aconteceu e a peça está fisicamente no galpão. O que se
  // registra aqui é a contagem do material — e a contagem costuma acontecer
  // depois do evento, que é justamente quando ele já conta como "realizado".
  // Barrar deixaria a peça eternamente "Produzida" e travaria a entrega, que
  // só aceita unidades conferidas.
  app.post("/api/items/:id/confer", requireAuth, async (req, res) => {
    try {
      // CONFERIR é da Gráfica E da Solicitação (decisão do dono).
      //
      // Era só grafica|admin, e isso criava um beco: a peça vinda do acervo
      // não passa pela Gráfica (não há o que imprimir), mas alguém precisa
      // conferir o material antes que ele possa ser entregue — e a entrega
      // sai do CONFERIDO. Sem este papel aqui, a Solicitação enxergava a peça,
      // enxergava que faltava entregar, e não tinha como destravar.
      //
      // A lista é a MESMA da entrega logo abaixo, de propósito: as duas etapas
      // finais do fluxo passaram a ter o mesmo conjunto de donos. Produzir
      // continua só com grafica|admin — quem produz é quem tem a impressora.
      if (!["grafica", "solicitacao", "admin"].includes((req as any).userRole ?? "")) {
        return res.status(403).json({ error: "Sem permissão para conferir" });
      }
      const { conferencePhotoUrl, qty, notes } = req.body ?? {};
      const current = await storage.getItem(req.params.id);
      if (!current) return res.status(404).json({ error: "Item not found" });
      if (!conferencePhotoUrl && !current.conferencePhotoUrl) {
        return res.status(400).json({ error: "Foto da conferência é obrigatória" });
      }
      // Conferência acontece a partir de Produzido (e continua enquanto parcial).
      /**
       * DISPONÍVEL PARA CONFERIR = produzido + reaproveitado.
       *
       * O gate era `status !== "produced"` → 409. Peça vinda do acervo nunca
       * chega a esse status (não há o que imprimir), então nunca podia ser
       * conferida — e, sem conferência, nunca entregue. 72 peças presas assim
       * em produção.
       *
       * A validação vive aqui e não só na tela porque a mesma rota atende a
       * conferência em LOTE: regra de negócio validada só no botão é regra que
       * o próximo caller ignora.
       */
      const reusedTotal = current.reuseQty || 0;
      const alreadyConferred = current.conferredQty || 0;
      const remaining = current.quantity - alreadyConferred;
      // `produced` continua liberando o caminho normal; o reuso abre o dele.
      // Sem este "ou", a peça de acervo levava 409 para sempre — 72 delas em
      // produção. O saldo (`remaining`) continua sendo quem limita quantas.
      // Peça NA REVISÃO não confere — nem pelo caminho do reuso, que não
      // olha status. Ela agora APARECE na fila da Gráfica (feed inclui a
      // revisão como "chegando"), então o buraco ficou alcançável: uma peça
      // com reaproveitamento marcado e ainda em revisão passaria por aqui.
      if (EM_REVISAO.has(current.status)) {
        return res.status(409).json({ error: `Esta peça ainda está na Revisão — a Gráfica confere depois que a Revisão liberar. Status: ${translateStatus(current.status)}` });
      }
      const podeConferir = current.status === "produced" || reusedTotal > 0;
      if (!podeConferir || remaining <= 0) {
        return res.status(409).json({ error: `Nada a conferir. Status: ${translateStatus(current.status)} (${alreadyConferred}/${current.quantity})` });
      }
      // Quantidade desta conferência (padrão: o que falta). Limita ao restante.
      const n = Math.min(remaining, Math.max(1, Number(qty) || remaining));
      const newConferred = alreadyConferred + n;
      const isFull = newConferred >= current.quantity;
      const trimmedNotes = typeof notes === "string" ? notes.trim() : "";

      const item = await storage.updateItem(req.params.id, {
        conferredQty: newConferred,
        conferencePhotoUrl: conferencePhotoUrl || current.conferencePhotoUrl || null,
        conferredAt: isFull ? new Date() : current.conferredAt,
        ...(trimmedNotes ? { conferenceNotes: trimmedNotes } : {}),
        // Status só vira "conferred" quando conferiu tudo; parcial continua "produced".
        ...(isFull ? { status: "conferred" as const } : {}),
      });
      await createAuditLog(
        req,
        'updated', 'item', req.params.id,
        (isFull ? `Conferência concluída (${newConferred}/${current.quantity})` : `Conferência parcial: ${n} un. (${newConferred}/${current.quantity})`)
        + (trimmedNotes ? ` — Obs.: ${trimmedNotes}` : ""));
      broadcast({ type: "item_updated", item });
      res.json(item);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Mark item as delivered (Gráfica module)
  //
  // SEM a guarda de evento finalizado — é O exemplo de FECHAR A CONTA: registrar
  // a entrega de algo que fisicamente já saiu. A rota não consegue inventar
  // trabalho: o teto de entrega é `conferredQty` (unidades já produzidas E já
  // conferidas), e produzir está barrado. E a entrega quase sempre é lançada
  // DEPOIS do evento — todo evento vira "realizado" no dia seguinte, então
  // barrar aqui impediria, para sempre, fechar o registro do que aconteceu de
  // verdade. É exatamente o oposto do que a regra quer.
  app.patch("/api/items/:id/deliver", requireAuth, async (req, res) => {
    // Entrega é etapa da Gráfica (solicitacao entra pelo fluxo de reuso) — era
    // a ÚNICA transição do fluxo de produção sem gate de papel.
    if (!["grafica", "solicitacao", "admin"].includes(req.userRole ?? "")) {
      return res.status(403).json({ error: "Sem permissão para registrar entrega" });
    }
    try {
      const { receivedBy, photoUrl, notes } = req.body;
      const trimmedNotes = typeof notes === "string" ? notes.trim() : "";

      /**
       * A FOTO É O COMPROVANTE; O NOME É O RECADO.
       *
       * A regra estava invertida: exigia-se o NOME de quem recebeu e a foto
       * era opcional. Na prática isso troca a prova pela palavra — nome é
       * texto digitado por quem entrega, e não comprova entrega nenhuma; a
       * foto é o registro que sustenta a conversa quando o cliente diz que
       * não recebeu.
       *
       * Invertido a pedido do dono: foto obrigatória, nome opcional. A
       * validação vive aqui e não só no cliente porque esta rota também
       * atende a entrega em LOTE e qualquer chamada futura — regra de
       * negócio validada só no formulário é regra que o próximo caller ignora.
       */
      if (!photoUrl) {
        return res.status(400).json({ error: "photoUrl is required" });
      }
      
      // Pegar status anterior antes de atualizar
      const currentItem = await storage.getItem(req.params.id);
      if (!currentItem) {
        return res.status(404).json({ error: "Item not found" });
      }
      
      // Entrega parcial: acumula deliveredQty; só vira "delivered" quando entrega
      // tudo. Só se entrega o que já foi conferido — inclusive o reaproveitamento,
      // que também passa pela conferência.
      //
      // Exceção para o legado: peças marcadas como reuso ANTES de reuse_qty
      // existir têm reuseQty = 0 e nunca passaram por conferência, porque a regra
      // antiga as mandava direto para a entrega. Exigir conferência delas agora
      // travaria entregas já em andamento, então seguem pela regra antiga.
      const legacyReuse = currentItem.isReuse && (currentItem.reuseQty || 0) === 0;
      const alreadyDelivered = currentItem.deliveredQty || 0;
      const maxDeliverable = legacyReuse ? currentItem.quantity : (currentItem.conferredQty || 0);
      const remaining = maxDeliverable - alreadyDelivered;
      if (remaining <= 0) {
        return res.status(409).json({ error: `Nada a entregar. Entregue ${alreadyDelivered}/${currentItem.quantity}${legacyReuse ? "" : ` (conferido ${currentItem.conferredQty || 0})`}.` });
      }
      const n = Math.min(remaining, Math.max(1, Number(req.body.qty) || remaining));
      const newDelivered = alreadyDelivered + n;
      const isFullDelivery = newDelivered >= currentItem.quantity;

      // Atomic: item update + audit log in one transaction.
      const item = await db.transaction(async (tx) => {
        const [updated] = await tx
          .update(itemsTable)
          .set({
            deliveredQty: newDelivered,
            receivedBy,
            deliveryPhotoUrl: photoUrl || currentItem.deliveryPhotoUrl || null,
            updatedAt: new Date(),
            ...(trimmedNotes ? { deliveryNotes: trimmedNotes } : {}),
            ...(isFullDelivery ? { status: "delivered" as const, deliveredAt: new Date() } : {}),
          })
          .where(eq(itemsTable.id, req.params.id))
          .returning();
        if (!updated) throw Object.assign(new Error("Item not found"), { httpStatus: 404 });

        await tx.insert(auditLogs).values({
          ...resolveActor(req),
          action: "delivered",
          entityType: "item",
          entityId: updated.id,
          details:
            // `receivedBy` agora é opcional, então a trilha precisa de uma
            // frase que funcione sem ele — "recebido por: undefined" seria
            // pior que não dizer nada.
            (isFullDelivery
              ? `Entrega concluída (${newDelivered}/${currentItem.quantity}${receivedBy ? `, recebido por: ${receivedBy}` : ""})`
              : `Entrega parcial: ${n} un. (${newDelivered}/${currentItem.quantity}${receivedBy ? `, recebido por: ${receivedBy}` : ""})`)
            + (trimmedNotes ? ` — Obs.: ${trimmedNotes}` : ""),
        });

        return updated;
      });
      if (!item) return res.status(404).json({ error: "Item not found" });

      const event = await storage.getEvent(item.eventId);
      
      // Recalculate event status - might become "completed"
      const previousStatus = event?.status;
      await updateEventStatus(item.eventId);
      
      // Verificar se evento foi concluído agora - notificar Solicitação
      const updatedEvent = await storage.getEvent(item.eventId);
      if (previousStatus !== "completed" && updatedEvent?.status === "completed") {
        const notification = await storage.createNotification({
          type: "eventCompleted",
          message: `Evento concluído: ${event?.name} - Todos os itens foram entregues`,
          eventId: item.eventId,
          targetRoles: ["solicitacao"],
        });
        broadcast({ type: "notification_created", notification });
      }
      
      broadcast({ type: "item_delivered", item });
      
      res.json(item);
    } catch (error: any) {
      res.status((error as any).httpStatus ?? 500).json({ error: error.message });
    }
  });

  // Update production (Gráfica module)
  // Vincula um PDF de book (layout pronto) às peças selecionadas de um evento.
  // Usado pela Arte para enviar o book aos patrocinadores enquanto a exportação
  // automática não está 100%. Aceita { bookUrl, itemIds }.
  app.post("/api/events/:eventId/book", requireAuth, async (req, res) => {
    try {
      // Gate de papel: era a ÚNICA rota da Arte sem — e como ela limpa o
      // bookUrl do evento antes de gravar, qualquer sessão podia APAGAR o
      // book inteiro. Mesmos papéis das 6 rotas irmãs.
      if (req.userRole !== "arte" && req.userRole !== "admin") {
        return res.status(403).json({ error: "Sem permissão para gerenciar books" });
      }
      const { bookUrl, itemIds } = req.body ?? {};
      if (!Array.isArray(itemIds) || itemIds.length === 0) {
        return res.status(400).json({ error: "Selecione ao menos uma peça" });
      }
      if (bookUrl !== null && (typeof bookUrl !== "string" || !bookUrl.trim())) {
        return res.status(400).json({ error: "bookUrl inválido" });
      }
      // ANDA (caso duvidoso, barrado): o book é o material que a Arte manda aos
      // patrocinadores para aprovarem — vincular um é abrir rodada de
      // aprovação. E a rota LIMPA o bookUrl de todas as peças do evento antes
      // de gravar, então em evento finalizado ela também apagaria o book
      // arquivado. Na dúvida entre "arquivo" e "trabalho", barra.
      const event = await storage.getEvent(req.params.eventId);
      const fechadoBook = motivoEventoFechado(event);
      if (fechadoBook) {
        return res.status(409).json({
          error: erroEventoFechado(fechadoBook), code: "EVENT_FINALIZED", reason: fechadoBook,
        });
      }
      // Limpa o bookUrl antigo de TODOS os itens do evento antes de setar o novo.
      // Isso garante que itens não selecionados não fiquem com URL obsoleta,
      // evitando que a exportação abra a versão antiga do book.
      await storage.clearEventBookUrl(req.params.eventId);
      const count = await storage.setItemsBookUrl(itemIds, bookUrl || null);
      if (bookUrl) {
        await storage.createEventBook({ eventId: req.params.eventId, bookUrl, itemCount: count, createdBy: req.userName ?? null });
        invalidarCacheDeVersoes();
        // items.book_url guarda apenas a versão atual; event_books preserva
        // cada publicação anterior para consulta e download futuros.
      }
      // Uma falha de auditoria não deve fazer a tela afirmar que o book não
      // foi salvo — a gravação acima já aconteceu. O erro continua visível nos
      // logs para correção, mas não desfaz nem bloqueia o fluxo principal.
      try {
        await createAuditLog(
          req,
          'updated',
          'event',
          req.params.eventId,
          bookUrl ? `Book de aprovação vinculado a ${count} peça(s)` : `Book removido de ${count} peça(s)`
        );
      } catch (error) {
        console.error("[book] falha ao registrar auditoria", {
          eventId: req.params.eventId,
          reason: error instanceof Error ? error.message : "erro desconhecido",
        });
      }
      // O AVISO vem depois de o book estar salvo E auditado: um efeito externo
      // nunca deve acontecer antes de existir registro interno dele. E o
      // resultado não some — vai para a trilha e para a resposta, para a tela
      // poder dizer "avisado" ou "não avisado, por isto".
      let aviso: BookEmailResult | null = null;
      if (bookUrl) {
        aviso = await avisarBookPorEmail(req, req.params.eventId, bookUrl, count);
        try {
          await createAuditLog(req, 'updated', 'event', req.params.eventId, descreverEnvio(aviso));
        } catch (error) {
          console.error("[book-email] falha ao registrar o aviso na trilha", {
            eventId: req.params.eventId,
            reason: error instanceof Error ? error.message : "erro desconhecido",
          });
        }
      }
      broadcast({ type: "items_book_updated", eventId: req.params.eventId, count });
      res.json({ updated: count, aviso });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // REENVIAR o aviso do book atual. Nasceu da revisão de 24/08: com o envio
  // agora registrado, "não chegou" deixou de ser um mistério — e reenviar
  // deixou de exigir republicar o book inteiro.
  //
  // SÓ ADMIN (decisão do dono, 24/08). Começou aberta a Arte e Atendimento —
  // quem publica o book e quem descobre que o e-mail não chegou. O dono
  // preferiu que todo disparo que SAI DO SISTEMA passe por ele: um reenvio
  // manda e-mail de verdade para as 26 pessoas da lista, e não tem desfazer.
  // Quem precisar reenviar pede a um admin; o registro na trilha diz quem
  // mandou e quando.
  app.post("/api/events/:eventId/book/notify", requireAuth, async (req, res) => {
    try {
      if (req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas administradores podem reenviar o aviso do book" });
      }
      const event = await storage.getEvent(req.params.eventId);
      if (!event) return res.status(404).json({ error: "Evento não encontrado" });

      const doEvento = await storage.getItemsByEvent(req.params.eventId);
      const comBook = doEvento.filter((i) => i.bookUrl);
      const bookUrl = comBook[0]?.bookUrl ?? null;
      if (!bookUrl) {
        return res.status(409).json({ error: "Este evento não tem book publicado para avisar." });
      }

      const aviso = await avisarBookPorEmail(req, req.params.eventId, bookUrl, comBook.length);
      try {
        await createAuditLog(req, 'updated', 'event', req.params.eventId, `Reenvio manual. ${descreverEnvio(aviso)}`);
      } catch (error) {
        console.error("[book-email] falha ao registrar o reenvio na trilha", {
          eventId: req.params.eventId,
          reason: error instanceof Error ? error.message : "erro desconhecido",
        });
      }
      res.json({ aviso, mensagem: descreverEnvio(aviso) });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // DISPARAR O AVISO DA FILA DE REVISÃO AGORA.
  //
  // O aviso é automático às 10h, 15h e 18h; esta porta existe porque ele SAI
  // do sistema e ninguém deveria precisar esperar três horas para saber se o
  // canal está de pé — o conector de e-mail só autentica dentro do ambiente
  // publicado, então testar de fora não é possível.
  //
  // Só admin, pela mesma régua do reenvio do book: um clique manda e-mail de
  // verdade. E ignora a memória da trilha de propósito, senão o segundo teste
  // do dia responderia "já enviado" sem mandar nada.
  app.post("/api/revisao/digest/enviar", requireAuth, async (req, res) => {
    try {
      if (req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas administradores podem disparar o aviso da fila de revisão" });
      }
      const r = await enviarAvisoDaRevisao(new Date(), process.env, { manual: true });
      const mensagem =
        r.status === "enviado" ? `Aviso enviado — ${r.resumo?.total} na fila, ${r.resumo?.novos} novas.`
        : r.status === "sem-fila" ? "Nada na fila de revisão agora — o aviso não é enviado quando não há o que revisar."
        : r.status === "simulado" ? "Modo de simulação ligado: o e-mail foi montado e não enviado."
        : `Aviso NÃO enviado: ${r.motivo ?? r.status}`;
      res.json({ ...r, mensagem });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ── ROTA APOSENTADA — 410 Gone ────────────────────────────────────────────
  // Era um SEGUNDO caminho de produção, paralelo a /start-production e sem
  // nenhuma das travas dele: marcava "produced" SEM teto (aceitava 999 numa
  // peça de 10), sem somar reuseQty, sem gravar quantityProduced (o número
  // ficava só na tabela production_updates, invisível para a Gráfica) e sem
  // criar os ativos de inventário. Zero callers no client — foi verificado.
  // Continua registrada, respondendo 410, para que qualquer script ou aba
  // antiga receba uma explicação em vez de um 404 mudo. Não remover sem antes
  // conferir os logs de acesso.
  app.post("/api/items/:id/production", requireAuth, async (_req, res) => {
    res.status(410).json({
      error: 'Rota descontinuada. Use PATCH /api/items/:id/start-production, que valida o teto de produção, soma o reaproveitamento e cria os ativos de inventário.',
      code: "ROUTE_GONE",
    });
  });

}
