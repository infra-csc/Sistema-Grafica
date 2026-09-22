import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MessageSquare, Send, Trash2, User } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { apiRequest, queryClient, getCurrentUserName } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Comment } from "@shared/schema";
import { StatusBadge } from "@/components/status-badge";
import { useConfirmar } from "@/components/ui/usar-confirmar";
import { EstadoVazio, Esqueleto } from "@/components/ui/estados";

interface CommentsSectionProps {
  itemId: string;
  itemType: string;
}

export function CommentsSection({ itemId, itemType }: CommentsSectionProps) {
  const [newComment, setNewComment] = useState("");
  const { toast } = useToast();
  const { confirmar, dialogo } = useConfirmar();

  // Buscar o usuário logado
  const { data: currentUser } = useQuery<{ name: string } | null>({
    queryKey: ["/api/auth/me"],
  });

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
      return apiRequest("POST", `/api/items/${itemId}/comments`, {
        content,
        userName: getCurrentUserName(),
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
      return apiRequest("DELETE", `/api/comments/${commentId}`);
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
    
    // Bloquear se usuário não estiver carregado
    if (!currentUser) {
      // `warning`, não `destructive`: nada falhou — o nome do usuário ainda
      // está chegando. Em vermelho de erro, a pessoa acha que perdeu o que
      // escreveu (não perdeu: o texto continua na caixa).
      toast({
        title: "Aguarde um instante",
        description: "Ainda estamos carregando quem é você. O que você escreveu continua aí.",
        variant: "warning",
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
          <div className="flex gap-2">
            <Textarea
              placeholder={`Comentar como ${currentUser?.name || "Usuário"}...`}
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              className="flex-1"
              rows={2}
              aria-label="Novo comentário"
              // Ctrl/⌘+Enter envia: quem escreve não precisa largar o teclado
              // para achar o botão. Enter sozinho segue quebrando linha.
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
              data-testid="textarea-comment"
            />
            <Button
              type="submit"
              disabled={createMutation.isPending || !newComment.trim() || !currentUser}
              size="icon"
              className="shrink-0"
              aria-label="Enviar comentário"
              title="Enviar (Ctrl+Enter)"
              data-testid="button-send-comment"
            >
              <Send className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </form>

        {/* Comments list */}
        <div className="space-y-3">
          {isLoading ? (
            <Esqueleto variante="lista" linhas={2} rotulo="Carregando comentários" />
          ) : comments.length === 0 ? (
            <EstadoVazio
              compacto
              icone={MessageSquare}
              titulo="Nenhum comentário ainda"
              descricao="Seja o primeiro a comentar sobre este item."
            />
          ) : (
            comments.map((comment) => (
              <div
                key={comment.id}
                className="border rounded-lg p-3 space-y-2 hover-elevate"
                data-testid={`comment-${comment.id}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 flex-1 flex-wrap">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium text-sm">{comment.userName}</span>
                    {comment.itemStatus && (
                      <StatusBadge status={comment.itemStatus} />
                    )}
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
                    // 36px: a lixeira de 28 ficava colada no nome do autor —
                    // alvo pequeno justamente na ação irreversível.
                    className="h-9 w-9 shrink-0"
                    aria-label="Excluir comentário"
                    title="Excluir comentário"
                    onClick={async () => {
                      // Exclusão é permanente e a lixeira aceita 1 clique — sem
                      // esta confirmação era a ação irreversível mais fácil da
                      // tela. A pergunta passou a ser a do app: além de não ser
                      // a caixa do sistema, ela mostra o COMEÇO do comentário,
                      // para quem clicou saber qual dos dez está apagando.
                      const ok = await confirmar({
                        titulo: "Excluir este comentário?",
                        descricao: `De ${comment.userName}: “${comment.content.slice(0, 120)}${comment.content.length > 120 ? "…" : ""}”. Não dá para desfazer.`,
                        confirmar: "Excluir",
                        cancelar: "Manter",
                        perigo: true,
                        icone: Trash2,
                      });
                      if (!ok) return;
                      deleteMutation.mutate(comment.id);
                    }}
                    disabled={deleteMutation.isPending}
                    data-testid={`button-delete-comment-${comment.id}`}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" aria-hidden="true" />
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
      {dialogo}
    </Card>
  );
}
