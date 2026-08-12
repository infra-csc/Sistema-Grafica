import { createContext, useContext, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";

export type UserRole = "admin" | "solicitacao" | "arte" | "grafica" | "atendimento";

interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  mustChangePassword: boolean;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  hasPermission: (requiredRole: UserRole | UserRole[]) => boolean;
  refetchUser: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // If ?sso_exchange= is in the URL, block /api/auth/me until exchange completes
  const [ssoReady, setSsoReady] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return !new URLSearchParams(window.location.search).has("sso_exchange");
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const exchangeToken = params.get("sso_exchange");
    if (!exchangeToken) return;

    // Remove token from URL immediately (clean up before async work)
    window.history.replaceState({}, "", window.location.pathname);

    fetch("/api/auth/sso-exchange", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ exchangeToken }),
      credentials: "include",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((user: User | null) => {
        if (user?.id) {
          // Hydrate auth cache directly — avoids a second /api/auth/me round-trip
          // and sidesteps any cookie timing issues on the first load
          queryClient.setQueryData(["/api/auth/me"], user);
        }
      })
      .finally(() => setSsoReady(true));
  }, []);

  const { data: user, isLoading, refetch } = useQuery<User>({
    queryKey: ["/api/auth/me"],
    retry: false,
    refetchOnWindowFocus: false,
    enabled: ssoReady, // don't fetch until SSO exchange is done
  });

  // Keep localStorage("currentUser") in sync with the authenticated user so
  // that apiRequest()/getCurrentUserName() (client/src/lib/queryClient.ts)
  // can attach the correct x-user-name header on every request. Cleared
  // automatically when the session ends (logout, expired cookie, etc).
  useEffect(() => {
    if (user) {
      localStorage.setItem("currentUser", JSON.stringify({ name: user.name }));
    } else {
      localStorage.removeItem("currentUser");
    }
  }, [user]);

  const hasPermission = (requiredRole: UserRole | UserRole[]) => {
    if (!user) return false;
    if (user.role === "admin") return true;
    const roles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
    return roles.includes(user.role);
  };

  return (
    <AuthContext.Provider
      value={{
        user: user || null,
        isLoading: !ssoReady || isLoading,
        isAuthenticated: !!user,
        hasPermission,
        refetchUser: () => refetch(),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
