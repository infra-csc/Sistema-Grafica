// Impressão: iniciar/trocar de máquina e informar impressas (e as rotas aposentadas).
import type { Express } from "express";
import { eq, sql } from "drizzle-orm";
import { db } from "../../db";
import { storage, assetPrefix, assetSeqOf } from "../../storage";
import { type Item, items as itemsTable, auditLogs } from "@shared/schema";
// TRAVA DA SOLICITAÇÃO (21/09): o que faz a peça andar na Gráfica é barrado
// com 409 e a frase humana; ver shared/trava-da-peca.ts.
import { pecaTravada, fraseDaTrava, CODIGO_PECA_TRAVADA } from "@shared/trava-da-peca";
import { EM_REVISAO, ehMaquinaValida, rotuloDaMaquina } from "@shared/fluxo-peca";
import { ehMolde } from "@shared/molde";
import { quemOcupaAImpressora, erroImpressoraOcupada } from "../../services/ocupacaoDasImpressoras";
import {
  chaveDoLockDaImpressora,
  resumoDaReserva,
  planejarInicioDaImpressao,
  travasDoInicio,
} from "@shared/reserva-de-impressora";
// Impressão sob a linha travada (revisão adversarial, 22/09).
import {
  aImprimirDaPeca,
  planejarLancamentoDeImpressas,
  ERRO_LANCAMENTO_TRAVADA,
  eventoBarraImpressas,
} from "@shared/impressao-dividida";
import {
  requireAuth,
  broadcast,
  translateStatus,
  sendSensitiveError,
  createAuditLog,
  createAuditLogsEmLote,
  resolveActor,
} from "../shared";
import { runInventoryCron } from "../../services/inventoryLifecycle";
import { erroEventoFechado, motivoEventoDaPeca, barraEventoFinalizado } from "../eventoFinalizado";
import { registrarImpressao } from "./comum";

