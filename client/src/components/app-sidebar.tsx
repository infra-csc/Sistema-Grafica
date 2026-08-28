import {
  Calendar, CalendarRange, Palette, Printer, Layers, LayoutDashboard,
  Activity, BarChart3, Users, Building2, UserCheck, ClipboardCheck,
  Link2, LogOut, Loader2, ScrollText, Archive, ScanSearch, Compass, Settings2, Camera, Wand2,
  Timer, GitBranch, Bell,
} from "lucide-react";
import { useId, useState } from "react";
import { Link, useLocation } from "wouter";
import { roleLabel, userInitials } from "@/lib/utils";
import { useAuth, type UserRole } from "@/contexts/auth-context";
import { useLogout } from "@/hooks/use-logout";
// Alvo de 44 no toque: a mesma régua das outras telas, que a casca não
// seguia — os itens do menu tinham altura de padding, não de controle.
import { useIsMobile } from "@/hooks/use-mobile";
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
  // Qual versão cada patrocinador aprovou, e os books baixáveis — pedido do
  // dono (21/08). Sem `roles`: quem aprova, quem desenha e quem revisa leem.
  { title: "Versões aprovadas",       url: "/versoes",                 icon: GitBranch },
  // Registros fica aqui (e não dentro da Gráfica) porque a maioria dos perfis
  // não acessa a Gráfica e este acervo interessa a todos.
  { title: "Registros",               url: "/registros",               icon: Camera },
  { title: "Análises",                url: "/analises",                icon: BarChart3,      roles: ["admin"] },
  // Sem `roles`: a tela passa a aparecer para TODOS (decisão do dono, 17/08).
  // Quem não é admin vê e não mexe — o registro de cobrança se desabilita
  // sozinho (ver CobradoControl), e o POST /api/prazos/cobrancas segue admin.
  { title: "Gestão de Prazos",        url: "/prazos",                  icon: Timer },
];

// Patrocinadores: visível p/ solicitação, atendimento e admin
const sponsorItems: MenuItem[] = [
  { title: "Patrocinadores",   url: "/patrocinadores",   icon: Building2,  roles: ["solicitacao", "atendimento", "admin"] },
  // Só admin (decisão do dono, 17/08). Antes o Atendimento também via.
  { title: "Configurar Cotas", url: "/configurar-cotas", icon: Settings2,  roles: ["admin"] },
];

// Estoque: apenas admin
const stockItems: MenuItem[] = [
  { title: "Triagem de Retorno", url: "/triagem-retorno", icon: ScanSearch, roles: ["admin"] },
  { title: "Estoque",            url: "/estoque",          icon: Archive,    roles: ["admin"] },
];

// Administração: apenas admin (filtrado via hasPermission no componente)
const adminItems: MenuItem[] = [
  { title: "Usuários",        url: "/usuarios",     icon: Users },
  { title: "Correção de textos", url: "/reparo-motivos", icon: Wand2 },
  { title: "Notificações",    url: "/notificacoes", icon: Bell },
  { title: "Logs do Sistema", url: "/logs-sistema", icon: ScrollText },
];

// ─── Section label ────────────────────────────────────────
const sectionLabelStyle: React.CSSProperties = {
  fontFamily: "'Plus Jakarta Sans', sans-serif",
  fontSize: 10,
  // 800 e 0.12em: o rótulo de seção divide a coluna com 18 itens em 500/600.
  // Em 700/0.1em ele era só mais uma linha de texto pequena entre as outras.
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.12em",
  color: "#746e69",
  // 18 para alinhar com o padding do item (10) + o respiro do <li>.
  padding: "0 18px",
  marginBottom: 4,
  marginTop: 0,
  display: "block",
};

