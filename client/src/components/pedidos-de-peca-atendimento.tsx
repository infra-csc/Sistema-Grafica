// ─────────────────────────────────────────────────────────────────────────────
// PEDIDOS DE PEÇAS — a aba do Atendimento (dono, 14/09).
//
// À esquerda, o pedido: evento, patrocinador, quantidade, observação e
// referências (várias, opcionais). À direita, o que já foi pedido e em que
// pé está — aberto, atendido (com a peça criada), recusado (com o motivo) ou
// cancelado. Quem monta a lista recebe o pedido na tela de Eventos e dentro do
// evento; as regras moram em server/routes/pedidos-de-peca.ts.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ImagePlus, Inbox, Send, X } from "lucide-react";
import type { Sponsor } from "@shared/schema";
import {
  MAX_REFERENCIAS_DO_PEDIDO,
  ROTULO_DO_PEDIDO,
  ehChaveDePedidos,
  type PedidoDePeca,
  type StatusDoPedido,
} from "@shared/pedidos-de-peca";
import { FilterSelect } from "@/components/filter-select";
import { ObjectUploader } from "@/components/ObjectUploader";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { miniatura } from "@/lib/miniatura";
import { motivoEventoFinalizado, todayBusinessMs } from "@/lib/status";
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

const diaDoEvento = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" }) : "";

