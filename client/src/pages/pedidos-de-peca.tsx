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
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { StatusDaSolicitacao } from "@shared/pedidos-de-peca";
import { useAuth } from "@/contexts/auth-context";
import { useIsMobile } from "@/hooks/use-mobile";
import { T, FS, R } from "@/lib/theme";
import { ListaDePedidos } from "@/components/pedidos/lista-de-pedidos";
import { EstadoDoPedido, SIGNIFICADO_DO_PEDIDO } from "@/components/pedidos/ui";

const ORDEM_DOS_STATUS: StatusDaSolicitacao[] = ["aberto", "parcial", "atendido", "recusado", "cancelado"];

/**
 * COMO FUNCIONA — fechado por padrão. Primeiro uso perguntava três coisas que
 * a tela não respondia: quem pede e quem atende, o que cada status quer dizer,
 * e por que "Solicitação" é ao mesmo tempo o nome do pedido e o de um perfil.
 * Fechado, custa uma linha para quem já sabe; aberto, responde as três sem
 * sair da tela. `<details>` nativo: teclado, leitor de tela e estado aberto
 * de graça. A seta vira sem transição — nada a respeitar em
 * prefers-reduced-motion — e o estado vem do `onToggle`, sem folha de estilo.
 */
function ComoFunciona({ podePedir, podeResolver }: { podePedir: boolean; podeResolver: boolean }) {
  const [aberto, setAberto] = useState(false);
  const passo: React.CSSProperties = { margin: 0, fontSize: FS.body, color: "#44403c", lineHeight: 1.5 };
  return (
    <details data-testid="como-funciona-pedidos" onToggle={(e) => setAberto((e.currentTarget as HTMLDetailsElement).open)} style={{ background: "#ffffff", border: "1px solid #e7e5e4", borderRadius: R.lg, padding: "0 16px" }}>
      <summary style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 44, cursor: "pointer", fontSize: FS.body, fontWeight: 700, color: T.text, listStyle: "none" }}>
        <ChevronDown size={15} aria-hidden="true" style={{ flexShrink: 0, transform: aberto ? "none" : "rotate(-90deg)" }} />
        Como funciona: quem pede, quem atende e o que cada status quer dizer
      </summary>
      <div style={{ display: "grid", gap: 14, padding: "4px 0 16px", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <p style={passo}><strong>1. Quem pede:</strong> o Atendimento{podePedir && !podeResolver ? " (você)" : ""}, com “Nova solicitação” — várias peças de uma vez, cada uma com evento, patrocinadores e prazo.</p>
          <p style={passo}><strong>2. Quem atende:</strong> quem monta a lista — o perfil <em>Solicitação</em>{podeResolver && !podePedir ? " (você)" : ""}. “Criar peça” abre o evento com o formulário já preenchido; ou recusa, com motivo.</p>
          <p style={passo}><strong>3. Depois:</strong> a peça criada segue o caminho normal (vinculação de patrocinadores → Arte → aprovação → Revisão → Gráfica) e o andamento aparece na própria solicitação.</p>
          <p style={{ ...passo, color: "#57534e" }}>Errou? Cancele enquanto a peça está aberta. Depois de atendida ela já existe no evento e não se cancela por aqui — peça um ajuste.</p>
        </div>
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
          {ORDEM_DOS_STATUS.map((s) => (
            <li key={s} style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: FS.body, color: "#44403c", lineHeight: 1.45 }}>
              <EstadoDoPedido status={s} />
              <span>{SIGNIFICADO_DO_PEDIDO[s]}</span>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}

export default function PedidosDePecaPagina() {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const papel = user?.role;
  const podePedir = papel === "admin" || papel === "atendimento";
  const podeResolver = papel === "admin" || papel === "solicitacao";
  const explicacao = podeResolver && !podePedir
    ? "O que o Atendimento pediu para entrar na lista. “Criar peça” abre o evento com o formulário preenchido — a peça sai ligada à solicitação e quem pediu é avisado."
    : podePedir && !podeResolver
      ? "Peça a quem monta a lista as peças que faltam nos eventos — várias numa solicitação só — e acompanhe cada uma até a entrega."
      : "As solicitações de peça do Atendimento: quem pede acompanha aqui, quem monta a lista cria a peça a partir da solicitação.";
  return (
    <div style={{ padding: isMobile ? "16px" : "28px 32px", background: "#fafaf9", minHeight: "100%", boxSizing: "border-box" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
        <header>
          <h1 data-testid="title-pedidos-de-peca" style={{ margin: 0, fontFamily: "'Space Grotesk', sans-serif", fontSize: isMobile ? 22 : FS.h1, fontWeight: 700, color: T.text, letterSpacing: "-0.03em", lineHeight: 1.1 }}>
            Solicitação de peças
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: FS.body, color: "#57534e", maxWidth: 680, lineHeight: 1.5 }}>{explicacao}</p>
        </header>
        <ComoFunciona podePedir={podePedir} podeResolver={podeResolver} />
        <ListaDePedidos podePedir={podePedir} podeResolver={podeResolver} />
      </div>
    </div>
  );
}
