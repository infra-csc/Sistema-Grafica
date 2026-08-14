// ─────────────────────────────────────────────────────────────────────────────
// MOTOR DO HISTÓRICO — sintetiza a trilha de auditoria a partir de 3 fontes
// (tabela de eventos, tabela de peças e audit logs).
//
// Vive fora de historico.tsx e sem NENHUM import (nem React, nem lucide, nem
// date-fns) por um motivo: o reconhecimento de tipo é feito casando FRASE EM
// PORTUGUÊS gravada pelo servidor ("→ Aguardando Aprovação", "conferência",
// "reaproveitamento"). Trocar uma palavra numa rota do servidor apagava
// registros de auditoria em produção — sem erro, sem log e sem teste vermelho.
// Sendo função pura e sem dependências, server/__tests__/timeline.test.ts
// cobre os 30+ tipos com amostras REAIS de `details` copiadas do servidor, e a
// próxima troca de palavra quebra o CI em vez do histórico.
//
// REGRA CENTRAL: todo log de item/evento que chega aqui produz ALGUMA linha.
// O caminho de saída sem `push` não existe mais — log não reconhecido vira
// entrada genérica com o `details` cru. Uma linha feia é sempre melhor que um
// buraco silencioso numa auditoria.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * DE ONDE VEM O AUTOR DA LINHA — e por que a distinção não é cosmética.
 *
 * A trilha tem duas naturezas de linha misturadas na mesma lista:
 *
 *   • linha de REGISTRO — nasceu de audit_logs, tem autor gravado no ato;
 *   • linha RECONSTRUÍDA — o cliente a sintetizou de um carimbo da própria
 *     peça (`productionStartedAt`, `deliveredAt`, `creatorReviewedAt`…).
 *     Carimbo é data, não é gente: NUNCA houve autor para consultar aqui.
 *
 * Antes as duas terminavam iguais na tela — um traço na coluna "Realizado por"
 * — e o filtro juntava as duas debaixo de "Sem autor registrado". Com ~90% da
 * lista sendo reconstrução, a leitura que sobrava era "o sistema não sabe quem
 * fez quase nada", quando a frase honesta é "esta linha nunca foi um registro".
 *
 * `system` é a terceira: ação AUTOMÁTICA (derivação de status, cron, importação
 * sem sessão) gravada explicitamente como "Sistema". É uma afirmação, e não
 * pode ser lida como ausência.
 *
 * `unrecorded` é a quarta e a única de fato ruim: existe registro e ele está
 * sem nome. Não deveria mais acontecer (o servidor grava "Sistema" no pior
 * caso), e o valor existe justamente para que o dia em que voltar a acontecer
 * seja contável na tela em vez de se esconder no meio das reconstruções.
 */
export type AuthorSource = "log" | "system" | "derived" | "unrecorded";

export interface TimelineEvent {
  id: string;
  type: string;
  timestamp: Date;
  eventName: string;
  /** Vazio quando o evento não existe mais (exclusão) — a linha não navega. */
  eventId: string;
  itemType?: string;
  itemId?: string;
  itemDisplayId?: string;
  quantity?: number;
  quantityProduced?: number;
  receivedBy?: string;
  userName?: string;
  /**
   * Identidade que RESISTE. Nome muda e repete; o id não. Vem de audit_logs
   * (coluna que existia e era sempre nula) — ausente nas linhas antigas e em
   * toda linha reconstruída.
   */
  userId?: string;
  authorSource: AuthorSource;
  sponsorCount?: number;
  logDetails?: string;
  /** A peça não está mais em /api/items (excluída) — a linha marca "(peça excluída)". */
  itemMissing?: boolean;
  /** Log agregado de LOTE (n peças de uma vez), não de uma peça específica. */
  batchCount?: number;
  /**
   * Blob minúsculo com todos os campos textuais, pré-computado uma vez por
   * dataset. A busca comparava 5 campos com `toLowerCase()` por entrada A CADA
   * TECLA — e mesmo assim não cobria o `logDetails`, que é justamente o texto
   * que a tela renderiza (nome do patrocinador, motivo da reprovação).
   */
  searchBlob: string;
}

