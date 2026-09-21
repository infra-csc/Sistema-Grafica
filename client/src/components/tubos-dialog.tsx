// ─────────────────────────────────────────────────────────────────────────────
// TUBOS DO EVENTO (dono, 14/09) — agrupar as peças e entregar o tubo inteiro.
//
// Abre pelo botão "Tubos" no cabeçalho de cada evento da fila da Gráfica. Três
// coisas, na ordem em que o galpão faz:
//   1. PEÇAS SEM TUBO — as que já saíram da impressão; marca e põe num tubo
//      (existente ou novo). A peça vai inteira para um tubo só.
//   2. OS TUBOS — o que tem em cada um, o que falta conferir, e a etiqueta.
//   3. ENTREGAR O TUBO — uma foto e um recebedor para tudo que está dentro. Só
//      libera quando todas as peças do tubo estão conferidas, e diz quais não.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Camera, CheckCircle2, ImagePlus, Package, Tag, Trash2, Truck, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { HIDE_NATIVE_CLOSE, ModalHeader, modalSurface } from "@/components/modal-shell";
import { ObjectUploader } from "@/components/ObjectUploader";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";

type Peca = {
  id: string;
  displayId: string | null;
  type: string;
  description: string | null;
  quantity: number;
  status: string;
  conferredQty: number;
  deliveredQty: number;
  conferida: boolean;
  entregue: boolean;
};

type Tubo = {
  id: string;
  numero: number;
  entregueEm: string | null;
  recebidoPor: string | null;
  entreguePor: string | null;
  fotoEntregaUrl: string | null;
  pecas: Peca[];
  faltamConferir: string[];
  prontoParaEntregar: boolean;
};

type Retrato = { evento: { id: string; name: string }; tubos: Tubo[]; semTubo: Peca[] };

const COR = {
  texto: "#1c1917", sec: "#57534e", fraco: "#78716c", borda: "#e7e5e4", fundo: "#fafaf9",
  laranja: "#c2410c", verde: "#15803d", verdeBg: "#f0fdf4", verdeBorda: "#bbf7d0",
  ambar: "#92400e", ambarBg: "#fffbeb", ambarBorda: "#fde68a",
};

const ROTULO: React.CSSProperties = {
  fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: COR.fraco,
};

/** A mensagem do servidor vem crua dentro do erro ("409: {\"error\":…}"). */
function mensagemDeErro(e: any): string {
  const bruto = String(e?.message ?? "Erro desconhecido");
  const i = bruto.indexOf("{");
  if (i >= 0) {
    try { const j = JSON.parse(bruto.slice(i)); if (j?.error) return j.error; } catch { /* segue */ }
  }
  return bruto.replace(/^\d{3}:\s*/, "");
}

const quandoFoi = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";

