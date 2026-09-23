// ─────────────────────────────────────────────────────────────────────────────
// O TEXTO DAS TELAS DE ARTE, REVISÃO FINAL E VINCULAÇÃO, num lugar só — para
// os testes que leem o fonte.
//
// Cada uma dessas telas era um arquivo só (pages/arte.tsx, pages/solicitacao.tsx,
// pages/vincular-patrocinadores.tsx) e dezenas de testes o liam como texto. Ao
// dividi-las, a fila, a linha, os modais e os hooks foram para uma pasta da
// área em components/. Este apoio devolve a PÁGINA primeiro e depois cada
// arquivo da pasta (em ordem alfabética), para que um `toContain` continue
// achando o trecho onde quer que ele more agora.
//
// Quando o teste precisa saber EM QUAL arquivo está o trecho (um recorte entre
// dois marcadores, por exemplo), use `arquivosDaTela` e leia o arquivo certo.
// Não é um arquivo de teste (não termina em .test.ts).
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync, readdirSync, existsSync, statSync } from "fs";
import path from "path";

const RAIZ = path.resolve(__dirname, "../..");

export type AreaDaTela = "arte" | "revisao" | "vinculacao";

const AREAS: Record<AreaDaTela, { pagina: string; pasta: string }> = {
  arte: { pagina: "client/src/pages/arte.tsx", pasta: "client/src/components/arte" },
  revisao: { pagina: "client/src/pages/solicitacao.tsx", pasta: "client/src/components/revisao" },
  vinculacao: { pagina: "client/src/pages/vincular-patrocinadores.tsx", pasta: "client/src/components/vinculacao" },
};

function arquivosDaPasta(relPasta: string): string[] {
  const abs = path.join(RAIZ, relPasta);
  if (!existsSync(abs)) return [];
  return readdirSync(abs).sort().flatMap((nome) => {
    const rel = `${relPasta}/${nome}`;
    if (statSync(path.join(RAIZ, rel)).isDirectory()) return arquivosDaPasta(rel);
    return /\.tsx?$/.test(nome) && !/\.test\.tsx?$/.test(nome) ? [rel] : [];
  });
}

/** Caminhos (relativos à raiz) da página e de cada arquivo da pasta da área. */
export function arquivosDaTela(area: AreaDaTela): string[] {
  const { pagina, pasta } = AREAS[area];
  return [pagina, ...arquivosDaPasta(pasta)];
}

/** Lê um arquivo relativo à raiz do projeto. */
export function lerDaRaiz(rel: string): string {
  return readFileSync(path.join(RAIZ, rel), "utf8");
}

/** Texto da página + da pasta da área, nessa ordem. */
export function fonteDaTela(area: AreaDaTela): string {
  return arquivosDaTela(area).map(lerDaRaiz).join("\n");
}

export const fonteDaArte = (): string => fonteDaTela("arte");
export const fonteDaRevisao = (): string => fonteDaTela("revisao");
export const fonteDaVinculacao = (): string => fonteDaTela("vinculacao");

/**
 * Para os testes que guardam uma tabela `caminho → trechos`: se o caminho é
 * uma das três páginas divididas, devolve o texto da área inteira; senão, o
 * arquivo. Assim a tabela continua dizendo "a tela X", e não "o arquivo X".
 */
export function lerTelaOuArquivo(rel: string): string {
  const area = (Object.keys(AREAS) as AreaDaTela[]).find((a) => AREAS[a].pagina === rel);
  return area ? fonteDaTela(area) : lerDaRaiz(rel);
}
