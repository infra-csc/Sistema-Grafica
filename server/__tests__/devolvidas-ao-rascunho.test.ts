// ─────────────────────────────────────────────────────────────────────────────
// Peças devolvidas para o rascunho (dono, 29/10): "as peças que a arte devolve
// pra mim (ficam nos rascunhos), antigamente eu conseguia ver na tela inicial".
// GET /api/items/devolvidas-ao-rascunho alimenta o número do Painel Geral no
// menu, o aviso do Painel e o motivo no card de rascunhos do evento.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const H = vi.hoisted(() => {
  const vivo = { id: "ev1", name: "Maratona do Rio", status: "active", startDate: "2099-12-01", manuallyClosed: false, arquivadoEm: null };
  const fechado = { id: "ev2", name: "Corrida Encerrada", status: "active", startDate: "2099-12-01", manuallyClosed: true, arquivadoEm: null };
  return {
    pecas: [
      // Devolvida pela Arte, com motivo.
      { id: "a", displayId: "#0001", type: "Totem", description: "Largada", status: "draft", eventId: "ev1", kitRemessaId: null, criadoPorId: "u-sol", deletedAt: null },
      // Devolvida pela Vinculação (sem motivo).
      { id: "b", displayId: "#0002", type: "Banner", description: null, status: "draft", eventId: "ev1", kitRemessaId: null, criadoPorId: "u-sol", deletedAt: null },
      // Rascunho que nunca saiu: não tem linha de devolução.
      { id: "nova", displayId: "#0003", type: "Placa", description: null, status: "draft", eventId: "ev1", kitRemessaId: null, criadoPorId: "u-sol", deletedAt: null },
      // Devolvida, mas excluída.
      { id: "x", displayId: "#0004", type: "Placa", description: null, status: "draft", eventId: "ev1", kitRemessaId: null, criadoPorId: "u-sol", deletedAt: new Date() },
      // Devolvida, em evento encerrado (nada mais anda lá).
      { id: "f", displayId: "#0005", type: "Placa", description: null, status: "draft", eventId: "ev2", kitRemessaId: null, criadoPorId: "u-sol", deletedAt: null },
      // Devolvida, do Kit.
      { id: "k", displayId: "#0006", type: "Placa", description: null, status: "draft", eventId: "ev1", kitRemessaId: "r1", criadoPorId: "u-kit", deletedAt: null },
    ],
    eventos: [vivo, fechado],
    devolucoes: new Map<string, { userName: string; createdAt: Date; details: string }>([
      ["a", { userName: "Ana (Arte)", createdAt: new Date("2026-10-28T19:26:00Z"), details: "Status alterado: Aguardando Envio → Rascunho (devolvida pela Arte ao solicitante). Motivo: caiu este totem segundo atendimento" }],
      ["b", { userName: "Bruno", createdAt: new Date("2026-10-27T12:00:00Z"), details: "Item devolvido para Criação (status anterior: Aguardando Vinculação)" }],
      ["x", { userName: "Ana (Arte)", createdAt: new Date("2026-10-28T10:00:00Z"), details: "Status alterado: Aguardando Envio → Rascunho (devolvida pela Arte ao solicitante). Motivo: excluída depois" }],
      ["f", { userName: "Ana (Arte)", createdAt: new Date("2026-10-28T10:00:00Z"), details: "Status alterado: Aguardando Envio → Rascunho (devolvida pela Arte ao solicitante). Motivo: evento fechado" }],
      ["k", { userName: "Ana (Arte)", createdAt: new Date("2026-10-26T10:00:00Z"), details: "Status alterado: Aguardando Finalização → Rascunho (devolvida pela Arte ao solicitante, JÁ FORA DA ARTE). Motivo: logo do Kit trocado" }],
    ]),
  };
});

vi.mock("../db", () => ({ db: {}, pool: {} }));
vi.mock("../storage", async () => {
  const real = await vi.importActual<any>("../storage");
  return {
    ...real,
    storage: {
      getItemsByStatuses: vi.fn(async () => H.pecas),
      getUltimasDevolucoesAoRascunho: vi.fn(async (ids: string[]) => new Map(ids.filter((id) => H.devolucoes.has(id)).map((id) => [id, H.devolucoes.get(id)!]))),
      getEventsByIds: vi.fn(async (ids: string[]) => H.eventos.filter((e) => ids.includes(e.id))),
    },
  };
});

