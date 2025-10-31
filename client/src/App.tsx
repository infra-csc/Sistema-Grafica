import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { NotificationBell } from "@/components/notification-bell";
import { AuthProvider, useAuth } from "@/contexts/auth-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "./lib/queryClient";
import { useWebSocket } from "@/hooks/use-websocket";
import { useEffect } from "react";
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
import Grafica from "@/pages/grafica";
import Modelos from "@/pages/modelos";
import Calendario from "@/pages/calendario";
import Historico from "@/pages/historico";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

function ProtectedRoute({ component: Component, ...rest }: { component: React.ComponentType; path?: string }) {
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
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-muted-foreground">Carregando...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return <Component />;
}

function RoleProtectedRoute({ 
  component: Component, 
  allowedRoles,
  ...rest 
}: { 
  component: React.ComponentType; 
  allowedRoles: string[];
  path?: string;
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
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-muted-foreground">Carregando...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  if (!allowedRoles.includes(user?.role || '')) {
    return (
      <div className="flex items-center justify-center h-screen">
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
        {() => <ProtectedRoute component={DashboardAnalises} />}
      </Route>
      <Route path="/eventos">
        {() => <ProtectedRoute component={Eventos} />}
      </Route>
      <Route path="/eventos/:id">
        {() => <ProtectedRoute component={EventDetail} />}
      </Route>
      <Route path="/arte">
        {() => <ProtectedRoute component={Arte} />}
      </Route>
      <Route path="/atendimento">
        {() => <RoleProtectedRoute component={Atendimento} allowedRoles={["atendimento", "admin"]} />}
      </Route>
      <Route path="/grafica">
        {() => <ProtectedRoute component={Grafica} />}
      </Route>
      <Route path="/modelos">
        {() => <ProtectedRoute component={Modelos} />}
      </Route>
      <Route path="/calendario">
        {() => <ProtectedRoute component={Calendario} />}
      </Route>
      <Route path="/historico">
        {() => <ProtectedRoute component={Historico} />}
      </Route>
      <Route path="/usuarios">
        {() => <ProtectedRoute component={Usuarios} />}
      </Route>
      <Route path="/patrocinadores">
        {() => <ProtectedRoute component={Patrocinadores} />}
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function AuthenticatedLayout() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // Initialize WebSocket for real-time updates
  useWebSocket();

  // Notificações já vêm filtradas pelo backend baseadas no perfil do usuário
  const { data: notifications = [] } = useQuery<any[]>({
    queryKey: ["/api/notifications"],
  });

  const markAsReadMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("PATCH", `/api/notifications/${id}/read`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auth/logout");
      return await res.json();
    },
    onSuccess: () => {
      queryClient.clear();
      setLocation("/login");
      toast({
        title: "Logout realizado",
        description: "Até logo!",
      });
    },
  });

  return (
    <div className="flex h-screen w-full">
      <AppSidebar />
      <SidebarInset className="flex flex-col flex-1">
        <header className="flex items-center justify-between h-16 px-6 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
          <div className="flex items-center gap-2">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <div className="border-l h-6 border-border ml-2" />
          </div>
          <div className="flex items-center gap-3">
            {user && (
              <div className="text-sm text-muted-foreground">
                {user.name}
              </div>
            )}
            <NotificationBell
              notifications={notifications}
              onMarkAsRead={(id) => markAsReadMutation.mutate(id)}
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => logoutMutation.mutate()}
              data-testid="button-logout"
              title="Sair"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </header>
        <main className="flex-1 overflow-auto bg-background">
          <Router />
        </main>
      </SidebarInset>
    </div>
  );
}

function AppContent() {
  const { isAuthenticated, isLoading } = useAuth();
  const [location] = useLocation();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-muted-foreground">Carregando...</div>
      </div>
    );
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
          <SidebarProvider style={sidebarStyle as React.CSSProperties}>
            <AppContent />
          </SidebarProvider>
          <Toaster />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
