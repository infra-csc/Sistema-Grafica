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
import { requireAuth } from "./shared";
import { MAQUINAS_DE_IMPRESSAO, rotuloDaMaquina } from "@shared/fluxo-peca";
import { pecaVisivelPara } from "@shared/kit";
import { agoraNoFuso } from "../services/revisaoDigest";

/** Os mesmos papéis que veem a fila da Gráfica (ROLES_GRAFICA no App). */
const PAPEIS_QUE_VEEM = ["grafica", "solicitacao", "admin"];
const DIA_VALIDO = /^\d{4}-\d{2}-\d{2}$/;
const FUSO = "America/Sao_Paulo";

const linhas = (r: any): any[] => (r?.rows ?? r ?? []) as any[];

export function registerMaquinasRoutes(app: Express): void {
  app.get("/api/grafica/maquinas", requireAuth, async (req, res) => {
    if (!PAPEIS_QUE_VEEM.includes(req.userRole ?? "")) {
      return res.status(403).json({ error: "O controle de máquinas é da Gráfica, da Solicitação e do admin" });
    }

    const hoje = agoraNoFuso(new Date()).dia;
    const pedido = typeof req.query.dia === "string" ? req.query.dia : "";
    // Dia inválido ou no futuro volta para hoje: não há o que mostrar no
    // futuro, e uma URL digitada errado não pode virar erro de tela.
    const dia = DIA_VALIDO.test(pedido) && pedido <= hoje ? pedido : hoje;

    // O MESMO recorte do Kit que as leituras de peças aplicam (ver
    // pecaVisivelPara): o usuário do Kit só enxerga as peças que ele mesmo
    // criou em remessa. Sem isto, a aba Máquinas vazaria o que a fila esconde.
    const quemVe = { kit: req.userKit === true, userId: req.userId ?? null };
    const visivel = (l: any) => pecaVisivelPara(quemVe, { kitRemessaId: l.kit_remessa_id, criadoPorId: l.criado_por_id });

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

      const aImprimir = (quantidade: unknown, reuso: unknown) =>
        Math.max(0, Number(quantidade) - Number(reuso));

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

      res.json({ dia, hoje, maquinas, semMaquina });
    } catch (error: any) {
      console.error("[maquinas] falha ao montar o controle de máquinas:", error);
      res.status(500).json({ error: "Não foi possível carregar o controle de máquinas." });
    }
  });
}
