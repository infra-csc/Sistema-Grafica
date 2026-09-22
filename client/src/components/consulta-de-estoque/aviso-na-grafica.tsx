// ─────────────────────────────────────────────────────────────────────────────
// "5 UN. AGUARDANDO RESPOSTA DO ESTOQUE" — o aviso na fila da Gráfica
// (solicitação ao estoque, dono, 21/09).
//
// A Revisão Final pode liberar a peça SEM esperar a resposta do estoque. Para a
// Gráfica não imprimir o que talvez venha do estoque, a peça liberada com
// solicitação aberta se declara na linha e na ficha, com o atalho para
// responder. É só aviso: o teto de produção não muda sozinho — quando a
// resposta vier, o reaproveitamento entra pela regra de sempre.
//
// Uma busca só para a fila inteira (mesma chave em todas as linhas — o React
// Query junta).
// ─────────────────────────────────────────────────────────────────────────────
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Boxes } from "lucide-react";
import { SOLICITACAO_AO_ESTOQUE_ATIVA } from "@shared/consultas-de-estoque";

type AbertaPorPeca = { id: string; itemId: string; quantidadePedida: number; pedidoPor: string | null };

export function AvisoDoEstoqueNaPeca({ peca, style }: {
  peca: { id: string };
  style?: React.CSSProperties;
}) {
  const { data } = useQuery<AbertaPorPeca[]>({
    queryKey: ["/api/consultas-de-estoque/abertas-por-peca"],
    staleTime: 60_000,
    // Chave desligada (dono, 21/09 — segurar): nenhuma requisição, nenhum selo.
    enabled: SOLICITACAO_AO_ESTOQUE_ATIVA,
  });
  if (!SOLICITACAO_AO_ESTOQUE_ATIVA) return null;
  // Array.isArray: uma resposta fora do formato (proxy, erro em HTML) não pode
  // derrubar a fila inteira por causa de um selo.
  const aberta = (Array.isArray(data) ? data : []).find((r) => r.itemId === peca.id);
  if (!aberta) return null;
  const frase = `${aberta.quantidadePedida} un. podem vir do estoque${aberta.pedidoPor ? ` (pedido de ${aberta.pedidoPor})` : ""} — responda a solicitação antes de imprimir tudo.`;
  return (
    <Link
      href="/grafica/solicitacoes-ao-estoque"
      onClick={(e: React.MouseEvent) => e.stopPropagation()}
      data-testid={`aviso-estoque-${peca.id}`}
      title={frase}
      aria-label={frase}
      style={{
        display: "inline-flex", alignItems: "center", gap: 4, width: "fit-content", textDecoration: "none",
        fontSize: 11, fontWeight: 800, lineHeight: 1.3, padding: "2px 8px", borderRadius: 999,
        /* #92400e sobre #fef3c7 = 6,4:1 */
        color: "#92400e", backgroundColor: "#fef3c7", border: "1px solid #fcd34d", whiteSpace: "nowrap",
        ...style,
      }}
    >
      <Boxes aria-hidden="true" style={{ width: 12, height: 12, flexShrink: 0 }} />
      {aberta.quantidadePedida} un. aguardando resposta do estoque
    </Link>
  );
}