type AnyLog = Record<string, any>;

/** Lê campo aceitando camelCase e snake_case (o payload já veio dos dois jeitos). */
function pick(log: AnyLog, camel: string, snake: string): any {
  return log[camel] ?? log[snake];
}

/**
 * Log agregado de lote: `12 itens clonados…`, `30 itens: Status alterado…`.
 * Gravados com entityType 'item' mas entityId do EVENTO.
 */
const BATCH_RE = /^(\d+)\s+(itens|item|peças|peça)\b/i;

/** displayId real é `ITEM-001` (schema.ts) — o `#123` do parser antigo não existe. */
const DISPLAY_ID_RE = /\b(ITEM-\d+)\b/i;

/** Autor explícito das ações automáticas — o mesmo literal de server/routes/shared.ts. */
const SYSTEM_ACTOR = "Sistema";

/**
 * Autoria de uma linha a partir do log que a originou (ou da falta dele).
 *
 * Um único lugar decide: sem log é reconstrução, log sem nome é registro
 * incompleto, "Sistema" é máquina, o resto é gente. Antes cada `push` copiava
 * `userName` na mão e três deles simplesmente não copiavam nada.
 */
function autoria(log: AnyLog | undefined | null): {
  userName?: string;
  userId?: string;
  authorSource: AuthorSource;
} {
  if (!log) return { authorSource: "derived" };
  const nome = String(pick(log, "userName", "user_name") ?? "").trim();
  const userId = pick(log, "userId", "user_id") || undefined;
  if (!nome) return { userId, authorSource: "unrecorded" };
  if (nome === SYSTEM_ACTOR) return { userName: nome, userId, authorSource: "system" };
  return { userName: nome, userId, authorSource: "log" };
}

