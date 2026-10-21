// ─────────────────────────────────────────────────────────────────────────────
// OPERADORES NO LOGIN COMPARTILHADO — as peças do servidor que não falam com o
// banco direto (dono, 21/10). Regras puras em shared/operadores.ts; rotas em
// server/routes/operadores.ts.
//
// O QUE ACONTECE EM CADA REQUISIÇÃO (identidadeDoOperador, logo depois de
// server/routes.ts preencher req.userName/req.userRole):
//   · login SEM operadores ativos → nada muda (Kit, Arte, admin, todo mundo);
//   · login COM operadores e operador escolhido (e o turno ainda vale) →
//     req.userName vira "Produção Grafica (Gilmar)". Como TODA trilha, "quem
//     embalou", "quem entregou", registro de impressão etc. já gravam
//     req.userName (resolveActor(req)), o nome efetivo chega a tudo sem mexer
//     em rota nenhuma;
//   · login COM operadores e SEM operador → leitura segue; escrita responde 428
//     "Escolha quem está operando" (menos as rotas de login e de operador).
//
// O turno vence por inatividade (2 h sem ação gravada) ou duração (12 h) —
// shared/operadores.ts. Quem vence é tirado da sessão AQUI, na primeira
// requisição depois do prazo, e a saída entra na trilha.
// ─────────────────────────────────────────────────────────────────────────────
import { createHash } from "crypto";
import type { Request, Response, NextFunction } from "express";
import {
  BLOQUEIO_DO_PIN_MS,
  CODIGO_OPERADOR_NECESSARIO,
  TENTATIVAS_DE_PIN,
  nomeComOperador,
  situacaoDoTurno,
  type MotivoDoFim,
} from "@shared/operadores";

declare module "express-session" {
  interface SessionData {
    /** Quem está na máquina neste login compartilhado (operadores.id). */
    operadorId?: string;
    operadorNome?: string;
    /** ms — quando assumiu (base do teto de 12 h). */
    operadorEntrouEm?: number;
    /** ms — a última ESCRITA dele (base das 2 h de inatividade). */
    operadorUltimaAcaoEm?: number;
  }
}

declare global {
  namespace Express {
    interface Request {
      /** O login tem operadores ativos (Produção Grafica): escrever exige escolher quem opera. */
      loginComOperadores?: boolean;
      operadorId?: string;
      operadorNome?: string;
    }
  }
}

export interface OperadorAtivo { id: string; nome: string }

// ── Cache de "este login tem operadores?" ───────────────────────────────────
// Toda requisição autenticada pergunta. Sem cache, seria uma consulta a mais
// em cada chamada de cada pessoa do sistema — para responder "não" a quase
// todas. 30 s por cópia; o admin que muda operadores esquece na hora (nesta
// cópia; as outras alcançam em até 30 s).
export const CACHE_DE_OPERADORES_MS = 30_000;

export function criarCacheDeOperadores(
  consultar: (userId: string) => Promise<OperadorAtivo[]>,
  agora: () => number = Date.now,
  ttl = CACHE_DE_OPERADORES_MS,
) {
  const cache = new Map<string, { lista: OperadorAtivo[]; ate: number }>();
  let avisou = false;
  return {
    async ativos(userId: string): Promise<OperadorAtivo[]> {
      const t = agora();
      const c = cache.get(userId);
      if (c && c.ate > t) return c.lista;
      try {
        const lista = await consultar(userId);
        cache.set(userId, { lista, ate: t + ttl });
        if (cache.size > 5000) cache.forEach((v, k) => { if (v.ate <= t) cache.delete(k); });
        return lista;
      } catch (erro) {
        // Tabela ainda não migrada (código publicado antes da 0008) ou banco
        // fora: o app NÃO pode parar por causa disto — segue como login comum.
        if (!avisou) {
          avisou = true;
          console.warn("[operadores] não deu para ler os operadores (a migração 0008 rodou?) — seguindo sem exigir operador:", (erro as Error)?.message ?? erro);
        }
        return [];
      }
    },
    esquecer(userId?: string) {
      if (userId) cache.delete(userId); else cache.clear();
    },
  };
}
export type CacheDeOperadores = ReturnType<typeof criarCacheDeOperadores>;

