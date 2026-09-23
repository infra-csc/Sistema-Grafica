// O MODAL CRIAR / EDITAR / DUPLICAR (Dialog 100% controlado). As seções
// moram ao lado: datas, prazos e patrocinadores.
import { CalendarPlus } from "lucide-react";
import type { Sponsor } from "@shared/schema";
import { PRIORITY } from "@/lib/status";
import { T, FS, R, N, TOM, FONT } from "@/lib/theme";
import { Checkbox } from "@/components/ui/checkbox";
import { Botao } from "@/components/ui/botao";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ModalHeader, ModalFooter, modalSurface, HIDE_NATIVE_CLOSE, FreezeWhileClosing } from "@/components/modal-shell";
import { CamposDeData, CampoPrazoDoMolde } from "./campos-de-data";
import { SecaoDePrazos } from "./secao-de-prazos";
import { EscolhaDePatrocinadores } from "./escolha-de-patrocinadores";
import { DialogoDeDescarte } from "./dialogo-de-descarte";
import { readEventStats } from "./regras";
import type { FormularioDoEventoAberto } from "./use-formulario-do-evento";

export function ModalDoEvento({ form, isMobile, dedo, sponsors, sponsorsQueryLoading, sponsorsQueryError }: {
  form: FormularioDoEventoAberto;
  isMobile: boolean;
  dedo: boolean;
  sponsors: Sponsor[];
  sponsorsQueryLoading: boolean;
  sponsorsQueryError: boolean;
}) {
  const {
    open, setOpen, formData, setFormData, requestCloseDialog, soPatrocinadoresNoModal, modalMode,
    editingEvent, duplicateSource, handleSubmit, copyItems, setCopyItems, hasOrderIssue,
    submitPending, createEventMutation, updateEventMutation,
  } = form;
  return (
    <>
      <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) requestCloseDialog(); else setOpen(true); }}>
        <DialogContent
          className={`${HIDE_NATIVE_CLOSE} p-0 gap-0`}
          // O foco abre ONDE SE COMEÇA: no nome (criar, duplicar, editar) ou
          // na busca de patrocinador (Atendimento). O padrão do Radix era o X
          // do cabeçalho — "Novo Evento" custava um clique antes de digitar.
          // Sem o alvo no DOM (patrocinadores ainda carregando), fica o padrão.
          onOpenAutoFocus={(e) => {
            const alvo = document.querySelector<HTMLElement>(
              soPatrocinadoresNoModal ? '[data-testid="input-sponsor-search"]' : '#event-name',
            );
            if (alvo) { e.preventDefault(); alvo.focus(); }
          }}
          style={{
            // A coluna flex e o teto de `100vh − 48` já vêm do `modalSurface`
            // (a conta está lá). O que sobra aqui é UMA troca de unidade:
            // `dvh` em vez de `vh`, porque este é o formulário mais alto do
            // app e no celular a barra de endereço do Chrome come ~60px que o
            // `vh` finge que existem. Só a unidade é sobrescrita — o desconto
            // de 48 (24 em cima, 24 embaixo) é o mesmo da casa.
            ...modalSurface(720),
            maxHeight: 'calc(100dvh - 48px)',
          }}
        >
          {/* Enquanto o modal SAI, o miolo para de renderizar. É a correção
              do React #185 ao salvar — o mecanismo do laço está escrito por
              extenso em components/modal-shell.tsx. Resumo: cada render da
              página desanexa e reanexa a ref de toda primitiva Radix aqui
              dentro, e fazer isso com a subárvore em desmontagem estoura o
              contador de updates aninhados do React. Cancelar fazia UM
              render; salvar faz quatro (isPending, useToast, timer do toast,
              refetch do invalidateQueries) dentro dos ~200ms da animação de
              saída. */}
          <FreezeWhileClosing open={open}>
          <DialogTitle className="sr-only">
            {soPatrocinadoresNoModal ? 'Vincular patrocinadores' : modalMode === 'edit' ? 'Editar evento' : modalMode === 'duplicate' ? 'Duplicar evento' : 'Novo evento'}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Nome, prioridade, datas, prazos dos 5 marcos e patrocinadores do evento.
          </DialogDescription>
          <ModalHeader
            icon={CalendarPlus}
            variant="work"
            tint={T.accentText}
            title={soPatrocinadoresNoModal ? 'Vincular Patrocinadores' : modalMode === 'edit' ? 'Editar Evento' : modalMode === 'duplicate' ? 'Duplicar Evento' : 'Novo Evento'}
            subtitle={
              soPatrocinadoresNoModal
                ? `Patrocinadores e cotas de "${editingEvent?.name}".`
                : modalMode === 'edit'
                ? 'Atualize as informações do evento.'
                : modalMode === 'duplicate'
                  ? `Cópia de "${duplicateSource?.name}" — prazos, patrocinadores e cotas já vieram junto.`
                  : 'Preencha os detalhes do evento.'
            }
            onClose={requestCloseDialog}
          />

          <form onSubmit={handleSubmit} style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', overflowY: 'auto', flex: 1, minHeight: 0 }}>


              {/* Só patrocinadores: nome, datas e prazos ficam de fora. */}
              {!soPatrocinadoresNoModal && (<>
              {/* Nome + Prioridade */}
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(240px, 1fr) auto', gap: '16px', alignItems: 'end' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: 0 }}>
                  <label htmlFor="event-name" style={{ fontSize: FS.micro, fontWeight: '700', color: T.apoio, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
                    Nome do Evento
                  </label>
                  <input
                    id="event-name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Ex: Circuito Estações — Etapa 2"
                    required
                    data-testid="input-event-name"
                    style={{ width: '100%', backgroundColor: T.border, border: 'none', borderRadius: R.md, padding: '12px 16px', fontSize: FS.strong, color: T.text, fontFamily: FONT.corpo, transition: 'box-shadow 0.15s, background-color 0.15s' }}
                  />
                </div>
                {/* Prioridade na CRIAÇÃO: o schema já a aceitava, mas o
                    formulário não tinha o campo — depois de salvar eram 4
                    interações extras para achar o card e definir o nível.
                    Resultado: "Sem prioridade" era o badge mais comum da
                    grade, esvaziando o filtro e a ordenação. */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <span style={{ fontSize: FS.micro, fontWeight: '700', color: T.apoio, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
                    Prioridade
                  </span>
                  <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                    {/* '' = AUTOMÁTICA (25/08): no salvar, o vazio destrava o
                        evento e a regra da saída do caminhão volta a mandar
                        na hora. Escolher um nível TRAVA (a regra não mexe). */}
                    {[{ value: '', label: 'Automática', dot: T.muted, text: T.apoio, bg: T.low, border: T.border },
                      ...(['baixa', 'media', 'alta', 'urgente'] as const).map((k) => ({
                        value: k, label: PRIORITY[k].label, dot: PRIORITY[k].dot, text: PRIORITY[k].text, bg: PRIORITY[k].bg, border: PRIORITY[k].border,
                      }))].map((opt) => {
                      const active = formData.priority === opt.value;
                      return (
                        <button
                          key={opt.value || 'none'}
                          type="button"
                          onClick={() => setFormData({ ...formData, priority: opt.value })}
                          aria-pressed={active}
                          title={opt.value === ''
                            ? 'A regra da saída do caminhão define sozinha (≤3 dias urgente · ≤7 alta · ≤15 média · >15 baixa)'
                            : 'Trava este nível — a regra automática deixa de mexer neste evento até voltar à Automática'}
                          data-testid={`form-priority-${opt.value || 'none'}`}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '5px',
                            height: isMobile ? 44 : 34, padding: '0 10px', borderRadius: R.md,
                            border: `1.5px solid ${active ? opt.dot : T.border}`,
                            backgroundColor: active ? opt.bg : T.surface,
                            color: active ? opt.text : T.apoio,
                            fontSize: FS.small, fontWeight: '700', cursor: 'pointer',
                            fontFamily: FONT.corpo,
                          }}
                        >
                          <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: opt.dot, flexShrink: 0 }} />
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Datas */}
              <CamposDeData form={form} isMobile={isMobile} />

              <CampoPrazoDoMolde form={form} isMobile={isMobile} />

              {/* Prazos colapsável */}
              <SecaoDePrazos form={form} isMobile={isMobile} dedo={dedo} />

              </>)}

              {/* Patrocinadores */}
              <EscolhaDePatrocinadores
                form={form}
                sponsors={sponsors}
                sponsorsQueryLoading={sponsorsQueryLoading}
                sponsorsQueryError={sponsorsQueryError}
              />

              {/* Copiar peças — só na duplicação, e só quando há o que copiar */}
              {modalMode === 'duplicate' && duplicateSource && readEventStats(duplicateSource).itemCount > 0 && (
                <label
                  htmlFor="copy-items"
                  style={{ display: 'flex', alignItems: 'center', gap: 10, backgroundColor: N.n3, borderRadius: R.md, padding: '12px 14px', cursor: 'pointer' }}
                >
                  <Checkbox
                    id="copy-items"
                    checked={copyItems}
                    onCheckedChange={(v) => setCopyItems(!!v)}
                    data-testid="checkbox-copy-items"
                    className="border-[#d4cfc9] bg-[#ffffff] data-[state=checked]:bg-[#c2410c] data-[state=checked]:border-[#c2410c] rounded-[4px] flex-shrink-0 h-[18px] w-[18px]"
                  />
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: FS.body, fontWeight: 700, color: T.text }}>
                      Copiar também as {readEventStats(duplicateSource).itemCount} peças
                    </span>
                    <span style={{ display: 'block', fontSize: FS.micro, color: T.second, marginTop: 1 }}>
                      As peças entram como rascunho, sem arquivos nem aprovações.
                    </span>
                  </span>
                </label>
              )}

            </div>

            <ModalFooter>
              {/* O QUE FALTA, ANTES DO CLIQUE. As validações continuam as
                  mesmas (handleSubmit) — só que antes elas apareciam como
                  toast vermelho DEPOIS de apertar Salvar, um de cada vez.
                  Aqui a pessoa vê de uma vez o que falta e decide. */}
              {!soPatrocinadoresNoModal && (() => {
                const faltam = [
                  !formData.name.trim() && 'nome',
                  !formData.startDate && 'data de início',
                  !formData.truckDepartureDate && 'saída do caminhão',
                ].filter(Boolean) as string[];
                const frase = faltam.length > 0
                  ? `Falta preencher: ${faltam.length > 1 ? `${faltam.slice(0, -1).join(', ')} e ${faltam[faltam.length - 1]}` : faltam[0]}.`
                  : hasOrderIssue
                    ? 'Há prazos fora de ordem — confira a seção Prazos.'
                    : null;
                return frase ? (
                  <p aria-live="polite" data-testid="texto-falta-no-evento" style={{ margin: 0, fontSize: FS.small, fontWeight: 600, color: TOM.alerta.text, textAlign: 'right' }}>
                    {frase}
                  </p>
                ) : null;
              })()}
              <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '12px' }}>
                <Botao variante="fantasma" tamanho={isMobile ? 'toque' : 'md'} onClick={requestCloseDialog}>
                  Cancelar
                </Botao>
                <Botao
                  type="submit"
                  variante="primario"
                  tamanho={isMobile ? 'toque' : 'md'}
                  carregando={submitPending}
                  data-testid="button-submit-event"
                >
                  {modalMode === 'edit'
                    ? (updateEventMutation.isPending ? "Salvando..." : soPatrocinadoresNoModal ? "Salvar patrocinadores" : "Salvar Alterações")
                    : modalMode === 'duplicate'
                      ? (createEventMutation.isPending ? "Duplicando..." : "Criar Cópia")
                      : (createEventMutation.isPending ? "Criando..." : "Salvar Evento")
                  }
                </Botao>
              </div>
            </ModalFooter>
          </form>
          </FreezeWhileClosing>
        </DialogContent>
      </Dialog>

      <DialogoDeDescarte form={form} isMobile={isMobile} />
    </>
  );
}
