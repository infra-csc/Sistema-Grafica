import { useQuery } from "@tanstack/react-query";
import { Image as ImageIcon, ExternalLink } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface DeliveryPhotoGalleryProps {
  itemId: string;
}

interface DeliveryPhoto {
  id: string;
  itemId: string;
  photoUrl: string;
  uploadedBy: string;
  uploadedAt: string;
}

export function DeliveryPhotoGallery({ itemId }: DeliveryPhotoGalleryProps) {
  const { data: photos = [], isLoading } = useQuery<DeliveryPhoto[]>({
    queryKey: ["/api/items", itemId, "photos"],
    enabled: !!itemId,
  });

  if (isLoading) {
    return (
      <div className="text-sm text-muted-foreground">
        Carregando fotos...
      </div>
    );
  }

  if (photos.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground p-4 bg-muted/50 rounded-lg">
        <ImageIcon className="h-4 w-4" />
        <span>Nenhuma foto de entrega anexada</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <ImageIcon className="h-4 w-4 text-muted-foreground" />
        <p className="text-sm font-medium text-muted-foreground">
          Fotos da Entrega ({photos.length})
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {photos.map((photo) => (
          <Card key={photo.id} className="overflow-hidden group hover-elevate">
            <a
              href={photo.photoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block relative aspect-video bg-muted"
            >
              <img
                src={photo.photoUrl}
                alt="Foto de entrega"
                className="w-full h-full object-cover"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <ExternalLink className="h-6 w-6 text-white" />
              </div>
            </a>
            <div className="p-2 space-y-1">
              <div className="flex items-center justify-between text-xs">
                <Badge variant="outline" className="text-xs">
                  {photo.uploadedBy}
                </Badge>
                <span className="text-muted-foreground">
                  {formatDistanceToNow(new Date(photo.uploadedAt), {
                    addSuffix: true,
                    locale: ptBR,
                  })}
                </span>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
