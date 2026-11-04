CREATE TABLE "conferencias_do_arquivo" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" varchar NOT NULL,
	"arquivo" text NOT NULL,
	"thumb" text NOT NULL,
	"veredito" text NOT NULL,
	"motivo" text,
	"pagina" text,
	"preview_url" text,
	"modelo" text,
	"tokens_entrada" integer,
	"tokens_saida" integer,
	"criada_em" timestamp DEFAULT now() NOT NULL,
	"resolvida_em" timestamp,
	"resolvida_por" text,
	"nota" text
);
--> statement-breakpoint
ALTER TABLE "conferencias_do_arquivo" ADD CONSTRAINT "conferencias_do_arquivo_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "UQ_conferencia_peca_arquivo_thumb" ON "conferencias_do_arquivo" USING btree ("item_id","arquivo","thumb");--> statement-breakpoint
CREATE INDEX "IDX_conferencia_veredito" ON "conferencias_do_arquivo" USING btree ("veredito");