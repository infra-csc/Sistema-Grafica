// ─────────────────────────────────────────────────────────────────────────────
// BUSCAR ARTE JÁ FEITA (dono, 21/09).
//
// "Preciso ter como se fosse uma busca na arte para achar artes já feitas no
// app, para ele não precisar colocar o arquivo ou a thumb de novo e só
// referenciar — com o mesmo patrocinador e eventos 'parecidos', como
// Estações."
//
// Os eventos são circuitos que se repetem por praça ("Circuito das Estações
// 2026 Rio de Janeiro", "… São Paulo") e a arte do mesmo patrocinador se
// repete entre eles. Esta rota devolve as peças que JÁ TÊM arte, ranqueadas
// para a peça que está aberta na tela (shared/artes-parecidas.ts).
//
// ─── REFERENCIAR, E NÃO COPIAR: A DECISÃO DE ARMAZENAMENTO ───────────────────
//
// Reaproveitar grava no campo a MESMA URL `/objects/<id>` da peça de origem.
// Isso só é seguro se o arquivo não puder sumir debaixo da peça nova, e neste
// app ele não pode — foi conferido antes de escrever esta rota:
//   · NADA apaga objeto do bucket. `server/objectStorage.ts` não tem método de
//     apagar (só `searchPublicObject`, `downloadObject`, os dois de upload e o
//     de ACL), `signObjectURL` só é chamado com "PUT", e não existe rota
//     DELETE de objeto em `server/routes/objects.ts`;
//   · excluir peça é SOFT DELETE — `storage.deleteItem` só grava `deletedAt`,
//     e `restoreItem` desfaz. A linha (com a URL) continua lá; apagar o objeto
//     quebraria o próprio restaurar;
//   · trocar a arte GUARDA a URL anterior de propósito
//     (`previousApprovalThumbUrl`, `previousFinalFileUrl`) e ainda registra
//     uma versão em `item_art_versions`. O objeto velho continua servido.
// Logo: referência basta, e copiar o objeto seria duplicar bytes sem ganho.
// SE UM DIA alguém escrever uma limpeza de bucket, ela terá de contar quantas
// peças apontam para a URL antes de apagar — este comentário é o aviso.
//
// ─── O QUE ESTA ROTA NÃO FAZ ─────────────────────────────────────────────────
//
// Não grava nada. Ela só ACHA. Quem grava é o caminho de sempre
// (submit-for-approval / update-thumb / sponsor-approvals/resubmit /
// submit-final-file), com os mesmos efeitos, a mesma trilha e a mesma versão
// de arte — reaproveitar muda só a ORIGEM da URL, nunca a regra de negócio: a
// peça segue o fluxo normal de aprovação depois.
// ─────────────────────────────────────────────────────────────────────────────
import type { Express } from "express";
import { and, eq, inArray, isNull, isNotNull, or, sql } from "drizzle-orm";
import { db } from "../db";
import { items as itemsTable, events, itemSponsors, sponsors } from "@shared/schema";
import { pecaVisivelPara } from "@shared/kit";
import { ordenarArtes, type ArteComparavel } from "@shared/artes-parecidas";
import { requireRole } from "./shared";

// Mexer na Arte é de `arte` e `admin` (shared/permissoes.ts: update-thumb,
// update-final-file, submit-final-file, submit-for-approval). Quem não pode
// trocar a arte de uma peça não precisa vasculhar o acervo de artes.
// A régua declarada em shared/permissoes.ts cobre ESCRITA; esta é leitura, e
// por isso não ganha linha lá (o scanner só varre POST/PATCH/PUT/DELETE).
const requireArte = requireRole("admin", "arte");

/** Teto de payload: a tela mostra uma grade para escolher, não um acervo. */
const TETO_DE_RESULTADOS = 60;

const COLUNAS = {
  id: itemsTable.id,
  displayId: itemsTable.displayId,
  tipo: itemsTable.type,
  descricao: itemsTable.description,
  thumbUrl: itemsTable.approvalThumbUrl,
  previewUrl: itemsTable.finalPreviewUrl,
  arquivoFinalUrl: itemsTable.finalFileUrl,
  arquivoFinalNome: itemsTable.finalFileName,
  kitRemessaId: itemsTable.kitRemessaId,
  criadoPorId: itemsTable.criadoPorId,
  eventId: itemsTable.eventId,
  eventName: events.name,
  eventInicio: events.startDate,
};

type Linha = {
  id: string; displayId: string | null; tipo: string; descricao: string | null;
  thumbUrl: string | null; previewUrl: string | null;
  arquivoFinalUrl: string | null; arquivoFinalNome: string | null;
  kitRemessaId: string | null; criadoPorId: string | null;
  eventId: string | null; eventName: string | null; eventInicio: Date | null;
};

const temTexto = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;

