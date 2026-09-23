// A CONFERÊNCIA EM LOTE — várias peças de uma vez, com a mesma foto. Um
// componente só (a entrega por peça está aposentada: quem entrega é o volume).
import { useEffect, useRef, useState } from "react";
import { CheckCircle, Package, PlusCircle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Botao } from "@/components/ui/botao";
import { ModalHeader, modalSurface, HIDE_NATIVE_CLOSE } from "@/components/modal-shell";
import { SeloKit } from "@/components/kit/selo-kit";
import { AvisoDoEstoqueNaPeca } from "@/components/consulta-de-estoque/aviso-na-grafica";
import { convertGCSUrlToLocalPath } from "@/lib/artePdfExport";
import { useIsMobile } from "@/hooks/use-mobile";
import { FONT, FS, FW, N, R, T, TOM } from "@/lib/theme";
import { isComplement } from "@/lib/saldo";
// Teclado virtual: o modal sobe junto com ele (ver o arquivo).
import { useAcompanharAreaVisivel } from "@/components/grafica/area-visivel";
// A lista dentro do diálogo entra por lotes (ver o arquivo).
import { SentinelaDaLista } from "@/components/grafica/lista-incremental";
import type { PecaDaFila } from "@/components/grafica/tipos";
import { CO } from "@/components/grafica/fila/aparencia";
import { LINHAS_POR_LOTE, parentDisplayIdOf } from "@/components/grafica/fila/regras";
import { PhotoPicker } from "./seletor-de-fotos";

