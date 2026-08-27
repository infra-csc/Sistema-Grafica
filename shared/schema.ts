import { sql } from "drizzle-orm";
import { pgTable, pgSequence, text, varchar, timestamp, integer, decimal, boolean, json, index, uniqueIndex } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// A SEQUÊNCIA DOS NÚMEROS DE PEÇA (#0001, #0002…). O storage a cria e usa via
// SQL cru (generateNextDisplayId), mas ela TEM de estar declarada aqui pelo
// MESMO motivo da tabela `session` logo abaixo: objeto que o schema não
// declara é objeto que o drizzle-kit push DERRUBA. Foi exatamente o que
// aconteceu em 25/08 — o push das colunas novas apagou a sequência, o
// servidor (que memoriza "já criei" por processo) foi direto no nextval, e
// toda criação de peça morreu com `relation "item_display_id_seq" does not
// exist` até reiniciar.
export const itemDisplayIdSeq = pgSequence("item_display_id_seq", { startWith: 1 });

// Session storage table (used by connect-pg-simple / express-session).
// IMPORTANT: must stay declared here — otherwise drizzle-kit push tries to drop it
// (deleting active logins) and the interactive prompt silently aborts db:push.
export const session = pgTable(
  "session",
  {
    sid: varchar("sid").primaryKey(),
    sess: json("sess").notNull(),
    expire: timestamp("expire", { precision: 6 }).notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// Events table
export const events = pgTable("events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  startDate: timestamp("start_date").notNull(),
  truckDepartureDate: timestamp("truck_departure_date").notNull(),
  // created/completed são DERIVADOS da produção (routes/shared.ts
  // calculateEventStatus). "closed" é a única marca de encerramento MANUAL —
  // gravada só por POST /api/events/:id/close e desfeita só por /reopen.
  // Coluna text livre: o terceiro valor não exige migração.
  status: text("status").notNull().default("created"), // created, completed, closed
  /**
   * QUANDO alguém reabriu o evento à mão. NULL = nunca reaberto.
   *
   * Existe porque "encerrado" e "realizado" são coisas diferentes e só uma
   * tinha volta. Encerrar é decisão de gente e some com `status`; a data ter
   * passado não some com nada — e o dono precisa poder dizer "eu sei que
   * passou, e ainda tem trabalho aqui".
   *
   * Não dava para usar `status` para isso: evento nunca encerrado e evento
   * reaberto ficam os DOIS em "created". Sem uma marca própria, "reabriu logo
   * libera" liberaria também todo evento passado que ninguém tocou — e a trava
   * de data deixaria de existir.
   *
   * É TIMESTAMP e não booleano porque a reabertura precisa ser comparada com
   * o dia do evento: reabrir ANTES da data não deve valer como licença para
   * depois que ela passar.
   */
  reopenedAt: timestamp("reopened_at"),
  priority: text("priority"), // baixa, media, alta, urgente
  // A prioridade passou a ser AUTOMÁTICA pela saída do caminhão (25/08, ver
  // shared/prioridade-do-evento.ts). Este flag é a TRAVA: true = alguém
  // definiu à mão e a regra não sobrescreve; limpar a prioridade destrava e
  // a automática volta na hora. Default false = a regra manda.
  priorityManual: boolean("priority_manual").notNull().default(false),
  franchise: text("franchise"), // Franquia (ex: "Night Run", "Circuito Estações")
  approvalBookUrl: text("approval_book_url"), // URL do PDF com book de aprovação
  createdBy: varchar("created_by").references(() => users.id, { onDelete: "set null" }),
  // Prazos relativos ao truckDepartureDate (dias negativos = dias ANTES da
  // saída do caminhão). A produção precisa estar pronta antes de carregar o
  // caminhão, não antes do evento começar — por isso a âncora é a saída.
  deadlineListaImagens: integer("deadline_lista_imagens").default(-25), // Criação dos itens
  deadlineEntregaLayouts: integer("deadline_entrega_layouts").default(-20), // Entrega pela Arte
  deadlineAprovacaoLayout: integer("deadline_aprovacao_layout").default(-12), // Aprovação do patrocinador
  // DEFAULT no banco (não só no app): `db:push` emite
  // `ALTER TABLE events ADD COLUMN deadline_finalizacao integer DEFAULT -10`,
  // e o Postgres preenche as linhas JÁ EXISTENTES com -10 na mesma operação.
  // É o que atende "colocar em todos os eventos em produção também" sem
  // UPDATE manual — evento antigo passa a ter o marco preenchido.
  deadlineFinalizacao: integer("deadline_finalizacao").default(-10), // Arte anexa o arquivo final
  deadlineRevisaoLista: integer("deadline_revisao_lista").default(-8), // Revisão de lista pelo criador
  deadlineProducaoGrafica: integer("deadline_producao_grafica").default(-1), // Produção gráfica
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
}, (table) => [
  // getAllEvents ordena por created_at desc — sem índice é sort em memória a
  // cada request (e /api/events é o endpoint mais chamado).
  index("IDX_events_created_at").on(table.createdAt),
]);

// Sponsors table (Patrocinadores)
export const sponsors = pgTable("sponsors", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  company: text("company"),
  contactPerson: text("contact_person"), // Pessoa de contato
  notes: text("notes"), // Observações gerais
  color: text("color").default("#3b82f6"), // Cor personalizada do patrocinador (hex)
  quota: text("quota"), // MASTER, GOLD, SILVER, APOIO, MIDIA, MINISTERIO
  // PATROCINADOR "DESAPROVADOR" (pedido do dono, 21/08/2026; caso típico:
  // Ministério). Com a flag, a aprovação dele vale só para a versão que ele
  // aprovou: toda versão nova da arte a revoga, e a reprovação de QUALQUER
  // outro patrocinador também. Ver revogarAprovacoesEstritas em routes/items.ts.
  strictApproval: boolean("strict_approval").notNull().default(false),
  // Executivo responsável pela conta (usuário do sistema). Se o usuário for
  // removido, o vínculo é apenas limpo — o patrocinador continua existindo.
  accountExecutiveId: varchar("account_executive_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

// Event-Sponsors relationship table (many-to-many)
export const eventSponsors = pgTable("event_sponsors", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  sponsorId: varchar("sponsor_id").notNull().references(() => sponsors.id, { onDelete: "cascade" }),
  quota: text("quota"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (table) => [
  // Leituras por evento (getEventSponsors, chamado no enrich de /api/events) e
  // cascade ao excluir evento/patrocinador — sem índice viram seq scan.
  index("IDX_event_sponsors_event_id").on(table.eventId),
  index("IDX_event_sponsors_sponsor_id").on(table.sponsorId),
]);

// Item-Sponsors relationship table (many-to-many)
export const itemSponsors = pgTable("item_sponsors", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  itemId: varchar("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
  sponsorId: varchar("sponsor_id").notNull().references(() => sponsors.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (table) => [
  index("IDX_item_sponsors_item_id").on(table.itemId),
  index("IDX_item_sponsors_sponsor_id").on(table.sponsorId),
]);

// Item-Sponsor Approvals table (tracks individual sponsor approval status)
export const itemSponsorApprovals = pgTable("item_sponsor_approvals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  itemId: varchar("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
  sponsorId: varchar("sponsor_id").notNull().references(() => sponsors.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"), // pending, approved, rejected
  approvedBy: text("approved_by"), // Nome do usuário que aprovou
  approvedAt: timestamp("approved_at"), // Quando foi aprovado
  rejectedBy: text("rejected_by"), // Nome do usuário que reprovou
  rejectedAt: timestamp("rejected_at"), // Quando foi reprovado
  rejectionReason: text("rejection_reason"), // Motivo da reprovação (se houver)
  // QUAL THUMB FOI DECIDIDO. A aprovação dizia "aprovou" e "quando", mas não
  // "o quê": com a Arte trocando o thumb depois, "aprovado" passava a apontar
  // para uma arte que o patrocinador nunca viu. Gravado no approve/reject com
  // o approvalThumbUrl da peça naquele instante. NULL nas decisões anteriores
  // a esta coluna — a tela infere pela data e DIZ que inferiu.
  decidedThumbUrl: text("decided_thumb_url"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
}, (table) => [
  index("IDX_item_sponsor_approvals_item_id").on(table.itemId),
  index("IDX_item_sponsor_approvals_sponsor_id").on(table.sponsorId),
]);

// Event Quota Rules — maps sponsor tiers to item types per event
export const eventQuotaRules = pgTable("event_quota_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  quota: text("quota").notNull(), // MASTER, GOLD, SILVER, APOIO, MIDIA, MINISTERIO
  itemTypes: text("item_types").array().notNull().default(sql`'{}'::text[]`),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (table) => [
  index("IDX_event_quota_rules_event_id").on(table.eventId),
]);

// Items table
export const items = pgTable("items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  displayId: text("display_id").notNull().unique(), // ID legível para usuários (ex: ITEM-001, ITEM-002)
  eventId: varchar("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // "2x1", "rolo", "palco", etc
  description: text("description"), // Descrição personalizada do item
  quantity: integer("quantity").notNull(),
  area: decimal("area", { precision: 10, scale: 2 }).notNull(),
  visual: decimal("visual", { precision: 10, scale: 2 }).notNull(),
  visualWidth: decimal("visual_width", { precision: 10, scale: 2 }), // Largura da área visual (ex: 2.00m)
  visualHeight: decimal("visual_height", { precision: 10, scale: 2 }), // Altura da área visual (ex: 1.00m)
  fileWidth: decimal("file_width", { precision: 10, scale: 2 }), // Largura do arquivo em metros (ex: 2.50m)
  fileHeight: decimal("file_height", { precision: 10, scale: 2 }), // Altura do arquivo em metros (ex: 1.80m)
  material: text("material").notNull(),
  finish: text("finish").notNull(),
  measurement: text("measurement").notNull(), // Can be edited, starts as area x visual
  calculatedM2: decimal("calculated_m2", { precision: 10, scale: 2 }).notNull(),
  status: text("status").notNull().default("draft"), // draft, requested, awaiting_linking, awaiting_submission, awaiting_approval, awaiting_finalization, awaiting_final_review, ready_for_production, approved, inProduction, produced, delivered
  observations: text("observations"),
  quantityProduced: integer("quantity_produced"),
  receivedBy: text("received_by"),
  deliveryPhotoUrl: text("delivery_photo_url"),
  skipApproval: boolean("skip_approval").notNull().default(false), // Se true, pula fase de aprovação de patrocinador
  isReuse: boolean("is_reuse").notNull().default(false), // Reaproveitamento total (reuseQty cobre a quantidade toda)
  reuseQty: integer("reuse_qty").notNull().default(0), // Unidades reaproveitadas; o restante é produzido normalmente
  approvalThumbUrl: text("approval_thumb_url"), // Thumb/link leve para aprovação
  previousApprovalThumbUrl: text("previous_approval_thumb_url"), // Thumb anterior (preenchido quando Arte troca o thumb já aprovado)
  approvalThumbUpdatedAt: timestamp("approval_thumb_updated_at"), // Quando o thumb foi trocado pela Arte
  hasModifiedData: boolean("has_modified_data").notNull().default(false), // Flag: tem dados modificados para notificar Arte
  finalFileUrl: text("final_file_url"), // Link do arquivo final (Drive, S3, etc)
  finalFileName: text("final_file_name"), // Nome original do arquivo enviado (preserva a extensão p/ download)
  finalPreviewUrl: text("final_preview_url"), // Preview JPG do arquivo final (reservado p/ uso futuro)
  finalFileUpdatedAt: timestamp("final_file_updated_at"), // Quando o arquivo final foi enviado/atualizado pela Arte
  finalFileAckedAt: timestamp("final_file_acked_at"), // Legado: recurso de confirmação de recebimento (não usado nesta branch); coluna preservada para não perder dados
  previousFinalFileUrl: text("previous_final_file_url"), // Arquivo final anterior (preenchido quando Arte substitui o arquivo)
  previousFinalFileName: text("previous_final_file_name"), // Nome do arquivo anterior substituído
  conferenceNotes: text("conference_notes"), // Observação da última conferência (o histórico completo fica no audit log)
  deliveryNotes: text("delivery_notes"), // Observação da última entrega (idem)
  conferencePhotoUrl: text("conference_photo_url"), // Foto da conferência (entre Produzido e Entregue)
  conferredAt: timestamp("conferred_at"), // Quando a Gráfica terminou de conferir tudo
  conferredQty: integer("conferred_qty").notNull().default(0), // Quantidade já conferida (conferência parcial)
  deliveredQty: integer("delivered_qty").notNull().default(0), // Quantidade já entregue (entrega parcial)
  // ── Complemento: aumento de quantidade DEPOIS que a peça entrou em produção. ──
  // A peça original NUNCA é alterada (nenhum UPDATE na linha da mãe): a diferença
  // nasce como peça-filha #0062-C1, com ciclo próprio de produção, conferência,
  // entrega e ativos de inventário. Por quê: rebaixar uma peça já entregue para
  // "Em Produção" reescreveria relatório de fechamento e obrigaria a Gráfica a
  // fazer conta mental (15 na coluna QTD, 10 na PROD) justamente na tela onde a
  // leitura precisa ser instantânea. Aqui o número da linha JÁ É o saldo.
  // NULL em parentItemId = peça normal (100% do acervo existente).
  parentItemId: varchar("parent_item_id").references((): any => items.id, { onDelete: "set null" }),
  complementSeq: integer("complement_seq"),               // 1, 2, 3… ordem do complemento dentro da mãe
  complementReason: text("complement_reason"),            // justificativa (obrigatória na rota, mín. 10 caracteres)
  complementRequestedBy: text("complement_requested_by"), // nome denormalizado (mesmo padrão de receivedBy)
  complementRequestedAt: timestamp("complement_requested_at"),
  sponsorApprovedBy: text("sponsor_approved_by"), // Nome do aprovador do patrocinador
  sponsorApprovedAt: timestamp("sponsor_approved_at"), // Quando foi aprovado pelo patrocinador
  creatorReviewedAt: timestamp("creator_reviewed_at"), // Quando criador do evento revisou
  rejectedBySponsor: boolean("rejected_by_sponsor").notNull().default(false), // Flag: reprovado pelo patrocinador (Atendimento)
  rejectedByCreator: boolean("rejected_by_creator").notNull().default(false), // Flag: reprovado pelo criador (Solicitação)
  // MOTIVO da última reprovação — obrigatório em TODAS as rotas que devolvem
  // peça (mín. 10 caracteres, mesma régua de complementReason). Existiam cinco
  // portas de devolução e nenhuma guardava por quê: a peça #1527 voltou de
  // "Aguardando Aprovação" para "Aguardando Envio" e o único registro dizia a
  // troca de status, nada mais. Fica NA PEÇA, e não só no audit log, porque
  // quem recebe a peça de volta precisa ler o motivo onde ela está — o
  // histórico completo continua na trilha (mesmo padrão de conferenceNotes).
  rejectionReason: text("rejection_reason"),
  approvedAt: timestamp("approved_at"), // Timestamp quando foi liberado pela Arte
  productionStartedAt: timestamp("production_started_at"), // Timestamp quando produção iniciou
  producedAt: timestamp("produced_at"), // Timestamp quando foi produzido
  // DESDE QUANDO a peca esta no status atual.
  //
  // O Painel Geral responde ONDE as pecas estao e nunca DESDE QUANDO — e
  // 1.129 pecas em "Aguardando envio" pode ser vazao normal ou travamento de
  // duas semanas, que e justamente a pergunta de quem procura gargalo.
  //
  // Por que uma coluna, e nao os dados que ja existem:
  //   · `updatedAt` muda em QUALQUER edicao (observacao, quantidade, thumb),
  //     entao mede a ultima vez que alguem tocou na peca, nao a ultima vez que
  //     ela ANDOU.
  //   · o audit_log registra as transicoes, mas em texto livre ("Status
  //     alterado: X -> Y") com `action` variado, e o Painel deixou de baixar a
  //     tabela inteira de proposito (em 1 ano, megabytes por visita).
  //   · os carimbos por etapa (sponsorApprovedAt, approvedAt, producedAt...)
  //     so existem da metade do fluxo para frente. Nao ha carimbo para
  //     awaiting_linking, awaiting_submission nem awaiting_approval — que e
  //     onde esta a maior fila.
  //
  // NULL e um valor legitimo aqui: peca anterior ao backfill sem carimbo de
  // etapa nao tem como saber. A tela nao exibe idade nessas linhas em vez de
  // mostrar a idade desde a criacao como se fosse tempo no estado.
  statusChangedAt: timestamp("status_changed_at"),
  // DE QUAL MODELO A PEÇA NASCEU. Até aqui a peça só COPIAVA tipo, material e
  // medidas do modelo e não guardava o vínculo — "quantas peças usam este
  // modelo" era pergunta sem resposta, e excluir um modelo era decisão cega.
  // NULL é legítimo: peça criada à mão, importada sem casar, ou anterior a
  // esta coluna. Para essas a tela mostra COMPATIBILIDADE (mesmo tipo,
  // material e medidas), rotulada como tal — nunca como origem.
  standardItemId: varchar("standard_item_id").references((): any => standardItems.id, { onDelete: "set null" }),
  deliveredAt: timestamp("delivered_at"), // Timestamp quando foi entregue
  // QUANDO a etiqueta desta peça saiu na impressora pela última vez (25/08).
  // A tela de Etiquetas abre com as já impressas desmarcadas — sem isso, a
  // segunda visita reimprimia a pilha inteira e o galpão recortava etiqueta
  // duplicada. Fica NA PEÇA (leitura rápida ao abrir a tela) e cada impressão
  // também vira linha no audit_log, onde o histórico de reimpressões
  // sobrevive — mesmo padrão de statusChangedAt. NULL = nunca impressa.
  labelPrintedAt: timestamp("label_printed_at"),
  referenceUrl: text("reference_url"), // Anexo/referência de demonstração das peças (upload do Solicitante)
  // MAIS DE UMA referência por peça (pedido do dono, 25/08). A lista completa
  // vive aqui; referenceUrl continua sendo A PRIMEIRA da lista — as sete telas
  // que mostram uma miniatura só não precisaram mudar. O PATCH mantém os dois
  // campos em sincronia (lista manda; só-referenceUrl espelha para cá).
  // NULL = peça anterior à coluna: vale o que referenceUrl disser.
  referenceUrls: text("reference_urls").array(),
  // PEÇA PRIORITÁRIA (pedido do dono, 27/08): marcada na criação ou na edição
  // por admin|solicitacao, a peça fura a fila da Arte — sobe para o topo e a
  // Arte é notificada na hora. É prioridade DA PEÇA, dentro do evento; não
  // confundir com a prioridade DO EVENTO (events.priority, régua da saída do
  // caminhão em shared/prioridade-do-evento.ts).
  isPriority: boolean("is_priority").notNull().default(false),
  bookUrl: text("book_url"), // PDF do book de aprovação (layout pronto) que cobre esta peça — enviado pela Arte para os patrocinadores
  deletedAt: timestamp("deleted_at"), // Soft delete — item permanece no histórico (audit log) mas some das listagens
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
}, (table) => [
  // Filtros mais usados nas listagens (por evento e por status/fase).
  index("IDX_items_event_id").on(table.eventId),
  index("IDX_items_status").on(table.status),
  // Toda listagem ordena por created_at e filtra deleted_at IS NULL (soft delete).
  index("IDX_items_created_at").on(table.createdAt),
  index("IDX_items_deleted_at").on(table.deletedAt),
  // Enriquecimento das 3 rotas de leitura busca os complementos por lote
  // (WHERE parent_item_id = ANY(...)) — sem índice vira seq scan por request.
  index("IDX_items_parent_item_id").on(table.parentItemId),
]);

// Standard items (templates)
export const standardItems = pgTable("standard_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  type: text("type").notNull(),
  area: decimal("area", { precision: 10, scale: 2 }),
  visual: decimal("visual", { precision: 10, scale: 2 }),
  visualWidth: decimal("visual_width", { precision: 10, scale: 2 }), // Largura da área visual
  visualHeight: decimal("visual_height", { precision: 10, scale: 2 }), // Altura da área visual
  fileWidth: decimal("file_width", { precision: 10, scale: 2 }), // Largura do arquivo em metros
  fileHeight: decimal("file_height", { precision: 10, scale: 2 }), // Altura do arquivo em metros
  group: text("group"), // Grupo pai para agrupar tipos relacionados (ex: "Pórtico")
  material: text("material"), // Material único (opcional)
  finish: text("finish"), // Acabamento único (opcional)
  hasVariableMeasurement: boolean("has_variable_measurement").notNull().default(false),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Catálogo de opções (material, acabamento, grupo) — permite cadastrar valores
// avulsos que existem por conta própria, sem depender de um modelo usá-los.
// ── AS VERSÕES DA ARTE DE UMA PEÇA ──
// Cada thumb que a Arte mandou para aprovação vira uma linha: no envio
// (submit-for-approval), no reenvio da correção (resubmit) e na troca
// (update-thumb). Antes a história morava só no texto da trilha de auditoria
// ("Anterior: X → Novo: Y") e em `previousApprovalThumbUrl` — dois passos de
// memória, não uma história. `origem` diz por onde a versão entrou.
export const itemArtVersions = pgTable("item_art_versions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  itemId: varchar("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
  thumbUrl: text("thumb_url").notNull(),
  origem: text("origem").notNull(), // envio | reenvio | troca
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (table) => [
  index("IDX_item_art_versions_item_id").on(table.itemId),
]);

// ── OS BOOKS DE UM EVENTO, com história ──
// `items.book_url` guarda só o book ATUAL (a rota limpa o anterior antes de
// gravar o novo). Quem precisa do book que o patrocinador aprovou há dois
// meses não tinha onde achar. Cada publicação vira uma linha aqui.
export const eventBooks = pgTable("event_books", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  bookUrl: text("book_url").notNull(),
  itemCount: integer("item_count").notNull().default(0),
  createdBy: text("created_by"),
  // O QUE MUDOU nesta publicação (pedido do dono, 25/08). Primeira publicação:
  // opcional. REPUBLICAÇÃO: obrigatório — quem recebe o e-mail do book novo
  // precisa saber o que mudou sem folhear as páginas comparando. Sai no
  // e-mail e na aba Books das Versões.
  comment: text("comment"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (table) => [
  index("IDX_event_books_event_id").on(table.eventId),
]);

export const catalogOptions = pgTable("catalog_options", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  kind: text("kind").notNull(), // "material" | "finish" | "group"
  value: text("value").notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Gestão de Prazos: registro leve de cobranças (quem cobrou o quê, quando).
// Fecha o loop cobrança→resultado: o drill mostra "cobrado ontem por Fulano"
// e alerta quando a pendência segue parada dias depois da cobrança.
export const prazoCobrancas = pgTable("prazo_cobrancas", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  targetType: text("target_type").notNull(), // "event" | "sponsor"
  targetId: varchar("target_id").notNull(), // eventId ou sponsorId
  userName: text("user_name").notNull(),
  // Data PROMETIDA pelo responsável no ato da cobrança ("YYYY-MM-DD" no fuso
  // do negócio). É `text`, não `timestamp`, de propósito: o que se combina ao
  // telefone é um DIA-calendário ("fica pronto sexta"), não um instante — a
  // mesma convenção de prazoSnapshots.day. Transforma a cobrança de post-it
  // ("liguei") em compromisso ("você me disse quinta").
  promisedFor: text("promised_for"),
  // Nota curta do que foi combinado. O teto de 280 é aplicado no zod da rota,
  // não no banco: encurtar limite de coluna depois exige migração, encurtar
  // validação não.
  note: text("note"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (table) => [
  index("IDX_prazo_cobrancas_target").on(table.targetType, table.targetId),
]);

// Gestão de Prazos: snapshot diário dos KPIs (1 linha por dia de negócio) —
// alimenta a tendência ▲▼ contra o último registro nos cards. Escrito pelo job
// services/prazoSnapshots.ts (NÃO mais dentro do GET: leitura com efeito
// colateral fazia a série virar "valor da última visita", e dias sem acesso
// simplesmente não existiam).
//
// Decisão consciente: NÃO existe coluna `sem_pecas` aqui. "Sem peças" é faixa
// de triagem, não cartão de KPI com tendência — coluna que ninguém lê é dívida.
export const prazoSnapshots = pgTable("prazo_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  day: text("day").notNull().unique(), // YYYY-MM-DD no fuso do negócio (America/Sao_Paulo)
  atrasados: integer("atrasados").notNull(),
  saidas7d: integer("saidas_7d").notNull(),
  pecasAtrasadas: integer("pecas_atrasadas").notNull(),
  emDia: integer("em_dia").notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Gestão de Prazos: fecho diário POR EVENTO — base da faixa "O que mudou
// desde ontem". O snapshot agregado acima diz que os atrasados subiram de 4
// para 6; este diz QUAIS dois entraram, que é a primeira pergunta das 8h.
export const prazoEventSnapshots = pgTable("prazo_event_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  day: text("day").notNull(), // YYYY-MM-DD no fuso do negócio (America/Sao_Paulo)
  eventId: varchar("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  hasOverdue: boolean("has_overdue").notNull(),
  pecasAtrasadas: integer("pecas_atrasadas").notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (table) => [
  // É o `target` do onConflictDoUpdate do job — sem ele o upsert horário
  // duplica linha por evento a cada tick, e a comparação passa a somar o
  // mesmo evento N vezes.
  uniqueIndex("UQ_prazo_event_snapshots_day_event").on(table.day, table.eventId),
  // Busca do dia base (MAX(day) < hoje) e leitura do dia inteiro.
  index("IDX_prazo_event_snapshots_day").on(table.day),
]);

// Notifications table
export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: text("type").notNull(), // eventCreated, itemAdded, arteApproved, deadlineAlert, eventCompleted
  message: text("message").notNull(),
  eventId: varchar("event_id").references(() => events.id, { onDelete: "cascade" }),
  itemId: varchar("item_id").references(() => items.id, { onDelete: "cascade" }),
  targetRoles: text("target_roles").array().notNull().default(sql`ARRAY['admin', 'solicitacao', 'arte', 'grafica', 'atendimento']::text[]`), // Perfis que devem receber
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (table) => [
  // Notifications are queried ordered by date and filtered by isRead — without
  // this index the table becomes a sequential scan as data grows.
  index("IDX_notifications_created_at").on(table.createdAt),
  index("IDX_notifications_is_read").on(table.isRead),
]);

// Production updates table (for Gráfica module)
export const productionUpdates = pgTable("production_updates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  itemId: varchar("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
  deliveredBy: text("delivered_by"),
  photoUrl: text("photo_url"),
  quantityProduced: integer("quantity_produced").notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (table) => [
  index("IDX_production_updates_item_id").on(table.itemId),
]);

// Users table (for authentication and audit trail)
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("solicitacao"), // admin, solicitacao, arte, grafica, atendimento
  mustChangePassword: boolean("must_change_password").notNull().default(true),
  // QUANDO A PESSOA ENTROU PELA ÚLTIMA VEZ. Sem isto, a tela de usuários
  // lista quem TEM acesso e nunca diz quem USA: quem saiu da empresa há seis
  // meses aparece igual a quem entrou hoje — e essa é a pergunta central de
  // uma tela de controle de acesso.
  //
  // Gravada nos DOIS caminhos de entrada (senha em routes/auth.ts e SSO em
  // index.ts), e em nenhum outro lugar: renovar sessão não é login.
  //
  // NULL é legítimo e IRRECUPERÁVEL: nada registrava login antes da coluna —
  // nem o audit_log tem ação de entrada, e a tabela de sessões é rolling de
  // 7 dias. Uma conta com NULL não é "nunca usada"; é "anterior ao registro".
  // A tela que consumir isto tem de dizer as duas coisas de formas diferentes.
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

// Comments table (discussion on items)
export const comments = pgTable("comments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  itemId: varchar("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
  userId: varchar("user_id").references(() => users.id, { onDelete: "set null" }),
  userName: text("user_name").notNull(), // Denormalized for deleted users
  content: text("content").notNull(),
  itemStatus: text("item_status"), // Status do item quando o comentário foi feito
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (table) => [
  index("IDX_comments_item_id").on(table.itemId),
]);

// Fotos anexadas pela Gráfica ao longo do fluxo. A tabela nasceu só para
// entrega; "kind" permite guardar também as da conferência sem duplicar
// estrutura — o default mantém as linhas antigas como entrega.
export const deliveryPhotos = pgTable("delivery_photos", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  itemId: varchar("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
  photoUrl: text("photo_url").notNull(),
  kind: text("kind").notNull().default("delivery"), // "delivery" | "conference"
  uploadedBy: text("uploaded_by").notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (table) => [
  index("IDX_delivery_photos_item_id").on(table.itemId),
]);

// Audit Logs table (track all modifications)
export const auditLogs = pgTable("audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: "set null" }),
  userName: text("user_name").notNull(), // Denormalized for deleted users
  action: text("action").notNull(), // created, updated, deleted, approved, delivered, etc.
  entityType: text("entity_type").notNull(), // event, item, comment
  entityId: varchar("entity_id").notNull(),
  details: text("details"), // JSON string with change details
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (table) => [
  // A tabela só cresce e é lida ordenada por data (e filtrada por entidade) em
  // várias telas — sem índice o Postgres varre e ordena tudo a cada request.
  index("IDX_audit_logs_created_at").on(table.createdAt),
  // Estoque e outras telas filtram por entityType + entityId juntos.
  // Nota: índice standalone em entityId foi removido pois entity_id pode ser
  // muito longo (>2704 bytes) em produção, estourando o limite btree.
  // O índice composto abaixo cobre os casos de uso relevantes.
]);

// Inventory Assets table (Acervo)
export const inventoryAssets = pgTable("inventory_assets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  originalItemId: varchar("original_item_id").references(() => items.id, { onDelete: "set null" }),
  displayId: text("display_id").notNull().unique(), // ex: #EST-0062-1
  name: text("name").notNull(),
  quantity: integer("quantity").notNull().default(1), // unidades (1 para registros individuais)
  franchiseTags: text("franchise_tags").array().notNull().default(sql`ARRAY[]::text[]`),
  sponsorIds: text("sponsor_ids").array().notNull().default(sql`ARRAY[]::text[]`), // patrocinadores impressos
  approvalThumbUrl: text("approval_thumb_url"), // thumbnail da arte aprovada
  condition: text("condition").notNull().default("PERFEITO"), // PERFEITO, AVARIA_LEVE, SUCATA
  location: text("location"),
  trackingStatus: text("tracking_status").notNull().default("NO_GALPAO"), // NO_GALPAO, EM_USO, AGUARDANDO_TRIAGEM, DESCARTADO
  notes: text("notes"),
  autoAdded: boolean("auto_added").notNull().default(false), // true = adicionado automaticamente pela gráfica
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
}, (table) => [
  // getAssetsByOriginalItemId (auto-cadastro) e filtro da fila de triagem.
  index("IDX_inventory_assets_original_item_id").on(table.originalItemId),
  index("IDX_inventory_assets_tracking_status").on(table.trackingStatus),
]);

// Event-Inventory Allocations (pivot)
export const eventInventoryAllocations = pgTable("event_inventory_allocations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  assetId: varchar("asset_id").notNull().references(() => inventoryAssets.id, { onDelete: "cascade" }),
  allocatedAt: timestamp("allocated_at").notNull().default(sql`now()`),
}, (table) => [
  index("IDX_event_inventory_allocations_event_id").on(table.eventId),
  index("IDX_event_inventory_allocations_asset_id").on(table.assetId),
]);

// Relations
export const eventsRelations = relations(events, ({ many }) => ({
  items: many(items),
  notifications: many(notifications),
  eventSponsors: many(eventSponsors),
  quotaRules: many(eventQuotaRules),
}));

export const eventQuotaRulesRelations = relations(eventQuotaRules, ({ one }) => ({
  event: one(events, {
    fields: [eventQuotaRules.eventId],
    references: [events.id],
  }),
}));

export const sponsorsRelations = relations(sponsors, ({ many }) => ({
  eventSponsors: many(eventSponsors),
  itemSponsors: many(itemSponsors),
}));

export const eventSponsorsRelations = relations(eventSponsors, ({ one }) => ({
  event: one(events, {
    fields: [eventSponsors.eventId],
    references: [events.id],
  }),
  sponsor: one(sponsors, {
    fields: [eventSponsors.sponsorId],
    references: [sponsors.id],
  }),
}));

export const itemSponsorsRelations = relations(itemSponsors, ({ one }) => ({
  item: one(items, {
    fields: [itemSponsors.itemId],
    references: [items.id],
  }),
  sponsor: one(sponsors, {
    fields: [itemSponsors.sponsorId],
    references: [sponsors.id],
  }),
}));

export const itemSponsorApprovalsRelations = relations(itemSponsorApprovals, ({ one }) => ({
  item: one(items, {
    fields: [itemSponsorApprovals.itemId],
    references: [items.id],
  }),
  sponsor: one(sponsors, {
    fields: [itemSponsorApprovals.sponsorId],
    references: [sponsors.id],
  }),
}));

export const itemsRelations = relations(items, ({ one, many }) => ({
  event: one(events, {
    fields: [items.eventId],
    references: [events.id],
  }),
  itemSponsors: many(itemSponsors),
  itemSponsorApprovals: many(itemSponsorApprovals),
  notifications: many(notifications),
  productionUpdates: many(productionUpdates),
  comments: many(comments),
  deliveryPhotos: many(deliveryPhotos),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  event: one(events, {
    fields: [notifications.eventId],
    references: [events.id],
  }),
  item: one(items, {
    fields: [notifications.itemId],
    references: [items.id],
  }),
}));

export const productionUpdatesRelations = relations(productionUpdates, ({ one }) => ({
  item: one(items, {
    fields: [productionUpdates.itemId],
    references: [items.id],
  }),
}));

export const usersRelations = relations(users, ({ many }) => ({
  comments: many(comments),
}));

export const commentsRelations = relations(comments, ({ one }) => ({
  item: one(items, {
    fields: [comments.itemId],
    references: [items.id],
  }),
  user: one(users, {
    fields: [comments.userId],
    references: [users.id],
  }),
}));

export const deliveryPhotosRelations = relations(deliveryPhotos, ({ one }) => ({
  item: one(items, {
    fields: [deliveryPhotos.itemId],
    references: [items.id],
  }),
}));

export const inventoryAssetsRelations = relations(inventoryAssets, ({ one, many }) => ({
  originalItem: one(items, {
    fields: [inventoryAssets.originalItemId],
    references: [items.id],
  }),
  allocations: many(eventInventoryAllocations),
}));

export const eventInventoryAllocationsRelations = relations(eventInventoryAllocations, ({ one }) => ({
  event: one(events, {
    fields: [eventInventoryAllocations.eventId],
    references: [events.id],
  }),
  asset: one(inventoryAssets, {
    fields: [eventInventoryAllocations.assetId],
    references: [inventoryAssets.id],
  }),
}));

// Insert schemas
export const insertEventSchema = createInsertSchema(events).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  startDate: z.string().or(z.date()),
  truckDepartureDate: z.string().or(z.date()),
  priority: z.enum(["baixa", "media", "alta", "urgente"]).optional(),
});

export const insertItemSchema = createInsertSchema(items).omit({
  id: true,
  displayId: true, // Gerado automaticamente no backend
  createdAt: true,
  updatedAt: true,
}).extend({
  quantity: z.number().min(1),
  area: z.string().or(z.number()),
  visual: z.string().or(z.number()),
  calculatedM2: z.string().or(z.number()),
});

// Schema de criação PÚBLICO (o que POST /api/items e /api/items/bulk aceitam do
// cliente). Existe porque insertItemSchema é derivado da tabela: assim que as
// colunas de complemento entraram, elas passaram a ser aceitas automaticamente
// pelo body — e qualquer usuário autenticado poderia FORJAR um parentItemId,
// pendurando uma peça qualquer como "complemento" de outra (inclusive de outro
// evento) e contaminando contractedTotal, ordenação e a fila da Gráfica.
// O parentesco só nasce por POST /api/items/:id/complement, que valida papel,
// status e ancestralidade. insertItemSchema segue existindo para uso INTERNO
// (storage, importação, clonagem) e como base do updateItemSchema.
export const publicInsertItemSchema = insertItemSchema.omit({
  parentItemId: true,
  complementSeq: true,
  complementReason: true,
  complementRequestedBy: true,
  complementRequestedAt: true,
});

export const insertStandardItemSchema = createInsertSchema(standardItems).omit({
  id: true,
  createdAt: true,
}).extend({
  area: z.string().or(z.number()).optional().nullable(),
  visual: z.string().or(z.number()).optional().nullable(),
});

export const insertCatalogOptionSchema = createInsertSchema(catalogOptions).omit({
  id: true,
  createdAt: true,
}).extend({
  kind: z.enum(["material", "finish", "group"]),
  value: z.string().min(1),
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
  createdAt: true,
  isRead: true,
}).extend({
  targetRoles: z.array(z.enum(["admin", "solicitacao", "arte", "grafica", "atendimento"])).default(["admin", "solicitacao", "arte", "grafica", "atendimento"]),
});

export const insertProductionUpdateSchema = createInsertSchema(productionUpdates).omit({
  id: true,
  createdAt: true,
}).extend({
  quantityProduced: z.number().min(0),
});

export const insertSponsorSchema = createInsertSchema(sponsors).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  // "Nenhum executivo" chega do formulário como string vazia, e o Postgres a
  // trata como um id de verdade: tenta casar '' com users.id e derruba o insert
  // com "violates foreign key constraint sponsors_account_executive_id_users_id".
  // A coerção mora aqui — e não na tela — para valer também no PATCH e em
  // qualquer outro caminho que use este schema.
  accountExecutiveId: z.string().nullish().transform(v => (v && v.trim() ? v : null)),
});

export const insertEventSponsorSchema = createInsertSchema(eventSponsors).omit({
  id: true,
  createdAt: true,
});

export const insertItemSponsorSchema = createInsertSchema(itemSponsors).omit({
  id: true,
  createdAt: true,
});

export const insertItemSponsorApprovalSchema = createInsertSchema(itemSponsorApprovals).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertItemArtVersionSchema = createInsertSchema(itemArtVersions).omit({ id: true, createdAt: true });
export const insertEventBookSchema = createInsertSchema(eventBooks).omit({ id: true, createdAt: true });

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  passwordHash: true,
  // Só o login grava o carimbo de acesso — cadastro que o aceitasse poderia
  // fabricar uma conta "usada ontem" que nunca foi aberta.
  lastLoginAt: true,
}).extend({
  password: z.string().min(6, "Senha deve ter no mínimo 6 caracteres"),
  role: z.enum(["admin", "solicitacao", "arte", "grafica", "atendimento"]).default("solicitacao"),
});

export const loginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(1, "Senha obrigatória"),
});

export const changePasswordSchema = z.object({
  // Obrigatória sempre que NÃO for primeiro acesso (ver superRefine abaixo).
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8, "Nova senha deve ter no mínimo 8 caracteres"),
  confirmPassword: z.string(),
  // Quem decide este flag é o SERVIDOR (user.mustChangePassword), que o
  // sobrescreve antes do parse — o valor vindo do client nunca é confiável
  // como isenção. No client ele serve só para a validação ao vivo do form.
  isFirstAccess: z.boolean().optional(),
}).superRefine((data, ctx) => {
  if (!data.isFirstAccess && !data.currentPassword) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Senha atual é obrigatória",
      path: ["currentPassword"],
    });
  }
  if (data.newPassword !== data.confirmPassword) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "As senhas não coincidem",
      path: ["confirmPassword"],
    });
  }
});

