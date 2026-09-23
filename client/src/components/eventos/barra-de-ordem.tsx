import { T, FS, R, TOM } from "@/lib/theme";
import { alvo } from "@/hooks/use-mobile";
import { REGRA_DA_ORDEM } from "./regras";
import type { OrdemDosEventos } from "./tipos";

// ══════════════════════════════════════════════════════════════════
// ORDEM — declarada, e trocável.
//
// `sortedEvents` sempre ordenou por risco e depois pela saída do
// caminhão. É a ordem certa, e a tela nunca a dizia: ninguém entendia
// por que um evento era o terceiro, e não havia como pedir outro
// critério. Uma ordem que a pessoa não consegue nomear ela lê como
// aleatória — e passa a varrer a lista inteira toda vez, em vez de
// confiar no topo.
//
// A regra fica ESCRITA ao lado, não num tooltip: ela é a resposta a
// "por que este está em cima", e essa pergunta se faz olhando a lista,
// não apontando para um controle.
// ══════════════════════════════════════════════════════════════════
export function BarraDeOrdem({ ordem, setOrdem, isMobile, dedo }: {
  ordem: OrdemDosEventos;
  setOrdem: (o: OrdemDosEventos) => void;
  isMobile: boolean;
  dedo: boolean;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <span style={{ fontSize: FS.small, color: T.second, flexShrink: 0 }}>Ordem</span>
      <div
        role="radiogroup"
        aria-label="Critério de ordenação"
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          // No celular vira uma linha rolável: três alternadores mais a
          // regra não cabem em 390px, e embrulhar empurraria a lista para
          // fora da primeira tela.
          overflowX: isMobile ? 'auto' : 'visible',
          maxWidth: '100%',
        }}
      >
        {([
          ['saida', 'Saída do caminhão'],
          ['marco', 'Marco mais crítico'],
          ['nome', 'Nome'],
        ] as const).map(([valor, rotulo]) => {
          const ativo = ordem === valor;
          return (
            <button
              key={valor}
              type="button"
              role="radio"
              aria-checked={ativo}
              tabIndex={ativo ? 0 : -1}
              onClick={() => setOrdem(valor)}
              data-testid={`toggle-ordem-${valor}`}
              style={{
                height: alvo(30, dedo), padding: '0 12px', borderRadius: R.pill,
                border: `1px solid ${ativo ? TOM.laranja.border : T.border}`,
                backgroundColor: ativo ? TOM.laranja.bg : T.surface,
                color: ativo ? T.accentText : T.strong,
                font: 'inherit', fontSize: FS.body, fontWeight: ativo ? 700 : 600,
                cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
              }}
            >
              {rotulo}
            </button>
          );
        })}
      </div>
      <span style={{ fontSize: FS.small, color: T.second, minWidth: 0 }}>
        {REGRA_DA_ORDEM[ordem]}
      </span>
    </div>
  );
}
