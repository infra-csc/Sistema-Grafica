// ─────────────────────────────────────────────────────────────────────────────
// A MÁQUINA DE ESTADOS DA PEÇA, RODANDO — cancelar, descancelar, devolver e
// revogar aprovação.
//
// POR QUE ESTE ARQUIVO: as quatro ações já tinham teste, e todos eles LIAM O
// CÓDIGO-FONTE de routes/items.ts procurando trechos (`expect(ROTA).toContain
// (...)`). Isso prova que a linha está escrita; não prova que a peça termina
// no status certo, nem que a trilha diz o que aconteceu. Renomear uma variável
// quebra esses testes sem que nada tenha mudado; trocar a ORDEM de dois
// `updateItem` muda tudo sem que nenhum deles pisque.
//
// Aqui roda o handler real com o banco de mentira, e o que se afirma é o que o
// operador vê depois do clique: STATUS FINAL, campos zerados (ou preservados)
// e a linha da trilha.
//
// As decisões que este arquivo pina:
//   · cancelar grava DE ONDE a peça saiu, e cancelar de novo não sobrescreve;
//   · descancelar é só do admin, exige estar cancelada, e restaura em ordem de
//     confiança: coluna → trilha → "requested", DIZENDO qual das três valeu;
//   · a peça que estava EM IMPRESSÃO não volta ocupando a impressora;
//   · devolver vale de qualquer estado menos o rascunho, exige motivo de 10
//     caracteres, zera a aprovação e MARCA na trilha quando veio de depois da
//     Arte — sem apagar nada de produção;
//   · revogar aprovação reabre a peça de qualquer status pós-aprovação,
//     preservando o arquivo final, e reconhece o estado incoerente herdado.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";

const H = vi.hoisted(() => ({
  storage: {} as Record<string, any>,
  db: { transaction: (async () => {}) as any, execute: (async () => ({ rows: [] })) as any, insert: (() => ({ values: async () => [] })) as any },
  broadcast: (() => {}) as any,
  trilha: [] as { acao: string; itemId: string; detalhe: string }[],
  updateEventStatus: (async () => {}) as any,
  aoExcluirPeca: (async () => {}) as any,
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
    createAuditLogsEmLote: async (_req: any, linhas: any[]) => {
      for (const l of linhas) H.trilha.push({ acao: l.action, itemId: l.entityId, detalhe: l.details });
    },
    updateEventStatus: (...a: any[]) => H.updateEventStatus(...a),
  };
});
vi.mock("../routes/pedidos-de-peca", async () => {
  const real = await vi.importActual<any>("../routes/pedidos-de-peca");
  return { ...real, aoExcluirPeca: (...a: any[]) => H.aoExcluirPeca(...a) };
});
vi.mock("../services/inventoryLifecycle", () => ({ runInventoryCron: vi.fn() }));
vi.mock("../services/xlsxImport", () => ({ handlePreviewXlsx: vi.fn(), handleConfirmImport: vi.fn() }));
vi.mock("../services/xlsxExport", () => ({ handleExportItemsXlsx: vi.fn(), handleExportSelectedItemsXlsx: vi.fn(), responderRelatorioMaquinasXlsx: vi.fn() }));
vi.mock("../services/consultaDeEstoqueNaLiberacao", () => ({
  respostaDoEstoqueParaLiberar: vi.fn(async () => null),
  marcarRespostaAplicada: vi.fn(async () => {}),
}));

const { registerItemRoutes } = await import("../routes/items");
const { DEPOIS_DA_ARTE, POS_APROVACAO } = await import("@shared/fluxo-peca");

// ── App de mentira ───────────────────────────────────────────────────────────
type Handler = (req: any, res: any, next: any) => any;
const rotas = new Map<string, Handler[]>();
const app: any = {};
for (const verbo of ["get", "post", "patch", "put", "delete"]) {
  app[verbo] = (caminho: string, ...hs: Handler[]) => { rotas.set(`${verbo.toUpperCase()} ${caminho}`, hs); return app; };
}
registerItemRoutes(app);

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
  logs: Record<string, { details: string }[]>;
};

