// ─────────────────────────────────────────────────────────────────────────────
// PREVIEW do e-mail do book — o template de verdade, com dados de exemplo.
//
// Existe para ver o que o executivo recebe SEM publicar um book nem disparar
// e-mail: chama o mesmo `buildBookEmailMessage` que o envio usa, então o que
// sai daqui é byte a byte o que chega na caixa de entrada. Mudou o template?
// roda de novo e olha.
//
//   npx tsx scripts/preview-email-book.ts            (escreve preview-book.html)
//   npx tsx scripts/preview-email-book.ts --atualiza (a versão "BOOK ATUALIZADO")
// ─────────────────────────────────────────────────────────────────────────────
import { writeFileSync } from "fs";
import { buildBookEmailMessage } from "../server/services/bookEmailNotification";

// A lista está COPIADA de `routes/items.ts` de propósito: importar de lá
// arrasta storage → db → exceljs, e o preview passaria a exigir banco e o
// pacote de planilha só para desenhar um e-mail. A cópia não pode divergir em
// silêncio — `executivo-de-conta.test.ts` compara as duas e quebra se saírem
// de sincronia.
const DESTINATARIOS_NOMEADOS = [
  "pedro@nortemkt.com",
  "yan.araujo@nortemkt.com",
  "agatha.nadolsky@nortemkt.com",
];

const atualiza = process.argv.includes("--atualiza");

const montado = buildBookEmailMessage(
  {
    eventId: "bfa870b5-69de-4ba3-91be-f9d446d8d198",
    eventName: "Primavera São Paulo",
    itemCount: 46,
    totalDoEvento: 152,
    bookUrl: "/objects/books/primavera-sao-paulo.pdf",
    publicadoPor: "Jan Felipe",
    saidaDoCaminhao: "2026-09-07T21:00:00.000Z",
    publicacao: atualiza ? 2 : 1,
    // O "Para" da regra nova: a Arte (por papel) e o executivo com cliente
    // neste evento (por vínculo do patrocinador).
    destinatariosPrincipais: ["jan.felipe@nortemkt.com", "enzo.ascoli@nortemkt.com"],
    // Em cópia oculta: os admins que acompanham + as três da gestão.
    destinatariosDeCopia: DESTINATARIOS_NOMEADOS,
  },
  {
    enabled: true,
    dryRun: true,
    from: "no-reply@nortemkt.com",
    recipients: [],
    appUrl: "https://print-flow-manager-infraestrutura2.replit.app",
  },
);

if ("erro" in montado) {
  console.error("Não foi possível montar:", montado.erro);
  process.exit(1);
}

const { message } = montado;
const destino = "preview-book.html";
writeFileSync(destino, message.html, "utf8");

console.log(`ASSUNTO: ${message.subject}`);
console.log(`DE:      ${message.from}`);
console.log(`PARA:    ${message.to.join(", ")}`);
console.log(`CÓPIA:   ${(message.bcc ?? []).join(", ") || "(nenhuma)"}`);
console.log(`\n── VERSÃO TEXTO (o que lê quem bloqueia HTML) ──\n${message.text}`);
console.log(`\nHTML escrito em ${destino}`);
