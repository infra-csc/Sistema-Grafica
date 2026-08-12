import { cn } from "@/lib/utils";
import { getStatusMeta } from "@/lib/status";

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
export function StatusBadge({ status, className, short }: StatusBadgeProps) {
  const config = getStatusMeta(status);
  const Icon = config.icon;

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
    >
      <Icon style={{ width: "11px", height: "11px", flexShrink: 0 }} />
      {short ? (
        <span title={config.label}>{config.short}</span>
      ) : (
        <>
          <span className="hidden md:inline">{config.label}</span>
          <span className="md:hidden">{config.short}</span>
        </>
      )}
    </div>
  );
}
