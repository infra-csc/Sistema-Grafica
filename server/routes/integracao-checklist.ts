// ─────────────────────────────────────────────────────────────────────────────
// INTEGRAÇÃO COM O CHECKLIST DE ARENA — leitura, e só leitura.
//
// O Checklist de Arena é outro app: na montagem do evento, ele confere peça a
// peça o que a Gráfica entregou. Ele precisa de duas perguntas respondidas:
//   1. quais eventos recentes têm peça da Arena entregue;
//   2. dentro de um evento, quais peças foram entregues, quantas, e em quais
//      volumes (tubos) elas saíram — com a quantidade de cada peça EM CADA
//      volume, para a conferência em dois passos da arena: (a) quais tubos
//      chegaram; (b) aberto o tubo, conta-se o que a Gráfica pôs nele.
// E, para o montador reconhecer a peça no chão, a ARTE dela (a miniatura),
// pedida peça a peça pelo id.
// A regra do que conta como "entregue" mora em shared/integracao-checklist.ts.
//
// POR QUE UM TOKEN E NÃO A SESSÃO: quem chama é um SERVIDOR, não uma pessoa.
// Dar ao Checklist um login de usuário seria dar a ele tudo o que aquele
// usuário vê e escreve. O token abre só estas rotas, só para GET, e é trocado
// sem mexer em conta de ninguém. Sem o token configurado (ou curto demais), a
// integração fica DESLIGADA — falha fechada: melhor o Checklist parar do que
// um segredo fraco abrir a lista de peças de todos os eventos.
//
// Os middlewares globais (server/routes.ts) não atrapalham um GET sem sessão:
// validarSessao só age quando há sessão; as travas do Kit e da Solicitação só
// olham escrita ou usuário logado; CSRF e o limitador de escrita (index.ts)
// ignoram GET. E o express-session não cria cookie (saveUninitialized: false).
// ─────────────────────────────────────────────────────────────────────────────
import type { Express, Request, Response, NextFunction } from "express";
import { createHash, timingSafeEqual } from "crypto";
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, notInArray, or, sql, gt } from "drizzle-orm";
import { db } from "../db";
import { events, items, standardItems, tubos, tuboItens } from "@shared/schema";
import { STATUS_ENTREGUES, STATUS_FORA_DO_FUNIL } from "@shared/fluxo-peca";
import {
  compararComoARevisaoFinal,
  grupoPorTipo,
  quantidadeEntregueParaChecklist,
} from "@shared/integracao-checklist";
import { urlDeThumbValida } from "./thumb-url";
import { cabecalhosDoObjeto } from "../upload-seguro";
import { obterMiniatura, type ArquivoComMetadados } from "../services/miniaturas";

/** Menos que isto não é segredo, é senha de post-it. */
export const TOKEN_MINIMO = 32;
/** Janela da lista de eventos: a montagem é agora, não o acervo inteiro. */
export const JANELA_DE_EVENTOS_DIAS = 120;

export const MSG_INTEGRACAO_DESATIVADA = "Integração com o Checklist desativada.";
export const MSG_TOKEN_INVALIDO = "Token de integração inválido.";

export type ResultadoDoToken = "desativada" | "recusado" | "ok";

const digest = (s: string) => createHash("sha256").update(s, "utf8").digest();

/**
 * Confere o cabeçalho `Authorization: Bearer <token>` contra o token
 * configurado. Compara os DIGESTS (sha256), não os textos: os dois lados têm
 * sempre 32 bytes, então `timingSafeEqual` não lança por tamanho diferente e
 * o tempo da comparação não revela nem o conteúdo nem o comprimento do token.
 */
export function conferirTokenDaIntegracao(
  cabecalho: string | undefined,
  esperado: string | undefined,
): ResultadoDoToken {
  if (!esperado || esperado.length < TOKEN_MINIMO) return "desativada";
  const m = /^Bearer\s+(\S+)\s*$/i.exec(cabecalho ?? "");
  // Sem cabeçalho ainda passa pela comparação: o "não mandou" e o "mandou
  // errado" levam o mesmo tempo.
  const recebido = m ? m[1] : "";
  return timingSafeEqual(digest(recebido), digest(esperado)) ? "ok" : "recusado";
}

/**
 * Middleware. Lê a variável a cada requisição, e não no import: sem ela o
 * servidor sobe normalmente (só esta integração fica desligada).
 */
