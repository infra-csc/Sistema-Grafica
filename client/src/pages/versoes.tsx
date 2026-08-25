// ─────────────────────────────────────────────────────────────────────────────
// VERSÕES APROVADAS — qual versão da arte cada patrocinador aprovou, de qual
// peça, e os books de cada evento com história baixável.
//
// Pedido do dono (21/08/2026). A pergunta desta tela é de auditoria comercial:
// "o que o patrocinador aprovou, e é isso que está indo para a gráfica?".
//
// ── A REVISÃO DE 24/08 ───────────────────────────────────────────────────────
// A primeira versão desta tela abria com 2.637 peças — das quais 96% têm uma
// versão só e 35% não têm decisão nenhuma — para um assunto que são 30 peças.
// O achado ficava perdido, e a tela baixava 2,24 MB para mostrar quarenta
// linhas. Cinco mudanças estruturais:
//
//  1. ABRE PELA EXCEÇÃO. O padrão é "Precisa de atenção": divergência, peça com
//     mais de uma versão, decisão indeterminada, ou pendência parada há mais de
//     uma semana. O acervo inteiro fica a um clique, não à frente.
//  2. TRÊS NÚMEROS CLICÁVEIS no cabeçalho — o resumo é o índice da tela.
//  3. COMPARADOR. Comparar duas artes era abrir duas abas e confiar na memória;
//     agora é um clique, com ←/→ para alternar e a legenda de quem aprovou cada
//     uma. É o gesto que a tela promete e não fazia.
//  4. O SERVIDOR FILTRA E PAGINA. O recorte inteiro sai em CSV; a página traz
//     quarenta. A régua de versões só cresce quando há o que comparar, então a
//     área nobre do cartão volta a ser a decisão.
//  5. TUDO NA URL. O recorte virou link — como em Eventos e no Painel Geral.
//
// O que NÃO mudou, de propósito: a separação entre REGISTRO e INFERÊNCIA. Uma
// decisão anterior às tabelas novas recebe a versão vigente na data e diz isso;
// quando a decisão empata com a troca de arte, a tela responde "indeterminada"
// em vez de chutar. Inferência apresentada como registro é o erro que esta tela
// existe para evitar.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  GitBranch, Search, X, Download, FileText, Check, Clock, AlertTriangle,
  ExternalLink, ChevronLeft, ChevronRight, Layers, HelpCircle, Table2, Send, Loader2,
  MessageSquareWarning, Columns2, Square,
} from "lucide-react";
import { Link } from "wouter";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ModalHeader, modalSurface, HIDE_NATIVE_CLOSE, FreezeWhileClosing } from "@/components/modal-shell";
import { FilterSelect } from "@/components/filter-select";
import { useIsMobile } from "@/hooks/use-mobile";
import { T, FS, R, SHADOW } from "@/lib/theme";
import { getApprovalMeta } from "@/lib/status";
import { isWebUrl } from "@/components/file-preview";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";

type Versao = {
  thumbUrl: string; em: string;
  origem: "envio" | "reenvio" | "troca" | "trilha" | "atual";
  por: string | null; inferida: boolean;
};
type Decisao = {
  sponsorId: string; nome: string; cor: string | null; status: string;
  decididoEm: string | null; por: string | null; motivo: string | null;
  thumbUrl: string | null; versao: number | null;
  inferido: boolean; ambiguo: boolean; divergente: boolean;
};
type Peca = {
  id: string; displayId: string; type: string; description: string | null; status: string;
  eventId: string; eventName: string; truckDepartureDate: string | null;
  approvalThumbUrl: string | null; bookUrl: string | null;
  versoes: Versao[]; decisoes: Decisao[];
  divergente: boolean; indeterminada: boolean; atencao: boolean;
};
type PecaQueMudou = {
  id: string; displayId: string; eventId: string; em: string;
  type: string; description: string | null; status: string; por: string | null; versao: number;
};
type Book = {
  bookUrl: string; em: string | null; por: string | null; itemCount: number; inferido: boolean;
  membrosConhecidos: boolean; pecasMudaramDepois: number; pecasMudaram: PecaQueMudou[];
};
/** O último aviso do book que SAIU por e-mail, lido da trilha. O e-mail não
 *  tem rastreio de abertura (SMTP simples, sem pixel) — por isso a tela diz
 *  envio e destinatários, e nenhuma taxa de leitura. */
type AvisoDoBook = { em: string; pessoas: number };
type BooksDoEvento = { eventId: string; eventName: string; truckDepartureDate: string | null; books: Book[]; aviso: AvisoDoBook | null };
type Faceta = { value: string; label: string; count: number };
type Resumo = {
  total: number; atencao: number; divergentes: number; comHistorico: number;
  indeterminadas: number; semPatrocinador: number;
  decisoesTomadas: number; decisoesInferidas: number; decisoesAmbiguas: number;
};
type Payload = {
  resumo: Resumo; registroDesde: string | null;
  facetas: { eventos: Faceta[]; patrocinadores: Faceta[] };
  total: number; pagina: number; tamanho: number;
  itens: Peca[]; books: BooksDoEvento[];
};

type Foco = "atencao" | "todas" | "sem-patrocinador";

const ORIGEM_LABEL: Record<Versao["origem"], string> = {
  envio: "enviada para aprovação",
  reenvio: "reenviada após correção",
  troca: "trocada pela Arte",
  trilha: "reconstruída da trilha de auditoria",
  atual: "arte que está na peça hoje",
};

// ── A GRAVIDADE DA PEÇA ─────────────────────────────────────────────────────
// O mesmo desencontro de versão é coisa diferente conforme onde a peça está:
// em aprovação é conserto de dez minutos; depois da gráfica é arte impressa
// errada. O subtítulo da tela promete dizer "se é ela que está indo para a
// gráfica" — sem o status, essa metade da pergunta ficava sem resposta.
type Gravidade = "aprovacao" | "liberada" | "producao" | "impressa";

const GRAVIDADE: Record<string, Gravidade> = {
  draft: "aprovacao", requested: "aprovacao", awaiting_linking: "aprovacao",
  awaiting_submission: "aprovacao", awaiting_approval: "aprovacao",
  awaiting_sponsor_approval: "aprovacao", awaiting_review: "aprovacao", in_review: "aprovacao",
  sponsor_approved: "liberada", awaiting_finalization: "liberada", awaiting_creator_review: "liberada",
  awaiting_final_review: "liberada", ready_for_production: "liberada", pronto_para_producao: "liberada",
  approved: "liberada", liberado: "liberada",
  inProduction: "producao", em_producao: "producao",
  produced: "impressa", produzido: "impressa", conferred: "impressa",
  delivered: "impressa", entregue: "impressa",
};

const GRAVIDADE_VISUAL: Record<Gravidade, { rotulo: string; cor: string; fundo: string; borda: string; consequencia: string }> = {
  aprovacao: {
    rotulo: "em aprovação", cor: "#b45309", fundo: "#fffbeb", borda: "#fde68a",
    consequencia: "A peça ainda está em aprovação — divergência aqui é conserto barato.",
  },
  liberada: {
    rotulo: "liberada", cor: "#0f766e", fundo: "#f0fdfa", borda: "#99f6e4",
    consequencia: "A peça já foi liberada e está a caminho da gráfica — ainda dá para segurar.",
  },
  producao: {
    rotulo: "em produção", cor: "#c2410c", fundo: "#fff7ed", borda: "#fed7aa",
    consequencia: "A peça já foi para a gráfica — divergência aqui é arte impressa errada.",
  },
  impressa: {
    rotulo: "produzida", cor: "#047857", fundo: "#ecfdf5", borda: "#a7f3d0",
    consequencia: "A peça já foi produzida — divergência aqui é material impresso errado.",
  },
};

const gravidadeDe = (status: string): Gravidade => GRAVIDADE[status] ?? "aprovacao";
/** Passou da gráfica: o erro deixou de ser corrigível de graça. */
const jaFoiParaGrafica = (status: string) => {
  const g = gravidadeDe(status);
  return g === "producao" || g === "impressa";
};

