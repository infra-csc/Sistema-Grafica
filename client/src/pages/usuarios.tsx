import { useState } from "react";
import { useLocation } from "wouter";
import { FilterSelect } from "@/components/filter-select";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Form, FormControl, FormField, FormItem, FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  UserPlus, Pencil, Trash2, Search,
  ChevronLeft, ChevronRight, X, AlertTriangle, ShieldCheck,
} from "lucide-react";
import { T } from "@/lib/theme";

/* ── Role config ── */
const ROLE_CFG: Record<string, { label: string; bg: string; color: string; avatarBg: string; avatarColor: string }> = {
  admin:       { label: "Admin",        bg: "#fef2f2", color: "#dc2626", avatarBg: "#fee2e2", avatarColor: "#b91c1c" },
  solicitacao: { label: "Solicitação",  bg: "#eff6ff", color: "#2563eb", avatarBg: "#dbeafe", avatarColor: "#1d4ed8" },
  arte:        { label: "Arte",         bg: "#faf5ff", color: "#9333ea", avatarBg: "#ede9fe", avatarColor: "#7c3aed" },
  grafica:     { label: "Gráfica",      bg: "#fff7ed", color: "#ea580c", avatarBg: "#ffedd5", avatarColor: "#c2410c" },
  atendimento: { label: "Atendimento",  bg: "#f0fdf4", color: "#16a34a", avatarBg: "#dcfce7", avatarColor: "#15803d" },
};

const userSchema = z.object({
  name:  z.string().min(1, "Nome obrigatório"),
  email: z.string().email("Email inválido"),
  role:  z.enum(["admin", "solicitacao", "arte", "grafica", "atendimento"], { required_error: "Selecione um perfil" }),
});
type UserForm = z.infer<typeof userSchema>;

interface User {
  id: string; name: string; email: string; role: string;
  mustChangePassword: boolean; createdAt: string;
}

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join("");
}

const PAGE_SIZE = 10;

/* ── Titanium Input ── */
const tiInput: React.CSSProperties = {
  width: "100%", padding: "11px 14px",
  backgroundColor: "#f0efee", border: "none", borderRadius: 6,
  fontSize: 13, color: T.text, outline: "none",
  transition: "all 0.2s",
};

/* ── Filter select ── */
const filterSel: React.CSSProperties = {
  padding: "8px 12px", backgroundColor: T.surface,
  border: `1px solid ${T.border}`, borderRadius: 6,
  fontSize: 11, fontWeight: 700, color: T.second,
  cursor: "pointer", outline: "none",
  appearance: "none", WebkitAppearance: "none",
};

