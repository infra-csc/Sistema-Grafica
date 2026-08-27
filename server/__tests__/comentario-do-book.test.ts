// ─────────────────────────────────────────────────────────────────────────────
// "O QUE MUDOU" DO BOOK — a caixinha de comentário (pedido do dono, 25/08).
//
// A regra: primeira publicação, comentário OPCIONAL; republicação,
// OBRIGATÓRIO — quem recebe o e-mail do book novo precisa saber o que mudou
// sem folhear as páginas comparando. E os chips de patrocinador facilitam a
// escrita ("as mudanças são quase sempre por patrocinador").
//
// O que este arquivo fixa: a régua é UMA (cliente e servidor com o mesmo
// mínimo), os DOIS pontos de publicação usam a mesma caixinha, e o servidor
// recusa ANTES de qualquer escrita — recusar depois do clearEventBookUrl
// deixaria o evento sem book nenhum.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const ler = (rel: string) => readFileSync(path.resolve(__dirname, "../..", rel), "utf8");
const CAIXA = ler("client/src/components/comentario-do-book.tsx");
const GERADOR = ler("client/src/pages/book-gerador.tsx");
const ARTE = ler("client/src/pages/arte.tsx");
const ITEMS = ler("server/routes/items.ts");

describe("a régua é uma só", () => {
  it("cliente e servidor cobram o MESMO mínimo (5)", () => {
    expect(CAIXA).toContain("export const COMENTARIO_MINIMO = 5;");
    expect(ITEMS).toContain("textoDoComentario.length < 5");
  });

  it("no servidor, a recusa vem DEPOIS da guarda de evento fechado e ANTES de qualquer escrita", () => {
    const rota = ITEMS.slice(ITEMS.indexOf('app.post("/api/events/:eventId/book"'));
    const guardaFechado = rota.indexOf("const fechadoBook = motivoEventoFechado(event);");
    const obrigatorio = rota.indexOf('code: "COMENTARIO_OBRIGATORIO"');
    const primeiraEscrita = rota.indexOf("await storage.clearEventBookUrl(req.params.eventId);");
    expect(guardaFechado).toBeGreaterThan(-1);
    // evento fechado responde 409 antes de a rota pensar em comentário — e a
    // validação não pode chamar getAllEventBooks à frente da guarda (o teste
    // de evento-finalizado não mocka esse método e via 500 em vez de 409)
    expect(obrigatorio).toBeGreaterThan(guardaFechado);
    expect(primeiraEscrita).toBeGreaterThan(obrigatorio);
  });

  it("só REPUBLICAÇÃO exige: a contagem olha os books anteriores do MESMO evento", () => {
    expect(ITEMS).toContain("const publicacoesAnteriores = (await storage.getAllEventBooks())");
    expect(ITEMS).toContain(".filter((b) => b.eventId === req.params.eventId).length;");
    expect(ITEMS).toContain("if (publicacoesAnteriores > 0 && textoDoComentario.length < 5) {");
  });
});

describe("os dois pontos de publicação usam a MESMA caixinha", () => {
  it("o Gerador importa, valida antes de gerar o PDF e manda o comentário no POST", () => {
    expect(GERADOR).toContain('from "@/components/comentario-do-book"');
    // a recusa local vem ANTES de renderizar páginas — não vale gerar o PDF
    // inteiro para ouvir 400 do servidor
    const fn = GERADOR.slice(GERADOR.indexOf("const gerarEPublicar"));
    expect(fn.indexOf("comentarioDoBookValido(true, comentario)")).toBeLessThan(fn.indexOf("gerarBookPdf("));
    expect(GERADOR).toContain("comentario: comentario.trim() || undefined");
  });

  it("o modal da Arte importa, trava o Salvar e manda o comentário no POST", () => {
    expect(ARTE).toContain('from "@/components/comentario-do-book"');
    expect(ARTE).toContain("const bookComentarioFalta = !!existingBookUrl && !comentarioDoBookValido(true, bookComentario);");
    expect(ARTE).toContain("comentario: bookComentario.trim() || undefined,");
    // a trava é do botão (disabled), com o porquê no title
    expect(ARTE).toContain("bookComentarioFalta || saveBookMutation.isPending}");
    expect(ARTE).toContain("escreva o que mudou nesta versão");
  });

  it("trocar de evento no modal NÃO leva o comentário junto", () => {
    // o "o que mudou" descreve o book de UM evento; vazar para outro evento
    // publicaria uma explicação errada
    const efeito = ARTE.slice(ARTE.indexOf("bookPremarkedEventRef.current !== bookEventId"));
    expect(efeito.slice(0, 300)).toContain('setBookComentario("")');
    // e abrir o modal começa limpo
    const abrir = ARTE.slice(ARTE.indexOf("const openBookModal"));
    expect(abrir.slice(0, 400)).toContain('setBookComentario("");');
  });
});

describe("os chips de patrocinador são atalho de escrita, não seleção", () => {
  it("clicar começa a linha 'Nome: ' e não duplica linha já começada", () => {
    expect(CAIXA).toContain("if (base.includes(`${nome}:`)) return;");
    expect(CAIXA).toContain("aoMudar(base ? `${base}\\n${nome}: ` : `${nome}: `);");
  });

  it("os nomes vêm das peças do próprio book, únicos e em ordem alfabética pt-BR", () => {
    for (const pagina of [GERADOR, ARTE]) {
      expect(pagina).toContain('.sort((a, b) => a.localeCompare(b, "pt-BR"));');
    }
    expect(GERADOR).toContain("for (const s of i.sponsors ?? []) if (s?.name) nomes.add(s.name);");
  });
});

describe("o comentário chega a quem lê", () => {
  it("no e-mail do book (bloco 'O que mudou') e na tela de Versões", () => {
    const EMAIL = ler("server/services/bookEmailNotification.ts");
    expect(EMAIL).toContain("O que mudou nesta versão");
    const VERSOES_ROTA = ler("server/routes/versoes.ts");
    expect(VERSOES_ROTA).toContain("comentario: (b as any).comment ?? null,");
    const VERSOES_TELA = ler("client/src/pages/versoes.tsx");
    expect(VERSOES_TELA).toContain("b.comentario");
  });

  it("o reenvio manual repete o comentário do ÚLTIMO book — não inventa outro", () => {
    const rota = ITEMS.slice(ITEMS.indexOf('app.post("/api/events/:eventId/book/notify"'));
    expect(rota.slice(0, 2200)).toContain("comment");
  });
});
