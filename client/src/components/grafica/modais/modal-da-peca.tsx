// O MODAL DA PEÇA: imprimir (o formulário é o MESMO da aba Máquinas) ou
// conferir com foto (e, quando a conferência fecha a peça, já embalar).
import type React from "react";
import { AlertCircle, Calendar, CheckCircle, Play, PlusCircle, Printer, Search } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Botao } from "@/components/ui/botao";
import { ModalHeader, modalSurface, HIDE_NATIVE_CLOSE } from "@/components/modal-shell";
import { StatusPill } from "@/components/status-pill";
import { SeloKit } from "@/components/kit/selo-kit";
import { AvisoDoEstoqueNaPeca } from "@/components/consulta-de-estoque/aviso-na-grafica";
import { convertGCSUrlToLocalPath } from "@/lib/artePdfExport";
import { FONT, FS, FW, N, R, T, TOM } from "@/lib/theme";
import { statusDeExibicao } from "@shared/molde";
import { semImpressora } from "@shared/reserva-de-impressora";
import { ocupacaoDasImpressoras, estaEmImpressao } from "@shared/progresso-da-impressao";
import {
  isInProd, qtyOf, producedOf, conferredOf, reusedTotalOf, m2ToProduce, remainingProduce, remainingConfer, isComplement,
} from "@/lib/saldo";
import { FormularioDeImpressao, cabecalhoDoModalDeImpressao } from "@/components/grafica/modal-impressao";
import type { PecaDaFila } from "@/components/grafica/tipos";
import type { ModalDaPecaEstado } from "@/components/grafica/hooks/use-modal-da-peca";
import { CO, corDaAcao } from "@/components/grafica/fila/aparencia";
import { fmtDataHora, parentDisplayIdOf } from "@/components/grafica/fila/regras";
import { PhotoPicker } from "./seletor-de-fotos";

