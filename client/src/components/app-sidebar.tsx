import { Calendar, CheckCircle, Factory, FileText, Home, Layers, LayoutDashboard, Activity, BarChart3, Users, Building2, UserCheck, ClipboardCheck, Link2 } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/auth-context";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
} from "@/components/ui/sidebar";

const menuItems = [
  {
    title: "Painel Geral",
    url: "/",
    icon: LayoutDashboard,
  },
  {
    title: "Eventos",
    url: "/eventos",
    icon: Home,
  },
  {
    title: "Vincular Patrocinadores",
    url: "/vincular-patrocinadores",
    icon: Link2,
    roles: ["arte", "admin"],
  },
  {
    title: "Arte",
    url: "/arte",
    icon: CheckCircle,
  },
  {
    title: "Atendimento",
    url: "/atendimento",
    icon: UserCheck,
    roles: ["atendimento", "admin"],
  },
  {
    title: "Solicitação",
    url: "/solicitacao",
    icon: ClipboardCheck,
    roles: ["solicitacao", "admin"],
  },
  {
    title: "Gráfica",
    url: "/grafica",
    icon: Factory,
  },
  {
    title: "Modelos",
    url: "/modelos",
    icon: Layers,
  },
  {
    title: "Calendário",
    url: "/calendario",
    icon: Calendar,
  },
  {
    title: "Histórico",
    url: "/historico",
    icon: Activity,
  },
  {
    title: "Análises",
    url: "/analises",
    icon: BarChart3,
  },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { hasPermission, user } = useAuth();

  // Filter menu items based on user role
  const filteredMenuItems = menuItems.filter(item => {
    if (item.roles) {
      return item.roles.includes(user?.role || '');
    }
    return true;
  });

  return (
    <Sidebar className="!bg-[#f1f5f9]">
      <SidebarHeader className="h-16 flex items-center px-4 border-b !bg-white" style={{ borderColor: '#e5e7eb' }}>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-[#2d2d2d] to-[#06b6d4] flex items-center justify-center text-white font-bold text-lg shrink-0">
            N
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-semibold leading-tight !text-[#2d2d2d]">Sistema de Gestão de Gráfica</h1>
            <p className="text-xs !text-[#6b6760]">NORTE Marketing Esportivo</p>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent className="!bg-[#f1f5f9]">
        <SidebarGroup>
          <SidebarGroupLabel className="!text-[#2d2d2d]">Menu Principal</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {filteredMenuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={location === item.url} data-testid={`nav-${item.title.toLowerCase().replace(' ', '-')}`}>
                    <Link href={item.url}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {hasPermission("admin") && (
          <SidebarGroup>
            <SidebarGroupLabel className="!text-[#2d2d2d]">Administração</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location === "/usuarios"} data-testid="nav-usuarios">
                    <Link href="/usuarios">
                      <Users className="h-4 w-4" />
                      <span>Usuários</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location === "/patrocinadores"} data-testid="nav-patrocinadores">
                    <Link href="/patrocinadores">
                      <Building2 className="h-4 w-4" />
                      <span>Patrocinadores</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
    </Sidebar>
  );
}
