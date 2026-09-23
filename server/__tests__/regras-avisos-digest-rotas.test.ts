// ─────────────────────────────────────────────────────────────────────────────
// AS ROTAS DOS AVISOS — disparo à mão e tela Notificações, rodando o handler.
//
// Veio de revisao-digest.test.ts, gestao-digest.test.ts e
// notificacoes-admin.test.ts, que liam o texto de server/routes/itens/*.ts.
// Aqui `registrarAvisos` roda num app de mentira (rotas-de-mentira.ts), com
// storage, trilha e os disparos trocados por espiões. O que se prende:
//   · só admin dispara à mão (um clique manda e-mail de verdade) — e o
//     disparo vai com { manual: true };
//   · a resposta conta o desfecho real (fila vazia não vira "enviado");
//   · as três rotas de Notificações são só de admin, e as de escrita estão
//     na régua de papéis;
//   · a PRIMEIRA personalização copia a lista padrão;
//   · canal e e-mail validados; adicionar e remover vão para a trilha;
//   · o retrato traz as chaves de "por que ninguém recebeu" e o histórico;
//   · a cópia do book passa pelo canal e só vai a usuário cadastrado.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";

const H = vi.hoisted(() => ({
  destinatarios: [] as Array<{ id: string; canal: string; email: string }>,
  usuarios: [] as Array<{ email: string; role: string }>,
  addEmailDestinatario: vi.fn(),
  removeEmailDestinatario: vi.fn(),
  createAuditLog: vi.fn(),
  enviarRevisao: vi.fn(),
  enviarGestao: vi.fn(),
  historico: vi.fn(),
}));

vi.mock("../db", () => ({ db: {}, pool: { query: vi.fn(async () => ({ rows: [], rowCount: 0 })) } }));
vi.mock("../storage", () => ({
  storage: {
    getEmailDestinatarios: async (canal: string) => H.destinatarios.filter((d) => d.canal === canal),
    addEmailDestinatario: (...a: unknown[]) => H.addEmailDestinatario(...a),
    removeEmailDestinatario: (...a: unknown[]) => H.removeEmailDestinatario(...a),
    getAllUsers: async () => H.usuarios,
  },
}));
vi.mock("../routes/shared", async () => {
  const real = await vi.importActual<typeof import("../routes/shared")>("../routes/shared");
  return { ...real, createAuditLog: (...a: unknown[]) => H.createAuditLog(...a) };
});
vi.mock("../services/revisaoDigest", async () => {
  const real = await vi.importActual<typeof import("../services/revisaoDigest")>("../services/revisaoDigest");
  return { ...real, enviarAvisoDaRevisao: (...a: unknown[]) => H.enviarRevisao(...a) };
});
vi.mock("../services/gestaoDigest", async () => {
  const real = await vi.importActual<typeof import("../services/gestaoDigest")>("../services/gestaoDigest");
  return {
    ...real,
    enviarAvisoDaGestao: (...a: unknown[]) => H.enviarGestao(...a),
    historicoDeEnvios: (...a: unknown[]) => H.historico(...a),
  };
});
vi.mock("../services/consistencia", () => ({ verificarConsistencia: vi.fn(async () => ({})) }));

import { registrarAvisos } from "../routes/itens/avisos";
import { destinatariosNomeados, DESTINATARIOS_NOMEADOS } from "../routes/itens/book";
import { DESTINATARIOS_DA_GESTAO } from "../services/gestaoDigest";
import { podePapel } from "@shared/permissoes";
import { capturarRotas } from "./rotas-de-mentira";

const { chamar } = capturarRotas(registrarAvisos);
const ADMIN = { userId: "u-admin", userRole: "admin", userName: "Yan" };
const ARTE = { userId: "u-arte", userRole: "arte", userName: "Bia" };

beforeEach(() => {
  H.destinatarios = [];
  H.usuarios = [];
  H.addEmailDestinatario.mockReset().mockImplementation(async (d: { canal: string; email: string }) => {
    const criado = { id: `d${H.destinatarios.length + 1}`, ...d };
    H.destinatarios.push(criado);
    return criado;
  });
  H.removeEmailDestinatario.mockReset();
  H.createAuditLog.mockReset().mockResolvedValue(undefined);
  H.enviarRevisao.mockReset();
  H.enviarGestao.mockReset();
  H.historico.mockReset().mockResolvedValue([]);
});

