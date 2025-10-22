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
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

// Items table
export const items = pgTable("items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // "2x1", "rolo", "palco", etc
  description: text("description"), // Descrição personalizada do item
  quantity: integer("quantity").notNull(),
  area: decimal("area", { precision: 10, scale: 2 }).notNull(),
  visual: decimal("visual", { precision: 10, scale: 2 }).notNull(),
  material: text("material").notNull(),
  finish: text("finish").notNull(),
  measurement: text("measurement").notNull(), // Can be edited, starts as area x visual
  calculatedM2: decimal("calculated_m2", { precision: 10, scale: 2 }).notNull(),
  status: text("status").notNull().default("requested"), // requested, approved, inProduction, produced, delivered
  observations: text("observations"),
  quantityProduced: integer("quantity_produced"),
  receivedBy: text("received_by"),
  deliveryPhotoUrl: text("delivery_photo_url"),
  approvedAt: timestamp("approved_at"), // Timestamp quando foi liberado pela Arte
  productionStartedAt: timestamp("production_started_at"), // Timestamp quando produção iniciou
  deliveredAt: timestamp("delivered_at"), // Timestamp quando foi entregue
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
  material: text("material"), // Material único (opcional)
  finish: text("finish"), // Acabamento único (opcional)
  hasVariableMeasurement: boolean("has_variable_measurement").notNull().default(false),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Notifications table
export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: text("type").notNull(), // eventCreated, itemAdded, arteApproved, deadlineAlert
  message: text("message").notNull(),
  eventId: varchar("event_id").references(() => events.id, { onDelete: "cascade" }),
  itemId: varchar("item_id").references(() => items.id, { onDelete: "cascade" }),
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
  password: text("password").notNull(),
  role: text("role").notNull().default("solicitacao"), // admin, solicitacao, arte, grafica
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

// Relations
export const eventsRelations = relations(events, ({ many }) => ({
  items: many(items),
  notifications: many(notifications),
}));

export const itemsRelations = relations(items, ({ one, many }) => ({
  event: one(events, {
    fields: [items.eventId],
    references: [events.id],
  }),
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

// Insert schemas
export const insertEventSchema = createInsertSchema(events).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  startDate: z.string().or(z.date()),
  truckDepartureDate: z.string().or(z.date()),
});

export const insertItemSchema = createInsertSchema(items).omit({
  id: true,
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
});

export const insertProductionUpdateSchema = createInsertSchema(productionUpdates).omit({
  id: true,
  createdAt: true,
}).extend({
  quantityProduced: z.number().min(0),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
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
