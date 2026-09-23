import { Inbox } from "lucide-react";
import { TOM } from "@/lib/theme";

/** Selo de pedidos do Atendimento em aberto (dono, 14/09) — cartão e linha. */
export function SeloDePedidos({ n, eventId }: { n: number; eventId: string }) {
  if (n <= 0) return null;
  return (
    <span
      data-testid={`selo-pedidos-${eventId}`}
      title={`${n} ${n === 1 ? "peça solicitada pelo Atendimento esperando" : "peças solicitadas pelo Atendimento esperando"} a lista`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 800, color: TOM.alerta.text, backgroundColor: TOM.alerta.bg, border: `1px solid ${TOM.alerta.border}`, borderRadius: 999, padding: '2px 8px', whiteSpace: 'nowrap', flexShrink: 0 }}
    >
      <Inbox style={{ width: 11, height: 11 }} aria-hidden="true" />
      {n} {n === 1 ? 'peça solicitada' : 'peças solicitadas'}
    </span>
  );
}