// ─── Single nav item ─────────────────────────────────────
function NavItem({ item, isActive }: { item: MenuItem; isActive: boolean }) {
  const Icon = item.icon;
  const isMobile = useIsMobile();

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
            // ALTURA DE CONTROLE, não de padding.
            //
            // Eram 8px de padding sobre uma linha de 13px — cerca de 33px de
            // alvo, abaixo da régua de 36 que o resto do app segue. E
            // `flexShrink: 0` porque são 18 itens: numa janela de 768px de
            // altura o flex os comprimia até o texto encostar na borda.
            height: isMobile ? 44 : 36,
            flexShrink: 0,
            padding: "0 10px",
            borderRadius: 9,
            fontSize: 13,
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontWeight: isActive ? 700 : 500,
            // #f97316 sobre #fff7ed ficava ~2.5:1 — o texto ativo era o menos
            // legível do menu. #9a3412 mantém a família laranja com contraste AA;
            // a barrinha inset devolve a marcação de "ativo" para quem não
            // distingue a cor.
            color: isActive ? "#9a3412" : highlighted ? "#292524" : "#57534e",
            backgroundColor: isActive ? "#fff7ed" : highlighted ? "#fafaf9" : "transparent",
            // undefined (não "none"): "none" sobrescrevia o focus-ring que o
            // CSS global aplica via box-shadow.
            // 2px: com o item mais baixo, 3px de trilho ficavam grossos demais
            // para a altura da linha.
            boxShadow: isActive ? "inset 2px 0 0 #f97316" : undefined,
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
            aria-hidden="true"
            style={{
              // 17 e um tom mais claro: o ícone é decorativo (o rótulo ao lado
              // já nomeia o destino) e estava no mesmo peso visual do texto.
              // `#a8a29e` é a exceção que o próprio theme.ts documenta —
              // proibido como texto, permitido em ícone.
              width: 17, height: 17, flexShrink: 0,
              color: isActive ? "#c2410c" : "#a8a29e",
              filter: isActive ? "drop-shadow(0 0 3px rgba(249,115,22,0.25))" : "none",
              transition: "filter 0.12s ease, color 0.12s ease",
            }}
          />
          {/* `title` + reticência: "Vincular Patrocinadores" é o rótulo mais
              longo do menu e era o único que podia encostar na borda. */}
          <span title={item.title} style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {item.title}
          </span>
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
    <SidebarGroup style={{ padding: first ? "8px 0 4px" : "12px 0 4px" }}>
      {/* RÉGUA no lugar de vão.

          A separação entre grupos era 20px de ar em cima de cada um. Com
          quatro grupos e 18 itens isso é ~80px gastos em espaço vazio numa
          coluna que precisa caber inteira sem rolar. Um hairline separa com
          1px o que o vão separava com 20 — e a régua diz "grupo novo" de
          forma mais explícita que a distância. */}
      {!first && <div aria-hidden="true" style={{ height: 1, backgroundColor: "#f1efec", margin: "14px 18px 0" }} />}
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
  const isMobileCasca = useIsMobile();

  // 19 itens nao cabem numa tela de 768: a lista rola, e a barra fica sempre
  // com a mesma largura para nada se mover quando o ponteiro entra — o que
  // muda no hover e a COR do polegar (.sidebar-scroll no index.css).

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
      {/* O cabeçalho da marca fecha com hairline em vez de flutuar sobre a
          lista, e devolve ~14px de altura útil para os 18 itens. */}
      <SidebarHeader style={{ padding: "22px 18px 18px", borderBottom: "1px solid #f1efec" }}>
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
      {/* O hover da barra de rolagem saiu do React e foi para o CSS: era
          estado que redesenhava a sidebar inteira a cada entrada e saída do
          ponteiro, para trocar uma classe. `:hover` faz o mesmo sem render. */}
      <SidebarContent
        className="sidebar-scroll"
        style={{
          padding: "0 0 8px",
          display: "flex",
          flexDirection: "column",
          gap: 0,
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
              // Sair é ação de saída e ganha CONTORNO: era um botão fantasma de
              // 44 sem borda nenhuma ao lado do nome do usuário, indistinguível
              // de um ícone decorativo até o hover.
              background: "#ffffff", border: "1px solid #e7e5e4",
              cursor: logoutMutation.isPending ? "default" : "pointer",
              width: isMobileCasca ? 44 : 36, height: isMobileCasca ? 44 : 36,
              padding: 0, borderRadius: 9, color: "#746e69",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "color 0.15s ease, background-color 0.15s ease, opacity 0.15s ease",
              flexShrink: 0,
              // Antes o clique não dava retorno nenhum até o redirect chegar.
              opacity: logoutMutation.isPending ? 0.5 : 1,
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = "#b91c1c";
              (e.currentTarget as HTMLButtonElement).style.borderColor = "#fca5a5";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = "#746e69";
              (e.currentTarget as HTMLButtonElement).style.borderColor = "#e7e5e4";
            }}
            onFocus={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = "#b91c1c";
              (e.currentTarget as HTMLButtonElement).style.borderColor = "#fca5a5";
            }}
            onBlur={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = "#746e69";
              (e.currentTarget as HTMLButtonElement).style.borderColor = "#e7e5e4";
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
