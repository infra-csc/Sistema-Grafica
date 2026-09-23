// A barra fixa da Revisão Final: busca, evento, tipo, os chips de faceta, o
// "selecionar todos" e o contador único da tela. As ações em lote entram como
// `children`, na mesma faixa fixa — seguem à mão com a lista rolada.
import type { ReactNode, RefObject } from "react";
import { Search, X } from "lucide-react";
import { FilterSelect } from "@/components/filter-select";
import { EventFilterDropdown } from "@/components/event-filter-dropdown";
import { Botao } from "@/components/ui/botao";
import { alvo } from "@/hooks/use-mobile";
import { SOLICITACAO_AO_ESTOQUE_ATIVA } from "@shared/consultas-de-estoque";
import { T, TOM, FS, R, FONT } from "@/lib/theme";
import { TI } from "./regras";
import type { FiltroDoEstoque, OpcaoDeFaceta } from "./tipos";

export interface BarraDeFiltrosProps {
  isMobile: boolean;
  dedo: boolean;
  alturaControle: number;
  fonteDeCampo: number;
  searchRef: RefObject<HTMLInputElement>;
  searchTerm: string;
  setSearchTerm: (v: string) => void;
  eventFilter: string[];
  setEventFilter: (v: string[]) => void;
  eventFilterOptions: OpcaoDeFaceta[];
  itemTypeFilter: string[];
  setItemTypeFilter: (v: string[]) => void;
  typeFilterOptions: OpcaoDeFaceta[];
  soSemArquivo: boolean;
  alternarSemArquivo: () => void;
  contagemSemArquivo: number;
  soEventoFinalizado: boolean;
  alternarEventoFinalizado: () => void;
  contagemEventoFinalizado: number;
  filtroEstoque: FiltroDoEstoque;
  alternarFiltroEstoque: (v: "aguardando" | "respondeu") => void;
  contagemDoEstoque: { aguardando: number; respondeu: number };
  limparFiltros: () => void;
  totalFiltradas: number;
  totalNaFila: number;
  totalSelecionadas: number;
  toggleAll: () => void;
  totalDeEventoFinalizado: number;
  children?: ReactNode;
}

