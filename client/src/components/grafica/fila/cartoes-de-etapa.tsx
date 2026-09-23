// Os cartões de etapa do topo da fila: contam o recorte por etapa e, no
// clique, viram o filtro de status (a MESMA lista conta e filtra).
import type React from "react";
import { Check } from "lucide-react";
import { CartaoKpi } from "@/components/ui/cartao-kpi";
import type { TomDoSelo } from "@/components/ui/selo";
import { FONT, FS, FW, R, T } from "@/lib/theme";
import { getStatusMeta, descricaoDoStatus } from "@/lib/status";
import type { GraficaFiltros } from "@/lib/grafica-filtros";
import { FILTRO_DOS_CARTOES } from "./regras";

/**
 * O tom do CartaoKpi de cada etapa — o MESMO da pílula de status (lib/status)
 * sempre que a paleta TOM o tem. Duas etapas não têm: a Revisão (fúcsia) fica
 * NEUTRA — é trabalho chegando, sem ação da Gráfica — e o Impresso (rosa) vai
 * para o roxo, o vizinho mais próximo. O CartaoKpi não aceita `cores` livres.
 */
export const TOM_DA_ETAPA: Record<string, TomDoSelo> = {
  "stat-revisao": "neutro",
  "stat-approved": "turquesa",
  "stat-production": "laranja",
  "stat-produced": "roxo",
  "stat-conferred": "ciano",
  "stat-packed": "info",
  "stat-delivered": "esmeralda",
};

/**
 * Cartão de etapa do CELULAR. Fica local porque o rótulo do CartaoKpi é 10px
 * em caixa-alta e o galpão não lê nada abaixo de 12px, de braço esticado e no
 * sol; em 3 colunas de 360px, 12px em caixa normal é o que cabe inteiro.
 * Ativo = preenchido na cor da etapa + ✓ (não só a cor).
 */
