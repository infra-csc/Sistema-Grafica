// ─────────────────────────────────────────────────────────────────────────────
// TUBOS — TRÊS MODAIS, UM PARA CADA TAREFA (dono, 21/09).
//
// "Este modal do tubo está extremamente confuso": o painel antigo mostrava, ao
// mesmo tempo, o bloco "Embalar #0386", a lista "Peças sem tubo" com caixas já
// marcadas (inclusive de OUTRA peça), um segundo seletor "Pôr as 2 marcadas
// em", a lista de tubos e um rodapé "Escolha o tubo". Eram dois fluxos de
// embalar concorrendo com a gestão dos tubos. Agora cada tarefa tem o seu
// modal, com UMA ação primária:
//
//   1. EmbalarDialog       — "Embalar #0386": o tubo + a foto. Só isso.
//   2. EntregarTuboDialog  — "Entregar Tubo 1": o que tem dentro, as fotos,
//                            quem recebeu. Só isso.
//   3. PainelDeTubos       — "Tubos do evento": gestão (conteúdo, fotos,
//                            etiqueta, tirar peça, apagar) e as PORTAS para os
//                            outros dois — nunca o formulário deles embutido.
//
// `TubosDialog` é o ponto de entrada que a Gráfica usa: escolhe o modal pela
// porta por onde se chegou (Embalar da peça/lote, Entregar tubo da embalada,
// botão Tubos do evento) e, a partir do painel, troca para os outros dois e
// volta. Um modal por vez na tela — nada empilhado.
//
// As regras continuam no servidor (routes/tubos.ts), sem mudança: embalar peça
// conferida pede foto; as fotos do tubo acumulam; o tubo só sai inteiro, com
// tudo conferido, com quem recebeu e com alguma foto (a do tubo ou a do
// comprovante); peça do Kit é só-visualização para a Solicitação sem Kit.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { AlertTriangle, Camera, CheckCircle2, ChevronDown, ImagePlus, Package, Tag, Trash2, Truck, X, type LucideIcon } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { HIDE_NATIVE_CLOSE, ModalHeader, modalSurface } from "@/components/modal-shell";
import { useAcompanharAreaVisivel } from "@/components/grafica/area-visivel";
import { ObjectUploader } from "@/components/ObjectUploader";
import { SugestaoRecebedor } from "@/components/sugestao-recebedor";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { convertGCSUrlToLocalPath } from "@/lib/artePdfExport";
import { linhaDaLista } from "@/lib/etiqueta-lista";
import { parteDoTotal } from "@shared/embalagem";
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
  /** EMBALAGEM COM QUANTIDADE (21/09): quanto da peça está NAQUELE volume… */
  quantidadeNoTubo?: number;
  /** …o total já embalado dela, e quanto ainda dá para embalar agora. */
  embaladaQty?: number;
  aEmbalar?: number;
  /** Peça de remessa do Kit — quem só visualiza não age nela. */
  doKit?: boolean;
  /** Foto da conferência da peça — quem entrega vê que o material está documentado. */
  conferencePhotoUrl?: string | null;
};

type Tubo = {
  id: string;
  numero: number;
  /** Embalada SOZINHA: volume avulso — nunca "Tubo N" na tela. */
  avulso?: boolean;
  entregueEm: string | null;
  recebidoPor: string | null;
  entreguePor: string | null;
  fotoEntregaUrl: string | null;
  /** As fotos do tubo com os itens (acumulam a cada embalar), quando e quem. */
  fotosFechamento: string[];
  fechadoEm: string | null;
  fechadoPor: string | null;
  /** Pôs ou tirou peça DEPOIS da última foto — ela pode não bater mais. */
  alteradoDepoisDaFoto: boolean;
  pecas: Peca[];
  faltamConferir: string[];
  prontoParaEntregar: boolean;
};

type Retrato = { evento: { id: string; name: string }; tubos: Tubo[]; semTubo: Peca[] };
type Evento = { id: string; name: string };

