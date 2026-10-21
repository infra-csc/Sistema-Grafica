// ─────────────────────────────────────────────────────────────────────────────
// OPERADORES NO LOGIN COMPARTILHADO — as rotas (dono, 21/10).
//
// Quem está na máquina (sessão do login compartilhado):
//   GET  /api/operadores                → o estado: precisa escolher? quem está? os cartões
//   POST /api/operadores/entrar         → { operadorId, pin } assume a máquina
//   POST /api/operadores/definir-pin    → { operadorId, pin, confirmacao } primeiro acesso:
//                                         só quando o operador ainda NÃO tem PIN
//   POST /api/operadores/sair           → { motivo?: "almoco" | "fim-do-turno" } volta
//                                         para "Quem está na máquina?" sem deslogar
//
// Administração (só admin — o admin NUNCA vê nem digita o PIN de ninguém):
//   GET   /api/users/:id/operadores
//   POST  /api/users/:id/operadores      → { nome }
//   PATCH /api/operadores/:id            → { nome?, ativo? }
//   POST  /api/operadores/:id/redefinir-pin → limpa o PIN; o operador cria outro no próximo acesso
//
// A trilha registra entradas e saídas de turno (entityType "operador"):
// "Gilmar assumiu a máquina às 13:02", "Gilmar saiu às 12:00 (almoço)".
// ─────────────────────────────────────────────────────────────────────────────
import type { Express, Request } from "express";
import bcrypt from "bcryptjs";
import { pool } from "../db";
import { requireAuth, requireAdmin, createAuditLog, sendSensitiveError } from "./shared";
import {
  TENTATIVAS_DE_PIN,
  limparNomeDoOperador,
  nomeComOperador,
  problemaNoNomeDoOperador,
  problemaNoPin,
  situacaoDoTurno,
  OCIOSO_MS,
  TURNO_MAX_MS,
  type EstadoDosOperadores,
  type OperadorDoAdmin,
} from "@shared/operadores";
import {
  bloqueiosDoPin,
  colocarOperador,
  criarCacheDeOperadores,
  fraseDaSaida,
  horaDeBrasilia,
  identidadeDoOperador,
  registrarPinErrado,
  tirarOperador,
  zerarErrosDoPin,
  type OperadorAtivo,
  type SaidaAutomatica,
} from "../operadores";

type Linha = Record<string, unknown>;
const consultar = (sql: string, params: unknown[]) => pool.query(sql, params) as unknown as Promise<{ rows: Linha[]; rowCount?: number | null }>;

/** O cache de "este login tem operadores?" — um por cópia do servidor. */
export const cacheDeOperadores = criarCacheDeOperadores(async (userId) => {
  const { rows } = await consultar(`SELECT id, nome FROM operadores WHERE user_id = $1 AND ativo ORDER BY nome`, [userId]);
  return rows.map((r) => ({ id: String(r.id), nome: String(r.nome) }));
});

/** Trilha da saída automática (inatividade, 12 h, desativado). */
async function registrarSaidaAutomatica(s: SaidaAutomatica): Promise<void> {
  await createAuditLog(
    { userName: nomeComOperador(s.nomeDoLogin, s.nome), userId: s.userId },
    "turno_fim", "operador", s.operadorId,
    fraseDaSaida(s.nome, s.quando, s.motivo, { ultimaAcaoEm: s.ultimaAcaoEm }),
  );
}

/** O middleware que server/routes.ts (e o app dos testes) monta logo depois da identidade. */
export function montarIdentidadeDoOperador() {
  return identidadeDoOperador({ cache: cacheDeOperadores, registrarSaida: registrarSaidaAutomatica });
}

const salvarSessao = (req: Request) => new Promise<void>((ok, falhou) => req.session.save((e) => (e ? falhou(e) : ok())));

interface OperadorDoBanco { id: string; userId: string; nome: string; temPin: boolean; pinHash: string | null; ativo: boolean; criadoEm: Date; atualizadoEm: Date }
const doBanco = (r: Linha): OperadorDoBanco => ({
  id: String(r.id), userId: String(r.user_id), nome: String(r.nome), pinHash: (r.pin_hash as string | null) ?? null,
  temPin: r.pin_hash != null, ativo: r.ativo === true, criadoEm: new Date(r.criado_em as string), atualizadoEm: new Date(r.atualizado_em as string),
});

