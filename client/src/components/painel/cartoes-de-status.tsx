// ─── As etapas — o razão do fluxo, nas 3 zonas ──────────────────────────────
// 12 cards iguais obrigavam o usuário a escanear um a um para achar o
// gargalo. As zonas (Entrada → Aprovação → Produção) contam a história do
// fluxo; desde 02/10 cada zona é uma COLUNA de linhas (ver cartao-de-status),
// lado a lado no desktop, e a manchete "N peças" (o Total) mora no topo do
// painel, acima da barra.
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { getStatusMeta } from "@/lib/status";
import { STATUS_GROUPS, type GroupKey, type PainelStats } from "@/lib/painel-kpis";
import { FS, FW, N, T } from "@/lib/theme";
import { StatusCard } from "./cartao-de-status";
import {
  ZONA_ENTRADA, ZONA_APROVACAO, ZONA_PRODUCAO, TOM_ZONA_ENTRADA, TOM_ZONA_APROVACAO, TOM_ZONA_PRODUCAO,
  tituloDoCardOutros, fmtN,
} from "./regras";

/** A manchete do painel do fluxo: o Total, que desfaz o filtro de status. */
export function TotalDoPainel({ stats, isLoading, statusFilter, setStatusFilter, dedo }: {
  stats: PainelStats;
  dedo?: boolean;
  isLoading: boolean;
  statusFilter: string[];
  setStatusFilter: Dispatch<SetStateAction<string[]>>;
}) {
  const canceladas = stats.byGroup.canceled;
  return (
    <StatusCard
      label="Total" value={stats.total} carregando={isLoading}
      filterKey="total" dark dedo={dedo}
      isActive={statusFilter.length === 0}
      onToggle={() => setStatusFilter([])}
      sub={!isLoading && canceladas > 0 ? `inclui ${canceladas} cancelada${canceladas > 1 ? "s" : ""}` : undefined}
      subActionLabel="Ver só as canceladas"
      onSubAction={canceladas > 0 ? () => setStatusFilter(["canceled"]) : undefined}
    />
  );
}

