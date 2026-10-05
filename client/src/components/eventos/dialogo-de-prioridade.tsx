// A prioridade do evento: quatro níveis que TRAVAM, e a volta à automática.
import { Flag, RotateCcw } from "lucide-react";
import { PRIORITY } from "@/lib/status";
import { T, FS, R } from "@/lib/theme";
import { Botao } from "@/components/ui/botao";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ModalHeader, modalSurface, HIDE_NATIVE_CLOSE, FreezeWhileClosing } from "@/components/modal-shell";
import type { AcoesDoEvento } from "./use-acoes-do-evento";

/** O que a regra automática daria a cada nível (≤3 urgente · ≤7 alta · ≤15 média · >15 baixa). */
const FAIXA_DA_REGRA = {
  baixa: 'Mais de 15 dias',
  media: 'Até 15 dias',
  alta: 'Até 7 dias',
  urgente: 'Até 3 dias',
} as const;

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
          <p style={{ margin: 0, padding: isMobile ? '14px 16px 0' : '16px 24px 0', fontSize: FS.meta, color: T.apoio, lineHeight: 1.5 }}>
            A prioridade é <strong style={{ color: T.text }}>automática pela saída do caminhão</strong> — pelos dias que faltam até ela. Escolher um nível aqui <strong style={{ color: T.text }}>trava</strong> este evento — a regra deixa de mexer nele até “Voltar à automática”.
          </p>

          {/* ALTURA: cabeçalho 93 + esta grade de quatro cartões em duas linhas
              ~192 + rodapé 61 = 346px, contra 397 disponíveis numa janela de
              445 — este modal NÃO cortava em nenhuma das alturas conferidas.
              O scrollport é preventivo e obrigatório: o `modalSurface` passou a
              trazer teto COM `overflow: hidden`, e sem um corpo que role o
              conteúdo seria recortado em silêncio numa janela menor. */}
          <div style={{ padding: isMobile ? '14px 16px 18px' : '16px 24px 22px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: isMobile ? 8 : 10, overflowY: 'auto', flex: '1 1 auto', minHeight: 0 }}>
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
                    minHeight: 64,
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: isMobile ? '10px 12px' : '10px 14px', textAlign: 'left', fontFamily: 'inherit',
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
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                    <span className="prio-label" style={{ fontWeight: 700, fontSize: FS.read, color: isSelected ? meta.text : T.strong, transition: 'color 0.15s' }}>
                      {meta.label}
                    </span>
                    {/* A faixa da regra automática para cada nível — a mesma
                        escada do parágrafo acima, no lugar onde se decide. */}
                    <span style={{ fontSize: FS.small, color: T.second, lineHeight: 1.3 }}>
                      {FAIXA_DA_REGRA[key]}
                    </span>
                  </span>
                  {/* Atalho de teclado: no toque não há teclado para lembrar. */}
                  {!isMobile && (
                    <kbd aria-hidden="true" style={{ marginLeft: 'auto', alignSelf: 'flex-start', fontFamily: 'inherit', fontSize: FS.micro, fontWeight: 700, color: T.second, border: `1px solid ${T.border}`, borderBottomWidth: 2, borderRadius: 4, padding: '1px 5px', backgroundColor: T.surface }}>
                      {i + 1}
                    </kbd>
                  )}
                </button>
              );
            })}
          </div>

          <div style={{ backgroundColor: T.low, borderTop: `1px solid ${T.border}`, padding: isMobile ? '12px 16px' : '12px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexShrink: 0 }}>
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
            ) : isMobile ? <span /> : <span style={{ fontSize: FS.small, color: T.second }}>Teclas 1–4 travam · 0 volta à automática</span>}
            <Botao variante="secundario" tamanho={isMobile ? 'toque' : 'sm'} onClick={() => setPriorityDialogOpen(false)}>
              Cancelar
            </Botao>
          </div>
          </FreezeWhileClosing>
        </DialogContent>
      </Dialog>
  );
}
