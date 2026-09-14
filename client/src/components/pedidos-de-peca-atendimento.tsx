// ─────────────────────────────────────────────────────────────────────────────
// PEDIDOS DE PEÇAS — a aba do Atendimento (dono, 14/09).
//
// À esquerda, o pedido: evento, patrocinador, quantidade (se souber),
// observação e referências. À direita, o que já foi pedido e em que pé está.
//
// O PEDIDO É UMA SOLICITAÇÃO, NÃO UMA PEÇA: nada aqui fala de peça até o
// pedido ser atendido — aí ele leva à peça que saiu dele.
//
// Refino "nota 10" (14/09), o que a lista responde de relance:
//   · há quanto tempo cada pedido espera (e quais estão parados);
//   · se o evento ainda aceita a peça;
//   · o que o solicitante não informou;
//   · de um pedido atendido, qual peça saiu.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowDownWideNarrow, ImagePlus, Inbox, Send, X } from "lucide-react";
import type { Sponsor } from "@shared/schema";
import {
  IDADE_DE_ATENCAO,
  MAX_REFERENCIAS_DO_PEDIDO,
  ROTULO_DO_PEDIDO,
  ehChaveDePedidos,
  idadeDoPedido,
  lacunasDoPedido,
  pedidoEspera,
  quantidadeDoPedido,
  rotuloDasLacunas,
  seloDoEventoDoPedido,
  textoDaObservacao,
  type PedidoDePeca,
  type SeloDoEvento,
  type StatusDoPedido,
} from "@shared/pedidos-de-peca";
import { FilterSelect } from "@/components/filter-select";
import { ObjectUploader } from "@/components/ObjectUploader";
import { MotivoDoPedidoDialog } from "@/components/motivo-do-pedido-dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { miniatura } from "@/lib/miniatura";
import { motivoEventoFinalizado, todayBusinessMs } from "@/lib/status";
import { T, FS, R } from "@/lib/theme";
import { useIsMobile } from "@/hooks/use-mobile";

export const TOM_DO_PEDIDO: Record<StatusDoPedido, { cor: string; fundo: string; borda: string }> = {
  aberto:    { cor: "#92400e", fundo: "#fffbeb", borda: "#fde68a" },
  atendido:  { cor: "#065f46", fundo: "#ecfdf5", borda: "#a7f3d0" },
  recusado:  { cor: "#991b1b", fundo: "#fef2f2", borda: "#fecaca" },
  cancelado: { cor: "#57534e", fundo: "#f5f5f4", borda: "#e7e5e4" },
};

export const invalidarPedidos = () =>
  queryClient.invalidateQueries({ predicate: (q) => ehChaveDePedidos(q.queryKey[0]) });

export const quandoFoi = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";

const diaEMes = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "—";

const diaDoEvento = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" }) : "";

