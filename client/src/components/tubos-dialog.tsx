// ─────────────────────────────────────────────────────────────────────────────
// TUBOS DO EVENTO (dono, 14/09) — agrupar as peças e entregar o tubo inteiro.
//
// Abre pelo botão "Tubos" no cabeçalho de cada evento da fila da Gráfica — e,
// desde 21/09 ("o tubo só na hora de embalar"), pelo "Embalar" da peça
// conferida (e do lote), já focado em escolher o tubo (passo 0). A escolha de
// tubo SAIU da conferência: conferir é só conferir com foto.
// Na ordem em que o galpão faz:
//   1. PEÇAS SEM TUBO — as que já saíram da impressão; marca e põe num tubo
//      (existente ou novo). A peça vai inteira para um tubo só.
//   2. OS TUBOS — o que tem em cada um, o que falta conferir, e a etiqueta.
//   3. FECHAR O TUBO (dono, 21/09) — as fotos do tubo pronto e dos itens
//      dentro. As peças ficam "Embalado"; NÃO é entrega.
//   4. ENTREGAR O TUBO — quem recebeu (obrigatório) e quando; a foto do
//      comprovante é opcional, porque o material já foi fotografado ao fechar.
//      Só libera quando todas as peças do tubo estão conferidas, e diz quais não.
// Fechar e entregar são DOIS passos, nessa ordem — mas entregar sem ter
// fechado é permitido (o dono não quis obrigatoriedade); a tela só sugere.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Camera, CheckCircle2, ImagePlus, Package, PackageCheck, Tag, Trash2, Truck, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { HIDE_NATIVE_CLOSE, ModalHeader, modalSurface } from "@/components/modal-shell";
import { useAcompanharAreaVisivel } from "@/components/grafica/area-visivel";
import { ObjectUploader } from "@/components/ObjectUploader";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { convertGCSUrlToLocalPath } from "@/lib/artePdfExport";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/contexts/auth-context";

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
  /** Peça de remessa do Kit — quem só visualiza não age nela. */
  doKit?: boolean;
};

type Tubo = {
  id: string;
  numero: number;
  entregueEm: string | null;
  recebidoPor: string | null;
  entreguePor: string | null;
  fotoEntregaUrl: string | null;
  /** Fechamento (21/09): as fotos do tubo pronto e dos itens, quando e quem. */
  fotosFechamento: string[];
  fechadoEm: string | null;
  fechadoPor: string | null;
  /** Pôs ou tirou peça DEPOIS da foto — ela pode não bater mais com o conteúdo. */
  alteradoDepoisDaFoto: boolean;
  pecas: Peca[];
  faltamConferir: string[];
  prontoParaEntregar: boolean;
};

type Retrato = { evento: { id: string; name: string }; tubos: Tubo[]; semTubo: Peca[] };

