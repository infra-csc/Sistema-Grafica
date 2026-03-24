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
  { title: "Painel Geral", url: "/", icon: LayoutDashboard },
  { title: "Eventos", url: "/eventos", icon: Home },
  { title: "Vincular Patrocinadores", url: "/vincular-patrocinadores", icon: Link2, roles: ["arte", "admin"] },
  { title: "Arte", url: "/arte", icon: CheckCircle },
  { title: "Atendimento", url: "/atendimento", icon: UserCheck, roles: ["atendimento", "admin"] },
  { title: "Solicitação", url: "/solicitacao", icon: ClipboardCheck, roles: ["solicitacao", "admin"] },
  { title: "Gráfica", url: "/grafica", icon: Factory },
  { title: "Modelos", url: "/modelos", icon: Layers },
  { title: "Calendário", url: "/calendario", icon: Calendar },
  { title: "Histórico", url: "/historico", icon: Activity },
  { title: "Análises", url: "/analises", icon: BarChart3 },
];

const adminItems = [
  { title: "Usuários", url: "/usuarios", icon: Users },
  { title: "Patrocinadores", url: "/patrocinadores", icon: Building2 },
];

function NavItem({ item, isActive }: { item: { title: string; url: string; icon: React.ElementType }; isActive: boolean }) {
  const Icon = item.icon;
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={isActive} data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, '-')}`}>
        <Link
          href={item.url}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '10px 12px',
            borderRadius: '8px',
            fontSize: '13.5px',
            fontWeight: isActive ? '500' : '400',
            color: isActive ? '#1c1917' : '#6b7280',
            backgroundColor: isActive ? '#f5f5f4' : 'transparent',
            textDecoration: 'none',
            transition: 'background-color 0.15s ease, color 0.15s ease',
          }}
          onMouseEnter={e => {
            if (!isActive) {
              (e.currentTarget as HTMLElement).style.backgroundColor = '#fafaf9';
              (e.currentTarget as HTMLElement).style.color = '#1c1917';
            }
          }}
          onMouseLeave={e => {
            if (!isActive) {
              (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
              (e.currentTarget as HTMLElement).style.color = '#6b7280';
            }
          }}
        >
          <Icon
            className="h-4 w-4 shrink-0"
            style={{ color: isActive ? '#f97316' : '#9ca3af' }}
          />
          <span>{item.title}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

export function AppSidebar() {
  const [location] = useLocation();
  const { hasPermission, user } = useAuth();

  const filteredMenuItems = menuItems.filter(item => {
    if ((item as any).roles) {
      return (item as any).roles.includes(user?.role || '');
    }
    return true;
  });

  const sectionLabelStyle: React.CSSProperties = {
    fontSize: '11px',
    fontWeight: '600',
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: '0.07em',
    padding: '16px 12px 6px',
  };

  return (
    <Sidebar style={{ backgroundColor: '#ffffff', borderRight: '1px solid #e7e5e4' }}>
      <SidebarHeader style={{ padding: '0', borderBottom: '1px solid #e7e5e4' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '16px 16px 18px',
        }}>
          <div style={{
            height: '40px',
            width: '40px',
            borderRadius: '10px',
            backgroundColor: '#f97316',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ffffff',
            fontWeight: '800',
            fontSize: '18px',
            flexShrink: 0,
          }}>
            N
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{
              fontSize: '13px',
              fontWeight: '700',
              color: '#1c1917',
              lineHeight: '1.2',
              margin: 0,
              letterSpacing: '-0.2px',
            }}>
              Sistema de Gestão de Gráfica
            </h1>
            <p style={{
              fontSize: '11px',
              color: '#a8a29e',
              margin: 0,
              marginTop: '2px',
            }}>
              NORTE Marketing Esportivo
            </p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel style={sectionLabelStyle}>
            Menu Principal
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {filteredMenuItems.map(item => (
                <NavItem key={item.title} item={item} isActive={location === item.url} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {hasPermission("admin") && (
          <>
            <div style={{ height: '1px', backgroundColor: '#e7e5e4', margin: '8px 12px' }} />
            <SidebarGroup>
              <SidebarGroupLabel style={{ ...sectionLabelStyle, paddingTop: '12px' }}>
                Administração
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {adminItems.map(item => (
                    <NavItem key={item.title} item={item} isActive={location === item.url} />
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}
      </SidebarContent>
    </Sidebar>
  );
}
