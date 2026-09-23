import { Switch, Route, Redirect, useLocation } from "wouter";
import { SOLICITACAO_AO_ESTOQUE_ATIVA } from "@shared/consultas-de-estoque";
import { queryClient, apiRequest } from "./lib/queryClient";
import { haVersaoNova, onVersaoNova } from "@/lib/versao-do-app";
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
import { Search, WifiOff, RefreshCw } from "lucide-react";
import { AuthProvider, useAuth } from "@/contexts/auth-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { roleLabel, userInitials } from "@/lib/utils";
import { useToast, toast as toastGlobal } from "@/hooks/use-toast";
import { useLogout } from "@/hooks/use-logout";
import { useWebSocket, onConexaoTempoReal } from "@/hooks/use-websocket";
import { useEffect, useState, Component, lazy, Suspense, type ReactNode, type ComponentType } from "react";
import { T, N, R, FS, FW, FONT } from "@/lib/theme";

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
      <div className="animate-pulse" style={{ width: 220, height: 22, borderRadius: R.sm, backgroundColor: T.border, marginBottom: 8 }} />
      <div className="animate-pulse" style={{ width: 340, height: 13, borderRadius: 4, backgroundColor: N.n3, marginBottom: 20 }} />
      <div style={{ backgroundColor: T.surface, border: `1px solid ${T.border}`, borderRadius: R.lg, overflow: "hidden" }}>
        <div style={{ height: 44, backgroundColor: T.bg, borderBottom: `1px solid ${T.border}` }} />
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 18, height: 58, padding: "0 16px", borderBottom: `1px solid ${N.n3}` }}>
            <div className="animate-pulse" style={{ width: 52, height: 12, borderRadius: 4, backgroundColor: T.border }} />
            <div className="animate-pulse" style={{ width: `${34 - i * 4}%`, height: 12, borderRadius: 4, backgroundColor: T.border }} />
            <div className="animate-pulse" style={{ width: 88, height: 22, borderRadius: R.pill, backgroundColor: N.n3, marginLeft: "auto" }} />
          </div>
        ))}
      </div>
    </div>
  );
}
import NotFound from "@/pages/not-found";
// ── CODE SPLITTING (auditoria de performance, 27/08) ─────────────────────────
// As 28 páginas eram importadas eager e colapsavam num único chunk de ~2,4 MB:
// o operador da Gráfica baixava recharts (página só-admin), pdf-lib (gerador
// de book) e todo o resto antes do primeiro paint da fila dele. Com lazy, cada
// rota vira um chunk próprio, baixado quando o usuário a abre — e um deploy só
// invalida o cache dos chunks que mudaram. NotFound segue eager: é leve e é a
// rota de sobra do Switch.
//
// PERF-7 (17/09): Login e Alterar Senha ERAM eager "porque pesam nada" — mas
// traziam junto zod, react-hook-form, @hookform/resolvers e (via
// changePasswordSchema de @shared/schema) drizzle-orm + o schema inteiro:
// o chunk de entrada caiu de 409 KB (121 KB gzip) para 247 KB (77 KB gzip)
// ao tirá-los — peso baixado e parseado a cada F5 de quem JÁ está logado e
// nunca vê essas telas. Lazy, eles só descem para quem
// abre o login ou a troca de senha.
const Login = lazyPage(() => import("@/pages/login"));
const ChangePassword = lazyPage(() => import("@/pages/change-password"));
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
const PedidosDePeca = lazyPage(() => import("@/pages/pedidos-de-peca"));
const Grafica = lazyPage(() => import("@/pages/grafica"));
const GraficaMaquinas = lazyPage(() => import("@/pages/grafica-maquinas"));
const SolicitacoesAoEstoque = lazyPage(() => import("@/pages/solicitacoes-ao-estoque"));
const EtiquetaTubo = lazyPage(() => import("@/pages/etiqueta-tubo"));
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
const ReparoVinculosEvento = lazyPage(() => import("@/pages/reparo-vinculos-evento"));
const InferirExecutivos = lazyPage(() => import("@/pages/inferir-executivos"));


