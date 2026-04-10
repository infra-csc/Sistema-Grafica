import { useState } from "react";
import { useLocation } from "wouter";
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
  UserPlus, Pencil, Trash2, Search, Eye, EyeOff,
  ChevronLeft, ChevronRight, X, AlertTriangle, ShieldCheck,
  Shield, FileText, Palette, Printer, Headphones,
  Lock, Mail, User, CheckCircle2, Circle, LockKeyhole,
} from "lucide-react";

/* ── Palette ── */
const T = {
  bg: "#f9f9f8", surface: "#ffffff", border: "#e8e8e7",
  bdark: "#d6d3d1", text: "#1a1c1c", second: "#78716c",
  muted: "#a8a29e", accent: "#f97316", dark: "#1c1917",
  low: "#f3f4f3",
};

/* ── Role config ── */
const ROLE_CFG: Record<string, { label: string; bg: string; color: string; avatarBg: string; avatarColor: string }> = {
  admin:       { label: "Admin",        bg: "#fef2f2", color: "#dc2626", avatarBg: "#fee2e2", avatarColor: "#b91c1c" },
  solicitacao: { label: "Solicitação",  bg: "#eff6ff", color: "#2563eb", avatarBg: "#dbeafe", avatarColor: "#1d4ed8" },
  arte:        { label: "Arte",         bg: "#faf5ff", color: "#9333ea", avatarBg: "#ede9fe", avatarColor: "#7c3aed" },
  grafica:     { label: "Gráfica",      bg: "#fff7ed", color: "#ea580c", avatarBg: "#ffedd5", avatarColor: "#c2410c" },
  atendimento: { label: "Atendimento",  bg: "#f0fdf4", color: "#16a34a", avatarBg: "#dcfce7", avatarColor: "#15803d" },
};

/* ── Role cards config ── */
const ROLE_CARDS = [
  { value: "admin",       label: "Administrador", Icon: Shield,     color: "#dc2626", bg: "#fef2f2", desc: "Acesso completo ao sistema" },
  { value: "solicitacao", label: "Solicitação",   Icon: FileText,   color: "#2563eb", bg: "#eff6ff", desc: "Criação de pedidos e itens" },
  { value: "arte",        label: "Arte",          Icon: Palette,    color: "#9333ea", bg: "#faf5ff", desc: "Criação e aprovação de arte" },
  { value: "grafica",     label: "Gráfica",       Icon: Printer,    color: "#ea580c", bg: "#fff7ed", desc: "Produção e impressão" },
  { value: "atendimento", label: "Atendimento",   Icon: Headphones, color: "#16a34a", bg: "#f0fdf4", desc: "Atendimento ao cliente" },
] as const;

/* ── Password strength ── */
function pwStrength(pw: string): { bars: number; label: string; color: string } {
  const len = pw.length;
  if (len === 0) return { bars: 0, label: "", color: "" };
  if (len < 4)  return { bars: 1, label: "Fraca",     color: "#ef4444" };
  if (len < 6)  return { bars: 2, label: "Regular",   color: "#f97316" };
  if (len < 9)  return { bars: 3, label: "Média",     color: "#f59e0b" };
  if (len < 12) return { bars: 4, label: "Forte",     color: "#84cc16" };
  return            { bars: 5, label: "Excelente",  color: "#22c55e" };
}

