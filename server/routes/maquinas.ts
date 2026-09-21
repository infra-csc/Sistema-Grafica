// ─────────────────────────────────────────────────────────────────────────────
// CONTROLE DE IMPRESSÃO POR MÁQUINA (dono, 14/09).
//
// "É importante também a Gráfica ter uma aba onde ela faz o controle de
// impressão por máquinas: ver quais máquinas estão imprimindo o quê, qual o
// histórico do que foi impresso naquela máquina naquele dia e tudo mais."
//
// Uma leitura só, com as duas perguntas da tela:
//   · AGORA — as peças em "Em Impressão", agrupadas pela máquina anotada. A
//     peça em impressão SEM máquina (iniciada antes do controle existir) não
//     some: vem em `semMaquina`, para alguém ir lá e escolher.
//   · O DIA — os registros de registros_de_impressao daquele dia, no fuso da
//     operação, por máquina, com o total que saiu de cada uma.
//
// A tela AGE a partir daqui (dono, 21/09: "com base no que está aqui eles
// fazem a manutenção e ajustam"): cada peça em impressão vem com o que o modal
// de impressão precisa (quantidade, reaproveitadas, impressas, máquina, desde,
// miniatura da arte, evento) — a gravação continua nos endpoints de items.ts.
//
// O "dia" é o de São Paulo, e a conversão é feita NO BANCO: created_at é
// gravado em UTC, e converter no Node dependeria do fuso do processo — um
// lançamento às 22h caía no dia seguinte.
// ─────────────────────────────────────────────────────────────────────────────
import type { Express } from "express";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { requireAuth, broadcast, createAuditLog, createAuditLogsEmLote, translateStatus } from "./shared";
import { motivoEventoDaPeca } from "./eventoFinalizado";
import { storage } from "../storage";
import { MAQUINAS_DE_IMPRESSAO, ehMaquinaValida, rotuloDaMaquina } from "@shared/fluxo-peca";
import { pecaVisivelPara } from "@shared/kit";
import { agoraNoFuso } from "../services/revisaoDigest";
import { agregarRelatorioDeMaquinas, periodoValido, type RegistroDoPeriodo } from "../services/relatorioDeMaquinas";
import { responderRelatorioMaquinasXlsx } from "../services/xlsxExport";

/** Os mesmos papéis que veem a fila da Gráfica (ROLES_GRAFICA no App). */
const PAPEIS_QUE_VEEM = ["grafica", "solicitacao", "admin"];
const DIA_VALIDO = /^\d{4}-\d{2}-\d{2}$/;
const FUSO = "America/Sao_Paulo";

const linhas = (r: any): any[] => (r?.rows ?? r ?? []) as any[];

/** 403 para quem não é da Gráfica, da Solicitação nem admin — as três rotas usam. */
function podeVer(req: any, res: any): boolean {
  if (PAPEIS_QUE_VEEM.includes(req.userRole ?? "")) return true;
  res.status(403).json({ error: "O controle de máquinas é da Gráfica, da Solicitação e do admin" });
  return false;
}

/**
 * O MESMO recorte do Kit que as leituras de peças aplicam (ver
 * pecaVisivelPara): o usuário do Kit só enxerga as peças que ele mesmo criou
 * em remessa. Sem isto, a aba Máquinas vazaria o que a fila esconde.
 */
function filtroDoKit(req: any): (l: any) => boolean {
  const quemVe = { kit: req.userKit === true, userId: req.userId ?? null };
  return (l: any) => pecaVisivelPara(quemVe, { kitRemessaId: l.kit_remessa_id, criadoPorId: l.criado_por_id });
}

const aImprimir = (quantidade: unknown, reuso: unknown) => Math.max(0, Number(quantidade) - Number(reuso));

/**
 * Os registros do diário de um período (de..ate, no fuso da operação), já no
 * formato que o resumo, a tela e o Excel leem. Do mais antigo ao mais novo.
 */
