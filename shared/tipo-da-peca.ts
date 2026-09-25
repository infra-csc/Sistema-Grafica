// ─────────────────────────────────────────────────────────────────────────────
// O TIPO DA PEÇA ALINHADO AO CATÁLOGO — a mesma peça, a mesma grafia.
//
// Relato do dono (25/09): "quando eu crio a lista por importar a peça ele meio
// que não cria aquele grupo e quando vou criar individual, ele não fica no
// mesmo grupo". A lista do evento agrupa em Grupo → Tipo, e as duas chaves
// saíam do texto do tipo:
//   · a importação gravava o tipo como veio da planilha ("PLACA KM"), sem o
//     vínculo com o Modelo — e o grupo só se resolve quando o tipo bate com um
//     Modelo ou um grupo do catálogo;
//   · a criação individual grava o NOME do Modelo ("Placa KM") com o vínculo.
// "PLACA KM" e "Placa KM" viravam dois subgrupos (ou um deles ficava sem grupo).
//
// Aqui o tipo que chega (da planilha ou digitado em "+ Novo tipo") é casado,
// ignorando maiúscula, acento e espaço, na ordem:
//   1. o NOME de um Modelo → a grafia do Modelo + o vínculo (standardItemId);
//   2. um tipo que o EVENTO já usa → a mesma grafia (as peças ficam juntas);
//   3. o NOME de um grupo do catálogo → a grafia do grupo;
//   4. nada casou → o tipo como veio (não se inventa grupo).
// Puro: servidor (importação) e tela (formulário da peça) leem daqui.
// ─────────────────────────────────────────────────────────────────────────────

/** A chave de comparação: minúsculas, sem acento, espaços colapsados, "×" = "x". */
export const chaveDoTipo = (s: string | null | undefined): string =>
  (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/×/g, "x")
    .replace(/\s+/g, " ")
    .trim();

export type ModeloDoCatalogo = { id: string; name: string; group?: string | null };

export type TipoAlinhado = { type: string; standardItemId: string | null };

export function alinharTipo(
  tipo: string,
  ctx: { modelos: readonly ModeloDoCatalogo[]; tiposDoEvento?: readonly string[] },
): TipoAlinhado {
  const k = chaveDoTipo(tipo);
  if (!k) return { type: tipo, standardItemId: null };
  const modelo = ctx.modelos.find((m) => chaveDoTipo(m.name) === k);
  if (modelo) return { type: modelo.name, standardItemId: modelo.id };
  const doEvento = (ctx.tiposDoEvento ?? []).find((t) => chaveDoTipo(t) === k);
  if (doEvento) return { type: doEvento, standardItemId: null };
  const grupo = ctx.modelos.find((m) => m.group && chaveDoTipo(m.group) === k)?.group;
  if (grupo) return { type: grupo, standardItemId: null };
  return { type: tipo, standardItemId: null };
}
