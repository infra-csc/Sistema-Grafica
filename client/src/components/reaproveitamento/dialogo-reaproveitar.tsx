// ─────────────────────────────────────────────────────────────────────────────
// REAPROVEITAR NA GRÁFICA — quantas unidades e DE ONDE VÊM (dono, 16/10).
//
// Era uma edição em linha (número + OK) espremida na coluna fixa de ações; a
// escolha "Estoque / Em trânsito" e a observação não cabiam ali. Virou um
// diálogo curto, com os mesmos data-testid do campo e do OK de antes. O corpo
// vai para POST /api/items/:id/mark-reuse ({ qty } soma; { reuseTotal } ajusta
// a peça já produzida) com origemReaproveitamento / obsReaproveitamento.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from "react";
import { Recycle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Botao } from "@/components/ui/botao";
import { ModalHeader, modalSurface, HIDE_NATIVE_CLOSE } from "@/components/modal-shell";
import { FS, FW, N, R, T, TOM } from "@/lib/theme";
import { EscolhaDaOrigem, valorDaPeca, faltaObservacao, type ValorDaOrigem } from "./escolha-da-origem";

export type PecaParaReaproveitar = {
  id: string;
  displayId?: string | null;
  type?: string | null;
  quantity?: number | null;
  origemReaproveitamento?: string | null;
  obsReaproveitamento?: string | null;
};

export function DialogoReaproveitar({
  peca, aberto, ajuste, minimo, maximo, quantidade, setQuantidade, carregando, aoConfirmar, aoFechar,
  sufixoDoTestid = "", isMobile = false, toque = false,
}: {
  peca: PecaParaReaproveitar;
  aberto: boolean;
  /** Peça já produzida: o número é o TOTAL reaproveitado (converte com as produzidas). */
  ajuste: boolean;
  minimo: number;
  maximo: number;
  quantidade: number;
  setQuantidade: (n: number) => void;
  carregando: boolean;
  aoConfirmar: (origem: ValorDaOrigem) => void;
  aoFechar: () => void;
  /** "card-" no cartão do celular — os ids de sempre ("input-reuse-qty-card-…"). */
  sufixoDoTestid?: string;
  isMobile?: boolean;
  toque?: boolean;
}) {
  const [origem, setOrigem] = useState<ValorDaOrigem>(valorDaPeca(peca));
  useEffect(() => { if (aberto) setOrigem(valorDaPeca(peca)); }, [aberto, peca.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const q = Number(peca.quantity) || 0;
  const falta = faltaObservacao(origem);
  const tamanho = isMobile || toque ? "toque" : "md";
  const resto = ajuste ? q - quantidade : null;
  const confirmar = () => { if (!falta && !carregando) aoConfirmar(origem); };

  return (
    <Dialog open={aberto} onOpenChange={(o) => { if (!o) aoFechar(); }}>
      <DialogContent
        className={HIDE_NATIVE_CLOSE}
        style={modalSurface(460)}
        data-testid={`dialogo-reaproveitar-${sufixoDoTestid}${peca.id}`}
        data-reap-dialogo=""
        onClick={(e) => e.stopPropagation()}
      >
        <DialogTitle className="sr-only">{ajuste ? "Ajustar reaproveitamento" : "Reaproveitar"}</DialogTitle>
        <DialogDescription className="sr-only">Quantas unidades reaproveitar e de onde elas vêm</DialogDescription>
        <ModalHeader
          variant="confirm"
          compacto={isMobile}
          icon={Recycle}
          tint={TOM.esmeralda.text}
          title={ajuste ? "Ajustar reaproveitamento" : "Reaproveitar"}
          subtitle={`${peca.displayId ?? ""} · ${peca.type ?? ""} · ${q} un.`}
          onClose={aoFechar}
        />
        <div style={{ padding: isMobile ? "14px 16px 16px" : "16px 24px 20px", overflowY: "auto", flex: "1 1 auto", minHeight: 0, display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label htmlFor={`reap-qtd-${peca.id}`} className="reap-rotulo-obs" style={{ marginTop: 0 }}>
              {ajuste ? "Total reaproveitado" : "Quantas unidades reaproveitar"}
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <input
                id={`reap-qtd-${peca.id}`}
                type="number"
                min={minimo}
                max={maximo}
                value={quantidade}
                autoFocus
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => setQuantidade(Math.max(minimo, Math.min(maximo, parseInt(e.target.value) || 0)))}
                onKeyDown={(e) => { if (e.key === "Enter") confirmar(); }}
                data-testid={`input-reuse-qty-${sufixoDoTestid}${peca.id}`}
                className="grf-campo"
                style={{ width: 84, height: isMobile ? 44 : 38, padding: "0 10px", borderRadius: R.md, border: `1px solid ${T.bdark}`, fontSize: isMobile ? 16 : FS.strong, fontWeight: FW.forte, color: T.text, textAlign: "center", background: T.surface }}
              />
              <span style={{ fontSize: FS.body, color: T.second }}>de {maximo} {ajuste ? "un." : "un. ainda sem produzir"}</span>
            </div>
            <p className="reap-ajuda" style={{ color: T.second }}>
              {ajuste
                ? (resto === 0 ? "A peça inteira passa a ser reaproveitada." : `As outras ${resto} un. contam como produzidas.`)
                : quantidade >= maximo
                  ? "Nada destas unidades vai para a impressora."
                  : `As outras ${maximo - quantidade} un. seguem para produção.`}
            </p>
          </div>
          <EscolhaDaOrigem valor={origem} onChange={setOrigem} idBase={`reap-grafica-${sufixoDoTestid}${peca.id}`} isMobile={isMobile} desabilitado={carregando} />
        </div>
        <div className="reap-rodape" style={{ borderTop: `1px solid ${N.n3}`, background: T.bg, padding: isMobile ? "12px 16px calc(12px + env(safe-area-inset-bottom))" : "12px 24px" }}>
          <Botao tamanho={tamanho} onClick={aoFechar} aria-label="Cancelar reaproveitamento" style={{ flex: isMobile ? 1 : undefined }}>Cancelar</Botao>
          <Botao
            variante="primario"
            tom="esmeralda"
            tamanho={tamanho}
            icone={Recycle}
            carregando={carregando}
            disabled={falta || carregando}
            onClick={confirmar}
            title="Confirmar reaproveitamento"
            data-testid={`button-reuse-confirm-${sufixoDoTestid}${peca.id}`}
            style={{ flex: isMobile ? 2 : undefined }}
          >
            {carregando ? "Salvando…" : ajuste ? `Reaproveitar ${quantidade} de ${q}` : `Reaproveitar ${quantidade} un.`}
          </Botao>
        </div>
      </DialogContent>
    </Dialog>
  );
}
