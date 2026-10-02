// ─────────────────────────────────────────────────────────────────────────────
// A RÉGUA DE STATUS DA NOVA ANÁLISES (client/src/lib/analises-estado.ts).
//
// O que se prende aqui, e por quê:
//   · a ETAPA de cada peça é a da régua canônica (shared/fluxo-peca), com o
//     molde produzido contando como entregue;
//   · o ATRASO é o MESMO da Gestão de Prazos — o cliente não pode importar
//     server/services/prazo-domain, então a conta é espelhada e este teste
//     compara as duas: o dia do marco por um ano inteiro, o marco da peça
//     isenta de aprovação, e a lista de atrasadas peça a peça contra
//     buildEventPrazo + computePecasAtrasadas;
//   · a IDADE desconhecida (statusChangedAt NULL) nunca vira "0 dias";
//   · peça pendente de evento encerrado/realizado NÃO está em andamento;
//   · os FILTROS do topo (evento, patrocinador via sponsors[], tipo sem
//     distinguir grafia, atalhos que somam).
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import {
  FASE_DA_ETAPA, chaveDoTipo, criarLeitor, diaDoMarco, ehCorrecaoDaArte, faixaDaIdade, filtrarPecas,
  indiceDoMarco, lerPeca, opcoesDeTipo, pecasDaFilaDaArte, resumirEstado, resumirGrupo,
  type EventoDoEstado, type PecaDoEstado,
} from "@/lib/analises-estado";
import { businessDayMs } from "@/lib/analises-metrics";
import { STATUS_CONHECIDOS, etapaDaPeca } from "@shared/fluxo-peca";
import {
  STAGE_DEFS, buildEventPrazo, marcoIndexFor, stageDeadline, type DomainEvent, type DomainItem,
} from "../services/prazo-domain";
import { computePecasAtrasadas } from "@/components/prazos/atrasadas";

const DIA = 86_400_000;
// Uma quarta-feira ao meio-dia em Brasília: longe da virada do dia.
const HOJE = new Date("2026-10-07T15:00:00Z");
const HOJE_DIA = businessDayMs(HOJE.getTime());
const isoDia = (deltaDias: number) => new Date(HOJE_DIA + deltaDias * DIA).toISOString();

const evento = (id: string, saidaEmDias: number, extra: Partial<EventoDoEstado> = {}): EventoDoEstado => ({
  id, name: `Evento ${id}`, truckDepartureDate: isoDia(saidaEmDias), startDate: isoDia(saidaEmDias + 3), status: "created", ...extra,
});
let seq = 0;
const peca = (eventId: string, status: string, extra: Partial<PecaDoEstado> & Record<string, unknown> = {}): PecaDoEstado & Record<string, unknown> => ({
  id: `p${++seq}`, displayId: String(1000 + seq), eventId, status, type: "Banner", quantity: 1,
  statusChangedAt: isoDia(-2), sponsors: [], ...extra,
});

