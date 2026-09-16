import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { FilterSelect } from "@/components/filter-select";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Search, ChevronLeft, ChevronRight, X, Download, Copy, Check } from "lucide-react";
import { T, FS, R } from "@/lib/theme";
import { useIsMobile } from "@/hooks/use-mobile";
import { useFiltrosNaUrl, paginaValida } from "@/hooks/use-filtros-na-url";

interface AuditLog {
  id: string;
  userId: string | null;
  userName: string;
  action: string;
  entityType: string;
  entityId: string;
  details: string | null;
  createdAt: string;
}

/* ── Action config ── */
// Tons 700 das mesmas famílias: os 500/600 anteriores reprovavam o piso de
// contraste 4.5:1 sobre os fundos pastéis dos badges.
const ACTION_CFG: Record<string, { label: string; bg: string; color: string }> = {
  created:            { label: "Criado",         bg: "#eff6ff", color: "#1d4ed8" },
  updated:            { label: "Atualizado",      bg: "#fff7ed", color: "#c2410c" },
  deleted:            { label: "Excluído",        bg: "#fef2f2", color: "#b91c1c" },
  approved:           { label: "Aprovado",        bg: "#f0fdf4", color: "#15803d" },
  delivered:          { label: "Entregue",        bg: "#f0fdf4", color: "#047857" },
  status_changed:     { label: "Status",          bg: "#faf5ff", color: "#7e22ce" },
  sponsor_linked:     { label: "Patrocinador",    bg: "#fff7ed", color: "#c2410c" },
  sponsor_approved:   { label: "Pat. Aprovado",   bg: "#f0fdf4", color: "#15803d" },
  submitted:          { label: "Enviado",         bg: "#eff6ff", color: "#1d4ed8" },
  released:           { label: "Liberado",        bg: "#f0fdf4", color: "#047857" },
  rejected:           { label: "Reprovado",       bg: "#fef2f2", color: "#b91c1c" },
  password_changed:   { label: "Senha",           bg: "#faf5ff", color: "#7e22ce" },
  // COMPLEMENTO: aumento de quantidade pedido depois que a peça entrou em
  // produção. Sem estas duas entradas o badge saía com a action CRUA
  // ("complement_created") em cinza de fallback — legível só para quem já
  // conhece o código.
  complement_created:  { label: "Complemento",     bg: "#fff7ed", color: "#c2410c" },
  complement_canceled: { label: "Compl. Cancelado", bg: "#fef2f2", color: "#b91c1c" },
  // 'login' saiu de propósito: o sistema NÃO grava log de login — manter o
  // badge sugeria um rastreamento de acessos que não existe.
};

const getActionCfg = (action: string) =>
  ACTION_CFG[action] ?? { label: action, bg: T.low, color: T.second };

/* ── Entity type labels ── */
const ENTITY_LABELS: Record<string, string> = {
  event:   "Evento",
  item:    "Item",
  user:    "Usuário",
  sponsor: "Patrocinador",
  comment: "Comentário",
  // Vínculos (25/08): apareciam com o nome cru da tabela no filtro e no chip.
  event_sponsor: "Patrocinador do evento",
  item_sponsor:  "Patrocinador da peça",
};

/* ── Avatar ── */
// O payload de /api/audit-logs NÃO traz o papel do usuário (só userName), então
// colorir o avatar "por papel" era mentira: todos caíam no mesmo fallback verde
// de atendimento. Até o log carregar userRole, um neutro único é o honesto.
const AVATAR_NEUTRAL = { bg: T.low, color: T.second };

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join("");
}

const PAGE_SIZE = 20;

const tiInput: React.CSSProperties = {
  width: "100%", height: 40, padding: "0 12px 0 36px",
  backgroundColor: "#f0efee", border: "none", borderRadius: R.md,
  fontSize: 13, color: T.text,
  transition: "background-color 0.15s ease, box-shadow 0.15s ease",
};

