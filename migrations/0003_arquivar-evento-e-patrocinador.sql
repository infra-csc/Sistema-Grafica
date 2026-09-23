-- Idempotente: a migração aditiva cria as mesmas colunas (e em produção elas
-- são criadas antes da publicação); quem rodou aquela antes não quebra aqui.
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "arquivado_em" timestamp;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "arquivado_por" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "restaurado_em" timestamp;--> statement-breakpoint
ALTER TABLE "sponsors" ADD COLUMN IF NOT EXISTS "arquivado_em" timestamp;--> statement-breakpoint
ALTER TABLE "sponsors" ADD COLUMN IF NOT EXISTS "arquivado_por" text;