import { useRef } from "react";
import { T, FS, R, SHADOW, FW } from "@/lib/theme";
import { alvo } from "@/hooks/use-mobile";
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
// A regra fica ESCRITA, não num tooltip: ela é a resposta a "por que
// este está em cima", e essa pergunta se faz olhando a lista, não
// apontando para um controle. Ela mora na legenda logo acima da lista
// (barra-de-filtros.tsx), junto da contagem — é ali que o olho está.
//
// CONTROLE SEGMENTADO, e não três pílulas: as pílulas ao lado (situação)
// SOMAM baldes; a ordem é UMA escolha entre três. Formas diferentes para
// decisões diferentes — e a mesma forma do alternador Cartões | Lista.
// ══════════════════════════════════════════════════════════════════
export function BarraDeOrdem({ ordem, setOrdem, isMobile, dedo }: {
  ordem: OrdemDosEventos;
  setOrdem: (o: OrdemDosEventos) => void;
  isMobile: boolean;
  dedo: boolean;
}) {
  const refs = useRef<Partial<Record<OrdemDosEventos, HTMLButtonElement | null>>>({});
  const opcoes = ([
    ['saida', 'Saída do caminhão'],
    ['marco', 'Marco mais crítico'],
    ['nome', 'Nome'],
  ] as const);
  // Radiogroup de verdade: as setas trocam (o foco vai junto). Antes só o
  // item marcado recebia Tab e as setas não faziam nada — pelo teclado a
  // ordem não mudava.
  const mover = (e: React.KeyboardEvent, atual: OrdemDosEventos) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const i = opcoes.findIndex(([v]) => v === atual);
    const prox = opcoes[(i + (e.key === 'ArrowRight' ? 1 : opcoes.length - 1)) % opcoes.length][0];
    setOrdem(prox);
    refs.current[prox]?.focus();
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, width: isMobile ? '100%' : undefined }}>
      <span style={{ fontSize: FS.small, fontWeight: FW.medio, color: T.second, flexShrink: 0 }}>{isMobile ? 'Ordenar' : 'Ordenar por'}</span>
      <div
        role="radiogroup"
        aria-label="Critério de ordenação"
        style={{
          display: 'flex', alignItems: 'center', gap: 2,
          padding: 2, borderRadius: R.md,
          backgroundColor: T.low, border: `1px solid ${T.border}`,
          flex: isMobile ? 1 : undefined, minWidth: 0,
        }}
      >
        {opcoes.map(([valor, rotulo]) => {
          const ativo = ordem === valor;
          return (
            <button
              key={valor}
              ref={(el) => { refs.current[valor] = el; }}
              type="button"
              role="radio"
              aria-checked={ativo}
              tabIndex={ativo ? 0 : -1}
              onClick={() => setOrdem(valor)}
              onKeyDown={(e) => mover(e, valor)}
              data-testid={`toggle-ordem-${valor}`}
              className="evl-seg"
              style={{
                flex: isMobile ? 1 : undefined, minWidth: 0,
                height: alvo(26, dedo), padding: isMobile ? '0 6px' : '0 11px', borderRadius: R.sm, border: 'none',
                backgroundColor: ativo ? T.surface : 'transparent',
                boxShadow: ativo ? `${SHADOW.sm}, 0 0 0 1px ${T.border}` : 'none',
                color: ativo ? T.text : T.second,
                font: 'inherit', fontSize: isMobile ? FS.small : FS.body, fontWeight: ativo ? FW.forte : FW.medio,
                cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}
            >
              {isMobile && valor === 'saida' ? 'Saída' : isMobile && valor === 'marco' ? 'Marco crítico' : rotulo}
            </button>
          );
        })}
      </div>
    </div>
  );
}
