import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { FreezeWhileClosing, HIDE_NATIVE_CLOSE, ModalFooter, ModalHeader, modalSurface } from "@/components/modal-shell";
import { useRef, useState } from "react";
import { useLocation } from "wouter";
import { FilterSelect } from "@/components/filter-select";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { UsuarioDaLista } from "@shared/api";
import {
  Form, FormControl, FormField, FormItem, FormMessage,
} from "@/components/ui/form";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  UserPlus, Pencil, Trash2, Search,
  ChevronLeft, ChevronRight, X, Check, ScrollText, ShieldOff, Users,
} from "lucide-react";
import { T, N, TOM, FS, FW, R, FONT } from "@/lib/theme";
import { Botao } from "@/components/ui/botao";
import { Selo } from "@/components/ui/selo";
import { CabecalhoDaPagina } from "@/components/ui/cabecalho-da-pagina";
import { EstadoErro, EstadoVazio, Esqueleto } from "@/components/ui/estados";
import { useConfirmar } from "@/components/ui/usar-confirmar";
import { alvo, useDensidadeDoConteudo, usePonteiroGrosso } from "@/hooks/use-mobile";
import { useFiltrosNaUrl, paginaValida } from "@/hooks/use-filtros-na-url";

/**
 * O QUE CADA PERFIL CONCEDE.
 *
 * O formulário oferecia cinco perfis num menu e nada dizia o que cada um
 * podia fazer. Quem administra precisa saber que poderes está entregando — e
 * "Admin" entrega todos.
 *
 * CADA LINHA SAI DA RÉGUA DO SERVIDOR, não da memória do produto: das guardas
 * `requireRole`/`requireAdmin` e das checagens `req.userRole` em
 * server/routes/*.ts. A referência entre parênteses é a rota que sustenta a
 * linha — se a rota mudar de papel e a linha ficar, o bloco vira promessa
 * falsa, que é pior que bloco nenhum.
 *
 * Quatro linhas por perfil: as duas primeiras dizem o que ele faz, as duas
 * últimas o que ele NÃO faz. O "não faz" é metade do ponto — é o que responde
 * "posso dar este perfil para ela?" sem abrir o código.
 */
const PERMISSOES: Record<string, { pode: boolean; texto: string }[]> = {
  admin: [
    // requireAdmin em /api/users; todas as guardas de papel incluem "admin".
    { pode: true,  texto: "Cria, edita e exclui usuários, e define o perfil de cada um" },
    { pode: true,  texto: "Faz tudo o que os outros quatro perfis fazem, em qualquer etapa" },
    { pode: true,  texto: "Exclui eventos, encerra e reabre ciclos, restaura peças excluídas" },
    { pode: true,  texto: "Dispara os avisos por e-mail e altera as regras de cota" },
  ],
  solicitacao: [
    // POST /api/events · POST /api/events/:id/items/submit · PATCH .../approve
    { pode: true,  texto: "Cria eventos e envia as peças do ciclo para a Arte" },
    // .../creator-review · .../edit · .../cancel · .../return-to-arte
    { pode: true,  texto: "Revisa, edita, devolve para a Arte e cancela peças" },
    // sponsor-approvals/:id/approve exige "atendimento" ou "admin"
    { pode: false, texto: "Não decide aprovação de patrocinador" },
    // DELETE /api/events/:id e submit-final-file exigem outros papéis
    { pode: false, texto: "Não exclui eventos nem anexa arte e arquivo final" },
  ],
  arte: [
    // requireLinkingWrite (sponsors.ts) · PATCH .../submit-for-approval
    { pode: true,  texto: "Vincula patrocinadores e envia peças para aprovação" },
    // .../submit-final-file · .../update-thumb · POST /api/events/:id/book
    { pode: true,  texto: "Anexa arte e arquivo final, e publica o book do evento" },
    // sponsor-approvals/:id/approve exige "atendimento" ou "admin"
    { pode: false, texto: "Não decide aprovação de patrocinador" },
    // POST e DELETE /api/events/:id exigem solicitação/admin e admin
    { pode: false, texto: "Não cria nem exclui eventos" },
  ],
  grafica: [
    // PATCH .../start-production · PATCH .../return-to-review
    { pode: true,  texto: "Inicia a produção e devolve peças para revisão" },
    // POST /api/items/:id/photos · POST .../mark-reuse
    { pode: true,  texto: "Anexa fotos de produção e entrega, e marca reaproveitamento" },
    // submit-for-approval e submit-final-file exigem "arte" ou "admin"
    { pode: false, texto: "Não envia peças para aprovação nem anexa a arte" },
    { pode: false, texto: "Não cria eventos nem decide aprovação de patrocinador" },
  ],
  atendimento: [
    // POST .../sponsor-approvals/:sponsorId/approve e /reject
    { pode: true,  texto: "Aprova e reprova peças em nome do patrocinador" },
    // .../sponsor-approvals/:sponsorId/revert · PUT /api/quota-rules/global
    { pode: true,  texto: "Revoga uma decisão já tomada e ajusta as regras de cota" },
    // submit-final-file exige "arte"; start-production exige "grafica"
    { pode: false, texto: "Não anexa arte nem arquivo final, e não inicia produção" },
    { pode: false, texto: "Não cria nem exclui eventos" },
  ],
};

/**
 * AS TELAS QUE O PERFIL VÊ NO MENU.
 *
 * O bloco acima diz o que o perfil PODE FAZER; faltava o que a pessoa vai
 * ENXERGAR ao entrar — é a primeira pergunta de quem recebe o acesso ("onde
 * eu clico?") e a do admin ao escolher ("ela vai ver a Gráfica?"). Sai da
 * régua do menu (components/app-sidebar.tsx: `roles` de cada item, e a
 * seção Administração só para admin). Se um item mudar de perfil lá, mude
 * aqui. Texto corrido e não lista: o teste do bloco de permissões conta as
 * linhas `{ pode:` por perfil, e este mapa não pode parecer uma delas.
 */
const TELAS_NO_MENU: Record<string, string> = {
  admin: "Todas — inclusive Usuários, Configurar Cotas, Estoque, Triagem de Retorno, Análises, Notificações e Logs",
  solicitacao: "Revisão Final, Gráfica, Solicitação de peças, Vincular Patrocinadores, Patrocinadores e Modelos",
  arte: "Arte, Atendimento e Vincular Patrocinadores",
  grafica: "Gráfica",
  atendimento: "Arte, Atendimento, Vincular Patrocinadores, Solicitação de peças e Patrocinadores",
};
// Itens do menu sem `roles` (app-sidebar.tsx): aparecem para qualquer perfil.
const TELAS_DE_TODOS = "Painel Geral, Eventos, Gestão de Prazos, Calendário, Histórico, Versões aprovadas e Registros";

/* ── Role config ── */
// Tons 700 nos textos dos badges: os 500/600 anteriores reprovavam o piso de
// contraste 4.5:1 sobre os fundos pastéis. Selo e texto vêm de TOM.*; o fundo
// do AVATAR é o degrau 100 da mesma família, um passo mais forte que o selo de
// propósito (o avatar é a mancha que se acha na lista) — o theme não tem esse
// degrau, e o 200 (`border`) derruba o laranja para 3,8:1 sob a inicial.
const ROLE_CFG: Record<string, { label: string; bg: string; color: string; avatarBg: string; avatarColor: string }> = {
  admin:       { label: "Admin",        bg: TOM.perigo.bg,  color: TOM.perigo.text,  avatarBg: "#fee2e2", avatarColor: TOM.perigo.text },
  solicitacao: { label: "Solicitação",  bg: TOM.info.bg,    color: TOM.info.text,    avatarBg: "#dbeafe", avatarColor: TOM.info.text },
  arte:        { label: "Arte",         bg: TOM.roxo.bg,    color: TOM.roxo.text,    avatarBg: "#ede9fe", avatarColor: TOM.roxo.text },
  grafica:     { label: "Gráfica",      bg: TOM.laranja.bg, color: TOM.laranja.text, avatarBg: "#ffedd5", avatarColor: TOM.laranja.text },
  atendimento: { label: "Atendimento",  bg: TOM.sucesso.bg, color: TOM.sucesso.text, avatarBg: "#dcfce7", avatarColor: TOM.sucesso.text },
};

