import { AlertTriangle, CheckCircle2, Loader2, ShieldCheck, UserRound, UsersRound } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { T } from "@/lib/theme";

type Proposta = {
  sponsorId: string;
  sponsorName: string;
  decidingName: string;
  totalDecisions: number;
  decisionsByTop: number;
  share: number;
  user: { id: string; name: string; email: string; role: string };
};

type Duvidosa = {
  sponsorId: string;
  sponsorName: string;
  decidingName: string;
  totalDecisions: number;
  decisionsByTop: number;
  reason: string;
};

type Relatorio = {
  totalSponsors: number;
  alreadyAssigned: number;
  withoutExecutive: number;
  claras: Proposta[];
  duvidosas: Duvidosa[];
  semSinal: Array<{ sponsorId: string; sponsorName: string }>;
};

type ResultadoAplicacao = {
  totalPropostasClaras: number;
  aplicados: number;
  duvidosas: number;
  semSinal: number;
};

const pct = (value: number) => `${Math.round(value * 100)}%`;

export default function InferirExecutivos() {
  const { toast } = useToast();
  const { data, isLoading, isError, refetch } = useQuery<Relatorio>({
    queryKey: ["/api/admin/inferir-executivos"],
  });

  const aplicarMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/admin/inferir-executivos", { confirm: true });
      return response.json() as Promise<ResultadoAplicacao>;
    },
    onSuccess: async (resultado) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/admin/inferir-executivos"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/sponsors"] }),
      ]);
      toast({
        title: "Executivos vinculados",
        description: `${resultado.aplicados} patrocinador(es) atualizado(s).`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Não foi possível aplicar as propostas",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const confirmarAplicacao = () => {
    const total = data?.claras.length ?? 0;
    if (!total || aplicarMutation.isPending) return;
    const confirmado = window.confirm(
      `Vincular os executivos dos ${total} patrocinadores claros agora?\n\n` +
      "Casos duvidosos e sem sinal não serão alterados. Cada atualização será registrada na auditoria.",
    );
    if (confirmado) aplicarMutation.mutate();
  };

  return (
    <main style={{ maxWidth: 1180, margin: "0 auto", padding: "28px 24px 56px" }}>
      <header style={{ display: "flex", gap: 16, alignItems: "flex-start", marginBottom: 22 }}>
        <div style={{ width: 42, height: 42, borderRadius: 12, background: "#eff6ff", color: "#1d4ed8", display: "grid", placeItems: "center", flexShrink: 0 }}>
          <UserRound size={21} />
        </div>
        <div>
          <p style={{ margin: "1px 0 5px", color: "#1d4ed8", fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase" }}>
            Administração
          </p>
          <h1 style={{ margin: 0, color: T.text, fontSize: 26, letterSpacing: "-0.03em" }}>Inferir executivos</h1>
          <p style={{ margin: "7px 0 0", color: T.second, maxWidth: 740, fontSize: 13, lineHeight: 1.55 }}>
            Use o histórico de decisões para propor o executivo de conta sem sobrescrever cadastros existentes.
          </p>
        </div>
      </header>

      {isLoading ? (
        <section style={{ padding: "52px 24px", border: `1px solid ${T.border}`, borderRadius: 14, textAlign: "center", color: T.second, background: T.surface }}>
          <Loader2 size={21} style={{ animation: "spin 1s linear infinite", verticalAlign: "middle", marginRight: 8 }} />
          Calculando a prévia…
        </section>
      ) : isError ? (
        <section style={{ padding: "32px 24px", border: "1px solid #fecaca", borderRadius: 14, background: "#fff8f8" }}>
          <strong style={{ color: "#991b1b" }}>Não foi possível carregar a prévia.</strong>
          <button onClick={() => refetch()} style={{ display: "block", marginTop: 14, border: 0, borderRadius: 7, background: "#1c1917", color: "white", padding: "9px 14px", fontWeight: 700, cursor: "pointer" }}>
            Tentar novamente
          </button>
        </section>
      ) : (
        <>
          <section style={{ display: "flex", gap: 14, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", padding: "18px 20px", border: `1px solid ${data?.claras.length ? "#bfdbfe" : "#bbf7d0"}`, borderRadius: 14, background: data?.claras.length ? "#eff6ff" : "#f0fdf4", marginBottom: 18 }}>
            <div style={{ display: "flex", gap: 11, alignItems: "center" }}>
              {data?.claras.length ? <UsersRound color="#1d4ed8" size={22} /> : <CheckCircle2 color="#15803d" size={22} />}
              <div>
                <strong style={{ display: "block", color: data?.claras.length ? "#1e40af" : "#166534", fontSize: 15 }}>
                  {data?.claras.length ? `${data.claras.length} proposta(s) clara(s)` : "Nenhuma proposta clara pendente"}
                </strong>
                <span style={{ color: T.second, fontSize: 12 }}>
                  {data?.withoutExecutive} sem executivo · {data?.alreadyAssigned} já preenchido(s)
                </span>
              </div>
            </div>
            {!!data?.claras.length && (
              <button
                onClick={confirmarAplicacao}
                disabled={aplicarMutation.isPending}
                style={{ border: 0, borderRadius: 8, background: "#1d4ed8", color: "white", padding: "10px 15px", fontSize: 12, fontWeight: 800, cursor: aplicarMutation.isPending ? "wait" : "pointer", opacity: aplicarMutation.isPending ? 0.72 : 1 }}
              >
                {aplicarMutation.isPending ? "Aplicando…" : `Aplicar ${data.claras.length} claros`}
              </button>
            )}
          </section>

          <section style={{ display: "flex", gap: 8, alignItems: "center", padding: "11px 14px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, color: "#475569", fontSize: 12, lineHeight: 1.45, marginBottom: 22 }}>
            <ShieldCheck size={17} style={{ flexShrink: 0, color: "#1d4ed8" }} />
            Só entram propostas com nome único, usuário do Atendimento e mais de 50% das decisões. Executivos já cadastrados nunca são substituídos.
          </section>

          <section style={{ marginBottom: 26 }}>
            <h2 style={{ margin: "0 0 10px", color: T.text, fontSize: 16 }}>Propostas claras</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {data?.claras.map((proposta) => (
                <article key={proposta.sponsorId} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, alignItems: "center", padding: "14px 16px", border: `1px solid ${T.border}`, borderRadius: 11, background: T.surface }}>
                  <div style={{ minWidth: 0 }}>
                    <span style={{ display: "block", color: "#64748b", fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>Patrocinador</span>
                    <strong style={{ display: "block", marginTop: 3, color: T.text, fontSize: 14, overflowWrap: "anywhere" }}>{proposta.sponsorName}</strong>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <span style={{ display: "block", color: "#64748b", fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>Executivo proposto</span>
                    <strong style={{ display: "block", marginTop: 3, color: "#1d4ed8", fontSize: 14, overflowWrap: "anywhere" }}>{proposta.user.name}</strong>
                    <span style={{ display: "block", marginTop: 2, color: T.second, fontSize: 11, overflowWrap: "anywhere" }}>{proposta.user.email}</span>
                  </div>
                  <div style={{ color: T.second, fontSize: 12 }}>
                    <strong style={{ color: T.text }}>{proposta.decisionsByTop} de {proposta.totalDecisions} decisões</strong>
                    <span style={{ display: "block", marginTop: 2 }}>{pct(proposta.share)} de participação</span>
                  </div>
                </article>
              ))}
              {!data?.claras.length && <p style={{ color: T.second, fontSize: 13 }}>Nenhuma proposta clara no momento.</p>}
            </div>
          </section>

          <section style={{ marginBottom: 22 }}>
            <h2 style={{ display: "flex", gap: 7, alignItems: "center", margin: "0 0 10px", color: "#92400e", fontSize: 16 }}>
              <AlertTriangle size={17} /> Preservados para decisão manual ({data?.duvidosas.length})
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {data?.duvidosas.map((caso) => (
                <article key={caso.sponsorId} style={{ padding: "13px 16px", border: "1px solid #fde68a", borderRadius: 11, background: "#fffbeb", color: "#78350f", fontSize: 12 }}>
                  <strong>{caso.sponsorName}</strong>
                  <span> — quem mais decide é “{caso.decidingName}” ({caso.decisionsByTop} de {caso.totalDecisions}); {caso.reason}.</span>
                </article>
              ))}
              {!data?.duvidosas.length && <p style={{ color: T.second, fontSize: 13 }}>Nenhum caso duvidoso.</p>}
            </div>
          </section>

          <section>
            <h2 style={{ margin: "0 0 10px", color: T.second, fontSize: 16 }}>Sem sinal histórico ({data?.semSinal.length})</h2>
            <p style={{ margin: 0, color: T.second, fontSize: 12, lineHeight: 1.5 }}>
              Estes patrocinadores não serão atribuídos automaticamente: {data?.semSinal.map((sponsor) => sponsor.sponsorName).join(", ") || "nenhum"}.
            </p>
          </section>
        </>
      )}
    </main>
  );
}