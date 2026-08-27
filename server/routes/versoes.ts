// ─────────────────────────────────────────────────────────────────────────────
// VERSÕES APROVADAS — qual versão da arte cada patrocinador aprovou, de qual
// peça, e os books de cada evento com história.
//
// Pedido do dono (21/08/2026). O que existia antes desta rota:
//   · a aprovação dizia "aprovou" e "quando", mas não O QUÊ — com a Arte
//     trocando o thumb depois, "aprovado" passava a apontar para uma arte que
//     o patrocinador nunca viu;
//   · a história das versões morava só no texto da trilha de auditoria
//     ("Thumb de aprovação atualizado … Anterior: X → Novo: Y");
//   · `items.book_url` guardava só o book ATUAL do evento.
//
// Daqui em diante três coisas são GRAVADAS (item_art_versions, event_books e
// item_sponsor_approvals.decided_thumb_url — ver routes/items.ts). Para o que
// já aconteceu, esta rota RECONSTRÓI da trilha, e marca o que é inferido: uma
// aprovação sem `decidedThumbUrl` recebe a versão vigente na data da decisão,
// com `inferido: true`. A tela diz isso em voz alta — inferência apresentada
// como registro é o erro que esta tela existe para evitar.
//
// ── A REVISÃO DE 24/08 (o que mudou e por quê) ───────────────────────────────
// A primeira versão devolvia TUDO num payload só: 2,24 MB, 2.637 peças, para
// um assunto que são 30. Três consequências, todas corrigidas aqui:
//
//  1. FILTRO E PÁGINA NO SERVIDOR. A rota aceita recorte (evento, patrocinador,
//     busca, foco) e devolve uma página. O cliente não baixa mais o acervo
//     inteiro para mostrar quarenta linhas.
//  2. RESUMO E FACETAS vêm juntos, calculados sobre o MESMO conjunto — o número
//     ao lado do filtro nunca pode discordar do que o clique entrega.
//  3. CACHE CURTO em memória. O trabalho pesado (3,6 s com o banco quente,
//     ~90 s no cold start do Neon) era refeito a cada digitação de filtro.
//     Agora é feito uma vez e reaproveitado; qualquer escrita que mude versão,
//     decisão ou book chama `invalidarCacheDeVersoes()`.
//
// E três correções de HONESTIDADE, que a revisão encontrou:
//  · a numeração da versão passa a ser por OCORRÊNCIA (a Arte reenviar um
//    arquivo já usado não faz a v3 virar v1);
//  · decisão empatada com a troca de arte no mesmo instante vira INDETERMINADA
//    em vez de escolher em silêncio — é justamente o caso que a tela julga;
//  · o book ganha estado: "em dia" ou "desatualizado, N peças mudaram depois".
// ─────────────────────────────────────────────────────────────────────────────
import { ehBookCompleto } from "@shared/fluxo-peca";
import type { Express } from "express";
import { db } from "../db";
import { storage } from "../storage";
import { auditLogs } from "@shared/schema";
import { requireAuth } from "./shared";
import { sql } from "drizzle-orm";

export type VersaoDaArte = {
  thumbUrl: string;
  em: string;               // ISO
  origem: "envio" | "reenvio" | "troca" | "trilha" | "atual";
  por: string | null;
  /** Reconstruída da trilha de auditoria ou do estado atual — não gravada como versão. */
  inferida: boolean;
};

export type DecisaoDoPatrocinador = {
  sponsorId: string;
  nome: string;
  cor: string | null;
  status: string;
  decididoEm: string | null;
  por: string | null;
  motivo: string | null;
  /** O thumb que o patrocinador de fato decidiu (gravado), ou o vigente na data (inferido). */
  thumbUrl: string | null;
  /** Número da versão na lista da peça (1 = primeira), quando localizável. */
  versao: number | null;
  inferido: boolean;
  /** Decisão e troca de arte no mesmo instante: a versão não é determinável. */
  ambiguo: boolean;
  /** Aprovou uma versão que não é a atual da peça. */
  divergente: boolean;
};

export type PecaDeVersoes = {
  id: string;
  displayId: string;
  type: string;
  description: string | null;
  status: string;
  eventId: string;
  eventName: string;
  truckDepartureDate: string | null;
  approvalThumbUrl: string | null;
  bookUrl: string | null;
  versoes: VersaoDaArte[];
  decisoes: DecisaoDoPatrocinador[];
  // Marcas calculadas uma vez no servidor — o cliente filtra e ordena por elas
  // sem repetir a conta em cada render.
  divergente: boolean;
  /** Alguma decisão desta peça não dá para amarrar a uma versão. */
  indeterminada: boolean;
  atencao: boolean;
};

