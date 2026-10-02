// ─────────────────────────────────────────────────────────────────────────────
// PEÇAS DE ESCOLHA — o vocabulário comum dos quatro diálogos que escolhem
// patrocinador (do evento, acrescentar, aplicar em lote) e da caixinha de
// seleção da fila.
//
// Cada diálogo desenhava a sua lista: um com a linha laranja e o círculo
// cheio, outro com a linha VERDE e só um ✓, outro com borda de 2px e anel
// vazado. A mesma pergunta ("quem entra?") tinha três caras — e a pessoa
// aprendia três vezes. Aqui ficam UMA busca, UMA linha de opção e UM marcador
// (caixa para escolha múltipla, bolinha para escolha única).
// ─────────────────────────────────────────────────────────────────────────────
import type { CSSProperties, ReactNode, RefObject } from "react";
import { Check, Search, X } from "lucide-react";
import { alvo } from "@/hooks/use-mobile";
import { TOM, T, R, FS, FW } from "@/lib/theme";

/**
 * A CAIXINHA COM ALVO DE DEDO. No toque, a regra global de 44px (index.css)
 * esticava a caixa de 16px numa barra de 16×44 — parecia quebrada. Aqui a
 * caixa fica com 16 (`data-alvo-natural`) e a <label> em volta é o alvo de
 * 44×44: tocar na célula marca. No mouse a label some (`display: contents`).
 */
export function CaixaDeToque({ dedo, children }: { dedo: boolean; children: ReactNode }) {
  return (
    <label
      onClick={(e) => e.stopPropagation()}
      style={dedo
        ? { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, cursor: 'pointer', flexShrink: 0 }
        : { display: 'contents' }}
    >
      {children}
    </label>
  );
}


/** Campo de busca dos diálogos: lupa, X para limpar, 16px no toque (o iOS dá zoom abaixo disso). */
export function CampoDeBusca({
  valor, aoMudar, placeholder, rotulo, dedo, isMobile, testId, autoFocus, inputRef,
}: {
  valor: string;
  aoMudar: (v: string) => void;
  placeholder: string;
  rotulo: string;
  dedo: boolean;
  isMobile?: boolean;
  testId?: string;
  autoFocus?: boolean;
  inputRef?: RefObject<HTMLInputElement>;
}) {
  return (
    <div style={{ position: 'relative' }}>
      <Search aria-hidden="true" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 15, height: 15, color: T.second, pointerEvents: 'none' }} />
      <input
        ref={inputRef}
        type="text"
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        placeholder={placeholder}
        aria-label={rotulo}
        data-testid={testId}
        autoFocus={autoFocus}
        className="vinc-campo"
        style={{
          width: '100%', height: alvo(38, dedo), padding: `0 ${valor ? 40 : 12}px 0 36px`, boxSizing: 'border-box',
          borderRadius: R.md, border: `1px solid ${T.border}`, backgroundColor: T.surface, color: T.text,
          font: 'inherit', fontSize: dedo || isMobile ? FS.lead : FS.body,
        }}
      />
      {valor && (
        <button
          type="button"
          onClick={() => aoMudar('')}
          aria-label="Limpar a busca"
          title="Limpar a busca"
          style={{
            position: 'absolute', right: dedo ? 0 : 4, top: '50%', transform: 'translateY(-50%)',
            width: alvo(30, dedo), height: alvo(30, dedo), borderRadius: R.pill, border: 'none', background: 'none',
            color: T.second, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
          }}
        >
          <X aria-hidden="true" style={{ width: 14, height: 14 }} />
        </button>
      )}
    </div>
  );
}

/** A casca de uma opção de patrocinador na lista de um diálogo. */
export function estiloDaOpcao(marcada: boolean, dedo: boolean): CSSProperties {
  return {
    display: 'flex', alignItems: 'center', gap: 10, width: '100%', boxSizing: 'border-box',
    minHeight: alvo(42, dedo), padding: '8px 12px',
    borderRadius: R.md, cursor: 'pointer', font: 'inherit', textAlign: 'left',
    border: `1px solid ${marcada ? TOM.laranja.border : T.border}`,
    backgroundColor: marcada ? TOM.laranja.bg : T.surface,
    color: T.text,
    transition: 'background-color 0.12s, border-color 0.12s',
  };
}

/** Bolinha da cor da marca — decorativa, o nome é o que se lê. */
export function PontoDaMarca({ cor }: { cor?: string | null }) {
  return <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: cor || T.muted, flexShrink: 0, boxShadow: `0 0 0 2px ${T.surface}` }} />;
}

/** Nome (até duas linhas) + empresa em tom de apoio. */
export function NomeDaMarca({ nome, empresa, marcada }: { nome: string; empresa?: string | null; marcada: boolean }) {
  return (
    <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
      <span style={{ fontSize: FS.body, fontWeight: marcada ? FW.forte : FW.medio, color: T.text, lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
        {nome}
      </span>
      {empresa && <span style={{ fontSize: FS.meta, color: T.apoio, lineHeight: 1.3 }}>{empresa}</span>}
    </span>
  );
}

/**
 * O MARCADOR À DIREITA. Caixa (quadrada) quando dá para marcar vários; bolinha
 * quando a escolha é uma só — a forma já diz a regra antes do clique.
 */
export function Marcador({ marcado, unico = false }: { marcado: boolean; unico?: boolean }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: 18, height: 18, flexShrink: 0, boxSizing: 'border-box',
        borderRadius: unico ? R.pill : 5,
        border: marcado ? 'none' : `1.5px solid ${T.bdark}`,
        backgroundColor: marcado ? T.accentText : T.surface,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'background-color 0.12s',
      }}
    >
      {marcado && (unico
        ? <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: T.surface }} />
        : <Check style={{ width: 12, height: 12, color: T.surface, strokeWidth: 3 }} />)}
    </span>
  );
}

/** Rótulo de seção dentro da lista ("Neste evento · 5"). */
export function RotuloDaLista({ children, acao }: { children: ReactNode; acao?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '6px 2px 2px', minHeight: 28 }}>
      <span style={{ fontSize: FS.small, fontWeight: FW.rotulo, color: T.apoio, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {children}
      </span>
      {acao}
    </div>
  );
}
