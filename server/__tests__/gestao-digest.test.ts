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
      { nome: "Livelo", pecas: 2, diasDoMaisAntigo: 9, travadas: 1 },
      { nome: "Elo", pecas: 1, diasDoMaisAntigo: 2, travadas: 0 },
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
    c2.eventos = [{ id: "e1", name: "Primavera SP", truckDepartureDate: null as any }, c2.eventos[1]];
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
      c4.eventos.push({ id: `ev${n}`, name: `Evento ${n}`, truckDepartureDate: emDias(n) });
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

describe("as decisões herdadas do aviso da Revisão", () => {
  const SRC = ler("server/services/gestaoDigest.ts");
  const ROUTES = ler("server/routes.ts");

  it("fila vazia não vira e-mail", () => {
    expect(SRC).toContain('if (resumo.totalPendentes === 0) {');
  });

  it("não repete: a trilha guarda o disparo do dia E DO HORÁRIO", () => {
    // Por dia só não bastaria com três disparos: o das 15h acharia que já
    // mandou por causa do das 10h.
    expect(SRC).toContain('if (!opcoes.manual && await jaAvisou(dia, hora)) return { status: "ja-enviado" };');
    expect(SRC).toContain("const marca = `${DETALHE_TRILHA} (${dia} ${hora}h)`;");
    expect(SRC).toContain('entityType: "gestao"');
  });

  it("só produção envia — dev compartilha segredos com o deploy", () => {
    expect(SRC).toContain("if (!ehProducao(env)) {");
    expect(SRC).toContain("if (!ehProducao()) {");
  });

  it("três vezes por dia, nos horários do aviso da Revisão, e atrás de uma chave", () => {
    expect(HORARIOS_DA_GESTAO).toEqual([10, 15, 18]);
    // a HORA INTEIRA vale (27/08): a janela de 5 min morria num republish às 18:02
    expect(SRC).toContain("if (!HORARIOS_DA_GESTAO.includes(hora)) return;");
    expect(SRC).not.toContain("minuto >= 5");
    // LIGADO por padrão em produção (decisão do dono, 28/08: "segue não
    // mandando automático" — a chave opt-in nunca era criada no deploy e o
    // aviso morria em silêncio). Desligar é que exige =false, e o
    // desligamento explícito fica na trilha.
    expect(SRC).toContain('env.GESTAO_DIGEST_ENABLED?.trim().toLowerCase() !== "false"');
    expect(SRC).toContain('await registrar("desligado (GESTAO_DIGEST_ENABLED=false) — nada enviado");');
    expect(ROUTES).toContain("startGestaoDigest();");
  });

  it("o rodapé do e-mail diz os três horários — não uma promessa desatualizada", () => {
    const c = cenario();
    const r = montarResumoDaGestao(c.itens, c.aprovacoes, c.sponsors, c.eventos, AGORA);
    const m = construirEmailDaGestao(r, CONFIG, DESTINATARIOS_DA_GESTAO);
    if ("erro" in m) throw new Error(m.erro);
    expect(m.html).toContain("Aviso automático às 10h, 15h, 18h");
  });
});

describe("o disparo à mão", () => {
  const ITEMS = ler("server/routes/items.ts");
  const TELA = ler("client/src/pages/atendimento.tsx");

  it("tem porta própria, só para admin — um clique manda e-mail de verdade", () => {
    expect(ITEMS).toContain('app.post("/api/gestao/digest/enviar", requireAuth');
    expect(ITEMS).toContain("Apenas administradores podem disparar o aviso da gestão");
    expect(ITEMS).toContain("enviarAvisoDaGestao(new Date(), process.env, { manual: true })");
  });

  it("o manual ignora a memória do dia, mas NÃO a fila vazia", () => {
    const SRC = ler("server/services/gestaoDigest.ts");
    // `opcoes.manual` pula o jaAvisou (alguém pediu agora e está esperando)…
    expect(SRC).toContain("if (!opcoes.manual && await jaAvisou(dia, hora))");
    // …e também o interruptor, mas a fila vazia continua calando o envio.
    expect(SRC).toContain("const ligado = opcoes.manual || env.GESTAO_DIGEST_ENABLED");
    expect(SRC).toContain('if (resumo.totalPendentes === 0) {');
    expect(ITEMS).toContain("Nenhuma aprovação pendente agora");
  });

  it("o botão vive no Atendimento, só para admin, e conta o desfecho real", () => {
    expect(TELA).toContain('data-testid="button-avisar-gestao"');
    expect(TELA).toContain('user?.role === "admin" && (');
    // "Enviado" seria mentira quando o servidor diz que não enviou.
    expect(TELA).toContain('title: r?.status === "enviado" ? "Aviso enviado" : "Aviso não enviado"');
  });
});
