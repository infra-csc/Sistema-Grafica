import { QueryClient, QueryFunction } from "@tanstack/react-query";

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

  const res = await fetch(url, {
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
    throw new Error("Servidor desatualizado — reinicie o app no Replit (Stop e Run) e tente de novo.");
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
let itensSync: { since: string; dados: any[] } | null = null;

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

function aplicarDelta(anterior: any[], delta: any): any[] {
  const evPorId = new Map((delta.eventos ?? []).map((e: any) => [e.id, e]));
  const spPorId = new Map((delta.patrocinadores ?? []).map((s: any) => [s.id, s]));
  const porId = new Map<string, any>(anterior.map((i) => [i.id, i]));
  for (const id of delta.removidas ?? []) porId.delete(id);
  for (const item of delta.itens ?? []) porId.set(item.id, item);
  return Array.from(porId.values()).map((i) => ({
    ...i,
    event: evPorId.get(i.eventId) ?? i.event,
    sponsors: Array.isArray(i.sponsors)
      ? i.sponsors.map((s: any) => {
          const atual = spPorId.get(s.id);
          return atual ? { ...atual, approvalStatus: s.approvalStatus ?? null } : s;
        })
      : i.sponsors,
  }));
}

async function fetchItensComDelta(headers: Record<string, string>): Promise<any[]> {
  const url = itensSync ? `/api/items?since=${encodeURIComponent(itensSync.since)}` : "/api/items";
  const res = await fetch(url, { credentials: "include", headers });
  if ((res.headers.get("content-type") || "").includes("text/html")) {
    throw new Error("Servidor desatualizado — reinicie o app no Replit (Stop e Run) e tente de novo.");
  }
  await throwIfResNotOk(res, "/api/items");
  const corpo = await res.json();
  if (Array.isArray(corpo)) {
    // full fetch (primeira vez, servidor antigo ou since expirado)
    itensSync = { since: maiorCarimbo(corpo) ?? new Date(0).toISOString(), dados: corpo };
    return corpo;
  }
  const dados = aplicarDelta(itensSync?.dados ?? [], corpo);
  itensSync = { since: corpo.agora ?? itensSync?.since ?? new Date(0).toISOString(), dados };
  return dados;
}

/** Logout/troca de usuário: zera o estado do delta junto com o cache. */
export function resetItensDelta(): void {
  itensSync = null;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const url = queryKey.join("/") as string;
    // A chave mais pesada do app busca por delta (ver bloco acima) — para os
    // consumidores nada muda: o retorno é o mesmo array completo de sempre.
    if (url === "/api/items") {
      return (await fetchItensComDelta({ "x-user-name": getCurrentUserName() })) as any;
    }
    const res = await fetch(url, {
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
      throw new Error("Servidor desatualizado — reinicie o app no Replit (Stop e Run) e tente de novo.");
    }

    await throwIfResNotOk(res, url);
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
