// @vitest-environment jsdom
//
// ─────────────────────────────────────────────────────────────────────────────
// IRMÃO de modal-congelado.test.ts, que mede o modal de Eventos.
//
// Todos os testes daqui medem a MESMA grandeza do teste de Eventos: quantas
// vezes o MIOLO do modal renderiza depois que o Dialog já está com
// `data-state="closed"` — isto é, dentro da janela em que o Presence do Radix
// ainda segura a subárvore montada para animar a saída. Com FreezeWhileClosing
// esse número tem de ser ZERO.
//
// MEDIDO sem a correção (basta trocar o corpo de FreezeWhileClosing por
// `return <>{children}</>` e rodar este arquivo):
//
//   Modelos ......... 12 = 4 Popover     × 3 renders
//   Patrocinadores .. 27 = 9 FormMessage × 3 renders
//   Usuários .........  9 = 3 FormMessage × 3 renders
//   Solicitação ......  0 — ver abaixo
//
// Os 3 renders são os mesmos nas três primeiras: a chegada do refetch da
// invalidação, o toast (o useToast assina a PÁGINA, não só o Toaster) e o
// timer de entrada dele. O que separa uma tela da outra NÃO é quantos renders
// o onSuccess dispara, e sim quantas primitivas do Radix cada render atinge —
// cada primitiva custa um desanexa+reanexa de ref em fase de commit, e é essa
// multiplicação que aproxima o contador de updates aninhados do React do
// limite de 50 (o React #185).
//
// Solicitação é a exceção instrutiva: o modal de revisão é HTML puro (2
// primitivas), então o laço quase não o ameaça. Lá o defeito é outro — o
// `setSelectedItem(null)` esvazia o modal no meio do fade — e quem prova isso
// é a asserção de conteúdo, não a de contagem.
//
// O mecanismo do laço está escrito por extenso em
// client/src/components/modal-shell.tsx.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import * as React from "react";
import { render, act, cleanup } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";

const h = React.createElement;

// ── Contadores de render do miolo ───────────────────────────────────────────
// Cada um espia uma folha que só existe DENTRO do modal da respectiva tela.
// Se a folha renderizou, a subárvore do modal renderizou.

// Modelos: os 4 Popover do formulário (tipo, grupo, material, acabamento).
const modelos = vi.hoisted(() => ({ n: 0 }));
vi.mock("@/components/ui/popover", async () => {
  const R = await import("react");
  return {
    Popover: (p: any) => { modelos.n++; return R.createElement("div", null, p.children); },
    PopoverTrigger: (p: any) => R.createElement("div", null, p.children),
    // O conteúdo só monta com o popover aberto; para a contagem basta o
    // gatilho, e assim o teste não depende do portal do Radix.
    PopoverContent: () => null,
  };
});

// Patrocinadores: os 9 FormMessage do formulário. É folha pura (só desenha o
// erro do campo), então trocá-la não altera o comportamento da tela.
const patrocinadores = vi.hoisted(() => ({ n: 0 }));
vi.mock("@/components/ui/form", async (original) => {
  const real = await original<any>();
  return { ...real, FormMessage: () => { patrocinadores.n++; return null; } };
});

// Solicitação: os 2 FilePreview do modal de revisão (o thumb aprovado e o
// arquivo final da Arte). `isWebUrl` continua sendo o de verdade — a tela usa
// a função para decidir se o caminho é web ou de rede.
const solicitacao = vi.hoisted(() => ({ n: 0 }));
vi.mock("@/components/file-preview", async (original) => {
  const real = await original<any>();
  return { ...real, FilePreview: () => { solicitacao.n++; return null; } };
});

const MODELO = {
  id: "m1", name: "Backdrop Premium", type: "Backdrop", group: "Estrutura",
  area: "6", visual: "3x2", visualWidth: "3", visualHeight: "2",
  fileWidth: "300", fileHeight: "200", material: "Lona", finish: "Ilhós",
  hasVariableMeasurement: false,
};

