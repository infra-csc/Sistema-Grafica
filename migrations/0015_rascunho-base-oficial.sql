ALTER TABLE "rascunhos_do_book" ADD COLUMN "modelo_url" text;--> statement-breakpoint
ALTER TABLE "rascunhos_do_book" ADD COLUMN "base_oficial" boolean DEFAULT false NOT NULL;