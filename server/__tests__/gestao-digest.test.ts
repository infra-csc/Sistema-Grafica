// ─────────────────────────────────────────────────────────────────────────────
// AVISO DA GESTÃO — o resumo de aprovações para Agatha, Kakau e Ana (25/08).
//
// O que este arquivo guarda é a decisão de CONTEÚDO. O primeiro desenho
// agrupava por EXECUTIVO e o dono cortou: "detalhado com foco nos eventos e
// patrocinadores, sem nome de executivo". Este aviso é sobre o que falta
// decidir, não sobre quem está devendo — se algum dia voltar a nomear pessoa,
// terá voltado a ser outra coisa.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import path from "path";

// O módulo importa storage/db (a trilha que impede o envio repetido) e o
// `server/db.ts` exige DATABASE_URL já na importação. O que se testa aqui é
// função pura — mesmo padrão do teste do aviso da Revisão.
vi.mock("../db", () => ({ db: {} }));
vi.mock("../storage", () => ({ storage: {} }));

const {
  montarResumoDaGestao,
  construirEmailDaGestao,
  DESTINATARIOS_DA_GESTAO,
  DIAS_PARA_TRAVADA,
  HORARIOS_DA_GESTAO,
  MAX_EVENTOS,
} = await import("../services/gestaoDigest");

const ler = (rel: string) => readFileSync(path.resolve(__dirname, "../..", rel), "utf8");
const AGORA = new Date("2026-08-26T12:00:00.000Z");
const diasAtras = (n: number) => new Date(AGORA.getTime() - n * 86400000).toISOString();
const emDias = (n: number) => new Date(AGORA.getTime() + n * 86400000);

const CONFIG = { from: "no-reply@nortemkt.com", appUrl: "https://app.exemplo" };

const cenario = () => ({
  itens: [
    { id: "p1", eventId: "e1", status: "awaiting_sponsor_approval", statusChangedAt: diasAtras(9), type: "Lona" },
    { id: "p2", eventId: "e1", status: "awaiting_sponsor_approval", statusChangedAt: diasAtras(2), type: "Lona" },
    { id: "p3", eventId: "e1", status: "sponsor_approved", statusChangedAt: diasAtras(30), type: "Lona" }, // já decidida
    { id: "p4", eventId: "e1", status: "awaiting_sponsor_approval", statusChangedAt: diasAtras(4), type: "BOOK COMPLETO" },
    { id: "p5", eventId: "e1", status: "awaiting_sponsor_approval", statusChangedAt: diasAtras(1), type: "Lona", deletedAt: diasAtras(1) },
    { id: "p6", eventId: "e2", status: "awaiting_sponsor_approval", statusChangedAt: diasAtras(3), type: "Lona" },
  ],
  aprovacoes: [
    { itemId: "p1", sponsorId: "s1", status: "pending", createdAt: diasAtras(9) },
    { itemId: "p1", sponsorId: "s2", status: "approved", createdAt: diasAtras(9) }, // decidida: fora
    { itemId: "p2", sponsorId: "s1", status: "pending", createdAt: diasAtras(2) },
    { itemId: "p2", sponsorId: "s2", status: "pending", createdAt: diasAtras(2) },
    { itemId: "p3", sponsorId: "s1", status: "pending", createdAt: diasAtras(30) }, // peça fora da fase
    { itemId: "p4", sponsorId: "s1", status: "pending", createdAt: diasAtras(4) },  // BOOK COMPLETO
    { itemId: "p5", sponsorId: "s1", status: "pending", createdAt: diasAtras(1) },  // peça excluída
    { itemId: "p6", sponsorId: "s1", status: "pending", createdAt: diasAtras(3) },
  ],
  sponsors: [{ id: "s1", name: "Livelo" }, { id: "s2", name: "Elo" }],
  // e1 sai depois de e2 de propósito: a ordem do e-mail tem de ser a do prazo.
  // startDate é o que decide "já aconteceu" (@shared/prazo-dates).
  eventos: [
    { id: "e1", name: "Primavera SP", truckDepartureDate: emDias(10), startDate: emDias(12) },
    { id: "e2", name: "Meia Maratona", truckDepartureDate: emDias(2), startDate: emDias(4) },
  ],
});