export function registerArtesBuscaRoutes(app: Express) {
  app.get("/api/artes/busca", requireArte, async (req: any, res) => {
    try {
      const alvoId = typeof req.query?.item === "string" ? req.query.item : "";
      const termo = typeof req.query?.q === "string" ? req.query.q : "";
      if (!alvoId) return res.status(400).json({ error: "Informe a peça de destino (item)." });

      const usuario = { kit: req.userKit === true, userId: req.userId ?? null };

      const [alvo]: Linha[] = await db.select(COLUNAS).from(itemsTable)
        .leftJoin(events, eq(events.id, itemsTable.eventId))
        .where(and(eq(itemsTable.id, alvoId), isNull(itemsTable.deletedAt)));
      // O usuário do Kit só enxerga as peças dele: pedir sugestões para uma
      // peça que ele não vê é o mesmo que ela não existir.
      if (!alvo || !pecaVisivelPara(usuario, alvo)) {
        return res.status(404).json({ error: "Peça não encontrada" });
      }

      // As candidatas são TODAS as peças com arte, e não só as do mesmo
      // circuito: a arte que o dono quer reaproveitar pode estar num evento de
      // outro ano, com outro nome. São ~5 mil linhas de 13 colunas enxutas (a
      // lista inteira de peças, com evento e patrocinadores, é o que custava
      // 15 MB — ver shared/itens-compactos.ts); o ranking roda em memória e o
      // corte de 60 acontece antes de serializar.
      const candidatas: Linha[] = await db.select(COLUNAS).from(itemsTable)
        .leftJoin(events, eq(events.id, itemsTable.eventId))
        .where(and(
          isNull(itemsTable.deletedAt),
          // "Peça COM arte" = tem thumb de aprovação ou prévia do final. O
          // arquivo final sozinho não entra: sem imagem não há o que conferir
          // no olho antes de reaproveitar.
          or(
            and(isNotNull(itemsTable.approvalThumbUrl), sql`${itemsTable.approvalThumbUrl} <> ''`),
            and(isNotNull(itemsTable.finalPreviewUrl), sql`${itemsTable.finalPreviewUrl} <> ''`),
          ),
        ));

      // `comArquivoFinal`: quem abriu a busca a partir do CAMINHO DO ARQUIVO
      // FINAL só pode usar arte que tenha esse caminho. O corte é aqui, e não
      // na tela, senão o teto de 60 sairia cheio de artes sem arquivo e a
      // grade chegaria quase vazia do outro lado.
      const soComArquivoFinal = req.query?.comArquivoFinal === "1";
      const visiveis = candidatas.filter((c) =>
        pecaVisivelPara(usuario, c) && (!soComArquivoFinal || temTexto(c.arquivoFinalUrl)));

      const vinculos: Array<{ itemId: string; sponsorId: string; nome: string | null }> = visiveis.length === 0
        ? []
        : await db.select({ itemId: itemSponsors.itemId, sponsorId: itemSponsors.sponsorId, nome: sponsors.name })
            .from(itemSponsors)
            .leftJoin(sponsors, eq(sponsors.id, itemSponsors.sponsorId))
            .where(inArray(itemSponsors.itemId, [...visiveis.map((c) => c.id), alvo.id]));

      const porPeca = new Map<string, { ids: string[]; nomes: string[] }>();
      for (const v of vinculos) {
        let entrada = porPeca.get(v.itemId);
        if (!entrada) { entrada = { ids: [], nomes: [] }; porPeca.set(v.itemId, entrada); }
        entrada.ids.push(v.sponsorId);
        if (v.nome) entrada.nomes.push(v.nome);
      }
      const patrocinioDe = (id: string) => porPeca.get(id) ?? { ids: [], nomes: [] };

      const paraRanking = (l: Linha): ArteComparavel & { linha: Linha } => ({
        id: l.id,
        displayId: l.displayId,
        tipo: l.tipo,
        descricao: l.descricao,
        eventId: l.eventId,
        eventName: l.eventName,
        eventInicio: l.eventInicio ? l.eventInicio.toISOString() : null,
        sponsorIds: patrocinioDe(l.id).ids,
        sponsorNames: patrocinioDe(l.id).nomes,
        linha: l,
      });

      // Um a mais que o teto só para SABER se cortou: com `limite` exato, 60
      // resultados exatos e 600 dão a mesma lista, e a tela não teria como
      // avisar que sobrou coisa de fora.
      const comFolga = ordenarArtes(
        paraRanking(alvo),
        visiveis.map(paraRanking),
        { termo, limite: TETO_DE_RESULTADOS + 1 },
      );
      const cortou = comFolga.length > TETO_DE_RESULTADOS;
      const ordenadas = comFolga.slice(0, TETO_DE_RESULTADOS);

      res.json({
        alvo: {
          id: alvo.id,
          displayId: alvo.displayId,
          tipo: alvo.tipo,
          eventName: alvo.eventName,
          patrocinadores: patrocinioDe(alvo.id).nomes,
        },
        total: ordenadas.length,
        // Diz que houve corte: sem isto a tela mostra 60 cartões e quem
        // procura uma arte específica não sabe se ela ficou de fora.
        cortou,
        artes: ordenadas.map((a) => ({
          id: a.linha.id,
          displayId: a.linha.displayId,
          tipo: a.linha.tipo,
          descricao: a.linha.descricao,
          eventId: a.linha.eventId,
          eventName: a.linha.eventName,
          eventInicio: a.linha.eventInicio,
          patrocinadores: patrocinioDe(a.linha.id).nomes,
          thumbUrl: temTexto(a.linha.thumbUrl) ? a.linha.thumbUrl : null,
          previewUrl: temTexto(a.linha.previewUrl) ? a.linha.previewUrl : null,
          arquivoFinalUrl: temTexto(a.linha.arquivoFinalUrl) ? a.linha.arquivoFinalUrl : null,
          arquivoFinalNome: a.linha.arquivoFinalNome,
          temThumb: temTexto(a.linha.thumbUrl),
          temPrevia: temTexto(a.linha.previewUrl),
          temArquivoFinal: temTexto(a.linha.arquivoFinalUrl),
          mesmoPatrocinador: a.nota.mesmoPatrocinador,
          mesmoTipo: a.nota.mesmoTipo,
          eventoParecido: a.nota.eventoParecido,
        })),
      });
    } catch (error) {
      console.error("[artes] erro ao buscar arte já feita:", error);
      res.status(500).json({ error: "Erro ao buscar artes" });
    }
  });
}
