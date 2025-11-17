// Referenced from javascript_database blueprint - updated for full application
import { 
  events, 
  items, 
  standardItems, 
  notifications, 
  productionUpdates,
  comments,
  deliveryPhotos,
  auditLogs,
  users,
  sponsors,
  eventSponsors,
  itemSponsors,
  type Event, 
  type InsertEvent,
  type Item,
  type InsertItem,
  type StandardItem,
  type InsertStandardItem,
  type Notification,
  type InsertNotification,
  type ProductionUpdate,
  type InsertProductionUpdate,
  type Comment,
  type InsertComment,
  type DeliveryPhoto,
  type InsertDeliveryPhoto,
  type AuditLog,
  type InsertAuditLog,
  type User,
  type Sponsor,
  type InsertSponsor,
  type EventSponsor,
  type InsertEventSponsor,
  type ItemSponsor,
  type InsertItemSponsor
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, sql } from "drizzle-orm";

export interface IStorage {
  // Events
  getEvent(id: string): Promise<Event | undefined>;
  getAllEvents(): Promise<Event[]>;
  createEvent(event: InsertEvent): Promise<Event>;
  updateEvent(id: string, data: Partial<InsertEvent>): Promise<Event | undefined>;
  deleteEvent(id: string): Promise<boolean>;
  
  // Items
  getItem(id: string): Promise<Item | undefined>;
  getAllItems(): Promise<Item[]>;
  getItemsByEvent(eventId: string): Promise<Item[]>;
  getPendingItems(): Promise<Item[]>;
  getApprovedItems(): Promise<Item[]>;
  createItem(item: InsertItem): Promise<Item>;
  createBulkItems(items: InsertItem[]): Promise<Item[]>;
  updateItem(id: string, data: Partial<InsertItem>): Promise<Item | undefined>;
  updateItemWithStatusCheck(id: string, fromStatus: string, toStatus: string): Promise<Item | null>;
  approveItem(id: string): Promise<Item | undefined>;
  startProduction(id: string, quantityProduced: number): Promise<Item | undefined>;
  markItemAsDelivered(id: string, receivedBy: string, photoUrl?: string): Promise<Item | undefined>;
  deleteItem(id: string): Promise<boolean>;
  
  // Standard Items
  getStandardItem(id: string): Promise<StandardItem | undefined>;
  getAllStandardItems(): Promise<StandardItem[]>;
  createStandardItem(item: InsertStandardItem): Promise<StandardItem>;
  
  // Notifications
  getNotification(id: string): Promise<Notification | undefined>;
  getAllNotifications(): Promise<Notification[]>;
  getUnreadNotifications(): Promise<Notification[]>;
  createNotification(notification: InsertNotification): Promise<Notification>;
  markNotificationAsRead(id: string): Promise<Notification | undefined>;
  
  // Production Updates
  getProductionUpdates(itemId: string): Promise<ProductionUpdate[]>;
  createProductionUpdate(update: InsertProductionUpdate): Promise<ProductionUpdate>;
  
  // Comments
  getComments(itemId: string): Promise<Comment[]>;
  createComment(comment: InsertComment): Promise<Comment>;
  deleteComment(id: string): Promise<boolean>;
  
  // Delivery Photos
  getDeliveryPhotos(itemId: string): Promise<DeliveryPhoto[]>;
  addDeliveryPhoto(photo: InsertDeliveryPhoto): Promise<DeliveryPhoto>;
  deleteDeliveryPhoto(id: string): Promise<boolean>;
  
  // Audit Logs
  getAuditLogs(entityType?: string, entityId?: string): Promise<AuditLog[]>;
  createAuditLog(log: InsertAuditLog): Promise<AuditLog>;
  
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;
  createUser(user: Omit<User, 'id' | 'createdAt' | 'updatedAt'>): Promise<User>;
  updateUser(id: string, data: Partial<User>): Promise<User | undefined>;
  deleteUser(id: string): Promise<boolean>;
  