describe("disparo à mão — só admin, e a resposta conta o desfecho real", () => {
  it("revisão: não-admin leva 403 e nada é disparado; sem sessão, 401", async () => {
    const r = await chamar("POST /api/revisao/digest/enviar", { sessao: ARTE });
    expect(r.status).toBe(403);
    expect(r.body).toEqual({ error: "Apenas administradores podem disparar o aviso da fila de revisão" });
    expect((await chamar("POST /api/revisao/digest/enviar")).status).toBe(401);
    expect(H.enviarRevisao).not.toHaveBeenCalled();
  });

  it("revisão: admin dispara com { manual: true } (pula a memória do dia de propósito)", async () => {
    H.enviarRevisao.mockResolvedValue({ status: "enviado", resumo: { total: 7, novos: 3 } });
    const r = await chamar("POST /api/revisao/digest/enviar", { sessao: ADMIN });
    expect(r.status).toBe(200);
    expect(H.enviarRevisao).toHaveBeenCalledWith(expect.any(Date), process.env, { manual: true });
    expect(r.body).toMatchObject({ status: "enviado", mensagem: "Aviso enviado — 7 na fila, 3 novas." });
  });

  it("revisão: fila vazia não é 'enviado' — a mensagem diz que não saiu", async () => {
    H.enviarRevisao.mockResolvedValue({ status: "sem-fila", resumo: { total: 0, novos: 0 } });
    const r = await chamar("POST /api/revisao/digest/enviar", { sessao: ADMIN });
    expect(r.body).toMatchObject({
      status: "sem-fila",
      mensagem: "Nada na fila de revisão agora — o aviso não é enviado quando não há o que revisar.",
    });
  });

  it("gestão: não-admin leva 403 com a frase própria", async () => {
    const r = await chamar("POST /api/gestao/digest/enviar", { sessao: ARTE });
    expect(r.status).toBe(403);
    expect(r.body).toEqual({ error: "Apenas administradores podem disparar o aviso da gestão" });
    expect(H.enviarGestao).not.toHaveBeenCalled();
  });

  it("gestão: admin dispara com { manual: true }; fila vazia responde 'Nenhuma aprovação pendente agora'", async () => {
    H.enviarGestao.mockResolvedValue({ status: "sem-fila" });
    const r = await chamar("POST /api/gestao/digest/enviar", { sessao: ADMIN });
    expect(H.enviarGestao).toHaveBeenCalledWith(expect.any(Date), process.env, { manual: true });
    expect(r.body).toMatchObject({
      status: "sem-fila",
      mensagem: "Nenhuma aprovação pendente agora — o aviso não é enviado quando não há o que acompanhar.",
    });
  });

  it("gestão: desfecho de falha aparece com o motivo, não como sucesso", async () => {
    H.enviarGestao.mockResolvedValue({ status: "desligado", motivo: "Fora de produção" });
    const r = await chamar("POST /api/gestao/digest/enviar", { sessao: ADMIN });
    expect(r.body).toMatchObject({ mensagem: "Aviso NÃO enviado: Fora de produção" });
  });
});