/** approve (410), start-printing, start-production. */
export function registrarRotasDeImpressao(app: Express): void {
  // PATCH /api/items/:id/edit SAIU: era uma irmã do PATCH genérico sem zod,
  // sem piso de quantidade e sem a regra do complemento (dava para aumentar
  // peça em produção por ela). Nenhuma tela a chamava; editar peça é só pelo
  // PATCH /api/items/:id.

  // Caminho antigo do "liberar para produção": gravava "approved" a partir de
  // QUALQUER estado, pulando aprovação e revisão. Nenhuma tela chama mais;
  // quem chamar recebe 410 e o caminho certo.
  app.patch("/api/items/:id/approve", requireAuth, (_req, res) => {
    res.status(410).json({ error: "Esta forma de liberar a peça foi desativada. Use a Revisão Final para liberar para produção." });
  });

  // Start production (Gráfica module)
  // ── INICIAR IMPRESSÃO (dono, 14/09) ─────────────────────────────────────────
  // "Em Produção" existia e quase nunca acontecia: 2.227 peças foram direto de
  // "Pronto para Produção" para "Produzido" e só UMA passou pelo meio, porque o
  // único gesto da Gráfica registrava o RESULTADO ("produzi 40") e nunca o
  // INÍCIO ("coloquei na máquina"). Este é o primeiro momento: a peça entra na
  // máquina escolhida e fica "Em Impressão" até alguém registrar o que saiu.
  //
  // Também serve para TROCAR de máquina com a peça já em impressão — a máquina
  // quebra, a peça muda de lugar, e o registro precisa acompanhar.
  app.patch("/api/items/:id/start-printing", requireAuth, async (req, res) => {
    try {
      if (req.userRole !== "grafica" && req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas usuários com perfil Gráfica podem iniciar impressão" });
      }
      // `quantidade` (dono, 21/09: "ao mover, poder selecionar tudo ou
      // quantidades"): só na TROCA, move parte do que resta na origem —
      // a peça fica dividida entre impressoras (shared/impressao-dividida.ts).
      // `deMaquina`: de qual parte sai, quando a peça já está dividida.
      // `iniciarParte` (21/09, reserva com quantidade): inicia SÓ uma parte da
      // peça nesta impressora — a reservada a ela (`daReserva`) ou `quantidade`
      // do que está sem impressora. O resto segue reservado / na fila geral.
      const { printMachine, quantidade, deMaquina, iniciarParte: pedeParte, daReserva } = req.body ?? {};
      if (!ehMaquinaValida(printMachine)) {
        return res.status(400).json({ error: "Escolha a máquina em que a peça vai ser impressa" });
      }
      if (quantidade != null && (!Number.isInteger(Number(quantidade)) || Number(quantidade) <= 0)) {
        return res.status(400).json({ error: "A quantidade a mover precisa ser um número inteiro maior que zero" });
      }
      const antes = await storage.getItem(req.params.id);
      if (!antes) return res.status(404).json({ error: "Peça não encontrada" });
      // ANDA: a peça vai para a máquina — mesma guarda de quem imprime. O
      // evento é o mesmo com a linha travada; a leitura de fora basta aqui.
      if (await barraEventoFinalizado(antes, res)) return;
      // MOLDE (22/09) não passa por impressora: é marcado como produzido direto.
      if (ehMolde(antes)) return res.status(409).json({ error: "Molde não vai para a impressora — use \"Marcar como produzido\"." });
      const falha = (status: number, corpo: Record<string, unknown>) => Object.assign(new Error(String(corpo.error)), { httpStatus: status, corpo });
      const PODE_IR_PARA_A_MAQUINA = ["ready_for_production", "pronto_para_producao", "approved", "liberado", "inProduction", "em_producao"];
      const pedido = { printMachine, quantidade: quantidade == null ? null : Number(quantidade), deMaquina: ehMaquinaValida(deMaquina) ? deMaquina : null, iniciarParte: pedeParte === true, daReserva: daReserva === true };
      // UMA PEÇA POR VEZ POR IMPRESSORA (dono, 21/09): iniciar (inteira ou
      // parte) e trocar de máquina recusam a impressora que já tem OUTRA peça
      // com parte ativa. A mesma peça pode somar parte onde já está.
      //
      // CORRIDA ENTRE PEÇAS: a checagem + a gravação rodam sob um LOCK
      // CONSULTIVO por impressora (pg_advisory_xact_lock) — a ocupação mora no
      // jsonb, não há índice único que a segure. Na troca travam-se origem e
      // destino, sempre na MESMA ordem (travasDoInicio).
      //
      // CORRIDA NA MESMA PEÇA (revisão adversarial, 22/09): dois gestos na
      // mesma peça em impressoras diferentes não se cruzam nos locks
      // consultivos. Então, DEPOIS deles, a linha da peça é travada (FOR
      // UPDATE), tudo é recalculado sobre ELA e gravado por esta transação —
      // nada de storage.updateItem (outra conexão) no meio. Ordem fixa dos
      // locks: impressoras (ordenadas) → linha da peça; nenhum gesto trava a
      // linha antes de uma impressora, então não há ciclo.
      //
      // As impressoras a travar saem da linha; se a linha travada pedir uma que
      // a leitura de fora não previa (a peça mudou de máquina no meio), a
      // transação desiste sem gravar e recomeça com o conjunto novo.
      let travas = travasDoInicio(antes, pedido);
      type Feito = { item: Item; movimento: { movidas: number; ficam: number } | null; parte: { quantidade: number; reserva: Record<string, number> | null } | null; origem: string | null; current: Item };
      let feito: Feito | null = null;
      for (let tentativa = 0; tentativa < 3 && !feito; tentativa++) {
        const r: Feito | { recomecar: string[] } = await db.transaction(async (tx) => {
          for (const m of travas) await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${chaveDoLockDaImpressora(m)}))`);
          const [current] = await tx.select().from(itemsTable).where(eq(itemsTable.id, req.params.id)).for("update");
          if (!current || current.deletedAt) throw falha(404, { error: "Peça não encontrada" });
          const precisa = travasDoInicio(current, pedido);
          if (precisa.some((m) => !travas.includes(m))) return { recomecar: precisa };
          // As guardas sobre a linha TRAVADA (a leitura de fora pode estar velha).
          if (pecaTravada(current as any)) throw falha(409, { error: fraseDaTrava(current as any), code: CODIGO_PECA_TRAVADA });
          if (EM_REVISAO.has(current.status)) throw falha(409, { error: "Esta peça está em revisão — a Gráfica só age depois que a revisão liberar." });
          if (!PODE_IR_PARA_A_MAQUINA.includes(current.status)) throw falha(409, { error: `A peça não pode ir para a máquina no status atual: ${translateStatus(current.status)}` });
          // aImprimirDaPeca: quantidade − reaproveitadas, e ZERO na peça de reuso
          // legado (isReuse) — a mesma conta das telas.
          if (aImprimirDaPeca(current as any) - (current.quantityProduced || 0) <= 0) {
            throw falha(409, { error: "Nada a imprimir: a peça já está coberta por produção e reaproveitamento" });
          }
          const ocupante = await quemOcupaAImpressora(printMachine, current.id, tx);
          if (ocupante) {
            throw falha(409, { error: erroImpressoraOcupada(printMachine, ocupante), code: "PRINTER_BUSY", ocupante: { id: ocupante.id, displayId: ocupante.displayId } });
          }
          const plano = planejarInicioDaImpressao(current as any, pedido);
          if (!plano.ok) throw falha(409, { error: plano.erro });
          const agora = new Date();
          const [item] = await tx.update(itemsTable).set({
            ...plano.set,
            updatedAt: agora,
            // O carimbo do storage ("desde quando"), aqui à mão: a linha está travada.
            ...(current.status !== "inProduction" ? { statusChangedAt: agora } : {}),
            ...(!current.productionStartedAt ? { productionStartedAt: agora } : {}),
          } as any).where(eq(itemsTable.id, current.id)).returning();
          if (!item) throw falha(404, { error: "Peça não encontrada" });
          return { item, movimento: plano.movimento, parte: plano.parte, origem: plano.origem, current };
        });
        if ("recomecar" in r) { travas = Array.from(new Set([...travas, ...r.recomecar])).sort(); continue; }
        feito = r;
      }
      if (!feito) return res.status(409).json({ error: "A peça mudou de impressora enquanto você agia — confira e tente de novo.", code: "PRODUCTION_CONFLICT" });
      const { item, movimento, parte, origem, current } = feito;

      await createAuditLog(
        req,
        "production",
        "item",
        item.id,
        movimento
          ? (movimento.ficam > 0
            ? `Movidas ${movimento.movidas} un. para a ${rotuloDaMaquina(printMachine)} (${movimento.ficam} ficam na ${rotuloDaMaquina(origem)})`
            : `Impressão mudou de máquina: ${rotuloDaMaquina(origem)} → ${rotuloDaMaquina(printMachine)}`)
          : parte
            ? `Impressão iniciada na ${rotuloDaMaquina(printMachine)}: ${parte.quantidade} un.${parte.reserva ? ` (segue reservado: ${resumoDaReserva(parte.reserva)})` : ""}`
            : `Impressão iniciada na ${rotuloDaMaquina(printMachine)} (${translateStatus(current.status)} → ${translateStatus("inProduction")})`
      );

      await registrarImpressao(req, {
        itemId: item.id,
        maquina: printMachine,
        tipo: movimento ? "troca" : "inicio",
        // Na troca, quantas unidades foram para a máquina nova (o resumo não
        // soma "troca" como impressas — é só o rastro de quanto se moveu).
        quantidade: movimento?.movidas ?? 0,
        totalDepois: current.quantityProduced ?? 0,
      });

      broadcast({ type: "item_updated", item });
      broadcast({ type: "production_started", item });
      res.json(item);
    } catch (error: any) {
      if (error?.httpStatus) return res.status(error.httpStatus).json(error.corpo ?? { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/items/:id/start-production", requireAuth, async (req, res) => {
    try {
      if (req.userRole !== "grafica" && req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas usuários com perfil Gráfica podem iniciar produção" });
      }
      let { quantityProduced } = req.body;
      const { printMachine, maquina } = req.body;
      // A máquina é OPCIONAL aqui: a tela sempre manda (é ela que obriga a
      // escolha), mas este contrato é antigo e tem outros chamadores. O que o
      // servidor não aceita é máquina que não existe.
      if (printMachine != null && !ehMaquinaValida(printMachine)) {
        return res.status(400).json({ error: `Máquina inválida: ${printMachine}` });
      }
      if (maquina != null && !ehMaquinaValida(maquina)) {
        return res.status(400).json({ error: `Máquina inválida: ${maquina}` });
      }

      // A leitura de FORA serve só ao que não muda com a peça: existir, o
      // evento finalizado e o molde. Tudo o que decide a gravação (status,
      // impressas, partes, trava, o lock otimista) é refeito sobre a linha
      // TRAVADA, dentro da transação — ver planejarLancamentoDeImpressas.
      const antes = await storage.getItem(req.params.id);
      if (!antes) return res.status(404).json({ error: "Peça não encontrada." });
      // Travada pela Solicitação: resposta rápida (a transação repete a guarda).
      if (pecaTravada(antes as any)) return res.status(409).json({ error: fraseDaTrava(antes as any), code: CODIGO_PECA_TRAVADA });
      // ANDA — e é o mais caro de todos: aqui a peça vira LONA IMPRESSA e ainda
      // gera ativos no Estoque. Imprimir para um evento que já aconteceu é
      // dinheiro queimado que nenhum estorno recupera.
      // Exceção (IMPRESSAS_EM_EVENTO_REALIZADO, shared/impressao-dividida): no
      // evento que JÁ ACONTECEU, a peça que já estava na impressora pode
      // informar o que saiu — é registro, não trabalho novo. O teto é o que
      // estava atribuído à impressora (o plano abaixo); iniciar/trocar de
      // máquina (start-printing) segue barrado.
      const motivoFechado = await motivoEventoDaPeca(antes);
      if (motivoFechado && eventoBarraImpressas(motivoFechado, antes.status)) {
        return res.status(409).json({ error: erroEventoFechado(motivoFechado), code: "EVENT_FINALIZED", reason: motivoFechado });
      }
      // MOLDE (22/09): nada de impressas nem parcial — "Marcar como produzido".
      if (ehMolde(antes)) return res.status(409).json({ error: "Molde não vai para a impressora — use \"Marcar como produzido\"." });

      // ── CONCORRÊNCIA (revisão adversarial, 22/09) ─────────────────────────
      // A rota lia a peça aqui fora e gravava só `where id`: dois lançamentos
      // simultâneos em impressoras diferentes da mesma peça DIVIDIDA partiam
      // da mesma foto do jsonb, e o segundo apagava as impressas do primeiro.
      // Agora: SELECT … FOR UPDATE da linha, o plano inteiro recalculado sobre
      // ela (planejarLancamentoDeImpressas, puro) e a gravação por ESTA
      // transação. O segundo lançamento espera o primeiro e soma sobre ele.
      // `quantityProduced` é ABSOLUTO; `expectedProduced` (o total que o
      // operador leu) — ou, na peça por partes, `expectedNaMaquina` (o que ele
      // leu na parte dele) — vira 409 PRODUCTION_CONFLICT quando alguém lançou
      // no meio-tempo. Campos OPCIONAIS — clientes que não enviam seguem.
      const falha = (status: number, corpo: Record<string, unknown>) => Object.assign(new Error(String(corpo.error)), { httpStatus: status, corpo });
      const { item, plano } = await db.transaction(async (tx) => {
        const [before] = await tx.select().from(itemsTable).where(eq(itemsTable.id, req.params.id)).for("update");
        if (!before || before.deletedAt) throw falha(404, { error: "Peça não encontrada." });
        // O evento finalizado, de novo sobre a linha TRAVADA: a exceção do
        // realizado vale só para a peça que ESTÁ em impressão agora.
        if (motivoFechado && eventoBarraImpressas(motivoFechado, before.status)) {
          throw falha(409, { error: erroEventoFechado(motivoFechado), code: "EVENT_FINALIZED", reason: motivoFechado });
        }
        const plano = planejarLancamentoDeImpressas(before as any, req.body ?? {}, new Date());
        if (!plano.ok) {
          throw plano.corpo.error === ERRO_LANCAMENTO_TRAVADA
            ? falha(409, { error: fraseDaTrava(before as any), code: CODIGO_PECA_TRAVADA })
            : falha(plano.status, plano.corpo);
        }
        const [updated] = await tx
          .update(itemsTable)
          .set(plano.set as any)
          .where(eq(itemsTable.id, before.id))
          .returning();
        if (!updated) throw falha(404, { error: "Peça não encontrada." });

        await tx.insert(auditLogs).values({
          ...resolveActor(req),
          action: plano.novoStatus === "produced" ? "produced" : "production",
          entityType: "item",
          entityId: updated.id,
          details: `Produção: ${plano.quantityProduced}/${updated.quantity} un. (${translateStatus(before.status)} → ${translateStatus(plano.novoStatus)})`
            // O campo é ABSOLUTO e por anos foi rotulado como incremental na
            // tela: quem produzia 6 de 10, voltava e digitava "4" REGREDIA o
            // total para 4 sem nenhum vestígio. Enquanto o número absoluto for
            // o contrato, ao menos a regressão deixa de ser silenciosa.
            + (plano.quantityProduced < plano.jaProduzido ? ` — ATENÇÃO: total produzido REDUZIDO de ${plano.jaProduzido} para ${plano.quantityProduced} un.` : ""),
        });

        return { item: updated, plano };
      });
      quantityProduced = plano.quantityProduced;
      const jaProduzido = plano.jaProduzido;

      // O que saiu NESTE lançamento, na máquina deste momento (a parte
      // informada; na peça não dividida, a da peça — a enviada só vale para a
      // peça antiga sem impressora anotada).
      await registrarImpressao(req, {
        itemId: item.id,
        maquina: plano.maquinaDoRegistro,
        tipo: item.status === "produced" ? "conclusao" : "parcial",
        quantidade: quantityProduced - jaProduzido,
        totalDepois: quantityProduced,
      });
      // LIMBO: a última parte ativa esgotou e a peça voltou para a fila sem
      // fechar — ela SAIU da impressora. A "pausa" no diário é o que faz o
      // resumo parar de contá-la como "ainda na máquina".
      if (plano.voltouParaAFila) {
        await registrarImpressao(req, { itemId: item.id, maquina: plano.maquinaDoRegistro, tipo: "pausa", quantidade: 0, totalDepois: quantityProduced });
      }

      const event = await storage.getEvent(item.eventId);

      // Auto-add to inventory when fully produced — N individual records
      if (item.status === 'produced') {
        const existingAssets = await storage.getAssetsByOriginalItemId(item.id);
        const itemName = item.description
          ? `${item.type} — ${item.description}`
          : item.type;
        const franchiseTags = event?.franchise
          ? [event.franchise.toLowerCase().replace(/\s+/g, '_')]
          : [];
        // Get sponsors linked to this item
        const itemSponsorLinks = await storage.getItemSponsors(item.id);
        const linkedSponsorIds = itemSponsorLinks.map(s => s.sponsorId);
        // Get approvalThumbUrl from item
        const approvalThumbUrl = item.approvalThumbUrl ?? null;
        // Prefixo do ativo a partir do displayId da peça.
        // ANTES: displayId.replace(/[^0-9]/g,'') — que para "#0062" dava "0062"
        // (certo) mas para o complemento "#0062-C1" dava "00621", um código
        // ilegível que ainda por cima colide com a peça #0621. assetPrefix
        // devolve "0062" para a mãe (byte a byte idêntico ao anterior: zero
        // risco no acervo existente) e "0062C1" para o complemento.
        const itemNum = assetPrefix(item.displayId);
        // Complemento ganha rastro no próprio ativo — quem abre o Estoque seis
        // meses depois entende por que existem dois blocos da "mesma" peça.
        const assetNotes = item.parentItemId
          ? `Gráfica — Evento: ${event?.name ?? '—'} · Complemento de ${(await storage.getItem(item.parentItemId))?.displayId ?? '—'}`
          : `Gráfica — Evento: ${event?.name ?? '—'}`;

        const producedBy = (req as any).userName || 'Gráfica';
        const novoAtivo = (seq: number) => ({
          displayId: `#EST-${itemNum}-${seq}`,
          name: itemName,
          quantity: 1,
          originalItemId: item.id,
          condition: "PERFEITO" as const,
          location: null,
          franchiseTags,
          sponsorIds: linkedSponsorIds,
          approvalThumbUrl,
          trackingStatus: "NO_GALPAO" as const,
          notes: assetNotes,
          autoAdded: true,
        });

        if (existingAssets.length < quantityProduced) {
          // Numeração pelo MAIOR sufixo existente, nunca por contagem.
          // Com contagem, excluir o ativo #EST-0062-3 de um bloco de 5 fazia o
          // próximo lote recomeçar em -5 (que já existe) e o INSERT estourar
          // 23505 — um 500 lançado DEPOIS de a peça já ter sido marcada como
          // produzida, ou seja, com o item num estado que ninguém reproduz.
          const maiorSeq = existingAssets.reduce((max, a) => Math.max(max, assetSeqOf(a.displayId)), 0);
          const faltam = quantityProduced - existingAssets.length;
          const records = Array.from({ length: faltam }, (_, i) => novoAtivo(maiorSeq + i + 1));
          const created = await storage.createInventoryAssets(records);
          // Trilha em LOTE: um INSERT para o bloco inteiro (eram N idas ao banco, uma por ativo).
          await createAuditLogsEmLote({ userName: producedBy, userId: req.userId }, created.map((a) => ({
            action: 'cadastrado', entityType: 'inventory_asset', entityId: a.id,
            details: JSON.stringify({ evento: event?.name ?? '—', itemId: item.id }),
          })));
        }
        // O ciclo de vida já, e só do evento da peça: ativo de evento com data
        // passada vai direto a EM_USO / AGUARDANDO_TRIAGEM sem esperar o próximo tick.
        runInventoryCron(item.eventId);
      }
      
      // Não notificar sobre início de produção
      
      broadcast({ type: "production_started", item });

      res.json(item);
    } catch (error: any) {
      // O corpo inteiro do 409 (code PRODUCTION_CONFLICT / PECA_TRAVADA,
      // actualProduced) — a tela decide pelo código. O 500 não vaza error.message.
      if ((error as any)?.httpStatus) return res.status((error as any).httpStatus).json((error as any).corpo ?? { error: error.message });
      sendSensitiveError(res, error, "Informar impressas", 500);
    }
  });
}

/** POST /api/items/:id/production (410). */
export function registrarRotaAposentadaDeProducao(app: Express): void {
  // ── ROTA APOSENTADA — 410 Gone ────────────────────────────────────────────
  // Era um SEGUNDO caminho de produção, paralelo a /start-production e sem
  // nenhuma das travas dele: marcava "produced" SEM teto (aceitava 999 numa
  // peça de 10), sem somar reuseQty, sem gravar quantityProduced (o número
  // ficava só na tabela production_updates, invisível para a Gráfica) e sem
  // criar os ativos de inventário. Zero callers no client — foi verificado.
  // Continua registrada, respondendo 410, para que qualquer script ou aba
  // antiga receba uma explicação em vez de um 404 mudo. Não remover sem antes
  // conferir os logs de acesso.
  app.post("/api/items/:id/production", requireAuth, async (_req, res) => {
    res.status(410).json({
      error: 'Rota descontinuada. Use PATCH /api/items/:id/start-production, que valida o teto de produção, soma o reaproveitamento e cria os ativos de inventário.',
      code: "ROUTE_GONE",
    });
  });
}