class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { error: Error | null; key?: string }> {
  state: { error: Error | null; key?: string } = { error: null, key: this.props.resetKey };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error("[ErrorBoundary] CRASH:", error.message, error.stack, info.componentStack);
  }
  // Mudou de rota, some o erro. A fronteira de dentro (em volta do Router)
  // recebe a rota como resetKey: quem bateu num defeito numa tela sai dele
  // clicando em qualquer item da sidebar — antes a tela quebrada ficava
  // presa até um F5, com o menu ao lado funcionando e sem efeito nenhum.
  // No render (e não em componentDidUpdate): lá, quando a tela NOVA quebrava,
  // o update ainda via a rota anterior, limpava o erro e montava a tela
  // quebrada duas vezes (requisições em dobro).
  static getDerivedStateFromProps(props: { resetKey?: string }, state: { error: Error | null; key?: string }) {
    return props.resetKey !== state.key ? { key: props.resetKey, error: null } : null;
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
      // Defeito de verdade. Era um stack trace vermelho em monospace na cara
      // do usuário — parecia que o sistema inteiro tinha caído. Agora a tela
      // fala a língua de quem usa, oferece as duas saídas que resolvem (tentar
      // de novo / recarregar) e guarda o detalhe técnico recolhido, para quem
      // for mandar o print ao suporte.
      return (
        <div role="alert" data-testid="tela-erro-render" style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem 16px' }}>
          <div style={{ maxWidth: 460, width: '100%', textAlign: 'center' }}>
            <h2 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 800, color: '#1c1917' }}>Esta tela encontrou um problema</h2>
            <p style={{ margin: '0 0 18px', fontSize: 13.5, lineHeight: 1.6, color: '#57534e' }}>
              Nada do que já estava salvo foi perdido. Tente abrir de novo; se continuar, recarregue a página ou use o menu para ir a outra tela.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button type="button" onClick={() => this.setState({ error: null })} style={{ background: '#1c1917', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer', minHeight: 40 }}>
                Tentar novamente
              </button>
              <button type="button" onClick={() => window.location.reload()} style={{ background: '#fff', color: '#1c1917', border: '1px solid #d6d3d1', borderRadius: 8, padding: '10px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer', minHeight: 40 }}>
                Recarregar a página
              </button>
            </div>
            <details style={{ marginTop: 20, textAlign: 'left' }}>
              <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#746e69' }}>Detalhes técnicos (para o suporte)</summary>
              <pre style={{ marginTop: 8, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 11, lineHeight: 1.5, color: '#57534e', background: '#fafaf9', border: '1px solid #e7e5e4', borderRadius: 8, padding: 12, maxHeight: 220, overflow: 'auto' }}>
                {err.message}{"\n"}{err.stack}
              </pre>
            </details>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// Um único loader de página inteira: o mesmo bloco vivia copiado em
// ProtectedRoute, RoleProtectedRoute e AppContent.
// A marca no lugar do "Carregando..." solto: é a primeira coisa que se vê a
// cada F5, e texto cinza no meio do vazio tinha cara de página quebrada.
function FullPageLoader() {
  return (
    <div role="status" aria-live="polite" className="flex items-center justify-center h-dvh" style={{ backgroundColor: T.bg }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
        <span aria-hidden="true" className="animate-pulse" style={{ fontFamily: FONT.display, fontSize: FS.title, fontWeight: FW.rotulo, letterSpacing: "-0.05em", color: T.text }}>
          NORTE
        </span>
        <span style={{ fontSize: FS.meta, color: T.second }}>Carregando…</span>
      </div>
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
  // Mesmo rótulo do menu (16/09): o status que traz a peça para cá é
  // "Aguardando Revisão Final".
  "/solicitacao": "Revisão Final",
  "/pedidos-de-peca": "Solicitação de peças",
  "/grafica": "Gráfica",
  "/grafica/maquinas": "Máquinas da Gráfica",
  "/grafica/solicitacoes-ao-estoque": "Solicitações ao estoque",
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
  "/reparo-vinculos-evento": "Reparo de vínculos",
  "/inferir-executivos": "Inferir executivos",
  "/change-password": "Alterar Senha",
};

function getRouteLabel(location: string): string {
  if (ROUTE_LABELS[location]) return ROUTE_LABELS[location];
  // As três subtelas do evento tinham o MESMO título do detalhe: quem abria o
  // relatório via "Detalhe do Evento" na aba e na barra, e não sabia se o
  // clique tinha levado a algum lugar.
  if (location.startsWith("/eventos/")) {
    if (location.endsWith("/gerar-book")) return "Gerar book";
    if (location.endsWith("/etiquetas")) return "Etiquetas do evento";
    if (location.endsWith("/relatorio")) return "Relatório do evento";
  }
  if (location.startsWith("/eventos/")) return "Detalhe do Evento";
  if (location.startsWith("/grafica/tubos/")) return "Etiqueta do tubo";
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
// Triagem e local no galpão são da Gráfica (dono, 14/09). O Estoque usa
// ROLES_GRAFICA: a Solicitação consulta o que tem para reservar.
// 15/09: Triagem de Retorno é só do admin (como o Estoque).
const ROLES_TRIAGEM = ["admin"];
// Pedidos de peça: o Atendimento pede, a Solicitação resolve (dono, 14/09).
const ROLES_PEDIDOS = ["atendimento", "solicitacao", "admin"];
const ROLES_PATROCINADORES = ["solicitacao", "atendimento", "admin"];
// Cotas voltou a ser só do admin (decisão do dono, 17/08).
const ROLES_COTAS = ["admin"];
// Estoque é só do admin (dono, 15/09). A Triagem continua da Gráfica.
const ROLES_ESTOQUE = ["admin"];

/** VER COMO (15/09): os perfis que o admin pode experimentar. */
const PERFIS_VER_COMO: Array<{ chave: string; role: string; kit?: boolean; rotulo: string }> = [
  { chave: "admin", role: "admin", rotulo: "Administrador" },
  { chave: "solicitacao", role: "solicitacao", rotulo: "Solicitação" },
  { chave: "solicitacao-kit", role: "solicitacao", kit: true, rotulo: "Solicitação · Kit" },
  { chave: "arte", role: "arte", rotulo: "Arte" },
  { chave: "atendimento", role: "atendimento", rotulo: "Atendimento" },
  { chave: "grafica", role: "grafica", rotulo: "Gráfica" },
];

/** Troca o perfil da sessão e recarrega do início (caches de outro perfil não servem). */
async function verComo(role: string, kit = false): Promise<void> {
  const r = await fetch("/api/auth/ver-como", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role, kit }),
  });
  // Servidor antigo (git pull sem Stop/Run) não conhece a rota: o catch-all do
  // app devolve a página HTML com 200 e parecia ter dado certo.
  const json = (r.headers.get("content-type") || "").includes("application/json")
    ? await r.json().catch(() => null)
    : null;
  if (r.ok && json && (json.role === role || (role === "admin" && json.papelReal == null))) {
    window.location.assign("/");
    return;
  }
  // Toast e não window.alert: o alerta nativo congelava a aba e tinha a cara
  // do navegador, não do sistema.
  toastGlobal({
    variant: "destructive",
    title: "Não deu para trocar o perfil",
    description: json?.error
      ?? "O servidor ainda está na versão anterior. No Replit, pare e rode o app de novo (Stop/Run) e tente outra vez.",
  });
}

/**
 * AONDE CADA AVISO DO SINO LEVA — `null` quando não há lugar para ir.
 *
 * Um lugar só para a decisão, e o sino pergunta a ela antes de prometer
 * "abrir" (antes ele decidia por `eventId`, e dois avisos de LOTE — "N peças
 * aguardando criação de thumb" — não tinham evento: o clique só marcava como
 * lido e deixava a pessoa sem saber para onde ir).
 *
 * A regra de fundo: o aviso existe para alguém AGIR, então o destino é a tela
 * onde a ação mora quando ela é certa; nos demais, a ficha da peça no Detalhe
 * do Evento, que diz na faixa do alto o que falta e de quem é a vez.
 */
function destinoDaNotificacao(n: Notification, role?: string | null): string | null {
  const tipo = typeof n.type === "string" ? n.type : "";
  // COMPLEMENTO para quem imprime. O aviso de aumento de quantidade existe para
  // a Gráfica AGIR: o destino útil é a fila dela, com a peça já filtrada
  // (/grafica lê ?item=), não a ficha no detalhe do evento, que é a tela de
  // quem pede. Levar o operador para a tela errada é o tipo de detalhe que faz
  // o alerta ser ignorado na segunda vez.
  //
  // "Item liberado para produção" é o mesmo caso: é o aviso que COLOCA trabalho
  // na fila da Gráfica (items.ts, targetRoles grafica).
  if (role === "grafica" && n.itemId && (tipo.startsWith("complement") || tipo === "arteApproved")) {
    return `/grafica?item=${n.itemId}`;
  }
  // SOLICITAÇÃO AO ESTOQUE (21/09). A Gráfica vai para a caixa dela, onde
  // responde. Quem pediu: resposta de peça AINDA na Revisão Final abre a FICHA
  // (é lá que ela confirma e libera); resposta de peça que ela liberou sem
  // esperar abre a caixa, na aba Respondidas, onde o desfecho está escrito.
  if (tipo.startsWith("consultaDeEstoque")) {
    if (tipo === "consultaDeEstoque") return "/grafica/solicitacoes-ao-estoque";
    if (role === "grafica" || tipo === "consultaDeEstoqueAplicada") return "/grafica/solicitacoes-ao-estoque?aba=respondidas";
    return n.itemId ? `/solicitacao?item=${n.itemId}` : "/solicitacao";
  }
  // PEDIDOS DE PEÇA (14/09): cada aviso leva a quem precisa agir.
  // Atendimento: a peça atendida abre a peça; o resto, a página de
  // pedidos. Solicitação/admin: o painel de pedidos do evento.
  if (tipo.startsWith("pedido")) {
    if (role === "atendimento") {
      return tipo === "pedidoAtendido" && n.itemId && n.eventId ? `/eventos/${n.eventId}?item=${n.itemId}` : "/pedidos-de-peca";
    }
    return n.eventId ? `/eventos/${n.eventId}?pedidos=1` : "/pedidos-de-peca";
  }
  // Avisos de LOTE, sem peça: a fila onde o lote espera.
  if (tipo === "itemsSentToArte" && ROLES_ARTE.includes(role ?? "")) return "/arte";
  if (tipo === "itemsSubmitted" && ROLES_VINCULAR.includes(role ?? "")) return "/vincular-patrocinadores";
  if (n.eventId) return `/eventos/${n.eventId}${n.itemId ? `?item=${n.itemId}` : ""}`;
  return null;
}

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
  semKit = false,
}: {
  component: React.ComponentType;
  allowedRoles: string[];
  /** A tela não é do usuário do Kit (15/09: Modelos). */
  semKit?: boolean;
}) {
  const { isAuthenticated, isLoading, user: usuario } = useAuth();
  // Usuário do Kit numa tela que não é dele conta como perfil sem acesso.
  const user = usuario && semKit && usuario.kit ? { ...usuario, role: "__kit__" as any } : usuario;
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

  // Aparece por um instante, enquanto o guard acima redireciona. "Acesso
  // negado" soava como bronca; a frase diz o que é e para onde se vai.
  if (!allowedRoles.includes(user?.role || '')) {
    return (
      <div role="status" style={{ minHeight: "50vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center" }}>
        <p style={{ margin: 0, fontSize: 13.5, color: "#57534e" }}>
          Esta tela não faz parte do seu perfil. Levando você ao Painel Geral…
        </p>
      </div>
    );
  }

  return <Component />;
}