const filterSel: React.CSSProperties = {
  height: 40, padding: "0 12px", backgroundColor: T.surface,
  border: `1px solid ${T.border}`, borderRadius: R.md,
  fontSize: 12, fontWeight: 700, color: T.second,
  cursor: "pointer",
  appearance: "none", WebkitAppearance: "none",
};

/* ── Desenho comum das telas de cadastro ──
   Usuários, Patrocinadores, Modelos e Logs repetem estes controles com as
   MESMAS medidas (40px de alvo, raio 8, rótulo 12/800 em caixa alta). Copiado
   (e não importado) porque cada tela é dona do próprio arquivo; se mudar aqui,
   mude nas outras três. */
const BTN_PRIMARIO: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
  height: 40, padding: "0 18px", backgroundColor: T.dark, color: "#fff",
  border: "none", borderRadius: R.md, cursor: "pointer",
  fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em",
  whiteSpace: "nowrap", transition: "background-color 0.15s ease",
};
const BTN_LIMPAR: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6, height: 36, padding: "0 12px",
  backgroundColor: "#fef2f2", border: "1px solid #fecaca", borderRadius: R.md, cursor: "pointer",
  fontSize: 11, fontWeight: 800, color: "#b91c1c", textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap",
};

/**
 * PAGINAÇÃO — janela de até 5 páginas em volta da atual, alvos de 32px (44 no
 * celular) e a página atual cheia em escuro. Some com uma página só.
 */
function Paginacao({ pagina, totalPaginas, onIr, toque }: { pagina: number; totalPaginas: number; onIr: (p: number) => void; toque: number }) {
  if (totalPaginas <= 1) return null;
  const inicio = Math.max(1, Math.min(pagina - 2, totalPaginas - 4));
  const paginas = Array.from({ length: Math.min(5, totalPaginas) }, (_, i) => inicio + i);
  const base: React.CSSProperties = {
    minWidth: toque, height: toque, padding: "0 6px", display: "inline-flex", alignItems: "center", justifyContent: "center",
    borderRadius: R.md, border: `1px solid ${T.border}`, backgroundColor: T.surface, color: T.second,
    fontSize: 12, fontWeight: 700, cursor: "pointer", transition: "background-color 0.12s ease, border-color 0.12s ease",
  };
  const seta = (desligada: boolean): React.CSSProperties => ({ ...base, opacity: desligada ? 0.4 : 1, cursor: desligada ? "not-allowed" : "pointer" });
  return (
    <nav aria-label="Paginação" style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <button type="button" onClick={() => onIr(pagina - 1)} disabled={pagina === 1} aria-label="Página anterior" style={seta(pagina === 1)}>
        <ChevronLeft aria-hidden="true" style={{ width: 14, height: 14 }} />
      </button>
      {paginas.map(p => (
        <button key={p} type="button" onClick={() => onIr(p)} aria-label={`Página ${p}`} aria-current={p === pagina ? "page" : undefined}
          style={p === pagina ? { ...base, backgroundColor: T.dark, borderColor: T.dark, color: "#fff" } : base}>
          {p}
        </button>
      ))}
      <button type="button" onClick={() => onIr(pagina + 1)} disabled={pagina === totalPaginas} aria-label="Próxima página" style={seta(pagina === totalPaginas)}>
        <ChevronRight aria-hidden="true" style={{ width: 14, height: 14 }} />
      </button>
    </nav>
  );
}

