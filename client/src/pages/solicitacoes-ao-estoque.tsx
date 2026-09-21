// ─────────────────────────────────────────────────────────────────────────────
// SOLICITAÇÕES AO ESTOQUE — a caixa da Gráfica (dono, 21/09).
//
// "Quando clicar [no Reaproveitamento da Revisão Final] e selecionar as
// quantidades, lá no estoque deve aparecer uma SOLICITAÇÃO; ele pode ATENDER,
// ATENDER PARCIAL ou NÃO CONSEGUIR ATENDER."
//
// Abertas / Respondidas (a aba mora na URL). Em cada solicitação aberta: a peça
// à esquerda ("Pedem 5 de 6 un.", arte, medidas, evento, prazo do caminhão,
// quem pediu e o recado) e, à direita, "O sistema sugere" — os ativos LIVRES
// do acervo que casam, pela mesma régua da busca de 14/09 — com seleção,
// quantidade e busca manual. Atender (tudo ou parte) reserva o que foi
// escolhido; dá para atender sem escolher ativo (peça fora do cadastro), com o
// aviso "sem vínculo com o acervo". Sem campo de local: o sistema não guarda
// onde a peça fica.
//
// A resposta NÃO libera peça nenhuma: com a peça na Revisão Final, quem
// confirma e libera é ela. Só entra direto se a peça já tinha sido liberada.
//
// Só UMA solicitação fica aberta por vez para procurar: cada procura lê o
// acervo inteiro no servidor, e dez cartões abertos seriam dez leituras.
//
// A Solicitação também entra aqui — vê as DELA (inclusive as de peças que ela
// liberou sem esperar) e cancela as abertas.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useLocation, useSearch } from "wouter";
import { AlertTriangle, Camera, CheckCircle2, PackageSearch, Search, X } from "lucide-react";
import { ROTULO_DA_RELACAO, diaEMes, type RelacaoDePatrocinio } from "@shared/estoque";
import { MAX_OBSERVACAO_DA_CONSULTA, ROTULO_DA_CONSULTA, STATUS_RESPONDIDOS, type StatusDaConsulta } from "@shared/consultas-de-estoque";
import { useAuth } from "@/contexts/auth-context";
import { useIsMobile } from "@/hooks/use-mobile";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { parseApiError } from "@/components/aumentar-quantidade-dialog";
import { ObjectUploader } from "@/components/ObjectUploader";
import { conditionMeta } from "@/lib/inventory-meta";
import { T, FS, R } from "@/lib/theme";

type Consulta = {
  id: string; itemId: string; eventId: string; status: StatusDaConsulta;
  pedidoPor: string | null; pedidoPorId: string | null; pedidoEm: string; observacao: string | null;
  quantidadePedida: number; quantidadeAtendida: number | null; ativosIds: string[]; observacaoResposta: string | null; fotoUrl: string | null;
  respondidoPor: string | null; respondidoEm: string | null; aplicadoEm: string | null;
  peca: {
    id: string; displayId: string | null; tipo: string; descricao: string | null; largura: string | null; altura: string | null;
    material: string | null; quantidade: number; status: string; reuseQty: number | null; thumb: string | null; patrocinadores: string[];
  };
  evento: { id: string; nome: string | null; saidaDoCaminhao: string | null };
};

type Sugestao = {
  chave: string; relacao: RelacaoDePatrocinio; condicao: string; thumb: string | null;
  origem: { displayId: string | null; tipo: string; descricao: string | null; largura: string | null; altura: string | null; eventName: string | null; eventInicio: string | null };
  ativos: Array<{ id: string; displayId: string; quantidade: number }>;
  quantidade: number;
};

const ABAS = [
  { id: "abertas", rotulo: "Abertas", status: "aberta" },
  { id: "respondidas", rotulo: "Respondidas", status: STATUS_RESPONDIDOS.join(",") },
] as const;
type Aba = (typeof ABAS)[number]["id"];

/** Cores de TEXTO com AA sobre o próprio fundo. */
const COR_DO_STATUS: Record<StatusDaConsulta, { cor: string; fundo: string; borda: string }> = {
  aberta: { cor: "#92400e", fundo: "#fef3c7", borda: "#fcd34d" },
  atendida: { cor: "#166534", fundo: "#dcfce7", borda: "#86efac" },
  atendida_parcial: { cor: "#166534", fundo: "#f0fdf4", borda: "#86efac" },
  nao_atendida: { cor: "#44403c", fundo: "#f5f5f4", borda: "#d6d3d1" },
  cancelada: { cor: "#57534e", fundo: "#f5f5f4", borda: "#e7e5e4" },
};

