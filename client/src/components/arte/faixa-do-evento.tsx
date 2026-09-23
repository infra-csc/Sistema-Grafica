import { Fragment } from "react";
import { Info, Truck } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Selo } from "@/components/ui/selo";
import { alvo } from "@/hooks/use-mobile";
import { ARTE_MARCOS_FAIXA, phaseDeadline } from "@/lib/arte-rules";
import { parseDateLocal, toUTCDisplayDate } from "@/lib/utils";
import { T, N, FS, FONT } from "@/lib/theme";
import { semaforoPrazo } from "./constantes";
import type { EventoDaPeca } from "./tipos";

/**
 * A faixa no topo de cada bloco de evento: o nome, o que falta nesta fase, a
 * saída, o marco DESTA fase e as datas do evento num popover.
 */
export function FaixaDoEvento({ bloco, prog, evTotal, tabId, hoje, emCartoes, dedo }: {
  bloco: { eventName: string; eventObj: EventoDaPeca | null };
  prog: { semThumb: number; semFinal: number } | undefined;
  evTotal: number;
  tabId: string;
  hoje: Date;
  emCartoes: boolean;
  dedo: boolean;
}) {
  const prazo = phaseDeadline(bloco.eventObj, tabId, hoje);
  // Só o que FALTA. "1 sem thumb · 0 com thumb" gastava metade da
  // frase afirmando que zero peças estão prontas; e quando tudo já
  // está resolvido a frase virava "0 sem thumb · 5 com thumb", que
  // é ruído puro numa faixa de evento. Nada a fazer, nada escrito.
  const faltamArquivo = tabId === "finalizar-layouts" || tabId === "finalizados";
  const quantosFaltam = faltamArquivo ? (prog?.semFinal ?? 0) : (prog?.semThumb ?? 0);
  const faltando = quantosFaltam > 0
    ? `${quantosFaltam} de ${evTotal} ${faltamArquivo ? 'sem arquivo final' : 'sem thumb'}`
    : null;
  // CLARA. Ela já foi laranja, e o problema real daquela
  // versão era contraste: a data e a saída em branco 0,85
  // davam ~2,5:1. A resposta na época foi escurecer o fundo
  // até o branco passar — o que resolveu o contraste e criou
  // outro problema: uma barra quase preta acima de cada bloco
  // da lista, mais pesada que qualquer dado dentro dela.
  //
  // Texto escuro sobre fundo claro resolve os dois de uma vez,
  // e devolve o destaque para os três chips de marco — que
  // eram exatamente o que a faixa escura estava sufocando.
  return (
    <div style={{
      padding: '12px 18px',
      backgroundColor: T.bg,
      borderBottom: `1px solid ${N.n3}`,
      display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        {/* A ESTRELA LARANJA CHEIA SAIU, e a caixa alta do nome
            também. Uma estrela preenchida na cor de atenção antes
            de CADA bloco não distinguia evento nenhum — todos a
            tinham —, e o nome em versalete gritava mais alto que o
            prazo ao lado, que é o dado que decide a ordem. */}
        <span title={bloco.eventName} style={{ color: T.text, fontFamily: FONT.display, fontWeight: 700, fontSize: FS.strong, letterSpacing: '-0.02em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {bloco.eventName}
        </span>
        {/* Quanto daquele evento já está resolvido NESTA fase. */}
        {faltando && (
          <span style={{ fontSize: 11, fontWeight: 600, color: T.second, whiteSpace: 'nowrap' }}>
            {faltando}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: emCartoes ? 8 : 14, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        {/* MENOS É MAIS (dono, 22/09). A faixa trazia a data do
            evento, a saída e os TRÊS marcos em pílulas coloridas
            — quatro cores e cinco datas por evento, para um dado
            que a Arte usa um só: o marco DESTA fase. Fica ele, e
            a saída (a âncora de todos os marcos) no desktop. A
            data do evento e os outros dois marcos continuam a um
            passar de mouse, no `title` do marco. */}
        {!emCartoes && bloco.eventObj?.truckDepartureDate && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: T.apoio, fontSize: 11, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
            <Truck aria-hidden="true" style={{ width: 12, height: 12 }} />
            {/* Bloco do Kit: a data que manda é a entrega do material (15/09). */}
            {bloco.eventObj.datasDoKit
              ? <>Entrega do material: {new Date(bloco.eventObj.truckDepartureDate).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</>
              : <>Saída: {toUTCDisplayDate(bloco.eventObj.truckDepartureDate).toLocaleDateString('pt-BR')} às {toUTCDisplayDate(bloco.eventObj.truckDepartureDate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</>}
          </span>
        )}
        {/* Os marcos saem de `phaseDeadline` (ARTE_MARCOS_FAIXA),
            a mesma conta da coluna Prazo — nunca aritmética
            local, que já divergiu no ajuste de fim de semana. */}
        {prazo && (() => {
          const s = semaforoPrazo(prazo.diff);
          const ds = prazo.date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
          const todos = [
            bloco.eventObj?.startDate ? `Evento: ${parseDateLocal(bloco.eventObj.startDate).toLocaleDateString('pt-BR')}` : null,
            ...(bloco.eventObj?.truckDepartureDate ? ARTE_MARCOS_FAIXA : []).map(fase => {
              const m = phaseDeadline(bloco.eventObj, fase, hoje);
              return m ? `${m.label}: ${m.date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}` : null;
            }),
          ].filter(Boolean).join(' · ');
          return (
            <Selo data-testid="marco-da-fase" title={`Marco desta fase. ${todos}`} cores={s}
              style={{ padding: '3px 9px', fontWeight: 700 }}>
              {prazo.label} · {ds}{prazo.diff >= 0 && prazo.diff <= 14 && <span style={{ opacity: 0.8, fontWeight: 500 }}> ({prazo.diff}d)</span>}
            </Selo>
          );
        })()}
        {/* AS DATAS DA FAIXA NO TOQUE (revisão 22/09): a saída,
            o evento e os outros marcos só existiam no `title` —
            que o celular não mostra e o leitor de tela mal lê.
            O "i" abre as mesmas datas num popover (44px no
            celular), no desktop e no celular. */}
        {(() => {
          const ev = bloco.eventObj;
          if (!ev) return null;
          const datas: Array<[string, string]> = [];
          if (ev.truckDepartureDate) {
            datas.push(ev.datasDoKit
              ? ["Entrega do material", new Date(ev.truckDepartureDate).toLocaleDateString('pt-BR', { timeZone: 'UTC' })]
              : ["Saída", `${toUTCDisplayDate(ev.truckDepartureDate).toLocaleDateString('pt-BR')} às ${toUTCDisplayDate(ev.truckDepartureDate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`]);
          }
          if (ev.startDate) datas.push(["Evento", parseDateLocal(ev.startDate).toLocaleDateString('pt-BR')]);
          if (ev.truckDepartureDate) {
            for (const fase of ARTE_MARCOS_FAIXA) {
              const m = phaseDeadline(ev, fase, hoje);
              if (m) datas.push([m.label, m.date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })]);
            }
          }
          if (datas.length === 0) return null;
          const lado = alvo(28, dedo);
          return (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label={`Datas de ${bloco.eventName}`}
                  data-testid="button-datas-da-faixa"
                  style={{ width: lado, height: lado, minWidth: lado, borderRadius: 999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: T.surface, border: `1px solid ${T.border}`, color: T.apoio, cursor: 'pointer', flexShrink: 0 }}
                >
                  <Info aria-hidden="true" style={{ width: 14, height: 14 }} />
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" style={{ width: 240, padding: 12 }} data-testid="popover-datas-da-faixa">
                <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 800, color: T.second, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Datas do evento</p>
                <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 12, rowGap: 6, fontSize: 13 }}>
                  {datas.map(([rotulo, valor]) => (
                    <Fragment key={rotulo}>
                      <dt style={{ color: T.apoio, fontWeight: 600 }}>{rotulo}</dt>
                      <dd style={{ margin: 0, color: T.text, fontWeight: 700, fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>{valor}</dd>
                    </Fragment>
                  ))}
                </dl>
              </PopoverContent>
            </Popover>
          );
        })()}
        {/* "peças", não "ITENS": a tela inteira fala em peça, e o
            contador era a única palavra em versalete da faixa. */}
        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, color: T.apoio, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
          {evTotal} {evTotal === 1 ? 'peça' : 'peças'}
        </span>
      </div>
    </div>
  );
}
