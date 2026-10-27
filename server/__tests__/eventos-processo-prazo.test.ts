// ─────────────────────────────────────────────────────────────────────────────
// ANÁLISES › PRÉ-PRODUÇÃO › "EVENTOS × PROCESSO × PRAZO" — a regra de
// @shared/painel-operacional (eventosProcessoPrazo, pendeNaFase,
// pecasDaFaseDoEvento, ordenarCalendario), na especificação do pacote do dono:
//   · só eventos com data ≥ hoje; desses, os com fase na janela (hoje..hoje+14),
//     data do evento na janela ou fase atrasada;
//   · cada peça conta UMA vez, na fase em que está agora (dono, 20/10: "o
//     registro tá aparecendo em todas as colunas"): 1–4 = processo atual (a
//     isenta de aprovação nunca na 2); 5 = liberada p/ a gráfica e não entregue;
//     é a mesma regra da tabela "Pendências de pré-produção";
//   · cores/atraso: a peça atrasada no layout não pinta as fases seguintes;
//     "aguardando" (nada na fase, peças antes) × "concluida" (nada nem antes);
//   · ordenação com empates e prazos vazios no fim;
//   · critério 4: prazos = Gestão de Prazos; produção = peças cobradas na etapa
//     (directCount); as cinco colunas somam as não entregues (pendingCount).
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import {
  eventosProcessoPrazo, pendeNaFase, antesDaFase, pecasDaFaseDoEvento, ordenarCalendario, montarPainelOperacional, somarDias,
  pendenciasPorEvento,
  type EventoDoPainel, type PecaDaLinha, type PecaDoPainel, type PainelOperacional,
} from "@shared/painel-operacional";
import { buildEventPrazo, computeKpis, type DomainEvent } from "../services/prazo-domain";
import { businessDayStrToMs } from "@shared/prazo-dates";
import type { PrazoEvent } from "@shared/prazos-contract";
import { ehBookCompleto } from "@shared/fluxo-peca";

const HOJE = "2026-10-16";
const d = (n: number) => somarDias(HOJE, n);

// ── Peças e eventos à mão (as regras isoladas) ──────────────────────────────
function evento(chave: string, dataEvento: string, prazos: (string | null)[], saida = d(30)): EventoDoPainel {
  return {
    chave, eventoId: chave, nome: chave.toUpperCase(), dataEvento, saidaCaminhao: saida, situacao: "Em dia",
    diasParaSaida: 0, totalPecas: 0, entregues: 0, pecasEmAtraso: 0, piorAtrasoDias: 0,
    // índice 0 = Lista de imagens (fora da tela); 1..5 = as cinco colunas.
    fases: [d(-40), ...prazos].map((p, i) => ({ ordem: i, etapa: "", prazo: p ?? "", prazoEfetivo: p ?? "", pendentes: 0, dias: 0, situacao: "No prazo" as const })),
  };
}
let seq = 0;
function peca(ev: string, fase: number, over: Partial<PecaDaLinha> = {}): PecaDaLinha {
  seq += 1;
  return {
    id: `x${seq}`, displayId: String(seq), evento: ev, eventoId: ev, tipo: "", descricao: "", medida: "", material: "", acabamento: "",
    quantidade: 1, reuso: 0, unidades: 1, m2: 1, status: "", etapa: null, fase, prazoFase: null, diasAtraso: 0, prazoProducao: d(10),
    impresso: false, impressoEm: null, acabado: false, acabadoEm: null, furaFila: false, refacao: false, motivoRefacao: "",
    reprovada: false, semAprovacao: false, semPatrocinio: false, arteDoCliente: false, aguardandoArteCliente: false,
    diasAguardandoArte: null, atrasoDoCliente: false, piso: null, prazoDeLayout: null, ...over,
  };
}
const painelDe = (eventos: EventoDoPainel[], pecas: PecaDaLinha[]): Pick<PainelOperacional, "hoje" | "eventos" | "pecas"> => ({ hoje: HOJE, eventos, pecas });
const prazosNaFrente = [d(20), d(22), d(24), d(26), d(30)]; // tudo fora da janela