describe("o prazo da etapa é o mesmo do servidor", () => {
  it("o dia do marco bate com stageDeadline em todo dia de um ano, para todo marco", () => {
    const inicio = Date.UTC(2026, 0, 1);
    for (let d = 0; d < 366; d++) {
      const saida = inicio + d * DIA;
      for (const def of STAGE_DEFS) {
        const esperado = stageDeadline(new Date(saida), def.defaultOffset, def.allDays).getTime();
        expect(diaDoMarco(saida, def.defaultOffset, def.allDays), `${def.key} saída ${new Date(saida).toISOString()}`).toBe(esperado);
      }
    }
  });

  it("o marco que mede a peça é o de marcoIndexFor — inclusive a isenta de aprovação", () => {
    for (const status of STATUS_CONHECIDOS) {
      for (const skip of [false, true]) {
        const esperado = marcoIndexFor(status, skip);
        expect(indiceDoMarco(etapaDaPeca(status), skip) ?? undefined, `${status} skip=${skip}`).toBe(esperado);
      }
    }
  });

  it("as atrasadas são EXATAMENTE as da Gestão de Prazos, peça a peça", () => {
    const ev: EventoDoEstado & DomainEvent = {
      ...(evento("e1", 9) as EventoDoEstado & { startDate: string; truckDepartureDate: string }),
      status: "created", startDate: isoDia(12), truckDepartureDate: isoDia(9),
      deadlineFinalizacao: -10, deadlineRevisaoLista: -8,
    };
    // Saída em 9 dias: Lista (−25), Layouts (−20), Aprovação (−12) e
    // Finalização (−10) já venceram; Revisão (−8) e Produção (−1) não.
    const pecas = [
      peca("e1", "draft"), peca("e1", "awaiting_linking"), peca("e1", "awaiting_submission"),
      peca("e1", "awaiting_submission", { skipApproval: true }), peca("e1", "awaiting_sponsor_approval"),
      peca("e1", "sponsor_approved"), peca("e1", "awaiting_final_review"), peca("e1", "ready_for_production"),
      peca("e1", "inProduction"), peca("e1", "packed"), peca("e1", "delivered"), peca("e1", "canceled"),
    ];
    const dominio = buildEventPrazo(ev, pecas as unknown as DomainItem[], { today: HOJE_DIA });
    expect(dominio).not.toBeNull();
    const doServidor = new Set(computePecasAtrasadas([dominio!]).map((a) => a.item.id));

    const ler = criarLeitor<PecaDoEstado>(new Map([[ev.id, ev]]), HOJE);
    const daqui = new Set(pecas.filter((p) => ler(p).atrasada).map((p) => p.id));
    expect(daqui).toEqual(doServidor);
    expect(daqui.size).toBe(6);
    // E os dias de atraso também batem.
    for (const a of computePecasAtrasadas([dominio!])) {
      expect(ler(pecas.find((p) => p.id === a.item.id)!).diasDeAtraso).toBe(a.diasAtraso);
    }
  });

  it("evento sem saída válida não tem prazo — e não acusa atraso", () => {
    const ev = evento("e2", 0, { truckDepartureDate: "0206-10-10T00:00:00Z" });
    const l = lerPeca(peca("e2", "draft"), ev, HOJE);
    expect(l.prazo).toBeNull();
    expect(l.atrasada).toBe(false);
    expect(l.situacao).toBe("ativa");
  });

  it("a peça do Kit é medida pelas datas embutidas nela (a remessa), não pelas do evento", () => {
    const ev = evento("e3", 30);
    const l = lerPeca(peca("e3", "draft", { event: { ...ev, truckDepartureDate: isoDia(10) } }), ev, HOJE);
    // Lista de Imagens a −25 de uma saída em 10 dias: venceu há 15 (ajuste de fim de semana à parte).
    expect(l.atrasada).toBe(true);
  });
});