function Router() {
  return (
    <Suspense fallback={<PaginaCarregando />}>
    <Switch>
      <Route path="/login">
        {/* Suspense próprio: o login não tem casca em volta, e a silhueta de
            tabela do fallback geral parecia uma tela quebrada antes do form. */}
        {() => <Suspense fallback={<FullPageLoader />}><Login /></Suspense>}
      </Route>
      <Route path="/change-password">
        {/* Mesmo Suspense do login: a troca obrigatória de senha também abre
            fora da rotina da casca, e a silhueta de tabela antes do form
            parecia tela quebrada. */}
        {() => <Suspense fallback={<FullPageLoader />}><ProtectedRoute component={ChangePassword} /></Suspense>}
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
      <Route path="/pedidos-de-peca">
        {() => <RoleProtectedRoute component={PedidosDePeca} allowedRoles={ROLES_PEDIDOS} />}
      </Route>
      <Route path="/grafica/tubos/:id/etiqueta">
        {() => <RoleProtectedRoute component={EtiquetaTubo} allowedRoles={ROLES_GRAFICA} />}
      </Route>
      {/* Solicitação ao estoque: chave desligada (dono, 21/09 — segurar). Um
          link antigo cai na Gráfica em vez de numa tela sem uso. */}
      <Route path="/grafica/solicitacoes-ao-estoque">
        {() => SOLICITACAO_AO_ESTOQUE_ATIVA
          ? <RoleProtectedRoute component={SolicitacoesAoEstoque} allowedRoles={ROLES_GRAFICA} />
          : <Redirect to="/grafica" replace />}
      </Route>
      <Route path="/grafica/maquinas">
        {() => <RoleProtectedRoute component={GraficaMaquinas} allowedRoles={ROLES_GRAFICA} />}
      </Route>
      <Route path="/grafica">
        {() => <RoleProtectedRoute component={Grafica} allowedRoles={ROLES_GRAFICA} />}
      </Route>
      <Route path="/modelos">
        {() => <RoleProtectedRoute component={Modelos} allowedRoles={ROLES_SOLICITACAO} semKit />}
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
      <Route path="/reparo-vinculos-evento">
        {() => <RoleProtectedRoute component={ReparoVinculosEvento} allowedRoles={ROLES_ADMIN} />}
      </Route>
      <Route path="/inferir-executivos">
        {() => <RoleProtectedRoute component={InferirExecutivos} allowedRoles={ROLES_ADMIN} />}
      </Route>
      <Route path="/estoque">
        {() => <RoleProtectedRoute component={Estoque} allowedRoles={ROLES_ESTOQUE} />}
      </Route>
      <Route path="/triagem-retorno">
        {() => <RoleProtectedRoute component={TriagemRetorno} allowedRoles={ROLES_TRIAGEM} />}
      </Route>
      <Route path="/configurar-cotas">
        {() => <RoleProtectedRoute component={ConfigurarCotas} allowedRoles={ROLES_COTAS} />}
      </Route>
      <Route component={NotFound} />
    </Switch>
    </Suspense>
  );
}

