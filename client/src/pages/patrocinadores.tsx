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
import { Pencil, Search, X, AlertTriangle, Plus, Building2, ChevronLeft, ChevronRight, Archive, RotateCcw, ArrowUp, ArrowDown, ArrowUpRight, Check, UserRound } from "lucide-react";
import type { Sponsor } from "@shared/schema";
import { T, N, TOM, FS, FW, R, FONT, onColor } from "@/lib/theme";
import { useIsMobile, usePonteiroGrosso, alvo, useDensidadeDoConteudo } from "@/hooks/use-mobile";
import { Botao } from "@/components/ui/botao";
import { Selo } from "@/components/ui/selo";
import { CabecalhoDaPagina } from "@/components/ui/cabecalho-da-pagina";
import { EstadoErro, EstadoVazio, Esqueleto } from "@/components/ui/estados";
import { useConfirmar } from "@/components/ui/usar-confirmar";
import { FilterSelect, type FilterOption } from "@/components/filter-select";
import { useFiltrosNaUrl, paginaValida } from "@/hooks/use-filtros-na-url";
import { ModalDeArquivados, type LinhaArquivada } from "@/components/modal-de-arquivados";
import { MarcaDoPatrocinador, ChipDaMarca, corValida } from "@/components/patrocinadores/marca";

/**
 * CAMPO DA CASA — branco com borda, a mesma família da busca de Eventos e da
 * Gráfica. Era um cinza sem borda (n3) aceso por onFocus/onBlur em JS: o
 * hover não existia, o erro de validação não pintava a borda e o campo cinza
 * dentro do modal branco lia como desabilitado. Foco, hover e aria-invalid
 * moram na classe `.pat-campo` (index.css).
 */
const CAMPO: React.CSSProperties = {
  width: "100%", height: 44, padding: "0 14px", boxSizing: "border-box",
  backgroundColor: T.surface, border: `1px solid ${T.border}`, borderRadius: R.md,
  fontSize: FS.body, color: T.text, fontFamily: "inherit",
};

// Rótulo dos campos do formulário — caixa-alta curta, sobre o campo.
const ROTULO_CAMPO: React.CSSProperties = { fontSize: FS.micro, fontWeight: FW.rotulo, color: T.second, textTransform: "uppercase", letterSpacing: "0.12em", display: "block", marginBottom: 8 };

const sectionLabel = (n: string, title: string) => (
  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
    <span style={{ fontSize: FS.micro, fontWeight: FW.rotulo, color: T.accentText, fontFamily: FONT.mono, letterSpacing: "0.04em" }}>
      {n}
    </span>
    <span style={{ fontSize: FS.micro, fontWeight: FW.rotulo, color: T.apoio, textTransform: "uppercase", letterSpacing: "0.16em" }}>
      {title}
    </span>
    <div style={{ flex: 1, height: 1, backgroundColor: T.border }} />
  </div>
);

/* ── Color presets ──
   A paleta que o usuário ESCOLHE para a marca: é dado, não tema — não vira
   token. Onde a cor escolhida pinta texto, usa-se darkenToContrast/onColor. */
const PRESET_COLORS = [
  "#dc2626", "#f97316", "#eab308", "#10b981",
  "#2563eb", "#4f46e5", "#9333ea", "#db2777",
  "#1c1917", "#b45309", "#06b6d4", "#65a30d",
];

const PAGE_SIZE = 20;

/**
 * PAGINAÇÃO — janela de até 5 páginas em volta da atual (antes esta tela
 * desenhava TODOS os números, e com 15 páginas a barra estourava no celular),
 * alvos de 32px (44 no celular) e a página atual cheia em escuro.
 */
function Paginacao({ pagina, totalPaginas, onIr, toque }: { pagina: number; totalPaginas: number; onIr: (p: number) => void; toque: number }) {
  if (totalPaginas <= 1) return null;
  const inicio = Math.max(1, Math.min(pagina - 2, totalPaginas - 4));
  const paginas = Array.from({ length: Math.min(5, totalPaginas) }, (_, i) => inicio + i);
  // Botao da casa: hover/foco/desabilitado vêm da classe, não de handler.
  const medida: React.CSSProperties = { minWidth: toque, height: toque, padding: "0 6px" };
  return (
    <nav aria-label="Paginação" style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <Botao tamanho="sm" icone={ChevronLeft} onClick={() => onIr(pagina - 1)} disabled={pagina === 1} aria-label="Página anterior" style={medida} />
      {paginas.map(p => (
        <Botao key={p} tamanho="sm" variante={p === pagina ? "primario" : "secundario"} onClick={() => onIr(p)} aria-label={`Página ${p}`} aria-current={p === pagina ? "page" : undefined}
          style={{ ...medida, fontFamily: FONT.mono }}>
          {p}
        </Botao>
      ))}
      <Botao tamanho="sm" icone={ChevronRight} onClick={() => onIr(pagina + 1)} disabled={pagina === totalPaginas} aria-label="Próxima página" style={medida} />
    </nav>
  );
}

const CHAVE_PATROCINADORES_ARQUIVADOS = ["/api/sponsors/arquivados"] as const;

/**
 * O acesso aos PATROCINADORES ARQUIVADOS (só admin, que é quem arquiva).
 * Discreto: só aparece quando há algo arquivado, e abre a lista de onde se
 * restaura. Restaurar devolve o patrocinador às listas de escolha; vínculos e
 * aprovações nunca saíram do histórico.
 */
