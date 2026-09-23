-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRAÇÃO ADITIVA do branch `producao` (15/09).
--
-- Use no lugar do `npm run db:push` quando o banco tiver tabelas/colunas que
-- este branch não conhece (ex.: registros_de_impressao, items.print_machine,
-- items.tubo_id, que vieram da main) — o push apagaria esses dados.
-- Este script SÓ CRIA o que falta. Pode rodar quantas vezes quiser.
--
--   psql "$DATABASE_URL" -f scripts/migracao-aditiva-producao.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- Notificação individual (quem pediu recebe)
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS target_user_id varchar;

-- Estoque: reserva de peça física para uma peça
ALTER TABLE event_inventory_allocations ADD COLUMN IF NOT EXISTS item_id varchar;
ALTER TABLE event_inventory_allocations ADD COLUMN IF NOT EXISTS reservado_por text;
ALTER TABLE event_inventory_allocations ADD COLUMN IF NOT EXISTS reservado_por_id varchar;
CREATE INDEX IF NOT EXISTS "IDX_event_inventory_allocations_item_id" ON event_inventory_allocations (item_id);

-- Usuário do Kit
ALTER TABLE users ADD COLUMN IF NOT EXISTS kit boolean NOT NULL DEFAULT false;

-- Solicitação de peças (cabeçalho)
CREATE TABLE IF NOT EXISTS pedidos_de_peca (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id varchar,
  sponsor_id varchar,
  quantidade integer,
  observacao text,
  referencias text[] NOT NULL DEFAULT ARRAY[]::text[],
  status text NOT NULL DEFAULT 'aberto',
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
ALTER TABLE pedidos_de_peca ALTER COLUMN event_id DROP NOT NULL;
ALTER TABLE pedidos_de_peca ALTER COLUMN quantidade DROP NOT NULL;
ALTER TABLE pedidos_de_peca ALTER COLUMN observacao DROP NOT NULL;
ALTER TABLE pedidos_de_peca ADD COLUMN IF NOT EXISTS precisa_ate timestamp;
ALTER TABLE pedidos_de_peca ADD COLUMN IF NOT EXISTS tipo_de_peca text;
ALTER TABLE pedidos_de_peca ADD COLUMN IF NOT EXISTS largura numeric(10,2);
ALTER TABLE pedidos_de_peca ADD COLUMN IF NOT EXISTS altura numeric(10,2);
ALTER TABLE pedidos_de_peca ADD COLUMN IF NOT EXISTS editado_por text;
ALTER TABLE pedidos_de_peca ADD COLUMN IF NOT EXISTS editado_em timestamp;
ALTER TABLE pedidos_de_peca ADD COLUMN IF NOT EXISTS pedido_por text;
ALTER TABLE pedidos_de_peca ADD COLUMN IF NOT EXISTS pedido_por_id varchar;
ALTER TABLE pedidos_de_peca ADD COLUMN IF NOT EXISTS item_id varchar;
ALTER TABLE pedidos_de_peca ADD COLUMN IF NOT EXISTS resolvido_por text;
ALTER TABLE pedidos_de_peca ADD COLUMN IF NOT EXISTS resolvido_por_id varchar;
ALTER TABLE pedidos_de_peca ADD COLUMN IF NOT EXISTS resolvido_em timestamp;
ALTER TABLE pedidos_de_peca ADD COLUMN IF NOT EXISTS motivo_recusa text;
ALTER TABLE pedidos_de_peca ADD COLUMN IF NOT EXISTS motivo_cancelamento text;
ALTER TABLE pedidos_de_peca ADD COLUMN IF NOT EXISTS ajuste_status text;
ALTER TABLE pedidos_de_peca ADD COLUMN IF NOT EXISTS ajuste_texto text;
ALTER TABLE pedidos_de_peca ADD COLUMN IF NOT EXISTS ajuste_pedido_por text;
ALTER TABLE pedidos_de_peca ADD COLUMN IF NOT EXISTS ajuste_pedido_por_id varchar;
ALTER TABLE pedidos_de_peca ADD COLUMN IF NOT EXISTS ajuste_pedido_em timestamp;
ALTER TABLE pedidos_de_peca ADD COLUMN IF NOT EXISTS ajuste_respondido_por text;
ALTER TABLE pedidos_de_peca ADD COLUMN IF NOT EXISTS ajuste_respondido_em timestamp;
ALTER TABLE pedidos_de_peca ADD COLUMN IF NOT EXISTS ajuste_resposta text;
CREATE INDEX IF NOT EXISTS "IDX_pedidos_de_peca_event_status" ON pedidos_de_peca (event_id, status);
CREATE INDEX IF NOT EXISTS "IDX_pedidos_de_peca_status" ON pedidos_de_peca (status);

-- Cada peça da solicitação
CREATE TABLE IF NOT EXISTS pedidos_de_peca_linhas (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id varchar NOT NULL,
  ordem integer NOT NULL DEFAULT 0,
  event_id varchar NOT NULL,
  sponsor_ids text[] NOT NULL DEFAULT ARRAY[]::text[],
  quantidade integer NOT NULL,
  observacao text NOT NULL,
  referencias text[] NOT NULL DEFAULT ARRAY[]::text[],
  status text NOT NULL DEFAULT 'aberto',
  precisa_ate timestamp,
  tipo_de_peca text,
  largura numeric(10,2),
  altura numeric(10,2),
  resolvido_por text,
  resolvido_por_id varchar,
  resolvido_em timestamp,
  motivo_recusa text,
  motivo_cancelamento text,
  ajuste_status text,
  ajuste_texto text,
  ajuste_pedido_por text,
  ajuste_pedido_por_id varchar,
  ajuste_pedido_em timestamp,
  ajuste_respondido_por text,
  ajuste_respondido_em timestamp,
  ajuste_resposta text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "IDX_pedidos_de_peca_linhas_pedido" ON pedidos_de_peca_linhas (pedido_id);
CREATE INDEX IF NOT EXISTS "IDX_pedidos_de_peca_linhas_event_status" ON pedidos_de_peca_linhas (event_id, status);

-- Remessas do Kit
CREATE TABLE IF NOT EXISTS kit_remessas (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id varchar NOT NULL,
  versao text NOT NULL,
  solicitante text,
  departamento text,
  data_solicitacao timestamp,
  entrega_material timestamp NOT NULL,
  data_evento timestamp,
  carga_caminhao timestamp,
  saida_caminhao timestamp,
  arquivo text,
  criado_por text,
  criado_por_id varchar,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "IDX_kit_remessas_event" ON kit_remessas (event_id);

-- Peças: de qual solicitação/peça saíram, remessa do Kit e quem criou
ALTER TABLE items ADD COLUMN IF NOT EXISTS pedido_de_peca_id varchar;
ALTER TABLE items ADD COLUMN IF NOT EXISTS pedido_de_peca_linha_id varchar;
ALTER TABLE items ADD COLUMN IF NOT EXISTS kit_remessa_id varchar;
ALTER TABLE items ADD COLUMN IF NOT EXISTS criado_por_id varchar;
-- Máquinas: reserva de impressora antes de imprimir (fila por impressora, 21/09)
ALTER TABLE items ADD COLUMN IF NOT EXISTS maquina_prevista text;
-- Máquinas: reserva com quantidade por impressora ({"1":20,"2":14})
ALTER TABLE items ADD COLUMN IF NOT EXISTS reserva_por_maquina jsonb;
-- Máquinas: peça dividida entre impressoras ({"1":{"atrib":3,"impressas":1},...})
ALTER TABLE items ADD COLUMN IF NOT EXISTS impressao_por_maquina jsonb;
-- Trava da Solicitação (21/09): a Gráfica não faz a peça andar até destravar
ALTER TABLE items ADD COLUMN IF NOT EXISTS travada_em timestamp;
ALTER TABLE items ADD COLUMN IF NOT EXISTS travada_por text;
ALTER TABLE items ADD COLUMN IF NOT EXISTS travada_por_id varchar;
ALTER TABLE items ADD COLUMN IF NOT EXISTS travada_motivo text;

-- Chaves estrangeiras (nomes do drizzle; só cria se ainda não existir)
DO $$
DECLARE fk record;
BEGIN
  FOR fk IN SELECT * FROM (VALUES
    ('event_inventory_allocations', 'event_inventory_allocations_item_id_items_id_fk', 'item_id', 'items', 'SET NULL'),
    ('pedidos_de_peca', 'pedidos_de_peca_event_id_events_id_fk', 'event_id', 'events', 'CASCADE'),
    ('pedidos_de_peca', 'pedidos_de_peca_sponsor_id_sponsors_id_fk', 'sponsor_id', 'sponsors', 'SET NULL'),
    ('pedidos_de_peca', 'pedidos_de_peca_item_id_items_id_fk', 'item_id', 'items', 'SET NULL'),
    ('pedidos_de_peca_linhas', 'pedidos_de_peca_linhas_pedido_id_pedidos_de_peca_id_fk', 'pedido_id', 'pedidos_de_peca', 'CASCADE'),
    ('pedidos_de_peca_linhas', 'pedidos_de_peca_linhas_event_id_events_id_fk', 'event_id', 'events', 'CASCADE'),
    ('kit_remessas', 'kit_remessas_event_id_events_id_fk', 'event_id', 'events', 'CASCADE'),
    ('items', 'items_pedido_de_peca_id_pedidos_de_peca_id_fk', 'pedido_de_peca_id', 'pedidos_de_peca', 'SET NULL'),
    ('items', 'items_pedido_de_peca_linha_id_pedidos_de_peca_linhas_id_fk', 'pedido_de_peca_linha_id', 'pedidos_de_peca_linhas', 'SET NULL'),
    ('items', 'items_kit_remessa_id_kit_remessas_id_fk', 'kit_remessa_id', 'kit_remessas', 'SET NULL')
  ) AS t(tabela, nome, coluna, referencia, acao) LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = fk.nome) THEN
      EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I(id) ON DELETE %s',
        fk.tabela, fk.nome, fk.coluna, fk.referencia, fk.acao);
    END IF;
  END LOOP;
END $$;

-- ── 21/09 · Solicitação ao estoque a partir da Revisão Final ─────────────
-- Quem revisa pede N un. ao estoque pelo modal Reaproveitamento; a Gráfica
-- atende (tudo ou parte, reservando os ativos) ou diz que não consegue. Tabela
-- nova, nada existente muda. O nome interno ficou "consulta de estoque".
-- Sem coluna de local: o sistema não guarda onde a peça fica no galpão.
CREATE TABLE IF NOT EXISTS consultas_de_estoque (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id varchar NOT NULL,
  event_id varchar NOT NULL,
  pedido_por text,
  pedido_por_id varchar,
  pedido_em timestamp NOT NULL DEFAULT now(),
  observacao text,
  status text NOT NULL DEFAULT 'aberta',
  quantidade_pedida integer NOT NULL,
  quantidade_atendida integer,
  ativos_ids text[] NOT NULL DEFAULT ARRAY[]::text[],
  observacao_resposta text,
  foto_url text,
  respondido_por text,
  respondido_por_id varchar,
  respondido_em timestamp,
  aplicado_em timestamp
);
CREATE INDEX IF NOT EXISTS "IDX_consultas_de_estoque_item" ON consultas_de_estoque (item_id);
CREATE INDEX IF NOT EXISTS "IDX_consultas_de_estoque_status" ON consultas_de_estoque (status);
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_consultas_de_estoque_aberta_por_peca" ON consultas_de_estoque (item_id) WHERE status = 'aberta';
DO $$
DECLARE fk record;
BEGIN
  FOR fk IN SELECT * FROM (VALUES
    ('consultas_de_estoque', 'consultas_de_estoque_item_id_items_id_fk', 'item_id', 'items', 'CASCADE'),
    ('consultas_de_estoque', 'consultas_de_estoque_event_id_events_id_fk', 'event_id', 'events', 'CASCADE')
  ) AS t(tabela, nome, coluna, referencia, acao) LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = fk.nome) THEN
      EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I(id) ON DELETE %s',
        fk.tabela, fk.nome, fk.coluna, fk.referencia, fk.acao);
    END IF;
  END LOOP;
