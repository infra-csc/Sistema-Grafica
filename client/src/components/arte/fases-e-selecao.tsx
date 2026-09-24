import { useLayoutEffect, useRef, useState, type Dispatch, type ReactNode, type RefObject, type SetStateAction } from "react";
import { CheckSquare, X } from "lucide-react";
import { Abas } from "@/components/ui/abas";
import { Botao } from "@/components/ui/botao";
import { FilterSelect } from "@/components/filter-select";
import { alvo, useElementSize } from "@/hooks/use-mobile";
import { T, R, FS } from "@/lib/theme";
import { tomDaAba } from "./constantes";
import type { AbaDaArte, OpcaoDeFiltro, PecaDaArte } from "./tipos";

/** As fases (abas no desktop, seletor no celular) e o chip/ação de seleção. */
export function FasesESelecao({
  isMobile, dedo, podeEditar, activeTab, changeTab, tabs, faseAtualCount, faseFilterOptions, tablistRef,
  selectedItemIds, setSelectedItemIds, filteredItems, ordenar,
}: {
  isMobile: boolean;
  dedo: boolean;
  podeEditar: boolean;
  activeTab: string;
  changeTab: (tabId: string) => void;
  tabs: ReadonlyArray<AbaDaArte>;
  faseAtualCount: number;
  faseFilterOptions: OpcaoDeFiltro[];
  tablistRef: RefObject<HTMLDivElement>;
  selectedItemIds: Set<string>;
  setSelectedItemIds: Dispatch<SetStateAction<Set<string>>>;
  filteredItems: PecaDaArte[];
  /** No celular o Ordenar (⇅) mora nesta linha, ao lado do seletor de fase. */
  ordenar?: ReactNode;
}) {
  // ABAS QUE NÃO CABEM VIRAM O SELETOR (revisão de tablet, 24/09). As cinco
  // abas pedem ~745px; em 1024px com a sidebar aberta a linha dá ~544 ao lado
  // do "Selecionar tudo", e "Finalizar arte" e "Finalizados" — duas filas em
  // que a Arte trabalha — ficavam escondidas atrás de uma rolagem lateral sem
  // sinal nenhum. Mede a largura NATURAL das abas (guardada enquanto elas estão
  // na tela) contra a linha disponível; sem medida (primeiro quadro, jsdom),
  // ficam as abas de sempre.
  const { ref: linhaRef, width: larguraDaLinha } = useElementSize<HTMLDivElement>();
  const ladoRef = useRef<HTMLDivElement>(null);
  const [larguraDasAbas, setLarguraDasAbas] = useState(0);
  useLayoutEffect(() => {
    if (isMobile) return;
    const lista = tablistRef.current?.querySelector<HTMLElement>('[role="tablist"]');
    if (!lista || lista.children.length === 0) return;
    // Da borda esquerda da 1ª aba à direita da última: o `scrollWidth` da
    // lista mediria a LINHA inteira quando ela é mais larga que as abas.
    const abas = Array.from(lista.children) as HTMLElement[];
    const natural = Math.ceil(abas[abas.length - 1].getBoundingClientRect().right - abas[0].getBoundingClientRect().left);
    if (natural > 0 && Math.abs(natural - larguraDasAbas) > 1) setLarguraDasAbas(natural);
  });
  const larguraDoLado = ladoRef.current?.offsetWidth ?? 0;
  const abasNaoCabem = !isMobile && larguraDasAbas > 0 && larguraDaLinha > 0
    && larguraDaLinha - larguraDoLado - 12 < larguraDasAbas;
  const comSeletor = isMobile || abasNaoCabem;

  const podeSelecionar = podeEditar && (activeTab === "criar-aprovacoes" || activeTab === "finalizados") && filteredItems.length > 0;
  const tudoMarcado = selectedItemIds.size === filteredItems.length;
  const alternarTudo = () => {
    if (tudoMarcado) setSelectedItemIds(new Set());
    else setSelectedItemIds(new Set(filteredItems.map((i) => i.id)));
  };

  const chipDaSelecao = selectedItemIds.size > 0 && (
    // A seleção sobrevivia a filtro e a aba, e o único jeito de zerar
    // 5 peças marcadas em outra aba era selecionar as 300 da aba atual e
    // clicar de novo. Agora é um chip próprio, sempre visível e sempre
    // limpável em um clique — inclusive nas abas onde não existe checkbox.
    <span
      data-testid="chip-selecao"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: alvo(36, dedo), padding: dedo ? '0 0 0 14px' : '0 6px 0 12px', borderRadius: R.pill, background: T.text, color: T.surface, fontSize: FS.meta, fontWeight: 700, whiteSpace: 'nowrap', alignSelf: isMobile ? 'flex-start' : undefined }}
    >
      {selectedItemIds.size} {selectedItemIds.size === 1 ? 'selecionada' : 'selecionadas'}
      <button
        onClick={() => setSelectedItemIds(new Set())}
        aria-label="Limpar seleção"
        data-testid="button-clear-selection"
        // 44px no toque: o X de 24px dentro do chip era o menor alvo do topo.
        style={{ width: dedo ? 44 : 24, height: dedo ? 44 : 24, borderRadius: '50%', background: dedo ? 'transparent' : 'rgba(255,255,255,0.16)', border: 'none', cursor: 'pointer', color: T.surface, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
      >
        <X aria-hidden="true" style={{ width: dedo ? 14 : 11, height: dedo ? 14 : 11 }} />
      </button>
    </span>
  );

  // O seletor de fase — o mesmo no celular e no tablet estreito.
  // `kind="field"` e não filtro: a fase não RECORTA a lista, ela ESCOLHE qual
  // lista está aberta — é o mesmo que as abas fazem no desktop. Por isso não
  // tem "Todos" (não existe "todas as fases") nem × de limpar. A contagem da
  // fase aberta vai NO GATILHO (`contagemNoGatilho`), como o contador da aba —
  // era uma legenda "FASE · 12 PEÇAS" numa linha própria, 18px a mais antes
  // da primeira peça; as outras fases dizem a sua no menu.
  const seletorDeFase = (
    <FilterSelect
      kind="field" hideSearch hideWhenEmpty={false} fullWidth
      label="Fase"
      value={activeTab}
      onChange={changeTab}
      options={faseFilterOptions}
      contagemNoGatilho
      testId="select-fase-mobile"
    />
  );

  if (isMobile) return (
    <div data-testid="linha-fase-mobile" style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: '1 1 0', minWidth: 0 }} aria-label={`Fase aberta: ${faseAtualCount} ${faseAtualCount === 1 ? 'peça' : 'peças'}`} role="group">
          {seletorDeFase}
        </div>
        {ordenar}
        {podeSelecionar && (
          <Botao
            variante="secundario"
            tamanho="toque"
            icone={tudoMarcado ? X : CheckSquare}
            tamanhoDoIcone={18}
            onClick={alternarTudo}
            data-testid="button-select-all"
            aria-label={tudoMarcado ? 'Desmarcar tudo' : 'Selecionar tudo'}
            title={tudoMarcado ? 'Desmarcar tudo' : 'Selecionar tudo'}
            style={{ width: 44, minWidth: 44, padding: 0, flex: '0 0 44px' }}
          />
        )}
      </div>
      {chipDaSelecao}
    </div>
  );

  return (
    <div ref={linhaRef} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      {comSeletor ? (
        <div data-testid="seletor-de-fase-estreito" style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 10 }}>
          <div style={{ flex: '1 1 auto', minWidth: 0, maxWidth: 380 }}>{seletorDeFase}</div>
          {ordenar}
        </div>
      ) : (
        // <Abas> do design system: setas/Home/End e roving tabindex moram
        // no componente, e o contador veste o tom DA FASE (tomDaAba, que
        // deriva de lib/status.ts) — antes todo contador ativo era
        // laranja. `prefixoDeTestId="tab"` mantém os ids `tab-<fase>`.
        // marginBottom -1: o sublinhado da aba tapa o filete do topo em
        // vez de desenhar um segundo embaixo dele.
        <div ref={tablistRef} style={{ flex: '1 1 auto', minWidth: 0, alignSelf: 'flex-end', marginBottom: -1 }}>
          <Abas
            itens={tabs.map(tab => ({
              id: tab.id,
              rotulo: tab.label,
              contador: tab.count > 0 ? tab.count : undefined,
              tom: tomDaAba(tab.id),
            }))}
            ativo={activeTab}
            aoTrocar={changeTab}
            rotuloDaLista="Fases da Arte"
            prefixoDeTestId="tab"
          />
        </div>
      )}

      <div ref={ladoRef} style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, paddingBottom: comSeletor ? 10 : 0 }}>
        {chipDaSelecao}
        {podeSelecionar && (
          <Botao
            variante="secundario"
            tamanho={dedo ? "toque" : "md"}
            icone={tudoMarcado ? X : CheckSquare}
            onClick={alternarTudo}
            data-testid="button-select-all"
            style={{ flexShrink: 0, fontWeight: 500 }}
          >
            {tudoMarcado ? 'Desmarcar tudo' : 'Selecionar tudo'}
          </Botao>
        )}
      </div>
    </div>
  );
}
