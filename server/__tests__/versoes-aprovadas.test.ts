// ─────────────────────────────────────────────────────────────────────────────
// VERSÕES APROVADAS — qual versão cada patrocinador aprovou, de qual peça, e
// os books de cada evento com história baixável.
//
// Pedido do dono (21/08/2026). O diagnóstico que motivou a tela, em produção:
//   · 2.209 aprovações sem registro de QUAL thumb foi aprovado;
//   · 192 trocas de thumb vivendo só no texto da trilha de auditoria;
//   · 32 books, um por evento — só o ATUAL (a rota apaga o anterior).
//
// ── A REVISÃO DE 24/08 ───────────────────────────────────────────────────────
// Medida contra produção, a primeira versão da tela mostrava 2.637 peças (96%
// com uma versão só, 35% sem decisão nenhuma) e baixava 2,24 MB para um assunto
// que são 30 peças. Este arquivo fixa a tela em quatro camadas:
//
//   1. O que passa a ser GRAVADO (inalterado desde 21/08).
//   2. O que é RECONSTRUÍDO do legado — e rotulado como dedução, nunca como
//      registro. Agora com duas correções de honestidade: numeração por
//      OCORRÊNCIA e decisão INDETERMINADA quando empata com a troca de arte.
//   3. O SERVIDOR filtra, pagina, resume e exporta — e o cache curto é
//      derrubado por toda escrita que mude versão, decisão ou book.
//   4. A TELA abre pela exceção, compara versões e cabe num link.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const ler = (rel: string) => readFileSync(path.resolve(__dirname, "../../", rel), "utf8");
const SCHEMA = ler("shared/schema.ts");
const STORAGE = ler("server/storage.ts");
const ITEMS = ler("server/routes/items.ts");
const ROTA = ler("server/routes/versoes.ts");
const ROUTES = ler("server/routes.ts");
const PAGE = ler("client/src/pages/versoes.tsx");
const APP = ler("client/src/App.tsx");
const SIDEBAR = ler("client/src/components/app-sidebar.tsx");
const BACKFILL = ler("scripts/backfill-books.ts");

describe("1 · o que passa a ser GRAVADO", () => {
  it("duas tabelas novas e uma coluna nova, todas aditivas", () => {
    expect(SCHEMA).toContain('export const itemArtVersions = pgTable("item_art_versions", {');
    expect(SCHEMA).toContain('export const eventBooks = pgTable("event_books", {');
    expect(SCHEMA).toContain('decidedThumbUrl: text("decided_thumb_url"),');
    // cascade: apagar a peça/evento leva a história junto, sem órfão.
    expect(SCHEMA).toContain('itemId: varchar("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),');
    expect(SCHEMA).toContain('eventId: varchar("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),');
  });

  it("o storage expõe os quatro métodos", () => {
    for (const m of ["createItemArtVersion(", "getAllItemArtVersions(", "createEventBook(", "getAllEventBooks("]) {
      expect(STORAGE).toContain(`  ${m}`);
      expect(STORAGE).toContain(`async ${m}`);
    }
  });

  it("as três portas de entrada de uma versão gravam: envio, reenvio e troca", () => {
    expect(ITEMS).toContain('origem: "envio"');
    expect(ITEMS).toContain('origem: "reenvio"');
    expect(ITEMS).toContain('origem: "troca"');
    const i = ITEMS.indexOf('origem: "envio"');
    expect(ITEMS.slice(i - 400, i)).toContain("if (approvalThumbUrl) {");
  });

  it("aprovar e reprovar gravam O QUE foi decidido — nos quatro ramos", () => {
    expect((ITEMS.match(/decidedThumbUrl: currentItem\.approvalThumbUrl \?\? null,/g) ?? []).length).toBe(4);
  });

  it("publicar o book grava a história — depois de limpar o atual, nunca antes", () => {
    const limpa = ITEMS.indexOf("await storage.clearEventBookUrl(req.params.eventId);");
    const grava = ITEMS.indexOf("await storage.createEventBook({ eventId: req.params.eventId, bookUrl, itemCount: count");
    expect(limpa).toBeGreaterThan(-1);
    expect(grava).toBeGreaterThan(limpa);
    expect(ITEMS.slice(grava - 120, grava)).toContain("if (bookUrl) {");
  });
});