export function CartoesDeStatus({
  useCards, dedo, stats, isLoading, statusFilter, setStatusFilter, toggleStatusCard, showAllKpis, setShowAllKpis, rodape,
}: {
  useCards: boolean;
  dedo: boolean;
  stats: PainelStats;
  isLoading: boolean;
  statusFilter: string[];
  setStatusFilter: Dispatch<SetStateAction<string[]>>;
  toggleStatusCard: (filterKey: string) => void;
  showAllKpis: boolean;
  setShowAllKpis: Dispatch<SetStateAction<boolean>>;
  /** O "como ler este painel", à esquerda do gatilho dos zerados. */
  rodape?: ReactNode;
}) {
  /**
   * QUAIS ETAPAS APARECEM. Uma etapa com 0 ocupava o mesmo peso de uma com
   * 1102. "Onde está o gargalo?" é uma pergunta sobre onde HÁ peça, e linhas
   * vazias só competem com a resposta. O status FILTRADO nunca some, mesmo
   * zerado: quem clicou nele precisa do caminho de volta.
   */
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

  const renderStatusCard = (key: GroupKey) => {
    const m = getStatusMeta(STATUS_GROUPS[key][0]);
    return (
      <StatusCard
        key={key}
        // label COMPLETO também no celular: o chip de filtro logo abaixo diz
        // "Aguardando Vinculação" — um nome só para a mesma etapa na tela.
        label={m.label}
        cor={m.dot}
        dedo={dedo}
        compacto={useCards}
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

  const zonas = [
    { nome: "Entrada", tom: TOM_ZONA_ENTRADA, todas: ZONA_ENTRADA, chaves: entradaVisivel, outros: false },
    { nome: "Aprovação", tom: TOM_ZONA_APROVACAO, todas: ZONA_APROVACAO, chaves: aprovacaoVisivel, outros: false },
    { nome: "Produção e entrega", tom: TOM_ZONA_PRODUCAO, todas: ZONA_PRODUCAO, chaves: producaoVisivel, outros: true },
  ];
  const soma = zonas.reduce((t, z) => t + z.todas.reduce((s, k) => s + (stats.byGroup[k] ?? 0), 0), 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div
        className={useCards ? undefined : "pnl-razao"}
        style={useCards
          ? { display: "flex", flexDirection: "column", gap: 14 }
          : { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", columnGap: 0 }}
      >
        {zonas.map((z, iz) => {
          const outrosAqui = z.outros && stats.outros > 0;
          const n = z.todas.reduce((t, k) => t + (stats.byGroup[k] ?? 0), 0);
          const pct = (n / soma) * 100;
          const pctZona = soma > 0 ? Math.round(pct) : 0;
          const vazia = z.chaves.length === 0 && !outrosAqui;
          return (
            <section
              key={z.nome}
              aria-label={`${z.nome}: ${n} ${n === 1 ? "peça" : "peças"}`}
              style={{
                minWidth: 0, display: "flex", flexDirection: "column", gap: 2,
                ...(!useCards && iz > 0 ? { borderLeft: `1px solid ${T.border}`, paddingLeft: 16 } : null),
                ...(!useCards && iz < zonas.length - 1 ? { paddingRight: 16 } : null),
              }}
            >
              {/* A MARCA DA ZONA: nome, quanto ela pesa e quantas peças tem —
                  a legenda da barra acima, agora com a lista de etapas embaixo.
                  O quadradinho tem o tom da zona (escuro = perto da entrega). */}
              <div
                data-testid={`zona-tick-${z.nome}`}
                style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, padding: "0 8px 6px 10px", overflow: "hidden" }}
              >
                <p style={{ margin: 0, fontSize: FS.micro, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: T.second, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  <span aria-hidden="true" style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, backgroundColor: z.tom, marginRight: 7, verticalAlign: "0" }} />
                  {z.nome}
                </p>
                {!isLoading && n > 0 && (
                  <span style={{ fontSize: FS.small, fontWeight: FW.medio, color: T.second, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                    {fmtN(n)} · {pctZona}%
                  </span>
                )}
              </div>
              {vazia ? (
                isLoading ? (
                  /* Silhuetas do tamanho da linha real — sem afirmar "nada"
                     antes de saber, e sem a coluna pular quando os dados chegam. */
                  <div aria-hidden="true" style={useCards ? { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", columnGap: 6, rowGap: 2 } : { display: "flex", flexDirection: "column", gap: 2 }}>
                    {(useCards ? [70, 54, 62, 58].slice(0, z.todas.length > 2 ? 4 : 2) : [70, 54, 62].slice(0, z.todas.length > 2 ? 3 : 2)).map((larg, i) => (
                      <div key={i} style={{ height: 36, display: "flex", alignItems: "center", gap: 10, padding: "0 8px 0 10px" }}>
                        <span className="animate-pulse" style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: N.n4 }} />
                        <span className="animate-pulse" style={{ width: `${larg}%`, height: 10, borderRadius: 4, backgroundColor: N.n3 }} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ margin: 0, padding: "6px 10px", fontSize: FS.meta, color: T.second }}>Nenhuma peça nesta fase.</p>
                )
              ) : (
                <div style={useCards ? { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", columnGap: 6, rowGap: 2 } : { display: "flex", flexDirection: "column", gap: 2 }}>
                  {z.chaves.map(renderStatusCard)}
                  {/* "Outros": qualquer status fora do mapa aparece aqui, com o
                      valor cru no title. É o que faz a soma fechar SEMPRE com o
                      Total. Sem filtro: é anomalia de dado, não etapa do fluxo. */}
                  {outrosAqui && (
                    <StatusCard
                      label="Outros" value={stats.outros} filterKey="outros" dedo={dedo} compacto={useCards}
                      isActive={false} onToggle={() => { if (useCards) setShowAllKpis(true); }}
                      sub="status fora do fluxo"
                      title={tituloDoCardOutros(stats.outrosStatus)}
                    />
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {/* Rodapé do painel: o "como ler" à esquerda e, à direita, a porta para
          os zerados. Discreta de propósito — é uma porta, não um alarme — e
          só aparece quando há o que mostrar. Sem a guarda de isLoading,
          durante a carga TODOS os status estão zerados e o link oferecia
          "mostrar os 13 status sem peça". */}
      {(rodape || (!isLoading && (escondidos > 0 || showAllKpis))) && (
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "4px 16px", borderTop: `1px solid ${T.border}`, paddingTop: 6, marginTop: 4 }}>
          <div style={{ minWidth: 0, flex: "1 1 260px" }}>{rodape}</div>
          {!isLoading && (escondidos > 0 || showAllKpis) && (
            <button
              type="button"
              onClick={() => setShowAllKpis(v => !v)}
              data-testid="button-toggle-kpis"
              aria-expanded={showAllKpis}
              className="pnl-sublink"
              style={{ display: "inline-flex", alignItems: "center", gap: 4, minHeight: dedo ? 44 : 36, background: "none", border: "none", padding: "0 2px", fontSize: FS.meta, fontWeight: FW.medio, color: T.apoio, cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit" }}
            >
              {showAllKpis
                ? "Esconder as etapas sem peça"
                : escondidos === 1 ? "Mostrar a etapa sem peça" : `Mostrar as ${escondidos} etapas sem peça`}
              {showAllKpis ? <ChevronUp aria-hidden="true" style={{ width: 13, height: 13 }} /> : <ChevronDown aria-hidden="true" style={{ width: 13, height: 13 }} />}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