export default function Usuarios() {
  const [, navigate] = useLocation();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [deletingUser, setDeletingUser] = useState<User | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [page, setPage] = useState(1);
  const { toast } = useToast();

  const { data: users = [], isLoading } = useQuery<User[]>({ queryKey: ["/api/users"] });

  const form = useForm<UserForm>({
    resolver: zodResolver(userSchema),
    defaultValues: { name: "", email: "", role: "solicitacao" },
  });
  const createMutation = useMutation({
    mutationFn: async (data: UserForm) => {
      const res = await apiRequest("POST", "/api/auth/register", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setModalOpen(false); form.reset();
      toast({ title: "Usuário criado com sucesso", description: "O usuário já pode acessar o sistema via Microsoft" });
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Erro ao criar usuário", description: e.message }),
  });

  const updateMutation = useMutation({
    mutationFn: async (data: { id: string; update: Partial<UserForm> }) => {
      const res = await apiRequest("PATCH", `/api/users/${data.id}`, data.update);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setModalOpen(false); setEditingUser(null); form.reset();
      toast({ title: "Usuário atualizado com sucesso" });
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Erro ao atualizar", description: e.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/users/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setDeletingUser(null);
      toast({ title: "Usuário excluído com sucesso" });
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Erro ao excluir", description: e.message }),
  });

  const openCreate = () => {
    setEditingUser(null);
    form.reset({ name: "", email: "", role: "solicitacao" });
    setModalOpen(true);
  };

  const openEdit = (u: User) => {
    setEditingUser(u);
    form.reset({ name: u.name, email: u.email, role: u.role as any });
    setModalOpen(true);
  };

  const onSubmit = (data: UserForm) => {
    if (editingUser) {
      const update: Partial<UserForm> = {};
      if (data.name !== editingUser.name) update.name = data.name;
      if (data.email !== editingUser.email) update.email = data.email;
      if (data.role !== editingUser.role) update.role = data.role;
      updateMutation.mutate({ id: editingUser.id, update });
    } else {
      createMutation.mutate(data);
    }
  };

  /* ── Filtered + paginated ── */
  const filtered = users.filter(u => {
    const q = search.toLowerCase();
    const matchQ = !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
    const matchR = roleFilter === "all" || u.role === roleFilter;
    return matchQ && matchR;
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  /* ── Role counts ── */
  const roleCounts = Object.keys(ROLE_CFG).reduce((acc, r) => {
    acc[r] = users.filter(u => u.role === r).length;
    return acc;
  }, {} as Record<string, number>);

  /* ── Security score (% users that don't need password change) ── */
  const secScore = users.length > 0 ? Math.round((users.filter(u => !u.mustChangePassword).length / users.length) * 100) : 100;

  return (
    <div style={{ backgroundColor: T.bg, height: "100%", overflowY: "auto", padding: "28px 32px 64px" }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 28, gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 36, fontWeight: 900, color: T.text, margin: "0 0 6px", fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "-0.04em", textTransform: "uppercase", lineHeight: 1 }}>
            Gerenciamento de Usuários
          </h1>
          <p style={{ fontSize: 14, color: T.second, margin: 0 }}>
            Gerencie usuários, perfis e permissões de acesso ao sistema
          </p>
        </div>
        <button
          data-testid="button-new-user"
          onClick={openCreate}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "11px 22px", backgroundColor: T.dark, color: "#fff",
            border: "none", borderRadius: 6, cursor: "pointer",
            fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em",
            transition: "background 0.15s", whiteSpace: "nowrap",
          }}
          onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#292524")}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = T.dark)}
        >
          <UserPlus style={{ width: 15, height: 15 }} />
          Novo Usuário
        </button>
      </div>

      {/* ── Role chips summary ── */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {Object.entries(ROLE_CFG).map(([role, cfg]) => (
          <button
            key={role}
            onClick={() => { setRoleFilter(roleFilter === role ? "all" : role); setPage(1); }}
            style={{
              padding: "5px 14px", borderRadius: 100,
              backgroundColor: roleFilter === role ? cfg.bg : T.low,
              border: `1px solid ${roleFilter === role ? cfg.color + "40" : T.border}`,
              color: roleFilter === role ? cfg.color : T.second,
              fontSize: 11, fontWeight: 700, cursor: "pointer",
              transition: "all 0.15s", display: "flex", alignItems: "center", gap: 6,
            }}
          >
            <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700 }}>{roleCounts[role]}</span>
            {cfg.label}
          </button>
        ))}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: T.muted, fontWeight: 600 }}>
          <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, color: T.second }}>{users.length}</span> usuários totais
        </div>
      </div>

      {/* ── Search bar ── */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "center" }}>
        <div style={{ position: "relative", flex: 1, maxWidth: 360 }}>
          <Search style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: T.muted }} />
          <input
            value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Buscar por nome ou email..."
            data-testid="input-search-users"
            style={{ ...tiInput, paddingLeft: 34, paddingTop: 9, paddingBottom: 9, width: "100%" }}
            onFocus={e => { e.currentTarget.style.backgroundColor = "#fff"; e.currentTarget.style.boxShadow = "0 0 0 2px rgba(249,115,22,0.2)"; }}
            onBlur={e => { e.currentTarget.style.backgroundColor = "#f0efee"; e.currentTarget.style.boxShadow = "none"; }}
          />
        </div>
        <FilterSelect
          label="Perfil" allLabel="Todos os perfis"
          value={roleFilter}
          onChange={v => { setRoleFilter(v); setPage(1); }}
          options={Object.entries(ROLE_CFG).map(([v, c]) => ({ value: v, label: (c as any).label }))}
          searchPlaceholder="Buscar perfil..." emptyText="Nenhum perfil encontrado."
          hideWhenEmpty={false} testId="select-role-filter"
          triggerStyle={filterSel}
        />
        {(search || roleFilter !== "all") && (
          <button onClick={() => { setSearch(""); setRoleFilter("all"); setPage(1); }}
            style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 12px", backgroundColor: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, cursor: "pointer", fontSize: 10, fontWeight: 800, color: "#dc2626", textTransform: "uppercase" }}>
            <X style={{ width: 10, height: 10 }} /> Limpar
          </button>
        )}
        <span style={{ marginLeft: "auto", fontSize: 11, color: T.muted, fontWeight: 600 }}>
          {filtered.length} resultado{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* ── Table ── */}
      <section style={{ backgroundColor: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, overflow: "hidden", marginBottom: 20 }}>
        {isLoading ? (
          <div style={{ padding: "56px 0", textAlign: "center", fontSize: 13, color: T.muted }}>Carregando usuários...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: "56px 0", textAlign: "center", fontSize: 13, color: T.muted }}>Nenhum usuário encontrado</div>
        ) : (
          <>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                <thead>
                  <tr style={{ backgroundColor: T.low, borderBottom: `1px solid ${T.border}` }}>
                    {["#", "Nome", "Email", "Perfil", "Status", "Criado em", "Ações"].map((h, i) => (
                      <th key={h} style={{
                        padding: "12px 20px", fontSize: 9, fontWeight: 900,
                        color: T.muted, textTransform: "uppercase", letterSpacing: "0.16em",
                        textAlign: i === 6 ? "right" : "left",
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((user, idx) => {
                    const cfg = ROLE_CFG[user.role] || ROLE_CFG.solicitacao;
                    const init = initials(user.name);
                    const displayId = `#NRT-${String((page - 1) * PAGE_SIZE + idx + 1).padStart(4, "0")}`;
                    return (
                      <tr key={user.id}
                        data-testid={`row-user-${user.id}`}
                        style={{ borderBottom: `1px solid ${T.low}`, transition: "background 0.1s" }}
                        onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#fafaf9")}
                        onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}
                      >
                        {/* ID */}
                        <td style={{ padding: "14px 20px", fontFamily: "'DM Mono', monospace", fontSize: 11, color: T.muted }}>
                          {displayId}
                        </td>

                        {/* Nome + avatar */}
                        <td style={{ padding: "14px 20px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{
                              width: 32, height: 32, borderRadius: "50%",
                              backgroundColor: cfg.avatarBg, color: cfg.avatarColor,
                              display: "flex", alignItems: "center", justifyContent: "center",
                              fontSize: 10, fontWeight: 800, flexShrink: 0, letterSpacing: 0,
                            }}>
                              {init}
                            </div>
                            <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{user.name}</span>
                          </div>
                        </td>

                        {/* Email */}
                        <td style={{ padding: "14px 20px", fontSize: 12, color: T.second }}>{user.email}</td>

                        {/* Perfil badge */}
                        <td style={{ padding: "14px 20px" }}>
                          <span style={{
                            padding: "3px 10px", borderRadius: 100,
                            backgroundColor: cfg.bg, color: cfg.color,
                            fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em",
                          }}>
                            {cfg.label}
                          </span>
                        </td>

                        {/* Status */}
                        <td style={{ padding: "14px 20px" }}>
                          {user.mustChangePassword ? (
                            <span style={{
                              padding: "3px 8px", borderRadius: 4,
                              border: "1px solid #fde68a", color: "#a16207",
                              backgroundColor: "#fefce8",
                              fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em",
                            }}>
                              Trocar Senha
                            </span>
                          ) : (
                            <span style={{ display: "flex", alignItems: "center", gap: 6, paddingLeft: 4 }}>
                              <span style={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: "#22c55e" }} />
                              <span style={{ fontSize: 10, color: T.muted, fontWeight: 600 }}>Ativo</span>
                            </span>
                          )}
                        </td>

                        {/* Criado em */}
                        <td style={{ padding: "14px 20px", fontSize: 12, color: T.second }}>
                          {format(new Date(user.createdAt), "dd/MM/yyyy", { locale: ptBR })}
                        </td>

                        {/* Ações */}
                        <td style={{ padding: "14px 20px", textAlign: "right" }}>
                          <div style={{ display: "flex", justifyContent: "flex-end", gap: 4 }}>
                            <button
                              data-testid={`button-edit-${user.id}`}
                              onClick={() => openEdit(user)}
                              style={{ padding: 7, color: T.muted, backgroundColor: "transparent", border: "none", borderRadius: 6, cursor: "pointer", display: "flex", alignItems: "center", transition: "all 0.12s" }}
                              onMouseEnter={e => { e.currentTarget.style.backgroundColor = T.low; e.currentTarget.style.color = T.text; }}
                              onMouseLeave={e => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = T.muted; }}
                            >
                              <Pencil style={{ width: 15, height: 15 }} />
                            </button>
                            <button
                              data-testid={`button-delete-${user.id}`}
                              onClick={() => setDeletingUser(user)}
                              style={{ padding: 7, color: T.muted, backgroundColor: "transparent", border: "none", borderRadius: 6, cursor: "pointer", display: "flex", alignItems: "center", transition: "all 0.12s" }}
                              onMouseEnter={e => { e.currentTarget.style.backgroundColor = "#fef2f2"; e.currentTarget.style.color = "#dc2626"; }}
                              onMouseLeave={e => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = T.muted; }}
                            >
                              <Trash2 style={{ width: 15, height: 15 }} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination footer */}
            <div style={{ padding: "12px 20px", borderTop: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", backgroundColor: "rgba(243,244,243,0.5)" }}>
              <p style={{ fontSize: 11, color: T.muted, fontWeight: 500, margin: 0 }}>
                Exibindo {Math.min((page - 1) * PAGE_SIZE + 1, filtered.length)}–{Math.min(page * PAGE_SIZE, filtered.length)} de {filtered.length} usuário{filtered.length !== 1 ? "s" : ""}
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  style={{ padding: 4, color: page === 1 ? T.muted : T.second, background: "none", border: "none", cursor: page === 1 ? "not-allowed" : "pointer", opacity: page === 1 ? 0.35 : 1 }}>
                  <ChevronLeft style={{ width: 16, height: 16 }} />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).slice(Math.max(0, page - 3), Math.min(totalPages, page + 2)).map(p => (
                  <button key={p} onClick={() => setPage(p)}
                    style={{
                      width: 28, height: 28, borderRadius: 5, border: p === page ? `1px solid ${T.border}` : "1px solid transparent",
                      backgroundColor: p === page ? T.surface : "transparent",
                      fontSize: 11, fontWeight: p === page ? 900 : 600,
                      color: p === page ? T.text : T.muted, cursor: "pointer",
                    }}>
                    {p}
                  </button>
                ))}
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  style={{ padding: 4, color: page === totalPages ? T.muted : T.second, background: "none", border: "none", cursor: page === totalPages ? "not-allowed" : "pointer", opacity: page === totalPages ? 0.35 : 1 }}>
                  <ChevronRight style={{ width: 16, height: 16 }} />
                </button>
              </div>
            </div>
          </>
        )}
      </section>

      {/* ── Bento grid ── */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16, marginTop: 24 }}>
        {/* Dark card — Relatório de Acessos */}
        <div style={{ backgroundColor: T.dark, borderRadius: 10, padding: "28px 32px", display: "flex", flexDirection: "column", justifyContent: "space-between", minHeight: 200, position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: -40, right: -40, width: 180, height: 180, borderRadius: "50%", backgroundColor: T.accent, opacity: 0.12, filter: "blur(60px)" }} />
          <div>
            <h3 style={{ fontSize: 24, fontWeight: 900, color: "#fff", margin: "0 0 8px", fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "-0.04em", textTransform: "uppercase", lineHeight: 1 }}>
              Controle de Acessos
            </h3>
            <p style={{ fontSize: 12, color: "#a8a29e", margin: 0, maxWidth: 340 }}>
              Monitore a atividade e o status de segurança dos usuários da plataforma em tempo real.
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 24 }}>
            <div style={{ display: "flex", gap: 6 }}>
              {users.slice(0, 4).map((u, i) => {
                const cfg = ROLE_CFG[u.role] || ROLE_CFG.solicitacao;
                return (
                  <div key={u.id} style={{ width: 36, height: 36, borderRadius: "50%", backgroundColor: cfg.avatarBg, border: `2px solid ${T.dark}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color: cfg.avatarColor, marginLeft: i > 0 ? -10 : 0 }}>
                    {initials(u.name)}
                  </div>
                );
              })}
              {users.length > 4 && (
                <div style={{ width: 36, height: 36, borderRadius: "50%", backgroundColor: "#292524", border: `2px solid ${T.dark}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: "#78716c", marginLeft: -10 }}>
                  +{users.length - 4}
                </div>
              )}
            </div>
            <button
              onClick={() => navigate("/logs-sistema")}
              data-testid="button-ver-logs"
              style={{ padding: "9px 20px", backgroundColor: T.accent, color: "#fff", border: "none", borderRadius: 6, fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", cursor: "pointer", transition: "opacity 0.15s" }}
              onMouseEnter={e => (e.currentTarget.style.opacity = "0.85")}
              onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
            >
              Ver Logs
            </button>
          </div>
        </div>

        {/* Light card — Nível de Segurança */}
        <div style={{ backgroundColor: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: "28px 28px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div>
            <ShieldCheck style={{ width: 32, height: 32, color: T.accent, marginBottom: 12 }} />
            <h3 style={{ fontSize: 17, fontWeight: 900, color: T.text, margin: "0 0 4px", fontFamily: "'Space Grotesk', sans-serif", textTransform: "uppercase", letterSpacing: "-0.02em" }}>
              Nível de Segurança
            </h3>
            <p style={{ fontSize: 11, color: T.second, margin: 0 }}>
              Usuários sem senha padrão
            </p>
          </div>
          <div style={{ marginTop: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 8 }}>
              <span style={{ fontSize: 9, fontWeight: 900, color: T.muted, textTransform: "uppercase", letterSpacing: "0.14em" }}>Health Score</span>
              <span style={{ fontSize: 28, fontWeight: 900, color: T.text, fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "-0.04em", lineHeight: 1 }}>{secScore}%</span>
            </div>
            <div style={{ width: "100%", height: 5, backgroundColor: T.low, borderRadius: 100, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${secScore}%`, backgroundColor: secScore >= 80 ? "#22c55e" : secScore >= 60 ? T.accent : "#ef4444", borderRadius: 100, transition: "width 0.5s" }} />
            </div>
            <p style={{ fontSize: 10, color: T.muted, margin: "8px 0 0" }}>
              {users.filter(u => u.mustChangePassword).length} usuário{users.filter(u => u.mustChangePassword).length !== 1 ? "s" : ""} com senha padrão pendente
            </p>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════
          MODAL: Criar / Editar
      ══════════════════════════════ */}
      {modalOpen && (
        <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(28,25,23,0.55)", backdropFilter: "blur(4px)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={e => { if (e.target === e.currentTarget && window.confirm("Descartar as alterações deste formulário?")) setModalOpen(false); }}>
          <div style={{ backgroundColor: T.surface, width: "100%", maxWidth: 520, borderRadius: 10, overflow: "hidden", boxShadow: "0 24px 64px -12px rgba(0,0,0,0.3)" }}>
            {/* Modal header */}
            <div style={{ backgroundColor: T.low, padding: "20px 28px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
              <div>
                <h2 style={{ fontSize: 22, fontWeight: 900, color: T.text, margin: "0 0 3px", fontFamily: "'Space Grotesk', sans-serif", textTransform: "uppercase", letterSpacing: "-0.03em" }}>
                  {editingUser ? "Editar Usuário" : "Novo Usuário"}
                </h2>
                <p style={{ fontSize: 11, color: T.muted, margin: 0 }}>
                  {editingUser ? "Edite as informações do perfil abaixo" : "Preencha as informações do perfil abaixo"}
                </p>
              </div>
              <button onClick={() => setModalOpen(false)}
                style={{ padding: 6, color: T.muted, background: "none", border: "none", cursor: "pointer", borderRadius: 6, display: "flex", alignItems: "center" }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = T.border)}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}>
                <X style={{ width: 18, height: 18 }} />
              </button>
            </div>

            {/* Modal form */}
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} style={{ padding: "24px 28px", display: "flex", flexDirection: "column", gap: 18 }}>

                {/* Nome */}
                <FormField control={form.control} name="name" render={({ field }) => (
                  <FormItem>
                    <div style={{ fontSize: 9, fontWeight: 900, color: T.muted, textTransform: "uppercase", letterSpacing: "0.16em", marginBottom: 7 }}>Nome Completo</div>
                    <FormControl>
                      <input {...field} placeholder="Ex: Roberto Carlos" data-testid="input-name"
                        style={tiInput}
                        onFocus={e => { e.currentTarget.style.backgroundColor = "#fff"; e.currentTarget.style.boxShadow = "0 0 0 2px rgba(249,115,22,0.2)"; }}
                        onBlur={e => { e.currentTarget.style.backgroundColor = "#f0efee"; e.currentTarget.style.boxShadow = "none"; }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                {/* Email + Perfil grid */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  <FormField control={form.control} name="email" render={({ field }) => (
                    <FormItem>
                      <div style={{ fontSize: 9, fontWeight: 900, color: T.muted, textTransform: "uppercase", letterSpacing: "0.16em", marginBottom: 7 }}>Email</div>
                      <FormControl>
                        <input {...field} type="email" placeholder="email@norte.com" data-testid="input-email"
                          style={tiInput}
                          onFocus={e => { e.currentTarget.style.backgroundColor = "#fff"; e.currentTarget.style.boxShadow = "0 0 0 2px rgba(249,115,22,0.2)"; }}
                          onBlur={e => { e.currentTarget.style.backgroundColor = "#f0efee"; e.currentTarget.style.boxShadow = "none"; }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="role" render={({ field }) => (
                    <FormItem>
                      <div style={{ fontSize: 9, fontWeight: 900, color: T.muted, textTransform: "uppercase", letterSpacing: "0.16em", marginBottom: 7 }}>Perfil</div>
                      <FormControl>
                        <select {...field} data-testid="select-role"
                          style={{ ...tiInput, appearance: "none", WebkitAppearance: "none", cursor: "pointer" }}
                          onFocus={e => { e.currentTarget.style.backgroundColor = "#fff"; e.currentTarget.style.boxShadow = "0 0 0 2px rgba(249,115,22,0.2)"; }}
                          onBlur={e => { e.currentTarget.style.backgroundColor = "#f0efee"; e.currentTarget.style.boxShadow = "none"; }}
                        >
                          <option value="admin">Administrador</option>
                          <option value="solicitacao">Solicitação</option>
                          <option value="arte">Arte</option>
                          <option value="grafica">Gráfica</option>
                          <option value="atendimento">Atendimento</option>
                        </select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                {/* Buttons */}
                <div style={{ display: "flex", gap: 10, paddingTop: 6 }}>
                  <button type="button" onClick={() => setModalOpen(false)}
                    data-testid="button-cancel"
                    style={{ flex: 1, padding: "11px 0", border: `1px solid ${T.border}`, backgroundColor: "transparent", borderRadius: 6, fontSize: 11, fontWeight: 700, color: T.second, textTransform: "uppercase", letterSpacing: "0.1em", cursor: "pointer" }}>
                    Cancelar
                  </button>
                  <button type="submit"
                    data-testid="button-save-user"
                    disabled={createMutation.isPending || updateMutation.isPending}
                    style={{ flex: 1, padding: "11px 0", backgroundColor: T.dark, color: "#fff", border: "none", borderRadius: 6, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", cursor: "pointer", opacity: createMutation.isPending || updateMutation.isPending ? 0.6 : 1 }}>
                    {createMutation.isPending || updateMutation.isPending ? "Salvando..." : editingUser ? "Salvar Alterações" : "Criar Usuário"}
                  </button>
                </div>
              </form>
            </Form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════
          MODAL: Confirmar Exclusão
      ══════════════════════════════ */}
      {deletingUser && (
        <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(28,25,23,0.55)", backdropFilter: "blur(4px)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={e => { if (e.target === e.currentTarget) setDeletingUser(null); }}>
          <div style={{ backgroundColor: T.surface, width: "100%", maxWidth: 420, borderRadius: 10, overflow: "hidden", boxShadow: "0 24px 64px -12px rgba(0,0,0,0.3)", borderLeft: "4px solid #ef4444" }}>
            <div style={{ padding: "24px 28px", display: "flex", gap: 14, alignItems: "flex-start" }}>
              <div style={{ width: 40, height: 40, borderRadius: "50%", backgroundColor: "#fef2f2", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <AlertTriangle style={{ width: 18, height: 18, color: "#ef4444" }} />
              </div>
              <div style={{ flex: 1 }}>
                <h4 style={{ fontSize: 15, fontWeight: 800, color: T.text, margin: "0 0 6px", fontFamily: "'Space Grotesk', sans-serif" }}>Excluir Usuário?</h4>
                <p style={{ fontSize: 12, color: T.second, margin: "0 0 20px", lineHeight: 1.5 }}>
                  Tem certeza que deseja excluir <strong style={{ color: T.text }}>{deletingUser.name}</strong>? Esta ação não pode ser desfeita e o usuário perderá acesso imediato.
                </p>
                <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                  <button
                    data-testid="button-confirm-delete"
                    onClick={() => deleteMutation.mutate(deletingUser.id)}
                    disabled={deleteMutation.isPending}
                    style={{ fontSize: 10, fontWeight: 900, color: "#dc2626", background: "none", border: "none", cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.12em" }}>
                    {deleteMutation.isPending ? "Excluindo..." : "Confirmar Exclusão"}
                  </button>
                  <button
                    data-testid="button-cancel-delete"
                    onClick={() => setDeletingUser(null)}
                    style={{ fontSize: 10, fontWeight: 900, color: T.muted, background: "none", border: "none", cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.12em" }}>
                    Manter
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
