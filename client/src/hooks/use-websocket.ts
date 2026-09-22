import { useEffect, useRef, useCallback } from 'react';
import type { Query } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { chavesDaMensagem, CHAVE_MAQUINAS, CHAVE_RELATORIO_DE_MAQUINAS } from '@/lib/tempo-real-grafica';

const RECONNECT_BASE_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 30000;
// Coalescer das chaves pesadas (ver invalidateCoalesced): janela de silêncio e
// teto de espera desde a primeira mensagem da rajada.
const COALESCER_JANELA_MS = 500;
const COALESCER_TETO_MS = 2000;

// Timer do debounce da invalidação de /api/prazos (escopo de módulo: o hook
// é um singleton por aba — ver AuthenticatedLayout).
let prazosInvalidateTimer: ReturnType<typeof setTimeout> | null = null;

// Assinantes avisados a cada invalidação de /api/prazos vinda de MENSAGEM do
// WebSocket. Existe para a Gestão de Prazos poder mostrar "N mudanças desde
// que você abriu": o debounce de 500ms revalidava a tela de forma
// completamente invisível, e o diretor lia números novos sem saber que o chão
// tinha se movido. A revalidação da RECONEXÃO (onopen) de propósito não
// notifica — ali não chegou notícia nenhuma, só se confirmou o que já havia.
const prazosListeners = new Set<() => void>();

/** Assina o sinal de "chegou mudança de prazos". Devolve o cancelador. */
export function onPrazosInvalidated(fn: () => void): () => void {
  prazosListeners.add(fn);
  return () => { prazosListeners.delete(fn); };
}

// Mesmo debounce para a trilha de auditoria. O Histórico é a única tela que
// consome a listagem COMPLETA de /api/audit-logs e ele não faz mutação nenhuma
// — quem só consulta nunca invalidava o cache, e com o staleTime Infinity do
// app a tela congelava no primeiro fetch. O caminho de falha era o do sino:
// notificação chega, o usuário clica "Ver todas" e o registro que gerou a
// notificação não está na lista.
let auditInvalidateTimer: ReturnType<typeof setTimeout> | null = null;

// ── SINAL DE CONEXÃO (UX, 15/09) ─────────────────────────────────────────────
// O socket caía (servidor reiniciando, Wi-Fi do galpão) e a tela seguia
// desenhando o cache como se estivesse ao vivo: o operador olhava uma fila
// parada achando que ninguém tinha mexido. Este sinal só INFORMA — a casca
// (App.tsx) decide mostrar o aviso depois de alguns segundos fora, para uma
// reconexão rápida não piscar faixa nenhuma. Nada de dado muda por aqui.
let conectadoAgora = true;
const conexaoListeners = new Set<(conectado: boolean) => void>();

/** Assina mudanças de conexão do tempo real. Devolve o cancelador. */
export function onConexaoTempoReal(fn: (conectado: boolean) => void): () => void {
  conexaoListeners.add(fn);
  fn(conectadoAgora);
  return () => { conexaoListeners.delete(fn); };
}

function avisarConexao(conectado: boolean) {
  if (conectadoAgora === conectado) return;
  conectadoAgora = conectado;
  conexaoListeners.forEach((fn) => fn(conectado));
}

// ── INVALIDAÇÃO DURANTE A PRIMEIRA CARGA (17/09) ─────────────────────────────
// No React Query 5.60, invalidar uma chave SEM dado e JÁ buscando não começa
// busca nova: reaproveita a promessa em voo, e o sucesso dela zera
// `isInvalidated`. Ou seja, a mudança de outra pessoa que chega (ou a conexão
// que abre) enquanto a tela ainda faz a primeira carga era descartada — e a
// busca em voo pode ter saído do servidor ANTES da mudança. Para essas
// chaves, a invalidação é repetida UMA vez quando a carga termina bem.
// Chave por queryHash: duas mensagens na mesma carga não empilham assinaturas.
const aguardandoPrimeiraCarga = new Map<string, () => void>();

