// ─────────────────────────────────────────────────────────────────────────────
// DESFAZER A CLONAGEM (19/10) — as rotas reais (registrarClonagem registra a
// clonagem e o desfazer) sobre o storage de mentira de regras-fluxo-apoio.ts.
//
// O caso: a Fernanda clonou 69 peças do Eco Run Londrina para o Eco Run
// Navegantes querendo só algumas. A regra (shared/desfazer-clonagem.ts):
//   · desfaz só as cópias daquela clonagem que seguem em RASCUNHO e intocadas;
//     as que andaram ficam, e a resposta diz quantas e por quê;
//   · janela de 2 horas; quem clonou ou admin;
//   · exclui como o DELETE (soft, trilha por peça, aviso às telas) e grava
//     "Clonagem desfeita: N peças de <origem> removidas (estavam em rascunho)";
//   · o lote mora na TRILHA (sem coluna nova) e só vale uma vez.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const H = vi.hoisted(() => ({
  storage: {} as Record<string, any>,
  db: {} as Record<string, any>,
  mundo: null as any,
  linhas: [] as Array<{ id: string; action: string; entityType: string; entityId: string; details: string; userId: string | null; userName: string }>,
  broadcast: [] as any[],
  eventosRecalculados: [] as string[],
  reservas: [] as Array<{ itemId: string }>,
}));

vi.mock("../db", () => ({ db: H.db, pool: {} }));
vi.mock("../storage", async () => {
  const real = await vi.importActual<any>("../storage");
  return { ...real, storage: H.storage };
});
const gravar = (req: any, action: string, entityType: string, entityId: string, details: string) => {
  const linha = { id: `log-${H.linhas.length + 1}`, action, entityType, entityId, details, userId: req?.userId ?? null, userName: req?.userName ?? "Sistema" };
  H.linhas.push(linha);
  return linha;
};
vi.mock("../routes/shared", async () => {
  const real = await vi.importActual<any>("../routes/shared");
  return {
    ...real,
    broadcast: (m: any) => { H.broadcast.push(m); },
    createAuditLog: async (req: any, a: string, t: string, id: string, d: string) => { gravar(req, a, t, id, d); },
    createAuditLogsEmLote: async (req: any, ls: any[]) => { for (const l of ls) gravar(req, l.action, l.entityType, l.entityId, l.details); },
    updateEventStatus: async (id: string) => { H.eventosRecalculados.push(id); },
  };
});
vi.mock("../routes/estoque-reservas", async () => {
  const real = await vi.importActual<any>("../routes/estoque-reservas");
  return { ...real, liberarReservasDasPecas: async () => {} };
});
vi.mock("../routes/pedidos-de-peca", async () => {
  const real = await vi.importActual<any>("../routes/pedidos-de-peca");
  return { ...real, aoExcluirPeca: async () => {} };
});
// A transação de verdade (volumes + deletedAt) mora em tubos.ts; aqui ela só
// marca a lixeira no mundo em memória.
vi.mock("../routes/tubos", async () => {
  const real = await vi.importActual<any>("../routes/tubos");
  return {
    ...real,
    excluirPecaTirandoDosVolumes: async (_req: any, id: string) => {
      const p = H.mundo.itens[id];
      if (!p || p.deletedAt) return null;
      p.deletedAt = new Date();
      return { tiradas: 0 };
    },
  };
});

import { registrarClonagem } from "../routes/itens/criacao";
import { capturarRotas } from "./rotas-de-mentira";
import { ligarStorage, mundoNovo, peca, sessao, type Mundo } from "./regras-fluxo-apoio";
import { fraseDasQueFicaram, motivoParaFicar, podeDesfazer, lerLote, JANELA_DO_DESFAZER_MS } from "@shared/desfazer-clonagem";

const { chamar } = capturarRotas((app) => { registrarClonagem(app); });

