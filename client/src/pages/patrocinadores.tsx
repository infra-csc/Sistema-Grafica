import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Plus, Pencil, Trash2, Search, X, AlertTriangle, Building2, ChevronLeft, ChevronRight } from "lucide-react";
import type { Sponsor } from "@shared/schema";

/* ── Palette ── */
const T = {
  bg: "#f9f9f8", surface: "#ffffff", border: "#e8e8e7",
  text: "#1a1c1c", second: "#78716c", muted: "#a8a29e",
  accent: "#f97316", dark: "#1c1917", low: "#f3f4f3",
};

const tiInput: React.CSSProperties = {
  width: "100%", padding: "11px 14px",
  backgroundColor: "#f0efee", border: "none", borderRadius: 6,
  fontSize: 13, color: T.text, outline: "none",
  transition: "all 0.2s", fontFamily: "inherit",
};

const labelStyle: React.CSSProperties = {
  fontSize: 9, fontWeight: 900, color: T.muted,
  textTransform: "uppercase", letterSpacing: "0.16em",
  display: "block", marginBottom: 7,
};

/* ── Color presets ── */
const PRESET_COLORS = [
  "#dc2626", "#f97316", "#eab308", "#10b981",
  "#2563eb", "#4f46e5", "#9333ea", "#db2777",
  "#1c1917", "#b45309", "#06b6d4", "#65a30d",
];

const sponsorSchema = z.object({
  name:          z.string().min(1, "Nome obrigatório"),
  email:         z.string().email("Email inválido").optional().or(z.literal("")),
  phone:         z.string().optional(),
  company:       z.string().optional(),
  contactPerson: z.string().optional(),
  notes:         z.string().optional(),
  color:         z.string().optional(),
});
type SponsorForm = z.infer<typeof sponsorSchema>;

const PAGE_SIZE = 15;