export function CartaoDeEtapaCelular({ rotulo, valor, carregando, ativo, onClick, ariaLabel, title, testId, faixa, tinta, colunas }: {
  rotulo: string; valor: React.ReactNode; carregando: boolean; ativo: boolean; onClick: () => void;
  ariaLabel: string; title: string; testId: string; faixa: string; tinta: string; colunas?: number;
}) {
  return (
    <button
      type="button"
      aria-pressed={ativo}
      aria-label={ariaLabel}
      title={title}
      onClick={onClick}
      data-testid={testId}
      className="ds-botao"
      style={{
        display: "block", width: "100%", minWidth: 0, minHeight: 44, textAlign: "left", font: "inherit",
        gridColumn: colunas ? `span ${colunas}` : undefined,
        backgroundColor: ativo ? tinta : T.surface,
        border: `1px solid ${ativo ? tinta : T.border}`,
        borderLeft: `4px solid ${faixa}`,
        borderRadius: R.md,
        padding: "7px 8px",
        cursor: "pointer",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 3, fontSize: FS.meta, fontWeight: FW.forte, color: ativo ? T.surface : T.second, marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", lineHeight: 1.2 }}>
        {ativo && <Check aria-hidden="true" data-testid={`${testId}-ativo`} style={{ width: 12, height: 12, flexShrink: 0 }} />}
        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{rotulo}</span>
      </div>
      <div style={{ fontSize: 20, fontWeight: FW.rotulo, letterSpacing: "-0.03em", fontFamily: FONT.display, color: ativo ? T.surface : carregando ? T.second : tinta, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{valor}</div>
    </button>
  );
}

/** Os números de cada etapa no recorte atual (ver `stats` em useFilaDaGrafica). */
export type ContagemPorEtapa = {
  revisao: number; liberados: number; emProducao: number; produzidos: number;
  conferidos: number; embalados: number; entregues: number; total: number;
};

/**
 * A grade de cartões. Os cartões do desktop são o <CartaoKpi> do design
 * system: número na cor da etapa, faixa do tom e aria-pressed de verdade.
 * Continua valendo: "—" enquanto carrega (zero seria afirmar fila vazia), o
 * subtítulo com o próximo passo, e o significado do status no title.
 * NO CELULAR o cartão segue local (CartaoDeEtapaCelular): o rótulo do
 * CartaoKpi é 10px em caixa-alta, e o galpão não lê nada abaixo de 12px.
 * Os números seguem a lista (regra do dono) — ver `stats`.
 */
export function CartoesDeEtapa({ stats, filtros, patchFiltros, isMobile, isLoading }: {
  stats: ContagemPorEtapa;
  filtros: GraficaFiltros;
  patchFiltros: (p: Partial<GraficaFiltros>) => void;
  isMobile: boolean;
  isLoading: boolean;
}) {
  return (
    <div role="group" aria-label="Filtrar a fila por etapa" style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(3, 1fr)" : "repeat(auto-fit, minmax(150px, 1fr))", gap: isMobile ? 8 : 12 }}>
      {[
        // O KPI Liberados agrega dois status; ele seleciona os DOIS valores
        // no filtro (o filtro em si é estrito — ver matchesFilters).
        // "Em Revisão" vem ANTES de Liberados porque é o degrau anterior
        // do fluxo: é o trabalho CHEGANDO — visível, sem ação da Gráfica.
        { label: "Em Revisão",   value: stats.revisao,    sub: "Chegando da Revisão",  testId: "stat-revisao",    filterVals: FILTRO_DOS_CARTOES.revisao },
        { label: "Liberados",    value: stats.liberados,  sub: "Aguardam produção",    testId: "stat-approved",   filterVals: FILTRO_DOS_CARTOES.liberados },
        { label: "Em Impressão", value: stats.emProducao, sub: "Na máquina",           testId: "stat-production", filterVals: FILTRO_DOS_CARTOES.emProducao },
        { label: "Impresso",     value: stats.produzidos, sub: "No acabamento",        testId: "stat-produced",   filterVals: FILTRO_DOS_CARTOES.produzidos },
        { label: "Conferidos",   value: stats.conferidos, sub: "Aguardam embalagem", testId: "stat-conferred", filterVals: FILTRO_DOS_CARTOES.conferidos },
        // EMBALADO (dono, 21/09): conferida e dentro do tubo — entre Conferidos e Entregues.
        { label: "Embalados",    value: stats.embalados,  sub: "Aguardam o caminhão",  testId: "stat-packed",     filterVals: FILTRO_DOS_CARTOES.embalados },
        { label: "Entregues",    value: stats.entregues,  sub: "Já saíram",            testId: "stat-delivered",  filterVals: FILTRO_DOS_CARTOES.entregues },
      ].map(kpi => {
        const isActive = kpi.filterVals.every(v => filtros.status.includes(v)) && filtros.status.length === kpi.filterVals.length;
        // O title diz o que a etapa SIGNIFICA e quem age (a mesma frase do
        // StatusPill da tabela), não só o subtítulo que já está à vista.
        const significado = descricaoDoStatus(kpi.filterVals[0]) ?? kpi.sub;
        const titulo = isActive ? `${significado} — clique para ver todas` : significado;
        const alternar = () => patchFiltros({ status: isActive ? [] : kpi.filterVals });
        const rotuloAcessivel = `Filtrar por ${kpi.label} — ${kpi.value} peças`;
        if (isMobile) {
          // Celular: cores do MESMO mapa dos pills (lib/status).
          const m = getStatusMeta(kpi.filterVals[0]);
          return (
            <CartaoDeEtapaCelular key={kpi.label} rotulo={kpi.label} valor={isLoading ? "—" : kpi.value} carregando={isLoading}
              ativo={isActive} onClick={alternar} ariaLabel={rotuloAcessivel} title={titulo}
              testId={kpi.testId} faixa={m.dot} tinta={m.text} />
          );
        }
        return (
          // O <span title> carrega o significado: o CartaoKpi não repassa `title`.
          <span key={kpi.label} title={titulo} style={{ display: "grid", minWidth: 0 }}>
            <CartaoKpi
              tom={TOM_DA_ETAPA[kpi.testId] ?? "neutro"}
              rotulo={kpi.label}
              valor={isLoading ? "—" : kpi.value}
              sub={isActive ? "Clique para limpar" : kpi.sub}
              ativo={isActive}
              onClick={alternar}
              aria-label={rotuloAcessivel}
              data-testid={kpi.testId}
            />
          </span>
        );
      })}
      {/* Total — mostra todas as etapas. O ✓ (stat-total-ativo) diz "ativo"
          sem depender de cor. No celular (sete etapas + Total = 8 em 3
          colunas) ele ocupa as duas colunas que sobram da última linha. */}
      {isMobile ? (
        <CartaoDeEtapaCelular rotulo="Total" valor={isLoading ? "—" : stats.total} carregando={isLoading}
          ativo={filtros.status.length === 0} onClick={() => patchFiltros({ status: [] })}
          ariaLabel={`Mostrar todos os status — ${stats.total} peças`}
          title={filtros.status.length === 0 ? "Mostrando todas as etapas" : "Ver todas as etapas"}
          testId="stat-total" faixa={T.accent} tinta={T.text} colunas={2} />
      ) : (
        <span title={filtros.status.length === 0 ? "Mostrando todas as etapas" : "Ver todas as etapas"} style={{ display: "grid", minWidth: 0 }}>
          <CartaoKpi
            tom="neutro"
            rotulo="Total"
            valor={isLoading ? "—" : stats.total}
            sub={filtros.status.length === 0
              ? <span data-testid="stat-total-ativo" style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><Check aria-hidden="true" style={{ width: 12, height: 12, flexShrink: 0 }} />Todas as etapas</span>
              : "Ver todas"}
            ativo={filtros.status.length === 0}
            onClick={() => patchFiltros({ status: [] })}
            aria-label={`Mostrar todos os status — ${stats.total} peças`}
            data-testid="stat-total"
          />
        </span>
      )}
    </div>
  );
}
