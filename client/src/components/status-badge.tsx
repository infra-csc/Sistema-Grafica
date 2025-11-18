import { cn } from "@/lib/utils";
import { CheckCircle, Clock, AlertCircle, Package, Truck } from "lucide-react";

interface StatusBadgeProps {
  status: string;
  className?: string;
}

const statusConfig = {
  draft: {
    label: "Rascunho",
    color: "bg-muted/80 text-muted-foreground border-muted-foreground/30",
    icon: Clock,
  },
  created: {
    label: "Criado",
    color: "bg-status-pending/20 text-status-pending border-status-pending",
    icon: Clock,
  },
  completed: {
    label: "Finalizado",
    color: "bg-status-completed/20 text-status-completed border-status-completed",
    icon: CheckCircle,
  },
  requested: {
    label: "Solicitado",
    color: "bg-yellow-500/20 text-yellow-700 dark:text-yellow-500 border-yellow-500",
    icon: Clock,
  },
  awaiting_sponsor_approval: {
    label: "Aguardando Patrocinador",
    color: "bg-orange-500/20 text-orange-700 dark:text-orange-500 border-orange-500",
    icon: Clock,
  },
  sponsor_approved: {
    label: "Patrocinador Aprovou",
    color: "bg-blue-500/20 text-blue-700 dark:text-blue-500 border-blue-500",
    icon: CheckCircle,
  },
  awaiting_creator_review: {
    label: "Aguardando Revisão Final",
    color: "bg-purple-500/20 text-purple-700 dark:text-purple-500 border-purple-500",
    icon: Clock,
  },
  ready_for_production: {
    label: "Pronto p/ Produção",
    color: "bg-cyan-500/20 text-cyan-700 dark:text-cyan-500 border-cyan-500",
    icon: CheckCircle,
  },
  approved: {
    label: "Liberado",
    color: "bg-green-500/20 text-green-700 dark:text-green-500 border-green-500",
    icon: CheckCircle,
  },
  inProduction: {
    label: "Em Produção",
    color: "bg-status-production/20 text-status-production border-status-production",
    icon: Package,
  },
  produced: {
    label: "Produzido",
    color: "bg-fuchsia-500/20 text-fuchsia-700 dark:text-fuchsia-400 border-fuchsia-500",
    icon: CheckCircle,
  },
  delivered: {
    label: "Entregue",
    color: "bg-status-completed/20 text-status-completed border-status-completed",
    icon: Truck,
  },
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.created;
  const Icon = config.icon;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border whitespace-nowrap",
        config.color,
        className
      )}
      data-testid={`badge-${status}`}
    >
      <Icon className="h-3 w-3" />
      <span>{config.label}</span>
    </div>
  );
}
