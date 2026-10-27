// ─────────────────────────────────────────────────────────────────────────────
// GESTÃO DE PRAZOS — a TELA das peças sem aprovação (Pedro/dono, 26/10).
//
// A regra (prazo de Layout ajustado, atraso do cliente) é do servidor e tem os
// testes dela (prazos-sem-aprovacao, prazo-domain, prazo-atrasadas). Aqui fica
// o que a TELA decide com o payload:
//   · o prazo que cada etapa mostra (o efetivo, marcado como ajustado);
//   · as atrasadas da etapa no lugar do gate (o mesmo número do placar);
//   · o filtro pelas marcas (RF11) — no grão do evento e no da peça;
//   · a fatia "do cliente" (RN09);
//   · e, no código-fonte, que a página e os blocos usam esses helpers.
// Os eventos saem do domínio de verdade (`buildEventPrazo`), com `today`
// injetado — o mesmo arranjo de prazo-atrasadas.test.ts.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import {
  atrasadasDaEtapa, contarPorMarca, eventoPassaNaMarca, etapaComPrazoAjustado, itemPassaNaMarca,
  lerFiltroDeMarca, OPCOES_DE_MARCA_PRAZOS, prazoDaEtapa, rotuloDaMarca, sufixoDoCliente,
  atrasoDoClienteNaEtapa, ROTULO_TODAS_AS_PECAS, ROTULO_DO_FILTRO_SEM_APROVACAO, rotuloDaOpcaoSemAprovacao,
} from "@/components/prazos/sem-aprovacao";
import { computePecasAtrasadas, contarPecasAtrasadas, filtrarPecasAtrasadas } from "@/components/prazos/atrasadas";
import { buildEventPrazo, computeKpis, type DomainEvent, type DomainItem } from "../services/prazo-domain";
import type { PrazoEvent, PrazoStage } from "@shared/prazos-contract";

const dia = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};

// Saída num domingo (2026-08-30): layouts −20 → 10/08; ajustado (+7) → 17/08.
const evento = (over: Partial<DomainEvent> = {}): DomainEvent => ({
  id: "ev-1",
  name: "COPA BRASIL",
  status: "created",
  priority: null,
  startDate: "2026-09-05T00:00:00.000Z",
  truckDepartureDate: "2026-08-30T00:00:00.000Z",
  createdBy: null,
  ...over,
});

let seq = 0;
const peca = (over: Partial<DomainItem> = {}): DomainItem => {
  seq += 1;
  return {
    id: `it-${seq}`, displayId: `#${seq}`, status: "awaiting_submission", type: "2x1",
    description: null, quantity: 1, updatedAt: null, createdAt: null, ...over,
  };
};

const montar = (ev: DomainEvent, itens: DomainItem[], hoje: string): PrazoEvent => {
  const r = buildEventPrazo(ev, itens, { today: dia(hoje) });
  expect(r).not.toBeNull();
  return r as PrazoEvent;
};

const layouts = (ev: PrazoEvent): PrazoStage => ev.stages.find((s) => s.key === "layouts")!;

describe("o prazo da etapa na tela", () => {
  it("só peças sem aprovação no gate do Layout → a tela mostra o AJUSTADO (17/08), marcado", () => {
    const ev = montar(evento(), [peca({ id: "s", skipApproval: true })], "2026-08-12");
    const s = layouts(ev);
    expect(s.deadline).toBe("2026-08-10");
    expect(prazoDaEtapa(s)).toBe("2026-08-17");
    expect(etapaComPrazoAjustado(s)).toBe(true);
    // O Layout NÃO está vencido só por causa da peça sem aprovação.
    expect(s.state).not.toBe("overdue");
  });

  it("uma peça comum no gate basta para valer o prazo do evento", () => {
    const ev = montar(evento(), [peca({ id: "c" }), peca({ id: "s", skipApproval: true })], "2026-08-12");
    const s = layouts(ev);
    expect(prazoDaEtapa(s)).toBe("2026-08-10");
    expect(etapaComPrazoAjustado(s)).toBe(false);
    expect(s.state).toBe("overdue");
    // Vencida com 2 no gate, mas só 1 atrasada — é esta que a célula conta.
    expect(s.pendingCount).toBe(2);
    expect(atrasadasDaEtapa(s)).toBe(1);
  });

  it("payload antigo (sem os campos novos) cai na leitura de sempre", () => {
    const antigo = { key: "layouts", label: "Entrega de Layouts", deadline: "2026-08-10", diffDays: -2, pendingCount: 4, directCount: 4, state: "overdue" } as unknown as PrazoStage;
    expect(prazoDaEtapa(antigo)).toBe("2026-08-10");
    expect(etapaComPrazoAjustado(antigo)).toBe(false);
    expect(atrasadasDaEtapa(antigo)).toBe(4);
  });

  it("o fallback do placar na página soma as ATRASADAS da etapa vencida (reconcilia com o servidor)", () => {
    const ev = montar(evento(), [peca({ id: "c" }), peca({ id: "s", skipApproval: true })], "2026-08-12");
    const overdue = ev.stages.filter((s) => s.state === "overdue");
    const fallback = atrasadasDaEtapa(overdue[overdue.length - 1]);
    expect(fallback).toBe(computeKpis([ev]).pecasAtrasadas);
  });
});

