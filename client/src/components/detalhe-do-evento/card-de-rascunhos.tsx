// ─────────────────────────────────────────────────────────────────────────────
// O CARD DE PEÇAS EM RASCUNHO — os rascunhos vivem SÓ aqui (a listagem
// principal exclui draft/requested), agrupados por grupo e tipo, com o envio
// para a vinculação e o porquê de ele estar travado.
// ─────────────────────────────────────────────────────────────────────────────
import { Package, Pencil, Trash2, Check, Lock, Send, Factory } from "lucide-react";
import { Botao } from "@/components/ui/botao";
import { Selo } from "@/components/ui/selo";
import { SeloKit } from "@/components/kit/selo-kit";
import { SeloProducaoInterna } from "@/components/selo-producao-interna";
import { dividirEnvioDaLista, podeEnviarDiretoParaGrafica } from "@shared/producao-interna";
import type { UserRole } from "@/contexts/auth-context";
import type { useEventReference } from "@/hooks/use-event-reference";
import { FINAL_STATUSES } from "@/lib/status";
import { refsDaPeca } from "@/lib/refs-da-peca";
import { grupoDoKit } from "@shared/kit";
import { T, TOM, FONT, FS, FW, R, SHADOW } from "@/lib/theme";
import { MiniaturasDaPeca } from "./miniaturas-da-peca";
import { formatarM2 } from "./regras";
import type { PecaDoEvento, UsuarioLogado } from "./tipos";

