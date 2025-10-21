import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Image, Upload, Trash2, ZoomIn } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { DeliveryPhoto } from "@shared/schema";

interface DeliveryPhotoGalleryProps {
  itemId: string;
}

export function DeliveryPhotoGallery({ itemId }: DeliveryPhotoGalleryProps) {
  const [uploadedBy, setUploadedBy] = useState(() => {
    return localStorage.getItem("userName") || "";
  });
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const { toast } = useToast();

  const { data: photos = [], isLoading } = useQuery<DeliveryPhoto[]>({
    queryKey: ["/api/items", itemId, "photos"],
    queryFn: async () => {
      const res = await fetch(`/api/items/${itemId}/photos`);
      if (!res.ok) throw new Error("Failed to fetch photos");
      return res.json();
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (photoUrl: string) => {
      const currentUser = uploadedBy || "Usuário";
      localStorage.setItem("userName", currentUser);
      
      return apiRequest(`/api/items/${itemId}/photos`, {
        method: "POST",
        body: JSON.stringify({
          photoUrl,
          uploadedBy: currentUser,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items", itemId, "photos"] });
      toast({
        title: "Foto adicionada",
        description: "A foto de entrega foi adicionada com sucesso.",
      });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Não foi possível adicionar a foto.",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (photoId: string) => {
      return apiRequest(`/api/photos/${photoId}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items", itemId, "photos"] });
      toast({
        title: "Foto excluída",
        description: "A foto foi removida.",
      });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Não foi possível excluir a foto.",
        variant: "destructive",
      });
    },
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!uploadedBy.trim()) {
      toast({
        title: "Nome obrigatório",
        description: "Por favor, informe seu nome antes de enviar a foto.",
        variant: "destructive",
      });
      return;
    }

    // Convert to base64
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      uploadMutation.mutate(base64String);
    };
    reader.readAsDataURL(file);
  };

  return (
    <Card data-testid="card-photo-gallery">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Image className="h-5 w-5" />
          Fotos de Entrega ({photos.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Upload form */}
        <div className="space-y-3">
          <div>
            <Label htmlFor="uploader-name">Seu nome</Label>
            <Input
              id="uploader-name"
              placeholder="Nome de quem está enviando a foto"
              value={uploadedBy}
              onChange={(e) => setUploadedBy(e.target.value)}
              data-testid="input-uploader-name"
            />
          </div>
          <div>
            <Label htmlFor="photo-upload">Adicionar foto</Label>
            <div className="flex gap-2 items-center">
              <Input
                id="photo-upload"
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                disabled={uploadMutation.isPending}
                className="flex-1"
                data-testid="input-photo-upload"
              />
              <Button
                type="button"
                disabled={uploadMutation.isPending}
                size="icon"
                variant="secondary"
              >
                <Upload className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Photos grid */}
        {isLoading ? (
          <div className="text-center py-4 text-muted-foreground">
            Carregando fotos...
          </div>
        ) : photos.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Image className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>Nenhuma foto de entrega</p>
            <p className="text-sm mt-1">Adicione fotos para documentar a entrega</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {photos.map((photo) => (
              <div
                key={photo.id}
                className="relative group border rounded-lg overflow-hidden aspect-square"
                data-testid={`photo-${photo.id}`}
              >
                <img
                  src={photo.photoUrl}
                  alt="Foto de entrega"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button
                        size="icon"
                        variant="secondary"
                        onClick={() => setSelectedImage(photo.photoUrl)}
                        data-testid={`button-zoom-photo-${photo.id}`}
                      >
                        <ZoomIn className="h-4 w-4" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-4xl">
                      <DialogHeader>
                        <DialogTitle>Foto de Entrega</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-2">
                        <img
                          src={photo.photoUrl}
                          alt="Foto de entrega ampliada"
                          className="w-full rounded-lg"
                        />
                        <div className="text-sm text-muted-foreground">
                          <p>Enviada por: {photo.uploadedBy}</p>
                          <p>
                            {format(new Date(photo.createdAt), "dd/MM/yyyy 'às' HH:mm", {
                              locale: ptBR,
                            })}
                          </p>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                  <Button
                    size="icon"
                    variant="destructive"
                    onClick={() => deleteMutation.mutate(photo.id)}
                    disabled={deleteMutation.isPending}
                    data-testid={`button-delete-photo-${photo.id}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white p-2 text-xs">
                  <p className="font-medium truncate">{photo.uploadedBy}</p>
                  <p className="text-[10px] text-white/80">
                    {format(new Date(photo.createdAt), "dd/MM/yy HH:mm")}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
