// ─────────────────────────────────────────────────────────────────────────────
// RELATÓRIO DO EVENTO, RODANDO — GET /api/events/:id/relatorio com storage de
// mentira.
//
// Veio de relatorio-evento.test.ts ("a rota /api/events/:id/relatorio"), que
// lia o texto de server/routes/relatorio.ts; e da porta "Relatório do evento"
// de book-completo-so-atendimento.test.ts. O que se afirma é o corpo devolvido.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const H = vi.hoisted(() => ({ storage: {} as Record<string, any> }));
vi.mock("../db", () => ({ db: {}, pool: {} }));
vi.mock("../storage", async () => {
  const real = await vi.importActual<any>("../storage");
  return { ...real, storage: H.storage };
});

import { capturarRotas } from "./rotas-de-mentira";
import { registerRelatorioRoutes, RELATORIO_MAX_FOTOS } from "../routes/relatorio";
import { buildEventPrazo, todayBusinessMs } from "../services/prazo-domain";

const { chamar } = capturarRotas(registerRelatorioRoutes);

type Linha = Record<string, any>;
let evento: Linha;
let itens: Linha[];
let aprovacoes: Linha[];
let fotos: Linha[];
const sponsors = [{ id: "sp-vale", name: "Vale" }, { id: "sp-ache", name: "Aché" }];
const usuarios = [{ id: "u1", name: "Maria" }];

const peca = (id: string, over: Linha = {}): Linha => ({
  id, displayId: `#${id}`, eventId: "ev-1", type: "Pórtico", status: "awaiting_sponsor_approval",
  skipApproval: false, deletedAt: null, kitRemessaId: null, criadoPorId: null, createdAt: new Date("2026-09-01"), ...over,
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-10T15:00:00Z"));
  evento = { id: "ev-1", name: "COPA NORTE", status: "created", priority: null, arquivadoEm: null,
    startDate: "2026-10-20", truckDepartureDate: new Date("2026-10-15T00:00:00Z") };
  itens = [
    peca("a"), peca("b", { status: "awaiting_creation" }), peca("c", { status: "delivered" }),
    peca("x", { status: "cancelled" }),
    peca("m", { type: "Molde", status: "produced" }),       // molde produzido conta como entregue
    peca("bk", { type: "BOOK COMPLETO" }),                   // trâmite do Atendimento, não peça
  ];
  aprovacoes = [
    { itemId: "a", sponsorId: "sp-vale", status: "pending" },
    { itemId: "a", sponsorId: "sp-ache", status: "awaiting_arte" },
    { itemId: "b", sponsorId: "sp-vale", status: "new_version_pending" },
    { itemId: "OUTRO-EVENTO", sponsorId: "sp-vale", status: "pending" },
    { itemId: "bk", sponsorId: "sp-ache", status: "pending" },
  ];
  fotos = Array.from({ length: 11 }, (_, i) => ({
    id: `f${i}`, eventId: "ev-1", photoUrl: `/objects/f${i}.jpg`, kind: i < 4 ? "conferencia" : "entrega",
    displayId: `#p${i}`, createdAt: new Date(Date.UTC(2026, 8, 1, i)),
  }));
  fotos.push({ id: "fora", eventId: "ev-2", photoUrl: "/objects/o.jpg", kind: "entrega", createdAt: new Date() });
  const s = H.storage;
  for (const k of Object.keys(s)) delete s[k];
  Object.assign(s, {
    getEvent: vi.fn(async (id: string) => (id === evento.id ? evento : undefined)),
    getItemsByEvents: vi.fn(async () => itens),
    getAllSponsors: vi.fn(async () => sponsors),
    getOpenItemSponsorApprovals: vi.fn(async () => aprovacoes),
    getAllUsers: vi.fn(async () => usuarios),
    getAllDeliveryPhotos: vi.fn(async () => fotos),
  });
});
afterEach(() => { vi.useRealTimers(); });

