import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, Lock, Loader2, AlertTriangle, ChevronDown, ChevronUp, ArrowRight, Eye, EyeOff } from "lucide-react";

const SSO_ERROR_MESSAGES: Record<string, { title: string; description: string }> = {
  sso_user_not_found: {
    title: "Acesso não autorizado",
    description:
      "Seu e-mail não está cadastrado no sistema. Entre em contato com o administrador para solicitar acesso.",
  },
  sso_invalid_token: {
    title: "Token SSO inválido",
    description:
      "O link de autenticação expirou ou é inválido. Tente novamente pelo portal ou contate o administrador.",
  },
  sso_exchange_failed: {
    title: "Falha na autenticação SSO",
    description:
      "Não foi possível completar a autenticação. Tente novamente pelo portal ou contate o administrador.",
  },
};

const loginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(1, "Senha obrigatória"),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function Login() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const { toast } = useToast();
  const [showAdminForm, setShowAdminForm] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [btnHover, setBtnHover] = useState(false);

  const [ssoError] = useState(() => {
    const code = new URLSearchParams(search).get("error") ?? "";
    return SSO_ERROR_MESSAGES[code] ?? null;
  });

  useEffect(() => {
    if (ssoError) {
      window.history.replaceState({}, "", "/login");
    }
  }, []);

  const form = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const loginMutation = useMutation({
    mutationFn: async (data: LoginForm) => {
      const res = await apiRequest("POST", "/api/auth/login", data);
      return await res.json();
    },
    onSuccess: async (user) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "Login realizado com sucesso", description: `Bem-vindo, ${user.name}!` });
      setTimeout(() => setLocation("/"), 100);
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Erro ao fazer login",
        description: error.message || "Email ou senha inválidos",
      });
    },
  });

  const onSubmit = (data: LoginForm) => loginMutation.mutate(data);

  return (
    <main className="login-main" style={{
      display: "flex",
      height: "100vh",
      width: "100vw",
      overflow: "hidden",
      fontFamily: "'Plus Jakarta Sans', sans-serif",
    }}>
      {/* Responsivo: em telas pequenas empilha, esconde o branding e permite
          rolar — os estilos inline vencem media queries, por isso o !important. */}
      <style>{`
        @media (max-width: 900px) {
          .login-main { flex-direction: column !important; height: auto !important; min-height: 100vh !important; overflow: auto !important; }
          .login-brand-col { display: none !important; }
          .login-form-col { width: 100% !important; padding: 40px 24px !important; }
        }
      `}</style>

      {/* ── LEFT COLUMN: Branding (42%) ── */}
      <section className="login-brand-col" style={{
        position: "relative",
        width: "42%",
        backgroundColor: "#1c1917",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "48px",
        overflow: "hidden",
      }}>
        <div style={{
          position: "absolute", bottom: "-96px", right: "-96px",
          width: "384px", height: "384px", borderRadius: "50%",
          background: "radial-gradient(circle, rgba(249,115,22,0.20) 0%, transparent 65%)",
          filter: "blur(60px)", pointerEvents: "none",
        }} />

        <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{
            width: 48, height: 48, backgroundColor: "#f97316", borderRadius: 8,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 24, color: "white" }}>N</span>
          </div>
          <h1 style={{
            fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 20,
            letterSpacing: "-0.02em", color: "#f9f9f8", margin: 0,
          }}>NORTE Marketing Esportivo</h1>
        </div>

        <div style={{ position: "relative", zIndex: 1, maxWidth: 420 }}>
          <div style={{ width: 48, height: 4, backgroundColor: "#f97316", marginBottom: 8, borderRadius: 2 }} />
          <h2 style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: 46, fontWeight: 700, color: "white",
            lineHeight: 1.1, letterSpacing: "-0.04em", margin: "0 0 32px 0",
          }}>
            Sistema de Gestão de Produção Gráfica
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[
              { title: "Notificações em tempo real", sub: "Acompanhamento instantâneo de pedidos." },
              { title: "Rastreamento completo", sub: "Visibilidade total da cadeia de produção." },
            ].map((f) => (
              <div key={f.title} style={{
                backgroundColor: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.10)",
                borderRadius: 12, padding: "20px",
                display: "flex", alignItems: "center", gap: 16,
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: "50%",
                  backgroundColor: "rgba(249,115,22,0.20)",
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}>
                  <CheckCircle style={{ width: 16, height: 16, color: "#f97316" }} />
                </div>
                <div>
                  <p style={{ color: "white", fontWeight: 500, fontSize: 14, margin: 0 }}>{f.title}</p>
                  <p style={{ color: "rgba(255,255,255,0.40)", fontSize: 12, margin: "2px 0 0 0" }}>{f.sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <footer style={{ position: "relative", zIndex: 1 }}>
          <p style={{ color: "rgba(255,255,255,0.30)", fontSize: 11, margin: 0 }}>
            © 2024 NORTE Marketing Esportivo. All rights reserved.
          </p>
        </footer>
      </section>

      {/* ── RIGHT COLUMN (58%) ── */}
      <section className="login-form-col" style={{
        width: "58%", backgroundColor: "#fafaf9",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        position: "relative", padding: "0 32px",
      }}>
        <div style={{ width: "100%", maxWidth: 448 }}>

          {/* Header */}
          <header style={{ marginBottom: 40 }}>
            <div style={{ width: 32, height: 4, backgroundColor: "#f97316", marginBottom: 16, borderRadius: 2 }} />
            <h3 style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: 36, fontWeight: 700, color: "#1c1917",
              letterSpacing: "-0.04em", margin: "0 0 8px 0",
            }}>Bem-vindo de volta</h3>
            <p style={{ color: "#746e69", fontWeight: 500, fontSize: 14, margin: 0 }}>
              Acesse o sistema pelo portal NORTE.
            </p>
          </header>

          {/* SSO error banner */}
          {ssoError && (
            <div
              data-testid="banner-sso-error"
              style={{
                display: "flex", alignItems: "flex-start", gap: 12,
                backgroundColor: "#fef2f2", border: "1.5px solid #fecaca",
                borderRadius: 8, padding: "14px 16px", marginBottom: 24,
              }}
            >
              <AlertTriangle style={{ width: 18, height: 18, color: "#dc2626", flexShrink: 0, marginTop: 1 }} />
              <div>
                <p style={{ margin: 0, fontWeight: 700, fontSize: 13, color: "#991b1b" }}>{ssoError.title}</p>
                <p style={{ margin: "4px 0 0 0", fontSize: 12, color: "#b91c1c", lineHeight: 1.5 }}>{ssoError.description}</p>
              </div>
            </div>
          )}

          {/* Primary SSO info card */}
          <div style={{
            backgroundColor: "#fff",
            border: "1.5px solid #e7e5e4",
            borderRadius: 12,
            padding: "28px 24px",
            display: "flex", alignItems: "flex-start", gap: 18,
            marginBottom: 24,
          }}>
            {/* Microsoft logo */}
            <div style={{ flexShrink: 0, marginTop: 2 }}>
              <svg width="28" height="28" viewBox="0 0 21 21" xmlns="http://www.w3.org/2000/svg">
                <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
                <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
                <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
                <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
              </svg>
            </div>
            <div>
              <p style={{ margin: "0 0 4px 0", fontWeight: 700, fontSize: 15, color: "#1c1917" }}>
                Login via Microsoft
              </p>
              <p style={{ margin: 0, fontSize: 13, color: "#746e69", lineHeight: 1.5 }}>
                O acesso ao sistema é feito exclusivamente pelo portal NORTE. Use sua conta Microsoft corporativa para entrar.
              </p>
            </div>
          </div>

          {/* Admin fallback toggle */}
          <button
            type="button"
            data-testid="button-toggle-admin-login"
            onClick={() => setShowAdminForm((v) => !v)}
            style={{
              width: "100%",
              background: "none", border: "none",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "10px 0",
              cursor: "pointer",
              color: "#746e69",
              fontSize: 12, fontWeight: 600,
              textTransform: "uppercase", letterSpacing: "0.08em",
              fontFamily: "inherit",
            }}
          >
            <span>Acesso de administrador</span>
            {showAdminForm
              ? <ChevronUp style={{ width: 15, height: 15 }} />
              : <ChevronDown style={{ width: 15, height: 15 }} />
            }
          </button>

          {/* Admin email/password form */}
          {showAdminForm && (
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              style={{
                display: "flex", flexDirection: "column", gap: 20,
                marginTop: 4,
                padding: "20px",
                backgroundColor: "#f5f5f4",
                borderRadius: 10,
                border: "1px solid #e7e5e4",
              }}
            >
              <p style={{ margin: 0, fontSize: 12, color: "#746e69" }}>
                Acesso de emergência para administradores do sistema.
              </p>

              {/* Email */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label htmlFor="email" style={{
                  fontSize: 10, fontWeight: 700,
                  textTransform: "uppercase", letterSpacing: "0.1em",
                  color: "rgba(88,66,55,0.70)",
                }}>Endereço de E-mail</label>
                <input
                  id="email"
                  type="email"
                  placeholder="nome@norte.com.br"
                  {...form.register("email")}
                  data-testid="input-email"
                  style={{
                    width: "100%", height: 48,
                    backgroundColor: "#fff",
                    border: "1.5px solid #e7e5e4",
                    borderRadius: 8, padding: "0 14px",
                    fontSize: 14, fontWeight: 500, color: "#1c1917",
                    boxSizing: "border-box", fontFamily: "inherit", outline: "none",
                    transition: "border-color 0.2s, box-shadow 0.2s",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "#f97316";
                    e.currentTarget.style.boxShadow = "0 0 0 3px rgba(249,115,22,0.12)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "#e7e5e4";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                />
                {form.formState.errors.email && (
                  <p style={{ color: "#dc2626", fontSize: 12, margin: 0 }}>{form.formState.errors.email.message}</p>
                )}
              </div>

              {/* Password */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label htmlFor="password" style={{
                  fontSize: 10, fontWeight: 700,
                  textTransform: "uppercase", letterSpacing: "0.1em",
                  color: "rgba(88,66,55,0.70)",
                }}>Senha de Acesso</label>
                <div style={{ position: "relative" }}>
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••••••"
                    {...form.register("password")}
                    data-testid="input-password"
                    style={{
                      width: "100%", height: 48,
                      backgroundColor: "#fff",
                      border: "1.5px solid #e7e5e4",
                      borderRadius: 8, padding: "0 44px 0 14px",
                      fontSize: 14, fontWeight: 500, color: "#1c1917",
                      boxSizing: "border-box", fontFamily: "inherit", outline: "none",
                      transition: "border-color 0.2s, box-shadow 0.2s",
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = "#f97316";
                      e.currentTarget.style.boxShadow = "0 0 0 3px rgba(249,115,22,0.12)";
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = "#e7e5e4";
                      e.currentTarget.style.boxShadow = "none";
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    title={showPassword ? "Ocultar senha" : "Mostrar senha"}
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                    style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#746e69", padding: 6, display: "flex", alignItems: "center" }}
                  >
                    {showPassword ? <EyeOff style={{ width: 18, height: 18 }} /> : <Eye style={{ width: 18, height: 18 }} />}
                  </button>
                </div>
                {form.formState.errors.password && (
                  <p style={{ color: "#dc2626", fontSize: 12, margin: 0 }}>{form.formState.errors.password.message}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={loginMutation.isPending}
                data-testid="button-login"
                style={{
                  width: "100%", height: 48,
                  backgroundColor: btnHover && !loginMutation.isPending ? "#f97316" : "#1c1917",
                  color: "white", border: "none", borderRadius: 8,
                  fontSize: 14, fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700,
                  cursor: loginMutation.isPending ? "not-allowed" : "pointer",
                  opacity: loginMutation.isPending ? 0.8 : 1,
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  transition: "background-color 0.25s",
                }}
                onMouseEnter={() => setBtnHover(true)}
                onMouseLeave={() => setBtnHover(false)}
              >
                {loginMutation.isPending ? (
                  <>
                    <Loader2 style={{ width: 16, height: 16, animation: "spin 0.8s linear infinite" }} />
                    Entrando...
                  </>
                ) : (
                  <>
                    <span>Entrar no Sistema</span>
                    <ArrowRight style={{ width: 16, height: 16 }} />
                  </>
                )}
              </button>
            </form>
          )}
        </div>

        {/* Security seal */}
        <footer style={{
          position: "absolute", bottom: 48, right: 48,
          display: "flex", alignItems: "center", gap: 6, opacity: 0.40,
        }}>
          <Lock style={{ width: 13, height: 13, color: "#1c1917" }} />
          <span style={{
            fontSize: 10, fontWeight: 700,
            textTransform: "uppercase", letterSpacing: "0.1em", color: "#1c1917",
          }}>Conexão Segura SSL 256-bit</span>
        </footer>
      </section>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (max-width: 900px) {
          .login-root { flex-direction: column; height: auto; min-height: 100vh; overflow: auto; }
          .login-branding { display: none !important; }
          .login-form-col { width: 100% !important; padding: 40px 20px !important; }
        }
      `}</style>
    </main>
  );
}
