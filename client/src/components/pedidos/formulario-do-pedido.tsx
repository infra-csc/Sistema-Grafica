// ─────────────────────────────────────────────────────────────────────────────
// NOVA SOLICITAÇÃO — janela central com VÁRIAS PEÇAS (dono, 14/09).
//
// "Poder solicitar mais de uma peça por solicitação, e cada uma teria seu
// status. Pode selecionar outro evento e outro patrocinador, e pode colocar
// sem patrocinador também, ou mais de um patrocinador por peça."
//
// Cada peça é um bloco com evento, patrocinadores (nenhum, um ou vários),
// quantidade, prazo, tipo, medida, o que precisa e as próprias referências.
// "Adicionar outra peça" já traz evento, patrocinadores e prazo da anterior —
// o caso comum é várias peças do mesmo evento.
//
// Não há edição: o Atendimento, se errou, cancela e cria outra.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, Copy, ImagePlus, Inbox, Plus, Send, Trash2, X } from "lucide-react";
import type { Sponsor } from "@shared/schema";
import {
  MAX_PECAS_POR_SOLICITACAO,
  MAX_REFERENCIAS_DO_PEDIDO,
  avisoDoPrazo,
  caminhaoJaSaiu,
} from "@shared/pedidos-de-peca";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { HIDE_NATIVE_CLOSE, ModalHeader, modalSurface } from "@/components/modal-shell";
import { FilterSelect } from "@/components/filter-select";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useFileUpload } from "@/hooks/use-file-upload";
import { useIsMobile } from "@/hooks/use-mobile";
import { motivoEventoFinalizado, todayBusinessMs } from "@/lib/status";
import { T, FS, R } from "@/lib/theme";
import { ReferenciasDoPedido, diaDoEvento, invalidarPedidos, mensagemDaApi } from "@/components/pedidos/ui";

const ROTULO: React.CSSProperties = { display: "block", fontSize: FS.small, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "#57534e", marginBottom: 6 };
const CAMPO: React.CSSProperties = { width: "100%", boxSizing: "border-box", height: 40, padding: "0 12px", borderRadius: R.md, border: "1px solid #d6d3d1", background: "#ffffff", fontSize: 14, color: T.text, outline: "none", fontFamily: "inherit" };
/** O gatilho do FilterSelect herda centralizado do botão — aqui é campo. */
const GATILHO: React.CSSProperties = { ...CAMPO, textAlign: "left", justifyContent: "space-between" };
const OPCIONAL = <span style={{ fontWeight: 600, textTransform: "none", letterSpacing: 0 }}>(opcional)</span>;
const TAMANHO_MAXIMO = 10 * 1024 * 1024;

const dataDoCampo = (d: string | Date | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : "");
const numeroDoCampo = (v: string) => {
  const n = parseFloat(v.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
};

export type PecaDoFormulario = {
  chave: string;
  eventId: string; sponsorIds: string[]; quantidade: string; precisaAte: string;
  tipoDePeca: string; largura: string; altura: string; observacao: string; referencias: string[];
  enviando: boolean;
};

let sequencia = 0;
const novaPeca = (base?: Partial<PecaDoFormulario>): PecaDoFormulario => ({
  chave: `peca-${Date.now()}-${sequencia++}`,
  eventId: "", sponsorIds: [], quantidade: "1", precisaAte: "", tipoDePeca: "", largura: "", altura: "", observacao: "", referencias: [],
  ...base,
  enviando: false,
});

/** O que falta nesta peça, ou null. */
export function faltaNaPeca(p: PecaDoFormulario): string | null {
  if (!p.eventId) return "escolha o evento";
  if (!(parseInt(p.quantidade, 10) >= 1)) return "informe a quantidade (mínimo 1)";
  if ((p.largura && !numeroDoCampo(p.largura)) || (p.altura && !numeroDoCampo(p.altura))) return "medida inválida — use números, ex.: 3 × 1";
  if (p.observacao.trim().length < 3) return "descreva o que precisa";
  if (p.enviando) return "aguarde o envio das imagens";
  return null;
}

function Aviso({ children, testId }: { children: React.ReactNode; testId?: string }) {
  return (
    <p role="status" data-testid={testId} style={{ margin: "6px 0 0", display: "flex", gap: 6, fontSize: FS.body, color: "#92400e", lineHeight: 1.4 }}>
      <AlertTriangle size={14} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} /> {children}
    </p>
  );
}

