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
  const text = isHtml
    ? `Erro ${res.status} — servidor retornou resposta inesperada. Tente novamente.`
    : raw;
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

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const url = queryKey.join("/") as string;
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
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
