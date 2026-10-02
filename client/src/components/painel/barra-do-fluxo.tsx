// ─── O FLUXO INTEIRO NUMA BARRA ─────────────────────────────────────────────
//
// O GARGALO ESTAVA INVISÍVEL. Com dados de produção, 1.129 de 2.632
// peças (43%) estavam em "Aguardando envio" — e esse número aparecia
// como mais um entre doze contadores do mesmo tamanho. Doze cards com
// o mesmo peso não têm vencedor: a tela mostrava tudo e não dizia
// nada.
//
// Uma barra proporcional resolve o que doze números iguais não
// resolvem, porque a informação que importa aqui é RELATIVA — não
// "quantos", e sim "onde está a massa". 43% num segmento salta aos
// olhos sem ler um algarismo sequer.
//
// Os cards continuam existindo abaixo, como detalhe. Esta é a leitura
// de três segundos; eles são a de trinta.
//
// A barra usa a MESMA fonte de cor dos cards e dos selos da tabela
// (getStatusMeta), e cada segmento aplica o mesmo recorte que o card
// correspondente — clicar aqui e clicar no card levam ao mesmo lugar.
import type { ReactNode } from "react";
import { Info } from "lucide-react";
import { alvo } from "@/hooks/use-mobile";
import { getStatusMeta } from "@/lib/status";
import { STATUS_GROUPS, type PainelStats } from "@/lib/painel-kpis";
import { FS, FW, H, T, N, TOM } from "@/lib/theme";
import {
  ZONA_ENTRADA, ZONA_APROVACAO, ZONA_PRODUCAO, LIMITE_PARADA, fmtN, tomDaIdade, idadePorExtenso,
} from "./regras";

export function BarraDoFluxo({ stats, idadesPorEtapa, statusFilter, toggleStatusCard, useCards, inicio }: {
  stats: PainelStats;
  /** A manchete à esquerda da frase da maior fila (o Total). */
  inicio?: ReactNode;
  /** Idades (em dias) das peças da lista, por etapa — memo da página. */
  idadesPorEtapa: Map<string, number[]>;
  statusFilter: string[];
  toggleStatusCard: (filterKey: string) => void;
  useCards: boolean;
}) {
  const zonas = [
    { nome: "Entrada", chaves: ZONA_ENTRADA },
    { nome: "Aprovação", chaves: ZONA_APROVACAO },
    { nome: "Produção e entrega", chaves: ZONA_PRODUCAO },
  ];
  const segmentos = zonas.flatMap(z =>
    z.chaves
      .map(k => ({ k, zona: z.nome, n: stats.byGroup[k] ?? 0, meta: getStatusMeta(STATUS_GROUPS[k][0]) }))
      .filter(seg => seg.n > 0),
  );
  // `stats.total` também inclui canceladas e status fora do fluxo. Um
  // recorte só com esses itens deixa `segmentos` vazio; nesse caso não
  // existe maior fila para anunciar nem barra proporcional para desenhar.
  // Só canceladas (ou só status fora do mapa) não têm fluxo para
  // distribuir, e `maior` abaixo seria undefined — a tela quebraria.
  if (segmentos.length === 0) return null;
  const soma = segmentos.reduce((t, seg) => t + seg.n, 0) || 1;
  const maior = segmentos.reduce((a, b) => (b.n > a.n ? b : a), segmentos[0]);

  // A MEDIA DA MAIOR FILA. So sobre as pecas que TEM carimbo: a media de
  // um conjunto com buracos e a media do que se SABE, nao do que se supoe.
  // Sem nenhuma carimbada nao ha frase — melhor calar do que dizer
  // "parada ha 0 dias", que se leria como "acabou de entrar".
  //
  // O pool e `filteredItems` — a lista que a pessoa esta vendo. Os
  // segmentos contam `statsItems` (um recorte acima), e os dois so
  // divergem com filtro ativo; quando divergem, a media do que esta na
  // tela e a mais util das duas.
  const idadeDoSegmento = (chave: string): number | null => {
    // Vem pronto de `idadesPorEtapa` (memo): uma passada por mudança da
    // lista, não uma varredura por segmento a cada render.
    const idades = idadesPorEtapa.get(chave) ?? [];
    return idades.length ? Math.round(idades.reduce((t, d) => t + d, 0) / idades.length) : null;
  };
  const mediaDaMaior = idadeDoSegmento(maior.k);
  return (
    <section aria-label="Distribuição das peças pelo fluxo" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", columnGap: 16, rowGap: 6, flexWrap: "wrap" }}>
        {inicio}
        {/* O maior segmento dito por extenso: a barra mostra a forma, a
            frase nomeia o gargalo para quem chega sem contexto — e para
            quem lê por leitor de tela, que não enxerga proporção. */}
        <span style={{ fontSize: FS.meta, fontWeight: FW.corpo, color: T.apoio, lineHeight: 1.45, ...(useCards ? null : { textAlign: "right" as const }) }}>
          Maior fila: <strong style={{ color: T.text, fontWeight: FW.forte }}>{maior.meta.label}</strong>
          {" "}· {Math.round((maior.n / soma) * 100)}% ({fmtN(maior.n)})
          {/* A frase dizia o quanto a fila PESA; passa a dizer tambem se
              ela esta andando. E a diferenca entre vazao normal e
              travamento — a pergunta inteira de quem procura gargalo. */}
          {mediaDaMaior !== null && (() => {
            const tom = tomDaIdade(mediaDaMaior);
            return (
              <span data-testid="texto-idade-maior-fila" style={{ color: tom.cor, fontWeight: tom.peso }}>
                {" "}· parada {idadePorExtenso(mediaDaMaior)} em média
              </span>
            );
          })()}
        </span>
      </div>
      <div className="pnl-trilho" style={{ display: "flex", height: 12, borderRadius: 999, overflow: "hidden", background: N.n2 }}>
        {segmentos.map((seg, i) => {
          const pct = (seg.n / soma) * 100;
          // O VAO ENTRE ZONAS: 2px na cor do fundo, via borda, para não
          // mexer nas larguras proporcionais — a soma continua 100%.
          const fechaZona = i < segmentos.length - 1 && segmentos[i + 1].zona !== seg.zona;
          // Dentro da MESMA zona um fio claro de 1px separa as etapas.
          const mesmaZonaAntes = i > 0 && segmentos[i - 1].zona === seg.zona;
          const ativo = statusFilter.includes(seg.k);
          return (
            <button
              key={seg.k}
              onClick={() => toggleStatusCard(seg.k)}
              aria-pressed={ativo}
              data-testid={`fluxo-seg-${seg.k}`}
              title={`${seg.zona} · ${seg.meta.label}: ${fmtN(seg.n)} ${seg.n === 1 ? "peça" : "peças"} (${Math.round(pct)}%)`
                + (idadeDoSegmento(seg.k) !== null ? ` · parada ${idadePorExtenso(idadeDoSegmento(seg.k)!)} em média` : "")}
              aria-label={`${seg.meta.label}, ${seg.n} ${seg.n === 1 ? "peça" : "peças"}, ${Math.round(pct)} por cento. Filtrar.`}
              className="pg-seg"
              style={{
                width: `${pct}%`, minWidth: 3, height: "100%", padding: 0, cursor: "pointer",
                border: "none",
                borderRight: fechaZona ? `2px solid ${T.bg}` : "none",
                borderLeft: mesmaZonaAntes ? "1px solid rgba(255,255,255,0.75)" : "none",
                // COR DA ETAPA (pedido do dono): a mesma de getStatusMeta
                // usada na linha do razão e no selo da peça. Filtrado: a
                // própria cor com o anel escuro (o laranja de "recorte
                // ligado" se confundiria com uma etapa).
                background: seg.meta.dot,
                boxShadow: ativo ? `inset 0 0 0 2px ${T.text}` : "none",
                transition: "background-color .15s, box-shadow .15s, filter .15s",
              }}
            />
          );
        })}
      </div>
    </section>
  );
}

