// ─────────────────────────────────────────────────────────────────────────────
// A PEÇA NA LISTA — a linha da tabela (ponteiro, área útil larga) e o cartão
// (área útil estreita). Os dois leem as MESMAS permissões e os mesmos gestos,
// que chegam em `PropsDaPeca`.
// ─────────────────────────────────────────────────────────────────────────────
import { Link } from "wouter";
import { Plus, Pencil, Trash2, Lock, Recycle, AlertTriangle, Factory } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { DetalheProducao } from "@/components/detalhe-producao";
import { faseDaArte } from "@/components/prazos/tokens";
import { SeloKit } from "@/components/kit/selo-kit";
import { SeloProducaoInterna } from "@/components/selo-producao-interna";
import { podeEnviarDiretoParaGrafica } from "@shared/producao-interna";
import { SeloPrazoMolde } from "@/components/prazo-do-molde";
import { PrioridadeNaImpressaoIcone } from "@/components/prioridade-na-impressao";
import { Botao } from "@/components/ui/botao";
import { Selo } from "@/components/ui/selo";
import type { useToast } from "@/hooks/use-toast";
import type { useEventReference } from "@/hooks/use-event-reference";
import type { useEventItemFlags } from "@/hooks/use-event-item-flags";
import { FINAL_STATUSES, PRODUCTION_STATUSES } from "@/lib/status";
import { refsDaPeca } from "@/lib/refs-da-peca";
import { miniatura } from "@/lib/miniatura";
import { statusDeExibicao } from "@shared/molde";
import { T, TOM, FONT, FS, FW, R } from "@/lib/theme";
import { SeloDoEstoque } from "./selo-do-estoque";
import { MiniaturasDaPeca } from "./miniaturas-da-peca";
import { formatarM2, formatarMedida } from "./regras";
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
  /** Produção interna (02/10): o papel de quem vê e o gesto que abre o envio direto. */
  papel?: string | null;
  eventoFinalizado?: boolean;
  abrirEnvioDireto?: (pecas: PecaDoEvento[]) => void;
}

/** "Enviar direto para a Gráfica" vale para esta peça agora? (shared/producao-interna) */
const podeDireto = (p: Pick<PropsDaPeca, "papel" | "eventoFinalizado" | "abrirEnvioDireto">, item: PecaDoEvento) =>
  !p.eventoFinalizado && !!p.abrirEnvioDireto && podeEnviarDiretoParaGrafica(item, p.papel);

/**
 * AS MEDIDAS NA LÍNGUA DA CASA: ARQ. primeiro e escuro (é dele que sai o m² e
 * é o que a impressora recebe), VIS. depois e apagado — e só quando difere do
 * ARQ. Antes a coluna mostrava "10.00 × 4.00m / 10.00 × 4.00m" (o mesmo par
 * duas vezes, quebrando em duas linhas) e uma peça só com medida de arquivo
 * virava "—".
 */
function medidas(item: PecaDoEvento): { arq: string | null; vis: string | null } {
  const par = (l: unknown, a: unknown) => (l && a ? `${formatarMedida(String(l))} × ${formatarMedida(String(a))} m` : null);
  const arq = par(item.fileWidth, item.fileHeight);
  const vis = par(item.visualWidth, item.visualHeight);
  return { arq, vis: vis && vis !== arq ? vis : null };
}

function Medidas({ item, comM2 }: { item: PecaDoEvento; comM2?: boolean }) {
  const { arq, vis } = medidas(item);
  return (
    <div style={{ fontVariantNumeric: 'tabular-nums', lineHeight: 1.45 }}>
      {arq ? (
        <div title="ARQ. — o que a impressora recebe (é dele que sai o m²)" style={{ fontSize: FS.body, color: T.text, fontWeight: FW.corpo, whiteSpace: 'nowrap' }}>
          {arq}
        </div>
      ) : null}
      {vis ? (
        <div title="VIS. — o que se vê na peça montada" style={{ fontSize: FS.small, color: T.second, whiteSpace: 'nowrap' }}>
          <span style={{ fontSize: FS.micro, fontWeight: FW.forte, letterSpacing: '0.04em', marginRight: 4 }}>VIS.</span>{vis}
        </div>
      ) : null}
      {!arq && !vis && <span style={{ color: T.muted, fontSize: FS.body }}>—</span>}
      {/* No compacto o m² acompanha a medida, que é de onde ele sai — não
          some, muda de lugar. */}
      {comM2 && (
        <div style={{ fontSize: FS.meta, fontWeight: FW.forte, color: T.text, marginTop: 2 }}>
          {formatarM2(parseFloat(item.calculatedM2 || '0'))} m²
        </div>
      )}
    </div>
  );
}