export const insertCommentSchema = createInsertSchema(comments).omit({
  id: true,
  createdAt: true,
});

export const insertDeliveryPhotoSchema = createInsertSchema(deliveryPhotos).omit({
  id: true,
  createdAt: true,
});

export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({
  id: true,
  createdAt: true,
});

export const insertInventoryAssetSchema = createInsertSchema(inventoryAssets).omit({
  id: true,
  displayId: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  condition: z.enum(["PERFEITO", "AVARIA_LEVE", "SUCATA"]).default("PERFEITO"),
  franchiseTags: z.array(z.string()).default([]),
  sponsorIds: z.array(z.string()).default([]),
  quantity: z.number().min(1).default(1),
  autoAdded: z.boolean().default(false),
  trackingStatus: z.enum(["NO_GALPAO", "EM_USO", "AGUARDANDO_TRIAGEM", "DESCARTADO"]).default("NO_GALPAO"),
});

export const insertEventInventoryAllocationSchema = createInsertSchema(eventInventoryAllocations).omit({
  id: true,
  allocatedAt: true,
});

export const insertEventQuotaRuleSchema = createInsertSchema(eventQuotaRules).omit({
  id: true,
  createdAt: true,
}).extend({
  itemTypes: z.array(z.string()).default([]),
});

// Types
export type Event = typeof events.$inferSelect;
export type InsertEvent = z.infer<typeof insertEventSchema>;

