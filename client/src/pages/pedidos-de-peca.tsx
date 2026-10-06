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
import { HelpCircle, X } from "lucide-react";
import type { StatusDaSolicitacao } from "@shared/pedidos-de-peca";
import { useAuth } from "@/contexts/auth-context";
import { useIsMobile } from "@/hooks/use-mobile";
import { T, FS, R, FW, FONT, SHADOW } from "@/lib/theme";
import { Botao } from "@/components/ui/botao";
import { CabecalhoDaPagina } from "@/components/ui/cabecalho-da-pagina";
import { ListaDePedidos } from "@/components/pedidos/lista-de-pedidos";
import { EstadoDoPedido, SIGNIFICADO_DO_PEDIDO } from "@/components/pedidos/ui";

const ORDEM_DOS_STATUS: StatusDaSolicitacao[] = ["aberto", "parcial", "atendido", "recusado", "cancelado"];

/**
 * COMO FUNCIONA — fechado por padrão. Primeiro uso perguntava três coisas que
 * a tela não respondia: quem pede e quem atende, o que cada status quer dizer,
 * e por que "Solicitação" é ao mesmo tempo o nome do pedido e o de um perfil.
 *
 * Era uma barra de largura cheia, com borda, entre o título e a lista — a
 * segunda coisa mais pesada da tela para quem já sabe tudo. Virou um botão
 * no cabeçalho (aria-expanded) que abre um painel logo abaixo: quem já sabe
 * não paga nada; quem não sabe acha a pergunta onde se procura ajuda. Os três
 * passos viram uma sequência numerada (o número diz "é uma ordem" sem ler) e
 * os status, a legenda dos mesmos selos que a lista usa.
 */
