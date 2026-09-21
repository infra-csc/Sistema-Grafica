// ─────────────────────────────────────────────────────────────────────────────
// displayId — leitura e ordenação do código da peça.
//
// POR QUE ESTE ARQUIVO EXISTE. O complemento (aumento de quantidade depois que
// a peça entrou em produção) introduziu o PRIMEIRO displayId que não é
// "#" + 4 dígitos: `#0062-C1`. Todo lugar que ordenava fazendo
// `parseInt(displayId.replace(/\D/g, ''))` passou a mentir — "#0062-C1" virava
// 621, ordenando entre #0620 e #0622, a centenas de linhas da própria mãe.
// Isso produziria exatamente a duplicidade confusa que o modelo de complemento
// existe para evitar: duas linhas da mesma peça, longe uma da outra, sem que
// nada na tela explique a relação.
//
// Espelho literal de server/storage.ts (parseDisplayId/compareDisplayId/
// assetPrefix) — o servidor não importa código do client e vice-versa, mesma
// disciplina dos dois mapas de status que já convivem. Se um mudar, o outro
// muda junto.
//
// REGRA PARA TODO SORT NOVO: ordenação por displayId usa `compareDisplayId`,
// nunca `replace(/\D/g,'')` nem `localeCompare` cru.
// ─────────────────────────────────────────────────────────────────────────────

/** Quebra "#0062-C1" em { base: 62, seq: 1 }. "#0062" → { base: 62, seq: 0 }. */
export function parseDisplayId(id?: string | null): { base: number; seq: number } {
  const m = String(id ?? "").match(/^#?(\d+)(?:-C(\d+))?/i);
  return { base: m ? parseInt(m[1], 10) : 0, seq: m?.[2] ? parseInt(m[2], 10) : 0 };
}

// MEMÓRIA DO PARSE (perf, 17/09). As filas ordenam milhares de peças com este
// comparador: um sort de 5 mil peças chama a comparação ~60 mil vezes, e cada
// chamada rodava a regex DUAS vezes e alocava dois objetos — para códigos que
// quase nunca mudam entre um render e outro. O resultado do parse fica
// guardado por texto; a regra (a regex e a conta) é a de parseDisplayId, então
// a ordem resultante não muda. O teto impede que uma aba aberta o dia inteiro
// acumule códigos sem fim: passou dele, a memória recomeça do zero (é só
// cache — a próxima comparação refaz o parse).
const PARSE_TETO = 20_000;
const parsePorTexto = new Map<string, readonly [number, number]>();

function parseMemorizado(id?: string | null): readonly [number, number] {
  const texto = String(id ?? "");
  let r = parsePorTexto.get(texto);
  if (r === undefined) {
    // Tupla interna, e não o objeto de parseDisplayId: quem chama
    // parseDisplayId continua recebendo um objeto novo (pode mexer nele); o
    // que fica guardado aqui nunca sai deste arquivo.
    const { base, seq } = parseDisplayId(texto);
    r = [base, seq] as const;
    if (parsePorTexto.size >= PARSE_TETO) parsePorTexto.clear();
    parsePorTexto.set(texto, r);
  }
  return r;
}

/** Ordena #0062 antes de #0062-C1, antes de #0062-C2, antes de #0063. */
export function compareDisplayId(a?: string | null, b?: string | null): number {
  const A = parseMemorizado(a);
  const B = parseMemorizado(b);
  return A[0] !== B[0] ? A[0] - B[0] : A[1] - B[1];
}

/**
 * Separa "#0062-C1" em { base: "#0062", suffix: "-C1" } para colorir só o
 * sufixo na tela (o "-C1" em tom mais escuro dentro do mesmo código).
 */
export function splitDisplayId(id?: string | null): { base: string; suffix: string } {
  const s = String(id ?? "");
  const m = s.match(/^(.*?)(-C\d+)$/i);
  return m ? { base: m[1], suffix: m[2] } : { base: s, suffix: "" };
}