export function BulkActionDialog({
  open, onClose, items, photos, onAddPhoto, onRemovePhoto, onPhotoError,
  notes, onNotesChange, isSubmitting, onConfirm, qtyFor,
}: {
  open: boolean;
  onClose: () => void;
  items: PecaDaFila[];
  photos: string[];
  onAddPhoto: (url: string) => void;
  onRemovePhoto: (url: string) => void;
  onPhotoError: (error: Error) => void;
  notes: string;
  onNotesChange: (v: string) => void;
  isSubmitting: boolean;
  onConfirm: () => void;
  qtyFor: (item: PecaDaFila) => number;
}) {
  const isMobileLote = useIsMobile();
  // Só CONFERÊNCIA: a entrega por peça está aposentada (quem entrega é o volume).
  const tint = TOM.ciano.text;
  // A FOTO LIBERA O BOTÃO.
  const canSubmit = photos.length > 0;
  const HeaderIcon = CheckCircle;
  const count = items.length;
  // "Todas (2.000)" e Continuar abria o diálogo com DUAS MIL linhas de uma vez
  // (miniatura, selos, descrição): o toque travava a tela justamente no último
  // passo do lote. A lista entra em lotes dentro da própria caixa rolável; o
  // título, o contador e o registro continuam valendo para TODAS as peças.
  const [pecasDesenhadas, setPecasDesenhadas] = useState(LINHAS_POR_LOTE);
  useEffect(() => { if (open) setPecasDesenhadas(LINHAS_POR_LOTE); }, [open]);
  const pecasNaLista = items.length > pecasDesenhadas ? items.slice(0, pecasDesenhadas) : items;
  // Teclado virtual aberto (observações): o modal encolhe para a área
  // visível e o rodapé com o Confirmar continua à vista (ver area-visivel.ts).
  const superficieRef = useRef<HTMLDivElement>(null);
  useAcompanharAreaVisivel(superficieRef, "centro", open && isMobileLote);
  // Celular: ≥ 12px para informação, 16px nos campos (abaixo disso o iOS dá
  // zoom na página ao focar) e 16px de margem interna (24 roubava largura).
  const fs = (n: number) => (isMobileLote ? Math.max(12, n) : n);
  const pad = isMobileLote ? 16 : 24;
  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent ref={superficieRef} className={HIDE_NATIVE_CLOSE} style={modalSurface(460)}>
        <DialogTitle className="sr-only">Confirmar Conferência em Lote</DialogTitle>
        <DialogDescription className="sr-only">Confira várias peças de uma vez, com a mesma foto</DialogDescription>

        <ModalHeader
          icon={HeaderIcon}
          tint={tint}
          title="Conferência em lote"
          subtitle={`${count} peça${count !== 1 ? "s" : ""} selecionada${count !== 1 ? "s" : ""}`}
          onClose={onClose}
        />

        {/* Body — rola dentro do modal (mesmo padrão do modal individual): o
            modalSurface corta com overflow hidden, e no celular com várias
            fotos o botão Confirmar saía da tela sem caminho até ele.

            ALTURA: era `calc(88vh - 96px)` — um desconto FIXO, com 96 chutado
            para o cabeçalho (que mede 93). A conta ficava 93 + 88vh − 96, ou
            seja `88vh − 3`, e isso por acaso cabia no teto de `100vh − 48`
            sempre que a janela passava de 375px de altura: medi 389px em 445 e
            947px em 1080, contra 397 e 1032 disponíveis. Este modal NÃO cortava.
            Mesmo assim o desconto sai: ele acerta por coincidência aritmética e
            quebra ao primeiro subtítulo que quebre em duas linhas. Com o teto no
            DialogContent (via `modalSurface`), `flex: 1 1 auto` + `minHeight: 0`
            entrega a este corpo exatamente o que sobrar do cabeçalho medido. */}
        <div style={{ padding: `20px ${pad}px`, display: "flex", flexDirection: "column", gap: 18, background: T.bg, overflowY: "auto", flex: "1 1 auto", minHeight: 0 }}>
          <PhotoPicker
            dense
            photos={photos}
            onAdd={onAddPhoto}
            onRemove={onRemovePhoto}
            onError={onPhotoError}
            label="Foto da conferência *"
            hint="· mesma para todas as peças"
          />

          {/* Sem escolha de tubo (dono, 21/09): conferir é só conferir com
              foto. O tubo entra depois, no "Embalar" da peça conferida (ou no
              "Embalar em lote"). */}

          {/* Observações */}
          <div>
            <label style={{ display: "block", fontSize: fs(FS.small), fontWeight: FW.forte, color: T.apoio, marginBottom: 8 }}>
              Observações <span style={{ fontWeight: FW.corpo, color: T.second }}>(opcional)</span>
            </label>
            <textarea
              value={notes}
              onChange={e => onNotesChange(e.target.value)}
              placeholder="Ex.: conferido contra o romaneio, sem avarias..."
              rows={2}
              style={{ width: "100%", minHeight: 64, boxSizing: "border-box", padding: "12px 14px", background: T.surface, border: `1.5px solid ${T.border}`, borderRadius: 12, fontSize: isMobileLote ? 16 : 13, fontFamily: "inherit", color: T.text, resize: "none", lineHeight: 1.5 }}
            />
          </div>

          {/* Peças selecionadas — com a ARTE e a DESCRIÇÃO de cada uma: é a
              última conferência antes de registrar em lote, e "Banner · 3 un."
              repetido cinco vezes não diz ao operador o que ele está
              confirmando. maxHeight maior porque a linha agora tem miniatura. */}
          <div>
            <label style={{ display: "block", fontSize: fs(FS.small), fontWeight: FW.forte, color: T.apoio, marginBottom: 8 }}>
              Peças selecionadas <span style={{ fontWeight: FW.corpo, color: T.second }}>({count})</span>
            </label>
            <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, maxHeight: 232, overflowY: "auto" }}>
              {pecasNaLista.map((item, idx: number) => (
                <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderBottom: idx < count - 1 ? `1px solid ${N.n2}` : "none" }}>
                  <div style={{
                    width: 44, height: 44, flexShrink: 0, borderRadius: 8, overflow: "hidden",
                    border: `1px solid ${T.border}`, backgroundColor: T.bg,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {item.approvalThumbUrl ? (
                      <img
                        src={convertGCSUrlToLocalPath(item.approvalThumbUrl)}
                        alt=""
                        loading="lazy" decoding="async"
                        style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "block" }}
                        onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                      />
                    ) : (
                      <Package aria-hidden="true" style={{ width: 16, height: 16, color: T.second }} />
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* flexWrap: código + selo Kit + "Compl. de #0062" não cabiam
                        numa linha em 360px e empurravam a caixa para o lado. */}
                    <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", rowGap: 2 }}>
                      <span style={{ fontFamily: FONT.mono, fontSize: fs(11), fontWeight: 700, color: tint, flexShrink: 0 }}>{item.displayId}</span>
                      <SeloKit peca={item} style={{ flexShrink: 0 }} />
                      <AvisoDoEstoqueNaPeca peca={item} style={{ flexShrink: 0 }} />
                      {/* O complemento tem a MESMA arte, o mesmo tipo e quase a
                          mesma descrição da peça original: numa conferência em
                          lote com as duas selecionadas, sem este selo as duas
                          linhas são indistinguíveis — e é aqui que o operador
                          dá o último olhar antes de registrar tudo de uma vez. */}
                      {isComplement(item) && (
                        <span
                          title={item.complementReason ? `Complemento — motivo: ${item.complementReason}` : "Peça complementar (aumento de quantidade)"}
                          data-testid={`badge-complemento-lote-${item.id}`}
                          style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 3, backgroundColor: CO.solidBg, color: CO.solidText, borderRadius: R.sm, padding: "1px 6px", fontSize: fs(FS.micro), fontWeight: FW.rotulo, whiteSpace: "nowrap" }}
                        >
                          <PlusCircle style={{ width: 9, height: 9 }} />
                          Compl. de {parentDisplayIdOf(item)}
                        </span>
                      )}
                      <span style={{ fontSize: 13, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{item.type}</span>
                    </div>
                    {item.description && item.description !== item.type && (
                      <div style={{ fontSize: 12, color: T.second, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {item.description}
                      </div>
                    )}
                  </div>
                  <span style={{ fontSize: fs(11), fontWeight: 700, color: T.second, flexShrink: 0 }}>{qtyFor(item)} un.</span>
                </div>
              ))}
              <SentinelaDaLista
                mostradas={pecasNaLista.length}
                total={count}
                lote={LINHAS_POR_LOTE}
                onMais={() => setPecasDesenhadas(n => n + LINHAS_POR_LOTE)}
                compacto
              />
            </div>
          </div>

          {/* Rodapé GRUDADO no fim do corpo rolável: com várias fotos e a lista
              de peças, o Confirmar ficava abaixo da dobra no celular e era
              preciso rolar para achá-lo depois de tirar a foto — o mesmo
              conserto que os modais individuais já tinham (modalActionsStyle). */}
          {/* Recorte seguro em LONGOS (paddingBottom): o atalho `padding` com
              env() some inteiro no parser do jsdom e o teste não o enxergaria. */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, position: "sticky", bottom: -20, margin: `0 -${pad}px -20px`, paddingTop: 12, paddingLeft: pad, paddingRight: pad, paddingBottom: "calc(12px + env(safe-area-inset-bottom))", background: T.bg, borderTop: `1px solid ${T.border}` }}>
            {/* Por que o Conferir está apagado — à vista, não num title. */}
            {!canSubmit && !isSubmitting && (
              <p data-testid="motivo-conferir-lote" style={{ margin: 0, fontSize: fs(FS.meta), color: T.apoio }}>Anexe a foto da conferência para liberar o botão.</p>
            )}
            <div style={{ display: "flex", gap: 10 }}>
              <Botao tamanho="toque" onClick={onClose} style={{ flex: 1, minHeight: 48 }}>
                Cancelar
              </Botao>
              {/* O rótulo diz o RESULTADO do toque ("Conferir 5 peças"), não
                  um "Confirmar" genérico — é a última leitura antes de gravar. */}
              <Botao
                variante="primario"
                tamanho="toque"
                icone={HeaderIcon}
                carregando={isSubmitting}
                onClick={onConfirm}
                disabled={!canSubmit}
                style={{ flex: 2, minHeight: 48 }}
              >
                {isSubmitting ? `Conferindo ${count} peça${count !== 1 ? "s" : ""}…` : `Conferir ${count} peça${count !== 1 ? "s" : ""}`}
              </Botao>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
