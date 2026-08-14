// Testes do MOTOR DO HISTÓRICO (client/src/lib/timeline.ts).
//
// PORQUÊ: o reconhecimento de tipo é feito casando FRASE EM PORTUGUÊS gravada
// pelo servidor ("→ Aguardando Aprovação", "conferência", "reaproveitamento",
// "(reprovado pelo criador)"). Os comentários do código registravam que esse
// mecanismo já havia falhado em silêncio duas vezes; a revisão encontrou mais
// sete classes de log engolidas e uma atribuída ao ator errado — nove falhas do
// mesmo mecanismo, e zero testes.
//
// Todo `details` usado aqui é uma amostra REAL, copiada de server/routes/*.ts.
// Trocar uma palavra lá passa a quebrar o CI em vez de apagar auditoria em
// produção.
import { describe, it, expect } from "vitest";
import { buildTimeline, type TimelineEvent } from "@/lib/timeline";

const EV_ID = "evt-1";
const EV2_ID = "evt-2";
const IT_ID = "item-1";

const evento = {
  id: EV_ID,
  name: "Maratona de São Paulo",
  createdAt: "2026-07-01T10:00:00.000Z",
};

const evento2 = {
  id: EV2_ID,
  name: "Circuito Estações",
  createdAt: "2026-07-02T10:00:00.000Z",
};

const peca = {
  id: IT_ID,
  eventId: EV_ID,
  displayId: "ITEM-023",
  type: "Banner 2x1",
  quantity: 10,
  status: "awaiting_approval",
  createdAt: "2026-07-05T09:00:00.000Z",
  updatedAt: "2026-08-14T09:00:00.000Z",
};

let seq = 0;
function log(over: Partial<Record<string, any>> = {}) {
  seq += 1;
  return {
    id: `log-${seq}`,
    userName: "Ana Souza",
    action: "updated",
    entityType: "item",
    entityId: IT_ID,
    details: "",
    createdAt: "2026-08-10T12:00:00.000Z",
    ...over,
  };
}

/** Constrói e devolve as entradas por tipo, para asserções curtas. */
function typesOf(tl: TimelineEvent[]): string[] {
  return tl.map(e => e.type);
}
function find(tl: TimelineEvent[], type: string): TimelineEvent | undefined {
  return tl.find(e => e.type === type);
}

describe("buildTimeline — nunca descarta um log em silêncio", () => {
  it("log de peça com ação e texto desconhecidos vira entrada genérica com o details cru", () => {
    const tl = buildTimeline([evento], [peca], [
      log({ action: "teleported", details: "Peça teletransportada para 2027" }),
    ]);
    const generico = find(tl, "activity");
    expect(generico).toBeDefined();
    expect(generico!.logDetails).toBe("Peça teletransportada para 2027");
  });

  it("log de evento com ação desconhecida também produz linha", () => {
    const tl = buildTimeline([evento], [], [
      log({ entityType: "event", entityId: EV_ID, action: "archived", details: 'Evento "Maratona de São Paulo" arquivado' }),
    ]);
    expect(typesOf(tl)).toContain("activity");
  });

  it("logs de entidades fora do escopo (user, sponsor) continuam fora da tela", () => {
    const tl = buildTimeline([], [], [
      log({ entityType: "user", entityId: "u1", action: "created", details: "Usuário criado" }),
      log({ entityType: "sponsor", entityId: "s1", action: "updated", details: "Patrocinador atualizado" }),
    ]);
    expect(tl).toHaveLength(0);
  });
});