describe("o resumo conta o que interessa e ignora o resto", () => {
  const c = cenario();
  const r = montarResumoDaGestao(c.itens, c.aprovacoes, c.sponsors, c.eventos, AGORA);

  it("só pendências de peça VIVA e em fase de aprovação — book completo fora", () => {
    // p1/s1, p2/s1, p2/s2, p6/s1 = 4. Ficam de fora: a aprovada, a peça já
    // decidida, o BOOK COMPLETO (trâmite do Atendimento) e a peça excluída.
    expect(r.totalPendentes).toBe(4);
    expect(r.pecasPendentes).toBe(3);
  });

  it("agrupa por EVENTO e, dentro dele, por PATROCINADOR", () => {
    expect(r.eventos.map((e) => e.evento)).toEqual(["Meia Maratona", "Primavera SP"]);
    const sp = r.eventos.find((e) => e.evento === "Primavera SP")!;
    expect(sp.patrocinadores).toEqual([
      { nome: "Livelo", pecas: 2, diasDoMaisAntigo: 9, travadas: 1, novaVersao: 0 },
      { nome: "Elo", pecas: 1, diasDoMaisAntigo: 2, travadas: 0, novaVersao: 0 },
    ]);
  });

  it("NENHUM nome de pessoa entra no resumo — foi o corte do dono", () => {
    const texto = JSON.stringify(r);
    for (const campo of ["executivo", "Executivo", "accountExecutive"]) {
      expect(texto).not.toContain(campo);
    }
  });

  it("a ordem é o prazo do caminhão: quem sai antes vem primeiro", () => {
    expect(r.eventos[0].evento).toBe("Meia Maratona");
    expect(r.eventos[0].diasParaSaida).toBe(2);
    expect(r.eventos[1].diasParaSaida).toBe(10);
  });

  it("evento SEM data de saída vai para o fim, não para o topo", () => {
    const c2 = cenario();
    c2.eventos = [{ id: "e1", name: "Primavera SP", truckDepartureDate: null as any, startDate: emDias(12) }, c2.eventos[1]];
    const r2 = montarResumoDaGestao(c2.itens, c2.aprovacoes, c2.sponsors, c2.eventos, AGORA);
    // Sem data não é "o mais folgado" — é ausência de informação.
    expect(r2.eventos.map((e) => e.evento)).toEqual(["Meia Maratona", "Primavera SP"]);
    expect(r2.eventos[1].diasParaSaida).toBeNull();
  });

  it(`parada há ${DIAS_PARA_TRAVADA}+ dias entra na conta de travadas`, () => {
    expect(r.travadas).toBe(1); // só a de 9 dias
  });

  it("EVENTO QUE JÁ ACONTECEU não entra — correção do dono, com o e-mail na mão", () => {
    // Cobrar decisão sobre evento passado é o jeito mais rápido de o aviso
    // virar ruído: quem lê aprende que metade da lista é lixo.
    const c = cenario();
    c.eventos = [
      { id: "e1", name: "Primavera SP", truckDepartureDate: emDias(-20), startDate: emDias(-18) },
      c.eventos[1],
    ];
    const r2 = montarResumoDaGestao(c.itens, c.aprovacoes, c.sponsors, c.eventos, AGORA);
    expect(r2.eventos.map((e) => e.evento)).toEqual(["Meia Maratona"]);
    // e o total conta só o que sobrou — não o que foi filtrado
    expect(r2.totalPendentes).toBe(1);
  });

  it("evento REABERTO à mão com data passada continua fora — decisão do dono", () => {
    // Aqui a régua do aviso é MAIS ESTRITA que o predicado canônico das telas:
    // lá a reabertura devolve o evento ao jogo (quem reabriu quer mexer); aqui
    // não, porque reabrir é para arrumar a casa de algo que já aconteceu — e
    // ninguém precisa ser lembrado disso três vezes por dia.
    const c = cenario();
    c.eventos = [
      { id: "e1", name: "Primavera SP", truckDepartureDate: emDias(-20), startDate: emDias(-18), reopenedAt: emDias(-1) } as any,
      c.eventos[1],
    ];
    const r = montarResumoDaGestao(c.itens, c.aprovacoes, c.sponsors, c.eventos, AGORA);
    expect(r.eventos.map((e) => e.evento)).toEqual(["Meia Maratona"]);
  });

  it("evento ENCERRADO à mão também sai, mesmo com data futura", () => {
    const c = cenario();
    c.eventos = [{ ...c.eventos[0], manuallyClosed: true } as any, c.eventos[1]];
    const r3 = montarResumoDaGestao(c.itens, c.aprovacoes, c.sponsors, c.eventos, AGORA);
    expect(r3.eventos.map((e) => e.evento)).toEqual(["Meia Maratona"]);
  });

  it("peça órfã (evento apagado) não vira cobrança de ninguém", () => {
    const c = cenario();
    c.eventos = [c.eventos[1]]; // e1 sumiu do cadastro
    const r4 = montarResumoDaGestao(c.itens, c.aprovacoes, c.sponsors, c.eventos, AGORA);
    expect(r4.eventos.map((e) => e.evento)).toEqual(["Meia Maratona"]);
  });

  it("patrocinador apagado do cadastro não vira id solto na tela", () => {
    const c3 = cenario();
    c3.sponsors = [];
    const r3 = montarResumoDaGestao(c3.itens, c3.aprovacoes, c3.sponsors, c3.eventos, AGORA);
    expect(r3.eventos[0].patrocinadores[0].nome).toBe("Patrocinador removido do cadastro");
  });

  it("evento além do teto é CONTADO, nunca escondido em silêncio", () => {
    const c4 = cenario();
    c4.itens = [];
    c4.aprovacoes = [];
    c4.eventos = [];
    for (let n = 0; n < MAX_EVENTOS + 3; n++) {
      c4.eventos.push({ id: `ev${n}`, name: `Evento ${n}`, truckDepartureDate: emDias(n), startDate: emDias(n + 2) });
      c4.itens.push({ id: `it${n}`, eventId: `ev${n}`, status: "awaiting_sponsor_approval", statusChangedAt: diasAtras(1), type: "Lona" } as any);
      c4.aprovacoes.push({ itemId: `it${n}`, sponsorId: "s1", status: "pending", createdAt: diasAtras(1) });
    }
    const r4 = montarResumoDaGestao(c4.itens, c4.aprovacoes, c4.sponsors, c4.eventos, AGORA);
    expect(r4.eventos).toHaveLength(MAX_EVENTOS);
    expect(r4.eventosOcultos).toBe(3);
    // e o total continua sendo o total, não o que coube na lista
    expect(r4.totalPendentes).toBe(MAX_EVENTOS + 3);
  });
});

