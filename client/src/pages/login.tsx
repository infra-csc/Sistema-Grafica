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
import { Lock, Zap } from "lucide-react";

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
    <div className="min-h-screen flex" style={{ backgroundColor: '#f1f5f9' }}>
      {/* Left side - Branding with Mesh Gradient */}
      <div 
        className="hidden lg:flex lg:w-[42%] p-12 flex-col justify-between relative overflow-hidden"
        style={{
          background: `
            radial-gradient(circle at 20% 50%, rgba(6, 182, 212, 0.3) 0%, transparent 50%),
            radial-gradient(circle at 80% 80%, rgba(132, 204, 22, 0.2) 0%, transparent 50%),
            linear-gradient(135deg, #2d2d2d 0%, #1f2937 100%)
          `
        }}
      >
        {/* Decorative blur circles */}
        <div className="absolute top-20 right-10 w-72 h-72 bg-cyan-400/10 rounded-full blur-3xl" />
        <div className="absolute bottom-10 left-10 w-96 h-96 bg-lime-400/8 rounded-full blur-3xl" />
        
        <div className="relative z-10">
          {/* Logo */}
          <div className="flex items-center gap-4 mb-12">
            <div 
              className="h-14 w-14 flex items-center justify-center text-white font-bold text-2xl"
              style={{ 
                backgroundColor: '#06b6d4',
                borderRadius: '10px'
              }}
            >
              N
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">NORTE</h1>
              <p className="text-white/65 text-sm">Marketing Esportivo</p>
            </div>
          </div>
        </div>

        <div className="relative z-10 space-y-8">
          {/* Decorative line */}
          <div style={{ 
            height: '2px', 
            width: '40px', 
            backgroundColor: '#06b6d4'
          }}></div>

          {/* Main title */}
          <h2 
            className="text-5xl font-black text-white leading-tight"
            style={{ 
              letterSpacing: '-1px',
              lineHeight: '1.1'
            }}
          >
            Sistema de Gestão de Produção Gráfica
          </h2>

          {/* Feature cards */}
          <div className="flex flex-col gap-3 pt-4">
            <div 
              className="flex items-center gap-3 px-3.5 py-2.5"
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '8px'
              }}
            >
              <Zap className="w-4 h-4" style={{ color: '#06b6d4' }} />
              <span className="text-sm text-white">Notificações em tempo real</span>
            </div>
            <div 
              className="flex items-center gap-3 px-3.5 py-2.5"
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '8px'
              }}
            >
              <Zap className="w-4 h-4" style={{ color: '#06b6d4' }} />
              <span className="text-sm text-white">Rastreamento completo</span>
            </div>
          </div>
        </div>

        <div className="relative z-10">
          <p className="text-white/40 text-sm">© 2024 NORTE Marketing Esportivo</p>
        </div>
      </div>

      {/* Right side - Login Form */}
      <div 
        className="flex-1 flex items-center justify-center p-8"
        style={{ backgroundColor: '#f1f5f9' }}
      >
        <div 
          className="w-full max-w-md space-y-8 animate-fadeUp"
          style={{
            animation: 'fadeIn 0.5s ease-out'
          }}
        >
          {/* Mobile logo */}
          <div className="lg:hidden text-center mb-8">
            <div className="inline-flex items-center gap-3 mb-6">
              <div 
                className="h-12 w-12 flex items-center justify-center text-white font-bold text-xl"
                style={{ 
                  backgroundColor: '#06b6d4',
                  borderRadius: '10px'
                }}
              >
                N
              </div>
              <div className="text-left">
                <h1 className="text-2xl font-bold" style={{ color: '#2d2d2d' }}>NORTE</h1>
                <p className="text-sm" style={{ color: '#6b7280' }}>Marketing Esportivo</p>
              </div>
            </div>
          </div>

          {/* Header with title and separator */}
          <div className="space-y-4">
            <h2 
              className="text-4xl font-black"
              style={{ 
                color: '#2d2d2d',
                fontSize: '28px',
                fontWeight: 800,
                letterSpacing: '-0.5px'
              }}
            >
              Bem-vindo de volta
            </h2>
            <div className="flex items-center gap-4">
              <div 
                style={{
                  height: '2px',
                  width: '32px',
                  backgroundColor: '#06b6d4'
                }}
              ></div>
              <p style={{ color: '#6b7280', fontSize: '14px' }}>
                Entre com suas credenciais para acessar o sistema
              </p>
            </div>
          </div>

          {/* Login Form */}
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel 
                      className="font-semibold text-xs uppercase"
                      style={{
                        color: '#2d2d2d',
                        letterSpacing: '0.3px'
                      }}
                    >
                      Email
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="seu@email.com"
                        style={{
                          backgroundColor: '#ffffff',
                          border: '1.5px solid #e5e7eb',
                          borderRadius: '10px',
                          padding: '13px 16px',
                          fontSize: '14px',
                          color: '#2d2d2d',
                          transition: 'all 0.2s ease'
                        }}
                        onFocus={(e) => {
                          e.currentTarget.style.borderColor = '#06b6d4';
                          e.currentTarget.style.boxShadow = '0 0 0 3px rgba(6, 182, 212, 0.12)';
                        }}
                        onBlur={(e) => {
                          e.currentTarget.style.borderColor = '#e5e7eb';
                          e.currentTarget.style.boxShadow = 'none';
                        }}
                        data-testid="input-email"
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
                    <FormLabel 
                      className="font-semibold text-xs uppercase"
                      style={{
                        color: '#2d2d2d',
                        letterSpacing: '0.3px'
                      }}
                    >
                      Senha
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="••••••••"
                        style={{
                          backgroundColor: '#ffffff',
                          border: '1.5px solid #e5e7eb',
                          borderRadius: '10px',
                          padding: '13px 16px',
                          fontSize: '14px',
                          color: '#2d2d2d',
                          transition: 'all 0.2s ease'
                        }}
                        onFocus={(e) => {
                          e.currentTarget.style.borderColor = '#06b6d4';
                          e.currentTarget.style.boxShadow = '0 0 0 3px rgba(6, 182, 212, 0.12)';
                        }}
                        onBlur={(e) => {
                          e.currentTarget.style.borderColor = '#e5e7eb';
                          e.currentTarget.style.boxShadow = 'none';
                        }}
                        data-testid="input-password"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                disabled={loginMutation.isPending}
                data-testid="button-login"
                className="w-full group overflow-hidden"
                style={{
                  backgroundColor: '#2d2d2d',
                  color: 'white',
                  fontWeight: 700,
                  fontSize: '15px',
                  borderRadius: '10px',
                  height: '48px',
                  transition: 'all 0.25s ease',
                  border: 'none'
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#06b6d4';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#2d2d2d';
                }}
              >
                <span className="flex items-center justify-center gap-2">
                  {loginMutation.isPending ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Entrando...</span>
                    </>
                  ) : (
                    <>
                      <span>Entrar no Sistema</span>
                      <span style={{ transition: 'transform 0.25s ease' }} className="group-hover:translate-x-1">→</span>
                    </>
                  )}
                </span>
              </Button>
            </form>
          </Form>

          {/* Security Footer */}
          <div 
            className="text-center flex items-center justify-center gap-2"
            style={{ color: '#9ca3af', fontSize: '12px' }}
          >
            <Lock className="w-4 h-4" />
            <span>Sistema seguro com criptografia de ponta a ponta</span>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateX(20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
      `}</style>
    </div>
  );
}
