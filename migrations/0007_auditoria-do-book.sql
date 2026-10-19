-- Auditoria do book com IA (dono, 19/10): a cada book publicado, a IA compara o
-- PDF com as peças ativas do evento e aponta o que está desenhado sem cadastro
-- (e o que diverge). Tabela NOVA, nada existente muda. Ver
-- shared/auditoria-do-book.ts e server/services/auditoria-do-book/.
-- Idempotente: a migração aditiva (scripts/migracao-aditiva-producao.sql) cria
-- a mesma tabela; quem rodou aquela antes não quebra aqui.
CREATE TABLE IF NOT EXISTS "auditorias_do_book" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" varchar NOT NULL,
	"book_url" text NOT NULL,
	"status" text DEFAULT 'pendente' NOT NULL,
	"modelo" text,
	"achados" jsonb,
	"resolvidos" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"pecas_no_book" integer,
	"encontradas_no_app" integer,
	"erro" text,
	"tokens_entrada" integer,
	"tokens_saida" integer,
	"iniciado_em" timestamp,
	"criado_em" timestamp DEFAULT now() NOT NULL,
	"concluido_em" timestamp
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'auditorias_do_book_event_id_events_id_fk') THEN
    ALTER TABLE "auditorias_do_book" ADD CONSTRAINT "auditorias_do_book_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "IDX_auditorias_do_book_event_id" ON "auditorias_do_book" USING btree ("event_id");
