import { CheckCircle2, Link2, Loader2, ShieldCheck, Wrench } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { T } from "@/lib/theme";

type Vinculo = {
  eventId: string;
  sponsorId: string;
  eventName: string;
  sponsorName: string;
  provas: string[];
};

type Previa = { vinculos: Vinculo[]; total: number };
type Resultado = { totalEncontrado: number; aplicados: number };

export default function ReparoVinculosEvento() {
  const { toast } = useToast();
  const { data, isLoading, isError, refetch } = useQuery<Previa>({
    queryKey: ["/api/admin/reparo-vinculos-evento"],
  });

  const aplicarMutation = useMutation({
    mutationFn: async () => {
      const resposta = await apiRequest("POST", "/api/admin/reparo-vinculos-evento", { confirm: true });
      return resposta.json() as Promise<Resultado>;
    },
    onSuccess: async (resultado) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/admin/reparo-vinculos-evento"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/events"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/items"] }),
      ]);
      toast({
        title: "Vínculos reparados",
        description: `${resultado.aplicados} vínculo(s) criado(s) na produção.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Não foi possível reparar os vínculos",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const confirmarAplicacao = () => {
    const total = data?.total ?? 0;
    if (!total || aplicarMutation.isPending) return;
    const confirmado = window.confirm(
      `Criar os ${total} vínculos evento–patrocinador agora?\n\n` +
      "A ação não remove nem altera peças, aprovações ou cotas. Cada vínculo será registrado na auditoria.",
    );
    if (confirmado) aplicarMutation.mutate();
  };

  return (
    <main style={{ maxWidth: 1180, margin: "0 auto", padding: "28px 24px 56px" }}>
      <header style={{ display: "flex", gap: 16, alignItems: "flex-start", marginBottom: 22 }}>
        <div style={{ width: 42, height: 42, borderRadius: 12, background: "#eff6ff", color: "#1d4ed8", display: "grid", placeItems: "center", flexShrink: 0 }}>
          <Wrench size={21} />
        </div>
        <div>
          <p style={{ margin: "1px 0 5px", color: "#1d4ed8", fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase" }}>
            Administração
          </p>
          <h1 style={{ margin: 0, color: T.text, fontSize: 26, letterSpacing: "-0.03em" }}>Reparo de vínculos</h1>
          <p style={{ margin: "7px 0 0", color: T.second, maxWidth: 720, fontSize: 13, lineHeight: 1.55 }}>
            Confirme os patrocinadores que já estão nas peças, mas ainda não foram cadastrados no evento.
          </p>
        </div>
      </header>

      {isLoading ? (
        <section style={{ padding: "52px 24px", border: `1px solid ${T.border}`, borderRadius: 14, textAlign: "center", color: T.second, background: T.surface }}>
          <Loader2 size={21} style={{ animation: "spin 1s linear infinite", verticalAlign: "middle", marginRight: 8 }} />
          Carregando prévia dos vínculos…
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
          <section style={{ display: "flex", gap: 14, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", padding: "18px 20px", border: `1px solid ${data?.total ? "#bfdbfe" : "#bbf7d0"}`, borderRadius: 14, background: data?.total ? "#eff6ff" : "#f0fdf4", marginBottom: 18 }}>
            <div style={{ display: "flex", gap: 11, alignItems: "center" }}>
              {data?.total ? <Link2 color="#1d4ed8" size={22} /> : <CheckCircle2 color="#15803d" size={22} />}
              <div>
                <strong style={{ display: "block", color: data?.total ? "#1e40af" : "#166534", fontSize: 15 }}>
                  {data?.total ? `${data.total} vínculo(s) pendente(s)` : "Nenhum vínculo pendente"}
                </strong>
                <span style={{ color: T.second, fontSize: 12 }}>
                  {data?.total ? "Revise as provas abaixo antes de aplicar." : "O cadastro de patrocinadores já bate com as peças ativas."}
                </span>
              </div>
            </div>
            {!!data?.total && (
              <button
                onClick={confirmarAplicacao}
                disabled={aplicarMutation.isPending}
                style={{ border: 0, borderRadius: 8, background: "#1d4ed8", color: "white", padding: "10px 15px", fontSize: 12, fontWeight: 800, cursor: aplicarMutation.isPending ? "wait" : "pointer", opacity: aplicarMutation.isPending ? 0.72 : 1 }}
              >
                {aplicarMutation.isPending ? "Aplicando…" : `Aplicar ${data.total} vínculos`}
              </button>
            )}
          </section>

          <section style={{ display: "flex", gap: 8, alignItems: "center", padding: "11px 14px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, color: "#475569", fontSize: 12, lineHeight: 1.45, marginBottom: 18 }}>
            <ShieldCheck size={17} style={{ flexShrink: 0, color: "#1d4ed8" }} />
            A aplicação é somente aditiva: não remove vínculos existentes, não altera cotas e grava uma linha de auditoria por inclusão.
          </section>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {data?.vinculos.map((vinculo) => (
              <article key={`${vinculo.eventId}-${vinculo.sponsorId}`} style={{ display: "flex", gap: 14, alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", padding: "15px 17px", border: `1px solid ${T.border}`, borderRadius: 12, background: T.surface }}>
                <div style={{ minWidth: 240 }}>
                  <span style={{ display: "block", color: "#64748b", fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>Evento</span>
                  <strong style={{ display: "block", marginTop: 3, color: T.text, fontSize: 14 }}>{vinculo.eventName}</strong>
                </div>
                <div style={{ minWidth: 220 }}>
                  <span style={{ display: "block", color: "#64748b", fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>Patrocinador</span>
                  <strong style={{ display: "block", marginTop: 3, color: "#1d4ed8", fontSize: 14 }}>{vinculo.sponsorName}</strong>
                </div>
                <div style={{ flex: "1 1 260px", color: T.second, fontSize: 12 }}>
                  Presente em {vinculo.provas.length} peça(s):{" "}
                  <span style={{ color: T.text, overflowWrap: "anywhere" }}>{vinculo.provas.slice(0, 8).join(", ")}{vinculo.provas.length > 8 ? "…" : ""}</span>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </main>
  );
}