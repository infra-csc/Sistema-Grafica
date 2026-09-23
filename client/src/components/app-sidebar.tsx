import {
  Calendar, CalendarRange, Palette, Printer, Layers, LayoutDashboard,
  Activity, BarChart3, Users, Building2, UserCheck, ClipboardCheck,
  Link2, LogOut, ScrollText, Archive, ScanSearch, Compass, Settings2, Camera, Wand2,
  Timer, GitBranch, Bell, Inbox, Cog, PackageSearch,
} from "lucide-react";
import { useEffect, useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { roleLabel, userInitials } from "@/lib/utils";
import { useAuth, type UserRole } from "@/contexts/auth-context";
import { useLogout } from "@/hooks/use-logout";
// Alvo de 44 no toque: a mesma régua das outras telas, que a casca não
// seguia — os itens do menu tinham altura de padding, não de controle.
// `useIsMobile` fica para o que é celular de fato (a sidebar vira folha);
// o alvo de 44 vem do ponteiro grosso, que vale também no tablet do galpão.
import { useIsMobile, usePonteiroGrosso, alvo } from "@/hooks/use-mobile";
import { Botao } from "@/components/ui/botao";
import { prefetchRota } from "@/lib/prefetch-de-rota";
import { T, FS, R, N, H, FW, FONT, TOM } from "@/lib/theme";
import { SOLICITACAO_AO_ESTOQUE_ATIVA } from "@shared/consultas-de-estoque";
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
  useSidebar,
} from "@/components/ui/sidebar";

type MenuItem = {
  title: string;
  url: string;
  icon: React.ElementType;
  roles?: UserRole[];
  /** Some para o usuário do Kit (15/09: Modelos não é do Kit). */
  semKit?: boolean;
  /**
   * data-testid fixo quando o rótulo muda. O id nasce do título; renomear um
   * item quebraria em silêncio quem já seleciona por ele.
   */
  testId?: string;
};

// roles: undefined = todos os perfis autenticados
//
// TRÊS GRUPOS NO LUGAR DE UM "PRODUÇÃO" COM 15 ITENS (16/09). A lista única
// misturava as filas de trabalho com as telas de consulta, e as filas vinham
// fora da ordem do fluxo (Arte antes de Vincular). Agora o menu ENSINA o
// caminho da peça: "Fluxo da peça" está na ordem em que ela anda — vincular →
// arte → aprovação → revisão final → gráfica. Nenhum item sumiu nem mudou de
// permissão; só de lugar.
const inicioItems: MenuItem[] = [
  { title: "Painel Geral",            url: "/",                        icon: LayoutDashboard },
  { title: "Eventos",                 url: "/eventos",                 icon: CalendarRange },
  // Sem `roles`: a tela passa a aparecer para TODOS (decisão do dono, 17/08).
  // Quem não é admin vê e não mexe — o registro de cobrança se desabilita
  // sozinho (ver CobradoControl), e o POST /api/prazos/cobrancas segue admin.
  { title: "Gestão de Prazos",        url: "/prazos",                  icon: Timer },
  { title: "Calendário",              url: "/calendario",              icon: Calendar },
];

// A caixa da Gráfica (dono, 21/09): a Revisão Final pede peças ao estoque
// pelo modal Reaproveitamento; a Gráfica atende (tudo ou parte) ou diz que
// não consegue. A Solicitação entra para acompanhar as dela. SEGURADA pelo
// dono no mesmo dia: só entra no menu com SOLICITACAO_AO_ESTOQUE_ATIVA.
const ITEM_SOLICITACOES_AO_ESTOQUE: MenuItem = {
  title: "Solicitações ao estoque", url: "/grafica/solicitacoes-ao-estoque", icon: PackageSearch, roles: ["grafica", "solicitacao", "admin"],
};