export function CardDeRascunhos({
  draftItems, rascunhosQueEuEnvio, showAllDrafts, setShowAllDrafts, groupOf, user, hasPermission, isMobile,
  canUploadReference, canEditLists, canDeleteAny, eventoFinalizado, avisoEventoFim, isEditBlocked,
  motivoEdicaoBloqueada, handleEditItem, setDeletingItem, salvarReferenciasMutation, getUploadUrl,
  enviando, setSubmitConfirmOpen, abrirEnvioDireto,
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
  /** Produção interna (02/10): abre "Enviar direto para a Gráfica" com estas peças. */
  abrirEnvioDireto?: (pecas: PecaDoEvento[]) => void;
}) {
  // O padrão da casa: cap de 50 (centenas de rascunhos travavam o DOM).
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

  // POR QUE O BOTÃO ESTÁ TRAVADO — escrito, não só no `title` (no celular
  // não há hover, e o botão cinza lia como defeito). A ordem é a do mais
  // forte: evento finalizado vale para todos.
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
  const alvo = isMobile ? 44 : 32;
  // PRODUÇÃO INTERNA (02/10): o envio divide como o servidor divide — a
  // marcada completa vai direto para a Gráfica; a marcada sem arquivo nem
  // instrução fica aqui. O rodapé diz isso antes do clique.
  const divisao = dividirEnvioDaLista(rascunhosQueEuEnvio);
  const nGrafica = divisao.paraGrafica.length;
  const nVinculacao = divisao.paraVinculacao.length;
  const nPresas = divisao.ficamNoRascunho.length;
  // Só sobraram marcadas incompletas: o envio da lista não teria o que mandar
  // (o servidor responderia 400). O botão trava e a frase diz o caminho.
  const nadaSai = !motivoTravado && nVinculacao + nGrafica === 0;
  const podeDireto = (p: PecaDoEvento) => !eventoFinalizado && !!abrirEnvioDireto && podeEnviarDiretoParaGrafica(p, user?.role);
  // O LOTE: as marcadas que podem ir agora, sem esperar o resto da lista —
  // as completas e as que só precisam da instrução (o diálogo a pede e diz
  // quais ficam de fora sem ela).
  const marcadasProntas = rascunhosQueEuEnvio.filter((p) => p.producaoInterna && podeDireto(p));

  return (
    <section
      id="rascunhos-do-evento"
      aria-labelledby="titulo-rascunhos"
      data-testid="card-draft-items"
      style={{ backgroundColor: T.surface, border: `1px solid ${TOM.alerta.border}`, borderRadius: R.lg, boxShadow: SHADOW.sm, marginBottom: isMobile ? 28 : 40, scrollMarginTop: 16, overflow: 'hidden' }}
    >
      {/* CABEÇALHO: o que é e por que importa — rascunho não anda sozinho.
          O destino certo é a VINCULAÇÃO de patrocinadores, não a Arte. */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: isMobile ? '16px 16px 12px' : '20px 24px 14px' }}>
        <div aria-hidden="true" style={{ width: 36, height: 36, borderRadius: R.md, backgroundColor: TOM.alerta.bg, border: `1px solid ${TOM.alerta.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Package style={{ width: 17, height: 17, color: TOM.alerta.text }} />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h2 id="titulo-rascunhos" style={{ margin: 0, fontFamily: FONT.display, fontSize: FS.title, fontWeight: FW.forte, letterSpacing: '-0.02em', color: T.text }}>
              Peças em rascunho
            </h2>
            <Selo tom="alerta" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {draftItems.length} {draftItems.length === 1 ? 'peça' : 'peças'}
            </Selo>
          </div>
          <p style={{ fontSize: FS.body, color: T.second, margin: '4px 0 0', lineHeight: 1.5, maxWidth: 760 }}>
            Enquanto estiverem aqui, as peças não seguem para a vinculação de patrocinadores nem para a Arte. Revise e envie quando a lista estiver pronta — dá para continuar adicionando depois.
          </p>
        </div>
      </div>

      <div style={{ padding: isMobile ? '0 12px 14px' : '0 24px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {draftSortedGroups.map(groupName => {
          const typeMap = draftGroupMap[groupName];
          const sortedTypes = Object.keys(typeMap).sort((a, b) => a.localeCompare(b, 'pt-BR'));
          return (
            <div key={groupName || '__sem_grupo__'} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* Cabeçalho Grupo Pai */}
              {groupName && (
                <div style={{ fontSize: FS.micro, fontWeight: FW.forte, letterSpacing: '0.12em', textTransform: 'uppercase', color: T.second, paddingLeft: 2 }}>
                  {groupName}
                </div>
              )}
              {sortedTypes.map(typeName => {
                const typeItems = typeMap[typeName];
                return (
                  <div key={typeName}>
                    {/* Sub-cabeçalho Tipo */}
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '0 2px 6px' }}>
                      <span style={{ fontSize: FS.meta, fontWeight: FW.forte, color: T.strong }}>{typeName}</span>
                      <span style={{ fontSize: FS.small, color: T.second, fontVariantNumeric: 'tabular-nums' }}>{typeItems.length}</span>
                    </div>
                    <div style={{ border: `1px solid ${T.border}`, borderRadius: R.md, overflow: 'hidden' }}>
                      {typeItems.map((item, idx) => {
                        const refs = refsDaPeca(item);
                        const podeEditarRef = canUploadReference && !(FINAL_STATUSES as readonly string[]).includes(item.status);
                        return (
                          <div
                            key={item.id}
                            className="evd-rascunho"
                            data-testid={`draft-item-${item.id}`}
                            style={{ display: 'flex', alignItems: isMobile ? 'flex-start' : 'center', gap: 12, flexWrap: isMobile ? 'wrap' : 'nowrap', padding: isMobile ? '12px' : '10px 12px 10px 14px', borderTop: idx === 0 ? 'none' : `1px solid ${T.border}`, backgroundColor: T.surface }}
                          >
                            <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                              {/* O CÓDIGO da peça — o que se usa para falar dela com a Arte. */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flexWrap: 'wrap' }}>
                                {item.displayId && <span style={{ fontFamily: FONT.mono, fontWeight: FW.forte, fontSize: FS.meta, color: T.accentText, flexShrink: 0 }}>{item.displayId}</span>}
                                <SeloKit peca={item} />
                                <SeloProducaoInterna peca={item} onde="lista" />
                                {item.description
                                  ? <span style={{ fontSize: FS.body, fontWeight: FW.medio, color: T.text, minWidth: 0, overflowWrap: 'anywhere' }}>{item.description}</span>
                                  : <span style={{ fontSize: FS.body, color: T.second }}>sem descrição</span>}
                              </div>
                              {/* A linha de detalhe pula campo vazio em vez de mostrar "• •". */}
                              <div style={{ fontSize: FS.small, color: T.second, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                                {[`${item.quantity} ${item.quantity === 1 ? 'unidade' : 'unidades'}`, item.material, item.finish, `${formatarM2(parseFloat(item.calculatedM2 || '0'))} m²`].filter(Boolean).join(' · ')}
                              </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, marginLeft: 'auto' }}>
                              {/* Referências visuais — VÁRIAS por peça: o upload
                                  ADICIONA em vez de trocar, e cada miniatura tem o seu ×. */}
                              <MiniaturasDaPeca
                                refs={refs}
                                podeEditar={podeEditarRef}
                                rotuloDaPeca={item.displayId ?? 'a peça'}
                                tamanho={isMobile ? 44 : 32}
                                pilha
                                rotuloDoAnexo={refs.length === 0 && !isMobile ? 'Referência' : undefined}
                                idDoLink={(k) => (k === 0 ? `link-reference-${item.id}` : `link-reference-${item.id}-${k + 1}`)}
                                idDoRemover={(k) => (k === 0 ? `button-remove-reference-${item.id}` : `button-remove-reference-${item.id}-${k + 1}`)}
                                onRemover={(k) => salvarReferenciasMutation.mutate({ itemId: item.id, referenceUrls: refs.filter((_, j) => j !== k) })}
                                onAdicionar={(url) => salvarReferenciasMutation.mutate({ itemId: item.id, referenceUrls: [...refs, url] })}
                                getUploadUrl={getUploadUrl}
                              />
                              {/* canEditLists: mesmo gate da tabela principal. */}
                              {canEditLists && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginLeft: 2 }}>
                                  {/* Direto para a Gráfica — só quando vale (papel, sem
                                      patrocinador, não molde): ícone com nome por extenso. */}
                                  {podeDireto(item) && (
                                    <button type="button" className="evd-acao evd-acao-grafica" style={{ width: alvo, height: alvo }} onClick={() => abrirEnvioDireto!([item])} data-testid={`button-direto-grafica-${item.id}`} aria-label={`Enviar a peça ${item.displayId ?? ""} direto para a Gráfica`} title="Enviar direto para a Gráfica (produção interna)">
                                      <Factory aria-hidden="true" className="h-4 w-4" />
                                    </button>
                                  )}
                                  {isEditBlocked(item.status) ? (
                                    <button
                                      type="button"
                                      disabled
                                      aria-disabled="true"
                                      className="evd-acao"
                                      style={{ width: alvo, height: alvo }}
                                      title={motivoEdicaoBloqueada(item.status) ?? undefined}
                                      aria-label={`Edição bloqueada: ${motivoEdicaoBloqueada(item.status) ?? ""}`}
                                    >
                                      <Lock aria-hidden="true" className="h-4 w-4" />
                                    </button>
                                  ) : (
                                    <button type="button" className="evd-acao" style={{ width: alvo, height: alvo }} onClick={() => handleEditItem(item)} data-testid={`button-edit-draft-${item.id}`} aria-label={`Editar a peça ${item.displayId ?? ""}`} title="Editar peça">
                                      <Pencil aria-hidden="true" className="h-4 w-4" />
                                    </button>
                                  )}
                                  {canDeleteAny && (
                                    <button type="button" className="evd-acao evd-acao-perigo" style={{ width: alvo, height: alvo }} onClick={() => setDeletingItem(item)} data-testid={`button-delete-draft-${item.id}`} aria-label={`Excluir a peça ${item.displayId ?? ""}`} title="Excluir peça">
                                      <Trash2 aria-hidden="true" className="h-4 w-4" />
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}

        {/* Cap de 50 — padrão da casa, igual à listagem principal. */}
        {!showAllDrafts && draftItems.length > 50 && (
          <Botao
            variante="secundario"
            tamanho="toque"
            larguraCheia
            onClick={() => setShowAllDrafts(true)}
            data-testid="button-show-all-drafts"
          >
            Mostrar todos os {draftItems.length} rascunhos (+{draftItems.length - 50})
          </Botao>
        )}
      </div>

      {/* A FAIXA DO ENVIO — o rodapé do card, na tinta do alerta: a decisão
          que tira as peças daqui. */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: isMobile ? '14px 16px' : '16px 24px', backgroundColor: TOM.alerta.bg, borderTop: `1px solid ${TOM.alerta.border}` }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flex: '1 1 300px', minWidth: 0 }}>
          {motivoTravado
            ? <Lock aria-hidden="true" style={{ width: 16, height: 16, color: TOM.alerta.text, flexShrink: 0, marginTop: 2 }} />
            : <Send aria-hidden="true" style={{ width: 16, height: 16, color: TOM.alerta.text, flexShrink: 0, marginTop: 2 }} />}
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: FS.body, fontWeight: FW.forte, color: T.text }}>{motivoTravado ? 'Envio indisponível' : 'Pronto para enviar?'}</p>
            <p id="texto-envio-rascunhos" data-testid="texto-envio-rascunhos" style={{ fontSize: FS.meta, color: T.apoio, margin: '2px 0 0', lineHeight: 1.5 }}>
              {/* draft + requested: o endpoint de envio abrange os dois —
                  contar só 'draft' subestimava a contagem. */}
              {motivoTravado
                ? motivoTravado
                : <>
                    {nGrafica === 0 && nPresas === 0
                      ? <>{nEnvio} {nEnvio === 1 ? 'peça vai' : 'peças vão'} para <strong>Vincular Patrocinadores</strong>, onde os patrocinadores são ligados e a peça segue para a Arte.</>
                      : <>
                          {nVinculacao > 0 && <>{nVinculacao} {nVinculacao === 1 ? 'vai' : 'vão'} para <strong>Vincular Patrocinadores</strong>. </>}
                          {nGrafica > 0 && <>{nGrafica} {nGrafica === 1 ? 'vai' : 'vão'} <strong>direto para a Gráfica</strong> (produção interna). </>}
                          {nPresas > 0 && <span style={{ color: TOM.alerta.text }}>{nPresas} {nPresas === 1 ? 'marcada fica' : 'marcadas ficam'} aqui: falta arquivo ou instruções para a Gráfica{nadaSai ? " — edite a peça, ou escreva as instruções em “Enviar só " + (nPresas === 1 ? 'a marcada' : 'as marcadas') + "”." : '.'}</span>}
                        </>}
                    {foraDoMeuEnvio > 0 && ` ${foraDoMeuEnvio} ${foraDoMeuEnvio === 1 ? 'rascunho do Kit fica' : 'rascunhos do Kit ficam'} para quem ${foraDoMeuEnvio === 1 ? 'o criou' : 'os criou'}.`}
                  </>}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end', width: isMobile ? '100%' : undefined, flexDirection: isMobile ? 'column-reverse' : 'row' }}>
        {/* EM LOTE (02/10): as marcadas que já podem ir, sem esperar o resto
            da lista — o mesmo diálogo da ação por peça. */}
        {!motivoTravado && marcadasProntas.length > 0 && (
          <Botao
            variante="secundario"
            tamanho={isMobile ? "toque" : "md"}
            icone={Factory}
            onClick={() => abrirEnvioDireto?.(marcadasProntas)}
            data-testid="button-direto-grafica-lote"
            title="Envia agora só as peças marcadas 'vai direto para a Gráfica'; o resto da lista continua aqui"
            style={isMobile ? { width: '100%' } : undefined}
          >
            {marcadasProntas.length === 1 ? 'Enviar só a marcada' : `Enviar só as ${marcadasProntas.length} marcadas`}
          </Botao>
        )}
        <Botao
          variante="primario"
          tamanho={isMobile ? "toque" : "md"}
          icone={Check}
          carregando={enviando}
          onClick={() => setSubmitConfirmOpen(true)}
          // Gate: enviar rascunhos é ação de admin ou do papel "solicitação".
          // Evento finalizado também trava. Sem rascunho no recorte de quem
          // envia, o clique só devolveria "Nenhum item em rascunho".
          disabled={!!motivoTravado || nadaSai}
          title={motivoTravado ?? (nadaSai ? "A marcada precisa de arquivo ou instruções antes de sair" : undefined)}
          // Ligar o botão ao motivo faz o leitor de tela dizer POR QUE está travado.
          aria-describedby={motivoTravado || nadaSai ? "texto-envio-rascunhos" : undefined}
          data-testid="button-submit-drafts"
          style={isMobile ? { width: '100%' } : undefined}
        >
          {enviando
            ? 'Enviando...'
            : foraDoMeuEnvio > 0 && nEnvio > 0
              ? `Enviar ${nEnvio} ${nEnvio === 1 ? 'peça' : 'peças'}`
              : 'Enviar todas as peças'}
        </Botao>
        </div>
      </div>
    </section>
  );
}
