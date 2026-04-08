import {
  Calendar, CheckCircle, Factory, Home, Layers, LayoutDashboard,
  Activity, BarChart3, Users, Building2, UserCheck, ClipboardCheck,
  Link2, LogOut,
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

// ─── Item type ────────────────────────────────────────────
type MenuItem = {
  title: string;
  url: string;
  icon: React.ElementType;
  roles?: string[];
};

// ─── Menu items ───────────────────────────────────────────
const productionItems: MenuItem[] = [
  { title: "Painel Geral",             url: "/",                        icon: LayoutDashboard },
  { title: "Eventos",                  url: "/eventos",                 icon: Home },
  { title: "Vincular Patrocinadores",  url: "/vincular-patrocinadores", icon: Link2,          roles: ["arte", "admin"] },
  { title: "Arte",                     url: "/arte",                    icon: CheckCircle },
  { title: "Atendimento",              url: "/atendimento",             icon: UserCheck,      roles: ["atendimento", "admin"] },
  { title: "Solicitação",              url: "/solicitacao",             icon: ClipboardCheck, roles: ["solicitacao", "admin"] },
  { title: "Gráfica",                  url: "/grafica",                 icon: Factory },
  { title: "Modelos",                  url: "/modelos",                 icon: Layers },
  { title: "Calendário",               url: "/calendario",              icon: Calendar },
  { title: "Histórico",                url: "/historico",               icon: Activity },
  { title: "Análises",                 url: "/analises",                icon: BarChart3 },
];

const adminItems: MenuItem[] = [
  { title: "Usuários",       url: "/usuarios",      icon: Users },
  { title: "Patrocinadores", url: "/patrocinadores", icon: Building2 },
];

// ─── Section label style ─────────────────────────────────
const sectionLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.07em",
  color: "#a8a29e",
  padding: "0 12px",
  marginBottom: 16,
  display: "block",
};

// ─── Single nav item ─────────────────────────────────────
function NavItem({ item, isActive }: { item: MenuItem; isActive: boolean }) {
  const Icon = item.icon;
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={isActive} data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, "-")}`}>
        <Link
          href={item.url}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "10px 12px",
            borderRadius: 8,
            fontSize: 13.5,
            fontWeight: isActive ? 700 : 400,
            color: isActive ? "#ea580c" : "#78716c",
            backgroundColor: isActive ? "#f5f5f4" : "transparent",
            textDecoration: "none",
            borderRight: isActive ? "3px solid #f97316" : "3px solid transparent",
            transition: "background-color 0.15s ease, color 0.15s ease",
            boxSizing: "border-box",
          }}
          onMouseEnter={(e) => {
            if (!isActive) {
              (e.currentTarget as HTMLElement).style.backgroundColor = "#f5f5f4";
              (e.currentTarget as HTMLElement).style.color = "#1c1917";
            }
          }}
          onMouseLeave={(e) => {
            if (!isActive) {
              (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
              (e.currentTarget as HTMLElement).style.color = "#78716c";
            }
          }}
        >
          <Icon
            style={{
              width: 16, height: 16, flexShrink: 0,
              color: isActive ? "#f97316" : "#a8a29e",
            }}
          />
          <span>{item.title}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

// ─── Sidebar ─────────────────────────────────────────────
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
      window.location.href = "/login";
      toast({ title: "Logout realizado", description: "Até logo!" });
    },
  });

  const filteredProduction = productionItems.filter((item) =>
    item.roles ? item.roles.includes(user?.role || "") : true
  );

  return (
    <Sidebar style={{ backgroundColor: "#f9f9f8", borderRight: "none" }}>

      {/* ── Header ── */}
      <SidebarHeader style={{ padding: "32px 16px 24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "0 4px" }}>
          <div style={{
            width: 40, height: 40,
            backgroundColor: "#f97316",
            borderRadius: 10,
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
            boxShadow: "0 1px 4px rgba(0,0,0,0.12)",
          }}>
            <span style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontWeight: 700, fontSize: 20, color: "white", lineHeight: 1,
            }}>N</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: 13, fontWeight: 700,
              letterSpacing: "-0.02em",
              textTransform: "uppercase",
              color: "#1c1917",
              lineHeight: 1.2,
            }}>
              NORTE
            </span>
            <span style={{ fontSize: 11, color: "#a8a29e", fontWeight: 500, lineHeight: 1.3 }}>
              Marketing Esportivo
            </span>
          </div>
        </div>
      </SidebarHeader>

      {/* ── Content ── */}
      <SidebarContent style={{ padding: "0 8px", display: "flex", flexDirection: "column", gap: 32 }}>

        {/* Production group */}
        <SidebarGroup style={{ padding: 0 }}>
          <span style={sectionLabel}>Produção</span>
          <SidebarGroupContent>
            <SidebarMenu style={{ gap: 2 }}>
              {filteredProduction.map((item) => (
                <NavItem key={item.title} item={item} isActive={location === item.url} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Admin group */}
        {hasPermission("admin") && (
          <SidebarGroup style={{ padding: 0 }}>
            <span style={sectionLabel}>Administração</span>
            <SidebarGroupContent>
              <SidebarMenu style={{ gap: 2 }}>
                {adminItems.map((item) => (
                  <NavItem key={item.title} item={item} isActive={location === item.url} />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      {/* ── Footer: user + logout ── */}
      <SidebarFooter style={{ padding: "12px 16px 24px", borderTop: "1px solid #e7e5e4", marginTop: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Avatar circle */}
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
            <p style={{ fontSize: 12, fontWeight: 600, color: "#1c1917", margin: 0, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {user?.name ?? "Usuário"}
            </p>
            <p style={{ fontSize: 10, color: "#a8a29e", margin: 0, lineHeight: 1.3, textTransform: "capitalize" }}>
              {user?.role ?? ""}
            </p>
          </div>

          {/* Logout button */}
          <button
            onClick={() => logoutMutation.mutate()}
            data-testid="button-logout-sidebar"
            title="Sair"
            style={{
              background: "none", border: "none", cursor: "pointer",
              padding: 6, borderRadius: 6, color: "#a8a29e",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "color 0.15s ease, background-color 0.15s ease",
              flexShrink: 0,
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = "#dc2626";
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#fef2f2";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = "#a8a29e";
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