describe("atraso do cliente (RN09)", () => {
  // Arte do cliente sem "Arte recebida", ainda em Layout, depois do ajustado.
  const ev = montar(evento(), [
    peca({ id: "cli", arteDoCliente: true }),
    peca({ id: "int", status: "draft" }),
  ], "2026-08-20");

  it("a peça é atraso DO CLIENTE e o evento diz quantas", () => {
    const cli = ev.pendingItems.find((i) => i.id === "cli")!;
    expect(cli.atrasoDoCliente).toBe(true);
    expect(cli.aguardandoArteDoCliente).toBe(true);
    expect(cli.prazoDeLayout).toEqual({ normal: "2026-08-10", ajustado: "2026-08-17" });
    expect(ev.pecasAtrasoDoCliente).toBe(1);
  });

  it("a fatia do cliente na coluna é a da coluna (pelo marco que mede a peça)", () => {
    expect(atrasoDoClienteNaEtapa(ev, "layouts")).toBe(1);
    expect(atrasoDoClienteNaEtapa(ev, "listaImagens")).toBe(0);
    expect(atrasoDoClienteNaEtapa(ev, "naoExiste")).toBe(0);
  });

  it("o texto: ' (1 do cliente)' — dentro do total, revisão 27/10 —, e nada quando não há", () => {
    expect(sufixoDoCliente(1)).toBe(" (1 do cliente)");
    expect(sufixoDoCliente(0)).toBe("");
    expect(sufixoDoCliente(undefined)).toBe("");
  });
});

describe("o filtro pelas marcas (RF11)", () => {
  const ev = montar(evento(), [
    peca({ id: "comum", status: "draft" }),
    peca({ id: "sp", skipApproval: true }),
    peca({ id: "ac", arteDoCliente: true }),
    peca({ id: "acr", arteDoCliente: true, arteRecebidaEm: "2026-08-01" }),
  ], "2026-08-20");
  const outro = montar(evento({ id: "ev-2", name: "SEM MARCA" }), [peca({ id: "x", status: "draft" })], "2026-08-20");
  const item = (id: string) => ev.pendingItems.find((i) => i.id === id)!;

  // revisão 27/10: o filtro chama "Peças sem aprovação" e as opções usam os
  // nomes canônicos — "qualquer marca" confundia com marca = patrocinador.
  it("as opções têm os nomes canônicos (os mesmos das Análises) + 'Atraso do cliente'; a URL é validada", () => {
    expect(ROTULO_TODAS_AS_PECAS).toBe("Todas as peças");
    expect(ROTULO_DO_FILTRO_SEM_APROVACAO).toBe("Aprovação");
    expect(OPCOES_DE_MARCA_PRAZOS.map((o) => o.rotulo)).toEqual([
      "Sem aprovação (Sem patrocínio ou Arte do cliente)", "Sem patrocínio", "Arte do cliente", "Aguardando arte do cliente", "Atraso do cliente", "Com aprovação",
    ]);
    expect(rotuloDaOpcaoSemAprovacao("comAprovacao", "x")).toBe("Com aprovação");
    for (const o of OPCOES_DE_MARCA_PRAZOS) expect(o.rotulo).not.toMatch(/marca/i);
    expect(lerFiltroDeMarca("arteDoCliente")).toBe("arteDoCliente");
    expect(lerFiltroDeMarca("lixo")).toBe("all");
    expect(lerFiltroDeMarca(null)).toBe("all");
    expect(rotuloDaMarca("all")).toBe("Todas as peças");
  });

  it("peça a peça", () => {
    expect(itemPassaNaMarca(item("comum"), "semAprovacao")).toBe(false);
    expect(itemPassaNaMarca(item("sp"), "semAprovacao")).toBe(true);
    expect(itemPassaNaMarca(item("sp"), "arteDoCliente")).toBe(false);
    expect(itemPassaNaMarca(item("ac"), "aguardandoArte")).toBe(true);
    expect(itemPassaNaMarca(item("acr"), "aguardandoArte")).toBe(false);
    expect(itemPassaNaMarca(item("ac"), "atrasoDoCliente")).toBe(true);
    expect(itemPassaNaMarca(item("acr"), "atrasoDoCliente")).toBe(false);
    expect(itemPassaNaMarca(item("comum"), "all")).toBe(true);
  });

  it("o evento passa quando ALGUMA peça pendente passa", () => {
    expect(eventoPassaNaMarca(ev, "semPatrocinio")).toBe(true);
    expect(eventoPassaNaMarca(outro, "semPatrocinio")).toBe(false);
    expect(eventoPassaNaMarca(outro, "all")).toBe(true);
  });

  it("contagem por opção (as opções se sobrepõem)", () => {
    const m = contarPorMarca([ev, outro], (e) => e.pendingItems);
    expect(m.get("semAprovacao")).toBe(1);
    expect(m.get("atrasoDoCliente")).toBe(1);
    const porPeca = contarPorMarca(ev.pendingItems, (i) => i);
    expect(porPeca.get("semAprovacao")).toBe(3);
    expect(porPeca.get("arteDoCliente")).toBe(2);
    expect(porPeca.get("aguardandoArte")).toBe(1);
  });

  it("a lista de peças atrasadas filtra e conta pela marca", () => {
    const lista = computePecasAtrasadas([ev, outro]);
    const ids = (f: Parameters<typeof filtrarPecasAtrasadas>[1]) => filtrarPecasAtrasadas(lista, f).map((p) => p.item.id).sort();
    expect(ids({ marca: "semAprovacao" })).toEqual(["ac", "acr", "sp"]);
    expect(ids({ marca: "atrasoDoCliente" })).toEqual(["ac"]);
    expect(ids({})).toEqual(["ac", "acr", "comum", "sp", "x"]);
    const c = contarPecasAtrasadas(lista, { marca: "atrasoDoCliente" });
    // A própria dimensão é contada neutralizada; as outras com a marca aplicada.
    expect(c.porMarca.get("semAprovacao")).toBe(3);
    expect(c.porEvento.get("ev-1")).toBe(1);
    expect(c.porEvento.has("ev-2")).toBe(false);
  });
});