export function exigirTokenDoChecklist(req: Request, res: Response, next: NextFunction) {
  // Nada daqui pode parar num cache (proxy, navegador): é a lista de peças.
  res.setHeader("Cache-Control", "no-store");
  const resultado = conferirTokenDaIntegracao(req.headers.authorization, process.env.CHECKLIST_INTEGRACAO_TOKEN);
  if (resultado === "ok") return next();
  // O log diz QUEM bateu e POR QUE foi recusado — nunca o token recebido.
  const motivo = resultado === "desativada"
    ? "integração desativada (CHECKLIST_INTEGRACAO_TOKEN ausente ou curto)"
    : req.headers.authorization ? "token errado" : "sem token";
  console.warn(`[integracao-checklist] recusado: ${motivo} — ${req.method} ${req.baseUrl}${req.path} de ${req.ip || "?"}`);
  if (resultado === "desativada") return res.status(503).json({ error: MSG_INTEGRACAO_DESATIVADA });
  return res.status(401).json({ error: MSG_TOKEN_INVALIDO });
}

/**
 * O "book completo" em SQL: o mesmo padrão de `ehBookCompleto`
 * (/book[\s_-]*completo/i), escrito na sintaxe de regex do Postgres.
 */
const BOOK_COMPLETO_SQL = "book[[:space:]_-]*completo";

/** A conta de quantidadeEntregueParaChecklist, na linguagem do banco. */
const quantidadeEntregueSql = sql`(case
  when ${inArray(items.status, [...STATUS_ENTREGUES])} and coalesce(${items.deliveredQty}, 0) = 0 then ${items.quantity}
  else least(coalesce(${items.deliveredQty}, 0), ${items.quantity})
end)`;

const iso = (d: Date | string | null | undefined): string | null => (d ? new Date(d).toISOString() : null);

// ── A arte da peça (thumb) ──────────────────────────────────────────────────
/** O id da peça é UUID (gen_random_uuid). Fora disso nem vai ao banco. */
export const ID_DE_PECA = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** O que a rota da arte aceita devolver. Qualquer outro tipo é 404. */
export const TIPOS_DA_ARTE = ["image/webp", "image/png", "image/jpeg", "image/gif"] as const;
/**
 * Sem miniatura (sharp ausente, geração falhou), o ORIGINAL só sai se for
 * imagem pequena: o Checklist pinta a arte numa caixa de celular, muitas vezes
 * no 4G do pavilhão — um original de 20 MB por peça não é "miniatura".
 */
export const TETO_DO_ORIGINAL_NA_INTEGRACAO = 1024 * 1024;
/** Mesmo cache da miniatura de /objects: privado (nada de proxy), um dia. */
export const CACHE_DA_ARTE = "private, max-age=86400";

/** Tem arte que a rota da thumb consegue servir (um objeto do nosso storage). */
export const temImagemDaPeca = (approvalThumbUrl: string | null | undefined): boolean =>
  urlDeThumbValida(approvalThumbUrl) !== null;

const tipoLimpo = (ct: unknown): string => String(ct ?? "").split(";")[0].trim().toLowerCase();
const tipoDaArteAceito = (ct: string): boolean => (TIPOS_DA_ARTE as readonly string[]).includes(ct);

// ── Os volumes (tubos e avulsos) na lista de entregues ──────────────────────
/** Uma linha de volume da peça: quantas unidades dela foram NAQUELE volume. */
export type TuboDaPeca = { tuboId: string; numero: number; quantidade: number };
/** O cabeçalho de um volume entregue, com o que ele leva de peças listadas. */
export type TuboDoEvento = {
  id: string;
  numero: number;
  avulso: boolean;
  entregueEm: string | null;
  recebidoPor: string | null;
  /** Linhas (peças) entregues dentro dele. */
  linhas: number;
  /** Soma das quantidades dessas linhas. */
  unidades: number;
  /** Quantas fotos de fechamento o volume tem. */
  fotos: number;
};

/**
 * Ordem dos volumes: tubos (número positivo) em ordem crescente, depois os
 * avulsos (número negativo) por valor absoluto — Tubo 1, 2, 3, Avulso 1, 2.
 */
export function compararVolumes(a: { numero: number }, b: { numero: number }): number {
  const avulsoA = a.numero < 0 ? 1 : 0;
  const avulsoB = b.numero < 0 ? 1 : 0;
  if (avulsoA !== avulsoB) return avulsoA - avulsoB;
  return Math.abs(a.numero) - Math.abs(b.numero);
}

