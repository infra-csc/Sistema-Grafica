import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { FilterSelect } from "@/components/filter-select";
import { format, isToday, isYesterday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Search, ChevronLeft, ChevronRight, ChevronRight as Abrir, X, Download, Copy, Check, Info, ScrollText, SearchX } from "lucide-react";
import { T, TOM, FS, FW, R, FONT, type NomeDeTom } from "@/lib/theme";
import { useIsMobile } from "@/hooks/use-mobile";
import { useFiltrosNaUrl, paginaValida } from "@/hooks/use-filtros-na-url";
import { Botao } from "@/components/ui/botao";
import { CabecalhoDaPagina } from "@/components/ui/cabecalho-da-pagina";
import { EstadoErro, EstadoVazio } from "@/components/ui/estados";
import { Selo } from "@/components/ui/selo";
import { DetalheDoLog } from "@/components/admin/detalhe-do-log";
import { useLarguraDoElemento } from "@/components/admin/ferramenta-de-reparo";

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
// O TOM de cada ação vem da paleta semântica (TOM): azul cria, laranja altera,
// vermelho exclui/reprova, verde aprova, esmeralda entrega, roxo muda estado.
// Eram hexes cravados — os mesmos valores, agora pelo token.
const ACTION_CFG: Record<string, { label: string; tom: NomeDeTom }> = {
  created:            { label: "Criado",          tom: "info" },
  updated:            { label: "Atualizado",      tom: "laranja" },
  deleted:            { label: "Excluído",        tom: "perigo" },
  approved:           { label: "Aprovado",        tom: "sucesso" },
  delivered:          { label: "Entregue",        tom: "esmeralda" },
  status_changed:     { label: "Status",          tom: "roxo" },
  sponsor_linked:     { label: "Patrocinador",    tom: "laranja" },
  sponsor_approved:   { label: "Pat. Aprovado",   tom: "sucesso" },
  submitted:          { label: "Enviado",         tom: "info" },
  released:           { label: "Liberado",        tom: "esmeralda" },
  rejected:           { label: "Reprovado",       tom: "perigo" },
  password_changed:   { label: "Senha",           tom: "roxo" },
  // COMPLEMENTO: aumento de quantidade pedido depois que a peça entrou em
  // produção. Sem estas duas entradas o badge saía com a action CRUA
  // ("complement_created") em cinza de fallback — legível só para quem já
  // conhece o código.
  complement_created:  { label: "Complemento",      tom: "laranja" },
  complement_canceled: { label: "Compl. Cancelado", tom: "perigo" },
  // Ações que o servidor grava e a tela mostrava CRUAS ("label_printed",
  // "reserva_liberada") no cinza de fallback — levantadas por varredura dos
  // createAuditLog/insert em auditLogs de server/ (16/09).
  canceled:          { label: "Cancelado",        tom: "perigo" },
  added:             { label: "Adicionado",       tom: "info" },
  removed:           { label: "Removido",         tom: "perigo" },
  restored:          { label: "Restaurado",       tom: "sucesso" },
  dispensed:         { label: "Dispensado",       tom: "roxo" },
  triagem:           { label: "Triagem",          tom: "roxo" },
  reservado:         { label: "Reservado",        tom: "info" },
  reserva_liberada:  { label: "Reserva liberada", tom: "esmeralda" },
  label_printed:     { label: "Etiqueta",         tom: "roxo" },
  corrected_text:    { label: "Texto corrigido",  tom: "laranja" },
  // Nova varredura (06/10): ainda saíam cruas na trilha local.
  cadastrado:        { label: "Cadastrado",       tom: "info" },
  produced:          { label: "Produzido",        tom: "esmeralda" },
  production:        { label: "Produção",         tom: "laranja" },
  archived:          { label: "Arquivado",        tom: "neutro" },
  // 'login' saiu de propósito: o sistema NÃO grava log de login — manter o
  // badge sugeria um rastreamento de acessos que não existe.
};

