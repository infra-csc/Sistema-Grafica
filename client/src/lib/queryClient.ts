import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const raw = (await res.text()) || res.statusText;
    // Se a resposta for uma página HTML (ex: página 404 do Replit), não exibir
    // o HTML bruto — substituir por mensagem genérica legível.
    const isHtml = raw.trimStart().startsWith("<");
    const text = isHtml
      ? `Erro ${res.status} — servidor retornou resposta inesperada. Tente novamente.`
      : raw;
    throw new Error(text);
  }
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

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
      headers: {
        "x-user-name": getCurrentUserName(),
      },
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
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