const PATROCINADOR = {
  id: "s1", name: "Patro 1", email: "p1@ex.com", phone: "", company: "Empresa 1",
  contactPerson: "Fulano", notes: "", color: "#f97316", accountExecutiveId: "",
};

const USUARIO = {
  id: "u2", name: "Beltrano", email: "b@ex.com", role: "solicitacao",
  createdAt: "2026-01-15T12:00:00.000Z",
};

const EVENTO_SOL = {
  id: "e1", name: "Evento 1", status: "active", manuallyClosed: false,
  startDate: "2099-09-10", truckDepartureDate: "2099-09-05T08:00:00.000Z",
};

// `awaiting_final_review` é o status que põe a peça na fila de revisão. Os dois
// arquivos precisam ser URLs web: é o que faz os dois FilePreview desenharem —
// e `finalFileUrl` também é o que libera o botão "Liberar para Produção".
const PECA_REVISAO = {
  id: "i1", displayId: "SOL-001", type: "Backdrop", quantity: 2,
  status: "awaiting_final_review", event: EVENTO_SOL, eventId: "e1",
  approvalThumbUrl: "https://ex.com/aprovado.png",
  finalFileUrl: "https://ex.com/final.pdf",
  sponsors: [{ id: "s1", name: "Patro 1" }], observations: "", isReuse: false,
};

beforeAll(() => {
  // jsdom não calcula animation-name. Sem isto o Presence desmontaria o
  // conteúdo no MESMO commit em que `open` vira false — e a janela de "saindo
  // com animação", que é exatamente onde o bug vive, não existiria no teste.
  const real = window.getComputedStyle.bind(window);
  vi.stubGlobal("getComputedStyle", (el: Element, pe?: string | null) => {
    const base = real(el as any, pe as any);
    return new Proxy(base, {
      get(t, p) {
        if (p === "animationName") {
          const st = (el as HTMLElement).getAttribute?.("data-state");
          if (st === "open") return "radix-enter";
          if (st === "closed") return "radix-exit";
          return "none";
        }
        const v = (t as any)[p];
        return typeof v === "function" ? v.bind(t) : v;
      },
    });
  });

  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener() {}, removeEventListener() {},
    addListener() {}, removeListener() {}, dispatchEvent() { return false; },
  }));
  vi.stubGlobal("ResizeObserver", class {
    cb: any;
    constructor(cb: any) { this.cb = cb; }
    observe(el: any) {
      setTimeout(() => this.cb([{ target: el, borderBoxSize: [{ inlineSize: 16, blockSize: 16 }] }], this), 0);
    }
    unobserve() {}
    disconnect() {}
  });
  (Element.prototype as any).scrollIntoView = () => {};

  let versao = 0;
  vi.stubGlobal("fetch", async (url: any, init?: any) => {
    const u = String(url);
    const method = (init?.method || "GET").toUpperCase();
    const json = (b: any) =>
      new Response(JSON.stringify(b), { status: 200, headers: { "content-type": "application/json" } });
    if (u === "/api/auth/me") {
      return json({ id: "u1", name: "Admin", email: "a@a", role: "admin", mustChangePassword: false });
    }
    // `_v` muda a cada refetch: garante que a invalidação do onSuccess produz
    // dados NOVOS e, portanto, um render de verdade na página.
    if (u === "/api/standard-items" && method === "GET") { versao++; return json([{ ...MODELO, _v: versao }]); }
    if (u === "/api/catalog-options") return json([]);
    if (u === "/api/sponsors" && method === "GET") { versao++; return json([{ ...PATROCINADOR, _v: versao }]); }
    if (u === "/api/sponsors/usage") return json({ s1: { events: 1, items: 2 } });
    if (u === "/api/users/basic") return json([{ id: "u1", name: "Admin", role: "admin" }]);
    if (u === "/api/users" && method === "GET") { versao++; return json([{ ...USUARIO, _v: versao }]); }
    if (u === "/api/items" && method === "GET") { versao++; return json([{ ...PECA_REVISAO, _v: versao }]); }
    if (u === "/api/events" && method === "GET") return json([EVENTO_SOL]);
    if (u.startsWith("/api/audit-logs")) return json([]);
    if (u.startsWith("/api/standard-items/") || u.startsWith("/api/sponsors/")
      || u.startsWith("/api/users/") || u.startsWith("/api/items/")) return json({ ok: true });
    return json([]);
  });
});

