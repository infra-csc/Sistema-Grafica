// Coluna do quadro — uma etapa do funil.
//
// Três coisas que a tabela (a visão SECUNDÁRIA) já tinha e o quadro não:
//
// 1. TETO E CABEÇALHO FIXO. A coluna era um flex sem `maxHeight` dentro de um
//    grid sem altura: com 12-15 eventos numa etapa ela passava de 1500px
//    enquanto as quatro vizinhas mostravam um retângulo de 54px. E acúmulo
//    numa etapa é o caso NORMAL desta regra — em época de pico quase todo
//    mundo fica em Lista de Imagens, ou seja, o quadro parava de caber
//    exatamente quando havia mais atraso.
// 2. SEMÂNTICA. Era um grid de <div> anônimos com o rótulo em spans soltos,
//    enquanto a tabela trazia caption e scope em tudo. Agora cada coluna é uma
//    <section aria-labelledby> com <h2> e a pilha é uma lista de verdade.
// 3. UNIDADE NOS NÚMEROS. O cabeçalho contava eventos com um numeral solto,
//    colado a cards que diziam "8 peças" — duas unidades sem rótulo. A segunda
//    linha nomeia o setor e conta as duas coisas, que é o que faz o quadro
//    responder "onde está o TRABALHO", não só "onde estão os eventos".
//
// O scrollport VERTICAL é a própria <section>, e o cabeçalho sticky mora
// dentro dela — se o sticky ficasse no scrollport horizontal do grid, grudaria
// no lugar errado.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PrazoEvent } from "@shared/prazos-contract";
import { pecasTexto, R, SCROLLPORT_MAX_H, STAGE_SECTOR, STAGE_SHORT, TI } from "./tokens";

interface QuadroColunaProps {
  stageKey: string;
  label: string;
  /** Índice da etapa — indexa `ev.stages` para contar peças e vencidos. */
  stageIdx: number;
  eventos: PrazoEvent[];
  /** Há filtro ativo? Muda o texto da coluna vazia. */
  temFiltro: boolean;
  renderCard: (ev: PrazoEvent) => React.ReactNode;
}

export function QuadroColuna({ stageKey, label, stageIdx, eventos, temFiltro, renderCard }: QuadroColunaProps) {
  const scrollRef = useRef<HTMLElement | null>(null);
  const [abaixo, setAbaixo] = useState(0);

  const recalcular = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const limite = el.scrollTop + el.clientHeight - 4;
    let n = 0;
    el.querySelectorAll<HTMLElement>("[data-card-id]").forEach((c) => {
      if (c.offsetTop >= limite) n += 1;
    });
    setAbaixo(n);
  }, []);

  useLayoutEffect(() => { recalcular(); }, [eventos, recalcular]);
  useEffect(() => {
    window.addEventListener("resize", recalcular);
    return () => window.removeEventListener("resize", recalcular);
  }, [recalcular]);

  const setor = STAGE_SECTOR[stageKey]?.sector;
  const vencidos = eventos.filter((ev) => ev.stages[stageIdx]?.state === "overdue").length;
  const pecas = eventos.reduce((acc, ev) => acc + (ev.stages[stageIdx]?.pendingCount ?? 0), 0);
  const headingId = `gp-col-${stageKey}`;

  return (
    <section
      ref={scrollRef}
      aria-labelledby={headingId}
      onScroll={recalcular}
      className="gp-scroll"
      style={{
        minWidth: 0, position: "relative",
        // Mesmo teto da tabela (token único): os dois scrollports começam na
        // mesma altura da página, então dois valores seriam duas medições do
        // mesmo espaço — e uma delas ia divergir na primeira mudança do topo.
        maxHeight: SCROLLPORT_MAX_H, overflowY: "auto",
      }}
    >
      <div style={{
        position: "sticky", top: 0, zIndex: 1,
        // Fundo sólido igual ao da página: translúcido deixaria os cards
        // passarem por baixo do cabeçalho durante o scroll.
        backgroundColor: TI.bg,
        // padding-left zerado: os 4px de antes desalinhavam o cabeçalho dos
        // cards que ele nomeia.
        padding: "0 0 8px", minWidth: 0,
      }}>
        <h2 id={headingId} title={label} style={{
          margin: 0, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em",
          color: TI.title, fontFamily: "'Plus Jakarta Sans', sans-serif",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {STAGE_SHORT[stageKey] ?? label}
        </h2>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 2 }}>
          <span style={{ fontSize: 11, color: TI.secondary, minWidth: 0 }}>
            {setor ? `${setor} · ` : ""}
            {eventos.length} evento{eventos.length !== 1 ? "s" : ""}
            {pecas > 0 && ` · ${pecasTexto(pecas)}`}
          </span>
          {vencidos > 0 && (
            // "vencido" fala do PRAZO desta etapa (o vocabulário da tela:
            // prazo vence, evento atrasa). O `title` desfaz a ambiguidade que
            // um numeral solto num selo de 10px carrega.
            <span
              title={`${vencidos} evento${vencidos !== 1 ? "s" : ""} com o prazo desta etapa já vencido`}
              style={{
                fontSize: 10, fontWeight: 800, color: TI.red, backgroundColor: TI.redBg,
                padding: "1px 7px", borderRadius: R.pill, whiteSpace: "nowrap",
              }}
            >
              {vencidos} vencido{vencidos !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      <div role="list" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {eventos.length === 0 && (
          <div style={{
            border: `1px dashed ${TI.idle}`, borderRadius: R.lg, padding: "18px 12px",
            fontSize: 12, color: TI.label, textAlign: "center",
          }}>
            {/* Com "Só com atraso" ligado, o normal é 1 coluna com cards e 4
                caixas iguais — o texto distingue etapa limpa de coluna
                esvaziada pelo filtro. */}
            {temFiltro ? "Nenhum evento com estes filtros" : "Nenhum evento nesta etapa"}
          </div>
        )}
        {eventos.map((ev) => (
          <div role="listitem" key={ev.id} style={{ minWidth: 0 }}>
            {renderCard(ev)}
          </div>
        ))}
      </div>

      {abaixo > 0 && (
        <div className="gp-no-print" style={{ position: "sticky", bottom: 0, paddingTop: 6 }}>
          <button
            type="button"
            onClick={() => {
              const el = scrollRef.current;
              if (el) el.scrollBy({ top: el.clientHeight - 60, behavior: "smooth" });
            }}
            style={{
              width: "100%", padding: "6px 0", borderRadius: R.md,
              border: `1px solid ${TI.border}`, backgroundColor: TI.card,
              fontSize: 11, fontWeight: 700, color: TI.secondary, cursor: "pointer",
            }}
          >
            +{abaixo} evento{abaixo !== 1 ? "s" : ""} abaixo ↓
          </button>
        </div>
      )}
    </section>
  );
}
