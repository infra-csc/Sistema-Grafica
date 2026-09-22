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
import { requireAuth, requireRole, broadcast, createAuditLog, createAuditLogsEmLote, translateStatus, resolveActor } from "./shared";
import { motivoEventoDaPeca } from "./eventoFinalizado";
import { storage } from "../storage";
import { MAQUINAS_DE_IMPRESSAO, ehMaquinaValida, rotuloDaMaquina } from "@shared/fluxo-peca";
import { lerPartes, partesAtivas } from "@shared/impressao-dividida";
import { chaveDoLockDaImpressora } from "@shared/reserva-de-impressora";
import { reservar, moverReserva, devolverReserva, colunasDaReserva, livreParaReservar, reservaDaPeca, semImpressora, lerPausas, pausarParte, iniciarParte, ocupanteDaImpressora } from "@shared/reserva-de-impressora";
import { normalizarPartes, maquinaPrincipal, aImprimirDaPeca } from "@shared/impressao-dividida";
import { EM_REVISAO } from "@shared/fluxo-peca";
import { pecaTravada, fraseDaTrava, CODIGO_PECA_TRAVADA } from "@shared/trava-da-peca";
import { imprimeNaMaquina } from "@shared/progresso-da-impressao";
import { items as itemsTable, registrosDeImpressao } from "@shared/schema";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { erroImpressoraOcupada } from "../services/ocupacaoDasImpressoras";
import { pecaVisivelPara } from "@shared/kit";
import { agoraNoFuso } from "../services/revisaoDigest";
import { agregarRelatorioDeMaquinas, periodoValido, quemEntrouNoLugar, type RegistroDoPeriodo } from "../services/relatorioDeMaquinas";
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

