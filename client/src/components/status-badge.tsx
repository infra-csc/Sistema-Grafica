import { cn } from "@/lib/utils";
import { getStatusMeta, descricaoDoStatus } from "@/lib/status";
import { useBalaoDeStatus } from "@/components/ui/balao-de-status";
import { Selo } from "@/components/ui/selo";

interface StatusBadgeProps {
  status: string;
  className?: string;
  /** Força o rótulo curto em qualquer viewport — para tabelas densas com
      largura de coluna fixa, onde o rótulo completo vazava sobre a coluna
      vizinha. */
  short?: boolean;
}

// Badge de status com ícone. Cores/rótulos vêm de lib/status.ts (fonte única) —
// antes este componente tinha um mapa próprio que divergia do Painel Geral.
//
// É O <Selo> COM ÍCONE, não um segundo selo. StatusBadge e StatusPill existiam
// como duas peças independentes que desenhavam a MESMA coisa com números
// diferentes: 99px de raio contra 999, peso 600 contra 700, gap 5 contra 6.
// Ninguém consegue nomear a diferença olhando, mas as duas apareciam lado a
// lado na ficha da peça. Agora a única diferença entre eles é a real — este
// mostra ícone e rótulo responsivo, aquele mostra bolinha e rótulo curto.
//
// O SIGNIFICADO VEM JUNTO (16/09). "Aguardando Finalização" dizia a etapa, não
// de quem é a vez nem o que falta. O `title` agora carrega a frase inteira
// (descricaoDoStatus), o leitor de tela ouve "vez da Arte" depois do rótulo, e
// tocar/clicar no selo fora de uma linha clicável abre o balão com o mesmo
// texto — no celular não há hover para o `title` aparecer.
export function StatusBadge({ status, className, short }: StatusBadgeProps) {
  const config = getStatusMeta(status);
  const { guia, handlers, describedBy, balao } = useBalaoDeStatus(status);

  return (
    <Selo
      cores={config}
      icone={config.icon}
      className={cn(className)}
      data-testid={`badge-${status}`}
      // O rótulo curto ("Aguard.") some a informação no celular: o title
      // devolve o nome completo — e agora o significado — a quem passa o
      // ponteiro ou segura o dedo.
      title={descricaoDoStatus(status) ?? config.label}
      aria-describedby={describedBy}
      {...handlers}
    >
      {short ? (
        <span>{config.short}</span>
      ) : (
        <>
          <span className="hidden md:inline">{config.label}</span>
          {/* aria-hidden na versão curta + sr-only com o nome inteiro: o
              leitor de tela ouvia a abreviação. */}
          <span className="md:hidden" aria-hidden="true">{config.short}</span>
          <span className="sr-only md:hidden">{config.label}</span>
        </>
      )}
      {/* Curtíssimo de propósito: numa tabela de 200 linhas, o parágrafo
          inteiro a cada linha afogaria a leitura. */}
      {guia && <span className="sr-only">{` (${guia.vez})`}</span>}
      {balao}
    </Selo>
  );
}
