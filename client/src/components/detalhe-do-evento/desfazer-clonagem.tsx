// ─────────────────────────────────────────────────────────────────────────────
// DESFAZER A CLONAGEM — a chamada, o aviso e a faixa (19/10).
//
// Caso que originou: a Fernanda (Solicitação) clonou 69 peças do Eco Run
// Londrina para o Eco Run Navegantes querendo só algumas. Agora, depois de
// clonar, há dois caminhos de volta para o mesmo POST:
//   · o aviso "69 peças clonadas de Eco Run Londrina · Desfazer" (30 s);
//   · a FAIXA no Detalhe do Evento, para quem fechou o aviso ou só percebeu
//     olhando a lista — enquanto o servidor disser que ainda dá (janela de
//     2 horas, peças em rascunho, quem clonou ou admin).
// As regras moram em shared/desfazer-clonagem.ts; o servidor é quem decide.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Undo2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { toast } from "@/hooks/use-toast";
import { Botao } from "@/components/ui/botao";
import { ToastAction } from "@/components/ui/toast";
import { T, TOM, R } from "@/lib/theme";
import { fraseDasQueFicaram } from "@shared/desfazer-clonagem";
import type { ClonagemDesfazivel, RespostaDaClonagemDesfazivel, RespostaDoDesfazerClonagem } from "@shared/api";

/** A chave da faixa: vira GET /api/events/:id/clone-items/desfazivel. */
export const chaveDaClonagemDesfazivel = (eventId: string | undefined) =>
  ["/api/events", eventId ?? "", "clone-items", "desfazivel"] as const;

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** "22:08" — a hora da clonagem, no relógio de quem está vendo. */
export const horaCurta = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

/**
 * Desfaz a clonagem e conta o que aconteceu. É uma função solta (e não uma
 * mutation do hook) de propósito: o "Desfazer" do aviso pode ser clicado
 * depois de a pessoa sair da tela — a chamada não pode depender de um
 * componente montado.
 */
export async function desfazerClonagem(eventId: string, loteId: string): Promise<RespostaDoDesfazerClonagem | null> {
  try {
    const res = await apiRequest<RespostaDoDesfazerClonagem>("POST", `/api/events/${eventId}/clone-items/desfazer`, { loteId });
    const r = await res.json();
    queryClient.invalidateQueries({ queryKey: ["/api/items"] });
    queryClient.invalidateQueries({ queryKey: ["/api/items/deleted"] });
    queryClient.invalidateQueries({ queryKey: ["/api/events"] });
    queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
    const ficaram = fraseDasQueFicaram(r.ficaram);
    if (r.removidas === 0) {
      toast({
        title: "Nada foi desfeito",
        description: ficaram ? `${ficaram} Exclua pela lista as que não vão.` : "As peças desta clonagem já não estavam no evento.",
        variant: "warning",
      });
    } else {
      toast({
        title: "Clonagem desfeita",
        description: `${plural(r.removidas, "peça", "peças")} de ${r.origemNome} ${r.removidas === 1 ? "saiu" : "saíram"} do rascunho e ${r.removidas === 1 ? "foi" : "foram"} para a lixeira.${ficaram ? ` ${ficaram}` : ""}`,
        variant: ficaram ? "warning" : "success",
      });
    }
    return r;
  } catch (erro) {
    queryClient.invalidateQueries({ queryKey: chaveDaClonagemDesfazivel(eventId) });
    toast({
      title: "Não foi possível desfazer a clonagem",
      description: erro instanceof Error ? erro.message : undefined,
      variant: "destructive",
    });
    return null;
  }
}

/** Quanto o aviso da clonagem fica (≥ 20 s pedido; o relógio pausa sob o ponteiro). */
export const DURACAO_DO_AVISO_DA_CLONAGEM = 30_000;

/**
 * O aviso depois de clonar: "69 peças clonadas de Eco Run Londrina" com
 * "Desfazer". Sem lote (a trilha falhou, ou a clonagem sem seleção), o aviso
 * de sempre, sem a oferta.
 */
