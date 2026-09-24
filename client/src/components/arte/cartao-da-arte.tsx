import { memo } from "react";
import { AlertCircle } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { SponsorChips } from "@/components/sponsor-chips";
import { miniatura } from "@/lib/miniatura";
import { T, TOM, TOM_FORTE, N, R } from "@/lib/theme";
import { BotaoPrimario, MenuDeAcoes, MetaDaPeca, PrazoDaPeca, SelosDaPeca, TagsDaPeca } from "./celulas-da-peca";
import { fsToque } from "./constantes";
import type { PropsDaLinha } from "./linha-da-arte";

/**
 * O card do celular fala a MESMA língua da linha: código + selos, nome da
 * peça, prazo, uma linha secundária (qtd, medida, material) e UMA ação à
 * vista mais o "⋯". Patrocinadores só onde a etapa é a aprovação deles —
 * nas outras fases eles não mudam o gesto e moram na ficha.
 *
 * SELEÇÃO NO CARTÃO (revisão de celular/tablet, 24/09). A linha da tabela tem
 * a caixinha; o cartão não tinha nenhuma — "Selecionar tudo" marcava peças
 * sem sinal nenhum na lista, e não dava para marcar UMA para o PDF
 * compartilhado ou a exportação. Nas mesmas abas da tabela (e só nas peças que
 * a tabela deixa marcar), a caixinha entra com alvo de 44px e o cartão marcado
 * ganha a borda forte.
 */
export const CartaoDaArte = memo(function CartaoDaArte({
  item, tabId, comSelecao, selecionada, hoje, enviando, algumEnviando, podeEditar, dedo, eventoTemBook, acoes,
}: PropsDaLinha) {
  // Mesma regra da tabela (fila-agrupada: `selecionaveis`): em "Aguardando
  // envio" só a peça aguardando envio entra no lote; em Finalizados, todas.
  const marcavel = comSelecao && (tabId === "finalizados" || item.status === "awaiting_submission");
  return (
    <div
      role="button"
      tabIndex={0}
      data-testid={`card-arte-${item.id}`}
      aria-label={`Abrir a peça ${item.displayId}${item.type ? ` — ${item.type}` : ''}`}
      style={{ backgroundColor: selecionada ? TOM_FORTE.laranja.bg : T.surface, border: `1px solid ${selecionada ? TOM_FORTE.laranja.border : T.border}`, borderRadius: R.md, padding: 12, cursor: 'pointer', minWidth: 0 }}
      onClick={() => acoes.verDetalhes(item)}
      onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); acoes.verDetalhes(item); } }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
        {marcavel && (
          // O toque na caixinha marca — não abre a peça. 44×44 de alvo, com a
          // caixinha de 16 dentro; a margem negativa devolve o respiro do cartão.
          <label
            onClick={e => e.stopPropagation()}
            onKeyDown={e => e.stopPropagation()}
            data-testid={`alvo-selecao-${item.id}`}
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, margin: '-10px -4px -10px -12px', cursor: 'pointer', flexShrink: 0 }}
          >
            <Checkbox
              checked={selecionada}
              aria-label={`Selecionar a peça ${item.displayId}${item.type ? ` — ${item.type}` : ''}`}
              onCheckedChange={() => acoes.alternarSelecao(item.id)}
              data-testid={`checkbox-item-${item.id}`}
              // O alvo de 44px é a <label> em volta; a caixinha fica com 16.
              data-alvo-natural=""
            />
          </label>
        )}
        <span style={{ fontFamily: '"DM Mono", monospace', fontWeight: 600, color: T.apoio, fontSize: 12 }}>{item.displayId}</span>
        <SelosDaPeca item={item} tabId={tabId} dedo={dedo} />
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: T.text, overflowWrap: 'anywhere' }}>{item.type || item.description}</div>
          {item.type && item.description && <div style={{ fontSize: 12, color: T.apoio, overflowWrap: 'anywhere' }}>{item.description}</div>}
          <PrazoDaPeca item={item} tabId={tabId} hoje={hoje} dedo={dedo} />
          <MetaDaPeca item={item} comQtd dedo={dedo} />
          {item.observations && (
            <span style={{ fontSize: fsToque(11.5, dedo), color: TOM.alerta.text, display: 'flex', alignItems: 'flex-start', gap: 4, overflowWrap: 'anywhere' }}>
              <AlertCircle aria-hidden="true" style={{ width: 11, height: 11, flexShrink: 0, marginTop: 2 }} />{item.observations}
            </span>
          )}
          <TagsDaPeca item={item} eventoTemBook={eventoTemBook} dedo={dedo} />
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
          <SponsorChips sponsors={item.sponsors ?? []} variant="colored" size={dedo ? "md" : "sm"} max={3} destacarPendencia={tabId === "aguardando-patrocinador"} />
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }} onClick={e => e.stopPropagation()}>
        <BotaoPrimario item={item} tabId={tabId} largura="100%" podeEditar={podeEditar} dedo={dedo} enviando={enviando} algumEnviando={algumEnviando} acoes={acoes} />
        {/* Sem ação primária (Aguardando patrocinador, Finalizados), o "⋯"
            vai para a direita — sozinho à esquerda ele parecia um resto. */}
        <span style={{ marginLeft: 'auto', display: 'inline-flex' }}>
          <MenuDeAcoes item={item} podeEditar={podeEditar} dedo={dedo} acoes={acoes} />
        </span>
      </div>
    </div>
  );
});
