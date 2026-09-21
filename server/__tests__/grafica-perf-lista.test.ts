// @vitest-environment jsdom
//
// ─────────────────────────────────────────────────────────────────────────────
// PERFORMANCE DA FILA DA GRÁFICA — benchmark com ~4.000 peças sintéticas.
//
// POR QUE EXISTE. Medição em produção (17/09): /api/items/approved com ~4.290
// peças, a página montava 55.218 elementos DOM (todas as linhas de uma vez, com
// ações, badges e miniatura em cada uma) e a aba CONGELOU por mais de 45 s ao
// clicar numa aba de etapa e digitar 3 letras na busca. O teto de 50 linhas
// por EVENTO não segurava nada: com dezenas de eventos pequenos, cada um cabia
// inteiro no teto e a soma passava de quatro mil linhas.
//
// O QUE MEDE (jsdom + React de desenvolvimento, então os números absolutos são
// piores que no navegador — o que vale é a ordem de grandeza e o ANTES×DEPOIS):
//   • elementos DOM montados no primeiro render;
//   • tempo do primeiro render;
//   • tempo de trocar de aba de etapa;
//   • tempo de digitar 3 letras (tecla + recorte depois do debounce);
//   • quantas LINHAS re-renderizam numa revalidação sem mudança, ao abrir um
//     modal e ao marcar uma peça no lote.
//
// As asserções são tetos folgados: não é cronômetro de CI (máquina varia), é a
// trava contra alguém voltar a desenhar a fila inteira de uma vez.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeAll, vi } from "vitest";
import { appendFileSync } from "fs";
import * as React from "react";
import { render, act, cleanup } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";

const h = React.createElement;

// Contador de render de LINHA: a tabela e o card desenham exatamente um
// StatusPill por peça (o guia "Como funciona a fila" começa fechado e os modais
// estão fechados), então contar StatusPill é contar linhas renderizadas.
const linhas = vi.hoisted(() => ({ n: 0 }));
// Tempo de RENDER do React (fase de render, sem o commit no DOM), via Profiler:
// separa o custo de JavaScript da tela do custo de criar DOM, que no jsdom
// (estilos inline passam por um parser de CSS em JS) é muito maior que no navegador.
const profiler = { ms: 0 };
vi.mock("@/components/status-pill", async () => {
  const R = await import("react");
  return {
    StatusPill: (p: any) => { linhas.n++; return R.createElement("span", { "data-status": p.status }, String(p.status)); },
  };
});

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: USUARIO_ADMIN, isLoading: false, logout: () => {} }),
}));

const USUARIO_ADMIN = { id: "u1", name: "Admin", email: "a@a", role: "admin", mustChangePassword: false };

const N_PECAS = 4000;
const N_EVENTOS = 120;
const TIPOS = ["Backdrop", "Banner", "Placa", "Pórtico", "Wind Banner", "Faixa", "Totem", "Adesivo", "Lona", "Bandeira", "Testeira", "Cubo", "Painel", "Display", "Placa km"];
const STATUS = ["ready_for_production", "approved", "inProduction", "produced", "conferred", "delivered", "delivered", "awaiting_final_review"];