import { capturarRotas } from "./rotas-de-mentira";
import { registrarFilasEPorEvento } from "../routes/itens/leitura";
import { lerDevolucaoAoRascunho, MARCA_DEVOLVIDA_PELA_ARTE, MARCA_DEVOLVIDA_PARA_A_CRIACAO } from "@shared/devolvidas-ao-rascunho";

const { chamar } = capturarRotas((app) => registrarFilasEPorEvento(app as any));
const rota = "GET /api/items/devolvidas-ao-rascunho";
const ids = (body: any) => body.pecas.map((p: any) => p.id);

describe("Devolvidas para o rascunho — a rota", () => {
  // A Solicitação da Arena vê também as do Kit: é ela quem envia os rascunhos
  // do evento (rascunhosQueEuEnvio, no card) — a mesma régua de visibilidade.
  it("Solicitação: só as devolvidas vivas, de evento em jogo — a mais recente primeiro", async () => {
    const r = await chamar(rota, { sessao: { userId: "u-sol", userRole: "solicitacao", userName: "S" } });
    expect(r.status).toBe(200);
    expect(ids(r.body)).toEqual(["a", "b", "k"]);
    expect((r.body as any).pecas[0]).toMatchObject({
      displayId: "#0001", eventName: "Maratona do Rio", origem: "arte",
      motivo: "caiu este totem segundo atendimento", por: "Ana (Arte)", em: "2026-10-28T19:26:00.000Z",
    });
    expect((r.body as any).pecas[1]).toMatchObject({ origem: "vinculacao", motivo: null, por: "Bruno" });
  });

  it("admin vê as mesmas, com o motivo da devolução do Kit", async () => {
    const r = await chamar(rota, { sessao: { userId: "u-adm", userRole: "admin", userName: "A" } });
    expect(ids(r.body)).toEqual(["a", "b", "k"]);
    expect((r.body as any).pecas[2].motivo).toBe("logo do Kit trocado");
  });

  it("usuário do Kit vê só as dele", async () => {
    const r = await chamar(rota, { sessao: { userId: "u-kit", userRole: "solicitacao", userName: "K", userKit: true } });
    expect(ids(r.body)).toEqual(["k"]);
  });

  it("quem não recebe a peça de volta (Arte, Gráfica…) recebe a lista vazia", async () => {
    for (const userRole of ["arte", "grafica", "atendimento"]) {
      const r = await chamar(rota, { sessao: { userId: "u", userRole, userName: "X" } });
      expect(r.body).toEqual({ pecas: [] });
    }
  });
});

describe("Devolvidas para o rascunho — a leitura da trilha", () => {
  it("lê a origem e o motivo das duas portas, e ignora o resto", () => {
    expect(lerDevolucaoAoRascunho("Status alterado: Aguardando Envio → Rascunho (devolvida pela Arte ao solicitante). Motivo: sem informação"))
      .toEqual({ origem: "arte", motivo: "sem informação" });
    expect(lerDevolucaoAoRascunho("Status alterado: Aguardando Finalização → Rascunho (devolvida pela Arte ao solicitante, JÁ FORA DA ARTE). Motivo: Adicionar copyright. Ver o book."))
      .toEqual({ origem: "arte", motivo: "Adicionar copyright. Ver o book." });
    expect(lerDevolucaoAoRascunho("Item devolvido para Criação (status anterior: Aguardando Vinculação)"))
      .toEqual({ origem: "vinculacao", motivo: null });
    expect(lerDevolucaoAoRascunho("Status alterado: Rascunho → Aguardando Vinculação")).toBeNull();
    expect(lerDevolucaoAoRascunho(null)).toBeNull();
  });

  it("as duas rotas gravam a trilha com as MESMAS marcas que o aviso lê", () => {
    const raiz = path.resolve(__dirname, "..");
    const revisao = readFileSync(path.join(raiz, "routes/itens/revisao.ts"), "utf8");
    const sponsors = readFileSync(path.join(raiz, "routes/sponsors.ts"), "utf8");
    expect(revisao).toContain("(${MARCA_DEVOLVIDA_PELA_ARTE}${DEPOIS_DA_ARTE");
    expect(sponsors).toContain("`${MARCA_DEVOLVIDA_PARA_A_CRIACAO} (status anterior:");
    // E as marcas são os textos que já estão na trilha de produção.
    expect(MARCA_DEVOLVIDA_PELA_ARTE).toBe("devolvida pela Arte ao solicitante");
    expect(MARCA_DEVOLVIDA_PARA_A_CRIACAO).toBe("Item devolvido para Criação");
  });
});
