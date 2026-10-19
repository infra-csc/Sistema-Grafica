// ─────────────────────────────────────────────────────────────────────────────
// DESFAZER A CLONAGEM (19/10) — as regras em shared/desfazer-clonagem.ts.
//
//   GET  /api/events/:id/clone-items/desfazivel  → a clonagem recente que quem
//        está vendo ainda pode desfazer (a faixa do Detalhe do Evento);
//   POST /api/events/:id/clone-items/desfazer    → desfaz { loteId }.
//
// O LOTE NA TRILHA, SEM COLUNA NOVA. A clonagem grava, além da frase de sempre
// ("69 itens clonados do evento X", que o Histórico lê), uma linha de máquina:
// entityType "clonagem", entityId = o evento DESTINO, details = JSON com os ids
// das cópias, quem clonou, quando e o carimbo de nascimento delas. O desfazer
// lê essa linha e grava outra ("clone_desfeito") apontando para ela — é o que
// impede desfazer duas vezes e tira a faixa da tela. O Histórico só monta
// linhas de "event" e "item", então as duas não aparecem lá; os Logs do
// sistema mostram o `resumo` em vez do JSON.
//
// Registradas por registrarClonagem (criacao.ts), logo depois da clonagem.
// ─────────────────────────────────────────────────────────────────────────────
import type { Express, Request } from "express";
import { inArray } from "drizzle-orm";
import { eventInventoryAllocations, type AuditLog, type Event, type Item } from "@shared/schema";
import type { ClonagemDesfazivel, RespostaDaClonagemDesfazivel, RespostaDoDesfazerClonagem } from "@shared/api";
import {
  ACAO_DO_DESFEITO, ACAO_DO_LOTE, JANELA_DO_DESFAZER_TEXTO, TRILHA_DA_CLONAGEM,
  dentroDaJanela, expiraEm, lerDesfeito, lerLote, motivoParaFicar, podeDesfazer,
  type DesfeitoDaClonagem, type LoteDaClonagem,
} from "@shared/desfazer-clonagem";
import { db } from "../../db";
import { storage } from "../../storage";
import { requireAuth, createAuditLog, resolveActor, updateEventStatus } from "../shared";
import { responderFalha } from "../../erros";
import { EVENTO_ARQUIVADO_ERRO } from "../../services/arquivamento";
import { excluirPecaParaALixeira } from "./exclusao";

/** Quantas linhas da trilha do evento olhar — clonagens recentes são poucas. */
const LINHAS_DA_TRILHA = 100;

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/**
 * Grava o lote da clonagem na trilha e devolve o que o aviso de "Desfazer"
 * precisa. Falha de trilha NÃO derruba a clonagem (as peças já existem): só
 * não haverá desfazer para oferecer, e o log grita.
 */
export async function gravarLoteDaClonagem(
  req: Request,
  dados: { destino: Event; origem: Event; criadas: Item[] },
): Promise<ClonagemDesfazivel | null> {
  if (dados.criadas.length === 0) return null;
  const quem = resolveActor(req);
  const carimbo = dados.criadas[0]?.updatedAt;
  const lote: LoteDaClonagem = {
    v: 1,
    destinoId: dados.destino.id,
    origemId: dados.origem.id,
    origemNome: dados.origem.name,
    ids: dados.criadas.map((i) => i.id),
    em: new Date().toISOString(),
    carimbo: carimbo ? new Date(carimbo).toISOString() : null,
    porId: quem.userId,
    porNome: quem.userName,
    resumo: `Lote da clonagem: ${plural(dados.criadas.length, "peça", "peças")} de "${dados.origem.name}" para "${dados.destino.name}" (pode ser desfeita por ${JANELA_DO_DESFAZER_TEXTO}, enquanto em rascunho)`,
  };
  try {
    const linha = await storage.createAuditLog({
      userId: quem.userId,
      userName: quem.userName,
      action: ACAO_DO_LOTE,
      entityType: TRILHA_DA_CLONAGEM,
      entityId: dados.destino.id,
      details: JSON.stringify(lote),
    });
    return paraATela(linha.id, lote, dados.criadas.length, quem.userId);
  } catch (error) {
    console.error(`[clonagem] não consegui gravar o lote (${dados.criadas.length} peças → ${dados.destino.id}); sem desfazer para esta clonagem:`, error);
    return null;
  }
}