  // Sponsors
  getSponsor(id: string): Promise<Sponsor | undefined>;
  getAllSponsors(): Promise<Sponsor[]>;
  createSponsor(sponsor: InsertSponsor): Promise<Sponsor>;
  updateSponsor(id: string, data: Partial<InsertSponsor>): Promise<Sponsor | undefined>;
  deleteSponsor(id: string): Promise<boolean>;
  
  // Event Sponsors (many-to-many relationship)
  getEventSponsors(eventId: string): Promise<EventSponsor[]>;
  addSponsorToEvent(eventSponsor: InsertEventSponsor): Promise<EventSponsor>;
  removeSponsorFromEvent(eventId: string, sponsorId: string): Promise<boolean>;
  
  // Item Sponsors (many-to-many relationship)
  getItemSponsors(itemId: string): Promise<ItemSponsor[]>;
  addSponsorToItem(itemSponsor: InsertItemSponsor): Promise<ItemSponsor>;
  removeSponsorFromItem(itemId: string, sponsorId: string): Promise<boolean>;
  bulkSyncItemSponsors(itemId: string, sponsorIds: string[]): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // Events
  async getEvent(id: string): Promise<Event | undefined> {
    const [event] = await db.select().from(events).where(eq(events.id, id));
    return event || undefined;
  }

  async getAllEvents(): Promise<Event[]> {
    return await db.select().from(events).orderBy(desc(events.createdAt));
  }

  async createEvent(insertEvent: InsertEvent): Promise<Event> {
    // IMPORTANTE: O PostgreSQL armazena timestamps em UTC
    // O navegador envia datetime-local que é convertido para UTC automaticamente
    // Quando retornamos, o JavaScript converte de volta para o timezone local (Brasília)
    const [event] = await db
      .insert(events)
      .values({
        ...insertEvent,
        startDate: new Date(insertEvent.startDate),
        truckDepartureDate: new Date(insertEvent.truckDepartureDate),
      })
      .returning();
    return event;
  }

  async updateEvent(id: string, data: Partial<InsertEvent>): Promise<Event | undefined> {
    const updateData: any = { ...data };
    if (data.startDate) {
      updateData.startDate = new Date(data.startDate);
    }
    if (data.truckDepartureDate) {
      updateData.truckDepartureDate = new Date(data.truckDepartureDate);
    }
    updateData.updatedAt = new Date();

    const [event] = await db
      .update(events)
      .set(updateData)
      .where(eq(events.id, id))
      .returning();
    return event || undefined;
  }

  async deleteEvent(id: string): Promise<boolean> {
    const result = await db.delete(events).where(eq(events.id, id)).returning();
    return result.length > 0;
  }

  // Items
  async getItem(id: string): Promise<Item | undefined> {
    const [item] = await db.select().from(items).where(eq(items.id, id));
    return item || undefined;
  }

  async getAllItems(): Promise<Item[]> {
    return await db.select().from(items).orderBy(desc(items.createdAt));
  }

  async getItemsByEvent(eventId: string): Promise<Item[]> {
    return await db
      .select()
      .from(items)
      .where(eq(items.eventId, eventId))
      .orderBy(desc(items.createdAt));
  }

  async getPendingItems(): Promise<Item[]> {
    return await db
      .select()
      .from(items)
      .where(sql`${items.status} IN ('requested', 'awaiting_sponsor_approval', 'sponsor_approved', 'awaiting_creator_review')`)
      .orderBy(desc(items.createdAt));
  }

  async getApprovedItems(): Promise<Item[]> {
    return await db
      .select()
      .from(items)
      .where(sql`${items.status} IN ('ready_for_production', 'approved', 'inProduction', 'produced', 'delivered')`)
      .orderBy(desc(items.createdAt));
  }

  async createItem(insertItem: InsertItem): Promise<Item> {
    const [item] = await db
      .insert(items)
      .values({
        ...insertItem,
        area: String(insertItem.area),
        visual: String(insertItem.visual),
        calculatedM2: String(insertItem.calculatedM2),
      })
      .returning();
    return item;
  }