/**
 * AVISO DE CONEXÃO — só aparece quando há algo errado, e some sozinho.
 *
 * Dois sinais, um lugar: sem internet (o navegador sabe na hora) e tempo real
 * fora do ar (o WebSocket caiu e ainda não voltou). O segundo espera 8s antes
 * de aparecer: reinício rápido do servidor reconecta em 1-2s, e piscar uma
 * faixa amarela a cada deploy ensinaria a ignorá-la. Informativo apenas —
 * nenhum dado, trava ou botão muda por causa dele.
 */
function AvisoDeConexao() {
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  const [tempoRealFora, setTempoRealFora] = useState(false);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  useEffect(() => {
    let espera: ReturnType<typeof setTimeout> | null = null;
    const cancelar = onConexaoTempoReal((conectado) => {
      if (espera) { clearTimeout(espera); espera = null; }
      if (conectado) setTempoRealFora(false);
      else espera = setTimeout(() => setTempoRealFora(true), 8000);
    });
    return () => { cancelar(); if (espera) clearTimeout(espera); };
  }, []);

  if (online && !tempoRealFora) return null;
  const semInternet = !online;
  const Icone = semInternet ? WifiOff : RefreshCw;
  return (
    <div
      role="status"
      data-testid="aviso-conexao"
      style={{
        display: "flex", alignItems: "center", justifyContent: "center", gap: 8, flexWrap: "wrap",
        padding: "7px 16px", backgroundColor: "#fffbeb", borderBottom: "1px solid #fde68a",
        color: "#78350f", fontSize: 12.5, fontWeight: 600, textAlign: "center",
      }}
    >
      <Icone aria-hidden="true" className={semInternet ? undefined : "animate-spin"} style={{ width: 14, height: 14, flexShrink: 0, animationDuration: "2s" }} />
      {semInternet
        ? "Sem internet. O que você fizer agora pode não chegar ao servidor."
        : "Reconectando ao tempo real… As telas podem estar desatualizadas até voltar."}
    </div>
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
  // A aba conta as não lidas: quem trabalha com o NORTE numa aba de fundo
  // (planilha na frente) via o aviso só quando voltava por outro motivo.
  const naoLidas = notifications.filter((n) => !n.isRead).length;
  useEffect(() => {
    const base = pageLabel ? `NORTE — ${pageLabel}` : "NORTE";
    document.title = naoLidas > 0 ? `(${naoLidas > 99 ? "99+" : naoLidas}) ${base}` : base;
  }, [pageLabel, naoLidas]);

  // TROCOU DE TELA, VOLTA AO TOPO. Quem rola é o <main> da casca, não a
  // janela — e o wouter não mexe nele. Clicar numa peça no fim da lista de
  // Eventos abria o Detalhe do Evento já rolado lá embaixo, com o cabeçalho
  // fora de vista. `location` do wouter não inclui a query string: filtro na
  // URL (?status=…) NÃO rola a tela para cima.
  useEffect(() => {
    document.getElementById("conteudo")?.scrollTo({ top: 0 });
  }, [location]);

  return (
    <div className="flex h-dvh w-full">
      <a href="#conteudo" className="pular-para-conteudo" onClick={(e) => {
        // Âncora com foco explícito: só o hash rola, mas não leva o foco do
        // teclado — o próximo Tab voltaria para a sidebar.
        e.preventDefault();
        document.getElementById("conteudo")?.focus();
      }}>
        Pular para o conteúdo
      </a>
      {/* Anúncio de troca de tela para leitor de tela: numa SPA a página
          muda sem recarregar, e nada dizia que o destino tinha chegado. */}
      <span className="sr-only" aria-live="polite" aria-atomic="true">{pageLabel}</span>
      <AppSidebar />
      {/* Paleta Ctrl+K — montada uma vez, para toda tela autenticada. */}
      <BuscaGlobal />
      {/* O header fica FORA do SidebarInset: o inset é o <main> da página e
          um banner dentro de main deixa de ser landmark de topo — a página
          fica com 1 main e 1 banner. */}
      <div className="flex flex-col flex-1 min-w-0">
        <header
          role="banner"
          // px-3 no celular: os 24px de cada lado comiam 48 dos 375 de uma
          // barra que precisa caber gatilho, título, busca, sino e conta.
          className="sticky top-0 z-50 w-full px-6 max-md:px-3"
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
              // Em tela larga a porta diz o que é e ensina o atalho: a lupa sozinha
              // guardava o Ctrl+K num `title` que só aparece para quem para o
              // ponteiro em cima — quem nunca usou não descobria nenhum dos dois.
              // Abaixo de 1024 volta a ser o quadrado de 36/44 dos vizinhos.
              className="h-9 w-9 max-md:h-11 max-md:w-11 lg:w-auto lg:px-3 lg:gap-2 rounded-[9px] border border-[#e7e5e4] bg-white shrink-0 flex items-center justify-center cursor-pointer"
            >
              <Search aria-hidden="true" style={{ width: 16, height: 16, color: "#57534e" }} />
              <span aria-hidden="true" className="hidden lg:inline" style={{ fontSize: 12.5, fontWeight: 600, color: "#57534e" }}>Buscar</span>
              <kbd aria-hidden="true" className="hidden lg:inline" style={{ fontFamily: "inherit", fontSize: 10.5, fontWeight: 700, color: "#746e69", backgroundColor: "#f5f5f4", border: "1px solid #e7e5e4", borderRadius: 5, padding: "1px 5px" }}>
                {IS_MAC ? "⌘K" : "Ctrl K"}
              </kbd>
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
              // As exceções (fila da Gráfica, pedidos, avisos de lote) moram em
              // `destinoDaNotificacao`.
              podeAbrir={(n) => destinoDaNotificacao(n, user?.role) !== null}
              onOpen={(n) => {
                const destino = destinoDaNotificacao(n, user?.role);
                if (destino) setLocation(destino);
              }}
            />
            {/* Quem está logado agora é um menu: alterar senha e sair deixam
                de depender da sidebar (que no mobile vive fechada). */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  data-testid="button-user-menu"
                  aria-label={user?.name ? `Menu do usuário — ${user.name}` : "Menu do usuário"}
                  // Altura pela classe: a mesma régua dos vizinhos (36 no
                  // ponteiro, 44 no toque). No inline ela ficava em 36 também
                  // no celular — o único controle da barra abaixo do alvo.
                  className="h-9 max-md:h-11 max-md:!pl-[9px]"
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "0 5px 0 12px",
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
                {/* VER COMO (dono, 15/09): o admin navega como outro perfil
                    para conferir o que cada um vê. */}
                {(user?.role === "admin" || user?.papelReal === "admin") && (
                  <>
                    <DropdownMenuLabel style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#746e69" }}>
                      Ver o sistema como
                    </DropdownMenuLabel>
                    {PERFIS_VER_COMO.map((p) => {
                      const atual = (user?.role ?? "") === p.role && !!user?.kit === !!p.kit;
                      return (
                        <DropdownMenuItem key={p.chave} data-testid={`menu-ver-como-${p.chave}`} disabled={atual}
                          onSelect={() => { void verComo(p.role, !!p.kit); }}>
                          {p.rotulo}{atual ? " · atual" : ""}
                        </DropdownMenuItem>
                      );
                    })}
                    <DropdownMenuSeparator />
                  </>
                )}
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
        <SidebarInset id="conteudo" tabIndex={-1} className="flex-1 overflow-y-auto min-h-0" style={{ minWidth: 0, position: "relative", outline: "none" }}>
          {/* Um só bloco grudado no topo: as duas faixas eram sticky em top:0
              e, com a página rolada e o tempo real caído, a amarela cobria a
              azul — justo a do botão "Voltar ao admin". Empilhadas, ambas ficam. */}
          <div style={{ position: "sticky", top: 0, zIndex: 41 }}>
          <AvisoDeConexao />
          {user?.papelReal === "admin" && (
            <div role="status" data-testid="faixa-ver-como"
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, flexWrap: "wrap", padding: "8px 16px", backgroundColor: "#1d4ed8", color: "#fff", fontSize: 13 }}>
              <span>Você está vendo o sistema como <strong>{PERFIS_VER_COMO.find((p) => p.role === user?.role && !!p.kit === !!user?.kit)?.rotulo ?? roleLabel(user?.role)}</strong>.</span>
              <button type="button" data-testid="button-voltar-admin" onClick={() => { void verComo("admin"); }}
                style={{ height: 30, padding: "0 12px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.6)", background: "#fff", color: "#1d4ed8", fontSize: 12.5, fontWeight: 800, cursor: "pointer" }}>
                Voltar ao admin
              </button>
            </div>
          )}
          </div>
          {/* Fronteira POR TELA: um defeito de render numa página não leva
              junto a sidebar e a topbar (a fronteira de fora pegava tudo), e
              trocar de rota limpa o erro. */}
          <ErrorBoundary resetKey={location}>
            <Router />
          </ErrorBoundary>
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
    // Login agora é lazy: chunk que falha (deploy novo, rede do galpão) caía
    // na fronteira GLOBAL, que não se limpa sozinha. Com a fronteira por rota,
    // o erro fica na tela e navegar (ou voltar ao /login) tenta de novo.
    return (
      <ErrorBoundary resetKey={location}>
        <Router />
      </ErrorBoundary>
    );
  }

  // Show authenticated layout with sidebar
  return <AuthenticatedLayout />;
}

