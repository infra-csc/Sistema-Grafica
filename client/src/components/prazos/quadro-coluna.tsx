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
//
// NUNCA converter o quadro em drag-and-drop. A coluna é estado DERIVADO das
// peças (a primeira etapa com pendência acumulada, calculada no servidor) —
// não é um campo editável. Arrastar um card não teria efeito nenhum sobre as
// peças, ou pior: exigiria inventar uma mutação que "move o evento de etapa",
// que não existe no domínio. O evento só muda de coluna quando as peças
// andam de verdade.
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PrazoEvent } from "@shared/prazos-contract";
import { MARCOS_DO_EVENTO } from "@shared/prazo-dates";
import { Botao } from "@/components/ui/botao";
import { Selo } from "@/components/ui/selo";
import { FONT, FS } from "@/lib/theme";
import { pecasTexto, R, rolagem, SCROLLPORT_MAX_H, STAGE_SECTOR, STAGE_SHORT, TI } from "./tokens";

interface QuadroColunaProps {
  stageKey: string;
  label: string;
  /** Índice da etapa — indexa `ev.stages` para contar peças e vencidos. */
  stageIdx: number;
  eventos: PrazoEvent[];
  /** Há filtro ativo? Muda o texto da coluna vazia. */
  temFiltro: boolean;
  /**
   * Recebe o índice da etapa junto do evento para a página poder passar UMA
   * função estável (`useCallback`) para as seis colunas. Com um fechamento
   * por coluna criado no render, o `memo` desta coluna nunca pulava nada.
   */
  renderCard: (ev: PrazoEvent, stageIdx: number) => React.ReactNode;
}