describe("buildTimeline — logs de EVENTO deixaram de ser descartados", () => {
  it("alteração de evento (incluindo a data de saída do caminhão) vira event_updated", () => {
    const tl = buildTimeline([evento], [], [
      log({
        entityType: "event", entityId: EV_ID, action: "updated",
        details: 'Evento "Maratona de São Paulo" atualizado — Saída do caminhão: 12/08/2026 08:00 → 10/08/2026 08:00',
      }),
    ]);
    const e = find(tl, "event_updated");
    expect(e).toBeDefined();
    expect(e!.eventId).toBe(EV_ID);
    expect(e!.logDetails).toContain("Saída do caminhão");
  });

  it("prioridade do evento vira event_priority, não event_updated", () => {
    const tl = buildTimeline([evento], [], [
      log({
        entityType: "event", entityId: EV_ID, action: "updated",
        details: 'Prioridade do evento "Maratona de São Paulo" definida como "urgente"',
      }),
    ]);
    expect(typesOf(tl)).toContain("event_priority");
    expect(typesOf(tl)).not.toContain("event_updated");
  });

  it("exclusão de evento aparece, sem link (o evento não existe mais)", () => {
    const tl = buildTimeline([], [], [
      log({
        entityType: "event", entityId: EV_ID, action: "deleted",
        details: 'Evento "Maratona de São Paulo" excluído — 128 peças removidas em cascata (96 já entregues), junto com fotos de entrega, comentários e aprovações de patrocinador',
      }),
    ]);
    const e = find(tl, "event_deleted");
    expect(e).toBeDefined();
    expect(e!.eventName).toBe("Maratona de São Paulo");
    expect(e!.eventId).toBe("");
  });

  it("book de aprovação continua sendo book_sent e não vira event_updated", () => {
    const tl = buildTimeline([evento], [], [
      log({ entityType: "event", entityId: EV_ID, action: "updated", details: "Book de aprovação vinculado a 12 peça(s)" }),
    ]);
    const e = find(tl, "book_sent");
    expect(e).toBeDefined();
    expect(e!.quantity).toBe(12);
  });

  // ENCERRAR × REABRIR — as duas ações HUMANAS sobre o ciclo de vida do evento.
  // Ambas são gravadas com action "updated" (POST /api/events/:id/close e
  // /reopen), então nasceram indistinguíveis de "mudou a data do caminhão" e
  // apareciam na trilha como "Evento Alterado" — o rótulo mais morno possível
  // para a decisão que tira o evento das cinco filas e da Gestão de Prazos.
  // Os `details` abaixo são amostras REAIS de server/routes/events.ts: se
  // alguém trocar uma palavra lá, é aqui que quebra, e não na auditoria.
  it("encerramento manual vira event_closed, não event_updated", () => {
    const tl = buildTimeline([evento], [], [
      log({
        entityType: "event", entityId: EV_ID, action: "updated",
        details: 'Evento "Maratona de São Paulo" ENCERRADO manualmente — 3 peças continuam em aberto (1 em produção, 9 de 12 entregues). Sai da Gestão de Prazos e das filas de trabalho; segue visível no histórico e pode ser reaberto.',
      }),
    ]);
    expect(typesOf(tl)).toContain("event_closed");
    expect(typesOf(tl)).not.toContain("event_updated");
    const e = find(tl, "event_closed")!;
    expect(e.eventId).toBe(EV_ID);
    // O autor do encerramento é a informação que a peça NÃO tem — é para cá
    // que a trilha da peça manda quem quer saber quem e quando.
    expect(e.userName).toBe("Ana Souza");
    expect(e.authorSource).toBe("log");
    expect(e.logDetails).toContain("3 peças continuam em aberto");
  });

  it("reabertura vira event_reopened, não event_updated", () => {
    const tl = buildTimeline([evento], [], [
      log({
        entityType: "event", entityId: EV_ID, action: "updated",
        details: 'Evento "Maratona de São Paulo" REABERTO — volta para a Gestão de Prazos e para as filas de trabalho com 3 peças em aberto (1 em produção).',
      }),
    ]);
    expect(typesOf(tl)).toContain("event_reopened");
    expect(typesOf(tl)).not.toContain("event_updated");
    expect(find(tl, "event_reopened")!.eventId).toBe(EV_ID);
  });

  it("alteração comum de evento continua sendo event_updated (as duas guardas são estreitas)", () => {
    const tl = buildTimeline([evento], [], [
      log({
        entityType: "event", entityId: EV_ID, action: "updated",
        details: 'Evento "Maratona de São Paulo" atualizado — Nome: Maratona → Maratona de São Paulo',
      }),
    ]);
    expect(typesOf(tl)).toContain("event_updated");
    expect(typesOf(tl)).not.toContain("event_closed");
    expect(typesOf(tl)).not.toContain("event_reopened");
  });

  it("criação de evento não duplica a entrada sintética da tabela de eventos", () => {
    const tl = buildTimeline([evento], [], [
      log({ entityType: "event", entityId: EV_ID, action: "created", details: 'Evento "Maratona de São Paulo" criado' }),
    ]);
    expect(typesOf(tl).filter(t => t === "event_created")).toHaveLength(1);
  });
});

