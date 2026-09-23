// ─────────────────────────────────────────────────────────────────────────────
// UM POSTGRES DE MENTIRA, NA MÁQUINA — PGlite (o Postgres 17 compilado para
// WebAssembly) servido em duas portas:
//
//   · TCP  (protocolo do Postgres) — para `pg`, drizzle-kit, checar-drift,
//     migrar.mjs e qualquer psql/DBeaver;
//   · WebSocket — para o driver serverless do Neon, que é o que o servidor usa
//     (server/db.ts). O Neon fala Postgres DENTRO de um WebSocket; aqui cada
//     conexão WebSocket vira uma conexão de banco, sem proxy intermediário.
//     O preload scripts/local/neon-local.mjs aponta o driver para cá.
//
// POR QUE NÃO O PGLiteSocketServer PRONTO (@electric-sql/pglite-socket): o
// PGlite é UMA sessão só, e o servidor do pacote enfileira mensagem a
// mensagem — duas conexões intercalam o Parse/Bind/Execute uma da outra (a
// instrução sem nome é uma só na sessão), e uma transação aberta trava as
// outras conexões para sempre. Aqui:
//
//   1. a unidade é o LOTE que termina em Sync ou Query simples: um lote roda
//      inteiro, sem outro no meio;
//   2. a conexão que deixou uma TRANSAÇÃO aberta vira dona da sessão, e os
//      lotes das outras esperam o COMMIT/ROLLBACK — como num Postgres de
//      verdade, onde elas não veriam a transação pela metade;
//   3. CARONA: se a dona ficou parada no meio da transação (mais de
//      CARONA_MS sem mandar nada), o lote de outra conexão roda DENTRO da
//      transação dela, protegido por um SAVEPOINT (erro da carona não aborta a
//      transação alheia). É o que destrava o padrão do servidor "abre uma
//      transação, pega uma trava e, dentro dela, consulta pelo pool"
//      (server/services/lideranca.ts) — que num Postgres de verdade usa duas
//      sessões e aqui, sem a carona, esperaria para sempre.
//
// Limites conhecidos (é banco de TESTE, não de produção):
//   · a carona grava junto com a transação da dona: se a dona desfizer
//     (ROLLBACK), o que a carona gravou vai junto;
//   · as conexões dividem a sessão: um SET vale para todas (ao fechar uma
//     conexão, RESET ALL);
//   · LISTEN/NOTIFY não chega a outra conexão — o dev-local sobe o app com
//     TEMPO_REAL_CANAL=off (uma cópia só, que é o que existe aqui);
//   · travas de linha (FOR UPDATE) e advisory locks não disputam nada: há uma
//     sessão só.
// ─────────────────────────────────────────────────────────────────────────────
import net from "net";
import { mkdirSync } from "fs";
import { importarFerramenta } from "./ferramentas.mjs";

const SSL_REQUEST = 80877103;
const GSSENC_REQUEST = 80877104;
const CANCEL_REQUEST = 80877102;
const PROTOCOLO_3 = 196608;
/** Quanto a dona de uma transação pode ficar parada antes de dar carona. */
const CARONA_MS = 40;

const CONTROLE_DE_TRANSACAO = /^\s*(BEGIN|START\s+TRANSACTION|COMMIT|END|ROLLBACK|ABORT|SAVEPOINT|RELEASE|PREPARE\s+TRANSACTION)\b/i;

/** O lote mexe em transação (BEGIN/COMMIT…)? Lê o texto das mensagens Query e Parse. */
function mexeEmTransacao(mensagens) {
  for (const m of mensagens) {
    const tipo = String.fromCharCode(m[0]);
    if (tipo === "Q") {
      if (CONTROLE_DE_TRANSACAO.test(m.subarray(5, m.length - 1).toString("utf8"))) return true;
    } else if (tipo === "P") {
      const fimDoNome = m.indexOf(0, 5);
      const fimDoTexto = m.indexOf(0, fimDoNome + 1);
      if (CONTROLE_DE_TRANSACAO.test(m.subarray(fimDoNome + 1, fimDoTexto).toString("utf8"))) return true;
    }
  }
  return false;
}

/** Uma mensagem Query simples do protocolo ('Q'). */
function mensagemQuery(texto) {
  const corpo = Buffer.from(`${texto}\0`, "utf8");
  const m = Buffer.alloc(5 + corpo.length);
  m[0] = 0x51;
  m.writeInt32BE(4 + corpo.length, 1);
  corpo.copy(m, 5);
  return m;
}

/** A resposta tem ErrorResponse ('E')? Percorre as mensagens do backend. */
function temErro(bytes) {
  let i = 0;
  while (i + 5 <= bytes.length) {
    if (bytes[i] === 0x45) return true;
    i += 1 + bytes.readInt32BE(i + 1);
  }
  return false;
}

