import { memo } from "react";
import { AlertCircle, FileText } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { SponsorChips } from "@/components/sponsor-chips";
import { formatQuantity } from "@/lib/arte-rules";
import { T, TOM, N } from "@/lib/theme";
import { hrefSeguro } from "@shared/url-segura";
import { ThumbPreview } from "./thumb-preview";
import { BotaoPrimario, MenuDeAcoes, MetaDaPeca, PrazoDaPeca, SelosDaPeca, TagsDaPeca } from "./celulas-da-peca";
import type { AcoesDaLinha, PecaDaArte } from "./tipos";

export interface PropsDaLinha {
  item: PecaDaArte;
  tabId: string;
  comSelecao: boolean;
  hoje: Date;
  selecionada: boolean;
  enviando: boolean;
  algumEnviando: boolean;
  podeEditar: boolean;
  dedo: boolean;
  eventoTemBook: boolean;
  acoes: AcoesDaLinha;
}

/**
 * A LINHA da tabela, memoizada. Todas as props são valores ou o objeto
 * estável de ações: digitar num modal, arrastar um arquivo ou marcar OUTRA
 * peça não redesenha esta linha (perf5-arte-atendimento conta isso).
 */
export const LinhaDaArte = memo(function LinhaDaArte({
  item, tabId, comSelecao, hoje, selecionada, enviando, algumEnviando, podeEditar, dedo, eventoTemBook, acoes,
}: PropsDaLinha) {
  return (
    <tr
      data-testid={`row-pending-item-${item.id}`}
      // A linha inteira abre os detalhes no desktop, como o card equivalente já
      // fazia no mobile — o mesmo conteúdo tinha dois modelos de interação.
      onClick={() => acoes.verDetalhes(item)}
      style={{ borderBottom: `1px solid ${N.n2}`, transition: 'background 0.15s', cursor: 'pointer' }}
      onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = T.bg}
      onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = T.surface}
    >
      {comSelecao && (
        <td style={{ padding: '9px 12px' }} onClick={e => e.stopPropagation()}>
          <Checkbox
            checked={selecionada}
            aria-label={`Selecionar a peça ${item.displayId}${item.type ? ` — ${item.type}` : ''}`}
            onCheckedChange={() => acoes.alternarSelecao(item.id)}
            data-testid={`checkbox-item-${item.id}`}
          />
        </td>
      )}
      {/* ID + os selos da peça (SelosDaPeca). `overflow: hidden` é a
          GARANTIA ESTRUTURAL: numa tabela `tableLayout: fixed` o selo
          `nowrap` que não cabe PINTA POR CIMA da célula vizinha — era assim
          que "Pronto para Produção" aparecia por baixo da quantidade (ver
          ARTE_COLS_FINALIZADOS). alignItems flex-start: num flex column o
          padrão é stretch, e o selo seria esticado na largura da célula. */}
      <td style={{ padding: '9px 12px', overflow: 'hidden' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-start' }}>
          <span style={{ fontFamily: '"DM Mono", monospace', fontSize: 12, color: T.apoio, fontWeight: 600 }} data-testid={`text-display-id-${item.id}`}>
            {item.displayId}
          </span>
          <SelosDaPeca item={item} tabId={tabId} />
        </div>
      </td>
      {/* Qtd — formatQuantity: `String(q || '—').padStart(2,'0')` transformava
          peça sem quantidade em "0—", e uma peça só em "01". */}
      <td style={{ padding: '9px 12px', fontWeight: 700, color: item.quantity ? T.text : T.apoio, fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>
        {formatQuantity(item.quantity)}
      </td>
      {/* Peça — nome em destaque; descrição, medida/material e anexos em texto
          secundário, menor e cinza. Um peso forte por célula. */}
      <td style={{ padding: '9px 12px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-start', minWidth: 0 }}>
          {/* Tipo E descrição: o tipo é o nome da peça; a descrição é o detalhe. */}
          <span style={{ fontWeight: 700, color: T.text, fontSize: 13, wordBreak: 'break-word' }}>{item.type || item.description}</span>
          {item.type && item.description && (
            <span style={{ fontSize: 12, color: T.apoio, wordBreak: 'break-word' }}>{item.description}</span>
          )}
          <MetaDaPeca item={item} />
          {/* A observação é instrução de quem pediu a peça para quem faz a
              arte — fica à vista, na única cor de aviso da célula.
              #b45309 sobre branco = 5,0:1 ✓. */}
          {item.observations && (
            <span style={{ fontSize: 11.5, color: TOM.alerta.text, display: 'flex', alignItems: 'center', gap: 3 }}>
              <AlertCircle aria-hidden="true" style={{ width: 10, height: 10, flexShrink: 0 }} />{item.observations}
            </span>
          )}
          <TagsDaPeca item={item} eventoTemBook={eventoTemBook} />
        </div>
      </td>
      {/* Arte — thumb / arquivo final */}
      <td style={{ padding: '9px 12px' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <ThumbPreview url={item.approvalThumbUrl} label={`thumb de ${item.displayId}`} />
          {item.finalFileUrl ? (
            <a href={hrefSeguro(item.finalFileUrl)} target="_blank" rel="noopener noreferrer" title="Ver arquivo final" style={{ width: 26, height: 26, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: TOM.sucesso.bg, color: TOM.sucesso.text, border: `1px solid ${TOM.sucesso.border}`, flexShrink: 0 }}>
              <FileText style={{ width: 13, height: 13 }} />
            </a>
          ) : (
            <span title="Sem arquivo final" style={{ width: 26, height: 26, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: N.n2, color: T.second, flexShrink: 0 }}>
              <FileText style={{ width: 13, height: 13 }} />
            </span>
          )}
        </div>
      </td>
      {/* Prazo */}
      <td style={{ padding: '9px 12px' }}><PrazoDaPeca item={item} tabId={tabId} hoje={hoje} /></td>
      {/* Patrocinadores. `overflow: hidden`: o chip é `whiteSpace: nowrap`
          (sponsor-chips.tsx) e "Prefeitura Municipal" pede 131,6px — sem o
          recorte ele pintava por cima do botão de ação. O nome inteiro fica no
          `title`. Na fila que espera patrocinador, o chip diz DE QUEM se espera. */}
      <td style={{ padding: '9px 12px', overflow: 'hidden' }}>
        <SponsorChips sponsors={item.sponsors ?? []} variant="orange" size="sm" destacarPendencia={tabId === "aguardando-patrocinador"} />
      </td>
      {/* Ações — UMA ação principal à vista (subir/enviar thumb ou finalizar)
          e o resto no "⋯". flexWrap 'nowrap': o botão encolhe com reticências
          e os dois ficam sempre lado a lado, na altura da linha. */}
      <td style={{ padding: '9px 12px', textAlign: 'right' }}>
        <div style={{ display: 'flex', flexWrap: 'nowrap', justifyContent: 'flex-end', alignItems: 'center', gap: 6 }}>
          <BotaoPrimario item={item} tabId={tabId} podeEditar={podeEditar} dedo={dedo} enviando={enviando} algumEnviando={algumEnviando} acoes={acoes} />
          <MenuDeAcoes item={item} podeEditar={podeEditar} dedo={dedo} acoes={acoes} />
        </div>
      </td>
    </tr>
  );
});
