/**
 * PRÉ-CARGA DO CHUNK DA ROTA (perf-7, 17/09).
 *
 * As páginas são React.lazy (App.tsx): o clique no menu disparava o download
 * do chunk e, enquanto ele descia, a silhueta de carregamento piscava no lugar
 * da tela — em Wi-Fi de galpão, meio segundo de "esqueleto" a cada troca.
 *
 * Quem passa o ponteiro (ou o foco do teclado, ou o dedo) num item do menu
 * está a ~100-300 ms de clicar. Começar o import() nesse instante faz o chunk
 * já estar no cache do módulo quando o lazy() pedir o mesmo arquivo — o
 * navegador deduplica o import pela URL, então não há download em dobro.
 *
 * Só CÓDIGO: nenhum dado é buscado aqui (as queries continuam nascendo na
 * página, com as permissões e chaves de sempre). Falha de rede é silenciosa —
 * o clique de verdade passa pelo lazyPage, que sabe tratar chunk perdido.
 *
 * Os caminhos espelham os lazyPage do App.tsx. Rota fora do mapa simplesmente
 * não pré-carrega (nada quebra).
 */
const IMPORTADORES: Record<string, () => Promise<unknown>> = {
  "/": () => import("@/pages/painel-geral"),
  "/eventos": () => import("@/pages/eventos"),
  "/prazos": () => import("@/pages/gestao-prazos"),
  "/calendario": () => import("@/pages/calendario"),
  "/vincular-patrocinadores": () => import("@/pages/vincular-patrocinadores"),
  "/arte": () => import("@/pages/arte"),
  "/atendimento": () => import("@/pages/atendimento"),
  "/solicitacao": () => import("@/pages/solicitacao"),
  "/grafica": () => import("@/pages/grafica"),
  "/grafica/maquinas": () => import("@/pages/grafica-maquinas"),
  "/pedidos-de-peca": () => import("@/pages/pedidos-de-peca"),
  "/modelos": () => import("@/pages/modelos"),
  "/historico": () => import("@/pages/historico"),
  "/versoes": () => import("@/pages/versoes"),
  "/registros": () => import("@/pages/registros"),
  "/analises": () => import("@/pages/dashboard-analises"),
  "/patrocinadores": () => import("@/pages/patrocinadores"),
  "/configurar-cotas": () => import("@/pages/configurar-cotas"),
  "/triagem-retorno": () => import("@/pages/triagem-retorno"),
  "/estoque": () => import("@/pages/estoque"),
  "/usuarios": () => import("@/pages/usuarios"),
  "/reparo-motivos": () => import("@/pages/reparo-motivos"),
  "/notificacoes": () => import("@/pages/notificacoes"),
  "/logs-sistema": () => import("@/pages/logs-sistema"),
};

// Uma tentativa por rota na sessão: passar o mouse dez vezes no mesmo item
// não pode virar dez chamadas (nem dez rejeições registradas no console).
const jaPedidas = new Set<string>();

/** Começa a baixar o chunk da rota, se ainda não começou. Nunca lança. */
export function prefetchRota(url: string): void {
  const importar = IMPORTADORES[url];
  if (!importar || jaPedidas.has(url)) return;
  // Economia de dados ligada (ou 2G): quem pediu para gastar menos rede não
  // paga por uma tela que talvez nem abra.
  const conexao = (typeof navigator !== "undefined" ? (navigator as any).connection : null) as
    | { saveData?: boolean; effectiveType?: string }
    | null;
  if (conexao?.saveData || /(^|-)2g$/.test(conexao?.effectiveType ?? "")) return;
  jaPedidas.add(url);
  importar().catch(() => {
    // Libera nova tentativa: pode ter sido um soluço de rede.
    jaPedidas.delete(url);
  });
}
