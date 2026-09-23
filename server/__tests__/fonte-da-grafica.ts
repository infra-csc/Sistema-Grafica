// ─────────────────────────────────────────────────────────────────────────────
// O TEXTO DA TELA DA GRÁFICA, num lugar só — para os testes que leem o fonte.
//
// A tela era um arquivo só (client/src/pages/grafica.tsx, ~6 mil linhas) e
// dezenas de testes o liam como texto (`expect(GRAFICA).toContain(...)`). A
// página virou composição: o desenho mora em components/grafica/fila/ e
// components/grafica/modais/, os dados e o recorte em components/grafica/hooks/.
// `fonteDaGrafica()` junta a página e as partes dela — a regra que o teste
// protege continua protegida, more ela no arquivo que morar. Quem precisa de
// UM pedaço (o cartão do celular × a tabela, o handler do lote) lê o arquivo
// dele com `fonteDe`.
// Não é um arquivo de teste (não termina em .test.ts).
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync, readdirSync } from "fs";
import path from "path";

const RAIZ = path.resolve(__dirname, "../..");

/** O texto de um arquivo, pelo caminho a partir da raiz do projeto. */
export const fonteDe = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf8");

/** As pastas com as partes da tela (tudo o que a página compõe). */
const PASTAS_DA_GRAFICA = [
  "client/src/components/grafica/fila",
  "client/src/components/grafica/modais",
  "client/src/components/grafica/hooks",
];

/** A página e as partes dela, na ordem em que são concatenadas. */
export function arquivosDaGrafica(): string[] {
  const partes = PASTAS_DA_GRAFICA.flatMap((pasta) =>
    readdirSync(path.join(RAIZ, pasta))
      .filter((f) => /\.tsx?$/.test(f))
      .sort()
      .map((f) => `${pasta}/${f}`));
  return ["client/src/pages/grafica.tsx", "client/src/components/grafica/tipos.ts", ...partes];
}

/** O texto da tela inteira: a página + as partes (fila, modais e hooks). */
export function fonteDaGrafica(): string {
  return arquivosDaGrafica().map(fonteDe).join("\n");
}
