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
  it("o botão existe, só para o book atual e só para admin", () => {
    expect(VERSOES).toContain("function BotaoReenviarAviso(");
    expect(VERSOES).toContain("data-testid={`button-reenviar-aviso-${eventId}`}");
    expect(VERSOES).toContain("{podeAvisar && i === 0 && <BotaoReenviarAviso eventId={ev.eventId} altura={alturaControle} />}");
    expect(VERSOES).toContain('const podeAvisar = user?.role === "admin";');
  });

  it("a régua de papel do cliente é a MESMA do servidor — o botão some, não dá 403", () => {
    const i = ITEMS.indexOf('app.post("/api/events/:eventId/book/notify"');
    expect(ITEMS.slice(i, i + 400)).toContain('if (req.userRole !== "admin") {');
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
  it("Arte de frente por papel; do Atendimento, só executivo com cliente no evento (dono, 25/08)", () => {
    // "atendimento" SAIU da lista de papéis: quem é do atendimento entra por
    // ser executivo de conta de um patrocinador DAQUELE evento — a regra que
    // o dono pediu ("se eu não tenho cliente vinculado na prova, não preciso
    // receber"). Solicitação continua fora (24/08).
    expect(ITEMS).toContain('export const PAPEIS_QUE_RECEBEM = ["arte"];');
    // A lista nomeada é quem acompanha TODO book, independentemente do evento.
    for (const pessoa of ["pedro@nortemkt.com", "yan.araujo@nortemkt.com", "agatha.nadolsky@nortemkt.com"]) {
      expect(ITEMS).toContain(`  "${pessoa}",`);
    }
    // Kakau e Ana NÃO entram por nome (decisão do dono, 25/08): elas recebem o
    // book só quando são a executiva responsável por um patrocinador daquele
    // evento — pelo caminho do vínculo, como qualquer executiva. No aviso de
    // ACOMPANHAMENTO (gestaoDigest) elas continuam recebendo tudo.
    const lista = ITEMS.slice(ITEMS.indexOf("export const DESTINATARIOS_NOMEADOS"));
    const trecho = lista.slice(0, lista.indexOf("];"));
    expect(trecho).not.toContain("kakau");
    expect(trecho).not.toContain("ana.motta");
    const i = ITEMS.indexOf("export const PAPEIS_QUE_RECEBEM");
    expect(ITEMS.slice(i, i + 400)).not.toContain("solicitacao");
  });

  it("a regra por evento está LIGADA, e resolve o executivo sem N+1", () => {
    expect(ITEMS).toContain("export const USAR_EXECUTIVOS_DO_EVENTO = true;");
    expect(ITEMS).toContain("USAR_EXECUTIVOS_DO_EVENTO ? destinatariosDoEvento(eventId) : Promise.resolve([])");
    expect(ITEMS).toContain("export async function destinatariosDoEvento(eventId: string)");
    // três consultas, não uma por patrocinador — está no caminho que segura a
    // publicação do book
    expect(ITEMS).toContain("storage.getAllSponsors(),");
    expect(ITEMS).toContain("if (!execId) continue; // patrocinador sem executivo: ninguém entra por ele");
  });

  it("quem trabalha vai no Para; quem acompanha, em cópia oculta", () => {
    expect(ITEMS).toContain("const time = Array.from(new Set([...porEvento, ...porPapel]));");
    expect(ITEMS).toContain("const principais = time.length > 0 ? time : nomeados;");
    expect(ITEMS).toContain("const copias = time.length > 0 ? nomeados : [];");
  });

  it("rede de segurança: time vazio faz quem acompanha subir para o Para", () => {
    // Papel renomeado ou cadastro apagado não pode transformar o aviso num
    // e-mail sem destinatário.
    expect(ITEMS).toContain("time.length > 0 ? time : nomeados");
  });

  it("e-mail em branco no cadastro não vira destinatário vazio", () => {
    expect(ITEMS).toContain("usuarios.filter((u) => !!u.email && teste(u as any)).map((u) => u.email);");
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
