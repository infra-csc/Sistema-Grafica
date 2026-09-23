// ─────────────────────────────────────────────────────────────────────────────
// O TEXTO DE UMA TELA GRANDE, num lugar só — para os testes que leem o fonte.
//
// Atendimento, Eventos, Detalhe do Evento e Painel eram um arquivo cada (4 a 5
// mil linhas) e dezenas de testes os liam como texto. Agora a página é a
// composição e os pedaços moram em client/src/components/<área>/. Este apoio
// devolve a página seguida de cada pedaço da área (ordem alfabética do
// caminho), para que uma regra de código ("a tela usa X", "não existe Y")
// continue valendo para a TELA, esteja o trecho onde estiver.
// Recorte "de A até B" dentro de um mesmo pedaço continua funcionando; quem
// precisa de um pedaço só lê o arquivo dele por `lerDoCliente`.
// Não é um arquivo de teste (não termina em .test.ts).
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync, readdirSync, existsSync, statSync } from "fs";
import path from "path";

const RAIZ = path.resolve(__dirname, "../..");
const CLIENTE = path.join(RAIZ, "client/src");

export type Tela = "atendimento" | "eventos" | "detalhe-do-evento" | "painel";

const PAGINA: Record<Tela, string> = {
  atendimento: "pages/atendimento.tsx",
  eventos: "pages/eventos.tsx",
  "detalhe-do-evento": "pages/event-detail.tsx",
  painel: "pages/painel-geral.tsx",
};

/** Lê um arquivo de client/src pelo caminho relativo (ex.: "components/eventos/linha.tsx"). */
export function lerDoCliente(rel: string): string {
  return readFileSync(path.join(CLIENTE, rel), "utf8");
}

function arquivosDaPasta(abs: string): string[] {
  if (!existsSync(abs)) return [];
  const saida: string[] = [];
  for (const nome of readdirSync(abs).sort()) {
    const cheio = path.join(abs, nome);
    if (statSync(cheio).isDirectory()) saida.push(...arquivosDaPasta(cheio));
    else if (/\.(tsx?|css)$/.test(nome)) saida.push(cheio);
  }
  return saida;
}

/** Caminhos (relativos a client/src, com "/") da página e dos pedaços da área. */
export function arquivosDaTela(tela: Tela): string[] {
  const pedacos = arquivosDaPasta(path.join(CLIENTE, "components", tela))
    .map((abs) => path.relative(CLIENTE, abs).split(path.sep).join("/"));
  return [PAGINA[tela], ...pedacos];
}

/** A página e todos os pedaços da área, concatenados. */
export function fonteDaTela(tela: Tela): string {
  return arquivosDaTela(tela).map(lerDoCliente).join("\n");
}
