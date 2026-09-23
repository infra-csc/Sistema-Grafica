// ─────────────────────────────────────────────────────────────────────────────
// A REGRA DO PATCH GENÉRICO DA PEÇA (PATCH /api/items/:id).
//
// A rota (server/routes/itens/edicao.ts) valida quem pode e o corpo, chama
// isto e responde. Aqui mora o que a edição FAZ: a bifurcação aumentar/reduzir
// da quantidade, o reaproveitamento, os campos derivados (m², medida, par
// visual), a frase da trilha e os avisos depois de gravar.
// ─────────────────────────────────────────────────────────────────────────────
import { insertItemSchema, type Item, type InsertItem } from "@shared/schema";
import { pecaTravada, fraseDaTrava, CODIGO_PECA_TRAVADA } from "@shared/trava-da-peca";
import { colunasDaReserva, lerReserva, reescalarReservaEPartes } from "@shared/reserva-de-impressora";
import { lerPartes } from "@shared/impressao-dividida";
import { storage } from "../storage";
import { broadcast, translateStatus } from "../routes/shared";
import { COMPLEMENT_ALLOWED_STATUSES, deriveCalculatedM2, deriveMeasurement, medidaMudou, derivarAreaVisual } from "../routes/itens/comum";

// Allow-list dos campos que o PATCH genérico /api/items/:id pode alterar.
// É uma lista deliberada e restritiva: `status` e TODOS os campos de fluxo
// (aprovação, produção, entrega, timestamps, flags de rejeição, quantidades
// produzidas/conferidas/entregues, campos "previous*") ficam de fora — eles
// só mudam pelas rotas dedicadas, que validam a transição e o papel do
// usuário. Sem esta trava, qualquer usuário autenticado poderia enviar
// PATCH { "status": "delivered" } e pular toda a máquina de estados
// (aprovação de patrocinador, revisão do criador, conferência da gráfica).
export const updateItemSchema = insertItemSchema
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
    isPriority: true,
    isReuse: true,
    approvalThumbUrl: true,
    finalFileUrl: true,
    finalFileName: true,
    referenceUrl: true,
    referenceUrls: true,
    standardItemId: true,
  })
  .partial();

export type DadosDaEdicao = ReturnType<typeof updateItemSchema.parse>;

/** A recusa que a rota devolve como está: status HTTP e corpo. */
export type RecusaDaEdicao = { recusa: { status: number; corpo: Record<string, unknown> } };
const recusa = (status: number, corpo: Record<string, unknown>): RecusaDaEdicao => ({ recusa: { status, corpo } });

/**
 * As referências (a única e a lista) normalizadas para /objects/ e com ACL do
 * dono. Muda `validatedData` no lugar, como a rota fazia.
 */
export async function normalizarReferencias(validatedData: DadosDaEdicao, donoId: string): Promise<void> {
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
        { owner: donoId, visibility: "public" }
      );
    } catch {
      // Object may not exist in storage yet (e.g. legacy/external URL) —
      // fall back to just normalizing the path without setting an ACL.
      validatedData.referenceUrl = objectStorageService.normalizeObjectEntityPath(validatedData.referenceUrl);
    }
  }

  // ── LISTA de referências (25/08): cada URL normalizada como acima, e os
  // dois campos SEMPRE em sincronia — referenceUrl é a primeira da lista,
  // que é o que as sete telas de miniatura única leem. Quando só o campo
  // antigo vem (chamador legado), a lista espelha ele: senão uma troca
  // pelo caminho velho deixaria a lista mostrando as imagens de antes.
  if (validatedData.referenceUrls !== undefined) {
    const lista = (validatedData.referenceUrls ?? []).filter(
      (u): u is string => typeof u === "string" && u.length > 0
    );
    const { ObjectStorageService } = await import("../objectStorage");
    const svc = new ObjectStorageService();
    const normalizadas: string[] = [];
    for (const url of lista) {
      try {
        normalizadas.push(await svc.trySetObjectEntityAclPolicy(url, { owner: donoId, visibility: "public" }));
      } catch {
        normalizadas.push(svc.normalizeObjectEntityPath(url));
      }
    }
    validatedData.referenceUrls = normalizadas;
    (validatedData as any).referenceUrl = normalizadas[0] ?? null;
  } else if (validatedData.referenceUrl !== undefined) {
    (validatedData as any).referenceUrls = validatedData.referenceUrl ? [validatedData.referenceUrl] : null;
  }
}

export type PlanoDaEdicao = {
  updatePayload: Partial<InsertItem>;
  mudouQtd: boolean;
  promoveuParaProduzido: boolean;
};