// ── Sessão ─────────────────────────────────────────────────────────────────
type SessaoComOperador = {
  userId?: string;
  userName?: string;
  operadorId?: string;
  operadorNome?: string;
  operadorEntrouEm?: number;
  operadorUltimaAcaoEm?: number;
};

export function colocarOperador(sessao: SessaoComOperador, op: OperadorAtivo, agora: number): void {
  sessao.operadorId = op.id;
  sessao.operadorNome = op.nome;
  sessao.operadorEntrouEm = agora;
  sessao.operadorUltimaAcaoEm = agora;
}

export function tirarOperador(sessao: SessaoComOperador): void {
  delete sessao.operadorId;
  delete sessao.operadorNome;
  delete sessao.operadorEntrouEm;
  delete sessao.operadorUltimaAcaoEm;
}

// ── Hora de Brasília para as frases da trilha ("assumiu às 13:02") ─────────
const HORA = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
export const horaDeBrasilia = (ms: number) => HORA.format(new Date(ms));

/** A frase da saída na trilha. */
export function fraseDaSaida(nome: string, quando: number, motivo: MotivoDoFim | "almoco" | "fim-do-turno" | "troca" | "sair", extra?: { ultimaAcaoEm?: number; quemAssumiu?: string }): string {
  switch (motivo) {
    case "almoco": return `${nome} saiu às ${horaDeBrasilia(quando)} (almoço)`;
    case "fim-do-turno": return `${nome} saiu às ${horaDeBrasilia(quando)} (fim do turno)`;
    case "troca": return `${nome} saiu às ${horaDeBrasilia(quando)} — ${extra?.quemAssumiu ?? "outro operador"} assumiu a máquina`;
    case "ocioso": return `${nome} saiu por inatividade — sem nenhuma ação desde as ${horaDeBrasilia(extra?.ultimaAcaoEm ?? quando)}`;
    case "turno": return `${nome} saiu: o turno passou de 12 horas (pedimos o PIN de novo)`;
    case "desativado": return `${nome} saiu: o operador foi desativado pelo administrador`;
    default: return `${nome} saiu às ${horaDeBrasilia(quando)}`;
  }
}

// ── O middleware ──────────────────────────────────────────────────────────
const ESCRITA = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Escritas que não pedem operador: entrar/sair do login e escolher o operador. */
export function rotaLivreDeOperador(caminho: string): boolean {
  return caminho.startsWith("/api/auth/") || caminho === "/api/operadores" || caminho.startsWith("/api/operadores/");
}

export interface SaidaAutomatica {
  userId: string;
  nomeDoLogin: string;
  operadorId: string;
  nome: string;
  motivo: MotivoDoFim;
  ultimaAcaoEm?: number;
  quando: number;
}

export function identidadeDoOperador(deps: {
  cache: Pick<CacheDeOperadores, "ativos">;
  /** Grava na trilha a saída por inatividade/turno/desativação. Falha não derruba a requisição. */
  registrarSaida?: (s: SaidaAutomatica) => Promise<void>;
  agora?: () => number;
}) {
  const agora = deps.agora ?? Date.now;
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const sessao = req.session as (Request["session"] & SessaoComOperador) | undefined;
      if (!sessao?.userId) return next();
      const ativos = await deps.cache.ativos(sessao.userId);
      if (ativos.length === 0) {
        // Login sem operadores (ou todos desativados): nada a pedir. Um resto
        // de operador na sessão não pode continuar mudando o nome da trilha.
        if (sessao.operadorId) tirarOperador(sessao);
        return next();
      }
      req.loginComOperadores = true;
      const t = agora();

      if (sessao.operadorId) {
        const op = ativos.find((o) => o.id === sessao.operadorId);
        const situacao = op
          ? situacaoDoTurno({ entrouEm: sessao.operadorEntrouEm, ultimaAcaoEm: sessao.operadorUltimaAcaoEm }, t)
          : ({ valido: false, motivo: "desativado" } as const);
        if (situacao.valido && op) {
          req.operadorId = op.id;
          req.operadorNome = op.nome;
          // Renomeado pelo admin: a sessão acompanha o nome atual.
          if (sessao.operadorNome !== op.nome) sessao.operadorNome = op.nome;
          req.userName = nomeComOperador(req.userName || sessao.userName || "Sistema", op.nome);
          if (ESCRITA.has(req.method) && req.path.startsWith("/api/") && !rotaLivreDeOperador(req.path)) {
            sessao.operadorUltimaAcaoEm = t;
          }
          return next();
        }
        const saida: SaidaAutomatica = {
          userId: sessao.userId,
          nomeDoLogin: sessao.userName || "Sistema",
          operadorId: sessao.operadorId,
          nome: sessao.operadorNome || op?.nome || "Operador",
          motivo: situacao.valido ? "turno" : situacao.motivo,
          ultimaAcaoEm: sessao.operadorUltimaAcaoEm,
          quando: t,
        };
        tirarOperador(sessao);
        if (deps.registrarSaida) {
          await deps.registrarSaida(saida).catch((e) => console.error("[operadores] saída automática não registrada:", e));
        }
      }

      if (ESCRITA.has(req.method) && req.path.startsWith("/api/") && !rotaLivreDeOperador(req.path)) {
        return res.status(428).json({
          error: "Escolha quem está operando antes de continuar — toque em seu nome e digite seu PIN.",
          codigo: CODIGO_OPERADOR_NECESSARIO,
        });
      }
      next();
    } catch (erro) {
      next(erro);
    }
  };
}

