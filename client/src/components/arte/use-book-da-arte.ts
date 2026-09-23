// ─────────────────────────────────────────────────────────────────────────────
// BOOK PRONTO (PDF) enviado pela Arte: o estado do modal "Subir book", as peças
// do evento escolhido e a gravação (POST /api/events/:id/book).
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { comentarioDoBookValido } from "@/components/comentario-do-book";
import type { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { textoDoErro } from "./constantes";
import type { PecaDaArte, RespostaDoBook } from "./tipos";

export type BookDaArte = ReturnType<typeof useBookDaArte>;

export function useBookDaArte({ arteItemsPool, eventFilter, toast, uploadFileRaw }: {
  /** As peças que a Arte ainda toca (ver `arteItemsPool` em useFilaDaArte). */
  arteItemsPool: PecaDaArte[];
  eventFilter: string[];
  toast: ReturnType<typeof useToast>["toast"];
  uploadFileRaw: (file: File) => Promise<string>;
}) {
  const [isDragOverBook, setIsDragOverBook] = useState(false);
  // Book pronto (PDF) subido pela Arte: escolhe o evento e as peças cobertas.
  const [showBookModal, setShowBookModal] = useState(false);
  const [bookEventId, setBookEventId] = useState<string>("");
  const [bookFileUrl, setBookFileUrl] = useState<string>("");
  const [bookFileName, setBookFileName] = useState<string>("");
  const [bookUploading, setBookUploading] = useState(false);
  const [bookSelectedIds, setBookSelectedIds] = useState<Set<string>>(new Set());
  // ── Book pronto (PDF) enviado pela Arte para os patrocinadores ─────────────
  const bookEventPieces = useMemo(() => {
    const seen = new Set<string>();
    return arteItemsPool
      .filter((i) => {
        if (i.eventId !== bookEventId) return false;
        if (seen.has(i.id)) return false;
        seen.add(i.id);
        return true;
      })
      .sort((a, b) => String(a.displayId || "").localeCompare(String(b.displayId || ""), "pt-BR", { numeric: true }));
  }, [arteItemsPool, bookEventId]);
  // URL do book já existente para o evento selecionado (primeiro encontrado), se houver.
  const existingBookUrl = useMemo(
    () => bookEventPieces.find((i) => i.bookUrl)?.bookUrl ?? null,
    [bookEventPieces],
  );
  const bookEventOptions = useMemo(() => {
    const map = new Map<string, { value: string; label: string; count: number }>();
    arteItemsPool.forEach((i) => {
      if (!i.eventId) return;
      const cur = map.get(i.eventId);
      if (cur) cur.count++;
      else map.set(i.eventId, { value: i.eventId, label: i.event?.name || "Sem evento", count: 1 });
    });
    return Array.from(map.values());
  }, [arteItemsPool]);

  const openBookModal = () => {
    const ev = eventFilter.length > 0 ? eventFilter[0] : (bookEventOptions[0]?.value || "");
    setBookEventId(ev);
    setBookFileUrl(""); setBookFileName("");
    setBookComentario("");
    setShowBookModal(true);
  };

  // "O que mudou" (dono, 25/08): opcional na primeira publicação, obrigatório
  // na republicação (existingBookUrl) — mesma régua do servidor. Os chips de
  // patrocinador são atalho de escrita (ver comentario-do-book.tsx).
  const [bookComentario, setBookComentario] = useState("");
  const bookPatrocinadores = useMemo(() => {
    const nomes = new Set<string>();
    for (const i of bookEventPieces) for (const s of (i.sponsors ?? [])) if (s?.name) nomes.add(s.name);
    return Array.from(nomes).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [bookEventPieces]);
  const bookComentarioFalta = !!existingBookUrl && !comentarioDoBookValido(true, bookComentario);

  // Ao abrir ou trocar o evento, pré-marca todas as peças daquele evento.
  // O ref distingue "abriu/trocou de evento" (pré-marca tudo) de "a lista
  // mudou por baixo" (ex.: WebSocket): neste caso a seleção do usuário é
  // preservada — só sai o que deixou de existir no evento.
  const bookPremarkedEventRef = useRef<string | null>(null);
  useEffect(() => {
    if (!showBookModal) { bookPremarkedEventRef.current = null; return; }
    const eventPieceIds = new Set<string>(arteItemsPool.filter((i) => i.eventId === bookEventId).map((i) => i.id));
    if (bookPremarkedEventRef.current !== bookEventId) {
      bookPremarkedEventRef.current = bookEventId;
      setBookSelectedIds(eventPieceIds);
      // trocou de evento: o "o que mudou" era do outro book — não pode vazar
      setBookComentario("");
    } else {
      setBookSelectedIds(prev => new Set(Array.from(prev).filter(id => eventPieceIds.has(id))));
    }
  }, [bookEventId, showBookModal, arteItemsPool]);

  const handleBookFile = async (file?: File | null) => {
    if (!file) return;
    if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") {
      toast({ title: "Envie um PDF", description: "O book precisa ser um arquivo .pdf", variant: "warning" });
      return;
    }
    setBookUploading(true);
    try {
      const url = await uploadFileRaw(file);
      setBookFileUrl(url);
      setBookFileName(file.name);
      toast({ title: "Book anexado", description: file.name, variant: "success" });
    } catch (e) {
      toast({ title: "Erro no upload", description: textoDoErro(e), variant: "destructive" });
    } finally {
      setBookUploading(false);
    }
  };

  const saveBookMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/events/${bookEventId}/book`, {
        bookUrl: bookFileUrl,
        itemIds: Array.from(bookSelectedIds),
        comentario: bookComentario.trim() || undefined,
      });
      return await res.json() as RespostaDoBook;
    },
    // O AVISO POR E-MAIL DEIXA DE SER INVISÍVEL. Antes ele saía sozinho, sem
    // await e sem registro: se o provedor recusasse, a tela dizia "Book salvo"
    // do mesmo jeito e a Arte ia embora achando que tinha avisado. Agora o
    // servidor devolve o desfecho e o toast conta — inclusive quando falhou,
    // porque aí alguém precisa avisar na mão.
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      setShowBookModal(false);
      const a = data?.aviso;
      // Plural de verdade: "1 peça(s) vinculada(s)" obriga a ler a regra da
      // flexão em vez do número.
      const quantas = `${bookSelectedIds.size} ${bookSelectedIds.size === 1 ? "peça vinculada" : "peças vinculadas"} ao book.`;
      if (a?.status === "sent") {
        toast({ title: "Book salvo e avisado", description: `${quantas} Aviso enviado para ${(a.para ?? []).join(", ")}.`, variant: "success" });
      } else if (a?.status === "failed") {
        toast({
          title: "Book salvo — mas o aviso NÃO saiu",
          description: `${quantas} Motivo: ${a.reason ?? "desconhecido"}. Avise a equipe por outro caminho.`,
          variant: "destructive",
        });
      } else {
        toast({ title: "Book salvo", description: quantas, variant: "success" });
      }
    },
    onError: (e: Error) => toast({ title: "Erro ao salvar book", description: e.message, variant: "destructive" }),
  });

  return {
    showBookModal, setShowBookModal, bookEventId, setBookEventId, bookFileUrl, bookFileName, bookUploading,
    bookSelectedIds, setBookSelectedIds, bookComentario, setBookComentario, isDragOverBook, setIsDragOverBook,
    bookEventPieces, existingBookUrl, bookEventOptions, bookPatrocinadores, bookComentarioFalta,
    openBookModal, handleBookFile, saveBookMutation,
  };
}
