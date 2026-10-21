-- Operadores de um login compartilhado (dono, 21/10): a Gráfica entra com um
-- login só ("Produção Grafica") e cada impressor se identifica com o PRÓPRIO
-- PIN — a trilha passa a gravar "Produção Grafica (Gilmar)". Tabela NOVA,
-- nada existente muda. O PIN só existe como hash bcrypt (pin_hash); NULL é
-- "ainda não criou". O limite de PIN errado usa limite_de_tentativas (0002).
-- Ver shared/operadores.ts e server/operadores.ts.
-- Idempotente: rodar de novo (ou num banco que já tenha a tabela) não quebra.
CREATE TABLE IF NOT EXISTS "operadores" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"nome" text NOT NULL,
	"pin_hash" text,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp DEFAULT now() NOT NULL,
	"atualizado_em" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'operadores_user_id_users_id_fk') THEN
    ALTER TABLE "operadores" ADD CONSTRAINT "operadores_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "IDX_operadores_user_id" ON "operadores" USING btree ("user_id");