  async createBulkItems(insertItems: InsertItem[]): Promise<Item[]> {
    if (insertItems.length === 0) {
      return [];
    }
    
    const normalizedItems = insertItems.map(item => ({
      ...item,
      area: String(item.area),
      visual: String(item.visual),
      calculatedM2: String(item.calculatedM2),
    }));
    
    const createdItems = await db
      .insert(items)
      .values(normalizedItems)
      .returning();
    return createdItems;
  }

  async updateItem(id: string, data: Partial<InsertItem>): Promise<Item | undefined> {
    const updateData: any = { ...data };
    if (data.area !== undefined) {
      updateData.area = String(data.area);
    }
    if (data.visual !== undefined) {
      updateData.visual = String(data.visual);
    }
    if (data.calculatedM2 !== undefined) {
      updateData.calculatedM2 = String(data.calculatedM2);
    }
    updateData.updatedAt = new Date();

    const [item] = await db
      .update(items)
      .set(updateData)
      .where(eq(items.id, id))
      .returning();
    return item || undefined;
  }

  async updateItemWithStatusCheck(id: string, fromStatus: string, toStatus: string): Promise<Item | null> {
    const [item] = await db
      .update(items)
      .set({ 
        status: toStatus as any,
        updatedAt: new Date()
      })
      .where(and(
        eq(items.id, id),
        eq(items.status, fromStatus as any)
      ))
      .returning();
    return item || null;
  }

  async approveItem(id: string): Promise<Item | undefined> {
    const [item] = await db
      .update(items)
      .set({ status: 'approved', approvedAt: new Date(), updatedAt: new Date() })
      .where(eq(items.id, id))
      .returning();
    return item || undefined;
  }

  async startProduction(id: string, quantityProduced: number): Promise<Item | undefined> {
    const item = await this.getItem(id);
    if (!item) return undefined;
    
    // Determine status based on quantity
    let newStatus = 'inProduction';
    if (quantityProduced >= parseInt(item.quantity.toString())) {
      newStatus = 'produced';
    }
    
    // Set productionStartedAt only on first production update
    const updateData: any = {
      status: newStatus,
      quantityProduced,
      updatedAt: new Date()
    };
    
    if (!item.productionStartedAt) {
      updateData.productionStartedAt = new Date();
    }
    
    const [updatedItem] = await db
      .update(items)
      .set(updateData)
      .where(eq(items.id, id))
      .returning();
    return updatedItem || undefined;
  }

  async markItemAsDelivered(id: string, receivedBy: string, photoUrl?: string): Promise<Item | undefined> {
    const [item] = await db
      .update(items)
      .set({ 
        status: 'delivered', 
        receivedBy,
        deliveryPhotoUrl: photoUrl || null,
        deliveredAt: new Date(),
        updatedAt: new Date() 
      })
      .where(eq(items.id, id))
      .returning();
    return item || undefined;
  }

  async deleteItem(id: string): Promise<boolean> {
    const result = await db.delete(items).where(eq(items.id, id)).returning();
    return result.length > 0;
  }

  // Standard Items
  async getStandardItem(id: string): Promise<StandardItem | undefined> {
    const [item] = await db.select().from(standardItems).where(eq(standardItems.id, id));
    return item || undefined;
  }

  async getAllStandardItems(): Promise<StandardItem[]> {
    return await db.select().from(standardItems).orderBy(desc(standardItems.createdAt));
  }

  async createStandardItem(insertItem: InsertStandardItem): Promise<StandardItem> {
    const values: any = { ...insertItem };
    if (insertItem.area !== undefined && insertItem.area !== null) {
      values.area = String(insertItem.area);
    }
    if (insertItem.visual !== undefined && insertItem.visual !== null) {
      values.visual = String(insertItem.visual);
    }
    
    const [item] = await db
      .insert(standardItems)
      .values(values)
      .returning();
    return item;
  }

