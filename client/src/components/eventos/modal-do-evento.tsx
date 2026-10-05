// O MODAL CRIAR / EDITAR / DUPLICAR (Dialog 100% controlado). As seções
// moram ao lado: datas, prazos e patrocinadores.
import { CalendarPlus, Pencil, Copy, Building2 } from "lucide-react";
import type { Sponsor } from "@shared/schema";
import { PRIORITY } from "@/lib/status";
import { T, FS, R, N, TOM, FONT, FW, SHADOW } from "@/lib/theme";
import { alvo } from "@/hooks/use-mobile";
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
import { ROTULO_DO_CAMPO, CAMPO, saidaDepoisDoInicio } from "./campos-de-data";

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
            icon={soPatrocinadoresNoModal ? Building2 : modalMode === 'edit' ? Pencil : modalMode === 'duplicate' ? Copy : CalendarPlus}
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
            <div style={{ padding: isMobile ? '20px 16px' : '24px', display: 'flex', flexDirection: 'column', gap: isMobile ? 20 : 22, overflowY: 'auto', flex: 1, minHeight: 0, overscrollBehavior: 'contain' }}>


              {/* Só patrocinadores: nome, datas e prazos ficam de fora. */}
              {!soPatrocinadoresNoModal && (<>
              {/* Nome + Prioridade — os dois rótulos na MESMA linha de base e os
                  dois controles na mesma altura: antes o "Prioridade" descia 12px
                  (alinhamento pelo pé) e a fileira parecia torta. */}
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(240px, 1fr) auto', gap: isMobile ? 18 : 16, alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
                  <label htmlFor="event-name" style={ROTULO_DO_CAMPO}>
                    Nome do Evento
                  </label>
                  <input
                    id="event-name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Ex: Circuito Estações — Etapa 2"
                    required
                    autoComplete="off"
                    data-testid="input-event-name"
                    className="evl-campo"
                    style={{ ...CAMPO, height: alvo(40, dedo), padding: '0 14px', fontSize: dedo ? FS.lead : FS.strong, fontWeight: FW.medio }}
                  />
                </div>
                {/* Prioridade na CRIAÇÃO: o schema já a aceitava, mas o
                    formulário não tinha o campo — depois de salvar eram 4
                    interações extras para achar o card e definir o nível.
                    Resultado: "Sem prioridade" era o badge mais comum da
                    grade, esvaziando o filtro e a ordenação. */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
                  <span id="rotulo-prioridade-do-evento" style={ROTULO_DO_CAMPO}>
                    Prioridade
                  </span>
                  {/* UM controle segmentado (e não cinco botões soltos): é uma
                      escolha só. No celular a Automática ocupa a primeira linha
                      inteira e os quatro níveis dividem a segunda — antes o
                      "Urgente" caía sozinho numa linha. */}
                  <div
                    role="group"
                    aria-labelledby="rotulo-prioridade-do-evento"
                    style={{
                      display: 'grid',
                      gridTemplateColumns: isMobile ? 'repeat(4, minmax(0, 1fr))' : 'auto repeat(4, auto)',
                      gap: 2, padding: 2, borderRadius: R.md,
                      backgroundColor: T.low, border: `1px solid ${T.border}`,
                      height: isMobile ? undefined : alvo(40, dedo), boxSizing: 'border-box',
                    }}
                  >
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
                          className="evl-seg"
                          style={{
                            gridColumn: isMobile && opt.value === '' ? '1 / -1' : undefined,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                            height: isMobile ? 40 : '100%', padding: '0 11px', borderRadius: R.sm,
                            border: 'none',
                            backgroundColor: active ? (opt.value === '' ? T.surface : opt.bg) : 'transparent',
                            boxShadow: active ? `${SHADOW.sm}, inset 0 0 0 1px ${opt.value === '' ? T.border : opt.border}` : 'none',
                            color: active ? (opt.value === '' ? T.text : opt.text) : T.apoio,
                            fontSize: FS.small, fontWeight: active ? FW.rotulo : FW.forte, cursor: 'pointer',
                            fontFamily: FONT.corpo, whiteSpace: 'nowrap',
                          }}
                        >
                          <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: opt.dot, flexShrink: 0 }} />
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

            <ModalFooter
              fundo={T.bg}
              style={{ flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center', justifyContent: 'space-between', gap: isMobile ? 10 : 16, padding: isMobile ? '12px 16px' : '14px 24px' }}
            >
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
                // A data fora de ordem também entra aqui: o aviso vermelho
                // fica lá em cima, junto do campo, e quem já rolou até os
                // patrocinadores não o vê ao apertar Salvar.
                const frase = faltam.length > 0
                  ? `Falta preencher: ${faltam.length > 1 ? `${faltam.slice(0, -1).join(', ')} e ${faltam[faltam.length - 1]}` : faltam[0]}.`
                  : saidaDepoisDoInicio(formData.startDate, formData.truckDepartureDate)
                    ? 'A saída do caminhão precisa ser antes do início do evento.'
                    : hasOrderIssue
                      ? 'Há prazos fora de ordem — confira a seção Prazos.'
                      : null;
                const grave = !!frase && faltam.length === 0;
                return (
                  <p aria-live="polite" data-testid={frase ? "texto-falta-no-evento" : undefined} style={{ margin: 0, minWidth: 0, flex: 1, display: 'flex', alignItems: 'center', gap: 7, fontSize: FS.small, fontWeight: 600, lineHeight: 1.4, color: frase ? (grave ? TOM.perigo.text : TOM.alerta.text) : T.second }}>
                    {frase && <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, backgroundColor: grave ? TOM.perigo.dot : TOM.alerta.dot }} />}
                    {frase ?? (soPatrocinadoresNoModal ? '' : 'Tudo pronto para salvar.')}
                  </p>
                );
              })()}
              {soPatrocinadoresNoModal && <span style={{ flex: 1 }} />}
              <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                <Botao variante="fantasma" tamanho={isMobile ? 'toque' : 'md'} onClick={requestCloseDialog} style={{ flex: isMobile ? 1 : undefined }}>
                  Cancelar
                </Botao>
                <Botao
                  type="submit"
                  variante="primario"
                  tamanho={isMobile ? 'toque' : 'md'}
                  carregando={submitPending}
                  data-testid="button-submit-event"
                  style={{ flex: isMobile ? 1.6 : undefined }}
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
