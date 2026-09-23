// Reaproveitamento marcado pela Gráfica/Solicitação e a correção dele.
import type { Express } from "express";
import { storage } from "../../storage";
// TRAVA DA SOLICITAÇÃO (21/09): o que faz a peça andar na Gráfica é barrado
// com 409 e a frase humana; ver shared/trava-da-peca.ts.
import { pecaTravada, fraseDaTrava, CODIGO_PECA_TRAVADA } from "@shared/trava-da-peca";
import { EM_REVISAO } from "@shared/fluxo-peca";
import {
  colunasDaReserva,
  reservaDaPeca,
  encolherReserva,
  reescalarReservaEPartes,
} from "@shared/reserva-de-impressora";
import { lerPartes } from "@shared/impressao-dividida";
import { requireAuth, broadcast, translateStatus, createAuditLog } from "../shared";
import { barraEventoFinalizado } from "../eventoFinalizado";
import { registrarSaidaDaImpressora } from "./comum";
import { responderFalha } from "../../erros";
import { vemDeOrigemValida, podeTransicionar } from "@shared/maquina-de-estados";

/** mark-reuse, correct-reuse. */
export function registrarReaproveitamento(app: Express): void {
  // Gráfica marca unidades como reaproveitamento — total ou parcial. As unidades
  // reaproveitadas dispensam produção, mas continuam passando pela conferência
  // junto com as produzidas.
  app.post("/api/items/:id/mark-reuse", requireAuth, async (req, res) => {
    try {
      if (req.userRole !== "grafica" && req.userRole !== "admin" && req.userRole !== "solicitacao") {
        return res.status(403).json({ error: "Apenas a Gráfica ou Solicitação pode marcar reaproveitamento" });
      }
      const current = await storage.getItem(req.params.id);
      if (!current) return res.status(404).json({ error: "Peça não encontrada" });
      // ANDA: marcar reaproveitamento move a peça no fluxo (pode fechá-la como
      // "Produzido") e, por tabela, cria ativo de inventário. É decisão de
      // produção, não registro do passado.
      if (await barraEventoFinalizado(current, res)) return;
      // Reaproveitar ANDA a peça (pode fechá-la como Produzido): a trava segura.
      if (pecaTravada(current as any)) return res.status(409).json({ error: fraseDaTrava(current), code: CODIGO_PECA_TRAVADA });
      if (current.status === "delivered" || current.status === "entregue") {
        return res.status(409).json({ error: "Não é possível reaproveitar uma peça já entregue" });
      }
      // Em Revisão a Gráfica só OLHA (regra do dono, 25/08): a peça está na
      // mesa de quem revisa, e reaproveitar é decidir o que entra na fila de
      // produção. O botão nem aparece; esta é a tranca de quem chega por
      // script ou por tela desatualizada.
      if (EM_REVISAO.has(current.status)) {
        return res.status(409).json({ error: "Esta peça está em revisão — a Gráfica só age depois que a revisão liberar." });
      }
      // Permite marcar como reaproveitamento enquanto a peça ainda está no
      // fluxo de produção (REAPROVEITAVEL, em shared/maquina-de-estados.ts).
      // APÓS PRODUZIDO (dono, 27/08): Solicitação e admin ainda podem mudar a
      // quantidade reaproveitada — CONVERTENDO unidades produzidas em
      // reaproveitadas. A peça continua "Produzido" (o total segue coberto);
      // muda só a composição, que é o que a metragem e o custo leem. A Gráfica
      // fica de fora: ela produz o que pedem, não reescreve o pedido.
      const ehProduzida = current.status === "produced" || current.status === "produzido";
      const viaProduzida = ehProduzida
        && podeTransicionar(current.status, "ajustar-reaproveitamento-da-produzida", req.userRole);
      if (!vemDeOrigemValida(current.status, "reaproveitar-parte") && !viaProduzida) {
        return res.status(409).json({
          error: ehProduzida
            ? "Peça já produzida: mudar o reaproveitamento agora é da Solicitação e do admin."
            : `Status atual não permite reaproveitamento: ${translateStatus(current.status)}`,
        });
      }
      // Depois que a conferência ou a entrega começam, o número vira contagem
      // física — a mesma tranca do correct-reuse.
      if (viaProduzida && (current.conferredQty || 0) > 0) {
        return res.status(409).json({ error: "Não é possível reaproveitar: a peça já foi parcialmente conferida" });
      }
      if (viaProduzida && (current.deliveredQty || 0) > 0) {
        return res.status(409).json({ error: `Não é possível reaproveitar: ${current.deliveredQty} un. já foram entregues` });
      }

      const alreadyReused = current.reuseQty || 0;
      const produced = current.quantityProduced || 0;

      // ── VIA PÓS-PRODUZIDO: ajuste ABSOLUTO, nas duas direções ────────────
      // A primeira versão só somava — "só consigo aumentar e não diminuir"
      // (dono, 27/08). O controle da tela manda o TOTAL desejado (reuseTotal,
      // 0..quantidade) e a conversão anda para os dois lados: o que vira
      // reuso sai do produzido e vice-versa; produzido + reuso seguem
      // somando a quantidade, e o status continua "Produzido" — nada volta
      // para a fila. Reduzir a ZERO também é legítimo (desfaz a conversão).
      if (viaProduzida) {
        const alvo = req.body?.reuseTotal != null
          ? Math.max(0, Math.min(current.quantity, Math.floor(Number(req.body.reuseTotal)) || 0))
          // chamador antigo (qty = delta): soma, com teto na quantidade
          : Math.min(current.quantity, alreadyReused + Math.max(1, Math.floor(Number(req.body?.qty)) || (current.quantity - alreadyReused)));
        if (alvo === alreadyReused) {
          return res.status(409).json({ error: `A peça já tem ${alreadyReused} un. reaproveitada(s).` });
        }
        const item = await storage.updateItem(req.params.id, {
          reuseQty: alvo,
          isReuse: alvo >= current.quantity,
          quantityProduced: current.quantity - alvo,
          status: "produced" as const,
          // Produzida: a divisão entre impressoras e a reserva acabaram.
          impressaoPorMaquina: null,
          reservaPorMaquina: null,
          maquinaPrevista: null,
        });
        if (!item) return res.status(404).json({ error: "Peça não encontrada" });
        await createAuditLog(
          req, 'updated', 'item', item.id,
          `Reaproveitamento ajustado após Produzido: ${alreadyReused} → ${alvo} un. reaproveitada(s) (${current.quantity - alvo} produzida(s) de ${current.quantity})`
        );
        broadcast({ type: "item_updated", item });
        return res.json(item);
      }

      // ── Fluxo normal (antes de Produzido): só SOMA, sem invadir o produzido ──
      const room = current.quantity - alreadyReused - produced;
      if (room <= 0) {
        return res.status(409).json({ error: `Nada a reaproveitar: ${alreadyReused} reaproveitada(s) e ${produced} produzida(s) de ${current.quantity}.` });
      }

      // Sem quantidade no corpo, reaproveita tudo o que resta (comportamento antigo).
      const n = Math.min(room, Math.max(1, Number(req.body?.qty) || room));
      const newReuse = alreadyReused + n;
      const isFullReuse = newReuse >= current.quantity;
      // Fecha em "Produzido" quando reuso + produção cobrem a quantidade toda.
      const isReady = newReuse + produced >= current.quantity;

      const item = await storage.updateItem(req.params.id, {
        reuseQty: newReuse,
        isReuse: isFullReuse,
        ...(isReady ? { status: "produced" as const } : {}),
        // Reaproveitar muda o que há para imprimir: a divisão entre impressoras
        // é reescalada (e some quando a peça fecha como produzida).
        ...(() => {
          const r = reescalarReservaEPartes(current, current.quantity - newReuse);
          return {
            ...(lerPartes(current.impressaoPorMaquina) ? { impressaoPorMaquina: isReady ? null : r.partes } : {}),
            ...colunasDaReserva(isReady ? null : r.reserva, current.reservaPorMaquina),
          };
        })(),
      });
      if (!item) return res.status(404).json({ error: "Peça não encontrada" });

      await createAuditLog(
        req,
        'updated',
        'item',
        item.id,
        isFullReuse
          ? `Reaproveitamento total pela Gráfica: ${newReuse}/${current.quantity} un.`
          : `Reaproveitamento parcial pela Gráfica: ${n} un. (${newReuse}/${current.quantity} reaproveitadas, ${current.quantity - newReuse} a produzir)`
      );

      broadcast({ type: "item_updated", item });
      res.json(item);
    } catch (error) {
      responderFalha(res, error, "POST /api/items/:id/mark-reuse");
    }
  });

  // Corrige reaproveitamento total que foi marcado por engano na Solicitação.
  // Só disponível enquanto a peça ainda não foi conferida (status = produced, conferredQty = 0).
  app.post("/api/items/:id/correct-reuse", requireAuth, async (req, res) => {
    try {
      if (
        req.userRole !== "grafica" &&
        req.userRole !== "admin" &&
        req.userRole !== "solicitacao"
      ) {
        return res.status(403).json({ error: "Apenas a Gráfica, Solicitação ou Admin pode corrigir reaproveitamento" });
      }

      const current = await storage.getItem(req.params.id);
      if (!current) return res.status(404).json({ error: "Peça não encontrada" });
      // Em Revisão a Gráfica só OLHA (regra do dono, 25/08) — mesma tranca
      // do mark-reuse logo acima.
      if (EM_REVISAO.has(current.status)) {
        return res.status(409).json({ error: "Esta peça está em revisão — a Gráfica só age depois que a revisão liberar." });
      }

      // ANDA, apesar do nome. "Corrigir reaproveitamento" devolve a peça para
      // "Pronto p/ Produção" e ZERA quantityProduced — ou seja, recoloca a peça
      // na fila da Gráfica pedindo impressão. Num evento finalizado é
      // exatamente o trabalho fantasma que esta guarda existe para impedir.
      if (await barraEventoFinalizado(current, res)) return;

      // O que realmente impede a correção é a peça já ter sido conferida ou
      // entregue — é aí que o número vira contagem física. O status por si só
      // não impedia nada, mas travava o caso mais comum: a quantidade foi
      // digitada errada e o erro só é notado antes de produzir, com a peça em
      // "Pronto p/ Produção". O admin passa a corrigir em qualquer etapa
      // anterior à conferência; Gráfica e Solicitação seguem restritas a
      // "Produzido", que é o momento em que elas encostam na peça.
      const isAdmin = req.userRole === "admin";
      // (a janela de cada papel: shared/maquina-de-estados.ts, "corrigir-reaproveitamento-para-a-fila")
      if (!podeTransicionar(current.status, "corrigir-reaproveitamento-para-a-fila", req.userRole)) {
        return res.status(409).json({ error: "Correção disponível apenas para peças com status Produzido" });
      }
      if ((current.conferredQty || 0) > 0) {
        return res.status(409).json({ error: "Não é possível corrigir: a peça já foi parcialmente conferida" });
      }
      // Reuso antigo vai direto para a entrega sem conferir: sem esta checagem,
      // uma peça com unidades já entregues voltaria para "Pronto p/ Produção"
      // carregando deliveredQty, e a contagem de entrega ficaria inconsistente.
      if ((current.deliveredQty || 0) > 0) {
        return res.status(409).json({ error: `Não é possível corrigir: ${current.deliveredQty} un. já foram entregues` });
      }
      // O reaproveitamento antigo EMBALA sem conferir: voltar a peça para a
      // produção com unidades num tubo deixaria a embalagem sem material.
      if ((current.embaladaQty || 0) > 0) {
        return res.status(409).json({ error: `Não é possível corrigir: ${current.embaladaQty} un. já estão embaladas. Tire a peça do tubo antes de corrigir.` });
      }
      if ((current.reuseQty || 0) === 0 && !current.isReuse) {
        return res.status(409).json({ error: "Peça não tem reaproveitamento para corrigir" });
      }

      // O intervalo ia até quantidade-1, o que impedia justamente o caminho
      // inverso: quem marcou parcial por engano não conseguia voltar para
      // reaproveitamento total. O admin alcança o total; para os demais o
      // limite continua sendo o parcial, que é o que a operação deles cobre.
      const maximo = isAdmin ? current.quantity : current.quantity - 1;
      const correctedReuseQty = Number(req.body?.correctedReuseQty);
      if (isNaN(correctedReuseQty) || correctedReuseQty < 0 || correctedReuseQty > maximo) {
        return res.status(400).json({
          error: `Quantidade corrigida inválida (deve ser entre 0 e ${maximo})`,
        });
      }

      // Reaproveitar tudo pula a produção; qualquer valor menor deixa sobra e
      // manda a peça de volta para a fila.
      const reaproveitaTudo = correctedReuseQty === current.quantity;
      // Levar a peça a PRODUZIDO (reaproveitamento total) é fazê-la andar: a
      // trava da Solicitação segura — a mesma frase e o mesmo código do
      // mark-reuse. Voltar para a fila (qualquer valor menor) é recuo e passa.
      if (reaproveitaTudo && pecaTravada(current)) {
        return res.status(409).json({ error: fraseDaTrava(current), code: CODIGO_PECA_TRAVADA });
      }

      const item = await storage.updateItem(req.params.id, {
        reuseQty: correctedReuseQty,
        isReuse: reaproveitaTudo,
        status: reaproveitaTudo ? ("produced" as const) : ("ready_for_production" as const),
        // A produção lançada antes da marcação errada não vale mais para a
        // quantidade que agora precisa ser impressa.
        quantityProduced: reaproveitaTudo ? current.quantity : null,
        // A peça volta a "Pronto p/ Produção" (ou fecha): a divisão entre
        // impressoras — que só faz sentido em impressão — é descartada; a
        // reserva encolhe para caber no que agora há para imprimir.
        impressaoPorMaquina: null,
        // Liberada não está em impressora nenhuma (a mesma regra da pausa).
        ...(!reaproveitaTudo && (current.status === "inProduction" || current.status === "em_producao") ? { printMachine: null } : {}),
        ...colunasDaReserva(reaproveitaTudo ? null : encolherReserva(reservaDaPeca({ ...current, status: "ready_for_production", quantityProduced: 0, impressaoPorMaquina: null }), current.quantity - correctedReuseQty), current.reservaPorMaquina),
      });
      if (!item) return res.status(404).json({ error: "Peça não encontrada" });

      await createAuditLog(
        req,
        "updated",
        "item",
        item.id,
        correctedReuseQty === 0
          ? `Reaproveitamento removido por correção — peça voltou para Pronto para Produção (${current.quantity} un. a produzir)`
          : reaproveitaTudo
          ? `Reaproveitamento corrigido para total: ${current.quantity}/${current.quantity} un. — peça pula a produção`
          : `Reaproveitamento corrigido de ${current.reuseQty || (current.isReuse ? current.quantity : 0)} para ${correctedReuseQty}/${current.quantity} un. reaproveitadas, ${current.quantity - correctedReuseQty} a produzir`
      );
      // A peça estava EM IMPRESSÃO (o admin corrige em qualquer etapa antes da
      // conferência): a correção a tira da impressora — "pausa" no diário.
      await registrarSaidaDaImpressora(req, current);

      broadcast({ type: "item_updated", item });
      res.json(item);
    } catch (error) {
      responderFalha(res, error, "POST /api/items/:id/correct-reuse");
    }
  });
}