export type Item = typeof items.$inferSelect;
export type InsertItem = z.infer<typeof insertItemSchema>;
/** O que a API pública aceita criar — sem os campos de parentesco (ver publicInsertItemSchema). */
export type PublicInsertItem = z.infer<typeof publicInsertItemSchema>;

// Item lifecycle statuses. The `status` column is stored as free-form text
// (see items table above), but the application only ever writes one of these
// values — kept here as a typed union so callers can avoid `as any` casts.
export const ITEM_STATUSES = [
  "draft",
  "requested",
  "awaiting_linking",
  "awaiting_submission",
  "awaiting_approval",
  "awaiting_finalization",
  "awaiting_final_review",
  "awaiting_review",
  "in_review",
  "ready_for_production",
  "approved",
  "inProduction",
  "produced",
  "conferred",
  "delivered",
  "canceled",
  "archived",
  // Legacy status compatibility
  "awaiting_sponsor_approval",
  "sponsor_approved",
  "awaiting_creator_review",
] as const;
export type ItemStatus = typeof ITEM_STATUSES[number];

export type StandardItem = typeof standardItems.$inferSelect;
export type InsertStandardItem = z.infer<typeof insertStandardItemSchema>;

export type CatalogOption = typeof catalogOptions.$inferSelect;
export type InsertCatalogOption = z.infer<typeof insertCatalogOptionSchema>;

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;

