// ─────────────────────────────────────────────────────────────────────────────
// SAÚDE DOS DADOS — as contradições que nenhuma tela sozinha consegue ver.
//
// POR QUE ISTO EXISTE (incidente de 08/09). Doze peças do Ministério ficaram
// ONZE DIAS invisíveis no Atendimento: estavam marcadas como isentas de
// aprovação E aguardando a decisão do patrocinador ao mesmo tempo. Cada tela
// acreditava em metade do dado e nenhuma tinha como perceber o conflito — o
// dono descobriu por acaso, comparando a fila do Atendimento com a Gestão de
// Prazos. Um estado que só aparece no CRUZAMENTO de duas telas não tem dono:
// ou existe um lugar que cruza, ou ele só é achado por sorte.
//
// A regra deste arquivo: cada verificação pergunta algo que o produto afirma
// ser impossível. Se voltar linha, ou o código deixou escrever o impossível,
// ou uma regra mudou e o dado antigo ficou para trás. As duas coisas
// interessam, e as duas são invisíveis sem isto aqui.
//
// O que NÃO entra: pendência de trabalho ("peça parada há 20 dias" é a Gestão
// de Prazos) nem regra de negócio em disputa. Só contradição factual.
// ─────────────────────────────────────────────────────────────────────────────
import { db } from "../db";
import { sql } from "drizzle-orm";

export type Gravidade = "critico" | "alto" | "medio";

export interface Achado {
  chave: string;
  titulo: string;
  /** O que significa, em português de quem opera — não de quem programou. */
  explicacao: string;
  gravidade: Gravidade;
  quantas: number;
  /** Até 8 números de peça, para o admin conseguir ir olhar uma. */
  amostra: string[];
}

interface Verificacao {
  chave: string;
  titulo: string;
  explicacao: string;
  gravidade: Gravidade;
  /** SELECT que devolve uma coluna `display_id` por linha problemática. */
  sql: ReturnType<typeof sql>;
}

