// Testes da DERIVAÇÃO DE STATUS DO EVENTO (server/routes/events.ts).
//
// PORQUÊ ESTE ARQUIVO EXISTE: esta é a regra que pinta — ou não — um evento de
// verde. O bug que ela acabou de corrigir era do tipo mais caro que existe:
// o servidor carimbava `status = "completed"` só porque a DATA DE INÍCIO tinha
// passado. Um evento com 3 de 20 peças entregues virava "Concluído", perdia a
// bandeira de prioridade, caía para o último balde da ordenação e sumia do
// filtro "Urgente" — exatamente no instante em que virava um problema
// irreversível, porque o caminhão já tinha saído. E o override existia SÓ na
// listagem: o card dizia "Concluído" e o detalhe do MESMO evento dizia
// "Criado", a um clique de distância.
//
// A correção separou dois conceitos que estavam colados num único campo:
//   · allDelivered   → a PRODUÇÃO terminou (toda peça do funil está entregue)
//   · eventHasPassed → o DIA DO EVENTO passou (dia-calendário em
//                      America/Sao_Paulo, comparação ESTRITA)
// Nada aqui pode voltar a confundir os dois. Cada teste abaixo é uma frase de
// negócio, não um detalhe de implementação.
//
// A REGRA DE UM DIA (14/08): `eventHasPassed` era `>=` ("a data chegou")
// enquanto @shared/prazo-dates usava `>` ("o dia passou") para tirar o evento
// das cinco filas e da Gestão de Prazos. Durante o dia do evento as duas telas
// discordavam. Ficou o `>`, e o balde `closed_with_pending` virou `realizado`
// — ninguém encerrou o evento, ele simplesmente aconteceu.
//
// DISCIPLINA DE RELÓGIO: `enrichEvent` recebe o "hoje" por parâmetro, então
// NENHUM teste depende da hora em que a suíte roda. As duas únicas exceções
// são os testes de `todayBusinessMs()`, que injetam um relógio fixo com
// fake timers — e é justamente ali que mora a virada de fuso das 21h, um bug
// que esta base já pagou uma vez.
import { describe, it, expect, vi } from "vitest";

// server/routes/events.ts importa ../storage → ../db, e server/db.ts LANÇA no
// import quando DATABASE_URL não existe. Nenhum teste deste arquivo toca o
// banco (as três funções importadas são puras, e o Pool do Neon só abre
// conexão na primeira query), então uma URL de mentira basta — e cravá-la
// mantém o teste hermético mesmo numa máquina com banco real configurado.
process.env.DATABASE_URL = "postgres://test:test@localhost:5432/banco_nunca_acessado";

const { enrichEvent, spDayMs, todayBusinessMs } = await import("../routes/events");
const { motivoEventoFinalizado } = await import("@shared/prazo-dates");

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

/** "YYYY-MM-DD" → ms da meia-noite UTC: a mesma âncora de dia que enrichEvent usa. */
const dia = (s: string): number => {
  const [y, m, d] = s.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};

let seq = 0;
/** Peça mínima: a derivação só olha para `status`. */
const peca = (status: string) => ({ id: `it-${++seq}`, status });
const pecas = (status: string, n: number) => Array.from({ length: n }, () => peca(status));

// Evento-base: saída do caminhão em 10/03/2026 (terça), evento em 15/03/2026.
// Os 5 marcos dessa saída caem em 13/02, 18/02, 26/02, 02/03 e 09/03 — todos
// em dia útil, então o ajuste de fim de semana não polui os testes que não são
// sobre ele (esse tem fixture própria, com saída no domingo 30/08).
function evento(over: Record<string, any> = {}): Record<string, any> {
  return {
    id: "ev-1",
    name: "COPA NORTE DE ATLETISMO — ETAPA 2",
    status: "created",
    priority: "alta",
    franchise: "Circuito Norte",
    startDate: new Date("2026-03-15T00:00:00.000Z"),
    truckDepartureDate: new Date("2026-03-10T00:00:00.000Z"),
    ...over,
  };
}

/** "Hoje" padrão: 05/02/2026 — antes de todos os marcos e do evento. */
const HOJE = dia("2026-02-05");

