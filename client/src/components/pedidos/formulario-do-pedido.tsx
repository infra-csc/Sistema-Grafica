// ─────────────────────────────────────────────────────────────────────────────
// FORMULÁRIO DO PEDIDO — gaveta lateral para criar e editar (14/09).
//
// Era uma coluna fixa ao lado da lista, ocupando espaço de quem só consulta.
// Agora abre por "Novo pedido" (ou "Editar") e fecha ao salvar.
//
// Regras que o formulário cuida antes do servidor:
//   · evento só em andamento; o prazo nasce com a saída do caminhão;
//   · avisa se o caminhão já saiu ou se o prazo passa da saída;
//   · referências: várias, arrastar/colar, e SALVAR TRAVA enquanto alguma
//     imagem ainda está subindo (antes o pedido saía sem ela).
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, ImagePlus, Send } from "lucide-react";
import type { Sponsor } from "@shared/schema";
import {
  MAX_REFERENCIAS_DO_PEDIDO,
  avisoDoPrazo,
  caminhaoJaSaiu,
  type PedidoDePeca,
} from "@shared/pedidos-de-peca";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { FilterSelect } from "@/components/filter-select";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useFileUpload } from "@/hooks/use-file-upload";
import { motivoEventoFinalizado, todayBusinessMs } from "@/lib/status";
import { T, FS, R } from "@/lib/theme";
import { ReferenciasDoPedido, diaDoEvento, invalidarPedidos, mensagemDaApi } from "@/components/pedidos/ui";

const ROTULO: React.CSSProperties = { display: "block", fontSize: FS.small, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "#57534e", marginBottom: 6 };
const CAMPO: React.CSSProperties = { width: "100%", boxSizing: "border-box", minHeight: 42, padding: "9px 12px", borderRadius: R.md, border: "1px solid #d6d3d1", background: "#ffffff", fontSize: 14, color: T.text, outline: "none", fontFamily: "inherit" };
const OPCIONAL = <span style={{ fontWeight: 600, textTransform: "none", letterSpacing: 0 }}>(opcional)</span>;
const TAMANHO_MAXIMO = 10 * 1024 * 1024;

