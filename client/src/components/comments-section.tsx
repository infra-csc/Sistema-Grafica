import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { MessageSquare, Send, Trash2, User } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Comment } from "@shared/schema";

interface CommentsSectionProps {
  itemId: string;
  itemType: string;
}

export function CommentsSection({ itemId, itemType }: CommentsSectionProps) {
  const [newComment, setNewComment] = useState("");
  const [userName, setUserName] = useState(() => {
    return localStorage.getItem("userName") || "";
  });
  const { toast } = useToast();

  const { data: comments = [], isLoading } = useQuery<Comment[]>({
    queryKey: ["/api/items", itemId, "comments"],
    queryFn: async () => {
      const res = await fetch(`/api/items/${itemId}/comments`);
      if (!res.ok) throw new Error("Failed to fetch comments");
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (content: string) => {
      const currentUserName = userName || "Usuário";
      localStorage.setItem("userName", currentUserName);
      
      return apiRequest(`/api/items/${itemId}/comments`, {
        method: "POST",
        body: JSON.stringify({
          content,
          userName: currentUserName,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items", itemId, "comments"] });
      setNewComment("");
      toast({
        title: "Comentário adicionado",
        description: "Seu comentário foi publicado com sucesso.",
      });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Não foi possível adicionar o comentário.",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (commentId: string) => {
      return apiRequest(`/api/comments/${commentId}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items", itemId, "comments"] });
      toast({
        title: "Comentário excluído",
        description: "O comentário foi removido.",
      });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Não foi possível excluir o comentário.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    if (!userName.trim()) {
      toast({
        title: "Nome obrigatório",
        description: "Por favor, informe seu nome para comentar.",
        variant: "destructive",
      });
      return;
    }
    createMutation.mutate(newComment);
  };

  return (
    <Card data-testid="card-comments">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          Comentários ({comments.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Form to add comment */}
        <form onSubmit={handleSubmit} className="space-y-3">
          <Input
            placeholder="Seu nome"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            data-testid="input-user-name"
          />
          <div className="flex gap-2">
            <Textarea
              placeholder="Adicione um comentário..."
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              className="flex-1"
              rows={2}
              data-testid="textarea-comment"
            />
            <Button
              type="submit"
              disabled={createMutation.isPending || !newComment.trim()}
              size="icon"
              className="shrink-0"
              data-testid="button-send-comment"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </form>

        {/* Comments list */}
        <div className="space-y-3">
          {isLoading ? (
            <div className="text-center py-4 text-muted-foreground">
              Carregando comentários...
            </div>
          ) : comments.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <MessageSquare className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>Nenhum comentário ainda</p>
              <p className="text-sm mt-1">Seja o primeiro a comentar sobre este item</p>
            </div>
          ) : (
            comments.map((comment) => (
              <div
                key={comment.id}
                className="border rounded-lg p-3 space-y-2 hover-elevate"
                data-testid={`comment-${comment.id}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 flex-1">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium text-sm">{comment.userName}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(comment.createdAt), {
                        addSuffix: true,
                        locale: ptBR,
                      })}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={() => deleteMutation.mutate(comment.id)}
                    disabled={deleteMutation.isPending}
                    data-testid={`button-delete-comment-${comment.id}`}
                  >
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
                <p className="text-sm whitespace-pre-wrap pl-6" data-testid={`text-comment-content-${comment.id}`}>
                  {comment.content}
                </p>
                <div className="text-xs text-muted-foreground pl-6">
                  {format(new Date(comment.createdAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