const peca = (over: any = {}) => ({
  id: "p1", displayId: "#0500", eventId: "ev-1", type: "Pórtico", description: "Pórtico de largada",
  quantity: 10, quantityProduced: null, reuseQty: 0, isReuse: false, conferredQty: 0, embaladaQty: 0,
  deliveredQty: 0, status: "awaiting_submission", skipApproval: false, deletedAt: null,
  parentItemId: null, kitRemessaId: null, pedidoDePecaLinhaId: null,
  observations: "Ilhós a cada 50 cm", motivoCancelamento: null, statusBeforeCancel: null,
  approvalThumbUrl: "/objects/uploads/thumb.png", finalFileUrl: "/objects/uploads/final.pdf",
  sponsorApprovedBy: "Atendimento", sponsorApprovedAt: new Date("2026-09-01T10:00:00Z"),
  creatorReviewedAt: null, rejectedBySponsor: false, rejectedByCreator: false, rejectionReason: null,
  hasModifiedData: false, printMachine: null, impressaoPorMaquina: null, reservaPorMaquina: null,
  fileWidth: "2.00", fileHeight: "1.00", area: "2", visual: "1", calculatedM2: "20.00",
  material: "Lona", finish: "Ilhós", measurement: "2.00 × 1.00",
  ...over,
});

const trilhaDe = (id: string) => H.trilha.filter((l) => l.itemId === id).map((l) => l.detalhe).join(" | ");

