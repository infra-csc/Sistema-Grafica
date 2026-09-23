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
import { and, eq, inArray, isNull, isNotNull, ne, notInArray, or, sql } from "drizzle-orm";
import { db } from "../db";
import { items as itemsTable, events, itemSponsors, itemSponsorApprovals, sponsors } from "@shared/schema";
import { pecaVisivelPara } from "@shared/kit";
import {
  normalizarTexto, palavrasDaBusca, ordenarArtes, arteForaDaBusca, aprovacaoDaArte,
  STATUS_FORA_DA_BUSCA_DE_ARTE, type ArteComparavel, type DecisaoDaArte,
} from "@shared/artes-parecidas";
import { requireRole } from "./shared";
import { urlDeThumbValida } from "./thumb-url";
import { doEventoNaoArquivado } from "../services/arquivamento";

// Mexer na Arte é de `arte` e `admin` (shared/permissoes.ts: update-thumb,
// update-final-file, submit-final-file, submit-for-approval). Quem não pode
// trocar a arte de uma peça não precisa vasculhar o acervo de artes.
// A régua declarada em shared/permissoes.ts cobre ESCRITA; esta é leitura, e
// por isso não ganha linha lá (o scanner só varre POST/PATCH/PUT/DELETE).
const requireArte = requireRole("admin", "arte");

/** Teto de payload: a tela mostra uma grade para escolher, não um acervo. */
const TETO_DE_RESULTADOS = 60;
/** Quantas linhas o banco entrega ao ranking, por consulta. */
const TETO_DE_CANDIDATAS = 600;

/** `lower` + `translate` dos acentos do português: a régua de
 *  `normalizarTexto`, só que dentro do SQL. `unaccent` não está instalado. */
const semAcentoSql = (expr: ReturnType<typeof sql>) =>
  sql`translate(lower(coalesce(${expr}, '')), 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn')`;

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
  fileWidth: itemsTable.fileWidth,
  fileHeight: itemsTable.fileHeight,
  eventId: itemsTable.eventId,
  eventName: events.name,
  eventInicio: events.startDate,
  status: itemsTable.status,
  rejectedBySponsor: itemsTable.rejectedBySponsor,
  rejectedByCreator: itemsTable.rejectedByCreator,
  sponsorApprovedBy: itemsTable.sponsorApprovedBy,
  sponsorApprovedAt: itemsTable.sponsorApprovedAt,
};

type Linha = {
  id: string; displayId: string | null; tipo: string; descricao: string | null;
  thumbUrl: string | null; previewUrl: string | null;
  arquivoFinalUrl: string | null; arquivoFinalNome: string | null;
  kitRemessaId: string | null; criadoPorId: string | null;
  fileWidth?: string | null; fileHeight?: string | null;
  eventId: string | null; eventName: string | null; eventInicio: Date | null;
  status?: string | null; rejectedBySponsor?: boolean | null; rejectedByCreator?: boolean | null;
  sponsorApprovedBy?: string | null; sponsorApprovedAt?: Date | null;
};

const temTexto = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;

/**
 * A régua do Kit (`pecaVisivelPara`) DENTRO do SQL (revisão 22/09). Antes o
 * filtro era só em memória, DEPOIS do LIMIT de 600: para o usuário do Kit o
 * teto enchia de peças que ele não vê e a grade chegava quase vazia. O filtro
 * em memória continua (a garantia não depende só do WHERE).
 */
export function recorteDoKitSql(usuario: { kit?: boolean | null; userId?: string | null }) {
  if (!usuario.kit) return [];
  if (!usuario.userId) return [sql`false`];
  return [
    isNotNull(itemsTable.kitRemessaId),
    sql`${itemsTable.kitRemessaId} <> ''`,
    eq(itemsTable.criadoPorId, usuario.userId),
  ];
}

/**
 * A ORDEM antes do LIMIT (revisão 22/09): sem ORDER BY o banco devolvia 600
 * linhas quaisquer, e o ranking em memória só enxergava esse sorteio. Primeiro
 * as do MESMO TIPO da peça alvo, depois as de evento mais recente.
 */
export const ordemDasCandidatas = (tipoAlvo: string) => [
  sql`(lower(${itemsTable.type}) = lower(${tipoAlvo})) desc`,
  sql`${events.startDate} desc nulls last`,
];

/** Só imagem do nosso storage vai para a grade (a mesma régua de quem grava o thumb). */
const imagemValida = (v: string | null | undefined): string | null => (temTexto(v) ? urlDeThumbValida(v) : null);

