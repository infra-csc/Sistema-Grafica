// Registros fotográficos da Gráfica — conferências e entregas de todas as peças.
// Fica fora da tela da Gráfica de propósito: a maioria dos perfis não tem acesso
// a ela, e este acervo interessa a todo mundo.
import { useMemo, useState, useEffect, useRef, useDeferredValue } from "react";
import { useQuery } from "@tanstack/react-query";
import { Camera, Truck, FileCheck, Search, X, ExternalLink, ChevronLeft, ChevronRight, ZoomIn, Download, Loader2, CalendarDays } from "lucide-react";
import { Link } from "wouter";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { FilterSelect } from "@/components/filter-select";
import { convertGCSUrlToLocalPath } from "@/lib/artePdfExport";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useIsMobile } from "@/hooks/use-mobile";
import { T, FS, R, SHADOW } from "@/lib/theme";
import { toast } from "@/hooks/use-toast";

const KIND = {
  conference: { label: "Conferência", color: "#0e7490", bg: "#ecfeff", border: "#a5f3fc", icon: FileCheck },
  delivery:   { label: "Entrega",     color: "#7e22ce", bg: "#faf5ff", border: "#e9d5ff", icon: Truck },
} as const;

type Kind = keyof typeof KIND;

// Forma real do payload de /api/photos — antes tudo era `any` e um campo
// renomeado no servidor só apareceria como célula vazia em produção.
interface Photo {
  id: string;
  kind?: string;
  photoUrl?: string;
  eventId?: string;
  eventName?: string;
  displayId?: string;
  itemType?: string;
  itemDescription?: string;
  receivedBy?: string;
  uploadedBy?: string;
  createdAt?: string;
  conferenceNotes?: string;
  deliveryNotes?: string;
}

const PAGE_SIZE = 60;

const PERIODS = ["Hoje", "7 dias", "15 dias", "30 dias", "Todos"] as const;
type Period = typeof PERIODS[number];
const PERIOD_DAYS: Record<string, number> = { "Hoje": 0, "7 dias": 7, "15 dias": 15, "30 dias": 30 };

const kindOf = (p: Photo): Kind => (p.kind === "conference" ? "conference" : "delivery");
// Registros antigos guardaram a URL assinada do GCS, que expira; o app serve
// os arquivos por /objects/...
const srcOf = (p: Photo) => convertGCSUrlToLocalPath(p.photoUrl || "");

