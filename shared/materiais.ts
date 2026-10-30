// ─────────────────────────────────────────────────────────────────────────────
// O CADASTRO DE MATERIAIS — a mesma lista que o app oferece ao cadastrar uma
// peça (detalhe do evento, Entrada Rápida): os materiais padrão + os
// cadastrados (catalog_options, kind "material") + os dos Modelos.
//
// O material da peça é texto: peças antigas ou importadas trazem grafias que
// não estão no cadastro ("LONA MOLDE", "PS 2MM"…). Os relatórios filtram pelo
// cadastro e juntam o resto em "Outros (fora do cadastro)" — nada some.
// ─────────────────────────────────────────────────────────────────────────────

/** Os materiais que o app oferece mesmo sem nada cadastrado. */
export const MATERIAIS_PADRAO = ["Adesivo", "Lona", "Madeira", "Sanett", "Tecido", "Tecido Pet"] as const;

/** A opção do filtro que junta os materiais das peças fora do cadastro. */
export const OUTROS_MATERIAIS = "__outros__";
export const ROTULO_OUTROS_MATERIAIS = "Outros (fora do cadastro)";

/**
 * O cadastro, como os relatórios o comparam: rótulos já normalizados (a
 * mesma `normalizar` que o relatório aplica ao material da peça), sem
 * repetição, em ordem alfabética.
 */
export function materiaisDoCadastro(
  normalizar: (s: string) => string,
  catalogo: ReadonlyArray<{ kind: string; value: string }>,
  modelos: ReadonlyArray<{ material?: string | null }>,
): string[] {
  const todos = [
    ...MATERIAIS_PADRAO,
    ...catalogo.filter((o) => o.kind === "material").map((o) => o.value),
    ...modelos.map((m) => m.material ?? ""),
  ].map(normalizar).filter(Boolean);
  return Array.from(new Set(todos)).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

/**
 * O filtro de material de um relatório. Vazio = todos (null: sem filtro).
 * `OUTROS_MATERIAIS` escolhido aceita o material que não está no cadastro.
 */
export function filtroDeMaterial(
  escolhidos: ReadonlyArray<string>,
  cadastro: ReadonlyArray<string>,
): ((material: string) => boolean) | null {
  if (escolhidos.length === 0) return null;
  const sim = new Set(escolhidos);
  const doCadastro = new Set(cadastro);
  const outros = sim.has(OUTROS_MATERIAIS);
  return (m) => sim.has(m) || (outros && !doCadastro.has(m));
}
