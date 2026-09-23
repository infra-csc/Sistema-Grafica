// ─────────────────────────────────────────────────────────────────────────────
// O TEXTO DA TELA MÁQUINAS, num lugar só — para os testes que leem o fonte.
//
// A tela era um arquivo só (client/src/pages/grafica-maquinas.tsx) e vários
// testes procuram trechos nele (`expect(PAGINA).toContain(...)`, ou um recorte
// entre dois trechos). Agora a página guarda o estado e os blocos, as regras
// puras e os tipos moram em client/src/components/grafica/maquinas/. Este apoio
// junta a página e a pasta: o que o teste protege continua protegido, esteja
// o trecho em que arquivo estiver (cada recorte fica dentro do seu arquivo).
// Não é um arquivo de teste (não termina em .test.ts).
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync, readdirSync } from "fs";
import path from "path";

const RAIZ = path.resolve(__dirname, "../..");
export const PAGINA_DE_MAQUINAS = "client/src/pages/grafica-maquinas.tsx";
export const PASTA_DE_MAQUINAS = "client/src/components/grafica/maquinas";

/** Os arquivos da tela: a página primeiro, depois a pasta em ordem alfabética. */
export function arquivosDaTelaDeMaquinas(): string[] {
  const pasta = readdirSync(path.join(RAIZ, PASTA_DE_MAQUINAS))
    .filter((f) => /\.tsx?$/.test(f))
    .sort()
    .map((f) => `${PASTA_DE_MAQUINAS}/${f}`);
  return [PAGINA_DE_MAQUINAS, ...pasta];
}

/** O texto da página + o de cada arquivo da pasta, separados por uma linha em branco. */
export function fonteDaTelaDeMaquinas(): string {
  return arquivosDaTelaDeMaquinas().map((rel) => readFileSync(path.join(RAIZ, rel), "utf8")).join("\n\n");
}
