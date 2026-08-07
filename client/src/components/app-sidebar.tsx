import {
  Calendar, CalendarRange, Palette, Printer, Layers, LayoutDashboard,
  Activity, BarChart3, Users, Building2, UserCheck, ClipboardCheck,
  Link2, LogOut, ScrollText, Archive, ScanSearch, Compass, Settings2, Camera,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/auth-context";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
} from "@/components/ui/sidebar";

type MenuItem = {
  title: string;
  url: string;
  icon: React.ElementType;
  roles?: string[];
};

// roles: undefined = todos os perfis autenticados
const productionItems: MenuItem[] = [
  { title: "Painel Geral",            url: "/",                        icon: LayoutDashboard },
  { title: "Eventos",                 url: "/eventos",                 icon: CalendarRange },
  { title: "Arte",                    url: "/arte",                    icon: Palette,        roles: ["arte", "atendimento", "admin"] },
  { title: "Vincular Patrocinadores", url: "/vincular-patrocinadores", icon: Link2,          roles: ["arte", "solicitacao", "atendimento", "admin"] },
  { title: "Atendimento",             url: "/atendimento",             icon: UserCheck,      roles: ["atendimento", "arte", "admin"] },
  { title: "Revisão",                 url: "/solicitacao",             icon: ClipboardCheck, roles: ["solicitacao", "admin"] },
  { title: "Gráfica",                 url: "/grafica",                 icon: Printer,        roles: ["grafica", "solicitacao", "admin"] },
  { title: "Modelos",                 url: "/modelos",                 icon: Layers,         roles: ["solicitacao", "admin"] },
  { title: "Calendário",              url: "/calendario",              icon: Calendar },
  { title: "Histórico",               url: "/historico",               icon: Activity },
  // Registros fica aqui (e não dentro da Gráfica) porque a maioria dos perfis
  // não acessa a Gráfica e este acervo interessa a todos.
  { title: "Registros",               url: "/registros",               icon: Camera },
  { title: "Análises",                url: "/analises",                icon: BarChart3,      roles: ["admin"] },
];

// Patrocinadores: visível p/ solicitação, atendimento e admin
const sponsorItems: MenuItem[] = [
  { title: "Patrocinadores",   url: "/patrocinadores",   icon: Building2,  roles: ["solicitacao", "atendimento", "admin"] },
  { title: "Configurar Cotas", url: "/configurar-cotas", icon: Settings2,  roles: ["arte", "atendimento", "admin"] },
];

// Estoque: apenas admin
const stockItems: MenuItem[] = [
  { title: "Triagem de Retorno", url: "/triagem-retorno", icon: ScanSearch, roles: ["admin"] },
  { title: "Estoque",            url: "/estoque",          icon: Archive,    roles: ["admin"] },
];

// Administração: apenas admin
const adminItems: MenuItem[] = [
  { title: "Usuários",        url: "/usuarios",     icon: Users },
  { title: "Logs do Sistema", url: "/logs-sistema", icon: ScrollText },
];

// ─── Section label ────────────────────────────────────────
const sectionLabelStyle: React.CSSProperties = {
  fontFamily: "'Plus Jakarta Sans', sans-serif",
  fontSize: 10,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.1em",
  color: "#746e69",
  padding: "0 14px",
  marginBottom: 4,
  marginTop: 0,
  display: "block",
};