// ── COMO LER O PAINEL, por escrito — mas DOBRADO ─────────────────────────────
// Quem chega pela primeira vez via uma faixa colorida sem legenda. A linha
// visível é o essencial (o clique filtra), e o resto mora num <details>
// nativo — teclado e leitor de tela abrem sem nada a mais. Mora no rodapé do
// painel do fluxo, sob a lista de etapas que ele explica.
export function ComoLerOPainel({ dedo }: { dedo: boolean }) {
  return (
    <details data-testid="texto-como-ler-fluxo" className="pnl-como-ler" style={{ fontSize: FS.meta, color: T.second, lineHeight: 1.45 }}>
      <summary style={{ cursor: "pointer", width: "fit-content", minHeight: alvo(H.md, dedo), display: "flex", alignItems: "center", gap: 6, listStyle: "none" }}>
        <Info aria-hidden="true" style={{ width: 13, height: 13, flexShrink: 0 }} />
        <span>Clique numa etapa para filtrar a lista · <span style={{ textDecoration: "underline", textUnderlineOffset: 2, textDecorationColor: T.bdark, fontWeight: FW.medio, color: T.apoio }}>como ler este painel</span></span>
      </summary>
      <ul style={{ margin: "2px 0 8px", paddingLeft: 38, display: "flex", flexDirection: "column", gap: 4, maxWidth: 720 }}>
        <li>Todas as peças de todos os eventos, com a lista ordenada pela saída do caminhão.</li>
        <li>Cada pedaço da barra é uma etapa, do pedido à entrega, na mesma cor do ponto da etapa e do selo da peça.</li>
        <li>Clique numa etapa (na barra ou na lista de etapas) para filtrar a lista; clique de novo para desfazer.</li>
        <li>
          Tempo parado na etapa: até {LIMITE_PARADA} dias é fluxo normal (cinza);{" "}
          <span style={{ color: TOM.alerta.text, fontWeight: FW.forte }}>acima de {LIMITE_PARADA}, âmbar</span>;{" "}
          <span style={{ color: TOM.perigo.text, fontWeight: FW.forte }}>acima de 14, vermelho</span>.
        </li>
      </ul>
    </details>
  );
}