/**
 * Sobe o banco. `pasta` = diretório de dados (persistente entre execuções);
 * sem ela, o banco vive só na memória e some ao parar. `caronaMs` = quanto a
 * dona de uma transação pode ficar parada antes de dar carona; `Infinity`
 * desliga a carona (os testes de integração: transações em SÉRIE, sem uma
 * gravar dentro da outra).
 */
export async function subirBancoLocal({ pasta, portaTcp = 0, portaWs = 0, host = "127.0.0.1", log = () => {}, caronaMs = CARONA_MS } = {}) {
  const { PGlite } = await importarFerramenta("@electric-sql/pglite");
  const { pg_trgm } = await importarFerramenta("@electric-sql/pglite/contrib/pg_trgm");
  const { WebSocketServer } = await import("ws");

  if (pasta) mkdirSync(pasta, { recursive: true });
  const db = await PGlite.create(pasta ? { dataDir: pasta, extensions: { pg_trgm } } : { extensions: { pg_trgm } });
  // Os horários do app são gravados em UTC (timestamp sem fuso) e o Neon roda
  // em UTC. O PGlite herda o fuso do processo — sem isto, now() sairia em BRT.
  await db.exec("SET TIME ZONE 'UTC'");
  await db.exec("ALTER DATABASE postgres SET timezone TO 'UTC'").catch(() => {});

  // ── O escalonador: um lote por vez na sessão única do PGlite ────────────
  const fila = []; // { id, mensagens, fim, ok }
  let dono = null; // conexão com transação aberta (ou lote em andamento sem Sync)
  let donoParadoDesde = 0;
  let rodando = false;
  let reagendado = null;
  let proximoId = 1;
  const conexoes = new Set();
  const enviarPara = new Map(); // id → enviar(buf)

  async function executar(lote) {
    const saida = [];
    for (const m of lote.mensagens) {
      await db.runExclusive(() =>
        db.execProtocolRawStream(new Uint8Array(m), {
          onRawData: (dados) => {
            if (!dados.length) return;
            const b = Buffer.from(dados);
            saida.push(b);
            enviarPara.get(lote.id)?.(b);
          },
        }),
      );
    }
    return Buffer.concat(saida);
  }

  async function bombear() {
    if (rodando) return;
    rodando = true;
    try {
      for (;;) {
        if (fila.length === 0) break;
        let i = -1;
        let carona = false;
        if (dono === null) i = 0;
        else {
          i = fila.findIndex((l) => l.id === dono);
          if (i === -1) {
            // A dona está parada no meio da transação. Espera um pouco; se ela
            // não voltar, a primeira conexão da fila vai de carona.
            const parada = Date.now() - donoParadoDesde;
            if (parada < caronaMs) {
              // Carona desligada (caronaMs = Infinity): espera a dona SEMPRE.
              if (!reagendado && Number.isFinite(caronaMs)) reagendado = setTimeout(() => { reagendado = null; void bombear(); }, caronaMs - parada + 1);
              break;
            }
            i = 0;
            carona = true;
          }
        }
        const [lote] = fila.splice(i, 1);
        try {
          if (carona) await executarDeCarona(lote);
          else {
            await executar(lote);
            // Sync/Query fecham a instrução; com transação aberta (ou lote
            // pela metade), a sessão continua desta conexão.
            dono = lote.fim && !db.isInTransaction() ? null : lote.id;
            donoParadoDesde = Date.now();
          }
        } catch (erro) {
          log(`[banco-local] conexão #${lote.id}: ${erro instanceof Error ? erro.message : erro}`);
        }
        lote.ok();
      }
    } finally {
      rodando = false;
    }
  }

  async function executarDeCarona(lote) {
    const protegido = db.isInTransaction() && !mexeEmTransacao(lote.mensagens);
    if (protegido) await db.exec("SAVEPOINT carona_local");
    const resposta = await executar(lote);
    if (protegido) {
      try {
        if (temErro(resposta)) await db.exec("ROLLBACK TO SAVEPOINT carona_local");
        await db.exec("RELEASE SAVEPOINT carona_local");
      } catch { /* a carona encerrou a transação — não há o que soltar */ }
    }
    // A carona pode ter encerrado a transação (COMMIT de quem pegou carona).
    if (!db.isInTransaction()) dono = null;
  }

  let parando = false;
  function enfileirar(id, mensagens, fim) {
    return new Promise((ok) => {
      if (parando) return ok();
      fila.push({ id, mensagens, fim, ok });
      void bombear();
    });
  }

  /**
   * Uma conexão de banco, independente do transporte.
   * `enviar(buf)` escreve para o cliente; `fechar()` derruba o transporte.
   */
  function novaConexao(enviar, fechar) {
    const id = proximoId++;
    let buffer = Buffer.alloc(0);
    let iniciou = false;
    let lote = [];
    let encerrada = false;
    enviarPara.set(id, (b) => { if (!encerrada) enviar(b); });
    conexoes.add(encerrar);

    function receber(pedaco) {
      buffer = Buffer.concat([buffer, pedaco]);
      for (;;) {
        if (!iniciou) {
          if (buffer.length < 8) return;
          const tamanho = buffer.readInt32BE(0);
          const codigo = buffer.readInt32BE(4);
          if (buffer.length < tamanho) return;
          const msg = Buffer.from(buffer.subarray(0, tamanho));
          buffer = buffer.subarray(tamanho);
          if (codigo === SSL_REQUEST || codigo === GSSENC_REQUEST) { enviar(Buffer.from("N")); continue; }
          if (codigo === CANCEL_REQUEST || codigo !== PROTOCOLO_3) { fechar(); return; }
          iniciou = true;
          void enfileirar(id, [msg], true);
          continue;
        }
        if (buffer.length < 5) return;
        const tipo = String.fromCharCode(buffer[0]);
        const tamanho = 1 + buffer.readInt32BE(1);
        if (buffer.length < tamanho) return;
        const msg = Buffer.from(buffer.subarray(0, tamanho));
        buffer = buffer.subarray(tamanho);
        if (tipo === "X") { fechar(); return; }
        lote.push(msg);
        // Sync e Query simples terminam a instrução; Flush pede a resposta do
        // que já veio (sem soltar a sessão — o Sync ainda vem).
        if (tipo === "S" || tipo === "Q" || tipo === "H") {
          const mensagens = lote;
          lote = [];
          void enfileirar(id, mensagens, tipo !== "H");
        }
      }
    }

    function encerrar() {
      if (encerrada) return;
      encerrada = true;
      conexoes.delete(encerrar);
      enviarPara.delete(id);
      // Tira da fila o que a conexão mandou e não vai mais ler.
      for (let i = fila.length - 1; i >= 0; i--) if (fila[i].id === id) fila.splice(i, 1)[0].ok();
      if (dono !== id) {
        // A sessão é de todos: o SET desta conexão (ex.: o READ ONLY do
        // checar-drift) não pode sobreviver a ela.
        void enfileirar(id, [mensagemQuery("RESET ALL; SET TIME ZONE 'UTC'")], true);
      } else {
        // Caiu no meio de uma transação: desfaz, como o Postgres faria.
        void (async () => {
          try {
            if (db.isInTransaction()) await db.exec("ROLLBACK");
            await db.exec("RESET ALL; SET TIME ZONE 'UTC'");
          } catch { /* sessão já limpa */ }
          if (dono === id) dono = null;
          void bombear();
        })();
      }
    }

    return { receber, encerrar };
  }

  // ── Transporte TCP ──────────────────────────────────────────────────────
  const tcp = net.createServer((socket) => {
    socket.setNoDelay(true);
    const c = novaConexao(
      (b) => { if (socket.writable) socket.write(b); },
      () => socket.destroy(),
    );
    socket.on("data", c.receber);
    socket.on("close", c.encerrar);
    socket.on("error", () => c.encerrar());
  });
  await new Promise((ok, falha) => { tcp.once("error", falha); tcp.listen(portaTcp, host, ok); });

  // ── Transporte WebSocket (driver do Neon) ───────────────────────────────
  const wss = new WebSocketServer({ host, port: portaWs });
  await new Promise((ok, falha) => { wss.once("error", falha); wss.once("listening", ok); });
  wss.on("connection", (ws) => {
    const c = novaConexao(
      (b) => { if (ws.readyState === ws.OPEN) ws.send(b); },
      () => ws.close(),
    );
    ws.on("message", (dados) => c.receber(Buffer.isBuffer(dados) ? dados : Buffer.from(dados)));
    ws.on("close", c.encerrar);
    ws.on("error", () => c.encerrar());
  });

  const pTcp = tcp.address().port;
  const pWs = wss.address().port;
  return {
    db,
    portaTcp: pTcp,
    portaWs: pWs,
    /** URL de conexão para `pg` / drizzle-kit / scripts (TCP, sem senha, sem SSL). */
    url: `postgres://postgres:local@${host}:${pTcp}/postgres`,
    /** Endereço do WebSocket que o preload do Neon usa. */
    ws: `${host}:${pWs}`,
    async parar() {
      parando = true;
      if (reagendado) clearTimeout(reagendado);
      for (const c of [...conexoes]) c();
      for (const cliente of wss.clients) cliente.terminate();
      await new Promise((ok) => wss.close(() => ok()));
      await new Promise((ok) => tcp.close(() => ok()));
      await db.close();
    },
  };
}
