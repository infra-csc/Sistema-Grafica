import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { AppSidebar } from "@/components/app-sidebar";
import { NotificationBell, type Notification } from "@/components/notification-bell";
import { AuthProvider, useAuth } from "@/contexts/auth-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "./lib/queryClient";
import { roleLabel } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useWebSocket } from "@/hooks/use-websocket";
import { useEffect, Component, type ReactNode } from "react";
import NotFound from "@/pages/not-found";
import Login from "@/pages/login";
import ChangePassword from "@/pages/change-password";
import Usuarios from "@/pages/usuarios";
import Patrocinadores from "@/pages/patrocinadores";
import PainelGeral from "@/pages/painel-geral";
import DashboardAnalises from "@/pages/dashboard-analises";
import Eventos from "@/pages/eventos";
import EventDetail from "@/pages/event-detail";
import Arte from "@/pages/arte";
import Atendimento from "@/pages/atendimento";
import Solicitacao from "@/pages/solicitacao";
import Grafica from "@/pages/grafica";
import Modelos from "@/pages/modelos";
import Calendario from "@/pages/calendario";
import Historico from "@/pages/historico";
import Registros from "@/pages/registros";
import VincularPatrocinadores from "@/pages/vincular-patrocinadores";
import LogsSistema from "@/pages/logs-sistema";
import Estoque from "@/pages/estoque";
import TriagemRetorno from "@/pages/triagem-retorno";
import ConfigurarCotas from "@/pages/configurar-cotas";


class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error("[ErrorBoundary] CRASH:", error.message, error.stack, info.componentStack);
  }
  render() {
    if (this.state.error) {
      const err = this.state.error as Error;
      return (
        <div style={{ padding: '2rem', fontFamily: 'monospace' }}>
          <h2 style={{ color: '#ef4444' }}>Erro de renderização</h2>
          <pre style={{ whiteSpace: 'pre-wrap', color: '#ef4444', fontSize: 12 }}>{err.message}{"\n"}{err.stack}</pre>
          <button onClick={() => this.setState({ error: null })} style={{ marginTop: '1rem', padding: '0.5rem 1rem', cursor: 'pointer' }}>
            Tentar novamente
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Um único loader de página inteira: o mesmo bloco vivia copiado em
// ProtectedRoute, RoleProtectedRoute e AppContent.
function FullPageLoader() {
  return (
    <div className="flex items-center justify-center h-dvh">
      <div className="text-muted-foreground">Carregando...</div>
    </div>
  );
}

// ─── Rota → rótulo (fonte única: títulos da sidebar) ─────────────────────────
const ROUTE_LABELS: Record<string, string> = {
  "/": "Painel Geral",
  "/eventos": "Eventos",
  "/arte": "Arte",
  "/vincular-patrocinadores": "Vincular Patrocinadores",
  "/atendimento": "Atendimento",
  "/solicitacao": "Revisão",
  "/grafica": "Gráfica",
  "/modelos": "Modelos",
  "/calendario": "Calendário",
  "/historico": "Histórico",
  "/registros": "Registros",
  "/analises": "Análises",
  "/patrocinadores": "Patrocinadores",
  "/configurar-cotas": "Configurar Cotas",
  "/triagem-retorno": "Triagem de Retorno",
  "/estoque": "Estoque",
  "/usuarios": "Usuários",
  "/logs-sistema": "Logs do Sistema",
  "/change-password": "Alterar Senha",
};

function getRouteLabel(location: string): string | undefined {
  if (ROUTE_LABELS[location]) return ROUTE_LABELS[location];
  if (location.startsWith("/eventos/")) return "Detalhe do Evento";
  return undefined;
}

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const [location, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setLocation("/login");
    } else if (!isLoading && user?.mustChangePassword && location !== "/change-password") {
      setLocation("/change-password");
    }
  }, [isAuthenticated, isLoading, user, location, setLocation]);

  if (isLoading) {
    return <FullPageLoader />;
  }

  if (!isAuthenticated) {
    return null;
  }

  return <Component />;
}

