import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { Check, LogOut, RotateCcw, Save, Search, SearchX, Layers, X } from "lucide-react";
import { useIsMobile, usePonteiroGrosso } from "@/hooks/use-mobile";
import { T, FS, FW, R, FONT, darkenToContrast } from "@/lib/theme";
import { Botao } from "@/components/ui/botao";
import { Selo } from "@/components/ui/selo";
import { CabecalhoDaPagina } from "@/components/ui/cabecalho-da-pagina";
import { EstadoErro, EstadoVazio } from "@/components/ui/estados";
import { useConfirmar } from "@/components/ui/usar-confirmar";

/* ── Constants ── */
// Pendência anotada: QUOTAS também existe em outras telas — mover para
// shared/ fica para uma rodada dedicada, fora do escopo desta.
// darkenToContrast: MASTER/MIDIA/MINISTERIO usavam tons 500/600 que reprovam
// 4.5:1 sobre os fundos claros; o ajuste escurece só o necessário, na matiz.
// Estes hex NÃO viram TOM.*: são a cor de IDENTIDADE de cada cota, a mesma nas
// outras telas que listam cotas — trocar só aqui descasaria as telas.
const QUOTAS = [
  { key: "MASTER",     label: "Master",     color: darkenToContrast("#ef4444", "#fee2e2"), bg: "#fef2f2", light: "#fee2e2" },
  { key: "GOLD",       label: "Gold",       color: darkenToContrast("#1d4ed8", "#dbeafe"), bg: "#eff6ff", light: "#dbeafe" },
  { key: "SILVER",     label: "Silver",     color: darkenToContrast("#7c3aed", "#ede9fe"), bg: "#f5f3ff", light: "#ede9fe" },
  { key: "APOIO",      label: "Apoio",      color: darkenToContrast("#6b7280", "#f3f4f6"), bg: "#f9fafb", light: "#f3f4f6" },
  { key: "MIDIA",      label: "Mídia",      color: darkenToContrast("#0891b2", "#cffafe"), bg: "#ecfeff", light: "#cffafe" },
  { key: "MINISTERIO", label: "Ministério", color: darkenToContrast("#059669", "#d1fae5"), bg: "#ecfdf5", light: "#d1fae5" },
];

// Listra da zebra — o n1 da escada (mesmo tom do fundo da página).
const STRIPE = T.bg;

const DEFAULT_QUOTA_RULES: Record<string, string[]> = {
  MASTER:     ["Palco", "Gradil", "Pórtico", "Rolo"],
  GOLD:       ["Palco", "Gradil", "Pórtico", "Rolo"],
  SILVER:     ["Palco", "Gradil", "Pórtico"],
  APOIO:      ["Palco", "Gradil", "Pórtico"],
  MIDIA:      ["Palco", "Gradil", "Pórtico", "Rolo"],
  MINISTERIO: [],
};

type GlobalRule = { quota: string; itemTypes: string[] };

// Vazios ESTÁVEIS para o `data = …` das queries. Com `= []` literal, cada
// render sem dado (a query falhou) criava um array novo; como `rules` e
// `groups` são dependências do efeito que semeia a matriz, o efeito rodava a
// cada render, chamava setMatrix com objeto novo e disparava outro render —
// um laço justamente no estado de erro.
const SEM_GRUPOS: string[] = [];
const SEM_REGRAS: GlobalRule[] = [];

