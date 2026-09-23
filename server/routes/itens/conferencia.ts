// Conferência da peça produzida (e a entrega por peça, aposentada).
import type { Express } from "express";
import { eq } from "drizzle-orm";
import { db } from "../../db";
import { storage } from "../../storage";
// TRAVA DA SOLICITAÇÃO (21/09): o que faz a peça andar na Gráfica é barrado
// com 409 e a frase humana; ver shared/trava-da-peca.ts.
import { pecaTravada, fraseDaTrava, CODIGO_PECA_TRAVADA } from "@shared/trava-da-peca";
import { EM_REVISAO } from "@shared/fluxo-peca";
import { ehMolde } from "@shared/molde";
import { planejarConferencia } from "@shared/embalagem";
import { items as itemsTable } from "@shared/schema";
import { requireAuth, broadcast, translateStatus, sendSensitiveError, createAuditLog } from "../shared";
// Régua do thumb (só objeto do nosso storage): ./thumb-url.ts.
import { urlDeThumbValida } from "../thumb-url";

/** confer, deliver (aposentada). */
export function registrarConferencia(app: Express): void {
  // Gráfica confere a peça produzida (com foto). Suporta conferência parcial.
  //
  // SEM a guarda de evento finalizado (é FECHAR A CONTA do que já existe).
  // Conferir não produz nada: só conta unidade que JÁ EXISTE no galpão
  // (impressa ou reaproveitada — tetoDaConferencia). O que se registra aqui é
  // a contagem do material — e a contagem costuma acontecer
  // depois do evento, que é justamente quando ele já conta como "realizado".
  // Barrar deixaria a peça eternamente "Produzida" e travaria a entrega, que
  // só aceita unidades conferidas.
  app.post("/api/items/:id/confer", requireAuth, async (req, res) => {
    try {
      // CONFERIR é da Gráfica E da Solicitação (decisão do dono).
      //
      // Era só grafica|admin, e isso criava um beco: a peça vinda do acervo
      // não passa pela Gráfica (não há o que imprimir), mas alguém precisa
      // conferir o material antes que ele possa ser entregue — e a entrega
      // sai do CONFERIDO. Sem este papel aqui, a Solicitação enxergava a peça,
      // enxergava que faltava entregar, e não tinha como destravar.
      //
      // A lista é a MESMA da entrega logo abaixo, de propósito: as duas etapas
      // finais do fluxo passaram a ter o mesmo conjunto de donos. Produzir
      // continua só com grafica|admin — quem produz é quem tem a impressora.
      if (!["grafica", "solicitacao", "admin"].includes((req as any).userRole ?? "")) {
        return res.status(403).json({ error: "Sem permissão para conferir" });
      }
      const { conferencePhotoUrl, qty, notes } = req.body ?? {};
      // A foto tem de ser do nosso storage (mesma régua de embalar/entregar em tubos.ts).
      const fotoEnviada = typeof conferencePhotoUrl === "string" && conferencePhotoUrl.trim() !== "";
      const foto = fotoEnviada ? urlDeThumbValida(conferencePhotoUrl) : null;
      if (fotoEnviada && !foto) {
        return res.status(400).json({ error: "A foto precisa ser enviada pelo app (endereço /objects/…)" });
      }
      // `qty` ausente = tudo o que existe para conferir; enviada (inclusive
      // null/0/"abc"), tem de ser inteiro ≥ 1 — antes qualquer lixo virava "tudo".
      const qtdPedida = Object.prototype.hasOwnProperty.call(req.body ?? {}, "qty") ? qty : undefined;
      // CONCORRÊNCIA (revisão de 22/09): a conferência lia a peça, somava e
      // REGRAVAVA o total em valor absoluto. Duas conferências e um embalar ao
      // mesmo tempo quebravam "embaladas ≤ conferidas" (uma sobrescrevia a
      // outra para baixo depois de o embalar já ter usado o total maior). Agora
      // tudo roda numa transação com a peça TRAVADA (`SELECT … FOR UPDATE` — a
      // mesma trava do embalar em routes/tubos.ts) e a conta é refeita lá dentro.
      type Resultado = { erro: { http: number; corpo: any } } | { item: any; trilha: string };
      const resultado: Resultado = await db.transaction(async (tx: any): Promise<Resultado> => {
      const [current] = await tx.select().from(itemsTable).where(eq(itemsTable.id, req.params.id)).for("update");
      const recusa = (http: number, corpo: any): Resultado => ({ erro: { http, corpo } });
      if (!current || current.deletedAt) return recusa(404, { error: "Peça não encontrada." });
      // Travada pela Solicitação: não se confere.
      if (pecaTravada(current as any)) return recusa(409, { error: fraseDaTrava(current as any), code: CODIGO_PECA_TRAVADA });
      if (!foto && !current.conferencePhotoUrl) {
        return recusa(400, { error: "Foto da conferência é obrigatória" });
      }
      // MOLDE (22/09): o fluxo dele morre no Produzido — não há conferência.
      if (ehMolde(current)) return recusa(409, { error: "Molde não passa por conferência — o fluxo dele termina no Produzido." });
      // Peça NA REVISÃO não confere — nem pelo reaproveitamento, que não
      // depende de impressão. Ela APARECE na fila da Gráfica ("chegando").
      if (EM_REVISAO.has(current.status)) {
        return recusa(409, { error: `Esta peça ainda está na Revisão — a Gráfica confere depois que a Revisão liberar. Status: ${translateStatus(current.status)}` });
      }
      // O TETO é o que existe no galpão: (impressas + reaproveitadas) − conferidas
      // (shared/embalagem.ts, a MESMA conta das telas). Com CONFERIR_PARCIAL, o
      // que já saiu confere antes de a peça inteira ser impressa; o status só
      // vira Conferido quando a quantidade inteira foi conferida. A peça de
      // acervo (reuso) confere sem nunca passar por "produced".
      // A validação vive aqui e não só na tela porque a mesma rota atende a
      // conferência em LOTE: regra validada só no botão o próximo caller ignora.
      const plano = planejarConferencia(current as any, qtdPedida);
      if (!plano.ok) return recusa(plano.http, { error: plano.motivo });

      const n = plano.quantidade;
      const newConferred = plano.conferredQty;
      const isFull = plano.completa;
      const trimmedNotes = typeof notes === "string" ? notes.trim() : "";

      const agora = new Date();
      const novoStatus = plano.novoStatus;
      const [item] = await tx.update(itemsTable).set({
        // `newConferred` foi calculado com a linha TRAVADA: ninguém gravou no meio.
        conferredQty: newConferred,
        conferencePhotoUrl: foto || current.conferencePhotoUrl || null,
        conferredAt: isFull ? agora : current.conferredAt,
        ...(trimmedNotes ? { conferenceNotes: trimmedNotes } : {}),
        updatedAt: agora,
        // Status só vira "conferred" quando conferiu tudo; a parcial fica onde está.
        // EMBALAGEM COM QUANTIDADE (21/09): a parcial pode ter embalado a parte
        // já conferida. Fechar a conferência só vira Embalado se TUDO já está
        // embalado (caso raro); senão é Conferido, com o resto a embalar.
        // O carimbo "desde quando" (storage.updateItem faz igual) vai à mão.
        ...(novoStatus ? { status: novoStatus, ...(novoStatus !== current.status ? { statusChangedAt: agora } : {}) } : {}),
      } as any).where(eq(itemsTable.id, req.params.id)).returning();
      const trilha = (isFull ? `Conferência concluída (${newConferred}/${current.quantity})` : `Conferência parcial: ${n} un. (${newConferred}/${current.quantity})`)
        + (novoStatus === "packed" ? " — já estava toda embalada" : "")
        + (trimmedNotes ? ` — Obs.: ${trimmedNotes}` : "");
      return { item, trilha };
      });
      if ("erro" in resultado) return res.status(resultado.erro.http).json(resultado.erro.corpo);
      const { item, trilha } = resultado;
      await createAuditLog(req, 'updated', 'item', req.params.id, trilha);
      broadcast({ type: "item_updated", item });
      res.json(item);
    } catch (error: any) {
      sendSensitiveError(res, error, "Conferir peça", 500);
    }
  });

  // ENTREGA POR PEÇA — APOSENTADA (dono, 21/09: "todas são embaladas" e "tem que
  // colocar as quantidades"). O fluxo é um só: Conferido → Embalado → Entregue,
  // e quem entrega é o VOLUME (tubo ou embalagem avulsa), com as quantidades que
  // estão nele: POST /api/tubos/:id/entregar. Inclusive a PARCIAL — ela embala a
  // parte já conferida e sai pela embalagem. A rota fica (clientes antigos,
  // abas abertas, o lote de entrega) e responde 409 com a frase que ensina,
  // para QUALQUER peça; nenhuma escrita acontece aqui.
  app.patch("/api/items/:id/deliver", requireAuth, async (req, res) => {
    if (!["grafica", "solicitacao", "admin"].includes(req.userRole ?? "")) {
      return res.status(403).json({ error: "Sem permissão para registrar entrega" });
    }
    const currentItem = await storage.getItem(req.params.id).catch(() => null);
    if (!currentItem) return res.status(404).json({ error: "Peça não encontrada." });
    return res.status(409).json({ error: "Embale antes de entregar (Embalar pede a foto; a entrega pede só quem recebeu)" });
  });
}
