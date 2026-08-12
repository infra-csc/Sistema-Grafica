import {
  Calendar, CalendarRange, Palette, Printer, Layers, LayoutDashboard,
  Activity, BarChart3, Users, Building2, UserCheck, ClipboardCheck,
  Link2, LogOut, Loader2, ScrollText, Archive, ScanSearch, Compass, Settings2, Camera,
  Timer,
} from "lucide-react";
import { useId, useState } from "react";
import { Link, useLocation } from "wouter";
import { roleLabel, userInitials } from "@/lib/utils";
import { useAuth, type UserRole } from "@/contexts/auth-context";
import { useLogout } from "@/hooks/use-logout";
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
  SidebarRail,
} from "@/components/ui/sidebar";

type MenuItem = {
  title: string;
  url: string;
  icon: React.ElementType;
  roles?: UserRole[];
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
  { title: "Gestão de Prazos",        url: "/prazos",                  icon: Timer,          roles: ["admin"] },
];

// Patrocinadores: visível p/ solicitação, atendimento e admin
const sponsorItems: MenuItem[] = [
  { title: "Patrocinadores",   url: "/patrocinadores",   icon: Building2,  roles: ["solicitacao", "atendimento", "admin"] },
  { title: "Configurar Cotas", url: "/configurar-cotas", icon: Settings2,  roles: ["atendimento", "admin"] }, // PUT global de cotas é admin+atendimento — arte via a tela e levava 403 ao salvar
];

// Estoque: apenas admin
const stockItems: MenuItem[] = [
  { title: "Triagem de Retorno", url: "/triagem-retorno", icon: ScanSearch, roles: ["admin"] },
  { title: "Estoque",            url: "/estoque",          icon: Archive,    roles: ["admin"] },
];

