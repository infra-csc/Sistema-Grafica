-- Idempotente: a migração aditiva (scripts/migracao-aditiva-producao.sql) cria a
-- mesma tabela; quem rodou aquela antes não pode quebrar aqui.
CREATE TABLE IF NOT EXISTS "limite_de_tentativas" (
	"chave" text PRIMARY KEY NOT NULL,
	"contagem" integer NOT NULL,
	"reinicia_em" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "IDX_limite_de_tentativas_reinicia_em" ON "limite_de_tentativas" USING btree ("reinicia_em");