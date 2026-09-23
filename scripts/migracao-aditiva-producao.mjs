// Roda scripts/migracao-aditiva-producao.sql no banco de DATABASE_URL.
// Só CRIA o que falta (nunca apaga). Uso: node scripts/migracao-aditiva-producao.mjs
import { readFileSync } from "fs";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL não definida."); process.exit(1); }
const sql = readFileSync(new URL("./migracao-aditiva-producao.sql", import.meta.url), "utf8");
const client = new pg.Client({ connectionString: url, ssl: /sslmode=require|neon\.tech/.test(url) ? { rejectUnauthorized: false } : undefined });
await client.connect();
try {
  await client.query(sql);
  const r = await client.query(`SELECT table_name, column_name FROM information_schema.columns
    WHERE (table_name='notifications' AND column_name='target_user_id')
       OR (table_name='users' AND column_name='kit')
       OR (table_name='events' AND column_name='prazo_molde')
       OR (table_name='events' AND column_name IN ('arquivado_em','arquivado_por','restaurado_em'))
       OR (table_name='sponsors' AND column_name IN ('arquivado_em','arquivado_por'))
       OR (table_name='global_quota_rules' AND column_name IN ('quota','item_types'))
       OR (table_name='items' AND column_name IN ('pedido_de_peca_linha_id','kit_remessa_id','criado_por_id','maquina_prevista','impressao_por_maquina','reserva_por_maquina','embalada_qty','travada_em','travada_por','travada_por_id','travada_motivo','motivo_cancelamento'))
       OR (table_name='kit_remessas' AND column_name='entrega_material')
       OR (table_name='pedidos_de_peca_linhas' AND column_name='sponsor_ids')
       OR (table_name='tubos' AND column_name IN ('fotos_fechamento','fechado_em','fechado_por','conteudo_alterado_em','avulso'))
       OR (table_name='tubo_itens' AND column_name IN ('tubo_id','item_id','quantidade','entregue_em'))
       OR (table_name='consultas_de_estoque' AND column_name IN ('status','quantidade_pedida','quantidade_atendida','ativos_ids','aplicado_em'))
    ORDER BY 1, 2`);
  console.log("Migração aditiva concluída. Conferido:", r.rows.map((x) => `${x.table_name}.${x.column_name}`).join(", "));
} finally {
  await client.end();
}