export function ModalDaPeca({ modal, pecasDoServidor, oferecerEmbalarJunto, isMobile, padModal, fsMin }: {
  modal: ModalDaPecaEstado;
  /** A fila inteira: quem ocupa cada impressora sai dela. */
  pecasDoServidor: PecaDaFila[];
  oferecerEmbalarJunto: (item: PecaDaFila, qtd: number) => boolean;
  isMobile: boolean;
  /** Margem interna do corpo dos modais (16 no celular, 24 no resto). */
  padModal: number;
  /** Celular: nenhuma informação abaixo de 12px. */
  fsMin: (n: number) => number;
}) {
  const {
    selectedItem, setSelectedItem, modalType, setModalType, conferQty, setConferQty, jaEmbalar, setJaEmbalar,
    conferindoEEmbalando, fotosSubindo, setFotosSubindo, photos, removePhoto, modalNotes, setModalNotes,
    chaveDoModal, fotoDaAbertura, onPhotoError, mutacoesDeImpressao, conferMutation, modalPecaRef,
    handleSubmitConference, iniciandoResto,
  } = modal;
  // Barra de ações dos modais. No celular o conteúdo (arte grande + specs +
  // fotos + observação) passa da altura da tela, e o botão de confirmar ficava
  // no fim da rolagem: depois de tirar a foto era preciso procurar por ele.
  //
  // COLADA NA BORDA DE BAIXO, com o recorte seguro. Era `bottom: 0` dentro de
  // um corpo com 24px de padding: o sticky respeita o padding do scrollport,
  // então a barra parava 24px ACIMA da borda e o conteúdo rolava visível por
  // baixo dela; e sem `env(safe-area-inset-bottom)` o Confirmar encostava no
  // home indicator do iPhone. `bottom` e margens negativas iguais ao padding do
  // corpo (o mesmo conserto do diálogo de lote). É a ÚLTIMA peça do formulário:
  // o aviso "falta a foto" mora dentro dela, em vez de depois.
  const modalActionsStyle: React.CSSProperties = {
    display: "flex", flexWrap: "wrap", gap: 10,
    position: "sticky", bottom: -padModal,
    backgroundColor: T.surface,
    marginTop: -4, marginLeft: -padModal, marginRight: -padModal, marginBottom: -padModal,
    paddingTop: 12, paddingLeft: padModal, paddingRight: padModal,
    paddingBottom: `calc(12px + env(safe-area-inset-bottom))`,
    borderTop: `1px solid ${N.n3}`,
    boxShadow: "0 -8px 12px -8px rgba(28,25,23,0.18)",
  };

  const renderNotesField = (placeholder: string) => (
    <div>
      <label htmlFor="input-observacao-modal" style={{ display: "block", fontSize: fsMin(FS.small), fontWeight: FW.forte, color: T.apoio, marginBottom: 8 }}>
        Observação <span style={{ color: T.second, fontWeight: FW.corpo }}>(opcional)</span>
      </label>
      <textarea
        id="input-observacao-modal"
        value={modalNotes}
        onChange={e => setModalNotes(e.target.value)}
        placeholder={placeholder}
        rows={2}
        data-testid="input-notes"
        style={{ width: "100%", minHeight: 64, boxSizing: "border-box", padding: "10px 14px", backgroundColor: N.n3, border: "1px solid transparent", borderRadius: 8, fontSize: isMobile ? 16 : 13, color: T.text, resize: "vertical", fontFamily: "inherit" }}
      />
    </div>
  );

  // CONFERIR NO CELULAR (revisão de 24/09): arte (240px) + ficha (~300px)
  // empurravam "Tirar Foto" para baixo da dobra — o passo de quem está com a
  // peça na mão pedia rolagem. No celular, na conferência, a ficha desce para
  // DENTRO do formulário, depois das fotos e antes do rodapé fixo (que precisa
  // ser a última peça do formulário para seguir colado embaixo). Quem é a peça
  // continua no topo: o subtítulo do cabeçalho leva o código e o tipo.
  const fichaDepoisDasFotos = isMobile && modalType === "conference";
  const fichaDaPeca = selectedItem ? (
    <div style={{ backgroundColor: N.n2, borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{ backgroundColor: T.surface, borderRadius: 8, padding: 8, boxShadow: "0 1px 4px rgba(0,0,0,0.08)", flexShrink: 0 }}>
          {modalType === "production"
            ? <Printer style={{ width: 20, height: 20, color: T.accent }} />
            : <CheckCircle style={{ width: 20, height: 20, color: TOM.ciano.text }} />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 3 }}>
            <span style={{ display: "inline-flex", alignItems: "center", flexWrap: "wrap", gap: 6, minWidth: 0 }}>
              <span style={{ fontFamily: FONT.display, fontWeight: 700, fontSize: isMobile ? 16 : 13, color: selectedItem.isReuse ? TOM.esmeralda.text : T.accentText }}>{selectedItem.displayId}</span>
              <SeloKit peca={selectedItem} style={{ flexShrink: 0 }} />
              <AvisoDoEstoqueNaPeca peca={selectedItem} style={{ flexShrink: 0 }} />
              {/* Produzir/conferir/entregar um complemento é registrar
                  um LOTE SEPARADO: o modal precisa dizer isso, senão
                  o operador acha que está lançando na peça original. */}
              {isComplement(selectedItem) && (
                <span style={{ backgroundColor: CO.solidBg, color: CO.solidText, borderRadius: R.sm, padding: "1px 6px", fontSize: fsMin(FS.micro), fontWeight: FW.rotulo, whiteSpace: "nowrap" }}>
                  Compl. de {parentDisplayIdOf(selectedItem)}
                </span>
              )}
            </span>
            <StatusPill status={statusDeExibicao(selectedItem)} size="sm" showDot={false} />
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{selectedItem.type}</div>
          {selectedItem.description && selectedItem.description !== selectedItem.type && (
            <div style={{ fontSize: 13, color: T.second, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selectedItem.description}</div>
          )}
          {selectedItem.event?.name && (
            <div style={{ fontSize: 13, color: T.second, marginTop: 4, display: "flex", alignItems: "center", gap: 5 }}>
              <Calendar style={{ width: 11, height: 11, flexShrink: 0 }} />
              {selectedItem.event.name}
            </div>
          )}
        </div>
      </div>

      {/* Grade de specs */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <div style={{ background: T.surface, borderRadius: 8, padding: '8px 10px' }}>
          <div style={{ fontSize: fsMin(FS.small), fontWeight: FW.forte, color: T.apoio, marginBottom: 3 }}>Material</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{selectedItem.material || '—'}</div>
          {selectedItem.visualWidth && (
            <div style={{ fontSize: fsMin(11), color: T.second, marginTop: 1 }}>{selectedItem.visualWidth} × {selectedItem.visualHeight}m</div>
          )}
        </div>
        <div style={{ background: T.surface, borderRadius: 8, padding: '8px 10px' }}>
          <div style={{ fontSize: fsMin(FS.small), fontWeight: FW.forte, color: T.apoio, marginBottom: 3 }}>Acabamento</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{selectedItem.finish || '—'}</div>
          {Number(selectedItem.calculatedM2) > 0 && (
            <div style={{ fontSize: fsMin(11), color: T.second, marginTop: 1 }}>{m2ToProduce(selectedItem).toFixed(2)} m²</div>
          )}
        </div>
        <div style={{ background: T.surface, borderRadius: 8, padding: '8px 10px' }}>
          <div style={{ fontSize: fsMin(FS.small), fontWeight: FW.forte, color: T.apoio, marginBottom: 2 }}>Quantidade</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: T.text, fontFamily: FONT.display, lineHeight: 1 }}>{qtyOf(selectedItem)}<span style={{ fontSize: fsMin(11), fontWeight: 500, color: T.second, marginLeft: 3 }}>un.</span></div>
          {selectedItem.isReuse && <div style={{ fontSize: fsMin(FS.small), color: TOM.esmeralda.text, marginTop: 2, fontWeight: FW.medio }}>Reaproveitado</div>}
        </div>
        {/* Tile de contexto — nos dois tipos. A produção era o
            único modal que nunca dizia quanto já foi produzido, e é
            justamente o único cujo campo é ABSOLUTO: sem este número
            na tela, quem digitava "o que fez hoje" apagava o resto e
            não havia nada, em lugar nenhum, mostrando o valor
            anterior. Ciano único #0e7490 (5,36:1); #0891b2 dava
            3,68:1 em 18px/800. */}
        {(modalType === "conference" || modalType === "production") && (
          <div style={{
            background: modalType === "conference" ? TOM.ciano.bg : N.n2,
            borderRadius: 8, padding: '8px 10px',
            border: `1px solid ${modalType === "conference" ? TOM.ciano.border : T.bdark}`,
          }}>
            <div style={{ fontSize: fsMin(FS.small), fontWeight: FW.forte, color: modalType === "conference" ? TOM.ciano.text : T.apoio, marginBottom: 2 }}>
              {modalType === "conference" ? "A Conferir" : (isInProd(selectedItem) && !iniciandoResto ? "Na impressora" : "A imprimir")}
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: modalType === "conference" ? TOM.ciano.text : T.text, fontFamily: FONT.display, lineHeight: 1 }}>
              {modalType === "conference" ? remainingConfer(selectedItem)
                : iniciandoResto ? semImpressora(selectedItem) : remainingProduce(selectedItem)}<span style={{ fontSize: fsMin(11), fontWeight: 500, marginLeft: 3 }}>un.</span>
            </div>
            {modalType === "conference" && conferredOf(selectedItem) > 0 && (
              <div style={{ fontSize: fsMin(FS.small), color: TOM.ciano.text, marginTop: 2 }}>{conferredOf(selectedItem)} já conferida{conferredOf(selectedItem) !== 1 ? 's' : ''}</div>
            )}
            {modalType === "production" && (
              <div data-testid="text-ja-produzidas" style={{ fontSize: fsMin(FS.small), color: T.apoio, marginTop: 2 }}>
                {producedOf(selectedItem)} já impressa{producedOf(selectedItem) !== 1 ? 's' : ''} de {qtyOf(selectedItem)}
                {reusedTotalOf(selectedItem) > 0 && ` · ${reusedTotalOf(selectedItem)} reaproveitada${reusedTotalOf(selectedItem) !== 1 ? 's' : ''}`}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Motivo do aumento — quem está com a peça na mão lê aqui por
          que este lote existe, antes de mandar para a impressora. */}
      {isComplement(selectedItem) && selectedItem.complementReason && (
        <div style={{ background: CO.bg, border: `1px solid ${CO.border}`, borderRadius: 8, padding: '8px 10px', display: 'flex', gap: 7, alignItems: 'flex-start' }}>
          <PlusCircle aria-hidden="true" style={{ width: 12, height: 12, color: CO.text, flexShrink: 0, marginTop: 2 }} />
          <span style={{ fontSize: 13, color: CO.textStrong, lineHeight: 1.4 }}>
            <strong>
              Aumento pedido{selectedItem.complementRequestedBy ? ` por ${selectedItem.complementRequestedBy}` : ""}
            </strong>
            {selectedItem.complementRequestedAt ? ` (${fmtDataHora(selectedItem.complementRequestedAt)})` : ""}: {selectedItem.complementReason}
          </span>
        </div>
      )}

      {/* Observações */}
      {selectedItem.observations && (
        <div style={{ background: TOM.alerta.bg, border: `1px solid ${TOM.alerta.border}`, borderRadius: 8, padding: '8px 10px', display: 'flex', gap: 7, alignItems: 'flex-start' }}>
          <AlertCircle style={{ width: 12, height: 12, color: TOM.alerta.text, flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 13, color: TOM.alerta.text, lineHeight: 1.4 }}>{selectedItem.observations}</span>
        </div>
      )}
    </div>
  ) : null;

  return (
    <Dialog open={!!selectedItem && !!modalType} onOpenChange={open => { if (!open) { setSelectedItem(null); setModalType(null); } }}>
      <DialogContent ref={modalPecaRef} className={HIDE_NATIVE_CLOSE} style={modalSurface(468)}>
        <DialogTitle className="sr-only">
          {modalType === "production" ? "Impressão da peça" : "Conferir peça"}
        </DialogTitle>
        <DialogDescription className="sr-only">
          {modalType === "production" ? "Inicie a impressão ou informe quantas unidades já saíram da impressora"
            : "Anexe a foto da conferência e confirme a quantidade"}
        </DialogDescription>

        {/* rgba(255,255,255,0.4) media ~3.9:1 sobre o cabeçalho escuro — a
            legenda que diz o que fazer era a coisa menos legível do modal. */}
        {/* `tint` na COR DA AÇÃO. Os três tipos recebiam T.accent, então a
            conferência — ciano em toda a tela — abria com um ladrilho laranja,
            a cor da entrega: por um instante some a certeza de ter aberto a
            coisa certa, um instante antes de uma ação irreversível.
            O subtítulo da produção diz o contrato do campo: ele grava o TOTAL,
            e "Continuar" é exatamente a palavra que ensina a ler ao contrário. */}
        <ModalHeader
          icon={modalType === "production" ? Play : CheckCircle}
          tint={modalType === "conference" ? TOM.ciano.text : T.text}
          title={modalType === "production"
            ? cabecalhoDoModalDeImpressao(selectedItem).title
            : "Conferir peça"}
          subtitle={modalType === "production"
            ? cabecalhoDoModalDeImpressao(selectedItem).subtitle
            : fichaDepoisDasFotos && selectedItem
              ? `${selectedItem.displayId} · ${selectedItem.type} — compare com a arte e tire a foto`
              : "Compare a peça pronta com a arte e tire a foto"}
          onClose={() => { setSelectedItem(null); setModalType(null); }}
        />

        {/* ── Corpo ── */}
        {/* ALTURA: era `calc(88vh - 112px)`, outro desconto FIXO (112 chutado
            para um cabeçalho que mede 93). Dava `88vh − 19` de modal, que cabe
            no teto de `100vh − 48` em qualquer janela acima de ~242px — este
            modal NÃO cortava. O desconto sai pelo mesmo motivo do modal em
            lote acima: acerta por coincidência e quebra assim que o subtítulo
            ganhar uma linha. Com o teto no DialogContent (via `modalSurface`),
            `flex: 1 1 auto` + `minHeight: 0` dá a este corpo o que sobrar do
            cabeçalho medido pelo navegador. */}
        <div style={{ padding: padModal, display: "flex", flexDirection: "column", gap: isMobile ? 16 : 20, overflowY: "auto", flex: "1 1 auto", minHeight: 0 }}>

          {/* Arte aprovada em destaque — na conferência é o que a pessoa
              compara com a peça na mão, quase sempre pelo celular. Precisa ser
              a maior coisa da tela, não uma miniatura ao lado do texto. */}
          {selectedItem?.approvalThumbUrl && modalType !== "production" && (
            <a
              href={convertGCSUrlToLocalPath(selectedItem.approvalThumbUrl)}
              target="_blank"
              rel="noopener noreferrer"
              title="Tocar para abrir em tamanho real"
              data-testid="thumb-approved-art"
              style={{
                display: "block", position: "relative", width: "100%",
                // Nunca mais que um terço da tela: em 640px de altura os 240
                // fixos empurravam a foto e o Confirmar para fora da dobra.
                height: isMobile ? "min(240px, 34dvh)" : 200,
                // O corpo do modal é um flex column com rolagem: sem
                // flexShrink 0 este bloco era espremido até uma linha fina
                // quando o conteúdo passava da altura máxima.
                flexShrink: 0,
                borderRadius: 12, overflow: "hidden",
                backgroundColor: T.surface, border: `1px solid ${T.border}`,
              }}
            >
              <img loading="lazy" decoding="async" src={convertGCSUrlToLocalPath(selectedItem.approvalThumbUrl)}
                alt="Arte aprovada"
                style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
                onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
              />
              <span style={{ position: "absolute", top: 8, left: 8, backgroundColor: "rgba(28,25,23,0.78)", color: T.surface, fontSize: fsMin(FS.small), fontWeight: FW.rotulo, padding: "4px 8px", borderRadius: R.sm }}>
                Arte aprovada
              </span>
              <span style={{ position: "absolute", bottom: 8, right: 8, backgroundColor: "rgba(28,25,23,0.78)", color: T.surface, fontSize: fsMin(FS.small), fontWeight: FW.forte, padding: "4px 8px", borderRadius: R.sm, display: "flex", alignItems: "center", gap: 4 }}>
                <Search aria-hidden="true" style={{ width: 12, height: 12 }} /> Ampliar
              </span>
            </a>
          )}

          {/* Card de identificação — no celular, na conferência, desce para
              depois das fotos (ver `fichaDepoisDasFotos`). */}
          {selectedItem && !fichaDepoisDasFotos && fichaDaPeca}

          {/* ── FORM: IMPRESSÃO — compartilhado com a aba Máquinas ── */}
          {/* key={id}: a máquina e a quantidade nascem da peça dentro do
              formulário; trocar a peça remonta limpo, sem efeito de sync. */}
          {selectedItem && modalType === "production" && (
            <FormularioDeImpressao
              // A etapa entra na chave: a peça que muda de "liberada" para "em impressão"
              // (ou volta) enquanto o modal está aberto remonta o formulário certo.
              key={`${selectedItem.id}:${iniciandoResto ? "resto" : ""}:${isInProd(selectedItem) ? "imp" : "lib"}`}
              parteAIniciar={iniciandoResto ? { quantidade: semImpressora(selectedItem), daReserva: false } : null}
              item={selectedItem}
              // Uma peça por vez por impressora: quem ocupa cada impressora sai
              // de ocupacaoDasImpressoras — a MESMA régua (e o mesmo formato)
              // que a aba Máquinas passa ao modal; com o ocupante inteiro o
              // modal oferece "Imprimir esta no lugar". O 409 do servidor
              // continua sendo a autoridade.
              ocupadas={ocupacaoDasImpressoras(pecasDoServidor.filter(estaEmImpressao), selectedItem.id)}
              onFechar={() => { setSelectedItem(null); setModalType(null); }}
              padModal={padModal}
              mutacoes={mutacoesDeImpressao}
            />
          )}

          {selectedItem && modalType === "conference" && (() => {
            const faltam = remainingConfer(selectedItem);
            const aindaNaImpressora = Math.max(0, qtyOf(selectedItem) - conferredOf(selectedItem) - faltam);
            const embalarJunto = oferecerEmbalarJunto(selectedItem, conferQty);
            const ocupado = conferMutation.isPending || conferindoEEmbalando;
            const bloqueado = ocupado || !photos.length || fotosSubindo > 0;
            const rotulo = conferindoEEmbalando && !conferMutation.isPending ? "Embalando…"
              : conferMutation.isPending ? "Conferindo…"
              : fotosSubindo > 0 ? "Enviando foto…"
              : !photos.length ? "Falta a foto"
              : embalarJunto && jaEmbalar ? `Conferir e embalar ${conferQty} un.` : `Conferir ${conferQty} un.`;
            return (
            <form onSubmit={handleSubmitConference} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {!fichaDepoisDasFotos && (
                <p style={{ fontSize: 13, color: T.apoio, margin: 0 }}>
                  Confira a peça e anexe a foto. Pode conferir parcialmente — depois é só conferir o restante.
                </p>
              )}
              {aindaNaImpressora > 0 && (
                <p data-testid="aviso-conferir-so-impressas" style={{ fontSize: 13, color: TOM.ciano.text, margin: fichaDepoisDasFotos ? 0 : "-8px 0 0", lineHeight: 1.4 }}>
                  Só dá para conferir o que já saiu da impressora: {aindaNaImpressora} un. ainda não {aindaNaImpressora !== 1 ? "foram impressas" : "foi impressa"}.
                </p>
              )}
              {faltam > 1 && (
                <div>
                  <label htmlFor="input-qtd-conferir" style={{ display: "block", fontSize: fsMin(FS.small), fontWeight: FW.forte, color: T.apoio, marginBottom: 8 }}>
                    Quantidade a conferir agora <span style={{ color: T.second, fontWeight: FW.corpo }}>· já conferido {conferredOf(selectedItem)}/{qtyOf(selectedItem)}, disponíveis {faltam}</span>
                  </label>
                  <input id="input-qtd-conferir" type="number" inputMode="numeric" pattern="[0-9]*" min={1} max={faltam} value={conferQty}
                    onChange={e => setConferQty(Math.max(1, Math.min(faltam, parseInt(e.target.value) || 1)))}
                    style={{ width: "100%", boxSizing: "border-box", minHeight: 44, padding: "10px 14px", backgroundColor: N.n3, border: "1px solid transparent", borderRadius: 8, fontSize: 16, fontWeight: 700, color: T.text }} />
                </div>
              )}
              {/* A foto que termina de subir depois de o modal fechar ou mudar
                  de peça é descartada (chave da abertura). */}
              <PhotoPicker photos={photos} onAdd={fotoDaAbertura(chaveDoModal)} onRemove={removePhoto} onError={onPhotoError} onEnviandoMudou={setFotosSubindo} hint="· obrigatória, pode anexar várias" />

              {/* CONFERIR E EMBALAR (decisão CONFERIR_E_EMBALAR): quando esta
                  conferência zera o que falta, embala já em volume avulso com
                  a mesma foto. Desmarcado, a peça ganha o Embalar na fila. */}
              {embalarJunto && (
                <label data-testid="opcao-ja-embalar" style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 44, padding: "0 12px", background: TOM.info.bg, border: `1px solid ${TOM.info.border}`, borderRadius: 8, fontSize: 14, fontWeight: 600, color: TOM.info.text, cursor: "pointer" }}>
                  <input type="checkbox" checked={jaEmbalar} onChange={e => setJaEmbalar(e.target.checked)} data-testid="checkbox-ja-embalar"
                    style={{ width: 22, height: 44, margin: 0, accentColor: TOM.info.text, flexShrink: 0, cursor: "pointer" }} />
                  Já embalar (volume avulso) com esta foto
                </label>
              )}

              {fichaDepoisDasFotos && fichaDaPeca}
              {renderNotesField("Ex.: cor puxando para o escuro, ilhós faltando…")}
              <div style={modalActionsStyle}>
                <Botao tamanho="toque" onClick={() => { setSelectedItem(null); setModalType(null); }}
                  style={{ flex: 1, minHeight: isMobile ? 48 : 44 }}>
                  Cancelar
                </Botao>
                {/* Ativo: o ciano da etapa. Desabilitado: a frase do que
                    falta logo abaixo (aria-describedby), à vista. */}
                <Botao type="submit" variante="primario" tamanho="toque" disabled={bloqueado}
                  carregando={ocupado || fotosSubindo > 0}
                  data-testid="button-confirm-conference"
                  aria-describedby={!ocupado && (fotosSubindo > 0 || !photos.length) ? "aviso-foto-conferencia" : undefined}
                  style={{ ...corDaAcao(TOM.ciano.text), flex: 2, minHeight: isMobile ? 48 : 44 }}>
                  {rotulo}
                </Botao>
                {!ocupado && (fotosSubindo > 0 || !photos.length) && (
                  <p id="aviso-foto-conferencia" style={{ flex: "1 1 100%", margin: "-2px 0 0", fontSize: fsMin(FS.small), color: T.apoio, textAlign: "center" }}>
                    {fotosSubindo > 0
                      ? "A foto ainda está subindo — o Conferir libera quando ela chegar."
                      : "Anexe ao menos uma foto para confirmar a conferência."}
                  </p>
                )}
              </div>
            </form>
            );
          })()}

        </div>
      </DialogContent>
    </Dialog>
  );
}