export type ProductionUpdate = typeof productionUpdates.$inferSelect;
export type InsertProductionUpdate = z.infer<typeof insertProductionUpdateSchema>;

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Comment = typeof comments.$inferSelect;
export type InsertComment = z.infer<typeof insertCommentSchema>;

export type DeliveryPhoto = typeof deliveryPhotos.$inferSelect;
export type InsertDeliveryPhoto = z.infer<typeof insertDeliveryPhotoSchema>;

export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;

export type Sponsor = typeof sponsors.$inferSelect;
export type InsertSponsor = z.infer<typeof insertSponsorSchema>;

export type EventSponsor = typeof eventSponsors.$inferSelect;
export type InsertEventSponsor = z.infer<typeof insertEventSponsorSchema>;

export type ItemSponsor = typeof itemSponsors.$inferSelect;
export type InsertItemSponsor = z.infer<typeof insertItemSponsorSchema>;

export type ItemSponsorApproval = typeof itemSponsorApprovals.$inferSelect;
export type InsertItemSponsorApproval = z.infer<typeof insertItemSponsorApprovalSchema>;

export type ItemArtVersion = typeof itemArtVersions.$inferSelect;
export type InsertItemArtVersion = z.infer<typeof insertItemArtVersionSchema>;
export type EventBook = typeof eventBooks.$inferSelect;
export type InsertEventBook = z.infer<typeof insertEventBookSchema>;

