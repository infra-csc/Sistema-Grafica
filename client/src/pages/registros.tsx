// Registros fotográficos da Gráfica — conferências e entregas de todas as peças.
// Fica fora da tela da Gráfica de propósito: a maioria dos perfis não tem acesso
// a ela, e este acervo interessa a todo mundo.
import { useMemo, useState, useEffect, useRef, useDeferredValue } from "react";
import { useQuery } from "@tanstack/react-query";
import { Camera, Search, CalendarDays, SlidersHorizontal } from "lucide-react";
import { FilterSelect } from "@/components/filter-select";
import { useIsMobile, usePonteiroGrosso, alvo } from "@/hooks/use-mobile";
import { T, FS, R, FW, FONT, TOM, SHADOW } from "@/lib/theme";
import { Botao } from "@/components/ui/botao";
import { CabecalhoDaPagina } from "@/components/ui/cabecalho-da-pagina";
import { EstadoVazio } from "@/components/ui/estados";
import { RegistrosDeTubos } from "@/components/registros-de-tubos";
import {
  KIND, PAGE_SIZE, PERIODS, PERIOD_DAYS, kindOf, pecaDe, rotuloDoDia, type Kind, type Period, type Photo,
} from "@/components/grafica/registros/fotos";
import { useBaixarFoto } from "@/components/grafica/registros/use-baixar-foto";
import { CartaoDeFoto } from "@/components/grafica/registros/cartao-de-foto";
import { SheetDeFiltros } from "@/components/grafica/registros/sheet-de-filtros";
import { ZoomDoRegistro } from "@/components/grafica/registros/zoom-do-registro";

/** Vazio estável enquanto /api/photos não responde (ver o uso em Registros). */
const SEM_FOTOS: Photo[] = [];