beforeEach(() => {
  mundo = {
    itens: { p1: peca() },
    eventos: {
      "ev-1": { id: "ev-1", name: "COPA NORTE", status: "created", startDate: "2099-01-10", truckDepartureDate: new Date("2099-01-01T00:00:00Z") },
      "ev-fim": { id: "ev-fim", name: "JÁ FOI", status: "created", startDate: "2020-01-10", truckDepartureDate: new Date("2020-01-01T00:00:00Z") },
    },
    aprovacoes: {},
    logs: {},
  };
  H.trilha = [];
  H.broadcast = vi.fn();
  H.updateEventStatus = vi.fn(async () => {});
  H.aoExcluirPeca = vi.fn(async () => {});
  H.db.execute = vi.fn(async () => ({ rows: [] }));
  const s = H.storage;
  for (const k of Object.keys(s)) delete s[k];
  s.getItem = vi.fn(async (id: string) => mundo.itens[id]);
  s.getEvent = vi.fn(async (id: string) => mundo.eventos[id]);
  s.updateItem = vi.fn(async (id: string, dados: any) => (mundo.itens[id] = { ...mundo.itens[id], ...dados }));
  s.updateEvent = vi.fn(async () => ({}));
  s.getLiveComplements = vi.fn(async (maeId: string) => Object.values(mundo.itens).filter((i: any) => i.parentItemId === maeId && !i.deletedAt));
  s.getItemsByEvent = vi.fn(async (eventId: string) => Object.values(mundo.itens).filter((i: any) => i.eventId === eventId && !i.deletedAt));
  s.getAuditLogs = vi.fn(async (_tipo: string, id: string) => mundo.logs[id] ?? []);
  s.createNotification = vi.fn(async (n: any) => ({ id: "n1", ...n }));
  s.getItemSponsors = vi.fn(async () => []);
  s.getEventSponsors = vi.fn(async () => []);
  s.getSponsor = vi.fn(async (id: string) => ({ id, name: id === "sp-vale" ? "Vale" : "Aché" }));
  s.getItemSponsorApprovals = vi.fn(async (itemId: string) => mundo.aprovacoes[itemId] ?? []);
  s.getItemSponsorApproval = vi.fn(async (itemId: string, sponsorId: string) =>
    (mundo.aprovacoes[itemId] ?? []).find((a) => a.sponsorId === sponsorId));
  s.updateItemSponsorApproval = vi.fn(async (id: string, dados: any) => {
    for (const lista of Object.values(mundo.aprovacoes)) {
      const linha = lista.find((a) => a.id === id);
      if (linha) return Object.assign(linha, dados);
    }
    return undefined;
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

// ═════════════════════════════════════════════════════════════════════════════
// 1 · CANCELAR
// ═════════════════════════════════════════════════════════════════════════════
describe("PATCH /api/items/:id/cancel", () => {
  const cancelar = (body: any = {}, userRole = "solicitacao") =>
    chamar("PATCH /api/items/:id/cancel", { params: { id: "p1" }, body, userRole });

  it("grava o status, o motivo na coluna própria e DE ONDE a peça saiu", async () => {
    mundo.itens.p1 = peca({ status: "ready_for_production" });
    const r = await cancelar({ notes: "Patrocinador saiu do evento" });
    expect(r.status).toBe(200);
    expect(mundo.itens.p1.status).toBe("canceled");
    expect(mundo.itens.p1.statusBeforeCancel).toBe("ready_for_production");
    expect(mundo.itens.p1.motivoCancelamento).toBe("Patrocinador saiu do evento");
    // As observações são instrução de produção — não são lixeira do motivo.
    expect(mundo.itens.p1.observations).toBe("Ilhós a cada 50 cm");
    expect(trilhaDe("p1")).toContain("Item cancelado Motivo: Patrocinador saiu do evento");
  });

  it("cancelar de novo NÃO sobrescreve de onde a peça saiu", async () => {
    mundo.itens.p1 = peca({ status: "approved" });
    await cancelar({ notes: "primeira vez" });
    await cancelar({ notes: "segunda vez" });
    expect(mundo.itens.p1.statusBeforeCancel).toBe("approved");
  });

  it("sem motivo, a coluna fica nula — e não a string vazia", async () => {
    await cancelar({ notes: "   " });
    expect(mundo.itens.p1.motivoCancelamento).toBeNull();
  });

  it("Gráfica e Atendimento não cancelam", async () => {
    for (const papel of ["grafica", "atendimento"]) {
      const r = await cancelar({}, papel);
      expect(r.status, papel).toBe(403);
    }
    expect(mundo.itens.p1.status).toBe("awaiting_submission");
  });

  it("evento já realizado barra: cancelar reescreveria número fechado", async () => {
    mundo.itens.p1 = peca({ eventId: "ev-fim" });
    const r = await cancelar({ notes: "faxina" });
    expect(r.status).toBe(409);
    expect(mundo.itens.p1.status).toBe("awaiting_submission");
  });

  it("peça que não existe: 404", async () => {
    const r = await chamar("PATCH /api/items/:id/cancel", { params: { id: "fantasma" }, userRole: "admin" });
    expect(r.status).toBe(404);
  });

  it("complemento sem material cai junto; o que já virou lona fica e a resposta avisa", async () => {
    mundo.itens["c-limpo"] = peca({ id: "c-limpo", displayId: "#0501", parentItemId: "p1" });
    mundo.itens["c-impresso"] = peca({ id: "c-impresso", displayId: "#0502", parentItemId: "p1", quantityProduced: 4 });
    const r = await cancelar({ notes: "Evento cancelado pelo cliente" });
    expect(mundo.itens["c-limpo"].status).toBe("canceled");
    expect(mundo.itens["c-impresso"].status).toBe("awaiting_submission");
    expect(r.body.complementosCancelados).toEqual(["#0501"]);
    expect(r.body.complementosMantidos).toEqual(["#0502"]);
    expect(r.body.aviso).toContain("#0502");
    expect(trilhaDe("c-limpo")).toContain("Complemento cancelado junto com a peça #0500");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2 · DESCANCELAR
// ═════════════════════════════════════════════════════════════════════════════
describe("PATCH /api/items/:id/uncancel", () => {
  const descancelar = (userRole = "admin") =>
    chamar("PATCH /api/items/:id/uncancel", { params: { id: "p1" }, userRole });

  it("volta para o status gravado no cancelamento e limpa o motivo", async () => {
    mundo.itens.p1 = peca({ status: "canceled", statusBeforeCancel: "awaiting_final_review", motivoCancelamento: "engano" });
    const r = await descancelar();
    expect(r.status).toBe(200);
    expect(mundo.itens.p1.status).toBe("awaiting_final_review");
    expect(mundo.itens.p1.statusBeforeCancel).toBeNull();
    expect(mundo.itens.p1.motivoCancelamento).toBeNull();
    expect(trilhaDe("p1")).toContain("(registrado no cancelamento)");
  });

  it("sem a coluna, a trilha de auditoria diz de onde veio — e o registro conta que foi palpite", async () => {
    mundo.itens.p1 = peca({ status: "canceled", statusBeforeCancel: null });
    mundo.logs.p1 = [{ details: "Status alterado: Aguardando Envio → Aguardando Aprovação" }];
    await descancelar();
    expect(mundo.itens.p1.status).toBe("awaiting_sponsor_approval");
    expect(trilhaDe("p1")).toContain("inferido pela trilha de auditoria");
  });

  it("sem pista nenhuma: volta ao início do fluxo, e a trilha ADMITE isso", async () => {
    mundo.itens.p1 = peca({ status: "canceled", statusBeforeCancel: null });
    await descancelar();
    expect(mundo.itens.p1.status).toBe("requested");
    expect(trilhaDe("p1")).toContain("sem registro do status anterior");
  });

  it("estava EM IMPRESSÃO: volta LIBERADA, não ocupando a impressora", async () => {
    // Outra peça pode ter entrado na máquina enquanto esta esteve cancelada.
    mundo.itens.p1 = peca({ status: "canceled", statusBeforeCancel: "inProduction", printMachine: "2", quantityProduced: 3 });
    await descancelar();
    expect(mundo.itens.p1.status).toBe("ready_for_production");
    expect(mundo.itens.p1.printMachine).toBeNull();
    expect(mundo.itens.p1.quantityProduced).toBe(3); // o que já foi impresso não some
    expect(trilhaDe("p1")).toContain("voltou para o topo da fila da impressora");
  });

  it("só admin; e só peça cancelada", async () => {
    mundo.itens.p1 = peca({ status: "canceled", statusBeforeCancel: "approved" });
    for (const papel of ["solicitacao", "arte", "grafica", "atendimento"]) {
      expect((await descancelar(papel)).status, papel).toBe(403);
    }
    expect(mundo.itens.p1.status).toBe("canceled");

    mundo.itens.p1 = peca({ status: "approved" });
    const r = await descancelar();
    expect(r.status).toBe(409);
    expect(r.body.error).toContain("não está cancelada");
  });

  it("evento já realizado barra o descancelar, como barra o cancelar", async () => {
    mundo.itens.p1 = peca({ status: "canceled", statusBeforeCancel: "approved", eventId: "ev-fim" });
    expect((await descancelar()).status).toBe(409);
    expect(mundo.itens.p1.status).toBe("canceled");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3 · DEVOLVER (a Arte manda de volta ao solicitante)
// ═════════════════════════════════════════════════════════════════════════════
describe("PATCH /api/items/:id/arte-reject", () => {
  const MOTIVO = "A logo veio em baixa resolução";
  const devolver = (body: any = { rejectionReason: MOTIVO }, userRole = "arte") =>
    chamar("PATCH /api/items/:id/arte-reject", { params: { id: "p1" }, body, userRole });

  it("volta para rascunho e ZERA a aprovação — arte nova não herda o sim de antes", async () => {
    const r = await devolver();
    expect(r.status).toBe(200);
    expect(mundo.itens.p1.status).toBe("draft");
    expect(mundo.itens.p1.rejectionReason).toBe(MOTIVO);
    expect(mundo.itens.p1.sponsorApprovedBy).toBeNull();
    expect(mundo.itens.p1.sponsorApprovedAt).toBeNull();
    expect(mundo.itens.p1.rejectedBySponsor).toBe(false);
    expect(mundo.itens.p1.rejectedByCreator).toBe(false);
  });

  it("vale de QUALQUER estado depois da Arte — e a trilha marca de onde veio", async () => {
    for (const status of DEPOIS_DA_ARTE) {
      H.trilha = [];
      mundo.itens.p1 = peca({ status });
      const r = await devolver();
      expect(r.status, status).toBe(200);
      expect(mundo.itens.p1.status, status).toBe("draft");
      expect(trilhaDe("p1"), status).toContain("JÁ FORA DA ARTE");
    }
  });

  it("de antes da Arte, a trilha NÃO carimba 'já fora da Arte'", async () => {
    mundo.itens.p1 = peca({ status: "awaiting_sponsor_approval" });
    await devolver();
    expect(trilhaDe("p1")).not.toContain("JÁ FORA DA ARTE");
    expect(trilhaDe("p1")).toContain(`Motivo: ${MOTIVO}`);
  });

  it("nada de produção é apagado: o que foi impresso e conferido continua lá", async () => {
    mundo.itens.p1 = peca({ status: "conferred", quantityProduced: 8, conferredQty: 8, deliveredQty: 2 });
    await devolver();
    expect(mundo.itens.p1).toMatchObject({ status: "draft", quantityProduced: 8, conferredQty: 8, deliveredQty: 2 });
  });

  it("rascunho é o único estado recusado — não há para onde devolver", async () => {
    mundo.itens.p1 = peca({ status: "draft" });
    const r = await devolver();
    expect(r.status).toBe(409);
    expect(r.body.error).toContain("já está na criação");
  });

  it("motivo curto demais: 400 com a régua dos 10 caracteres, e nada muda", async () => {
    for (const motivo of ["", "   ", "não", "ruim sim"]) {
      const r = await devolver({ rejectionReason: motivo });
      expect(r.status, motivo).toBe(400);
      expect(r.body.error).toContain("10 caracteres");
    }
    expect(mundo.itens.p1.status).toBe("awaiting_submission");
  });

  it("só Arte e admin devolvem", async () => {
    for (const papel of ["solicitacao", "grafica", "atendimento"]) {
      expect((await devolver({ rejectionReason: MOTIVO }, papel)).status, papel).toBe(403);
    }
  });

  it("evento já realizado barra: devolver é criar trabalho novo numa fila fechada", async () => {
    mundo.itens.p1 = peca({ eventId: "ev-fim" });
    expect((await devolver()).status).toBe(409);
    expect(mundo.itens.p1.status).toBe("awaiting_submission");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4 · DEVOLVER DA REVISÃO FINAL (para a Arte)
// ═════════════════════════════════════════════════════════════════════════════
describe("PATCH /api/items/:id/return-to-arte", () => {
  const MOTIVO = "O arquivo final veio sem sangria";
  const devolver = (body: any = { notes: MOTIVO }, userRole = "solicitacao") =>
    chamar("PATCH /api/items/:id/return-to-arte", { params: { id: "p1" }, body, userRole });

  beforeEach(() => { mundo.itens.p1 = peca({ status: "awaiting_final_review" }); });

  it("destino 'finalização' (padrão): limpa o arquivo final e MANTÉM o thumb aprovado", async () => {
    mundo.aprovacoes.p1 = [{ id: "a1", sponsorId: "sp-vale", status: "approved" }];
    const r = await devolver();
    expect(r.status).toBe(200);
    expect(mundo.itens.p1.status).toBe("sponsor_approved");
    expect(mundo.itens.p1.finalFileUrl).toBeNull();
    expect(mundo.itens.p1.approvalThumbUrl).toBe("/objects/uploads/thumb.png");
    expect(mundo.itens.p1.rejectedByCreator).toBe(true);
    expect(mundo.itens.p1.hasModifiedData).toBe(true);
    expect(r.body.destinoDevolvido).toBe("finalizacao");
  });

  it("com a rodada de aprovação ABERTA, a finalização não pousa em 'aprovada'", async () => {
    // Caso #4176: a peça pulava a fila do Atendimento e ficava "aprovada" com
    // patrocinador pendente por baixo, sem botão que a trouxesse de volta.
    mundo.aprovacoes.p1 = [{ id: "a1", sponsorId: "sp-vale", status: "pending" }];
    await devolver();
    expect(mundo.itens.p1.status).toBe("awaiting_sponsor_approval");
  });

  it("destino 'arte': refaz do zero — some o thumb e a aprovação junto", async () => {
    const r = await devolver({ notes: MOTIVO, destino: "arte" });
    expect(mundo.itens.p1.status).toBe("awaiting_submission");
    expect(mundo.itens.p1.approvalThumbUrl).toBeNull();
    expect(mundo.itens.p1.finalFileUrl).toBeNull();
    expect(mundo.itens.p1.sponsorApprovedBy).toBeNull();
    expect(r.body.destinoDevolvido).toBe("arte");
  });

  it("o motivo substitui a observação e entra na trilha com o destino", async () => {
    await devolver({ notes: MOTIVO, destino: "arte" });
    expect(mundo.itens.p1.observations).toBe(MOTIVO);
    expect(mundo.itens.p1.rejectionReason).toBe(MOTIVO);
    expect(trilhaDe("p1")).toContain("volta para o comeco da Arte");
    expect(trilhaDe("p1")).toContain(MOTIVO);
  });

  it("peça que já saiu da Revisão Final: 409 dizendo a etapa atual", async () => {
    mundo.itens.p1 = peca({ status: "ready_for_production" });
    const r = await devolver();
    expect(r.status).toBe(409);
    expect(r.body.error).toContain("não está mais na Revisão Final");
    expect(mundo.itens.p1.status).toBe("ready_for_production");
  });

  it("Gráfica e Atendimento não devolvem na Revisão Final", async () => {
    for (const papel of ["grafica", "atendimento"]) {
      expect((await devolver({ notes: MOTIVO }, papel)).status, papel).toBe(403);
    }
  });

  it("motivo curto: 400 antes de qualquer gravação", async () => {
    expect((await devolver({ notes: "refaz" })).status).toBe(400);
    expect(mundo.itens.p1.status).toBe("awaiting_final_review");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5 · REVOGAR APROVAÇÃO
// ═════════════════════════════════════════════════════════════════════════════
describe("POST /api/items/:id/sponsor-approvals/:sponsorId/revert", () => {
  const revogar = (userRole = "atendimento", body: any = {}) =>
    chamar("POST /api/items/:id/sponsor-approvals/:sponsorId/revert", {
      params: { id: "p1", sponsorId: "sp-vale" }, body, userRole,
    });

  const aprovada = () => [{ id: "a1", sponsorId: "sp-vale", status: "approved", approvedBy: "Ana", approvedAt: new Date() }];

  it("a linha volta a pendente e a peça reabre para o Atendimento", async () => {
    mundo.itens.p1 = peca({ status: "sponsor_approved" });
    mundo.aprovacoes.p1 = aprovada();
    const r = await revogar();
    expect(r.status).toBe(200);
    expect(mundo.aprovacoes.p1[0]).toMatchObject({ status: "pending", approvedBy: null, approvedAt: null });
    expect(mundo.itens.p1.status).toBe("awaiting_sponsor_approval");
    expect(mundo.itens.p1.sponsorApprovedBy).toBeNull();
    expect(trilhaDe("p1")).toContain('revogou a aprovação de "Vale"');
  });

  it("revogar reabre a DECISÃO, não apaga o trabalho: o arquivo final fica", async () => {
    mundo.itens.p1 = peca({ status: "awaiting_final_review" });
    mundo.aprovacoes.p1 = aprovada();
    await revogar();
    expect(mundo.itens.p1.finalFileUrl).toBe("/objects/uploads/final.pdf");
    expect(mundo.itens.p1.approvalThumbUrl).toBe("/objects/uploads/thumb.png");
  });

  it("vale de QUALQUER status pós-aprovação — inclusive dos apelidos legados da revisão", async () => {
    for (const status of POS_APROVACAO) {
      mundo.itens.p1 = peca({ status });
      mundo.aprovacoes.p1 = aprovada();
      const r = await revogar("admin");
      expect(r.status, status).toBe(200);
      expect(mundo.itens.p1.status, status).toBe("awaiting_sponsor_approval");
    }
  });

  it("da produção em diante, o admin ainda revoga a LINHA mas a peça não sai do chão de fábrica", async () => {
    // O corte é deliberado (dono, 25/08): puxar peça da mesa da Gráfica por
    // decisão comercial, não.
    mundo.itens.p1 = peca({ status: "inProduction" });
    mundo.aprovacoes.p1 = aprovada();
    const r = await revogar("admin");
    expect(r.status).toBe(200);
    expect(mundo.aprovacoes.p1[0].status).toBe("pending");
    expect(mundo.itens.p1.status).toBe("inProduction");
  });

  it("o Atendimento só revoga na janela de aprovação/finalização", async () => {
    mundo.itens.p1 = peca({ status: "inProduction" });
    mundo.aprovacoes.p1 = aprovada();
    const r = await revogar("atendimento");
    expect(r.status).toBe(409);
    expect(r.body.error).toContain("Só dá para revogar");
    expect(mundo.aprovacoes.p1[0].status).toBe("approved");
  });

  it("linha JÁ pendente com a peça avançada: reabre (o estado herdado do atalho)", async () => {
    mundo.itens.p1 = peca({ status: "awaiting_finalization" });
    mundo.aprovacoes.p1 = [{ id: "a1", sponsorId: "sp-vale", status: "pending" }];
    const r = await revogar("admin");
    expect(r.status).toBe(200);
    expect(mundo.itens.p1.status).toBe("awaiting_sponsor_approval");
    expect(trilhaDe("p1")).toContain("reabriu a aprovação");
  });

  it("linha pendente com a peça AINDA em aprovação: 409 — não há o que fazer", async () => {
    mundo.itens.p1 = peca({ status: "awaiting_sponsor_approval" });
    mundo.aprovacoes.p1 = [{ id: "a1", sponsorId: "sp-vale", status: "pending" }];
    const r = await revogar("admin");
    expect(r.status).toBe(409);
    expect(r.body.error).toBe("Esta aprovação já está pendente");
  });

  it("Arte, Gráfica e Solicitação não revogam; patrocinador sem linha dá 404", async () => {
    mundo.itens.p1 = peca({ status: "sponsor_approved" });
    mundo.aprovacoes.p1 = aprovada();
    for (const papel of ["arte", "grafica", "solicitacao"]) {
      expect((await revogar(papel)).status, papel).toBe(403);
    }
    expect((await chamar("POST /api/items/:id/sponsor-approvals/:sponsorId/revert", {
      params: { id: "p1", sponsorId: "sp-nenhum" }, userRole: "admin",
    })).status).toBe(404);
  });

  it("evento já realizado barra — reabrir ali é trabalho fantasma", async () => {
    mundo.itens.p1 = peca({ status: "sponsor_approved", eventId: "ev-fim" });
    mundo.aprovacoes.p1 = aprovada();
    expect((await revogar("admin")).status).toBe(409);
    expect(mundo.aprovacoes.p1[0].status).toBe("approved");
  });
});
