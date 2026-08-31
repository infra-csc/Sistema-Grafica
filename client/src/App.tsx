import { Switch, Route, useLocation } from "wouter";
import { queryClient, apiRequest } from "./lib/queryClient";
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
import { BuscaGlobal, abrirBuscaGlobal } from "@/components/busca-global";
import { Search } from "lucide-react";
import { AuthProvider, useAuth } from "@/contexts/auth-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { roleLabel, userInitials } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useLogout } from "@/hooks/use-logout";
import { useWebSocket } from "@/hooks/use-websocket";
import { useEffect, useState, Component, lazy, Suspense, type ReactNode, type ComponentType } from "react";

/**
 * lazy() com rede: se o chunk falhar ao baixar (deploy trocou os arquivos no
 * meio de uma sessão aberta), recarrega a página UMA vez em vez de mostrar o
 * ErrorBoundary — é o modo de falha clássico do code splitting em produção.
 */
const CHAVE_RELOAD_DE_CHUNK = "chunk-reload-once";

function lazyPage<T extends ComponentType<any>>(fabrica: () => Promise<{ default: T }>) {
  return lazy(() =>
    fabrica()
      .then((modulo) => {
        // Chunk carregou: devolve a recarga única para o PRÓXIMO deploy.
        // Sem isso, a trava gastava-se no primeiro deploy da sessão e o
        // segundo caía direto no ErrorBoundary (aconteceu em 31/08).
        try { sessionStorage.removeItem(CHAVE_RELOAD_DE_CHUNK); } catch {}
        return modulo;
      })
      .catch((erro) => {
        try {
          if (!sessionStorage.getItem(CHAVE_RELOAD_DE_CHUNK)) {
            sessionStorage.setItem(CHAVE_RELOAD_DE_CHUNK, "1");
            window.location.reload();
          }
        } catch {}
        throw erro;
      })
  );
}

/** O erro clássico do code splitting: o deploy trocou os arquivos e este navegador ainda pede o hash antigo. */
function ehChunkPerdido(erro: Error) {
  return /dynamically imported module|Loading chunk|Importing a module script failed|error loading dynamically imported/i.test(
    erro.message || ""
  );
}

