// ─────────────────────────────────────────────────────────────────────────────
// PEDIDOS DE PEÇAS — a aba do Atendimento (dono, 14/09).
//
// A lista, o formulário (gaveta) e as ações moram em components/pedidos/:
// a mesma lista serve a caixa da Solicitação, com as ações de quem resolve.
// ─────────────────────────────────────────────────────────────────────────────
import { ListaDePedidos } from "@/components/pedidos/lista-de-pedidos";

export { invalidarPedidos } from "@/components/pedidos/ui";

export function PedidosDePecaAtendimento({ podePedir, userId }: {
  /** atendimento | admin — a régua do servidor. */
  podePedir: boolean;
  userId: string | null;
  isAdmin?: boolean;
}) {
  return <ListaDePedidos modo="atendimento" podePedir={podePedir} podeResolver={false} userId={userId} titulo />;
}
