// CONFERÊNCIA DE ARQUIVOS (Pedro/dono, 04/11): o arquivo final parece a mesma arte
// do thumb? Desde 05/11 ela vem ANTES da Revisão: com divergência, a peça volta para a
// Finalização e a Arte resolve aqui (arquivo certo, corrigido ou thumb trocado). Depois
// de liberada, continua sendo só um aviso para olhar.
//
// A tela responde, nesta ordem: o conferidor está rodando? quanto já foi conferido?
// o que precisa de alguém, começando pelo caminhão mais próximo? E mostra também o
// que conferiu e o que ainda espera, para não restar dúvida do que foi visto.
import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Calendar, Check, ExternalLink, FileSearch, FolderOpen, ImageUp, Maximize2, Package, TriangleAlert, Truck, Undo2, Wrench } from "lucide-react";
import { FileUploader } from "@/components/FileUploader";
import { convertGCSUrlToLocalPath } from "@/lib/artePdfExport";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile, usePonteiroGrosso } from "@/hooks/use-mobile";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { normalizarBusca, parseDateLocal } from "@/lib/utils";
import { todayBusinessMs } from "@/lib/status";
import { ESCURO, FONT, FS, FW, N, R, T, TOM, type NomeDeTom } from "@/lib/theme";
import { Abas } from "@/components/ui/abas";
import { Botao, BotaoLink } from "@/components/ui/botao";
import { CabecalhoDaPagina } from "@/components/ui/cabecalho-da-pagina";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EstadoErro, EstadoVazio } from "@/components/ui/estados";
import { Selo } from "@/components/ui/selo";
import { Textarea } from "@/components/ui/textarea";
import { EsqueletoDeFila } from "@/components/esqueleto-de-fila";
import { FilterSelect } from "@/components/filter-select";
import { BotaoCopiar } from "@/components/botao-copiar";
import { StatusPill } from "@/components/status-pill";
import { ATALHOS_DO_AVISO, AVISO_MAXIMO, avisoObrigatorio, lerResolucao, type AcaoDoAviso, type ResolucaoDaConferencia } from "@shared/conferencia-do-arquivo";

type DadosDaPeca = {
  itemId: string; displayId: string | null; tipo: string; descricao: string | null; status: string; quantidade: number;
  material: string | null; acabamento: string | null; arqL: string | null; arqA: string | null; visL: string | null; visA: string | null; m2: string | null;
  eventId: string; evento: string; inicio: string | null; saida: string | null; thumb: string | null; arquivo: string; avisoNaGrafica: string | null;
};
type Conferencia = DadosDaPeca & {
  id: string; veredito: "confere" | "vale_olhar" | "nao_deu"; motivo: string | null; pagina: string | null; previewUrl: string | null;
  criadaEm: string; resolvidaEm: string | null; resolvidaPor: string | null; nota: string | null; resolucao: ResolucaoDaConferencia | null; reconferir: boolean;
  /** A conferência mandou a peça de volta para a Finalização (antes da Revisão). */
  voltou?: boolean;
};
type Resposta = { linhas: Conferencia[]; fila: DadosDaPeca[]; ultimaConferencia: string | null };
type Aba = "olhar" | "nao_deu" | "conferem" | "fila" | "resolvidas";
type Linha = DadosDaPeca & Partial<Conferencia>;

const CHAVE = ["/api/conferencia-do-arquivo"];
const LOTE = 40;
const SEM_LINHAS: Conferencia[] = [];
const SEM_FILA: DadosDaPeca[] = [];
const FUSO = "America/Sao_Paulo";
/** Passou disso sem nenhuma conferência, com peça na fila: está parado. */
const PARADO_APOS_MIN = 30;

const hojeBR = () => new Date().toLocaleDateString("pt-BR", { timeZone: FUSO });
function quando(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: FUSO });
  const dia = d.toLocaleDateString("pt-BR", { timeZone: FUSO });
  return dia === hojeBR() ? `hoje às ${hora}` : `${dia.slice(0, 5)} às ${hora}`;
}
const dataCurta = (d: string | null) => (d ? parseDateLocal(d).toLocaleDateString("pt-BR") : "sem data");
const caminhoLimpo = (u: string) => u.trim().replace(/^"+|"+$/g, "");
const miniatura = (u: string | null) => (u ? `${u}${u.includes("?") ? "&" : "?"}thumb=1` : null);
const medida = (l: string | null, a: string | null) => (l && a ? `${Number(l).toLocaleString("pt-BR")} × ${Number(a).toLocaleString("pt-BR")} m` : null);
const linkDaPeca = (l: DadosDaPeca) => `/eventos/${l.eventId}?item=${encodeURIComponent(l.itemId)}`;

function urgencia(saida: string | null): { rotulo: string; tom: NomeDeTom } | null {
  if (!saida) return null;
  const dias = Math.round((parseDateLocal(saida).getTime() - todayBusinessMs()) / 86400000);
  if (dias < 0) return { rotulo: dias === -1 ? "saiu ontem" : `saiu há ${-dias} dias`, tom: "neutro" };
  if (dias === 0) return { rotulo: "sai hoje", tom: "perigo" };
  if (dias === 1) return { rotulo: "sai amanhã", tom: "perigo" };
  return { rotulo: `sai em ${dias} dias`, tom: dias <= 3 ? "perigo" : dias <= 7 ? "alerta" : "neutro" };
}

