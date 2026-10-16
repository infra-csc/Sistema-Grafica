// ─────────────────────────────────────────────────────────────────────────────
// "ORIGEM DO REAPROVEITAMENTO" — marcar ou trocar depois (dono, 16/10).
//
// O botão discreto da ficha abre este diálogo: Estoque / Em trânsito e a
// observação, gravados por PATCH /api/items/:id/origem-reaproveitamento. O
// servidor refaz a etapa quando "em trânsito" entra ou sai (fecha a peça, ou a
// devolve ao galpão) e recusa com a frase clara quando o galpão já conferiu
// as reaproveitadas — a frase aparece aqui, no próprio diálogo.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Recycle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Botao } from "@/components/ui/botao";
import { ModalHeader, modalSurface, HIDE_NATIVE_CLOSE } from "@/components/modal-shell";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { invalidarGraficaEMaquinas } from "@/lib/tempo-real-grafica";
import { N, T, TOM } from "@/lib/theme";
import { reaproveitadasDe, todaEmTransito, origemDe } from "@shared/origem-do-reaproveitamento";
import { EscolhaDaOrigem, valorDaPeca, faltaObservacao, corpoDaOrigem, type ValorDaOrigem } from "./escolha-da-origem";

type PecaDoDialogo = {
  id: string;
  displayId?: string | null;
  type?: string | null;
  quantity?: number | null;
  reuseQty?: number | null;
  isReuse?: boolean | null;
  status?: string | null;
  eventId?: string | null;
  origemReaproveitamento?: string | null;
  obsReaproveitamento?: string | null;
};

/** O que gravar a origem invalida: a peça aparece na Gráfica, no Painel, no evento e na Revisão. */
export function invalidarDepoisDaOrigem(eventId?: string | null) {
  invalidarGraficaEMaquinas();
  queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0] ?? "").startsWith("/api/items") });
  if (eventId) queryClient.invalidateQueries({ queryKey: ["/api/events", eventId] });
  // O percurso da ficha (a trilha ganhou a linha da origem).
  queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0] ?? "").startsWith("/api/audit-logs") });
}

/** A frase do servidor (o apiRequest já tira o JSON: vem só o `error`). */
const motivoDoErro = (e: unknown) => String((e as { message?: unknown })?.message ?? "").trim() || "Erro inesperado";

