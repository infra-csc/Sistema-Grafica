// ─────────────────────────────────────────────────────────────────────────────
// SOLICITAÇÃO AO ESTOQUE ("consulta de estoque" por dentro) — o banco (dono,
// 21/09). Regras em shared/consultas-de-estoque.ts; rotas em
// routes/consultas-de-estoque.ts; a costura com a liberação da Revisão Final em
// services/consultaDeEstoqueNaLiberacao.ts.
//
// Separado da rota para que ela decida papéis, Kit e status sem depender de
// banco.
//
// "O sistema sugere" e a reserva NÃO são código novo: é a busca por semelhança
// e a reserva de 14/09 (routes/estoque-reservas.ts), chamadas daqui.
// ─────────────────────────────────────────────────────────────────────────────
import { and, desc, eq, inArray, isNull, ne, notInArray, or, sql, type SQL } from "drizzle-orm";
import { db } from "../db";
import { doEventoNaoArquivado } from "./arquivamento";
import { consultasDeEstoque, items as itemsTable, events, itemSponsors, sponsors, auditLogs } from "@shared/schema";
import { efeitoDoAtendimento, pecaJaLiberada, trilhaDoAtendimento, type StatusDaConsulta } from "@shared/consultas-de-estoque";
import { colunasDaReserva, reescalarReservaEPartes } from "@shared/reserva-de-impressora";
import { lerPartes } from "@shared/impressao-dividida";
import { compararLotes, normalizarTipo, temMedida, type RelacaoDePatrocinio } from "@shared/estoque";
import {
  avaliar,
  carregarAtivos,
  carregarPecas,
  carregarReservasAtivas,
  reservarAtivosParaPeca,
  type Ativo,
} from "../routes/estoque-reservas";

const erro = (httpStatus: number, message: string) => Object.assign(new Error(message), { httpStatus });

const PECA_CANCELADA = ["canceled", "cancelled", "cancelado"];

export type Quem = { userName: string; userId: string | null };

/** O que a rota precisa saber da peça para decidir (papel, Kit, status). */
export async function pecaDaConsulta(itemId: string) {
  const [peca] = await db.select({
    id: itemsTable.id,
    displayId: itemsTable.displayId,
    type: itemsTable.type,
    quantity: itemsTable.quantity,
    reuseQty: itemsTable.reuseQty,
    status: itemsTable.status,
    deletedAt: itemsTable.deletedAt,
    eventId: itemsTable.eventId,
    kitRemessaId: itemsTable.kitRemessaId,
    criadoPorId: itemsTable.criadoPorId,
    eventName: events.name,
  })
    .from(itemsTable)
    .leftJoin(events, eq(events.id, itemsTable.eventId))
    .where(eq(itemsTable.id, itemId));
  return peca ?? null;
}

export async function consultaPorId(id: string) {
  const [c] = await db.select().from(consultasDeEstoque).where(eq(consultasDeEstoque.id, id));
  return c ?? null;
}

/** A consulta que vale para a peça: a mais recente que não foi cancelada. */
export async function consultaAtualDaPeca(itemId: string) {
  const [c] = await db.select().from(consultasDeEstoque)
    .where(and(eq(consultasDeEstoque.itemId, itemId), ne(consultasDeEstoque.status, "cancelada")))
    .orderBy(desc(consultasDeEstoque.pedidoEm))
    .limit(1);
  return c ?? null;
}

/** Abre a consulta. O índice único parcial garante UMA aberta por peça. */
export async function criarConsulta(e: { itemId: string; eventId: string; quantidadePedida: number; observacao: string | null; quem: Quem }) {
  try {
    const [criada] = await db.insert(consultasDeEstoque).values({
      itemId: e.itemId,
      eventId: e.eventId,
      quantidadePedida: e.quantidadePedida,
      observacao: e.observacao,
      pedidoPor: e.quem.userName,
      pedidoPorId: e.quem.userId,
    }).returning();
    return criada;
  } catch (erroDoBanco: unknown) {
    const error = erroDoBanco as { code?: unknown } | null | undefined;
    // 23505 = unique_violation: duas pessoas pediram no mesmo segundo.
    if (error?.code === "23505") throw erro(409, "Já existe uma solicitação ao estoque aberta para esta peça.");
    throw error;
  }
}

