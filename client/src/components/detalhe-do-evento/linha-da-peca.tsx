// ─────────────────────────────────────────────────────────────────────────────
// A PEÇA NA LISTA — a linha da tabela (ponteiro, área útil larga) e o cartão
// (área útil estreita). Os dois leem as MESMAS permissões e os mesmos gestos,
// que chegam em `PropsDaPeca`.
// ─────────────────────────────────────────────────────────────────────────────
import { Link } from "wouter";
import { Plus, Pencil, Trash2, Lock, Paperclip, X, Recycle, AlertTriangle } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { DetalheProducao } from "@/components/detalhe-producao";
import { faseDaArte } from "@/components/prazos/tokens";
import { SeloKit } from "@/components/kit/selo-kit";
import { SeloPrazoMolde } from "@/components/prazo-do-molde";
import { ObjectUploader } from "@/components/ObjectUploader";
import { Botao } from "@/components/ui/botao";
import { Selo } from "@/components/ui/selo";
import type { useToast } from "@/hooks/use-toast";
import type { useEventReference } from "@/hooks/use-event-reference";
import type { useEventItemFlags } from "@/hooks/use-event-item-flags";
import { FINAL_STATUSES, PRODUCTION_STATUSES } from "@/lib/status";
import { refsDaPeca } from "@/lib/refs-da-peca";
import { miniatura } from "@/lib/miniatura";
import { statusDeExibicao } from "@shared/molde";
import { T, N, TOM, FONT } from "@/lib/theme";
import { SeloDoEstoque } from "./selo-do-estoque";
import type { EventoDoDetalhe, PecaDoEvento, ResumoDoEstoque } from "./tipos";

/** O que a linha e o cartão precisam da tela: permissões e gestos. */
export interface PropsDaPeca {
  event: EventoDoDetalhe;
  canEditLists: boolean;
  canDeleteAny: boolean;
  canUploadReference: boolean;
  isEditBlocked: (status: string) => boolean;
  motivoEdicaoBloqueada: (status: string) => string | null;
  canDeleteItem: (status: string) => boolean;
  setSelectedItemForDetails: (item: PecaDoEvento) => void;
  handleEditItem: (item: PecaDoEvento) => void;
  handleDeleteItem: (item: PecaDoEvento) => void;
  estoqueResumo: ResumoDoEstoque;
  setEstoqueDaPeca: (peca: { id: string; eventId: string }) => void;
  salvarReferenciasMutation: ReturnType<typeof useEventReference>["salvarReferenciasMutation"];
  updateItemIsReuseMutation: ReturnType<typeof useEventItemFlags>["updateItemIsReuseMutation"];
  getUploadUrl: () => Promise<{ method: "PUT"; url: string }>;
  toast: ReturnType<typeof useToast>["toast"];
}

/**
 * Card com onClick e sem foco: no celular o toque resolve, mas com teclado
 * externo (ou leitor de tela) não havia como abrir a peça. O ID vira o alvo
 * focável — é o rótulo natural do card. #f97316 sobre branco dá 2.80:1; o
 * laranja de ação escuro passa e mantém a identidade.
 */
