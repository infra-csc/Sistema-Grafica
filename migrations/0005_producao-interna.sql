-- Produção interna — "direto para a Gráfica" (dono, 02/10). Duas colunas novas
-- na peça, nada existente muda: a marca (false em todo o acervo) e o texto das
-- instruções para a Gráfica (NULL em todo o acervo). Ver shared/producao-interna.ts.
-- Idempotente: a migração aditiva (scripts/migracao-aditiva-producao.sql) cria
-- as mesmas colunas; quem rodou aquela antes não quebra aqui.
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "producao_interna" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "instrucoes_grafica" text;
