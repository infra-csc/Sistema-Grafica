// ─────────────────────────────────────────────────────────────────────────────
// Regera a tabela de docs/estados-da-peca.md a partir de
// shared/maquina-de-estados.ts (só a seção entre os marcadores "gerado:" — o
// texto escrito à mão em volta fica).
//
//   npx tsx scripts/gerar-doc-estados-da-peca.ts
//
// Rode depois de mexer na tabela de transições — o teste
// estados-da-peca-doc.test.ts quebra enquanto a doc estiver velha.
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { aplicarSecaoGerada } from "../shared/maquina-de-estados-doc";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const destino = path.join(raiz, "docs", "estados-da-peca.md");
writeFileSync(destino, aplicarSecaoGerada(readFileSync(destino, "utf8")));
console.log(`docs/estados-da-peca.md: tabela regerada (${destino})`);
