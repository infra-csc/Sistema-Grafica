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
    <Sidebar style={{ backgroundColor: '#ffffff', borderRight: '1px solid #e7e5e4' }}>
      <SidebarHeader 
        style={{
          height: '64px',
          display: 'flex',
          alignItems: 'center',
          paddingLeft: '16px',
          paddingRight: '16px',
          borderBottom: '1px solid #e7e5e4',
          backgroundColor: '#ffffff'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%' }}>
          <div 
            style={{
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
              flexShrink: 0
            }}
          >
            N
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ 
              fontSize: '13px', 
              fontWeight: '700', 
              color: '#1c1917',
              lineHeight: '1.2',
              margin: 0,
              letterSpacing: '-0.2px'
            }}>Sistema de Gestão de Gráfica</h1>
            <p style={{ 
              fontSize: '11px', 
              color: '#a8a29e',
              margin: 0,
              marginTop: '2px'
            }}>NORTE Marketing Esportivo</p>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel style={{
            color: '#a8a29e',
            fontSize: '10px',
            fontWeight: '600',
            textTransform: 'uppercase',
            letterSpacing: '0.8px',
            padding: '16px 16px 6px'
          }}>Menu Principal</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {filteredMenuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton 
                    asChild 
                    isActive={location === item.url} 
                    data-testid={`nav-${item.title.toLowerCase().replace(' ', '-')}`}
                    style={location === item.url ? undefined : {}}
                    className={location === item.url ? 'titanium-active' : 'titanium-inactive'}
                  >
                    <Link 
                      href={item.url}
                      style={{
                        padding: '8px 12px',
                        borderRadius: '8px',
                        fontSize: '13.5px',
                        backgroundColor: location === item.url ? '#1c1917' : 'transparent',
                        color: location === item.url ? '#ffffff' : '#78716c',
                        fontWeight: location === item.url ? '600' : '400',
                        transition: 'all 0.15s ease',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        textDecoration: 'none'
                      }}
                      onMouseEnter={(e) => {
                        if (location !== item.url) {
                          (e.currentTarget as HTMLElement).style.backgroundColor = '#f5f0eb';
                          (e.currentTarget as HTMLElement).style.color = '#1c1917';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (location !== item.url) {
                          (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
                          (e.currentTarget as HTMLElement).style.color = '#78716c';
                        }
                      }}
                    >
                      <item.icon 
                        className="h-4 w-4" 
                        style={{
                          color: location === item.url ? '#f97316' : '#a8a29e'
                        }}
                      />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {hasPermission("admin") && (
          <>
            <div style={{ 
              height: '1px', 
              backgroundColor: '#e7e5e4', 
              margin: '8px 12px'
            }} />
            <SidebarGroup>
              <SidebarGroupLabel style={{
                color: '#a8a29e',
                fontSize: '10px',
                fontWeight: '600',
                textTransform: 'uppercase',
                letterSpacing: '0.8px',
                padding: '16px 16px 6px'
              }}>Administração</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton 
                      asChild 
                      isActive={location === "/usuarios"} 
                      data-testid="nav-usuarios"
                      className={location === "/usuarios" ? 'titanium-active' : 'titanium-inactive'}
                    >
                      <Link 
                        href="/usuarios"
                        style={{
                          padding: '8px 12px',
                          borderRadius: '8px',
                          fontSize: '13.5px',
                          backgroundColor: location === "/usuarios" ? '#1c1917' : 'transparent',
                          color: location === "/usuarios" ? '#ffffff' : '#78716c',
                          fontWeight: location === "/usuarios" ? '600' : '400',
                          transition: 'all 0.15s ease',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          textDecoration: 'none'
                        }}
                        onMouseEnter={(e) => {
                          if (location !== "/usuarios") {
                            (e.currentTarget as HTMLElement).style.backgroundColor = '#f5f0eb';
                            (e.currentTarget as HTMLElement).style.color = '#1c1917';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (location !== "/usuarios") {
                            (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
                            (e.currentTarget as HTMLElement).style.color = '#78716c';
                          }
                        }}
                      >
                        <Users 
                          className="h-4 w-4"
                          style={{
                            color: location === "/usuarios" ? '#f97316' : '#a8a29e'
                          }}
                        />
                        <span>Usuários</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton 
                      asChild 
                      isActive={location === "/patrocinadores"} 
                      data-testid="nav-patrocinadores"
                      className={location === "/patrocinadores" ? 'titanium-active' : 'titanium-inactive'}
                    >
                      <Link 
                        href="/patrocinadores"
                        style={{
                          padding: '8px 12px',
                          borderRadius: '8px',
                          fontSize: '13.5px',
                          backgroundColor: location === "/patrocinadores" ? '#1c1917' : 'transparent',
                          color: location === "/patrocinadores" ? '#ffffff' : '#78716c',
                          fontWeight: location === "/patrocinadores" ? '600' : '400',
                          transition: 'all 0.15s ease',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          textDecoration: 'none'
                        }}
                        onMouseEnter={(e) => {
                          if (location !== "/patrocinadores") {
                            (e.currentTarget as HTMLElement).style.backgroundColor = '#f5f0eb';
                            (e.currentTarget as HTMLElement).style.color = '#1c1917';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (location !== "/patrocinadores") {
                            (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
                            (e.currentTarget as HTMLElement).style.color = '#78716c';
                          }
                        }}
                      >
                        <Building2 
                          className="h-4 w-4"
                          style={{
                            color: location === "/patrocinadores" ? '#f97316' : '#a8a29e'
                          }}
                        />
                        <span>Patrocinadores</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}
      </SidebarContent>
    </Sidebar>
  );
}