/** Fallback dos chunks de rota: silhueta discreta, sem layout pulando. */
function PaginaCarregando() {
  return (
    <div aria-busy="true" style={{ padding: "18px" }}>
      <div className="animate-pulse" style={{ width: 220, height: 22, borderRadius: 6, backgroundColor: "#e7e5e4", marginBottom: 8 }} />
      <div className="animate-pulse" style={{ width: 340, height: 13, borderRadius: 4, backgroundColor: "#f0efee", marginBottom: 20 }} />
      <div style={{ backgroundColor: "#ffffff", border: "1px solid #e7e5e4", borderRadius: 10, overflow: "hidden" }}>
        <div style={{ height: 44, backgroundColor: "#fafaf9", borderBottom: "1px solid #e7e5e4" }} />
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 18, height: 58, padding: "0 16px", borderBottom: "1px solid #f5f4f2" }}>
            <div className="animate-pulse" style={{ width: 52, height: 12, borderRadius: 4, backgroundColor: "#e7e5e4" }} />
            <div className="animate-pulse" style={{ width: `${34 - i * 4}%`, height: 12, borderRadius: 4, backgroundColor: "#e7e5e4" }} />
            <div className="animate-pulse" style={{ width: 88, height: 22, borderRadius: 999, backgroundColor: "#f0efee", marginLeft: "auto" }} />
          </div>
        ))}
      </div>
    </div>
  );
}
import NotFound from "@/pages/not-found";
import Login from "@/pages/login";
import ChangePassword from "@/pages/change-password";
// ── CODE SPLITTING (auditoria de performance, 27/08) ─────────────────────────
// As 28 páginas eram importadas eager e colapsavam num único chunk de ~2,4 MB:
// o operador da Gráfica baixava recharts (página só-admin), pdf-lib (gerador
// de book) e todo o resto antes do primeiro paint da fila dele. Com lazy, cada
// rota vira um chunk próprio, baixado quando o usuário a abre — e um deploy só
// invalida o cache dos chunks que mudaram. Login/NotFound/ChangePassword
// seguem eager: são o caminho de entrada e pesam nada.
const Usuarios = lazyPage(() => import("@/pages/usuarios"));
const Patrocinadores = lazyPage(() => import("@/pages/patrocinadores"));
const PainelGeral = lazyPage(() => import("@/pages/painel-geral"));
const DashboardAnalises = lazyPage(() => import("@/pages/dashboard-analises"));
const Eventos = lazyPage(() => import("@/pages/eventos"));
const EventDetail = lazyPage(() => import("@/pages/event-detail"));
const RelatorioEvento = lazyPage(() => import("@/pages/relatorio-evento"));
const EtiquetasEvento = lazyPage(() => import("@/pages/etiquetas-evento"));
const BookGerador = lazyPage(() => import("@/pages/book-gerador"));
const Arte = lazyPage(() => import("@/pages/arte"));
const Atendimento = lazyPage(() => import("@/pages/atendimento"));
const Solicitacao = lazyPage(() => import("@/pages/solicitacao"));
const Grafica = lazyPage(() => import("@/pages/grafica"));
const Modelos = lazyPage(() => import("@/pages/modelos"));
const Calendario = lazyPage(() => import("@/pages/calendario"));
const Historico = lazyPage(() => import("@/pages/historico"));
const Versoes = lazyPage(() => import("@/pages/versoes"));
const Registros = lazyPage(() => import("@/pages/registros"));
const VincularPatrocinadores = lazyPage(() => import("@/pages/vincular-patrocinadores"));
const LogsSistema = lazyPage(() => import("@/pages/logs-sistema"));
const Notificacoes = lazyPage(() => import("@/pages/notificacoes"));
const Estoque = lazyPage(() => import("@/pages/estoque"));
const TriagemRetorno = lazyPage(() => import("@/pages/triagem-retorno"));
const ConfigurarCotas = lazyPage(() => import("@/pages/configurar-cotas"));
const GestaoPrazos = lazyPage(() => import("@/pages/gestao-prazos"));
const ReparoMotivos = lazyPage(() => import("@/pages/reparo-motivos"));


