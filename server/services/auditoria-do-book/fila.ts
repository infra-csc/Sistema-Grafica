// ─────────────────────────────────────────────────────────────────────────────
// A FILA DA AUDITORIA DO BOOK — em processo, UMA de cada vez.
//
// SÓ O 1º BOOK (dono, 19/10 — custo): a publicação chama `dispararSePrimeiro`;
// reenvio não audita. O admin audita o book atual quando quiser (`disparar`).
//
// O book é publicado e a rota responde na hora; a auditoria entra aqui e roda
// por trás (leva de 1 a 5 minutos por book). Uma de cada vez porque cada
// chamada leva o PDF inteiro (até dezenas de MB em memória) e porque a conta
// da API tem limite por minuto — dois books publicados juntos esperam a vez.
//
// À PROVA DE ERRO: tudo que falha vira status "erro" com a mensagem, e nada
// daqui lança para quem chamou. Sem ANTHROPIC_API_KEY: status "sem_chave" —
// não aparece nada para a Solicitação; o admin vê um aviso discreto.
//
// AO SUBIR O SERVIDOR, `retomar()` coloca de volta na fila o que ficou
// "pendente" ou "processando" (processo reiniciado no meio). Várias cópias do
// servidor podem tentar a mesma: `reivindicar` é atômico, só uma roda.
// ─────────────────────────────────────────────────────────────────────────────
import type { InsertNotification, Item } from "@shared/schema";
import { fraseDaNotificacaoDoBook } from "@shared/auditoria-do-book";
import * as repoPadrao from "./repo";
import { chamarIA as chamarIAPadrao, ErroDaIA, LIMITE_DE_PAGINAS, LIMITE_DA_REQUISICAO_BYTES, type ResultadoDaIA } from "./ia";
import { normalizarResposta } from "./normalizar";
import { montarListaDePecas, rotuloDaPeca } from "./prompt";

export interface PecasDoEvento {
  nomeDoEvento: string;
  pecas: Item[];
  /** As canceladas do evento (fora da lixeira) — vão à IA marcadas "CANCELADA". */
  canceladas?: Item[];
  /** displayId → nomes dos patrocinadores da peça. */
  patrocinadores: Map<string, string[]>;
}

export interface DependenciasDaFila {
  repo: Pick<typeof repoPadrao, "criarAuditoria" | "reivindicar" | "concluir" | "falhar" | "idsParaRetomar" | "eventoJaTemAuditoria">;
  chave: () => string | undefined;
  carregarPecas: (eventId: string) => Promise<PecasDoEvento>;
  lerPdf: (bookUrl: string) => Promise<Buffer>;
  contarPaginas: (bytes: Buffer) => Promise<number>;
  chamarIA: (opcoes: { pdfBase64: string; listaDePecas: string; chave: string }) => Promise<ResultadoDaIA>;
  notificar: (dados: InsertNotification) => Promise<void>;
  /** Avisa as telas abertas (tempo real) que a auditoria do evento mudou. */
  avisarTelas: (eventId: string) => void;
  log?: Pick<Console, "warn" | "error" | "info">;
}

const mensagem = (erro: unknown) => (erro instanceof Error ? erro.message : String(erro));