  async updateStandardItem(id: string, updates: Partial<InsertStandardItem>): Promise<StandardItem | undefined> {
    const values: any = { ...updates, updatedAt: new Date() };
    if (updates.area !== undefined) {
      values.area = updates.area !== null ? String(updates.area) : null;
    }
    if (updates.visual !== undefined) {
      values.visual = updates.visual !== null ? String(updates.visual) : null;
    }
    
    const [item] = await db
      .update(standardItems)
      .set(values)
      .where(eq(standardItems.id, id))
      .returning();
    return item || undefined;
  }

  async deleteStandardItem(id: string): Promise<boolean> {
    const result = await db.delete(standardItems).where(eq(standardItems.id, id)).returning();
    return result.length > 0;
  }

  // Notifications
  async getNotification(id: string): Promise<Notification | undefined> {
    const [notification] = await db.select().from(notifications).where(eq(notifications.id, id));
    return notification || undefined;
  }

  async getAllNotifications(): Promise<Notification[]> {
    return await db.select().from(notifications).orderBy(desc(notifications.createdAt)).limit(50);
  }

  async getUnreadNotifications(): Promise<Notification[]> {
    return await db
      .select()
      .from(notifications)
      .where(eq(notifications.isRead, false))
      .orderBy(desc(notifications.createdAt));
  }

  async createNotification(insertNotification: InsertNotification): Promise<Notification> {
    const [notification] = await db
      .insert(notifications)
      .values(insertNotification)
      .returning();
    return notification;
  }