describe("a página e os blocos usam a régua nova (código-fonte)", () => {
  const ler = (rel: string) => readFileSync(path.resolve(__dirname, "../../", rel), "utf8");
  const pagina = ler("client/src/pages/gestao-prazos.tsx");
  const P = "client/src/components/prazos/";

  it("o fallback do placar não soma mais o gate cru", () => {
    expect(pagina).toContain("atrasadasDaEtapa(overdue[overdue.length - 1])");
    expect(pagina).not.toContain("overdue[overdue.length - 1].pendingCount");
  });

  it("filtro por dia e barra de próximos dias usam o prazo EFETIVO", () => {
    expect(pagina).toContain("prazoDaEtapa(s) === diaFoco");
    expect(pagina).toContain("prazoDaEtapa(s) === dia");
    expect(pagina).not.toMatch(/s\.deadline === (dia|diaFoco)/);
  });

  it("o filtro de marca está na URL, nos chips e no limpar", () => {
    expect(pagina).toContain('lerFiltroDeMarca(p.get("marca"))');
    expect(pagina).toContain('p.set("marca", marca)');
    expect(pagina).toContain('testId="select-marca-prazos"');
    expect(pagina).toContain('key: "marca"');
    expect(pagina).toContain('setEventoFiltro("all"); setMarca("all");');
  });

  it("placar e 'Comece por aqui' dizem a fatia do cliente", () => {
    expect(pagina).toContain("sufixoDoCliente(kpis.pecasAtrasoDoCliente)");
    expect(pagina).toContain("sufixoDoCliente(ev.pecasAtrasoDoCliente)");
  });

  it("célula, card e drill mostram o prazo efetivo e as marcas da peça", () => {
    const celula = ler(P + "stage-cell.tsx");
    expect(celula).toContain("prazoDaEtapa(stage)");
    expect(celula).toContain(": fmtDayMonth(prazo)}");
    expect(celula).toContain("pecasTexto(atrasadas)");
    const card = ler(P + "quadro-card.tsx");
    expect(card).not.toContain("fmtDayMonth(stage.deadline)");
    const drill = ler(P + "event-drilldown.tsx");
    expect(drill).not.toContain("fmtDayMonth(stage.deadline)");
    expect(drill.match(/<MarcasDaPecaPendente it=\{it\} \/>/g)?.length).toBe(2);
    expect(ler(P + "pecas-atrasadas.tsx").match(/<MarcasDaLinha p=\{p\} \/>/g)?.length).toBe(2);
  });

  it("nenhuma palavra aposentada no texto novo", () => {
    for (const f of ["sem-aprovacao.ts", "marcas-da-peca.tsx"]) {
      const fonte = ler(P + f);
      expect(fonte).not.toMatch(/Pelotão|Cobrar/);
      expect(fonte).not.toMatch(/#[0-9a-fA-F]{6}/);
    }
  });
});