export function criarFila(deps: DependenciasDaFila) {
  const log = deps.log ?? console;
  let cadeia: Promise<void> = Promise.resolve();
  const naFila = new Set<string>();

  async function processar(id: string): Promise<void> {
    let auditoria: Awaited<ReturnType<typeof deps.repo.reivindicar>> = null;
    try {
      auditoria = await deps.repo.reivindicar(id);
    } catch (erro) {
      log.error("[auditoria do book] não foi possível pegar a auditoria", { id, erro: mensagem(erro) });
      return;
    }
    if (!auditoria) return; // outra cópia pegou, ou foi substituída
    const { eventId, bookUrl } = auditoria;
    try { deps.avisarTelas(eventId); } catch { /* aviso é cortesia */ }

    try {
      const chave = deps.chave()?.trim();
      if (!chave) {
        await deps.repo.falhar(id, "sem_chave", "ANTHROPIC_API_KEY não está configurada no servidor — a auditoria não rodou.");
        return;
      }
      const { nomeDoEvento, pecas, canceladas = [], patrocinadores } = await deps.carregarPecas(eventId);
      const pdf = await deps.lerPdf(bookUrl);
      if (pdf.length > LIMITE_DA_REQUISICAO_BYTES) {
        throw new ErroDaIA(`O book tem ${(pdf.length / 1024 / 1024).toFixed(1)} MB — passa do limite de 32 MB por requisição da API. Diminua as imagens do PDF e publique de novo.`);
      }
      const paginas = await deps.contarPaginas(pdf);
      if (paginas === 0) throw new ErroDaIA("O PDF do book não tem páginas.");
      if (paginas > LIMITE_DE_PAGINAS) {
        throw new ErroDaIA(`O book tem ${paginas} páginas — a auditoria lê até ${LIMITE_DE_PAGINAS}. Divida o book ou peça a um admin para auditar à mão.`);
      }
      const listaDePecas = montarListaDePecas(nomeDoEvento, pecas, (d) => patrocinadores.get(d) ?? [], canceladas);
      const resultado = await deps.chamarIA({ pdfBase64: pdf.toString("base64"), listaDePecas, chave });
      const n = normalizarResposta(
        resultado.entrada,
        pecas.map((p) => ({ id: p.id, displayId: p.displayId })),
        canceladas.map((p) => ({ id: p.id, displayId: p.displayId, rotulo: rotuloDaPeca(p) })),
      );
      const feita = await deps.repo.concluir(id, {
        achados: n.achados,
        pecasNoBook: n.pecasNoBook,
        encontradasNoApp: n.encontradasNoApp,
        modelo: resultado.modelo,
        tokensEntrada: resultado.tokensEntrada,
        tokensSaida: resultado.tokensSaida,
      });
      log.info?.("[auditoria do book] concluída", {
        id, eventId, paginas, faltando: n.achados.faltando.length, canceladas: n.achados.canceladas?.length ?? 0, divergencias: n.achados.divergencias.length,
        tokensEntrada: resultado.tokensEntrada, tokensSaida: resultado.tokensSaida, substituida: !feita,
      });
      // Substituída enquanto a IA lia (o admin pediu outra): o resultado
      // não vale mais e ninguém é avisado dele.
      const faltando = n.achados.faltando.length;
      const canceladasNoBook = n.achados.canceladas?.length ?? 0;
      if (feita && faltando + canceladasNoBook > 0) {
        try {
          await deps.notificar({
            type: "bookAuditado",
            message: fraseDaNotificacaoDoBook(nomeDoEvento, faltando, canceladasNoBook),
            eventId,
            // Quem monta a lista e o admin. O usuário do Kit fica de fora
            // sozinho: o sino dele só mostra aviso de peça do Kit dele.
            targetRoles: ["solicitacao", "admin"],
          });
        } catch (erro) {
          log.warn("[auditoria do book] concluída, mas o aviso no sino falhou", { id, erro: mensagem(erro) });
        }
      }
    } catch (erro) {
      log.error("[auditoria do book] falhou", { id, eventId, erro: mensagem(erro) });
      try {
        await deps.repo.falhar(id, "erro", mensagem(erro));
      } catch (e2) {
        log.error("[auditoria do book] nem o erro pôde ser gravado", { id, erro: mensagem(e2) });
      }
    } finally {
      try { deps.avisarTelas(eventId); } catch { /* cortesia */ }
    }
  }

  /** Põe na fila (uma vez só por id). Nunca lança. */
  function enfileirar(id: string): void {
    if (naFila.has(id)) return;
    naFila.add(id);
    cadeia = cadeia
      .then(() => processar(id))
      .catch((erro) => { log.error("[auditoria do book] erro inesperado na fila", { id, erro: mensagem(erro) }); })
      .finally(() => { naFila.delete(id); });
  }

  /**
   * Cria a auditoria do book recém-publicado e põe na fila. Feita para ser
   * chamada SEM await depois de gravar o book: nunca lança, nunca atrasa.
   */
  async function disparar(eventId: string, bookUrl: string): Promise<string | null> {
    try {
      const a = await deps.repo.criarAuditoria(eventId, bookUrl);
      try { deps.avisarTelas(eventId); } catch { /* cortesia */ }
      enfileirar(a.id);
      return a.id;
    } catch (erro) {
      log.error("[auditoria do book] não foi possível criar a auditoria", { eventId, erro: mensagem(erro) });
      return null;
    }
  }

  /**
   * O que a publicação do book chama (dono, 19/10 — custo): audita só o
   * PRIMEIRO book do evento. Reenvio não dispara; a auditoria do 1º book
   * continua valendo. Evento cuja auditoria deu "erro" ou ficou "sem_chave"
   * tenta de novo no próximo envio. Nunca lança.
   */
  async function dispararSePrimeiro(eventId: string, bookUrl: string): Promise<string | null> {
    try {
      if (await deps.repo.eventoJaTemAuditoria(eventId)) {
        log.info?.("[auditoria do book] reenvio — não audita de novo (só o 1º book)", { eventId });
        return null;
      }
    } catch (erro) {
      log.error("[auditoria do book] não foi possível saber se o evento já foi auditado", { eventId, erro: mensagem(erro) });
      return null;
    }
    return disparar(eventId, bookUrl);
  }

  /** Ao subir o servidor. Nunca lança. */
  async function retomar(): Promise<number> {
    try {
      const ids = await deps.repo.idsParaRetomar(!!deps.chave()?.trim());
      ids.forEach(enfileirar);
      if (ids.length) log.info?.(`[auditoria do book] ${ids.length} auditoria(s) retomada(s) ao subir`);
      return ids.length;
    } catch (erro) {
      log.warn("[auditoria do book] não foi possível retomar as pendentes", { erro: mensagem(erro) });
      return 0;
    }
  }

  /** Resolve quando a fila esvazia (testes e scripts). */
  const ocioso = async () => { for (let c = cadeia; ; c = cadeia) { await c; if (c === cadeia) return; } };

  return { processar, enfileirar, disparar, dispararSePrimeiro, retomar, ocioso };
}

