// ─────────────────────────────────────────────────────────────────────────────
// A PEÇA DEVOLVIDA NUNCA SOME DE TODAS AS FILAS.
//
// O defeito que este arquivo existe para impedir, contado uma vez:
//
// Havia duas portas de reprovação para o mesmo fato do mundo real — o
// patrocinador pediu mudança. A reprovação POR PATROCINADOR deixava a peça em
// `awaiting_sponsor_approval` com a linha daquele patrocinador em
// `awaiting_arte`, e esse par alimenta a aba Correção da Arte. A outra, que
// reprovava a peça INTEIRA, mandava para `awaiting_submission` — a fila
// "Aguardando envio", que na produção tinha 1.120 peças que nunca haviam sido
// enviadas. A peça de RETRABALHO afundava no meio do trabalho NOVO, e a Arte
// perdia a única distinção que decide o que fazer primeiro.
//
// A #1527 ficou semanas assim. A #3042 idem, com a trilha registrando
// "reprovado pelo patrocinador" enquanto a fila de correção mostrava 1 item.
//
// O mesmo vale para a devolução da REVISÃO: ela acontece depois de o
// patrocinador já ter aprovado, então a peça volta para `sponsor_approved`
// (a aba "Finalizar arte"), e não para o começo do fluxo.
//
// Até 23/09 tudo aqui lia o texto das rotas. Agora as rotas RODAM (banco de
// mentira) e só a invariante "quem escreve awaiting_submission" segue como
// varredura — é uma regra sobre TODO o código, não sobre uma rota.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";
import ts from "typescript";

const H = vi.hoisted(() => ({
  storage: {} as Record<string, unknown>,
  atualizacoes: [] as Array<{ id: string; campos: Record<string, unknown> }>,
}));

vi.mock("../db", () => ({ db: {}, pool: {} }));
vi.mock("../storage", async () => {
  const real = await vi.importActual<typeof import("../storage")>("../storage");
  return { ...real, storage: H.storage };
});
vi.mock("../routes/shared", async () => {
  const real = await vi.importActual<typeof import("../routes/shared")>("../routes/shared");
  return { ...real, broadcast: vi.fn(), createAuditLog: vi.fn(async () => {}), createAuditLogsEmLote: vi.fn(async () => {}), updateEventStatus: vi.fn(async () => {}) };
});
// O exceljs não carrega aqui (sem o jszip); a planilha não entra neste assunto.
vi.mock("../services/xlsxImport", () => ({ handlePreviewXlsx: vi.fn(), handleConfirmImport: vi.fn() }));
vi.mock("../services/xlsxExport", () => ({ handleExportItemsXlsx: vi.fn(), handleExportSelectedItemsXlsx: vi.fn(), responderRelatorioMaquinasXlsx: vi.fn() }));

import { registerItemRoutes } from "../routes/items";
import { lerDestinoDevolucao } from "../routes/itens/comum";
import { capturarRotas } from "./rotas-de-mentira";

const { rotas, chamar } = capturarRotas(registerItemRoutes);
const SOLICITACAO = { userId: "u-sol", userRole: "solicitacao", userName: "Sofia" };
const MOTIVO = "O arquivo final saiu com a cor errada";

type Peca = Record<string, unknown> & { id: string };
let pecas: Record<string, Peca>;
let aprovacoes: Record<string, Array<{ status: string }>>;

beforeEach(() => {
  H.atualizacoes = [];
  pecas = {};
  aprovacoes = {};
  Object.assign(H.storage, {
    getItem: async (id: string) => pecas[id],
    getEvent: async () => ({ id: "ev-1", name: "COPA", status: "created", startDate: new Date("2099-01-10"), truckDepartureDate: new Date("2099-01-01") }),
    getItemSponsorApprovals: async (id: string) => aprovacoes[id] ?? [],
    updateItem: async (id: string, campos: Record<string, unknown>) => {
      H.atualizacoes.push({ id, campos });
      pecas[id] = { ...pecas[id], ...campos };
      return pecas[id];
    },
    createNotification: async () => ({ id: "n1" }),
  });
});

