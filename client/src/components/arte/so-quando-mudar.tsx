import { memo, type ReactNode } from "react";

/**
 * Desenha `render()` SÓ quando algum valor de `deps` mudar (comparação por
 * identidade, como as dependências de um useMemo).
 *
 * PORQUÊ. Arte e Atendimento são componentes únicos de milhares de linhas: o
 * estado de cada modal (motivo digitado, arquivo arrastado, toast, trava de
 * envio) mora no MESMO componente que desenha a fila. Sem uma fronteira, cada
 * tecla no motivo de "Devolver" refazia a fila inteira — cem linhas com
 * Popover, Checkbox, chips e prazo — só para descobrir que nada mudou nelas.
 *
 * Por que não mover a fila para um componente próprio: dezenas de testes leem
 * o TEXTO das páginas e fixam trechos dessa fila; o memo ao redor da mesma
 * JSX dá a fronteira sem mudar uma linha do que é desenhado.
 *
 * CONTRATO para quem usa: `deps` tem de listar TUDO o que a JSX lê e que pode
 * mudar (dados, filtros, seleção, largura). Funções que só chamam `setX` do
 * useState podem ficar de fora — o setter é estável, e a closure antiga faz a
 * mesma coisa que a nova. Quando os deps mudam, a `render` usada é a do render
 * atual, então nunca se desenha com valor velho.
 */
export const SoQuandoMudar = memo(
  function SoQuandoMudar({ render }: { deps: readonly unknown[]; render: () => ReactNode }) {
    return <>{render()}</>;
  },
  (antes, depois) =>
    antes.deps.length === depois.deps.length
    && antes.deps.every((d, i) => Object.is(d, depois.deps[i])),
);
