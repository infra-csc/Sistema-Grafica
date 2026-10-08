// @vitest-environment jsdom
//
// ─────────────────────────────────────────────────────────────────────────────
// PERF 9 — A CARGA DA GRÁFICA COM O VOLUME DE PRODUÇÃO (07/10).
//
// Medição em produção (admin no Chrome, 6.385 peças, 12.490 fotos): a fila
// chegava em 1,5 s, a primeira linha só aos ~4 s e o thread principal ficava
// ~10 s ocupado; Registros baixava o ORIGINAL de cada foto da grade; Máquinas
// nunca sossegava. Reproduzido no servidor local com ~6 mil peças e perfilado
// (CDP Profiler + trace), o que custava, e o que este arquivo trava:
//
//   1. `ehMolde` normalizava o texto do tipo (NFD + regex) em TODA chamada — e
//      ele está no caminho de isDelivered/statusParaContagem/casaEtapa, dezenas
//      de vezes por peça: ~200 ms por carga. Agora a resposta fica guardada por
//      texto de tipo.
//   2. As nove facetas varriam a fila inteira cada uma; sem filtro, sete delas
//      são o MESMO pool e as outras duas, um segundo. `poolEquivalente` diz qual
//      é qual — o resultado de cada faceta é o mesmo, peça a peça.
//   3. A ordem da fila comparava datas num Map e `localeCompare` em ~80 mil
//      comparações: agora as chaves são calculadas uma vez por peça.
//   4. A tabela desenhava as 60 linhas do lote numa tarefa só (a resposta do
//      React Query renderiza síncrona) para mostrar 4 a 8 delas: agora vem a
//      PRIMEIRA LEVA e o resto do lote numa transição.
//   5. Registros e os tubos pintavam o original (130–500 KB) em cartões de
//      ~250px: agora a miniatura (?thumb=1); zoom e baixar seguem com o cheio.
//   6. O "Ao vivo" de Máquinas animava box-shadow — repintura da página inteira
//      a cada quadro, para sempre. Agora transform + opacity (compositor).
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import * as React from "react";
import { readFileSync } from "fs";
import path from "path";
import { render, act, cleanup, renderHook } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";

const h = React.createElement;
const ler = (rel: string) => readFileSync(path.resolve(__dirname, "../..", rel), "utf8");

// Quantas vezes a regra do recorte roda — é o número que as facetas pagavam.
const regra = vi.hoisted(() => ({ chamadas: 0 }));
vi.mock("@/lib/grafica-filtros", async (original) => {
  const m = await original<typeof import("@/lib/grafica-filtros")>();
  return {
    ...m,
    itemCasaFiltros: (...args: Parameters<typeof m.itemCasaFiltros>) => { regra.chamadas++; return m.itemCasaFiltros(...args); },
  };
});
vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: { id: "u1", name: "Admin", email: "a@a", role: "admin", mustChangePassword: false }, isLoading: false, logout: () => {} }),
}));

// ── Uma fila sintética com tudo o que o recorte lê ───────────────────────────
const DIA = 86_400_000;
const AGORA = Date.UTC(2026, 9, 7, 12);
function sorteio(semente: number) {
  let s = semente >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}
