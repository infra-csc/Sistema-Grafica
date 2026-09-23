// ─────────────────────────────────────────────────────────────────────────────
// BOOK DE APROVAÇÃO, RODANDO — publicar, reenviar o aviso, quem recebe e o
// comentário "o que mudou".
//
// De onde vieram (eram leituras do texto de server/routes/itens/book.ts):
//   · aviso-de-book-na-tela.test.ts §3 (quem recebe o aviso);
//   · comentario-do-book.test.ts (a recusa antes de qualquer escrita, só a
//     republicação exige, o reenvio repete o comentário do último book);
//   · versoes-aprovadas.test.ts ("publicar o book grava a história — depois
//     de limpar o atual") e o cache das Versões derrubado por book e reenvio.
// O resto de aviso-de-book-na-tela §2/§4 (só admin reenvia, book atual, 409
// sem book, aviso depois da auditoria, desfecho na trilha) já roda em
// book-email-route.test.ts.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";

const H = vi.hoisted(() => ({
  storage: {} as Record<string, any>,
  trilha: [] as { tipo: string; id: string; detalhe: string }[],
  passos: [] as string[],
  notify: vi.fn(),
  invalidar: vi.fn(),
}));

vi.mock("../db", () => ({ db: {}, pool: {} }));
vi.mock("../storage", async () => {
  const real = await vi.importActual<any>("../storage");
  return { ...real, storage: H.storage };
});
vi.mock("../routes/shared", async () => {
  const real = await vi.importActual<any>("../routes/shared");
  return {
    ...real,
    broadcast: () => {},
    createAuditLog: async (_req: unknown, _acao: string, tipo: string, id: string, detalhe: string) => {
      H.passos.push("trilha");
      H.trilha.push({ tipo, id, detalhe });
    },
  };
});
vi.mock("../services/bookEmailNotification", async () => {
  const real = await vi.importActual<any>("../services/bookEmailNotification");
  return { ...real, notifyBookSaved: (...a: unknown[]) => H.notify(...a) };
});
// A lista administrável do canal "book" tem teste próprio; aqui vale o padrão do código.
vi.mock("../services/destinatarios", () => ({ destinatariosDoCanal: async (_c: string, padrao: string[]) => padrao }));
vi.mock("../routes/versoes", () => ({ invalidarCacheDeVersoes: () => { H.passos.push("cache"); H.invalidar(); } }));

import { capturarRotas } from "./rotas-de-mentira";
import {
  registrarBook, avisarBookPorEmail, destinatariosDoEvento,
  PAPEIS_QUE_RECEBEM, DESTINATARIOS_NOMEADOS, USAR_EXECUTIVOS_DO_EVENTO,
} from "../routes/itens/book";

const { chamar } = capturarRotas((app) => registrarBook(app));

type Linha = Record<string, any>;
let usuarios: Linha[];
let sponsors: Linha[];
let vinculos: Linha[];
let books: Linha[];
let itensDoEvento: Linha[];
let evento: Linha;