// Administração: apenas admin (filtrado via hasPermission no componente)
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

  // Hover e foco de teclado compartilham o mesmo realce: os estilos são
  // inline, então :focus-visible do CSS não alcança estas cores. Estados
  // React (não mutação direta do DOM): antes, sair com o mouse apagava o
  // realce de um item ainda focado pelo teclado — hover e foco se atropelavam.
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const highlighted = !isActive && (hover || focus);

  return (
    <SidebarMenuItem style={{ margin: "0 8px" }}>
      <SidebarMenuButton
        asChild
        isActive={isActive}
        data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, "-")}`}
      >
        <Link
          href={item.url}
          aria-current={isActive ? "page" : undefined}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 12px",
            borderRadius: 8,
            fontSize: 13,
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontWeight: isActive ? 600 : 500,
            // #f97316 sobre #fff7ed ficava ~2.5:1 — o texto ativo era o menos
            // legível do menu. #9a3412 mantém a família laranja com contraste AA;
            // a barrinha inset devolve a marcação de "ativo" para quem não
            // distingue a cor.
            color: isActive ? "#9a3412" : highlighted ? "#292524" : "#57534e",
            backgroundColor: isActive ? "#fff7ed" : highlighted ? "#fafaf9" : "transparent",
            // undefined (não "none"): "none" sobrescrevia o focus-ring que o
            // CSS global aplica via box-shadow.
            boxShadow: isActive ? "inset 3px 0 0 #f97316" : undefined,
            textDecoration: "none",
            transition: "background-color 0.12s ease, color 0.12s ease",
            boxSizing: "border-box",
          }}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
        >
          <Icon
            style={{
              width: 18, height: 18, flexShrink: 0,
              color: isActive ? "#c2410c" : "#746e69",
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

// ─── Nav group (elimina os 4 blocos copiados de SidebarGroup) ─────────────
function NavGroup({
  label,
  items,
  isItemActive,
  first = false,
}: {
  // null = grupo único visível para o papel; o rótulo vira ruído e some.
  label: string | null;
  items: MenuItem[];
  isItemActive: (url: string) => boolean;
  first?: boolean;
}) {
  // O rótulo visual da seção não nomeava a lista para leitores de tela —
  // todos os grupos eram anunciados como listas anônimas.
  const labelId = useId();
  return (
    <SidebarGroup style={{ padding: first ? "8px 0 4px" : "20px 0 4px" }}>
      {label !== null && <span id={labelId} style={sectionLabelStyle}>{label}</span>}
      <SidebarGroupContent>
        <SidebarMenu style={{ gap: 1 }} aria-labelledby={label !== null ? labelId : undefined}>
          {items.map((item) => (
            <NavItem key={item.title} item={item} isActive={isItemActive(item.url)} />
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

// ─── AppSidebar ───────────────────────────────────────────
export function AppSidebar() {
  const [location] = useLocation();
  const { hasPermission, user } = useAuth();

  // Mesmo fluxo do menu do avatar (App.tsx) — hook compartilhado.
  const logoutMutation = useLogout();

  // 18 itens rolam sem nenhuma pista visual: no hover do container a
  // scrollbar fina aparece (.scrollbar-visible já existe no index.css).
  const [contentHover, setContentHover] = useState(false);

  const role = (user?.role || "") as UserRole;
  const filterByRole = (items: MenuItem[]) =>
    items.filter((item) => (item.roles ? item.roles.includes(role) : true));

  // Ativo também nas sub-rotas: em /eventos/:id o item "Eventos" acendia
  // apagado (match exato), e a navegação perdia o contexto de onde se está.
  // "/" continua exato para não acender em tudo.
  const isItemActive = (url: string) =>
    url === "/" ? location === "/" : location === url || location.startsWith(url + "/");

  const groups = [
    { label: "Produção",             items: filterByRole(productionItems) },
    { label: "Parceiros",            items: filterByRole(sponsorItems) },
    { label: "Estoque & Logística",  items: filterByRole(stockItems) },
    { label: "Administração",        items: hasPermission("admin") ? adminItems : [] },
  ].filter((g) => g.items.length > 0);

  // Com um único grupo visível (arte/grafica), o rótulo de seção não separa
  // nada de nada — é só ruído acima da lista.
  const singleGroup = groups.length === 1;

  return (
    // backgroundColor/borderRight ficavam no style — que o Sheet mobile
    // descarta. Como className, o desktop os aplica e o mobile herda o
    // bg-sidebar padrão do Sheet.
    <Sidebar className="bg-white border-r border-[#e7e5e4]">
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
        className={contentHover ? "scrollbar-visible" : "sidebar-no-scroll"}
        onMouseEnter={() => setContentHover(true)}
        onMouseLeave={() => setContentHover(false)}
        style={{
          padding: "0 0 8px",
          display: "flex",
          flexDirection: "column",
          gap: 0,
          overflowY: "auto",
        }}
      >
        {/* display:contents mantém os grupos como filhos diretos do flex
            column do SidebarContent — o landmark entra sem mexer no layout. */}
        <nav aria-label="Navegação principal" style={{ display: "contents" }}>
          {groups.map((g, i) => (
            <NavGroup
              key={g.label}
              label={singleGroup ? null : g.label}
              items={g.items}
              isItemActive={isItemActive}
              first={i === 0}
            />
          ))}
        </nav>
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
          {/* Avatar — mesma identidade do avatar da topbar */}
          <div style={{
            width: 34, height: 34, borderRadius: "50%",
            backgroundColor: "#1c1917",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}>
            <span style={{
              fontFamily: "'Space Grotesk', sans-serif",
              color: "#fb923c", fontSize: 12, fontWeight: 700, letterSpacing: "-0.02em",
            }}>
              {userInitials(user?.name)}
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
              {roleLabel(user?.role)}
            </p>
          </div>

          {/* Logout */}
          <button
            onClick={() => logoutMutation.mutate()}
            disabled={logoutMutation.isPending}
            data-testid="button-logout-sidebar"
            title="Sair"
            aria-label="Sair do sistema"
            style={{
              background: "none", border: "none",
              cursor: logoutMutation.isPending ? "default" : "pointer",
              // 44×44: com padding 6 o alvo ficava em ~27px.
              width: 44, height: 44,
              padding: 0, borderRadius: 6, color: "#746e69",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "color 0.15s ease, background-color 0.15s ease, opacity 0.15s ease",
              flexShrink: 0,
              // Antes o clique não dava retorno nenhum até o redirect chegar.
              opacity: logoutMutation.isPending ? 0.5 : 1,
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = "#dc2626";
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#fef2f2";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = "#746e69";
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent";
            }}
            onFocus={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = "#dc2626";
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#fef2f2";
            }}
            onBlur={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = "#746e69";
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent";
            }}
          >
            {logoutMutation.isPending
              ? <Loader2 className="animate-spin" style={{ width: 15, height: 15 }} />
              : <LogOut style={{ width: 15, height: 15 }} />}
          </button>
        </div>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
