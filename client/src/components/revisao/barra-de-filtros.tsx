// A barra de filtros da Revisão Final: busca, evento, tipo, os chips de faceta,
// o "selecionar todos" e o contador único da tela. As ações em lote entram
// como `children`, na mesma faixa — seguem à mão com a lista rolada.
//
// DOIS DESENHOS, a régua da Arte e da Gráfica:
//   · desktop/tablet — faixa FIXA no topo da lista, tudo numa linha que quebra;
//   · CELULAR (25/09) — a faixa ROLA junto com a página (fixa, com busca,
//     evento, tipo, dois chips e o contador, ocupava ~5 linhas de 44px — um
//     terço da tela antes da primeira peça). Fica a busca com o botão
//     "Filtros (n)", o Evento à vista e a linha do "Selecionar todos"; Tipo e
//     facetas moram numa FOLHA de tela cheia, com "Ver N peças" no rodapé.
//     O lote, no celular, vira barra fixa no rodapé (ver BarraDoLote).
import { useEffect, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { Filter, Search, X } from "lucide-react";
import { FilterSelect } from "@/components/filter-select";
import { EventFilterDropdown } from "@/components/event-filter-dropdown";
import { Botao } from "@/components/ui/botao";
import { alvo } from "@/hooks/use-mobile";
import { SOLICITACAO_AO_ESTOQUE_ATIVA } from "@shared/consultas-de-estoque";
import { T, TOM, FS, R, FONT } from "@/lib/theme";
import { TI } from "./regras";
import { letra } from "./estilos";
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
  /** A lista está em tabela? O cabeçalho da tabela já tem o "selecionar todos". */
  emTabela: boolean;
  children?: ReactNode;
}

