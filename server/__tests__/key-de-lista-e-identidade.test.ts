// ─────────────────────────────────────────────────────────────────────────────
// KEY DE LISTA VEM DA IDENTIDADE, NUNCA DO CONTEÚDO EDITÁVEL.
//
// O defeito que este arquivo existe para impedir, contado uma vez:
//
// A tela caiu em produção com "Maximum update depth exceeded" (React #185) no
// momento em que alguém RENOMEOU uma peça. A stack minificada, decodificada
// contra o bundle publicado, terminava em `composeRefs`/`setRef` do Radix e no
// `ref` callback do `usePresence` — ou seja, o nó sob um ref composto estava
// sendo trocado a cada commit, e cada troca agendava novo render.
//
// A causa dessa família de falha é sempre a mesma: `key` derivada de um campo
// que o usuário edita. Em Vincular Patrocinadores a linha agrupadora era
// `key={`type-${item.type}-${itemIndex}`}`. Mudar a key NÃO é re-renderizar: é
// desmontar aquele nó e montar outro no lugar. Como a linha carrega um
// Checkbox do Radix, a remontagem troca o nó sob o ref composto — que é
// exatamente o que o Presence realimenta.
//
// A regra, então: key identifica a LINHA, não descreve o conteúdo dela. `id`
// sobrevive ao rename; `type`, `name`, `description`, `material` e `finish`
// não. Este teste varre o cliente inteiro porque a próxima ocorrência não vai
// ser nesta tela.
//
// Lê o FONTE de propósito: o defeito é sintático e vale para todas as telas de
// uma vez, então uma varredura acha o que 30 testes de render não achariam.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";

const RAIZ = path.resolve(__dirname, "../../client/src");

/** Campos que o usuário edita — e que portanto não identificam nada. */
const CAMPOS_MUTAVEIS = ["type", "name", "description", "material", "finish", "measurement"];

function arquivosTsx(dir: string): string[] {
  return readdirSync(dir).flatMap(nome => {
    const p = path.join(dir, nome);
    if (statSync(p).isDirectory()) return arquivosTsx(p);
    return /\.tsx$/.test(nome) ? [p] : [];
  });
}

/**
 * Uma `key` é suspeita quando interpola um campo mutável SEM ancorar num id.
 * `key={`${it.id}-${s.name}-${i}`}` passa: o id já identifica a linha.
 */
function keysSuspeitas(fonte: string): string[] {
  const achados: string[] = [];
  const re = /key=\{`[^`]*`\}/g;
  for (const m of fonte.match(re) ?? []) {
    const temMutavel = CAMPOS_MUTAVEIS.some(c => m.includes(`.${c}}`));
    const temId = /\.id\b/.test(m);
    if (temMutavel && !temId) achados.push(m);
  }
  return achados;
}

describe("key de lista é identidade, não conteúdo", () => {
  const arquivos = arquivosTsx(RAIZ);

  it("encontra arquivos para varrer (a varredura não passou por vazia)", () => {
    expect(arquivos.length).toBeGreaterThan(20);
  });

  it("nenhuma key deriva de campo que o usuário renomeia", () => {
    const ofensores = arquivos.flatMap(f => {
      const achados = keysSuspeitas(readFileSync(f, "utf8"));
      return achados.map(k => `${path.relative(RAIZ, f)}: ${k}`);
    });
    expect(ofensores).toEqual([]);
  });

  it("o agrupador de tipo do Vincular ancora no id da peça", () => {
    // O prefixo virou `tipo-` quando as duas arvores da tela se fundiram numa
    // tabela so; a regra que este teste guarda e outra e continua de pe — a
    // key sai do ID da primeira peca do tipo, nunca do `item.type`, que e o
    // campo que o usuario RENOMEIA.
    const fonte = readFileSync(path.join(RAIZ, "pages/vincular-patrocinadores.tsx"), "utf8");
    expect(fonte).toContain("key={`tipo-${item.id}`}");
    expect(fonte).not.toContain("key={`type-${item.type}-${itemIndex}`}");
  });
});