// A MESMA conta das telas (aImprimirDaPeca): quantidade − reaproveitadas, e
// zero na peça de reuso legado (is_reuse). Era `quantity − reuse_qty` à mão, e
// o cartão podia dizer um teto diferente do da fila da Gráfica.
const aImprimir = (quantidade: unknown, reuso: unknown, isReuse?: unknown) =>
  aImprimirDaPeca({ quantity: Number(quantidade), reuseQty: Number(reuso), isReuse: isReuse === true });

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
           i.display_id, i.type, i.description, i.quantity, coalesce(i.reuse_qty, 0) as reuso, i.is_reuse,
           i.kit_remessa_id, i.criado_por_id,
           e.name as evento
    from registros_de_impressao r
    join items i on i.id = r.item_id
    left join events e on e.id = i.event_id
    where ((r.created_at at time zone 'UTC') at time zone ${FUSO})::date between ${de}::date and ${ate}::date
    order by r.created_at asc
  `)).filter(filtroDoKit(req));
  const deuLugarA = quemEntrouNoLugar(brutos.map((l) => ({ id: l.id, itemId: l.item_id, maquina: l.maquina, tipo: l.tipo, displayId: l.display_id, em: Number(l.em) })));
  return brutos.map((l) => ({
    deuLugarA: deuLugarA.get(l.id) ?? null,
    id: l.id,
    itemId: l.item_id,
    displayId: l.display_id,
    tipoPeca: l.type,
    descricaoPeca: l.description ?? null,
    evento: l.evento,
    maquina: l.maquina,
    tipo: l.tipo,
    quantidade: Number(l.quantidade),
    totalDepois: l.total_depois == null ? null : Number(l.total_depois),
    aImprimir: aImprimir(l.quantity, l.reuso, l.is_reuse),
    dia: l.dia,
    hora: l.hora,
    em: Number(l.em),
    quem: l.user_name,
  }));
}

// ─── RESERVA de impressora (dono, 21/09) ───────────────────────────────────────
// "Deixar na fila alguns itens (geral) ou já setar em alguma impressora."
// Com QUANTIDADE (21/09): { maquina, quantidade?, deMaquina? } — a conta mora em
// shared/reserva-de-impressora.ts e as duas colunas (reserva_por_maquina + o
// atalho maquina_prevista) saem juntas de colunasDaReserva.
// É SÓ um controle da aba Máquinas: grava a reserva e NADA mais —
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

/**
 * Por que esta peça NÃO pode ser reservada agora; null quando pode. Além das
 * liberadas, entra a peça que JÁ está em impressão POR PARTES (iniciou só a
 * parte reservada a uma impressora) — o resto dela continua na fila.
 */
async function motivoDeNaoReservar(item: any): Promise<string | null> {
  if (!item || item.deletedAt) return "Peça não encontrada";
  // Travada pela Solicitação: nem reservar (shared/trava-da-peca.ts).
  if (pecaTravada(item)) return fraseDaTrava(item);
  const emImpressaoPorPartes = (item.status === "inProduction" || item.status === "em_producao")
    && !!lerPartes(item.impressaoPorMaquina) && livreParaReservar(item) > 0;
  if (!PODE_RESERVAR.includes(item.status) && !emImpressaoPorPartes) {
    return `Só peças liberadas para a Gráfica entram na fila das impressoras — esta está em ${translateStatus(item.status)}`;
  }
  const motivo = await motivoEventoDaPeca(item);
  if (motivo) return "O evento desta peça já foi finalizado";
  return null;
}

/** O que o corpo pede: reservar (com ou sem quantidade), mover ou devolver. Puro sobre a peça. */
function aplicarPedidoDeReserva(item: any, corpo: any, maquina: string | null):
  { ok: true; reserva: Record<string, number> | null; frase: string } | { ok: false; erro: string } {
  const quantidade = corpo?.quantidade == null || corpo.quantidade === "" ? null : Number(corpo.quantidade);
  if (quantidade != null && (!Number.isInteger(quantidade) || quantidade <= 0)) {
    return { ok: false, erro: "A quantidade precisa ser um número inteiro maior que zero" };
  }
  const de = ehMaquinaValida(corpo?.deMaquina) ? corpo.deMaquina as string : null;
  if (maquina === null) {
    const r = devolverReserva(item, de, quantidade);
    if (!r.ok) return r;
    return { ok: true, reserva: r.reserva, frase: de ? `Devolvidas ${r.quantidade} un. da ${rotuloDaMaquina(de)} à fila geral` : "Devolvida à fila geral" };
  }
  if (de) {
    const r = moverReserva(item, de, maquina, quantidade);
    if (!r.ok) return r;
    return { ok: true, reserva: r.reserva, frase: `Reserva movida: ${r.quantidade} un. da ${rotuloDaMaquina(de)} para a ${rotuloDaMaquina(maquina)}` };
  }
  const r = reservar(item, maquina, quantidade);
  if (!r.ok) return r;
  return {
    ok: true, reserva: r.reserva,
    frase: r.semImpressora > 0
      ? `Reservadas ${r.quantidade} un. para a ${rotuloDaMaquina(maquina)} (${r.semImpressora} na fila geral)`
      : `Reservada para a ${rotuloDaMaquina(maquina)}${quantidade != null ? ` (${r.quantidade} un.)` : ""}`,
  };
}

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
      const r = aplicarPedidoDeReserva(atual, req.body, pedido.maquina);
      if (!r.ok) return res.status(409).json({ error: r.erro });
      // SÓ a reserva (e o updatedAt que o storage carimba). Nada de status.
      const item = await storage.updateItem(atual!.id, colunasDaReserva(r.reserva, atual!.reservaPorMaquina) as any);
      if (!item) return res.status(404).json({ error: "Peça não encontrada" });
      await createAuditLog(req, "production", "item", item.id, r.frase);
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
        // O lote é sempre "TUDO": tudo o que está livre vai para a impressora
        // (ou a reserva inteira volta à fila geral). Quantidade é gesto unitário.
        const livre = livreParaReservar(atual!);
        const reserva = pedido.maquina && livre > 0 ? { [pedido.maquina]: livre } : null;
        if (pedido.maquina && livre <= 0) { erros.push({ itemId: id, displayId: atual?.displayId ?? null, erro: "Não há unidades fora de impressora para reservar" }); continue; }
        const item = await storage.updateItem(id, colunasDaReserva(reserva, atual!.reservaPorMaquina) as any);
        if (item) feitas.push(item);
      }
      const fraseDoLote = pedido.maquina ? `Reservada para a ${rotuloDaMaquina(pedido.maquina)}` : "Devolvida à fila geral";
      await createAuditLogsEmLote(req, feitas.map((i) => ({ action: "production", entityType: "item", entityId: i.id, details: fraseDoLote })));
      for (const item of feitas) broadcast({ type: "item_updated", item });
      res.json({ atualizadas: feitas.length, itens: feitas, erros });
    } catch (error: any) {
      console.error("[maquinas] falha ao reservar impressora em lote:", error);
      res.status(500).json({ error: "Não foi possível reservar as impressoras." });
    }
  });

  // ── TIRAR da impressora / TROCAR por prioridade (dono, 21/09) ─────────────
  // "Caso a impressora esteja imprimindo algo, não dá para colocar outra. O
  // que podemos implementar é TIRAR um item e COLOCAR o outro, pois às vezes
  // tem ordem de prioridade." A conta é de pausarParte/iniciarParte (shared):
  // o que a peça tirada já imprimiu fica anotado, o que faltava vira reserva
  // no TOPO da fila daquela impressora, e a outra entra. Tudo numa transação.
  const tirarEColocar = async (req: any, res: any, comTroca: boolean) => {
    if (req.userRole !== "grafica" && req.userRole !== "admin") {
      return res.status(403).json({ error: "Só a Gráfica e o admin mexem no que está na impressora" });
    }
    const maquina = req.params.maquina;
    if (!ehMaquinaValida(maquina)) return res.status(400).json({ error: "Impressora inválida — escolha 1 a 4" });
    const tirarId = comTroca ? req.body?.tirarItemId : req.body?.itemId;
    const colocarId = comTroca ? req.body?.colocarItemId : null;
    if (typeof tirarId !== "string" || (comTroca && typeof colocarId !== "string")) {
      return res.status(400).json({ error: comTroca ? "Diga qual peça sai e qual entra" : "Diga qual peça sai da impressora" });
    }
    if (comTroca && tirarId === colocarId) return res.status(400).json({ error: "A peça que entra é a mesma que sai" });
    const quantidade = req.body?.quantidade == null || req.body.quantidade === "" ? null : Number(req.body.quantidade);
    if (quantidade != null && (!Number.isInteger(quantidade) || quantidade <= 0)) {
      return res.status(400).json({ error: "A quantidade precisa ser um número inteiro maior que zero" });
    }
    try {
      const resultado = await db.transaction(async (tx) => {
        const falha = (status: number, erro: string) => Object.assign(new Error(erro), { httpStatus: status });
        // LOCK CONSULTIVO da impressora, PRIMEIRA instrução da transação: o
        // mesmo que o start-printing pega — ocupação mora em jsonb, não há
        // índice único que segure dois gestos simultâneos na mesma impressora.
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${chaveDoLockDaImpressora(maquina)}))`);
        const [sai] = await tx.select().from(itemsTable).where(eq(itemsTable.id, tirarId));
        if (!sai || sai.deletedAt) throw falha(404, "Peça não encontrada");
        // SEM guarda de evento finalizado para quem SAI: tirar da impressora
        // não faz trabalho andar, só recua — e a peça de evento já realizado
        // travaria a impressora para sempre (ela conta como ocupante). A
        // guarda continua valendo para quem ENTRA.
        const pausa = pausarParte(sai as any, maquina, new Date().toISOString());
        if (!pausa.ok) throw falha(409, pausa.erro);
        const aImprimirSai = aImprimirDaPeca(sai as any);
        const [saiu] = await tx.update(itemsTable).set({
          // As impressas ficam em quantityProduced (não muda); sem outra parte
          // ativa a peça volta a LIBERADA, no topo da fila desta impressora.
          status: pausa.voltaParaAFila ? "ready_for_production" : sai.status,
          // De propósito: voltar a "liberada" é mudança REAL de etapa — o
          // "há Xd neste status" recomeça a contar da pausa.
          ...(pausa.voltaParaAFila ? { statusChangedAt: new Date() } : {}),
          impressaoPorMaquina: pausa.partes ? normalizarPartes(pausa.partes, aImprimirSai) : null,
          // Liberada não está em impressora nenhuma: sem isto ela voltaria a
          // "ocupar" a antiga assim que alguém a pusesse em impressão por outro caminho.
          ...(pausa.voltaParaAFila ? { printMachine: null } : pausa.principal ? { printMachine: pausa.principal } : {}),
          ...colunasDaReserva(pausa.reserva, sai.reservaPorMaquina, pausa.pausas),
          updatedAt: new Date(),
        } as any).where(eq(itemsTable.id, sai.id)).returning();

        let entrou: any = null;
        let entra: any = null;
        let parte: { quantidade: number } | null = null;
        if (comTroca) {
          [entra] = await tx.select().from(itemsTable).where(eq(itemsTable.id, colocarId));
          if (!entra || entra.deletedAt) throw falha(404, "A peça que entra não foi encontrada");
          if (EM_REVISAO.has(entra.status)) throw falha(409, "A peça que entra está em revisão — a Gráfica só age depois que a revisão liberar.");
          const PODE = ["ready_for_production", "pronto_para_producao", "approved", "liberado", "inProduction", "em_producao"];
          if (!PODE.includes(entra.status)) throw falha(409, `A peça que entra não pode ir para a máquina no status atual: ${translateStatus(entra.status)}`);
          if (await motivoEventoDaPeca(entra)) throw falha(409, "O evento da peça que entra já foi finalizado");
          // A que ENTRA não pode estar travada; a que SAI pode (recuar nunca é barrado).
          if (pecaTravada(entra as any)) throw Object.assign(falha(409, fraseDaTrava(entra as any)), { code: CODIGO_PECA_TRAVADA });
          // Depois da pausa a impressora tem de estar LIVRE (outra peça com parte nela barra a troca).
          const emImpressao = await tx.select().from(itemsTable).where(and(inArray(itemsTable.status, ["inProduction", "em_producao"]), isNull(itemsTable.deletedAt)));
          const ocupante = ocupanteDaImpressora(emImpressao as any[], maquina, entra.id);
          if (ocupante) throw falha(409, erroImpressoraOcupada(maquina, ocupante));
          const temReserva = (reservaDaPeca(entra)[maquina] ?? 0) > 0;
          const inicio = iniciarParte(entra, maquina, { daReserva: temReserva, quantidade });
          if (!inicio.ok) throw falha(409, inicio.erro);
          parte = inicio;
          [entrou] = await tx.update(itemsTable).set({
            status: "inProduction",
            ...(entra.status !== "inProduction" && entra.status !== "em_producao" ? { statusChangedAt: new Date() } : {}),
            printMachine: maquinaPrincipal(inicio.partes, maquina) ?? maquina,
            impressaoPorMaquina: normalizarPartes(inicio.partes, aImprimirDaPeca(entra)),
            ...colunasDaReserva(inicio.reserva, entra.reservaPorMaquina),
            ...(!entra.productionStartedAt ? { productionStartedAt: new Date() } : {}),
            updatedAt: new Date(),
          } as any).where(eq(itemsTable.id, entra.id)).returning();
        }
        return { sai, saiu, pausa, entra, entrou, parte };
      });

      const { sai, saiu, pausa, entra, entrou, parte } = resultado;
      const aImprimirSai = aImprimirDaPeca(sai as any);
      const jaImpressas = sai.quantityProduced ?? 0;
      await createAuditLog(req, "production", "item", sai.id, entra
        ? `Tirada da ${rotuloDaMaquina(maquina)} para dar lugar à ${entra.displayId ?? "outra peça"} (${jaImpressas} de ${aImprimirSai} impressas)`
        : `Tirada da ${rotuloDaMaquina(maquina)} (${jaImpressas} de ${aImprimirSai} impressas) — ${pausa.restante} un. voltam para o topo da fila dela`);
      if (entrou) await createAuditLog(req, "production", "item", entrou.id, `Impressão iniciada na ${rotuloDaMaquina(maquina)}: ${parte!.quantidade} un. — no lugar da ${sai.displayId ?? "peça anterior"}`);
      // O diário: "pausa" (quantidade 0 — não é unidade impressa) e o "inicio" da que entrou.
      try {
        const ator = resolveActor(req);
        await db.insert(registrosDeImpressao).values([
          { itemId: sai.id, maquina, tipo: "pausa", quantidade: 0, totalDepois: jaImpressas, userName: ator.userName, userId: ator.userId ?? null },
          ...(entrou ? [{ itemId: entrou.id, maquina, tipo: "inicio", quantidade: 0, totalDepois: entra.quantityProduced ?? 0, userName: ator.userName, userId: ator.userId ?? null }] : []),
        ] as any);
      } catch (error) {
        console.error("[maquinas] falha ao gravar o registro de impressão", error);
      }
      broadcast({ type: "item_updated", item: saiu });
      if (entrou) { broadcast({ type: "item_updated", item: entrou }); broadcast({ type: "production_started", item: entrou }); }
      res.json({ saiu, entrou });
    } catch (error: any) {
      if (error?.httpStatus) return res.status(error.httpStatus).json({ error: error.message, ...(error.code ? { code: error.code } : {}) });
      console.error("[maquinas] falha ao tirar/trocar a peça da impressora:", error);
      res.status(500).json({ error: "Não foi possível mexer na impressora." });
    }
  };

  app.post("/api/grafica/maquinas/:maquina/trocar", requireAuth, async (req, res) => {
    if (req.userRole !== "grafica" && req.userRole !== "admin") return res.status(403).json({ error: "Só a Gráfica e o admin trocam a peça da impressora" });
    return tirarEColocar(req, res, true);
  });

  app.post("/api/grafica/maquinas/:maquina/pausar", requireAuth, async (req, res) => {
    if (req.userRole !== "grafica" && req.userRole !== "admin") return res.status(403).json({ error: "Só a Gráfica e o admin tiram a peça da impressora" });
    return tirarEColocar(req, res, false);
  });

  // ── O relatório: resumo por dia × impressora + os registros do período ────
  // (dono, 21/09: "não tem relatório diário, não tem relatório para exportar").
  // Leitura só; os mesmos papéis e o mesmo filtro do Kit do retrato.
  app.get("/api/grafica/maquinas/relatorio", requireAuth, requireRole(...PAPEIS_QUE_VEEM), async (req, res) => {
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

  app.get("/api/grafica/maquinas/relatorio.xlsx", requireAuth, requireRole(...PAPEIS_QUE_VEEM), async (req, res) => {
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

  app.get("/api/grafica/maquinas", requireAuth, requireRole(...PAPEIS_QUE_VEEM), async (req, res) => {
    if (!podeVer(req, res)) return;

    const hoje = agoraNoFuso(new Date()).dia;
    const pedido = typeof req.query.dia === "string" ? req.query.dia : "";
    // Dia inválido ou no futuro volta para hoje: não há o que mostrar no
    // futuro, e uma URL digitada errado não pode virar erro de tela.
    const dia = DIA_VALIDO.test(pedido) && pedido <= hoje ? pedido : hoje;

    const visivel = filtroDoKit(req);

    try {
      const emImpressao = linhas(await db.execute(sql`
        select i.id, i.display_id, i.type, i.description, i.material, i.measurement, i.quantity, i.status,
               coalesce(i.quantity_produced, 0) as produzido,
               coalesce(i.reuse_qty, 0) as reuso, i.is_reuse,
               i.print_machine, i.impressao_por_maquina, i.kit_remessa_id, i.criado_por_id,
               i.approval_thumb_url,
               i.travada_em, i.travada_por, i.travada_motivo,
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
        select i.id, i.display_id, i.type, i.description, i.material, i.measurement, i.quantity, i.status,
               coalesce(i.quantity_produced, 0) as produzido,
               coalesce(i.reuse_qty, 0) as reuso, i.is_reuse,
               i.calculated_m2, i.maquina_prevista, i.reserva_por_maquina, i.print_machine, i.impressao_por_maquina,
               i.kit_remessa_id, i.criado_por_id,
               i.approval_thumb_url,
               i.travada_em, i.travada_por, i.travada_motivo,
               to_char(coalesce(i.production_started_at, i.status_changed_at), 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as desde,
               e.id as evento_id, e.name as evento, e.status as evento_status,
               e.deadline_producao_grafica,
               to_char(e.truck_departure_date, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as saida_caminhao,
               to_char(e.start_date, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as evento_inicio,
               to_char(e.reopened_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as evento_reaberto
        from items i
        left join events e on e.id = i.event_id
        where i.deleted_at is null and (
          i.status in ('ready_for_production', 'pronto_para_producao', 'approved', 'liberado')
          -- A peça que iniciou SÓ UMA PARTE segue na fila com o resto dela.
          or (i.status in ('inProduction', 'em_producao') and i.impressao_por_maquina is not null)
        )
        order by e.truck_departure_date asc nulls last, i.display_id asc
      `)).filter(visivel);

      // Patrocinadores de todas as peças da tela (em impressão + fila) numa
      // consulta só — nada de uma busca por peça.
      const patrocinadoresPorItem = new Map<string, string[]>();
      for (const l of linhas(await db.execute(sql`
        select isp.item_id, s.name
        from item_sponsors isp
        join sponsors s on s.id = isp.sponsor_id
        join items i on i.id = isp.item_id
        where i.deleted_at is null
          and i.status in ('ready_for_production', 'pronto_para_producao', 'approved', 'liberado', 'inProduction', 'em_producao')
        order by s.name asc
      `))) {
        const lista = patrocinadoresPorItem.get(l.item_id);
        if (lista) lista.push(l.name); else patrocinadoresPorItem.set(l.item_id, [l.name]);
      }

      const doDia = linhas(await db.execute(sql`
        select r.id, r.item_id, r.maquina, r.tipo, r.quantidade, r.total_depois, r.user_name,
               to_char((r.created_at at time zone 'UTC') at time zone ${FUSO}, 'HH24:MI') as hora,
               (extract(epoch from r.created_at) * 1000)::bigint as em,
               i.display_id, i.type, i.description, i.quantity, coalesce(i.reuse_qty, 0) as reuso, i.is_reuse,
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
        // O que o operador usa para achar o arquivo (dono, 21/09).
        material: l.material ?? null,
        medida: l.measurement ?? null,
        patrocinadores: patrocinadoresPorItem.get(l.id) ?? [],
        evento: l.evento,
        quantidade: Number(l.quantity),
        reuso: Number(l.reuso),
        aImprimir: aImprimir(l.quantity, l.reuso, l.is_reuse),
        impressas: Number(l.produzido),
        desde: l.desde,
        maquina: l.print_machine ?? null,
        status: l.status,
        miniatura: l.approval_thumb_url ?? null,
        // A trava da Solicitação (shared/trava-da-peca.ts): o mesmo selo da Gráfica.
        travadaEm: l.travada_em ?? null,
        travadaPor: l.travada_por ?? null,
        travadaMotivo: l.travada_motivo ?? null,
        // Peça DIVIDIDA entre impressoras (jsonb); null = tudo na `maquina`.
        impressaoPorMaquina: lerPartes(l.impressao_por_maquina),
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
      // A pausa diz a QUEM deu lugar: o "inicio" de outra peça na mesma
      // impressora logo depois dela (a troca grava os dois juntos).
      const deuLugarA = quemEntrouNoLugar(doDia.map((l) => ({ id: l.id, itemId: l.item_id, maquina: l.maquina, tipo: l.tipo, displayId: l.display_id, em: Number(l.em) })));

      const maquinas = MAQUINAS_DE_IMPRESSAO.map((codigo) => {
        const registros = doDia
          .filter((l) => l.maquina === codigo)
          .map((l) => ({
            id: l.id,
            itemId: l.item_id,
            displayId: l.display_id,
            tipoPeca: l.type,
            descricaoPeca: l.description ?? null,
            evento: l.evento,
            tipo: l.tipo,
            quantidade: Number(l.quantidade),
            totalDepois: l.total_depois == null ? null : Number(l.total_depois),
            aImprimir: aImprimir(l.quantity, l.reuso, l.is_reuse),
            hora: l.hora,
            quem: l.user_name,
            ordem: ordemPorId.get(l.id) ?? 0,
            deuLugarA: deuLugarA.get(l.id) ?? null,
          }));
        // O que SAIU da máquina no dia: só lançamentos de quantidade (início e
        // troca não imprimem nada). Correção entra com sinal, então o número é
        // o saldo real do dia, não a soma de tudo que alguém digitou.
        const unidadesNoDia = registros.reduce(
          (soma, r) => soma + (r.tipo === "parcial" || r.tipo === "conclusao" ? r.quantidade : 0),
          0,
        );
        // Peças que IMPRIMIRAM nesta máquina: a "troca" carrega a quantidade
        // movida, mas não é peça impressa aqui.
        const pecasNoDia = new Set(registros.filter((r) => (r.tipo === "parcial" || r.tipo === "conclusao") && r.quantidade > 0).map((r) => r.itemId)).size;
        return {
          codigo,
          rotulo: rotuloDaMaquina(codigo),
          // A peça dividida aparece no cartão de CADA impressora que tem
          // parte dela, com os números daquela parte (`parte`).
          imprimindo: emImpressao
            // Parte já esgotada (restante 0) não é "imprimindo": fica só como
            // histórico no jsonb — o cartão não ganha uma peça morta.
            // A régua é imprimeNaMaquina (shared/progresso-da-impressao.ts) — a
            // mesma do filtro "Impressora" da Gráfica.
            .filter((l) => imprimeNaMaquina({ status: l.status, printMachine: l.print_machine, impressaoPorMaquina: l.impressao_por_maquina }, codigo))
            .map((l) => {
              const p = peca(l);
              const parte = p.impressaoPorMaquina?.[codigo] ?? null;
              return { ...p, maquina: codigo, parte };
            }),
          registros,
          unidadesNoDia,
          pecasNoDia,
        };
      });

      const semMaquina = emImpressao
        .filter((l) => !l.print_machine || !MAQUINAS_DE_IMPRESSAO.includes(l.print_machine))
        .map(peca);

      // A conta da fila (shared/reserva-de-impressora.ts): em impressão +
      // reservado + sem impressora = a imprimir. `reserva` é por impressora;
      // `semImpressora` é o que ainda aparece na fila geral.
      const comoPeca = (l: any) => ({
        status: l.status, quantity: l.quantity, reuseQty: l.reuso, quantityProduced: l.produzido,
        isReuse: l.is_reuse === true, printMachine: l.print_machine, impressaoPorMaquina: l.impressao_por_maquina,
        maquinaPrevista: l.maquina_prevista, reservaPorMaquina: l.reserva_por_maquina,
      });
      const pecaDaFila = (l: any) => ({
        ...peca(l),
        maquinaPrevista: MAQUINAS_DE_IMPRESSAO.includes(l.maquina_prevista) ? l.maquina_prevista : null,
        reserva: reservaDaPeca(comoPeca(l)),
        pausas: lerPausas(l.reserva_por_maquina),
        semImpressora: semImpressora(comoPeca(l)),
        // Em quais impressoras a peça JÁ está imprimindo (parte iniciada).
        imprimindoEm: (l.status === "inProduction" || l.status === "em_producao") ? Object.keys(partesAtivas(lerPartes(l.impressao_por_maquina) ?? {})) : [],
        m2: l.calculated_m2 == null ? null : Number(l.calculated_m2),
        saidaCaminhao: l.saida_caminhao ?? null,
        prazoProducaoGrafica: l.deadline_producao_grafica == null ? -1 : Number(l.deadline_producao_grafica),
      });
      const fila = naFila.map(pecaDaFila);
      // No cartão: as peças com unidades reservadas PARA esta impressora, com
      // quantas são (`reservadas`). Na fila geral: enquanto sobrar unidade sem impressora.
      const maquinasComFila = maquinas.map((m) => ({
        ...m,
        // PAUSADAS PRIMEIRO: a peça tirada da impressora para dar lugar a outra
        // volta para o TOPO da fila dela (a mais recente em cima); depois, a
        // ordem de sempre (saída do caminhão).
        naFila: fila.filter((p) => (p.reserva[m.codigo] ?? 0) > 0)
          .map((p) => ({ ...p, maquinaPrevista: m.codigo, reservadas: p.reserva[m.codigo], pausadaEm: p.pausas[m.codigo] ?? null }))
          .sort((a, b) => (a.pausadaEm && b.pausadaEm ? (a.pausadaEm < b.pausadaEm ? 1 : -1) : a.pausadaEm ? -1 : b.pausadaEm ? 1 : 0)),
      }));
      const filaGeral = fila.filter((p) => p.semImpressora > 0);

      res.json({ dia, hoje, maquinas: maquinasComFila, semMaquina, filaGeral });
    } catch (error: any) {
      console.error("[maquinas] falha ao montar o controle de máquinas:", error);
      res.status(500).json({ error: "Não foi possível carregar o controle de máquinas." });
    }
  });
}
