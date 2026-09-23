// ─────────────────────────────────────────────────────────────────────────────
// APROVAÇÃO POR PATROCINADOR, RODANDO — atalho, revogação, reprovação e o
// patrocinador "desaprovador".
//
// De onde vieram (eram leituras do texto de server/routes/itens/*.ts):
//   · aprovar-atalho-e-revogar.test.ts §1–2 (caso #4176);
//   · revogar-aprovacao.test.ts §1–3;
//   · aprovar-mesmo-com-a-arte.test.ts ("a rota");
//   · patrocinador-desaprovador.test.ts §1 (coluna) e §2–4 (servidor).
// Aqui roda o handler real com storage de mentira, e o que se afirma é o que
// fica gravado, o status/mensagem devolvidos e a linha da trilha.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";

const H = vi.hoisted(() => ({
  storage: {} as Record<string, any>,
  db: { transaction: (async () => {}) as any, execute: (async () => ({ rows: [] })) as any },
  broadcast: (() => {}) as any,
  trilha: [] as { acao: string; itemId: string; detalhe: string }[],
  invalidarVersoes: (() => {}) as any,
}));

vi.mock("../db", () => ({ db: H.db, pool: {} }));
vi.mock("../storage", async () => {
  const real = await vi.importActual<any>("../storage");
  return { ...real, storage: H.storage };
});
vi.mock("../routes/shared", async () => {
  const real = await vi.importActual<any>("../routes/shared");
  return {
    ...real,
    requireAuth: (_req: any, _res: any, next: any) => next(),
    requireRole: () => (_req: any, _res: any, next: any) => next(),
    broadcast: (...a: any[]) => H.broadcast(...a),
    createAuditLog: async (_req: any, acao: string, _tipo: string, itemId: string, detalhe: string) => {
      H.trilha.push({ acao, itemId, detalhe });
    },
    updateEventStatus: async () => {},
  };
});
vi.mock("../routes/versoes", async () => {
  const real = await vi.importActual<any>("../routes/versoes");
  return { ...real, invalidarCacheDeVersoes: (...a: any[]) => H.invalidarVersoes(...a) };
});
vi.mock("../services/inventoryLifecycle", () => ({ runInventoryCron: vi.fn() }));
vi.mock("../services/xlsxImport", () => ({ handlePreviewXlsx: vi.fn(), handleConfirmImport: vi.fn() }));
vi.mock("../services/xlsxExport", () => ({ handleExportItemsXlsx: vi.fn(), handleExportSelectedItemsXlsx: vi.fn(), responderRelatorioMaquinasXlsx: vi.fn() }));
vi.mock("../services/consultaDeEstoqueNaLiberacao", () => ({
  respostaDoEstoqueParaLiberar: vi.fn(async () => null),
  marcarRespostaAplicada: vi.fn(async () => {}),
}));

import { getTableConfig } from "drizzle-orm/pg-core";
import { sponsors } from "@shared/schema";
import { podeTransicionar } from "@shared/maquina-de-estados";
import { STATUS_CONHECIDOS, POS_APROVACAO } from "@shared/fluxo-peca";
import { registerItemRoutes, revogarAprovacoesEstritas, MOTIVO_REVOGACAO_PREFIXO } from "../routes/items";
import { EVENTO_REALIZADO_ERRO } from "../routes/eventoFinalizado";

// ── App de mentira ───────────────────────────────────────────────────────────
type Handler = (req: any, res: any, next: any) => any;
/** As rotas reais, capturadas por um app que só anota "VERBO caminho" → handlers. */
const rotas = (() => {
  const mapa = new Map<string, Handler[]>();
  const appFalso: any = {};
  for (const verbo of ["get", "post", "patch", "put", "delete"]) {
    appFalso[verbo] = (caminho: string, ...hs: Handler[]) => { mapa.set(`${verbo.toUpperCase()} ${caminho}`, hs); return appFalso; };
  }
  registerItemRoutes(appFalso);
  return mapa;
})();

