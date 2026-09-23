// ── 3 · METADADOS NUMA LINHA ─────────────────────────────────────────────────
// Blocos separados por filetes, cada um encolhendo (`min-width: 0`), com o
// VALOR quebrando em até duas linhas — material e acabamento são o que se
// confere, e cortados numa só o resto existiria só no title, que o toque não
// mostra. No celular a linha rola na horizontal: cortar em silêncio é o único
// desfecho proibido. Só props, sem hook: mora dentro do FreezeWhileClosing.
import type { RefObject } from "react";
import { Copy, X } from "lucide-react";
import { Botao } from "@/components/ui/botao";
import { alvo } from "@/hooks/use-mobile";
import { motivoAcaoBloqueada } from "@/lib/status";
import type { SeloPecaEventoFinalizado } from "@/lib/status";
import { T, TOM, FS, R } from "@/lib/theme";
import { TI } from "./regras";
import type { PecaDaRevisao } from "./tipos";

export function FichaMetadados({
  selectedItem, isMobile, dedo, fonteDeCampo, seloSelecionado,
  editingQuantity, setEditingQuantity, quantityValue, setQuantityValue, quantityInputRef,
  salvandoQuantidade, aoSalvarQuantidade, aoCopiarCaminho,
}: {
  selectedItem: PecaDaRevisao | null;
  isMobile: boolean;
  dedo: boolean;
  fonteDeCampo: number;
  seloSelecionado: SeloPecaEventoFinalizado | null;
  editingQuantity: boolean;
  setEditingQuantity: (v: boolean) => void;
  quantityValue: number;
  setQuantityValue: (v: number) => void;
  quantityInputRef: RefObject<HTMLInputElement>;
  salvandoQuantidade: boolean;
  aoSalvarQuantidade: () => void;
  aoCopiarCaminho: (caminho: string) => void;
}) {
  return (
    <div style={{ flexShrink: 0, borderTop: `1px solid ${T.border}`, backgroundColor: T.surface, padding: isMobile ? "8px 12px" : "8px 20px", display: "flex", alignItems: "center", overflowX: isMobile ? "auto" : "hidden" }}>
      {[
        { label: "Material", value: selectedItem?.material || "—" },
        { label: "Acabamento", value: selectedItem?.finish || "—" },
        { label: "Dimensões (ARQ.)", value: selectedItem?.fileWidth && selectedItem?.fileHeight ? `${selectedItem.fileWidth}×${selectedItem.fileHeight}` : "—" },
        { label: "M²", value: selectedItem?.calculatedM2 || "—" },
      ].map(({ label, value }, i) => (
        <div key={label} style={{ flex: "1 1 0", minWidth: isMobile ? 76 : 0, padding: "2px 14px 2px " + (i === 0 ? "0" : "14px"), borderLeft: i === 0 ? "none" : `1px solid ${T.border}` }}>
          <p style={{ fontSize: FS.micro, color: T.apoio, textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.06em", margin: 0, whiteSpace: "nowrap" }}>{label}</p>
          <p title={String(value)} style={{ fontSize: FS.body, fontWeight: 700, color: T.text, margin: "2px 0 0", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", overflowWrap: "anywhere", lineHeight: 1.3 }}>{value}</p>
        </div>
      ))}

      {/* Quantidade — editável por teclado (role="button" + Enter/Espaço).
          Em evento finalizado deixa de ser botão: PATCH /api/items/:id passa
          pela guarda, então abrir o campo só levaria a um 409 depois de
          digitar. O rótulo "· editar" sai junto — oferecer e negar é pior do
          que não oferecer. */}
      <div
        role={editingQuantity || seloSelecionado ? undefined : "button"}
        tabIndex={editingQuantity || seloSelecionado ? undefined : 0}
        aria-label={seloSelecionado ? undefined : "Editar quantidade"}
        style={{ flex: "1 1 0", minWidth: isMobile ? 104 : 96, padding: "2px 0 2px 14px", borderLeft: `1px solid ${T.border}`, cursor: seloSelecionado ? "default" : "pointer" }}
        onClick={() => {
          if (!editingQuantity && !seloSelecionado) {
            setEditingQuantity(true);
            setTimeout(() => quantityInputRef.current?.select(), 50);
          }
        }}
        onKeyDown={e => {
          if (editingQuantity || seloSelecionado) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setEditingQuantity(true);
            setTimeout(() => quantityInputRef.current?.select(), 50);
          }
        }}
        title={seloSelecionado
          ? motivoAcaoBloqueada(seloSelecionado.motivo, "mudar a quantidade")
          : "Clique para editar a quantidade"}
      >
        <p style={{ fontSize: FS.micro, color: T.apoio, textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.06em", margin: 0, display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}>
          Qtd
          {!seloSelecionado && (
            <span style={{ fontSize: FS.micro, color: T.accentText, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em" }}>· editar</span>
          )}
        </p>
        {editingQuantity ? (
          <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }} onClick={e => e.stopPropagation()}>
            <input
              ref={quantityInputRef}
              type="number"
              min={1}
              value={quantityValue}
              onChange={e => setQuantityValue(Math.max(1, parseInt(e.target.value) || 1))}
              onKeyDown={e => {
                if (e.key === "Enter") {
                  aoSalvarQuantidade();
                }
                if (e.key === "Escape") {
                  setQuantityValue(selectedItem?.quantity ?? 1);
                  setEditingQuantity(false);
                }
              }}
              style={{
                width: 52, height: alvo(28, dedo), padding: "2px 6px", fontSize: fonteDeCampo, fontWeight: 700,
                border: `1.5px solid ${T.accent}`, borderRadius: R.sm, boxSizing: "border-box",
                color: TI.text, background: TOM.laranja.bg,
              }}
              data-testid="input-quantity-edit"
              autoFocus
            />
            {/* OK e ✕ com alvo de 44 no toque: pequenos e colados, errar o
                dedo descartava a edição. */}
            <Botao
              variante="primario"
              tamanho={dedo ? "toque" : "sm"}
              carregando={salvandoQuantidade}
              onClick={aoSalvarQuantidade}
              style={{ padding: "0 10px" }}
              data-testid="button-confirm-quantity"
              aria-label="Salvar a quantidade"
            >
              OK
            </Botao>
            <Botao
              variante="fantasma"
              tamanho={dedo ? "toque" : "sm"}
              icone={X}
              onClick={() => { setQuantityValue(selectedItem?.quantity ?? 1); setEditingQuantity(false); }}
              style={{ padding: 0, minWidth: alvo(32, dedo) }}
              data-testid="button-cancel-quantity"
              aria-label="Cancelar a edição da quantidade"
            />
          </div>
        ) : (
          <p style={{ fontSize: FS.body, fontWeight: 700, color: T.text, margin: "2px 0 0" }}>
            {selectedItem?.quantity ?? "—"}x
          </p>
        )}
      </div>

      {/* Copiar caminho da rede — o único gesto útil para o TIF no servidor
          local; "Abrir" para caminho de rede é promessa que nunca funciona. */}
      {selectedItem?.finalFileUrl && (
        <Botao
          variante="secundario"
          tamanho={dedo ? "toque" : "sm"}
          icone={Copy}
          title={"Copiar caminho: " + selectedItem.finalFileUrl}
          aria-label="Copiar caminho do arquivo final"
          onClick={() => aoCopiarCaminho(selectedItem.finalFileUrl!)}
          style={{ flexShrink: 0, marginLeft: 14, minWidth: alvo(32, dedo) }}
        >
          {!isMobile && "Copiar caminho da rede"}
        </Botao>
      )}
    </div>
  );
}
