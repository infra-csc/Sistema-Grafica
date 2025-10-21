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
  status: text("status").notNull().default("created"), // created, completed, urgent
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

// Items table
export const items = pgTable("items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // "2x1", "rolo", "palco", etc
  quantity: integer("quantity").notNull(),
  area: decimal("area", { precision: 10, scale: 2 }).notNull(),
  visual: decimal("visual", { precision: 10, scale: 2 }).notNull(),
  material: text("material").notNull(),
  finish: text("finish").notNull(),
  measurement: text("measurement").notNull(), // Can be edited, starts as area x visual
  calculatedM2: decimal("calculated_m2", { precision: 10, scale: 2 }).notNull(),
  status: text("status").notNull().default("requested"), // requested, approved, inProduction, produced, delivered
  observations: text("observations"),
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
  materials: text("materials").array().notNull(), // Array of available materials
  finishes: text("finishes").array().notNull(), // Array of available finishes
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
