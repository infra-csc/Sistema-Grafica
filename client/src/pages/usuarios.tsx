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
import { format, formatDistanceToNowStrict } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  UserPlus, Pencil, Trash2, Search,
  ChevronLeft, ChevronRight, X, Check, ScrollText, ShieldOff, Users, Info, ShieldAlert, LogOut, AlertTriangle,
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
// "Cultura" é uma marca do Atendimento (30/09): mesmo verde do perfil, com
// borda — o selo diz "Atendimento, e também cria e edita eventos".
const CULTURA = { bg: TOM.sucesso.bg, text: TOM.sucesso.text, border: TOM.sucesso.border } as const;

// Rótulos completos para o <select> do formulário, derivados de ROLE_CFG para
// as opções nunca divergirem dos perfis reais.
const ROLE_FORM_LABELS: Record<string, string> = { admin: "Administrador" };

const userSchema = z.object({
  name:  z.string().min(1, "Escreva o nome da pessoa."),
  email: z.string().email("Confira o e-mail — ex.: nome@empresa.com.br."),
  role:  z.enum(["admin", "solicitacao", "arte", "grafica", "atendimento"], { required_error: "Selecione um perfil" }),
  // Usuário do Kit (14/09): só faz sentido no perfil Solicitação.
  kit:   z.boolean(),
  // Atendimento – Cultura (30/09): só faz sentido no perfil Atendimento.
  cultura: z.boolean(),
});
type UserForm = z.infer<typeof userSchema>;

/** Linha de GET /api/users (contrato em @shared/api — o usuário sem o hash). */
type User = UsuarioDaLista;

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join("");
}

const PAGE_SIZE = 10;

/** Iniciais na cor do perfil: a mancha que se acha na lista. */
function Avatar({ nome, cfg }: { nome: string; cfg: (typeof ROLE_CFG)[string] }) {
  return (
    <span aria-hidden="true" style={{
      width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
      backgroundColor: cfg.avatarBg, color: cfg.avatarColor,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: FS.small, fontWeight: FW.rotulo, letterSpacing: "0.02em",
    }}>
      {initials(nome)}
    </span>
  );
}

function SeloVoce() {
  return <span style={{ marginLeft: 8, fontSize: FS.micro, fontWeight: FW.forte, color: T.apoio, backgroundColor: T.low, border: `1px solid ${T.border}`, borderRadius: R.pill, padding: "1px 8px", verticalAlign: "1px" }}>você</span>;
}

/** O selo do perfil e as marcas (Cultura no Atendimento, Kit na Solicitação). */
function SelosDoPerfil({ user, semTestId = false }: { user: User; semTestId?: boolean }) {
  const cfg = ROLE_CFG[user.role] || ROLE_CFG.solicitacao;
  return (
    <>
      <Selo tamanho="sm" cores={{ bg: cfg.bg, text: cfg.color, border: cfg.bg }}>
        {cfg.label}
      </Selo>
      {user.cultura && user.role === "atendimento" && (
        <Selo tamanho="sm" cores={CULTURA} data-testid={semTestId ? undefined : `badge-cultura-${user.id}`}>
          Cultura
          <span className="sr-only"> — também cria e edita eventos</span>
        </Selo>
      )}
      {user.kit && (
        <Selo tamanho="sm" cores={KIT} data-testid={semTestId ? undefined : `badge-kit-${user.id}`}>
          Kit
          {/* O que "Kit" quer dizer ia só no `title`: no tablet não há hover
              e o leitor de tela não o lê num <span>. É texto, escondido só
              visualmente. */}
          <span className="sr-only"> — só vê e cria peças do Kit, e só as dele</span>
        </Selo>
      )}
    </>
  );
}

/**
 * SITUAÇÃO DO ACESSO. "Ativo" em todas as linhas não respondia a pergunta de
 * quem acabou de cadastrar alguém: "ela já conseguiu entrar?". O carimbo
 * `lastLoginAt` já vinha na lista (só o login o grava — shared/schema.ts) e
 * não aparecia em lugar nenhum. Agora a linha diz quando foi o último acesso,
 * ou que a pessoa ainda não entrou. Só leitura: nada muda na conta.
 */
function AcessoDoUsuario({ user, emLinha = false }: { user: User; emLinha?: boolean }) {
  if (user.mustChangePassword) return <Selo tamanho="sm" tom="alerta" forma="retangulo">Trocar senha</Selo>;
  const ultimo = user.lastLoginAt ? new Date(user.lastLoginAt) : null;
  const valido = ultimo && !Number.isNaN(ultimo.getTime());
  const detalhe = valido
    ? `entrou ${formatDistanceToNowStrict(ultimo!, { locale: ptBR, addSuffix: true })}`
    : "ainda não entrou";
  return (
    <span data-testid={`acesso-${user.id}`}
      title={valido ? `Último acesso em ${format(ultimo!, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}` : "A pessoa ainda não entrou pelo portal NORTE"}
      style={{ display: "inline-flex", flexDirection: emLinha ? "row" : "column", alignItems: emLinha ? "center" : "flex-start", gap: emLinha ? 6 : 1, minWidth: 0 }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: "50%", flexShrink: 0, backgroundColor: valido ? TOM.sucesso.dot : "transparent", border: valido ? "none" : `1.5px solid ${T.muted}` }} />
        <span style={{ fontSize: FS.meta, fontWeight: FW.medio, color: T.strong }}>Ativo</span>
      </span>
      <span style={{ fontSize: FS.small, color: T.second, paddingLeft: emLinha ? 0 : 13 }}>{emLinha ? "· " : ""}{detalhe}</span>
    </span>
  );
}

