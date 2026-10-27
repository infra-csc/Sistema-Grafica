-- Prazos para peças sem aprovação (Pedro/dono, 26/10). Tudo aditivo — nada
-- existente muda (sem aplicação retroativa):
--   · tabela `configuracoes` (chave → valor jsonb), com a duração da etapa de
--     Aprovação em DIAS CORRIDOS ("dias_da_aprovacao" = 7), editável pelo admin;
--   · na peça, a marca "Arte do cliente" (false em todo o acervo), quem e quando
--     marcou, e o dia em que a arte do cliente chegou ("Arte recebida") com quem
--     registrou (NULL em todo o acervo).
-- "Sem patrocínio" NÃO ganha coluna: é a marca que já existe (items.skip_approval).
-- Os prazos normal × ajustado NÃO são gravados: derivam da data do evento e da
-- configuração, na hora (shared/prazo-sem-aprovacao.ts); a trilha guarda os dois
-- de cada marcação/desmarcação.
-- Idempotente: a migração aditiva (scripts/migracao-aditiva-producao.sql) cria
-- o mesmo; quem rodou aquela antes não quebra aqui.
CREATE TABLE IF NOT EXISTS "configuracoes" (
	"chave" text PRIMARY KEY NOT NULL,
	"valor" jsonb NOT NULL,
	"atualizado_em" timestamp DEFAULT now() NOT NULL,
	"atualizado_por" text
);
--> statement-breakpoint
INSERT INTO "configuracoes" ("chave", "valor", "atualizado_por") VALUES ('dias_da_aprovacao', '7'::jsonb, 'Sistema (migração 0010)') ON CONFLICT ("chave") DO NOTHING;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "arte_do_cliente" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "arte_do_cliente_marcada_em" timestamp;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "arte_do_cliente_marcada_por" text;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "arte_recebida_em" date;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "arte_recebida_por" text;
