import { useState } from "react";
import { format } from "date-fns";
import { toast } from "@/hooks/use-toast";
import { KIND, kindOf, srcOf, type Photo } from "./fotos";

// Baixar é a ação natural de um acervo: a foto vira anexo de e-mail, prova de
// entrega, comprovante. "Abrir original" só levava para outra aba, deixando o
// trabalho de salvar (e de nomear o arquivo) para o usuário.
export function useBaixarFoto() {
  const [baixando, setBaixando] = useState(false);
  const baixar = async (p: Photo) => {
    setBaixando(true);
    try {
      const url = srcOf(p);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const ext = (blob.type.split("/")[1] || "jpg").replace("jpeg", "jpg");
      const nome = [KIND[kindOf(p)].label, p.displayId, p.createdAt ? format(new Date(p.createdAt), "dd-MM-yy") : ""]
        .filter(Boolean).join(" ").replace(/[\\/:*?"<>|]/g, "-");
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href; a.download = `${nome}.${ext}`;
      // Fora do DOM, alguns navegadores (Firefox, iOS) ignoram o click sintético.
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 30_000);
    } catch (e) {
      // A causa técnica fica entre parênteses; a frase diz o que fazer.
      const causa = e instanceof Error && e.message ? ` (${e.message.replace(/^HTTP /, "erro ")})` : "";
      toast({ title: "Não foi possível baixar a foto", description: `O arquivo não respondeu${causa}. Abra a foto e use “Original” para tentar direto do armazenamento.`, variant: "destructive" });
    } finally {
      setBaixando(false);
    }
  };
  return { baixando, baixar };
}