describe("buildTimeline — reprovação do CRIADOR não é mais creditada ao patrocinador", () => {
  it("as duas rotas de patrocinador continuam como sponsor_rejected", () => {
    const tl = buildTimeline([evento], [peca], [
      log({ action: "rejected", details: "Status alterado: Aguardando Aprovação → Aguardando Envio (reprovado pelo patrocinador)" }),
      log({ action: "rejected", details: 'Patrocinador "Ambev" reprovou o item. Item aguarda nova versão da Arte. Motivo: logo cortado' }),
    ]);
    expect(typesOf(tl).filter(t => t === "sponsor_rejected")).toHaveLength(2);
    expect(typesOf(tl)).not.toContain("item_rejected_creator");
  });

  it("as duas rotas internas viram item_rejected_creator", () => {
    const tl = buildTimeline([evento], [peca], [
      log({ action: "rejected", details: "Status alterado: Aguardando Revisão Final → Aguardando Envio (reprovado pelo criador)" }),
      log({ action: "rejected", details: "Status alterado: Aguardando Revisão Final → Aguardando Envio (reprovado pelo criador em lote)" }),
    ]);
    expect(typesOf(tl).filter(t => t === "item_rejected_creator")).toHaveLength(2);
    expect(typesOf(tl)).not.toContain("sponsor_rejected");
  });

  it("devolução para a Arte é reconhecida antes de qualquer ramo de reprovação", () => {
    const tl = buildTimeline([evento], [peca], [
      log({ action: "rejected", details: "Item devolvido para Arte para modificações. Motivo: trocar o logo" }),
      log({ action: "rejected", details: "Item devolvido para Arte para modificações (em lote)." }),
    ]);
    expect(typesOf(tl).filter(t => t === "item_returned")).toHaveLength(2);
  });
});

describe("buildTimeline — as sete classes de log de PEÇA que eram engolidas", () => {
  it("edição de peça vira item_edited", () => {
    const tl = buildTimeline([evento], [peca], [
      log({ details: "Item editado: Quantidade: 10 → 20, Dimensões: 2×1 → 3×1" }),
    ]);
    expect(typesOf(tl)).toContain("item_edited");
  });

  it("envio sem aprovação de patrocinador vira item_sent_no_approval", () => {
    const tl = buildTimeline([evento], [peca], [
      log({ details: "Enviado para Arte — Status alterado: Aguardando Envio → Aguardando Revisão Final (sem aprovação de patrocinador)" }),
    ]);
    expect(typesOf(tl)).toContain("item_sent_no_approval");
  });

  it("envio pelo fluxo padrão continua sendo item_sent", () => {
    const tl = buildTimeline([evento], [peca], [
      log({ details: "Enviado para Arte — Status alterado: Aguardando Envio → Aguardando Aprovação" }),
    ]);
    expect(typesOf(tl)).toContain("item_sent");
  });

  it("reversão de aprovação por administrador vira approval_reverted", () => {
    const tl = buildTimeline([evento], [peca], [
      log({ details: 'Administrador reverteu a aprovação de "Ambev" para pendente (estava: approved). Item reaberto: Aguardando Finalização → Aguardando Aprovação' }),
    ]);
    expect(typesOf(tl)).toContain("approval_reverted");
  });

  it("nova versão do thumb vira thumb_new_version com a contagem de patrocinadores", () => {
    const tl = buildTimeline([evento], [peca], [
      log({ details: "Arte enviou nova versão do thumb para 3 patrocinador(es). Aguarda revisão do Atendimento." }),
    ]);
    const e = find(tl, "thumb_new_version");
    expect(e).toBeDefined();
    expect(e!.sponsorCount).toBe(3);
  });

  it("restauração da lixeira vira item_restored", () => {
    const tl = buildTimeline([evento], [peca], [
      log({ action: "restored", details: 'Peça "ITEM-023" restaurada da lixeira' }),
    ]);
    expect(typesOf(tl)).toContain("item_restored");
  });

  it("clonagem de peças (log agregado com id do EVENTO) vira items_cloned", () => {
    const tl = buildTimeline([evento, evento2], [], [
      log({
        action: "created", entityType: "item", entityId: EV2_ID,
        details: '12 itens clonados do evento "Maratona de São Paulo"',
      }),
    ]);
    const e = find(tl, "items_cloned");
    expect(e).toBeDefined();
    expect(e!.batchCount).toBe(12);
    expect(e!.eventId).toBe(EV2_ID);
  });

  it("envio em lote para vinculação vira items_submitted", () => {
    const tl = buildTimeline([evento], [], [
      log({
        action: "created", entityType: "item", entityId: EV_ID,
        details: "30 itens: Status alterado de Rascunho → Aguardando Vinculação (enviados para vinculação)",
      }),
    ]);
    const e = find(tl, "items_submitted");
    expect(e).toBeDefined();
    expect(e!.batchCount).toBe(30);
  });
});

