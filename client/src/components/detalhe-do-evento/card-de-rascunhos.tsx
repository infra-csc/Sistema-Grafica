// ─────────────────────────────────────────────────────────────────────────────
// O CARD DE PEÇAS EM RASCUNHO — os rascunhos vivem SÓ aqui (a listagem
// principal exclui draft/requested), agrupados por grupo e tipo, com o envio
// para a vinculação e o porquê de ele estar travado.
// ─────────────────────────────────────────────────────────────────────────────
import { Package, Pencil, Trash2, Check, Lock, Paperclip, X, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Botao } from "@/components/ui/botao";
import { Selo } from "@/components/ui/selo";
import { ObjectUploader } from "@/components/ObjectUploader";
import { SeloKit } from "@/components/kit/selo-kit";
import type { UserRole } from "@/contexts/auth-context";
import type { useEventReference } from "@/hooks/use-event-reference";
import { FINAL_STATUSES } from "@/lib/status";
import { refsDaPeca } from "@/lib/refs-da-peca";
import { miniatura } from "@/lib/miniatura";
import { grupoDoKit } from "@shared/kit";
import { T, TOM, FONT } from "@/lib/theme";
import type { PecaDoEvento, UsuarioLogado } from "./tipos";

export function CardDeRascunhos({
  draftItems, rascunhosQueEuEnvio, showAllDrafts, setShowAllDrafts, groupOf, user, hasPermission, isMobile,
  canUploadReference, canEditLists, canDeleteAny, eventoFinalizado, avisoEventoFim, isEditBlocked,
  motivoEdicaoBloqueada, handleEditItem, setDeletingItem, salvarReferenciasMutation, getUploadUrl,
  enviando, setSubmitConfirmOpen,
}: {
  draftItems: PecaDoEvento[];
  rascunhosQueEuEnvio: PecaDoEvento[];
  showAllDrafts: boolean;
  setShowAllDrafts: (v: boolean) => void;
  groupOf: (type: string) => string;
  user: UsuarioLogado;
  hasPermission: (requiredRole: UserRole | UserRole[]) => boolean;
  isMobile: boolean;
  canUploadReference: boolean;
  canEditLists: boolean;
  canDeleteAny: boolean;
  eventoFinalizado: boolean;
  avisoEventoFim: string;
  isEditBlocked: (status: string) => boolean;
  motivoEdicaoBloqueada: (status: string) => string | null;
  handleEditItem: (item: PecaDoEvento) => void;
  setDeletingItem: (item: PecaDoEvento | null) => void;
  salvarReferenciasMutation: ReturnType<typeof useEventReference>["salvarReferenciasMutation"];
  getUploadUrl: () => Promise<{ method: "PUT"; url: string }>;
  /** O envio dos rascunhos está em andamento. */
  enviando: boolean;
  setSubmitConfirmOpen: (v: boolean) => void;
}) {
  return (
    <div id="rascunhos-do-evento" style={{ backgroundColor: T.surface, border: `1px solid ${T.border}`, borderLeft: `3px solid ${TOM.alerta.text}`, borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.05)', marginBottom: 32, scrollMarginTop: 16 }} data-testid="card-draft-items">
      <div style={{ padding: '20px 24px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Package style={{ width: 16, height: 16, color: TOM.alerta.text, flexShrink: 0 }} />
          <span style={{ fontSize: 13, fontWeight: 800, color: T.text, fontFamily: FONT.display, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Peças em Rascunho
          </span>
          <Selo tom="alerta">
            {draftItems.length} {draftItems.length === 1 ? 'peça' : 'peças'}
          </Selo>
        </div>
        {/* O destino certo: o envio leva à VINCULAÇÃO de patrocinadores
            (o botão e a confirmação logo abaixo dizem isso), não à Arte.
            E "peça", a palavra do resto da tela — "item" só vivia aqui. */}
        {/* O QUE É E POR QUE IMPORTA: rascunho não anda sozinho. Quem
            nunca usou lia "revise e envie" como opcional. */}
        <p style={{ fontSize: 13, color: T.second, margin: '8px 0 0', lineHeight: 1.5 }}>
          Enquanto estiverem aqui, as peças não seguem para a vinculação de patrocinadores nem para a Arte. Revise e envie quando a lista estiver pronta — dá para continuar adicionando depois.
        </p>
      </div>
      <div style={{ padding: '16px 24px 24px' }}>
        <div className="space-y-4 mb-4">
          {(() => {
            // Cap de 50 (padrão da casa): centenas de rascunhos travavam o DOM.
            const DRAFT_CAP = 50;
            const visibleDrafts = showAllDrafts || draftItems.length <= DRAFT_CAP
              ? draftItems
              : draftItems.slice(0, DRAFT_CAP);
            // Grupo Pai → Tipo → itens
            const draftGroupMap: Record<string, Record<string, typeof draftItems>> = {};
            visibleDrafts.forEach(item => {
              const g = grupoDoKit(item) ?? (groupOf(item.type) || '');
              if (!draftGroupMap[g]) draftGroupMap[g] = {};
              if (!draftGroupMap[g][item.type]) draftGroupMap[g][item.type] = [];
              draftGroupMap[g][item.type].push(item);
            });
            const draftSortedGroups = Object.keys(draftGroupMap).sort((a, b) => {
              if (a === '') return 1; if (b === '') return -1;
              return a.localeCompare(b, 'pt-BR');
            });
            return draftSortedGroups.map(groupName => {
              const typeMap = draftGroupMap[groupName];
              const sortedTypes = Object.keys(typeMap).sort((a, b) => a.localeCompare(b, 'pt-BR'));
              return (
                <div key={groupName || '__sem_grupo__'}>
                  {/* Cabeçalho Grupo Pai */}
                  {groupName && (
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: T.second, marginBottom: 6, paddingLeft: 2 }}>
                      {groupName}
                    </div>
                  )}
                  <div className="space-y-3">
                    {sortedTypes.map(typeName => {
                      const typeItems = typeMap[typeName];
                      return (
                        <div key={typeName}>
                          {/* Sub-cabeçalho Tipo */}
                          <div style={{ fontSize: 11, fontWeight: 600, color: T.second, marginBottom: 4, paddingLeft: 2 }}>
                            {typeName}
                          </div>
                          <div className="space-y-2">
                            {typeItems.map(item => (
                              <div key={item.id} className="flex items-center justify-between p-3 border rounded-lg bg-card hover-elevate" data-testid={`draft-item-${item.id}`}>
                                <div className="flex items-center gap-3 flex-1 min-w-0">
                                  <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                                    <Package className="h-4 w-4 text-muted-foreground" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    {/* O CÓDIGO da peça estava ausente do rascunho —
                                        justo o que se usa para falar dela com a Arte.
                                        A linha de detalhe pula campo vazio em vez de
                                        mostrar "• •". */}
                                    <div className="flex items-center gap-2 min-w-0">
                                      {item.displayId && <span style={{ fontFamily: FONT.mono, fontWeight: 700, fontSize: 12, color: T.accentText, flexShrink: 0 }}>{item.displayId}</span>}
                                      <SeloKit peca={item} />
                                      {item.description
                                        ? <span className="text-sm truncate" style={{ color: T.strong }}>{item.description}</span>
                                        : <span className="text-sm text-muted-foreground">sem descrição</span>}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                      {[`${item.quantity} ${item.quantity === 1 ? 'unidade' : 'unidades'}`, item.material, item.finish, `${parseFloat(item.calculatedM2 || '0').toFixed(2)}m²`].filter(Boolean).join(' • ')}
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                                  {/* Referências visuais — VÁRIAS por peça: o upload
                                      ADICIONA em vez de trocar, e cada miniatura tem o seu ×.
                                      Solicitation/admin, em qualquer status até um FINAL.
                                      Alvos ≥44px no mobile. */}
                                  {(() => {
                                    const refs = refsDaPeca(item);
                                    const podeEditarRef = canUploadReference && !(FINAL_STATUSES as readonly string[]).includes(item.status);
                                    return (<>
                                      {refs.map((url, k) => (
                                        <span key={`${url}-${k}`} style={{ position: 'relative', display: 'inline-flex' }}>
                                          <a href={url} target="_blank" rel="noopener noreferrer" title={refs.length > 1 ? `Abrir referência ${k + 1} de ${refs.length}` : "Abrir referência visual"} data-testid={k === 0 ? `link-reference-${item.id}` : `link-reference-${item.id}-${k + 1}`}>
                                            <img loading="lazy" decoding="async" src={miniatura(url)} className="h-8 w-8 rounded object-cover border border-border" alt={`Referência visual ${k + 1}`} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                                          </a>
                                          {podeEditarRef && (
                                            <button
                                              type="button"
                                              title="Remover esta referência"
                                              aria-label={`Remover referência ${k + 1} de ${item.displayId}`}
                                              data-testid={k === 0 ? `button-remove-reference-${item.id}` : `button-remove-reference-${item.id}-${k + 1}`}
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
                                          buttonClassName={isMobile ? "px-3 h-11 text-xs gap-1" : "px-2 h-7 text-xs gap-1"}
                                        >
                                          <Paperclip className="h-3 w-3" />
                                          <span>{refs.length > 0 ? '+ ref.' : 'Ref. visual'}</span>
                                        </ObjectUploader>
                                      )}
                                    </>);
                                  })()}
                                  {/* canEditLists (não canManageEvent): mesmo gate da tabela
                                      principal — o papel "solicitação" edita rascunhos. */}
                                  {canEditLists && (
                                    <>
                                      {isEditBlocked(item.status) ? (
                                        <button
                                          type="button"
                                          disabled
                                          aria-disabled="true"
                                          className="p-1.5 rounded-md"
                                          title={motivoEdicaoBloqueada(item.status) ?? undefined}
                                          aria-label={`Edição bloqueada: ${motivoEdicaoBloqueada(item.status) ?? ""}`}
                                          style={{ color: T.second, cursor: "not-allowed", background: "none", border: "none" }}
                                        >
                                          <Lock className="h-3.5 w-3.5" />
                                        </button>
                                      ) : (
                                        <Button variant="ghost" size="icon" className={isMobile ? "h-11 w-11" : "h-7 w-7"} onClick={() => handleEditItem(item)} data-testid={`button-edit-draft-${item.id}`} aria-label={`Editar a peça ${item.displayId ?? ""}`} title="Editar peça">
                                          <Pencil className="h-3.5 w-3.5" />
                                        </Button>
                                      )}
                                      {canDeleteAny && (
                                        <Button variant="ghost" size="icon" className={`${isMobile ? "h-11 w-11" : "h-7 w-7"} hover:bg-destructive/10`} onClick={() => setDeletingItem(item)} data-testid={`button-delete-draft-${item.id}`} aria-label={`Excluir a peça ${item.displayId ?? ""}`} title="Excluir peça">
                                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                        </Button>
                                      )}
                                    </>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            });
          })()}
        </div>
        {/* Cap de 50 — padrão da casa, igual à listagem principal. */}
        {!showAllDrafts && draftItems.length > 50 && (
          <Botao
            variante="secundario"
            tamanho="toque"
            larguraCheia
            onClick={() => setShowAllDrafts(true)}
            data-testid="button-show-all-drafts"
            style={{ marginBottom: 16 }}
          >
            Mostrar todos os {draftItems.length} rascunhos (+{draftItems.length - 50})
          </Botao>
        )}
        {(() => {
          // POR QUE O BOTÃO ESTÁ TRAVADO — escrito, não só no `title`
          // (no celular não há hover, e o botão cinza lia como defeito).
          // A ordem é a do mais forte: evento finalizado vale para todos.
          const podeEnviar = hasPermission("admin") || user?.role === "solicitacao";
          const nEnvio = rascunhosQueEuEnvio.length;
          const foraDoMeuEnvio = draftItems.length - nEnvio;
          const motivoTravado = eventoFinalizado
            ? avisoEventoFim
            : !podeEnviar
              ? "Quem envia é a Solicitação ou um administrador — avise um deles quando a lista estiver pronta."
              : nEnvio === 0
                ? (user?.kit
                    ? "Estes rascunhos não são peças do Kit criadas por você — quem os criou é que envia."
                    : "Estes rascunhos são do Kit — quem os criou é que envia.")
                : null;
          return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: 16, backgroundColor: TOM.alerta.bg, border: `1px solid ${TOM.alerta.border}`, borderRadius: 10 }}>
          <div className="flex items-center gap-2" style={{ flex: '1 1 280px', minWidth: 0 }}>
            <AlertCircle className="h-5 w-5" style={{ color: TOM.alerta.text, flexShrink: 0 }} />
            <div style={{ minWidth: 0 }}>
              <p className="text-sm font-semibold">{motivoTravado ? 'Envio indisponível' : 'Pronto para enviar?'}</p>
              <p id="texto-envio-rascunhos" data-testid="texto-envio-rascunhos" style={{ fontSize: 12, color: T.apoio, margin: 0, lineHeight: 1.5 }}>
                {/* draft + requested: o endpoint de envio abrange os dois —
                    contar só 'draft' subestimava a contagem. */}
                {motivoTravado
                  ? motivoTravado
                  : <>
                      {nEnvio} {nEnvio === 1 ? 'peça vai' : 'peças vão'} para <strong>Vincular Patrocinadores</strong>, onde os patrocinadores são ligados e a peça segue para a Arte.
                      {foraDoMeuEnvio > 0 && ` ${foraDoMeuEnvio} ${foraDoMeuEnvio === 1 ? 'rascunho do Kit fica' : 'rascunhos do Kit ficam'} para quem ${foraDoMeuEnvio === 1 ? 'o criou' : 'os criou'}.`}
                    </>}
              </p>
            </div>
          </div>
          <Botao
            variante="primario"
            tamanho="toque"
            icone={Check}
            carregando={enviando}
            onClick={() => setSubmitConfirmOpen(true)}
            // Gate: enviar rascunhos para a Arte é ação de admin ou do
            // papel "solicitação" — mesmo critério do texto acima.
            // Evento finalizado também trava: enviar rascunho é EMPURRAR
            // trabalho para a fila de vinculação, que já não mostra estas
            // peças. Sem rascunho no recorte de quem envia, o clique só
            // devolveria "Nenhum item em rascunho" do servidor.
            disabled={!!motivoTravado}
            title={motivoTravado ?? undefined}
            // Sem `motivo`: ele já está escrito VISÍVEL ao lado. Ligar o
            // botão a ele faz o leitor de tela dizer POR QUE está travado.
            aria-describedby={motivoTravado ? "texto-envio-rascunhos" : undefined}
            data-testid="button-submit-drafts"
          >
            {enviando
              ? 'Enviando...'
              : foraDoMeuEnvio > 0 && nEnvio > 0
                ? `Enviar ${nEnvio} ${nEnvio === 1 ? 'peça' : 'peças'}`
                : 'Enviar todas as peças'}
          </Botao>
        </div>
          );
        })()}
      </div>
    </div>
  );
}
