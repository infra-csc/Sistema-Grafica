import type { Dispatch, SetStateAction } from "react";
import { ArrowRight, CheckCircle, Eye, Search, Upload } from "lucide-react";
import { Botao } from "@/components/ui/botao";
import { EstadoVazio } from "@/components/ui/estados";
import { PHASE_DEADLINE } from "@/lib/arte-rules";
import type { AbaDaArte } from "./tipos";

/** A fila vazia: diz POR QUE está vazia e oferece o próximo passo. */
export function VazioDaFila({ tabId, activeFilterCount, atrasadoFilter, setAtrasadoFilter, clearAllFilters, tabs, changeTab, dedo }: {
  tabId: string;
  activeFilterCount: number;
  atrasadoFilter: boolean;
  setAtrasadoFilter: Dispatch<SetStateAction<boolean>>;
  clearAllFilters: () => void;
  tabs: ReadonlyArray<AbaDaArte>;
  changeTab: (tabId: string) => void;
  dedo: boolean;
}) {
  const porFiltro = activeFilterCount > 0;
  // Vazio POR CAUSA do recorte de atrasadas tem texto próprio: "nenhuma
  // peça aguardando envio" leria como "nada a fazer" quando a fila inteira
  // continua ali, só que dentro do prazo. O atalho desliga só este recorte
  // e mantém os demais — sair de "atrasadas" não deveria custar o filtro
  // de evento que a pessoa montou antes.
  const soAtrasadas = atrasadoFilter;
  const marco = PHASE_DEADLINE[tabId]?.label ?? "prazo da fase";
  const outrosFiltros = activeFilterCount - 1;
  // O próximo passo, quando há um: desligar o recorte que esvaziou a lista
  // ou, fila zerada sem filtro, ir à próxima fase COM peças em que a Arte
  // age (rodada 4) — a pessoa não precisa varrer as outras abas.
  const destino = !porFiltro
    ? tabs.find(t => t.id !== tabId && t.count > 0 && ['correcao', 'criar-aprovacoes', 'finalizar-layouts'].includes(t.id))
    : undefined;
  const acao = porFiltro ? (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
      {soAtrasadas && (
        <Botao variante="primario" tamanho={dedo ? "toque" : "md"} onClick={() => setAtrasadoFilter(false)} data-testid="button-clear-atrasado-empty">
          Mostrar todos os prazos
        </Botao>
      )}
      <Botao variante="secundario" tamanho={dedo ? "toque" : "md"} onClick={clearAllFilters} data-testid="button-clear-filters-empty">
        Limpar {activeFilterCount === 1 ? 'o filtro' : `os ${activeFilterCount} filtros`}
      </Botao>
    </div>
  ) : destino ? (
    <Botao variante="primario" tamanho={dedo ? "toque" : "md"} onClick={() => changeTab(destino.id)} data-testid="button-empty-proxima-fase">
      Ir para {destino.label} ({destino.count})
      <ArrowRight aria-hidden="true" style={{ width: 14, height: 14 }} />
    </Botao>
  ) : undefined;
  return (
    <div data-testid="empty-arte">
      <EstadoVazio
        icone={soAtrasadas ? CheckCircle : porFiltro ? Search
          : tabId === "criar-aprovacoes" ? CheckCircle
          : tabId === "finalizar-layouts" ? Upload
          : Eye}
        titulo={soAtrasadas
          ? tabId === "finalizados"
            ? "Finalizados não tem atraso a mostrar"
            : "Nada atrasado nesta fase"
          : porFiltro
          ? "Nenhuma peça neste recorte"
          : tabId === "criar-aprovacoes" ? "Nenhuma peça aguardando envio"
          : tabId === "aguardando-patrocinador" ? "Nenhuma peça aguardando patrocinador"
          : tabId === "finalizar-layouts" ? "Nenhuma peça aguardando arquivo final"
          : "Nenhuma peça finalizada"}
        descricao={
          <span data-testid="empty-arte-motivo">
            {soAtrasadas
              ? tabId === "finalizados"
                ? "O marco desta fase é a própria saída do caminhão, que numa peça já pronta passou por definição — a lista está vazia pelo filtro, não porque falte trabalho."
                : `A lista está vazia pelo FILTRO "Prazo: atrasados"${outrosFiltros > 0 ? ` (e mais ${outrosFiltros} ${outrosFiltros === 1 ? 'filtro' : 'filtros'})` : ''} — as peças desta fase estão todas dentro do marco de ${marco}.`
              : porFiltro
              ? `${activeFilterCount} ${activeFilterCount === 1 ? 'filtro ativo' : 'filtros ativos'} estão escondendo o resto da fila`
              : tabId === "criar-aprovacoes" ? "Todo thumb desta fase já foi enviado"
              : tabId === "aguardando-patrocinador" ? "Nenhuma peça em aprovação pelo patrocinador"
              : tabId === "finalizar-layouts" ? "Nenhuma peça aprovada aguardando arquivo final"
              : "Nenhuma peça finalizada ainda"}
          </span>
        }
        acao={acao}
      />
    </div>
  );
}
