CREATE TABLE "rascunhos_do_book" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" varchar NOT NULL,
	"versao" integer NOT NULL,
	"pdf_url" text NOT NULL,
	"paginas" integer NOT NULL,
	"pecas_no_book" integer NOT NULL,
	"plano" jsonb NOT NULL,
	"fora" jsonb NOT NULL,
	"pecas_da_versao" jsonb NOT NULL,
	"mudancas" jsonb,
	"modelo_evento" text,
	"gerado_por" text NOT NULL,
	"automatico" boolean DEFAULT false NOT NULL,
	"tamanho" integer,
	"criado_em" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rascunhos_do_book" ADD CONSTRAINT "rascunhos_do_book_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "UQ_rascunho_evento_versao" ON "rascunhos_do_book" USING btree ("event_id","versao");