describe("2 · o legado é RECONSTRUÍDO e rotulado", () => {
  it("a rota existe, é autenticada e está registrada", () => {
    expect(ROTA).toContain('app.get("/api/versoes", requireAuth,');
    expect(ROUTES).toContain('import { registerVersoesRoutes } from "./routes/versoes";');
    expect(ROUTES).toContain("  registerVersoesRoutes(app);");
  });

  it("lê a trilha com o MESMO formato que a rota de troca escreve", () => {
    expect(ITEMS).toContain("`Thumb de aprovação atualizado por ${req.userName}. Anterior: ${prevUrl} → Novo: ${approvalThumbUrl}`");
    expect(ROTA).toContain("const RE_TROCA = /Thumb de aprovação atualizado por (.+?)\\. Anterior: (\\S+) → Novo: (\\S+)/;");
    const re = /Thumb de aprovação atualizado por (.+?)\. Anterior: (\S+) → Novo: (\S+)/;
    const m = re.exec("Thumb de aprovação atualizado por Ana Paula. Anterior: /objects/uploads/a.png → Novo: /objects/uploads/b.png");
    expect(m?.[1]).toBe("Ana Paula");
    expect(m?.[3]).toBe("/objects/uploads/b.png");
  });

  it("versão reconstruída e decisão inferida carregam a bandeira", () => {
    expect(ROTA).toContain('origem: "trilha", por: null, inferida: true');
    expect(ROTA).toContain('origem: "atual", por: null, inferida: true');
    expect(ROTA).toContain("const inferido = !gravado && thumbUrl !== null;");
    expect(ROTA).toContain("const thumbUrl = gravado ?? (decididoEm ? vigenteEm(decididoEm) : null);");
    // a versão gravada vence a inferida: nunca inferir o que foi registrado.
    expect(ROTA.indexOf("for (const v of versoesGravadas)")).toBeLessThan(ROTA.indexOf("for (const log of logsDeTroca)"));
  });

  it("CORREÇÃO 24/08 · a numeração é por ocorrência, não por arquivo", () => {
    // Casar só por URL fazia a "v3" virar "v1" quando a Arte reenviava um
    // arquivo já usado — a peça perdia duas versões da contagem.
    expect(ROTA).toContain("const numeroDaVersao = (url: string | null, iso: string | null): number | null => {");
    expect(ROTA).toContain("if (iso && versoes[i].em > iso) break;");
    expect(ROTA).toContain("versao: ambiguo ? null : numeroDaVersao(thumbUrl, decididoEm),");
  });

  it("CORREÇÃO 24/08 · decisão empatada com a troca vira INDETERMINADA", () => {
    expect(ROTA).toContain("const EMPATE_MS = 1000;");
    expect(ROTA).toContain("const ambiguo = inferido && decididoEm !== null && versoes.some((v) =>");
    expect(ROTA).toContain("Math.abs(new Date(v.em).getTime() - new Date(decididoEm).getTime()) <= EMPATE_MS);");
    expect(PAGE).toContain("versão indeterminada");
  });

  it("peças apagadas ficam fora", () => {
    expect(ROTA).toContain("if ((item as any).deletedAt) continue;");
  });

  it("o backfill grava o histórico de books que estava para se apagar", () => {
    expect(BACKFILL).toContain("const aplicar = process.argv.includes(\"--aplicar\");");
    expect(BACKFILL).toContain("details like 'Book de aprovação vinculado%'");
    // não inventa: sem trilha, entra sem autor.
    expect(BACKFILL).toContain("createdBy: trilha?.userName ?? null,");
    expect(BACKFILL).toContain("if (gravado.has(`${l.eventId}|${l.bookUrl}`)) { pulados++; continue; }");
  });
});

