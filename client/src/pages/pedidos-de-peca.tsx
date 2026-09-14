// ─────────────────────────────────────────────────────────────────────────────
// PEDIDOS DE PEÇAS — o lugar único dos pedidos (dono, 14/09).
//
// "Deixa tudo aqui e tira do Atendimento: eles solicitam, e o usuário de
// Solicitação verifica por aqui e pelos eventos." Todos os pedidos, de todos
// os eventos. O Atendimento pede e acompanha; a Solicitação cria a peça
// (abre o evento com o formulário preenchido), recusa ou desfaz. Clicar num
// pedido abre o detalhe com o histórico.
// ─────────────────────────────────────────────────────────────────────────────
import { useAuth } from "@/contexts/auth-context";
import { useIsMobile } from "@/hooks/use-mobile";
import { T, FS } from "@/lib/theme";
import { ListaDePedidos } from "@/components/pedidos/lista-de-pedidos";

export default function PedidosDePecaPagina() {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const papel = user?.role;
  const podePedir = papel === "admin" || papel === "atendimento";
  const podeResolver = papel === "admin" || papel === "solicitacao";
  const explicacao = podeResolver && !podePedir
    ? "O que o Atendimento pediu para entrar na lista. “Criar peça” abre o evento com o formulário preenchido — a peça sai ligada ao pedido e quem pediu é avisado."
    : podePedir && !podeResolver
      ? "Peça a quem monta a lista as peças que faltam nos eventos e acompanhe cada pedido até a entrega."
      : "Os pedidos de peça do Atendimento: quem pede acompanha aqui, quem monta a lista cria a peça a partir do pedido.";
  return (
    <div style={{ padding: isMobile ? "16px" : "28px 32px", background: "#fafaf9", minHeight: "100%", boxSizing: "border-box" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
        <header>
          <h1 data-testid="title-pedidos-de-peca" style={{ margin: 0, fontSize: isMobile ? 22 : 26, fontWeight: 800, color: T.text, letterSpacing: "-0.02em" }}>
            Pedidos de peças
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: FS.body, color: "#57534e", maxWidth: 680, lineHeight: 1.5 }}>{explicacao}</p>
        </header>
        <ListaDePedidos podePedir={podePedir} podeResolver={podeResolver} userId={user?.id ?? null} />
      </div>
    </div>
  );
}
