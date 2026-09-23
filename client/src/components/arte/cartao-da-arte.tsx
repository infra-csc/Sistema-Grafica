import { memo } from "react";
import { AlertCircle } from "lucide-react";
import { SponsorChips } from "@/components/sponsor-chips";
import { miniatura } from "@/lib/miniatura";
import { T, TOM, N, R } from "@/lib/theme";
import { BotaoPrimario, MenuDeAcoes, MetaDaPeca, PrazoDaPeca, SelosDaPeca, TagsDaPeca } from "./celulas-da-peca";
import type { PropsDaLinha } from "./linha-da-arte";

/**
 * O card do celular fala a MESMA língua da linha: código + selos, nome da
 * peça, prazo, uma linha secundária (qtd, medida, material) e UMA ação à
 * vista mais o "⋯". Patrocinadores só onde a etapa é a aprovação deles —
 * nas outras fases eles não mudam o gesto e moram na ficha.
 */
export const CartaoDaArte = memo(function CartaoDaArte({
  item, tabId, hoje, enviando, algumEnviando, podeEditar, dedo, eventoTemBook, acoes,
}: Omit<PropsDaLinha, "comSelecao" | "selecionada">) {
  return (
    <div
      role="button"
      tabIndex={0}
      data-testid={`card-arte-${item.id}`}
      style={{ backgroundColor: T.surface, border: `1px solid ${T.border}`, borderRadius: R.md, padding: 12, cursor: 'pointer' }}
      onClick={() => acoes.verDetalhes(item)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); acoes.verDetalhes(item); } }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
        <span style={{ fontFamily: '"DM Mono", monospace', fontWeight: 600, color: T.apoio, fontSize: 12 }}>{item.displayId}</span>
        <SelosDaPeca item={item} tabId={tabId} />
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: T.text }}>{item.type || item.description}</div>
          {item.type && item.description && <div style={{ fontSize: 12, color: T.apoio }}>{item.description}</div>}
          <PrazoDaPeca item={item} tabId={tabId} hoje={hoje} />
          <MetaDaPeca item={item} comQtd />
          {item.observations && (
            <span style={{ fontSize: 11.5, color: TOM.alerta.text, display: 'flex', alignItems: 'center', gap: 3 }}>
              <AlertCircle aria-hidden="true" style={{ width: 10, height: 10, flexShrink: 0 }} />{item.observations}
            </span>
          )}
          <TagsDaPeca item={item} eventoTemBook={eventoTemBook} />
        </div>
        {/* Mesmo teste isImage do card de correção: thumb em PDF virava um
            <img> quebrado aqui. À direita, pequena: é a arte da própria
            pessoa, e reconhecer a peça pela imagem é mais rápido que ler. */}
        {item.approvalThumbUrl && (/\.(png|jpg|jpeg|gif|webp)/i.test(item.approvalThumbUrl) || item.approvalThumbUrl.startsWith('/objects/')) && (
          <img loading="lazy" decoding="async" src={miniatura(item.approvalThumbUrl)} alt="" style={{ width: 56, height: 44, borderRadius: 6, objectFit: 'cover', flexShrink: 0, border: `1px solid ${N.n3}` }} />
        )}
      </div>
      {tabId === "aguardando-patrocinador" && (
        <div style={{ marginTop: 6 }}>
          <SponsorChips sponsors={item.sponsors ?? []} variant="colored" size="sm" max={3} destacarPendencia={tabId === "aguardando-patrocinador"} />
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }} onClick={e => e.stopPropagation()}>
        <BotaoPrimario item={item} tabId={tabId} largura="100%" podeEditar={podeEditar} dedo={dedo} enviando={enviando} algumEnviando={algumEnviando} acoes={acoes} />
        <MenuDeAcoes item={item} podeEditar={podeEditar} dedo={dedo} acoes={acoes} />
      </div>
    </div>
  );
});
