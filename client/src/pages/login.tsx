import { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const loginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(1, "Senha obrigatória"),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const form = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
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

  const onSubmit = (data: LoginForm) => {
    loginMutation.mutate(data);
  };

  return (
    <div style={{
      display: 'flex',
      width: '100vw',
      height: '100vh',
      overflow: 'hidden',
      margin: 0,
      padding: 0
    }}>
      {/* LEFT COLUMN - Dark branding */}
      <div style={{
        width: '42%',
        height: '100%',
        backgroundColor: '#1c1917',
        color: 'white',
        position: 'relative',
        overflow: 'hidden',
        padding: '40px 48px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between'
      }}>
        {/* Decorative orange spot */}
        <div style={{
          position: 'absolute',
          bottom: '-80px',
          left: '-80px',
          width: '400px',
          height: '400px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(249,115,22,0.4) 0%, transparent 65%)',
          pointerEvents: 'none',
          zIndex: 0
        }} />

        {/* TOP - Logo and brand */}
        <div style={{
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <div style={{
            width: '44px',
            height: '44px',
            backgroundColor: '#f97316',
            borderRadius: '10px',
            color: 'white',
            fontSize: '20px',
            fontWeight: '800',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            N
          </div>
          <div>
            <div style={{
              color: 'white',
              fontWeight: '700',
              fontSize: '15px',
              margin: 0
            }}>NORTE</div>
            <div style={{
              color: 'rgba(255,255,255,0.5)',
              fontSize: '12px',
              margin: 0
            }}>Marketing Esportivo</div>
          </div>
        </div>

        {/* MIDDLE - Content */}
        <div style={{
          position: 'relative',
          zIndex: 1,
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center'
        }}>
          {/* Decorative line */}
          <div style={{
            width: '36px',
            height: '3px',
            backgroundColor: '#f97316',
            borderRadius: '2px',
            marginBottom: '24px'
          }} />

          {/* Title */}
          <h2 style={{
            color: 'white',
            fontSize: '30px',
            fontWeight: '800',
            letterSpacing: '-0.5px',
            lineHeight: '1.15',
            margin: '0 0 16px 0'
          }}>
            Sistema de Gestão de Produção Gráfica
          </h2>

          {/* Subtitle */}
          <p style={{
            color: 'rgba(255,255,255,0.55)',
            fontSize: '14px',
            lineHeight: '1.7',
            margin: '0 0 32px 0'
          }}>
            Controle completo do fluxo de produção: Solicitação → Arte → Gráfica → Entrega
          </p>

          {/* Feature cards */}
          <div style={{
            display: 'flex',
            gap: '10px'
          }}>
            <div style={{
              flex: 1,
              backgroundColor: 'rgba(255,255,255,0.07)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '8px',
              padding: '12px 14px'
            }}>
              <div style={{
                color: '#f97316',
                fontSize: '14px',
                fontWeight: '600'
              }}>✓</div>
              <div style={{
                color: 'white',
                fontSize: '13px',
                marginTop: '6px'
              }}>Notificações em tempo real</div>
            </div>
            <div style={{
              flex: 1,
              backgroundColor: 'rgba(255,255,255,0.07)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '8px',
              padding: '12px 14px'
            }}>
              <div style={{
                color: '#f97316',
                fontSize: '14px',
                fontWeight: '600'
              }}>✓</div>
              <div style={{
                color: 'white',
                fontSize: '13px',
                marginTop: '6px'
              }}>Rastreamento completo</div>
            </div>
          </div>
        </div>

        {/* BOTTOM - Footer */}
        <div style={{
          position: 'relative',
          zIndex: 1
        }}>
          <p style={{
            color: 'rgba(255,255,255,0.3)',
            fontSize: '11px',
            margin: 0
          }}>© 2024 NORTE Marketing Esportivo</p>
        </div>
      </div>

      {/* RIGHT COLUMN - Login form */}
      <div style={{
        width: '58%',
        height: '100%',
        backgroundColor: '#fafaf9',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px'
      }}>
        <div style={{
          width: '100%',
          maxWidth: '420px'
        }}>
          {/* Header */}
          <h1 style={{
            color: '#1c1917',
            fontSize: '28px',
            fontWeight: '800',
            letterSpacing: '-0.5px',
            margin: '0 0 6px 0',
            lineHeight: '1.2'
          }}>
            Bem-vindo de volta
          </h1>
          
          {/* Decorative line */}
          <div style={{
            width: '32px',
            height: '2px',
            backgroundColor: '#f97316',
            marginBottom: '10px'
          }} />

          {/* Subtitle */}
          <p style={{
            color: '#78716c',
            fontSize: '14px',
            margin: '0 0 32px 0',
            lineHeight: '1.5'
          }}>
            Entre com suas credenciais para acessar o sistema
          </p>

          {/* Form */}
          <form onSubmit={form.handleSubmit(onSubmit)} style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '20px'
          }}>
            {/* Email field */}
            <div>
              <label style={{
                display: 'block',
                color: '#1c1917',
                fontSize: '12px',
                fontWeight: '600',
                textTransform: 'uppercase',
                letterSpacing: '0.4px',
                marginBottom: '6px'
              }}>
                Email
              </label>
              <input
                type="email"
                placeholder="seu@email.com"
                {...form.register('email')}
                style={{
                  width: '100%',
                  height: '44px',
                  backgroundColor: 'white',
                  border: '1.5px solid #e7e5e4',
                  borderRadius: '10px',
                  padding: '0 14px',
                  fontSize: '14px',
                  color: '#1c1917',
                  boxSizing: 'border-box',
                  fontFamily: 'inherit',
                  transition: 'border-color 0.2s, box-shadow 0.2s'
                }}
                data-testid="input-email"
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = '#f97316';
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(249,115,22,0.12)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = '#e7e5e4';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              />
              {form.formState.errors.email && (
                <p style={{
                  color: '#dc2626',
                  fontSize: '12px',
                  marginTop: '4px',
                  margin: '4px 0 0 0'
                }}>
                  {form.formState.errors.email.message}
                </p>
              )}
            </div>

            {/* Password field */}
            <div>
              <label style={{
                display: 'block',
                color: '#1c1917',
                fontSize: '12px',
                fontWeight: '600',
                textTransform: 'uppercase',
                letterSpacing: '0.4px',
                marginBottom: '6px'
              }}>
                Senha
              </label>
              <input
                type="password"
                placeholder="••••••••"
                {...form.register('password')}
                style={{
                  width: '100%',
                  height: '44px',
                  backgroundColor: 'white',
                  border: '1.5px solid #e7e5e4',
                  borderRadius: '10px',
                  padding: '0 14px',
                  fontSize: '14px',
                  color: '#1c1917',
                  boxSizing: 'border-box',
                  fontFamily: 'inherit',
                  transition: 'border-color 0.2s, box-shadow 0.2s'
                }}
                data-testid="input-password"
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = '#f97316';
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(249,115,22,0.12)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = '#e7e5e4';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              />
              {form.formState.errors.password && (
                <p style={{
                  color: '#dc2626',
                  fontSize: '12px',
                  marginTop: '4px',
                  margin: '4px 0 0 0'
                }}>
                  {form.formState.errors.password.message}
                </p>
              )}
            </div>

            {/* Login button */}
            <button
              type="submit"
              disabled={loginMutation.isPending}
              style={{
                width: '100%',
                height: '48px',
                backgroundColor: '#1c1917',
                color: 'white',
                border: 'none',
                borderRadius: '10px',
                fontSize: '15px',
                fontWeight: '700',
                cursor: loginMutation.isPending ? 'not-allowed' : 'pointer',
                marginTop: '8px',
                transition: 'background-color 0.25s',
                opacity: loginMutation.isPending ? 0.8 : 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
              data-testid="button-login"
              onMouseEnter={(e) => {
                if (!loginMutation.isPending) {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#f97316';
                }
              }}
              onMouseLeave={(e) => {
                if (!loginMutation.isPending) {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#1c1917';
                }
              }}
            >
              {loginMutation.isPending ? (
                <>
                  <div style={{
                    width: '16px',
                    height: '16px',
                    border: '2px solid rgba(255,255,255,0.3)',
                    borderTopColor: 'white',
                    borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite'
                  }} />
                  Entrando...
                </>
              ) : (
                'Entrar no Sistema'
              )}
            </button>
          </form>

          {/* Footer */}
          <p style={{
            textAlign: 'center',
            color: '#a8a29e',
            fontSize: '12px',
            marginTop: '20px',
            margin: '20px 0 0 0'
          }}>
            🔒 Sistema seguro com criptografia de ponta a ponta
          </p>
        </div>
      </div>

      <style>{`
        * {
          margin: 0;
          padding: 0;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
