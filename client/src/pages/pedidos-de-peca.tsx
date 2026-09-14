// ─────────────────────────────────────────────────────────────────────────────
// PEDIDOS DE PEÇAS — a caixa da Solicitação (dono, 14/09).
//
// Todos os pedidos do Atendimento, de todos os eventos, num lugar só — por
// prazo mais próximo. "Criar peça" leva ao evento com o formulário já aberto
// e preenchido; a peça sai ligada ao pedido.
// ─────────────────────────────────────────────────────────────────────────────
import { useAuth } from "@/contexts/auth-context";
import { useIsMobile } from "@/hooks/use-mobile";
import { T, FS } from "@/lib/theme";
import { ListaDePedidos } from "@/components/pedidos/lista-de-pedidos";

export default function PedidosDePecaPagina() {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const podeResolver = user?.role === "admin" || user?.role === "solicitacao";
  return (
    <div style={{ padding: isMobile ? "16px" : "28px 32px", background: "#fafaf9", minHeight: "100%", boxSizing: "border-box" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
        <header>
          <h1 data-testid="title-pedidos-de-peca" style={{ margin: 0, fontSize: isMobile ? 22 : 26, fontWeight: 800, color: T.text, letterSpacing: "-0.02em" }}>
            Pedidos de peças
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: FS.body, color: "#57534e", maxWidth: 640, lineHeight: 1.5 }}>
            O que o Atendimento pediu para entrar na lista. “Criar peça” abre o evento com o formulário preenchido — a peça sai ligada ao pedido e quem pediu é avisado.
          </p>
        </header>
        <ListaDePedidos modo="solicitacao" podePedir={false} podeResolver={podeResolver} userId={user?.id ?? null} />
      </div>
    </div>
  );
}
