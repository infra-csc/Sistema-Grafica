import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Check, RotateCcw, Save, Search, X } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { T, FS, R, darkenToContrast } from "@/lib/theme";

/* ── Constants ── */
// Pendência anotada: QUOTAS também existe em outras telas — mover para
// shared/ fica para uma rodada dedicada, fora do escopo desta.
// darkenToContrast: MASTER/MIDIA/MINISTERIO usavam tons 500/600 que reprovam
// 4.5:1 sobre os fundos claros; o ajuste escurece só o necessário, na matiz.
const QUOTAS = [
  { key: "MASTER",     label: "Master",     color: darkenToContrast("#ef4444", "#fee2e2"), bg: "#fef2f2", light: "#fee2e2" },
  { key: "GOLD",       label: "Gold",       color: darkenToContrast("#1d4ed8", "#dbeafe"), bg: "#eff6ff", light: "#dbeafe" },
  { key: "SILVER",     label: "Silver",     color: darkenToContrast("#7c3aed", "#ede9fe"), bg: "#f5f3ff", light: "#ede9fe" },
  { key: "APOIO",      label: "Apoio",      color: darkenToContrast("#6b7280", "#f3f4f6"), bg: "#f9fafb", light: "#f3f4f6" },
  { key: "MIDIA",      label: "Mídia",      color: darkenToContrast("#0891b2", "#cffafe"), bg: "#ecfeff", light: "#cffafe" },
  { key: "MINISTERIO", label: "Ministério", color: darkenToContrast("#059669", "#d1fae5"), bg: "#ecfdf5", light: "#d1fae5" },
];