// ─── Single nav item ─────────────────────────────────────
function NavItem({ item, isActive }: { item: MenuItem; isActive: boolean }) {
  const Icon = item.icon;
  return (
    <SidebarMenuItem style={{ margin: "0 8px" }}>
      <SidebarMenuButton
        asChild
        isActive={isActive}
        data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, "-")}`}
      >
        <Link
          href={item.url}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 12px",
            borderRadius: 8,
            fontSize: 13,
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontWeight: isActive ? 600 : 500,
            color: isActive ? "#f97316" : "#57534e",
            backgroundColor: isActive ? "#fff7ed" : "transparent",
            textDecoration: "none",
            transition: "background-color 0.12s ease, color 0.12s ease",
            boxSizing: "border-box",
          }}
          onMouseEnter={(e) => {
            if (!isActive) {
              (e.currentTarget as HTMLElement).style.backgroundColor = "#fafaf9";
              (e.currentTarget as HTMLElement).style.color = "#292524";
            }
          }}
          onMouseLeave={(e) => {
            if (!isActive) {
              (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
              (e.currentTarget as HTMLElement).style.color = "#57534e";
            }
          }}
        >
          <Icon
            style={{
              width: 18, height: 18, flexShrink: 0,
              color: isActive ? "#f97316" : "#746e69",
              filter: isActive ? "drop-shadow(0 0 3px rgba(249,115,22,0.25))" : "none",
              transition: "filter 0.12s ease, color 0.12s ease",
            }}
          />
          <span>{item.title}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

// ─── AppSidebar ───────────────────────────────────────────
export function AppSidebar() {
  const [location] = useLocation();
  const { hasPermission, user } = useAuth();
  const { toast } = useToast();

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auth/logout");
      return await res.json();
    },
    onSuccess: () => {
      queryClient.clear();
      window.location.href = "https://norte-app-hub.replit.app/";
      toast({ title: "Logout realizado", description: "Até logo!" });
    },
  });

  const role = user?.role || "";
  const filterByRole = (items: MenuItem[]) =>
    items.filter((item) => (item.roles ? item.roles.includes(role) : true));

  const filteredProduction = filterByRole(productionItems);
  const filteredSponsor   = filterByRole(sponsorItems);
  const filteredStock     = filterByRole(stockItems);

  return (
    <Sidebar
      style={{
        backgroundColor: "#ffffff",
        borderRight: "1px solid #e7e5e4",
        height: "100vh",
      }}
    >
      {/* ── Header ── */}
      <SidebarHeader style={{ padding: "32px 24px 24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Compass
            style={{
              width: 20, height: 20, color: "#f97316", flexShrink: 0, strokeWidth: 2.2,
              filter: "drop-shadow(0 2px 4px rgba(249,115,22,0.15))",
            }}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            <span style={{
              fontFamily: "'Outfit', sans-serif",
              fontSize: 16,
              fontWeight: 800,
              letterSpacing: "-0.05em",
              textTransform: "uppercase",
              color: "#1c1917",
              lineHeight: 0.9,
            }}>
              NORTE
            </span>
            <span style={{
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontSize: 9,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.25em",
              color: "#746e69",
              lineHeight: 1,
              marginTop: 3,
            }}>
              Marketing Esportivo
            </span>
          </div>
        </div>
      </SidebarHeader>

      {/* ── Content ── */}
      <SidebarContent
        className="sidebar-no-scroll"
        style={{
          padding: "0 0 8px",
          display: "flex",
          flexDirection: "column",
          gap: 0,
          overflowY: "auto",
        }}
      >
        {/* Produção */}
        {filteredProduction.length > 0 && (
          <SidebarGroup style={{ padding: "8px 0 4px" }}>
            <span style={sectionLabelStyle}>Produção</span>
            <SidebarGroupContent>
              <SidebarMenu style={{ gap: 1 }}>
                {filteredProduction.map((item) => (
                  <NavItem key={item.title} item={item} isActive={location === item.url} />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Patrocinadores — visível p/ solicitação, atendimento e admin */}
        {filteredSponsor.length > 0 && (
          <SidebarGroup style={{ padding: "20px 0 4px" }}>
            <span style={sectionLabelStyle}>Parceiros</span>
            <SidebarGroupContent>
              <SidebarMenu style={{ gap: 1 }}>
                {filteredSponsor.map((item) => (
                  <NavItem key={item.title} item={item} isActive={location === item.url} />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Estoque & Logística — apenas admin */}
        {filteredStock.length > 0 && (
          <SidebarGroup style={{ padding: "20px 0 4px" }}>
            <span style={sectionLabelStyle}>Estoque &amp; Logística</span>
            <SidebarGroupContent>
              <SidebarMenu style={{ gap: 1 }}>
                {filteredStock.map((item) => (
                  <NavItem key={item.title} item={item} isActive={location === item.url} />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Administração — apenas admin */}
        {hasPermission("admin") && (
          <SidebarGroup style={{ padding: "20px 0 4px" }}>
            <span style={sectionLabelStyle}>Administração</span>
            <SidebarGroupContent>
              <SidebarMenu style={{ gap: 1 }}>
                {adminItems.map((item) => (
                  <NavItem key={item.title} item={item} isActive={location === item.url} />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      {/* ── Footer: user + logout ── */}
      <SidebarFooter
        style={{
          padding: "16px 16px",
          borderTop: "1px solid #f5f5f4",
          marginTop: "auto",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Avatar */}
          <div style={{
            width: 34, height: 34, borderRadius: "50%",
            backgroundColor: "#1c1917",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}>
            <span style={{ color: "white", fontSize: 13, fontWeight: 700 }}>
              {user?.name?.charAt(0).toUpperCase() ?? "U"}
            </span>
          </div>

          {/* Name + role */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontSize: 13, fontWeight: 700,
              color: "#1c1917", margin: 0, lineHeight: 1.3,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {user?.name ?? "Usuário"}
            </p>
            <p style={{
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontSize: 11, color: "#746e69",
              margin: 0, lineHeight: 1.3, textTransform: "capitalize",
            }}>
              {user?.role ?? ""}
            </p>
          </div>

          {/* Logout */}
          <button
            onClick={() => logoutMutation.mutate()}
            data-testid="button-logout-sidebar"
            title="Sair"
            style={{
              background: "none", border: "none", cursor: "pointer",
              padding: 6, borderRadius: 6, color: "#746e69",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "color 0.15s ease, background-color 0.15s ease",
              flexShrink: 0,
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = "#dc2626";
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#fef2f2";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = "#746e69";
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent";
            }}
          >
            <LogOut style={{ width: 15, height: 15 }} />
          </button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