async function chamar(chave: string, ctx: { params?: any; body?: any; userRole?: string } = {}) {
  const hs = rotas.get(chave);
  if (!hs) throw new Error(`Rota não registrada: ${chave}`);
  const req: any = {
    params: ctx.params ?? {}, body: ctx.body ?? {}, query: {}, headers: {},
    userRole: ctx.userRole ?? "admin", userId: "u1", userName: "Maria", session: {},
  };
  const res: any = { _status: 200, _body: undefined, _pronto: false };
  res.status = (c: number) => { res._status = c; return res; };
  res.json = (b: any) => { res._body = b; res._pronto = true; return res; };
  res.set = () => res; res.setHeader = () => res; res.send = res.json;
  for (const h of hs) {
    let seguiu = false;
    await h(req, res, () => { seguiu = true; });
    if (res._pronto || !seguiu) break;
  }
  return { status: res._status, body: res._body };
}

// ── O mundo ──────────────────────────────────────────────────────────────────
let mundo: {
  itens: Record<string, any>;
  eventos: Record<string, any>;
  aprovacoes: Record<string, any[]>;
  vinculos: Record<string, string[]>;
  patrocinadores: Record<string, any>;
};
let notificacoes: any[];

const peca = (over: any = {}) => ({
  id: "p1", displayId: "#4176", eventId: "ev-1", type: "Pórtico", status: "awaiting_sponsor_approval",
  skipApproval: false, deletedAt: null, approvalThumbUrl: "/objects/uploads/v1.png", finalFileUrl: "/objects/uploads/final.pdf",
  sponsorApprovedBy: null, sponsorApprovedAt: null, rejectedBySponsor: false, travadaEm: null,
  ...over,
});
const linha = (sponsorId: string, status: string, over: any = {}) => ({ id: `a-${sponsorId}`, itemId: "p1", sponsorId, status, ...over });
const trilhaDe = (id: string) => H.trilha.filter((l) => l.itemId === id).map((l) => l.detalhe).join(" | ");
const linhaDe = (sponsorId: string) => (mundo.aprovacoes.p1 ?? []).find((a) => a.sponsorId === sponsorId);

