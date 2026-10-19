// ─────────────────────────────────────────────────────────────────────────────
// Atendimento em modo consulta para a Solicitação (dono, 19/10): a tela abria
// INTEIRA ZERADA porque GET /api/items/batch-approval-data (os mapas de
// patrocinadores e aprovações) devolvia 403 para o papel. O Kit segue fora.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";

const H = vi.hoisted(() => ({
  storage: {
    getAllSponsors: vi.fn(async () => [{ id: "s1", name: "Bradesco Seguros" }]),
    getVinculosEAprovacoesDasPecasVivas: vi.fn(async () => ({
      vinculos: [{ itemId: "i1", sponsorId: "s1" }],
      aprovacoes: [{ itemId: "i1", sponsorId: "s1", status: "pending" }],
    })),
  },
}));

vi.mock("../db", () => ({ db: {}, pool: {} }));
vi.mock("../storage", async () => {
  const real = await vi.importActual<any>("../storage");
  return { ...real, storage: H.storage };
});

import { capturarRotas } from "./rotas-de-mentira";
import { registrarFilasEPorEvento } from "../routes/itens/leitura";

const { chamar } = capturarRotas((app) => registrarFilasEPorEvento(app as any));
const rota = "GET /api/items/batch-approval-data";

describe("GET /api/items/batch-approval-data — quem vê a tela de Atendimento", () => {
  beforeEach(() => { H.storage.getVinculosEAprovacoesDasPecasVivas.mockClear(); });

  it.each(["atendimento", "arte", "admin", "solicitacao"])("%s recebe os mapas", async (papel) => {
    const r = await chamar(rota, { sessao: { userId: "u1", userRole: papel, userName: "X" } });
    expect(r.status).toBe(200);
    expect(JSON.stringify(r.body)).toContain("s1");
  });

  it("o usuário do Kit continua sem acesso (e o banco nem é lido)", async () => {
    const r = await chamar(rota, { sessao: { userId: "u2", userRole: "solicitacao", userName: "K", userKit: true } });
    expect(r.status).toBe(403);
    expect(H.storage.getVinculosEAprovacoesDasPecasVivas).not.toHaveBeenCalled();
  });

  it("a Gráfica continua sem acesso", async () => {
    const r = await chamar(rota, { sessao: { userId: "u3", userRole: "grafica", userName: "G" } });
    expect(r.status).toBe(403);
  });
});