describe("tela Notificações — as rotas de admin", () => {
  it("as três são só de admin", async () => {
    const chamadas: Array<[string, Parameters<typeof chamar>[1]]> = [
      ["GET /api/admin/notificacoes", {}],
      ["POST /api/admin/notificacoes/destinatarios", { body: { canal: "gestao", email: "x@y.com" } }],
      ["DELETE /api/admin/notificacoes/destinatarios/:id", { params: { id: "d1" } }],
    ];
    for (const [rota, ctx] of chamadas) {
      const r = await chamar(rota, { ...ctx, sessao: ARTE });
      expect(r.status, rota).toBe(403);
    }
    expect(H.addEmailDestinatario).not.toHaveBeenCalled();
    expect(H.removeEmailDestinatario).not.toHaveBeenCalled();
  });

  it("as duas de escrita estão na régua de papéis (só admin)", () => {
    for (const [metodo, rota] of [
      ["POST", "/api/admin/notificacoes/destinatarios"],
      ["DELETE", "/api/admin/notificacoes/destinatarios/:id"],
    ] as const) {
      expect(podePapel(metodo, rota, "admin")).toBe(true);
      for (const papel of ["solicitacao", "arte", "grafica", "atendimento"]) {
        expect(podePapel(metodo, rota, papel), `${metodo} ${rota} ${papel}`).toBe(false);
      }
    }
  });

  it("a PRIMEIRA personalização copia a lista padrão — adicionar nunca é remover todo mundo", async () => {
    const r = await chamar("POST /api/admin/notificacoes/destinatarios", {
      sessao: ADMIN, body: { canal: "gestao", email: " Livia.Monteiro@NorteMkt.com " },
    });
    expect(r.status).toBe(201);
    expect(H.destinatarios.map((d) => d.email)).toEqual([...DESTINATARIOS_DA_GESTAO, "livia.monteiro@nortemkt.com"]);
    for (const email of DESTINATARIOS_DA_GESTAO) {
      expect(H.addEmailDestinatario).toHaveBeenCalledWith({ canal: "gestao", email, addedBy: "padrão do sistema" });
    }
    expect(H.addEmailDestinatario).toHaveBeenLastCalledWith({ canal: "gestao", email: "livia.monteiro@nortemkt.com", addedBy: "Yan" });
  });

  it("canal já personalizado: só o novo entra (a cópia é só na primeira vez)", async () => {
    H.destinatarios = [{ id: "d1", canal: "revisao", email: "a@x.com" }];
    await chamar("POST /api/admin/notificacoes/destinatarios", { sessao: ADMIN, body: { canal: "revisao", email: "b@x.com" } });
    expect(H.addEmailDestinatario).toHaveBeenCalledTimes(1);
    expect(H.destinatarios.map((d) => d.email)).toEqual(["a@x.com", "b@x.com"]);
  });

  it("canal e e-mail são validados — nada é gravado", async () => {
    const canal = await chamar("POST /api/admin/notificacoes/destinatarios", { sessao: ADMIN, body: { canal: "sms", email: "a@x.com" } });
    expect(canal).toMatchObject({ status: 400, body: { error: "Canal inválido" } });
    const email = await chamar("POST /api/admin/notificacoes/destinatarios", { sessao: ADMIN, body: { canal: "gestao", email: "sem-arroba" } });
    expect(email).toMatchObject({ status: 400, body: { error: "E-mail inválido" } });
    expect(H.addEmailDestinatario).not.toHaveBeenCalled();
    expect(H.createAuditLog).not.toHaveBeenCalled();
  });

  it("adicionar e remover vão para a trilha", async () => {
    await chamar("POST /api/admin/notificacoes/destinatarios", { sessao: ADMIN, body: { canal: "book", email: "c@x.com" } });
    expect(H.createAuditLog).toHaveBeenCalledWith(expect.anything(), "added", "gestao", "book", expect.stringContaining('"c@x.com"'));

    H.removeEmailDestinatario.mockResolvedValue({ id: "d9", canal: "book", email: "c@x.com" });
    const r = await chamar("DELETE /api/admin/notificacoes/destinatarios/:id", { sessao: ADMIN, params: { id: "d9" } });
    expect(r.body).toMatchObject({ ok: true });
    expect(H.removeEmailDestinatario).toHaveBeenCalledWith("d9");
    expect(H.createAuditLog).toHaveBeenLastCalledWith(expect.anything(), "deleted", "gestao", "book", expect.stringContaining('"c@x.com"'));
  });

  it("remover o que não existe é 404, sem trilha", async () => {
    H.removeEmailDestinatario.mockResolvedValue(undefined);
    const r = await chamar("DELETE /api/admin/notificacoes/destinatarios/:id", { sessao: ADMIN, params: { id: "nada" } });
    expect(r).toMatchObject({ status: 404, body: { error: "Destinatário não encontrado" } });
    expect(H.createAuditLog).not.toHaveBeenCalled();
  });

  it("o retrato traz as chaves que respondem 'por que ninguém recebeu' e o histórico da trilha", async () => {
    const edicoes = [{ aviso: "gestao", dia: "2026-08-24", hora: 10, manual: false, status: "vazio" }];
    H.historico.mockResolvedValue(edicoes);
    H.destinatarios = [{ id: "d1", canal: "revisao", email: "a@x.com" }];
    const r = await chamar("GET /api/admin/notificacoes", { sessao: ADMIN });
    expect(r.status).toBe(200);
    const body = r.body as any;
    expect(Object.keys(body.chaves).sort()).toEqual(
      ["emailsLigados", "gestaoLigada", "producao", "remetente", "revisaoLigada", "simulacao"],
    );
    expect(body.edicoes).toBe(edicoes);
    // canal com linha usa as linhas; sem linha, a lista padrão
    const porCanal = Object.fromEntries(body.canais.map((c: any) => [c.canal, c.emUso]));
    expect(porCanal.revisao).toEqual(["a@x.com"]);
    expect(porCanal.gestao).toEqual([...DESTINATARIOS_DA_GESTAO]);
  });
});

describe("a cópia do book passa pelo canal", () => {
  it("usa a lista do canal 'book' e só manda para quem é usuário cadastrado", async () => {
    H.usuarios = [
      { email: "Livia.Monteiro@nortemkt.com", role: "atendimento" },
      { email: "pedro@nortemkt.com", role: "admin" },
    ];
    H.destinatarios = [
      { id: "d1", canal: "book", email: "livia.monteiro@nortemkt.com" },
      { id: "d2", canal: "book", email: "fantasma@nortemkt.com" }, // não é usuário
    ];
    expect(await destinatariosNomeados()).toEqual(["Livia.Monteiro@nortemkt.com"]);
  });

  it("sem linha no canal, vale a constante — ainda filtrada pelo cadastro", async () => {
    H.usuarios = DESTINATARIOS_NOMEADOS.slice(0, 2).map((email) => ({ email, role: "admin" }));
    expect(await destinatariosNomeados()).toEqual(DESTINATARIOS_NOMEADOS.slice(0, 2));
  });
});