const fmtData = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—"
    : `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" })} ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
};
const fmtDia = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
};

const MONO = "'DM Mono', monospace";
const numero: React.CSSProperties = { fontFamily: MONO, fontVariantNumeric: "tabular-nums" };

const lerCsv = (p: URLSearchParams, chave: string) =>
  (p.get(chave) ?? "").split(",").map(s => s.trim()).filter(Boolean);

export default function Versoes() {
  const isMobile = useIsMobile();
  const { user } = useAuth();
  // Reenviar dispara e-mail de verdade para a lista inteira e não tem
  // desfazer: é ação de admin (decisão do dono, 24/08). A mesma régua do
  // servidor — o botão some para os demais em vez de existir para dar 403.
  const podeAvisar = user?.role === "admin";
  // Republicar leva ao gerador de book, e publicar por lá é de arte/admin —
  // a mesma régua da página /gerar-book. O botão some para os demais.
  const podeRepublicar = user?.role === "admin" || user?.role === "arte";

  // ── Estado: nasce da URL e volta para ela (recorte compartilhável) ──
  const inicial = useMemo(() => new URLSearchParams(window.location.search), []);
  const [foco, setFoco] = useState<Foco>(() => {
    const f = inicial.get("foco");
    return f === "todas" || f === "sem-patrocinador" ? f : "atencao";
  });
  const [aba, setAba] = useState<"pecas" | "books">(() => (inicial.get("aba") === "books" ? "books" : "pecas"));
  const [eventoFiltro, setEventoFiltro] = useState<string[]>(() => lerCsv(inicial, "evento"));
  const [patrocinadorFiltro, setPatrocinadorFiltro] = useState<string[]>(() => lerCsv(inicial, "patrocinador"));
  const [buscaInput, setBuscaInput] = useState(() => inicial.get("busca") ?? "");
  const [busca, setBusca] = useState(buscaInput);
  const [pagina, setPagina] = useState(() => Math.max(0, parseInt(inicial.get("pagina") ?? "0", 10) || 0));
  const [comparando, setComparando] = useState<Peca | null>(null);

  useEffect(() => {
    const t = setTimeout(() => { setBusca(buscaInput); setPagina(0); }, 250);
    return () => clearTimeout(t);
  }, [buscaInput]);

  const parametros = useMemo(() => {
    const p = new URLSearchParams();
    if (foco !== "atencao") p.set("foco", foco);
    if (eventoFiltro.length) p.set("evento", eventoFiltro.join(","));
    if (patrocinadorFiltro.length) p.set("patrocinador", patrocinadorFiltro.join(","));
    if (busca) p.set("busca", busca);
    if (pagina > 0) p.set("pagina", String(pagina));
    return p;
  }, [foco, eventoFiltro, patrocinadorFiltro, busca, pagina]);

  useEffect(() => {
    const p = new URLSearchParams(parametros);
    if (aba === "books") p.set("aba", "books");
    const qs = p.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [parametros, aba]);

  const url = `/api/versoes${parametros.toString() ? `?${parametros}` : ""}`;
  const { data, isLoading, isError, isFetching, refetch } = useQuery<Payload>({ queryKey: [url] });

  const resumo = data?.resumo;
  const itens = data?.itens ?? [];
  const books = data?.books ?? [];
  const totalPaginas = data ? Math.max(1, Math.ceil(data.total / data.tamanho)) : 1;

  const filtrosAtivos = (busca ? 1 : 0) + (eventoFiltro.length ? 1 : 0) + (patrocinadorFiltro.length ? 1 : 0);
  const limpar = () => {
    setBuscaInput(""); setBusca(""); setEventoFiltro([]); setPatrocinadorFiltro([]); setPagina(0);
  };
  const trocarFoco = (f: Foco) => { setFoco(f); setPagina(0); setAba("pecas"); };
  const alturaControle = isMobile ? 44 : 36;

  // Blocos por evento, na ordem que o servidor mandou — e, DENTRO do evento,
  // por gravidade (25/08): divergência já produzida primeiro, depois as
  // demais divergências, depois o resto. O sort é estável: dentro do mesmo
  // peso a ordem do servidor continua valendo.
  const blocos = useMemo(() => {
    const out: { eventId: string; eventName: string; pecas: Peca[] }[] = [];
    for (const p of itens) {
      const u = out[out.length - 1];
      if (u && u.eventId === p.eventId) u.pecas.push(p);
      else out.push({ eventId: p.eventId, eventName: p.eventName, pecas: [p] });
    }
    const peso = (p: Peca) => (p.divergente && jaFoiParaGrafica(p.status)) ? 0 : p.divergente ? 1 : 2;
    for (const b of out) b.pecas.sort((a, z) => peso(a) - peso(z));
    return out;
  }, [itens]);

  const totalBooks = books.reduce((s, b) => s + b.books.length, 0);
  const booksDesatualizados = books.reduce((s, e) => s + e.books.filter(b => b.pecasMudaramDepois > 0).length, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", backgroundColor: T.bg }}>
      {/* ══ Cabeçalho ══ */}
      <div style={{ flexShrink: 0, backgroundColor: "#ffffff", borderBottom: `1px solid ${T.border}`, padding: isMobile ? "14px 16px 0" : "20px 32px 0" }}>
        <div style={{ maxWidth: 1600, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: R.lg, backgroundColor: T.accent, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <GitBranch style={{ width: 20, height: 20, color: "#ffffff" }} />
            </div>
            <div style={{ minWidth: 0 }}>
              <h1 data-testid="title-versoes" style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, fontSize: FS.h1, letterSpacing: "-0.03em", color: T.text, margin: 0 }}>
                Versões aprovadas
              </h1>
              <p style={{ fontSize: FS.small, color: T.second, margin: 0 }}>
                Qual versão da arte cada patrocinador aprovou — e se é ela que está indo para a gráfica
              </p>
            </div>
          </div>

          {/* ══ Os três números que são o índice da tela ══ */}
          {resumo && (
            <div data-testid="resumo-versoes" style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, minmax(0, 200px))", gap: 8, margin: "14px 0 0" }}>
              <BotaoResumo
                testId="resumo-divergentes"
                valor={resumo.divergentes}
                rotulo={resumo.divergentes === 1 ? "aprovou outra versão" : "aprovaram outra versão"}
                ajuda="Peças em que alguém aprovou uma arte diferente da que está na peça hoje"
                tom={resumo.divergentes > 0 ? "critico" : "calmo"}
                ativo={foco === "atencao"}
                onClick={() => trocarFoco("atencao")}
              />
              {/* Prazo saiu daqui (decisão do dono, 24/08): cobrar pendência é
                  do Atendimento e da Gestão de Prazos. O que entra no lugar é
                  a pergunta desta tela — decisão que não se amarra a nenhuma
                  versão, que é onde a auditoria trava. */}
              <BotaoResumo
                testId="resumo-indeterminadas"
                valor={resumo.indeterminadas}
                rotulo="com versão indeterminada"
                ajuda="A arte foi trocada no mesmo instante da decisão: não dá para afirmar qual versão o patrocinador decidiu"
                tom={resumo.indeterminadas > 0 ? "alerta" : "calmo"}
                ativo={foco === "atencao"}
                onClick={() => trocarFoco("atencao")}
              />
              <BotaoResumo
                testId="resumo-historico"
                valor={resumo.comHistorico}
                rotulo={resumo.comHistorico === 1 ? "peça com mais de uma versão" : "peças com mais de uma versão"}
                ajuda="Só nelas existe o que comparar"
                tom="calmo"
                ativo={foco === "atencao"}
                onClick={() => trocarFoco("atencao")}
              />
              <BotaoResumo
                testId="resumo-books"
                valor={booksDesatualizados}
                rotulo={booksDesatualizados === 1 ? "book desatualizado" : "books desatualizados"}
                ajuda="Books publicados antes de alguma peça mudar de versão"
                tom={booksDesatualizados > 0 ? "alerta" : "calmo"}
                ativo={aba === "books"}
                onClick={() => setAba("books")}
              />
            </div>
          )}

          {/* A FRASE DE CONFIANÇA: o que é registro e o que é dedução. */}
          {resumo && resumo.decisoesTomadas > 0 && (
            <p data-testid="text-confianca-versoes" style={{ fontSize: FS.body, color: "#57534e", margin: "12px 0 0", lineHeight: 1.5 }}>
              {resumo.decisoesTomadas} {resumo.decisoesTomadas === 1 ? "decisão já tomada" : "decisões já tomadas"} no recorte
              {resumo.decisoesInferidas > 0
                ? <> · <strong style={{ color: "#9a3412" }}>{resumo.decisoesInferidas}</strong> com a versão <strong style={{ color: "#9a3412" }}>inferida pela data</strong>, porque são anteriores ao registro</>
                : <> · todas com a versão registrada</>}
              {resumo.decisoesAmbiguas > 0 && <> · {resumo.decisoesAmbiguas} <strong style={{ color: "#9a3412" }}>indeterminadas</strong> (a arte mudou no mesmo instante da decisão)</>}
              {data?.registroDesde && <> · o registro de versões começa em {fmtDia(data.registroDesde)}</>}
            </p>
          )}

          {/* ══ Abas ══ */}
          <div role="tablist" aria-label="O que ver" style={{ display: "flex", flexWrap: "wrap", gap: 2, backgroundColor: T.low, borderRadius: R.md, padding: 3, margin: "14px 0", width: "fit-content", maxWidth: "100%" }}>
            {([
              ["atencao", `Precisa de atenção${resumo ? ` (${resumo.atencao})` : ""}`, "pecas"],
              ["todas", `Todas as peças${resumo ? ` (${resumo.total})` : ""}`, "pecas"],
              ["sem-patrocinador", `Sem patrocinador${resumo ? ` (${resumo.semPatrocinador})` : ""}`, "pecas"],
              ["books", `Books (${totalBooks})`, "books"],
            ] as const).map(([valor, rotulo, destino]) => {
              const ativo = destino === "books" ? aba === "books" : aba === "pecas" && foco === valor;
              return (
                <button key={valor} type="button" role="tab" aria-selected={ativo} data-testid={`tab-versoes-${valor}`}
                  onClick={() => (destino === "books" ? setAba("books") : trocarFoco(valor as Foco))}
                  style={{
                    height: isMobile ? 38 : 30, padding: "0 12px", borderRadius: R.sm, border: "none",
                    fontSize: FS.body, fontWeight: 700, color: ativo ? T.text : "#57534e",
                    backgroundColor: ativo ? "#ffffff" : "transparent", boxShadow: ativo ? SHADOW.sm : "none",
                    cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
                  }}>
                  {rotulo}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ══ Filtros ══ */}
      <div style={{ flexShrink: 0, backgroundColor: "#ffffff", borderBottom: `1px solid ${T.border}`, padding: isMobile ? "10px 16px" : "10px 32px" }}>
        <div style={{ maxWidth: 1600, margin: "0 auto", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <FilterSelect label="Evento" allLabel="Todos os eventos" values={eventoFiltro}
            onValuesChange={v => { setEventoFiltro(v); setPagina(0); }}
            options={data?.facetas.eventos ?? []} searchPlaceholder="Buscar evento..." emptyText="Nenhum evento" testId="filter-versoes-evento" />
          <FilterSelect label="Patrocinador" allLabel="Todos os patrocinadores" values={patrocinadorFiltro}
            onValuesChange={v => { setPatrocinadorFiltro(v); setPagina(0); }}
            options={data?.facetas.patrocinadores ?? []} searchPlaceholder="Buscar patrocinador..." emptyText="Nenhum patrocinador" testId="filter-versoes-patrocinador" />

          <div style={{ position: "relative", width: isMobile ? "100%" : 280 }}>
            <Search style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", width: 13, height: 13, color: T.muted, pointerEvents: "none" }} />
            <input value={buscaInput} onChange={e => setBuscaInput(e.target.value)} placeholder="Peça, tipo ou evento…" aria-label="Buscar" data-testid="input-busca-versoes"
              style={{ width: "100%", height: alturaControle, paddingLeft: 32, paddingRight: 12, border: `1px solid ${T.border}`, borderRadius: R.pill, backgroundColor: "#ffffff", fontSize: FS.body, color: T.text, fontFamily: "inherit" }} />
          </div>

          {filtrosAtivos > 0 && (
            <button type="button" onClick={limpar} data-testid="button-limpar-versoes"
              style={{ height: alturaControle, padding: "0 12px", borderRadius: R.md, border: "1px solid #fecaca", backgroundColor: "#fef2f2", color: "#b91c1c", fontSize: FS.small, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5 }}>
              <X style={{ width: 12, height: 12 }} /> Limpar ({filtrosAtivos})
            </button>
          )}

          {/* Exporta o RECORTE inteiro, não a página à vista. */}
          <a href={`/api/versoes/export.csv${parametros.toString() ? `?${parametros}` : ""}`} data-testid="link-exportar-versoes"
            title="Baixar o recorte inteiro em CSV (abre no Excel)"
            style={{ marginLeft: isMobile ? 0 : "auto", height: alturaControle, padding: "0 12px", borderRadius: R.md, border: `1px solid ${T.border}`, backgroundColor: "#ffffff", color: T.text, fontSize: FS.small, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Table2 style={{ width: 13, height: 13 }} /> Exportar
          </a>
        </div>
      </div>

      {/* ══ Corpo ══ */}
      <div style={{ flex: "1 1 auto", minHeight: 0, overflowY: "auto", padding: isMobile ? 12 : "20px 32px" }}>
        <div style={{ maxWidth: 1600, margin: "0 auto" }}>
          <p aria-live="polite" className="sr-only" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0,0,0,0)", whiteSpace: "nowrap" }}>
            {isLoading ? "Carregando" : aba === "books" ? `${totalBooks} books` : `${data?.total ?? 0} peças no recorte`}
          </p>

          {isLoading ? (
            <Esqueleto isMobile={isMobile} />
          ) : isError ? (
            <div role="alert" style={{ padding: "60px 24px", textAlign: "center" }}>
              <h3 style={{ color: "#b91c1c", fontSize: FS.strong, fontWeight: 700, margin: "0 0 6px" }}>Não foi possível carregar as versões</h3>
              <p style={{ color: T.second, fontSize: FS.body, margin: "0 0 14px" }}>A conexão falhou ou a sessão expirou.</p>
              <button onClick={() => refetch()} data-testid="button-retry-versoes"
                style={{ fontSize: FS.body, fontWeight: 700, color: "#fff", background: T.dark, border: "none", borderRadius: R.md, padding: "9px 20px", cursor: "pointer" }}>
                Tentar novamente
              </button>
            </div>
          ) : aba === "books" ? (
            <AbaBooks eventos={books} isMobile={isMobile} alturaControle={alturaControle} podeAvisar={podeAvisar} podeRepublicar={podeRepublicar} />
          ) : itens.length === 0 ? (
            <div style={{ padding: "56px 24px", textAlign: "center" }}>
              <p style={{ color: T.text, fontSize: FS.strong, fontWeight: 700, margin: "0 0 6px" }}>
                {foco === "atencao" ? "Nada precisa de atenção neste recorte" : "Nenhuma peça neste recorte"}
              </p>
              <p style={{ color: T.second, fontSize: FS.body, margin: "0 0 14px", maxWidth: 460, marginLeft: "auto", marginRight: "auto" }}>
                {foco === "atencao"
                  ? "Ninguém aprovou uma versão diferente da atual, não há decisão parada há mais de uma semana e nenhuma peça tem arte indeterminada. É o que se espera."
                  : "Ajuste os filtros para encontrar a peça."}
              </p>
              {foco === "atencao" && (
                <button onClick={() => trocarFoco("todas")} data-testid="button-ver-todas"
                  style={{ fontSize: FS.body, fontWeight: 700, color: "#fff", background: T.dark, border: "none", borderRadius: R.md, padding: "9px 20px", cursor: "pointer" }}>
                  Ver todas as peças
                </button>
              )}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 18, opacity: isFetching ? 0.65 : 1, transition: "opacity 0.15s" }}>
              {blocos.map(bloco => (
                <section key={bloco.eventId}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                    <Link href={`/eventos/${bloco.eventId}`} style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: FS.strong, fontWeight: 700, color: T.text, textDecoration: "none", textTransform: "uppercase", letterSpacing: "-0.01em" }}>
                      {bloco.eventName}
                    </Link>
                    <div style={{ flex: 1, height: 1, backgroundColor: T.border }} />
                    <span style={{ fontSize: FS.micro, fontWeight: 700, color: T.second, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                      {bloco.pecas.length} {bloco.pecas.length === 1 ? "peça" : "peças"}
                    </span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {bloco.pecas.map(p => (
                      <CartaoDaPeca key={p.id} p={p} isMobile={isMobile} onComparar={() => setComparando(p)} />
                    ))}
                  </div>
                </section>
              ))}

              {totalPaginas > 1 && (
                <nav aria-label="Páginas" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "8px 0 4px" }}>
                  <button type="button" disabled={pagina === 0} onClick={() => setPagina(p => Math.max(0, p - 1))} data-testid="button-pagina-anterior"
                    style={botaoPagina(pagina === 0, alturaControle)}>
                    <ChevronLeft style={{ width: 14, height: 14 }} /> Anterior
                  </button>
                  <span data-testid="text-pagina" style={{ ...numero, fontSize: FS.small, color: T.second }}>
                    Página {pagina + 1} de {totalPaginas} · {data?.total ?? 0} peças
                  </span>
                  <button type="button" disabled={pagina + 1 >= totalPaginas} onClick={() => setPagina(p => p + 1)} data-testid="button-pagina-proxima"
                    style={botaoPagina(pagina + 1 >= totalPaginas, alturaControle)}>
                    Próxima <ChevronRight style={{ width: 14, height: 14 }} />
                  </button>
                </nav>
              )}
            </div>
          )}
        </div>
      </div>

      <Comparador peca={comparando} onClose={() => setComparando(null)} isMobile={isMobile} />
    </div>
  );
}

const botaoPagina = (desativado: boolean, altura: number): React.CSSProperties => ({
  height: altura, padding: "0 14px", borderRadius: R.md, border: `1px solid ${T.border}`,
  backgroundColor: "#ffffff", color: desativado ? T.muted : T.text, fontSize: FS.small, fontWeight: 700,
  cursor: desativado ? "default" : "pointer", opacity: desativado ? 0.5 : 1,
  display: "inline-flex", alignItems: "center", gap: 5, fontFamily: "inherit",
});

/** Um dos números do cabeçalho: valor grande, rótulo curto, clique que filtra. */
function BotaoResumo({ valor, rotulo, ajuda, tom, ativo, onClick, testId }: {
  valor: number; rotulo: string; ajuda: string;
  tom: "critico" | "alerta" | "calmo"; ativo: boolean; onClick: () => void; testId: string;
}) {
  // #b91c1c/#b45309 sobre branco passam de 4.5:1; o calmo usa o cinza do texto.
  const cor = valor === 0 ? T.second : tom === "critico" ? "#b91c1c" : tom === "alerta" ? "#b45309" : T.text;
  return (
    <button type="button" onClick={onClick} data-testid={testId} title={ajuda}
      style={{
        textAlign: "left", padding: "9px 12px", borderRadius: R.md, cursor: "pointer", fontFamily: "inherit",
        // A MESMA superfície nos quatro (25/08): card sem borda parecia
        // elemento não renderizado. O que marca a aba corrente é o FUNDO.
        border: `1px solid ${T.border}`,
        backgroundColor: ativo ? "#fafaf9" : "#ffffff",
        display: "flex", flexDirection: "column", gap: 1, minWidth: 0,
      }}>
      <span style={{ ...numero, fontSize: 22, fontWeight: 800, color: cor, lineHeight: 1.1 }}>{valor}</span>
      <span style={{ fontSize: FS.small, color: T.second, lineHeight: 1.3 }}>{rotulo}</span>
    </button>
  );
}

function Esqueleto({ isMobile }: { isMobile: boolean }) {
  return (
    <div data-testid="skeleton-versoes" aria-hidden="true" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {[0, 1, 2, 3].map(i => (
        <div key={i} style={{ backgroundColor: "#ffffff", border: `1px solid ${T.border}`, borderRadius: R.lg, padding: isMobile ? 12 : "14px 18px" }}>
          <div style={{ height: 13, width: 220, backgroundColor: T.low, borderRadius: 4, marginBottom: 12 }} />
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <div style={{ height: 44, width: 44, backgroundColor: T.low, borderRadius: R.md }} />
            <div style={{ flex: 1, maxWidth: 320, height: 44, backgroundColor: T.low, borderRadius: R.md }} />
          </div>
          <div style={{ height: 30, backgroundColor: T.low, borderRadius: R.md }} />
        </div>
      ))}
    </div>
  );
}

/** Um cartão por peça: a decisão em primeiro plano; a régua só cresce quando há o que comparar. */
function CartaoDaPeca({ p, isMobile, onComparar }: { p: Peca; isMobile: boolean; onComparar: () => void }) {
  const varias = p.versoes.length > 1;
  const g = gravidadeDe(p.status);
  const gv = GRAVIDADE_VISUAL[g];
  const impressaErrada = p.divergente && jaFoiParaGrafica(p.status);

  return (
    <article data-testid={`versoes-peca-${p.id}`}
      style={{
        backgroundColor: "#ffffff",
        // A borda sobe de tom quando o erro já saiu do papel.
        border: `1px solid ${impressaErrada ? "#fca5a5" : p.divergente ? "#fecaca" : T.border}`,
        borderRadius: R.lg, boxShadow: SHADOW.sm, padding: isMobile ? 12 : "14px 18px",
      }}>

      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <Link href={`/eventos/${p.eventId}?item=${p.id}`} data-testid={`link-peca-${p.id}`}
          style={{ fontFamily: MONO, fontSize: FS.body, fontWeight: 700, color: T.accentText, textDecoration: "none" }}>
          {p.displayId}
        </Link>
        <span style={{ fontSize: FS.body, fontWeight: 700, color: T.text }}>{p.type}</span>
        {p.description && (
          <span style={{ fontSize: FS.body, color: "#57534e", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.description}</span>
        )}
        <span style={{ marginLeft: "auto", display: "inline-flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {/* ONDE A PEÇA ESTÁ — vem antes dos selos de exceção porque é ele
              que diz o tamanho do problema que vem em seguida. */}
          <span data-testid={`selo-status-${p.id}`} title={gv.consequencia}
            style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: FS.micro, fontWeight: 700, color: gv.cor, backgroundColor: gv.fundo, border: `1px solid ${gv.borda}`, borderRadius: R.sm, padding: "1px 7px", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>
            <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: gv.cor, flexShrink: 0 }} />
            {gv.rotulo}
          </span>

          {/* Dois problemas com nomes diferentes porque são dois problemas. */}
          {impressaErrada ? (
            <span data-testid={`selo-divergente-${p.id}`}
              title="A arte que já foi para a gráfica não é a que o patrocinador aprovou"
              style={{ fontSize: FS.micro, fontWeight: 800, color: "#ffffff", backgroundColor: "#b91c1c", border: "1px solid #b91c1c", borderRadius: R.sm, padding: "1px 7px", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>
              produzida na versão errada
            </span>
          ) : p.divergente ? (
            <Selo testId={`selo-divergente-${p.id}`} cor="#b91c1c" fundo="#fef2f2" borda="#fecaca"
              titulo="Alguém aprovou uma arte diferente da que está na peça hoje">aprovou outra versão</Selo>
          ) : null}


        </span>
      </div>

      {/* ── A régua de versões ── */}
      {varias ? (
        <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, marginBottom: 10 }}>
          {p.versoes.map((v, i) => {
            const atual = v.thumbUrl === p.approvalThumbUrl;
            return (
              <button key={`${v.thumbUrl}-${i}`} type="button" onClick={onComparar} data-testid={`versao-${p.id}-${i + 1}`}
                title={`v${i + 1} · ${ORIGEM_LABEL[v.origem]} · ${fmtData(v.em)}${v.por ? ` · ${v.por}` : ""}${v.inferida ? " · reconstruída, não gravada" : ""} — clique para comparar`}
                style={{
                  flexShrink: 0, width: 116, padding: 0, textAlign: "left", cursor: "pointer", fontFamily: "inherit",
                  border: `1px solid ${atual ? "#fed7aa" : T.border}`, borderRadius: R.md, overflow: "hidden",
                  backgroundColor: atual ? "#fff7ed" : "#fafaf9",
                }}>
                <span style={{ display: "block", height: 72, backgroundColor: "#ffffff" }}>
                  {isWebUrl(v.thumbUrl)
                    ? <img src={v.thumbUrl} alt="" loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
                        onError={e => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }} />
                    : <span style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", fontSize: FS.micro, color: T.second }}>sem prévia</span>}
                </span>
                <span style={{ display: "block", padding: "5px 8px" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: FS.small, fontWeight: 800, color: atual ? "#9a3412" : T.text }}>
                    v{i + 1}
                    {atual && <span style={{ fontSize: FS.micro, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>· atual</span>}
                    {v.inferida && <AlertTriangle aria-hidden="true" style={{ width: 10, height: 10, color: "#b45309", marginLeft: "auto" }} />}
                  </span>
                  <span style={{ display: "block", ...numero, fontSize: FS.micro, color: T.second }}>{fmtData(v.em)}</span>
                </span>
              </button>
            );
          })}
          <button type="button" onClick={onComparar} data-testid={`button-comparar-${p.id}`}
            style={{ flexShrink: 0, width: 92, borderRadius: R.md, border: `1px dashed ${T.border}`, backgroundColor: "#ffffff", cursor: "pointer", fontFamily: "inherit", color: T.accentText, fontSize: FS.small, fontWeight: 700, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4 }}>
            <Layers style={{ width: 15, height: 15 }} />
            Comparar
          </button>
        </div>
      ) : (
        // Uma versão só (96% dos casos): uma linha discreta em vez de uma
        // galeria — a área do cartão volta para a decisão, que é o assunto.
        <div data-testid={`versao-unica-${p.id}`} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          {isWebUrl(p.versoes[0]?.thumbUrl ?? "") ? (
            <a href={p.versoes[0].thumbUrl} target="_blank" rel="noopener noreferrer" title="Abrir a arte" style={{ display: "block", width: 40, height: 30, border: `1px solid ${T.border}`, borderRadius: R.sm, overflow: "hidden", flexShrink: 0, backgroundColor: "#fff" }}>
              <img src={p.versoes[0].thumbUrl} alt="" loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
                onError={e => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }} />
            </a>
          ) : (
            <span aria-hidden="true" style={{ width: 40, height: 30, border: `1px dashed ${T.border}`, borderRadius: R.sm, flexShrink: 0 }} />
          )}
          <span style={{ fontSize: FS.small, color: T.second }}>
            {p.versoes.length === 0 ? "Nenhuma arte registrada" : <>Versão única · {fmtData(p.versoes[0].em)}{p.versoes[0].inferida ? " · reconstruída" : ""}</>}
          </span>
        </div>
      )}

      {/* ── O que fazer a respeito ── */}
      <FaixaDeResolucao p={p} isMobile={isMobile} />

      {/* ── A decisão de cada patrocinador ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {p.decisoes.length === 0 && <span style={{ fontSize: FS.small, color: T.second }}>Sem patrocinador em aprovação.</span>}
        {p.decisoes.map(d => <LinhaDaDecisao key={d.sponsorId} d={d} pecaId={p.id} />)}
      </div>
    </article>
  );
}
// ─────────────────────────────────────────────────────────────────────────────
// A FAIXA DO ACHADO — o que esta peça tem de errado, em uma frase.
//
// Ela nasceu com botões de ação (voltar a arte, pedir aprovação de novo) e o
// dono cortou os dois, com razão: esta tela AUDITA. Quem troca a arte é a
// Arte; quem reabre uma aprovação é o Atendimento — nas telas em que essas
// ações têm contexto, permissão e histórico. Um painel de auditoria que
// também executa é um painel em que ninguém confia para só olhar.
//
// O que fica é a frase, montada com os DADOS (nome do patrocinador, número
// da versão, data), e o caminho para a peça. A gravidade vem do status: a
// mesma divergência é conserto barato antes da gráfica e material impresso
// errado depois dela.
// ─────────────────────────────────────────────────────────────────────────────
function FaixaDeResolucao({ p, isMobile }: { p: Peca; isMobile: boolean }) {
  const divergente = p.decisoes.find(d => d.divergente);
  const ambigua = p.decisoes.find(d => d.ambiguo);
  if (!divergente && !ambigua) return null;

  const versaoAtual = p.versoes.findIndex(v => v.thumbUrl === p.approvalThumbUrl) + 1;
  const naGrafica = jaFoiParaGrafica(p.status);
  const entregue = gravidadeDe(p.status) === "impressa";

  let tom: { barra: string; fundo: string; texto: string };
  let frase: string;
  let detalhe: string;

  if (divergente) {
    const vDele = divergente.versao ? `a v${divergente.versao}` : "uma versão anterior";
    const vAgora = versaoAtual > 0 ? `v${versaoAtual}` : "a atual";
    if (naGrafica) {
      // #7f1d1d sobre #fef2f2 = 8,9:1
      tom = { barra: "#dc2626", fundo: "#fef2f2", texto: "#7f1d1d" };
      frase = `A peça está ${entregue ? "produzida" : "em produção"} com uma arte que ${divergente.nome} não aprovou`;
      detalhe = `Aprovou ${vDele}${divergente.decididoEm ? ` em ${fmtData(divergente.decididoEm)}` : ""}; a arte foi trocada depois, para a ${vAgora}. `;
      detalhe += entregue
        ? "Confira o registro de entrega antes de decidir o que fazer."
        : "Dá para parar a produção enquanto ainda há tempo.";
    } else {
      // #78350f sobre #fffbeb = 9,4:1
      tom = { barra: "#f59e0b", fundo: "#fffbeb", texto: "#78350f" };
      frase = `${divergente.nome} aprovou ${vDele}, e a peça está na ${vAgora}`;
      detalhe = `Aprovou${divergente.decididoEm ? ` em ${fmtData(divergente.decididoEm)}` : ""}, e a arte foi trocada depois. Ainda dá para acertar antes da gráfica.`;
    }
  } else {
    tom = { barra: "#f59e0b", fundo: "#fffbeb", texto: "#78350f" };
    frase = `Não dá para afirmar qual versão ${ambigua!.nome} decidiu`;
    detalhe = "A arte foi trocada no mesmo instante da decisão. A trilha da peça mostra a ordem exata dos dois registros.";
  }

  return (
    <div data-testid={`faixa-resolucao-${p.id}`}
      style={{ display: "flex", gap: 10, alignItems: "flex-start", backgroundColor: tom.fundo, borderRadius: R.md, padding: "10px 12px", marginBottom: 10, borderLeft: `3px solid ${tom.barra}` }}>
      <MessageSquareWarning aria-hidden="true" style={{ width: 15, height: 15, color: tom.barra, flexShrink: 0, marginTop: 1 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: tom.texto, lineHeight: 1.35 }}>{frase}</p>
        <p style={{ margin: "3px 0 0", fontSize: 11, color: tom.texto, opacity: 0.85, lineHeight: 1.45 }}>{detalhe}</p>
      </div>
      {/* O caminho para onde a coisa se resolve — a peça, no evento. */}
      <Link href={`/eventos/${p.eventId}?item=${p.id}`}
        data-testid={`link-abrir-peca-${p.id}`}
        title="Abrir a peça no evento, onde a Arte troca a arte e o Atendimento reabre a aprovação"
        style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 5, height: isMobile ? 44 : 30, padding: "0 12px", borderRadius: R.md, border: `1px solid ${tom.barra}33`, backgroundColor: "#ffffff", color: tom.texto, fontSize: FS.small, fontWeight: 700, textDecoration: "none", whiteSpace: "nowrap" }}>
        <ExternalLink style={{ width: 13, height: 13 }} /> Abrir a peça
      </Link>
    </div>
  );
}

function Selo({ children, cor, fundo, borda, titulo, testId }: {
  children: React.ReactNode; cor: string; fundo: string; borda: string; titulo: string; testId?: string;
}) {
  return (
    <span data-testid={testId} title={titulo}
      style={{ fontSize: FS.micro, fontWeight: 700, color: cor, backgroundColor: fundo, border: `1px solid ${borda}`, borderRadius: R.sm, padding: "1px 7px", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}

const PREFIXO_REVOGACAO = "Aprovação revogada automaticamente";

function LinhaDaDecisao({ d, pecaId }: { d: Decisao; pecaId: string }) {
  const meta = getApprovalMeta(d.status);
  const tone = meta?.tone;
  const revogada = (d.motivo ?? "").startsWith(PREFIXO_REVOGACAO);
  const Icone = tone === "approved" ? Check : tone === "waiting" ? Clock : AlertTriangle;
  const versaoTexto = d.ambiguo ? "uma versão indeterminada" : d.versao ? `a v${d.versao}` : "uma versão";
  const frase = tone === "approved" ? `aprovou ${versaoTexto}`
    : revogada ? `teve a aprovação revogada${d.versao ? ` (tinha aprovado a v${d.versao})` : ""}`
    : tone === "waiting" ? "aguardando"
    : `reprovou ${versaoTexto}`;
  // A revogação automática já é explicada pela frase; repetir o texto inteiro
  // entre aspas só duplicava a leitura. Fica a parte que informa.
  const motivo = !d.motivo ? null
    : revogada ? d.motivo.slice(PREFIXO_REVOGACAO.length).replace(/^:\s*/, "")
    : `"${d.motivo}"`;

  return (
    <div data-testid={`decisao-${pecaId}-${d.sponsorId}`}
      style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "6px 10px", borderRadius: R.md, backgroundColor: meta?.bg ?? T.low, border: `1px solid ${meta?.border ?? T.border}` }}>
      <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: d.cor ?? T.muted, flexShrink: 0 }} />
      <span style={{ fontSize: FS.body, fontWeight: 700, color: T.text }}>{d.nome}</span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: FS.small, fontWeight: 700, color: meta?.text ?? "#57534e" }}>
        <Icone aria-hidden="true" style={{ width: 11, height: 11 }} /> {frase}
      </span>
      {d.decididoEm && <span style={{ ...numero, fontSize: FS.small, color: T.second }}>{fmtData(d.decididoEm)}</span>}
      {d.por && <span style={{ fontSize: FS.small, color: T.second }}>por {d.por}</span>}

      {d.ambiguo && (
        /* #92400e sobre #fffbeb = 6,6:1 */
        <Selo testId={`selo-indeterminada-${pecaId}-${d.sponsorId}`} cor="#92400e" fundo="#fffbeb" borda="#fde68a"
          titulo="A arte foi trocada no mesmo instante da decisão: não dá para afirmar qual versão foi decidida">
          versão indeterminada
        </Selo>
      )}
      {d.divergente && (
        <Selo testId={`selo-divergiu-${pecaId}-${d.sponsorId}`} cor="#b91c1c" fundo="#fef2f2" borda="#fecaca"
          titulo="O que este patrocinador aprovou não é a arte que está na peça agora">
          ≠ arte atual
        </Selo>
      )}
      {motivo && <span style={{ fontSize: FS.small, color: "#57534e", width: "100%" }}>{motivo}</span>}
      {d.thumbUrl && isWebUrl(d.thumbUrl) && (
        <a href={d.thumbUrl} target="_blank" rel="noopener noreferrer" title="Abrir a versão decidida"
          data-testid={`link-versao-decidida-${pecaId}-${d.sponsorId}`}
          style={{ marginLeft: "auto", display: "inline-flex", color: T.second }}>
          <ExternalLink style={{ width: 13, height: 13 }} />
        </a>
      )}
    </div>
  );
}

/**
 * COMPARADOR — as versões da peça no mesmo lugar.
 *
 * Nasceu alternando uma por vez com ←/→, e isso resolve o caso grosseiro (a
 * arte mudou inteira). Não resolve o caso típico: um logo que mudou de tamanho
 * entre duas artes quase idênticas — alternar depende da memória, e a memória
 * não pega diferença de dois milímetros. Por isso o modo LADO A LADO, em que a
 * direita é sempre a arte que está na peça HOJE: a pergunta da tela não é
 * "como eram as versões", é "o que está indo para a gráfica bate com o que foi
 * aprovado".
 *
 * No celular os dois painéis empilhariam e o modo perderia o sentido — lá fica
 * só "uma por vez".
 */
function Comparador({ peca, onClose, isMobile }: { peca: Peca | null; onClose: () => void; isMobile: boolean }) {
  const [indice, setIndice] = useState(0);
  const [modo, setModo] = useState<"uma" | "lado">("uma");
  const total = peca?.versoes.length ?? 0;
  const aberto = !!peca && total > 0;
  const anterior = useCallback(() => setIndice(i => (i - 1 + total) % total), [total]);
  const proxima = useCallback(() => setIndice(i => (i + 1) % total), [total]);
  const jaAbriu = useRef(false);

  useEffect(() => {
    if (aberto && !jaAbriu.current) {
      // Abre na versão ATUAL: é dela que a pessoa quer se afastar para trás.
      const i = peca!.versoes.findIndex(v => v.thumbUrl === peca!.approvalThumbUrl);
      setIndice(i >= 0 ? i : total - 1);
      jaAbriu.current = true;
    }
    if (!aberto) { jaAbriu.current = false; setModo("uma"); }
  }, [aberto, peca, total]);

  useEffect(() => {
    if (!aberto) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") { e.preventDefault(); anterior(); }
      if (e.key === "ArrowRight") { e.preventDefault(); proxima(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [aberto, anterior, proxima]);

  const versoes = peca?.versoes ?? [];
  const iAtual = versoes.findIndex(v => v.thumbUrl === peca?.approvalThumbUrl);
  // Comparar a atual com ela mesma não diz nada: quando o foco JÁ é a atual,
  // a esquerda mostra a anterior.
  const iEsquerda = modo === "lado" && indice === iAtual && total > 1
    ? (indice - 1 + total) % total
    : indice;
  const iDireita = iAtual >= 0 ? iAtual : total - 1;
  const v = versoes[modo === "lado" ? iEsquerda : indice];
  const decisoesDaVersao = (peca?.decisoes ?? []).filter(d => d.thumbUrl === v?.thumbUrl && d.decididoEm);
  const ladoALado = modo === "lado" && !isMobile && total > 1;

  const quemAprovou = (indiceDaVersao: number) => {
    const url = versoes[indiceDaVersao]?.thumbUrl;
    const nomes = (peca?.decisoes ?? [])
      .filter(d => d.thumbUrl === url && d.status === "approved")
      .map(d => d.nome);
    if (nomes.length === 0) return "Nenhuma aprovação nesta versão";
    return `${nomes.join(", ")} aprovou esta`;
  };

  return (
    <Dialog open={aberto} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className={`${HIDE_NATIVE_CLOSE} p-0 gap-0`} style={modalSurface(ladoALado ? 1040 : 920)}>
        {/* Congelado enquanto sai — a lição do #185 (ver popover-congelado.test.ts). */}
        <FreezeWhileClosing open={aberto}>
          <DialogTitle className="sr-only">Comparar versões da peça {peca?.displayId}</DialogTitle>
          <DialogDescription className="sr-only">Use as setas do teclado para alternar entre as versões.</DialogDescription>
          <ModalHeader
            icon={Layers}
            title={`Versões de ${peca?.displayId ?? ""}`}
            subtitle={peca ? `${peca.type}${peca.description ? ` · ${peca.description}` : ""} · ${total} ${total === 1 ? "versão" : "versões"}` : ""}
            tint="#ea580c"
            onClose={onClose}
          />
          <div style={{ flex: "1 1 auto", minHeight: 0, overflowY: "auto", padding: isMobile ? 12 : 18, display: "flex", flexDirection: isMobile ? "column" : "row", gap: 16 }}>
            <div style={{ flex: "1 1 auto", minWidth: 0 }}>

              {/* Como olhar. Some no celular, onde os painéis empilhariam. */}
              {!isMobile && total > 1 && (
                <div role="tablist" aria-label="Modo de comparação" data-testid="segmented-modo-comparador"
                  style={{ display: "inline-flex", backgroundColor: "#f3f4f3", borderRadius: R.md, padding: 3, gap: 2, marginBottom: 10 }}>
                  {([["uma", "Uma por vez", Square], ["lado", "Lado a lado", Columns2]] as const).map(([valor, rotulo, Icone]) => {
                    const ativo = modo === valor;
                    return (
                      <button key={valor} type="button" role="tab" aria-selected={ativo} data-testid={`button-modo-${valor}`}
                        onClick={() => setModo(valor)}
                        style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 30, padding: "0 12px", borderRadius: R.sm, border: "none", fontSize: FS.small, fontWeight: 700, fontFamily: "inherit", cursor: "pointer", color: ativo ? T.text : "#57534e", backgroundColor: ativo ? "#ffffff" : "transparent", boxShadow: ativo ? "0 1px 2px rgba(28,25,23,0.06)" : "none" }}>
                        <Icone style={{ width: 13, height: 13 }} /> {rotulo}
                      </button>
                    );
                  })}
                </div>
              )}

              {ladoALado ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  {([[iEsquerda, "esquerda"], [iDireita, "direita"]] as const).map(([idx, lado]) => {
                    const versao = versoes[idx];
                    const ehAtual = idx === iAtual;
                    return (
                      <div key={lado} data-testid={`painel-lado-${lado}`}
                        style={{ border: `1px solid ${ehAtual ? "#fed7aa" : T.border}`, borderRadius: R.lg, overflow: "hidden", backgroundColor: "#fafaf9" }}>
                        <div style={{ padding: "8px 10px", backgroundColor: ehAtual ? "#fff7ed" : "#ffffff", borderBottom: `1px solid ${ehAtual ? "#fed7aa" : T.low}` }}>
                          <p style={{ margin: 0, fontSize: FS.body, fontWeight: 800, color: ehAtual ? "#9a3412" : T.text }}>
                            v{idx + 1}{ehAtual ? " · atual" : ""}
                          </p>
                          <p style={{ margin: "1px 0 0", ...numero, fontSize: FS.micro, color: T.second }}>{fmtData(versao?.em ?? null)}</p>
                        </div>
                        <div style={{ height: isMobile ? 220 : 340, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#ffffff" }}>
                          {versao && isWebUrl(versao.thumbUrl)
                            ? <img src={versao.thumbUrl} alt={`Versão ${idx + 1}`} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "block" }} />
                            : <span style={{ fontSize: FS.small, color: T.second }}>Sem prévia</span>}
                        </div>
                        <p style={{ margin: 0, padding: "7px 10px", fontSize: FS.small, color: "#57534e", borderTop: `1px solid ${T.low}`, backgroundColor: "#ffffff" }}>
                          {quemAprovou(idx)}
                        </p>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ position: "relative", backgroundColor: "#fafaf9", border: `1px solid ${T.border}`, borderRadius: R.lg, height: isMobile ? 260 : 420, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                  {v && isWebUrl(v.thumbUrl)
                    ? <img key={v.thumbUrl} src={v.thumbUrl} alt={`Versão ${indice + 1} de ${peca?.displayId}`} data-testid="img-comparador"
                        style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "block" }} />
                    : <span style={{ fontSize: FS.body, color: T.second }}>Sem prévia para esta versão</span>}
                  {total > 1 && (
                    <>
                      <button type="button" onClick={anterior} aria-label="Versão anterior" data-testid="button-comparador-anterior" style={setaComparador("left")}>
                        <ChevronLeft style={{ width: 18, height: 18 }} />
                      </button>
                      <button type="button" onClick={proxima} aria-label="Próxima versão" data-testid="button-comparador-proxima" style={setaComparador("right")}>
                        <ChevronRight style={{ width: 18, height: 18 }} />
                      </button>
                    </>
                  )}
                </div>
              )}

              <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                {versoes.map((x, i) => {
                  const ativo = i === (ladoALado ? iEsquerda : indice);
                  return (
                    <button key={`${x.thumbUrl}-${i}`} type="button" onClick={() => setIndice(i)} data-testid={`button-comparador-v${i + 1}`}
                      style={{ height: 30, padding: "0 12px", borderRadius: R.md, cursor: "pointer", fontFamily: "inherit", fontSize: FS.small, fontWeight: 700,
                        border: `1px solid ${ativo ? T.dark : T.border}`, backgroundColor: ativo ? T.dark : "#ffffff", color: ativo ? "#ffffff" : T.text }}>
                      v{i + 1}{x.thumbUrl === peca?.approvalThumbUrl ? " · atual" : ""}
                    </button>
                  );
                })}
              </div>
            </div>

            <aside style={{ width: isMobile ? "100%" : 260, flexShrink: 0, display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                <p style={{ margin: 0, fontSize: FS.micro, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: T.second }}>
                  {ladoALado ? "Painel da esquerda" : "Esta versão"}
                </p>
                <p style={{ margin: "4px 0 0", fontSize: FS.body, fontWeight: 700, color: T.text }}>v{(ladoALado ? iEsquerda : indice) + 1} de {total}</p>
                <p style={{ margin: "2px 0 0", ...numero, fontSize: FS.small, color: T.second }}>{fmtData(v?.em ?? null)}</p>
                <p style={{ margin: "2px 0 0", fontSize: FS.small, color: T.second }}>
                  {v ? ORIGEM_LABEL[v.origem] : ""}{v?.por ? ` · ${v.por}` : ""}
                </p>
                {v?.inferida && (
                  <p style={{ margin: "6px 0 0", fontSize: FS.small, color: "#92400e", backgroundColor: "#fffbeb", border: "1px solid #fde68a", borderRadius: R.sm, padding: "5px 8px", lineHeight: 1.4 }}>
                    Reconstruída da trilha — esta versão não foi gravada como versão na época.
                  </p>
                )}
              </div>
              <div>
                <p style={{ margin: 0, fontSize: FS.micro, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: T.second }}>Quem decidiu nela</p>
                {decisoesDaVersao.length === 0 ? (
                  <p style={{ margin: "4px 0 0", fontSize: FS.small, color: T.second }}>Nenhuma decisão registrada nesta versão.</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 6 }}>
                    {decisoesDaVersao.map(d => (
                      <span key={d.sponsorId} data-testid={`comparador-decisao-${d.sponsorId}`} style={{ fontSize: FS.small, color: T.text, display: "flex", alignItems: "center", gap: 6 }}>
                        <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: d.cor ?? T.muted }} />
                        <strong>{d.nome}</strong>
                        {d.status === "approved" ? "aprovou" : "reprovou"} em {fmtData(d.decididoEm)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              {v && isWebUrl(v.thumbUrl) && (
                <a href={v.thumbUrl} target="_blank" rel="noopener noreferrer" data-testid="link-abrir-versao"
                  style={{ marginTop: "auto", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, height: 38, borderRadius: R.md, border: `1px solid ${T.border}`, color: T.text, textDecoration: "none", fontSize: FS.small, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  <ExternalLink style={{ width: 13, height: 13 }} /> Abrir em tamanho real
                </a>
              )}
            </aside>
          </div>
        </FreezeWhileClosing>
      </DialogContent>
    </Dialog>
  );
}
const setaComparador = (lado: "left" | "right"): React.CSSProperties => ({
  position: "absolute", [lado]: 8, top: "50%", transform: "translateY(-50%)",
  width: 36, height: 36, borderRadius: "50%", border: `1px solid ${T.border}`,
  backgroundColor: "rgba(255,255,255,0.92)", color: T.text, cursor: "pointer",
  display: "flex", alignItems: "center", justifyContent: "center",
});

/** Aba de books: cada publicação com estado — em dia ou desatualizada. */
function AbaBooks({ eventos, isMobile, alturaControle, podeAvisar, podeRepublicar }: { eventos: BooksDoEvento[]; isMobile: boolean; alturaControle: number; podeAvisar: boolean; podeRepublicar: boolean }) {
  if (eventos.length === 0) {
    return (
      <div style={{ padding: "56px 24px", textAlign: "center" }}>
        <p style={{ color: T.text, fontSize: FS.strong, fontWeight: 700, margin: "0 0 6px" }}>Nenhum book publicado no recorte</p>
        <p style={{ color: T.second, fontSize: FS.body, margin: 0 }}>O book é publicado pela Arte, na tela de Arte.</p>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {eventos.map(ev => (
        <section key={ev.eventId} data-testid={`books-evento-${ev.eventId}`}
          style={{ backgroundColor: "#ffffff", border: `1px solid ${T.border}`, borderRadius: R.lg, boxShadow: SHADOW.sm, overflow: "hidden" }}>
          <div style={{ padding: "12px 18px", borderBottom: `1px solid ${T.low}`, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <Link href={`/eventos/${ev.eventId}`} style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: FS.strong, fontWeight: 700, color: T.text, textDecoration: "none" }}>{ev.eventName}</Link>
            <span style={{ fontSize: FS.small, color: T.second }}>{ev.books.length} {ev.books.length === 1 ? "publicação" : "publicações"}</span>
          </div>
          <div>
            {ev.books.map((b, i) => (
              <LinhaDoBook key={`${b.bookUrl}-${i}`} b={b} ev={ev} i={i} total={ev.books.length}
                isMobile={isMobile} alturaControle={alturaControle} podeAvisar={podeAvisar} podeRepublicar={podeRepublicar} />
            ))}          </div>
        </section>
      ))}
    </div>
  );
}

/**
 * Reenviar o aviso do book por e-mail.
 *
 * Existe porque o envio passou a deixar rastro: com o desfecho na trilha e
 * na tela, "não chegou" deixou de ser um mistério — e consertar deixou de
 * exigir republicar o book inteiro só para disparar o e-mail de novo.
 */
function BotaoReenviarAviso({ eventId, altura }: { eventId: string; altura: number }) {
  const { toast } = useToast();
  const enviar = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/events/${eventId}/book/notify`, {});
      return await res.json() as { mensagem: string; aviso: { status: string } };
    },
    onSuccess: (d) => toast({
      title: d.aviso?.status === "sent" ? "Aviso reenviado" : "Aviso não enviado",
      description: d.mensagem,
      variant: d.aviso?.status === "sent" ? undefined : "destructive",
    }),
    onError: (e: any) => toast({ title: "Erro ao reenviar", description: e.message, variant: "destructive" }),
  });
  return (
    <button type="button" onClick={() => enviar.mutate()} disabled={enviar.isPending}
      data-testid={`button-reenviar-aviso-${eventId}`}
      title="Reenviar por e-mail o aviso deste book para os responsáveis do evento"
      style={{ display: "inline-flex", alignItems: "center", gap: 6, height: altura, padding: "0 12px", borderRadius: R.md, border: `1px solid ${T.border}`, backgroundColor: "#ffffff", color: T.text, fontSize: FS.small, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", cursor: enviar.isPending ? "default" : "pointer", opacity: enviar.isPending ? 0.6 : 1, fontFamily: "inherit", whiteSpace: "nowrap" }}>
      {enviar.isPending
        ? <Loader2 style={{ width: 13, height: 13 }} className="animate-spin" />
        : <Send style={{ width: 13, height: 13 }} />}
      Reenviar aviso
    </button>
  );
}

/**
 * UMA LINHA DE BOOK — e a resposta para "mudaram quantas? quais?".
 *
 * O selo dizia só o número, e número sem nome não vira ação: para descobrir
 * quais peças mudaram depois da publicação era preciso conferir o book
 * inteiro contra a lista, peça por peça. Agora o selo ABRE a lista, com a
 * data em que cada arte mudou e o caminho para a peça.
 */
function LinhaDoBook({ b, ev, i, total, isMobile, alturaControle, podeAvisar, podeRepublicar }: {
  b: Book; ev: BooksDoEvento; i: number; total: number;
  isMobile: boolean; alturaControle: number; podeAvisar: boolean; podeRepublicar: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const desatualizado = b.pecasMudaramDepois > 0;
  const listadas = b.pecasMudaram.length;
  const escondidas = b.pecasMudaramDepois - listadas;
  // A faixa de resolução só existe no book ATUAL desatualizado — republicar
  // um book antigo não quer dizer nada.
  const mostraFaixa = i === 0 && desatualizado;
  // O aviso do evento só vale para ESTA publicação se veio depois dela; um
  // aviso mais velho que o book fala do book anterior.
  const avisoDoAtual = i === 0 && ev.aviso && (!b.em || ev.aviso.em >= b.em) ? ev.aviso : null;

  return (
    <div data-testid={`book-${ev.eventId}-${i}`}
      style={{ borderBottom: i < total - 1 ? `1px solid ${T.low}` : "none" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 18px", flexWrap: "wrap" }}>
        <span aria-hidden="true" style={{ width: 30, height: 30, borderRadius: R.md, backgroundColor: "#faf5ff", color: "#7e22ce", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <FileText style={{ width: 15, height: 15 }} />
        </span>
        <div style={{ flex: 1, minWidth: 200 }}>
          <p style={{ margin: 0, fontSize: FS.body, fontWeight: 700, color: T.text, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {i === 0 ? "Book atual" : "Publicação anterior"}
            <span style={{ fontWeight: 500, color: T.second }}>{b.itemCount} {b.itemCount === 1 ? "peça" : "peças"}</span>

            {desatualizado ? (
              // O selo é BOTÃO: o número sozinho não dizia o que fazer.
              <button type="button" onClick={() => setAberto(a => !a)}
                data-testid={`selo-book-desatualizado-${ev.eventId}-${i}`}
                aria-expanded={aberto}
                title="Ver quais peças deste book ganharam arte nova depois da publicação"
                style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: FS.micro, fontWeight: 700, color: "#b45309", backgroundColor: "#fffbeb", border: "1px solid #fde68a", borderRadius: R.sm, padding: "2px 8px", textTransform: "uppercase", letterSpacing: "0.04em", cursor: "pointer", fontFamily: "inherit", minHeight: isMobile ? 32 : undefined }}>
                desatualizado · {b.pecasMudaramDepois} de {b.itemCount} {b.pecasMudaramDepois === 1 ? "peça mudou" : "peças mudaram"}
                <ChevronRight aria-hidden="true" style={{ width: 11, height: 11, transform: aberto ? "rotate(90deg)" : "none", transition: "transform 0.15s" }} />
              </button>
            ) : b.membrosConhecidos && b.em && i === 0 ? (
              <Selo testId={`selo-book-em-dia-${ev.eventId}`} cor="#15803d" fundo="#f0fdf4" borda="#bbf7d0"
                titulo="Nenhuma peça deste book ganhou arte nova depois da publicação">em dia</Selo>
            ) : null}
          </p>
          <p style={{ margin: "2px 0 0", fontSize: FS.small, color: T.second }}>
            {b.em ? <>publicado em <span style={numero}>{fmtData(b.em)}</span>{b.por ? ` por ${b.por}` : ""}</>
              : "publicado antes de o registro de books existir — data não gravada"}
            {/* Publicação já substituída não recebe selo de estado NENHUM: a
                associação peça↔book vive em items.book_url, que guarda um
                endereço por peça, então do book antigo sobrou a contagem e não
                a lista. Dizer "em dia" seria afirmar sem base, e um selo
                enigmático é pior que o silêncio — o motivo fica aqui, em
                português, para quem for atrás. */}
            {!b.membrosConhecidos && (
              <span style={{ color: T.muted }}> · esta publicação foi substituída; o sistema guardou quantas peças ela tinha, não quais</span>
            )}
          </p>
          {/* O AVISO DEIXA DE SER CEGO (25/08): antes de reenviar, dá para
              saber se e quando o aviso saiu, e para quantas pessoas. O e-mail
              NÃO tem rastreio de abertura — o registro é do envio, nunca da
              leitura, e a tela não inventa taxa nenhuma. */}
          {i === 0 && (
            <p data-testid={`registro-aviso-${ev.eventId}`}
              title={avisoDoAtual
                ? `Enviado em ${fmtData(avisoDoAtual.em)} para ${avisoDoAtual.pessoas} ${avisoDoAtual.pessoas === 1 ? "destinatário" : "destinatários"}. O e-mail não tem rastreio de abertura — o sistema registra o envio, não a leitura.`
                : ev.aviso
                  ? "O último aviso na trilha é anterior a esta publicação — deste book, ninguém foi avisado ainda."
                  : "O book foi publicado e nenhum aviso por e-mail consta na trilha."}
              style={{ margin: "3px 0 0", fontSize: 11, display: "flex", alignItems: "center", gap: 5, color: avisoDoAtual ? "#15803d" : "#b45309", fontWeight: avisoDoAtual ? 500 : 700 }}>
              <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: avisoDoAtual ? "#15803d" : "#f59e0b", flexShrink: 0 }} />
              {avisoDoAtual
                ? <>aviso enviado <span style={numero}>{fmtData(avisoDoAtual.em)}</span> para {avisoDoAtual.pessoas} {avisoDoAtual.pessoas === 1 ? "pessoa" : "pessoas"}</>
                : "aviso nunca enviado"}
            </p>
          )}
        </div>

        {podeAvisar && i === 0 && <BotaoReenviarAviso eventId={ev.eventId} altura={alturaControle} />}
        {isWebUrl(b.bookUrl) ? (
          <a href={b.bookUrl} download target="_blank" rel="noopener noreferrer" data-testid={`link-baixar-book-${ev.eventId}-${i}`}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, height: alturaControle, padding: "0 14px", borderRadius: R.md, border: `1px solid ${T.border}`, backgroundColor: "#ffffff", color: T.text, fontSize: FS.small, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", textDecoration: "none", whiteSpace: "nowrap" }}>
            <Download style={{ width: 13, height: 13 }} /> Baixar
          </a>
        ) : (
          <span title={b.bookUrl} style={{ fontSize: FS.small, color: T.second, display: "inline-flex", alignItems: "center", gap: 5 }}>
            <HelpCircle style={{ width: 13, height: 13 }} /> arquivo fora do app
          </span>
        )}
      </div>

      {/* ── A FAIXA DE RESOLUÇÃO do book atual (25/08). O selo diz "3 peças
          mudaram" e parava aí; a faixa nomeia as peças e oferece o que fazer.
          O book é o que o patrocinador tem na mão: se a arte mudou depois da
          publicação, ele está decidindo sobre arte velha. Republicar leva ao
          GERADOR de book (/gerar-book), que monta o PDF com a arte atual e
          publica — nenhuma rota nova. #78350f sobre #fffbeb = 9,4:1. */}
      {mostraFaixa && (
        <div data-testid={`faixa-book-${ev.eventId}`}
          style={{ margin: "0 18px 12px 60px", display: "flex", gap: 10, alignItems: "flex-start", backgroundColor: "#fffbeb", border: "1px solid #fde68a", borderLeft: "3px solid #f59e0b", borderRadius: R.md, padding: "10px 12px" }}>
          <MessageSquareWarning aria-hidden="true" style={{ width: 15, height: 15, color: "#f59e0b", flexShrink: 0, marginTop: 1 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#78350f", lineHeight: 1.35 }}>
              O book publicado não tem a arte atual de {b.pecasMudaramDepois} {b.pecasMudaramDepois === 1 ? "peça" : "peças"}
            </p>
            <p style={{ margin: "3px 0 0", fontSize: 11, color: "#78350f", opacity: 0.85, lineHeight: 1.45 }}>
              A arte {b.pecasMudaramDepois === 1 ? "desta peça" : "destas peças"} mudou depois de {b.em ? fmtDia(b.em) : "a publicação"}. Quem abrir o book vai ver a versão antiga — e é por ele que o patrocinador decide.
            </p>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 7 }}>
              {b.pecasMudaram.map(pm => (
                <Link key={pm.id} href={`/eventos/${pm.eventId}?item=${pm.id}`}
                  data-testid={`ficha-peca-mudou-${pm.id}`}
                  title={`${pm.type}${pm.description ? ` — ${pm.description}` : ""} · arte trocada em ${fmtData(pm.em)}`}
                  style={{ ...numero, display: "inline-flex", alignItems: "center", minHeight: isMobile ? 32 : 22, padding: "1px 8px", borderRadius: R.sm, border: "1px solid #fde68a", backgroundColor: "#ffffff", color: "#92400e", fontSize: FS.small, fontWeight: 700, textDecoration: "none" }}>
                  {pm.displayId}
                </Link>
              ))}
              {escondidas > 0 && (
                <span style={{ fontSize: 11, color: "#78350f", alignSelf: "center" }}>e mais {escondidas}</span>
              )}
            </div>
          </div>
          {podeRepublicar && (
            <Link href={`/eventos/${ev.eventId}/gerar-book`}
              data-testid={`button-republicar-book-${ev.eventId}`}
              title="Abrir o gerador de book: monta um PDF novo com a arte atual das peças e publica — o aviso aos responsáveis sai na publicação"
              style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 6, height: isMobile ? 44 : 32, padding: "0 14px", borderRadius: R.md, border: "none", backgroundColor: "#c2410c", color: "#ffffff", fontSize: FS.small, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", textDecoration: "none", whiteSpace: "nowrap" }}>
              <FileText style={{ width: 13, height: 13 }} /> Republicar book
            </Link>
          )}
        </div>
      )}

      {/* QUAIS. Cada peça com a data em que a arte mudou, e o caminho para ela. */}
      {aberto && desatualizado && (
        <div data-testid={`lista-mudaram-${ev.eventId}-${i}`}
          style={{ padding: "0 18px 12px 60px", display: "flex", flexDirection: "column", gap: 4 }}>
          {b.pecasMudaram.map(pm => {
            const gv = GRAVIDADE_VISUAL[gravidadeDe(pm.status)];
            return (
              <Link key={pm.id} href={`/eventos/${pm.eventId}?item=${pm.id}`}
                data-testid={`link-mudou-${pm.id}`}
                title={`${pm.displayId} · ${pm.type}${pm.description ? ` — ${pm.description}` : ""}`}
                style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: FS.small, color: T.text, textDecoration: "none", padding: "4px 0", borderBottom: `1px solid ${T.low}` }}>
                <span style={{ ...numero, fontWeight: 700, color: T.accentText, flexShrink: 0 }}>{pm.displayId}</span>
                <span style={{ fontWeight: 700, flexShrink: 0 }}>{pm.type}</span>
                {pm.description && (
                  <span style={{ color: "#57534e", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 260 }}>{pm.description}</span>
                )}
                {/* ONDE ELA ESTÁ. Arte trocada em peça que já foi para a
                    gráfica é outro problema — e é o que decide a urgência. */}
                <span style={{ flexShrink: 0, fontSize: FS.micro, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: gv.cor, backgroundColor: gv.fundo, border: `1px solid ${gv.borda}`, borderRadius: R.sm, padding: "1px 6px" }}>
                  {gv.rotulo}
                </span>
                <span style={{ marginLeft: "auto", color: T.second, whiteSpace: "nowrap" }}>
                  v{pm.versao} · <span style={numero}>{fmtData(pm.em)}</span>{pm.por ? ` · ${pm.por}` : ""}
                </span>
              </Link>
            );
          })}
          {escondidas > 0 && (
            <span style={{ fontSize: FS.small, color: T.second }}>e mais {escondidas} — abra o evento para ver a lista inteira.</span>
          )}
        </div>
      )}
    </div>
  );
}