function ComoFunciona({ podePedir, podeResolver, onFechar }: { podePedir: boolean; podeResolver: boolean; onFechar: () => void }) {
  const isMobile = useIsMobile();
  const passos: Array<{ titulo: string; texto: React.ReactNode }> = [
    { titulo: `Quem pede${podePedir && !podeResolver ? " (você)" : ""}`, texto: <>o Atendimento, em “Nova solicitação”: várias peças de uma vez, cada uma com evento, patrocinadores e prazo.</> },
    { titulo: `Quem atende${podeResolver && !podePedir ? " (você)" : ""}`, texto: <>quem monta a lista — o perfil <em>Solicitação</em>. “Criar peça” abre o evento com o formulário já preenchido; ou recusa, com motivo.</> },
    { titulo: "Depois", texto: <>a peça criada segue o caminho normal (vinculação de patrocinadores → Arte → aprovação → Revisão → Gráfica) e o andamento aparece na própria solicitação.</> },
  ];
  return (
    <section id="painel-como-funciona" data-testid="como-funciona-pedidos" aria-labelledby="titulo-como-funciona" className="ped-surge"
      style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: R.lg, boxShadow: SHADOW.sm, padding: isMobile ? "14px 16px 18px" : "16px 24px 22px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
        <h2 id="titulo-como-funciona" style={{ margin: 0, fontFamily: FONT.display, fontSize: FS.strong, fontWeight: FW.forte, color: T.text, letterSpacing: "-0.01em" }}>
          Como funciona
        </h2>
        <Botao variante="fantasma" tamanho={isMobile ? "toque" : "md"} icone={X} tamanhoDoIcone={16} aria-label="Fechar o “Como funciona”" data-testid="button-fechar-como-funciona"
          onClick={onFechar} style={{ width: isMobile ? 44 : 36, padding: 0, marginRight: -8 }} />
      </div>
      {/* auto-fit e não "duas colunas no desktop": no tablet, com o menu
          lateral aberto, a legenda virava uma coluna de uma palavra por linha. */}
      <div style={{ display: "grid", gap: isMobile ? 20 : "20px 32px", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
          <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 12 }}>
            {passos.map((p, i) => (
              <li key={p.titulo} style={{ display: "grid", gridTemplateColumns: "22px minmax(0, 1fr)", gap: 10, alignItems: "start" }}>
                <span aria-hidden="true" style={{ width: 22, height: 22, marginTop: 0, borderRadius: R.pill, background: T.text, color: T.surface, display: "flex", alignItems: "center", justifyContent: "center", fontSize: FS.small, fontWeight: FW.rotulo, fontVariantNumeric: "tabular-nums" }}>{i + 1}</span>
                <p style={{ margin: 0, fontSize: FS.body, color: T.strong, lineHeight: 1.6 }}>
                  <strong style={{ color: T.text, fontWeight: FW.forte }}>{p.titulo}:</strong> {p.texto}
                </p>
              </li>
            ))}
          </ol>
          <p style={{ margin: "0 0 0 32px", padding: "8px 12px", borderRadius: R.md, background: T.bg, border: `1px solid ${T.border}`, fontSize: FS.body, color: T.apoio, lineHeight: 1.55 }}>
            <strong style={{ color: T.strong, fontWeight: FW.forte }}>Errou?</strong> Cancele enquanto a peça está aberta. Depois de atendida ela já existe no evento e não se cancela por aqui — peça um ajuste.
          </p>
        </div>
        <div style={{ minWidth: 0 }}>
          <h3 style={{ margin: "0 0 10px", fontSize: FS.small, fontWeight: FW.rotulo, letterSpacing: "0.08em", textTransform: "uppercase", color: T.apoio }}>O que cada status quer dizer</h3>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 9 }}>
            {ORDEM_DOS_STATUS.map((s) => (
              <li key={s} style={{ display: "grid", gridTemplateColumns: "88px minmax(0, 1fr)", gap: 10, alignItems: "baseline", fontSize: FS.body, color: T.strong, lineHeight: 1.5 }}>
                <span><EstadoDoPedido status={s} /></span>
                <span>{SIGNIFICADO_DO_PEDIDO[s]}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

export default function PedidosDePecaPagina() {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [ajudaAberta, setAjudaAberta] = useState(false);
  const papel = user?.role;
  const podePedir = papel === "admin" || papel === "atendimento";
  const podeResolver = papel === "admin" || papel === "solicitacao";
  const explicacao = podeResolver && !podePedir
    ? "O que o Atendimento pediu para entrar na lista. “Criar peça” abre o evento com o formulário preenchido — a peça sai ligada à solicitação e quem pediu é avisado."
    : podePedir && !podeResolver
      ? "Peça a quem monta a lista as peças que faltam nos eventos — várias numa solicitação só — e acompanhe cada uma até a entrega."
      : "As solicitações de peça do Atendimento: quem pede acompanha aqui, quem monta a lista cria a peça a partir da solicitação.";
  return (
    <div style={{ padding: isMobile ? "20px 16px 32px" : "28px 32px 48px", background: T.bg, minHeight: "100%", boxSizing: "border-box" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
        {/* O cabeçalho da casa: onde estou · como funciona aqui · ajuda. A
            frase explica a tela PARA O PAPEL de quem vê (pedir × atender). */}
        <CabecalhoDaPagina
          titulo="Solicitação de peças"
          testId="title-pedidos-de-peca"
          subtitulo={<span style={{ display: "block", maxWidth: 640, color: T.apoio }}>{explicacao}</span>}
          semMargem
          acoes={
            <Botao variante={ajudaAberta ? "secundarioForte" : "secundario"} tamanho={isMobile ? "toque" : "md"} icone={HelpCircle}
              aria-expanded={ajudaAberta} aria-controls="painel-como-funciona" data-testid="button-como-funciona-pedidos"
              onClick={() => setAjudaAberta((v) => !v)}>
              Como funciona
            </Botao>
          }
        />
        {ajudaAberta && <ComoFunciona podePedir={podePedir} podeResolver={podeResolver} onFechar={() => setAjudaAberta(false)} />}
        <ListaDePedidos podePedir={podePedir} podeResolver={podeResolver} />
      </div>
    </div>
  );
}