const STATUS = ["ready_for_production", "pronto_para_producao", "approved", "inProduction", "produced", "conferred", "packed", "delivered", "awaiting_final_review"];
const TIPOS = ["Placa km", "Testeiras", "WindBanner", "Molde", "Pórtico", "placa km", "Backdrop"];
function fila(n: number, semente = 7) {
  const r = sorteio(semente);
  const escolhe = <T,>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)];
  const eventos = Array.from({ length: 14 }, (_, k) => ({
    id: `ev${k}`,
    // "Café" composto e decomposto: o `localeCompare` diz que são iguais —
    // a ordem nova tem de empatar exatamente onde a antiga empatava.
    name: k === 3 ? "Corrida do Café" : k === 4 ? "Corrida do Café" : k === 5 ? "corrida do café" : `Corrida ${String.fromCharCode(65 + (k * 7) % 26)}`,
    status: "active",
    startDate: new Date(AGORA + (k - 4) * 3 * DIA).toISOString().slice(0, 10),
    truckDepartureDate: k === 9 ? null : k === 10 ? "data-quebrada" : new Date(AGORA + ((k % 7) - 2) * 4 * DIA).toISOString(),
  }));
  return Array.from({ length: n }, (_, k) => {
    const status = escolhe(STATUS);
    const quantity = 1 + Math.floor(r() * 9);
    const produzidas = status === "inProduction" ? Math.floor(quantity / 2) : ["ready_for_production", "approved", "pronto_para_producao", "awaiting_final_review"].includes(status) ? 0 : quantity;
    const evento = escolhe(eventos);
    return {
      id: `p${k}`,
      displayId: r() < 0.1 ? `#${String(1000 + (k >> 1)).padStart(4, "0")}-C${1 + (k % 3)}` : `#${String(1000 + k).padStart(4, "0")}`,
      eventId: evento.id, event: evento,
      type: escolhe(TIPOS), description: escolhe(["5k - km 2", "10k - km 8", "Largada 5k/10k", "Arena", "Hidratação"]),
      material: escolhe(["Lona", "PS 3mm", "Tecido"]), finish: escolhe(["Ilhós", "Refile", "Costura"]),
      status, quantity, quantityProduced: produzidas,
      conferredQty: ["conferred", "packed", "delivered"].includes(status) ? quantity : 0,
      embaladaQty: ["packed", "delivered"].includes(status) ? quantity : 0,
      deliveredQty: status === "delivered" ? quantity : 0,
      printMachine: produzidas > 0 ? String(1 + (k % 4)) : null,
      isReuse: r() < 0.05, reuseQty: r() < 0.08 ? 1 : 0,
      parentItemId: r() < 0.08 ? `p${Math.max(0, k - 1)}` : null,
      isPriority: r() < 0.1,
      travadaEm: r() < 0.03 ? new Date(AGORA - DIA).toISOString() : null,
      calculatedM2: "1.00", observations: "", statusChangedAt: new Date(AGORA - (k % 9) * DIA).toISOString(),
    };
  });
}

afterEach(() => cleanup());

describe("1. ehMolde guarda a resposta por texto de tipo", () => {
  it("milhares de perguntas, no máximo uma normalização por texto — e as mesmas respostas", async () => {
    const { ehMolde, ehTipoMolde } = await import("@shared/molde");
    const original = String.prototype.normalize;
    let normalizacoes = 0;
    String.prototype.normalize = function (this: string, ...a: [string?]) { normalizacoes++; return original.apply(this, a); };
    try {
      for (let k = 0; k < 5000; k++) { ehMolde({ type: "Testeira perf9" }); ehMolde({ type: " MOLDES perf9" }); }
    } finally {
      String.prototype.normalize = original;
    }
    expect(normalizacoes, "eram 10 mil normalize por 10 mil perguntas").toBeLessThanOrEqual(2);
    for (const [tipo, resposta] of [["Molde", true], ["MOLDE", true], [" moldes ", true], ["Mólde", true], ["Placa", false], ["", false], [null, false], [undefined, false]] as const) {
      expect(ehTipoMolde(tipo), String(tipo)).toBe(resposta);
    }
  });
});

