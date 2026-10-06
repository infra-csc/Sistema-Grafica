// Os cartões de etapa do topo da fila: contam o recorte por etapa e, no
// clique, viram o filtro de status (a MESMA lista conta e filtra).
import type React from "react";
import { Check } from "lucide-react";
import { coresDoTom, type TomDoSelo } from "@/components/ui/selo";
import { FONT, FS, FW, MOTION, N, R, T } from "@/lib/theme";
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
        // Lados separados (não `border` + `borderLeft`): o React avisa ao
        // trocar o atalho junto com um lado no mesmo estilo.
        borderTop: `1px solid ${ativo ? tinta : T.border}`,
        borderRight: `1px solid ${ativo ? tinta : T.border}`,
        borderBottom: `1px solid ${ativo ? tinta : T.border}`,
        borderLeft: `4px solid ${faixa}`,
        borderRadius: R.md,
        // 4px (era 7): 46px de altura, 18px a menos nas três linhas — o alvo segue ≥ 44.
        padding: "4px 8px",
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

/**
 * A ESTEIRA (desktop e tablet): as oito etapas numa faixa só, com divisores
 * de 1px entre as células — não oito cartões soltos. A faixa colorida de cima
 * de cada célula, lida da esquerda para a direita, é o caminho da peça.
 * Oito numa linha a partir desta largura por célula; abaixo, 4 × 2.
 */
const LARGURA_MINIMA_DO_CARTAO = 112;
const COLUNAS_NUMA_LINHA = 8;

/** Os números de cada etapa no recorte atual (ver `stats` em useFilaDaGrafica). */
export type ContagemPorEtapa = {
  revisao: number; liberados: number; emProducao: number; produzidos: number;
  conferidos: number; embalados: number; entregues: number; total: number;
};

/**
 * Uma célula da esteira. Filtro de verdade: <button aria-pressed>. O estado
 * ativo não é só cor — a faixa engrossa, o fundo ganha a tinta da etapa e o
 * rótulo ganha o ✓. Número na cor da etapa (o mesmo mapa das pílulas).
 */
function CelulaDeEtapa({ tom, cores, rotulo, valor, sub, ativo, onClick, ariaLabel, title, testId, total = false, carregando }: {
  tom: TomDoSelo; /** As cores da PÍLULA da etapa (lib/status) — vencem o tom. */ cores?: { bg: string; text: string; dot: string }; rotulo: string; valor: React.ReactNode; sub: React.ReactNode; ativo: boolean; onClick: () => void;
  ariaLabel: string; title: string; testId: string; total?: boolean; carregando: boolean;
}) {
  const c = cores ?? coresDoTom(tom);
  const neutro = !cores && tom === "neutro";
  return (
    <button
      type="button"
      aria-pressed={ativo}
      aria-label={ariaLabel}
      title={title}
      onClick={onClick}
      data-testid={testId}
      className="ds-botao ds-kpi-principal grf-etapa"
      style={{
        position: "relative", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 3,
        minWidth: 0, width: "100%", textAlign: "left", font: "inherit", cursor: "pointer",
        padding: "13px 14px 12px", margin: 0, border: "none", borderRadius: 0,
        backgroundColor: ativo ? (neutro ? N.n2 : c.bg) : total ? T.bg : T.surface,
        // Divisores: 1px à direita e embaixo; a faixa recorta o que sobra na
        // última coluna e na última fileira (overflow hidden).
        boxShadow: `1px 0 0 ${T.border}, 0 1px 0 ${T.border}`,
        transition: `background-color ${MOTION.rapida} ease`,
      }}
    >
      {!total && (
        <span aria-hidden="true" style={{ position: "absolute", insetInline: 0, top: 0, height: ativo ? 4 : 3, backgroundColor: neutro ? T.bdark : c.dot }} />
      )}
      <span style={{ display: "flex", alignItems: "center", gap: 4, maxWidth: "100%", fontSize: FS.micro, fontWeight: FW.rotulo, letterSpacing: "0.08em", textTransform: "uppercase", color: ativo && !neutro ? c.text : T.second, whiteSpace: "nowrap" }}>
        {ativo && <Check aria-hidden="true" data-testid={`${testId}-ativo`} style={{ width: 12, height: 12, flexShrink: 0 }} />}
        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{rotulo}</span>
      </span>
      <span style={{ fontFamily: FONT.display, fontSize: 24, fontWeight: FW.rotulo, lineHeight: 1.05, letterSpacing: "-0.04em", fontVariantNumeric: "tabular-nums", // Zero não é notícia: o número fica no cinza de apoio, e a cor da etapa
        // sobra para onde há peça.
        color: carregando ? T.muted : valor === 0 ? T.second : neutro ? T.text : c.text }}>
        {valor}
      </span>
      <span style={{ fontSize: FS.small, lineHeight: 1.35, color: ativo && !neutro ? c.text : T.second }}>{sub}</span>
    </button>
  );
}

