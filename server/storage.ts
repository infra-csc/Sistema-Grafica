// Referenced from javascript_database blueprint - updated for full application
import { 
  events, 
  items, 
  standardItems,
  catalogOptions,
  type CatalogOption,
  type InsertCatalogOption,
  notifications, 
  productionUpdates,
  comments,
  deliveryPhotos,
  auditLogs,
  users,
  sponsors,
  eventSponsors,
  itemSponsors,
  itemSponsorApprovals,
  inventoryAssets,
  eventInventoryAllocations,
  eventQuotaRules,
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
  type InsertItemSponsor,
  type ItemSponsorApproval,
  type InsertItemSponsorApproval,
  type InventoryAsset,
  type InsertInventoryAsset,
  type EventInventoryAllocation,
  type EventQuotaRule,
  type ItemStatus,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, sql, or, lt, ne, inArray } from "drizzle-orm";

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
  setItemsBookUrl(itemIds: string[], bookUrl: string | null): Promise<number>;
  updateItemWithStatusCheck(id: string, fromStatus: ItemStatus, toStatus: ItemStatus): Promise<Item | null>;
  approveItem(id: string): Promise<Item | undefined>;
  startProduction(id: string, quantityProduced: number): Promise<Item | undefined>;
  markItemAsDelivered(id: string, receivedBy: string, photoUrl?: string): Promise<Item | undefined>;
  deleteItem(id: string): Promise<boolean>;
  
  // Standard Items
  getStandardItem(id: string): Promise<StandardItem | undefined>;
  getAllStandardItems(): Promise<StandardItem[]>;
  createStandardItem(item: InsertStandardItem): Promise<StandardItem>;
  getCatalogOptions(kind?: string): Promise<CatalogOption[]>;
  createCatalogOption(option: InsertCatalogOption): Promise<CatalogOption>;
  deleteCatalogOption(kind: string, value: string): Promise<boolean>;
  renameStandardItemGroup(oldName: string, newName: string): Promise<number>;
  
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
  getAllItemSponsors(): Promise<ItemSponsor[]>;
  addSponsorToItem(itemSponsor: InsertItemSponsor): Promise<ItemSponsor>;
  removeSponsorFromItem(itemId: string, sponsorId: string): Promise<boolean>;
  bulkSyncItemSponsors(itemId: string, sponsorIds: string[]): Promise<void>;
  
  // Item Sponsor Approvals (individual sponsor approval tracking)
  getAllItemSponsorApprovals(): Promise<ItemSponsorApproval[]>;
  getItemSponsorApprovals(itemId: string): Promise<ItemSponsorApproval[]>;
  getItemSponsorApproval(itemId: string, sponsorId: string): Promise<ItemSponsorApproval | undefined>;
  createItemSponsorApproval(approval: InsertItemSponsorApproval): Promise<ItemSponsorApproval>;
  updateItemSponsorApproval(id: string, data: Partial<InsertItemSponsorApproval>): Promise<ItemSponsorApproval | undefined>;
  deleteItemSponsorApprovals(itemId: string): Promise<boolean>;
  initializeItemSponsorApprovals(itemId: string, sponsorIds: string[]): Promise<void>;

  // Inventory Assets (Acervo)
  getAllInventoryAssets(): Promise<InventoryAsset[]>;
  getInventoryAsset(id: string): Promise<InventoryAsset | undefined>;
  getAvailableAssetsByFranchise(franchise: string): Promise<InventoryAsset[]>;
  getAssetsAwaitingTriage(): Promise<InventoryAsset[]>;
  getAssetsByOriginalItemId(originalItemId: string): Promise<InventoryAsset[]>;
  createInventoryAsset(asset: Omit<InsertInventoryAsset, 'displayId'> & { displayId?: string }): Promise<InventoryAsset>;
  createInventoryAssets(assets: Array<Omit<InsertInventoryAsset, 'displayId'> & { displayId: string }>): Promise<InventoryAsset[]>;
  updateInventoryAsset(id: string, data: Partial<InsertInventoryAsset>): Promise<InventoryAsset | undefined>;
  deleteInventoryAsset(id: string): Promise<boolean>;
  markAssetsInUseForEvent(eventId: string, departureDate: Date): Promise<number>;
  markAssetsAwaitingTriageForEvent(eventId: string): Promise<number>;

  // Event Inventory Allocations
  getEventAllocations(eventId: string): Promise<EventInventoryAllocation[]>;
  getAssetAllocations(assetId: string): Promise<Array<EventInventoryAllocation & { event: Event }>>;
  allocateAssetToEvent(eventId: string, assetId: string): Promise<EventInventoryAllocation>;
  deallocateAsset(allocationId: string): Promise<boolean>;

  // Quota Rules
  getEventQuotaRules(eventId: string): Promise<EventQuotaRule[]>;
  upsertEventQuotaRule(eventId: string, quota: string, itemTypes: string[]): Promise<EventQuotaRule>;
  deleteEventQuotaRule(eventId: string, quota: string): Promise<void>;
  previewAutoLink(eventId: string): Promise<Array<{ sponsorId: string; sponsorName: string; quota: string; items: Array<{ itemId: string; displayId: string; type: string; description: string | null }> }>>;
  autoLinkByQuota(eventId: string): Promise<number>;
  updateEventSponsorQuota(eventId: string, sponsorId: string, quota: string | null): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  private displayIdSequenceInitialized: Promise<void> | null = null;

  private async ensureDisplayIdSequence(): Promise<void> {
    // Lazy initialization - apenas inicializa uma vez
    if (this.displayIdSequenceInitialized) {
      return this.displayIdSequenceInitialized;
    }

    this.displayIdSequenceInitialized = (async () => {
      try {
        // Verificar se sequence já existe
        const seqExists = await db.execute(sql`
          SELECT 1 FROM pg_sequences 
          WHERE schemaname = 'public' AND sequencename = 'item_display_id_seq'
        `);

        if (seqExists.rows.length > 0) {
          return; // Sequence já existe
        }

        // Calcular próximo ID baseado nos items existentes
        const maxIdResult = await db.execute(sql`
          SELECT MAX(CAST(SUBSTRING(display_id FROM '#(\\d+)') AS INTEGER)) as max_num
          FROM items
          WHERE display_id ~ '^#\\d+$'
        `);

        const maxNum = maxIdResult.rows[0]?.max_num;
        const startValue = maxNum != null && Number(maxNum) > 0 ? Number(maxNum) + 1 : 1;

        // Criar sequence com valor inicial dinâmico
        await db.execute(sql.raw(`CREATE SEQUENCE item_display_id_seq START WITH ${startValue}`));
      } catch (error) {
        console.error('Erro ao criar sequence item_display_id_seq:', error);
        throw error; // Re-throw para que a promise seja rejeitada
      }
    })();

    return this.displayIdSequenceInitialized;
  }

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
      .where(sql`${items.status} IN ('requested', 'awaiting_linking', 'awaiting_sponsor_approval', 'sponsor_approved', 'awaiting_creator_review')`)
      .orderBy(desc(items.createdAt));
  }

  async getApprovedItems(): Promise<Item[]> {
    return await db
      .select()
      .from(items)
      .where(sql`${items.status} IN ('ready_for_production', 'pronto_para_producao', 'approved', 'inProduction', 'produced', 'conferred', 'delivered')`)
      .orderBy(desc(items.createdAt));
  }

  private async generateNextDisplayId(): Promise<string> {
    // Garantir que a sequence existe antes de usar (lazy initialization)
    await this.ensureDisplayIdSequence();
    
    // Usar sequence PostgreSQL para garantir thread-safety
    // A sequence é auto-incrementada atomicamente, sem race conditions
    const result = await db.execute(sql`SELECT nextval('item_display_id_seq') as next_id`);
    const nextNumber = Number(result.rows[0].next_id);
    
    // Formatar com zero-padding (ex: 58 -> #0058)
    // Suporta até #9999 (4 dígitos)
    return `#${String(nextNumber).padStart(4, '0')}`;
  }

  async createItem(insertItem: InsertItem): Promise<Item> {
    const displayId = await this.generateNextDisplayId();
    
    const [item] = await db
      .insert(items)
      .values({
        ...insertItem,
        displayId,
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
    
    // Gerar todos os displayIds em uma única query (generate_series + nextval),
    // em vez de um await sequencial por item — a sequence garante atomicidade
    // e ordem, então isso é seguro e evita N round-trips ao banco.
    await this.ensureDisplayIdSequence();
    const seqResult = await db.execute(sql`
      SELECT nextval('item_display_id_seq') as next_id
      FROM generate_series(1, ${insertItems.length})
    `);
    const displayIds: string[] = seqResult.rows.map((row: any) =>
      `#${String(Number(row.next_id)).padStart(4, '0')}`
    );

    const normalizedItems = insertItems.map((item, index) => ({
      ...item,
      displayId: displayIds[index],
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

  // Vincula (ou remove) o PDF do book de aprovação nas peças informadas.
  async setItemsBookUrl(itemIds: string[], bookUrl: string | null): Promise<number> {
    if (itemIds.length === 0) return 0;
    const res = await db
      .update(items)
      .set({ bookUrl, updatedAt: new Date() })
      .where(inArray(items.id, itemIds))
      .returning();
    return res.length;
  }

  async updateItemWithStatusCheck(id: string, fromStatus: ItemStatus, toStatus: ItemStatus): Promise<Item | null> {
    const [item] = await db
      .update(items)
      .set({
        status: toStatus,
        updatedAt: new Date()
      })
      .where(and(
        eq(items.id, id),
        eq(items.status, fromStatus)
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
    const values: any = { ...updates };
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

  async renameStandardItemGroup(oldName: string, newName: string): Promise<number> {
    const result = await db
      .update(standardItems)
      .set({ group: newName })
      .where(eq(standardItems.group, oldName))
      .returning();
    return result.length;
  }

  async deleteStandardItemGroup(name: string): Promise<number> {
    const result = await db
      .update(standardItems)
      .set({ group: null })
      .where(eq(standardItems.group, name))
      .returning();
    return result.length;
  }

  async renameStandardItemFinish(oldName: string, newName: string): Promise<number> {
    const result = await db
      .update(standardItems)
      .set({ finish: newName })
      .where(eq(standardItems.finish, oldName))
      .returning();
    return result.length;
  }

  async deleteStandardItemFinish(name: string): Promise<number> {
    const result = await db
      .update(standardItems)
      .set({ finish: null })
      .where(eq(standardItems.finish, name))
      .returning();
    return result.length;
  }

  async renameStandardItemMaterial(oldName: string, newName: string): Promise<number> {
    const result = await db
      .update(standardItems)
      .set({ material: newName })
      .where(eq(standardItems.material, oldName))
      .returning();
    return result.length;
  }

  async deleteStandardItemMaterial(name: string): Promise<number> {
    const result = await db
      .update(standardItems)
      .set({ material: null })
      .where(eq(standardItems.material, name))
      .returning();
    return result.length;
  }

  // Catálogo de opções avulsas (material/acabamento/grupo)
  async getCatalogOptions(kind?: string): Promise<CatalogOption[]> {
    const rows = kind
      ? await db.select().from(catalogOptions).where(eq(catalogOptions.kind, kind))
      : await db.select().from(catalogOptions);
    return rows.sort((a, b) => a.value.localeCompare(b.value, "pt-BR"));
  }

  async createCatalogOption(option: InsertCatalogOption): Promise<CatalogOption> {
    const value = option.value.trim();
    // Evita duplicatas do mesmo tipo (case-insensitive)
    const existing = await db.select().from(catalogOptions).where(eq(catalogOptions.kind, option.kind));
    const dup = existing.find(o => o.value.trim().toLowerCase() === value.toLowerCase());
    if (dup) return dup;
    const [created] = await db.insert(catalogOptions).values({ kind: option.kind, value }).returning();
    return created;
  }

  async deleteCatalogOption(kind: string, value: string): Promise<boolean> {
    const result = await db
      .delete(catalogOptions)
      .where(and(eq(catalogOptions.kind, kind), eq(catalogOptions.value, value)))
      .returning();
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

  // Todos os vínculos item↔patrocinador de uma vez. Usado para enriquecer
  // listas de itens sem fazer 1 query por item (N+1). Mantém a mesma ordem
  // (createdAt desc) do getItemSponsors por item.
  async getAllItemSponsors(): Promise<ItemSponsor[]> {
    return await db
      .select()
      .from(itemSponsors)
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

    if (sponsorIds.length === 0) return;

    // Deduplica e valida a existência dos patrocinadores antes de inserir.
    // Sem isto, um sponsorId de um patrocinador que foi deletado depois da tela
    // carregar (ou um id inválido no estado do cliente) causava violação de FK
    // e o usuário via "erro ao salvar patrocínio". Ids inexistentes são
    // simplesmente ignorados em vez de derrubar toda a operação.
    const uniqueIds = Array.from(new Set(sponsorIds));
    const existing = await db
      .select({ id: sponsors.id })
      .from(sponsors)
      .where(inArray(sponsors.id, uniqueIds));
    const validIds = existing.map(s => s.id);

    if (validIds.length > 0) {
      await db.insert(itemSponsors).values(
        validIds.map(sponsorId => ({ itemId, sponsorId }))
      );
    }
  }

  // Item Sponsor Approvals
  async getAllItemSponsorApprovals(): Promise<ItemSponsorApproval[]> {
    return await db
      .select()
      .from(itemSponsorApprovals)
      .orderBy(desc(itemSponsorApprovals.createdAt));
  }

  async getItemSponsorApprovals(itemId: string): Promise<ItemSponsorApproval[]> {
    return await db
      .select()
      .from(itemSponsorApprovals)
      .where(eq(itemSponsorApprovals.itemId, itemId))
      .orderBy(desc(itemSponsorApprovals.createdAt));
  }

  async getItemSponsorApproval(itemId: string, sponsorId: string): Promise<ItemSponsorApproval | undefined> {
    const [approval] = await db
      .select()
      .from(itemSponsorApprovals)
      .where(
        and(
          eq(itemSponsorApprovals.itemId, itemId),
          eq(itemSponsorApprovals.sponsorId, sponsorId)
        )
      );
    return approval;
  }

  async createItemSponsorApproval(insertApproval: InsertItemSponsorApproval): Promise<ItemSponsorApproval> {
    const [approval] = await db
      .insert(itemSponsorApprovals)
      .values(insertApproval)
      .returning();
    return approval;
  }

  async updateItemSponsorApproval(id: string, data: Partial<InsertItemSponsorApproval>): Promise<ItemSponsorApproval | undefined> {
    const [approval] = await db
      .update(itemSponsorApprovals)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(itemSponsorApprovals.id, id))
      .returning();
    return approval;
  }

  async deleteItemSponsorApprovals(itemId: string): Promise<boolean> {
    const result = await db
      .delete(itemSponsorApprovals)
      .where(eq(itemSponsorApprovals.itemId, itemId));
    return result.rowCount !== null && result.rowCount > 0;
  }

  async initializeItemSponsorApprovals(itemId: string, sponsorIds: string[]): Promise<void> {
    // Delete existing approvals for this item
    await db.delete(itemSponsorApprovals).where(eq(itemSponsorApprovals.itemId, itemId));
    
    // Create new pending approvals for each sponsor
    if (sponsorIds.length > 0) {
      await db.insert(itemSponsorApprovals).values(
        sponsorIds.map(sponsorId => ({
          itemId,
          sponsorId,
          status: 'pending',
        }))
      );
    }
  }

  // ── Inventory Assets ─────────────────────────────────────

  async getAllInventoryAssets(): Promise<InventoryAsset[]> {
    return await db.select().from(inventoryAssets).orderBy(desc(inventoryAssets.createdAt));
  }

  async getInventoryAsset(id: string): Promise<InventoryAsset | undefined> {
    const [asset] = await db.select().from(inventoryAssets).where(eq(inventoryAssets.id, id));
    return asset;
  }

  async getAssetsAwaitingTriage(): Promise<InventoryAsset[]> {
    return await db.select().from(inventoryAssets)
      .where(eq(inventoryAssets.trackingStatus, 'AGUARDANDO_TRIAGEM'))
      .orderBy(desc(inventoryAssets.updatedAt));
  }

  async getAssetsByOriginalItemId(originalItemId: string): Promise<InventoryAsset[]> {
    return await db.select().from(inventoryAssets)
      .where(eq(inventoryAssets.originalItemId, originalItemId));
  }

  async getAvailableAssetsByFranchise(franchise: string): Promise<InventoryAsset[]> {
    const tag = franchise.toLowerCase().replace(/\s+/g, '_');
    return await db.select().from(inventoryAssets)
      .where(and(
        eq(inventoryAssets.trackingStatus, 'NO_GALPAO'),
        ne(inventoryAssets.condition, 'SUCATA'),
        sql`EXISTS (
          SELECT 1 FROM unnest(${inventoryAssets.franchiseTags}) AS ft(tag)
          WHERE lower(ft.tag) LIKE '%' || ${tag} || '%' OR ${tag} LIKE '%' || lower(ft.tag) || '%'
        )`
      ));
  }

  async createInventoryAsset(asset: Omit<InsertInventoryAsset, 'displayId'> & { displayId?: string }): Promise<InventoryAsset> {
    let displayId = asset.displayId;
    if (!displayId) {
      const countResult = await db.select({ count: sql<number>`count(*)` }).from(inventoryAssets);
      const count = Number(countResult[0]?.count ?? 0);
      displayId = `#EST-${String(count + 1).padStart(4, '0')}`;
    }
    const { displayId: _omit, ...rest } = asset as any;
    const [created] = await db.insert(inventoryAssets).values({ ...rest, displayId }).returning();
    return created;
  }

  async createInventoryAssets(assets: Array<Omit<InsertInventoryAsset, 'displayId'> & { displayId: string }>): Promise<InventoryAsset[]> {
    if (assets.length === 0) return [];
    const created = await db.insert(inventoryAssets).values(assets as any[]).returning();
    return created;
  }

  async updateInventoryAsset(id: string, data: Partial<InsertInventoryAsset>): Promise<InventoryAsset | undefined> {
    const [updated] = await db.update(inventoryAssets)
      .set({ ...data, updatedAt: new Date() } as any)
      .where(eq(inventoryAssets.id, id))
      .returning();
    return updated;
  }

  async deleteInventoryAsset(id: string): Promise<boolean> {
    const result = await db.delete(inventoryAssets).where(eq(inventoryAssets.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  async markAssetsInUseForEvent(eventId: string, departureDate: Date): Promise<number> {
    // Find all items for this event
    const eventItems = await db.select({ id: items.id }).from(items)
      .where(eq(items.eventId, eventId));
    const itemIds = eventItems.map(i => i.id);
    if (itemIds.length === 0) return 0;

    let updated = 0;
    // Only dispatch assets that:
    // 1. Are currently NO_GALPAO (in warehouse, ready to go)
    // 2. Were last updated BEFORE departure (haven't been through the event cycle yet)
    // This prevents re-dispatching assets that were already triaged back to NO_GALPAO.
    for (const itemId of itemIds) {
      const result = await db.update(inventoryAssets)
        .set({ trackingStatus: 'EM_USO', updatedAt: new Date() } as any)
        .where(and(
          eq(inventoryAssets.originalItemId, itemId),
          eq(inventoryAssets.trackingStatus, 'NO_GALPAO'),
          lt(inventoryAssets.updatedAt as any, departureDate)
        ));
      updated += result.rowCount ?? 0;
    }

    // Manually allocated assets: same guards
    const allocs = await db.select({ assetId: eventInventoryAllocations.assetId })
      .from(eventInventoryAllocations)
      .where(eq(eventInventoryAllocations.eventId, eventId));
    for (const alloc of allocs) {
      const result = await db.update(inventoryAssets)
        .set({ trackingStatus: 'EM_USO', updatedAt: new Date() } as any)
        .where(and(
          eq(inventoryAssets.id, alloc.assetId),
          eq(inventoryAssets.trackingStatus, 'NO_GALPAO'),
          lt(inventoryAssets.updatedAt as any, departureDate)
        ));
      updated += result.rowCount ?? 0;
    }
    return updated;
  }

  async markAssetsAwaitingTriageForEvent(eventId: string): Promise<number> {
    const eventItems = await db.select({ id: items.id }).from(items)
      .where(eq(items.eventId, eventId));
    const itemIds = eventItems.map(i => i.id);
    if (itemIds.length === 0) return 0;

    let updated = 0;
    // Only move EM_USO assets to triage — assets already in NO_GALPAO stayed in the warehouse
    // and do not need triage. Moving NO_GALPAO here would re-queue already-triaged assets.
    for (const itemId of itemIds) {
      const result = await db.update(inventoryAssets)
        .set({ trackingStatus: 'AGUARDANDO_TRIAGEM', updatedAt: new Date() } as any)
        .where(and(
          eq(inventoryAssets.originalItemId, itemId),
          eq(inventoryAssets.trackingStatus, 'EM_USO')
        ));
      updated += result.rowCount ?? 0;
    }

    // Also handle manually allocated assets
    const allocs = await db.select({ assetId: eventInventoryAllocations.assetId })
      .from(eventInventoryAllocations)
      .where(eq(eventInventoryAllocations.eventId, eventId));
    for (const alloc of allocs) {
      const result = await db.update(inventoryAssets)
        .set({ trackingStatus: 'AGUARDANDO_TRIAGEM', updatedAt: new Date() } as any)
        .where(and(
          eq(inventoryAssets.id, alloc.assetId),
          eq(inventoryAssets.trackingStatus, 'EM_USO')
        ));
      updated += result.rowCount ?? 0;
    }
    return updated;
  }

  // ── Event Inventory Allocations ──────────────────────────

  async getEventAllocations(eventId: string): Promise<EventInventoryAllocation[]> {
    return await db.select().from(eventInventoryAllocations)
      .where(eq(eventInventoryAllocations.eventId, eventId));
  }

  async getAssetAllocations(assetId: string): Promise<Array<EventInventoryAllocation & { event: Event }>> {
    const rows = await db
      .select({
        id: eventInventoryAllocations.id,
        eventId: eventInventoryAllocations.eventId,
        assetId: eventInventoryAllocations.assetId,
        allocatedAt: eventInventoryAllocations.allocatedAt,
        event: events,
      })
      .from(eventInventoryAllocations)
      .innerJoin(events, eq(events.id, eventInventoryAllocations.eventId))
      .where(eq(eventInventoryAllocations.assetId, assetId))
      .orderBy(eventInventoryAllocations.allocatedAt);
    return rows as Array<EventInventoryAllocation & { event: Event }>;
  }

  async allocateAssetToEvent(eventId: string, assetId: string): Promise<EventInventoryAllocation> {
    const [alloc] = await db.insert(eventInventoryAllocations)
      .values({ eventId, assetId })
      .returning();
    await db.update(inventoryAssets)
      .set({ trackingStatus: 'EM_USO', updatedAt: new Date() } as any)
      .where(eq(inventoryAssets.id, assetId));
    return alloc;
  }

  async deallocateAsset(allocationId: string): Promise<boolean> {
    const [alloc] = await db.select().from(eventInventoryAllocations)
      .where(eq(eventInventoryAllocations.id, allocationId));
    if (!alloc) return false;
    await db.delete(eventInventoryAllocations).where(eq(eventInventoryAllocations.id, allocationId));
    await db.update(inventoryAssets)
      .set({ trackingStatus: 'NO_GALPAO', updatedAt: new Date() } as any)
      .where(eq(inventoryAssets.id, alloc.assetId));
    return true;
  }

  // ── Quota Rules ────────────────────────────────────────────

  async getEventQuotaRules(eventId: string): Promise<EventQuotaRule[]> {
    return await db.select().from(eventQuotaRules)
      .where(eq(eventQuotaRules.eventId, eventId))
      .orderBy(eventQuotaRules.quota);
  }

  async upsertEventQuotaRule(eventId: string, quota: string, itemTypes: string[]): Promise<EventQuotaRule> {
    // Delete existing rule for this quota+event, then insert fresh
    await db.delete(eventQuotaRules).where(
      and(eq(eventQuotaRules.eventId, eventId), eq(eventQuotaRules.quota, quota))
    );
    const [rule] = await db.insert(eventQuotaRules)
      .values({ eventId, quota, itemTypes })
      .returning();
    return rule;
  }

  async deleteEventQuotaRule(eventId: string, quota: string): Promise<void> {
    await db.delete(eventQuotaRules).where(
      and(eq(eventQuotaRules.eventId, eventId), eq(eventQuotaRules.quota, quota))
    );
  }

  async previewAutoLink(eventId: string): Promise<Array<{ sponsorId: string; sponsorName: string; quota: string; items: Array<{ itemId: string; displayId: string; type: string; description: string | null }> }>> {
    // Get quota rules for this event; fall back to global rules (JSON file) if none exist
    let rules = await db.select().from(eventQuotaRules).where(eq(eventQuotaRules.eventId, eventId));
    if (rules.length === 0) {
      // Read global rules from JSON file as fallback
      try {
        const fs = await import("fs");
        const path = await import("path");
        const GLOBAL_QUOTA_FILE = path.join(process.cwd(), "global-quota-rules.json");
        if (fs.existsSync(GLOBAL_QUOTA_FILE)) {
          const raw = JSON.parse(fs.readFileSync(GLOBAL_QUOTA_FILE, "utf8")) as { quota: string; itemTypes: string[] }[];
          rules = raw.map(r => ({ eventId, quota: r.quota, itemTypes: r.itemTypes })) as any;
        }
      } catch (_) { /* ignore */ }
    }
    if (rules.length === 0) return [];

    // Build quota → itemTypes map (group names, e.g. "Palco", "2x1")
    const ruleMap: Record<string, string[]> = {};
    for (const r of rules) ruleMap[r.quota] = r.itemTypes;

    // Get all sponsors linked to this event (using per-event quota from event_sponsors)
    const evtSponsors = await db.select({
      sponsorId: eventSponsors.sponsorId,
      sponsorName: sponsors.name,
      quota: eventSponsors.quota,
    })
      .from(eventSponsors)
      .innerJoin(sponsors, eq(sponsors.id, eventSponsors.sponsorId))
      .where(eq(eventSponsors.eventId, eventId));

    // Get all items for this event
    const eventItems = await db.select({
      id: items.id,
      displayId: items.displayId,
      type: items.type,
      description: items.description,
    })
      .from(items)
      .where(eq(items.eventId, eventId));

    // Get existing item-sponsor links to avoid duplicates
    const existingLinks = await db.select({ itemId: itemSponsors.itemId, sponsorId: itemSponsors.sponsorId })
      .from(itemSponsors)
      .innerJoin(items, eq(items.id, itemSponsors.itemId))
      .where(eq(items.eventId, eventId));
    const linkedSet = new Set(existingLinks.map(l => `${l.itemId}:${l.sponsorId}`));

    // Prefix-based matching: group "Palco" matches "Palco", "Palco Master", "Palco Lateral", etc.
    const matchesGroup = (itemType: string, group: string): boolean => {
      const t = itemType.toLowerCase().trim();
      const g = group.toLowerCase().trim();
      return t === g || t.startsWith(g + " ") || t.startsWith(g + "(") || t.startsWith(g + " (");
    };

    const preview: Array<{ sponsorId: string; sponsorName: string; quota: string; items: Array<{ itemId: string; displayId: string; type: string; description: string | null }> }> = [];

    for (const sp of evtSponsors) {
      if (!sp.quota || !ruleMap[sp.quota]) continue;
      const allowedGroups = ruleMap[sp.quota];
      const matchingItems = eventItems.filter(it =>
        allowedGroups.some(g => matchesGroup(it.type, g)) &&
        !linkedSet.has(`${it.id}:${sp.sponsorId}`)
      );
      if (matchingItems.length > 0) {
        preview.push({
          sponsorId: sp.sponsorId,
          sponsorName: sp.sponsorName,
          quota: sp.quota,
          items: matchingItems.map(it => ({ itemId: it.id, displayId: it.displayId, type: it.type, description: it.description })),
        });
      }
    }

    return preview;
  }

  async updateEventSponsorQuota(eventId: string, sponsorId: string, quota: string | null): Promise<void> {
    await db.update(eventSponsors)
      .set({ quota })
      .where(and(eq(eventSponsors.eventId, eventId), eq(eventSponsors.sponsorId, sponsorId)));
  }

  async autoLinkByQuota(eventId: string): Promise<number> {
    const preview = await this.previewAutoLink(eventId);
    let linked = 0;
    const touchedItemIds = new Set<string>();
    for (const entry of preview) {
      for (const it of entry.items) {
        try {
          await db.insert(itemSponsors).values({ itemId: it.itemId, sponsorId: entry.sponsorId });
          linked++;
          touchedItemIds.add(it.itemId);
        } catch (_) {
          // ignore duplicate key errors
        }
      }
    }
    if (touchedItemIds.size > 0) {
      const ids = Array.from(touchedItemIds);
      await db.update(items)
        .set({ status: "awaiting_linking" })
        .where(and(inArray(items.id, ids), eq(items.status, "requested")));
    }
    return linked;
  }
}

export const storage = new DatabaseStorage();