/** Operador ATIVO deste login (nunca de outro login — a sessão diz qual). */
async function operadorDoLogin(userId: string, operadorId: string): Promise<OperadorDoBanco | null> {
  const { rows } = await consultar(`SELECT * FROM operadores WHERE id = $1 AND user_id = $2 AND ativo`, [operadorId, userId]);
  return rows[0] ? doBanco(rows[0]) : null;
}

const mensagemDeBloqueio = (nome: string, ate: Date) =>
  `O PIN de ${nome} está bloqueado depois de ${TENTATIVAS_DE_PIN} tentativas erradas. Tente de novo às ${horaDeBrasilia(ate.getTime())} ou peça ao administrador para redefinir o PIN.`;

/** O estado que a tela "Quem está na máquina?" e o selo do topo leem. */
async function estadoDaSessao(req: Request): Promise<EstadoDosOperadores> {
  const userId = req.session.userId!;
  const login = req.session.userName || "Sistema";
  const { rows } = await consultar(`SELECT * FROM operadores WHERE user_id = $1 AND ativo ORDER BY lower(nome)`, [userId]);
  const lista = rows.map(doBanco);
  if (lista.length === 0) return { exigeOperador: false, login, atual: null, operadores: [] };
  const bloqueios = await bloqueiosDoPin(consultar, lista.map((o) => o.id));
  const s = req.session;
  let atual: EstadoDosOperadores["atual"] = null;
  const op = s.operadorId ? lista.find((o) => o.id === s.operadorId) : undefined;
  if (op) {
    const sit = situacaoDoTurno({ entrouEm: s.operadorEntrouEm, ultimaAcaoEm: s.operadorUltimaAcaoEm }, Date.now());
    if (sit.valido) atual = { id: op.id, nome: op.nome, entrouEm: new Date(s.operadorEntrouEm!).toISOString(), expiraEm: new Date(sit.expiraEm).toISOString() };
  }
  return {
    exigeOperador: true,
    login,
    atual,
    operadores: lista.map((o) => ({ id: o.id, nome: o.nome, temPin: o.temPin, bloqueadoAte: bloqueios.get(o.id)?.toISOString() ?? null })),
  };
}

/** Coloca o operador na sessão e grava a troca na trilha. */
async function assumir(req: Request, op: OperadorAtivo): Promise<void> {
  const s = req.session;
  const t = Date.now();
  const login = s.userName || "Sistema";
  const anterior = s.operadorId && s.operadorId !== op.id ? { id: s.operadorId, nome: s.operadorNome || "Operador" } : null;
  const mesmo = s.operadorId === op.id;
  colocarOperador(s, op, t);
  await salvarSessao(req);
  if (anterior) {
    await createAuditLog(
      { userName: nomeComOperador(login, anterior.nome), userId: s.userId },
      "turno_fim", "operador", anterior.id,
      fraseDaSaida(anterior.nome, t, "troca", { quemAssumiu: op.nome }),
    );
  }
  // Quem só confirmou o próprio PIN de novo (Trocar → escolheu a si mesmo)
  // não abre turno novo na trilha.
  if (!mesmo) {
    await createAuditLog(
      { userName: nomeComOperador(login, op.nome), userId: s.userId },
      "turno_inicio", "operador", op.id,
      `${op.nome} assumiu a máquina às ${horaDeBrasilia(t)}`,
    );
  }
}

/** Tira o operador das sessões abertas (PIN redefinido): ele precisa entrar com o PIN novo. */
async function tirarDasSessoes(operadorId: string): Promise<number> {
  try {
    const r = await consultar(
      `UPDATE session SET sess = (sess::jsonb - 'operadorId' - 'operadorNome' - 'operadorEntrouEm' - 'operadorUltimaAcaoEm')::json
        WHERE sess->>'operadorId' = $1`,
      [operadorId],
    );
    return r.rowCount ?? 0;
  } catch (erro) {
    console.error("[operadores] não deu para tirar o operador das sessões:", (erro as Error)?.message ?? erro);
    return 0;
  }
}

