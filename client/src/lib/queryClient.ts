import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { eventoComDatasDoKit } from "@shared/kit";
import { FORMATO_COMPACTO, ehPecasCompactas, expandirResposta } from "@shared/itens-compactos";
import { ITENS_RESUMO, expandirItensDosEventos } from "@shared/eventos-resumo";
import { CABECALHO_DA_VERSAO, observarVersao } from "@/lib/versao-do-app";

/**
 * Sessão expirada tem de levar para o login.
 *
 * `/api/auth/me` é buscado uma vez e nunca mais: o queryClient usa
 * `staleTime: Infinity` e `refetchOnWindowFocus: false`. Enquanto o usuário
 * navega, nada revalida a sessão — quando ela morre, as telas seguem
 * desenhando o cache como se estivesse tudo bem e só a primeira gravação
 * falha, com um toast de JSON cru ("Não autenticado") e nenhum caminho de
 * volta. Era exatamente o erro ao salvar patrocinador.
 */
function handleUnauthorized() {
  if (typeof window === "undefined") return;
  if (window.location.pathname === "/login") return;
  try { localStorage.removeItem("currentUser"); } catch { /* modo privado */ }
  resetItensDelta();
  queryClient.clear();
  window.location.replace("/login?sessao=expirada");
}

async function throwIfResNotOk(res: Response, url?: string) {
  if (res.ok) return;

  // A própria checagem de sessão responde 401 para quem nunca logou; ali o
  // roteamento normal já manda para o login, e redirecionar aqui trocaria
  // "faça login" por "sua sessão expirou" logo na primeira visita.
  if (res.status === 401 && url !== "/api/auth/me") {
    handleUnauthorized();
    throw new Error("Sua sessão expirou. Entre novamente para continuar.");
  }

  const raw = (await res.text()) || res.statusText;
  // Se a resposta for uma página HTML (ex: página 404 do Replit), não exibir
  // o HTML bruto — substituir por mensagem genérica legível.
  const isHtml = raw.trimStart().startsWith("<");
  if (isHtml) {
    throw new Error(`Erro ${res.status} — servidor retornou resposta inesperada. Tente novamente.`);
  }

  // Corpo JSON: as rotas respondem `{ "error": "..." }` com frases escritas
  // PARA O USUÁRIO. Jogar o corpo bruto no toast soterrava a instrução útil
  // dentro de chaves, aspas e barras invertidas — o usuário lia um blob,
  // concluía que "o sistema quebrou", e a tela inteira passava a parecer
  // inacabada num único toast. Só troca quando o parse devolve objeto com
  // `error`/`message` em texto; qualquer outra coisa segue o caminho antigo.
  let text = raw;
  if (raw.trimStart().startsWith("{")) {
    try {
      const parsed = JSON.parse(raw) as { error?: unknown; message?: unknown };
      const msg = typeof parsed.error === "string" ? parsed.error
        : typeof parsed.message === "string" ? parsed.message
        : "";
      if (msg.trim()) text = msg;
    } catch { /* corpo não era JSON válido — mantém o texto como veio */ }
  }
  throw new Error(text);
}

// Helper to get current user name from localStorage
export function getCurrentUserName(): string {
  try {
    const userStr = localStorage.getItem("currentUser");
    if (userStr) {
      const user = JSON.parse(userStr);
      return user.name || 'Sistema';
    }
  } catch (error) {
    console.error('Error getting current user:', error);
  }
  return 'Sistema';
}

/**
 * QUEDA DE REDE FALA PORTUGUÊS.
 *
 * Quando o fetch nem chega ao servidor (Wi-Fi caiu, servidor reiniciando no
 * Replit), o navegador rejeita com `TypeError: Failed to fetch` — e era essa
 * frase, em inglês, que aparecia no toast de "Erro ao salvar". O usuário não
 * sabia o que tinha acontecido. A mensagem nova diz o que houve e o que fazer
 * — sem prometer "nada foi salvo": a conexão pode cair DEPOIS de o pedido
 * chegar. Abort segue intacto: quem cancelou não quer toast nenhum.
 */