describe("Eventos × processo × prazo — quais eventos entram", () => {
  const eventos = [
    evento("passado", d(-1), [d(-20), d(-15), d(-10), d(-5), d(-2)]), // data < hoje: nunca entra, mesmo atrasado
    evento("hoje", HOJE, prazosNaFrente), // data do evento = hoje (na janela)
    evento("longe", d(60), prazosNaFrente), // nada na janela, nada atrasado: fora
    evento("fase-na-janela", d(60), [d(20), d(14), d(24), d(26), d(30)]), // aprovação em hoje+14: entra
    evento("fase-fora", d(60), [d(15), d(22), d(24), d(26), d(30)]), // hoje+15 já é fora
    evento("atrasado", d(60), [d(-3), d(22), d(24), d(26), d(30)]), // layout vencido com peça: entra
    evento("vencida-concluida", d(60), [d(-3), d(22), d(24), d(26), d(30)]), // vencida SEM peça na fase: não é atraso
    evento("data-na-janela", d(14), prazosNaFrente), // data do evento em hoje+14: entra
  ];
  const pecas = [
    peca("passado", 1), peca("hoje", 5), peca("longe", 1), peca("fase-na-janela", 1), peca("fase-fora", 1),
    peca("atrasado", 1), peca("vencida-concluida", 3), peca("data-na-janela", 2),
  ];
  const r = eventosProcessoPrazo(painelDe(eventos, pecas));
  const chaves = r.linhas.map((l) => l.evento.chave);

  it("nenhum evento com data anterior a hoje (critério 2)", () => {
    expect(chaves).not.toContain("passado");
    expect(r.linhas.every((l) => l.evento.dataEvento >= HOJE)).toBe(true);
  });
  it("entram: fase na janela de 15 dias, data do evento na janela ou fase atrasada", () => {
    expect(new Set(chaves)).toEqual(new Set(["hoje", "fase-na-janela", "atrasado", "data-na-janela"]));
    expect(r.fim).toBe(d(14));
    expect(r.total).toBe(4);
    expect(r.comAtraso).toBe(1);
  });
  it("prazo vencido sem peça pendente não é atraso (e o evento não entra por ele)", () => {
    expect(chaves).not.toContain("vencida-concluida");
  });
  it("somente com fase atrasada esconde os outros, sem mudar o total", () => {
    const so = eventosProcessoPrazo(painelDe(eventos, pecas), { soAtrasadas: true });
    expect(so.linhas.map((l) => l.evento.chave)).toEqual(["atrasado"]);
    expect(so.total).toBe(4);
    expect(so.comAtraso).toBe(1);
  });
});