const COR = {
  texto: "#1c1917", sec: "#57534e", fraco: "#78716c", borda: "#e7e5e4", fundo: "#fafaf9",
  laranja: "#c2410c", verde: "#15803d", verdeBg: "#f0fdf4", verdeBorda: "#bbf7d0",
  ambar: "#92400e", ambarBg: "#fffbeb", ambarBorda: "#fde68a",
  vermelho: "#b91c1c",
  // Azul do Embalado (P.blue de lib/status): embalar usa a cor da etapa.
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
/** Quanto da peça ainda dá para embalar agora (o servidor manda; sem o campo, a peça conferida inteira). */
const disponivel = (p: Peca) => p.aEmbalar ?? (p.conferida ? Math.max(0, p.quantity - (p.embaladaQty ?? 0)) : 0);
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

// ── O que os três modais compartilham ───────────────────────────────────────

/** Padrão da Gráfica no celular: alvo de 44px, campo a 16px (abaixo disso o
 *  iOS dá zoom ao focar) e letra de no mínimo 12px. */
function useMedidas() {
  const isMobile = useIsMobile();
  return { isMobile, alvo: isMobile ? 44 : 36, pad: isMobile ? 16 : 20, fsMin: (n: number) => (isMobile ? Math.max(12, n) : n) };
}

const chaveDoRetrato = (eventoId: string | undefined) => [`/api/events/${eventoId}/tubos`];
function useRetrato(evento: Evento | null) {
  return useQuery<Retrato>({ queryKey: chaveDoRetrato(evento?.id), enabled: !!evento, staleTime: 0 });
}
function atualizarTudo(eventoId: string) {
  queryClient.invalidateQueries({ queryKey: chaveDoRetrato(eventoId) });
  queryClient.invalidateQueries({ queryKey: ["/api/tubos"] });
  queryClient.invalidateQueries({ queryKey: ["/api/items/approved"] });
  queryClient.invalidateQueries({ queryKey: ["/api/items"] });
}

/** "Solicitação sem Kit só visualiza peça do Kit" — a mesma trava do servidor:
 *  a tela não oferece o toque que voltaria 403. */
function useSoVisualizaKit() {
  const { user } = useAuth();
  return (p: { doKit?: boolean }) => user?.role === "solicitacao" && !user?.kit && !!p.doKit;
}

/** A casca dos três: superfície do modal-shell, cabeçalho, corpo que rola e
 *  rodapé fixo. No celular acompanha o teclado (o rodapé não some atrás dele). */
function Casca({ aberto, onClose, icone, tint, titulo, subtitulo, largura, rodape, children, testId, focoInicial }: {
  aberto: boolean; onClose: () => void; icone: LucideIcon; tint: string; titulo: string; subtitulo: string;
  largura: number; rodape?: React.ReactNode; children: React.ReactNode; testId: string;
  /** Onde o foco cai ao abrir (desktop). Sem ele, o Radix foca o primeiro focável. */
  focoInicial?: React.RefObject<HTMLElement | null>;
}) {
  const { isMobile, pad } = useMedidas();
  const superficieRef = useRef<HTMLDivElement>(null);
  useAcompanharAreaVisivel(superficieRef, "centro", isMobile && aberto);
  return (
    <Dialog open={aberto} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent ref={superficieRef} data-testid={testId} className={HIDE_NATIVE_CLOSE} style={modalSurface(largura)}
        onOpenAutoFocus={(e) => { if (!isMobile && focoInicial?.current) { e.preventDefault(); focoInicial.current.focus(); } }}>
        <DialogTitle className="sr-only">{titulo}</DialogTitle>
        <DialogDescription className="sr-only">{subtitulo}</DialogDescription>
        <ModalHeader icon={icone} tint={tint} title={titulo} subtitle={subtitulo} onClose={onClose} />
        <div style={{ padding: pad, overflowY: "auto", flex: "1 1 auto", minHeight: 0, display: "flex", flexDirection: "column", gap: 18 }}>
          {children}
        </div>
        {rodape}
      </DialogContent>
    </Dialog>
  );
}

/** Rodapé fixo, fora da rolagem, com o recorte seguro do home indicator — nos
 *  LONGOS, porque o jsdom descarta o atalho `padding` com env(). */
function Rodape({ testId, children }: { testId: string; children: React.ReactNode }) {
  const { pad } = useMedidas();
  return (
    <div data-testid={testId}
      style={{ flexShrink: 0, display: "flex", gap: 10, paddingTop: 10, paddingLeft: pad, paddingRight: pad, paddingBottom: "calc(10px + env(safe-area-inset-bottom))", borderTop: `1px solid ${COR.borda}`, background: "#fff", boxShadow: "0 -8px 12px -8px rgba(28,25,23,0.18)" }}>
      {children}
    </div>
  );
}
function BotaoCancelar({ onClick, texto = "Cancelar" }: { onClick: () => void; texto?: string }) {
  const { isMobile } = useMedidas();
  return (
    <button type="button" onClick={onClick}
      style={{ flex: 1, minHeight: isMobile ? 48 : 40, borderRadius: 8, border: `1px solid ${COR.borda}`, background: "#fff", color: COR.sec, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
      {texto}
    </button>
  );
}
function BotaoPrimario({ onClick, disabled, cor, children, testId }: { onClick: () => void; disabled: boolean; cor: string; children: React.ReactNode; testId: string }) {
  const { isMobile } = useMedidas();
  return (
    <button type="button" onClick={onClick} disabled={disabled} data-testid={testId}
      style={{ flex: 2, minHeight: isMobile ? 48 : 40, borderRadius: 8, border: "none", background: disabled ? "#e7e5e4" : cor, color: disabled ? COR.sec : "#fff", fontWeight: 800, fontSize: 13, cursor: disabled ? "not-allowed" : "pointer" }}>
      {children}
    </button>
  );
}

function Carregando() {
  return <p role="status" style={{ margin: 0, fontSize: 13, color: COR.fraco }}>Carregando os tubos…</p>;
}
function ErroAoCarregar({ onTentar }: { onTentar: () => void }) {
  const { alvo } = useMedidas();
  return (
    <div role="alert" style={{ padding: "12px 14px", borderRadius: 10, background: "#fef2f2", border: "1px solid #fecaca", color: COR.vermelho, fontSize: 13, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
      Não foi possível carregar os tubos.
      <button type="button" onClick={onTentar} style={{ minHeight: alvo, border: "none", borderRadius: 8, background: COR.vermelho, color: "#fff", fontWeight: 700, fontSize: 12, padding: "0 12px", cursor: "pointer" }}>Tentar novamente</button>
    </div>
  );
}
function Aviso({ children, testId, tom = "ambar" }: { children: React.ReactNode; testId?: string; tom?: "ambar" | "azul" }) {
  const c = tom === "ambar" ? { cor: COR.ambar, bg: COR.ambarBg, borda: COR.ambarBorda } : { cor: COR.azul, bg: COR.azulBg, borda: COR.azulBorda };
  return (
    <div data-testid={testId} style={{ display: "flex", gap: 8, padding: "10px 12px", borderRadius: 10, background: c.bg, border: `1px solid ${c.borda}`, color: c.cor, fontSize: 13, lineHeight: 1.4 }}>
      <AlertTriangle aria-hidden="true" style={{ width: 15, height: 15, flexShrink: 0, marginTop: 2 }} />
      <span style={{ minWidth: 0 }}>{children}</span>
    </div>
  );
}

/** Código + a linha da etiqueta ("2x1 Ministério - 16") — a língua do galpão. */
function LinhaDaPeca({ p, noVolume = false, semQuantidade = false }: { p: Peca; noVolume?: boolean; semQuantidade?: boolean }) {
  const q = noVolume ? p.quantidadeNoTubo ?? p.quantity : p.quantity;
  const parte = noVolume ? parteDoTotal(q, p.quantity) : "";
  return (
    <>
      <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 12.5, fontWeight: 700, color: COR.laranja, flexShrink: 0 }}>{p.displayId ?? "—"}</span>
      <span style={{ fontSize: 13, color: COR.texto, flex: "1 1 120px", minWidth: 0, overflowWrap: "anywhere", lineHeight: 1.3 }}>
        {linhaDaLista({ ...p, quantity: q }, { mostrarQuantidade: !semQuantidade })}{parte ? <span style={{ color: COR.sec }}> {parte}</span> : null}
      </span>
    </>
  );
}

function Miniaturas({ fotos, alt, tamanho = 56 }: { fotos: string[]; alt: string; tamanho?: number }) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {fotos.map((url, i) => (
        <a key={url} href={url} target="_blank" rel="noreferrer" aria-label={`${alt} ${i + 1} — abrir`}
          style={{ width: tamanho, height: tamanho, borderRadius: 6, overflow: "hidden", border: `1px solid ${COR.borda}`, display: "block" }}>
          <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </a>
      ))}
    </div>
  );
}

/** Câmera (direta no celular) + Galeria, com miniaturas e remover de 44px. */
function Fotos({ lista, onMudar, alt }: { lista: string[]; onMudar: (f: (atual: string[]) => string[]) => void; alt: string }) {
  const { toast } = useToast();
  const { fsMin } = useMedidas();
  return (
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
              onComplete={(r) => onMudar((f) => (f.length >= 20 ? f : [...f, convertGCSUrlToLocalPath(r.url)]))}
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
        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          {lista.map((url, i) => (
            <div key={url} style={{ position: "relative", width: 72, height: 72, borderRadius: 8, overflow: "hidden", border: `1px solid ${COR.borda}` }}>
              <img src={url} alt={`${alt} ${i + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              {/* Alvo de 44px; o X visível é o disco de 24 no canto. */}
              <button type="button" onClick={() => onMudar((f) => f.filter((x) => x !== url))} aria-label={`Remover a foto ${i + 1}`}
                style={{ position: "absolute", top: 0, right: 0, width: 44, height: 44, padding: 4, border: "none", background: "none", display: "flex", alignItems: "flex-start", justifyContent: "flex-end", cursor: "pointer" }}>
                <span style={{ width: 24, height: 24, borderRadius: "50%", background: "rgba(28,25,23,0.78)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <X aria-hidden="true" style={{ width: 12, height: 12 }} />
                </span>
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// 1 · EMBALAR — o tubo + a foto. Nada de outras peças, nada de gestão.
// ═════════════════════════════════════════════════════════════════════════════
export function EmbalarDialog({ evento, itens, comCaixas = false, onClose, onEmbalou }: {
  evento: Evento | null;
  /** As peças que estão sendo embaladas (uma, ou o lote). */
  itens: string[];
  /** Veio do painel ("Embalar peças conferidas"): aí sim as peças têm caixa de
   *  marcar. Vindo da fila, o lote só deixa TIRAR uma peça (x). */
  comCaixas?: boolean;
  onClose: () => void;
  onEmbalou?: () => void;
}) {
  const { toast } = useToast();
  const { isMobile, fsMin } = useMedidas();
  const soVisualizaKit = useSoVisualizaKit();
  const { data, isLoading, isError, refetch } = useRetrato(evento);

  const [fora, setFora] = useState<Set<string>>(new Set());
  const [tubo, setTubo] = useState<string | null>(null);
  const [quantas, setQuantas] = useState<Record<string, number>>({});
  // "Pôr num tubo que já existe": só então o tubo automático vira escolha.
  const [escolhendo, setEscolhendo] = useState(false);
  const [fotos, setFotos] = useState<string[]>([]);
  // Enter segurado / toque duplo: `isPending` só vira true no render seguinte.
  const enviandoRef = useRef(false);

  // Cada abertura começa limpa (outra peça, outro evento).
  const chave = evento ? `${evento.id}|${itens.join(",")}` : null;
  const [vista, setVista] = useState<string | null>(null);
  if (chave !== vista) { setVista(chave); setFora(new Set()); setTubo(null); setEscolhendo(false); setFotos([]); setQuantas({}); }

  // Só embala quem está conferida e SEM tubo; a que outro aparelho embalou
  // antes (ou que é do Kit, para quem só visualiza) fica de fora, com aviso.
  const candidatas = (data?.semTubo ?? []).filter((p) => itens.includes(p.id) && disponivel(p) > 0 && !soVisualizaKit(p));
  const pecas = candidatas.filter((p) => !fora.has(p.id));
  // QUANTAS de cada peça (dono, 21/09: "tem que colocar as quantidades também").
  // O padrão é tudo o que está conferido e ainda não embalado.
  const quantasDe = (p: Peca) => Math.max(1, Math.min(disponivel(p), quantas[p.id] ?? disponivel(p)));
  const unidades = pecas.reduce((t, p) => t + quantasDe(p), 0);
  const jaEmTubo = (data?.tubos ?? []).filter((t) => t.pecas.some((p) => itens.includes(p.id)));
  // Tubos DE VERDADE ainda abertos: o volume avulso (embalada sozinha) não é
  // destino de ninguém e não consome número.
  const abertos = (data?.tubos ?? []).filter((t) => !t.entregueEm && !t.avulso);
  const proximoNumero = (data?.tubos ?? []).reduce((m, t) => Math.max(m, t.numero), 0) + 1;
  // A peça INDIVIDUAL vai sozinha ("quando eu clicar nele individual, não
  // precisa ter a opção de tubo, ele vai sozinho") — e sozinha não é tubo:
  // pode ser uma placa, um pórtico, um rolo. O servidor cria um volume AVULSO.
  const sozinha = itens.length === 1 && !comCaixas;
  // O TUBO AUTOMÁTICO (dono, 21/09: "quando for assim, ele gera um tubo
  // automático, não precisa selecionar"). Tubo aberto e VAZIO (sobra de teste,
  // tubo esvaziado) é REUSADO — criar outro deixaria um órfão; senão é o
  // próximo número. Criar e colocar seguem numa chamada só (POST com itemIds +
  // fotos), então foto ou rede falhando não deixa tubo vazio para trás.
  const comPecas = abertos.filter((t) => t.pecas.length > 0);
  const vazio = sozinha ? null : abertos.find((t) => t.pecas.length === 0) ?? null;
  const automatico = vazio ? vazio.id : "novo";
  const numeroAutomatico = vazio ? vazio.numero : proximoNumero;
  // UMA peça ou o lote, a regra é uma só ("quando eu clicar nele individual,
  // não precisa ter a opção de tubo, ele vai sozinho"): o passo de tubo NUNCA
  // aparece por padrão. A única porta para a escolha é o link "Pôr num tubo
  // que já existe", para quem precisa completar um tubo.
  const mostrarEscolha = escolhendo && comPecas.length > 0;
  const escolhido = tubo ?? (data ? automatico : null);
  const tuboEscolhido = comPecas.find((t) => t.id === escolhido) ?? null;

  const embalar = useMutation({
    mutationFn: async () => {
      const ids = pecas.map((p) => p.id);
      const itensComQuantidade = pecas.map((p) => ({ id: p.id, quantidade: quantasDe(p) }));
      const r = escolhido === "novo"
        ? await apiRequest("POST", `/api/events/${evento!.id}/tubos`, { itens: itensComQuantidade, fotos, ...(sozinha ? { avulso: true } : {}) })
        : await apiRequest("PATCH", `/api/tubos/${escolhido}/itens`, { itens: itensComQuantidade, fotos });
      const t = await r.json();
      return { numero: t.numero as number, avulso: !!t.avulso, quantas: ids.length, nome: pecas[0]?.displayId ?? "Peça" };
    },
    onSuccess: ({ numero, avulso, quantas, nome }) => {
      toast({ title: avulso ? `${nome} embalada` : quantas === 1 ? `${nome} embalada no Tubo ${numero}` : `${quantas} peças embaladas no Tubo ${numero}` });
      atualizarTudo(evento!.id);
      onEmbalou?.();
      onClose();
    },
    onError: (e) => toast({ title: "Não foi possível embalar", description: mensagemDeErro(e), variant: "destructive" }),
    onSettled: () => { enviandoRef.current = false; },
  });
  const pronto = pecas.length > 0 && !!escolhido && fotos.length > 0;
  const confirmar = () => {
    if (enviandoRef.current || embalar.isPending || !pronto) return;
    enviandoRef.current = true;
    embalar.mutate();
  };

  const titulo = itens.length === 1
    ? `Embalar ${candidatas[0]?.displayId ?? "a peça"}`
    : `Embalar ${plural(pecas.length || itens.length, "peça", "peças")}`;
  const destino = escolhido === automatico ? `Tubo ${numeroAutomatico}` : tuboEscolhido ? `Tubo ${tuboEscolhido.numero}` : "";
  // O motivo de estar desabilitado mora NO botão, na ordem dos passos.
  const rotulo = embalar.isPending ? "Embalando…"
    : pecas.length === 0 ? "Nenhuma peça para embalar"
    : !escolhido ? "Escolha o tubo"
    : fotos.length === 0 ? "Tire a foto"
    : sozinha && escolhido === "novo" ? `Embalar ${pecas[0]?.displayId ?? "a peça"} · ${unidades} un. · ${plural(fotos.length, "foto", "fotos")}`
    : pecas.length > 1 ? `Embalar ${unidades} un. de ${pecas.length} peças · ${plural(fotos.length, "foto", "fotos")}`
    : `Embalar ${unidades} un. no ${destino} · ${plural(fotos.length, "foto", "fotos")}`;

  const cartao = (valor: string, principal: string, detalhe: string, testId: string) => {
    const ativo = escolhido === valor;
    return (
      <button key={valor} type="button" role="radio" aria-checked={ativo} onClick={() => setTubo(valor)} data-testid={testId}
        style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", minHeight: isMobile ? 52 : 44, padding: "8px 12px", borderRadius: 10, textAlign: "left", cursor: "pointer", border: `2px solid ${ativo ? COR.azul : COR.borda}`, background: ativo ? COR.azulBg : "#fff" }}>
        <span aria-hidden="true" style={{ width: 18, height: 18, borderRadius: "50%", flexShrink: 0, border: `2px solid ${ativo ? COR.azul : "#a8a29e"}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {ativo && <span style={{ width: 8, height: 8, borderRadius: "50%", background: COR.azul }} />}
        </span>
        <span style={{ minWidth: 0, display: "flex", flexDirection: "column" }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: COR.texto }}>{principal}</span>
          <span style={{ fontSize: fsMin(12), color: COR.sec }}>{detalhe}</span>
        </span>
      </button>
    );
  };

  return (
    <Casca aberto={!!evento} onClose={onClose} icone={Package} tint={COR.azul} largura={520} testId="modal-embalar"
      titulo={titulo} subtitulo="Tire a foto — a peça fica Embalada até ser entregue"
      rodape={data ? (
        <Rodape testId="rodape-embalar">
          <BotaoCancelar onClick={onClose} />
          <BotaoPrimario onClick={confirmar} disabled={embalar.isPending || !pronto} cor={COR.azul} testId="confirmar-embalar">{rotulo}</BotaoPrimario>
        </Rodape>
      ) : undefined}>
      {isLoading && <Carregando />}
      {isError && <ErroAoCarregar onTentar={() => refetch()} />}
      {data && jaEmTubo.length > 0 && (
        <Aviso tom="azul" testId="embalar-ja-no-tubo">
          {candidatas.length === 0 && itens.length === 1 ? "Esta peça já está" : "Parte das peças já está"} no {jaEmTubo.map((t) => `Tubo ${t.numero}`).join(", ")} — outra pessoa embalou antes.
        </Aviso>
      )}
      {data && candidatas.length === 0 && jaEmTubo.length === 0 && (
        <Aviso testId="embalar-sem-pecas">Não há peça conferida e sem tubo para embalar aqui. Só a peça já conferida é embalada.</Aviso>
      )}

      {data && candidatas.length > 0 && (
        <>
          <section data-testid="embalar-pecas" aria-label="Peças que serão embaladas" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={ROTULO}>{comCaixas ? `Conferidas a embalar · ${pecas.length} de ${candidatas.length} marcadas` : `${plural(pecas.length, "peça", "peças")} · ${unidades} un.`}</span>
            <div style={{ border: `1px solid ${COR.borda}`, borderRadius: 10, overflow: "hidden" }}>
              {(comCaixas ? candidatas : pecas).map((p) => (
                comCaixas ? (
                  <label key={p.id} data-testid={`embalar-peca-${p.id}`} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", minHeight: 44, padding: "6px 12px", borderTop: "1px solid #f5f5f4", cursor: "pointer", background: fora.has(p.id) ? "#fff" : COR.azulBg }}>
                    <input type="checkbox" checked={!fora.has(p.id)}
                      onChange={() => setFora((s) => { const n = new Set(s); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })}
                      style={{ width: 18, height: 18, accentColor: COR.azul, flexShrink: 0 }} />
                    <LinhaDaPeca p={p} semQuantidade />
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                      <input aria-label={`Quantas unidades de ${p.displayId ?? "peça"} embalar`} type="number" inputMode="numeric" pattern="[0-9]*" min={1} max={disponivel(p)} value={quantasDe(p)}
                        data-testid={`quantas-${p.id}`} disabled={disponivel(p) <= 1}
                        onChange={(e) => setQuantas((q) => ({ ...q, [p.id]: Math.max(1, Math.min(disponivel(p), parseInt(e.target.value, 10) || 1)) }))}
                        style={{ width: 64, height: isMobile ? 44 : 36, boxSizing: "border-box", textAlign: "center", borderRadius: 8, border: `1px solid ${COR.borda}`, background: "#fff", color: COR.texto, fontSize: isMobile ? 16 : 14, fontWeight: 700 }} />
                      {quantasDe(p) < disponivel(p) && (
                        <button type="button" onClick={() => setQuantas((q) => ({ ...q, [p.id]: disponivel(p) }))} data-testid={`quantas-tudo-${p.id}`}
                          style={{ minHeight: isMobile ? 44 : 32, padding: "0 10px", borderRadius: 8, border: `1px solid ${COR.borda}`, background: "#fff", color: COR.azul, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
                          Tudo ({disponivel(p)})
                        </button>
                      )}
                    </span>
                    <span data-testid={`apoio-${p.id}`} style={{ flexBasis: "100%", fontSize: fsMin(12), color: COR.sec }}>
                      {p.conferredQty} {p.conferredQty === 1 ? "conferida" : "conferidas"} de {p.quantity} · {p.embaladaQty ?? 0} {(p.embaladaQty ?? 0) === 1 ? "embalada" : "embaladas"}
                    </span>
                  </label>
                ) : (
                  <div key={p.id} data-testid={`embalar-peca-${p.id}`} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", minHeight: 44, padding: "6px 12px", borderTop: "1px solid #f5f5f4" }}>
                    <LinhaDaPeca p={p} semQuantidade />
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                      <input aria-label={`Quantas unidades de ${p.displayId ?? "peça"} embalar`} type="number" inputMode="numeric" pattern="[0-9]*" min={1} max={disponivel(p)} value={quantasDe(p)}
                        data-testid={`quantas-${p.id}`} disabled={disponivel(p) <= 1}
                        onChange={(e) => setQuantas((q) => ({ ...q, [p.id]: Math.max(1, Math.min(disponivel(p), parseInt(e.target.value, 10) || 1)) }))}
                        style={{ width: 64, height: isMobile ? 44 : 36, boxSizing: "border-box", textAlign: "center", borderRadius: 8, border: `1px solid ${COR.borda}`, background: "#fff", color: COR.texto, fontSize: isMobile ? 16 : 14, fontWeight: 700 }} />
                      {quantasDe(p) < disponivel(p) && (
                        <button type="button" onClick={() => setQuantas((q) => ({ ...q, [p.id]: disponivel(p) }))} data-testid={`quantas-tudo-${p.id}`}
                          style={{ minHeight: isMobile ? 44 : 32, padding: "0 10px", borderRadius: 8, border: `1px solid ${COR.borda}`, background: "#fff", color: COR.azul, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
                          Tudo ({disponivel(p)})
                        </button>
                      )}
                    </span>
                    {pecas.length > 1 && (
                      <button type="button" onClick={() => setFora((s) => new Set(s).add(p.id))} aria-label={`Tirar ${p.displayId ?? "a peça"} deste embalar`} title="Tirar deste embalar"
                        style={{ width: 44, height: 44, marginRight: -8, border: "none", background: "none", color: COR.sec, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
                        <X aria-hidden="true" style={{ width: 15, height: 15 }} />
                      </button>
                    )}
                    <span data-testid={`apoio-${p.id}`} style={{ flexBasis: "100%", fontSize: fsMin(12), color: COR.sec }}>
                      {p.conferredQty} {p.conferredQty === 1 ? "conferida" : "conferidas"} de {p.quantity} · {p.embaladaQty ?? 0} {(p.embaladaQty ?? 0) === 1 ? "embalada" : "embaladas"}
                    </span>
                  </div>
                )
              ))}
            </div>
          </section>

          <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {mostrarEscolha ? (
              <>
                <span id="rotulo-tubo-do-embalar" style={ROTULO}>1 · Tubo</span>
                <div role="radiogroup" aria-labelledby="rotulo-tubo-do-embalar" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {comPecas.map((t) => cartao(t.id, `Tubo ${t.numero}`, `${plural(t.pecas.length, "peça", "peças")} · ${t.fotosFechamento.length ? plural(t.fotosFechamento.length, "foto", "fotos") : "sem foto"}`, `embalar-no-tubo-${t.numero}`))}
                  {cartao(automatico, sozinha ? "Sozinha" : `Novo tubo (Tubo ${numeroAutomatico})`, sozinha ? "Embalagem própria, sem número de tubo" : vazio ? "Usa o tubo vazio que já está aberto" : "Abre um tubo para estas peças", "embalar-em-tubo-novo")}
                </div>
              </>
            ) : (
              <>
                <p data-testid="embalar-tubo-automatico" style={{ margin: 0, fontSize: 13, color: COR.sec }}>
                  {sozinha
                    ? <>Vai <strong style={{ color: COR.texto }}>sozinha</strong> — embalagem própria, sem número de tubo.</>
                    : <>Vai para o <strong style={{ color: COR.texto }}>Tubo {numeroAutomatico}</strong> ({vazio ? "vazio, já aberto" : "novo"}).</>}
                </p>
                {comPecas.length > 0 && (
                  <button type="button" onClick={() => setEscolhendo(true)} data-testid="embalar-escolher-tubo"
                    style={{ alignSelf: "flex-start", minHeight: isMobile ? 44 : 32, padding: 0, border: "none", background: "none", color: COR.azul, fontSize: 13, fontWeight: 700, textDecoration: "underline", cursor: "pointer" }}>
                    Pôr num tubo que já existe
                  </button>
                )}
              </>
            )}
            {tuboEscolhido && tuboEscolhido.pecas.length > 0 && (
              <div data-testid="embalar-conteudo-do-tubo" style={{ padding: "8px 12px", borderRadius: 10, background: COR.fundo, border: `1px solid ${COR.borda}` }}>
                <span style={{ fontSize: fsMin(12), fontWeight: 700, color: COR.sec }}>Já está no Tubo {tuboEscolhido.numero}:</span>
                <ul style={{ margin: "4px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 3 }}>
                  {tuboEscolhido.pecas.slice(0, 6).map((p) => <li key={p.id} style={{ display: "flex", gap: 8 }}><LinhaDaPeca p={p} noVolume /></li>)}
                  {tuboEscolhido.pecas.length > 6 && <li style={{ fontSize: fsMin(12), color: COR.sec }}>e mais {tuboEscolhido.pecas.length - 6}</li>}
                </ul>
              </div>
            )}
          </section>

          <section>
            <span style={ROTULO}>{mostrarEscolha ? "2 · " : ""}{sozinha && escolhido === "novo" ? "Foto da peça embalada" : "Foto do tubo com os itens"} <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>· obrigatória</span></span>
            <Fotos lista={fotos} onMudar={setFotos} alt="Foto do tubo com os itens" />
          </section>
        </>
      )}
    </Casca>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// 2 · ENTREGAR TUBO N — o que tem dentro, as fotos, quem recebeu.
// ═════════════════════════════════════════════════════════════════════════════
export function EntregarTuboDialog({ evento, tuboId, sugestaoRecebedor = "", onClose, onEntregou }: {
  evento: Evento | null;
  tuboId: string | null;
  /** Quem recebeu a última entrega desta sessão — oferecido em um toque. */
  sugestaoRecebedor?: string;
  onClose: () => void;
  onEntregou?: (recebedor: string) => void;
}) {
  const { toast } = useToast();
  const { isMobile } = useMedidas();
  const soVisualizaKit = useSoVisualizaKit();
  const aberto = !!evento && !!tuboId;
  const { data, isLoading, isError, refetch } = useRetrato(aberto ? evento : null);

  const [recebidoPor, setRecebidoPor] = useState("");
  const [obs, setObs] = useState("");
  const [fotos, setFotos] = useState<string[]>([]);
  const enviandoRef = useRef(false);
  const campoRef = useRef<HTMLInputElement>(null);
  const chave = aberto ? `${evento!.id}|${tuboId}` : null;
  const [vista, setVista] = useState<string | null>(null);
  if (chave !== vista) { setVista(chave); setRecebidoPor(""); setObs(""); setFotos([]); }

  const t = (data?.tubos ?? []).find((x) => x.id === tuboId) ?? null;
  const soVe = !!t && t.pecas.some(soVisualizaKit);
  const temFotoDoTubo = (t?.fotosFechamento.length ?? 0) > 0;
  const avulso = !!t?.avulso;
  // "Entregar #0386 — Placa de octanorme" × "Entregar Tubo 1 · teste 3".
  const oQue = avulso ? (t?.pecas[0]?.displayId ?? "a peça") : `Tubo ${t?.numero ?? ""}`;
  const podeFormulario = !!t && !t.entregueEm && t.prontoParaEntregar && !soVe;
  // Foco inicial no que falta preencher — só no desktop: no celular abrir o
  // teclado de cara esconderia a lista do que está no tubo.
  useEffect(() => { if (podeFormulario && !isMobile) campoRef.current?.focus(); }, [podeFormulario, isMobile, chave]);

  const entregar = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", `/api/tubos/${t!.id}/entregar`, { photoUrl: fotos[0] ?? null, receivedBy: recebidoPor.trim(), notes: obs });
      return r.json();
    },
    onSuccess: (r: any) => {
      toast({ title: `${r.avulso ? oQue : `Tubo ${r.numero}`} entregue a ${recebidoPor.trim()}`, description: r.avulso ? undefined : plural(r.entregues, "peça entregue", "peças entregues") + "." });
      atualizarTudo(evento!.id);
      onEntregou?.(recebidoPor.trim());
      onClose();
    },
    onError: (e) => toast({ title: "Não foi possível entregar o tubo", description: mensagemDeErro(e), variant: "destructive" }),
    onSettled: () => { enviandoRef.current = false; },
  });
  // Só quem recebeu é obrigatório (dono, 21/09: "a foto de entrega não é
  // obrigatória, pois já tiraram a da conferência e a do tubo ou da peça").
  const pronto = podeFormulario && !!recebidoPor.trim();
  const confirmar = () => {
    if (enviandoRef.current || entregar.isPending || !pronto) return;
    enviandoRef.current = true;
    entregar.mutate();
  };
  const n = t?.numero ?? "";
  const rotulo = entregar.isPending ? "Entregando…"
    : !recebidoPor.trim() ? "Informe quem recebeu"
    : `Entregar ${oQue} a ${recebidoPor.trim()}`;
  const campo: React.CSSProperties = { width: "100%", boxSizing: "border-box", height: isMobile ? 44 : 40, borderRadius: 8, border: `1px solid ${COR.borda}`, padding: "0 12px", fontSize: isMobile ? 16 : 14, background: "#fff", color: COR.texto };

  return (
    <Casca aberto={aberto} onClose={onClose} icone={Truck} tint={COR.verde} largura={520} testId="modal-entregar-tubo" focoInicial={campoRef}
      titulo={avulso ? `Entregar ${oQue} — ${t?.pecas[0] ? linhaDaLista(t.pecas[0], { mostrarQuantidade: false }) : ""}` : `Entregar Tubo ${n}${evento ? ` · ${evento.name}` : ""}`}
      subtitulo={avulso ? "Confira a peça e registre quem recebeu" : "O tubo sai inteiro: confira o que tem dentro e registre quem recebeu"}
      rodape={podeFormulario ? (
        <Rodape testId={`rodape-entregar-tubo-${n}`}>
          <BotaoCancelar onClick={onClose} />
          <BotaoPrimario onClick={confirmar} disabled={entregar.isPending || !pronto} cor={COR.verde} testId={`confirmar-entrega-tubo-${n}`}>{rotulo}</BotaoPrimario>
        </Rodape>
      ) : data ? (
        <Rodape testId="rodape-entregar-fechar"><BotaoCancelar onClick={onClose} texto="Fechar" /></Rodape>
      ) : undefined}>
      {isLoading && <Carregando />}
      {isError && <ErroAoCarregar onTentar={() => refetch()} />}
      {data && !t && <Aviso testId="entregar-tubo-sumiu">Este tubo não existe mais — alguém apagou. Feche e abra os tubos do evento.</Aviso>}

      {t && (
        <>
          {t.entregueEm && (
            <Aviso tom="azul" testId="entregar-ja-entregue">{avulso ? "Esta peça" : `O Tubo ${t.numero}`} já foi entregue{t.recebidoPor ? ` a ${t.recebidoPor}` : ""} em {quandoFoi(t.entregueEm)}.</Aviso>
          )}
          {!t.entregueEm && soVe && (
            <Aviso testId="entregar-so-visualiza">Este tubo tem peça do Kit: a Solicitação da Arena só visualiza. Quem entrega é o usuário do Kit.</Aviso>
          )}
          {!t.entregueEm && !soVe && t.pecas.length === 0 && <Aviso testId="entregar-vazio">O Tubo {t.numero} está vazio — não há o que entregar.</Aviso>}
          {!t.entregueEm && !soVe && t.faltamConferir.length > 0 && (
            <Aviso testId="entregar-falta-conferir">
              O tubo só sai inteiro, e ainda falta conferir <strong>{t.faltamConferir.join(", ")}</strong>. Confira {t.faltamConferir.length === 1 ? "essa peça" : "essas peças"} (ou tire do tubo) e volte aqui.
            </Aviso>
          )}
          {!t.entregueEm && !soVe && t.pecas.length > 0 && t.faltamConferir.length === 0 && !t.prontoParaEntregar && (
            <Aviso testId="entregar-fora-do-alcance">Este tubo tem peças que você não vê — quem entrega é quem enxerga o tubo inteiro.</Aviso>
          )}

          <section data-testid={`lista-entrega-tubo-${t.numero}`} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={ROTULO}>{avulso ? "A peça" : `No tubo · ${plural(t.pecas.length, "peça", "peças")}`}</span>
            <ul style={{ margin: 0, padding: 0, listStyle: "none", border: `1px solid ${COR.borda}`, borderRadius: 10, overflow: "hidden" }}>
              {t.pecas.map((p) => (
                <li key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderTop: "1px solid #f5f5f4", flexWrap: "wrap" }}>
                  <LinhaDaPeca p={p} noVolume />
                  {!p.conferida && <span style={{ fontSize: 12, fontWeight: 700, color: COR.ambar }}>falta conferir</span>}
                  {p.conferencePhotoUrl && (
                    <a href={p.conferencePhotoUrl} target="_blank" rel="noreferrer" data-testid={`foto-conferencia-${p.id}`}
                      style={{ display: "inline-flex", alignItems: "center", minHeight: isMobile ? 44 : 24, fontSize: 12.5, fontWeight: 700, color: COR.azul }}>
                      ver foto da conferência
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </section>

          {!temFotoDoTubo && (
            <p data-testid="entregar-sem-foto-da-embalagem" style={{ margin: 0, fontSize: 12.5, color: COR.sec }}>Sem foto da embalagem — as fotos da conferência valem.</p>
          )}
          {temFotoDoTubo && (
            <section data-testid={`fotos-entrega-tubo-${t.numero}`} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={ROTULO}>{avulso ? "Fotos da embalagem" : "Fotos do tubo"} · {t.fotosFechamento.length}</span>
              <Miniaturas fotos={t.fotosFechamento} alt={`Foto do Tubo ${t.numero}`} />
              {t.alteradoDepoisDaFoto && <span style={{ fontSize: 12, fontWeight: 700, color: COR.ambar }}>O conteúdo mudou depois da última foto.</span>}
            </section>
          )}

          {podeFormulario && (
            <>
              <section>
                <label htmlFor="campo-quem-recebeu" style={ROTULO}>Quem recebeu <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>· obrigatório</span></label>
                <input id="campo-quem-recebeu" ref={campoRef} value={recebidoPor} onChange={(e) => setRecebidoPor(e.target.value)} placeholder="Nome de quem recebeu" autoComplete="off"
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.repeat) confirmar(); }}
                  data-testid={`recebedor-tubo-${t.numero}`} style={{ ...campo, marginTop: 6 }} />
                <SugestaoRecebedor nome={sugestaoRecebedor} atual={recebidoPor} onUsar={setRecebidoPor} />
              </section>
              <section>
                <span style={ROTULO}>Foto do comprovante <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>· opcional</span></span>
                <Fotos lista={fotos} onMudar={setFotos} alt="Foto do comprovante" />
              </section>
              <section>
                <label htmlFor="campo-obs-entrega" style={ROTULO}>Observação <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>· opcional</span></label>
                <input id="campo-obs-entrega" value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: entregue na portaria" style={{ ...campo, marginTop: 6 }} />
              </section>
            </>
          )}
        </>
      )}
    </Casca>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// 3 · TUBOS DO EVENTO — gestão. As portas para embalar e entregar; nunca o
//     formulário deles embutido.
// ═════════════════════════════════════════════════════════════════════════════
export function PainelDeTubos({ evento, onClose, onEmbalar, onEntregar }: {
  evento: Evento | null;
  onClose: () => void;
  /** Abre o modal Embalar com as conferidas sem tubo do evento. */
  onEmbalar: (ids: string[]) => void;
  /** Abre o modal Entregar daquele tubo. */
  onEntregar: (tuboId: string) => void;
}) {
  const { toast } = useToast();
  const { isMobile, alvo, fsMin } = useMedidas();
  const soVisualizaKit = useSoVisualizaKit();
  const { data, isLoading, isError, refetch } = useRetrato(evento);

  const [adicionandoFotos, setAdicionandoFotos] = useState<string | null>(null);
  const [fotosNovas, setFotosNovas] = useState<string[]>([]);
  // Apagar é a única ação que destrói: pede o segundo toque.
  const [confirmandoApagar, setConfirmandoApagar] = useState<string | null>(null);
  const [verEntregues, setVerEntregues] = useState(false);
  const [verSozinhas, setVerSozinhas] = useState(false);
  const [vista, setVista] = useState<string | null>(null);
  if ((evento?.id ?? null) !== vista) { setVista(evento?.id ?? null); setAdicionandoFotos(null); setFotosNovas([]); setConfirmandoApagar(null); setVerEntregues(false); }

  const falhou = (titulo: string) => (e: any) => toast({ title: titulo, description: mensagemDeErro(e), variant: "destructive" });
  const tirar = useMutation({
    mutationFn: async ({ tubo, peca }: { tubo: Tubo; peca: Peca }) => apiRequest("PATCH", `/api/tubos/${tubo.id}/itens`, { remover: [peca.id] }),
    onSuccess: (_r, { tubo, peca }) => { toast({ title: tubo.avulso ? `Embalagem de ${peca.displayId ?? "peça"} desfeita` : `${peca.displayId ?? "Peça"} saiu do Tubo ${tubo.numero}`, description: "Voltou para Conferido." }); atualizarTudo(evento!.id); },
    onError: falhou("Não foi possível tirar do tubo"),
  });
  const apagar = useMutation({
    mutationFn: async (tubo: Tubo) => (await apiRequest("DELETE", `/api/tubos/${tubo.id}`)).json(),
    onSuccess: (r: any, tubo) => {
      toast({ title: `Tubo ${tubo.numero} apagado`, description: r?.devolvidas > 0 ? `${plural(r.devolvidas, "peça voltou", "peças voltaram")} para Conferido.` : undefined });
      setConfirmandoApagar(null);
      atualizarTudo(evento!.id);
    },
    onError: falhou("Não foi possível apagar o tubo"),
  });
  const guardarFotos = useMutation({
    mutationFn: async (tubo: Tubo) => (await apiRequest("POST", `/api/tubos/${tubo.id}/fechar`, { fotos: fotosNovas })).json(),
    onSuccess: (r: any) => {
      toast({ title: `Fotos guardadas no Tubo ${r.numero}`, description: `${plural(r.fotos, "foto nova", "fotos novas")} · ${r.totalDeFotos ?? r.fotos} no tubo.` });
      setAdicionandoFotos(null); setFotosNovas([]);
      atualizarTudo(evento!.id);
    },
    onError: falhou("Não foi possível guardar as fotos do tubo"),
  });

  const abertos = (data?.tubos ?? []).filter((t) => !t.entregueEm && !t.avulso);
  const entregues = (data?.tubos ?? []).filter((t) => !!t.entregueEm && !t.avulso);
  // Embaladas SOZINHAS ainda por entregar: seção própria, recolhida, sem
  // etiqueta de tubo (a etiqueta delas é a individual do evento).
  const sozinhas = (data?.tubos ?? []).filter((t) => t.avulso && !t.entregueEm && t.pecas.length > 0);
  const paraEmbalar = (data?.semTubo ?? []).filter((p) => disponivel(p) > 0 && !soVisualizaKit(p));
  const tuboDasFotos = abertos.find((t) => t.id === adicionandoFotos) ?? null;

  const acao = (cor: string, solido = false): React.CSSProperties => ({
    display: "inline-flex", alignItems: "center", gap: 6, minHeight: alvo, padding: "0 12px", borderRadius: 8, fontSize: fsMin(12.5), fontWeight: 700, cursor: "pointer", textDecoration: "none",
    border: solido ? "none" : `1px solid ${COR.borda}`, background: solido ? cor : "#fff", color: solido ? "#fff" : cor,
  });

  const cartaoDoTubo = (t: Tubo) => {
    const entregue = !!t.entregueEm;
    const vazio = t.pecas.length === 0;
    const soVe = t.pecas.some(soVisualizaKit);
    const status = entregue ? { texto: `Entregue ${quandoFoi(t.entregueEm)}`, cor: COR.verde, bg: COR.verdeBg, borda: COR.verdeBorda }
      : vazio ? { texto: "Vazio", cor: COR.sec, bg: COR.fundo, borda: COR.borda }
      : t.faltamConferir.length ? { texto: `Falta conferir ${t.faltamConferir.length}`, cor: COR.ambar, bg: COR.ambarBg, borda: COR.ambarBorda }
      : { texto: "Pronto para entregar", cor: COR.azul, bg: COR.azulBg, borda: COR.azulBorda };
    return (
      <article key={t.id} data-testid={`tubo-${t.numero}`} aria-label={`Tubo ${t.numero}`} style={{ border: `1px solid ${COR.borda}`, borderRadius: 12, overflow: "hidden", background: "#fff" }}>
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "10px 12px", background: COR.fundo, borderBottom: `1px solid ${COR.borda}`, flexWrap: "wrap" }}>
          <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 16, fontWeight: 800, color: COR.texto }}>
            Tubo {t.numero} <span style={{ fontSize: 12, fontWeight: 600, color: COR.sec }}>· {plural(t.pecas.length, "peça", "peças")} · {t.pecas.reduce((u, x) => u + (x.quantidadeNoTubo ?? x.quantity), 0)} un. · {t.fotosFechamento.length ? plural(t.fotosFechamento.length, "foto", "fotos") : "sem foto"}</span>
          </span>
          <span style={{ fontSize: fsMin(11), fontWeight: 800, color: status.cor, background: status.bg, border: `1px solid ${status.borda}`, borderRadius: 999, padding: "2px 9px" }}>{status.texto}</span>
        </header>

        {t.pecas.map((p) => (
          <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 12px", borderTop: "1px solid #f5f5f4", flexWrap: "wrap" }}>
            <LinhaDaPeca p={p} noVolume />
            {!entregue && !p.conferida && <span style={{ fontSize: fsMin(11), fontWeight: 700, color: COR.ambar }}>falta conferir</span>}
            {!entregue && !soVisualizaKit(p) && (
              <button type="button" onClick={() => tirar.mutate({ tubo: t, peca: p })} disabled={tirar.isPending}
                data-testid={`tirar-peca-${p.id}`} aria-label={`Tirar ${p.displayId ?? "a peça"} do Tubo ${t.numero}`}
                style={{ ...acao(COR.sec), padding: "0 10px" }}>
                Tirar
              </button>
            )}
          </div>
        ))}

        {t.fotosFechamento.length > 0 && (
          <div data-testid={`fotos-tubo-${t.numero}`} style={{ padding: "8px 12px", borderTop: "1px solid #f5f5f4", display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, color: COR.sec }}>
              Última foto {quandoFoi(t.fechadoEm)}{t.fechadoPor ? ` por ${t.fechadoPor}` : ""}
              {t.alteradoDepoisDaFoto && !entregue && <strong data-testid={`aviso-alterado-tubo-${t.numero}`} style={{ color: COR.ambar }}> · o conteúdo mudou depois da foto</strong>}
            </span>
            <Miniaturas fotos={t.fotosFechamento} alt={`Foto do Tubo ${t.numero}`} tamanho={48} />
          </div>
        )}
        {entregue && (
          <div style={{ padding: "8px 12px", borderTop: "1px solid #f5f5f4", fontSize: 12, color: COR.sec, display: "flex", alignItems: "center", gap: 6 }}>
            <CheckCircle2 aria-hidden="true" style={{ width: 13, height: 13, color: COR.verde }} />
            {t.recebidoPor ? `Recebido por ${t.recebidoPor}` : "Recebedor não informado"}{t.entreguePor ? ` · registrado por ${t.entreguePor}` : ""}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", padding: "10px 12px", borderTop: `1px solid ${COR.borda}` }}>
          {!entregue && !vazio && !soVe && (
            <button type="button" onClick={() => onEntregar(t.id)} data-testid={`entregar-tubo-${t.numero}`}
              title={t.prontoParaEntregar ? "Abre a entrega deste tubo" : `Falta conferir: ${t.faltamConferir.join(", ")}`}
              style={acao(COR.verde, t.prontoParaEntregar)}>
              <Truck aria-hidden="true" style={{ width: 13, height: 13 }} /> Entregar
            </button>
          )}
          {!entregue && !vazio && !soVe && (
            <button type="button" onClick={() => { setAdicionandoFotos(t.id); setFotosNovas([]); }} data-testid={`fechar-tubo-${t.numero}`} style={acao(COR.azul)}>
              <Camera aria-hidden="true" style={{ width: 13, height: 13 }} /> Adicionar fotos
            </button>
          )}
          {!vazio && (
            <Link href={`/grafica/tubos/${t.id}/etiqueta`} data-testid={`etiqueta-tubo-${t.numero}`} style={acao(COR.texto)}>
              <Tag aria-hidden="true" style={{ width: 13, height: 13 }} /> Etiqueta
            </Link>
          )}
          {!entregue && !soVe && (
            confirmandoApagar === t.id ? (
              <>
                <button type="button" onClick={() => apagar.mutate(t)} disabled={apagar.isPending} data-testid={`confirmar-apagar-tubo-${t.numero}`} style={acao(COR.vermelho, true)}>
                  <Trash2 aria-hidden="true" style={{ width: 13, height: 13 }} /> {vazio ? "Apagar mesmo" : `Apagar e devolver ${t.pecas.length} a Conferido`}
                </button>
                <button type="button" onClick={() => setConfirmandoApagar(null)} style={acao(COR.sec)}>Não</button>
              </>
            ) : (
              <button type="button" onClick={() => setConfirmandoApagar(t.id)} data-testid={`apagar-tubo-${t.numero}`}
                title={vazio ? "Apaga o tubo vazio" : "Apaga o tubo; as peças voltam a Conferido"} style={acao(COR.vermelho)}>
                <Trash2 aria-hidden="true" style={{ width: 13, height: 13 }} /> Apagar tubo
              </button>
            )
          )}
          {soVe && !entregue && <span style={{ fontSize: fsMin(12), color: COR.ambar }}>Tem peça do Kit: aqui você só visualiza.</span>}
        </div>

        {adicionandoFotos === t.id && (
          <div data-testid={`form-fechar-tubo-${t.numero}`} style={{ padding: 12, borderTop: `1px solid ${COR.borda}`, background: COR.azulBg }}>
            <span style={{ fontSize: 13, color: COR.texto }}>Mais fotos do <strong>Tubo {t.numero}</strong> com os itens — somam às que ele já tem.</span>
            <Fotos lista={fotosNovas} onMudar={setFotosNovas} alt={`Foto do Tubo ${t.numero}`} />
          </div>
        )}
      </article>
    );
  };

  return (
    <Casca aberto={!!evento} onClose={onClose} icone={Package} tint={COR.laranja} largura={660} testId="painel-de-tubos"
      titulo={`Tubos · ${evento?.name ?? ""}`} subtitulo="O que está em cada tubo, as fotos, a etiqueta e a entrega"
      rodape={tuboDasFotos ? (
        <Rodape testId={`rodape-fechar-tubo-${tuboDasFotos.numero}`}>
          <BotaoCancelar onClick={() => { setAdicionandoFotos(null); setFotosNovas([]); }} />
          <BotaoPrimario onClick={() => guardarFotos.mutate(tuboDasFotos)} disabled={guardarFotos.isPending || fotosNovas.length === 0} cor={COR.azul} testId={`confirmar-fechar-tubo-${tuboDasFotos.numero}`}>
            {guardarFotos.isPending ? "Salvando…" : fotosNovas.length ? `Guardar no Tubo ${tuboDasFotos.numero} · ${plural(fotosNovas.length, "foto", "fotos")}` : "Tire a foto para guardar"}
          </BotaoPrimario>
        </Rodape>
      ) : undefined}>
      {isLoading && <Carregando />}
      {isError && <ErroAoCarregar onTentar={() => refetch()} />}

      {data && (
        <>
          {/* A porta para o modal Embalar — só aparece quando há o que embalar. */}
          {paraEmbalar.length > 0 && (
            <button type="button" onClick={() => onEmbalar(paraEmbalar.map((p) => p.id))} data-testid="painel-embalar-conferidas"
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, minHeight: isMobile ? 48 : 44, borderRadius: 10, border: "none", background: COR.azul, color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer" }}>
              <Package aria-hidden="true" style={{ width: 15, height: 15 }} /> Embalar peças conferidas ({paraEmbalar.length})
            </button>
          )}
          <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <span style={ROTULO}>Tubos abertos · {abertos.length}</span>
            {abertos.length === 0 && (
              <p data-testid="painel-sem-tubos" style={{ margin: 0, fontSize: 13, color: COR.sec }}>
                {paraEmbalar.length > 0 ? "Nenhum tubo aberto. Embale as peças conferidas para abrir o primeiro." : "Nenhum tubo aberto neste evento."}
              </p>
            )}
            {abertos.map(cartaoDoTubo)}
          </section>

          {sozinhas.length > 0 && (
            <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button type="button" onClick={() => setVerSozinhas((v) => !v)} aria-expanded={verSozinhas} data-testid="painel-ver-sozinhas"
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: alvo, padding: "0 12px", borderRadius: 8, border: `1px solid ${COR.borda}`, background: COR.fundo, color: COR.texto, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                Embaladas sozinhas ({sozinhas.length})
                <ChevronDown aria-hidden="true" style={{ width: 15, height: 15, transform: verSozinhas ? "rotate(180deg)" : undefined }} />
              </button>
              {verSozinhas && sozinhas.map((t) => {
                const peca = t.pecas[0];
                const soVe = t.pecas.some(soVisualizaKit);
                return (
                  <div key={t.id} data-testid={`sozinha-${peca.id}`} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "8px 12px", border: `1px solid ${COR.borda}`, borderRadius: 10, background: "#fff" }}>
                    <LinhaDaPeca p={peca} noVolume />
                    {!soVe && (
                      <>
                        <button type="button" onClick={() => onEntregar(t.id)} data-testid={`entregar-sozinha-${peca.id}`} style={acao(COR.verde, t.prontoParaEntregar)}>
                          <Truck aria-hidden="true" style={{ width: 13, height: 13 }} /> Entregar
                        </button>
                        <button type="button" onClick={() => tirar.mutate({ tubo: t, peca })} disabled={tirar.isPending} data-testid={`desfazer-embalagem-${peca.id}`} style={acao(COR.sec)}>
                          Desfazer embalagem
                        </button>
                      </>
                    )}
                  </div>
                );
              })}
            </section>
          )}

          {entregues.length > 0 && (
            <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button type="button" onClick={() => setVerEntregues((v) => !v)} aria-expanded={verEntregues} data-testid="painel-ver-entregues"
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: alvo, padding: "0 12px", borderRadius: 8, border: `1px solid ${COR.borda}`, background: COR.fundo, color: COR.texto, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                Tubos entregues · {entregues.length}
                <ChevronDown aria-hidden="true" style={{ width: 15, height: 15, transform: verEntregues ? "rotate(180deg)" : undefined }} />
              </button>
              {verEntregues && entregues.map(cartaoDoTubo)}
            </section>
          )}
        </>
      )}
    </Casca>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// O ponto de entrada da Gráfica: UM modal por vez, escolhido pela porta.
// ═════════════════════════════════════════════════════════════════════════════
export function TubosDialog({ evento, onClose, itensIniciais, tuboInicial, onEmbalou, sugestaoRecebedor, onEntregou }: {
  evento: Evento | null;
  onClose: () => void;
  /** Chegou pelo "Embalar" da peça (ou do lote): abre direto o modal Embalar. */
  itensIniciais?: string[];
  /** Chegou pelo "Entregar tubo" da embalada: abre direto o modal Entregar. */
  tuboInicial?: string;
  onEmbalou?: () => void;
  sugestaoRecebedor?: string;
  onEntregou?: (recebedor: string) => void;
}) {
  // A partir do painel: o modal que ele abriu. Fechar volta ao painel.
  const [doPainel, setDoPainel] = useState<{ embalar: string[] } | { entregar: string } | null>(null);
  const [vista, setVista] = useState<string | null>(null);
  if ((evento?.id ?? null) !== vista) { setVista(evento?.id ?? null); setDoPainel(null); }

  const direto = itensIniciais?.length ? "embalar" : tuboInicial ? "entregar" : null;
  const embalando = direto === "embalar" ? itensIniciais! : doPainel && "embalar" in doPainel ? doPainel.embalar : null;
  const entregando = direto === "entregar" ? tuboInicial! : doPainel && "entregar" in doPainel ? doPainel.entregar : null;
  const voltar = () => (direto ? onClose() : setDoPainel(null));

  return (
    <>
      <PainelDeTubos evento={evento && !embalando && !entregando ? evento : null} onClose={onClose}
        onEmbalar={(ids) => setDoPainel({ embalar: ids })} onEntregar={(id) => setDoPainel({ entregar: id })} />
      <EmbalarDialog evento={embalando ? evento : null} itens={embalando ?? []} comCaixas={!direto} onClose={voltar} onEmbalou={onEmbalou} />
      <EntregarTuboDialog evento={entregando ? evento : null} tuboId={entregando} sugestaoRecebedor={sugestaoRecebedor} onClose={voltar} onEntregou={onEntregou} />
    </>
  );
}