describe("3 · o servidor filtra, pagina, resume e exporta", () => {
  it("aceita o recorte e devolve UMA página", () => {
    expect(ROTA).toContain("function lerRecorte(q: any): Recorte {");
    expect(ROTA).toContain('foco === "todas" || foco === "sem-patrocinador" ? foco : "atencao"');
    expect(ROTA).toContain("itens: recortadas.slice(pagina * tamanho, pagina * tamanho + tamanho),");
    expect(ROTA).toContain("const tamanho = Math.min(120, Math.max(10, parseInt(String(req.query.tamanho ?? \"40\"), 10) || 40));");
  });

  it("facetas contam o pool SEM a própria dimensão — e o resumo, sem o foco", () => {
    expect(ROTA).toContain("const semEvento = dados.itens.filter((p) => casaBusca(p, r.busca) && casaPatrocinador(p, r) && casaFoco(p, r));");
    expect(ROTA).toContain("const semPatrocinador = dados.itens.filter((p) => casaBusca(p, r.busca) && casaEvento(p, r) && casaFoco(p, r));");
    expect(ROTA).toContain("const semFoco = dados.itens.filter((p) => casaBusca(p, r.busca) && casaEvento(p, r) && casaPatrocinador(p, r));");
  });

  it("'precisa de atenção' é sobre VERSÃO — prazo não mora aqui", () => {
    // Decisão do dono (24/08): cobrar decisão parada é do Atendimento e da
    // Gestão de Prazos, que já têm régua, histórico e gente. Duas telas
    // cobrando a mesma pendência com contas próprias é como um número passa a
    // discordar do outro.
    expect(ROTA).toContain("atencao: divergente || versoes.length > 1 || indeterminada,");
    expect(ROTA).toContain("// PRAZO NÃO MORA AQUI (decisão do dono, 24/08)");
    expect(ROTA).not.toContain("DIAS_PARA_COBRAR");
    expect(ROTA).not.toContain("diasPendente");
  });

  it("o book sabe se está desatualizado — contando as peças DELE, não do evento", () => {
    // O primeiro cálculo contava as peças do EVENTO: um book de 26 peças
    // chegou a dizer "34 peças mudaram", que é impossível e derruba a
    // confiança no resto do número. Quem não está no book não o desatualiza.
    expect(ROTA).toContain("const doBook = pecasDoBook.get(b.bookUrl) ?? null;");
    expect(ROTA).toContain("const mudaram = (doBook ?? [])");
    expect(ROTA).not.toContain("saida.filter((p) => p.eventId === b.eventId &&");
    expect(ROTA).toContain("pecasMudaramDepois: mudaram.length,");
  });

  it("e diz QUAIS peças mudaram — com identidade, não só o id", () => {
    expect(ROTA).toContain("pecasMudaram: mudaram.slice(0, 60),");
    expect(ROTA).toContain("export type PecaQueMudou = {");
    for (const campo of ["displayId", "type", "description", "status", "por", "versao"]) {
      expect(ROTA).toContain(campo + ":");
    }
  });

  it("os membros do book saem de TODOS os itens, não só dos que têm versão", () => {
    // O Eco Run Palmas publicou um book com 45 peças que nunca foram a
    // aprovação nenhuma: usar a lista filtrada fazia o book dizer que não
    // sabia quais peças eram as dele, com elas ali, inteiras.
    expect(ROTA).toContain("for (const item of itens) {");
    expect(ROTA).toContain("l.push({ id: item.id, peca: porId.get(item.id) });");
  });

  it("só conta como TROCA o que tem prova de arte nova", () => {
    // A última versão de uma peça sem histórico é reconstruída do estado
    // atual e, sem carimbo de thumb, herda o `updated_at` — que muda ao
    // corrigir uma descrição. Contar isso como troca de arte inflava o número:
    // 32 dos 35 books apareciam "desatualizados"; com a prova exigida, 8.
    expect(ROTA).toContain("const pecasComCarimbo = new Set<string>();");
    expect(ROTA).toContain("if (item.approvalThumbUpdatedAt) pecasComCarimbo.add(item.id);");
    expect(ROTA).toContain('const comProva = p.versoes.filter((v) => v.origem !== "atual" || pecasComCarimbo.has(p.id));');
  });

  it("nenhum selo enigmático: publicação substituída fica em silêncio", () => {
    // "não dá para saber" num selo era pior que nada — o motivo passou para a
    // linha da publicação, em português.
    expect(PAGE).not.toContain("selo-book-indeterminado");
    expect(PAGE).toContain("esta publicação foi substituída; o sistema guardou quantas peças ela tinha, não quais");
  });

  it("o book continua sabendo de si", () => {
    // A associação peça↔book vive em items.book_url, que guarda um endereço
    // por peça: publicar um book novo apaga o anterior. Sobra a contagem.
    expect(ROTA).toContain("membrosConhecidos: doBook !== null,");
    // e o book sem data (legado) continua sem fingir que é o mais novo
    expect(ROTA).toContain('l.push({ bookUrl: cur.bookUrl, em: null, por: null, itemCount: cur.n, inferido: true, membrosConhecidos: true, pecasMudaramDepois: 0, pecasMudaram: [] });');
  });

  it("o CSV exporta o RECORTE inteiro, com BOM para o Excel em pt-BR", () => {
    expect(ROTA).toContain('app.get("/api/versoes/export.csv", requireAuth,');
    expect(ROTA).toContain("const recortadas = filtrar(dados.itens, lerRecorte(req.query));");
    // O BOM é montado aqui, e não escrito como caractere invisível no teste:
    // um caractere U+FEFF literal no fonte some em qualquer normalização de
    // arquivo e ninguém vê isso num diff. Sem ele, o Excel em pt-BR abre
    // "Versões" como "VersÃµes".
    const BOM = String.fromCharCode(0xFEFF);
    const BARRA = String.fromCharCode(92);
    const CRLF_ESCAPADO = BARRA + "r" + BARRA + "n";
    expect(ROTA).toContain(`res.send("${BOM}" + linhas.join("${CRLF_ESCAPADO}"));`);
    expect(ROTA).toContain('"Aprovou versão diferente da atual"');
  });

  it("o cache curto é derrubado por TODA escrita que muda o quadro", () => {
    expect(ROTA).toContain("export function invalidarCacheDeVersoes(): void {");
    expect(ITEMS).toContain('import { invalidarCacheDeVersoes } from "./versoes";');
    // envio, reenvio, troca, book, revogação automática, aprovar, reprovar, revogar
    expect((ITEMS.match(/invalidarCacheDeVersoes\(\);/g) ?? []).length).toBe(8);
  });
});

