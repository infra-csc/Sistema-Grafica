// ─────────────────────────────────────────────────────────────────────────────
// PRIORIDADE DA PEÇA E DO EVENTO — as rotas e o job reais sobre o storage de
// mentira de regras-fluxo-apoio.ts.
//
// Vieram de casos que só liam o fonte:
//   · prioridade-da-peca.test.ts — a coluna e o allow-list do PATCH, o gate
//     admin|Solicitação (no PATCH só quando o valor MUDA; na criação também),
//     o aviso à Arte só na transição para true, e a trilha;
//   · prioridade-automatica.test.ts — o job respeita a trava manual e zera o
//     evento finalizado, roda no boot e de hora em hora sem derrubar o
//     processo, definir à mão trava e limpar destrava na hora, evento novo já
//     nasce com prioridade e mudar a saída reprioriza.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { getTableConfig } from "drizzle-orm/pg-core";

const H = vi.hoisted(() => {
  // events.ts importa a árvore do banco; a URL só precisa existir (nada conecta).
  process.env.DATABASE_URL ??= "postgres://teste:teste@localhost:5432/banco_nunca_acessado";
  return {
    storage: {} as Record<string, any>,
    db: {} as Record<string, any>,
    broadcast: [] as any[],
    trilha: [] as string[],
    gravadas: [] as Array<{ id: string; priority: unknown }>,
  };
});

vi.mock("../db", () => ({ db: H.db, pool: {} }));
vi.mock("../storage", async () => {
  const real = await vi.importActual<any>("../storage");
  return { ...real, storage: H.storage };
});
vi.mock("../routes/shared", async () => {
  const real = await vi.importActual<any>("../routes/shared");
  return {
    ...real,
    broadcast: (m: any) => { H.broadcast.push(m); },
    createAuditLog: async (_r: any, _a: string, _t: string, _id: string, detalhe: string) => { H.trilha.push(detalhe); },
    updateEventStatus: async () => {},
  };
});
// A liderança (uma cópia por hora) é do banco; aqui a cópia única sempre lidera.
vi.mock("../services/lideranca", () => ({ executarComoLider: async (_n: string, fazer: () => Promise<unknown>) => fazer() }));
// O job de verdade, embrulhado num espião: a rota de evento chama ESTE nome.
vi.mock("../services/prioridadeAutomatica", async () => {
  const real = await vi.importActual<any>("../services/prioridadeAutomatica");
  return { ...real, aplicarPrioridadeAutomatica: vi.fn((...a: unknown[]) => real.aplicarPrioridadeAutomatica(...a)) };
});

import { items, events } from "@shared/schema";
import { prioridadePelaSaida } from "@shared/prioridade-do-evento";
import { updateItemSchema } from "../services/edicao-da-peca";
import { aplicarPrioridadeAutomatica, startPrioridadeAutomatica } from "../services/prioridadeAutomatica";
import { registrarCriacao } from "../routes/itens/criacao";
import { registrarEdicao } from "../routes/itens/edicao";
import { registerEventRoutes } from "../routes/events";
import { capturarRotas } from "./rotas-de-mentira";
import { ligarStorage, mundoNovo, peca, sessao, type Mundo } from "./regras-fluxo-apoio";

const { chamar } = capturarRotas((app) => { registrarCriacao(app); registrarEdicao(app); registerEventRoutes(app); });
const DIA = 86_400_000;
const coluna = (tabela: any, nome: string) => getTableConfig(tabela).columns.find((c) => c.name === nome);

let mundo: Mundo;
beforeEach(() => {
  mundo = mundoNovo();
  ligarStorage(H.storage, mundo);
  H.storage.getAllEvents = vi.fn(async () => Object.values(mundo.eventos));
  H.storage.createEvent = vi.fn(async (dados: any) => (mundo.eventos.novo = { id: "novo", ...dados }));
  H.broadcast.length = 0; H.trilha.length = 0; H.gravadas.length = 0;
  // O único UPDATE do job: db.update(events).set({ priority }).where(eq(events.id, id)).
  H.db.update = () => ({
    set: (valores: any) => ({
      where: async (cond: any) => {
        const id = (cond?.queryChunks ?? []).map((c: any) => c?.value).find((v: unknown) => typeof v === "string" && mundo.eventos[v as string]);
        H.gravadas.push({ id, priority: valores.priority });
        if (id) mundo.eventos[id] = { ...mundo.eventos[id], ...valores };
      },
    }),
  });
  vi.mocked(aplicarPrioridadeAutomatica).mockClear();
});