const fluxoItems: MenuItem[] = [
  { title: "Vincular Patrocinadores", url: "/vincular-patrocinadores", icon: Link2,          roles: ["arte", "solicitacao", "atendimento", "admin"] },
  { title: "Arte",                    url: "/arte",                    icon: Palette,        roles: ["arte", "atendimento", "admin"] },
  { title: "Atendimento",             url: "/atendimento",             icon: UserCheck,      roles: ["atendimento", "arte", "admin"] },
  // "Revisão Final" e não só "Revisão" (16/09): o status que traz a peça para
  // cá chama-se "Aguardando Revisão Final", e quem lia o selo não achava no
  // menu uma tela com esse nome. A rota continua /solicitacao; o testId fica.
  { title: "Revisão Final",           url: "/solicitacao",             icon: ClipboardCheck, roles: ["solicitacao", "admin"], testId: "nav-revisão" },
  { title: "Gráfica",                 url: "/grafica",                 icon: Printer,        roles: ["grafica", "solicitacao", "admin"] },
  // A aba de impressoras (dono, 14/09): o que cada uma imprime agora e o
  // diário do dia. Mesmos papéis da Gráfica (ROLES_GRAFICA no App).
  { title: "Máquinas da Gráfica",     url: "/grafica/maquinas",        icon: Cog,            roles: ["grafica", "solicitacao", "admin"] },
  // A caixa da Gráfica (dono, 21/09): só com a chave ligada — ver
  // ITEM_SOLICITACOES_AO_ESTOQUE abaixo.
  ...(SOLICITACAO_AO_ESTOQUE_ATIVA ? [ITEM_SOLICITACOES_AO_ESTOQUE] : []),
  // O lugar único dos pedidos de peça (dono, 14/09): o Atendimento pede, a
  // Solicitação resolve — aqui e pelos eventos.
  { title: "Solicitação de peças",    url: "/pedidos-de-peca",         icon: Inbox,          roles: ["atendimento", "solicitacao", "admin"] },
  { title: "Modelos",                 url: "/modelos",                 icon: Layers,         roles: ["solicitacao", "admin"], semKit: true },
];

const consultaItems: MenuItem[] = [
  { title: "Histórico",               url: "/historico",               icon: Activity },
  // Qual versão cada patrocinador aprovou, e os books baixáveis — pedido do
  // dono (21/08). Sem `roles`: quem aprova, quem desenha e quem revisa leem.
  { title: "Versões aprovadas",       url: "/versoes",                 icon: GitBranch },
  // Registros fica aqui (e não dentro da Gráfica) porque a maioria dos perfis
  // não acessa a Gráfica e este acervo interessa a todos.
  { title: "Registros",               url: "/registros",               icon: Camera },
  { title: "Análises",                url: "/analises",                icon: BarChart3,      roles: ["admin"] },
];

// Patrocinadores: visível p/ solicitação, atendimento e admin
const sponsorItems: MenuItem[] = [
  { title: "Patrocinadores",   url: "/patrocinadores",   icon: Building2,  roles: ["solicitacao", "atendimento", "admin"] },
  // Só admin (decisão do dono, 17/08). Antes o Atendimento também via.
  { title: "Configurar Cotas", url: "/configurar-cotas", icon: Settings2,  roles: ["admin"] },
];

// Estoque (dono, 14/09): a Gráfica faz a triagem e guarda as peças; a
// Solicitação consulta o Estoque para reservar ao montar a lista.
const stockItems: MenuItem[] = [
  { title: "Triagem de Retorno", url: "/triagem-retorno", icon: ScanSearch, roles: ["admin"] },
  // 15/09: Estoque é só do admin.
  { title: "Estoque",            url: "/estoque",          icon: Archive,    roles: ["admin"] },
];

// Administração: apenas admin (filtrado via hasPermission no componente)
const adminItems: MenuItem[] = [
  { title: "Usuários",        url: "/usuarios",     icon: Users },
  { title: "Correção de textos", url: "/reparo-motivos", icon: Wand2 },
  { title: "Notificações",    url: "/notificacoes", icon: Bell },
  { title: "Reparar vínculos", url: "/reparo-vinculos-evento", icon: Link2 },
  { title: "Inferir executivos", url: "/inferir-executivos", icon: UserCheck },
  { title: "Logs do Sistema", url: "/logs-sistema", icon: ScrollText },
];

