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