describe("2. facetas: um pool por recorte DISTINTO, com o mesmo resultado de antes", () => {
  const FACETAS = ["status", "evento", "grupo", "percurso", "tipo", "material", "acabamento", "mes", "impressora"] as const;

  it("com recortes sorteados, cada faceta recebe exatamente o pool que `excluir` daria", async () => {
    const { itemCasaFiltros, poolEquivalente, FILTROS_VAZIOS } = await import("@/lib/grafica-filtros");
    const pecas = fila(700, 11);
    const ctx = { groupOf: (t: string) => (/placa/i.test(t) ? "PLACAS" : t === "Pórtico" ? "ARENA" : ""), hojeUTC: Date.UTC(2026, 9, 7) };
    const r = sorteio(99);
    const talvez = <T,>(xs: T[]) => (r() < 0.55 ? [] : xs.filter(() => r() < 0.5).slice(0, 2));
    for (let rodada = 0; rodada < 250; rodada++) {
      const f = {
        ...FILTROS_VAZIOS,
        status: talvez(["ready_for_production", "produced", "conferred", "delivered", "packed"]),
        evento: talvez(["ev1", "ev3", "ev7", "ev10"]),
        grupo: talvez(["PLACAS", "ARENA"]),
        percurso: talvez(["5k", "10k"]),
        tipo: talvez(TIPOS),
        material: talvez(["Lona", "Tecido"]),
        acabamento: talvez(["Ilhós", "Costura"]),
        mes: talvez(["9", "10", "11"]),
        impressora: talvez(["1", "3", "__sem__"]),
        proximos10: r() < 0.15, complementos: r() < 0.1, reaproveitamento: r() < 0.1, travadas: r() < 0.05, entregues: r() < 0.3,
      };
      // A ordem em que a tela pede as facetas varia; o cache tem de servir a todas.
      const cache = new Map<string, typeof pecas>();
      for (const excluir of [...FACETAS].sort(() => r() - 0.5)) {
        const chave = poolEquivalente(excluir, f);
        let pool = cache.get(chave);
        if (!pool) {
          pool = pecas.filter((i) => itemCasaFiltros(i, f, ctx, chave === "nenhuma" ? {} : { excluir }));
          cache.set(chave, pool);
        }
        const esperado = pecas.filter((i) => itemCasaFiltros(i, f, ctx, { excluir }));
        expect(pool.map((i) => i.id), `rodada ${rodada}, faceta ${excluir} (pool "${chave}")`).toEqual(esperado.map((i) => i.id));
      }
    }
  }, 60_000);

  it("sem filtro (a tela abrindo): as nove facetas custam DUAS passadas pela fila, não nove", async () => {
    const { useFacetasDaFila } = await import("@/components/grafica/hooks/use-facetas-da-fila");
    const { FILTROS_VAZIOS } = await import("@/lib/grafica-filtros");
    const pecas = fila(3000, 5);
    const ctxFiltros = { groupOf: (t: string) => (/placa/i.test(t) ? "PLACAS" : ""), hojeUTC: Date.UTC(2026, 9, 7) };
    regra.chamadas = 0;
    const { result } = renderHook(() => useFacetasDaFila({ items: pecas as never, filtros: FILTROS_VAZIOS, ctxFiltros, groupOf: ctxFiltros.groupOf }));
    // As listas de opção saem todas (o render as calculou)…
    expect(result.current.statusFilterOptions.length).toBeGreaterThan(0);
    expect(result.current.eventFilterOptions.length).toBeGreaterThan(0);
    expect(result.current.typeFilterOptions.length).toBeGreaterThan(0);
    // …com 2 × N chamadas da regra (eram 9 × N).
    expect(regra.chamadas, `chamadas de itemCasaFiltros para ${pecas.length} peças`).toBeLessThanOrEqual(2 * pecas.length);
  });
});

describe("3. a ordem da fila com chaves pré-calculadas é a ordem de antes", () => {
  it("peça a peça igual ao comparador antigo (saída, nome do evento, prioritária, tipo, código) — com as prioritárias na frente de tudo (08/10)", async () => {
    const { ordenarFilaDaGrafica } = await import("@/components/grafica/fila/ordem-da-fila");
    const { compareDisplayId } = await import("@/lib/displayId");
    type P = ReturnType<typeof fila>[number];
    // O comparador como estava em use-fila-da-grafica.ts até 07/10, sem tirar nem pôr.
    const antiga = (items: P[]) => {
      const saidaMs = new Map<P, number>();
      for (const i of items) saidaMs.set(i, i.event?.truckDepartureDate ? new Date(i.event.truckDepartureDate).getTime() : Infinity);
      // 08/10 (dono, "na Gráfica também"): a prioritária deixou de subir só
      // no bloco do evento e passou a vir PRIMEIRO de toda a fila — o único
      // critério novo, posto antes do comparador de sempre.
      return [...items].sort((a, b) => {
        const primeiro = Number(!!b.isPriority) - Number(!!a.isPriority);
        if (primeiro !== 0) return primeiro;
        const da = saidaMs.get(a)!; const db = saidaMs.get(b)!;
        if (da !== db) return da - db;
        const ea = a.event?.name || ""; const eb = b.event?.name || "";
        if (ea !== eb) return ea.localeCompare(eb);
        const prio = Number(!!b.isPriority) - Number(!!a.isPriority);
        if (prio !== 0) return prio;
        if (a.type !== b.type) return a.type.localeCompare(b.type);
        return compareDisplayId(a.displayId, b.displayId);
      });
    };
    for (const semente of [1, 2, 3, 4, 5]) {
      const pecas = fila(1500, semente);
      expect(ordenarFilaDaGrafica(pecas).map((i) => i.id), `semente ${semente}`).toEqual(antiga(pecas).map((i) => i.id));
    }
    // Não mexe na lista recebida.
    const pecas = fila(50, 8);
    const ids = pecas.map((i) => i.id);
    ordenarFilaDaGrafica(pecas);
    expect(pecas.map((i) => i.id)).toEqual(ids);
  });
});