END $$;

-- ── 14/09 · Tubos (base) — para o banco LIMPO ─────────────────────────────
-- Os ALTERs abaixo pressupõem a tabela tubos e items.tubo_id (vieram da main
-- em 14/09). Em banco que já os tem, nada aqui faz coisa alguma (IF NOT EXISTS;
-- o ADD COLUMN existente é pulado inteiro, inclusive a referência). Coerente com
-- shared/schema.ts (tubos, items.tubo_id).
CREATE TABLE IF NOT EXISTS tubos (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id varchar NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  numero integer NOT NULL,
  criado_por text,
  entregue_em timestamp,
  recebido_por text,
  foto_entrega_url text,
  entregue_obs text,
  entregue_por text,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_tubos_evento_numero" ON tubos (event_id, numero);
ALTER TABLE items ADD COLUMN IF NOT EXISTS tubo_id varchar REFERENCES tubos(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "IDX_items_tubo_id" ON items (tubo_id);

-- ── 21/09 · Etapa "Embalado" (packed) ─────────────────────────────────────
-- O status novo é TEXTO em items.status: não há enum nem constraint, então
-- nada a migrar na peça. Só o TUBO ganha colunas (todas vazias ao nascer):
--   fotos_fechamento     fotos do tubo fechado e dos itens (várias URLs /objects/)
--   fechado_em / fechado_por   quando e quem fechou
--   conteudo_alterado_em       pôs/tirou peça depois da foto (aviso na tela)
ALTER TABLE tubos ADD COLUMN IF NOT EXISTS fotos_fechamento text[];
ALTER TABLE tubos ADD COLUMN IF NOT EXISTS fechado_em timestamp;
ALTER TABLE tubos ADD COLUMN IF NOT EXISTS fechado_por text;
ALTER TABLE tubos ADD COLUMN IF NOT EXISTS conteudo_alterado_em timestamp;
-- Embalada SOZINHA (21/09): o volume avulso não é "Tubo N" na tela e usa a
-- numeração negativa do evento. Aditivo: os tubos existentes ficam false.
ALTER TABLE tubos ADD COLUMN IF NOT EXISTS avulso boolean NOT NULL DEFAULT false;

-- EMBALAGEM COM QUANTIDADE (21/09): a peça pode ir dividida entre volumes.
--   items.embalada_qty   total já embalado da peça (entregue ou não)
--   tubo_itens           peça × volume, com a quantidade que está NAQUELE volume
ALTER TABLE items ADD COLUMN IF NOT EXISTS embalada_qty integer NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS tubo_itens (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  tubo_id varchar NOT NULL REFERENCES tubos(id) ON DELETE CASCADE,
  item_id varchar NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  quantidade integer NOT NULL CHECK (quantidade > 0),
  embalado_em timestamp NOT NULL DEFAULT now(),
  embalado_por text,
  fotos text[],
  entregue_em timestamp
);
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_tubo_itens_tubo_item" ON tubo_itens (tubo_id, item_id);
CREATE INDEX IF NOT EXISTS "IDX_tubo_itens_item" ON tubo_itens (item_id);
-- Peças que já estavam num tubo pelo modelo antigo (inteiras, por items.tubo_id)
-- ganham a linha com a quantidade conferida. Idempotente: só quem não tem linha.
INSERT INTO tubo_itens (tubo_id, item_id, quantidade, entregue_em)
SELECT i.tubo_id, i.id, GREATEST(1, LEAST(i.quantity, COALESCE(NULLIF(i.conferred_qty, 0), i.quantity))), t.entregue_em
  FROM items i JOIN tubos t ON t.id = i.tubo_id
 WHERE i.tubo_id IS NOT NULL AND i.deleted_at IS NULL
   AND NOT EXISTS (SELECT 1 FROM tubo_itens x WHERE x.item_id = i.id);
UPDATE items i SET embalada_qty = s.total
  FROM (SELECT item_id, SUM(quantidade)::int AS total FROM tubo_itens GROUP BY item_id) s
 WHERE s.item_id = i.id AND i.embalada_qty = 0;

-- ── 22/09 · Nomes das FKs e do CHECK alinhados com o drizzle ──────────────
-- As tabelas acima nascem com REFERENCES/CHECK inline, e o Postgres dá a elas
-- o nome dele ("tubo_itens_tubo_id_fkey", "tubo_itens_quantidade_check"). O
-- drizzle (shared/schema.ts) conhece as FKs pelo nome dele
-- ("<tabela>_<coluna>_<alvo>_id_fk") — com nomes diferentes, cada `db:push`
-- derrubaria e recriaria as FKs. Aqui só RENOMEIA (nada é apagado, nenhum
-- dado muda) e só quando o nome do drizzle ainda não existe. O CHECK fica com
-- o nome do Postgres, que é o que shared/schema.ts declara.
DO $$
DECLARE fk record;
BEGIN
  FOR fk IN SELECT * FROM (VALUES
    ('tubos', 'tubos_event_id_fkey', 'tubos_event_id_events_id_fk'),
    ('items', 'items_tubo_id_fkey', 'items_tubo_id_tubos_id_fk'),
    ('tubo_itens', 'tubo_itens_tubo_id_fkey', 'tubo_itens_tubo_id_tubos_id_fk'),
    ('tubo_itens', 'tubo_itens_item_id_fkey', 'tubo_itens_item_id_items_id_fk')
  ) AS t(tabela, antigo, novo) LOOP
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = fk.antigo)
       AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = fk.novo) THEN
      EXECUTE format('ALTER TABLE %I RENAME CONSTRAINT %I TO %I', fk.tabela, fk.antigo, fk.novo);
    END IF;
  END LOOP;
  -- O CHECK de tubo_itens em banco criado pelo db:push (que não o conhecia).
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tubo_itens_quantidade_check') THEN
    ALTER TABLE tubo_itens ADD CONSTRAINT tubo_itens_quantidade_check CHECK (quantidade > 0);
  END IF;