/**
 * Os selos de contexto da peça (complemento, reaproveitamento) e, no fim, o
 * do estoque — que chega pronto de quem chama (`estoque`), escrito nas DUAS
 * montagens (cartão e linha).
 */
function SelosDaPeca({ item, estoque }: { item: PecaDoEvento; estoque: React.ReactNode }) {
  const temSelo = !!item.parentItemId || (item.complements?.length ?? 0) > 0
    || (item.isReuse && !(PRODUCTION_STATUSES as readonly string[]).includes(item.status)) || !!estoque;
  if (!temSelo) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
      {/* Parentesco do complemento. Badge OUTLINE e sem tingir a linha: aqui
          ninguém precisa de alarme (o alarme é da fila da Gráfica), só de
          entender por que #0062-C1 existe. O motivo vai no title. */}
      {item.parentItemId && (
        <Selo
          tom="laranja" forma="retangulo" tamanho="sm" icone={Plus}
          title={item.complementReason ? `Motivo: ${item.complementReason}` : undefined}
          data-testid={`badge-complemento-${item.id}`}
          style={{ gap: 4, padding: "2px 7px" }}
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
          style={{ padding: "2px 7px" }}
        >
          Tem complemento (+{(item.complements ?? []).reduce((a, c) => a + (Number(c.quantity) || 0), 0)})
        </Selo>
      )}
      {item.isReuse && !(PRODUCTION_STATUSES as readonly string[]).includes(item.status) && (
        <Selo
          forma="retangulo" tamanho="sm" icone={Recycle}
          // Cheio (branco sobre esmeralda escuro): reaproveitamento pula a produção.
          cores={{ bg: TOM.esmeralda.text, text: T.surface, border: TOM.esmeralda.text }}
          style={{ gap: 4, padding: "2px 7px" }}
        >
          Reaproveit.
        </Selo>
      )}
      {estoque}
    </div>
  );
}

/**
 * Card com onClick e sem foco: no celular o toque resolve, mas com teclado
 * externo (ou leitor de tela) não havia como abrir a peça. O ID vira o alvo
 * focável — é o rótulo natural do card. #f97316 sobre branco dá 2.80:1; o
 * laranja de ação escuro passa e mantém a identidade.
 *
 * O CARTÃO GANHOU A IMAGEM. No celular a peça era só texto — e é pela arte
 * que se reconhece uma peça de longe. A primeira referência abre o cartão à
 * esquerda; o toque nela abre a imagem, o resto do cartão abre a ficha.
 */
