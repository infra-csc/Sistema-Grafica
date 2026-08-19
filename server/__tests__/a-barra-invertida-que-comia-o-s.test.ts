// ─────────────────────────────────────────────────────────────────────────────
// A BARRA INVERTIDA QUE COMIA A LETRA "S".
//
// O defeito que este arquivo existe para impedir, contado uma vez:
//
//   const motivo = String(bruto).trim().replace(/s+/g, " ");
//
// Faltava UM caractere. `/s+/` é a letra "s" literal; o que se queria era
// `/\s+/`, espaço em branco. O resultado: todo motivo de devolução digitado no
// app perdia os "s" minúsculos, trocados por espaço.
//
//   "a cor parece desbotada"            → "a cor parece de botada"
//   "Preciso garantir que ele seja..."  → "Preci o garantir que ele eja..."
//
// O que tornou o defeito difícil de ver: a frase que o SERVIDOR monta em volta
// do motivo ("Patrocinador X reprovou o item. Item aguarda nova versão da
// Arte") não passa pela função e saía intacta, com os "s" no lugar. Lado a
// lado, na mesma linha do histórico, parecia erro de digitação da pessoa.
//
// O alcance: `lerMotivoDevolucao` atende SETE rotas — reprovação pelo
// patrocinador, devolução da Arte, devolução da Solicitação, devolução em lote.
// E o texto era gravado já mastigado, então o que foi salvo antes da correção
// não volta: as letras não estão em lugar nenhum para serem recuperadas.
//
// A mesma linha estava copiada em `atendimento.tsx` e `solicitacao.tsx`, onde
// não corrompia texto mas errava a CONTA do mínimo de caracteres — um motivo
// cheio de "s" era medido como mais curto do que é.
//
// A REGRA QUE FICA: classe de regex sem a barra invertida é uma letra. Este
// teste varre o repositório inteiro atrás da família toda do engano (`/s+/`,
// `/d+/`, `/w+/` e as maiúsculas), não só do caso que aconteceu.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";

const RAIZ = path.resolve(__dirname, "../../");
const PASTAS = ["server", "client/src", "shared"];

function arquivos(dir: string, acc: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    if (nome === "node_modules" || nome === "__tests__" || nome === "dist") continue;
    const p = path.join(dir, nome);
    if (statSync(p).isDirectory()) arquivos(p, acc);
    else if (/\.tsx?$/.test(nome)) acc.push(p);
  }
  return acc;
}

const TODOS = PASTAS.flatMap(p => arquivos(path.join(RAIZ, p)));

describe("nenhuma classe de regex perdeu a barra invertida", () => {
  // `/s+/` quer dizer "um ou mais 's'". Quem escreve isso dentro de um
  // `replace` quase sempre queria `/\s+/`. O mesmo vale para d (dígito), w
  // (palavra) e as versões maiúsculas (negadas).
  const SUSPEITO = /replace\(\s*\/[sdwSDW]\+?\//;

  it("nenhum arquivo usa replace(/s+/) e parentes", () => {
    // Varre o CÓDIGO, não o comentário.
    //
    // Sem isto a asserção morde a própria documentação: `shared/reparo-motivo`
    // precisa CITAR a forma errada para explicar o defeito que ele conserta, e
    // o teste acusava o texto que existe para impedir o defeito de voltar.
    const semComentario = (t: string) => t
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^[ \t]*\/\/.*$/gm, "");
    const culpados = TODOS
      .filter(f => SUSPEITO.test(semComentario(readFileSync(f, "utf8"))))
      .map(f => path.relative(RAIZ, f));
    expect(culpados).toEqual([]);
  });

  it("e as três linhas do motivo de devolução usam a forma certa", () => {
    const ler = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf8");
    // `String.raw` para a barra sobreviver a esta própria asserção.
    const CERTO = String.raw`replace(/\s+/g, " ")`;
    expect(ler("server/routes/items.ts")).toContain(CERTO);
    expect(ler("client/src/pages/atendimento.tsx")).toContain(CERTO);
    expect(ler("client/src/pages/solicitacao.tsx")).toContain(CERTO);
  });
});

describe("o que as duas expressões fazem, para o próximo leitor", () => {
  const motivo = "a cor parece desbotada,\n  o roxo é   mais vivo. Preciso que seja Core Purple";

  it("a forma ERRADA come os s e mantém as quebras de linha", () => {
    const errado = motivo.trim().replace(/s+/g, " ");
    expect(errado).toContain("de botada");
    expect(errado).toContain("Preci o");
    expect(errado).toContain("\n");
  });

  it("a forma CERTA junta o espaço em branco e não toca em letra nenhuma", () => {
    const certo = motivo.trim().replace(/\s+/g, " ");
    expect(certo).toContain("desbotada");
    expect(certo).toContain("Preciso");
    expect(certo).toContain("seja");
    expect(certo).not.toContain("\n");
    expect(certo).not.toContain("   ");
  });

  it("e o mínimo de 10 caracteres passa a medir o texto de verdade", () => {
    // "sss sss sss" tem 11 caracteres. Pela conta errada virava " " (1) e o
    // motivo era recusado como curto demais.
    const curto = "sss sss sss";
    expect(curto.trim().replace(/s+/g, " ").length).toBeLessThan(10);
    expect(curto.trim().replace(/\s+/g, " ").length).toBeGreaterThanOrEqual(10);
  });
});
