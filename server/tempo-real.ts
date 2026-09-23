// ─────────────────────────────────────────────────────────────────────────────
// TEMPO REAL ENTRE CÓPIAS DO SERVIDOR.
//
// O deploy é autoscale: o Replit sobe várias cópias do processo, e cada
// navegador fica conectado (WebSocket) a UMA delas. Antes, broadcast() só
// falava com os sockets da própria cópia — a conferência feita por quem caiu
// na cópia A não chegava à Gráfica de quem estava na cópia B, e o cache de
// eventos da B seguia servindo o dado velho.
//
// Agora:
//   1. broadcast(msg) recorta a mensagem num SINAL (shared/ws-mensagens.ts),
//      invalida os caches e entrega aos sockets DESTA cópia na hora;
//   2. publica o sinal no canal do Postgres (NOTIFY);
//   3. cada outra cópia, ouvindo o canal (LISTEN) numa conexão dedicada, faz
//      o passo 1 do lado dela. A própria mensagem volta pelo canal e é
//      ignorada pela origem.
// Invalidações de cache de outros módulos (cache.ts → invalidarCacheNoCluster)
// e o "sessões encerradas" viajam pelo mesmo canal.
//
// A conexão do LISTEN é FORA do pool (o pool de 10 é das requisições) e vai
// direto ao Postgres: o endereço "-pooler" do Neon (PgBouncer em modo
// transação) não entrega NOTIFY. Cai → reconecta com espera crescente; ao
// voltar, esta cópia limpa os caches e manda `resync` aos seus sockets (o que
// passou durante a queda não chegou aqui).
//
// Sem DATABASE_URL, em teste ou com TEMPO_REAL_CANAL=off, fica tudo local
// (uma cópia só) — exatamente o comportamento antigo.
// ─────────────────────────────────────────────────────────────────────────────
import { WebSocket } from "ws";
import {
  recortarParaSinal,
  sinalParaKit,
  type MensagemWS,
  type SinalWS,
} from "@shared/ws-mensagens";
import {
  definirPublicadorDeInvalidacao,
  invalidarCacheLocal,
  invalidarCachesDaMensagem,
  invalidateAllCaches,
} from "./cache";
import { sessoesEncerradas } from "./sessoes-encerradas";

/** Socket do app: guarda quem é, para o recorte do Kit e o "sessões encerradas". */
export type SocketDoApp = WebSocket & { isAlive?: boolean; userId?: string; userKit?: boolean };

export const wsClients = new Set<SocketDoApp>();

export const CANAL_DO_TEMPO_REAL = "grafica_tempo_real";
/** O NOTIFY aceita até 8000 bytes; acima disto vai só o tipo. */
export const LIMITE_DO_NOTIFY = 7900;
const ESPERA_MIN_MS = 1_000;
const ESPERA_MAX_MS = 60_000;
/** Consulta boba de tempos em tempos: descobre conexão morta sem esperar o próximo NOTIFY. */
const PULSO_MS = 4 * 60_000;

export const ID_DESTA_COPIA = `${process.pid}-${Math.random().toString(36).slice(2, 8)}`;

type Envelope =
  | { o: string; k: "ws"; s: SinalWS }
  | { o: string; k: "cache"; c: string }
  | { o: string; k: "encerradas"; u: string };

// ── Entrega aos sockets desta cópia ─────────────────────────────────────────

/** Entrega o sinal aos sockets abertos aqui. O do Kit vai sem os textos de aviso. */
export function entregarAosSockets(sinal: SinalWS): void {
  let cheio: string | null = null;
  let doKit: string | null = null;
  wsClients.forEach((cliente) => {
    if (cliente.readyState !== WebSocket.OPEN) return;
    if (cliente.userKit) {
      doKit ??= JSON.stringify(sinalParaKit(sinal));
      cliente.send(doKit);
    } else {
      cheio ??= JSON.stringify(sinal);
      cliente.send(cheio);
    }
  });
}

/** Fecha os sockets do usuário nesta cópia (sessão encerrada). */
export function fecharSocketsDoUsuario(userId: string): number {
  let fechados = 0;
  wsClients.forEach((cliente) => {
    if (cliente.userId !== userId) return;
    wsClients.delete(cliente);
    try { cliente.close(4001, "sessao encerrada"); } catch { /* já caiu */ }
    fechados += 1;
  });
  return fechados;
}

/** broadcast(): aqui na hora; nas outras cópias, pelo canal. */
export function publicarMensagem(msg: MensagemWS): void {
  const sinal = recortarParaSinal(msg);
  invalidarCachesDaMensagem(sinal.type);
  entregarAosSockets(sinal);
  enviarAoCanal({ o: ID_DESTA_COPIA, k: "ws", s: sinal });
}

// ── O que chega do canal ─────────────────────────────────────────────────────

/** Trata um envelope vindo de outra cópia. Exportado para teste. */
export function receberDoCanal(payload: string): void {
  let env: Envelope;
  try {
    env = JSON.parse(payload);
  } catch {
    return;
  }
  if (!env || env.o === ID_DESTA_COPIA) return;
  if (env.k === "ws" && env.s && typeof env.s.type === "string") {
    invalidarCachesDaMensagem(env.s.type);
    entregarAosSockets(env.s);
  } else if (env.k === "cache" && typeof env.c === "string") {
    invalidarCacheLocal(env.c);
  } else if (env.k === "encerradas" && typeof env.u === "string") {
    fecharSocketsDoUsuario(env.u);
  }
}

