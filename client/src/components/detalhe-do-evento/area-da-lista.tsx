// ─────────────────────────────────────────────────────────────────────────────
// A ÁREA DA LISTA — mede a largura útil da lista de peças e decide entre a
// tabela (cheia ou compacta) e os cartões.
//
// POR QUE UM COMPONENTE PRÓPRIO. A medida morava na página, mas a página
// primeiro desenha o esqueleto (sem a lista) e o medidor (useElementSize) se
// liga ao elemento UMA vez, na montagem — quando o elemento ainda não existia.
// Resultado: a largura ficava em zero para sempre e a régua caía no padrão
// "tabela cheia" mesmo num tablet de 768 com a barra lateral aberta (área de
// ~500px), onde a tabela de 960 rolava de lado e a coluna de Ações sumia.
// Montando o medidor JUNTO com a lista, a medida existe desde o primeiro quadro.
// ─────────────────────────────────────────────────────────────────────────────
import type { ReactNode } from "react";
import { useDensidadeDoConteudo } from "@/hooks/use-mobile";

export function AreaDaLista({ gap, children }: {
  gap: number;
  children: (densidade: { emCards: boolean; compacto: boolean }) => ReactNode;
}) {
  const { ref, cards, compacto } = useDensidadeDoConteudo<HTMLDivElement>();
  return (
    <div ref={ref} data-testid="area-da-lista" style={{ display: "flex", flexDirection: "column", gap }}>
      {children({ emCards: cards, compacto })}
    </div>
  );
}
