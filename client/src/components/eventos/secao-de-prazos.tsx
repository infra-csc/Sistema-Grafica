// Os prazos dos marcos do evento, relativos à saída do caminhão (colapsável).
import { Calendar, Clock, HelpCircle, ChevronDown, ChevronUp, RotateCcw } from "lucide-react";
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

export function SecaoDePrazos({ form, isMobile, dedo }: { form: FormularioDoEventoAberto; isMobile: boolean; dedo: boolean }) {
  const {
    formData, setFormData, prazosExpanded, setPrazosExpanded, customDeadlineCount, noStart,
    orderIssues, offsetToDateStr, dateStrToOffset, openPrazoKey, setOpenPrazoKey, truckDateOnly,
  } = form;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
      <button
        type="button"
        onClick={() => setPrazosExpanded(!prazosExpanded)}
        data-testid="button-toggle-prazos"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', width: '100%', backgroundColor: N.n3, border: 'none', borderRadius: prazosExpanded ? `${R.md}px ${R.md}px 0 0` : R.md, padding: '10px 14px', cursor: 'pointer', transition: 'background-color 0.15s' }}
        onMouseEnter={e => { e.currentTarget.style.backgroundColor = T.border; }}
        onMouseLeave={e => { e.currentTarget.style.backgroundColor = N.n3; }}
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
          <span style={{ fontSize: FS.micro, color: T.second, fontWeight: '400' }}>{noStart ? 'preencha a saída do caminhão primeiro' : 'relativo à saída do caminhão'}</span>
        </div>
        {prazosExpanded
          ? <ChevronUp style={{ width: '14px', height: '14px', color: T.second, flexShrink: 0 }} />
          : <ChevronDown style={{ width: '14px', height: '14px', color: T.second, flexShrink: 0 }} />
        }
      </button>
      {prazosExpanded && (
        <div style={{ backgroundColor: N.n3, borderRadius: `0 0 ${R.md}px ${R.md}px`, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '10px', borderTop: '1px solid rgba(0,0,0,0.05)' }}>
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
                  padding: outOfOrder ? '8px 10px' : 0,
                  border: outOfOrder ? `1px solid ${TOM.alerta.dot}` : '1px solid transparent',
                  backgroundColor: outOfOrder ? TOM.alerta.bg : 'transparent',
                  borderRadius: R.sm,
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
                          style={{ display: 'flex', alignItems: 'center', gap: 5, height: alvo(30, dedo), padding: '0 10px', borderRadius: R.sm, border: openPrazoKey === key ? `1px solid ${T.accent}` : '1px solid transparent', backgroundColor: noStart ? N.n3 : (openPrazoKey === key ? T.surface : T.border), fontSize: FS.body, fontWeight: '600', color: noStart ? T.second : (dateVal ? T.text : T.second), cursor: noStart ? 'not-allowed' : 'pointer', boxShadow: openPrazoKey === key ? '0 0 0 2px rgba(249,115,22,0.18)' : 'none', transition: 'all 0.15s', fontFamily: FONT.corpo, whiteSpace: 'nowrap' as const }}
                        >
                          <Calendar style={{ width: 11, height: 11, color: noStart ? T.bdark : T.muted, flexShrink: 0 }} />
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
                            classNames={{ day_selected: 'bg-[#1c1917] text-white hover:bg-[#44403c] hover:text-white focus:bg-[#1c1917] focus:text-white', day_today: 'bg-orange-50 font-semibold' }}
                          />
                          </FreezeWhileClosing>
                        </PopoverContent>
                      )}
                    </Popover>
                    {!noStart && dateVal && (
                      <span style={{ fontSize: FS.micro, color: T.second, fontWeight: '500', whiteSpace: 'nowrap' as const }}>{fmtOffset(currentDays)}</span>
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
          <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid rgba(0,0,0,0.05)', paddingTop: '8px' }}>
            <Botao
              variante="fantasma"
              tamanho={isMobile ? 'toque' : 'sm'}
              icone={RotateCcw}
              disabled={customDeadlineCount === 0}
              motivo={customDeadlineCount === 0 ? 'Os prazos já seguem o padrão.' : undefined}
              alinharMotivo="end"
              onClick={() => setFormData({ ...formData, ...DEFAULT_DEADLINES })}
              data-testid="button-restore-default-deadlines"
            >
              Restaurar padrão ({DEFAULT_OFFSETS_LABEL})
            </Botao>
          </div>
        </div>
      )}
    </div>
  );
}