async function registrosDoPeriodo(req: any, de: string, ate: string): Promise<RegistroDoPeriodo[]> {
  const brutos = linhas(await db.execute(sql`
    select r.id, r.item_id, r.maquina, r.tipo, r.quantidade, r.total_depois, r.user_name,
           to_char((r.created_at at time zone 'UTC') at time zone ${FUSO}, 'YYYY-MM-DD') as dia,
           to_char((r.created_at at time zone 'UTC') at time zone ${FUSO}, 'HH24:MI') as hora,
           (extract(epoch from r.created_at) * 1000)::bigint as em,
           i.display_id, i.type, i.quantity, coalesce(i.reuse_qty, 0) as reuso,
           i.kit_remessa_id, i.criado_por_id,
           e.name as evento
    from registros_de_impressao r
    join items i on i.id = r.item_id
    left join events e on e.id = i.event_id
    where ((r.created_at at time zone 'UTC') at time zone ${FUSO})::date between ${de}::date and ${ate}::date
    order by r.created_at asc
  `)).filter(filtroDoKit(req));
  return brutos.map((l) => ({
    id: l.id,
    itemId: l.item_id,
    displayId: l.display_id,
    tipoPeca: l.type,
    evento: l.evento,
    maquina: l.maquina,
    tipo: l.tipo,
    quantidade: Number(l.quantidade),
    totalDepois: l.total_depois == null ? null : Number(l.total_depois),
    aImprimir: aImprimir(l.quantity, l.reuso),
    dia: l.dia,
    hora: l.hora,
    em: Number(l.em),
    quem: l.user_name,
  }));
}

// ─── RESERVA de impressora (dono, 21/09) ───────────────────────────────────────
// "Deixar na fila alguns itens (geral) ou já setar em alguma impressora."
// É SÓ um controle da aba Máquinas: grava items.maquina_prevista e NADA mais —
// nem status, nem statusChangedAt, nem printMachine, nem productionStartedAt,
// nem linha no diário. A trilha ganha uma linha informativa. A reserva vira
// realidade no start-printing (items.ts), que a limpa.
/** Peça que ainda vai para a máquina: liberada e fora de impressão. */
const PODE_RESERVAR = ["ready_for_production", "pronto_para_producao", "approved", "liberado"];

/** null = fila geral; "1".."4" = impressora. Qualquer outra coisa é inválida. */
function maquinaDoCorpo(corpo: any): { ok: true; maquina: string | null } | { ok: false; erro: string } {
  const m = corpo?.maquina;
  if (m === null || m === undefined || m === "") return { ok: true, maquina: null };
  if (!ehMaquinaValida(m)) return { ok: false, erro: "Impressora inválida — escolha 1 a 4 ou devolva à fila geral" };
  return { ok: true, maquina: m };
}

/** Por que esta peça NÃO pode ser reservada agora; null quando pode. */
async function motivoDeNaoReservar(item: any): Promise<string | null> {
  if (!item || item.deletedAt) return "Peça não encontrada";
  if (!PODE_RESERVAR.includes(item.status)) {
    return `Só peças liberadas para a Gráfica entram na fila das impressoras — esta está em ${translateStatus(item.status)}`;
  }
  const motivo = await motivoEventoDaPeca(item);
  if (motivo) return "O evento desta peça já foi finalizado";
  return null;
}

const fraseDaReserva = (maquina: string | null) =>
  maquina ? `Reservada para a ${rotuloDaMaquina(maquina)}` : "Devolvida à fila geral";