const getActionCfg = (action: string) =>
  ACTION_CFG[action] ?? { label: action, tom: "neutro" as NomeDeTom };

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
  // Mesma varredura das ações: entidades que chegavam com o nome da tabela.
  pedido_de_peca: "Solicitação de peça",
  inventory_asset: "Estoque",
  quota_rules: "Regra de cota",
  // `gestao` cobre o acompanhamento E as listas de destinatários (tela
  // Notificações grava com essa entidade); `revisao` é só o aviso da revisão.
  gestao: "Avisos por e-mail",
  revisao: "Aviso da revisão",
  item_sponsor_approval: "Aprovação de patrocinador",
  // Nova varredura (06/10): "standardItem" e "tubo" saíam crus.
  standardItem: "Modelo",
  catalogOption: "Opção de catálogo",
  tubo: "Tubo",
  sistema: "Sistema",
};

const rotuloDaEntidade = (tipo: string) => ENTITY_LABELS[tipo] ?? tipo;
const descricaoDo = (l: AuditLog) => l.details ?? `${getActionCfg(l.action).label} em ${rotuloDaEntidade(l.entityType)}`;

/* ── Avatar ── */
// O payload de /api/audit-logs NÃO traz o papel do usuário (só userName), então
// colorir o avatar "por papel" era mentira: todos caíam no mesmo fallback verde
// de atendimento. Até o log carregar userRole, um neutro único é o honesto.
function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join("");
}

/** "Hoje" e "Ontem" leem mais rápido que a data — o resto, a data. */
function dia(data: Date) {
  if (isToday(data)) return "Hoje";
  if (isYesterday(data)) return "Ontem";
  return format(data, "dd/MM/yyyy", { locale: ptBR });
}

const PAGE_SIZE = 20;

const ROTULO: React.CSSProperties = { fontSize: FS.micro, fontWeight: FW.rotulo, color: T.second, textTransform: "uppercase", letterSpacing: "0.12em", whiteSpace: "nowrap" };

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
    borderRadius: R.md, border: `1px solid ${T.border}`, backgroundColor: T.surface, color: T.apoio,
    fontSize: FS.meta, fontWeight: FW.forte, fontFamily: FONT.mono, cursor: "pointer",
  };
  const seta = (desligada: boolean): React.CSSProperties => ({ ...base, opacity: desligada ? 0.4 : 1, cursor: desligada ? "not-allowed" : "pointer" });
  return (
    <nav aria-label="Paginação" style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <button type="button" className="adm-pagina" onClick={() => onIr(pagina - 1)} disabled={pagina === 1} aria-label="Página anterior" style={seta(pagina === 1)}>
        <ChevronLeft aria-hidden="true" style={{ width: 14, height: 14 }} />
      </button>
      {paginas.map(p => (
        <button key={p} type="button" className="adm-pagina" onClick={() => onIr(p)} aria-label={`Página ${p}`} aria-current={p === pagina ? "page" : undefined}
          style={p === pagina ? { ...base, backgroundColor: T.dark, borderColor: T.dark, color: T.surface } : base}>
          {p}
        </button>
      ))}
      <button type="button" className="adm-pagina" onClick={() => onIr(pagina + 1)} disabled={pagina === totalPaginas} aria-label="Próxima página" style={seta(pagina === totalPaginas)}>
        <ChevronRight aria-hidden="true" style={{ width: 14, height: 14 }} />
      </button>
    </nav>
  );
}