function revalidarAoFimDaPrimeiraCarga(query: Query): void {
  if (aguardandoPrimeiraCarga.has(query.queryHash)) return;
  const cache = queryClient.getQueryCache();
  const soltar = () => {
    cancelar();
    if (aguardandoPrimeiraCarga.get(query.queryHash) === soltar) aguardandoPrimeiraCarga.delete(query.queryHash);
  };
  const cancelar = cache.subscribe((evento) => {
    if (evento.query !== query) return;
    if (evento.type === "removed") { soltar(); return; }
    if (evento.type !== "updated") return;
    if (evento.action.type === "error") { soltar(); return; }
    if (evento.action.type !== "success") return;
    soltar();
    // Fora do dispatch do próprio sucesso: a busca que acabou ainda está
    // se desmontando dentro do React Query.
    setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: query.queryKey, exact: true });
    }, 0);
  });
  aguardandoPrimeiraCarga.set(query.queryHash, soltar);
}

/** invalidateQueries que não perde a chave em primeira carga (ver acima). */
function invalidarSemPerderCargaEmVoo(queryKey: readonly unknown[], predicate?: (q: Query) => boolean): void {
  for (const q of queryClient.getQueryCache().findAll({ queryKey })) {
    if (q.state.data === undefined && q.state.fetchStatus === "fetching") revalidarAoFimDaPrimeiraCarga(q);
  }
  queryClient.invalidateQueries({ queryKey, predicate });
}