export default function Patrocinadores() {
  const [modalOpen, setModalOpen]         = useState(false);
  const [editingSponsor, setEditingSponsor] = useState<Sponsor | null>(null);
  const [deletingSponsor, setDeletingSponsor] = useState<Sponsor | null>(null);
  const [search, setSearch]               = useState("");
  const [page, setPage]                   = useState(1);
  const { toast } = useToast();

  const { data: sponsors = [], isLoading } = useQuery<Sponsor[]>({
    queryKey: ["/api/sponsors"],
  });

  const form = useForm<SponsorForm>({
    resolver: zodResolver(sponsorSchema),
    defaultValues: { name: "", email: "", phone: "", company: "", contactPerson: "", notes: "", color: "#f97316" },
  });

  const selectedColor = form.watch("color") || "#f97316";

  const createMutation = useMutation({
    mutationFn: async (data: SponsorForm) => {
      const res = await apiRequest("POST", "/api/sponsors", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sponsors"] });
      setModalOpen(false); form.reset();
      toast({ title: "Patrocinador criado com sucesso" });
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Erro ao criar patrocinador", description: e.message }),
  });

  const updateMutation = useMutation({
    mutationFn: async (data: { id: string; update: Partial<SponsorForm> }) => {
      const res = await apiRequest("PATCH", `/api/sponsors/${data.id}`, data.update);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sponsors"] });
      setModalOpen(false); setEditingSponsor(null); form.reset();
      toast({ title: "Patrocinador atualizado com sucesso" });
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Erro ao atualizar", description: e.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/sponsors/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sponsors"] });
      setDeletingSponsor(null);
      toast({ title: "Patrocinador excluído com sucesso" });
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Erro ao excluir", description: e.message }),
  });

  const openCreate = () => {
    setEditingSponsor(null);
    form.reset({ name: "", email: "", phone: "", company: "", contactPerson: "", notes: "", color: "#f97316" });
    setModalOpen(true);
  };

  const openEdit = (s: Sponsor) => {
    setEditingSponsor(s);
    form.reset({ name: s.name, email: s.email || "", phone: s.phone || "", company: s.company || "", contactPerson: s.contactPerson || "", notes: s.notes || "", color: s.color || "#f97316" });
    setModalOpen(true);
  };

  const onSubmit = (data: SponsorForm) => {
    if (editingSponsor) {
      updateMutation.mutate({ id: editingSponsor.id, update: data });
    } else {
      createMutation.mutate(data);
    }
  };

  /* ── Filtered + paginated ── */
  const filtered = sponsors.filter(s => {
    const q = search.toLowerCase();
    return !q || s.name.toLowerCase().includes(q) || (s.company || "").toLowerCase().includes(q) || (s.contactPerson || "").toLowerCase().includes(q);
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div style={{ backgroundColor: T.bg, minHeight: "100%", padding: "28px 32px 64px" }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 28, gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 36, fontWeight: 900, color: T.text, margin: "0 0 6px", fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "-0.04em", textTransform: "uppercase", lineHeight: 1 }}>
            Patrocinadores
          </h1>
          <p style={{ fontSize: 14, color: T.second, margin: 0 }}>
            Gerencie os patrocinadores dos eventos
          </p>
        </div>
        <button
          data-testid="button-add-sponsor"
          onClick={openCreate}
          style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 22px", backgroundColor: T.dark, color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", transition: "background 0.15s", whiteSpace: "nowrap" }}
          onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#292524")}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = T.dark)}
        >
          <Plus style={{ width: 14, height: 14 }} />
          Novo Patrocinador
        </button>
      </div>

      {/* ── Search ── */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "center" }}>
        <div style={{ position: "relative", flex: 1, maxWidth: 380 }}>
          <Search style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: T.muted }} />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Buscar por nome, empresa ou contato..."
            data-testid="input-search-sponsors"
            style={{ ...tiInput, paddingLeft: 34, paddingTop: 9, paddingBottom: 9 }}
            onFocus={e => { e.currentTarget.style.backgroundColor = "#fff"; e.currentTarget.style.boxShadow = "0 0 0 2px rgba(249,115,22,0.2)"; }}
            onBlur={e =>  { e.currentTarget.style.backgroundColor = "#f0efee"; e.currentTarget.style.boxShadow = "none"; }}
          />
        </div>
        {search && (
          <button onClick={() => { setSearch(""); setPage(1); }}
            style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 12px", backgroundColor: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, cursor: "pointer", fontSize: 10, fontWeight: 800, color: "#dc2626", textTransform: "uppercase" }}>
            <X style={{ width: 10, height: 10 }} /> Limpar
          </button>
        )}
        <span style={{ marginLeft: "auto", fontSize: 11, color: T.muted, fontWeight: 600 }}>
          {filtered.length} patrocinador{filtered.length !== 1 ? "es" : ""}
        </span>
      </div>

      {/* ── Table ── */}
      <section style={{ backgroundColor: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, overflow: "hidden" }}>
        {isLoading ? (
          <div style={{ padding: "56px 0", textAlign: "center", fontSize: 13, color: T.muted }}>Carregando patrocinadores...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: "72px 0", textAlign: "center" }}>
            <Building2 style={{ width: 48, height: 48, color: T.muted, margin: "0 auto 12px" }} />
            <h3 style={{ fontSize: 15, fontWeight: 700, color: T.second, margin: "0 0 6px" }}>
              {search ? "Nenhum patrocinador encontrado" : "Nenhum patrocinador cadastrado"}
            </h3>
            <p style={{ fontSize: 12, color: T.muted, margin: "0 0 20px" }}>
              {search ? "Tente buscar por outro termo" : "Comece adicionando o primeiro patrocinador"}
            </p>
            {!search && (
              <button onClick={openCreate}
                style={{ padding: "10px 22px", backgroundColor: T.accent, color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Adicionar Patrocinador
              </button>
            )}
          </div>
        ) : (
          <>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                <thead>
                  <tr style={{ backgroundColor: T.low, borderBottom: `1px solid ${T.border}` }}>
                    {["Cor", "Nome", "Empresa", "Contato", "Email", "Telefone", "Ações"].map((h, i) => (
                      <th key={h} style={{ padding: "11px 20px", fontSize: 9, fontWeight: 900, color: T.muted, textTransform: "uppercase", letterSpacing: "0.16em", textAlign: i === 6 ? "right" : "left" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginated.map(sponsor => {
                    const color = sponsor.color || "#f97316";
                    return (
                      <tr
                        key={sponsor.id}
                        data-testid={`sponsor-item-${sponsor.id}`}
                        style={{ borderBottom: `1px solid ${T.low}`, transition: "background 0.1s" }}
                        onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#fafaf9")}
                        onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}
                      >
                        {/* Cor */}
                        <td style={{ padding: "16px 20px" }}>
                          <div style={{ width: 22, height: 22, borderRadius: "50%", backgroundColor: color, boxShadow: `0 0 0 3px ${color}22` }} />
                        </td>

                        {/* Nome */}
                        <td style={{ padding: "16px 20px" }}>
                          <span data-testid={`text-sponsor-name-${sponsor.id}`}
                            style={{ fontSize: 14, fontWeight: 900, color: T.text, fontFamily: "'Space Grotesk', sans-serif", textTransform: "uppercase", letterSpacing: "-0.01em" }}>
                            {sponsor.name}
                          </span>
                        </td>

                        {/* Empresa */}
                        <td style={{ padding: "16px 20px", fontSize: 13, fontWeight: 600, color: T.second }}>
                          {sponsor.company || <span style={{ color: T.muted, fontStyle: "italic", fontWeight: 400 }}>—</span>}
                        </td>

                        {/* Contato */}
                        <td style={{ padding: "16px 20px", fontSize: 12, color: T.second }}>
                          {sponsor.contactPerson || <span style={{ color: T.muted, fontStyle: "italic" }}>—</span>}
                        </td>

                        {/* Email */}
                        <td style={{ padding: "16px 20px", fontSize: 12, color: T.muted }}>
                          {sponsor.email || <span style={{ fontStyle: "italic" }}>—</span>}
                        </td>

                        {/* Telefone */}
                        <td style={{ padding: "16px 20px", fontSize: 12, color: T.muted, whiteSpace: "nowrap" }}>
                          {sponsor.phone || <span style={{ fontStyle: "italic" }}>—</span>}
                        </td>

                        {/* Ações */}
                        <td style={{ padding: "16px 20px", textAlign: "right" }}>
                          <div style={{ display: "flex", justifyContent: "flex-end", gap: 4 }}>
                            <button
                              data-testid={`button-edit-${sponsor.id}`}
                              onClick={() => openEdit(sponsor)}
                              style={{ padding: 7, color: T.muted, backgroundColor: "transparent", border: "none", borderRadius: 6, cursor: "pointer", display: "flex", alignItems: "center", transition: "all 0.12s" }}
                              onMouseEnter={e => { e.currentTarget.style.backgroundColor = T.low; e.currentTarget.style.color = T.text; }}
                              onMouseLeave={e => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = T.muted; }}
                            >
                              <Pencil style={{ width: 15, height: 15 }} />
                            </button>
                            <button
                              data-testid={`button-delete-${sponsor.id}`}
                              onClick={() => setDeletingSponsor(sponsor)}
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

            {/* Footer */}
            <div style={{ padding: "12px 20px", borderTop: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", backgroundColor: "rgba(243,244,243,0.5)" }}>
              <p style={{ fontSize: 10, color: T.muted, fontWeight: 700, margin: 0, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                Exibindo {Math.min((page - 1) * PAGE_SIZE + 1, filtered.length)}–{Math.min(page * PAGE_SIZE, filtered.length)} de {filtered.length} patrocinador{filtered.length !== 1 ? "es" : ""}
              </p>
              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  style={{ padding: 4, color: page === 1 ? T.muted : T.second, background: "none", border: "none", cursor: page === 1 ? "not-allowed" : "pointer", opacity: page === 1 ? 0.35 : 1, display: "flex" }}>
                  <ChevronLeft style={{ width: 16, height: 16 }} />
                </button>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  style={{ padding: 4, color: page === totalPages ? T.muted : T.second, background: "none", border: "none", cursor: page === totalPages ? "not-allowed" : "pointer", opacity: page === totalPages ? 0.35 : 1, display: "flex" }}>
                  <ChevronRight style={{ width: 16, height: 16 }} />
                </button>
              </div>
            </div>
          </>
        )}
      </section>

      {/* ══════════════════════════════
          MODAL: Criar / Editar
      ══════════════════════════════ */}
      {modalOpen && (
        <div
          style={{ position: "fixed", inset: 0, backgroundColor: "rgba(28,25,23,0.5)", backdropFilter: "blur(4px)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={e => { if (e.target === e.currentTarget) { setModalOpen(false); setEditingSponsor(null); form.reset(); } }}
        >
          <div style={{ backgroundColor: T.surface, width: "100%", maxWidth: 640, borderRadius: 10, overflow: "hidden", boxShadow: "0 24px 64px -12px rgba(0,0,0,0.28)", display: "flex", flexDirection: "column", maxHeight: "90vh" }}>
            {/* Header */}
            <div style={{ padding: "20px 28px", backgroundColor: T.low, borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
              <div>
                <h2 style={{ fontSize: 22, fontWeight: 900, color: T.text, margin: "0 0 2px", fontFamily: "'Space Grotesk', sans-serif", textTransform: "uppercase", letterSpacing: "-0.03em" }}>
                  {editingSponsor ? "Editar Patrocinador" : "Novo Patrocinador"}
                </h2>
                <p style={{ fontSize: 11, color: T.muted, margin: 0 }}>Preencha as informações do parceiro</p>
              </div>
              <button onClick={() => { setModalOpen(false); setEditingSponsor(null); form.reset(); }}
                style={{ padding: 6, color: T.muted, background: "none", border: "none", cursor: "pointer", borderRadius: 6, display: "flex" }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = T.border)}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}>
                <X style={{ width: 18, height: 18 }} />
              </button>
            </div>

            {/* Form body — scrollable */}
            <div style={{ overflowY: "auto", flex: 1 }}>
              <Form {...form}>
                <form id="sponsor-form" onSubmit={form.handleSubmit(onSubmit)}>
                  <div style={{ padding: "24px 28px", display: "flex", flexDirection: "column", gap: 20 }}>

                    {/* Row 1: Nome + Empresa */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                      <FormField control={form.control} name="name" render={({ field }) => (
                        <FormItem>
                          <label style={labelStyle}>Nome do Patrocinador *</label>
                          <FormControl>
                            <input {...field} placeholder="Ex: ENERGY PLUS" data-testid="input-sponsor-name"
                              style={{ ...tiInput, fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, textTransform: "uppercase" }}
                              onFocus={e => { e.currentTarget.style.backgroundColor = "#fff"; e.currentTarget.style.boxShadow = "0 0 0 2px rgba(249,115,22,0.2)"; }}
                              onBlur={e =>  { e.currentTarget.style.backgroundColor = "#f0efee"; e.currentTarget.style.boxShadow = "none"; }}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />

                      <FormField control={form.control} name="company" render={({ field }) => (
                        <FormItem>
                          <label style={labelStyle}>Empresa</label>
                          <FormControl>
                            <input {...field} placeholder="Ex: EP Logistics Ltda" data-testid="input-company"
                              style={tiInput}
                              onFocus={e => { e.currentTarget.style.backgroundColor = "#fff"; e.currentTarget.style.boxShadow = "0 0 0 2px rgba(249,115,22,0.2)"; }}
                              onBlur={e =>  { e.currentTarget.style.backgroundColor = "#f0efee"; e.currentTarget.style.boxShadow = "none"; }}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>

                    {/* Row 2: Contato + Email */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                      <FormField control={form.control} name="contactPerson" render={({ field }) => (
                        <FormItem>
                          <label style={labelStyle}>Contato Responsável</label>
                          <FormControl>
                            <input {...field} placeholder="Ex: Ricardo Almeida" data-testid="input-contact-person"
                              style={tiInput}
                              onFocus={e => { e.currentTarget.style.backgroundColor = "#fff"; e.currentTarget.style.boxShadow = "0 0 0 2px rgba(249,115,22,0.2)"; }}
                              onBlur={e =>  { e.currentTarget.style.backgroundColor = "#f0efee"; e.currentTarget.style.boxShadow = "none"; }}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />

                      <FormField control={form.control} name="email" render={({ field }) => (
                        <FormItem>
                          <label style={labelStyle}>Email</label>
                          <FormControl>
                            <input {...field} type="email" placeholder="contato@empresa.com" data-testid="input-email"
                              style={tiInput}
                              onFocus={e => { e.currentTarget.style.backgroundColor = "#fff"; e.currentTarget.style.boxShadow = "0 0 0 2px rgba(249,115,22,0.2)"; }}
                              onBlur={e =>  { e.currentTarget.style.backgroundColor = "#f0efee"; e.currentTarget.style.boxShadow = "none"; }}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>

                    {/* Row 3: Telefone + Hex */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                      <FormField control={form.control} name="phone" render={({ field }) => (
                        <FormItem>
                          <label style={labelStyle}>Telefone</label>
                          <FormControl>
                            <input {...field} placeholder="(11) 98765-4321" data-testid="input-phone"
                              style={tiInput}
                              onFocus={e => { e.currentTarget.style.backgroundColor = "#fff"; e.currentTarget.style.boxShadow = "0 0 0 2px rgba(249,115,22,0.2)"; }}
                              onBlur={e =>  { e.currentTarget.style.backgroundColor = "#f0efee"; e.currentTarget.style.boxShadow = "none"; }}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />

                      <FormField control={form.control} name="color" render={({ field }) => (
                        <FormItem>
                          <label style={labelStyle}>Código Hex</label>
                          <FormControl>
                            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                              <div style={{ width: 40, height: 40, borderRadius: 6, backgroundColor: selectedColor, flexShrink: 0, border: `2px solid ${selectedColor}44` }} />
                              <div style={{ position: "relative", flex: 1 }}>
                                <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: T.muted, fontFamily: "'DM Mono', monospace", fontWeight: 700 }}>#</span>
                                <input
                                  value={(field.value || "").replace(/^#/, "")}
                                  onChange={e => field.onChange("#" + e.target.value.replace(/^#/, ""))}
                                  placeholder="F97316"
                                  data-testid="input-color"
                                  style={{ ...tiInput, paddingLeft: 28, fontFamily: "'DM Mono', monospace", fontSize: 12 }}
                                  onFocus={e => { e.currentTarget.style.backgroundColor = "#fff"; e.currentTarget.style.boxShadow = "0 0 0 2px rgba(249,115,22,0.2)"; }}
                                  onBlur={e =>  { e.currentTarget.style.backgroundColor = "#f0efee"; e.currentTarget.style.boxShadow = "none"; }}
                                />
                              </div>
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>

                    {/* Color presets */}
                    <FormField control={form.control} name="color" render={({ field }) => (
                      <FormItem>
                        <label style={labelStyle}>Cor do Patrocinador</label>
                        <FormControl>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                            {PRESET_COLORS.map(c => (
                              <button
                                key={c}
                                type="button"
                                data-testid={`color-${c}`}
                                onClick={() => field.onChange(c)}
                                style={{
                                  width: 36, height: 36, borderRadius: "50%", backgroundColor: c,
                                  border: "none", cursor: "pointer",
                                  boxShadow: field.value === c ? `0 0 0 2px #fff, 0 0 0 4px ${c}` : "none",
                                  transform: field.value === c ? "scale(1.15)" : "scale(1)",
                                  transition: "all 0.15s",
                                }}
                              />
                            ))}
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />

                    {/* Observações */}
                    <FormField control={form.control} name="notes" render={({ field }) => (
                      <FormItem>
                        <label style={labelStyle}>Observações</label>
                        <FormControl>
                          <textarea
                            {...field}
                            rows={3}
                            placeholder="Informações adicionais sobre o contrato ou parceria..."
                            data-testid="input-notes"
                            style={{ ...tiInput, resize: "none", lineHeight: 1.5 }}
                            onFocus={e => { e.currentTarget.style.backgroundColor = "#fff"; e.currentTarget.style.boxShadow = "0 0 0 2px rgba(249,115,22,0.2)"; }}
                            onBlur={e =>  { e.currentTarget.style.backgroundColor = "#f0efee"; e.currentTarget.style.boxShadow = "none"; }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                </form>
              </Form>
            </div>

            {/* Footer */}
            <div style={{ padding: "16px 28px", borderTop: `1px solid ${T.border}`, backgroundColor: T.low, display: "flex", justifyContent: "flex-end", gap: 12, flexShrink: 0 }}>
              <button
                type="button" data-testid="button-cancel"
                onClick={() => { setModalOpen(false); setEditingSponsor(null); form.reset(); }}
                style={{ padding: "10px 22px", background: "none", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700, color: T.second, textTransform: "uppercase", letterSpacing: "0.1em" }}
              >
                Cancelar
              </button>
              <button
                type="submit" form="sponsor-form" data-testid="button-submit"
                disabled={createMutation.isPending || updateMutation.isPending}
                style={{ padding: "10px 28px", backgroundColor: T.dark, color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", opacity: createMutation.isPending || updateMutation.isPending ? 0.6 : 1 }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#292524")}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = T.dark)}
              >
                {createMutation.isPending || updateMutation.isPending ? "Salvando..." : "Salvar Patrocinador"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════
          MODAL: Confirmar Exclusão
      ══════════════════════════════ */}
      {deletingSponsor && (
        <div
          style={{ position: "fixed", inset: 0, backgroundColor: "rgba(28,25,23,0.6)", backdropFilter: "blur(4px)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={e => { if (e.target === e.currentTarget) setDeletingSponsor(null); }}
        >
          <div data-testid="dialog-confirm-delete" style={{ backgroundColor: T.surface, width: "100%", maxWidth: 440, borderRadius: 10, overflow: "hidden", boxShadow: "0 24px 64px -12px rgba(0,0,0,0.3)" }}>
            {/* Red banner */}
            <div style={{ backgroundColor: "#ef4444", padding: "14px 22px", display: "flex", alignItems: "center", gap: 10 }}>
              <AlertTriangle style={{ width: 18, height: 18, color: "#fff", flexShrink: 0 }} />
              <span style={{ fontSize: 11, fontWeight: 900, color: "#fff", textTransform: "uppercase", letterSpacing: "0.12em" }}>
                Atenção: Ação Irreversível
              </span>
            </div>

            {/* Content */}
            <div style={{ padding: "24px 24px 20px" }}>
              <h3 style={{ fontSize: 20, fontWeight: 900, color: T.text, margin: "0 0 10px", fontFamily: "'Space Grotesk', sans-serif" }}>Excluir Patrocinador?</h3>
              <p style={{ fontSize: 13, color: T.second, margin: 0, lineHeight: 1.6 }}>
                Você está prestes a excluir o patrocinador{" "}
                <strong style={{ color: T.text }}>{deletingSponsor.name}</strong>. Esta ação removerá todos os vínculos com eventos ativos. Deseja continuar?
              </p>
            </div>

            {/* Footer */}
            <div style={{ padding: "14px 24px 20px", display: "flex", justifyContent: "flex-end", gap: 20 }}>
              <button
                data-testid="button-cancel-delete"
                onClick={() => setDeletingSponsor(null)}
                style={{ padding: "8px 0", background: "none", border: "none", cursor: "pointer", fontSize: 10, fontWeight: 900, color: T.muted, textTransform: "uppercase", letterSpacing: "0.12em" }}
              >
                Manter
              </button>
              <button
                data-testid="button-confirm-delete"
                onClick={() => deleteMutation.mutate(deletingSponsor.id)}
                disabled={deleteMutation.isPending}
                style={{ padding: "10px 22px", backgroundColor: "#ef4444", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em", opacity: deleteMutation.isPending ? 0.6 : 1 }}
              >
                {deleteMutation.isPending ? "Excluindo..." : "Sim, Excluir"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
