// Os prazos dos marcos do evento, relativos à saída do caminhão (colapsável).
import { Calendar, Clock, HelpCircle, ChevronDown, RotateCcw } from "lucide-react";
import { ptBR } from "date-fns/locale";
import { T, FS, R, N, TOM, FONT } from "@/lib/theme";
import { alvo } from "@/hooks/use-mobile";
import { Botao } from "@/components/ui/botao";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Calendar as CalendarUI } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FreezeWhileClosing } from "@/components/modal-shell";
import { DEFAULT_DEADLINES, DEFAULT_OFFSETS_LABEL, MARCO_FIELDS } from "./constantes";
import { fmtDateBR, fmtOffset, parseDateStr, toDateStr } from "./formatos";
import type { FormularioDoEventoAberto } from "./use-formulario-do-evento";
import { CALENDARIO, CAMPO } from "./campos-de-data";

export function SecaoDePrazos({ form, isMobile, dedo }: { form: FormularioDoEventoAberto; isMobile: boolean; dedo: boolean }) {
  const {
    formData, setFormData, prazosExpanded, setPrazosExpanded, customDeadlineCount, noStart,
    orderIssues, offsetToDateStr, dateStrToOffset, openPrazoKey, setOpenPrazoKey, truckDateOnly,
  } = form;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0, border: `1px solid ${T.border}`, borderRadius: R.md, overflow: 'hidden', backgroundColor: T.surface }}>
      <button
        type="button"
        onClick={() => setPrazosExpanded(!prazosExpanded)}
        data-testid="button-toggle-prazos"
        aria-expanded={prazosExpanded}
        className="evl-opcao"
        data-marcado="false"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', width: '100%', minHeight: alvo(44, dedo), backgroundColor: T.bg, border: 'none', padding: '10px 14px', cursor: 'pointer', textAlign: 'left' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', minWidth: 0 }}>
          <Clock style={{ width: '13px', height: '13px', color: T.accent, flexShrink: 0 }} />
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: FS.micro, fontWeight: '700', color: T.apoio, textTransform: 'uppercase', letterSpacing: '0.12em' }}>Prazos</span>
            <Tooltip>
              <TooltipTrigger asChild>
                {/* A ÚNICA explicação de por que a data escolhida
                    diverge da exibida vivia num <span> sem
                    tabIndex — inalcançável por teclado, já que
                    Radix abre em hover/focus. Aqui ele é focável
                    (tabIndex=0 + role/aria-label), mas NÃO é um
                    <button>: este bloco já está DENTRO do botão que
                    expande os prazos, e <button> dentro de <button>
                    é aninhamento inválido (o React reclama em
                    validateDOMNesting e o alvo de clique fica
                    ambíguo). */}
                <span
                  role="button"
                  tabIndex={0}
                  aria-label="Como funciona o ajuste de fim de semana"
                  onClick={e => { e.stopPropagation(); e.preventDefault(); }}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation(); }}
                  style={{ display: 'inline-flex', alignItems: 'center', background: 'transparent', border: 'none', padding: 2, cursor: 'help' }}
                >
                  <HelpCircle style={{ width: '12px', height: '12px', color: T.second }} />
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" style={{ maxWidth: '240px', fontSize: FS.body, lineHeight: '1.5' }}>
                Prazos que caírem no <strong>sábado</strong> são antecipados para <strong>sexta-feira</strong>. Os que caírem no <strong>domingo</strong> são adiados para <strong>segunda-feira</strong>. Exceção: Produção Gráfica funciona todos os dias.
              </TooltipContent>
            </Tooltip>
          </span>
          {customDeadlineCount > 0 && (
            <span style={{ fontSize: FS.micro, fontWeight: '700', color: T.accentText, background: TOM.laranja.bg, border: `1px solid ${TOM.laranja.border}`, borderRadius: R.pill, padding: '1px 8px', whiteSpace: 'nowrap' }}>
              {customDeadlineCount} personalizado{customDeadlineCount > 1 ? 's' : ''}
            </span>
          )}
          <span style={{ fontSize: FS.small, color: T.second, fontWeight: 400, flexBasis: isMobile ? '100%' : undefined }}>{noStart ? 'Preencha a saída do caminhão primeiro.' : 'Contados a partir da saída do caminhão.'}</span>
        </div>
        <ChevronDown aria-hidden="true" style={{ width: 16, height: 16, color: T.second, flexShrink: 0, transform: prazosExpanded ? 'rotate(180deg)' : 'none', transition: 'transform var(--dur-media) var(--ease-saida)' }} />
      </button>
      {prazosExpanded && (
        <div style={{ padding: isMobile ? '4px 12px 12px' : '4px 14px 12px', display: 'flex', flexDirection: 'column', borderTop: `1px solid ${T.border}` }}>
          {MARCO_FIELDS.map(({ field, key, label, desc, color, allDays }, idx) => {
            const currentDays = Number(formData[field]);
            const dateVal = offsetToDateStr(currentDays, allDays);
            // Detecta se o ajuste de fim de semana moveu a data.
            const rawVal = offsetToDateStr(currentDays, true);
            const weekendAdjusted = !allDays && !!dateVal && rawVal !== dateVal;
            const rawDate = rawVal ? parseDateStr(rawVal) : undefined;
            const outOfOrder = orderIssues[idx];
            return (
              <div
                key={field}
                style={{
                  display: 'flex',
                  flexDirection: isMobile ? 'column' : 'row',
                  alignItems: isMobile ? 'stretch' : 'center',
                  justifyContent: 'space-between',
                  gap: isMobile ? '6px' : '12px',
                  padding: outOfOrder ? '10px' : '10px 0',
                  margin: outOfOrder ? '4px -10px' : 0,
                  border: outOfOrder ? `1px solid ${TOM.alerta.border}` : 'none',
                  borderBottom: outOfOrder ? `1px solid ${TOM.alerta.border}` : (idx < MARCO_FIELDS.length - 1 ? `1px solid ${N.n3}` : 'none'),
                  backgroundColor: outOfOrder ? TOM.alerta.bg : 'transparent',
                  borderRadius: outOfOrder ? R.sm : 0,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: color, flexShrink: 0 }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: FS.body, fontWeight: '600', color: T.text, lineHeight: 1.2 }}>{label}</div>
                    <div style={{ fontSize: FS.micro, color: T.second, lineHeight: 1.2, marginTop: '1px' }}>{desc}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: isMobile ? 'flex-start' : 'flex-end', gap: '2px', flexShrink: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                    <Popover open={openPrazoKey === key} onOpenChange={o => setOpenPrazoKey(o ? key : null)}>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          data-testid={`input-${field}`}
                          disabled={noStart}
                          className="evl-campo"
                          data-aberto={openPrazoKey === key}
                          aria-label={`Prazo de ${label}${dateVal ? `: ${fmtDateBR(dateVal)}` : ''}`}
                          style={{ ...CAMPO, width: isMobile ? undefined : 132, display: 'flex', alignItems: 'center', gap: 7, height: alvo(32, dedo), padding: '0 10px', borderRadius: R.sm, backgroundColor: noStart ? N.n2 : T.surface, fontSize: FS.body, fontWeight: 600, color: noStart ? T.second : (dateVal ? T.text : T.second), cursor: noStart ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' as const, fontVariantNumeric: 'tabular-nums' }}
                        >
                          <Calendar aria-hidden="true" style={{ width: 12, height: 12, color: noStart ? T.bdark : T.second, flexShrink: 0 }} />
                          {dateVal ? fmtDateBR(dateVal) : (noStart ? '—' : 'Selecionar')}
                        </button>
                      </PopoverTrigger>
                      {!noStart && (
                        <PopoverContent className="w-auto p-0" align={isMobile ? 'start' : 'end'} style={{ zIndex: 9999 }}>
                          {/* Mesma cura: seis destes abrem e fecham
                              com o modal aberto. */}
                          <FreezeWhileClosing open={openPrazoKey === key}>
                          <CalendarUI
                            mode="single"
                            selected={parseDateStr(dateVal)}
                            disabled={d => !!(truckDateOnly && toDateStr(d) > truckDateOnly)}
                            onSelect={date => {
                              if (date) {
                                setFormData({ ...formData, [field]: dateStrToOffset(toDateStr(date)) });
                                setOpenPrazoKey(null);
                              }
                            }}
                            locale={ptBR}
                            classNames={CALENDARIO}
                          />
                          </FreezeWhileClosing>
                        </PopoverContent>
                      )}
                    </Popover>
                    {!noStart && dateVal && (
                      <span style={{ fontSize: FS.small, color: T.second, fontWeight: 500, whiteSpace: 'nowrap' as const, minWidth: 78, fontVariantNumeric: 'tabular-nums' }}>{fmtOffset(currentDays)}</span>
                    )}
                  </div>
                  {weekendAdjusted && rawDate && (
                    <span style={{ fontSize: FS.micro, color: T.second }}>
                      Cairia {rawDate.getDay() === 6 ? 'no sábado — antecipado para sexta' : 'no domingo — adiado para segunda'} ({fmtDateBR(dateVal)})
                    </span>
                  )}
                  {outOfOrder && (
                    <span style={{ fontSize: FS.micro, color: TOM.alerta.text, fontWeight: '700' }}>
                      Deve vir depois de {MARCO_FIELDS[idx - 1].label} — confira a ordem
                    </span>
                  )}
                </div>
              </div>
            );
          })}
          <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: `1px solid ${N.n3}`, paddingTop: 10 }}>
            <Botao
              variante="fantasma"
              tamanho={isMobile ? 'toque' : 'sm'}
              icone={RotateCcw}
              disabled={customDeadlineCount === 0}
              motivo={customDeadlineCount === 0 ? 'Os prazos já seguem o padrão.' : undefined}
              alinharMotivo="end"
              onClick={() => setFormData({ ...formData, ...DEFAULT_DEADLINES })}
              data-testid="button-restore-default-deadlines"
              title={`Padrão: ${DEFAULT_OFFSETS_LABEL} dias da saída do caminhão`}
            >
              {/* No celular os seis números não cabem na linha (cortavam na borda). */}
              {isMobile ? 'Restaurar o padrão' : `Restaurar padrão (${DEFAULT_OFFSETS_LABEL})`}
            </Botao>
          </div>
        </div>
      )}
    </div>
  );
}