describe("Eventos × processo × prazo — cada peça conta uma vez, na fase em que está agora", () => {
  const ev = evento("e", d(10), [d(-5), d(-2), d(3), d(8), d(20)]);
  const pecas = [
    peca("e", 0), // Lista de imagens: conta no layout (o primeiro processo dela)
    peca("e", 1), peca("e", 1, { semAprovacao: true }), // isenta parada no layout: só no layout
    peca("e", 0, { semAprovacao: true }),
    peca("e", 2), // na aprovação
    peca("e", 2, { semAprovacao: true }), // isenta "na aprovação": o processo dela é a finalização
    peca("e", 3), peca("e", 4),
    peca("e", 5), // liberada para a gráfica: só na produção
    peca("e", 6), // entregue: em nenhuma
    peca("outro", 1), // outro evento
  ];
  const l = eventosProcessoPrazo(painelDe([ev], pecas)).linhas[0];
  const pend = l.fases.map((f) => f.pendentes);

  it("a peça parada no layout aparece só no layout (não se repete nas colunas seguintes)", () => {
    // f1: 0, 1, 1s, 0s = 4 · f2: 2 = 1 · f3: 2s, 3 = 2 · f4: 4 = 1 · f5: 5 = 1
    expect(pend).toEqual([4, 1, 2, 1, 1]);
    const so = eventosProcessoPrazo(painelDe([ev], [peca("e", 1)])).linhas[0];
    expect(so.fases.map((f) => f.pendentes)).toEqual([1, 0, 0, 0, 0]);
    for (const n of [1, 2, 3, 4, 5]) expect(pendeNaFase({ fase: 1, semAprovacao: false }, n), `f${n}`).toBe(n === 1);
  });
  it("a isenta de aprovação nunca conta na fase 2", () => {
    expect(pecasDaFaseDoEvento({ pecas }, "e", 2).some((p) => p.semAprovacao)).toBe(false);
    for (const fase of [0, 1, 2, 3, 4, 5, 6]) expect(pendeNaFase({ fase, semAprovacao: true }, 2), `fase ${fase}`).toBe(false);
    expect(pendeNaFase({ fase: 2, semAprovacao: true }, 3)).toBe(true);
  });
  it("fase 5 (produção gráfica): só as liberadas para a gráfica e ainda não entregues", () => {
    expect(pend[4]).toBe(1);
    expect(pendeNaFase({ fase: 5, semAprovacao: false }, 5)).toBe(true);
    expect(pendeNaFase({ fase: 6, semAprovacao: false }, 5)).toBe(false);
    for (const fase of [0, 1, 2, 3, 4]) expect(pendeNaFase({ fase, semAprovacao: false }, 5), `fase ${fase}`).toBe(false);
  });
  it("as cinco colunas somadas = peças não entregues do evento (cada uma em exatamente uma)", () => {
    const naoEntregues = pecas.filter((p) => p.evento === "e" && p.fase < 6);
    expect(pend.reduce((s, x) => s + x, 0)).toBe(naoEntregues.length);
    for (const p of naoEntregues) expect([1, 2, 3, 4, 5].filter((n) => pendeNaFase(p, n)), `peça fase ${p.fase}`).toHaveLength(1);
  });
  it("É a mesma regra da tabela Pendências de pré-produção (fases 1–4, pendentes e atrasados)", () => {
    const tabela = pendenciasPorEvento({ hoje: HOJE, eventos: [ev], pecas }).find((r) => r.evento === "e")!;
    expect(pend.slice(0, 4)).toEqual([tabela.pendentes.layout, tabela.pendentes.aprovacao, tabela.pendentes.finalizacao, tabela.pendentes.revisao]);
    // Atrasadas: as fases vermelhas daqui são as colunas com atrasados lá, com a mesma contagem.
    const atrasadosAqui = l.fases.slice(0, 4).map((f) => (f.situacao === "atrasada" ? f.pendentes : 0));
    expect(atrasadosAqui).toEqual([tabela.atrasados.layout, tabela.atrasados.aprovacao, tabela.atrasados.finalizacao, tabela.atrasados.revisao]);
  });
  it("o quadro da célula lista exatamente as peças contadas nela (critério 5)", () => {
    for (const f of l.fases) {
      const lista = pecasDaFaseDoEvento({ pecas }, "e", f.n);
      expect(lista).toHaveLength(f.pendentes);
      expect(lista.every((p) => p.evento === "e")).toBe(true);
    }
  });
  it("cores e atraso: vencida com peça na fase, próximos 15 dias, depois, aguardando, concluída, sem prazo", () => {
    expect(l.fases.map((f) => f.situacao)).toEqual(["atrasada", "atrasada", "proxima", "proxima", "depois"]);
    expect(l.fases.map((f) => f.diasAtraso)).toEqual([5, 2, 0, 0, 0]);
    expect(l.fasesAtrasadas).toBe(2);

    const borda = evento("b", d(5), [d(14), d(15), null, d(-1), d(0)]);
    const doisCantos = eventosProcessoPrazo(painelDe([borda], [peca("b", 1), peca("b", 5)])).linhas[0];
    // f1 hoje+14 → próxima · f2 hoje+15 sem peça nela, mas a do layout ainda vem → aguardando
    // · f3 sem prazo · f4 vencida sem peça nela (a do layout não conta aqui) → aguardando, não
    // atrasada · f5 hoje, com a peça liberada → próxima.
    expect(doisCantos.fases.map((f) => f.situacao)).toEqual(["proxima", "aguardando", "semPrazo", "aguardando", "proxima"]);
    expect(doisCantos.fases.map((f) => f.pendentes)).toEqual([1, 0, 0, 0, 1]);
    expect(doisCantos.fasesAtrasadas).toBe(0);
    const concl = eventosProcessoPrazo(painelDe([borda], [peca("b", 5)])).linhas[0];
    expect(concl.fases.map((f) => f.situacao)).toEqual(["concluida", "concluida", "semPrazo", "concluida", "proxima"]);
    expect(concl.fasesAtrasadas).toBe(0);
  });
  it("uma peça atrasada no layout NÃO deixa as fases seguintes vermelhas", () => {
    const tudoVencido = evento("v", d(5), [d(-10), d(-8), d(-6), d(-4), d(-2)]);
    const l1 = eventosProcessoPrazo(painelDe([tudoVencido], [peca("v", 1)])).linhas[0];
    expect(l1.fases.map((f) => f.situacao)).toEqual(["atrasada", "aguardando", "aguardando", "aguardando", "aguardando"]);
    expect(l1.fases.map((f) => f.pendentes)).toEqual([1, 0, 0, 0, 0]);
    expect(l1.fases.map((f) => f.aCaminho)).toEqual([0, 1, 1, 1, 1]);
    expect(l1.fases.map((f) => f.diasAtraso)).toEqual([10, 0, 0, 0, 0]);
    expect(l1.fasesAtrasadas).toBe(1);
  });
  it("aguardando = nenhuma peça na fase, mas peças antes; concluída = nada na fase nem antes", () => {
    const ev2 = evento("w", d(5), prazosNaFrente);
    // Uma na finalização, uma na produção, uma entregue.
    const w = eventosProcessoPrazo(painelDe([ev2], [peca("w", 3), peca("w", 5), peca("w", 6)])).linhas[0];
    expect(w.fases.map((f) => f.situacao)).toEqual(["concluida", "concluida", "depois", "aguardando", "depois"]);
    expect(w.fases.map((f) => f.aCaminho)).toEqual([0, 0, 0, 1, 1]);
    // A da Lista de imagens está antes de todas (conta no layout).
    const li = eventosProcessoPrazo(painelDe([ev2], [peca("w", 0)])).linhas[0];
    expect(li.fases.map((f) => f.situacao)).toEqual(["depois", "aguardando", "aguardando", "aguardando", "aguardando"]);
    // Só entregues: tudo concluído, nada a caminho.
    const ent = eventosProcessoPrazo(painelDe([ev2], [peca("w", 6)])).linhas[0];
    expect(ent.fases.map((f) => f.situacao)).toEqual(["concluida", "concluida", "concluida", "concluida", "concluida"]);
    expect(ent.fases.every((f) => f.aCaminho === 0)).toBe(true);
    expect(antesDaFase({ fase: 6, semAprovacao: false }, 5)).toBe(false);
    expect(antesDaFase({ fase: 4, semAprovacao: false }, 5)).toBe(true);
    expect(antesDaFase({ fase: 5, semAprovacao: false }, 5)).toBe(false);
    expect(antesDaFase({ fase: 3, semAprovacao: false }, 3)).toBe(false);
  });
  it("evento sem nenhuma peça: marcado semPecas (a tela não diz 'concluída')", () => {
    const vazio = eventosProcessoPrazo(painelDe([evento("v", d(3), prazosNaFrente)], [])).linhas[0];
    expect(vazio.semPecas).toBe(true);
    expect(vazio.fases.every((f) => f.pendentes === 0)).toBe(true);
  });
  it("saída do caminhão já passou", () => {
    const r = eventosProcessoPrazo(painelDe([evento("s", d(3), prazosNaFrente, d(-1)), evento("t", d(3), prazosNaFrente, HOJE)], []));
    expect(r.linhas.find((x) => x.evento.chave === "s")!.saidaPassou).toBe(true);
    expect(r.linhas.find((x) => x.evento.chave === "t")!.saidaPassou).toBe(false);
  });
});

