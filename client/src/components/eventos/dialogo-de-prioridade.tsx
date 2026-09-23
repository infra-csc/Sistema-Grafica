// A prioridade do evento: quatro níveis que TRAVAM, e a volta à automática.
import { Flag, RotateCcw } from "lucide-react";
import { PRIORITY } from "@/lib/status";
import { T, FS, R } from "@/lib/theme";
import { Botao } from "@/components/ui/botao";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ModalHeader, modalSurface, HIDE_NATIVE_CLOSE, FreezeWhileClosing } from "@/components/modal-shell";
import type { AcoesDoEvento } from "./use-acoes-do-evento";

export function DialogoDePrioridade({ acoes, isMobile }: { acoes: AcoesDoEvento; isMobile: boolean }) {
  const { priorityDialogOpen, setPriorityDialogOpen, selectedEventForPriority, updatePriorityMutation, handlePrioritySelect } = acoes;
  return (
      <Dialog open={priorityDialogOpen} onOpenChange={setPriorityDialogOpen}>
        <DialogContent className={`${HIDE_NATIVE_CLOSE} p-0 gap-0`} style={{ ...modalSurface(460) }}>
          {/* Mesma tríade do modal de edição: o onSuccess invalida, fecha e
              toasta de uma vez, e ainda zera `selectedEventForPriority` — o
              subtítulo ficava em branco durante a animação de saída. Congelar
              resolve as duas coisas. */}
          <FreezeWhileClosing open={priorityDialogOpen}>
          <DialogTitle className="sr-only">Definir prioridade</DialogTitle>
          <DialogDescription className="sr-only">Escolha o nível de prioridade do evento. Teclas 1 a 4 definem e travam a escolha, 0 volta à prioridade automática.</DialogDescription>
          <ModalHeader
            variant="confirm"
            icon={Flag}
            tint={T.accentText}
            title="Definir Prioridade"
            subtitle={selectedEventForPriority?.name}
            onClose={() => setPriorityDialogOpen(false)}
          />
          {/* A REGRA (25/08): a prioridade é AUTOMÁTICA pela saída do caminhão
              (≤3 dias urgente, ≤7 alta, ≤15 média, >15 baixa). Definir aqui
              TRAVA este evento — a regra para de mexer até voltar à automática. */}
          <p style={{ margin: 0, padding: "10px 24px 0", fontSize: FS.small, color: T.apoio, lineHeight: 1.45 }}>
            A prioridade é <strong>automática pela saída do caminhão</strong> (≤3 dias urgente · ≤7 alta · ≤15 média). Escolher um nível aqui <strong>trava</strong> este evento; “Voltar à automática” devolve à regra.
          </p>

          {/* ALTURA: cabeçalho 93 + esta grade de quatro cartões em duas linhas
              ~192 + rodapé 61 = 346px, contra 397 disponíveis numa janela de
              445 — este modal NÃO cortava em nenhuma das alturas conferidas.
              O scrollport é preventivo e obrigatório: o `modalSurface` passou a
              trazer teto COM `overflow: hidden`, e sem um corpo que role o
              conteúdo seria recortado em silêncio numa janela menor. */}
          <div style={{ padding: '20px 24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', overflowY: 'auto', flex: '1 1 auto', minHeight: 0 }}>
            {(['baixa', 'media', 'alta', 'urgente'] as const).map((key, i) => {
              // Cores derivadas de PRIORITY (lib/status) — antes havia um mapa hex local.
              const meta = PRIORITY[key];
              const isSelected = selectedEventForPriority?.priority === key;
              const isPending = updatePriorityMutation.isPending;
              return (
                <button
                  key={key}
                  onClick={() => handlePrioritySelect(key)}
                  disabled={isPending}
                  aria-pressed={isSelected}
                  style={{
                    height: '72px',
                    display: 'flex', alignItems: 'center', gap: '12px',
                    padding: '0 16px',
                    borderRadius: R.lg,
                    border: isSelected ? `2px solid ${meta.dot}` : `2px solid ${T.border}`,
                    backgroundColor: isSelected ? meta.bg : T.surface,
                    cursor: isPending ? 'wait' : 'pointer',
                    opacity: isPending ? 0.5 : 1,
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={e => {
                    if (!isSelected && !isPending) {
                      (e.currentTarget as HTMLButtonElement).style.borderColor = meta.dot;
                      (e.currentTarget as HTMLButtonElement).style.backgroundColor = meta.bg;
                      (e.currentTarget.querySelector('.prio-label') as HTMLElement).style.color = meta.text;
                    }
                  }}
                  onMouseLeave={e => {
                    if (!isSelected) {
                      (e.currentTarget as HTMLButtonElement).style.borderColor = T.border;
                      (e.currentTarget as HTMLButtonElement).style.backgroundColor = T.surface;
                      (e.currentTarget.querySelector('.prio-label') as HTMLElement).style.color = T.strong;
                    }
                  }}
                  data-testid={`button-priority-${key}`}
                >
                  <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: meta.dot, flexShrink: 0 }} />
                  <span className="prio-label" style={{ fontWeight: '700', fontSize: FS.body, color: isSelected ? meta.text : T.strong, transition: 'color 0.15s' }}>
                    {meta.label}
                  </span>
                  <span style={{ marginLeft: 'auto', fontSize: FS.micro, fontWeight: 700, color: T.second, border: `1px solid ${T.border}`, borderRadius: 4, padding: '1px 5px' }}>
                    {i + 1}
                  </span>
                </button>
              );
            })}
          </div>

          <div style={{ backgroundColor: T.low, borderTop: `1px solid ${T.border}`, padding: '12px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            {/* Caminho de volta: sem isto, prioridade definida era para sempre. */}
            {selectedEventForPriority?.priority ? (
              <Botao
                // Fantasma, não perigo: voltar à regra não destrói nada.
                variante="fantasma"
                tamanho={isMobile ? 'toque' : 'sm'}
                icone={RotateCcw}
                onClick={() => handlePrioritySelect("")}
                disabled={updatePriorityMutation.isPending}
                data-testid="button-remove-priority"
              >
                Voltar à automática (0)
              </Botao>
            ) : <span style={{ fontSize: FS.small, color: T.second }}>Teclas 1–4 travam · 0 volta à automática</span>}
            <Botao variante="secundario" tamanho={isMobile ? 'toque' : 'sm'} onClick={() => setPriorityDialogOpen(false)}>
              Cancelar
            </Botao>
          </div>
          </FreezeWhileClosing>
        </DialogContent>
      </Dialog>
  );
}
