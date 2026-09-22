// ─────────────────────────────────────────────────────────────────────────────
// SOLICITAÇÃO AO ESTOQUE NA REVISÃO FINAL (dono, 21/09).
//
// "As respostas do reaproveitar têm que aparecer na REVISÃO, e é ELA que segue
// com o item… tem que vir SUGERIDO de acordo com a resposta do estoque e ela só
// CONFIRMAR." O que mora aqui:
//   · <PedirAoEstoque/>        — o miolo do modal Reaproveitamento: pedir tudo
//                                ou N un. ao estoque (não aplica mais na hora);
//   · <RespostaDoEstoqueNaFicha/> — na ficha da peça: "Pedido ao estoque: 5 un.
//                                · aguardando" → "Estoque respondeu: atende 3
//                                de 5" (pedida × atendida, quem, quando,
//                                observação, foto) com o link discreto "Usar
//                                menos do que o estoque atendeu";
//   · <SeloDoEstoqueNaLinha/>  — o destaque na lista, para não passar batido;
//   · os dois hooks que a tela usa para escrever o botão "Confirmar e liberar
//     · 3 reaproveitadas + 3 a produzir", os contadores e o resumo do lote.
// Sem local da peça no galpão: o dono decidiu que o sistema não guarda isso.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, Clock3, PackageSearch, XCircle } from "lucide-react";
import {
  MAX_OBSERVACAO_DA_CONSULTA,
  SOLICITACAO_AO_ESTOQUE_ATIVA,
  respostaEsperandoConfirmar,
  textoDaResposta,
  textoDoPedido,
  type ConsultaDaPeca,
  type StatusDaConsulta,
} from "@shared/consultas-de-estoque";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { parseApiError } from "@/components/aumentar-quantidade-dialog";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";

export const chaveDaConsulta = (itemId: string) => ["/api/items", itemId, "consulta-de-estoque"] as const;
export const CHAVE_DO_ESTOQUE_NA_REVISAO = ["/api/consultas-de-estoque/da-revisao"] as const;

const atualizar = () => queryClient.invalidateQueries({
  predicate: (q) => String(q.queryKey[0] ?? "").startsWith("/api/consultas-de-estoque") || q.queryKey.includes("consulta-de-estoque"),
});

/** A solicitação que vale para a peça (a mais recente não cancelada), ou null. */
export function useConsultaDaPeca(itemId: string | null | undefined, ligado = true) {
  const { data, isLoading, isError } = useQuery<{ consulta: ConsultaDaPeca | null }>({
    queryKey: chaveDaConsulta(itemId ?? ""),
    // Chave desligada (21/09): nenhuma requisição, e a peça "nunca pediu".
    enabled: SOLICITACAO_AO_ESTOQUE_ATIVA && ligado && !!itemId,
  });
  const consulta = SOLICITACAO_AO_ESTOQUE_ATIVA && itemId ? data?.consulta ?? null : null;
  return { consulta, carregando: SOLICITACAO_AO_ESTOQUE_ATIVA && isLoading && ligado && !!itemId, erro: SOLICITACAO_AO_ESTOQUE_ATIVA && isError };
}

export type EstoqueDaLinha = {
  id: string; itemId: string; status: StatusDaConsulta; quantidadePedida: number; quantidadeAtendida: number | null;
  respondidoPor: string | null; respondidoEm: string | null;
};

/** O que vale para cada peça EM REVISÃO — uma leitura para a lista inteira. */
export function useEstoqueDaRevisao() {
  // Chave desligada (21/09): nenhuma requisição e o mapa vem vazio.
  const { data } = useQuery<EstoqueDaLinha[]>({ queryKey: CHAVE_DO_ESTOQUE_NA_REVISAO, enabled: SOLICITACAO_AO_ESTOQUE_ATIVA });
  return useMemo(() => {
    const porPeca = new Map<string, EstoqueDaLinha>();
    // Array.isArray: resposta fora do formato não pode derrubar a fila.
    for (const l of SOLICITACAO_AO_ESTOQUE_ATIVA && Array.isArray(data) ? data : []) porPeca.set(l.itemId, l);
    return porPeca;
  }, [data]);
}