describe("buildTimeline — a linha de EXCLUSÃO de peça", () => {
  const detalhesExclusao =
    'Item "Banner 2x1" (ITEM-023) do evento "Maratona de São Paulo" excluído por admin';

  it("recupera código, tipo, nome do evento e o id do evento (volta a ser navegável)", () => {
    const tl = buildTimeline([evento], [], [
      log({ action: "deleted", details: detalhesExclusao }),
    ]);
    const e = find(tl, "item_deleted")!;
    expect(e.itemDisplayId).toBe("ITEM-023");
    expect(e.itemType).toBe("Banner 2x1");
    expect(e.eventName).toBe("Maratona de São Paulo");
    expect(e.eventId).toBe(EV_ID);
    expect(e.itemMissing).toBe(true);
  });

  it("o formato antigo (#123) não existe: o código real é ITEM-nnn", () => {
    const tl = buildTimeline([evento], [], [
      log({ action: "deleted", details: 'Item "Banner 2x1" (ITEM-023) excluído por admin' }),
    ]);
    expect(find(tl, "item_deleted")!.itemDisplayId).toBe("ITEM-023");
  });

  it("logs intermediários de peça excluída não somem mais", () => {
    const tl = buildTimeline([evento], [], [
      log({ details: "3 patrocinadores atualizados" }),
      log({ details: "Thumb de aprovação atualizado por Ana. Anterior: a.png → Novo: b.png" }),
      log({ details: "Status alterado: Aguardando Finalização → Aguardando Revisão Final (arquivo final adicionado)" }),
      log({ action: "deleted", details: detalhesExclusao }),
    ]);
    const tipos = typesOf(tl);
    expect(tipos).toContain("sponsor_linked");
    expect(tipos).toContain("thumb_replaced");
    expect(tipos).toContain("final_file_added");
    expect(tipos).toContain("item_deleted");
    expect(tl.filter(e => e.type !== "event_created").every(e => e.itemMissing)).toBe(true);
  });
});

describe("buildTimeline — entradas sintéticas param de afirmar data e autor que não têm", () => {
  const emProducao = { ...peca, status: "inProduction", quantityProduced: 4 };

  it("sem approvedAt nem creatorReviewedAt a linha de liberação NÃO é emitida", () => {
    const tl = buildTimeline([evento], [emProducao], []);
    expect(typesOf(tl)).not.toContain("item_released");
  });

  it("com creatorReviewedAt a liberação usa o carimbo REAL, não o updatedAt", () => {
    const item = { ...emProducao, creatorReviewedAt: "2026-07-20T14:00:00.000Z" };
    const tl = buildTimeline([evento], [item], []);
    const e = find(tl, "item_released")!;
    expect(e.timestamp.toISOString()).toBe("2026-07-20T14:00:00.000Z");
    expect(e.timestamp.toISOString()).not.toBe(new Date(item.updatedAt).toISOString());
  });

  it("a liberação sintética não herda autor de log ambíguo de 'approved'", () => {
    const item = { ...emProducao, creatorReviewedAt: "2026-07-20T14:00:00.000Z" };
    const tl = buildTimeline([evento], [item], [
      log({ action: "approved", userName: "Atendimento Bia", details: 'Patrocinador "Ambev" aprovou o item' }),
    ]);
    expect(find(tl, "item_released")!.userName).toBeUndefined();
  });

  it("sem productionStartedAt a linha de produção NÃO é emitida", () => {
    const tl = buildTimeline([evento], [emProducao], []);
    expect(typesOf(tl)).not.toContain("production_started");
  });

  it("com productionStartedAt a produção sintética aparece com data real", () => {
    const item = { ...emProducao, productionStartedAt: "2026-07-25T08:30:00.000Z" };
    const tl = buildTimeline([evento], [item], []);
    expect(find(tl, "production_started")!.timestamp.toISOString()).toBe("2026-07-25T08:30:00.000Z");
  });

  it("existindo log de liberação, a sintética não é emitida (sem linha duplicada)", () => {
    const item = { ...emProducao, creatorReviewedAt: "2026-07-20T14:00:00.000Z" };
    const tl = buildTimeline([evento], [item], [
      log({ action: "approved", details: "Status alterado: Aguardando Revisão Final → Pronto para Produção (liberado para produção)" }),
    ]);
    expect(typesOf(tl).filter(t => t === "item_released")).toHaveLength(1);
    expect(find(tl, "item_released")!.userName).toBe("Ana Souza");
  });
});