export async function contarAbertas(): Promise<number> {
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` })
    .from(consultasDeEstoque)
    .innerJoin(itemsTable, eq(itemsTable.id, consultasDeEstoque.itemId))
    .where(and(eq(consultasDeEstoque.status, "aberta"), isNull(itemsTable.deletedAt), notInArray(itemsTable.status, PECA_CANCELADA)));
  return Number(total) || 0;
}

/** Lista enxuta, com a peça. `pedidoPorId` recorta para quem pediu. */
export async function listarConsultas(filtro: { status?: string[]; pedidoPorId?: string; limite: number }) {
  // Consulta ABERTA de peça cancelada não pede resposta de ninguém: some da
  // caixa (e do número do menu) e volta sozinha se a peça for descancelada.
  const condicoes: (SQL | undefined)[] = [
    isNull(itemsTable.deletedAt),
    // Peça de evento arquivado some da caixa (e do número do menu) também.
    doEventoNaoArquivado(itemsTable.eventId),
    or(ne(consultasDeEstoque.status, "aberta"), notInArray(itemsTable.status, PECA_CANCELADA)),
  ];
  if (filtro.status?.length) condicoes.push(inArray(consultasDeEstoque.status, filtro.status));
  if (filtro.pedidoPorId !== undefined) condicoes.push(eq(consultasDeEstoque.pedidoPorId, filtro.pedidoPorId));
  const linhas = await db.select({
    consulta: consultasDeEstoque,
    pecaDisplayId: itemsTable.displayId,
    pecaTipo: itemsTable.type,
    pecaDescricao: itemsTable.description,
    pecaLargura: itemsTable.visualWidth,
    pecaAltura: itemsTable.visualHeight,
    pecaMaterial: itemsTable.material,
    pecaQuantidade: itemsTable.quantity,
    pecaStatus: itemsTable.status,
    pecaReuseQty: itemsTable.reuseQty,
    pecaProduzidas: itemsTable.quantityProduced,
    pecaThumb: itemsTable.approvalThumbUrl,
    eventName: events.name,
    eventSaida: events.truckDepartureDate,
  })
    .from(consultasDeEstoque)
    .innerJoin(itemsTable, eq(itemsTable.id, consultasDeEstoque.itemId))
    .leftJoin(events, eq(events.id, consultasDeEstoque.eventId))
    .where(and(...condicoes))
    .orderBy(desc(consultasDeEstoque.pedidoEm))
    .limit(filtro.limite);
  if (linhas.length === 0) return [];

  const vinculos = await db.select({ itemId: itemSponsors.itemId, name: sponsors.name })
    .from(itemSponsors)
    .innerJoin(sponsors, eq(sponsors.id, itemSponsors.sponsorId))
    .where(inArray(itemSponsors.itemId, Array.from(new Set(linhas.map((l) => l.consulta.itemId)))));
  const nomesPorPeca = new Map<string, string[]>();
  for (const v of vinculos) {
    const lista = nomesPorPeca.get(v.itemId);
    if (lista) lista.push(v.name); else nomesPorPeca.set(v.itemId, [v.name]);
  }

  return linhas.map((l) => ({
    ...l.consulta,
    peca: {
      id: l.consulta.itemId,
      displayId: l.pecaDisplayId,
      tipo: l.pecaTipo,
      descricao: l.pecaDescricao,
      largura: l.pecaLargura,
      altura: l.pecaAltura,
      material: l.pecaMaterial,
      quantidade: l.pecaQuantidade,
      status: l.pecaStatus,
      reuseQty: l.pecaReuseQty,
      produzidas: l.pecaProduzidas,
      thumb: l.pecaThumb,
      patrocinadores: (nomesPorPeca.get(l.consulta.itemId) ?? []).sort((a, b) => a.localeCompare(b, "pt-BR")),
    },
    evento: { id: l.consulta.eventId, nome: l.eventName, saidaDoCaminhao: l.eventSaida },
  }));
}

export type SugestaoDoAcervo = {
  chave: string;
  relacao: RelacaoDePatrocinio;
  condicao: string;
  thumb: string | null;
  /** Onde a peça já foi usada — o evento para o qual ela foi impressa. */
  origem: { displayId: string | null; tipo: string; descricao: string | null; largura: string | null; altura: string | null; eventName: string | null; eventInicio: Date | null };
  ativos: Array<{ id: string; displayId: string; quantidade: number }>;
  quantidade: number;
};

// RegExp montada por string: o alvo do tsc não aceita a flag "u", e os
// caracteres combinantes escritos no fonte viram lixo invisível no diff.
const ACENTOS = new RegExp("[\u0300-\u036f]", "g");
const semAcento = (t: unknown) => String(t ?? "").normalize("NFD").replace(ACENTOS, "").toLowerCase();

/**
 * "O sistema sugere": os ativos do acervo que casam com a peça — a MESMA
 * régua da busca de 14/09 (tipo + medida; patrocinador igual antes de
 * genérico) — e só o que está LIVRE no galpão (sem reserva, triado, de evento
 * que já passou). Com `busca`, é a procura manual: qualquer peça livre do
 * acervo cujo código, tipo, descrição ou evento contenha o texto, porque quem
 * procura no galpão acha o que a régua automática não acha.
 * Sem campo de local (dono, 21/09).
 */
export async function sugestoesParaPeca(itemId: string, busca?: string): Promise<{ semMedida: boolean; sugestoes: SugestaoDoAcervo[] }> {
  const agora = new Date();
  const [peca] = await carregarPecas(db, { itemId });
  if (!peca || peca.deletedAt) throw erro(404, "Peça não encontrada");
  const manual = semAcento(busca).trim();
  if (!manual && !temMedida(peca)) return { semMedida: true, sugestoes: [] };

  const [ativos, reservas] = await Promise.all([carregarAtivos(db), carregarReservasAtivas(db, agora)]);
  const reservaPorAtivo = new Map(reservas.map((r) => [r.assetId, r]));
  const termos = manual.split(/\s+/).filter(Boolean);
  const casaComABusca = (a: Ativo) => {
    const texto = semAcento([a.displayId, a.origemDisplayId, a.origemTipo, a.origemDescricao, a.origemEventName].join(" "));
    return termos.every((t) => texto.includes(t));
  };

  const lotes = new Map<string, SugestaoDoAcervo>();
  for (const a of ativos) {
    if (manual && !casaComABusca(a)) continue;
    const s = avaliar(peca, a, reservaPorAtivo.get(a.id) ?? null, agora, !manual);
    if (!s || s.disponibilidade !== "disponivel") continue;
    const chave = [a.origemItemId, a.condicao, s.relacao].join("|");
    let lote = lotes.get(chave);
    if (!lote) {
      lote = {
        chave, relacao: s.relacao, condicao: a.condicao, thumb: a.thumb,
        origem: {
          displayId: a.origemDisplayId, tipo: a.origemTipo, descricao: a.origemDescricao,
          largura: a.origemLargura, altura: a.origemAltura, eventName: a.origemEventName, eventInicio: a.origemInicio,
        },
        ativos: [], quantidade: 0,
      };
      lotes.set(chave, lote);
    }
    lote.ativos.push({ id: a.id, displayId: a.displayId, quantidade: a.quantidade });
    lote.quantidade += a.quantidade;
  }
  const mesmoTipo = (l: SugestaoDoAcervo) => (normalizarTipo(l.origem.tipo) === normalizarTipo(peca.type) ? 0 : 1);
  const sugestoes = Array.from(lotes.values())
    .sort((x, y) => mesmoTipo(x) - mesmoTipo(y)
      || compararLotes({ ...x, disponibilidade: "disponivel" }, { ...y, disponibilidade: "disponivel" }))
    // A busca manual varre o acervo inteiro: o teto impede 5 mil cartões.
    .slice(0, 60);
  for (const l of sugestoes) l.ativos.sort((x, y) => x.displayId.localeCompare(y.displayId, "pt-BR", { numeric: true }));
  return { semMedida: !temMedida(peca), sugestoes };
}

/** Soma das unidades dos ativos escolhidos (para validar antes de gravar). */
export async function unidadesDosAtivos(ids: string[]): Promise<number> {
  const ativos = await carregarAtivos(db, ids);
  if (ativos.length !== ids.length) throw erro(404, "Alguma peça escolhida não está mais no estoque — atualize a lista.");
  return ativos.reduce((s, a) => s + a.quantidade, 0);
}

/**
 * Responde, numa transação só:
 *   1. RESERVA os ativos escolhidos para a peça (o mecanismo de 14/09);
 *   2. se a peça JÁ FOI LIBERADA, aplica o reaproveitamento nela agora — a
 *      regra do mark-reuse (soma, sem invadir o produzido; fecha como Produzido
 *      se cobrir tudo; reescala a divisão entre impressoras) — com a trilha.
 *      Não cabe mais? Erro 409 com frase de gente, NADA é gravado e a
 *      solicitação continua aberta.
 *      Se a peça AINDA ESTÁ NA REVISÃO FINAL (ou voltou para a Arte), a
 *      resposta só fica REGISTRADA: quem segue com a peça é a Revisão Final, e
 *      o reaproveitamento entra quando ELA liberar
 *      (services/consultaDeEstoqueNaLiberacao.ts). A resposta nunca libera a
 *      peça nem muda o status de peça em revisão;
 *   3. fecha a solicitação com UPDATE condicional em status = 'aberta' — duas
 *      pessoas respondendo juntas: a segunda recebe 409 e tudo dela desfaz.
 */
export async function responderConsulta(e: {
  id: string; status: Exclude<StatusDaConsulta, "aberta" | "cancelada">; atendida: number; ativosIds: string[];
  observacao: string | null; fotoUrl: string | null; quem: Quem;
}) {
  return db.transaction(async (tx) => {
    const [atual] = await tx.select({ itemId: consultasDeEstoque.itemId, pedida: consultasDeEstoque.quantidadePedida })
      .from(consultasDeEstoque).where(eq(consultasDeEstoque.id, e.id));
    if (!atual) throw erro(404, "Solicitação não encontrada");

    let codigos: string[] = [];
    if (e.atendida > 0 && e.ativosIds.length > 0) {
      const r = await reservarAtivosParaPeca(tx, {
        itemId: atual.itemId, assetIds: e.ativosIds, quem: e.quem, agora: new Date(),
        // Quem escolheu foi a Gráfica, olhando a peça: a régua automática
        // sugere, não proíbe.
        exigirSemelhanca: false,
      });
      codigos = r.ativos.map((a) => a.displayId);
    }

    // A peça, travada até o fim: o teto do reaproveitamento é lido e gravado
    // sem ninguém produzir no meio.
    const [peca] = await tx.select().from(itemsTable).where(eq(itemsTable.id, atual.itemId)).for("update");
    if (!peca || peca.deletedAt) throw erro(404, "A peça desta solicitação não existe mais.");

    let pecaAtualizada: typeof peca | null = null;
    let aplicado = false;
    if (e.atendida > 0) {
      const efeito = efeitoDoAtendimento(peca, e.atendida);
      if (!efeito.ok) throw erro(409, efeito.erro);
      if (pecaJaLiberada(peca.status)) {
        const r = reescalarReservaEPartes(peca as any, peca.quantity - efeito.reuseQty);
        const [atualizada] = await tx.update(itemsTable).set({
          reuseQty: efeito.reuseQty,
          isReuse: efeito.isReuse,
          ...(efeito.fecha ? { status: "produced", statusChangedAt: new Date() } : {}),
          ...(lerPartes(peca.impressaoPorMaquina) ? { impressaoPorMaquina: efeito.fecha ? null : r.partes } : {}),
          ...colunasDaReserva(efeito.fecha ? null : r.reserva),
          updatedAt: new Date(),
        }).where(eq(itemsTable.id, peca.id)).returning();
        await tx.insert(auditLogs).values({
          userName: e.quem.userName,
          userId: e.quem.userId,
          action: "updated",
          entityType: "item",
          entityId: peca.id,
          details: trilhaDoAtendimento(e.atendida, atual.pedida, e.quem.userName),
        });
        pecaAtualizada = atualizada ?? null;
        aplicado = true;
      }
    }

    const [respondida] = await tx.update(consultasDeEstoque)
      .set({
        status: e.status,
        quantidadeAtendida: e.atendida,
        ativosIds: e.atendida > 0 ? e.ativosIds : [],
        observacaoResposta: e.observacao,
        fotoUrl: e.fotoUrl,
        respondidoPor: e.quem.userName,
        respondidoPorId: e.quem.userId,
        respondidoEm: new Date(),
        aplicadoEm: aplicado ? new Date() : null,
      })
      .where(and(eq(consultasDeEstoque.id, e.id), eq(consultasDeEstoque.status, "aberta")))
      .returning();
    if (!respondida) throw erro(409, "Esta solicitação não está mais aberta — atualize a tela.");
    return { consulta: respondida, codigos, pecaAtualizada, aplicado };
  });
}

export async function cancelarConsulta(id: string) {
  const [cancelada] = await db.update(consultasDeEstoque)
    .set({ status: "cancelada" })
    .where(and(eq(consultasDeEstoque.id, id), eq(consultasDeEstoque.status, "aberta")))
    .returning();
  return cancelada ?? null;
}

/**
 * As solicitações ABERTAS, por peça — o aviso "5 un. aguardando resposta do
 * estoque" na fila da Gráfica, para ninguém imprimir o que talvez venha do
 * estoque. Uma leitura para a fila inteira.
 */
export async function abertasPorPeca() {
  return db.select({
    id: consultasDeEstoque.id,
    itemId: consultasDeEstoque.itemId,
    quantidadePedida: consultasDeEstoque.quantidadePedida,
    pedidoPor: consultasDeEstoque.pedidoPor,
  })
    .from(consultasDeEstoque)
    .innerJoin(itemsTable, eq(itemsTable.id, consultasDeEstoque.itemId))
    .where(and(eq(consultasDeEstoque.status, "aberta"), isNull(itemsTable.deletedAt), notInArray(itemsTable.status, PECA_CANCELADA)));
}

/**
 * O que a LISTA da Revisão Final precisa: a solicitação que vale para cada
 * peça EM REVISÃO (a mais recente não cancelada e ainda não aplicada) — o selo
 * na linha, "Aguardando estoque (N)", "Estoque respondeu (N)" e a sugestão da
 * liberação em lote.
 */
export async function consultasDaRevisao() {
  const linhas = await db.select({
    id: consultasDeEstoque.id,
    itemId: consultasDeEstoque.itemId,
    status: consultasDeEstoque.status,
    quantidadePedida: consultasDeEstoque.quantidadePedida,
    quantidadeAtendida: consultasDeEstoque.quantidadeAtendida,
    respondidoPor: consultasDeEstoque.respondidoPor,
    respondidoEm: consultasDeEstoque.respondidoEm,
    pedidoEm: consultasDeEstoque.pedidoEm,
    // Para o filtro do Kit na rota (a régua é shared/kit.ts).
    kitRemessaId: itemsTable.kitRemessaId,
    criadoPorId: itemsTable.criadoPorId,
  })
    .from(consultasDeEstoque)
    .innerJoin(itemsTable, eq(itemsTable.id, consultasDeEstoque.itemId))
    .where(and(
      ne(consultasDeEstoque.status, "cancelada"),
      isNull(consultasDeEstoque.aplicadoEm),
      isNull(itemsTable.deletedAt),
      eq(itemsTable.status, "awaiting_final_review"),
    ))
    .orderBy(desc(consultasDeEstoque.pedidoEm));
  const porPeca = new Map<string, (typeof linhas)[number]>();
  for (const l of linhas) if (!porPeca.has(l.itemId)) porPeca.set(l.itemId, l);
  return Array.from(porPeca.values());
}