describe("4. a tabela desenha a PRIMEIRA LEVA e o resto do lote numa transição", () => {
  beforeAll(() => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false; } }));
    vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
    vi.stubGlobal("IntersectionObserver", class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } });
    (Element.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = () => {};
    try { localStorage.setItem("grafica.guia-da-fila.fechado", "1"); } catch { /* sem storage */ }
  });

  it("a primeira pintura leva no máximo LINHAS_DA_PRIMEIRA_LEVA linhas; a tela termina no lote inteiro, com o sentinela", async () => {
    const { LINHAS_DA_PRIMEIRA_LEVA, LINHAS_POR_LOTE } = await import("@/components/grafica/fila/regras");
    const pecas = fila(400, 3).map((p) => ({ ...p, status: "ready_for_production", quantityProduced: 0, conferredQty: 0, embaladaQty: 0, deliveredQty: 0 }));
    vi.stubGlobal("fetch", async (url: string) => new Response(JSON.stringify(String(url).startsWith("/api/items/approved") ? pecas : []), { status: 200, headers: { "content-type": "application/json" } }));
    const { queryClient } = await import("@/lib/queryClient");
    const Grafica = (await import("@/pages/grafica")).default;
    queryClient.clear();
    queryClient.setQueryData(["/api/items/approved"], pecas);
    queryClient.setQueryData(["/api/standard-items"], []);
    queryClient.setQueryData(["/api/tubos"], []);
    // O que cada COMMIT deixou no DOM (o onRender do Profiler roda no commit).
    const porCommit: Array<{ linhas: number; sentinela: boolean }> = [];
    const onRender = () => porCommit.push({
      linhas: document.querySelectorAll("[data-item-row]").length,
      sentinela: !!document.querySelector('[data-testid="sentinela-lista-grafica"]'),
    });
    await act(async () => {
      render(h(QueryClientProvider, { client: queryClient }, h(React.Profiler, { id: "g", onRender }, h(Grafica))));
    });
    await act(async () => { await new Promise((r) => setTimeout(r, 250)); });
    const primeiro = porCommit.find((c) => c.linhas > 0)!;
    expect(primeiro.linhas, "a primeira pintura desenhava o lote inteiro").toBeLessThanOrEqual(LINHAS_DA_PRIMEIRA_LEVA);
    expect(primeiro.sentinela, "com a leva parcial o sentinela pediria um lote a mais").toBe(false);
    // O estado final é o de sempre: o lote inteiro e o sentinela "Mostrar mais".
    expect(document.querySelectorAll("[data-item-row]").length).toBe(LINHAS_POR_LOTE);
    expect(document.querySelector('[data-testid="sentinela-lista-grafica"]')?.textContent).toContain(`Mostrando ${LINHAS_POR_LOTE} de`);
  }, 120_000);
});