const AGORA = new Date("2026-10-19T22:08:00Z");
let mundo: Mundo;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(AGORA);
  mundo = mundoNovo();
  H.mundo = mundo;
  ligarStorage(H.storage, mundo);
  H.linhas.length = 0; H.broadcast.length = 0; H.eventosRecalculados.length = 0; H.reservas = [];
  H.db.select = () => ({ from: () => ({ where: async () => H.reservas }) });
  // As cópias nascem NO MUNDO (com o carimbo do INSERT), para o desfazer achá-las.
  H.storage.createBulkItems = vi.fn(async (lista: any[]) => lista.map((d, i) => {
    const nova = { ...peca(), ...d, id: `c${i + 1}`, displayId: `#09${String(i + 1).padStart(2, "0")}`, createdAt: new Date(), updatedAt: new Date(), deletedAt: null };
    mundo.itens[nova.id] = nova;
    return nova;
  }));
  H.storage.createAuditLog = vi.fn(async (l: any) => gravar({ userId: l.userId, userName: l.userName }, l.action, l.entityType, l.entityId, l.details));
  H.storage.getAuditLogs = vi.fn(async (tipo: string, id: string) =>
    H.linhas.filter((l) => l.entityType === tipo && l.entityId.includes(id)).slice().reverse());
  // A origem: COPA SUL (ev-2) com 4 peças; o destino: COPA NORTE (ev-1).
  for (const n of [1, 2, 3, 4]) mundo.itens[`o${n}`] = peca({ id: `o${n}`, displayId: `#000${n}`, eventId: "ev-2", status: "delivered" });
});
afterEach(() => { vi.useRealTimers(); });

const clonar = (papel = "solicitacao", body: Record<string, unknown> = { itemIds: ["o1", "o2", "o3", "o4"] }, extra: Record<string, unknown> = {}) =>
  chamar("POST /api/events/:id/clone-items", { sessao: sessao(papel, extra), params: { id: "ev-1" }, body: { sourceEventId: "ev-2", ...body } });
const desfazer = (loteId: unknown, papel = "solicitacao", extra: Record<string, unknown> = {}) =>
  chamar("POST /api/events/:id/clone-items/desfazer", { sessao: sessao(papel, extra), params: { id: "ev-1" }, body: { loteId } });
const desfazivel = (papel = "solicitacao", extra: Record<string, unknown> = {}) =>
  chamar("GET /api/events/:id/clone-items/desfazivel", { sessao: sessao(papel, extra), params: { id: "ev-1" } });

async function clonarELote(papel = "solicitacao") {
  const r = await clonar(papel);
  expect(r.status).toBe(201);
  return (r.body as any).lote as { id: string; total: number; origemNome: string; porVoce: boolean; expiraEm: string };
}