export function DialogoOrigemDoReaproveitamento({ peca, aoFechar, isMobile = false, aoMarcar, marcando = false, aoSalvar }: {
  /** A peça aberta — `null` fecha o diálogo. */
  peca: PecaDoDialogo | null;
  aoFechar: () => void;
  isMobile?: boolean;
  /**
   * MODO "MARCAR" (o botão ♻ da lista do evento): a peça AINDA não é
   * reaproveitada — confirmar marca o reaproveitamento da peça inteira junto
   * com a origem, por quem chamou (o PATCH da peça). Sem ele, o diálogo só
   * grava a origem de uma peça que já é reaproveitada.
   */
  aoMarcar?: (v: ValorDaOrigem) => void;
  marcando?: boolean;
  /**
   * A peça como o servidor a devolveu: a FICHA (que guarda uma cópia da peça)
   * passa a mostrar a origem e a etapa novas sem fechar e abrir de novo.
   */
  aoSalvar?: (item: PecaDoDialogo) => void;
}) {
  const { toast } = useToast();
  const [valor, setValor] = useState<ValorDaOrigem>(valorDaPeca(peca));
  const [erro, setErro] = useState<string | null>(null);
  // Cada abertura parte do que a peça tem agora.
  useEffect(() => { if (peca) { setValor(valorDaPeca(peca)); setErro(null); } }, [peca?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const salvar = useMutation({
    mutationFn: async ({ id, v }: { id: string; v: ValorDaOrigem }) =>
      await (await apiRequest("PATCH", `/api/items/${id}/origem-reaproveitamento`, corpoDaOrigem(v))).json(),
    onSuccess: (item: PecaDoDialogo & { status?: string }) => {
      invalidarDepoisDaOrigem(item?.eventId ?? peca?.eventId);
      if (item?.id) aoSalvar?.(item);
      const mudouEtapa = !!peca && item?.status && item.status !== peca.status;
      toast({
        title: "Origem do reaproveitamento salva",
        description: !origemDe(item)
          ? "A peça ficou sem origem marcada."
          : todaEmTransito(item) && mudouEtapa
            ? `${item.displayId ?? "A peça"} veio em trânsito e não passa pela Gráfica — ficou como Entregue.`
            : origemDe(item) === "em_transito"
              ? "As unidades em trânsito não passam por conferir, embalar nem entregar."
              : mudouEtapa
                ? "As reaproveitadas voltaram a passar por conferir, embalar e entregar."
                : "A Gráfica vê \"Buscar no estoque\" na fila.",
      });
      aoFechar();
    },
    onError: (e: unknown) => setErro(motivoDoErro(e)),
  });

  const falta = faltaObservacao(valor);
  const q = Number(peca?.quantity) || 0;
  const un = aoMarcar ? q : peca ? reaproveitadasDe(peca) : 0;
  const ocupado = aoMarcar ? marcando : salvar.isPending;
  const tamanho = isMobile ? "toque" : "md";

  return (
    <Dialog open={!!peca} onOpenChange={(o) => { if (!o) aoFechar(); }}>
      <DialogContent className={HIDE_NATIVE_CLOSE} style={modalSurface(460)} data-testid="dialogo-origem-reaproveitamento" data-reap-dialogo=""
        // A linha da lista abre a ficha no clique: o clique de dentro do
        // diálogo (portal) não pode subir até ela pela árvore do React.
        onClick={(e) => e.stopPropagation()}>
        <DialogTitle className="sr-only">Origem do reaproveitamento</DialogTitle>
        <DialogDescription className="sr-only">Marque se a peça sai do estoque ou já está em trânsito, e de qual etapa</DialogDescription>
        <ModalHeader
          variant="confirm"
          compacto={isMobile}
          icon={Recycle}
          tint={TOM.esmeralda.text}
          title={aoMarcar ? "Marcar reaproveitamento" : "Origem do reaproveitamento"}
          subtitle={peca ? `${peca.displayId ?? ""} · ${peca.type ?? ""} · ${aoMarcar ? `${q} un.` : un === q ? `${q} un. reaproveitadas` : `${un} de ${q} un. reaproveitadas`}` : ""}
          onClose={aoFechar}
        />
        {peca && (
          <>
            <div style={{ padding: isMobile ? "14px 16px 16px" : "16px 24px 20px", overflowY: "auto", flex: "1 1 auto", minHeight: 0, display: "flex", flexDirection: "column", gap: 12 }}>
              {aoMarcar && (
                <p className="reap-ajuda" style={{ color: T.second, marginTop: 0 }}>
                  A peça inteira ({q} un.) passa a ser reaproveitamento — nada vai para a impressora.
                </p>
              )}
              <EscolhaDaOrigem valor={valor} onChange={(v) => { setValor(v); setErro(null); }} idBase="origem-ficha" isMobile={isMobile} desabilitado={ocupado} />
              {erro && (
                <p role="alert" data-testid="erro-origem-reaproveitamento" className="reap-erro">{erro}</p>
              )}
            </div>
            <div className="reap-rodape" style={{ borderTop: `1px solid ${N.n3}`, background: T.bg, padding: isMobile ? "12px 16px calc(12px + env(safe-area-inset-bottom))" : "12px 24px" }}>
              <Botao tamanho={tamanho} onClick={aoFechar} style={{ flex: isMobile ? 1 : undefined }}>Cancelar</Botao>
              <Botao
                variante="primario"
                tom="esmeralda"
                tamanho={tamanho}
                carregando={ocupado}
                disabled={falta || ocupado}
                onClick={() => { if (falta) return; if (aoMarcar) aoMarcar(valor); else salvar.mutate({ id: peca.id, v: valor }); }}
                data-testid="button-salvar-origem-reaproveitamento"
                style={{ flex: isMobile ? 2 : undefined }}
              >
                {ocupado ? "Salvando…" : aoMarcar ? "Marcar reaproveitamento" : "Salvar origem"}
              </Botao>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