export function BarraDeFiltros(p: BarraDeFiltrosProps) {
  const {
    isMobile, dedo, alturaControle, fonteDeCampo, searchRef, searchTerm, setSearchTerm,
    eventFilter, itemTypeFilter, soSemArquivo, soEventoFinalizado, filtroEstoque,
  } = p;
  const [folhaAberta, setFolhaAberta] = useState(false);
  // O celular fecha a folha se a tela alargar (girar o tablet, redimensionar).
  useEffect(() => { if (!isMobile) setFolhaAberta(false); }, [isMobile]);
  const folhaRef = useRef<HTMLDivElement>(null);
  /** Filtros que moram na folha do celular e estão ligados — o "(n)" do botão. */
  const nNaFolha = (itemTypeFilter.length > 0 ? 1 : 0) + (soSemArquivo ? 1 : 0) + (soEventoFinalizado ? 1 : 0) + (filtroEstoque ? 1 : 0);
  const algumFiltro = !!searchTerm || eventFilter.length > 0 || nNaFolha > 0;

  // Campo branco com borda, como a busca da Arte e da Gráfica (era cinza sem
  // borda: 1,1:1 contra o branco da faixa — o campo não se desenhava).
  const campoBusca = (
    <div style={{ position: "relative", flex: isMobile ? "1 1 0%" : "1 1 240px", minWidth: isMobile ? 0 : 200 }}>
      <Search aria-hidden="true" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: T.apoio, pointerEvents: "none" }} />
      <input
        ref={searchRef}
        // O placeholder diz tudo o que a busca casa — inclusive o evento. O
        // "/" é o atalho de teclado: no celular não há teclado para ele.
        placeholder={isMobile || dedo ? "Buscar ID, tipo, descrição ou evento" : "ID, tipo, descrição ou evento   /"}
        aria-label="Buscar peça por ID, tipo, descrição ou evento"
        aria-keyshortcuts="/"
        value={searchTerm}
        onChange={e => setSearchTerm(e.target.value)}
        data-testid="input-search"
        style={{ width: "100%", height: alturaControle, paddingLeft: 32, paddingRight: searchTerm ? 44 : 12, backgroundColor: T.surface, border: `1px solid ${searchTerm ? T.accent : T.border}`, borderRadius: R.md, fontSize: fonteDeCampo, color: TI.text, boxSizing: "border-box" }}
      />
      {searchTerm && (
        <button type="button" onClick={() => { setSearchTerm(""); searchRef.current?.focus(); }} aria-label="Limpar busca" style={{ position: "absolute", right: 2, top: "50%", transform: "translateY(-50%)", width: alvo(30, dedo || isMobile), height: alvo(30, dedo || isMobile), background: "none", border: "none", borderRadius: R.sm, cursor: "pointer", color: T.apoio, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <X aria-hidden="true" style={{ width: 14, height: 14 }} />
        </button>
      )}
    </div>
  );

  const seletorDeTipo = (cheio: boolean) => (
    <FilterSelect
      fullWidth={cheio}
      label="Tipo de Peça" allLabel="Todos os tipos"
      values={itemTypeFilter} onValuesChange={p.setItemTypeFilter}
      options={p.typeFilterOptions}
      searchPlaceholder="Buscar tipo..." emptyText="Nenhum tipo encontrado."
      testId="select-type-filter"
      // Sem pele própria: o mesmo gatilho do Evento ao lado (era cinza sem
      // borda, e os dois filtros da mesma faixa pareciam de telas diferentes).
      triggerStyle={cheio ? undefined : { minWidth: 150 }}
    />
  );

  /* ── OS CHIPS DE FACETA ──
     "Sem arquivo final" e "Evento finalizado" são as duas perguntas que a
     fila faz o tempo todo e que nenhum dropdown respondia. A contagem sai do
     pool com a PRÓPRIA dimensão excluída (ver `contagemSemArquivo`), então o
     número é exatamente o de linhas que o clique entrega.

     Estado sem nenhuma peça não vira chip: o clique devolveria lista vazia
     sem dizer por quê. Fica se já estiver ligado, senão o chip sumiria com o
     filtro aceso e não haveria como apagá-lo. */
  const chips = ([
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
          cursor: "pointer", font: "inherit", fontSize: isMobile ? FS.read : FS.body, fontWeight: 600, whiteSpace: "nowrap",
        }}
      >
        <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: chip.ligado ? T.surface : chip.cor, flexShrink: 0 }} />
        {chip.rotulo}
        {/* Cheio, sem opacidade: o número é a notícia do chip (a .75 caía
            para 4,6:1 — no limite). */}
        <span style={{ fontFamily: FONT.mono, fontWeight: 700 }}>{chip.n}</span>
      </button>
    );
  });

  // "Selecionar todos" + o contador único da tela. Na TABELA o cabeçalho já
  // tem a caixa de marcar todas — duas caixas para a mesma coisa, uma em
  // cima da outra, era ruído; aqui ela fica só na lista em cartões.
  const selecionarEContar = (
    <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, minWidth: 0, ...(isMobile ? { marginLeft: 0, width: "100%", justifyContent: "space-between" } : {}) }}>
      {p.totalFiltradas > 0 && !p.emTabela && (
        <label style={{ display: "flex", alignItems: "center", gap: 8, minHeight: alturaControle, fontSize: isMobile ? FS.read : FS.body, fontWeight: 600, color: T.strong, cursor: "pointer", userSelect: "none" }}>
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
      {/* O contador único da tela. As peças de evento finalizado CONTAM aqui
          (todo contador conta o que a tela mostra), mas quem lê "74" precisa
          saber quanto daquilo é trabalho que ninguém vai mais fazer. */}
      <span data-testid="contador-da-fila" aria-live="polite" style={{ fontSize: letra(FS.small, isMobile), color: T.apoio, minWidth: 0, ...(isMobile ? { textAlign: "right" } : { whiteSpace: "nowrap" }) }}>
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
  );

  if (isMobile) {
    const nVisiveis = p.totalFiltradas;
    return (
      <section data-testid="barra-de-filtros-revisao" style={{ backgroundColor: T.surface, padding: "10px 12px", borderBottom: `1px solid ${TI.border}`, position: "relative" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {campoBusca}
            <button
              type="button"
              onClick={() => setFolhaAberta(true)}
              aria-haspopup="dialog"
              aria-expanded={folhaAberta}
              aria-controls="revisao-folha-filtros"
              data-testid="button-abrir-filtros-mobile"
              style={{ flex: "0 0 auto", display: "inline-flex", alignItems: "center", gap: 6, minHeight: 44, padding: "0 12px", borderRadius: R.md, border: `1px solid ${nNaFolha > 0 ? TOM.laranja.border : T.border}`, background: nNaFolha > 0 ? TOM.laranja.bg : T.surface, color: nNaFolha > 0 ? T.accentText : T.strong, fontSize: FS.read, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
            >
              <Filter aria-hidden="true" style={{ width: 15, height: 15 }} />
              Filtros{nNaFolha > 0 ? ` (${nNaFolha})` : ""}
            </button>
          </div>
          {/* O Evento à vista: é o recorte de todo dia ("o que sai primeiro"). */}
          <div data-testid="filtro-evento-mobile" style={{ width: "100%" }}>
            <EventFilterDropdown values={eventFilter} onValuesChange={p.setEventFilter} options={p.eventFilterOptions} fullWidth />
          </div>
          {selecionarEContar}
        </div>

        {folhaAberta && (
          <div
            ref={folhaRef}
            id="revisao-folha-filtros"
            role="dialog"
            aria-modal="true"
            aria-label="Filtros da Revisão Final"
            data-testid="folha-filtros-mobile"
            onKeyDown={e => { if (e.key === "Escape") setFolhaAberta(false); }}
            style={{ position: "fixed", inset: 0, zIndex: 90, height: "100dvh", backgroundColor: T.bg, display: "flex", flexDirection: "column", overscrollBehavior: "contain" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: "calc(6px + env(safe-area-inset-top))", paddingBottom: 6, paddingLeft: 14, paddingRight: 6, borderBottom: `1px solid ${T.border}`, backgroundColor: T.surface }}>
              <Filter aria-hidden="true" style={{ width: 16, height: 16, color: T.apoio }} />
              <span style={{ fontSize: FS.strong, fontWeight: 800, color: T.text }}>
                Filtros{nNaFolha > 0 ? ` · ${nNaFolha} ${nNaFolha === 1 ? "ativo" : "ativos"}` : ""}
              </span>
              <span style={{ flex: 1 }} />
              <button type="button" autoFocus onClick={() => setFolhaAberta(false)} aria-label="Fechar filtros" data-testid="button-fechar-filtros-mobile"
                style={{ width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center", border: "none", background: "transparent", color: T.apoio, cursor: "pointer" }}>
                <X aria-hidden="true" style={{ width: 20, height: 20 }} />
              </button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "14px 14px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <p style={{ margin: "0 0 6px", fontSize: FS.meta, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: T.apoio }}>Tipo de peça</p>
                {seletorDeTipo(true)}
              </div>
              {chips.some(Boolean) && (
                <div>
                  <p style={{ margin: "0 0 6px", fontSize: FS.meta, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: T.apoio }}>Mostrar só</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{chips}</div>
                </div>
              )}
            </div>
            {/* Rodapé fixo com o recorte seguro embaixo (home indicator).
                LONGOS: o atalho com env() some no parser do jsdom. */}
            <div style={{ display: "flex", gap: 8, paddingTop: 10, paddingLeft: 14, paddingRight: 14, paddingBottom: "calc(10px + env(safe-area-inset-bottom))", borderTop: `1px solid ${T.border}`, backgroundColor: T.surface }}>
              {algumFiltro && (
                <Botao variante="perigoSecundario" tamanho="toque" icone={X} onClick={p.limparFiltros} data-testid="button-clear-filters"
                  style={{ minHeight: 48 }}>
                  Limpar tudo
                </Botao>
              )}
              <Botao variante="primario" tamanho="toque" onClick={() => setFolhaAberta(false)} data-testid="button-aplicar-filtros-mobile"
                style={{ flex: "1 1 0%", minHeight: 48 }}>
                Ver {nVisiveis} {nVisiveis === 1 ? "peça" : "peças"}
              </Botao>
            </div>
          </div>
        )}

        {p.children}
      </section>
    );
  }

  return (
    <section data-testid="barra-de-filtros-revisao" style={{
      backgroundColor: T.surface, padding: "12px 32px",
      borderBottom: `1px solid ${TI.border}`,
      position: "sticky", top: 0, zIndex: 30,
      boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
    }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        {campoBusca}

        <EventFilterDropdown
          values={eventFilter}
          onValuesChange={p.setEventFilter}
          options={p.eventFilterOptions}
        />

        {seletorDeTipo(false)}

        {chips}

        {algumFiltro && (
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

        {selecionarEContar}
      </div>

      {p.children}
    </section>
  );
}