export default function Registros() {
  const isMobile = useIsMobile();
  const { data: photos = [], isLoading, isError, refetch } = useQuery<Photo[]>({ queryKey: ["/api/photos"] });

  // Filtros inicializam da URL e são espelhados nela (mesmo padrão de
  // eventos.tsx): F5 não perde o estado e o link filtrado é compartilhável.
  const urlParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const [kindFilter, setKindFilter]   = useState<string[]>(() => urlParams.get("tipo")?.split(",").filter(Boolean) ?? []);
  const [eventFilter, setEventFilter] = useState<string[]>(() => urlParams.get("evento")?.split(",").filter(Boolean) ?? []);
  const [period, setPeriod]           = useState<Period>(() => {
    const p = urlParams.get("periodo");
    return p && (PERIODS as readonly string[]).includes(p) ? (p as Period) : "Todos";
  });
  const [search, setSearch]           = useState(() => urlParams.get("busca") ?? "");
  const [visible, setVisible]         = useState(PAGE_SIZE);
  // Índice na lista filtrada, para poder navegar entre as fotos com o zoom aberto.
  const [zoomIdx, setZoomIdx]         = useState<number | null>(null);
  // Fotos cuja imagem falhou ao carregar — estado React em vez de mexer no DOM
  // por fora (o span imperativo sobrevivia a re-render e vazava entre fotos).
  const [brokenIds, setBrokenIds]     = useState<Set<string>>(() => new Set());

  // Um refetch pode trazer URLs novas/corrigidas: o conjunto de quebradas é
  // da lista antiga e não deve condenar fotos que voltaram a carregar.
  useEffect(() => { setBrokenIds(new Set()); }, [photos]);

  useEffect(() => {
    const p = new URLSearchParams();
    if (search) p.set("busca", search);
    if (kindFilter.length) p.set("tipo", kindFilter.join(","));
    if (eventFilter.length) p.set("evento", eventFilter.join(","));
    if (period !== "Todos") p.set("periodo", period);
    const qs = p.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [search, kindFilter, eventFilter, period]);

  // Atalho "/" foca a busca (paridade com eventos.tsx e Painel Geral).
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Sem isso, cada tecla refiltra o acervo inteiro e a digitação engasga.
  const deferredSearch = useDeferredValue(search);

  // Filtros facetados: cada um conta sobre o resultado dos outros. Os quatro
  // predicados nascem de UM useMemo — antes eram closures recriadas a cada
  // render, o que invalidava os memos que dependiam delas.
  const passes = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    let from: Date | null = null;
    if (period !== "Todos") {
      from = new Date();
      from.setHours(0, 0, 0, 0);
      from.setDate(from.getDate() - PERIOD_DAYS[period]);
    }
    return {
      kind:   (p: Photo) => !kindFilter.length  || kindFilter.includes(kindOf(p)),
      event:  (p: Photo) => !eventFilter.length || eventFilter.includes(p.eventId || ""),
      search: (p: Photo) => !q || [p.displayId, p.itemType, p.itemDescription, p.eventName, p.receivedBy, p.uploadedBy]
        .some(v => (v || "").toLowerCase().includes(q)),
      period: (p: Photo) => !from || (!!p.createdAt && new Date(p.createdAt) >= from),
    };
  }, [kindFilter, eventFilter, deferredSearch, period]);

  const filtered = useMemo(
    () => photos.filter(p => passes.kind(p) && passes.event(p) && passes.search(p) && passes.period(p)),
    [photos, passes],
  );

  const kindOptions = useMemo(() => {
    const pool = photos.filter(p => passes.event(p) && passes.search(p) && passes.period(p));
    return (Object.keys(KIND) as Kind[]).map(k => ({
      value: k, label: KIND[k].label,
      count: pool.filter(p => kindOf(p) === k).length,
    })).filter(o => o.count > 0 || kindFilter.includes(o.value));
  }, [photos, passes, kindFilter]);

  const eventOptions = useMemo(() => {
    const pool = photos.filter(p => passes.kind(p) && passes.search(p) && passes.period(p));
    const map = new Map<string, { value: string; label: string; count: number }>();
    pool.forEach(p => {
      const id = p.eventId || "";
      const entry = map.get(id);
      if (entry) entry.count++;
      else map.set(id, { value: id, label: p.eventName || "Sem evento", count: 1 });
    });
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }, [photos, passes]);

  // Período com CONTAGEM — a faixa de botões que este menu substituiu não
  // tinha nenhuma: as cinco janelas apareciam iguais, e "Hoje" num dia sem
  // registro nenhum era indistinguível de "Hoje" com quarenta. O pool exclui o
  // próprio período (a regra das facetas) e as janelas são cumulativas, então
  // cada uma conta desde a sua data de corte até agora — 7 dias inclui hoje,
  // como o predicado `passes.period` já fazia.
  const periodOptions = useMemo(() => {
    const pool = photos.filter(p => passes.kind(p) && passes.event(p) && passes.search(p));
    const desde = (dias: number) => {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - dias);
      return d;
    };
    return PERIODS.filter(p => p !== "Todos").map(p => {
      const from = desde(PERIOD_DAYS[p]);
      return {
        value: p as string,
        label: p as string,
        count: pool.filter(x => !!x.createdAt && new Date(x.createdAt) >= from).length,
        // `pinned` mantém a ordem cronológica escrita aqui (Hoje → 30 dias); o
        // FilterSelect ordena alfabeticamente, e sem isto a lista sairia
        // "15 dias, 30 dias, 7 dias, Hoje".
        pinned: true,
      };
    });
  }, [photos, passes]);

  // Contadores sobre o recorte atual (menos o filtro de tipo, que eles próprios
  // controlam) — números que ignoram os filtros confundem mais do que informam.
  const counts = useMemo(() => {
    const pool = photos.filter(p => passes.event(p) && passes.search(p) && passes.period(p));
    return {
      total: pool.length,
      conference: pool.filter(p => kindOf(p) === "conference").length,
      delivery: pool.filter(p => kindOf(p) === "delivery").length,
    };
  }, [photos, passes]);

  const hasFilters = !!(kindFilter.length || eventFilter.length || search.trim() || period !== "Todos");
  const clearAll = () => { setKindFilter([]); setEventFilter([]); setSearch(""); setPeriod("Todos"); };

  // Navegação do zoom: setas e Esc, como se espera de uma galeria.
  // O Esc é do próprio Dialog; aqui ficam só as setas.
  const zoom = zoomIdx != null ? filtered[zoomIdx] : null;
  const stepZoom = (dir: 1 | -1) =>
    setZoomIdx(i => {
      if (i == null) return i;
      const next = i + dir;
      return next >= 0 && next < filtered.length ? next : i;
    });

  useEffect(() => {
    if (zoomIdx == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") stepZoom(1);
      else if (e.key === "ArrowLeft") stepZoom(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomIdx, filtered.length]);

  // Se a lista filtrada mudar com o zoom aberto (refetch em background), o
  // índice passaria a apontar para OUTRA foto sem aviso — fechar é honesto.
  // Com o zoom fechado, setZoomIdx(null) sobre null é no-op (React ignora).
  useEffect(() => { setZoomIdx(null); }, [filtered]);

  // Foto grande demora a chegar no 4G do galpão; sem indicação, a troca de
  // imagem parece que travou porque a anterior fica na tela até a nova pintar.
  const [zoomLoading, setZoomLoading] = useState(false);
  useEffect(() => { if (zoomIdx != null) setZoomLoading(true); }, [zoomIdx]);

  const fmt = (d?: string) => (d ? format(new Date(d), "dd/MM/yy HH:mm", { locale: ptBR }) : "—");

  /** Texto que descreve a foto para quem não a vê. */
  const altOf = (p: Photo) =>
    [KIND[kindOf(p)].label, p.displayId, p.itemType, p.eventName].filter(Boolean).join(" — ");

  // Baixar é a ação natural de um acervo: a foto vira anexo de e-mail, prova de
  // entrega, comprovante. "Abrir original" só levava para outra aba, deixando o
  // trabalho de salvar (e de nomear o arquivo) para o usuário.
  const [baixando, setBaixando] = useState(false);
  const baixar = async (p: Photo) => {
    setBaixando(true);
    try {
      const url = srcOf(p);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const ext = (blob.type.split("/")[1] || "jpg").replace("jpeg", "jpg");
      const nome = [KIND[kindOf(p)].label, p.displayId, p.createdAt ? format(new Date(p.createdAt), "dd-MM-yy") : ""]
        .filter(Boolean).join(" ").replace(/[\\/:*?"<>|]/g, "-");
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href; a.download = `${nome}.${ext}`;
      // Fora do DOM, alguns navegadores (Firefox, iOS) ignoram o click sintético.
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 30_000);
    } catch (e: any) {
      toast({ title: "Não foi possível baixar", description: e?.message ?? "Tente abrir o original.", variant: "destructive" });
    } finally {
      setBaixando(false);
    }
  };

  // Alvo de toque: 44px no celular (busca, período, limpar e ações do zoom).
  const controlHeight = isMobile ? 44 : 36;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", backgroundColor: T.bg }}>
      {/* ── Cabeçalho ── */}
      <div style={{ flexShrink: 0, backgroundColor: "#ffffff", borderBottom: `1px solid ${T.border}`, padding: isMobile ? "14px 16px 0" : "20px 32px 0" }}>
        <div style={{ maxWidth: 1600, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
            <div style={{ width: 40, height: 40, borderRadius: R.lg, backgroundColor: T.accent, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Camera style={{ width: 20, height: 20, color: "#ffffff" }} />
            </div>
            <div>
              <h1 style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, fontSize: FS.h1, letterSpacing: "-0.03em", color: T.text, margin: 0 }}>
                Registros
              </h1>
              <p style={{ fontSize: FS.small, color: T.second, margin: 0 }}>
                Fotos de conferência e entrega de todas as peças
              </p>
            </div>
          </div>

          {/* Contadores — refletem os filtros ativos e servem de atalho de filtro */}
          <div style={{ display: "flex", gap: 24, margin: "16px 0" }}>
            {([
              ["Total", counts.total, T.text, null],
              ["Conferências", counts.conference, KIND.conference.color, "conference"],
              ["Entregas", counts.delivery, KIND.delivery.color, "delivery"],
            ] as const).map(([label, n, color, kind]) => {
              const active = kind ? kindFilter.length === 1 && kindFilter[0] === kind : kindFilter.length === 0;
              // Estes contadores também são filtros. O inativo recuava com
              // opacity (0.7 sobre o número colorido caía abaixo de AA):
              // agora recua trocando a COR para o cinza AA do tema e o peso
              // para 600 — legível e visivelmente secundário.
              const dim = !(active || kindFilter.length === 0);
              return (
                <button key={label} className="group"
                  onClick={() => { setKindFilter(kind && !active ? [kind] : []); setVisible(PAGE_SIZE); }}
                  data-testid={`stat-${kind ?? "total"}`}
                  aria-pressed={active}
                  title={kind ? `Ver só ${label.toLowerCase()}` : "Ver tudo"}
                  style={{ background: "none", border: "none", padding: 0, textAlign: "left", cursor: "pointer" }}>
                  <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: dim ? 600 : 700, fontSize: FS.h2, color: dim ? T.second : color, margin: 0, lineHeight: 1, transition: "color 0.15s" }}>{n}</p>
                  <p className="group-hover:opacity-80" style={{ fontSize: FS.small, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: T.second, margin: "4px 0 0", borderBottom: active && kind ? `2px solid ${color}` : "2px solid transparent", paddingBottom: 2, transition: "border-color 0.15s" }}>{label}</p>
                </button>
              );
            })}
          </div>

          {/* Filtros */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", paddingBottom: 16 }}>
            <div style={{ position: "relative", flex: "1 1 260px", minWidth: 220 }}>
              <Search style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: T.muted }} />
              <input
                ref={searchRef}
                value={search}
                onChange={e => { setSearch(e.target.value); setVisible(PAGE_SIZE); }}
                aria-label="Buscar registros"
                placeholder="Buscar peça, ID, evento ou quem recebeu…"
                data-testid="input-search-registros"
                style={{ width: "100%", height: controlHeight, padding: "0 12px 0 34px", borderRadius: R.md, border: `1px solid ${T.border}`, backgroundColor: T.surface, fontSize: FS.body, color: T.text }}
              />
            </div>
            <FilterSelect
              label="Todos os tipos"
              testId="filter-kind"
              options={kindOptions}
              values={kindFilter}
              onValuesChange={v => { setKindFilter(v); setVisible(PAGE_SIZE); }}
            />
            <FilterSelect
              label="Todos os eventos"
              testId="filter-event"
              options={eventOptions}
              values={eventFilter}
              onValuesChange={v => { setEventFilter(v); setVisible(PAGE_SIZE); }}
            />
            {/* Período — job 5 do vocabulário (components/filter-select.tsx).
                Era uma faixa de cinco botões: uma dimensão só, com opções
                mutuamente exclusivas, gastando a largura de três gatilhos ao
                lado de dois menus que fazem exatamente a mesma pergunta. No
                celular ela era a peça que estourava a barra.

                O que a faixa tinha e NÃO se perdeu: as setas ←/→ e Home/End
                continuam andando pelas opções (agora dentro do menu, junto com
                ↑/↓, Enter e Esc, que a faixa não tinha), e a contagem por opção
                — que a faixa não tinha — passa a existir. `hideSearch` porque
                são cinco linhas fixas. */}
            <FilterSelect
              label="Período"
              allLabel="Todos os períodos"
              showAllLabelWhenEmpty
              hideWhenEmpty={false}
              hideSearch
              icon={CalendarDays}
              value={period === "Todos" ? "all" : period}
              onChange={v => { setPeriod(v === "all" ? "Todos" : (v as Period)); setVisible(PAGE_SIZE); }}
              options={periodOptions}
              panelWidth={190}
              dropdownAlign="right"
              testId="select-period-filter"
              triggerStyle={{ height: controlHeight }}
            />
            {hasFilters && (
              <button onClick={clearAll} data-testid="button-clear-filters" className="hover:bg-black/[0.03]"
                style={{ display: "inline-flex", alignItems: "center", minHeight: isMobile ? 44 : 34, fontSize: FS.small, fontWeight: 600, color: T.second, background: "none", border: `1px solid ${T.border}`, borderRadius: R.pill, cursor: "pointer", padding: "0 14px", transition: "background-color 0.15s" }}>
                Limpar tudo
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Galeria ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: isMobile ? "16px" : "24px 32px", maxWidth: 1600, margin: "0 auto", width: "100%" }}>
        {isLoading ? (
          /* Skeleton com a silhueta dos cards reais (foto + legenda) — o
             spinner central deixava a tela em branco e causava layout shift. */
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 20 }} aria-busy="true" aria-label="Carregando registros">
            {[0, 1, 2, 3, 4, 5, 6, 7].map(i => (
              <div key={i} style={{ backgroundColor: T.surface, border: `1px solid ${T.border}`, borderRadius: R.lg, overflow: "hidden" }}>
                <div className="animate-pulse" style={{ width: "100%", aspectRatio: "4/3", backgroundColor: T.low }} />
                <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                  <div className="animate-pulse" style={{ width: "70%", height: 12, borderRadius: 4, backgroundColor: "#e7e5e4" }} />
                  <div className="animate-pulse" style={{ width: "45%", height: 10, borderRadius: 4, backgroundColor: T.low }} />
                </div>
              </div>
            ))}
          </div>
        ) : isError ? (
          /* Sem este ramo, uma falha da API caía no "Nenhum registro ainda" —
             mensagem enganosa para um acervo que existe. */
          <div role="alert" style={{ textAlign: "center", padding: "64px 0" }}>
            <h3 style={{ color: "#b91c1c", fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Não foi possível carregar os registros</h3>
            <p style={{ color: T.second, fontSize: FS.body, marginBottom: 20 }}>Verifique sua conexão e tente novamente.</p>
            <button onClick={() => refetch()} data-testid="button-retry-registros"
              style={{ fontSize: FS.body, fontWeight: 700, color: "#fff", background: T.dark, border: "none", borderRadius: R.md, padding: "9px 20px", cursor: "pointer" }}>
              Tentar novamente
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "64px 0", color: T.second }}>
            <Camera style={{ width: 32, height: 32, color: T.muted, marginBottom: 12 }} />
            <p style={{ fontSize: FS.strong, fontWeight: 600, color: T.text, margin: "0 0 4px" }}>
              {photos.length === 0 ? "Nenhum registro ainda" : "Nenhum registro com esses filtros"}
            </p>
            <p style={{ fontSize: FS.small, margin: 0 }}>
              {photos.length === 0
                ? "As fotos aparecem aqui conforme a Gráfica confere e entrega as peças."
                : "Ajuste os filtros para ver outros registros."}
            </p>
          </div>
        ) : (
          <>
            {/* A galeria já respondia a ← → e Esc, mas nada dizia isso: um
                recurso que ninguém descobre é um recurso que não existe. */}
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap", margin: "0 0 12px" }}>
              <p aria-live="polite" style={{ fontSize: FS.small, color: T.second, margin: 0 }}>
                Exibindo <strong style={{ color: T.text }}>{Math.min(visible, filtered.length)}</strong> de{" "}
                <strong style={{ color: T.text }}>{filtered.length}</strong> registro{filtered.length !== 1 ? "s" : ""}
              </p>
              {!isMobile && (
                <p style={{ fontSize: FS.small, color: T.second, margin: 0 }}>
                  Abra uma foto e use <kbd style={{ fontFamily: "inherit", fontWeight: 700, color: T.text }}>←</kbd>{" "}
                  <kbd style={{ fontFamily: "inherit", fontWeight: 700, color: T.text }}>→</kbd> para percorrer
                </p>
              )}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 20 }}>
              {filtered.slice(0, visible).map((p, idx) => {
                const k = KIND[kindOf(p)];
                const Icon = k.icon;
                const notes = kindOf(p) === "conference" ? p.conferenceNotes : p.deliveryNotes;
                return (
                  <div key={p.id} data-testid={`card-photo-${p.id}`} className="group"
                    style={{ backgroundColor: T.surface, border: `1px solid ${T.border}`, borderRadius: R.lg, overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: SHADOW.sm, transition: "box-shadow 0.15s ease, transform 0.15s ease" }}
                    onMouseEnter={e => { e.currentTarget.style.boxShadow = SHADOW.md; e.currentTarget.style.transform = "translateY(-2px)"; }}
                    onMouseLeave={e => { e.currentTarget.style.boxShadow = SHADOW.sm; e.currentTarget.style.transform = "translateY(0)"; }}
                  >
                    <button
                      onClick={() => setZoomIdx(idx)}
                      title="Ampliar"
                      aria-label={`Ampliar: ${altOf(p)}`}
                      style={{ display: "block", position: "relative", width: "100%", aspectRatio: "4/3", border: "none", padding: 0, backgroundColor: T.low, cursor: "zoom-in" }}
                    >
                      {/* lazy: a grade carrega dezenas de fotos; sem isso o
                          navegador baixa todas de uma vez ao abrir a tela. */}
                      {/* alt era só "Conferência"/"Entrega": um leitor de tela
                          repetia a mesma palavra sessenta vezes ao percorrer a
                          grade, sem dizer de que peça era cada foto. */}
                      {brokenIds.has(p.id) ? (
                        <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: FS.small, color: T.second }}>
                          Imagem indisponível
                        </span>
                      ) : (
                        <img src={srcOf(p)} alt={altOf(p)} loading="lazy" decoding="async"
                          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                          onError={() => setBrokenIds(prev => {
                            const next = new Set(prev);
                            next.add(p.id);
                            return next;
                          })} />
                      )}

                      {/* Selo de tipo — sobre a foto, então a legenda abaixo já
                          começa direto na informação da peça. */}
                      <span style={{ position: "absolute", top: 8, left: 8, display: "inline-flex", alignItems: "center", gap: 4, fontSize: FS.micro, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#ffffff", backgroundColor: k.color, borderRadius: R.sm, padding: "3px 7px", boxShadow: SHADOW.sm }}>
                        <Icon style={{ width: 10, height: 10 }} /> {k.label}
                      </span>
                      {/* alfa 0.72: a 0.6 o fundo do ID dependia da foto atrás
                          — sobre foto clara o branco caía abaixo de 4,5:1. */}
                      {p.displayId && (
                        <span style={{ position: "absolute", top: 8, right: 8, fontFamily: "monospace", fontSize: FS.small, fontWeight: 700, color: "#ffffff", backgroundColor: "rgba(28,25,23,0.72)", borderRadius: R.sm, padding: "2px 7px" }}>{p.displayId}</span>
                      )}

                      {/* Afordância de zoom — só aparece no hover, pra não competir com a foto. */}
                      <span className="opacity-0 group-hover:opacity-100" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(28,25,23,0.25)", transition: "opacity 0.15s" }}>
                        <ZoomIn style={{ width: 22, height: 22, color: "#ffffff" }} />
                      </span>
                    </button>

                    <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
                      <p style={{ fontSize: FS.body, fontWeight: 700, color: T.text, margin: 0, lineHeight: 1.3 }}>
                        {p.itemType || "Peça removida"}
                        {p.itemDescription && <span style={{ fontWeight: 400, color: T.second }}> — {p.itemDescription}</span>}
                      </p>
                      {/* Leva ao evento da peça — a pergunta seguinte a "vi a foto"
                          costuma ser "onde essa peça está". #c2410c: o laranja
                          saturado do tema reprovava AA como texto sobre branco. */}
                      {p.eventId ? (
                        <Link href={`/eventos/${p.eventId}`}
                          data-testid={`link-event-${p.id}`}
                          className="hover:underline"
                          style={{ fontSize: FS.small, color: "#c2410c", margin: 0, textDecoration: "none", fontWeight: 600 }}>
                          {p.eventName || "Sem evento"}
                        </Link>
                      ) : (
                        <p style={{ fontSize: FS.small, color: T.second, margin: 0 }}>Sem evento</p>
                      )}

                      {/* A observação é o que a Gráfica escreveu na hora — vale
                          mais que os metadados. Fundo levíssimo em vez de só
                          itálico, para separá-la do resto sem gritar.
                          (#584237 era uma cor solta fora da paleta.) */}
                      {notes && (
                        <p style={{ fontSize: FS.small, color: "#57534e", fontStyle: "italic", margin: 0, lineHeight: 1.45, backgroundColor: T.low, borderRadius: R.sm, padding: "6px 8px" }}>
                          “{notes}”
                        </p>
                      )}

                      <div style={{ marginTop: "auto", paddingTop: 6, borderTop: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", gap: 8 }}>
                        <span style={{ fontSize: FS.small, color: T.second }}>{fmt(p.createdAt)}</span>
                        <span style={{ fontSize: FS.small, color: T.second, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {kindOf(p) === "delivery" && p.receivedBy ? `Recebido: ${p.receivedBy}` : (p.uploadedBy || "")}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {visible < filtered.length && (
              <div style={{ display: "flex", justifyContent: "center", marginTop: 20 }}>
                <button onClick={() => setVisible(v => v + PAGE_SIZE)} data-testid="button-load-more" className="hover:bg-black/[0.03]"
                  style={{ padding: "10px 20px", borderRadius: R.md, border: `1px solid ${T.border}`, backgroundColor: T.surface, fontSize: FS.small, fontWeight: 700, color: T.text, cursor: "pointer", transition: "background-color 0.15s" }}>
                  Carregar mais ({filtered.length - visible} restantes)
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Zoom ──────────────────────────────────────────────────────────
          Era um <div> fixo sobre a página. Como o recurso central da tela, é o
          que mais sentia falta de ser um diálogo de verdade: o Tab passeava
          pelos cartões atrás do escurecido, o fundo continuava rolando com a
          roda do mouse, ao fechar o foco não voltava para o cartão de origem e
          nada anunciava a abertura para leitor de tela. O Dialog do app resolve
          os quatro de uma vez. */}
      <Dialog open={zoom != null} onOpenChange={o => { if (!o) setZoomIdx(null); }}>
        <DialogContent
          className="max-w-none p-0 gap-0 border-none bg-transparent shadow-none [&>button]:hidden"
          // ALTURA: a foto tinha teto de 72vh e a legenda vinha por baixo, sem
          // teto nenhum no Content. A conta dava `72vh + 12 de gap + legenda`:
          // 392px numa janela de 445 contra 397 disponíveis — passava raspando,
          // e bastava o registro TER observação (a linha em itálico soma ~20px)
          // para virar 412 e o Radix cortar 8px em cima e 8 embaixo ao mesmo
          // tempo. Abaixo de ~428px de janela cortava sempre.
          //
          // A CONTA é `100vh − 48`: viewport menos 24px de respiro em cima e 24
          // embaixo, simétrico porque o Radix centra. Aqui o teto NÃO vira
          // rolagem: num lightbox a resposta certa é a foto encolher. Por isso a
          // moldura da imagem é o item elástico (`flex: 1 1 auto` + `minHeight:
          // 0`) e a legenda não encolhe — a foto acompanha com `maxHeight: 100%`.
          style={{ width: "96vw", maxWidth: 1280, maxHeight: "calc(100vh - 48px)", display: "flex", flexDirection: "column" }}
        >
          <DialogTitle className="sr-only">
            {zoom ? altOf(zoom) : "Registro"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Use as setas do teclado para percorrer os registros e Esc para fechar
          </DialogDescription>

          {zoom && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, flex: "1 1 auto", minHeight: 0 }}>
              <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", flex: "1 1 auto", minHeight: 0 }}>
                {zoomLoading && (
                  <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Loader2 className="animate-spin" style={{ width: 28, height: 28, color: "rgba(255,255,255,0.85)" }} />
                  </div>
                )}
                <img
                  src={srcOf(zoom)}
                  alt={altOf(zoom)}
                  onLoad={() => setZoomLoading(false)}
                  onError={() => setZoomLoading(false)}
                  data-testid="img-zoom"
                  style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: R.md, backgroundColor: "#ffffff", boxShadow: SHADOW.lg, opacity: zoomLoading ? 0.4 : 1, transition: "opacity 0.15s" }}
                />

                {/* Setas dentro da moldura da imagem: fora dela, em tela larga,
                    ficavam a meio metro da foto. */}
                {zoomIdx! > 0 && (
                  <button onClick={() => stepZoom(-1)} title="Anterior (←)" aria-label="Registro anterior"
                    data-testid="button-zoom-prev"
                    style={{ position: "absolute", left: 12, width: 44, height: 44, borderRadius: R.pill, border: "none", backgroundColor: "rgba(28,25,23,0.55)", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <ChevronLeft style={{ width: 22, height: 22 }} />
                  </button>
                )}
                {zoomIdx! < filtered.length - 1 && (
                  <button onClick={() => stepZoom(1)} title="Próxima (→)" aria-label="Próximo registro"
                    data-testid="button-zoom-next"
                    style={{ position: "absolute", right: 12, width: 44, height: 44, borderRadius: R.pill, border: "none", backgroundColor: "rgba(28,25,23,0.55)", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <ChevronRight style={{ width: 22, height: 22 }} />
                  </button>
                )}
              </div>

              {/* Legenda + ações. flexWrap porque no celular três botões e o
                  texto não cabem lado a lado. */}
              <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap", color: "#ffffff", flexShrink: 0 }}>
                <div style={{ minWidth: 0, flex: "1 1 260px" }}>
                  <p style={{ fontSize: FS.strong, fontWeight: 700, margin: 0 }}>
                    {zoom.displayId ? `${zoom.displayId} — ` : ""}{zoom.itemType || "Peça removida"}
                  </p>
                  <p style={{ fontSize: FS.small, color: "rgba(255,255,255,0.8)", margin: "2px 0 0" }}>
                    {KIND[kindOf(zoom)].label} · {zoom.eventName || "Sem evento"} · {fmt(zoom.createdAt)}
                    {zoom.uploadedBy && ` · por ${zoom.uploadedBy}`}
                  </p>
                  {(kindOf(zoom) === "conference" ? zoom.conferenceNotes : zoom.deliveryNotes) && (
                    <p style={{ fontSize: FS.small, color: "rgba(255,255,255,0.9)", fontStyle: "italic", margin: "4px 0 0" }}>
                      “{kindOf(zoom) === "conference" ? zoom.conferenceNotes : zoom.deliveryNotes}”
                    </p>
                  )}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, flexWrap: "wrap" }}>
                  <span style={{ fontSize: FS.small, color: "rgba(255,255,255,0.8)", whiteSpace: "nowrap", marginRight: 4 }}>
                    {zoomIdx! + 1} / {filtered.length}
                  </span>
                  <button onClick={() => baixar(zoom)} disabled={baixando} className="hover:bg-white/25"
                    data-testid="button-zoom-download"
                    style={{ display: "flex", alignItems: "center", gap: 6, minHeight: controlHeight, padding: "0 14px", borderRadius: R.md, border: "none", backgroundColor: "rgba(255,255,255,0.15)", color: "#ffffff", fontSize: FS.small, fontWeight: 700, cursor: baixando ? "wait" : "pointer", transition: "background-color 0.15s" }}>
                    {baixando
                      ? <><Loader2 className="animate-spin" style={{ width: 13, height: 13 }} /> Baixando…</>
                      : <><Download style={{ width: 13, height: 13 }} /> Baixar</>}
                  </button>
                  <a href={srcOf(zoom)} target="_blank" rel="noopener noreferrer" className="hover:bg-white/25"
                    style={{ display: "flex", alignItems: "center", gap: 6, minHeight: controlHeight, padding: "0 14px", borderRadius: R.md, backgroundColor: "rgba(255,255,255,0.15)", color: "#ffffff", fontSize: FS.small, fontWeight: 700, textDecoration: "none", transition: "background-color 0.15s" }}>
                    <ExternalLink style={{ width: 13, height: 13 }} /> Original
                  </a>
                  <button onClick={() => setZoomIdx(null)} className="hover:bg-white/25" aria-label="Fechar"
                    style={{ display: "flex", alignItems: "center", gap: 6, minHeight: controlHeight, padding: "0 14px", borderRadius: R.md, border: "none", backgroundColor: "rgba(255,255,255,0.15)", color: "#ffffff", fontSize: FS.small, fontWeight: 700, cursor: "pointer", transition: "background-color 0.15s" }}>
                    <X style={{ width: 13, height: 13 }} /> Fechar
                  </button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