export function TubosDialog({ evento, onClose }: { evento: { id: string; name: string } | null; onClose: () => void }) {
  const { toast } = useToast();
  // Padrão da Gráfica nova no celular (21/09): alvo de toque de 44px, campo a
  // 16px (abaixo disso o iOS dá zoom ao focar) e letra de no mínimo 12px.
  const isMobile = useIsMobile();
  const alvo = isMobile ? 44 : 34;
  const fsMin = (n: number) => (isMobile ? Math.max(12, n) : n);
  const chave = [`/api/events/${evento?.id}/tubos`];
  const { data, isLoading, isError, refetch } = useQuery<Retrato>({ queryKey: chave, enabled: !!evento, staleTime: 0 });

  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [destino, setDestino] = useState<string>("novo");
  const [entregando, setEntregando] = useState<string | null>(null);
  const [fotos, setFotos] = useState<string[]>([]);
  const [recebidoPor, setRecebidoPor] = useState("");
  const [obs, setObs] = useState("");

  // Trocou de evento: nada da seleção anterior pode vazar para o novo.
  const [eventoVisto, setEventoVisto] = useState<string | null>(null);
  if ((evento?.id ?? null) !== eventoVisto) {
    setEventoVisto(evento?.id ?? null);
    setSelecionadas(new Set()); setDestino("novo");
    setEntregando(null); setFotos([]); setRecebidoPor(""); setObs("");
  }

  const atualizar = () => {
    queryClient.invalidateQueries({ queryKey: chave });
    queryClient.invalidateQueries({ queryKey: ["/api/tubos"] });
    queryClient.invalidateQueries({ queryKey: ["/api/items/approved"] });
    queryClient.invalidateQueries({ queryKey: ["/api/items"] });
  };
  const falhou = (titulo: string) => (e: any) => toast({ title: titulo, description: mensagemDeErro(e), variant: "destructive" });

  const colocar = useMutation({
    mutationFn: async () => {
      const ids = Array.from(selecionadas);
      if (destino === "novo") {
        const r = await apiRequest("POST", `/api/events/${evento!.id}/tubos`, { itemIds: ids });
        const t = await r.json();
        return { numero: t.numero as number, quantas: ids.length };
      }
      const r = await apiRequest("PATCH", `/api/tubos/${destino}/itens`, { adicionar: ids });
      const t = await r.json();
      return { numero: t.numero as number, quantas: ids.length };
    },
    onSuccess: ({ numero, quantas }) => {
      toast({ title: `${quantas} ${quantas === 1 ? "peça foi" : "peças foram"} para o Tubo ${numero}` });
      setSelecionadas(new Set()); setDestino("novo");
      atualizar();
    },
    onError: falhou("Não foi possível pôr no tubo"),
  });

  const tirar = useMutation({
    mutationFn: async ({ tuboId, itemId }: { tuboId: string; itemId: string }) =>
      apiRequest("PATCH", `/api/tubos/${tuboId}/itens`, { remover: [itemId] }),
    onSuccess: atualizar,
    onError: falhou("Não foi possível tirar do tubo"),
  });

  const apagar = useMutation({
    mutationFn: async (tuboId: string) => apiRequest("DELETE", `/api/tubos/${tuboId}`),
    onSuccess: atualizar,
    onError: falhou("Não foi possível apagar o tubo"),
  });

  const entregar = useMutation({
    mutationFn: async (tubo: Tubo) => {
      const r = await apiRequest("POST", `/api/tubos/${tubo.id}/entregar`, { photoUrl: fotos[0], receivedBy: recebidoPor, notes: obs });
      return r.json();
    },
    onSuccess: (r: any) => {
      toast({ title: `Tubo ${r.numero} entregue`, description: `${r.entregues} ${r.entregues === 1 ? "peça entregue" : "peças entregues"} com a mesma foto.` });
      setEntregando(null); setFotos([]); setRecebidoPor(""); setObs("");
      atualizar();
    },
    onError: falhou("Não foi possível entregar o tubo"),
  });

  const abertos = (data?.tubos ?? []).filter((t) => !t.entregueEm);
  const todasMarcadas = !!data && data.semTubo.length > 0 && selecionadas.size === data.semTubo.length;
  const alternar = (id: string) => setSelecionadas((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const chipDeDestino = (valor: string, rotulo: string) => {
    const ativo = destino === valor;
    return (
      <button key={valor} type="button" role="radio" aria-checked={ativo} onClick={() => setDestino(valor)}
        data-testid={`destino-tubo-${valor}`}
        style={{ height: alvo, padding: "0 12px", borderRadius: 999, cursor: "pointer", fontSize: fsMin(12.5), fontWeight: 700, whiteSpace: "nowrap", background: ativo ? COR.texto : "#fff", color: ativo ? "#fff" : COR.texto, border: `1px solid ${ativo ? COR.texto : COR.borda}` }}>
        {rotulo}
      </button>
    );
  };

  return (
    <Dialog open={!!evento} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className={HIDE_NATIVE_CLOSE} style={modalSurface(660)}>
        <DialogTitle className="sr-only">Tubos do evento</DialogTitle>
        <DialogDescription className="sr-only">Agrupe as peças em tubos e entregue o tubo inteiro</DialogDescription>
        <ModalHeader icon={Package} tint={COR.laranja} title={`Tubos · ${evento?.name ?? ""}`}
          subtitle="Agrupe as peças que saíram da impressão e entregue o tubo inteiro" onClose={onClose} />

        <div style={{ padding: isMobile ? 16 : 20, overflowY: "auto", flex: "1 1 auto", minHeight: 0, display: "flex", flexDirection: "column", gap: 22 }}>
          {isLoading && <p style={{ margin: 0, fontSize: 13, color: COR.fraco }}>Carregando os tubos…</p>}
          {isError && (
            <div style={{ padding: "12px 14px", borderRadius: 10, background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", fontSize: 13, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              Não foi possível carregar os tubos.
              <button onClick={() => refetch()} style={{ minHeight: alvo, border: "none", borderRadius: 8, background: "#b91c1c", color: "#fff", fontWeight: 700, fontSize: 12, padding: "0 12px", cursor: "pointer" }}>Tentar novamente</button>
            </div>
          )}

          {data && (
            <>
              {/* ── 1 · Peças sem tubo ── */}
              <section data-testid="pecas-sem-tubo" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <span style={ROTULO}>Peças sem tubo · {data.semTubo.length}</span>
                  {data.semTubo.length > 1 && (
                    <button type="button" onClick={() => setSelecionadas(todasMarcadas ? new Set() : new Set(data.semTubo.map((p) => p.id)))}
                      style={{ minHeight: alvo, border: "none", background: "none", fontSize: 12, fontWeight: 700, color: COR.laranja, cursor: "pointer", padding: 0 }}>
                      {todasMarcadas ? "Desmarcar todas" : "Marcar todas"}
                    </button>
                  )}
                </div>

                {data.semTubo.length === 0 ? (
                  <p style={{ margin: 0, fontSize: 12.5, color: COR.fraco }}>
                    Nenhuma peça esperando tubo — as que terminaram a impressão já estão em tubos.
                  </p>
                ) : (
                  <>
                    <div style={{ border: `1px solid ${COR.borda}`, borderRadius: 10, overflow: "hidden" }}>
                      {data.semTubo.map((p) => (
                        <label key={p.id} data-testid={`peca-sem-tubo-${p.id}`}
                          style={{ display: "flex", alignItems: "center", gap: 10, minHeight: alvo, boxSizing: "border-box", padding: "9px 12px", borderTop: `1px solid #f5f5f4`, cursor: "pointer", background: selecionadas.has(p.id) ? "#fff7ed" : "#fff" }}>
                          <input type="checkbox" checked={selecionadas.has(p.id)} onChange={() => alternar(p.id)}
                            style={{ width: 18, height: 18, accentColor: COR.laranja, flexShrink: 0 }} />
                          <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 12.5, fontWeight: 700, color: COR.laranja, flexShrink: 0 }}>{p.displayId ?? "—"}</span>
                          <span style={{ fontSize: 13, color: COR.texto, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {p.type}{p.description ? <span style={{ color: COR.sec }}> · {p.description}</span> : null}
                          </span>
                          <span style={{ fontSize: 12, color: COR.sec, whiteSpace: "nowrap" }}>{p.quantity} un.</span>
                          {!p.conferida && (
                            <span style={{ fontSize: fsMin(10.5), fontWeight: 700, color: COR.ambar, background: COR.ambarBg, border: `1px solid ${COR.ambarBorda}`, borderRadius: 999, padding: "1px 7px", whiteSpace: "nowrap" }}>
                              falta conferir
                            </span>
                          )}
                        </label>
                      ))}
                    </div>

                    {selecionadas.size > 0 && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 12, borderRadius: 10, background: COR.fundo, border: `1px solid ${COR.borda}` }}>
                        <span style={ROTULO}>Pôr as {selecionadas.size} marcadas em</span>
                        <div role="radiogroup" aria-label="Tubo de destino" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                          {abertos.map((t) => chipDeDestino(t.id, `Tubo ${t.numero}`))}
                          {chipDeDestino("novo", "+ Tubo novo")}
                        </div>
                        <button type="button" onClick={() => colocar.mutate()} disabled={colocar.isPending}
                          data-testid="button-colocar-no-tubo"
                          style={{ alignSelf: isMobile ? "stretch" : "flex-start", height: isMobile ? 48 : 38, padding: "0 16px", borderRadius: 8, border: "none", background: COR.laranja, color: "#fff", fontWeight: 800, fontSize: 13, cursor: colocar.isPending ? "wait" : "pointer", opacity: colocar.isPending ? 0.7 : 1 }}>
                          {colocar.isPending ? "Salvando…" : `Colocar ${selecionadas.size} no ${destino === "novo" ? "tubo novo" : `Tubo ${abertos.find((t) => t.id === destino)?.numero ?? ""}`}`}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </section>

              {/* ── 2 · Os tubos ── */}
              <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <span style={ROTULO}>Tubos · {data.tubos.length}</span>
                {data.tubos.length === 0 && (
                  <p style={{ margin: 0, fontSize: 12.5, color: COR.fraco }}>
                    Nenhum tubo ainda. Marque as peças acima e coloque num tubo novo.
                  </p>
                )}

                {data.tubos.map((t) => {
                  const entregue = !!t.entregueEm;
                  const vazio = t.pecas.length === 0;
                  const status = entregue
                    ? { texto: `Entregue ${quandoFoi(t.entregueEm)}`, cor: COR.verde, bg: COR.verdeBg, borda: COR.verdeBorda }
                    : vazio
                      ? { texto: "Vazio", cor: COR.fraco, bg: COR.fundo, borda: COR.borda }
                      : t.prontoParaEntregar
                        ? { texto: "Pronto para entregar", cor: COR.verde, bg: COR.verdeBg, borda: COR.verdeBorda }
                        : { texto: `Falta conferir ${t.faltamConferir.length}`, cor: COR.ambar, bg: COR.ambarBg, borda: COR.ambarBorda };
                  const motivoBloqueio = vazio
                    ? "O tubo está vazio"
                    : t.faltamConferir.length
                      ? `Falta conferir: ${t.faltamConferir.join(", ")}`
                      : undefined;

                  return (
                    <div key={t.id} data-testid={`tubo-${t.numero}`} style={{ border: `1px solid ${COR.borda}`, borderRadius: 12, overflow: "hidden", background: "#fff" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "10px 12px", background: COR.fundo, borderBottom: `1px solid ${COR.borda}`, flexWrap: "wrap" }}>
                        <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 16, fontWeight: 800, color: COR.texto }}>
                          Tubo {t.numero} <span style={{ fontSize: 12, fontWeight: 600, color: COR.sec }}>· {t.pecas.length} {t.pecas.length === 1 ? "peça" : "peças"}</span>
                        </span>
                        <span style={{ fontSize: fsMin(11), fontWeight: 800, color: status.cor, background: status.bg, border: `1px solid ${status.borda}`, borderRadius: 999, padding: "2px 9px", whiteSpace: "nowrap" }}>
                          {status.texto}
                        </span>
                      </div>

                      {t.pecas.map((p) => (
                        <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderTop: `1px solid #f5f5f4` }}>
                          <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 12.5, fontWeight: 700, color: COR.laranja, flexShrink: 0 }}>{p.displayId ?? "—"}</span>
                          <span style={{ fontSize: 13, color: COR.texto, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {p.type}{p.description ? <span style={{ color: COR.sec }}> · {p.description}</span> : null}
                          </span>
                          <span style={{ fontSize: 12, color: COR.sec, whiteSpace: "nowrap" }}>{p.quantity} un.</span>
                          {!entregue && !p.conferida && (
                            <span style={{ fontSize: fsMin(10.5), fontWeight: 700, color: COR.ambar, whiteSpace: "nowrap" }}>falta conferir</span>
                          )}
                          {!entregue && (
                            <button type="button" onClick={() => tirar.mutate({ tuboId: t.id, itemId: p.id })} disabled={tirar.isPending}
                              aria-label={`Tirar ${p.displayId ?? "a peça"} do Tubo ${t.numero}`} title="Tirar do tubo"
                              style={{ width: isMobile ? 44 : 32, height: isMobile ? 44 : 32, borderRadius: 8, border: `1px solid ${COR.borda}`, background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                              <X aria-hidden="true" style={{ width: 13, height: 13, color: COR.sec }} />
                            </button>
                          )}
                        </div>
                      ))}

                      {entregue && (
                        <div style={{ padding: "8px 12px", borderTop: `1px solid #f5f5f4`, fontSize: 12, color: COR.sec, display: "flex", alignItems: "center", gap: 6 }}>
                          <CheckCircle2 aria-hidden="true" style={{ width: 13, height: 13, color: COR.verde }} />
                          {t.recebidoPor ? `Recebido por ${t.recebidoPor}` : "Recebedor não informado"}
                          {t.entreguePor ? ` · registrado por ${t.entreguePor}` : ""}
                        </div>
                      )}

                      {/* Ações do tubo */}
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", padding: "10px 12px", borderTop: `1px solid ${COR.borda}` }}>
                        {!vazio && (
                          <Link href={`/grafica/tubos/${t.id}/etiqueta`} data-testid={`etiqueta-tubo-${t.numero}`}
                            style={{ display: "inline-flex", alignItems: "center", gap: 6, height: alvo, padding: "0 12px", borderRadius: 8, border: `1px solid ${COR.borda}`, background: "#fff", color: COR.texto, fontSize: 12.5, fontWeight: 700, textDecoration: "none" }}>
                            <Tag aria-hidden="true" style={{ width: 13, height: 13 }} /> Etiqueta
                          </Link>
                        )}
                        {!entregue && !vazio && entregando !== t.id && (
                          <button type="button" onClick={() => { setEntregando(t.id); setFotos([]); setRecebidoPor(""); setObs(""); }}
                            disabled={!t.prontoParaEntregar} title={motivoBloqueio}
                            data-testid={`entregar-tubo-${t.numero}`}
                            style={{ display: "inline-flex", alignItems: "center", gap: 6, height: alvo, padding: "0 12px", borderRadius: 8, border: "none", background: t.prontoParaEntregar ? COR.verde : "#e7e5e4", color: t.prontoParaEntregar ? "#fff" : COR.fraco, fontSize: 12.5, fontWeight: 800, cursor: t.prontoParaEntregar ? "pointer" : "not-allowed" }}>
                            <Truck aria-hidden="true" style={{ width: 13, height: 13 }} /> Entregar tubo
                          </button>
                        )}
                        {!entregue && vazio && (
                          <button type="button" onClick={() => apagar.mutate(t.id)} disabled={apagar.isPending}
                            style={{ display: "inline-flex", alignItems: "center", gap: 6, height: alvo, padding: "0 12px", borderRadius: 8, border: `1px solid ${COR.borda}`, background: "#fff", color: "#b91c1c", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
                            <Trash2 aria-hidden="true" style={{ width: 13, height: 13 }} /> Apagar tubo vazio
                          </button>
                        )}
                        {!entregue && !vazio && !t.prontoParaEntregar && motivoBloqueio && (
                          <span style={{ fontSize: fsMin(11.5), color: COR.ambar, alignSelf: "center" }}>{motivoBloqueio}</span>
                        )}
                      </div>

                      {/* Entregar o tubo inteiro */}
                      {entregando === t.id && (
                        <div data-testid={`form-entrega-tubo-${t.numero}`} style={{ padding: 12, borderTop: `1px solid ${COR.borda}`, background: "#f0fdf4", display: "flex", flexDirection: "column", gap: 10 }}>
                          <span style={{ fontSize: 12.5, color: COR.texto }}>
                            Entregar as <strong>{t.pecas.filter((p) => !p.entregue).length}</strong> peças do Tubo {t.numero} de uma vez — a foto vale para todas.
                          </span>
                          <div>
                            <span style={ROTULO}>Foto da entrega *</span>
                            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                              {[{ capture: true, Icone: Camera, texto: "Câmera" }, { capture: false, Icone: ImagePlus, texto: "Galeria" }].map(({ capture, Icone, texto }) => (
                                <div key={texto} style={{ flex: 1 }}>
                                  <ObjectUploader
                                    {...(capture ? { capture: true } : { multiple: true })}
                                    maxFileSize={10485760}
                                    buttonVariant="ghost"
                                    buttonClassName="w-full h-full p-0 border-0 hover:bg-transparent"
                                    onComplete={(r) => setFotos((f) => [...f, r.url])}
                                    onError={(e) => toast({ title: "Erro no upload", description: e.message, variant: "destructive" })}
                                  >
                                    <div style={{ width: "100%", padding: "11px 0", background: "#fff", borderRadius: 8, border: "2px dashed #d6d3d1", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                                      <Icone aria-hidden="true" style={{ width: 18, height: 18, color: COR.fraco }} />
                                      <span style={{ fontSize: fsMin(10), fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: COR.fraco }}>{texto}</span>
                                    </div>
                                  </ObjectUploader>
                                </div>
                              ))}
                            </div>
                            {fotos.length > 0 && (
                              <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                                {fotos.map((url) => (
                                  <div key={url} style={{ position: "relative", width: 64, height: 64, borderRadius: 8, overflow: "hidden", border: `1px solid ${COR.borda}` }}>
                                    <img src={url} alt="Foto da entrega" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                    <button type="button" onClick={() => setFotos((f) => f.filter((x) => x !== url))} aria-label="Remover foto"
                                      style={{ position: "absolute", top: 2, right: 2, width: 24, height: 24, borderRadius: "50%", border: "none", background: "rgba(28,25,23,0.75)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                                      <X aria-hidden="true" style={{ width: 11, height: 11 }} />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          <input value={recebidoPor} onChange={(e) => setRecebidoPor(e.target.value)} placeholder="Quem recebeu (opcional)"
                            style={{ height: isMobile ? 44 : 38, borderRadius: 8, border: `1px solid ${COR.borda}`, padding: "0 10px", fontSize: isMobile ? 16 : 13, background: "#fff" }} />
                          <input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Observação (opcional)"
                            style={{ height: isMobile ? 44 : 38, borderRadius: 8, border: `1px solid ${COR.borda}`, padding: "0 10px", fontSize: isMobile ? 16 : 13, background: "#fff" }} />
                          <div style={{ display: "flex", gap: 8 }}>
                            <button type="button" onClick={() => setEntregando(null)}
                              style={{ flex: 1, height: isMobile ? 48 : 40, borderRadius: 8, border: `1px solid ${COR.borda}`, background: "#fff", color: COR.sec, fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}>
                              Cancelar
                            </button>
                            <button type="button" onClick={() => entregar.mutate(t)} disabled={entregar.isPending || fotos.length === 0}
                              data-testid={`confirmar-entrega-tubo-${t.numero}`}
                              style={{ flex: 2, height: isMobile ? 48 : 40, borderRadius: 8, border: "none", background: fotos.length ? COR.verde : "#e7e5e4", color: fotos.length ? "#fff" : COR.fraco, fontWeight: 800, fontSize: 13, cursor: entregar.isPending || !fotos.length ? "not-allowed" : "pointer" }}>
                              {entregar.isPending ? "Salvando…" : fotos.length ? `Entregar Tubo ${t.numero}` : "Anexe a foto para entregar"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </section>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