// ── PIN errado: a contagem na tabela limite_de_tentativas (migração 0002) ──
// Mesma tabela do limite de login, chave própria e com hash (o id do operador
// não fica em claro). Diferença do login: aqui só o ERRO conta — o acerto
// zera —, e o bloqueio conta a partir do 5º erro, não do 1º.
type Consulta = (sql: string, params: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;

export const chaveDoPin = (operadorId: string) => createHash("sha256").update(`pin-operador:${operadorId}`).digest("hex");

const SQL_CONTAR_ERRO = `
INSERT INTO limite_de_tentativas AS l (chave, contagem, reinicia_em)
VALUES ($1, 1, now() + $2::int * interval '1 millisecond')
ON CONFLICT (chave) DO UPDATE SET
  contagem = CASE WHEN l.reinicia_em <= now() THEN 1 ELSE l.contagem + 1 END,
  reinicia_em = CASE WHEN l.reinicia_em <= now() THEN EXCLUDED.reinicia_em ELSE l.reinicia_em END
RETURNING contagem`;

/** Operadores bloqueados agora → até quando. */
export async function bloqueiosDoPin(consultar: Consulta, operadorIds: string[]): Promise<Map<string, Date>> {
  const fora = new Map<string, Date>();
  if (operadorIds.length === 0) return fora;
  const porChave = new Map(operadorIds.map((id) => [chaveDoPin(id), id]));
  const { rows } = await consultar(
    `SELECT chave, reinicia_em FROM limite_de_tentativas WHERE chave = ANY($1::text[]) AND reinicia_em > now() AND contagem >= $2`,
    [Array.from(porChave.keys()), TENTATIVAS_DE_PIN],
  );
  for (const r of rows) {
    const id = porChave.get(String(r.chave));
    if (id) fora.set(id, new Date(r.reinicia_em as string | Date));
  }
  return fora;
}

/** Conta um PIN errado. No 5º, o bloqueio passa a valer 15 min a partir de agora. */
export async function registrarPinErrado(consultar: Consulta, operadorId: string): Promise<{ erros: number; bloqueadoAte: Date | null }> {
  const chave = chaveDoPin(operadorId);
  const { rows } = await consultar(SQL_CONTAR_ERRO, [chave, BLOQUEIO_DO_PIN_MS]);
  const erros = Number(rows?.[0]?.contagem ?? 1);
  if (erros < TENTATIVAS_DE_PIN) return { erros, bloqueadoAte: null };
  const { rows: r2 } = await consultar(
    `UPDATE limite_de_tentativas SET reinicia_em = now() + $2::int * interval '1 millisecond' WHERE chave = $1 RETURNING reinicia_em`,
    [chave, BLOQUEIO_DO_PIN_MS],
  );
  return { erros, bloqueadoAte: new Date(r2[0].reinicia_em as string | Date) };
}

export async function zerarErrosDoPin(consultar: Consulta, operadorId: string): Promise<void> {
  await consultar(`DELETE FROM limite_de_tentativas WHERE chave = $1`, [chaveDoPin(operadorId)]);
}
