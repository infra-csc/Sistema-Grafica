// ─────────────────────────────────────────────────────────────────────────────
// A FILA DE PENDENTES: o vazio (pelo motivo), a ordem declarada, as portas da
// fila de decisão e os grupos por evento.
// ─────────────────────────────────────────────────────────────────────────────
import type { Dispatch, SetStateAction } from "react";
import { CheckCircle, Play, Search, Send } from "lucide-react";
import { Botao } from "@/components/ui/botao";
import { Segmentado } from "@/components/ui/abas";
import { EstadoVazio } from "@/components/ui/estados";
import { SoQuandoMudar } from "@/components/arte/so-quando-mudar";
import { FS, FW, T } from "@/lib/theme";
import { ORDEM_REGRA, type OrdemPendentes } from "./regras";
import { letra } from "./estilos";
import { GrupoDoEvento } from "./grupo-do-evento";
import type { PropsDoCartao } from "./cartao-da-peca";
import type { AcoesDoAtendimento } from "./use-atendimento-acoes";
import type { EventoAtendimento, Patrocinador, PecaAtendimento, UsuarioDaTela } from "./tipos";

/** As três ordens: rótulo inteiro no desktop, curto quando a área aperta. */
const ORDENS: readonly (readonly [OrdemPendentes, string, string])[] = [
  ['prazo', 'Prazo de aprovação', 'Prazo'],
  ['mesa', 'Peças na sua mesa', 'Sua mesa'],
  ['evento', 'Nome do evento', 'Evento'],
];