/** A medida como número (o decimal chega como texto: "2.50" = "2.5"). */
const numeroDaMedida = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
/** Mesmo tipo e mesma medida — a condição para o arquivo final de outra peça servir nesta. */
export const mesmaPecaFisica = (
  a: { tipo?: string | null; fileWidth?: unknown; fileHeight?: unknown },
  b: { tipo?: string | null; fileWidth?: unknown; fileHeight?: unknown },
): boolean =>
  normalizarTexto(a.tipo ?? "") === normalizarTexto(b.tipo ?? "")
  && numeroDaMedida(a.fileWidth) === numeroDaMedida(b.fileWidth)
  && numeroDaMedida(a.fileHeight) === numeroDaMedida(b.fileHeight);

export function registerArtesBuscaRoutes(app: Express) {
  app.get("/api/artes/busca", requireArte, async (req, res) => {
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

      // `comArquivoFinal`: quem abriu a busca a partir do CAMINHO DO ARQUIVO
      // FINAL só pode usar arte que tenha esse caminho. O corte é no SQL, e
      // não na tela, senão o teto de 60 sairia cheio de artes sem arquivo e a
      // grade chegaria quase vazia do outro lado.
      const soComArquivoFinal = req.query?.comArquivoFinal === "1";

      // O RECORTE É DO BANCO, O RANKING É DA MEMÓRIA (revisão de 21/09).
      // Antes cada tecla varria as ~5 mil peças com arte e ranqueava tudo.
      // Agora o SQL devolve só o que interessa:
      //   · COM `q`: as peças em que TODAS as palavras aparecem em descrição,
      //     tipo, código, nome do evento ou nome de patrocinador (subquery),
      //     comparando sem caixa e sem acento — `translate` no lugar de
      //     `unaccent`, que não está instalado no banco (só pg_trgm, ver
      //     scripts/criar-indices-de-busca.ts). O `casaComTermo` em memória
      //     refina com a mesma régua;
      //   · SEM `q`: as peças que DIVIDEM PATROCINADOR com a peça alvo (o caso
      //     do dono, em qualquer ano) mais as 600 mais recentes — o ranking
      //     acha o mesmo circuito ali dentro. Um teto sem o primeiro grupo
      //     esconderia justamente a arte do Bradesco de dois anos atrás.
      const base = [
        isNull(itemsTable.deletedAt),
        // Arte de evento arquivado não é sugerida: o evento sumiu das telas.
        doEventoNaoArquivado(itemsTable.eventId),
        // "Peça COM arte" = tem thumb de aprovação ou prévia do final. O
        // arquivo final sozinho não entra: sem imagem não há o que conferir
        // no olho antes de reaproveitar.
        or(
          and(isNotNull(itemsTable.approvalThumbUrl), sql`${itemsTable.approvalThumbUrl} <> ''`),
          and(isNotNull(itemsTable.finalPreviewUrl), sql`${itemsTable.finalPreviewUrl} <> ''`),
        ),
        ...(soComArquivoFinal
          ? [and(isNotNull(itemsTable.finalFileUrl), sql`${itemsTable.finalFileUrl} <> ''`)]
          : []),
        // O Kit ANTES do LIMIT (ver recorteDoKitSql).
        ...recorteDoKitSql(usuario),
        // Cancelada, rascunho e reprovada não servem de modelo — cortadas
        // antes do LIMIT para não ocuparem o teto. A mesma régua roda de novo
        // em memória (arteForaDaBusca), com as decisões por patrocinador.
        notInArray(sql`lower(${itemsTable.status})`, [...STATUS_FORA_DA_BUSCA_DE_ARTE]),
        eq(itemsTable.rejectedBySponsor, false),
        eq(itemsTable.rejectedByCreator, false),
        sql`not exists (select 1 from ${itemSponsorApprovals} r
                        where r.item_id = ${itemsTable.id} and r.status = 'rejected'
                          and (r.decided_thumb_url is null or r.decided_thumb_url = ${itemsTable.approvalThumbUrl}))`,
      ];
      const ordem = ordemDasCandidatas(alvo.tipo);

      // palavrasDaBusca (e não normalizarTexto): %, _ e a barra invertida
      // chegam até aqui e o escape abaixo vale — "50%" procura "50%", e "%"
      // sozinho não vira busca vazia (que devolvia tudo).
      const palavras = palavrasDaBusca(termo);
      let candidatas: Linha[];
      if (palavras.length > 0) {
        const texto = semAcentoSql(sql`concat_ws(' ', ${itemsTable.displayId}, ${itemsTable.description}, ${itemsTable.type}, ${events.name})`);
        const porPalavra = palavras.map((p) => {
          const padrao = `%${p.replace(/[%_\\]/g, "\\$&")}%`;
          return or(
            sql`${texto} like ${padrao}`,
            sql`exists (select 1 from ${itemSponsors} join ${sponsors} on ${sponsors.id} = ${itemSponsors.sponsorId}
                        where ${itemSponsors.itemId} = ${itemsTable.id} and ${semAcentoSql(sql`${sponsors.name}`)} like ${padrao})`,
          );
        });
        candidatas = await db.select(COLUNAS).from(itemsTable)
          .leftJoin(events, eq(events.id, itemsTable.eventId))
          .where(and(...base, ...porPalavra))
          .orderBy(...ordem)
          .limit(TETO_DE_CANDIDATAS);
      } else {
        const [doMesmoPatrocinador, recentes]: Linha[][] = await Promise.all([
          db.select(COLUNAS).from(itemsTable)
            .leftJoin(events, eq(events.id, itemsTable.eventId))
            .where(and(...base, sql`exists (select 1 from ${itemSponsors} a join ${itemSponsors} b on b.sponsor_id = a.sponsor_id
                                            where a.item_id = ${itemsTable.id} and b.item_id = ${alvo.id})`))
            .orderBy(...ordem)
            .limit(TETO_DE_CANDIDATAS),
          db.select(COLUNAS).from(itemsTable)
            .leftJoin(events, eq(events.id, itemsTable.eventId))
            .where(and(...base))
            .orderBy(...ordem)
            .limit(TETO_DE_CANDIDATAS),
        ]);
        const porId = new Map<string, Linha>();
        for (const c of [...doMesmoPatrocinador, ...recentes]) if (!porId.has(c.id)) porId.set(c.id, c);
        candidatas = Array.from(porId.values());
      }

      // Visível para quem pede E com imagem do nosso storage: uma URL de fora
      // não vira cartão (nem thumb gravado depois — a rota de gravação recusa).
      const comImagem = candidatas.filter((c) => pecaVisivelPara(usuario, c) && !!(imagemValida(c.thumbUrl) || imagemValida(c.previewUrl)));

      const vinculos: Array<{ itemId: string; sponsorId: string; nome: string | null }> = comImagem.length === 0
        ? []
        : await db.select({ itemId: itemSponsors.itemId, sponsorId: itemSponsors.sponsorId, nome: sponsors.name })
            .from(itemSponsors)
            .leftJoin(sponsors, eq(sponsors.id, itemSponsors.sponsorId))
            .where(inArray(itemSponsors.itemId, [...comImagem.map((c) => c.id), alvo.id]));

      // As decisões por patrocinador dizem se a arte está reprovada (sai) ou
      // aprovada (selo no cartão). Uma consulta só, pelo índice de item_id.
      const decisoes: Array<DecisaoDaArte & { itemId: string }> = comImagem.length === 0
        ? []
        : await db.select({
            itemId: itemSponsorApprovals.itemId,
            status: itemSponsorApprovals.status,
            approvedBy: itemSponsorApprovals.approvedBy,
            approvedAt: itemSponsorApprovals.approvedAt,
            decidedThumbUrl: itemSponsorApprovals.decidedThumbUrl,
          })
            .from(itemSponsorApprovals)
            .where(inArray(itemSponsorApprovals.itemId, comImagem.map((c) => c.id)));
      const decisoesPorPeca = new Map<string, DecisaoDaArte[]>();
      for (const d of decisoes) {
        const lista = decisoesPorPeca.get(d.itemId) ?? [];
        lista.push(d);
        decisoesPorPeca.set(d.itemId, lista);
      }
      const decisoesDe = (id: string) => decisoesPorPeca.get(id) ?? [];
      const visiveis = comImagem.filter((c) => !arteForaDaBusca(c, decisoesDe(c.id)));

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
          thumbUrl: imagemValida(a.linha.thumbUrl),
          previewUrl: imagemValida(a.linha.previewUrl),
          arquivoFinalUrl: temTexto(a.linha.arquivoFinalUrl) ? a.linha.arquivoFinalUrl : null,
          arquivoFinalNome: a.linha.arquivoFinalNome,
          temThumb: !!imagemValida(a.linha.thumbUrl),
          temPrevia: !!imagemValida(a.linha.previewUrl),
          temArquivoFinal: temTexto(a.linha.arquivoFinalUrl),
          mesmoPatrocinador: a.nota.mesmoPatrocinador,
          mesmoTipo: a.nota.mesmoTipo,
          eventoParecido: a.nota.eventoParecido,
          // Selo "Aprovada" no cartão: aprovadaPor/aprovadaEm quando houver.
          ...aprovacaoDaArte(a.linha, decisoesDe(a.linha.id)),
        })),
      });
    } catch (error) {
      console.error("[artes] erro ao buscar arte já feita:", error);
      res.status(500).json({ error: "Erro ao buscar artes" });
    }
  });

  // ── SUGESTÃO DO ARQUIVO FINAL (dono, 21/09) ───────────────────────────────
  //
  // "Caso eu tenha buscado a arte já feita, na hora da finalização aparece uma
  // sugestão do arquivo final da última peça — apenas sugestão."
  //
  // SEM COLUNA NOVA: a origem se descobre pela própria referência. Quem
  // reaproveitou uma arte aponta para a MESMA URL de thumb (ou de prévia) da
  // peça de onde ela veio — reaproveitar é referenciar, ver o topo deste
  // arquivo. Então: outra peça, não apagada, com a mesma URL e com o caminho
  // do arquivo final preenchido; a mais recente vence.
  //
  // NÃO HÁ PLANO B de propósito. Se nada casar pela URL a resposta é null —
  // nada de "mesmo patrocinador" ou "evento parecido": o dono pediu o arquivo
  // da peça DE ONDE A ARTE VEIO, e um caminho de rede chutado é pior que
  // campo vazio. E é só leitura: nada é gravado até o envio de sempre
  // (submit-final-file).
  app.get("/api/artes/sugestao-final", requireArte, async (req, res) => {
    try {
      const alvoId = typeof req.query?.item === "string" ? req.query.item : "";
      if (!alvoId) return res.status(400).json({ error: "Informe a peça (item)." });
      const usuario = { kit: req.userKit === true, userId: req.userId ?? null };

      const [alvo]: Linha[] = await db.select(COLUNAS).from(itemsTable)
        .leftJoin(events, eq(events.id, itemsTable.eventId))
        .where(and(eq(itemsTable.id, alvoId), isNull(itemsTable.deletedAt)));
      if (!alvo || !pecaVisivelPara(usuario, alvo)) {
        return res.status(404).json({ error: "Peça não encontrada" });
      }

      const urls = [alvo.thumbUrl, alvo.previewUrl].filter(temTexto);
      if (urls.length === 0) return res.json(null);

      const irmas: Array<Linha & { quando: Date | null }> = await db
        .select({ ...COLUNAS, quando: itemsTable.finalFileUpdatedAt })
        .from(itemsTable)
        .leftJoin(events, eq(events.id, itemsTable.eventId))
        .where(and(
          isNull(itemsTable.deletedAt),
          doEventoNaoArquivado(itemsTable.eventId),
          ne(itemsTable.id, alvo.id),
          isNotNull(itemsTable.finalFileUrl),
          sql`${itemsTable.finalFileUrl} <> ''`,
          or(inArray(itemsTable.approvalThumbUrl, urls), inArray(itemsTable.finalPreviewUrl, urls)),
          // MESMA PEÇA FÍSICA (revisão 22/09): uma arte compartilhada (o mesmo
          // thumb para o 2x1 e para o Rolo do evento) não pode sugerir o
          // arquivo final de uma peça de outro tipo ou outra medida — o
          // arquivo da Gráfica é de uma medida só. Mesmo tipo e mesma medida,
          // ou nada. De novo em memória abaixo (mesmaPecaFisica).
          sql`lower(${itemsTable.type}) = lower(${alvo.tipo})`,
          sql`${itemsTable.fileWidth} is not distinct from ${alvo.fileWidth ?? null}`,
          sql`${itemsTable.fileHeight} is not distinct from ${alvo.fileHeight ?? null}`,
        ))
        .orderBy(sql`${itemsTable.finalFileUpdatedAt} desc nulls last`)
        .limit(20);

      // O filtro do Kit e o "≠ a própria" de novo em memória: a régua de
      // visibilidade é uma função, não SQL, e o teste chama a rota com um
      // banco de mentira — a garantia não pode depender só do WHERE.
      const origem = irmas.find((c) => c.id !== alvo.id && temTexto(c.arquivoFinalUrl) && pecaVisivelPara(usuario, c) && mesmaPecaFisica(c, alvo));
      if (!origem) return res.json(null);

      res.json({
        finalFileUrl: origem.arquivoFinalUrl,
        finalFileName: origem.arquivoFinalNome,
        displayId: origem.displayId,
        tipo: origem.tipo,
        descricao: origem.descricao,
        evento: origem.eventName,
        quando: origem.quando,
      });
    } catch (error) {
      console.error("[artes] erro na sugestão do arquivo final:", error);
      res.status(500).json({ error: "Erro ao sugerir o arquivo final" });
    }
  });
}