describe("Eventos × processo × prazo — ordenação", () => {
  const eventos = [
    evento("a", d(9), [d(1), d(2), d(3), d(4), d(5)]),
    evento("b", d(3), [d(1), d(2), d(3), d(4), d(8)]),
    evento("c", d(5), [d(-2), d(2), d(3), d(4), null]), // atrasado; produção sem prazo
    evento("d", d(4), [d(1), d(2), d(3), d(4), d(5)]), // empata com "a" na produção
    evento("ê", d(12), [d(1), d(2), d(3), d(4), null]), // sem prazo de produção
  ];
  const pecas = eventos.map((e) => peca(e.chave, 1));
  const linhas = eventosProcessoPrazo(painelDe(eventos, pecas)).linhas;
  const ordem = (coluna: Parameters<typeof ordenarCalendario>[1]) => ordenarCalendario(linhas, coluna).map((l) => l.evento.chave);

  it("padrão: com fase atrasada primeiro, depois pela data do evento", () => {
    expect(linhas.map((l) => l.evento.chave)).toEqual(["c", "b", "d", "a", "ê"]);
  });
  it("fase: pela data do prazo; empate pela data do evento; prazo vazio no fim nos dois sentidos", () => {
    expect(ordem({ coluna: "f5", direcao: "asc" })).toEqual(["d", "a", "b", "c", "ê"]);
    expect(ordem({ coluna: "f5", direcao: "desc" })).toEqual(["b", "d", "a", "c", "ê"]);
  });
  it("evento (nome, pt-BR), data do evento e saída", () => {
    expect(ordem({ coluna: "evento", direcao: "asc" })).toEqual(["a", "b", "c", "d", "ê"]);
    expect(ordem({ coluna: "evento", direcao: "desc" })).toEqual(["ê", "d", "c", "b", "a"]);
    expect(ordem({ coluna: "data_evento", direcao: "asc" })).toEqual(["b", "d", "c", "a", "ê"]);
    expect(ordem({ coluna: "data_evento", direcao: "desc" })).toEqual(["ê", "a", "c", "d", "b"]);
    // saída igual em todos: empate inteiro pela data do evento
    expect(ordem({ coluna: "saida", direcao: "desc" })).toEqual(["b", "d", "c", "a", "ê"]);
  });
});