export function ListaPendentes({
  filteredItems, filteredItemsBase, pendingItems, pendingGroup, atrasadosFilter, setAtrasadosFilter, chipsAtivos, limparFiltros,
  ordemPendentes, setOrdemPendentes, actionableCount = null, user, avisarGestaoMutation, filaDaSuaMesa, reviewQueue, setSelectedItem, setDialogOpen,
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
  /** O número da aba Pendentes (use-ordem-da-fila) — só para explicar a diferença. */
  actionableCount?: number | null;
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
  const toque = isMobile || dedo;

  // POR QUE A ABA DIZ 16 E A FILA TEM 17 (29/09). As duas contagens estão
  // certas e contam coisas diferentes — a tela só não dizia qual. A aba
  // (`actionableCount`, em use-ordem-da-fila) conta as peças com decisão em
  // aberto (patrocinador pendente, reprovado ou com versão nova) e DEIXA DE
  // FORA as que têm alguém com a Arte refazendo. A fila ("Toda a fila") tem
  // todas as que não foram aprovadas por todos. A frase abaixo sai do MESMO
  // critério — nenhuma contagem mudou.
  const comArte = pendingGroup.filter(i => (itemApprovalsMap[i.id] || []).some(a => a.status === 'awaiting_arte')).length;
  const semDecisaoEmAberto = actionableCount === null ? 0 : Math.max(0, reviewQueue.length - actionableCount - comArte);
  const explicaAba = actionableCount !== null && actionableCount !== reviewQueue.length;

  // ── AS PORTAS DA FILA ─────────────────────────────────────────────────────
  // A fila de decisão existia só DENTRO do modal (navegação no cabeçalho e
  // "Próxima peça" no rodapé) e não havia porta de entrada. "Decidir em fila"
  // abre a primeira peça que espera decisão SUA; "Toda a fila" (rodada 4), a
  // primeira da lista, na ordem da tela — as peças que aguardam patrocinador
  // ficavam atrás de eventos RECOLHIDOS. Quando há peça na sua mesa, a fila
  // inteira é secundária (contorno); sem, é a ação do dia. Cada uma some
  // quando não há nada para ela — botão que não faz nada é ruído.
  // A AÇÃO PRINCIPAL À DIREITA (e em cima, no celular): a secundária vem antes
  // dela no DOM.
  const portasDaFila = (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      flexDirection: cards ? 'column-reverse' : 'row', flexWrap: cards ? 'nowrap' : 'wrap',
      marginLeft: cards ? 0 : 'auto', width: cards ? '100%' : undefined,
    }}>
      {/* O DISPARO À MÃO DO AVISO DA GESTÃO. Fantasma de propósito: é
          ferramenta de manutenção, não parte do trabalho de decidir — quem
          entra aqui para aprovar não deve tropeçar nele. */}
      {user?.role === "admin" && (
        <Botao
          variante="fantasma"
          tamanho={tamBotao}
          icone={Send}
          larguraCheia={cards}
          carregando={avisarGestaoMutation.isPending}
          data-testid="button-avisar-gestao"
          onClick={() => avisarGestaoMutation.mutate()}
          title="Manda agora o resumo das aprovações pendentes para quem recebe o aviso das 10h, 15h e 18h. Se não houver pendência, nada é enviado."
          style={{ flexShrink: 0 }}
        >
          {avisarGestaoMutation.isPending ? 'Enviando…' : 'Avisar a gestão'}
        </Botao>
      )}
      {reviewQueue.length > filaDaSuaMesa.length && (
        <Botao
          variante={filaDaSuaMesa.length > 0 ? "secundario" : "primario"}
          tamanho={tamBotao}
          icone={Play}
          larguraCheia={cards}
          data-testid="button-fila-inteira"
          onClick={() => { setSelectedItem(reviewQueue[0]); setDialogOpen(true); }}
          title="Abre a primeira peça da lista, na ordem escolhida; do modal dá para seguir peça a peça sem voltar"
          style={{ flexShrink: 0 }}
        >
          {filaDaSuaMesa.length > 0 ? `Toda a fila (${reviewQueue.length})` : reviewQueue.length === 1 ? 'Revisar a peça' : `Revisar as ${reviewQueue.length} em fila`}
        </Botao>
      )}
      {filaDaSuaMesa.length > 0 && (
        <Botao
          variante="primario"
          tamanho={tamBotao}
          icone={Play}
          larguraCheia={cards}
          data-testid="button-fila-decisao"
          onClick={() => { setSelectedItem(filaDaSuaMesa[0]); setDialogOpen(true); }}
          title="Abre a primeira peça que espera decisão sua; do modal dá para seguir para a próxima"
          style={{ flexShrink: 0 }}
        >
          Decidir {filaDaSuaMesa.length === 1 ? 'a peça' : `as ${filaDaSuaMesa.length}`} em fila
        </Botao>
      )}
    </div>
  );

  return (
    <>
      {filteredItems.length === 0 ? (
        // O vazio da casa, com o ícone pelo MOTIVO: o check dizia "tudo certo"
        // também quando eram os filtros escondendo a fila inteira. O vazio pelo
        // recorte de atrasados tem texto próprio — com o filtro ligado,
        // "Nenhuma peça pendente" leria como "nada a fazer" enquanto a fila
        // continua ali, dentro do prazo — e o vazio por filtro diz QUANTAS
        // peças ficaram de fora. A saída mora ao lado do problema. "Tudo em
        // dia" de verdade (fila vazia sem filtro) ganha o ícone em verde.
        <EstadoVazio
          testId="empty-atendimento"
          icone={pendingItems.length > 0 && !atrasadosFilter ? Search : CheckCircle}
          tom={pendingItems.length === 0 && !atrasadosFilter ? "sucesso" : undefined}
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
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* ── A ORDEM, DECLARADA ─────────────────────────────────────────
              A lista sempre teve uma ordem e a tela nunca a disse. Sem a regra
              à vista, ninguém entende por que uma peça é a terceira — e não há
              como pedir outra quando a pergunta muda ("o que vence primeiro?"
              / "o que espera por mim?"). A regra fica escrita logo abaixo do
              seletor, não escondida num tooltip.
              O seletor é o <Segmentado> da casa: a ordem troca a FORMA DE VER
              a mesma lista (o papel dele no design system), e os três botões
              de contorno laranja pareciam filtros ligados. */}
          {pendingGroup.length > 0 && (
            <div style={{
              display: 'flex', alignItems: cards ? 'stretch' : 'center', gap: cards ? 12 : 16,
              flexDirection: cards ? 'column' : 'row', flexWrap: cards ? 'nowrap' : 'wrap', marginBottom: 4,
            }}>
              {cards && portasDaFila}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <span style={{ fontSize: letra(FS.small, toque), fontWeight: FW.rotulo, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.second, flexShrink: 0 }}>
                    Ordem
                  </span>
                  <Segmentado
                    rotuloDaLista="Ordem da lista"
                    prefixoDeTestId="toggle-ordem"
                    testId="ordem-da-fila"
                    tamanho={dedo ? "toque" : "sm"}
                    larguraCheia={cards}
                    ativo={ordemPendentes}
                    aoTrocar={(v) => setOrdemPendentes(v as OrdemPendentes)}
                    itens={ORDENS.map(([valor, rotulo, curto]) => ({ id: valor, rotulo: cards ? curto : rotulo, title: rotulo }))}
                    style={{ flex: cards ? '1 1 0%' : undefined, minWidth: 0 }}
                  />
                </div>
                <span data-testid="regra-da-ordem" style={{ fontSize: letra(FS.meta, toque), color: T.second, lineHeight: 1.4 }}>
                  {ORDEM_REGRA[ordemPendentes]}
                </span>
                {explicaAba && (
                  <span data-testid="explica-contagem-da-aba" style={{ fontSize: letra(FS.meta, toque), color: T.second, lineHeight: 1.45 }}>
                    <strong style={{ color: T.text, fontWeight: FW.forte }}>{actionableCount}</strong> {actionableCount === 1 ? 'pede' : 'pedem'} decisão agora (o número da aba) · a fila tem {reviewQueue.length}
                    {comArte > 0 && <>, {comArte === 1 ? '1 com a Arte refazendo' : `${comArte} com a Arte refazendo`}</>}
                    {semDecisaoEmAberto > 0 && <>, {semDecisaoEmAberto === 1 ? '1 sem decisão em aberto' : `${semDecisaoEmAberto} sem decisão em aberto`}</>}
                  </span>
                )}
              </div>
              {!cards && portasDaFila}
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
              isMobile={isMobile}
              dedo={dedo}
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