beforeEach(() => {
  mundo = {
    itens: { p1: peca() },
    eventos: {
      "ev-1": { id: "ev-1", name: "COPA NORTE", status: "created", startDate: "2099-01-10", truckDepartureDate: new Date("2099-01-01T00:00:00Z") },
      "ev-fim": { id: "ev-fim", name: "JÁ FOI", status: "created", startDate: "2020-01-10", truckDepartureDate: new Date("2020-01-01T00:00:00Z") },
    },
    aprovacoes: {},
    vinculos: {},
    patrocinadores: {
      "sp-vale": { id: "sp-vale", name: "Vale", strictApproval: false },
      "sp-ache": { id: "sp-ache", name: "Aché", strictApproval: false },
      "sp-min": { id: "sp-min", name: "Ministério", strictApproval: true },
    },
  };
  notificacoes = [];
  H.trilha = [];
  H.broadcast = vi.fn();
  H.invalidarVersoes = vi.fn();
  const s = H.storage;
  for (const k of Object.keys(s)) delete s[k];
  s.getItem = vi.fn(async (id: string) => mundo.itens[id]);
  s.getEvent = vi.fn(async (id: string) => mundo.eventos[id]);
  s.updateItem = vi.fn(async (id: string, dados: any) => (mundo.itens[id] = { ...mundo.itens[id], ...dados }));
  s.createNotification = vi.fn(async (n: any) => { notificacoes.push(n); return { id: `n${notificacoes.length}`, ...n }; });
  s.createItemArtVersion = vi.fn(async () => ({}));
  s.getSponsor = vi.fn(async (id: string) => mundo.patrocinadores[id]);
  s.getItemSponsors = vi.fn(async (itemId: string) => (mundo.vinculos[itemId] ?? []).map((sponsorId) => ({ id: `v-${sponsorId}`, itemId, sponsorId })));
  s.getItemSponsorApprovals = vi.fn(async (itemId: string) => mundo.aprovacoes[itemId] ?? []);
  s.getItemSponsorApproval = vi.fn(async (itemId: string, sponsorId: string) =>
    (mundo.aprovacoes[itemId] ?? []).find((a) => a.sponsorId === sponsorId));
  s.createItemSponsorApproval = vi.fn(async (d: any) => {
    const nova = { id: `a-${d.sponsorId}`, ...d };
    (mundo.aprovacoes[d.itemId] ??= []).push(nova);
    return nova;
  });
  s.updateItemSponsorApproval = vi.fn(async (id: string, dados: any) => {
    for (const lista of Object.values(mundo.aprovacoes)) {
      const l = lista.find((a) => a.id === id);
      if (l) return Object.assign(l, dados);
    }
    return undefined;
  });
  s.initializeItemSponsorApprovals = vi.fn(async () => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

// ═════════════════════════════════════════════════════════════════════════════
// 1 · o atalho aprova a peça INTEIRA — linhas incluídas (caso #4176)
// ═════════════════════════════════════════════════════════════════════════════
describe("PATCH /api/items/:id/sponsor-approve — o atalho aprova as LINHAS junto", () => {
  const aprovarTudo = (userRole = "atendimento") =>
    chamar("PATCH /api/items/:id/sponsor-approve", { params: { id: "p1" }, userRole });

  it("toda linha não-aprovada vira approved, com autor e hora, e o rastro de reprovação some", async () => {
    const antes = new Date("2026-08-01T10:00:00Z");
    mundo.aprovacoes.p1 = [
      linha("sp-vale", "pending"),
      linha("sp-ache", "awaiting_arte", { rejectedBy: "Ana", rejectedAt: antes, rejectionReason: "logo torto" }),
      linha("sp-min", "approved", { approvedBy: "Bia", approvedAt: antes }),
    ];
    const r = await aprovarTudo();
    expect(r.status).toBe(200);
    expect(mundo.itens.p1.status).toBe("sponsor_approved");
    for (const sp of ["sp-vale", "sp-ache"]) {
      expect(linhaDe(sp), sp).toMatchObject({ status: "approved", approvedBy: "Maria", rejectedBy: null, rejectedAt: null, rejectionReason: null });
      expect(linhaDe(sp).approvedAt).toBeInstanceOf(Date);
    }
    // quem já tinha aprovado não é reescrito (autor e hora originais ficam)
    expect(linhaDe("sp-min")).toMatchObject({ approvedBy: "Bia", approvedAt: antes });
    expect(H.storage.updateItemSponsorApproval).toHaveBeenCalledTimes(2);
  });

  it("o cache das Versões é invalidado — aprovação muda o que a tela mostra", async () => {
    mundo.aprovacoes.p1 = [linha("sp-vale", "pending")];
    await aprovarTudo();
    expect(H.invalidarVersoes).toHaveBeenCalled();
  });

  it("depois do atalho, revogar a linha REABRE a peça (não dá 'já está pendente')", async () => {
    mundo.aprovacoes.p1 = [linha("sp-vale", "pending")];
    await aprovarTudo();
    const r = await chamar("POST /api/items/:id/sponsor-approvals/:sponsorId/revert", { params: { id: "p1", sponsorId: "sp-vale" }, userRole: "admin" });
    expect(r.status).toBe(200);
    expect(mundo.itens.p1.status).toBe("awaiting_sponsor_approval");
    expect(linhaDe("sp-vale").status).toBe("pending");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2 · revogar: quem pode, quando, e o que a trilha e a Arte ficam sabendo
// ═════════════════════════════════════════════════════════════════════════════
describe("POST /api/items/:id/sponsor-approvals/:sponsorId/revert", () => {
  const revogar = (userRole = "atendimento", body: any = {}) =>
    chamar("POST /api/items/:id/sponsor-approvals/:sponsorId/revert", { params: { id: "p1", sponsorId: "sp-vale" }, body, userRole });

  it("papel: só Atendimento e admin, com a frase certa", async () => {
    mundo.itens.p1 = peca({ status: "sponsor_approved" });
    mundo.aprovacoes.p1 = [linha("sp-vale", "approved")];
    for (const papel of ["arte", "grafica", "solicitacao"]) {
      const r = await revogar(papel);
      expect(r.status, papel).toBe(403);
      expect(r.body.error).toBe("Apenas Atendimento e administradores podem revogar uma aprovação");
    }
    expect(linhaDe("sp-vale").status).toBe("approved");
  });

  it("a janela por papel mora na máquina de estados: Atendimento em aprovação/finalização; admin sem limite", () => {
    for (const s of STATUS_CONHECIDOS) {
      expect(podeTransicionar(s, "revogar-aprovacao", "atendimento"), s).toBe(["awaiting_sponsor_approval", "sponsor_approved"].includes(s));
      expect(podeTransicionar(s, "revogar-aprovacao", "admin"), s).toBe(true);
    }
  });

  it("fora da janela do Atendimento: 409 com o status traduzido, e a linha intocada", async () => {
    mundo.itens.p1 = peca({ status: "awaiting_final_review" });
    mundo.aprovacoes.p1 = [linha("sp-vale", "approved")];
    const r = await revogar("atendimento");
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/^Só dá para revogar enquanto a peça está em aprovação ou na finalização da Arte\. Status atual: /);
    expect(H.storage.updateItemSponsorApproval).not.toHaveBeenCalled();
  });

  it("a guarda do evento finalizado fala ANTES do limite de status", async () => {
    // Atendimento + status fora da janela + evento realizado: a resposta é a
    // do evento — a ordem das guardas decide qual frase o usuário lê.
    mundo.itens.p1 = peca({ status: "awaiting_final_review", eventId: "ev-fim" });
    mundo.aprovacoes.p1 = [linha("sp-vale", "approved")];
    const r = await revogar("atendimento");
    expect(r.status).toBe(409);
    expect(r.body.error).toBe(EVENTO_REALIZADO_ERRO);
    expect(H.storage.getItemSponsorApproval).not.toHaveBeenCalled();
  });

  it("motivo opcional: aparado e limitado a 500 caracteres na trilha", async () => {
    mundo.itens.p1 = peca({ status: "sponsor_approved" });
    mundo.aprovacoes.p1 = [linha("sp-vale", "approved")];
    const longo = "x".repeat(600);
    await revogar("atendimento", { motivo: `   ${longo}   ` });
    const t = trilhaDe("p1");
    expect(t).toContain(`. Motivo: ${"x".repeat(500)}.`);
    expect(t).not.toContain("x".repeat(501));
  });

  it("sem motivo, a trilha não ganha 'Motivo:'", async () => {
    mundo.itens.p1 = peca({ status: "sponsor_approved" });
    mundo.aprovacoes.p1 = [linha("sp-vale", "approved")];
    await revogar("atendimento", { motivo: "   " });
    expect(trilhaDe("p1")).not.toContain("Motivo:");
  });

  it("a trilha diz o papel e se era aprovação ou decisão", async () => {
    mundo.itens.p1 = peca({ status: "sponsor_approved" });
    mundo.aprovacoes.p1 = [linha("sp-vale", "approved")];
    await revogar("atendimento");
    expect(trilhaDe("p1")).toContain('Atendimento revogou a aprovação de "Vale" — volta a pendente (estava: approved)');

    H.trilha = [];
    mundo.itens.p1 = peca({ status: "awaiting_sponsor_approval" });
    mundo.aprovacoes.p1 = [linha("sp-vale", "awaiting_arte", { rejectedBy: "Ana", rejectionReason: "cor" })];
    await revogar("admin");
    expect(trilhaDe("p1")).toContain('Administrador revogou a decisão de "Vale" — volta a pendente (estava: awaiting_arte)');
    expect(linhaDe("sp-vale")).toMatchObject({ status: "pending", rejectedBy: null, rejectionReason: null });
  });

  it("peça aprovada por todos reabre e a Arte é AVISADA para segurar a finalização", async () => {
    mundo.itens.p1 = peca({ status: "sponsor_approved", sponsorApprovedBy: "Ana", sponsorApprovedAt: new Date() });
    mundo.aprovacoes.p1 = [linha("sp-vale", "approved")];
    const r = await revogar("atendimento");
    expect(r.status).toBe(200);
    expect(mundo.itens.p1).toMatchObject({ status: "awaiting_sponsor_approval", sponsorApprovedBy: null, sponsorApprovedAt: null, rejectedBySponsor: false });
    expect(notificacoes).toHaveLength(1);
    expect(notificacoes[0].targetRoles).toEqual(["arte"]);
    expect(notificacoes[0].message).toContain('Aprovação de "Vale" revogada — segure a finalização');
    expect(H.broadcast).toHaveBeenCalledWith({ type: "notification_created", notification: expect.objectContaining({ targetRoles: ["arte"] }) });
    expect(trilhaDe("p1")).toContain("Item reaberto:");
  });

  it("peça ainda em aprovação: a linha volta, mas ninguém da Arte é avisado (nada mudou para ela)", async () => {
    mundo.itens.p1 = peca({ status: "awaiting_sponsor_approval" });
    mundo.aprovacoes.p1 = [linha("sp-vale", "approved")];
    const r = await revogar("atendimento");
    expect(r.status).toBe(200);
    expect(linhaDe("sp-vale").status).toBe("pending");
    expect(notificacoes).toHaveLength(0);
    expect(trilhaDe("p1")).not.toContain("Item reaberto:");
  });

  it("estado incoerente (linha pendente + peça avançada): reabre sem reescrever a linha e explica na trilha", async () => {
    for (const status of POS_APROVACAO) {
      mundo.itens.p1 = peca({ status });
      mundo.aprovacoes.p1 = [linha("sp-vale", "pending", { approvedBy: null })];
      H.trilha = [];
      H.storage.updateItemSponsorApproval.mockClear();
      const r = await revogar("admin", { motivo: "voltou a arte" });
      expect(r.status, status).toBe(200);
      expect(mundo.itens.p1.status, status).toBe("awaiting_sponsor_approval");
      expect(H.storage.updateItemSponsorApproval, status).not.toHaveBeenCalled();
      const t = trilhaDe("p1");
      expect(t).toContain('Administrador reabriu a aprovação de "Vale"');
      expect(t).toContain("estado herdado do atalho de aprovação");
      expect(t).toContain(". Motivo: voltou a arte");
      expect(t).toContain("Item reaberto:");
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3 · quem reprovou fica TRAVADO até a nova arte (regra do dono, 31/08)
// ═════════════════════════════════════════════════════════════════════════════
describe("POST /api/items/:id/sponsor-approvals/:sponsorId/approve — sem 'aprovar por cima da correção'", () => {
  it("linha em awaiting_arte: 409 com a frase da regra, e nada é gravado — com ou sem bandeira no corpo", async () => {
    mundo.vinculos.p1 = ["sp-vale", "sp-ache"];
    mundo.aprovacoes.p1 = [linha("sp-vale", "awaiting_arte"), linha("sp-ache", "pending")];
    // o atalho descartado (aprovar a versão antiga) não pode ter voltado por
    // nenhum parâmetro: o corpo não muda a resposta.
    for (const body of [{}, { aprovarMesmoAssim: true }, { versaoAntiga: true }, { aprovouVersaoAntiga: true }]) {
      const r = await chamar("POST /api/items/:id/sponsor-approvals/:sponsorId/approve", {
        params: { id: "p1", sponsorId: "sp-vale" }, body, userRole: "atendimento",
      });
      expect(r.status).toBe(409);
      expect(r.body.error).toBe("Aguardando nova versão da Arte para este patrocinador. Não é possível aprovar agora.");
    }
    expect(linhaDe("sp-vale").status).toBe("awaiting_arte");
    expect(H.storage.updateItemSponsorApproval).not.toHaveBeenCalled();
  });

  it("os DEMAIS seguem aprovando normalmente", async () => {
    mundo.vinculos.p1 = ["sp-vale", "sp-ache"];
    mundo.aprovacoes.p1 = [linha("sp-vale", "awaiting_arte"), linha("sp-ache", "pending")];
    const r = await chamar("POST /api/items/:id/sponsor-approvals/:sponsorId/approve", {
      params: { id: "p1", sponsorId: "sp-ache" }, userRole: "atendimento",
    });
    expect(r.status).toBe(200);
    expect(r.body.allApproved).toBe(false);
    expect(linhaDe("sp-ache")).toMatchObject({ status: "approved", decidedThumbUrl: "/objects/uploads/v1.png" });
    expect(mundo.itens.p1.status).toBe("awaiting_sponsor_approval");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4 · o patrocinador DESAPROVADOR (strictApproval)
// ═════════════════════════════════════════════════════════════════════════════
describe("o desaprovador — a flag no cadastro", () => {
  it("coluna booleana, NOT NULL, padrão false — ninguém vira desaprovador por acidente", () => {
    const col = getTableConfig(sponsors).columns.find((c) => c.name === "strict_approval");
    expect(col).toBeDefined();
    expect(col!.dataType).toBe("boolean");
    expect(col!.notNull).toBe(true);
    expect(col!.default).toBe(false);
  });
});

describe("revogarAprovacoesEstritas — uma função, a regra inteira", () => {
  beforeEach(() => {
    mundo.vinculos.p1 = ["sp-vale", "sp-min", "sp-ache"];
  });

  it("só mexe em quem está 'approved' E tem a flag; devolve os nomes revogados", async () => {
    mundo.aprovacoes.p1 = [
      linha("sp-vale", "approved"),                // aprovado, sem flag → fica
      linha("sp-min", "approved", { approvedBy: "Bia", approvedAt: new Date(), decidedThumbUrl: "/objects/v1" }),
    ];
    mundo.patrocinadores["sp-ache"].strictApproval = true; // estrito sem linha aprovada → fica
    const nomes = await revogarAprovacoesEstritas({ userName: "Maria" } as any, { id: "p1" }, { tipo: "nova_versao" });
    expect(nomes).toEqual(["Ministério"]);
    expect(linhaDe("sp-vale").status).toBe("approved");
    expect(H.storage.updateItemSponsorApproval).toHaveBeenCalledTimes(1);
  });

  it("nova versão → new_version_pending; aprovação some; motivo com o prefixo fixo; o thumb decidido FICA", async () => {
    mundo.aprovacoes.p1 = [linha("sp-min", "approved", { approvedBy: "Bia", approvedAt: new Date(), decidedThumbUrl: "/objects/v1" })];
    await revogarAprovacoesEstritas({ userName: "Maria" } as any, { id: "p1" }, { tipo: "nova_versao" });
    const gravado = H.storage.updateItemSponsorApproval.mock.calls[0][1];
    expect(gravado).toMatchObject({ status: "new_version_pending", approvedBy: null, approvedAt: null, rejectedBy: "Maria" });
    expect(gravado.rejectionReason.startsWith(`${MOTIVO_REVOGACAO_PREFIXO}:`)).toBe(true);
    expect(gravado).not.toHaveProperty("decidedThumbUrl");
    expect(linhaDe("sp-min").decidedThumbUrl).toBe("/objects/v1");
    expect(MOTIVO_REVOGACAO_PREFIXO).toBe("Aprovação revogada automaticamente");
    expect(trilhaDe("p1")).toContain("Aprovação revogada de Ministério (patrocinador desaprovador): nova versão da arte");
    expect(H.invalidarVersoes).toHaveBeenCalled();
  });

  it("reprovação de OUTRO → awaiting_arte (nunca pending); quem reprovou não revoga a si mesmo", async () => {
    mundo.aprovacoes.p1 = [linha("sp-min", "approved")];
    const nomes = await revogarAprovacoesEstritas({ userName: "Maria" } as any, { id: "p1" }, { tipo: "reprovacao", sponsorId: "sp-min", nome: "Ministério" });
    expect(nomes).toEqual([]);
    expect(linhaDe("sp-min").status).toBe("approved");

    await revogarAprovacoesEstritas({ userName: "Maria" } as any, { id: "p1" }, { tipo: "reprovacao", sponsorId: "sp-vale", nome: "Vale" });
    expect(linhaDe("sp-min").status).toBe("awaiting_arte");
    expect(linhaDe("sp-min").rejectionReason).toContain('"Vale" reprovou a peça');
  });

  it("sem ninguém para revogar, não escreve trilha nem derruba cache", async () => {
    mundo.aprovacoes.p1 = [linha("sp-vale", "approved")];
    await revogarAprovacoesEstritas({ userName: "Maria" } as any, { id: "p1" }, { tipo: "nova_versao" });
    expect(H.trilha).toHaveLength(0);
    expect(H.invalidarVersoes).not.toHaveBeenCalled();
  });
});

describe("o desaprovador — os caminhos que chamam a regra", () => {
  beforeEach(() => {
    mundo.vinculos.p1 = ["sp-vale", "sp-min"];
  });

  it("reprovação: registra a PRÓPRIA reprovação primeiro, depois revoga o desaprovador com o nome de quem reprovou", async () => {
    mundo.aprovacoes.p1 = [linha("sp-vale", "pending"), linha("sp-min", "approved")];
    const r = await chamar("POST /api/items/:id/sponsor-approvals/:sponsorId/reject", {
      params: { id: "p1", sponsorId: "sp-vale" }, body: { rejectionReason: "O logo da Vale está cortado" }, userRole: "atendimento",
    });
    expect(r.status).toBe(200);
    const ordem = H.storage.updateItemSponsorApproval.mock.calls.map((c: any[]) => c[0]);
    expect(ordem).toEqual(["a-sp-vale", "a-sp-min"]);
    expect(linhaDe("sp-vale")).toMatchObject({ status: "awaiting_arte", rejectedBy: "Maria" });
    expect(linhaDe("sp-min").status).toBe("awaiting_arte");
    expect(linhaDe("sp-min").rejectionReason).toContain('"Vale" reprovou a peça');
    // a peça fica em aprovação: só a LINHA vai para a Arte (é a "correção")
    expect(mundo.itens.p1.status).toBe("awaiting_sponsor_approval");
  });

  it("reenvio da correção: o desaprovador aprovado volta como new_version_pending", async () => {
    mundo.aprovacoes.p1 = [linha("sp-vale", "awaiting_arte"), linha("sp-min", "approved")];
    const r = await chamar("POST /api/items/:id/sponsor-approvals/resubmit", {
      params: { id: "p1" }, body: { newThumbUrl: "/objects/uploads/v2.png" }, userRole: "arte",
    });
    expect(r.status).toBe(200);
    expect(linhaDe("sp-vale").status).toBe("new_version_pending");
    expect(linhaDe("sp-min").status).toBe("new_version_pending");
    expect(linhaDe("sp-min").rejectionReason).toContain("a Arte enviou uma nova versão");
  });

  it("reenvio do item inteiro (awaiting_submission): o desaprovador aprovado volta a pending; o comum aprovado fica", async () => {
    mundo.itens.p1 = peca({ status: "awaiting_submission" });
    mundo.vinculos.p1 = ["sp-vale", "sp-min", "sp-ache"];
    mundo.aprovacoes.p1 = [linha("sp-vale", "approved"), linha("sp-min", "approved"), linha("sp-ache", "rejected")];
    const r = await chamar("PATCH /api/items/:id/submit-for-approval", {
      params: { id: "p1" }, body: { approvalThumbUrl: "/objects/uploads/v3.png" }, userRole: "arte",
    });
    expect(r.status).toBe(200);
    expect(mundo.itens.p1.status).toBe("awaiting_sponsor_approval");
    expect(linhaDe("sp-vale").status).toBe("approved");
    expect(linhaDe("sp-min")).toMatchObject({ status: "pending", approvedBy: null, approvedAt: null });
    expect(linhaDe("sp-ache").status).toBe("pending");
  });

  it("troca do thumb na peça APROVADA: revoga o desaprovador e devolve a peça ao Atendimento", async () => {
    mundo.itens.p1 = peca({ status: "sponsor_approved" });
    mundo.aprovacoes.p1 = [linha("sp-vale", "approved"), linha("sp-min", "approved")];
    const r = await chamar("PATCH /api/items/:id/update-thumb", {
      params: { id: "p1" }, body: { approvalThumbUrl: "/objects/uploads/v2.png", motivo: "Ajuste de cor pedido pelo cliente" }, userRole: "arte",
    });
    expect(r.status).toBe(200);
    expect(linhaDe("sp-min").status).toBe("new_version_pending");
    expect(linhaDe("sp-vale").status).toBe("approved");
    expect(mundo.itens.p1).toMatchObject({ status: "awaiting_sponsor_approval", rejectedBySponsor: false });
    expect(notificacoes.map((n) => n.targetRoles)).toContainEqual(["atendimento"]);
  });

  it("troca do thumb depois da finalização: a regra NÃO roda — a peça só volta quando está aprovada", async () => {
    mundo.itens.p1 = peca({ status: "awaiting_final_review" });
    mundo.aprovacoes.p1 = [linha("sp-min", "approved")];
    const r = await chamar("PATCH /api/items/:id/update-thumb", {
      params: { id: "p1" }, body: { approvalThumbUrl: "/objects/uploads/v2.png", motivo: "Ajuste de cor pedido pelo cliente" }, userRole: "arte",
    });
    expect(r.status).toBe(200);
    expect(linhaDe("sp-min").status).toBe("approved");
    expect(mundo.itens.p1.status).toBe("awaiting_final_review");
  });

  it("troca do thumb sem desaprovador aprovado: a peça segue aprovada", async () => {
    mundo.itens.p1 = peca({ status: "sponsor_approved" });
    mundo.aprovacoes.p1 = [linha("sp-vale", "approved"), linha("sp-min", "pending")];
    await chamar("PATCH /api/items/:id/update-thumb", {
      params: { id: "p1" }, body: { approvalThumbUrl: "/objects/uploads/v2.png", motivo: "Ajuste de cor pedido pelo cliente" }, userRole: "arte",
    });
    expect(mundo.itens.p1.status).toBe("sponsor_approved");
  });
});