export function avisarClonagem(eventId: string | undefined, r: { cloned: number; lote?: ClonagemDesfazivel | null }) {
  const lote = r.lote;
  const titulo = `${plural(r.cloned, "peça clonada", "peças clonadas")}${lote ? ` de ${lote.origemNome}` : ""}`;
  queryClient.invalidateQueries({ queryKey: chaveDaClonagemDesfazivel(eventId) });
  toast({
    title: titulo,
    description: "Entraram em Rascunho — envie para a vinculação quando a lista estiver pronta.",
    variant: "success",
    ...(lote && eventId
      ? {
          duration: DURACAO_DO_AVISO_DA_CLONAGEM,
          action: (
            <ToastAction
              altText={`Desfazer a clonagem de ${plural(r.cloned, "peça", "peças")}`}
              onClick={() => { void desfazerClonagem(eventId, lote.id); }}
              data-testid="toast-desfazer-clonagem"
            >
              Desfazer
            </ToastAction>
          ),
        }
      : {}),
  });
}

/** A clonagem recente que quem está vendo ainda pode desfazer (ou null). */
export function useClonagemDesfazivel(eventId: string | undefined): ClonagemDesfazivel | null {
  const { data } = useQuery<RespostaDaClonagemDesfazivel>({
    queryKey: chaveDaClonagemDesfazivel(eventId),
    enabled: !!eventId,
    // A faixa fica enquanto a janela estiver aberta — e não um minuto além:
    // ao fechar, a pergunta é refeita (ver o efeito abaixo).
    staleTime: 30_000,
  });
  const lote = data?.lote ?? null;
  const [, forcar] = useState(0);
  useEffect(() => {
    if (!lote || !eventId) return;
    const falta = new Date(lote.expiraEm).getTime() - Date.now();
    const t = setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: chaveDaClonagemDesfazivel(eventId) });
      forcar((n) => n + 1);
    }, Math.max(0, falta) + 1000);
    return () => clearTimeout(t);
  }, [lote, eventId]);
  if (lote && new Date(lote.expiraEm).getTime() <= Date.now()) return null;
  return lote;
}

/**
 * A FAIXA: "Você clonou 69 peças de Eco Run Londrina às 22:08 · Desfazer
 * clonagem". Discreta (tom de informação, uma linha no computador), porque
 * na maioria das vezes a clonagem estava certa — ela só garante que o
 * caminho de volta não some com o aviso.
 */
export function FaixaDaClonagem({ eventId, isMobile }: { eventId: string | undefined; isMobile: boolean }) {
  const lote = useClonagemDesfazivel(eventId);
  const [desfazendo, setDesfazendo] = useState(false);
  if (!lote || !eventId) return null;

  const quem = lote.porVoce ? "Você clonou" : `${lote.porNome} clonou`;
  const andaram = lote.total - lote.emRascunho;
  const desfazer = async () => {
    setDesfazendo(true);
    await desfazerClonagem(eventId, lote.id);
    setDesfazendo(false);
  };

  return (
    <div
      data-testid="faixa-desfazer-clonagem"
      role="status"
      style={{
        display: "flex", flexWrap: "wrap", alignItems: "center", gap: isMobile ? 10 : 12,
        padding: isMobile ? "12px 14px" : "10px 12px 10px 16px", marginBottom: isMobile ? 16 : 22,
        backgroundColor: TOM.info.bg, border: `1px solid ${TOM.info.border}`, borderRadius: R.md,
      }}
    >
      <Undo2 aria-hidden="true" style={{ width: 16, height: 16, color: TOM.info.text, flexShrink: 0 }} />
      <p style={{ margin: 0, flex: "1 1 240px", minWidth: 0, fontSize: 13, lineHeight: 1.5, color: TOM.info.text }}>
        <strong>{quem} {plural(lote.total, "peça", "peças")}</strong> de <strong>{lote.origemNome}</strong> às {horaCurta(lote.em)}.
        <span style={{ color: T.apoio }}>
          {" "}Dá para desfazer até as {horaCurta(lote.expiraEm)}
          {andaram > 0 ? ` — só as ${lote.emRascunho} que seguem em rascunho.` : "."}
        </span>
      </p>
      <Botao
        variante="secundario"
        tamanho={isMobile ? "toque" : "sm"}
        icone={Undo2}
        carregando={desfazendo}
        onClick={desfazer}
        data-testid="button-desfazer-clonagem"
        style={{ flexShrink: 0, ...(isMobile ? { width: "100%" } : {}) }}
      >
        {desfazendo ? "Desfazendo…" : "Desfazer clonagem"}
      </Botao>
    </div>
  );
}