function Numero({ rotulo, valor, cor, testId }: { rotulo: string; valor: number | string; cor?: string; testId?: string }) {
  return (
    <div>
      <p style={{ ...ROTULO, margin: "0 0 4px" }}>{rotulo}</p>
      <p data-testid={testId} style={{ margin: 0, fontFamily: FONT.display, fontSize: FS.h2, fontWeight: FW.forte, lineHeight: 1, color: cor ?? T.text, fontVariantNumeric: "tabular-nums" }}>{valor}</p>
    </div>
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
  // Cartões pela LARGURA DA TELA ÚTIL, não da janela: no tablet a barra lateral
  // fica aberta e a tabela de cinco colunas não cabia nos ~510px que sobram.
  const [refRaiz, larguraRaiz] = useLarguraDoElemento<HTMLDivElement>();
  const cartoes = isMobile || larguraRaiz < 860;
  const [copiedId, setCopiedId] = useState<string | null>(null);
  // O registro aberto no detalhe (descrição e ID inteiros).
  const [aberto, setAberto] = useState<AuditLog | null>(null);

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
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<{ logs: AuditLog[]; total: number }>({
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
  // "QUEM FEZ ISSO?" começa com o que a pessoa TEM na mão: o nome de quem
  // desconfia, o número da peça, o nome do evento — ou o ID copiado de outra
  // linha. A busca não achava pelo ID (que a própria tabela oferece copiar)
  // nem pelos rótulos em português que a tabela mostra ("Excluído",
  // "Patrocinador"): só pela chave crua da entidade.
  const casaBusca = (l: AuditLog) => {
    const q = search.trim().toLowerCase();
    return !q || l.userName.toLowerCase().includes(q)
      || (l.details ?? "").toLowerCase().includes(q)
      || l.entityType.toLowerCase().includes(q)
      || l.entityId.toLowerCase().includes(q)
      || getActionCfg(l.action).label.toLowerCase().includes(q)
      || (ENTITY_LABELS[l.entityType] ?? "").toLowerCase().includes(q);
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
      // A MESMA régua dos menus (casaBusca): lista e contagens não podem
      // discordar sobre o que a busca acha.
      const matchQ = casaBusca(l);
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
  const filtrarPessoa = (nome: string) => { atualizar({ busca: nome, pagina: 1 }); setAberto(null); };

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
  const semDados = isLoading || isError;

  const estadoDaCopia = (id: string) => (copiedId === id ? "copiado" : copyFailedId === id ? "falhou" : null);

  // O botão de copiar da linha — o resultado anunciado em voz alta (aria-live).
  const botaoCopiar = (log: AuditLog) => (
    <>
      <button
        type="button"
        className="adm-copiar"
        onClick={(e) => { e.stopPropagation(); copyEntityId(log.id, log.entityId); }}
        aria-label={`Copiar ID completo ${log.entityId}`}
        title={copyFailedId === log.id ? "Não foi possível copiar — selecione o ID manualmente" : "Copiar ID completo"}
        style={{ background: "none", border: "none", cursor: "pointer", width: isMobile ? 44 : 24, height: isMobile ? 44 : 24, margin: isMobile ? -12 : -4, borderRadius: R.sm, display: "inline-flex", alignItems: "center", justifyContent: "center", color: copiedId === log.id ? TOM.sucesso.text : copyFailedId === log.id ? TOM.perigo.text : T.second }}
      >
        {copiedId === log.id
          ? <Check aria-hidden="true" style={{ width: 12, height: 12 }} />
          : copyFailedId === log.id
            ? <X aria-hidden="true" style={{ width: 12, height: 12 }} />
            : <Copy aria-hidden="true" style={{ width: 12, height: 12 }} />
        }
      </button>
      <span className="sr-only" aria-live="polite">
        {copiedId === log.id ? "ID copiado" : copyFailedId === log.id ? "Não foi possível copiar o ID" : ""}
      </span>
    </>
  );

  return (
    <div ref={refRaiz} style={{ backgroundColor: T.bg, height: "100%", overflowY: "auto", padding: isMobile ? "16px 16px 48px" : "28px 32px 64px" }}>

      {/* ── Cabeçalho ── o que é a trilha e COMO investigar, em uma frase; os
          números e a exportação à direita (como Patrocinadores). O login não
          entra: o sistema não o grava (ver ACTION_CFG). */}
      <CabecalhoDaPagina
        titulo="Logs do Sistema"
        testId="title-logs-sistema"
        margemInferior={isTruncated ? 14 : 22}
        subtitulo={
          <span style={{ display: "block", maxWidth: 600 }}>
            Quem criou, alterou, aprovou ou excluiu cada registro. Busque pelo número da peça, evento ou patrocinador — ou clique no nome de alguém para ver só as ações dessa pessoa. Entradas no sistema (login) não são registradas.
          </span>
        }
        acoes={
          <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 14 : 20, flexWrap: "wrap", width: isMobile ? "100%" : undefined }}>
            <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 14 : 20, flex: isMobile ? "1 1 100%" : undefined }}>
              <Numero rotulo="Registros" valor={semDados ? "–" : total.toLocaleString("pt-BR")} testId="stat-total-logs" />
              <span aria-hidden="true" style={{ width: 1, height: 34, backgroundColor: T.border }} />
              <Numero rotulo="Hoje" valor={semDados ? "–" : todayCount} />
              <span aria-hidden="true" style={{ width: 1, height: 34, backgroundColor: T.border }} />
              <Numero rotulo="Exclusões e reprovações" valor={semDados ? "–" : errorCount} cor={!semDados && errorCount > 0 ? TOM.perigo.text : undefined} />
            </div>
            {/* Secundário, não primário: exportar não cria nada. O motivo do
                desabilitado aparece escrito — no toque não há title. */}
            <Botao
              variante="secundario"
              tamanho={isMobile ? "toque" : "md"}
              icone={Download}
              onClick={handleExport}
              disabled={filtered.length === 0}
              motivo={!semDados && filtered.length === 0 ? "Nada para exportar no recorte atual" : undefined}
              title={filtered.length === 0 ? "Nada para exportar no recorte atual" : `Baixar os ${filtered.length} registros do recorte atual`}
              data-testid="button-export-logs"
              larguraCheia={isMobile}
            >
              {/* O formato no rótulo: "Exportar" sozinho não dizia o que baixa. */}
              Exportar CSV
            </Botao>
          </div>
        }
      />

      {isTruncated && (
        <p role="note" style={{ display: "flex", alignItems: "flex-start", gap: 8, margin: "0 0 20px", padding: "10px 14px", fontSize: FS.meta, lineHeight: 1.5, color: T.apoio, backgroundColor: TOM.info.bg, border: `1px solid ${TOM.info.border}`, borderRadius: R.md }}>
          <Info aria-hidden="true" style={{ width: 15, height: 15, flexShrink: 0, marginTop: 1, color: TOM.info.text }} />
          <span>
            Exibindo os últimos <strong style={{ color: T.text }}>{logs.length.toLocaleString("pt-BR")}</strong> de <strong style={{ color: T.text }}>{total.toLocaleString("pt-BR")}</strong> registros — busca, filtros e exportação valem para eles.{" "}
            {/* O PRÓXIMO PASSO quando o que se procura é mais antigo: o
                Histórico caminha a trilha inteira por cursor (ver o comentário
                da query acima). Sem o link, a busca vazia parecia "não houve". */}
            <Link href="/historico" className="adm-link" style={{ color: TOM.info.text, fontWeight: FW.forte }}>
              Mais antigos: Histórico
            </Link>
          </span>
        </p>
      )}

      {/* ── Busca e filtros ── soltos acima da tabela, como em Patrocinadores.
          Somem com a trilha vazia (não há o que recortar) e no erro.
          A contagem do recorte mora aqui, colada em quem a muda. */}
      {!isError && (isLoading || logs.length > 0) && (
        <div role="search" aria-label="Filtrar os logs" style={{ marginBottom: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: isMobile ? "1 1 100%" : "0 1 380px", minWidth: 0 }}>
            <Search aria-hidden="true" style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", width: 15, height: 15, color: T.second, pointerEvents: "none" }} />
            <input
              value={search}
              onChange={e => atualizar({ busca: e.target.value, pagina: 1 })}
              placeholder={isMobile ? "Pessoa, peça, evento ou ID…" : "Pessoa, nº da peça, evento, ação ou ID…"}
              aria-label="Buscar nos logs por pessoa, descrição, ação, entidade ou ID"
              type="search"
              data-testid="input-search-logs"
              className="adm-campo"
              style={{ width: "100%", height: isMobile ? 44 : 40, padding: `0 ${search ? 40 : 12}px 0 36px`, boxSizing: "border-box", backgroundColor: T.surface, border: `1px solid ${T.border}`, borderRadius: R.md, fontSize: isMobile ? FS.lead : FS.body, color: T.text, fontFamily: "inherit" }}
            />
            {search && (
              <button type="button" onClick={() => atualizar({ busca: "", pagina: 1 })} aria-label="Limpar a busca" className="ds-botao"
                style={{ position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)", width: isMobile ? 40 : 32, height: isMobile ? 40 : 32, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", borderRadius: R.sm, cursor: "pointer", color: T.second }}>
                <X aria-hidden="true" style={{ width: 14, height: 14 }} />
              </button>
            )}
          </div>

          <FilterSelect
            label="Tipo de ação" allLabel="Todos os tipos de ação"
            value={actionFilter}
            onChange={v => atualizar({ acao: v, pagina: 1 })}
            options={actionFilterOptions}
            searchPlaceholder="Buscar ação..." emptyText="Nenhuma ação encontrada."
            hideWhenEmpty={false} testId="select-action-filter"
            panelWidth={260}
            triggerStyle={{ height: isMobile ? 44 : 40, padding: "0 12px", backgroundColor: T.surface, border: `1px solid ${T.border}`, borderRadius: R.md, fontSize: FS.meta, fontWeight: FW.forte, color: T.apoio }}
          />

          <FilterSelect
            label="Entidade" allLabel="Todas as entidades"
            value={entityFilter}
            onChange={v => atualizar({ entidade: v, pagina: 1 })}
            options={entityFilterOptions}
            searchPlaceholder="Buscar entidade..." emptyText="Nenhuma entidade encontrada."
            hideWhenEmpty={false} testId="select-entity-filter"
            panelWidth={260}
            triggerStyle={{ height: isMobile ? 44 : 40, padding: "0 12px", backgroundColor: T.surface, border: `1px solid ${T.border}`, borderRadius: R.md, fontSize: FS.meta, fontWeight: FW.forte, color: T.apoio }}
          />

          {activeFilters > 0 && (
            <Botao variante="fantasma" tamanho={isMobile ? "toque" : "md"} icone={X} onClick={clearFilters}>
              Limpar ({activeFilters})
            </Botao>
          )}

          <span aria-live="polite" style={{ marginLeft: "auto", fontSize: FS.meta, color: T.second, fontWeight: FW.medio, whiteSpace: "nowrap" }}>
            {isLoading ? "Carregando…" : <><strong style={{ fontFamily: FONT.mono, color: T.text }}>{filtered.length}</strong> {filtered.length === 1 ? "resultado" : "resultados"}</>}
          </span>
        </div>
      )}

      {/* ── Lista ── */}
      {isError ? (
        <EstadoErro
          titulo="Não foi possível carregar os logs"
          detalhe={<>Verifique sua conexão e tente novamente. {error instanceof Error ? error.message : ""}</>}
          aoTentarDeNovo={() => refetch()}
          carregando={isFetching}
          tamanhoDoBotao={isMobile ? "toque" : "md"}
          rotuloDoBotao="Tentar novamente"
        />
      ) : !isLoading && filtered.length === 0 ? (
        logs.length === 0 ? (
          <EstadoVazio
            icone={ScrollText}
            titulo="Nenhuma atividade registrada ainda"
            descricao="Os logs aparecem aqui conforme o sistema é usado."
          />
        ) : (
          <EstadoVazio
            icone={SearchX}
            titulo="Nenhum registro neste recorte"
            descricao="Nenhum registro corresponde à busca e aos filtros aplicados."
            acao={<Botao variante="secundario" tamanho={isMobile ? "toque" : "md"} icone={X} onClick={clearFilters}>Limpar filtros</Botao>}
          />
        )
      ) : (
        <section aria-label="Registros da trilha" style={{ backgroundColor: T.surface, border: `1px solid ${T.border}`, borderRadius: R.lg, overflow: "hidden" }}>
          {isLoading ? (
            // Esqueleto na silhueta da linha (data · avatar+nome · selo ·
            // descrição): a trilha chega no lugar em que vai ficar.
            <div role="status" aria-label="Carregando logs" style={{ padding: "6px 0" }}>
              {Array.from({ length: 8 }, (_, i) => (
                <div key={i} className="motion-safe:animate-pulse" style={{ display: "flex", alignItems: "center", gap: 18, padding: "15px 18px", borderBottom: `1px solid ${T.low}` }}>
                  <div style={{ width: 72, height: 22, borderRadius: 4, backgroundColor: T.low, flexShrink: 0 }} />
                  <div style={{ width: 30, height: 30, borderRadius: "50%", backgroundColor: T.low, flexShrink: 0 }} />
                  {!isMobile && <div style={{ width: 110, height: 12, borderRadius: 4, backgroundColor: T.low, flexShrink: 0 }} />}
                  <div style={{ width: 70, height: 18, borderRadius: 999, backgroundColor: T.low, flexShrink: 0 }} />
                  <div style={{ flex: 1, maxWidth: 320, height: 12, borderRadius: 4, backgroundColor: T.low }} />
                </div>
              ))}
            </div>
          ) : cartoes ? (
            // CELULAR (e tablet com a barra aberta): cartões. A tabela de 5 colunas virava rolagem lateral;
            // aqui cada registro é um alvo inteiro que abre o detalhe.
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {paginated.map((log, i) => {
                const aCfg = getActionCfg(log.action);
                const quando = new Date(log.createdAt);
                return (
                  <li key={log.id} data-testid={`row-log-${log.id}`} style={{ borderTop: i ? `1px solid ${T.border}` : undefined }}>
                    <div className="adm-linha" role="button" tabIndex={0} aria-label={`Abrir o registro: ${aCfg.label} por ${log.userName}`}
                      onClick={() => setAberto(log)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setAberto(log); } }}
                      style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 7 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                        <Selo tom={aCfg.tom}>{aCfg.label}</Selo>
                        <span style={{ fontFamily: FONT.mono, fontSize: FS.small, color: T.second, whiteSpace: "nowrap" }}>{dia(quando)} · {format(quando, "HH:mm")}</span>
                      </div>
                      <p style={{ margin: 0, fontSize: FS.body, lineHeight: 1.5, color: T.strong, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden", overflowWrap: "anywhere" }}>{descricaoDo(log)}</p>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, fontSize: FS.meta, color: T.second }}>
                        <span style={{ fontWeight: FW.forte, color: T.apoio, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{log.userName}</span>
                        <span style={{ whiteSpace: "nowrap" }}>{rotuloDaEntidade(log.entityType)}</span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                <thead>
                  <tr style={{ backgroundColor: T.bg, borderBottom: `1px solid ${T.border}` }}>
                    {[
                      { label: "Quando",     w: 120 },
                      { label: "Quem",       w: 210 },
                      { label: "Ação",       w: 130 },
                      { label: "Descrição",  w: undefined },
                      { label: "Entidade",   w: 150 },
                    ].map(col => (
                      <th key={col.label} scope="col" style={{ ...ROTULO, padding: "11px 16px", width: col.w }}>
                        {col.label}
                      </th>
                    ))}
                    <th scope="col" style={{ width: 40 }}><span className="sr-only">Abrir</span></th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map(log => {
                    const aCfg = getActionCfg(log.action);
                    const quando = new Date(log.createdAt);
                    return (
                      <tr
                        key={log.id}
                        data-testid={`row-log-${log.id}`}
                        className="adm-linha"
                        onClick={() => setAberto(log)}
                        style={{ borderBottom: `1px solid ${T.border}` }}
                      >
                        <td style={{ padding: "12px 16px", whiteSpace: "nowrap", verticalAlign: "top" }}>
                          <div style={{ fontSize: FS.meta, fontWeight: FW.forte, color: T.text }}>{dia(quando)}</div>
                          <div style={{ fontFamily: FONT.mono, fontSize: FS.small, color: T.second, marginTop: 2 }}>{format(quando, "HH:mm:ss", { locale: ptBR })}</div>
                        </td>

                        <td style={{ padding: "12px 16px", verticalAlign: "top" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
                            <span aria-hidden="true" style={{ width: 28, height: 28, borderRadius: R.pill, backgroundColor: T.low, color: T.apoio, display: "flex", alignItems: "center", justifyContent: "center", fontSize: FS.micro, fontWeight: FW.rotulo, flexShrink: 0 }}>
                              {initials(log.userName)}
                            </span>
                            {/* Um clique no nome = "o que mais esta pessoa
                                fez?". Era copiar o nome à mão para a busca. */}
                            <button type="button"
                              className="adm-nome"
                              onClick={(e) => { e.stopPropagation(); filtrarPessoa(log.userName); }}
                              title={`Ver só as ações de ${log.userName}`}
                              aria-label={`Filtrar a trilha pelas ações de ${log.userName}`}
                              style={{ fontFamily: "inherit", fontSize: FS.body, fontWeight: FW.forte, color: T.strong, background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left", lineHeight: 1.35 }}>
                              {log.userName}
                            </button>
                          </div>
                        </td>

                        <td style={{ padding: "12px 16px", verticalAlign: "top" }}>
                          <Selo tom={aCfg.tom} style={{ whiteSpace: "nowrap" }}>{aCfg.label}</Selo>
                        </td>

                        <td style={{ padding: "12px 16px", fontSize: FS.body, lineHeight: 1.5, color: T.apoio, verticalAlign: "top" }}>
                          {/* Duas linhas aqui; a frase inteira no detalhe (clique na linha). */}
                          <span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", overflowWrap: "anywhere" }}>
                            {descricaoDo(log)}
                          </span>
                        </td>

                        <td style={{ padding: "12px 16px", verticalAlign: "top" }}>
                          {/* Sem `capitalize`: os rótulos já vêm grafados, e ele
                              transformava "Patrocinador do evento" em
                              "Patrocinador Do Evento". */}
                          <div style={{ fontSize: FS.meta, fontWeight: FW.forte, color: T.apoio }}>
                            {rotuloDaEntidade(log.entityType)}
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                            <span title={log.entityId} style={{ fontFamily: FONT.mono, fontSize: FS.small, color: T.second }}>
                              {log.entityId.slice(0, 8)}…
                            </span>
                            {botaoCopiar(log)}
                          </div>
                        </td>

                        <td style={{ padding: "12px 10px 12px 0", verticalAlign: "middle" }}>
                          <button type="button" className="adm-abrir adm-copiar" aria-label={`Abrir o registro: ${aCfg.label} por ${log.userName}`}
                            onClick={(e) => { e.stopPropagation(); setAberto(log); }}
                            style={{ width: 28, height: 28, display: "inline-flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", borderRadius: R.sm, cursor: "pointer", color: T.second }}>
                            <Abrir aria-hidden="true" style={{ width: 15, height: 15 }} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Rodapé da paginação ── */}
          {!isLoading && (
            <div style={{ padding: isMobile ? "12px 16px" : "10px 16px", borderTop: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, backgroundColor: T.bg }}>
              <p style={{ fontSize: FS.meta, color: T.second, fontWeight: FW.medio, margin: 0 }}>
                {Math.min((safePage - 1) * PAGE_SIZE + 1, filtered.length)}–{Math.min(safePage * PAGE_SIZE, filtered.length)} de{" "}
                <span style={{ fontFamily: FONT.mono, fontWeight: FW.forte, color: T.apoio }}>{filtered.length}</span> registros
              </p>
              <Paginacao pagina={safePage} totalPaginas={totalPages} onIr={setPage} toque={toque} />
            </div>
          )}
        </section>
      )}

      <DetalheDoLog
        log={aberto}
        rotuloDaAcao={aberto ? getActionCfg(aberto.action).label : ""}
        tomDaAcao={aberto ? getActionCfg(aberto.action).tom : "neutro"}
        rotuloDaEntidade={aberto ? rotuloDaEntidade(aberto.entityType) : ""}
        descricao={aberto ? descricaoDo(aberto) : ""}
        estadoDaCopia={aberto ? estadoDaCopia(aberto.id) : null}
        aoCopiar={() => aberto && copyEntityId(aberto.id, aberto.entityId)}
        aoFiltrarPessoa={() => aberto && filtrarPessoa(aberto.userName)}
        aoFechar={() => setAberto(null)}
      />
    </div>
  );
}
