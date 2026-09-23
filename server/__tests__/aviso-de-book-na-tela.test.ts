// ─────────────────────────────────────────────────────────────────────────────
// O AVISO DO BOOK, VISTO DA TELA.
//
// O módulo de e-mail nasceu invisível: saía sozinho ao salvar o book, sem
// espera e sem registro. Quem publicava via "Book salvo" e ia embora — mesmo
// quando o provedor tinha recusado. Duas pontas fecham esse buraco, e é o que
// este arquivo fixa:
//
//  1. NA ARTE, o toast conta o desfecho — inclusive o ruim, porque aí alguém
//     precisa avisar a equipe por outro caminho.
//  2. NAS VERSÕES (aba Books), dá para REENVIAR o aviso do book atual sem
//     republicar o book inteiro. Mesma régua de papel do servidor.
// ─────────────────────────────────────────────────────────────────────────────

// O lado do servidor (quem recebe, só admin reenvia, ordem e trilha) roda em
// regras-avisos-book.test.ts e book-email-route.test.ts.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const ler = (rel: string) => readFileSync(path.resolve(__dirname, "../../", rel), "utf8");
const ARTE = ler("client/src/pages/arte.tsx");
const VERSOES = ler("client/src/pages/versoes.tsx");

describe("1 · a Arte vê o que aconteceu com o aviso", () => {
  it("a mutação lê a resposta em vez de descartá-la", () => {
    expect(ARTE).toContain("return await res.json() as { updated: number; aviso: { status: string; para?: string[]; reason?: string } | null };");
  });

  it("os três desfechos têm frase própria — e o ruim é destrutivo", () => {
    expect(ARTE).toContain('if (a?.status === "sent") {');
    expect(ARTE).toContain('title: "Book salvo e avisado"');
    expect(ARTE).toContain('title: "Book salvo — mas o aviso NÃO saiu"');
    expect(ARTE).toContain("Avise a equipe por outro caminho.");
    expect(ARTE).toContain('variant: "destructive",');
    // e o caso "desligado/simulação" continua sendo só "Book salvo"
    expect(ARTE).toContain('toast({ title: "Book salvo", description: quantas, variant: "success" });');
  });
});

describe("2 · reenviar o aviso sai da tela de Versões", () => {
  it("o botão existe, só para o book atual e só para admin", () => {
    expect(VERSOES).toContain("function BotaoReenviarAviso(");
    expect(VERSOES).toContain("data-testid={`button-reenviar-aviso-${eventId}`}");
    expect(VERSOES).toContain("{podeAvisar && i === 0 && <BotaoReenviarAviso eventId={ev.eventId} altura={alturaControle} />}");
    expect(VERSOES).toContain('const podeAvisar = user?.role === "admin";');
  });

  it("o toast do reenvio distingue enviado de não enviado", () => {
    expect(VERSOES).toContain('title: d.aviso?.status === "sent" ? "Aviso reenviado" : "Aviso não enviado",');
    // Sucesso é dito explicitamente (variante `success`); não enviado segue vermelho.
    expect(VERSOES).toContain('variant: d.aviso?.status === "sent" ? "success" : "destructive",');
  });
});
