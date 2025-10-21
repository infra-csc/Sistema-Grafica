import { cn } from "@/lib/utils";
import { CheckCircle, Clock, AlertCircle, Package, Truck } from "lucide-react";

interface StatusBadgeProps {
  status: string;
  className?: string;
}

const statusConfig = {
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
    color: "bg-status-pending/20 text-status-pending border-status-pending",
    icon: Clock,
  },
  approved: {
    label: "Liberado",
    color: "bg-status-inProgress/20 text-status-inProgress border-status-inProgress",
    icon: CheckCircle,
  },
  inProduction: {
    label: "Em Produção",
    color: "bg-status-production/20 text-status-production border-status-production",
    icon: Package,
  },
  produced: {
    label: "Produzido",
    color: "bg-status-completed/20 text-status-completed border-status-completed",
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