export type PecaQueMudou = {
  id: string;
  displayId: string;
  eventId: string;
  /** Quando a arte foi trocada. */
  em: string;
  type: string;
  description: string | null;
  /** Onde a peça está HOJE: trocar arte de peça já produzida é outro problema. */
  status: string;
  /** Quem trocou, quando o registro sabe. */
  por: string | null;
  /** Em que versão ela está agora. */
  versao: number;
};

export type BookDoEvento = {
  bookUrl: string;
  em: string | null;
  por: string | null;
  itemCount: number;
  inferido: boolean;
  /** O que mudou nesta publicação, escrito por quem publicou (25/08). */
  comentario: string | null;
  /**
   * Dá para saber QUAIS peças estão neste book?
   *
   * Só do book ATUAL: a associação peça↔book vive em `items.book_url`, que
   * guarda um endereço por peça — publicar um book novo sobrescreve o anterior.
   * Para os books já substituídos sobrou a contagem (`itemCount`), não a lista.
   * Sem isso não se pode afirmar que uma peça "estava naquele book".
   */
  membrosConhecidos: boolean;
  /** Peças DO BOOK que ganharam versão nova depois desta publicação. */
  pecasMudaramDepois: number;
  /** Quais são — para a tela responder "mudaram quantas?" com nome e sobrenome. */
  pecasMudaram: PecaQueMudou[];
};

/**
 * O ÚLTIMO AVISO do book que saiu por e-mail, lido da trilha (25/08).
 *
 * O envio deixa rastro em audit_logs ("Aviso por e-mail enviado para a@x,
 * b@y, com cópia oculta para N pessoas"); o que NÃO existe é rastreio de
 * abertura — o e-mail sai por SMTP simples, sem pixel nem webhook. Por isso a
 * tela mostra envio e destinatários, e nada de taxa de leitura: meia
 * informação verdadeira vale mais que uma taxa inventada.
 */
type AvisoDoBook = { em: string; pessoas: number };

type DadosDeVersoes = {
  itens: PecaDeVersoes[];
  books: { eventId: string; eventName: string; truckDepartureDate: string | null; books: BookDoEvento[]; aviso: AvisoDoBook | null }[];
  registroDesde: string | null;
  calculadoEm: number;
};

const RE_TROCA = /Thumb de aprovação atualizado por (.+?)\. Anterior: (\S+) → Novo: (\S+)/;

// PRAZO NÃO MORA AQUI (decisão do dono, 24/08). Esta tela responde "qual
// versão foi aprovada e é ela que está indo para a gráfica"; cobrar decisão
// parada é trabalho do Atendimento e da Gestão de Prazos, que já têm a régua,
// o histórico de cobrança e as pessoas. Duas telas cobrando a mesma pendência
// com contas próprias é como um número passa a discordar do outro.

/** Empate menor que isto entre decisão e troca de arte é indeterminável. */
const EMPATE_MS = 1000;

const TTL_MS = 30_000;
let cache: DadosDeVersoes | null = null;

/**
 * Chamado por quem escreve versão, decisão ou book (routes/items.ts). Sem isto
 * o Atendimento revogaria uma aprovação e veria o quadro velho por meio minuto
 * — numa tela cujo trabalho é justamente conferir o que está valendo agora.
 */
export function invalidarCacheDeVersoes(): void {
  cache = null;
}