function paraATela(id: string, lote: LoteDaClonagem, emRascunho: number, userId: string | null): ClonagemDesfazivel {
  return {
    id,
    origemNome: lote.origemNome,
    total: lote.ids.length,
    emRascunho,
    em: lote.em,
    expiraEm: expiraEm(lote).toISOString(),
    porVoce: !!userId && lote.porId === userId,
    porNome: lote.porNome,
  };
}

/** Os lotes do evento (mais recente primeiro) e os ids dos já desfeitos. */
async function lotesDoEvento(eventId: string): Promise<{ lotes: Array<{ linha: AuditLog; lote: LoteDaClonagem }>; desfeitos: Set<string> }> {
  const linhas = await storage.getAuditLogs(TRILHA_DA_CLONAGEM, eventId, { limit: LINHAS_DA_TRILHA });
  const lotes: Array<{ linha: AuditLog; lote: LoteDaClonagem }> = [];
  const desfeitos = new Set<string>();
  for (const linha of linhas) {
    if (linha.action === ACAO_DO_LOTE) {
      const lote = lerLote(linha.details);
      // O LIKE do filtro por entidade casa também listas de ids: confere que o
      // lote é MESMO deste evento.
      if (lote && lote.destinoId === eventId) lotes.push({ linha, lote });
    } else if (linha.action === ACAO_DO_DESFEITO) {
      const d = lerDesfeito(linha.details);
      if (d) desfeitos.add(d.loteId);
    }
  }
  return { lotes, desfeitos };
}

/** Peças (entre `ids`) com reserva do estoque — uma consulta para o lote todo. */
async function comReserva(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const linhas: Array<{ itemId: string | null }> = await db
    .select({ itemId: eventInventoryAllocations.itemId })
    .from(eventInventoryAllocations)
    .where(inArray(eventInventoryAllocations.itemId, ids));
  return new Set(linhas.map((l) => l.itemId).filter((x): x is string => !!x));
}

/** Um desfazer por lote de cada vez (o toast e a faixa podem disparar juntos). */
const emAndamento = new Set<string>();

