import type { Dispatch, SetStateAction } from "react";
import { FastForward } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { HIDE_NATIVE_CLOSE, modalSurface, ModalHeader, ModalFooter, FreezeWhileClosing } from "@/components/modal-shell";
import { Botao } from "@/components/ui/botao";
import { MOTIVO_DISPENSA_MIN, faltamNoMotivo, fraseFaltamCaracteres } from "@/lib/arte-rules";
import { P } from "@/lib/status";
import { T, TOM, R } from "@/lib/theme";
import { cn } from "@/lib/utils";
import type { PecaDaArte } from "./tipos";
import type { AcoesDaArte } from "./use-acoes-da-arte";

/** "Direto para finalização": a peça pula a aprovação do Atendimento, com motivo. */
export function DialogoDispensar({ dispenseItem, setDispenseItem, dispenseReason, setDispenseReason, dispenseMutation, dedo }: {
  dispenseItem: PecaDaArte | null;
  setDispenseItem: Dispatch<SetStateAction<PecaDaArte | null>>;
  dispenseReason: string;
  setDispenseReason: Dispatch<SetStateAction<string>>;
  dispenseMutation: AcoesDaArte["dispenseMutation"];
  dedo: boolean;
}) {
  return (
    <Dialog open={!!dispenseItem} onOpenChange={(open) => { if (!open) { setDispenseItem(null); setDispenseReason(""); } }}>
      {/* HIDE_NATIVE_CLOSE: este modal tem X próprio; sem a classe ficavam dois. */}
      <DialogContent className={cn("p-0 gap-0", HIDE_NATIVE_CLOSE)} style={modalSurface(420)}>
        {/* POR QUE congelar aqui: o onSuccess da dispensa invalida /api/items
            e /api/items/approved, fecha, esvazia `dispenseReason` e toasta no
            mesmo commit — e tanto o cabeçalho quanto o campo de motivo vêm de
            `dispenseItem`/`dispenseReason`, que acabaram de ser zerados. Sem
            congelar o modal se apaga durante o fade. */}
        <FreezeWhileClosing open={!!dispenseItem}>
        <DialogTitle className="sr-only">Direto para finalização</DialogTitle>
        <DialogDescription className="sr-only">Mandar a peça direto para a finalização da arte, sem a aprovação do Atendimento</DialogDescription>
        {/* ModalHeader compartilhado: o X feito à mão aqui tinha 20px, abaixo
            do alvo mínimo de toque, num diálogo que libera peça para produção.
            A casca dá 34px, o mesmo tamanho dos outros modais da tela. */}
        {/* Tinta do ícone em âmbar, a mesma da tarja do corpo (dono, 09/09):
            o ladrilho vermelho contradizia o "não é bloqueio" do diálogo. */}
        <ModalHeader
          icon={FastForward}
          variant="confirm"
          tint={P.amber.text}
          title="Direto para finalização"
          subtitle="A peça pula a aprovação do Atendimento e vai para a finalização"
          onClose={() => { setDispenseItem(null); setDispenseReason(""); }}
        />
        {/* ALTURA: cabeçalho 81 + este corpo 246 (tarja vermelha 75, rótulo 15,
            textarea 72 e as margens) + rodapé 120 = 447px. Numa janela de 445
            sobram 397 depois do respiro de 24+24, então cortava 25px em cima e
            25 embaixo AO MESMO TEMPO — sumiam o título e o botão de dispensar
            juntos, e não havia rolagem alguma para alcançá-los.
            `flex: 1 1 auto` + `minHeight: 0` faz este corpo receber o que
            sobrar do teto do `modalSurface`, e só ele rola. */}
        <div style={{ padding: '18px 24px 24px', overflowY: 'auto', flex: '1 1 auto', minHeight: 0 }}>
          {dispenseItem && (
            // ÂMBAR, não vermelho (dono, 09/09): o vermelho de "proibido"
            // dizia que a peça ia ser barrada, quando ela vai ser IMPRESSA
            // na frente de todo mundo. Continua marcada — é irreversível e
            // pula duas conferências —, mas com a cor de atenção que o
            // diálogo vizinho (devolver ao solicitante) já usa.
            <div style={{ backgroundColor: P.amber.bg, border: `1px solid ${P.amber.border}`, borderRadius: R.md, padding: '12px 14px', marginBottom: 16, display: 'flex', gap: 10 }}>
              <FastForward style={{ width: 16, height: 16, color: P.amber.text, flexShrink: 0, marginTop: 2 }} />
              <div>
                <p style={{ fontSize: 12, fontWeight: 700, color: TOM.alerta.text, margin: '0 0 2px' }}>{dispenseItem.displayId} — {dispenseItem.type}</p>
                <p style={{ fontSize: 11, color: P.amber.text, margin: 0 }}>A peça vai direto para a <strong>finalização da arte</strong>, sem passar pela aprovação do Atendimento. Você ainda sobe o arquivo final, e a Revisão confere antes da Gráfica.</p>
              </div>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
            {/* Motivo OBRIGATÓRIO: pular a aprovação sem dizer por quê
                deixava a Revisão e o Atendimento sem saber se foi combinado. */}
            <label htmlFor="motivo-dispensa-arte" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.apoio }}>
              Motivo <span style={{ color: P.red.text }}>*</span>
            </label>
            <textarea
              id="motivo-dispensa-arte"
              value={dispenseReason}
              onChange={e => setDispenseReason(e.target.value)}
              placeholder="Ex: patrocinador já aprovou por fora; peça sem marca..."
              data-testid="textarea-dispense-reason"
              style={{ width: '100%', backgroundColor: T.bg, border: `1px solid ${faltamNoMotivo(dispenseReason, MOTIVO_DISPENSA_MIN) > 0 ? T.border : TOM.sucesso.text}`, borderRadius: 8, padding: '10px 12px', fontSize: 12, resize: 'none', height: 72, fontFamily: 'inherit', color: T.text, boxSizing: 'border-box' }}
            />
            {faltamNoMotivo(dispenseReason, MOTIVO_DISPENSA_MIN) > 0 && (
              <p data-testid="dispense-faltam" style={{ margin: 0, fontSize: 11, color: P.amber.text }}>
                {fraseFaltamCaracteres(faltamNoMotivo(dispenseReason, MOTIVO_DISPENSA_MIN))} — diga por que a peça pula a aprovação do Atendimento.
              </p>
            )}
          </div>
        </div>
        {/* Rodapé da casca: Cancelar à esquerda, primário à direita — a mesma
            ordem dos outros quatro modais desta tela. */}
        <ModalFooter>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
            <Botao variante="secundario" tamanho={dedo ? "toque" : "md"} onClick={() => { setDispenseItem(null); setDispenseReason(""); }}>
              Cancelar
            </Botao>
            {/* CONTORNO ÂMBAR, não cheio: a ação pula a aprovação do
                Atendimento, e o botão preenchido é o objeto mais chamativo do
                diálogo — convida ao clique reflexo onde não há volta.
                Sem motivo, fica desabilitado e o porquê está escrito embaixo
                do campo (dispense-faltam). */}
            <Botao
              variante="secundario"
              tamanho={dedo ? "toque" : "md"}
              icone={FastForward}
              carregando={dispenseMutation.isPending}
              onClick={() => dispenseItem && faltamNoMotivo(dispenseReason, MOTIVO_DISPENSA_MIN) === 0 && dispenseMutation.mutate({ itemId: dispenseItem.id, reason: dispenseReason.trim().replace(/\s+/g, " ") })}
              disabled={faltamNoMotivo(dispenseReason, MOTIVO_DISPENSA_MIN) > 0}
              data-testid="button-confirm-dispense"
              style={faltamNoMotivo(dispenseReason, MOTIVO_DISPENSA_MIN) > 0 ? undefined : { borderColor: P.amber.text, color: P.amber.text }}
            >
              {dispenseMutation.isPending ? 'Enviando…' : 'Mandar para finalização'}
            </Botao>
          </div>
        </ModalFooter>
        </FreezeWhileClosing>
      </DialogContent>
    </Dialog>
  );
}