function situacaoDoConferidor(ultima: string | null, fila: number): { tom: NomeDeTom; titulo: string; detalhe: string } {
  const ultimaFrase = ultima ? `Última conferência ${quando(ultima)}.` : "Nenhuma conferência ainda.";
  const minutos = ultima ? (Date.now() - new Date(ultima).getTime()) / 60000 : Infinity;
  if (fila === 0) return { tom: "sucesso", titulo: "Em dia", detalhe: `Nada esperando conferência. ${ultimaFrase}` };
  if (minutos <= PARADO_APOS_MIN) return { tom: "sucesso", titulo: "Conferindo", detalhe: ultimaFrase };
  return { tom: "alerta", titulo: "Conferidor parado", detalhe: `${ultimaFrase} A fila só anda com ele ligado num computador da rede.` };
}

function PainelDaCobertura({ conferem, olhar, naoDeu, resolvidas, fila, ultima }: { conferem: number; olhar: number; naoDeu: number; resolvidas: number; fila: number; ultima: string | null }) {
  const conferidas = conferem + olhar + naoDeu + resolvidas;
  const total = conferidas + fila;
  const pct = total > 0 ? Math.round((conferidas / total) * 100) : 0;
  const sit = situacaoDoConferidor(ultima, fila);
  const partes = [
    { rotulo: "Conferem", n: conferem, cor: TOM.sucesso.text },
    { rotulo: "Vale olhar", n: olhar, cor: TOM.alerta.text },
    { rotulo: "Não deu para conferir", n: naoDeu, cor: N.n6 },
    { rotulo: "Resolvidas", n: resolvidas, cor: TOM.info.text },
  ];
  return (
    <section aria-label="Situação da conferência" data-testid="painel-conferencia" style={{ backgroundColor: T.surface, border: `1px solid ${T.border}`, borderRadius: R.lg, padding: 16, display: "flex", flexWrap: "wrap", gap: "14px 28px", alignItems: "center" }}>
      <div style={{ flex: "2 1 320px", minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
        <p style={{ margin: 0, fontSize: FS.read, color: T.text }}>
          <strong style={{ fontFamily: FONT.display, fontSize: 22, fontWeight: FW.rotulo, fontVariantNumeric: "tabular-nums" }}>{conferidas}</strong>
          <span style={{ color: T.second }}> de {total} {total === 1 ? "peça conferida" : "peças conferidas"} · {pct}%</span>
        </p>
        <div role="img" aria-label={`${conferidas} de ${total} peças conferidas`} style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", backgroundColor: T.low, gap: 1 }}>
          {partes.filter((p) => p.n > 0).map((p) => (
            <span key={p.rotulo} style={{ width: `${(p.n / Math.max(total, 1)) * 100}%`, minWidth: 3, backgroundColor: p.cor }} />
          ))}
        </div>
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexWrap: "wrap", gap: "4px 14px", fontSize: FS.small, color: T.second }}>
          {partes.filter((p) => p.n > 0).map((p) => (
            <li key={p.rotulo} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: p.cor }} />
              {p.rotulo} <strong style={{ color: T.text, fontVariantNumeric: "tabular-nums" }}>{p.n}</strong>
            </li>
          ))}
          {fila > 0 && (
            <li style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: T.low, border: `1px solid ${T.border}` }} />
              Na fila <strong style={{ color: T.text, fontVariantNumeric: "tabular-nums" }}>{fila}</strong>
            </li>
          )}
        </ul>
      </div>
      <div data-testid="situacao-conferidor" style={{ flex: "1 1 260px", minWidth: 0, display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
        <Selo tom={sit.tom} ponto>{sit.titulo}</Selo>
        <p style={{ margin: 0, fontSize: FS.meta, color: T.second }}>{sit.detalhe}</p>
      </div>
    </section>
  );
}

function CabecalhoDoEvento({ linha, qtd, primeiro }: { linha: DadosDaPeca; qtd: number; primeiro: boolean }) {
  const u = urgencia(linha.saida);
  return (
    <div className="ds-sobre-escuro" data-testid={`evento-${linha.eventId}`} style={{ marginTop: primeiro ? 0 : 10, padding: "10px 14px", borderRadius: R.md, background: ESCURO.gradiente, display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "6px 14px" }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <Package aria-hidden="true" style={{ width: 14, height: 14, color: T.accent, flexShrink: 0 }} />
        <span style={{ fontFamily: FONT.display, fontSize: FS.strong, fontWeight: FW.rotulo, color: ESCURO.texto, overflowWrap: "anywhere" }}>{linha.evento}</span>
        <span style={{ fontSize: FS.small, color: ESCURO.apoio, whiteSpace: "nowrap" }}>{qtd} {qtd === 1 ? "peça" : "peças"}</span>
      </span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: "6px 14px", flexWrap: "wrap", fontSize: FS.small, color: ESCURO.apoio }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap" }}>
          <Calendar aria-hidden="true" style={{ width: 12, height: 12 }} />
          Início <strong style={{ color: ESCURO.texto, fontVariantNumeric: "tabular-nums" }}>{dataCurta(linha.inicio)}</strong>
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap" }}>
          <Truck aria-hidden="true" style={{ width: 12, height: 12 }} />
          Saída <strong style={{ color: ESCURO.texto, fontVariantNumeric: "tabular-nums" }}>{dataCurta(linha.saida)}</strong>
        </span>
        {u && <Selo tom={u.tom} tamanho="sm">{u.rotulo}</Selo>}
      </span>
    </div>
  );
}