/**
 * O que gravar: o corpo validado mais os campos derivados — ou a recusa
 * (trava, aumento em produção, piso físico, reaproveitamento sem quantidade).
 * `corpo` é o body cru (o `reuseQty` não passa pelo schema da edição).
 */
export function planejarEdicao(
  currentItem: Item,
  validatedData: DadosDaEdicao,
  corpo: { reuseQty?: unknown } | undefined,
  mudaReuso: boolean,
): PlanoDaEdicao | RecusaDaEdicao {
  const updatePayload: Partial<InsertItem> = { ...validatedData };

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

    // TRAVA DA SOLICITAÇÃO (revisão 22/09): a peça travada não muda de
    // quantidade. Regra escolhida pela SIMPLICIDADE: qualquer mudança de
    // quantidade numa peça travada é recusada — e não só a redução que a
    // promoveria a Produzido. Calcular "faria andar?" repetiria a conta da
    // promoção abaixo e deixaria de fora os efeitos laterais (reuso que
    // encolhe, reserva/divisão de impressora reescalada). Quem trava é a
    // Solicitação, que também gerencia a lista: destrava, ajusta, trava.
    if (pecaTravada(currentItem)) {
      return recusa(409, { error: fraseDaTrava(currentItem), code: CODIGO_PECA_TRAVADA });
    }

    if (emProducao && nova > currentItem.quantity) {
      return recusa(409, {
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
    //
    // REUSO NÃO É PISO (dono, 27/08: "não está conseguindo diminuir"):
    // unidade reaproveitada não saiu da impressora — ela é registro, não
    // material novo. Reduzir a quantidade ENCOLHE o reuso junto (abaixo);
    // o piso é só o que foi IMPRESSO, conferido ou entregue.
    const impressas = currentItem.quantityProduced ?? 0;
    const reusoAtual = currentItem.reuseQty ?? 0;
    // EMBALADAS também são material físico (a embalagem com quantidade,
    // 21/09): o reaproveitamento antigo embala sem conferir.
    const piso = Math.max(impressas, currentItem.conferredQty ?? 0, (currentItem as any).embaladaQty ?? 0, currentItem.deliveredQty ?? 0);
    if (nova < piso) {
      return recusa(409, {
        error: `Não é possível reduzir para ${nova}: já há ${piso} un. impressas/conferidas/embaladas/entregues. Mínimo: ${piso}.`,
        code: "QUANTITY_FLOOR",
        minimum: piso,
      });
    }

    // O reuso encolhe para caber na quantidade nova (peça de 3 toda
    // reaproveitada indo para 1 vira reuso 1) — e isReuse acompanha, que
    // é a flag de "reuso total".
    const reusoNovo = Math.max(0, Math.min(reusoAtual, nova - impressas));
    if (reusoNovo !== reusoAtual) {
      updatePayload.reuseQty = reusoNovo;
      updatePayload.isReuse = reusoNovo >= nova;
    }

    // Promoção SÓ PARA CIMA: se a redução zera o saldo a produzir e a peça
    // está em produção, ela virou "Produzido" de fato. Cobre o caso real
    // "produzi 10 das 15 e o cliente desistiu das outras 5" — sem isto a
    // peça ficaria eternamente Em Produção com saldo fantasma. Nunca
    // rebaixa: peça entregue continua entregue.
    if (nova <= impressas + reusoNovo && (currentItem.status === "inProduction" || currentItem.status === "em_producao")) {
      updatePayload.status = "produced";
      promoveuParaProduzido = true;
    }
    // Peça dividida entre impressoras: a soma dos `atrib` acompanha o novo
    // teto (senão a divisão fica impossível de fechar). Produzida → sem divisão.
    // A reserva por impressora também: o que excede sai primeiro do que
    // está sem impressora, depois da reserva, e só então das partes.
    if (lerPartes(currentItem.impressaoPorMaquina) || lerReserva(currentItem.reservaPorMaquina) || currentItem.maquinaPrevista) {
      const r = reescalarReservaEPartes(currentItem, nova - reusoNovo);
      if (lerPartes(currentItem.impressaoPorMaquina)) updatePayload.impressaoPorMaquina = promoveuParaProduzido ? null : r.partes;
      Object.assign(updatePayload, colunasDaReserva(promoveuParaProduzido ? null : r.reserva, currentItem.reservaPorMaquina));
    }
  }

  // REAPROVEITAMENTO pelo PATCH: a flag sozinha deixava a peça "reaproveitada"
  // com reuseQty 0 — as telas que somam unidades reaproveitadas liam zero,
  // e a Gráfica recebia para imprimir o que era para sair do estoque. Ligar
  // exige dizer QUANTAS (reuseQty); a flag `isReuse` continua sendo o
  // "reaproveita tudo", derivada da quantidade.
  if (mudaReuso) {
    const quantidadeFinal = Number(updatePayload.quantity ?? currentItem.quantity);
    if (validatedData.isReuse) {
      const pedida = Number(corpo?.reuseQty);
      const cabe = quantidadeFinal - (currentItem.quantityProduced ?? 0);
      if (!Number.isInteger(pedida) || pedida < 1) {
        return recusa(400, { error: "Para marcar reaproveitamento, informe quantas unidades saem do estoque (reuseQty)." });
      }
      if (pedida > cabe) {
        return recusa(400, { error: `Reaproveitamento de ${pedida} un. não cabe: a peça tem ${cabe} un. ainda não impressas.` });
      }
      updatePayload.reuseQty = pedida;
      updatePayload.isReuse = pedida >= quantidadeFinal;
    } else {
      // Desligar depois que a Gráfica pegou a peça é CORRIGIR o que ela
      // lançou — isso tem rota própria, que confere o que já saiu.
      if (COMPLEMENT_ALLOWED_STATUSES.includes(currentItem.status)) {
        return recusa(409, { error: "A peça já está na produção — quem corrige o reaproveitamento é a Gráfica (Corrigir reaproveitamento)." });
      }
      updatePayload.reuseQty = 0;
      updatePayload.isReuse = false;
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

  return { updatePayload, mudouQtd, promoveuParaProduzido };
}

/** A frase da trilha: o diff dos campos que mudaram (ou "atualizado"). */
export function descreverEdicao(
  currentItem: Item,
  item: Item,
  validatedData: DadosDaEdicao,
  { mudaReuso, mudouQtd, promoveuParaProduzido }: { mudaReuso: boolean; mudouQtd: boolean; promoveuParaProduzido: boolean },
): string {
  // Create audit log - build descriptive diff of changed fields
  const changedParts: string[] = [];

  if (item.status !== currentItem.status) {
    changedParts.push(`Status: ${translateStatus(currentItem.status)} → ${translateStatus(item.status)}`);
  }
  if (mudaReuso) {
    changedParts.push((item.reuseQty ?? 0) > 0
      ? `Marcado para reaproveitamento: ${item.reuseQty} de ${item.quantity} un.`
      : "Reaproveitamento removido");
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
  // A redução encolheu o reuso junto — a trilha diz, senão o número some
  // em silêncio e seis meses depois vira "quem apagou o reaproveitamento?"
  if (mudouQtd && (item.reuseQty ?? 0) !== (currentItem.reuseQty ?? 0)) {
    changedParts.push(`Reaproveitamento encolheu com a redução: ${currentItem.reuseQty ?? 0} → ${item.reuseQty ?? 0} un.`);
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
    // O TEXTO vai para a trilha, não só "atualizadas": o recado para a
    // Gráfica sai da vista quando a peça é liberada (some da Revisão
    // Final), e uma devolução posterior grava o motivo por cima. Sem
    // isto, não havia onde reler o que foi escrito.
    const recado = (item.observations ?? "").trim();
    changedParts.push(recado ? `Observações: "${recado.length > 300 ? `${recado.slice(0, 300)}...` : recado}"` : "Observações apagadas");
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
  if ('isPriority' in validatedData && item.isPriority !== currentItem.isPriority) {
    changedParts.push(item.isPriority ? "Peça marcada como PRIORITÁRIA — fura a fila da Arte" : "Prioridade da peça removida");
  }

  const auditDetails = changedParts.length > 0
    ? changedParts.join(" | ")
    : `Item "${item.type}" atualizado`;
  return auditDetails;
}

/** Os avisos depois de gravar: prioridade nova (Arte) e redução em produção (Gráfica). */
export async function avisarDepoisDaEdicao(currentItem: Item, item: Item, validatedData: DadosDaEdicao, mudouQtd: boolean): Promise<void> {
  // A Arte é avisada NA HORA em que a peça vira prioritária (dono, 27/08)
  // — só na transição para true; desmarcar não gera aviso, e editar outros
  // campos de uma peça já prioritária também não repete o alarme.
  if ('isPriority' in validatedData && item.isPriority && !currentItem.isPriority) {
    const eventoDaPeca = await storage.getEvent(item.eventId);
    const avisoPrioridade = await storage.createNotification({
      type: "itemPriority",
      message: `PEÇA PRIORITÁRIA: ${item.displayId} ${item.type} - Evento: ${eventoDaPeca?.name ?? "—"} — fura a fila da Arte`,
      eventId: item.eventId,
      itemId: item.id,
      targetRoles: ["arte"],
    });
    broadcast({ type: "notification_created", notification: avisoPrioridade });
  }

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
}