export type FilaDoBook = ReturnType<typeof criarFila>;

// ── A fila de verdade, com o banco, o armazenamento e a API ──────────────────
let filaPadrao: FilaDoBook | null = null;

export function filaDoBook(): FilaDoBook {
  if (filaPadrao) return filaPadrao;
  filaPadrao = criarFila({
    repo: repoPadrao,
    chave: () => process.env.ANTHROPIC_API_KEY,
    carregarPecas: async (eventId) => {
      const { storage } = await import("../../storage");
      const [evento, itens, sponsors] = await Promise.all([
        storage.getEvent(eventId),
        storage.getItemsByEvent(eventId),
        storage.getAllSponsors(),
      ]);
      // As peças ATIVAS: fora da lixeira e não canceladas (a mesma régua do
      // book). As CANCELADAS vão à parte (dono, 19/10); as da lixeira, nunca.
      const naoExcluidas = itens.filter((i) => !i.deletedAt);
      const pecas = naoExcluidas.filter((i) => i.status !== "canceled");
      const canceladas = naoExcluidas.filter((i) => i.status === "canceled");
      const vinculos = await storage.getItemSponsorsByItemIds(naoExcluidas.map((p) => p.id));
      const nomeDoSponsor = new Map(sponsors.map((s) => [s.id, s.name]));
      const displayDoItem = new Map(naoExcluidas.map((p) => [p.id, p.displayId]));
      const patrocinadores = new Map<string, string[]>();
      for (const v of vinculos) {
        const d = displayDoItem.get(v.itemId);
        const nome = nomeDoSponsor.get(v.sponsorId);
        if (!d || !nome) continue;
        patrocinadores.set(d, [...(patrocinadores.get(d) ?? []), nome]);
      }
      return { nomeDoEvento: evento?.name ?? "Evento sem nome", pecas, canceladas, patrocinadores };
    },
    lerPdf: async (url) => (await import("./pdf")).lerPdfDoBook(url),
    contarPaginas: async (b) => (await import("./pdf")).contarPaginas(b),
    chamarIA: (o) => chamarIAPadrao(o),
    notificar: async (dados) => {
      const { storage } = await import("../../storage");
      const { broadcast } = await import("../../routes/shared");
      const notification = await storage.createNotification(dados);
      broadcast({ type: "notification_created", notification });
    },
    avisarTelas: (eventId) => {
      void import("../../routes/shared")
        .then(({ broadcast }) => broadcast({ type: "auditorias_do_book", eventId }))
        .catch(() => { /* cortesia */ });
    },
  });
  return filaPadrao;
}

/** Atalho para o book.ts: audita só o 1º book do evento; cria e enfileira, sem nunca lançar. */
export const dispararAuditoriaDoBook = (eventId: string, bookUrl: string) => filaDoBook().dispararSePrimeiro(eventId, bookUrl);
/** Atalho para o boot do servidor. */
export const retomarAuditoriasDoBook = () => filaDoBook().retomar();