/** Desmontagem do hook: nenhuma assinatura fica pendurada no queryCache. */
function soltarPrimeirasCargas(): void {
  Array.from(aguardandoPrimeiraCarga.values()).forEach((soltar) => soltar());
}

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmountedRef = useRef(false);
  const reconnectAttemptsRef = useRef(0);
  // "Já abriu uma vez" — sobrevive aos reconnects (é do hook montado, não do
  // socket). Ver ws.onopen.
  const jaConectouRef = useRef(false);
  const { toast } = useToast();

  // ── COALESCING DAS CHAVES PESADAS (auditoria 27/08) ───────────────────────
  // '/api/items' devolve o acervo INTEIRO (MBs) e '/api/events' reagrega tudo.
  // Invalidar por mensagem transformava uma rajada de lote (30+ broadcasts em
  // 1-2s) em 30 re-downloads completos POR ABA — o maior custo de rede do app.
  // Cada mensagem agora só REGISTRA as chaves; um único timer de 500ms (a
  // mesma janela dos blocos de prazos/audit-logs abaixo) invalida cada chave
  // UMA vez ao fim da rajada. O "tempo real" fica meio segundo atrás — nada
  // que uma tela do app distinga; o dado final é o mesmo.
  //
  // TETO DA RAJADA (PERFORMANCE, 17/09): o timer era reiniciado a CADA
  // mensagem. Com gente trabalhando em várias abas ao mesmo tempo (ou um lote
  // que emite por peça), a rajada nunca "acabava" e a tela não se atualizava
  // enquanto houvesse movimento — e, quando atualizava, era tudo de uma vez.
  // Agora a janela continua 500ms, mas nenhuma mudança espera mais que 2s
  // desde a primeira mensagem pendente. As listas de peças buscam por delta
  // (lib/queryClient.ts), então invalidar mais vezes custa KBs, não MBs.
  const pesadasPendentesRef = useRef<Set<string>>(new Set());
  const pesadasTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rajadaDesdeRef = useRef(0);
  const invalidateCoalesced = useCallback((...keyParts: string[]) => {
    pesadasPendentesRef.current.add(JSON.stringify(keyParts));
    const agora = Date.now();
    if (pesadasTimerRef.current) {
      // Rajada já no teto: o timer armado dispara no prazo, com esta chave junto.
      if (agora - rajadaDesdeRef.current >= COALESCER_TETO_MS - COALESCER_JANELA_MS) return;
      clearTimeout(pesadasTimerRef.current);
    } else {
      rajadaDesdeRef.current = agora;
    }
    const espera = Math.min(COALESCER_JANELA_MS, Math.max(0, rajadaDesdeRef.current + COALESCER_TETO_MS - agora));
    pesadasTimerRef.current = setTimeout(() => {
      pesadasTimerRef.current = null;
      const chaves = Array.from(pesadasPendentesRef.current, (s) => JSON.parse(s) as string[]);
      pesadasPendentesRef.current.clear();
      for (const queryKey of chaves) invalidarSemPerderCargaEmVoo(queryKey);
    }, espera);
  }, []);

  const connect = useCallback(() => {
    if (unmountedRef.current) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host || window.location.hostname;
    const wsUrl = `${protocol}//${host}/ws`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket connected');
      reconnectAttemptsRef.current = 0;
      avisarConexao(true);
      // PRIMEIRA CONEXÃO NÃO É RECONEXÃO (perf, 17/09). A revalidação abaixo
      // cura o BURACO de uma queda — mas rodava também na primeira abertura,
      // logo depois de a tela carregar, e as mesmas chaves que a tela tinha
      // acabado de buscar saíam de novo (medido: /api/notifications 2× em
      // 700 ms; /api/events e a lista de peças também dobravam). Na primeira
      // conexão só revalida o que chegou ANTES de o socket ABRIR: até o
      // onopen o servidor não conhecia este socket, e o broadcast de uma
      // mudança nesse meio tempo não chegou a ninguém aqui. (A régua era a
      // CRIAÇÃO do socket — o dado que chegava entre criar e abrir ficava sem
      // cura.) A carga que ainda está em voo na abertura também saiu antes do
      // socket: revalida UMA vez quando terminar (ver invalidarSemPerderCargaEmVoo).
      const primeiraConexao = !jaConectouRef.current;
      jaConectouRef.current = true;
      if (primeiraConexao) {
        const abertoEm = Date.now();
        const antesDeAbrir = (q: Query) =>
          q.state.dataUpdatedAt > 0 && q.state.dataUpdatedAt < abertoEm;
        for (const chave of ['/api/prazos', '/api/audit-logs', '/api/items', '/api/items/approved', CHAVE_MAQUINAS, CHAVE_RELATORIO_DE_MAQUINAS, '/api/events', '/api/notifications']) {
          invalidarSemPerderCargaEmVoo([chave], antesDeAbrir);
        }
        return;
      }
      // Reconectar significa que houve um buraco: enquanto o socket esteve
      // fora, toda mutação de outro usuário passou sem invalidar nada. Sem
      // esta linha o painel do diretor servia o agregado de antes da queda —
      // errado com cara de certo, que é o pior modo de falha de um painel.
      invalidarSemPerderCargaEmVoo(['/api/prazos']);
      // Mesmo buraco, mesma cura, para a trilha de auditoria: enquanto o socket
      // esteve fora, toda ação de outro usuário passou sem invalidar nada.
      invalidarSemPerderCargaEmVoo(['/api/audit-logs']);
      // ...e para as três chaves que sustentam as telas de trabalho. Só
      // '/api/prazos' era revalidado, então TODA mutação ocorrida durante a
      // queda ficava invisível no Painel Geral ('/api/items'), na Gráfica
      // ('/api/items/approved', prefixo próprio — ver item_updated abaixo) e no
      // sino ('/api/notifications'). Com staleTime Infinity o cache não expira
      // sozinho: sem estas linhas só o F5 corrigia.
      // Pelo coalescer: reconexão seguida de rajada re-baixa cada chave UMA vez.
      invalidateCoalesced('/api/items');
      invalidateCoalesced('/api/items/approved');
      // A aba Máquinas também: a queda passou sem invalidar o retrato dela, e
      // as duas telas ficavam dizendo coisas diferentes da mesma impressora.
      invalidateCoalesced(CHAVE_MAQUINAS);
      invalidateCoalesced(CHAVE_RELATORIO_DE_MAQUINAS);
      invalidateCoalesced('/api/events');
      invalidateCoalesced('/api/notifications');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        // Gestão de Prazos deriva de eventos+itens: qualquer mutação nesses
        // domínios invalida '/api/prazos' — com o staleTime Infinity padrão,
        // sem isto a tela do diretor congelava no primeiro carregamento.
        // Debounce de 500ms: o GET reagrega o app inteiro; numa rajada de
        // operação (lote de 30 peças) uma invalidação basta, não trinta.
        //
        // `prazo_` no regex: o broadcast da cobrança não casava com a lista
        // antiga, então a cobrança registrada por um diretor nunca aparecia na
        // aba do outro — e dois gestores ligavam para o mesmo responsável no
        // mesmo dia.
        if (/^(event_|item|production_|deadline_alert|prazo_)/.test(data.type)) {
          if (prazosInvalidateTimer) clearTimeout(prazosInvalidateTimer);
          prazosInvalidateTimer = setTimeout(() => {
            prazosInvalidateTimer = null;
            queryClient.invalidateQueries({ queryKey: ['/api/prazos'] });
            prazosListeners.forEach((fn) => fn());
          }, 500);
        }

        // Trilha de auditoria: mesma janela de 500ms, regex mais estreita de
        // propósito — só mutação de evento/peça/produção grava audit log.
        // `deadline_alert` e `prazo_` não gravam nada, e contá-los faria o
        // Histórico anunciar "novas atividades" que não existem.
        if (/^(event_|item|production_)/.test(data.type)) {
          if (auditInvalidateTimer) clearTimeout(auditInvalidateTimer);
          auditInvalidateTimer = setTimeout(() => {
            auditInvalidateTimer = null;
            queryClient.invalidateQueries({ queryKey: ['/api/audit-logs'] });
          }, 500);
        }

        // O QUE CADA MENSAGEM INVALIDA mora num mapa testado
        // (lib/tempo-real-grafica.ts): cada `case` listava as chaves à mão e
        // foi assim que a peça liberada, a devolvida em lote e a excluída
        // chegavam à fila da Gráfica e não à aba Máquinas (ou vice-versa).
        // Tudo passa pelo coalescer — os prefixos cobrem as chaves por id.
        for (const chave of chavesDaMensagem(data)) invalidateCoalesced(...chave);

        switch (data.type) {
          case 'connected':
            console.log('WebSocket connection confirmed');
            break;

          case 'event_created':
            toast({
              title: 'Novo evento criado',
              description: data.event?.name,
            });
            break;

          // Encerrar/reabrir muda o que TODA aba vê: o evento sai (ou volta
          // para) a Gestão de Prazos e as filas — as FILAS DE TRABALHO leem
          // `item.event.status` do payload de PEÇAS, por isso o mapa invalida
          // '/api/items' e a fila da Gráfica junto. Sem toast para
          // closed/reopened: quem clicou já recebeu o feedback da própria
          // mutation, e o eco do broadcast viraria aviso dobrado.
          case 'event_updated':
          case 'event_deleted':
          case 'event_urgent':
          case 'event_closed':
          case 'event_reopened':
            break;

          case 'item_created':
            // Sem o tipo no payload a frase virava "Item undefined adicionado".
            toast({
              title: 'Nova peça adicionada',
              description: data.item?.type ? `Peça ${data.item.type} entrou na lista.` : undefined,
            });
            break;

          // item_updated é o broadcast de /confer, /mark-reuse, /correct-reuse,
          // da reserva de impressora e do tirar/trocar em Máquinas; a entrega,
          // a exclusão e os lotes também mexem em peça que as duas telas
          // mostram. Sem toast: quem agiu já recebeu o feedback local.
          case 'item_updated':
          case 'item_delivered':
          case 'items_book_updated':
          case 'item_deleted':
          case 'items_bulk_updated':
          case 'tubos_atualizados':
            break;

          case 'items_bulk_created':
            toast({
              title: 'Peças adicionadas',
              description: (data.items?.length || 0) === 1
                ? '1 peça adicionada ao evento'
                : `${data.items?.length || 0} peças adicionadas ao evento`,
            });
            break;

          case 'items_submitted':
            toast({
              title: 'Peças enviadas para vinculação',
              description: (data.count || 0) === 1
                ? '1 peça aguardando vinculação de patrocinadores'
                : `${data.count || 0} peças aguardando vinculação de patrocinadores`,
            });
            break;

          case 'item_approved':
            toast({
              title: 'Peça liberada',
              description: data.item?.type ? `Peça ${data.item.type} aprovada para produção` : 'Aprovada para produção',
            });
            break;

          case 'production_started':
          case 'production_updated':
            // SEM toast (revisão adversarial, 22/09): o servidor manda
            // `production_started` a cada lançamento de impressas — no galpão
            // era "Impressão iniciada" pipocando na tela de TODO mundo o dia
            // inteiro, inclusive para quem nem lida com impressão. As chaves
            // já foram invalidadas acima (chavesDaMensagem); quem fez o gesto
            // recebe o próprio toast da mutation, com a frase certa.
            break;

          case 'deadline_alert':
            toast({
              // Sem emoji: o toast de erro já traz ícone e cor de alerta, e o
              // emoji renderizava diferente em cada sistema operacional.
              title: 'Prazo perto do fim',
              description: data.event?.name
                ? `Faltam ${data.hoursRemaining}h para a saída · ${data.event.name}`
                : `Faltam ${data.hoursRemaining}h para a saída`,
              variant: 'destructive',
            });
            break;

          case 'inventory_awaiting_triage':
            queryClient.invalidateQueries({ queryKey: ['/api/inventory/awaiting-triage'] });
            queryClient.invalidateQueries({ queryKey: ['/api/inventory'] });
            toast({
              title: 'Material aguarda triagem',
              description: data.message || `Materiais do evento retornaram e aguardam triagem.`,
            });
            break;

          case 'inventory_in_use':
            queryClient.invalidateQueries({ queryKey: ['/api/inventory'] });
            break;

          case 'inventory_triaged':
            queryClient.invalidateQueries({ queryKey: ['/api/inventory/awaiting-triage'] });
            queryClient.invalidateQueries({ queryKey: ['/api/inventory'] });
            break;

          case 'standard_item_created':
            queryClient.invalidateQueries({ queryKey: ['/api/standard-items'] });
            break;

          // ── Patrocinadores ──
          // Quem cadastrava um patrocinador numa aba não o encontrava no
          // seletor da outra; '/api/sponsors/usage' é a contagem ao lado de
          // cada nome — ficar defasada é o que faz alguém excluir um
          // patrocinador achando que ele não é usado por ninguém. O vínculo
          // peça↔patrocinador também muda a linha da Gráfica e o cartão de
          // Máquinas (o apoio). As chaves estão no mapa.
          case 'sponsor_created':
          case 'sponsor_updated':
          case 'sponsor_deleted':
          case 'item_sponsor_added':
          case 'item_sponsor_removed':
          case 'event_sponsor_updated':
          case 'event_sponsor_removed':
            break;

          case 'pedidos_de_peca':
            // Pedidos de peça do Atendimento (14/09): a aba do Atendimento,
            // o selo de Eventos e o painel do evento leem chaves com filtro
            // na URL — invalida todas pelo prefixo.
            queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0] ?? '').startsWith('/api/pedidos-de-peca') });
            break;

          case 'consultas_de_estoque':
            // Consulta de estoque da Revisão Final (21/09): a caixa da Gráfica,
            // o número do menu, a ficha da peça e o aviso na fila leem chaves
            // diferentes: "/api/consultas-de-estoque…" e, na ficha,
            // ["/api/items", id, "consulta-de-estoque"].
            queryClient.invalidateQueries({
              predicate: (q) =>
                String(q.queryKey[0] ?? '').startsWith('/api/consultas-de-estoque')
                || q.queryKey.includes('consulta-de-estoque'),
            });
            break;

          case 'notification_created':
          case 'notification_read':
            break;

          case 'prazo_cobranca':
            // A invalidação de '/api/prazos' já aconteceu no bloco acima (com
            // debounce). O case existe para não cair no `default` e poluir o
            // console com "Unknown WebSocket message type" a cada cobrança.
            break;

          default:
            console.log('Unknown WebSocket message type:', data.type);
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
      if (unmountedRef.current) return;
      avisarConexao(false);

      // Exponential backoff: 1s, 2s, 4s, 8s, 16s, capped at 30s. Resets to 0
      // as soon as a connection is successfully (re)established in onopen.
      const attempt = reconnectAttemptsRef.current;
      const delay = Math.min(RECONNECT_BASE_DELAY_MS * 2 ** attempt, RECONNECT_MAX_DELAY_MS);
      reconnectAttemptsRef.current = attempt + 1;

      reconnectTimerRef.current = setTimeout(() => {
        if (!unmountedRef.current) {
          console.log(`Reconnecting WebSocket... (attempt ${attempt + 1}, delay ${delay}ms)`);
          connect();
        }
      }, delay);
    };
  }, [toast, invalidateCoalesced]);

  useEffect(() => {
    unmountedRef.current = false;
    connect();

    // A internet voltou: reconecta já, em vez de esperar o backoff (até 30s),
    // durante o qual a faixa "Reconectando…" seguia na tela à toa.
    const aoVoltarInternet = () => {
      const estado = wsRef.current?.readyState;
      if (estado === WebSocket.OPEN || estado === WebSocket.CONNECTING) return;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      reconnectAttemptsRef.current = 0;
      connect();
    };
    window.addEventListener("online", aoVoltarInternet);

    return () => {
      window.removeEventListener("online", aoVoltarInternet);
      soltarPrimeirasCargas();
      unmountedRef.current = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  return wsRef.current;
}
