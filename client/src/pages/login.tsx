import { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LogIn } from "lucide-react";

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
      // Invalidate auth query to refresh user data
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      
      toast({
        title: "Login realizado com sucesso",
        description: `Bem-vindo, ${user.name}!`,
      });

      // Small delay to ensure auth context updates
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
    <div className="min-h-screen flex">
      {/* Left side - Branding - TITANIUM THEME */}
      <div style={{
        display: 'none',
        width: '42%',
        backgroundColor: '#1c1917',
        padding: '48px',
        flexDirection: 'column',
        justifyContent: 'space-between',
        position: 'relative',
        overflow: 'hidden'
      }} className="hidden lg:flex">
        {/* Spot decorativo laranja */}
        <div style={{
          position: 'absolute',
          bottom: '0',
          left: '0',
          width: '300px',
          height: '300px',
          background: 'radial-gradient(circle, rgba(249,115,22,0.35) 0%, transparent 70%)',
          pointerEvents: 'none'
        }} />
        
        {/* Conteúdo */}
        <div style={{ position: 'relative', zIndex: 10 }}>
          {/* Logo e Nome */}
          <div style={{ marginBottom: '32px' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              marginBottom: '16px'
            }}>
              <div style={{
                width: '44px',
                height: '44px',
                borderRadius: '10px',
                backgroundColor: '#f97316',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                fontWeight: '800',
                fontSize: '20px'
              }}>
                N
              </div>
              <div>
                <h1 style={{
                  fontSize: '15px',
                  fontWeight: '700',
                  color: '#ffffff',
                  margin: 0
                }}>NORTE</h1>
                <p style={{
                  fontSize: '12px',
                  color: 'rgba(255,255,255,0.55)',
                  margin: '2px 0 0'
                }}>Marketing Esportivo</p>
              </div>
            </div>

            {/* Linha decorativa */}
            <div style={{
              width: '36px',
              height: '2px',
              backgroundColor: '#f97316',
              margin: '40px 0 20px'
            }} />
          </div>

          {/* Título */}
          <h2 style={{
            fontSize: '28px',
            fontWeight: '800',
            color: '#ffffff',
            letterSpacing: '-0.5px',
            lineHeight: '1.15',
            margin: '0 0 12px'
          }}>
            Sistema de Gestão de Produção Gráfica
          </h2>

          {/* Subtítulo */}
          <p style={{
            fontSize: '14px',
            color: 'rgba(255,255,255,0.55)',
            lineHeight: '1.6',
            margin: '12px 0 0'
          }}>
            Controle completo do fluxo de produção: Solicitação → Arte → Gráfica → Entrega
          </p>

          {/* Cards de Features */}
          <div style={{
            display: 'flex',
            gap: '12px',
            marginTop: '20px'
          }}>
            <div style={{
              flex: 1,
              backgroundColor: 'rgba(255,255,255,0.07)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '8px',
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <span style={{ color: '#f97316', fontSize: '16px' }}>✓</span>
              <span style={{ color: '#ffffff', fontSize: '13px' }}>Notificações em tempo real</span>
            </div>
            <div style={{
              flex: 1,
              backgroundColor: 'rgba(255,255,255,0.07)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '8px',
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <span style={{ color: '#f97316', fontSize: '16px' }}>✓</span>
              <span style={{ color: '#ffffff', fontSize: '13px' }}>Rastreamento completo</span>
            </div>
          </div>
        </div>

        {/* Rodapé */}
        <div style={{
          position: 'relative',
          zIndex: 10
        }}>
          <p style={{
            fontSize: '11px',
            color: 'rgba(255,255,255,0.3)',
            margin: 0
          }}>© 2024 NORTE Marketing Esportivo</p>
        </div>
      </div>

      {/* Right side - Login Form - TITANIUM THEME */}
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px',
        backgroundColor: '#fafaf9'
      }}>
        <div style={{
          width: '100%',
          maxWidth: '384px',
          display: 'flex',
          flexDirection: 'column',
          gap: '32px'
        }}>
          {/* Mobile logo */}
          <div style={{ display: 'none', textAlign: 'center' }} className="lg:hidden">
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '12px',
              marginBottom: '24px'
            }}>
              <div style={{
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                backgroundColor: '#f97316',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                fontWeight: '800',
                fontSize: '20px'
              }}>
                N
              </div>
              <div style={{ textAlign: 'left' }}>
                <h1 style={{
                  fontSize: '20px',
                  fontWeight: '700',
                  color: '#1c1917',
                  margin: 0
                }}>NORTE</h1>
                <p style={{
                  fontSize: '12px',
                  color: '#78716c',
                  margin: '2px 0 0'
                }}>Marketing Esportivo</p>
              </div>
            </div>
          </div>

          {/* Header */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <h2 style={{
              fontSize: '28px',
              fontWeight: '700',
              color: '#1c1917',
              letterSpacing: '-0.5px',
              margin: 0,
              lineHeight: '1.2'
            }}>
              Bem-vindo de volta
            </h2>
            <div style={{
              width: '32px',
              height: '2px',
              backgroundColor: '#f97316'
            }} />
            <p style={{
              fontSize: '13px',
              color: '#78716c',
              margin: '8px 0 0'
            }}>
              Entre com suas credenciais para acessar o sistema
            </p>
          </div>

          {/* Form */}
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel style={{ color: '#1c1917', fontWeight: '500', fontSize: '13px' }}>Email</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="seu@email.com"
                        style={{
                          height: '44px',
                          backgroundColor: '#ffffff',
                          border: '1.5px solid #e7e5e4',
                          borderRadius: '8px',
                          color: '#1c1917',
                          fontSize: '13px'
                        }}
                        data-testid="input-email"
                        onFocus={(e) => {
                          (e.target as HTMLInputElement).style.borderColor = '#f97316';
                          (e.target as HTMLInputElement).style.boxShadow = '0 0 0 2px rgba(249,115,22,0.12)';
                        }}
                        onBlur={(e) => {
                          (e.target as HTMLInputElement).style.borderColor = '#e7e5e4';
                          (e.target as HTMLInputElement).style.boxShadow = 'none';
                        }}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel style={{ color: '#1c1917', fontWeight: '500', fontSize: '13px' }}>Senha</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="••••••••"
                        style={{
                          height: '44px',
                          backgroundColor: '#ffffff',
                          border: '1.5px solid #e7e5e4',
                          borderRadius: '8px',
                          color: '#1c1917',
                          fontSize: '13px'
                        }}
                        data-testid="input-password"
                        onFocus={(e) => {
                          (e.target as HTMLInputElement).style.borderColor = '#f97316';
                          (e.target as HTMLInputElement).style.boxShadow = '0 0 0 2px rgba(249,115,22,0.12)';
                        }}
                        onBlur={(e) => {
                          (e.target as HTMLInputElement).style.borderColor = '#e7e5e4';
                          (e.target as HTMLInputElement).style.boxShadow = 'none';
                        }}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                style={{
                  height: '44px',
                  fontSize: '13px',
                  fontWeight: '600',
                  backgroundColor: '#1c1917',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'background-color 0.25s ease'
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#f97316';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#1c1917';
                }}
                disabled={loginMutation.isPending}
                data-testid="button-login"
              >
                {loginMutation.isPending ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{
                      width: '16px',
                      height: '16px',
                      border: '2px solid rgba(255,255,255,0.3)',
                      borderTop: '2px solid white',
                      borderRadius: '50%',
                      animation: 'spin 0.8s linear infinite'
                    }} />
                    Entrando...
                  </span>
                ) : (
                  "Entrar no Sistema"
                )}
              </Button>
            </form>
          </Form>

          {/* Footer */}
          <div style={{
            textAlign: 'center',
            fontSize: '12px',
            color: '#a8a29e'
          }}>
            Sistema seguro com criptografia de ponta a ponta
          </div>
        </div>
      </div>
      
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
