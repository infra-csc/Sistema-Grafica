// ─────────────────────────────────────────────────────────────────────────────
// GET /api/eventos-sugeridos — quem vê (os mesmos que criam evento), o corte
// por data (≥ hoje no fuso do negócio), o casamento com os eventos do app
// (inclusive arquivados) e com o cadastro de patrocinadores, e a foto ausente.
// Storage e foto de mentira; a regra é a de verdade (@shared/eventos-sugeridos).
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { FotoDoUmmense, RespostaEventosSugeridos } from "@shared/eventos-sugeridos";

const H = vi.hoisted(() => ({ storage: {} as Record<string, any>, foto: null as any }));
vi.mock("../db", () => ({ db: {}, pool: {} }));
vi.mock("../storage", () => ({ storage: H.storage }));
vi.mock("../services/foto-do-ummense", () => ({ lerFotoDoUmmense: () => H.foto }));

const { registerEventosSugeridosRoutes } = await import("../routes/eventos-sugeridos");
const { podeVerEventosSugeridos, podeGerirEvento, REGUA_DE_PAPEIS } = await import("@shared/permissoes");

type Handler = (req: any, res: any, next: any) => any;
const rotas = new Map<string, Handler[]>();
const appFalso: any = {};
for (const verbo of ["get", "post", "patch", "put", "delete"]) {
  appFalso[verbo] = (caminho: string, ...hs: Handler[]) => { rotas.set(`${verbo.toUpperCase()} ${caminho}`, hs); return appFalso; };
}
registerEventosSugeridosRoutes(appFalso);

async function chamar(quem: { userRole?: string; userCultura?: boolean } | null) {
  const req: any = { params: {}, body: {}, query: {}, headers: {}, session: quem ? { userId: "u1" } : {}, userId: quem ? "u1" : undefined, ...quem };
  const res: any = { _status: 200, _body: undefined, _done: false };
  res.status = (c: number) => { res._status = c; return res; };
  res.json = (b: any) => { res._body = b; res._done = true; return res; };
  res.set = () => res; res.setHeader = () => res; res.send = res.json;
  for (const h of rotas.get("GET /api/eventos-sugeridos")!) {
    let seguiu = false;
    await h(req, res, () => { seguiu = true; });
    if (res._done || !seguiu) break;
  }
  return { status: res._status as number, body: res._body as RespostaEventosSugeridos };
}

const FOTO: FotoDoUmmense = {
  fotoDe: "2026-10-15",
  origem: "Ummense — Calendário 2026 + Atribuir Entregas",
  eventos: [
    { id: "nr-belem", nome: "Night Run - Etapa 1 - Belém", data: "2026-10-17", estacao: null, cidade: "Belém", dataNaoConfirmada: false, tags: [], patrocinadores: [{ nome: "Santander", cota: "MASTER" }] },
    { id: "passado", nome: "Netshoes - Recife", data: "2026-10-18", estacao: null, cidade: "Recife", dataNaoConfirmada: false, tags: [], patrocinadores: [] },
    { id: "nr-maceio", nome: "Night Run - Etapa 1 - Maceió", data: "2026-11-21", estacao: null, cidade: "Maceió", dataNaoConfirmada: false, tags: [],
      patrocinadores: [{ nome: "Santander", cota: "MASTER" }, { nome: "Decatlhon", cota: "APOIO" }, { nome: "Zurich", cota: "SILVER" }, { nome: "O2 PRIME", cota: "O2 PRIME" }] },
    { id: "verao-belem", nome: "Circuito das Estações - Belém", data: "2026-12-13", estacao: "VERÃO", cidade: "Belém", dataNaoConfirmada: true, tags: ["DATA NÃO CONFIRMADA"], patrocinadores: [] },
    { id: "bb-belem", nome: "Circuito Banco do Brasil - Belém", data: "2026-11-29", estacao: null, cidade: "Belém", dataNaoConfirmada: false, tags: [], patrocinadores: [] },
  ],
};

beforeEach(() => {
  // "Hoje" do negócio = 20/10/2026 (meio-dia em SP).
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-20T15:00:00Z"));
  H.foto = FOTO;
  H.storage.getAllEvents = vi.fn(async () => [
    { id: "ev-belem", name: "Night Run Belém", startDate: new Date("2026-10-17T00:00:00Z") },
    { id: "ev-recife", name: "Netshoes Recife", startDate: new Date("2026-10-18T00:00:00Z") },
  ]);
  H.storage.getEventosArquivados = vi.fn(async () => [
    { id: "ev-bb-arq", name: "Banco do Brasil Belém", startDate: new Date("2026-11-29T00:00:00Z"), arquivadoEm: new Date(), arquivadoPor: "Ana", totalPecas: 0 },
  ]);
  H.storage.getAllSponsors = vi.fn(async () => [
    { id: "sp-sant", name: "Santander", arquivadoEm: null, createdAt: new Date("2025-01-01") },
    { id: "sp-dec", name: "Decathlon", arquivadoEm: null, createdAt: new Date("2025-01-01") },
    { id: "sp-zur", name: "Zurich", arquivadoEm: new Date("2026-09-01"), createdAt: new Date("2025-01-01") },
  ]);
});
afterEach(() => { vi.useRealTimers(); });

