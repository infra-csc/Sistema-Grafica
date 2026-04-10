import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Pencil, Trash2, Search, X, AlertTriangle, Plus, Building2 } from "lucide-react";
import type { Sponsor } from "@shared/schema";

/* ── Palette ── */
const T = {
  bg: "#f9f9f8", surface: "#ffffff", border: "#e8e8e7",
  text: "#1a1c1c", second: "#78716c", muted: "#a8a29e",
  accent: "#f97316", dark: "#1c1917", low: "#f3f4f3",
};

const tiInput: React.CSSProperties = {
  width: "100%", padding: "14px 16px",
  backgroundColor: "#f0efee", border: "none", borderRadius: 8,
  fontSize: 13, color: T.text, outline: "none",
  transition: "all 0.2s", fontFamily: "inherit",
};

const sectionLabel = (n: string, title: string) => (
  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
    <span style={{ fontSize: 10, fontWeight: 900, color: T.accent, fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "0.12em" }}>
      {n}
    </span>
    <span style={{ fontSize: 9, fontWeight: 900, color: T.second, textTransform: "uppercase", letterSpacing: "0.18em" }}>
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

export default function Patrocinadores() {
  const [modalOpen, setModalOpen]             = useState(false);
  const [editingSponsor, setEditingSponsor]   = useState<Sponsor | null>(null);
  const [deletingSponsor, setDeletingSponsor] = useState<Sponsor | null>(null);
  const [search, setSearch]                   = useState("");
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

  const closeModal = () => { setModalOpen(false); setEditingSponsor(null); form.reset(); };

  /* ── Filtered list ── */
  const filtered = sponsors.filter(s => {
    const q = search.toLowerCase();
    return !q || s.name.toLowerCase().includes(q) || (s.company || "").toLowerCase().includes(q) || (s.contactPerson || "").toLowerCase().includes(q);
  });

  return (
    <div style={{ backgroundColor: T.bg, minHeight: "100%", padding: "36px 40px 80px" }}>

      {/* ── Page Header ── */}
      <div style={{ marginBottom: 36 }}>
        <h1 style={{ fontSize: 56, fontWeight: 900, color: T.text, margin: "0 0 8px", fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "-0.05em", textTransform: "uppercase", lineHeight: 1 }}>
          Patrocinadores
        </h1>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <p style={{ fontSize: 11, color: T.second, margin: 0, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em" }}>
            Gerenciamento de parcerias estratégicas
          </p>
          <div style={{ height: 1, width: 60, backgroundColor: T.border }} />
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: T.muted, fontWeight: 600 }}>
            {sponsors.length} parceiro{sponsors.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* ── Search bar ── */}
      <div style={{ display: "flex", gap: 10, marginBottom: 28, alignItems: "center" }}>
        <div style={{ position: "relative", flex: 1, maxWidth: 400 }}>
          <Search style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: T.muted }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nome, empresa ou contato..."
            data-testid="input-search-sponsors"
            style={{ ...tiInput, paddingLeft: 36, paddingTop: 10, paddingBottom: 10, borderRadius: 8 }}
            onFocus={e => { e.currentTarget.style.backgroundColor = "#fff"; e.currentTarget.style.boxShadow = "0 0 0 2px rgba(249,115,22,0.2)"; }}
            onBlur={e =>  { e.currentTarget.style.backgroundColor = "#f0efee"; e.currentTarget.style.boxShadow = "none"; }}
          />
        </div>
        {search && (
          <button onClick={() => setSearch("")}
            style={{ display: "flex", alignItems: "center", gap: 5, padding: "8px 12px", backgroundColor: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, cursor: "pointer", fontSize: 10, fontWeight: 800, color: "#dc2626", textTransform: "uppercase" }}>
            <X style={{ width: 10, height: 10 }} /> Limpar
          </button>
        )}
        {search && (
          <span style={{ fontSize: 11, color: T.muted, fontWeight: 600 }}>
            {filtered.length} resultado{filtered.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* ── Card Grid ── */}
      {isLoading ? (
        <div style={{ padding: "80px 0", textAlign: "center", fontSize: 13, color: T.muted }}>Carregando patrocinadores...</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 24 }}>
          {filtered.map(sponsor => {
            const color = sponsor.color || "#f97316";
            const initials = sponsor.name.split(" ").filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join("");
            return (
              <div
                key={sponsor.id}
                data-testid={`sponsor-item-${sponsor.id}`}
                style={{ backgroundColor: T.surface, borderRadius: 10, overflow: "hidden", boxShadow: "0 4px 20px rgba(26,28,28,0.06)", display: "flex", flexDirection: "column", transition: "transform 0.2s, box-shadow 0.2s" }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(-3px)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 10px 32px rgba(26,28,28,0.1)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(0)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 20px rgba(26,28,28,0.06)"; }}
              >
                {/* Color stripe */}
                <div style={{ height: 6, backgroundColor: color, flexShrink: 0 }} />

                {/* Card body */}
                <div style={{ padding: "24px 24px 28px", flex: 1 }}>
                  {/* Top row: logo + actions */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
                    <div style={{ width: 56, height: 56, borderRadius: 10, backgroundColor: color + "18", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ fontSize: 18, fontWeight: 900, color, fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "-0.03em" }}>
                        {initials}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button
                        data-testid={`button-edit-${sponsor.id}`}
                        onClick={() => openEdit(sponsor)}
                        style={{ padding: 7, color: T.muted, backgroundColor: "transparent", border: "none", borderRadius: "50%", cursor: "pointer", display: "flex", transition: "all 0.12s" }}
                        onMouseEnter={e => { e.currentTarget.style.backgroundColor = T.low; e.currentTarget.style.color = T.text; }}
                        onMouseLeave={e => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = T.muted; }}
                      >
                        <Pencil style={{ width: 16, height: 16 }} />
                      </button>
                      <button
                        data-testid={`button-delete-${sponsor.id}`}
                        onClick={() => setDeletingSponsor(sponsor)}
                        style={{ padding: 7, color: T.muted, backgroundColor: "transparent", border: "none", borderRadius: "50%", cursor: "pointer", display: "flex", transition: "all 0.12s" }}
                        onMouseEnter={e => { e.currentTarget.style.backgroundColor = "#fef2f2"; e.currentTarget.style.color = "#dc2626"; }}
                        onMouseLeave={e => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = T.muted; }}
                      >
                        <Trash2 style={{ width: 16, height: 16 }} />
                      </button>
                    </div>
                  </div>

                  {/* Name */}
                  <h3 data-testid={`text-sponsor-name-${sponsor.id}`}
                    style={{ fontSize: 20, fontWeight: 900, color: T.text, margin: "0 0 4px", fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "-0.04em", textTransform: "uppercase", lineHeight: 1.1 }}>
                    {sponsor.name}
                  </h3>
                  {sponsor.company && (
                    <p style={{ fontSize: 10, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.12em", margin: "0 0 20px" }}>
                      {sponsor.company}
                    </p>
                  )}

                  {/* Divider */}
                  <div style={{ height: 1, backgroundColor: T.low, margin: sponsor.company ? "0 0 20px" : "20px 0" }} />

                  {/* Info fields */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {[
                      { label: "Contato Direto", value: sponsor.contactPerson },
                      { label: "E-mail",          value: sponsor.email },
                      { label: "Telefone",         value: sponsor.phone },
                      { label: "Obs.",             value: sponsor.notes },
                    ].filter(f => f.value).map(field => (
                      <div key={field.label}>
                        <p style={{ fontSize: 9, fontWeight: 900, color: T.muted, textTransform: "uppercase", letterSpacing: "0.14em", margin: "0 0 3px" }}>
                          {field.label}
                        </p>
                        <p style={{ fontSize: 12, fontWeight: 600, color: T.text, margin: 0 }}>
                          {field.value}
                        </p>
                      </div>
                    ))}
                    {!sponsor.contactPerson && !sponsor.email && !sponsor.phone && (
                      <p style={{ fontSize: 11, color: T.muted, fontStyle: "italic", margin: 0 }}>Sem informações de contato</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* ── Ghost card: Adicionar ── */}
          {!search && (
            <button
              onClick={openCreate}
              data-testid="button-add-sponsor"
              style={{ minHeight: 360, border: `2px dashed ${T.border}`, borderRadius: 10, backgroundColor: "transparent", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, cursor: "pointer", transition: "all 0.2s", padding: 24 }}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = T.low; e.currentTarget.style.borderColor = T.muted; }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.borderColor = T.border; }}
            >
              <div style={{ width: 56, height: 56, borderRadius: "50%", backgroundColor: T.low, display: "flex", alignItems: "center", justifyContent: "center", transition: "transform 0.2s" }}>
                <Plus style={{ width: 22, height: 22, color: T.second }} />
              </div>
              <p style={{ fontSize: 12, fontWeight: 700, color: T.second, textTransform: "uppercase", letterSpacing: "0.08em", margin: 0, fontFamily: "'Space Grotesk', sans-serif" }}>
                Adicionar Novo Patrocinador
              </p>
            </button>
          )}

          {/* Empty state when search active */}
          {search && filtered.length === 0 && (
            <div style={{ gridColumn: "1/-1", padding: "72px 0", textAlign: "center" }}>
              <Building2 style={{ width: 48, height: 48, color: T.muted, margin: "0 auto 12px" }} />
              <p style={{ fontSize: 14, fontWeight: 600, color: T.second, margin: 0 }}>Nenhum patrocinador encontrado</p>
              <p style={{ fontSize: 12, color: T.muted, margin: "6px 0 0" }}>Tente buscar por outro termo</p>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════
          MODAL: Criar / Editar
      ══════════════════════════════ */}
      {modalOpen && (
        <div
          style={{ position: "fixed", inset: 0, backgroundColor: "rgba(28,25,23,0.6)", backdropFilter: "blur(5px)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, overflowY: "auto" }}
          onClick={e => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <div style={{ backgroundColor: T.surface, width: "100%", maxWidth: 640, borderRadius: 12, overflow: "hidden", boxShadow: "0 32px 80px -16px rgba(0,0,0,0.35)", display: "flex", flexDirection: "column", maxHeight: "90vh", margin: "auto" }}>

            {/* Header */}
            <div style={{ padding: "28px 32px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexShrink: 0 }}>
              <div>
                <h2 style={{ fontSize: 26, fontWeight: 900, color: T.text, margin: "0 0 4px", fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "-0.04em", textTransform: "uppercase" }}>
                  {editingSponsor ? "Editar Patrocinador" : "Cadastro de Patrocinador"}
                </h2>
                <p style={{ fontSize: 10, color: T.muted, margin: 0, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em" }}>
                  {editingSponsor ? "Atualize os detalhes da parceria" : "Insira os detalhes da nova parceria"}
                </p>
              </div>
              <button onClick={closeModal}
                style={{ padding: 6, color: T.muted, background: "none", border: "none", cursor: "pointer", borderRadius: 6, display: "flex", marginTop: 2 }}
                onMouseEnter={e => { e.currentTarget.style.backgroundColor = T.low; e.currentTarget.style.color = T.text; }}
                onMouseLeave={e => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = T.muted; }}>
                <X style={{ width: 20, height: 20 }} />
              </button>
            </div>

            {/* Scrollable form body */}
            <div style={{ overflowY: "auto", flex: 1 }}>
              <Form {...form}>
                <form id="sponsor-form" onSubmit={form.handleSubmit(onSubmit)}>
                  <div style={{ padding: "28px 32px", display: "flex", flexDirection: "column", gap: 28 }}>

                    {/* ─ 01 Informações Gerais ─ */}
                    <section>
                      {sectionLabel("01", "Informações Gerais")}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                        <FormField control={form.control} name="name" render={({ field }) => (
                          <FormItem>
                            <label style={{ fontSize: 10, fontWeight: 700, color: T.second, textTransform: "uppercase", letterSpacing: "0.1em", display: "block", marginBottom: 8 }}>Nome do Patrocinador *</label>
                            <FormControl>
                              <input {...field} placeholder="Ex: Global Logistics" data-testid="input-sponsor-name"
                                style={{ ...tiInput, fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700 }}
                                onFocus={e => { e.currentTarget.style.backgroundColor = "#fff"; e.currentTarget.style.boxShadow = "0 0 0 2px rgba(249,115,22,0.2)"; }}
                                onBlur={e =>  { e.currentTarget.style.backgroundColor = "#f0efee"; e.currentTarget.style.boxShadow = "none"; }}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="company" render={({ field }) => (
                          <FormItem>
                            <label style={{ fontSize: 10, fontWeight: 700, color: T.second, textTransform: "uppercase", letterSpacing: "0.1em", display: "block", marginBottom: 8 }}>Empresa (Razão Social)</label>
                            <FormControl>
                              <input {...field} placeholder="Razão Social Completa" data-testid="input-company"
                                style={tiInput}
                                onFocus={e => { e.currentTarget.style.backgroundColor = "#fff"; e.currentTarget.style.boxShadow = "0 0 0 2px rgba(249,115,22,0.2)"; }}
                                onBlur={e =>  { e.currentTarget.style.backgroundColor = "#f0efee"; e.currentTarget.style.boxShadow = "none"; }}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                      </div>
                    </section>

                    {/* ─ 02 Identidade Visual ─ */}
                    <section>
                      {sectionLabel("02", "Identidade Visual")}
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 32 }}>
                        {/* Color presets */}
                        <FormField control={form.control} name="color" render={({ field }) => (
                          <FormItem style={{ flexShrink: 0 }}>
                            <label style={{ fontSize: 10, fontWeight: 700, color: T.second, textTransform: "uppercase", letterSpacing: "0.1em", display: "block", marginBottom: 12 }}>Cor da Marca</label>
                            <FormControl>
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, maxWidth: 200 }}>
                                {PRESET_COLORS.map(c => (
                                  <button key={c} type="button" data-testid={`color-${c}`}
                                    onClick={() => field.onChange(c)}
                                    style={{ width: 30, height: 30, borderRadius: "50%", backgroundColor: c, border: "none", cursor: "pointer", transition: "all 0.15s", flexShrink: 0, boxShadow: field.value === c ? `0 0 0 2px #fff, 0 0 0 4px ${c}` : "none", transform: field.value === c ? "scale(1.2)" : "scale(1)" }}
                                  />
                                ))}
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />

                        {/* Color preview + hex input */}
                        <div style={{ flex: 1 }}>
                          <label style={{ fontSize: 10, fontWeight: 700, color: T.second, textTransform: "uppercase", letterSpacing: "0.1em", display: "block", marginBottom: 12 }}>Código Hex</label>
                          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                            <div style={{ width: 44, height: 44, borderRadius: 8, backgroundColor: selectedColor, flexShrink: 0, boxShadow: `0 0 0 3px ${selectedColor}30` }} />
                            <FormField control={form.control} name="color" render={({ field }) => (
                              <FormItem style={{ flex: 1, margin: 0 }}>
                                <FormControl>
                                  <div style={{ position: "relative" }}>
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
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )} />
                          </div>
                        </div>
                      </div>
                    </section>

                    {/* ─ 03 Contato Executivo ─ */}
                    <section>
                      {sectionLabel("03", "Contato Executivo")}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                        <FormField control={form.control} name="contactPerson" render={({ field }) => (
                          <FormItem>
                            <label style={{ fontSize: 10, fontWeight: 700, color: T.second, textTransform: "uppercase", letterSpacing: "0.1em", display: "block", marginBottom: 8 }}>Pessoa de Contato</label>
                            <FormControl>
                              <input {...field} placeholder="Nome do Gerente de Conta" data-testid="input-contact-person"
                                style={tiInput}
                                onFocus={e => { e.currentTarget.style.backgroundColor = "#fff"; e.currentTarget.style.boxShadow = "0 0 0 2px rgba(249,115,22,0.2)"; }}
                                onBlur={e =>  { e.currentTarget.style.backgroundColor = "#f0efee"; e.currentTarget.style.boxShadow = "none"; }}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="phone" render={({ field }) => (
                          <FormItem>
                            <label style={{ fontSize: 10, fontWeight: 700, color: T.second, textTransform: "uppercase", letterSpacing: "0.1em", display: "block", marginBottom: 8 }}>Telefone</label>
                            <FormControl>
                              <input {...field} placeholder="+55 (00) 00000-0000" data-testid="input-phone"
                                style={tiInput}
                                onFocus={e => { e.currentTarget.style.backgroundColor = "#fff"; e.currentTarget.style.boxShadow = "0 0 0 2px rgba(249,115,22,0.2)"; }}
                                onBlur={e =>  { e.currentTarget.style.backgroundColor = "#f0efee"; e.currentTarget.style.boxShadow = "none"; }}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="email" render={({ field }) => (
                          <FormItem style={{ gridColumn: "1 / -1" }}>
                            <label style={{ fontSize: 10, fontWeight: 700, color: T.second, textTransform: "uppercase", letterSpacing: "0.1em", display: "block", marginBottom: 8 }}>E-mail Institucional</label>
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
                        <FormField control={form.control} name="notes" render={({ field }) => (
                          <FormItem style={{ gridColumn: "1 / -1" }}>
                            <label style={{ fontSize: 10, fontWeight: 700, color: T.second, textTransform: "uppercase", letterSpacing: "0.1em", display: "block", marginBottom: 8 }}>Observações</label>
                            <FormControl>
                              <textarea {...field} rows={3} placeholder="Informações adicionais sobre o contrato ou parceria..." data-testid="input-notes"
                                style={{ ...tiInput, resize: "none", lineHeight: 1.6 }}
                                onFocus={e => { e.currentTarget.style.backgroundColor = "#fff"; e.currentTarget.style.boxShadow = "0 0 0 2px rgba(249,115,22,0.2)"; }}
                                onBlur={e =>  { e.currentTarget.style.backgroundColor = "#f0efee"; e.currentTarget.style.boxShadow = "none"; }}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                      </div>
                    </section>
                  </div>
                </form>
              </Form>
            </div>

            {/* Footer */}
            <div style={{ padding: "18px 32px", borderTop: `1px solid ${T.border}`, backgroundColor: T.low, display: "flex", justifyContent: "flex-end", gap: 14, flexShrink: 0 }}>
              <button type="button" data-testid="button-cancel" onClick={closeModal}
                style={{ padding: "11px 22px", background: "none", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 800, color: T.second, textTransform: "uppercase", letterSpacing: "0.12em", fontFamily: "'Space Grotesk', sans-serif", borderRadius: 6, transition: "background 0.15s" }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = T.border)}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}
              >
                Cancelar
              </button>
              <button type="submit" form="sponsor-form" data-testid="button-submit"
                disabled={createMutation.isPending || updateMutation.isPending}
                style={{ padding: "11px 32px", backgroundColor: T.dark, color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", fontFamily: "'Space Grotesk', sans-serif", opacity: createMutation.isPending || updateMutation.isPending ? 0.6 : 1, transition: "background 0.15s" }}
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
          style={{ position: "fixed", inset: 0, backgroundColor: "rgba(28,25,23,0.65)", backdropFilter: "blur(5px)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={e => { if (e.target === e.currentTarget) setDeletingSponsor(null); }}
        >
          <div data-testid="dialog-confirm-delete" style={{ backgroundColor: T.surface, width: "100%", maxWidth: 440, borderRadius: 12, overflow: "hidden", boxShadow: "0 32px 80px -16px rgba(0,0,0,0.35)", border: `1px solid #fecaca` }}>
            {/* Red banner */}
            <div style={{ backgroundColor: "#ef4444", padding: "14px 24px", display: "flex", alignItems: "center", gap: 10 }}>
              <AlertTriangle style={{ width: 18, height: 18, color: "#fff", flexShrink: 0 }} />
              <span style={{ fontSize: 10, fontWeight: 900, color: "#fff", textTransform: "uppercase", letterSpacing: "0.14em", fontFamily: "'Space Grotesk', sans-serif" }}>
                Atenção: Ação Irreversível
              </span>
            </div>
            {/* Body */}
            <div style={{ padding: "28px 28px 20px" }}>
              <h3 style={{ fontSize: 22, fontWeight: 900, color: T.text, margin: "0 0 12px", fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "-0.03em" }}>
                Excluir Patrocinador?
              </h3>
              <p style={{ fontSize: 13, color: T.second, margin: 0, lineHeight: 1.6 }}>
                Você está prestes a excluir o patrocinador{" "}
                <strong style={{ color: T.text }}>{deletingSponsor.name}</strong>. Esta ação removerá todos os vínculos com eventos ativos. Deseja continuar?
              </p>
            </div>
            {/* Footer */}
            <div style={{ padding: "14px 28px 24px", display: "flex", justifyContent: "flex-end", gap: 20 }}>
              <button data-testid="button-cancel-delete" onClick={() => setDeletingSponsor(null)}
                style={{ padding: "8px 0", background: "none", border: "none", cursor: "pointer", fontSize: 10, fontWeight: 900, color: T.muted, textTransform: "uppercase", letterSpacing: "0.12em", fontFamily: "'Space Grotesk', sans-serif" }}>
                Manter
              </button>
              <button data-testid="button-confirm-delete"
                onClick={() => deleteMutation.mutate(deletingSponsor.id)}
                disabled={deleteMutation.isPending}
                style={{ padding: "10px 24px", backgroundColor: "#ef4444", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em", fontFamily: "'Space Grotesk', sans-serif", opacity: deleteMutation.isPending ? 0.6 : 1 }}>
                {deleteMutation.isPending ? "Excluindo..." : "Sim, Excluir"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
