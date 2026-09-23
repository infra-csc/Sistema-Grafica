// ─────────────────────────────────────────────────────────────────────────────
// PRELOAD SÓ DO AMBIENTE LOCAL — carregado com `--import` pelo dev-local.mjs,
// ANTES do servidor. Nunca entra no build nem no Replit.
//
// O servidor fala com o banco pelo driver serverless do Neon (server/db.ts),
// que manda o protocolo do Postgres dentro de um WebSocket seguro para o
// endereço do Neon. Aqui o mesmo driver é apontado para o WebSocket do banco
// local (scripts/local/banco-local.mjs), sem TLS. Como `neonConfig` é global
// do módulo, configurar antes basta: server/db.ts fica intocado e produção não
// tem um caminho de código a mais.
//
// Liga só com NEON_WS_LOCAL=host:porta.
// ─────────────────────────────────────────────────────────────────────────────
import { neonConfig } from "@neondatabase/serverless";
import net from "net";

const alvo = process.env.NEON_WS_LOCAL;
if (alvo) {
  neonConfig.wsProxy = () => `${alvo}/v2`;
  neonConfig.useSecureWebSocket = false;
  neonConfig.pipelineTLS = false;
  // O Neon manda a senha junto com o início da conexão, supondo que o
  // servidor vai pedi-la; o banco local não pede, e a mensagem sobraria.
  neonConfig.pipelineConnect = false;
}

// `reusePort` (server/index.ts) só existe em Linux/BSD; no Windows e no macOS
// o listen LANÇA. No Replit é Linux — aqui a opção é só retirada.
if (process.platform !== "linux") {
  const listenOriginal = net.Server.prototype.listen;
  net.Server.prototype.listen = function (...args) {
    if (args[0] && typeof args[0] === "object" && "reusePort" in args[0]) {
      const { reusePort: _descartado, ...resto } = args[0];
      args[0] = resto;
    }
    return listenOriginal.apply(this, args);
  };
}
