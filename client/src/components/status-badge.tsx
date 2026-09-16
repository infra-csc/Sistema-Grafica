import { cn } from "@/lib/utils";
import { getStatusMeta, descricaoDoStatus } from "@/lib/status";
import { useBalaoDeStatus } from "@/components/ui/balao-de-status";

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
// O SIGNIFICADO VEM JUNTO (16/09). "Aguardando Finalização" dizia a etapa, não
// de quem é a vez nem o que falta. O `title` agora carrega a frase inteira
// (descricaoDoStatus), o leitor de tela ouve "vez da Arte" depois do rótulo, e
// tocar/clicar no selo fora de uma linha clicável abre o balão com o mesmo
// texto — no celular não há hover para o `title` aparecer.
export function StatusBadge({ status, className, short }: StatusBadgeProps) {
  const config = getStatusMeta(status);
  const Icon = config.icon;
  const { guia, handlers, describedBy, balao } = useBalaoDeStatus(status);

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "5px",
        padding: "3px 10px",
        borderRadius: "99px",
        fontSize: "11px",
        fontWeight: "600",
        whiteSpace: "nowrap",
        backgroundColor: config.bg,
        color: config.text,
        border: `1px solid ${config.border}`,
      }}
      className={cn(className)}
      data-testid={`badge-${status}`}
      // O rótulo curto ("Aguard.") some a informação no celular: o title
      // devolve o nome completo — e agora o significado — a quem passa o
      // ponteiro ou segura o dedo.
      title={descricaoDoStatus(status) ?? config.label}
      aria-describedby={describedBy}
      {...handlers}
    >
      <Icon aria-hidden="true" style={{ width: "11px", height: "11px", flexShrink: 0 }} />
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
    </div>
  );
}