// Listra da zebra — tom local, não existe no theme compartilhado.
const STRIPE = "#fafaf9";

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
  const { toast } = useToast();
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
      const n = dirtyRef.current.size;
      const ok = window.confirm(
        `${n === 1 ? "Uma cota tem alterações que não foram salvas" : `${n} cotas têm alterações que não foram salvas`}.\n\nSair desta tela e descartar as marcações?`,
      );
      if (ok) return;
      e.preventDefault();
      e.stopPropagation();
    };
    document.addEventListener("click", aoClicar, true);
    return () => document.removeEventListener("click", aoClicar, true);
  }, [dirty.size]);

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
        onSuccess: () => toast({ title: `Cota ${rotuloDaCota(quota)} salva`, description: `${n} grupo${n !== 1 ? "s" : ""} de peça no Auto-vincular.` }),
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
      toast({ title: pending.length === 1 ? "Cota salva" : `${pending.length} cotas salvas`, description: pending.map(rotuloDaCota).join(", ") });
    }
  };

  // DESCARTAR — volta as cotas com alteração pendente ao que o servidor tem,
  // pela mesma `fromServer` da semeadura. Antes o único jeito de desfazer uma
  // bagunça de cliques era recarregar a página (e passar pelo aviso do
  // beforeunload). Pergunta antes: são marcações que a pessoa fez à mão.
  const descartarAlteracoes = () => {
    const pendentes = Array.from(dirty);
    if (pendentes.length === 0) return;
    const nomes = pendentes.map(rotuloDaCota).join(", ");
    if (!window.confirm(`Descartar as alterações de ${pendentes.length === 1 ? "1 cota" : `${pendentes.length} cotas`} (${nomes})?\n\nAs marcações voltam ao que está salvo.`)) return;
    setMatrix(prev => {
      const m = { ...prev };
      for (const q of pendentes) m[q] = fromServer(q);
      return m;
    });
    setDirty(new Set());
    toast({ title: "Alterações descartadas", description: `${nomes} ${pendentes.length === 1 ? "voltou" : "voltaram"} ao que está salvo.` });
  };

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

      {/* ── Header ── */}
      {/* Mesmo cabeçalho das outras telas de administração: título + frase à
          esquerda, ações à direita. O sobretítulo laranja saiu; "Auto-vincular"
          continua dito na frase. */}
      <div style={{ marginBottom: 24, display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
        <div>
          <h1 style={{ fontSize: FS.h1, fontWeight: 700, color: T.text, margin: "0 0 6px", fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "-0.03em", lineHeight: 1.1 }}>
            Configurar Cotas
          </h1>
          <p style={{ fontSize: FS.body, color: T.second, margin: 0, lineHeight: 1.5, maxWidth: 640 }}>
            Defina quais grupos de peças cada cota de patrocinador recebe. Configuração global usada no Auto-vincular.
          </p>
        </div>
        {/* AVISO + AÇÕES DE PENDÊNCIA. O "N cotas com alterações" morava só no
            rodapé da matriz — que, com muitos grupos, fica abaixo da dobra — e
            a única saída era salvar. Agora o estado fica à vista no topo, com
            as duas saídas lado a lado: descartar (secundário) e salvar tudo
            (primário). A região viva (sempre montada, só o texto muda) avisa o
            leitor de tela quando a contagem muda — sem reler os botões. */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", width: isMobile ? "100%" : undefined }}>
          <span className="sr-only" aria-live="polite">
            {dirty.size === 0 ? "" : dirty.size === 1 ? "1 cota com alterações não salvas" : `${dirty.size} cotas com alterações não salvas`}
          </span>
          {dirty.size > 0 && (
            <>
              <span data-testid="aviso-alteracoes-nao-salvas" style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 32, padding: "0 12px", borderRadius: 999, backgroundColor: "#fff7ed", border: "1px solid #fed7aa", color: "#9a3412", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", animation: "norte-surge 0.18s ease-out", flex: isMobile ? "1 1 100%" : undefined, justifyContent: isMobile ? "center" : undefined }}>
                <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: "#f97316" }} />
                {dirty.size === 1 ? "1 cota com alterações não salvas" : `${dirty.size} cotas com alterações não salvas`}
              </span>
              <button
                type="button"
                onClick={descartarAlteracoes}
                disabled={saveMutation.isPending}
                data-testid="discard-all-button"
                style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, height: 40, padding: "0 16px", backgroundColor: T.surface, color: T.text, border: `1px solid ${T.bdark}`, borderRadius: R.md, cursor: saveMutation.isPending ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", whiteSpace: "nowrap", opacity: saveMutation.isPending ? 0.6 : 1, flex: isMobile ? "1 1 0" : undefined, transition: "background-color 0.15s ease" }}
                onMouseEnter={e => { if (!saveMutation.isPending) e.currentTarget.style.backgroundColor = T.low; }}
                onMouseLeave={e => { e.currentTarget.style.backgroundColor = T.surface; }}
              >
                <RotateCcw aria-hidden="true" style={{ width: 14, height: 14 }} />
                Descartar alterações
              </button>
              <button
                type="button"
                onClick={saveAll}
                disabled={saveMutation.isPending}
                aria-busy={saveMutation.isPending}
                data-testid="save-all-button"
                style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, height: 40, padding: "0 18px", backgroundColor: T.dark, color: "#fff", border: "none", borderRadius: R.md, cursor: saveMutation.isPending ? "wait" : "pointer", fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", whiteSpace: "nowrap", opacity: saveMutation.isPending ? 0.7 : 1, flex: isMobile ? "1 1 0" : undefined, transition: "background-color 0.15s ease" }}
                onMouseEnter={e => { if (!saveMutation.isPending) e.currentTarget.style.backgroundColor = "#292524"; }}
                onMouseLeave={e => { e.currentTarget.style.backgroundColor = T.dark; }}
              >
                <Save aria-hidden="true" style={{ width: 14, height: 14 }} />
                {saveMutation.isPending ? "Salvando…" : `Salvar Tudo (${dirty.size})`}
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Matrix card ── */}
      {/* O card é o ÚNICO contêiner de rolagem (as duas direções): sticky-top
          e sticky-left grudam no mesmo scrollport. Antes, quem rolava era a
          página e o card só clipava — o cabeçalho sticky ficava inerte. */}
      <div style={{ backgroundColor: T.surface, borderRadius: 12, border: `1px solid ${T.border}`, overflow: "auto", maxHeight: isMobile ? "calc(100vh - 150px)" : "calc(100vh - 230px)" }}>

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
            <span style={{ fontSize: 10, fontWeight: 900, color: T.second, textTransform: "uppercase", letterSpacing: "0.16em", fontFamily: "'Space Grotesk', sans-serif" }}>
              Grupo de Peça
            </span>
            {groups.length > 6 && (
              <div style={{ position: "relative" }}>
                <Search style={{ position: "absolute", left: 7, top: "50%", transform: "translateY(-50%)", width: 12, height: 12, color: T.muted }} />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Filtrar grupos..."
                  aria-label="Filtrar grupos de peça"
                  data-testid="input-search-groups"
                  // Sem `outline: none`: o inline vencia o anel de foco global
                  // (:focus-visible) e quem navega por teclado perdia o cursor.
                  style={{ width: "100%", height: isMobile ? 40 : 30, padding: "0 26px 0 24px", fontSize: 12, border: `1px solid ${T.border}`, borderRadius: R.sm, background: T.low, color: T.text, boxSizing: "border-box" }}
                />
                {search && (
                  <button type="button" onClick={() => setSearch("")} aria-label="Limpar filtro de grupos" style={{ position: "absolute", right: 2, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", padding: 6, display: "flex", borderRadius: 4 }}>
                    <X aria-hidden="true" style={{ width: 12, height: 12, color: T.second }} />
                  </button>
                )}
              </div>
            )}
            {!isLoading && (
              <span style={{ fontSize: 10, color: T.second, fontWeight: 600 }}>
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
                  <div style={{ fontSize: 11, fontWeight: 900, color: q.color, textTransform: "uppercase", letterSpacing: "0.1em", fontFamily: "'Space Grotesk', sans-serif" }}>
                    {q.label}
                  </div>
                  <div style={{
                    marginTop: 3,
                    display: "inline-block",
                    padding: "1px 8px",
                    borderRadius: 99,
                    backgroundColor: count > 0 ? q.light : T.low,
                    fontSize: 10, fontWeight: 700,
                    color: count > 0 ? q.color : T.second,
                  }}>
                    {count} grupo{count !== 1 ? "s" : ""}
                  </div>
                  {/* O fundo colorido era o ÚNICO sinal de coluna com alteração
                      pendente — e a própria coluna já usa essa cor quando a
                      célula está marcada. O rótulo tira a ambiguidade. */}
                  {isDirtyQ && (
                    <div style={{ marginTop: 3, fontSize: 10, fontWeight: 800, color: "#c2410c", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                      não salvo
                    </div>
                  )}
                </div>

                {/* Actions row — quebra linha: no celular a coluna tem 88px e
                    Todos + Limpar + salvar, com alvo de 44px, somavam ~150 e
                    invadiam a coluna vizinha. Nada abaixo de 10px de fonte. */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flexWrap: "wrap", gap: 3 }}>
                  <button
                    onClick={() => selectAll(q.key)}
                    data-testid={`btn-all-${q.key}`}
                    aria-label={`Marcar todos os grupos para a cota ${q.label}`}
                    style={{ fontSize: 10, fontWeight: 700, color: q.color, background: q.bg, border: `1px solid ${q.light}`, borderRadius: 4, padding: isMobile ? "12px 10px" : "0 8px", minHeight: isMobile ? 44 : 24, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.06em" }}
                  >
                    Todos
                  </button>
                  <button
                    onClick={() => clearAll(q.key)}
                    data-testid={`btn-clear-${q.key}`}
                    aria-label={`Desmarcar todos os grupos da cota ${q.label}`}
                    style={{ fontSize: 10, fontWeight: 700, color: T.second, background: T.low, border: `1px solid ${T.border}`, borderRadius: 4, padding: isMobile ? "12px 10px" : "0 8px", minHeight: isMobile ? 44 : 24, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.06em" }}
                  >
                    Limpar
                  </button>
                  {isDirtyQ && (
                    <button
                      onClick={() => saveQuota(q.key)}
                      disabled={saveMutation.isPending}
                      data-testid={`save-quota-${q.key}`}
                      aria-label={`Salvar regras da cota ${q.label}`}
                      style={{ display: "flex", alignItems: "center", justifyContent: "center", width: isMobile ? 44 : 24, height: isMobile ? 44 : 24, backgroundColor: T.dark, border: "none", borderRadius: 4, cursor: "pointer", opacity: saveMutation.isPending ? 0.6 : 1, flexShrink: 0 }}
                      title={`Salvar ${q.label}`}
                    >
                      <Save style={{ width: 11, height: 11, color: "#fff" }} />
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
                  <div style={{ width: "70%", height: 12, borderRadius: 4, backgroundColor: T.low }} />
                </div>
                {QUOTAS.map(q => (
                  <div key={q.key} style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: isMobile ? 44 : 40, borderLeft: `1px solid ${T.border}` }}>
                    <div style={{ width: 18, height: 18, borderRadius: 4, backgroundColor: T.low }} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : isError ? (
          <div style={{ padding: "60px 24px", textAlign: "center" }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: T.text, margin: "0 0 4px" }}>Não foi possível carregar as regras de cota</p>
            <p style={{ fontSize: 12, color: T.second, margin: "0 0 16px" }}>Verifique sua conexão e tente novamente.</p>
            <button
              type="button"
              onClick={() => { refetchGroups(); refetchRules(); }}
              style={{ display: "inline-flex", alignItems: "center", height: 36, padding: "0 18px", backgroundColor: T.dark, color: "#fff", border: "none", borderRadius: R.md, cursor: "pointer", fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}
            >
              Tentar novamente
            </button>
          </div>
        ) : filteredGroups.length === 0 ? (
          <div style={{ padding: "60px 0", textAlign: "center" }}>
            {search ? (
              <>
                <p style={{ fontSize: 13, fontWeight: 700, color: T.second, margin: "0 0 14px" }}>Nenhum grupo encontrado para "{search}"</p>
                {/* Mesmo botão "Limpar filtros" dos vazios de Usuários, Logs e
                    Patrocinadores — era um link laranja solto. */}
                <button type="button" onClick={() => setSearch("")} style={{ display: "inline-flex", alignItems: "center", height: 36, padding: "0 16px", backgroundColor: T.surface, border: `1px solid ${T.bdark}`, borderRadius: R.md, cursor: "pointer", fontSize: 11, fontWeight: 800, color: T.text, textTransform: "uppercase", letterSpacing: "0.08em" }}>Limpar filtro</button>
              </>
            ) : (
              <>
                <p style={{ fontSize: 14, fontWeight: 700, color: T.second, margin: "0 0 6px" }}>Nenhum grupo de peça encontrado</p>
                <p style={{ fontSize: 12, color: T.second, margin: 0 }}>Importe eventos com itens para que os grupos apareçam aqui</p>
              </>
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
                  <span style={{ fontSize: 12, fontWeight: 600, color: T.text, fontFamily: "'Space Grotesk', sans-serif" }}>
                    {group}
                  </span>
                </div>

                {/* Quota cells */}
                {QUOTAS.map(q => {
                  const checked = matrix[q.key]?.has(group) ?? false;
                  return (
                    <div
                      key={q.key}
                      role="checkbox"
                      aria-checked={checked}
                      aria-label={`${group} na cota ${q.label}`}
                      tabIndex={0}
                      onClick={() => toggleCell(q.key, group)}
                      onKeyDown={e => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          toggleCell(q.key, group);
                        }
                      }}
                      data-testid={`cell-${q.key}-${group}`}
                      style={{
                        borderLeft: `1px solid ${T.border}`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        cursor: "pointer",
                        backgroundColor: checked ? q.bg : "transparent",
                        transition: "background 0.1s",
                        minHeight: isMobile ? 44 : 40,
                      }}
                    >
                      <div style={{
                        width: 18, height: 18, borderRadius: 4,
                        border: checked ? `2px solid ${q.color}` : `2px solid ${T.border}`,
                        backgroundColor: checked ? q.color : "transparent",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        transition: "all 0.12s",
                        flexShrink: 0,
                      }}>
                        {checked && <Check style={{ width: 11, height: 11, color: "#fff" }} />}
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
            <span style={{ fontSize: 11, color: T.second, fontWeight: 600 }}>
              {filteredGroups.length} de {groups.length} grupo{groups.length !== 1 ? "s" : ""} · clique nas células para marcar
            </span>
            {dirty.size > 0 && (
              <span style={{ fontSize: 11, fontWeight: 700, color: "#c2410c" }}>
                {dirty.size} cota{dirty.size !== 1 ? "s" : ""} com alterações — lembre de salvar
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
