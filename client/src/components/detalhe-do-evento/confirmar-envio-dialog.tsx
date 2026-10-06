// ─────────────────────────────────────────────────────────────────────────────
// A CONFIRMAÇÃO DO ENVIO DOS RASCUNHOS — a lista do que vai (no recorte de
// quem envia, a mesma população que o servidor manda) e o que acontece depois.
//
// PRODUÇÃO INTERNA (dono, 02/10): o mesmo envio manda a peça marcada "vai
// direto para a Gráfica" para Pronto para Produção, e segura no rascunho a
// marcada sem arquivo nem instrução. A confirmação divide como o servidor
// divide (dividirEnvioDaLista, shared/producao-interna) — a tela não promete
// o que a rota vai recusar.
// ─────────────────────────────────────────────────────────────────────────────
import { Check, AlertCircle, Factory, Lock } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Botao } from "@/components/ui/botao";
import { ModalHeader, modalSurface, HIDE_NATIVE_CLOSE } from "@/components/modal-shell";
import { SeloProducaoInterna } from "@/components/selo-producao-interna";
import { T, TOM, FONT, FS, FW, R } from "@/lib/theme";
import { refsDaPeca } from "@/lib/refs-da-peca";
import { miniatura } from "@/lib/miniatura";
import { dividirEnvioDaLista } from "@shared/producao-interna";
import { formatarMedida } from "./regras";
import type { PecaDoEvento } from "./tipos";

/** Uma peça da lista de confirmação — a mesma linha nas três seções. */
function LinhaDaConfirmacao({ item, primeira, extra }: { item: PecaDoEvento; primeira: boolean; extra?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', backgroundColor: T.surface, borderTop: primeira ? 'none' : `1px solid ${T.border}`, flexWrap: 'wrap' }}>
      {refsDaPeca(item)[0] && (
        <img src={miniatura(refsDaPeca(item)[0])} alt="" aria-hidden="true" style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: R.sm, border: `1px solid ${T.border}`, flexShrink: 0, backgroundColor: T.low }}
          onError={e => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }} />
      )}
      {/* displayId já vem com "#" do backend — prefixar de novo mostrava "##0281". */}
      <span style={{ fontSize: FS.meta, fontWeight: FW.forte, color: T.accentText, fontFamily: FONT.mono, flexShrink: 0 }}>
        {item.displayId ?? '—'}
      </span>
      <div style={{ flex: '1 1 160px', minWidth: 0 }}>
        <div title={item.description || item.type} style={{ fontSize: FS.body, fontWeight: FW.medio, color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {item.description || item.type}
        </div>
        <div style={{ fontSize: FS.small, color: T.second, marginTop: 1, fontVariantNumeric: 'tabular-nums' }}>
          {[`${item.quantity} un.`, item.fileWidth && item.fileHeight ? `${formatarMedida(item.fileWidth)} × ${formatarMedida(item.fileHeight)} m` : null, item.material].filter(Boolean).join(' · ')}
        </div>
      </div>
      {extra}
    </div>
  );
}

/** O título de uma seção da lista (Vinculação, Gráfica, Ficam). */
function TituloDaSecao({ icone: Icone, cor, children, n, testId }: { icone: typeof Check; cor: string; children: React.ReactNode; n: number; testId: string }) {
  return (
    <div data-testid={testId} style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0 8px' }}>
      <Icone aria-hidden="true" style={{ width: 14, height: 14, color: cor, flexShrink: 0 }} />
      <span style={{ fontSize: FS.meta, fontWeight: FW.rotulo, letterSpacing: '0.06em', textTransform: 'uppercase', color: cor }}>{children}</span>
      <span style={{ fontSize: FS.small, color: T.second, fontVariantNumeric: 'tabular-nums' }}>{n} {n === 1 ? 'peça' : 'peças'}</span>
    </div>
  );
}

