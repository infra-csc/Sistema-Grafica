// ─────────────────────────────────────────────────────────────────────────────
// A FILA DE PENDENTES: o vazio (pelo motivo), a ordem declarada, as portas da
// fila de decisão e os grupos por evento.
// ─────────────────────────────────────────────────────────────────────────────
import type { Dispatch, SetStateAction } from "react";
import { CheckCircle, Play, Search, Send } from "lucide-react";
import { Botao } from "@/components/ui/botao";
import { EstadoVazio } from "@/components/ui/estados";
import { SoQuandoMudar } from "@/components/arte/so-quando-mudar";
import { alvo } from "@/hooks/use-mobile";
import { R, T, TOM } from "@/lib/theme";
import { ORDEM_REGRA, type OrdemPendentes } from "./regras";
import { GrupoDoEvento } from "./grupo-do-evento";
import type { PropsDoCartao } from "./cartao-da-peca";
import type { AcoesDoAtendimento } from "./use-atendimento-acoes";
import type { EventoAtendimento, Patrocinador, PecaAtendimento, UsuarioDaTela } from "./tipos";

export function ListaPendentes({
  filteredItems, filteredItemsBase, pendingItems, pendingGroup, atrasadosFilter, setAtrasadosFilter, chipsAtivos, limparFiltros,
  ordemPendentes, setOrdemPendentes, user, avisarGestaoMutation, filaDaSuaMesa, reviewQueue, setSelectedItem, setDialogOpen,
  itemsByEvent, events, expandedEvents, isMobile, dedo, hoje, itemSponsorsMap, getEventInfo, eventoAberto, toggleEventCollapsed,
  ...doCartao
}: {
  filteredItems: PecaAtendimento[];
  filteredItemsBase: PecaAtendimento[];
  pendingItems: PecaAtendimento[];
  pendingGroup: PecaAtendimento[];
  atrasadosFilter: boolean;
  setAtrasadosFilter: Dispatch<SetStateAction<boolean>>;
  chipsAtivos: readonly unknown[];
  limparFiltros: () => void;
  ordemPendentes: OrdemPendentes;
  setOrdemPendentes: Dispatch<SetStateAction<OrdemPendentes>>;
  user: UsuarioDaTela;
  avisarGestaoMutation: AcoesDoAtendimento["avisarGestaoMutation"];
  filaDaSuaMesa: PecaAtendimento[];
  reviewQueue: PecaAtendimento[];
  setSelectedItem: Dispatch<SetStateAction<PecaAtendimento | null>>;
  setDialogOpen: Dispatch<SetStateAction<boolean>>;
  itemsByEvent: Map<string, PecaAtendimento[]>;
  events: EventoAtendimento[];
  expandedEvents: Set<string>;
  isMobile: boolean;
  dedo: boolean;
  hoje: Date;
  itemSponsorsMap: Record<string, Patrocinador[]>;
  getEventInfo: (eventId: string) => EventoAtendimento | undefined;
  eventoAberto: (id: string) => boolean;
  toggleEventCollapsed: (id: string) => void;
} & Omit<PropsDoCartao, "item" | "prevItem">) {
  const { cards, tamBotao, agora, itemApprovalsMap, typeToGroup, loadingSponsors } = doCartao;
  return (
    <>
      {filteredItems.length === 0 ? (
        // O vazio da casa, com o ícone pelo MOTIVO: o check dizia "tudo certo"
        // também quando eram os filtros escondendo a fila inteira. O vazio pelo
        // recorte de atrasados tem texto próprio — com o filtro ligado,
        // "Nenhuma peça pendente" leria como "nada a fazer" enquanto a fila
        // continua ali, dentro do prazo — e o vazio por filtro diz QUANTAS
        // peças ficaram de fora. A saída mora ao lado do problema.
        <div data-testid="empty-atendimento">
          <EstadoVazio
            icone={pendingItems.length > 0 && !atrasadosFilter ? Search : CheckCircle}
            titulo={atrasadosFilter
              ? "Nada atrasado neste recorte"
              : pendingItems.length === 0 ? "Nenhuma peça pendente" : "Nenhuma peça neste recorte"}
            descricao={
              <span data-testid="empty-atendimento-motivo">
                {atrasadosFilter
                  ? `A lista está vazia pelo FILTRO "Atrasados" — ${filteredItemsBase.length === 0 ? 'os demais filtros já não devolvem nenhuma peça' : `as ${filteredItemsBase.length} peças deste recorte estão todas dentro do prazo de Aprovação de Layout`}.`
                  : pendingItems.length === 0
                  ? "Nenhuma peça aguarda aprovação do patrocinador agora."
                  : `${pendingItems.length} ${pendingItems.length === 1 ? 'peça pendente ficou' : 'peças pendentes ficaram'} fora ${chipsAtivos.length === 1 ? 'do filtro ativo' : `dos ${chipsAtivos.length} filtros ativos`}.`}
              </span>
            }
            acao={atrasadosFilter ? (
              <Botao variante="primario" tamanho={tamBotao} onClick={() => setAtrasadosFilter(false)} data-testid="button-clear-atrasados-empty">
                Mostrar todas as peças
              </Botao>
            ) : pendingItems.length > 0 && chipsAtivos.length > 0 ? (
              <Botao variante="secundario" tamanho={tamBotao} onClick={limparFiltros} data-testid="button-clear-filters-empty">
                Limpar {chipsAtivos.length === 1 ? 'o filtro' : `os ${chipsAtivos.length} filtros`}
              </Botao>
            ) : undefined}
          />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>

          {/* Grupo: Pendentes */}
          {/* ── A ORDEM, DECLARADA ─────────────────────────────────────────
              A lista sempre teve uma ordem e a tela nunca a disse. Sem a regra
              à vista, ninguém entende por que uma peça é a terceira — e não há
              como pedir outra quando a pergunta muda ("o que vence primeiro?"
              / "o que espera por mim?"). A regra fica escrita ao lado dos
              alternadores, não escondida num tooltip. */}
          {pendingGroup.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.second, flexShrink: 0 }}>
                Ordem
              </span>
              <div role="group" aria-label="Ordem da lista" style={{ display: 'flex', gap: 6, overflowX: 'auto', maxWidth: '100%', paddingBottom: 2 }}>
                {([['prazo', 'Prazo de aprovação'], ['mesa', 'Peças na sua mesa'], ['evento', 'Nome do evento']] as const).map(([valor, rotulo]) => {
                  const ativo = ordemPendentes === valor;
                  return (
                    <button
                      key={valor}
                      type="button"
                      aria-pressed={ativo}
                      data-testid={`toggle-ordem-${valor}`}
                      onClick={() => setOrdemPendentes(valor)}
                      style={{
                        height: alvo(30, dedo), padding: '0 12px', borderRadius: R.md, cursor: 'pointer',
                        fontFamily: 'inherit', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0,
                        border: `1px solid ${ativo ? TOM.laranja.border : T.border}`,
                        backgroundColor: ativo ? TOM.laranja.bg : T.surface,
                        color: ativo ? T.accentText : T.apoio,
                      }}
                    >
                      {rotulo}
                    </button>
                  );
                })}
              </div>
              <span style={{ fontSize: 12, color: T.apoio }}>{ORDEM_REGRA[ordemPendentes]}</span>

              {/* UM grupo à direita. Os dois botões tinham `marginLeft: auto`
                  cada um: com os dois na tela (admin) o espaço livre se dividia
                  entre eles e "Decidir em fila" — a ação do dia — boiava no
                  meio da linha, longe da borda onde o olho a procura. */}
              <div style={{ marginLeft: cards ? 0 : 'auto', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', width: cards ? '100%' : undefined }}>
              {/* O DISPARO À MÃO DO AVISO DA GESTÃO. Discreto de propósito e
                  encostado à direita: é ferramenta de manutenção, não parte do
                  trabalho de decidir — quem entra aqui para aprovar não deve
                  tropeçar nele. */}
              {user?.role === "admin" && (
                <Botao
                  variante="secundario"
                  tamanho={tamBotao}
                  icone={Send}
                  carregando={avisarGestaoMutation.isPending}
                  data-testid="button-avisar-gestao"
                  onClick={() => avisarGestaoMutation.mutate()}
                  title="Manda agora o resumo das aprovações pendentes para quem recebe o aviso das 10h, 15h e 18h. Se não houver pendência, nada é enviado."
                  style={{ flexShrink: 0 }}
                >
                  {avisarGestaoMutation.isPending ? 'Enviando…' : 'Avisar a gestão'}
                </Botao>
              )}

              {/* ── A FILA, ALCANÇÁVEL ────────────────────────────────────────
                  A fila de decisão existia só DENTRO do modal (navegação no
                  cabeçalho e "Próxima peça" no rodapé) e não havia porta de
                  entrada: era preciso caçar a primeira peça na lista e abri-la.
                  Some quando não há nada esperando por você — botão que não faz
                  nada é ruído. */}
              {filaDaSuaMesa.length > 0 && (
                // A régua dos primários da casa e largura cheia quando a área
                // aperta: é a porta da fila.
                <Botao
                  variante="primario"
                  tamanho={tamBotao}
                  icone={Play}
                  data-testid="button-fila-decisao"
                  onClick={() => { setSelectedItem(filaDaSuaMesa[0]); setDialogOpen(true); }}
                  title="Abre a primeira peça que espera decisão sua; do modal dá para seguir para a próxima"
                  style={{ flexShrink: 0, flex: cards ? '1 1 auto' : undefined }}
                >
                  Decidir {filaDaSuaMesa.length === 1 ? 'a peça' : `as ${filaDaSuaMesa.length}`} em fila
                </Botao>
              )}
              {/* A FILA INTEIRA (rodada 4). A porta acima só existe para "nova
                  versão"; as peças que aguardam patrocinador — a maior parte do
                  dia — ficavam atrás de eventos RECOLHIDOS: abrir o evento,
                  achar a peça, Revisar. Esta abre a primeira da lista, na ordem
                  da tela, e o modal segue com "Próxima peça". Quando há peça na
                  sua mesa ela é secundária (contorno); sem, é a ação do dia. */}
              {reviewQueue.length > filaDaSuaMesa.length && (
                <Botao
                  variante={filaDaSuaMesa.length > 0 ? "secundario" : "primario"}
                  tamanho={tamBotao}
                  icone={Play}
                  data-testid="button-fila-inteira"
                  onClick={() => { setSelectedItem(reviewQueue[0]); setDialogOpen(true); }}
                  title="Abre a primeira peça da lista, na ordem escolhida; do modal dá para seguir peça a peça sem voltar"
                  style={{ flexShrink: 0, flex: cards ? '1 1 auto' : undefined }}
                >
                  {filaDaSuaMesa.length > 0 ? `Toda a fila (${reviewQueue.length})` : reviewQueue.length === 1 ? 'Revisar a peça' : `Revisar as ${reviewQueue.length} em fila`}
                </Botao>
              )}
              </div>
            </div>
          )}

          {/* FRONTEIRA DE RENDER dos grupos (ver SoQuandoMudar): o motivo da
              reprovação, a busca de patrocinador e a trava pós-avanço vivem
              na página, que desenha esta lista — sem ela cada tecla no modal refazia todos os
              grupos e cards da fila. `deps` = tudo o que os grupos leem. */}
          <SoQuandoMudar
            deps={[pendingGroup, itemsByEvent, events, expandedEvents, isMobile, cards, dedo, hoje, agora, itemApprovalsMap, itemSponsorsMap, typeToGroup, loadingSponsors]}
            render={() => (<>
          {pendingGroup.length > 0 && Array.from(itemsByEvent.entries()).map(([eventId, eventItems]) => (
            <GrupoDoEvento
              key={eventId}
              eventId={eventId}
              eventItems={eventItems}
              getEventInfo={getEventInfo}
              eventoAberto={eventoAberto}
              toggleEventCollapsed={toggleEventCollapsed}
              hoje={hoje}
              {...doCartao}
            />
          ))}
          </>)} />

          {/* Sem "Carregar mais" na fila: a lista chega inteira. O botão
              paginava PEÇAS antes do agrupamento, então escondia eventos —
              e a pergunta desta tela é "onde há coisa esperando", que uma
              lista parcial responde errado. O Histórico mantém a paginação:
              lá a lista é ilimitada e ninguém a varre inteira. */}

          {/* O grupo "Aprovados" FOI REMOVIDO (dono, 24/08): peça com todos os
                        patrocinadores aprovados já aparece na aba Histórico — que é o
                        lugar dela — e o grupo verde no fim da fila era a mesma
                        informação dita duas vezes, sem dizer o que era. Revogar uma
                        decisão continua possível pelo Histórico. */}
        </div>
      )}
    </>
  );
}
