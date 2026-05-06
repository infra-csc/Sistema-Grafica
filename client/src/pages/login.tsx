import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, ArrowRight, Lock, Loader2, AlertTriangle } from "lucide-react";

const SSO_ERROR_MESSAGES: Record<string, { title: string; description: string }> = {
  sso_user_not_found: {
    title: "Acesso não autorizado",
    description:
      "Seu e-mail não está cadastrado no sistema. Entre em contato com o administrador para solicitar acesso.",
  },
  sso_invalid_token: {
    title: "Token SSO inválido",
    description:
      "O link de autenticação expirou ou é inválido. Tente novamente ou solicite um novo link ao administrador.",
  },
  sso_exchange_failed: {
    title: "Falha na autenticação SSO",
    description:
      "Não foi possível completar a autenticação. Tente novamente ou entre em contato com o administrador.",
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
      toast({
        title: "Login realizado com sucesso",
        description: `Bem-vindo, ${user.name}!`,
      });
      setTimeout(() => {
        if (user.mustChangePassword) {
          setLocation("/change-password");
        } else {
          setLocation("/");
        }
      }, 100);
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
    <main style={{
      display: 'flex',
      height: '100vh',
      width: '100vw',
      overflow: 'hidden',
      fontFamily: "'Plus Jakarta Sans', sans-serif",
    }}>

      {/* ── LEFT COLUMN: Branding (42%) ── */}
      <section style={{
        position: 'relative',
        width: '42%',
        backgroundColor: '#1c1917',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '48px',
        overflow: 'hidden',
      }}>

        {/* Decorative orange glow — bottom right */}
        <div style={{
          position: 'absolute',
          bottom: '-96px',
          right: '-96px',
          width: '384px',
          height: '384px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(249,115,22,0.20) 0%, transparent 65%)',
          filter: 'blur(60px)',
          pointerEvents: 'none',
        }} />

        {/* Brand identity */}
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{
            width: 48, height: 48,
            backgroundColor: '#f97316',
            borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontWeight: 700, fontSize: 24, color: 'white',
            }}>N</span>
          </div>
          <h1 style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontWeight: 700, fontSize: 20,
            letterSpacing: '-0.02em',
            color: '#f9f9f8',
            margin: 0,
          }}>
            NORTE Marketing Esportivo
          </h1>
        </div>

        {/* Content center */}
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 420 }}>
          {/* Accent line */}
          <div style={{ width: 48, height: 4, backgroundColor: '#f97316', marginBottom: 8, borderRadius: 2 }} />

          <h2 style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: 46, fontWeight: 700,
            color: 'white',
            lineHeight: 1.1,
            letterSpacing: '-0.04em',
            margin: '0 0 32px 0',
          }}>
            Sistema de Gestão de Produção Gráfica
          </h2>

          {/* Feature cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { title: 'Notificações em tempo real', sub: 'Acompanhamento instantâneo de pedidos.' },
              { title: 'Rastreamento completo', sub: 'Visibilidade total da cadeia de produção.' },
            ].map((f) => (
              <div key={f.title} style={{
                backgroundColor: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.10)',
                borderRadius: 12,
                padding: '20px',
                display: 'flex',
                alignItems: 'center',
                gap: 16,
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: '50%',
                  backgroundColor: 'rgba(249,115,22,0.20)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <CheckCircle style={{ width: 16, height: 16, color: '#f97316' }} />
                </div>
                <div>
                  <p style={{ color: 'white', fontWeight: 500, fontSize: 14, margin: 0 }}>{f.title}</p>
                  <p style={{ color: 'rgba(255,255,255,0.40)', fontSize: 12, margin: '2px 0 0 0' }}>{f.sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer left */}
        <footer style={{ position: 'relative', zIndex: 1 }}>
          <p style={{ color: 'rgba(255,255,255,0.30)', fontSize: 11, margin: 0 }}>
            © 2024 NORTE Marketing Esportivo. All rights reserved.
          </p>
        </footer>
      </section>

      {/* ── RIGHT COLUMN: Form (58%) ── */}
      <section style={{
        width: '58%',
        backgroundColor: '#fafaf9',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        padding: '0 32px',
      }}>
        <div style={{ width: '100%', maxWidth: 448 }}>

          {/* Header */}
          <header style={{ marginBottom: 48 }}>
            <div style={{ width: 32, height: 4, backgroundColor: '#f97316', marginBottom: 16, borderRadius: 2 }} />
            <h3 style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: 36, fontWeight: 700,
              color: '#1c1917',
              letterSpacing: '-0.04em',
              margin: '0 0 8px 0',
            }}>
              Bem-vindo de volta
            </h3>
            <p style={{ color: '#78716c', fontWeight: 500, fontSize: 14, margin: 0 }}>
              Acesse sua conta para gerenciar as operações.
            </p>
          </header>

          {ssoError && (
            <div
              data-testid="banner-sso-error"
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
                backgroundColor: '#fef2f2',
                border: '1.5px solid #fecaca',
                borderRadius: 8,
                padding: '14px 16px',
                marginBottom: 24,
              }}
            >
              <AlertTriangle style={{ width: 18, height: 18, color: '#dc2626', flexShrink: 0, marginTop: 1 }} />
              <div>
                <p style={{ margin: 0, fontWeight: 700, fontSize: 13, color: '#991b1b' }}>
                  {ssoError.title}
                </p>
                <p style={{ margin: '4px 0 0 0', fontSize: 12, color: '#b91c1c', lineHeight: 1.5 }}>
                  {ssoError.description}
                </p>
              </div>
            </div>
          )}

          <form onSubmit={form.handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

            {/* Email */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label htmlFor="email" style={{
                fontSize: 10, fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: '0.1em',
                color: 'rgba(88,66,55,0.70)',
              }}>
                Endereço de E-mail
              </label>
              <input
                id="email"
                type="email"
                placeholder="nome@norte.com.br"
                {...form.register('email')}
                data-testid="input-email"
                style={{
                  width: '100%', height: 52,
                  backgroundColor: '#e8e8e7',
                  border: '1.5px solid transparent',
                  borderRadius: 8,
                  padding: '0 16px',
                  fontSize: 14, fontWeight: 500,
                  color: '#1c1917',
                  boxSizing: 'border-box',
                  fontFamily: 'inherit',
                  outline: 'none',
                  transition: 'border-color 0.2s, background-color 0.2s, box-shadow 0.2s',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.backgroundColor = '#ffffff';
                  e.currentTarget.style.borderColor = '#f97316';
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(249,115,22,0.15)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.backgroundColor = '#e8e8e7';
                  e.currentTarget.style.borderColor = 'transparent';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              />
              {form.formState.errors.email && (
                <p style={{ color: '#dc2626', fontSize: 12, margin: 0 }}>
                  {form.formState.errors.email.message}
                </p>
              )}
            </div>

            {/* Password */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label htmlFor="password" style={{
                  fontSize: 10, fontWeight: 700,
                  textTransform: 'uppercase', letterSpacing: '0.1em',
                  color: 'rgba(88,66,55,0.70)',
                }}>
                  Senha de Acesso
                </label>
                <a href="#" style={{
                  fontSize: 10, fontWeight: 700,
                  textTransform: 'uppercase', letterSpacing: '0.1em',
                  color: '#f97316',
                  textDecoration: 'none',
                }}>
                  Esqueceu a senha?
                </a>
              </div>
              <input
                id="password"
                type="password"
                placeholder="••••••••••••"
                {...form.register('password')}
                data-testid="input-password"
                style={{
                  width: '100%', height: 52,
                  backgroundColor: '#e8e8e7',
                  border: '1.5px solid transparent',
                  borderRadius: 8,
                  padding: '0 16px',
                  fontSize: 14, fontWeight: 500,
                  color: '#1c1917',
                  boxSizing: 'border-box',
                  fontFamily: 'inherit',
                  outline: 'none',
                  transition: 'border-color 0.2s, background-color 0.2s, box-shadow 0.2s',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.backgroundColor = '#ffffff';
                  e.currentTarget.style.borderColor = '#f97316';
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(249,115,22,0.15)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.backgroundColor = '#e8e8e7';
                  e.currentTarget.style.borderColor = 'transparent';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              />
              {form.formState.errors.password && (
                <p style={{ color: '#dc2626', fontSize: 12, margin: 0 }}>
                  {form.formState.errors.password.message}
                </p>
              )}
            </div>

            {/* Remember me */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                type="checkbox"
                id="remember"
                data-testid="checkbox-remember"
                style={{ width: 16, height: 16, accentColor: '#f97316', cursor: 'pointer' }}
              />
              <label htmlFor="remember" style={{ fontSize: 12, fontWeight: 500, color: '#78716c', cursor: 'pointer' }}>
                Manter conectado neste dispositivo
              </label>
            </div>

            {/* Submit button */}
            <button
              type="submit"
              disabled={loginMutation.isPending}
              data-testid="button-login"
              style={{
                width: '100%', height: 56,
                backgroundColor: btnHover && !loginMutation.isPending ? '#f97316' : '#1c1917',
                color: 'white',
                border: 'none',
                borderRadius: 8,
                fontSize: 15,
                fontFamily: "'Space Grotesk', sans-serif",
                fontWeight: 700,
                cursor: loginMutation.isPending ? 'not-allowed' : 'pointer',
                opacity: loginMutation.isPending ? 0.8 : 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                transition: 'background-color 0.25s',
              }}
              onMouseEnter={() => setBtnHover(true)}
              onMouseLeave={() => setBtnHover(false)}
            >
              {loginMutation.isPending ? (
                <>
                  <Loader2 style={{ width: 18, height: 18, animation: 'spin 0.8s linear infinite' }} />
                  Entrando...
                </>
              ) : (
                <>
                  <span>Entrar no Sistema</span>
                  <ArrowRight style={{
                    width: 18, height: 18,
                    transform: btnHover ? 'translateX(3px)' : 'translateX(0)',
                    transition: 'transform 0.2s',
                  }} />
                </>
              )}
            </button>
          </form>

        </div>

        {/* Security seal — bottom right */}
        <footer style={{
          position: 'absolute',
          bottom: 48,
          right: 48,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          opacity: 0.40,
        }}>
          <Lock style={{ width: 13, height: 13, color: '#1c1917' }} />
          <span style={{
            fontSize: 10, fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '0.1em',
            color: '#1c1917',
          }}>
            Conexão Segura SSL 256-bit
          </span>
        </footer>
      </section>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@700&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </main>
  );
}
