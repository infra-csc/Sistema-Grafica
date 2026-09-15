import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { changePasswordSchema } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { KeyRound, Eye, EyeOff, Check, X, AlertCircle, ArrowLeft } from "lucide-react";

// Fundo da casa, e não o degradê primário→acento do template: dentro da casca
// autenticada ele virava uma mancha laranja atrás de um formulário de três
// campos. A altura desconta a topbar de 64 — com min-h-screen a tela ganhava
// rolagem sem ter nada abaixo da dobra.
const FUNDO = "min-h-[calc(100dvh-64px)] flex items-center justify-center p-4 bg-[#fafaf9]";

type ChangePasswordForm = z.infer<typeof changePasswordSchema>;

export default function ChangePassword() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // Get current user to check if first login
  const { data: user, isLoading, isError, refetch } = useQuery<{ mustChangePassword: boolean }>({
    queryKey: ["/api/auth/me"],
  });

  const isFirstLogin = user?.mustChangePassword;
  const [showPasswords, setShowPasswords] = useState(false);
  const passwordType = showPasswords ? "text" : "password";

  const form = useForm<ChangePasswordForm>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
      isFirstAccess: false,
    },
  });

  // Mantém o flag do schema em sincronia com o usuário carregado: fora do
  // primeiro acesso, o superRefine passa a exigir a senha atual no submit.
  // (No servidor o flag é sobrescrito por user.mustChangePassword — este
  // valor só alimenta a validação do formulário.)
  useEffect(() => {
    form.setValue("isFirstAccess", !!user?.mustChangePassword);
  }, [user?.mustChangePassword, form]);

  const newPassword = form.watch("newPassword");
  const confirmPassword = form.watch("confirmPassword");
  const requirements = [
    { ok: newPassword.length >= 8, label: "Pelo menos 8 caracteres" },
    { ok: newPassword.length > 0 && newPassword === confirmPassword, label: "Confirmação igual à nova senha" },
  ];

  const changePasswordMutation = useMutation({
    mutationFn: async ({ isFirstAccess: _clientOnly, ...data }: ChangePasswordForm) => {
      const res = await apiRequest("POST", "/api/auth/change-password", data);
      return await res.json();
    },
    onSuccess: async () => {
      // Invalidate auth query to refresh user data
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });

      // O servidor derruba as outras sessões do usuário ao trocar a senha —
      // efeito de segurança relevante demais para acontecer em silêncio.
      toast({
        title: "Senha alterada com sucesso",
        description: `${isFirstLogin
          ? "Você já pode acessar o sistema com sua nova senha."
          : "Sua senha foi atualizada."} As demais sessões conectadas foram encerradas.`,
      });

      setLocation("/");
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Erro ao alterar senha",
        description: error.message || "Não foi possível alterar a senha",
      });
    },
  });

  const onSubmit = (data: ChangePasswordForm) => {
    changePasswordMutation.mutate(data);
  };

  if (isLoading) {
    return (
      <div className={FUNDO}>
        <Card className="w-full max-w-md" aria-busy="true">
          <CardHeader className="space-y-1 text-center">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 rounded-full bg-muted animate-pulse" />
            </div>
            <div className="h-7 w-40 mx-auto rounded bg-muted animate-pulse" />
            <div className="h-4 w-56 mx-auto rounded bg-muted animate-pulse" />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="h-10 rounded bg-muted animate-pulse" />
            <div className="h-10 rounded bg-muted animate-pulse" />
            <div className="h-10 rounded bg-muted animate-pulse" />
            <span className="sr-only">Carregando seus dados...</span>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isError) {
    return (
      <div className={FUNDO}>
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-1 text-center">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertCircle className="w-8 h-8 text-destructive" />
              </div>
            </div>
            <CardTitle className="text-2xl font-bold">Não foi possível carregar</CardTitle>
            <CardDescription>
              Falha ao buscar seus dados de acesso. Verifique sua conexão e tente novamente.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => refetch()}>
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className={FUNDO}>
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          {/* Voltar só fora do primeiro acesso: no primeiro, trocar a senha
              é obrigatório e o guard devolveria o usuário para cá. */}
          {!isFirstLogin && (
            <button
              type="button"
              onClick={() => (window.history.length > 1 ? window.history.back() : setLocation("/"))}
              className="self-start -mt-2 -ml-2 mb-1 inline-flex items-center gap-1.5 h-9 px-2 rounded-md text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-[#f5f5f4] transition-colors"
              data-testid="button-voltar-alterar-senha"
            >
              <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
              Voltar
            </button>
          )}
          <div className="flex justify-center mb-4">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ backgroundColor: "#fff7ed" }}>
              <KeyRound className="w-7 h-7" style={{ color: "#c2410c" }} aria-hidden="true" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">
            {isFirstLogin ? "Primeiro Acesso" : "Alterar Senha"}
          </CardTitle>
          <CardDescription>
            {isFirstLogin
              ? "Por segurança, você deve criar uma nova senha"
              : "Altere sua senha de acesso"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <button
                type="button"
                onClick={() => setShowPasswords(v => !v)}
                aria-pressed={showPasswords}
                className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                {showPasswords ? <EyeOff className="w-3.5 h-3.5" aria-hidden="true" /> : <Eye className="w-3.5 h-3.5" aria-hidden="true" />}
                {showPasswords ? "Ocultar senhas" : "Mostrar senhas"}
              </button>
              {!isFirstLogin && (
                <FormField
                  control={form.control}
                  name="currentPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Senha Atual</FormLabel>
                      <FormControl>
                        <Input
                          type={passwordType}
                          placeholder="••••••••"
                          autoComplete="current-password"
                          data-testid="input-current-password"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Obrigatória para confirmar que é você
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              <FormField
                control={form.control}
                name="newPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nova Senha</FormLabel>
                    <FormControl>
                      <Input
                        type={passwordType}
                        placeholder="••••••••"
                        autoComplete="new-password"
                        data-testid="input-new-password"
                        {...field}
                      />
                    </FormControl>
                    {/* A descrição "Mínimo de 8 caracteres" saiu: repetia o
                        primeiro item do checklist logo abaixo, que diz o
                        mesmo e ainda marca quando foi atendido. */}
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirmar Nova Senha</FormLabel>
                    <FormControl>
                      <Input
                        type={passwordType}
                        placeholder="••••••••"
                        autoComplete="new-password"
                        data-testid="input-confirm-password"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {/* aria-live: o checklist muda enquanto se digita — sem o anúncio,
                  quem usa leitor de tela só descobria requisito pendente no erro
                  do submit. */}
              <ul className="space-y-1" aria-label="Requisitos da nova senha" aria-live="polite">
                {requirements.map(req => (
                  <li
                    key={req.label}
                    className={`flex items-center gap-1.5 text-xs ${req.ok ? "text-green-700" : "text-muted-foreground"}`}
                  >
                    {req.ok ? <Check className="w-3.5 h-3.5" aria-hidden="true" /> : <X className="w-3.5 h-3.5" aria-hidden="true" />}
                    <span>
                      {req.label}
                      <span className="sr-only">{req.ok ? " — atendido" : " — pendente"}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <Button
                type="submit"
                className="w-full"
                disabled={changePasswordMutation.isPending}
                data-testid="button-change-password"
              >
                {changePasswordMutation.isPending ? "Salvando…" : isFirstLogin ? "Criar senha e entrar" : "Salvar nova senha"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
