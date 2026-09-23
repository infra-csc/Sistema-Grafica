// ─────────────────────────────────────────────────────────────────────────────
// MÁQUINAS DA GRÁFICA — a FICHA da peça, a MESMA da Gráfica.
//
// A peça completa vem, sob demanda, da lista que a Gráfica já usa
// (/api/items/approved: toda peça desta tela está nela); o histórico, do mesmo
// endpoint com escopo na peça. Quem abre é o título da peça (FichaContext).
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowRight, Eye, Loader2, RotateCcw } from "lucide-react";
import { Botao } from "@/components/ui/botao";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { HIDE_NATIVE_CLOSE, ModalHeader, modalSurface } from "@/components/modal-shell";
import { ItemDetailsDialog } from "@/components/item-details-dialog";
import type { PecaDaFila, RegistroDoHistorico } from "@/components/grafica/tipos";
import { T, FS } from "@/lib/theme";
import { linkDaPecaNaGrafica } from "@shared/progresso-da-impressao";
import { VERMELHO } from "./constantes";
import { AVISO_SERVIDOR_ANTIGO, ehServidorNaVersaoAnterior } from "./regras";

export function FichaDaPeca({ fichaId, setFichaId, isMobile, botaoNeutro }: {
  /** A peça com a ficha aberta (null = fechada). */ fichaId: string | null; setFichaId: (id: string | null) => void; isMobile: boolean; botaoNeutro: React.CSSProperties;
}) {
  const pecasDaGrafica = useQuery<PecaDaFila[]>({ queryKey: ["/api/items/approved"], enabled: !!fichaId, staleTime: 30_000 });
  const itemDaFicha = useMemo(
    () => (fichaId ? (Array.isArray(pecasDaGrafica.data) ? pecasDaGrafica.data : []).find((i) => i?.id === fichaId) ?? null : null),
    [fichaId, pecasDaGrafica.data],
  );
  const historicoDaFicha = useQuery<RegistroDoHistorico[]>({
    queryKey: ["/api/audit-logs", "item", fichaId],
    queryFn: () => fetch(`/api/audit-logs?entityType=item&entityId=${fichaId}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Falha ao carregar o histórico (HTTP ${r.status})`)))),
    select: (d) => (Array.isArray(d) ? d : []),
    enabled: !!itemDaFicha,
    placeholderData: [],
  });

  // Enquanto a peça completa não chega, um aviso pequeno (com saída); depois,
  // o mesmo diálogo que a Gráfica abre no "Ver detalhes".
  return (
    <>
      <Dialog open={!!fichaId && !itemDaFicha} onOpenChange={(open) => { if (!open) setFichaId(null); }}>
        <DialogContent className={HIDE_NATIVE_CLOSE} style={modalSurface(380)} data-testid="ficha-carregando">
          <DialogTitle className="sr-only">Detalhes da peça</DialogTitle>
          <DialogDescription className="sr-only">Carregando as informações da peça</DialogDescription>
          <ModalHeader icon={Eye} tint={T.text} title="Detalhes da peça" subtitle={pecasDaGrafica.isError ? "Não foi possível carregar" : pecasDaGrafica.isFetching || pecasDaGrafica.isLoading ? "Carregando…" : "Peça não encontrada na fila"} onClose={() => setFichaId(null)} />
          <div style={{ padding: isMobile ? 16 : 24, display: "flex", flexDirection: "column", gap: 12, fontSize: FS.body, color: T.second }}>
            {pecasDaGrafica.isError ? (
              <p role="alert" style={{ margin: 0, color: VERMELHO.text }}>{ehServidorNaVersaoAnterior(pecasDaGrafica.error) ? AVISO_SERVIDOR_ANTIGO : "Não foi possível carregar a ficha desta peça. Confira a conexão e tente de novo."}</p>
            ) : pecasDaGrafica.isFetching || pecasDaGrafica.isLoading ? (
              <p role="status" aria-busy="true" style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}><Loader2 aria-hidden="true" className="animate-spin" style={{ width: 14, height: 14 }} /> Buscando as informações da peça…</p>
            ) : (
              <p role="status" style={{ margin: 0 }}>Esta peça não está mais na fila da Gráfica (pode ter sido concluída, cancelada ou devolvida).</p>
            )}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {pecasDaGrafica.isError && <Botao variante="secundario" icone={RotateCcw} onClick={() => pecasDaGrafica.refetch()} style={botaoNeutro}>Tentar novamente</Botao>}
              {fichaId && <Link href={linkDaPecaNaGrafica(fichaId)} className="mq-acao" style={botaoNeutro}>Ver na Gráfica <ArrowRight aria-hidden="true" style={{ width: 12, height: 12, color: T.accentText }} /></Link>}
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <ItemDetailsDialog
        item={itemDaFicha}
        auditLogs={historicoDaFicha.data ?? []}
        open={!!itemDaFicha}
        onOpenChange={(open) => { if (!open) setFichaId(null); }}
        topActions={fichaId ? (
          <Link href={linkDaPecaNaGrafica(fichaId)} className="mq-acao" data-testid="ficha-ver-na-grafica" style={botaoNeutro}>
            Ver na Gráfica <ArrowRight aria-hidden="true" style={{ width: 12, height: 12, color: T.accentText }} />
          </Link>
        ) : undefined}
      />
    </>
  );
}
