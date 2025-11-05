import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Pencil, Trash2, Building2 } from "lucide-react";
import type { Sponsor } from "@shared/schema";

const sponsorSchema = z.object({
  name: z.string().min(1, "Nome obrigatório"),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  phone: z.string().optional(),
  company: z.string().optional(),
  contactPerson: z.string().optional(),
  notes: z.string().optional(),
});

type SponsorForm = z.infer<typeof sponsorSchema>;

export default function Patrocinadores() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSponsor, setEditingSponsor] = useState<Sponsor | null>(null);
  const [deletingSponsor, setDeletingSponsor] = useState<Sponsor | null>(null);
  const { toast } = useToast();

  const { data: sponsors = [], isLoading } = useQuery<Sponsor[]>({
    queryKey: ["/api/sponsors"],
  });

  const form = useForm<SponsorForm>({
    resolver: zodResolver(sponsorSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      company: "",
      contactPerson: "",
      notes: "",
    },
  });

  const createSponsorMutation = useMutation({
    mutationFn: async (data: SponsorForm) => {
      const res = await apiRequest("POST", "/api/sponsors", data);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sponsors"] });
      setIsDialogOpen(false);
      form.reset();
      toast({
        title: "Patrocinador criado com sucesso",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Erro ao criar patrocinador",
        description: error.message,
      });
    },
  });

  const updateSponsorMutation = useMutation({
    mutationFn: async (data: { id: string; update: Partial<SponsorForm> }) => {
      const res = await apiRequest("PATCH", `/api/sponsors/${data.id}`, data.update);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sponsors"] });
      setIsDialogOpen(false);
      setEditingSponsor(null);
      form.reset();
      toast({
        title: "Patrocinador atualizado com sucesso",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Erro ao atualizar patrocinador",
        description: error.message,
      });
    },
  });

  const deleteSponsorMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/sponsors/${id}`);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sponsors"] });
      setDeletingSponsor(null);
      toast({
        title: "Patrocinador excluído com sucesso",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Erro ao excluir patrocinador",
        description: error.message,
      });
    },
  });

  const handleEdit = (sponsor: Sponsor) => {
    setEditingSponsor(sponsor);
    form.reset({
      name: sponsor.name,
      email: sponsor.email || "",
      phone: sponsor.phone || "",
      company: sponsor.company || "",
      contactPerson: sponsor.contactPerson || "",
      notes: sponsor.notes || "",
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = (data: SponsorForm) => {
    if (editingSponsor) {
      updateSponsorMutation.mutate({ id: editingSponsor.id, update: data });
    } else {
      createSponsorMutation.mutate(data);
    }
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingSponsor(null);
    form.reset();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Carregando patrocinadores...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Patrocinadores</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gerencie os patrocinadores dos eventos
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={handleCloseDialog}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-sponsor" className="flex-shrink-0">
              <Plus className="mr-2 h-4 w-4" />
              Novo Patrocinador
            </Button>
          </DialogTrigger>
          <DialogContent data-testid="dialog-sponsor-form">
            <DialogHeader>
              <DialogTitle>
                {editingSponsor ? "Editar Patrocinador" : "Novo Patrocinador"}
              </DialogTitle>
              <DialogDescription>
                {editingSponsor
                  ? "Edite as informações do patrocinador"
                  : "Adicione um novo patrocinador ao sistema"}
              </DialogDescription>
            </DialogHeader>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome do Patrocinador *</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Ex: Empresa ABC"
                          data-testid="input-sponsor-name"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="company"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Empresa</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Ex: Empresa ABC Ltda"
                          data-testid="input-company"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="contactPerson"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Pessoa de Contato</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Ex: João Silva"
                          data-testid="input-contact-person"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="contato@empresa.com"
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
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Telefone</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="(11) 98765-4321"
                          data-testid="input-phone"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Observações</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Observações gerais"
                          data-testid="input-notes"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex justify-end gap-3 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCloseDialog}
                    data-testid="button-cancel"
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    data-testid="button-submit"
                    disabled={createSponsorMutation.isPending || updateSponsorMutation.isPending}
                  >
                    {createSponsorMutation.isPending || updateSponsorMutation.isPending
                      ? "Salvando..."
                      : editingSponsor
                      ? "Atualizar"
                      : "Criar"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Lista de Patrocinadores
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sponsors.length === 0 ? (
            <div className="text-center py-12">
              <Building2 className="mx-auto h-12 w-12 text-muted-foreground" />
              <h3 className="mt-2 text-sm font-semibold">Nenhum patrocinador</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Comece adicionando um novo patrocinador
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {sponsors.map((sponsor) => (
                <div
                  key={sponsor.id}
                  data-testid={`sponsor-item-${sponsor.id}`}
                  className="flex items-start justify-between p-4 border rounded-lg hover-elevate"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold" data-testid={`text-sponsor-name-${sponsor.id}`}>
                        {sponsor.name}
                      </h3>
                    </div>
                    {sponsor.company && (
                      <p className="text-sm text-muted-foreground">
                        Empresa: {sponsor.company}
                      </p>
                    )}
                    {sponsor.contactPerson && (
                      <p className="text-sm text-muted-foreground">
                        Contato: {sponsor.contactPerson}
                      </p>
                    )}
                    {sponsor.email && (
                      <p className="text-sm text-muted-foreground">
                        Email: {sponsor.email}
                      </p>
                    )}
                    {sponsor.phone && (
                      <p className="text-sm text-muted-foreground">
                        Telefone: {sponsor.phone}
                      </p>
                    )}
                    {sponsor.notes && (
                      <p className="text-sm text-muted-foreground italic">
                        Obs: {sponsor.notes}
                      </p>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleEdit(sponsor)}
                      data-testid={`button-edit-${sponsor.id}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setDeletingSponsor(sponsor)}
                      data-testid={`button-delete-${sponsor.id}`}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!deletingSponsor} onOpenChange={(open) => !open && setDeletingSponsor(null)}>
        <AlertDialogContent data-testid="dialog-confirm-delete">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o patrocinador{" "}
              <strong>{deletingSponsor?.name}</strong>? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingSponsor && deleteSponsorMutation.mutate(deletingSponsor.id)}
              data-testid="button-confirm-delete"
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteSponsorMutation.isPending ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