const dataEHora = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
const medida = (l: string | null, a: string | null) => (l && a ? `${Number(l)} × ${Number(a)} m` : "sem medida");

const atualizarConsultas = () => queryClient.invalidateQueries({
  predicate: (q) => String(q.queryKey[0] ?? "").startsWith("/api/consultas-de-estoque") || q.queryKey.includes("consulta-de-estoque"),
});

/** Escolhe ativos inteiros do lote até chegar em `unidades` (sem passar). */
export function ativosParaUnidades(ativos: Sugestao["ativos"], unidades: number): { ids: string[]; soma: number } {
  const ids: string[] = [];
  let soma = 0;
  for (const a of ativos) {
    if (soma + a.quantidade > unidades) continue;
    ids.push(a.id);
    soma += a.quantidade;
  }
  return { ids, soma };
}

function Selo({ status }: { status: StatusDaConsulta }) {
  const c = COR_DO_STATUS[status];
  return (
    <span data-testid={`selo-consulta-${status}`} style={{ fontSize: FS.small, fontWeight: 800, padding: "3px 10px", borderRadius: 999, color: c.cor, backgroundColor: c.fundo, border: `1px solid ${c.borda}`, whiteSpace: "nowrap" }}>
      {ROTULO_DA_CONSULTA[status]}
    </span>
  );
}

function Miniatura({ src, alt, lado }: { src: string | null; alt: string; lado: number }) {
  const caixa: React.CSSProperties = { width: lado, height: lado, borderRadius: R.md, border: "1px solid #e7e5e4", backgroundColor: "#f5f5f4", flexShrink: 0, objectFit: "cover", display: "flex", alignItems: "center", justifyContent: "center" };
  if (!src) return <div aria-hidden="true" style={caixa}><PackageSearch style={{ width: lado / 3, height: lado / 3, color: "#a8a29e" }} /></div>;
  return <img src={src} alt={alt} loading="lazy" style={caixa} />;
}