const COR = {
  texto: "#1c1917", sec: "#57534e", fraco: "#78716c", borda: "#e7e5e4", fundo: "#fafaf9",
  laranja: "#c2410c", verde: "#15803d", verdeBg: "#f0fdf4", verdeBorda: "#bbf7d0",
  ambar: "#92400e", ambarBg: "#fffbeb", ambarBorda: "#fde68a",
  // Azul do Embalado (P.blue de lib/status): o tubo fechado usa a cor da etapa.
  azul: "#1d4ed8", azulBg: "#eff6ff", azulBorda: "#bfdbfe",
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
/** Só a hora ("14:32"): o selo do tubo na escolha rápida, onde a data é a de hoje. */
const horaDe = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "";

export function TubosDialog({ evento, onClose, itensIniciais, tuboInicial, onEmbalou }: {
  evento: { id: string; name: string } | null;
  onClose: () => void;
  /** EMBALAR (dono, 21/09 — "o tubo só na hora de embalar"): a peça (ou o
   *  lote de peças conferidas) que chegou pelo botão "Embalar" da fila. O
   *  painel abre focado em escolher o tubo: um toque num tubo aberto ou em
   *  "Novo tubo" já coloca — nada de marcar caixinha. */
  itensIniciais?: string[];
  /** "Entregar tubo" da peça embalada: abre já no formulário daquele tubo. */
  tuboInicial?: string;
  /** Embalou pelo atalho: a fila sai do modo "Embalar em lote". */
  onEmbalou?: () => void;
}) {
  const { toast } = useToast();
  // "Solicitação sem Kit só visualiza peça do Kit" (mesma trava do servidor,
  // em routes.ts e em routes/tubos.ts): a caixa de seleção e o "Entregar tubo"
  // somem, em vez de oferecer um toque que volta 403.
  const { user } = useAuth();
  const soVisualizaKit = (p: { doKit?: boolean }) => user?.role === "solicitacao" && !user?.kit && !!p.doKit;
  // Padrão da Gráfica nova no celular (21/09): alvo de toque de 44px, campo a
  // 16px (abaixo disso o iOS dá zoom ao focar) e letra de no mínimo 12px.
  const isMobile = useIsMobile();
  const alvo = isMobile ? 44 : 34;
  const fsMin = (n: number) => (isMobile ? Math.max(12, n) : n);
  const pad = isMobile ? 16 : 20;
  // "Quem recebeu" abre o teclado: o modal recentra e encolhe para a área
  // visível, e o rodapé fixo (Entregar / Fechar) continua à vista acima dele.
  const superficieRef = useRef<HTMLDivElement>(null);
  useAcompanharAreaVisivel(superficieRef, "centro", isMobile && !!evento);
  const chave = [`/api/events/${evento?.id}/tubos`];
  const { data, isLoading, isError, refetch } = useQuery<Retrato>({ queryKey: chave, enabled: !!evento, staleTime: 0 });

  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [destino, setDestino] = useState<string>("novo");
  const [entregando, setEntregando] = useState<string | null>(null);
  const [fotos, setFotos] = useState<string[]>([]);
  const [recebidoPor, setRecebidoPor] = useState("");
  const [obs, setObs] = useState("");
  // Fechamento (21/09): o tubo que está sendo fechado e as fotos já tiradas.
  const [fechando, setFechando] = useState<string | null>(null);
  const [fotosFechamento, setFotosFechamento] = useState<string[]>([]);
  // Apagar tubo COM peças pede um segundo toque — as peças voltam a Conferido.
  const [confirmandoApagar, setConfirmandoApagar] = useState<string | null>(null);

  // Trocou de evento (ou reabriu pelo "Embalar"/"Entregar tubo" de outra
  // peça): nada da seleção anterior pode vazar para a abertura nova.
  const chaveDaAbertura = evento ? `${evento.id}|${(itensIniciais ?? []).join(",")}|${tuboInicial ?? ""}` : null;
  const [aberturaVista, setAberturaVista] = useState<string | null>(null);
  if (chaveDaAbertura !== aberturaVista) {
    setAberturaVista(chaveDaAbertura);
    setSelecionadas(new Set()); setDestino("novo");
    setEntregando(null); setFotos([]); setRecebidoPor(""); setObs("");
    setFechando(null); setFotosFechamento([]); setConfirmandoApagar(null);
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

  // EMBALAR PELO ATALHO (21/09): as peças que vieram pelo botão "Embalar" e
  // ainda estão sem tubo. Um toque no tubo (ou em "Novo tubo") = a mesma rota
  // do "Colocar" acima; o painel fecha sozinho, porque a tarefa era só essa.
  const pecasParaEmbalar = (data?.semTubo ?? []).filter((p) => itensIniciais?.includes(p.id) && !soVisualizaKit(p));
  const embalar = useMutation({
    mutationFn: async (destinoEscolhido: string) => {
      const ids = pecasParaEmbalar.map((p) => p.id);
      const r = destinoEscolhido === "novo"
        ? await apiRequest("POST", `/api/events/${evento!.id}/tubos`, { itemIds: ids })
        : await apiRequest("PATCH", `/api/tubos/${destinoEscolhido}/itens`, { adicionar: ids });
      const t = await r.json();
      return { numero: t.numero as number, quantas: ids.length };
    },
    onSuccess: ({ numero, quantas }) => {
      const nome = quantas === 1 ? (pecasParaEmbalar[0]?.displayId ?? "Peça") : `${quantas} peças`;
      toast({ title: `${nome} embalada${quantas === 1 ? "" : "s"} no Tubo ${numero}` });
      atualizar();
      onEmbalou?.();
      onClose();
    },
    onError: falhou("Não foi possível embalar"),
  });

  // "Entregar tubo" da peça embalada: quando o retrato chega, o formulário
  // daquele tubo já está aberto — se ele puder ser entregue. Se não puder, o
  // botão desabilitado e o motivo ao lado explicam, como sempre.
  useEffect(() => {
    if (!tuboInicial || !data) return;
    const t = data.tubos.find((x) => x.id === tuboInicial);
    if (t && !t.entregueEm && t.prontoParaEntregar) { setEntregando(t.id); setFechando(null); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveDaAbertura, data === undefined]);

  const tirar = useMutation({
    mutationFn: async ({ tuboId, itemId }: { tuboId: string; itemId: string }) =>
      apiRequest("PATCH", `/api/tubos/${tuboId}/itens`, { remover: [itemId] }),
    onSuccess: atualizar,
    onError: falhou("Não foi possível tirar do tubo"),
  });

  const apagar = useMutation({
    mutationFn: async (tuboId: string) => {
      const r = await apiRequest("DELETE", `/api/tubos/${tuboId}`);
      return r.json();
    },
    onSuccess: (r: any) => {
      if (r?.devolvidas > 0) toast({ title: "Tubo apagado", description: `${r.devolvidas} ${r.devolvidas === 1 ? "peça voltou" : "peças voltaram"} para Conferido.` });
      setConfirmandoApagar(null);
      atualizar();
    },
    onError: falhou("Não foi possível apagar o tubo"),
  });

  // FECHAR (21/09): várias fotos — o tubo fechado e os itens dentro dele.
  const fechar = useMutation({
    mutationFn: async (tubo: Tubo) => {
      const r = await apiRequest("POST", `/api/tubos/${tubo.id}/fechar`, { fotos: fotosFechamento });
      return r.json();
    },
    onSuccess: (r: any) => {
      toast({ title: `Tubo ${r.numero} fechado`, description: `${r.fotos} ${r.fotos === 1 ? "foto guardada" : "fotos guardadas"}. As peças ficam Embalado até a entrega.` });
      setFechando(null); setFotosFechamento([]);
      atualizar();
    },
    onError: falhou("Não foi possível fechar o tubo"),
  });

  const entregar = useMutation({
    mutationFn: async (tubo: Tubo) => {
      const r = await apiRequest("POST", `/api/tubos/${tubo.id}/entregar`, { photoUrl: fotos[0] ?? null, receivedBy: recebidoPor.trim(), notes: obs });
      return r.json();
    },
    onSuccess: (r: any) => {
      toast({ title: `Tubo ${r.numero} entregue`, description: `${r.entregues} ${r.entregues === 1 ? "peça entregue" : "peças entregues"} a ${recebidoPor.trim()}.` });
      setEntregando(null); setFotos([]); setRecebidoPor(""); setObs("");
      atualizar();
    },
    onError: falhou("Não foi possível entregar o tubo"),
  });

  /** Câmera + galeria, várias fotos, com miniaturas e "remover" — o mesmo
   *  desenho da conferência em lote da Gráfica. */
  const uploaderDeFotos = (lista: string[], setLista: (f: (atual: string[]) => string[]) => void, alt: string) => (
    <>
      <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
        {[{ capture: true, Icone: Camera, texto: "Câmera" }, { capture: false, Icone: ImagePlus, texto: "Galeria" }].map(({ capture, Icone, texto }) => (
          <div key={texto} style={{ flex: 1 }}>
            <ObjectUploader
              {...(capture ? { capture: true } : { multiple: true })}
              maxFileSize={10485760}
              buttonVariant="ghost"
              // min-h: durante o envio o conteúdo vira "Enviando…" e o botão
              // não pode encolher abaixo do alvo de dedo.
              buttonClassName="w-full h-full min-h-[44px] p-0 border-0 hover:bg-transparent"
              onComplete={(r) => setLista((f) => [...f, convertGCSUrlToLocalPath(r.url)])}
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
      {lista.length > 0 && (
        <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
          {lista.map((url) => (
            <div key={url} style={{ position: "relative", width: isMobile ? 80 : 64, height: isMobile ? 80 : 64, borderRadius: 8, overflow: "hidden", border: `1px solid ${COR.borda}` }}>
              <img src={url} alt={alt} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              {/* O alvo é de 44px (o canto inteiro da miniatura); o círculo
                  visível continua pequeno para não tapar a foto. */}
              <button type="button" onClick={() => setLista((f) => f.filter((x) => x !== url))} aria-label="Remover foto"
                style={{ position: "absolute", top: 0, right: 0, width: isMobile ? 44 : 28, height: isMobile ? 44 : 28, minHeight: isMobile ? 44 : 28, padding: 2, border: "none", background: "transparent", display: "flex", alignItems: "flex-start", justifyContent: "flex-end", cursor: "pointer" }}>
                <span aria-hidden="true" style={{ width: 24, height: 24, borderRadius: "50%", background: "rgba(28,25,23,0.75)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <X style={{ width: 11, height: 11 }} />
                </span>
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );

  // O nome da peça: no desktop, uma linha com reticências (a lista é densa);
  // no celular, até duas linhas — no galpão nada pode cortar o que se lê.
  const estiloDoNomeDaPeca: React.CSSProperties = isMobile
    ? { fontSize: 13, color: COR.texto, flex: "1 1 120px", minWidth: 0, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflowWrap: "anywhere", lineHeight: 1.3 }
    : { fontSize: 13, color: COR.texto, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };

  const abertos = (data?.tubos ?? []).filter((t) => !t.entregueEm);
  // O tubo cujo formulário (fechar ou entregar) está aberto: os botões dele
  // moram no RODAPÉ FIXO do modal, sempre à vista, com o recorte seguro.
  const tuboEmFormulario = (data?.tubos ?? []).find((t) => t.id === (fechando ?? entregando)) ?? null;
  const marcaveis = (data?.semTubo ?? []).filter((p) => !soVisualizaKit(p));
  const todasMarcadas = marcaveis.length > 0 && selecionadas.size === marcaveis.length;
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
      <DialogContent ref={superficieRef} className={HIDE_NATIVE_CLOSE} style={modalSurface(660)}>
        <DialogTitle className="sr-only">Tubos do evento</DialogTitle>
        <DialogDescription className="sr-only">Agrupe as peças em tubos e entregue o tubo inteiro</DialogDescription>
        <ModalHeader icon={Package} tint={COR.laranja} title={`Tubos · ${evento?.name ?? ""}`}
          subtitle="Agrupe as peças que saíram da impressão e entregue o tubo inteiro" onClose={onClose} />

        <div style={{ padding: pad, overflowY: "auto", flex: "1 1 auto", minHeight: 0, display: "flex", flexDirection: "column", gap: 22 }}>
          {isLoading && <p style={{ margin: 0, fontSize: 13, color: COR.fraco }}>Carregando os tubos…</p>}
          {isError && (
            <div style={{ padding: "12px 14px", borderRadius: 10, background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", fontSize: 13, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              Não foi possível carregar os tubos.
              <button onClick={() => refetch()} style={{ minHeight: alvo, border: "none", borderRadius: 8, background: "#b91c1c", color: "#fff", fontWeight: 700, fontSize: 12, padding: "0 12px", cursor: "pointer" }}>Tentar novamente</button>
            </div>
          )}

          {data && (
            <>
              {/* ── 0 · Embalar (atalho da fila) ── só quando o painel abriu
                  pelo "Embalar" de uma peça ou de um lote. Um toque no tubo
                  coloca e fecha; o resto do painel continua logo abaixo. */}
              {pecasParaEmbalar.length > 0 && (() => {
                const uma = pecasParaEmbalar.length === 1;
                const titulo = uma ? `Embalar ${pecasParaEmbalar[0].displayId ?? "a peça"}` : `Embalar ${pecasParaEmbalar.length} peças`;
                const estiloTubo: React.CSSProperties = {
                  display: "inline-flex", alignItems: "center", gap: 6, minHeight: isMobile ? 44 : 36, padding: "0 12px", borderRadius: 999,
                  border: `1px solid ${COR.azulBorda}`, background: COR.azulBg, color: COR.azul, fontSize: fsMin(12.5), fontWeight: 700,
                  cursor: embalar.isPending ? "wait" : "pointer", opacity: embalar.isPending ? 0.6 : 1,
                };
                return (
                  <section data-testid="embalar-atalho" style={{ display: "flex", flexDirection: "column", gap: 10, padding: 12, borderRadius: 12, background: COR.azulBg, border: `1px solid ${COR.azulBorda}` }}>
                    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 16, fontWeight: 800, color: COR.texto }}>{titulo}</span>
                      {!uma && (
                        <span style={{ fontSize: fsMin(11.5), color: COR.sec }}>
                          {pecasParaEmbalar.map((p) => p.displayId ?? "—").join(", ")}
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: 12.5, color: COR.sec }}>
                      {abertos.length > 0 ? "Toque no tubo em que vai — ou abra um novo." : "Ainda não há tubo aberto neste evento: abra um novo."}
                    </span>
                    <div role="group" aria-label="Tubo em que embalar" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {abertos.map((t) => (
                        <button key={t.id} type="button" onClick={() => embalar.mutate(t.id)} disabled={embalar.isPending}
                          data-testid={`embalar-no-tubo-${t.numero}`}
                          title={t.fechadoEm ? "Este tubo já foi fotografado — pôr mais uma peça marca o tubo como alterado depois da foto" : undefined}
                          style={estiloTubo}>
                          <Package aria-hidden="true" style={{ width: 13, height: 13 }} />
                          Tubo {t.numero} · {t.pecas.length} {t.pecas.length === 1 ? "peça" : "peças"} · {t.fechadoEm ? `fechado ${horaDe(t.fechadoEm)}` : "aberto"}
                        </button>
                      ))}
                      <button type="button" onClick={() => embalar.mutate("novo")} disabled={embalar.isPending}
                        data-testid="embalar-em-tubo-novo"
                        style={{ ...estiloTubo, background: COR.azul, color: "#fff", border: "none" }}>
                        + Novo tubo
                      </button>
                    </div>
                  </section>
                );
              })()}
              {/* Chegou pelo "Embalar" mas a peça já está num tubo (outro
                  aparelho embalou antes): diz onde, em vez de sumir calado. */}
              {itensIniciais && itensIniciais.length > 0 && pecasParaEmbalar.length === 0 && (() => {
                const onde = data.tubos.filter((t) => t.pecas.some((p) => itensIniciais.includes(p.id)));
                if (onde.length === 0) return null;
                return (
                  <p data-testid="embalar-ja-no-tubo" style={{ margin: 0, padding: "10px 12px", borderRadius: 10, background: COR.azulBg, border: `1px solid ${COR.azulBorda}`, fontSize: 12.5, color: COR.azul }}>
                    {itensIniciais.length === 1 ? "A peça já está" : "As peças já estão"} no {onde.map((t) => `Tubo ${t.numero}`).join(", ")}.
                  </p>
                );
              })()}

              {/* ── 1 · Peças sem tubo ── */}
              <section data-testid="pecas-sem-tubo" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <span style={ROTULO}>Peças sem tubo · {data.semTubo.length}</span>
                  {data.semTubo.length > 1 && (
                    <button type="button" onClick={() => setSelecionadas(todasMarcadas ? new Set() : new Set(data.semTubo.filter((p) => !soVisualizaKit(p)).map((p) => p.id)))}
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
                          {soVisualizaKit(p) ? (
                            <span title="Peça do Kit: a Solicitação da Arena só visualiza" style={{ width: 18, flexShrink: 0, fontSize: fsMin(10), fontWeight: 800, color: "#92400e" }}>KIT</span>
                          ) : (
                            <input type="checkbox" checked={selecionadas.has(p.id)} onChange={() => alternar(p.id)}
                              style={{ width: 18, height: 18, accentColor: COR.laranja, flexShrink: 0 }} />
                          )}
                          <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 12.5, fontWeight: 700, color: COR.laranja, flexShrink: 0 }}>{p.displayId ?? "—"}</span>
                          <span style={estiloDoNomeDaPeca}>
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
                  const fechado = !!t.fechadoEm;
                  const status = entregue
                    ? { texto: `Entregue ${quandoFoi(t.entregueEm)}`, cor: COR.verde, bg: COR.verdeBg, borda: COR.verdeBorda }
                    : vazio
                      ? { texto: "Vazio", cor: COR.fraco, bg: COR.fundo, borda: COR.borda }
                      : t.prontoParaEntregar
                        ? (fechado
                          ? { texto: `Fechado ${quandoFoi(t.fechadoEm)} · pronto para entregar`, cor: COR.azul, bg: COR.azulBg, borda: COR.azulBorda }
                          : { texto: "Pronto para fechar", cor: COR.verde, bg: COR.verdeBg, borda: COR.verdeBorda })
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
                          <span style={estiloDoNomeDaPeca}>
                            {p.type}{p.description ? <span style={{ color: COR.sec }}> · {p.description}</span> : null}
                          </span>
                          <span style={{ fontSize: 12, color: COR.sec, whiteSpace: "nowrap" }}>{p.quantity} un.</span>
                          {!entregue && !p.conferida && (
                            <span style={{ fontSize: fsMin(10.5), fontWeight: 700, color: COR.ambar, whiteSpace: "nowrap" }}>falta conferir</span>
                          )}
                          {!entregue && !soVisualizaKit(p) && (
                            <button type="button" onClick={() => tirar.mutate({ tuboId: t.id, itemId: p.id })} disabled={tirar.isPending}
                              aria-label={`Tirar ${p.displayId ?? "a peça"} do Tubo ${t.numero}`} title="Tirar do tubo"
                              style={{ width: isMobile ? 44 : 32, height: isMobile ? 44 : 32, borderRadius: 8, border: `1px solid ${COR.borda}`, background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                              <X aria-hidden="true" style={{ width: 13, height: 13, color: COR.sec }} />
                            </button>
                          )}
                        </div>
                      ))}

                      {/* O fechamento: as fotos do tubo pronto, quando e quem —
                          e o aviso quando mexeram no conteúdo depois da foto. */}
                      {fechado && (
                        <div data-testid={`fechamento-tubo-${t.numero}`} style={{ padding: "8px 12px", borderTop: `1px solid #f5f5f4`, display: "flex", flexDirection: "column", gap: 6 }}>
                          <div style={{ fontSize: 12, color: COR.sec, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                            <Camera aria-hidden="true" style={{ width: 13, height: 13, color: COR.azul }} />
                            Fechado {quandoFoi(t.fechadoEm)}{t.fechadoPor ? ` por ${t.fechadoPor}` : ""} · {t.fotosFechamento.length} {t.fotosFechamento.length === 1 ? "foto" : "fotos"}
                            {t.alteradoDepoisDaFoto && !entregue && (
                              <span data-testid={`aviso-alterado-tubo-${t.numero}`} style={{ fontSize: fsMin(10.5), fontWeight: 700, color: COR.ambar, background: COR.ambarBg, border: `1px solid ${COR.ambarBorda}`, borderRadius: 999, padding: "1px 7px" }}>
                                tubo alterado depois da foto
                              </span>
                            )}
                          </div>
                          {t.fotosFechamento.length > 0 && (
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                              {t.fotosFechamento.map((url) => (
                                <a key={url} href={url} target="_blank" rel="noreferrer" style={{ width: 48, height: 48, borderRadius: 6, overflow: "hidden", border: `1px solid ${COR.borda}`, display: "block" }}>
                                  <img src={url} alt={`Foto do Tubo ${t.numero} fechado`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {entregue && (
                        <div style={{ padding: "8px 12px", borderTop: `1px solid #f5f5f4`, fontSize: 12, color: COR.sec, display: "flex", alignItems: "center", gap: 6 }}>
                          <CheckCircle2 aria-hidden="true" style={{ width: 13, height: 13, color: COR.verde }} />
                          {t.recebidoPor ? `Recebido por ${t.recebidoPor}` : "Recebedor não informado"}
                          {t.entreguePor ? ` · registrado por ${t.entreguePor}` : ""}
                        </div>
                      )}

                      {/* Ações do tubo — dois passos, nesta ordem: fechar (foto
                          do tubo) e entregar (quem recebeu). */}
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", padding: "10px 12px", borderTop: `1px solid ${COR.borda}` }}>
                        {!vazio && (
                          <Link href={`/grafica/tubos/${t.id}/etiqueta`} data-testid={`etiqueta-tubo-${t.numero}`}
                            style={{ display: "inline-flex", alignItems: "center", gap: 6, height: alvo, padding: "0 12px", borderRadius: 8, border: `1px solid ${COR.borda}`, background: "#fff", color: COR.texto, fontSize: 12.5, fontWeight: 700, textDecoration: "none" }}>
                            <Tag aria-hidden="true" style={{ width: 13, height: 13 }} /> Etiqueta
                          </Link>
                        )}
                        {!entregue && !vazio && fechando !== t.id && entregando !== t.id && !t.pecas.some(soVisualizaKit) && (
                          <button type="button" onClick={() => { setFechando(t.id); setFotosFechamento([]); setEntregando(null); }}
                            data-testid={`fechar-tubo-${t.numero}`}
                            title={fechado ? "Tirar as fotos de novo (substitui as anteriores)" : "Foto do tubo fechado e dos itens dentro — as peças ficam Embalado"}
                            style={{ display: "inline-flex", alignItems: "center", gap: 6, height: alvo, padding: "0 12px", borderRadius: 8, border: fechado ? `1px solid ${COR.azulBorda}` : "none", background: fechado ? COR.azulBg : COR.azul, color: fechado ? COR.azul : "#fff", fontSize: 12.5, fontWeight: 800, cursor: "pointer" }}>
                            <PackageCheck aria-hidden="true" style={{ width: 13, height: 13 }} /> {fechado ? "Refazer fotos" : "Fechar tubo (foto do tubo)"}
                          </button>
                        )}
                        {!entregue && !vazio && entregando !== t.id && fechando !== t.id && !t.pecas.some(soVisualizaKit) && (
                          <button type="button" onClick={() => { setEntregando(t.id); setFotos([]); setRecebidoPor(""); setObs(""); }}
                            disabled={!t.prontoParaEntregar} title={motivoBloqueio ?? (fechado ? undefined : "Dá para entregar sem fechar, mas o certo é fotografar o tubo antes")}
                            data-testid={`entregar-tubo-${t.numero}`}
                            style={{ display: "inline-flex", alignItems: "center", gap: 6, height: alvo, padding: "0 12px", borderRadius: 8, border: "none", background: t.prontoParaEntregar ? COR.verde : "#e7e5e4", color: t.prontoParaEntregar ? "#fff" : COR.fraco, fontSize: 12.5, fontWeight: 800, cursor: t.prontoParaEntregar ? "pointer" : "not-allowed" }}>
                            <Truck aria-hidden="true" style={{ width: 13, height: 13 }} /> Entregar tubo (quem recebeu)
                          </button>
                        )}
                        {!entregue && !t.pecas.some(soVisualizaKit) && (
                          confirmandoApagar === t.id ? (
                            <>
                              <button type="button" onClick={() => apagar.mutate(t.id)} disabled={apagar.isPending}
                                data-testid={`confirmar-apagar-tubo-${t.numero}`}
                                style={{ display: "inline-flex", alignItems: "center", gap: 6, height: alvo, padding: "0 12px", borderRadius: 8, border: "none", background: "#b91c1c", color: "#fff", fontSize: 12.5, fontWeight: 800, cursor: "pointer" }}>
                                <Trash2 aria-hidden="true" style={{ width: 13, height: 13 }} /> {vazio ? "Apagar" : `Apagar e devolver ${t.pecas.length} a Conferido`}
                              </button>
                              <button type="button" onClick={() => setConfirmandoApagar(null)}
                                style={{ height: alvo, padding: "0 10px", borderRadius: 8, border: `1px solid ${COR.borda}`, background: "#fff", color: COR.sec, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
                                Não
                              </button>
                            </>
                          ) : (
                            <button type="button" onClick={() => setConfirmandoApagar(t.id)}
                              data-testid={`apagar-tubo-${t.numero}`}
                              title={vazio ? "Apaga o tubo vazio" : "Apaga o tubo; as peças voltam a Conferido"}
                              style={{ display: "inline-flex", alignItems: "center", gap: 6, height: alvo, padding: "0 12px", borderRadius: 8, border: `1px solid ${COR.borda}`, background: "#fff", color: "#b91c1c", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
                              <Trash2 aria-hidden="true" style={{ width: 13, height: 13 }} /> {vazio ? "Apagar tubo vazio" : "Apagar tubo"}
                            </button>
                          )
                        )}
                        {!entregue && !vazio && !t.prontoParaEntregar && motivoBloqueio && (
                          <span style={{ fontSize: fsMin(11.5), color: COR.ambar, alignSelf: "center" }}>{motivoBloqueio}</span>
                        )}
                      </div>

                      {/* Passo 1 · Fechar o tubo: fotos do tubo pronto e dos itens */}
                      {fechando === t.id && (
                        <div data-testid={`form-fechar-tubo-${t.numero}`} style={{ padding: 12, borderTop: `1px solid ${COR.borda}`, background: COR.azulBg, display: "flex", flexDirection: "column", gap: 10 }}>
                          <span style={{ fontSize: 12.5, color: COR.texto }}>
                            Fotografe o <strong>Tubo {t.numero} fechado</strong> e os itens que estão nele. Não é a entrega: as peças ficam <strong>Embalado</strong> até o tubo sair.
                          </span>
                          <div>
                            <span style={ROTULO}>Fotos do tubo e dos itens *</span>
                            {uploaderDeFotos(fotosFechamento, setFotosFechamento, `Foto do Tubo ${t.numero}`)}
                          </div>
                          {/* Cancelar / Fechar moram no rodapé fixo do modal (abaixo). */}
                        </div>
                      )}

                      {/* Passo 2 · Entregar o tubo inteiro: quem recebeu e quando */}
                      {entregando === t.id && (
                        <div data-testid={`form-entrega-tubo-${t.numero}`} style={{ padding: 12, borderTop: `1px solid ${COR.borda}`, background: "#f0fdf4", display: "flex", flexDirection: "column", gap: 10 }}>
                          <span style={{ fontSize: 12.5, color: COR.texto }}>
                            Entregar as <strong>{t.pecas.filter((p) => !p.entregue).length}</strong> peças do Tubo {t.numero} de uma vez. O que registra a entrega é <strong>quem recebeu</strong> e a hora.
                          </span>
                          {!fechado && (
                            <span style={{ fontSize: fsMin(11.5), color: COR.ambar }}>
                              Este tubo ainda não foi fechado com foto. Dá para entregar assim mesmo, mas o certo é fotografar o tubo antes.
                            </span>
                          )}
                          <div>
                            <span style={ROTULO}>Quem recebeu *</span>
                            <input value={recebidoPor} onChange={(e) => setRecebidoPor(e.target.value)} placeholder="Nome de quem recebeu"
                              data-testid={`recebedor-tubo-${t.numero}`}
                              style={{ marginTop: 6, width: "100%", boxSizing: "border-box", height: isMobile ? 44 : 38, borderRadius: 8, border: `1px solid ${COR.borda}`, padding: "0 10px", fontSize: isMobile ? 16 : 13, background: "#fff" }} />
                          </div>
                          <div>
                            <span style={ROTULO}>Foto do comprovante <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>· opcional</span></span>
                            {uploaderDeFotos(fotos, setFotos, "Foto da entrega")}
                          </div>
                          <input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Observação (opcional)" aria-label="Observação (opcional)"
                            style={{ width: "100%", boxSizing: "border-box", height: isMobile ? 44 : 38, borderRadius: 8, border: `1px solid ${COR.borda}`, padding: "0 10px", fontSize: isMobile ? 16 : 13, background: "#fff" }} />
                          {/* Cancelar / Entregar moram no rodapé fixo do modal (abaixo). */}
                        </div>
                      )}
                    </div>
                  );
                })}
              </section>
            </>
          )}
        </div>

        {/* ── Rodapé fixo (fora da rolagem): os botões do formulário aberto ──
            Fechar tubo / Entregar tubo ficavam no fim do bloco do tubo, e no
            celular o teclado ou a lista de tubos os empurravam para fora da
            tela. Aqui ficam sempre à vista, com o recorte seguro do home
            indicator — nos LONGOS, porque o jsdom descarta o atalho com env(). */}
        {tuboEmFormulario && (() => {
          const t = tuboEmFormulario;
          const fechandoEste = fechando === t.id;
          const podeConfirmar = fechandoEste ? fotosFechamento.length > 0 : !!recebidoPor.trim();
          const pendente = fechandoEste ? fechar.isPending : entregar.isPending;
          return (
            <div data-testid={`rodape-${fechandoEste ? "fechar" : "entregar"}-tubo-${t.numero}`}
              style={{ flexShrink: 0, display: "flex", gap: 10, paddingTop: 10, paddingLeft: pad, paddingRight: pad, paddingBottom: "calc(10px + env(safe-area-inset-bottom))", borderTop: `1px solid ${COR.borda}`, background: "#fff", boxShadow: "0 -8px 12px -8px rgba(28,25,23,0.18)" }}>
              <button type="button"
                onClick={() => { if (fechandoEste) { setFechando(null); setFotosFechamento([]); } else setEntregando(null); }}
                style={{ flex: 1, minHeight: isMobile ? 48 : 40, borderRadius: 8, border: `1px solid ${COR.borda}`, background: "#fff", color: COR.sec, fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}>
                Cancelar
              </button>
              {fechandoEste ? (
                <button type="button" onClick={() => fechar.mutate(t)} disabled={fechar.isPending || fotosFechamento.length === 0}
                  data-testid={`confirmar-fechar-tubo-${t.numero}`}
                  style={{ flex: 2, minHeight: isMobile ? 48 : 40, borderRadius: 8, border: "none", background: podeConfirmar ? COR.azul : "#e7e5e4", color: podeConfirmar ? "#fff" : COR.fraco, fontWeight: 800, fontSize: 13, cursor: pendente || !podeConfirmar ? "not-allowed" : "pointer" }}>
                  {fechar.isPending ? "Salvando…" : fotosFechamento.length ? `Fechar Tubo ${t.numero} · ${fotosFechamento.length} ${fotosFechamento.length === 1 ? "foto" : "fotos"}` : "Tire a foto para fechar"}
                </button>
              ) : (
                <button type="button" onClick={() => entregar.mutate(t)} disabled={entregar.isPending || !recebidoPor.trim()}
                  data-testid={`confirmar-entrega-tubo-${t.numero}`}
                  style={{ flex: 2, minHeight: isMobile ? 48 : 40, borderRadius: 8, border: "none", background: podeConfirmar ? COR.verde : "#e7e5e4", color: podeConfirmar ? "#fff" : COR.fraco, fontWeight: 800, fontSize: 13, cursor: pendente || !podeConfirmar ? "not-allowed" : "pointer" }}>
                  {entregar.isPending ? "Salvando…" : recebidoPor.trim() ? `Entregar Tubo ${t.numero}` : "Informe quem recebeu"}
                </button>
              )}
            </div>
          );
        })()}
      </DialogContent>
    </Dialog>
  );
}
