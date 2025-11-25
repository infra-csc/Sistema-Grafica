import { useEffect, useRef } from 'react';
import { queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    // Determine WebSocket protocol based on current protocol
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    // Create WebSocket connection
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket connected');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        // Handle different message types
        switch (data.type) {
          case 'connected':
            console.log('WebSocket connection confirmed');
            break;
            
          case 'event_created':
          case 'event_updated':
          case 'event_deleted':
          case 'event_urgent':
            // Invalidate events queries
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
            // Invalidate specific event items query
            if (data.item?.eventId) {
              queryClient.invalidateQueries({ queryKey: ['/api/items', data.item.eventId] });
            }
            toast({
              title: 'Novo item adicionado',
              description: `Item ${data.item?.type} adicionado`,
            });
            break;
            
          case 'item_updated':
            // Invalidate specific event items query
            if (data.item?.eventId) {
              queryClient.invalidateQueries({ queryKey: ['/api/items', data.item.eventId] });
              queryClient.invalidateQueries({ queryKey: ['/api/events', data.item.eventId] });
            }
            // Invalidate global items query (used by Painel Geral)
            queryClient.invalidateQueries({ queryKey: ['/api/items'] });
            queryClient.invalidateQueries({ queryKey: ['/api/events'] });
            break;
            
          case 'item_deleted':
            // Invalidate specific event items query
            if (data.eventId) {
              queryClient.invalidateQueries({ queryKey: ['/api/items', data.eventId] });
              queryClient.invalidateQueries({ queryKey: ['/api/events', data.eventId] });
            }
            queryClient.invalidateQueries({ queryKey: ['/api/events'] });
            break;
            
          case 'items_bulk_created':
            // Invalidate specific event items query
            queryClient.invalidateQueries({ queryKey: ['/api/items/pending'] });
            if (data.eventId) {
              queryClient.invalidateQueries({ queryKey: ['/api/items', data.eventId] });
            }
            toast({
              title: 'Itens adicionados',
              description: `${data.items?.length || 0} itens adicionados ao evento`,
            });
            break;
            
          case 'items_submitted':
            // Invalidate items queries when items are submitted for sponsor linking
            queryClient.invalidateQueries({ queryKey: ['/api/items'] });
            if (data.eventId) {
              queryClient.invalidateQueries({ queryKey: ['/api/items', data.eventId] });
            }
            toast({
              title: 'Itens enviados para vinculação',
              description: `${data.count || 0} itens aguardando vinculação de patrocinadores`,
            });
            break;
            
          case 'item_approved':
            // Invalidate specific queries
            queryClient.invalidateQueries({ queryKey: ['/api/items/pending'] });
            queryClient.invalidateQueries({ queryKey: ['/api/items/approved'] });
            if (data.item?.eventId) {
              queryClient.invalidateQueries({ queryKey: ['/api/items', data.item.eventId] });
              queryClient.invalidateQueries({ queryKey: ['/api/events', data.item.eventId] });
            }
            queryClient.invalidateQueries({ queryKey: ['/api/events'] });
            toast({
              title: 'Item liberado',
              description: `${data.item?.type} aprovado para produção`,
            });
            break;
            
          case 'production_started':
          case 'production_updated':
            // Invalidate specific queries
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
            // Invalidate events and show urgent notification
            queryClient.invalidateQueries({ queryKey: ['/api/events'] });
            toast({
              title: '⚠️ Alerta de Prazo',
              description: `Faltam ${data.hoursRemaining}h para saída - ${data.event?.name}`,
              variant: 'destructive',
            });
            break;
            
          case 'standard_item_created':
            queryClient.invalidateQueries({ queryKey: ['/api/standard-items'] });
            break;
            
          case 'notification_created':
            queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
            break;
            
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
      // Attempt to reconnect after 5 seconds
      setTimeout(() => {
        if (wsRef.current?.readyState === WebSocket.CLOSED) {
          console.log('Attempting to reconnect WebSocket...');
          window.location.reload();
        }
      }, 5000);
    };

    // Cleanup on unmount
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [toast]);

  return wsRef.current;
}