// `memo`: a página entrega `eventos` com identidade ESTÁVEL enquanto o
// conteúdo da coluna não muda (ver `colunasDoQuadro` em gestao-prazos.tsx).
// Sem isto, qualquer render da página — o tique de 1 min do selo, a pílula de
// novidades, cada tecla da busca — refazia a coluna E o `useLayoutEffect`
// abaixo, que lê `offsetTop` de todos os cards: um layout síncrono forçado
// por coluna, seis por render.
export const QuadroColuna = memo(function QuadroColuna({ stageKey, label, stageIdx, eventos, temFiltro, renderCard }: QuadroColunaProps) {
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

  // `renderCard` entra junto: a página o recria quando muda a cobrança ou o
  // realce de um card (ver renderCardQuadro em gestao-prazos.tsx) — e a linha
  // de cobrança muda a ALTURA do card. Só com `eventos` o "+N abaixo" ficava
  // contando pela altura antiga até a próxima rolagem.
  useLayoutEffect(() => { recalcular(); }, [eventos, renderCard, recalcular]);

  // Rolagem e resize disparam dezenas de eventos por segundo, e cada chamada
  // de `recalcular` varre todos os cards lendo `offsetTop`. Um quadro por
  // frame basta para o "+N abaixo" — o número só precisa estar certo quando a
  // tela é pintada. O rAF pendente é cancelado na desmontagem.
  const rafRef = useRef<number | null>(null);
  const agendarRecalculo = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      recalcular();
    });
  }, [recalcular]);
  useEffect(() => {
    window.addEventListener("resize", agendarRecalculo);
    return () => {
      window.removeEventListener("resize", agendarRecalculo);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [agendarRecalculo]);

  const setor = STAGE_SECTOR[stageKey]?.sector;
  const vencidos = eventos.filter((ev) => ev.stages[stageIdx]?.state === "overdue").length;
  const pecas = eventos.reduce((acc, ev) => acc + (ev.stages[stageIdx]?.pendingCount ?? 0), 0);
  const headingId = `gp-col-${stageKey}`;
  const marco = MARCOS_DO_EVENTO.find((m) => m.key === stageKey);
  const quemAge = setor ? ` (${setor})` : "";
  const tituloDaEtapa = marco
    ? `${label} — ${marco.descricao}${quemAge}. Prazo padrão: ${Math.abs(marco.offset)} dia${Math.abs(marco.offset) !== 1 ? "s" : ""} antes da saída do caminhão.`
    : label;

  return (
    <section
      ref={scrollRef}
      aria-labelledby={headingId}
      onScroll={agendarRecalculo}
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
        // O cabeçalho flutua sobre os cards enquanto a coluna rola, e só o
        // fundo sólido o separava deles. A régua dá a borda de baixo que um
        // elemento grudado precisa para não parecer o primeiro card.
        borderBottom: `1px solid ${TI.rule}`,
      }}>
        {/* Título e selo dividem a PRIMEIRA linha. O selo estava lá embaixo
            junto do subtítulo, brigando por espaço com "Atendimento · 30
            eventos · 1353 peças" — o dado mais urgente da coluna atrás do
            menos urgente. */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
          {/* O título da coluna é abreviado ("Final", "Lista") e não dizia o
              que a etapa é nem quando vence. O `title` completa com a mesma
              descrição e o mesmo prazo padrão do cadastro do evento. */}
          <h2 id={headingId} title={tituloDaEtapa} style={{
            margin: 0, flex: 1, minWidth: 0,
            fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em",
            color: TI.title, fontFamily: FONT.corpo,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {STAGE_SHORT[stageKey] ?? label}
          </h2>
          {vencidos > 0 && (
            // "vencido" fala do PRAZO desta etapa (o vocabulário da tela:
            // prazo vence, evento atrasa). O `title` desfaz a ambiguidade que
            // um numeral solto num selo de 10px carrega.
            <Selo
              tom="perigo"
              tamanho="sm"
              title={`${vencidos} evento${vencidos !== 1 ? "s" : ""} com o prazo desta etapa já vencido`}
              style={{ flexShrink: 0, padding: "1px 7px" }}
            >
              {vencidos} vencido{vencidos !== 1 ? "s" : ""}
            </Selo>
          )}
        </div>
        {/* A ALTURA RESERVADA CONTINUA — e ela não sobrou por acaso.

            Tirar o selo desta linha não faz o subtítulo caber em uma: no pior
            caso medido em produção ("Atendimento · 30 eventos · 1353 peças")
            ele passa de 190px sozinho, e quebra do mesmo jeito. Uma coluna
            com subtítulo de duas linhas ao lado de cinco com uma linha empurra
            o primeiro card 14px para baixo — foi o desalinho que este
            `minHeight` existe para impedir.

            Reservar continua sendo melhor que truncar: os números do subtítulo
            SÃO o conteúdo da coluna, e cortar "1353 peças" para alinhar seria
            trocar dado por estética. O que mudou é o tamanho da reserva: com o
            selo fora, bastam duas linhas de 11px (29) no lugar dos 34. */}
        <span style={{
          display: "block", marginTop: 3, minWidth: 0,
          fontSize: 11, lineHeight: 1.3, color: TI.label, minHeight: 29,
        }}>
          {setor ? `${setor} · ` : ""}
          {eventos.length} evento{eventos.length !== 1 ? "s" : ""}
          {pecas > 0 && ` · ${pecasTexto(pecas)}`}
        </span>
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
            {renderCard(ev, stageIdx)}
          </div>
        ))}
      </div>

      {abaixo > 0 && (
        <div className="gp-no-print" style={{ position: "sticky", bottom: 0, paddingTop: 6 }}>
          <Botao
            variante="secundario"
            tamanho="sm"
            larguraCheia
            onClick={() => {
              const el = scrollRef.current;
              if (el) el.scrollBy({ top: el.clientHeight - 60, behavior: rolagem() });
            }}
            style={{ fontSize: FS.small, color: TI.secondary }}
          >
            +{abaixo} evento{abaixo !== 1 ? "s" : ""} abaixo ↓
          </Botao>
        </div>
      )}
    </section>
  );
});