function Dado({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div style={{ minWidth: 0 }}>
      <dt style={{ fontSize: FS.small, color: T.second }}>{rotulo}</dt>
      <dd style={{ margin: 0, fontSize: FS.meta, fontWeight: FW.medio, color: T.text, overflowWrap: "anywhere", fontVariantNumeric: "tabular-nums" }}>{children}</dd>
    </div>
  );
}

/** Identifica a peça igual em todas as abas: quem é e o que a Gráfica vai produzir. */
function DadosDaLinha({ l }: { l: DadosDaPeca }) {
  const arq = medida(l.arqL, l.arqA), vis = medida(l.visL, l.visA);
  return (
    <div style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 8px" }}>
        <Link href={linkDaPeca(l)} aria-label={`Abrir a peça ${l.displayId ?? ""}`} style={{ fontFamily: FONT.mono, fontSize: 13, fontWeight: FW.rotulo, color: T.accentText, textDecoration: "none", whiteSpace: "nowrap" }}>
          {l.displayId ?? "Peça"}
        </Link>
        <strong style={{ fontSize: FS.read, color: T.text, overflowWrap: "anywhere" }}>{l.tipo}</strong>
        <StatusPill status={l.status} size="sm" showDot={false} />
      </div>
      {l.descricao && <p style={{ margin: 0, fontSize: FS.body, color: T.apoio, overflowWrap: "anywhere" }}>{l.descricao}</p>}
      <dl style={{ display: "flex", flexWrap: "wrap", gap: "4px 20px", margin: 0 }}>
        <Dado rotulo="Material">{[l.material, l.acabamento].filter(Boolean).join(" · ") || "—"}</Dado>
        {arq && <Dado rotulo="Arquivo">{arq}</Dado>}
        {vis && <Dado rotulo="Visual">{vis}</Dado>}
        <Dado rotulo="Qtd">{l.quantidade}</Dado>
        {l.m2 && Number(l.m2) > 0 && <Dado rotulo="m²">{Number(l.m2).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}</Dado>}
      </dl>
    </div>
  );
}

