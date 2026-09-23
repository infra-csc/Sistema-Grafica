import type { Dispatch, RefObject, SetStateAction } from "react";
import { CheckSquare, X } from "lucide-react";
import { Abas } from "@/components/ui/abas";
import { Botao } from "@/components/ui/botao";
import { FilterSelect } from "@/components/filter-select";
import { alvo } from "@/hooks/use-mobile";
import { T, R, FS } from "@/lib/theme";
import { tomDaAba } from "./constantes";
import type { AbaDaArte, OpcaoDeFiltro, PecaDaArte } from "./tipos";

/** As fases (abas no desktop, seletor no celular) e o chip/ação de seleção. */
export function FasesESelecao({
  isMobile, dedo, podeEditar, activeTab, changeTab, tabs, faseAtualCount, faseFilterOptions, tablistRef,
  selectedItemIds, setSelectedItemIds, filteredItems,
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
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      {isMobile ? (
        // No celular as cinco abas somam ~900px e o contêiner raiz da tela
        // é overflow:hidden — o excesso era CLIPADO, não rolável, e três
        // fases (entre elas "Finalizar arte", que nem stat card tinha)
        // simplesmente deixavam de existir. Cinco abas com contador nunca
        // vão caber em 375px; um seletor cabe sempre e é alcançável por
        // teclado e leitor de tela sem truque nenhum.
        // `kind="field"` e não filtro: a fase não RECORTA a lista, ela
        // ESCOLHE qual lista está aberta — é o mesmo que as abas fazem no
        // desktop. Por isso não tem "Todos" (não existe "todas as fases"
        // nesta tela) nem × de limpar. A contagem saiu de dentro do
        // rótulo — "Aguardando envio (12)" era texto colado, que o leitor
        // de tela lia junto e que nenhum outro menu da casa escreve
        // assim — e virou a `count` da opção, como em todos os demais.
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, paddingBottom: 8 }}>
          {/* A contagem da fase ABERTA sobe para a legenda. Ela morava
              dentro do rótulo da opção ("Aguardando envio (12)") e, com a
              contagem virando `count` do menu, só apareceria com o menu
              aberto — no celular esta é a única porta para as fases, e o
              tamanho da fila aberta é o número que o operador olha antes
              de qualquer outro. */}
          <span style={{ fontSize: 11, fontWeight: 700, color: T.apoio, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Fase · {faseAtualCount} {faseAtualCount === 1 ? 'peça' : 'peças'}
          </span>
          <FilterSelect
            kind="field" hideSearch hideWhenEmpty={false} fullWidth
            label="Fase"
            value={activeTab}
            onChange={changeTab}
            options={faseFilterOptions}
            testId="select-fase-mobile"
          />
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

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {/* A seleção sobrevivia a filtro e a aba, e o único jeito de zerar
            5 peças marcadas em outra aba era selecionar as 300 da aba
            atual e clicar de novo. Agora é um chip próprio, sempre
            visível e sempre limpável em um clique — inclusive nas abas
            onde não existe checkbox. */}
        {selectedItemIds.size > 0 && (
          <span
            data-testid="chip-selecao"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: alvo(36, dedo), padding: '0 6px 0 12px', borderRadius: R.pill, background: T.text, color: T.surface, fontSize: FS.meta, fontWeight: 700, whiteSpace: 'nowrap' }}
          >
            {selectedItemIds.size} {selectedItemIds.size === 1 ? 'selecionada' : 'selecionadas'}
            <button
              onClick={() => setSelectedItemIds(new Set())}
              aria-label="Limpar seleção"
              data-testid="button-clear-selection"
              style={{ width: 24, height: 24, borderRadius: '50%', background: 'rgba(255,255,255,0.16)', border: 'none', cursor: 'pointer', color: T.surface, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <X style={{ width: 11, height: 11 }} />
            </button>
          </span>
        )}
        {podeEditar && (activeTab === "criar-aprovacoes" || activeTab === "finalizados") && filteredItems.length > 0 && (
          <Botao
            variante="secundario"
            tamanho={dedo ? "toque" : "md"}
            icone={selectedItemIds.size === filteredItems.length ? X : CheckSquare}
            onClick={() => {
              if (selectedItemIds.size === filteredItems.length) setSelectedItemIds(new Set());
              else setSelectedItemIds(new Set(filteredItems.map((i) => i.id)));
            }}
            data-testid="button-select-all"
            style={{ flexShrink: 0, fontWeight: 500 }}
          >
            {selectedItemIds.size === filteredItems.length ? 'Desmarcar tudo' : 'Selecionar tudo'}
          </Botao>
        )}
      </div>
    </div>
  );
}
