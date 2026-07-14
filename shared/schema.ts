import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, decimal, boolean } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Events table
export const events = pgTable("events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  startDate: timestamp("start_date").notNull(),
  truckDepartureDate: timestamp("truck_departure_date").notNull(),
  status: text("status").notNull().default("created"), // created, completed
  priority: text("priority"), // baixa, media, alta, urgente
  franchise: text("franchise"), // Franquia (ex: "Night Run", "Circuito Estações")
  approvalBookUrl: text("approval_book_url"), // URL do PDF com book de aprovação
  createdBy: varchar("created_by").references(() => users.id, { onDelete: "set null" }),
  // Prazos relativos ao startDate (em dias negativos = dias ANTES do evento)
  deadlineListaImagens: integer("deadline_lista_imagens").default(-25), // Criação dos itens
  deadlineEntregaLayouts: integer("deadline_entrega_layouts").default(-20), // Entrega pela Arte
  deadlineAprovacaoLayout: integer("deadline_aprovacao_layout").default(-12), // Aprovação do patrocinador
  deadlineRevisaoLista: integer("deadline_revisao_lista").default(-8), // Revisão de lista pelo criador
  deadlineProducaoGrafica: integer("deadline_producao_grafica").default(-1), // Produção gráfica
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

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
});

// Item-Sponsors relationship table (many-to-many)
export const itemSponsors = pgTable("item_sponsors", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  itemId: varchar("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
  sponsorId: varchar("sponsor_id").notNull().references(() => sponsors.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

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
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

// Event Quota Rules — maps sponsor tiers to item types per event
export const eventQuotaRules = pgTable("event_quota_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  quota: text("quota").notNull(), // MASTER, GOLD, SILVER, APOIO, MIDIA, MINISTERIO
  itemTypes: text("item_types").array().notNull().default(sql`'{}'::text[]`),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

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
  isReuse: boolean("is_reuse").notNull().default(false), // Se true, peça é reaproveitamento (não precisa de produção)
  approvalThumbUrl: text("approval_thumb_url"), // Thumb/link leve para aprovação
  hasModifiedData: boolean("has_modified_data").notNull().default(false), // Flag: tem dados modificados para notificar Arte
  finalFileUrl: text("final_file_url"), // Link do arquivo final (Drive, S3, etc)
  sponsorApprovedBy: text("sponsor_approved_by"), // Nome do aprovador do patrocinador
  sponsorApprovedAt: timestamp("sponsor_approved_at"), // Quando foi aprovado pelo patrocinador
  creatorReviewedAt: timestamp("creator_reviewed_at"), // Quando criador do evento revisou
  rejectedBySponsor: boolean("rejected_by_sponsor").notNull().default(false), // Flag: reprovado pelo patrocinador (Atendimento)
  rejectedByCreator: boolean("rejected_by_creator").notNull().default(false), // Flag: reprovado pelo criador (Solicitação)
  approvedAt: timestamp("approved_at"), // Timestamp quando foi liberado pela Arte
  productionStartedAt: timestamp("production_started_at"), // Timestamp quando produção iniciou
  producedAt: timestamp("produced_at"), // Timestamp quando foi produzido
  deliveredAt: timestamp("delivered_at"), // Timestamp quando foi entregue
  referenceUrl: text("reference_url"), // Anexo/referência de demonstração das peças (upload do Solicitante)
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

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
});

// Production updates table (for Gráfica module)
export const productionUpdates = pgTable("production_updates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  itemId: varchar("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
  deliveredBy: text("delivered_by"),
  photoUrl: text("photo_url"),
  quantityProduced: integer("quantity_produced").notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Users table (for authentication and audit trail)
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("solicitacao"), // admin, solicitacao, arte, grafica, atendimento
  mustChangePassword: boolean("must_change_password").notNull().default(true),
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
});

// Delivery Photos table (multiple photos per delivery)
export const deliveryPhotos = pgTable("delivery_photos", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  itemId: varchar("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
  photoUrl: text("photo_url").notNull(),
  uploadedBy: text("uploaded_by").notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

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
});

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
});

// Event-Inventory Allocations (pivot)
export const eventInventoryAllocations = pgTable("event_inventory_allocations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  assetId: varchar("asset_id").notNull().references(() => inventoryAssets.id, { onDelete: "cascade" }),
  allocatedAt: timestamp("allocated_at").notNull().default(sql`now()`),
});

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

export const insertStandardItemSchema = createInsertSchema(standardItems).omit({
  id: true,
  createdAt: true,
}).extend({
  area: z.string().or(z.number()).optional().nullable(),
  visual: z.string().or(z.number()).optional().nullable(),
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

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  passwordHash: true,
}).extend({
  password: z.string().min(6, "Senha deve ter no mínimo 6 caracteres"),
  role: z.enum(["admin", "solicitacao", "arte", "grafica", "atendimento"]).default("solicitacao"),
});

export const loginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(1, "Senha obrigatória"),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().optional(),
  newPassword: z.string().min(6, "Nova senha deve ter no mínimo 6 caracteres"),
  confirmPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "As senhas não coincidem",
  path: ["confirmPassword"],
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

export type StandardItem = typeof standardItems.$inferSelect;
export type InsertStandardItem = z.infer<typeof insertStandardItemSchema>;

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

export type InventoryAsset = typeof inventoryAssets.$inferSelect;
export type InsertInventoryAsset = z.infer<typeof insertInventoryAssetSchema>;

export type EventInventoryAllocation = typeof eventInventoryAllocations.$inferSelect;
export type InsertEventInventoryAllocation = z.infer<typeof insertEventInventoryAllocationSchema>;

export type EventQuotaRule = typeof eventQuotaRules.$inferSelect;
export type InsertEventQuotaRule = z.infer<typeof insertEventQuotaRuleSchema>;