export function CartaoDaPeca({
  item, event, canEditLists, canDeleteAny, isEditBlocked, motivoEdicaoBloqueada, canDeleteItem,
  setSelectedItemForDetails, handleEditItem, handleDeleteItem, estoqueResumo, setEstoqueDaPeca,
}: PropsDaPeca & { item: PecaDoEvento }) {
  return (
    <div onClick={() => setSelectedItemForDetails(item)}
      style={{ backgroundColor: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: '12px 12px', marginBottom: 8, cursor: 'pointer' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <button
          onClick={e => { e.stopPropagation(); setSelectedItemForDetails(item); }}
          aria-label={`Ver detalhes da peça ${item.displayId}`}
          style={{ fontFamily: FONT.mono, fontWeight: 700, color: T.accentText, fontSize: 13, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
        >
          {item.displayId}
        </button>
        <StatusBadge status={statusDeExibicao(item)} />
      </div>
      <SeloPrazoMolde item={item} evento={event} />
      <DetalheProducao item={item} style={{ marginTop: 0, marginBottom: 6, textAlign: 'right' }} />
      <SeloKit peca={item} style={{ marginBottom: 4, marginRight: 4 }} />
      {item.isPriority && (
        <Selo tom="perigo" forma="retangulo" tamanho="sm" icone={AlertTriangle} title="Peça prioritária — fura a fila da Arte" data-testid={`tag-prioritaria-card-${item.id}`} style={{ gap: 4, padding: '2px 7px', marginBottom: 4, marginRight: 4 }}>
          PRIORITÁRIA
        </Selo>
      )}
      {item.parentItemId && (
        <Selo tom="laranja" forma="retangulo" tamanho="sm" icone={Plus} style={{ gap: 4, padding: '2px 7px', marginBottom: 4 }}>
          Compl. de {item.parent?.displayId ?? 'peça original'}
        </Selo>
      )}
      <div style={{ fontWeight: 700, fontSize: 13, color: T.text, marginBottom: 2 }}>{item.type}</div>
      {item.description && <div style={{ fontSize: 13, color: T.second, marginBottom: 4 }}>{item.description}</div>}
      {item.parentItemId && item.complementReason && (
        <div style={{ fontSize: 11, color: T.accentText, marginBottom: 4, lineHeight: 1.4 }}>
          {item.complementRequestedBy ? <strong>{item.complementRequestedBy}: </strong> : null}{item.complementReason}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 11, color: T.second }}>
        {item.quantity && <span>{item.quantity}×</span>}
        {item.visualWidth && item.visualHeight && <span>{item.visualWidth}×{item.visualHeight}m</span>}
        {item.material && <span>{item.material}</span>}
      </div>
      {estoqueResumo[item.id] && (
        <div style={{ marginTop: 6 }}><SeloDoEstoque item={item} est={estoqueResumo[item.id]} onAbrir={setEstoqueDaPeca} /></div>
      )}
      {canEditLists && (
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }} onClick={e => e.stopPropagation()}>
          {/* handleEditItem (não setEditingItem cru): hidrata o
              formData — sem isso, salvar apagava a peça. */}
          {/* `disabled` real, e não só o early-return de
              handleEditItem: no celular um botão que
              aceita o toque e não abre nada lê como app
              travado. O title carrega o motivo. */}
          <Botao
            variante="secundario"
            tamanho="toque"
            onClick={() => handleEditItem(item)}
            disabled={isEditBlocked(item.status)}
            title={motivoEdicaoBloqueada(item.status) ?? undefined}
            style={{ flex: 1 }}
          >
            Editar
          </Botao>
          {/* Aumentar quantidade NÃO mora aqui: o gatilho
              é exclusivo da tela da Gráfica (decisão do dono). */}
          {/* Mesmos gates do desktop: sem eles, no celular um
              não-admin abria exclusão de peça já em produção. */}
          {canDeleteAny && canDeleteItem(item.status) && (
            <button onClick={() => handleDeleteItem(item)}
              aria-label="Excluir peça" title="Excluir peça"
              style={{ minHeight: 44, width: 44, borderRadius: 6, border: `1px solid ${TOM.perigo.border}`, background: T.surface, color: TOM.perigo.text, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Trash2 style={{ width: 14, height: 14 }} />
            </button>
          )}
        </div>
      )}
      {/* O MOTIVO DO "EDITAR" TRAVADO, À VISTA. No celular o
          `title` nunca aparece (não há hover): o botão cinza
          sem explicação lia como app quebrado. */}
      {canEditLists && isEditBlocked(item.status) && (
        <p style={{ margin: '6px 0 0', fontSize: 11.5, color: T.apoio, lineHeight: 1.4, display: 'flex', alignItems: 'flex-start', gap: 5 }}>
          <Lock aria-hidden="true" style={{ width: 11, height: 11, flexShrink: 0, marginTop: 2 }} />
          {motivoEdicaoBloqueada(item.status)}
        </p>
      )}
    </div>
  );
}

export function LinhaDaPeca({
  item, event, compacto, canEditLists, canDeleteAny, canUploadReference, isEditBlocked, motivoEdicaoBloqueada,
  canDeleteItem, setSelectedItemForDetails, handleEditItem, handleDeleteItem, estoqueResumo, setEstoqueDaPeca,
  salvarReferenciasMutation, updateItemIsReuseMutation, getUploadUrl, toast,
}: PropsDaPeca & { item: PecaDoEvento; compacto: boolean }) {
  return (
    <tr
      className="group"
      style={{ borderTop: `1px solid ${N.n2}`, cursor: 'pointer', transition: 'background-color 0.1s' }}
      onMouseEnter={e => (e.currentTarget.style.backgroundColor = T.bg)}
      onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
      onClick={() => setSelectedItemForDetails(item)}
      data-testid={`row-item-${item.id}`}
    >
      {/* ID */}
      {/* A linha abre o detalhe no clique, mas <tr> não
          recebe foco: sem mouse não havia como abrir peça
          nenhuma. O ID é o alvo focável.
          displayId já vem com a cerquilha do backend
          ("#2341"); prefixar de novo mostrava "##2341". */}
      {/* Complemento recua 12px e ganha um conector em L: como
          a ordenação já o cola na mãe, o recuo é o que faz a
          relação ser lida sem legenda. */}
      <td style={{ padding: '14px 14px', paddingLeft: item.parentItemId ? 26 : undefined }}>
        {item.parentItemId && (
          <span aria-hidden style={{ display: 'inline-block', width: 9, height: 7, marginRight: 5, marginBottom: 2, borderLeft: `1px solid ${TOM.laranja.border}`, borderBottom: `1px solid ${TOM.laranja.border}`, borderBottomLeftRadius: 3, verticalAlign: 'middle' }} />
        )}
        <button
          onClick={e => { e.stopPropagation(); setSelectedItemForDetails(item); }}
          aria-label={`Ver detalhes da peça ${item.displayId}`}
          style={{ fontWeight: 700, color: T.accentText, fontSize: '13px', fontFamily: FONT.mono, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
          data-testid={`text-display-id-${item.id}`}
        >
          {item.displayId}
        </button>
        <SeloKit peca={item} style={{ marginLeft: 6 }} />
        {item.isPriority && (
          <Selo tom="perigo" forma="retangulo" tamanho="sm" icone={AlertTriangle} title="Peça prioritária — fura a fila da Arte" data-testid={`tag-prioritaria-${item.id}`} style={{ gap: 3, marginLeft: 6, padding: '1px 6px', verticalAlign: 'middle' }}>
            PRIORITÁRIA
          </Selo>
        )}
      </td>
      {/* Ref. — VÁRIAS por peça: o clipe ADICIONA em
          vez de trocar, e cada miniatura tem o seu ×. */}
      <td style={{ padding: '14px 14px' }} onClick={e => e.stopPropagation()}>
        {(() => {
          const refs = refsDaPeca(item);
          const podeEditarRef = canUploadReference && !(FINAL_STATUSES as readonly string[]).includes(item.status);
          return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
          {refs.map((url, k) => (
            <span key={`${url}-${k}`} style={{ position: 'relative', display: 'inline-flex' }}>
              <a href={url} target="_blank" rel="noopener noreferrer" title={refs.length > 1 ? `Ver referência ${k + 1} de ${refs.length}` : "Ver referência"} data-testid={k === 0 ? `link-reference-table-${item.id}` : `link-reference-table-${item.id}-${k + 1}`}>
                <img loading="lazy" decoding="async" src={miniatura(url)} style={{ height: 32, width: 32, objectFit: 'cover', borderRadius: 6, border: `1px solid ${T.border}` }} alt={`Referência visual ${k + 1}`} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
              </a>
              {podeEditarRef && (
                <button
                  type="button"
                  title="Remover esta referência"
                  aria-label={`Remover referência ${k + 1} de ${item.displayId}`}
                  data-testid={k === 0 ? `button-remove-reference-table-${item.id}` : `button-remove-reference-table-${item.id}-${k + 1}`}
                  onClick={() => salvarReferenciasMutation.mutate({ itemId: item.id, referenceUrls: refs.filter((_, j) => j !== k) })}
                  style={{ position: 'absolute', top: -6, right: -6, width: 16, height: 16, borderRadius: '50%', border: `1px solid ${T.bdark}`, background: T.surface, color: T.apoio, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
                >
                  <X style={{ width: 9, height: 9 }} />
                </button>
              )}
            </span>
          ))}
          {podeEditarRef && (
            <ObjectUploader
              onGetUploadParameters={getUploadUrl}
              onComplete={({ url }) => salvarReferenciasMutation.mutate({ itemId: item.id, referenceUrls: [...refs, url] })}
              buttonVariant="ghost"
              buttonClassName="h-7 w-7 p-0"
            >
              {/* O `title` estava no ícone lucide, que não
                  aceita a prop e a descartava: a dica nunca
                  apareceu. Num <span> ela funciona, e o
                  aria-label nomeia o controle para quem usa
                  leitor de tela. */}
              <span
                title={refs.length > 0 ? "Adicionar mais uma referência" : "Adicionar referência"}
                aria-label={refs.length > 0 ? "Adicionar mais uma referência" : "Adicionar referência"}
                style={{ display: 'inline-flex' }}
              >
                <Paperclip style={{ width: 13, height: 13, color: refs.length > 0 ? T.accentText : T.second }} />
              </span>
            </ObjectUploader>
          )}
          {!podeEditarRef && refs.length === 0 && (
            <span style={{ color: T.second, fontSize: 13 }}>—</span>
          )}
        </div>
          );
        })()}
      </td>
      {/* Descrição — Material/Acabamento entram aqui como
          2ª linha, em vez de duas colunas próprias. O gate
          do badge usa PRODUCTION_STATUSES canônico (os
          nomes antigos não existem e nunca escondiam nada). */}
      <td style={{ padding: '14px 14px' }}>
        {/* Parentesco do complemento. Aqui é badge OUTLINE e
            sem tingir a linha: nesta tela ninguém precisa de
            alarme (o alarme é da fila da Gráfica), só de
            entender por que #0062-C1 existe. O motivo vai no
            title — a linha da tabela não tem espaço para ele
            e a ficha mostra por extenso. */}
        {item.parentItemId && (
          <Selo
            tom="laranja" forma="retangulo" tamanho="sm" icone={Plus}
            title={item.complementReason ? `Motivo: ${item.complementReason}` : undefined}
            data-testid={`badge-complemento-${item.id}`}
            style={{ gap: 4, padding: "2px 7px", marginBottom: 4 }}
          >
            Compl. de {item.parent?.displayId ?? "peça original"}
          </Selo>
        )}
        {!item.parentItemId && (item.complements?.length ?? 0) > 0 && (
          <Selo
            forma="retangulo" tamanho="sm"
            cores={{ bg: T.surface, text: T.accentText, border: TOM.laranja.border }}
            title={`Complementos: ${(item.complements ?? []).map((c) => `${c.displayId} (+${c.quantity})`).join(", ")}`}
            data-testid={`badge-tem-complemento-${item.id}`}
            style={{ padding: "2px 7px", marginBottom: 4 }}
          >
            Tem complemento (+{(item.complements ?? []).reduce((a, c) => a + (Number(c.quantity) || 0), 0)})
          </Selo>
        )}
        {item.isReuse && !(PRODUCTION_STATUSES as readonly string[]).includes(item.status) && (
          <Selo
            forma="retangulo" tamanho="sm" icone={Recycle}
            // Cheio (branco sobre esmeralda escuro): reaproveitamento pula a produção.
            cores={{ bg: TOM.esmeralda.text, text: T.surface, border: TOM.esmeralda.text }}
            style={{ gap: 4, padding: "2px 7px", marginBottom: 4 }}
          >
            Reaproveit.
          </Selo>
        )}
        <SeloDoEstoque item={item} est={estoqueResumo[item.id]} onAbrir={setEstoqueDaPeca} />
        {item.description ? (
          <div style={{ fontWeight: '500', color: T.text, fontSize: '13px' }}>{item.description}</div>
        ) : (
          <div style={{ color: T.second, fontSize: '13px' }}>—</div>
        )}
        {(item.material || item.finish) && (
          <div style={{ fontSize: '11px', color: T.second, marginTop: 2 }}>
            {[item.material, item.finish].filter(Boolean).join(' · ')}
          </div>
        )}
        {/* No compacto o patrocinador vem para cá: é texto
            livre e longo, e era a coluna que mais empurrava
            a tabela para fora da tela. */}
        {compacto && item.sponsors && item.sponsors.length > 0 && (
          <div style={{ fontSize: '11px', color: T.apoio, marginTop: 2, overflowWrap: 'anywhere' }}>
            {item.sponsors.map((s) => s.name).join(", ")}
          </div>
        )}
      </td>
      {/* Qtd — sem padStart: "05" parecia código, não quantidade. */}
      <td style={{ padding: '14px 14px', fontSize: '13px', color: T.text, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        {item.quantity}
      </td>
      {/* Dimensões */}
      {/* Coluna SECUNDÁRIA: cinza de apoio e 12px, sem o
          itálico (que em número só atrapalha a leitura);
          dígitos tabulares para as medidas alinharem. */}
      <td style={{ padding: '14px 14px', fontSize: '12px', color: T.second, fontVariantNumeric: 'tabular-nums' }}>
        {(item.visualWidth && item.visualHeight) ? (
          <>
            {item.visualWidth} × {item.visualHeight}m
            {(item.fileWidth && item.fileHeight) ? ` / ${item.fileWidth} × ${item.fileHeight}m` : ''}
          </>
        ) : '—'}
        {/* No compacto o m² acompanha a medida, que é de
            onde ele sai — não some, muda de lugar. */}
        {compacto && (
          <span style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: T.text }}>
            {parseFloat(item.calculatedM2 || '0').toFixed(2)} m²
          </span>
        )}
      </td>
      {/* M² */}
      {!compacto && (
        <td style={{ padding: '14px 14px', fontSize: '13px', fontWeight: 700, color: T.text, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
          {parseFloat(item.calculatedM2 || '0').toFixed(2)}
        </td>
      )}
      {/* Patrocinador */}
      {/* Antes era "—" hardcoded: o vínculo existia no dado
          (enrich do /api/items/:eventId) e nunca aparecia. */}
      {!compacto && (
        <td style={{ padding: '14px 14px', fontSize: '12px', color: T.apoio, overflowWrap: 'anywhere' }}>
          {(item.sponsors && item.sponsors.length > 0)
            ? item.sponsors.map((s) => s.name).join(", ")
            : <span style={{ color: T.second }}>—</span>}
        </td>
      )}
      {/* Status — rótulo curto: com tableLayout fixed o
          rótulo completo ("Aguardando Vinculação") vazava
          por baixo dos ícones de Ações.

          E o selo virou ATALHO para a Arte (regra do dono):
          quem lê "Aguardando Envio" aqui está a um clique de
          onde a peça se resolve, em vez de abrir a Arte e
          refazer o filtro à mão.

          `faseDaArte` deriva de TAB_STATUSES (lib/arte-rules),
          que é A definição do que cada aba da Arte atende —
          não um segundo mapa escrito aqui. Quando ela devolve
          `null` a Arte não trata aquele status (peça entregue,
          cancelada, em produção) e o selo continua sendo só um
          selo: link que abre a tela errada é pior que nenhum.

          Os três parâmetros são os que a Arte já lê: a ABA, o
          EVENTO e a BUSCA pelo código da peça — o recorte mais
          estreito que ela sabe aplicar. */}
      <td style={{ padding: '14px 14px' }}>
        {(() => {
          const fase = faseDaArte(item.status);
          // Fora da Arte = produção em diante: o selo ganha a linha discreta
          // "Impressora 2 · 3 de 10 impressas" / "Tubo 2" (lib/detalhe-producao).
          if (!fase) return <><StatusBadge status={statusDeExibicao(item)} short /><DetalheProducao item={item} /><SeloPrazoMolde item={item} evento={event} /></>;
          const alvo = `/arte?fase=${fase}&evento=${item.eventId}&busca=${String(item.displayId ?? "").replace("#", "")}`;
          return (
            <>
            <Link
              href={alvo}
              title={`Abrir esta peça na Arte, já na aba e no evento dela`}
              data-testid={`link-arte-${item.id}`}
              style={{ textDecoration: "none", display: "inline-block", borderRadius: 999 }}
            >
              <StatusBadge status={item.status} short />
            </Link>
            <SeloPrazoMolde item={item} evento={event} />
            </>
          );
        })()}
      </td>
      {/* Ações — sempre visíveis (hover esconderia; no toque
          não há hover), mas SÓ para quem edita a lista: o
          mesmo gate canEditLists do mobile. Antes o desktop
          não tinha gate nenhum. */}
      <td style={{ padding: '14px 14px' }}>
        {canEditLists && (
        <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end', alignItems: 'center' }}>
          {/* Aumentar quantidade — só depois que a peça entrou
              em produção, e nunca num complemento (o segundo
              aumento se pede na mãe). Antes deste botão, o
              único gesto disponível era editar o número, que o
              servidor agora recusa com 409. */}
          {/* Toggle reaproveitamento — disponível enquanto não estiver em produção/entregue */}
          {!isEditBlocked(item.status) && (
            <button
              title={item.isReuse ? "Reaproveitamento ativo — clique para desativar" : "Marcar como reaproveitamento"}
              aria-label={item.isReuse ? "Desativar reaproveitamento" : "Marcar como reaproveitamento"}
              aria-pressed={item.isReuse}
              disabled={updateItemIsReuseMutation.isPending}
              onClick={e => {
                e.stopPropagation();
                updateItemIsReuseMutation.mutate(
                  { itemId: item.id, isReuse: !item.isReuse, reuseQty: item.quantity },
                  {
                    onSuccess: () => toast({
                      title: "Peça atualizada",
                      description: item.isReuse ? "Marca de reaproveitamento removida" : "Peça marcada como reaproveitamento",
                      variant: "success",
                    }),
                  },
                );
              }}
              data-testid={`button-reuse-item-${item.id}`}
              style={{ background: item.isReuse ? TOM.esmeralda.bg : 'none', border: item.isReuse ? `1px solid ${TOM.esmeralda.border}` : 'none', borderRadius: '6px', padding: '6px', cursor: updateItemIsReuseMutation.isPending ? 'wait' : 'pointer', opacity: updateItemIsReuseMutation.isPending ? 0.5 : 1, color: item.isReuse ? TOM.esmeralda.text : T.second, transition: 'all 0.15s', display: 'flex', alignItems: 'center' }}
              onMouseEnter={e => { if (!item.isReuse) { e.currentTarget.style.color = TOM.esmeralda.text; e.currentTarget.style.backgroundColor = TOM.esmeralda.bg; } }}
              onMouseLeave={e => { if (!item.isReuse) { e.currentTarget.style.color = T.second; e.currentTarget.style.backgroundColor = 'transparent'; } }}
            >
              <Recycle className="h-4 w-4" />
            </button>
          )}
          {isEditBlocked(item.status) ? (
            <button
              type="button"
              disabled
              aria-disabled="true"
              title={motivoEdicaoBloqueada(item.status) ?? undefined}
              aria-label={`Edição bloqueada: ${motivoEdicaoBloqueada(item.status) ?? ""}`}
              style={{ color: T.second, padding: '6px', cursor: 'not-allowed', background: 'none', border: 'none' }}
              data-testid={`button-edit-item-${item.id}`}
            >
              <Lock className="h-4 w-4" />
            </button>
          ) : (
            <button
              style={{ color: T.second, background: 'none', border: 'none', cursor: 'pointer', padding: '6px', borderRadius: '6px', transition: 'color 0.15s, background-color 0.15s' }}
              onMouseEnter={e => { e.currentTarget.style.color = T.text; e.currentTarget.style.backgroundColor = N.n3; }}
              onMouseLeave={e => { e.currentTarget.style.color = T.second; e.currentTarget.style.backgroundColor = 'transparent'; }}
              onClick={e => { e.stopPropagation(); handleEditItem(item); }}
              data-testid={`button-edit-item-${item.id}`}
              title="Editar peça" aria-label="Editar peça"
            >
              <Pencil className="h-4 w-4" />
            </button>
          )}
          {canDeleteAny && (
            canDeleteItem(item.status) ? (
              <button
                style={{ color: T.second, background: 'none', border: 'none', cursor: 'pointer', padding: '6px', borderRadius: '6px', transition: 'color 0.15s, background-color 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.color = TOM.perigo.dot; e.currentTarget.style.backgroundColor = TOM.perigo.bg; }}
                onMouseLeave={e => { e.currentTarget.style.color = T.second; e.currentTarget.style.backgroundColor = 'transparent'; }}
                onClick={e => { e.stopPropagation(); handleDeleteItem(item); }}
                data-testid={`button-delete-item-${item.id}`}
                title="Excluir peça" aria-label="Excluir peça"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                disabled
                aria-disabled="true"
                style={{ color: T.second, padding: '6px', cursor: 'not-allowed', background: 'none', border: 'none' }}
                title="Exclusão bloqueada — peça já está em Arte ou produção"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )
          )}
        </div>
        )}
      </td>
    </tr>
  );
}
