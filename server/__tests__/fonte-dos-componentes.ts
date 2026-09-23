// ─────────────────────────────────────────────────────────────────────────────
// O TEXTO DE UM COMPONENTE COMPARTILHADO GRANDE, com os pedaços dele.
//
// A ficha da peça (item-details-dialog), a entrada rápida (bulk-item-entry) e
// a importação de planilha (import-xlsx-dialog) eram um arquivo cada, e vários
// testes os liam como texto. Agora o arquivo original é a composição e os
// pedaços moram numa pasta própria. Este apoio devolve o arquivo seguido de
// cada pedaço (ordem alfabética), para que uma regra de código continue
// valendo para o COMPONENTE, esteja o trecho onde estiver — o mesmo contrato
// de fonte-da-tela.ts, para componentes em vez de telas.
// Recorte "de A até B" só funciona com A e B no mesmo pedaço.
// Não é um arquivo de teste (não termina em .test.ts).
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync, readdirSync, existsSync, statSync } from "fs";
import path from "path";

const RAIZ = path.resolve(__dirname, "../..");
const CLIENTE = path.join(RAIZ, "client/src");

/** Arquivo de entrada → pasta dos pedaços (relativos a client/src). */
const PEDACOS: Record<string, string> = {
  "components/item-details-dialog.tsx": "components/ficha-da-peca",
  "components/bulk-item-entry.tsx": "components/entrada-rapida",
  "components/import-xlsx-dialog.tsx": "components/importar-planilha",
};

function arquivosDaPasta(abs: string): string[] {
  if (!existsSync(abs)) return [];
  const saida: string[] = [];
  for (const nome of readdirSync(abs).sort()) {
    const cheio = path.join(abs, nome);
    if (statSync(cheio).isDirectory()) saida.push(...arquivosDaPasta(cheio));
    else if (/\.tsx?$/.test(nome)) saida.push(cheio);
  }
  return saida;
}

/** Aceita "client/src/components/x.tsx" ou "components/x.tsx". */
function relativoAoCliente(rel: string): string {
  return rel.replace(/\\/g, "/").replace(/^client\/src\//, "");
}

/** Caminhos absolutos do arquivo e dos pedaços dele (se tiver). */
export function arquivosDoComponente(rel: string): string[] {
  const r = relativoAoCliente(rel);
  const pasta = PEDACOS[r];
  return [path.join(CLIENTE, r), ...(pasta ? arquivosDaPasta(path.join(CLIENTE, pasta)) : [])];
}

/** O arquivo e todos os pedaços dele, concatenados. Arquivo sem pedaços volta sozinho. */
export function fonteDoComponente(rel: string): string {
  return arquivosDoComponente(rel).map((abs) => readFileSync(abs, "utf8")).join("\n");
}