export const MENSAGEM_SEM_CONEXAO = "Não foi possível falar com o servidor. Verifique a internet e tente de novo.";

async function fetchComRede(input: string, init?: RequestInit): Promise<Response> {
  try {
    const res = await fetch(input, init);
    // Ponto ÚNICO por onde passam o fetch padrão das queries, o delta de itens
    // e o apiRequest: é aqui que a aba fica sabendo de um deploy (X-App-Versao).
    observarVersao(res.headers?.get?.(CABECALHO_DA_VERSAO));
    return res;
  } catch (erro) {
    if (erro instanceof DOMException && erro.name === "AbortError") throw erro;
    if (erro instanceof TypeError) throw new Error(MENSAGEM_SEM_CONEXAO);
    throw erro;
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const headers: Record<string, string> = {
    "x-user-name": getCurrentUserName(),
  };

  const isFormData = typeof FormData !== "undefined" && data instanceof FormData;

  // For FormData we must NOT set Content-Type ourselves — the browser needs
  // to add the multipart boundary automatically.
  if (data && !isFormData) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetchComRede(url, {
    method,
    headers,
    body: isFormData ? (data as FormData) : data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  // Rota de API respondendo HTML = a rota NÃO existe no processo Express em
  // execução e o catch-all do SPA devolveu o index com 200. Acontece quando o
  // workspace faz git pull sem reiniciar o servidor (o Vite recarrega só o
  // front). Sem esta guarda o app "dava certo" em silêncio — ex.: Marcar
  // todas as notificações sem efeito nenhum.
  if (url.startsWith("/api/") && (res.headers.get("content-type") || "").includes("text/html")) {
    throw new Error("O sistema acabou de ser atualizado — recarregue a página (F5) e tente de novo. Se continuar, avise o administrador.");
  }

  await throwIfResNotOk(res, url);
  return res;
}

// ── DELTA-SYNC de /api/items (auditoria 27/08) ───────────────────────────────
// O acervo enriquecido é a resposta mais pesada do app (MBs) e é invalidado a
// toda hora. Depois do primeiro full fetch, as buscas seguintes pedem
// `?since=` e o servidor devolve SÓ o que mudou; o merge por id reconstrói o
// array completo que as telas esperam — o formato entregue aos consumidores
// não muda em nada. `eventos`/`patrocinadores` vêm no delta para re-costurar
// os objetos EMBUTIDOS nas peças que não mudaram (evento renomeado/encerrado,
// patrocinador renomeado). Qualquer resposta que não seja delta (servidor
// antigo, `since` velho demais) reseta o estado com o array cheio.
//
// PERFORMANCE (17/09):
//  · a fila da Gráfica (/api/items/approved, 13,8 MB) usa o mesmo delta — era
//    re-baixada inteira a cada foco, a cada 5 min e a cada conferência de
//    outra pessoa;
//  · as listas de peças em volume pedem `?formato=compacto` (evento e
//    patrocinador uma vez só — shared/itens-compactos.ts) e são decodificadas
//    AQUI, antes do cache: chaves e formato que as telas recebem não mudam;
//  · o merge preserva a IDENTIDADE da peça que não mudou (ver aplicarDelta).

/** Listas com delta-sync (a chave da query é a própria URL). */
const LISTAS_COM_DELTA: ReadonlySet<string> = new Set(["/api/items", "/api/items/approved"]);
/**
 * RECORTE DA LISTA (perf, 17/09): `["/api/items", "?status=awaiting_final_review"]`
 * é a lista de peças recortada no servidor (GET /api/items?status=…), com
 * delta e formato compacto como a lista inteira, e estado de delta PRÓPRIO
 * (outra URL, outra sincronia). A chave fica DENTRO do prefixo "/api/items" de
 * propósito: toda invalidação por prefixo — WebSocket, mutações das telas —
 * continua atingindo a lista recortada, sem ninguém precisar saber que ela
 * existe. Juntar as partes com "/" (o padrão do queryFn) daria
 * "/api/items/?status=", e é por isso que a URL sai daqui.
 */
function urlDaLista(queryKey: readonly unknown[]): string {
  // Vale para QUALQUER rota, não só /api/items: a aba Máquinas usa
  // ["/api/grafica/maquinas", "?dia=…"] pelo mesmo motivo — a invalidação por
  // prefixo (WebSocket, mutations do modal de impressão) precisa alcançá-la.
  if (
    queryKey.length === 2 && typeof queryKey[0] === "string" && queryKey[0].startsWith("/api/")
    && typeof queryKey[1] === "string" && queryKey[1].startsWith("?")
  ) {
    return `${queryKey[0]}${queryKey[1]}`;
  }
  return queryKey.join("/");
}
/** A lista (sem a query) aceita delta? */
const temDelta = (url: string) => LISTAS_COM_DELTA.has(url.split("?")[0]);

/** Listas de peças enriquecidas sem delta: só o formato compacto. */
const LISTAS_COMPACTAS: ReadonlySet<string> = new Set(["/api/items/pending", "/api/items/deleted"]);

/** Assinatura (JSON) de cada evento/patrocinador da última sincronia: é por
 *  ela que o merge sabe se o objeto embutido nas peças precisa ser trocado. */
type Assinaturas = { eventos: Map<string, string>; patrocinadores: Map<string, string> };
/** `cheioEm`: quando foi a última busca CHEIA desta URL (relógio do cliente —
 *  só mede idade, nunca vira âncora do delta). */
type Sincronia = { since: string; dados: any[]; assinaturas: Assinaturas | null; cheioEm: number };
const sincronias = new Map<string, Sincronia>();
/** Logout/troca de usuário invalida o que ainda estiver a caminho. */
let geracaoDaSincronia = 0;
/**
 * Geração POR URL, avançada quando o React Query descarta a chave ("removed",
 * no fim do arquivo). A busca que já estava a caminho e termina DEPOIS da
 * remoção não pode regravar a sincronia: ela prenderia de novo os MBs da lista
 * que o descarte acabou de soltar, sem query nenhuma para usá-los.
 */
const geracaoPorUrl = new Map<string, number>();
/**
 * RESYNC PERIÓDICO (17/09). Antes do delta, polling/foco/WebSocket re-baixavam
 * a lista inteira e qualquer desvio se corrigia sozinho. Só com delta, uma
 * peça mudada sem carimbar updated_at (script, escrita em lote) ou uma
 * transação que confirma fora da sobreposição fica errada até o F5 — e a aba
 * da Gráfica fica aberta o dia todo. Passado este tempo desde a última busca
 * cheia, a próxima revalidação baixa a lista inteira de novo.
 */
const RESYNC_CHEIO_MS = 30 * 60 * 1000;
/** Uma busca por URL de cada vez (ver fetchItensComDelta). */
const buscasEmVoo = new Map<string, Promise<unknown>>();

function assinar(eventos?: any[], patrocinadores?: any[]): Assinaturas {
  const doEvento = new Map<string, string>();
  for (const e of eventos ?? []) if (e?.id) doEvento.set(e.id, JSON.stringify(e));
  const doPatrocinador = new Map<string, string>();
  for (const s of patrocinadores ?? []) if (s?.id) doPatrocinador.set(s.id, JSON.stringify(s));
  return { eventos: doEvento, patrocinadores: doPatrocinador };
}

/** O maior updated_at/created_at do lote — âncora do próximo delta, imune a
 *  relógio de cliente. */
function maiorCarimbo(dados: any[]): string | null {
  let max: string | null = null;
  for (const i of dados) {
    const c = (i?.updatedAt ?? i?.createdAt ?? null) as string | null;
    if (c && (!max || c > max)) max = c;
  }
  return max;
}

/** Mesma ordem do full fetch (ORDER BY created_at DESC). O sort é estável:
 *  empate mantém a ordem anterior. */
const maisNovaPrimeiro = (a: any, b: any) => {
  const ca = a?.createdAt ?? "";
  const cb = b?.createdAt ?? "";
  return ca === cb ? 0 : ca < cb ? 1 : -1;
};

/**
 * Junta o delta ao array anterior.
 *
 * IDENTIDADE (17/09): a versão anterior devolvia uma CÓPIA de toda peça
 * (`{...i, event, sponsors}`) a cada delta, e o React Query percorria as 5 mil
 * cópias campo a campo (replaceEqualDeep, na thread principal) só para
 * descobrir que quase nada tinha mudado. Agora a peça que não mudou volta como
 * o MESMO objeto: só é recriada a que veio no delta ou cujo evento/patrocinador
 * embutido mudou (comparado pela assinatura da sincronia anterior; sem
 * assinatura, re-costura tudo como antes). Nada mudou → devolve `anterior`.
 */
export function aplicarDelta(anterior: any[], delta: any, assinaturas?: Assinaturas | null): any[] {
  const evPorId = new Map((delta.eventos ?? []).map((e: any) => [e.id, e]));
  const spPorId = new Map((delta.patrocinadores ?? []).map((s: any) => [s.id, s]));
  const porId = new Map<string, any>(anterior.map((i) => [i.id, i]));
  let mudou = false;
  for (const id of delta.removidas ?? []) if (porId.delete(id)) mudou = true;
  const doDelta = new Set<any>();
  let entraram = 0;
  for (const item of delta.itens ?? []) {
    const antes = porId.get(item.id);
    if (!antes) entraram++;
    // A sobreposição de 60s do `since` reenvia peças que já estão iguais no
    // cache: essas ficam com o objeto de antes (poucas por delta — o custo
    // de comparar é desprezível perto de recriar a linha na tela).
    else if (JSON.stringify(antes) === JSON.stringify(item)) continue;
    porId.set(item.id, item);
    doDelta.add(item);
  }
  const memoEvento = new Map<string, boolean>();
  const eventoMudou = (id: string): boolean => {
    let r = memoEvento.get(id);
    if (r === undefined) {
      r = !assinaturas || assinaturas.eventos.get(id) !== JSON.stringify(evPorId.get(id));
      memoEvento.set(id, r);
    }
    return r;
  };
  const memoPatrocinador = new Map<string, boolean>();
  const patrocinadorMudou = (id: string): boolean => {
    let r = memoPatrocinador.get(id);
    if (r === undefined) {
      r = !assinaturas || assinaturas.patrocinadores.get(id) !== JSON.stringify(spPorId.get(id));
      memoPatrocinador.set(id, r);
    }
    return r;
  };

  const resultado = Array.from(porId.values()).map((i) => {
    const veioNoDelta = doDelta.has(i);
    const trocaEvento = veioNoDelta || (evPorId.has(i.eventId) && eventoMudou(i.eventId));
    const trocaPatrocinadores = Array.isArray(i.sponsors)
      && (veioNoDelta || i.sponsors.some((s: any) => spPorId.has(s?.id) && patrocinadorMudou(s.id)));
    if (!trocaEvento && !trocaPatrocinadores) return i;
    mudou = true;
    return {
      ...i,
      // Peça do Kit (15/09): o evento re-costurado precisa manter as datas da
      // remessa — sem isto a Arte voltava a cobrar a peça do Kit pela Arena.
      event: !trocaEvento ? i.event : i.kitRemessaId && i.kitRemessa
        ? eventoComDatasDoKit((evPorId.get(i.eventId) as any) ?? i.event, i.kitRemessa)
        : evPorId.get(i.eventId) ?? i.event,
      sponsors: trocaPatrocinadores
        ? i.sponsors.map((s: any) => {
            const atual = spPorId.get(s.id);
            return atual ? { ...atual, approvalStatus: s.approvalStatus ?? null } : s;
          })
        : i.sponsors,
    };
  });
  if (!mudou) return anterior;
  // Peça NOVA vai para onde o full fetch a poria (antes ficava no fim da
  // lista até o próximo F5).
  if (entraram > 0) resultado.sort(maisNovaPrimeiro);
  return resultado;
}

/**
 * Uma busca por URL de cada vez. Invalidar uma chave que já está buscando faz
 * o React Query largar a busca em voo e começar outra — na primeira carga do
 * acervo eram DOIS downloads de 15 MB em paralelo (o primeiro segue até o
 * fim, só é ignorado) e o servidor montava os dois. A segunda agora espera a
 * primeira e pede só o delta desde ela: nada se perde (ela sai DEPOIS de tudo
 * o que a primeira viu) e custa KBs.
 */
function fetchItensComDelta(url: string, headers: Record<string, string>): Promise<any[]> {
  const anterior = buscasEmVoo.get(url);
  const busca = (async () => {
    if (anterior) await anterior.catch(() => undefined);
    return await buscarComDelta(url, headers);
  })();
  buscasEmVoo.set(url, busca);
  const limpar = () => { if (buscasEmVoo.get(url) === busca) buscasEmVoo.delete(url); };
  busca.then(limpar, limpar);
  return busca;
}

async function buscarComDelta(url: string, headers: Record<string, string>): Promise<any[]> {
  const geracao = geracaoDaSincronia;
  const geracaoDaUrl = geracaoPorUrl.get(url) ?? 0;
  const guardada = sincronias.get(url) ?? null;
  // Última busca cheia velha demais → cheia de novo (ver RESYNC_CHEIO_MS).
  const itensSync = guardada && Date.now() - guardada.cheioEm <= RESYNC_CHEIO_MS ? guardada : null;
  // A lista recortada já traz a própria query (`?status=…`).
  const sep = url.includes("?") ? "&" : "?";
  const destino = itensSync
    ? `${url}${sep}formato=${FORMATO_COMPACTO}&since=${encodeURIComponent(itensSync.since)}`
    : `${url}${sep}formato=${FORMATO_COMPACTO}`;
  const res = await fetchComRede(destino, { credentials: "include", headers });
  if ((res.headers.get("content-type") || "").includes("text/html")) {
    throw new Error("O sistema acabou de ser atualizado — recarregue a página (F5) e tente de novo. Se continuar, avise o administrador.");
  }
  await throwIfResNotOk(res, url);
  const bruto = await res.json();
  const compacto = ehPecasCompactas(bruto);
  const corpo = expandirResposta(bruto) as any;
  // Sessão trocada (ou a chave descartada) enquanto a resposta vinha:
  // entrega, mas não grava estado.
  const vale = geracao === geracaoDaSincronia && geracaoDaUrl === (geracaoPorUrl.get(url) ?? 0);
  if (Array.isArray(corpo)) {
    // full fetch (primeira vez, servidor antigo ou since expirado)
    if (vale) {
      sincronias.set(url, {
        since: (compacto ? (bruto.agora as string | undefined) : undefined) ?? maiorCarimbo(corpo) ?? new Date(0).toISOString(),
        dados: corpo,
        assinaturas: compacto ? assinar(bruto.eventos, bruto.patrocinadores) : null,
        cheioEm: Date.now(),
      });
    }
    return corpo;
  }
  const dados = aplicarDelta(itensSync?.dados ?? [], corpo, itensSync?.assinaturas);
  if (vale) {
    sincronias.set(url, {
      since: corpo.agora ?? itensSync?.since ?? new Date(0).toISOString(),
      dados,
      assinaturas: assinar(corpo.eventos, corpo.patrocinadores),
      cheioEm: itensSync?.cheioEm ?? Date.now(),
    });
  }
  return dados;
}

/** Logout/troca de usuário: zera o estado do delta junto com o cache. */
export function resetItensDelta(): void {
  sincronias.clear();
  geracaoDaSincronia++;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const url = urlDaLista(queryKey);
    // As chaves mais pesadas do app buscam por delta (ver bloco acima) — para
    // os consumidores nada muda: o retorno é o mesmo array completo de sempre.
    if (temDelta(url)) {
      return (await fetchItensComDelta(url, { "x-user-name": getCurrentUserName() })) as any;
    }
    const compacta = LISTAS_COMPACTAS.has(url);
    // LISTA DE EVENTOS (perf, 17/09): ~80% dos 826 KB eram as peças embutidas
    // em cada evento, e toda tela que lê ["/api/events"] só CONTA essas peças
    // por status. `?itens=resumo` manda a contagem; `expandirItensDosEventos`
    // devolve `items` como array antes do cache (ver shared/eventos-resumo.ts).
    const eventos = url === "/api/events";
    const destino = compacta ? `${url}?formato=${FORMATO_COMPACTO}`
      : eventos ? `${url}?itens=${ITENS_RESUMO}`
      : url;
    const res = await fetchComRede(destino, {
      credentials: "include",
      headers: {
        "x-user-name": getCurrentUserName(),
      },
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    // Mesma guarda do apiRequest: rota /api/* respondendo HTML = o processo
    // Express em execução não conhece a rota (git pull sem Stop/Run) e o
    // catch-all do SPA devolveu o index com 200 — sem isto o res.json()
    // abaixo estourava com SyntaxError críptico em vez de dizer o conserto.
    if (url.startsWith("/api/") && (res.headers.get("content-type") || "").includes("text/html")) {
      throw new Error("O sistema acabou de ser atualizado — recarregue a página (F5) e tente de novo. Se continuar, avise o administrador.");
    }

    await throwIfResNotOk(res, url);
    // Lista compacta volta ao formato de sempre ANTES do cache.
    if (compacta) return expandirResposta(await res.json());
    if (eventos) return expandirItensDosEventos(await res.json());
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      // AUDITORIA 27/08: o default de 5min descartava o cache de MBs cinco
      // minutos depois de sair da tela — voltar do almoço re-baixava tudo.
      // 30min segura a navegação de um turno; o WebSocket segue invalidando.
      gcTime: 30 * 60 * 1000,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});

// ── MEMÓRIA DAS LISTAS DE PEÇAS (perf, 17/09) ────────────────────────────────
// · O estado do delta (`sincronias`) segurava o array da lista PARA SEMPRE: o
//   gcTime tirava a query do cache, mas `dados` continuava referenciando as
//   5 mil peças — a memória nunca voltava. Agora, quando o React Query
//   descarta a chave, o estado do delta vai junto (a próxima visita faz o
//   full fetch compacto, como qualquer chave descartada).
// · Os 30 min continuam valendo para /api/items e /api/items/approved: a
//   primeira é lida por Painel, Arte e Atendimento (está quase sempre em uso,
//   um gcTime menor não liberaria nada) e voltar à Gráfica é revalidar por
//   delta (KBs) — com 5 min seria re-montar 13 MB no servidor, o que trava o
//   event loop para todo mundo. As listas eventuais (peças excluídas e a fila
//   pendente, sem delta) saem do cache em 5 min.
const GC_LISTAS_EVENTUAIS = 5 * 60 * 1000;
for (const chave of Array.from(LISTAS_COMPACTAS)) {
  queryClient.setQueryDefaults([chave], { gcTime: GC_LISTAS_EVENTUAIS });
}
queryClient.getQueryCache().subscribe((evento) => {
  if (evento.type !== "removed") return;
  const url = urlDaLista(evento.query.queryKey);
  if (!temDelta(url)) return;
  sincronias.delete(url);
  // Busca a caminho desta URL não regrava o estado (ver geracaoPorUrl).
  geracaoPorUrl.set(url, (geracaoPorUrl.get(url) ?? 0) + 1);
});