/**
 * As etapas da fila. Desktop e tablet: a ESTEIRA (CelulaDeEtapa). Continua
 * valendo: "—" enquanto carrega (zero seria afirmar fila vazia), o subtítulo
 * com o próximo passo, e o significado do status no title.
 * NO CELULAR o cartão segue local (CartaoDeEtapaCelular): o galpão não lê
 * nada abaixo de 12px. Os números seguem a lista (regra do dono) — ver `stats`.
 */
export function CartoesDeEtapa({ stats, filtros, patchFiltros, isMobile, isLoading, larguraConteudo }: {
  stats: ContagemPorEtapa;
  filtros: GraficaFiltros;
  patchFiltros: (p: Partial<GraficaFiltros>) => void;
  isMobile: boolean;
  isLoading: boolean;
  /** Largura útil da tela (0 enquanto não mediu) — decide 8 ou 4 colunas. */
  larguraConteudo: number;
}) {
  // SEM ÓRFÃOS: são 8 células (7 etapas + Total) — 8 numa linha quando cabem,
  // ou 4 × 2; as duas contas fecham. No celular são 3 colunas com o Total
  // ocupando 2.
  const colunas = larguraConteudo >= COLUNAS_NUMA_LINHA * LARGURA_MINIMA_DO_CARTAO ? COLUNAS_NUMA_LINHA : 4;
  const etapas = [
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
  ];
  const todas = filtros.status.length === 0;
  const celulas = etapas.map(kpi => {
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
      // As MESMAS cores da pílula de status da linha (e do cartão do celular):
      // "Impresso" rosa na pílula e roxo na esteira eram duas línguas. Só a
      // Revisão fica neutra — é trabalho chegando, sem ação da Gráfica.
      <CelulaDeEtapa key={kpi.label} tom={TOM_DA_ETAPA[kpi.testId] ?? "neutro"}
        cores={kpi.testId === "stat-revisao" ? undefined : getStatusMeta(kpi.filterVals[0])} rotulo={kpi.label}
        valor={isLoading ? "—" : kpi.value} carregando={isLoading}
        sub={isActive ? "Clique para limpar" : kpi.sub} ativo={isActive} onClick={alternar}
        ariaLabel={rotuloAcessivel} title={titulo} testId={kpi.testId} />
    );
  });
  // Total — mostra todas as etapas. O ✓ (stat-total-ativo) diz "ativo" sem
  // depender de cor. No celular (sete etapas + Total = 8 em 3 colunas) ele
  // ocupa as duas colunas que sobram da última linha.
  const total = isMobile ? (
    <CartaoDeEtapaCelular key="total" rotulo="Total" valor={isLoading ? "—" : stats.total} carregando={isLoading}
      ativo={todas} onClick={() => patchFiltros({ status: [] })}
      ariaLabel={`Mostrar todos os status — ${stats.total} peças`}
      title={todas ? "Mostrando todas as etapas" : "Ver todas as etapas"}
      testId="stat-total" faixa={T.accent} tinta={T.text} colunas={2} />
  ) : (
    <CelulaDeEtapa key="total" tom="neutro" total rotulo="Total" valor={isLoading ? "—" : stats.total} carregando={isLoading}
      sub={todas ? "Todas as etapas" : "Ver todas"} ativo={todas} onClick={() => patchFiltros({ status: [] })}
      ariaLabel={`Mostrar todos os status — ${stats.total} peças`}
      title={todas ? "Mostrando todas as etapas" : "Ver todas as etapas"} testId="stat-total" />
  );
  if (isMobile) {
    return (
      <div role="group" aria-label="Filtrar a fila por etapa" data-testid="grade-etapas" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
        {celulas}{total}
      </div>
    );
  }
  return (
    <div role="group" aria-label="Filtrar a fila por etapa" data-testid="grade-etapas"
      style={{ display: "grid", gridTemplateColumns: `repeat(${colunas}, minmax(0, 1fr))`, flexShrink: 0, border: `1px solid ${T.border}`, borderRadius: R.lg, backgroundColor: T.surface, overflow: "hidden" }}>
      {celulas}{total}
    </div>
  );
}
