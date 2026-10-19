// ─────────────────────────────────────────────────────────────────────────────
// O QUE A IA RECEBE — instruções, a ferramenta que ela usa para responder e a
// lista de peças do evento em texto.
//
// As regras de casamento vêm da rodada feita à mão nos 22 books de 19/10 (59
// peças desenhadas sem cadastro, 40 divergências). O que mais pesou lá:
// casar pelo SENTIDO ("Primas Sinalização" × "Prisma Divulgação 1";
// "Testeiras tendas" × várias testeiras), comparar proporção da arte com a
// medida visual, e não confundir capa/abertura com peça.
//
// AS CANCELADAS VÃO JUNTO (dono, 19/10): os 15 "faltando" do Longevidade
// Manaus eram 13 peças CANCELADAS (patrocinador trocado), não esquecidas. Sem
// ver as canceladas, a IA chama de "faltando" o que existe e foi cancelado.
// As excluídas (lixeira) continuam fora.
// ─────────────────────────────────────────────────────────────────────────────
import type { Item } from "@shared/schema";

export const NOME_DA_FERRAMENTA = "registrar_auditoria";

export const INSTRUCOES = `Você audita books de aprovação de uma produtora de eventos esportivos (corridas, circuitos, ações de patrocinadores). O book é um PDF em que cada página mostra a arte de uma ou mais peças gráficas do evento (gradil, rolo, 2x1, pórtico, testeira, backdrop, windbanner, placa, prisma, adesivo, faixa, estande, quadro de fotos…), normalmente com uma legenda com o nome da estrutura. Junto vem a lista das peças cadastradas no sistema para o mesmo evento: as ATIVAS e, num bloco separado, as CANCELADAS (peça cancelada não é produzida — acontece, por exemplo, quando o patrocinador do evento é trocado).

Seu trabalho é achar o que está desenhado no book e NÃO tem cadastro ativo na lista (é a peça que alguém esqueceu de cadastrar, ou que foi cancelada, e que assim não é produzida), e apontar as peças que existem mas estão diferentes do book.

Como trabalhar:
1. Percorra o book página a página. Capa, abertura, índice, mapa ou planta geral do evento, contracapa e páginas só de texto NÃO são peças. Uma página pode ter várias peças (um gradil com 7 patrocinadores são 7 artes) e uma peça pode ocupar mais de uma página. Use o número da página do PDF (a capa é a página 1).
2. Para cada peça do book, procure a correspondente na lista pelo SENTIDO, não pelo nome. Compare: o tipo de estrutura; o formato/proporção da arte com a medida visual LxA da lista; a medida quando aparece; os logos e patrocinadores; o texto da arte; o número de variações. Nomes diferentes podem ser a mesma peça: "Primas Sinalização" no book é "Prisma Divulgação 1" na lista; "Testeiras tendas" pode ser várias peças "Testeira …"; "Gradil" no book costuma ser peça do tipo 2x1; "Placa km" pode estar como "Placa de percurso" ou "Prisma". Uma peça da lista com quantidade maior que 1 cobre várias cópias iguais da mesma arte.
3. Se houver correspondente ATIVA, a peça está encontrada (mesmo que exista também uma cancelada parecida).
4. Se a única correspondente estiver entre as CANCELADAS → cancelada_no_app, com os números das peças canceladas em ids. Não registre essa peça como faltando.
5. Sem nenhuma correspondente, nem ativa nem cancelada → faltando_no_app. Confiança:
   - alta: não há nada parecido na lista;
   - media: há algo vagamente parecido, mas provavelmente é outra peça;
   - baixa: dúvida real (pode ser reaproveitamento de outra etapa, peça de outro fornecedor, ou cadastro com nome muito diferente). Na dúvida real, registre como faltando com confiança baixa e cite em candidata_mais_proxima a peça ativa mais parecida, com o número e a descrição ("#7104 painel em lona 3.9x2.9").
6. Divergência: a peça ATIVA existe na lista, mas o book mostra algo claramente diferente — medida ou proporção (diferença maior que uns 15%), patrocinador ou logo diferente (inclusive logo antigo × novo), texto, número de variações. Liste em ids os números das peças como aparecem na lista (com #).
7. Não reporte peça da lista que não aparece no book: o book não precisa mostrar tudo.
8. Escreva peca_no_book e detalhe em português do Brasil, de forma específica: o que a arte mostra, e por que nenhuma peça da lista serve. Não invente número de peça que não está na lista.
9. pecas_no_book é quantas peças/artes distintas o book mostra; encontradas_no_app é quantas delas têm correspondente ATIVA na lista.
10. Responda chamando a ferramenta ${NOME_DA_FERRAMENTA} uma única vez, com o resultado completo. Não escreva o resultado em texto.`;