export function BarraDeFiltros(p: BarraDeFiltrosProps) {
  const {
    isMobile, dedo, alturaControle, fonteDeCampo, searchRef, searchTerm, setSearchTerm,
    eventFilter, itemTypeFilter, soSemArquivo, soEventoFinalizado, filtroEstoque,
  } = p;
  return (
    <section style={{
      backgroundColor: T.surface, padding: isMobile ? "12px 12px" : "12px 32px",
      borderBottom: `1px solid ${TI.border}`,
      position: "sticky", top: 0, zIndex: 30,
      boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
    }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        {/* Search */}
        <div style={{ position: "relative", flex: "1 1 240px", minWidth: 200 }}>
          <Search style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: TI.muted, pointerEvents: "none" }} />
          <input
            ref={searchRef}
            // O placeholder diz tudo o que a busca casa — inclusive o evento.
            placeholder="ID, tipo, descrição ou evento   /"
            aria-label="Buscar peça por ID, tipo, descrição ou evento"
            aria-keyshortcuts="/"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            data-testid="input-search"
            style={{ width: "100%", height: alturaControle, paddingLeft: 34, paddingRight: searchTerm ? 40 : 12, backgroundColor: T.low, border: "none", borderRadius: R.md, fontSize: fonteDeCampo, color: TI.text, boxSizing: "border-box" }}
          />
          {searchTerm && (
            <button type="button" onClick={() => { setSearchTerm(""); searchRef.current?.focus(); }} aria-label="Limpar busca" style={{ position: "absolute", right: 2, top: "50%", transform: "translateY(-50%)", width: alvo(30, dedo), height: alvo(30, dedo), background: "none", border: "none", borderRadius: R.sm, cursor: "pointer", color: TI.secondary, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <X style={{ width: 13, height: 13 }} />
            </button>
          )}
        </div>

        {/* Event select */}
        <EventFilterDropdown
          values={eventFilter}
          onValuesChange={p.setEventFilter}
          options={p.eventFilterOptions}
        />

        {/* Type select */}
        <FilterSelect
          label="Tipo de Peça" allLabel="Todos os tipos"
          values={itemTypeFilter} onValuesChange={p.setItemTypeFilter}
          options={p.typeFilterOptions}
          searchPlaceholder="Buscar tipo..." emptyText="Nenhum tipo encontrado."
          testId="select-type-filter"
          triggerStyle={{ backgroundColor: T.low, border: "none", fontSize: FS.body, color: TI.text, minWidth: 150 }}
        />

        {/* ── OS CHIPS DE FACETA ──
            "Sem arquivo final" e "Evento finalizado" são as duas perguntas
            que a fila faz o tempo todo e que nenhum dropdown respondia. A
            contagem sai do pool com a PRÓPRIA dimensão excluída (ver
            `contagemSemArquivo`), então o número é exatamente o de linhas que
            o clique entrega.

            Estado sem nenhuma peça não vira chip: o clique devolveria lista
            vazia sem dizer por quê. Fica se já estiver ligado, senão o chip
            sumiria com o filtro aceso e não haveria como apagá-lo. */}
        {([
          { id: "sem-arquivo", rotulo: "Sem arquivo final", n: p.contagemSemArquivo, ligado: soSemArquivo, alterna: p.alternarSemArquivo, cor: T.accentText, testid: "chip-sem-arquivo" },
          { id: "evento-finalizado", rotulo: "Evento finalizado", n: p.contagemEventoFinalizado, ligado: soEventoFinalizado, alterna: p.alternarEventoFinalizado, cor: T.second, testid: "chip-evento-finalizado-faceta" },
          // Solicitação ao estoque: só com a chave ligada.
          ...(SOLICITACAO_AO_ESTOQUE_ATIVA ? [
          { id: "estoque-respondeu", rotulo: "Estoque respondeu", n: p.contagemDoEstoque.respondeu, ligado: filtroEstoque === "respondeu", alterna: () => p.alternarFiltroEstoque("respondeu"), cor: TOM.sucesso.text, testid: "chip-estoque-respondeu" },
          { id: "aguardando-estoque", rotulo: "Aguardando estoque", n: p.contagemDoEstoque.aguardando, ligado: filtroEstoque === "aguardando", alterna: () => p.alternarFiltroEstoque("aguardando"), cor: TOM.alerta.text, testid: "chip-aguardando-estoque" },
          ] : []),
        ]).map(chip => {
          if (chip.n === 0 && !chip.ligado) return null;
          return (
            <button
              key={chip.id}
              type="button"
              onClick={chip.alterna}
              aria-pressed={chip.ligado}
              title={chip.ligado ? `Remover o filtro ${chip.rotulo}` : `Ver só ${chip.rotulo.toLowerCase()}`}
              data-testid={chip.testid}
              style={{
                display: "inline-flex", alignItems: "center", gap: 7,
                height: alturaControle, padding: "0 12px", borderRadius: R.pill,
                border: `1px solid ${chip.ligado ? T.text : T.border}`,
                backgroundColor: chip.ligado ? T.text : T.surface,
                color: chip.ligado ? T.surface : T.strong,
                cursor: "pointer", font: "inherit", fontSize: FS.body, fontWeight: 600, whiteSpace: "nowrap",
              }}
            >
              <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: chip.ligado ? T.surface : chip.cor, flexShrink: 0 }} />
              {chip.rotulo}
              <span style={{ fontFamily: FONT.mono, fontWeight: 700, opacity: chip.ligado ? 1 : 0.75 }}>{chip.n}</span>
            </button>
          );
        })}

        {(searchTerm || eventFilter.length > 0 || itemTypeFilter.length > 0 || soSemArquivo || soEventoFinalizado || filtroEstoque) && (
          <Botao
            variante="fantasma"
            tamanho={dedo ? "toque" : "md"}
            icone={X}
            onClick={p.limparFiltros}
            data-testid="button-clear-filters"
          >
            Limpar filtros
          </Botao>
        )}

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          {p.totalFiltradas > 0 && (
            <label style={{ display: "flex", alignItems: "center", gap: 6, minHeight: alturaControle, fontSize: FS.body, color: TI.secondary, cursor: "pointer", userSelect: "none" }}>
              <input
                type="checkbox"
                checked={p.totalSelecionadas === p.totalFiltradas && p.totalFiltradas > 0}
                ref={el => { if (el) el.indeterminate = p.totalSelecionadas > 0 && p.totalSelecionadas < p.totalFiltradas; }}
                onChange={p.toggleAll}
                data-testid="checkbox-select-all"
                style={{ accentColor: TI.accent, width: 20, height: 20 }}
              />
              Selecionar todos
            </label>
          )}
          {/* O contador único da tela. As peças de evento finalizado CONTAM
              aqui (todo contador conta o que a tela mostra), mas quem lê "74"
              precisa saber quanto daquilo é trabalho que ninguém vai mais
              fazer. #746e69 sobre branco = 5,15:1 nos 11px. */}
          <span style={{ fontSize: FS.small, color: TI.secondary, whiteSpace: "nowrap" }}>
            {p.totalFiltradas} de {p.totalNaFila} peças
            {p.totalDeEventoFinalizado > 0 && (
              <span
                data-testid="chip-evento-finalizado"
                title={"Estas peças continuam na lista porque a Revisão Final é onde se vê o que ficou por revisar — e porque excluir peça segue liberado."
                  + " Liberar, devolver, reaproveitar e mexer na quantidade estão bloqueados nelas."}
              >
                {" · "}{p.totalDeEventoFinalizado} de evento finalizado
              </span>
            )}
          </span>
        </div>
      </div>

      {p.children}
    </section>
  );
}
