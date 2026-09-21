import { useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, FilePenLine, Loader2, ShieldCheck, Wand2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { T, FS, R } from "@/lib/theme";

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

/** "1 registro" / "3 registros" — o "registro(s)" lia como formulário de repartição. */
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

function nomeDaOrigem(reparo: Reparo) {
  if (reparo.origem === "aprovacao_patrocinador") return "Motivo de patrocinador";
  return reparo.campo === "observations" ? "Observações da peça" : "Motivo da peça";
}

export default function ReparoMotivos() {
  const { toast } = useToast();
  const isMobile = useIsMobile();
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
      // O servidor já devolvia quantos ficaram de fora por terem sido editados
      // no meio do caminho — e o toast escondia. É exatamente a garantia que o
      // aviso azul promete; o resultado precisa confirmá-la.
      const preservados = resultado.ignoradosPorMudanca ?? 0;
      toast({
        title: "Textos corrigidos",
        description: `${plural(resultado.aplicados, "registro atualizado", "registros atualizados")}.`
          + (preservados > 0 ? ` ${plural(preservados, "foi preservado", "foram preservados")} porque mudou durante a aplicação.` : ""),
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

  // <div>, não <main>: o SidebarInset do App já É o <main> da página — um
  // segundo landmark "principal" aninhado confundia a navegação por regiões
  // do leitor de tela. Casca, respiro e cabeçalho iguais aos das outras telas
  // de administração (Usuários, Logs, Notificações).
  return (
    <div style={{ backgroundColor: T.bg, height: "100%", overflowY: "auto", padding: isMobile ? "16px 16px 48px" : "28px 32px 64px" }}>
      <div style={{ maxWidth: 1180 }}>
      <header style={{ display: "flex", gap: 16, alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: "0 0 6px", color: T.text, fontFamily: "'Space Grotesk', sans-serif", fontSize: FS.h1, fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1.1 }}>Correção de textos</h1>
          <p style={{ margin: 0, color: T.second, maxWidth: 640, fontSize: FS.body, lineHeight: 1.5 }}>
            Prévia das mensagens afetadas pelo erro que substituiu a letra “s” por espaços. Só correções revisadas são listadas.
          </p>
          {/* PARA QUE SERVE E O QUE ACONTECE AO APLICAR — quem abre esta tela
              pela primeira vez vê "Correção de textos" no menu sem saber se é
              rotina ou conserto pontual. É conserto de UM bug: nada aqui é
              trabalho recorrente, e aplicar grava uma linha "Texto corrigido"
              por registro na trilha (services/reparoMotivosSemS.ts), o que
              responde "quem mexeu no motivo?" depois. */}
          <p style={{ margin: "6px 0 0", color: "#57534e", maxWidth: 680, fontSize: 12.5, lineHeight: 1.5 }}>
            É um conserto pontual, não uma rotina: confira “como está” e “como ficará” abaixo e aplique uma vez. Cada texto corrigido fica registrado nos Logs do Sistema com o seu nome.
          </p>
        </div>
      </header>

      {isLoading ? (
        <section role="status" aria-label="Carregando prévia das correções" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Esqueleto na silhueta do resumo + dois cartões "como está / como
              ficará", pulso só com motion-safe — o mesmo carregamento das
              outras telas, no lugar da frase com ícone girando. */}
          <div className="motion-safe:animate-pulse" style={{ height: 76, borderRadius: 12, background: T.surface, border: `1px solid ${T.border}` }} />
          {[0, 1].map((i) => (
            <div key={i} className="motion-safe:animate-pulse" style={{ height: 150, borderRadius: 12, background: T.surface, border: `1px solid ${T.border}` }} />
          ))}
        </section>
      ) : isError ? (
        <section role="alert" style={{ padding: "56px 24px", border: `1px solid ${T.border}`, borderRadius: 12, background: T.surface, textAlign: "center" }}>
          <p style={{ margin: "0 0 4px", color: T.text, fontSize: 13, fontWeight: 700 }}>Não foi possível carregar a prévia</p>
          <p style={{ margin: "0 0 16px", color: T.second, fontSize: 12 }}>Nenhum texto foi alterado. Verifique a conexão e tente de novo.</p>
          <button type="button" onClick={() => refetch()} style={{ display: "inline-flex", alignItems: "center", height: 36, padding: "0 18px", border: 0, borderRadius: R.md, background: T.dark, color: "#fff", fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", cursor: "pointer" }}>Tentar novamente</button>
        </section>
      ) : (
        <>
          <section aria-live="polite" style={{ display: "flex", gap: 14, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", padding: "16px 20px", border: `1px solid ${data?.total ? "#fed7aa" : "#bbf7d0"}`, borderRadius: 12, background: data?.total ? "#fffaf5" : "#f0fdf4", marginBottom: 16 }}>
            <div style={{ display: "flex", gap: 11, alignItems: "center" }}>
              {data?.total ? <FilePenLine aria-hidden="true" color="#c2410c" size={22} style={{ flexShrink: 0 }} /> : <CheckCircle2 aria-hidden="true" color="#15803d" size={22} style={{ flexShrink: 0 }} />}
              <div>
                <strong style={{ display: "block", color: data?.total ? "#9a3412" : "#166534", fontSize: 15 }}>
                  {data?.total ? `${plural(data.total, "registro pronto", "registros prontos")} para correção` : "Nenhuma correção pendente"}
                </strong>
                <span style={{ color: T.second, fontSize: 12 }}>
                  {data?.total ? `${plural(grupos.length, "texto distinto revisado", "textos distintos revisados")}, agrupados abaixo.` : "As mensagens revisadas já foram atualizadas."}
                </span>
              </div>
            </div>
            {!!data?.total && (
              // Primário ESCURO, como o de toda tela de administração: aplicar
              // corrige texto, não apaga nada — o vermelho cheio anterior dizia
              // "destrutivo". A confirmação antes de gravar continua.
              <button
                type="button"
                onClick={confirmarAplicacao}
                disabled={aplicarMutation.isPending}
                aria-busy={aplicarMutation.isPending}
                onMouseEnter={(e) => { if (!aplicarMutation.isPending) e.currentTarget.style.background = "#292524"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = T.dark; }}
                style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, height: 40, padding: "0 18px", border: 0, borderRadius: R.md, background: T.dark, color: "#fff", fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", whiteSpace: "nowrap", cursor: aplicarMutation.isPending ? "wait" : "pointer", opacity: aplicarMutation.isPending ? 0.72 : 1, width: isMobile ? "100%" : undefined, transition: "background-color 0.15s ease" }}
              >
                {aplicarMutation.isPending
                  ? <Loader2 aria-hidden="true" className="motion-safe:animate-spin" style={{ width: 14, height: 14 }} />
                  : <Wand2 aria-hidden="true" style={{ width: 14, height: 14 }} />}
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
                    <strong style={{ display: "block", marginTop: 2, color: T.text, fontSize: 13 }}>{plural(displayIds.length, "registro", "registros")}</strong>
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
      </div>
    </div>
  );
}