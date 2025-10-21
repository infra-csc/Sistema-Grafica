import { Calendar, CheckCircle, Factory, FileText, Home, Layers, LayoutDashboard } from "lucide-react";
import { Link, useLocation } from "wouter";
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
    title: "Arte",
    url: "/arte",
    icon: CheckCircle,
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
];

export function AppSidebar() {
  const [location] = useLocation();

  return (
    <Sidebar>
      <SidebarHeader className="h-16 flex items-center px-4 border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          <FileText className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-base font-semibold text-sidebar-foreground">Gestão Gráfica</h1>
            <p className="text-xs text-muted-foreground">Produção e Controle</p>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menu Principal</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
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
      </SidebarContent>
    </Sidebar>
  );
}