export function CartaoDaPeca({
  item, event, canEditLists, canDeleteAny, isEditBlocked, motivoEdicaoBloqueada, canDeleteItem,
  setSelectedItemForDetails, handleEditItem, handleDeleteItem, estoqueResumo, setEstoqueDaPeca,
  papel, eventoFinalizado, abrirEnvioDireto,
}: PropsDaPeca & { item: PecaDoEvento }) {
  const refs = refsDaPeca(item);
  const { arq, vis } = medidas(item);
  return (
    <div
      onClick={() => setSelectedItemForDetails(item)}
      className="evd-cartao"
      data-testid={`card-item-${item.id}`}
      style={{ backgroundColor: T.surface, border: `1px solid ${T.border}`, borderRadius: R.lg, padding: 14, cursor: 'pointer' }}
    >
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        {/* A imagem — só a primeira, grande, com quantas mais existem. No
            cartão ela é para RECONHECER a peça; anexar e remover moram na
            ficha (o toque aqui abre a referência em tela cheia). */}
        {refs.length > 0 && (
          <a
            href={refs[0]}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            data-testid={`link-reference-card-${item.id}`}
            title={refs.length > 1 ? `Ver referência 1 de ${refs.length}` : 'Ver referência'}
            style={{ position: 'relative', flexShrink: 0, display: 'inline-flex', borderRadius: R.md }}
          >
            <img
              loading="lazy"
              decoding="async"
              src={miniatura(refs[0])}
              alt={`Referência visual de ${item.displayId ?? 'a peça'}`}
              style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: R.md, border: `1px solid ${T.border}`, backgroundColor: T.low, display: 'block' }}
              onError={e => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }}
            />
            {refs.length > 1 && (
              <span aria-label={`mais ${refs.length - 1}`} style={{ position: 'absolute', right: -6, bottom: -6, minWidth: 22, height: 22, padding: '0 6px', borderRadius: R.pill, backgroundColor: T.text, color: T.surface, border: `2px solid ${T.surface}`, fontSize: FS.small, fontWeight: FW.forte, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontVariantNumeric: 'tabular-nums' }}>
                +{refs.length - 1}
              </span>
            )}
          </a>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', minWidth: 0 }}>
              <button
                onClick={e => { e.stopPropagation(); setSelectedItemForDetails(item); }}
                aria-label={`Ver detalhes da peça ${item.displayId}`}
                data-testid={`text-display-id-card-${item.id}`}
                style={{ fontFamily: FONT.mono, fontWeight: FW.forte, color: T.accentText, fontSize: FS.body, background: 'none', border: 'none', padding: 0, cursor: 'pointer', minHeight: 24 }}
              >
                {item.displayId}
              </button>
              <SeloKit peca={item} style={{ marginRight: 2 }} />
              {item.isPriority && (
                <Selo tom="perigo" forma="retangulo" tamanho="sm" icone={AlertTriangle} title="Peça prioritária — fura a fila da Arte" data-testid={`tag-prioritaria-card-${item.id}`} style={{ gap: 4, padding: '2px 7px' }}>
                  PRIORITÁRIA
                </Selo>
              )}
              <SeloProducaoInterna peca={item} />
            </div>
            <StatusBadge status={statusDeExibicao(item)} />
          </div>
          <div style={{ fontWeight: FW.forte, fontSize: FS.read, color: T.text, marginTop: 4, lineHeight: 1.35, overflowWrap: 'anywhere' }}>
            {item.description || item.type}
          </div>
          <div style={{ display: 'flex', gap: '2px 10px', flexWrap: 'wrap', fontSize: FS.meta, color: T.second, marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>
            {item.description && <span>{item.type}</span>}
            {item.quantity && <span>{item.quantity} un.</span>}
            {arq && <span>ARQ. {arq}</span>}
            {vis && <span>VIS. {vis}</span>}
            {item.material && <span>{[item.material, item.finish].filter(Boolean).join(' · ')}</span>}
          </div>
          {item.parentItemId && item.complementReason && (
            <div style={{ fontSize: FS.small, color: T.accentText, marginTop: 4, lineHeight: 1.4 }}>
              {item.complementRequestedBy ? <strong>{item.complementRequestedBy}: </strong> : null}{item.complementReason}
            </div>
          )}
          <SeloPrazoMolde item={item} evento={event} />
          <DetalheProducao item={item} style={{ marginTop: 4, marginBottom: 0 }} />
          <SelosDaPeca item={item} estoque={estoqueResumo[item.id] ? <SeloDoEstoque item={item} est={estoqueResumo[item.id]} onAbrir={setEstoqueDaPeca} /> : null} />
        </div>
      </div>
      {canEditLists && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.border}` }} onClick={e => e.stopPropagation()}>
          {/* handleEditItem (não setEditingItem cru): hidrata o formData —
              sem isso, salvar apagava a peça. `disabled` real: no celular um
              botão que aceita o toque e não abre nada lê como app travado. */}
          <Botao
            variante="secundario"
            tamanho="toque"
            icone={isEditBlocked(item.status) ? Lock : Pencil}
            onClick={() => handleEditItem(item)}
            disabled={isEditBlocked(item.status)}
            title={motivoEdicaoBloqueada(item.status) ?? undefined}
            data-testid={`button-edit-item-card-${item.id}`}
            style={{ flex: 1 }}
          >
            Editar
          </Botao>
          {/* Aumentar quantidade NÃO mora aqui: o gatilho é exclusivo da
              tela da Gráfica (decisão do dono). Mesmos gates do desktop. */}
          {/* Direto para a Gráfica (02/10): ícone de 44px, com o nome por extenso. */}
          {podeDireto({ papel, eventoFinalizado, abrirEnvioDireto }, item) && (
            <button type="button" onClick={() => abrirEnvioDireto!([item])}
              aria-label={`Enviar a peça ${item.displayId ?? ''} direto para a Gráfica`} title="Enviar direto para a Gráfica (produção interna)"
              data-testid={`button-direto-grafica-card-${item.id}`}
              className="evd-acao evd-acao-grafica"
              style={{ minHeight: 44, width: 44, border: `1px solid ${T.border}`, background: T.surface }}>
              <Factory aria-hidden="true" style={{ width: 16, height: 16 }} />
            </button>
          )}
          {/* Prioridade na impressão (08/10): da Revisão Final até a impressão terminar. */}
          <PrioridadeNaImpressaoIcone item={item} eventoFinalizado={eventoFinalizado} noCartao />
          {canDeleteAny && canDeleteItem(item.status) && (
            <button onClick={() => handleDeleteItem(item)}
              aria-label={`Excluir a peça ${item.displayId ?? ''}`} title="Excluir peça"
              data-testid={`button-delete-item-card-${item.id}`}
              className="evd-acao evd-acao-perigo"
              style={{ minHeight: 44, width: 44, border: `1px solid ${T.border}`, background: T.surface }}>
              <Trash2 aria-hidden="true" style={{ width: 16, height: 16 }} />
            </button>
          )}
        </div>
      )}
      {/* O MOTIVO DO "EDITAR" TRAVADO, À VISTA. No celular o `title` nunca
          aparece (não há hover): o botão cinza sem explicação lia como app
          quebrado. */}
      {canEditLists && isEditBlocked(item.status) && (
        <p style={{ margin: '8px 0 0', fontSize: FS.meta, color: T.apoio, lineHeight: 1.45, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
          <Lock aria-hidden="true" style={{ width: 12, height: 12, flexShrink: 0, marginTop: 2 }} />
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
  papel, eventoFinalizado, abrirEnvioDireto,
}: PropsDaPeca & { item: PecaDoEvento; compacto: boolean }) {
  const celula: React.CSSProperties = { padding: '12px 10px', verticalAlign: 'middle' };
  return (
    <tr
      className="evd-linha"
      style={{ borderTop: `1px solid ${T.border}`, cursor: 'pointer' }}
      onClick={() => setSelectedItemForDetails(item)}
      data-testid={`row-item-${item.id}`}
    >
      {/* ID — a linha abre o detalhe no clique, mas <tr> não recebe foco:
          sem mouse não havia como abrir peça nenhuma. O ID é o alvo focável.
          displayId já vem com a cerquilha do backend.
          Complemento recua e ganha um conector em L: como a ordenação já o
          cola na mãe, o recuo é o que faz a relação ser lida sem legenda.
          (paddingLeft SEMPRE com número: `undefined` ao lado do `padding`
          zerava o recuo de todas as outras linhas — o ID colava na borda.) */}
      <td style={{ ...celula, paddingLeft: item.parentItemId ? 26 : 16, paddingRight: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px 0' }}>
          {item.parentItemId && (
            <span aria-hidden style={{ display: 'inline-block', width: 9, height: 7, marginRight: 5, marginBottom: 2, borderLeft: `1px solid ${TOM.laranja.border}`, borderBottom: `1px solid ${TOM.laranja.border}`, borderBottomLeftRadius: 3, verticalAlign: 'middle' }} />
          )}
          <button
            onClick={e => { e.stopPropagation(); setSelectedItemForDetails(item); }}
            aria-label={`Ver detalhes da peça ${item.displayId}`}
            className="evd-id"
            style={{ fontWeight: FW.forte, color: T.accentText, fontSize: FS.body, fontFamily: FONT.mono, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
            data-testid={`text-display-id-${item.id}`}
          >
            {item.displayId}
          </button>
          {/* Prioritária: o triângulo junto do ID (o selo por extenso vai
              na descrição — na coluna de 8% ele vazava sobre a miniatura). */}
          {item.isPriority && <AlertTriangle aria-hidden="true" style={{ width: 12, height: 12, color: TOM.perigo.text, marginLeft: 4 }} />}
          <SeloKit peca={item} style={{ marginLeft: 6 }} />
        </div>
      </td>
      {/* Ref. — VÁRIAS por peça: o anexar ADICIONA em vez de trocar, e cada
          miniatura tem o seu ×. */}
      <td style={celula} onClick={e => e.stopPropagation()}>
        {(() => {
          const refs = refsDaPeca(item);
          const podeEditarRef = canUploadReference && !(FINAL_STATUSES as readonly string[]).includes(item.status);
          return (
            <MiniaturasDaPeca
              refs={refs}
              podeEditar={podeEditarRef}
              rotuloDaPeca={item.displayId ?? 'a peça'}
              tamanho={32}
              idDoLink={(k) => (k === 0 ? `link-reference-table-${item.id}` : `link-reference-table-${item.id}-${k + 1}`)}
              idDoRemover={(k) => (k === 0 ? `button-remove-reference-table-${item.id}` : `button-remove-reference-table-${item.id}-${k + 1}`)}
              onRemover={(k) => salvarReferenciasMutation.mutate({ itemId: item.id, referenceUrls: refs.filter((_, j) => j !== k) })}
              onAdicionar={(url) => salvarReferenciasMutation.mutate({ itemId: item.id, referenceUrls: [...refs, url] })}
              getUploadUrl={getUploadUrl}
            />
          );
        })()}
      </td>
      {/* Descrição — Material/Acabamento entram aqui como 2ª linha, em vez
          de duas colunas próprias. Os selos de contexto vêm DEPOIS do texto:
          a descrição é a primeira leitura da linha. */}
      <td style={celula}>
        {item.description ? (
          <div style={{ fontWeight: FW.medio, color: T.text, fontSize: FS.body, lineHeight: 1.4, overflowWrap: 'anywhere' }}>{item.description}</div>
        ) : (
          <div style={{ color: T.second, fontSize: FS.body }}>{item.type || '—'}</div>
        )}
        {(item.material || item.finish) && (
          <div style={{ fontSize: FS.small, color: T.second, marginTop: 2 }}>
            {[item.material, item.finish].filter(Boolean).join(' · ')}
          </div>
        )}
        {/* No compacto o patrocinador vem para cá: é texto livre e longo, e
            era a coluna que mais empurrava a tabela para fora da tela. */}
        {compacto && item.sponsors && item.sponsors.length > 0 && (
          <div style={{ fontSize: FS.small, color: T.apoio, marginTop: 2, overflowWrap: 'anywhere' }}>
            {item.sponsors.map((s) => s.name).join(", ")}
          </div>
        )}
        {item.isPriority && (
          <Selo tom="perigo" forma="retangulo" tamanho="sm" icone={AlertTriangle} title="Peça prioritária — fura a fila da Arte" data-testid={`tag-prioritaria-${item.id}`} style={{ gap: 3, marginTop: 6, padding: '2px 7px' }}>
            PRIORITÁRIA
          </Selo>
        )}
        <SeloProducaoInterna peca={item} style={{ marginTop: 6 }} />
        <SelosDaPeca item={item} estoque={estoqueResumo[item.id] ? <SeloDoEstoque item={item} est={estoqueResumo[item.id]} onAbrir={setEstoqueDaPeca} /> : null} />
      </td>
      {/* Qtd — sem padStart: "05" parecia código, não quantidade. */}
      <td style={{ ...celula, fontSize: FS.body, fontWeight: FW.medio, color: T.text, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        {item.quantity}
      </td>
      {/* Medidas — ARQ primeiro e escuro, VIS depois e apagado. */}
      <td style={celula}>
        <Medidas item={item} comM2={compacto} />
      </td>
      {/* M² */}
      {!compacto && (
        <td style={{ ...celula, fontSize: FS.body, fontWeight: FW.forte, color: T.text, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
          {formatarM2(parseFloat(item.calculatedM2 || '0'))}
        </td>
      )}
      {/* Patrocinador — o vínculo vem do enrich do /api/items/:eventId. */}
      {!compacto && (
        <td style={{ ...celula, fontSize: FS.meta, color: T.apoio, lineHeight: 1.4 }}>
          {(item.sponsors && item.sponsors.length > 0)
            ? <span className="evd-duas-linhas" title={item.sponsors.map((s) => s.name).join(", ")}>{item.sponsors.map((s) => s.name).join(", ")}</span>
            : <span aria-label="Sem patrocinador" style={{ color: T.muted }}>—</span>}
        </td>
      )}
      {/* Status — rótulo curto (com tableLayout fixed o completo vazava sob
          as Ações). E o selo é ATALHO para a Arte (regra do dono): quem lê
          "Aguardando Envio" aqui está a um clique de onde a peça se resolve.
          `faseDaArte` deriva de TAB_STATUSES (lib/arte-rules); quando ela
          devolve `null` a Arte não trata aquele status e o selo continua
          sendo só um selo: link que abre a tela errada é pior que nenhum. */}
      <td style={celula}>
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
              className="evd-link-arte"
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
              style={{ textDecoration: "none", display: "inline-block", borderRadius: 999 }}
            >
              <StatusBadge status={item.status} short />
            </Link>
            <SeloPrazoMolde item={item} evento={event} />
            </>
          );
        })()}
      </td>
      {/* Ações — sempre visíveis (hover esconderia; no toque não há hover),
          mas SÓ para quem edita a lista: o mesmo gate canEditLists do mobile.
          Hover e foco no CSS (.evd-acao), não em onMouseEnter. */}
      <td style={{ ...celula, paddingLeft: 4, paddingRight: 10 }}>
        {canEditLists && (
        <div style={{ display: 'flex', gap: 0, justifyContent: 'flex-end', alignItems: 'center' }}>
          {/* Direto para a Gráfica (02/10) — só quando vale para a peça. */}
          {podeDireto({ papel, eventoFinalizado, abrirEnvioDireto }, item) && (
            <button
              type="button"
              className="evd-acao evd-acao-grafica"
              onClick={e => { e.stopPropagation(); abrirEnvioDireto!([item]); }}
              data-testid={`button-direto-grafica-${item.id}`}
              title="Enviar direto para a Gráfica (produção interna)"
              aria-label={`Enviar a peça ${item.displayId ?? ''} direto para a Gráfica`}
            >
              <Factory aria-hidden="true" className="h-4 w-4" />
            </button>
          )}
          {/* Prioridade na impressão (08/10): da Revisão Final até a impressão terminar. */}
          <PrioridadeNaImpressaoIcone item={item} eventoFinalizado={eventoFinalizado} />
          {/* Toggle reaproveitamento — enquanto não estiver em produção/entregue. */}
          {!isEditBlocked(item.status) && (
            <button
              type="button"
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
              className={item.isReuse ? "evd-acao evd-acao-reuso-ativo" : "evd-acao evd-acao-reuso"}
              style={{ cursor: updateItemIsReuseMutation.isPending ? 'wait' : 'pointer' }}
            >
              <Recycle aria-hidden="true" className="h-4 w-4" />
            </button>
          )}
          {isEditBlocked(item.status) ? (
            <button
              type="button"
              disabled
              aria-disabled="true"
              title={motivoEdicaoBloqueada(item.status) ?? undefined}
              aria-label={`Edição bloqueada: ${motivoEdicaoBloqueada(item.status) ?? ""}`}
              className="evd-acao"
              onClick={e => e.stopPropagation()}
              data-testid={`button-edit-item-${item.id}`}
            >
              <Lock aria-hidden="true" className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              className="evd-acao"
              onClick={e => { e.stopPropagation(); handleEditItem(item); }}
              data-testid={`button-edit-item-${item.id}`}
              title="Editar peça" aria-label={`Editar a peça ${item.displayId ?? ''}`}
            >
              <Pencil aria-hidden="true" className="h-4 w-4" />
            </button>
          )}
          {canDeleteAny && (
            canDeleteItem(item.status) ? (
              <button
                type="button"
                className="evd-acao evd-acao-perigo"
                onClick={e => { e.stopPropagation(); handleDeleteItem(item); }}
                data-testid={`button-delete-item-${item.id}`}
                title="Excluir peça" aria-label={`Excluir a peça ${item.displayId ?? ''}`}
              >
                <Trash2 aria-hidden="true" className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                disabled
                aria-disabled="true"
                className="evd-acao"
                onClick={e => e.stopPropagation()}
                title="Exclusão bloqueada — peça já está em Arte ou produção"
              >
                <Trash2 aria-hidden="true" className="h-4 w-4" />
              </button>
            )
          )}
        </div>
        )}
      </td>
    </tr>
  );
}