function PatrocinadoresArquivados({ tamanho }: { tamanho: "md" | "toque" }) {
  const { toast } = useToast();
  const { confirmar, dialogo } = useConfirmar();
  const [aberto, setAberto] = useState(false);
  const { data: arquivados = [], isLoading, isError, refetch } = useQuery<Sponsor[]>({
    queryKey: CHAVE_PATROCINADORES_ARQUIVADOS,
  });

  const restaurar = useMutation({
    mutationFn: async (sponsor: Sponsor) => {
      const res = await apiRequest("POST", `/api/sponsors/${sponsor.id}/restaurar`);
      return (await res.json()) as Sponsor;
    },
    onSuccess: (_r, sponsor) => {
      queryClient.invalidateQueries({ queryKey: ["/api/sponsors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sponsors/usage"] });
      queryClient.invalidateQueries({ queryKey: CHAVE_PATROCINADORES_ARQUIVADOS });
      toast({ variant: "success", title: "Patrocinador restaurado", description: `${sponsor.name} voltou às listas de escolha.` });
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Não foi possível restaurar o patrocinador", description: e.message }),
  });

  const pedirRestauracao = async (linha: LinhaArquivada) => {
    const sponsor = arquivados.find((s) => s.id === linha.id);
    if (!sponsor) return;
    const ok = await confirmar({
      titulo: `Restaurar ${sponsor.name}?`,
      descricao: "Ele volta ao cadastro e às listas de escolha (vincular, importar). Vínculos e aprovações antigos continuam como estavam.",
      confirmar: "Restaurar",
      cancelar: "Manter arquivado",
      icone: RotateCcw,
    });
    if (ok) restaurar.mutate(sponsor);
  };

  if (!aberto && arquivados.length === 0) return dialogo;

  return (
    <>
      {arquivados.length > 0 && (
        <Botao variante="fantasma" tamanho={tamanho} icone={Archive} onClick={() => setAberto(true)} data-testid="button-patrocinadores-arquivados"
          title="Patrocinadores arquivados — dá para restaurar">
          Arquivados ({arquivados.length})
        </Botao>
      )}
      <ModalDeArquivados
        aberto={aberto}
        aoFechar={() => setAberto(false)}
        titulo="Patrocinadores arquivados"
        explicacao="Patrocinadores excluídos saem das listas de escolha, mas nada foi apagado: o nome continua nas peças e aprovações antigas. Restaurar devolve o patrocinador às listas."
        linhas={arquivados.map((s) => ({ id: s.id, nome: s.name, detalhe: s.company ?? undefined, arquivadoEm: s.arquivadoEm, arquivadoPor: s.arquivadoPor }))}
        carregando={isLoading}
        erro={isError}
        aoTentarDeNovo={() => { void refetch(); }}
        aoRestaurar={(l) => { void pedirRestauracao(l); }}
        restaurandoId={restaurar.isPending ? restaurar.variables?.id ?? null : null}
        prefixo="patrocinadores-arquivados"
      />
      {dialogo}
    </>
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

/** Iniciais do executivo para o avatar ("Ana Admin (local)" → "AA"). */
const iniciaisDaPessoa = (nome: string) =>
  nome.replace(/\(.*?\)/g, " ").split(" ").filter(Boolean).slice(0, 2).map(n => n[0]?.toUpperCase()).join("");

export default function Patrocinadores() {
  const isMobile = useIsMobile();
  // LISTA OU TABELA pela ÁREA ÚTIL (régua da casa em hooks/use-mobile): no
  // tablet em pé e no celular a tabela de seis colunas não cabe — rolava de
  // lado e escondia Contato e as ações. Abaixo de 820px úteis, lista.
  const { ref: refPagina, cards } = useDensidadeDoConteudo<HTMLDivElement>(isMobile ? 32 : 64);
  const [modalOpen, setModalOpen]             = useState(false);
  const [editingSponsor, setEditingSponsor]   = useState<Sponsor | null>(null);
  const [deletingSponsor, setDeletingSponsor] = useState<Sponsor | null>(null);
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
  // Alvo pelo PONTEIRO, não pela largura: o tablet do galpão é dedo também.
  const ponteiroGrosso = usePonteiroGrosso();
  const dedo = ponteiroGrosso || isMobile;
  const toque = alvo(32, dedo);
  const { toast } = useToast();
  const { confirmar, dialogo } = useConfirmar();

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
  // LIDO NO RENDER de propósito: o formState do react-hook-form é um proxy que
  // só calcula o que foi lido durante o render. Lido só dentro do requestClose,
  // isDirty ficava sempre false e o "Descartar as alterações?" nunca aparecia —
  // Cancelar, Esc e o X jogavam fora o que foi digitado sem perguntar.
  const formularioSujo = form.formState.isDirty;
  const nomeDigitado = form.watch("name");

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
      toast({ variant: "success", title: "Patrocinador cadastrado", description: `${vars.name} já pode ser vinculado aos eventos — a cota (Master, Gold…) se define no vínculo com cada evento.` });
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
      toast({ variant: "success", title: "Alterações salvas", description: vars.update.name ? `Cadastro de ${vars.update.name} atualizado.` : undefined });
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
      queryClient.invalidateQueries({ queryKey: CHAVE_PATROCINADORES_ARQUIVADOS });
      const nome = deletingSponsor?.name;
      setDeletingSponsor(null);
      toast({ variant: "success", title: "Patrocinador arquivado", description: `${nome ?? "O patrocinador"} saiu das listas. Nada foi apagado: dá para restaurar em Arquivados.` });
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Não foi possível arquivar o patrocinador", description: e.message }),
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
  //
  // ASSÍNCRONA agora (diálogo do app, não window.confirm): o Dialog pede para
  // fechar, mas `modalOpen` só vira false depois do "Descartar" — recusar
  // deixa o modal aberto e com o que foi digitado, como antes.
  const requestClose = async () => {
    if (formularioSujo) {
      const descartar = await confirmar({
        titulo: "Descartar as alterações deste formulário?",
        descricao: "O que foi digitado aqui se perde.",
        confirmar: "Descartar",
        cancelar: "Continuar editando",
        perigo: true,
      });
      if (!descartar) return;
    }
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
  // O pool aqui é a lista já recortada pela busca e SEM o próprio filtro de
  // executivo aplicado (senão a opção escolhida seria a única com número). É a
  // mesma disciplina travada em server/__tests__/faceta-lista-invariante.test.ts.
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
  // atribuir o primeiro patrocinador a um executivo novo.
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
  const temFiltro  = !!search || execFilter !== "all";

  const thStyle: React.CSSProperties = {
    padding: "11px 16px", fontSize: FS.micro, fontWeight: FW.rotulo, color: T.second,
    textTransform: "uppercase", letterSpacing: "0.14em", textAlign: "left",
    whiteSpace: "nowrap", backgroundColor: T.bg,
  };
  const celula: React.CSSProperties = { padding: "14px 16px", verticalAlign: "middle" };

  // Falha na lista principal bloqueia a tabela; falha nas queries auxiliares
  // (executivos, uso por evento) vira banner com retry sem esconder a lista.
  const auxError = usersError || usageError;
  const retryAux = () => {
    if (usersError) refetchUsers();
    if (usageError) refetchUsage();
  };

  /* ── As células, uma vez só: a tabela (tela larga) e a lista (celular,
     tablet em pé) mostram os MESMOS dados, nos mesmos componentes. ── */

  // Ordenar: <button> de verdade dentro do <th> — foco, Enter e Espaço vêm de
  // graça, e o leitor de tela ouve "Ordenar por executivo, botão".
  const botaoOrdem = (col: Ordem, rotulo: string) => {
    const ativo = sortBy === col;
    const Seta = ativo && sortDir === "desc" ? ArrowDown : ArrowUp;
    return (
      <button type="button" className="pat-ordem" onClick={() => toggleSort(col)}
        aria-label={`Ordenar por ${rotulo.toLowerCase()}${ativo ? (sortDir === "asc" ? " (crescente)" : " (decrescente)") : ""}`}
        title={`Ordenar por ${rotulo.toLowerCase()}`}
        style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: 0, background: "none", border: "none", cursor: "pointer", font: "inherit", letterSpacing: "inherit", textTransform: "inherit", color: ativo ? T.text : T.second }}>
        {rotulo}
        <Seta aria-hidden="true" style={{ width: 11, height: 11, opacity: ativo ? 1 : 0.3, flexShrink: 0 }} />
      </button>
    );
  };

  const identidade = (sponsor: Sponsor) => (
    <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
      <MarcaDoPatrocinador nome={sponsor.name} cor={sponsor.color || "#f97316"} tamanho={34} />
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "4px 8px", flexWrap: "wrap" }}>
          <span className="pat-nome" data-testid={`text-sponsor-name-${sponsor.id}`}
            style={{ fontSize: FS.read, fontWeight: FW.forte, color: T.text, fontFamily: FONT.display, lineHeight: 1.3, letterSpacing: "-0.01em", overflowWrap: "anywhere" }}>
            {sponsor.name}
          </span>
          {/* Selo laranja: laranja.text sobre laranja.bg ≈ 4,9:1. */}
          {sponsor.strictApproval && (
            <Selo tom="laranja" tamanho="sm" forma="retangulo"
              data-testid={`tag-desaprovador-${sponsor.id}`}
              title="Patrocinador desaprovador: toda versão nova da arte revoga a aprovação dele, e a reprovação de outro patrocinador também"
              style={{ padding: "1px 6px", whiteSpace: "nowrap" }}>
              desaprovador
            </Selo>
          )}
        </div>
        {sponsor.company && (
          <div style={{ fontSize: FS.meta, color: T.second, marginTop: 2, lineHeight: 1.4, overflowWrap: "anywhere" }}>{sponsor.company}</div>
        )}
      </div>
    </div>
  );

  const executivoDe = (sponsor: Sponsor) => {
    const nome = execName(sponsor);
    const disco: React.CSSProperties = {
      width: 24, height: 24, borderRadius: R.pill, flexShrink: 0,
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      fontSize: FS.micro, fontWeight: FW.rotulo,
    };
    if (!nome) {
      return (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: FS.body, color: T.second }}>
          <span aria-hidden="true" style={{ ...disco, border: `1px dashed ${T.bdark}`, color: T.muted }}>
            <UserRound style={{ width: 12, height: 12 }} />
          </span>
          Sem executivo
        </span>
      );
    }
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: FS.body, color: T.text, fontWeight: FW.medio, lineHeight: 1.3, whiteSpace: "nowrap" }}>
        <span aria-hidden="true" style={{ ...disco, backgroundColor: N.n3, color: T.apoio }}>
          {iniciaisDaPessoa(nome)}
        </span>
        {nome}
      </span>
    );
  };

  // Uso por evento que FALHOU não é "nunca vinculado": sem o dado, a célula
  // diz que não sabe (o banner acima explica), em vez de afirmar "sem evento".
  const indisponivel = <span title="Uso por evento indisponível — tente novamente no aviso acima" style={{ fontSize: FS.body, color: T.second }}>—</span>;

  const usoDe = (sponsor: Sponsor) => {
    if (usageError) return indisponivel;
    const u = usage[sponsor.id];
    if (!u || u.events === 0) {
      return <Selo tom="alerta" forma="retangulo" title="Nunca vinculado a um evento" style={{ padding: "2px 8px", fontSize: FS.micro, whiteSpace: "nowrap" }}>sem evento</Selo>;
    }
    // A informação mais densa da linha leva a algum lugar: o Painel Geral já
    // aceita ?patrocinador= no recorte, e abre só as peças desta marca. A
    // linha inteira abre a edição do cadastro — daí o stopPropagation no
    // clique, senão ir às peças abriria o modal por baixo da navegação. O
    // selo "sem evento", acima, fica selo: não há peça nenhuma para mostrar.
    return (
      <Link
        href={`/?patrocinador=${sponsor.id}`}
        onClick={e => e.stopPropagation()}
        data-testid={`link-uso-${sponsor.id}`}
        className="pat-uso"
        title={`Ver as ${u.items} ${u.items === 1 ? "peça" : "peças"} deste patrocinador no Painel Geral`}
        style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: FS.body, color: T.text, fontWeight: FW.forte, whiteSpace: "nowrap" }}
      >
        {u.events} <span style={{ fontWeight: FW.corpo, color: T.second }}>{u.events === 1 ? "evento" : "eventos"}</span>
        {u.items > 0 && <span style={{ color: T.second, fontWeight: FW.corpo }}> · {u.items} pç</span>}
        <ArrowUpRight aria-hidden="true" className="pat-uso-seta" style={{ width: 12, height: 12, color: T.accentText }} />
      </Link>
    );
  };

  // RESPOSTA — o app inteiro depende da resposta do patrocinador. Duas medidas
  // na mesma célula: pendências AGORA e tempo MÉDIO de resposta. Sem histórico
  // de decisão, a média é "—" (zero leria como "responde na hora"). Tons AA
  // sobre branco: alerta.text 6,0:1, perigo.text 6,5:1, sucesso.text 5,3:1.
  const respostaDe = (sponsor: Sponsor) => {
    if (usageError) return indisponivel;
    const u = usage[sponsor.id];
    const pend = u?.pendencias ?? 0;
    const media = u?.mediaDias ?? null;
    const corPend = pend === 0 ? TOM.sucesso.text : pend >= 5 ? TOM.perigo.text : TOM.alerta.text;
    const corMedia = media === null ? T.second : media >= 14 ? TOM.perigo.text : media >= 7 ? TOM.alerta.text : T.apoio;
    const title = `${pend === 0 ? "Nenhuma peça esperando aprovação agora" : `${pend} ${pend === 1 ? "peça esperando" : "peças esperando"} aprovação agora`} · ${media === null ? "nunca respondeu a um pedido — sem média" : `leva ${media} ${media === 1 ? "dia" : "dias"} em média para responder`}`;
    return (
      <span title={title} style={{ display: "inline-flex", alignItems: "center", gap: 10, whiteSpace: "nowrap" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: FS.meta, fontWeight: FW.forte, color: corPend }}>
          <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: R.pill, backgroundColor: "currentColor", flexShrink: 0 }} />
          {pend === 0 ? "em dia" : `${pend} pend.`}
        </span>
        <span style={{ fontSize: FS.meta, color: T.second }}>
          méd.{" "}
          <span style={{ fontWeight: FW.forte, color: corMedia, fontFamily: FONT.mono }}>{media === null ? "—" : `${media}d`}</span>
        </span>
      </span>
    );
  };

  const temContato = (s: Sponsor) => !!(s.contactPerson || s.email || s.phone);
  // CONTATO numa célula só: eram três colunas (contato, e-mail, telefone) que
  // empurravam a tabela para fora da tela já em 1366 — e as ações junto.
  const contatoDe = (sponsor: Sponsor) => {
    if (!temContato(sponsor)) return <span style={{ fontSize: FS.body, color: T.second }}>—</span>;
    return (
      <div style={{ minWidth: 0 }}>
        {sponsor.contactPerson && (
          <div style={{ fontSize: FS.body, fontWeight: FW.medio, color: T.text, lineHeight: 1.35 }}>{sponsor.contactPerson}</div>
        )}
        {(sponsor.email || sponsor.phone) && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0 10px", marginTop: sponsor.contactPerson ? 2 : 0, fontSize: FS.meta, lineHeight: 1.45, color: T.second, fontFamily: FONT.mono }}>
            {sponsor.email && <span style={{ overflowWrap: "anywhere" }}>{sponsor.email}</span>}
            {sponsor.phone && <span style={{ whiteSpace: "nowrap" }}>{sponsor.phone}</span>}
          </div>
        )}
      </div>
    );
  };

  // Ações: discretas até a linha pedir (classe .pat-acoes); no toque, inteiras.
  // Excluir ARQUIVA — o ícone é o arquivo, não a lixeira.
  const acoesDe = (sponsor: Sponsor) => (
    <div className="pat-acoes" style={{ display: "flex", justifyContent: "flex-end", gap: 2 }}>
      <Botao
        variante="fantasma"
        tamanho="sm"
        icone={Pencil}
        data-testid={`button-edit-${sponsor.id}`}
        aria-label={`Editar ${sponsor.name}`} title="Editar cadastro" onClick={() => openEdit(sponsor)}
        style={{ width: toque, height: toque, padding: 0, color: T.second }}
      />
      {isAdmin && (
        <Botao
          variante="fantasma"
          tamanho="sm"
          icone={Archive}
          className="pat-acao-perigo"
          data-testid={`button-delete-${sponsor.id}`}
          onClick={() => setDeletingSponsor(sponsor)}
          aria-label={`Excluir patrocinador ${sponsor.name}`}
          title="Arquivar (dá para restaurar)"
          style={{ width: toque, height: toque, padding: 0, color: T.second }}
        />
      )}
    </div>
  );

  // A linha inteira abre a edição. `target === currentTarget`: o Enter num
  // botão DENTRO da linha (a lixeira, o link de uso) subia até aqui e abria a
  // edição por cima da confirmação de exclusão.
  const propsDaLinha = (sponsor: Sponsor) => ({
    "data-testid": `sponsor-item-${sponsor.id}`,
    className: "pat-linha",
    tabIndex: 0,
    "aria-label": `Editar ${sponsor.name}`,
    title: "Clique para editar",
    onClick: () => openEdit(sponsor),
    onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter" && e.target === e.currentTarget) { e.preventDefault(); openEdit(sponsor); } },
  });

  const tamanhoDosBotoes = dedo ? "toque" : "md";
  // A barra de busca/filtro só existe quando há o que filtrar.
  const mostrarBarra = isLoading || (!sponsorsError && sponsors.length > 0);

  return (
    <div ref={refPagina} style={{ backgroundColor: T.bg, height: "100%", overflowY: "auto", padding: isMobile ? "16px 16px 48px" : "28px 32px 64px" }}>

      {/* ── Cabeçalho ── título e o que o cadastro É (e o que NÃO é: quem chega
          procurando a cota precisa saber que ela não mora aqui) à esquerda;
          números e ações à direita. O subtítulo "26 no cadastro" repetia o
          número grande ao lado — saiu, a frase de propósito subiu para o lugar. */}
      <CabecalhoDaPagina
        titulo="Patrocinadores"
        margemInferior={24}
        subtitulo={
          <span style={{ display: "block", maxWidth: 600 }}>
            Cadastro, executivo responsável e regra de aprovação de cada patrocinador. A cota (Master, Gold…) é definida por evento, ao vincular o patrocinador.
          </span>
        }
        acoes={
        <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 12 : 20, flexWrap: "wrap", width: isMobile ? "100%" : undefined }}>
          <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 12 : 20, flex: isMobile ? "1 1 100%" : undefined }}>
            <div style={{ textAlign: "left" }}>
              <p style={{ fontSize: FS.micro, fontWeight: FW.rotulo, color: T.second, textTransform: "uppercase", letterSpacing: isMobile ? "0.08em" : "0.14em", whiteSpace: "nowrap", margin: "0 0 4px" }}>No cadastro</p>
              <p data-testid="stat-total-patrocinadores" style={{ fontSize: FS.h2, fontWeight: FW.forte, color: T.text, margin: 0, fontFamily: FONT.display, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{isLoading || sponsorsError ? "–" : sponsors.length}</p>
            </div>
            <div aria-hidden="true" style={{ width: 1, height: 36, backgroundColor: T.border }} />
            {/* Contas sem executivo: clicar filtra a lista para resolver. */}
            {(() => {
              const semExec = sponsors.filter(s => !s.accountExecutiveId).length;
              const ativo = execFilter === "__none__";
              return (
                // Número-filtro com desenho próprio: fica <button> nativo
                // (aria-pressed), com o realce da classe da casa.
                <button
                  type="button"
                  className="ds-botao"
                  onClick={() => atualizar({ executivo: ativo ? "all" : "__none__", pagina: 1 })}
                  data-testid="stat-sem-executivo"
                  aria-pressed={ativo}
                  title={ativo ? "Mostrar todos" : "Ver apenas patrocinadores sem executivo"}
                  style={{ textAlign: "left", background: ativo ? TOM.laranja.bg : "none", border: `1px solid ${ativo ? TOM.laranja.border : "transparent"}`, borderRadius: R.md, padding: "4px 8px", margin: "-4px -8px", minHeight: dedo ? 44 : undefined, cursor: "pointer", fontFamily: "inherit" }}
                >
                  <p style={{ fontSize: FS.micro, fontWeight: FW.rotulo, color: ativo ? T.accentText : T.second, textTransform: "uppercase", letterSpacing: isMobile ? "0.08em" : "0.14em", whiteSpace: "nowrap", margin: "0 0 4px" }}>Sem Executivo</p>
                  <p style={{ fontSize: FS.h2, fontWeight: FW.forte, color: semExec > 0 ? TOM.alerta.text : T.text, margin: 0, fontFamily: FONT.display, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
                    {isLoading || sponsorsError ? "–" : semExec}
                  </p>
                </button>
              );
            })()}
            {/* No celular, Arquivados sai de perto do Novo (lado a lado não
                cabiam em 358px e o primário encostava na borda): vai para a
                barra de filtro, ao lado do Executivo — ou, quando a barra
                some (cadastro vazio ou em erro), para a linha de baixo do Novo. */}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: isMobile ? "wrap" : undefined, flex: isMobile ? "1 1 100%" : undefined }}>
            {!isMobile && isAdmin && <PatrocinadoresArquivados tamanho={tamanhoDosBotoes} />}
            <Botao
              variante="primario"
              tamanho={tamanhoDosBotoes}
              icone={Plus}
              onClick={openCreate}
              data-testid="button-add-sponsor"
              style={{ flex: isMobile ? "1 1 100%" : undefined }}
            >
              Novo Patrocinador
            </Botao>
            {isMobile && isAdmin && !mostrarBarra && <PatrocinadoresArquivados tamanho={tamanhoDosBotoes} />}
          </div>
        </div>
        }
      />

      {/* ── Barra de busca e filtro ── solta acima da lista, como em Eventos.
          Some quando não há o que filtrar (cadastro vazio ou lista em erro). */}
      {mostrarBarra && (
      <div role="search" aria-label="Filtrar patrocinadores" style={{ marginBottom: 12, display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div style={{ position: "relative", flex: isMobile ? "1 1 100%" : "0 1 400px", minWidth: 0 }}>
          <Search aria-hidden="true" style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", width: 15, height: 15, color: T.second, pointerEvents: "none" }} />
          <input
            value={search}
            onChange={e => atualizar({ busca: e.target.value, pagina: 1 })}
            placeholder={isMobile ? "Buscar patrocinador…" : "Buscar por nome, empresa, e-mail ou executivo"}
            aria-label="Filtrar patrocinadores por nome, empresa, e-mail ou executivo"
            type="search"
            data-testid="input-search-sponsors"
            className="pat-campo"
            style={{ ...CAMPO, height: alvo(40, dedo), padding: `0 ${search ? 40 : 12}px 0 36px`, fontSize: isMobile ? FS.lead : FS.body }}
          />
          {search && (
            <button type="button" onClick={() => atualizar({ busca: "", pagina: 1 })} aria-label="Limpar a busca" className="ds-botao"
              style={{ position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)", width: alvo(32, dedo), height: alvo(32, dedo), display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", borderRadius: R.sm, cursor: "pointer", color: T.second }}>
              <X aria-hidden="true" style={{ width: 14, height: 14 }} />
            </button>
          )}
        </div>

        {/* Filtro por executivo responsável — FilterSelect, o controle da casa
            (vocabulário em components/filter-select.tsx): busca, contagem e o
            × de limpar que todo filtro do app tem. */}
        <FilterSelect
          label="Executivo"
          allLabel="Todos os executivos"
          hideWhenEmpty={false}
          value={execFilter}
          onChange={v => atualizar({ executivo: v, pagina: 1 })}
          options={execFilterOptions}
          searchPlaceholder="Buscar executivo..."
          emptyText="Nenhum executivo"
          panelWidth={260}
          dropdownAlign="left"
          testId="filter-account-executive"
          triggerStyle={{ height: alvo(40, dedo), padding: "0 12px", backgroundColor: T.surface, border: `1px solid ${T.border}`, borderRadius: R.md, fontSize: FS.meta, fontWeight: FW.forte, color: T.apoio }}
        />

        {isMobile && isAdmin && <span style={{ marginLeft: "auto", order: 3 }}><PatrocinadoresArquivados tamanho={tamanhoDosBotoes} /></span>}

        {temFiltro && (
          <Botao variante="fantasma" tamanho={dedo ? "toque" : "md"} icone={X} onClick={() => limpar(["busca", "executivo", "pagina"])}>
            {/* N = quantos FILTROS ativos o botão desfaz — com o nº de
                resultados aqui, "Limpar (0)" numa busca vazia parecia
                "nada a limpar" justamente quando limpar mais importa. */}
            Limpar ({(search ? 1 : 0) + (execFilter !== "all" ? 1 : 0)})
          </Botao>
        )}

        {/* Quantos o recorte deixou — dito em voz alta ao leitor de tela. */}
        <span aria-live="polite" data-testid="contagem-do-recorte" style={{ marginLeft: "auto", fontSize: FS.meta, color: T.second, fontWeight: FW.medio, fontVariantNumeric: "tabular-nums" }}>
          {temFiltro && !isLoading && !sponsorsError
            ? `${filtered.length} de ${sponsors.length} patrocinadores`
            : ""}
        </span>
      </div>
      )}

      {/* ── A lista ── */}
      <section aria-label="Patrocinadores" aria-busy={isLoading || undefined} style={{ backgroundColor: T.surface, borderRadius: R.lg, border: `1px solid ${T.border}`, overflow: "hidden" }}>

        {/* Falha nas queries auxiliares: avisa sem esconder a lista */}
        {auxError && (
          <div role="alert" className="pat-entra" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "10px 16px", backgroundColor: TOM.alerta.bg, borderBottom: `1px solid ${TOM.alerta.border}` }}>
            <AlertTriangle aria-hidden="true" style={{ width: 15, height: 15, color: TOM.alerta.text, flexShrink: 0 }} />
            <span style={{ fontSize: FS.meta, color: TOM.alerta.text, flex: "1 1 220px", lineHeight: 1.45 }}>
              <strong style={{ fontWeight: FW.forte }}>Falha ao carregar {usersError ? "a lista de executivos" : ""}{usersError && usageError ? " e " : ""}{usageError ? "o uso por evento" : ""}.</strong> A lista pode exibir dados incompletos.
            </span>
            <Botao variante="secundario" tamanho={dedo ? "toque" : "sm"} icone={RotateCcw} onClick={retryAux}>
              Tentar novamente
            </Botao>
          </div>
        )}

        {isLoading ? (
          // Esqueleto com a silhueta do que vai chegar: ela chega no lugar em
          // que vai ficar, sem solavanco.
          <div style={{ padding: 12 }}>
            <Esqueleto variante={cards ? "lista" : "tabela"} linhas={6} rotulo="Carregando patrocinadores" />
          </div>
        ) : sponsorsError ? (
          <div className="pat-vazio" style={{ padding: 12 }}>
            <EstadoErro
              titulo="Não foi possível carregar os patrocinadores"
              detalhe="Verifique sua conexão e tente novamente."
              aoTentarDeNovo={() => refetchSponsors()}
            />
          </div>
        ) : filtered.length === 0 ? (
          <div className="pat-vazio" style={{ padding: 12 }}>
            {/* A ação mora onde o olho já está. */}
            <EstadoVazio
              icone={temFiltro ? Search : Building2}
              titulo={temFiltro ? "Nenhum patrocinador encontrado" : "Nenhum patrocinador cadastrado"}
              descricao={temFiltro
                ? (search ? `Nenhum resultado para "${search}"${execFilter !== "all" ? " com este executivo" : ""}. Tente outro termo ou limpe os filtros.` : "Nenhum patrocinador com este executivo. Limpe o filtro para ver todos.")
                : "Cadastre o primeiro para vinculá-lo aos eventos."}
              acao={temFiltro
                ? <Botao variante="secundario" icone={X} onClick={() => limpar(["busca", "executivo", "pagina"])}>Limpar filtros</Botao>
                : <Botao variante="primario" icone={Plus} onClick={openCreate}>Novo Patrocinador</Botao>}
            />
          </div>
        ) : cards ? (
          /* LISTA (celular, tablet em pé): a marca e as ações no alto; o
             executivo, o uso e a resposta numa fileira; o contato embaixo. */
          <ul data-testid="lista-patrocinadores" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {paginated.map((sponsor, i) => (
              <li
                key={sponsor.id}
                {...propsDaLinha(sponsor)}
                style={{
                  display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", alignItems: "start", columnGap: 8,
                  padding: isMobile ? "14px 12px 14px 16px" : "14px 16px 14px 20px",
                  borderBottom: i < paginated.length - 1 ? `1px solid ${N.n3}` : "none",
                  ["--pat-cor" as string]: sponsor.color || "#f97316",
                }}
              >
                <div className="pat-primeira" style={{ minWidth: 0, paddingTop: dedo ? 5 : 0 }}>{identidade(sponsor)}</div>
                <div onClick={e => e.stopPropagation()}>{acoesDe(sponsor)}</div>
                <div style={{ gridColumn: "1 / -1", paddingLeft: 46, marginTop: 10, display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 18px" }}>
                  {executivoDe(sponsor)}
                  {/* Uso indisponível: o aviso acima já diz — dois "—" soltos
                      na fileira só confundiam. */}
                  {!usageError && usoDe(sponsor)}
                  {!usageError && <span data-testid={`cell-resposta-${sponsor.id}`}>{respostaDe(sponsor)}</span>}
                </div>
                {temContato(sponsor) && (
                  <div style={{ gridColumn: "1 / -1", paddingLeft: 46, marginTop: 8, paddingTop: 8, borderTop: `1px dashed ${T.border}` }}>{contatoDe(sponsor)}</div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                  {/* Nome e empresa moram na mesma célula — e cada um ordena. */}
                  <th scope="col" style={{ ...thStyle, paddingLeft: 20 }} aria-sort={sortBy === "name" || sortBy === "company" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                      {botaoOrdem("name", "Patrocinador")}
                      <span aria-hidden="true" style={{ color: T.muted }}>/</span>
                      {botaoOrdem("company", "Empresa")}
                    </span>
                  </th>
                  {/* Ordenar a tabela só existia no clique: agora é <button>.
                      aria-sort informa a ordem atual, que até aqui só a seta
                      comunicava. */}
                  {([
                    { key: "executive", label: "Executivo" },
                    { key: "events", label: "Eventos" },
                  ] as const).map(col => (
                    <th
                      key={col.key}
                      scope="col"
                      style={thStyle}
                      aria-sort={sortBy === col.key ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
                    >
                      {botaoOrdem(col.key, col.label)}
                    </th>
                  ))}
                  <th style={thStyle} title="Pendências de aprovação agora · tempo médio de resposta">Resposta</th>
                  <th style={thStyle}>Contato Responsável</th>
                  <th style={{ ...thStyle, textAlign: "right", width: 1 }}><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((sponsor, i) => (
                  <tr
                    key={sponsor.id}
                    {...propsDaLinha(sponsor)}
                    style={{ borderBottom: i < paginated.length - 1 ? `1px solid ${N.n3}` : "none", ["--pat-cor" as string]: sponsor.color || "#f97316" }}
                  >
                    <td className="pat-primeira" style={{ ...celula, paddingLeft: 20, minWidth: 200 }}>{identidade(sponsor)}</td>
                    <td style={{ ...celula, minWidth: 180 }}>{executivoDe(sponsor)}</td>
                    <td style={{ ...celula, whiteSpace: "nowrap" }}>{usoDe(sponsor)}</td>
                    <td style={{ ...celula, whiteSpace: "nowrap" }} data-testid={`cell-resposta-${sponsor.id}`}>{respostaDe(sponsor)}</td>
                    <td style={{ ...celula, minWidth: 190 }}>{contatoDe(sponsor)}</td>
                    <td style={{ ...celula, padding: "8px 12px 8px 4px" }} onClick={e => e.stopPropagation()}>{acoesDe(sponsor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Paginação — só com mais de uma página. */}
        {filtered.length > PAGE_SIZE && (
          <div style={{ padding: "10px 16px 10px 20px", backgroundColor: T.bg, borderTop: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
            <span style={{ fontSize: FS.meta, color: T.second, fontWeight: FW.medio, fontVariantNumeric: "tabular-nums" }}>
              {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} de {filtered.length} patrocinadores
            </span>
            <Paginacao pagina={safePage} totalPaginas={totalPages} onIr={setPage} toque={toque} />
          </div>
        )}
      </section>


      {/* ══════════════════════════════
          MODAL: Criar / Editar
      ══════════════════════════════ */}
      <Dialog open={modalOpen} onOpenChange={o => { if (!o) requestClose(); }}>

        <DialogContent
          // HIDE_NATIVE_CLOSE: o cabeçalho deste modal desenha o próprio X (o
          // que chama `requestClose` e avisa sobre alterações não salvas).
          className={`p-0 gap-0 border-none ${HIDE_NATIVE_CLOSE}`}
          // ALTURA: `modalSurface` dá o teto de `100vh − 48` e a coluna flex
          // (cabeçalho e rodapé fixos, só o corpo rola) — a mesma casca de
          // Usuários e Modelos. Sem teto, o Radix centra com translateY(-50%)
          // e o que passa da viewport sai METADE em cima e METADE embaixo.
          style={modalSurface(640)}
          // FOCO INICIAL no Nome: o Radix focava o X do cabeçalho (primeiro
          // focável), e quem abria o cadastro tinha de dar Tab para digitar.
          onOpenAutoFocus={e => { e.preventDefault(); document.getElementById("sponsor-name")?.focus(); }}
        >
          {/* POR QUE congelar aqui: salvar fecha o modal, invalida /api/sponsors,
              chama form.reset() e toasta no MESMO commit — o laço do React #185
              e o formulário apagado À VISTA no meio do fade. Mecanismo por
              extenso em components/modal-shell.tsx. */}
          <FreezeWhileClosing open={modalOpen}>
          <DialogTitle className="sr-only">{editingSponsor ? "Editar patrocinador" : "Novo patrocinador"}</DialogTitle>
          <DialogDescription className="sr-only">Nome, executivo responsável, cor da marca e regra de aprovação</DialogDescription>

          {/* Esta div é o elo da coluna: precisa ser flex e poder encolher
              (`minHeight: 0`), senão o teto do Content não chega ao corpo. */}
          <div style={{ display: "flex", flexDirection: "column", flex: "1 1 auto", minHeight: 0 }}>

            <ModalHeader
              icon={editingSponsor ? Pencil : Building2}
              tint={T.accentText}
              title={editingSponsor ? "Editar patrocinador" : "Novo patrocinador"}
              subtitle={editingSponsor ? editingSponsor.name : "Nome, executivo, cor e regra de aprovação"}
              onClose={requestClose}
            />

            {/* Corpo: o ÚNICO scrollport do modal (`minHeight: 0` obrigatório). */}
            <div style={{ overflowY: "auto", flex: "1 1 auto", minHeight: 0 }}>
              <Form {...form}>
                <form id="sponsor-form" noValidate onSubmit={form.handleSubmit(onSubmit, () => { continuarRef.current = false; })}>
                  <div style={{ padding: isMobile ? "20px 16px 24px" : "24px 28px 28px", display: "flex", flexDirection: "column", gap: 28 }}>

                    {/* "SALVOU?" com o modal ainda aberto: a sequência fica à
                        vista, porque o toast some e o formulário volta vazio. */}
                    {!editingSponsor && criadosNestaSequencia.length > 0 && (
                      <p role="status" className="pat-entra" data-testid="patrocinadores-criados-na-sequencia" style={{ margin: 0, padding: "10px 12px", borderRadius: R.md, backgroundColor: TOM.sucesso.bg, border: `1px solid ${TOM.sucesso.border}`, fontSize: FS.meta, lineHeight: 1.5, color: TOM.sucesso.text, display: "flex", gap: 8, alignItems: "flex-start" }}>
                        <Check aria-hidden="true" style={{ width: 14, height: 14, flexShrink: 0, marginTop: 2 }} />
                        <span>
                          <strong style={{ fontWeight: FW.forte }}>{criadosNestaSequencia.length === 1 ? "1 patrocinador cadastrado" : `${criadosNestaSequencia.length} patrocinadores cadastrados`} nesta sequência:</strong> {criadosNestaSequencia.join(", ")}.
                          {executivoHerdado ? " O executivo ficou como no anterior — confira antes de salvar o próximo." : " Preencha o próximo."}
                        </span>
                      </p>
                    )}

                    {/* ─ 01 Informações Gerais ─ */}
                    <section>
                      {sectionLabel("01", "Informações Gerais")}
                      {/* Uma coluna no celular: duas de 1fr deixavam ~140px por
                          campo e o <input> não encolhe abaixo de ~154. */}
                      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: isMobile ? 20 : 16, alignItems: "start" }}>
                        <FormField control={form.control} name="name" render={({ field }) => (
                          <FormItem className="space-y-0">
                            <label htmlFor="sponsor-name" style={ROTULO_CAMPO}>Nome do Patrocinador <span aria-hidden="true" style={{ color: T.accentText }}>*</span></label>
                            <FormControl>
                              <input {...field} id="sponsor-name" placeholder="Ex.: Banco Aurora" data-testid="input-sponsor-name" autoComplete="off" aria-required="true"
                                className="pat-campo"
                                style={{ ...CAMPO, fontFamily: FONT.display, fontWeight: FW.forte, fontSize: isMobile ? FS.lead : FS.read }}
                              />
                            </FormControl>
                            <FormMessage className="mt-1.5" />
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="accountExecutiveId" render={({ field }) => (
                          <FormItem className="space-y-0">
                            <label htmlFor="sponsor-account-executive" style={ROTULO_CAMPO}>Executivo responsável (interno)</label>
                            <FormControl>
                              {/* kind="field": é CAMPO DE FORMULÁRIO, não filtro
                                  — não tem "Todos", não tem × de limpar, e
                                  preenchido não acende de laranja. "Não
                                  atribuído" é resposta válida: opção fixa. */}
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
                                triggerStyle={{ height: 44, padding: "0 14px", backgroundColor: T.surface, border: `1px solid ${T.border}`, borderRadius: R.md, fontSize: isMobile ? FS.lead : FS.body, fontWeight: FW.corpo, color: T.text }}
                              />
                            </FormControl>
                            <FormMessage className="mt-1.5" />
                            {/* HERDADO, DITO NO CAMPO: some quando a pessoa
                                troca o executivo. alerta.text sobre alerta.bg passa AA. */}
                            {!editingSponsor && executivoHerdado && field.value === executivoHerdado && (
                              <p role="status" className="pat-entra" data-testid="aviso-executivo-herdado" style={{ margin: "8px 0 0", padding: "6px 10px", borderRadius: R.sm, backgroundColor: TOM.alerta.bg, border: `1px solid ${TOM.alerta.border}`, fontSize: FS.small, fontWeight: FW.forte, lineHeight: 1.4, color: TOM.alerta.text }}>
                                Executivo mantido do cadastro anterior — confira antes de salvar.
                              </p>
                            )}
                            {/* PARA QUE SERVE: "executivo" sem contexto lia como
                                contato do cliente. É gente da casa, e o efeito
                                prático é o e-mail do book (CANAL_META em
                                server/routes/items.ts). */}
                            <p style={{ margin: "8px 0 0", fontSize: FS.small, lineHeight: 1.5, color: T.apoio }}>
                              Pessoa da equipe que cuida da conta. Recebe o e-mail quando sai o book de um evento deste patrocinador e aparece como responsável na Gestão de Prazos.
                            </p>
                          </FormItem>
                        )} />
                      </div>

                    </section>

                    {/* ─ 02 Identidade Visual ─ paleta à esquerda; o hex e a
                        PRÉVIA à direita — escolher a cor era escolher uma
                        bolinha sem ver onde ela ia parar. */}
                    <section>
                      {sectionLabel("02", "Identidade Visual")}
                      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "auto minmax(0, 1fr)", gap: isMobile ? 20 : 28, alignItems: "start" }}>
                        <FormField control={form.control} name="color" render={({ field }) => (
                          <FormItem className="space-y-0">
                            {/* Não há UM controle atrás deste rótulo (é um grupo
                                de botões): o span nomeia o grupo via aria-labelledby. */}
                            <span id="sponsor-color-label" style={ROTULO_CAMPO}>Cor da Marca</span>
                            <FormControl>
                              <div role="group" aria-labelledby="sponsor-color-label" style={{ display: "grid", gridTemplateColumns: `repeat(6, ${alvo(28, dedo)}px)`, gap: dedo ? 8 : 10 }}>
                                {PRESET_COLORS.map(c => {
                                  const marcada = (field.value || "").toLowerCase() === c;
                                  return (
                                    <button key={c} type="button" data-testid={`color-${c}`}
                                      className="pat-amostra"
                                      onClick={() => field.onChange(c)}
                                      aria-label={`Selecionar a cor ${c}`}
                                      aria-pressed={marcada}
                                      title={c}
                                      style={{ width: alvo(28, dedo), height: alvo(28, dedo), borderRadius: R.pill, backgroundColor: c, border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: marcada ? `0 0 0 2px ${T.surface}, 0 0 0 4px ${c}` : "inset 0 0 0 1px rgba(28,25,23,0.08)" }}
                                    >
                                      {marcada && <Check aria-hidden="true" strokeWidth={3} style={{ width: 14, height: 14, color: onColor(c) }} />}
                                    </button>
                                  );
                                })}
                              </div>
                            </FormControl>
                            {/* O erro da cor aparece UMA vez, sob o Código Hex — que é onde se digita. */}
                          </FormItem>
                        )} />

                        <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 16 }}>
                          <FormField control={form.control} name="color" render={({ field }) => (
                            <FormItem className="space-y-0">
                              <label htmlFor="sponsor-color-hex" style={ROTULO_CAMPO}>Código Hex</label>
                              {/* O input é o filho DIRETO do FormControl: com a
                                  div no meio, aria-invalid/aria-describedby do
                                  Slot paravam num elemento decorativo. */}
                              <div style={{ position: "relative" }}>
                                <span aria-hidden="true" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", width: 22, height: 22, borderRadius: R.sm, backgroundColor: corValida(selectedColor) ? selectedColor : T.low, boxShadow: "inset 0 0 0 1px rgba(28,25,23,0.1)", transition: "background-color var(--dur-media) ease" }} />
                                <span aria-hidden="true" style={{ position: "absolute", left: 40, top: "50%", transform: "translateY(-50%)", fontSize: FS.body, color: T.second, fontFamily: FONT.mono, fontWeight: FW.forte }}>#</span>
                                <FormControl>
                                  <input
                                    id="sponsor-color-hex"
                                    value={(field.value || "").replace(/^#/, "")}
                                    onChange={e => field.onChange("#" + e.target.value.replace(/^#/, ""))}
                                    placeholder="F97316"
                                    data-testid="input-color"
                                    maxLength={7}
                                    spellCheck={false}
                                    autoComplete="off"
                                    className="pat-campo"
                                    style={{ ...CAMPO, paddingLeft: 54, fontFamily: FONT.mono, textTransform: "uppercase", fontSize: isMobile ? FS.lead : FS.body }}
                                  />
                                </FormControl>
                              </div>
                              <FormMessage className="mt-1.5" />
                            </FormItem>
                          )} />

                          {/* PRÉVIA — o ladrilho da lista e o chip das peças,
                              com o nome digitado e a cor escolhida. */}
                          <div data-testid="previa-da-marca" style={{ padding: "12px 14px", borderRadius: R.md, backgroundColor: T.bg, border: `1px solid ${T.border}` }}>
                            <span style={{ ...ROTULO_CAMPO, marginBottom: 10 }}>Prévia</span>
                            <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flexWrap: "wrap" }}>
                              <MarcaDoPatrocinador nome={nomeDigitado || "Patrocinador"} cor={corValida(selectedColor) ? selectedColor : null} tamanho={34} />
                              <span style={{ fontSize: FS.read, fontWeight: FW.forte, fontFamily: FONT.display, color: nomeDigitado ? T.text : T.second, minWidth: 0, overflowWrap: "anywhere", flex: "1 1 120px" }}>
                                {nomeDigitado || "Nome do patrocinador"}
                              </span>
                              <ChipDaMarca nome={nomeDigitado || "Patrocinador"} cor={corValida(selectedColor) ? selectedColor : null} />
                            </div>
                          </div>
                        </div>
                      </div>
                    </section>

                    {/* A regra de aprovação — pedido do dono (21/08): o
                        "patrocinador desaprovador". É uma regra do fluxo, não
                        um dado cadastral. A linha inteira é o alvo. */}
                    <section>
                      {sectionLabel("03", "Regra de aprovação")}
                      <FormField control={form.control} name="strictApproval" render={({ field }) => (
                        <FormItem className="space-y-0">
                          <label htmlFor="sponsor-strict" className="pat-regra" style={{ display: "flex", alignItems: "flex-start", gap: 12, cursor: "pointer", padding: "14px 16px", borderRadius: R.md, border: `1px solid ${T.border}`, backgroundColor: T.surface }}>
                            <FormControl>
                              <input type="checkbox" id="sponsor-strict" data-testid="checkbox-desaprovador"
                                checked={!!field.value} onChange={e => field.onChange(e.target.checked)}
                                style={{ width: 18, height: 18, marginTop: 1, accentColor: T.accentText, flexShrink: 0, cursor: "pointer" }} />
                            </FormControl>
                            <span>
                              <span style={{ display: "block", fontSize: FS.read, fontWeight: FW.forte, color: T.text, fontFamily: FONT.display }}>Patrocinador desaprovador</span>
                              <span style={{ display: "block", fontSize: FS.meta, color: T.apoio, lineHeight: 1.55, marginTop: 4 }}>
                                A aprovação dele vale só para a versão que ele aprovou: toda versão nova da arte a revoga, e a reprovação de qualquer outro patrocinador também. Uso típico: Ministério.
                              </span>
                            </span>
                          </label>
                          <FormMessage className="mt-1.5" />
                        </FormItem>
                      )} />
                    </section>

                  </div>
                </form>
              </Form>
            </div>

            {/* Rodapé da casa: primário cheio; embaixo, as saídas secundárias
                lado a lado — empilhadas, eram três andares de botão que
                comiam o corpo do modal no celular. */}
            <ModalFooter fundo={T.bg}>
              <Botao type="submit" form="sponsor-form" data-testid="button-submit"
                variante="primario"
                larguraCheia
                carregando={createMutation.isPending || updateMutation.isPending}
                style={{ minHeight: toque + 4, fontSize: FS.read }}
                onClick={() => { continuarRef.current = false; }}
              >
                {createMutation.isPending || updateMutation.isPending ? "Salvando…" : editingSponsor ? "Salvar alterações" : "Salvar patrocinador"}
              </Botao>
              <div style={{ display: "flex", gap: 8 }}>
                {/* Só na criação: mesmo submit, sem fechar o modal. */}
                {!editingSponsor && (
                  <Botao type="submit" form="sponsor-form" data-testid="button-submit-e-outro"
                    variante="secundario"
                    larguraCheia
                    icone={Plus}
                    disabled={createMutation.isPending}
                    onClick={() => { continuarRef.current = true; }}
                    style={{ minHeight: toque + 4, flex: "1 1 0" }}
                  >
                    {isMobile ? "Salvar e outro" : "Salvar e cadastrar outro"}
                  </Botao>
                )}
                {/* Depois de cadastrar na sequência, "Cancelar" sugeria desfazer. */}
                <Botao variante="fantasma" larguraCheia data-testid="button-cancel" onClick={requestClose}
                  style={{ minHeight: toque + 4, flex: "1 1 0" }}
                >
                  {criadosNestaSequencia.length > 0 && !editingSponsor ? "Fechar" : "Cancelar"}
                </Botao>
              </div>
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
          // Mesma casca do cadastro (`modalSurface`): teto e coluna flex — uma
          // razão social longa estica o parágrafo e vira rolagem, não corte.
          style={modalSurface(460)}
          // Foco inicial no "Manter": o Enter distraído recua, não exclui.
          onOpenAutoFocus={e => { e.preventDefault(); document.querySelector<HTMLButtonElement>('[data-testid="button-cancel-delete"]')?.focus(); }}
        >
          {/* POR QUE congelar aqui: quem fecha este diálogo é
              `setDeletingSponsor(null)` dentro do onSuccess — o MESMO estado que
              abre o corpo. Sem congelar, o texto some no primeiro frame do fade. */}
          <FreezeWhileClosing open={!!deletingSponsor}>
          <DialogTitle className="sr-only">Arquivar patrocinador</DialogTitle>
          <DialogDescription className="sr-only">Confirme o arquivamento do patrocinador</DialogDescription>
          {deletingSponsor && (
          <div data-testid="dialog-confirm-delete" style={{ display: "flex", flexDirection: "column", flex: "1 1 auto", minHeight: 0 }}>
            {/* Excluir ARQUIVA — o subtítulo diz que tem volta. */}
            <ModalHeader
              icon={Archive}
              variant="confirm"
              tint={TOM.perigo.text}
              title={`Arquivar ${deletingSponsor.name}?`}
              subtitle="Dá para restaurar em Arquivados."
              onClose={() => setDeletingSponsor(null)}
            />
            <div style={{ padding: "16px 24px 20px", overflowY: "auto", flex: "1 1 auto", minHeight: 0 }}>
              {/* O QUE SAI DE VISTA, em número — âmbar, não vermelho: nada se perde. */}
              {(() => {
                const u = usage[deletingSponsor.id];
                const semUso = !u || u.events === 0;
                return (
                  <div data-testid="delete-sponsor-impacto" style={{ display: "flex", alignItems: "center", gap: 12, margin: "0 0 14px", padding: "10px 12px", borderRadius: R.md, backgroundColor: semUso ? T.bg : TOM.alerta.bg, border: `1px solid ${semUso ? T.border : TOM.alerta.border}` }}>
                    <MarcaDoPatrocinador nome={deletingSponsor.name} cor={deletingSponsor.color || "#f97316"} tamanho={32} />
                    <span style={{ fontSize: FS.meta, fontWeight: FW.medio, lineHeight: 1.45, color: semUso ? T.apoio : TOM.alerta.text }}>
                      {usageError
                        ? "Não foi possível conferir em quantos eventos ele está agora."
                        : semUso
                        ? "Nunca foi vinculado a um evento."
                        : `Vinculado a ${u.events} ${u.events === 1 ? "evento" : "eventos"}${u.items > 0 ? ` e ${u.items} ${u.items === 1 ? "peça" : "peças"}` : ""}.`}
                    </span>
                  </div>
                );
              })()}
              {/* "ARQUIVAR MEXE NO QUÊ?" — por inteiro: o que sai de vista e o
                  que fica. Nada é apagado (server/services/arquivamento.ts). */}
              <p style={{ fontSize: FS.body, color: T.strong, margin: 0, lineHeight: 1.6 }}>
                <strong style={{ color: T.text }}>{deletingSponsor.name}</strong> sai do cadastro e das listas de escolha (vincular, importar). Nada é apagado:
              </p>
              <ul data-testid="delete-sponsor-o-que-some" style={{ margin: "8px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6, fontSize: FS.meta, lineHeight: 1.5, color: T.strong }}>
                {[
                  "sai do elenco dos eventos, mas o vínculo fica guardado;",
                  "o nome continua nas peças e nas aprovações antigas;",
                  "restaurar o devolve às listas e aos eventos, como estava.",
                ].map(t => (
                  <li key={t} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                    <Check aria-hidden="true" style={{ width: 13, height: 13, color: TOM.sucesso.text, flexShrink: 0, marginTop: 3 }} />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
              <p style={{ margin: "12px 0 0", fontSize: FS.meta, lineHeight: 1.5, color: T.apoio }}>
                Se ele só saiu de um evento, desvincule-o no evento em vez de arquivar.
              </p>
            </div>
            <ModalFooter>
              <Botao variante="perigo" larguraCheia data-testid="button-confirm-delete"
                icone={Archive}
                onClick={() => deleteMutation.mutate(deletingSponsor.id)}
                carregando={deleteMutation.isPending}
                style={{ minHeight: toque + 4, fontSize: FS.read }}>
                {deleteMutation.isPending ? "Arquivando…" : "Sim, arquivar"}
              </Botao>
              <Botao variante="fantasma" larguraCheia data-testid="button-cancel-delete" onClick={() => setDeletingSponsor(null)}
                style={{ minHeight: toque }}>
                Manter
              </Botao>
            </ModalFooter>
          </div>
          )}
          </FreezeWhileClosing>
        </DialogContent>
      </Dialog>
      {dialogo}
    </div>
  );
}