function RoleProtectedRoute({
  component: Component,
  allowedRoles,
}: {
  component: React.ComponentType;
  allowedRoles: string[];
}) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const [location, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setLocation("/login");
    } else if (!isLoading && user?.mustChangePassword && location !== "/change-password") {
      setLocation("/change-password");
    } else if (!isLoading && isAuthenticated && user && !allowedRoles.includes(user.role)) {
      setLocation("/");
    }
  }, [isAuthenticated, isLoading, user, location, setLocation, allowedRoles]);

  if (isLoading) {
    return <FullPageLoader />;
  }

  if (!isAuthenticated) {
    return null;
  }

  if (!allowedRoles.includes(user?.role || '')) {
    return (
      <div className="flex items-center justify-center h-dvh">
        <div className="text-muted-foreground">Acesso negado</div>
      </div>
    );
  }

  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/change-password">
        {() => <ProtectedRoute component={ChangePassword} />}
      </Route>
      <Route path="/">
        {() => <ProtectedRoute component={PainelGeral} />}
      </Route>
      <Route path="/analises">
        {() => <RoleProtectedRoute component={DashboardAnalises} allowedRoles={["admin"]} />}
      </Route>
      <Route path="/eventos">
        {() => <ProtectedRoute component={Eventos} />}
      </Route>
      <Route path="/eventos/:id">
        {() => <ProtectedRoute component={EventDetail} />}
      </Route>
      <Route path="/arte">
        {() => <RoleProtectedRoute component={Arte} allowedRoles={["arte", "atendimento", "admin"]} />}
      </Route>
      <Route path="/vincular-patrocinadores">
        {() => <RoleProtectedRoute component={VincularPatrocinadores} allowedRoles={["arte", "solicitacao", "atendimento", "admin"]} />}
      </Route>
      <Route path="/atendimento">
        {() => <RoleProtectedRoute component={Atendimento} allowedRoles={["atendimento", "arte", "admin"]} />}
      </Route>
      <Route path="/solicitacao">
        {() => <RoleProtectedRoute component={Solicitacao} allowedRoles={["solicitacao", "admin"]} />}
      </Route>
      <Route path="/grafica">
        {() => <RoleProtectedRoute component={Grafica} allowedRoles={["grafica", "solicitacao", "admin"]} />}
      </Route>
      <Route path="/modelos">
        {() => <RoleProtectedRoute component={Modelos} allowedRoles={["solicitacao", "admin"]} />}
      </Route>
      <Route path="/calendario">
        {() => <ProtectedRoute component={Calendario} />}
      </Route>
      <Route path="/historico">
        {() => <ProtectedRoute component={Historico} />}
      </Route>
      <Route path="/registros">
        {() => <ProtectedRoute component={Registros} />}
      </Route>
      <Route path="/usuarios">
        {() => <RoleProtectedRoute component={Usuarios} allowedRoles={["admin"]} />}
      </Route>
      <Route path="/patrocinadores">
        {() => <RoleProtectedRoute component={Patrocinadores} allowedRoles={["solicitacao", "atendimento", "admin"]} />}
      </Route>
      <Route path="/logs-sistema">
        {() => <RoleProtectedRoute component={LogsSistema} allowedRoles={["admin"]} />}
      </Route>
      <Route path="/estoque">
        {() => <RoleProtectedRoute component={Estoque} allowedRoles={["admin"]} />}
      </Route>
      <Route path="/triagem-retorno">
        {() => <RoleProtectedRoute component={TriagemRetorno} allowedRoles={["admin"]} />}
      </Route>
      <Route path="/configurar-cotas">
        {() => <RoleProtectedRoute component={ConfigurarCotas} allowedRoles={["atendimento", "admin"]} />}
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function AuthenticatedLayout() {
  useWebSocket();

  const [location, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();

  const {
    data: notifications = [],
    isLoading: notificationsLoading,
    isError: notificationsError,
    refetch: refetchNotifications,
  } = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
  });

  const markAsReadMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("PATCH", `/api/notifications/${id}/read`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    },
    // Sem onError a falha era silêncio: o badge não mudava e o usuário
    // clicava de novo sem entender o porquê.
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      toast({ title: "Não foi possível marcar como lida", description: "Tente novamente.", variant: "destructive" });
    },
  });

  // Uma chamada em lote no lugar de N PATCHes disparados em forEach.
  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("PATCH", "/api/notifications/read-all");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      toast({ title: "Não foi possível marcar todas como lidas", description: "Tente novamente.", variant: "destructive" });
    },
  });

  // Mesmo fluxo do botão da sidebar (app-sidebar.tsx) — duplicado aqui porque
  // o menu do avatar vive noutra árvore; qualquer mudança deve valer nos dois.
  const logoutMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auth/logout");
      return await res.json();
    },
    onSuccess: () => {
      queryClient.clear();
      window.location.href = import.meta.env.VITE_HUB_URL ?? "/login";
    },
    onError: (error: any) => {
      toast({ title: "Erro ao sair", description: error?.message || "Tente novamente.", variant: "destructive" });
    },
  });

  const userInitials = user?.name
    ? user.name.split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase()
    : "?";

  // Título de página: um rótulo por rota, visível na topbar e na aba do
  // navegador — antes toda aba se chamava igual.
  const pageLabel = getRouteLabel(location);
  useEffect(() => {
    document.title = pageLabel ? `NORTE — ${pageLabel}` : "NORTE";
  }, [pageLabel]);

  return (
    <div className="flex h-dvh w-full">
      <AppSidebar />
      <SidebarInset className="flex flex-col flex-1">
        <header
          role="banner"
          className="sticky top-0 z-50 w-full"
          style={{
            height: 64,
            backgroundColor: "rgba(249,249,248,0.85)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            boxShadow: "0 16px 32px -12px rgba(28,25,23,0.06)",
            display: "flex", alignItems: "center",
            justifyContent: "space-between",
            padding: "0 24px",
          }}
        >
          {/* Left: trigger + título da rota */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <SidebarTrigger
              data-testid="button-sidebar-toggle"
              className="h-11 w-11"
              title="Abrir/fechar menu (Ctrl+B)"
            />
            {pageLabel && (
              <span
                data-testid="text-page-title"
                style={{
                  fontFamily: "'Space Grotesk', sans-serif",
                  fontSize: 15, fontWeight: 700, color: "#1c1917",
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}
              >
                {pageLabel}
              </span>
            )}
          </div>

          {/* Right: notifications + avatar */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <NotificationBell
              notifications={notifications}
              isLoading={notificationsLoading}
              isError={notificationsError}
              onRetry={() => refetchNotifications()}
              onMarkAsRead={(id) => markAsReadMutation.mutate(id)}
              onMarkAllRead={() => markAllReadMutation.mutate()}
              onViewAll={() => setLocation("/historico")}
              // Clique navega ao contexto: detalhe do evento e, se houver
              // itemId, ?item= abre o dialog da peça (deep-link do event-detail).
              onOpen={(n) =>
                setLocation(`/eventos/${n.eventId}${n.itemId ? `?item=${n.itemId}` : ""}`)
              }
            />
            {/* Quem está logado agora é um menu: alterar senha e sair deixam
                de depender da sidebar (que no mobile vive fechada). */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  data-testid="button-user-menu"
                  aria-label={user?.name ? `Menu do usuário — ${user.name}` : "Menu do usuário"}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    marginLeft: 4, padding: "4px 6px",
                    background: "none", border: "none", borderRadius: 10,
                    cursor: "pointer",
                  }}
                >
                  <div className="hidden md:block" style={{ textAlign: "right", lineHeight: 1.25 }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#1c1917", whiteSpace: "nowrap" }}>
                      {user?.name}
                    </p>
                    <p style={{ margin: 0, fontSize: 11, color: "#746e69", textTransform: "capitalize" }}>
                      {roleLabel(user?.role)}
                    </p>
                  </div>
                  <div
                    style={{
                      width: 34, height: 34,
                      borderRadius: "50%",
                      backgroundColor: "#1c1917",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      boxShadow: "0 0 0 2px #e7e5e4, 0 0 0 4px #ffffff",
                      flexShrink: 0,
                    }}
                  >
                    <span style={{
                      fontFamily: "'Space Grotesk', sans-serif",
                      fontSize: 12, fontWeight: 700,
                      color: "#fb923c", letterSpacing: "-0.02em",
                    }}>
                      {userInitials}
                    </span>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" style={{ minWidth: 200 }}>
                <DropdownMenuLabel>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#1c1917" }}>
                    {user?.name ?? "Usuário"}
                  </p>
                  <p style={{ margin: 0, fontSize: 11, fontWeight: 500, color: "#746e69", textTransform: "capitalize" }}>
                    {roleLabel(user?.role)}
                  </p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  data-testid="menu-item-change-password"
                  onSelect={() => setLocation("/change-password")}
                >
                  Alterar senha
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  data-testid="menu-item-logout"
                  disabled={logoutMutation.isPending}
                  onSelect={() => logoutMutation.mutate()}
                  className="text-red-600 focus:text-red-600"
                >
                  {logoutMutation.isPending ? "Saindo..." : "Sair"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        {/* div, não main: o SidebarInset já é o <main> da página — eram dois
            landmarks main aninhados. */}
        <div className="flex-1 overflow-y-auto bg-background min-h-0" style={{ minWidth: 0 }}>
          <Router />
        </div>
      </SidebarInset>
    </div>
  );
}

function AppContent() {
  const { isAuthenticated, isLoading } = useAuth();
  const [location] = useLocation();

  if (isLoading) {
    return <FullPageLoader />;
  }

  // Show login page if not authenticated and not already on login page
  if (!isAuthenticated && location !== "/login") {
    return <Router />;
  }

  // Show login page without sidebar
  if (location === "/login") {
    return <Router />;
  }

  // Show authenticated layout with sidebar
  return <AuthenticatedLayout />;
}

export default function App() {
  const sidebarStyle = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <SidebarProvider
            style={sidebarStyle as React.CSSProperties}
            // O provider grava o cookie sidebar_state a cada toggle, mas nunca
            // o lia de volta: o colapso evaporava a cada reload.
            defaultOpen={document.cookie.match(/sidebar_state=([^;]+)/)?.[1] !== "false"}
          >
            <ErrorBoundary>
              <AppContent />
            </ErrorBoundary>
          </SidebarProvider>
          <Toaster />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