// ── Critério 4: a mesma fonte da Gestão de Prazos ───────────────────────────
describe("Eventos × processo × prazo — bate com a Gestão de Prazos (critério 4)", () => {
  const HOJE_MS = businessDayStrToMs(HOJE);
  const EVENTOS: DomainEvent[] = [
    { id: "e1", name: "Copa Norte", status: "created", startDate: "2026-10-20", truckDepartureDate: "2026-10-14T00:00:00.000Z" },
    { id: "e2", name: "Abertura Sul", status: "created", startDate: "2026-11-01", truckDepartureDate: "2026-10-30T00:00:00.000Z" },
    { id: "e3", name: "Trilha Oeste", status: "created", startDate: "2026-11-20", truckDepartureDate: "2026-11-18T00:00:00.000Z" },
  ];
  let n = 0;
  const p = (eventId: string, status: string, over: Partial<PecaDoPainel> = {}): PecaDoPainel => ({
    id: `q${++n}`, displayId: String(n), eventId, status, type: "Banner", description: `Peça ${n}`, quantity: 1, reuseQty: 0, ...over,
  });
  const PECAS = [
    p("e1", "ready_for_production"), p("e1", "awaiting_submission", { isPriority: true }), p("e1", "draft"),
    p("e1", "delivered"), p("e1", "produced"), p("e1", "canceled"), p("e1", "ready_for_production", { type: "BOOK COMPLETO" }),
    p("e2", "awaiting_submission", { skipApproval: true }), p("e2", "awaiting_sponsor_approval"), p("e2", "awaiting_final_review"),
    p("e2", "conferred"), p("e2", "packed"), p("e2", "delivered"),
    p("e3", "draft", { skipApproval: true }), p("e3", "awaiting_submission"),
  ];
  const prazos = EVENTOS
    // Como o serviço: BOOK COMPLETO sai antes de buildEventPrazo.
    .map((ev) => buildEventPrazo(ev, PECAS.filter((x) => x.eventId === ev.id && !ehBookCompleto(x)).map((x) => ({ ...x, quantity: x.quantity ?? 1, type: x.type ?? "" })) as never, { today: HOJE_MS }))
    .filter((e): e is PrazoEvent => !!e).map((e) => ({ ...e, eventId: e.id, kit: null }));
  const painel = montarPainelOperacional({
    pecas: PECAS, prazos, kpis: computeKpis(prazos), hoje: HOJE, geradoEm: new Date().toISOString(),
    nomeDoEvento: new Map(EVENTOS.map((e) => [e.id, e.name])),
  });
  const r = eventosProcessoPrazo(painel);

  it("os eventos de teste entram (e1 atrasado, e2 e e3 com fase na janela)", () => {
    expect(r.linhas.map((l) => l.evento.chave).sort()).toEqual(["e1", "e2", "e3"]);
  });
  it("prazos das células = prazos da Gestão de Prazos (Produção Gráfica seg–sáb já aplicada)", () => {
    for (const l of r.linhas) {
      const ev = prazos.find((e) => e.id === l.evento.chave)!;
      expect(l.fases.map((f) => f.prazo)).toEqual(ev.stages.slice(1).map((s) => s.deadline));
    }
  });
  it("Produção gráfica: pendentes = peças cobradas na etapa pela Gestão (directCount), evento a evento e na soma das vermelhas", () => {
    for (const l of r.linhas) {
      const ev = prazos.find((e) => e.id === l.evento.chave)!;
      expect(l.fases[4].pendentes, l.evento.nome).toBe(ev.stages[5].directCount);
    }
    const vermelhas = r.linhas.filter((l) => l.fases[4].situacao === "atrasada");
    expect(vermelhas.length).toBeGreaterThan(0);
    const soma = vermelhas.reduce((s, l) => s + l.fases[4].pendentes, 0);
    const daGestao = vermelhas.reduce((s, l) => s + prazos.find((e) => e.id === l.evento.chave)!.stages[5].directCount, 0);
    expect(soma).toBe(daGestao);
    // e1: só pronto p/ produção e impresso — ag. envio e rascunho estão em fases
    // anteriores; entregue, cancelada e BOOK fora.
    expect(r.linhas.find((l) => l.evento.chave === "e1")!.fases[4].pendentes).toBe(2);
  });
  it("as cinco colunas somadas = peças não entregues do evento (o pendingCount acumulado da Produção Gráfica na Gestão)", () => {
    for (const l of r.linhas) {
      const ev = prazos.find((e) => e.id === l.evento.chave)!;
      const soma = l.fases.reduce((s, f) => s + f.pendentes, 0);
      expect(soma, l.evento.nome).toBe(ev.stages[5].pendingCount);
      const naoEntregues = painel.pecas.filter((p) => p.evento === l.evento.chave && p.fase < 6).length;
      expect(soma, l.evento.nome).toBe(naoEntregues);
    }
    // e1: ag. envio + rascunho no layout, as duas liberadas na produção.
    expect(r.linhas.find((l) => l.evento.chave === "e1")!.fases.map((f) => f.pendentes)).toEqual([2, 0, 0, 0, 2]);
  });
  it("fases 1–4 batem com a tabela Pendências de pré-produção do mesmo painel", () => {
    const tabela = pendenciasPorEvento(painel);
    for (const l of r.linhas) {
      const t = tabela.find((x) => x.evento === l.evento.chave);
      const naTabela = t ? [t.pendentes.layout, t.pendentes.aprovacao, t.pendentes.finalizacao, t.pendentes.revisao] : [0, 0, 0, 0];
      expect(l.fases.slice(0, 4).map((f) => f.pendentes), l.evento.nome).toEqual(naTabela);
    }
  });
});