export default function LogsSistema() {
  const isMobile = useIsMobile();
  // RECORTE NA URL (regra da casa): numa investigação, o link "exclusões de
  // patrocinador feitas pela Fulana" é justamente o que se manda a alguém — e
  // o F5 não pode devolver a trilha inteira. Filtro novo volta à página 1.
  const { valores: filtros, definir, atualizar, limpar } = useFiltrosNaUrl(
    { busca: "", acao: "all", entidade: "all", pagina: 1 },
    { aceita: { pagina: paginaValida } },
  );
  const search = filtros.busca;
  const actionFilter = filtros.acao;
  const entityFilter = filtros.entidade;
  const page = filtros.pagina;
  const setPage = (p: number) => definir("pagina", p);
  const toque = isMobile ? 44 : 32;
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // ?withTotal=1: além da lista (a PRIMEIRA página da trilha — 500 registros,
  // o tamanho padrão da rota), devolve o count REAL da tabela — sem ele o KPI
  // "Total de registros" apresentava o tamanho da página como se fosse o total
  // do sistema. Esta tela fica de propósito na primeira página: quem precisa da
  // trilha inteira usa o Histórico, que caminha para trás por cursor. A
  // resposta também traz `nextCursor`, ignorado aqui.
  // Chave em DUAS partes (mesmo padrão de solicitacao.tsx e historico.tsx): o
  // queryFn padrão junta as partes com "/" para montar a URL, mas
  // `invalidateQueries(["/api/audit-logs"])` (mutations + WebSocket) casa por
  // ELEMENTO do array — com a querystring colada na primeira posição essa
  // invalidação nunca alcançava este cache, e a tela também baixava o mesmo
  // payload de novo sob uma chave própria em vez de reaproveitar o cache do
  // Histórico.
  const { data, isLoading, isError, refetch } = useQuery<{ logs: AuditLog[]; total: number }>({
    queryKey: ["/api/audit-logs", "?withTotal=1"],
  });
  const logs = data?.logs ?? [];
  const total = data?.total ?? logs.length;
  const isTruncated = total > logs.length;

  // Falha de cópia (HTTP sem clipboard, permissão negada) era silêncio total:
  // o ícone não mudava e a pessoa colava o que estava antes na área de
  // transferência. Agora a falha também se mostra, no mesmo lugar do acerto.
  const [copyFailedId, setCopyFailedId] = useState<string | null>(null);
  const copyEntityId = (logId: string, entityId: string) => {
    const falhou = () => {
      setCopyFailedId(logId);
      window.setTimeout(() => setCopyFailedId(current => (current === logId ? null : current)), 2500);
    };
    if (!navigator.clipboard) { falhou(); return; }
    navigator.clipboard.writeText(entityId).then(() => {
      setCopiedId(logId);
      window.setTimeout(() => setCopiedId(current => (current === logId ? null : current)), 1500);
    }, falhou);
  };

  /* ── Derived filter options ── */
  // Cada menu conta sobre a lista recortada pelos OUTROS dois campos, nunca
  // por si mesmo — senão a opção escolhida seria a única com número. Os dois
  // menus não tinham contagem nenhuma: numa trilha de 500 registros, escolher
  // "Tipo de ação" às cegas e cair numa tabela vazia era rotina. É a mesma
  // disciplina travada em server/__tests__/faceta-lista-invariante.test.ts.
  const casaBusca = (l: AuditLog) => {
    const q = search.toLowerCase();
    return !q || l.userName.toLowerCase().includes(q)
      || (l.details ?? "").toLowerCase().includes(q)
      || l.entityType.toLowerCase().includes(q);
  };

  const actionFilterOptions = useMemo(() => {
    const conta = new Map<string, number>();
    logs.forEach(l => {
      if (!casaBusca(l)) return;
      if (entityFilter !== "all" && l.entityType !== entityFilter) return;
      conta.set(l.action, (conta.get(l.action) ?? 0) + 1);
    });
    return Array.from(conta.entries())
      .map(([a, count]) => ({ value: a, label: getActionCfg(a).label, count }));
  }, [logs, search, entityFilter]);

  const entityFilterOptions = useMemo(() => {
    const conta = new Map<string, number>();
    logs.forEach(l => {
      if (!casaBusca(l)) return;
      if (actionFilter !== "all" && l.action !== actionFilter) return;
      conta.set(l.entityType, (conta.get(l.entityType) ?? 0) + 1);
    });
    return Array.from(conta.entries())
      .map(([e, count]) => ({ value: e, label: ENTITY_LABELS[e] ?? e, count }));
  }, [logs, search, actionFilter]);

  /* ── Filtered + paginated ── */
  const filtered = useMemo(() => {
    return logs.filter(l => {
      const q = search.toLowerCase();
      const matchQ = !q || l.userName.toLowerCase().includes(q) || (l.details ?? "").toLowerCase().includes(q) || l.entityType.toLowerCase().includes(q);
      const matchA = actionFilter === "all" || l.action === actionFilter;
      const matchE = entityFilter === "all" || l.entityType === entityFilter;
      return matchQ && matchA && matchE;
    });
  }, [logs, search, actionFilter, entityFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  // Apertar um filtro com a paginação avançada pode deixar `page` além do
  // total — clampa em vez de renderizar uma página vazia.
  const safePage   = Math.min(page, totalPages);
  const paginated  = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const activeFilters = [search, actionFilter !== "all", entityFilter !== "all"].filter(Boolean).length;

  const clearFilters = () => limpar();

  /* ── CSV export (client-side, from the already-loaded/filtered logs) ── */
  const csvEscape = (value: string) => `"${value.replace(/"/g, '""')}"`;

  const handleExport = () => {
    // Exportação parcial precisa se anunciar: sem o aviso, o CSV com 500
    // linhas passava por "histórico completo" em qualquer análise posterior.
    const avisoTruncado = isTruncated
      ? [[`AVISO: exportação parcial — apenas os últimos ${logs.length} registros de ${total} no sistema`]]
      : [];
    const header = ["Data/Hora", "Usuário", "Ação", "Descrição", "Entidade", "ID da Entidade"];
    const rows = filtered.map(l => [
      format(new Date(l.createdAt), "dd/MM/yyyy HH:mm:ss", { locale: ptBR }),
      l.userName,
      getActionCfg(l.action).label,
      l.details ?? `${getActionCfg(l.action).label} em ${ENTITY_LABELS[l.entityType] ?? l.entityType}`,
      ENTITY_LABELS[l.entityType] ?? l.entityType,
      l.entityId,
    ]);
    const csv = [...avisoTruncado, header, ...rows]
      .map(row => row.map(cell => csvEscape(String(cell))).join(";"))
      .join("\r\n");
    // UTF-8 BOM so Excel opens accented characters correctly
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `logs-sistema-${format(new Date(), "yyyy-MM-dd-HHmm")}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  /* ── Stats ── */
  const todayCount  = logs.filter(l => new Date(l.createdAt).toDateString() === new Date().toDateString()).length;
  const errorCount  = logs.filter(l => ["deleted", "rejected"].includes(l.action)).length;

  return (
    <div style={{ backgroundColor: T.bg, height: "100%", overflowY: "auto", padding: isMobile ? "16px 16px 48px" : "28px 32px 64px" }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 24, gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: FS.h1, fontWeight: 700, color: T.text, margin: "0 0 6px", fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "-0.03em", lineHeight: 1.1 }}>
            Logs do Sistema
          </h1>
          <p style={{ fontSize: FS.body, color: T.second, margin: 0, lineHeight: 1.5, maxWidth: 640 }}>
            Rastreamento das operações do sistema
          </p>
        </div>
        {/* Secundário (contorno), não primário: exportar não cria nada. O
            desabilitado mantém o texto em T.second — o cinza decorativo
            anterior reprovava contraste justamente no estado que precisa
            explicar por que não dá. */}
        <button
          onClick={handleExport}
          disabled={filtered.length === 0}
          title={filtered.length === 0 ? "Nada para exportar no recorte atual" : `Baixar os ${filtered.length} registros do recorte atual`}
          data-testid="button-export-logs"
          style={{ ...BTN_PRIMARIO, width: isMobile ? "100%" : undefined, backgroundColor: T.surface, color: filtered.length === 0 ? T.second : T.text, border: `1px solid ${T.bdark}`, cursor: filtered.length === 0 ? "not-allowed" : "pointer", opacity: filtered.length === 0 ? 0.6 : 1 }}
          onMouseEnter={e => { if (filtered.length > 0) e.currentTarget.style.backgroundColor = T.low; }}
          onMouseLeave={e => { e.currentTarget.style.backgroundColor = T.surface; }}
        >
          <Download aria-hidden="true" style={{ width: 14, height: 14 }} />
          {/* O formato no rótulo: "Exportar" sozinho não dizia o que baixa. */}
          Exportar CSV
        </button>
      </div>

      {/* ── KPI chips ── */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
        {[
          { label: "Total de registros", value: total, color: T.text, bg: T.surface },
          { label: "Hoje",               value: todayCount,  color: "#1d4ed8", bg: "#eff6ff" },
          { label: "Exclusões e reprovações", value: errorCount, color: "#b91c1c", bg: "#fef2f2" },
          { label: "Filtrados",          value: filtered.length, color: "#c2410c", bg: "#fff7ed" },
        ].map(({ label, value, color, bg }) => (
          <div key={label} style={{ padding: "8px 16px", backgroundColor: bg, border: `1px solid ${T.border}`, borderRadius: 8, display: "flex", flexDirection: "column", gap: 1 }}>
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 18, fontWeight: 700, color, lineHeight: 1 }}>{value}</span>
            <span style={{ fontSize: 10, color: T.second, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</span>
          </div>
        ))}
        {isTruncated && (
          <span style={{ fontSize: 11, color: T.second, fontWeight: 600 }}>
            Exibindo os últimos {logs.length} de {total} registros
          </span>
        )}
      </div>

      {/* ── Filter bar ── */}
      {/* Barra solta acima da tabela, como em Usuários e Modelos — o cartão
          branco em volta dela era um quarto desenho de barra de busca. */}
      <div style={{ marginBottom: 16, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        {/* Search */}
        <div style={{ position: "relative", flex: isMobile ? "1 1 100%" : "1 1 240px", maxWidth: isMobile ? "none" : 360 }}>
          <Search aria-hidden="true" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: T.muted }} />
          <input
            value={search}
            onChange={e => atualizar({ busca: e.target.value, pagina: 1 })}
            placeholder="Buscar por usuário, ação ou entidade..."
            aria-label="Buscar nos logs por usuário, descrição ou entidade"
            type="search"
            data-testid="input-search-logs"
            style={tiInput}
            onFocus={e => { e.currentTarget.style.backgroundColor = "#fff"; e.currentTarget.style.boxShadow = "0 0 0 2px rgba(249,115,22,0.2)"; }}
            onBlur={e =>  { e.currentTarget.style.backgroundColor = "#f0efee"; e.currentTarget.style.boxShadow = "none"; }}
          />
        </div>

        {/* Action filter */}
        <div style={{ position: "relative", flexShrink: 0 }}>
          <FilterSelect
            label="Tipo de ação" allLabel="Todos os tipos de ação"
            value={actionFilter}
            onChange={v => atualizar({ acao: v, pagina: 1 })}
            options={actionFilterOptions}
            searchPlaceholder="Buscar ação..." emptyText="Nenhuma ação encontrada."
            hideWhenEmpty={false} testId="select-action-filter"
            triggerStyle={{ ...filterSel, minWidth: 160 }}
          />
        </div>

        {/* Entity filter */}
        <div style={{ position: "relative", flexShrink: 0 }}>
          <FilterSelect
            label="Entidade" allLabel="Todas as entidades"
            value={entityFilter}
            onChange={v => atualizar({ entidade: v, pagina: 1 })}
            options={entityFilterOptions}
            searchPlaceholder="Buscar entidade..." emptyText="Nenhuma entidade encontrada."
            hideWhenEmpty={false} testId="select-entity-filter"
            triggerStyle={{ ...filterSel, minWidth: 140 }}
          />
        </div>

        {activeFilters > 0 && (
          <button
            type="button"
            onClick={clearFilters}
            style={{ ...BTN_LIMPAR, flexShrink: 0 }}
          >
            <X aria-hidden="true" style={{ width: 11, height: 11 }} />
            Limpar ({activeFilters})
          </button>
        )}

        <span style={{ marginLeft: "auto", fontSize: 11, color: T.second, fontWeight: 600, flexShrink: 0 }}>
          {filtered.length} resultado{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* ── Table ── */}
      <section style={{ backgroundColor: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden" }}>
        {isLoading ? (
          // Esqueleto na silhueta da linha (data · avatar+nome · selo ·
          // descrição): a trilha chega no lugar em que vai ficar.
          <div role="status" aria-label="Carregando logs" style={{ padding: "6px 0" }}>
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="motion-safe:animate-pulse" style={{ display: "flex", alignItems: "center", gap: 18, padding: "15px 18px", borderBottom: `1px solid ${T.low}` }}>
                <div style={{ width: 72, height: 22, borderRadius: 4, backgroundColor: T.low, flexShrink: 0 }} />
                <div style={{ width: 30, height: 30, borderRadius: "50%", backgroundColor: T.low, flexShrink: 0 }} />
                <div style={{ width: 110, height: 12, borderRadius: 4, backgroundColor: T.low, flexShrink: 0 }} />
                <div style={{ width: 70, height: 18, borderRadius: 999, backgroundColor: T.low, flexShrink: 0 }} />
                <div style={{ flex: 1, maxWidth: 320, height: 12, borderRadius: 4, backgroundColor: T.low }} />
              </div>
            ))}
          </div>
        ) : isError ? (
          <div style={{ padding: "64px 24px", textAlign: "center" }}>
            <p style={{ fontSize: 13, color: T.text, fontWeight: 700, margin: "0 0 4px" }}>
              Não foi possível carregar os logs
            </p>
            <p style={{ fontSize: 12, color: T.second, margin: "0 0 16px" }}>
              Verifique sua conexão e tente novamente.
            </p>
            <button
              type="button"
              onClick={() => refetch()}
              style={{ ...BTN_PRIMARIO, height: 36, fontSize: 11 }}
            >
              Tentar novamente
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: "64px 24px", textAlign: "center" }}>
            {logs.length === 0 ? (
              <p style={{ fontSize: 13, color: T.second, margin: 0 }}>
                Nenhuma atividade registrada ainda — os logs aparecem aqui conforme o sistema é usado.
              </p>
            ) : (
              <>
                <p style={{ fontSize: 13, color: T.second, margin: "0 0 14px" }}>
                  Nenhum registro corresponde à busca e aos filtros aplicados.
                </p>
                <button
                  type="button"
                  onClick={clearFilters}
                  style={{ ...BTN_PRIMARIO, height: 36, backgroundColor: T.surface, color: T.text, border: `1px solid ${T.bdark}`, fontSize: 11 }}
                >
                  Limpar filtros
                </button>
              </>
            )}
          </div>
        ) : (
          <>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                <thead>
                  <tr style={{ backgroundColor: T.low, borderBottom: `1px solid ${T.border}` }}>
                    {[
                      { label: "Data e Hora",   w: 160 },
                      { label: "Usuário",       w: undefined },
                      { label: "Tipo de Ação",  w: 130 },
                      { label: "Descrição",     w: undefined },
                      { label: "Entidade",      w: 120 },
                    ].map(col => (
                      <th key={col.label} scope="col" style={{ padding: "11px 18px", fontSize: 10, fontWeight: 900, color: T.second, textTransform: "uppercase", letterSpacing: "0.16em", whiteSpace: "nowrap", width: col.w }}>
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginated.map(log => {
                    const aCfg = getActionCfg(log.action);
                    const init = initials(log.userName);
                    const avatarCfg = AVATAR_NEUTRAL;
                    const description = log.details ?? `${aCfg.label} em ${ENTITY_LABELS[log.entityType] ?? log.entityType}`;

                    return (
                      <tr
                        key={log.id}
                        data-testid={`row-log-${log.id}`}
                        style={{ borderBottom: `1px solid ${T.low}`, transition: "background 0.1s" }}
                        onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#fafaf9")}
                        onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}
                      >
                        {/* Data e Hora */}
                        <td style={{ padding: "13px 18px", whiteSpace: "nowrap" }}>
                          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: T.text, fontWeight: 500 }}>
                            {format(new Date(log.createdAt), "dd/MM/yyyy", { locale: ptBR })}
                          </div>
                          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: T.second, marginTop: 2 }}>
                            {format(new Date(log.createdAt), "HH:mm:ss", { locale: ptBR })}
                          </div>
                        </td>

                        {/* Usuário */}
                        <td style={{ padding: "13px 18px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                            <div style={{
                              width: 30, height: 30, borderRadius: "50%",
                              backgroundColor: avatarCfg.bg, color: avatarCfg.color,
                              display: "flex", alignItems: "center", justifyContent: "center",
                              fontSize: 10, fontWeight: 800, flexShrink: 0,
                            }}>
                              {init}
                            </div>
                            <span style={{ fontSize: 13, fontWeight: 700, color: T.text, whiteSpace: "nowrap" }}>
                              {log.userName}
                            </span>
                          </div>
                        </td>

                        {/* Tipo de Ação */}
                        <td style={{ padding: "13px 18px" }}>
                          <span style={{
                            padding: "3px 9px", borderRadius: 999,
                            backgroundColor: aCfg.bg, color: aCfg.color,
                            fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em",
                            whiteSpace: "nowrap",
                          }}>
                            {aCfg.label}
                          </span>
                        </td>

                        {/* Descrição */}
                        <td style={{ padding: "13px 18px", fontSize: 13, color: T.second, maxWidth: 380 }}>
                          {/* O corte em 2 linhas não tinha volta: numa trilha
                              de investigação, o fim da frase é justamente o
                              detalhe. O title devolve o texto inteiro. */}
                          <span title={description} style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                            {description}
                          </span>
                        </td>

                        {/* Entidade */}
                        <td style={{ padding: "13px 18px" }}>
                          {/* Sem `capitalize`: os rótulos já vêm grafados, e ele
                              transformava "Patrocinador do evento" em
                              "Patrocinador Do Evento". */}
                          <div style={{ fontSize: 11, fontWeight: 700, color: T.second }}>
                            {ENTITY_LABELS[log.entityType] ?? log.entityType}
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 1 }}>
                            <span title={log.entityId} style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: T.second }}>
                              {log.entityId.slice(0, 8)}…
                            </span>
                            {/* Alvo de 21px (era 15) e o resultado dito em voz
                                alta: aria-live anuncia "Copiado" ou a falha. */}
                            <button
                              onClick={() => copyEntityId(log.id, log.entityId)}
                              aria-label={`Copiar ID completo ${log.entityId}`}
                              title={copyFailedId === log.id ? "Não foi possível copiar — selecione o ID manualmente" : "Copiar ID completo"}
                              style={{ background: "none", border: "none", cursor: "pointer", padding: isMobile ? 16 : 7, margin: isMobile ? -14 : -5, borderRadius: 4, display: "flex", color: copiedId === log.id ? "#15803d" : copyFailedId === log.id ? "#b91c1c" : T.second }}
                            >
                              {copiedId === log.id
                                ? <Check style={{ width: 11, height: 11 }} />
                                : copyFailedId === log.id
                                  ? <X style={{ width: 11, height: 11 }} />
                                  : <Copy style={{ width: 11, height: 11 }} />
                              }
                            </button>
                            <span className="sr-only" aria-live="polite">
                              {copiedId === log.id ? "ID copiado" : copyFailedId === log.id ? "Não foi possível copiar o ID" : ""}
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* ── Pagination footer ── */}
            <div style={{ padding: "10px 18px", borderTop: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, backgroundColor: T.low }}>
              <p style={{ fontSize: 11, color: T.second, fontWeight: 600, margin: 0 }}>
                Exibindo {Math.min((safePage - 1) * PAGE_SIZE + 1, filtered.length)}–{Math.min(safePage * PAGE_SIZE, filtered.length)} de{" "}
                <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, color: T.second }}>{filtered.length}</span> registros
              </p>
              <Paginacao pagina={safePage} totalPaginas={totalPages} onIr={setPage} toque={toque} />
            </div>
          </>
        )}
      </section>
    </div>
  );
}