export function ConfirmarEnvioDialog({ submitConfirmOpen, setSubmitConfirmOpen, rascunhosQueEuEnvio, dedo, enviando, onConfirmar }: {
  submitConfirmOpen: boolean;
  setSubmitConfirmOpen: (v: boolean) => void;
  rascunhosQueEuEnvio: PecaDoEvento[];
  /** Dedo (celular ou tablet do galpão): alvo de 44px. */
  dedo: boolean;
  enviando: boolean;
  onConfirmar: () => void;
}) {
  const { paraVinculacao, paraGrafica, ficamNoRascunho } = dividirEnvioDaLista(rascunhosQueEuEnvio);
  const nVao = paraVinculacao.length + paraGrafica.length;
  const temGrafica = paraGrafica.length > 0 || ficamNoRascunho.length > 0;
  const titulo = temGrafica ? "Confirmar envio da lista" : "Confirmar envio para vinculação";
  const subtitulo = temGrafica
    ? [
        paraVinculacao.length > 0 ? `${paraVinculacao.length} para a vinculação` : null,
        paraGrafica.length > 0 ? `${paraGrafica.length} direto para a Gráfica` : null,
        ficamNoRascunho.length > 0 ? `${ficamNoRascunho.length} ${ficamNoRascunho.length === 1 ? 'fica' : 'ficam'} no rascunho` : null,
      ].filter(Boolean).join(' · ')
    : `${nVao} ${nVao === 1 ? 'peça será enviada' : 'peças serão enviadas'} para a fila de vinculação.`;
  const motivoSemEnvio = nVao === 0 ? "Nenhuma peça pode ir agora — as marcadas para a Gráfica precisam de arquivo ou instruções." : undefined;

  // Por tipo, como antes, só para o que vai à vinculação.
  const porTipo: Record<string, PecaDoEvento[]> = {};
  paraVinculacao.forEach(item => {
    const k = item.type || 'Sem tipo';
    (porTipo[k] ??= []).push(item);
  });

  return (
    <Dialog open={submitConfirmOpen} onOpenChange={setSubmitConfirmOpen}>
      <DialogContent className={HIDE_NATIVE_CLOSE} style={modalSurface(560)}>
        <DialogTitle className="sr-only">{titulo}</DialogTitle>
        <DialogDescription className="sr-only">
          Revise os itens antes de enviá-los
        </DialogDescription>
        <ModalHeader
          variant="confirm"
          icon={Check}
          tint={T.accentText}
          title={titulo}
          subtitle={subtitulo}
          onClose={() => setSubmitConfirmOpen(false)}
        />

        {/* Lista de itens — ALTURA: cabeçalho 93 + lista de até 340 + bloco
            de aviso e botões ~120 = 553px. `flex: 0 1 auto` + `minHeight: 0`
            deixa a lista encolher sob o teto do `modalSurface`, e a rolagem
            que já existia passa a ligar. */}
        <div style={{ maxHeight: temGrafica ? 520 : 340, overflowY: 'auto', padding: '16px 24px 4px', flex: '0 1 auto', minHeight: 0 }}>
          {/* O que pede atenção primeiro: a marcada que FICA, depois a que vai
              direto; a vinculação, o caminho de sempre, por último. */}
          {ficamNoRascunho.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <TituloDaSecao icone={Lock} cor={TOM.alerta.text} n={ficamNoRascunho.length} testId="secao-envio-ficam">Ficam no rascunho</TituloDaSecao>
              <div style={{ display: 'flex', flexDirection: 'column', border: `1px solid ${TOM.alerta.border}`, borderRadius: R.md, overflow: 'hidden' }}>
                {ficamNoRascunho.map(({ peca, motivo }, idx) => (
                  <div key={peca.id}>
                    <LinhaDaConfirmacao item={peca} primeira={idx === 0} extra={<SeloProducaoInterna peca={peca} onde="lista" />} />
                    <p style={{ margin: 0, padding: '0 12px 9px', fontSize: FS.meta, color: TOM.alerta.text, backgroundColor: T.surface, lineHeight: 1.45 }}>{motivo}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          {paraGrafica.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <TituloDaSecao icone={Factory} cor={TOM.ceu.text} n={paraGrafica.length} testId="secao-envio-grafica">Direto para a Gráfica</TituloDaSecao>
              <div style={{ display: 'flex', flexDirection: 'column', border: `1px solid ${TOM.ceu.border}`, borderRadius: R.md, overflow: 'hidden' }}>
                {paraGrafica.map((item, idx) => (
                  <LinhaDaConfirmacao key={item.id} item={item} primeira={idx === 0}
                    extra={<span style={{ fontSize: FS.small, color: TOM.ceu.text, fontWeight: FW.medio }}>{item.finalFileUrl ? 'com arquivo' : 'pelas instruções'}</span>} />
                ))}
              </div>
            </div>
          )}

          {paraVinculacao.length > 0 && temGrafica && (
            <TituloDaSecao icone={Check} cor={T.apoio} n={paraVinculacao.length} testId="secao-envio-vinculacao">Para a vinculação</TituloDaSecao>
          )}
          {Object.entries(porTipo).sort(([a],[b]) => a.localeCompare(b,'pt-BR')).map(([typeName, typeItems]) => (
            <div key={typeName} style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: FS.meta, fontWeight: FW.forte, color: T.strong }}>{typeName}</span>
                <span style={{ fontSize: FS.small, color: T.second }}>{typeItems.length} {typeItems.length === 1 ? 'peça' : 'peças'}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', border: `1px solid ${T.border}`, borderRadius: R.md, overflow: 'hidden' }}>
                {typeItems.map((item, idx) => <LinhaDaConfirmacao key={item.id} item={item} primeira={idx === 0} />)}
              </div>
            </div>
          ))}

        </div>

        {/* Aviso + botões */}
        <div style={{ padding: '14px 24px 20px', borderTop: `1px solid ${T.border}`, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, backgroundColor: TOM.alerta.bg, border: `1px solid ${TOM.alerta.border}`, borderRadius: R.md, padding: '10px 12px', marginBottom: 16 }}>
            <AlertCircle aria-hidden="true" style={{ width: 15, height: 15, color: TOM.alerta.text, flexShrink: 0, marginTop: 2 }} />
            <p style={{ fontSize: FS.body, color: T.strong, margin: 0, lineHeight: 1.5 }}>
              {paraVinculacao.length > 0 && <>Após o envio, as peças saem de Rascunho e vão para a fila de <strong>Vincular Patrocinadores</strong> — nesta tela passam a aparecer como Aguardando Vinculação. </>}
              {paraGrafica.length > 0 && <>As marcadas <strong>Direto para a Gráfica</strong> pulam Vinculação, Arte, Aprovação e Revisão Final e entram na fila da Gráfica como Pronto para Produção. </>}
              Esta ação não pode ser desfeita por aqui.
            </p>
          </div>
          <DialogFooter style={{ gap: 8, flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <Botao variante="secundario" tamanho={dedo ? 'toque' : 'md'} onClick={() => setSubmitConfirmOpen(false)}>
              Cancelar
            </Botao>
            <Botao
              variante="primario"
              tamanho={dedo ? 'toque' : 'md'}
              icone={Check}
              carregando={enviando}
              disabled={!!motivoSemEnvio}
              motivo={motivoSemEnvio}
              alinharMotivo="end"
              onClick={() => {
                setSubmitConfirmOpen(false);
                onConfirmar();
              }}
              data-testid="button-confirm-submit-drafts"
            >
              {enviando ? 'Enviando...' : `Enviar ${nVao} ${nVao === 1 ? 'peça' : 'peças'}`}
            </Botao>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