export default function Registros() {
  const isMobile = useIsMobile();
  // Dedo no tablet do galpão: o alvo de 44px vale também fora da largura de
  // celular (o ponteiro é que manda, não a janela).
  const toque = usePonteiroGrosso() || isMobile;
  // SEM_FOTOS (constante de módulo) e não `= []`: enquanto /api/photos não
  // chega — e para sempre se a rota falhar — um literal novo a cada render
  // disparava o reset de `brokenIds` logo abaixo, que grava um Set novo, que
  // re-renderiza, que cria outro literal… A tela girava em falso durante toda
  // a carga (82 commits em 1,5s com a rota pendurada; 239 com ela em erro —
  // perf-calendario-versoes-registros.test.ts).
  const { data: photos = SEM_FOTOS, isLoading, isError, refetch } = useQuery<Photo[]>({ queryKey: ["/api/photos"] });

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

  // O Período também vale para os registros dos tubos (revisão de 22/09) —
  // a MESMA janela do predicado `passes.period` acima.
  const desdeDoPeriodo = useMemo(() => {
    if (period === "Todos") return null;
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    from.setDate(from.getDate() - PERIOD_DAYS[period]);
    return from;
  }, [period]);

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
  // ═══════════════════════════════════════════════════════════════════════
  // O PAR CONFERÊNCIA ↔ ENTREGA
  //
  // A pergunta central de um acervo de comprovantes é "a peça foi entregue
  // como foi conferida?" — e as duas fotos que respondem isso eram cartões
  // independentes, a dezenas de posições de distância na grade, muitas vezes
  // em dias diferentes (o que o agrupamento por dia acentua). Não havia
  // caminho de uma para a outra: só buscar o displayId e conferir na mão.
  //
  // O índice é sobre `photos` (o acervo inteiro), não sobre `filtered`: a
  // contraparte existe independentemente do filtro em vigor, e escondê-la
  // porque o filtro de tipo está em "Conferência" seria dizer "sem foto de
  // entrega" para uma peça que tem.
  // ═══════════════════════════════════════════════════════════════════════
  // O índice de cada foto em `filtered`, para os botões de par e a faixa do
  // zoom: era um `findIndex` DENTRO do render de cada cartão — 60 cartões ×
  // 3.800 fotos = 230 mil comparações por render, refeitas a cada tecla.
  const idxPorId = useMemo(() => {
    const m = new Map<string, number>();
    filtered.forEach((f, i) => m.set(f.id, i));
    return m;
  }, [filtered]);

  const porPeca = useMemo(() => {
    const mapa = new Map<string, { conference: Photo[]; delivery: Photo[] }>();
    for (const f of photos) {
      const chave = pecaDe(f);
      if (!chave) continue;
      let e = mapa.get(chave);
      if (!e) { e = { conference: [], delivery: [] }; mapa.set(chave, e); }
      e[kindOf(f)].push(f);
    }
    // Mais recente primeiro: com duas fotos do mesmo tipo, a contraparte é a
    // última — a que representa o estado atual da peça.
    const maisNova = (a: Photo, b: Photo) =>
      new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    for (const e of Array.from(mapa.values())) {
      e.conference.sort(maisNova);
      e.delivery.sort(maisNova);
    }
    return mapa;
  }, [photos]);

  /** A foto de tipo oposto da mesma peça, ou null. */
  const contraparteDe = (f: Photo): Photo | null => {
    const e = porPeca.get(pecaDe(f));
    if (!e) return null;
    const outras = kindOf(f) === "conference" ? e.delivery : e.conference;
    return outras[0] ?? null;
  };

  /** Todas as fotos daquela peça, em ordem de tempo — a faixa do zoom. */
  const fotosDaPeca = (f: Photo): Photo[] => {
    const e = porPeca.get(pecaDe(f));
    if (!e) return [f];
    return [...e.conference, ...e.delivery]
      .sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());
  };

  // ═══════════════════════════════════════════════════════════════════════
  // AGRUPAMENTO POR DIA
  //
  // A grade era plana: dezenas de cartões seguidos, sem marco temporal, e a
  // única referência era "Exibindo 60 de 240". Um acervo fotográfico se lê em
  // ordem de tempo — a pergunta é "o que entrou hoje".
  //
  // Agrupa a FATIA VISÍVEL, não `filtered` inteiro. "Carregar mais" traz 60 de
  // cada vez e pode partir um dia no meio: isso é aceitável (o grupo seguinte
  // continua), mas contar sobre `filtered` faria o cabeçalho anunciar um
  // número que não está na tela.
  //
  // O índice de cada foto em `filtered` viaja junto: é ele que o zoom usa, e
  // as setas ← → têm de continuar percorrendo o acervo filtrado inteiro, não
  // o grupo.
  // ═══════════════════════════════════════════════════════════════════════
  const gruposPorDia = useMemo(() => {
    const hoje = new Date();
    const out: { rotulo: string; fotos: { p: Photo; idx: number }[] }[] = [];
    filtered.slice(0, visible).forEach((p, idx) => {
      const rotulo = p.createdAt ? rotuloDoDia(p.createdAt, hoje) : "Sem data";
      const ultimo = out[out.length - 1];
      if (ultimo && ultimo.rotulo === rotulo) ultimo.fotos.push({ p, idx });
      else out.push({ rotulo, fotos: [{ p, idx }] });
    });
    return out;
  }, [filtered, visible]);

  // Foto que o clique no par pediu e que ainda nao entrou em `filtered`
  // porque o filtro de tipo a excluia. O efeito abaixo abre quando ela chegar.
  const [alvoDoPar, setAlvoDoPar] = useState<string | null>(null);
  useEffect(() => {
    if (!alvoDoPar) return;
    const i = filtered.findIndex(f => f.id === alvoDoPar);
    if (i < 0) return;
    setZoomIdx(i);
    setAlvoDoPar(null);
  }, [alvoDoPar, filtered]);

  const qtdFiltros = kindFilter.length + eventFilter.length + (period !== "Todos" ? 1 : 0);

  // Bottom sheet dos filtros — só no celular.
  const [sheetAberto, setSheetAberto] = useState(false);

  const [zoomLoading, setZoomLoading] = useState(false);
  useEffect(() => { if (zoomIdx != null) setZoomLoading(true); }, [zoomIdx]);

  const { baixando, baixar } = useBaixarFoto();

  // Alvo de toque: 44px com o dedo (busca, período, limpar e ações do zoom).
  const controlHeight = alvo(36, toque);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", backgroundColor: T.bg }}>
      <style>{`
        /* DESEMPENHO (25/08): as fotos são ORIGINAIS de câmera (megabytes) e a
           tela travava porque todo cartão visível na fatia pintava e
           decodificava a sua. Com content-visibility, cartão FORA da janela
           não pinta, não decodifica — e, como o <img> é lazy, nem baixa: só a
           dúzia em vista custa alguma coisa. O contain-intrinsic-size dá uma
           altura estimada para a rolagem não pular ("auto" guarda a real
           depois da primeira pintura). */
        .reg-cartao { content-visibility: auto; contain-intrinsic-size: auto 430px; }
        @media (max-width: 767px) { .reg-cartao { contain-intrinsic-size: auto 560px; } }
        /* O cartão sobe 2px no hover. Em tela de toque o "hover" gruda depois
           do toque e o cartão fica levantado; com movimento reduzido pedido
           pelo sistema, o salto de 2px continua sendo movimento (a regra
           global só zera a DURAÇÃO da transição, não o deslocamento). */
        @media (hover: none), (prefers-reduced-motion: reduce) { .reg-cartao { transform: none !important; } }
        /* Hover dos botões de apoio. As classes do Tailwind (hover:bg-…) não
           tinham efeito nenhum: o fundo vem inline, e estilo inline vence
           classe. O !important aqui é o que faz o hover existir. */
        .reg-hover-claro { transition: background-color 0.15s; }
        .reg-hover-claro:hover:not(:disabled) { background-color: rgba(28,25,23,0.04) !important; }
        .reg-hover-escuro { transition: background-color 0.15s; }
        .reg-hover-escuro:hover:not(:disabled) { background-color: rgba(255,255,255,0.25) !important; }
        /* O cartão sobe no hover pelo CSS (antes era um par onMouseEnter/Leave
           trocando o estilo na mão). !important só no box-shadow, que vem inline. */
        .reg-cartao { transition: box-shadow 0.15s ease, transform 0.15s ease; }
        .reg-cartao:hover { box-shadow: ${SHADOW.md} !important; transform: translateY(-2px); }
      `}</style>
      {/* ── Cabeçalho ── */}
      <div style={{ flexShrink: 0, backgroundColor: T.surface, borderBottom: `1px solid ${T.border}`, padding: isMobile ? "14px 16px 0" : "20px 32px 0" }}>
        <div style={{ maxWidth: 1600, margin: "0 auto" }}>
          {/* O subtítulo diz DE ONDE as fotos vêm e o que se faz com elas:
              "registro" sozinho não conta a quem chega que é a prova tirada
              pela Gráfica, nem que a foto abre grande. */}
          <CabecalhoDaPagina
            titulo="Registros"
            icone={Camera}
            subtitulo="Fotos que a Gráfica tira ao conferir e ao entregar cada peça — clique numa foto para ampliar"
          />

          {/* Contadores — refletem os filtros ativos e servem de atalho de filtro */}
          <div style={{ display: "flex", gap: isMobile ? 8 : 24, margin: "0 0 16px" }}>
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
              // NO CELULAR ELES SAO ALVO DE TOQUE, nao so numero. Um texto de
              // 11px com sublinhado de 2px e um alvo de ~14px de altura; o
              // cartao de 56px com borda na cor do tipo diz que e clicavel e
              // cabe no dedo.
              return (
                <button key={label} className="group"
                  onClick={() => { setKindFilter(kind && !active ? [kind] : []); setVisible(PAGE_SIZE); }}
                  data-testid={`stat-${kind ?? "total"}`}
                  aria-pressed={active}
                  title={kind ? `Ver só ${label.toLowerCase()}` : "Ver tudo"}
                  style={toque
                    ? {
                        flex: 1, minWidth: 0, minHeight: 56, padding: "8px 10px",
                        display: "flex", flexDirection: "column", justifyContent: "center",
                        backgroundColor: T.surface, borderRadius: R.md,
                        border: `1px solid ${active && kind ? color : T.border}`,
                        textAlign: "left", cursor: "pointer",
                      }
                    : { background: "none", border: "none", padding: 0, textAlign: "left", cursor: "pointer" }}>
                  <p style={{ fontFamily: FONT.display, fontWeight: dim ? FW.medio : FW.forte, fontSize: isMobile ? 20 : FS.h2, color: dim ? T.second : color, margin: 0, lineHeight: 1, transition: "color 0.15s" }}>{n}</p>
                  <p className="group-hover:opacity-80" style={{ fontSize: FS.meta, fontWeight: FW.medio, color: T.second, margin: "4px 0 0", borderBottom: !toque && active && kind ? `2px solid ${color}` : "2px solid transparent", paddingBottom: 2, transition: "border-color 0.15s", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</p>
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
                // 16px no celular: abaixo disso o iOS dá zoom na página ao tocar.
                style={{ width: "100%", height: controlHeight, padding: "0 12px 0 34px", borderRadius: R.md, border: `1px solid ${T.border}`, backgroundColor: T.surface, fontSize: isMobile ? FS.lead : FS.body, color: T.text }}
              />
            </div>
            {/* NO CELULAR OS QUATRO GATILHOS NÃO CABEM. Lado a lado eles
                estouram 390px e embrulham em três fileiras, empurrando a grade
                para fora da primeira tela — numa tela cujo conteúdo é
                justamente a grade. Viram um botão só, com o selo de quantos
                filtros estão ativos, e as opções vão para um sheet onde cada
                linha tem 48px em vez de 28. */}
            {isMobile ? (
              <button
                type="button"
                onClick={() => setSheetAberto(true)}
                aria-haspopup="dialog"
                aria-label={qtdFiltros > 0 ? `Filtros (${qtdFiltros} ativos)` : "Filtros"}
                data-testid="button-open-filters"
                style={{ position: "relative", width: 44, height: 44, flexShrink: 0, borderRadius: R.md, border: `1px solid ${qtdFiltros > 0 ? T.accentText : T.border}`, backgroundColor: T.surface, color: qtdFiltros > 0 ? T.accentText : T.text, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}
              >
                <SlidersHorizontal style={{ width: 18, height: 18 }} />
                {qtdFiltros > 0 && (
                  <span style={{ position: "absolute", top: -6, right: -6, minWidth: 18, height: 18, borderRadius: R.pill, backgroundColor: T.accentText, color: T.surface, fontSize: FS.micro, fontWeight: FW.forte, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 5px" }}>
                    {qtdFiltros}
                  </span>
                )}
              </button>
            ) : (<>
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
            </>)}
            {hasFilters && !isMobile && (
              <Botao variante="fantasma" tamanho={toque ? "toque" : "sm"} onClick={clearAll} data-testid="button-clear-filters">
                Limpar tudo
              </Botao>
            )}
          </div>
        </div>
      </div>

      {/* ── Galeria ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: isMobile ? "16px" : "24px 32px", maxWidth: 1600, margin: "0 auto", width: "100%" }}>
        {/* OS TUBOS (dono, 21/09): o que foi embalado/entregue JUNTO tem UMA
            entrada por tubo, com a lista do que foi — em vez da mesma foto
            repetida em cada peça. Segue o filtro de evento e a busca da página;
            some quando o tipo está filtrado só em Conferência. */}
        {(!kindFilter.length || kindFilter.includes("delivery")) && (
          <div style={{ marginBottom: 16 }}>
            <RegistrosDeTubos eventIds={eventFilter} busca={deferredSearch} desde={desdeDoPeriodo} />
          </div>
        )}
        {isLoading ? (
          /* Skeleton com a silhueta dos cards reais (foto + legenda) — o
             spinner central deixava a tela em branco e causava layout shift. */
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(220px, 1fr))", gap: 20 }} aria-busy="true" aria-label="Carregando registros">
            {[0, 1, 2, 3, 4, 5, 6, 7].map(i => (
              <div key={i} style={{ backgroundColor: T.surface, border: `1px solid ${T.border}`, borderRadius: R.lg, overflow: "hidden" }}>
                {/* A MESMA proporção do cartão real: com 4:3 aqui e 1:1 lá, a
                    grade saltava de altura no instante em que a lista chegava. */}
                <div className="animate-pulse" style={{ width: "100%", aspectRatio: "1/1", backgroundColor: T.low }} />
                <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                  <div className="animate-pulse" style={{ width: "70%", height: 12, borderRadius: 4, backgroundColor: T.border }} />
                  <div className="animate-pulse" style={{ width: "45%", height: 10, borderRadius: 4, backgroundColor: T.low }} />
                </div>
              </div>
            ))}
          </div>
        ) : isError ? (
          /* Sem este ramo, uma falha da API caía no "Nenhum registro ainda" —
             mensagem enganosa para um acervo que existe. */
          // Não é <EstadoErro>: o botão dele não aceita testid, e
          // `button-retry-registros` é o seletor que os testes da tela usam.
          <div role="alert" style={{ textAlign: "center", padding: "56px 24px", borderRadius: R.lg, backgroundColor: TOM.perigo.bg, border: `1px solid ${TOM.perigo.border}` }}>
            <h3 style={{ color: TOM.perigo.text, fontFamily: FONT.display, fontSize: FS.lead, fontWeight: FW.forte, margin: "0 0 6px" }}>Não foi possível carregar os registros</h3>
            <p style={{ color: T.apoio, fontSize: FS.body, margin: "0 0 20px" }}>Verifique sua conexão e tente novamente.</p>
            <Botao variante="secundario" tamanho={toque ? "toque" : "md"} onClick={() => refetch()} data-testid="button-retry-registros">
              Tentar novamente
            </Botao>
          </div>
        ) : filtered.length === 0 ? (
          // O próximo passo onde o olho já está: a saída ficava só na barra
          // de filtros, fora da vista de quem rolou até aqui. Mesmo `clearAll`
          // do "Limpar tudo" da barra.
          <EstadoVazio
            icone={Camera}
            titulo={photos.length === 0 ? "Nenhum registro ainda" : "Nenhum registro com esses filtros"}
            descricao={photos.length === 0
              ? "As fotos aparecem aqui conforme a Gráfica confere e entrega as peças."
              : "Ajuste os filtros para ver outros registros."}
            acao={photos.length > 0 ? (
              <Botao variante="primario" tamanho={toque ? "toque" : "md"} onClick={() => { clearAll(); setVisible(PAGE_SIZE); }} data-testid="button-clear-filters-vazio">
                Limpar filtros
              </Botao>
            ) : undefined}
          />
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
            {gruposPorDia.map(grupo => (
              <div key={grupo.rotulo} style={{ marginBottom: 26 }}>
                {/* CABEÇALHO DO DIA.

                    `top` negativo: o contêiner rolável tem 24px de padding, e
                    sem compensar isso o rótulo gruda 24px abaixo do topo,
                    deixando uma faixa de cartões passando por cima.

                    Gradiente em vez de fundo chapado com borda: uma borda dura
                    corta a foto que passa por baixo dela na rolagem; o
                    gradiente entrega o texto legível e some.

                    No celular o padding do contêiner é 16, não 24: com o
                    mesmo -24 o rótulo subia 8px além da borda e colava no
                    topo, com a primeira linha de texto meio cortada. */}
                <div
                  data-testid={`group-day-${grupo.rotulo}`}
                  style={{
                    position: "sticky", top: -24 + (isMobile ? 8 : 0), zIndex: 2,
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "10px 0 12px",
                    // O rgba é o MESMO T.bg com alfa 0 (#fafaf9 = 250,250,249).
                    // Estava 249,249,248, sobra do fundo antigo: com alfa 0 não
                    // se vê, mas o gradiente passava de um cinza para o outro.
                    background: `linear-gradient(${T.bg} 78%, rgba(250,250,249,0))`,
                  }}
                >
                  <span style={{ fontFamily: FONT.display, fontSize: FS.body, fontWeight: FW.forte, color: T.text, whiteSpace: "nowrap" }}>
                    {grupo.rotulo}
                  </span>
                  <span style={{ fontFamily: FONT.mono, fontSize: FS.small, color: T.apoio, whiteSpace: "nowrap" }}>
                    {grupo.fotos.length} {grupo.fotos.length === 1 ? "registro" : "registros"}
                  </span>
                  <span aria-hidden="true" style={{ flex: 1, height: 1, backgroundColor: T.border }} />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(220px, 1fr))", gap: 20 }}>
              {grupo.fotos.map(({ p, idx }) => {
                return (
                  <CartaoDeFoto
                    key={p.id} p={p} idx={idx}
                    brokenIds={brokenIds} setBrokenIds={setBrokenIds} setZoomIdx={setZoomIdx}
                    baixar={baixar} baixando={baixando} toque={toque}
                    contraparteDe={contraparteDe} idxPorId={idxPorId}
                    setKindFilter={setKindFilter} setAlvoDoPar={setAlvoDoPar}
                  />
                );
              })}
                </div>
              </div>
            ))}

            {visible < filtered.length && (
              <div style={{ display: "flex", justifyContent: "center", marginTop: 20 }}>
                <Botao variante="secundario" tamanho={toque ? "toque" : "md"} larguraCheia={isMobile}
                  onClick={() => setVisible(v => v + PAGE_SIZE)} data-testid="button-load-more">
                  Carregar mais ({filtered.length - visible} restantes)
                </Botao>
              </div>
            )}
          </>
        )}
      </div>

      {/* Filtros no celular: bottom sheet (ver sheet-de-filtros.tsx). */}
      <SheetDeFiltros
        sheetAberto={sheetAberto} setSheetAberto={setSheetAberto} hasFilters={hasFilters} clearAll={clearAll}
        setVisible={setVisible} filtered={filtered}
        kindOptions={kindOptions} kindFilter={kindFilter} setKindFilter={setKindFilter}
        eventOptions={eventOptions} eventFilter={eventFilter} setEventFilter={setEventFilter}
        periodOptions={periodOptions} period={period} setPeriod={setPeriod}
      />

      <ZoomDoRegistro
        zoom={zoom} zoomIdx={zoomIdx} setZoomIdx={setZoomIdx} filtered={filtered} stepZoom={stepZoom}
        zoomLoading={zoomLoading} setZoomLoading={setZoomLoading} isMobile={isMobile}
        fotosDaPeca={fotosDaPeca} idxPorId={idxPorId} baixar={baixar} baixando={baixando}
        controlHeight={controlHeight}
      />
    </div>
  );
}