// ═════════════════════════════════════════════════════════════════════════════
describe("a clonagem guarda o lote na trilha", () => {
  it("com seleção: devolve o lote para o aviso e grava os ids das CÓPIAS em JSON", async () => {
    const lote = await clonarELote();
    expect(lote).toMatchObject({ total: 4, origemNome: "COPA SUL", porVoce: true, emRascunho: 4 });
    expect(new Date(lote.expiraEm).getTime() - AGORA.getTime()).toBe(JANELA_DO_DESFAZER_MS);
    const linha = H.linhas.find((l) => l.action === "clone_lote")!;
    expect(linha).toMatchObject({ id: lote.id, entityType: "clonagem", entityId: "ev-1", userId: "u1" });
    const guardado = lerLote(linha.details)!;
    expect(guardado).toMatchObject({ destinoId: "ev-1", origemId: "ev-2", origemNome: "COPA SUL", porId: "u1", ids: ["c1", "c2", "c3", "c4"] });
    expect(guardado.resumo).toContain('4 peças de "COPA SUL" para "COPA NORTE"');
    // A frase de sempre continua lá (é a que o Histórico lê).
    expect(H.linhas.some((l) => l.details === '4 itens clonados do evento "COPA SUL"')).toBe(true);
  });

  it("sem seleção (criar evento clonando outro inteiro) não oferece desfazer", async () => {
    const r = await clonar("solicitacao", {});
    expect(r.status).toBe(201);
    expect((r.body as any).lote).toBeNull();
    expect(H.linhas.some((l) => l.action === "clone_lote")).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("desfazer: só rascunho intocado sai — o que andou fica, com o motivo", () => {
  it("exclui as intocadas (soft, como o DELETE) e conta as que ficaram por quê", async () => {
    const lote = await clonarELote();
    mundo.itens.c2.status = "awaiting_linking";                              // enviada para a vinculação
    mundo.itens.c3.updatedAt = new Date(AGORA.getTime() + 10 * 60_000);     // editada depois
    H.reservas = [{ itemId: "c4" }];                                         // estoque reservado
    vi.setSystemTime(new Date(AGORA.getTime() + 15 * 60_000));

    const r = await desfazer(lote.id);
    expect(r.status).toBe(200);
    const corpo = r.body as any;
    expect(corpo.removidas).toBe(1);
    expect(corpo.jaExcluidas).toBe(0);
    expect(corpo.ficaram).toEqual([
      { id: "c2", displayId: "#0902", motivo: "já saiu do rascunho" },
      { id: "c3", displayId: "#0903", motivo: "foi editada depois da clonagem" },
      { id: "c4", displayId: "#0904", motivo: "tem peça do estoque reservada" },
    ]);
    expect(mundo.itens.c1.deletedAt).toBeInstanceOf(Date);
    for (const id of ["c2", "c3", "c4"]) expect(mundo.itens[id].deletedAt).toBeNull();
    // As peças da ORIGEM não são tocadas.
    for (const n of [1, 2, 3, 4]) expect(mundo.itens[`o${n}`].deletedAt).toBeNull();
  });

  it("a trilha: uma linha por peça (como o DELETE), a frase do evento e a marca de desfeito", async () => {
    const lote = await clonarELote();
    mundo.itens.c4.status = "awaiting_linking";
    await desfazer(lote.id);
    const porPeca = H.linhas.filter((l) => l.action === "deleted" && l.entityType === "item");
    expect(porPeca.map((l) => l.entityId)).toEqual(["c1", "c2", "c3"]);
    expect(porPeca[0].details).toBe('Item "Pórtico" (#0901) do evento "COPA NORTE" excluído ao desfazer a clonagem por solicitacao');
    const doEvento = H.linhas.find((l) => l.entityType === "event" && l.entityId === "ev-1")!;
    expect(doEvento.action).toBe("updated");
    expect(doEvento.details).toBe('Clonagem desfeita: 3 peças de "COPA SUL" removidas (estavam em rascunho) — 1 ficou porque já tinham andado');
    const marca = H.linhas.find((l) => l.action === "clone_desfeito")!;
    expect(JSON.parse(marca.details)).toMatchObject({ loteId: lote.id, removidas: 3, ficaram: 1 });
    // Avisos às telas e o status do evento recalculado.
    expect(H.broadcast.filter((b) => b.type === "item_deleted").map((b) => b.itemId)).toEqual(["c1", "c2", "c3"]);
    expect(H.eventosRecalculados).toContain("ev-1");
  });

  it("todas intocadas: a frase é a do pedido, sem ressalva", async () => {
    const lote = await clonarELote();
    const r = await desfazer(lote.id);
    expect((r.body as any).removidas).toBe(4);
    expect(H.linhas.find((l) => l.entityType === "event")!.details).toBe('Clonagem desfeita: 4 peças de "COPA SUL" removidas (estavam em rascunho)');
  });

  it("peça já excluída à mão conta como 'já não estava lá'; mãe com complemento fica", async () => {
    const lote = await clonarELote();
    mundo.itens.c1.deletedAt = new Date();
    mundo.itens.filho = peca({ id: "filho", eventId: "ev-1", parentItemId: "c2", status: "draft" });
    const r = await desfazer(lote.id);
    const corpo = r.body as any;
    expect(corpo.jaExcluidas).toBe(1);
    expect(corpo.removidas).toBe(2);
    expect(corpo.ficaram).toEqual([{ id: "c2", displayId: "#0902", motivo: "tem complemento ativo" }]);
  });

  it("só vale uma vez — a segunda tentativa é 409 e não exclui nada", async () => {
    const lote = await clonarELote();
    mundo.itens.c1.status = "awaiting_linking";
    expect((await desfazer(lote.id)).status).toBe(200);
    mundo.itens.c1.status = "draft"; // voltou ao rascunho depois: nem assim
    const de_novo = await desfazer(lote.id);
    expect(de_novo.status).toBe(409);
    expect((de_novo.body as any).error).toBe("Esta clonagem já foi desfeita.");
    expect(mundo.itens.c1.deletedAt).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("quem pode e até quando", () => {
  it("quem clonou pode; outra pessoa da Solicitação não (403); admin pode", async () => {
    const lote = await clonarELote();
    const outra = await desfazer(lote.id, "solicitacao", { userId: "u2", userName: "Joana" });
    expect(outra.status).toBe(403);
    expect((outra.body as any).error).toBe("Só quem clonou (Maria) ou um administrador pode desfazer esta clonagem.");
    expect(mundo.itens.c1.deletedAt).toBeNull();
    const admin = await desfazer(lote.id, "admin", { userId: "u9", userName: "Admin" });
    expect(admin.status).toBe(200);
    expect((admin.body as any).removidas).toBe(4);
  });

  it("passada a janela de 2 horas: 409 com o caminho de sempre, nada excluído", async () => {
    const lote = await clonarELote();
    vi.setSystemTime(new Date(AGORA.getTime() + JANELA_DO_DESFAZER_MS + 60_000));
    const r = await desfazer(lote.id);
    expect(r.status).toBe(409);
    expect((r.body as any).error).toContain("O desfazer vale por 2 horas");
    expect(mundo.itens.c1.deletedAt).toBeNull();
  });

  it("evento arquivado barra (como o DELETE); lote de outro evento ou inexistente é 404; sem loteId é 400", async () => {
    const lote = await clonarELote();
    expect((await desfazer(undefined)).status).toBe(400);
    expect((await desfazer("log-que-nao-existe")).status).toBe(404);
    const noOutro = await chamar("POST /api/events/:id/clone-items/desfazer", { sessao: sessao("admin"), params: { id: "ev-2" }, body: { loteId: lote.id } });
    expect(noOutro.status).toBe(404);
    mundo.eventos["ev-1"].arquivadoEm = new Date();
    const arquivado = await desfazer(lote.id);
    expect(arquivado.status).toBe(409);
    expect((arquivado.body as any).reason).toBe("arquivado");
    expect(mundo.itens.c1.deletedAt).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("a faixa: GET …/desfazivel", () => {
  it("mostra a clonagem a quem clonou e ao admin (porVoce diz de quem é); a outra pessoa não vê", async () => {
    const lote = await clonarELote();
    const minha = (await desfazivel()).body as any;
    expect(minha.lote).toMatchObject({ id: lote.id, total: 4, emRascunho: 4, porVoce: true, porNome: "Maria", origemNome: "COPA SUL" });
    expect(((await desfazivel("solicitacao", { userId: "u2" })).body as any).lote).toBeNull();
    expect(((await desfazivel("admin", { userId: "u9" })).body as any).lote).toMatchObject({ id: lote.id, porVoce: false });
  });

  it("conta só as que seguem em rascunho; some quando nenhuma segue, quando a janela fecha e depois de desfeita", async () => {
    const lote = await clonarELote();
    mundo.itens.c1.status = "awaiting_linking";
    expect(((await desfazivel()).body as any).lote.emRascunho).toBe(3);
    for (const id of ["c2", "c3", "c4"]) mundo.itens[id].status = "awaiting_linking";
    expect(((await desfazivel()).body as any).lote).toBeNull();

    for (const id of ["c1", "c2", "c3", "c4"]) mundo.itens[id].status = "draft";
    vi.setSystemTime(new Date(AGORA.getTime() + JANELA_DO_DESFAZER_MS + 1000));
    expect(((await desfazivel()).body as any).lote).toBeNull();

    vi.setSystemTime(AGORA);
    await desfazer(lote.id);
    expect(((await desfazivel()).body as any).lote).toBeNull();
  });

  it("duas clonagens: oferece a mais recente; desfeita ela, volta a anterior", async () => {
    const primeira = await clonarELote();
    vi.setSystemTime(new Date(AGORA.getTime() + 60_000));
    mundo.itens.o5 = peca({ id: "o5", displayId: "#0005", eventId: "ev-2" });
    H.storage.createBulkItems = vi.fn(async (lista: any[]) => lista.map((d, i) => {
      const nova = { ...peca(), ...d, id: `d${i + 1}`, displayId: `#08${i + 1}`, createdAt: new Date(), updatedAt: new Date(), deletedAt: null };
      mundo.itens[nova.id] = nova;
      return nova;
    }));
    const segunda = (await clonar("solicitacao", { itemIds: ["o5"] })).body as any;
    expect(((await desfazivel()).body as any).lote.id).toBe(segunda.lote.id);
    await desfazer(segunda.lote.id);
    expect(((await desfazivel()).body as any).lote.id).toBe(primeira.id);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("as regras puras (shared/desfazer-clonagem.ts)", () => {
  const lote = { destinoId: "ev-1", carimbo: "2026-10-19T22:08:00.000Z" };
  const rascunho = { eventId: "ev-1", status: "draft", updatedAt: "2026-10-19T22:08:00.900Z" };

  it("motivoParaFicar: a ordem do que a pessoa reconhece primeiro", () => {
    expect(motivoParaFicar(rascunho, lote, false)).toBeNull();
    expect(motivoParaFicar({ ...rascunho, eventId: "ev-9" }, lote, false)).toBe("foi transferida para outro evento");
    expect(motivoParaFicar({ ...rascunho, status: "awaiting_linking" }, lote, true)).toBe("já saiu do rascunho");
    expect(motivoParaFicar({ ...rascunho, pedidoDePecaLinhaId: "l1" }, lote, false)).toBe("está ligada a uma solicitação de peça");
    expect(motivoParaFicar(rascunho, lote, true)).toBe("tem peça do estoque reservada");
    expect(motivoParaFicar({ ...rascunho, updatedAt: "2026-10-19T22:09:00Z" }, lote, false)).toBe("foi editada depois da clonagem");
    // Sem carimbo gravado, não acusa edição.
    expect(motivoParaFicar({ ...rascunho, updatedAt: "2026-10-19T23:00:00Z" }, { ...lote, carimbo: null }, false)).toBeNull();
  });

  it("podeDesfazer: quem clonou ou admin", () => {
    expect(podeDesfazer({ papel: "solicitacao", userId: "u1" }, { porId: "u1" })).toBe(true);
    expect(podeDesfazer({ papel: "solicitacao", userId: "u2" }, { porId: "u1" })).toBe(false);
    expect(podeDesfazer({ papel: "admin", userId: "u2" }, { porId: "u1" })).toBe(true);
    expect(podeDesfazer({ papel: "solicitacao", userId: undefined }, { porId: null })).toBe(false);
  });

  it("fraseDasQueFicaram: agrupa e concorda o plural", () => {
    expect(fraseDasQueFicaram([])).toBe("");
    expect(fraseDasQueFicaram([{ motivo: "já saiu do rascunho" }])).toBe("1 peça ficou: 1 já saiu do rascunho.");
    expect(fraseDasQueFicaram([
      { motivo: "foi editada depois da clonagem" },
      { motivo: "já saiu do rascunho" },
      { motivo: "já saiu do rascunho" },
    ])).toBe("3 peças ficaram: 2 já saíram do rascunho, 1 foi editada depois da clonagem.");
  });
});
