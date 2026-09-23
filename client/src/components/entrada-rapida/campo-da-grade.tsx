import { FilterSelect, type FilterOption } from "@/components/filter-select";
import { T, TOM } from "@/lib/theme";
import { fieldStyle } from "./estilos";

/**
 * CampoDaGrade — Material e Acabamento da grade de lote.
 *
 * Eram `<select>` NATIVOS. No meio de uma grade inteiramente desenhada pela
 * casa, eles abriam o menu do sistema operacional: fundo azul do Windows,
 * fonte do sistema, e a lista crua com as duplicatas de grafia do cadastro
 * visíveis lado a lado ("sanett" logo abaixo de "Sanett", "ps" abaixo de
 * "PS"). É o controle da casa agora — ver o VOCABULÁRIO no topo de
 * components/filter-select.tsx, job 9 (campo de escolha em formulário).
 *
 * O QUE NÃO PODIA REGREDIR, e não regrediu: esta grade é lançamento em lote,
 * onde a velocidade de digitação vale mais que a beleza do menu. O `<select>`
 * nativo dava teclado de graça; o FilterSelect ganhou o equivalente antes
 * desta troca acontecer —
 *   · o gatilho continua achável por `[data-nav-row][data-nav-field]`, que é
 *     como `focusNextField` encontra o próximo campo (por isso `triggerProps`);
 *   · digitar uma letra com o menu fechado abre JÁ na opção certa ("l" →
 *     Lona), como o nativo fazia;
 *   · Enter escolhe E chama `onCommit`, que avança para o campo seguinte —
 *     exatamente o que `navHandlers` fazia no nativo;
 *   · ↑/↓/Home/End andam pela lista, Esc fecha sem fechar o Dialog em volta.
 * `hideSearch` de propósito: as listas têm ~6 a 15 itens e a caixa de busca
 * roubaria metade do painel numa coluna de 84px — o typeahead cobre o caso.
 */
export function CampoDaGrade({
  label, value, onChange, options, invalid, ri, field, testId, onCommit,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: FilterOption[];
  invalid: boolean;
  ri: number;
  field: number;
  testId: string;
  onCommit: () => void;
}) {
  return (
    <FilterSelect
      kind="field"
      hideSearch
      fullWidth
      hideWhenEmpty={false}
      label={label}
      placeholder="—"
      value={value}
      onChange={onChange}
      options={options}
      invalid={invalid}
      testId={testId}
      onCommit={onCommit}
      panelWidth={210}
      emptyText="Nada cadastrado"
      triggerProps={{ "data-nav-row": ri, "data-nav-field": String(field) }}
      // Mesma altura, raio e fundo dos `<input>` vizinhos da linha: numa grade,
      // um campo com métrica própria salta aos olhos como erro de alinhamento.
      // Vazio com a linha já iniciada acende o vermelho da validação, como
      // `errStyle` fazia. #57534e sobre #fff5f5 = 6,49:1 ✓; o placeholder "—"
      // sobre o #f3f4f3 do campo dá 6,72:1 ✓ (o #78716c padrão daria 4,25:1 ✗
      // em 13px, por isso a cor vem daqui e não do componente).
      triggerStyle={{
        ...fieldStyle,
        height: 'auto',
        padding: '5px 6px 5px 8px',
        border: '1.5px solid transparent',
        backgroundColor: invalid ? TOM.perigo.bg : T.low,
        color: value ? T.text : T.apoio,
        fontWeight: 400,
      }}
    />
  );
}
