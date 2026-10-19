// ─────────────────────────────────────────────────────────────────────────────
// FECHAMENTO DO EVENTO (19/10) — o download da planilha COMPLETA de um ou mais
// eventos (todas as peças, em qualquer status, com o evento realizado ou
// encerrado). A regra mora no servidor: services/fechamentoDoEvento.ts.
//
// Um lugar só para os três botões (Detalhe do Evento, Relatório, Gráfica):
// a URL, o nome do arquivo e o porquê de cada falha saem iguais nos três.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

/** Um evento: a rota dele; vários: a rota do lote (um arquivo, o evento numa coluna). */
export function urlDoFechamento(eventIds: string[]): string {
  if (eventIds.length === 1) return `/api/events/${encodeURIComponent(eventIds[0])}/export-xlsx`;
  return `/api/fechamento-xlsx?eventos=${eventIds.map(encodeURIComponent).join(",")}`;
}

/** O nome que o servidor deu ao arquivo (vem codificado em `filename="…"`). */
export function nomeDoArquivoDaResposta(contentDisposition: string | null): string | null {
  const m = contentDisposition?.match(/filename="([^"]+)"/);
  if (!m) return null;
  try { return decodeURIComponent(m[1]); } catch { return m[1]; }
}

/** Baixa o fechamento e devolve o nome do arquivo. Falha → Error com a frase do servidor. */
export async function baixarFechamento(eventIds: string[]): Promise<string> {
  const res = await fetch(urlDoFechamento(eventIds), { credentials: "include" });
  if (!res.ok) {
    const corpo = await res.json().catch(() => ({} as { error?: string }));
    throw new Error(corpo?.error || (res.status === 404 ? "Evento não encontrado." : "Não foi possível gerar o arquivo agora. Tente de novo."));
  }
  const nome = nomeDoArquivoDaResposta(res.headers.get("content-disposition"))
    ?? (eventIds.length === 1 ? "Fechamento.xlsx" : `Fechamento — ${eventIds.length} eventos.xlsx`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return nome;
}

/** O botão: `exportando` para o estado e um toast no começo (demora uns segundos) e na falha. */
export function useExportarFechamento() {
  const { toast } = useToast();
  const [exportando, setExportando] = useState(false);
  const exportar = async (eventIds: string[]) => {
    if (exportando || eventIds.length === 0) return;
    setExportando(true);
    toast({ title: "Gerando o fechamento…", description: "Todas as peças do evento. O download começa em instantes.", variant: "success" });
    try {
      await baixarFechamento(eventIds);
    } catch (erro) {
      toast({ title: "Não foi possível exportar o fechamento", description: (erro as Error).message, variant: "destructive" });
    } finally {
      setExportando(false);
    }
  };
  return { exportar, exportando };
}