END $$;

-- ── 22/09 · Prazo do molde no evento ─────────────────────────────────────
-- Opcional (NULL = sem prazo do molde). Um dia, gravado ao meio-dia UTC.
-- Vale só no fluxo do molde; NÃO entra na Gestão de Prazos.
ALTER TABLE events ADD COLUMN IF NOT EXISTS prazo_molde timestamp;

-- ── Motivo do cancelamento da peça ───────────────────────────────────────
-- O cancelamento gravava o motivo por cima das observações da peça. Agora o
-- motivo tem coluna própria e as observações ficam intactas. Nullable, sem
-- default e sem preencher as canceladas antigas (nada muda nos dados).
ALTER TABLE items ADD COLUMN IF NOT EXISTS motivo_cancelamento text;

-- ── Cotas globais no banco ──────────────────────────────────────────────
-- Moravam em global-quota-rules.json, gravado no disco de UMA cópia do
-- servidor (e perdido no republish). A tabela nasce com o conteúdo do JSON do
-- repositório; cota que já existe na tabela não é tocada.
CREATE TABLE IF NOT EXISTS global_quota_rules (
  quota text PRIMARY KEY,
  item_types text[] NOT NULL DEFAULT '{}'::text[],
  updated_at timestamp NOT NULL DEFAULT now()
);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM global_quota_rules) THEN
    INSERT INTO global_quota_rules (quota, item_types, updated_at)
    SELECT s.quota, s.item_types, now() - interval '1 hour' + (s.ordem * interval '1 second')
      FROM (VALUES
        ('MASTER', '{}'::text[], 1),
        ('GOLD', '{}'::text[], 2),
        ('SILVER', '{}'::text[], 3),
        ('APOIO', '{}'::text[], 4),
        ('MIDIA', '{}'::text[], 5),
        ('MINISTERIO', '{}'::text[], 6)
      ) AS s(quota, item_types, ordem)
    ON CONFLICT (quota) DO NOTHING;
  END IF;