describe("4 · a tela", () => {
  it("rota, título e item de menu — sem restrição de papel", () => {
    expect(APP).toContain('import Versoes from "@/pages/versoes";');
    expect(APP).toContain('"/versoes": "Versões aprovadas",');
    expect(APP).toContain('<Route path="/versoes">');
    const linha = SIDEBAR.split("\n").find(l => l.includes('url: "/versoes"')) ?? "";
    expect(linha).toContain('title: "Versões aprovadas"');
    expect(linha).not.toContain("roles:");
  });

  it("abre pela exceção, e o acervo fica a um clique", () => {
    expect(PAGE).toContain('const f = inicial.get("foco");');
    expect(PAGE).toContain('return f === "todas" || f === "sem-patrocinador" ? f : "atencao";');
    expect(PAGE).toContain("data-testid={`tab-versoes-${valor}`}");
    for (const t of ['["atencao"', '["todas"', '["sem-patrocinador"', '["books"']) {
      expect(PAGE).toContain(t);
    }
    // e o vazio de "precisa de atenção" é uma boa notícia, não um erro
    expect(PAGE).toContain("Nada precisa de atenção neste recorte");
    expect(PAGE).toContain('data-testid="button-ver-todas"');
  });

  it("os quatro números do cabeçalho são o índice da tela", () => {
    for (const t of ["resumo-divergentes", "resumo-indeterminadas", "resumo-historico", "resumo-books"]) {
      expect(PAGE).toContain(`testId="${t}"`);
    }
    expect(PAGE).toContain('data-testid="resumo-versoes"');
    expect(PAGE).toContain("<button type=\"button\" onClick={onClick} data-testid={testId} title={ajuda}");
    expect(PAGE).toContain("function BotaoResumo(");
  });

  it("a frase de confiança separa registro, dedução e indeterminação", () => {
    expect(PAGE).toContain('data-testid="text-confianca-versoes"');
    expect(PAGE).toContain("inferida pela data");
    expect(PAGE).toContain("todas com a versão registrada");
    expect(PAGE).toContain("indeterminadas");
    expect(PAGE).toContain("o registro de versões começa em");
  });

  it("o comparador existe, abre na versão atual e anda no teclado", () => {
    expect(PAGE).toContain("function Comparador(");
    expect(PAGE).toContain('data-testid="button-comparador-anterior"');
    expect(PAGE).toContain('data-testid="button-comparador-proxima"');
    expect(PAGE).toContain('if (e.key === "ArrowLeft")');
    expect(PAGE).toContain('if (e.key === "ArrowRight")');
    expect(PAGE).toContain("const i = peca!.versoes.findIndex(v => v.thumbUrl === peca!.approvalThumbUrl);");
    // e diz quem decidiu naquela versão
    expect(PAGE).toContain("Quem decidiu nela");
    // a lição do #185: o miolo do modal congela enquanto ele sai
    expect(PAGE).toContain("<FreezeWhileClosing open={aberto}>");
  });

  it("a régua só cresce quando há o que comparar", () => {
    expect(PAGE).toContain("const varias = p.versoes.length > 1;");
    expect(PAGE).toContain("data-testid={`versao-unica-${p.id}`}");
    expect(PAGE).toContain("data-testid={`button-comparar-${p.id}`}");
  });

  it("o recorte cabe num link, e sai em CSV", () => {
    expect(PAGE).toContain("window.history.replaceState(null, \"\", qs ? `?${qs}` : window.location.pathname);");
    expect(PAGE).toContain('data-testid="link-exportar-versoes"');
    expect(PAGE).toContain("href={`/api/versoes/export.csv${parametros.toString() ? `?${parametros}` : \"\"}`}");
  });

  it("estados: esqueleto, erro com tentativa, vazio, e aviso para leitor de tela", () => {
    expect(PAGE).toContain('data-testid="skeleton-versoes"');
    expect(PAGE).toContain("function Esqueleto(");
    expect(PAGE).toContain('data-testid="button-retry-versoes"');
    expect(PAGE).toContain('aria-live="polite"');
  });

  it("books mostram estado e download só para arquivo do app", () => {
    // O selo de "desatualizado" virou BOTÃO: número sem nome não vira ação.
    expect(PAGE).toContain("data-testid={`selo-book-desatualizado-${ev.eventId}-${i}`}");
    expect(PAGE).toContain("data-testid={`lista-mudaram-${ev.eventId}-${i}`}");
    expect(PAGE).toContain("data-testid={`link-mudou-${pm.id}`}");
    expect(PAGE).toContain("data-testid={`link-mudou-${pm.id}`}");
    expect(PAGE).toContain("testId={`selo-book-em-dia-${ev.eventId}`}");
    // o número aparece com o denominador, para "34 de 26" nunca mais existir
    expect(PAGE).toContain("{b.pecasMudaramDepois} de {b.itemCount}");
    expect(PAGE).toContain("data-testid={`link-baixar-book-${ev.eventId}-${i}`}");
    expect(PAGE).toContain("isWebUrl(b.bookUrl) ?");
    expect(PAGE).toContain("arquivo fora do app");
  });

  it("a revogação automática não repete a frase entre aspas", () => {
    expect(PAGE).toContain('const PREFIXO_REVOGACAO = "Aprovação revogada automaticamente";');
    expect(PAGE).toContain("? d.motivo.slice(PREFIXO_REVOGACAO.length).replace(/^:\\s*/, \"\")");
  });

  it("números em coluna usam tabular-nums", () => {
    expect(PAGE).toContain('const numero: React.CSSProperties = { fontFamily: MONO, fontVariantNumeric: "tabular-nums" };');
  });

  it("tons e ícones vêm de status.ts, não inventados na tela", () => {
    expect(PAGE).toContain('import { getApprovalMeta } from "@/lib/status";');
    expect(PAGE).toContain("const meta = getApprovalMeta(d.status);");
  });
});