/** O texto do NOTIFY: se passar do limite, o sinal vai só com o tipo. */
export function textoDoEnvelope(env: Envelope): string {
  const texto = JSON.stringify(env);
  if (Buffer.byteLength(texto, "utf8") <= LIMITE_DO_NOTIFY) return texto;
  if (env.k === "ws") return JSON.stringify({ ...env, s: { type: env.s.type } });
  return texto;
}

// ── A conexão dedicada ───────────────────────────────────────────────────────

type ClienteDoCanal = {
  query: (texto: string, valores?: unknown[]) => Promise<unknown>;
  end: () => Promise<void>;
  on(evento: "notification", fn: (n: { channel: string; payload?: string }) => void): unknown;
  on(evento: "error", fn: (erro: Error) => void): unknown;
  on(evento: "end", fn: () => void): unknown;
};

let cliente: ClienteDoCanal | null = null;
let ativo = false;
let tentativas = 0;
let jaConectou = false;
let pulso: ReturnType<typeof setInterval> | null = null;

function enviarAoCanal(env: Envelope): void {
  if (!cliente) return;
  cliente.query("SELECT pg_notify($1, $2)", [CANAL_DO_TEMPO_REAL, textoDoEnvelope(env)]).catch((erro: unknown) => {
    console.warn("[tempo-real] NOTIFY falhou (as outras cópias não recebem este sinal):", erro instanceof Error ? erro.message : erro);
  });
}

/**
 * O endereço DIRETO do banco. O "-pooler" do Neon é PgBouncer em modo
 * transação e não entrega NOTIFY; TEMPO_REAL_DATABASE_URL, se houver, vence.
 */
export function urlDiretaDoBanco(url: string): string {
  try {
    const u = new URL(url);
    u.hostname = u.hostname.replace("-pooler.", ".");
    return u.toString();
  } catch {
    return url;
  }
}

function canalLigado(): boolean {
  if (process.env.VITEST || process.env.NODE_ENV === "test") return false;
  if ((process.env.TEMPO_REAL_CANAL ?? "").trim().toLowerCase() === "off") return false;
  return !!(process.env.TEMPO_REAL_DATABASE_URL || process.env.DATABASE_URL);
}

async function conectar(): Promise<void> {
  if (!ativo) return;
  const url = process.env.TEMPO_REAL_DATABASE_URL || urlDiretaDoBanco(process.env.DATABASE_URL!);
  try {
    const { Client, neonConfig } = await import("@neondatabase/serverless");
    const ws = (await import("ws")).default;
    neonConfig.webSocketConstructor = ws;
    const novo = new Client({ connectionString: url }) as unknown as ClienteDoCanal & { connect: () => Promise<void> };
    novo.on("notification", (n: { channel: string; payload?: string }) => {
      if (n.channel === CANAL_DO_TEMPO_REAL && n.payload) receberDoCanal(n.payload);
    });
    novo.on("error", (erro: Error) => {
      console.warn("[tempo-real] conexão do canal caiu:", erro.message);
      derrubarEReconectar(novo);
    });
    novo.on("end", () => derrubarEReconectar(novo));
    await novo.connect();
    await novo.query(`LISTEN ${CANAL_DO_TEMPO_REAL}`);
    cliente = novo;
    tentativas = 0;
    if (pulso) clearInterval(pulso);
    pulso = setInterval(() => {
      novo.query("SELECT 1").catch(() => derrubarEReconectar(novo));
    }, PULSO_MS);
    if (jaConectou) {
      // Voltou de uma queda: o que as outras cópias publicaram nesse meio
      // tempo não chegou aqui. Caches fora, e as abas daqui revalidam.
      invalidateAllCaches();
      entregarAosSockets({ type: "resync" });
      console.log("[tempo-real] canal entre cópias restabelecido — caches limpos e abas avisadas");
    } else {
      console.log("[tempo-real] ouvindo o canal entre cópias");
    }
    jaConectou = true;
  } catch (erro) {
    console.warn("[tempo-real] não deu para abrir o canal entre cópias:", erro instanceof Error ? erro.message : erro);
    agendarReconexao();
  }
}

let reconexaoAgendada = false;

function derrubarEReconectar(qual: ClienteDoCanal): void {
  if (cliente !== null && cliente !== qual) return; // conexão velha, já substituída
  if (cliente === null && reconexaoAgendada) return; // "error" e "end" da mesma queda
  cliente = null;
  if (pulso) { clearInterval(pulso); pulso = null; }
  qual.end().catch(() => {});
  agendarReconexao();
}

function agendarReconexao(): void {
  if (!ativo || reconexaoAgendada) return;
  reconexaoAgendada = true;
  const espera = Math.min(ESPERA_MIN_MS * 2 ** tentativas, ESPERA_MAX_MS);
  tentativas += 1;
  setTimeout(() => {
    reconexaoAgendada = false;
    void conectar();
  }, espera).unref?.();
}

/**
 * Liga o canal (uma vez por processo) e prende os avisos que viajam por ele:
 * invalidação de cache de outros módulos e sessões encerradas.
 */
export function iniciarTempoReal(): void {
  if (ativo) return;
  sessoesEncerradas.on("encerradas", (userId: string) => {
    fecharSocketsDoUsuario(userId);
    enviarAoCanal({ o: ID_DESTA_COPIA, k: "encerradas", u: userId });
  });
  definirPublicadorDeInvalidacao((nome) => enviarAoCanal({ o: ID_DESTA_COPIA, k: "cache", c: nome }));
  if (!canalLigado()) {
    console.log("[tempo-real] sem canal entre cópias (sem DATABASE_URL, em teste ou TEMPO_REAL_CANAL=off) — só local");
    ativo = true;
    return;
  }
  ativo = true;
  void conectar();
}
