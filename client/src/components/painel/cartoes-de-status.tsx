// ─── Status cards — agrupados nas 3 fases do fluxo ──────────────────────────
// 12 cards iguais obrigavam o usuário a escanear um a um para achar o
// gargalo. As zonas (Entrada → Aprovação → Produção) contam a história
// do fluxo e a largura dos cards por zona cria ritmo visual.
import type { Dispatch, SetStateAction } from "react";
import { getStatusMeta } from "@/lib/status";
import { STATUS_GROUPS, type GroupKey, type PainelStats } from "@/lib/painel-kpis";
import { FS, FW, T } from "@/lib/theme";
import { StatusCard } from "./cartao-de-status";
import {
  ZONA_ENTRADA, ZONA_APROVACAO, ZONA_PRODUCAO, TOM_ZONA_ENTRADA, TOM_ZONA_APROVACAO, TOM_ZONA_PRODUCAO,
  tituloDoCardOutros,
} from "./regras";

export function CartoesDeStatus({
  useCards, stats, isLoading, statusFilter, setStatusFilter, toggleStatusCard, showAllKpis, setShowAllKpis,
}: {
  useCards: boolean;
  stats: PainelStats;
  isLoading: boolean;
  statusFilter: string[];
  setStatusFilter: Dispatch<SetStateAction<string[]>>;
  toggleStatusCard: (filterKey: string) => void;
  showAllKpis: boolean;
  setShowAllKpis: Dispatch<SetStateAction<boolean>>;
}) {
  /**
   * QUAIS CARDS APARECEM. Um card com 0 ocupava a mesma largura e o mesmo peso
   * de um com 1102 — e a primeira dobra da tela gastava treze deles, sendo que
   * tres costumam estar zerados. "Onde esta o gargalo?" e uma pergunta sobre
   * onde HA peca, e cards vazios so competem com a resposta.
   *
   * A regra ja existia e valia so no celular; agora vale nos dois. O status
   * FILTRADO nunca some, mesmo zerado: quem clicou nele precisa do caminho de
   * volta, e um controle que desaparece ao ser usado e uma armadilha.
   */
  /** Largura de um card de status. Fixa de proposito: ver o comentario das
   *  zonas — card que estica para preencher a linha vira um retangulo de
   *  1500px anunciando o numero 1. */
  const LARG_CARD = useCards ? "minmax(0,1fr)" : "minmax(150px, 196px)";

  const kpiVisivelPorChave = (k: GroupKey) =>
    showAllKpis || (stats.byGroup[k] ?? 0) > 0 || statusFilter.includes(k);

  const entradaVisivel   = ZONA_ENTRADA.filter(kpiVisivelPorChave);
  const aprovacaoVisivel = ZONA_APROVACAO.filter(kpiVisivelPorChave);
  const producaoVisivel  = ZONA_PRODUCAO.filter(kpiVisivelPorChave);
  /** Quantos o corte tirou — o número que o gatilho promete devolver. */
  const escondidos =
    (ZONA_ENTRADA.length - entradaVisivel.length) +
    (ZONA_APROVACAO.length - aprovacaoVisivel.length) +
    (ZONA_PRODUCAO.length - producaoVisivel.length);

  const kpiCards: Array<{ key: GroupKey; value: number }> = [...ZONA_ENTRADA, ...ZONA_APROVACAO, ...ZONA_PRODUCAO]
    .map(k => ({ key: k, value: stats.byGroup[k] }));

  const renderStatusCard = (key: GroupKey) => {
    const m = getStatusMeta(STATUS_GROUPS[key][0]);
    return (
      <StatusCard
        key={key}
        // label COMPLETO também no celular. O `short` ("Ag. Vinculação")
        // existia porque o trilho horizontal dava 150px por card; na grade de
        // duas colunas o nome inteiro cabe quebrando em duas linhas, e o chip
        // de filtro logo abaixo diz "Aguardando Vinculação" — um nome só para
        // a mesma etapa na mesma tela.
        label={m.label}
        cor={m.dot}
        value={stats.byGroup[key]} carregando={isLoading}
        pct={stats.total > 0 ? ((stats.byGroup[key] ?? 0) / stats.total) * 100 : undefined}
        filterKey={key}
        isActive={statusFilter.includes(key)}
        onToggle={() => toggleStatusCard(key)}
        sub={key === "requested" && stats.drafts > 0 ? `inclui ${stats.drafts} rascunho${stats.drafts > 1 ? "s" : ""}` : undefined}
        subActionLabel={key === "requested" ? "Ver só os rascunhos" : undefined}
        onSubAction={key === "requested" && stats.drafts > 0 ? () => setStatusFilter(["draft"]) : undefined}
      />
    );
  };

  const canceladas = stats.byGroup.canceled;
  const totalCard = (
    <StatusCard
      label="Total" value={stats.total} carregando={isLoading}
      filterKey="total" dark
      isActive={statusFilter.length === 0}
      onToggle={() => setStatusFilter([])}
      sub={canceladas > 0 ? `inclui ${canceladas} cancelada${canceladas > 1 ? "s" : ""}` : undefined}
      subActionLabel="Ver só as canceladas"
      onSubAction={canceladas > 0 ? () => setStatusFilter(["canceled"]) : undefined}
    />
  );

  return (
    <section aria-label="Peças por etapa" style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: -8 }}>
      {useCards ? (
        /* CELULAR: GRADE DE DUAS COLUNAS, não trilho horizontal.
           O trilho escondia a maior parte dos cards fora da tela, sem
           nenhuma pista de que havia mais à direita, e cortava o último
           card ao meio em 390px. Duas colunas mostram tudo o que tem peça
           de uma vez, com o nome inteiro legível; os zerados continuam
           atrás do "Mostrar todos os status". */
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
            {totalCard}
            {kpiCards.filter(c => kpiVisivelPorChave(c.key)).map(c => renderStatusCard(c.key))}
            {stats.outros > 0 && (
              <StatusCard
                label="Outros" value={stats.outros} filterKey="outros"
                isActive={false} onToggle={() => setShowAllKpis(true)}
                sub="fora do fluxo"
                title={tituloDoCardOutros(stats.outrosStatus)}
              />
            )}
          </div>
          <button
            onClick={() => setShowAllKpis(v => !v)}
            style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", minHeight: 36, background: "none", border: "none", padding: "0 2px", fontSize: 11, fontWeight: FW.forte, color: T.accentText, cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 2 }}
          >
            {showAllKpis ? "Mostrar só os status com peças" : "Mostrar todos os status"}
          </button>
        </>
      ) : (
        /* AS ZONAS FLUEM, e não mais num grid 3fr/4fr fixo.
           Com o corte dos zerados o número de cards por zona virou variável,
           e proporções fixas passaram a produzir dois defeitos que só o ao
           vivo mostrou: uma zona com UM card esticava esse card por 1500px,
           e cards de zonas diferentes ficavam com larguras diferentes na
           mesma tela. Card de status é uma peça de tamanho conhecido — ele
           não deve crescer para preencher espaço, deve terminar e deixar o
           resto vazio. */
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: 18 }}>
          {/* O NOME DA ZONA É LEGENDA DA BARRA ACIMA: o quadradinho tem o
              mesmo tom que a zona tem lá, e é isso que liga as duas leituras
              sem repetir cor de status. Caixa normal, 12px: era a terceira
              faixa de caixa-alta 10px empilhada no topo da tela. */}
          {([
            { nome: "Entrada", tom: TOM_ZONA_ENTRADA, chaves: entradaVisivel, total: true, outros: false },
            { nome: "Aprovação", tom: TOM_ZONA_APROVACAO, chaves: aprovacaoVisivel, total: false, outros: false },
            { nome: "Produção e entrega", tom: TOM_ZONA_PRODUCAO, chaves: producaoVisivel, total: false, outros: true },
          ]).map(z => {
            const outrosAqui = z.outros && stats.outros > 0;
            const colunas = (z.total ? 1 : 0) + z.chaves.length + (outrosAqui ? 1 : 0);
            if (colunas === 0) return null;
            return (
              <div key={z.nome} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: FS.meta, fontWeight: FW.medio, color: T.apoio, paddingLeft: 2 }}>
                  <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: z.tom, flexShrink: 0 }} />
                  {z.nome}
                </span>
                <div style={{ display: "grid", gridTemplateColumns: `repeat(${colunas}, ${LARG_CARD})`, gap: 8 }}>
                  {z.total && totalCard}
                  {z.chaves.map(renderStatusCard)}
                  {/* Card "Outros": qualquer status fora do mapa aparece aqui, com
                      o valor cru no title. É o que faz a soma dos cards fechar
                      SEMPRE com o Total — antes esses itens somavam no Total e em
                      card nenhum, sem aviso. */}
                  {outrosAqui && (
                    <StatusCard
                      label="Outros" value={stats.outros} filterKey="outros"
                      isActive={false} onToggle={() => { /* sem filtro: é anomalia de dado, não etapa do fluxo */ }}
                      sub="status fora do fluxo"
                      title={tituloDoCardOutros(stats.outrosStatus)}
                    />
                  )}
                </div>
              </div>
            );
          })}

          {/* O caminho de volta para os escondidos. Discreto de proposito:
              e uma porta, nao um alarme — e so aparece quando ha o que
              mostrar, senao viraria um botao que nao faz nada. */}
          {/* Sem a guarda de isLoading, durante a carga TODOS os status
              estao zerados e o link oferecia "mostrar os 13 status sem peca"
              — um convite para revelar um vazio que e temporario. */}
          {!isLoading && (escondidos > 0 || showAllKpis) && (
            <button
              onClick={() => setShowAllKpis(v => !v)}
              data-testid="button-toggle-kpis"
              /* Alinhado com a BASE dos cards, não solto embaixo de tudo:
                 `alignSelf: flex-end` o encosta na linha inferior da faixa,
                 onde ele se lê como a continuação dela. */
              style={{ alignSelf: "flex-end", display: "inline-flex", alignItems: "center", minHeight: 36, background: "none", border: "none", padding: "0 2px", fontSize: 11, fontWeight: FW.forte, color: T.accentText, cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 2, whiteSpace: "nowrap" }}
            >
              {showAllKpis
                ? "Mostrar só os status com peças"
                : `Mostrar os ${escondidos} status sem peça`}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