function gerarPecas() {
  const agora = Date.now();
  const eventos = Array.from({ length: N_EVENTOS }, (_, e) => ({
    id: `ev${e}`, name: `Evento ${String(e).padStart(3, "0")} Corrida`,
    status: "active", priority: e % 7 === 0 ? "alta" : "media",
    // Metade no futuro, metade no passado: exercita o selo de evento finalizado.
    startDate: new Date(agora + (e - N_EVENTOS / 2) * 86400000).toISOString().slice(0, 10),
    truckDepartureDate: new Date(agora + (e - N_EVENTOS / 2) * 86400000 - 3 * 86400000).toISOString(),
    deadlineProducaoGrafica: -5,
  }));
  return Array.from({ length: N_PECAS }, (_, i) => {
    const ev = eventos[i % N_EVENTOS];
    // Status varia DENTRO do evento (k-ésima peça do evento): com `i % 8` e 120
    // eventos, cada evento ficava com um status só.
    const status = STATUS[Math.floor(i / N_EVENTOS) % STATUS.length];
    const qtd = 1 + (i % 9);
    return {
      id: `p${i}`, displayId: `#${String(i).padStart(4, "0")}`,
      type: TIPOS[i % TIPOS.length], description: `Peça ${i} ${TIPOS[(i * 7) % TIPOS.length]} ${i % 3 === 0 ? "5k" : "10k"}`,
      quantity: qtd,
      quantityProduced: ["produced", "conferred", "delivered"].includes(status) ? qtd : 0,
      quantityConferred: ["conferred", "delivered"].includes(status) ? qtd : 0,
      quantityDelivered: status === "delivered" ? qtd : 0,
      status, eventId: ev.id, event: ev,
      material: i % 2 ? "Lona" : "PVC", finish: i % 3 ? "Ilhós" : "Bastão",
      calculatedM2: String((i % 13) + 0.5), fileWidth: "300", fileHeight: "200", visualWidth: "3", visualHeight: "2",
      approvalThumbUrl: i % 4 === 0 ? null : `/objects/thumb-${i}.png`,
      observations: i % 11 === 0 ? "Conferir cor" : "",
      isReuse: false, reuseQty: 0, isPriority: i % 17 === 0,
      statusChangedAt: new Date(agora - (i % 20) * 86400000).toISOString(),
    };
  });
}

beforeAll(() => {
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener() {}, removeEventListener() {},
    addListener() {}, removeListener() {}, dispatchEvent() { return false; },
  }));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  (Element.prototype as any).scrollIntoView = () => {};
  try { localStorage.setItem("grafica.guia-da-fila.fechado", "1"); } catch { /* sem storage */ }
  // A revalidação devolve a MESMA fila (o React Query compartilha a estrutura e
  // preserva a referência das peças iguais). Devolver [] aqui esvaziava a tela
  // no meio da medição quando o primeiro render passava do staleTime.
  vi.stubGlobal("fetch", async (url: any) => {
    const u = String(url);
    // A fila agora é pedida com query (`?formato=compacto`, e `&since=` nas
    // revalidações — lib/queryClient.ts). Comparar a URL exata fazia o mock
    // responder [] e o benchmark medir uma fila VAZIA. O caminho decide; o
    // `since` recebe o delta vazio que o servidor daria sem mudança (o array
    // cheio também seria aceito, mas não é o que a Gráfica recebe de verdade).
    const [caminho, query = ""] = u.split("?");
    const corpo = caminho === "/api/items/approved"
      ? (/(^|&)since=/.test(query) ? { delta: true, agora: new Date().toISOString(), itens: [], removidas: [], eventos: [], patrocinadores: [] } : PECAS)
      : caminho === "/api/standard-items" ? MODELOS
      : [];
    return new Response(JSON.stringify(corpo), { status: 200, headers: { "content-type": "application/json" } });
  });
});

const PECAS = gerarPecas();
const MODELOS = [{ name: "Placa km", group: "PLACAS" }];

/** Qual versão da tela medir: GRAFICA_BENCH_ARQUIVO aponta para uma cópia (o ANTES). */
async function carregarTela() {
  const alternativo = process.env.GRAFICA_BENCH_ARQUIVO;
  return (alternativo ? await import(/* @vite-ignore */ alternativo) : await import("@/pages/grafica")).default;
}

/** O Vitest cala o console de teste que passa: GRAFICA_BENCH_SAIDA grava o relatório num arquivo. */
function registrar(linha: string) {
  // eslint-disable-next-line no-console
  console.log(`[perf-grafica] ${linha}`);
  if (process.env.GRAFICA_BENCH_SAIDA) appendFileSync(process.env.GRAFICA_BENCH_SAIDA, linha + "\n");
}

