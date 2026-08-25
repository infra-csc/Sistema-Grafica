// ─────────────────────────────────────────────────────────────────────────────
// GERADOR DE BOOK — o PDF no padrão do exemplar manual (aprovado 25/08).
//
// A régua veio medida do EcoRun_2026_Palmas_aprovacao_v1 (ver "Anatomia do
// Book"). O que este arquivo prende é a FIDELIDADE: as medidas do exemplar
// numa fonte única (book-spec), a paginação na regra dele, e o gerador
// publicando pelo MESMO caminho do book manual — nada de segundo fluxo.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { BOOK, celulasDaPagina, encaixeContain, mioloDoBook, paginarGrupos } from "../../client/src/lib/book-spec";

const GERADOR = readFileSync(new URL("../../client/src/lib/book-gerador.ts", import.meta.url), "utf8");
const PAGINA = readFileSync(new URL("../../client/src/pages/book-gerador.tsx", import.meta.url), "utf8");
const APP = readFileSync(new URL("../../client/src/App.tsx", import.meta.url), "utf8");
const DETALHE = readFileSync(new URL("../../client/src/pages/event-detail.tsx", import.meta.url), "utf8");

describe("a régua é a do exemplar", () => {
  it("A4 paisagem exato, rodapé medido, teto de 6", () => {
    expect(BOOK.LARGURA).toBe(842);
    expect(BOOK.ALTURA).toBe(595);
    expect(BOOK.RODAPE_ROTULO_X).toBe(215);
    expect(BOOK.RODAPE_BASELINE_DO_FUNDO).toBe(65);
    expect(BOOK.RODAPE_ROTULO_PT).toBe(12);
    expect(BOOK.MAX_POR_PAGINA).toBe(6);
  });

  it("o miolo é ~76% centrado e nunca invade o rodapé", () => {
    const m = mioloDoBook();
    expect(m.w).toBe(Math.round(842 * 0.76));
    expect(m.x * 2 + m.w).toBe(842);
    expect(m.y + m.h).toBe(595 - BOOK.RODAPE_ALTURA);
  });
});

describe("as células seguem a regra do exemplar", () => {
  it("1 arte → miolo inteiro", () => {
    expect(celulasDaPagina(1)).toEqual([mioloDoBook()]);
  });

  it("2 artes → EMPILHADAS (p.4 do exemplar), não lado a lado", () => {
    const [a, b] = celulasDaPagina(2);
    expect(a.w).toBe(b.w);
    expect(a.x).toBe(b.x);          // mesma coluna…
    expect(b.y).toBeGreaterThan(a.y); // …uma abaixo da outra
  });

  it("3 artes → três colunas numa linha; 6 → grade 3×2 (p.5)", () => {
    const tres = celulasDaPagina(3);
    expect(new Set(tres.map((c) => c.y)).size).toBe(1);
    expect(new Set(tres.map((c) => c.x)).size).toBe(3);
    const seis = celulasDaPagina(6);
    expect(new Set(seis.map((c) => c.y)).size).toBe(2);
    expect(new Set(seis.map((c) => c.x)).size).toBe(3);
  });

  it("contain de verdade: centraliza e nunca estica", () => {
    const cel = { x: 100, y: 100, w: 300, h: 200 };
    const larga = encaixeContain(cel, 600, 200);   // 3:1
    expect(larga.w).toBe(300);
    expect(larga.h).toBe(100);
    expect(larga.y).toBe(150);                     // centrada na vertical
    const alta = encaixeContain(cel, 100, 400);    // 1:4
    expect(alta.h).toBe(200);
    expect(alta.w).toBe(50);
    expect(alta.x).toBe(225);                      // centrada na horizontal
  });
});

describe("a paginação", () => {
  it("1 grupo = 1 página; 7+ artes continuam com o MESMO rótulo, sem '(2/2)'", () => {
    const paginas = paginarGrupos([
      { rotulo: "Gradil", itens: Array.from({ length: 8 }, (_, i) => ({ id: i })) },
      { rotulo: "Faixa", itens: [{ id: "x" }] },
    ]);
    expect(paginas.map((p) => [p.rotulo, p.itens.length])).toEqual([
      ["Gradil", 6], ["Gradil", 2], ["Faixa", 1],
    ]);
    // fidelidade: o manual não numera as partes — o toEqual acima já prova
    // que o rótulo da 2ª página é "Gradil" seco, sem sufixo de parte.
  });
});

describe("o gerador publica pelo caminho do book manual", () => {
  it("upload-direct + POST /book — nenhum fluxo novo de storage", () => {
    expect(GERADOR).toContain('fetch("/api/objects/upload-direct"');
    expect(PAGINA).toContain("await apiRequest(\"POST\", `/api/events/${eventId}/book`, { bookUrl, itemIds });");
  });

  it("arte reamostrada com fundo BRANCO — PNG transparente viraria fundo preto no JPEG", () => {
    expect(GERADOR).toContain('ctx.fillStyle = "#ffffff";');
    expect(GERADOR).toContain("BOOK.ARTE_LARGURA_MAX");
  });

  it("falha de arte não derruba o book: entra em `falhas` e quem gera decide", () => {
    expect(GERADOR).toContain("falhas.push({ displayId: item.displayId");
  });
});

describe("a página de montagem", () => {
  it("existe na rota, antes da genérica, com a porta no Detalhe do Evento", () => {
    expect(APP.indexOf('path="/eventos/:id/gerar-book"')).toBeLessThan(APP.indexOf('path="/eventos/:id">'));
    expect(DETALHE).toContain('data-testid="button-gerar-book"');
  });

  it("as três lacunas viraram controles: rótulo editável, ordem com setas, capa sem logo", () => {
    expect(PAGINA).toContain('data-testid={`rotulo-grupo-${g.key}`}');
    expect(PAGINA).toContain("const mover = (key: string, delta: number) => {");
    expect(GERADOR).toContain("BOOK.CAPA_FUNDO");
  });

  it("peça sem arte fica FORA e é listada — o exemplar nunca mostra moldura vazia", () => {
    expect(PAGINA).toContain('data-testid="book-sem-arte"');
    expect(PAGINA).toContain("ehBookCompleto");
  });

  it("a prévia desenha com as MESMAS células do PDF", () => {
    expect(PAGINA).toContain("celulasDaPagina(p.itens.length)");
    // e o rodapé da prévia usa as mesmas coordenadas da spec
    expect(PAGINA).toContain("BOOK.RODAPE_ROTULO_X * ESC");
  });

  it("publicar é arte/admin; montar e prever é de quem quiser", () => {
    expect(PAGINA).toContain('const podePublicar = user?.role === "arte" || user?.role === "admin";');
    expect(PAGINA).toContain("disabled={!podePublicar || publicando || totalPecas === 0}");
  });
});
