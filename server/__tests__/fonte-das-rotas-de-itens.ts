// ─────────────────────────────────────────────────────────────────────────────
// O TEXTO DAS ROTAS DA PEÇA, num lugar só — para os testes que leem o fonte.
//
// Até o fatiamento, as rotas da peça eram um arquivo só (server/routes/items.ts)
// e dezenas de testes o liam como texto (`expect(ITEMS).toContain(...)`, ou um
// recorte entre duas rotas). Agora elas moram em server/routes/itens/*.ts e a
// regra dos handlers grandes em server/services/. Este apoio remonta o texto
// na MESMA ordem de antes: o apoio de cada arquivo primeiro, depois o corpo de
// cada `registrarX(app)` na ordem em que registerItemRoutes os chama, e por
// fim os serviços extraídos. Assim um recorte "da rota A até a rota B" continua
// sendo o mesmo trecho — e o que o teste protege continua protegido.
// Não é um arquivo de teste (não termina em .test.ts).
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync, readdirSync, existsSync } from "fs";
import path from "path";

const RAIZ = path.resolve(__dirname, "../..");
const ler = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf8");

/** Serviços que receberam a regra dos handlers grandes das rotas da peça. */
export const SERVICOS_DAS_ROTAS_DE_ITENS: readonly string[] = [
  "server/services/edicao-da-peca.ts",
  "server/services/impressas-da-peca.ts",
  "server/services/complemento-da-peca.ts",
];

/** Corpo de cada `export function registrarX(app: Express): void { … }` de um arquivo. */
function funcoesDeRegistro(texto: string): Map<string, string> {
  const saida = new Map<string, string>();
  const linhas = texto.split("\n");
  for (let i = 0; i < linhas.length; i++) {
    const m = /^export function (\w+)\(app: Express\): void \{$/.exec(linhas[i]);
    if (!m) continue;
    const fim = linhas.indexOf("}", i + 1);
    saida.set(m[1], linhas.slice(i + 1, fim).join("\n"));
    i = fim;
  }
  return saida;
}

/** O apoio do arquivo: tudo menos as funções de registro. */
function apoio(texto: string): string {
  const linhas = texto.split("\n");
  const fora: string[] = [];
  for (let i = 0; i < linhas.length; i++) {
    if (/^export function \w+\(app: Express\): void \{$/.test(linhas[i])) {
      // O `/** resumo */` logo acima da função cita o caminho da rota: sai junto.
      if (fora.length && /^\/\*\*.*\*\/$/.test(fora[fora.length - 1])) fora.pop();
      i = linhas.indexOf("}", i + 1);
      continue;
    }
    fora.push(linhas[i]);
  }
  return fora.join("\n");
}

export function fonteDasRotasDeItens(): string {
  const indice = ler("server/routes/items.ts");
  const pasta = path.join(RAIZ, "server/routes/itens");
  const arquivos = readdirSync(pasta).filter((f) => f.endsWith(".ts")).sort((a, b) =>
    a === "comum.ts" ? -1 : b === "comum.ts" ? 1 : a.localeCompare(b));
  const textos = arquivos.map((f) => readFileSync(path.join(pasta, f), "utf8"));
  const corpos = new Map<string, string>();
  for (const t of textos) for (const [nome, corpo] of Array.from(funcoesDeRegistro(t))) corpos.set(nome, corpo);
  const chamadas = Array.from(indice.matchAll(/^ {2}(\w+)\(app\);/gm)).map((m) => m[1]);
  const rotas = chamadas.map((nome) => {
    const corpo = corpos.get(nome);
    if (corpo === undefined) throw new Error(`registerItemRoutes chama ${nome}, que não está em server/routes/itens/`);
    return corpo;
  });
  const servicos = SERVICOS_DAS_ROTAS_DE_ITENS.filter((rel) => existsSync(path.join(RAIZ, rel))).map(ler);
  // O índice vai por ÚLTIMO: os comentários dele citam os caminhos das rotas, e
  // um `indexOf("/api/items/…")` tem de cair na rota, não no índice.
  return [...textos.map(apoio), "export function registerItemRoutes(app: Express): void {", ...rotas, "}", ...servicos, indice].join("\n");
}