export const aguardandoEstoque = (l: EstoqueDaLinha | undefined): boolean => l?.status === "aberta";
export const estoqueRespondeu = (l: EstoqueDaLinha | undefined): boolean => !!l && respostaEsperandoConfirmar({ status: l.status, aplicadoEm: null });

const quando = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";

const faixa = (fundo: string, borda: string): React.CSSProperties => ({
  margin: 0, fontSize: 12, lineHeight: 1.5, backgroundColor: fundo, border: `1px solid ${borda}`,
  borderRadius: 8, padding: "8px 12px", display: "flex", gap: 8, alignItems: "flex-start",
});

// ─── Na lista ────────────────────────────────────────────────────────────────

/** "Estoque respondeu" (verde) / "Aguardando estoque" (âmbar) na linha. */
export function SeloDoEstoqueNaLinha({ linha }: { linha: EstoqueDaLinha | undefined }) {
  if (!linha || (!aguardandoEstoque(linha) && !estoqueRespondeu(linha))) return null;
  const respondeu = estoqueRespondeu(linha);
  const titulo = respondeu
    ? `${textoDaResposta(linha)}${linha.respondidoPor ? ` (${linha.respondidoPor})` : ""} — abra a peça para confirmar e liberar`
    : `${textoDoPedido(linha.quantidadePedida)} a resposta da Gráfica`;
  return (
    <span
      data-testid={`selo-estoque-${linha.itemId}`}
      title={titulo}
      style={{
        display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 800, textTransform: "uppercase",
        letterSpacing: "0.06em", borderRadius: 999, padding: "2px 7px", whiteSpace: "nowrap", flexShrink: 0,
        /* #166534 sobre #dcfce7 = 6,5:1 · #92400e sobre #fef3c7 = 6,4:1 */
        color: respondeu ? "#166534" : "#92400e",
        backgroundColor: respondeu ? "#dcfce7" : "#fef3c7",
        border: `1px solid ${respondeu ? "#86efac" : "#fcd34d"}`,
      }}
    >
      <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: "50%", background: respondeu ? "#15803d" : "#d97706", flexShrink: 0 }} />
      {respondeu ? "Estoque respondeu" : "Aguardando estoque"}
    </span>
  );
}

// ─── No modal Reaproveitamento ───────────────────────────────────────────────

/**
 * O miolo do modal: a forma é a de sempre (tudo, ou N de M), mas confirmar PEDE
 * ao estoque em vez de aplicar. Quem aplica é a resposta da Gráfica + a
 * liberação da Revisão Final.
 */
