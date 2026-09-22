-- Tabela dos tokens de troca do SSO do portal (aditiva: só cria).
-- Até existir, o servidor usa a memória do processo e avisa no log.
CREATE TABLE IF NOT EXISTS sso_tokens_de_troca (
  token_hash text PRIMARY KEY,
  user_id varchar NOT NULL,
  expira_em timestamp NOT NULL,
  criado_em timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "IDX_sso_tokens_expira" ON sso_tokens_de_troca (expira_em);