/** Miniaturas das referências, cada uma abre o original numa aba nova. */
export function ReferenciasDoPedido({ urls, tamanho = 44, onRemover }: { urls: string[]; tamanho?: number; onRemover?: (i: number) => void }) {
  if (urls.length === 0) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {urls.map((url, i) => (
        <div key={`${url}-${i}`} style={{ position: "relative" }}>
          <a href={url} target="_blank" rel="noopener noreferrer" title="Abrir referência"
            style={{ display: "block", width: tamanho, height: tamanho, borderRadius: 8, overflow: "hidden", border: "1px solid #e7e5e4", background: "#f5f5f4" }}>
            <img src={miniatura(url)} alt={`Referência ${i + 1}`} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </a>
          {onRemover && (
            <button type="button" onClick={() => onRemover(i)} aria-label={`Remover referência ${i + 1}`}
              style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: 999, border: "none", background: "#1c1917", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <X size={11} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

const vazio = { eventId: "", sponsorId: "", quantidade: "1", observacao: "", referencias: [] as string[] };

const CARTAO: React.CSSProperties = { background: "#ffffff", border: "1px solid #e7e5e4", borderRadius: 12, boxShadow: "0 1px 2px rgba(28,25,23,0.06)" };
const ROTULO: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "#746e69", marginBottom: 6 };
const CAMPO: React.CSSProperties = { width: "100%", boxSizing: "border-box", minHeight: 40, padding: "9px 12px", borderRadius: 8, border: "1px solid #e7e5e4", background: "#ffffff", fontSize: 14, color: "#1c1917", outline: "none" };

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

  const { data: pedidos = [], isLoading, isError, refetch } = useQuery<PedidoDePeca[]>({ queryKey: ["/api/pedidos-de-peca"] });
  const { data: eventos = [] } = useQuery<any[]>({ queryKey: ["/api/events"], enabled: podePedir });
  const { data: patrocinadores = [] } = useQuery<Sponsor[]>({ queryKey: ["/api/sponsors"], enabled: podePedir });
  const { data: vinculos = [] } = useQuery<Array<{ sponsorId: string }>>({
    queryKey: ["/api/events", form.eventId, "sponsors"],
    enabled: podePedir && !!form.eventId,
  });

  const hoje = todayBusinessMs();
  const eventosAbertos = useMemo(
    () => eventos
      .filter((e) => !motivoEventoFinalizado(e, hoje))
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()),
    [eventos, hoje],
  );
  const opcoesDeEvento = eventosAbertos.map((e) => ({ value: e.id, label: `${e.name}${e.startDate ? ` · ${diaDoEvento(e.startDate)}` : ""}` }));
  const doEvento = new Set(vinculos.map((v) => v.sponsorId));
  const opcoesDePatrocinador = patrocinadores
    .filter((s) => doEvento.size === 0 || doEvento.has(s.id))
    .map((s) => ({ value: s.id, label: s.name }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));

  const quantidade = parseInt(form.quantidade, 10);
  const faltando = !form.eventId ? "Escolha o evento"
    : !form.sponsorId ? "Escolha o patrocinador"
    : !(quantidade >= 1) ? "Informe a quantidade"
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
    mutationFn: async (id: string) => (await apiRequest("PATCH", `/api/pedidos-de-peca/${id}/cancelar`, {})).json(),
    onSuccess: () => { toast({ title: "Pedido cancelado" }); invalidarPedidos(); },
    onError: (e: Error) => toast({ title: "Não deu para cancelar", description: e.message, variant: "destructive" }),
  });

  const contagem = (s: StatusDoPedido) => pedidos.filter((p) => p.status === s).length;
  const visiveis = filtro === "todos" ? pedidos : pedidos.filter((p) => p.status === filtro);
  const FILTROS: Array<{ k: StatusDoPedido | "todos"; rotulo: string; n: number }> = [
    { k: "aberto", rotulo: "Abertos", n: contagem("aberto") },
    { k: "atendido", rotulo: "Atendidos", n: contagem("atendido") },
    { k: "recusado", rotulo: "Recusados", n: contagem("recusado") },
    { k: "cancelado", rotulo: "Cancelados", n: contagem("cancelado") },
    { k: "todos", rotulo: "Todos", n: pedidos.length },
  ];

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
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "#1c1917", fontFamily: "'Space Grotesk', sans-serif" }}>Pedir peça para a lista</h2>
            <p style={{ margin: "4px 0 0", fontSize: 12.5, color: "#746e69", lineHeight: 1.45 }}>
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
              <div style={{ ...CAMPO, color: "#a8a29e", background: "#fafaf9" }}>Escolha o evento primeiro</div>
            )}
          </div>

          <div>
            <label htmlFor="pedido-quantidade" style={ROTULO}>Quantidade</label>
            <input id="pedido-quantidade" data-testid="input-pedido-quantidade" type="number" min={1} inputMode="numeric"
              value={form.quantidade}
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
            </div>
          </div>

          <button type="submit" data-testid="button-enviar-pedido"
            disabled={!!faltando || enviar.isPending}
            title={faltando ?? undefined}
            style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
              height: 42, borderRadius: 9, border: "none",
              background: faltando || enviar.isPending ? "#e7e5e4" : "#1c1917",
              color: faltando || enviar.isPending ? "#a8a29e" : "#ffffff",
              fontSize: 14, fontWeight: 800, cursor: faltando || enviar.isPending ? "not-allowed" : "pointer",
            }}>
            <Send size={15} /> {enviar.isPending ? "Enviando…" : "Enviar pedido"}
          </button>
          {faltando && <p style={{ margin: "-6px 0 0", fontSize: 12, color: "#746e69" }}>{faltando}.</p>}
        </form>
      )}

      <section style={{ ...CARTAO, overflow: "hidden" }} aria-labelledby="titulo-pedidos-feitos">
        <div style={{ padding: "14px 16px", borderBottom: "1px solid #f1f0ef", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <h2 id="titulo-pedidos-feitos" style={{ margin: 0, fontSize: 15, fontWeight: 800, color: "#1c1917", fontFamily: "'Space Grotesk', sans-serif" }}>Pedidos feitos</h2>
          <div role="group" aria-label="Filtrar pedidos" style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {FILTROS.map((f) => (
              <button key={f.k} type="button" aria-pressed={filtro === f.k} data-testid={`filtro-pedidos-${f.k}`}
                onClick={() => setFiltro(f.k)}
                style={{
                  height: 30, padding: "0 10px", borderRadius: 999, cursor: "pointer",
                  border: `1px solid ${filtro === f.k ? "#1c1917" : "#e7e5e4"}`,
                  background: filtro === f.k ? "#1c1917" : "#ffffff",
                  color: filtro === f.k ? "#ffffff" : "#57534e",
                  fontSize: 12, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 5,
                }}>
                {f.rotulo}<span style={{ fontVariantNumeric: "tabular-nums", opacity: 0.75 }}>{f.n}</span>
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <p style={{ margin: 0, padding: 20, fontSize: 13, color: "#746e69" }}>Carregando pedidos…</p>
        ) : isError ? (
          <p style={{ margin: 0, padding: 20, fontSize: 13, color: "#b91c1c" }}>
            Não foi possível carregar os pedidos.{" "}
            <button type="button" onClick={() => refetch()} style={{ border: "none", background: "none", fontWeight: 800, textDecoration: "underline", cursor: "pointer", color: "#1c1917" }}>Tentar de novo</button>
          </p>
        ) : visiveis.length === 0 ? (
          <div style={{ padding: "32px 16px", textAlign: "center", color: "#746e69" }}>
            <Inbox size={26} color="#a8a29e" aria-hidden="true" />
            <p style={{ margin: "8px 0 0", fontSize: 13.5, fontWeight: 700, color: "#1c1917" }}>
              {filtro === "aberto" ? "Nenhum pedido esperando a lista" : "Nenhum pedido aqui"}
            </p>
          </div>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {visiveis.map((p) => {
              const tom = TOM_DO_PEDIDO[p.status] ?? TOM_DO_PEDIDO.cancelado;
              const podeCancelar = p.status === "aberto" && podePedir && (isAdmin || !p.pedidoPorId || p.pedidoPorId === userId);
              return (
                <li key={p.id} data-testid={`pedido-${p.id}`} style={{ padding: "14px 16px", borderBottom: "1px solid #f1f0ef", display: "flex", flexDirection: "column", gap: 7 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: tom.cor, background: tom.fundo, border: `1px solid ${tom.borda}`, borderRadius: 999, padding: "2px 9px" }}>
                      {ROTULO_DO_PEDIDO[p.status] ?? p.status}
                    </span>
                    <strong style={{ fontSize: 14, color: "#1c1917" }}>{p.quantidade} un.</strong>
                    <span style={{ fontSize: 13.5, color: "#1c1917", fontWeight: 700 }}>{p.sponsorName ?? "Patrocinador removido"}</span>
                    <span style={{ fontSize: 13, color: "#746e69" }}>· {p.eventName ?? "Evento removido"}{p.eventStart ? ` · ${diaDoEvento(p.eventStart)}` : ""}</span>
                    {podeCancelar && (
                      <button type="button" data-testid={`button-cancelar-pedido-${p.id}`}
                        disabled={cancelar.isPending}
                        onClick={() => { if (window.confirm("Cancelar este pedido?")) cancelar.mutate(p.id); }}
                        style={{ marginLeft: "auto", height: 28, padding: "0 10px", borderRadius: 7, border: "1px solid #e7e5e4", background: "#ffffff", color: "#57534e", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                        Cancelar
                      </button>
                    )}
                  </div>
                  <p style={{ margin: 0, fontSize: 13.5, color: "#44403c", lineHeight: 1.5, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{p.observacao}</p>
                  <ReferenciasDoPedido urls={p.referencias ?? []} />
                  {p.status === "atendido" && (
                    <p style={{ margin: 0, fontSize: 12.5, color: "#065f46" }}>
                      Virou a peça <strong>{p.itemDisplayId ?? "—"}</strong>{p.itemType ? ` (${p.itemType})` : ""}{p.resolvidoPor ? ` · por ${p.resolvidoPor}` : ""} · {quandoFoi(p.resolvidoEm)}
                    </p>
                  )}
                  {p.status === "recusado" && (
                    <p style={{ margin: 0, fontSize: 12.5, color: "#991b1b" }}>
                      Recusado{p.resolvidoPor ? ` por ${p.resolvidoPor}` : ""}: {p.motivoRecusa}
                    </p>
                  )}
                  <span style={{ fontSize: 11.5, color: "#a8a29e" }}>Pedido por {p.pedidoPor ?? "—"} · {quandoFoi(p.createdAt)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
