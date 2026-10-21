// ─────────────────────────────────────────────────────────────────────────────
// OPERADORES NO LOGIN COMPARTILHADO — de ponta a ponta, contra um Postgres de
// verdade (PGlite, migrações do zero, incluindo a 0008) e uma sessão de
// verdade (express-session, cookie de navegador simulado). Dono, 21/10.
//
// O roteiro é o dia da gráfica: o admin cadastra Gilmar, Elias e Harisson; o
// login "Produção Grafica" entra e nada se grava até alguém escolher; Gilmar
// cria o PIN; a trilha grava "Produção Grafica (Gilmar)"; Elias assume no
// almoço com o PIN DELE; PIN errado bloqueia; o admin redefine; sair volta
// para "Quem está na máquina?" sem deslogar. E, numa rota REAL de produção
// (iniciar impressão), o nome efetivo chega ao histórico da peça.
//
// Sem o PGlite instalado (pasta de ferramentas), o arquivo PULA com aviso.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { AddressInfo } from "net";
import type { Server } from "http";
import type { Request, Response, NextFunction } from "express";
import { PGLITE_DISPONIVEL, subirBancoDeTeste, type BancoDeTeste } from "./banco-pglite";
import { montarApp, semearUsuarios, semearPeca, semearEvento, USUARIOS, type AppDeTeste } from "./app-com-banco";
import { TENTATIVAS_DE_PIN, type EstadoDosOperadores, type OperadorDoAdmin } from "@shared/operadores";

vi.mock("../services/xlsxImport", () => ({ handlePreviewXlsx: vi.fn(), handleConfirmImport: vi.fn() }));
vi.mock("../services/xlsxExport", () => ({ handleExportItemsXlsx: vi.fn(), handleExportSelectedItemsXlsx: vi.fn(), responderRelatorioMaquinasXlsx: vi.fn() }));

const PROD = { id: "u-prod", nome: "Produção Grafica", papel: "grafica" };