const userSchema = z.object({
  name:     z.string().min(1, "Nome obrigatório"),
  email:    z.string().email("Email inválido"),
  role:     z.enum(["admin", "solicitacao", "arte", "grafica", "atendimento"], { required_error: "Selecione um perfil" }),
  password: z.string().min(6, "Mínimo 6 caracteres").optional().or(z.literal("")),
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
  const [showPassword, setShowPassword] = useState(false);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [page, setPage] = useState(1);
  const { toast } = useToast();

  const { data: users = [], isLoading } = useQuery<User[]>({ queryKey: ["/api/users"] });

  const form = useForm<UserForm>({
    resolver: zodResolver(userSchema),
    defaultValues: { name: "", email: "", role: "solicitacao", password: "" },
  });
  const watchName     = form.watch("name");
  const watchEmail    = form.watch("email");
  const watchRole     = form.watch("role");
  const watchPassword = form.watch("password") || "";

  const createMutation = useMutation({
    mutationFn: async (data: UserForm) => {
      const { password, ...rest } = data;
      const res = await apiRequest("POST", "/api/auth/register", { ...rest, password: password || "123456" });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setModalOpen(false); form.reset();
      toast({ title: "Usuário criado com sucesso", description: "O usuário deve trocar a senha no primeiro acesso" });
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
    form.reset({ name: "", email: "", role: "solicitacao", password: "" });
    setShowPassword(false);
    setModalOpen(true);
  };

  const openEdit = (u: User) => {
    setEditingUser(u);
    form.reset({ name: u.name, email: u.email, role: u.role as any, password: "" });
    setShowPassword(false);
    setModalOpen(true);
  };

  const onSubmit = (data: UserForm) => {
    if (editingUser) {
      const update: Partial<UserForm> = {};
      if (data.name !== editingUser.name) update.name = data.name;
      if (data.email !== editingUser.email) update.email = data.email;
      if (data.role !== editingUser.role) update.role = data.role;
      if (data.password && data.password.length > 0) update.password = data.password;
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
    <div style={{ backgroundColor: T.bg, minHeight: "100%", padding: "28px 32px 64px" }}>

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
        <select
          value={roleFilter} onChange={e => { setRoleFilter(e.target.value); setPage(1); }}
          data-testid="select-role-filter"
          style={filterSel}
        >
          <option value="all">Todos os perfis</option>
          {Object.entries(ROLE_CFG).map(([v, c]) => <option key={v} value={v}>{c.label}</option>)}
        </select>
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
      {modalOpen && (() => {
        const strength = pwStrength(watchPassword);
        const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(watchEmail);
        const roleCard = ROLE_CARDS.find(r => r.value === watchRole);
        const previewInitials = watchName.split(" ").filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join("") || "?";
        const checks = [
          { label: "Nome preenchido",    ok: watchName.length >= 2 },
          { label: "E-mail válido",      ok: emailValid },
          { label: "Senha segura",       ok: watchPassword.length >= 6 },
          { label: "Perfil selecionado", ok: !!watchRole },
        ];
        return (
          <div
            style={{ position: "fixed", inset: 0, backgroundColor: "rgba(28,25,23,0.6)", backdropFilter: "blur(5px)", zIndex: 60, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "32px 16px", overflowY: "auto" }}
            onClick={e => { if (e.target === e.currentTarget) setModalOpen(false); }}
          >
            <div style={{ width: "100%", maxWidth: 960, margin: "auto" }}>

              {/* ── Modal page header ── */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: "#0033CC", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <UserPlus style={{ width: 18, height: 18, color: "#fff" }} />
                  </div>
                  <div>
                    <h2 style={{ fontSize: 18, fontWeight: 700, color: "#0F172A", margin: "0 0 2px", fontFamily: "'Space Grotesk', sans-serif" }}>
                      {editingUser ? "Editar Usuário" : "Cadastro de Usuários"}
                    </h2>
                    <p style={{ fontSize: 12, color: "#94A3B8", margin: 0 }}>
                      {editingUser ? "Atualize as informações do perfil" : "Crie uma nova conta de acesso ao sistema"}
                    </p>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 12px", borderRadius: 100, backgroundColor: "#FEF3C7", fontSize: 11, fontWeight: 700, color: "#D97706" }}>
                    <LockKeyhole style={{ width: 11, height: 11 }} /> Acesso restrito
                  </span>
                  <button onClick={() => setModalOpen(false)}
                    style={{ padding: 6, color: "#94A3B8", background: "none", border: "none", cursor: "pointer", borderRadius: 6, display: "flex" }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = T.border)}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}>
                    <X style={{ width: 18, height: 18 }} />
                  </button>
                </div>
              </div>

              {/* ── 2-col grid ── */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 16, alignItems: "start" }}>

                {/* ── Main form card ── */}
                <div style={{ backgroundColor: T.surface, borderRadius: 12, border: "1px solid #E8ECF8", overflow: "hidden" }}>
                  <Form {...form}>
                    <form id="user-form" onSubmit={form.handleSubmit(onSubmit)}>

                      {/* Section 1 — Dados Pessoais */}
                      <div style={{ padding: "18px 20px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                          <User style={{ width: 14, height: 14, color: "#94A3B8" }} />
                          <span style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.1em" }}>Dados Pessoais</span>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                          {/* Nome */}
                          <FormField control={form.control} name="name" render={({ field }) => (
                            <FormItem>
                              <label style={{ fontSize: 11, fontWeight: 600, color: "#64748B", display: "block", marginBottom: 6 }}>
                                Nome Completo <span style={{ color: "#EF4444" }}>*</span>
                              </label>
                              <FormControl>
                                <div style={{ position: "relative" }}>
                                  <User style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: "#94A3B8" }} />
                                  <input {...field} placeholder="Ex: Ana Silva" data-testid="input-name"
                                    style={{ ...tiInput, paddingLeft: 32, height: 38, boxSizing: "border-box" }}
                                    onFocus={e => { e.currentTarget.style.backgroundColor = "#fff"; e.currentTarget.style.boxShadow = "0 0 0 2px rgba(0,51,204,0.15)"; }}
                                    onBlur={e => { e.currentTarget.style.backgroundColor = "#f0efee"; e.currentTarget.style.boxShadow = "none"; }}
                                  />
                                </div>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )} />

                          {/* Email */}
                          <FormField control={form.control} name="email" render={({ field }) => (
                            <FormItem>
                              <label style={{ fontSize: 11, fontWeight: 600, color: "#64748B", display: "block", marginBottom: 6 }}>
                                E-mail <span style={{ color: "#EF4444" }}>*</span>
                              </label>
                              <FormControl>
                                <div style={{ position: "relative" }}>
                                  <Mail style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: "#94A3B8" }} />
                                  <input {...field} type="email" placeholder="email@norte.com" data-testid="input-email"
                                    style={{ ...tiInput, paddingLeft: 32, paddingRight: 36, height: 38, boxSizing: "border-box", border: emailValid && field.value ? "1.5px solid #22C55E" : "none" }}
                                    onFocus={e => { e.currentTarget.style.backgroundColor = "#fff"; e.currentTarget.style.boxShadow = "0 0 0 2px rgba(0,51,204,0.15)"; }}
                                    onBlur={e => { e.currentTarget.style.backgroundColor = "#f0efee"; e.currentTarget.style.boxShadow = "none"; }}
                                  />
                                  <div style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)" }}>
                                    {field.value ? (
                                      emailValid
                                        ? <CheckCircle2 style={{ width: 14, height: 14, color: "#22C55E" }} />
                                        : <Circle style={{ width: 14, height: 14, color: "#CBD5E1" }} />
                                    ) : null}
                                  </div>
                                </div>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )} />
                        </div>

                        {/* Senha */}
                        <FormField control={form.control} name="password" render={({ field }) => (
                          <FormItem>
                            <label style={{ fontSize: 11, fontWeight: 600, color: "#64748B", display: "block", marginBottom: 6 }}>
                              {editingUser ? "Nova Senha (opcional)" : "Senha"}
                            </label>
                            <FormControl>
                              <div style={{ position: "relative" }}>
                                <Lock style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: "#94A3B8" }} />
                                <input {...field} type={showPassword ? "text" : "password"}
                                  placeholder={editingUser ? "Deixe em branco para manter a atual" : "Mínimo 6 caracteres (padrão: 123456)"}
                                  data-testid="input-password"
                                  style={{ ...tiInput, paddingLeft: 32, paddingRight: 40, height: 38, boxSizing: "border-box" }}
                                  onFocus={e => { e.currentTarget.style.backgroundColor = "#fff"; e.currentTarget.style.boxShadow = "0 0 0 2px rgba(0,51,204,0.15)"; }}
                                  onBlur={e => { e.currentTarget.style.backgroundColor = "#f0efee"; e.currentTarget.style.boxShadow = "none"; }}
                                />
                                <button type="button" onClick={() => setShowPassword(v => !v)}
                                  style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#94A3B8", display: "flex", alignItems: "center" }}>
                                  {showPassword ? <EyeOff style={{ width: 14, height: 14 }} /> : <Eye style={{ width: 14, height: 14 }} />}
                                </button>
                              </div>
                            </FormControl>
                            {/* Strength bar */}
                            {watchPassword.length > 0 && (
                              <div style={{ marginTop: 8 }}>
                                <div style={{ display: "flex", gap: 4, marginBottom: 5 }}>
                                  {[1, 2, 3, 4, 5].map(i => (
                                    <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: i <= strength.bars ? strength.color : "#E2E8F0", transition: "background 0.3s" }} />
                                  ))}
                                  <span style={{ fontSize: 10, fontWeight: 700, color: strength.color, marginLeft: 6, whiteSpace: "nowrap" }}>{strength.label}</span>
                                </div>
                              </div>
                            )}
                            <FormMessage />
                          </FormItem>
                        )} />
                      </div>

                      <div style={{ height: 1, backgroundColor: "#F1F5F9" }} />

                      {/* Section 2 — Perfil de Acesso */}
                      <div style={{ padding: "18px 20px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                          <Shield style={{ width: 14, height: 14, color: "#94A3B8" }} />
                          <span style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.1em" }}>Perfil de Acesso</span>
                          {form.formState.errors.role && (
                            <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 700, color: "#EF4444" }}>
                              {form.formState.errors.role.message}
                            </span>
                          )}
                        </div>
                        <FormField control={form.control} name="role" render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                                {ROLE_CARDS.map(({ value, label, Icon, color, bg, desc }) => {
                                  const active = field.value === value;
                                  return (
                                    <button
                                      key={value} type="button"
                                      data-testid={`role-card-${value}`}
                                      onClick={() => field.onChange(value)}
                                      style={{
                                        padding: "10px 12px", borderRadius: 8, cursor: "pointer", textAlign: "left",
                                        border: active ? `1.5px solid ${color}` : "1.5px solid #E8ECF8",
                                        backgroundColor: active ? bg : "#fff",
                                        position: "relative", transition: "all 0.15s",
                                      }}
                                    >
                                      <Icon style={{ width: 18, height: 18, color: active ? color : "#CBD5E1", marginBottom: 6 }} />
                                      <div style={{ fontSize: 11, fontWeight: 700, color: active ? color : "#374151", marginBottom: 2 }}>{label}</div>
                                      <div style={{ fontSize: 9, color: active ? color : "#94A3B8", lineHeight: 1.3 }}>{desc}</div>
                                      {active && (
                                        <CheckCircle2 style={{ position: "absolute", top: 8, right: 8, width: 14, height: 14, color }} />
                                      )}
                                    </button>
                                  );
                                })}
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                      </div>

                      <div style={{ height: 1, backgroundColor: "#F1F5F9" }} />

                      {/* Footer */}
                      <div style={{ backgroundColor: "#FAFBFF", padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <button type="button" data-testid="button-cancel"
                          onClick={() => { form.reset(); setModalOpen(false); setEditingUser(null); }}
                          style={{ height: 36, padding: "0 16px", border: "1px solid #E2E8F0", backgroundColor: "#fff", borderRadius: 6, fontSize: 11, fontWeight: 600, color: "#64748B", cursor: "pointer" }}>
                          Limpar
                        </button>
                        <button type="submit" form="user-form" data-testid="button-save-user"
                          disabled={createMutation.isPending || updateMutation.isPending}
                          style={{ height: 36, padding: "0 22px", backgroundColor: "#0033CC", color: "#fff", border: "none", borderRadius: 6, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", cursor: "pointer", display: "flex", alignItems: "center", gap: 7, opacity: createMutation.isPending || updateMutation.isPending ? 0.6 : 1 }}>
                          {createMutation.isPending || updateMutation.isPending ? (
                            <>
                              <svg style={{ width: 12, height: 12, animation: "spin 1s linear infinite" }} viewBox="0 0 24 24" fill="none">
                                <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.3)" strokeWidth="3" />
                                <path d="M12 2a10 10 0 0 1 10 10" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
                              </svg>
                              Criando...
                            </>
                          ) : (
                            <><UserPlus style={{ width: 13, height: 13 }} /> {editingUser ? "Salvar Alterações" : "Criar Usuário"}</>
                          )}
                        </button>
                      </div>
                    </form>
                  </Form>
                </div>

                {/* ── Sidebar ── */}
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

                  {/* Preview card */}
                  <div style={{ backgroundColor: T.surface, borderRadius: 12, border: "1px solid #E8ECF8", padding: "16px 18px" }}>
                    <p style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.12em", margin: "0 0 14px" }}>Pré-visualização</p>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{
                        width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                        backgroundColor: watchName ? (roleCard?.color || "#0033CC") + "20" : "#E2E8F0",
                        color: watchName ? (roleCard?.color || "#0033CC") : "#94A3B8",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 14, fontWeight: 900, fontFamily: "'Space Grotesk', sans-serif",
                      }}>
                        {previewInitials}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 700, color: watchName ? T.text : "#CBD5E1", margin: "0 0 2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {watchName || "Nome do usuário"}
                        </p>
                        <p style={{ fontSize: 11, color: watchEmail ? T.second : "#CBD5E1", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {watchEmail || "email@norte.com"}
                        </p>
                      </div>
                    </div>
                    {watchRole && roleCard && (
                      <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 100, backgroundColor: roleCard.bg, width: "fit-content" }}>
                        <roleCard.Icon style={{ width: 11, height: 11, color: roleCard.color }} />
                        <span style={{ fontSize: 10, fontWeight: 700, color: roleCard.color }}>{roleCard.label}</span>
                      </div>
                    )}
                  </div>

                  {/* Checklist card */}
                  <div style={{ backgroundColor: T.surface, borderRadius: 12, border: "1px solid #E8ECF8", padding: "16px 18px" }}>
                    <p style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.12em", margin: "0 0 12px" }}>Checklist</p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {checks.map(c => (
                        <div key={c.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <CheckCircle2 style={{ width: 15, height: 15, flexShrink: 0, color: c.ok ? "#22C55E" : "#E2E8F0" }} />
                          <span style={{ fontSize: 12, fontWeight: 500, color: c.ok ? "#374151" : "#94A3B8" }}>{c.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Security note */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", backgroundColor: T.low, borderRadius: 8 }}>
                    <LockKeyhole style={{ width: 13, height: 13, color: "#94A3B8", flexShrink: 0 }} />
                    <span style={{ fontSize: 10, color: "#94A3B8" }}>Dados criptografados e protegidos</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

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