export type InventoryAsset = typeof inventoryAssets.$inferSelect;
export type InsertInventoryAsset = z.infer<typeof insertInventoryAssetSchema>;

export type EventInventoryAllocation = typeof eventInventoryAllocations.$inferSelect;
export type InsertEventInventoryAllocation = z.infer<typeof insertEventInventoryAllocationSchema>;

export type EventQuotaRule = typeof eventQuotaRules.$inferSelect;
export type InsertEventQuotaRule = z.infer<typeof insertEventQuotaRuleSchema>;

// Gestão de Prazos — tipos das tabelas de accountability e série histórica.
// Insert usa $inferInsert (não createInsertSchema): não há formulário nem
// validação de usuário sobre estas tabelas — só o job e a rota admin escrevem,
// e a validação de entrada da cobrança mora no zod da própria rota.
export type PrazoCobranca = typeof prazoCobrancas.$inferSelect;
export type InsertPrazoCobranca = typeof prazoCobrancas.$inferInsert;

export type PrazoSnapshot = typeof prazoSnapshots.$inferSelect;
export type InsertPrazoSnapshot = typeof prazoSnapshots.$inferInsert;

export type PrazoEventSnapshot = typeof prazoEventSnapshots.$inferSelect;
export type InsertPrazoEventSnapshot = typeof prazoEventSnapshots.$inferInsert;