async function carregar(): Promise<DadosDeVersoes> {
  if (cache && Date.now() - cache.calculadoEm < TTL_MS) return cache;

  const [itens, eventos, sponsors, aprovacoes, versoesGravadas, booksGravados, logsDeTroca, logsDeAviso] = await Promise.all([
    storage.getAllItems().then((l) => l.filter((i) => !ehBookCompleto(i))), // BOOK COMPLETO fica de fora: é o trâmite do Atendimento, não uma peça (ver shared/fluxo-peca).
    storage.getAllEvents(),
    storage.getAllSponsors(),
    storage.getAllItemSponsorApprovals(),
    storage.getAllItemArtVersions(),
    storage.getAllEventBooks(),
    db.select().from(auditLogs)
      .where(sql`${auditLogs.entityType} = 'item' and ${auditLogs.details} like 'Thumb de aprovação atualizado%'`)
      .orderBy(auditLogs.createdAt),
    // O rastro do aviso por e-mail do book — só os ENVIADOS (o "NÃO enviado"
    // também vai para a trilha e não pode contar como aviso dado).
    db.select().from(auditLogs)
      .where(sql`${auditLogs.entityType} = 'event' and (${auditLogs.details} like 'Aviso por e-mail enviado para %' or ${auditLogs.details} like 'Reenvio manual. Aviso por e-mail enviado para %')`)
      .orderBy(auditLogs.createdAt),
  ]);

  const eventoPorId = new Map(eventos.map((e) => [e.id, e]));
  const sponsorPorId = new Map(sponsors.map((s) => [s.id, s]));
  const agora = Date.now();

  // ── versões por peça ──
  const versoesPorItem = new Map<string, VersaoDaArte[]>();
  const push = (itemId: string, v: VersaoDaArte) => {
    const l = versoesPorItem.get(itemId) ?? [];
    l.push(v);
    versoesPorItem.set(itemId, l);
  };
  for (const v of versoesGravadas) {
    push(v.itemId, { thumbUrl: v.thumbUrl, em: new Date(v.createdAt).toISOString(), origem: v.origem as VersaoDaArte["origem"], por: v.createdBy ?? null, inferida: false });
  }
  // Legado: cada troca na trilha dá DUAS pistas — o anterior existia antes da
  // data do log, o novo passou a valer na data do log.
  for (const log of logsDeTroca) {
    const m = RE_TROCA.exec(log.details ?? "");
    if (!m) continue;
    const [, por, anterior, novo] = m;
    const em = new Date(log.createdAt).toISOString();
    const lista = versoesPorItem.get(log.entityId) ?? [];
    if (!lista.some((x) => x.thumbUrl === anterior)) {
      push(log.entityId, { thumbUrl: anterior, em: new Date(new Date(log.createdAt).getTime() - 1).toISOString(), origem: "trilha", por: null, inferida: true });
    }
    if (!(versoesPorItem.get(log.entityId) ?? []).some((x) => x.thumbUrl === novo)) {
      push(log.entityId, { thumbUrl: novo, em, origem: "trilha", por, inferida: true });
    }
  }

  // ── decisões por peça ──
  const aprovPorItem = new Map<string, typeof aprovacoes>();
  for (const a of aprovacoes) {
    const l = aprovPorItem.get(a.itemId) ?? [];
    l.push(a);
    aprovPorItem.set(a.itemId, l);
  }

  const pecasComCarimbo = new Set<string>();
  const saida: PecaDeVersoes[] = [];
  for (const item of itens) {
    if ((item as any).deletedAt) continue;
    const decisoes = aprovPorItem.get(item.id) ?? [];
    let versoes = versoesPorItem.get(item.id) ?? [];
    // O thumb atual entra como versão quando nada o registrou (peça anterior às
    // tabelas, ou enviada por um caminho que não grava).
    if (item.approvalThumbUrl && !versoes.some((v) => v.thumbUrl === item.approvalThumbUrl)) {
      const em = item.approvalThumbUpdatedAt ?? item.updatedAt ?? item.createdAt;
      versoes = [...versoes, { thumbUrl: item.approvalThumbUrl, em: new Date(em as any).toISOString(), origem: "atual", por: null, inferida: true }];
    }
    // A data acima pode ser `updatedAt`, que muda por QUALQUER edição da peça
    // (descrição, quantidade, medida). Isso serve para ordenar a régua, mas não
    // serve como prova de arte nova — e é essa prova que o book precisa.
    if (item.approvalThumbUpdatedAt) pecasComCarimbo.add(item.id);
    if (decisoes.length === 0 && versoes.length === 0) continue;
    versoes.sort((a, b) => a.em.localeCompare(b.em));

    // NUMERAÇÃO POR OCORRÊNCIA. Casar por URL fazia a "v3" aparecer como "v1"
    // quando a Arte reenviava um arquivo já usado. Com a data da decisão em
    // mãos, a ocorrência certa é a última que já valia naquele instante.
    const numeroDaVersao = (url: string | null, iso: string | null): number | null => {
      if (!url) return null;
      let escolhido = -1;
      for (let i = 0; i < versoes.length; i++) {
        if (versoes[i].thumbUrl !== url) continue;
        if (iso && versoes[i].em > iso) break;
        escolhido = i;
        if (!iso) break;
      }
      if (escolhido < 0) escolhido = versoes.findIndex((v) => v.thumbUrl === url);
      return escolhido >= 0 ? escolhido + 1 : null;
    };
    const vigenteEm = (iso: string): string | null => {
      let atual: string | null = null;
      for (const v of versoes) { if (v.em <= iso) atual = v.thumbUrl; else break; }
      return atual ?? (versoes[0]?.thumbUrl ?? null);
    };

    const decisoesSaida: DecisaoDoPatrocinador[] = decisoes.map((a) => {
      const sp = sponsorPorId.get(a.sponsorId);
      const quando = a.approvedAt ?? a.rejectedAt;
      const decididoEm = quando ? new Date(quando as any).toISOString() : null;
      const gravado = (a as any).decidedThumbUrl as string | null | undefined;
      const thumbUrl = gravado ?? (decididoEm ? vigenteEm(decididoEm) : null);
      const inferido = !gravado && thumbUrl !== null;
      // EMPATE: decisão e troca de arte no mesmo instante. A ordem real é
      // indeterminável, e é exatamente o caso que a tela existe para julgar —
      // então ela diz "indeterminada" em vez de chutar.
      const ambiguo = inferido && decididoEm !== null && versoes.some((v) =>
        v.thumbUrl !== thumbUrl && Math.abs(new Date(v.em).getTime() - new Date(decididoEm).getTime()) <= EMPATE_MS);
      return {
        sponsorId: a.sponsorId,
        nome: sp?.name ?? "Patrocinador",
        cor: sp?.color ?? null,
        status: a.status,
        decididoEm,
        por: a.approvedBy ?? a.rejectedBy ?? null,
        motivo: a.rejectionReason ?? null,
        thumbUrl,
        versao: ambiguo ? null : numeroDaVersao(thumbUrl, decididoEm),
        inferido,
        ambiguo,
        divergente: a.status === "approved" && !!thumbUrl && thumbUrl !== item.approvalThumbUrl,
      };
    });

    const ev = eventoPorId.get(item.eventId);
    const divergente = decisoesSaida.some((d) => d.divergente);
    const indeterminada = decisoesSaida.some((d) => d.ambiguo);
    saida.push({
      id: item.id,
      displayId: item.displayId,
      type: item.type,
      description: item.description,
      status: item.status,
      eventId: item.eventId,
      eventName: ev?.name ?? "Evento desconhecido",
      truckDepartureDate: ev?.truckDepartureDate ? new Date(ev.truckDepartureDate as any).toISOString() : null,
      approvalThumbUrl: item.approvalThumbUrl ?? null,
      bookUrl: item.bookUrl ?? null,
      versoes,
      decisoes: decisoesSaida,
      divergente,
      indeterminada,
      // O que pede atenção AQUI é o que diz respeito a versão: alguém aprovou
      // uma arte que não é a que está na peça, a peça tem história para
      // comparar, ou a decisão não se amarra a nenhuma versão.
      atencao: divergente || versoes.length > 1 || indeterminada,
    });
  }

  // Ordem de leitura: evento mais recente primeiro, peça por displayId.
  saida.sort((a, b) =>
    (b.truckDepartureDate ?? "").localeCompare(a.truckDepartureDate ?? "")
    || a.eventName.localeCompare(b.eventName, "pt-BR")
    || a.displayId.localeCompare(b.displayId));

  // ── books por evento ──
  // QUANDO A ARTE DESTA PEÇA MUDOU DE VERDADE.
  //
  // Não é "quando a peça mudou": a última versão de uma peça sem histórico é
  // reconstruída do estado atual e, sem `approval_thumb_updated_at`, herda o
  // `updated_at` — que muda ao corrigir uma descrição. Usar isso fazia o book
  // acusar "arte trocada" para peça que ninguém tocou na arte, com "v1" e sem
  // autor, que era o sinal de que o número estava errado.
  //
  // Vale como troca: versão GRAVADA (envio, reenvio, troca), versão
  // reconstruída da TRILHA de auditoria, ou a versão atual quando a peça tem
  // carimbo de troca de thumb.
  const ultimaVersaoDaPeca = new Map<string, string>();
  for (const p of saida) {
    const comProva = p.versoes.filter((v) => v.origem !== "atual" || pecasComCarimbo.has(p.id));
    const ultima = comProva[comProva.length - 1];
    if (ultima) ultimaVersaoDaPeca.set(p.id, ultima.em);
  }
  // AS PEÇAS QUE ESTÃO EM CADA BOOK. Só o book atual tem essa lista: a
  // associação mora em `items.book_url`, e publicar um book novo sobrescreve
  // o anterior.
  //
  // A lista sai de TODOS os itens, não de `saida` — que descarta peça sem
  // versão e sem decisão. Um book pode ser publicado com peças que ainda não
  // foram a aprovação nenhuma (o Eco Run Palmas tinha 45 assim), e usar a
  // lista filtrada fazia o book dizer "não dá para saber quais peças são as
  // minhas" quando elas estavam ali, inteiras.
  const porId = new Map(saida.map((p) => [p.id, p]));
  const pecasDoBook = new Map<string, { id: string; peca: PecaDeVersoes | undefined }[]>();
  for (const item of itens) {
    if (!item.bookUrl || (item as any).deletedAt) continue;
    const l = pecasDoBook.get(item.bookUrl) ?? [];
    l.push({ id: item.id, peca: porId.get(item.id) });
    pecasDoBook.set(item.bookUrl, l);
  }

  const booksPorEvento = new Map<string, BookDoEvento[]>();
  for (const b of booksGravados) {
    const l = booksPorEvento.get(b.eventId) ?? [];
    const em = new Date(b.createdAt).toISOString();
    // "Desatualizado": peça DO BOOK cuja arte mudou depois de o book sair.
    //
    // Contava as peças do EVENTO, e não as do book — e por isso um book de 26
    // peças chegou a dizer "34 peças mudaram", que é impossível e destrói a
    // confiança no resto do número. Quem não está no book não pode
    // desatualizá-lo.
    const doBook = pecasDoBook.get(b.bookUrl) ?? null;
    // Peça sem versão registrada não pode ter trocado de arte — ela entra na
    // contagem de membros do book, nunca na de "mudaram depois".
    const mudaram = (doBook ?? [])
      .map((m) => m.peca)
      .filter((peca): peca is PecaDeVersoes => !!peca && (ultimaVersaoDaPeca.get(peca.id) ?? "") > em)
      .map((peca): PecaQueMudou => {
        const trocaEm = ultimaVersaoDaPeca.get(peca.id)!;
        const ultima = peca.versoes[peca.versoes.length - 1];
        return {
          id: peca.id,
          displayId: peca.displayId,
          eventId: peca.eventId,
          em: trocaEm,
          type: peca.type,
          description: peca.description,
          status: peca.status,
          por: ultima?.por ?? null,
          versao: peca.versoes.length,
        };
      })
      .sort((a, b2) => b2.em.localeCompare(a.em));
    l.push({
      bookUrl: b.bookUrl, em, por: b.createdBy ?? null, itemCount: b.itemCount, inferido: false,
      comentario: (b as any).comment ?? null,
      membrosConhecidos: doBook !== null,
      pecasMudaramDepois: mudaram.length,
      // Teto para o payload não crescer sem limite; a contagem acima é inteira.
      pecasMudaram: mudaram.slice(0, 60),
    });
    booksPorEvento.set(b.eventId, l);
  }
  // O book atual sem registro (legado) entra sem data — e sem fingir uma.
  const atualPorEvento = new Map<string, { bookUrl: string; n: number }>();
  for (const item of itens) {
    if (!item.bookUrl || (item as any).deletedAt) continue;
    const cur = atualPorEvento.get(item.eventId);
    if (cur && cur.bookUrl === item.bookUrl) cur.n += 1;
    else if (!cur) atualPorEvento.set(item.eventId, { bookUrl: item.bookUrl, n: 1 });
  }
  for (const [eventId, cur] of Array.from(atualPorEvento.entries())) {
    const l = booksPorEvento.get(eventId) ?? [];
    if (!l.some((b) => b.bookUrl === cur.bookUrl)) {
      l.push({ bookUrl: cur.bookUrl, em: null, por: null, itemCount: cur.n, inferido: true, comentario: null, membrosConhecidos: true, pecasMudaramDepois: 0, pecasMudaram: [] });
      booksPorEvento.set(eventId, l);
    }
  }
  // ── o último aviso enviado, por evento ──
  // A trilha guarda a frase inteira; daqui saem a data e QUANTAS pessoas
  // receberam (destinatários do "para" + a cópia oculta). Logs em ordem
  // ascendente: o último a escrever no mapa é o mais recente.
  const RE_AVISO = /^(?:Reenvio manual\. )?Aviso por e-mail enviado para (.+?)(?:, com cópia oculta para (\d+) pessoas?)?(?:\s*\(endereços inválidos[^)]*\))?\.$/;
  const ultimoAvisoPorEvento = new Map<string, AvisoDoBook>();
  for (const log of logsDeAviso) {
    const m = RE_AVISO.exec(log.details ?? "");
    if (!m) continue;
    const pessoas = m[1].split(",").map((s) => s.trim()).filter(Boolean).length + (m[2] ? parseInt(m[2], 10) : 0);
    ultimoAvisoPorEvento.set(log.entityId, { em: new Date(log.createdAt).toISOString(), pessoas });
  }

  const books = Array.from(booksPorEvento.entries()).map(([eventId, lista]) => ({
    eventId,
    eventName: eventoPorId.get(eventId)?.name ?? "Evento desconhecido",
    truckDepartureDate: (() => { const d = eventoPorId.get(eventId)?.truckDepartureDate; return d ? new Date(d as any).toISOString() : null; })(),
    // Sem data (legado) vai para o fim: não dá para afirmar que é o mais novo.
    books: lista.sort((a, b) => (b.em ?? "").localeCompare(a.em ?? "")),
    aviso: ultimoAvisoPorEvento.get(eventId) ?? null,
  })).sort((a, b) => (b.truckDepartureDate ?? "").localeCompare(a.truckDepartureDate ?? ""));

  const datasDeRegistro = versoesGravadas.map((v) => new Date(v.createdAt).toISOString()).sort();
  const dados: DadosDeVersoes = { itens: saida, books, registroDesde: datasDeRegistro[0] ?? null, calculadoEm: Date.now() };
  cache = dados;
  return dados;
}