describe("buildTimeline — autoria do 'Evento Criado'", () => {
  it("não é creditada a quem clonou peças meses depois", () => {
    // Os logs chegam em createdAt DESC (storage.getAuditLogs). O log de
    // clonagem grava entityType 'item' com o id do EVENTO — a chave antiga
    // (só entityId + action) colidia com o log de criação do evento.
    const tl = buildTimeline([evento], [], [
      log({
        action: "created", entityType: "item", entityId: EV_ID, userName: "Carlos Clonador",
        createdAt: "2026-08-01T10:00:00.000Z",
        details: '12 itens clonados do evento "Circuito Estações"',
      }),
      log({
        action: "created", entityType: "event", entityId: EV_ID, userName: "Marina Criadora",
        createdAt: "2026-07-01T10:00:00.000Z",
        details: 'Evento "Maratona de São Paulo" criado',
      }),
    ]);
    expect(find(tl, "event_created")!.userName).toBe("Marina Criadora");
  });
});

describe("buildTimeline — tipos do fluxo que já funcionavam continuam funcionando", () => {
  it("produção, produzido, conferência, cancelamento e complemento", () => {
    const tl = buildTimeline([evento], [peca], [
      log({ action: "production", details: "Produção: 4 un. lançadas pela Gráfica" }),
      log({ action: "produced", details: "Produção: 10 un. — quantidade fechada" }),
      log({ details: "Conferência parcial: 3 un. (3/10)" }),
      log({ action: "canceled", details: "Item cancelado. Motivo: patrocinador desistiu" }),
      log({ action: "complement_created", details: "Complemento #0062-C1 criado com 5 un." }),
      log({ action: "complement_canceled", details: "Complemento #0062-C1 cancelado" }),
      log({ action: "dispensed", details: "Peça dispensada pela Arte. Status anterior: awaiting_submission" }),
    ]);
    const tipos = typesOf(tl);
    expect(tipos).toContain("production_started");
    expect(tipos).toContain("item_produced");
    expect(tipos).toContain("item_conferred");
    expect(tipos).toContain("item_canceled");
    expect(tipos).toContain("item_complement_created");
    expect(tipos).toContain("item_complement_canceled");
    expect(tipos).toContain("item_dispensed");
  });

  it("reaproveitamento total, parcial (dois formatos) e corrigido", () => {
    const tl = buildTimeline([evento], [peca], [
      log({ details: "Reaproveitamento total pela Gráfica: 10/10 un." }),
      log({ details: "Reaproveitamento parcial pela Gráfica: 6 un. (6/10 reaproveitadas, 4 a produzir)" }),
      log({ action: "approved", details: "Status alterado: Aguardando Revisão Final → Pronto para Produção (reaproveitamento parcial: 6 un. de 10, 4 a produzir)" }),
      log({ details: "Reaproveitamento removido por correção — peça voltou para Pronto para Produção (10 un. a produzir)" }),
    ]);
    const tipos = typesOf(tl);
    expect(tipos.filter(t => t === "item_reused")).toHaveLength(1);
    expect(tipos.filter(t => t === "item_reused_partial")).toHaveLength(2);
    expect(tipos.filter(t => t === "item_reuse_corrected")).toHaveLength(1);
  });

  it("o motivo do COMPLEMENTO em texto livre não se disfarça de outro tipo", () => {
    const tl = buildTimeline([evento], [peca], [
      log({ action: "complement_created", details: "Complemento criado. Motivo: erro na conferência e no reaproveitamento" }),
    ]);
    expect(typesOf(tl)).toContain("item_complement_created");
    expect(typesOf(tl)).not.toContain("item_conferred");
    expect(typesOf(tl)).not.toContain("item_reused");
  });

  it("aprovação de patrocinador não é confundida com liberação para produção", () => {
    const tl = buildTimeline([evento], [peca], [
      log({ action: "approved", details: 'Patrocinador "Ambev" aprovou o item' }),
      log({ action: "approved", details: "Todos os patrocinadores aprovaram. Status alterado: Aguardando Aprovação → Aguardando Finalização" }),
      log({ action: "approved", details: "Status alterado: Aguardando Revisão Final → Pronto para Produção (liberado para produção)" }),
    ]);
    const tipos = typesOf(tl);
    expect(tipos.filter(t => t === "sponsor_approved")).toHaveLength(2);
    expect(tipos.filter(t => t === "item_released")).toHaveLength(1);
  });
});