// ═════════════════════════════════════════════════════════════════════════════
describe("prioridade da PEÇA", () => {
  const patch = (papel: string, corpo: Record<string, unknown>) =>
    chamar("PATCH /api/items/:id", { sessao: sessao(papel), params: { id: "p1" }, body: corpo });
  const LINHA = { eventId: "ev-1", type: "Pórtico", description: "x", quantity: 1, area: "9.00", visual: "9.00", material: "Lona", finish: "Ilhós", measurement: "3x3", calculatedM2: "9.00" };

  it("isPriority é coluna da peça (default false) e passa pelo allow-list do PATCH", async () => {
    const c = coluna(items, "is_priority");
    expect(c?.notNull).toBe(true);
    expect(c?.default).toBe(false);
    expect(updateItemSchema.parse({ isPriority: true })).toEqual({ isPriority: true });

    mundo.itens.p1 = peca();
    expect((await patch("solicitacao", { isPriority: true })).status).toBe(200);
    expect(mundo.itens.p1.isPriority).toBe(true);
  });

  it("no PATCH, só admin e Solicitação MUDAM o valor — o mesmo valor no form inteiro passa", async () => {
    for (const papel of ["arte", "atendimento"]) {
      mundo.itens.p1 = peca({ isPriority: false });
      const muda = await patch(papel, { isPriority: true });
      expect(muda.status, papel).toBe(403);
      expect((muda.body as any).error).toBe("Marcar peça como prioritária é do admin e da Solicitação.");
      expect(mundo.itens.p1.isPriority).toBe(false);
      // A Arte editando outro campo manda o form inteiro com o valor de sempre.
      const igual = await patch(papel, { isPriority: false, description: "Pórtico novo" });
      expect(igual.status, papel).toBe(200);
    }
    mundo.itens.p1 = peca({ isPriority: true });
    expect((await patch("admin", { isPriority: false })).status).toBe(200);
  });

  it("na criação, o mesmo gate: quem não gerencia a lista não cria peça já prioritária", async () => {
    mundo.eventos["ev-1"].createdBy = "u1"; // criador do evento: cria peça, mas não prioriza
    const arte = await chamar("POST /api/items", { sessao: sessao("grafica"), body: { ...LINHA, isPriority: true } });
    expect(arte.status).toBe(403);
    expect((arte.body as any).error).toBe("Marcar peça como prioritária é do admin e da Solicitação.");
    expect(H.storage.createItem).not.toHaveBeenCalled();
    expect((await chamar("POST /api/items", { sessao: sessao("grafica"), body: LINHA })).status).toBe(201);
  });

  it("o aviso à Arte sai na transição para true — e só nela", async () => {
    mundo.itens.p1 = peca({ isPriority: false });
    await patch("admin", { isPriority: true });
    expect(mundo.notificacoes).toHaveLength(1);
    expect(mundo.notificacoes[0]).toMatchObject({ type: "itemPriority", targetRoles: ["arte"], itemId: "p1" });
    expect(mundo.notificacoes[0].message).toBe("PEÇA PRIORITÁRIA: #0500 Pórtico - Evento: COPA NORTE — fura a fila da Arte");

    await patch("admin", { isPriority: true, description: "de novo" }); // já era prioritária
    await patch("admin", { isPriority: false });                          // desmarcar não alarma
    expect(mundo.notificacoes).toHaveLength(1);
  });

  it("peça que já NASCE prioritária avisa a Arte na criação (itemPriority no lugar de itemAdded)", async () => {
    await chamar("POST /api/items", { sessao: sessao("solicitacao"), body: { ...LINHA, isPriority: true } });
    expect(mundo.notificacoes[0]).toMatchObject({ type: "itemPriority", targetRoles: ["arte"] });
    expect(mundo.notificacoes[0].message).toMatch(/^PEÇA PRIORITÁRIA: .* — fura a fila da Arte$/);

    await chamar("POST /api/items", { sessao: sessao("solicitacao"), body: LINHA });
    expect(mundo.notificacoes[1].type).toBe("itemAdded");
  });

  it("a trilha registra marcar E desmarcar", async () => {
    mundo.itens.p1 = peca({ isPriority: false });
    await patch("admin", { isPriority: true });
    await patch("admin", { isPriority: false });
    expect(H.trilha[0]).toContain("Peça marcada como PRIORITÁRIA — fura a fila da Arte");
    expect(H.trilha[1]).toContain("Prioridade da peça removida");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("prioridade automática do EVENTO", () => {
  it("o job respeita a trava manual e zera o evento finalizado", async () => {
    const col = coluna(events, "priority_manual");
    expect(col?.notNull).toBe(true);
    expect(col?.default).toBe(false);

    const agora = Date.now();
    mundo.eventos = {
      solto: { id: "solto", name: "A", status: "created", startDate: new Date(agora + 30 * DIA), truckDepartureDate: new Date(agora + 2 * DIA), priority: "baixa", priorityManual: false },
      travado: { id: "travado", name: "B", status: "created", startDate: new Date(agora + 30 * DIA), truckDepartureDate: new Date(agora + 2 * DIA), priority: "baixa", priorityManual: true },
      acabou: { id: "acabou", name: "C", status: "created", startDate: "2020-01-10", truckDepartureDate: new Date("2020-01-01T00:00:00Z"), priority: "urgente", priorityManual: false },
    };
    const r = await aplicarPrioridadeAutomatica();
    expect(r.ajustados).toBe(2);
    expect(mundo.eventos.solto.priority).toBe("urgente");
    expect(mundo.eventos.travado.priority).toBe("baixa");
    expect(mundo.eventos.acabou.priority).toBeNull();
    // Sem trilha: a mudança do job é derivável da régua + data.
    expect(H.trilha).toEqual([]);
  });

  describe("o relógio do job", () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

    it("roda no boot e de hora em hora, e a falha não derruba o processo", async () => {
      const lidos = H.storage.getAllEvents;
      startPrioridadeAutomatica();
      await vi.advanceTimersByTimeAsync(0);
      expect(lidos).toHaveBeenCalledTimes(1);           // boot
      await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
      expect(lidos).toHaveBeenCalledTimes(2);           // uma hora depois

      const erro = vi.spyOn(console, "error").mockImplementation(() => {});
      H.storage.getAllEvents = vi.fn(async () => { throw new Error('column "priority_manual" does not exist'); });
      await vi.advanceTimersByTimeAsync(60 * 60 * 1000); // não lança: vai para o log
      expect(erro).toHaveBeenCalled();
      vi.clearAllTimers();
    });

    it("o boot liga o job (a única chamada fora do próprio serviço)", () => {
      // Ligação de processo: rodar registerRoutes inteiro subiria o app todo.
      const chamadas = ["server/routes.ts", "server/index.ts"].filter((f) =>
        /\bstartPrioridadeAutomatica\(\);/.test(readFileSync(path.resolve(__dirname, "../..", f), "utf8")));
      expect(chamadas).toEqual(["server/routes.ts"]);
    });
  });

  it("definir à mão TRAVA; limpar destrava e aplica a automática NA HORA — e a trilha diz qual", async () => {
    const saida = Date.now() + 5 * DIA;
    mundo.eventos["ev-1"] = { ...mundo.eventos["ev-1"], truckDepartureDate: new Date(saida), startDate: new Date(saida + 10 * DIA), priority: null, priorityManual: false };
    const definir = await chamar("PATCH /api/events/:id/priority", { sessao: sessao("solicitacao"), params: { id: "ev-1" }, body: { priority: "baixa" } });
    expect(definir.status).toBe(200);
    expect(mundo.eventos["ev-1"]).toMatchObject({ priority: "baixa", priorityManual: true });
    expect(H.trilha.at(-1)).toBe('Prioridade do evento "COPA NORTE" definida como "baixa" à mão — travada; a regra automática não mexe até limpar');

    const limpar = await chamar("PATCH /api/events/:id/priority", { sessao: sessao("admin"), params: { id: "ev-1" }, body: { priority: "" } });
    expect(limpar.status).toBe(200);
    const automatica = prioridadePelaSaida(saida, Date.now());
    expect(mundo.eventos["ev-1"]).toMatchObject({ priority: automatica, priorityManual: false });
    expect(H.trilha.at(-1)).toBe(`Prioridade do evento "COPA NORTE" voltou à automática (regra da saída do caminhão: "${automatica}")`);
  });

  it("evento novo já nasce com prioridade (e escolher no formulário trava); mudar a saída reprioriza", async () => {
    const base = { name: "NOVO", startDate: "2099-05-10", truckDepartureDate: "2099-05-01T08:00" };
    await chamar("POST /api/events", { sessao: sessao("solicitacao"), body: base });
    const auto = H.storage.createEvent.mock.calls[0][0];
    expect(auto.priority).toBe(prioridadePelaSaida(new Date("2099-05-01T08:00:00-03:00").getTime(), Date.now()));
    expect(auto.priorityManual).toBe(false);

    await chamar("POST /api/events", { sessao: sessao("admin"), body: { ...base, priority: "alta" } });
    expect(H.storage.createEvent.mock.calls[1][0]).toMatchObject({ priority: "alta", priorityManual: true });

    const semData = await chamar("PATCH /api/events/:id", { sessao: sessao("admin"), params: { id: "ev-1" }, body: { name: "COPA NORTE 2" } });
    expect(semData.status).toBe(200);
    expect(aplicarPrioridadeAutomatica).not.toHaveBeenCalled();
    const comData = await chamar("PATCH /api/events/:id", { sessao: sessao("admin"), params: { id: "ev-1" }, body: { truckDepartureDate: "2099-01-02T08:00" } });
    expect(comData.status).toBe(200);
    expect(aplicarPrioridadeAutomatica).toHaveBeenCalledTimes(1);
  });
});