const naRevisao = (id: string, extra: Record<string, unknown> = {}): Peca => ({
  id, displayId: `#${id}`, eventId: "ev-1", type: "Pórtico", status: "awaiting_final_review",
  approvalThumbUrl: "/objects/thumb.png", finalFileUrl: "/objects/final.pdf", skipApproval: false, hasModifiedData: false, ...extra,
});

describe("quem escreve \"Aguardando envio\" (varredura sobre todo o servidor)", () => {
  // VARREDURA, de propósito: a regra é "nenhum código NOVO grava esse status
  // em silêncio", e código novo não tem teste de rota ainda. A AST acha cada
  // `status: "awaiting_submission"` (objeto literal) e a função que o contém.
  const RAIZ = path.resolve(__dirname, "..");
  const arquivos: string[] = [];
  (function andar(d: string) {
    for (const n of readdirSync(d)) {
      const p = path.join(d, n);
      if (statSync(p).isDirectory()) { if (n !== "__tests__") andar(p); } else if (n.endsWith(".ts")) arquivos.push(p);
    }
  })(RAIZ);

  /** Onde cada escrita aparece: arquivo + nome da função ou rota que a contém. */
  function escritas(): string[] {
    const saida: string[] = [];
    for (const arq of arquivos) {
      const texto = readFileSync(arq, "utf8");
      if (!texto.includes("awaiting_submission")) continue;
      const sf = ts.createSourceFile(arq, texto, ts.ScriptTarget.Latest, true);
      const visitar = (no: ts.Node) => {
        if (ts.isPropertyAssignment(no) && no.name.getText(sf) === "status" && ts.isStringLiteral(no.initializer) && no.initializer.text === "awaiting_submission") {
          let dono = "?";
          for (let p: ts.Node | undefined = no.parent; p; p = p.parent) {
            if (ts.isFunctionDeclaration(p) && p.name) { dono = p.name.text; break; }
            if (ts.isCallExpression(p) && /^app\.(post|patch|put|delete)$/.test(p.expression.getText(sf)) && p.arguments[0] && ts.isStringLiteral(p.arguments[0])) { dono = p.arguments[0].text; break; }
          }
          saida.push(`${path.relative(RAIZ, arq).split(path.sep).join("/")} :: ${dono}`);
        }
        ts.forEachChild(no, visitar);
      };
      visitar(sf);
    }
    return Array.from(new Set(saida)).sort();
  }

  it("só camposDoDestino (a ESCOLHA de quem devolve) e o avanço normal da vinculação escrevem", () => {
    // A invariante mudou de forma em 17/08: o dono pediu que QUEM DEVOLVE
    // decida — se a arte inteira está errada, a peça volta para o começo. O
    // que continua proibido é o SISTEMA escolher em silêncio. As escritas
    // legítimas:
    //   · camposDoDestino — destino "arte" e o molde (que volta ao começo da
    //     Arte mantendo o thumb, o único material dele);
    //   · send-to-arte — o AVANÇO de "Aguardando vinculação" para a Arte, que
    //     é o caminho de ida, não devolução.
    expect(escritas()).toEqual([
      "routes/itens/revisao.ts :: camposDoDestino",
      "routes/sponsors.ts :: /api/items/send-to-arte",
    ].sort());
  });
});