// Violeta do "Kit": precisa ser DIFERENTE do roxo da Arte, que mora ao lado no
// mesmo selo de perfil. Não há violeta no theme; fica aqui, uma vez só.
const KIT = { bg: "#f5f3ff", text: "#6d28d9", border: "#ddd6fe" } as const;

// Rótulos completos para o <select> do formulário, derivados de ROLE_CFG para
// as opções nunca divergirem dos perfis reais.
const ROLE_FORM_LABELS: Record<string, string> = { admin: "Administrador" };

const userSchema = z.object({
  name:  z.string().min(1, "Nome obrigatório"),
  email: z.string().email("Email inválido"),
  role:  z.enum(["admin", "solicitacao", "arte", "grafica", "atendimento"], { required_error: "Selecione um perfil" }),
  // Usuário do Kit (14/09): só faz sentido no perfil Solicitação.
  kit:   z.boolean(),
});
type UserForm = z.infer<typeof userSchema>;

/** Linha de GET /api/users (contrato em @shared/api — o usuário sem o hash). */
type User = UsuarioDaLista;

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join("");
}

const PAGE_SIZE = 10;

/* ── Titanium Input ── */
const tiInput: React.CSSProperties = {
  width: "100%", padding: "11px 14px",
  backgroundColor: N.n3, border: "none", borderRadius: R.md,
  fontSize: FS.body, color: T.text,
  transition: "background-color 0.15s ease, box-shadow 0.15s ease",
};

/* ── Filter select ── */
const filterSel: React.CSSProperties = {
  height: 40, padding: "0 12px", backgroundColor: T.surface,
  border: `1px solid ${T.border}`, borderRadius: R.md,
  fontSize: FS.meta, fontWeight: FW.forte, color: T.second,
  cursor: "pointer",
  appearance: "none", WebkitAppearance: "none",
};

// Foco do campo cinza: acende em branco com o anel laranja da casa.
const acenderCampo = (e: React.FocusEvent<HTMLInputElement>) => { e.currentTarget.style.backgroundColor = T.surface; e.currentTarget.style.boxShadow = "0 0 0 2px rgba(249,115,22,0.2)"; };
const apagarCampo = (e: React.FocusEvent<HTMLInputElement>) => { e.currentTarget.style.backgroundColor = N.n3; e.currentTarget.style.boxShadow = "none"; };

// Rótulo em caixa-alta dos campos do formulário.
const ROTULO_CAMPO: React.CSSProperties = { display: "block", fontSize: FS.micro, fontWeight: FW.rotulo, color: T.second, textTransform: "uppercase", letterSpacing: "0.16em", marginBottom: 7 };

