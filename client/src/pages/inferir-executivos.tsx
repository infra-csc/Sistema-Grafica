import { AlertTriangle, CheckCircle2, ShieldCheck, UserRound, UsersRound } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { T, TOM, FS, FW, R } from "@/lib/theme";
import { Botao } from "@/components/ui/botao";
import { CabecalhoDaPagina } from "@/components/ui/cabecalho-da-pagina";
import { EstadoErro, Esqueleto } from "@/components/ui/estados";
import { useConfirmar } from "@/components/ui/usar-confirmar";

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

// Rótulo em caixa-alta acima de cada campo do cartão de proposta.
const rotulo = {
  display: "block", color: T.second, fontSize: FS.micro, fontWeight: FW.rotulo,
  letterSpacing: "0.08em", textTransform: "uppercase",
} as const;

export default function InferirExecutivos() {
  const { toast } = useToast();
  const { confirmar, dialogo } = useConfirmar();
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
        variant: "success",
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

  const confirmarAplicacao = async () => {
    const total = data?.claras.length ?? 0;
    if (!total || aplicarMutation.isPending) return;
    // Não é perigo: só preenche executivo onde está vazio — nada é apagado.
    const confirmado = await confirmar({
      titulo: `Vincular os executivos dos ${total} patrocinadores claros agora?`,
      descricao: "Casos duvidosos e sem sinal não serão alterados. Cada atualização será registrada na auditoria.",
      confirmar: "Vincular executivos",
      icone: UsersRound,
    });
    if (confirmado) aplicarMutation.mutate();
  };

  const temClaras = !!data?.claras.length;

  return (
    <main style={{ maxWidth: 1180, margin: "0 auto", padding: "28px 24px 56px" }}>
      <CabecalhoDaPagina
        icone={UserRound}
        titulo="Inferir executivos"
        subtitulo={data ? `${data.totalSponsors} patrocinadores · ${data.withoutExecutive} sem executivo` : undefined}
      />
      <p style={{ margin: "-8px 0 22px", color: T.second, maxWidth: 740, fontSize: FS.body, lineHeight: 1.55 }}>
        Use o histórico de decisões para propor o executivo de conta sem sobrescrever cadastros existentes.
      </p>

      {isLoading ? (
        <Esqueleto variante="lista" linhas={4} rotulo="Calculando a prévia" />
      ) : isError ? (
        <EstadoErro titulo="Não foi possível carregar a prévia." aoTentarDeNovo={() => refetch()} />
      ) : (
        <>
          <section style={{ display: "flex", gap: 14, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", padding: "18px 20px", border: `1px solid ${temClaras ? TOM.info.border : TOM.sucesso.border}`, borderRadius: R.lg, background: temClaras ? TOM.info.bg : TOM.sucesso.bg, marginBottom: 18 }}>
            <div style={{ display: "flex", gap: 11, alignItems: "center" }}>
              {temClaras ? <UsersRound aria-hidden="true" color={TOM.info.text} size={22} /> : <CheckCircle2 aria-hidden="true" color={TOM.sucesso.text} size={22} />}
              <div>
                <strong style={{ display: "block", color: temClaras ? TOM.info.text : TOM.sucesso.text, fontSize: FS.strong }}>
                  {temClaras ? `${data!.claras.length} proposta(s) clara(s)` : "Nenhuma proposta clara pendente"}
                </strong>
                <span style={{ color: T.second, fontSize: FS.meta }}>
                  {data?.withoutExecutive} sem executivo · {data?.alreadyAssigned} já preenchido(s)
                </span>
              </div>
            </div>
            {temClaras && (
              <Botao variante="primario" onClick={confirmarAplicacao} carregando={aplicarMutation.isPending}>
                {aplicarMutation.isPending ? "Aplicando…" : `Aplicar ${data!.claras.length} claros`}
              </Botao>
            )}
          </section>

          <section style={{ display: "flex", gap: 8, alignItems: "center", padding: "11px 14px", background: T.bg, border: `1px solid ${T.border}`, borderRadius: R.md, color: T.apoio, fontSize: FS.meta, lineHeight: 1.45, marginBottom: 22 }}>
            <ShieldCheck aria-hidden="true" size={17} style={{ flexShrink: 0, color: TOM.info.text }} />
            Só entram propostas com nome único, usuário do Atendimento e mais de 50% das decisões. Executivos já cadastrados nunca são substituídos.
          </section>

          <section style={{ marginBottom: 26 }}>
            <h2 style={{ margin: "0 0 10px", color: T.text, fontSize: FS.lead }}>Propostas claras</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {data?.claras.map((proposta) => (
                <article key={proposta.sponsorId} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, alignItems: "center", padding: "14px 16px", border: `1px solid ${T.border}`, borderRadius: R.lg, background: T.surface }}>
                  <div style={{ minWidth: 0 }}>
                    <span style={rotulo}>Patrocinador</span>
                    <strong style={{ display: "block", marginTop: 3, color: T.text, fontSize: FS.read, overflowWrap: "anywhere" }}>{proposta.sponsorName}</strong>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <span style={rotulo}>Executivo proposto</span>
                    <strong style={{ display: "block", marginTop: 3, color: TOM.info.text, fontSize: FS.read, overflowWrap: "anywhere" }}>{proposta.user.name}</strong>
                    <span style={{ display: "block", marginTop: 2, color: T.second, fontSize: FS.small, overflowWrap: "anywhere" }}>{proposta.user.email}</span>
                  </div>
                  <div style={{ color: T.second, fontSize: FS.meta }}>
                    <strong style={{ color: T.text }}>{proposta.decisionsByTop} de {proposta.totalDecisions} decisões</strong>
                    <span style={{ display: "block", marginTop: 2 }}>{pct(proposta.share)} de participação</span>
                  </div>
                </article>
              ))}
              {!data?.claras.length && <p style={{ color: T.second, fontSize: FS.body }}>Nenhuma proposta clara no momento.</p>}
            </div>
          </section>

          <section style={{ marginBottom: 22 }}>
            <h2 style={{ display: "flex", gap: 7, alignItems: "center", margin: "0 0 10px", color: TOM.alerta.text, fontSize: FS.lead }}>
              <AlertTriangle aria-hidden="true" size={17} /> Preservados para decisão manual ({data?.duvidosas.length})
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {data?.duvidosas.map((caso) => (
                <article key={caso.sponsorId} style={{ padding: "13px 16px", border: `1px solid ${TOM.alerta.border}`, borderRadius: R.lg, background: TOM.alerta.bg, color: TOM.alerta.text, fontSize: FS.meta }}>
                  <strong>{caso.sponsorName}</strong>
                  <span> — quem mais decide é “{caso.decidingName}” ({caso.decisionsByTop} de {caso.totalDecisions}); {caso.reason}.</span>
                </article>
              ))}
              {!data?.duvidosas.length && <p style={{ color: T.second, fontSize: FS.body }}>Nenhum caso duvidoso.</p>}
            </div>
          </section>

          <section>
            <h2 style={{ margin: "0 0 10px", color: T.second, fontSize: FS.lead }}>Sem sinal histórico ({data?.semSinal.length})</h2>
            <p style={{ margin: 0, color: T.second, fontSize: FS.meta, lineHeight: 1.5 }}>
              Estes patrocinadores não serão atribuídos automaticamente: {data?.semSinal.map((sponsor) => sponsor.sponsorName).join(", ") || "nenhum"}.
            </p>
          </section>
        </>
      )}
      {dialogo}
    </main>
  );
}
