-- Atendimento – Cultura (dono, 30/09): marca no usuário de Atendimento que
-- também cria e edita eventos. Idempotente (IF NOT EXISTS), como as anteriores.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "cultura" boolean DEFAULT false NOT NULL;