describe("o e-mail", () => {
  const c = cenario();
  const r = montarResumoDaGestao(c.itens, c.aprovacoes, c.sponsors, c.eventos, AGORA);
  const montado = construirEmailDaGestao(r, CONFIG, DESTINATARIOS_DA_GESTAO);
  const ok = () => { if ("erro" in montado) throw new Error(montado.erro); return montado; };

  it("vai para as três da gestão, a direção, a Lívia e a caixa objeto — e só para eles", () => {
    expect(DESTINATARIOS_DA_GESTAO).toEqual([
      "agatha.nadolsky@nortemkt.com",
      "kakau.faria@nortemkt.com",
      "ana.motta@nortemkt.com",
      "yan.araujo@nortemkt.com",
      "pedro@nortemkt.com",
      // dono, 27/08: "adicionar objeto e livia nos emails de executivo"
      "livia.monteiro@nortemkt.com",
      "objeto@cscdoesporte.com.br",
    ]);
    expect(ok().to).toEqual(DESTINATARIOS_DA_GESTAO);
  });

  it("o assunto carrega o número, e o travado quando existe", () => {
    expect(ok().subject).toContain("4 em 2 eventos");
    expect(ok().subject).toContain(`1 paradas há ${DIAS_PARA_TRAVADA}+ dias`);
  });

  it("o prazo do caminhão vem por extenso, ao lado do evento", () => {
    expect(ok().html).toContain("caminhão sai em 2 dias");
    expect(ok().text).toContain("Meia Maratona — caminhão sai em 2 dias");
  });

  it("tem versão em texto — quem bloqueia HTML lê a mesma coisa", () => {
    expect(ok().text).toContain("Livelo: 2 peças, há 9 dias");
    expect(ok().text).toContain("Abrir o Atendimento:");
  });

  it("sem remetente ou sem endereço do app, não monta e diz por quê", () => {
    expect(construirEmailDaGestao(r, { appUrl: "https://x" }, DESTINATARIOS_DA_GESTAO)).toEqual({ erro: "remetente ausente" });
    const semApp = construirEmailDaGestao(r, { from: "a@b.com" }, DESTINATARIOS_DA_GESTAO);
    expect("erro" in semApp && semApp.erro).toContain("BOOK_EMAIL_APP_URL");
  });
});

// Fila vazia (inclusive a refação), a trilha por dia e horário, só produção,
// o interruptor ligado por padrão, a hora inteira do relógio e a subida junto
// com o servidor agora RODAM em regras-avisos-digest-disparo.test.ts.
describe("as decisões herdadas do aviso da Revisão", () => {
  it("três vezes por dia, nos horários do aviso da Revisão", () => {
    expect(HORARIOS_DA_GESTAO).toEqual([10, 15, 18]);
  });

  it("o rodapé do e-mail diz os três horários — não uma promessa desatualizada", () => {
    const c = cenario();
    const r = montarResumoDaGestao(c.itens, c.aprovacoes, c.sponsors, c.eventos, AGORA);
    const m = construirEmailDaGestao(r, CONFIG, DESTINATARIOS_DA_GESTAO);
    if ("erro" in m) throw new Error(m.erro);
    expect(m.html).toContain("Aviso automático às 10h, 15h, 18h");
  });
});

