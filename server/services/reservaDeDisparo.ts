// ─────────────────────────────────────────────────────────────────────────────
// RESERVA DE DISPARO — a trava que faltava quando o servidor virou N servidores.
//
// O deploy é autoscale: o Replit sobe réplicas do processo conforme a carga, e
// cada uma roda o próprio relógio dos avisos. A trava existente ("olhe a trilha
// antes de mandar") funcionava com UM servidor e falhava com três, porque a
// trilha só é gravada DEPOIS do envio e mandar e-mail leva segundos:
//
//   15:00:01  réplica A pergunta "já mandei?" → não → começa a enviar
//   15:00:01  réplica B pergunta "já mandei?" → não → começa a enviar
//   15:00:02  réplica C pergunta "já mandei?" → não → começa a enviar
//   15:00:07  as três gravam na trilha. O dono recebe o aviso três vezes.
//
// (Foi exatamente o print de 01/09: "Aprovações pendentes · 372 em..." às 15:00
// três vezes, e "Revisão · 2 peças esperando" idem.)
//
// A correção é reservar ANTES de agir, num ponto que as réplicas compartilham:
// o banco. `INSERT ... ON CONFLICT DO NOTHING` numa chave primária é atômico —
// exatamente uma réplica recebe a linha de volta, as outras recebem nada e
// desistem. Não há lock a soltar, nem timeout a ajustar.
//
// FALHA ABERTA, de propósito. Se o banco estiver fora ou a tabela ainda não
// existir (deploy feito antes do db:push), a reserva devolve TRUE e o aviso
// segue como antes. O modo de falha aceitável aqui é o e-mail duplicado, não o
// silêncio: este app já passou semanas sem mandar aviso nenhum e ninguém
// estranhou — o barulho é detectável, a ausência não é.
// ─────────────────────────────────────────────────────────────────────────────
import { db } from "../db";
import { reservasDeDisparo } from "@shared/schema";
import { eq, sql } from "drizzle-orm";

/** Quem é esta réplica. Só para diagnóstico — aparece na coluna `instancia`. */
export const ID_DA_INSTANCIA = `${process.pid}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * Tenta ficar com a edição. `true` = esta réplica ganhou e deve agir;
 * `false` = outra já pegou (ou este mesmo processo já pegou antes).
 */
export async function reservarDisparo(chave: string): Promise<boolean> {
  try {
    const ganhou = await db
      .insert(reservasDeDisparo)
      .values({ chave, instancia: ID_DA_INSTANCIA })
      .onConflictDoNothing()
      .returning({ chave: reservasDeDisparo.chave });
    if (ganhou.length === 0) {
      console.log(`[reserva] ${chave} já estava reservada por outra instância — não envio`);
      return false;
    }
    return true;
  } catch (erro) {
    // Ver "FALHA ABERTA" no topo: sem banco, o aviso vai — duplicado é melhor
    // que ausente, e a linha de log diz que a trava não estava valendo.
    console.warn(`[reserva] não deu para reservar ${chave} (a trava não valeu desta vez):`, erro instanceof Error ? erro.message : erro);
    return true;
  }
}

/** Anota como a edição terminou. Diagnóstico; nunca decide envio. */
export async function anotarDesfecho(chave: string, desfecho: string): Promise<void> {
  try {
    await db.update(reservasDeDisparo).set({ desfecho }).where(eq(reservasDeDisparo.chave, chave));
  } catch {
    // Anotação é conforto de diagnóstico: falhar aqui não pode derrubar o aviso.
  }
}

/**
 * Faxina das reservas velhas. A tabela cresce ~6 linhas/dia (dois avisos × três
 * edições) mais os alertas de prazo; 90 dias cobrem qualquer investigação
 * ("o aviso do dia tal saiu?") e mantêm a tabela irrelevante para sempre.
 */
export async function limparReservasAntigas(): Promise<void> {
  try {
    await db.delete(reservasDeDisparo).where(sql`${reservasDeDisparo.reservadoEm} < now() - interval '90 days'`);
  } catch {
    // idem: faxina não é caminho crítico.
  }
}