function BlocoDaPeca({ peca, numero, total, eventos, opcoesDeEvento, patrocinadores, modelos, nomesDeModelos, onMudar, onRemover, onDuplicar }: {
  peca: PecaDoFormulario;
  numero: number;
  total: number;
  eventos: any[];
  opcoesDeEvento: Array<{ value: string; label: string }>;
  patrocinadores: Sponsor[];
  modelos: any[];
  nomesDeModelos: string[];
  onMudar: (mudanca: Partial<PecaDoFormulario> | ((p: PecaDoFormulario) => Partial<PecaDoFormulario>)) => void;
  onRemover: () => void;
  onDuplicar: () => void;
}) {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [arrastando, setArrastando] = useState(false);
  const id = (campo: string) => `${peca.chave}-${campo}`;

  const { data: vinculos = [] } = useQuery<Array<{ sponsorId: string }>>({
    queryKey: ["/api/events", peca.eventId, "sponsors"],
    enabled: !!peca.eventId,
  });
  const doEvento = new Set(vinculos.map((v) => v.sponsorId));
  const nomePorId = new Map(patrocinadores.map((s) => [s.id, s.name]));
  const opcoesDePatrocinador = patrocinadores
    .filter((s) => (doEvento.size === 0 || doEvento.has(s.id)) && !peca.sponsorIds.includes(s.id))
    .map((s) => ({ value: s.id, label: s.name }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));

  const evento = eventos.find((e) => e.id === peca.eventId) ?? null;
  const saida = evento?.truckDepartureDate ?? null;
  const caminhaoSaiu = caminhaoJaSaiu(saida, new Date());
  const avisoPrazo = avisoDoPrazo(peca.precisaAte ? `${peca.precisaAte}T12:00:00Z` : null, saida);

  const escolherEvento = (eventId: string) => {
    const ev = eventos.find((e) => e.id === eventId);
    // Patrocinador é do evento: trocar de evento limpa os escolhidos.
    onMudar({ eventId, sponsorIds: [], precisaAte: dataDoCampo(ev?.truckDepartureDate) });
  };
  const escolherTipo = (valor: string) => {
    const modelo = modelos.find((m: any) => m.name === valor);
    onMudar((p) => ({
      tipoDePeca: valor,
      ...(modelo && !p.largura && !p.altura && modelo.visualWidth && modelo.visualHeight
        ? { largura: String(Number(modelo.visualWidth)), altura: String(Number(modelo.visualHeight)) }
        : {}),
    }));
  };

  // Referências desta peça: botão, arrastar e colar.
  const envio = useFileUpload({
    maxFileSize: TAMANHO_MAXIMO,
    onComplete: ({ url }) => onMudar((p) => (p.referencias.length >= MAX_REFERENCIAS_DO_PEDIDO ? {} : { referencias: [...p.referencias, url] })),
    onError: (e) => toast({ title: "Não deu para enviar a imagem", description: e.message, variant: "destructive" }),
    validateFile: (file) => (!file.type.startsWith("image/") ? "Apenas imagens são permitidas" : null),
  });
  useEffect(() => {
    if (envio.isUploading !== peca.enviando) onMudar({ enviando: envio.isUploading });
  }, [envio.isUploading, peca.enviando, onMudar]);
  const enviarImagens = (arquivos: File[]) => {
    const imagens = arquivos.filter((a) => a.type.startsWith("image/"));
    if (imagens.length === 0) return;
    const grandes = imagens.filter((a) => a.size > TAMANHO_MAXIMO).length;
    if (grandes) toast({ title: `${grandes} imagem(ns) acima de 10 MB ficaram de fora`, variant: "destructive" });
    const vagas = MAX_REFERENCIAS_DO_PEDIDO - peca.referencias.length;
    if (vagas <= 0) { toast({ title: `No máximo ${MAX_REFERENCIAS_DO_PEDIDO} referências por peça`, variant: "destructive" }); return; }
    const aceitas = imagens.filter((a) => a.size <= TAMANHO_MAXIMO);
    if (aceitas.length > vagas) toast({ title: `Só cabem mais ${vagas} referência(s) nesta peça`, description: "As demais imagens ficaram de fora." });
    void envio.uploadFiles(aceitas.slice(0, vagas));
  };

  const botaoPequeno: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 5, height: isMobile ? 40 : 32, padding: "0 10px", borderRadius: R.md, border: "1px solid #e7e5e4", background: "#fff", color: "#44403c", fontSize: 12.5, fontWeight: 700, cursor: "pointer" };

  return (
    <fieldset
      data-testid={`bloco-peca-${numero}`}
      onPaste={(e) => {
        const arquivos = Array.from(e.clipboardData?.files ?? []);
        if (arquivos.some((a) => a.type.startsWith("image/"))) { e.preventDefault(); enviarImagens(arquivos); }
      }}
      style={{ margin: 0, border: "1px solid #e7e5e4", borderRadius: R.lg, padding: isMobile ? 12 : "14px 16px 16px", background: "#ffffff", minWidth: 0 }}
    >
      <legend style={{ display: "contents" }}>
        <span className="sr-only">Peça {numero}</span>
      </legend>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span aria-hidden="true" style={{ fontSize: 13, fontWeight: 800, color: T.text }}>Peça {numero}</span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          {total < MAX_PECAS_POR_SOLICITACAO && (
            <button type="button" onClick={onDuplicar} data-testid={`button-duplicar-peca-${numero}`} style={botaoPequeno}>
              <Copy size={13} aria-hidden="true" /> Duplicar
            </button>
          )}
          {total > 1 && (
            <button type="button" onClick={onRemover} data-testid={`button-remover-peca-${numero}`} aria-label={`Remover a peça ${numero}`} style={{ ...botaoPequeno, color: "#b91c1c", borderColor: "#fecaca" }}>
              <Trash2 size={13} aria-hidden="true" /> Remover
            </button>
          )}
        </span>
      </div>

      <div style={{ display: "grid", gap: isMobile ? 14 : "0 24px", gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "minmax(0, 1fr) minmax(0, 1fr)", alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
          <div>
            <label htmlFor={id("evento")} style={ROTULO}>Evento</label>
            <FilterSelect kind="field" fullWidth hideWhenEmpty={false}
              label="Evento" placeholder="Escolha o evento"
              value={peca.eventId} onChange={escolherEvento} options={opcoesDeEvento}
              searchPlaceholder="Buscar evento..." emptyText="Nenhum evento em andamento."
              testId={`select-pedido-evento-${numero}`} triggerProps={{ id: id("evento") }}
              triggerStyle={GATILHO} />
            {caminhaoSaiu && <Aviso>Atenção: o caminhão deste evento já saiu.</Aviso>}
          </div>

          <div>
            <label htmlFor={id("patrocinador")} style={ROTULO}>Patrocinadores {OPCIONAL}</label>
            {peca.eventId ? (
              <FilterSelect kind="field" fullWidth hideWhenEmpty={false}
                label="Patrocinador" placeholder={peca.sponsorIds.length ? "Adicionar outro patrocinador" : "Sem patrocinador — adicionar"}
                value="" onChange={(v) => { if (v) onMudar((p) => ({ sponsorIds: p.sponsorIds.includes(v) ? p.sponsorIds : [...p.sponsorIds, v] })); }}
                options={opcoesDePatrocinador}
                searchPlaceholder="Buscar patrocinador..." emptyText="Nenhum outro patrocinador neste evento."
                testId={`select-pedido-patrocinador-${numero}`} triggerProps={{ id: id("patrocinador") }}
                triggerStyle={GATILHO} />
            ) : (
              <div id={id("patrocinador")} style={{ ...CAMPO, display: "flex", alignItems: "center", color: "#78716c", background: "#fafaf9" }}>Escolha o evento primeiro</div>
            )}
            {peca.sponsorIds.length > 0 && (
              <div data-testid={`patrocinadores-escolhidos-${numero}`} style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                {peca.sponsorIds.map((sid) => (
                  <span key={sid} style={{ display: "inline-flex", alignItems: "center", gap: 4, height: 28, padding: "0 4px 0 10px", borderRadius: R.pill, background: "#f5f5f4", border: "1px solid #e7e5e4", fontSize: 12.5, fontWeight: 700, color: "#44403c" }}>
                    {nomePorId.get(sid) ?? "Patrocinador"}
                    <button type="button" aria-label={`Tirar ${nomePorId.get(sid) ?? "patrocinador"}`}
                      onClick={() => onMudar((p) => ({ sponsorIds: p.sponsorIds.filter((x) => x !== sid) }))}
                      style={{ width: 22, height: 22, borderRadius: R.pill, border: "none", background: "transparent", color: "#57534e", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <X size={13} aria-hidden="true" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.4fr)", gap: 12 }}>
            <div>
              <label htmlFor={id("quantidade")} style={ROTULO}>Quantidade</label>
              <input id={id("quantidade")} data-testid={`input-pedido-quantidade-${numero}`} type="number" min={1} step={1} inputMode="numeric"
                value={peca.quantidade}
                onChange={(e) => {
                  const digitos = e.target.value.replace(/\D/g, "");
                  onMudar({ quantidade: digitos === "" ? "" : String(Math.max(1, parseInt(digitos, 10))) });
                }}
                onBlur={() => { if (peca.quantidade === "") onMudar({ quantidade: "1" }); }}
                style={CAMPO} />
            </div>
            <div>
              <label htmlFor={id("prazo")} style={ROTULO}>Precisa até</label>
              <input id={id("prazo")} data-testid={`input-pedido-prazo-${numero}`} type="date" value={peca.precisaAte}
                onChange={(e) => onMudar({ precisaAte: e.target.value })} style={CAMPO} />
            </div>
          </div>
          {avisoPrazo && <Aviso testId="aviso-prazo-pedido">{avisoPrazo}</Aviso>}

          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "minmax(0, 1fr) minmax(0, 1fr)", gap: 12 }}>
            <div>
              <label htmlFor={id("tipo")} style={ROTULO}>Tipo de peça {OPCIONAL}</label>
              <input id={id("tipo")} data-testid={`input-pedido-tipo-${numero}`} list={id("modelos")} value={peca.tipoDePeca}
                onChange={(e) => escolherTipo(e.target.value)} placeholder="Ex.: Banner 3x1" style={CAMPO} />
              <datalist id={id("modelos")}>{nomesDeModelos.map((n) => <option key={n} value={n} />)}</datalist>
            </div>
            <div>
              <span style={ROTULO}>Medida (m) {OPCIONAL}</span>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto minmax(0, 1fr)", gap: 6, alignItems: "center" }}>
                <input aria-label={`Largura em metros da peça ${numero}`} data-testid={`input-pedido-largura-${numero}`} inputMode="decimal" value={peca.largura}
                  onChange={(e) => onMudar({ largura: e.target.value })} placeholder="Larg." style={CAMPO} />
                <span aria-hidden="true" style={{ color: "#57534e" }}>×</span>
                <input aria-label={`Altura em metros da peça ${numero}`} data-testid={`input-pedido-altura-${numero}`} inputMode="decimal" value={peca.altura}
                  onChange={(e) => onMudar({ altura: e.target.value })} placeholder="Alt." style={CAMPO} />
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
          <div>
            <label htmlFor={id("observacao")} style={ROTULO}>O que precisa</label>
            <textarea id={id("observacao")} data-testid={`input-pedido-observacao-${numero}`} rows={isMobile ? 3 : 4}
              value={peca.observacao} onChange={(e) => onMudar({ observacao: e.target.value })}
              placeholder="Ex.: banner com a nova logo, para a área de largada — o patrocinador pediu cor mais escura."
              style={{ ...CAMPO, height: "auto", padding: "10px 12px", resize: "vertical", lineHeight: 1.45 }} />
          </div>

          <div>
            <span style={ROTULO}>Referências {OPCIONAL}</span>
            <div data-testid={`zona-referencias-pedido-${numero}`}
              onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
              onDragLeave={() => setArrastando(false)}
              onDrop={(e) => { e.preventDefault(); setArrastando(false); enviarImagens(Array.from(e.dataTransfer.files)); }}
              style={{ display: "flex", flexDirection: "column", gap: 8, padding: 10, borderRadius: R.md, border: `1.5px dashed ${arrastando ? "#b45309" : "#d6d3d1"}`, background: arrastando ? "#fffbeb" : "#fafaf9" }}>
              <ReferenciasDoPedido urls={peca.referencias} tamanho={48}
                onRemover={(i) => onMudar((p) => ({ referencias: p.referencias.filter((_, j) => j !== i) }))} />
              <input ref={envio.fileInputRef} type="file" accept="image/*" multiple hidden data-testid={`input-referencias-pedido-${numero}`}
                onChange={(e) => enviarImagens(Array.from(e.target.files ?? []))} />
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                {peca.referencias.length < MAX_REFERENCIAS_DO_PEDIDO && (
                  <button type="button" onClick={() => envio.fileInputRef.current?.click()} disabled={envio.isUploading}
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 36, padding: "0 12px", borderRadius: R.md, border: "1px solid #d6d3d1", background: "#fff", color: T.text, fontSize: FS.body, fontWeight: 700, cursor: envio.isUploading ? "wait" : "pointer" }}>
                    <ImagePlus size={15} aria-hidden="true" />
                    {envio.isUploading ? "Enviando…" : peca.referencias.length === 0 ? "Adicionar" : "Adicionar mais"}
                  </button>
                )}
                <span style={{ fontSize: FS.small, color: "#57534e", lineHeight: 1.45 }}>
                  {peca.referencias.length} de {MAX_REFERENCIAS_DO_PEDIDO} · arraste ou cole (Ctrl+V). Não é arte final.
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </fieldset>
  );
}

export function FormularioDoPedido({ aberto, onFechar }: { aberto: boolean; onFechar: () => void }) {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [pecas, setPecas] = useState<PecaDoFormulario[]>(() => [novaPeca()]);

  // Cada abertura começa do zero.
  useEffect(() => { if (aberto) setPecas([novaPeca()]); }, [aberto]);

  const { data: eventos = [] } = useQuery<any[]>({ queryKey: ["/api/events"], enabled: aberto });
  const { data: patrocinadores = [] } = useQuery<Sponsor[]>({ queryKey: ["/api/sponsors"], enabled: aberto });
  const { data: modelos = [] } = useQuery<any[]>({ queryKey: ["/api/standard-items"], enabled: aberto });

  const hoje = todayBusinessMs();
  const opcoesDeEvento = useMemo(
    () => eventos
      .filter((e) => !motivoEventoFinalizado(e, hoje))
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
      .map((e) => ({ value: e.id, label: `${e.name}${e.startDate ? ` · ${diaDoEvento(e.startDate)}` : ""}` })),
    [eventos, hoje],
  );
  const nomesDeModelos = useMemo(() => Array.from(new Set(modelos.map((m: any) => m.name))).sort(), [modelos]);

  const mudar = (chave: string) => (mudanca: Partial<PecaDoFormulario> | ((p: PecaDoFormulario) => Partial<PecaDoFormulario>)) =>
    setPecas((lista) => lista.map((p) => (p.chave === chave ? { ...p, ...(typeof mudanca === "function" ? mudanca(p) : mudanca) } : p)));
  // Os callbacks de cada bloco são estáveis por chave (o efeito de upload depende deles).
  const mudadores = useMemo(() => new Map<string, ReturnType<typeof mudar>>(), []);
  const mudadorDe = (chave: string) => {
    let m = mudadores.get(chave);
    if (!m) { m = mudar(chave); mudadores.set(chave, m); }
    return m;
  };

  const adicionar = () => setPecas((lista) => {
    const ultima = lista[lista.length - 1];
    return [...lista, novaPeca(ultima ? { eventId: ultima.eventId, sponsorIds: ultima.sponsorIds, precisaAte: ultima.precisaAte } : {})];
  });
  const duplicar = (chave: string) => setPecas((lista) => {
    const i = lista.findIndex((p) => p.chave === chave);
    if (i < 0) return lista;
    const { chave: _c, enviando: _e, ...resto } = lista[i];
    const copia = novaPeca(resto);
    return [...lista.slice(0, i + 1), copia, ...lista.slice(i + 1)];
  });
  const remover = (chave: string) => setPecas((lista) => (lista.length > 1 ? lista.filter((p) => p.chave !== chave) : lista));

  // A PEÇA NOVA VEM ATÉ QUEM CLICOU. "Adicionar outra peça" e "Duplicar"
  // criavam o bloco fora de vista, no pé de uma janela que rola — a pessoa
  // clicava e não via nada acontecer. Agora a janela leva até o bloco novo e o
  // cursor já está em "O que precisa" (evento e prazo vêm da peça anterior).
  const chavesAnteriores = useRef<string[]>([]);
  useEffect(() => {
    const antes = new Set(chavesAnteriores.current);
    chavesAnteriores.current = pecas.map((p) => p.chave);
    if (antes.size === 0 || pecas.length <= antes.size) return;
    const nova = pecas.find((p) => !antes.has(p.chave));
    const campo = nova ? document.getElementById(`${nova.chave}-observacao`) : null;
    if (!campo) return;
    const semMovimento = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    campo.closest("fieldset")?.scrollIntoView({ behavior: semMovimento ? "auto" : "smooth", block: "start" });
    campo.focus({ preventScroll: true });
  }, [pecas]);

  const primeiraFalta = pecas.map((p, i) => ({ i, falta: faltaNaPeca(p) })).find((x) => x.falta);
  const faltando = primeiraFalta ? `Peça ${primeiraFalta.i + 1}: ${primeiraFalta.falta}` : null;
  const eventosDistintos = new Set(pecas.map((p) => p.eventId).filter(Boolean)).size;

  const salvar = useMutation({
    mutationFn: async () => {
      const corpo = {
        linhas: pecas.map((p) => ({
          eventId: p.eventId,
          sponsorIds: p.sponsorIds,
          quantidade: parseInt(p.quantidade, 10),
          observacao: p.observacao.trim(),
          referencias: p.referencias,
          precisaAte: p.precisaAte || null,
          tipoDePeca: p.tipoDePeca.trim() || null,
          largura: numeroDoCampo(p.largura),
          altura: numeroDoCampo(p.altura),
        })),
      };
      return (await apiRequest("POST", "/api/pedidos-de-peca", corpo)).json();
    },
    onSuccess: () => {
      toast({
        title: "Solicitação enviada",
        description: `${pecas.length} ${pecas.length === 1 ? "peça" : "peças"} · quem monta a lista foi avisado. Acompanhe cada uma nesta lista.`,
      });
      invalidarPedidos();
      onFechar();
    },
    onError: (e) => toast({ title: "Não deu para enviar a solicitação", description: mensagemDaApi(e), variant: "destructive" }),
  });

  const travado = !!faltando || salvar.isPending;
  const fechar = () => { if (!salvar.isPending) onFechar(); };

  return (
    <Dialog open={aberto} onOpenChange={(o) => { if (!o) fechar(); }}>
      <DialogContent data-testid="formulario-pedido-de-peca" className={HIDE_NATIVE_CLOSE} style={modalSurface(1100)}>
        <DialogTitle className="sr-only">Solicitar peças para a lista</DialogTitle>
        <DialogDescription className="sr-only">Uma solicitação pode ter várias peças, cada uma com evento e patrocinadores próprios.</DialogDescription>
        <ModalHeader
          icon={Inbox}
          tint="#b45309"
          title="Solicitar peças para a lista"
          subtitle="Uma solicitação pode ter várias peças — cada uma com evento, patrocinadores e status próprios."
          onClose={fechar}
        />

        <form
          id="form-pedido"
          onSubmit={(e) => { e.preventDefault(); if (!travado) salvar.mutate(); }}
          style={{ flex: "1 1 auto", minHeight: 0, overflowY: "auto", padding: isMobile ? 12 : "16px 24px", display: "flex", flexDirection: "column", gap: 12, background: "#fafaf9" }}
        >
          {pecas.map((p, i) => (
            <BlocoDaPeca key={p.chave} peca={p} numero={i + 1} total={pecas.length}
              eventos={eventos} opcoesDeEvento={opcoesDeEvento} patrocinadores={patrocinadores}
              modelos={modelos} nomesDeModelos={nomesDeModelos}
              onMudar={mudadorDe(p.chave)} onRemover={() => remover(p.chave)} onDuplicar={() => duplicar(p.chave)} />
          ))}
          {pecas.length < MAX_PECAS_POR_SOLICITACAO && (
            <button type="button" onClick={adicionar} data-testid="button-adicionar-peca"
              style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 6, height: 42, padding: "0 16px", borderRadius: R.md, border: "1.5px dashed #b45309", background: "#fffbeb", color: "#92400e", fontSize: 14, fontWeight: 800, cursor: "pointer" }}>
              <Plus size={16} aria-hidden="true" /> Adicionar outra peça
            </button>
          )}
        </form>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 12, flexWrap: "wrap", padding: isMobile ? "12px 16px" : "14px 24px", borderTop: "1px solid #ebe8e4", background: "#fff", flexShrink: 0 }}>
          <span aria-live="polite" style={{ fontSize: FS.body, color: faltando ? "#92400e" : "#57534e", marginRight: "auto" }}>
            {faltando
              ? `${faltando}.`
              : `${pecas.length} ${pecas.length === 1 ? "peça" : "peças"}${eventosDistintos > 1 ? ` · ${eventosDistintos} eventos` : ""}`}
          </span>
          <button type="button" onClick={fechar}
            style={{ height: 44, padding: "0 18px", borderRadius: R.md, border: "1px solid #e7e5e4", background: "#fff", color: "#44403c", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
            Cancelar
          </button>
          <button type="submit" form="form-pedido" data-testid="button-enviar-pedido" disabled={travado}
            style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, height: 44, padding: "0 22px", borderRadius: R.md, border: "none", background: travado ? "#e7e5e4" : "#1c1917", color: travado ? "#78716c" : "#fff", fontSize: 14, fontWeight: 800, cursor: travado ? "not-allowed" : "pointer" }}>
            <Send size={15} aria-hidden="true" /> {salvar.isPending ? "Enviando…" : "Enviar solicitação"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
