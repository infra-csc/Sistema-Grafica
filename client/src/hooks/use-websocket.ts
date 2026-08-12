import { useEffect, useRef, useCallback } from 'react';
import { queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

const RECONNECT_BASE_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 30000;

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmountedRef = useRef(false);
  const reconnectAttemptsRef = useRef(0);
  const { toast } = useToast();

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
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        switch (data.type) {
          case 'connected':
            console.log('WebSocket connection confirmed');
            break;

          case 'event_created':
          case 'event_updated':
          case 'event_deleted':
          case 'event_urgent':
            queryClient.invalidateQueries({ queryKey: ['/api/events'] });
            if (data.eventId) {
              queryClient.invalidateQueries({ queryKey: ['/api/events', data.eventId] });
              queryClient.invalidateQueries({ queryKey: ['/api/items', data.eventId] });
            }
            if (data.type === 'event_created') {
              toast({
                title: 'Novo evento criado',
                description: data.event?.name,
              });
            }
            break;

          case 'item_created':
            if (data.item?.eventId) {
              queryClient.invalidateQueries({ queryKey: ['/api/items', data.item.eventId] });
            }
            // Sem esta invalidação o Painel Geral (que lê '/api/items' com
            // staleTime Infinity) só via peças novas no F5 — o "tempo real"
            // valia para update/delete e não para create/approve/produce.
            queryClient.invalidateQueries({ queryKey: ['/api/items'] });
            toast({
              title: 'Novo item adicionado',
              description: `Item ${data.item?.type} adicionado`,
            });
            break;

          case 'item_updated':
            if (data.item?.eventId) {
              queryClient.invalidateQueries({ queryKey: ['/api/items', data.item.eventId] });
              queryClient.invalidateQueries({ queryKey: ['/api/events', data.item.eventId] });
            }
            queryClient.invalidateQueries({ queryKey: ['/api/items'] });
            queryClient.invalidateQueries({ queryKey: ['/api/events'] });
            break;

          case 'item_deleted':
            if (data.eventId) {
              queryClient.invalidateQueries({ queryKey: ['/api/items', data.eventId] });
              queryClient.invalidateQueries({ queryKey: ['/api/events', data.eventId] });
            }
            // Sem estas duas, quando OUTRO usuário excluía uma peça o Painel
            // Geral (que lê '/api/items') continuava mostrando a linha
            // indefinidamente — só a exclusão local invalidava certo.
            queryClient.invalidateQueries({ queryKey: ['/api/items'] });
            queryClient.invalidateQueries({ queryKey: ['/api/items/deleted'] });
            queryClient.invalidateQueries({ queryKey: ['/api/events'] });
            break;

          case 'items_bulk_created':
            queryClient.invalidateQueries({ queryKey: ['/api/items'] });
            queryClient.invalidateQueries({ queryKey: ['/api/items/pending'] });
            if (data.eventId) {
              queryClient.invalidateQueries({ queryKey: ['/api/items', data.eventId] });
            }
            toast({
              title: 'Peças adicionadas',
              description: `${data.items?.length || 0} peças adicionadas ao evento`,
            });
            break;

          case 'items_submitted':
            queryClient.invalidateQueries({ queryKey: ['/api/items'] });
            if (data.eventId) {
              queryClient.invalidateQueries({ queryKey: ['/api/items', data.eventId] });
            }
            toast({
              title: 'Peças enviadas para vinculação',
              description: `${data.count || 0} peças aguardando vinculação de patrocinadores`,
            });
            break;

          case 'item_approved':
            queryClient.invalidateQueries({ queryKey: ['/api/items'] });
            queryClient.invalidateQueries({ queryKey: ['/api/items/pending'] });
            queryClient.invalidateQueries({ queryKey: ['/api/items/approved'] });
            if (data.item?.eventId) {
              queryClient.invalidateQueries({ queryKey: ['/api/items', data.item.eventId] });
              queryClient.invalidateQueries({ queryKey: ['/api/events', data.item.eventId] });
            }
            queryClient.invalidateQueries({ queryKey: ['/api/events'] });
            toast({
              title: 'Peça liberada',
              description: `${data.item?.type} aprovada para produção`,
            });
            break;

          case 'production_started':
          case 'production_updated':
            queryClient.invalidateQueries({ queryKey: ['/api/items'] });
            queryClient.invalidateQueries({ queryKey: ['/api/items/approved'] });
            if (data.item?.eventId) {
              queryClient.invalidateQueries({ queryKey: ['/api/items', data.item.eventId] });
              queryClient.invalidateQueries({ queryKey: ['/api/events', data.item.eventId] });
            }
            queryClient.invalidateQueries({ queryKey: ['/api/events'] });
            toast({
              title: data.type === 'production_started' ? 'Produção iniciada' : 'Produção atualizada',
              description: `Item ${data.item?.type} atualizado`,
            });
            break;

          case 'deadline_alert':
            queryClient.invalidateQueries({ queryKey: ['/api/events'] });
            toast({
              title: '⚠️ Alerta de Prazo',
              description: `Faltam ${data.hoursRemaining}h para saída - ${data.event?.name}`,
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

          case 'notification_created':
          case 'notification_read':
            queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
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
  }, [toast]);

  useEffect(() => {
    unmountedRef.current = false;
    connect();

    return () => {
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