export function PedirAoEstoque({ item, onPedido }: {
  item: { id: string; quantity: number; reuseQty?: number | null };
  onPedido: () => void;
}) {
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const { consulta, carregando } = useConsultaDaPeca(item.id);
  const cabe = Math.max(0, (Number(item.quantity) || 0) - (Number(item.reuseQty) || 0));
  const [parte, setParte] = useState(Math.max(1, cabe - 1));
  const [observacao, setObservacao] = useState("");
  const alvo = isMobile ? 48 : 44;

  const pedir = useMutation({
    mutationFn: async (quantidade: number) =>
      await apiRequest("POST", `/api/items/${item.id}/consulta-de-estoque`, { quantidade, observacao: observacao.trim() || undefined }),
    onSuccess: (_r, quantidade) => {
      atualizar();
      toast({ title: `Pedido ao estoque: ${quantidade} un.`, description: "A Gráfica confere e responde aqui na Revisão Final. A peça pode ser liberada sem esperar." });
      onPedido();
    },
    onError: (e: any) => { atualizar(); toast({ title: "Não deu para pedir ao estoque", description: parseApiError(e).message, variant: "destructive" }); },
  });

  if (carregando) return <p role="status" style={{ margin: "0 0 12px", fontSize: 13, color: "#57534e" }}>Vendo se já há pedido ao estoque…</p>;
  if (consulta?.status === "aberta") {
    return (
      <p role="status" data-testid="pedido-ao-estoque-ja-aberto" style={{ ...faixa("#fffbeb", "#fde68a"), color: "#78350f", marginBottom: 12 }}>
        <Clock3 aria-hidden="true" style={{ width: 14, height: 14, flexShrink: 0, marginTop: 2, color: "#b45309" }} />
        <span><strong>{textoDoPedido(consulta.quantidadePedida)}</strong> a resposta da Gráfica. Para pedir outra quantidade, cancele o pedido na ficha da peça.</span>
      </p>
    );
  }
  if (cabe === 0) return null;

  const travado = pedir.isPending;
  return (
    <div data-testid="pedir-ao-estoque" style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 12 }}>
      <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: "#44403c" }}>
        A Gráfica confere no estoque e responde; o que ela atender vem como reaproveitamento.
      </p>
      <button type="button" data-testid="button-pedir-tudo-ao-estoque" disabled={travado} onClick={() => pedir.mutate(cabe)}
        style={{ width: "100%", minHeight: alvo, padding: "0 16px", backgroundColor: travado ? "#e7e5e4" : "#15803d", color: travado ? "#57534e" : "#fff", border: "none", borderRadius: 8, cursor: travado ? "not-allowed" : "pointer", fontSize: 14, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
        <PackageSearch aria-hidden="true" style={{ width: 15, height: 15 }} />
        {travado ? "Pedindo…" : `Pedir ${cabe === Number(item.quantity) ? "tudo" : "o que falta"} (${cabe} un.) ao estoque`}
      </button>
      {cabe > 1 && (
        <div style={{ border: "1px solid #e7e5e4", borderRadius: 8, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
          <label htmlFor="pedir-parte-ao-estoque" style={{ fontSize: 11, fontWeight: 800, color: "#57534e", textTransform: "uppercase", letterSpacing: "0.06em" }}>Pedir só uma parte</label>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input id="pedir-parte-ao-estoque" data-testid="input-pedir-parte-ao-estoque" type="number" inputMode="numeric" min={1} max={cabe - 1} value={parte}
              onChange={(e) => setParte(Math.max(1, Math.min(cabe - 1, parseInt(e.target.value) || 1)))}
              style={{ width: 76, minHeight: alvo, padding: "0 8px", borderRadius: 8, border: "1px solid #d6d3d1", fontSize: 16, fontWeight: 700, textAlign: "center", color: "#1c1917" }} />
            <span style={{ fontSize: 13, color: "#57534e" }}>de {item.quantity} un. — as outras {Number(item.quantity) - (Number(item.reuseQty) || 0) - parte} seguem para produção</span>
          </div>
          <button type="button" data-testid="button-pedir-parte-ao-estoque" disabled={travado} onClick={() => pedir.mutate(parte)}
            style={{ width: "100%", minHeight: alvo, padding: "0 16px", backgroundColor: travado ? "#e7e5e4" : "#1c1917", color: travado ? "#57534e" : "#fff", border: "none", borderRadius: 8, cursor: travado ? "not-allowed" : "pointer", fontSize: 14, fontWeight: 800 }}>
            {`Pedir ${parte} un. ao estoque`}
          </button>
        </div>
      )}
      <div>
        <label htmlFor="observacao-do-pedido-ao-estoque" style={{ display: "block", fontSize: 11, fontWeight: 800, color: "#57534e", marginBottom: 4 }}>Recado para a Gráfica (opcional)</label>
        <textarea id="observacao-do-pedido-ao-estoque" data-testid="input-observacao-do-pedido" rows={2} maxLength={MAX_OBSERVACAO_DA_CONSULTA} value={observacao}
          onChange={(e) => setObservacao(e.target.value)} placeholder="Ex.: usamos uma igual na etapa de Manaus."
          style={{ width: "100%", boxSizing: "border-box", borderRadius: 8, border: "1px solid #d6d3d1", padding: "8px 12px", fontSize: 16, fontFamily: "inherit", lineHeight: 1.45, resize: "vertical", color: "#1c1917" }} />
      </div>
    </div>
  );
}

/**
 * O caminho de SEMPRE do modal Reaproveitamento (marca e libera na hora).
 * Chave desligada (dono, 21/09 — segurar): as opções aparecem direto, sem
 * envelope nenhum — o modal é o de antes da solicitação ao estoque. Ligada:
 * só o admin, atrás de "Já conferi no estoque — aplicar agora".
 */
export function AplicarAgoraNoModal({ admin, children }: { admin: boolean; children: React.ReactNode }) {
  if (!SOLICITACAO_AO_ESTOQUE_ATIVA) return <>{children}</>;
  if (!admin) return null;
  return (
    <details data-testid="ja-conferi-aplicar-agora" style={{ borderTop: "1px solid #e7e5e4", paddingTop: 8 }}>
      <summary style={{ minHeight: 44, display: "flex", alignItems: "center", cursor: "pointer", fontSize: 13, fontWeight: 700, color: "#44403c" }}>
        Já conferi no estoque — aplicar agora
      </summary>
      <p style={{ margin: "0 0 10px", fontSize: 12, color: "#57534e", lineHeight: 1.45 }}>
        Sem passar pela Gráfica: marca o reaproveitamento e libera a peça, como era antes.
      </p>
      {children}
    </details>
  );
}

// ─── Na ficha ────────────────────────────────────────────────────────────────

export function RespostaDoEstoqueNaFicha({ item, usar, onUsar }: {
  item: { id: string; quantity: number; isReuse?: boolean | null };
  /** "Usar menos": null = usa o que o estoque atendeu (a sugestão). */
  usar: number | null;
  onUsar: (n: number | null) => void;
}) {
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const { consulta, carregando, erro } = useConsultaDaPeca(item.id);
  const alvo = isMobile ? 44 : 36;

  const cancelar = useMutation({
    mutationFn: async (id: string) => await apiRequest("POST", `/api/consultas-de-estoque/${id}/cancelar`, {}),
    onSuccess: () => { atualizar(); toast({ title: "Pedido ao estoque cancelado" }); },
    onError: (e: any) => { atualizar(); toast({ title: "Não deu para cancelar o pedido", description: parseApiError(e).message, variant: "destructive" }); },
  });

  if (carregando) return <p role="status" data-testid="estoque-na-ficha-carregando" style={{ margin: 0, fontSize: 12, color: "#57534e" }}>Vendo se há pedido ao estoque…</p>;
  if (erro) {
    return (
      <p role="alert" data-testid="estoque-na-ficha-erro" style={{ ...faixa("#fef2f2", "#fecaca"), color: "#991b1b" }}>
        Não deu para ler o pedido ao estoque desta peça. A liberação segue funcionando.
      </p>
    );
  }
  if (!consulta) return null;

  if (consulta.status === "aberta") {
    return (
      <div role="status" data-testid="estoque-na-ficha-aguardando" style={{ ...faixa("#fffbeb", "#fde68a"), color: "#78350f", flexWrap: "wrap", alignItems: "center" }}>
        <Clock3 aria-hidden="true" style={{ width: 14, height: 14, flexShrink: 0, color: "#b45309" }} />
        <span style={{ flex: "1 1 220px", minWidth: 0 }}>
          <strong>{textoDoPedido(consulta.quantidadePedida)}</strong> a resposta da Gráfica.{" "}
          Pedido {consulta.pedidoPor ? `por ${consulta.pedidoPor} ` : ""}em {quando(consulta.pedidoEm)}. Dá para liberar sem esperar.
          {consulta.observacao ? <span style={{ display: "block", overflowWrap: "anywhere" }}>“{consulta.observacao}”</span> : null}
        </span>
        <button type="button" data-testid="button-cancelar-pedido-ao-estoque" disabled={cancelar.isPending}
          onClick={() => { if (window.confirm("Cancelar o pedido ao estoque desta peça?")) cancelar.mutate(consulta.id); }}
          style={{ minHeight: alvo, padding: "0 10px", borderRadius: 8, border: "1px solid #fcd34d", background: "#fff", color: "#78350f", fontSize: 12, fontWeight: 700, cursor: cancelar.isPending ? "not-allowed" : "pointer", flexShrink: 0 }}>
          {cancelar.isPending ? "Cancelando…" : "Cancelar pedido"}
        </button>
      </div>
    );
  }

  if (!respostaEsperandoConfirmar(consulta)) return null;

  const atendeu = consulta.status !== "nao_atendida";
  const atendida = consulta.quantidadeAtendida ?? 0;
  const dados: Array<[string, string]> = [
    ["Pedidas", `${consulta.quantidadePedida} un.`],
    ["Atendidas", `${atendida} un.`],
    ["Quem respondeu", consulta.respondidoPor ?? "—"],
    ["Quando", quando(consulta.respondidoEm) || "—"],
  ];
  return (
    <div role="status" data-testid={atendeu ? "estoque-na-ficha-atendeu" : "estoque-na-ficha-nao-tem"}
      style={{ ...faixa(atendeu ? "#f0fdf4" : "#f5f5f4", atendeu ? "#86efac" : "#d6d3d1"), color: atendeu ? "#14532d" : "#44403c" }}>
      {atendeu
        ? <CheckCircle2 aria-hidden="true" style={{ width: 16, height: 16, flexShrink: 0, marginTop: 1, color: "#15803d" }} />
        : <XCircle aria-hidden="true" style={{ width: 16, height: 16, flexShrink: 0, marginTop: 1, color: "#57534e" }} />}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
        <strong style={{ fontSize: 13, color: atendeu ? "#14532d" : "#1c1917" }}>{textoDaResposta(consulta)}</strong>
        <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: "4px 12px" }}>
          {dados.map(([rotulo, valor]) => (
            <div key={rotulo} style={{ minWidth: 0 }}>
              <dt style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", opacity: 0.85 }}>{rotulo}</dt>
              <dd style={{ margin: 0, fontWeight: 700, overflowWrap: "anywhere" }}>{valor}</dd>
            </div>
          ))}
        </dl>
        {consulta.observacaoResposta && <span style={{ overflowWrap: "anywhere" }}>“{consulta.observacaoResposta}”</span>}
        {consulta.fotoUrl && (
          <a href={consulta.fotoUrl} target="_blank" rel="noreferrer" data-testid="link-foto-da-resposta" style={{ alignSelf: "flex-start", minHeight: alvo, display: "inline-flex", alignItems: "center", gap: 8, color: "inherit", fontWeight: 700 }}>
            <img src={consulta.fotoUrl} alt="Foto da peça no estoque" style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 6, border: "1px solid #86efac" }} />
            Ver a foto do estoque
          </a>
        )}
        <span>É você quem segue com a peça: confirme e libere no botão acima{item.isReuse ? " (a peça já está marcada como reaproveitamento total)" : ""}.</span>
        {atendeu && !item.isReuse && (
          usar == null ? (
            <button type="button" data-testid="link-usar-menos" onClick={() => onUsar(Math.max(0, atendida - 1))}
              style={{ alignSelf: "flex-start", minHeight: alvo, padding: 0, border: "none", background: "none", color: "#14532d", fontSize: 12, fontWeight: 600, textDecoration: "underline", cursor: "pointer" }}>
              Usar menos do que o estoque atendeu
            </button>
          ) : (
            <div data-testid="usar-menos" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <label htmlFor="usar-menos-do-estoque" style={{ fontWeight: 700 }}>Usar</label>
              <input id="usar-menos-do-estoque" data-testid="input-usar-menos" type="number" inputMode="numeric" min={0} max={atendida} value={usar}
                onChange={(e) => onUsar(Math.max(0, Math.min(atendida, parseInt(e.target.value) || 0)))}
                style={{ width: 72, minHeight: alvo, padding: "0 8px", borderRadius: 8, border: "1px solid #86efac", fontSize: 16, fontWeight: 700, textAlign: "center", color: "#1c1917", backgroundColor: "#fff" }} />
              <span>das {atendida} un. atendidas (nunca mais que isso)</span>
              <button type="button" onClick={() => onUsar(null)}
                style={{ minHeight: alvo, padding: "0 8px", border: "none", background: "none", color: "#14532d", fontSize: 12, fontWeight: 600, textDecoration: "underline", cursor: "pointer" }}>
                Voltar à sugestão do estoque
              </button>
            </div>
          )
        )}
      </div>
    </div>
  );
}
