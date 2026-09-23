// As datas do formulário de evento: início, saída do caminhão (data + hora) e
// o prazo do molde (opcional).
import { Calendar, Truck, Clock } from "lucide-react";
import { ptBR } from "date-fns/locale";
import { AJUDA_PRAZO_MOLDE } from "@shared/prazo-molde";
import { T, FS, R, N, TOM, FONT } from "@/lib/theme";
import { Botao } from "@/components/ui/botao";
import { Calendar as CalendarUI } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FreezeWhileClosing } from "@/components/modal-shell";
import { fmtDateBR, parseDateStr, toDateStr } from "./formatos";
import type { FormularioDoEventoAberto } from "./use-formulario-do-evento";

export function CamposDeData({ form, isMobile }: { form: FormularioDoEventoAberto; isMobile: boolean }) {
  const { formData, setFormData, openStartDate, setOpenStartDate, openTruckDate, setOpenTruckDate, setPrazosExpanded } = form;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {/* htmlFor → id do gatilho: sem o vínculo, o leitor de tela
            anunciava só "Selecionar data, botão", sem dizer QUAL. */}
        <label htmlFor="event-start-date" style={{ fontSize: FS.micro, fontWeight: '700', color: T.apoio, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
          Data de Início
        </label>
        <Popover open={openStartDate} onOpenChange={setOpenStartDate}>
          <PopoverTrigger asChild>
            <button
              id="event-start-date"
              type="button"
              data-testid="input-start-date"
              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', height: 40, backgroundColor: openStartDate ? T.surface : T.border, border: openStartDate ? `1px solid ${T.accent}` : '1px solid transparent', borderRadius: R.md, padding: '0 12px', fontSize: FS.body, color: formData.startDate ? T.text : T.second, fontFamily: FONT.corpo, cursor: 'pointer', textAlign: 'left' as const, boxShadow: openStartDate ? '0 0 0 2px rgba(249,115,22,0.18)' : 'none', transition: 'all 0.15s' }}
            >
              <Calendar style={{ width: 14, height: 14, color: T.muted, flexShrink: 0 }} />
              {formData.startDate ? fmtDateBR(formData.startDate) : <span style={{ color: T.second }}>Selecionar data</span>}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start" style={{ zIndex: 9999 }}>
            {/* Congelado enquanto SAI: ver popover-congelado.test.ts.
                Escolher a data fecha o popover com o modal ainda
                aberto — fora do alcance do FreezeWhileClosing do
                modal — e cada render da página mandava uma rodada
                de desanexa/reanexa de ref para dentro da subárvore
                morrendo, até o React estourar o #185. */}
            <FreezeWhileClosing open={openStartDate}>
              <CalendarUI
                mode="single"
                selected={parseDateStr(formData.startDate)}
                onSelect={date => { if (date) { setFormData({ ...formData, startDate: toDateStr(date) }); setOpenStartDate(false); } }}
                locale={ptBR}
                classNames={{ day_selected: 'bg-[#1c1917] text-white hover:bg-[#44403c] hover:text-white focus:bg-[#1c1917] focus:text-white', day_today: 'bg-orange-50 font-semibold' }}
              />
            </FreezeWhileClosing>
          </PopoverContent>
        </Popover>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <label htmlFor="event-truck-date" style={{ fontSize: FS.micro, fontWeight: '700', color: T.apoio, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
          Saída do Caminhão
        </label>
        <Popover open={openTruckDate} onOpenChange={setOpenTruckDate}>
          <PopoverTrigger asChild>
            <button
              id="event-truck-date"
              type="button"
              data-testid="input-truck-date"
              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', height: 40, backgroundColor: openTruckDate ? T.surface : T.border, border: openTruckDate ? `1px solid ${T.accent}` : '1px solid transparent', borderRadius: R.md, padding: '0 12px', fontSize: FS.body, color: formData.truckDepartureDate ? T.text : T.second, fontFamily: FONT.corpo, cursor: 'pointer', textAlign: 'left' as const, boxShadow: openTruckDate ? '0 0 0 2px rgba(249,115,22,0.18)' : 'none', transition: 'all 0.15s' }}
            >
              <Truck style={{ width: 14, height: 14, color: T.muted, flexShrink: 0 }} />
              {formData.truckDepartureDate
                ? `${fmtDateBR(formData.truckDepartureDate.slice(0, 10))} às ${formData.truckDepartureDate.slice(11, 16)}`
                : <span style={{ color: T.second }}>Selecionar data e hora</span>}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start" style={{ zIndex: 9999 }}>
            {/* Mesma cura do popover de início. */}
            <FreezeWhileClosing open={openTruckDate}>
            <CalendarUI
              mode="single"
              selected={parseDateStr(formData.truckDepartureDate?.slice(0, 10) || '')}
              onSelect={date => {
                if (date) {
                  const timePart = formData.truckDepartureDate?.slice(11, 16) || '08:00';
                  const firstFill = !formData.truckDepartureDate;
                  setFormData({ ...formData, truckDepartureDate: toDateStr(date) + 'T' + timePart });
                  // Abre os prazos só no PRIMEIRO preenchimento —
                  // antes reabria a cada correção de data, mesmo
                  // depois de o usuário ter recolhido a seção.
                  if (firstFill) setPrazosExpanded(true);
                }
              }}
              locale={ptBR}
              classNames={{ day_selected: 'bg-[#1c1917] text-white hover:bg-[#44403c] hover:text-white focus:bg-[#1c1917] focus:text-white', day_today: 'bg-orange-50 font-semibold' }}
            />
            <div style={{ borderTop: `1px solid ${N.n3}`, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Clock style={{ width: 12, height: 12, color: T.muted, flexShrink: 0 }} />
              <label htmlFor="truck-time" style={{ fontSize: FS.small, color: T.second, fontWeight: 600, flexShrink: 0 }}>Horário:</label>
              <input
                id="truck-time"
                type="text"
                inputMode="numeric"
                placeholder="HH:MM"
                maxLength={5}
                data-testid="input-truck-time"
                value={formData.truckDepartureDate?.slice(11, 16) || ''}
                onChange={e => {
                  let v = e.target.value.replace(/[^\d:]/g, '');
                  if (v.length === 2 && !v.includes(':')) v = v + ':';
                  if (v.length > 5) return;
                  const datePart = formData.truckDepartureDate?.slice(0, 10) || '';
                  if (!datePart) return;
                  if (/^\d{2}:\d{2}$/.test(v)) {
                    const [hh, mm] = v.split(':').map(Number);
                    const h = String(Math.min(23, hh)).padStart(2, '0');
                    const mi = String(Math.min(59, mm)).padStart(2, '0');
                    setFormData({ ...formData, truckDepartureDate: `${datePart}T${h}:${mi}` });
                  } else {
                    setFormData({ ...formData, truckDepartureDate: `${datePart}T${v}` });
                  }
                }}
                onBlur={e => {
                  const datePart = formData.truckDepartureDate?.slice(0, 10) || '';
                  if (!datePart) return;
                  const match = e.target.value.match(/^(\d{1,2})(?::(\d{0,2}))?$/);
                  if (match) {
                    const h = String(Math.min(23, parseInt(match[1] || '0', 10))).padStart(2, '0');
                    const mi = String(Math.min(59, parseInt(match[2] || '0', 10))).padStart(2, '0');
                    setFormData({ ...formData, truckDepartureDate: `${datePart}T${h}:${mi}` });
                    return;
                  }
                  // Valor irrecuperável (":" sozinho, vazio): volta
                  // para 08:00 em vez de deixar "…T:" navegar até
                  // o insert do banco.
                  setFormData({ ...formData, truckDepartureDate: `${datePart}T08:00` });
                }}
                /* Sem onFocus inline: o anel vinha do handler e
                   nunca era removido no blur, deixando o campo
                   permanentemente com cara de ativo. O
                   :focus-visible global (index.css) já cuida. */
                style={{ width: 68, height: 34, textAlign: 'center', border: `1px solid ${T.border}`, borderRadius: R.sm, fontSize: FS.strong, fontWeight: 700, fontFamily: FONT.corpo, letterSpacing: '0.05em' }}
              />
              <Botao
                variante="primario"
                tamanho={isMobile ? 'toque' : 'sm'}
                onClick={() => setOpenTruckDate(false)}
                style={{ marginLeft: 'auto' }}
              >
                Ok
              </Botao>
            </div>
          </FreezeWhileClosing>
          </PopoverContent>
        </Popover>
        {(() => {
          const s = formData.startDate;
          const t = formData.truckDepartureDate?.substring(0, 10);
          if (s && t && t >= s) {
            return <p role="alert" style={{ margin: 0, fontSize: FS.small, color: TOM.perigo.text, fontWeight: 600 }}>Deve ser pelo menos 1 dia antes do início do evento.</p>;
          }
          return null;
        })()}
      </div>
    </div>
  );
}

// PRAZO DO MOLDE (dono, 22/09): opcional, só para evento com molde. Usado no
// fluxo do molde (Arte, Revisão Final, Gráfica) — NÃO entra na Gestão de
// Prazos. Um dia, sem hora.
export function CampoPrazoDoMolde({ form, isMobile }: { form: FormularioDoEventoAberto; isMobile: boolean }) {
  const { formData, setFormData } = form;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <label htmlFor="event-prazo-molde" style={{ fontSize: FS.micro, fontWeight: '700', color: T.apoio, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
        Prazo do molde (opcional)
      </label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          id="event-prazo-molde"
          type="date"
          data-testid="input-prazo-molde"
          value={formData.prazoMolde}
          onChange={(e) => setFormData({ ...formData, prazoMolde: e.target.value })}
          aria-describedby="ajuda-prazo-molde"
          style={{ height: 40, minWidth: 180, backgroundColor: T.border, border: '1px solid transparent', borderRadius: R.md, padding: '0 12px', fontSize: 16, color: formData.prazoMolde ? T.text : T.second, fontFamily: FONT.corpo }}
        />
        {formData.prazoMolde && (
          <Botao
            variante="secundario"
            tamanho={isMobile ? 'toque' : 'md'}
            data-testid="button-limpar-prazo-molde"
            onClick={() => setFormData({ ...formData, prazoMolde: "" })}
          >
            Limpar
          </Botao>
        )}
      </div>
      <p id="ajuda-prazo-molde" style={{ margin: 0, fontSize: FS.small, color: T.second, lineHeight: 1.4 }}>
        {AJUDA_PRAZO_MOLDE}
      </p>
    </div>
  );
}