const dataDoCampo = (d: string | Date | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : "");
const numeroDoCampo = (v: string) => {
  const n = parseFloat(v.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
};

type Estado = {
  eventId: string; sponsorId: string; quantidade: string; precisaAte: string;
  tipoDePeca: string; largura: string; altura: string; observacao: string; referencias: string[];
};

const vazio: Estado = { eventId: "", sponsorId: "", quantidade: "1", precisaAte: "", tipoDePeca: "", largura: "", altura: "", observacao: "", referencias: [] };

const doPedido = (p: PedidoDePeca): Estado => ({
  eventId: p.eventId,
  sponsorId: p.sponsorId ?? "",
  quantidade: String(p.quantidade),
  precisaAte: dataDoCampo(p.precisaAte),
  tipoDePeca: p.tipoDePeca ?? "",
  largura: p.largura ? String(Number(p.largura)) : "",
  altura: p.altura ? String(Number(p.altura)) : "",
  observacao: p.observacao,
  referencias: p.referencias ?? [],
});

export function FormularioDoPedido({ aberto, pedido, onFechar }: {
  aberto: boolean;
  /** Presente = editar este pedido; ausente = novo pedido. */
  pedido: PedidoDePeca | null;
  onFechar: () => void;
}) {
  const { toast } = useToast();
  const editando = !!pedido;
  const [form, setForm] = useState<Estado>(vazio);
  const [arrastando, setArrastando] = useState(false);

  // Cada abertura começa do zero (novo) ou do pedido (editar).
  useEffect(() => {
    if (aberto) setForm(pedido ? doPedido(pedido) : vazio);
  }, [aberto, pedido]);

  const { data: eventos = [] } = useQuery<any[]>({ queryKey: ["/api/events"], enabled: aberto });
  const { data: patrocinadores = [] } = useQuery<Sponsor[]>({ queryKey: ["/api/sponsors"], enabled: aberto });
  const { data: modelos = [] } = useQuery<any[]>({ queryKey: ["/api/standard-items"], enabled: aberto });
  const { data: vinculos = [] } = useQuery<Array<{ sponsorId: string }>>({
    queryKey: ["/api/events", form.eventId, "sponsors"],
    enabled: aberto && !!form.eventId,
  });

  const hoje = todayBusinessMs();
  const eventosAbertos = useMemo(
    () => eventos
      .filter((e) => !motivoEventoFinalizado(e, hoje))
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()),
    [eventos, hoje],
  );
  const evento = eventos.find((e) => e.id === form.eventId) ?? null;
  const opcoesDeEvento = eventosAbertos.map((e) => ({ value: e.id, label: `${e.name}${e.startDate ? ` · ${diaDoEvento(e.startDate)}` : ""}` }));
  const doEvento = new Set(vinculos.map((v) => v.sponsorId));
  const opcoesDePatrocinador = patrocinadores
    .filter((s) => doEvento.size === 0 || doEvento.has(s.id))
    .map((s) => ({ value: s.id, label: s.name }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  const nomesDeModelos = useMemo(() => Array.from(new Set(modelos.map((m: any) => m.name))).sort(), [modelos]);

  const escolherEvento = (id: string) => {
    const ev = eventos.find((e) => e.id === id);
    setForm((f) => ({ ...f, eventId: id, sponsorId: "", precisaAte: dataDoCampo(ev?.truckDepartureDate) }));
  };
  const escolherTipo = (valor: string) => {
    const modelo = modelos.find((m: any) => m.name === valor);
    setForm((f) => ({
      ...f,
      tipoDePeca: valor,
      ...(modelo && !f.largura && !f.altura && modelo.visualWidth && modelo.visualHeight
        ? { largura: String(Number(modelo.visualWidth)), altura: String(Number(modelo.visualHeight)) }
        : {}),
    }));
  };

  // Referências: um envio só (botão, arrastar e colar), que o salvar enxerga.
  const envio = useFileUpload({
    maxFileSize: TAMANHO_MAXIMO,
    onComplete: ({ url }) => setForm((f) => (f.referencias.length >= MAX_REFERENCIAS_DO_PEDIDO ? f : { ...f, referencias: [...f.referencias, url] })),
    onError: (e) => toast({ title: "Não deu para enviar a imagem", description: e.message, variant: "destructive" }),
    validateFile: (file) => (!file.type.startsWith("image/") ? "Apenas imagens são permitidas" : null),
  });
  const enviarImagens = (arquivos: File[]) => {
    const imagens = arquivos.filter((a) => a.type.startsWith("image/"));
    if (imagens.length === 0) return;
    const grandes = imagens.filter((a) => a.size > TAMANHO_MAXIMO).length;
    if (grandes) toast({ title: `${grandes} imagem(ns) acima de 10 MB ficaram de fora`, variant: "destructive" });
    const vagas = MAX_REFERENCIAS_DO_PEDIDO - form.referencias.length;
    if (vagas <= 0) { toast({ title: `No máximo ${MAX_REFERENCIAS_DO_PEDIDO} referências por pedido`, variant: "destructive" }); return; }
    const aceitas = imagens.filter((a) => a.size <= TAMANHO_MAXIMO);
    if (aceitas.length > vagas) toast({ title: `Só cabem mais ${vagas} referência(s)`, description: "As demais imagens ficaram de fora." });
    void envio.uploadFiles(aceitas.slice(0, vagas));
  };

  const quantidade = parseInt(form.quantidade, 10);
  const largura = numeroDoCampo(form.largura);
  const altura = numeroDoCampo(form.altura);
  const faltando = !form.eventId ? "Escolha o evento"
    : !form.sponsorId ? "Escolha o patrocinador"
    : !(quantidade >= 1) ? "Informe a quantidade (mínimo 1)"
    : (form.largura && !largura) || (form.altura && !altura) ? "Medida inválida — use números, ex.: 3 × 1"
    : form.observacao.trim().length < 3 ? "Descreva o que precisa"
    : envio.isUploading ? "Aguarde o envio das imagens"
    : null;

  const saida = evento?.truckDepartureDate ?? pedido?.eventSaida ?? null;
  const caminhaoSaiu = caminhaoJaSaiu(saida, new Date());
  const avisoPrazo = avisoDoPrazo(form.precisaAte ? `${form.precisaAte}T12:00:00Z` : null, saida);

  const salvar = useMutation({
    mutationFn: async () => {
      const corpo = {
        sponsorId: form.sponsorId,
        quantidade,
        observacao: form.observacao.trim(),
        referencias: form.referencias,
        precisaAte: form.precisaAte || null,
        tipoDePeca: form.tipoDePeca.trim() || null,
        largura,
        altura,
      };
      const r = editando
        ? await apiRequest("PATCH", `/api/pedidos-de-peca/${pedido!.id}`, corpo)
        : await apiRequest("POST", "/api/pedidos-de-peca", { eventId: form.eventId, ...corpo });
      return r.json();
    },
    onSuccess: () => {
      toast({ title: editando ? "Pedido atualizado" : "Pedido enviado", description: "Quem monta a lista foi avisado." });
      invalidarPedidos();
      onFechar();
    },
    onError: (e) => toast({ title: editando ? "Não deu para salvar" : "Não deu para enviar o pedido", description: mensagemDaApi(e), variant: "destructive" }),
  });

  const travado = !!faltando || salvar.isPending;

  return (
    <Sheet open={aberto} onOpenChange={(o) => { if (!o && !salvar.isPending) onFechar(); }}>
      <SheetContent side="right" data-testid="formulario-pedido-de-peca"
        style={{ width: "min(480px, 100vw)", maxWidth: "min(480px, 100vw)", padding: 0, display: "flex", flexDirection: "column", gap: 0 }}
        onPaste={(e) => {
          const arquivos = Array.from(e.clipboardData?.files ?? []);
          if (arquivos.some((a) => a.type.startsWith("image/"))) { e.preventDefault(); enviarImagens(arquivos); }
        }}
      >
        <div style={{ padding: "20px 24px 14px", borderBottom: "1px solid #ebe8e4", flexShrink: 0 }}>
          <SheetTitle style={{ margin: 0, fontSize: 18, fontWeight: 800, color: T.text }}>{editando ? "Editar pedido" : "Pedir peça para a lista"}</SheetTitle>
          <SheetDescription style={{ margin: "4px 0 0", fontSize: FS.body, color: "#57534e" }}>
            {editando ? "Quem monta a lista é avisado do que mudou." : "Quem monta a lista recebe o pedido no evento e cria a peça."}
          </SheetDescription>
        </div>

        <form id="form-pedido" onSubmit={(e) => { e.preventDefault(); if (!travado) salvar.mutate(); }}
          style={{ flex: "1 1 auto", minHeight: 0, overflowY: "auto", padding: "16px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label htmlFor="pedido-evento" style={ROTULO}>Evento</label>
            {editando ? (
              <div style={{ ...CAMPO, background: "#fafaf9", color: "#44403c" }}>{pedido?.eventName ?? "Evento"}</div>
            ) : (
              <FilterSelect kind="field" fullWidth hideWhenEmpty={false}
                label="Evento" allLabel="Escolha o evento" showAllLabelWhenEmpty
                value={form.eventId} onChange={escolherEvento} options={opcoesDeEvento}
                searchPlaceholder="Buscar evento..." emptyText="Nenhum evento em andamento."
                testId="select-pedido-evento" triggerProps={{ id: "pedido-evento" }}
                triggerStyle={{ ...CAMPO, height: "auto" }} />
            )}
            {caminhaoSaiu && (
              <p role="status" style={{ margin: "6px 0 0", display: "flex", gap: 6, fontSize: FS.body, color: "#92400e" }}>
                <AlertTriangle size={14} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} /> O caminhão deste evento já saiu — a peça não embarca nele.
              </p>
            )}
          </div>

          <div>
            <label htmlFor="pedido-patrocinador" style={ROTULO}>Patrocinador</label>
            {form.eventId ? (
              <FilterSelect kind="field" fullWidth hideWhenEmpty={false}
                label="Patrocinador" allLabel="Escolha o patrocinador" showAllLabelWhenEmpty
                value={form.sponsorId} onChange={(v) => setForm((f) => ({ ...f, sponsorId: v }))} options={opcoesDePatrocinador}
                searchPlaceholder="Buscar patrocinador..." emptyText="Nenhum patrocinador neste evento."
                testId="select-pedido-patrocinador" triggerProps={{ id: "pedido-patrocinador" }}
                triggerStyle={{ ...CAMPO, height: "auto" }} />
            ) : (
              <div id="pedido-patrocinador" style={{ ...CAMPO, color: "#78716c", background: "#fafaf9" }}>Escolha o evento primeiro</div>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 12 }}>
            <div>
              <label htmlFor="pedido-quantidade" style={ROTULO}>Quantidade</label>
              <input id="pedido-quantidade" data-testid="input-pedido-quantidade" type="number" min={1} step={1} inputMode="numeric"
                value={form.quantidade}
                onChange={(e) => {
                  const digitos = e.target.value.replace(/\D/g, "");
                  setForm((f) => ({ ...f, quantidade: digitos === "" ? "" : String(Math.max(1, parseInt(digitos, 10))) }));
                }}
                onBlur={() => setForm((f) => ({ ...f, quantidade: f.quantidade === "" ? "1" : f.quantidade }))}
                style={CAMPO} />
            </div>
            <div>
              <label htmlFor="pedido-prazo" style={ROTULO}>Precisa até</label>
              <input id="pedido-prazo" data-testid="input-pedido-prazo" type="date" value={form.precisaAte}
                onChange={(e) => setForm((f) => ({ ...f, precisaAte: e.target.value }))} style={CAMPO} />
            </div>
          </div>
          {avisoPrazo && (
            <p role="status" data-testid="aviso-prazo-pedido" style={{ margin: "-8px 0 0", display: "flex", gap: 6, fontSize: FS.body, color: "#92400e" }}>
              <AlertTriangle size={14} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} /> {avisoPrazo}
            </p>
          )}

          <div>
            <label htmlFor="pedido-tipo" style={ROTULO}>Tipo de peça {OPCIONAL}</label>
            <input id="pedido-tipo" data-testid="input-pedido-tipo" list="modelos-do-pedido" value={form.tipoDePeca}
              onChange={(e) => escolherTipo(e.target.value)} placeholder="Ex.: Banner 3x1, Placa km" style={CAMPO} />
            <datalist id="modelos-do-pedido">{nomesDeModelos.map((n) => <option key={n} value={n} />)}</datalist>
          </div>

          <div>
            <span style={ROTULO}>Medida da área visual {OPCIONAL}</span>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto minmax(0, 1fr) auto", gap: 8, alignItems: "center" }}>
              <input aria-label="Largura em metros" data-testid="input-pedido-largura" inputMode="decimal" value={form.largura}
                onChange={(e) => setForm((f) => ({ ...f, largura: e.target.value }))} placeholder="Largura" style={CAMPO} />
              <span aria-hidden="true" style={{ color: "#57534e" }}>×</span>
              <input aria-label="Altura em metros" data-testid="input-pedido-altura" inputMode="decimal" value={form.altura}
                onChange={(e) => setForm((f) => ({ ...f, altura: e.target.value }))} placeholder="Altura" style={CAMPO} />
              <span style={{ fontSize: FS.body, color: "#57534e" }}>m</span>
            </div>
          </div>

          <div>
            <label htmlFor="pedido-observacao" style={ROTULO}>O que precisa</label>
            <textarea id="pedido-observacao" data-testid="input-pedido-observacao" rows={4}
              value={form.observacao} onChange={(e) => setForm((f) => ({ ...f, observacao: e.target.value }))}
              placeholder="Ex.: 2 banners com a nova logo, para a área de largada — o patrocinador pediu cor mais escura."
              style={{ ...CAMPO, resize: "vertical", lineHeight: 1.45 }} />
          </div>

          <div>
            <span style={ROTULO}>Referências {OPCIONAL}</span>
            <div data-testid="zona-referencias-pedido"
              onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
              onDragLeave={() => setArrastando(false)}
              onDrop={(e) => { e.preventDefault(); setArrastando(false); enviarImagens(Array.from(e.dataTransfer.files)); }}
              style={{ display: "flex", flexDirection: "column", gap: 10, padding: 12, borderRadius: R.md, border: `1.5px dashed ${arrastando ? "#b45309" : "#d6d3d1"}`, background: arrastando ? "#fffbeb" : "#fafaf9" }}>
              <ReferenciasDoPedido urls={form.referencias} tamanho={60}
                onRemover={(i) => setForm((f) => ({ ...f, referencias: f.referencias.filter((_, j) => j !== i) }))} />
              <input ref={envio.fileInputRef} type="file" accept="image/*" multiple hidden data-testid="input-referencias-pedido"
                onChange={(e) => enviarImagens(Array.from(e.target.files ?? []))} />
              {form.referencias.length < MAX_REFERENCIAS_DO_PEDIDO && (
                <button type="button" onClick={() => envio.fileInputRef.current?.click()} disabled={envio.isUploading}
                  style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 6, height: 40, padding: "0 14px", borderRadius: R.md, border: "1px solid #d6d3d1", background: "#fff", color: T.text, fontSize: FS.body, fontWeight: 700, cursor: envio.isUploading ? "wait" : "pointer" }}>
                  <ImagePlus size={15} aria-hidden="true" />
                  {envio.isUploading ? "Enviando imagens…" : form.referencias.length === 0 ? "Adicionar referências" : "Adicionar mais"}
                </button>
              )}
              <span data-testid="contador-referencias-pedido" style={{ fontSize: FS.small, color: "#57534e", lineHeight: 1.45 }}>
                {form.referencias.length} de {MAX_REFERENCIAS_DO_PEDIDO} · escolha várias, arraste para cá ou cole com Ctrl+V. Referência do solicitante — não é arte final.
              </span>
            </div>
          </div>
        </form>

        <div style={{ padding: "12px 24px 16px", borderTop: "1px solid #ebe8e4", display: "flex", flexDirection: "column", gap: 6, flexShrink: 0, background: "#fff" }}>
          <button type="submit" form="form-pedido" data-testid="button-enviar-pedido" disabled={travado}
            style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, height: 46, borderRadius: R.md, border: "none", background: travado ? "#e7e5e4" : "#1c1917", color: travado ? "#78716c" : "#fff", fontSize: 14, fontWeight: 800, cursor: travado ? "not-allowed" : "pointer" }}>
            <Send size={15} aria-hidden="true" /> {salvar.isPending ? "Salvando…" : editando ? "Salvar alterações" : "Enviar pedido"}
          </button>
          {faltando && <p aria-live="polite" style={{ margin: 0, fontSize: FS.small, color: "#57534e", textAlign: "center" }}>{faltando}.</p>}
        </div>
      </SheetContent>
    </Sheet>
  );
}