beforeEach(() => {
  H.trilha = [];
  H.passos = [];
  H.notify.mockReset().mockImplementation(async () => { H.passos.push("email"); return { status: "sent", para: ["x@y.com"], copia: [], descartados: [] }; });
  H.invalidar.mockReset();
  evento = { id: "ev-1", name: "COPA NORTE", status: "created", startDate: "2099-01-10", truckDepartureDate: new Date("2099-01-01T00:00:00Z") };
  usuarios = [
    { id: "u-arte", email: "arte@nortemkt.com", role: "arte" },
    { id: "u-arte-sem", email: "", role: "arte" },                       // sem e-mail
    { id: "u-exec", email: "exec@nortemkt.com", role: "atendimento" },    // executivo do sp-1
    { id: "u-atend", email: "atend@nortemkt.com", role: "atendimento" },  // sem cliente no evento
    { id: "u-sol", email: "sol@nortemkt.com", role: "solicitacao" },
    { id: "u-kakau", email: "kakau@nortemkt.com", role: "admin" },
    { id: "u-ana", email: "ana.motta@nortemkt.com", role: "admin" },
    { id: "u-pedro", email: "pedro@nortemkt.com", role: "admin" },
    { id: "u-yan", email: "yan.araujo@nortemkt.com", role: "admin" },
    { id: "u-agatha", email: "agatha.nadolsky@nortemkt.com", role: "atendimento" },
  ];
  sponsors = [
    { id: "sp-1", accountExecutiveId: "u-exec" },
    { id: "sp-2", accountExecutiveId: null },        // sem executivo: ninguém entra por ele
    { id: "sp-3", accountExecutiveId: "u-atend" },   // executivo de OUTRO evento
  ];
  vinculos = [{ sponsorId: "sp-1" }, { sponsorId: "sp-2" }];
  books = [];
  itensDoEvento = [{ id: "i1", bookUrl: null }, { id: "i2", bookUrl: null }];
  const s = H.storage;
  for (const k of Object.keys(s)) delete s[k];
  Object.assign(s, {
    getEvent: vi.fn(async () => evento),
    getEventSponsors: vi.fn(async () => vinculos),
    getAllSponsors: vi.fn(async () => sponsors),
    getAllUsers: vi.fn(async () => usuarios),
    getSponsor: vi.fn(),
    getUser: vi.fn(),
    getItemsByEvent: vi.fn(async () => itensDoEvento),
    getAllEventBooks: vi.fn(async () => books),
    clearEventBookUrl: vi.fn(async () => { H.passos.push("limpa"); return 2; }),
    setItemsBookUrl: vi.fn(async (ids: string[]) => { H.passos.push("vincula"); return ids.length; }),
    createEventBook: vi.fn(async (b: Linha) => { H.passos.push("historia"); return b; }),
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const sessao = (userRole: string) => ({ userId: "u1", userRole, userName: "Ana Arte" });
const publicar = (body: Linha, userRole = "arte") =>
  chamar("POST /api/events/:eventId/book", { sessao: sessao(userRole), params: { eventId: "ev-1" }, body });
const avisar = () => avisarBookPorEmail({ userName: "Ana Arte" } as any, "ev-1", "/objects/book.pdf", 2);
const argsDoAviso = () => H.notify.mock.calls[0][0] as { destinatariosPrincipais: string[]; destinatariosDeCopia: string[]; comentario: string | null };

// ═════════════════════════════════════════════════════════════════════════════
describe("quem recebe o aviso do book", () => {
  it("as escolhas estão ligadas: Arte por papel, roteamento por executivo, três nomeados", () => {
    expect(PAPEIS_QUE_RECEBEM).toEqual(["arte"]);
    expect(USAR_EXECUTIVOS_DO_EVENTO).toBe(true);
    expect([...DESTINATARIOS_NOMEADOS].sort()).toEqual(["agatha.nadolsky@nortemkt.com", "pedro@nortemkt.com", "yan.araujo@nortemkt.com"]);
  });

  it("no Para: a Arte e o executivo com cliente NESTE evento; em cópia oculta: os nomeados", async () => {
    await avisar();
    const a = argsDoAviso();
    expect(a.destinatariosPrincipais.sort()).toEqual(["arte@nortemkt.com", "exec@nortemkt.com"]);
    expect(a.destinatariosDeCopia.sort()).toEqual(["agatha.nadolsky@nortemkt.com", "pedro@nortemkt.com", "yan.araujo@nortemkt.com"]);
    // Atendimento sem cliente aqui, Solicitação, e Kakau/Ana (gestão) não entram
    const todos = [...a.destinatariosPrincipais, ...a.destinatariosDeCopia];
    for (const fora of ["atend@nortemkt.com", "sol@nortemkt.com", "kakau@nortemkt.com", "ana.motta@nortemkt.com"]) {
      expect(todos).not.toContain(fora);
    }
  });

  it("Kakau entra quando é a executiva de um patrocinador DAQUELE evento — pelo vínculo", async () => {
    sponsors.push({ id: "sp-4", accountExecutiveId: "u-kakau" });
    vinculos.push({ sponsorId: "sp-4" });
    await avisar();
    expect(argsDoAviso().destinatariosPrincipais).toContain("kakau@nortemkt.com");
  });

  it("e-mail em branco no cadastro não vira destinatário vazio", async () => {
    await avisar();
    const a = argsDoAviso();
    expect([...a.destinatariosPrincipais, ...a.destinatariosDeCopia]).not.toContain("");
  });

  it("rede de segurança: time vazio faz quem acompanha subir para o Para", async () => {
    usuarios = usuarios.filter((u) => u.role !== "arte");
    vinculos = [{ sponsorId: "sp-2" }]; // só patrocinador sem executivo
    await avisar();
    const a = argsDoAviso();
    expect(a.destinatariosPrincipais.sort()).toEqual(["agatha.nadolsky@nortemkt.com", "pedro@nortemkt.com", "yan.araujo@nortemkt.com"]);
    expect(a.destinatariosDeCopia).toEqual([]);
  });

  it("resolve os executivos em três consultas, sem N+1 por patrocinador", async () => {
    vinculos = Array.from({ length: 24 }, (_, i) => ({ sponsorId: i === 0 ? "sp-1" : `sp-x${i}` }));
    expect(await destinatariosDoEvento("ev-1")).toEqual(["exec@nortemkt.com"]);
    expect(H.storage.getEventSponsors).toHaveBeenCalledTimes(1);
    expect(H.storage.getAllSponsors).toHaveBeenCalledTimes(1);
    expect(H.storage.getAllUsers).toHaveBeenCalledTimes(1);
    expect(H.storage.getSponsor).not.toHaveBeenCalled();
    expect(H.storage.getUser).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("publicar o book", () => {
  it("limpa o atual, vincula, grava a HISTÓRIA e derruba o cache das Versões — nessa ordem", async () => {
    const r = await publicar({ bookUrl: "/objects/book.pdf", itemIds: ["i1", "i2"], comentario: "  primeira  " });
    expect(r.status).toBe(200);
    expect(H.passos.slice(0, 4)).toEqual(["limpa", "vincula", "historia", "cache"]);
    expect(H.storage.createEventBook).toHaveBeenCalledWith({ eventId: "ev-1", bookUrl: "/objects/book.pdf", itemCount: 2, createdBy: "Ana Arte", comment: "primeira" });
  });

  it("remover o book não grava história nem manda aviso", async () => {
    const r = await publicar({ bookUrl: null, itemIds: ["i1"] });
    expect(r.status).toBe(200);
    expect(H.storage.createEventBook).not.toHaveBeenCalled();
    expect(H.notify).not.toHaveBeenCalled();
  });

  describe("o comentário 'o que mudou'", () => {
    it("PRIMEIRA publicação: opcional (books de outro evento não contam)", async () => {
      books = [{ eventId: "ev-OUTRO", bookUrl: "/objects/x.pdf", createdAt: new Date() }];
      expect((await publicar({ bookUrl: "/objects/book.pdf", itemIds: ["i1"] })).status).toBe(200);
      expect(H.storage.createEventBook).toHaveBeenCalledWith(expect.objectContaining({ comment: null }));
    });

    it("REPUBLICAÇÃO: exige 5 caracteres — e recusa ANTES de qualquer escrita", async () => {
      books = [{ eventId: "ev-1", bookUrl: "/objects/velho.pdf", createdAt: new Date() }];
      const curto = await publicar({ bookUrl: "/objects/book.pdf", itemIds: ["i1"], comentario: " abcd  " });
      expect(curto.status).toBe(400);
      expect((curto.body as any).code).toBe("COMENTARIO_OBRIGATORIO");
      expect(H.storage.clearEventBookUrl).not.toHaveBeenCalled();
      expect(H.storage.setItemsBookUrl).not.toHaveBeenCalled();
      expect(H.storage.createEventBook).not.toHaveBeenCalled();

      const ok = await publicar({ bookUrl: "/objects/book.pdf", itemIds: ["i1"], comentario: "abcde" });
      expect(ok.status).toBe(200);
      // o comentário vai para o e-mail
      expect(argsDoAviso().comentario).toBe("abcde");
    });

    it("evento finalizado responde 409 antes de a rota pensar em comentário", async () => {
      evento = { ...evento, startDate: "2020-01-10", truckDepartureDate: new Date("2020-01-01T00:00:00Z") };
      books = [{ eventId: "ev-1", bookUrl: "/objects/velho.pdf", createdAt: new Date() }];
      const r = await publicar({ bookUrl: "/objects/book.pdf", itemIds: ["i1"] });
      expect(r.status).toBe(409);
      expect((r.body as any).code).toBe("EVENT_FINALIZED");
      expect(H.storage.getAllEventBooks).not.toHaveBeenCalled();
      expect(H.storage.clearEventBookUrl).not.toHaveBeenCalled();
    });

    it("remover o book não exige comentário, mesmo com publicação anterior", async () => {
      books = [{ eventId: "ev-1", bookUrl: "/objects/velho.pdf", createdAt: new Date() }];
      expect((await publicar({ bookUrl: null, itemIds: ["i1"] })).status).toBe(200);
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("reenviar o aviso", () => {
  it("repete o comentário da ÚLTIMA publicação e derruba o cache das Versões", async () => {
    itensDoEvento = [{ id: "i1", bookUrl: "/objects/atual.pdf" }];
    books = [
      { eventId: "ev-1", bookUrl: "/objects/v1.pdf", createdAt: new Date("2026-08-01"), comment: "primeira versão" },
      { eventId: "ev-1", bookUrl: "/objects/atual.pdf", createdAt: new Date("2026-08-20"), comment: "trocamos a Vale" },
      { eventId: "ev-OUTRO", bookUrl: "/objects/o.pdf", createdAt: new Date("2026-09-01"), comment: "de outro evento" },
    ];
    const r = await chamar("POST /api/events/:eventId/book/notify", { sessao: sessao("admin"), params: { eventId: "ev-1" } });
    expect(r.status).toBe(200);
    expect(argsDoAviso().comentario).toBe("trocamos a Vale");
    expect(H.invalidar).toHaveBeenCalled();
    expect(H.trilha.at(-1)?.detalhe).toMatch(/^Reenvio manual\. Aviso por e-mail enviado para /);
  });
});
