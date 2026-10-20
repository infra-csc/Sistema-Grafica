// @vitest-environment jsdom
//
// ─────────────────────────────────────────────────────────────────────────────
// "BRADESCO SAI DO EVENTO — O QUE FAZER COM AS PEÇAS DELE?" (dono, 20/10)
//
// O caso: "Longevidade Bradesco - Manaus" (16/10). Na mesma edição do evento
// entrou "Bradesco Seguros" e saiu "Bradesco"; o salvar cancelou as 13 peças
// que só tinham o Bradesco. A intenção era trocar. Agora a tela pergunta.
//
// Aqui, montados de verdade: o hook (useSaidaDePatrocinador) + o diálogo
// (DialogoDeSaida), a ordem das chamadas (executarSaidas), a conta
// compartilhada (shared/troca-de-patrocinador) e as duas portas que tiram
// patrocinador do evento (Editar Evento e a Vinculação) passando por ele.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import * as React from "react";
import { readFileSync, readdirSync } from "fs";
import path from "path";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { useSaidaDePatrocinador, executarSaidas, type SaidaDePatrocinador, type DecisoesDeSaida } from "@/components/saida-de-patrocinador/use-saida-de-patrocinador";
import { DialogoDeSaida } from "@/components/saida-de-patrocinador/dialogo-de-saida";
import { impactoDaSaida, destinosPreSelecionados, seriaCancelada, faseNaTroca, type PecaNaSaida } from "@shared/troca-de-patrocinador";

const h = React.createElement;

const H = vi.hoisted(() => ({
  chamadas: [] as Array<{ metodo: string; url: string; corpo: unknown }>,
  pecas: [] as unknown[],
}));