describe("buildTimeline — busca e ordenação", () => {
  it("searchBlob cobre o logDetails, que é o texto renderizado na linha", () => {
    const tl = buildTimeline([evento], [peca], [
      log({ action: "rejected", details: 'Patrocinador "Ambev" reprovou o item. Item aguarda nova versão da Arte. Motivo: logo cortado' }),
    ]);
    const e = find(tl, "sponsor_rejected")!;
    expect(e.searchBlob).toContain("ambev");
    expect(e.searchBlob).toContain("logo cortado");
    expect(e.searchBlob).toContain("item-023");
  });

  it("a lista sai ordenada do mais recente para o mais antigo", () => {
    const tl = buildTimeline([evento], [peca], [
      log({ createdAt: "2026-08-01T10:00:00.000Z", details: "Conferência concluída (10/10)" }),
      log({ createdAt: "2026-08-12T10:00:00.000Z", details: "Item editado: Quantidade: 10 → 20" }),
    ]);
    const ts = tl.map(e => e.timestamp.getTime());
    expect(ts).toEqual([...ts].sort((a, b) => b - a));
  });

  it("tolera payload em snake_case (entity_type / entity_id / created_at / user_name)", () => {
    const tl = buildTimeline([evento], [peca], [
      {
        id: "snake-1",
        user_name: "Ana Souza",
        action: "updated",
        entity_type: "item",
        entity_id: IT_ID,
        details: "Item editado: Quantidade: 10 → 20",
        created_at: "2026-08-10T12:00:00.000Z",
      },
    ]);
    const e = find(tl, "item_edited")!;
    expect(e.userName).toBe("Ana Souza");
    expect(e.itemDisplayId).toBe("ITEM-023");
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
   AUTORIA DA LINHA — "não sabemos quem fez" e "isto nunca foi um registro"
   são frases diferentes, e a tela dizia a primeira nos dois casos.

   O sintoma medido em produção: 4.287 de 4.755 linhas caíam no filtro "Sem
   autor registrado". A quase totalidade delas era RECONSTRUÍDA pelo cliente a
   partir de carimbos da própria peça (productionStartedAt, deliveredAt…), onde
   nunca existiu autor a perder. `authorSource` separa as quatro naturezas para
   que a tela possa contá-las e nomeá-las em vez de empilhar tudo num traço.
   ───────────────────────────────────────────────────────────────────────────── */
describe("buildTimeline — de onde vem (ou não vem) o autor de cada linha", () => {
  it("linha vinda de log traz nome, id e origem 'log'", () => {
    const tl = buildTimeline([evento], [peca], [
      log({ userId: "u-7", details: "Item editado: Quantidade: 10 → 20" }),
    ]);
    const e = find(tl, "item_edited")!;
    expect(e.userName).toBe("Ana Souza");
    expect(e.userId).toBe("u-7");
    expect(e.authorSource).toBe("log");
  });

  it("ação automática registrada como 'Sistema' é afirmação, não ausência", () => {
    const tl = buildTimeline([evento], [], [
      log({
        entityType: "event", entityId: EV_ID, action: "updated", userName: "Sistema",
        details: "Status do evento recalculado: Concluído (todas as peças ativas foram entregues)",
      }),
    ]);
    const e = find(tl, "event_updated")!;
    expect(e.authorSource).toBe("system");
    expect(e.userName).toBe("Sistema");
  });

  it("registro gravado sem nome é 'unrecorded' — contável, não escondido", () => {
    const tl = buildTimeline([evento], [peca], [
      log({ userName: "   ", details: "Item editado: Quantidade: 10 → 20" }),
    ]);
    const e = find(tl, "item_edited")!;
    expect(e.authorSource).toBe("unrecorded");
    expect(e.userName).toBeUndefined();
  });

  it("linha sintetizada de carimbo da peça se declara 'derived'", () => {
    // Sem NENHUM log: é exatamente o estado em que o Histórico se encontrava
    // para ~90% da lista (a consulta traz só os 500 registros mais recentes).
    const emProducao = {
      ...peca,
      status: "inProduction",
      quantityProduced: 4,
      productionStartedAt: "2026-08-09T13:29:44.000Z",
      creatorReviewedAt: "2026-08-08T10:00:00.000Z",
    };
    const tl = buildTimeline([evento], [emProducao], []);
    const producao = find(tl, "production_started")!;
    expect(producao.authorSource).toBe("derived");
    expect(producao.userName).toBeUndefined();

    // E as três outras sintéticas da mesma peça pela mesma régua.
    expect(find(tl, "item_created")!.authorSource).toBe("derived");
    expect(find(tl, "item_released")!.authorSource).toBe("derived");
    expect(find(tl, "event_created")!.authorSource).toBe("derived");
  });

  it("toda entrada declara uma origem — nenhuma linha sai sem authorSource", () => {
    const entregue = {
      ...peca,
      status: "delivered",
      quantityProduced: 10,
      productionStartedAt: "2026-08-09T13:00:00.000Z",
      deliveredAt: "2026-08-11T15:00:00.000Z",
      creatorReviewedAt: "2026-08-08T10:00:00.000Z",
      receivedBy: "Portaria",
    };
    const tl = buildTimeline([evento, evento2], [entregue], [
      log({ details: "Item editado: Quantidade: 10 → 20" }),
      log({ entityType: "event", entityId: EV2_ID, action: "updated", details: "Data de saída alterada" }),
    ]);
    expect(tl.length).toBeGreaterThan(0);
    for (const e of tl) {
      expect(["log", "system", "derived", "unrecorded"]).toContain(e.authorSource);
    }
  });

  it("liberação já registrada não ganha uma segunda linha anônima por cima", () => {
    // O log de /api/items/:id/approve dizia "aprovado para produção" e a
    // pré-varredura só reconhecia "liberado para produção": a peça parecia sem
    // registro de liberação e o cliente emitia POR CIMA a linha sintética, sem
    // autor. A MESMA ação aparecia duas vezes, uma delas anônima.
    const liberada = {
      ...peca,
      status: "approved",
      approvedAt: "2026-08-08T10:00:00.000Z",
    };
    for (const details of [
      'Item "Banner 2x1" liberado para produção',
      'Item "Banner 2x1" aprovado para produção',
    ]) {
      const tl = buildTimeline([evento], [liberada], [log({ action: "approved", details })]);
      const liberacoes = tl.filter(e => e.type === "item_released");
      expect(liberacoes, details).toHaveLength(1);
      expect(liberacoes[0].authorSource).toBe("log");
      expect(liberacoes[0].userName).toBe("Ana Souza");
    }
  });

  it("liberação por reaproveitamento também suprime a linha anônima", () => {
    // /creator-review grava 'approved' com um texto que a tela classifica como
    // REAPROVEITAMENTO (é o que a ação foi). A linha certa é a de reuso, com
    // autor — e nenhuma "Lib. p/ Produção" reconstruída ao lado dela.
    const reaproveitada = {
      ...peca,
      status: "produced",
      creatorReviewedAt: "2026-08-08T10:00:00.000Z",
    };
    const tl = buildTimeline([evento], [reaproveitada], [
      log({
        action: "approved",
        details: "Status alterado: Aguardando Revisão Final → Produzido (reaproveitamento — não precisa produzir)",
      }),
    ]);
    expect(tl.filter(e => e.type === "item_released")).toHaveLength(0);
    const reuso = find(tl, "item_reused")!;
    expect(reuso.authorSource).toBe("log");
    expect(reuso.userName).toBe("Ana Souza");
  });

  it("aprovação de PATROCINADOR não é liberação — a linha de liberação continua reconstruída", () => {
    // O contraponto do teste acima: 'approved' também é a ação das aprovações
    // de patrocinador. Tratá-las como liberação apagaria a linha de liberação.
    const liberada = { ...peca, status: "approved", approvedAt: "2026-08-08T10:00:00.000Z" };
    const tl = buildTimeline([evento], [liberada], [
      log({ action: "approved", details: 'Patrocinador "Ambev" aprovou o item' }),
    ]);
    expect(typesOf(tl)).toContain("sponsor_approved");
    const liberacao = find(tl, "item_released")!;
    expect(liberacao.authorSource).toBe("derived");
  });
});
