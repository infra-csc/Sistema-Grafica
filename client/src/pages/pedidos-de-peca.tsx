// ─────────────────────────────────────────────────────────────────────────────
// SOLICITAÇÃO DE PEÇAS — o lugar único das solicitações (dono, 14/09).
//
// "Deixa tudo aqui e tira do Atendimento: eles solicitam, e o usuário de
// Solicitação verifica por aqui e pelos eventos." A Solicitação e o admin
// veem todas; cada pessoa do Atendimento vê sempre só as que ela criou. Uma
// solicitação tem várias peças, cada uma com status próprio. A Solicitação
// cria a peça (abre o evento com o formulário preenchido) ou recusa. Clicar
// numa solicitação abre o detalhe com o histórico.
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
    ? "O que o Atendimento solicitou para entrar na lista. “Criar peça” abre o evento com o formulário preenchido — a peça sai ligada à solicitação e quem solicitou é avisado."
    : podePedir && !podeResolver
      ? "Solicite a quem monta a lista as peças que faltam nos eventos — várias numa solicitação só — e acompanhe cada uma até a entrega. Errou? Cancele enquanto está aberta e crie outra; depois de atendida, peça um ajuste."
      : "As solicitações de peça do Atendimento: quem solicita acompanha aqui, quem monta a lista cria a peça a partir da solicitação.";
  return (
    <div style={{ padding: isMobile ? "16px" : "28px 32px", background: "#fafaf9", minHeight: "100%", boxSizing: "border-box" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
        <header>
          <h1 data-testid="title-pedidos-de-peca" style={{ margin: 0, fontSize: isMobile ? 22 : 26, fontWeight: 800, color: T.text, letterSpacing: "-0.02em" }}>
            Solicitação de peças
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: FS.body, color: "#57534e", maxWidth: 680, lineHeight: 1.5 }}>{explicacao}</p>
        </header>
        <ListaDePedidos podePedir={podePedir} podeResolver={podeResolver} />
      </div>
    </div>
  );
}
