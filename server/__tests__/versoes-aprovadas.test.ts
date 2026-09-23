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

// As partes 1–3 que liam só o servidor rodam agora em regras-avisos-versoes.test.ts
// (e o backfill em regras-avisos-backfill-books.test.ts).
import { describe, it, expect } from "vitest";
import { fonteDasRotasDeItens } from "./fonte-das-rotas-de-itens";
import { readFileSync } from "fs";
import path from "path";

const ler = (rel: string) => readFileSync(path.resolve(__dirname, "../../", rel), "utf8");
const ITEMS = fonteDasRotasDeItens();
const ROTA = ler("server/routes/versoes.ts");
const PAGE = ler("client/src/pages/versoes.tsx");
const APP = ler("client/src/App.tsx");
const SIDEBAR = ler("client/src/components/app-sidebar.tsx");

describe("2 · o legado é RECONSTRUÍDO e rotulado", () => {
  it("CORREÇÃO 24/08 · decisão empatada com a troca vira INDETERMINADA", () => {
    expect(ROTA).toContain("const EMPATE_MS = 1000;");
    expect(ROTA).toContain("const ambiguo = inferido && decididoEm !== null && versoes.some((v) =>");
    expect(ROTA).toContain("Math.abs(new Date(v.em).getTime() - new Date(decididoEm).getTime()) <= EMPATE_MS);");
    expect(PAGE).toContain("versão indeterminada");
  });
});

describe("3 · o servidor filtra, pagina, resume e exporta", () => {
  it("nenhum selo enigmático: publicação substituída fica em silêncio", () => {
    // "não dá para saber" num selo era pior que nada — o motivo passou para a
    // linha da publicação, em português.
    expect(PAGE).not.toContain("selo-book-indeterminado");
    expect(PAGE).toContain("esta publicação foi substituída; o sistema guardou quantas peças ela tinha, não quais");
  });
});

describe("4 · a tela", () => {
  it("rota, título e item de menu — sem restrição de papel", () => {
    // Code splitting (27/08): as páginas viraram React.lazy — o import
    // estático deu lugar ao dinâmico.
    expect(APP).toContain('const Versoes = lazyPage(() => import("@/pages/versoes"));');
    expect(APP).toContain('"/versoes": "Versões aprovadas",');
    expect(APP).toContain('<Route path="/versoes">');
    const linha = SIDEBAR.split("\n").find(l => l.includes('url: "/versoes"')) ?? "";
    expect(linha).toContain('title: "Versões aprovadas"');
    expect(linha).not.toContain("roles:");
  });

  it("abre pela exceção, e o acervo fica a um clique", () => {
    expect(PAGE).toContain('const f = inicial.get("foco");');
    expect(PAGE).toContain('return f === "todas" || f === "sem-patrocinador" ? f : "atencao";');
    // As abas são o <Abas> do design system; o prefixo mantém os testids
    // `tab-versoes-<valor>` que os seletores já usavam.
    expect(PAGE).toContain('prefixoDeTestId="tab-versoes"');
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
    // Erro com tentativa: o <EstadoErro> da casa traz o "Tentar de novo".
    expect(PAGE).toContain("<EstadoErro");
    expect(PAGE).toContain("aoTentarDeNovo={() => refetch()}");
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
describe("7 · a rodada de 25/08 — books que resolvem e aviso que deixa rastro", () => {
  it("dentro do evento, a divergência já produzida vem primeiro", () => {
    expect(PAGE).toContain("const peso = (p: Peca) => (p.divergente && jaFoiParaGrafica(p.status)) ? 0 : p.divergente ? 1 : 2;");
    expect(PAGE).toContain("for (const b of out) b.pecas.sort((a, z) => peso(a) - peso(z));");
  });

  it("os quatro cards do resumo têm a MESMA superfície; o fundo marca o ativo; o rótulo concorda com o número", () => {
    expect(PAGE).toContain('border: `1px solid ${T.border}`,');
    expect(PAGE).toContain("backgroundColor: ativo ? T.bg : T.surface,");
    expect(PAGE).toContain('booksDesatualizados === 1 ? "book desatualizado" : "books desatualizados"');
    expect(PAGE).toContain('resumo.divergentes === 1 ? "aprovou outra versão" : "aprovaram outra versão"');
  });

  it("o book ATUAL desatualizado ganha a faixa: peças nomeadas + Republicar via gerador (nenhuma rota nova)", () => {
    expect(PAGE).toContain("data-testid={`faixa-book-${ev.eventId}`}");
    expect(PAGE).toContain("O book publicado não tem a arte atual de {b.pecasMudaramDepois}");
    expect(PAGE).toContain("data-testid={`ficha-peca-mudou-${pm.id}`}");
    expect(PAGE).toContain("data-testid={`button-republicar-book-${ev.eventId}`}");
    expect(PAGE).toContain("href={`/eventos/${ev.eventId}/gerar-book`}");
    // só no book atual — republicar um book antigo não quer dizer nada
    expect(PAGE).toContain("const mostraFaixa = i === 0 && desatualizado;");
    // e a faixa não é computada oculta: só existe quando aparece
    expect(PAGE).toContain("{mostraFaixa && (");
  });

  it("o registro do aviso: envio e destinatários da TRILHA, e nenhuma taxa de abertura inventada", () => {
    // servidor: só logs de aviso ENVIADO viram registro, com data e pessoas
    expect(ROTA).toContain("Aviso por e-mail enviado para %");
    expect(ROTA).toContain("const ultimoAvisoPorEvento = new Map<string, AvisoDoBook>();");
    // o e-mail é SMTP simples, sem pixel: a tela mostra envio, nunca leitura
    expect(ROTA).not.toContain("abriu");
    expect(PAGE).toContain("data-testid={`registro-aviso-${ev.eventId}`}");
    expect(PAGE).toContain('"aviso nunca enviado"');
    // aviso mais velho que a publicação fala do book ANTERIOR — não conta
    expect(PAGE).toContain("(!b.em || ev.aviso.em >= b.em)");
    // e o reenvio derruba o cache para o registro aparecer na hora
    const idxNotify = ITEMS.indexOf('app.post("/api/events/:eventId/book/notify"');
    expect(ITEMS.indexOf("invalidarCacheDeVersoes();", idxNotify)).toBeGreaterThan(idxNotify);
  });

  it("a decisão de 24/08 continua de pé: a faixa da peça audita, não executa", () => {
    // reafirmada pelo dono em 25/08, contra o prompt que pedia botões de ação
    expect(PAGE).toContain("dono cortou os dois, com razão");
    expect(PAGE).not.toContain("button-resolucao-");
  });
});