/**
 * VERSÃO NOVA NO AR — a aba aberta desde antes do deploy roda o JavaScript
 * antigo (sem os status e telas novos). Faixa discreta e PERSISTENTE, fora das
 * rotas: vale no login e em qualquer tela. Só OFERECE recarregar — recarregar
 * sozinho apagaria o formulário de quem está digitando. Flutua no rodapé para
 * não empurrar o layout de 100svh; a detecção mora em lib/versao-do-app.
 */
function AvisoDeVersaoNova() {
  const [nova, setNova] = useState(haVersaoNova);
  useEffect(() => onVersaoNova(() => setNova(true)), []);
  if (!nova) return null;
  return (
    <div
      role="status"
      data-testid="aviso-versao-nova"
      style={{
        position: "fixed", left: "50%", bottom: 12, transform: "translateX(-50%)", zIndex: 2147483000,
        display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", justifyContent: "center",
        maxWidth: "calc(100vw - 24px)", padding: "8px 10px 8px 14px", borderRadius: 12,
        backgroundColor: "#1c1917", color: "#ffffff", fontSize: 13, fontWeight: 600,
        boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
      }}
    >
      Há uma versão nova do NORTE
      <button
        type="button"
        data-testid="button-recarregar-versao"
        onClick={() => window.location.reload()}
        style={{ minHeight: 36, padding: "0 14px", borderRadius: 8, border: "none", cursor: "pointer", backgroundColor: "#ffffff", color: "#1c1917", fontSize: 13, fontWeight: 800 }}
      >
        Recarregar
      </button>
    </div>
  );
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
          <AvisoDeVersaoNova />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
