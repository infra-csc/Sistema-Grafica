import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { FreezeWhileClosing, HIDE_NATIVE_CLOSE, ModalFooter, ModalHeader, modalSurface } from "@/components/modal-shell";
import { Link } from "wouter";
import { useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Pencil, Trash2, Search, X, AlertTriangle, Plus, Building2, ChevronLeft, ChevronRight } from "lucide-react";
import type { Sponsor } from "@shared/schema";
import { T, FS, R } from "@/lib/theme";
import { useIsMobile } from "@/hooks/use-mobile";
import { FilterSelect, type FilterOption } from "@/components/filter-select";
import { useFiltrosNaUrl, paginaValida } from "@/hooks/use-filtros-na-url";

const tiInput: React.CSSProperties = {
  width: "100%", padding: "14px 16px",
  backgroundColor: "#f0efee", border: "none", borderRadius: 8,
  fontSize: 13, color: T.text,
  transition: "all 0.2s", fontFamily: "inherit",
};

const sectionLabel = (n: string, title: string) => (
  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
    <span style={{ fontSize: 10, fontWeight: 900, color: T.accentText, fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "0.12em" }}>
      {n}
    </span>
    <span style={{ fontSize: 10, fontWeight: 900, color: T.second, textTransform: "uppercase", letterSpacing: "0.18em" }}>
      {title}
    </span>
    <div style={{ flex: 1, height: 1, backgroundColor: T.border }} />
  </div>
);

/* ── Color presets ── */
const PRESET_COLORS = [
  "#dc2626", "#f97316", "#eab308", "#10b981",
  "#2563eb", "#4f46e5", "#9333ea", "#db2777",
  "#1c1917", "#b45309", "#06b6d4", "#65a30d",
];

const PAGE_SIZE = 20;

/* ── Desenho comum das telas de cadastro ──
   Usuários, Patrocinadores, Modelos e Logs repetem estes controles com as
   MESMAS medidas (40px de alvo, raio 8, rótulo 12/800 em caixa alta). Antes
   cada tela tinha o seu, e trocar de cadastro parecia trocar de produto.
   Copiado (e não importado) porque cada tela é dona do próprio arquivo; se
   mudar aqui, mude nas outras três. */
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
 * PAGINAÇÃO — janela de até 5 páginas em volta da atual (antes esta tela
 * desenhava TODOS os números, e com 15 páginas a barra estourava no celular),
 * alvos de 32px (44 no celular) e a página atual cheia em escuro.
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

const ORDENS = ["name", "company", "executive", "events"] as const;
type Ordem = typeof ORDENS[number];

// `quota` (campo global legado) saiu do formulário de propósito: a cota real
// vive por evento em event_sponsors. Como o modal não tinha campo para ela,
// todo PATCH reenviava quota vazia e zerava o valor gravado no banco.
// O FORMULÁRIO TEM TRÊS CAMPOS — nome, executivo responsável e cor — por
// decisão do dono (ago/2026). Empresa, contato, telefone, e-mail e
// observações saíram: o app não fala com o patrocinador por nenhum desses
// canais (quem registra a aprovação é o Atendimento, em nome dele), e um
// cadastro de oito campos para três que importam era atrito sem retorno. As
// colunas continuam no banco e na tabela para o que já foi preenchido; o
// PATCH parcial não as toca.
const sponsorSchema = z.object({
  name:          z.string().min(1, "Nome obrigatório"),
  color:         z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Cor deve ser um hex válido, ex.: #F97316"),
  accountExecutiveId: z.string().optional(),
  strictApproval: z.boolean().optional(),
});
type SponsorForm = z.infer<typeof sponsorSchema>;