/**
 * PAGINAÇÃO — janela de até 5 páginas em volta da atual, alvos de 32px (44 no
 * celular) e a página atual cheia em escuro. Some com uma página só: setas
 * mortas e um "1" solitário eram controle sem função.
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
          style={medida}>
          {p}
        </Botao>
      ))}
      <Botao tamanho="sm" icone={ChevronRight} onClick={() => onIr(pagina + 1)} disabled={pagina === totalPaginas} aria-label="Próxima página" style={medida} />
    </nav>
  );
}

const PERFIS_VALIDOS = Object.keys(ROLE_CFG);

export default function Usuarios() {
  // Régua única do app (ver use-mobile.tsx): a tabela de 6 colunas some abaixo
  // de 820px de ÁREA ÚTIL e vira um cartão por usuário. A medida é da CAIXA DA
  // LISTA (o <section> abaixo), que já está dentro do padding da página — por
  // isso não há padding a descontar aqui.
  const { ref: listaRef, cards, compacto, isMobile } = useDensidadeDoConteudo<HTMLElement>();
  const ponteiroGrosso = usePonteiroGrosso();
  const [, navigate] = useLocation();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [deletingUser, setDeletingUser] = useState<User | null>(null);
  // RECORTE NA URL (regra da casa): F5, voltar e o link mandado a um colega
  // devolvem a mesma busca, o mesmo perfil e a mesma página. Mudar busca ou
  // perfil volta para a página 1 no MESMO update — como já era.
  const { valores: filtros, definir, atualizar, limpar } = useFiltrosNaUrl(
    { busca: "", perfil: "all", pagina: 1 },
    { aceita: { perfil: v => v === "all" || PERFIS_VALIDOS.includes(v), pagina: paginaValida } },
  );
  const search = filtros.busca;
  const roleFilter = filtros.perfil;
  const page = filtros.pagina;
  const setPage = (p: number) => definir("pagina", p);
  const limparFiltros = () => limpar();
  // Alvo pelo PONTEIRO, não pela largura: o tablet do galpão tem 1024px de
  // janela e é usado com o dedo — os 32px valiam lá e eram metade do mínimo.
  const toque = alvo(32, ponteiroGrosso || isMobile);
  const { toast } = useToast();
  const { confirmar, dialogo } = useConfirmar();

  const { data: users = [], isLoading, isError, refetch } = useQuery<User[]>({ queryKey: ["/api/users"] });

  // Usuário logado: esconde a lixeira da própria linha (o servidor já bloqueia
  // a auto-exclusão) e permite avisar antes de rebaixar o próprio papel.
  const { data: me } = useQuery<User>({ queryKey: ["/api/auth/me"] });

  // "EXCLUIR APAGA O QUÊ?" — a exclusão solta o executivo dos patrocinadores
  // dele (FK `account_executive_id` com ON DELETE SET NULL, shared/schema.ts).
  // Só busca com a confirmação aberta: é a única pergunta que precisa disso.
  const { data: patrocinadores = [] } = useQuery<{ id: string; name: string; accountExecutiveId: string | null }[]>({
    queryKey: ["/api/sponsors"],
    enabled: !!deletingUser,
  });

  const form = useForm<UserForm>({
    resolver: zodResolver(userSchema),
    defaultValues: { name: "", email: "", role: "solicitacao", kit: false },
  });
  // "SALVAR E CADASTRAR OUTRO": cadastrar a equipe da Gráfica eram N vezes
  // Novo Usuário → preencher → salvar → Novo Usuário de novo. O botão usa o
  // MESMO POST e o mesmo onSuccess; a única diferença é não fechar o modal —
  // limpa nome e e-mail, MANTÉM o perfil (quem cadastra em sequência costuma
  // cadastrar um time) — com aviso no campo, e nunca o perfil admin — e
  // devolve o foco ao Nome. Ref e não estado: o valor só
  // é lido no onSuccess e não deve provocar render.
  const continuarRef = useRef(false);
  const [criadosNestaSequencia, setCriadosNestaSequencia] = useState<string[]>([]);
  // Perfil que veio do cadastro anterior da sequência (null = nada herdado).
  // Só serve para o aviso "mantido do cadastro anterior" junto ao campo.
  const [perfilHerdado, setPerfilHerdado] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: async (data: UserForm) => {
      const res = await apiRequest("POST", "/api/auth/register", data);
      return res.json();
    },
    // O nome no toast confirma QUEM foi criado — com o modal já fechado, um
    // "criado com sucesso" genérico não deixa conferir se o e-mail estava certo.
    // A descrição responde "ela vai receber senha?": não — o sistema não manda
    // nada, então o próximo passo é de quem cadastrou.
    onSuccess: (_r, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ variant: "success", title: `${vars.name} foi criado`, description: `Avise a pessoa: ela entra pelo portal NORTE com a conta Microsoft ${vars.email}. O sistema não envia convite.` });
      if (continuarRef.current) {
        continuarRef.current = false;
        setCriadosNestaSequencia(prev => [...prev, vars.name]);
        // ADMIN NÃO SE HERDA. Perfil sem restrição dado por inércia — o
        // próximo da sequência saindo admin porque o anterior era — é o erro
        // mais caro desta tela; volta ao padrão e a pessoa escolhe de novo.
        // Os demais perfis continuam herdados, mas com aviso junto ao campo
        // (`perfilHerdado`), no padrão de Modelos.
        const herda = vars.role !== "admin";
        setPerfilHerdado(herda ? vars.role : null);
        form.reset({ name: "", email: "", role: herda ? vars.role : "solicitacao", kit: herda ? vars.kit : false });
        window.setTimeout(() => document.getElementById("user-form-name")?.focus(), 0);
        return;
      }
      setModalOpen(false); form.reset();
    },
    onError: (e: Error) => { continuarRef.current = false; toast({ variant: "destructive", title: "Não foi possível criar o usuário", description: `${e.message} — nada foi salvo; corrija e tente de novo.` }); },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: { id: string; update: Partial<UserForm> }) => {
      const res = await apiRequest("PATCH", `/api/users/${data.id}`, data.update);
      return res.json();
    },
    onSuccess: (_r, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setModalOpen(false); setEditingUser(null); form.reset();
      // Mesma regra do aviso no formulário: trocar perfil ou Kit derruba as
      // sessões da pessoa no servidor — o toast confirma o efeito colateral.
      const derrubouSessao = vars.update.role !== undefined || vars.update.kit !== undefined;
      toast({
        variant: "success",
        title: "Alterações salvas",
        description: editingUser
          ? `Cadastro de ${editingUser.name} atualizado.${derrubouSessao && me?.id !== editingUser.id ? " A pessoa foi desconectada e entra de novo já com o novo perfil." : ""}`
          : undefined,
      });
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Não foi possível salvar as alterações", description: e.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/users/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      const nome = deletingUser?.name;
      setDeletingUser(null);
      toast({ variant: "success", title: "Usuário excluído", description: nome ? `${nome} não tem mais acesso ao sistema.` : undefined });
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Não foi possível excluir o usuário", description: e.message }),
  });

  const openCreate = () => {
    setEditingUser(null);
    setCriadosNestaSequencia([]);
    setPerfilHerdado(null);
    form.reset({ name: "", email: "", role: "solicitacao", kit: false });
    setModalOpen(true);
  };

  const openEdit = (u: User) => {
    setEditingUser(u);
    // O perfil gravado é um dos cinco (o servidor valida na escrita).
    form.reset({ name: u.name, email: u.email, role: u.role as UserForm["role"], kit: !!u.kit });
    setModalOpen(true);
  };

  // Saída única do modal (X, Cancelar, Esc, clique fora): confirma descarte só
  // quando há alteração real e sempre zera editingUser — antes, fechar pelo X
  // deixava o usuário em edição "grudado" na próxima abertura.
  //
  // ASSÍNCRONA agora (diálogo do app, não window.confirm): o Dialog pede para
  // fechar, mas `modalOpen` só vira false depois do "Descartar" — recusar
  // deixa o modal aberto e com o que foi digitado, como antes.
  const requestClose = async () => {
    if (form.formState.isDirty) {
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
    setEditingUser(null);
    form.reset({ name: "", email: "", role: "solicitacao", kit: false });
  };

  const onSubmit = async (data: UserForm) => {
    if (editingUser) {
      // Rebaixar o próprio papel derruba a própria sessão (o servidor invalida
      // as sessões ao trocar papel) e tranca esta tela — merece confirmação.
      // Perigo: é perder o próprio acesso, sem volta por esta tela.
      if (
        me && editingUser.id === me.id &&
        editingUser.role === "admin" && data.role !== "admin" &&
        !(await confirmar({
          titulo: "Remover seu próprio acesso de administrador?",
          descricao: "Você está removendo seu próprio acesso de administrador. Sua sessão será encerrada e você perderá o acesso a esta tela.",
          confirmar: "Remover meu acesso",
          cancelar: "Manter como admin",
          perigo: true,
          icone: ShieldOff,
        }))
      ) {
        return;
      }
      const update: Partial<UserForm> = {};
      if (data.name !== editingUser.name) update.name = data.name;
      if (data.email !== editingUser.email) update.email = data.email;
      if (data.role !== editingUser.role) update.role = data.role;
      const kit = data.role === "solicitacao" && data.kit;
      if (kit !== !!editingUser.kit) update.kit = kit;
      updateMutation.mutate({ id: editingUser.id, update });
    } else {
      createMutation.mutate({ ...data, kit: data.role === "solicitacao" && data.kit });
    }
  };

  /* ── Filtered + paginated ── */
  /** A BUSCA casa? Vale para a lista E para o pool das opções do menu. */
  const casaBusca = (u: { name: string; email: string }) => {
    const q = search.toLowerCase();
    return !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
  };
  const filtered = users.filter(u => casaBusca(u) && (roleFilter === "all" || u.role === roleFilter));
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  // Excluir o último item de uma página ou apertar um filtro pode deixar
  // `page` além do total — clampa em vez de renderizar uma página vazia.
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // As três ações da linha, uma vez só: a tabela e o cartão precisam
  // exatamente das mesmas, com os mesmos rótulos e as mesmas guardas.
  const acoesDoUsuario = (user: User) => {
    // Botao fantasma quadrado: o hover e o foco vêm da classe .ds-botao, e o
    // lado do quadrado segue o alvo do ponteiro (32 no mouse, 44 no dedo).
    const iconeBtn = { width: toque, height: toque, padding: 0, color: T.second } as const;
    return (
      <>
        <Botao
          variante="fantasma"
          tamanho="sm"
          icone={Pencil}
          data-testid={`button-edit-${user.id}`}
          onClick={() => openEdit(user)}
          aria-label={`Editar usuário ${user.name}`}
          style={iconeBtn}
        />
        {/* "QUEM FEZ ISSO?" ao contrário: "o que esta pessoa fez?". Era abrir
            Logs e digitar o nome; o atalho abre a trilha já buscando por ele (a
            busca dos Logs casa o nome do autor e mora na URL). */}
        <Botao
          variante="fantasma"
          tamanho="sm"
          icone={ScrollText}
          data-testid={`button-logs-${user.id}`}
          onClick={() => navigate(`/logs-sistema?busca=${encodeURIComponent(user.name)}`)}
          aria-label={`Ver nos logs o que ${user.name} fez`}
          style={iconeBtn}
        />
        {me?.id !== user.id && (
          <Botao
            variante="fantasma"
            tamanho="sm"
            icone={Trash2}
            data-testid={`button-delete-${user.id}`}
            onClick={() => setDeletingUser(user)}
            aria-label={`Excluir usuário ${user.name}`}
            style={iconeBtn}
          />
        )}
      </>
    );
  };

  /* ── Role counts ── */
  const roleCounts = Object.keys(ROLE_CFG).reduce((acc, r) => {
    acc[r] = users.filter(u => u.role === r).length;
    return acc;
  }, {} as Record<string, number>);

  // Opções do menu de Perfil, COM contagem — e recortadas pela busca. A fileira
  // de chips logo acima já mostrava o número de cada perfil; o menu, que faz
  // exatamente o mesmo recorte, não mostrava nenhum. Dois controles para a
  // mesma dimensão, um informando e o outro não. Perfis sem ninguém saem da
  // lista: oferecê-los seria prometer um clique que devolve tabela vazia.
  const roleFilterOptions = Object.entries(ROLE_CFG)
    .map(([v, c]) => ({
      value: v,
      label: c.label,
      count: users.filter(u => u.role === v && casaBusca(u)).length,
    }))
    .filter(o => o.count > 0);

  return (
    <div style={{ backgroundColor: T.bg, height: "100%", overflowY: "auto", padding: isMobile ? "16px 16px 48px" : "28px 32px 64px" }}>

      {/* ── Header ── */}
      <CabecalhoDaPagina
        titulo="Usuários"
        subtitulo={isLoading || isError ? undefined : `${users.length} ${users.length === 1 ? "pessoa com acesso" : "pessoas com acesso"}`}
        acoes={
          <Botao
            variante="primario"
            tamanho={ponteiroGrosso || isMobile ? "toque" : "md"}
            icone={UserPlus}
            data-testid="button-new-user"
            onClick={openCreate}
            larguraCheia={isMobile}
          >
            Novo Usuário
          </Botao>
        }
      />
      {/* Responde as duas dúvidas do primeiro cadastro antes do clique: como
          a pessoa entra e o que decide o que ela vê. */}
      <p style={{ fontSize: FS.body, color: T.second, margin: "-8px 0 24px", lineHeight: 1.5, maxWidth: 640 }}>
        Quem entra no sistema e o que cada um vê e faz. O acesso é pela conta Microsoft, via portal NORTE — não há senha para enviar; o perfil define telas e ações.
      </p>

      {/* ── Role chips summary ── */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        {Object.entries(ROLE_CFG).map(([role, cfg]) => (
          // Chip de filtro com desenho próprio (cor do perfil): fica <button>
          // nativo; o realce de hover/foco vem da classe da casa.
          <button
            key={role}
            type="button"
            className="ds-botao"
            onClick={() => atualizar({ perfil: roleFilter === role ? "all" : role, pagina: 1 })}
            // O chip é um alternador: aria-pressed diz ao leitor de tela o que
            // hoje só a cor dizia (qual perfil está filtrando a tabela).
            aria-pressed={roleFilter === role}
            title={roleFilter === role ? "Mostrar todos os perfis" : `Mostrar só ${cfg.label}`}
            style={{
              minHeight: alvo(28, ponteiroGrosso || isMobile), padding: "0 14px", borderRadius: R.pill,
              backgroundColor: roleFilter === role ? cfg.bg : T.low,
              border: `1px solid ${roleFilter === role ? cfg.color + "40" : T.border}`,
              color: roleFilter === role ? cfg.color : T.second,
              fontSize: FS.small, fontWeight: FW.forte, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            <span style={{ fontFamily: FONT.mono, fontWeight: FW.forte }}>{roleCounts[role]}</span>
            {cfg.label}
          </button>
        ))}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, fontSize: FS.small, color: T.second, fontWeight: FW.medio }}>
          <span style={{ fontFamily: FONT.mono, fontWeight: FW.forte, color: T.second }}>{users.length}</span> usuários totais
        </div>
      </div>

      {/* ── Search bar ── */}
      {/* flexWrap: em 375px a busca, o menu de Perfil, o Limpar e a contagem
          não cabem numa linha — sem quebra, a barra estourava para o lado. */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: isMobile ? "1 1 100%" : 1, maxWidth: isMobile ? "none" : 360 }}>
          <Search aria-hidden="true" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: T.muted }} />
          <input
            value={search} onChange={e => atualizar({ busca: e.target.value, pagina: 1 })}
            placeholder="Buscar por nome ou e-mail..."
            aria-label="Buscar usuário por nome ou e-mail"
            type="search"
            data-testid="input-search-users"
            style={{ ...tiInput, height: alvo(40, ponteiroGrosso || isMobile), padding: "0 12px 0 36px", borderRadius: R.md, width: "100%", fontSize: isMobile ? FS.lead : FS.body }}
            onFocus={acenderCampo}
            onBlur={apagarCampo}
          />
        </div>
        <FilterSelect
          label="Perfil" allLabel="Todos os perfis"
          value={roleFilter}
          onChange={v => atualizar({ perfil: v, pagina: 1 })}
          options={roleFilterOptions}
          searchPlaceholder="Buscar perfil..." emptyText="Nenhum perfil encontrado."
          hideWhenEmpty={false} testId="select-role-filter"
          triggerStyle={filterSel}
        />
        {(search || roleFilter !== "all") && (
          // N = quantos filtros o botão desfaz — o mesmo "Limpar (N)" de
          // Patrocinadores, Logs e Modelos.
          <Botao variante="secundario" icone={X} onClick={limparFiltros}>
            Limpar ({(search ? 1 : 0) + (roleFilter !== "all" ? 1 : 0)})
          </Botao>
        )}
        <span style={{ marginLeft: "auto", fontSize: FS.small, color: T.second, fontWeight: FW.medio }}>
          {filtered.length} resultado{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* ── Table ── */}
      <section ref={listaRef} style={{ backgroundColor: T.surface, border: `1px solid ${T.border}`, borderRadius: R.lg, overflow: "hidden", marginBottom: 20 }}>
        {isLoading ? (
          // Esqueleto com a silhueta do que vem (cartões ou tabela): a lista
          // "chega" no lugar em que vai ficar, em vez de um texto que some.
          <div style={{ padding: 12 }}>
            <Esqueleto variante={cards ? "lista" : "tabela"} linhas={5} rotulo="Carregando usuários" />
          </div>
        ) : isError ? (
          <div style={{ padding: 12 }}>
            <EstadoErro
              compacto
              titulo="Não foi possível carregar os usuários"
              detalhe="Verifique sua conexão e tente novamente."
              aoTentarDeNovo={() => refetch()}
            />
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 12 }}>
            {users.length === 0 ? (
              <EstadoVazio
                compacto
                icone={Users}
                titulo="Nenhum usuário cadastrado ainda"
                descricao={'Use "Novo Usuário" para criar o primeiro.'}
              />
            ) : (
              <EstadoVazio
                compacto
                icone={Search}
                titulo="Nenhum usuário corresponde à busca e aos filtros aplicados."
                acao={<Botao variante="secundario" onClick={limparFiltros}>Limpar filtros</Botao>}
              />
            )}
          </div>
        ) : (
          <>
            {/* CARTÃO POR USUÁRIO abaixo de 820px de área útil. A tabela tem
                seis colunas e não tinha mínimo: em vez de rolar, ela ESPREMIA —
                o e-mail (a informação que identifica a pessoa no SSO) virava
                duas letras por linha e a coluna de Ações ficava com 20px. */}
            {cards ? (
            <ul data-testid="lista-usuarios-cards" style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {paginated.map(user => {
                const cfg = ROLE_CFG[user.role] || ROLE_CFG.solicitacao;
                return (
                  <li key={user.id} data-testid={`row-user-${user.id}`}
                    style={{ padding: "14px 16px", borderBottom: `1px solid ${T.low}`, display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: "50%",
                        backgroundColor: cfg.avatarBg, color: cfg.avatarColor,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: FS.small, fontWeight: FW.rotulo, flexShrink: 0, letterSpacing: 0,
                      }}>
                        {initials(user.name)}
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: FS.read, fontWeight: FW.forte, color: T.text, overflowWrap: "anywhere", lineHeight: 1.3 }}>
                          {user.name}
                          {me?.id === user.id && (
                            <span style={{ marginLeft: 6, fontSize: FS.small, fontWeight: FW.forte, color: T.second, backgroundColor: T.low, borderRadius: R.pill, padding: "2px 8px" }}>você</span>
                          )}
                        </div>
                        {/* E-MAIL INTEIRO, quebrando onde precisar: é por ele
                            que a pessoa entra (SSO) e é o que se confere. */}
                        <div style={{ fontSize: FS.meta, color: T.second, overflowWrap: "anywhere", lineHeight: 1.35 }}>{user.email}</div>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <Selo tamanho="sm" cores={{ bg: cfg.bg, text: cfg.color, border: cfg.bg }}>
                        {cfg.label}
                      </Selo>
                      {user.kit && (
                        <Selo tamanho="sm" cores={KIT} data-testid={`badge-kit-${user.id}`}>
                          Kit
                          <span className="sr-only"> — só vê e cria peças do Kit, e só as dele</span>
                        </Selo>
                      )}
                      {user.mustChangePassword ? (
                        <Selo tamanho="sm" tom="alerta" forma="retangulo">Trocar Senha</Selo>
                      ) : (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                          <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: TOM.sucesso.dot }} />
                          <span style={{ fontSize: FS.small, color: T.second, fontWeight: FW.medio }}>Ativo</span>
                        </span>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <span style={{ fontSize: FS.small, color: T.second }}>
                        Criado em {format(new Date(user.createdAt), "dd/MM/yyyy", { locale: ptBR })}
                      </span>
                      <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>{acoesDoUsuario(user)}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
            ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                <thead>
                  <tr style={{ backgroundColor: T.low, borderBottom: `1px solid ${T.border}` }}>
                    {/* Entre 820 e 1180px de área útil "Criado em" sai da
                        tabela e desce para baixo do nome: é a coluna menos
                        consultada e a que empurrava o e-mail para o corte. */}
                    {(compacto
                      ? ["Nome", "Email", "Perfil", "Status", "Ações"]
                      : ["Nome", "Email", "Perfil", "Status", "Criado em", "Ações"]
                    ).map((h, i, todas) => (
                      <th key={h} scope="col" style={{
                        padding: "12px 20px", fontSize: FS.micro, fontWeight: FW.rotulo,
                        color: T.second, textTransform: "uppercase", letterSpacing: "0.16em",
                        textAlign: i === todas.length - 1 ? "right" : "left",
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginated.map(user => {
                    const cfg = ROLE_CFG[user.role] || ROLE_CFG.solicitacao;
                    const init = initials(user.name);
                    return (
                      <tr key={user.id}
                        data-testid={`row-user-${user.id}`}
                        // Realce da linha pela classe (n1 = stone-50), não por handler.
                        className="hover:bg-stone-50"
                        style={{ borderBottom: `1px solid ${T.low}`, transition: "background 0.1s" }}
                      >
                        {/* Nome + avatar */}
                        <td style={{ padding: "14px 20px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{
                              width: 32, height: 32, borderRadius: "50%",
                              backgroundColor: cfg.avatarBg, color: cfg.avatarColor,
                              display: "flex", alignItems: "center", justifyContent: "center",
                              fontSize: FS.micro, fontWeight: FW.rotulo, flexShrink: 0, letterSpacing: 0,
                            }}>
                              {init}
                            </div>
                            <span style={{ fontSize: FS.body, fontWeight: FW.forte, color: T.text }}>{user.name}</span>
                            {/* A própria linha não tem lixeira (o servidor
                                bloqueia a auto-exclusão); sem o "você", a
                                ausência do botão parecia defeito. */}
                            {me?.id === user.id && (
                              <span style={{ fontSize: FS.micro, fontWeight: FW.forte, color: T.second, backgroundColor: T.low, borderRadius: R.pill, padding: "2px 8px" }}>você</span>
                            )}
                          </div>
                          {compacto && (
                            <div style={{ fontSize: FS.small, color: T.second, marginTop: 3, paddingLeft: 42 }}>
                              Criado em {format(new Date(user.createdAt), "dd/MM/yyyy", { locale: ptBR })}
                            </div>
                          )}
                        </td>

                        {/* Email */}
                        <td style={{ padding: "14px 20px", fontSize: FS.body, color: T.second }}>{user.email}</td>

                        {/* Perfil badge */}
                        <td style={{ padding: "14px 20px" }}>
                          <Selo tamanho="sm" cores={{ bg: cfg.bg, text: cfg.color, border: cfg.bg }}>
                            {cfg.label}
                          </Selo>
                          {user.kit && (
                            <Selo tamanho="sm" cores={KIT} data-testid={`badge-kit-${user.id}`} style={{ marginLeft: 6 }}>
                              Kit
                              {/* O que "Kit" quer dizer ia só no `title`: no
                                  tablet não há hover e o leitor de tela não o
                                  lê num <span>. Agora é texto, escondido só
                                  visualmente. */}
                              <span className="sr-only"> — só vê e cria peças do Kit, e só as dele</span>
                            </Selo>
                          )}
                        </td>

                        {/* Status */}
                        <td style={{ padding: "14px 20px" }}>
                          {user.mustChangePassword ? (
                            <Selo tamanho="sm" tom="alerta" forma="retangulo">Trocar Senha</Selo>
                          ) : (
                            <span style={{ display: "flex", alignItems: "center", gap: 6, paddingLeft: 4 }}>
                              <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: TOM.sucesso.dot }} />
                              <span style={{ fontSize: FS.micro, color: T.second, fontWeight: FW.medio }}>Ativo</span>
                            </span>
                          )}
                        </td>

                        {/* Criado em */}
                        {!compacto && (
                          <td style={{ padding: "14px 20px", fontSize: FS.body, color: T.second }}>
                            {format(new Date(user.createdAt), "dd/MM/yyyy", { locale: ptBR })}
                          </td>
                        )}

                        {/* Ações */}
                        <td style={{ padding: "14px 20px", textAlign: "right" }}>
                          <div style={{ display: "flex", justifyContent: "flex-end", gap: 4 }}>
                            {acoesDoUsuario(user)}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            )}

            {/* Pagination footer */}
            <div style={{ padding: "10px 20px", borderTop: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, backgroundColor: T.low }}>
              <p style={{ fontSize: FS.small, color: T.second, fontWeight: FW.medio, margin: 0 }}>
                Exibindo {Math.min((safePage - 1) * PAGE_SIZE + 1, filtered.length)}–{Math.min(safePage * PAGE_SIZE, filtered.length)} de {filtered.length} usuário{filtered.length !== 1 ? "s" : ""}
              </p>
              <Paginacao pagina={safePage} totalPaginas={totalPages} onIr={setPage} toque={toque} />
            </div>
          </>
        )}
      </section>

      {/* ── Bento ── */}
      {/* O card "Nível de Segurança" foi REMOVIDO: ele media a fração de
          usuários sem mustChangePassword, mas o cadastro atual é SSO-only e
          sempre grava mustChangePassword=false — o "health score" era 100%
          por construção (e virava "100% seguro" até quando a query falhava).
          Se um fluxo com senha provisória voltar, o card pode voltar com ele. */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16, marginTop: 24 }}>
        {/* Dark card — Relatório de Acessos */}
        <div style={{ backgroundColor: T.dark, borderRadius: R.lg, padding: isMobile ? "22px 20px" : "28px 32px", display: "flex", flexDirection: "column", justifyContent: "space-between", minHeight: 200, position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: -40, right: -40, width: 180, height: 180, borderRadius: "50%", backgroundColor: T.accent, opacity: 0.12, filter: "blur(60px)" }} />
          <div>
            <h3 style={{ fontSize: FS.h2, fontWeight: FW.rotulo, color: T.surface, margin: "0 0 8px", fontFamily: FONT.display, letterSpacing: "-0.04em", textTransform: "uppercase", lineHeight: 1 }}>
              Controle de Acessos
            </h3>
            {/* O texto antigo prometia "atividade e status de segurança em tempo
                real" — o sistema não grava login (ver logs-sistema.tsx). O card
                agora diz o que o botão entrega de fato: a trilha de operações. */}
            <p style={{ fontSize: FS.body, color: "rgba(255,255,255,0.72)", margin: 0, maxWidth: 380 }}>
              Consulte quem criou, alterou, aprovou ou excluiu cada registro na trilha de operações do sistema.
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 24 }}>
            <div style={{ display: "flex", gap: 6 }}>
              {users.slice(0, 4).map((u, i) => {
                const cfg = ROLE_CFG[u.role] || ROLE_CFG.solicitacao;
                return (
                  <div key={u.id} style={{ width: 36, height: 36, borderRadius: "50%", backgroundColor: cfg.avatarBg, border: `2px solid ${T.dark}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: FS.micro, fontWeight: FW.rotulo, color: cfg.avatarColor, marginLeft: i > 0 ? -10 : 0 }}>
                    {initials(u.name)}
                  </div>
                );
              })}
              {users.length > 4 && (
                <div style={{ width: 36, height: 36, borderRadius: "50%", backgroundColor: T.strong, border: `2px solid ${T.dark}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: FS.micro, fontWeight: FW.forte, color: T.bdark, marginLeft: -10 }}>
                  +{users.length - 4}
                </div>
              )}
            </div>
            {/* Botão CLARO sobre o card escuro: o secundário da casa (fundo
                branco). O laranja cheio que estava aqui era o único botão
                laranja das telas de cadastro. */}
            <Botao
              variante="secundario"
              onClick={() => navigate("/logs-sistema")}
              data-testid="button-ver-logs"
            >
              Ver Logs
            </Botao>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════
          MODAL: Criar / Editar
      ══════════════════════════════ */}
      {/* Formulário inteiro num overlay manual: o Tab escapava para a página
          atrás no meio do preenchimento, Esc não fazia nada e o foco não
          voltava ao fechar. O aviso de descarte, que antes só existia no
          clique fora, agora vale também para Esc — é o Dialog que decide
          quando fechar. */}
      <Dialog
        open={modalOpen}
        onOpenChange={o => {
          if (o) return;
          requestClose();
        }}
      >
        <DialogContent
          // HIDE_NATIVE_CLOSE: o X agora é o do ModalHeader, que passa pelo
          // `requestClose` (e pelo aviso de descarte).
          className={`p-0 gap-0 border-none ${HIDE_NATIVE_CLOSE}`}
          // ALTURA: `modalSurface` traz o teto de `100vh − 48` e a coluna flex
          // (conta por extenso em components/modal-shell.tsx). Medi 367px no
          // desktop e 453px em 375 de largura, onde os campos Email e Perfil
          // empilham; cada FormMessage de validação soma ~20px. Com o teto, o
          // excedente vira rolagem no corpo, e cabeçalho e rodapé ficam à vista.
          style={modalSurface(520)}
          // FOCO INICIAL no Nome: o Radix foca o primeiro focável, que aqui é o
          // X do cabeçalho — quem abriu "Novo Usuário" tinha de dar Tab antes
          // de digitar (e um Enter distraído fechava o modal).
          onOpenAutoFocus={e => { e.preventDefault(); document.getElementById("user-form-name")?.focus(); }}
        >
          {/* POR QUE congelar aqui: criar/atualizar fecha o modal, invalida
              /api/users, chama form.reset() e toasta no mesmo commit. O
              form.reset() troca o título ("Editar Usuário" → "Novo Usuário") e
              esvazia os três campos À VISTA, durante a animação de saída — e
              cada render da página nessa janela desanexa e reanexa a ref das 5
              primitivas Radix daqui de dentro, que é o laço do React #185.
              Mecanismo por extenso em components/modal-shell.tsx. */}
          <FreezeWhileClosing open={modalOpen}>
          <DialogTitle className="sr-only">{editingUser ? "Editar usuário" : "Novo usuário"}</DialogTitle>
          <DialogDescription className="sr-only">Dados de acesso e perfil do usuário</DialogDescription>
          {/* Coluna flex: o teto do Content só chega ao formulário se cada elo
              entre os dois for flex e puder encolher (`minHeight: 0`). */}
          <div style={{ display: "flex", flexDirection: "column", flex: "1 1 auto", minHeight: 0 }}>
            {/* Cabeçalho da casa (variante `work`): o mesmo dos formulários de
                Patrocinadores e Modelos. Antes cada um dos três desenhava o
                seu — cinza em caixa alta aqui, branco 26px lá, 18px no outro. */}
            <ModalHeader
              icon={editingUser ? Pencil : UserPlus}
              tint={T.accentText}
              title={editingUser ? "Editar usuário" : "Novo usuário"}
              subtitle={editingUser ? `Editando ${editingUser.email}` : "O acesso é pela conta Microsoft do e-mail informado"}
              onClose={requestClose}
            />

            {/* Modal form */}
            <Form {...form}>
              {/* `Form` é o FormProvider e não desenha nada, então este <form> é
                  o item flex logo abaixo do cabeçalho — e é o scrollport único
                  do modal. Os botões moram no ModalFooter, FORA da rolagem, e
                  chegam ao submit pelo atributo `form`. */}
              <form id="user-form" onSubmit={form.handleSubmit(onSubmit, () => { continuarRef.current = false; })} style={{ padding: isMobile ? "20px 18px" : "24px 28px", display: "flex", flexDirection: "column", gap: 18, overflowY: "auto", flex: "1 1 auto", minHeight: 0 }}>

                {/* "SALVOU?" dentro do modal que não fechou: com "Salvar e
                    cadastrar outro" o formulário volta vazio, e só o toast
                    (que some) dizia que o anterior entrou. A lista fica à
                    vista enquanto a sequência durar. */}
                {!editingUser && criadosNestaSequencia.length > 0 && (
                  <p role="status" data-testid="usuarios-criados-na-sequencia" style={{ margin: 0, display: "flex", gap: 7, alignItems: "flex-start", padding: "9px 12px", borderRadius: R.sm, backgroundColor: TOM.sucesso.bg, border: `1px solid ${TOM.sucesso.border}`, fontSize: FS.meta, lineHeight: 1.45, color: TOM.sucesso.text }}>
                    <Check aria-hidden="true" style={{ width: 13, height: 13, flexShrink: 0, marginTop: 2 }} />
                    <span>
                      {criadosNestaSequencia.length === 1 ? "1 usuário criado" : `${criadosNestaSequencia.length} usuários criados`} nesta sequência: {criadosNestaSequencia.join(", ")}.
                      {perfilHerdado ? " O perfil ficou como no anterior — confira antes de salvar o próximo." : " Preencha o próximo."}
                    </span>
                  </p>
                )}

                {/* Nome */}
                <FormField control={form.control} name="name" render={({ field }) => (
                  <FormItem>
                    <label htmlFor="user-form-name" style={ROTULO_CAMPO}>Nome Completo</label>
                    <FormControl>
                      <input {...field} id="user-form-name" placeholder="Ex: Roberto Carlos" data-testid="input-name"
                        style={{ ...tiInput, fontSize: isMobile ? FS.lead : FS.body }}
                        onFocus={acenderCampo}
                        onBlur={apagarCampo}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                {/* Email + Perfil grid */}
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 14 }}>
                  <FormField control={form.control} name="email" render={({ field }) => (
                    <FormItem>
                      <label htmlFor="user-form-email" style={ROTULO_CAMPO}>Email</label>
                      <FormControl>
                        <input {...field} id="user-form-email" type="email" placeholder="email@norte.com" data-testid="input-email"
                          style={{ ...tiInput, fontSize: isMobile ? FS.lead : FS.body }}
                          onFocus={acenderCampo}
                          onBlur={apagarCampo}
                        />
                      </FormControl>
                      <FormMessage />
                      {/* COMO A PESSOA ENTRA. "Ela vai receber senha?" era a
                          dúvida do primeiro cadastro, e nada respondia. Não há
                          senha nem convite: o login é o SSO do portal NORTE, que
                          procura este e-mail EXATAMENTE como gravado (server/
                          index.ts, `WHERE email = $1`) — por isso o "igual". */}
                      <p style={{ margin: "6px 0 0", fontSize: FS.small, lineHeight: 1.4, color: T.apoio }}>
                        Igual ao da conta Microsoft. Não há senha nem convite por e-mail: avise a pessoa para entrar pelo portal NORTE.
                      </p>
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="role" render={({ field }) => (
                    <FormItem>
                      <label htmlFor="user-form-role" style={ROTULO_CAMPO}>Perfil</label>
                      <FormControl>
                        {/* kind="field": campo de formulário, não filtro (ver o
                            vocabulário em components/filter-select.tsx). O
                            `<select>` daqui já tentava se disfarçar com
                            `appearance: none`, mas o disfarce só pegava o
                            gatilho — o MENU continuava sendo o do sistema
                            operacional, dentro de um modal desenhado pela casa. */}
                        <FilterSelect
                          kind="field"
                          fullWidth
                          hideSearch
                          hideWhenEmpty={false}
                          label="Perfil"
                          value={field.value}
                          onChange={field.onChange}
                          options={Object.entries(ROLE_CFG).map(([value, cfg]) => ({
                            value, label: ROLE_FORM_LABELS[value] ?? cfg.label,
                          }))}
                          testId="select-role"
                          triggerProps={{ id: "user-form-role", onBlur: field.onBlur }}
                          triggerStyle={{ ...tiInput, height: "auto", padding: "14px 16px", border: "none" }}
                        />
                      </FormControl>
                      <FormMessage />
                      {/* HERDADO, DITO NO CAMPO. "Cadastrar outro" mantém o
                          perfil do anterior; sem este aviso o próximo usuário
                          saía com o perfil de outra pessoa sem ninguém notar.
                          Some quando a pessoa troca o perfil. TOM.alerta.text
                          sobre TOM.alerta.bg passa AA. */}
                      {!editingUser && perfilHerdado && field.value === perfilHerdado && (
                        <p role="status" data-testid="aviso-perfil-herdado" style={{ margin: "6px 0 0", padding: "6px 10px", borderRadius: R.sm, backgroundColor: TOM.alerta.bg, border: `1px solid ${TOM.alerta.border}`, fontSize: FS.small, fontWeight: FW.forte, lineHeight: 1.4, color: TOM.alerta.text }}>
                          Perfil mantido do cadastro anterior — confira antes de salvar.
                        </p>
                      )}

                      {/* O QUE ESTE PERFIL CONCEDE. Muda com a escolha, e o
                          Admin tem tratamento próprio: é o único que não tem
                          uma linha de "não faz", e quem está entregando esse
                          perfil precisa ler isso antes de salvar. */}
                      {(() => {
                        const linhas = PERMISSOES[field.value] ?? [];
                        if (linhas.length === 0) return null;
                        const ehAdmin = field.value === "admin";
                        return (
                          <div data-testid="bloco-permissoes"
                            style={{
                              marginTop: 10, padding: "11px 13px", borderRadius: R.sm,
                              backgroundColor: ehAdmin ? TOM.perigo.bg : T.bg,
                              border: `1px solid ${ehAdmin ? TOM.perigo.border : T.border}`,
                            }}>
                            {/* perigo.text sobre perigo.bg = 6,1:1 · apoio (n8) sobre n1 = 7,1:1 */}
                            <p style={{
                              margin: "0 0 7px", fontSize: FS.micro, fontWeight: FW.rotulo,
                              textTransform: "uppercase", letterSpacing: "0.14em",
                              color: ehAdmin ? TOM.perigo.text : T.apoio,
                            }}>
                              O que este perfil concede
                            </p>
                            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 5 }}>
                              {linhas.map((l) => (
                                <li key={l.texto} style={{ display: "flex", gap: 7, alignItems: "flex-start" }}>
                                  {/* sucesso.text = 4,8:1 e perigo.text = 6,3:1 sobre n1 */}
                                  {l.pode
                                    ? <Check aria-hidden="true" style={{ width: 13, height: 13, color: TOM.sucesso.text, flexShrink: 0, marginTop: 1 }} />
                                    : <X aria-hidden="true" style={{ width: 13, height: 13, color: TOM.perigo.text, flexShrink: 0, marginTop: 1 }} />}
                                  <span style={{ fontSize: FS.meta, lineHeight: 1.4, color: T.strong }}>
                                    <span className="sr-only">{l.pode ? "Pode: " : "Não pode: "}</span>
                                    {l.texto}
                                  </span>
                                </li>
                              ))}
                            </ul>
                            {ehAdmin && (
                              <p style={{ margin: "8px 0 0", fontSize: FS.small, fontWeight: FW.forte, color: TOM.perigo.text, lineHeight: 1.4 }}>
                                Perfil sem restrição: pode excluir dados e conceder acesso a outras pessoas.
                              </p>
                            )}
                            {/* O QUE APARECE NO MENU — "poder fazer" não diz
                                "onde clicar". strong (n9) sobre n1/perigo.bg ≥ 9:1. */}
                            {TELAS_NO_MENU[field.value] && (
                              <p data-testid="bloco-telas-do-perfil" style={{ margin: "9px 0 0", paddingTop: 8, borderTop: `1px dashed ${ehAdmin ? TOM.perigo.border : T.border}`, fontSize: FS.small, lineHeight: 1.45, color: T.strong }}>
                                <strong style={{ fontWeight: FW.rotulo }}>No menu: </strong>
                                {TELAS_NO_MENU[field.value]}
                                {field.value !== "admin" && `, além de ${TELAS_DE_TODOS}, que todos veem`}.
                              </p>
                            )}
                          </div>
                        );
                      })()}
                    </FormItem>
                  )} />
                </div>

                {/* USUÁRIO DO KIT (14/09): só no perfil Solicitação. */}
                {form.watch("role") === "solicitacao" && (
                  <FormField control={form.control} name="kit" render={({ field }) => (
                    <FormItem>
                      <label htmlFor="user-form-kit" style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "11px 13px", borderRadius: R.sm, border: `1px solid ${field.value ? KIT.border : T.border}`, backgroundColor: field.value ? KIT.bg : T.bg, cursor: "pointer" }}>
                        <input id="user-form-kit" type="checkbox" data-testid="checkbox-user-kit"
                          checked={field.value} onChange={(e) => field.onChange(e.target.checked)}
                          style={{ width: 16, height: 16, marginTop: 2, accentColor: KIT.text, flexShrink: 0 }} />
                        <span>
                          <span style={{ display: "block", fontSize: FS.body, fontWeight: FW.rotulo, color: T.text }}>Usuário do Kit</span>
                          <span style={{ display: "block", fontSize: FS.meta, color: T.apoio, lineHeight: 1.4, marginTop: 2 }}>
                            {/* "menos Modelos": o item do menu tem `semKit` e a
                                rota de escrita do catálogo recusa o Kit (routes.ts). */}
                            Mesmas telas da Solicitação, menos Modelos. Só vê e cria peças do Kit — e só as que ele criou.
                            Sem a marca, a Solicitação só visualiza as peças do Kit.
                          </span>
                        </span>
                      </label>
                    </FormItem>
                  )} />
                )}

                {/* "MUDAR O PERFIL DESLOGA A PESSOA?" — sim, e ninguém dizia.
                    O PATCH /api/users/:id apaga as sessões dela quando muda
                    `role` ou `kit` (server/routes/auth.ts); o aviso aparece só
                    quando uma das duas mudou de verdade, e não para a própria
                    conta (esse caso já tem a confirmação do onSubmit). */}
                {(() => {
                  if (!editingUser || me?.id === editingUser.id) return null;
                  const papel = form.watch("role");
                  const kitAgora = papel === "solicitacao" && form.watch("kit");
                  if (papel === editingUser.role && kitAgora === !!editingUser.kit) return null;
                  return (
                    <p role="status" data-testid="aviso-sessao-encerrada" style={{ margin: 0, padding: "10px 12px", borderRadius: R.sm, backgroundColor: TOM.alerta.bg, border: `1px solid ${TOM.alerta.border}`, fontSize: FS.meta, lineHeight: 1.45, color: TOM.alerta.text }}>
                      Ao salvar, <strong>{editingUser.name}</strong> é desconectado e precisa entrar de novo pelo portal — já com o novo perfil.
                    </p>
                  );
                })()}

              </form>
            </Form>

            {/* Rodapé da casa: primário cheio, recuar discreto abaixo — o
                mesmo par de Patrocinadores, Modelos e das confirmações. */}
            <ModalFooter>
              <Botao type="submit" form="user-form"
                variante="primario"
                larguraCheia
                data-testid="button-save-user"
                carregando={createMutation.isPending || updateMutation.isPending}
                style={{ minHeight: toque + 4, fontSize: FS.read }}
                onClick={() => { continuarRef.current = false; }}>
                {createMutation.isPending || updateMutation.isPending ? "Salvando…" : editingUser ? "Salvar alterações" : "Criar usuário"}
              </Botao>
              {/* Secundário (contorno) e só na criação: editar é um de cada
                  vez. Mesmo submit do formulário — só não fecha o modal. */}
              {!editingUser && (
                <Botao type="submit" form="user-form"
                  variante="secundario"
                  larguraCheia
                  data-testid="button-save-user-e-outro"
                  disabled={createMutation.isPending}
                  onClick={() => { continuarRef.current = true; }}
                  style={{ minHeight: toque + 4 }}>
                  Criar e cadastrar outro
                </Botao>
              )}
              {/* Depois de criar alguém na sequência, "Cancelar" sugeria
                  desfazer quem já entrou — e não desfaz. */}
              <Botao variante="fantasma" larguraCheia onClick={requestClose}
                data-testid="button-cancel"
                style={{ minHeight: toque }}>
                {criadosNestaSequencia.length > 0 && !editingUser ? "Fechar" : "Cancelar"}
              </Botao>
            </ModalFooter>
          </div>
          </FreezeWhileClosing>
        </DialogContent>
      </Dialog>

      {/* ══════════════════════════════
          MODAL: Confirmar Exclusão
      ══════════════════════════════ */}
      {/* Era um overlay manual: fechava só clicando fora, sem Esc, sem prender
          o foco e sem devolvê-lo depois. Numa confirmação de exclusão isso
          importa duas vezes — é onde a pessoa mais precisa poder recuar. */}
      <Dialog open={!!deletingUser} onOpenChange={o => { if (!o) setDeletingUser(null); }}>
        <DialogContent
          className={`p-0 gap-0 border-none ${HIDE_NATIVE_CLOSE}`}
          style={modalSurface(440)}
          // Foco inicial no "Manter": numa exclusão, o Enter distraído recua
          // em vez de apagar alguém.
          onOpenAutoFocus={e => { e.preventDefault(); document.querySelector<HTMLButtonElement>('[data-testid="button-cancel-delete"]')?.focus(); }}
        >
          {/* POR QUE congelar aqui: quem fecha é `setDeletingUser(null)` no
              onSuccess, e é o mesmo estado que abre o corpo
              (`{deletingUser && ...}`). Sem congelar, "Excluir Fulano?" some
              no primeiro frame do fade e sobra uma caixa vazia. */}
          <FreezeWhileClosing open={!!deletingUser}>
          <DialogTitle className="sr-only">Excluir usuário</DialogTitle>
          <DialogDescription className="sr-only">Confirme a exclusão do usuário</DialogDescription>
          {deletingUser && (
            <>
              {/* Confirmação da casa (variante `confirm`, cabeçalho claro): a
                  MESMA casca das exclusões de Patrocinadores e Modelos — antes
                  eram três desenhos (faixa vermelha, borda à esquerda e o
                  AlertDialog genérico). */}
              <ModalHeader
                icon={Trash2}
                variant="confirm"
                tint={TOM.perigo.text}
                title={`Excluir ${deletingUser.name}?`}
                subtitle="Esta ação não pode ser desfeita."
                onClose={() => setDeletingUser(null)}
              />
              <div style={{ padding: "16px 24px", overflowY: "auto", flex: "1 1 auto", minHeight: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                <p style={{ fontSize: FS.body, color: T.strong, margin: 0, lineHeight: 1.5 }}>
                  <strong style={{ color: T.text }}>{deletingUser.name}</strong> perde o acesso ao sistema imediatamente.
                </p>
                <p style={{ fontSize: FS.meta, color: T.second, margin: 0, padding: "9px 12px", borderRadius: R.sm, backgroundColor: T.low, border: `1px solid ${T.border}`, fontFamily: FONT.mono, overflowWrap: "anywhere" }}>
                  {deletingUser.email} · {(ROLE_CFG[deletingUser.role] ?? ROLE_CFG.solicitacao).label}
                </p>
                {/* O QUE MUDA E O QUE FICA. Conferido no schema: patrocinadores
                    perdem o executivo (SET NULL); eventos criados, comentários
                    e fotos ficam, sem o vínculo; a trilha guarda o NOME como
                    texto, então os logs continuam dizendo quem fez. */}
                {(() => {
                  const contas = patrocinadores.filter(s => s.accountExecutiveId === deletingUser.id);
                  return (
                    <ul data-testid="delete-user-impacto" style={{ margin: 0, paddingLeft: 18, fontSize: FS.meta, lineHeight: 1.5, color: T.strong, display: "flex", flexDirection: "column", gap: 3 }}>
                      {contas.length > 0 && (
                        <li style={{ color: TOM.alerta.text, fontWeight: FW.medio }}>
                          É executivo de {contas.length === 1 ? "1 patrocinador" : `${contas.length} patrocinadores`} ({contas.slice(0, 3).map(s => s.name).join(", ")}{contas.length > 3 ? "…" : ""}) — {contas.length === 1 ? "ele fica" : "eles ficam"} sem executivo.
                        </li>
                      )}
                      <li>Eventos, peças e comentários que a pessoa criou continuam no sistema.</li>
                      <li>Os Logs do Sistema continuam mostrando o nome dela nas ações que fez.</li>
                    </ul>
                  );
                })()}
              </div>
              {/* Excluir é o cheio (vermelho); recuar é o discreto abaixo —
                  o par de botões de toda confirmação da casa. */}
              <ModalFooter>
                <Botao
                  variante="perigo"
                  larguraCheia
                  data-testid="button-confirm-delete"
                  onClick={() => deleteMutation.mutate(deletingUser.id)}
                  carregando={deleteMutation.isPending}
                  style={{ minHeight: toque + 4, fontSize: FS.read }}>
                  {deleteMutation.isPending ? "Excluindo…" : "Sim, excluir"}
                </Botao>
                <Botao
                  variante="fantasma"
                  larguraCheia
                  data-testid="button-cancel-delete"
                  onClick={() => setDeletingUser(null)}
                  style={{ minHeight: toque }}>
                  Manter
                </Botao>
              </ModalFooter>
            </>
          )}
          </FreezeWhileClosing>
        </DialogContent>
      </Dialog>
      {dialogo}
    </div>
  );
}
