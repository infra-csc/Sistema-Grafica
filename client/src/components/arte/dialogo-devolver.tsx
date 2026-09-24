import type { Dispatch, SetStateAction } from "react";
import { RotateCcw } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { HIDE_NATIVE_CLOSE, modalSurface, ModalHeader, ModalFooter, FreezeWhileClosing } from "@/components/modal-shell";
import { Botao } from "@/components/ui/botao";
import { getStatusLabel, P } from "@/lib/status";
import { T, TOM, R } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { DEPOIS_DA_ARTE } from "@shared/fluxo-peca";
import type { PecaDaArte } from "./tipos";
import { fsToque } from "./constantes";
import type { AcoesDaArte } from "./use-acoes-da-arte";

/** Mesma régua do servidor (lerMotivoDevolucao, routes/items.ts). */
const MOTIVO_MIN = 10;
const motivoCurto = (t: string) => t.trim().replace(/\s+/g, " ").length < MOTIVO_MIN;

/**
 * Devolver ao solicitante: a peça volta para RASCUNHO e quem a criou decide
 * se continua ou descarta. É o oposto de "dispensar", que empurra a peça para
 * frente. Vale de QUALQUER estado menos do próprio rascunho — as regras moram
 * em shared/fluxo-peca.ts, e o servidor decide com as MESMAS listas.
 */
export function DialogoDevolver({ devolverItem, setDevolverItem, devolverMotivo, setDevolverMotivo, devolverMutation, dedo }: {
  devolverItem: PecaDaArte | null;
  setDevolverItem: Dispatch<SetStateAction<PecaDaArte | null>>;
  devolverMotivo: string;
  setDevolverMotivo: Dispatch<SetStateAction<string>>;
  devolverMutation: AcoesDaArte["devolverMutation"];
  dedo: boolean;
}) {
  return (
    <Dialog open={!!devolverItem} onOpenChange={(open) => { if (!open) { setDevolverItem(null); setDevolverMotivo(""); } }}>
      <DialogContent className={cn("p-0 gap-0", HIDE_NATIVE_CLOSE)} style={modalSurface(440)}>
        {/* Congela pelo mesmo motivo da dispensa: o onSuccess zera
            `devolverItem` e `devolverMotivo` no mesmo commit em que fecha. */}
        <FreezeWhileClosing open={!!devolverItem}>
        <DialogTitle className="sr-only">Devolver peça ao solicitante</DialogTitle>
        <DialogDescription className="sr-only">A peça volta para rascunho com um motivo</DialogDescription>
        <ModalHeader
          icon={RotateCcw}
          variant="confirm"
          tint={TOM.alerta.text}
          title="Devolver ao solicitante"
          subtitle="A peça volta para rascunho — quem a criou decide se continua ou descarta"
          onClose={() => { setDevolverItem(null); setDevolverMotivo(""); }}
        />
        <div style={{ padding: '18px 24px 24px', overflowY: 'auto', flex: '1 1 auto', minHeight: 0 }}>
          {/* `#fffbeb`, `#fde68a` e `#b45309` ERAM P.amber.bg, .border e .text
              copiados à mão — a mesma cor, sem o vínculo com a origem. Os tons
              800/900 do texto abaixo continuam literais porque a paleta guarda
              UM tom por família, e a hierarquia entre título e corpo da tarja
              precisa de dois. */}
          {devolverItem && (
            <div style={{ backgroundColor: P.amber.bg, border: `1px solid ${P.amber.border}`, borderRadius: R.md, padding: '12px 14px', marginBottom: 16, display: 'flex', gap: 10 }}>
              <RotateCcw style={{ width: 16, height: 16, color: P.amber.text, flexShrink: 0, marginTop: 2 }} />
              <div>
                <p style={{ fontSize: 12, fontWeight: 700, color: TOM.alerta.text, margin: '0 0 2px' }}>{devolverItem.displayId} — {devolverItem.type}</p>
                <p style={{ fontSize: fsToque(11, dedo), color: TOM.alerta.text, margin: 0 }}>
                  {DEPOIS_DA_ARTE.has(devolverItem.status)
                    ? `Atenção: esta peça está em "${getStatusLabel(devolverItem.status)}" — ela já saiu da mesa da Arte. Devolver tira a linha da fila de quem está com ela agora, e o que já foi produzido continua produzido. O thumb e o arquivo final ficam guardados.`
                    : "Ela sai da fila da Arte e reaparece como rascunho no evento. O thumb e o arquivo final que você já subiu ficam guardados."}
                </p>
              </div>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
            <label htmlFor="motivo-devolucao-arte" style={{ fontSize: fsToque(11, dedo), fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.apoio }}>
              Motivo <span style={{ color: P.red.text }}>*</span>
            </label>
            <textarea
              id="motivo-devolucao-arte"
              autoFocus
              value={devolverMotivo}
              onChange={e => setDevolverMotivo(e.target.value)}
              placeholder="Ex: a medida não fecha com o layout enviado — confirmar largura antes de refazer."
              data-testid="textarea-devolver-motivo"
              style={{ width: '100%', backgroundColor: T.bg, border: `1px solid ${motivoCurto(devolverMotivo) ? T.border : TOM.sucesso.text}`, borderRadius: R.md, padding: '10px 12px', fontSize: dedo ? 16 : 12, resize: 'none', height: 84, fontFamily: 'inherit', color: T.text, boxSizing: 'border-box' }}
            />
            {/* #b45309 sobre #fafaf9 = 4,79:1 ✓ nos 11px */}
            {motivoCurto(devolverMotivo) && (
              <p style={{ margin: 0, fontSize: fsToque(11, dedo), color: P.amber.text }}>
                Faltam {Math.max(0, MOTIVO_MIN - devolverMotivo.trim().replace(/\s+/g, " ").length)} caracteres — sem motivo, quem recebe a peça de volta não sabe o que fazer com ela.
              </p>
            )}
          </div>
        </div>
        <ModalFooter>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
            {/* Cancelar com contorno (secundário), não legenda solta: a saída
                é o caminho que a pessoa procura quando abriu por engano. */}
            <Botao variante="secundario" tamanho={dedo ? "toque" : "md"} onClick={() => { setDevolverItem(null); setDevolverMotivo(""); }}>
              Cancelar
            </Botao>
            {/* O porquê do desabilitado já está escrito embaixo do campo
                ("Faltam N caracteres…"), à vista. */}
            <Botao
              variante="primario"
              tamanho={dedo ? "toque" : "md"}
              icone={RotateCcw}
              carregando={devolverMutation.isPending}
              onClick={() => devolverItem && devolverMutation.mutate({ itemId: devolverItem.id, motivo: devolverMotivo })}
              disabled={motivoCurto(devolverMotivo)}
              data-testid="button-confirm-devolver"
            >
              {devolverMutation.isPending ? 'Devolvendo…' : 'Devolver ao solicitante'}
            </Botao>
          </div>
        </ModalFooter>
        </FreezeWhileClosing>
      </DialogContent>
    </Dialog>
  );
}