export function registrarDesfazerClonagem(app: Express): void {
  // A clonagem recente que quem está vendo ainda pode desfazer. Só leitura —
  // qualquer logado pergunta; a resposta já vem recortada por quem pode.
  app.get("/api/events/:id/clone-items/desfazivel", requireAuth, async (req, res) => {
    try {
      const eventId = req.params.id;
      const { lotes, desfeitos } = await lotesDoEvento(eventId);
      const agora = new Date();
      const quem = { papel: req.userRole, userId: req.userId };
      const candidato = lotes.find(({ linha, lote }) =>
        !desfeitos.has(linha.id) && dentroDaJanela(lote, agora) && podeDesfazer(quem, lote));
      if (!candidato) return res.json({ lote: null } satisfies RespostaDaClonagemDesfazivel);
      // Quantas ainda estão em rascunho neste evento: é o que o botão ainda
      // tem a desfazer. Zero = todas andaram (ou já foram excluídas) — sem faixa.
      const ids = new Set(candidato.lote.ids);
      const emRascunho = (await storage.getItemsByEvent(eventId))
        .filter((i) => ids.has(i.id) && i.status === "draft").length;
      if (emRascunho === 0) return res.json({ lote: null } satisfies RespostaDaClonagemDesfazivel);
      res.json({ lote: paraATela(candidato.linha.id, candidato.lote, emRascunho, req.userId ?? null) } satisfies RespostaDaClonagemDesfazivel);
    } catch (error) {
      responderFalha(res, error, "GET /api/events/:id/clone-items/desfazivel");
    }
  });

  // DESFAZER. Sem a guarda de evento FINALIZADO, como a exclusão (é arrumar a
  // casa: tira de volta o que acabou de entrar errado) — mas evento ARQUIVADO
  // barra, como no DELETE. Quem pode: quem clonou ou admin (podeDesfazer).
  app.post("/api/events/:id/clone-items/desfazer", requireAuth, async (req, res) => {
    const eventId = req.params.id;
    const loteId = typeof req.body?.loteId === "string" ? req.body.loteId : "";
    if (!loteId) return res.status(400).json({ error: "Diga qual clonagem desfazer (loteId)." });
    const chave = `${eventId}:${loteId}`;
    if (emAndamento.has(chave)) return res.status(409).json({ error: "Esta clonagem já está sendo desfeita — aguarde um instante." });
    emAndamento.add(chave);
    try {
      const destino = await storage.getEvent(eventId);
      if (!destino) return res.status(404).json({ error: "Evento não encontrado" });

      const { lotes, desfeitos } = await lotesDoEvento(eventId);
      const achado = lotes.find(({ linha }) => linha.id === loteId);
      if (!achado) return res.status(404).json({ error: "Não encontrei esta clonagem neste evento." });
      const { lote } = achado;
      if (!podeDesfazer({ papel: req.userRole, userId: req.userId }, lote)) {
        return res.status(403).json({ error: `Só quem clonou (${lote.porNome}) ou um administrador pode desfazer esta clonagem.` });
      }
      if (desfeitos.has(loteId)) return res.status(409).json({ error: "Esta clonagem já foi desfeita." });
      if (!dentroDaJanela(lote, new Date())) {
        return res.status(409).json({ error: `O desfazer vale por ${JANELA_DO_DESFAZER_TEXTO} depois da clonagem. Agora, exclua as peças que não vão pela lista do evento.` });
      }
      if (destino.arquivadoEm) {
        return res.status(409).json({ error: EVENTO_ARQUIVADO_ERRO, code: "EVENT_FINALIZED", reason: "arquivado" });
      }

      // Classifica: o que sai, o que fica (e por quê), o que já não estava lá.
      const pecas = await Promise.all(lote.ids.map((id) => storage.getItem(id)));
      const vivas = pecas.filter((p): p is Item => !!p && !p.deletedAt);
      const jaExcluidas = lote.ids.length - vivas.length;
      const reservadas = await comReserva(vivas.map((p) => p.id));
      const ficaram: RespostaDoDesfazerClonagem["ficaram"] = [];
      const aRemover: Item[] = [];
      for (const p of vivas) {
        const motivo = motivoParaFicar(p, lote, reservadas.has(p.id));
        if (motivo) ficaram.push({ id: p.id, displayId: p.displayId, motivo });
        else aRemover.push(p);
      }

      // Exclui UMA A UMA pelo mesmo caminho do DELETE (trilha por peça, volumes,
      // reservas, aviso às telas). A recusa de uma (complemento, tubo) não
      // derruba as outras: ela fica, com o motivo.
      let removidas = 0;
      for (const p of aRemover) {
        const feito = await excluirPecaParaALixeira(req, p, { evento: destino, porque: "ao desfazer a clonagem" });
        if (feito.ok) removidas += 1;
        else if (feito.recusa.status === 404) continue; // sumiu no meio do caminho: já não está lá
        else ficaram.push({ id: p.id, displayId: p.displayId, motivo: feito.recusa.corpo.code === "HAS_COMPLEMENTS" ? "tem complemento ativo" : feito.recusa.corpo.error });
      }

      const resumo = `Clonagem desfeita: ${plural(removidas, "peça", "peças")} de "${lote.origemNome}" ${removidas === 1 ? "removida" : "removidas"} (estavam em rascunho)`
        + (ficaram.length > 0 ? ` — ${plural(ficaram.length, "ficou", "ficaram")} porque já tinham andado` : "");
      // A frase que o Histórico mostra (linha de EVENTO: "Evento X alterado — …")
      // e a linha de máquina que marca o lote como desfeito.
      await createAuditLog(req, "updated", "event", eventId, resumo);
      const desfeito: DesfeitoDaClonagem = { v: 1, loteId, removidas, ficaram: ficaram.length, resumo };
      await createAuditLog(req, ACAO_DO_DESFEITO, TRILHA_DA_CLONAGEM, eventId, JSON.stringify(desfeito));
      if (removidas > 0) await updateEventStatus(eventId).catch((e) => console.error("[desfazer clonagem] updateEventStatus", e));

      res.json({ removidas, ficaram, jaExcluidas, origemNome: lote.origemNome } satisfies RespostaDoDesfazerClonagem);
    } catch (error) {
      responderFalha(res, error, "POST /api/events/:id/clone-items/desfazer");
    } finally {
      emAndamento.delete(chave);
    }
  });
}
