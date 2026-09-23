// ─────────────────────────────────────────────────────────────────────────────
// ARQUIVAR NO LUGAR DE EXCLUIR — eventos e patrocinadores.
//
// Excluir apagava a linha, e o ON DELETE CASCADE das FKs levava junto peças,
// aprovações, registros de impressão, linhas de tubo e consultas de estoque;
// `inventory_assets.original_item_id` ficava órfão. Perda sem volta, e peças-
// -fantasma nas telas até o próximo F5.
//
// Agora o "Excluir" das telas ARQUIVA: a linha fica, com `arquivado_em`.
//   · Evento arquivado some de TODA listagem e contagem (a regra mora aqui e é
//     aplicada no storage e nas consultas cruas) e não aceita escrita (409).
//   · Patrocinador arquivado sai das listas de ESCOLHA, mas continua pelo nome
//     nas peças e aprovações antigas — o histórico é dele.
// Restaurar devolve tudo exatamente como estava: nada foi apagado.
//
// A remoção física virou manutenção (docs/arquitetura.md): nenhum caminho do
// app apaga a linha de um evento ou de um patrocinador.
// ─────────────────────────────────────────────────────────────────────────────
import { sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

export const EVENTO_ARQUIVADO_ERRO = "Evento arquivado — restaure antes de mexer.";
export const PATROCINADOR_ARQUIVADO_ERRO = "Patrocinador arquivado — restaure antes de mexer.";
/** `code` no corpo do 409: o cliente distingue sem ler a frase. */
export const CODIGO_ARQUIVADO = "ARCHIVED";

/** Verdadeiro quando a linha (evento ou patrocinador) está arquivada. */
export function estaArquivado(linha: { arquivadoEm?: Date | string | null } | null | undefined): boolean {
  return !!linha?.arquivadoEm;
}

/**
 * Filtro das PEÇAS (ou de qualquer linha com `event_id`): só as de evento não
 * arquivado. NOT EXISTS pela chave primária do evento — uma busca por índice
 * por linha, e `event_id` nulo passa (não há evento arquivado para ele).
 */
export function doEventoNaoArquivado(colunaEventId: AnyPgColumn | SQL): SQL {
  return sql`not exists (select 1 from events ev_arq where ev_arq.id = ${colunaEventId} and ev_arq.arquivado_em is not null)`;
}

/**
 * O filtro por PEÇA, para tabelas que só têm `item_id` (vínculos, aprovações):
 * passa quando a peça não é de evento arquivado.
 */
export function daPecaDeEventoNaoArquivado(colunaItemId: AnyPgColumn | SQL): SQL {
  return sql`not exists (select 1 from items i_arq join events e_arq on e_arq.id = i_arq.event_id where i_arq.id = ${colunaItemId} and e_arq.arquivado_em is not null)`;
}

/** O mesmo filtro para SQL cru, com o alias da coluna já escrito (`i.event_id`). */
export function doEventoNaoArquivadoCru(colunaEventId: string): SQL {
  return sql.raw(`not exists (select 1 from events ev_arq where ev_arq.id = ${colunaEventId} and ev_arq.arquivado_em is not null)`);
}

/**
 * A guarda das rotas que escrevem NO evento (editar, prioridade, encerrar,
 * reabrir, cotas, elenco de patrocinadores): 409 com a frase humana e `true`
 * quando barrou — o handler sai com `if (barraSeArquivado(evento, res)) return;`.
 */
export function barraSeArquivado(
  linha: { arquivadoEm?: Date | string | null } | null | undefined,
  res: { status: (c: number) => any },
  frase: string = EVENTO_ARQUIVADO_ERRO,
): boolean {
  if (!estaArquivado(linha)) return false;
  res.status(409).json({ error: frase, code: CODIGO_ARQUIVADO });
  return true;
}
