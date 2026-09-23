// ─────────────────────────────────────────────────────────────────────────────
// BARRA DE LOTE — flutua no rodapé enquanto houver seleção.
//
// A seleção pode misturar peça em vinculação com peça já enviada: cada ação
// da barra diz em quantas ELA age, em vez de prometer o total. No celular a
// barra quebra linha — lado a lado, "Salvar", "Acrescentar" e "Aplicar"
// passavam dos 390px e cortavam justamente o botão da ação principal.
// ─────────────────────────────────────────────────────────────────────────────
import type { Dispatch, SetStateAction } from "react";
import { PlusCircle, Save, Users } from "lucide-react";
import { Botao } from "@/components/ui/botao";
import { T, R, FS, FW, FONT, SHADOW } from "@/lib/theme";
import type { UIStatus } from "./tipos";

type Props = {
  selectedItemIds: Set<string>;
  setSelectedItemIds: Dispatch<SetStateAction<Set<string>>>;
  optimisticSentIds: Set<string>;
  itemUIStates: Record<string, UIStatus>;
  salvarSelecionadas: (ids: string[]) => void;
  salvando: boolean;
  podeAcrescentar: boolean;
  abrirAcrescentar: () => void;
  handleOpenBulkApplyDialog: () => void;
  isMobile: boolean;
  dedo: boolean;
};

export function BarraDeLote({
  selectedItemIds, setSelectedItemIds, optimisticSentIds, itemUIStates, salvarSelecionadas, salvando,
  podeAcrescentar, abrirAcrescentar, handleOpenBulkApplyDialog, isMobile, dedo,
}: Props) {
  if (selectedItemIds.size === 0) return null;
  const idsSelecionados = Array.from(selectedItemIds);
  const enviadasSelecionadas = idsSelecionados
    .filter(id => optimisticSentIds.has(id) || (itemUIStates[id] || 'PENDENTE') === 'ENVIADO').length;
  const naVinculacao = idsSelecionados.length - enviadasSelecionadas;
  return (
    <div style={{ position: 'fixed', bottom: isMobile ? 12 : 32, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 720, padding: isMobile ? '0 12px' : '0 24px', zIndex: 50, boxSizing: 'border-box' }}>
      {/* BARRA CLARA, como o resto da tela. Era escura (#1c1917) com
          botões translúcidos — e o primário do design system é escuro:
          sobre fundo escuro ele sumiria. A sombra grande é que a separa
          da tabela que rola por baixo. */}
      <div style={{ backgroundColor: T.surface, color: T.text, padding: isMobile ? '12px 14px' : '14px 20px', borderRadius: R.lg, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, boxShadow: `${SHADOW.lg}, 0 4px 24px rgba(28,25,23,0.12)`, border: `1px solid ${T.bdark}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 40, height: 40, backgroundColor: T.accentText, borderRadius: R.md, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: FS.title, fontWeight: FW.forte, fontFamily: FONT.display, color: T.surface, flexShrink: 0 }}>
            {selectedItemIds.size}
          </div>
          {/* Uma frase só. A segunda linha era o rótulo "Ação em lote" —
              que não informa nada: a barra inteira é a ação em lote, e ela
              já custava a altura de duas linhas fixa no rodapé da tela. */}
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: FS.read, fontWeight: FW.forte, letterSpacing: '-0.01em', color: T.text, margin: 0 }}>
              {selectedItemIds.size} {selectedItemIds.size === 1 ? 'peça selecionada' : 'peças selecionadas'}
            </p>
            {/* O DESCONTO, DITO ANTES DO CLIQUE: "Aplicar" não alcança peça
                já enviada, e prometer 12 para agir em 9 é a mentira que a
                seleção mista cria. */}
            {enviadasSelecionadas > 0 && (
              <p data-testid="aviso-selecao-enviadas" style={{ fontSize: FS.meta, color: T.apoio, margin: '2px 0 0' }}>
                {enviadasSelecionadas} já {enviadasSelecionadas === 1 ? 'enviada' : 'enviadas'} — nelas só dá para acrescentar
              </p>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginLeft: 'auto' }}>
          <Botao
            variante="fantasma"
            tamanho={dedo ? "toque" : "md"}
            onClick={() => setSelectedItemIds(new Set())}
            data-testid="button-clear-selection"
          >
            Limpar
          </Botao>
          {(() => {
            const dirtySelected = Array.from(selectedItemIds).filter(id => (itemUIStates[id] || 'PENDENTE') === 'RASCUNHO');
            if (dirtySelected.length === 0) return null;
            return (
              <Botao
                variante="secundario"
                tamanho={dedo ? "toque" : "md"}
                icone={Save}
                onClick={() => salvarSelecionadas(dirtySelected)}
                carregando={salvando}
                data-testid="button-save-selected"
              >
                {salvando ? 'Salvando...' : `Salvar ${dirtySelected.length} rascunho${dirtySelected.length !== 1 ? 's' : ''}`}
              </Botao>
            );
          })()}
          {/* ACRESCENTAR: vale para a seleção INTEIRA, inclusive as já
              enviadas — só soma, nunca reescreve. Admin e solicitação. */}
          {podeAcrescentar && (
          <Botao
            variante="secundario"
            tamanho={dedo ? "toque" : "md"}
            icone={PlusCircle}
            onClick={abrirAcrescentar}
            data-testid="button-acrescentar-sponsor"
            title="Acrescenta UM patrocinador às peças selecionadas, sem mexer nos vínculos que elas já têm — funciona mesmo depois do envio à Arte"
          >
            Acrescentar em {idsSelecionados.length}
          </Botao>
          )}
          {/* APLICAR reescreve a lista — por isso só alcança o que ainda
              está na vinculação. Some quando a seleção é toda de enviadas,
              em vez de existir para dar erro. */}
          {naVinculacao > 0 && (
            <Botao
              variante="primario"
              tamanho={dedo ? "toque" : "md"}
              icone={Users}
              onClick={handleOpenBulkApplyDialog}
              data-testid="button-apply-bulk-sponsors"
              title={enviadasSelecionadas > 0 ? `Reescreve os patrocinadores das ${naVinculacao} que ainda estão na vinculação` : undefined}
            >
              Aplicar{enviadasSelecionadas > 0 ? ` em ${naVinculacao}` : ' patrocinadores'}
            </Botao>
          )}
        </div>
      </div>
    </div>
  );
}
