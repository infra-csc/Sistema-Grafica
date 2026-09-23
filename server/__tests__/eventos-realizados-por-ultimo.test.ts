// ─────────────────────────────────────────────────────────────────────────────
// EVENTOS: realizados ficam ocultos por padrão, e o risco ABERTO vem primeiro.
//
// Relato com captura: a grade abria com três cartões "REALIZADO COM PENDÊNCIAS
// · Saiu há 14d" no topo — eventos cujo caminhão já saiu — e o evento que
// embarca amanhã ficava abaixo da dobra. Duas causas, uma em cada eixo:
//
//   · O balde "Pendências" (lifecycle `realizado`) vinha LIGADO por padrão.
//     Ele não é arquivo — sobrou trabalho —, mas também não é o que a pessoa
//     abre a tela para ver. Agora o padrão é só "Ativos"; Pendências fica a
//     um clique no alternador, e a URL continua mandando.
//
//   · A ordenação punha `realizado` no balde 0, junto com marco atrasado e
//     prioridade urgente. Mas um realizado não é urgência: o caminhão já foi,
//     o que sobrou é acerto de contas. Urgente MAS ABERTO é o que dá para
//     salvar — e por isso vem primeiro. Realizado vai para o balde 2, antes
//     só do arquivo.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { fonteDaTela } from "./fonte-da-tela";
import { REGRA_DA_ORDEM, ordenarEventos, sortRank } from "@/components/eventos/regras";
import type { EventoDaLista } from "@/components/eventos/tipos";

const EV = fonteDaTela("eventos");

describe("a visão padrão esconde os realizados", () => {
  it("só Ativos vem ligado quando a URL não diz nada", () => {
    const i = EV.indexOf("const [situacoes, setSituacoes] = useState<Set<string>>(() => {");
    const bloco = EV.slice(i, i + 300);
    expect(bloco).toContain('return new Set(["ativos"]);');
    expect(bloco).not.toContain('"pendencias"]');
  });

  it("mas Pendências continua existindo como balde — a um clique", () => {
    expect(EV).toContain("{ chave: 'pendencias'");
    expect(EV).toContain('if (v) return new Set(v.split(",").filter(Boolean));');
  });
});

// A regra da ordem virou função pura (components/eventos/regras.ts): antes o
// teste conferia o TEXTO de `sortRank`; agora roda a função e a ordenação.
const evento = (over: Partial<EventoDaLista>): EventoDaLista => ({
  id: "e", name: "E", priority: null, truckDepartureDate: "2099-03-01T11:00:00.000Z",
  lifecycle: "active", eventHasPassed: false, manuallyClosed: false, nextMilestone: null,
  ...over,
} as EventoDaLista);
const atrasado = { key: "listaImagens", label: "Lista", deadline: "2099-01-01", daysRemaining: -3, state: "overdue" as const, pendingItems: 1, invalidDate: false };

describe("urgente MAS aberto vem primeiro", () => {
  it("realizado desce para o balde 2 — antes só do arquivo", () => {
    expect(sortRank(evento({ lifecycle: "completed" }))).toBe(3);
    expect(sortRank(evento({ manuallyClosed: true }))).toBe(3);
    expect(sortRank(evento({ lifecycle: "realizado" }))).toBe(2);
    expect(sortRank(evento({}))).toBe(1);
  });

  it("marco atrasado e prioridade urgente continuam no balde 0", () => {
    expect(sortRank(evento({ nextMilestone: atrasado }))).toBe(0);
    expect(sortRank(evento({ priority: "urgente" }))).toBe(0);
  });

  it("e a ordem dos testes dentro da função garante que realizado não é promovido", () => {
    // Um realizado com marco atrasado (todos têm: o caminhão saiu) cairia no
    // balde 0 se o teste de `overdue` viesse antes do de `realizado`.
    expect(sortRank(evento({ lifecycle: "realizado", nextMilestone: atrasado, priority: "urgente" }))).toBe(2);
  });

  it("na lista ordenada: urgente aberto, em jogo, realizado, arquivo", () => {
    const lista = [
      evento({ id: "arq", name: "D", priority: "alta", lifecycle: "completed" }),
      evento({ id: "real", name: "C", priority: "alta", lifecycle: "realizado", nextMilestone: atrasado }),
      evento({ id: "jogo", name: "B", priority: "alta" }),
      evento({ id: "urg", name: "A", priority: "urgente", truckDepartureDate: "2099-06-01T11:00:00.000Z" }),
    ];
    expect(ordenarEventos(lista, "saida").map((e) => e.id)).toEqual(["urg", "jogo", "real", "arq"]);
  });

  it("a regra escrita diz isso", () => {
    expect(REGRA_DA_ORDEM.saida).toBe("marco atrasado primeiro, depois quem embarca antes; realizados por último");
    expect(EV).toContain("{REGRA_DA_ORDEM[ordem]}");
  });
});
