// ─────────────────────────────────────────────────────────────────────────────
// AGENDA OPERACIONAL — saída do caminhão e dia do evento, e a timeline dos
// seis marcos com quantas peças ainda não passaram por cada um (clicável:
// filtra a lista por aquele gargalo).
// ─────────────────────────────────────────────────────────────────────────────
import type { Dispatch, SetStateAction } from "react";
import { Truck, Calendar } from "lucide-react";
import { Selo } from "@/components/ui/selo";
import { parseDateLocal } from "@/lib/utils";
import { T, N, TOM, FONT, FS, FW, R, SHADOW } from "@/lib/theme";
import { plural } from "./regras";
import type { EventoDoDetalhe, Marco } from "./tipos";

export function AgendaOperacional({ event, isEventClosed, isMobile, marcosDoEvento, atrasDoMarco, marcoFiltro, setMarcoFiltro }: {
  event: EventoDoDetalhe;
  isEventClosed: boolean;
  isMobile: boolean;
  marcosDoEvento: { marcos: Marco[]; countdownDays: number } | null;
  atrasDoMarco: number[];
  marcoFiltro: number | null;
  setMarcoFiltro: Dispatch<SetStateAction<number | null>>;
}) {
  // A agenda usa os tokens da casa direto: a paleta e a fonte próprias
  // que ela tinha (e o apelido local de T que sobrou delas) saíram.

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const departure = new Date(event.truckDepartureDate);
  const depDay = new Date(departure); depDay.setHours(0, 0, 0, 0);
  const countdownDays = Math.ceil((depDay.getTime() - today.getTime()) / 86400000);
  const depLabel = departure.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
  const depTime = departure.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
  // String(): o schema tipa startDate como Date, mas o JSON da API
  // entrega string — em runtime é identidade.
  const startLabel = parseDateLocal(String(event.startDate)).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

  // Os SEIS marcos vêm de calcularMarcos (fonte única @shared/prazo-dates),
  // já calculados no memo que o cabeçalho também lê. A lista escrita à
  // mão que vivia aqui tinha CINCO — faltava a Finalização (−10).
  const milestones = marcosDoEvento?.marcos ?? [];

  const nextIndex = milestones.findIndex(m => !m.isPast);
  const progressFrac = nextIndex === -1 ? 1 : nextIndex === 0 ? 0 : nextIndex / (milestones.length - 1);

  // Evento encerrado (concluído ou já iniciado) é HISTÓRIA: a saída no
  // passado não é "atraso" — o caminhão já foi. Mostrar "Atrasado 90d"
  // em vermelho num evento finalizado é alarme falso que ensina o
  // usuário a ignorar o vermelho de verdade.
  const isHistorical = event.status === 'completed' || isEventClosed
    || parseDateLocal(String(event.startDate)) < today;
  // Guarda de sanidade: ano 0206 no banco (typo de 2026) virava
  // "Atrasado 664730d". Dado absurdo pede correção, não contagem.
  const depYear = depDay.getFullYear();
  const depInvalid = depYear < 2000 || depYear > 2100;
  const countdownColor = depInvalid
    ? TOM.perigo.text
    : isHistorical
    ? T.second
    // TOM.alerta.text e não o laranja claro antigo (3,2:1): "Faltam
    // 2 dias" é texto de 13px, e é o aviso que mais importa ler.
    : countdownDays < 0 ? TOM.perigo.text : countdownDays <= 3 ? TOM.alerta.text : T.second;
  const countdownText = depInvalid
    ? 'Data de saída inválida — corrija o evento'
    : countdownDays < 0
    ? (isHistorical ? `Saiu há ${Math.abs(countdownDays)}d` : `Atrasado ${Math.abs(countdownDays)}d`)
    : countdownDays === 0 ? 'Hoje'
    : `Faltam ${countdownDays} dia${countdownDays !== 1 ? 's' : ''}`;

  // DENSIDADE NO CELULAR: os dois cartões tinham 210px de largura
  // mínima e empilhavam — ~200px de altura antes da timeline, que já
  // repete as datas, e a lista de peças ia parar na terceira tela.
  // Lado a lado (metade da linha cada), sem o ladrilho do ícone e com
  // a data a 18px, a agenda cabe numa faixa só. No desktop, igual.
  const cartaoLogistica: React.CSSProperties = {
    flex: isMobile ? '1 1 0' : '0 0 auto', minWidth: isMobile ? 0 : 210,
    backgroundColor: T.surface, border: `1px solid ${T.border}`, borderRadius: R.lg,
    padding: isMobile ? '12px 14px' : '20px 24px', display: 'flex', alignItems: 'center', gap: isMobile ? 0 : 18,
    // Sem sombra de hover: o cartão não é clicável, e realce é promessa de clique.
    boxShadow: SHADOW.sm,
  };
  const ladrilhoLogistica: React.CSSProperties = {
    width: 50, height: 50, borderRadius: R.lg, display: isMobile ? 'none' : 'flex',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  };

  return (
    <div style={{ marginTop: '8px' }}>

      {/* Section divider */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '18px' }}>
        <span style={{ fontSize: FS.micro, fontWeight: FW.forte, textTransform: 'uppercase', letterSpacing: '0.16em', color: T.second, fontFamily: FONT.corpo, whiteSpace: 'nowrap' }}>
          Agenda Operacional
        </span>
        <div style={{ flex: 1, height: '1px', backgroundColor: T.border }} />
      </div>

      {/* ── Cards de logística ── */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '16px', alignItems: 'stretch' }}>

        {/* Card: SAÍDA DO CAMINHÃO */}
        <div style={cartaoLogistica}>
          <div aria-hidden="true" style={{ ...ladrilhoLogistica, backgroundColor: TOM.laranja.bg }}>
            <Truck size={22} color={T.accent} />
          </div>
          <div>
            <div style={{ fontSize: FS.micro, fontWeight: FW.forte, textTransform: 'uppercase', letterSpacing: isMobile ? '0.06em' : '0.14em', color: T.second, marginBottom: '7px', fontFamily: FONT.corpo }}>
              Saída do Caminhão
            </div>
            <div style={{ fontSize: isMobile ? FS.title : FS.h2, fontWeight: FW.rotulo, color: T.text, fontFamily: FONT.display, lineHeight: 1.1, letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums' }}>
              {depLabel}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px 8px', marginTop: '6px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: FS.body, fontWeight: FW.corpo, color: T.second, fontFamily: FONT.corpo, letterSpacing: '0.01em' }}>{depTime}</span>
              <span style={{ width: '3px', height: '3px', borderRadius: '50%', backgroundColor: T.bdark, display: 'inline-block', flexShrink: 0 }} />
              <span style={{ fontSize: FS.body, fontWeight: FW.medio, color: countdownColor, fontFamily: FONT.corpo, letterSpacing: '0.01em' }}>
                {countdownText}
              </span>
            </div>
          </div>
        </div>

        {/* Card: INÍCIO DA MONTAGEM */}
        <div style={cartaoLogistica}>
          <div aria-hidden="true" style={{ ...ladrilhoLogistica, backgroundColor: N.n3 }}>
            <Calendar size={22} color={T.second} />
          </div>
          <div>
            <div style={{ fontSize: FS.micro, fontWeight: FW.forte, textTransform: 'uppercase', letterSpacing: isMobile ? '0.06em' : '0.14em', color: T.second, marginBottom: '7px', fontFamily: FONT.corpo }}>
              Dia do Evento
            </div>
            <div style={{ fontSize: isMobile ? FS.title : FS.h2, fontWeight: FW.rotulo, color: T.text, fontFamily: FONT.display, lineHeight: 1.1, letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums' }}>
              {startLabel}
            </div>
            <div style={{ marginTop: '6px' }}>
              <span style={{ fontSize: FS.body, fontWeight: FW.corpo, color: T.second, fontFamily: FONT.corpo, letterSpacing: '0.01em' }}>Início do evento</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Timeline de Prazos ── */}
      <div style={{ backgroundColor: T.surface, border: `1px solid ${T.border}`, borderRadius: R.lg, padding: isMobile ? '16px 8px 12px' : '22px 28px', boxShadow: SHADOW.sm }}>
        {/* No celular os seis marcos passam da largura e rolam de lado
            aqui dentro: região rolável precisa ser alcançável pelo
            teclado (setas), senão os marcos da direita ficam fora. */}
        <div
          role={isMobile ? 'region' : undefined}
          aria-label={isMobile ? 'Marcos de prazo do evento' : undefined}
          tabIndex={isMobile ? 0 : undefined}
          style={{ overflowX: 'auto', paddingBottom: '4px' }}
        >
          <div style={{ position: 'relative', display: 'flex', minWidth: '480px' }}>

            {/* Track base */}
            <div style={{
              position: 'absolute', top: '18px',
              left: `calc(100% / ${milestones.length} / 2)`,
              right: `calc(100% / ${milestones.length} / 2)`,
              height: '1.5px', backgroundColor: T.bdark, zIndex: 0,
            }} />
            {/* Progress fill */}
            {progressFrac > 0 && (
              <div style={{
                position: 'absolute', top: '18px',
                left: `calc(100% / ${milestones.length} / 2)`,
                width: `calc(${progressFrac} * (100% - 100% / ${milestones.length}))`,
                height: '1.5px', backgroundColor: T.bdark, zIndex: 1,
              }} />
            )}

            {milestones.map(({ key: marcoKey, label, date, adjusted, isPast, isOverdue }, i) => {
              const isNext = i === nextIndex;
              const dateStr = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
              // Quantas peças AINDA NÃO passaram por este marco, e o tom:
              // vencido com peça atrás é atraso real (vermelho); o atual
              // é o trabalho de agora (laranja); futuro é só contagem.
              const atras = atrasDoMarco[i] ?? 0;
              const selecionado = marcoFiltro === i;
              const clicavel = atras > 0 && !isHistorical;
              const tomPilula = isOverdue && atras > 0
                ? { color: TOM.perigo.text, bg: TOM.perigo.bg, border: TOM.perigo.border }
                : isNext
                ? { color: T.accentText, bg: TOM.laranja.bg, border: TOM.laranja.border }
                : { color: T.apoio, bg: N.n2, border: T.border };
              const tituloMarco = (() => {
                const base = adjusted === 'fri' ? `${label} — movido de sáb para sex` : adjusted === 'mon' ? `${label} — movido de dom para seg` : label;
                if (atras === 0) return `${base} — nenhuma peça atrás deste marco`;
                const frase = `${atras} ${plural(atras, 'peça ainda não passou', 'peças ainda não passaram')} por este marco`;
                return clicavel ? `${base} — ${frase}. ${selecionado ? 'Clique para ver todas as peças de novo' : 'Clique para ver só essas'}` : `${base} — ${frase}`;
              })();

              let dotBg: string, dotBorder: string, dotSize: number;
              let labelCol: string, dateCol: string, labelW: number;
              let glowColor = '';

              if (isNext) {
                dotBg = T.accent; dotBorder = T.accent; dotSize = 22;
                // As CORES DE TEXTO da timeline usam os tons escuros
                // (AA em 10–11px); o laranja da marca (T.accent) fica
                // na bolinha e no brilho, que são objeto gráfico.
                labelCol = T.text; dateCol = T.accentText; labelW = FW.forte;
                glowColor = 'rgba(249,115,22,0.18)';
              } else if (isOverdue) {
                dotBg = TOM.laranja.bg; dotBorder = TOM.laranja.dot; dotSize = 14;
                labelCol = TOM.alerta.text; dateCol = TOM.alerta.text; labelW = FW.medio;
              } else if (isPast) {
                // Evento encerrado: prazos passados viram "cumpridos"
                // (verde suave) em vez de cinza apagado — a agenda de um
                // evento finalizado conta história, não pendência.
                if (isHistorical) {
                  dotBg = TOM.esmeralda.bg; dotBorder = TOM.esmeralda.dot; dotSize = 12;
                  labelCol = T.apoio; dateCol = TOM.turquesa.text; labelW = FW.corpo;
                } else {
                  // Passado sem atraso: rebaixado pelo PESO e pela
                  // bolinha pequena, não por um cinza ilegível (#B8B2A8
                  // dava 2,1:1).
                  dotBg = T.bdark; dotBorder = T.bdark; dotSize = 10;
                  labelCol = T.second; dateCol = T.second; labelW = FW.corpo;
                }
              } else {
                dotBg = T.surface; dotBorder = T.bdark; dotSize = 12;
                labelCol = T.second; dateCol = T.second; labelW = FW.corpo;
              }

              return (
                <div
                  key={marcoKey}
                  title={tituloMarco}
                  role={clicavel ? 'button' : undefined}
                  tabIndex={clicavel ? 0 : undefined}
                  aria-pressed={clicavel ? selecionado : undefined}
                  data-testid={`marco-${marcoKey}`}
                  onClick={clicavel ? () => setMarcoFiltro(selecionado ? null : i) : undefined}
                  onKeyDown={clicavel ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setMarcoFiltro(selecionado ? null : i); } } : undefined}
                  style={{
                    flex: 1, minWidth: 96, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', zIndex: 2,
                    padding: '4px 4px 8px', borderRadius: R.md,
                    backgroundColor: selecionado ? TOM.laranja.bg : 'transparent',
                    boxShadow: selecionado ? `inset 0 0 0 1px ${TOM.laranja.border}` : 'none',
                    cursor: clicavel ? 'pointer' : 'default',
                  }}
                >
                  {/* Dot — 40px container so all centers align on track */}
                  <div style={{ width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', marginBottom: '10px' }}>
                    {glowColor && (
                      <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', backgroundColor: glowColor, filter: 'blur(6px)' }} />
                    )}
                    <div style={{
                      width: `${dotSize}px`, height: `${dotSize}px`, borderRadius: '50%',
                      backgroundColor: dotBg,
                      border: dotSize <= 10 ? 'none' : `2px solid ${dotBorder}`,
                      boxShadow: isNext ? `0 0 0 5px rgba(249,115,22,0.12)` : 'none',
                      position: 'relative', zIndex: 1,
                    }} />
                  </div>

                  {/* Label */}
                  <span style={{
                    fontSize: FS.micro, fontWeight: labelW, textTransform: 'uppercase',
                    letterSpacing: '0.07em', color: labelCol,
                    textAlign: 'center', lineHeight: 1.45,
                    fontFamily: FONT.corpo,
                    maxWidth: '88px', display: 'block',
                  }}>
                    {label}
                  </span>

                  {/* Date */}
                  <span style={{
                    fontSize: FS.small, fontWeight: isNext ? FW.forte : FW.corpo,
                    color: dateCol, fontFamily: FONT.mono,
                    marginTop: '5px', display: 'block', letterSpacing: '0.03em',
                  }}>
                    {dateStr}
                  </span>
                  {/* A pílula: quantas peças ainda não passaram por aqui.
                      Sem peça atrás, nenhuma pílula — zero não é notícia. */}
                  {atras > 0 && (
                    <Selo
                      data-testid={`chip-atras-${marcoKey}`}
                      cores={{ bg: tomPilula.bg, text: tomPilula.color, border: tomPilula.border }}
                      style={{ marginTop: 6, fontWeight: FW.rotulo, fontFamily: FONT.mono, padding: '1px 8px', lineHeight: 1.5 }}
                    >
                      {atras} {plural(atras, 'peça', 'peças')}
                    </Selo>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        {/* O FILTRO POR MARCO SE ANUNCIA. A pílula clicável só dizia
            que era clicável no `title` — ninguém descobria que um
            clique mostra exatamente as peças atrasadas daquele marco. */}
        {!isHistorical && milestones.some((_, i) => (atrasDoMarco[i] ?? 0) > 0) && (
          <p style={{ margin: '10px 0 0', fontSize: FS.meta, color: T.second, textAlign: 'center' }}>
            {marcoFiltro !== null
              ? 'Mostrando só as peças atrás do marco escolhido — clique nele de novo para ver todas.'
              : 'Clique num marco com peças para ver só as que ainda não passaram por ele.'}
          </p>
        )}
      </div>

    </div>
  );
}