const csv = (v: string | number | null | undefined) => {
  const s = String(v ?? "");
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

type Recorte = {
  eventos: string[];
  patrocinadores: string[];
  busca: string;
  foco: "atencao" | "todas" | "sem-patrocinador";
};

function lerRecorte(q: any): Recorte {
  const lista = (v: any) => String(v ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const foco = String(q.foco ?? "atencao");
  return {
    eventos: lista(q.evento),
    patrocinadores: lista(q.patrocinador),
    busca: String(q.busca ?? "").trim().toLowerCase(),
    foco: foco === "todas" || foco === "sem-patrocinador" ? foco : "atencao",
  };
}

const casaBusca = (p: PecaDeVersoes, busca: string) =>
  !busca || `${p.displayId} ${p.type} ${p.description ?? ""} ${p.eventName}`.toLowerCase().includes(busca);
const casaEvento = (p: PecaDeVersoes, r: Recorte) => r.eventos.length === 0 || r.eventos.includes(p.eventId);
const casaPatrocinador = (p: PecaDeVersoes, r: Recorte) =>
  r.patrocinadores.length === 0 || p.decisoes.some((d) => r.patrocinadores.includes(d.sponsorId));
const casaFoco = (p: PecaDeVersoes, r: Recorte) =>
  r.foco === "todas" ? true : r.foco === "sem-patrocinador" ? p.decisoes.length === 0 : p.atencao;

function filtrar(itens: PecaDeVersoes[], r: Recorte) {
  return itens.filter((p) => casaBusca(p, r.busca) && casaEvento(p, r) && casaPatrocinador(p, r) && casaFoco(p, r));
}

export function registerVersoesRoutes(app: Express): void {
  app.get("/api/versoes", requireAuth, async (req, res) => {
    try {
      const dados = await carregar();
      const r = lerRecorte(req.query);
      const pagina = Math.max(0, parseInt(String(req.query.pagina ?? "0"), 10) || 0);
      const tamanho = Math.min(120, Math.max(10, parseInt(String(req.query.tamanho ?? "40"), 10) || 40));

      const recortadas = filtrar(dados.itens, r);

      // FACETAS: cada uma conta o pool SEM a própria dimensão, para o número ao
      // lado do filtro nunca discordar do que o clique entrega.
      const semEvento = dados.itens.filter((p) => casaBusca(p, r.busca) && casaPatrocinador(p, r) && casaFoco(p, r));
      const semPatrocinador = dados.itens.filter((p) => casaBusca(p, r.busca) && casaEvento(p, r) && casaFoco(p, r));
      const contaEventos = new Map<string, { label: string; count: number }>();
      for (const p of semEvento) {
        const e = contaEventos.get(p.eventId) ?? { label: p.eventName, count: 0 };
        e.count += 1; contaEventos.set(p.eventId, e);
      }
      const contaPatrocinadores = new Map<string, { label: string; count: number }>();
      for (const p of semPatrocinador) {
        for (const d of p.decisoes) {
          const e = contaPatrocinadores.get(d.sponsorId) ?? { label: d.nome, count: 0 };
          e.count += 1; contaPatrocinadores.set(d.sponsorId, e);
        }
      }

      // RESUMO: contado sobre o recorte SEM o foco — são os três números que a
      // tela oferece como atalho, e cada um tem de bater com o seu próprio clique.
      const semFoco = dados.itens.filter((p) => casaBusca(p, r.busca) && casaEvento(p, r) && casaPatrocinador(p, r));
      const decisoesTomadas = semFoco.flatMap((p) => p.decisoes).filter((d) => d.decididoEm);
      const resumo = {
        total: semFoco.length,
        atencao: semFoco.filter((p) => p.atencao).length,
        divergentes: semFoco.filter((p) => p.divergente).length,
        comHistorico: semFoco.filter((p) => p.versoes.length > 1).length,
        indeterminadas: semFoco.filter((p) => p.indeterminada).length,
        semPatrocinador: semFoco.filter((p) => p.decisoes.length === 0).length,
        decisoesTomadas: decisoesTomadas.length,
        decisoesInferidas: decisoesTomadas.filter((d) => d.inferido).length,
        decisoesAmbiguas: decisoesTomadas.filter((d) => d.ambiguo).length,
      };

      const books = r.eventos.length === 0 ? dados.books : dados.books.filter((b) => r.eventos.includes(b.eventId));

      res.json({
        resumo,
        registroDesde: dados.registroDesde,
        facetas: {
          eventos: Array.from(contaEventos.entries()).map(([value, v]) => ({ value, label: v.label, count: v.count }))
            .sort((a, b) => a.label.localeCompare(b.label, "pt-BR")),
          patrocinadores: Array.from(contaPatrocinadores.entries()).map(([value, v]) => ({ value, label: v.label, count: v.count }))
            .sort((a, b) => b.count - a.count),
        },
        total: recortadas.length,
        pagina,
        tamanho,
        itens: recortadas.slice(pagina * tamanho, pagina * tamanho + tamanho),
        books,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // O recorte inteiro em CSV — a prova que sai da tela para a conversa com o
  // patrocinador. Exporta TODAS as linhas do recorte, não a página à vista.
  app.get("/api/versoes/export.csv", requireAuth, async (req, res) => {
    try {
      const dados = await carregar();
      const recortadas = filtrar(dados.itens, lerRecorte(req.query));
      const linhas = [[
        "Evento", "Peça", "Tipo", "Descrição", "Versões", "Patrocinador", "Decisão",
        "Versão decidida", "Data da decisão", "Registrado por", "Motivo",
        "Origem da versão", "Aprovou versão diferente da atual",
      ].join(";")];
      for (const p of recortadas) {
        if (p.decisoes.length === 0) {
          linhas.push([p.eventName, p.displayId, p.type, p.description ?? "", p.versoes.length,
            "(sem patrocinador)", "", "", "", "", "", "", ""].map(csv).join(";"));
          continue;
        }
        for (const d of p.decisoes) {
          linhas.push([
            p.eventName, p.displayId, p.type, p.description ?? "", p.versoes.length,
            d.nome,
            d.status === "approved" ? "Aprovou" : d.decididoEm ? "Reprovou" : "Aguardando",
            d.ambiguo ? "indeterminada" : d.versao ? `v${d.versao}` : "",
            d.decididoEm ? new Date(d.decididoEm).toLocaleString("pt-BR") : "",
            d.por ?? "", d.motivo ?? "",
            d.inferido ? "inferida pela data" : d.decididoEm ? "registrada" : "",
            d.divergente ? "SIM" : "",
          ].map(csv).join(";"));
        }
      }
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="versoes-aprovadas.csv"`);
      // BOM: sem ele o Excel em pt-BR abre "Versões" como "VersÃµes".
      res.send("﻿" + linhas.join("\r\n"));
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
}
