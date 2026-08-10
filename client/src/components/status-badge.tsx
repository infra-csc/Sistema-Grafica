import { cn } from "@/lib/utils";
import { CheckCircle, Clock, AlertCircle, Package, Truck } from "lucide-react";

interface StatusBadgeProps {
  status: string;
  className?: string;
}

const statusConfig = {
  draft: {
    label: "Rascunho",
    shortLabel: "Rascunho",
    color: "border",
    bg: "#f5f5f4",
    text: "#57534e",
    border: "#e7e5e4",
    icon: Clock,
  },
  created: {
    label: "Criado",
    shortLabel: "Criado",
    bg: "#fef3c7",
    text: "#b45309",
    border: "#fde68a",
    icon: Clock,
  },
  completed: {
    label: "Finalizado",
    shortLabel: "Finalizado",
    bg: "#f0fdf4",
    text: "#15803d",
    border: "#bbf7d0",
    icon: CheckCircle,
  },
  requested: {
    // Era "Rascunho" — mesmo rótulo de `draft`, mas são status distintos.
    // "Solicitado" alinha com o que o Painel Geral (StatusPill) já exibe.
    label: "Solicitado",
    shortLabel: "Solicitado",
    bg: "#fef3c7",
    text: "#b45309",
    border: "#fde68a",
    icon: Clock,
  },
  awaiting_linking: {
    label: "Aguardando Vinculação",
    shortLabel: "Ag. Vinculação",
    bg: "#fff7ed",
    text: "#c2410c",
    border: "#fed7aa",
    icon: Clock,
  },
  awaiting_submission: {
    label: "Aguardando Envio",
    shortLabel: "Ag. Envio",
    bg: "#eff6ff",
    text: "#2563eb",
    border: "#bfdbfe",
    icon: Clock,
  },
  awaiting_approval: {
    label: "Aguardando Aprovação",
    shortLabel: "Ag. Aprovação",
    bg: "#fef2f2",
    text: "#b91c1c",
    border: "#fecaca",
    icon: Clock,
  },
  awaiting_finalization: {
    label: "Aguardando Finalização",
    shortLabel: "Ag. Finalização",
    bg: "#f5f3ff",
    text: "#7c3aed",
    border: "#ddd6fe",
    icon: Clock,
  },
  awaiting_final_review: {
    label: "Aguardando Revisão Final",
    shortLabel: "Ag. Revisão",
    bg: "#f5f3ff",
    text: "#6d28d9",
    border: "#ddd6fe",
    icon: Clock,
  },
  ready_for_production: {
    label: "Pronto p/ Produção",
    shortLabel: "Pronto Prod.",
    bg: "#ecfeff",
    text: "#0e7490",
    border: "#a5f3fc",
    icon: CheckCircle,
  },
  approved: {
    label: "Liberado",
    shortLabel: "Liberado",
    bg: "#f0fdf4",
    text: "#15803d",
    border: "#bbf7d0",
    icon: CheckCircle,
  },
  inProduction: {
    label: "Em Produção",
    shortLabel: "Produzindo",
    bg: "#fff7ed",
    text: "#c2410c",
    border: "#fed7aa",
    icon: Package,
  },
  produced: {
    label: "Produzido",
    shortLabel: "Produzido",
    bg: "#f3e8ff",
    text: "#7e22ce",
    border: "#e9d5ff",
    icon: CheckCircle,
  },
  conferred: {
    label: "Conferido",
    shortLabel: "Conferido",
    bg: "#ecfeff",
    text: "#0e7490",
    border: "#a5f3fc",
    icon: CheckCircle,
  },
  delivered: {
    label: "Entregue",
    shortLabel: "Entregue",
    bg: "#f0fdf4",
    text: "#047857",
    border: "#a7f3d0",
    icon: Truck,
  },
  awaiting_sponsor_approval: {
    label: "Aguardando Aprovação",
    shortLabel: "Ag. Aprovação",
    bg: "#fef2f2",
    text: "#b91c1c",
    border: "#fecaca",
    icon: Clock,
  },
  sponsor_approved: {
    label: "Aguardando Finalização",
    shortLabel: "Ag. Finalização",
    bg: "#f5f3ff",
    text: "#7c3aed",
    border: "#ddd6fe",
    icon: Clock,
  },
  awaiting_creator_review: {
    label: "Aguardando Finalização",
    shortLabel: "Ag. Finalização",
    bg: "#f5f3ff",
    text: "#6d28d9",
    border: "#ddd6fe",
    icon: Clock,
  },
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.created;
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
      <span className="hidden md:inline">{config.label}</span>
      <span className="md:hidden">{config.shortLabel}</span>
    </div>
  );
}
