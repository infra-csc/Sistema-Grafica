-- ─────────────────────────────────────────────────────────────────────────────
-- ÍNDICES DE PERFORMANCE (frente PERF-2, 17/09) — SÓ CRIA, NUNCA APAGA.
--
-- Rodar com: node scripts/indices-performance.mjs   (ver o cabeçalho de lá)
--
-- CONCURRENTLY: cria sem travar escrita na tabela (a tela continua gravando
-- peça enquanto o índice é montado). Custo: não pode rodar dentro de
-- transação — por isso o .mjs executa UM comando por vez, e não este arquivo
-- inteiro de uma vez. Um comando por linha terminada em ";".
--
-- IF NOT EXISTS: rodar duas vezes não faz nada. Os nomes e as definições são
-- IDÊNTICOS aos declarados em shared/schema.ts, para o `db:push` enxergá-los
-- como já existentes (e não tentar recriar nem derrubar).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Parte 1: índices NOVOS ──────────────────────────────────────────────────

-- Delta-sync de peças: GET /api/items?since= → storage.getItemsChangedSince
--   SELECT * FROM items WHERE updated_at >= $1
-- Sem índice é seq scan na tabela inteira a cada reconexão de aba.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_items_updated_at" ON "items" USING btree ("updated_at");

-- Usuário do Kit: GET /api/events e GET /api/notifications →
--   storage.getItemsDoKitDoCriador / getIdsDasPecasDoKitDoCriador
--   ... WHERE deleted_at IS NULL AND kit_remessa_id IS NOT NULL
--         AND kit_remessa_id <> '' AND criado_por_id = $1
CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_items_criado_por_kit" ON "items" USING btree ("criado_por_id","kit_remessa_id");

-- Gestão de Prazos: GET /api/prazos, bloco de cobranças
--   SELECT * FROM prazo_cobrancas WHERE target_id IN (...) ORDER BY created_at DESC
-- O IDX_prazo_cobrancas_target começa por target_type, que este filtro não usa.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_prazo_cobrancas_target_id_created" ON "prazo_cobrancas" USING btree ("target_id","created_at" DESC NULLS FIRST);

-- ── Parte 2: índices JÁ DECLARADOS no schema, do caminho quente ─────────────
-- Dev e produção podem ter drift (um db:push que não rodou, ou abortou no
-- prompt interativo). Estes são no-op onde já existem; onde faltam, são a
-- diferença entre índice e seq scan nas rotas medidas como lentas.

-- getAllItems / getItemsSlimForEvents / getApprovedItems: WHERE deleted_at IS NULL ORDER BY created_at DESC
CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_items_created_at" ON "items" USING btree ("created_at");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_items_deleted_at" ON "items" USING btree ("deleted_at");
-- getItemsByEvent(s) / getItemsParaPrazos: WHERE event_id IN (...) AND deleted_at IS NULL ORDER BY created_at DESC
CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_items_event_id" ON "items" USING btree ("event_id");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_items_event_created" ON "items" USING btree ("event_id","created_at" DESC NULLS FIRST);
-- getPendingItems / getApprovedItems: WHERE status IN (...)
CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_items_status" ON "items" USING btree ("status");
-- getComplementsByParentIds: WHERE parent_item_id = ANY(...) / IS NOT NULL
CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_items_parent_item_id" ON "items" USING btree ("parent_item_id");
-- getItemSponsorsByItemIds: WHERE item_id IN (...)
CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_item_sponsors_item_id" ON "item_sponsors" USING btree ("item_id");
-- getItemSponsorApprovalsByItemIds: WHERE item_id IN (...)
CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_item_sponsor_approvals_item_id" ON "item_sponsor_approvals" USING btree ("item_id");
-- getOpenItemSponsorApprovals / getSponsorUsage: filtro por status
CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_item_sponsor_approvals_status" ON "item_sponsor_approvals" USING btree ("status");
-- getEventSponsors: WHERE event_id = $1
CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_event_sponsors_event_id" ON "event_sponsors" USING btree ("event_id");
-- getAllNotifications: ORDER BY created_at DESC LIMIT 50
CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_notifications_created_at" ON "notifications" USING btree ("created_at");
-- getAllEvents: ORDER BY created_at DESC
CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_events_created_at" ON "events" USING btree ("created_at");