async function tick(ms = 0) {
  await act(async () => { await new Promise((r) => setTimeout(r, ms)); });
}

async function cronometrar(fn: () => Promise<void>, rotulo?: string) {
  profiler.ms = 0;
  const t0 = performance.now();
  await fn();
  const ms = Math.round(performance.now() - t0);
  // eslint-disable-next-line no-console
  if (rotulo) registrar(`${rotulo}: ${ms} ms (render React ${Math.round(profiler.ms)} ms) · linhas renderizadas ${linhas.n} · DOM ${document.querySelectorAll("*").length}`);
  return ms;
}

describe("fila da Gráfica com ~4.000 peças", () => {
  it("monta pouco DOM, troca de aba e busca sem re-renderizar a fila inteira", async () => {
    const { queryClient } = await import("@/lib/queryClient");
    const Grafica = await carregarTela();

    const pecas = PECAS;
    queryClient.clear();
    queryClient.setQueryData(["/api/items/approved"], pecas);
    queryClient.setQueryData(["/api/standard-items"], MODELOS);

    // ── 1. Primeiro render ──
    linhas.n = 0;
    const tMontagem = await cronometrar(async () => {
      await act(async () => {
        render(h(QueryClientProvider, { client: queryClient } as any,
          h(React.Profiler, { id: "grafica", onRender: (_id: string, _fase: string, duracao: number) => { profiler.ms += duracao; } } as any,
            h(Grafica as any, null))));
      });
    }, "1. primeiro render");
    await tick(250); // debounce da busca e efeitos de montagem
    const domMontado = document.querySelectorAll("*").length;
    const linhasMontadas = document.querySelectorAll("[data-item-row]").length;
    const rendersMontagem = linhas.n;

    // ── 2. Revalidação com UMA peça mudada (o colega conferiu uma peça). As
    //       outras chegam com a mesma referência: é o que o compartilhamento
    //       de estrutura do React Query (e a frente PERF-1) preserva. ──
    linhas.n = 0;
    const tRevalidar = await cronometrar(async () => {
      await act(async () => { queryClient.setQueryData(["/api/items/approved"], pecas.map((p, i) => (i === 0 ? { ...p, observations: "Conferir cor — revisado" } : p)));
        // O React Query avisa os observadores num setTimeout(0): sem esperar por
        // ele o act terminava antes de a página saber do dado novo.
        await new Promise((r) => setTimeout(r, 20));
      });
    }, "2. revalidação com 1 peça mudada");
    const rendersRevalidar = linhas.n;

    // ── 3. Trocar de aba de etapa ──
    linhas.n = 0;
    const tAba = await cronometrar(async () => {
      await act(async () => { (document.querySelector('[data-testid="stat-production"]') as HTMLElement).click(); });
    }, "3. aba Em Produção");
    const rendersAba = linhas.n;
    const linhasNaAba = document.querySelectorAll("[data-item-row]").length;
    // volta para "Todas"
    await act(async () => { (document.querySelector('[data-testid="stat-total"]') as HTMLElement).click(); });

    // ── 4. Digitar 3 letras ──
    const busca = document.querySelector('[data-testid="input-search-filter"]') as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
    linhas.n = 0;
    let tTeclas = 0;
    for (const t of ["E", "Ev", "Eve"]) {
      tTeclas += await cronometrar(async () => {
        await act(async () => {
          setter.call(busca, t);
          busca.dispatchEvent(new Event("input", { bubbles: true }));
        });
      }, `4. tecla "${t}"`);
    }
    const rendersTeclas = linhas.n;
    linhas.n = 0;
    const tRecorte = (await cronometrar(() => tick(210), "4b. recorte após debounce (inclui 210 ms de espera)")) - 210;
    const rendersRecorte = linhas.n;

    // limpa a busca
    await act(async () => { setter.call(busca, ""); busca.dispatchEvent(new Event("input", { bubbles: true })); });
    await tick(250);

    // ── 5. Lote: entrar na conferência em lote e marcar UMA peça ──
    await act(async () => { (document.querySelector('[data-testid="button-bulk-confer"]') as HTMLElement | null)?.click(); });
    const caixa = document.querySelector('[role="checkbox"][aria-label^="Selecionar"]') as HTMLElement | null;
    expect(caixa, "modo lote sem nenhuma caixa de seleção").toBeTruthy();
    linhas.n = 0;
    const tMarcar = await cronometrar(async () => {
      await act(async () => { caixa!.click(); });
    }, "5. marcar uma peça no lote");
    const rendersMarcar = linhas.n;
    expect(document.querySelectorAll('[role="checkbox"][aria-checked="true"]').length).toBe(1);
    // "Todas (N)" conta as elegíveis do recorte INTEIRO, não só as desenhadas.
    // (desktop: "Selecionar todas (N)"; celular: "Todas (N)")
    const botaoTodas = Array.from(document.querySelectorAll("button")).find((b) => /^(Selecionar todas|Todas) \(\d+\)$/.test(b.textContent ?? ""));
    const elegiveis = Number(botaoTodas?.textContent?.match(/\d+/)?.[0] ?? 0);
    const caixasDesenhadas = document.querySelectorAll('[role="checkbox"][aria-label^="Selecionar"]').length;
    registrar(`5b. lote: ${elegiveis} elegíveis no recorte, ${caixasDesenhadas} caixas desenhadas`);
    expect(elegiveis).toBeGreaterThan(caixasDesenhadas);
    await act(async () => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); });

    // ── 5c. "Mostrar mais": o próximo lote entra, sem redesenhar o que já estava ──
    const antesDoLote = document.querySelectorAll("[data-item-row]").length;
    linhas.n = 0;
    await cronometrar(async () => {
      await act(async () => { (document.querySelector('[data-testid="button-mostrar-mais-pecas"]') as HTMLElement | null)?.click(); });
      await tick(0);
    }, "5c. mostrar mais um lote");
    expect(document.querySelectorAll("[data-item-row]").length).toBe(antesDoLote + 60);
    expect(linhas.n).toBeLessThanOrEqual(60);

    // ── 6. Abrir a ficha de uma peça (estado da PÁGINA muda) ──
    linhas.n = 0;
    const tFicha = await cronometrar(async () => {
      await act(async () => { (document.querySelector('[data-testid^="text-display-id-"]') as HTMLElement | null)?.click(); });
    }, "6. abrir a ficha");
    const rendersFicha = linhas.n;

    const relatorio = {
      pecas: N_PECAS, eventos: N_EVENTOS,
      domMontado, linhasMontadas, rendersMontagem, tMontagem,
      tRevalidar, rendersRevalidar,
      tAba, rendersAba, linhasNaAba,
      tTeclas, rendersTeclas, tRecorte, rendersRecorte,
      tMarcar, rendersMarcar,
      tFicha, rendersFicha,
    };
    registrar(JSON.stringify(relatorio, null, 2));

    // ── Tetos (folgados de propósito) ──
    expect(linhasMontadas).toBeGreaterThan(0);
    expect(linhasMontadas).toBeLessThanOrEqual(200);
    expect(domMontado).toBeLessThan(15_000);
    // Revalidação redesenha só a peça que mudou.
    expect(rendersRevalidar).toBeLessThanOrEqual(2);
    // Digitar não redesenha a fila a cada tecla (o recorte vem depois do debounce).
    expect(rendersTeclas).toBe(0);
    // Abrir a ficha não redesenha as linhas.
    expect(rendersFicha).toBe(0);
    // Marcar uma peça redesenha só ela.
    expect(rendersMarcar).toBeLessThanOrEqual(2);
    cleanup();
  }, 1_500_000);
});