describe("GET /api/eventos-sugeridos: papéis", () => {
  it("admin, Solicitação e Atendimento – Cultura veem (os mesmos que criam evento)", async () => {
    expect((await chamar({ userRole: "admin" })).status).toBe(200);
    expect((await chamar({ userRole: "solicitacao" })).status).toBe(200);
    expect((await chamar({ userRole: "atendimento", userCultura: true })).status).toBe(200);
  });
  it("Arte, Gráfica e Atendimento comum: 403; sem sessão: 401", async () => {
    for (const papel of ["arte", "grafica", "atendimento"]) expect((await chamar({ userRole: papel })).status, papel).toBe(403);
    expect((await chamar(null)).status).toBe(401);
    expect(H.storage.getAllEvents).not.toHaveBeenCalled();
  });
  it("a régua: podeVerEventosSugeridos é podeGerirEvento (e GET fica fora da tabela de escrita)", () => {
    expect(podeVerEventosSugeridos).toBe(podeGerirEvento);
    expect(REGUA_DE_PAPEIS.some((r) => r.rota === "/api/eventos-sugeridos")).toBe(false);
  });
});

describe("GET /api/eventos-sugeridos: conteúdo", () => {
  it("fotoDe, corte por data (≥ hoje) e o que já existe sai", async () => {
    const { body } = await chamar({ userRole: "solicitacao" });
    expect(body.fotoDe).toBe("2026-10-15");
    expect(body.hoje).toBe("2026-10-20");
    // 17/10 e 18/10 ficaram para trás: nem contam.
    expect(body.futurosNaFoto).toBe(3);
    expect(body.sugestoes.map((s) => s.id)).toEqual(["nr-maceio", "bb-belem", "verao-belem"]);
  });
  it("evento parecido ARQUIVADO no app: continua sugerido, com o aviso", async () => {
    const { body } = await chamar({ userRole: "admin" });
    const bb = body.sugestoes.find((s) => s.id === "bb-belem")!;
    expect(bb.podeJaExistir).toMatchObject({ id: "ev-bb-arq", nome: "Banco do Brasil Belém", arquivado: true });
    expect(body.sugestoes.find((s) => s.id === "verao-belem")!.dataNaoConfirmada).toBe(true);
  });
  it("patrocinadores: casado, grafia, arquivado (não pré-selecionar) e sem cadastro", async () => {
    const { body } = await chamar({ userRole: "admin" });
    expect(body.sugestoes.find((s) => s.id === "nr-maceio")!.patrocinadores).toEqual([
      { nomeNoUmmense: "Santander", cota: "MASTER", cotaNoApp: "MASTER", sponsorId: "sp-sant", nomeNoApp: "Santander", arquivado: false },
      { nomeNoUmmense: "Decatlhon", cota: "APOIO", cotaNoApp: "APOIO", sponsorId: "sp-dec", nomeNoApp: "Decathlon", arquivado: false },
      { nomeNoUmmense: "Zurich", cota: "SILVER", cotaNoApp: "SILVER", sponsorId: "sp-zur", nomeNoApp: "Zurich", arquivado: true },
      { nomeNoUmmense: "O2 PRIME", cota: "O2 PRIME", cotaNoApp: null, sponsorId: null, nomeNoApp: null, arquivado: false },
    ]);
  });
  it("criado o evento no app, a sugestão some", async () => {
    H.storage.getAllEvents = vi.fn(async () => [{ id: "ev-novo", name: "Night Run - Etapa 1 - Maceió", startDate: new Date("2026-11-21T00:00:00Z") }]);
    const { body } = await chamar({ userRole: "admin" });
    expect(body.sugestoes.map((s) => s.id)).not.toContain("nr-maceio");
    expect(body.jaNoApp).toBe(1);
  });
  it("sem foto no servidor: 200 com lista vazia", async () => {
    H.foto = null;
    const { status, body } = await chamar({ userRole: "admin" });
    expect(status).toBe(200);
    expect(body).toMatchObject({ fotoDe: null, sugestoes: [] });
  });
});