export function registerMaquinasRoutes(app: Express): void {
  app.patch("/api/items/:id/maquina-prevista", requireAuth, async (req, res) => {
    if (req.userRole !== "grafica" && req.userRole !== "admin") {
      return res.status(403).json({ error: "Só a Gráfica e o admin reservam impressora" });
    }
    const pedido = maquinaDoCorpo(req.body);
    if (!pedido.ok) return res.status(400).json({ error: pedido.erro });
    try {
      const atual = await storage.getItem(req.params.id);
      const motivo = await motivoDeNaoReservar(atual);
      if (motivo) return res.status(atual ? 409 : 404).json({ error: motivo });
      if ((atual!.maquinaPrevista ?? null) === pedido.maquina) return res.json(atual);
      // SÓ a reserva (e o updatedAt que o storage carimba). Nada de status.
      const item = await storage.updateItem(atual!.id, { maquinaPrevista: pedido.maquina } as any);
      if (!item) return res.status(404).json({ error: "Peça não encontrada" });
      await createAuditLog(req, "production", "item", item.id, fraseDaReserva(pedido.maquina));
      broadcast({ type: "item_updated", item });
      res.json(item);
    } catch (error: any) {
      console.error("[maquinas] falha ao reservar impressora:", error);
      res.status(500).json({ error: "Não foi possível reservar a impressora." });
    }
  });

  // O lote: { itemIds, maquina }. Peça que não pode entra em `erros`, as
  // outras seguem — o idioma das rotas bulk-* de items.ts.
  app.patch("/api/items/bulk-maquina-prevista", requireAuth, async (req, res) => {
    if (req.userRole !== "grafica" && req.userRole !== "admin") {
      return res.status(403).json({ error: "Só a Gráfica e o admin reservam impressora" });
    }
    const pedido = maquinaDoCorpo(req.body);
    if (!pedido.ok) return res.status(400).json({ error: pedido.erro });
    const ids: string[] = Array.isArray(req.body?.itemIds) ? req.body.itemIds.filter((x: unknown): x is string => typeof x === "string") : [];
    if (ids.length === 0) return res.status(400).json({ error: "Nenhuma peça selecionada" });
    try {
      const pecas = await storage.getItemsByIds(ids);
      const porId = new Map(pecas.map((p) => [p.id, p]));
      const feitas: any[] = [];
      const erros: { itemId: string; displayId: string | null; erro: string }[] = [];
      for (const id of ids) {
        const atual = porId.get(id);
        const motivo = await motivoDeNaoReservar(atual);
        if (motivo) { erros.push({ itemId: id, displayId: atual?.displayId ?? null, erro: motivo }); continue; }
        if ((atual!.maquinaPrevista ?? null) === pedido.maquina) { feitas.push(atual); continue; }
        const item = await storage.updateItem(id, { maquinaPrevista: pedido.maquina } as any);
        if (item) feitas.push(item);
      }
      await createAuditLogsEmLote(req, feitas.map((i) => ({ action: "production", entityType: "item", entityId: i.id, details: fraseDaReserva(pedido.maquina) })));
      for (const item of feitas) broadcast({ type: "item_updated", item });
      res.json({ atualizadas: feitas.length, itens: feitas, erros });
    } catch (error: any) {
      console.error("[maquinas] falha ao reservar impressora em lote:", error);
      res.status(500).json({ error: "Não foi possível reservar as impressoras." });
    }
  });

  // ── O relatório: resumo por dia × impressora + os registros do período ────
  // (dono, 21/09: "não tem relatório diário, não tem relatório para exportar").
  // Leitura só; os mesmos papéis e o mesmo filtro do Kit do retrato.
  app.get("/api/grafica/maquinas/relatorio", requireAuth, async (req, res) => {
    if (!podeVer(req, res)) return;
    const hoje = agoraNoFuso(new Date()).dia;
    const { de, ate } = periodoValido(req.query.de, req.query.ate, hoje);
    try {
      const registros = await registrosDoPeriodo(req, de, ate);
      res.json({ de, ate, hoje, dias: agregarRelatorioDeMaquinas(registros), registros });
    } catch (error: any) {
      console.error("[maquinas] falha ao montar o relatório:", error);
      res.status(500).json({ error: "Não foi possível montar o relatório das máquinas." });
    }
  });

  app.get("/api/grafica/maquinas/relatorio.xlsx", requireAuth, async (req, res) => {
    if (!podeVer(req, res)) return;
    const hoje = agoraNoFuso(new Date()).dia;
    const { de, ate } = periodoValido(req.query.de, req.query.ate, hoje);
    try {
      const registros = await registrosDoPeriodo(req, de, ate);
      await responderRelatorioMaquinasXlsx(res, { de, ate, resumo: agregarRelatorioDeMaquinas(registros), registros });
    } catch (error: any) {
      console.error("[maquinas] falha ao exportar o relatório:", error);
      if (!res.headersSent) res.status(500).json({ error: "Não foi possível gerar o Excel das máquinas." });
    }
  });

  app.get("/api/grafica/maquinas", requireAuth, async (req, res) => {
    if (!podeVer(req, res)) return;

    const hoje = agoraNoFuso(new Date()).dia;
    const pedido = typeof req.query.dia === "string" ? req.query.dia : "";
    // Dia inválido ou no futuro volta para hoje: não há o que mostrar no
    // futuro, e uma URL digitada errado não pode virar erro de tela.
    const dia = DIA_VALIDO.test(pedido) && pedido <= hoje ? pedido : hoje;

    const visivel = filtroDoKit(req);

    try {
      const emImpressao = linhas(await db.execute(sql`
        select i.id, i.display_id, i.type, i.description, i.quantity, i.status,
               coalesce(i.quantity_produced, 0) as produzido,
               coalesce(i.reuse_qty, 0) as reuso,
               i.print_machine, i.kit_remessa_id, i.criado_por_id,
               i.approval_thumb_url,
               to_char(coalesce(i.production_started_at, i.status_changed_at), 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as desde,
               e.id as evento_id, e.name as evento, e.status as evento_status,
               to_char(e.start_date, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as evento_inicio,
               to_char(e.reopened_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as evento_reaberto
        from items i
        left join events e on e.id = i.event_id
        where i.deleted_at is null and i.status in ('inProduction', 'em_producao')
        order by coalesce(i.production_started_at, i.status_changed_at) asc nulls last
      `)).filter(visivel);

      // A FILA (dono, 21/09): peças liberadas que ainda vão para a máquina,
      // com a impressora reservada (ou nenhuma = fila geral), na ordem da fila
      // da Gráfica — saída do caminhão mais próxima primeiro.
      const naFila = linhas(await db.execute(sql`
        select i.id, i.display_id, i.type, i.description, i.quantity, i.status,
               coalesce(i.quantity_produced, 0) as produzido,
               coalesce(i.reuse_qty, 0) as reuso,
               i.calculated_m2, i.maquina_prevista, i.kit_remessa_id, i.criado_por_id,
               i.approval_thumb_url,
               e.id as evento_id, e.name as evento, e.status as evento_status,
               e.deadline_producao_grafica,
               to_char(e.truck_departure_date, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as saida_caminhao,
               to_char(e.start_date, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as evento_inicio,
               to_char(e.reopened_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as evento_reaberto
        from items i
        left join events e on e.id = i.event_id
        where i.deleted_at is null and i.status in ('ready_for_production', 'pronto_para_producao', 'approved', 'liberado')
        order by e.truck_departure_date asc nulls last, i.display_id asc
      `)).filter(visivel);

      const doDia = linhas(await db.execute(sql`
        select r.id, r.item_id, r.maquina, r.tipo, r.quantidade, r.total_depois, r.user_name,
               to_char((r.created_at at time zone 'UTC') at time zone ${FUSO}, 'HH24:MI') as hora,
               i.display_id, i.type, i.quantity, coalesce(i.reuse_qty, 0) as reuso,
               i.kit_remessa_id, i.criado_por_id,
               e.name as evento
        from registros_de_impressao r
        join items i on i.id = r.item_id
        left join events e on e.id = i.event_id
        where ((r.created_at at time zone 'UTC') at time zone ${FUSO})::date = ${dia}::date
        order by r.created_at desc
      `)).filter(visivel);

      const peca = (l: any) => ({
        id: l.id,
        displayId: l.display_id,
        tipo: l.type,
        descricao: l.description,
        evento: l.evento,
        quantidade: Number(l.quantity),
        reuso: Number(l.reuso),
        aImprimir: aImprimir(l.quantity, l.reuso),
        impressas: Number(l.produzido),
        desde: l.desde,
        maquina: l.print_machine ?? null,
        status: l.status,
        miniatura: l.approval_thumb_url ?? null,
        // O bastante para a tela saber se o evento já acabou (o servidor
        // barra o gesto de qualquer jeito; aqui é para o botão explicar antes).
        eventoInfo: l.evento_id
          ? { id: l.evento_id, name: l.evento, status: l.evento_status, startDate: l.evento_inicio, reopenedAt: l.evento_reaberto }
          : null,
      });

      // `ordem` é a posição na lista do dia inteiro (mais recente = 0): a tela
      // funde as máquinas num diário só e precisa de uma ordem estável entre
      // lançamentos do mesmo minuto — a hora "HH:MM" sozinha não desempata.
      const ordemPorId = new Map<string, number>(doDia.map((l, i) => [l.id, i]));

      const maquinas = MAQUINAS_DE_IMPRESSAO.map((codigo) => {
        const registros = doDia
          .filter((l) => l.maquina === codigo)
          .map((l) => ({
            id: l.id,
            itemId: l.item_id,
            displayId: l.display_id,
            tipoPeca: l.type,
            evento: l.evento,
            tipo: l.tipo,
            quantidade: Number(l.quantidade),
            totalDepois: l.total_depois == null ? null : Number(l.total_depois),
            aImprimir: aImprimir(l.quantity, l.reuso),
            hora: l.hora,
            quem: l.user_name,
            ordem: ordemPorId.get(l.id) ?? 0,
          }));
        // O que SAIU da máquina no dia: só lançamentos de quantidade (início e
        // troca não imprimem nada). Correção entra com sinal, então o número é
        // o saldo real do dia, não a soma de tudo que alguém digitou.
        const unidadesNoDia = registros.reduce(
          (soma, r) => soma + (r.tipo === "parcial" || r.tipo === "conclusao" ? r.quantidade : 0),
          0,
        );
        const pecasNoDia = new Set(registros.filter((r) => r.quantidade > 0).map((r) => r.itemId)).size;
        return {
          codigo,
          rotulo: rotuloDaMaquina(codigo),
          imprimindo: emImpressao.filter((l) => l.print_machine === codigo).map(peca),
          registros,
          unidadesNoDia,
          pecasNoDia,
        };
      });

      const semMaquina = emImpressao
        .filter((l) => !l.print_machine || !MAQUINAS_DE_IMPRESSAO.includes(l.print_machine))
        .map(peca);

      const pecaDaFila = (l: any) => ({
        ...peca(l),
        maquinaPrevista: MAQUINAS_DE_IMPRESSAO.includes(l.maquina_prevista) ? l.maquina_prevista : null,
        m2: l.calculated_m2 == null ? null : Number(l.calculated_m2),
        saidaCaminhao: l.saida_caminhao ?? null,
        prazoProducaoGrafica: l.deadline_producao_grafica == null ? -1 : Number(l.deadline_producao_grafica),
      });
      const fila = naFila.map(pecaDaFila);
      const maquinasComFila = maquinas.map((m) => ({ ...m, naFila: fila.filter((p) => p.maquinaPrevista === m.codigo) }));
      const filaGeral = fila.filter((p) => !p.maquinaPrevista);

      res.json({ dia, hoje, maquinas: maquinasComFila, semMaquina, filaGeral });
    } catch (error: any) {
      console.error("[maquinas] falha ao montar o controle de máquinas:", error);
      res.status(500).json({ error: "Não foi possível carregar o controle de máquinas." });
    }
  });
}
