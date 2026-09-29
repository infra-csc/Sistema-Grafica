// ─────────────────────────────────────────────────────────────────────────────
// UMA LINHA DO PAINEL DE LOTE — a peça elegível, a caixinha e a miniatura.
// ─────────────────────────────────────────────────────────────────────────────
import type { Dispatch, SetStateAction } from "react";
import { AlertCircle, Eye, Package } from "lucide-react";
import { SeloKit } from "@/components/kit/selo-kit";
import { miniatura } from "@/lib/miniatura";
import { FS, FW, R, T, N, TOM } from "@/lib/theme";
import { aoFalharMiniatura } from "./regras";
import { codigoDaPeca, letra } from "./estilos";
import type { PecaAtendimento } from "./tipos";

export function LinhaDoLote({ item, batchSelectedItemIds, setBatchSelectedItemIds, setBatchPreviewItem, toque = false }: {
  item: PecaAtendimento;
  batchSelectedItemIds: Set<string>;
  setBatchSelectedItemIds: Dispatch<SetStateAction<Set<string>>>;
  setBatchPreviewItem: Dispatch<SetStateAction<PecaAtendimento | null>>;
  /** Celular: piso de 12px nas letras. */
  toque?: boolean;
}) {
  const isChecked = batchSelectedItemIds.has(item.id);
  const hasThumb = !!item.approvalThumbUrl;
  return (
    <div
      data-testid={`batch-item-row-${item.id}`}
      onClick={() => setBatchSelectedItemIds(prev => {
        const next = new Set(prev);
        if (next.has(item.id)) next.delete(item.id);
        else next.add(item.id);
        return next;
      })}
      className={isChecked ? undefined : 'atd-linha'}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '8px 12px',
        // MARCADA em tinta clara com borda cheia — a linha escolhida se
        // separa das outras sem virar um bloco laranja.
        backgroundColor: isChecked ? TOM.laranja.bg : T.surface,
        border: `1px solid ${isChecked ? TOM.laranja.border : T.border}`,
        boxShadow: isChecked ? `inset 3px 0 0 ${T.accent}` : 'none',
        borderRadius: R.md, cursor: 'pointer',
        transition: 'border-color var(--dur-rapida) ease, background-color var(--dur-rapida) ease, box-shadow var(--dur-rapida) ease',
      }}
    >
      <input
        type="checkbox"
        checked={isChecked}
        aria-label={`Selecionar ${item.displayId} — ${item.type}`}
        data-testid={`checkbox-batch-item-${item.id}`}
        // O clique no checkbox NÃO pode subir para o card: o card
        // também alterna, e os dois toggles se anulavam — por isso
        // clicar na caixinha parecia não desmarcar.
        onClick={e => e.stopPropagation()}
        onChange={() => setBatchSelectedItemIds(prev => {
          const next = new Set(prev);
          if (next.has(item.id)) next.delete(item.id);
          else next.add(item.id);
          return next;
        })}
        style={{ accentColor: T.accentText, width: 18, height: 18, cursor: 'pointer', flexShrink: 0, margin: 0 }}
      />
      {/* Miniatura — o clique abre a arte em tamanho grande (sem mexer na
          seleção). O olho aparece no hover, pela classe (era
          onMouseEnter trocando a opacidade à mão). */}
      <div
        onClick={e => { if (hasThumb) { e.stopPropagation(); setBatchPreviewItem(item); } }}
        data-testid={`batch-thumb-${item.id}`}
        title={hasThumb ? 'Clique para ver a arte' : 'Sem arte enviada'}
        className={hasThumb ? 'atd-miniatura' : undefined}
        style={{ width: 52, height: 52, borderRadius: R.md, backgroundColor: hasThumb ? N.n3 : N.n2, flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${T.border}`, position: 'relative', cursor: hasThumb ? 'zoom-in' : 'default' }}
      >
        {hasThumb ? (
          <>
            <img
              src={miniatura(item.approvalThumbUrl)}
              alt=""
              loading="lazy"
              decoding="async"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={aoFalharMiniatura}
            />
            <div data-fallback="1" style={{ display: 'none', position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', background: N.n2, flexDirection: 'column', gap: 2 }}>
              <Package aria-hidden="true" style={{ width: 16, height: 16, color: T.bdark }} />
              <span style={{ fontSize: letra(FS.micro, toque), color: T.second, fontWeight: FW.medio, letterSpacing: '0.03em' }}>SEM ARTE</span>
            </div>
            <span className="atd-olho" style={{ position: 'absolute', inset: 0, background: 'rgba(28,25,23,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Eye aria-hidden="true" style={{ width: 16, height: 16, color: T.surface }} />
            </span>
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <Package aria-hidden="true" style={{ width: 18, height: 18, color: T.bdark }} />
          </div>
        )}
      </div>
      {/* Info */}
      <div style={{ flex: '1 1 0%', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2, minWidth: 0 }}>
          {/* Código em cinza mono, como na linha da fila. */}
          <span style={codigoDaPeca(toque)}>
            {item.displayId}
          </span>
          <SeloKit peca={item} style={{ flexShrink: 0 }} />
          <span style={{ fontSize: letra(FS.body, toque), fontWeight: FW.forte, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.type}
          </span>
        </div>
        {item.description && (
          <p style={{ fontSize: letra(FS.small, toque), color: T.second, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.description}
          </p>
        )}
      </div>
      {/* Só o que PEDE atenção: "Sem arte". O selo verde "Arte OK" em toda
          linha com arte era a regra, não a exceção. */}
      {!hasThumb && (
        <div style={{ flexShrink: 0 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: letra(FS.small, toque), color: TOM.alerta.text, fontWeight: FW.forte, background: TOM.alerta.bg, border: `1px solid ${TOM.alerta.border}`, borderRadius: R.pill, padding: '2px 8px', whiteSpace: 'nowrap' }}>
            <AlertCircle aria-hidden="true" style={{ width: 11, height: 11 }} /> Sem arte
          </span>
        </div>
      )}
    </div>
  );
}
