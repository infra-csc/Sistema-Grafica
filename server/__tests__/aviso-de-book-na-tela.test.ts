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

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const ler = (rel: string) => readFileSync(path.resolve(__dirname, "../../", rel), "utf8");
const ARTE = ler("client/src/pages/arte.tsx");
const VERSOES = ler("client/src/pages/versoes.tsx");
const ITEMS = ler("server/routes/items.ts");

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
    expect(ARTE).toContain('toast({ title: "Book salvo", description: quantas });');
  });
});

describe("2 · reenviar o aviso sai da tela de Versões", () => {
  it("o botão existe, só para o book atual e só para quem pode", () => {
    expect(VERSOES).toContain("function BotaoReenviarAviso(");
    expect(VERSOES).toContain("data-testid={`button-reenviar-aviso-${eventId}`}");
    expect(VERSOES).toContain("{podeAvisar && i === 0 && <BotaoReenviarAviso eventId={ev.eventId} altura={alturaControle} />}");
    expect(VERSOES).toContain('const podeAvisar = ["arte", "admin", "atendimento"].includes(user?.role ?? "");');
  });

  it("a régua de papel do cliente é a MESMA do servidor", () => {
    expect(ITEMS).toContain('if (!["arte", "admin", "atendimento"].includes(String(req.userRole))) {');
  });

  it("o toast do reenvio distingue enviado de não enviado", () => {
    expect(VERSOES).toContain('title: d.aviso?.status === "sent" ? "Aviso reenviado" : "Aviso não enviado",');
    expect(VERSOES).toContain('variant: d.aviso?.status === "sent" ? undefined : "destructive",');
  });

  it("o reenvio usa o book atual e recusa evento sem book", () => {
    expect(ITEMS).toContain('return res.status(409).json({ error: "Este evento não tem book publicado para avisar." });');
    expect(ITEMS).toContain("const comBook = doEvento.filter((i) => i.bookUrl);");
  });
});

describe("3 · quem recebe o aviso", () => {
  it("duas pessoas NOMEADAS — nem por papel, nem por evento (decisão do dono, 24/08)", () => {
    expect(ITEMS).toContain('export const DESTINATARIOS_NOMEADOS = ["pedro@nortemkt.com", "yan.araujo@nortemkt.com"];');
    // Solicitação fora por enquanto: a lista de papéis existe e está vazia, de
    // propósito — é o lugar declarado da decisão, não código morto.
    expect(ITEMS).toContain("export const PAPEIS_QUE_RECEBEM: string[] = [];");
    expect(ITEMS).toContain("if (PAPEIS_QUE_RECEBEM.includes(u.role)) return true;");
  });

  it("a regra por evento fica desligada enquanto o cadastro não melhora", () => {
    expect(ITEMS).toContain("export const USAR_EXECUTIVOS_DO_EVENTO = false;");
    // e a função continua viva, atrás do interruptor — não foi apagada
    expect(ITEMS).toContain("USAR_EXECUTIVOS_DO_EVENTO ? destinatariosDoEvento(eventId) : Promise.resolve([])");
    expect(ITEMS).toContain("export async function destinatariosDoEvento(eventId: string)");
  });

  it("com a regra por evento desligada, todos vão no Para e ninguém em cópia", () => {
    expect(ITEMS).toContain("const principais = USAR_EXECUTIVOS_DO_EVENTO && porEvento.length > 0 ? porEvento : equipe;");
    expect(ITEMS).toContain("const copias = USAR_EXECUTIVOS_DO_EVENTO && porEvento.length > 0 ? equipe : [];");
  });

  it("e-mail em branco no cadastro não vira destinatário vazio", () => {
    expect(ITEMS).toContain("if (!u.email) return false;");
  });
});

describe("4 · o e-mail nunca acontece antes do registro interno", () => {
  it("na publicação, o aviso vem depois da auditoria do book", () => {
    const auditoriaDoBook = ITEMS.indexOf("`Book de aprovação vinculado a ${count} peça(s)`");
    const aviso = ITEMS.indexOf("aviso = await avisarBookPorEmail(req, req.params.eventId, bookUrl, count);");
    expect(auditoriaDoBook).toBeGreaterThan(-1);
    expect(aviso).toBeGreaterThan(auditoriaDoBook);
  });

  it("e o desfecho do envio também vira trilha", () => {
    expect(ITEMS).toContain("await createAuditLog(req, 'updated', 'event', req.params.eventId, descreverEnvio(aviso));");
    expect(ITEMS).toContain("`Reenvio manual. ${descreverEnvio(aviso)}`");
  });
});
