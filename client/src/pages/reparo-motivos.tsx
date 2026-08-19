import { useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, FilePenLine, Loader2, ShieldCheck, Wand2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { T } from "@/lib/theme";

type Reparo = {
  recordId: string;
  displayId: string | null;
  origem: "item" | "aprovacao_patrocinador";
  campo: "rejectionReason" | "observations";
  antes: string;
  depois: string;
};

type Previa = { reparos: Reparo[]; total: number };
type Resultado = { totalEncontrado: number; aplicados: number; ignoradosPorMudanca: number };

function nomeDaOrigem(reparo: Reparo) {
  if (reparo.origem === "aprovacao_patrocinador") return "Motivo de patrocinador";
  return reparo.campo === "observations" ? "Observações da peça" : "Motivo da peça";
}

export default function ReparoMotivos() {
  const { toast } = useToast();
  const { data, isLoading, isError, refetch } = useQuery<Previa>({
    queryKey: ["/api/admin/reparo-motivos-sem-s"],
  });

  const grupos = useMemo(() => {
    const mapa = new Map<string, { exemplo: Reparo; displayIds: string[] }>();
    for (const reparo of data?.reparos ?? []) {
      const chave = `${reparo.origem}|${reparo.campo}|${reparo.antes}|${reparo.depois}`;
      const grupo = mapa.get(chave) ?? { exemplo: reparo, displayIds: [] };
      grupo.displayIds.push(reparo.displayId ?? reparo.recordId);
      mapa.set(chave, grupo);
    }
    return Array.from(mapa.values());
  }, [data?.reparos]);

  const aplicarMutation = useMutation({
    mutationFn: async () => {
      const resposta = await apiRequest("POST", "/api/admin/reparo-motivos-sem-s", { confirm: true });
      return resposta.json() as Promise<Resultado>;
    },
    onSuccess: async (resultado) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/reparo-motivos-sem-s"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      toast({
        title: "Textos corrigidos",
        description: `${resultado.aplicados} registro(s) atualizado(s).`,
      });
    },
    onError: (error: Error) => {
      toast({ title: "Não foi possível aplicar as correções", description: error.message, variant: "destructive" });
    },
  });

  const confirmarAplicacao = () => {
    const total = data?.total ?? 0;
    if (!total || aplicarMutation.isPending) return;
    const confirmado = window.confirm(
      `Aplicar as ${total} correções revisadas agora?\n\nOs textos serão atualizados nos itens e nas aprovações de patrocinadores. Logs e notificações existentes não serão modificados.`,
    );
    if (confirmado) aplicarMutation.mutate();
  };

  return (
    <main style={{ maxWidth: 1180, margin: "0 auto", padding: "28px 24px 56px" }}>
      <header style={{ display: "flex", gap: 16, alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", marginBottom: 22 }}>
        <div style={{ display: "flex", gap: 13, alignItems: "flex-start" }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: "#fef2f2", color: "#b91c1c", display: "grid", placeItems: "center", flexShrink: 0 }}>
            <Wand2 size={21} />
          </div>
          <div>
            <p style={{ margin: "1px 0 5px", color: "#b91c1c", fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase" }}>Administração</p>
            <h1 style={{ margin: 0, color: T.text, fontSize: 26, letterSpacing: "-0.03em" }}>Correção de textos</h1>
            <p style={{ margin: "7px 0 0", color: T.second, maxWidth: 680, fontSize: 13, lineHeight: 1.55 }}>
              Prévia das mensagens afetadas pelo erro que substituiu a letra “s” por espaços. Só correções revisadas são listadas.
            </p>
          </div>
        </div>
      </header>

      {isLoading ? (
        <section style={{ padding: "52px 24px", border: `1px solid ${T.border}`, borderRadius: 14, textAlign: "center", color: T.second, background: T.surface }}>
          <Loader2 size={21} style={{ animation: "spin 1s linear infinite", verticalAlign: "middle", marginRight: 8 }} />
          Carregando prévia das correções…
        </section>
      ) : isError ? (
        <section style={{ padding: "32px 24px", border: "1px solid #fecaca", borderRadius: 14, background: "#fff8f8" }}>
          <strong style={{ color: "#991b1b" }}>Não foi possível carregar a prévia.</strong>
          <button onClick={() => refetch()} style={{ display: "block", marginTop: 14, border: 0, borderRadius: 7, background: "#b91c1c", color: "white", padding: "9px 14px", fontWeight: 700, cursor: "pointer" }}>Tentar novamente</button>
        </section>
      ) : (
        <>
          <section style={{ display: "flex", gap: 14, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", padding: "18px 20px", border: `1px solid ${data?.total ? "#fed7aa" : "#bbf7d0"}`, borderRadius: 14, background: data?.total ? "#fffaf5" : "#f0fdf4", marginBottom: 18 }}>
            <div style={{ display: "flex", gap: 11, alignItems: "center" }}>
              {data?.total ? <FilePenLine color="#c2410c" size={22} /> : <CheckCircle2 color="#15803d" size={22} />}
              <div>
                <strong style={{ display: "block", color: data?.total ? "#9a3412" : "#166534", fontSize: 15 }}>
                  {data?.total ? `${data.total} registro(s) prontos para correção` : "Nenhuma correção pendente"}
                </strong>
                <span style={{ color: T.second, fontSize: 12 }}>
                  {data?.total ? `${grupos.length} texto(s) distinto(s) revisado(s), agrupados abaixo.` : "As mensagens revisadas já foram atualizadas."}
                </span>
              </div>
            </div>
            {!!data?.total && (
              <button
                onClick={confirmarAplicacao}
                disabled={aplicarMutation.isPending}
                style={{ border: 0, borderRadius: 8, background: "#b91c1c", color: "white", padding: "10px 15px", fontSize: 12, fontWeight: 800, cursor: aplicarMutation.isPending ? "wait" : "pointer", opacity: aplicarMutation.isPending ? 0.72 : 1 }}
              >
                {aplicarMutation.isPending ? "Aplicando…" : `Aplicar ${data.total} correções`}
              </button>
            )}
          </section>

          <section style={{ display: "flex", gap: 8, alignItems: "center", padding: "11px 14px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, color: "#475569", fontSize: 12, lineHeight: 1.45, marginBottom: 18 }}>
            <ShieldCheck size={17} style={{ flexShrink: 0, color: "#1d4ed8" }} />
            A aplicação compara o texto original antes de gravar. Se alguém o editar durante este processo, ele é preservado e fica de fora da atualização.
          </section>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {grupos.map(({ exemplo, displayIds }) => (
              <article key={`${exemplo.origem}-${exemplo.antes}`} style={{ border: `1px solid ${T.border}`, borderRadius: 14, overflow: "hidden", background: T.surface }}>
                <div style={{ padding: "12px 16px", background: "#fafaf9", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <div>
                    <span style={{ color: "#9a3412", fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>{nomeDaOrigem(exemplo)}</span>
                    <strong style={{ display: "block", marginTop: 2, color: T.text, fontSize: 13 }}>{displayIds.length} registro(s)</strong>
                  </div>
                  <span style={{ color: T.second, fontSize: 11, maxWidth: "100%", overflowWrap: "anywhere" }}>{displayIds.join(", ")}</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 1, background: T.border }}>
                  <div style={{ padding: 15, background: "#fff8f8" }}>
                    <span style={{ fontSize: 10, fontWeight: 800, color: "#b91c1c", textTransform: "uppercase", letterSpacing: "0.09em" }}>Como está</span>
                    <p style={{ margin: "8px 0 0", whiteSpace: "pre-wrap", fontSize: 12, color: "#5b3b3b", lineHeight: 1.55 }}>{exemplo.antes}</p>
                  </div>
                  <div style={{ padding: 15, background: "#f0fdf4" }}>
                    <span style={{ fontSize: 10, fontWeight: 800, color: "#15803d", textTransform: "uppercase", letterSpacing: "0.09em" }}>Como ficará</span>
                    <p style={{ margin: "8px 0 0", whiteSpace: "pre-wrap", fontSize: 12, color: "#28503a", lineHeight: 1.55 }}>{exemplo.depois}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </main>
  );
}