export default function ConfigurarCotas() {
  const isMobile = useIsMobile();
  // Alvo de 44px vale para o DEDO em qualquer largura (tablet do galpão), não
  // só abaixo de 768px.
  const ponteiroGrosso = usePonteiroGrosso();
  const toque = isMobile || ponteiroGrosso;
  const { toast } = useToast();
  const { confirmar, dialogo } = useConfirmar();
  // Liberação de UMA navegação já confirmada: o clique é re-disparado depois
  // do "Sair", e a guarda precisa deixá-lo passar.
  const navegacaoLiberadaRef = useRef(false);
  const [matrix, setMatrix] = useState<Record<string, Set<string>>>({});
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  const { data: groups = SEM_GRUPOS, isLoading: groupsLoading, isError: groupsError, refetch: refetchGroups } = useQuery<string[]>({
    queryKey: ["/api/quota-rules/groups"],
  });

  const { data: rules = SEM_REGRAS, isLoading: rulesLoading, isError: rulesError, refetch: refetchRules } = useQuery<GlobalRule[]>({
    queryKey: ["/api/quota-rules/global"],
  });

  const isLoading = groupsLoading || rulesLoading;
  const isError = groupsError || rulesError;

  // A matriz é estado local editável; o servidor é só a origem da semeadura.
  // `seededRef` garante que a carga inicial roda UMA vez; nos refetches
  // seguintes (ex.: pós-save da cota A) o efeito atualiza apenas as cotas SEM
  // edição pendente — sobrescrever matrix[q] de uma cota dirty descartava as
  // marcações de B e limpava o dirty dela em silêncio, tornando mentiroso o
  // aviso "as pendentes continuam marcadas" do salvar em lote.
  const seededRef = useRef(false);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  // O que o SERVIDOR diz para uma cota — a mesma regra de sempre (regra salva;
  // senão vazio se já existe alguma regra; senão o padrão filtrado pelos
  // grupos). Saiu de dentro do efeito para o "Descartar alterações" voltar
  // exatamente ao mesmo ponto que a semeadura usa.
  const fromServer = useCallback((key: string): Set<string> => {
    const rule = rules.find(r => r.quota === key);
    if (rule) return new Set(rule.itemTypes);
    if (rules.length > 0) return new Set();
    const defaults = DEFAULT_QUOTA_RULES[key] ?? [];
    return new Set(groups.length > 0 ? defaults.filter(t => groups.includes(t)) : defaults);
  }, [rules, groups]);

  useEffect(() => {
    if (isLoading) return;

    if (!seededRef.current) {
      seededRef.current = true;
      const m: Record<string, Set<string>> = {};
      for (const q of QUOTAS) m[q.key] = fromServer(q.key);
      // Semear defaults NÃO marca dirty: "alterações pendentes" na primeira
      // visita, sem o usuário ter tocado em nada, era alarme falso — e fazia a
      // guarda de saída disparar à toa. Dirty só nasce de interação real.
      setDirty(new Set());
      setMatrix(m);
      return;
    }

    setMatrix(prev => {
      const m: Record<string, Set<string>> = {};
      for (const q of QUOTAS) {
        m[q.key] = dirtyRef.current.has(q.key)
          ? (prev[q.key] ?? new Set())
          : fromServer(q.key);
      }
      return m;
    });
  }, [rules, groups, isLoading, fromServer]);

  // Guarda de saída: com alteração pendente de verdade, fechar/recarregar a
  // aba pergunta antes de descartar.
  useEffect(() => {
    if (dirty.size === 0) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty.size]);

  // Guarda da NAVEGAÇÃO INTERNA — a pendência que o beforeunload não cobre.
  //
  // O app não tem bloqueador de rota (o wouter 3 não oferece um), e um clique
  // na sidebar trocava de tela jogando fora a matriz editada sem perguntar.
  // O caminho seguro, sem mexer no roteador: ouvir o clique em CAPTURA no
  // `document`. A captura no document roda ANTES do ouvinte que o React
  // registra na raiz do app, então, se a pessoa recusar, `preventDefault` +
  // `stopPropagation` impedem tanto a navegação nativa do <a> quanto o
  // `navigate()` do <Link> do wouter (que nem chega a ver o clique).
  //
  // Só intercepta o que de fato sai desta tela pelo mesmo app: clique
  // primário, sem Ctrl/⌘/Shift/Alt (abrir em outra aba não perde nada), sem
  // target=_blank nem download, mesma origem e OUTRO caminho.
  // Fica de fora (e está relatado): navegação por código — `setLocation` do
  // sino de notificações e da busca global — e o Voltar do navegador.
  useEffect(() => {
    if (dirty.size === 0) return;
    const aoClicar = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const alvo = e.target instanceof Element ? e.target.closest("a[href]") : null;
      if (!(alvo instanceof HTMLAnchorElement)) return;
      if ((alvo.target && alvo.target !== "_self") || alvo.hasAttribute("download")) return;
      const destino = new URL(alvo.href, window.location.href);
      if (destino.origin !== window.location.origin || destino.pathname === window.location.pathname) return;
      // A pergunta agora é o diálogo do app, que é ASSÍNCRONO: o clique é
      // barrado já, e só depois do "Sair" o mesmo link é clicado de novo, com
      // a guarda liberada para aquela única passagem.
      if (navegacaoLiberadaRef.current) { navegacaoLiberadaRef.current = false; return; }
      e.preventDefault();
      e.stopPropagation();
      const n = dirtyRef.current.size;
      void confirmar({
        titulo: n === 1 ? "Uma cota tem alterações que não foram salvas" : `${n} cotas têm alterações que não foram salvas`,
        descricao: "Sair desta tela e descartar as marcações?",
        confirmar: "Sair e descartar",
        cancelar: "Continuar editando",
        perigo: true,
        icone: LogOut,
      }).then((ok) => {
        if (!ok) return;
        navegacaoLiberadaRef.current = true;
        alvo.click();
      });
    };
    document.addEventListener("click", aoClicar, true);
    return () => document.removeEventListener("click", aoClicar, true);
  }, [dirty.size, confirmar]);

  const filteredGroups = useMemo(() => {
    if (!search.trim()) return groups;
    const q = search.toLowerCase();
    return groups.filter(g => g.toLowerCase().includes(q));
  }, [groups, search]);

  const saveMutation = useMutation({
    mutationFn: async ({ quota, itemTypes }: { quota: string; itemTypes: string[] }) => {
      const res = await apiRequest("PUT", `/api/quota-rules/global`, { quota, itemTypes });
      return res.json();
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/quota-rules/global"] });
      setDirty(prev => { const n = new Set(prev); n.delete(vars.quota); return n; });
    },
    // Erro E sucesso são avisados por chamada: toast individual no saveQuota,
    // resumo agregado no saveAll. O toast de sucesso morava aqui e disparava
    // uma vez POR COTA no "Salvar Tudo" — seis toasts empilhados, com a chave
    // crua ("MINISTERIO") em vez do rótulo.
  });

  const rotuloDaCota = (key: string) => QUOTAS.find(q => q.key === key)?.label ?? key;

  const toggleCell = (quota: string, type: string) => {
    setMatrix(prev => {
      const cur = new Set(prev[quota] ?? []);
      if (cur.has(type)) cur.delete(type); else cur.add(type);
      return { ...prev, [quota]: cur };
    });
    setDirty(prev => new Set(prev).add(quota));
  };

  // Todos/Limpar operam sobre os grupos VISÍVEIS (filteredGroups): com a busca
  // ativa, marcar/desmarcar linhas que a pessoa não está vendo era efeito
  // colateral invisível. Sem busca, filteredGroups === groups.
  const selectAll = (quota: string) => {
    setMatrix(prev => {
      const cur = new Set(prev[quota] ?? []);
      for (const g of filteredGroups) cur.add(g);
      return { ...prev, [quota]: cur };
    });
    setDirty(prev => new Set(prev).add(quota));
  };

  const clearAll = (quota: string) => {
    setMatrix(prev => {
      const cur = new Set(prev[quota] ?? []);
      for (const g of filteredGroups) cur.delete(g);
      return { ...prev, [quota]: cur };
    });
    setDirty(prev => new Set(prev).add(quota));
  };

  const saveQuota = (quota: string) => {
    const n = matrix[quota]?.size ?? 0;
    saveMutation.mutate(
      { quota, itemTypes: Array.from(matrix[quota] ?? []) },
      {
        onSuccess: () => toast({ variant: "success", title: `Cota ${rotuloDaCota(quota)} salva`, description: `${n} grupo${n !== 1 ? "s" : ""} de peça. Vale no próximo Auto-vincular — vínculos já feitos não mudam.` }),
        onError: (e: any) => toast({ variant: "destructive", title: `Não foi possível salvar a cota ${rotuloDaCota(quota)}`, description: e.message }),
      },
    );
  };

  // Uma falha no meio não pode abortar o lote em silêncio: salva o que der,
  // acumula o que falhou e reporta "salvas N de M — X e Y falharam".
  const saveAll = async () => {
    const pending = Array.from(dirty);
    const failed: string[] = [];
    for (const q of pending) {
      try {
        await saveMutation.mutateAsync({ quota: q, itemTypes: Array.from(matrix[q] ?? []) });
      } catch {
        failed.push(q);
      }
    }
    if (failed.length > 0) {
      const labels = failed.map(k => QUOTAS.find(q => q.key === k)?.label ?? k).join(", ");
      toast({
        variant: "destructive",
        title: `Salvas ${pending.length - failed.length} de ${pending.length} cotas`,
        description: `Falharam: ${labels}. As pendentes continuam marcadas — tente salvar de novo.`,
      });
    } else if (pending.length > 0) {
      toast({ variant: "success", title: pending.length === 1 ? "Cota salva" : `${pending.length} cotas salvas`, description: `${pending.map(rotuloDaCota).join(", ")}. Vale no próximo Auto-vincular — vínculos já feitos não mudam.` });
    }
  };

  // DESCARTAR — volta as cotas com alteração pendente ao que o servidor tem,
  // pela mesma `fromServer` da semeadura. Antes o único jeito de desfazer uma
  // bagunça de cliques era recarregar a página (e passar pelo aviso do
  // beforeunload). Pergunta antes: são marcações que a pessoa fez à mão.
  const descartarAlteracoes = async () => {
    const pendentes = Array.from(dirty);
    if (pendentes.length === 0) return;
    const nomes = pendentes.map(rotuloDaCota).join(", ");
    // Perigo: joga fora marcações feitas à mão, sem volta.
    const ok = await confirmar({
      titulo: `Descartar as alterações de ${pendentes.length === 1 ? "1 cota" : `${pendentes.length} cotas`} (${nomes})?`,
      descricao: "As marcações voltam ao que está salvo.",
      confirmar: "Descartar",
      cancelar: "Manter",
      perigo: true,
      icone: RotateCcw,
    });
    if (!ok) return;
    setMatrix(prev => {
      const m = { ...prev };
      for (const q of pendentes) m[q] = fromServer(q);
      return m;
    });
    setDirty(new Set());
    toast({ variant: "success", title: "Alterações descartadas", description: `${nomes} ${pendentes.length === 1 ? "voltou" : "voltaram"} ao que está salvo.` });
  };

  // SETAS NA GRADE. Com 25 grupos × 6 cotas eram 150 paradas de Tab para
  // chegar à última célula — a grade era "acessível por teclado" só no
  // papel. Setas andam uma célula (Home/End vão ao começo/fim da linha);
  // Espaço/Enter continuam marcando. Busca pelo atributo, não por ref: as
  // linhas mudam com o filtro e a posição (idx) já é a da lista visível.
  const moverNaGrade = (e: React.KeyboardEvent<HTMLDivElement>, lin: number, col: number) => {
    const destino: Record<string, [number, number]> = {
      ArrowUp: [lin - 1, col], ArrowDown: [lin + 1, col],
      ArrowLeft: [lin, col - 1], ArrowRight: [lin, col + 1],
      Home: [lin, 0], End: [lin, QUOTAS.length - 1],
    };
    const alvo = destino[e.key];
    if (!alvo) return;
    const [l, c] = alvo;
    if (l < 0 || c < 0 || c >= QUOTAS.length || l >= filteredGroups.length) return;
    e.preventDefault();
    document.querySelector<HTMLElement>(`[data-cota-lin="${l}"][data-cota-col="${c}"]`)?.focus();
  };

  // CTRL+S / ⌘+S salva tudo — o atalho que a mão já faz numa grade editável.
  // Sem pendência não faz nada além de não abrir o "Salvar página" do
  // navegador (que aqui só baixaria um HTML inútil).
  const saveAllRef = useRef(saveAll);
  saveAllRef.current = saveAll;
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "s") return;
      e.preventDefault();
      if (dirtyRef.current.size > 0 && !saveMutation.isPending) saveAllRef.current();
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [saveMutation.isPending]);

  // LARGURA MÍNIMA por coluna: com `1fr` puro, em 375px as seis cotas
  // espremiam-se em ~30px cada e o rótulo "Ministério" quebrava letra a letra.
  // Com piso, a matriz passa a rolar na horizontal dentro do card — que já é o
  // scrollport das duas direções, com a coluna de grupo grudada à esquerda.
  const COL_GRUPO = isMobile ? 132 : 200;
  const COL_COTA = isMobile ? 88 : 100;
  const COLS = `${COL_GRUPO}px repeat(${QUOTAS.length}, minmax(${COL_COTA}px, 1fr))`;
  const GRID_MIN = COL_GRUPO + QUOTAS.length * COL_COTA;

  return (
    <div style={{ backgroundColor: T.bg, height: "100%", overflowY: "auto", padding: isMobile ? "16px 16px 48px" : "28px 32px 64px" }}>

      {/* ── Header ── Mesmo cabeçalho das outras telas de administração:
          título e estado à esquerda, pendência + ações à direita. */}
      {/* AVISO + AÇÕES DE PENDÊNCIA. O "N cotas com alterações" morava só no
          rodapé da matriz — que, com muitos grupos, fica abaixo da dobra — e
          a única saída era salvar. Agora o estado fica à vista no topo, com
          as duas saídas lado a lado: descartar (secundário) e salvar tudo
          (primário). A região viva (sempre montada, só o texto muda) avisa o
          leitor de tela quando a contagem muda — sem reler os botões. */}
      <CabecalhoDaPagina
        titulo="Configurar Cotas"
        subtitulo={isLoading || isError ? undefined : `${groups.length} grupo${groups.length !== 1 ? "s" : ""} de peça em ${QUOTAS.length} cotas`}
        acoes={
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", width: isMobile ? "100%" : undefined }}>
            <span className="sr-only" aria-live="polite">
              {dirty.size === 0 ? "" : dirty.size === 1 ? "1 cota com alterações não salvas" : `${dirty.size} cotas com alterações não salvas`}
            </span>
            {dirty.size > 0 && (
              <>
                <Selo
                  tom="laranja"
                  ponto
                  data-testid="aviso-alteracoes-nao-salvas"
                  style={{ height: 32, padding: "0 12px", fontSize: FS.meta, animation: "norte-surge 0.18s ease-out", flex: isMobile ? "1 1 100%" : undefined, justifyContent: isMobile ? "center" : undefined }}
                >
                  {dirty.size === 1 ? "1 cota com alterações não salvas" : `${dirty.size} cotas com alterações não salvas`}
                </Selo>
                <Botao
                  variante="secundario"
                  tamanho={toque ? "toque" : "md"}
                  icone={RotateCcw}
                  onClick={descartarAlteracoes}
                  disabled={saveMutation.isPending}
                  data-testid="discard-all-button"
                  style={{ flex: isMobile ? "1 1 0" : undefined }}
                >
                  Descartar alterações
                </Botao>
                <Botao
                  variante="primario"
                  tamanho={toque ? "toque" : "md"}
                  icone={Save}
                  onClick={saveAll}
                  carregando={saveMutation.isPending}
                  data-testid="save-all-button"
                  style={{ flex: isMobile ? "1 1 0" : undefined }}
                >
                  {saveMutation.isPending ? "Salvando…" : `Salvar Tudo (${dirty.size})`}
                </Botao>
              </>
            )}
          </div>
        }
      />
      <div style={{ margin: "-8px 0 24px" }}>
        <p style={{ fontSize: FS.body, color: T.second, margin: 0, lineHeight: 1.5, maxWidth: 640 }}>
          Defina quais grupos de peças cada cota de patrocinador recebe. Configuração global usada no Auto-vincular.
        </p>
        {/* PARA QUE SERVE E ONDE APARECE DEPOIS. "Auto-vincular" sozinho não
            dizia onde fica, de onde vem a cota de cada patrocinador nem se
            salvar mexe no que já está vinculado. Cada frase vem do código:
            a cota é do vínculo evento↔patrocinador (eventos.tsx, seletor de
            cota); a regra só é lida por previewAutoLink/autoLinkByQuota
            (server/storage.ts), que casa o grupo pelo INÍCIO do tipo da
            peça ("Palco" pega "Palco Lateral") e só CRIA vínculo que falta. */}
        <ul data-testid="cotas-como-funciona" style={{ margin: "12px 0 0", padding: "10px 14px 10px 30px", maxWidth: 700, borderRadius: R.md, backgroundColor: T.surface, border: `1px solid ${T.border}`, fontSize: FS.meta, lineHeight: 1.55, color: T.strong, display: "flex", flexDirection: "column", gap: 3 }}>
          <li>A cota de cada patrocinador (Master, Gold…) é escolhida no evento, ao vinculá-lo.</li>
          <li>
            Em{" "}
            <Link href="/vincular-patrocinadores" style={{ color: T.accentText, fontWeight: FW.forte, textDecoration: "underline", textUnderlineOffset: 2 }}>Vincular Patrocinadores</Link>
            , o botão <strong>Auto-vincular por cota</strong> dá a cada patrocinador as peças dos grupos marcados na coluna da cota dele — o grupo “Palco” também pega “Palco Lateral”.
          </li>
          <li>Salvar aqui não muda vínculos já feitos: vale a partir do próximo Auto-vincular, em qualquer evento.</li>
        </ul>
      </div>

      {/* ── Matrix card ── */}
      {/* O card é o ÚNICO contêiner de rolagem (as duas direções): sticky-top
          e sticky-left grudam no mesmo scrollport. Antes, quem rolava era a
          página e o card só clipava — o cabeçalho sticky ficava inerte. */}
      <div style={{ backgroundColor: T.surface, borderRadius: R.lg, border: `1px solid ${T.border}`, overflow: "auto", maxHeight: isMobile ? "calc(100vh - 150px)" : "calc(100vh - 230px)" }}>

        {/* ── Sticky header ── */}
        <div style={{
          position: "sticky", top: 0, zIndex: 10,
          display: "grid", gridTemplateColumns: COLS, minWidth: GRID_MIN,
          borderBottom: `2px solid ${T.border}`,
          backgroundColor: T.surface,
          boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
        }}>
          {/* Left corner: search — sticky à esquerda para a coluna de grupo
              não sumir no scroll horizontal */}
          <div style={{ position: "sticky", left: 0, zIndex: 11, backgroundColor: T.surface, padding: "14px 16px", borderRight: `1px solid ${T.border}`, display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 8 }}>
            <span style={{ fontSize: FS.micro, fontWeight: FW.rotulo, color: T.second, textTransform: "uppercase", letterSpacing: "0.16em", fontFamily: FONT.display }}>
              Grupo de Peça
            </span>
            {groups.length > 6 && (
              <div style={{ position: "relative" }}>
                <Search aria-hidden="true" style={{ position: "absolute", left: 7, top: "50%", transform: "translateY(-50%)", width: 12, height: 12, color: T.muted }} />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Filtrar grupos..."
                  aria-label="Filtrar grupos de peça"
                  data-testid="input-search-groups"
                  // Sem `outline: none`: o inline vencia o anel de foco global
                  // (:focus-visible) e quem navega por teclado perdia o cursor.
                  style={{ width: "100%", height: toque ? 44 : 30, padding: "0 26px 0 24px", fontSize: isMobile ? FS.lead : FS.meta, border: `1px solid ${T.border}`, borderRadius: R.sm, background: T.low, color: T.text, boxSizing: "border-box" }}
                />
                {search && (
                  <button type="button" onClick={() => setSearch("")} aria-label="Limpar filtro de grupos" style={{ position: "absolute", right: 2, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", padding: 6, display: "flex", borderRadius: R.sm }}>
                    <X aria-hidden="true" style={{ width: 12, height: 12, color: T.second }} />
                  </button>
                )}
              </div>
            )}
            {!isLoading && (
              <span style={{ fontSize: FS.micro, color: T.second, fontWeight: FW.medio }}>
                {search ? `${filteredGroups.length} de ${groups.length}` : `${groups.length} grupos`}
              </span>
            )}
          </div>

          {/* Quota columns */}
          {QUOTAS.map(q => {
            const count = matrix[q.key]?.size ?? 0;
            const isDirtyQ = dirty.has(q.key);
            return (
              <div key={q.key} style={{
                padding: "14px 10px 12px",
                borderLeft: `1px solid ${T.border}`,
                display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                backgroundColor: isDirtyQ ? q.bg : T.surface,
                transition: "background 0.15s",
              }}>
                {/* Label + count */}
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: FS.small, fontWeight: FW.rotulo, color: q.color, textTransform: "uppercase", letterSpacing: "0.1em", fontFamily: FONT.display }}>
                    {q.label}
                  </div>
                  <div style={{
                    marginTop: 3,
                    display: "inline-block",
                    padding: "1px 8px",
                    borderRadius: R.pill,
                    backgroundColor: count > 0 ? q.light : T.low,
                    fontSize: FS.micro, fontWeight: FW.forte,
                    color: count > 0 ? q.color : T.second,
                  }}>
                    {count} grupo{count !== 1 ? "s" : ""}
                  </div>
                  {/* O fundo colorido era o ÚNICO sinal de coluna com alteração
                      pendente — e a própria coluna já usa essa cor quando a
                      célula está marcada. O rótulo tira a ambiguidade. */}
                  {isDirtyQ && (
                    <div style={{ marginTop: 3, fontSize: FS.micro, fontWeight: FW.rotulo, color: T.accentText, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                      não salvo
                    </div>
                  )}
                </div>

                {/* Actions row — quebra linha: no celular a coluna tem 88px e
                    Todos + Limpar + salvar, com alvo de 44px, somavam ~150 e
                    invadiam a coluna vizinha. Nada abaixo de 10px de fonte. */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flexWrap: "wrap", gap: 3 }}>
                  {/* Todos/Limpar ficam <button> nativo: são chips na cor da cota,
                      desenho que o Botao não tem. Alvo de 44px pelo ponteiro. */}
                  <button
                    type="button"
                    onClick={() => selectAll(q.key)}
                    data-testid={`btn-all-${q.key}`}
                    aria-label={`Marcar todos os grupos para a cota ${q.label}`}
                    style={{ fontSize: FS.micro, fontWeight: FW.forte, color: q.color, background: q.bg, border: `1px solid ${q.light}`, borderRadius: R.sm, padding: toque ? "12px 10px" : "0 8px", minHeight: toque ? 44 : 24, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.06em" }}
                  >
                    Todos
                  </button>
                  <button
                    type="button"
                    onClick={() => clearAll(q.key)}
                    data-testid={`btn-clear-${q.key}`}
                    aria-label={`Desmarcar todos os grupos da cota ${q.label}`}
                    style={{ fontSize: FS.micro, fontWeight: FW.forte, color: T.second, background: T.low, border: `1px solid ${T.border}`, borderRadius: R.sm, padding: toque ? "12px 10px" : "0 8px", minHeight: toque ? 44 : 24, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.06em" }}
                  >
                    Limpar
                  </button>
                  {isDirtyQ && (
                    <button
                      type="button"
                      onClick={() => saveQuota(q.key)}
                      disabled={saveMutation.isPending}
                      data-testid={`save-quota-${q.key}`}
                      aria-label={`Salvar regras da cota ${q.label}`}
                      style={{ display: "flex", alignItems: "center", justifyContent: "center", width: toque ? 44 : 24, height: toque ? 44 : 24, backgroundColor: T.dark, border: "none", borderRadius: R.sm, cursor: saveMutation.isPending ? "wait" : "pointer", opacity: saveMutation.isPending ? 0.6 : 1, flexShrink: 0 }}
                      title={`Salvar ${q.label}`}
                    >
                      <Save aria-hidden="true" style={{ width: 11, height: 11, color: T.surface }} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Rows ── */}
        {isLoading ? (
          // Esqueleto na silhueta das linhas da matriz. O pulso era um
          // `animation` inline, que ignorava "reduzir movimento"; agora é o
          // `motion-safe:` das outras telas.
          <div role="status" aria-label="Carregando regras de cota" style={{ minWidth: GRID_MIN }}>
            {[...Array(6)].map((_, i) => (
              <div key={i} className="motion-safe:animate-pulse" style={{ display: "grid", gridTemplateColumns: COLS, borderBottom: `1px solid ${T.border}` }}>
                <div style={{ padding: "13px 16px", borderRight: `1px solid ${T.border}` }}>
                  <div style={{ width: "70%", height: 12, borderRadius: R.sm, backgroundColor: T.low }} />
                </div>
                {QUOTAS.map(q => (
                  <div key={q.key} style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: toque ? 44 : 40, borderLeft: `1px solid ${T.border}` }}>
                    <div style={{ width: 18, height: 18, borderRadius: R.sm, backgroundColor: T.low }} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : isError ? (
          <div style={{ padding: 16, position: "sticky", left: 0, maxWidth: "100%" }}>
            <EstadoErro
              compacto
              titulo="Não foi possível carregar as regras de cota"
              detalhe="Verifique sua conexão e tente novamente."
              aoTentarDeNovo={() => { refetchGroups(); refetchRules(); }}
            />
          </div>
        ) : filteredGroups.length === 0 ? (
          <div style={{ padding: 16, position: "sticky", left: 0, maxWidth: "100%" }}>
            {search ? (
              // Mesmo botão "Limpar filtros" dos vazios de Usuários, Logs e
              // Patrocinadores — era um link laranja solto.
              <EstadoVazio
                compacto
                icone={SearchX}
                titulo={`Nenhum grupo encontrado para "${search}"`}
                acao={<Botao variante="secundario" onClick={() => setSearch("")}>Limpar filtro</Botao>}
              />
            ) : (
              // De onde vêm as linhas: /api/quota-rules/groups junta o `type`
              // dos Modelos e das peças. Dizer as duas portas.
              <EstadoVazio
                compacto
                icone={Layers}
                titulo="Nenhum grupo de peça encontrado"
                descricao={<>Os grupos vêm do Tipo dos <Link href="/modelos" style={{ color: T.accentText, fontWeight: FW.forte, textDecoration: "underline" }}>Modelos</Link> e das peças dos eventos — cadastre um modelo ou importe um evento para eles aparecerem.</>}
              />
            )}
          </div>
        ) : (
          filteredGroups.map((group, idx) => {
            const isEven = idx % 2 === 0;
            return (
              <div
                key={group}
                style={{
                  display: "grid", gridTemplateColumns: COLS, minWidth: GRID_MIN,
                  borderBottom: idx < filteredGroups.length - 1 ? `1px solid ${T.border}` : "none",
                  backgroundColor: isEven ? T.surface : STRIPE,
                }}
              >
                {/* Group name — sticky à esquerda, acompanha o cabeçalho */}
                <div style={{ position: "sticky", left: 0, zIndex: 1, backgroundColor: isEven ? T.surface : STRIPE, padding: "10px 16px", display: "flex", alignItems: "center", borderRight: `1px solid ${T.border}` }}>
                  <span style={{ fontSize: FS.meta, fontWeight: FW.medio, color: T.text, fontFamily: FONT.display }}>
                    {group}
                  </span>
                </div>

                {/* Quota cells */}
                {QUOTAS.map((q, col) => {
                  const checked = matrix[q.key]?.has(group) ?? false;
                  return (
                    <div
                      key={q.key}
                      role="checkbox"
                      aria-checked={checked}
                      aria-label={`${group} na cota ${q.label}`}
                      tabIndex={0}
                      data-cota-lin={idx}
                      data-cota-col={col}
                      onClick={() => toggleCell(q.key, group)}
                      onKeyDown={e => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          toggleCell(q.key, group);
                          return;
                        }
                        moverNaGrade(e, idx, col);
                      }}
                      data-testid={`cell-${q.key}-${group}`}
                      style={{
                        borderLeft: `1px solid ${T.border}`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        cursor: "pointer",
                        backgroundColor: checked ? q.bg : "transparent",
                        transition: "background 0.1s",
                        minHeight: toque ? 44 : 40,
                      }}
                    >
                      <div style={{
                        width: 18, height: 18, borderRadius: R.sm,
                        border: checked ? `2px solid ${q.color}` : `2px solid ${T.border}`,
                        backgroundColor: checked ? q.color : "transparent",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        transition: "all 0.12s",
                        flexShrink: 0,
                      }}>
                        {checked && <Check aria-hidden="true" style={{ width: 11, height: 11, color: T.surface }} />}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })
        )}

        {/* ── Footer ── */}
        {!isLoading && groups.length > 0 && (
          <div style={{ padding: "10px 16px", backgroundColor: T.low, borderTop: `2px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <span style={{ fontSize: FS.small, color: T.second, fontWeight: FW.medio }}>
              {/* Os atalhos só existem se forem ditos: setas e Ctrl+S não se
                  descobrem sozinhos numa grade de caixinhas. */}
              {filteredGroups.length} de {groups.length} grupo{groups.length !== 1 ? "s" : ""}{toque ? " · toque na célula para marcar" : " · clique ou Espaço marca · setas andam na grade · Ctrl+S salva tudo"}
            </span>
            {dirty.size > 0 && (
              <span style={{ fontSize: FS.small, fontWeight: FW.forte, color: T.accentText }}>
                {dirty.size} cota{dirty.size !== 1 ? "s" : ""} com alterações — lembre de salvar
              </span>
            )}
          </div>
        )}
      </div>
      {dialogo}
    </div>
  );
}
