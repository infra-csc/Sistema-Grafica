-- De onde vem o reaproveitamento (dono, 16/10: caminhões "conjugados"). Duas
-- colunas novas na peça, nada existente muda: a origem ("estoque" |
-- "em_transito") e a observação livre — NULL em todo o acervo, que segue
-- exatamente como antes. Ver shared/origem-do-reaproveitamento.ts.
-- Idempotente: a migração aditiva (scripts/migracao-aditiva-producao.sql) cria
-- as mesmas colunas; quem rodou aquela antes não quebra aqui.
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "origem_reaproveitamento" text;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "obs_reaproveitamento" text;
