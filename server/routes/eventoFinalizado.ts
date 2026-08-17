// ─────────────────────────────────────────────────────────────────────────────
// EVENTO FINALIZADO × ESCRITA DE PEÇA — O CRITÉRIO. Leia isto antes de mexer.
//
// O buraco que originou esta seção, relatado pelo dono com observação em
// produção: "vi situações de encerrar eventos e conseguirem aprovar ainda".
// Só a CRIAÇÃO estava barrada. As filas de trabalho (Arte, Atendimento,
// Gráfica, Revisão, Vincular) ESCONDEM as peças de evento finalizado — mas
// esconder é filtro de CLIENTE, e o Painel Geral e o Detalhe do Evento
// continuam mostrando essas peças DE PROPÓSITO (regra do dono: registro não
// perde o passado). Era por ali que a ação seguia acontecendo.
//
// O CRITÉRIO, em uma frase:
//   BARRA o que faz o trabalho ANDAR. PERMITE o que ARRUMA A CASA.
//
// "Andar" é qualquer escrita que empurre a peça adiante no fluxo, mande alguém
// trabalhar, ou reescreva o contrato: aprovar, reprovar, liberar, dispensar,
// enviar arquivo, trocar arte, produzir, marcar reaproveitamento, editar,
// devolver, cancelar, vincular patrocinador. Nada disso pode acontecer num
// evento que já acabou — no melhor caso é trabalho invisível (a fila não mostra
// a peça, então ninguém a faz), no pior é lona impressa para um evento que já
// passou.
//
// "Arrumar a casa" é o que só encerra o que já existe, sem gerar trabalho:
//   · excluir peça e restaurar peça — limpeza reversível (soft delete). Barrar
//     deixaria lixo PRESO num evento em que ninguém mais pode mexer.
//   · cancelar complemento — é desfazer um aumento, e a rota já exige que
//     nenhuma unidade tenha sido tocada. Barrar transformaria um engano num
//     item permanente da fila da Gráfica.
//   · conferir e registrar entrega — é FECHAR A CONTA do que fisicamente já
//     saiu. Nenhuma das duas consegue produzir nada: conferir exige a peça em
//     "Produzido" e entregar exige unidades já conferidas. E o dia seguinte ao
//     evento — quando ele já é "realizado" por definição — é exatamente quando
//     a papelada da entrega chega. Barrar tornaria o registro do que aconteceu
//     de verdade impossível de completar, para sempre.
//
// EM CASO DE DÚVIDA, BARRA (decisão do dono): reabrir o evento é barato, e o
// admin faz isso em um clique. Um trabalho feito por engano num evento morto
// não tem desfazer barato.
//
// Reabrir/encerrar o evento (server/routes/events.ts) obviamente NÃO passa por
// aqui: é a válvula que destrava tudo o que esta guarda barra. Já o envio em
// lote de rascunhos para vinculação (POST /api/events/:id/items/submit, no
// mesmo arquivo) PASSA por aqui — promove peça igual às rotas de items.ts, só
// que pelo evento inteiro de uma vez.
//
// POR QUE ESTE ARQUIVO É SEPARADO DE items.ts (e não só um `export` a mais):
// server/routes/items.ts importa server/services/xlsxImport e xlsxExport, que
// puxam o pacote `exceljs`. server/routes/events.ts é consumido por testes
// hoje totalmente PUROS (event-status-derivado.test.ts, event-encerramento
// .test.ts) que importam só `enrichEvent`/`countOpenWork`/`todayBusinessMs` e
// não mockam nada de planilha — de propósito, para ficarem hermáticos e não
// dependerem de módulo nenhum de upload/exportação. Se events.ts importasse
// estas funções direto de items.ts, TODO consumidor de events.ts passaria a
// carregar exceljs também — e um ambiente sem o pacote instalado (aconteceu
// neste mesmo repo) quebraria testes que não têm nada a ver com planilha. Este
// módulo não importa nada além de ../storage e @shared/prazo-dates: é seguro
// para os dois lados importarem sem herdar a árvore um do outro.
// ─────────────────────────────────────────────────────────────────────────────
import { storage } from "../storage";
import { motivoEventoFinalizado, todayBusinessMs } from "@shared/prazo-dates";
import type { EventoFinalizadoMotivo } from "@shared/prazo-dates";

/**
 * Bloqueio por encerramento À MÃO — esse tem volta, então a frase oferece.
 *
 * A frase diz "mexer nas peças" e não "adicionar peças" porque a guarda deixou
 * de ser só das cinco portas de CRIAÇÃO: ela cobre agora toda escrita que faz o
 * trabalho andar (aprovar, liberar, produzir, editar…). Dizer "para adicionar
 * peças" a quem tentou APROVAR seria devolver uma instrução que não serve.
 */