/** Quem está na máquina agora, em alguma sessão (para o selo "Na máquina" do admin). */
async function naMaquinaAgora(operadorIds: string[]): Promise<Set<string>> {
  if (operadorIds.length === 0) return new Set();
  try {
    const agora = Date.now();
    const { rows } = await consultar(
      `SELECT DISTINCT sess->>'operadorId' AS id FROM session
        WHERE expire > now() AND sess->>'operadorId' = ANY($1::text[])
          AND (sess->>'operadorUltimaAcaoEm')::bigint > $2
          AND (sess->>'operadorEntrouEm')::bigint > $3`,
      [operadorIds, agora - OCIOSO_MS, agora - TURNO_MAX_MS],
    );
    return new Set(rows.map((r) => String(r.id)));
  } catch {
    return new Set();
  }
}

async function paraOAdmin(lista: OperadorDoBanco[]): Promise<OperadorDoAdmin[]> {
  const ids = lista.map((o) => o.id);
  const [bloqueios, naMaquina] = await Promise.all([bloqueiosDoPin(consultar, ids), naMaquinaAgora(ids)]);
  return lista.map((o) => ({
    id: o.id, nome: o.nome, ativo: o.ativo, temPin: o.temPin,
    bloqueadoAte: bloqueios.get(o.id)?.toISOString() ?? null,
    naMaquina: o.ativo && naMaquina.has(o.id),
    criadoEm: o.criadoEm.toISOString(), atualizadoEm: o.atualizadoEm.toISOString(),
  }));
}

async function nomeDoLogin(userId: string): Promise<string | null> {
  const { rows } = await consultar(`SELECT name FROM users WHERE id = $1`, [userId]);
  return rows[0] ? String(rows[0].name) : null;
}

/** Mesmo nome (sem diferenciar maiúsculas) já existe neste login? */
async function homonimo(userId: string, nome: string, excetoId?: string): Promise<{ id: string; ativo: boolean } | null> {
  const { rows } = await consultar(
    `SELECT id, ativo FROM operadores WHERE user_id = $1 AND lower(nome) = lower($2) AND ($3::text IS NULL OR id <> $3) LIMIT 1`,
    [userId, nome, excetoId ?? null],
  );
  return rows[0] ? { id: String(rows[0].id), ativo: rows[0].ativo === true } : null;
}