describe("5. Registros e tubos pintam a miniatura; zoom e baixar, o original", () => {
  it("a grade usa ?thumb=1 (também da URL antiga do GCS); a lupa e o download, a URL cheia", async () => {
    const { miniaturaOf, srcOf } = await import("@/components/grafica/registros/fotos");
    expect(miniaturaOf({ id: "1", photoUrl: "/objects/uploads/abc" })).toBe("/objects/uploads/abc?thumb=1");
    expect(miniaturaOf({ id: "2", photoUrl: "https://storage.googleapis.com/b/.private/uploads/abc?X-Goog-Signature=1" })).toBe("/objects/uploads/abc?thumb=1");
    expect(srcOf({ id: "1", photoUrl: "/objects/uploads/abc" })).toBe("/objects/uploads/abc");
    expect(miniaturaOf({ id: "3" })).toBe("");

    const { CartaoDeFoto } = await import("@/components/grafica/registros/cartao-de-foto");
    const nada = () => {};
    await act(async () => {
      render(h(CartaoDeFoto, {
        p: { id: "f1", kind: "conference", photoUrl: "/objects/uploads/f1", displayId: "#0001", createdAt: "2026-10-07T12:00:00Z" },
        idx: 0, brokenIds: new Set<string>(), setBrokenIds: nada, setZoomIdx: nada, baixar: nada, baixando: false, toque: false,
        contraparteDe: () => null, idxPorId: new Map(), setKindFilter: nada, setAlvoDoPar: nada,
      } as never));
    });
    const img = document.querySelector('[data-testid="card-photo-f1"] img')!;
    expect(img.getAttribute("src"), "o cartão baixava o original de 130–500 KB").toBe("/objects/uploads/f1?thumb=1");
    expect(img.getAttribute("loading")).toBe("lazy");

    // A lupa (foto grande) e o baixar continuam com a URL cheia.
    const zoom = ler("client/src/components/grafica/registros/zoom-do-registro.tsx");
    expect(zoom).toMatch(/key=\{zoom\.id\}\s+src=\{srcOf\(zoom\)\}/);
    expect(zoom).toContain("src={miniaturaOf(f)}");
    expect(ler("client/src/components/grafica/registros/use-baixar-foto.ts")).toContain("const url = srcOf(p);");
    const tubos = ler("client/src/components/registros-de-tubos.tsx");
    expect(tubos).toContain("<img src={miniatura(capa.url)}");
    expect(tubos).toContain("<img src={miniatura(f.url)}");
    expect(tubos).toContain("<img src={fotoEmZoom.url}");
  }, 30_000);
});

describe("6. o \"Ao vivo\" de Máquinas não repinta a página", () => {
  it("o halo anima só transform e opacity, e só com movimento liberado", () => {
    const pedacos = ler("client/src/components/grafica/maquinas/pedacos.tsx");
    expect(pedacos).not.toContain('className="maq-vivo"');
    expect(pedacos).toContain('className="perf-grf-vivo"');
    expect(pedacos).toContain('<span className="perf-grf-vivo-halo" />');
    const css = ler("client/src/index.css");
    const bloco = css.slice(css.indexOf("@keyframes perf-grf-vivo"));
    const quadros = bloco.slice(0, bloco.indexOf("\n}\n"));
    expect(quadros).toContain("transform:");
    expect(quadros).toContain("opacity:");
    expect(quadros, "box-shadow animado repinta a página a cada quadro").not.toContain("box-shadow");
    expect(css).toMatch(/@media \(prefers-reduced-motion: no-preference\) \{\n  \.perf-grf-vivo-halo \{ animation: perf-grf-vivo/);
  });

  it("a hora de início e a do fechamento do tubo usam UM formatador (não um Intl novo por peça)", async () => {
    expect(ler("client/src/components/grafica/modal-impressao.tsx")).toContain("return HORA_HH_MM.format(d);");
    expect(ler("client/src/components/grafica/hooks/use-tubos-da-fila.ts")).toContain("HORA_DO_FECHAMENTO.format(new Date(t.fechadoEm as string))");
    const { horaDeInicio } = await import("@/components/grafica/modal-impressao");
    const d = new Date("2026-10-07T17:32:00Z");
    expect(horaDeInicio(d)).toBe(d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }));
    expect(horaDeInicio(null)).toBeNull();
    expect(horaDeInicio("quebrada")).toBeNull();
  });
});
