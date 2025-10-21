import { User, Shield, Palette, Factory, ChevronDown } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const roleConfig = {
  admin: {
    label: "Administrador",
    icon: Shield,
    color: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
  },
  solicitacao: {
    label: "Solicitação",
    icon: User,
    color: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  },
  arte: {
    label: "Arte",
    icon: Palette,
    color: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  },
  grafica: {
    label: "Gráfica",
    icon: Factory,
    color: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
  },
};

export function ProfileSelector() {
  const { user, setUser } = useAuth();

  const handleSelectProfile = (role: keyof typeof roleConfig) => {
    setUser({
      id: `temp-${role}`,
      name: roleConfig[role].label,
      role,
    });
  };

  if (!user) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" data-testid="button-select-profile">
            <User className="h-4 w-4 mr-2" />
            Selecionar Perfil
            <ChevronDown className="h-3 w-3 ml-2" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Escolha seu perfil</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {Object.entries(roleConfig).map(([role, config]) => {
            const Icon = config.icon;
            return (
              <DropdownMenuItem
                key={role}
                onClick={() => handleSelectProfile(role as keyof typeof roleConfig)}
                data-testid={`menu-item-${role}`}
              >
                <Icon className="h-4 w-4 mr-2" />
                {config.label}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  const currentConfig = roleConfig[user.role];
  const Icon = currentConfig.icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" data-testid="button-current-profile">
          <Icon className="h-4 w-4 mr-2" />
          <span className="hidden sm:inline">{user.name}</span>
          <Badge variant="secondary" className={`ml-2 ${currentConfig.color}`}>
            {currentConfig.label}
          </Badge>
          <ChevronDown className="h-3 w-3 ml-2" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Trocar perfil</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {Object.entries(roleConfig).map(([role, config]) => {
          const RoleIcon = config.icon;
          const isActive = user.role === role;
          return (
            <DropdownMenuItem
              key={role}
              onClick={() => handleSelectProfile(role as keyof typeof roleConfig)}
              disabled={isActive}
              data-testid={`menu-item-${role}`}
            >
              <RoleIcon className="h-4 w-4 mr-2" />
              {config.label}
              {isActive && <span className="ml-auto text-xs text-primary">✓</span>}
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => setUser(null)} data-testid="menu-item-logout">
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