describe("devolver da Revisão Final respeita o destino escolhido", () => {
  it("sem escolha explícita, o destino é o menos destrutivo (finalização)", () => {
    expect(lerDestinoDevolucao({ body: {} })).toBe("finalizacao");
    expect(lerDestinoDevolucao({ body: { destino: "qualquer" } })).toBe("finalizacao");
    expect(lerDestinoDevolucao({ body: { destino: "arte" } })).toBe("arte");
  });

  it("destino \"finalizacao\" com a rodada aprovada: volta para Finalizar arte e o thumb aprovado FICA", async () => {
    pecas.p1 = naRevisao("p1");
    aprovacoes.p1 = [{ status: "approved" }];
    const r = await chamar("PATCH /api/items/:id/return-to-arte", { sessao: SOLICITACAO, params: { id: "p1" }, body: { notes: MOTIVO } });
    expect(r.status).toBe(200);
    const campos = H.atualizacoes[0].campos;
    expect(campos.status).toBe("sponsor_approved");
    expect(campos).not.toHaveProperty("approvalThumbUrl");
    expect(campos.finalFileUrl).toBeNull();
  });

  it("destino \"arte\": volta ao começo e o thumb aprovado é apagado (arte nova pede aprovação nova)", async () => {
    pecas.p2 = naRevisao("p2");
    const r = await chamar("PATCH /api/items/:id/return-to-arte", { sessao: SOLICITACAO, params: { id: "p2" }, body: { notes: MOTIVO, destino: "arte" } });
    expect(r.status).toBe(200);
    expect(H.atualizacoes[0].campos).toMatchObject({ status: "awaiting_submission", approvalThumbUrl: null, finalFileUrl: null });
  });

  it("molde volta ao começo da Arte SEM perder o thumb (é o único material dele)", async () => {
    pecas.m1 = naRevisao("m1", { type: "Molde" });
    const r = await chamar("PATCH /api/items/:id/return-to-arte", { sessao: SOLICITACAO, params: { id: "m1" }, body: { notes: MOTIVO } });
    expect(r.status).toBe(200);
    expect(H.atualizacoes[0].campos.status).toBe("awaiting_submission");
    expect(H.atualizacoes[0].campos).not.toHaveProperty("approvalThumbUrl");
  });

  it("o lote grava os MESMOS campos que a devolução individual", async () => {
    pecas.p3 = naRevisao("p3");
    aprovacoes.p3 = [{ status: "approved" }];
    const r = await chamar("PATCH /api/items/bulk-return-to-arte", { sessao: SOLICITACAO, body: { itemIds: ["p3"], notes: MOTIVO } });
    expect(r.status).toBe(200);
    const campos = H.atualizacoes[0].campos;
    expect(campos.status).toBe("sponsor_approved");
    expect(campos).not.toHaveProperty("approvalThumbUrl");
    expect(campos).toMatchObject({ hasModifiedData: true, rejectedByCreator: true, observations: MOTIVO });
  });
});

describe("a aba Correção pesca toda peça devolvida por patrocinador", () => {
  it("peça em Aguardando envio COM rejectedBySponsor entra; a nunca enviada, não", async () => {
    Object.assign(H.storage, {
      getItemsParaCorrecao: async () => [
        { id: "devolvida", eventId: "ev-1", status: "awaiting_submission", rejectedBySponsor: true },
        { id: "nova", eventId: "ev-1", status: "awaiting_submission", rejectedBySponsor: false },
      ],
      getAllEvents: async () => [],
      getAllSponsors: async () => [],
      getItemSponsorApprovalsByItemIds: async () => [],
    });
    const r = await chamar("GET /api/items/resubmission-needed", { sessao: { userId: "u-arte", userRole: "arte", userName: "Artur" } });
    expect(r.status).toBe(200);
    const ids = (r.body as Array<{ id: string }>).map((i) => i.id);
    expect(ids).toContain("devolvida");
    expect(ids).not.toContain("nova");
  });
});

describe("reprovar é UMA porta só", () => {
  it("a rota que reprovava a peça inteira não voltou (com nenhum verbo)", () => {
    expect(Array.from(rotas.keys()).filter((k) => k.includes("sponsor-reject"))).toEqual([]);
  });

  it("a reprovação por patrocinador continua registrada", () => {
    expect(rotas.has("POST /api/items/:id/sponsor-approvals/:sponsorId/reject")).toBe(true);
  });
});
