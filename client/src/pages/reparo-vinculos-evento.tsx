import { CheckCircle2, Link2, ShieldCheck, Wrench } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { T, TOM, FS, FW, R } from "@/lib/theme";
import { Botao } from "@/components/ui/botao";
import { CabecalhoDaPagina } from "@/components/ui/cabecalho-da-pagina";
import { EstadoErro, Esqueleto } from "@/components/ui/estados";
import { useConfirmar } from "@/components/ui/usar-confirmar";

type Vinculo = {
  eventId: string;
  sponsorId: string;
  eventName: string;
  sponsorName: string;
  provas: string[];
};

type Previa = { vinculos: Vinculo[]; total: number };
type Resultado = { totalEncontrado: number; aplicados: number };

// Rótulo em caixa-alta acima de cada campo do cartão de vínculo.
const rotulo = {
  display: "block", color: T.second, fontSize: FS.micro, fontWeight: FW.rotulo,
  letterSpacing: "0.08em", textTransform: "uppercase",
} as const;

export default function ReparoVinculosEvento() {
  const { toast } = useToast();
  const { confirmar, dialogo } = useConfirmar();
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
        variant: "success",
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

  const confirmarAplicacao = async () => {
    const total = data?.total ?? 0;
    if (!total || aplicarMutation.isPending) return;
    // Não é perigo: a aplicação só ACRESCENTA vínculos.
    const confirmado = await confirmar({
      titulo: `Criar os ${total} vínculos evento–patrocinador agora?`,
      descricao: "A ação não remove nem altera peças, aprovações ou cotas. Cada vínculo será registrado na auditoria.",
      confirmar: "Criar vínculos",
      icone: Link2,
    });
    if (confirmado) aplicarMutation.mutate();
  };

  const temPendente = !!data?.total;

  return (
    <main style={{ maxWidth: 1180, margin: "0 auto", padding: "28px 24px 56px" }}>
      <CabecalhoDaPagina
        icone={Wrench}
        titulo="Reparo de vínculos"
        subtitulo={data ? (data.total ? `${data.total} vínculo(s) pendente(s)` : "Nenhum vínculo pendente") : undefined}
      />
      <p style={{ margin: "-8px 0 22px", color: T.second, maxWidth: 720, fontSize: FS.body, lineHeight: 1.55 }}>
        Confirme os patrocinadores que já estão nas peças, mas ainda não foram cadastrados no evento.
      </p>

      {isLoading ? (
        <Esqueleto variante="lista" linhas={4} rotulo="Carregando prévia dos vínculos" />
      ) : isError ? (
        <EstadoErro titulo="Não foi possível carregar a prévia." aoTentarDeNovo={() => refetch()} />
      ) : (
        <>
          <section style={{ display: "flex", gap: 14, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", padding: "18px 20px", border: `1px solid ${temPendente ? TOM.info.border : TOM.sucesso.border}`, borderRadius: R.lg, background: temPendente ? TOM.info.bg : TOM.sucesso.bg, marginBottom: 18 }}>
            <div style={{ display: "flex", gap: 11, alignItems: "center" }}>
              {temPendente ? <Link2 aria-hidden="true" color={TOM.info.text} size={22} /> : <CheckCircle2 aria-hidden="true" color={TOM.sucesso.text} size={22} />}
              <div>
                <strong style={{ display: "block", color: temPendente ? TOM.info.text : TOM.sucesso.text, fontSize: FS.strong }}>
                  {temPendente ? `${data!.total} vínculo(s) pendente(s)` : "Nenhum vínculo pendente"}
                </strong>
                <span style={{ color: T.second, fontSize: FS.meta }}>
                  {temPendente ? "Revise as provas abaixo antes de aplicar." : "O cadastro de patrocinadores já bate com as peças ativas."}
                </span>
              </div>
            </div>
            {temPendente && (
              <Botao variante="primario" onClick={confirmarAplicacao} carregando={aplicarMutation.isPending}>
                {aplicarMutation.isPending ? "Aplicando…" : `Aplicar ${data!.total} vínculos`}
              </Botao>
            )}
          </section>

          <section style={{ display: "flex", gap: 8, alignItems: "center", padding: "11px 14px", background: T.bg, border: `1px solid ${T.border}`, borderRadius: R.md, color: T.apoio, fontSize: FS.meta, lineHeight: 1.45, marginBottom: 18 }}>
            <ShieldCheck aria-hidden="true" size={17} style={{ flexShrink: 0, color: TOM.info.text }} />
            A aplicação é somente aditiva: não remove vínculos existentes, não altera cotas e grava uma linha de auditoria por inclusão.
          </section>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {data?.vinculos.map((vinculo) => (
              <article key={`${vinculo.eventId}-${vinculo.sponsorId}`} style={{ display: "flex", gap: 14, alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", padding: "15px 17px", border: `1px solid ${T.border}`, borderRadius: R.lg, background: T.surface }}>
                {/* min() evita estouro lateral quando a coluna é mais estreita que 240px. */}
                <div style={{ minWidth: "min(240px, 100%)" }}>
                  <span style={rotulo}>Evento</span>
                  <strong style={{ display: "block", marginTop: 3, color: T.text, fontSize: FS.read }}>{vinculo.eventName}</strong>
                </div>
                <div style={{ minWidth: "min(220px, 100%)" }}>
                  <span style={rotulo}>Patrocinador</span>
                  <strong style={{ display: "block", marginTop: 3, color: TOM.info.text, fontSize: FS.read }}>{vinculo.sponsorName}</strong>
                </div>
                <div style={{ flex: "1 1 260px", color: T.second, fontSize: FS.meta }}>
                  Presente em {vinculo.provas.length} peça(s):{" "}
                  <span style={{ color: T.text, overflowWrap: "anywhere" }}>{vinculo.provas.slice(0, 8).join(", ")}{vinculo.provas.length > 8 ? "…" : ""}</span>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
      {dialogo}
    </main>
  );
}