beforeAll(() => {
  if (!window.matchMedia) {
    (window as any).matchMedia = (q: string) => ({ matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {} });
  }
  if (!(globalThis as any).ResizeObserver) {
    (globalThis as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  }
  vi.stubGlobal("fetch", async (url: RequestInfo | URL, init?: RequestInit) => {
    const [u] = String(url).split("?");
    const metodo = (init?.method || "GET").toUpperCase();
    H.chamadas.push({ metodo, url: String(url), corpo: init?.body ? JSON.parse(String(init.body)) : undefined });
    const corpo = metodo === "GET" && u.endsWith("/sponsors/pecas")
      ? { pecas: H.pecas }
      : metodo === "POST" && u.endsWith("/sponsors/trocar")
        ? { de: "x", para: "y", passaram: 3, pendenciasAbertas: 1, canceladas: 0 }
        : { ok: true };
    return new Response(JSON.stringify(corpo), { status: 200, headers: { "content-type": "application/json" } });
  });
});

beforeEach(() => {
  cleanup();
  H.chamadas.length = 0;
  H.pecas = [];
});

async function tick(ms = 60) { await act(async () => { await new Promise((r) => setTimeout(r, ms)); }); }

const SPONSORS = [
  { id: "brad", name: "Bradesco" },
  { id: "seg", name: "Bradesco Seguros" },
  { id: "outro", name: "Outro Patrocinador" },
  { id: "cat", name: "Catálogo Distante" },
  { id: "velho", name: "Velho Arquivado", arquivadoEm: "2026-01-01" },
];

// O Bradesco em 4 peças: 2 só com ele (rascunho e em aprovação), 1 com ele e
// o Outro, 1 só com ele mas já na Gráfica (essa nunca é cancelada).
const PECAS: PecaNaSaida[] = [
  { id: "p1", displayId: "#1", type: "Pórtico", status: "draft", sponsorIds: ["brad"] },
  { id: "p2", displayId: "#2", type: "Testeira", status: "awaiting_sponsor_approval", sponsorIds: ["brad"] },
  { id: "p3", displayId: "#3", type: "Faixa", status: "awaiting_submission", sponsorIds: ["brad", "outro"] },
  { id: "p4", displayId: "#4", type: "Banner", status: "inProduction", sponsorIds: ["brad"] },
];

function montar() {
  const ref: { atual: SaidaDePatrocinador | null } = { atual: null };
  function Palco() {
    const saida = useSaidaDePatrocinador();
    ref.atual = saida;
    return h(DialogoDeSaida, { saida, sponsors: SPONSORS, isMobile: false });
  }
  render(h(Palco));
  let resultado: DecisoesDeSaida | null | undefined;
  const perguntar = async (removidos: string[], entrantes: string[], doEvento: string[]) => {
    await act(async () => {
      void ref.atual!.perguntar({ eventId: "ev-1", removidos, entrantes, doEvento }).then((r) => { resultado = r; });
    });
    await tick();
  };
  return { perguntar, resultado: () => resultado };
}

// ═════════════════════════════════════════════════════════════════════════════
describe("a conta compartilhada (shared/troca-de-patrocinador)", () => {
  it("fase de cada peça na troca: antes, em aprovação, depois (incluindo a Gráfica), fora do fluxo", () => {
    expect(faseNaTroca("draft")).toBe("antes_da_aprovacao");
    expect(faseNaTroca("awaiting_submission")).toBe("antes_da_aprovacao");
    expect(faseNaTroca("awaiting_sponsor_approval")).toBe("em_aprovacao");
    expect(faseNaTroca("sponsor_approved")).toBe("depois_da_aprovacao");
    expect(faseNaTroca("inProduction")).toBe("depois_da_aprovacao");
    expect(faseNaTroca("canceled")).toBe("fora_do_fluxo");
  });

  it("'só têm ele' e 'seriam canceladas' espelham a regra do DELETE: a peça já na Gráfica nunca cancela", () => {
    const i = impactoDaSaida(PECAS, ["brad"], {})["brad"];
    expect(i).toEqual({ pecas: 4, soEle: 2, canceladasSeRemover: 2, emAprovacao: 1, depoisDaAprovacao: 1 });
    expect(seriaCancelada(PECAS[3], new Set(["brad"]))).toBe(false);
  });

  it("dois saindo com 'Só remover': a peça que tinha os dois também cancela — e a troca de um a salva", () => {
    const soRemover = impactoDaSaida(PECAS, ["brad", "outro"], { brad: { tipo: "remover" }, outro: { tipo: "remover" } });
    expect(soRemover.brad.canceladasSeRemover).toBe(3);
    const trocandoOOutro = impactoDaSaida(PECAS, ["brad", "outro"], { outro: { tipo: "trocar", para: "seg" } });
    expect(trocandoOOutro.brad.canceladasSeRemover).toBe(2);
  });

  it("pré-seleção só no caso óbvio: UM saindo com peças e UM entrando", () => {
    expect(destinosPreSelecionados(["brad"], ["seg"])).toEqual({ brad: "seg" });
    expect(destinosPreSelecionados(["brad"], ["seg", "cat"])).toEqual({});
    expect(destinosPreSelecionados(["brad", "outro"], ["seg"])).toEqual({});
    expect(destinosPreSelecionados(["brad"], [])).toEqual({});
  });
});

describe("o diálogo só aparece quando quem sai TEM peças", () => {
  it("removido sem peças: não pergunta nada e segue (decisões vazias = remover como sempre)", async () => {
    H.pecas = [];
    const t = montar();
    await t.perguntar(["outro"], [], ["brad"]);
    expect(screen.queryByTestId("dialogo-saida-de-patrocinador")).toBeNull();
    expect(t.resultado()).toEqual({});
  });

  it("ninguém saindo: nem consulta o servidor", async () => {
    const t = montar();
    await t.perguntar([], ["seg"], ["brad", "seg"]);
    expect(H.chamadas).toEqual([]);
    expect(t.resultado()).toEqual({});
  });
});

describe("o caso Kakau: saiu Bradesco, entrou Bradesco Seguros", () => {
  it("título com as peças, 'Passar para Bradesco Seguros' já escolhido, salvar troca", async () => {
    H.pecas = PECAS;
    const t = montar();
    await t.perguntar(["brad"], ["seg"], ["outro", "seg"]);
    expect(screen.getByTestId("dialogo-saida-de-patrocinador")).toBeTruthy();
    expect(screen.getByText("Bradesco sai do evento — o que fazer com as 4 peças dele?")).toBeTruthy();
    expect(screen.getByTestId("resumo-da-saida").textContent).toContain("2 só têm Bradesco e seriam canceladas em “Só remover”");
    expect((screen.getByTestId("radio-trocar-brad") as HTMLInputElement).checked).toBe(true);
    expect(screen.getByTestId("destino-escolhido-brad").textContent).toContain("Bradesco Seguros");
    expect(screen.getByTestId("destino-escolhido-brad").textContent).toContain("entrou agora");
    expect(screen.getByTestId("opcao-trocar-brad").textContent).toContain("1 em aprovação ganha aprovação pendente do novo");
    expect(screen.getByTestId("opcao-trocar-brad").textContent).toContain("1 já aprovada troca só a marca, sem reabrir a aprovação");

    const salvar = screen.getByTestId("button-confirmar-saida") as HTMLButtonElement;
    expect(salvar.disabled).toBe(false);
    expect(salvar.textContent).toContain("Salvar alterações");
    fireEvent.click(salvar);
    await tick();
    expect(t.resultado()).toEqual({ brad: { tipo: "trocar", para: "seg" } });
    expect(screen.queryByText("Bradesco sai do evento — o que fazer com as 4 peças dele?")).toBeNull();
  });

  it("'Só remover' avisa quantas serão canceladas e o botão diz isso", async () => {
    H.pecas = PECAS;
    const t = montar();
    await t.perguntar(["brad"], ["seg"], ["outro", "seg"]);
    fireEvent.click(screen.getByTestId("radio-remover-brad"));
    expect(screen.getByTestId("aviso-cancelamento-brad").textContent).toBe("2 peças serão canceladas (só tinham Bradesco).");
    const salvar = screen.getByTestId("button-confirmar-saida") as HTMLButtonElement;
    expect(salvar.textContent).toContain("Salvar e cancelar 2 peças");
    fireEvent.click(salvar);
    await tick();
    expect(t.resultado()).toEqual({ brad: { tipo: "remover" } });
  });

  it("ir ao 'Só remover' e voltar não perde o destino pré-escolhido", async () => {
    H.pecas = PECAS;
    const t = montar();
    await t.perguntar(["brad"], ["seg"], ["outro", "seg"]);
    fireEvent.click(screen.getByTestId("radio-remover-brad"));
    expect(screen.getByTestId("opcao-trocar-brad").textContent).toContain("Passar para Bradesco Seguros");
    fireEvent.click(screen.getByTestId("radio-trocar-brad"));
    expect(screen.getByTestId("destino-escolhido-brad").textContent).toContain("Bradesco Seguros");
    const salvar = screen.getByTestId("button-confirmar-saida") as HTMLButtonElement;
    expect(salvar.disabled).toBe(false);
    fireEvent.click(salvar);
    await tick();
    expect(t.resultado()).toEqual({ brad: { tipo: "trocar", para: "seg" } });
  });

  it("Cancelar volta ao formulário: decisão nula, nada é gravado", async () => {
    H.pecas = PECAS;
    const t = montar();
    await t.perguntar(["brad"], ["seg"], ["outro", "seg"]);
    const antes = H.chamadas.length;
    fireEvent.click(screen.getByTestId("button-cancelar-saida"));
    await tick();
    expect(t.resultado()).toBeNull();
    expect(H.chamadas.length).toBe(antes);
  });
});

describe("sem pré-seleção: a pessoa escolhe", () => {
  it("dois saindo: uma decisão por patrocinador; salvar travado com o motivo até decidir os dois", async () => {
    H.pecas = PECAS;
    const t = montar();
    await t.perguntar(["brad", "outro"], ["seg"], ["seg"]);
    expect(screen.getByText("2 patrocinadores saem do evento — o que fazer com as peças de cada um?")).toBeTruthy();
    expect(screen.getByTestId("secao-saida-brad")).toBeTruthy();
    expect(screen.getByTestId("secao-saida-outro")).toBeTruthy();
    expect((screen.getByTestId("radio-trocar-brad") as HTMLInputElement).checked).toBe(false);
    expect((screen.getByTestId("button-confirmar-saida") as HTMLButtonElement).disabled).toBe(true);
    expect(document.body.textContent).toContain("Escolha o que fazer com as peças de Bradesco.");

    // Bradesco → passar; o destino vem da lista (quem entrou no topo)
    fireEvent.click(screen.getByTestId("radio-trocar-brad"));
    expect(document.body.textContent).toContain("Escolha para qual patrocinador passam as peças de Bradesco.");
    fireEvent.click(screen.getByTestId("opcao-destino-brad-seg").querySelector("input")!);
    expect(screen.getByTestId("destino-escolhido-brad").textContent).toContain("Bradesco Seguros");

    // Outro → buscar no catálogo (fora do evento entra junto); arquivado não aparece
    fireEvent.click(screen.getByTestId("radio-trocar-outro"));
    fireEvent.change(screen.getByTestId("busca-destino-outro"), { target: { value: "catalogo" } });
    expect(screen.getByTestId("opcao-destino-outro-cat").textContent).toContain("fora do evento — entra junto");
    fireEvent.change(screen.getByTestId("busca-destino-outro"), { target: { value: "velho" } });
    expect(screen.getByTestId("destino-vazio-outro")).toBeTruthy();
    fireEvent.change(screen.getByTestId("busca-destino-outro"), { target: { value: "catalogo" } });
    fireEvent.click(screen.getByTestId("opcao-destino-outro-cat").querySelector("input")!);

    const salvar = screen.getByTestId("button-confirmar-saida") as HTMLButtonElement;
    expect(salvar.disabled).toBe(false);
    fireEvent.click(salvar);
    await tick();
    expect(t.resultado()).toEqual({ brad: { tipo: "trocar", para: "seg" }, outro: { tipo: "trocar", para: "cat" } });
  });

  it("dois em 'Só remover': a conta soma a peça que tinha os dois, e a frase não diz 'só tinham ele'", async () => {
    H.pecas = PECAS;
    const t = montar();
    await t.perguntar(["brad", "outro"], [], ["seg"]);
    // quem tem mais peças vem primeiro
    const secoes = Array.from(document.querySelectorAll("[data-testid^='secao-saida-']")).map((e) => e.getAttribute("data-testid"));
    expect(secoes).toEqual(["secao-saida-brad", "secao-saida-outro"]);
    fireEvent.click(screen.getByTestId("radio-remover-brad"));
    expect(screen.getByTestId("aviso-cancelamento-brad").textContent).toBe("2 peças serão canceladas (só tinham Bradesco).");
    fireEvent.click(screen.getByTestId("radio-remover-outro"));
    expect(screen.getByTestId("aviso-cancelamento-brad").textContent).toBe("3 peças serão canceladas (ficam sem nenhum patrocinador).");
    expect(screen.getByTestId("aviso-cancelamento-outro").textContent).toBe("1 peça será cancelada (fica sem nenhum patrocinador).");
    expect((screen.getByTestId("button-confirmar-saida") as HTMLButtonElement).textContent).toContain("Salvar e cancelar 3 peças");
    expect(t.resultado()).toBeUndefined();
  });

  it("quem está saindo não é destino (nem o próprio, nem o outro que sai)", async () => {
    H.pecas = PECAS;
    const t = montar();
    await t.perguntar(["brad", "outro"], [], ["seg"]);
    fireEvent.click(screen.getByTestId("radio-trocar-brad"));
    fireEvent.change(screen.getByTestId("busca-destino-brad"), { target: { value: "o" } });
    expect(screen.queryByTestId("opcao-destino-brad-brad")).toBeNull();
    expect(screen.queryByTestId("opcao-destino-brad-outro")).toBeNull();
    expect(t.resultado()).toBeUndefined();
  });
});

describe("executarSaidas: trocas primeiro (uma de cada vez), remoções depois", () => {
  it("POST …/trocar para quem passa; DELETE para quem só sai; nunca DELETE para quem foi trocado", async () => {
    const nome = (id: string) => SPONSORS.find((s) => s.id === id)?.name ?? id;
    const r = await executarSaidas("ev-1", ["brad", "outro", "semPecas"], { brad: { tipo: "trocar", para: "seg" }, outro: { tipo: "remover" } }, nome);
    const ordem = H.chamadas.map((c) => `${c.metodo} ${c.url}`);
    expect(ordem[0]).toBe("POST /api/events/ev-1/sponsors/trocar");
    expect(H.chamadas[0].corpo).toEqual({ de: "brad", para: "seg" });
    expect(ordem.slice(1).sort()).toEqual(["DELETE /api/events/ev-1/sponsors/outro", "DELETE /api/events/ev-1/sponsors/semPecas"]);
    expect(ordem).not.toContain("DELETE /api/events/ev-1/sponsors/brad");
    expect(r.falhas).toEqual([]);
    expect(r.trocas[0].nomeDe).toBe("Bradesco");
    expect(r.trocas[0].nomePara).toBe("Bradesco Seguros");
  });
});

describe("as duas portas que tiram patrocinador do evento passam pela pergunta", () => {
  const ler = (rel: string) => readFileSync(path.resolve(__dirname, "../..", rel), "utf8");

  it("Editar Evento: confere quem sai, pergunta, e só então grava (trocas antes das remoções)", () => {
    const f = ler("client/src/components/eventos/use-formulario-do-evento.tsx");
    expect(f).toContain("decisoes = await saida.perguntar({");
    expect(f).toContain("if (!decisoes) return;");
    expect(f).toContain("await executarSaidas(id, toRemove, decisoes,");
    // o DELETE direto saiu do formulário: toda remoção passa por executarSaidas
    expect(f).not.toContain('apiRequest("DELETE", `/api/events/${id}/sponsors/${sponsorId}`)');
    expect(ler("client/src/components/eventos/modal-do-evento.tsx")).toContain("<DialogoDeSaida saida={form.saida}");
  });

  it("Vinculação (Patrocinadores do evento): a mesma pergunta e a mesma execução", () => {
    const f = ler("client/src/components/vinculacao/use-acoes-da-vinculacao.tsx");
    expect(f).toContain("decisoes = await saida.perguntar({");
    expect(f).toContain("await executarSaidas(eventId, toRemove, decisoes, nome)");
    expect(f).not.toContain('apiRequest("DELETE", `/api/events/${eventId}/sponsors/${sponsorId}`)');
    expect(ler("client/src/pages/vincular-patrocinadores.tsx")).toContain("<DialogoDeSaida saida={a.saida}");
  });

  it("nenhum outro lugar do client tira patrocinador do evento por fora", () => {
    const raiz = path.resolve(__dirname, "../../client/src");
    const arquivos = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? arquivos(path.join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [path.join(dir, e.name)] : []);
    const quemDesvincula = arquivos(raiz)
      .filter((f) => /"DELETE",\s*`\/api\/events\/\$\{[^}]+\}\/sponsors\//.test(readFileSync(f, "utf8")))
      .map((f) => path.relative(raiz, f).split(path.sep).join("/"));
    expect(quemDesvincula).toEqual(["components/saida-de-patrocinador/use-saida-de-patrocinador.ts"]);
  });
});
