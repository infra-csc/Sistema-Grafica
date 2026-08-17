/**
 * EventFilterDropdown — CASCA FINA sobre o FilterSelect.
 *
 * Era um SEGUNDO menu, copiado do FilterSelect e especializado em evento. As
 * duas cópias foram divergindo: o FilterSelect ganhou ícone da dimensão, selo
 * de ativo, virada automática na borda da janela, agrupamento, foco visível
 * por teclado, Esc que não fecha o Dialog em volta e — agora — navegação por
 * setas. Esta cópia ficou onde estava. Na mesma faixa da Arte, o gatilho de
 * Evento e o de Patrocinador eram controles diferentes fingindo ser o mesmo.
 *
 * Pior: a linha "Todos os Eventos" daqui ainda era uma barra sólida #F97316
 * com texto branco de 12px — 2,90:1, reprovado em AA, e justamente a linha que
 * o dono do NORTE fotografou como referência do "filtro nota 10". O
 * FilterSelect já tinha corrigido isso para um tint (#c2410c sobre #FFF7ED =
 * 4,88:1 ✓). Delegar conserta o contraste em toda tela que usa evento sem
 * tocar em nenhuma delas.
 *
 * POR QUE NÃO APAGAR O ARQUIVO: sete telas o importam, e três delas
 * (arte.tsx, grafica.tsx, solicitacao.tsx) estão travadas com outros agentes.
 * Como casca, a migração dessas três acontece sem editar uma linha lá dentro.
 * Quando não houver mais consumidor, o arquivo sai.
 *
 * A busca sem acento continua valendo: ela agora mora no FilterSelect, que usa
 * `normalizarBusca` de `lib/utils` — o mesmo casamento que faz "so quero"
 * achar "SÓ QUERO PEDALAR SP". Não há um segundo casador de rótulo aqui.
 */
import { FilterSelect } from "@/components/filter-select";

export interface EventOption {
  value: string;
  label: string;
  count?: number;
  dotColor?: string;
}

interface Props {
  // Modo simples
  value?: string;
  onChange?: (v: string) => void;
  // Modo múltiplo
  values?: string[];
  onValuesChange?: (v: string[]) => void;
  options: EventOption[];
  allLabel?: string;
}

export function EventFilterDropdown({
  value,
  onChange,
  values,
  onValuesChange,
  options,
  allLabel = "Todos os Eventos",
}: Props) {
  const multiple = values !== undefined && onValuesChange !== undefined;

  return (
    <FilterSelect
      label="Evento"
      allLabel={allLabel}
      // O gatilho vazio dizia "Todos os Eventos", não "Evento" — sem isto, sete
      // telas mudariam de texto de uma vez.
      showAllLabelWhenEmpty
      // Este menu SEMPRE apareceu, inclusive com zero eventos na fila; o
      // FilterSelect some por padrão. Some-lo agora arrancaria o controle da
      // faixa exatamente no momento em que o operador precisa entender por que
      // a lista está vazia.
      hideWhenEmpty={false}
      // "3 eventos" no lugar de "3 selecionados" — e o selo numérico redundante
      // ao lado do texto deixa de ser desenhado.
      unitLabel={{ one: "evento", many: "eventos" }}
      searchPlaceholder="Buscar evento..."
      emptyText="Nenhum evento encontrado"
      // 300px: o meio-termo entre os 260 mínimos e os 340 máximos que este
      // menu tinha, para nomes de evento longos não quebrarem.
      panelWidth={300}
      // Sem `icon` de propósito. Nas faixas onde ele vive (Arte, Gráfica,
      // Painel Geral) os gatilhos vizinhos de Patrocinador e Tipo não têm
      // ícone: dar um só a Evento deixaria a faixa MENOS uniforme, que é o
      // oposto do pedido.
      options={options}
      {...(multiple
        ? { values, onValuesChange }
        : { value, onChange })}
    />
  );
}