function enriquecer(
  ev: Record<string, any> = evento(),
  itens: { status: string }[] = [],
  hoje: number = HOJE,
  patrocinadores: any[] = [],
) {
  return enrichEvent(ev, itens, patrocinadores, hoje);
}

// ─────────────────────────────────────────────────────────────────────────────
describe("evento SEM nenhuma peça", () => {
  it("nunca é 'concluído' — zero peça não é produção terminada", () => {
    // A guarda é `activeItemCount > 0`. Sem ela, `openCount === 0` seria
    // verdadeiro num evento vazio e todo evento recém-criado nasceria verde.
    const r = enriquecer(evento(), []);

    expect(r.itemCount).toBe(0);
    expect(r.activeItemCount).toBe(0);
    expect(r.deliveredCount).toBe(0);
    expect(r.openCount).toBe(0);
    expect(r.allDelivered).toBe(false);
    expect(r.status).toBe("created");
    expect(r.lifecycle).toBe("active");
  });

  it("aponta a Lista de Imagens como próximo marco, com pendingItems 0", () => {
    // É o dado que a listagem precisa para gritar "Nenhuma peça criada —
    // a lista vence em 8 dias" num evento onde ninguém cadastrou nada ainda.
    const r = enriquecer(evento(), []);

    expect(r.nextMilestone).not.toBeNull();
    expect(r.nextMilestone.key).toBe("listaImagens");
    expect(r.nextMilestone.label).toBe("Lista de Imagens");
    expect(r.nextMilestone.deadline).toBe("2026-02-13"); // saída 10/03 - 25 dias
    expect(r.nextMilestone.daysRemaining).toBe(8);
    expect(r.nextMilestone.state).toBe("upcoming");
    expect(r.nextMilestone.pendingItems).toBe(0);
  });

  it("com o dia já passado, fica REALIZADO com pendência (e não concluído)", () => {
    // Evento vazio cujo dia passou é o pior cenário do negócio: ninguém
    // cadastrou peça e o caminhão já saiu. Verde aqui seria mentira dupla.
    const r = enriquecer(evento(), [], dia("2026-03-20"));

    expect(r.eventHasPassed).toBe(true);
    expect(r.allDelivered).toBe(false);
    expect(r.lifecycle).toBe("realizado");
    expect(r.status).toBe("created");
    expect(r.nextMilestone).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("evento com TODAS as peças entregues", () => {
  it("fecha como concluído e para de cobrar marco", () => {
    const r = enriquecer(evento(), pecas("delivered", 3));

    expect(r.deliveredCount).toBe(3);
    expect(r.activeItemCount).toBe(3);
    expect(r.openCount).toBe(0);
    expect(r.allDelivered).toBe(true);
    expect(r.status).toBe("completed");
    expect(r.lifecycle).toBe("completed");
    // Concluído não tem "próximo marco": o sinal certo é o lifecycle.
    expect(r.nextMilestone).toBeNull();
  });

  it("aceita a grafia legada 'entregue' como entregue", () => {
    // A grafia em pt circula no banco desde antes da padronização. Se ela não
    // contasse como pronta, o evento ficaria eternamente "em aberto".
    const r = enriquecer(evento(), [peca("entregue"), peca("delivered"), peca("entregue")]);

    expect(r.deliveredCount).toBe(3);
    expect(r.openCount).toBe(0);
    expect(r.allDelivered).toBe(true);
    expect(r.status).toBe("completed");
  });

  it("peça cancelada/excluída/arquivada não impede o fechamento", () => {
    // Cancelada não é trabalho pendente nem trabalho entregue: sai do
    // denominador. Enquanto ela contava, um evento com uma peça cancelada
    // nunca fechava sozinho.
    const r = enriquecer(evento(), [
      peca("delivered"),
      peca("delivered"),
      peca("canceled"),
      peca("deleted"),
      peca("archived"),
    ]);

    expect(r.itemCount).toBe(5);
    expect(r.canceledCount).toBe(3);
    expect(r.activeItemCount).toBe(2); // denominador honesto do progresso
    expect(r.deliveredCount).toBe(2);  // numerador
    expect(r.openCount).toBe(0);
    expect(r.allDelivered).toBe(true);
    expect(r.lifecycle).toBe("completed");
  });

  it("evento em que TODAS as peças foram canceladas não conta como concluído", () => {
    // Não sobrou produção nenhuma para dar por terminada — `activeItemCount`
    // é 0, então a guarda do evento vazio vale aqui também. Repare que
    // `openCount` é 0: quem exibir "N peças em aberto" mostra zero, e o rótulo
    // do lifecycle é a única coisa que sugere pendência.
    const r = enriquecer(evento(), pecas("canceled", 4));

    expect(r.activeItemCount).toBe(0);
    expect(r.openCount).toBe(0);
    expect(r.allDelivered).toBe(false);
    expect(r.status).toBe("created");
  });

  it("produção terminada GANHA da data passada (precedência do lifecycle)", () => {
    // Evento que aconteceu e cuja produção fechou é "concluído", não
    // "encerrado com pendência". allDelivered tem precedência sobre a data.
    const r = enriquecer(evento(), pecas("delivered", 2), dia("2026-03-20"));

    expect(r.eventHasPassed).toBe(true);
    expect(r.allDelivered).toBe(true);
    expect(r.lifecycle).toBe("completed");
    expect(r.status).toBe("completed");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("O BUG: data passada COM peças em aberto", () => {
  // 20 peças, 3 entregues, 17 abertas, evento em 15/03 avaliado em 20/03.
  const cenarioDoBug = () =>
    enriquecer(
      evento(),
      [...pecas("delivered", 3), ...pecas("awaiting_approval", 10), ...pecas("draft", 7)],
      dia("2026-03-20"),
    );

  it("NÃO vira 'completed' só porque a data do evento passou", () => {
    // Esta é a asserção que o bug quebrava. Se ela falhar, o verde falso voltou.
    const r = cenarioDoBug();

    expect(r.eventHasPassed).toBe(true);
    expect(r.allDelivered).toBe(false);
    expect(r.status).toBe("created");
    expect(r.lifecycle).toBe("realizado");
  });

  it("expõe o tamanho real da pendência", () => {
    const r = cenarioDoBug();

    expect(r.itemCount).toBe(20);
    expect(r.activeItemCount).toBe(20);
    expect(r.deliveredCount).toBe(3);
    expect(r.openCount).toBe(17);
  });

  it("preserva a prioridade e os demais campos do evento", () => {
    // Parte do estrago do bug era colateral: virando "concluído", o evento
    // perdia a bandeira de prioridade na UI. O enriquecimento não pode comer
    // nenhum campo da tabela.
    const r = cenarioDoBug();

    expect(r.id).toBe("ev-1");
    expect(r.name).toBe("COPA NORTE DE ATLETISMO — ETAPA 2");
    expect(r.priority).toBe("alta");
    expect(r.franchise).toBe("Circuito Norte");
  });

  it("UMA peça aberta entre 19 entregues já basta para não fechar", () => {
    const r = enriquecer(
      evento(),
      [...pecas("delivered", 19), peca("awaiting_final_review")],
      dia("2026-03-20"),
    );

    expect(r.openCount).toBe(1);
    expect(r.allDelivered).toBe(false);
    expect(r.status).toBe("created");
    expect(r.lifecycle).toBe("realizado");
  });

  it("realizado com pendência não recebe 'próximo marco'", () => {
    // Todos os marcos já venceram junto com o evento; cobrar um deles seria
    // ruído. Quem precisa de sinal aqui lê o lifecycle.
    expect(cenarioDoBug().nextMilestone).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("evento FUTURO", () => {
  it("segue ativo e com marco a cobrar", () => {
    const r = enriquecer(evento(), pecas("draft", 4));

    expect(r.eventHasPassed).toBe(false);
    expect(r.allDelivered).toBe(false);
    expect(r.lifecycle).toBe("active");
    expect(r.status).toBe("created");
    expect(r.nextMilestone.key).toBe("listaImagens");
    expect(r.nextMilestone.pendingItems).toBe(4);
  });

  it("NO DIA do evento ele ainda está em jogo — só passa no dia SEGUINTE", () => {
    // A REGRA DE UM DIA, e o motivo de este teste ser o mais importante do
    // arquivo. Esta comparação era `>=` ("a data CHEGOU") enquanto a regra que
    // tira o evento das cinco filas e da Gestão de Prazos é `>` ("o dia
    // PASSOU"). Um dia inteiro de divergência: a lista de Eventos carimbava
    // "Encerrado com pendências" num evento que TODAS as outras telas ainda
    // estavam cobrando. Ganhou o `>` — é a regra do dono, e é a única das duas
    // que já estava em @shared/prazo-dates valendo para o app inteiro.
    expect(enriquecer(evento(), [], dia("2026-03-14")).eventHasPassed).toBe(false);
    expect(enriquecer(evento(), [], dia("2026-03-15")).eventHasPassed).toBe(false);
    expect(enriquecer(evento(), [], dia("2026-03-16")).eventHasPassed).toBe(true);
  });

  it("no DIA do evento com peça aberta o lifecycle ainda é 'active'", () => {
    // Consequência visível da regra de um dia: no dia do evento o card mantém
    // a bandeira de prioridade e o próximo marco, porque a peça continua na
    // fila da Arte e continua sendo cobrada em /prazos.
    const r = enriquecer(evento(), pecas("draft", 2), dia("2026-03-15"));

    expect(r.lifecycle).toBe("active");
    expect(r.nextMilestone).not.toBeNull();
  });

  it("aceita startDate como string ISO, não só como Date", () => {
    // O storage devolve Date; cache/serialização devolvem string. As duas
    // formas precisam dar a mesma resposta.
    const comString = enriquecer(
      evento({ startDate: "2026-03-15T00:00:00.000Z", truckDepartureDate: "2026-03-10T00:00:00.000Z" }),
      [],
      dia("2026-03-16"),
    );
    expect(comString.eventHasPassed).toBe(true);
  });

  it("ano absurdo na DATA DO EVENTO não arquiva o evento", () => {
    // "0206" no lugar de "2026" está 1.800 anos no passado: com a comparação
    // ingênua o evento nascia "realizado" e sumia da grade padrão. Agora a data
    // implausível não decide nada — o evento fica visível como cadastro a
    // corrigir. Mesma decisão que @shared/prazo-dates já tomava para as filas.
    const r = enriquecer(evento({ startDate: new Date("0206-03-15T00:00:00.000Z") }), pecas("draft", 1));

    expect(r.eventHasPassed).toBe(false);
    expect(r.lifecycle).toBe("active");
  });

  it("o próximo marco anda conforme as peças avançam no funil", () => {
    const marco = (status: string) => enriquecer(evento(), pecas(status, 2)).nextMilestone.key;

    expect(marco("draft")).toBe("listaImagens");
    expect(marco("awaiting_linking")).toBe("listaImagens");
    expect(marco("awaiting_submission")).toBe("layouts");
    expect(marco("awaiting_approval")).toBe("aprovacao");
    // Finalização é etapa PRÓPRIA (a Arte anexando o arquivo final) — os três
    // caminhos que chegam nela caem no mesmo marco.
    expect(marco("awaiting_finalization")).toBe("finalizacao");
    expect(marco("sponsor_approved")).toBe("finalizacao");
    expect(marco("awaiting_creator_review")).toBe("finalizacao");
    expect(marco("awaiting_final_review")).toBe("revisao");
    expect(marco("ready_for_production")).toBe("producao");
    // Grafias legadas em pt não podem sumir do funil (etapa virava verde falso).
    expect(marco("awaiting_sponsor_approval")).toBe("aprovacao");
    expect(marco("em_producao")).toBe("producao");
  });

  it("a peça mais atrasada manda no marco, e as entregues não contam como pendência", () => {
    const r = enriquecer(evento(), [
      ...pecas("delivered", 5),      // prontas: fora do funil de pendência
      peca("ready_for_production"),  // marco 5
      peca("draft"),                 // marco 1 — o mais atrasado manda
    ]);

    expect(r.nextMilestone.key).toBe("listaImagens");
    expect(r.nextMilestone.pendingItems).toBe(1);
  });

  it("o marco é ancorado na SAÍDA DO CAMINHÃO, não na data do evento", () => {
    // Mover o evento 6 meses para frente sem mexer na saída não pode mudar
    // um único prazo — a âncora do produto inteiro é a saída.
    const r = enriquecer(evento({ startDate: new Date("2026-09-15T00:00:00.000Z") }), []);

    expect(r.nextMilestone.deadline).toBe("2026-02-13");
  });

  it("respeita os offsets configurados no evento em vez dos padrões", () => {
    const r = enriquecer(evento({ deadlineListaImagens: -40 }), pecas("draft", 1));

    expect(r.nextMilestone.deadline).toBe("2026-01-29"); // 10/03 - 40 dias
  });

  it("empurra marco de fim de semana para dia útil — menos a Produção Gráfica", () => {
    // Saída no domingo 30/08/2026: a Revisão de Lista (-8) cairia no sábado
    // 22/08 e é puxada para sexta 21/08; a Produção Gráfica (-1) cairia no
    // sábado 29/08 e FICA, porque a gráfica roda em todos os dias.
    const ev = evento({
      startDate: new Date("2026-09-05T00:00:00.000Z"),
      truckDepartureDate: new Date("2026-08-30T00:00:00.000Z"),
    });
    const hoje = dia("2026-08-13");

    const revisao = enriquecer(ev, pecas("awaiting_final_review", 1), hoje).nextMilestone;
    expect(revisao.key).toBe("revisao");
    expect(revisao.deadline).toBe("2026-08-21");

    const producao = enriquecer(ev, pecas("ready_for_production", 1), hoje).nextMilestone;
    expect(producao.key).toBe("producao");
    expect(producao.deadline).toBe("2026-08-29");
  });

  it("classifica o marco em upcoming / warning / overdue", () => {
    const estado = (hoje: string) =>
      enriquecer(evento(), pecas("draft", 1), dia(hoje)).nextMilestone;

    expect(estado("2026-02-05").state).toBe("upcoming"); // faltam 8
    expect(estado("2026-02-10").state).toBe("warning");  // faltam 3
    expect(estado("2026-02-13").daysRemaining).toBe(0);  // vence hoje
    expect(estado("2026-02-13").state).toBe("warning");
    expect(estado("2026-02-14").state).toBe("overdue");  // atrasado 1
    expect(estado("2026-02-14").daysRemaining).toBe(-1);
  });

  it("ano absurdo na saída não vira 'ATRASADO 664730D' vermelho", () => {
    // O caso real: digitaram "0206" no lugar de "2026". Sem data confiável não
    // existe atraso confiável — o prazo é marcado como suspeito e nunca pintado
    // de vermelho.
    const r = enriquecer(evento({ truckDepartureDate: new Date("0206-03-10T00:00:00.000Z") }), []);

    expect(r.nextMilestone.invalidDate).toBe(true);
    expect(r.nextMilestone.state).toBe("upcoming");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("virada de dia em America/Sao_Paulo (o bug das 21h)", () => {
  // A âncora antiga comparava o instante bruto contra um timestamp gravado à
  // meia-noite UTC: às 21:00 de Brasília da VÉSPERA o evento já "tinha
  // passado" — 3h de antecipação justamente nas horas em que alguém está
  // correndo atrás de peça faltando.

  it("spDayMs: 21h e 23h59 de Brasília ainda são o MESMO dia", () => {
    // 10/03 00:30Z = 09/03 21:30 em São Paulo (UTC-3).
    expect(spDayMs(new Date("2026-03-10T00:30:00.000Z"))).toBe(dia("2026-03-09"));
    // 10/03 02:59Z = 09/03 23:59 em São Paulo — ainda dia 9.
    expect(spDayMs(new Date("2026-03-10T02:59:00.000Z"))).toBe(dia("2026-03-09"));
    // 10/03 03:00Z = 10/03 00:00 em São Paulo — agora sim virou.
    expect(spDayMs(new Date("2026-03-10T03:00:00.000Z"))).toBe(dia("2026-03-10"));
  });

  it("todayBusinessMs() usa o dia do NEGÓCIO, não o do processo", () => {
    // O relógio real é o único ponto em que a rota consulta o mundo externo;
    // é aqui que uma volta ao `new Date()` cru reintroduziria o bug.
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-03-10T02:59:00.000Z"));
      expect(todayBusinessMs()).toBe(dia("2026-03-09"));

      vi.setSystemTime(new Date("2026-03-10T03:00:00.000Z"));
      expect(todayBusinessMs()).toBe(dia("2026-03-10"));
    } finally {
      vi.useRealTimers();
    }
  });

  it("evento do dia 10 só vira 'realizado' à meia-noite do dia 11 (fim a fim)", () => {
    const ev = evento({ startDate: new Date("2026-03-10T00:00:00.000Z") });
    const abertas = pecas("awaiting_approval", 2);

    // 10/03 00:30Z = 09/03 21:30 em São Paulo — véspera, e as 3h de
    // antecipação que já custaram um bug a esta base.
    const vespera21h = enrichEvent(ev, abertas, [], spDayMs(new Date("2026-03-10T00:30:00.000Z")));
    expect(vespera21h.eventHasPassed).toBe(false);
    expect(vespera21h.lifecycle).toBe("active");
    expect(vespera21h.nextMilestone).not.toBeNull();

    // 10/03 03:00Z = 10/03 00:00 em São Paulo — o DIA DO EVENTO começou, e
    // durante ele o trabalho ainda conta. Aqui a comparação `>=` antiga já
    // dizia "encerrado com pendências" com o evento acontecendo.
    const diaDoEvento = enrichEvent(ev, abertas, [], spDayMs(new Date("2026-03-10T03:00:00.000Z")));
    expect(diaDoEvento.eventHasPassed).toBe(false);
    expect(diaDoEvento.lifecycle).toBe("active");
    expect(diaDoEvento.nextMilestone).not.toBeNull();

    // 11/03 03:00Z = 11/03 00:00 em São Paulo — o dia passou.
    const diaSeguinte = enrichEvent(ev, abertas, [], spDayMs(new Date("2026-03-11T03:00:00.000Z")));
    expect(diaSeguinte.eventHasPassed).toBe(true);
    expect(diaSeguinte.lifecycle).toBe("realizado");
    expect(diaSeguinte.nextMilestone).toBeNull();
  });

  it("o prazo do marco também não anda às 21h", () => {
    const ev = evento();
    const vespera21h = spDayMs(new Date("2026-02-14T00:30:00.000Z")); // 13/02 21:30 SP

    const r = enrichEvent(ev, pecas("draft", 1), [], vespera21h);
    // Ainda é dia 13: o marco vence HOJE, não ontem.
    expect(r.nextMilestone.daysRemaining).toBe(0);
    expect(r.nextMilestone.state).toBe("warning");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("a lista de Eventos e as filas de trabalho usam O MESMO dia", () => {
  // Este bloco é a trava da unificação. Enquanto existiam duas comparações
  // (`>=` aqui, `>` em @shared/prazo-dates), a divergência era invisível: só
  // aparecia durante 24h, no dia do evento, e para quem olhasse as duas telas
  // ao mesmo tempo. Um laço sobre os três dias vizinhos custa nada e não deixa
  // ninguém reintroduzir a diferença por engano.
  const DIAS = ["2026-03-13", "2026-03-14", "2026-03-15", "2026-03-16", "2026-03-17"];

  it("'realizado' na lista acontece exatamente quando o evento sai das filas", () => {
    for (const hoje of DIAS) {
      const r = enriquecer(evento(), pecas("draft", 2), dia(hoje));
      const saiuDasFilas = motivoEventoFinalizado(evento(), dia(hoje)) === "realizado";

      expect(r.eventHasPassed, `em ${hoje}`).toBe(saiuDasFilas);
      expect(r.lifecycle === "realizado", `em ${hoje}`).toBe(saiuDasFilas);
    }
  });

  it("evento encerrado à mão sai pelas filas como 'encerrado', nunca como 'realizado'", () => {
    // Mesmo com a data passada: a decisão de uma pessoa é a explicação certa,
    // e é a única com volta (reabrir). O lifecycle concorda com o motivo.
    const ev = evento({ status: "closed" });
    const r = enriquecer(ev, pecas("draft", 2), dia("2026-03-20"));

    expect(motivoEventoFinalizado(ev, dia("2026-03-20"))).toBe("encerrado");
    expect(r.lifecycle).toBe("manually_closed");
    // O FATO da data continua no payload — só deixou de mandar no rótulo.
    expect(r.eventHasPassed).toBe(true);
  });

  it("evento sem data de início nunca é 'realizado' — nem aqui, nem nas filas", () => {
    const ev = evento({ startDate: null });
    const r = enriquecer(ev, pecas("draft", 1), dia("2026-03-20"));

    expect(motivoEventoFinalizado(ev, dia("2026-03-20"))).toBeNull();
    expect(r.eventHasPassed).toBe(false);
    expect(r.lifecycle).toBe("active");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("status do BANCO x status CALCULADO", () => {
  it("rebaixa um 'completed' velho gravado no banco quando há peça aberta", () => {
    // routes/shared.ts ainda persiste `completed` por data (dívida conhecida).
    // A leitura precisa desmentir o banco, ou o verde falso sobrevive ao fix.
    const r = enriquecer(
      evento({ status: "completed" }),
      [...pecas("delivered", 1), ...pecas("draft", 1)],
      dia("2026-03-20"),
    );

    expect(r.status).toBe("created");
    expect(r.lifecycle).toBe("realizado");
  });

  it("promove um 'created' do banco quando a produção terminou", () => {
    const r = enriquecer(evento({ status: "created" }), pecas("delivered", 2));

    expect(r.status).toBe("completed");
    expect(r.lifecycle).toBe("completed");
  });

  it("mantém 'completed' quando o banco e a produção concordam", () => {
    const r = enriquecer(evento({ status: "completed" }), pecas("delivered", 2));

    expect(r.status).toBe("completed");
  });

  // A única exceção é o encerramento MANUAL ("closed"), que é decisão de gente
  // e por isso vence a derivação — coberto em event-encerramento.test.ts.
  it("o lifecycle NUNCA olha para a coluna do banco (salvo encerramento manual)", () => {
    // Evento futuro, com peça aberta, marcado como completed no banco: está
    // ativo, e a UI que lê lifecycle não pode ser enganada pelo dado sujo.
    const r = enriquecer(evento({ status: "completed" }), pecas("draft", 3));

    expect(r.lifecycle).toBe("active");
    expect(r.nextMilestone).not.toBeNull();
  });

  it("não inventa vocabulário: valor inesperado na coluna é preservado", () => {
    const r = enriquecer(evento({ status: "em_revisao" }), pecas("draft", 1));

    expect(r.status).toBe("em_revisao");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("contrato do payload", () => {
  it("mantém as identidades aritméticas que a UI usa para o progresso", () => {
    const r = enriquecer(evento(), [
      ...pecas("delivered", 4),
      ...pecas("canceled", 2),
      ...pecas("draft", 3),
    ]);

    expect(r.activeItemCount).toBe(r.itemCount - r.canceledCount);
    expect(r.openCount).toBe(r.activeItemCount - r.deliveredCount);
    expect(r.itemCount).toBe(9);
    expect(r.activeItemCount).toBe(7); // denominador: canceladas fora
    expect(r.deliveredCount).toBe(4);
    expect(r.openCount).toBe(3);
  });

  it("devolve itens e patrocinadores no mesmo formato para lista e detalhe", () => {
    // A divergência lista x detalhe era metade do bug: as duas rotas usam
    // ESTA função, então a forma tem de ser uma só.
    const itens = pecas("draft", 2);
    const patrocinadores = [{ id: "es-1", sponsorId: "sp-1", quota: "MASTER" }];
    const r = enriquecer(evento(), itens, HOJE, patrocinadores);

    expect(r.items).toEqual(itens);
    expect(r.sponsors).toEqual(patrocinadores);
  });

  it("expõe os campos derivados que a UI consome", () => {
    const r = enriquecer(evento(), pecas("draft", 1));

    for (const campo of [
      "status", "eventHasPassed", "allDelivered", "lifecycle",
      "itemCount", "activeItemCount", "deliveredCount", "canceledCount",
      "openCount", "nextMilestone", "items", "sponsors",
    ]) {
      expect(r).toHaveProperty(campo);
    }
  });
});