/**
 * PARA QUE SERVE CADA TELA, em uma frase — por url.
 *
 * Quem chega não distingue "Revisão Final", "Solicitação de peças" e
 * "Atendimento" só pelo nome; eram exatamente os três que mais confundiam. A
 * frase vai no `title` (ponteiro) e no `aria-description` (leitor de tela).
 * Texto de ajuda, não permissão. Mapa à parte, e não um campo do item, para
 * as linhas do menu continuarem uma por item — é por elas que os testes de
 * permissão conferem o `roles` de cada tela.
 */
/** Todas as urls do menu — para o destaque escolher o item mais específico. */
const URLS_DO_MENU: string[] = [...inicioItems, ...fluxoItems, ...consultaItems, ...sponsorItems, ...stockItems, ...adminItems].map((i) => i.url);

const DESCRICAO_DA_TELA: Record<string, string> = {
  "/": "Todas as peças de todos os eventos, com a etapa de cada uma",
  "/eventos": "Lista de eventos; dentro de cada um se monta e envia a lista de peças",
  "/prazos": "O que está atrasado ou perto do prazo, por etapa e por evento",
  "/calendario": "Os eventos no calendário",
  "/vincular-patrocinadores": "1º passo: dizer quais marcas aparecem em cada peça e enviar para a Arte",
  "/arte": "2º passo: criar o layout, mandar para aprovação e subir o arquivo final",
  "/atendimento": "3º passo: registrar a aprovação ou a reprovação de cada patrocinador",
  "/solicitacao": "4º passo: conferir o arquivo final e liberar para produção (ou devolver à Arte)",
  "/grafica": "5º passo: produzir, conferir e entregar as peças liberadas",
  "/grafica/maquinas": "O que cada impressora está imprimindo agora e o que saiu de cada uma no dia",
  "/grafica/solicitacoes-ao-estoque": "A Revisão Final pede peças ao estoque para reaproveitar; a Gráfica atende, atende em parte ou diz que não consegue",
  "/pedidos-de-peca": "Peças que faltam na lista de um evento: o Atendimento pede, a Solicitação cria",
  "/modelos": "Catálogo de peças reutilizáveis para montar a lista de um evento",
  "/historico": "Tudo o que foi feito no sistema, por quem e quando",
  "/versoes": "Qual versão da arte cada patrocinador aprovou, e os books",
  "/registros": "Fotos de conferência e de entrega de todas as peças",
  "/analises": "Indicadores do fluxo: tempos, volume e carga que vai vencer",
  "/patrocinadores": "Cadastro, executivo responsável e regra de aprovação de cada patrocinador",
  "/configurar-cotas": "Quais grupos de peças cada cota de patrocinador recebe",
  "/triagem-retorno": "Peças que voltaram de evento: avaliar a condição e decidir o destino",
  "/estoque": "Peças guardadas que podem ser reaproveitadas",
  "/usuarios": "Quem acessa o sistema e com qual perfil",
  "/reparo-motivos": "Corrigir mensagens gravadas com letras trocadas por espaços",
  "/notificacoes": "O que o sistema manda por e-mail, para quem, e o que saiu",
  "/logs-sistema": "Rastreamento técnico das operações do sistema",
};

// ─── Section label ────────────────────────────────────────
const sectionLabelStyle: React.CSSProperties = {
  fontFamily: FONT.display,
  fontSize: FS.micro,
  // 800 e 0.12em: o rótulo de seção divide a coluna com 18 itens em 500/600.
  // Em 700/0.1em ele era só mais uma linha de texto pequena entre as outras.
  fontWeight: FW.rotulo,
  textTransform: "uppercase",
  letterSpacing: "0.12em",
  color: T.second,
  // 18 para alinhar com o padding do item (10) + o respiro do <li>.
  padding: "0 18px",
  marginBottom: 4,
  marginTop: 0,
  display: "block",
};

// ─── Single nav item ─────────────────────────────────────
/** O que o número ao lado do item está contando — lido em voz alta e no hover. */
const rotuloDoNumero = (url: string, n: number): string =>
  url === "/grafica/solicitacoes-ao-estoque"
    ? `${n} ${n === 1 ? "solicitação ao estoque esperando" : "solicitações ao estoque esperando"} resposta`
    : `${n} ${n === 1 ? "solicitação esperando" : "solicitações esperando"} ação`;

