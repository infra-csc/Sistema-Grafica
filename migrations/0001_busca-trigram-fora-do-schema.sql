-- Busca do Histórico (trigram) — objetos que vivem FORA do shared/schema.ts.
--
-- Ficam fora do schema de propósito: declarados lá, o drizzle-kit precisaria
-- da extensão pg_trgm em qualquer banco onde rodasse. São os mesmos de
-- scripts/migracao-aditiva-producao.sql e scripts/criar-indices-de-busca.ts,
-- e por isso idempotentes (IF NOT EXISTS): produção e dev já os têm, e a
-- adoção (npm run db:migrate -- --adotar --aplicar) executa esta migração lá
-- sem mudar nada.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "IDX_audit_logs_details_trgm" ON "audit_logs" USING gin ("details" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "IDX_audit_logs_user_name_trgm" ON "audit_logs" USING gin ("user_name" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "IDX_audit_logs_entity_id_trgm" ON "audit_logs" USING gin ("entity_id" gin_trgm_ops);
