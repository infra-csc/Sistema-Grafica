// ─────────────────────────────────────────────────────────────────────────────
// A TABELA de docs/estados-da-peca.md, montada a partir de TRANSICOES.
//
// A doc tem texto escrito à mão (as regras que não cabem numa tabela, as
// divergências anotadas) e UMA seção gerada, entre os marcadores abaixo. O
// script `scripts/gerar-doc-estados-da-peca.ts` reescreve só essa seção, e
// `estados-da-peca-doc.test.ts` quebra quando ela não bate com a tabela
// (alguém mudou a máquina e não regerou a doc).
// ─────────────────────────────────────────────────────────────────────────────
import { TRANSICOES, FICA_ONDE_ESTA, VOLTA_PARA_ONDE_ESTAVA, type Origem, type Transicao } from "./maquina-de-estados";

export const MARCA_INICIO = "<!-- gerado:inicio — scripts/gerar-doc-estados-da-peca.ts, a partir de shared/maquina-de-estados.ts. Não edite à mão: mude a tabela e rode o script. -->";
export const MARCA_FIM = "<!-- gerado:fim -->";

const codigo = (s: string) => `\`${s}\``;

function textoDaOrigem(de: Origem): string {
  if (Array.isArray(de)) return (de as readonly string[]).map(codigo).join(", ");
  const menos = (de as { todosMenos: readonly string[] }).todosMenos;
  return menos.length === 0 ? "qualquer status" : `qualquer status, menos ${menos.map(codigo).join(", ")}`;
}

function textoDoDestino(t: Transicao): string {
  if (t.para === FICA_ONDE_ESTA) return "fica onde está";
  if (t.para === VOLTA_PARA_ONDE_ESTAVA) return "volta para onde estava";
  return codigo(t.para);
}

const celula = (s: string) => s.replace(/\|/g, "\\|");

/** A seção gerada, marcadores inclusive. */
export function secaoGeradaDosEstados(): string {
  const linhas: string[] = [
    MARCA_INICIO,
    "",
    "Cada linha é um desfecho: de onde a peça sai, para onde vai e quem pode (aqui o",
    "admin aparece com todos). As condições são o que a rota confere além do status e",
    "do papel. \"Fica onde está\" = a ação mexe em outra coisa (a linha do",
    "patrocinador, o reaproveitamento) e a peça não muda de status.",
    "",
  ];
  // Uma subseção por conjunto de rotas, na ordem da tabela.
  const grupos = Array.from(new Set(TRANSICOES.map((t) => t.rotas.join(" · "))));
  for (const grupo of grupos) {
    linhas.push(`### ${grupo}`, "");
    linhas.push("| Ação | De | Para | Quem | Condições |", "| --- | --- | --- | --- | --- |");
    for (const t of TRANSICOES.filter((x) => x.rotas.join(" · ") === grupo)) {
      linhas.push(`| ${t.acao} | ${celula(textoDaOrigem(t.de))} | ${textoDoDestino(t)} | ${t.papeis.join(", ")} | ${celula(t.condicoes.join("; ") || "—")} |`);
    }
    linhas.push("");
  }
  linhas.push(MARCA_FIM);
  return linhas.join("\n");
}

/** A seção gerada que está hoje no texto da doc (ou null, sem os marcadores). */
export function secaoGeradaNoTexto(doc: string): string | null {
  const i = doc.indexOf("<!-- gerado:inicio");
  const f = doc.indexOf(MARCA_FIM);
  if (i < 0 || f < i) return null;
  return doc.slice(i, f + MARCA_FIM.length);
}

/** O texto da doc com a seção gerada trocada pela atual. */
export function aplicarSecaoGerada(doc: string): string {
  const atual = secaoGeradaNoTexto(doc);
  if (atual === null) throw new Error(`docs/estados-da-peca.md sem os marcadores ${MARCA_INICIO} … ${MARCA_FIM}`);
  const nova = secaoGeradaDosEstados();
  return doc.replace(atual, () => nova);
}