function NavItem({ item, isActive, badge, grosso }: { item: MenuItem; isActive: boolean; badge?: number; grosso: boolean }) {
  const Icon = item.icon;
  // `grosso` chega do AppSidebar (perf-7): eram 23 useIsMobile, um por item
  // — 23 listeners de matchMedia e 23 re-renders extras a cada montagem da
  // casca, para responder a mesma pergunta. Continua UM hook só, lá em cima.

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
        data-testid={item.testId ?? `nav-${item.title.toLowerCase().replace(/\s+/g, "-")}`}
      >
        <Link
          href={item.url}
          aria-current={isActive ? "page" : undefined}
          aria-description={DESCRICAO_DA_TELA[item.url]}
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
            height: alvo(H.md, grosso),
            flexShrink: 0,
            padding: "0 10px",
            borderRadius: 9,
            fontSize: FS.body,
            fontFamily: FONT.display,
            fontWeight: isActive ? FW.forte : FW.corpo,
            // #f97316 sobre #fff7ed ficava ~2.5:1 — o texto ativo era o menos
            // legível do menu. #9a3412 mantém a família laranja com contraste AA;
            // a barrinha inset devolve a marcação de "ativo" para quem não
            // distingue a cor.
            color: isActive ? T.accentText : highlighted ? T.strong : T.apoio,
            backgroundColor: isActive ? TOM.laranja.bg : highlighted ? T.bg : "transparent",
            // undefined (não "none"): "none" sobrescrevia o focus-ring que o
            // CSS global aplica via box-shadow.
            // 2px: com o item mais baixo, 3px de trilho ficavam grossos demais
            // para a altura da linha.
            boxShadow: isActive ? `inset 2px 0 0 ${T.accent}` : undefined,
            textDecoration: "none",
            transition: "background-color 0.12s ease, color 0.12s ease",
            boxSizing: "border-box",
          }}
          // Ponteiro, foco ou dedo no item = clique a caminho: o chunk da tela
          // começa a descer já (ver lib/prefetch-de-rota) e a troca de tela
          // deixa de piscar o esqueleto. Só código — nenhum dado é pedido.
          onMouseEnter={() => { setHover(true); prefetchRota(item.url); }}
          onMouseLeave={() => setHover(false)}
          onFocus={() => { setFocus(true); prefetchRota(item.url); }}
          onTouchStart={() => prefetchRota(item.url)}
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
              color: isActive ? T.accentText : T.muted,
              filter: isActive ? "drop-shadow(0 0 3px rgba(249,115,22,0.25))" : "none",
              transition: "filter 0.12s ease, color 0.12s ease",
            }}
          />
          {/* `title` + reticência: "Vincular Patrocinadores" é o rótulo mais
              longo do menu e era o único que podia encostar na borda. O title
              agora também diz PARA QUE SERVE a tela — é a primeira pergunta
              de quem nunca abriu aquele item. */}
          <span title={DESCRICAO_DA_TELA[item.url] ? `${item.title} — ${DESCRICAO_DA_TELA[item.url]}` : item.title} style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {item.title}
          </span>
          {badge !== undefined && badge > 0 && (
            <span
              data-testid={`badge-${item.url.replace(/^\//, "")}`}
              aria-label={rotuloDoNumero(item.url, badge)}
              title={rotuloDoNumero(item.url, badge)}
              style={{
                marginLeft: "auto",
                flexShrink: 0,
                minWidth: 20,
                height: 20,
                padding: "0 6px",
                borderRadius: R.pill,
                backgroundColor: T.accentText,
                color: T.surface,
                fontSize: FS.small,
                fontWeight: FW.forte,
                lineHeight: "20px",
                textAlign: "center",
                fontVariantNumeric: "tabular-nums",
                boxSizing: "border-box",
              }}
            >
              {badge > 99 ? "99+" : badge}
            </span>
          )}
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
  badges,
  first = false,
  grosso,
}: {
  // null = grupo único visível para o papel; o rótulo vira ruído e some.
  label: string | null;
  items: MenuItem[];
  isItemActive: (url: string) => boolean;
  /** Número ao lado do item, por url. */
  badges?: Record<string, number | undefined>;
  first?: boolean;
  grosso: boolean;
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
      {!first && <div aria-hidden="true" style={{ height: 1, backgroundColor: N.n3, margin: "14px 18px 0" }} />}
      {label !== null && <span id={labelId} style={sectionLabelStyle}>{label}</span>}
      <SidebarGroupContent>
        <SidebarMenu style={{ gap: 1 }} aria-labelledby={label !== null ? labelId : undefined}>
          {items.map((item) => (
            <NavItem key={item.title} item={item} isActive={isItemActive(item.url)} badge={badges?.[item.url]} grosso={grosso} />
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
  // UM hook de ponteiro para a casca inteira (ver NavItem). `|| isMobileCasca`:
  // no celular o 44 já valia, mesmo com ponteiro mal detectado.
  const grosso = usePonteiroGrosso() || isMobileCasca;

  // NO CELULAR O MENU FECHA AO ESCOLHER. A sidebar vira um Sheet por cima da
  // tela; tocar num item trocava a página POR BAIXO dele e o menu continuava
  // aberto, cobrindo justamente o destino. Eram dois toques para cada
  // navegação, e o segundo (fechar) não tinha nada a ver com a intenção.
  const { setOpenMobile } = useSidebar();
  useEffect(() => { setOpenMobile(false); }, [location, setOpenMobile]);

  // 19 itens nao cabem numa tela de 768: a lista rola, e a barra fica sempre
  // com a mesma largura para nada se mover quando o ponteiro entra — o que
  // muda no hover e a COR do polegar (.sidebar-scroll no index.css).

  const role = (user?.role || "") as UserRole;

  // Solicitações esperando a Solicitação agir (dono, 15/09). A chave começa
  // com /api/pedidos-de-peca, então o aviso do websocket já a atualiza.
  const resolvePedidos = role === "solicitacao" || role === "admin";
  const { data: pendentes } = useQuery<{ total: number }>({
    queryKey: ["/api/pedidos-de-peca/pendentes"],
    enabled: resolvePedidos,
  });
  // Solicitações ao estoque esperando a Gráfica responder (dono, 21/09). Só
  // para quem responde: para a Solicitação uma aberta não é tarefa dela.
  // Chave desligada (dono, 21/09 — segurar): nem a query roda.
  const respondeConsultas = SOLICITACAO_AO_ESTOQUE_ATIVA && (role === "grafica" || role === "admin");
  const { data: consultasAbertas } = useQuery<{ total: number }>({
    queryKey: ["/api/consultas-de-estoque/abertas"],
    enabled: respondeConsultas,
  });
  const badges = {
    "/pedidos-de-peca": resolvePedidos ? pendentes?.total : undefined,
    "/grafica/solicitacoes-ao-estoque": respondeConsultas ? consultasAbertas?.total : undefined,
  };

  const filterByRole = (items: MenuItem[]) =>
    items.filter((item) => (item.roles ? item.roles.includes(role) : true) && !(item.semKit && user?.kit));

  // Ativo também nas sub-rotas: em /eventos/:id o item "Eventos" acendia
  // apagado (match exato), e a navegação perdia o contexto de onde se está.
  // "/" continua exato para não acender em tudo.
  // Com "/grafica/maquinas" no menu, "/grafica" deixou de ser a única dona
  // das subrotas dela: o prefixo só acende o item quando nenhum OUTRO item
  // do menu casa com a rota de forma mais específica (senão os dois acendiam).
  const isItemActive = (url: string) => {
    if (url === "/") return location === "/";
    if (location === url) return true;
    if (!location.startsWith(url + "/")) return false;
    return !URLS_DO_MENU.some((outra) => outra.length > url.length && (location === outra || location.startsWith(outra + "/")));
  };

  const groups = [
    { label: "Início",               items: filterByRole(inicioItems) },
    { label: "Fluxo da peça",        items: filterByRole(fluxoItems) },
    { label: "Consulta",             items: filterByRole(consultaItems) },
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
    //
    // O hex fica LITERAL aqui: valor arbitrário de Tailwind é lido em tempo de
    // build, e uma classe montada em runtime a partir do token simplesmente
    // não existiria na folha gerada. É o mesmo #e7e5e4 de T.border.
    <Sidebar className="bg-white border-r border-[#e7e5e4]">
      {/* ── Header ── */}
      {/* O cabeçalho da marca fecha com hairline em vez de flutuar sobre a
          lista, e devolve ~14px de altura útil para os 18 itens. */}
      <SidebarHeader style={{ padding: "22px 18px 18px", borderBottom: `1px solid ${N.n3}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Compass
            style={{
              width: 20, height: 20, color: T.accent, flexShrink: 0, strokeWidth: 2.2,
              filter: "drop-shadow(0 2px 4px rgba(249,115,22,0.15))",
            }}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            <span style={{
              fontFamily: FONT.display,
              fontSize: 16,
              fontWeight: 800,
              letterSpacing: "-0.05em",
              textTransform: "uppercase",
              color: T.text,
              lineHeight: 0.9,
            }}>
              NORTE
            </span>
            <span style={{
              fontFamily: FONT.display,
              fontSize: 9,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.25em",
              color: T.second,
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
              badges={badges}
              first={i === 0}
              grosso={grosso}
            />
          ))}
        </nav>
      </SidebarContent>

      {/* ── Footer: user + logout ── */}
      <SidebarFooter
        style={{
          padding: "16px 16px",
          borderTop: `1px solid ${T.low}`,
          marginTop: "auto",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Avatar — mesma identidade do avatar da topbar */}
          <div style={{
            width: 34, height: 34, borderRadius: "50%",
            backgroundColor: T.text,
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}>
            {/* #fb923c fica cravado: é o laranja CLARO sobre o fundo escuro
                (7,8:1 sobre T.text), o mesmo do avatar da topbar. Nenhum token
                cobre esse papel — TOM.laranja.dot é o #f97316, proibido como
                texto, e T.accentText (#c2410c) some sobre o escuro. */}
            <span style={{
              fontFamily: FONT.display,
              color: "#fb923c", fontSize: FS.meta, fontWeight: FW.forte, letterSpacing: "-0.02em",
            }}>
              {userInitials(user?.name)}
            </span>
          </div>

          {/* Name + role */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Até duas linhas, e não reticência: o nome inteiro não aparecia
                em lugar nenhum (nem `title`) — "Maria Aparecida dos S…". */}
            <p style={{
              fontFamily: FONT.display,
              fontSize: FS.body, fontWeight: FW.forte,
              color: T.text, margin: 0, lineHeight: 1.3,
              overflow: "hidden", wordBreak: "break-word",
              display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
            }}>
              {user?.name ?? "Usuário"}
            </p>
            <p style={{
              fontFamily: FONT.display,
              fontSize: FS.small, color: T.second,
              margin: 0, lineHeight: 1.3, textTransform: "capitalize",
            }}>
              {roleLabel(user?.role)}
            </p>
          </div>

          {/* Logout. Sair é ação de saída e ganha CONTORNO (secundário): era um
              botão fantasma de 44 sem borda ao lado do nome, indistinguível de
              um ícone decorativo até o hover. O tom de perigo no hover/foco
              vem da classe abaixo — eram quatro handlers escrevendo no style.
              `carregando` troca o ícone por spinner e trava o segundo clique:
              antes o clique não dava retorno nenhum até o redirect chegar. */}
          <style>{`
            .sair-da-casca:hover:not(:disabled),
            .sair-da-casca:focus-visible {
              color: ${TOM.perigo.text} !important;
              border-color: ${TOM.perigo.border} !important;
            }
          `}</style>
          <Botao
            variante="secundario"
            icone={LogOut}
            carregando={logoutMutation.isPending}
            onClick={() => logoutMutation.mutate()}
            data-testid="button-logout-sidebar"
            title="Sair"
            aria-label="Sair do sistema"
            className="sair-da-casca"
            style={{
              width: alvo(H.md, grosso), height: alvo(H.md, grosso), minHeight: alvo(H.md, grosso),
              padding: 0, borderRadius: 9, color: T.second, flexShrink: 0,
            }}
          />
        </div>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