const relatorio = async (sessao: Linha = { userId: "u1", userRole: "grafica", userName: "Maria" }) => {
  const r = await chamar("GET /api/events/:id/relatorio", { sessao, params: { id: "ev-1" } });
  return r as { status: number; body: any };
};

describe("GET /api/events/:id/relatorio", () => {
  it("leitura para qualquer logado; sem sessão, 401; arquivado responde 404", async () => {
    expect((await chamar("GET /api/events/:id/relatorio", { params: { id: "ev-1" } })).status).toBe(401);
    for (const papel of ["admin", "arte", "atendimento", "grafica", "solicitacao"]) {
      expect((await relatorio({ userId: "u1", userRole: papel })).status, papel).toBe(200);
    }
    evento.arquivadoEm = new Date();
    expect((await relatorio()).status).toBe(404);
  });

  it("o funil é o de buildEventPrazo — a MESMA conta da Gestão de Prazos, sem o BOOK COMPLETO", async () => {
    const { body } = await relatorio();
    const semBook = itens.filter((i) => i.type !== "BOOK COMPLETO");
    const abertas = new Map<string, Linha[]>();
    for (const ap of aprovacoes.filter((a) => semBook.some((i) => i.id === a.itemId))) {
      abertas.set(ap.itemId, [...(abertas.get(ap.itemId) ?? []), ap]);
    }
    const esperado = buildEventPrazo(evento as any, semBook as any, {
      today: todayBusinessMs(),
      sponsorNameById: new Map(sponsors.map((s) => [s.id, s.name])),
      openApprovalsByItem: abertas as any,
      userNameById: new Map(usuarios.map((u) => [u.id, u.name])),
    });
    expect(esperado).not.toBeNull();
    expect(body.prazo).toEqual(JSON.parse(JSON.stringify(esperado)));
  });

  it("evento que saiu da gestão de prazos devolve prazo null — e os totais continuam", async () => {
    itens = [peca("c", { status: "delivered" }), peca("x", { status: "cancelled" }), peca("m", { type: "Molde", status: "produced" })];
    const { body } = await relatorio();
    expect(body.prazo).toBeNull();
    // molde produzido conta como entregue; cancelada sai das vivas
    expect(body.totais).toEqual({ pecas: 2, entregues: 2, canceladas: 1 });
  });

  it("totais: BOOK COMPLETO fora, cancelada separada, molde produzido entregue", async () => {
    const { body } = await relatorio();
    expect(body.totais).toEqual({ pecas: 4, entregues: 2, canceladas: 1 });
  });

  it("as aprovações dizem com quem está a bola — só das peças DESTE evento", async () => {
    const { body } = await relatorio();
    expect(body.aprovacoes).toEqual([
      { nome: "Vale", comPatrocinador: 2, comArte: 0 },
      { nome: "Aché", comPatrocinador: 0, comArte: 1 },
    ]);
  });

  it(`fotos são resumo, não galeria: as ${RELATORIO_MAX_FOTOS} mais recentes do evento`, async () => {
    expect(RELATORIO_MAX_FOTOS).toBe(8);
    const { body } = await relatorio();
    expect(body.fotos).toMatchObject({ total: 11, conferencia: 4, entrega: 7 });
    expect(body.fotos.ultimas).toHaveLength(8);
    expect(body.fotos.ultimas[0]).toEqual({ url: "/objects/f10.jpg", kind: "entrega", displayId: "#p10" });
  });

  it("o rodapé de autoria viaja: gerado quando e por quem", async () => {
    expect((await relatorio()).body.gerado).toEqual({ em: "2026-09-10T15:00:00.000Z", por: "Maria" });
  });

  it("usuário do Kit só vê as peças do Kit que ele criou", async () => {
    itens = [peca("minha", { kitRemessaId: "k1", criadoPorId: "u1" }), peca("alheia", { kitRemessaId: "k1", criadoPorId: "u2" }), peca("normal")];
    const { body } = await relatorio({ userId: "u1", userRole: "solicitacao", userKit: true });
    expect(body.totais.pecas).toBe(1);
  });
});