/** A ferramenta é o formato da resposta: a IA "registra" a auditoria nela. */
export const FERRAMENTA = {
  name: NOME_DA_FERRAMENTA,
  description: "Registra o resultado da auditoria do book: as peças desenhadas sem cadastro ativo na lista, as que estão canceladas, as divergências e a contagem.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["faltando_no_app", "cancelada_no_app", "divergencias", "pecas_no_book", "encontradas_no_app", "observacoes"],
    properties: {
      faltando_no_app: {
        type: "array",
        description: "Peças desenhadas no book sem nenhuma correspondente na lista (nem ativa nem cancelada).",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["pagina", "peca_no_book", "detalhe", "confianca", "candidata_mais_proxima"],
          properties: {
            pagina: { type: "integer", description: "Página do PDF (a capa é 1)." },
            peca_no_book: { type: "string", description: "A peça como o book mostra (estrutura, patrocinador, variação)." },
            detalhe: { type: "string", description: "O que a arte mostra e por que nenhuma peça da lista serve." },
            confianca: { type: "string", enum: ["alta", "media", "baixa"] },
            candidata_mais_proxima: {
              type: ["string", "null"],
              description: "Na dúvida (confiança baixa), a peça ativa mais parecida: número e descrição. Senão, null.",
            },
          },
        },
      },
      cancelada_no_app: {
        type: "array",
        description: "Peças desenhadas no book cuja única correspondente na lista está CANCELADA.",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["pagina", "peca_no_book", "ids", "detalhe"],
          properties: {
            pagina: { type: "integer" },
            peca_no_book: { type: "string" },
            ids: { type: "array", items: { type: "string" }, description: "Números das peças CANCELADAS correspondentes (ex.: \"#8040\")." },
            detalhe: { type: "string", description: "Por que é essa peça (curto)." },
          },
        },
      },
      divergencias: {
        type: "array",
        description: "Peças ATIVAS que existem na lista mas diferem do book.",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["pagina", "ids", "no_book", "no_app"],
          properties: {
            pagina: { type: "integer" },
            ids: { type: "array", items: { type: "string" }, description: "Números das peças da lista (ex.: \"#6524\")." },
            no_book: { type: "string", description: "O que o book mostra." },
            no_app: { type: "string", description: "O que a lista diz." },
          },
        },
      },
      pecas_no_book: { type: "integer", description: "Quantas peças/artes distintas o book mostra." },
      encontradas_no_app: { type: "integer", description: "Quantas delas têm correspondente ATIVA na lista." },
      observacoes: { type: "string", description: "Resumo curto para quem monta a lista (pode ser vazio)." },
    },
  },
} as const;

type PecaDaLista = Pick<Item, "displayId" | "type" | "description" | "quantity" | "visualWidth" | "visualHeight" | "material" | "status">;

const medida = (l: string | null | undefined, a: string | null | undefined): string => {
  const n = (v: string | null | undefined) => (v == null || v === "" ? null : String(Number(v)));
  const ln = n(l);
  const an = n(a);
  return ln && an ? `${ln}x${an}` : "sem medida";
};

const limpo = (s: string | null | undefined) => (s ?? "").replace(/[\r\n|]+/g, " ").replace(/\s+/g, " ").trim();

/** "#8040 2x1 Bradesco Seguros" — como a tela mostra uma peça cancelada. */
export function rotuloDaPeca(p: Pick<Item, "displayId" | "type" | "description">): string {
  const tipo = limpo(p.type);
  const desc = limpo(p.description);
  // "2x1" + "2x1 Bradesco Seguros" não vira "2x1 2x1 Bradesco Seguros".
  const repete = !!tipo && desc.toLowerCase().startsWith(tipo.toLowerCase());
  return [p.displayId, repete ? "" : tipo, desc].filter(Boolean).join(" ");
}

function linhasDe(pecas: PecaDaLista[], patrocinadoresDaPeca: (displayId: string) => string[], canceladas: boolean): string[] {
  return [...pecas]
    .sort((a, b) => limpo(a.type).localeCompare(limpo(b.type), "pt-BR") || limpo(a.description).localeCompare(limpo(b.description), "pt-BR"))
    .map((p) => [
      p.displayId,
      limpo(p.type) || "—",
      limpo(p.description) || "—",
      `qtd ${p.quantity}`,
      medida(p.visualWidth, p.visualHeight),
      limpo(p.material) || "—",
      canceladas ? "CANCELADA" : p.status,
      patrocinadoresDaPeca(p.displayId).join(", ") || "sem patrocinador",
    ].join(" | "));
}

/**
 * A lista em texto, uma peça por linha:
 * `#6525 | 2x1 | 2x1 Alçando Voos | qtd 8 | 1.9x0.9 | SANETT | conferred | Ministério`.
 * As canceladas vêm num bloco à parte, com o status "CANCELADA".
 */
export function montarListaDePecas(
  nomeDoEvento: string,
  pecas: PecaDaLista[],
  patrocinadoresDaPeca: (displayId: string) => string[],
  canceladas: PecaDaLista[] = [],
): string {
  const ativas = linhasDe(pecas, patrocinadoresDaPeca, false);
  const linhasCanceladas = linhasDe(canceladas, patrocinadoresDaPeca, true);
  return [
    `EVENTO: ${limpo(nomeDoEvento)}`,
    `PEÇAS ATIVAS NO SISTEMA (${pecas.length}):`,
    "id | tipo | descrição | qtd | medida visual LxA (m) | material | status | patrocinadores",
    ...(ativas.length ? ativas : ["(nenhuma peça ativa cadastrada)"]),
    "",
    `PEÇAS CANCELADAS NO SISTEMA (${canceladas.length}) — não serão produzidas:`,
    ...(linhasCanceladas.length ? linhasCanceladas : ["(nenhuma)"]),
  ].join("\n");
}