/* ── Titanium Input ── */
const tiInput: React.CSSProperties = {
  width: "100%", minHeight: 44, padding: "10px 14px",
  backgroundColor: N.n3, border: "none", borderRadius: R.md,
  fontSize: FS.body, color: T.text,
  transition: "background-color 0.15s ease, box-shadow 0.15s ease",
};

// Título de bloco do formulário: caixa normal, para não competir com o
// rótulo de campo (caixa alta, micro).
const TITULO_SECAO: React.CSSProperties = { margin: 0, fontSize: FS.read, fontWeight: FW.forte, color: T.text, fontFamily: FONT.display, letterSpacing: "-0.01em" };

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
    defaultValues: { name: "", email: "", role: "solicitacao", kit: false, cultura: false },
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
        form.reset({ name: "", email: "", role: herda ? vars.role : "solicitacao", kit: herda ? vars.kit : false, cultura: herda ? vars.cultura : false });
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
      const derrubouSessao = vars.update.role !== undefined || vars.update.kit !== undefined || vars.update.cultura !== undefined;
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
    form.reset({ name: "", email: "", role: "solicitacao", kit: false, cultura: false });
    setModalOpen(true);
  };

  const openEdit = (u: User) => {
    setEditingUser(u);
    // O perfil gravado é um dos cinco (o servidor valida na escrita).
    form.reset({ name: u.name, email: u.email, role: u.role as UserForm["role"], kit: !!u.kit, cultura: !!u.cultura });
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
    form.reset({ name: "", email: "", role: "solicitacao", kit: false, cultura: false });
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
      const cultura = data.role === "atendimento" && data.cultura;
      if (cultura !== !!editingUser.cultura) update.cultura = cultura;
      updateMutation.mutate({ id: editingUser.id, update });
    } else {
      createMutation.mutate({ ...data, kit: data.role === "solicitacao" && data.kit, cultura: data.role === "atendimento" && data.cultura });
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
          className="usu-acao"
          title="Editar usuário"
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
          className="usu-acao"
          title="Ver nos Logs o que esta pessoa fez"
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
            className="usu-acao usu-acao-perigo"
            title="Excluir usuário"
            onClick={() => setDeletingUser(user)}
            aria-label={`Excluir usuário ${user.name}`}
            style={iconeBtn}
          />
        )}
      </>
    );
  };

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

      {/* ── Barra de recorte ──
          UMA linha para "quem eu quero ver": a busca e os perfis. Antes eram
          duas fileiras e dois controles para a MESMA dimensão — os chips de
          perfil em cima e um menu "Perfil" embaixo, que fazia exatamente o
          mesmo filtro — e o total aparecia três vezes (subtítulo, "usuários
          totais" e "resultados"). Agora os chips SÃO o filtro, com "Todos" e a
          contagem de cada perfil já recortada pela busca. */}
      <div className="usu-barra" style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: isMobile ? "1 1 100%" : "0 1 280px", minWidth: isMobile ? 0 : 200 }}>
          <Search aria-hidden="true" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: T.muted }} />
          <input
            value={search} onChange={e => atualizar({ busca: e.target.value, pagina: 1 })}
            placeholder="Buscar por nome ou e-mail..."
            aria-label="Buscar usuário por nome ou e-mail"
            type="search"
            data-testid="input-search-users"
            className="usu-campo"
            style={{ ...tiInput, height: alvo(40, ponteiroGrosso || isMobile), padding: "0 12px 0 36px", borderRadius: R.md, width: "100%", fontSize: isMobile ? FS.lead : FS.body }}
          />
        </div>
        <div role="group" aria-label="Filtrar por perfil" data-testid="select-role-filter"
          // No celular, UMA fileira que rola de lado (sangrando até a borda), em
          // vez de três linhas de chips empurrando a lista para baixo.
          className={isMobile ? "usu-chips-rolam" : undefined}
          style={isMobile
            ? { display: "flex", gap: 6, flexWrap: "nowrap", alignItems: "center", flex: "0 0 calc(100% + 32px)", overflowX: "auto", margin: "0 -16px", padding: "2px 16px 4px", scrollbarWidth: "none" }
            : { display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", flex: "0 1 auto" }}>
          {[{ role: "all", label: "Todos", n: users.filter(casaBusca).length, cfg: null as null | (typeof ROLE_CFG)[string] },
            ...Object.entries(ROLE_CFG).map(([role, cfg]) => ({ role, label: cfg.label, n: users.filter(u => u.role === role && casaBusca(u)).length, cfg }))]
            .map(({ role, label, n, cfg }) => {
              const ativo = roleFilter === role;
              return (
                // Alternador: aria-pressed diz ao leitor de tela o que a cor diz.
                <button
                  key={role}
                  type="button"
                  className="ds-botao usu-chip"
                  data-testid={`chip-perfil-${role}`}
                  onClick={() => atualizar({ perfil: ativo && role !== "all" ? "all" : role, pagina: 1 })}
                  aria-pressed={ativo}
                  title={role === "all" ? "Mostrar todos os perfis" : ativo ? "Mostrar todos os perfis" : `Mostrar só ${label}`}
                  style={{
                    minHeight: alvo(32, ponteiroGrosso || isMobile), padding: "0 12px", borderRadius: R.pill,
                    backgroundColor: ativo ? (cfg ? cfg.bg : T.dark) : T.surface,
                    border: `1px solid ${ativo ? (cfg ? cfg.color + "55" : T.dark) : T.border}`,
                    color: ativo ? (cfg ? cfg.color : T.surface) : T.apoio,
                    fontSize: FS.small, fontWeight: FW.forte, cursor: "pointer",
                    display: "inline-flex", alignItems: "center", gap: 7, flexShrink: 0, whiteSpace: "nowrap",
                    opacity: n === 0 && !ativo ? 0.55 : 1,
                  }}
                >
                  {cfg && <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: cfg.color, flexShrink: 0 }} />}
                  {label}
                  <span style={{ fontFamily: FONT.mono, fontWeight: FW.medio, opacity: ativo ? 0.85 : 1, color: ativo ? "inherit" : T.second }}>{n}</span>
                </button>
              );
            })}
        </div>
        {(search || roleFilter !== "all") && (
          // N = quantos filtros o botão desfaz — o mesmo "Limpar (N)" de
          // Patrocinadores, Logs e Modelos.
          <Botao variante="secundario" tamanho={ponteiroGrosso || isMobile ? "toque" : "md"} icone={X} onClick={limparFiltros}>
            Limpar ({(search ? 1 : 0) + (roleFilter !== "all" ? 1 : 0)})
          </Botao>
        )}
      </div>
      {/* ── Table ── */}
      {/* Sem lista (erro, vazio, sem resultado), a caixa some: o estado da casa já
          tem a própria moldura tracejada — eram duas bordas uma dentro da outra. */}
      <section ref={listaRef} style={(() => {
        const soEstado = !isLoading && (isError || filtered.length === 0);
        return { backgroundColor: soEstado ? "transparent" : T.surface, border: soEstado ? "none" : `1px solid ${T.border}`, borderRadius: R.lg, overflow: "hidden", marginBottom: 20 };
      })()}>
        {isLoading ? (
          // Esqueleto com a silhueta do que vem (cartões ou tabela): a lista
          // "chega" no lugar em que vai ficar, em vez de um texto que some.
          <div style={{ padding: 12 }}>
            <Esqueleto variante={cards ? "lista" : "tabela"} linhas={5} rotulo="Carregando usuários" />
          </div>
        ) : isError ? (
          <div>
            <EstadoErro
              compacto
              titulo="Não foi possível carregar os usuários"
              detalhe="Verifique sua conexão e tente novamente."
              aoTentarDeNovo={() => refetch()}
            />
          </div>
        ) : filtered.length === 0 ? (
          <div>
            {users.length === 0 ? (
              <EstadoVazio
                compacto
                icone={Users}
                titulo="Ninguém com acesso ainda"
                descricao="Cadastre a pessoa com o e-mail da conta Microsoft e escolha o perfil — ela entra pelo portal NORTE."
                acao={<Botao variante="primario" icone={UserPlus} onClick={openCreate}>Cadastrar o primeiro</Botao>}
              />
            ) : (
              <EstadoVazio
                compacto
                icone={Search}
                titulo="Nenhum usuário encontrado"
                descricao={search && roleFilter !== "all"
                  ? `Ninguém com “${search}” no perfil ${ROLE_CFG[roleFilter]?.label ?? ""}.`
                  : search
                  ? `Ninguém com “${search}” no nome ou no e-mail.`
                  : `Nenhum usuário com o perfil ${ROLE_CFG[roleFilter]?.label ?? ""}.`}
                acao={<Botao variante="secundario" icone={X} onClick={limparFiltros}>{search && roleFilter !== "all" ? "Limpar busca e perfil" : search ? "Limpar busca" : "Mostrar todos os perfis"}</Botao>}
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
                  <li key={user.id} data-testid={`row-user-${user.id}`} className="usu-cartao"
                    style={{ padding: "14px 16px", borderBottom: `1px solid ${N.n3}`, display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 12, minWidth: 0 }}>
                      <Avatar nome={user.name} cfg={cfg} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: FS.read, fontWeight: FW.forte, color: T.text, overflowWrap: "anywhere", lineHeight: 1.3 }}>
                          {user.name}
                          {me?.id === user.id && <SeloVoce />}
                        </div>
                        {/* E-MAIL INTEIRO, quebrando onde precisar: é por ele
                            que a pessoa entra (SSO) e é o que se confere. */}
                        <div style={{ fontSize: FS.meta, color: T.apoio, overflowWrap: "anywhere", lineHeight: 1.35, marginTop: 1 }}>{user.email}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                          <SelosDoPerfil user={user} />
                        </div>
                        {/* O acesso na largura do texto, não espremido ao lado
                            dos três botões: "ainda não entrou" quebrava em duas. */}
                        <div style={{ marginTop: 8 }}><AcessoDoUsuario user={user} emLinha /></div>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, paddingLeft: 48 }}>
                      <span style={{ fontSize: FS.small, color: T.second }}>
                        Criado em {format(new Date(user.createdAt), "dd/MM/yyyy", { locale: ptBR })}
                      </span>
                      <div style={{ display: "flex", gap: 2, flexShrink: 0, marginRight: -6 }}>{acoesDoUsuario(user)}</div>
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
                        padding: i === 0 ? "11px 16px 11px 20px" : "11px 16px", fontSize: FS.micro, fontWeight: FW.rotulo,
                        color: T.second, textTransform: "uppercase", letterSpacing: "0.14em", whiteSpace: "nowrap",
                        textAlign: i === todas.length - 1 ? "right" : "left",
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginated.map(user => {
                    const cfg = ROLE_CFG[user.role] || ROLE_CFG.solicitacao;
                    return (
                      <tr key={user.id}
                        data-testid={`row-user-${user.id}`}
                        // Realce da linha pela classe, não por handler.
                        className="usu-linha"
                        style={{ borderBottom: `1px solid ${N.n3}` }}
                      >
                        {/* Nome + avatar */}
                        <td style={{ padding: "13px 16px 13px 20px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <Avatar nome={user.name} cfg={cfg} />
                            <div style={{ minWidth: 0 }}>
                              <span style={{ fontSize: FS.body, fontWeight: FW.forte, color: T.text }}>{user.name}</span>
                              {/* A própria linha não tem lixeira (o servidor
                                  bloqueia a auto-exclusão); sem o "você", a
                                  ausência do botão parecia defeito. */}
                              {me?.id === user.id && <SeloVoce />}
                              {compacto && (
                                <div style={{ fontSize: FS.small, color: T.second, marginTop: 2 }}>
                                  Criado em {format(new Date(user.createdAt), "dd/MM/yyyy", { locale: ptBR })}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Email */}
                        <td style={{ padding: "13px 16px", fontSize: FS.body, color: T.apoio, overflowWrap: "anywhere" }}>{user.email}</td>

                        {/* Perfil + marcas (Cultura, Kit) */}
                        <td style={{ padding: "13px 16px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                            <SelosDoPerfil user={user} />
                          </div>
                        </td>

                        {/* Acesso */}
                        <td style={{ padding: "13px 16px", whiteSpace: "nowrap" }}>
                          <AcessoDoUsuario user={user} />
                        </td>

                        {/* Criado em */}
                        {!compacto && (
                          <td style={{ padding: "13px 16px", fontSize: FS.body, color: T.second, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                            {format(new Date(user.createdAt), "dd/MM/yyyy", { locale: ptBR })}
                          </td>
                        )}

                        {/* Ações */}
                        <td style={{ padding: "9px 14px 9px 8px", textAlign: "right" }}>
                          <div style={{ display: "flex", justifyContent: "flex-end", gap: 2 }}>
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

            {/* Rodapé da lista: quantos e de quantos — o único contador da
                tela além do subtítulo (antes eram quatro). */}
            <div style={{ padding: "10px 20px", borderTop: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, backgroundColor: T.low }}>
              <p style={{ fontSize: FS.small, color: T.second, fontWeight: FW.medio, margin: 0 }}>
                Exibindo {Math.min((safePage - 1) * PAGE_SIZE + 1, filtered.length)}–{Math.min(safePage * PAGE_SIZE, filtered.length)} de {filtered.length} usuário{filtered.length !== 1 ? "s" : ""}
                {filtered.length !== users.length && <span style={{ fontWeight: FW.corpo }}> · {users.length} no total</span>}
              </p>
              <Paginacao pagina={safePage} totalPaginas={totalPages} onIr={setPage} toque={toque} />
            </div>
          </>
        )}
      </section>

      {/* ── Trilha de operações ── */}
      {/* O card "Nível de Segurança" foi REMOVIDO: ele media a fração de
          usuários sem mustChangePassword, mas o cadastro atual é SSO-only e
          sempre grava mustChangePassword=false — o "health score" era 100%
          por construção (e virava "100% seguro" até quando a query falhava).
          Se um fluxo com senha provisória voltar, o card pode voltar com ele. */}
      {/* Era um cartão preto de 200px com um brilho laranja desfocado e uma
          pilha de avatares decorativos — o elemento mais pesado da tela para
          um atalho secundário. Agora é uma faixa clara, do tamanho do que
          oferece: o que é a trilha e o botão que a abre. */}
      <aside data-testid="painel-trilha" style={{ display: "flex", alignItems: "center", gap: "12px 16px", flexWrap: "wrap", padding: isMobile ? "16px" : "16px 20px", backgroundColor: T.surface, border: `1px solid ${T.border}`, borderRadius: R.lg }}>
        <span aria-hidden="true" style={{ width: 36, height: 36, borderRadius: R.md, backgroundColor: T.low, border: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <ScrollText style={{ width: 17, height: 17, color: T.apoio }} />
        </span>
        <div style={{ flex: "1 1 260px", minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: FS.read, fontWeight: FW.forte, color: T.text, fontFamily: FONT.display, letterSpacing: "-0.01em" }}>Trilha de operações</h2>
          {/* O texto antigo prometia "atividade e status de segurança em tempo
              real". A faixa diz o que o botão entrega: a trilha de operações. */}
          <p style={{ margin: "2px 0 0", fontSize: FS.meta, lineHeight: 1.45, color: T.second }}>
            Quem criou, alterou, aprovou ou excluiu cada registro. Para ver o que uma pessoa fez, use o ícone <ScrollText role="img" aria-label="de logs" style={{ display: "inline-block", width: 13, height: 13, verticalAlign: "-2px", color: T.apoio }} /> na linha dela.
          </p>
        </div>
        <Botao
          variante="secundario"
          tamanho={ponteiroGrosso || isMobile ? "toque" : "md"}
          larguraCheia={isMobile}
          onClick={() => navigate("/logs-sistema")}
          data-testid="button-ver-logs"
        >
          Ver Logs
        </Botao>
      </aside>
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
          style={modalSurface(640)}
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
                  chegam ao submit pelo atributo `form`.
                  DOIS BLOCOS: quem é a pessoa (nome e e-mail, lado a lado) e o
                  que ela recebe (perfil, o quadro do que ele concede e as
                  marcas). Antes o quadro do perfil se espremia numa coluna de
                  meia largura ao lado do e-mail — 300px de texto quebrado, com
                  a coluna da esquerda vazia embaixo. */}
              <form id="user-form" noValidate onSubmit={form.handleSubmit(onSubmit, () => { continuarRef.current = false; })} style={{ padding: isMobile ? "18px 16px 22px" : "22px 28px 26px", display: "flex", flexDirection: "column", gap: 20, overflowY: "auto", flex: "1 1 auto", minHeight: 0 }}>

                {/* "SALVOU?" dentro do modal que não fechou: com "Salvar e
                    cadastrar outro" o formulário volta vazio, e só o toast
                    (que some) dizia que o anterior entrou. A lista fica à
                    vista enquanto a sequência durar. */}
                {!editingUser && criadosNestaSequencia.length > 0 && (
                  <p role="status" data-testid="usuarios-criados-na-sequencia" className="usu-aviso" style={{ margin: 0, display: "flex", gap: 8, alignItems: "flex-start", padding: "10px 12px", borderRadius: R.md, backgroundColor: TOM.sucesso.bg, border: `1px solid ${TOM.sucesso.border}`, fontSize: FS.meta, lineHeight: 1.45, color: TOM.sucesso.text }}>
                    <Check aria-hidden="true" style={{ width: 14, height: 14, flexShrink: 0, marginTop: 2 }} />
                    <span>
                      {criadosNestaSequencia.length === 1 ? "1 usuário criado" : `${criadosNestaSequencia.length} usuários criados`} nesta sequência: {criadosNestaSequencia.join(", ")}.
                      {perfilHerdado ? " O perfil ficou como no anterior — confira antes de salvar o próximo." : " Preencha o próximo."}
                    </span>
                  </p>
                )}

                {/* ── 1 · A pessoa ── */}
                <section aria-labelledby="usu-sec-pessoa" style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: isMobile ? 18 : "16px", alignItems: "start" }}>
                  <h3 id="usu-sec-pessoa" style={{ ...TITULO_SECAO, gridColumn: "1 / -1" }}>A pessoa</h3>
                  <FormField control={form.control} name="name" render={({ field }) => (
                    <FormItem>
                      <label htmlFor="user-form-name" style={ROTULO_CAMPO}>Nome completo</label>
                      <FormControl>
                        <input {...field} id="user-form-name" placeholder="Ex.: Roberto Carlos" data-testid="input-name" autoComplete="off"
                          className="usu-campo"
                          style={{ ...tiInput, fontSize: isMobile ? FS.lead : FS.body }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="email" render={({ field }) => (
                    <FormItem>
                      <label htmlFor="user-form-email" style={ROTULO_CAMPO}>E-mail</label>
                      <FormControl>
                        <input {...field} id="user-form-email" type="email" placeholder="nome@empresa.com.br" data-testid="input-email" autoComplete="off"
                          className="usu-campo"
                          style={{ ...tiInput, fontSize: isMobile ? FS.lead : FS.body }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  {/* COMO A PESSOA ENTRA. "Ela vai receber senha?" era a dúvida
                      do primeiro cadastro, e nada respondia. Não há senha nem
                      convite: o login é o SSO do portal NORTE, que procura este
                      e-mail EXATAMENTE como gravado (server/index.ts, `WHERE
                      email = $1`) — por isso o "igual". Na linha inteira: vale
                      para o par nome + e-mail. */}
                  <p style={{ gridColumn: "1 / -1", margin: "-4px 0 0", display: "flex", gap: 8, alignItems: "flex-start", fontSize: FS.small, lineHeight: 1.45, color: T.apoio }}>
                    <Info aria-hidden="true" style={{ width: 14, height: 14, flexShrink: 0, marginTop: 1, color: T.second }} />
                    <span>O e-mail tem de ser igual ao da conta Microsoft. Não há senha nem convite por e-mail: avise a pessoa para entrar pelo portal NORTE.</span>
                  </p>
                </section>

                {/* ── 2 · O acesso ── */}
                <section aria-labelledby="usu-sec-acesso" style={{ borderTop: `1px solid ${T.border}`, paddingTop: 16, display: "flex", flexDirection: "column", gap: 14 }}>
                  <h3 id="usu-sec-acesso" style={TITULO_SECAO}>O que a pessoa vê e faz</h3>
                  <FormField control={form.control} name="role" render={({ field }) => (
                    <FormItem>
                      <label htmlFor="user-form-role" style={ROTULO_CAMPO}>Perfil</label>
                      <div style={{ maxWidth: isMobile ? "none" : 320 }}>
                        <FormControl>
                          {/* kind="field": campo de formulário, não filtro (ver o
                              vocabulário em components/filter-select.tsx). O
                              menu é o da casa, não o do sistema operacional. */}
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
                            triggerStyle={{ ...tiInput, height: 44, padding: "0 14px", border: "none" }}
                          />
                        </FormControl>
                      </div>
                      <FormMessage />
                      {/* HERDADO, DITO NO CAMPO. "Cadastrar outro" mantém o
                          perfil do anterior; sem este aviso o próximo usuário
                          saía com o perfil de outra pessoa sem ninguém notar.
                          Some quando a pessoa troca o perfil. */}
                      {!editingUser && perfilHerdado && field.value === perfilHerdado && (
                        <p role="status" data-testid="aviso-perfil-herdado" className="usu-aviso" style={{ margin: "8px 0 0", padding: "7px 10px", borderRadius: R.sm, backgroundColor: TOM.alerta.bg, border: `1px solid ${TOM.alerta.border}`, fontSize: FS.small, fontWeight: FW.forte, lineHeight: 1.4, color: TOM.alerta.text }}>
                          Perfil mantido do cadastro anterior — confira antes de salvar.
                        </p>
                      )}

                      {/* O QUE ESTE PERFIL CONCEDE. Muda com a escolha, e o
                          Admin tem tratamento próprio: é o único que não tem
                          uma linha de "não faz", e quem está entregando esse
                          perfil precisa ler isso antes de salvar. Na largura
                          inteira, as quatro linhas viram uma grade 2 × 2: o que
                          faz em cima, o que não faz embaixo. */}
                      {(() => {
                        // Atendimento – Cultura (30/09): a linha "Não cria nem exclui
                        // eventos" vira o que a marca concede — sem ela o bloco
                        // desmentia a caixa marcada logo abaixo.
                        const cultura = field.value === "atendimento" && form.watch("cultura");
                        const linhas = (PERMISSOES[field.value] ?? []).map((l) =>
                          cultura && l.texto === "Não cria nem exclui eventos"
                            // POST /api/events e PATCH /api/events/:id aceitam a marca (podeGerirEvento).
                            ? { pode: true, texto: "Cria e edita eventos (Cultura) — não exclui nem encerra, e não mexe nas peças" }
                            : l)
                          // O que FAZ primeiro: com a marca Cultura uma linha de "não" vira "sim" e
                          // ficava no meio dos "não" — a grade lê sim em cima, não embaixo.
                          .sort((a, b) => Number(b.pode) - Number(a.pode));
                        if (linhas.length === 0) return null;
                        const ehAdmin = field.value === "admin";
                        return (
                          <div data-testid="bloco-permissoes" key={field.value} className="usu-quadro"
                            style={{
                              marginTop: 12, padding: isMobile ? "12px 14px" : "14px 16px", borderRadius: R.md,
                              backgroundColor: ehAdmin ? TOM.perigo.bg : T.bg,
                              border: `1px solid ${ehAdmin ? TOM.perigo.border : T.border}`,
                            }}>
                            {/* perigo.text sobre perigo.bg = 6,1:1 · apoio (n8) sobre n1 = 7,1:1 */}
                            <p style={{
                              margin: "0 0 10px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
                              fontSize: FS.micro, fontWeight: FW.rotulo,
                              textTransform: "uppercase", letterSpacing: "0.12em",
                              color: ehAdmin ? TOM.perigo.text : T.apoio,
                            }}>
                              O que este perfil concede
                              <Selo tamanho="sm" cores={{ bg: (ROLE_CFG[field.value] ?? ROLE_CFG.solicitacao).bg, text: (ROLE_CFG[field.value] ?? ROLE_CFG.solicitacao).color, border: (ROLE_CFG[field.value] ?? ROLE_CFG.solicitacao).bg }}>
                                {(ROLE_CFG[field.value] ?? ROLE_CFG.solicitacao).label}
                              </Selo>
                            </p>
                            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "8px 20px" }}>
                              {linhas.map((l) => (
                                <li key={l.texto} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                                  {/* sucesso.text = 4,8:1 e perigo.text = 6,3:1 sobre n1 */}
                                  <span aria-hidden="true" style={{ width: 18, height: 18, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: l.pode ? TOM.sucesso.bg : TOM.perigo.bg, border: `1px solid ${l.pode ? TOM.sucesso.border : TOM.perigo.border}` }}>
                                    {l.pode
                                      ? <Check style={{ width: 11, height: 11, color: TOM.sucesso.text }} />
                                      : <X style={{ width: 11, height: 11, color: TOM.perigo.text }} />}
                                  </span>
                                  <span style={{ fontSize: FS.meta, lineHeight: 1.45, color: T.strong }}>
                                    <span className="sr-only">{l.pode ? "Pode: " : "Não pode: "}</span>
                                    {l.texto}
                                  </span>
                                </li>
                              ))}
                            </ul>
                            {ehAdmin && (
                              <p style={{ margin: "10px 0 0", display: "flex", gap: 8, alignItems: "flex-start", fontSize: FS.small, fontWeight: FW.forte, color: TOM.perigo.text, lineHeight: 1.4 }}>
                                <ShieldAlert aria-hidden="true" style={{ width: 14, height: 14, flexShrink: 0, marginTop: 1 }} />
                                Perfil sem restrição: pode excluir dados e conceder acesso a outras pessoas.
                              </p>
                            )}
                            {/* O QUE APARECE NO MENU — "poder fazer" não diz
                                "onde clicar". strong (n9) sobre n1/perigo.bg ≥ 9:1. */}
                            {TELAS_NO_MENU[field.value] && (
                              <p data-testid="bloco-telas-do-perfil" style={{ margin: "12px 0 0", paddingTop: 10, borderTop: `1px solid ${ehAdmin ? TOM.perigo.border : T.border}`, fontSize: FS.small, lineHeight: 1.5, color: T.strong }}>
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

                  {/* USUÁRIO DO KIT (14/09): só no perfil Solicitação. */}
                  {form.watch("role") === "solicitacao" && (
                    <FormField control={form.control} name="kit" render={({ field }) => (
                      <FormItem>
                        <label htmlFor="user-form-kit" className="usu-marca usu-aviso" style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "12px 14px", borderRadius: R.md, border: `1px solid ${field.value ? KIT.border : T.border}`, backgroundColor: field.value ? KIT.bg : T.surface, cursor: "pointer" }}>
                          <input id="user-form-kit" type="checkbox" data-testid="checkbox-user-kit"
                            checked={field.value} onChange={(e) => field.onChange(e.target.checked)}
                            style={{ width: 18, height: 18, marginTop: 1, accentColor: KIT.text, flexShrink: 0 }} />
                          <span>
                            <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: FS.body, fontWeight: FW.rotulo, color: T.text }}>
                              Usuário do Kit
                              <Selo tamanho="sm" cores={KIT}>Kit</Selo>
                            </span>
                            <span style={{ display: "block", fontSize: FS.meta, color: T.apoio, lineHeight: 1.45, marginTop: 3 }}>
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

                  {/* ATENDIMENTO – CULTURA (30/09): só no perfil Atendimento. */}
                  {form.watch("role") === "atendimento" && (
                    <FormField control={form.control} name="cultura" render={({ field }) => (
                      <FormItem>
                        <label htmlFor="user-form-cultura" className="usu-marca usu-aviso" style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "12px 14px", borderRadius: R.md, border: `1px solid ${field.value ? CULTURA.border : T.border}`, backgroundColor: field.value ? CULTURA.bg : T.surface, cursor: "pointer" }}>
                          <input id="user-form-cultura" type="checkbox" data-testid="checkbox-user-cultura"
                            checked={field.value} onChange={(e) => field.onChange(e.target.checked)}
                            style={{ width: 18, height: 18, marginTop: 1, accentColor: CULTURA.text, flexShrink: 0 }} />
                          <span>
                            <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: FS.body, fontWeight: FW.rotulo, color: T.text }}>
                              Atendimento – Cultura
                              <Selo tamanho="sm" cores={CULTURA}>Cultura</Selo>
                            </span>
                            <span style={{ display: "block", fontSize: FS.meta, color: T.apoio, lineHeight: 1.45, marginTop: 3 }}>
                              Tudo do Atendimento e, além disso, cria e edita eventos. As peças do evento continuam com a Solicitação; excluir e encerrar evento, com o admin.
                            </span>
                          </span>
                        </label>
                      </FormItem>
                    )} />
                  )}

                  {/* "MUDAR O PERFIL DESLOGA A PESSOA?" — sim, e ninguém dizia.
                      O PATCH /api/users/:id apaga as sessões dela quando muda
                      `role`, `kit` ou `cultura` (server/routes/auth.ts); o
                      aviso aparece só quando um deles mudou de verdade, e não
                      para a própria conta (esse caso já tem a confirmação do
                      onSubmit). */}
                  {(() => {
                    if (!editingUser || me?.id === editingUser.id) return null;
                    const papel = form.watch("role");
                    const kitAgora = papel === "solicitacao" && form.watch("kit");
                    const culturaAgora = papel === "atendimento" && form.watch("cultura");
                    if (papel === editingUser.role && kitAgora === !!editingUser.kit && culturaAgora === !!editingUser.cultura) return null;
                    return (
                      <p role="status" data-testid="aviso-sessao-encerrada" className="usu-aviso" style={{ margin: 0, display: "flex", gap: 8, alignItems: "flex-start", padding: "10px 12px", borderRadius: R.md, backgroundColor: TOM.alerta.bg, border: `1px solid ${TOM.alerta.border}`, fontSize: FS.meta, lineHeight: 1.45, color: TOM.alerta.text }}>
                        <LogOut aria-hidden="true" style={{ width: 14, height: 14, flexShrink: 0, marginTop: 2 }} />
                        <span>Ao salvar, <strong>{editingUser.name}</strong> é desconectado e precisa entrar de novo pelo portal — já com o novo perfil.</span>
                      </p>
                    );
                  })()}
                </section>

              </form>
            </Form>

            {/* RODAPÉ DA CASA PARA FORMULÁRIO (o de Adicionar peça, Evento e
                Modelos): no computador, uma linha — o atalho à esquerda e as
                ações à direita, o primário por último; no celular, empilhado
                com o primário em cima, cheio, ao alcance do polegar. Antes
                eram três botões de largura cheia empilhados também no
                computador, roubando 180px do formulário. */}
            <ModalFooter
              fundo={T.bg}
              style={isMobile
                ? { flexDirection: "column", gap: 8, padding: "12px 16px calc(12px + env(safe-area-inset-bottom))" }
                : { flexDirection: "row-reverse", justifyContent: "flex-start", alignItems: "center", gap: 10, padding: "14px 28px" }}
            >
              <Botao type="submit" form="user-form"
                variante="primario"
                tamanho="toque"
                larguraCheia={isMobile}
                icone={editingUser ? Check : UserPlus}
                data-testid="button-save-user"
                carregando={createMutation.isPending || updateMutation.isPending}
                style={isMobile ? undefined : { minWidth: 160, padding: "0 20px" }}
                onClick={() => { continuarRef.current = false; }}>
                {createMutation.isPending || updateMutation.isPending ? "Salvando…" : editingUser ? "Salvar alterações" : "Criar usuário"}
              </Botao>
              {/* Secundário (contorno) e só na criação: editar é um de cada
                  vez. Mesmo submit do formulário — só não fecha o modal. */}
              {!editingUser && (
                <Botao type="submit" form="user-form"
                  variante="secundario"
                  tamanho="toque"
                  larguraCheia={isMobile}
                  data-testid="button-save-user-e-outro"
                  disabled={createMutation.isPending}
                  onClick={() => { continuarRef.current = true; }}>
                  Criar e cadastrar outro
                </Botao>
              )}
              {/* Depois de criar alguém na sequência, "Cancelar" sugeria
                  desfazer quem já entrou — e não desfaz. */}
              <Botao variante="fantasma" tamanho="toque" larguraCheia={isMobile} onClick={requestClose}
                data-testid="button-cancel">
                {criadosNestaSequencia.length > 0 && !editingUser ? "Fechar" : "Cancelar"}
              </Botao>
              {!isMobile && (
                <span aria-hidden="true" style={{ marginRight: "auto", fontSize: FS.meta, color: T.second, display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <kbd style={{ fontFamily: FONT.mono, fontSize: FS.small, padding: "1px 6px", borderRadius: R.sm, border: `1px solid ${T.border}`, backgroundColor: T.surface, color: T.apoio }}>Enter</kbd>
                  salva
                </span>
              )}
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
                {/* QUEM, sem dúvida: o mesmo avatar, e-mail e selos da lista —
                    era uma linha mono "email · Perfil" que lia como código. */}
                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: R.md, backgroundColor: T.low, border: `1px solid ${T.border}` }}>
                  <Avatar nome={deletingUser.name} cfg={ROLE_CFG[deletingUser.role] ?? ROLE_CFG.solicitacao} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: FS.meta, color: T.apoio, overflowWrap: "anywhere" }}>{deletingUser.email}</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 5 }}><SelosDoPerfil user={deletingUser} semTestId /></div>
                  </div>
                </div>
                {/* O QUE MUDA E O QUE FICA. Conferido no schema: patrocinadores
                    perdem o executivo (SET NULL); eventos criados, comentários
                    e fotos ficam, sem o vínculo; a trilha guarda o NOME como
                    texto, então os logs continuam dizendo quem fez. */}
                {(() => {
                  const contas = patrocinadores.filter(s => s.accountExecutiveId === deletingUser.id);
                  return (
                    <ul data-testid="delete-user-impacto" style={{ margin: 0, padding: 0, listStyle: "none", fontSize: FS.meta, lineHeight: 1.5, color: T.strong, display: "flex", flexDirection: "column", gap: 6 }}>
                      {contas.length > 0 && (
                        <li style={{ display: "flex", gap: 8, alignItems: "flex-start", color: TOM.alerta.text, fontWeight: FW.medio }}>
                          <AlertTriangle aria-hidden="true" style={{ width: 14, height: 14, flexShrink: 0, marginTop: 2 }} />
                          <span>É executivo de {contas.length === 1 ? "1 patrocinador" : `${contas.length} patrocinadores`} ({contas.slice(0, 3).map(s => s.name).join(", ")}{contas.length > 3 ? "…" : ""}) — {contas.length === 1 ? "ele fica" : "eles ficam"} sem executivo.</span>
                        </li>
                      )}
                      <li style={{ display: "flex", gap: 8, alignItems: "flex-start" }}><Check aria-hidden="true" style={{ width: 14, height: 14, flexShrink: 0, marginTop: 2, color: T.second }} /><span>Eventos, peças e comentários que a pessoa criou continuam no sistema.</span></li>
                      <li style={{ display: "flex", gap: 8, alignItems: "flex-start" }}><Check aria-hidden="true" style={{ width: 14, height: 14, flexShrink: 0, marginTop: 2, color: T.second }} /><span>Os Logs do Sistema continuam mostrando o nome dela nas ações que fez.</span></li>
                    </ul>
                  );
                })()}
              </div>
              {/* O PAR DA CASA (useConfirmar): no computador, à direita, o
                  recuar antes e o vermelho por último; no celular, empilhado,
                  o vermelho em cima e cheio. */}
              <ModalFooter style={isMobile
                ? { padding: "12px 16px calc(12px + env(safe-area-inset-bottom))" }
                : { flexDirection: "row-reverse", justifyContent: "flex-start", alignItems: "center", gap: 8, padding: "14px 24px" }}>
                <Botao
                  variante="perigo"
                  tamanho={isMobile || ponteiroGrosso ? "toque" : "md"}
                  larguraCheia={isMobile}
                  icone={Trash2}
                  data-testid="button-confirm-delete"
                  onClick={() => deleteMutation.mutate(deletingUser.id)}
                  carregando={deleteMutation.isPending}>
                  {deleteMutation.isPending ? "Excluindo…" : "Sim, excluir"}
                </Botao>
                <Botao
                  variante="fantasma"
                  tamanho={isMobile || ponteiroGrosso ? "toque" : "md"}
                  larguraCheia={isMobile}
                  data-testid="button-cancel-delete"
                  onClick={() => setDeletingUser(null)}>
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