function APeca({ c, isMobile }: { c: Consulta; isMobile: boolean }) {
  const saida = c.evento.saidaDoCaminhao;
  const linha: React.CSSProperties = { margin: 0, fontSize: FS.body, color: "#44403c", lineHeight: 1.5, overflowWrap: "anywhere" };
  return (
    <div style={{ display: "flex", gap: 12, minWidth: 0 }}>
      <Miniatura src={c.peca.thumb} alt={`Arte da peça ${c.peca.displayId ?? ""}`} lado={isMobile ? 72 : 96} />
      <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
        <p style={{ margin: 0, fontSize: FS.strong, fontWeight: 800, color: T.text, overflowWrap: "anywhere" }}>
          <span style={{ fontFamily: "monospace" }}>{c.peca.displayId ?? "—"}</span> · {c.peca.tipo}
        </p>
        {c.peca.descricao && <p style={linha}>{c.peca.descricao}</p>}
        <p data-testid={`pedem-${c.id}`} style={{ ...linha, fontSize: FS.strong, fontWeight: 800, color: T.text }}>Pedem {c.quantidadePedida} de {c.peca.quantidade} un.</p>
        <p style={linha}>{medida(c.peca.largura, c.peca.altura)}{c.peca.material ? ` · ${c.peca.material}` : ""}</p>
        <p style={linha}>{c.peca.patrocinadores.length ? c.peca.patrocinadores.join(", ") : "Sem patrocinador vinculado"}</p>
        <p style={linha}>
          {c.evento.nome ?? "Evento"}{saida ? <> · caminhão sai <strong>{diaEMes(saida)}</strong></> : " · sem data de saída do caminhão"}
        </p>
        <p style={{ ...linha, color: "#57534e" }}>Pedida por {c.pedidoPor ?? "—"} em {dataEHora(c.pedidoEm)}</p>
        {c.observacao && (
          <blockquote style={{ margin: "4px 0 0", padding: "6px 10px", borderLeft: "3px solid #d6d3d1", background: "#fafaf9", borderRadius: R.sm, fontSize: FS.body, color: "#44403c", lineHeight: 1.45, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
            “{c.observacao}”
          </blockquote>
        )}
      </div>
    </div>
  );
}

/** O lado direito da consulta aberta: sugestões, busca manual e a resposta. */
function Responder({ c, isMobile, onRespondida }: { c: Consulta; isMobile: boolean; onRespondida: () => void }) {
  const { toast } = useToast();
  const [busca, setBusca] = useState("");
  const [buscaAplicada, setBuscaAplicada] = useState("");
  // chave do lote → quantas unidades usar dele
  const [escolha, setEscolha] = useState<Record<string, number>>({});
  // As sugestões escolhidas ficam guardadas: trocar a busca não pode apagar
  // o que já foi marcado na lista anterior.
  const [lotesEscolhidos, setLotesEscolhidos] = useState<Record<string, Sugestao>>({});
  // "Atender parcial": o número digitado. Vazio = a soma do que foi escolhido.
  const [parcialDigitada, setParcialDigitada] = useState<string>("");
  const [observacao, setObservacao] = useState("");
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);
  const alvo = isMobile ? 44 : 36;
  const pedida = c.quantidadePedida;

  const { data, isLoading, isError, refetch } = useQuery<{ semMedida: boolean; sugestoes: Sugestao[] }>({
    queryKey: [`/api/consultas-de-estoque/${c.id}/sugestoes`, `?busca=${encodeURIComponent(buscaAplicada)}`],
  });
  const sugestoes = Array.isArray(data?.sugestoes) ? data!.sugestoes : null;

  const selecionados = useMemo(() => {
    const ids: string[] = [];
    let soma = 0;
    for (const [chave, n] of Object.entries(escolha)) {
      const lote = lotesEscolhidos[chave];
      if (!lote || n <= 0) continue;
      const r = ativosParaUnidades(lote.ativos, n);
      ids.push(...r.ids);
      soma += r.soma;
    }
    return { ids, soma };
  }, [escolha, lotesEscolhidos]);

  // O teto de tudo é o que foi PEDIDO — não a quantidade da peça.
  const parcial = parcialDigitada === "" ? selecionados.soma : Math.floor(Number(parcialDigitada)) || 0;
  const parcialValida = parcial >= 1 && parcial < pedida && selecionados.soma <= parcial;
  const tudoValido = selecionados.soma <= pedida;

  const escolher = (lote: Sugestao, n: number) => {
    const outros = selecionados.soma - (ativosParaUnidades(lotesEscolhidos[lote.chave]?.ativos ?? [], escolha[lote.chave] ?? 0).soma);
    const teto = Math.max(0, Math.min(lote.quantidade, pedida - outros));
    const valor = Math.max(0, Math.min(teto, Math.floor(n) || 0));
    setEscolha((e) => ({ ...e, [lote.chave]: valor }));
    setLotesEscolhidos((l) => ({ ...l, [lote.chave]: lote }));
    setParcialDigitada("");
  };

  type Envio = { resposta: "atender" | "nao_atender"; quantidade?: number };
  const responder = useMutation({
    mutationFn: async (e: Envio) => await apiRequest("POST", `/api/consultas-de-estoque/${c.id}/responder`, {
      resposta: e.resposta,
      ...(e.resposta === "atender" ? { quantidade: e.quantidade, ativosIds: selecionados.ids } : {}),
      observacao: observacao.trim() || undefined,
      fotoUrl: fotoUrl ?? undefined,
    }),
    onSuccess: (_r, e) => {
      atualizarConsultas();
      queryClient.invalidateQueries({ queryKey: ["/api/estoque/reservas-ativas"] });
      toast({
        title: e.resposta === "nao_atender" ? "Respondido: não consigo atender" : `Respondido: atende ${e.quantidade} de ${pedida} un.`,
        description: `${c.pedidoPor ?? "Quem pediu"} foi avisado. Quem confirma e libera a peça é a Revisão Final. A solicitação foi para Respondidas.`,
      });
      onRespondida();
    },
    onError: (e: any) => {
      atualizarConsultas();
      toast({ title: "Não deu para responder", description: parseApiError(e).message, variant: "destructive" });
    },
  });

  const campo: React.CSSProperties = { boxSizing: "border-box", borderRadius: R.md, border: "1px solid #d6d3d1", padding: "0 12px", fontSize: 16, fontFamily: "inherit", color: T.text, backgroundColor: "#fff", minHeight: alvo };

  return (
    <div data-testid={`responder-${c.id}`} style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <h3 style={{ margin: 0, fontSize: FS.small, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "#57534e" }}>
          {buscaAplicada ? "Busca no acervo" : "O sistema sugere"}
        </h3>
        <p style={{ margin: "2px 0 0", fontSize: FS.small, color: "#57534e", lineHeight: 1.45 }}>
          {buscaAplicada
            ? "Peças livres do acervo que contêm o que você digitou."
            : "Peças livres do acervo com o mesmo tipo e a mesma medida — patrocinador igual primeiro."}
        </p>
      </div>

      <form role="search" onSubmit={(e) => { e.preventDefault(); setBuscaAplicada(busca.trim()); }} style={{ display: "flex", gap: 8 }}>
        <label htmlFor={`busca-${c.id}`} className="sr-only">Buscar no acervo</label>
        <input id={`busca-${c.id}`} data-testid={`input-busca-acervo-${c.id}`} type="search" value={busca} onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar no acervo: código, tipo, evento…" style={{ ...campo, flex: 1, minWidth: 0 }} />
        <button type="submit" aria-label="Buscar no acervo" data-testid={`button-busca-acervo-${c.id}`}
          style={{ minHeight: alvo, minWidth: alvo, borderRadius: R.md, border: "1px solid #d6d3d1", background: "#fff", color: T.text, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "0 12px", fontSize: FS.body, fontWeight: 700 }}>
          <Search aria-hidden="true" style={{ width: 15, height: 15 }} />{isMobile ? null : "Buscar"}
        </button>
        {buscaAplicada && (
          <button type="button" aria-label="Limpar a busca e voltar às sugestões" onClick={() => { setBusca(""); setBuscaAplicada(""); }}
            style={{ minHeight: alvo, minWidth: alvo, borderRadius: R.md, border: "1px solid #d6d3d1", background: "#fff", color: "#44403c", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
            <X aria-hidden="true" style={{ width: 15, height: 15 }} />
          </button>
        )}
      </form>

      {isLoading ? (
        <p role="status" data-testid="sugestoes-carregando" style={{ margin: 0, fontSize: FS.body, color: "#57534e" }}>Procurando no acervo…</p>
      ) : isError ? (
        <div role="alert" data-testid="sugestoes-erro" style={{ fontSize: FS.body, color: "#991b1b", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: R.md, padding: "10px 12px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ flex: "1 1 200px" }}>Não deu para procurar no acervo. Você ainda pode responder pelo que achou no galpão.</span>
          <button type="button" onClick={() => refetch()} style={{ minHeight: alvo, padding: "0 12px", borderRadius: R.md, border: "1px solid #fca5a5", background: "#fff", color: "#991b1b", fontWeight: 700, fontSize: FS.body, cursor: "pointer" }}>Tentar de novo</button>
        </div>
      ) : sugestoes && sugestoes.length === 0 ? (
        <p data-testid="sugestoes-vazio" style={{ margin: 0, fontSize: FS.body, color: "#44403c", background: "#fafaf9", border: "1px dashed #d6d3d1", borderRadius: R.md, padding: "12px 14px", lineHeight: 1.5 }}>
          {buscaAplicada
            ? `Nada livre no acervo com “${buscaAplicada}”. Procure no galpão e responda.`
            : data?.semMedida
              ? "A peça não tem medida cadastrada, então o sistema não consegue sugerir. Use a busca ou procure no galpão e responda."
              : "Nada parecido no acervo — procure no galpão e responda."}
        </p>
      ) : (
        <ul data-testid="lista-de-sugestoes" style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8, maxHeight: isMobile ? undefined : 360, overflowY: isMobile ? undefined : "auto" }}>
          {(sugestoes ?? []).map((s) => {
            const cond = conditionMeta(s.condicao);
            const usar = escolha[s.chave] ?? 0;
            const marcado = usar > 0;
            return (
              <li key={s.chave} data-testid={`sugestao-${s.chave}`} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: isMobile ? "wrap" : "nowrap", padding: 10, borderRadius: R.md, border: `1px solid ${marcado ? "#86efac" : "#e7e5e4"}`, backgroundColor: marcado ? "#f0fdf4" : "#fff" }}>
                <Miniatura src={s.thumb} alt={`Arte da peça ${s.origem.displayId ?? ""} do acervo`} lado={56} />
                <div style={{ flex: "1 1 180px", minWidth: 0, fontSize: FS.body, color: "#44403c", lineHeight: 1.45 }}>
                  <p style={{ margin: 0, fontWeight: 800, color: T.text, overflowWrap: "anywhere" }}>
                    {s.origem.tipo} · {medida(s.origem.largura, s.origem.altura)}
                  </p>
                  <p style={{ margin: 0, overflowWrap: "anywhere" }}>
                    {s.origem.eventName ? `Já usada em ${s.origem.eventName}${s.origem.eventInicio ? ` (${diaEMes(s.origem.eventInicio)})` : ""}` : "Sem evento de origem"}
                    {s.origem.displayId ? ` · ${s.origem.displayId}` : ""}
                  </p>
                  <p style={{ margin: "2px 0 0", display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                    <span style={{ fontSize: FS.small, fontWeight: 700, padding: "1px 8px", borderRadius: 999, color: cond.color, backgroundColor: cond.bg, border: `1px solid ${cond.border}` }}>{cond.label}</span>
                    <span style={{ fontSize: FS.small, fontWeight: 700, color: "#44403c" }}>{ROTULO_DA_RELACAO[s.relacao]}</span>
                    <span style={{ fontSize: FS.small, fontWeight: 700, color: "#44403c" }}>· {s.quantidade} un. livres</span>
                  </p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  <label style={{ display: "inline-flex", alignItems: "center", gap: 8, minHeight: alvo, cursor: "pointer", fontSize: FS.body, fontWeight: 700, color: T.text }}>
                    <input type="checkbox" data-testid={`check-sugestao-${s.chave}`} checked={marcado}
                      onChange={(e) => escolher(s, e.target.checked ? s.quantidade : 0)}
                      style={{ width: 20, height: 20, accentColor: "#15803d" }} />
                    Usar
                  </label>
                  <label htmlFor={`qtd-${c.id}-${s.chave}`} className="sr-only">Quantas unidades usar deste lote</label>
                  <input id={`qtd-${c.id}-${s.chave}`} data-testid={`qtd-sugestao-${s.chave}`} type="number" inputMode="numeric" min={0} max={s.quantidade}
                    value={usar || ""} placeholder="0" onChange={(e) => escolher(s, Number(e.target.value))}
                    style={{ ...campo, width: 72, textAlign: "center", padding: "0 6px" }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div>
        <label htmlFor={`obs-${c.id}`} style={{ display: "block", fontSize: FS.small, fontWeight: 800, color: "#57534e", marginBottom: 4 }}>Observação ou motivo (opcional)</label>
        <textarea id={`obs-${c.id}`} data-testid={`input-observacao-resposta-${c.id}`} rows={2} maxLength={MAX_OBSERVACAO_DA_CONSULTA} value={observacao}
          onChange={(e) => setObservacao(e.target.value)} placeholder="Ex.: 3 perfeitas; as outras 2 estão com ilhós rasgado."
          style={{ ...campo, width: "100%", padding: "8px 12px", lineHeight: 1.45, resize: "vertical" }} />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        {fotoUrl ? (
          <>
            <img src={fotoUrl} alt="Foto da peça no estoque" style={{ width: 56, height: 56, objectFit: "cover", borderRadius: R.md, border: "1px solid #e7e5e4" }} />
            <button type="button" onClick={() => setFotoUrl(null)} style={{ minHeight: alvo, padding: "0 12px", borderRadius: R.md, border: "1px solid #d6d3d1", background: "#fff", color: "#44403c", fontSize: FS.body, fontWeight: 700, cursor: "pointer" }}>Tirar a foto</button>
          </>
        ) : (
          <ObjectUploader maxFileSize={10485760} buttonVariant="outline" buttonClassName={isMobile ? "min-h-[44px]" : ""}
            onComplete={(r) => setFotoUrl(r.url)}
            onError={(e) => toast({ title: "A foto não subiu", description: e.message, variant: "destructive" })}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: FS.body, fontWeight: 700 }}>
              <Camera aria-hidden="true" style={{ width: 15, height: 15 }} /> Foto da peça (opcional)
            </span>
          </ObjectUploader>
        )}
      </div>

      {/* SEM VÍNCULO COM O ACERVO: dá para atender o que não está cadastrado
          (achou no galpão), mas nada fica reservado — dito antes do clique. */}
      <p role="status" data-testid={`aviso-vinculo-${c.id}`} style={{ margin: 0, fontSize: FS.small, lineHeight: 1.45, color: selecionados.ids.length > 0 ? "#166534" : "#92400e", display: "flex", gap: 6, alignItems: "flex-start" }}>
        {selecionados.ids.length > 0
          ? <CheckCircle2 aria-hidden="true" style={{ width: 13, height: 13, flexShrink: 0, marginTop: 2 }} />
          : <AlertTriangle aria-hidden="true" style={{ width: 13, height: 13, flexShrink: 0, marginTop: 2 }} />}
        <span>
          {selecionados.ids.length > 0
            ? `${selecionados.soma} un. do acervo ficam reservadas para esta peça ao atender.${selecionados.soma < pedida ? " O que passar disso vai sem vínculo com o acervo." : ""}`
            : "Nada escolhido: a resposta vai sem vínculo com o acervo — nenhuma peça fica reservada."}
        </span>
      </p>

      {/* Celular: as respostas ficam coladas no pé da tela, acima da barra do
          aparelho — a lista de sugestões pode ser longa. */}
      <div data-testid={`acoes-${c.id}`} style={{
        display: "flex", gap: 10, flexDirection: isMobile ? "column" : "row", flexWrap: "wrap", alignItems: isMobile ? "stretch" : "center",
        ...(isMobile ? { position: "sticky", bottom: 0, margin: "0 -14px -14px", padding: "10px 14px calc(10px + env(safe-area-inset-bottom))", background: "#fff", borderTop: "1px solid #e7e5e4", zIndex: 1 } : {}),
      }}>
        <button type="button" data-testid={`button-atender-${c.id}`} disabled={!tudoValido || responder.isPending}
          onClick={() => responder.mutate({ resposta: "atender", quantidade: pedida })}
          style={{ flex: isMobile ? undefined : "1 1 160px", minHeight: 48, borderRadius: R.md, border: "none", background: !tudoValido || responder.isPending ? "#e7e5e4" : "#15803d", color: !tudoValido || responder.isPending ? "#57534e" : "#fff", fontSize: 14, fontWeight: 800, cursor: !tudoValido || responder.isPending ? "not-allowed" : "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "0 16px" }}>
          <CheckCircle2 aria-hidden="true" style={{ width: 16, height: 16 }} />
          {responder.isPending ? "Respondendo…" : `Atender (${pedida})`}
        </button>
        {pedida > 1 && (
          <div style={{ display: "flex", gap: 6, alignItems: "center", flex: isMobile ? undefined : "1 1 200px" }}>
            <label htmlFor={`parcial-${c.id}`} className="sr-only">Quantas unidades o estoque atende (de 1 a {pedida - 1})</label>
            <input id={`parcial-${c.id}`} data-testid={`input-parcial-${c.id}`} type="number" inputMode="numeric" min={1} max={pedida - 1}
              value={parcialDigitada === "" ? (selecionados.soma > 0 && selecionados.soma < pedida ? selecionados.soma : "") : parcialDigitada} placeholder="0"
              onChange={(e) => setParcialDigitada(e.target.value)} style={{ ...campo, width: 72, minHeight: 48, textAlign: "center", padding: "0 6px" }} />
            <button type="button" data-testid={`button-atender-parcial-${c.id}`} disabled={!parcialValida || responder.isPending}
              onClick={() => responder.mutate({ resposta: "atender", quantidade: parcial })}
              title={!parcialValida ? `Diga quantas atende, de 1 a ${pedida - 1} (e não menos do que as escolhidas do acervo)` : undefined}
              style={{ flex: 1, minHeight: 48, borderRadius: R.md, border: "1px solid #15803d", background: "#fff", color: !parcialValida || responder.isPending ? "#57534e" : "#166534", fontSize: 14, fontWeight: 800, cursor: !parcialValida || responder.isPending ? "not-allowed" : "pointer", padding: "0 14px", whiteSpace: "nowrap" }}>
              {parcialValida ? `Atender parcial (${parcial} de ${pedida})` : "Atender parcial"}
            </button>
          </div>
        )}
        <button type="button" data-testid={`button-nao-consigo-${c.id}`} disabled={responder.isPending}
          onClick={() => { if (window.confirm(`Responder que NÃO consegue atender a peça ${c.peca.displayId ?? ""}?`)) responder.mutate({ resposta: "nao_atender" }); }}
          style={{ minHeight: isMobile ? 44 : 48, borderRadius: R.md, border: "1px solid #d6d3d1", background: "#fff", color: T.text, fontSize: 14, fontWeight: 700, cursor: responder.isPending ? "not-allowed" : "pointer", padding: "0 16px", whiteSpace: "nowrap" }}>
          Não consigo atender
        </button>
      </div>
    </div>
  );
}

/** O que aconteceu com a resposta — dito na aba Respondidas. */
function Desfecho({ c }: { c: Consulta }) {
  const linha: React.CSSProperties = { margin: 0, fontSize: FS.body, color: "#44403c", lineHeight: 1.5, overflowWrap: "anywhere" };
  if (c.status === "cancelada") return <p style={linha}>Cancelada por quem pediu, antes da resposta.</p>;
  const naRevisao = c.peca.status === "awaiting_final_review";
  const atendeu = c.status !== "nao_atendida";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
      <p style={{ ...linha, fontWeight: 800, color: T.text }}>
        {atendeu ? `Atendeu ${c.quantidadeAtendida ?? 0} de ${c.quantidadePedida} un. pedidas` : `Não conseguiu atender as ${c.quantidadePedida} un. pedidas`}
      </p>
      <p style={linha}>
        Respondido por {c.respondidoPor ?? "—"} em {dataEHora(c.respondidoEm)}
        {atendeu ? (c.ativosIds.length ? ` · ${c.ativosIds.length} ${c.ativosIds.length === 1 ? "peça reservada" : "peças reservadas"} do acervo` : " · sem vínculo com o acervo") : ""}
      </p>
      {c.observacaoResposta && <p style={linha}>“{c.observacaoResposta}”</p>}
      {atendeu && (
        <p style={{ ...linha, color: c.aplicadoEm ? "#166534" : "#92400e" }}>
          {c.aplicadoEm
            ? `Já é reaproveitamento na peça (${c.peca.reuseQty ?? 0} de ${c.peca.quantidade} un. reaproveitadas).`
            : naRevisao
              ? "Esperando a Revisão Final confirmar e liberar — é ela quem segue com a peça."
              : "A peça saiu da Revisão Final sem confirmar: entra como reaproveitamento quando for liberada."}
        </p>
      )}
      {c.fotoUrl && (
        <a href={c.fotoUrl} target="_blank" rel="noreferrer" style={{ alignSelf: "flex-start", minHeight: 44, display: "inline-flex", alignItems: "center", gap: 8, fontSize: FS.body, fontWeight: 700, color: T.accentText }}>
          <img src={c.fotoUrl} alt="Foto da peça no estoque" style={{ width: 44, height: 44, objectFit: "cover", borderRadius: R.sm, border: "1px solid #e7e5e4" }} />
          Ver a foto
        </a>
      )}
    </div>
  );
}

export default function SolicitacoesAoEstoquePagina() {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const search = useSearch();
  const [, navegar] = useLocation();
  const aba: Aba = new URLSearchParams(search).get("aba") === "respondidas" ? "respondidas" : "abertas";
  const podeResponder = user?.role === "grafica" || user?.role === "admin";
  const [procurandoEm, setProcurandoEm] = useState<string | null>(null);

  const irPara = (nova: Aba) => navegar(`/grafica/solicitacoes-ao-estoque${nova === "abertas" ? "" : "?aba=respondidas"}`, { replace: true });

  const { data, isLoading, isError, refetch } = useQuery<Consulta[]>({
    queryKey: ["/api/consultas-de-estoque", `?status=${ABAS.find((a) => a.id === aba)!.status}`],
  });
  const lista = Array.isArray(data) ? data : null;
  // A primeira aberta já vem pronta para procurar; as outras abrem no toque.
  const emProcura = procurandoEm && lista?.some((c) => c.id === procurandoEm) ? procurandoEm : lista?.[0]?.id ?? null;

  const cancelar = useMutation({
    mutationFn: async (id: string) => await apiRequest("POST", `/api/consultas-de-estoque/${id}/cancelar`, {}),
    onSuccess: () => { atualizarConsultas(); toast({ title: "Solicitação cancelada" }); },
    onError: (e: any) => { atualizarConsultas(); toast({ title: "Não deu para cancelar", description: parseApiError(e).message, variant: "destructive" }); },
  });

  const explicacao = podeResponder
    ? "A Revisão Final pediu peças ao estoque para reaproveitar. Procure — o sistema sugere as parecidas — e atenda tudo, atenda uma parte ou diga que não consegue. Atender reserva as peças escolhidas; quem confirma e libera a peça é a Revisão Final."
    : "O que você pediu ao estoque pela Revisão Final, e o que a Gráfica respondeu — inclusive das peças que você liberou sem esperar.";

  return (
    <div style={{ padding: isMobile ? 16 : "28px 32px", background: "#fafaf9", minHeight: "100%", boxSizing: "border-box" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
        <header>
          <h1 data-testid="title-solicitacoes-ao-estoque" style={{ margin: 0, fontFamily: "'Space Grotesk', sans-serif", fontSize: isMobile ? 22 : FS.h1, fontWeight: 700, color: T.text, letterSpacing: "-0.03em", lineHeight: 1.1 }}>
            Solicitações ao estoque
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: FS.body, color: "#57534e", maxWidth: 720, lineHeight: 1.5 }}>{explicacao}</p>
        </header>

        <div role="tablist" aria-label="Solicitações ao estoque" style={{ display: "flex", gap: 6, borderBottom: "1px solid #e7e5e4" }}>
          {ABAS.map((a) => {
            const ativa = a.id === aba;
            return (
              <button key={a.id} type="button" role="tab" aria-selected={ativa} data-testid={`aba-${a.id}`} onClick={() => irPara(a.id)}
                style={{ minHeight: 44, padding: "0 16px", border: "none", borderBottom: `3px solid ${ativa ? T.accentText : "transparent"}`, background: "transparent", color: ativa ? T.text : "#57534e", fontSize: 14, fontWeight: ativa ? 800 : 600, cursor: "pointer" }}>
                {a.rotulo}{ativa && lista ? ` (${lista.length})` : ""}
              </button>
            );
          })}
        </div>

        {isLoading ? (
          <p role="status" data-testid="consultas-carregando" style={{ margin: 0, fontSize: FS.body, color: "#57534e" }}>Carregando as solicitações…</p>
        ) : isError ? (
          <div role="alert" data-testid="consultas-erro" style={{ fontSize: FS.body, color: "#991b1b", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: R.lg, padding: "14px 16px", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ flex: "1 1 220px" }}>Não deu para carregar as solicitações ao estoque.</span>
            <button type="button" onClick={() => refetch()} style={{ minHeight: 44, padding: "0 14px", borderRadius: R.md, border: "1px solid #fca5a5", background: "#fff", color: "#991b1b", fontWeight: 700, fontSize: FS.body, cursor: "pointer" }}>Tentar de novo</button>
          </div>
        ) : lista && lista.length === 0 ? (
          <div data-testid="consultas-vazio" style={{ background: "#fff", border: "1px dashed #d6d3d1", borderRadius: R.lg, padding: "32px 20px", textAlign: "center" }}>
            <p style={{ margin: 0, fontSize: FS.strong, fontWeight: 800, color: T.text }}>{aba === "abertas" ? "Nenhuma solicitação aberta" : "Nenhuma solicitação respondida ainda"}</p>
            <p style={{ margin: "4px 0 0", fontSize: FS.body, color: "#57534e" }}>
              {aba === "abertas" ? "Quando a Revisão Final pedir peças ao estoque, o pedido aparece aqui." : "As respostas dadas ficam guardadas aqui."}
            </p>
          </div>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 14 }}>
            {(lista ?? []).map((c) => {
              const aberta = c.status === "aberta";
              const procurando = aberta && podeResponder && emProcura === c.id;
              const minha = c.pedidoPorId === user?.id;
              return (
                <li key={c.id} data-testid={`consulta-${c.id}`} style={{ background: "#fff", border: "1px solid #e7e5e4", borderRadius: R.lg, padding: 14, display: "grid", gap: 16, gridTemplateColumns: isMobile || !(procurando || !aberta) ? "1fr" : "minmax(0, 5fr) minmax(0, 7fr)", alignItems: "start" }}>
                  <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                    <div><Selo status={c.status} /></div>
                    <APeca c={c} isMobile={isMobile} />
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {aberta && podeResponder && !procurando && (
                        <button type="button" data-testid={`button-procurar-${c.id}`} onClick={() => setProcurandoEm(c.id)}
                          style={{ minHeight: 44, padding: "0 14px", borderRadius: R.md, border: "none", background: T.dark, color: "#fff", fontSize: FS.body, fontWeight: 800, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <PackageSearch aria-hidden="true" style={{ width: 15, height: 15 }} /> Procurar e responder
                        </button>
                      )}
                      {aberta && (minha || user?.role === "admin") && (
                        <button type="button" data-testid={`button-cancelar-${c.id}`} disabled={cancelar.isPending}
                          onClick={() => { if (window.confirm("Cancelar esta solicitação ao estoque?")) cancelar.mutate(c.id); }}
                          style={{ minHeight: 44, padding: "0 14px", borderRadius: R.md, border: "1px solid #d6d3d1", background: "#fff", color: "#44403c", fontSize: FS.body, fontWeight: 700, cursor: cancelar.isPending ? "not-allowed" : "pointer" }}>
                          Cancelar solicitação
                        </button>
                      )}
                    </div>
                    {aberta && !podeResponder && (
                      <p role="status" style={{ margin: 0, fontSize: FS.body, color: "#92400e" }}>Esperando a Gráfica responder. A peça pode ser liberada sem esperar.</p>
                    )}
                  </div>
                  {procurando ? <Responder c={c} isMobile={isMobile} onRespondida={() => setProcurandoEm(null)} /> : !aberta ? <Desfecho c={c} /> : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
