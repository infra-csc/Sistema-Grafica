-- KIT NUMA INCLUSÃO SÓ (dono, 23/10): "não seriam várias remessas, seria tudo a
-- mesma inclusão, e ele não precisaria colocar as datas". A linha de
-- kit_remessas passa a ser A INCLUSÃO DO KIT DO EVENTO — uma por evento — e o
-- Kit segue as datas do evento (shared/kit.ts). Esta migração:
--   1. deixa entrega_material NULL-ável (a inclusão nova não tem data);
--   2. JUNTA as remessas que já existem: em cada evento com mais de uma, todas
--      as peças passam para a MAIS ANTIGA (created_at, id) e as outras linhas
--      somem. Uma linha na trilha (audit_logs) por evento juntado. NENHUMA peça
--      é apagada — inclusive as já excluídas (soft) mudam de remessa, para não
--      perderem a marca "peça do Kit". A ORDEM importa: as peças mudam ANTES de
--      a remessa sair (a FK é ON DELETE SET NULL e apagaria a marca);
--   3. cria o índice ÚNICO em event_id (só cabe depois da junção).
-- Idempotente: rodar de novo não acha evento com duas remessas e não faz nada.
-- A mesma junção, em simulação, está em scripts/juntar-remessas-do-kit.mjs.
ALTER TABLE "kit_remessas" ALTER COLUMN "entrega_material" DROP NOT NULL;--> statement-breakpoint
WITH "ordem" AS (
  SELECT "id", "event_id", "versao",
         first_value("versao") OVER (PARTITION BY "event_id" ORDER BY "created_at", "id") AS "fica_versao",
         row_number() OVER (PARTITION BY "event_id" ORDER BY "created_at", "id") AS "posicao",
         count(*) OVER (PARTITION BY "event_id") AS "total"
  FROM "kit_remessas"
), "movidas" AS (
  SELECT o."event_id", count(i."id") AS "pecas"
  FROM "ordem" o LEFT JOIN "items" i ON i."kit_remessa_id" = o."id"
  WHERE o."posicao" > 1
  GROUP BY o."event_id"
)
INSERT INTO "audit_logs" ("user_name", "action", "entity_type", "entity_id", "details")
SELECT 'Sistema (migração 0009)', 'updated', 'event', o."event_id",
       'Kit numa inclusão só: ' || o."total" || ' remessas juntadas (' || string_agg(o."versao", ', ' ORDER BY o."posicao") || ') na '
       || min(o."fica_versao") || ' — ' || coalesce(max(m."pecas"), 0) || ' peça(s) passaram para ela; nenhuma peça foi apagada'
FROM "ordem" o LEFT JOIN "movidas" m ON m."event_id" = o."event_id"
WHERE o."total" > 1
GROUP BY o."event_id", o."total";--> statement-breakpoint
WITH "ordem" AS (
  SELECT "id",
         first_value("id") OVER (PARTITION BY "event_id" ORDER BY "created_at", "id") AS "fica",
         row_number() OVER (PARTITION BY "event_id" ORDER BY "created_at", "id") AS "posicao"
  FROM "kit_remessas"
)
UPDATE "items" SET "kit_remessa_id" = o."fica", "updated_at" = now()
FROM "ordem" o
WHERE "items"."kit_remessa_id" = o."id" AND o."posicao" > 1;--> statement-breakpoint
WITH "ordem" AS (
  SELECT "id", row_number() OVER (PARTITION BY "event_id" ORDER BY "created_at", "id") AS "posicao"
  FROM "kit_remessas"
)
DELETE FROM "kit_remessas" r
USING "ordem" o
WHERE r."id" = o."id" AND o."posicao" > 1
  AND NOT EXISTS (SELECT 1 FROM "items" i WHERE i."kit_remessa_id" = r."id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_kit_remessas_event" ON "kit_remessas" USING btree ("event_id");