export function registerOperadorRoutes(app: Express): void {
  // ── Quem está na máquina ────────────────────────────────────────────────
  app.get("/api/operadores", requireAuth, async (req, res) => {
    try {
      res.json(await estadoDaSessao(req));
    } catch (error: unknown) {
      sendSensitiveError(res, error, "Estado dos operadores", 500);
    }
  });

  app.post("/api/operadores/entrar", requireAuth, async (req, res) => {
    try {
      const { operadorId, pin } = req.body ?? {};
      if (typeof operadorId !== "string" || typeof pin !== "string" || !pin) {
        return res.status(400).json({ error: "Escolha o seu nome e digite o seu PIN." });
      }
      const op = await operadorDoLogin(req.session.userId!, operadorId);
      if (!op) return res.status(404).json({ error: "Este operador não está mais neste login. Atualize a tela." });
      if (!op.pinHash) {
        return res.status(409).json({ error: `${op.nome} ainda não tem PIN — crie o seu agora.`, codigo: "sem-pin" });
      }
      const bloqueio = (await bloqueiosDoPin(consultar, [op.id])).get(op.id);
      if (bloqueio) return res.status(423).json({ error: mensagemDeBloqueio(op.nome, bloqueio), bloqueadoAte: bloqueio.toISOString() });

      if (!(await bcrypt.compare(pin, op.pinHash))) {
        const { erros, bloqueadoAte } = await registrarPinErrado(consultar, op.id);
        if (bloqueadoAte) {
          await createAuditLog(
            { userName: req.session.userName || "Sistema", userId: req.session.userId },
            "pin_bloqueado", "operador", op.id,
            `PIN de ${op.nome} bloqueado até as ${horaDeBrasilia(bloqueadoAte.getTime())} depois de ${TENTATIVAS_DE_PIN} tentativas erradas`,
          );
          return res.status(423).json({ error: mensagemDeBloqueio(op.nome, bloqueadoAte), bloqueadoAte: bloqueadoAte.toISOString() });
        }
        const restam = TENTATIVAS_DE_PIN - erros;
        // 403 e não 401: a SESSÃO vale; 401 faria a tela mandar para o login.
        return res.status(403).json({
          error: `PIN incorreto. ${restam === 1 ? "Resta 1 tentativa" : `Restam ${restam} tentativas`} antes de bloquear por 15 minutos.`,
          restantes: restam,
        });
      }
      await zerarErrosDoPin(consultar, op.id);
      await assumir(req, op);
      res.json(await estadoDaSessao(req));
    } catch (error: unknown) {
      sendSensitiveError(res, error, "Entrar como operador", 500);
    }
  });

  app.post("/api/operadores/definir-pin", requireAuth, async (req, res) => {
    try {
      const { operadorId, pin, confirmacao } = req.body ?? {};
      if (typeof operadorId !== "string") return res.status(400).json({ error: "Escolha o seu nome." });
      const problema = problemaNoPin(pin);
      if (problema) return res.status(400).json({ error: problema });
      if (pin !== confirmacao) return res.status(400).json({ error: "Os dois PINs não são iguais — digite de novo." });
      const op = await operadorDoLogin(req.session.userId!, operadorId);
      if (!op) return res.status(404).json({ error: "Este operador não está mais neste login. Atualize a tela." });
      if (op.pinHash) return res.status(409).json({ error: `${op.nome} já tem PIN — digite o PIN dele.`, codigo: "ja-tem-pin" });

      const hash = await bcrypt.hash(pin, 10);
      // Só grava se continua SEM PIN: dois tablets criando ao mesmo tempo não
      // trocam o PIN um do outro.
      const r = await consultar(
        `UPDATE operadores SET pin_hash = $1, atualizado_em = now() WHERE id = $2 AND user_id = $3 AND ativo AND pin_hash IS NULL RETURNING id`,
        [hash, op.id, req.session.userId],
      );
      if ((r.rowCount ?? r.rows.length) === 0) return res.status(409).json({ error: `${op.nome} já tem PIN — digite o PIN dele.`, codigo: "ja-tem-pin" });
      await zerarErrosDoPin(consultar, op.id);
      await createAuditLog(
        { userName: nomeComOperador(req.session.userName || "Sistema", op.nome), userId: req.session.userId },
        "pin_criado", "operador", op.id,
        `${op.nome} criou o próprio PIN (primeiro acesso)`,
      );
      await assumir(req, op);
      res.json(await estadoDaSessao(req));
    } catch (error: unknown) {
      sendSensitiveError(res, error, "Criar PIN do operador", 500);
    }
  });

  app.post("/api/operadores/sair", requireAuth, async (req, res) => {
    try {
      const s = req.session;
      const motivo = req.body?.motivo === "almoco" || req.body?.motivo === "fim-do-turno" ? req.body.motivo : "sair";
      if (s.operadorId) {
        const t = Date.now();
        const nome = s.operadorNome || "Operador";
        const id = s.operadorId;
        tirarOperador(s);
        await salvarSessao(req);
        await createAuditLog(
          { userName: nomeComOperador(s.userName || "Sistema", nome), userId: s.userId },
          "turno_fim", "operador", id,
          fraseDaSaida(nome, t, motivo),
        );
      }
      res.json(await estadoDaSessao(req));
    } catch (error: unknown) {
      sendSensitiveError(res, error, "Sair do operador", 500);
    }
  });

  // ── Administração ───────────────────────────────────────────────────────
  app.get("/api/users/:id/operadores", requireAdmin, async (req, res) => {
    try {
      if (!(await nomeDoLogin(req.params.id))) return res.status(404).json({ error: "Usuário não encontrado" });
      const { rows } = await consultar(`SELECT * FROM operadores WHERE user_id = $1 ORDER BY ativo DESC, lower(nome)`, [req.params.id]);
      res.json(await paraOAdmin(rows.map(doBanco)));
    } catch (error: unknown) {
      sendSensitiveError(res, error, "Listar operadores", 500);
    }
  });

  app.post("/api/users/:id/operadores", requireAdmin, async (req, res) => {
    try {
      const problema = problemaNoNomeDoOperador(req.body?.nome);
      if (problema) return res.status(400).json({ error: problema });
      const nome = limparNomeDoOperador(String(req.body.nome));
      const login = await nomeDoLogin(req.params.id);
      if (!login) return res.status(404).json({ error: "Usuário não encontrado" });
      const igual = await homonimo(req.params.id, nome);
      if (igual) {
        return res.status(409).json({ error: igual.ativo ? `Já existe ${nome} neste login.` : `${nome} já existe neste login, desativado — reative na lista em vez de criar outro.` });
      }
      const { rows } = await consultar(`INSERT INTO operadores (user_id, nome) VALUES ($1, $2) RETURNING *`, [req.params.id, nome]);
      cacheDeOperadores.esquecer(req.params.id);
      const op = doBanco(rows[0]);
      await createAuditLog(req, "created", "operador", op.id, `Operador "${nome}" adicionado ao login "${login}" — cria o próprio PIN no primeiro acesso`);
      res.status(201).json((await paraOAdmin([op]))[0]);
    } catch (error: unknown) {
      sendSensitiveError(res, error, "Adicionar operador", 500);
    }
  });

  app.patch("/api/operadores/:id", requireAdmin, async (req, res) => {
    try {
      const { rows: [linha] } = await consultar(`SELECT * FROM operadores WHERE id = $1`, [req.params.id]);
      if (!linha) return res.status(404).json({ error: "Operador não encontrado" });
      const op = doBanco(linha);
      const mudancas: string[] = [];
      let nome = op.nome;
      if (req.body?.nome !== undefined) {
        const problema = problemaNoNomeDoOperador(req.body.nome);
        if (problema) return res.status(400).json({ error: problema });
        nome = limparNomeDoOperador(String(req.body.nome));
        if (nome !== op.nome) {
          const igual = await homonimo(op.userId, nome, op.id);
          if (igual) return res.status(409).json({ error: `Já existe ${nome} neste login.` });
          mudancas.push(`renomeado de "${op.nome}" para "${nome}"`);
        }
      }
      let ativo = op.ativo;
      if (req.body?.ativo !== undefined) {
        if (typeof req.body.ativo !== "boolean") return res.status(400).json({ error: "Valor inválido para ativo" });
        ativo = req.body.ativo;
        if (ativo !== op.ativo) mudancas.push(ativo ? "reativado" : "desativado (não aparece mais na escolha)");
      }
      if (mudancas.length === 0) return res.json((await paraOAdmin([op]))[0]);
      const { rows } = await consultar(
        `UPDATE operadores SET nome = $2, ativo = $3, atualizado_em = now() WHERE id = $1 RETURNING *`,
        [op.id, nome, ativo],
      );
      cacheDeOperadores.esquecer(op.userId);
      await createAuditLog(req, "updated", "operador", op.id, `Operador "${op.nome}" ${mudancas.join(" e ")}`);
      res.json((await paraOAdmin([doBanco(rows[0])]))[0]);
    } catch (error: unknown) {
      sendSensitiveError(res, error, "Alterar operador", 500);
    }
  });

  app.post("/api/operadores/:id/redefinir-pin", requireAdmin, async (req, res) => {
    try {
      const { rows } = await consultar(
        `UPDATE operadores SET pin_hash = NULL, atualizado_em = now() WHERE id = $1 RETURNING *`,
        [req.params.id],
      );
      if (!rows[0]) return res.status(404).json({ error: "Operador não encontrado" });
      const op = doBanco(rows[0]);
      await zerarErrosDoPin(consultar, op.id);
      const tirados = await tirarDasSessoes(op.id);
      cacheDeOperadores.esquecer(op.userId);
      await createAuditLog(
        req, "pin_redefinido", "operador", op.id,
        `PIN de ${op.nome} redefinido pelo administrador — ${op.nome} cria um novo no próximo acesso`
        + (tirados > 0 ? ` (estava na máquina e precisou entrar de novo)` : ""),
      );
      res.json((await paraOAdmin([op]))[0]);
    } catch (error: unknown) {
      sendSensitiveError(res, error, "Redefinir PIN do operador", 500);
    }
  });
}