const VERIFICACOES: Verificacao[] = [
  {
    chave: "isenta_aguardando",
    titulo: "Peça isenta de aprovação, mas aguardando o patrocinador",
    explicacao:
      "A peça diz que não precisa de aprovação e, ao mesmo tempo, está esperando a decisão de um patrocinador. " +
      "O Atendimento acredita na isenção e não mostra a peça; a Gestão de Prazos acredita no status e a cobra. " +
      "Foi o que escondeu 12 peças do Ministério por 11 dias, em 08/09.",
    gravidade: "critico",
    sql: sql`select display_id from items
      where deleted_at is null and status in ('awaiting_sponsor_approval','awaiting_approval') and skip_approval = true`,
  },
  {
    chave: "aguardando_sem_patrocinador",
    titulo: "Aguardando patrocinador, sem nenhum patrocinador vinculado",
    explicacao:
      "A peça espera uma decisão que ninguém pode tomar: não há patrocinador nela. Fica parada para sempre, sem dono.",
    gravidade: "critico",
    sql: sql`select i.display_id from items i
      where i.deleted_at is null and i.status in ('awaiting_sponsor_approval','awaiting_approval')
        and not exists (select 1 from item_sponsors s where s.item_id = i.id)`,
  },
  {
    chave: "passou_com_pendencia",
    titulo: "Peça avançou com patrocinador ainda pendente",
    explicacao:
      "A peça passou da fase de aprovação, mas há patrocinador que nunca decidiu. Pode virar peça impressa sem aval.",
    gravidade: "critico",
    sql: sql`select display_id from items i
      where i.deleted_at is null
        and i.status in ('sponsor_approved','awaiting_creator_review','awaiting_final_review','ready_for_production','approved','inProduction')
        and exists (select 1 from item_sponsor_approvals a where a.item_id = i.id
          and a.status in ('pending','new_version_pending'))`,
  },
  {
    chave: "conferido_sem_lastro",
    titulo: "Conferido mais do que foi produzido e reaproveitado",
    explicacao:
      "A peça tem unidades conferidas que ninguém imprimiu nem reaproveitou. Elas podem sair no caminhão sem existir.",
    gravidade: "critico",
    sql: sql`select display_id from items
      where deleted_at is null and coalesce(reuse_qty,0) > 0 and reuse_qty < quantity
        and coalesce(conferred_qty,0) > (coalesce(reuse_qty,0) + coalesce(quantity_produced,0))`,
  },
  {
    chave: "evento_inexistente",
    titulo: "Peça apontando para um evento que não existe",
    explicacao:
      "A peça ficou órfã: o evento dela sumiu. Não aparece em nenhuma fila e ninguém consegue resolvê-la.",
    gravidade: "critico",
    sql: sql`select i.display_id from items i
      where i.deleted_at is null and not exists (select 1 from events e where e.id = i.event_id)`,
  },
  {
    chave: "numero_duplicado",
    titulo: "Duas peças com o mesmo número",
    explicacao:
      "O número é a identidade da peça na etiqueta e na conferência. Repetido, o galpão confunde uma com a outra.",
    gravidade: "critico",
    sql: sql`select display_id from items where deleted_at is null and display_id is not null
      group by display_id having count(*) > 1`,
  },
  {
    chave: "aguardando_todos_decidiram",
    titulo: "Aguardando aprovação, mas todos já decidiram",
    explicacao:
      "Todas as decisões saíram e a peça continua na fila de aprovação — deveria ter ido para a Arte finalizar.",
    gravidade: "alto",
    sql: sql`select display_id from items i
      where i.deleted_at is null and i.status = 'awaiting_sponsor_approval'
        and exists (select 1 from item_sponsor_approvals a where a.item_id = i.id)
        and not exists (select 1 from item_sponsor_approvals a where a.item_id = i.id
          and a.status in ('pending','new_version_pending','awaiting_arte'))`,
  },
  {
    chave: "conferido_acima_da_quantidade",
    titulo: "Conferido acima da quantidade da peça",
    explicacao: "Foi conferida mais unidade do que a peça tem — lançamento duplicado ou número digitado errado.",
    gravidade: "alto",
    sql: sql`select display_id from items where deleted_at is null and coalesce(conferred_qty,0) > quantity`,
  },
  {
    chave: "entregue_acima_do_conferido",
    titulo: "Entregue mais do que foi conferido",
    explicacao: "Saiu mais material do que passou pela conferência: o saldo do galpão fica errado.",
    gravidade: "alto",
    sql: sql`select display_id from items
      where deleted_at is null and coalesce(delivered_qty,0) > coalesce(conferred_qty,0)
        and coalesce(reuse_qty,0) = 0 and is_reuse = false`,
  },
  {
    chave: "reuso_acima_da_quantidade",
    titulo: "Reaproveitamento maior que a quantidade da peça",
    explicacao: "A peça diz reaproveitar mais unidades do que ela tem.",
    gravidade: "alto",
    sql: sql`select display_id from items where deleted_at is null and coalesce(reuse_qty,0) > quantity`,
  },
  {
    chave: "aprovacao_sem_vinculo",
    titulo: "Decisão registrada de um patrocinador que não está mais na peça",
    explicacao:
      "Há aprovação ou reprovação de um patrocinador desvinculado depois. Não trava o fluxo, mas o relatório por " +
      "patrocinador conta uma decisão sobre peça que não é mais dele.",
    gravidade: "medio",
    sql: sql`select i.display_id from item_sponsor_approvals a
      join items i on i.id = a.item_id
      where i.deleted_at is null
        and not exists (select 1 from item_sponsors s where s.item_id = a.item_id and s.sponsor_id = a.sponsor_id)`,
  },
  {
    chave: "entregue_incompleta",
    titulo: "Marcada como entregue com entrega incompleta",
    explicacao: "O status diz Entregue, mas o número de unidades entregues é menor que a quantidade da peça.",
    gravidade: "medio",
    sql: sql`select display_id from items
      where deleted_at is null and status = 'delivered' and coalesce(delivered_qty,0) < quantity`,
  },
];

export interface RetratoDaConsistencia {
  achados: Achado[];
  verificadas: number;
  em: string;
}

/**
 * Roda todas as verificações. Cada uma é isolada: uma consulta que quebra não
 * derruba as outras — e, principalmente, não vira um "está tudo certo" falso.
 */
export async function verificarConsistencia(): Promise<RetratoDaConsistencia> {
  const achados: Achado[] = [];
  for (const v of VERIFICACOES) {
    try {
      const resultado: any = await db.execute(v.sql);
      const linhas = (resultado?.rows ?? resultado ?? []) as Array<{ display_id: string | null }>;
      if (linhas.length === 0) continue;
      achados.push({
        chave: v.chave,
        titulo: v.titulo,
        explicacao: v.explicacao,
        gravidade: v.gravidade,
        quantas: linhas.length,
        amostra: linhas.slice(0, 8).map((l) => l.display_id ?? "—"),
      });
    } catch (error) {
      // Verificação quebrada (coluna renomeada, por exemplo) não pode calar as
      // demais nem se disfarçar de "nada encontrado": vira achado próprio.
      achados.push({
        chave: v.chave,
        titulo: `A verificação "${v.titulo}" não conseguiu rodar`,
        explicacao: `A consulta falhou (${error instanceof Error ? error.message : "erro desconhecido"}). Enquanto isso, este risco está sem vigilância.`,
        gravidade: "medio",
        quantas: 0,
        amostra: [],
      });
    }
  }
  const ordem: Record<Gravidade, number> = { critico: 0, alto: 1, medio: 2 };
  achados.sort((a, b) => ordem[a.gravidade] - ordem[b.gravidade] || b.quantas - a.quantas);
  return { achados, verificadas: VERIFICACOES.length, em: new Date().toISOString() };
}
