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
import { eq } from "drizzle-orm";
import { db } from "../db";
import { events, items } from "@shared/schema";
import { quantidadeEntregueParaChecklist } from "@shared/integracao-checklist";
import { urlDeThumbValida } from "./thumb-url";
import { cabecalhosDoObjeto } from "../upload-seguro";
import { obterMiniatura, type ArquivoComMetadados } from "../services/miniaturas";
import { listarEventosDoChecklist, montarEntreguesDoEvento } from "../services/checklist-entregues";

// A montagem das respostas mora no serviço, sem db no import — o script de
// exportação para a demo local (scripts/exportar-checklist.ts) usa a mesma.
export {
  JANELA_DE_EVENTOS_DIAS,
  compararVolumes,
  temImagemDaPeca,
  listarEventosDoChecklist,
  montarEntreguesDoEvento,
  type TuboDaPeca,
  type TuboDoEvento,
} from "../services/checklist-entregues";

/** Menos que isto não é segredo, é senha de post-it. */
export const TOKEN_MINIMO = 32;

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

const tipoLimpo = (ct: unknown): string => String(ct ?? "").split(";")[0].trim().toLowerCase();
const tipoDaArteAceito = (ct: string): boolean => (TIPOS_DA_ARTE as readonly string[]).includes(ct);

export function registerIntegracaoChecklistRoutes(app: Express): void {
  // Um `use` no prefixo, e não o middleware rota a rota: uma rota nova aqui
  // embaixo nasce protegida, sem depender de alguém lembrar.
  app.use("/api/integracao/checklist", exigirTokenDoChecklist);

  // ── 1. Eventos recentes com peça da Arena entregue ────────────────────────
  // A montagem mora em server/services/checklist-entregues.ts (o script de
  // exportação usa a mesma).
  app.get("/api/integracao/checklist/eventos", async (_req, res) => {
    try {
      res.json(await listarEventosDoChecklist(db));
    } catch (error) {
      console.error("[integracao-checklist] falha ao listar eventos:", error);
      res.status(500).json({ error: "Falha ao listar os eventos." });
    }
  });

  // ── 2. As peças entregues de um evento (com os tubos) ─────────────────────
  app.get("/api/integracao/checklist/eventos/:id/entregues", async (req, res) => {
    try {
      const resposta = await montarEntreguesDoEvento(db, req.params.id);
      if (!resposta) return res.status(404).json({ error: "Evento não encontrado." });
      res.json(resposta);
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