/** Um "navegador": guarda o cookie da sessão entre as chamadas. */
function navegador(base: string) {
  let cookie = "";
  return async function chamar<T = Record<string, unknown>>(metodo: string, caminho: string, corpo?: unknown): Promise<{ status: number; corpo: T }> {
    const r = await fetch(base + caminho, {
      method: metodo,
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    const set = r.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    const texto = await r.text();
    let json: unknown = texto;
    try { json = texto ? JSON.parse(texto) : null; } catch { /* texto */ }
    return { status: r.status, corpo: json as T };
  };
}

describe.skipIf(!PGLITE_DISPONIVEL)("integração: operadores no login compartilhado", () => {
  let banco: BancoDeTeste;
  let servidor: Server;
  let base = "";
  let appReal: AppDeTeste;

  beforeAll(async () => {
    banco = await subirBancoDeTeste();
    await semearUsuarios(banco);
    await banco.consultar(`INSERT INTO users (id, name, email, password_hash, role) VALUES ($1, $2, 'producaografica@teste.local', 'x', 'grafica')`, [PROD.id, PROD.nome]);

    const express = (await import("express")).default;
    const session = (await import("express-session")).default;
    const { registerOperadorRoutes, montarIdentidadeDoOperador } = await import("../routes/operadores");
    const { registerAuthRoutes } = await import("../routes/auth");
    const { requireAuth, createAuditLog } = await import("../routes/shared");

    const app = express();
    app.use(express.json());
    app.use(session({ secret: "teste-operadores", resave: false, saveUninitialized: false, rolling: true }));
    // "Login" de teste: a sessão nasce como no POST /api/auth/login (regenerate + campos).
    app.post("/teste/login", async (req: Request, res: Response) => {
      const { id, nome, papel } = req.body as { id: string; nome: string; papel: string };
      await new Promise<void>((ok, falhou) => req.session.regenerate((e) => (e ? falhou(e) : ok())));
      req.session.userId = id; req.session.userName = nome; req.session.userRole = papel;
      await new Promise<void>((ok, falhou) => req.session.save((e) => (e ? falhou(e) : ok())));
      res.json({ ok: true });
    });
    // O mesmo que server/routes.ts faz antes das rotas.
    app.use((req: Request, _res: Response, next: NextFunction) => {
      if (req.session?.userId) { req.userId = req.session.userId; req.userName = req.session.userName || "Sistema"; req.userRole = req.session.userRole; }
      else req.userName = "Sistema";
      next();
    });
    app.use(montarIdentidadeDoOperador());
    registerAuthRoutes(app);
    registerOperadorRoutes(app);
    // Uma escrita qualquer que grava trilha pelo caminho normal (resolveActor(req)).
    app.post("/api/teste/acao", requireAuth, async (req: Request, res: Response) => {
      await createAuditLog(req, "updated", "item", "peca-teste", "ação de teste");
      res.json({ nome: req.userName });
    });
    app.use((erro: unknown, _req: Request, res: Response, _next: NextFunction) => {
      res.status(500).json({ error: erro instanceof Error ? erro.message : String(erro) });
    });
    servidor = await new Promise((ok) => { const s = app.listen(0, "127.0.0.1", () => ok(s)); });
    base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
    appReal = await montarApp();
  }, 120_000);

  afterAll(async () => {
    await new Promise<void>((ok) => servidor?.close(() => ok()));
    await appReal?.fechar();
    await banco?.parar();
  });

  const admin = () => { const c = navegador(base); return c("POST", "/teste/login", { id: USUARIOS.admin.id, nome: USUARIOS.admin.nome, papel: "admin" }).then(() => c); };
  const maquina = () => { const c = navegador(base); return c("POST", "/teste/login", PROD).then(() => c); };
  const trilha = (acao: string, entidade = "operador") =>
    banco.consultar<{ user_name: string; user_id: string | null; details: string; entity_id: string }>(
      `SELECT user_name, user_id, details, entity_id FROM audit_logs WHERE action = $1 AND entity_type = $2 ORDER BY created_at, id`, [acao, entidade]);

  const ids: Record<string, string> = {};

  it("admin cadastra os operadores (só nomes, sem PIN); repetido e não-admin são recusados", async () => {
    const a = await admin();
    for (const nome of ["Gilmar", "Elias", "Harisson"]) {
      const r = await a<OperadorDoAdmin>("POST", `/api/users/${PROD.id}/operadores`, { nome });
      expect(r.status, JSON.stringify(r.corpo)).toBe(201);
      expect(r.corpo).toMatchObject({ nome, ativo: true, temPin: false, bloqueadoAte: null });
      expect(r.corpo).not.toHaveProperty("pinHash");
      ids[nome] = r.corpo.id;
    }
    expect((await a("POST", `/api/users/${PROD.id}/operadores`, { nome: "gilmar" })).status).toBe(409);
    expect((await a("POST", `/api/users/${PROD.id}/operadores`, { nome: "Gil (tarde)" })).status).toBe(400);
    const lista = await a<Array<{ id: string; operadoresAtivos: number }>>("GET", "/api/users");
    expect(lista.corpo.find((u) => u.id === PROD.id)?.operadoresAtivos).toBe(3);
    expect(lista.corpo.find((u) => u.id === USUARIOS.grafica.id)?.operadoresAtivos).toBe(0);

    // Quem não é admin não gerencia — nem a Gráfica comum, nem o próprio login compartilhado.
    const g = navegador(base);
    await g("POST", "/teste/login", { id: USUARIOS.grafica.id, nome: USUARIOS.grafica.nome, papel: "grafica" });
    expect((await g("POST", `/api/users/${PROD.id}/operadores`, { nome: "Intruso" })).status).toBe(403);
    expect((await g("PATCH", `/api/operadores/${ids.Gilmar}`, { nome: "Outro" })).status).toBe(403);
    const m = await maquina();
    expect((await m("POST", `/api/operadores/${ids.Gilmar}/redefinir-pin`)).status).toBe(403);
    expect((await m("GET", `/api/users/${PROD.id}/operadores`)).status).toBe(403);
    expect((await trilha("created")).map((l) => l.details)).toEqual(expect.arrayContaining([expect.stringContaining('Operador "Gilmar" adicionado ao login "Produção Grafica"')]));
  });

  let m: Awaited<ReturnType<typeof maquina>>;

  it("o login compartilhado entra SEM operador: lê, mas não grava nada (428)", async () => {
    m = await maquina();
    // O /api/auth/me liga a pergunta só para o login compartilhado.
    expect((await m("GET", "/api/auth/me")).corpo).toMatchObject({ id: PROD.id, loginComOperadores: true });
    const estado = await m<EstadoDosOperadores>("GET", "/api/operadores");
    expect(estado.corpo).toMatchObject({ exigeOperador: true, login: "Produção Grafica", atual: null });
    expect(estado.corpo.operadores.map((o) => [o.nome, o.temPin])).toEqual([["Elias", false], ["Gilmar", false], ["Harisson", false]]);
    const escrita = await m("POST", "/api/teste/acao");
    expect(escrita.status).toBe(428);
    expect(escrita.corpo).toMatchObject({ codigo: "operador-necessario" });
  });

  it("primeiro acesso: entrar sem PIN pede para criar; PIN fraco e confirmação diferente são recusados", async () => {
    expect((await m("POST", "/api/operadores/entrar", { operadorId: ids.Gilmar, pin: "2580" })).corpo).toMatchObject({ codigo: "sem-pin" });
    expect((await m("POST", "/api/operadores/definir-pin", { operadorId: ids.Gilmar, pin: "1234", confirmacao: "1234" })).status).toBe(400);
    expect((await m("POST", "/api/operadores/definir-pin", { operadorId: ids.Gilmar, pin: "2580", confirmacao: "2581" })).status).toBe(400);
    expect((await m("POST", "/api/operadores/definir-pin", { operadorId: "nao-existe", pin: "2580", confirmacao: "2580" })).status).toBe(404);
  });

  it("Gilmar cria o PIN e assume: hash bcrypt no banco (nunca o PIN), turno aberto na trilha", async () => {
    const r = await m<EstadoDosOperadores>("POST", "/api/operadores/definir-pin", { operadorId: ids.Gilmar, pin: "2580", confirmacao: "2580" });
    expect(r.status, JSON.stringify(r.corpo)).toBe(200);
    expect(r.corpo.atual).toMatchObject({ id: ids.Gilmar, nome: "Gilmar" });
    const [linha] = await banco.consultar<{ pin_hash: string }>(`SELECT pin_hash FROM operadores WHERE id = $1`, [ids.Gilmar]);
    expect(linha.pin_hash).toMatch(/^\$2[aby]\$10\$/);
    expect(linha.pin_hash).not.toContain("2580");
    // Ninguém troca o PIN de quem já tem por este caminho.
    expect((await m("POST", "/api/operadores/definir-pin", { operadorId: ids.Gilmar, pin: "7391", confirmacao: "7391" })).corpo).toMatchObject({ codigo: "ja-tem-pin" });
    const inicio = await trilha("turno_inicio");
    expect(inicio.at(-1)).toMatchObject({ user_name: "Produção Grafica (Gilmar)", user_id: PROD.id, entity_id: ids.Gilmar });
    expect(inicio.at(-1)!.details).toMatch(/^Gilmar assumiu a máquina às \d{2}:\d{2}$/);
    expect((await trilha("pin_criado")).at(-1)?.details).toBe("Gilmar criou o próprio PIN (primeiro acesso)");
  });

  it("o nome efetivo chega à trilha: 'Produção Grafica (Gilmar)', com o id do login", async () => {
    const r = await m<{ nome: string }>("POST", "/api/teste/acao");
    expect(r.status).toBe(200);
    expect(r.corpo.nome).toBe("Produção Grafica (Gilmar)");
    const [l] = await banco.consultar<{ user_name: string; user_id: string }>(`SELECT user_name, user_id FROM audit_logs WHERE entity_id = 'peca-teste' ORDER BY created_at DESC LIMIT 1`);
    expect(l).toEqual({ user_name: "Produção Grafica (Gilmar)", user_id: PROD.id });
  });

  it("troca de turno: Elias assume com o PIN DELE; a trilha fecha o turno do Gilmar e abre o do Elias", async () => {
    const r = await m<EstadoDosOperadores>("POST", "/api/operadores/definir-pin", { operadorId: ids.Elias, pin: "7391", confirmacao: "7391" });
    expect(r.corpo.atual?.nome).toBe("Elias");
    const fim = await trilha("turno_fim");
    expect(fim.at(-1)).toMatchObject({ user_name: "Produção Grafica (Gilmar)", entity_id: ids.Gilmar });
    expect(fim.at(-1)!.details).toMatch(/^Gilmar saiu às \d{2}:\d{2} — Elias assumiu a máquina$/);
    expect((await m<{ nome: string }>("POST", "/api/teste/acao")).corpo.nome).toBe("Produção Grafica (Elias)");
  });

  it("ninguém age em nome do outro sem o PIN do outro: PIN errado não troca, e o 5º erro bloqueia 15 min", async () => {
    for (let i = 1; i < TENTATIVAS_DE_PIN; i++) {
      const r = await m<{ restantes: number; error: string }>("POST", "/api/operadores/entrar", { operadorId: ids.Gilmar, pin: "0592" });
      expect(r.status).toBe(403);
      expect(r.corpo.restantes).toBe(TENTATIVAS_DE_PIN - i);
    }
    const ultima = await m<{ error: string; bloqueadoAte: string }>("POST", "/api/operadores/entrar", { operadorId: ids.Gilmar, pin: "0592" });
    expect(ultima.status).toBe(423);
    expect(ultima.corpo.error).toMatch(/bloqueado/);
    // Bloqueado: nem o PIN certo entra.
    expect((await m("POST", "/api/operadores/entrar", { operadorId: ids.Gilmar, pin: "2580" })).status).toBe(423);
    // Quem estava (Elias) continua; o cartão do Gilmar mostra o bloqueio.
    const estado = await m<EstadoDosOperadores>("GET", "/api/operadores");
    expect(estado.corpo.atual?.nome).toBe("Elias");
    expect(estado.corpo.operadores.find((o) => o.id === ids.Gilmar)?.bloqueadoAte).toBeTruthy();
    expect((await trilha("pin_bloqueado")).at(-1)?.details).toMatch(/^PIN de Gilmar bloqueado até as \d{2}:\d{2} depois de 5 tentativas erradas$/);
    // O PIN não aparece em lugar nenhum da trilha.
    const comPin = await banco.consultar(`SELECT 1 FROM audit_logs WHERE details LIKE '%2580%' OR details LIKE '%7391%' OR details LIKE '%0592%'`);
    expect(comPin).toHaveLength(0);
  });

  it("admin redefine o PIN do Gilmar: limpa o hash e o bloqueio; ele cria outro no próximo acesso", async () => {
    const a = await admin();
    const r = await a<OperadorDoAdmin>("POST", `/api/operadores/${ids.Gilmar}/redefinir-pin`);
    expect(r.status).toBe(200);
    expect(r.corpo).toMatchObject({ temPin: false, bloqueadoAte: null });
    expect((await trilha("pin_redefinido")).at(-1)?.details).toMatch(/^PIN de Gilmar redefinido pelo administrador/);
    const estado = await m<EstadoDosOperadores>("GET", "/api/operadores");
    expect(estado.corpo.operadores.find((o) => o.id === ids.Gilmar)).toMatchObject({ temPin: false, bloqueadoAte: null });
  });

  it("'Sair para o almoço': volta para 'Quem está na máquina?' sem deslogar, e a saída entra na trilha", async () => {
    const r = await m<EstadoDosOperadores>("POST", "/api/operadores/sair", { motivo: "almoco" });
    expect(r.status).toBe(200);
    expect(r.corpo).toMatchObject({ exigeOperador: true, atual: null });
    expect((await trilha("turno_fim")).at(-1)!.details).toMatch(/^Elias saiu às \d{2}:\d{2} \(almoço\)$/);
    expect((await m("POST", "/api/teste/acao")).status).toBe(428);
    // O login continua aberto: leitura segue.
    expect((await m("GET", "/api/operadores")).status).toBe(200);
  });

  it("Elias volta com o PIN dele; o admin o desativa e ele sai da máquina na próxima requisição", async () => {
    expect((await m<EstadoDosOperadores>("POST", "/api/operadores/entrar", { operadorId: ids.Elias, pin: "7391" })).corpo.atual?.nome).toBe("Elias");
    const a = await admin();
    const lista = await a<OperadorDoAdmin[]>("GET", `/api/users/${PROD.id}/operadores`);
    expect(lista.corpo.map((o) => o.nome)).toEqual(["Elias", "Gilmar", "Harisson"]);
    expect((await a<OperadorDoAdmin>("PATCH", `/api/operadores/${ids.Elias}`, { ativo: false })).corpo.ativo).toBe(false);
    expect((await m("POST", "/api/teste/acao")).status).toBe(428);
    expect((await trilha("turno_fim")).at(-1)).toMatchObject({ entity_id: ids.Elias, details: "Elias saiu: o operador foi desativado pelo administrador" });
    const estado = await m<EstadoDosOperadores>("GET", "/api/operadores");
    expect(estado.corpo.operadores.map((o) => o.nome)).toEqual(["Gilmar", "Harisson"]);
    // Reativar e renomear.
    expect((await a<OperadorDoAdmin>("PATCH", `/api/operadores/${ids.Elias}`, { ativo: true, nome: "Elias Souza" })).corpo).toMatchObject({ ativo: true, nome: "Elias Souza" });
    expect((await a("PATCH", `/api/operadores/${ids.Elias}`, { nome: "harisson" })).status).toBe(409);
  });

  it("outros logins não são afetados: Gráfica comum e Solicitação gravam como sempre", async () => {
    for (const u of [USUARIOS.grafica, USUARIOS.solicitacao, USUARIOS.arte]) {
      const c = navegador(base);
      await c("POST", "/teste/login", { id: u.id, nome: u.nome, papel: u.papel });
      const r = await c<{ nome: string }>("POST", "/api/teste/acao");
      expect(r.status, u.nome).toBe(200);
      expect(r.corpo.nome).toBe(u.nome);
      expect((await c("GET", "/api/auth/me")).corpo).toMatchObject({ loginComOperadores: false });
      expect((await c<EstadoDosOperadores>("GET", "/api/operadores")).corpo).toEqual({ exigeOperador: false, login: u.nome, atual: null, operadores: [] });
    }
  });

  it("sair do login com operador na máquina também fecha o turno na trilha", async () => {
    const c = await maquina();
    await c("POST", "/api/operadores/entrar", { operadorId: ids.Elias, pin: "7391" });
    expect((await c("POST", "/api/auth/logout")).status).toBe(200);
    expect((await trilha("turno_fim")).at(-1)!.details).toMatch(/^Elias Souza saiu às \d{2}:\d{2} \(saiu do login\)$/);
  });

  it("numa rota REAL (iniciar impressão), o histórico da peça grava '… (Gilmar)'; sem operador, 428", async () => {
    // O login de teste da Gráfica ganha um operador: a trilha da peça diz quem.
    const { cacheDeOperadores } = await import("../routes/operadores");
    const [op] = await banco.consultar<{ id: string }>(`INSERT INTO operadores (user_id, nome) VALUES ($1, 'Gilmar') RETURNING id`, [USUARIOS.grafica.id]);
    cacheDeOperadores.esquecer(USUARIOS.grafica.id);
    await semearEvento(banco, "ev-op", "COPA OPERADORES", 30);
    await semearPeca(banco, { id: "op-p1", eventId: "ev-op", displayId: "#0901", status: "ready_for_production", quantity: 2 });

    const sem = await appReal.chamar(USUARIOS.grafica, "PATCH", "/api/items/op-p1/start-printing", { printMachine: "2" });
    expect(sem.status).toBe(428);

    const com = await appReal.chamar({ ...USUARIOS.grafica, operador: { id: op.id, nome: "Gilmar" } }, "PATCH", "/api/items/op-p1/start-printing", { printMachine: "2" });
    expect(com.status, JSON.stringify(com.corpo)).toBe(200);
    const linhas = await banco.consultar<{ user_name: string; user_id: string }>(`SELECT user_name, user_id FROM audit_logs WHERE entity_type = 'item' AND entity_id = 'op-p1'`);
    expect(linhas.length).toBeGreaterThan(0);
    for (const l of linhas) expect(l).toEqual({ user_name: "Gil Gráfica (Gilmar)", user_id: USUARIOS.grafica.id });
    // O colega de outro login segue sem operador nenhum.
    await semearPeca(banco, { id: "op-p2", eventId: "ev-op", displayId: "#0902", status: "ready_for_production", quantity: 1 });
    expect((await appReal.chamar(USUARIOS.grafica2, "PATCH", "/api/items/op-p2/start-printing", { printMachine: "3" })).status).toBe(200);
  });
});