describe("reprovada e nova versão TAMBÉM são pendência (dono, 31/08)", () => {
  // O caso real que motivou: o e-mail de Dog Race dizia "só falta InnSide
  // Melia" enquanto o BB Seguros tinha peça reprovada com a Criação e nova
  // versão esperando decisão — invisíveis. "Reprovou" não é "resolveu".
  const cenario31 = () => ({
    itens: [
      { id: "p1", eventId: "e1", status: "awaiting_sponsor_approval", statusChangedAt: diasAtras(3), type: "Lona" },
      { id: "p2", eventId: "e1", status: "awaiting_sponsor_approval", statusChangedAt: diasAtras(9), type: "Lona" },
      { id: "p3", eventId: "e1", status: "awaiting_sponsor_approval", statusChangedAt: diasAtras(9), type: "Lona" },
    ],
    aprovacoes: [
      // o pendente clássico
      { itemId: "p1", sponsorId: "s1", status: "pending", createdAt: diasAtras(3) },
      // a Arte corrigiu — o patrocinador precisa decidir DE NOVO, e o relógio
      // recomeça na volta da correção (updatedAt), não na reprovação antiga
      { itemId: "p2", sponsorId: "s2", status: "new_version_pending", createdAt: diasAtras(9), updatedAt: diasAtras(1) },
      // reprovada, refazendo com a Criação — pendência de OUTRA natureza
      { itemId: "p3", sponsorId: "s2", status: "awaiting_arte", createdAt: diasAtras(9), rejectedAt: diasAtras(4) },
    ],
    sponsors: [{ id: "s1", name: "InnSide Melia" }, { id: "s2", name: "BB Seguros" }],
    eventos: [{ id: "e1", name: "Dog Race", truckDepartureDate: emDias(10), startDate: emDias(12) }],
  });
  const c = cenario31();
  const r = montarResumoDaGestao(c.itens, c.aprovacoes, c.sponsors, c.eventos, AGORA);

  it("nova versão conta como esperando o patrocinador; refação conta à parte", () => {
    expect(r.totalPendentes).toBe(2); // pending + new_version_pending
    expect(r.naCriacao).toBe(1);      // awaiting_arte, em conta própria
    const e = r.eventos[0];
    expect(e.patrocinadores.find((p) => p.nome === "BB Seguros")).toEqual(
      { nome: "BB Seguros", pecas: 1, diasDoMaisAntigo: 1, travadas: 0, novaVersao: 1 },
    );
    // o relógio da nova versão recomeçou há 1 dia (updatedAt), não há 9
    expect(e.criacao).toEqual([{ nome: "BB Seguros", pecas: 1, diasDoMaisAntigo: 4 }]);
  });

  it("a refação NÃO entra em 'paradas' — essa régua é sobre patrocinador que não decide", () => {
    expect(r.travadas).toBe(0);
  });

  it("o e-mail mostra os dois recortes com as palavras certas", () => {
    const m = construirEmailDaGestao(r, CONFIG, DESTINATARIOS_DA_GESTAO);
    if ("erro" in m) throw new Error(m.erro);
    expect(m.subject).toContain("2 em 1 evento");
    expect(m.subject).toContain("1 na Criação");
    expect(m.html).toContain("nova versão da Arte para aprovar");
    expect(m.html).toContain("reprovada, refazendo na Criação");
    expect(m.html).toContain("com a Criação — nova versão a caminho");
    expect(m.text).toContain("BB Seguros: 1 peça — reprovada, refazendo na Criação, há 4 dias");
  });

  it("SÓ refação já sustenta o envio — pendência com a Criação não é fila vazia", () => {
    const c2 = cenario31();
    c2.aprovacoes = c2.aprovacoes.filter((a) => a.status === "awaiting_arte");
    const r2 = montarResumoDaGestao(c2.itens, c2.aprovacoes, c2.sponsors, c2.eventos, AGORA);
    expect(r2.totalPendentes).toBe(0);
    expect(r2.naCriacao).toBe(1);
    // e o bloco do evento existe mesmo sem linha de decisão
    expect(r2.eventos.map((e) => e.evento)).toEqual(["Dog Race"]);
  });
});

// A rota do disparo à mão (só admin, { manual: true }, a mensagem de fila
// vazia) e o manual que pula a trilha mas não a fila vazia agora RODAM em
// regras-avisos-digest-rotas.test.ts e regras-avisos-digest-disparo.test.ts.
describe("o disparo à mão", () => {
  const TELA = ler("client/src/pages/atendimento.tsx");

  it("o botão vive no Atendimento, só para admin, e conta o desfecho real", () => {
    expect(TELA).toContain('data-testid="button-avisar-gestao"');
    expect(TELA).toContain('user?.role === "admin" && (');
    // "Enviado" seria mentira quando o servidor diz que não enviou.
    expect(TELA).toContain('title: r?.status === "enviado" ? "Aviso enviado" : "Aviso não enviado"');
  });
});
