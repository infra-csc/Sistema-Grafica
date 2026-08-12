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
import { KeyRound, Eye, EyeOff, Check, X, AlertCircle } from "lucide-react";

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

      toast({
        title: "Senha alterada com sucesso",
        description: isFirstLogin
          ? "Você já pode acessar o sistema com sua nova senha"
          : "Sua senha foi atualizada",
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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-accent/10 p-4">
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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-accent/10 p-4">
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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-accent/10 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <KeyRound className="w-8 h-8 text-primary" />
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
                    <FormDescription>
                      Mínimo de 8 caracteres
                    </FormDescription>
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
              <ul className="space-y-1" aria-label="Requisitos da nova senha">
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
                {changePasswordMutation.isPending ? "Alterando..." : "Alterar Senha"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