export const EVENTO_ENCERRADO_ERRO = "Evento encerrado — reabra o evento para mexer nas peças dele.";

/**
 * Bloqueio por o evento JÁ TER ACONTECIDO. Aqui não existe "reabrir": a data
 * passou. Oferecer uma ação que não existe é pior do que negar.
 */
export const EVENTO_REALIZADO_ERRO =
  "Este evento já aconteceu — não é possível mexer nas peças dele.";

/**
 * Evento ENCERRADO à mão não recebe peça nova.
 *
 * Por que BLOQUEAR e não auto-reabrir como o ramo de `completed` do POST
 * /api/items faz: "completed" é um carimbo DERIVADO da produção, e reabri-lo
 * ao receber peça só devolve o evento à sua própria derivação. "closed" é uma
 * decisão de GENTE — reabrir sozinho a desfaria em silêncio, exatamente o que
 * a guarda de `updateEventStatus` (routes/shared.ts) existe para impedir.
 *
 * E o estrago não seria só de princípio: a peça nasceria fora da Gestão de
 * Prazos e fora das filas de Arte/Gráfica/Atendimento (que agora filtram o
 * evento encerrado), isto é, invisível para quem teria de fazê-la.
 */
export function motivoEventoFechado(
  event: { status?: string | null; startDate?: string | Date | null; manuallyClosed?: boolean | null } | null | undefined,
): EventoFinalizadoMotivo | null {
  // Fonte ÚNICA: o mesmo predicado que a Gestão de Prazos e as cinco filas
  // usam. Antes daqui só o encerramento manual barrava, então dava para
  // cadastrar peça num evento do mês passado — e ela nascia invisível
  // exatamente como a de um evento encerrado à mão, porque as filas também
  // escondem evento já realizado.
  return motivoEventoFinalizado(event, todayBusinessMs());
}

/** Cada motivo tem a sua frase: encerrado tem volta, realizado não tem. */
export function erroEventoFechado(motivo: EventoFinalizadoMotivo): string {
  return motivo === "encerrado" ? EVENTO_ENCERRADO_ERRO : EVENTO_REALIZADO_ERRO;
}

/** Motivo da finalização do evento DONO da peça. `null` = evento ainda em jogo. */
export async function motivoEventoDaPeca(
  item: { eventId?: string | null } | null | undefined,
): Promise<EventoFinalizadoMotivo | null> {
  if (!item?.eventId) return null;
  return motivoEventoFechado(await storage.getEvent(item.eventId));
}

/**
 * A guarda das rotas que fazem o trabalho ANDAR. Responde 409 e devolve `true`
 * quando barrou, para o handler sair com `if (await barraEventoFinalizado(...)) return;`
 *
 * `code` e `reason` vão no corpo porque o cliente precisa distinguir as duas
 * origens sem parsear a frase: "encerrado" oferece reabrir, "realizado" não.
 */
export async function barraEventoFinalizado(
  item: { eventId?: string | null } | null | undefined,
  res: { status: (c: number) => any },
): Promise<boolean> {
  const motivo = await motivoEventoDaPeca(item);
  if (!motivo) return false;
  res.status(409).json({ error: erroEventoFechado(motivo), code: "EVENT_FINALIZED", reason: motivo });
  return true;
}

/**
 * A mesma guarda nas rotas de LOTE, que não podem simplesmente sair no
 * primeiro item barrado — elas já têm o idioma de pular o item inválido e
 * devolver a lista de erros no fim.
 *
 * Por que não 409 no primeiro barrado: um lote misto (peças de eventos vivos e
 * de um evento finalizado) puniria as peças boas por causa da ruim. Por que
 * ainda assim existe um 409: quando NADA passou e tudo o que falhou falhou por
 * esta regra, um `{ success: 0, errors: N }` com status 200 vira "não fez nada
 * e não disse por quê" — que é o silêncio de sempre, agora em lote.
 */
export function contadorDeBloqueio() {
  let bloqueados = 0;
  let motivo: EventoFinalizadoMotivo | null = null;
  return {
    /** Registra um item barrado e devolve a frase para a lista de erros. */
    registra(m: EventoFinalizadoMotivo): string {
      bloqueados += 1;
      motivo ??= m;
      return erroEventoFechado(m);
    },
    /** `true` (já respondeu 409) quando o lote INTEIRO caiu por esta regra. */
    respondeLoteInteiro(res: { status: (c: number) => any }, processados: number, pedidos: number): boolean {
      if (!motivo || processados > 0 || bloqueados !== pedidos) return false;
      res.status(409).json({ error: erroEventoFechado(motivo), code: "EVENT_FINALIZED", reason: motivo });
      return true;
    },
  };
}
