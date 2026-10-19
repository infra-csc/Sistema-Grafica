// ─────────────────────────────────────────────────────────────────────────────
// ANÁLISES › PRÉ-PRODUÇÃO › "EVENTOS × PROCESSO × PRAZO" — a regra de
// @shared/painel-operacional (eventosProcessoPrazo, pendeNaFase,
// pecasDaFaseDoEvento, ordenarCalendario), na especificação do pacote do dono:
//   · só eventos com data ≥ hoje; desses, os com fase na janela (hoje..hoje+14),
//     data do evento na janela ou fase atrasada;
//   · pendentes CUMULATIVOS por fase (1–4: fase atual ≤ N e ainda não passou
//     por N; a isenta de aprovação não conta na 2; 5: toda peça não entregue);
//   · cores/atraso; ordenação com empates e prazos vazios no fim;
//   · critério 4: a Produção gráfica bate com a Gestão de Prazos (mesma fonte).
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import {
  eventosProcessoPrazo, pendeNaFase, pecasDaFaseDoEvento, ordenarCalendario, montarPainelOperacional, somarDias,
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
    fases: [d(-40), ...prazos].map((p, i) => ({ ordem: i, etapa: "", prazo: p ?? "", pendentes: 0, dias: 0, situacao: "No prazo" as const })),
  };
}
let seq = 0;
function peca(ev: string, fase: number, over: Partial<PecaDaLinha> = {}): PecaDaLinha {
  seq += 1;
  return {
    id: `x${seq}`, displayId: String(seq), evento: ev, eventoId: ev, tipo: "", descricao: "", medida: "", material: "", acabamento: "",
    quantidade: 1, reuso: 0, unidades: 1, m2: 1, status: "", etapa: null, fase, prazoFase: null, diasAtraso: 0, prazoProducao: d(10),
    impresso: false, impressoEm: null, acabado: false, acabadoEm: null, furaFila: false, refacao: false, motivoRefacao: "",
    reprovada: false, semAprovacao: false, ...over,
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

describe("Eventos × processo × prazo — peças pendentes por fase (cumulativo)", () => {
  const ev = evento("e", d(10), [d(-5), d(-2), d(3), d(8), d(20)]);
  const pecas = [
    peca("e", 0), // Lista de imagens: passa por todas
    peca("e", 1), peca("e", 1, { semAprovacao: true }), // a isenta pula a aprovação
    peca("e", 0, { semAprovacao: true }),
    peca("e", 2), peca("e", 3), peca("e", 4),
    peca("e", 5), // produção: só na fase 5
    peca("e", 6), // entregue: em nenhuma
    peca("outro", 1), // outro evento
  ];
  const l = eventosProcessoPrazo(painelDe([ev], pecas)).linhas[0];
  const pend = l.fases.map((f) => f.pendentes);

  it("fases 1–4: fase atual ≤ N e ainda não passou por N; a isenta de aprovação não conta na 2", () => {
    // f1: 0, 1, 1s, 0s = 4 · f2: 0, 1, 2 = 3 (as duas isentas fora) · f3: 0,1,1s,0s,2,3 = 6 · f4: + 4 = 7
    expect(pend.slice(0, 4)).toEqual([4, 3, 6, 7]);
  });
  it("fase 5 (produção gráfica): toda peça do evento ainda não entregue", () => {
    expect(pend[4]).toBe(8);
    expect(pendeNaFase({ fase: 6, semAprovacao: false }, 5)).toBe(false);
    expect(pendeNaFase({ fase: 0, semAprovacao: false }, 5)).toBe(true);
  });
  it("NÃO é a regra da tabela de pendências (lá cada peça conta uma vez, onde está)", () => {
    const tabela = pendenciasPorEvento({ hoje: HOJE, eventos: [ev], pecas }).find((r) => r.evento === "e")!;
    expect(tabela.pendentes.revisao).toBe(1);
    expect(pend[3]).toBe(7);
  });
  it("o quadro da célula lista exatamente as peças contadas nela (critério 5)", () => {
    for (const f of l.fases) {
      const lista = pecasDaFaseDoEvento({ pecas }, "e", f.n);
      expect(lista).toHaveLength(f.pendentes);
      expect(lista.every((p) => p.evento === "e")).toBe(true);
    }
    expect(pecasDaFaseDoEvento({ pecas }, "e", 2).some((p) => p.semAprovacao)).toBe(false);
  });
  it("cores e atraso: vencida com pendência, próximos 15 dias, depois, concluída, sem prazo", () => {
    expect(l.fases.map((f) => f.situacao)).toEqual(["atrasada", "atrasada", "proxima", "proxima", "depois"]);
    expect(l.fases.map((f) => f.diasAtraso)).toEqual([5, 2, 0, 0, 0]);
    expect(l.fasesAtrasadas).toBe(2);

    const borda = evento("b", d(5), [d(14), d(15), null, d(-1), d(0)]);
    const so5 = eventosProcessoPrazo(painelDe([borda], [peca("b", 1), peca("b", 5)])).linhas[0];
    // f1 hoje+14 → próxima · f2 hoje+15 → depois · f3 sem prazo · f4 vencida mas só a peça
    // de produção ainda falta? Não: a peça da fase 1 também passa pela 4 → atrasada.
    expect(so5.fases.map((f) => f.situacao)).toEqual(["proxima", "depois", "semPrazo", "atrasada", "proxima"]);
    const concl = eventosProcessoPrazo(painelDe([borda], [peca("b", 5)])).linhas[0];
    expect(concl.fases.map((f) => f.situacao)).toEqual(["concluida", "concluida", "semPrazo", "concluida", "proxima"]);
    expect(concl.fasesAtrasadas).toBe(0);
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
    nomeDoEvento: new Map(EVENTOS.map((e) => [e.id, e.name])), remessasConhecidas: new Set(),
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
  it("Produção gráfica: pendentes = pendingCount da etapa na Gestão de Prazos, evento a evento e na soma das vermelhas", () => {
    for (const l of r.linhas) {
      const ev = prazos.find((e) => e.id === l.evento.chave)!;
      expect(l.fases[4].pendentes, l.evento.nome).toBe(ev.stages[5].pendingCount);
    }
    const vermelhas = r.linhas.filter((l) => l.fases[4].situacao === "atrasada");
    expect(vermelhas.length).toBeGreaterThan(0);
    const soma = vermelhas.reduce((s, l) => s + l.fases[4].pendentes, 0);
    const daGestao = vermelhas.reduce((s, l) => s + prazos.find((e) => e.id === l.evento.chave)!.stages[5].pendingCount, 0);
    expect(soma).toBe(daGestao);
    // e1: pronto p/ produção, ag. envio, rascunho e impresso — entregue, cancelada e BOOK fora.
    expect(r.linhas.find((l) => l.evento.chave === "e1")!.fases[4].pendentes).toBe(4);
  });
  it("aprovação, finalização e revisão final também coincidem com a pendência acumulada da Gestão", () => {
    for (const l of r.linhas) {
      const ev = prazos.find((e) => e.id === l.evento.chave)!;
      for (const n of [2, 3, 4]) expect(l.fases[n - 1].pendentes, `${l.evento.nome} f${n}`).toBe(ev.stages[n].pendingCount);
    }
  });
});