/** Miniaturas das referências, cada uma abre o original numa aba nova. */
export function ReferenciasDoPedido({ urls, tamanho = 44, onRemover, legenda = true }: {
  urls: string[]; tamanho?: number; onRemover?: (i: number) => void; legenda?: boolean;
}) {
  if (urls.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {urls.map((url, i) => (
          <div key={`${url}-${i}`} style={{ position: "relative" }}>
            <a href={url} target="_blank" rel="noopener noreferrer" title="Abrir referência"
              style={{ display: "block", width: tamanho, height: tamanho, borderRadius: R.md, overflow: "hidden", border: "1px solid #e7e5e4", background: "#f5f5f4" }}>
              <img src={miniatura(url)} alt={`Referência ${i + 1}`} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </a>
            {onRemover && (
              <button type="button" onClick={() => onRemover(i)} aria-label={`Remover referência ${i + 1}`}
                style={{ position: "absolute", top: -6, right: -6, width: 22, height: 22, borderRadius: R.pill, border: "none", background: "#1c1917", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <X size={11} />
              </button>
            )}
          </div>
        ))}
      </div>
      {/* A referência é do solicitante — não é a arte final. */}
      {legenda && <span style={{ fontSize: FS.small, color: "#57534e" }}>Referência do solicitante — não é arte final</span>}
    </div>
  );
}

/** Há quanto tempo o pedido espera. Só em pedido aberto: idade de pedido
 *  resolvido é histórico, não é ação. */
export function IdadeDoPedido({ pedido, agora }: { pedido: PedidoDePeca; agora: Date }) {
  if (!pedidoEspera(pedido.status)) return null;
  const idade = idadeDoPedido(pedido.createdAt, agora);
  const cor = idade.nivel === "parado" ? "#b91c1c" : idade.nivel === "atencao" ? "#b45309" : "#57534e";
  return (
    <span data-testid={`cell-idade-pedido-${pedido.id}`} title={`Entrou em ${quandoFoi(pedido.createdAt)}`}
      style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end", lineHeight: 1.25, flexShrink: 0, textAlign: "right" }}>
      <span style={{ fontSize: FS.body, fontWeight: idade.nivel === "normal" ? 600 : 700, color: cor, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
        {idade.texto}
      </span>
      {idade.nivel === "parado" && <span style={{ fontSize: FS.micro, fontWeight: 700, color: "#b91c1c", whiteSpace: "nowrap" }}>pedido parado</span>}
    </span>
  );
}

export function SeloDoEventoChip({ selo, pedidoId }: { selo: SeloDoEvento | null; pedidoId: string }) {
  if (!selo) return null;
  const caminhao = selo.tipo === "caminhao";
  return (
    <span data-testid={`selo-evento-${pedidoId}`} title={selo.explicacao}
      style={{ display: "inline-flex", alignItems: "center", fontSize: FS.small, fontWeight: 700, whiteSpace: "nowrap", borderRadius: R.pill, padding: "1px 8px",
        color: caminhao ? "#92400e" : "#57534e", background: caminhao ? "#fffbeb" : "#f5f5f4", border: `1px solid ${caminhao ? "#fde68a" : "#e7e5e4"}` }}>
      {selo.texto}
    </span>
  );
}

export function SeloDoQueFalta({ pedido }: { pedido: PedidoDePeca }) {
  const faltam = lacunasDoPedido(pedido);
  const rotulo = rotuloDasLacunas(faltam);
  if (!rotulo) return null;
  return (
    <span data-testid={`selo-falta-${pedido.id}`} title={`O solicitante não informou: ${faltam.join(", ")}`}
      style={{ display: "inline-flex", alignItems: "center", fontSize: FS.small, fontWeight: 700, whiteSpace: "nowrap", borderRadius: R.pill, padding: "1px 8px", color: "#57534e", background: "#ffffff", border: "1px dashed #d6d3d1" }}>
      {rotulo}
    </span>
  );
}

/** "Atendido em 22/08 por Marina Alves · peça #0041" — o código leva à peça. */
export function LinhaDoAtendimento({ pedido }: { pedido: PedidoDePeca }) {
  if (pedido.status !== "atendido") return null;
  return (
    <p style={{ margin: 0, fontSize: FS.body, color: "#065f46", lineHeight: 1.5 }}>
      Atendido em {diaEMes(pedido.resolvidoEm)}{pedido.resolvidoPor ? ` por ${pedido.resolvidoPor}` : ""} · peça{" "}
      {pedido.itemId ? (
        <Link href={`/eventos/${pedido.eventId}?item=${pedido.itemId}`} data-testid={`link-peca-gerada-${pedido.id}`}
          style={{ fontFamily: "'DM Mono', monospace", fontWeight: 800, color: "#065f46", textDecoration: "underline", textUnderlineOffset: 2 }}>
          {pedido.itemDisplayId ?? "abrir"}
        </Link>
      ) : (
        <span>removida</span>
      )}
      {pedido.itemType ? ` (${pedido.itemType})` : ""}
    </p>
  );
}

export function ObservacaoDoPedido({ valor }: { valor: unknown }) {
  const texto = textoDaObservacao(valor);
  if (!texto) return null;
  return (
    <p style={{ margin: 0, fontSize: FS.body, color: "#44403c", lineHeight: 1.5, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
      “{texto}”
    </p>
  );
}

const vazio = { eventId: "", sponsorId: "", quantidade: "", observacao: "", referencias: [] as string[] };

const CARTAO: React.CSSProperties = { background: "#ffffff", border: "1px solid #e7e5e4", borderRadius: R.lg, boxShadow: "0 1px 2px rgba(28,25,23,0.06)" };
const ROTULO: React.CSSProperties = { display: "block", fontSize: FS.small, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "#57534e", marginBottom: 6 };
const CAMPO: React.CSSProperties = { width: "100%", boxSizing: "border-box", minHeight: 40, padding: "9px 12px", borderRadius: R.md, border: "1px solid #e7e5e4", background: "#ffffff", fontSize: 14, color: T.text, outline: "none" };

export function PedidosDePecaAtendimento({ podePedir, userId, isAdmin }: {
  /** atendimento | admin — a régua do servidor. */
  podePedir: boolean;
  userId: string | null;
  isAdmin: boolean;
}) {
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const [form, setForm] = useState(vazio);
  const [filtro, setFiltro] = useState<StatusDoPedido | "todos">("aberto");
  const [ordem, setOrdem] = useState<"recentes" | "antigos">("recentes");
  const [cancelando, setCancelando] = useState<PedidoDePeca | null>(null);
  const agora = new Date();
  const alvo = isMobile ? 44 : 34;

  const { data: pedidos = [], isLoading, isError, refetch } = useQuery<PedidoDePeca[]>({ queryKey: ["/api/pedidos-de-peca"] });
  const { data: eventos = [] } = useQuery<any[]>({ queryKey: ["/api/events"] });
  const { data: patrocinadores = [] } = useQuery<Sponsor[]>({ queryKey: ["/api/sponsors"], enabled: podePedir });
  const { data: vinculos = [] } = useQuery<Array<{ sponsorId: string }>>({
    queryKey: ["/api/events", form.eventId, "sponsors"],
    enabled: podePedir && !!form.eventId,
  });

  const hoje = todayBusinessMs();
  const eventoPorId = new Map<string, any>(eventos.map((e) => [e.id, e]));
  const seloDe = (p: PedidoDePeca): SeloDoEvento | null => {
    if (!pedidoEspera(p.status)) return null;
    const ev = eventoPorId.get(p.eventId);
    return ev ? seloDoEventoDoPedido({ motivoFim: motivoEventoFinalizado(ev, hoje), saida: ev.truckDepartureDate ?? null }, agora) : null;
  };

  const eventosAbertos = eventos
    .filter((e) => !motivoEventoFinalizado(e, hoje))
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
  const opcoesDeEvento = eventosAbertos.map((e) => ({ value: e.id, label: `${e.name}${e.startDate ? ` · ${diaDoEvento(e.startDate)}` : ""}` }));
  const doEvento = new Set(vinculos.map((v) => v.sponsorId));
  const opcoesDePatrocinador = patrocinadores
    .filter((s) => doEvento.size === 0 || doEvento.has(s.id))
    .map((s) => ({ value: s.id, label: s.name }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));

  const quantidadeDigitada = form.quantidade.trim();
  const quantidade = quantidadeDigitada === "" ? null : parseInt(quantidadeDigitada, 10);
  const faltando = !form.eventId ? "Escolha o evento"
    : !form.sponsorId ? "Escolha o patrocinador"
    : quantidade !== null && !(quantidade >= 1) ? "A quantidade precisa ser 1 ou mais — ou deixe em branco"
    : form.observacao.trim().length < 3 ? "Descreva o que precisa"
    : null;

  const enviar = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/pedidos-de-peca", {
      eventId: form.eventId,
      sponsorId: form.sponsorId,
      quantidade,
      observacao: form.observacao.trim(),
      referencias: form.referencias,
    })).json(),
    onSuccess: () => {
      toast({ title: "Pedido enviado", description: "Quem monta a lista foi avisado." });
      setForm((f) => ({ ...vazio, eventId: f.eventId }));
      setFiltro("aberto");
      invalidarPedidos();
    },
    onError: (e: Error) => toast({ title: "Não deu para enviar o pedido", description: e.message, variant: "destructive" }),
  });

  const cancelar = useMutation({
    mutationFn: async ({ id, motivo }: { id: string; motivo: string }) =>
      (await apiRequest("PATCH", `/api/pedidos-de-peca/${id}/cancelar`, { motivo })).json(),
    onSuccess: () => { toast({ title: "Pedido cancelado", description: "Quem monta a lista recebeu o motivo." }); setCancelando(null); invalidarPedidos(); },
    onError: (e: Error) => toast({ title: "Não deu para cancelar", description: e.message, variant: "destructive" }),
  });

  // Contadores sobre a BASE inteira — o chip diz quantos existem, não
  // quantos sobram depois do recorte.
  const contagem = (s: StatusDoPedido) => pedidos.filter((p) => p.status === s).length;
  const FILTROS: Array<{ k: StatusDoPedido | "todos"; rotulo: string; n: number }> = [
    { k: "aberto", rotulo: "Abertos", n: contagem("aberto") },
    { k: "atendido", rotulo: "Atendidos", n: contagem("atendido") },
    { k: "recusado", rotulo: "Recusados", n: contagem("recusado") },
    { k: "cancelado", rotulo: "Cancelados", n: contagem("cancelado") },
    { k: "todos", rotulo: "Todos", n: pedidos.length },
  ];

  const porEntrada = (a: PedidoDePeca, b: PedidoDePeca) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  const recortados = filtro === "todos" ? pedidos : pedidos.filter((p) => p.status === filtro);
  const visiveis = [...recortados].sort((a, b) => (ordem === "antigos" ? porEntrada(a, b) : porEntrada(b, a)));

  // Faixa dos parados: derivada da base, sem versão "tudo certo".
  const parados = pedidos
    .filter((p) => pedidoEspera(p.status) && idadeDoPedido(p.createdAt, agora).dias > IDADE_DE_ATENCAO)
    .sort(porEntrada);

  return (
    <div data-testid="aba-pedidos-de-peca" style={{
      display: "grid", gap: 16, alignItems: "start",
      gridTemplateColumns: podePedir && !isMobile ? "minmax(300px, 380px) minmax(0, 1fr)" : "minmax(0, 1fr)",
    }}>
      {podePedir && (
        <form
          data-testid="form-pedido-de-peca"
          onSubmit={(e) => { e.preventDefault(); if (!faltando && !enviar.isPending) enviar.mutate(); }}
          style={{ ...CARTAO, padding: 18, display: "flex", flexDirection: "column", gap: 14 }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: T.text, fontFamily: "'Space Grotesk', sans-serif" }}>Pedir peça para a lista</h2>
            <p style={{ margin: "4px 0 0", fontSize: FS.body, color: "#57534e", lineHeight: 1.45 }}>
              Quem monta a lista recebe o pedido dentro do evento e cria a peça.
            </p>
          </div>

          <div>
            <label style={ROTULO}>Evento</label>
            <FilterSelect
              kind="field" fullWidth hideWhenEmpty={false}
              label="Evento" allLabel="Escolha o evento" showAllLabelWhenEmpty
              value={form.eventId}
              onChange={(v) => setForm((f) => ({ ...f, eventId: v, sponsorId: "" }))}
              options={opcoesDeEvento}
              searchPlaceholder="Buscar evento..." emptyText="Nenhum evento em andamento."
              testId="select-pedido-evento"
              triggerStyle={{ ...CAMPO, height: "auto" }}
            />
          </div>

          <div>
            <label style={ROTULO}>Patrocinador</label>
            {form.eventId ? (
              <FilterSelect
                kind="field" fullWidth hideWhenEmpty={false}
                label="Patrocinador" allLabel="Escolha o patrocinador" showAllLabelWhenEmpty
                value={form.sponsorId}
                onChange={(v) => setForm((f) => ({ ...f, sponsorId: v }))}
                options={opcoesDePatrocinador}
                searchPlaceholder="Buscar patrocinador..." emptyText="Nenhum patrocinador encontrado."
                testId="select-pedido-patrocinador"
                triggerStyle={{ ...CAMPO, height: "auto" }}
              />
            ) : (
              <div style={{ ...CAMPO, color: "#78716c", background: "#fafaf9" }}>Escolha o evento primeiro</div>
            )}
          </div>

          <div>
            <label htmlFor="pedido-quantidade" style={ROTULO}>
              Quantidade <span style={{ fontWeight: 600, textTransform: "none", letterSpacing: 0 }}>(se souber)</span>
            </label>
            <input id="pedido-quantidade" data-testid="input-pedido-quantidade" type="number" min={1} inputMode="numeric"
              value={form.quantidade} placeholder="—"
              onChange={(e) => setForm((f) => ({ ...f, quantidade: e.target.value }))}
              style={{ ...CAMPO, maxWidth: 140 }} />
          </div>

          <div>
            <label htmlFor="pedido-observacao" style={ROTULO}>Observação</label>
            <textarea id="pedido-observacao" data-testid="input-pedido-observacao"
              value={form.observacao}
              onChange={(e) => setForm((f) => ({ ...f, observacao: e.target.value }))}
              placeholder="Ex.: 2 banners 3×1 com a nova logo, para a área de largada"
              rows={4}
              style={{ ...CAMPO, resize: "vertical", lineHeight: 1.45, fontFamily: "inherit" }} />
          </div>

          <div>
            <span style={ROTULO}>Referências <span style={{ fontWeight: 600, textTransform: "none", letterSpacing: 0 }}>(opcional)</span></span>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <ReferenciasDoPedido
                urls={form.referencias}
                tamanho={56}
                legenda={false}
                onRemover={(i) => setForm((f) => ({ ...f, referencias: f.referencias.filter((_, j) => j !== i) }))}
              />
              {form.referencias.length < MAX_REFERENCIAS_DO_PEDIDO && (
                <ObjectUploader
                  multiple
                  buttonVariant="outline"
                  onComplete={({ url }) => setForm((f) => (f.referencias.length >= MAX_REFERENCIAS_DO_PEDIDO ? f : { ...f, referencias: [...f.referencias, url] }))}
                  onError={(e) => toast({ title: "Não deu para enviar a imagem", description: e.message, variant: "destructive" })}
                >
                  <ImagePlus className="h-4 w-4 mr-2" /> Adicionar referência
                </ObjectUploader>
              )}
              <span style={{ fontSize: FS.small, color: "#57534e" }}>Uma imagem do que você imagina — a arte final é feita pela Arte.</span>
            </div>
          </div>

          <button type="submit" data-testid="button-enviar-pedido"
            disabled={!!faltando || enviar.isPending}
            title={faltando ?? undefined}
            style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
              height: 44, borderRadius: R.md, border: "none",
              background: faltando || enviar.isPending ? "#e7e5e4" : "#1c1917",
              color: faltando || enviar.isPending ? "#78716c" : "#ffffff",
              fontSize: 14, fontWeight: 800, cursor: faltando || enviar.isPending ? "not-allowed" : "pointer",
            }}>
            <Send size={15} /> {enviar.isPending ? "Enviando…" : "Enviar pedido"}
          </button>
          {faltando && <p style={{ margin: "-6px 0 0", fontSize: FS.small, color: "#57534e" }}>{faltando}.</p>}
        </form>
      )}

      <section style={{ ...CARTAO, overflow: "hidden", minWidth: 0 }} aria-labelledby="titulo-pedidos-feitos">
        <div style={{ padding: "14px 16px", borderBottom: "1px solid #f1f0ef", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <h2 id="titulo-pedidos-feitos" style={{ margin: 0, fontSize: 15, fontWeight: 800, color: T.text, fontFamily: "'Space Grotesk', sans-serif" }}>Pedidos feitos</h2>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <div role="group" aria-label="Filtrar pedidos" style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {FILTROS.map((f) => {
                const ativo = filtro === f.k;
                return (
                  <button key={f.k} type="button" aria-pressed={ativo} data-testid={`filtro-pedidos-${f.k}`}
                    onClick={() => setFiltro(f.k)}
                    style={{
                      height: isMobile ? 44 : 30, padding: "0 10px", borderRadius: R.pill, cursor: "pointer",
                      border: `1px solid ${ativo ? "#1c1917" : "#e7e5e4"}`,
                      background: ativo ? "#1c1917" : "#ffffff",
                      // Chip zerado esmaece, mas continua legível.
                      color: ativo ? "#ffffff" : f.n === 0 ? "#78716c" : "#44403c",
                      fontSize: 12, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 5,
                    }}>
                    {f.rotulo}<span style={{ fontVariantNumeric: "tabular-nums" }}>{f.n}</span>
                  </button>
                );
              })}
            </div>
            <button type="button" data-testid="button-ordem-pedidos" onClick={() => setOrdem((o) => (o === "recentes" ? "antigos" : "recentes"))}
              title="Trocar a ordem da lista"
              style={{ height: isMobile ? 44 : 30, padding: "0 10px", borderRadius: R.pill, border: "1px solid #e7e5e4", background: "#ffffff", color: "#44403c", fontSize: 12, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5 }}>
              <ArrowDownWideNarrow size={13} aria-hidden="true" />
              {ordem === "recentes" ? "Mais recentes primeiro" : "Mais antigos primeiro"}
            </button>
          </div>
        </div>

        {parados.length > 0 && (
          <div data-testid="faixa-pedidos-parados" role="status"
            style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "12px 16px", background: "#fffbeb", borderBottom: "1px solid #fde68a" }}>
            <AlertTriangle size={18} color="#b45309" aria-hidden="true" style={{ flexShrink: 0 }} />
            <div style={{ flex: "1 1 260px", minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#78350f" }}>
                {parados.length} {parados.length === 1 ? "pedido esperando" : "pedidos esperando"} há mais de {IDADE_DE_ATENCAO} dias
              </div>
              <div style={{ fontSize: 11, color: "#78350f", marginTop: 2, lineHeight: 1.45 }}>
                {parados.slice(0, 3).map((p) => `${p.pedidoPor ?? "—"} · ${p.eventName ?? "evento"} · ${idadeDoPedido(p.createdAt, agora).texto}`).join("; ")}
              </div>
            </div>
            <button type="button" data-testid="button-ver-mais-antigos"
              onClick={() => { setFiltro("aberto"); setOrdem("antigos"); }}
              style={{ height: alvo, padding: "0 12px", borderRadius: R.md, border: "1px solid #fcd34d", background: "#ffffff", color: "#78350f", fontSize: 12.5, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" }}>
              Ver os {parados.length} mais antigos
            </button>
          </div>
        )}

        {isLoading ? (
          <p style={{ margin: 0, padding: 20, fontSize: FS.body, color: "#57534e" }}>Carregando pedidos…</p>
        ) : isError ? (
          <p style={{ margin: 0, padding: 20, fontSize: FS.body, color: "#b91c1c" }}>
            Não foi possível carregar os pedidos.{" "}
            <button type="button" onClick={() => refetch()} style={{ border: "none", background: "none", fontWeight: 800, textDecoration: "underline", cursor: "pointer", color: T.text }}>Tentar de novo</button>
          </p>
        ) : visiveis.length === 0 ? (
          <div style={{ padding: "32px 16px", textAlign: "center", color: "#57534e" }}>
            <Inbox size={26} color="#78716c" aria-hidden="true" />
            <p style={{ margin: "8px 0 0", fontSize: 13.5, fontWeight: 700, color: T.text }}>
              {filtro === "aberto" ? "Nenhum pedido esperando a lista" : "Nenhum pedido aqui"}
            </p>
          </div>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {visiveis.map((p) => {
              const tom = TOM_DO_PEDIDO[p.status] ?? TOM_DO_PEDIDO.cancelado;
              const podeCancelar = p.status === "aberto" && podePedir && (isAdmin || !p.pedidoPorId || p.pedidoPorId === userId);
              const patrocinador = p.sponsorName ?? "sem patrocinador";
              return (
                <li key={p.id} data-testid={`pedido-${p.id}`} style={{ padding: "14px 16px", borderBottom: "1px solid #f1f0ef", display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <div style={{ flex: "1 1 auto", minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                      <span style={{ flexShrink: 0, fontSize: FS.small, fontWeight: 800, color: tom.cor, background: tom.fundo, border: `1px solid ${tom.borda}`, borderRadius: R.pill, padding: "2px 9px" }}>
                        {ROTULO_DO_PEDIDO[p.status] ?? p.status}
                      </span>
                      <strong style={{ flexShrink: 0, fontSize: 14, color: p.quantidade == null ? "#57534e" : T.text, fontWeight: p.quantidade == null ? 600 : 800 }}>
                        {quantidadeDoPedido(p.quantidade)}
                      </strong>
                      {/* min-width 0 + elipse: nome longo não quebra a linha. */}
                      <span title={patrocinador} data-testid={`patrocinador-pedido-${p.id}`}
                        style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13.5, fontWeight: 700, color: T.text }}>
                        {patrocinador}
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <span style={{ fontSize: FS.body, color: "#57534e" }}>
                        {p.eventName ?? "Evento removido"}{p.eventStart ? ` · ${diaDoEvento(p.eventStart)}` : ""}
                      </span>
                      <SeloDoEventoChip selo={seloDe(p)} pedidoId={p.id} />
                      {pedidoEspera(p.status) && <SeloDoQueFalta pedido={p} />}
                    </div>
                    <ObservacaoDoPedido valor={p.observacao} />
                    <ReferenciasDoPedido urls={p.referencias ?? []} />
                    <LinhaDoAtendimento pedido={p} />
                    {p.status === "recusado" && (
                      <p style={{ margin: 0, fontSize: FS.body, color: "#991b1b" }}>
                        Recusado em {diaEMes(p.resolvidoEm)}{p.resolvidoPor ? ` por ${p.resolvidoPor}` : ""}: {p.motivoRecusa}
                      </p>
                    )}
                    {p.status === "cancelado" && (
                      <p style={{ margin: 0, fontSize: FS.body, color: "#57534e" }}>
                        Cancelado em {diaEMes(p.resolvidoEm)}{p.motivoCancelamento ? `: ${p.motivoCancelamento}` : ""}
                      </p>
                    )}
                    <span style={{ fontSize: FS.small, color: "#57534e" }}>Pedido por {p.pedidoPor ?? "—"} · entrou em {quandoFoi(p.createdAt)}</span>
                  </div>
                  <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
                    <IdadeDoPedido pedido={p} agora={agora} />
                    {podeCancelar && (
                      <button type="button" data-testid={`button-cancelar-pedido-${p.id}`}
                        onClick={() => setCancelando(p)}
                        style={{ height: alvo, padding: "0 10px", borderRadius: R.md, border: "1px solid #e7e5e4", background: "#ffffff", color: "#44403c", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                        Cancelar
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <MotivoDoPedidoDialog
        pedido={cancelando}
        titulo="Cancelar pedido"
        aviso="Quem monta a lista é avisado com este motivo — ele pode já estar trabalhando no pedido."
        rotuloConfirmar="Cancelar pedido"
        pendente={cancelar.isPending}
        onConfirmar={(motivo) => { if (cancelando) cancelar.mutate({ id: cancelando.id, motivo }); }}
        onFechar={() => setCancelando(null)}
      />
    </div>
  );
}