function Miniatura({ url, rotulo }: { url: string | null; rotulo: string }) {
  return (
    <span style={{ width: 56, height: 56, flexShrink: 0, borderRadius: R.sm, border: `1px solid ${T.border}`, backgroundColor: T.low, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
      {url ? <img src={url} alt={rotulo} loading="lazy" decoding="async" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} /> : <FileSearch aria-hidden="true" style={{ width: 16, height: 16, color: T.second }} />}
    </span>
  );
}

function ImagemDaComparacao({ rotulo, url, vazio, aoAmpliar }: { rotulo: string; url: string | null; vazio: string; aoAmpliar: () => void }) {
  const moldura = { minHeight: 110, flex: 1, borderRadius: R.md, border: `1px solid ${T.border}`, backgroundColor: T.low, display: "flex", alignItems: "center", justifyContent: "center" } as const;
  return (
    <figure style={{ margin: 0, flex: "1 1 260px", minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
      <figcaption style={{ fontSize: FS.small, fontWeight: FW.forte, color: T.apoio }}>{rotulo}</figcaption>
      {url ? (
        <button type="button" onClick={aoAmpliar} aria-label={`Ampliar: ${rotulo}`} style={{ ...moldura, position: "relative", padding: 0, cursor: "zoom-in", overflow: "hidden" }}>
          <img src={url} alt={rotulo} loading="lazy" decoding="async" style={{ maxWidth: "100%", maxHeight: 320, objectFit: "contain", display: "block" }} />
          <Maximize2 aria-hidden="true" style={{ position: "absolute", top: 6, right: 6, width: 14, height: 14, padding: 4, boxSizing: "content-box", borderRadius: R.sm, backgroundColor: T.surface, color: T.apoio }} />
        </button>
      ) : (
        <div style={{ ...moldura, padding: 12, textAlign: "center", fontSize: FS.meta, color: T.second }}>{vazio}</div>
      )}
    </figure>
  );
}

const FRASE_DA_RESOLUCAO: Record<ResolucaoDaConferencia, string> = { certo: "Estava certo", corrigido: "Corrigido", thumb: "Thumb trocado" };

function RodapeDaLinha({ l, dedo, aoResolver, aoTrocarThumb, aoTirarAviso, tirando }: { l: Conferencia; dedo: boolean; aoResolver: (acao: AcaoDoAviso) => void; aoTrocarThumb?: () => void; aoTirarAviso: () => void; tirando: boolean }) {
  const tamanho = dedo ? "toque" : "md";
  const c = caminhoLimpo(l.arquivo);
  return (
    <footer style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 10px", borderTop: `1px solid ${N.n3}`, paddingTop: 10 }}>
      <div style={{ flex: "1 1 280px", minWidth: 0, display: "flex", alignItems: "flex-start", gap: 6 }}>
        <FolderOpen aria-hidden="true" style={{ width: 14, height: 14, marginTop: 2, flexShrink: 0, color: T.second }} />
        <code style={{ minWidth: 0, fontSize: FS.small, color: T.second, overflowWrap: "anywhere" }}>{c}</code>
        <BotaoCopiar texto={c} rotulo={`o caminho do arquivo de ${l.displayId ?? "a peça"}`} tamanho={dedo ? 44 : 24} />
      </div>
      {l.resolvidaEm ? (
        <div data-testid={`resolvida-${l.displayId ?? l.id}`} style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4, maxWidth: "100%" }}>
          <Selo tom="sucesso" ponto>{l.resolucao ? FRASE_DA_RESOLUCAO[l.resolucao] : "Vista"} por {l.resolvidaPor ?? "alguém"} {quando(l.resolvidaEm)}</Selo>
          {l.nota && <span style={{ fontSize: FS.meta, color: T.apoio, overflowWrap: "anywhere" }}><strong>Na Gráfica:</strong> {l.nota}</span>}
          {l.reconferir && <span style={{ fontSize: FS.small, color: T.second }}>Esperando a nova conferência do arquivo.</span>}
          {l.avisoNaGrafica && <Botao variante="secundario" tamanho={dedo ? "toque" : "sm"} onClick={aoTirarAviso} carregando={tirando} data-testid={`tirar-aviso-${l.displayId ?? l.id}`}>Tirar o aviso da Gráfica</Botao>}
        </div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <BotaoLink href={linkDaPeca(l)} variante="secundario" tamanho={tamanho} icone={ExternalLink} data-testid={`abrir-${l.displayId ?? l.id}`}>Abrir peça</BotaoLink>
          <Botao variante="secundario" tamanho={tamanho} icone={Check} onClick={() => aoResolver("certo")} data-testid={`certo-${l.displayId ?? l.id}`}>{l.veredito === "nao_deu" ? "Conferi à mão" : "Arquivo está certo"}</Botao>
          {aoTrocarThumb && <Botao variante="secundario" tamanho={tamanho} icone={ImageUp} onClick={aoTrocarThumb} data-testid={`trocar-thumb-${l.displayId ?? l.id}`}>O thumb está errado</Botao>}
          <Botao variante="primario" tamanho={tamanho} icone={Wrench} onClick={() => aoResolver("corrigido")} data-testid={`corrigi-${l.displayId ?? l.id}`}>Corrigi o arquivo</Botao>
        </div>
      )}
    </footer>
  );
}

export default function ConferenciaArquivos() {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const dedo = usePonteiroGrosso() || isMobile;
  const [abaEscolhida, setAba] = useState<Aba | null>(null);
  const [busca, setBusca] = useState("");
  const [evento, setEvento] = useState("all");
  const [vistos, setVistos] = useState(LOTE);
  const [ampliada, setAmpliada] = useState<Conferencia | null>(null);
  const [resolvendo, setResolvendo] = useState<{ linha: Conferencia; acao: AcaoDoAviso } | null>(null);
  const [trocandoThumb, setTrocandoThumb] = useState<Conferencia | null>(null);
  const [aviso, setAviso] = useState("");
  const { data, isLoading, isError, refetch, isFetching } = useQuery<Resposta>({ queryKey: CHAVE, staleTime: 30_000 });

  const linhas = data?.linhas ?? SEM_LINHAS;
  const fila = data?.fila ?? SEM_FILA;
  const grupos = useMemo<Record<Aba, Linha[]>>(() => ({
    olhar: linhas.filter((x) => x.veredito === "vale_olhar" && !x.resolvidaEm),
    nao_deu: linhas.filter((x) => x.veredito === "nao_deu" && !x.resolvidaEm),
    conferem: linhas.filter((x) => x.veredito === "confere"),
    fila,
    resolvidas: linhas.filter((x) => x.veredito !== "confere" && !!x.resolvidaEm),
  }), [linhas, fila]);
  // Sem escolha, abre no que pede atenção.
  const aba: Aba = abaEscolhida ?? (grupos.olhar.length > 0 ? "olhar" : grupos.nao_deu.length > 0 ? "nao_deu" : grupos.conferem.length > 0 ? "conferem" : "olhar");
  const daAba = grupos[aba];

  const opcoesDeEvento = useMemo(() => {
    const m = new Map<string, { value: string; label: string; count: number }>();
    for (const l of daAba) { const x = m.get(l.eventId); if (x) x.count++; else m.set(l.eventId, { value: l.eventId, label: l.evento, count: 1 }); }
    return Array.from(m.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [daAba]);
  const eventoValido = evento === "all" || opcoesDeEvento.some((o) => o.value === evento) ? evento : "all";

  const visiveis = useMemo(() => {
    const termo = normalizarBusca(busca.trim());
    return daAba.filter((l) => (eventoValido === "all" || l.eventId === eventoValido)
      && (!termo || normalizarBusca([l.displayId, l.tipo, l.descricao, l.material, l.evento, l.arquivo, l.motivo].filter(Boolean).join(" ")).includes(termo)));
  }, [daAba, eventoValido, busca]);
  const naTela = visiveis.slice(0, vistos);
  const porEvento = useMemo(() => { const m = new Map<string, number>(); for (const l of visiveis) m.set(l.eventId, (m.get(l.eventId) ?? 0) + 1); return m; }, [visiveis]);

  const resolver = useMutation({
    mutationFn: async ({ id, acao, texto }: { id: string; acao: AcaoDoAviso; texto: string }) => (await apiRequest("POST", `/api/conferencia-do-arquivo/${id}/resolver`, { acao, aviso: texto })).json(),
    onSuccess: (_r, { texto }) => {
      toast({ title: texto.trim() ? "Resolvido e Gráfica avisada" : "Resolvido", variant: "success" });
      setResolvendo(null); setAviso("");
      void queryClient.invalidateQueries({ queryKey: CHAVE });
    },
    onError: (e: Error) => toast({ title: "Não foi possível resolver", description: e.message, variant: "destructive" }),
  });
  const trocarThumb = useMutation({
    mutationFn: async ({ id, corpo }: { id: string; corpo: { usar: "arquivo_final" } | { thumbUrl: string } }) => (await apiRequest("POST", `/api/conferencia-do-arquivo/${id}/trocar-thumb`, corpo)).json(),
    onSuccess: () => {
      toast({ title: "Thumb trocado", description: trocandoThumb?.voltou ? "A peça seguiu para a Revisão Final." : undefined, variant: "success" });
      setTrocandoThumb(null);
      void queryClient.invalidateQueries({ queryKey: CHAVE });
    },
    onError: (e: Error) => toast({ title: "Não foi possível trocar o thumb", description: e.message, variant: "destructive" }),
  });
  const pedirUpload = async () => {
    const r = await apiRequest("POST", "/api/objects/upload", {});
    const d = await r.json() as { uploadURL: string };
    return { method: "PUT" as const, url: d.uploadURL };
  };
  const tirarAviso = useMutation({
    mutationFn: async (id: string) => (await apiRequest("POST", `/api/conferencia-do-arquivo/${id}/tirar-aviso`, {})).json(),
    onSuccess: () => { toast({ title: "Aviso tirado da Gráfica", variant: "success" }); void queryClient.invalidateQueries({ queryKey: CHAVE }); },
    onError: (e: Error) => toast({ title: "Não foi possível tirar o aviso", description: e.message, variant: "destructive" }),
  });
  const tamanhoDoBotao = dedo ? "toque" : "md";
  const pedirResolver = (linha: Conferencia, acao: AcaoDoAviso) => { setAviso(""); setResolvendo({ linha, acao }); };
  const leituraDoAviso = resolvendo ? lerResolucao({ acao: resolvendo.acao, aviso }, resolvendo.linha.status) : null;
  const avisoOpcional = !!resolvendo && !avisoObrigatorio(resolvendo.linha.status, resolvendo.acao);
  let eventoAnterior: string | null = null;

  return (
    <div data-testid="pagina-conferencia-arquivos" className="container mx-auto p-4 max-w-6xl 2xl:max-w-[1440px]" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <CabecalhoDaPagina
        titulo="Conferência de arte"
        subtitulo={isMobile ? "O arquivo final é a mesma arte do thumb? Com diferença, a peça volta para a Finalização." : "Compara o arquivo final com o thumb antes da Revisão Final. Com diferença, a peça volta para a Finalização até alguém resolver aqui. Depois de liberada, é só um aviso para olhar."}
      />
      {data && (
        <PainelDaCobertura conferem={grupos.conferem.length} olhar={grupos.olhar.length} naoDeu={grupos.nao_deu.length} resolvidas={grupos.resolvidas.length} fila={fila.length} ultima={data.ultimaConferencia} />
      )}
      <Abas
        rotuloDaLista="Situação da conferência"
        prefixoDeTestId="aba-conferencia"
        ativo={aba}
        aoTrocar={(id) => { setAba(id as Aba); setEvento("all"); setVistos(LOTE); }}
        itens={[
          { id: "olhar", rotulo: "Vale olhar", contador: grupos.olhar.length || undefined, tom: "alerta" },
          { id: "nao_deu", rotulo: "Não deu para conferir", contador: grupos.nao_deu.length || undefined },
          { id: "conferem", rotulo: "Conferem", contador: grupos.conferem.length || undefined },
          { id: "fila", rotulo: "Na fila", contador: grupos.fila.length || undefined },
          { id: "resolvidas", rotulo: "Resolvidas", contador: grupos.resolvidas.length || undefined },
        ]}
      />
      {daAba.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <input
            type="search"
            value={busca}
            onChange={(e) => { setBusca(e.target.value); setVistos(LOTE); }}
            placeholder="Buscar por ID, descrição, evento ou arquivo"
            aria-label="Buscar peça"
            data-testid="busca-conferencia"
            className="grf-campo"
            style={{ flex: "1 1 260px", minWidth: 0, height: dedo ? 44 : 38, padding: "0 12px", borderRadius: R.md, border: `1px solid ${T.border}`, backgroundColor: T.surface, color: T.text, fontSize: FS.body }}
          />
          <FilterSelect
            showAllLabelWhenEmpty hideWhenEmpty={false}
            label="Evento" allLabel="Todos os eventos" icon={Calendar}
            value={eventoValido} onChange={(v) => { setEvento(v || "all"); setVistos(LOTE); }} options={opcoesDeEvento}
            searchPlaceholder="Buscar evento…" emptyText="Nenhum evento encontrado."
            testId="filtro-evento-conferencia" fullWidth={isMobile} panelWidth={isMobile ? undefined : 340}
          />
        </div>
      )}

      {isLoading ? <EsqueletoDeFila linhas={4} />
        : isError ? <EstadoErro titulo="Não foi possível carregar a conferência" detalhe="Verifique sua conexão e tente novamente." aoTentarDeNovo={isFetching ? undefined : () => { void refetch(); }} />
        : visiveis.length === 0 ? (
          <EstadoVazio
            icone={FileSearch}
            testId="vazio-conferencia"
            titulo={daAba.length > 0 ? "Nenhuma peça neste recorte" : { olhar: "Nenhuma peça para olhar", nao_deu: "Nenhum arquivo ficou de fora", conferem: "Nenhuma peça conferida ainda", fila: "Nada esperando conferência", resolvidas: "Nada resolvido ainda" }[aba]}
            descricao={daAba.length > 0 ? "Mude a busca ou o evento." : { olhar: "Quando um arquivo parecer diferente do thumb, ele aparece aqui.", nao_deu: "Aparecem aqui os arquivos que não foram encontrados ou não abriram.", conferem: "As peças em que o arquivo é a mesma arte do thumb ficam aqui.", fila: "Toda peça liberada e ainda não impressa já foi conferida.", resolvidas: "As peças resolvidas ficam aqui, com quem resolveu e o que a Gráfica recebeu." }[aba]}
          />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }} data-testid="lista-conferencia">
            {naTela.map((l, i) => {
              const abre = l.eventId !== eventoAnterior;
              eventoAnterior = l.eventId;
              const conf = l as Conferencia;
              const chave = l.id ?? l.itemId;
              const testId = `conferencia-${l.displayId ?? chave}`;
              const cartao = { backgroundColor: T.surface, border: `1px solid ${T.border}`, borderRadius: R.md, display: "flex", minWidth: 0 } as const;
              return (
                <div key={chave} style={{ display: "contents" }}>
                  {abre && <CabecalhoDoEvento linha={l} qtd={porEvento.get(l.eventId) ?? 0} primeiro={i === 0} />}
                  {l.veredito === "vale_olhar" ? (
                    <article data-testid={testId} style={{ ...cartao, padding: isMobile ? 12 : 14, flexDirection: "column", gap: 12 }}>
                      <DadosDaLinha l={l} />
                      {conf.voltou && !conf.resolvidaEm && (
                        <div data-testid={`voltou-${l.displayId ?? chave}`} style={{ display: "flex", flexWrap: "wrap", gap: "4px 10px", alignItems: "center", fontSize: FS.body, color: T.apoio }}>
                          <Selo tom="perigo" icone={Undo2} tamanho="sm">Voltou para a Finalização</Selo>
                          <span>A Revisão só recebe a peça depois que alguém resolver aqui.</span>
                        </div>
                      )}
                      {l.motivo && (
                        <div style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "9px 12px", borderRadius: R.md, backgroundColor: TOM.alerta.bg, border: `1px solid ${TOM.alerta.border}`, color: TOM.alerta.text, fontSize: FS.body }}>
                          <TriangleAlert aria-hidden="true" style={{ width: 15, height: 15, flexShrink: 0, marginTop: 2 }} />
                          <span><strong>O que parece diferente:</strong> {l.motivo}</span>
                        </div>
                      )}
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "stretch" }}>
                        <ImagemDaComparacao rotulo="Thumb" url={l.thumb} vazio="Sem thumb" aoAmpliar={() => setAmpliada(conf)} />
                        <ImagemDaComparacao rotulo={l.pagina && !l.pagina.endsWith("/1") ? `Arquivo final · prancheta ${l.pagina}` : "Arquivo final"} url={l.previewUrl ?? null} vazio="Sem imagem do arquivo" aoAmpliar={() => setAmpliada(conf)} />
                      </div>
                      <RodapeDaLinha l={conf} dedo={dedo} aoResolver={(acao) => pedirResolver(conf, acao)} aoTrocarThumb={() => setTrocandoThumb(conf)} aoTirarAviso={() => tirarAviso.mutate(conf.id)} tirando={tirarAviso.isPending && tirarAviso.variables === conf.id} />
                    </article>
                  ) : l.veredito === "nao_deu" ? (
                    <article data-testid={testId} style={{ ...cartao, padding: isMobile ? 12 : 14, flexDirection: "column", gap: 10 }}>
                      <div style={{ display: "flex", gap: 12, minWidth: 0 }}>
                        <Miniatura url={miniatura(l.thumb)} rotulo={`Thumb de ${l.displayId ?? "peça"}`} />
                        <DadosDaLinha l={l} />
                      </div>
                      <p style={{ margin: 0, fontSize: FS.body, color: T.text }}>
                        <strong>{l.motivo ?? "Não deu para conferir."}</strong>
                        <span style={{ color: T.second }}> Tentado {quando(l.criadaEm)}.{l.resolvidaEm ? "" : " Confira o caminho na peça: o sistema tenta de novo depois de um dia."}</span>
                      </p>
                      <RodapeDaLinha l={conf} dedo={dedo} aoResolver={(acao) => pedirResolver(conf, acao)} aoTirarAviso={() => tirarAviso.mutate(conf.id)} tirando={tirarAviso.isPending && tirarAviso.variables === conf.id} />
                    </article>
                  ) : (
                    <article data-testid={testId} style={{ ...cartao, padding: 10, gap: 12, alignItems: "center", flexWrap: isMobile ? "wrap" : "nowrap" }}>
                      <Miniatura url={miniatura(l.thumb)} rotulo={`Thumb de ${l.displayId ?? "peça"}`} />
                      <DadosDaLinha l={l} />
                      {l.veredito === "confere" && (
                        <span style={{ display: "inline-flex", flexDirection: isMobile ? "row" : "column", alignItems: isMobile ? "center" : "flex-end", gap: 6, flexShrink: 0, fontSize: FS.small, color: T.second }}>
                          <Selo tom="sucesso" tamanho="sm" icone={Check}>Confere</Selo>
                          {quando(l.criadaEm)}
                        </span>
                      )}
                    </article>
                  )}
                </div>
              );
            })}
            {visiveis.length > naTela.length && (
              <Botao variante="secundario" tamanho={tamanhoDoBotao} onClick={() => setVistos((n) => n + LOTE)} data-testid="mostrar-mais-conferencia">
                Mostrar mais ({visiveis.length - naTela.length})
              </Botao>
            )}
          </div>
        )}

      {/* Lado a lado em tamanho grande: é o que decide se a diferença é real. */}
      <Dialog open={!!ampliada} onOpenChange={(o) => { if (!o) setAmpliada(null); }}>
        <DialogContent className="sm:max-w-[1200px]" data-testid="ampliar-conferencia">
          <DialogHeader>
            <DialogTitle>{ampliada?.displayId} · {ampliada?.tipo}</DialogTitle>
            <DialogDescription>{ampliada?.motivo ?? "Thumb e arquivo final lado a lado."}</DialogDescription>
          </DialogHeader>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            {[{ r: "Thumb", u: ampliada?.thumb }, { r: "Arquivo final", u: ampliada?.previewUrl }].map(({ r, u }) => (
              <figure key={r} style={{ margin: 0, flex: "1 1 320px", minWidth: 0 }}>
                <figcaption style={{ fontSize: FS.small, fontWeight: FW.forte, color: T.apoio, marginBottom: 6 }}>{r}</figcaption>
                {u ? <img src={u} alt={r} style={{ width: "100%", maxHeight: "68vh", objectFit: "contain", borderRadius: R.md, border: `1px solid ${T.border}`, backgroundColor: T.low }} /> : <p style={{ margin: 0, fontSize: FS.meta, color: T.second }}>Sem imagem</p>}
              </figure>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Quem resolve escolhe o que a Gráfica lê: fica na peça, na tela dela, e chega no sino. */}
      <Dialog open={!!resolvendo} onOpenChange={(o) => { if (!o && !resolver.isPending) setResolvendo(null); }}>
        <DialogContent className="sm:max-w-[520px]" data-testid="resolver-conferencia">
          <DialogHeader>
            <DialogTitle>{resolvendo?.acao === "corrigido" ? "Corrigi o arquivo" : resolvendo?.linha.veredito === "nao_deu" ? "Conferi à mão" : "Arquivo está certo"} · {resolvendo?.linha.displayId ?? "peça"}</DialogTitle>
            <DialogDescription>
              {resolvendo?.acao === "corrigido"
                ? (resolvendo.linha.voltou ? "A peça vai para a Revisão Final e o arquivo é conferido de novo. Se ainda parecer diferente, ela volta para a Finalização." : "O aviso sai da lista e o arquivo é conferido de novo. Se ainda parecer diferente, o aviso volta.")
                : resolvendo?.linha.voltou ? "A peça segue para a Revisão Final e a decisão fica no histórico dela." : "O aviso sai da lista e fica registrado no histórico da peça."}
            </DialogDescription>
          </DialogHeader>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label htmlFor="aviso-da-conferencia" style={{ fontSize: FS.body, fontWeight: FW.forte, color: T.text }}>
              O que vai aparecer na Gráfica {avisoOpcional && <span style={{ fontWeight: FW.medio, color: T.second }}>(opcional)</span>}
            </label>
            <div role="group" aria-label="Atalhos do aviso" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {resolvendo && ATALHOS_DO_AVISO[resolvendo.acao].map((a: string) => (
                <button key={a} type="button" className="ds-botao" aria-pressed={aviso === a} onClick={() => setAviso(a)} data-testid={`atalho-${a}`} style={{ padding: dedo ? "10px 12px" : "6px 10px", borderRadius: R.md, cursor: "pointer", textAlign: "left", fontSize: FS.meta, fontWeight: FW.medio, border: `1px solid ${aviso === a ? T.accent : T.border}`, backgroundColor: aviso === a ? TOM.laranja.bg : T.surface, color: aviso === a ? TOM.laranja.text : T.apoio }}>{a}</button>
              ))}
            </div>
            <Textarea id="aviso-da-conferencia" value={aviso} onChange={(e) => setAviso(e.target.value)} maxLength={AVISO_MAXIMO} rows={3} placeholder="Escolha um atalho ou escreva o que a Gráfica precisa saber" data-testid="aviso-conferencia" />
            <p style={{ margin: 0, fontSize: FS.small, color: T.second }}>Fica na peça, na tela da Gráfica, com o seu nome. A Gráfica também recebe no sino.</p>
            {aviso.trim().length > 0 && leituraDoAviso && !leituraDoAviso.ok && <p role="alert" style={{ margin: 0, fontSize: FS.small, color: TOM.perigo.text }}>{leituraDoAviso.erro}</p>}
          </div>
          <DialogFooter>
            <Botao variante="secundario" tamanho={tamanhoDoBotao} onClick={() => setResolvendo(null)} disabled={resolver.isPending}>Agora não</Botao>
            <Botao variante="primario" tamanho={tamanhoDoBotao} icone={Check} carregando={resolver.isPending} disabled={!leituraDoAviso?.ok || (!avisoOpcional && !aviso.trim())} onClick={() => { if (resolvendo) resolver.mutate({ id: resolvendo.linha.id, acao: resolvendo.acao, texto: aviso }); }} data-testid="confirmar-resolver">{aviso.trim() ? "Resolver e avisar a Gráfica" : "Resolver"}</Botao>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* O thumb é que estava errado: troca aqui, sem esperar a peça chegar na Gráfica. */}
      <Dialog open={!!trocandoThumb} onOpenChange={(o) => { if (!o && !trocarThumb.isPending) setTrocandoThumb(null); }}>
        <DialogContent className="sm:max-w-[640px]" data-testid="trocar-thumb-conferencia">
          <DialogHeader>
            <DialogTitle>Trocar o thumb · {trocandoThumb?.displayId ?? "peça"}</DialogTitle>
            <DialogDescription>
              O arquivo final fica como está e o thumb passa a ser a imagem escolhida. A troca fica no histórico e nas Versões da peça.{trocandoThumb?.voltou ? " A peça segue para a Revisão Final." : ""}
            </DialogDescription>
          </DialogHeader>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            {[{ r: "Thumb de agora", u: trocandoThumb?.thumb }, { r: "Arquivo final", u: trocandoThumb?.previewUrl }].map(({ r, u }) => (
              <figure key={r} style={{ margin: 0, flex: "1 1 220px", minWidth: 0 }}>
                <figcaption style={{ fontSize: FS.small, fontWeight: FW.forte, color: T.apoio, marginBottom: 6 }}>{r}</figcaption>
                {u ? <img src={u} alt={r} style={{ width: "100%", height: 150, objectFit: "contain", borderRadius: R.md, border: `1px solid ${T.border}`, backgroundColor: T.low }} /> : <p style={{ margin: 0, fontSize: FS.meta, color: T.second }}>Sem imagem</p>}
              </figure>
            ))}
          </div>
          <DialogFooter style={{ flexWrap: "wrap", gap: 8 }}>
            <Botao variante="secundario" tamanho={tamanhoDoBotao} onClick={() => setTrocandoThumb(null)} disabled={trocarThumb.isPending}>Agora não</Botao>
            <FileUploader
              onGetUploadParameters={pedirUpload}
              onComplete={(r) => { if (trocandoThumb) trocarThumb.mutate({ id: trocandoThumb.id, corpo: { thumbUrl: convertGCSUrlToLocalPath(r.url) } }); }}
              accept="image/*"
              data-testid="enviar-outro-thumb"
              disabled={trocarThumb.isPending}
              buttonVariant="outline"
              buttonClassName={dedo ? "h-11 min-h-[44px] px-4" : "h-10 px-4"}
            >
              Enviar outra imagem
            </FileUploader>
            <Botao variante="primario" tamanho={tamanhoDoBotao} icone={ImageUp} carregando={trocarThumb.isPending} disabled={!trocandoThumb?.previewUrl}
              onClick={() => { if (trocandoThumb) trocarThumb.mutate({ id: trocandoThumb.id, corpo: { usar: "arquivo_final" } }); }} data-testid="usar-arquivo-final">
              Usar a imagem do arquivo final
            </Botao>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
