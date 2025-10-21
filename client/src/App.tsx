import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { NotificationBell } from "@/components/notification-bell";
import { ProfileSelector } from "@/components/profile-selector";
import { AuthProvider } from "@/contexts/auth-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "./lib/queryClient";
import { useWebSocket } from "@/hooks/use-websocket";
import NotFound from "@/pages/not-found";
import PainelGeral from "@/pages/painel-geral";
import DashboardAnalises from "@/pages/dashboard-analises";
import Eventos from "@/pages/eventos";
import EventDetail from "@/pages/event-detail";
import Arte from "@/pages/arte";
import Grafica from "@/pages/grafica";
import Modelos from "@/pages/modelos";
import Calendario from "@/pages/calendario";
import Historico from "@/pages/historico";

function Router() {
  return (
    <Switch>
      <Route path="/" component={PainelGeral} />
      <Route path="/analises" component={DashboardAnalises} />
      <Route path="/eventos" component={Eventos} />
      <Route path="/eventos/:id" component={EventDetail} />
      <Route path="/arte" component={Arte} />
      <Route path="/grafica" component={Grafica} />
      <Route path="/modelos" component={Modelos} />
      <Route path="/calendario" component={Calendario} />
      <Route path="/historico" component={Historico} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AppContent() {
  // Initialize WebSocket for real-time updates
  useWebSocket();

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
            <ProfileSelector />
            <NotificationBell
              notifications={notifications}
              onMarkAsRead={(id) => markAsReadMutation.mutate(id)}
            />
          </div>
        </header>
        <main className="flex-1 overflow-auto bg-background">
          <Router />
        </main>
      </SidebarInset>
    </div>
  );
}

export default function App() {
  const sidebarStyle = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <SidebarProvider style={sidebarStyle as React.CSSProperties}>
            <AppContent />
          </SidebarProvider>
          <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