  async markNotificationAsRead(id: string): Promise<Notification | undefined> {
    const [notification] = await db
      .update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.id, id))
      .returning();
    return notification || undefined;
  }

  // Production Updates
  async getProductionUpdates(itemId: string): Promise<ProductionUpdate[]> {
    return await db
      .select()
      .from(productionUpdates)
      .where(eq(productionUpdates.itemId, itemId))
      .orderBy(desc(productionUpdates.createdAt));
  }

  async createProductionUpdate(insertUpdate: InsertProductionUpdate): Promise<ProductionUpdate> {
    const [update] = await db
      .insert(productionUpdates)
      .values(insertUpdate)
      .returning();
    return update;
  }

  // Comments
  async getComments(itemId: string): Promise<Comment[]> {
    return await db
      .select()
      .from(comments)
      .where(eq(comments.itemId, itemId))
      .orderBy(comments.createdAt);
  }

  async createComment(insertComment: InsertComment): Promise<Comment> {
    const [comment] = await db
      .insert(comments)
      .values(insertComment)
      .returning();
    return comment;
  }

  async deleteComment(id: string): Promise<boolean> {
    const result = await db
      .delete(comments)
      .where(eq(comments.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  // Delivery Photos
  async getDeliveryPhotos(itemId: string): Promise<DeliveryPhoto[]> {
    return await db
      .select()
      .from(deliveryPhotos)
      .where(eq(deliveryPhotos.itemId, itemId))
      .orderBy(deliveryPhotos.createdAt);
  }

  async addDeliveryPhoto(insertPhoto: InsertDeliveryPhoto): Promise<DeliveryPhoto> {
    const [photo] = await db
      .insert(deliveryPhotos)
      .values(insertPhoto)
      .returning();
    return photo;
  }

  async deleteDeliveryPhoto(id: string): Promise<boolean> {
    const result = await db
      .delete(deliveryPhotos)
      .where(eq(deliveryPhotos.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  // Audit Logs
  async getAuditLogs(entityType?: string, entityId?: string): Promise<AuditLog[]> {
    if (entityType && entityId) {
      return await db
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.entityType, entityType),
            eq(auditLogs.entityId, entityId)
          )
        )
        .orderBy(desc(auditLogs.createdAt));
    } else if (entityType) {
      return await db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.entityType, entityType))
        .orderBy(desc(auditLogs.createdAt));
    } else if (entityId) {
      return await db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.entityId, entityId))
        .orderBy(desc(auditLogs.createdAt));
    }
    
    return await db
      .select()
      .from(auditLogs)
      .orderBy(desc(auditLogs.createdAt));
  }

  async createAuditLog(insertLog: InsertAuditLog): Promise<AuditLog> {
    const [log] = await db
      .insert(auditLogs)
      .values(insertLog)
      .returning();
    return log;
  }

  // Users
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }

  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users).orderBy(desc(users.createdAt));
  }

  async createUser(insertUser: Omit<User, 'id' | 'createdAt' | 'updatedAt'>): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  async updateUser(id: string, data: Partial<User>): Promise<User | undefined> {
    const updateData: any = { ...data, updatedAt: new Date() };
    const [user] = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, id))
      .returning();
    return user || undefined;
  }

  async deleteUser(id: string): Promise<boolean> {
    const result = await db
      .delete(users)
      .where(eq(users.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  // Sponsors
  async getSponsor(id: string): Promise<Sponsor | undefined> {
    const [sponsor] = await db.select().from(sponsors).where(eq(sponsors.id, id));
    return sponsor || undefined;
  }

  async getAllSponsors(): Promise<Sponsor[]> {
    return await db.select().from(sponsors).orderBy(desc(sponsors.createdAt));
  }

  async createSponsor(insertSponsor: InsertSponsor): Promise<Sponsor> {
    const [sponsor] = await db
      .insert(sponsors)
      .values(insertSponsor)
      .returning();
    return sponsor;
  }

  async updateSponsor(id: string, data: Partial<InsertSponsor>): Promise<Sponsor | undefined> {
    const updateData: any = { ...data, updatedAt: new Date() };
    const [sponsor] = await db
      .update(sponsors)
      .set(updateData)
      .where(eq(sponsors.id, id))
      .returning();
    return sponsor || undefined;
  }

  async deleteSponsor(id: string): Promise<boolean> {
    const result = await db
      .delete(sponsors)
      .where(eq(sponsors.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  // Event Sponsors
  async getEventSponsors(eventId: string): Promise<EventSponsor[]> {
    return await db
      .select()
      .from(eventSponsors)
      .where(eq(eventSponsors.eventId, eventId))
      .orderBy(desc(eventSponsors.createdAt));
  }

  async addSponsorToEvent(insertEventSponsor: InsertEventSponsor): Promise<EventSponsor> {
    const [eventSponsor] = await db
      .insert(eventSponsors)
      .values(insertEventSponsor)
      .returning();
    return eventSponsor;
  }

  async removeSponsorFromEvent(eventId: string, sponsorId: string): Promise<boolean> {
    const result = await db
      .delete(eventSponsors)
      .where(
        and(
          eq(eventSponsors.eventId, eventId),
          eq(eventSponsors.sponsorId, sponsorId)
        )
      );
    return result.rowCount !== null && result.rowCount > 0;
  }

  // Item Sponsors
  async getItemSponsors(itemId: string): Promise<ItemSponsor[]> {
    return await db
      .select()
      .from(itemSponsors)
      .where(eq(itemSponsors.itemId, itemId))
      .orderBy(desc(itemSponsors.createdAt));
  }

  async addSponsorToItem(insertItemSponsor: InsertItemSponsor): Promise<ItemSponsor> {
    const [itemSponsor] = await db
      .insert(itemSponsors)
      .values(insertItemSponsor)
      .returning();
    return itemSponsor;
  }

  async removeSponsorFromItem(itemId: string, sponsorId: string): Promise<boolean> {
    const result = await db
      .delete(itemSponsors)
      .where(
        and(
          eq(itemSponsors.itemId, itemId),
          eq(itemSponsors.sponsorId, sponsorId)
        )
      );
    return result.rowCount !== null && result.rowCount > 0;
  }

  async bulkSyncItemSponsors(itemId: string, sponsorIds: string[]): Promise<void> {
    // Remove all existing sponsors for this item
    await db.delete(itemSponsors).where(eq(itemSponsors.itemId, itemId));
    
    // Add new sponsors
    if (sponsorIds.length > 0) {
      await db.insert(itemSponsors).values(
        sponsorIds.map(sponsorId => ({
          itemId,
          sponsorId,
        }))
      );
    }
  }
}

export const storage = new DatabaseStorage();