describe("a leitura de uma peça", () => {
  const ev = evento("e1", 40);

  it("etapa e fase canônicas; molde produzido é entregue", () => {
    expect(lerPeca(peca("e1", "rascunho"), ev, HOJE).etapa).toBe("requested");
    expect(lerPeca(peca("e1", "awaiting_creator_review"), ev, HOJE).fase).toBe("arte");
    expect(lerPeca(peca("e1", "in_review"), ev, HOJE).fase).toBe("revisao");
    expect(lerPeca(peca("e1", "produced", { type: "Molde" }), ev, HOJE).situacao).toBe("entregue");
    expect(lerPeca(peca("e1", "produced"), ev, HOJE).fase).toBe("grafica");
    expect(lerPeca(peca("e1", "deleted"), ev, HOJE).situacao).toBe("fora");
    expect(lerPeca(peca("e1", "status_inventado"), ev, HOJE).situacao).toBe("desconhecida");
    expect(FASE_DA_ETAPA.canceled).toBeNull();
  });

  it("idade: a régua 7/14, e statusChangedAt NULL é DESCONHECIDA — nunca zero", () => {
    expect(faixaDaIdade(0)).toBe("0-6");
    expect(faixaDaIdade(6)).toBe("0-6");
    expect(faixaDaIdade(7)).toBe("7-13");
    expect(faixaDaIdade(13)).toBe("7-13");
    expect(faixaDaIdade(14)).toBe("14+");
    expect(faixaDaIdade(null)).toBe("desconhecida");
    const sem = lerPeca(peca("e1", "draft", { statusChangedAt: null }), ev, HOJE);
    expect(sem.diasNaFase).toBeNull();
    expect(sem.faixaDeIdade).toBe("desconhecida");
    const velha = lerPeca(peca("e1", "draft", { statusChangedAt: isoDia(-20) }), ev, HOJE);
    expect(velha.faixaDeIdade).toBe("14+");
  });

  it("pendente de evento encerrado ou já realizado sai do 'em andamento' e não é cobrada", () => {
    const encerrado = evento("e4", -30, { status: "closed" });
    const realizado = evento("e5", -10, { startDate: isoDia(-5) });
    const a = lerPeca(peca("e4", "draft"), encerrado, HOJE);
    const b = lerPeca(peca("e5", "inProduction"), realizado, HOJE);
    expect(a.situacao).toBe("eventoFinalizado");
    expect(a.eventoFinalizado).toBe("encerrado");
    expect(b.eventoFinalizado).toBe("realizado");
    expect(a.atrasada || b.atrasada).toBe(false);
  });

  it("travada e prioritária são marcas, não status", () => {
    const l = lerPeca(peca("e1", "inProduction", { travadaEm: isoDia(-1), isPriority: true }), ev, HOJE);
    expect(l.travada).toBe(true);
    expect(l.prioritaria).toBe(true);
    expect(l.etapa).toBe("inProduction");
  });
});

describe("o resumo da operação", () => {
  const ev1 = evento("a", 9);
  const ev2 = evento("b", 60);
  const fim = evento("c", -20, { status: "closed" });
  const pecas = [
    peca("a", "draft", { statusChangedAt: isoDia(-20) }),
    peca("a", "awaiting_submission"),
    peca("a", "awaiting_submission", { statusChangedAt: null }),
    peca("a", "inProduction", { travadaEm: isoDia(-1) }),
    peca("b", "awaiting_submission", { isPriority: true }),
    peca("b", "delivered", { deliveredAt: isoDia(-3) }),
    peca("a", "delivered", { deliveredAt: isoDia(-2) }),
    peca("c", "draft"),
    peca("b", "canceled"),
  ];
  const ler = criarLeitor<PecaDoEstado>(new Map([ev1, ev2, fim].map((e) => [e.id, e])), HOJE);
  const estado = resumirEstado(pecas, ler, HOJE);

  it("separa em andamento, entregues, fora e ficou-para-trás — cada peça num balde só", () => {
    expect(estado.ativas.pecas).toHaveLength(5);
    expect(estado.entregues).toHaveLength(2);
    expect(estado.foraDoFunil).toHaveLength(1);
    expect(estado.deEventoFinalizado).toHaveLength(1);
    expect(estado.ativas.pecas.length + estado.entregues.length + estado.foraDoFunil.length
      + estado.deEventoFinalizado.length + estado.statusDesconhecido.length).toBe(pecas.length);
  });

  it("por etapa, a maior fila primeiro, e a idade desconhecida contada à parte", () => {
    const envio = estado.porEtapa.find((e) => e.etapa === "awaiting_submission")!;
    expect(envio.pecas).toHaveLength(3);
    expect(estado.maioresFilas[0].etapa).toBe("awaiting_submission");
    expect(estado.ativas.idade.desconhecida).toHaveLength(1);
    expect(estado.ativas.paradas).toHaveLength(1);
    expect(estado.ativas.travadas).toHaveLength(1);
    expect(estado.ativas.prioritarias).toHaveLength(1);
    // A mais parada da lista é a de 20 dias; a sem carimbo não entra no ranking.
    expect(estado.maisParadas[0].diasNaFase).toBe(20);
    expect(estado.maisParadas.some((l) => l.diasNaFase == null)).toBe(false);
  });

  it("atrasadas por evento, a fase da Arte e as entregas no prazo", () => {
    expect(estado.porEvento[0].eventoId).toBe("a");
    expect(estado.porEvento[0].atrasadas.length).toBeGreaterThan(0);
    expect(estado.porFase.arte.pecas).toHaveLength(3);
    // A entrega de -3 é do evento b (saída em 60 dias): no prazo. A de -2 é do
    // evento a (saída em 9 dias): também no prazo.
    expect(estado.entreguesRecentes.pecas).toHaveLength(2);
    expect(estado.entreguesRecentes.noPrazo).toHaveLength(2);
  });

  it("resumirGrupo de um recorte bate com o resumo inteiro", () => {
    const g = resumirGrupo(estado.ativas.pecas, ler);
    expect(g.atrasadas).toEqual(estado.ativas.atrasadas);
    expect(g.diasMediana).toBe(estado.ativas.diasMediana);
  });
});