beforeEach(() => {
  cleanup();
  modelos.n = 0;
  patrocinadores.n = 0;
  solicitacao.n = 0;
});

async function tick(ms = 60) {
  await act(async () => { await new Promise((r) => setTimeout(r, ms)); });
}

/** Envia o formulário do modal como o React o receberia de um clique em submit. */
async function enviarFormulario(seletor: string) {
  const form = document.querySelector(seletor) as HTMLFormElement;
  expect(form).toBeTruthy();
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

/** Digita no campo de busca da página — cada tecla é um render da PÁGINA. */
async function digitarNaBusca(seletor: string, textos: string[]) {
  const busca = document.querySelector(seletor) as HTMLInputElement;
  expect(busca).toBeTruthy();
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
  for (const t of textos) {
    await act(async () => {
      setter.call(busca, t);
      busca.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await tick(30);
  }
}

const dialog = () => document.querySelector('[role="dialog"]');

/** Espera o Dialog entrar na janela de saída (fechado, porém ainda montado). */
async function esperarSaindo() {
  for (let i = 0; i < 40 && dialog()?.getAttribute("data-state") !== "closed"; i++) await tick(10);
  expect(dialog()?.getAttribute("data-state")).toBe("closed");
}

/** Encerra a animação de saída à mão (jsdom não dispara animationend sozinho). */
async function encerrarAnimacaoDeSaida() {
  await act(async () => {
    document.querySelectorAll('[data-state="closed"]').forEach((n) => {
      const ev: any = new Event("animationend", { bubbles: false });
      ev.animationName = "radix-exit";
      n.dispatchEvent(ev);
    });
  });
  await tick(60);
}

describe("modal de Modelos: o miolo para de renderizar enquanto o modal sai", () => {
  it("salvar não manda mais nenhum render para a subárvore em desmontagem", async () => {
    const { queryClient } = await import("@/lib/queryClient");
    const { TooltipProvider } = await import("@/components/ui/tooltip");
    const { Toaster } = await import("@/components/ui/toaster");
    const Modelos = (await import("@/pages/modelos")).default;

    queryClient.clear();
    render(
      h(QueryClientProvider, { client: queryClient } as any,
        h(TooltipProvider, null, h(Modelos as any, null), h(Toaster as any, null))),
    );
    await tick(150);

    await act(async () => {
      (document.querySelector('[data-testid="button-edit-model-m1"]') as HTMLElement)?.click();
    });
    await tick(150);

    expect(dialog()?.getAttribute("data-state")).toBe("open");
    // 4 Popover no formulário: é o volume de primitivas que torna esta tela a
    // pior candidata ao laço.
    expect(modelos.n).toBeGreaterThan(0);
    expect((document.querySelector('[data-testid="input-model-name"]') as HTMLInputElement).value)
      .toBe("Backdrop Premium");

    await enviarFormulario('[role="dialog"] form');
    await esperarSaindo();

    // Só agora começa a contar: daqui para a frente o modal está morrendo.
    modelos.n = 0;

    // Os renders que o onSuccess provoca nesta janela: a chegada do refetch de
    // /api/standard-items, o toast (o useToast assina a PÁGINA, não só o
    // Toaster) e o timer de entrada dele. Mais três digitações na busca, que
    // não dependem de rede.
    await tick(200);
    await digitarNaBusca('[data-testid="input-search-models"]', ["a", "ab", "abc"]);
    await tick(300);

    // Sem FreezeWhileClosing este número é 12 (4 Popover × 3 renders).
    expect(modelos.n).toBe(0);

    // O congelamento NÃO pode grudar: encerrada a saída, o Presence desmonta e
    // a próxima abertura tem de renderizar do zero.
    await encerrarAnimacaoDeSaida();
    expect(dialog()).toBeNull();

    await digitarNaBusca('[data-testid="input-search-models"]', [""]);
    await tick(200);
    await act(async () => {
      (document.querySelector('[data-testid="button-edit-model-m1"]') as HTMLElement)?.click();
    });
    await tick(150);
    expect(dialog()?.getAttribute("data-state")).toBe("open");
    expect((document.querySelector('[data-testid="input-model-name"]') as HTMLInputElement).value)
      .toBe("Backdrop Premium");
    expect(modelos.n).toBeGreaterThan(0);
  }, 40000);
});

describe("modal de Patrocinadores: o form.reset() não apaga o formulário à vista", () => {
  it("salvar não manda mais nenhum render para a subárvore em desmontagem", async () => {
    const { queryClient } = await import("@/lib/queryClient");
    const { TooltipProvider } = await import("@/components/ui/tooltip");
    const { Toaster } = await import("@/components/ui/toaster");
    const Patrocinadores = (await import("@/pages/patrocinadores")).default;

    queryClient.clear();
    render(
      h(QueryClientProvider, { client: queryClient } as any,
        h(TooltipProvider, null, h(Patrocinadores as any, null), h(Toaster as any, null))),
    );
    await tick(150);

    await act(async () => {
      (document.querySelector('[data-testid="button-edit-s1"]') as HTMLElement)?.click();
    });
    await tick(150);

    expect(dialog()?.getAttribute("data-state")).toBe("open");
    expect(patrocinadores.n).toBeGreaterThan(0);
    expect((document.querySelector('[data-testid="input-sponsor-name"]') as HTMLInputElement).value)
      .toBe("Patro 1");

    await enviarFormulario("#sponsor-form");
    await esperarSaindo();

    // A partir daqui, todo render que chegar ao miolo bate numa subárvore que
    // está sendo desmontada — é o que o form.reset() + invalidate + toast
    // faziam de uma vez só.
    patrocinadores.n = 0;

    await tick(200);
    await digitarNaBusca('[data-testid="input-search-sponsors"]', ["a", "ab", "abc"]);
    await tick(300);

    // Sem FreezeWhileClosing este número é 27 (9 FormMessage × 3 renders).
    expect(patrocinadores.n).toBe(0);

    // E o nome continua escrito no campo durante toda a saída, em vez de o
    // form.reset() esvaziar o formulário na cara do usuário.
    expect((document.querySelector('[data-testid="input-sponsor-name"]') as HTMLInputElement).value)
      .toBe("Patro 1");

    await encerrarAnimacaoDeSaida();
    expect(dialog()).toBeNull();

    await digitarNaBusca('[data-testid="input-search-sponsors"]', [""]);
    await tick(200);
    await act(async () => {
      (document.querySelector('[data-testid="button-edit-s1"]') as HTMLElement)?.click();
    });
    await tick(150);
    expect(dialog()?.getAttribute("data-state")).toBe("open");
    expect(patrocinadores.n).toBeGreaterThan(0);
  }, 40000);
});

describe("modal de Usuários: mesmo onSuccess de Patrocinadores, menos primitivas", () => {
  it("salvar não manda mais nenhum render para a subárvore em desmontagem", async () => {
    const { queryClient } = await import("@/lib/queryClient");
    const { TooltipProvider } = await import("@/components/ui/tooltip");
    const { Toaster } = await import("@/components/ui/toaster");
    const Usuarios = (await import("@/pages/usuarios")).default;

    queryClient.clear();
    render(
      h(QueryClientProvider, { client: queryClient } as any,
        h(TooltipProvider, null, h(Usuarios as any, null), h(Toaster as any, null))),
    );
    await tick(150);

    await act(async () => {
      (document.querySelector('[data-testid="button-edit-u2"]') as HTMLElement)?.click();
    });
    await tick(150);

    expect(dialog()?.getAttribute("data-state")).toBe("open");
    expect((document.querySelector('[data-testid="input-name"]') as HTMLInputElement).value)
      .toBe("Beltrano");

    await enviarFormulario('[role="dialog"] form');
    await esperarSaindo();

    patrocinadores.n = 0;
    await tick(200);
    await digitarNaBusca('[data-testid="input-search-users"]', ["a", "ab", "abc"]);
    await tick(300);

    // Sem FreezeWhileClosing este número é 9 (3 FormMessage × 3 renders) — um
    // terço de Patrocinadores, com o MESMO onSuccess. É a diferença de
    // primitivas, não de renders, que separa as duas telas.
    expect(patrocinadores.n).toBe(0);
    // E o nome continua escrito, em vez de o form.reset() esvaziar à vista.
    expect((document.querySelector('[data-testid="input-name"]') as HTMLInputElement).value)
      .toBe("Beltrano");

    await encerrarAnimacaoDeSaida();
    expect(dialog()).toBeNull();
  }, 40000);
});

describe("modal de Solicitação: o item zerado não esvazia o modal que está saindo", () => {
  it("liberar não manda mais nenhum render para a subárvore em desmontagem", async () => {
    const { queryClient } = await import("@/lib/queryClient");
    const { TooltipProvider } = await import("@/components/ui/tooltip");
    const { AuthProvider } = await import("@/contexts/auth-context");
    const { Toaster } = await import("@/components/ui/toaster");
    const Solicitacao = (await import("@/pages/solicitacao")).default;

    queryClient.clear();
    render(
      h(QueryClientProvider, { client: queryClient } as any,
        h(TooltipProvider, null,
          h(AuthProvider, null, h(Solicitacao as any, null), h(Toaster as any, null)))),
    );
    await tick(200);

    await act(async () => {
      (document.querySelector('[data-testid="button-review-i1"]') as HTMLElement)?.click();
    });
    await tick(150);
    expect(dialog()?.getAttribute("data-state")).toBe("open");
    // Os dois FilePreview (aprovado × final) provam que o miolo desenhou.
    expect(solicitacao.n).toBeGreaterThan(0);

    // Liberar abre a confirmação; confirmar dispara a mutation que fecha OS
    // DOIS diálogos e zera `selectedItem` no mesmo commit.
    await act(async () => {
      (document.querySelector('[data-testid="button-release-modal"]') as HTMLElement)?.click();
    });
    await tick(120);
    await act(async () => {
      (document.querySelector('[data-testid="button-release-confirm"]') as HTMLElement)?.click();
    });

    const revisao = () => document.querySelector('.review-dialog-shell');
    for (let i = 0; i < 40 && revisao()?.getAttribute("data-state") !== "closed"; i++) await tick(10);
    expect(revisao()?.getAttribute("data-state")).toBe("closed");

    solicitacao.n = 0;
    await tick(200);
    await digitarNaBusca('[data-testid="input-search"]', ["a", "ab", "abc"]);
    await tick(300);

    // Esta tela é a exceção que a medição revelou, e por isso as DUAS
    // asserções abaixo importam. O contador dá zero mesmo SEM a correção — não
    // porque nada renderize, mas porque `setSelectedItem(null)` faz o miolo
    // desaparecer: sem item não há URL de arquivo, e os dois FilePreview dão
    // lugar aos avisos de "sem arquivo". O laço do React #185 quase não
    // ameaça aqui (o modal de revisão é HTML puro, só 2 primitivas do Radix);
    // o defeito real é o modal ESVAZIAR no meio do fade. Quem prova isso é a
    // segunda asserção: sem congelar, o cabeçalho perde o "SOL-001".
    expect(solicitacao.n).toBe(0);
    expect(revisao()?.textContent).toContain("SOL-001");
  }, 40000);
});
