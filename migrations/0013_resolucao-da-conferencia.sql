ALTER TABLE "conferencias_do_arquivo" ADD COLUMN "resolucao" text;--> statement-breakpoint
ALTER TABLE "conferencias_do_arquivo" ADD COLUMN "reconferir" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "aviso_da_conferencia" text;