describe("os filtros do topo", () => {
  const ev = evento("x", 9);
  const ler = criarLeitor<PecaDoEstado>(new Map([[ev.id, ev]]), HOJE);
  const pecas = [
    peca("x", "draft", { type: "Banner", sponsors: [{ id: "s1" }] }),
    peca("x", "draft", { type: " banner ", sponsors: [{ id: "s2" }], isPriority: true }),
    peca("y", "awaiting_final_review", { type: "Pórtico", travadaEm: isoDia(-1) }),
  ];
  const nada = { evento: "all", patrocinador: "all", tipo: "all", soAtrasadas: false, soTravadas: false, soPrioritarias: false };

  it("sem filtro devolve a MESMA lista (identidade: os memos não recalculam)", () => {
    expect(filtrarPecas(pecas, nada, ler)).toBe(pecas);
  });

  it("evento, patrocinador por sponsors[] e tipo sem distinguir grafia", () => {
    expect(filtrarPecas(pecas, { ...nada, evento: "x" }, ler)).toHaveLength(2);
    expect(filtrarPecas(pecas, { ...nada, patrocinador: "s2" }, ler)).toHaveLength(1);
    expect(filtrarPecas(pecas, { ...nada, tipo: chaveDoTipo("BANNER") }, ler)).toHaveLength(2);
    expect(chaveDoTipo("Pórtico ")).toBe("portico");
    const opcoes = opcoesDeTipo(pecas);
    expect(opcoes.find((o) => o.value === "banner")?.count).toBe(2);
  });

  it("os atalhos somam (E), e 'só atrasadas' usa o atraso da etapa", () => {
    expect(filtrarPecas(pecas, { ...nada, soAtrasadas: true }, ler)).toHaveLength(2);
    expect(filtrarPecas(pecas, { ...nada, soAtrasadas: true, soPrioritarias: true }, ler)).toHaveLength(1);
    expect(filtrarPecas(pecas, { ...nada, soTravadas: true }, ler)).toHaveLength(1);
  });
});

describe("as filas da Arte", () => {
  it("a Correção segue a regra de resubmission-needed", () => {
    expect(ehCorrecaoDaArte(peca("e", "awaiting_sponsor_approval", { sponsors: [{ id: "s", approvalStatus: "awaiting_arte" }] }))).toBe(true);
    expect(ehCorrecaoDaArte(peca("e", "awaiting_sponsor_approval", { sponsors: [{ id: "s", approvalStatus: "pending" }] }))).toBe(false);
    expect(ehCorrecaoDaArte(peca("e", "awaiting_submission", { rejectedBySponsor: true }))).toBe(true);
    expect(ehCorrecaoDaArte(peca("e", "awaiting_submission"))).toBe(false);
  });

  it("as filas leem a etapa canônica (grafia antiga não some)", () => {
    const ev = evento("e", 40);
    const ler = criarLeitor<PecaDoEstado>(new Map([[ev.id, ev]]), HOJE);
    const ps = [peca("e", "awaiting_approval"), peca("e", "awaiting_sponsor_approval"), peca("e", "sponsor_approved"), peca("e", "awaiting_finalization")];
    expect(pecasDaFilaDaArte("aguardando-patrocinador", ps, ler)).toHaveLength(2);
    expect(pecasDaFilaDaArte("finalizar-layouts", ps, ler)).toHaveLength(2);
  });
});
