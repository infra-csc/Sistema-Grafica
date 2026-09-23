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
import { useIsMobile, usePonteiroGrosso, alvo as alvoDoPonteiro } from "@/hooks/use-mobile";
import { T, N, TOM, FS, FW, R } from "@/lib/theme";
import { Botao } from "@/components/ui/botao";
import { Selo } from "@/components/ui/selo";
import { useConfirmar } from "@/components/ui/usar-confirmar";

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
  margin: 0, fontSize: FS.meta, lineHeight: 1.5, backgroundColor: fundo, border: `1px solid ${borda}`,
  borderRadius: R.md, padding: "8px 12px", display: "flex", gap: 8, alignItems: "flex-start",
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
    <Selo
      tom={respondeu ? "sucesso" : "alerta"}
      tamanho="sm"
      ponto
      data-testid={`selo-estoque-${linha.itemId}`}
      title={titulo}
      style={{ flexShrink: 0 }}
    >
      {respondeu ? "Estoque respondeu" : "Aguardando estoque"}
    </Selo>
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
  // Os dois pedidos ficam em 44px até no mouse (modal de decisão); 48 no celular.
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

  if (carregando) return <p role="status" style={{ margin: "0 0 12px", fontSize: FS.body, color: T.apoio }}>Vendo se já há pedido ao estoque…</p>;
  if (consulta?.status === "aberta") {
    return (
      <p role="status" data-testid="pedido-ao-estoque-ja-aberto" style={{ ...faixa(TOM.alerta.bg, TOM.alerta.border), color: TOM.alerta.text, marginBottom: 12 }}>
        <Clock3 aria-hidden="true" style={{ width: 14, height: 14, flexShrink: 0, marginTop: 2, color: TOM.alerta.text }} />
        <span><strong>{textoDoPedido(consulta.quantidadePedida)}</strong> a resposta da Gráfica. Para pedir outra quantidade, cancele o pedido na ficha da peça.</span>
      </p>
    );
  }
  if (cabe === 0) return null;

  const travado = pedir.isPending;
  return (
    <div data-testid="pedir-ao-estoque" style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 12 }}>
      <p style={{ margin: 0, fontSize: FS.meta, lineHeight: 1.5, color: T.strong }}>
        A Gráfica confere no estoque e responde; o que ela atender vem como reaproveitamento.
      </p>
      <Botao variante="primario" tamanho="toque" larguraCheia icone={PackageSearch} data-testid="button-pedir-tudo-ao-estoque"
        disabled={travado} onClick={() => pedir.mutate(cabe)} style={{ minHeight: alvo }}>
        {travado ? "Pedindo…" : `Pedir ${cabe === Number(item.quantity) ? "tudo" : "o que falta"} (${cabe} un.) ao estoque`}
      </Botao>
      {cabe > 1 && (
        <div style={{ border: `1px solid ${T.border}`, borderRadius: R.md, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
          <label htmlFor="pedir-parte-ao-estoque" style={{ fontSize: FS.meta, fontWeight: FW.forte, color: T.apoio }}>Pedir só uma parte</label>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input id="pedir-parte-ao-estoque" data-testid="input-pedir-parte-ao-estoque" type="number" inputMode="numeric" min={1} max={cabe - 1} value={parte}
              onChange={(e) => setParte(Math.max(1, Math.min(cabe - 1, parseInt(e.target.value) || 1)))}
              style={{ width: 76, minHeight: alvo, padding: "0 8px", borderRadius: R.md, border: `1px solid ${T.bdark}`, fontSize: FS.lead, fontWeight: FW.forte, textAlign: "center", color: T.text }} />
            <span style={{ fontSize: FS.body, color: T.apoio }}>de {item.quantity} un. — as outras {Number(item.quantity) - (Number(item.reuseQty) || 0) - parte} seguem para produção</span>
          </div>
          <Botao variante="secundario" tamanho="toque" larguraCheia data-testid="button-pedir-parte-ao-estoque"
            disabled={travado} onClick={() => pedir.mutate(parte)} style={{ minHeight: alvo }}>
            {`Pedir ${parte} un. ao estoque`}
          </Botao>
        </div>
      )}
      <div>
        <label htmlFor="observacao-do-pedido-ao-estoque" style={{ display: "block", fontSize: FS.meta, fontWeight: FW.forte, color: T.apoio, marginBottom: 4 }}>Recado para a Gráfica (opcional)</label>
        <textarea id="observacao-do-pedido-ao-estoque" data-testid="input-observacao-do-pedido" rows={2} maxLength={MAX_OBSERVACAO_DA_CONSULTA} value={observacao}
          onChange={(e) => setObservacao(e.target.value)} placeholder="Ex.: usamos uma igual na etapa de Manaus."
          style={{ width: "100%", boxSizing: "border-box", borderRadius: R.md, border: `1px solid ${T.bdark}`, padding: "8px 12px", fontSize: FS.lead, fontFamily: "inherit", lineHeight: 1.45, resize: "vertical", color: T.text }} />
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
    <details data-testid="ja-conferi-aplicar-agora" style={{ borderTop: `1px solid ${T.border}`, paddingTop: 8 }}>
      <summary style={{ minHeight: 44, display: "flex", alignItems: "center", cursor: "pointer", fontSize: FS.body, fontWeight: FW.forte, color: T.strong }}>
        Já conferi no estoque — aplicar agora
      </summary>
      <p style={{ margin: "0 0 10px", fontSize: FS.meta, color: T.apoio, lineHeight: 1.45 }}>
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
  const grosso = usePonteiroGrosso() || isMobile;
  const alvo = alvoDoPonteiro(36, grosso);
  const { confirmar, dialogo } = useConfirmar();

  const cancelar = useMutation({
    mutationFn: async (id: string) => await apiRequest("POST", `/api/consultas-de-estoque/${id}/cancelar`, {}),
    onSuccess: () => { atualizar(); toast({ title: "Pedido ao estoque cancelado" }); },
    onError: (e: any) => { atualizar(); toast({ title: "Não deu para cancelar o pedido", description: parseApiError(e).message, variant: "destructive" }); },
  });

  if (carregando) return <p role="status" data-testid="estoque-na-ficha-carregando" style={{ margin: 0, fontSize: FS.meta, color: T.apoio }}>Vendo se há pedido ao estoque…</p>;
  if (erro) {
    return (
      <p role="alert" data-testid="estoque-na-ficha-erro" style={{ ...faixa(TOM.perigo.bg, TOM.perigo.border), color: TOM.perigo.text }}>
        Não deu para ler o pedido ao estoque desta peça. A liberação segue funcionando.
      </p>
    );
  }
  if (!consulta) return null;

  if (consulta.status === "aberta") {
    return (
      <div role="status" data-testid="estoque-na-ficha-aguardando" style={{ ...faixa(TOM.alerta.bg, TOM.alerta.border), color: TOM.alerta.text, flexWrap: "wrap", alignItems: "center" }}>
        <Clock3 aria-hidden="true" style={{ width: 14, height: 14, flexShrink: 0, color: TOM.alerta.text }} />
        <span style={{ flex: "1 1 220px", minWidth: 0 }}>
          <strong>{textoDoPedido(consulta.quantidadePedida)}</strong> a resposta da Gráfica.{" "}
          Pedido {consulta.pedidoPor ? `por ${consulta.pedidoPor} ` : ""}em {quando(consulta.pedidoEm)}. Dá para liberar sem esperar.
          {consulta.observacao ? <span style={{ display: "block", overflowWrap: "anywhere" }}>“{consulta.observacao}”</span> : null}
        </span>
        <Botao variante="secundario" tamanho={grosso ? "toque" : "sm"} data-testid="button-cancelar-pedido-ao-estoque" carregando={cancelar.isPending}
          onClick={async () => {
            const ok = await confirmar({
              titulo: "Cancelar o pedido ao estoque desta peça?",
              descricao: "A Gráfica deixa de ver o pedido. Dá para pedir de novo depois.",
              confirmar: "Cancelar pedido",
              cancelar: "Manter pedido",
            });
            if (ok) cancelar.mutate(consulta.id);
          }}
          style={{ minHeight: alvo, flexShrink: 0 }}>
          {cancelar.isPending ? "Cancelando…" : "Cancelar pedido"}
        </Botao>
        {dialogo}
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
      style={{ ...faixa(atendeu ? TOM.sucesso.bg : N.n2, atendeu ? TOM.sucesso.border : T.bdark), color: atendeu ? TOM.sucesso.text : T.strong }}>
      {atendeu
        ? <CheckCircle2 aria-hidden="true" style={{ width: 16, height: 16, flexShrink: 0, marginTop: 1, color: TOM.sucesso.text }} />
        : <XCircle aria-hidden="true" style={{ width: 16, height: 16, flexShrink: 0, marginTop: 1, color: T.apoio }} />}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
        <strong style={{ fontSize: FS.body, color: atendeu ? TOM.sucesso.text : T.text }}>{textoDaResposta(consulta)}</strong>
        <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: "4px 12px" }}>
          {dados.map(([rotulo, valor]) => (
            <div key={rotulo} style={{ minWidth: 0 }}>
              <dt style={{ fontSize: FS.small, fontWeight: FW.medio, opacity: 0.85 }}>{rotulo}</dt>
              <dd style={{ margin: 0, fontWeight: 700, overflowWrap: "anywhere" }}>{valor}</dd>
            </div>
          ))}
        </dl>
        {consulta.observacaoResposta && <span style={{ overflowWrap: "anywhere" }}>“{consulta.observacaoResposta}”</span>}
        {consulta.fotoUrl && (
          <a href={consulta.fotoUrl} target="_blank" rel="noreferrer" data-testid="link-foto-da-resposta" style={{ alignSelf: "flex-start", minHeight: alvo, display: "inline-flex", alignItems: "center", gap: 8, color: "inherit", fontWeight: 700 }}>
            <img src={consulta.fotoUrl} alt="Foto da peça no estoque" loading="lazy" decoding="async" style={{ width: 44, height: 44, objectFit: "cover", borderRadius: R.sm, border: `1px solid ${TOM.sucesso.border}` }} />
            Ver a foto do estoque
          </a>
        )}
        <span>É você quem segue com a peça: confirme e libere no botão acima{item.isReuse ? " (a peça já está marcada como reaproveitamento total)" : ""}.</span>
        {atendeu && !item.isReuse && (
          usar == null ? (
            <button type="button" data-testid="link-usar-menos" onClick={() => onUsar(Math.max(0, atendida - 1))}
              style={{ alignSelf: "flex-start", minHeight: alvo, padding: 0, border: "none", background: "none", color: TOM.sucesso.text, fontSize: FS.meta, fontWeight: FW.medio, textDecoration: "underline", cursor: "pointer" }}>
              Usar menos do que o estoque atendeu
            </button>
          ) : (
            <div data-testid="usar-menos" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <label htmlFor="usar-menos-do-estoque" style={{ fontWeight: 700 }}>Usar</label>
              <input id="usar-menos-do-estoque" data-testid="input-usar-menos" type="number" inputMode="numeric" min={0} max={atendida} value={usar}
                onChange={(e) => onUsar(Math.max(0, Math.min(atendida, parseInt(e.target.value) || 0)))}
                style={{ width: 72, minHeight: alvo, padding: "0 8px", borderRadius: R.md, border: `1px solid ${TOM.sucesso.border}`, fontSize: FS.lead, fontWeight: FW.forte, textAlign: "center", color: T.text, backgroundColor: T.surface }} />
              <span>das {atendida} un. atendidas (nunca mais que isso)</span>
              <button type="button" onClick={() => onUsar(null)}
                style={{ minHeight: alvo, padding: "0 8px", border: "none", background: "none", color: TOM.sucesso.text, fontSize: FS.meta, fontWeight: FW.medio, textDecoration: "underline", cursor: "pointer" }}>
                Voltar à sugestão do estoque
              </button>
            </div>
          )
        )}
      </div>
    </div>
  );
}
