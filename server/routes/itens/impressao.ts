// Impressão: iniciar/trocar de máquina e informar impressas (e as rotas aposentadas).
import type { Express } from "express";
import { eq, sql } from "drizzle-orm";
import { db } from "../../db";
import { storage } from "../../storage";
import { type Item, items as itemsTable } from "@shared/schema";
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
  eventoBarraImpressas,
} from "@shared/impressao-dividida";
import {
  requireAuth,
  broadcast,
  translateStatus,
  sendSensitiveError,
  createAuditLog,
} from "../shared";
import { lancarImpressas, cadastrarAtivosDaPecaProduzida } from "../../services/impressas-da-peca";
import { erroEventoFechado, motivoEventoDaPeca, barraEventoFinalizado } from "../eventoFinalizado";
import { registrarImpressao } from "./comum";
import { responderFalha, camposDoErro } from "../../erros";
import { vemDeOrigemValida } from "@shared/maquina-de-estados";

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
          if (pecaTravada(current as any)) throw falha(409, { error: fraseDaTrava(current), code: CODIGO_PECA_TRAVADA });
          if (EM_REVISAO.has(current.status)) throw falha(409, { error: "Esta peça está em revisão — a Gráfica só age depois que a revisão liberar." });
          // De onde pode ir para a máquina: shared/maquina-de-estados.ts ("iniciar-impressao").
          if (!vemDeOrigemValida(current.status, "iniciar-impressao")) throw falha(409, { error: `A peça não pode ir para a máquina no status atual: ${translateStatus(current.status)}` });
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
          }).where(eq(itemsTable.id, current.id)).returning();
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
    } catch (error) {
      const erro = camposDoErro(error);
      if (erro.httpStatus) return res.status(erro.httpStatus).json(erro.corpo ?? { error: erro.message });
      responderFalha(res, error, "PATCH /api/items/:id/start-printing");
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
      if (pecaTravada(antes)) return res.status(409).json({ error: fraseDaTrava(antes), code: CODIGO_PECA_TRAVADA });
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

      // O lançamento sob a linha travada: services/impressas-da-peca.ts.
      const { item, plano } = await lancarImpressas(req.params.id, req.body ?? {}, motivoFechado, req);
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

      // Fechou como produzida: os ativos no Estoque (services/impressas-da-peca.ts).
      if (item.status === 'produced') await cadastrarAtivosDaPecaProduzida(item, event, quantityProduced, req);

      // Não notificar sobre início de produção
      
      broadcast({ type: "production_started", item });

      res.json(item);
    } catch (error) {
      // O corpo inteiro do 409 (code PRODUCTION_CONFLICT / PECA_TRAVADA,
      // actualProduced) — a tela decide pelo código. O 500 não vaza error.message.
      const erro = camposDoErro(error);
      if (erro.httpStatus) return res.status(erro.httpStatus).json(erro.corpo ?? { error: erro.message });
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