export function registerIntegracaoChecklistRoutes(app: Express): void {
  // Um `use` no prefixo, e não o middleware rota a rota: uma rota nova aqui
  // embaixo nasce protegida, sem depender de alguém lembrar.
  app.use("/api/integracao/checklist", exigirTokenDoChecklist);

  // ── 1. Eventos recentes com peça da Arena entregue ────────────────────────
  // Agregado no banco: um evento grande tem centenas de peças, e trazer todas
  // para contar em JS seria pagar a lista inteira para devolver um número.
  app.get("/api/integracao/checklist/eventos", async (_req, res) => {
    try {
      const corte = new Date(Date.now() - JANELA_DE_EVENTOS_DIAS * 24 * 60 * 60 * 1000);
      const linhas = await db
        .select({
          id: events.id,
          nome: events.name,
          inicio: events.startDate,
          saidaCaminhao: events.truckDepartureDate,
          status: events.status,
          // Peças (linhas), não unidades: é o que o Checklist lista.
          pecasEntregues: sql<number>`count(*)::int`,
        })
        .from(events)
        .innerJoin(items, eq(items.eventId, events.id))
        .where(and(
          gte(events.startDate, corte),
          isNull(items.deletedAt),
          isNull(items.kitRemessaId),
          notInArray(items.status, [...STATUS_FORA_DO_FUNIL]),
          sql`${items.type} !~* ${BOOK_COMPLETO_SQL}`,
          sql`${quantidadeEntregueSql} > 0`,
        ))
        // events.id é a chave: o Postgres aceita as outras colunas do evento.
        .groupBy(events.id)
        .orderBy(desc(events.startDate));

      res.json({
        eventos: linhas.map((e) => ({
          id: e.id,
          nome: e.nome,
          inicio: iso(e.inicio),
          saidaCaminhao: iso(e.saidaCaminhao),
          status: e.status,
          pecasEntregues: Number(e.pecasEntregues),
        })),
      });
    } catch (error) {
      console.error("[integracao-checklist] falha ao listar eventos:", error);
      res.status(500).json({ error: "Falha ao listar os eventos." });
    }
  });

  // ── 2. As peças entregues de um evento ────────────────────────────────────
  // Um evento só: aqui a regra roda em JS (a função pura), sobre as peças já
  // recortadas pelo banco no que é barato recortar.
  app.get("/api/integracao/checklist/eventos/:id/entregues", async (req, res) => {
    try {
      const [evento] = await db
        .select({
          id: events.id,
          nome: events.name,
          inicio: events.startDate,
          saidaCaminhao: events.truckDepartureDate,
          status: events.status,
        })
        .from(events)
        .where(eq(events.id, req.params.id))
        .limit(1);
      if (!evento) return res.status(404).json({ error: "Evento não encontrado." });

      const candidatas = await db
        .select({
          id: items.id,
          displayId: items.displayId,
          type: items.type,
          description: items.description,
          material: items.material,
          finish: items.finish,
          measurement: items.measurement,
          quantity: items.quantity,
          deliveredQty: items.deliveredQty,
          status: items.status,
          deliveredAt: items.deliveredAt,
          receivedBy: items.receivedBy,
          deletedAt: items.deletedAt,
          kitRemessaId: items.kitRemessaId,
          approvalThumbUrl: items.approvalThumbUrl,
        })
        .from(items)
        .where(and(
          eq(items.eventId, evento.id),
          isNull(items.deletedAt),
          isNull(items.kitRemessaId),
          // Pré-filtro: só quem PODE ter algo entregue. A decisão é da função.
          or(gt(items.deliveredQty, 0), inArray(items.status, [...STATUS_ENTREGUES])),
        ));

      const entregues = candidatas
        .map((p) => ({ p, qtd: quantidadeEntregueParaChecklist(p) }))
        .filter((x) => x.qtd > 0);
      const ids = entregues.map((x) => x.p.id);
      const tipos = Array.from(new Set(entregues.map((x) => x.p.type)));

      // UMA consulta traz as linhas entregues (peça × volume × quantidade) E o
      // cabeçalho do volume de cada linha: dela saem `volumes`, os `tubos` da
      // peça e a lista `tubos` do topo — sem uma consulta por tubo.
      const [linhasDeVolume, modelos] = await Promise.all([
        ids.length === 0 ? Promise.resolve([]) : db
          .select({
            itemId: tuboItens.itemId,
            tuboId: tubos.id,
            numero: tubos.numero,
            quantidade: tuboItens.quantidade,
            linhaEntregueEm: tuboItens.entregueEm,
            avulso: tubos.avulso,
            tuboEntregueEm: tubos.entregueEm,
            tuboRecebidoPor: tubos.recebidoPor,
            // Só a contagem: as fotos em si não saem por esta integração.
            fotos: sql<number>`coalesce(cardinality(${tubos.fotosFechamento}), 0)::int`,
          })
          .from(tuboItens)
          .innerJoin(tubos, eq(tubos.id, tuboItens.tuboId))
          .where(and(inArray(tuboItens.itemId, ids), isNotNull(tuboItens.entregueEm)))
          .orderBy(asc(tubos.numero)),
        tipos.length === 0 ? Promise.resolve([]) : db
          .select({ id: standardItems.id, name: standardItems.name, group: standardItems.group, createdAt: standardItems.createdAt })
          .from(standardItems)
          .where(inArray(standardItems.name, tipos)),
      ]);

      const volumesDaPeca = new Map<string, Set<number>>();
      const tubosDaPeca = new Map<string, TuboDaPeca[]>();
      const tubosDoEvento = new Map<string, TuboDoEvento>();
      const listadas = new Set(ids);
      for (const v of linhasDeVolume) {
        // O banco já recorta; a guarda repete a regra aqui para que um tubo
        // nunca apareça por linha não entregue ou de peça fora de `itens`.
        if (!v.linhaEntregueEm || !listadas.has(v.itemId)) continue;
        const numero = Number(v.numero);
        const quantidade = Number(v.quantidade);
        if (!volumesDaPeca.has(v.itemId)) volumesDaPeca.set(v.itemId, new Set());
        volumesDaPeca.get(v.itemId)!.add(numero);
        if (!tubosDaPeca.has(v.itemId)) tubosDaPeca.set(v.itemId, []);
        tubosDaPeca.get(v.itemId)!.push({ tuboId: v.tuboId, numero, quantidade });
        let t = tubosDoEvento.get(v.tuboId);
        if (!t) {
          t = {
            id: v.tuboId,
            numero,
            avulso: Boolean(v.avulso),
            entregueEm: iso(v.tuboEntregueEm),
            recebidoPor: v.tuboRecebidoPor ?? null,
            linhas: 0,
            unidades: 0,
            fotos: Number(v.fotos ?? 0),
          };
          tubosDoEvento.set(v.tuboId, t);
        }
        t.linhas += 1;
        t.unidades += quantidade;
      }
      const grupos = grupoPorTipo(modelos);

      const itens = entregues.map(({ p, qtd }) => ({
        id: p.id,
        codigo: p.displayId,
        grupo: grupos.get(p.type) ?? null,
        tipo: p.type,
        descricao: p.description ?? null,
        material: p.material,
        acabamento: p.finish,
        medida: p.measurement,
        quantidade: p.quantity,
        quantidadeEntregue: qtd,
        status: p.status,
        entregueEm: iso(p.deliveredAt),
        recebidoPor: p.receivedBy ?? null,
        // Número do volume; avulso tem número NEGATIVO (−1, −2: ver tubos).
        volumes: Array.from(volumesDaPeca.get(p.id) ?? []).sort((a, b) => a - b),
        // Em qual volume, e QUANTAS unidades dela em cada um (a contagem do
        // tubo aberto na arena). Sem linha de volume entregue: [] ("Sem tubo").
        tubos: (tubosDaPeca.get(p.id) ?? []).sort(compararVolumes),
        // A arte vem por GET /api/integracao/checklist/itens/:itemId/thumb.
        temImagem: temImagemDaPeca(p.approvalThumbUrl),
      }));
      itens.sort(compararComoARevisaoFinal);

      res.json({
        evento: {
          id: evento.id,
          nome: evento.nome,
          inicio: iso(evento.inicio),
          saidaCaminhao: iso(evento.saidaCaminhao),
          status: evento.status,
        },
        geradoEm: new Date().toISOString(),
        itens,
        // Os volumes com ao menos uma linha entregue de peça listada em
        // `itens` — o Checklist nunca mostra tubo vazio.
        tubos: Array.from(tubosDoEvento.values()).sort(compararVolumes),
      });
    } catch (error) {
      console.error("[integracao-checklist] falha ao listar peças entregues:", error);
      res.status(500).json({ error: "Falha ao listar as peças entregues." });
    }
  });

  // ── 3. A arte (miniatura) de uma peça entregue ───────────────────────────
  // Endereçada SÓ pelo id da peça: o caminho no storage sai do banco, nunca da
  // URL — quem tem o token não navega pelo bucket. E só peça que a rota 2
  // listaria (a mesma regra), para o token não virar leitor da arte de
  // qualquer peça de qualquer evento.
  // Sem sessão, não há ACL de usuário a conferir: quem autoriza é o token.
  app.get("/api/integracao/checklist/itens/:itemId/thumb", async (req, res) => {
    const itemId = String(req.params.itemId ?? "");
    if (!ID_DE_PECA.test(itemId)) return res.status(400).json({ erro: "Id de peça inválido." });
    try {
      const [p] = await db
        .select({
          id: items.id,
          type: items.type,
          quantity: items.quantity,
          deliveredQty: items.deliveredQty,
          status: items.status,
          deletedAt: items.deletedAt,
          kitRemessaId: items.kitRemessaId,
          approvalThumbUrl: items.approvalThumbUrl,
        })
        .from(items)
        // Como na rota 2: a peça pertence a um evento que existe.
        .innerJoin(events, eq(events.id, items.eventId))
        .where(eq(items.id, itemId))
        .limit(1);
      if (!p || quantidadeEntregueParaChecklist(p) <= 0) {
        return res.status(404).json({ erro: "Peça entregue não encontrada." });
      }
      const caminho = urlDeThumbValida(p.approvalThumbUrl);
      if (!caminho) return res.status(404).json({ erro: "A peça não tem arte." });

      const { ObjectStorageService, ObjectNotFoundError } = await import("../objectStorage");
      const servico = new ObjectStorageService();
      let arquivo: Awaited<ReturnType<typeof servico.getObjectEntityFile>>;
      try {
        arquivo = await servico.getObjectEntityFile(caminho);
      } catch (e) {
        if (e instanceof ObjectNotFoundError) return res.status(404).json({ erro: "A arte da peça não está no storage." });
        throw e;
      }

      const enviar = (bytes: Buffer, tipo: string) => {
        res.set({
          ...cabecalhosDoObjeto(tipo),
          "Content-Type": tipo,
          "Content-Length": String(bytes.length),
          // Sobrepõe o no-store do middleware SÓ nesta rota: é a arte, não a
          // lista de peças, e o celular no pavilhão agradece o cache.
          "Cache-Control": CACHE_DA_ARTE,
          "X-Content-Type-Options": "nosniff",
        });
        return res.status(200).end(bytes);
      };

      // A mesma miniatura do /objects/...?thumb=1 (gravada, ou gerada a pedido).
      const mini = await obterMiniatura(arquivo as unknown as ArquivoComMetadados, caminho);
      if (mini) return enviar(mini, "image/webp");

      // Plano C: o original — só imagem da lista, e pequeno.
      const [metadata] = await arquivo.getMetadata();
      const tipo = tipoLimpo(metadata.contentType);
      const tamanho = Number(metadata.size ?? 0);
      if (!tipoDaArteAceito(tipo) || !(tamanho > 0) || tamanho > TETO_DO_ORIGINAL_NA_INTEGRACAO) {
        return res.status(404).json({ erro: "A peça não tem miniatura de imagem." });
      }
      const [original] = await arquivo.download();
      return enviar(original, tipo);
    } catch (error) {
      console.error("[integracao-checklist] falha ao servir a arte da peça:", error);
      res.status(500).json({ erro: "Falha ao carregar a arte da peça." });
    }
  });

  // O resto do prefixo responde em JSON aqui mesmo. Sem isto, um caminho
  // errado (ou um POST) cairia no index.html do app com 200 — e o Checklist
  // leria HTML achando que é resposta. A integração é só leitura: 405 fora do GET.
  app.use("/api/integracao/checklist", (req, res) => {
    if (req.method !== "GET") return res.status(405).json({ error: "A integração com o Checklist é só leitura." });
    res.status(404).json({ error: "Rota da integração não encontrada." });
  });
}