export default function Patrocinadores() {
  const isMobile = useIsMobile();
  const [modalOpen, setModalOpen]             = useState(false);
  const [editingSponsor, setEditingSponsor]   = useState<Sponsor | null>(null);
  const [deletingSponsor, setDeletingSponsor] = useState<Sponsor | null>(null);
  const [hoveredRow, setHoveredRow]           = useState<string | null>(null);
  // RECORTE NA URL (regra da casa): busca, executivo, ordem e página
  // sobrevivem ao F5, ao voltar do Painel Geral pelo link de uso e ao link
  // mandado a um colega. Filtro ou ordem nova voltam à página 1 no mesmo update.
  const { valores: filtros, definir, atualizar, limpar } = useFiltrosNaUrl(
    { busca: "", executivo: "all", ordem: "name", direcao: "asc", pagina: 1 },
    { aceita: { ordem: v => (ORDENS as readonly string[]).includes(v), direcao: v => v === "asc" || v === "desc", pagina: paginaValida } },
  );
  const search = filtros.busca;
  const execFilter = filtros.executivo;
  const sortBy = filtros.ordem as Ordem;
  const sortDir = filtros.direcao as "asc" | "desc";
  const page = filtros.pagina;
  const setPage = (p: number) => definir("pagina", p);
  const toque = isMobile ? 44 : 32;
  const { toast } = useToast();

  const { data: sponsors = [], isLoading, isError: sponsorsError, refetch: refetchSponsors } = useQuery<Sponsor[]>({
    queryKey: ["/api/sponsors"],
  });

  // Usuários para o seletor de executivo responsável (lista enxuta, sem e-mail).
  const { data: users = [], isError: usersError, refetch: refetchUsers } = useQuery<{ id: string; name: string; role: string }[]>({
    queryKey: ["/api/users/basic"],
  });
  // Quantos eventos/peças cada patrocinador tem — mostra quem está ativo e
  // quem nunca foi usado (candidato a limpeza).
  const { data: usage = {}, isError: usageError, refetch: refetchUsage } = useQuery<Record<string, { events: number; items: number; pendencias?: number; mediaDias?: number | null }>>({
    queryKey: ["/api/sponsors/usage"],
  });

  // Papel do usuário logado: a lixeira só aparece para admin, espelhando o
  // DELETE /api/sponsors/:id que é requireAdmin no servidor.
  const { data: me } = useQuery<{ id: string; role: string }>({ queryKey: ["/api/auth/me"] });
  const isAdmin = me?.role === "admin";

  const userById = new Map(users.map(u => [u.id, u]));
  const execName = (s: Sponsor) => s.accountExecutiveId
    ? userById.get(s.accountExecutiveId)?.name ?? "—"
    : "";

  const form = useForm<SponsorForm>({
    resolver: zodResolver(sponsorSchema),
    defaultValues: { name: "", color: "#f97316", accountExecutiveId: "", strictApproval: false },
  });

  const selectedColor = form.watch("color") || "#f97316";

  // "SALVAR E CADASTRAR OUTRO": a carteira de um evento novo chega em lote
  // (10, 15 marcas). Mesmo POST e mesmo onSuccess do salvar; só não fecha —
  // limpa o nome, MANTÉM o executivo (o lote costuma ser da mesma pessoa) —
  // com aviso junto ao campo, senão a conta ia para o executivo do anterior
  // sem ninguém notar —, volta cor e regra ao padrão e devolve o foco ao Nome.
  // Ref, não estado: só o onSuccess lê.
  const continuarRef = useRef(false);
  const [criadosNestaSequencia, setCriadosNestaSequencia] = useState<string[]>([]);
  // Executivo que veio do cadastro anterior ("" = "Não atribuído" herdado;
  // null = nada herdado). Só alimenta o aviso "mantido do cadastro anterior".
  const [executivoHerdado, setExecutivoHerdado] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: async (data: SponsorForm) => {
      const res = await apiRequest("POST", "/api/sponsors", data);
      return res.json();
    },
    // Nome no toast: com o modal já fechado, é a confirmação de QUAL cadastro
    // saiu — e o próximo passo, que mora em outra tela (a cota é por evento).
    onSuccess: (_r, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/sponsors"] });
      toast({ title: "Patrocinador cadastrado", description: `${vars.name} já pode ser vinculado aos eventos — a cota (Master, Gold…) se define no vínculo com cada evento.` });
      if (continuarRef.current) {
        continuarRef.current = false;
        setCriadosNestaSequencia(prev => [...prev, vars.name]);
        // Só avisa quando havia executivo: "Não atribuído" é o próprio padrão,
        // não há o que herdar sem perceber.
        setExecutivoHerdado(vars.accountExecutiveId ? vars.accountExecutiveId : null);
        form.reset({ name: "", color: "#f97316", accountExecutiveId: vars.accountExecutiveId || "", strictApproval: false });
        window.setTimeout(() => document.getElementById("sponsor-name")?.focus(), 0);
        return;
      }
      setModalOpen(false); form.reset();
    },
    onError: (e: Error) => { continuarRef.current = false; toast({ variant: "destructive", title: "Não foi possível cadastrar o patrocinador", description: `${e.message} — nada foi salvo; o formulário continua preenchido.` }); },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: { id: string; update: Partial<SponsorForm> }) => {
      const res = await apiRequest("PATCH", `/api/sponsors/${data.id}`, data.update);
      return res.json();
    },
    onSuccess: (_r, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/sponsors"] });
      setModalOpen(false); setEditingSponsor(null); form.reset();
      toast({ title: "Alterações salvas", description: vars.update.name ? `Cadastro de ${vars.update.name} atualizado.` : undefined });
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Não foi possível salvar as alterações", description: e.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/sponsors/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sponsors"] });
      const nome = deletingSponsor?.name;
      setDeletingSponsor(null);
      toast({ title: "Patrocinador excluído", description: nome ? `${nome} saiu do cadastro.` : undefined });
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Não foi possível excluir o patrocinador", description: e.message }),
  });

  const openCreate = () => {
    setEditingSponsor(null);
    setCriadosNestaSequencia([]);
    setExecutivoHerdado(null);
    form.reset({ name: "", color: "#f97316", accountExecutiveId: "", strictApproval: false });
    setModalOpen(true);
  };

  const openEdit = (s: Sponsor) => {
    setEditingSponsor(s);
    form.reset({ name: s.name, color: s.color || "#f97316", accountExecutiveId: s.accountExecutiveId || "", strictApproval: !!s.strictApproval });
    setModalOpen(true);
  };

  const onSubmit = (data: SponsorForm) => {
    if (editingSponsor) {
      updateMutation.mutate({ id: editingSponsor.id, update: data });
    } else {
      createMutation.mutate(data);
    }
  };

  // Saída única do modal (X, Cancelar, Esc, clique fora): confirma o descarte
  // apenas quando há alteração real no formulário.
  const requestClose = () => {
    if (form.formState.isDirty && !window.confirm("Descartar as alterações deste formulário?")) return;
    setModalOpen(false);
    setEditingSponsor(null);
    form.reset();
  };

  /* ── Filtered + sorted + paginated ── */
  /** A BUSCA casa? Vale para a lista E para o pool das opções do menu. */
  const casaBusca = (s: Sponsor) => {
    const q = search.toLowerCase();
    return !q || s.name.toLowerCase().includes(q) || (s.company || "").toLowerCase().includes(q)
      || (s.email || "").toLowerCase().includes(q) || (s.contactPerson || "").toLowerCase().includes(q)
      || execName(s).toLowerCase().includes(q);
  };
  const casaExec = (s: Sponsor) => {
    if (execFilter === "all") return true;
    if (execFilter === "__none__") return !s.accountExecutiveId;
    return s.accountExecutiveId === execFilter;
  };

  // ── Opções do menu de executivo, COM contagem ─────────────────────────
  // O <select> nativo listava TODOS os usuários do sistema, sem contagem —
  // inclusive quem não é executivo de patrocinador nenhum, e o clique nesses
  // devolvia lista vazia sem dizer por quê. O pool aqui é a lista já recortada
  // pela busca e SEM o próprio filtro de executivo aplicado (senão a opção
  // escolhida seria a única com número). É a mesma disciplina travada em
  // server/__tests__/faceta-lista-invariante.test.ts.
  const execPool = sponsors.filter(casaBusca);
  const execFilterOptions = (() => {
    const contagem = new Map<string, number>();
    let semExecutivo = 0;
    execPool.forEach(s => {
      if (!s.accountExecutiveId) { semExecutivo++; return; }
      contagem.set(s.accountExecutiveId, (contagem.get(s.accountExecutiveId) ?? 0) + 1);
    });
    const opts: FilterOption[] = users
      .filter(u => contagem.has(u.id))
      .map(u => ({ value: u.id, label: u.name, count: contagem.get(u.id)! }));
    // `pinned` e não `unshift`: o FilterSelect reordena a lista alfabeticamente
    // e só respeita a posição de quem está fixado — sem isto, "Sem executivo"
    // acabaria enterrado entre os nomes com S.
    if (semExecutivo > 0) {
      opts.push({ value: "__none__", label: "Sem executivo", count: semExecutivo, pinned: true });
    }
    return opts;
  })();

  // Opções do CAMPO do formulário — outra lista, de propósito. O filtro só
  // oferece quem já é executivo de alguém (clicar em quem não é devolveria
  // lista vazia); o campo tem de oferecer TODA pessoa, senão ninguém consegue
  // atribuir o primeiro patrocinador a um executivo novo. Mesmo controle,
  // jobs diferentes — a distinção está no vocabulário do filter-select.
  const execFormOptions: FilterOption[] = [
    { value: "__none__", label: "Não atribuído", pinned: true },
    ...users.map(u => ({ value: u.id, label: u.name })),
  ];

  const filtered = sponsors
    .filter(s => casaBusca(s) && casaExec(s))
    // Ordenação padrão alfabética (pt-BR, ignorando acentos/maiúsculas).
    .sort((a, b) => {
      if (sortBy === "events") {
        const n = (s: Sponsor) => usage[s.id]?.events ?? 0;
        const cmp = n(a) - n(b) || a.name.localeCompare(b.name, "pt-BR");
        return sortDir === "asc" ? cmp : -cmp;
      }
      const val = (s: Sponsor) =>
        sortBy === "company" ? (s.company || "")
        : sortBy === "executive" ? execName(s)
        : s.name;
      const cmp = val(a).localeCompare(val(b), "pt-BR", { sensitivity: "base" });
      return sortDir === "asc" ? cmp : -cmp;
    });

  const toggleSort = (col: typeof sortBy) => {
    if (sortBy === col) atualizar({ direcao: sortDir === "asc" ? "desc" : "asc", pagina: 1 });
    else atualizar({ ordem: col, direcao: "asc", pagina: 1 });
  };

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages);
  const paginated  = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const thStyle: React.CSSProperties = {
    padding: "12px 20px", fontSize: 10, fontWeight: 900, color: T.second,
    textTransform: "uppercase", letterSpacing: "0.16em", textAlign: "left",
    whiteSpace: "nowrap",
  };

  // Falha na lista principal bloqueia a tabela; falha nas queries auxiliares
  // (executivos, uso por evento) vira banner com retry sem esconder a lista.
  const auxError = usersError || usageError;
  const retryAux = () => {
    if (usersError) refetchUsers();
    if (usageError) refetchUsage();
  };

  return (
    <div style={{ backgroundColor: T.bg, height: "100%", overflowY: "auto", padding: isMobile ? "16px 16px 48px" : "28px 32px 64px" }}>

      {/* ── Page Header ── */}
      {/* Mesmo cabeçalho de Usuários, Logs e Modelos: título + frase do que a
          tela faz à esquerda, ação primária à direita. O sobretítulo laranja
          "Console de Gerenciamento" saiu — não dizia nada que o menu não diga. */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 24, flexWrap: "wrap", gap: 16 }}>
        <div>
          <h1 style={{ fontSize: FS.h1, fontWeight: 700, color: T.text, margin: "0 0 6px", fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "-0.03em", lineHeight: 1.1 }}>
            Patrocinadores
          </h1>
          <p style={{ fontSize: FS.body, color: T.second, margin: 0, lineHeight: 1.5, maxWidth: 640 }}>
            {/* O que o cadastro É e o que NÃO é: quem chega procurando a cota
                precisa saber que ela não mora aqui. */}
            Cadastro, executivo responsável e regra de aprovação de cada patrocinador. A cota (Master, Gold…) é definida por evento, ao vincular o patrocinador.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 16 : 24, flexWrap: "wrap", width: isMobile ? "100%" : undefined }}>
          <div style={{ textAlign: isMobile ? "left" : "right" }}>
            <p style={{ fontSize: 10, fontWeight: 900, color: T.second, textTransform: "uppercase", letterSpacing: "0.16em", margin: "0 0 4px" }}>Patrocinadores</p>
            <p style={{ fontSize: FS.h2, fontWeight: 800, color: T.text, margin: 0, fontFamily: "'Space Grotesk', sans-serif", lineHeight: 1 }}>{sponsors.length}</p>
          </div>
          <div aria-hidden="true" style={{ width: 1, height: 36, backgroundColor: T.border }} />
          {/* Contas sem executivo: clicar filtra a lista para resolver. */}
          {(() => {
            const semExec = sponsors.filter(s => !s.accountExecutiveId).length;
            const ativo = execFilter === "__none__";
            return (
              <button
                onClick={() => atualizar({ executivo: ativo ? "all" : "__none__", pagina: 1 })}
                data-testid="stat-sem-executivo"
                aria-pressed={ativo}
                title={ativo ? "Mostrar todos" : "Ver apenas patrocinadores sem executivo"}
                style={{ textAlign: isMobile ? "left" : "right", background: ativo ? "#fff7ed" : "none", border: `1px solid ${ativo ? "#fed7aa" : "transparent"}`, borderRadius: R.md, padding: "4px 8px", margin: "-4px -8px", cursor: "pointer", fontFamily: "inherit", transition: "background-color 0.15s ease, border-color 0.15s ease" }}
              >
                <p style={{ fontSize: 10, fontWeight: 900, color: ativo ? "#c2410c" : T.second, textTransform: "uppercase", letterSpacing: "0.16em", margin: "0 0 4px" }}>Sem Executivo</p>
                <p style={{ fontSize: FS.h2, fontWeight: 800, color: semExec > 0 ? "#b45309" : T.text, margin: 0, fontFamily: "'Space Grotesk', sans-serif", lineHeight: 1 }}>
                  {semExec}
                </p>
              </button>
            );
          })()}
          <button
            onClick={openCreate}
            data-testid="button-add-sponsor"
            style={{ ...BTN_PRIMARIO, marginLeft: isMobile ? 0 : undefined, flex: isMobile ? "1 1 100%" : undefined }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#292524")}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = T.dark)}
          >
            <Plus aria-hidden="true" style={{ width: 15, height: 15 }} />
            Novo Patrocinador
          </button>
        </div>
      </div>

        {/* Controls bar — solta acima da tabela, como em Usuários, Logs e
            Modelos: a mesma barra de busca no mesmo lugar nas quatro telas. */}
        <div style={{ marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <div style={{ position: "relative", width: isMobile ? "100%" : 380 }}>
            <Search aria-hidden="true" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: T.muted }} />
            <input
              value={search}
              onChange={e => atualizar({ busca: e.target.value, pagina: 1 })}
              placeholder="Filtrar por nome, empresa, e-mail ou executivo..."
              aria-label="Filtrar patrocinadores por nome, empresa, e-mail ou executivo"
              type="search"
              data-testid="input-search-sponsors"
              style={{ ...tiInput, height: 40, padding: "0 12px 0 36px" }}
              onFocus={e => { e.currentTarget.style.backgroundColor = "#fff"; e.currentTarget.style.boxShadow = `0 0 0 2px rgba(249,115,22,0.2)`; }}
              onBlur={e =>  { e.currentTarget.style.backgroundColor = "#f0efee"; e.currentTarget.style.boxShadow = "none"; }}
            />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", width: isMobile ? "100%" : undefined }}>
            {/* Filtro por executivo responsável — FilterSelect, o controle da
                casa (ver o vocabulário em components/filter-select.tsx). Era um
                <select> NATIVO: abria o menu do sistema operacional, com o azul
                do Windows e a fonte do sistema, dentro de uma barra desenhada
                inteiramente pela casa — e sem busca, sem contagem e sem o × de
                limpar que todo filtro do app tem. */}
            <FilterSelect
              label="Executivo"
              allLabel="Todos os executivos"
              hideWhenEmpty={false}
              value={execFilter}
              onChange={v => atualizar({ executivo: v, pagina: 1 })}
              options={execFilterOptions}
              searchPlaceholder="Buscar executivo..."
              emptyText="Nenhum executivo"
              panelWidth={240}
              dropdownAlign={isMobile ? "left" : "right"}
              testId="filter-account-executive"
              // Mesmo gatilho de Usuários, Logs e Modelos (40px, contorno
              // claro, rótulo = nome da dimensão enquanto vazio).
              triggerStyle={{ height: 40, padding: "0 12px", backgroundColor: T.surface, border: `1px solid ${T.border}`, borderRadius: R.md, fontSize: 12, fontWeight: 700, color: T.second }}
            />

            {(search || execFilter !== "all") && (
              <button type="button" onClick={() => limpar(["busca", "executivo", "pagina"])} style={BTN_LIMPAR}>
                <X aria-hidden="true" style={{ width: 11, height: 11 }} />
                {/* N = quantos FILTROS ativos o botão desfaz — com o nº de
                    resultados aqui, "Limpar (0)" numa busca vazia parecia
                    "nada a limpar" justamente quando limpar mais importa. */}
                Limpar ({(search ? 1 : 0) + (execFilter !== "all" ? 1 : 0)})
              </button>
            )}
          </div>
        </div>

      {/* ── Table Container ── */}
      <div style={{ backgroundColor: T.surface, borderRadius: 12, border: `1px solid ${T.border}`, overflow: "hidden" }}>

        {/* Falha nas queries auxiliares: avisa sem esconder a tabela */}
        {auxError && (
          <div role="alert" style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 20px", backgroundColor: "#fffbeb", borderBottom: `1px solid #fde68a` }}>
            <AlertTriangle style={{ width: 14, height: 14, color: "#b45309", flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: "#92400e", flex: 1 }}>
              Falha ao carregar {usersError ? "a lista de executivos" : ""}{usersError && usageError ? " e " : ""}{usageError ? "o uso por evento" : ""} — a tabela pode exibir dados incompletos.
            </span>
            <button
              onClick={retryAux}
              style={{ padding: "6px 12px", backgroundColor: "#fff", border: "1px solid #fde68a", borderRadius: 6, cursor: "pointer", fontSize: 10, fontWeight: 800, color: "#92400e", textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap" }}
            >
              Tentar novamente
            </button>
          </div>
        )}

        {/* Table */}
        {isLoading ? (
          // Esqueleto com a silhueta da linha (bolinha de cor + nome + colunas):
          // a tabela chega no lugar em que vai ficar. Pulso só com motion-safe.
          <div role="status" aria-label="Carregando patrocinadores" style={{ padding: "8px 0" }}>
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="motion-safe:animate-pulse" style={{ display: "flex", alignItems: "center", gap: 10, padding: "18px 20px", borderBottom: `1px solid ${T.low}` }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: T.border }} />
                <div style={{ width: 180, height: 12, borderRadius: 4, backgroundColor: T.low }} />
                <div style={{ width: 120, height: 12, borderRadius: 4, backgroundColor: T.low, marginLeft: 40 }} />
                <div style={{ width: 90, height: 12, borderRadius: 4, backgroundColor: T.low, marginLeft: 40 }} />
              </div>
            ))}
          </div>
        ) : sponsorsError ? (
          <div style={{ padding: "72px 24px", textAlign: "center" }}>
            <AlertTriangle style={{ width: 40, height: 40, color: "#b45309", margin: "0 auto 12px" }} />
            <p style={{ fontSize: 15, fontWeight: 700, color: T.text, margin: "0 0 6px" }}>
              Não foi possível carregar os patrocinadores
            </p>
            <p style={{ fontSize: 13, color: T.second, margin: "0 0 18px" }}>
              Verifique sua conexão e tente novamente.
            </p>
            <button
              type="button"
              onClick={() => refetchSponsors()}
              style={{ ...BTN_PRIMARIO, height: 36, fontSize: 11 }}
            >
              Tentar novamente
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: "72px 0", textAlign: "center" }}>
            <Building2 style={{ width: 44, height: 44, color: T.muted, margin: "0 auto 12px" }} />
            <p style={{ fontSize: 15, fontWeight: 700, color: T.second, margin: "0 0 6px" }}>
              {search || execFilter !== "all" ? "Nenhum patrocinador encontrado" : "Nenhum patrocinador cadastrado"}
            </p>
            <p style={{ fontSize: 13, color: T.second, margin: "0 0 16px" }}>
              {search || execFilter !== "all" ? "Tente buscar por outro termo ou limpe os filtros" : "Cadastre o primeiro para vinculá-lo aos eventos"}
            </p>
            {/* O estado vazio dizia o que fazer mas não oferecia o botão — o
                próximo passo ficava lá no topo da página. Mesmo padrão do vazio
                de Usuários: a ação mora onde o olho já está. */}
            {search || execFilter !== "all" ? (
              <button
                type="button"
                onClick={() => limpar(["busca", "executivo", "pagina"])}
                style={{ ...BTN_PRIMARIO, height: 36, backgroundColor: T.surface, color: T.text, border: `1px solid ${T.bdark}`, fontSize: 11 }}
              >
                Limpar filtros
              </button>
            ) : (
              <button
                type="button"
                onClick={openCreate}
                style={{ ...BTN_PRIMARIO, height: 36, fontSize: 11 }}
              >
                <Plus aria-hidden="true" style={{ width: 13, height: 13 }} /> Novo Patrocinador
              </button>
            )}
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ backgroundColor: T.low, borderBottom: `1px solid ${T.border}` }}>
                  {([
                    { key: "name", label: "Nome do Patrocinador" },
                    { key: "company", label: "Empresa" },
                    { key: "executive", label: "Executivo Responsável" },
                    { key: "events", label: "Eventos" },
                  ] as const).map(col => (
                    /* Ordenar a tabela só existia no clique: por teclado não
                       havia como reordenar nada. aria-sort informa a ordem
                       atual, que até aqui só a setinha comunicava. */
                    <th
                      key={col.key}
                      style={{ ...thStyle, cursor: "pointer", userSelect: "none" }}
                      tabIndex={0}
                      aria-sort={sortBy === col.key ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
                      onClick={() => toggleSort(col.key)}
                      onKeyDown={e => {
                        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleSort(col.key); }
                      }}
                      title={`Ordenar por ${col.label.toLowerCase()}`}
                    >
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                        {col.label}
                        <span style={{ opacity: sortBy === col.key ? 1 : 0.25, fontSize: 10 }}>
                          {sortBy === col.key && sortDir === "desc" ? "▼" : "▲"}
                        </span>
                      </span>
                    </th>
                  ))}
                  <th style={thStyle} title="Pendências de aprovação agora · tempo médio de resposta">Resposta</th>
                  <th style={thStyle}>Contato Responsável</th>
                  <th style={thStyle}>E-mail</th>
                  <th style={thStyle}>Telefone</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((sponsor, i) => {
                  const color   = sponsor.color || "#f97316";
                  const isHover = hoveredRow === sponsor.id;
                  return (
                    <tr
                      key={sponsor.id}
                      data-testid={`sponsor-item-${sponsor.id}`}
                      onMouseEnter={() => setHoveredRow(sponsor.id)}
                      onMouseLeave={() => setHoveredRow(null)}
                      // `target === currentTarget`: o Enter num botão DENTRO da
                      // linha (a lixeira, o link de uso) subia até aqui e abria
                      // a edição por cima da confirmação de exclusão.
                      tabIndex={0} aria-label={`Editar ${sponsor.name}`} onKeyDown={e => { if (e.key === "Enter" && e.target === e.currentTarget) { e.preventDefault(); openEdit(sponsor); } }} onClick={() => openEdit(sponsor)}
                      title="Clique para editar"
                      style={{ borderBottom: i < paginated.length - 1 ? `1px solid ${T.low}` : "none", backgroundColor: isHover ? "#fafaf9" : "transparent", transition: "background 0.1s", cursor: "pointer" }}
                    >
                      {/* Nome */}
                      <td style={{ padding: "16px 20px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: color, flexShrink: 0 }} />
                          <span data-testid={`text-sponsor-name-${sponsor.id}`}
                            style={{ fontSize: 13, fontWeight: 700, color: T.text, fontFamily: "'Space Grotesk', sans-serif" }}>
                            {sponsor.name}
                          </span>
                          {sponsor.strictApproval && (
                            /* #9a3412 sobre #fff7ed = 7,0:1 */
                            <span data-testid={`tag-desaprovador-${sponsor.id}`}
                              title="Patrocinador desaprovador: toda versão nova da arte revoga a aprovação dele, e a reprovação de outro patrocinador também"
                              style={{ fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#9a3412", backgroundColor: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 4, padding: "2px 6px", whiteSpace: "nowrap" }}>
                              desaprovador
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Empresa */}
                      <td style={{ padding: "16px 20px" }}>
                        <span style={{ fontSize: 13, color: T.second }}>
                          {sponsor.company || <span style={{ color: T.second, fontStyle: "italic" }}>—</span>}
                        </span>
                      </td>

                      {/* Executivo responsável */}
                      <td style={{ padding: "16px 20px" }}>
                        {execName(sponsor) ? (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: T.text, fontWeight: 600 }}>
                            <span style={{
                              width: 22, height: 22, borderRadius: "50%", backgroundColor: T.low,
                              display: "inline-flex", alignItems: "center", justifyContent: "center",
                              fontSize: 10, fontWeight: 800, color: T.second, flexShrink: 0,
                            }}>
                              {execName(sponsor).split(" ").filter(Boolean).slice(0, 2).map(n => n[0]?.toUpperCase()).join("")}
                            </span>
                            {execName(sponsor)}
                          </span>
                        ) : (
                          <span style={{ color: T.second, fontStyle: "italic", fontSize: 13 }}>não atribuído</span>
                        )}
                      </td>

                      {/* Eventos / peças vinculados */}
                      <td style={{ padding: "16px 20px" }}>
                        {(() => {
                          const u = usage[sponsor.id];
                          if (!u || u.events === 0) {
                            return <span title="Nunca vinculado a um evento" style={{ fontSize: 10, fontWeight: 800, color: "#b45309", backgroundColor: "#fffbeb", border: "1px solid #fde68a", borderRadius: 6, padding: "2px 8px", whiteSpace: "nowrap" }}>sem evento</span>;
                          }
                          // A informação mais densa da linha leva a algum lugar: o
                          // Painel Geral já aceita ?patrocinador= no recorte. A linha
                          // inteira abre a edição — daí o stopPropagation.
                          return (
                            <Link
                              href={`/?patrocinador=${sponsor.id}`}
                              onClick={e => e.stopPropagation()}
                              data-testid={`link-uso-${sponsor.id}`}
                              title={`Ver as ${u.items} ${u.items === 1 ? "peça" : "peças"} deste patrocinador no Painel Geral`}
                              style={{ fontSize: 13, color: T.text, fontWeight: 700, whiteSpace: "nowrap", textDecoration: "none", borderBottom: "1px solid #fed7aa" }}
                            >
                              {u.events} <span style={{ fontWeight: 500, color: T.second }}>{u.events === 1 ? "evento" : "eventos"}</span>
                              {u.items > 0 && <span style={{ color: T.second, fontWeight: 500 }}> · {u.items} pç</span>}
                            </Link>
                          );
                        })()}
                      </td>

                      {/* Resposta — o app inteiro depende da resposta do
                          patrocinador, e este cadastro não dizia nada sobre
                          responder. Duas medidas na mesma célula: pendências
                          AGORA e tempo MÉDIO de resposta. Sem histórico de
                          decisão, a média é "—" (zero leria como "responde na
                          hora"). Tons: #b45309 6,0:1, #b91c1c 6,5:1, #15803d 5,3:1. */}
                      <td style={{ padding: "16px 20px", whiteSpace: "nowrap" }} data-testid={`cell-resposta-${sponsor.id}`}>
                        {(() => {
                          const u = usage[sponsor.id];
                          const pend = u?.pendencias ?? 0;
                          const media = u?.mediaDias ?? null;
                          const corPend = pend === 0 ? "#15803d" : pend >= 5 ? "#b91c1c" : "#b45309";
                          const corMedia = media === null ? T.second : media >= 14 ? "#b91c1c" : media >= 7 ? "#b45309" : "#57534e";
                          const title = `${pend === 0 ? "Nenhuma peça esperando aprovação agora" : `${pend} ${pend === 1 ? "peça esperando" : "peças esperando"} aprovação agora`} · ${media === null ? "nunca respondeu a um pedido — sem média" : `leva ${media} ${media === 1 ? "dia" : "dias"} em média para responder`}`;
                          return (
                            <span title={title} style={{ display: "inline-flex", alignItems: "baseline", gap: 8 }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: corPend }}>{pend === 0 ? "em dia" : `${pend} pend.`}</span>
                              <span style={{ fontSize: 12, fontWeight: 700, color: corMedia, fontFamily: "'DM Mono', monospace" }}>{media === null ? "—" : `${media}d`}</span>
                            </span>
                          );
                        })()}
                      </td>

                      {/* Contato */}
                      <td style={{ padding: "16px 20px" }}>
                        <span style={{ fontSize: 13, fontWeight: 500, color: T.text }}>
                          {sponsor.contactPerson || <span style={{ color: T.second, fontStyle: "italic" }}>—</span>}
                        </span>
                      </td>

                      {/* Email */}
                      <td style={{ padding: "16px 20px" }}>
                        <span style={{ fontSize: 13, color: T.second, fontFamily: "'DM Mono', monospace" }}>
                          {sponsor.email || <span style={{ color: T.second, fontStyle: "italic", fontFamily: "inherit" }}>—</span>}
                        </span>
                      </td>

                      {/* Telefone */}
                      <td style={{ padding: "16px 20px" }}>
                        <span style={{ fontSize: 13, color: T.second, fontFamily: "'DM Mono', monospace" }}>
                          {sponsor.phone || <span style={{ color: T.second, fontStyle: "italic", fontFamily: "inherit" }}>—</span>}
                        </span>
                      </td>

                      {/* Ações — também visíveis quando algum botão recebe
                          foco por teclado, não só no hover do mouse */}
                      <td
                        style={{ padding: "16px 20px" }}
                        onClick={e => e.stopPropagation()}
                        onFocus={() => setHoveredRow(sponsor.id)}
                        onBlur={() => setHoveredRow(current => (current === sponsor.id ? null : current))}
                      >
                        {/* Opacidade 0 fora do hover escondia as ações de quem
                            não tem mouse: no celular não existe hover, e a
                            lixeira era um alvo invisível. Agora ficam discretas
                            (0.45) e acendem no hover/foco; no celular, inteiras. */}
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: 4, opacity: isHover || isMobile ? 1 : 0.7, transition: "opacity 0.15s" }}>
                          <button
                            data-testid={`button-edit-${sponsor.id}`}
                            aria-label={`Editar ${sponsor.name}`} onClick={() => openEdit(sponsor)}
                            style={{ width: toque, height: toque, backgroundColor: "transparent", border: "none", borderRadius: R.md, cursor: "pointer", color: T.second, display: "flex", alignItems: "center", justifyContent: "center", transition: "background-color 0.12s ease, color 0.12s ease" }}
                            onMouseEnter={e => { e.currentTarget.style.backgroundColor = T.low; e.currentTarget.style.color = T.text; }}
                            onMouseLeave={e => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = T.second; }}
                          >
                            <Pencil style={{ width: 15, height: 15 }} />
                          </button>
                          {isAdmin && (
                            <button
                              data-testid={`button-delete-${sponsor.id}`}
                              onClick={() => setDeletingSponsor(sponsor)}
                              aria-label={`Excluir patrocinador ${sponsor.name}`}
                              style={{ width: toque, height: toque, backgroundColor: "transparent", border: "none", borderRadius: R.md, cursor: "pointer", color: T.second, display: "flex", alignItems: "center", justifyContent: "center", transition: "background-color 0.12s ease, color 0.12s ease" }}
                              onMouseEnter={e => { e.currentTarget.style.backgroundColor = "#fef2f2"; e.currentTarget.style.color = "#b91c1c"; }}
                              onMouseLeave={e => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = T.second; }}
                            >
                              <Trash2 style={{ width: 15, height: 15 }} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination — só aparece quando há mais de uma página; a contagem
            total já mora no cabeçalho. */}
        {filtered.length > PAGE_SIZE && (
          <div style={{ padding: "10px 20px", backgroundColor: T.low, borderTop: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
            <span style={{ fontSize: 11, color: T.second, fontWeight: 600 }}>
              Exibindo {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} de {filtered.length} patrocinadores
            </span>
            <Paginacao pagina={safePage} totalPaginas={totalPages} onIr={setPage} toque={toque} />
          </div>
        )}
      </div>


      {/* ══════════════════════════════
          MODAL: Criar / Editar
      ══════════════════════════════ */}
      <Dialog open={modalOpen} onOpenChange={o => { if (!o) requestClose(); }}>

        <DialogContent
          // HIDE_NATIVE_CLOSE: o cabeçalho deste modal desenha o próprio X (o
          // que chama `requestClose` e avisa sobre alterações não salvas), e o
          // DialogContent base já renderiza um X no canto — ficavam DOIS botões
          // de fechar sobrepostos, com o de cima descartando o formulário sem
          // perguntar nada.
          className={`p-0 gap-0 border-none ${HIDE_NATIVE_CLOSE}`}
          // ALTURA — a conta, porque é ela que alguém vai mexer sem entender.
          //
          // Antes aqui só havia `maxWidth`, `borderRadius` e `overflow: hidden`:
          // nenhum teto de altura e nenhuma coluna flex. O modal crescia com o
          // formulário — medi 1047px em 1280 de largura e 1215px em 375 —, e o
          // Radix centra o Content com `top: 50%` + `translateY(-50%)`, então o
          // que passa da viewport é cortado METADE em cima e METADE embaixo ao
          // mesmo tempo. Medido antes da correção: 151px de cada lado em 745 de
          // altura, 301px de cada lado em 445 (barra de favoritos + zoom, que é
          // a janela do relato) e 274px em 375×667 — o cabeçalho e a seção 01
          // saíam por cima e "Observações" por baixo. O `flex: 1` do corpo não
          // segurava nada: `flex` só reparte altura quando existe altura
          // limitada para repartir, e não havia nenhuma.
          //
          // A CONTA é `100vh − 48`: a viewport inteira menos 24px de respiro em
          // cima e 24 embaixo. O desconto é simétrico porque o Radix centra.
          // NÃO se desconta cabeçalho e rodapé por número fixo — eles são itens
          // flex que não rolam, o próprio navegador os mede (o tamanho mínimo
          // automático de um item flex é o conteúdo dele) e o corpo, com
          // `flex: 1 1 auto; minHeight: 0`, fica com exatamente o que sobrar.
          // Vale em 1080, em 445 e no celular, onde o título de duas linhas
          // engorda o cabeçalho e nenhum número fixo acertaria os dois casos.
          // É a mesma regra do modal da Gestão de Prazos e do `modal-shell`.
          // Hoje a conta vem pronta de `modalSurface` (mesma casca de Usuários
          // e Modelos).
          style={modalSurface(640)}
          // FOCO INICIAL no Nome: o Radix focava o X do cabeçalho (primeiro
          // focável), e quem abria o cadastro tinha de dar Tab para digitar.
          onOpenAutoFocus={e => { e.preventDefault(); document.getElementById("sponsor-name")?.focus(); }}
        >
          {/* POR QUE congelar aqui: salvar fecha o modal, invalida /api/sponsors,
              chama form.reset() e toasta no MESMO commit. São 11 primitivas do
              Radix aqui dentro (9 FormControl, que é um <Slot>, mais título e
              descrição) recebendo desanexa+reanexa de ref a cada render da
              página durante a animação de saída — o laço do React #185. Além
              disso o form.reset() apagava o formulário À VISTA, no meio do
              fade. Mecanismo por extenso em components/modal-shell.tsx. */}
          <FreezeWhileClosing open={modalOpen}>
          <DialogTitle className="sr-only">{editingSponsor ? "Editar patrocinador" : "Novo patrocinador"}</DialogTitle>
          <DialogDescription className="sr-only">Dados de contato, identidade visual e executivo responsável</DialogDescription>


          {/* Esta div é o elo da coluna: o Content é flex, mas os três blocos
              (cabeçalho, corpo, rodapé) moram aqui dentro, então ELA precisa ser
              a coluna flex e precisa poder encolher (`minHeight: 0`), senão o
              teto do Content não chega até o corpo e nada rola. */}
          <div style={{ display: "flex", flexDirection: "column", flex: "1 1 auto", minHeight: 0 }}>

            {/* Cabeçalho da casa (variante `work`), o mesmo de Usuários e
                Modelos. O X dele passa pelo `requestClose`. */}
            <ModalHeader
              icon={editingSponsor ? Pencil : Building2}
              tint={T.accentText}
              title={editingSponsor ? "Editar patrocinador" : "Novo patrocinador"}
              subtitle={editingSponsor ? `Editando ${editingSponsor.name}` : "Nome, executivo e cor — o resto vem dos eventos"}
              onClose={requestClose}
            />

            {/* Corpo: o ÚNICO scrollport do modal. `minHeight: 0` é obrigatório
                — sem ele o tamanho mínimo automático do item flex é o próprio
                conteúdo, o corpo se recusa a encolher e volta a empurrar o
                rodapé para fora da tela, que é o defeito de origem. */}
            <div style={{ overflowY: "auto", flex: "1 1 auto", minHeight: 0 }}>
              <Form {...form}>
                <form id="sponsor-form" onSubmit={form.handleSubmit(onSubmit, () => { continuarRef.current = false; })}>
                  <div style={{ padding: isMobile ? "20px 18px" : "24px 28px", display: "flex", flexDirection: "column", gap: 28 }}>

                    {/* "SALVOU?" com o modal ainda aberto: a sequência fica à
                        vista, porque o toast some e o formulário volta vazio. */}
                    {!editingSponsor && criadosNestaSequencia.length > 0 && (
                      <p role="status" data-testid="patrocinadores-criados-na-sequencia" style={{ margin: 0, padding: "9px 12px", borderRadius: 6, backgroundColor: "#f0fdf4", border: "1px solid #bbf7d0", fontSize: 12, lineHeight: 1.45, color: "#166534" }}>
                        {criadosNestaSequencia.length === 1 ? "1 patrocinador cadastrado" : `${criadosNestaSequencia.length} patrocinadores cadastrados`} nesta sequência: {criadosNestaSequencia.join(", ")}.
                        {executivoHerdado ? " O executivo ficou como no anterior — confira antes de salvar o próximo." : " Preencha o próximo."}
                      </p>
                    )}

                    {/* ─ 01 Informações Gerais ─ */}
                    <section>
                      {sectionLabel("01", "Informações Gerais")}
                      {/* LARGURA: uma coluna no celular. Em 375 de largura o
                          corpo do modal dá 296px úteis (96vw = 360, menos 32+32
                          de padding); duas colunas de 1fr com 16 de gap deixam
                          140px por campo, e um <input> tem largura mínima
                          própria (~154px pelo tamanho do cursor + padding), que
                          o grid NÃO consegue espremer — a diferença virava
                          rolagem HORIZONTAL dentro do modal. `isMobile` já
                          estava disponível na página e não era usado aqui. */}
                      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
                        <FormField control={form.control} name="name" render={({ field }) => (
                          <FormItem>
                            <label htmlFor="sponsor-name" style={{ fontSize: 10, fontWeight: 700, color: T.second, textTransform: "uppercase", letterSpacing: "0.1em", display: "block", marginBottom: 8 }}>Nome do Patrocinador *</label>
                            <FormControl>
                              <input {...field} id="sponsor-name" placeholder="Ex: Global Logistics" data-testid="input-sponsor-name"
                                style={{ ...tiInput, fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700 }}
                                onFocus={e => { e.currentTarget.style.backgroundColor = "#fff"; e.currentTarget.style.boxShadow = "0 0 0 2px rgba(249,115,22,0.2)"; }}
                                onBlur={e =>  { e.currentTarget.style.backgroundColor = "#f0efee"; e.currentTarget.style.boxShadow = "none"; }}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="accountExecutiveId" render={({ field }) => (
                          <FormItem>
                            <label htmlFor="sponsor-account-executive" style={{ fontSize: 10, fontWeight: 700, color: T.second, textTransform: "uppercase", letterSpacing: "0.1em", display: "block", marginBottom: 8 }}>Executivo responsável (interno)</label>
                            <FormControl>
                              {/* kind="field": é CAMPO DE FORMULÁRIO, não filtro
                                  — não tem "Todos", não tem × de limpar, e
                                  preenchido não acende de laranja (ver o
                                  vocabulário em components/filter-select.tsx).
                                  "Não atribuído" é uma resposta válida, então
                                  entra como opção fixa da lista, não como o
                                  estado vazio. */}
                              <FilterSelect
                                kind="field"
                                fullWidth
                                hideWhenEmpty={false}
                                label="Executivo responsável"
                                placeholder="Não atribuído"
                                value={field.value || "__none__"}
                                onChange={v => field.onChange(v === "__none__" ? "" : v)}
                                options={execFormOptions}
                                searchPlaceholder="Buscar pessoa..."
                                emptyText="Nenhuma pessoa"
                                testId="select-account-executive"
                                triggerProps={{ id: "sponsor-account-executive", onBlur: field.onBlur }}
                                triggerStyle={{ ...tiInput, height: "auto", padding: "14px 16px", border: "none" }}
                              />
                            </FormControl>
                            <FormMessage />
                            {/* HERDADO, DITO NO CAMPO: some quando a pessoa
                                troca o executivo. #92400e sobre #fffbeb = 7,1:1. */}
                            {!editingSponsor && executivoHerdado && field.value === executivoHerdado && (
                              <p role="status" data-testid="aviso-executivo-herdado" style={{ margin: "6px 0 0", padding: "6px 10px", borderRadius: 6, backgroundColor: "#fffbeb", border: "1px solid #fde68a", fontSize: 11.5, fontWeight: 700, lineHeight: 1.4, color: "#92400e" }}>
                                Executivo mantido do cadastro anterior — confira antes de salvar.
                              </p>
                            )}
                            {/* PARA QUE SERVE: "executivo" sem contexto lia como
                                contato do cliente. É gente da casa, e o efeito
                                prático é o e-mail do book (o "Para" inclui os
                                executivos com cliente no evento — CANAL_META em
                                server/routes/items.ts). */}
                            <p style={{ margin: "6px 0 0", fontSize: 11, lineHeight: 1.4, color: "#57534e" }}>
                              Pessoa da equipe que cuida da conta. Recebe o e-mail quando sai o book de um evento deste patrocinador e aparece como responsável na Gestão de Prazos.
                            </p>
                          </FormItem>
                        )} />
                      </div>

                    </section>

                    {/* ─ 02 Identidade Visual ─ */}
                    <section>
                      {sectionLabel("02", "Identidade Visual")}
                      {/* Empilha no celular: paleta (200px) + 32 de vão + o
                          campo hex (quadrado de 44 + input de ~154 mínimos)
                          davam ~430px numa coluna de ~320 — rolagem lateral
                          dentro do modal. */}
                      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "stretch" : "flex-start", gap: isMobile ? 20 : 32 }}>
                        <FormField control={form.control} name="color" render={({ field }) => (
                          <FormItem style={{ flexShrink: 0 }}>
                            {/* Não há UM controle atrás deste rótulo (é um grupo
                                de botões), então nada de htmlFor solto: o span
                                nomeia o grupo via aria-labelledby. */}
                            <span id="sponsor-color-label" style={{ fontSize: 10, fontWeight: 700, color: T.second, textTransform: "uppercase", letterSpacing: "0.1em", display: "block", marginBottom: 12 }}>Cor da Marca</span>
                            <FormControl>
                              <div role="group" aria-labelledby="sponsor-color-label" style={{ display: "flex", flexWrap: "wrap", gap: 8, maxWidth: 200 }}>
                                {PRESET_COLORS.map(c => (
                                  <button key={c} type="button" data-testid={`color-${c}`}
                                    onClick={() => field.onChange(c)}
                                    aria-label={`Selecionar a cor ${c}`}
                                    aria-pressed={field.value === c}
                                    style={{ width: isMobile ? 44 : 30, height: isMobile ? 44 : 30, borderRadius: "50%", backgroundColor: c, border: "none", cursor: "pointer", transition: "all 0.15s", flexShrink: 0, boxShadow: field.value === c ? `0 0 0 2px #fff, 0 0 0 4px ${c}` : "none", transform: field.value === c ? "scale(1.2)" : "scale(1)" }}
                                  />
                                ))}
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />

                        <div style={{ flex: 1 }}>
                          <label htmlFor="sponsor-color-hex" style={{ fontSize: 10, fontWeight: 700, color: T.second, textTransform: "uppercase", letterSpacing: "0.1em", display: "block", marginBottom: 12 }}>Código Hex</label>
                          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                            <div style={{ width: 44, height: 44, borderRadius: 8, backgroundColor: selectedColor, flexShrink: 0, boxShadow: `0 0 0 3px ${selectedColor}30` }} />
                            <FormField control={form.control} name="color" render={({ field }) => (
                              <FormItem style={{ flex: 1, margin: 0 }}>
                                {/* O input é o filho DIRETO do FormControl: com a
                                    div no meio, aria-invalid/aria-describedby do
                                    Slot paravam num elemento decorativo e o erro
                                    de validação ficava mudo para o leitor. */}
                                <div style={{ position: "relative" }}>
                                  <span aria-hidden="true" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: T.second, fontFamily: "'DM Mono', monospace", fontWeight: 700 }}>#</span>
                                  <FormControl>
                                    <input
                                      id="sponsor-color-hex"
                                      value={(field.value || "").replace(/^#/, "")}
                                      onChange={e => field.onChange("#" + e.target.value.replace(/^#/, ""))}
                                      placeholder="F97316"
                                      data-testid="input-color"
                                      style={{ ...tiInput, paddingLeft: 28, fontFamily: "'DM Mono', monospace", fontSize: 13 }}
                                      onFocus={e => { e.currentTarget.style.backgroundColor = "#fff"; e.currentTarget.style.boxShadow = "0 0 0 2px rgba(249,115,22,0.2)"; }}
                                      onBlur={e =>  { e.currentTarget.style.backgroundColor = "#f0efee"; e.currentTarget.style.boxShadow = "none"; }}
                                    />
                                  </FormControl>
                                </div>
                                <FormMessage />
                              </FormItem>
                            )} />
                          </div>
                        </div>
                      </div>
                    </section>

                    {/* A regra de aprovação — pedido do dono (21/08): o
                        "patrocinador desaprovador". Entra aqui, e não nos
                        dados de contato que saíram do formulário: é uma
                        regra do fluxo, não um dado cadastral. */}
                    <section>
                      {sectionLabel("03", "Regra de aprovação")}
                      <FormField control={form.control} name="strictApproval" render={({ field }) => (
                        <FormItem>
                          <label htmlFor="sponsor-strict" style={{ display: "flex", alignItems: "flex-start", gap: 12, cursor: "pointer" }}>
                            <FormControl>
                              <input type="checkbox" id="sponsor-strict" data-testid="checkbox-desaprovador"
                                checked={!!field.value} onChange={e => field.onChange(e.target.checked)}
                                style={{ width: 18, height: 18, marginTop: 2, accentColor: "#f97316", flexShrink: 0, cursor: "pointer" }} />
                            </FormControl>
                            <span>
                              <span style={{ display: "block", fontSize: 13, fontWeight: 700, color: T.text, fontFamily: "'Space Grotesk', sans-serif" }}>Patrocinador desaprovador</span>
                              <span style={{ display: "block", fontSize: 12, color: "#57534e", lineHeight: 1.5, marginTop: 2 }}>
                                A aprovação dele vale só para a versão que ele aprovou: toda versão nova da arte a revoga, e a reprovação de qualquer outro patrocinador também. Uso típico: Ministério.
                              </span>
                            </span>
                          </label>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </section>

                  </div>
                </form>
              </Form>
            </div>

            {/* Rodapé da casa: primário cheio, recuar discreto abaixo — o mesmo
                par de Usuários, Modelos e das confirmações. */}
            <ModalFooter>
              <button type="submit" form="sponsor-form" data-testid="button-submit"
                disabled={createMutation.isPending || updateMutation.isPending}
                aria-busy={createMutation.isPending || updateMutation.isPending}
                style={{ height: toque + 4, borderRadius: R.md, border: "none", backgroundColor: T.dark, color: "#fff", fontSize: 14, fontWeight: 800, cursor: createMutation.isPending || updateMutation.isPending ? "wait" : "pointer", opacity: createMutation.isPending || updateMutation.isPending ? 0.7 : 1, transition: "background-color 0.15s ease" }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#292524")}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = T.dark)}
                onClick={() => { continuarRef.current = false; }}
              >
                {createMutation.isPending || updateMutation.isPending ? "Salvando…" : editingSponsor ? "Salvar alterações" : "Salvar patrocinador"}
              </button>
              {/* Só na criação: mesmo submit, sem fechar o modal. */}
              {!editingSponsor && (
                <button type="submit" form="sponsor-form" data-testid="button-submit-e-outro"
                  disabled={createMutation.isPending}
                  onClick={() => { continuarRef.current = true; }}
                  style={{ height: toque + 4, borderRadius: R.md, border: `1px solid ${T.bdark}`, backgroundColor: T.surface, color: T.text, fontSize: 13, fontWeight: 800, cursor: createMutation.isPending ? "wait" : "pointer", opacity: createMutation.isPending ? 0.7 : 1, transition: "background-color 0.15s ease" }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = T.low)}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = T.surface)}
                >
                  Salvar e cadastrar outro
                </button>
              )}
              <button type="button" data-testid="button-cancel" onClick={requestClose}
                style={{ height: toque, borderRadius: R.md, border: "none", backgroundColor: "transparent", color: "#57534e", fontSize: FS.body, fontWeight: 700, cursor: "pointer" }}
              >
                {/* Depois de cadastrar na sequência, "Cancelar" sugeria desfazer. */}
                {criadosNestaSequencia.length > 0 && !editingSponsor ? "Fechar" : "Cancelar"}
              </button>
            </ModalFooter>
          </div>
          </FreezeWhileClosing>

        </DialogContent>
      </Dialog>

      {/* ══════════════════════════════
          MODAL: Confirmar Exclusão
      ══════════════════════════════ */}
      <Dialog open={!!deletingSponsor} onOpenChange={o => { if (!o) setDeletingSponsor(null); }}>
        <DialogContent
          className={`p-0 gap-0 border-none ${HIDE_NATIVE_CLOSE}`}
          // Mesma casca do cadastro (`modalSurface`): teto de `100vh − 48` e
          // coluna flex. O conteúdo é curto, mas a única parte elástica é o
          // parágrafo com o nome do patrocinador — uma razão social longa leva o
          // texto a cinco ou seis linhas, e sem teto o crescimento sairia pelos
          // dois lados em vez de virar rolagem.
          style={modalSurface(440)}
          // Foco inicial no "Manter": o Enter distraído recua, não exclui.
          onOpenAutoFocus={e => { e.preventDefault(); document.querySelector<HTMLButtonElement>('[data-testid="button-cancel-delete"]')?.focus(); }}
        >
          {/* POR QUE congelar aqui: quem fecha este diálogo é
              `setDeletingSponsor(null)` dentro do onSuccess — e é o MESMO
              estado que abre o corpo (`{deletingSponsor && ...}`). Sem
              congelar, o texto "Excluir Patrocinador X?" some no primeiro
              frame do fade e o usuário vê uma caixa vazia sumindo. */}
          <FreezeWhileClosing open={!!deletingSponsor}>
          <DialogTitle className="sr-only">Excluir patrocinador</DialogTitle>
          <DialogDescription className="sr-only">Confirme a exclusão do patrocinador</DialogDescription>
          {deletingSponsor && (
          <div data-testid="dialog-confirm-delete" style={{ display: "flex", flexDirection: "column", flex: "1 1 auto", minHeight: 0 }}>
            {/* Confirmação da casa (variante `confirm`): a MESMA casca das
                exclusões de Usuários e Modelos. A faixa vermelha "Ação
                Irreversível" virou o subtítulo — o aviso continua, sem um
                terceiro desenho de confirmação no app. */}
            <ModalHeader
              icon={Trash2}
              variant="confirm"
              tint="#b91c1c"
              title={`Excluir ${deletingSponsor.name}?`}
              subtitle="Ação irreversível."
              onClose={() => setDeletingSponsor(null)}
            />
            {/* Só o texto rola. Cabeçalho e botões são itens flex que não
                rolam, então continuam à vista mesmo se o nome do patrocinador
                esticar o parágrafo. */}
            <div style={{ padding: "16px 24px", overflowY: "auto", flex: "1 1 auto", minHeight: 0 }}>
              {/* "EXCLUIR APAGA O QUÊ?" — por inteiro. O texto antigo falava só
                  de "vínculos com eventos ativos", mas as FKs com ON DELETE
                  CASCADE (shared/schema.ts: event_sponsors, item_sponsors,
                  item_sponsor_approvals) levam também os vínculos com peças e
                  as decisões registradas em nome dele, de QUALQUER evento. */}
              <p style={{ fontSize: FS.body, color: "#44403c", margin: 0, lineHeight: 1.6 }}>
                <strong style={{ color: T.text }}>{deletingSponsor.name}</strong> sai do cadastro e leva junto, em todos os eventos:
              </p>
              <ul data-testid="delete-sponsor-o-que-some" style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 12.5, lineHeight: 1.55, color: "#44403c" }}>
                <li>os vínculos com eventos, com a cota de cada um;</li>
                <li>os vínculos com peças;</li>
                <li>as aprovações e reprovações registradas em nome dele.</li>
              </ul>
              <p style={{ margin: "8px 0 0", fontSize: 12, lineHeight: 1.5, color: "#57534e" }}>
                Eventos e peças continuam. Se ele só saiu de um evento, desvincule-o no evento em vez de excluir.
              </p>
              {/* O QUE SE PERDE, em número: a tabela já sabia (uso por evento),
                  e a confirmação pedia a decisão sem mostrar o tamanho dela. */}
              {(() => {
                const u = usage[deletingSponsor.id];
                const semUso = !u || u.events === 0;
                return (
                  <p data-testid="delete-sponsor-impacto" style={{ margin: "12px 0 0", padding: "9px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600, lineHeight: 1.5, backgroundColor: semUso ? T.low : "#fef2f2", color: semUso ? "#57534e" : "#b91c1c", border: `1px solid ${semUso ? T.border : "#fecaca"}` }}>
                    {semUso
                      ? "Nunca foi vinculado a um evento."
                      : `Vinculado a ${u.events} ${u.events === 1 ? "evento" : "eventos"}${u.items > 0 ? ` e ${u.items} ${u.items === 1 ? "peça" : "peças"}` : ""}.`}
                  </p>
                );
              })()}
            </div>
            <ModalFooter>
              <button type="button" data-testid="button-confirm-delete"
                onClick={() => deleteMutation.mutate(deletingSponsor.id)}
                disabled={deleteMutation.isPending}
                aria-busy={deleteMutation.isPending}
                style={{ height: toque + 4, borderRadius: R.md, border: "none", backgroundColor: "#b91c1c", color: "#fff", fontSize: 14, fontWeight: 800, cursor: deleteMutation.isPending ? "wait" : "pointer", opacity: deleteMutation.isPending ? 0.7 : 1, transition: "background-color 0.15s ease" }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#991b1b")}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = "#b91c1c")}>
                {deleteMutation.isPending ? "Excluindo…" : "Sim, excluir"}
              </button>
              <button type="button" data-testid="button-cancel-delete" onClick={() => setDeletingSponsor(null)}
                style={{ height: toque, borderRadius: R.md, border: "none", backgroundColor: "transparent", color: "#57534e", fontSize: FS.body, fontWeight: 700, cursor: "pointer" }}>
                Manter
              </button>
            </ModalFooter>
          </div>
          )}
          </FreezeWhileClosing>
        </DialogContent>
      </Dialog>
    </div>
  );
}