class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error("[ErrorBoundary] CRASH:", error.message, error.stack, info.componentStack);
  }
  render() {
    if (this.state.error) {
      const err = this.state.error as Error;
      // Chunk que sumiu depois de um deploy NÃO é bug do usuário: nada de
      // stack trace vermelho. E "Tentar novamente" via setState nunca resolve
      // este caso (o lazy guarda a rejeição) — o único remédio é recarregar.
      if (ehChunkPerdido(err)) {
        return (
          <div data-testid="tela-nova-versao" style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
            <div style={{ maxWidth: 420, textAlign: 'center' }}>
              <h2 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 800, color: '#1c1917' }}>O sistema acabou de ser atualizado</h2>
              <p style={{ margin: '0 0 18px', fontSize: 13.5, lineHeight: 1.6, color: '#57534e' }}>
                Uma nova versão entrou no ar enquanto esta aba estava aberta. Recarregue para continuar de onde parou.
              </p>
              <button onClick={() => window.location.reload()} style={{ background: '#1c1917', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 22px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                Recarregar agora
              </button>
            </div>
          </div>
        );
      }
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
  "/versoes": "Versões aprovadas",
  "/registros": "Registros",
  "/analises": "Análises",
  "/prazos": "Gestão de Prazos",
  "/patrocinadores": "Patrocinadores",
  "/configurar-cotas": "Configurar Cotas",
  "/triagem-retorno": "Triagem de Retorno",
  "/estoque": "Estoque",
  "/usuarios": "Usuários",
  "/logs-sistema": "Logs do Sistema",
  "/notificacoes": "Notificações",
  "/reparo-motivos": "Correção de textos",
  "/change-password": "Alterar Senha",
};

function getRouteLabel(location: string): string {
  if (ROUTE_LABELS[location]) return ROUTE_LABELS[location];
  if (location.startsWith("/eventos/")) return "Detalhe do Evento";
  // Rota desconhecida cai no NotFound — a aba dizia só "NORTE" e não contava
  // que a página não existe.
  return "Página não encontrada";
}

// ─── Papéis por rota (hoisted: recriar os arrays a cada render fazia o
// useEffect do guard rodar de novo em todo render, pois allowedRoles é dep) ──
const ROLES_ADMIN = ["admin"];
const ROLES_ARTE = ["arte", "atendimento", "admin"];
const ROLES_VINCULAR = ["arte", "solicitacao", "atendimento", "admin"];
const ROLES_ATENDIMENTO = ["atendimento", "arte", "admin"];
const ROLES_SOLICITACAO = ["solicitacao", "admin"];
const ROLES_GRAFICA = ["grafica", "solicitacao", "admin"];
const ROLES_PATROCINADORES = ["solicitacao", "atendimento", "admin"];
// Cotas voltou a ser só do admin (decisão do dono, 17/08).
const ROLES_COTAS = ["admin"];

// Atalho real do sidebar no Mac é ⌘B — o title dizia Ctrl+B para todo mundo.
const IS_MAC = typeof navigator !== "undefined" && /mac/i.test(navigator.platform);

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const [location, setLocation] = useLocation();

  // replace: o redirect do guard não deve virar entrada no histórico — com
  // push, Voltar devolvia o usuário à rota proibida e ele era re-redirecionado.
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setLocation("/login", { replace: true });
    } else if (!isLoading && user?.mustChangePassword && location !== "/change-password") {
      setLocation("/change-password", { replace: true });
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

  // replace: mesmo racional do ProtectedRoute — redirect de guard não empilha
  // histórico.
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setLocation("/login", { replace: true });
    } else if (!isLoading && user?.mustChangePassword && location !== "/change-password") {
      setLocation("/change-password", { replace: true });
    } else if (!isLoading && isAuthenticated && user && !allowedRoles.includes(user.role)) {
      setLocation("/", { replace: true });
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
    <Suspense fallback={<PaginaCarregando />}>
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/change-password">
        {() => <ProtectedRoute component={ChangePassword} />}
      </Route>
      <Route path="/">
        {() => <ProtectedRoute component={PainelGeral} />}
      </Route>
      <Route path="/analises">
        {() => <RoleProtectedRoute component={DashboardAnalises} allowedRoles={ROLES_ADMIN} />}
      </Route>
      <Route path="/prazos">
        {/* Aberta a todo usuário autenticado: o recorte de quem PODE AGIR
            mora nos controles de escrita, não na porta da tela. */}
        {() => <ProtectedRoute component={GestaoPrazos} />}
      </Route>
      <Route path="/eventos">
        {() => <ProtectedRoute component={Eventos} />}
      </Route>
      {/* Duas segmentos — declarada antes da genérica por clareza. */}
      <Route path="/eventos/:id/gerar-book">
        {() => <ProtectedRoute component={BookGerador} />}
      </Route>
      <Route path="/eventos/:id/etiquetas">
        {() => <ProtectedRoute component={EtiquetasEvento} />}
      </Route>
      <Route path="/eventos/:id/relatorio">
        {() => <ProtectedRoute component={RelatorioEvento} />}
      </Route>
      <Route path="/eventos/:id">
        {() => <ProtectedRoute component={EventDetail} />}
      </Route>
      <Route path="/arte">
        {() => <RoleProtectedRoute component={Arte} allowedRoles={ROLES_ARTE} />}
      </Route>
      <Route path="/vincular-patrocinadores">
        {() => <RoleProtectedRoute component={VincularPatrocinadores} allowedRoles={ROLES_VINCULAR} />}
      </Route>
      <Route path="/atendimento">
        {() => <RoleProtectedRoute component={Atendimento} allowedRoles={ROLES_ATENDIMENTO} />}
      </Route>
      <Route path="/solicitacao">
        {() => <RoleProtectedRoute component={Solicitacao} allowedRoles={ROLES_SOLICITACAO} />}
      </Route>
      <Route path="/grafica">
        {() => <RoleProtectedRoute component={Grafica} allowedRoles={ROLES_GRAFICA} />}
      </Route>
      <Route path="/modelos">
        {() => <RoleProtectedRoute component={Modelos} allowedRoles={ROLES_SOLICITACAO} />}
      </Route>
      <Route path="/calendario">
        {() => <ProtectedRoute component={Calendario} />}
      </Route>
      <Route path="/historico">
        {() => <ProtectedRoute component={Historico} />}
      </Route>
      <Route path="/versoes">
        {() => <ProtectedRoute component={Versoes} />}
      </Route>
      <Route path="/registros">
        {() => <ProtectedRoute component={Registros} />}
      </Route>
      <Route path="/usuarios">
        {() => <RoleProtectedRoute component={Usuarios} allowedRoles={ROLES_ADMIN} />}
      </Route>
      <Route path="/patrocinadores">
        {() => <RoleProtectedRoute component={Patrocinadores} allowedRoles={ROLES_PATROCINADORES} />}
      </Route>
      <Route path="/notificacoes">
        {() => <RoleProtectedRoute component={Notificacoes} allowedRoles={ROLES_ADMIN} />}
      </Route>
      <Route path="/logs-sistema">
        {() => <RoleProtectedRoute component={LogsSistema} allowedRoles={ROLES_ADMIN} />}
      </Route>
      <Route path="/reparo-motivos">
        {() => <RoleProtectedRoute component={ReparoMotivos} allowedRoles={ROLES_ADMIN} />}
      </Route>
      <Route path="/estoque">
        {() => <RoleProtectedRoute component={Estoque} allowedRoles={ROLES_ADMIN} />}
      </Route>
      <Route path="/triagem-retorno">
        {() => <RoleProtectedRoute component={TriagemRetorno} allowedRoles={ROLES_ADMIN} />}
      </Route>
      <Route path="/configurar-cotas">
        {() => <RoleProtectedRoute component={ConfigurarCotas} allowedRoles={ROLES_COTAS} />}
      </Route>
      <Route component={NotFound} />
    </Switch>
    </Suspense>
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
    onError: (error: Error) => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      // A mensagem real importa: pode ser a guarda de "servidor
      // desatualizado", que diz exatamente o que fazer.
      toast({ title: "Não foi possível marcar como lida", description: error?.message || "Tente novamente.", variant: "destructive" });
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
    onError: (error: Error) => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      toast({ title: "Não foi possível marcar todas como lidas", description: error?.message || "Tente novamente.", variant: "destructive" });
    },
  });

  // Mesmo fluxo do botão da sidebar (app-sidebar.tsx) — agora ambos consomem
  // o hook compartilhado.
  const logoutMutation = useLogout();

  // Título de página: um rótulo por rota, visível na topbar e na aba do
  // navegador — antes toda aba se chamava igual.
  const pageLabel = getRouteLabel(location);

  /**
   * O TÍTULO DA TOPBAR APARECE QUANDO O <h1> DA PÁGINA SAI DE VISTA.
   *
   * Ele era `md:hidden` — some no desktop — porque duplicava o <h1> logo
   * abaixo. Verdade enquanto o <h1> está na tela; assim que a pessoa rola uma
   * lista longa, a única indicação de onde ela está é a aba do navegador.
   *
   * O padrão é MOSTRAR: página sem <h1> (ou com um que ainda não renderizou
   * na primeira passada) cai no caso seguro, que é ter a bússola. O `rAF`
   * cobre a página que monta o cabeçalho um quadro depois — sem ele, uma tela
   * com esqueleto de carregamento ficaria com o título preso para sempre.
   */
  const [h1Visivel, setH1Visivel] = useState(false);
  useEffect(() => {
    let obs: IntersectionObserver | null = null;
    let raf = 0;
    const ligar = () => {
      const alvo = document.querySelector("main h1");
      if (!alvo) return false;
      obs = new IntersectionObserver(
        ([e]) => setH1Visivel(e.isIntersecting),
        // Desconta a própria topbar: o <h1> que passou por baixo dela já
        // não está visível, mesmo ainda intersectando a viewport.
        { rootMargin: "-64px 0px 0px 0px" },
      );
      obs.observe(alvo);
      return true;
    };
    setH1Visivel(false);
    if (!ligar()) raf = requestAnimationFrame(() => { ligar(); });
    return () => { if (raf) cancelAnimationFrame(raf); obs?.disconnect(); };
  }, [location]);
  useEffect(() => {
    document.title = pageLabel ? `NORTE — ${pageLabel}` : "NORTE";
  }, [pageLabel]);

  return (
    <div className="flex h-dvh w-full">
      <AppSidebar />
      {/* Paleta Ctrl+K — montada uma vez, para toda tela autenticada. */}
      <BuscaGlobal />
      {/* O header fica FORA do SidebarInset: o inset é o <main> da página e
          um banner dentro de main deixa de ser landmark de topo — a página
          fica com 1 main e 1 banner. */}
      <div className="flex flex-col flex-1 min-w-0">
        <header
          role="banner"
          className="sticky top-0 z-50 w-full"
          style={{
            height: 64,
            backgroundColor: "rgba(249,249,248,0.85)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            // Borda, não sombra. A sombra caía sobre um fundo quase da mesma
            // cor da barra: em vez de destacar, sujava a linha de baixo com um
            // degradê de 32px que nunca chegava a parecer separação.
            borderBottom: "1px solid #e7e5e4",
            display: "flex", alignItems: "center",
            justifyContent: "space-between",
            padding: "0 24px",
          }}
        >
          {/* Left: trigger + título da rota. flex:1 + minWidth:0 deixam o
              título encolher com reticências a 375px em vez de empurrar o
              grupo direito para fora da tela. */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
            {/* Os três controles da barra (gatilho, sino e conta) tinham três
                formas: fantasma de 44, fantasma redondo e pílula sem borda.
                Agora são a mesma peça — 36 no ponteiro, 44 no toque, contorno
                de 1px e raio 9 — e a barra passa a ter uma gramática só. */}
            <SidebarTrigger
              data-testid="button-sidebar-toggle"
              className="h-9 w-9 md:h-9 md:w-9 max-md:h-11 max-md:w-11 rounded-[9px] border border-[#e7e5e4] bg-white shrink-0"
              title={`Abrir/fechar menu (${IS_MAC ? "⌘B" : "Ctrl+B"})`}
            />
            {pageLabel && (
              <span
                data-testid="text-page-title"
                title={pageLabel}
                // Fica no DOM com opacidade 0 em vez de sair dele: assim a
                // largura do meio da barra não muda quando ele entra, e os
                // controles da direita não dão um pulo lateral a cada rolagem.
                aria-hidden={h1Visivel ? "true" : undefined}
                style={{
                  fontFamily: "'Space Grotesk', sans-serif",
                  fontSize: 14, fontWeight: 700, color: "#1c1917",
                  flex: "1 1 auto", minWidth: 0,
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  opacity: h1Visivel ? 0 : 1,
                  transition: "opacity 0.18s ease",
                }}
              >
                {pageLabel}
              </span>
            )}
          </div>

          {/* Right: busca + notifications + avatar */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            {/* A porta VISÍVEL da busca global — o Ctrl+K existe, mas atalho
                sem botão é recurso que só quem já sabe usa. Mesma peça dos
                vizinhos: 36 no ponteiro, 44 no toque, contorno e raio 9. */}
            <button
              type="button"
              onClick={abrirBuscaGlobal}
              data-testid="button-busca-global"
              title={`Buscar peça ou evento (${IS_MAC ? "⌘K" : "Ctrl+K"})`}
              aria-label="Buscar peça ou evento"
              className="h-9 w-9 max-md:h-11 max-md:w-11 rounded-[9px] border border-[#e7e5e4] bg-white shrink-0 flex items-center justify-center cursor-pointer"
            >
              <Search aria-hidden="true" style={{ width: 16, height: 16, color: "#57534e" }} />
            </button>
            <NotificationBell
              notifications={notifications}
              isLoading={notificationsLoading}
              isError={notificationsError}
              onRetry={() => refetchNotifications()}
              onMarkAsRead={(id) => markAsReadMutation.mutate(id)}
              onMarkAllRead={() => markAllReadMutation.mutate()}
              isMarkingAll={markAllReadMutation.isPending}
              onViewAll={() => setLocation("/historico")}
              // Clique navega ao contexto: detalhe do evento e, se houver
              // itemId, ?item= abre o dialog da peça (deep-link do event-detail).
              //
              // EXCEÇÃO — complemento para quem imprime. O aviso de aumento de
              // quantidade existe para a Gráfica AGIR: o destino útil é a fila
              // dela, com a peça já filtrada (/grafica também lê ?item=), não a
              // ficha da peça no detalhe do evento, que é a tela de quem pede.
              // Levar o operador para a tela errada é o tipo de detalhe que faz
              // o alerta ser ignorado na segunda vez.
              onOpen={(n) => {
                const ehComplemento = typeof n.type === "string" && n.type.startsWith("complement");
                if (ehComplemento && user?.role === "grafica" && n.itemId) {
                  setLocation(`/grafica?item=${n.itemId}`);
                  return;
                }
                setLocation(`/eventos/${n.eventId}${n.itemId ? `?item=${n.itemId}` : ""}`);
              }}
            />
            {/* Quem está logado agora é um menu: alterar senha e sair deixam
                de depender da sidebar (que no mobile vive fechada). */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  data-testid="button-user-menu"
                  aria-label={user?.name ? `Menu do usuário — ${user.name}` : "Menu do usuário"}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    height: 36, padding: "0 5px 0 12px",
                    backgroundColor: "#ffffff", border: "1px solid #e7e5e4",
                    borderRadius: 999,
                    cursor: "pointer", flexShrink: 0,
                  }}
                >
                  <div className="hidden md:block" style={{ textAlign: "right", lineHeight: 1.2 }}>
                    <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: "#1c1917", whiteSpace: "nowrap" }}>
                      {user?.name}
                    </p>
                    <p style={{ margin: 0, fontSize: 10, color: "#746e69", textTransform: "capitalize", whiteSpace: "nowrap" }}>
                      {roleLabel(user?.role)}
                    </p>
                  </div>
                  <div
                    style={{
                      // 26 e sem o anel duplo: o `boxShadow` desenhava dois
                      // círculos concêntricos em volta do avatar para separá-lo
                      // de um fundo do qual ele já se separava por ser preto —
                      // e agora a borda da pílula faz esse papel.
                      width: 26, height: 26,
                      borderRadius: "50%",
                      backgroundColor: "#1c1917",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <span style={{
                      fontFamily: "'Space Grotesk', sans-serif",
                      fontSize: 12, fontWeight: 700,
                      color: "#fb923c", letterSpacing: "-0.02em",
                    }}>
                      {userInitials(user?.name)}
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
        {/* `position: relative` e o bloco de contencao das telas que se fixam
            na casca em vez de crescer dentro dela (hoje a Arte). Nao muda o
            layout de ninguem: so da um ancestral posicionado a quem pedir. */}
        <SidebarInset className="flex-1 overflow-y-auto min-h-0" style={{ minWidth: 0, position: "relative" }}>
          <Router />
        </SidebarInset>
      </div>
    </div>
  );
}

function AppContent() {
  const { isAuthenticated, isLoading } = useAuth();
  const [location] = useLocation();

  if (isLoading) {
    return <FullPageLoader />;
  }

  // Sem sessão (o guard redireciona ao /login) ou já no /login: só o Router,
  // sem sidebar/topbar. Eram dois ifs idênticos.
  if (!isAuthenticated || location === "/login") {
    return <Router />;
  }

  // Show authenticated layout with sidebar
  return <AuthenticatedLayout />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          {/* Sem style: 16rem/3rem já são os defaults do SidebarProvider —
              a redefinição era redundante. */}
          <SidebarProvider
            // O provider grava o cookie sidebar_state a cada toggle, mas nunca
            // o lia de volta: o colapso evaporava a cada reload. A âncora
            // (?:^|;\s*) evita casar sufixos de outro cookie (ex.:
            // app_sidebar_state).
            defaultOpen={document.cookie.match(/(?:^|;\s*)sidebar_state=([^;]+)/)?.[1] !== "false"}
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