END $$;

-- ── Diário das impressoras: filtro por data ─────────────────────────────
-- A aba Máquinas e o resumo filtram registros_de_impressao por intervalo de
-- created_at (o dia de São Paulo); o índice (maquina, created_at) não serve
-- sem a máquina na frente.
CREATE INDEX IF NOT EXISTS "IDX_registros_impressao_created_at" ON registros_de_impressao (created_at);

-- ── Busca do Histórico (trigram) ────────────────────────────────────────
-- Os mesmos de scripts/criar-indices-de-busca.ts. Ficam FORA do
-- shared/schema.ts de propósito: declarados lá, um `db:push` num banco sem a
-- extensão pg_trgm quebraria. Contrapartida: um `db:push` os DERRUBA — rode
-- esta migração de novo depois de qualquer push (é idempotente).
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS "IDX_audit_logs_details_trgm" ON audit_logs USING gin (details gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "IDX_audit_logs_user_name_trgm" ON audit_logs USING gin (user_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "IDX_audit_logs_entity_id_trgm" ON audit_logs USING gin (entity_id gin_trgm_ops);

-- ── Vínculos sem repetição ──────────────────────────────────────────────
-- A deduplicação era feita na aplicação (lê, depois insere): dois cliques ao
-- mesmo tempo criavam o par duas vezes. Conferido em produção com
-- scripts/contar-vinculos-duplicados.mjs: 0 duplicatas nas três tabelas.
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_event_sponsors_evento_patrocinador" ON event_sponsors (event_id, sponsor_id);
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_item_sponsors_peca_patrocinador" ON item_sponsors (item_id, sponsor_id);
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_item_sponsor_approvals_peca_patrocinador" ON item_sponsor_approvals (item_id, sponsor_id);

-- ── Limite de tentativas de login entre as cópias ───────────────────────
-- No Autoscale cada cópia contava as tentativas sozinha (10 viravam 10×N).
-- O servidor conta aqui (server/routes/shared.ts): uma linha por chave
-- (hash de IP ou de e-mail, nunca o texto), contagem e fim da janela; o
-- próprio servidor apaga as janelas vencidas. Fica FORA de shared/schema.ts:
-- um `db:push` a DERRUBA — rode esta migração de novo depois de qualquer
-- push. Sem a tabela, o login segue contando na memória de cada cópia, com
-- aviso no log.
CREATE TABLE IF NOT EXISTS limite_de_tentativas (
  chave text PRIMARY KEY,
  contagem integer NOT NULL,
  reinicia_em timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS "IDX_limite_de_tentativas_reinicia_em" ON limite_de_tentativas (reinicia_em);