export function buildTimeline(
  events: any[],
  items: any[],
  auditLogs: any[],
): TimelineEvent[] {
  /* ── Mapas de lookup ── */

  // Chave inclui o entityType de propósito. Sem ele, `${eventoId}-created`
  // colidia com os logs de LOTE (clonagem e envio para vinculação), que gravam
  // entityType 'item' com o id do EVENTO — e a linha "Evento Criado" passava a
  // creditar quem clonou peças meses depois.
  // Os logs chegam em createdAt DESC (storage.getAuditLogs), então sobrescrever
  // a cada passagem deixa no mapa o MAIS ANTIGO — que é o que "primeiro log
  // desta entidade" sempre quis dizer.
  const auditLogMap = new Map<string, AnyLog>();
  auditLogs.forEach((log) => {
    const entityType = String(pick(log, "entityType", "entity_type") ?? "").toLowerCase();
    const entityId = pick(log, "entityId", "entity_id");
    auditLogMap.set(`${entityType}:${entityId}:${(log.action || "").toLowerCase()}`, log);
  });

  const itemMap = new Map<string, any>();
  items.forEach((item) => itemMap.set(item.id, item));

  // events.find(...) por item era O(n×m); o Map torna cada lookup O(1).
  const eventMap = new Map<string, any>();
  // Nome → id: a linha de exclusão de peça só tem o NOME do evento no texto do
  // log (a peça já saiu de /api/items), e sem o id ela não navega para lugar
  // nenhum. Nomes repetidos são resolvidos pelo primeiro — é melhor que nada.
  const eventIdByName = new Map<string, string>();
  events.forEach((event) => {
    eventMap.set(event.id, event);
    const key = String(event.name ?? "").trim().toLowerCase();
    if (key && !eventIdByName.has(key)) eventIdByName.set(key, event.id);
  });

  const timeline: Omit<TimelineEvent, "searchBlob">[] = [];

  // Pré-varredura: as entradas sintéticas derivadas da tabela de peças só
  // existem como fallback de peças legadas — quando há log de verdade, quem
  // manda é o log (tem autor e timestamp reais).
  const itemsWithRelease = new Set<string>();
  const itemsWithProduction = new Set<string>();
  auditLogs.forEach((log: AnyLog) => {
    const action = (log.action || "").toLowerCase();
    const details = log.details || "";
    const detailsLower = details.toLowerCase();
    const entityId = pick(log, "entityId", "entity_id");
    if (!entityId) return;
    // Casar SÓ a frase "liberado para produção" deixava de fora três redações
    // que também são liberação: a de /api/items/:id/approve ("aprovado para
    // produção", ainda gravada em milhares de linhas antigas) e as duas de
    // reaproveitamento do /creator-review. Nesses casos o log existia, a peça
    // seguia parecendo "sem liberação registrada", e o cliente emitia POR CIMA
    // a linha sintética SEM AUTOR — a mesma ação contada duas vezes, uma delas
    // anônima. O critério agora é por AÇÃO, excluindo o que é aprovação de
    // patrocinador (que também grava 'approved' e sempre cita o patrocinador).
    if (
      action === "approved" &&
      !detailsLower.includes("patrocinador") &&
      !detailsLower.includes("aprovou")
    ) {
      itemsWithRelease.add(entityId);
    }
    if (action === "production" || action === "produced") {
      itemsWithProduction.add(entityId);
    }
  });

  /* ── Entradas sintéticas das tabelas de eventos e peças ── */
  events.forEach((event) => {
    const log = auditLogMap.get(`event:${event.id}:created`);
    timeline.push({
      id: `event-${event.id}`,
      type: "event_created",
      timestamp: new Date(event.createdAt),
      eventName: event.name,
      eventId: event.id,
      ...autoria(log),
    });
  });

  items.forEach((item) => {
    const event = eventMap.get(item.eventId);
    const eventName = event?.name || "Evento desconhecido";
    // Peças importadas via Excel antigas só têm o log agregado no evento —
    // usa-o como fallback para não exibir "—" como autor de tudo.
    const createdLog =
      auditLogMap.get(`item:${item.id}:created`) ??
      auditLogMap.get(`item:${item.eventId}:created`);

    timeline.push({
      id: `item-created-${item.id}`,
      type: "item_created",
      timestamp: new Date(item.createdAt),
      eventName,
      eventId: item.eventId,
      itemType: item.type,
      itemId: item.id,
      itemDisplayId: item.displayId,
      quantity: item.quantity,
      ...autoria(createdLog),
    });

    // "Peça Liberada" sintética — só para peças SEM log de liberação.
    //
    // O timestamp era `item.approvedAt || item.updatedAt`, e `updatedAt` é
    // reescrito a CADA gravação na peça: a linha migrava sozinha na ordem
    // cronológica e podia ultrapassar a própria entrega. `creatorReviewedAt` é
    // o carimbo REAL do fluxo atual (items.ts grava junto com a liberação);
    // `approvedAt` só existe no fluxo antigo. Sem nenhum dos dois, a linha não
    // é emitida — melhor não afirmar do que afirmar data errada.
    //
    // E sem autor: esta linha só é emitida quando NÃO existe log de liberação
    // nesta consulta, ou seja, não há de quem herdar autoria. Não é "não
    // sabemos quem fez" — é uma linha reconstruída do carimbo da peça, e é
    // assim (authorSource: "derived") que ela se declara para a tela.
    const releasedAt = item.approvedAt ?? item.creatorReviewedAt;
    if (
      ["approved", "inProduction", "produced", "delivered"].includes(item.status) &&
      !itemsWithRelease.has(item.id) &&
      releasedAt
    ) {
      timeline.push({
        id: `item-approved-${item.id}`,
        type: "item_released",
        timestamp: new Date(releasedAt),
        eventName,
        eventId: item.eventId,
        itemType: item.type,
        itemId: item.id,
        itemDisplayId: item.displayId,
        quantity: item.quantity,
        authorSource: "derived",
      });
    }

    // Mesma regra para produção: só com `productionStartedAt` real.
    if (
      item.quantityProduced &&
      item.quantityProduced > 0 &&
      !itemsWithProduction.has(item.id) &&
      item.productionStartedAt
    ) {
      timeline.push({
        id: `production-${item.id}`,
        type: "production_started",
        timestamp: new Date(item.productionStartedAt),
        eventName,
        eventId: item.eventId,
        itemType: item.type,
        itemId: item.id,
        itemDisplayId: item.displayId,
        quantity: item.quantity,
        quantityProduced: item.quantityProduced,
        authorSource: "derived",
      });
    }

    if (item.status === "delivered" && item.deliveredAt) {
      const log = auditLogMap.get(`item:${item.id}:delivered`);
      timeline.push({
        id: `delivered-${item.id}`,
        type: "item_delivered",
        timestamp: new Date(item.deliveredAt),
        eventName,
        eventId: item.eventId,
        itemType: item.type,
        itemId: item.id,
        itemDisplayId: item.displayId,
        receivedBy: item.receivedBy,
        ...autoria(log),
      });
    }
  });

  /* ── Audit logs ── */
  auditLogs.forEach((log: AnyLog) => {
    const action = (log.action || "").toLowerCase();
    const details = log.details || "";
    const detailsLower = details.toLowerCase();
    const entityId = pick(log, "entityId", "entity_id");
    const entityType = String(pick(log, "entityType", "entity_type") ?? "").toLowerCase();
    const ts = pick(log, "createdAt", "created_at");
    const autor = autoria(log);
    const uid = log.id ?? `${entityId}${ts}`;

    /* ── Logs de EVENTO ── */
    if (entityType === "event") {
      const ev = eventMap.get(entityId);
      // O evento excluído some da tabela (hard delete + cascade nas peças), então
      // o NOME só existe no texto do próprio log — é o último rastro que sobra.
      const nameFromDetails = details.match(/[Ee]vento "(.+?)"/)?.[1];
      const eventBase = {
        timestamp: new Date(ts),
        eventName: ev?.name || nameFromDetails || "Evento desconhecido",
        eventId: ev ? entityId : "",
        ...autor,
        logDetails: details,
      };

      if (detailsLower.includes("book")) {
        const qtd = details.match(/(\d+)\s+pe/i)?.[1];
        timeline.push({
          id: `book-${uid}`,
          type: "book_sent",
          ...eventBase,
          itemId: entityId,
          quantity: qtd ? parseInt(qtd, 10) : undefined,
        });
        return;
      }

      if (action === "deleted") {
        timeline.push({ id: `event-deleted-${uid}`, type: "event_deleted", ...eventBase, eventId: "" });
        return;
      }

      // ENCERRAR / REABRIR — a única ação HUMANA sobre o ciclo de vida do
      // evento, e a que muda mais coisa de lugar: o evento sai (ou volta) da
      // Gestão de Prazos e das cinco filas de trabalho de uma vez.
      //
      // Ambas são gravadas com action "updated" (POST /api/events/:id/close e
      // /reopen), então caíam no balde genérico logo abaixo e a linha aparecia
      // como "Evento Alterado" — o rótulo mais morno possível para a decisão
      // mais cara do módulo. Pior: o `tail` do genérico procura o prefixo
      // "...atualizado", que não existe nestas duas frases, e devolvia o
      // `details` inteiro — a tela dizia "Evento X alterado — Evento "X"
      // ENCERRADO manualmente…", repetindo o nome do evento na mesma linha.
      //
      // Casa por FRASE porque é só isso que o log carrega. As duas palavras-
      // chave são maiúsculas e únicas no vocabulário de logs de evento; o teste
      // em server/__tests__/historico-timeline.test.ts guarda as duas com
      // amostras reais copiadas de server/routes/events.ts.
      if (action === "updated" && detailsLower.includes("encerrado manualmente")) {
        timeline.push({ id: `event-closed-${uid}`, type: "event_closed", ...eventBase });
        return;
      }
      if (action === "updated" && detailsLower.includes("reaberto")) {
        timeline.push({ id: `event-reopened-${uid}`, type: "event_reopened", ...eventBase });
        return;
      }

      if (detailsLower.includes("prioridade do evento")) {
        timeline.push({ id: `event-priority-${uid}`, type: "event_priority", ...eventBase });
        return;
      }

      if (action === "updated") {
        // Inclui a mudança da data de saída do caminhão — a âncora de todos os
        // prazos da casa e a pergunta de auditoria mais cara do sistema. Era
        // descartada em silêncio junto com todo o resto dos logs de evento.
        timeline.push({ id: `event-updated-${uid}`, type: "event_updated", ...eventBase });
        return;
      }

      if (action === "created") {
        // A entrada sintética da tabela de eventos já cobre os eventos vivos;
        // só emite aqui quando o evento não existe mais (foi excluído).
        if (ev) return;
        timeline.push({ id: `event-created-${uid}`, type: "event_created", ...eventBase, eventId: "" });
        return;
      }

      timeline.push({ id: `event-other-${uid}`, type: "activity", ...eventBase });
      return;
    }

    /* ── Só logs de peça daqui para baixo ── */
    if (entityType !== "item") return;

    const item = itemMap.get(entityId);
    const event = item ? eventMap.get(item.eventId) : null;

    // Peça excluída (soft delete) sai de /api/items: nome do evento, tipo e
    // código só sobrevivem dentro do texto do log.
    const eventNameFromDetails =
      details.match(/(?:do|no) evento "(.+?)"/i)?.[1] ?? details.match(/evento "(.+?)"/i)?.[1];
    const itemTypeFromDetails =
      details.match(/(?:Peça|Item|peça) "(.+?)"/i)?.[1] || details.match(/^"(.+?)"/)?.[1];
    const displayIdFromDetails = details.match(DISPLAY_ID_RE)?.[1];

    const eventName = event?.name || eventNameFromDetails || "Evento desconhecido";
    const resolvedType = item?.type || itemTypeFromDetails;
    const resolvedId = item?.displayId || displayIdFromDetails;
    // Sem o item em mãos, o id do evento é recuperado pelo NOME que o servidor
    // grava no details — é o que devolve a navegação à linha de exclusão.
    const resolvedEventId =
      item?.eventId ||
      (eventNameFromDetails ? eventIdByName.get(eventNameFromDetails.trim().toLowerCase()) : undefined) ||
      "";

    const base = {
      timestamp: new Date(ts),
      eventName,
      eventId: resolvedEventId,
      itemType: resolvedType,
      itemId: entityId,
      itemDisplayId: resolvedId,
      quantity: item?.quantity,
      ...autor,
      logDetails: details,
      itemMissing: !item,
    };

    // COMPLEMENTO — no TOPO do encadeamento, de propósito. O motivo do aumento
    // é TEXTO LIVRE escrito por uma pessoa: um motivo que contenha
    // "reaproveitamento" ou "conferência" cairia num dos casamentos por palavra
    // logo abaixo e o aumento apareceria disfarçado de outra coisa. Casando por
    // AÇÃO exata antes de todos eles, isso não tem como acontecer.
    if (action === "complement_created" || action === "complement_canceled") {
      timeline.push({
        id: `complement-${uid}`,
        type: action === "complement_created" ? "item_complement_created" : "item_complement_canceled",
        ...base,
        itemType: resolvedType || "Peça",
      });
      return;
    }

    // Produção da Gráfica. Cada lançamento vira uma entrada — produções
    // parciais aparecem uma a uma, e a que fecha a quantidade entra como
    // "Produzido".
    if (action === "production" || action === "produced") {
      const produced = Number(details.match(/Produção:\s*(\d+)/)?.[1]) || undefined;
      timeline.push({
        id: `production-${uid}`,
        type: action === "produced" ? "item_produced" : "production_started",
        ...base,
        quantityProduced: produced,
      });
      return;
    }

    // Reaproveitamento marcado pela Gráfica (total ou parcial).
    if (detailsLower.includes("reaproveitamento")) {
      // Correção de marcação errada precisa ser rastreável: é uma peça que
      // voltou para a produção depois de ter sido dada como reaproveitada.
      const corrected =
        detailsLower.includes("corrigido") || detailsLower.includes("removido por correção");
      timeline.push({
        id: `reuse-${uid}`,
        type: corrected
          ? "item_reuse_corrected"
          : detailsLower.includes("parcial")
            ? "item_reused_partial"
            : "item_reused",
        ...base,
      });
      return;
    }

    if (detailsLower.includes("conferência")) {
      timeline.push({ id: `conferred-${uid}`, type: "item_conferred", ...base });
      return;
    }

    if (detailsLower.includes("item cancelado")) {
      timeline.push({ id: `canceled-${uid}`, type: "item_canceled", ...base });
      return;
    }

    if (
      detailsLower.includes("devolvido para arte") ||
      detailsLower.includes("devolvida para arte") ||
      detailsLower.includes("devolvido para criação")
    ) {
      timeline.push({ id: `returned-${uid}`, type: "item_returned", ...base });
      return;
    }

    // As três seguintes perderam o `if (!item) return`: quando a peça é
    // excluída, vinculação/thumb/arquivo final sumiam e o histórico dela ficava
    // com "Peça Adicionada" e "Excluído" e nada entre os dois.
    if (action === "updated" && detailsLower.includes("patrocinadores atualizados")) {
      const match = details.match(/(\d+)\s+patrocinador/i);
      timeline.push({
        id: `sponsor-linked-${uid}`,
        type: "sponsor_linked",
        ...base,
        sponsorCount: match ? parseInt(match[1], 10) : undefined,
      });
      return;
    }

    // Arte devolveu versão nova do thumb aos patrocinadores. Não contém "thumb
    // de aprovação atualizado", então caía fora de todos os padrões.
    if (action === "updated" && detailsLower.includes("nova versão do thumb")) {
      const n = details.match(/para\s+(\d+)\s+patrocinador/i)?.[1];
      timeline.push({
        id: `thumb-newver-${uid}`,
        type: "thumb_new_version",
        ...base,
        sponsorCount: n ? parseInt(n, 10) : undefined,
      });
      return;
    }

    if (action === "updated" && detailsLower.includes("thumb de aprovação atualizado")) {
      const isReplacement = /anterior:/i.test(details);
      timeline.push({
        id: `thumb-${uid}`,
        type: isReplacement ? "thumb_replaced" : "thumb_uploaded",
        ...base,
      });
      return;
    }

    if (
      action === "updated" &&
      detailsLower.includes("arquivo final") &&
      /adicionad|atualizad|substituíd|substituid|propagad/i.test(detailsLower)
    ) {
      const isReplacement = /substitu|atualizad|propagad/i.test(detailsLower);
      timeline.push({
        id: `final-${uid}`,
        type: isReplacement ? "final_file_replaced" : "final_file_added",
        ...base,
      });
      return;
    }

    // Reversão de aprovação por administrador — a ação mais sensível de todo o
    // fluxo de aprovação e, até aqui, invisível para quem não é admin.
    if (action === "updated" && detailsLower.includes("reverteu a aprovação")) {
      timeline.push({ id: `approval-reverted-${uid}`, type: "approval_reverted", ...base });
      return;
    }

    // Envio para aprovação de patrocinador (fluxo padrão).
    if (
      action === "updated" &&
      detailsLower.includes("status alterado") &&
      details.includes("→ Aguardando Aprovação")
    ) {
      timeline.push({ id: `sent-${uid}`, type: "item_sent", ...base });
      return;
    }

    // Envio COM aprovação dispensada: o destino é "Aguardando Revisão Final",
    // então o teste de "→ Aguardando Aprovação" acima nunca casava.
    if (action === "updated" && detailsLower.includes("sem aprovação de patrocinador")) {
      timeline.push({ id: `sent-noapp-${uid}`, type: "item_sent_no_approval", ...base });
      return;
    }

    // Edição de peça (quantidade, dimensões, material…). O log existe no banco
    // desde sempre e a tela respondia "nada aconteceu".
    if (action === "updated" && detailsLower.startsWith("item editado")) {
      timeline.push({ id: `edited-${uid}`, type: "item_edited", ...base });
      return;
    }

    if (action === "approved" && (detailsLower.includes("patrocinador") || detailsLower.includes("aprovou"))) {
      // "liberado para produção" é liberação do criador, não aprovação de patrocinador.
      if (!detailsLower.includes("liberado para produção")) {
        timeline.push({ id: `sp-approved-${uid}`, type: "sponsor_approved", ...base });
        return;
      }
    }

    if (action === "rejected") {
      // Das rotas que gravam 'rejected', DUAS são reprovação interna (criador /
      // Solicitação). Tudo caía como "Pat. Reprovou": a pill acusava o cliente
      // de ter reprovado uma peça que a própria casa reprovou, e o filtro
      // inflava a contagem de reprovações de patrocinador.
      const byCreator = detailsLower.includes("criador");
      timeline.push({
        id: `${byCreator ? "cr" : "sp"}-rejected-${uid}`,
        type: byCreator ? "item_rejected_creator" : "sponsor_rejected",
        ...base,
      });
      return;
    }

    if (action === "approved" && detailsLower.includes("liberado para produção")) {
      timeline.push({ id: `released-${uid}`, type: "item_released", ...base });
      return;
    }

    if (action === "approved") {
      // Restante de 'approved' (ex.: mudança de status para reaproveitamento
      // total no creator-review) — não perde a linha por não casar frase.
      timeline.push({ id: `approved-${uid}`, type: "item_released", ...base });
      return;
    }

    if (action === "dispensed") {
      timeline.push({ id: `dispensed-${uid}`, type: "item_dispensed", ...base });
      return;
    }

    if (action === "restored") {
      timeline.push({
        id: `restored-${uid}`,
        type: "item_restored",
        ...base,
        itemType: resolvedType || "Peça",
      });
      return;
    }

    if (action === "canceled") {
      timeline.push({ id: `canceled-${uid}`, type: "item_canceled", ...base });
      return;
    }

    if (action === "deleted") {
      timeline.push({
        id: `deleted-${uid}`,
        type: "item_deleted",
        ...base,
        itemType: resolvedType || "Peça",
      });
      return;
    }

    if (action === "created") {
      if (item) return; // a entrada sintética da tabela de peças já cobre
      // Logs AGREGADOS de lote gravam entityType 'item' com o id do EVENTO:
      // clonagem de peças e envio em lote para vinculação. O guard antigo
      // (`if (eventMap.has(itemId)) return`) dizia limpar "importações antigas"
      // e apagava esses dois marcos correntes do fluxo junto.
      const batch = details.match(BATCH_RE);
      if (eventMap.has(entityId)) {
        const ev = eventMap.get(entityId);
        const commonBatch = {
          timestamp: new Date(ts),
          eventName: ev?.name || eventName,
          eventId: entityId,
          ...autor,
          logDetails: details,
          batchCount: batch ? parseInt(batch[1], 10) : undefined,
        };
        if (/clonad/i.test(details)) {
          timeline.push({ id: `batch-cloned-${uid}`, type: "items_cloned", ...commonBatch });
        } else if (/vincula/i.test(details)) {
          timeline.push({ id: `batch-submitted-${uid}`, type: "items_submitted", ...commonBatch });
        } else {
          timeline.push({ id: `batch-${uid}`, type: "items_batch", ...commonBatch });
        }
        return;
      }
      timeline.push({
        id: `item-created-log-${uid}`,
        type: "item_created",
        ...base,
        itemType: resolvedType || "Peça",
      });
      return;
    }

    // Fim da linha: NUNCA descartar. Entrada genérica com o details cru.
    timeline.push({ id: `activity-${uid}`, type: "activity", ...base });
  });

  /* ── searchBlob + ordenação ── */
  return timeline
    .map((e) => ({
      ...e,
      searchBlob: [
        e.eventName,
        e.userName,
        e.itemType,
        e.itemDisplayId,
        e.receivedBy,
        e.logDetails,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase(),
    }))
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
}
