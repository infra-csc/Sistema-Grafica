// ─────────────────────────────────────────────────────────────────────────────
// PREVIEW do aviso da gestão — o template de verdade, com dados de exemplo.
//
// Mesma ideia do preview do book: chama o `construirEmailDaGestao` que o envio
// usa, então o que sai daqui é o que chega na caixa de entrada. Os números
// abaixo são inventados (o script não abre banco) — o que se avalia aqui é a
// LEITURA: dá para saber em dez segundos o que está travando e onde?
//
//   npx tsx scripts/preview-email-gestao.ts
// ─────────────────────────────────────────────────────────────────────────────
import { writeFileSync } from "fs";
import type { ResumoDaGestao } from "../server/services/gestaoDigest";

// O módulo do aviso importa `db` (a trilha que impede o envio repetido), e
// `server/db.ts` exige DATABASE_URL já na importação. O preview não abre
// conexão nenhuma: um endereço de mentira satisfaz a checagem e o Pool nunca
// chega a ser usado. Import dinâmico porque `import` no topo é içado e rodaria
// antes desta linha.
process.env.DATABASE_URL ||= "postgres://preview:preview@localhost:5432/preview";
const { construirEmailDaGestao, DESTINATARIOS_DA_GESTAO } = await import("../server/services/gestaoDigest");

const emDias = (n: number) => new Date(Date.now() + n * 86400000).toISOString();

const resumo: ResumoDaGestao = {
  totalPendentes: 37,
  pecasPendentes: 29,
  travadas: 6,
  eventosOcultos: 2,
  eventos: [
    {
      eventId: "e1", evento: "Primavera São Paulo",
      saidaDoCaminhao: emDias(3), diasParaSaida: 3,
      pendentes: 14, pecas: 11, travadas: 4,
      patrocinadores: [
        { nome: "Livelo", pecas: 5, diasDoMaisAntigo: 9, travadas: 3 },
        { nome: "Sherwin Willians", pecas: 4, diasDoMaisAntigo: 7, travadas: 1 },
        { nome: "All Seg", pecas: 2, diasDoMaisAntigo: 3, travadas: 0 },
        { nome: "Victalab", pecas: 1, diasDoMaisAntigo: 2, travadas: 0 },
      ],
    },
    {
      eventId: "e2", evento: "Meia Maratona Cidade Maravilhosa",
      saidaDoCaminhao: emDias(11), diasParaSaida: 11,
      pendentes: 9, pecas: 8, travadas: 2,
      patrocinadores: [
        { nome: "Santander Select", pecas: 5, diasDoMaisAntigo: 8, travadas: 2 },
        { nome: "Elo", pecas: 3, diasDoMaisAntigo: 4, travadas: 0 },
      ],
    },
    {
      eventId: "e3", evento: "Circuito das Estações — Etapa 2",
      saidaDoCaminhao: null, diasParaSaida: null,
      pendentes: 3, pecas: 3, travadas: 0,
      patrocinadores: [{ nome: "Ministério", pecas: 3, diasDoMaisAntigo: 2, travadas: 0 }],
    },
  ],
};

const montado = construirEmailDaGestao(
  resumo,
  { from: "no-reply@nortemkt.com", appUrl: "https://print-flow-manager-infraestrutura2.replit.app" },
  DESTINATARIOS_DA_GESTAO,
);

if ("erro" in montado) {
  console.error("Não foi possível montar:", montado.erro);
  process.exit(1);
}

writeFileSync("preview-gestao.html", montado.html, "utf8");
console.log(`ASSUNTO: ${montado.subject}`);
console.log(`PARA:    ${montado.to.join(", ")}`);
console.log(`\n── VERSÃO TEXTO ──\n${montado.text}`);
console.log(`\nHTML escrito em preview-gestao.html`);
